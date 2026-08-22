const express = require('express');
const { db } = require('../config/db');
const { reorder, nextSortOrder } = require('../lib/reorder');

const router = express.Router();

// years have no real "scope" (there's only one notebook) — no scope column.
const SCOPE_COLUMN = null;
const SCOPE_VALUE = null;

router.get('/', (req, res) => {
  const years = db.prepare('SELECT * FROM years ORDER BY sort_order').all();
  res.json(years);
});

router.post('/', (req, res) => {
  const { label } = req.body || {};
  if (!label) return res.status(400).json({ error: 'label is required' });

  const sortOrder = nextSortOrder(db, 'years', SCOPE_COLUMN, SCOPE_VALUE);
  const result = db.prepare('INSERT INTO years (label, sort_order) VALUES (?, ?)').run(label, sortOrder);
  res.status(201).json(db.prepare('SELECT * FROM years WHERE id = ?').get(result.lastInsertRowid));
});

router.patch('/:id', (req, res) => {
  const { label } = req.body || {};
  if (!label) return res.status(400).json({ error: 'label is required' });

  db.prepare('UPDATE years SET label = ? WHERE id = ?').run(label, req.params.id);
  const updated = db.prepare('SELECT * FROM years WHERE id = ?').get(req.params.id);
  if (!updated) return res.status(404).json({ error: 'Not found' });
  res.json(updated);
});

router.patch('/:id/reorder', (req, res) => {
  const { direction } = req.body || {};
  if (direction !== 'up' && direction !== 'down') {
    return res.status(400).json({ error: 'direction must be "up" or "down"' });
  }
  const moved = reorder(db, 'years', SCOPE_COLUMN, SCOPE_VALUE, req.params.id, direction);
  res.json({ moved });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM years WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
