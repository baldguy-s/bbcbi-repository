import { api } from './api.js';
import { escapeHtml, formatDate, formatTime } from './util.js';
import { navigate, currentRenderToken } from './app.js';

export async function renderThisWeekView(container) {
  const myToken = currentRenderToken();
  const data = await api.get('/api/dashboard/this-week');
  if (myToken !== currentRenderToken()) return;

  container.innerHTML = `
    <h2>This Week</h2>
    <h3 style="font-size:1rem;">Due this week</h3>
    <div id="week-assignments"></div>
    <h3 style="font-size:1rem;margin-top:20px;">Class sessions this week</h3>
    <div id="week-sessions"></div>
  `;

  const goToClass = (classId) => navigate(`#/notebook/class/${classId}/tab/sessions`);

  const aEl = container.querySelector('#week-assignments');
  if (data.assignments.length === 0) {
    aEl.innerHTML = `<div class="empty-state">Nothing due this week.</div>`;
  } else {
    aEl.innerHTML = data.assignments
      .map(
        (a) => `
        <div class="row-item" data-class="${a.class_id}" style="cursor:pointer;">
          <span class="row-label">${escapeHtml(a.title || '(untitled)')} <span class="row-sub">${escapeHtml(a.class_name)}</span></span>
          <span class="due-badge ${a.overdue ? 'overdue' : ''}">${escapeHtml(formatDate(a.due_date))}</span>
        </div>`
      )
      .join('');
    aEl.querySelectorAll('.row-item').forEach((row) => {
      row.addEventListener('click', () => goToClass(row.getAttribute('data-class')));
    });
  }

  const sEl = container.querySelector('#week-sessions');
  if (data.sessions.length === 0) {
    sEl.innerHTML = `<div class="empty-state">No weekly class schedule set yet — add one per class in the Admin tab.</div>`;
  } else {
    sEl.innerHTML = data.sessions
      .map(
        (s) => `
        <div class="row-item" data-class="${s.classId}" style="cursor:pointer;">
          <span class="row-label">${escapeHtml(s.className)}
            <span class="row-sub">${escapeHtml(s.dayLabel)} ${escapeHtml(formatDate(s.date))}, ${escapeHtml(formatTime(s.startTime))}&ndash;${escapeHtml(formatTime(s.endTime))}</span>
          </span>
        </div>`
      )
      .join('');
    sEl.querySelectorAll('.row-item').forEach((row) => {
      row.addEventListener('click', () => goToClass(row.getAttribute('data-class')));
    });
  }
}
