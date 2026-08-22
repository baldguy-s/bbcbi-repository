const express = require('express');
const { db } = require('../config/db');

const router = express.Router();

router.get('/', (req, res) => {
  const items = db.prepare('SELECT * FROM files WHERE inbox = 1 ORDER BY uploaded_at DESC').all();
  res.json(items);
});

router.get('/count', (req, res) => {
  const row = db.prepare('SELECT COUNT(*) AS count FROM files WHERE inbox = 1').get();
  res.json({ count: row.count });
});

router.patch('/:fileId/file', (req, res) => {
  const { target, targetId } = req.body || {};
  const validTargets = { entry: 'entry_id', classDoc: 'class_doc_id', session: 'session_id' };

  if (!validTargets[target] || !targetId) {
    return res.status(400).json({ error: 'target must be one of entry|classDoc|session, with targetId' });
  }

  const file = db.prepare('SELECT * FROM files WHERE id = ? AND inbox = 1').get(req.params.fileId);
  if (!file) return res.status(404).json({ error: 'Inbox item not found' });

  const column = validTargets[target];
  db.prepare(`UPDATE files SET ${column} = ?, inbox = 0 WHERE id = ?`).run(targetId, req.params.fileId);

  res.json(db.prepare('SELECT * FROM files WHERE id = ?').get(req.params.fileId));
});

module.exports = router;
