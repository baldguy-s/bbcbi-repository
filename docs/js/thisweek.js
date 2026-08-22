import { api } from './api.js';
import { escapeHtml, formatDate, formatTime } from './util.js';
import { navigate, currentRenderToken } from './app.js';

// This Week is the first tab now, and absorbs what used to be the separate
// Upcoming tab: it shows this week's scheduled class sessions AND the full
// cross-class assignment list (not just assignments due within 7 days), so
// there's one dashboard instead of two.
export async function renderThisWeekView(container) {
  const myToken = currentRenderToken();
  const [week, assignments] = await Promise.all([
    api.get('/api/dashboard/this-week'),
    api.get('/api/entries/upcoming'),
  ]);
  if (myToken !== currentRenderToken()) return;

  container.innerHTML = `
    <h2>This Week</h2>
    <h3 class="section-heading">This week's classes</h3>
    <div id="week-sessions"></div>
    <h3 class="section-heading">Assignments</h3>
    <div id="week-assignments"></div>
  `;

  const goToClass = (classId) => navigate(`#/notebook/class/${classId}/tab/sessions`);
  const goToAssignment = (a) =>
    navigate(a.session_id ? `#/notebook/class/${a.class_id}/tab/sessions/session/${a.session_id}` : `#/notebook/class/${a.class_id}/tab/sessions`);

  const sEl = container.querySelector('#week-sessions');
  if (week.sessions.length === 0) {
    sEl.innerHTML = `<div class="empty-state">No weekly class schedule set yet — add one per class in the Admin tab.</div>`;
  } else {
    sEl.innerHTML = week.sessions
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

  const aEl = container.querySelector('#week-assignments');
  if (assignments.length === 0) {
    aEl.innerHTML = `<div class="empty-state">No assignments with due dates yet.</div>`;
  } else {
    aEl.innerHTML = assignments
      .map(
        (a) => `
        <div class="row-item" data-class="${a.class_id}" style="cursor:pointer;">
          <span class="row-label">${escapeHtml(a.title || '(untitled)')}
            <span class="row-sub">${escapeHtml(a.class_name)} &middot; ${escapeHtml(a.session_topic || '')}</span>
          </span>
          <span class="due-badge ${a.overdue ? 'overdue' : ''}">${a.due_date ? `Due ${escapeHtml(formatDate(a.due_date))}` : ''}</span>
        </div>`
      )
      .join('');
    aEl.querySelectorAll('.row-item').forEach((row, i) => {
      row.addEventListener('click', () => goToAssignment(assignments[i]));
    });
  }
}
