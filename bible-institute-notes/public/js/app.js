import { api } from './api.js';
import { renderNotebookView } from './notebook.js';
import { renderInboxView } from './inbox.js';
import { renderUpcomingView } from './upcoming.js';
import { renderScriptureView } from './scripture.js';
import { renderSearchResults } from './search.js';

const DARK_MODE_KEY = 'notes_dark_mode';
const TEXT_SIZE_KEY = 'notes_text_size';
const TEXT_SIZES = { normal: '16px', large: '19px', largest: '23px' };

const mainEl = document.getElementById('main-content');
const lastUpdatedEl = document.getElementById('last-updated');

export const state = {
  username: null,
};

export function navigate(hash) {
  // Setting location.hash to its current value is a no-op in browsers (no
  // hashchange fires), but '' and '#/notebook' both render the same default
  // view as different strings — without this check, clicking "Notebook" while
  // already there triggers a genuine, redundant re-fetch+re-render that can
  // race with (and clobber) whatever the user is doing on the current page.
  if (window.location.hash === hash || (window.location.hash === '' && hash === '#/notebook')) return;
  window.location.hash = hash;
}

// Render-staleness guard: every navigation (or search) bumps this token.
// View modules capture it before their initial fetch and re-check it right
// before writing to the DOM — if a newer navigation happened while the fetch
// was in flight, the stale render bails out instead of clobbering the DOM a
// faster, more-recent render already produced. Without this, a slow response
// to an old view can land after a fast response to a newer one and silently
// overwrite it (easy to trigger by navigating quickly, or on flaky WiFi).
let renderToken = 0;
export function bumpRenderToken() {
  return ++renderToken;
}
export function currentRenderToken() {
  return renderToken;
}

export function setLastUpdated(isoDateStr) {
  if (!isoDateStr) {
    lastUpdatedEl.textContent = '';
    return;
  }
  const d = new Date(isoDateStr.replace(' ', 'T') + (isoDateStr.includes('Z') ? '' : 'Z'));
  if (isNaN(d.getTime())) {
    lastUpdatedEl.textContent = '';
    return;
  }
  const formatted = `${d.getMonth() + 1}/${d.getDate()}/${String(d.getFullYear()).slice(-2)}`;
  lastUpdatedEl.textContent = `Last updated ${formatted}`;
}

async function refreshInboxBadge() {
  try {
    const { count } = await api.get('/api/inbox/count');
    const badge = document.getElementById('inbox-badge');
    badge.textContent = count > 0 ? String(count) : '';
    badge.className = count > 0 ? 'badge-count' : '';
  } catch (e) {
    // not fatal — badge just stays blank
  }
}
window.refreshInboxBadge = refreshInboxBadge;

function parseHash() {
  const raw = window.location.hash.replace(/^#\/?/, '');
  return raw.split('/').filter(Boolean);
}

async function route() {
  bumpRenderToken();
  setLastUpdated(null);
  const segments = parseHash();

  try {
    if (segments[0] === 'inbox') {
      await renderInboxView(mainEl, segments);
    } else if (segments[0] === 'upcoming') {
      await renderUpcomingView(mainEl);
    } else if (segments[0] === 'scripture') {
      await renderScriptureView(mainEl, segments);
    } else {
      await renderNotebookView(mainEl, segments);
    }
  } catch (err) {
    if (err.status === 401) {
      showLogin();
      return;
    }
    mainEl.innerHTML = `<div class="error-text">Something went wrong: ${err.message}</div>`;
  }

  refreshInboxBadge();
}

let searchDebounce = null;
document.getElementById('search-input').addEventListener('input', (e) => {
  clearTimeout(searchDebounce);
  const q = e.target.value.trim();
  searchDebounce = setTimeout(async () => {
    if (!q) {
      route();
      return;
    }
    const myToken = bumpRenderToken();
    try {
      const results = await api.get(`/api/search?q=${encodeURIComponent(q)}`);
      if (myToken !== currentRenderToken()) return;
      renderSearchResults(mainEl, results, q);
    } catch (err) {
      if (err.status === 401) showLogin();
    }
  }, 250);
});

document.getElementById('nav-notebook').addEventListener('click', () => navigate('#/notebook'));
document.getElementById('nav-inbox').addEventListener('click', () => navigate('#/inbox'));
document.getElementById('nav-upcoming').addEventListener('click', () => navigate('#/upcoming'));
document.getElementById('nav-scripture').addEventListener('click', () => navigate('#/scripture'));

window.addEventListener('hashchange', route);

// ===== Dark mode =====
function applyDarkMode(on) {
  document.documentElement.classList.toggle('dark-mode', on);
  try { localStorage.setItem(DARK_MODE_KEY, on ? '1' : '0'); } catch (e) {}
  const btn = document.getElementById('darkModeBtn');
  btn.textContent = on ? '☀ Light Mode' : '☽ Dark Mode';
  btn.classList.toggle('active', on);
}
document.getElementById('darkModeBtn').addEventListener('click', () => {
  applyDarkMode(!document.documentElement.classList.contains('dark-mode'));
});
try {
  applyDarkMode(localStorage.getItem(DARK_MODE_KEY) === '1');
} catch (e) {
  applyDarkMode(false);
}

// ===== Text size =====
const SIZE_BTN_IDS = { normal: 'sizeNormalBtn', large: 'sizeLargeBtn', largest: 'sizeLargestBtn' };
function applyTextSize(size) {
  if (!TEXT_SIZES[size]) size = 'normal';
  document.documentElement.style.fontSize = TEXT_SIZES[size];
  try { localStorage.setItem(TEXT_SIZE_KEY, size); } catch (e) {}
  Object.values(SIZE_BTN_IDS).forEach((id) => document.getElementById(id).classList.remove('active'));
  document.getElementById(SIZE_BTN_IDS[size]).classList.add('active');
}
Object.keys(SIZE_BTN_IDS).forEach((size) => {
  document.getElementById(SIZE_BTN_IDS[size]).addEventListener('click', () => applyTextSize(size));
});
try {
  applyTextSize(localStorage.getItem(TEXT_SIZE_KEY) || 'normal');
} catch (e) {
  applyTextSize('normal');
}

// ===== Auth =====
function showLogin() {
  document.getElementById('login-screen').style.display = 'block';
  document.getElementById('app-screen').style.display = 'none';
}

function showApp() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app-screen').style.display = 'block';
  route();
}

document.getElementById('login-btn').addEventListener('click', login);
document.getElementById('login-password').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') login();
});

async function login() {
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;
  const errorEl = document.getElementById('login-error');
  errorEl.textContent = '';

  try {
    const result = await api.post('/api/auth/login', { username, password }, { allowUnauthenticated: true });
    state.username = result.username;
    showApp();
  } catch (err) {
    errorEl.textContent = err.message || 'Login failed';
  }
}

document.getElementById('logout-btn').addEventListener('click', async () => {
  await api.post('/api/auth/logout', undefined, { allowUnauthenticated: true });
  state.username = null;
  showLogin();
});

(async function init() {
  try {
    const me = await api.get('/api/auth/me', { allowUnauthenticated: true });
    if (me && me.username) {
      state.username = me.username;
      showApp();
      return;
    }
  } catch (e) {
    // fall through to login
  }
  showLogin();
})();
