require('dotenv').config();
const bcrypt = require('bcryptjs');
const { db, initDb } = require('../config/db');

initDb();

const username = process.env.ADMIN_USERNAME;
const password = process.env.ADMIN_PASSWORD;

if (!username || !password) {
  console.error('ADMIN_USERNAME and ADMIN_PASSWORD must be set in .env before running init-db.');
  process.exit(1);
}

const existing = db.prepare('SELECT id FROM users LIMIT 1').get();

if (existing) {
  console.log('A user already exists — skipping seed (init-db is safe to re-run).');
} else {
  const passwordHash = bcrypt.hashSync(password, 10);
  db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run(username, passwordHash);
  console.log(`Created user "${username}". You can now run "npm start".`);
}
