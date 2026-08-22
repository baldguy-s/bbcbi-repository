export function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]));
}

import { linkify } from './scriptureParser.js';

export function renderMarkdown(bodyMarkdown) {
  const linked = linkify(bodyMarkdown || '');
  const html = window.marked.parse(linked);
  const clean = window.DOMPurify.sanitize(html, { ADD_ATTR: ['target'] });

  const wrap = document.createElement('div');
  wrap.innerHTML = clean;
  wrap.querySelectorAll('a[href^="#/scripture/"]').forEach((a) => {
    a.classList.add('scripture-link');
  });
  return wrap.innerHTML;
}

export function formatDate(isoDateStr) {
  if (!isoDateStr) return '';
  // isoDateStr is a plain "YYYY-MM-DD" or a full datetime string; only the
  // date part matters for display.
  const datePart = isoDateStr.slice(0, 10);
  const [y, m, d] = datePart.split('-').map(Number);
  if (!y || !m || !d) return isoDateStr;
  return `${m}/${d}/${String(y).slice(-2)}`;
}

export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}
