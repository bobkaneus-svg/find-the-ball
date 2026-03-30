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

function seedDemoPhotos() {
  const existing = db.getAllPhotos.all();
  if (existing.length > 0) return;

  const demoPhotos = [
    { original: 'demo_01.jpg', modified: 'demo_01.jpg', ball_x: 62, ball_y: 45, difficulty: 'easy', description: 'Corner kick scene' },
    { original: 'demo_02.jpg', modified: 'demo_02.jpg', ball_x: 25, ball_y: 70, difficulty: 'medium', description: 'Dribbling past defender' },
    { original: 'demo_03.jpg', modified: 'demo_03.jpg', ball_x: 80, ball_y: 55, difficulty: 'hard', description: 'Long pass across field' },
    { original: 'demo_04.jpg', modified: 'demo_04.jpg', ball_x: 50, ball_y: 35, difficulty: 'easy', description: 'Kick-off position' },
    { original: 'demo_05.jpg', modified: 'demo_05.jpg', ball_x: 15, ball_y: 60, difficulty: 'medium', description: 'Free kick lineup' },
    { original: 'demo_06.jpg', modified: 'demo_06.jpg', ball_x: 70, ball_y: 80, difficulty: 'hard', description: 'Goal-line scramble' },
    { original: 'demo_07.jpg', modified: 'demo_07.jpg', ball_x: 90, ball_y: 50, difficulty: 'easy', description: 'Throw-in moment' },
    { original: 'demo_08.jpg', modified: 'demo_08.jpg', ball_x: 45, ball_y: 25, difficulty: 'medium', description: 'Header duel' },
    { original: 'demo_09.jpg', modified: 'demo_09.jpg', ball_x: 35, ball_y: 55, difficulty: 'hard', description: 'Midfield battle' },
    { original: 'demo_10.jpg', modified: 'demo_10.jpg', ball_x: 55, ball_y: 65, difficulty: 'easy', description: 'Penalty area action' }
  ];

  demoPhotos.forEach(p => {
    db.addPhoto.run(p.original, p.modified, p.ball_x, p.ball_y, 30, p.difficulty, 'football', p.description);
  });

  console.log(`Seeded ${demoPhotos.length} demo photos`);
}

seedDemoPhotos();

// Start server
app.listen(PORT, () => {
  console.log(`Find the Ball server running on port ${PORT}`);
  console.log(`Web app URL: ${WEBAPP_URL}`);
});
