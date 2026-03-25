import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import sqlite3 from 'sqlite3';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import cookieParser from 'cookie-parser';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3017;
const JWT_SECRET = process.env.JWT_SECRET || 'typero_dev_secret_change_me';
const DB_PATH = path.join(__dirname, 'data', 'typero.db');

const db = new sqlite3.Database(DB_PATH);

const run = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) return reject(err);
      resolve(this);
    });
  });

const get = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });

const all = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });

const initDb = async () => {
  await run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      mode TEXT NOT NULL,
      strict_mode INTEGER NOT NULL,
      timer_seconds INTEGER,
      include_letters INTEGER NOT NULL,
      include_numbers INTEGER NOT NULL,
      include_symbols INTEGER NOT NULL,
      source_type TEXT NOT NULL,
      source_label TEXT,
      duration_seconds REAL NOT NULL,
      gross_wpm REAL NOT NULL,
      net_wpm REAL NOT NULL,
      cpm REAL NOT NULL,
      accuracy REAL NOT NULL,
      total_chars INTEGER NOT NULL,
      correct_chars INTEGER NOT NULL,
      mistake_count INTEGER NOT NULL,
      peak_wpm REAL NOT NULL,
      performance_series_json TEXT NOT NULL,
      category_stats_json TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id)
    )
  `);
};

const authOptional = async (req, _res, next) => {
  const token = req.cookies.typero_token;
  if (!token) {
    req.user = null;
    return next();
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = await get('SELECT id, username FROM users WHERE id = ?', [payload.userId]);
    req.user = user || null;
    next();
  } catch {
    req.user = null;
    next();
  }
};

const authRequired = async (req, res, next) => {
  const token = req.cookies.typero_token;
  if (!token) return res.status(401).json({ error: 'Login required' });

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = await get('SELECT id, username FROM users WHERE id = ?', [payload.userId]);
    if (!user) return res.status(401).json({ error: 'Invalid session' });
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid session' });
  }
};

app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());
app.use(authOptional);
app.get('/favicon.ico', (_req, res) => res.redirect(301, '/favicon.svg'));
app.use(express.static(path.join(__dirname, 'public')));

const pages = ['guide', 'about', 'privacy', 'login', 'profile', 'results', 'typing'];
pages.forEach((p) => {
  app.get(`/${p}`, (_req, res) => res.sendFile(path.join(__dirname, 'public', `${p}.html`)));
});
app.get('/', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.post('/api/auth/register', async (req, res) => {
  const username = String(req.body?.username || '').trim();
  const password = String(req.body?.password || '');

  if (username.length < 3 || password.length < 6) {
    return res.status(400).json({ error: 'Username min 3 chars, password min 6 chars.' });
  }

  const existing = await get('SELECT id FROM users WHERE username = ?', [username]);
  if (existing) return res.status(409).json({ error: 'Username already exists.' });

  const hash = await bcrypt.hash(password, 10);
  const result = await run('INSERT INTO users (username, password_hash) VALUES (?, ?)', [username, hash]);
  const token = jwt.sign({ userId: result.lastID }, JWT_SECRET, { expiresIn: '30d' });

  res.cookie('typero_token', token, { httpOnly: true, sameSite: 'lax', maxAge: 30 * 24 * 3600 * 1000 });
  return res.json({ ok: true, user: { id: result.lastID, username } });
});

app.post('/api/auth/login', async (req, res) => {
  const username = String(req.body?.username || '').trim();
  const password = String(req.body?.password || '');

  const user = await get('SELECT id, username, password_hash FROM users WHERE username = ?', [username]);
  if (!user) return res.status(401).json({ error: 'Invalid credentials.' });

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Invalid credentials.' });

  const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '30d' });
  res.cookie('typero_token', token, { httpOnly: true, sameSite: 'lax', maxAge: 30 * 24 * 3600 * 1000 });
  return res.json({ ok: true, user: { id: user.id, username: user.username } });
});

app.post('/api/auth/logout', (_req, res) => {
  res.clearCookie('typero_token');
  return res.json({ ok: true });
});

app.get('/api/auth/me', (req, res) => {
  return res.json({ user: req.user ? { id: req.user.id, username: req.user.username } : null });
});

app.post('/api/sessions', async (req, res) => {
  const b = req.body || {};
  if (!Array.isArray(b.performanceSeries) || typeof b.categoryStats !== 'object') {
    return res.status(400).json({ error: 'Invalid payload.' });
  }

  const result = await run(
    `INSERT INTO sessions (
      user_id, mode, strict_mode, timer_seconds, include_letters, include_numbers, include_symbols,
      source_type, source_label, duration_seconds, gross_wpm, net_wpm, cpm, accuracy,
      total_chars, correct_chars, mistake_count, peak_wpm, performance_series_json, category_stats_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      req.user?.id || null,
      String(b.mode || 'timed'),
      b.strictMode ? 1 : 0,
      Number.isFinite(b.timerSeconds) ? b.timerSeconds : null,
      b.includeLetters ? 1 : 0,
      b.includeNumbers ? 1 : 0,
      b.includeSymbols ? 1 : 0,
      String(b.sourceType || 'dataset'),
      String(b.sourceLabel || ''),
      Number(b.durationSeconds || 0),
      Number(b.grossWpm || 0),
      Number(b.netWpm || 0),
      Number(b.cpm || 0),
      Number(b.accuracy || 0),
      Number(b.totalChars || 0),
      Number(b.correctChars || 0),
      Number(b.mistakeCount || 0),
      Number(b.peakWpm || 0),
      JSON.stringify(b.performanceSeries || []),
      JSON.stringify(b.categoryStats || {}),
    ]
  );

  return res.json({ ok: true, id: result.lastID });
});

