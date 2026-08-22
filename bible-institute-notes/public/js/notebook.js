import { api } from './api.js';
import { escapeHtml, renderMarkdown } from './util.js';
import { navigate, setLastUpdated, currentRenderToken } from './app.js';
import { renderSessionsTab } from './session.js';
import { attachUploadWidget, renderFileChips, attachFileDeleteHandler } from './upload.js';

// Shared list-of-rows UI (add / rename / reorder / delete / select), reused
// for Years, Semesters, and Classes — the three levels share identical
// interaction rules per the brief (§5.1: "Add/rename/delete/reorder at every
// level").
function renderRowList(container, { title, breadcrumb, items, labelOf, subOf, addPlaceholder, extraPlaceholder, onAdd, onRename, onDelete, onReorder, onReload, onSelect }) {
  container.innerHTML = `
    ${breadcrumb ? `<div class="breadcrumb-nav">${breadcrumb}</div>` : ''}
    <h2>${escapeHtml(title)}</h2>
    <div id="row-list"></div>
    <div class="control-row" style="margin-top:10px;">
      <input type="text" class="field-input" id="add-input" placeholder="${escapeHtml(addPlaceholder)}" style="max-width:280px;">
      ${extraPlaceholder ? `<input type="text" class="field-input" id="add-extra-input" placeholder="${escapeHtml(extraPlaceholder)}" style="max-width:220px;">` : ''}
      <button class="chip-btn" id="add-btn">+ Add</button>
    </div>
  `;

  const listEl = container.querySelector('#row-list');

  function renderList() {
    if (items.length === 0) {
      listEl.innerHTML = `<div class="empty-state">Nothing here yet.</div>`;
      return;
    }
    listEl.innerHTML = items
      .map(
        (item, idx) => `
        <div class="row-item" data-id="${item.id}">
          <span class="row-label" data-action="select">${escapeHtml(labelOf(item))}${subOf(item) ? ` <span class="row-sub">${escapeHtml(subOf(item))}</span>` : ''}</span>
          <button class="icon-btn" data-action="up" ${idx === 0 ? 'disabled' : ''}>&#9650;</button>
          <button class="icon-btn" data-action="down" ${idx === items.length - 1 ? 'disabled' : ''}>&#9660;</button>
          <button class="icon-btn" data-action="rename">Rename</button>
          <button class="icon-btn danger" data-action="delete">Delete</button>
        </div>`
      )
      .join('');
  }
  renderList();

  listEl.addEventListener('click', async (ev) => {
    const btn = ev.target.closest('[data-action]');
    if (!btn) return;
    const row = btn.closest('.row-item');
    const id = row.getAttribute('data-id');
    const action = btn.getAttribute('data-action');
    const item = items.find((i) => String(i.id) === id);

    if (action === 'select') {
      onSelect(item);
    } else if (action === 'rename') {
      const current = labelOf(item);
      const next = prompt('Rename to:', current);
      if (next === null || !next.trim()) return;
      let extra;
      if (extraPlaceholder) {
        extra = prompt(extraPlaceholder + ':', subOf(item) || '');
        if (extra === null) return;
      }
      const updated = await onRename(item, next.trim(), extra);
      Object.assign(item, updated);
      renderList();
    } else if (action === 'delete') {
      if (confirm(`Delete "${labelOf(item)}"? This also deletes everything nested inside it.`)) {
        await onDelete(item);
        const i = items.findIndex((x) => x.id === item.id);
        items.splice(i, 1);
        renderList();
      }
    } else if (action === 'up' || action === 'down') {
      await onReorder(item, action);
      const fresh = await onReload();
      items.length = 0;
      items.push(...fresh);
      renderList();
    }
  });

  container.querySelector('#add-btn').addEventListener('click', addNew);
  container.querySelector('#add-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addNew();
  });

  async function addNew() {
    const input = container.querySelector('#add-input');
    const extraInput = container.querySelector('#add-extra-input');
    const value = input.value.trim();
    if (!value) return;
    const created = await onAdd(value, extraInput ? extraInput.value.trim() : undefined);
    items.push(created);
    input.value = '';
    if (extraInput) extraInput.value = '';
    renderList();
  }
}

