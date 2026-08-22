const express = require('express');
const { db } = require('../config/db');
const { reorder, nextSortOrder } = require('../lib/reorder');

const router = express.Router();

router.get('/years/:yearId/semesters', (req, res) => {
  const semesters = db
    .prepare('SELECT * FROM semesters WHERE year_id = ? ORDER BY sort_order')
    .all(req.params.yearId);
  res.json(semesters);
});

// Single-semester lookup by id (no year scope required) — used by the
// frontend to resolve a full year/semester/class breadcrumb starting from
// just a classId, e.g. when deep-linking from Search/Upcoming/Scripture Index.
router.get('/semesters/:id', (req, res) => {
  const semester = db.prepare('SELECT * FROM semesters WHERE id = ?').get(req.params.id);
  if (!semester) return res.status(404).json({ error: 'Not found' });
  res.json(semester);
});

router.post('/years/:yearId/semesters', (req, res) => {
  const { label } = req.body || {};
  if (!label) return res.status(400).json({ error: 'label is required' });

  const sortOrder = nextSortOrder(db, 'semesters', 'year_id', req.params.yearId);
  const result = db
    .prepare('INSERT INTO semesters (year_id, label, sort_order) VALUES (?, ?, ?)')
    .run(req.params.yearId, label, sortOrder);
  res.status(201).json(db.prepare('SELECT * FROM semesters WHERE id = ?').get(result.lastInsertRowid));
});

router.patch('/semesters/:id', (req, res) => {
  const { label } = req.body || {};
  if (!label) return res.status(400).json({ error: 'label is required' });

  db.prepare('UPDATE semesters SET label = ? WHERE id = ?').run(label, req.params.id);
  const updated = db.prepare('SELECT * FROM semesters WHERE id = ?').get(req.params.id);
  if (!updated) return res.status(404).json({ error: 'Not found' });
  res.json(updated);
});

router.patch('/semesters/:id/reorder', (req, res) => {
  const { direction } = req.body || {};
  if (direction !== 'up' && direction !== 'down') {
    return res.status(400).json({ error: 'direction must be "up" or "down"' });
  }
  const semester = db.prepare('SELECT * FROM semesters WHERE id = ?').get(req.params.id);
  if (!semester) return res.status(404).json({ error: 'Not found' });

  const moved = reorder(db, 'semesters', 'year_id', semester.year_id, req.params.id, direction);
  res.json({ moved });
});

router.delete('/semesters/:id', (req, res) => {
  db.prepare('DELETE FROM semesters WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