app.get('/api/sessions/mine', authRequired, async (req, res) => {
  const rows = await all(
    `SELECT id, mode, strict_mode, timer_seconds, source_type, source_label, duration_seconds,
      gross_wpm, net_wpm, cpm, accuracy, total_chars, correct_chars, mistake_count, peak_wpm, created_at
     FROM sessions
     WHERE user_id = ?
     ORDER BY id DESC
     LIMIT 100`,
    [req.user.id]
  );
  return res.json({ items: rows });
});

app.get('/api/sessions/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid session id.' });

  const row = await get('SELECT * FROM sessions WHERE id = ?', [id]);
  if (!row) return res.status(404).json({ error: 'Session not found.' });

  if (row.user_id && (!req.user || req.user.id !== row.user_id)) {
    return res.status(403).json({ error: 'Not allowed.' });
  }

  return res.json({
    ...row,
    strict_mode: !!row.strict_mode,
    include_letters: !!row.include_letters,
    include_numbers: !!row.include_numbers,
    include_symbols: !!row.include_symbols,
    performance_series: JSON.parse(row.performance_series_json),
    category_stats: JSON.parse(row.category_stats_json),
  });
});

app.get('/api/profile/stats', authRequired, async (req, res) => {
  const heatmap = await all(
    `SELECT DATE(created_at) as date,
            SUM(correct_chars) as chars,
            COUNT(*) as sessions,
            MAX(net_wpm) as best_wpm,
            AVG(net_wpm) as avg_wpm
     FROM sessions WHERE user_id = ?
     AND created_at >= DATE('now', '-365 days')
     GROUP BY DATE(created_at)
     ORDER BY date ASC`,
    [req.user.id]
  );
  const totals = await get(
    `SELECT COUNT(*) as total_sessions,
            SUM(correct_chars) as total_chars,
            MAX(net_wpm) as best_wpm,
            MAX(peak_wpm) as best_peak,
            MAX(accuracy) as best_acc,
            AVG(accuracy) as avg_accuracy
     FROM sessions WHERE user_id = ?`,
    [req.user.id]
  );

  // Streak: consecutive days with sessions ending at today (or yesterday)
  const dates = await all(
    `SELECT DISTINCT DATE(created_at) as date FROM sessions WHERE user_id = ? ORDER BY date DESC`,
    [req.user.id]
  );
  const dateSet = new Set(dates.map((d) => d.date));
  let streak = 0;
  const d = new Date();
  const todayStr = d.toISOString().slice(0, 10);
  if (!dateSet.has(todayStr)) d.setDate(d.getDate() - 1);
  for (let i = 0; i < 366; i++) {
    if (dateSet.has(d.toISOString().slice(0, 10))) {
      streak++;
      d.setDate(d.getDate() - 1);
    } else {
      break;
    }
  }

  return res.json({
    username: req.user.username,
    heatmap: heatmap.map((r) => ({
      date: r.date,
      words: Math.round((r.chars || 0) / 5),
      sessions: r.sessions,
      bestWpm: Math.round(r.best_wpm || 0),
      avgWpm: Math.round(r.avg_wpm || 0),
    })),
    totals: {
      sessions: totals?.total_sessions || 0,
      words: Math.round((totals?.total_chars || 0) / 5),
      bestWpm: Math.round(totals?.best_wpm || 0),
      bestPeak: Math.round(totals?.best_peak || 0),
      bestAccuracy: Math.round(totals?.best_acc || 0),
      avgAccuracy: Math.round(totals?.avg_accuracy || 0),
    },
    streak,
  });
});

