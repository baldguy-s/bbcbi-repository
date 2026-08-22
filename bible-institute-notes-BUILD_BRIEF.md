# Bible Institute Notes Repository — Build Brief

Handoff spec for Claude Code. Build this without asking clarifying questions — every decision needed is captured below. If something is genuinely ambiguous, make the most reasonable call and note it in the README, don't stop and ask.

## 1. What this is

A local, notebook-style notes repository for Bible Institute class notes across every year and semester. Structure mirrors a physical notebook with tabbed dividers:

```
Year tab
  └─ Semester tab
       └─ Class tab
            ├─ Syllabus
            ├─ Schedule
            └─ Sessions (one per class day/topic)
                 ├─ Entries (multiple per session): notes, assignments, questions, other — each with markdown body + file attachments
                 └─ Files/photos attached directly to the session (not tied to a single entry) — also multiple, unlimited
```

**Assumption flagged for review:** "individual classes where I can stick class-specific notes, assignments, questions" is interpreted as individual **class sessions** (one entry per class day/topic), each of which holds typed sub-entries (note/assignment/question/other). If the intent was instead a flat list of typed entries directly under the Class tab with no session layer, that's a smaller schema change — flag it and it'll get adjusted.

## 2. Stack (must match existing projects exactly)

- **Backend:** Node.js + Express
- **Database:** SQLite (`better-sqlite3`)
- **Frontend:** Vanilla JS, no framework/build step
- **Auth:** Session-based, single user (matches kanban-app pattern)
- **File uploads:** `multer`, stored on disk, path referenced in DB
- **Hosting:** Runs locally on Windows, bound to `0.0.0.0` so it's reachable from iPhone over WiFi on the same network. Note in README: Windows Firewall must allow inbound on the chosen port.
- **No cloud dependency.** No external services. Fully self-contained.

## 3. File structure

```
bible-institute-notes/
├── server.js
├── package.json
├── .env.example
├── .gitignore                  # excludes .env, db/*.sqlite, uploads/
├── README.md
├── config/
│   └── db.js                   # SQLite connection + init
├── db/
│   ├── schema.sql
│   └── seed.js                 # creates single user from .env on first run
├── middleware/
│   └── requireAuth.js
├── routes/
│   ├── auth.js
│   ├── years.js
│   ├── semesters.js
│   ├── classes.js
│   ├── sessions.js
│   ├── entries.js
│   ├── uploads.js
│   ├── inbox.js
│   ├── search.js
│   └── scripture.js
├── lib/
│   └── scriptureParser.js      # regex-based KJV reference extraction
├── uploads/                     # gitignored; actual files live here
│   └── {classId}/{sessionId|inbox}/
└── public/
    ├── index.html
    ├── css/
    │   └── styles.css
    └── js/
        ├── app.js               # routing/state shell
        ├── notebook.js          # year/semester/class tab rendering
        ├── session.js           # session + entry CRUD UI
        ├── upload.js            # drag-drop + camera-capture upload widget
        ├── inbox.js
        ├── search.js
        └── scripture.js
```

## 4. Data model (SQLite)

```sql
users (id, username, password_hash)

years (id, label, sort_order)
semesters (id, year_id FK, label, sort_order)
classes (id, semester_id FK, name, professor, sort_order)

-- syllabus and schedule are one-per-class, stored directly on the class
class_docs (id, class_id FK, doc_type TEXT CHECK(doc_type IN ('syllabus','schedule')), body_markdown, updated_at)

sessions (id, class_id FK, session_date, topic, sort_order)

entries (id, session_id FK, type TEXT CHECK(type IN ('note','assignment','question','other')),
         title, body_markdown, due_date NULLABLE, created_at, updated_at)

files (id, entry_id FK NULLABLE, class_doc_id FK NULLABLE, session_id FK NULLABLE, inbox BOOLEAN DEFAULT 0,
       original_filename, stored_path, mime_type, size_bytes, uploaded_at)

scripture_refs (id, entry_id FK, book, chapter, verse_start, verse_end, raw_text)
```

Notes:
- `files.entry_id`, `files.class_doc_id`, `files.session_id`, and `files.inbox` are mutually exclusive — a file belongs to exactly one of: an entry, a syllabus/schedule doc, a session directly (photos/files not tied to any single entry), or the inbox awaiting filing.
- A session has no cap on entries or directly-attached files — the UI must support adding any number of either, in any order, at any time.
- `scripture_refs` rows are generated automatically when an entry's `body_markdown` is saved (see §6.3).

## 5. Core features

### 5.1 Notebook navigation
Tabbed UI: Year tabs across the top, Semester tabs nested inside, Class tabs nested inside those. Selecting a Class tab shows Syllabus / Schedule / Sessions as its own sub-tabs. Add/rename/delete/reorder at every level (year, semester, class, session). A Session holds an unlimited number of entries (notes, assignments, questions, other) plus files/photos attached directly to the session itself — never capped at one of each.

### 5.2 Add/edit in-app
Every text field (syllabus, schedule, entry body) is editable via a markdown textarea with live preview — not just an upload target. Files can be attached to any entry or doc in addition to typed text.