export async function renderNotebookView(container, segments) {
  // segments: [] | ['notebook'] | ['notebook','year',id] | ['notebook','year',yid,'semester',sid]
  //           | ['notebook','year',yid,'semester',sid,'class',cid] | ...,'tab',tabName]
  //           | ['notebook','class',cid] | ['notebook','class',cid,'tab',tabName]  (deep-link form,
  //             used by Search/Upcoming/Scripture Index, which only know a classId)
  const parts = segments[0] === 'notebook' ? segments.slice(1) : segments;

  if (parts.length === 0) {
    return renderYearsLevel(container);
  }
  if (parts[0] === 'year' && parts.length === 2) {
    return renderSemestersLevel(container, parts[1]);
  }
  if (parts[0] === 'year' && parts[2] === 'semester' && parts.length === 4) {
    return renderClassesLevel(container, parts[1], parts[3]);
  }
  if (parts[0] === 'year' && parts[2] === 'semester' && parts[4] === 'class') {
    const tab = parts[6] === 'tab' ? parts[7] : 'sessions';
    return renderClassLevel(container, parts[5], tab);
  }
  if (parts[0] === 'class') {
    const tab = parts[2] === 'tab' ? parts[3] : 'sessions';
    return renderClassLevel(container, parts[1], tab);
  }
  return renderYearsLevel(container);
}

async function renderYearsLevel(container) {
  const myToken = currentRenderToken();
  const years = await api.get('/api/years');
  if (myToken !== currentRenderToken()) return;
  renderRowList(container, {
    title: 'Notebook',
    breadcrumb: null,
    items: years,
    labelOf: (y) => y.label,
    subOf: () => null,
    addPlaceholder: 'New year, e.g. 2025-2026',
    onAdd: async (label) => api.post('/api/years', { label }),
    onReload: async () => api.get('/api/years'),
    onRename: async (item, label) => api.patch(`/api/years/${item.id}`, { label }),
    onDelete: async (item) => api.del(`/api/years/${item.id}`),
    onReorder: async (item, direction) => api.patch(`/api/years/${item.id}/reorder`, { direction }),
    onSelect: (item) => navigate(`#/notebook/year/${item.id}`),
  });
}

async function renderSemestersLevel(container, yearId) {
  const myToken = currentRenderToken();
  const [year, semesters] = await Promise.all([
    api.get(`/api/years`).then((ys) => ys.find((y) => String(y.id) === String(yearId))),
    api.get(`/api/years/${yearId}/semesters`),
  ]);
  if (myToken !== currentRenderToken()) return;
  renderRowList(container, {
    title: year ? year.label : 'Semesters',
    breadcrumb: `<a href="#/notebook">Notebook</a> &rsaquo; ${escapeHtml(year ? year.label : '')}`,
    items: semesters,
    labelOf: (s) => s.label,
    subOf: () => null,
    addPlaceholder: 'New semester, e.g. Fall',
    onAdd: async (label) => api.post(`/api/years/${yearId}/semesters`, { label }),
    onReload: async () => api.get(`/api/years/${yearId}/semesters`),
    onRename: async (item, label) => api.patch(`/api/semesters/${item.id}`, { label }),
    onDelete: async (item) => api.del(`/api/semesters/${item.id}`),
    onReorder: async (item, direction) => api.patch(`/api/semesters/${item.id}/reorder`, { direction }),
    onSelect: (item) => navigate(`#/notebook/year/${yearId}/semester/${item.id}`),
  });
}

async function renderClassesLevel(container, yearId, semesterId) {
  const myToken = currentRenderToken();
  const [years, classes] = await Promise.all([
    api.get('/api/years'),
    api.get(`/api/semesters/${semesterId}/classes`),
  ]);
  const semesters = await api.get(`/api/years/${yearId}/semesters`);
  if (myToken !== currentRenderToken()) return;
  const year = years.find((y) => String(y.id) === String(yearId));
  const semester = semesters.find((s) => String(s.id) === String(semesterId));

  renderRowList(container, {
    title: semester ? semester.label : 'Classes',
    breadcrumb: `<a href="#/notebook">Notebook</a> &rsaquo; <a href="#/notebook/year/${yearId}">${escapeHtml(year ? year.label : '')}</a> &rsaquo; ${escapeHtml(semester ? semester.label : '')}`,
    items: classes,
    labelOf: (c) => c.name,
    subOf: (c) => c.professor,
    addPlaceholder: 'New class name',
    extraPlaceholder: 'Professor (optional)',
    onAdd: async (name, professor) => api.post(`/api/semesters/${semesterId}/classes`, { name, professor }),
    onReload: async () => api.get(`/api/semesters/${semesterId}/classes`),
    onRename: async (item, name, professor) => api.patch(`/api/classes/${item.id}`, { name, professor }),
    onDelete: async (item) => api.del(`/api/classes/${item.id}`),
    onReorder: async (item, direction) => api.patch(`/api/classes/${item.id}/reorder`, { direction }),
    onSelect: (item) => navigate(`#/notebook/year/${yearId}/semester/${semesterId}/class/${item.id}`),
  });
}

