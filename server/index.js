require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const crypto = require('crypto');
const db = require('./database');
const game = require('./game');
const TelegramBot = require('node-telegram-bot-api');

const app = express();
const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.BOT_TOKEN;
const WEBAPP_URL = process.env.WEBAPP_URL || `http://localhost:${PORT}`;
const ADMIN_IDS = (process.env.ADMIN_IDS || '').split(',').map(Number).filter(n => !isNaN(n) && n > 0);
const ADMIN_SECRET = process.env.ADMIN_SECRET;
if (!ADMIN_SECRET) console.warn('WARNING: ADMIN_SECRET not set — admin endpoints disabled');

// Telegram Bot
let bot;
if (BOT_TOKEN) {
  bot = new TelegramBot(BOT_TOKEN, { polling: true });
  setupBot(bot);
  console.log('Telegram bot started');
}

// Middleware
app.use(cors({
  origin: WEBAPP_URL !== `http://localhost:${PORT}` ? WEBAPP_URL : '*'
}));
app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
  });
  next();
});

app.use(express.static(path.join(__dirname, '..', 'public')));

// Persistent upload directory (Railway volume at /app/data or local data/)
const DATA_DIR = path.join(__dirname, '..', 'data');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const UPLOADS_ORIGINALS = path.join(UPLOADS_DIR, 'originals');
const UPLOADS_MODIFIED = path.join(UPLOADS_DIR, 'modified');

// Ensure upload dirs exist
[UPLOADS_ORIGINALS, UPLOADS_MODIFIED].forEach(dir => {
  const fsMod = require('fs');
  if (!fsMod.existsSync(dir)) fsMod.mkdirSync(dir, { recursive: true });
});

// Serve uploaded photos from persistent volume
app.use('/uploads', express.static(UPLOADS_DIR));

// Photo upload config
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const folder = file.fieldname === 'original' ? 'originals' : 'modified';
    cb(null, path.join(__dirname, '..', 'public', 'photos', folder));
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`);
  }
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

// ============ AUTH MIDDLEWARE ============

function validateTelegramData(initData) {
  if (!BOT_TOKEN || !initData) return null;

  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    params.delete('hash');

    const dataCheckString = Array.from(params.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, val]) => `${key}=${val}`)
      .join('\n');

    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
    const computedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

    if (computedHash === hash) {
      const user = JSON.parse(params.get('user') || '{}');
      return user;
    }
  } catch (e) {
    console.error('Auth validation error:', e.message);
  }
  return null;
}

function authMiddleware(req, res, next) {
  // Admin secret key bypass (for browser-based admin dashboard)
  if (ADMIN_SECRET && req.query.key === ADMIN_SECRET) {
    req.telegramUser = { id: ADMIN_IDS[0] || 0, isAdmin: true };
    return next();
  }

  const initData = req.headers['x-telegram-init-data'];

  // Dev mode: accept telegram_id from header
  if (!BOT_TOKEN && req.headers['x-telegram-id']) {
    req.telegramUser = {
      id: parseInt(req.headers['x-telegram-id']),
      username: 'dev_user',
      first_name: 'Developer'
    };
    return next();
  }

  const user = validateTelegramData(initData);
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  req.telegramUser = user;
  next();
}

function adminMiddleware(req, res, next) {
  if (!req.telegramUser) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  // Allow if authenticated via admin secret key or if user is in ADMIN_IDS
  if (req.telegramUser.isAdmin || ADMIN_IDS.includes(req.telegramUser.id)) {
    return next();
  }
  return res.status(403).json({ error: 'Admin access required' });
}

// ============ HEALTH CHECK ============

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// ============ API ROUTES ============

// Photo count (no auth)
app.get('/api/game/photo-count', (req, res) => {
  const photos = db.getAllPhotos.all().filter(p => p.active !== 0);
  res.json({ count: photos.length });
});

// Initialize / get user
app.post('/api/auth', authMiddleware, (req, res) => {
  const { id, username, first_name } = req.telegramUser;

  db.createUser.run(id, username || null, first_name || null);
  const user = db.getUser.get(id);
  const stats = game.getUserStats(id);

  res.json({
    user: {
      telegramId: user.telegram_id,
      username: user.username,
      firstName: user.first_name,
      coins: user.coins,
      ...stats
    }
  });
});

// Get invite link for referral
app.get('/api/invite-link', authMiddleware, (req, res) => {
  const botUsername = process.env.BOT_USERNAME || 'FindTheBallBot';
  const link = `https://t.me/${botUsername}?start=ref_${req.telegramUser.id}`;
  res.json({ link });
});

// Start a new round
app.post('/api/game/start', authMiddleware, (req, res) => {
  const lastPhotoId = req.body?.lastPhotoId || 0;
  const result = game.startNewRound(req.telegramUser.id, lastPhotoId);
  if (result.error) {
    return res.status(400).json({ error: result.error });
  }
  res.json(result);
});

// Reveal quarter - tells which quadrant contains the ball
app.post('/api/game/reveal', authMiddleware, (req, res) => {
  const { roundId } = req.body;
  if (!roundId) return res.status(400).json({ error: 'Missing roundId' });

  const round = db.getRoundById.get(roundId);
  if (!round) return res.status(404).json({ error: 'Round not found' });
  if (round.user_id !== req.telegramUser.id) return res.status(403).json({ error: 'Not your round' });

  const photo = db.getPhotoById.get(round.photo_id);
  if (!photo) return res.status(404).json({ error: 'Photo not found' });

  // Atomic deduction — prevents race condition / negative balance
  const deductResult = db.deductCoinsIfEnough.run(100, req.telegramUser.id, 100);
  if (deductResult.changes === 0) {
    return res.status(400).json({ error: 'Not enough coins' });
  }
  db.logTransaction.run(req.telegramUser.id, -100, 'powerup', 'Reveal quarter');

  // Determine which quarter: tl, tr, bl, br
  const quarter = (photo.ball_x <= 50 ? 'l' : 'r');
  const vQuarter = (photo.ball_y <= 50 ? 't' : 'b');
  const ballQuarter = vQuarter + quarter; // e.g. "tl", "tr", "bl", "br"

  const updatedUser = db.getUser.get(req.telegramUser.id);

  res.json({ quarter: ballQuarter, coins: updatedUser.coins });
});

