# Bible Institute Notes

A local, notebook-style notes repository for Bible Institute class notes: Year → Semester → Class → Syllabus / Schedule / Sessions → Entries (notes, assignments, questions, other), with file/photo attachments, a quick-capture Inbox, full-text search, an automatic KJV scripture-reference index, and cross-class assignment tracking.

Runs entirely locally on your Windows PC — no cloud dependency, no external services.

## Setup

```
npm install
cp .env.example .env
```

Edit `.env` and set:
- `PORT` — the port to run on (e.g. `3000`)
- `SESSION_SECRET` — any long random string
- `ADMIN_USERNAME` / `ADMIN_PASSWORD` — the single login you'll use

Then:

```
npm run init-db
npm start
```

The server binds to `0.0.0.0`, so once it's running you can reach it from the same PC at `http://localhost:<PORT>`, and from your iPhone (or any device on the same WiFi network) at `http://<PC-local-IP>:<PORT>` — find your PC's local IP with `ipconfig` (look for the `IPv4 Address` under your active adapter).

### Windows Firewall

The first time you connect from your phone, Windows Firewall may block the inbound connection. If so, allow Node.js (or the specific port) through **Windows Defender Firewall → Allow an app through firewall**, for Private networks.

## Notes on decisions made without asking

The build brief said to make reasonable calls on ambiguous points rather than stop and ask, and to note them here:

- **No existing "kanban-app" or sibling backend to copy.** The brief asked the auth/session/upload pattern to match an existing "kanban-app," and the stack to match "existing projects" exactly. Neither `choir-vault` nor `bbcff-serv-sched` (the two sibling BBCFF repos) has any backend at all — both are static GitHub Pages sites with no server, database, or session auth. The Express + `express-session` + `better-sqlite3` + `multer` backend here was designed fresh from standard practice, not copied from anywhere.
- **Password hashing:** `bcryptjs` (pure JS), not native `bcrypt` — avoids requiring native build tools on Windows for a login path used by one person.
- **Sessions:** the default in-memory session store. This is a single-user, single-process local app — sessions reset if you restart the server (just log back in), which is a non-issue here. The login cookie lasts 30 days otherwise.
- **Search:** plain SQL `LIKE` across titles/bodies/filenames, not SQLite FTS5. Appropriate for one person's coursework; if the notebook ever grows very large, FTS5 is the natural upgrade path.
- **Reorder UI:** up/down buttons rather than drag-and-drop, for reliable behavior on both iPhone touch and desktop without an extra library.
- **Markdown rendering:** `marked.js` + `DOMPurify`, vendored into `public/js/vendor/` (not loaded from a CDN) so the app keeps working even if the PC's internet connection is briefly down.
- **Visual design tokens:** the brief's own token names (`--color-primary`, `--color-banner`) were a paraphrase of the actual sibling apps' CSS. This app uses the sibling apps' real token names (`--red`, `--red-deep`, `--banner-gray`, etc.) with the same values (`#A3313B` / `#B5B5B5`), for closer family consistency. The brief said "Source Sans Pro" for body text; Google has since renamed/replaced that family with "Source Sans 3," which is what the sibling apps actually use — this app follows the sibling apps.
- **localStorage keys:** `notes_dark_mode` (`'1'`/`'0'`) and `notes_text_size` (`'normal'|'large'|'largest'`), following the schedule app's naming convention (the brief specifically pointed to the schedule app for this behavior). Note this repo is a separate origin from `choir-vault` and `bbcff-serv-sched`, so preferences won't literally sync between apps — only the naming convention is shared.
- **Scripture reference schema:** added one nullable `chapter_end` column to `scripture_refs` (not in the brief's literal table) so cross-chapter ranges like "Romans 8:28–9:5" store their true end chapter instead of losing it. This only adds a column; nothing from the brief was removed or renamed.
- **Scripture matching:** a reference only fires when a book name/abbreviation is immediately followed by a chapter number (e.g. "John 3"). A bare book mention with no chapter (e.g. "read Romans this week") is never captured — several book names/abbreviations (Job, Acts, Judges...) are also ordinary English words, and indexing those would make the Scripture Index unreliable.
- **Session structure interpretation:** "individual classes where I can stick class-specific notes, assignments, questions" was interpreted as individual **class sessions** (one per class day/topic), each holding typed sub-entries (note/assignment/question/other) — matching the brief's own explicit file/data-model spec.

## Project structure

See `server.js`, `routes/`, `public/js/` for the backend and frontend respectively. The data model is in `db/schema.sql`.
