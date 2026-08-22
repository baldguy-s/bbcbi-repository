const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const { db } = require('../config/db');

const router = express.Router();
const UPLOADS_ROOT = path.join(__dirname, '..', 'uploads');

function resolveTargetDir(req) {
  const { session_id, entry_id, inbox } = req.body;
  if (inbox === 'true' || inbox === true) {
    return path.join(UPLOADS_ROOT, 'inbox');
  }
  // Files attached to an entry are still grouped under that entry's session
  // folder; class_doc uploads live under the class's own folder.
  if (session_id) return path.join(UPLOADS_ROOT, String(session_id));
  if (req.body.class_doc_id) return path.join(UPLOADS_ROOT, 'class-docs', String(req.body.class_doc_id));
  return path.join(UPLOADS_ROOT, 'misc');
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = resolveTargetDir(req);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});

const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

function targetColumns(body) {
  const entryId = body.entry_id ? Number(body.entry_id) : null;
  const classDocId = body.class_doc_id ? Number(body.class_doc_id) : null;
  const sessionId = body.session_id ? Number(body.session_id) : null;
  const inbox = body.inbox === 'true' || body.inbox === true ? 1 : 0;

  const targetCount = [entryId, classDocId, sessionId, inbox === 1 ? 1 : null].filter(
    (v) => v !== null
  ).length;

  return { entryId, classDocId, sessionId, inbox, valid: targetCount === 1 };
}

router.post('/uploads', upload.array('files'), (req, res) => {
  const { entryId, classDocId, sessionId, inbox, valid } = targetColumns(req.body || {});

  if (!valid) {
    return res
      .status(400)
      .json({ error: 'Exactly one of entry_id, class_doc_id, session_id, or inbox must be provided' });
  }
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No files uploaded' });
  }

  const insertStmt = db.prepare(
    `INSERT INTO files (entry_id, class_doc_id, session_id, inbox, original_filename, stored_path, mime_type, size_bytes, uploaded_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
  );

  const inserted = [];
  const tx = db.transaction(() => {
    for (const file of req.files) {
      const relativePath = path.relative(UPLOADS_ROOT, file.path).split(path.sep).join('/');
      const result = insertStmt.run(
        entryId,
        classDocId,
        sessionId,
        inbox,
        file.originalname,
        relativePath,
        file.mimetype,
        file.size
      );
      inserted.push(db.prepare('SELECT * FROM files WHERE id = ?').get(result.lastInsertRowid));
    }
  });
  tx();

  res.status(201).json(inserted);
});

router.get('/uploads/:id/download', (req, res) => {
  const file = db.prepare('SELECT * FROM files WHERE id = ?').get(req.params.id);
  if (!file) return res.status(404).json({ error: 'Not found' });

  const absolutePath = path.join(UPLOADS_ROOT, file.stored_path);
  res.download(absolutePath, file.original_filename);
});

router.delete('/uploads/:id', (req, res) => {
  const file = db.prepare('SELECT * FROM files WHERE id = ?').get(req.params.id);
  if (!file) return res.status(404).json({ error: 'Not found' });

  const absolutePath = path.join(UPLOADS_ROOT, file.stored_path);
  fs.unlink(absolutePath, () => {});
  db.prepare('DELETE FROM files WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

router.get('/entries/:entryId/files', (req, res) => {
  res.json(db.prepare('SELECT * FROM files WHERE entry_id = ?').all(req.params.entryId));
});

router.get('/class-docs/:classDocId/files', (req, res) => {
  res.json(db.prepare('SELECT * FROM files WHERE class_doc_id = ?').all(req.params.classDocId));
});

router.get('/sessions/:sessionId/files', (req, res) => {
  res.json(
    db
      .prepare('SELECT * FROM files WHERE session_id = ? AND entry_id IS NULL')
      .all(req.params.sessionId)
  );
});

module.exports = router;
