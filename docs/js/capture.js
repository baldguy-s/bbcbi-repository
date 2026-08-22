import { api } from './api.js';
import { attachUploadWidget } from './upload.js';

// Quick Capture: a floating "+" available from every view (index.html), so a
// thought or photo can be saved without navigating away from whatever's on
// screen. Both note text and photos/files land in the Inbox — the same
// holding area & filing workflow inbox.js already provides — rather than
// inventing a second unfiled-content concept.
export function initQuickCapture() {
  const btn = document.getElementById('quick-capture-btn');
  const modal = document.getElementById('quick-capture-modal');
  const closeBtn = document.getElementById('quick-capture-close');
  const textarea = document.getElementById('quick-capture-text');
  const saveNoteBtn = document.getElementById('quick-capture-save-note');
  const statusEl = document.getElementById('quick-capture-note-status');
  const uploadEl = document.getElementById('quick-capture-upload');

  let uploadWidgetBuilt = false;

  function open() {
    modal.style.display = 'flex';
    if (!uploadWidgetBuilt) {
      attachUploadWidget(uploadEl, { inbox: 'true' }, {
        onUploaded: () => flashStatus('Saved to Inbox ✓'),
      });
      uploadWidgetBuilt = true;
    }
    textarea.focus();
  }
  function close() {
    modal.style.display = 'none';
    textarea.value = '';
    statusEl.classList.remove('visible');
  }
  function flashStatus(text) {
    statusEl.textContent = text;
    statusEl.classList.add('visible');
    clearTimeout(statusEl._fadeTimeout);
    statusEl._fadeTimeout = setTimeout(() => statusEl.classList.remove('visible'), 2000);
    if (window.refreshInboxBadge) window.refreshInboxBadge();
  }

  btn.addEventListener('click', open);
  closeBtn.addEventListener('click', close);
  modal.addEventListener('click', (ev) => {
    if (ev.target === modal) close();
  });
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && modal.style.display !== 'none') close();
  });

  saveNoteBtn.addEventListener('click', async () => {
    const text = textarea.value.trim();
    if (!text) return;
    const stamp = new Date();
    const filename = `Quick note ${stamp.toISOString().slice(0, 16).replace('T', ' ')}.txt`;
    const file = new File([text], filename, { type: 'text/plain' });
    const form = new FormData();
    form.append('files', file);
    form.append('inbox', 'true');
    saveNoteBtn.disabled = true;
    try {
      await api.post('/api/uploads', form);
      textarea.value = '';
      flashStatus('Saved to Inbox ✓');
    } finally {
      saveNoteBtn.disabled = false;
    }
  });
}
