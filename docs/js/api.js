// Drop-in replacement for the old Express-backed api.js. Same public shape
// (api.get/post/put/patch/del, same paths, same request/response shapes) so
// notebook.js/session.js/inbox.js/thisweek.js/admin.js/scripture.js/search.js/
// upload.js — all written against a real REST API originally — work
// unmodified against an in-memory tree persisted to this GitHub repo
// instead. See github.js for the actual GitHub REST calls.
import * as gh from './github.js';
import { extractRefs, bookSortIndex } from './scriptureParser.js';

const DB_PATH = 'data/notebook.json';

let DB = null;
let loadingPromise = null;

function emptyDb() {
  return {
    _nextId: 1,
    years: [],
    semesters: [],
    classes: [],
    class_docs: [],
    schedule_slots: [],
    sessions: [],
    entries: [],
    files: [],
  };
}

export async function initStore() {
  if (loadingPromise) return loadingPromise;
  loadingPromise = (async () => {
    const { json } = await gh.readJsonFile(DB_PATH);
    DB = json || emptyDb();
    // Backfill fields/tables added after the file was first created — the
    // live notebook.json predates schedule_slots and won't have it.
    if (!DB.schedule_slots) DB.schedule_slots = [];
    // Both must always run (not `||`, which would short-circuit and skip the
    // second migration once the first returns true) — each has independent
    // side effects that need to happen regardless of the other's result.
    const migratedFields = migrateProfessorToInstructor();
    const migratedDocs = migrateScheduleDocIntoSyllabus();
    if (migratedFields || migratedDocs) {
      await save('Migrate to instructor fields / combined syllabus doc');
    }
  })();
  return loadingPromise;
}

// One-time, idempotent migrations — safe to run on every load; each is a
// no-op once the data's already in the new shape. Persisted immediately if
// they actually changed anything, so this doesn't silently re-migrate in
// memory forever without ever committing the cleanup.
function migrateProfessorToInstructor() {
  let changed = false;
  for (const c of DB.classes) {
    if ('professor' in c) {
      c.instructor_name = c.professor;
      delete c.professor;
      changed = true;
    }
    if ('professor_email' in c) {
      c.instructor_email = c.professor_email;
      delete c.professor_email;
      changed = true;
    }
    if ('office_hours' in c) {
      delete c.office_hours;
      changed = true;
    }
    if (!c.instructor_custom_fields) {
      c.instructor_custom_fields = [];
      changed = true;
    }
  }
  return changed;
}

function migrateScheduleDocIntoSyllabus() {
  let changed = false;
  for (const cls of DB.classes) {
    const scheduleDoc = DB.class_docs.find((d) => d.class_id === cls.id && d.doc_type === 'schedule');
    if (!scheduleDoc) continue;
    if (scheduleDoc.body_markdown && scheduleDoc.body_markdown.trim()) {
      let syllabusDoc = DB.class_docs.find((d) => d.class_id === cls.id && d.doc_type === 'syllabus');
      if (!syllabusDoc) {
        syllabusDoc = { id: nextId(), class_id: cls.id, doc_type: 'syllabus', body_markdown: '', updated_at: null };
        DB.class_docs.push(syllabusDoc);
      }
      syllabusDoc.body_markdown = (syllabusDoc.body_markdown ? syllabusDoc.body_markdown + '\n\n' : '') + scheduleDoc.body_markdown;
      syllabusDoc.updated_at = nowIso();
    }
    DB.class_docs = DB.class_docs.filter((d) => d.id !== scheduleDoc.id);
    changed = true;
  }
  return changed;
}

async function save(message) {
  await gh.writeJsonFile(DB_PATH, DB, message);
}

function nextId() {
  return DB._nextId++;
}

function nowIso() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

// Local calendar date as YYYY-MM-DD. Deliberately NOT toISOString().slice(0,10)
// — that's UTC, which flips to the next day several hours early for any
// timezone west of UTC (e.g. ~8pm Eastern), making "due today"/"overdue"
// wrong in the evening for exactly the kind of local, single-user app this is.
function localIsoDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function nextSortOrder(list, scopeKey, scopeVal) {
  const scoped = scopeKey ? list.filter((x) => x[scopeKey] === scopeVal) : list;
  if (scoped.length === 0) return 0;
  return Math.max(...scoped.map((x) => x.sort_order ?? 0)) + 1;
}

function reorderList(list, scopeKey, scopeVal, id, direction) {
  const scoped = list
    .filter((x) => (scopeKey ? x[scopeKey] === scopeVal : true))
    .sort((a, b) => a.sort_order - b.sort_order);
  const idx = scoped.findIndex((x) => x.id === id);
  if (idx === -1) return false;
  const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= scoped.length) return false;
  const a = scoped[idx];
  const b = scoped[swapIdx];
  const tmp = a.sort_order;
  a.sort_order = b.sort_order;
  b.sort_order = tmp;
  return true;
}