// Submit guess
app.post('/api/game/guess', authMiddleware, (req, res) => {
  const { roundId, guessX, guessY, usedReveal, usedExpand, searchRadiusPct } = req.body;

  if (roundId == null || guessX == null || guessY == null) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const result = game.submitGuess(
    roundId,
    req.telegramUser.id,
    parseFloat(guessX),
    parseFloat(guessY),
    !!usedReveal,
    !!usedExpand,
    searchRadiusPct ? parseFloat(searchRadiusPct) : null
  );

  if (result.error) {
    return res.status(400).json({ error: result.error });
  }

  res.json(result);
});

// End session (game over) - save best session score
app.post('/api/game/end-session', authMiddleware, (req, res) => {
  const { sessionScore } = req.body;
  if (sessionScore == null) {
    return res.status(400).json({ error: 'Missing sessionScore' });
  }
  const result = game.endSession(req.telegramUser.id, parseInt(sessionScore));
  res.json(result);
});

// Get user stats
app.get('/api/user/stats', authMiddleware, (req, res) => {
  const stats = game.getUserStats(req.telegramUser.id);
  if (!stats) {
    return res.status(404).json({ error: 'User not found' });
  }
  res.json(stats);
});

// Get user badges
app.get('/api/user/badges', authMiddleware, (req, res) => {
  const telegramId = req.telegramUser.id;
  const unlockedBadges = db.getUserBadges.all(telegramId);
  const userData = db.getUser.get(telegramId);

  // All badge definitions with progress info
  const BADGE_DEFS = {
    first_game:    { category: 'milestone', target: 1,      current: userData?.games_played || 0 },
    veteran:       { category: 'milestone', target: 10,     current: userData?.games_played || 0 },
    addict:        { category: 'milestone', target: 50,     current: userData?.games_played || 0 },
    legend:        { category: 'milestone', target: 100,    current: userData?.games_played || 0 },
    sharpshooter:  { category: 'precision', target: 1,      current: userData?.perfect_count || 0 },
    eagle_eye:     { category: 'precision', target: 5,      current: userData?.perfect_count || 0 },
    sniper:        { category: 'precision', target: 10,     current: userData?.perfect_count || 0 },
    hot_streak_3:  { category: 'streak',    target: 3,      current: userData?.best_streak || 0 },
    unstoppable_5: { category: 'streak',    target: 5,      current: userData?.best_streak || 0 },
    machine_10:    { category: 'streak',    target: 10,     current: userData?.best_streak || 0 },
    god_mode_20:   { category: 'streak',    target: 20,     current: userData?.best_streak || 0 },
    scorer_1k:     { category: 'score',     target: 1000,   current: userData?.total_score || 0 },
    scorer_5k:     { category: 'score',     target: 5000,   current: userData?.total_score || 0 },
    scorer_25k:    { category: 'score',     target: 25000,  current: userData?.total_score || 0 },
    scorer_100k:   { category: 'score',     target: 100000, current: userData?.total_score || 0 },
    comeback_kid:  { category: 'special',   target: 1,      current: 0 },
    coin_collector:{ category: 'special',   target: 5000,   current: userData?.coins || 0 },
    social_star:   { category: 'special',   target: 1,      current: 0 }
  };

  const unlockedMap = {};
  unlockedBadges.forEach(b => { unlockedMap[b.badge_id] = b.unlocked_at; });

  const badges = Object.entries(BADGE_DEFS).map(([id, def]) => ({
    id,
    category: def.category,
    unlocked: !!unlockedMap[id],
    unlockedAt: unlockedMap[id] || null,
    progress: Math.min(def.current, def.target),
    target: def.target
  }));

  res.json({
    badges,
    unlocked: unlockedBadges.length,
    total: Object.keys(BADGE_DEFS).length
  });
});

// Award social_star badge when sharing
app.post('/api/user/badges/social', authMiddleware, (req, res) => {
  const telegramId = req.telegramUser.id;
  db.addBadge.run(telegramId, 'social_star');
  const isNew = db.getUserBadges.all(telegramId).some(b => b.badge_id === 'social_star');
  res.json({ awarded: isNew, badgeId: 'social_star' });
});

// Get leaderboard
app.get('/api/leaderboard', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 100);
  const leaderboard = game.getLeaderboardData(limit);
  res.json({ leaderboard });
});

// Buy coins (Telegram Stars integration placeholder)
app.post('/api/shop/buy', authMiddleware, (req, res) => {
  const { pack } = req.body;

  const packs = {
    500: { price: 99, coins: 500 },
    1000: { price: 199, coins: 1000 },
    2000: { price: 299, coins: 2000 },
    5000: { price: 599, coins: 5000 },
    10000: { price: 999, coins: 10000 },
    20000: { price: 1499, coins: 20000 }
  };

  const selectedPack = packs[pack];
  if (!selectedPack) {
    return res.status(400).json({ error: 'Invalid pack' });
  }

  // For now, grant coins directly (Telegram Stars integration TODO)
  db.updateUserCoins.run(selectedPack.coins, req.telegramUser.id);
  db.logTransaction.run(req.telegramUser.id, selectedPack.coins, 'purchase', `Bought ${selectedPack.coins} coins`);

  const user = db.getUser.get(req.telegramUser.id);
  res.json({ coins: user.coins, purchased: selectedPack.coins });
});

// Create Telegram Stars invoice
app.post('/api/shop/create-invoice', authMiddleware, async (req, res) => {
  const { pack, stars } = req.body;
  if (!pack || !stars) return res.status(400).json({ error: 'Missing pack or stars' });

  if (!bot) {
    return res.json({ invoiceLink: null }); // Dev mode - no bot
  }

  try {
    const invoiceLink = await bot.createInvoiceLink(
      `${pack} Coins`, // title
      `Purchase ${pack} coins for Find the Ball`, // description
      `coins_${pack}_${req.telegramUser.id}_${Date.now()}`, // payload
      '', // provider_token (empty for Stars)
      'XTR', // currency (XTR = Telegram Stars)
      [{ label: `${pack} Coins`, amount: parseInt(stars) }]
    );
    res.json({ invoiceLink });
  } catch (err) {
    console.error('Invoice creation error:', err.message);
    res.status(500).json({ error: 'Failed to create invoice' });
  }
});

// Stars payment verified server-side via successful_payment webhook in setupBot()
// Client polls /api/user/coins after payment to get updated balance
app.get('/api/user/coins', authMiddleware, (req, res) => {
  const user = db.getUser.get(req.telegramUser.id);
  res.json({ coins: user?.coins || 0 });
});

// ============ TON PRICE CACHE ============
const TON_WALLET = process.env.TON_WALLET || '';
let tonPriceUsd = 3.5; // fallback price
let tonPriceLastFetch = 0;
const TON_PRICE_TTL = 5 * 60 * 1000; // 5 minutes cache