### 5.3 Quick upload
A persistent upload control (drag-and-drop zone + file picker + camera-capture on mobile) available from any Session or Entry view. Accepts multiple files/photos in a single action — multi-select file picker, multi-shot camera capture, multi-file drag-and-drop — never limited to one file at a time. Uploads attach to whatever is currently open: a Session directly, or a specific Entry. No separate "go to a form" step.

### 5.4 Quick-capture inbox
Global "Inbox" tab (sits outside the Year hierarchy). A file uploaded from the inbox's own upload button — including phone camera capture — lands here unfiled. From the inbox, each item can be filed into any Year → Semester → Class → Session/Entry in two taps. Inbox badge shows unfiled count.

### 5.5 Full-text search
Single search bar, always visible. Searches entry titles, entry/doc body text, session topics, class/semester/year labels, and original filenames. Results grouped by class, each result deep-links to the exact entry.

### 5.6 Scripture reference index
On save, `scriptureParser.js` scans `body_markdown` for KJV-style references (e.g. `John 3:16`, `Rom. 8:28-30`, `1 Cor 13:4-7`) using a full 66-book name/abbreviation table, and writes rows to `scripture_refs`. A dedicated "Scripture Index" view lists every book referenced anywhere in the repository; clicking a book/verse shows every entry that cites it, across all years. References render as inline links in the entry view that jump to that index.

### 5.7 Assignment tracking
Entries of type `assignment` get an optional `due_date`. A dedicated "Upcoming" view (accessible from the top nav, not buried in a class) lists all assignments across every class sorted by due date, with overdue ones visually flagged. This is the one view that cuts across the year/semester/class hierarchy by design.

### 5.8 Visual design — match the BBCFF apps
This must look like it belongs to the same family as the choir repository and the service scheduling app, not a generic admin tool.

**Brand tokens (reuse exactly, as CSS custom properties in `public/css/styles.css`):**
- `--font-display: 'Playfair Display'` for headers/titles
- `--font-body: 'Source Sans Pro'` for body text
- `--color-primary: #A3313B` (BBCFF red) — accents, active tabs, primary buttons
- `--color-banner: #B5B5B5` (banner gray) — secondary chrome, headers, dividers

**UI patterns to reuse from the schedule app:**
- Collapsible cards for Sessions within a Class view — same interaction as the schedule app's collapsible service cards
- Filter chips — entry-type filter (Note / Assignment / Question / Other) on the Session view; class/semester filter on Search and Scripture Index views — same chip styling as the schedule app's service-type filter chips
- Sticky text-size controls, same placement/behavior as the schedule app
- Dark/light mode toggle, applied app-wide, not per-page
- A "Last Updated" stamp on Class/Session views, matching the schedule app's public viewer pattern

Persist text-size and dark/light preference to `localStorage` using the same key names as the choir and schedule repos, for consistency of pattern — note in the README that this is a separate repo/origin, so the preference itself won't literally sync across apps, only the convention does.

## 6. Explicitly out of scope (phase 2, do not build now)

- Multi-user support / sharing
- Cloud sync or hosted deployment
- PDF/zip export of a class or semester
- OCR on uploaded photos
- Mobile app (this is a responsive web UI, not a native app)

## 7. Setup

```
npm install
cp .env.example .env         # set PORT, SESSION_SECRET, ADMIN_USERNAME, ADMIN_PASSWORD
npm run init-db              # runs schema.sql + seed.js
npm start                    # binds 0.0.0.0:PORT
```

README must include the Windows Firewall inbound-rule note and the LAN URL format (`http://<PC-local-IP>:<PORT>`) for reaching it from iPhone.

## 8. Acceptance checklist

- [ ] Can create/rename/reorder/delete a Year, Semester, and Class
- [ ] Class tab shows Syllabus, Schedule, and Sessions as sub-tabs
- [ ] Can add a Session and add note/assignment/question/other entries under it
- [ ] Can type and edit markdown directly in any doc/entry
- [ ] Can attach a file to any entry, doc, or the inbox from one persistent upload control
- [ ] Inbox holds unfiled uploads and files them into any location in ≤2 taps
- [ ] Search returns hits across titles, bodies, and filenames, grouped by class
- [ ] Scripture references in entry text are auto-detected, linked, and browsable by book in a Scripture Index view
- [ ] Assignments with due dates appear in a cross-class Upcoming view, overdue ones flagged
- [ ] Server binds to 0.0.0.0 and is reachable from iPhone over local WiFi
- [ ] A Session accepts multiple entries and multiple directly-attached files/photos — never capped at one of each
- [ ] Upload control accepts multiple files/photos in a single action (batch, not one-at-a-time)
- [ ] Visual design matches BBCFF brand: Playfair Display + Source Sans Pro, `#A3313B` / `#B5B5B5` palette
- [ ] Collapsible session cards, filter chips, sticky text-size control, dark/light toggle, and Last Updated stamp are present and styled consistently with the schedule app