function notFound() {
  const err = new Error('Not found');
  err.status = 404;
  return err;
}

function rawUrl(path) {
  const { owner, repo, branch } = gh.REPO_INFO;
  return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/docs/${path}`;
}

// ===== breadcrumb / join helpers =====
function classBreadcrumb(classId) {
  const cls = DB.classes.find((c) => c.id === classId);
  if (!cls) return null;
  const sem = DB.semesters.find((s) => s.id === cls.semester_id);
  const year = sem ? DB.years.find((y) => y.id === sem.year_id) : null;
  return {
    classId: cls.id,
    className: cls.name,
    semesterId: sem ? sem.id : null,
    semesterLabel: sem ? sem.label : '',
    semesterArchived: sem ? !!sem.archived : false,
    yearId: year ? year.id : null,
    yearLabel: year ? year.label : '',
  };
}

function sessionBreadcrumb(sessionId) {
  const session = DB.sessions.find((s) => s.id === sessionId);
  if (!session) return null;
  const cb = classBreadcrumb(session.class_id);
  return { sessionId: session.id, sessionTopic: session.topic, sessionDate: session.session_date, ...cb };
}

// ===== id-based param coercion (JSON ids are numbers) =====
const n = (v) => Number(v);

const routes = [];
function on(method, pattern, handler) {
  const keys = [];
  const regexStr = pattern.replace(/:[^/]+/g, (m) => {
    keys.push(m.slice(1));
    return '([^/]+)';
  });
  routes.push({ method, regex: new RegExp(`^${regexStr}$`), keys, handler });
}

// ---- years ----
on('GET', '/api/years', () => DB.years.slice().sort((a, b) => a.sort_order - b.sort_order));
on('POST', '/api/years', async (p, body) => {
  if (!body?.label) { const e = new Error('label is required'); e.status = 400; throw e; }
  const year = { id: nextId(), label: body.label, sort_order: nextSortOrder(DB.years) };
  DB.years.push(year);
  await save(`Add year "${year.label}"`);
  return year;
});
on('PATCH', '/api/years/:id', async (p, body) => {
  const year = DB.years.find((y) => y.id === n(p.id));
  if (!year) throw notFound();
  year.label = body.label;
  await save(`Rename year to "${year.label}"`);
  return year;
});
on('PATCH', '/api/years/:id/reorder', async (p, body) => {
  const moved = reorderList(DB.years, null, null, n(p.id), body.direction);
  if (moved) await save('Reorder years');
  return { moved };
});
on('DELETE', '/api/years/:id', async (p) => {
  const yearId = n(p.id);
  const semIds = DB.semesters.filter((s) => s.year_id === yearId).map((s) => s.id);
  const classIds = DB.classes.filter((c) => semIds.includes(c.semester_id)).map((c) => c.id);
  const sessionIds = DB.sessions.filter((s) => classIds.includes(s.class_id)).map((s) => s.id);
  const entryIds = DB.entries.filter((e) => sessionIds.includes(e.session_id)).map((e) => e.id);
  const docIds = DB.class_docs.filter((d) => classIds.includes(d.class_id)).map((d) => d.id);
  DB.files = DB.files.filter(
    (f) => !(entryIds.includes(f.entry_id) || sessionIds.includes(f.session_id) || docIds.includes(f.class_doc_id))
  );
  DB.entries = DB.entries.filter((e) => !sessionIds.includes(e.session_id));
  DB.sessions = DB.sessions.filter((s) => !sessionIds.includes(s.id));
  DB.class_docs = DB.class_docs.filter((d) => !docIds.includes(d.id));
  DB.schedule_slots = DB.schedule_slots.filter((sl) => !classIds.includes(sl.class_id));
  DB.classes = DB.classes.filter((c) => !classIds.includes(c.id));
  DB.semesters = DB.semesters.filter((s) => !semIds.includes(s.id));
  DB.years = DB.years.filter((y) => y.id !== yearId);
  await save('Delete year');
  return { ok: true };
});

// ---- semesters ----
on('GET', '/api/years/:yearId/semesters', (p) =>
  DB.semesters.filter((s) => s.year_id === n(p.yearId)).sort((a, b) => a.sort_order - b.sort_order)
);
on('POST', '/api/years/:yearId/semesters', async (p, body) => {
  if (!body?.label) { const e = new Error('label is required'); e.status = 400; throw e; }
  const yearId = n(p.yearId);
  const sem = {
    id: nextId(), year_id: yearId, label: body.label, sort_order: nextSortOrder(DB.semesters, 'year_id', yearId),
    archived: false,
  };
  DB.semesters.push(sem);
  await save(`Add semester "${sem.label}"`);
  return sem;
});
on('GET', '/api/semesters/:id', (p) => {
  const sem = DB.semesters.find((s) => s.id === n(p.id));
  if (!sem) throw notFound();
  return sem;
});
on('PATCH', '/api/semesters/:id', async (p, body) => {
  const sem = DB.semesters.find((s) => s.id === n(p.id));
  if (!sem) throw notFound();
  sem.label = body.label;
  await save(`Rename semester to "${sem.label}"`);
  return sem;
});
on('PATCH', '/api/semesters/:id/reorder', async (p, body) => {
  const sem = DB.semesters.find((s) => s.id === n(p.id));
  if (!sem) throw notFound();
  const moved = reorderList(DB.semesters, 'year_id', sem.year_id, sem.id, body.direction);
  if (moved) await save('Reorder semesters');
  return { moved };
});
on('PATCH', '/api/semesters/:id/archive', async (p, body) => {
  const sem = DB.semesters.find((s) => s.id === n(p.id));
  if (!sem) throw notFound();
  sem.archived = !!body.archived;
  await save(`${sem.archived ? 'Archive' : 'Unarchive'} semester "${sem.label}"`);
  return sem;
});
on('DELETE', '/api/semesters/:id', async (p) => {
  const semId = n(p.id);
  const classIds = DB.classes.filter((c) => c.semester_id === semId).map((c) => c.id);
  const sessionIds = DB.sessions.filter((s) => classIds.includes(s.class_id)).map((s) => s.id);
  const entryIds = DB.entries.filter((e) => sessionIds.includes(e.session_id)).map((e) => e.id);
  const docIds = DB.class_docs.filter((d) => classIds.includes(d.class_id)).map((d) => d.id);
  DB.files = DB.files.filter(
    (f) => !(entryIds.includes(f.entry_id) || sessionIds.includes(f.session_id) || docIds.includes(f.class_doc_id))
  );
  DB.entries = DB.entries.filter((e) => !sessionIds.includes(e.session_id));
  DB.sessions = DB.sessions.filter((s) => !sessionIds.includes(s.id));
  DB.class_docs = DB.class_docs.filter((d) => !docIds.includes(d.id));
  DB.schedule_slots = DB.schedule_slots.filter((sl) => !classIds.includes(sl.class_id));
  DB.classes = DB.classes.filter((c) => !classIds.includes(c.id));
  DB.semesters = DB.semesters.filter((s) => s.id !== semId);
  await save('Delete semester');
  return { ok: true };
});

// ---- classes ----
on('GET', '/api/semesters/:semesterId/classes', (p) =>
  DB.classes.filter((c) => c.semester_id === n(p.semesterId)).sort((a, b) => a.sort_order - b.sort_order)
);
on('POST', '/api/semesters/:semesterId/classes', async (p, body) => {
  if (!body?.name) { const e = new Error('name is required'); e.status = 400; throw e; }
  const semesterId = n(p.semesterId);
  const cls = {
    id: nextId(), semester_id: semesterId, name: body.name, instructor_name: body.instructor_name || null,
    instructor_email: body.instructor_email || null, instructor_custom_fields: [],
    start_date: body.start_date || null, end_date: body.end_date || null,
    sort_order: nextSortOrder(DB.classes, 'semester_id', semesterId),
  };
  DB.classes.push(cls);
  await save(`Add class "${cls.name}"`);
  return cls;
});
on('GET', '/api/classes/:id', (p) => {
  const cls = DB.classes.find((c) => c.id === n(p.id));
  if (!cls) throw notFound();
  return cls;
});
on('PATCH', '/api/classes/:id', async (p, body) => {
  const cls = DB.classes.find((c) => c.id === n(p.id));
  if (!cls) throw notFound();
  cls.name = body.name;
  cls.instructor_name = body.instructor_name || null;
  cls.instructor_email = body.instructor_email || null;
  cls.start_date = body.start_date || null;
  cls.end_date = body.end_date || null;
  if (Array.isArray(body.instructor_custom_fields)) {
    cls.instructor_custom_fields = body.instructor_custom_fields
      .filter((f) => f && f.label && f.label.trim())
      .map((f) => ({ label: f.label.trim(), value: (f.value || '').trim() }));
  }
  await save(`Update class "${cls.name}"`);
  return cls;
});
on('PATCH', '/api/classes/:id/reorder', async (p, body) => {
  const cls = DB.classes.find((c) => c.id === n(p.id));
  if (!cls) throw notFound();
  const moved = reorderList(DB.classes, 'semester_id', cls.semester_id, cls.id, body.direction);
  if (moved) await save('Reorder classes');
  return { moved };
});
on('DELETE', '/api/classes/:id', async (p) => {
  const classId = n(p.id);
  const sessionIds = DB.sessions.filter((s) => s.class_id === classId).map((s) => s.id);
  const entryIds = DB.entries.filter((e) => sessionIds.includes(e.session_id)).map((e) => e.id);
  const docIds = DB.class_docs.filter((d) => d.class_id === classId).map((d) => d.id);
  DB.files = DB.files.filter(
    (f) => !(entryIds.includes(f.entry_id) || sessionIds.includes(f.session_id) || docIds.includes(f.class_doc_id))
  );
  DB.entries = DB.entries.filter((e) => !sessionIds.includes(e.session_id));
  DB.sessions = DB.sessions.filter((s) => !sessionIds.includes(s.id));
  DB.class_docs = DB.class_docs.filter((d) => !docIds.includes(d.id));
  DB.schedule_slots = DB.schedule_slots.filter((sl) => sl.class_id !== classId);
  DB.classes = DB.classes.filter((c) => c.id !== classId);
  await save('Delete class');
  return { ok: true };
});
on('GET', '/api/classes/:id/docs/:docType', async (p) => {
  const classId = n(p.id);
  let doc = DB.class_docs.find((d) => d.class_id === classId && d.doc_type === p.docType);
  if (!doc) {
    doc = { id: nextId(), class_id: classId, doc_type: p.docType, body_markdown: '', updated_at: null };
    DB.class_docs.push(doc);
    await save(`Create ${p.docType} doc`);
  }
  return doc;
});
on('PUT', '/api/classes/:id/docs/:docType', async (p, body) => {
  const classId = n(p.id);
  let doc = DB.class_docs.find((d) => d.class_id === classId && d.doc_type === p.docType);
  if (!doc) {
    doc = { id: nextId(), class_id: classId, doc_type: p.docType, body_markdown: '', updated_at: null };
    DB.class_docs.push(doc);
  }
  doc.body_markdown = body.body_markdown || '';
  doc.updated_at = nowIso();
  await save(`Update ${p.docType}`);
  return doc;
});

// ---- class schedule (recurring day/time slots) ----
const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
on('GET', '/api/classes/:classId/schedule', (p) =>
  DB.schedule_slots
    .filter((sl) => sl.class_id === n(p.classId))
    .sort((a, b) => a.day_of_week - b.day_of_week || a.start_time.localeCompare(b.start_time))
);
on('POST', '/api/classes/:classId/schedule', async (p, body) => {
  const day = Number(body.day_of_week);
  if (!Number.isInteger(day) || day < 0 || day > 6) { const e = new Error('day_of_week must be 0-6 (Sun-Sat)'); e.status = 400; throw e; }
  if (!body.start_time || !body.end_time) { const e = new Error('start_time and end_time are required'); e.status = 400; throw e; }
  const slot = { id: nextId(), class_id: n(p.classId), day_of_week: day, start_time: body.start_time, end_time: body.end_time };
  DB.schedule_slots.push(slot);
  await save(`Add ${DAY_LABELS[day]} schedule slot`);
  return slot;
});
on('DELETE', '/api/schedule/:id', async (p) => {
  const slot = DB.schedule_slots.find((sl) => sl.id === n(p.id));
  if (!slot) throw notFound();
  DB.schedule_slots = DB.schedule_slots.filter((sl) => sl.id !== slot.id);
  await save('Remove schedule slot');
  return { ok: true };
});

// ---- sessions ----
on('GET', '/api/classes/:classId/sessions', (p) =>
  DB.sessions.filter((s) => s.class_id === n(p.classId)).sort((a, b) => a.sort_order - b.sort_order)
);
on('POST', '/api/classes/:classId/sessions', async (p, body) => {
  const classId = n(p.classId);
  const session = {
    id: nextId(), class_id: classId, session_date: body.session_date || null, topic: body.topic || '',
    sort_order: nextSortOrder(DB.sessions, 'class_id', classId),
  };
  DB.sessions.push(session);
  await save(`Add session "${session.topic}"`);
  return session;
});
on('GET', '/api/sessions/:id', (p) => {
  const session = DB.sessions.find((s) => s.id === n(p.id));
  if (!session) throw notFound();
  const entries = DB.entries.filter((e) => e.session_id === session.id).sort((a, b) => a.created_at.localeCompare(b.created_at));
  const files = DB.files.filter((f) => f.session_id === session.id && f.entry_id == null);
  return { ...session, entries, files };
});
on('PATCH', '/api/sessions/:id', async (p, body) => {
  const session = DB.sessions.find((s) => s.id === n(p.id));
  if (!session) throw notFound();
  session.session_date = body.session_date || null;
  session.topic = body.topic || '';
  await save(`Update session "${session.topic}"`);
  return session;
});
on('PATCH', '/api/sessions/:id/reorder', async (p, body) => {
  const session = DB.sessions.find((s) => s.id === n(p.id));
  if (!session) throw notFound();
  const moved = reorderList(DB.sessions, 'class_id', session.class_id, session.id, body.direction);
  if (moved) await save('Reorder sessions');
  return { moved };
});
on('DELETE', '/api/sessions/:id', async (p) => {
  const sessionId = n(p.id);
  const entryIds = DB.entries.filter((e) => e.session_id === sessionId).map((e) => e.id);
  DB.files = DB.files.filter((f) => !(entryIds.includes(f.entry_id) || f.session_id === sessionId));
  DB.entries = DB.entries.filter((e) => e.session_id !== sessionId);
  DB.sessions = DB.sessions.filter((s) => s.id !== sessionId);
  await save('Delete session');
  return { ok: true };
});

// ---- entries ----
const VALID_TYPES = ['note', 'assignment', 'question', 'other'];
on('GET', '/api/sessions/:sessionId/entries', (p, body, query) => {
  let list = DB.entries.filter((e) => e.session_id === n(p.sessionId));
  if (query.get('type')) list = list.filter((e) => e.type === query.get('type'));
  return list.sort((a, b) => a.created_at.localeCompare(b.created_at));
});
on('POST', '/api/sessions/:sessionId/entries', async (p, body) => {
  if (!VALID_TYPES.includes(body.type)) { const e = new Error(`type must be one of: ${VALID_TYPES.join(', ')}`); e.status = 400; throw e; }
  const now = nowIso();
  const entry = {
    id: nextId(), session_id: n(p.sessionId), type: body.type, title: body.title || '',
    body_markdown: body.body_markdown || '', due_date: body.due_date || null,
    grade: body.grade != null && body.grade !== '' ? Number(body.grade) : null,
    points_possible: body.points_possible != null && body.points_possible !== '' ? Number(body.points_possible) : null,
    created_at: now, updated_at: now,
  };
  DB.entries.push(entry);
  await save(`Add ${entry.type}: "${entry.title || '(untitled)'}"`);
  return entry;
});
on('GET', '/api/entries/upcoming', () => {
  const rows = DB.entries
    .filter((e) => e.type === 'assignment' && e.due_date)
    .map((e) => {
      const sb = sessionBreadcrumb(e.session_id) || {};
      return { ...e, session_topic: sb.sessionTopic, session_date: sb.sessionDate, class_id: sb.classId, class_name: sb.className, semester_id: sb.semesterId, semester_label: sb.semesterLabel, semester_archived: sb.semesterArchived, year_id: sb.yearId, year_label: sb.yearLabel };
    })
    .filter((r) => !r.semester_archived)
    .sort((a, b) => (a.due_date || '').localeCompare(b.due_date || ''));
  const today = localIsoDate(new Date());
  return rows.map((r) => ({ ...r, overdue: r.due_date < today }));
});
on('PUT', '/api/entries/:id', async (p, body) => {
  const entry = DB.entries.find((e) => e.id === n(p.id));
  if (!entry) throw notFound();
  entry.title = body.title || '';
  entry.body_markdown = body.body_markdown || '';
  entry.due_date = body.due_date || null;
  entry.grade = body.grade != null && body.grade !== '' ? Number(body.grade) : null;
  entry.points_possible = body.points_possible != null && body.points_possible !== '' ? Number(body.points_possible) : null;
  entry.updated_at = nowIso();
  await save(`Update entry "${entry.title || '(untitled)'}"`);
  return entry;
});
on('PATCH', '/api/entries/:id', async (p, body) => {
  // Lightweight partial update — used by Admin's due-date list, which only
  // ever touches due_date/grade/points_possible, not the entry's title/body.
  const entry = DB.entries.find((e) => e.id === n(p.id));
  if (!entry) throw notFound();
  if ('due_date' in body) entry.due_date = body.due_date || null;
  if ('grade' in body) entry.grade = body.grade != null && body.grade !== '' ? Number(body.grade) : null;
  if ('points_possible' in body) entry.points_possible = body.points_possible != null && body.points_possible !== '' ? Number(body.points_possible) : null;
  entry.updated_at = nowIso();
  await save(`Update due date/grade for "${entry.title || '(untitled)'}"`);
  return entry;
});
on('DELETE', '/api/entries/:id', async (p) => {
  const entryId = n(p.id);
  DB.files = DB.files.filter((f) => f.entry_id !== entryId);
  DB.entries = DB.entries.filter((e) => e.id !== entryId);
  await save('Delete entry');
  return { ok: true };
});

// ---- uploads ----
function targetFolder(body) {
  if (body.session_id) return `uploads/session-${body.session_id}`;
  if (body.class_doc_id) return `uploads/classdoc-${body.class_doc_id}`;
  if (body.entry_id) return `uploads/entry-${body.entry_id}`;
  if (body.inbox) return 'uploads/inbox';
  return 'uploads/misc';
}

async function handleUpload(p, body) {
  const entryId = body.entry_id ? n(body.entry_id) : null;
  const classDocId = body.class_doc_id ? n(body.class_doc_id) : null;
  const sessionId = body.session_id ? n(body.session_id) : null;
  const inbox = body.inbox ? 1 : 0;
  const count = [entryId, classDocId, sessionId, inbox === 1 ? 1 : null].filter((v) => v != null).length;
  if (count !== 1) { const e = new Error('Exactly one of entry_id, class_doc_id, session_id, or inbox must be provided'); e.status = 400; throw e; }
  const rawFiles = body.files;
  if (!rawFiles || rawFiles.length === 0) { const e = new Error('No files uploaded'); e.status = 400; throw e; }

  const folder = targetFolder(body);
  const prepared = await Promise.all(
    Array.from(rawFiles).map(async (file) => {
      const ext = file.name.includes('.') ? file.name.slice(file.name.lastIndexOf('.')) : '';
      const storedName = `${crypto.randomUUID()}${ext}`;
      const base64Content = await gh.fileToBase64(file);
      return { file, path: `${folder}/${storedName}`, base64Content };
    })
  );

  await gh.commitFiles(
    prepared.map((f) => ({ path: f.path, base64Content: f.base64Content })),
    `Upload ${prepared.length} file(s) to ${folder}`
  );

  const now = nowIso();
  const records = prepared.map((f) => ({
    id: nextId(), entry_id: entryId, class_doc_id: classDocId, session_id: sessionId, inbox,
    original_filename: f.file.name, path: f.path, mime_type: f.file.type || null, size_bytes: f.file.size,
    uploaded_at: now,
  }));
  DB.files.push(...records);
  await save(`Attach ${records.length} file(s)`);
  return records;
}

on('GET', '/api/entries/:entryId/files', (p) => DB.files.filter((f) => f.entry_id === n(p.entryId)));
on('GET', '/api/class-docs/:classDocId/files', (p) => DB.files.filter((f) => f.class_doc_id === n(p.classDocId)));
on('GET', '/api/sessions/:sessionId/files', (p) => DB.files.filter((f) => f.session_id === n(p.sessionId) && f.entry_id == null));
on('DELETE', '/api/uploads/:id', async (p) => {
  const file = DB.files.find((f) => f.id === n(p.id));
  if (!file) throw notFound();
  await gh.deleteFile(file.path, `Delete file "${file.original_filename}"`);
  DB.files = DB.files.filter((f) => f.id !== file.id);
  await save(`Remove file "${file.original_filename}"`);
  return { ok: true };
});

// ---- inbox ----
on('GET', '/api/inbox', () => DB.files.filter((f) => f.inbox === 1).sort((a, b) => b.uploaded_at.localeCompare(a.uploaded_at)));
on('GET', '/api/inbox/count', () => ({ count: DB.files.filter((f) => f.inbox === 1).length }));
on('PATCH', '/api/inbox/:fileId/file', async (p, body) => {
  const file = DB.files.find((f) => f.id === n(p.fileId) && f.inbox === 1);
  if (!file) throw notFound();
  const columnMap = { entry: 'entry_id', classDoc: 'class_doc_id', session: 'session_id' };
  const column = columnMap[body.target];
  if (!column || !body.targetId) { const e = new Error('target must be one of entry|classDoc|session, with targetId'); e.status = 400; throw e; }
  file[column] = n(body.targetId);
  file.inbox = 0;
  await save(`File "${file.original_filename}" into ${body.target}`);
  return file;
});

// ---- search ----
on('GET', '/api/search', (p, body, query) => {
  const q = (query.get('q') || '').trim().toLowerCase();
  if (!q) return { entries: [], docs: [], files: [] };
  const has = (str) => (str || '').toLowerCase().includes(q);

  const entries = DB.entries
    .filter((e) => {
      const sb = sessionBreadcrumb(e.session_id);
      if (!sb) return false;
      return has(e.title) || has(e.body_markdown) || has(sb.sessionTopic) || has(sb.className) || has(sb.semesterLabel) || has(sb.yearLabel);
    })
    .map((e) => {
      const sb = sessionBreadcrumb(e.session_id);
      return { resultType: 'entry', entryId: e.id, title: e.title, type: e.type, sessionId: sb.sessionId, sessionTopic: sb.sessionTopic, classId: sb.classId, className: sb.className, semesterLabel: sb.semesterLabel, yearLabel: sb.yearLabel };
    });

  const docs = DB.class_docs
    .filter((d) => has(d.body_markdown))
    .map((d) => {
      const cb = classBreadcrumb(d.class_id);
      return { resultType: 'doc', classDocId: d.id, docType: d.doc_type, classId: cb.classId, className: cb.className, semesterLabel: cb.semesterLabel, yearLabel: cb.yearLabel };
    });

  const files = DB.files
    .filter((f) => f.inbox !== 1 && has(f.original_filename))
    .map((f) => {
      let classId = null, sessionId = null, contextLabel = '';
      if (f.entry_id) {
        const e = DB.entries.find((en) => en.id === f.entry_id);
        const sb = e ? sessionBreadcrumb(e.session_id) : null;
        if (sb) { classId = sb.classId; sessionId = sb.sessionId; contextLabel = `${sb.className} — ${e.title || sb.sessionTopic || ''}`; }
      } else if (f.class_doc_id) {
        const d = DB.class_docs.find((cd) => cd.id === f.class_doc_id);
        const cb = d ? classBreadcrumb(d.class_id) : null;
        if (cb) { classId = cb.classId; contextLabel = cb.className; }
      } else if (f.session_id) {
        const sb = sessionBreadcrumb(f.session_id);
        if (sb) { classId = sb.classId; sessionId = sb.sessionId; contextLabel = `${sb.className} — ${sb.sessionTopic || ''}`; }
      }
      return { resultType: 'file', fileId: f.id, original_filename: f.original_filename, path: f.path, classId, sessionId, contextLabel };
    });

  return { entries, docs, files };
});

// ---- scripture ----
function allRefs() {
  const refs = [];
  for (const entry of DB.entries) {
    for (const ref of extractRefs(entry.body_markdown)) {
      refs.push({ ...ref, entry });
    }
  }
  return refs;
}

on('GET', '/api/scripture/books', () => {
  const books = [...new Set(allRefs().map((r) => r.book))];
  return books.sort((a, b) => bookSortIndex(a) - bookSortIndex(b));
});
on('GET', '/api/scripture/books/:book', (p) => {
  const book = decodeURIComponent(p.book);
  const refs = allRefs().filter((r) => r.book === book);
  const seen = new Set();
  const out = [];
  for (const r of refs) {
    const key = `${r.chapter}:${r.verseStart ?? ''}:${r.verseEnd ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ chapter: r.chapter, chapter_end: r.chapterEnd, verse_start: r.verseStart, verse_end: r.verseEnd, raw_text: r.raw });
  }
  return out.sort((a, b) => a.chapter - b.chapter || (a.verse_start ?? 0) - (b.verse_start ?? 0));
});
on('GET', '/api/scripture/books/:book/entries', (p, body, query) => {
  const book = decodeURIComponent(p.book);
  const chapter = query.get('chapter');
  const verse = query.get('verse');
  let refs = allRefs().filter((r) => r.book === book);
  if (chapter) refs = refs.filter((r) => String(r.chapter) === String(chapter));
  if (verse) {
    const v = Number(verse);
    refs = refs.filter((r) => r.verseStart === v || (r.verseStart != null && r.verseStart <= v && (r.verseEnd == null || r.verseEnd >= v)));
  }
  return refs.map((r) => {
    const sb = sessionBreadcrumb(r.entry.session_id);
    return {
      refId: `${r.entry.id}-${r.raw}`, book: r.book, chapter: r.chapter, chapter_end: r.chapterEnd,
      verse_start: r.verseStart, verse_end: r.verseEnd, raw_text: r.raw,
      entryId: r.entry.id, title: r.entry.title, type: r.entry.type,
      sessionId: sb?.sessionId, sessionTopic: sb?.sessionTopic,
      classId: sb?.classId, className: sb?.className, semesterLabel: sb?.semesterLabel, yearLabel: sb?.yearLabel,
    };
  });
});