async function fetchTonPrice() {
  const now = Date.now();
  if (now - tonPriceLastFetch < TON_PRICE_TTL) return tonPriceUsd;

  try {
    const https = require('https');
    const data = await new Promise((resolve, reject) => {
      https.get('https://api.coingecko.com/api/v3/simple/price?ids=the-open-network&vs_currencies=usd', (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => resolve(JSON.parse(body)));
      }).on('error', reject);
    });
    if (data['the-open-network']?.usd) {
      tonPriceUsd = data['the-open-network'].usd;
      tonPriceLastFetch = now;
      console.log(`TON price updated: $${tonPriceUsd}`);
    }
  } catch (e) {
    console.error('Failed to fetch TON price:', e.message);
  }
  return tonPriceUsd;
}

// Endpoint: get current pack prices with dynamic TON conversion
app.get('/api/shop/prices', async (req, res) => {
  const price = await fetchTonPrice();
  // 1 Star ~= $0.02 (Telegram Stars rate)
  const STAR_RATE = 0.02;
  const packs = [
    { pack: 500, usd: 0.99 },
    { pack: 1000, usd: 1.99 },
    { pack: 2000, usd: 3.49 },
    { pack: 5000, usd: 7.99 },
    { pack: 10000, usd: 14.99 },
    { pack: 20000, usd: 27.99 }
  ].map(p => ({
    ...p,
    stars: Math.round(p.usd / STAR_RATE),
    ton: Math.round((p.usd / price) * 100) / 100
  }));
  res.json({ packs, tonPriceUsd: price });
});

// Create TON payment link
app.post('/api/shop/ton-invoice', authMiddleware, async (req, res) => {
  const { pack } = req.body;
  if (!pack) return res.status(400).json({ error: 'Missing pack' });
  if (!TON_WALLET) return res.status(500).json({ error: 'TON wallet not configured' });

  const coins = parseInt(pack);
  const packPrices = { 500: 0.99, 1000: 1.99, 2000: 3.49, 5000: 7.99, 10000: 14.99, 20000: 27.99 };
  const usdPrice = packPrices[coins];
  if (!usdPrice) return res.status(400).json({ error: 'Invalid pack' });

  const price = await fetchTonPrice();
  const tonAmount = Math.round((usdPrice / price) * 100) / 100;
  const comment = `ftb_${coins}_${req.telegramUser.id}_${Date.now()}`;

  // TON deeplink for TonKeeper / Tonhub
  const nanotons = Math.round(tonAmount * 1e9);
  const paymentUrl = `ton://transfer/${TON_WALLET}?amount=${nanotons}&text=${encodeURIComponent(comment)}`;

  // Log pending transaction
  db.logTransaction.run(req.telegramUser.id, 0, 'ton_pending', `TON payment pending: ${tonAmount} TON for ${coins} coins - ${comment}`);

  res.json({ paymentUrl, comment, tonAmount });
});

// Ad reward removed — replaced by invite/referral system

// ============ MANAGE TOOL (photo upload + marking) ============

// Upload config for manage tool - saves to persistent volume
const manageStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = file.fieldname === 'original' ? UPLOADS_ORIGINALS : UPLOADS_MODIFIED;
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `ftb_${Date.now()}_${crypto.randomBytes(3).toString('hex')}${ext}`);
  }
});
const manageUpload = multer({ storage: manageStorage, limits: { fileSize: 15 * 1024 * 1024 } });

// Publish a photo pair (original + modified + ball position)
app.post('/api/manage/publish',
  authMiddleware, adminMiddleware,
  manageUpload.fields([{ name: 'original', maxCount: 1 }, { name: 'modified', maxCount: 1 }]),
  (req, res) => {
    const { ball_x, ball_y, ball_radius, difficulty } = req.body;

    if (!req.files?.original?.[0] || !req.files?.modified?.[0]) {
      return res.status(400).json({ error: 'Les deux photos sont requises' });
    }
    if (!ball_x || !ball_y) {
      return res.status(400).json({ error: 'Position du ballon requise' });
    }

    const result = db.addPhoto.run(
      req.files.original[0].filename,
      req.files.modified[0].filename,
      parseFloat(ball_x),
      parseFloat(ball_y),
      parseFloat(ball_radius) || 3,
      difficulty || 'medium',
      'football',
      `Uploaded ${new Date().toISOString().split('T')[0]}`
    );

    // Auto-activate
    db.updatePhotoActive.run(1, result.lastInsertRowid);

    res.json({ id: result.lastInsertRowid, message: 'Photo publiee!' });
  }
);

// List all photos for manage tool
app.get('/api/manage/photos', authMiddleware, adminMiddleware, (req, res) => {
  const photos = db.getAllPhotosAdmin.all(200, 0);
  res.json({ photos });
});

// Toggle photo active/inactive
app.post('/api/manage/toggle/:id', authMiddleware, adminMiddleware, (req, res) => {
  const { active } = req.body;
  db.updatePhotoActive.run(active, parseInt(req.params.id));
  res.json({ success: true });
});

// Delete a photo
app.post('/api/manage/delete/:id', authMiddleware, adminMiddleware, (req, res) => {
  const photo = db.getPhotoById.get(parseInt(req.params.id));
  if (!photo) return res.status(404).json({ error: 'Photo non trouvee' });

  const fs = require('fs');
  // Delete files
  const origPath = path.join(__dirname, '..', 'public', 'photos', 'originals', photo.filename_original);
  const modPath = path.join(__dirname, '..', 'public', 'photos', 'modified', photo.filename_modified);
  try { fs.unlinkSync(origPath); } catch (e) {}
  try { fs.unlinkSync(modPath); } catch (e) {}

  // Delete from DB
  db.db.prepare('DELETE FROM photos WHERE id = ?').run(parseInt(req.params.id));
  res.json({ success: true });
});

// Stats
app.get('/api/manage/stats', authMiddleware, adminMiddleware, (req, res) => {
  const stats = db.getPhotoStats.get();
  res.json({ active: stats.approved || 0, pending: stats.pending || 0, total: stats.total || 0 });
});

// ============ DASHBOARD API ============