app.get('/api/dataset/default', (_req, res) => {
  const passages = [
    'It was the best of times, it was the worst of times, it was the age of wisdom, and it was the age of wonder.',
    'Call me Ishmael. Some years ago, never mind how long precisely, I found myself wandering the old docks.',
    'A truth universally acknowledged must be paired with patience, balance, and disciplined thought.',
    'Happy families are all alike; every unhappy family is unhappy in its own way, and in its own weather.',
    "Ships at a distance have every person's wish on board, and every wish arrives with a price.",
    'The sky above the port was the color of a tuned screen, dim and silver at midnight.',
    'In the beginning there was only a room, a lamp, a desk, and one careful sentence.',
    'The sea was calm, but the maps were loud with names and forgotten roads.',
    'He paused, listened, and wrote as if each word had to earn its place.',
    'No one expected the storm to pass so quickly, yet the ground remained wet for days.',
    'Across the valley, bells rang once and then returned to silence.',
    'The train arrived at dawn, carrying letters tied with blue thread.',
    'Every page began with confidence and ended with a quiet revision.',
    'She walked through the market counting steps, colors, and voices.',
    'The city kept its promises only to those who kept moving.',
    'By noon the archive smelled like dust, ink, and rain-soaked wood.',
    'A small fire burned in the stove while snow erased the road outside.',
    'When the signal finally appeared, the room erupted in relieved laughter.',
    'It is a curious task to build speed without losing precision.',
    'Practice turns confusion into rhythm, and rhythm into clear momentum.',
    'He measured progress not by noise, but by steady repetition done well.',
    'Time reveals structure, and structure reveals hidden mistakes.',
    'At the edge of the map, the paper curled and the compass trembled.',
    'The old library opened early, welcoming readers with warm light.',
    'Each careful correction made the next line smoother than the last.',
    'A narrow bridge crossed the river where mist moved like silk.',
    'The long corridor echoed with footsteps and distant conversation.',
    'By evening, the notebooks were full of fragments and refined ideas.',
    'Discipline is a quiet engine that keeps running after excitement fades.',
    'Short sessions done daily often beat rare sessions done perfectly.',
    'A measured breath before each line can improve both speed and control.',
    'Focus is built by returning attention, not by never losing it.',
    'Precision at low speed becomes confidence at high speed.',
    'A single clear target is stronger than ten vague intentions.',
    'The best progress feels small while it is happening.',
    'Clarity grows when feedback is immediate and honest.',
    'Tools are useful when they remove friction, not when they add noise.',
    'Every strong habit begins as a tiny rule repeated without drama.',
    'The room was dark, the keys were bright, and the work was simple.',
    'Consistency outperforms intensity when the goal is long-term growth.',
  ];
  return res.json({ passages, source: 'Public domain classics' });
});

initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Typero running on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Failed to initialize DB', err);
    process.exit(1);
  });