// ---- admin: due-date management + grades + this-week dashboard ----

// Every assignment entry regardless of due_date (unlike /api/entries/upcoming,
// which only lists ones that already have one) — Admin needs to see and set
// dates on assignments that don't have one yet, not just edit existing ones.
on('GET', '/api/admin/assignments', () => {
  return DB.entries
    .filter((e) => e.type === 'assignment')
    .map((e) => {
      const sb = sessionBreadcrumb(e.session_id) || {};
      return {
        ...e, session_topic: sb.sessionTopic, class_id: sb.classId, class_name: sb.className,
        semester_id: sb.semesterId, semester_label: sb.semesterLabel, semester_archived: sb.semesterArchived,
        year_id: sb.yearId, year_label: sb.yearLabel,
      };
    })
    .filter((r) => !r.semester_archived)
    .sort((a, b) => {
      if (!a.due_date && !b.due_date) return a.class_name.localeCompare(b.class_name);
      if (!a.due_date) return 1;
      if (!b.due_date) return -1;
      return a.due_date.localeCompare(b.due_date);
    });
});

on('GET', '/api/classes/:id/grade-summary', (p) => {
  const classId = n(p.id);
  const sessionIds = DB.sessions.filter((s) => s.class_id === classId).map((s) => s.id);
  const graded = DB.entries.filter(
    (e) => sessionIds.includes(e.session_id) && e.type === 'assignment' && e.grade != null && e.points_possible
  );
  const totalEarned = graded.reduce((sum, e) => sum + e.grade, 0);
  const totalPossible = graded.reduce((sum, e) => sum + e.points_possible, 0);
  const assignmentCount = DB.entries.filter((e) => sessionIds.includes(e.session_id) && e.type === 'assignment').length;
  return {
    gradedCount: graded.length,
    assignmentCount,
    percent: totalPossible > 0 ? Math.round((totalEarned / totalPossible) * 1000) / 10 : null,
  };
});

