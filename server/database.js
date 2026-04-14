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
    ball_radius REAL DEFAULT 5,
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

  CREATE TABLE IF NOT EXISTS user_badges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    badge_id TEXT NOT NULL,
    unlocked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, badge_id),
    FOREIGN KEY (user_id) REFERENCES users(telegram_id)
  );

  CREATE INDEX IF NOT EXISTS idx_users_telegram ON users(telegram_id);
  CREATE INDEX IF NOT EXISTS idx_leaderboard_score ON leaderboard(total_score DESC);
  CREATE INDEX IF NOT EXISTS idx_game_rounds_user ON game_rounds(user_id);
  CREATE INDEX IF NOT EXISTS idx_user_badges_user ON user_badges(user_id);
`);

// Add badge-related columns to users table (safe with try/catch since ALTER TABLE errors if column exists)
try { db.exec('ALTER TABLE users ADD COLUMN perfect_count INTEGER DEFAULT 0'); } catch (e) { /* column already exists */ }
try { db.exec('ALTER TABLE users ADD COLUMN current_streak INTEGER DEFAULT 0'); } catch (e) { /* column already exists */ }
try { db.exec('ALTER TABLE users ADD COLUMN best_streak INTEGER DEFAULT 0'); } catch (e) { /* column already exists */ }
try { db.exec('ALTER TABLE users ADD COLUMN last_round_score INTEGER DEFAULT 0'); } catch (e) { /* column already exists */ }
try { db.exec('ALTER TABLE users ADD COLUMN best_session_score INTEGER DEFAULT 0'); } catch (e) { /* column already exists */ }
try { db.exec('ALTER TABLE users ADD COLUMN daily_best_session INTEGER DEFAULT 0'); } catch (e) { /* column already exists */ }
try { db.exec('ALTER TABLE users ADD COLUMN daily_reset_date TEXT DEFAULT NULL'); } catch (e) { /* column already exists */ }

// Daily winners archive
db.exec(`
  CREATE TABLE IF NOT EXISTS daily_winners (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    day TEXT NOT NULL,
    rank INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    username TEXT,
    score INTEGER NOT NULL,
    prize INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_daily_winners_day ON daily_winners(day);

  CREATE TABLE IF NOT EXISTS feedbacks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    username TEXT,
    rating TEXT,
    message TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(telegram_id)
  );

  CREATE TABLE IF NOT EXISTS pending_tonpay (
    reference TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    pack INTEGER NOT NULL,
    ton_amount REAL NOT NULL,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    credited_at DATETIME
  );
  CREATE INDEX IF NOT EXISTS idx_pending_tonpay_user ON pending_tonpay(user_id);
`);
try { db.exec('ALTER TABLE users ADD COLUMN referred_by INTEGER DEFAULT NULL'); } catch (e) { /* column already exists */ }
try { db.exec('ALTER TABLE users ADD COLUMN language_code TEXT DEFAULT "en"'); } catch (e) { /* column already exists */ }

try { db.exec('ALTER TABLE users ADD COLUMN referral_rewarded INTEGER DEFAULT 0'); } catch (e) { /* column already exists */ }

// User operations
const getUser = db.prepare('SELECT * FROM users WHERE telegram_id = ?');
const createUser = db.prepare(`
  INSERT OR IGNORE INTO users (telegram_id, username, first_name)
  VALUES (?, ?, ?)
`);
const updateUserCoins = db.prepare('UPDATE users SET coins = coins + ? WHERE telegram_id = ?');
// Atomic deduction: only deducts if user has enough coins. Returns changes count (0 = insufficient).
const deductCoinsIfEnough = db.prepare('UPDATE users SET coins = coins - ? WHERE telegram_id = ? AND coins >= ?');
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

// Leaderboard operations (ranked by daily best session score — resets every 24h)
const getLeaderboard = db.prepare(`
  SELECT u.telegram_id, u.username, u.first_name, u.total_score, u.games_played, u.best_round_score, u.best_session_score, u.daily_best_session
  FROM users u
  WHERE u.daily_best_session > 0
  ORDER BY u.daily_best_session DESC
  LIMIT ?
`);
const getUserRank = db.prepare(`
  SELECT COUNT(*) + 1 as rank FROM users
  WHERE daily_best_session > (SELECT daily_best_session FROM users WHERE telegram_id = ?)
  AND daily_best_session > 0
`);
const updateBestSessionScore = db.prepare(`
  UPDATE users SET
    best_session_score = MAX(best_session_score, ?),
    daily_best_session = MAX(daily_best_session, ?)
  WHERE telegram_id = ?
`);
const resetAllDailyScores = db.prepare(`UPDATE users SET daily_best_session = 0, daily_reset_date = ?`);
const getDailyTop3 = db.prepare(`
  SELECT telegram_id, username, first_name, daily_best_session
  FROM users WHERE daily_best_session > 0
  ORDER BY daily_best_session DESC LIMIT 3
`);
const insertDailyWinner = db.prepare(`
  INSERT INTO daily_winners (day, rank, user_id, username, score, prize) VALUES (?, ?, ?, ?, ?, ?)
`);

// TON Pay pending payments
const insertPendingTonPay = db.prepare(`
  INSERT INTO pending_tonpay (reference, user_id, pack, ton_amount) VALUES (?, ?, ?, ?)
`);
const getPendingTonPayByReference = db.prepare('SELECT * FROM pending_tonpay WHERE reference = ?');
const markTonPayCredited = db.prepare(`UPDATE pending_tonpay SET status = 'credited', credited_at = CURRENT_TIMESTAMP WHERE reference = ?`);

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

// Badge operations
const getUserBadges = db.prepare('SELECT * FROM user_badges WHERE user_id = ?');
const addBadge = db.prepare('INSERT OR IGNORE INTO user_badges (user_id, badge_id) VALUES (?, ?)');
const updateUserStreak = db.prepare('UPDATE users SET current_streak = ?, best_streak = MAX(best_streak, ?) WHERE telegram_id = ?');
const updatePerfectCount = db.prepare('UPDATE users SET perfect_count = perfect_count + 1 WHERE telegram_id = ?');
const resetStreak = db.prepare('UPDATE users SET current_streak = 0 WHERE telegram_id = ?');
const updateLastRoundScore = db.prepare('UPDATE users SET last_round_score = ? WHERE telegram_id = ?');

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
  deductCoinsIfEnough,
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
  getPhotoStats,
  getUserBadges,
  addBadge,
  updateUserStreak,
  updatePerfectCount,
  resetStreak,
  updateLastRoundScore,
  updateBestSessionScore,
  resetAllDailyScores,
  getDailyTop3,
  insertDailyWinner,
  insertPendingTonPay,
  getPendingTonPayByReference,
  markTonPayCredited,
  updateLanguage: db.prepare('UPDATE users SET language_code = ? WHERE telegram_id = ?'),
  setReferredBy: db.prepare('UPDATE users SET referred_by = ? WHERE telegram_id = ? AND referred_by IS NULL'),
  getReferrer: db.prepare('SELECT referred_by FROM users WHERE telegram_id = ?'),
  markReferralRewarded: db.prepare('UPDATE users SET referral_rewarded = 1 WHERE telegram_id = ?'),
  getReferralStatus: db.prepare('SELECT referred_by, referral_rewarded, games_played FROM users WHERE telegram_id = ?')
};
