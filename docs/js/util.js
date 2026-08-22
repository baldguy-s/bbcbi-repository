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

export function formatTime(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

export function todayIso() {
  // Local calendar date, not UTC — toISOString() flips to the next day
  // several hours early for any timezone west of UTC (e.g. ~8pm Eastern),
  // which would mark things "overdue" or "due today" incorrectly in the
  // evening. Matches the equivalent fix in api.js's localIsoDate().
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
