import { api } from './api.js';
import { escapeHtml, renderMarkdown, formatDate, todayIso } from './util.js';
import { attachUploadWidget, renderFileChips, attachFileDeleteHandler } from './upload.js';
import { currentRenderToken } from './app.js';

const ENTRY_TYPES = ['note', 'assignment', 'question', 'other'];
const ENTRY_TYPE_LABELS = { note: 'Note', assignment: 'Assignment', question: 'Question', other: 'Other' };

// Expand/filter state is intentionally in-memory only (not persisted to
// localStorage), matching the sibling schedule app's collapsible-card
// pattern — it resets on reload, which is fine since it's just a scroll/view
// convenience, not user data.
const expandedIds = new Set();
let activeFilters = new Set(ENTRY_TYPES);

export async function renderSessionsTab(container, classId) {
  const myToken = currentRenderToken();
  const sessions = await api.get(`/api/classes/${classId}/sessions`);
  if (myToken !== currentRenderToken()) return;

  container.innerHTML = `
    <div class="control-row" id="entry-filter-chips" style="margin-bottom:10px;">
      <span class="control-label">Filter</span>
    </div>
    <div class="control-row" style="margin-bottom:14px;">
      <input type="date" class="field-input" id="new-session-date" style="max-width:160px;">
      <input type="text" class="field-input" id="new-session-topic" placeholder="Session topic" style="max-width:260px;">
      <button class="chip-btn" id="add-session-btn">+ Add Session</button>
    </div>
    <div id="sessions-list"></div>
  `;

  renderFilterChips(container.querySelector('#entry-filter-chips'));

  const listEl = container.querySelector('#sessions-list');

  async function reload() {
    const fresh = await api.get(`/api/classes/${classId}/sessions`);
    sessions.length = 0;
    sessions.push(...fresh);
    renderSessionCards(listEl, sessions);
  }

  attachSessionListHandlers(listEl, sessions, reload);
  renderSessionCards(listEl, sessions);

  container.querySelector('#add-session-btn').addEventListener('click', async () => {
    const dateInput = container.querySelector('#new-session-date');
    const topicInput = container.querySelector('#new-session-topic');
    const created = await api.post(`/api/classes/${classId}/sessions`, {
      session_date: dateInput.value || null,
      topic: topicInput.value.trim(),
    });
    dateInput.value = '';
    topicInput.value = '';
    sessions.push(created);
    expandedIds.add(String(created.id));
    renderSessionCards(listEl, sessions);
  });
}

function renderFilterChips(container) {
  container.querySelectorAll('.chip-btn').forEach((el) => el.remove());
  ENTRY_TYPES.forEach((type) => {
    const chip = document.createElement('button');
    chip.className = `chip-btn type-${type}${activeFilters.has(type) ? ' active' : ''}`;
    chip.textContent = ENTRY_TYPE_LABELS[type];
    chip.addEventListener('click', () => {
      if (activeFilters.has(type)) activeFilters.delete(type);
      else activeFilters.add(type);
      chip.classList.toggle('active');
      document.querySelectorAll('.entry-card').forEach((card) => {
        card.style.display = activeFilters.has(card.getAttribute('data-type')) ? '' : 'none';
      });
    });
    container.appendChild(chip);
  });
}

function renderSessionCards(container, sessions) {
  if (sessions.length === 0) {
    container.innerHTML = `<div class="empty-state">No sessions yet — add the first one above.</div>`;
    return;
  }

  container.innerHTML = sessions
    .map(
      (s, idx) => `
      <div class="session-card ${expandedIds.has(String(s.id)) ? 'expanded' : ''}" data-id="${s.id}">
        <div class="session-card-header">
          <span class="session-chevron">&#9660;</span>
          <span class="session-title">${escapeHtml(s.topic || '(untitled session)')}</span>
          <span class="session-date">${escapeHtml(formatDate(s.session_date))}</span>
          <button class="icon-btn" data-action="up" ${idx === 0 ? 'disabled' : ''}>&#9650;</button>
          <button class="icon-btn" data-action="down" ${idx === sessions.length - 1 ? 'disabled' : ''}>&#9660;</button>
          <button class="icon-btn" data-action="edit">Edit</button>
          <button class="icon-btn danger" data-action="delete">Delete</button>
        </div>
        <div class="session-card-body" data-body-for="${s.id}"></div>
      </div>`
    )
    .join('');

  container.querySelectorAll('.session-card').forEach((card) => {
    const id = card.getAttribute('data-id');
    if (expandedIds.has(id)) {
      loadSessionBody(card.querySelector('.session-card-body'), id);
    }
  });
}

