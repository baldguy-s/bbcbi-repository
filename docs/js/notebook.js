import { api } from './api.js';
import { escapeHtml, renderMarkdown, formatTime, formatDate, flashSaved, linkifyFieldValue } from './util.js';
import { navigate, setLastUpdated, currentRenderToken } from './app.js';
import { renderSessionsTab } from './session.js';
import { attachUploadWidget, renderFileChips, attachFileDeleteHandler } from './upload.js';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// A custom instructor field's value is rendered as a real tel:/mailto:/https:
// link whenever it looks like one (phone number, email, or website/social
// handle) — e.g. a "Cell" field showing a phone number should let you tap to
// call it, not just read digits.
function contactValueHtml(value) {
  const link = linkifyFieldValue(value);
  if (!link) return escapeHtml(value || '');
  return `<a href="${escapeHtml(link.href)}"${link.external ? ' target="_blank" rel="noopener"' : ''}>${escapeHtml(link.text)}</a>`;
}

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
  // Syllabus is the default tab — it's the richer combined view now (course
  // content + class schedule + assignments due), Sessions is for note-taking
  // once dates exist.
  if (parts[0] === 'year' && parts[2] === 'semester' && parts[4] === 'class') {
    const tab = parts[6] === 'tab' ? parts[7] : 'syllabus';
    const focusSessionId = parts[8] === 'session' ? parts[9] : null;
    return renderClassLevel(container, parts[5], tab, focusSessionId);
  }
  if (parts[0] === 'class') {
    const tab = parts[2] === 'tab' ? parts[3] : 'syllabus';
    const focusSessionId = parts[4] === 'session' ? parts[5] : null;
    return renderClassLevel(container, parts[1], tab, focusSessionId);
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
    subOf: (c) => c.instructor_name,
    emptyHint: 'No classes yet — add one in the Admin tab.',
    onSelect: (item) => navigate(`#/notebook/year/${yearId}/semester/${semesterId}/class/${item.id}`),
  });
}

