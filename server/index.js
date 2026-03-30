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
const ADMIN_IDS = (process.env.ADMIN_IDS || '').split(',').map(Number);
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'ftb-admin-2024';

// Telegram Bot
let bot;
if (BOT_TOKEN) {
  bot = new TelegramBot(BOT_TOKEN, { polling: true });
  setupBot(bot);
  console.log('Telegram bot started');
}

// Middleware
app.use(cors());
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
  if (req.query.key === ADMIN_SECRET) {
    req.telegramUser = { id: ADMIN_IDS[0] || 0 };
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
  if (!req.telegramUser || !ADMIN_IDS.includes(req.telegramUser.id)) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
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

// Start a new round
app.post('/api/game/start', authMiddleware, (req, res) => {
  const result = game.startNewRound(req.telegramUser.id);
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

  // Check coins
  const user = db.getUserCoins.get(req.telegramUser.id);
  if (!user || user.coins < 100) {
    return res.status(400).json({ error: 'Not enough coins' });
  }

  // Deduct coins
  db.updateUserCoins.run(-100, req.telegramUser.id);
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
  const { roundId, guessX, guessY, usedReveal, usedExpand } = req.body;

  if (roundId == null || guessX == null || guessY == null) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const result = game.submitGuess(
    roundId,
    req.telegramUser.id,
    parseFloat(guessX),
    parseFloat(guessY),
    !!usedReveal,
    !!usedExpand
  );

  if (result.error) {
    return res.status(400).json({ error: result.error });
  }

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

// Watch ad reward (placeholder)
app.post('/api/shop/ad-reward', authMiddleware, (req, res) => {
  const REWARD = 50;
  db.updateUserCoins.run(REWARD, req.telegramUser.id);
  db.logTransaction.run(req.telegramUser.id, REWARD, 'ad_reward', 'Watched video ad');
  const user = db.getUser.get(req.telegramUser.id);
  res.json({ coins: user.coins, reward: REWARD });
});

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
      parseFloat(ball_radius) || 25,
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

function setupBot(bot) {
  bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, '⚽ *Find the Ball!*\n\nPeux-tu deviner ou se cache le ballon?\n\nRegarde bien la photo, analyse les indices et place ton curseur le plus pres possible!\n\n🏆 Les 50 meilleurs joueurs gagnent des recompenses!', {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[
          { text: '🎮 Jouer', web_app: { url: WEBAPP_URL } }
        ]]
      }
    });
  });

  bot.onText(/\/leaderboard/, async (msg) => {
    const chatId = msg.chat.id;
    const lb = game.getLeaderboardData(10);

    if (lb.length === 0) {
      return bot.sendMessage(chatId, 'Pas encore de joueurs dans le classement!');
    }

    let text = '🏆 *Top 10 - Find the Ball*\n\n';
    const medals = ['🥇', '🥈', '🥉'];

    lb.forEach((entry, i) => {
      const medal = medals[i] || `${i + 1}.`;
      text += `${medal} *${entry.username}* — ${entry.totalScore} pts (${entry.gamesPlayed} parties)\n`;
    });

    text += '\n_Joue pour apparaitre dans le classement!_';

    bot.sendMessage(chatId, text, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[
          { text: '🎮 Jouer maintenant', web_app: { url: WEBAPP_URL } }
        ]]
      }
    });
  });

  bot.onText(/\/stats/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    db.createUser.run(userId, msg.from.username || null, msg.from.first_name || null);
    const stats = game.getUserStats(userId);

    if (!stats) {
      return bot.sendMessage(chatId, 'Commence a jouer pour voir tes stats!');
    }

    bot.sendMessage(chatId, `📊 *Tes statistiques*\n\n💰 Coins: ${stats.coins}\n🎯 Score total: ${stats.totalScore}\n🎮 Parties: ${stats.gamesPlayed}\n⭐ Meilleur score: ${stats.bestRoundScore}\n📈 Moyenne: ${stats.avgScore}\n🏅 Classement: #${stats.rank}`, {
      parse_mode: 'Markdown'
    });
  });

  bot.onText(/\/help/, (msg) => {
    bot.sendMessage(msg.chat.id, `⚽ *Comment jouer a Find the Ball*\n\n1️⃣ Une photo de foot s'affiche — le ballon a ete efface!\n2️⃣ Analyse les indices: regard des joueurs, position des pieds, du corps\n3️⃣ Touche l'ecran la ou tu penses que le ballon se trouvait\n4️⃣ Plus tu es proche, plus tu gagnes de points!\n\n💡 *Power-ups:*\n🔍 Reveler un quart (100 coins) — montre si le ballon est dans un quart\n↔️ Agrandir la zone (50 coins) — augmente ta zone de selection\n\n🏆 *Recompenses:*\nTop 3 = Gros lots!\nTop 50 = Cash rewards!\n\n/start - Jouer\n/leaderboard - Classement\n/stats - Tes stats`, {
      parse_mode: 'Markdown'
    });
  });
}

// ============ SEED DEMO DATA ============

// No auto-seeding - all photos are managed via /manage.html
// This prevents uploaded photos from being overwritten on redeploy
const photoCount = db.getAllPhotos.all().length;
console.log(`Photos in database: ${photoCount}`);

// Start server
app.listen(PORT, () => {
  console.log(`Find the Ball server running on port ${PORT}`);
  console.log(`Web app URL: ${WEBAPP_URL}`);
});
