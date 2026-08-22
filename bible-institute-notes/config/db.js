const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DB_PATH = path.join(__dirname, '..', 'db', 'notebook.sqlite');
const SCHEMA_PATH = path.join(__dirname, '..', 'db', 'schema.sql');

const db = new Database(DB_PATH);
db.pragma('foreign_keys = ON');

function initDb() {
  const row = db.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'users'"
  ).get();
  if (!row) {
    const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
    db.exec(schema);
  }
}

module.exports = { db, initDb };
