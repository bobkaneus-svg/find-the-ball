const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, '..', 'data', 'findtheball.db'));

// Enable WAL mode for better concurrent performance
db.pragma('journal_mode = WAL');

// Initialize tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    telegram_id INTEGER UNIQUE NOT NULL,
    username TEXT,
    first_name TEXT,
    coins INTEGER DEFAULT 200,
    total_score INTEGER DEFAULT 0,
    games_played INTEGER DEFAULT 0,
    best_round_score INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_played DATETIME
  );

  CREATE TABLE IF NOT EXISTS photos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename_original TEXT NOT NULL,
    filename_modified TEXT NOT NULL,
    ball_x REAL NOT NULL,
    ball_y REAL NOT NULL,
    ball_radius REAL DEFAULT 30,
    difficulty TEXT DEFAULT 'medium',
    sport TEXT DEFAULT 'football',
    description TEXT,
    active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS game_rounds (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    photo_id INTEGER NOT NULL,
    guess_x REAL,
    guess_y REAL,
    distance REAL,
    score INTEGER DEFAULT 0,
    used_reveal_quarter INTEGER DEFAULT 0,
    used_expand_area INTEGER DEFAULT 0,
    completed INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(telegram_id),
    FOREIGN KEY (photo_id) REFERENCES photos(id)
  );

  CREATE TABLE IF NOT EXISTS leaderboard (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    season INTEGER DEFAULT 1,
    total_score INTEGER DEFAULT 0,
    games_played INTEGER DEFAULT 0,
    avg_accuracy REAL DEFAULT 0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(telegram_id)
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    amount INTEGER NOT NULL,
    type TEXT NOT NULL,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(telegram_id)
  );

  CREATE INDEX IF NOT EXISTS idx_users_telegram ON users(telegram_id);
  CREATE INDEX IF NOT EXISTS idx_leaderboard_score ON leaderboard(total_score DESC);
  CREATE INDEX IF NOT EXISTS idx_game_rounds_user ON game_rounds(user_id);
`);

// User operations
const getUser = db.prepare('SELECT * FROM users WHERE telegram_id = ?');
const createUser = db.prepare(`
  INSERT OR IGNORE INTO users (telegram_id, username, first_name)
  VALUES (?, ?, ?)
`);
const updateUserCoins = db.prepare('UPDATE users SET coins = coins + ? WHERE telegram_id = ?');
const updateUserScore = db.prepare(`
  UPDATE users SET
    total_score = total_score + ?,
    games_played = games_played + 1,
    best_round_score = MAX(best_round_score, ?),
    last_played = CURRENT_TIMESTAMP
  WHERE telegram_id = ?
`);
const getUserCoins = db.prepare('SELECT coins FROM users WHERE telegram_id = ?');

// Photo operations
// Get random photo excluding recent ones for this user AND excluding a specific photo
const getRandomPhoto = db.prepare(`
  SELECT * FROM photos WHERE active = 1
  AND id NOT IN (
    SELECT photo_id FROM game_rounds WHERE user_id = ? AND completed = 1
    ORDER BY created_at DESC LIMIT 50
  )
  AND id != ?
  ORDER BY RANDOM() LIMIT 1
`);
// Fallback: any photo except the one just played
const getAnyRandomPhoto = db.prepare('SELECT * FROM photos WHERE active = 1 AND id != ? ORDER BY RANDOM() LIMIT 1');
const addPhoto = db.prepare(`
  INSERT INTO photos (filename_original, filename_modified, ball_x, ball_y, ball_radius, difficulty, sport, description)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);
const getAllPhotos = db.prepare('SELECT * FROM photos WHERE active = 1');
const getPhotoById = db.prepare('SELECT * FROM photos WHERE id = ?');

// Game round operations
const createRound = db.prepare(`
  INSERT INTO game_rounds (user_id, photo_id)
  VALUES (?, ?)
`);
const completeRound = db.prepare(`
  UPDATE game_rounds SET
    guess_x = ?, guess_y = ?, distance = ?, score = ?,
    used_reveal_quarter = ?, used_expand_area = ?, completed = 1
  WHERE id = ?
`);
const getRoundById = db.prepare('SELECT * FROM game_rounds WHERE id = ?');

// Leaderboard operations
const getLeaderboard = db.prepare(`
  SELECT u.telegram_id, u.username, u.first_name, u.total_score, u.games_played, u.best_round_score
  FROM users u
  WHERE u.games_played > 0
  ORDER BY u.total_score DESC
  LIMIT ?
`);
const getUserRank = db.prepare(`
  SELECT COUNT(*) + 1 as rank FROM users
  WHERE total_score > (SELECT total_score FROM users WHERE telegram_id = ?)
  AND games_played > 0
`);

// Admin pipeline operations
const getPhotosByStatus = db.prepare('SELECT * FROM photos WHERE active = ? ORDER BY id DESC');
const getAllPhotosAdmin = db.prepare('SELECT * FROM photos ORDER BY id DESC LIMIT ? OFFSET ?');
const updatePhotoActive = db.prepare('UPDATE photos SET active = ? WHERE id = ?');
const getPhotoStats = db.prepare(`
  SELECT
    COUNT(*) as total,
    SUM(CASE WHEN active = 1 THEN 1 ELSE 0 END) as approved,
    SUM(CASE WHEN active = 0 THEN 1 ELSE 0 END) as pending,
    SUM(CASE WHEN active = -1 THEN 1 ELSE 0 END) as rejected
  FROM photos
`);

// Transaction logging
const logTransaction = db.prepare(`
  INSERT INTO transactions (user_id, amount, type, description)
  VALUES (?, ?, ?, ?)
`);

module.exports = {
  db,
  getUser,
  createUser,
  updateUserCoins,
  updateUserScore,
  getUserCoins,
  getRandomPhoto,
  getAnyRandomPhoto,
  addPhoto,
  getAllPhotos,
  getPhotoById,
  createRound,
  completeRound,
  getRoundById,
  getLeaderboard,
  getUserRank,
  logTransaction,
  getPhotosByStatus,
  getAllPhotosAdmin,
  updatePhotoActive,
  getPhotoStats
};
