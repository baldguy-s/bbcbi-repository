const express = require('express');
const { db } = require('../config/db');
const { reorder, nextSortOrder } = require('../lib/reorder');

const router = express.Router();

router.get('/semesters/:semesterId/classes', (req, res) => {
  const classes = db
    .prepare('SELECT * FROM classes WHERE semester_id = ? ORDER BY sort_order')
    .all(req.params.semesterId);
  res.json(classes);
});

router.post('/semesters/:semesterId/classes', (req, res) => {
  const { name, professor } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name is required' });

  const sortOrder = nextSortOrder(db, 'classes', 'semester_id', req.params.semesterId);
  const result = db
    .prepare('INSERT INTO classes (semester_id, name, professor, sort_order) VALUES (?, ?, ?, ?)')
    .run(req.params.semesterId, name, professor || null, sortOrder);
  res.status(201).json(db.prepare('SELECT * FROM classes WHERE id = ?').get(result.lastInsertRowid));
});

router.get('/classes/:id', (req, res) => {
  const cls = db.prepare('SELECT * FROM classes WHERE id = ?').get(req.params.id);
  if (!cls) return res.status(404).json({ error: 'Not found' });
  res.json(cls);
});

router.patch('/classes/:id', (req, res) => {
  const { name, professor } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name is required' });

  db.prepare('UPDATE classes SET name = ?, professor = ? WHERE id = ?').run(name, professor || null, req.params.id);
  const updated = db.prepare('SELECT * FROM classes WHERE id = ?').get(req.params.id);
  if (!updated) return res.status(404).json({ error: 'Not found' });
  res.json(updated);
});

router.patch('/classes/:id/reorder', (req, res) => {
  const { direction } = req.body || {};
  if (direction !== 'up' && direction !== 'down') {
    return res.status(400).json({ error: 'direction must be "up" or "down"' });
  }
  const cls = db.prepare('SELECT * FROM classes WHERE id = ?').get(req.params.id);
  if (!cls) return res.status(404).json({ error: 'Not found' });

  const moved = reorder(db, 'classes', 'semester_id', cls.semester_id, req.params.id, direction);
  res.json({ moved });
});

router.delete('/classes/:id', (req, res) => {
  db.prepare('DELETE FROM classes WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

router.get('/classes/:id/docs/:docType', (req, res) => {
  const { docType } = req.params;
  if (docType !== 'syllabus' && docType !== 'schedule') {
    return res.status(400).json({ error: 'docType must be "syllabus" or "schedule"' });
  }
  let doc = db
    .prepare('SELECT * FROM class_docs WHERE class_id = ? AND doc_type = ?')
    .get(req.params.id, docType);

  if (!doc) {
    const result = db
      .prepare(`INSERT INTO class_docs (class_id, doc_type, body_markdown) VALUES (?, ?, '')`)
      .run(req.params.id, docType);
    doc = db.prepare('SELECT * FROM class_docs WHERE id = ?').get(result.lastInsertRowid);
  }

  res.json(doc);
});

router.put('/classes/:id/docs/:docType', (req, res) => {
  const { docType } = req.params;
  if (docType !== 'syllabus' && docType !== 'schedule') {
    return res.status(400).json({ error: 'docType must be "syllabus" or "schedule"' });
  }
  const { body_markdown } = req.body || {};

  db.prepare(
    `INSERT INTO class_docs (class_id, doc_type, body_markdown, updated_at)
     VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(class_id, doc_type) DO UPDATE SET body_markdown = excluded.body_markdown, updated_at = excluded.updated_at`
  ).run(req.params.id, docType, body_markdown || '');

  const doc = db
    .prepare('SELECT * FROM class_docs WHERE class_id = ? AND doc_type = ?')
    .get(req.params.id, docType);
  res.json(doc);
});

module.exports = router;
