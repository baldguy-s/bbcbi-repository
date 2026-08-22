const express = require('express');
const { db } = require('../config/db');
const { reorder, nextSortOrder } = require('../lib/reorder');

const router = express.Router();

router.get('/classes/:classId/sessions', (req, res) => {
  const sessions = db
    .prepare('SELECT * FROM sessions WHERE class_id = ? ORDER BY sort_order')
    .all(req.params.classId);
  res.json(sessions);
});

router.post('/classes/:classId/sessions', (req, res) => {
  const { session_date, topic } = req.body || {};

  const sortOrder = nextSortOrder(db, 'sessions', 'class_id', req.params.classId);
  const result = db
    .prepare('INSERT INTO sessions (class_id, session_date, topic, sort_order) VALUES (?, ?, ?, ?)')
    .run(req.params.classId, session_date || null, topic || '', sortOrder);
  res.status(201).json(db.prepare('SELECT * FROM sessions WHERE id = ?').get(result.lastInsertRowid));
});

router.get('/sessions/:id', (req, res) => {
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Not found' });

  const entries = db
    .prepare('SELECT * FROM entries WHERE session_id = ? ORDER BY created_at')
    .all(req.params.id);
  const files = db
    .prepare('SELECT * FROM files WHERE session_id = ? AND entry_id IS NULL')
    .all(req.params.id);

  res.json({ ...session, entries, files });
});

router.patch('/sessions/:id', (req, res) => {
  const { session_date, topic } = req.body || {};

  db.prepare('UPDATE sessions SET session_date = ?, topic = ? WHERE id = ?').run(
    session_date || null,
    topic || '',
    req.params.id
  );
  const updated = db.prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.id);
  if (!updated) return res.status(404).json({ error: 'Not found' });
  res.json(updated);
});

router.patch('/sessions/:id/reorder', (req, res) => {
  const { direction } = req.body || {};
  if (direction !== 'up' && direction !== 'down') {
    return res.status(400).json({ error: 'direction must be "up" or "down"' });
  }
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Not found' });

  const moved = reorder(db, 'sessions', 'class_id', session.class_id, req.params.id, direction);
  res.json({ moved });
});

router.delete('/sessions/:id', (req, res) => {
  db.prepare('DELETE FROM sessions WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
