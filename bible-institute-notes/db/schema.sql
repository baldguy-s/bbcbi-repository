PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS years (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  label TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS semesters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  year_id INTEGER NOT NULL REFERENCES years(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS classes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  semester_id INTEGER NOT NULL REFERENCES semesters(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  professor TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS class_docs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  doc_type TEXT NOT NULL CHECK(doc_type IN ('syllabus','schedule')),
  body_markdown TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(class_id, doc_type)
);

CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  session_date TEXT,
  topic TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK(type IN ('note','assignment','question','other')),
  title TEXT NOT NULL DEFAULT '',
  body_markdown TEXT NOT NULL DEFAULT '',
  due_date TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_id INTEGER REFERENCES entries(id) ON DELETE CASCADE,
  class_doc_id INTEGER REFERENCES class_docs(id) ON DELETE CASCADE,
  session_id INTEGER REFERENCES sessions(id) ON DELETE CASCADE,
  inbox INTEGER NOT NULL DEFAULT 0,
  original_filename TEXT NOT NULL,
  stored_path TEXT NOT NULL,
  mime_type TEXT,
  size_bytes INTEGER,
  uploaded_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (
    (CASE WHEN entry_id IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN class_doc_id IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN session_id IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN inbox = 1 THEN 1 ELSE 0 END) = 1
  )
);

-- chapter_end is an additive deviation from the brief's literal schema: it lets
-- cross-chapter ranges (e.g. "Rom 8:28-9:5") store their true end chapter
-- instead of losing it. See README.
CREATE TABLE IF NOT EXISTS scripture_refs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_id INTEGER NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  book TEXT NOT NULL,
  chapter INTEGER NOT NULL,
  chapter_end INTEGER,
  verse_start INTEGER,
  verse_end INTEGER,
  raw_text TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_semesters_year ON semesters(year_id);
CREATE INDEX IF NOT EXISTS idx_classes_semester ON classes(semester_id);
CREATE INDEX IF NOT EXISTS idx_class_docs_class ON class_docs(class_id);
CREATE INDEX IF NOT EXISTS idx_sessions_class ON sessions(class_id);
CREATE INDEX IF NOT EXISTS idx_entries_session ON entries(session_id);
CREATE INDEX IF NOT EXISTS idx_entries_type_due ON entries(type, due_date);
CREATE INDEX IF NOT EXISTS idx_files_entry ON files(entry_id);
CREATE INDEX IF NOT EXISTS idx_files_class_doc ON files(class_doc_id);
CREATE INDEX IF NOT EXISTS idx_files_session ON files(session_id);
CREATE INDEX IF NOT EXISTS idx_files_inbox ON files(inbox);
CREATE INDEX IF NOT EXISTS idx_scripture_refs_entry ON scripture_refs(entry_id);
CREATE INDEX IF NOT EXISTS idx_scripture_refs_book ON scripture_refs(book);