async function renderClassLevel(container, classId, tab) {
  const myToken = currentRenderToken();
  const cls = await api.get(`/api/classes/${classId}`);
  const semester = await api.get(`/api/semesters/${cls.semester_id}`);
  const years = await api.get('/api/years');
  if (myToken !== currentRenderToken()) return;
  const year = years.find((y) => String(y.id) === String(semester.year_id));
  const yearId = semester.year_id;
  const semesterId = cls.semester_id;

  const baseHash = `#/notebook/year/${yearId}/semester/${semesterId}/class/${classId}`;

  container.innerHTML = `
    <div class="breadcrumb-nav">
      <a href="#/notebook">Notebook</a> &rsaquo;
      <a href="#/notebook/year/${yearId}">${escapeHtml(year ? year.label : '')}</a> &rsaquo;
      <a href="#/notebook/year/${yearId}/semester/${semesterId}">${escapeHtml(semester ? semester.label : '')}</a>
    </div>
    <h2>${escapeHtml(cls.name)}</h2>
    ${cls.professor ? `<div class="row-sub" style="margin-bottom:10px;">${escapeHtml(cls.professor)}</div>` : ''}
    <div class="tabs">
      <button class="tab-btn ${tab === 'syllabus' ? 'active' : ''}" data-tab="syllabus">Syllabus</button>
      <button class="tab-btn ${tab === 'schedule' ? 'active' : ''}" data-tab="schedule">Schedule</button>
      <button class="tab-btn ${tab === 'sessions' ? 'active' : ''}" data-tab="sessions">Sessions</button>
    </div>
    <div id="class-tab-content"></div>
  `;

  container.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      navigate(`${baseHash}/tab/${btn.getAttribute('data-tab')}`);
    });
  });

  const tabContent = container.querySelector('#class-tab-content');

  if (tab === 'syllabus' || tab === 'schedule') {
    await renderClassDoc(tabContent, classId, tab);
  } else {
    await renderSessionsTab(tabContent, classId);
  }
}

async function renderClassDoc(container, classId, docType) {
  const myToken = currentRenderToken();
  const doc = await api.get(`/api/classes/${classId}/docs/${docType}`);
  if (myToken !== currentRenderToken()) return;
  setLastUpdated(doc.updated_at);

  container.innerHTML = `
    <div class="md-editor">
      <textarea id="doc-editor" placeholder="Type ${escapeHtml(docType)} notes in markdown...">${escapeHtml(doc.body_markdown || '')}</textarea>
    </div>
    <div class="control-row" style="margin:8px 0;">
      <button class="chip-btn" id="doc-save-btn">Save</button>
      <button class="chip-btn" id="doc-preview-toggle">Preview</button>
    </div>
    <div class="md-preview" id="doc-preview" style="display:none;"></div>
    <div id="doc-files"></div>
  `;

  const textarea = container.querySelector('#doc-editor');
  const preview = container.querySelector('#doc-preview');
  let previewOn = false;

  container.querySelector('#doc-preview-toggle').addEventListener('click', () => {
    previewOn = !previewOn;
    preview.style.display = previewOn ? 'block' : 'none';
    textarea.style.display = previewOn ? 'none' : 'block';
    if (previewOn) preview.innerHTML = renderMarkdown(textarea.value);
  });

  container.querySelector('#doc-save-btn').addEventListener('click', async () => {
    const saved = await api.put(`/api/classes/${classId}/docs/${docType}`, { body_markdown: textarea.value });
    setLastUpdated(saved.updated_at);
  });

  const filesEl = container.querySelector('#doc-files');
  const files = await api.get(`/api/class-docs/${doc.id}/files`);
  filesEl.innerHTML = renderFileChips(files);
  attachUploadWidget(filesEl, { class_doc_id: doc.id }, {
    onUploaded: (newFiles) => {
      filesEl.querySelector('.file-chip-list')?.remove();
      filesEl.insertAdjacentHTML('afterbegin', renderFileChips([...files, ...newFiles]));
    },
  });
  attachFileDeleteHandler(filesEl, (fileId) => {
    container.querySelector(`.file-chip[data-file-id="${fileId}"]`)?.remove();
  });
}