async function renderClassLevel(container, classId, tab, focusSessionId) {
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

  const contactLines = [];
  if (cls.instructor_name) contactLines.push(escapeHtml(cls.instructor_name));
  if (cls.instructor_email) contactLines.push(`<a href="mailto:${escapeHtml(cls.instructor_email)}">${escapeHtml(cls.instructor_email)}</a>`);
  for (const f of cls.instructor_custom_fields || []) {
    if (!f.label) continue;
    contactLines.push(`${escapeHtml(f.label)}: ${contactValueHtml(f.value)}`);
  }

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
    ${scheduleLine || gradeSummary.gradedCount > 0 || contactLines.length ? `
      <div class="class-info-card">
        ${scheduleLine ? `<div>Meets: ${scheduleLine}</div>` : ''}
        ${gradeSummary.gradedCount > 0 ? `<div>Grade average: <strong>${gradeSummary.percent}%</strong> <span class="row-sub">(${gradeSummary.gradedCount}/${gradeSummary.assignmentCount} assignments graded)</span></div>` : ''}
        ${contactLines.length ? `
          <div class="collapsible-contact">
            <div class="collapsible-contact-header" id="contact-toggle">
              <span class="session-chevron">&#9660;</span> Instructor Info
            </div>
            <div class="collapsible-contact-body" id="contact-body">${contactLines.join('<br>')}</div>
          </div>
        ` : ''}
      </div>
    ` : ''}
    <div class="tabs">
      <button class="tab-btn ${tab === 'syllabus' ? 'active' : ''}" data-tab="syllabus">Syllabus</button>
      <button class="tab-btn ${tab === 'sessions' ? 'active' : ''}" data-tab="sessions">Sessions</button>
      <button class="print-btn" id="print-class-btn" style="margin-left:auto;align-self:center;">Print / Export</button>
    </div>
    <div id="class-tab-content"></div>
  `;

  container.querySelector('#print-class-btn').addEventListener('click', () => {
    printClassNotes(cls, contactLines, scheduleLine);
  });

  const contactToggle = container.querySelector('#contact-toggle');
  if (contactToggle) {
    contactToggle.addEventListener('click', () => {
      contactToggle.closest('.collapsible-contact').classList.toggle('expanded');
    });
  }

  container.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      navigate(`${baseHash}/tab/${btn.getAttribute('data-tab')}`);
    });
  });

  const tabContent = container.querySelector('#class-tab-content');

  if (tab === 'sessions') {
    await renderSessionsTab(tabContent, classId, focusSessionId);
  } else {
    await renderSyllabusTab(tabContent, classId);
  }
}

// Assembles the syllabus + every dated session's notes/assignments into one
// printable page, opened in a new tab/window so the sticky bar, nav, and
// quick-capture button (all irrelevant on paper) never end up in the print
// output. Uses the app's own tokens so it still looks like this app, not a
// generic browser printout.
async function printClassNotes(cls, contactLines, scheduleLine) {
  const [doc, sessions] = await Promise.all([
    api.get(`/api/classes/${cls.id}/docs/syllabus`),
    api.get(`/api/classes/${cls.id}/sessions`),
  ]);
  const sessionDetails = await Promise.all(sessions.map((s) => api.get(`/api/sessions/${s.id}`)));

  const win = window.open('', '_blank');
  if (!win) {
    alert('Your browser blocked the print window — allow pop-ups for this site and try again.');
    return;
  }

  const entryHtml = (e) => `
    <div class="p-entry">
      <div class="p-entry-head">
        <strong>${escapeHtml(e.title || '(untitled)')}</strong>
        <span class="p-tag">${escapeHtml(e.type)}</span>
        ${e.type === 'assignment' && e.due_date ? `<span class="p-tag">Due ${escapeHtml(formatDate(e.due_date))}</span>` : ''}
        ${e.type === 'assignment' && e.grade != null && e.points_possible ? `<span class="p-tag">${e.grade}/${e.points_possible}</span>` : ''}
      </div>
      <div class="p-body">${renderMarkdown(e.body_markdown || '')}</div>
    </div>`;

  const sessionHtml = (detail) => `
    <div class="p-session">
      <h3>${escapeHtml(formatDate(detail.session_date)) || '(no date)'}${detail.topic ? ` — ${escapeHtml(detail.topic)}` : ''}</h3>
      ${detail.entries.length ? detail.entries.map(entryHtml).join('') : '<p class="p-empty">No notes for this date.</p>'}
    </div>`;

  win.document.write(`<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>${escapeHtml(cls.name)} — Notes</title>
<style>
  body { font-family: Georgia, serif; color: #1A1A1A; max-width: 760px; margin: 30px auto; padding: 0 20px; }
  h1 { font-size: 1.6rem; margin-bottom: 2px; }
  h2 { font-size: 1.1rem; color: #6B6B6B; font-weight: normal; margin-top: 0; }
  h3 { font-size: 1.05rem; border-bottom: 1px solid #ccc; padding-bottom: 4px; margin-top: 28px; }
  .p-meta { font-size: .9rem; color: #444; margin-bottom: 18px; }
  .p-doc { margin-bottom: 24px; }
  .p-entry { margin: 12px 0 12px 8px; padding-left: 10px; border-left: 3px solid #ddd; }
  .p-entry-head { font-size: .95rem; margin-bottom: 4px; }
  .p-tag { font-size: .72rem; text-transform: uppercase; color: #666; border: 1px solid #ccc; border-radius: 8px; padding: 1px 7px; margin-left: 6px; }
  .p-body { font-size: .92rem; }
  .p-empty { color: #888; font-size: .88rem; font-style: italic; }
  @media print { a { color: inherit; text-decoration: none; } }
</style>
</head><body>
  <h1>${escapeHtml(cls.name)}</h1>
  ${contactLines.length || scheduleLine ? `<h2>${[scheduleLine, contactLines.length ? contactLines.join(' &middot; ').replace(/<[^>]+>/g, '') : ''].filter(Boolean).join(' — ')}</h2>` : ''}
  ${doc.body_markdown ? `<div class="p-doc">${renderMarkdown(doc.body_markdown)}</div>` : ''}
  ${sessionDetails.map(sessionHtml).join('')}
</body></html>`);
  win.document.close();
  win.focus();
  win.print();
}

// Combined Syllabus tab: course content (markdown), the class's calendar of
// meeting dates (which ARE the Sessions shown in the Sessions tab — this is
// where they're created/dated/reordered now), and a read-only summary of
// this class's assignments and due dates.
async function renderSyllabusTab(container, classId) {
  const myToken = currentRenderToken();
  const doc = await api.get(`/api/classes/${classId}/docs/syllabus`);
  const sessions = await api.get(`/api/classes/${classId}/sessions`);
  const assignments = await api.get(`/api/classes/${classId}/assignments`);
  if (myToken !== currentRenderToken()) return;
  setLastUpdated(doc.updated_at);

  container.innerHTML = `
    <div class="md-editor">
      <textarea id="doc-editor" placeholder="Course description, policies, notes...">${escapeHtml(doc.body_markdown || '')}</textarea>
    </div>
    <div class="control-row" style="margin:8px 0;">
      <button class="chip-btn" id="doc-save-btn">Save</button>
      <button class="chip-btn" id="doc-preview-toggle">Preview</button>
    </div>
    <div class="md-preview" id="doc-preview" style="display:none;"></div>
    <div id="doc-files"></div>

    <h3 class="section-heading">Class Schedule</h3>
    <p class="row-sub">Dates you add here show up as Sessions, ready for notes.</p>
    <div id="schedule-list"></div>
    <div class="control-row" style="margin:10px 0;">
      <input type="date" class="field-input" id="new-date-input" style="max-width:160px;">
      <input type="text" class="field-input" id="new-date-topic" placeholder="Topic" style="max-width:240px;">
      <button class="chip-btn" id="add-date-btn">+ Add Date</button>
    </div>

    <h3 class="section-heading">Assignments Due</h3>
    <div id="assignments-list"></div>
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
    const saveBtn = container.querySelector('#doc-save-btn');
    const saved = await api.put(`/api/classes/${classId}/docs/syllabus`, { body_markdown: textarea.value });
    setLastUpdated(saved.updated_at);
    flashSaved(saveBtn);
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

  // ===== Class Schedule (dates -> Sessions) =====
  const scheduleListEl = container.querySelector('#schedule-list');

  function renderScheduleList() {
    if (sessions.length === 0) {
      scheduleListEl.innerHTML = `<div class="empty-state">No dates yet — add the first one below.</div>`;
      return;
    }
    scheduleListEl.innerHTML = sessions
      .map(
        (s, idx) => `
        <div class="row-item" data-id="${s.id}">
          <span class="row-label">${escapeHtml(formatDate(s.session_date)) || '(no date)'} <span class="row-sub">${escapeHtml(s.topic || '')}</span></span>
          <button class="icon-btn" data-action="up" ${idx === 0 ? 'disabled' : ''}>&#9650;</button>
          <button class="icon-btn" data-action="down" ${idx === sessions.length - 1 ? 'disabled' : ''}>&#9660;</button>
          <button class="icon-btn" data-action="edit">Edit</button>
          <button class="icon-btn danger" data-action="delete">Delete</button>
        </div>`
      )
      .join('');
  }
  renderScheduleList();

  scheduleListEl.addEventListener('click', async (ev) => {
    const btn = ev.target.closest('[data-action]');
    if (!btn) return;
    const row = btn.closest('.row-item');
    const id = row.getAttribute('data-id');
    const action = btn.getAttribute('data-action');
    const session = sessions.find((s) => String(s.id) === id);

    if (action === 'up' || action === 'down') {
      await api.patch(`/api/sessions/${id}/reorder`, { direction: action });
      const fresh = await api.get(`/api/classes/${classId}/sessions`);
      sessions.length = 0;
      sessions.push(...fresh);
      renderScheduleList();
    } else if (action === 'edit') {
      const topic = prompt('Topic:', session.topic || '');
      if (topic === null) return;
      const date = prompt('Date (YYYY-MM-DD):', session.session_date || '');
      if (date === null) return;
      const updated = await api.patch(`/api/sessions/${id}`, { topic: topic.trim(), session_date: date.trim() || null });
      Object.assign(session, updated);
      renderScheduleList();
    } else if (action === 'delete') {
      if (confirm('Delete this date and everything in it (notes, assignments, files)?')) {
        await api.del(`/api/sessions/${id}`);
        sessions.splice(sessions.findIndex((s) => s.id === session.id), 1);
        renderScheduleList();
      }
    }
  });

  container.querySelector('#add-date-btn').addEventListener('click', async () => {
    const dateInput = container.querySelector('#new-date-input');
    const topicInput = container.querySelector('#new-date-topic');
    if (!dateInput.value) return;
    const created = await api.post(`/api/classes/${classId}/sessions`, {
      session_date: dateInput.value, topic: topicInput.value.trim(),
    });
    sessions.push(created);
    dateInput.value = '';
    topicInput.value = '';
    renderScheduleList();
  });

  // ===== Assignments Due (read-only summary) =====
  const assignmentsEl = container.querySelector('#assignments-list');
  if (assignments.length === 0) {
    assignmentsEl.innerHTML = `<div class="empty-state">No assignments yet.</div>`;
  } else {
    assignmentsEl.innerHTML = assignments
      .map(
        (a) => `
        <div class="row-item" style="cursor:pointer;">
          <span class="row-label">${escapeHtml(a.title || '(untitled)')} <span class="row-sub">${escapeHtml(a.session_topic || '')}</span></span>
          <span class="due-badge ${a.overdue ? 'overdue' : ''}">${a.due_date ? escapeHtml(formatDate(a.due_date)) : 'No due date'}</span>
        </div>`
      )
      .join('');
    assignmentsEl.querySelectorAll('.row-item').forEach((row, i) => {
      const sessionId = assignments[i].session_id;
      row.addEventListener('click', () =>
        navigate(sessionId ? `#/notebook/class/${classId}/tab/sessions/session/${sessionId}` : `#/notebook/class/${classId}/tab/sessions`)
      );
    });
  }
}
