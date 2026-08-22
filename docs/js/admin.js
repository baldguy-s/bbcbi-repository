import { api } from './api.js';
import { escapeHtml, formatDate } from './util.js';
import { navigate, currentRenderToken } from './app.js';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function adminSubNav(active) {
  return `
    <div class="tabs">
      <button class="tab-btn ${active === 'structure' ? 'active' : ''}" data-admin-nav="structure">Structure</button>
      <button class="tab-btn ${active === 'duedates' ? 'active' : ''}" data-admin-nav="duedates">Due Dates</button>
    </div>
  `;
}

function wireSubNav(container) {
  container.querySelectorAll('[data-admin-nav]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-admin-nav');
      navigate(target === 'duedates' ? '#/admin/duedates' : '#/admin');
    });
  });
}

export async function renderAdminView(container, segments) {
  const parts = segments[0] === 'admin' ? segments.slice(1) : segments;

  if (parts[0] === 'duedates') return renderDueDates(container);
  if (parts[0] === 'year' && parts.length === 2) return renderSemestersAdmin(container, parts[1]);
  if (parts[0] === 'year' && parts[2] === 'semester' && parts.length === 4) return renderClassesAdmin(container, parts[1], parts[3]);
  return renderYearsAdmin(container);
}

// ===== Simple single-field CRUD list, for Years =====
function renderRowList(container, { title, breadcrumb, items, labelOf, extraRowHtml, extraButtonHtml, customActions, addPlaceholder, onAdd, onRename, onDelete, onReorder, onReload, onSelect }) {
  container.innerHTML = `
    ${breadcrumb ? `<div class="breadcrumb-nav">${breadcrumb}</div>` : ''}
    <h2>${escapeHtml(title)}</h2>
    <div id="row-list"></div>
    <div class="control-row" style="margin-top:10px;">
      <input type="text" class="field-input" id="add-input" placeholder="${escapeHtml(addPlaceholder)}" style="max-width:280px;">
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
          <span class="row-label" data-action="select">${escapeHtml(labelOf(item))}${extraRowHtml ? extraRowHtml(item) : ''}</span>
          <button class="icon-btn" data-action="up" ${idx === 0 ? 'disabled' : ''}>&#9650;</button>
          <button class="icon-btn" data-action="down" ${idx === items.length - 1 ? 'disabled' : ''}>&#9660;</button>
          ${extraButtonHtml ? extraButtonHtml(item) : ''}
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
      const next = prompt('Rename to:', labelOf(item));
      if (next === null || !next.trim()) return;
      const updated = await onRename(item, next.trim());
      Object.assign(item, updated);
      renderList();
    } else if (action === 'delete') {
      if (confirm(`Delete "${labelOf(item)}"? This also deletes everything nested inside it.`)) {
        await onDelete(item);
        items.splice(items.findIndex((x) => x.id === item.id), 1);
        renderList();
      }
    } else if (action === 'up' || action === 'down') {
      await onReorder(item, action);
      const fresh = await onReload();
      items.length = 0;
      items.push(...fresh);
      renderList();
    } else if (customActions && customActions[action]) {
      const updated = await customActions[action](item);
      if (updated) Object.assign(item, updated);
      renderList();
    }
  });

  container.querySelector('#add-btn').addEventListener('click', addNew);
  container.querySelector('#add-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addNew();
  });
  async function addNew() {
    const input = container.querySelector('#add-input');
    const value = input.value.trim();
    if (!value) return;
    const created = await onAdd(value);
    items.push(created);
    input.value = '';
    renderList();
  }

  return { renderList };
}

async function renderYearsAdmin(container) {
  const myToken = currentRenderToken();
  const years = await api.get('/api/years');
  if (myToken !== currentRenderToken()) return;

  container.innerHTML = adminSubNav('structure') + '<div id="admin-body"></div>';
  wireSubNav(container);

  renderRowList(container.querySelector('#admin-body'), {
    title: 'Admin — Years',
    breadcrumb: null,
    items: years,
    labelOf: (y) => y.label,
    addPlaceholder: 'New year, e.g. 2025-2026',
    onAdd: async (label) => api.post('/api/years', { label }),
    onReload: async () => api.get('/api/years'),
    onRename: async (item, label) => api.patch(`/api/years/${item.id}`, { label }),
    onDelete: async (item) => api.del(`/api/years/${item.id}`),
    onReorder: async (item, direction) => api.patch(`/api/years/${item.id}/reorder`, { direction }),
    onSelect: (item) => navigate(`#/admin/year/${item.id}`),
  });
}

