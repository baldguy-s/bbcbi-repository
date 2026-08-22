require('dotenv').config();
const path = require('path');
const express = require('express');
const session = require('express-session');

const { initDb } = require('./config/db');
const requireAuth = require('./middleware/requireAuth');

initDb();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '5mb' }));
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    },
  })
);

app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/auth', require('./routes/auth'));

app.use('/api/years', requireAuth, require('./routes/years'));
app.use('/api', requireAuth, require('./routes/semesters'));
app.use('/api', requireAuth, require('./routes/classes'));
app.use('/api', requireAuth, require('./routes/sessions'));
app.use('/api', requireAuth, require('./routes/entries'));
app.use('/api', requireAuth, require('./routes/uploads'));
app.use('/api/inbox', requireAuth, require('./routes/inbox'));
app.use('/api/search', requireAuth, require('./routes/search'));
app.use('/api/scripture', requireAuth, require('./routes/scripture'));

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`bible-institute-notes listening on http://0.0.0.0:${PORT}`);
});