app.get('/api/dashboard/overview', authMiddleware, adminMiddleware, (req, res) => {
  const totalUsers = db.db.prepare('SELECT COUNT(*) as c FROM users').get().c;
  const today = new Date().toISOString().slice(0, 10);
  const activeToday = db.db.prepare("SELECT COUNT(*) as c FROM users WHERE date(last_played) = ?").get(today).c;
  const activeLast7d = db.db.prepare("SELECT COUNT(*) as c FROM users WHERE last_played >= datetime('now', '-7 days')").get().c;
  const totalGames = db.db.prepare('SELECT SUM(games_played) as c FROM users').get().c || 0;
  const totalRounds = db.db.prepare('SELECT COUNT(*) as c FROM game_rounds WHERE completed = 1').get().c;
  const totalCoinsCirculating = db.db.prepare('SELECT SUM(coins) as c FROM users').get().c || 0;
  const avgScore = db.db.prepare('SELECT AVG(score) as a FROM game_rounds WHERE completed = 1 AND score > 0').get().a || 0;
  const photos = db.getPhotoStats.get();

  res.json({
    users: { total: totalUsers, activeToday, activeLast7d },
    games: { totalGames, totalRounds, avgScore: Math.round(avgScore) },
    economy: { totalCoinsCirculating },
    photos: { active: photos.approved || 0, pending: photos.pending || 0, total: photos.total || 0 }
  });
});

app.get('/api/dashboard/revenue', authMiddleware, adminMiddleware, (req, res) => {
  const starsPurchases = db.db.prepare("SELECT COUNT(*) as count, SUM(amount) as total FROM transactions WHERE type = 'stars_purchase'").get();
  const starsPayments = db.db.prepare("SELECT COUNT(*) as count, SUM(amount) as total FROM transactions WHERE type = 'stars_payment'").get();
  const tonPending = db.db.prepare("SELECT COUNT(*) as count FROM transactions WHERE type = 'ton_pending'").get();
  const powerupSpend = db.db.prepare("SELECT COUNT(*) as count, SUM(ABS(amount)) as total FROM transactions WHERE type = 'powerup'").get();
  const dailyPrizes = db.db.prepare("SELECT COUNT(*) as count, SUM(amount) as total FROM transactions WHERE type = 'daily_prize'").get();
  const referralRewards = db.db.prepare("SELECT COUNT(*) as count, SUM(amount) as total FROM transactions WHERE type = 'referral_reward'").get();
  const recentTx = db.db.prepare("SELECT * FROM transactions ORDER BY created_at DESC LIMIT 20").all();

  res.json({
    revenue: {
      starsPurchases: { count: starsPurchases.count || 0, coins: starsPurchases.total || 0 },
      starsPayments: { count: starsPayments.count || 0, coins: starsPayments.total || 0 },
      tonPending: tonPending.count || 0
    },
    spending: {
      powerups: { count: powerupSpend.count || 0, coins: powerupSpend.total || 0 },
      dailyPrizes: { count: dailyPrizes.count || 0, coins: dailyPrizes.total || 0 },
      referrals: { count: referralRewards.count || 0, coins: referralRewards.total || 0 }
    },
    recentTransactions: recentTx
  });
});

app.get('/api/dashboard/users', authMiddleware, adminMiddleware, (req, res) => {
  // Signups per day (last 30 days)
  const signups = db.db.prepare(`
    SELECT date(created_at) as day, COUNT(*) as count
    FROM users WHERE created_at >= datetime('now', '-30 days')
    GROUP BY date(created_at) ORDER BY day
  `).all();

  // Top 10 players by total score
  const topPlayers = db.db.prepare(`
    SELECT telegram_id, username, first_name, coins, total_score, games_played, best_session_score, daily_best_session, last_played
    FROM users ORDER BY total_score DESC LIMIT 10
  `).all();

  // Retention: users who played > 1 day
  const retention = db.db.prepare(`
    SELECT COUNT(*) as c FROM users WHERE games_played >= 5
  `).get().c;

  // Language distribution
  const languages = db.db.prepare(`
    SELECT language_code, COUNT(*) as count FROM users GROUP BY language_code ORDER BY count DESC
  `).all();

  // Referral stats
  const referrals = db.db.prepare(`SELECT COUNT(*) as c FROM users WHERE referred_by IS NOT NULL`).get().c;
  const referralsRewarded = db.db.prepare(`SELECT COUNT(*) as c FROM users WHERE referral_rewarded = 1`).get().c;

  res.json({ signups, topPlayers, retention, languages, referrals: { total: referrals, rewarded: referralsRewarded } });
});

app.get('/api/dashboard/gameplay', authMiddleware, adminMiddleware, (req, res) => {
  // Score distribution
  const scoreDist = db.db.prepare(`
    SELECT
      SUM(CASE WHEN score >= 900 THEN 1 ELSE 0 END) as perfect,
      SUM(CASE WHEN score >= 700 AND score < 900 THEN 1 ELSE 0 END) as great,
      SUM(CASE WHEN score >= 400 AND score < 700 THEN 1 ELSE 0 END) as good,
      SUM(CASE WHEN score > 0 AND score < 400 THEN 1 ELSE 0 END) as ok,
      SUM(CASE WHEN score = 0 THEN 1 ELSE 0 END) as miss
    FROM game_rounds WHERE completed = 1
  `).get();

  // Power-up usage
  const powerups = db.db.prepare(`
    SELECT
      SUM(used_reveal_quarter) as reveals,
      SUM(used_expand_area) as expands,
      COUNT(*) as totalRounds
    FROM game_rounds WHERE completed = 1
  `).get();

  // Games per day (last 14 days)
  const gamesPerDay = db.db.prepare(`
    SELECT date(created_at) as day, COUNT(*) as count
    FROM game_rounds WHERE completed = 1 AND created_at >= datetime('now', '-14 days')
    GROUP BY date(created_at) ORDER BY day
  `).all();

  // Daily winners history
  const winners = db.db.prepare(`
    SELECT * FROM daily_winners ORDER BY day DESC, rank ASC LIMIT 30
  `).all();

  // Badge unlock rates
  const badgeStats = db.db.prepare(`
    SELECT badge_id, COUNT(*) as count FROM user_badges GROUP BY badge_id ORDER BY count DESC
  `).all();

  res.json({ scoreDist, powerups, gamesPerDay, winners, badgeStats });
});

// ============ ADMIN PIPELINE ROUTES ============

const { fork } = require('child_process');
const fs = require('fs');

let pipelineProcess = null;

// Pipeline status
app.get('/api/admin/pipeline/status', authMiddleware, adminMiddleware, (req, res) => {
  const statusPath = path.join(__dirname, '..', 'pipeline-status.json');
  try {
    if (fs.existsSync(statusPath)) {
      const status = JSON.parse(fs.readFileSync(statusPath, 'utf-8'));
      status.running = pipelineProcess !== null;
      return res.json(status);
    }
  } catch (e) {
    console.error('Error reading pipeline status:', e.message);
  }
  res.json({ running: pipelineProcess !== null, step: null, progress: 0, message: 'No pipeline data' });
});

