const express = require('express');
const { db } = require('../config/db');
const { bookSortIndex } = require('../lib/scriptureParser');

const router = express.Router();

router.get('/books', (req, res) => {
  const rows = db.prepare('SELECT DISTINCT book FROM scripture_refs').all();
  const books = rows.map((r) => r.book).sort((a, b) => bookSortIndex(a) - bookSortIndex(b));
  res.json(books);
});

router.get('/books/:book', (req, res) => {
  const refs = db
    .prepare(
      `SELECT DISTINCT chapter, chapter_end, verse_start, verse_end, raw_text
       FROM scripture_refs WHERE book = ? ORDER BY chapter, verse_start`
    )
    .all(req.params.book);
  res.json(refs);
});

router.get('/books/:book/entries', (req, res) => {
  const { chapter, verse } = req.query;

  let sql = `
    SELECT sr.id AS refId, sr.book, sr.chapter, sr.chapter_end, sr.verse_start, sr.verse_end, sr.raw_text,
           e.id AS entryId, e.title, e.type,
           s.id AS sessionId, s.topic AS sessionTopic,
           c.id AS classId, c.name AS className,
           sem.label AS semesterLabel, y.label AS yearLabel
    FROM scripture_refs sr
    JOIN entries e ON e.id = sr.entry_id
    JOIN sessions s ON s.id = e.session_id
    JOIN classes c ON c.id = s.class_id
    JOIN semesters sem ON sem.id = c.semester_id
    JOIN years y ON y.id = sem.year_id
    WHERE sr.book = ?
  `;
  const params = [req.params.book];

  if (chapter) {
    sql += ' AND sr.chapter = ?';
    params.push(chapter);
  }
  if (verse) {
    sql += ' AND (sr.verse_start = ? OR (sr.verse_start <= ? AND (sr.verse_end IS NULL OR sr.verse_end >= ?)))';
    params.push(verse, verse, verse);
  }

  sql += ' ORDER BY y.sort_order, sem.sort_order, c.sort_order, sr.chapter, sr.verse_start';

  res.json(db.prepare(sql).all(...params));
});

module.exports = router;
