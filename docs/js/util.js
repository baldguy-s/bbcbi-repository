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

// Flashes a small "Saved" confirmation next to a Save button. Reuses one
// indicator element per button (rather than creating a new one on every
// save) so rapid saves just restart the fade instead of stacking elements.
export function flashSaved(button) {
  let indicator = button.nextElementSibling;
  if (!indicator || !indicator.classList.contains('save-indicator')) {
    indicator = document.createElement('span');
    indicator.className = 'save-indicator';
    button.insertAdjacentElement('afterend', indicator);
  }
  indicator.textContent = 'Saved ✓';
  indicator.classList.add('visible');
  clearTimeout(indicator._fadeTimeout);
  indicator._fadeTimeout = setTimeout(() => indicator.classList.remove('visible'), 2000);
}

export function formatTime(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

// Detects whether a custom instructor-field value is something clickable
// (phone, email, or website/social link) and, if so, what it should link to.
// Purely value-shape-based (not label-based) — a custom field's label is
// free text the user typed ("Cell", "Office", "Twitter", ...) and isn't
// reliable to pattern-match on, but the value itself usually looks
// distinctly like a phone number, an email, or a URL regardless of label.
export function linkifyFieldValue(rawValue) {
  const v = (rawValue || '').trim();
  if (!v) return null;

  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) {
    return { href: `mailto:${v}`, text: v, external: false };
  }

  const digitsOnly = v.replace(/\D/g, '');
  if (/^[+]?[\d\s().-]+$/.test(v) && digitsOnly.length >= 7 && digitsOnly.length <= 15) {
    return { href: `tel:${v.replace(/[^\d+]/g, '')}`, text: v, external: false };
  }

  // The bare-domain fallback requires a 2+ char first label specifically to
  // avoid turning academic-degree abbreviations like "M.Div" or "D.Min"
  // (single-letter label + a real word) into bogus links.
  if (/^(https?:\/\/|www\.)\S+$/i.test(v) || /^[a-z0-9-]{2,}(\.[a-z0-9-]+)*\.[a-z]{2,}(\/\S*)?$/i.test(v)) {
    return { href: /^https?:\/\//i.test(v) ? v : `https://${v}`, text: v, external: true };
  }

  return null;
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
