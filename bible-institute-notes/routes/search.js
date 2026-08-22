const express = require('express');
const { db } = require('../config/db');

const router = express.Router();

router.get('/', (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.json([]);

  const like = `%${q}%`;

  const entryHits = db
    .prepare(
      `SELECT 'entry' AS resultType, e.id AS entryId, e.title, e.type, s.id AS sessionId, s.topic AS sessionTopic,
              c.id AS classId, c.name AS className, sem.label AS semesterLabel, y.label AS yearLabel
       FROM entries e
       JOIN sessions s ON s.id = e.session_id
       JOIN classes c ON c.id = s.class_id
       JOIN semesters sem ON sem.id = c.semester_id
       JOIN years y ON y.id = sem.year_id
       WHERE e.title LIKE ? COLLATE NOCASE OR e.body_markdown LIKE ? COLLATE NOCASE
          OR s.topic LIKE ? COLLATE NOCASE OR c.name LIKE ? COLLATE NOCASE
          OR sem.label LIKE ? COLLATE NOCASE OR y.label LIKE ? COLLATE NOCASE`
    )
    .all(like, like, like, like, like, like);

  const docHits = db
    .prepare(
      `SELECT 'doc' AS resultType, cd.id AS classDocId, cd.doc_type AS docType, c.id AS classId, c.name AS className,
              sem.label AS semesterLabel, y.label AS yearLabel
       FROM class_docs cd
       JOIN classes c ON c.id = cd.class_id
       JOIN semesters sem ON sem.id = c.semester_id
       JOIN years y ON y.id = sem.year_id
       WHERE cd.body_markdown LIKE ? COLLATE NOCASE`
    )
    .all(like);

  const fileHits = db
    .prepare(
      `SELECT 'file' AS resultType, f.id AS fileId, f.original_filename, f.entry_id AS entryId,
              f.class_doc_id AS classDocId, f.session_id AS sessionId
       FROM files f
       WHERE f.original_filename LIKE ? COLLATE NOCASE`
    )
    .all(like);

  res.json({ entries: entryHits, docs: docHits, files: fileHits });
});

module.exports = router;
