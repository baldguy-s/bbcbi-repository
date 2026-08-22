const express = require('express');
const { db } = require('../config/db');
const { extractRefs } = require('../lib/scriptureParser');

const router = express.Router();

const VALID_TYPES = ['note', 'assignment', 'question', 'other'];

function saveScriptureRefs(entryId, bodyMarkdown) {
  const refs = extractRefs(bodyMarkdown);
  const deleteStmt = db.prepare('DELETE FROM scripture_refs WHERE entry_id = ?');
  const insertStmt = db.prepare(
    `INSERT INTO scripture_refs (entry_id, book, chapter, chapter_end, verse_start, verse_end, raw_text)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  const tx = db.transaction(() => {
    deleteStmt.run(entryId);
    for (const ref of refs) {
      insertStmt.run(entryId, ref.book, ref.chapter, ref.chapterEnd, ref.verseStart, ref.verseEnd, ref.raw);
    }
  });
  tx();
}

router.get('/sessions/:sessionId/entries', (req, res) => {
  const { type } = req.query;
  if (type) {
    if (!VALID_TYPES.includes(type)) return res.status(400).json({ error: 'invalid type' });
    return res.json(
      db
        .prepare('SELECT * FROM entries WHERE session_id = ? AND type = ? ORDER BY created_at')
        .all(req.params.sessionId, type)
    );
  }
  res.json(
    db.prepare('SELECT * FROM entries WHERE session_id = ? ORDER BY created_at').all(req.params.sessionId)
  );
});

router.post('/sessions/:sessionId/entries', (req, res) => {
  const { type, title, body_markdown, due_date } = req.body || {};
  if (!VALID_TYPES.includes(type)) {
    return res.status(400).json({ error: `type must be one of: ${VALID_TYPES.join(', ')}` });
  }

  const result = db
    .prepare(
      `INSERT INTO entries (session_id, type, title, body_markdown, due_date, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
    )
    .run(req.params.sessionId, type, title || '', body_markdown || '', due_date || null);

  saveScriptureRefs(result.lastInsertRowid, body_markdown || '');

  res.status(201).json(db.prepare('SELECT * FROM entries WHERE id = ?').get(result.lastInsertRowid));
});

router.get('/entries/upcoming', (req, res) => {
  const rows = db
    .prepare(
      `SELECT e.*, s.topic AS session_topic, s.session_date,
              c.id AS class_id, c.name AS class_name,
              sem.id AS semester_id, sem.label AS semester_label,
              y.id AS year_id, y.label AS year_label
       FROM entries e
       JOIN sessions s ON s.id = e.session_id
       JOIN classes c ON c.id = s.class_id
       JOIN semesters sem ON sem.id = c.semester_id
       JOIN years y ON y.id = sem.year_id
       WHERE e.type = 'assignment' AND e.due_date IS NOT NULL
       ORDER BY e.due_date ASC`
    )
    .all();

  const today = new Date().toISOString().slice(0, 10);
  const withOverdue = rows.map((row) => ({ ...row, overdue: row.due_date < today }));
  res.json(withOverdue);
});

router.put('/entries/:id', (req, res) => {
  const { title, body_markdown, due_date } = req.body || {};

  db.prepare(
    `UPDATE entries SET title = ?, body_markdown = ?, due_date = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(title || '', body_markdown || '', due_date || null, req.params.id);

  const updated = db.prepare('SELECT * FROM entries WHERE id = ?').get(req.params.id);
  if (!updated) return res.status(404).json({ error: 'Not found' });

  saveScriptureRefs(req.params.id, body_markdown || '');

  res.json(updated);
});

router.delete('/entries/:id', (req, res) => {
  db.prepare('DELETE FROM entries WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
