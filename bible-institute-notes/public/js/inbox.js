import { api } from './api.js';
import { escapeHtml, formatDate } from './util.js';
import { currentRenderToken } from './app.js';

export async function renderInboxView(container) {
  const myToken = currentRenderToken();
  const items = await api.get('/api/inbox');
  const years = await api.get('/api/years');
  if (myToken !== currentRenderToken()) return;

  container.innerHTML = `
    <h2>Inbox</h2>
    <p class="row-sub">Files uploaded here wait unfiled until you send them to a Year → Semester → Class → Session.</p>
    <div id="inbox-list"></div>
  `;

  const listEl = container.querySelector('#inbox-list');

  if (items.length === 0) {
    listEl.innerHTML = `<div class="empty-state">Inbox is empty.</div>`;
    return;
  }

  listEl.innerHTML = items
    .map(
      (f) => `
      <div class="row-item" data-id="${f.id}" style="flex-wrap:wrap;">
        <span class="row-label">${escapeHtml(f.original_filename)} <span class="row-sub">${escapeHtml(formatDate(f.uploaded_at))}</span></span>
        <button class="icon-btn" data-action="file">File it</button>
        <div class="file-panel" data-panel style="display:none; width:100%; margin-top:8px;"></div>
      </div>`
    )
    .join('');

  listEl.addEventListener('click', async (ev) => {
    const btn = ev.target.closest('[data-action="file"]');
    if (!btn) return;
    const row = btn.closest('.row-item');
    const fileId = row.getAttribute('data-id');
    const panel = row.querySelector('[data-panel]');
    const isOpen = panel.style.display !== 'none';
    panel.style.display = isOpen ? 'none' : 'block';
    if (!isOpen) await buildFilingPanel(panel, fileId, years, () => {
      row.remove();
    });
  });
}

async function buildFilingPanel(panel, fileId, years, onFiled) {
  panel.innerHTML = `
    <div class="control-row">
      <select class="field-input" id="pick-year" style="max-width:160px;"><option value="">Year...</option></select>
      <select class="field-input" id="pick-semester" style="max-width:160px;" disabled><option value="">Semester...</option></select>
      <select class="field-input" id="pick-class" style="max-width:180px;" disabled><option value="">Class...</option></select>
      <select class="field-input" id="pick-target" style="max-width:220px;" disabled><option value="">Where...</option></select>
      <button class="chip-btn" id="file-confirm-btn" disabled>File Here</button>
    </div>
  `;

  const yearSel = panel.querySelector('#pick-year');
  const semSel = panel.querySelector('#pick-semester');
  const classSel = panel.querySelector('#pick-class');
  const targetSel = panel.querySelector('#pick-target');
  const confirmBtn = panel.querySelector('#file-confirm-btn');

  years.forEach((y) => yearSel.insertAdjacentHTML('beforeend', `<option value="${y.id}">${escapeHtml(y.label)}</option>`));

  yearSel.addEventListener('change', async () => {
    resetSelect(semSel, 'Semester...');
    resetSelect(classSel, 'Class...');
    resetSelect(targetSel, 'Where...');
    confirmBtn.disabled = true;
    if (!yearSel.value) return;
    const semesters = await api.get(`/api/years/${yearSel.value}/semesters`);
    semesters.forEach((s) => semSel.insertAdjacentHTML('beforeend', `<option value="${s.id}">${escapeHtml(s.label)}</option>`));
    semSel.disabled = false;
  });

  semSel.addEventListener('change', async () => {
    resetSelect(classSel, 'Class...');
    resetSelect(targetSel, 'Where...');
    confirmBtn.disabled = true;
    if (!semSel.value) return;
    const classes = await api.get(`/api/semesters/${semSel.value}/classes`);
    classes.forEach((c) => classSel.insertAdjacentHTML('beforeend', `<option value="${c.id}">${escapeHtml(c.name)}</option>`));
    classSel.disabled = false;
  });

  classSel.addEventListener('change', async () => {
    resetSelect(targetSel, 'Where...');
    confirmBtn.disabled = true;
    if (!classSel.value) return;
    targetSel.insertAdjacentHTML('beforeend', `<option value="classDoc:syllabus">Syllabus</option>`);
    targetSel.insertAdjacentHTML('beforeend', `<option value="classDoc:schedule">Schedule</option>`);
    const sessions = await api.get(`/api/classes/${classSel.value}/sessions`);
    sessions.forEach((s) =>
      targetSel.insertAdjacentHTML(
        'beforeend',
        `<option value="session:${s.id}">Session: ${escapeHtml(s.topic || '(untitled)')}</option>`
      )
    );
    targetSel.disabled = false;
  });

  targetSel.addEventListener('change', () => {
    confirmBtn.disabled = !targetSel.value;
  });

  confirmBtn.addEventListener('click', async () => {
    const [kind, id] = targetSel.value.split(':');
    if (kind === 'session') {
      await api.patch(`/api/inbox/${fileId}/file`, { target: 'session', targetId: Number(id) });
    } else if (kind === 'classDoc') {
      const doc = await api.get(`/api/classes/${classSel.value}/docs/${id}`);
      await api.patch(`/api/inbox/${fileId}/file`, { target: 'classDoc', targetId: doc.id });
    }
    onFiled();
  });
}

function resetSelect(select, placeholder) {
  select.innerHTML = `<option value="">${placeholder}</option>`;
  select.disabled = true;
}