async function renderSemestersAdmin(container, yearId) {
  const myToken = currentRenderToken();
  const [year, semesters] = await Promise.all([
    api.get('/api/years').then((ys) => ys.find((y) => String(y.id) === String(yearId))),
    api.get(`/api/years/${yearId}/semesters`),
  ]);
  if (myToken !== currentRenderToken()) return;

  container.innerHTML = adminSubNav('structure') + '<div id="admin-body"></div>';
  wireSubNav(container);

  const body = container.querySelector('#admin-body');
  renderRowList(body, {
    title: year ? `Admin — ${year.label}` : 'Admin — Semesters',
    breadcrumb: `<a href="#/admin">Years</a> &rsaquo; ${escapeHtml(year ? year.label : '')}`,
    items: semesters,
    labelOf: (s) => s.label,
    extraRowHtml: (s) => (s.archived ? ` <span class="row-sub">(Archived)</span>` : ''),
    extraButtonHtml: (s) => `<button class="icon-btn" data-action="archive">${s.archived ? 'Unarchive' : 'Archive'}</button>`,
    customActions: {
      archive: async (item) => api.patch(`/api/semesters/${item.id}/archive`, { archived: !item.archived }),
    },
    addPlaceholder: 'New semester, e.g. Fall',
    onAdd: async (label) => api.post(`/api/years/${yearId}/semesters`, { label }),
    onReload: async () => api.get(`/api/years/${yearId}/semesters`),
    onRename: async (item, label) => api.patch(`/api/semesters/${item.id}`, { label }),
    onDelete: async (item) => api.del(`/api/semesters/${item.id}`),
    onReorder: async (item, direction) => api.patch(`/api/semesters/${item.id}/reorder`, { direction }),
    onSelect: (item) => navigate(`#/admin/year/${yearId}/semester/${item.id}`),
  });
}

async function renderClassesAdmin(container, yearId, semesterId) {
  const myToken = currentRenderToken();
  const [years, semesters, classes] = await Promise.all([
    api.get('/api/years'),
    api.get(`/api/years/${yearId}/semesters`),
    api.get(`/api/semesters/${semesterId}/classes`),
  ]);
  if (myToken !== currentRenderToken()) return;
  const year = years.find((y) => String(y.id) === String(yearId));
  const semester = semesters.find((s) => String(s.id) === String(semesterId));

  container.innerHTML = `
    ${adminSubNav('structure')}
    <div class="breadcrumb-nav">
      <a href="#/admin">Years</a> &rsaquo; <a href="#/admin/year/${yearId}">${escapeHtml(year ? year.label : '')}</a> &rsaquo; ${escapeHtml(semester ? semester.label : '')}
    </div>
    <h2>Admin — Classes</h2>
    <div id="classes-list"></div>
    <div class="control-row" style="margin-top:10px;">
      <input type="text" class="field-input" id="add-class-name" placeholder="New class name" style="max-width:220px;">
      <button class="chip-btn" id="add-class-btn">+ Add Class</button>
    </div>
  `;
  wireSubNav(container);

  const listEl = container.querySelector('#classes-list');
  const expanded = new Set();

  function renderList() {
    if (classes.length === 0) {
      listEl.innerHTML = `<div class="empty-state">No classes yet.</div>`;
      return;
    }
    listEl.innerHTML = classes
      .map(
        (c, idx) => `
        <div class="session-card ${expanded.has(c.id) ? 'expanded' : ''}" data-id="${c.id}">
          <div class="session-card-header">
            <span class="session-chevron">&#9660;</span>
            <span class="session-title">${escapeHtml(c.name)}</span>
            <span class="session-date">${escapeHtml(c.professor || '')}</span>
            <button class="icon-btn" data-action="up" ${idx === 0 ? 'disabled' : ''}>&#9650;</button>
            <button class="icon-btn" data-action="down" ${idx === classes.length - 1 ? 'disabled' : ''}>&#9660;</button>
            <button class="icon-btn danger" data-action="delete">Delete</button>
          </div>
          <div class="session-card-body" data-body-for="${c.id}"></div>
        </div>`
      )
      .join('');
    classes.forEach((c) => {
      if (expanded.has(c.id)) loadClassEditor(listEl.querySelector(`[data-body-for="${c.id}"]`), c);
    });
  }
  renderList();

  listEl.addEventListener('click', async (ev) => {
    const actionBtn = ev.target.closest('.session-card-header [data-action]');
    const header = ev.target.closest('.session-card-header');
    const card = ev.target.closest('.session-card');
    if (!card) return;
    const id = Number(card.getAttribute('data-id'));
    const cls = classes.find((c) => c.id === id);

    if (actionBtn) {
      const action = actionBtn.getAttribute('data-action');
      if (action === 'up' || action === 'down') {
        await api.patch(`/api/classes/${id}/reorder`, { direction: action });
        const fresh = await api.get(`/api/semesters/${semesterId}/classes`);
        classes.length = 0;
        classes.push(...fresh);
        renderList();
      } else if (action === 'delete') {
        if (confirm(`Delete "${cls.name}"? This also deletes everything nested inside it.`)) {
          await api.del(`/api/classes/${id}`);
          classes.splice(classes.findIndex((c) => c.id === id), 1);
          renderList();
        }
      }
      return;
    }
    if (header) {
      if (expanded.has(id)) { expanded.delete(id); card.classList.remove('expanded'); }
      else { expanded.add(id); card.classList.add('expanded'); loadClassEditor(card.querySelector('.session-card-body'), cls); }
    }
  });

  container.querySelector('#add-class-btn').addEventListener('click', async () => {
    const input = container.querySelector('#add-class-name');
    const name = input.value.trim();
    if (!name) return;
    const created = await api.post(`/api/semesters/${semesterId}/classes`, { name });
    classes.push(created);
    input.value = '';
    expanded.add(created.id);
    renderList();
  });
}