// List all photos for review (with pagination and status filter)
app.get('/api/admin/pipeline/photos', authMiddleware, adminMiddleware, (req, res) => {
  const { status, page = 1, limit = 20 } = req.query;
  const pageNum = Math.max(1, parseInt(page));
  const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
  const offset = (pageNum - 1) * limitNum;

  let photos;
  if (status !== undefined && status !== 'all') {
    const activeVal = status === 'approved' ? 1 : status === 'rejected' ? -1 : 0;
    photos = db.getPhotosByStatus.all(activeVal);
    // Manual pagination for status-filtered results
    const total = photos.length;
    photos = photos.slice(offset, offset + limitNum);
    return res.json({ photos, total, page: pageNum, limit: limitNum });
  }

  photos = db.getAllPhotosAdmin.all(limitNum, offset);
  const stats = db.getPhotoStats.get();
  res.json({ photos, total: stats.total, page: pageNum, limit: limitNum });
});

// Photo stats
app.get('/api/admin/pipeline/stats', authMiddleware, adminMiddleware, (req, res) => {
  const stats = db.getPhotoStats.get();
  res.json(stats);
});

// Approve a photo
app.post('/api/admin/pipeline/approve/:id', authMiddleware, adminMiddleware, (req, res) => {
  const { id } = req.params;
  db.updatePhotoActive.run(1, parseInt(id));
  res.json({ success: true, message: `Photo ${id} approved` });
});

// Reject a photo
app.post('/api/admin/pipeline/reject/:id', authMiddleware, adminMiddleware, (req, res) => {
  const { id } = req.params;
  db.updatePhotoActive.run(-1, parseInt(id));
  res.json({ success: true, message: `Photo ${id} rejected` });
});

// Helper to fork pipeline worker
function runPipelineStep(step, res) {
  if (pipelineProcess) {
    return res.status(409).json({ error: 'Pipeline is already running' });
  }

  const workerPath = path.join(__dirname, '..', 'pipeline-worker.js');
  if (!fs.existsSync(workerPath)) {
    return res.status(404).json({ error: 'pipeline-worker.js not found' });
  }

  pipelineProcess = fork(workerPath, [step]);

  pipelineProcess.on('exit', (code) => {
    console.log(`Pipeline step "${step}" exited with code ${code}`);
    pipelineProcess = null;
  });

  pipelineProcess.on('error', (err) => {
    console.error(`Pipeline step "${step}" error:`, err.message);
    pipelineProcess = null;
  });

  res.json({ success: true, message: `Pipeline step "${step}" started` });
}

// Trigger pipeline steps
app.post('/api/admin/pipeline/download', authMiddleware, adminMiddleware, (req, res) => {
  runPipelineStep('download', res);
});

app.post('/api/admin/pipeline/detect', authMiddleware, adminMiddleware, (req, res) => {
  runPipelineStep('detect', res);
});

app.post('/api/admin/pipeline/process', authMiddleware, adminMiddleware, (req, res) => {
  runPipelineStep('process', res);
});

// ============ ADMIN ROUTES ============

// Upload photo pair
app.post('/api/admin/photos',
  authMiddleware,
  adminMiddleware,
  upload.fields([{ name: 'original', maxCount: 1 }, { name: 'modified', maxCount: 1 }]),
  (req, res) => {
    const { ball_x, ball_y, ball_radius, difficulty, sport, description } = req.body;

    if (!req.files?.original?.[0] || !req.files?.modified?.[0]) {
      return res.status(400).json({ error: 'Both original and modified photos required' });
    }

    const result = db.addPhoto.run(
      req.files.original[0].filename,
      req.files.modified[0].filename,
      parseFloat(ball_x),
      parseFloat(ball_y),
      parseFloat(ball_radius) || 30,
      difficulty || 'medium',
      sport || 'football',
      description || null
    );

    res.json({ id: result.lastInsertRowid, message: 'Photo added successfully' });
  }
);

// List all photos
app.get('/api/admin/photos', authMiddleware, adminMiddleware, (req, res) => {
  const photos = db.getAllPhotos.all();
  res.json({ photos });
});

// ============ MARKER TOOL API ============

// Get raw photos that need marking
app.get('/api/admin/marker/photos', authMiddleware, adminMiddleware, (req, res) => {
  const rawDir = path.join(__dirname, '..', 'public', 'photos', 'raw');
  if (!fs.existsSync(rawDir)) return res.json({ photos: [], total: 0, marked: 0 });

  const files = fs.readdirSync(rawDir).filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f)).sort();

  // Check which already have DB entries (stored raw filename in description)
  const existing = db.getAllPhotos.all().map(p => p.description).filter(Boolean);

  // Check skipped photos
  const skippedPath = path.join(__dirname, '..', 'data', 'skipped-photos.json');
  let skipped = [];
  try {
    if (fs.existsSync(skippedPath)) {
      skipped = JSON.parse(fs.readFileSync(skippedPath, 'utf-8'));
    }
  } catch (e) { /* ignore */ }

  const photos = files.map((f, i) => ({
    id: i + 1,
    filename: f,
    url: `/photos/raw/${f}`,
    marked: existing.includes(f) || skipped.includes(f)
  }));

  res.json({ photos, total: photos.length, marked: photos.filter(p => p.marked).length });
});

// Save ball position for a raw photo
app.post('/api/admin/marker/save', authMiddleware, adminMiddleware, (req, res) => {
  const { filename, ballX, ballY, radius } = req.body;
  if (!filename || ballX == null || ballY == null) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const src = path.join(__dirname, '..', 'public', 'photos', 'raw', filename);
  if (!fs.existsSync(src)) {
    return res.status(404).json({ error: 'Raw photo not found' });
  }

  // Check if already exists in DB (by description = raw filename)
  const existingPhotos = db.getAllPhotos.all().filter(p => p.description === filename);
  if (existingPhotos.length > 0) {
    return res.json({ success: true, message: 'Already marked (duplicate skipped)' });
  }

  // Copy file to originals
  const dstDir = path.join(__dirname, '..', 'public', 'photos', 'originals');
  if (!fs.existsSync(dstDir)) fs.mkdirSync(dstDir, { recursive: true });
  const dst = path.join(dstDir, filename);
  fs.copyFileSync(src, dst);

  // Insert into DB with active=0 (pending processing)
  // filename_modified = filename for now (will be replaced after AI inpainting)
  db.addPhoto.run(filename, filename, parseFloat(ballX), parseFloat(ballY), parseFloat(radius) || 25, 'medium', 'football', filename);
  // Set active=0 (pending) for the newly inserted photo
  const inserted = db.db.prepare('SELECT id FROM photos WHERE description = ? ORDER BY id DESC LIMIT 1').get(filename);
  if (inserted) {
    db.updatePhotoActive.run(0, inserted.id);
  }

  res.json({ success: true });
});

