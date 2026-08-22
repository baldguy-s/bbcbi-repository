import { api } from './api.js';
import { escapeHtml, renderMarkdown, formatTime } from './util.js';
import { navigate, setLastUpdated, currentRenderToken } from './app.js';
import { renderSessionsTab } from './session.js';
import { attachUploadWidget, renderFileChips, attachFileDeleteHandler } from './upload.js';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Read-only browsing list — Years/Semesters/Classes structure is managed in
// Admin now; Notebook just navigates. (Sessions/Entries stay fully editable
// here — see session.js.)
function renderBrowseList(container, { title, breadcrumb, items, labelOf, subOf, emptyHint, onSelect }) {
  container.innerHTML = `
    ${breadcrumb ? `<div class="breadcrumb-nav">${breadcrumb}</div>` : ''}
    <h2>${escapeHtml(title)}</h2>
    <div id="row-list"></div>
  `;
  const listEl = container.querySelector('#row-list');

  if (items.length === 0) {
    listEl.innerHTML = `<div class="empty-state">${escapeHtml(emptyHint)}</div>`;
    return;
  }

  listEl.innerHTML = items
    .map(
      (item) => `
      <div class="row-item" data-id="${item.id}" style="cursor:pointer;">
        <span class="row-label">${escapeHtml(labelOf(item))}${subOf(item) ? ` <span class="row-sub">${escapeHtml(subOf(item))}</span>` : ''}</span>
      </div>`
    )
    .join('');

  listEl.addEventListener('click', (ev) => {
    const row = ev.target.closest('.row-item');
    if (!row) return;
    const item = items.find((i) => String(i.id) === row.getAttribute('data-id'));
    onSelect(item);
  });
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
  renderBrowseList(container, {
    title: 'Notebook',
    breadcrumb: null,
    items: years,
    labelOf: (y) => y.label,
    subOf: () => null,
    emptyHint: 'Nothing here yet — add a year in the Admin tab.',
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
  // Archived semesters collapse out of Notebook browsing (still reachable/
  // reversible via Admin) — they're done, not deleted.
  const visible = semesters.filter((s) => !s.archived);
  renderBrowseList(container, {
    title: year ? year.label : 'Semesters',
    breadcrumb: `<a href="#/notebook">Notebook</a> &rsaquo; ${escapeHtml(year ? year.label : '')}`,
    items: visible,
    labelOf: (s) => s.label,
    subOf: () => null,
    emptyHint: 'No semesters yet — add one in the Admin tab.',
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

  renderBrowseList(container, {
    title: semester ? semester.label : 'Classes',
    breadcrumb: `<a href="#/notebook">Notebook</a> &rsaquo; <a href="#/notebook/year/${yearId}">${escapeHtml(year ? year.label : '')}</a> &rsaquo; ${escapeHtml(semester ? semester.label : '')}`,
    items: classes,
    labelOf: (c) => c.name,
    subOf: (c) => c.professor,
    emptyHint: 'No classes yet — add one in the Admin tab.',
    onSelect: (item) => navigate(`#/notebook/year/${yearId}/semester/${semesterId}/class/${item.id}`),
  });
}

async function renderClassLevel(container, classId, tab) {
  const myToken = currentRenderToken();
  const cls = await api.get(`/api/classes/${classId}`);
  const semester = await api.get(`/api/semesters/${cls.semester_id}`);
  const years = await api.get('/api/years');
  const schedule = await api.get(`/api/classes/${classId}/schedule`);
  const gradeSummary = await api.get(`/api/classes/${classId}/grade-summary`);
  if (myToken !== currentRenderToken()) return;
  const year = years.find((y) => String(y.id) === String(semester.year_id));
  const yearId = semester.year_id;
  const semesterId = cls.semester_id;

  const baseHash = `#/notebook/year/${yearId}/semester/${semesterId}/class/${classId}`;

  const professorLines = [];
  if (cls.professor) professorLines.push(escapeHtml(cls.professor));
  if (cls.professor_email) professorLines.push(`<a href="mailto:${escapeHtml(cls.professor_email)}">${escapeHtml(cls.professor_email)}</a>`);
  if (cls.office_hours) professorLines.push(`Office hours: ${escapeHtml(cls.office_hours)}`);

  const scheduleLine = schedule.length
    ? schedule.map((s) => `${DAY_LABELS[s.day_of_week]} ${formatTime(s.start_time)}–${formatTime(s.end_time)}`).join(', ')
    : null;

  container.innerHTML = `
    <div class="breadcrumb-nav">
      <a href="#/notebook">Notebook</a> &rsaquo;
      <a href="#/notebook/year/${yearId}">${escapeHtml(year ? year.label : '')}</a> &rsaquo;
      <a href="#/notebook/year/${yearId}/semester/${semesterId}">${escapeHtml(semester ? semester.label : '')}</a>
    </div>
    <h2>${escapeHtml(cls.name)}</h2>
    ${professorLines.length || scheduleLine || gradeSummary.gradedCount > 0 ? `
      <div class="class-info-card">
        ${professorLines.length ? `<div>${professorLines.join(' &middot; ')}</div>` : ''}
        ${scheduleLine ? `<div>Meets: ${scheduleLine}</div>` : ''}
        ${gradeSummary.gradedCount > 0 ? `<div>Grade average: <strong>${gradeSummary.percent}%</strong> <span class="row-sub">(${gradeSummary.gradedCount}/${gradeSummary.assignmentCount} assignments graded)</span></div>` : ''}
      </div>
    ` : ''}
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
