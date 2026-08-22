import { escapeHtml } from './util.js';
import { navigate } from './app.js';

export function renderSearchResults(container, results, query) {
  const { entries = [], docs = [], files = [] } = results;
  const total = entries.length + docs.length + files.length;

  container.innerHTML = `
    <h2>Search results for "${escapeHtml(query)}"</h2>
    ${total === 0 ? '<div class="empty-state">No matches.</div>' : ''}
    ${entries.length ? renderGroup('Notes & Entries', entries.map(entryRowHtml)) : ''}
    ${docs.length ? renderGroup('Syllabus / Schedule', docs.map(docRowHtml)) : ''}
    ${files.length ? renderGroup('Files', files.map(fileRowHtml)) : ''}
  `;

  container.querySelectorAll('[data-class-id]').forEach((row) => {
    row.addEventListener('click', () => {
      navigate(`#/notebook/class/${row.dataset.classId}/tab/sessions`);
    });
  });
}

function renderGroup(title, rowsHtml) {
  return `<div class="search-group"><h3>${escapeHtml(title)}</h3>${rowsHtml.join('')}</div>`;
}

function entryRowHtml(e) {
  return `
    <div class="search-result" data-class-id="${e.classId}">
      <div>${escapeHtml(e.title || '(untitled)')} <span class="type-badge ${e.type}">${escapeHtml(e.type)}</span></div>
      <div class="breadcrumb">${escapeHtml(e.yearLabel)} &rsaquo; ${escapeHtml(e.semesterLabel)} &rsaquo; ${escapeHtml(e.className)} &rsaquo; ${escapeHtml(e.sessionTopic || '')}</div>
    </div>`;
}

function docRowHtml(d) {
  return `
    <div class="search-result" data-class-id="${d.classId}">
      <div>${escapeHtml(d.docType)}</div>
      <div class="breadcrumb">${escapeHtml(d.yearLabel)} &rsaquo; ${escapeHtml(d.semesterLabel)} &rsaquo; ${escapeHtml(d.className)}</div>
    </div>`;
}

function fileRowHtml(f) {
  return `
    <div class="search-result">
      <div>${escapeHtml(f.original_filename)}</div>
      <div class="breadcrumb"><a href="/api/uploads/${f.fileId}/download" target="_blank" rel="noopener">Download</a></div>
    </div>`;
}