// Skip a photo (mark as unusable)
app.post('/api/admin/marker/skip', authMiddleware, adminMiddleware, (req, res) => {
  const { filename } = req.body;
  if (!filename) {
    return res.status(400).json({ error: 'Missing filename' });
  }

  const skippedPath = path.join(__dirname, '..', 'data', 'skipped-photos.json');
  let skipped = [];
  try {
    if (fs.existsSync(skippedPath)) {
      skipped = JSON.parse(fs.readFileSync(skippedPath, 'utf-8'));
    }
  } catch (e) { /* ignore */ }

  if (!skipped.includes(filename)) {
    skipped.push(filename);
    fs.writeFileSync(skippedPath, JSON.stringify(skipped, null, 2));
  }

  res.json({ success: true });
});

// Generate masks for all marked photos (for AI inpainting)
app.post('/api/admin/marker/generate-masks', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const sharp = require('sharp');
    const maskDir = path.join(__dirname, '..', 'public', 'photos', 'masks');
    if (!fs.existsSync(maskDir)) fs.mkdirSync(maskDir, { recursive: true });

    // Get all photos that have ball positions but aren't processed yet (active=0)
    const photos = db.getPhotosByStatus.all(0);
    let count = 0;

    for (const photo of photos) {
      if (photo.ball_x === 0 && photo.ball_y === 0) continue; // skipped photos

      // Read the original image to get its actual dimensions
      const origPath = path.join(__dirname, '..', 'public', 'photos', 'originals', photo.filename_original);
      let width = 800, height = 600;
      try {
        const meta = await sharp(origPath).metadata();
        width = meta.width || 800;
        height = meta.height || 600;
      } catch (e) { /* use defaults */ }

      const cx = Math.round(photo.ball_x / 100 * width);
      const cy = Math.round(photo.ball_y / 100 * height);
      const r = Math.round(photo.ball_radius * 1.3); // slightly larger mask

      const svg = `<svg width="${width}" height="${height}">
        <rect width="${width}" height="${height}" fill="black"/>
        <circle cx="${cx}" cy="${cy}" r="${r}" fill="white"/>
      </svg>`;

      const maskFilename = photo.filename_original.replace(/\.(jpg|jpeg|png|webp)$/i, '_mask.png');
      await sharp(Buffer.from(svg)).png().toFile(path.join(maskDir, maskFilename));
      count++;
    }

    res.json({ generated: count, maskDir: '/photos/masks/' });
  } catch (e) {
    console.error('Mask generation error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ============ TELEGRAM BOT ============

// ============ BOT TRANSLATIONS ============
const BOT_I18N = {
  en: {
    welcome: '⚽ *Find the Ball!*\n\nCan you guess where the ball is hiding?\n\nLook at the photo, spot the clues and place your cursor as close as possible!\n\n🏆 Top 3 players win coins every week!',
    play: '🎮 Play',
    play_now: '🎮 Play now',
    no_players: 'No players on the leaderboard yet! Be the first!',
    lb_header: '🏆 *Top 10 - Find the Ball*\n\n',
    lb_entry: (medal, name, score, games) => `${medal} *${name}* — ${score} pts (${games} games)\n`,
    lb_footer: '\n_Play to get on the leaderboard!_',
    no_stats: 'Start playing to see your stats!',
    stats: (s) => `📊 *Your stats*\n\n💰 Coins: ${s.coins}\n🎯 Total score: ${s.totalScore}\n🎮 Games: ${s.gamesPlayed}\n⭐ Best session: ${s.bestSessionScore}\n📈 Average: ${s.avgScore}\n🏅 Rank: #${s.rank}`,
    help: '⚽ *How to play Find the Ball*\n\n1️⃣ A football photo appears — the ball has been erased!\n2️⃣ Look for clues: players\' eyes, feet position, body language\n3️⃣ Tap where you think the ball was\n4️⃣ The closer you are, the more points you score!\n\n💡 *Power-ups:*\n🔍 Reveal quarter (100 coins) — shows which quarter has the ball\n↔️ Expand area (50 coins) — increases your search zone\n\n🏆 *Rewards:*\nTop 3 weekly = Coin prizes!\nInvite friends = 10,000 coins!\n\n/start - Play\n/leaderboard - Rankings\n/stats - Your stats',
    daily_prize: (medal, rank, score, prize) => `${medal} *Congratulations!*\n\nYou finished *#${rank}* on this week's leaderboard with *${score}* points!\n\n+${prize} coins credited!`,
    referral: (name, games, reward) => `🎉 *+${reward} coins!*\n\n${name} played ${games} games thanks to your invite!\nYour coins have been credited automatically. Keep inviting friends!`
  },
  fr: {
    welcome: '⚽ *Find the Ball !*\n\nSauras-tu deviner ou se cache le ballon ?\n\nRegarde bien la photo, analyse les indices et place ton curseur le plus pres possible !\n\n🏆 Les 3 meilleurs joueurs gagnent des coins chaque semaine !',
    play: '🎮 Jouer',
    play_now: '🎮 Jouer maintenant',
    no_players: 'Pas encore de joueurs au classement ! Sois le premier !',
    lb_header: '🏆 *Top 10 - Find the Ball*\n\n',
    lb_entry: (medal, name, score, games) => `${medal} *${name}* — ${score} pts (${games} parties)\n`,
    lb_footer: '\n_Joue pour apparaitre au classement !_',
    no_stats: 'Commence a jouer pour voir tes stats !',
    stats: (s) => `📊 *Tes statistiques*\n\n💰 Coins : ${s.coins}\n🎯 Score total : ${s.totalScore}\n🎮 Parties : ${s.gamesPlayed}\n⭐ Meilleure session : ${s.bestSessionScore}\n📈 Moyenne : ${s.avgScore}\n🏅 Classement : #${s.rank}`,
    help: '⚽ *Comment jouer a Find the Ball*\n\n1️⃣ Une photo de foot s\'affiche — le ballon a ete efface !\n2️⃣ Analyse les indices : regard des joueurs, position des pieds\n3️⃣ Touche l\'ecran la ou tu penses que le ballon etait\n4️⃣ Plus tu es proche, plus tu marques de points !\n\n💡 *Power-ups :*\n🔍 Reveler un quart (100 coins) — montre quel quart contient le ballon\n↔️ Agrandir la zone (50 coins) — augmente ta zone de recherche\n\n🏆 *Recompenses :*\nTop 3 hebdo = Lots de coins !\nInvite des amis = 10 000 coins !\n\n/start - Jouer\n/leaderboard - Classement\n/stats - Tes stats',
    daily_prize: (medal, rank, score, prize) => `${medal} *Felicitations !*\n\nTu as termine *#${rank}* au classement de la semaine avec *${score}* points !\n\n+${prize} coins credites !`,
    referral: (name, games, reward) => `🎉 *+${reward} coins !*\n\n${name} a joue ${games} parties grace a ton invitation !\nTes coins ont ete credites automatiquement. Continue a inviter tes amis !`
  },
  es: {
    welcome: '⚽ *Find the Ball!*\n\nPuedes adivinar donde se esconde el balon?\n\nMira la foto, busca las pistas y coloca tu cursor lo mas cerca posible!\n\n🏆 Los 3 mejores jugadores ganan coins cada semana!',
    play: '🎮 Jugar',
    play_now: '🎮 Jugar ahora',
    no_players: 'Aun no hay jugadores en el ranking. Se el primero!',
    lb_header: '🏆 *Top 10 - Find the Ball*\n\n',
    lb_entry: (medal, name, score, games) => `${medal} *${name}* — ${score} pts (${games} partidas)\n`,
    lb_footer: '\n_Juega para aparecer en el ranking!_',
    no_stats: 'Empieza a jugar para ver tus estadisticas!',
    stats: (s) => `📊 *Tus estadisticas*\n\n💰 Coins: ${s.coins}\n🎯 Puntuacion total: ${s.totalScore}\n🎮 Partidas: ${s.gamesPlayed}\n⭐ Mejor sesion: ${s.bestSessionScore}\n📈 Promedio: ${s.avgScore}\n🏅 Posicion: #${s.rank}`,
    help: '⚽ *Como jugar Find the Ball*\n\n1️⃣ Aparece una foto de futbol — el balon ha sido borrado!\n2️⃣ Busca pistas: miradas de los jugadores, posicion de los pies\n3️⃣ Toca donde crees que estaba el balon\n4️⃣ Cuanto mas cerca, mas puntos!\n\n/start - Jugar\n/leaderboard - Ranking\n/stats - Tus stats',
    daily_prize: (medal, rank, score, prize) => `${medal} *Felicidades!*\n\nTerminaste *#${rank}* en el ranking semanal con *${score}* puntos!\n\n+${prize} coins acreditados!`,
    referral: (name, games, reward) => `🎉 *+${reward} coins!*\n\n${name} jugo ${games} partidas gracias a tu invitacion!\nTus coins se han acreditado automaticamente.`
  },
  ru: {
    welcome: '⚽ *Find the Ball!*\n\nСможешь угадать, где прячется мяч?\n\nСмотри на фото, ищи подсказки и ставь курсор как можно ближе!\n\n🏆 Топ-3 игрока получают монеты каждую неделю!',
    play: '🎮 Играть',
    play_now: '🎮 Играть сейчас',
    no_players: 'В рейтинге пока нет игроков! Будь первым!',
    lb_header: '🏆 *Топ 10 - Find the Ball*\n\n',
    lb_entry: (medal, name, score, games) => `${medal} *${name}* — ${score} очков (${games} игр)\n`,
    lb_footer: '\n_Играй, чтобы попасть в рейтинг!_',
    no_stats: 'Начни играть, чтобы увидеть статистику!',
    stats: (s) => `📊 *Твоя статистика*\n\n💰 Монеты: ${s.coins}\n🎯 Всего очков: ${s.totalScore}\n🎮 Игр: ${s.gamesPlayed}\n⭐ Лучшая сессия: ${s.bestSessionScore}\n📈 Среднее: ${s.avgScore}\n🏅 Место: #${s.rank}`,
    help: '⚽ *Как играть в Find the Ball*\n\n1️⃣ Появляется фото — мяч стерт!\n2️⃣ Ищи подсказки: взгляды игроков, позиции ног\n3️⃣ Нажми, где был мяч\n4️⃣ Чем ближе — тем больше очков!\n\n/start - Играть\n/leaderboard - Рейтинг\n/stats - Статистика',
    daily_prize: (medal, rank, score, prize) => `${medal} *Поздравляем!*\n\nТы занял *#${rank}* место в недельном рейтинге с *${score}* очками!\n\n+${prize} монет зачислено!`,
    referral: (name, games, reward) => `🎉 *+${reward} монет!*\n\n${name} сыграл ${games} игр благодаря твоему приглашению!\nМонеты зачислены автоматически.`
  }
};

function getBotLang(langCode) {
  if (!langCode) return 'en';
  const short = langCode.slice(0, 2).toLowerCase();
  return BOT_I18N[short] ? short : 'en';
}

function botT(langCode) {
  return BOT_I18N[getBotLang(langCode)] || BOT_I18N.en;
}

// Get user language from DB
function getUserLang(telegramId) {
  const user = db.getUser.get(telegramId);
  return user?.language_code || 'en';
}

// Wire bot + translations to game module (after BOT_I18N is defined)
if (bot) game.setBot(bot, botT);

function setupBot(bot) {
  // Handle Telegram Stars pre-checkout query (required to accept payments)
  bot.on('pre_checkout_query', (query) => {
    bot.answerPreCheckoutQuery(query.id, true);
  });

  // Handle successful Stars payment
  bot.on('message', (msg) => {
    if (msg.successful_payment) {
      const payload = msg.successful_payment.invoice_payload;
      // Parse payload: coins_{pack}_{userId}_{timestamp}
      const parts = payload.split('_');
      if (parts[0] === 'coins' && parts.length >= 3) {
        const coins = parseInt(parts[1]);
        const userId = parseInt(parts[2]);
        if (coins && userId) {
          db.createUser.run(userId, null, null);
          db.updateUserCoins.run(coins, userId);
          db.logTransaction.run(userId, coins, 'stars_payment', `Stars payment: ${msg.successful_payment.total_amount} XTR for ${coins} coins`);
          console.log(`Stars payment: ${coins} coins for user ${userId}`);
        }
      }
    }
  });

  bot.onText(/\/start(.*)/, (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const lang = msg.from.language_code;
    const t = botT(lang);
    const param = (match[1] || '').trim();

    // Save user language
    db.createUser.run(userId, msg.from.username || null, msg.from.first_name || null);
    db.updateLanguage.run(getBotLang(lang), userId);

    // Handle referral: /start ref_123456
    if (param.startsWith('ref_')) {
      const referrerId = parseInt(param.replace('ref_', ''));
      if (referrerId && referrerId !== userId) {
        db.setReferredBy.run(referrerId, userId);
        console.log(`Referral: user ${userId} referred by ${referrerId}`);
      }
    }

    bot.sendMessage(chatId, t.welcome, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[
          { text: t.play, web_app: { url: WEBAPP_URL } }
        ]]
      }
    });
  });

  bot.onText(/\/leaderboard/, async (msg) => {
    const chatId = msg.chat.id;
    const t = botT(msg.from.language_code);
    const lb = game.getLeaderboardData(10);

    if (lb.length === 0) {
      return bot.sendMessage(chatId, t.no_players);
    }

    let text = t.lb_header;
    const medals = ['🥇', '🥈', '🥉'];

    lb.forEach((entry, i) => {
      const medal = medals[i] || `${i + 1}.`;
      text += t.lb_entry(medal, entry.username, entry.totalScore, entry.gamesPlayed);
    });

    text += t.lb_footer;

    bot.sendMessage(chatId, text, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[
          { text: t.play_now, web_app: { url: WEBAPP_URL } }
        ]]
      }
    });
  });

  bot.onText(/\/stats/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const t = botT(msg.from.language_code);

    db.createUser.run(userId, msg.from.username || null, msg.from.first_name || null);
    db.updateLanguage.run(getBotLang(msg.from.language_code), userId);
    const stats = game.getUserStats(userId);

    if (!stats) {
      return bot.sendMessage(chatId, t.no_stats);
    }

    bot.sendMessage(chatId, t.stats(stats), { parse_mode: 'Markdown' });
  });

  bot.onText(/\/help/, (msg) => {
    const t = botT(msg.from.language_code);
    bot.sendMessage(msg.chat.id, t.help, { parse_mode: 'Markdown' });
  });
}