// Attached exactly once per Sessions-tab render (not on every re-render of
// the card list), via event delegation on the list container — otherwise a
// fresh listener would stack up on every reload() and each click would fire
// its handler once per accumulated listener.
function attachSessionListHandlers(container, sessions, reload) {
  container.addEventListener('click', async (ev) => {
    const header = ev.target.closest('.session-card-header');
    // Scoped to the header specifically: session-level action buttons
    // (up/down/edit/delete) only ever live in .session-card-header. Without
    // this scoping, a click on a nested entry's own edit/delete button (data-
    // action="edit"/"delete" too) bubbles up to this container listener and
    // ev.target.closest('[data-action]') matches the SAME button, so the
    // session-level handler would ALSO fire for it — e.g. clicking "Edit" on
    // one note would additionally pop a prompt() to rename the whole session,
    // and clicking "Delete" on one note would additionally ask to delete the
    // entire session.
    const actionBtn = ev.target.closest('.session-card-header [data-action]');
    const card = ev.target.closest('.session-card');
    if (!card) return;
    const id = card.getAttribute('data-id');
    const session = sessions.find((s) => String(s.id) === id);

    if (actionBtn) {
      const action = actionBtn.getAttribute('data-action');
      if (action === 'up' || action === 'down') {
        await api.patch(`/api/sessions/${id}/reorder`, { direction: action });
        await reload();
      } else if (action === 'edit') {
        const topic = prompt('Session topic:', session.topic || '');
        if (topic === null) return;
        const date = prompt('Session date (YYYY-MM-DD, optional):', session.session_date || '');
        if (date === null) return;
        await api.patch(`/api/sessions/${id}`, { topic: topic.trim(), session_date: date.trim() || null });
        await reload();
      } else if (action === 'delete') {
        if (confirm('Delete this session and everything in it?')) {
          await api.del(`/api/sessions/${id}`);
          await reload();
        }
      }
      return;
    }

    if (header) {
      const wasExpanded = expandedIds.has(id);
      if (wasExpanded) {
        expandedIds.delete(id);
        card.classList.remove('expanded');
      } else {
        expandedIds.add(id);
        card.classList.add('expanded');
        loadSessionBody(card.querySelector('.session-card-body'), id);
      }
    }
  });
}

async function loadSessionBody(bodyEl, sessionId) {
  const detail = await api.get(`/api/sessions/${sessionId}`);
  bodyEl.innerHTML = `
    <div id="entries-${sessionId}"></div>
    <div class="control-row" style="margin:10px 0;">
      <select class="field-input" id="new-entry-type-${sessionId}" style="max-width:140px;">
        ${ENTRY_TYPES.map((t) => `<option value="${t}">${ENTRY_TYPE_LABELS[t]}</option>`).join('')}
      </select>
      <input type="text" class="field-input" id="new-entry-title-${sessionId}" placeholder="Title" style="max-width:220px;">
      <button class="chip-btn" id="add-entry-btn-${sessionId}">+ Add Entry</button>
    </div>
    <div class="field-label">Files attached to this session</div>
    <div id="session-files-${sessionId}"></div>
  `;

  renderEntries(bodyEl.querySelector(`#entries-${sessionId}`), detail.entries, sessionId, () =>
    loadSessionBody(bodyEl, sessionId)
  );

  bodyEl.querySelector(`#add-entry-btn-${sessionId}`).addEventListener('click', async () => {
    const type = bodyEl.querySelector(`#new-entry-type-${sessionId}`).value;
    const title = bodyEl.querySelector(`#new-entry-title-${sessionId}`).value.trim();
    await api.post(`/api/sessions/${sessionId}/entries`, { type, title, body_markdown: '' });
    loadSessionBody(bodyEl, sessionId);
  });

  const filesEl = bodyEl.querySelector(`#session-files-${sessionId}`);
  filesEl.innerHTML = renderFileChips(detail.files);
  attachUploadWidget(filesEl, { session_id: sessionId }, {
    onUploaded: (newFiles) => {
      filesEl.querySelector('.file-chip-list')?.remove();
      filesEl.insertAdjacentHTML('afterbegin', renderFileChips([...detail.files, ...newFiles]));
    },
  });
  attachFileDeleteHandler(filesEl, (fileId) => {
    filesEl.querySelector(`.file-chip[data-file-id="${fileId}"]`)?.remove();
  });

  // reflect current filter-chip selection on the freshly rendered entries
  bodyEl.querySelectorAll('.entry-card').forEach((card) => {
    card.style.display = activeFilters.has(card.getAttribute('data-type')) ? '' : 'none';
  });
}

function renderEntries(container, entries, sessionId, onChanged) {
  if (entries.length === 0) {
    container.innerHTML = `<div class="empty-state">No entries yet.</div>`;
    return;
  }
  container.innerHTML = entries.map((e) => entryCardHtml(e)).join('');

  entries.forEach((entry) => {
    const card = container.querySelector(`.entry-card[data-id="${entry.id}"]`);
    wireEntryCard(card, entry, sessionId, onChanged);
  });
}