async function loadClassEditor(bodyEl, cls) {
  const schedule = await api.get(`/api/classes/${cls.id}/schedule`);

  bodyEl.innerHTML = `
    <label class="field-label">Class name</label>
    <input type="text" class="field-input" id="cls-name-${cls.id}" value="${escapeHtml(cls.name)}">
    <label class="field-label">Professor</label>
    <input type="text" class="field-input" id="cls-prof-${cls.id}" value="${escapeHtml(cls.professor || '')}">
    <label class="field-label">Professor email</label>
    <input type="email" class="field-input" id="cls-email-${cls.id}" value="${escapeHtml(cls.professor_email || '')}">
    <label class="field-label">Office hours</label>
    <input type="text" class="field-input" id="cls-hours-${cls.id}" value="${escapeHtml(cls.office_hours || '')}" placeholder="e.g. Tue/Thu 2-4pm">
    <div class="control-row" style="margin:8px 0;">
      <button class="chip-btn" id="cls-save-${cls.id}">Save</button>
    </div>

    <div class="field-label">Weekly schedule</div>
    <div id="cls-schedule-${cls.id}"></div>
    <div class="control-row" style="margin:8px 0;">
      <select class="field-input" id="sched-day-${cls.id}" style="max-width:110px;">
        ${DAY_LABELS.map((d, i) => `<option value="${i}">${d}</option>`).join('')}
      </select>
      <input type="time" class="field-input" id="sched-start-${cls.id}" style="max-width:130px;">
      <input type="time" class="field-input" id="sched-end-${cls.id}" style="max-width:130px;">
      <button class="chip-btn" id="sched-add-${cls.id}">+ Add Time</button>
    </div>
  `;

  bodyEl.querySelector(`#cls-save-${cls.id}`).addEventListener('click', async () => {
    const updated = await api.patch(`/api/classes/${cls.id}`, {
      name: bodyEl.querySelector(`#cls-name-${cls.id}`).value.trim(),
      professor: bodyEl.querySelector(`#cls-prof-${cls.id}`).value.trim(),
      professor_email: bodyEl.querySelector(`#cls-email-${cls.id}`).value.trim(),
      office_hours: bodyEl.querySelector(`#cls-hours-${cls.id}`).value.trim(),
    });
    Object.assign(cls, updated);
    const header = bodyEl.closest('.session-card').querySelector('.session-title');
    if (header) header.textContent = cls.name;
    const sub = bodyEl.closest('.session-card').querySelector('.session-date');
    if (sub) sub.textContent = cls.professor || '';
  });

  function renderSchedule() {
    const listEl = bodyEl.querySelector(`#cls-schedule-${cls.id}`);
    if (schedule.length === 0) {
      listEl.innerHTML = `<div class="empty-state">No weekly meeting times set.</div>`;
      return;
    }
    listEl.innerHTML = schedule
      .map(
        (s) => `
        <div class="file-chip" data-slot-id="${s.id}">
          ${DAY_LABELS[s.day_of_week]} ${s.start_time}&ndash;${s.end_time}
          <button type="button" class="schedule-delete-btn" data-slot-id="${s.id}">&times;</button>
        </div>`
      )
      .join('');
  }
  renderSchedule();

  bodyEl.querySelector(`#cls-schedule-${cls.id}`).addEventListener('click', async (ev) => {
    const btn = ev.target.closest('.schedule-delete-btn');
    if (!btn) return;
    const id = Number(btn.getAttribute('data-slot-id'));
    await api.del(`/api/schedule/${id}`);
    schedule.splice(schedule.findIndex((s) => s.id === id), 1);
    renderSchedule();
  });

  bodyEl.querySelector(`#sched-add-${cls.id}`).addEventListener('click', async () => {
    const day = Number(bodyEl.querySelector(`#sched-day-${cls.id}`).value);
    const start = bodyEl.querySelector(`#sched-start-${cls.id}`).value;
    const end = bodyEl.querySelector(`#sched-end-${cls.id}`).value;
    if (!start || !end) return;
    const created = await api.post(`/api/classes/${cls.id}/schedule`, { day_of_week: day, start_time: start, end_time: end });
    schedule.push(created);
    schedule.sort((a, b) => a.day_of_week - b.day_of_week || a.start_time.localeCompare(b.start_time));
    renderSchedule();
  });
}

