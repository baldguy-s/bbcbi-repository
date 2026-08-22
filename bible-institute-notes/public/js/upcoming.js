import { api } from './api.js';
import { escapeHtml, formatDate } from './util.js';
import { navigate, currentRenderToken } from './app.js';

export async function renderUpcomingView(container) {
  const myToken = currentRenderToken();
  const items = await api.get('/api/entries/upcoming');
  if (myToken !== currentRenderToken()) return;

  container.innerHTML = `
    <h2>Upcoming Assignments</h2>
    <div id="upcoming-list"></div>
  `;

  const listEl = container.querySelector('#upcoming-list');

  if (items.length === 0) {
    listEl.innerHTML = `<div class="empty-state">No assignments with due dates yet.</div>`;
    return;
  }

  listEl.innerHTML = items
    .map(
      (e) => `
      <div class="row-item" data-class="${e.class_id}" style="cursor:pointer;">
        <span class="row-label">${escapeHtml(e.title || '(untitled)')}
          <span class="row-sub">${escapeHtml(e.class_name)} &middot; ${escapeHtml(e.session_topic || '')}</span>
        </span>
        <span class="due-badge ${e.overdue ? 'overdue' : ''}">${e.due_date ? `Due ${escapeHtml(formatDate(e.due_date))}` : ''}</span>
      </div>`
    )
    .join('');

  listEl.querySelectorAll('.row-item').forEach((row) => {
    row.addEventListener('click', () => {
      navigate(`#/notebook/class/${row.dataset.class}/tab/sessions`);
    });
  });
}