function entryCardHtml(entry) {
  const isOverdue = entry.type === 'assignment' && entry.due_date && entry.due_date < todayIso();
  const hasGrade = entry.type === 'assignment' && entry.grade != null && entry.points_possible;
  return `
    <div class="entry-card" data-id="${entry.id}" data-type="${entry.type}">
      <div class="entry-head">
        <span class="type-badge ${entry.type}">${ENTRY_TYPE_LABELS[entry.type]}</span>
        <span class="entry-title">${escapeHtml(entry.title || '(untitled)')}</span>
        ${entry.type === 'assignment' ? `<span class="due-badge ${isOverdue ? 'overdue' : ''}">${entry.due_date ? `Due ${escapeHtml(formatDate(entry.due_date))}` : 'No due date'}</span>` : ''}
        ${hasGrade ? `<span class="due-badge">${entry.grade}/${entry.points_possible}</span>` : ''}
        <button class="icon-btn" data-action="edit">Edit</button>
        <button class="icon-btn danger" data-action="delete">Delete</button>
      </div>
      <div class="entry-view" data-view></div>
      <div class="entry-edit" data-edit style="display:none;"></div>
      <div class="entry-files" data-files></div>
    </div>`;
}

function wireEntryCard(card, entry, sessionId, onChanged) {
  const viewEl = card.querySelector('[data-view]');
  const editEl = card.querySelector('[data-edit]');
  const filesEl = card.querySelector('[data-files]');

  function renderView() {
    viewEl.innerHTML = `<div class="md-preview">${renderMarkdown(entry.body_markdown)}</div>`;
    viewEl.style.display = 'block';
    editEl.style.display = 'none';
  }
  renderView();

  api.get(`/api/entries/${entry.id}/files`).then((files) => {
    filesEl.innerHTML = renderFileChips(files);
    attachUploadWidget(filesEl, { entry_id: entry.id }, {
      onUploaded: (newFiles) => {
        filesEl.querySelector('.file-chip-list')?.remove();
        filesEl.insertAdjacentHTML('afterbegin', renderFileChips([...files, ...newFiles]));
      },
    });
    attachFileDeleteHandler(filesEl, (fileId) => {
      filesEl.querySelector(`.file-chip[data-file-id="${fileId}"]`)?.remove();
    });
  });

  card.addEventListener('click', async (ev) => {
    const btn = ev.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.getAttribute('data-action');

    if (action === 'delete') {
      if (confirm('Delete this entry?')) {
        await api.del(`/api/entries/${entry.id}`);
        onChanged();
      }
    } else if (action === 'edit') {
      openEditor();
    }
  });

  function openEditor() {
    viewEl.style.display = 'none';
    editEl.style.display = 'block';
    editEl.innerHTML = `
      <div class="md-editor">
        <textarea id="edit-body-${entry.id}">${escapeHtml(entry.body_markdown || '')}</textarea>
      </div>
      ${entry.type === 'assignment' ? `
        <div class="control-row" style="margin-top:8px;">
          <div>
            <label class="field-label">Due date</label>
            <input type="date" class="field-input" id="edit-due-${entry.id}" value="${escapeHtml(entry.due_date || '')}" style="max-width:180px;">
          </div>
          <div>
            <label class="field-label">Grade</label>
            <input type="number" class="field-input" id="edit-grade-${entry.id}" value="${entry.grade ?? ''}" step="any" style="max-width:100px;">
          </div>
          <div>
            <label class="field-label">Out of</label>
            <input type="number" class="field-input" id="edit-points-${entry.id}" value="${entry.points_possible ?? ''}" step="any" style="max-width:100px;">
          </div>
        </div>
      ` : ''}
      <div class="control-row" style="margin:8px 0;">
        <button class="chip-btn" id="save-entry-${entry.id}">Save</button>
        <button class="chip-btn" id="cancel-entry-${entry.id}">Cancel</button>
      </div>
    `;

    editEl.querySelector(`#save-entry-${entry.id}`).addEventListener('click', async () => {
      const body_markdown = editEl.querySelector(`#edit-body-${entry.id}`).value;
      const dueInput = editEl.querySelector(`#edit-due-${entry.id}`);
      const gradeInput = editEl.querySelector(`#edit-grade-${entry.id}`);
      const pointsInput = editEl.querySelector(`#edit-points-${entry.id}`);
      const updated = await api.put(`/api/entries/${entry.id}`, {
        title: entry.title,
        body_markdown,
        due_date: dueInput ? dueInput.value || null : entry.due_date,
        grade: gradeInput ? gradeInput.value : entry.grade,
        points_possible: pointsInput ? pointsInput.value : entry.points_possible,
      });
      Object.assign(entry, updated);
      renderView();
    });
    editEl.querySelector(`#cancel-entry-${entry.id}`).addEventListener('click', renderView);
  }
}