on('GET', '/api/dashboard/this-week', () => {
  // Assignments now come from /api/entries/upcoming (the This Week view
  // shows that full list alongside this week's schedule, per the user
  // folding the old separate Upcoming tab into This Week) — this route only
  // needs to project the weekly class schedule onto real calendar dates.
  const today = new Date();
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    return { date: localIsoDate(d), dayOfWeek: d.getDay() };
  });

  const sessions = [];
  for (const day of days) {
    for (const slot of DB.schedule_slots) {
      if (slot.day_of_week !== day.dayOfWeek) continue;
      const cb = classBreadcrumb(slot.class_id);
      if (!cb || cb.semesterArchived) continue;
      sessions.push({
        date: day.date, dayLabel: DAY_LABELS[day.dayOfWeek], classId: cb.classId, className: cb.className,
        startTime: slot.start_time, endTime: slot.end_time,
      });
    }
  }
  sessions.sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));

  return { today: days[0].date, weekEnd: days[days.length - 1].date, sessions };
});

// Per-class assignments (for the combined Syllabus tab's "Assignments Due"
// section) — same shape as /api/entries/upcoming but scoped to one class and
// including assignments with no due date yet.
on('GET', '/api/classes/:id/assignments', (p) => {
  const classId = n(p.id);
  const sessionIds = DB.sessions.filter((s) => s.class_id === classId).map((s) => s.id);
  const today = localIsoDate(new Date());
  return DB.entries
    .filter((e) => e.type === 'assignment' && sessionIds.includes(e.session_id))
    .map((e) => {
      const sb = sessionBreadcrumb(e.session_id) || {};
      return { ...e, session_topic: sb.sessionTopic, overdue: !!(e.due_date && e.due_date < today) };
    })
    .sort((a, b) => {
      if (!a.due_date && !b.due_date) return 0;
      if (!a.due_date) return 1;
      if (!b.due_date) return -1;
      return a.due_date.localeCompare(b.due_date);
    });
});

async function request(method, fullPath, body) {
  await initStore();
  const [pathname, queryStr] = fullPath.split('?');
  const query = new URLSearchParams(queryStr || '');

  if (method === 'POST' && pathname === '/api/uploads') {
    const formBody = {};
    for (const [key, val] of body.entries()) {
      if (key === 'files') {
        formBody.files = formBody.files || [];
        formBody.files.push(val);
      } else {
        formBody[key] = val;
      }
    }
    return handleUpload({}, formBody);
  }

  for (const route of routes) {
    if (route.method !== method) continue;
    const match = pathname.match(route.regex);
    if (!match) continue;
    const params = {};
    route.keys.forEach((k, i) => (params[k] = match[i + 1]));
    return route.handler(params, body, query);
  }
  throw notFound();
}

export const api = {
  get: (path) => request('GET', path),
  post: (path, body) => request('POST', path, body),
  put: (path, body) => request('PUT', path, body),
  patch: (path, body) => request('PATCH', path, body),
  del: (path) => request('DELETE', path),
};

export function rawFileUrl(path) {
  return rawUrl(path);
}
