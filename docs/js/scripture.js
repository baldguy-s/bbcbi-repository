import { api } from './api.js';
import { escapeHtml } from './util.js';
import { navigate, currentRenderToken } from './app.js';

export async function renderScriptureView(container, segments) {
  const [, bookParam, chapterParam, verseParam] = segments;

  if (!bookParam) return renderBookList(container);
  if (!chapterParam) return renderBookChapters(container, decodeURIComponent(bookParam));
  return renderCitingEntries(container, decodeURIComponent(bookParam), chapterParam, verseParam);
}

async function renderBookList(container) {
  const myToken = currentRenderToken();
  const books = await api.get('/api/scripture/books');
  if (myToken !== currentRenderToken()) return;
  container.innerHTML = `
    <h2>Scripture Index</h2>
    ${books.length === 0 ? '<div class="empty-state">No scripture references found yet. They\'re detected automatically from entry text (e.g. "John 3:16").</div>' : ''}
    <div id="book-list"></div>
  `;
  const listEl = container.querySelector('#book-list');
  listEl.innerHTML = books
    .map((b) => `<div class="row-item" data-book="${escapeHtml(b)}" style="cursor:pointer;"><span class="row-label">${escapeHtml(b)}</span></div>`)
    .join('');
  listEl.querySelectorAll('.row-item').forEach((row) => {
    row.addEventListener('click', () => navigate(`#/scripture/${encodeURIComponent(row.dataset.book)}`));
  });
}

async function renderBookChapters(container, book) {
  const myToken = currentRenderToken();
  const refs = await api.get(`/api/scripture/books/${encodeURIComponent(book)}`);
  if (myToken !== currentRenderToken()) return;
  container.innerHTML = `
    <div class="breadcrumb-nav"><a href="#/scripture">Scripture Index</a> &rsaquo; ${escapeHtml(book)}</div>
    <h2>${escapeHtml(book)}</h2>
    <div id="ref-list"></div>
  `;
  const listEl = container.querySelector('#ref-list');
  if (refs.length === 0) {
    listEl.innerHTML = `<div class="empty-state">No references.</div>`;
    return;
  }
  listEl.innerHTML = refs
    .map((r) => {
      const label = formatRefLabel(r);
      return `<div class="row-item" data-chapter="${r.chapter}" data-verse="${r.verse_start ?? ''}" style="cursor:pointer;"><span class="row-label">${escapeHtml(label)}</span></div>`;
    })
    .join('');
  listEl.querySelectorAll('.row-item').forEach((row) => {
    row.addEventListener('click', () => {
      const chapter = row.dataset.chapter;
      const verse = row.dataset.verse;
      navigate(`#/scripture/${encodeURIComponent(book)}/${chapter}${verse ? `/${verse}` : ''}`);
    });
  });
}

function formatRefLabel(r) {
  if (r.verse_start == null) return `Chapter ${r.chapter}`;
  if (r.chapter_end && r.chapter_end !== r.chapter) {
    return `${r.chapter}:${r.verse_start}–${r.chapter_end}:${r.verse_end}`;
  }
  if (r.verse_end) return `${r.chapter}:${r.verse_start}-${r.verse_end}`;
  return `${r.chapter}:${r.verse_start}`;
}

async function renderCitingEntries(container, book, chapter, verse) {
  const myToken = currentRenderToken();
  const params = new URLSearchParams();
  if (chapter) params.set('chapter', chapter);
  if (verse) params.set('verse', verse);
  const rows = await api.get(`/api/scripture/books/${encodeURIComponent(book)}/entries?${params.toString()}`);
  if (myToken !== currentRenderToken()) return;

  container.innerHTML = `
    <div class="breadcrumb-nav">
      <a href="#/scripture">Scripture Index</a> &rsaquo;
      <a href="#/scripture/${encodeURIComponent(book)}">${escapeHtml(book)}</a> &rsaquo;
      ${escapeHtml(chapter)}${verse ? ':' + escapeHtml(verse) : ''}
    </div>
    <h2>${escapeHtml(book)} ${escapeHtml(chapter)}${verse ? ':' + escapeHtml(verse) : ''}</h2>
    <div id="citing-list"></div>
  `;

  const listEl = container.querySelector('#citing-list');
  if (rows.length === 0) {
    listEl.innerHTML = `<div class="empty-state">No entries cite this passage.</div>`;
    return;
  }

  listEl.innerHTML = rows
    .map(
      (r) => `
      <div class="row-item" data-class-id="${r.classId}" style="cursor:pointer;">
        <span class="row-label">${escapeHtml(r.title || '(untitled)')}
          <span class="row-sub">${escapeHtml(r.yearLabel)} &rsaquo; ${escapeHtml(r.semesterLabel)} &rsaquo; ${escapeHtml(r.className)} &rsaquo; ${escapeHtml(r.sessionTopic || '')}</span>
        </span>
      </div>`
    )
    .join('');

  listEl.querySelectorAll('.row-item').forEach((row) => {
    row.addEventListener('click', () => {
      navigate(`#/notebook/class/${row.dataset.classId}/tab/sessions`);
    });
  });
}
