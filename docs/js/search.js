import { escapeHtml } from './util.js';
import { navigate } from './app.js';
import { rawFileUrl } from './api.js';

// A search result's whole row navigates straight to where it lives — for an
// entry or a session-attached file, that's the exact session (not just the
// class's Sessions tab), so a search really does "jump straight to a note,"
// not just to the right class.
function targetHash(classId, sessionId, tab) {
  const base = `#/notebook/class/${classId}`;
  if (sessionId) return `${base}/tab/sessions/session/${sessionId}`;
  return `${base}/tab/${tab || 'sessions'}`;
}

export function renderSearchResults(container, results, query) {
  const { entries = [], docs = [], files = [] } = results;
  const total = entries.length + docs.length + files.length;

  container.innerHTML = `
    <h2>Search results for "${escapeHtml(query)}"</h2>
    ${total === 0 ? '<div class="empty-state">No matches.</div>' : ''}
    ${entries.length ? renderGroup('Notes & Entries', entries.map(entryRowHtml)) : ''}
    ${docs.length ? renderGroup('Syllabus', docs.map(docRowHtml)) : ''}
    ${files.length ? renderGroup('Files', files.map(fileRowHtml)) : ''}
  `;

  container.querySelectorAll('[data-target]').forEach((row) => {
    row.addEventListener('click', (ev) => {
      if (ev.target.closest('a')) return; // let direct file download links behave normally
      navigate(row.dataset.target);
    });
  });
}

function renderGroup(title, rowsHtml) {
  return `<div class="search-group"><h3>${escapeHtml(title)}</h3>${rowsHtml.join('')}</div>`;
}

function entryRowHtml(e) {
  return `
    <div class="search-result" data-target="${targetHash(e.classId, e.sessionId)}">
      <div>${escapeHtml(e.title || '(untitled)')} <span class="type-badge ${e.type}">${escapeHtml(e.type)}</span></div>
      <div class="breadcrumb">${escapeHtml(e.yearLabel)} &rsaquo; ${escapeHtml(e.semesterLabel)} &rsaquo; ${escapeHtml(e.className)} &rsaquo; ${escapeHtml(e.sessionTopic || '')}</div>
    </div>`;
}

function docRowHtml(d) {
  return `
    <div class="search-result" data-target="${targetHash(d.classId, null, 'syllabus')}">
      <div>Syllabus</div>
      <div class="breadcrumb">${escapeHtml(d.yearLabel)} &rsaquo; ${escapeHtml(d.semesterLabel)} &rsaquo; ${escapeHtml(d.className)}</div>
    </div>`;
}

function fileRowHtml(f) {
  const clickable = f.classId != null;
  return `
    <div class="search-result"${clickable ? ` data-target="${targetHash(f.classId, f.sessionId, 'syllabus')}"` : ''}>
      <div><a href="${rawFileUrl(f.path)}" target="_blank" rel="noopener">${escapeHtml(f.original_filename)}</a></div>
      <div class="breadcrumb">${escapeHtml(f.contextLabel || '')}</div>
    </div>`;
}