async function renderDueDates(container) {
  const myToken = currentRenderToken();
  const assignments = await api.get('/api/admin/assignments');
  if (myToken !== currentRenderToken()) return;

  container.innerHTML = `
    ${adminSubNav('duedates')}
    <h2>Admin — Due Dates</h2>
    <p class="row-sub">Every assignment across all active classes. Set or change a due date, or record a grade, without opening the session it lives in.</p>
    <div id="duedates-list"></div>
  `;
  wireSubNav(container);

  const listEl = container.querySelector('#duedates-list');
  if (assignments.length === 0) {
    listEl.innerHTML = `<div class="empty-state">No assignments yet.</div>`;
    return;
  }

  listEl.innerHTML = assignments
    .map(
      (a) => `
      <div class="row-item" data-id="${a.id}" style="flex-wrap:wrap;">
        <span class="row-label">${escapeHtml(a.title || '(untitled)')}
          <span class="row-sub">${escapeHtml(a.class_name)} &rsaquo; ${escapeHtml(a.session_topic || '')}</span>
        </span>
        <input type="date" class="field-input" data-due-id="${a.id}" value="${escapeHtml(a.due_date || '')}" style="max-width:160px;">
        <input type="number" class="field-input" data-grade-id="${a.id}" value="${a.grade ?? ''}" placeholder="Grade" step="any" style="max-width:90px;">
        <input type="number" class="field-input" data-points-id="${a.id}" value="${a.points_possible ?? ''}" placeholder="Out of" step="any" style="max-width:90px;">
      </div>`
    )
    .join('');

  async function saveRow(id) {
    const dueInput = listEl.querySelector(`[data-due-id="${id}"]`);
    const gradeInput = listEl.querySelector(`[data-grade-id="${id}"]`);
    const pointsInput = listEl.querySelector(`[data-points-id="${id}"]`);
    await api.patch(`/api/entries/${id}`, {
      due_date: dueInput.value || null,
      grade: gradeInput.value,
      points_possible: pointsInput.value,
    });
  }

  listEl.querySelectorAll('[data-due-id], [data-grade-id], [data-points-id]').forEach((input) => {
    input.addEventListener('change', () => {
      const id = input.getAttribute('data-due-id') || input.getAttribute('data-grade-id') || input.getAttribute('data-points-id');
      saveRow(id);
    });
  });
}