// ============ SEED DEMO DATA ============

// No auto-seeding - all photos are managed via /manage.html
// This prevents uploaded photos from being overwritten on redeploy
const photoCount = db.getAllPhotos.all().length;
console.log(`Photos in database: ${photoCount}`);

// Start server
// ============ WEEKLY LEADERBOARD RESET ============

const WEEKLY_PRIZES = { 1: 500, 2: 200, 3: 100 }; // coins awarded to top 3

function getWeekStr() {
  // Returns ISO week identifier e.g. "2026-W14"
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

function getNextMondayUTC() {
  const now = new Date();
  const next = new Date(now);
  next.setUTCHours(0, 0, 0, 0);
  // Days until next Monday (1 = Monday)
  const dayOfWeek = next.getUTCDay(); // 0=Sun, 1=Mon, ...
  const daysUntilMonday = (8 - dayOfWeek) % 7 || 7;
  next.setUTCDate(next.getUTCDate() + daysUntilMonday);
  return next;
}

function performWeeklyReset() {
  const thisWeek = getWeekStr();
  const lastWeekDate = new Date(Date.now() - 7 * 86400000);
  const lastWeekD = new Date(Date.UTC(lastWeekDate.getUTCFullYear(), lastWeekDate.getUTCMonth(), lastWeekDate.getUTCDate()));
  lastWeekD.setUTCDate(lastWeekD.getUTCDate() + 4 - (lastWeekD.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(lastWeekD.getUTCFullYear(), 0, 1));
  const lastWeekNo = Math.ceil((((lastWeekD - yearStart) / 86400000) + 1) / 7);
  const lastWeek = `${lastWeekD.getUTCFullYear()}-W${String(lastWeekNo).padStart(2, '0')}`;

  // Get top 3 from last week's scores before reset
  const top3 = db.getDailyTop3.all();

  if (top3.length > 0 && top3[0].daily_best_session > 0) {
    // Archive winners and reward them
    top3.forEach((winner, i) => {
      const rank = i + 1;
      const prize = WEEKLY_PRIZES[rank] || 0;
      const name = winner.username || winner.first_name || 'Anonymous';

      db.insertDailyWinner.run(lastWeek, rank, winner.telegram_id, name, winner.daily_best_session, prize);

      if (prize > 0) {
        db.updateUserCoins.run(prize, winner.telegram_id);
        db.logTransaction.run(winner.telegram_id, prize, 'weekly_prize', `Weekly leaderboard #${rank} prize`);

        // Notify winner via Telegram in their language
        if (bot) {
          const medals = ['', '🥇', '🥈', '🥉'];
          const winnerLang = getUserLang(winner.telegram_id);
          const t = botT(winnerLang);
          bot.sendMessage(winner.telegram_id,
            t.daily_prize(medals[rank], rank, winner.daily_best_session, prize),
            { parse_mode: 'Markdown' }
          ).catch(err => console.error('Failed to notify winner:', err.message));
        }
      }
    });

    console.log(`Weekly reset: archived ${top3.length} winners for ${lastWeek}`);
  }

  // Reset all scores for the new week
  db.resetAllDailyScores.run(thisWeek);
  console.log(`Weekly leaderboard reset for ${thisWeek}`);
}

// Check every minute if we need to reset (every Monday at midnight UTC)
let lastResetWeek = '';
function checkWeeklyReset() {
  const now = new Date();
  const currentWeek = getWeekStr();
  // Only reset on Monday (day 1) and only once per week
  if (now.getUTCDay() === 1 && currentWeek !== lastResetWeek) {
    performWeeklyReset();
    lastResetWeek = currentWeek;
  }
  // On first startup, set lastResetWeek to avoid immediate reset on non-Monday
  if (!lastResetWeek) lastResetWeek = currentWeek;
}

// API: Get time until next weekly reset (Monday 00:00 UTC)
app.get('/api/leaderboard/timer', (req, res) => {
  const now = new Date();
  const nextMonday = getNextMondayUTC();
  const msLeft = nextMonday - now;
  res.json({ resetIn: msLeft, resetAt: nextMonday.toISOString() });
});

app.listen(PORT, () => {
  console.log(`Find the Ball server running on port ${PORT}`);
  console.log(`Web app URL: ${WEBAPP_URL}`);

  // Run weekly reset check on startup + every minute
  checkWeeklyReset();
  setInterval(checkWeeklyReset, 60 * 1000);
});
