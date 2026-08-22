import { api } from './api.js';
import { escapeHtml } from './util.js';

export function renderFileChips(files) {
  if (!files || files.length === 0) return '';
  return `<div class="file-chip-list">${files
    .map(
      (f) => `
        <span class="file-chip" data-file-id="${f.id}">
          <a href="/api/uploads/${f.id}/download" target="_blank" rel="noopener">${escapeHtml(f.original_filename)}</a>
          <button type="button" class="file-delete-btn" data-file-id="${f.id}" title="Remove file">&times;</button>
        </span>`
    )
    .join('')}</div>`;
}

// Renders a persistent upload control (drag-drop + file picker + mobile
// camera capture) into `container`, attached to whatever `target` identifies
// (exactly one of entry_id / class_doc_id / session_id / inbox=true — mirrors
// the mutual-exclusivity rule enforced server-side on the files table).
export function attachUploadWidget(container, target, { onUploaded } = {}) {
  const zoneId = `upload-zone-${Math.random().toString(36).slice(2)}`;
  const inputId = `${zoneId}-input`;

  container.insertAdjacentHTML(
    'beforeend',
    `<div class="upload-zone" id="${zoneId}">
       Drag files here, or
       <label for="${inputId}" style="text-decoration:underline;cursor:pointer;">choose files</label>
       <input type="file" id="${inputId}" multiple accept="image/*,application/pdf,.doc,.docx,.txt,.md" capture="environment" style="display:none">
     </div>`
  );

  const zone = container.querySelector(`#${zoneId}`);
  const input = container.querySelector(`#${inputId}`);

  async function upload(fileList) {
    if (!fileList || fileList.length === 0) return;
    const form = new FormData();
    for (const file of fileList) form.append('files', file);
    Object.entries(target).forEach(([key, value]) => form.append(key, value));

    zone.textContent = 'Uploading...';
    try {
      const uploaded = await api.post('/api/uploads', form);
      if (onUploaded) onUploaded(uploaded);
    } finally {
      zone.innerHTML = `Drag files here, or
       <label for="${inputId}" style="text-decoration:underline;cursor:pointer;">choose files</label>
       <input type="file" id="${inputId}" multiple accept="image/*,application/pdf,.doc,.docx,.txt,.md" capture="environment" style="display:none">`;
      container.querySelector(`#${inputId}`).addEventListener('change', (e) => upload(e.target.files));
    }
  }

  input.addEventListener('change', (e) => upload(e.target.files));

  zone.addEventListener('dragover', (e) => {
    e.preventDefault();
    zone.classList.add('dragover');
  });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('dragover');
    upload(e.dataTransfer.files);
  });
}

// Event-delegation handler for file-chip delete buttons; attach once per
// container that renders file chips.
export function attachFileDeleteHandler(container, onDeleted) {
  container.addEventListener('click', async (ev) => {
    const btn = ev.target.closest('.file-delete-btn');
    if (!btn) return;
    const fileId = btn.getAttribute('data-file-id');
    if (!confirm('Remove this file?')) return;
    await api.del(`/api/uploads/${fileId}`);
    if (onDeleted) onDeleted(fileId);
  });
}
