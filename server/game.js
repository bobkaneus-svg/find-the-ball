const db = require('./database');

// Reference to Telegram bot and translation function (set by index.js)
let telegramBot = null;
let botTranslateFn = null;
function setBot(bot, translateFn) { telegramBot = bot; botTranslateFn = translateFn; }

const REFERRAL_REWARD = 10000;
const REFERRAL_MIN_GAMES = 5;

function checkReferralReward(telegramId) {
  try {
    const refStatus = db.getReferralStatus.get(telegramId);
    if (!refStatus || !refStatus.referred_by || refStatus.referral_rewarded) return;

    // Check if this referred user has reached the required games
    if (refStatus.games_played >= REFERRAL_MIN_GAMES) {
      const referrerId = refStatus.referred_by;

      // Reward the referrer
      db.updateUserCoins.run(REFERRAL_REWARD, referrerId);
      db.logTransaction.run(referrerId, REFERRAL_REWARD, 'referral_reward', `Referral reward: user ${telegramId} played ${REFERRAL_MIN_GAMES} games`);

      // Mark as rewarded so we don't reward twice
      db.markReferralRewarded.run(telegramId);

      // Send Telegram notification to referrer in their language
      if (telegramBot && botTranslateFn) {
        const referredUser = db.getUser.get(telegramId);
        const referrerUser = db.getUser.get(referrerId);
        const name = referredUser?.first_name || referredUser?.username || 'A friend';
        const t = botTranslateFn(referrerUser?.language_code || 'en');
        telegramBot.sendMessage(referrerId,
          t.referral(name, REFERRAL_MIN_GAMES, REFERRAL_REWARD.toLocaleString()),
          { parse_mode: 'Markdown' }
        ).catch(err => console.error('Failed to send referral notification:', err.message));
      }

      console.log(`Referral reward: ${REFERRAL_REWARD} coins to user ${referrerId} (referred ${telegramId})`);
    }
  } catch (e) {
    console.error('Referral check error:', e.message);
  }
}

// Scoring constants
const MAX_SCORE = 1000;
const PERFECT_RADIUS = 15;    // pixels - within ball = perfect
const GREAT_RADIUS = 40;      // close
const GOOD_RADIUS = 80;       // decent
const OK_RADIUS = 150;        // some points
const MAX_RADIUS = 300;       // max distance for any points

// Power-up costs
const REVEAL_QUARTER_COST = 100;
const EXPAND_AREA_COST = 50;

function calculateScore(guessX, guessY, ballX, ballY, imageWidth, imageHeight) {
  // Normalize coordinates to percentage (0-100)
  const dx = guessX - ballX;
  const dy = guessY - ballY;
  const distance = Math.sqrt(dx * dx + dy * dy);

  // Scale distance based on image dimensions (use percentage-based distance)
  const maxDim = Math.max(imageWidth || 100, imageHeight || 100);
  const normalizedDistance = (distance / maxDim) * 100;

  let score = 0;
  let rating = '';

  if (normalizedDistance <= 2) {
    score = MAX_SCORE;
    rating = 'perfect';
  } else if (normalizedDistance <= 5) {
    score = Math.round(MAX_SCORE * 0.8 + (MAX_SCORE * 0.2) * (1 - (normalizedDistance - 2) / 3));
    rating = 'great';
  } else if (normalizedDistance <= 10) {
    score = Math.round(MAX_SCORE * 0.5 + (MAX_SCORE * 0.3) * (1 - (normalizedDistance - 5) / 5));
    rating = 'good';
  } else if (normalizedDistance <= 20) {
    score = Math.round(MAX_SCORE * 0.2 + (MAX_SCORE * 0.3) * (1 - (normalizedDistance - 10) / 10));
    rating = 'ok';
  } else if (normalizedDistance <= 35) {
    score = Math.round(MAX_SCORE * 0.05 + (MAX_SCORE * 0.15) * (1 - (normalizedDistance - 20) / 15));
    rating = 'far';
  } else {
    score = 0;
    rating = 'miss';
  }

  return {
    score: Math.max(0, score),
    distance: Math.round(normalizedDistance * 10) / 10,
    rating,
    rawDistance: Math.round(distance * 10) / 10
  };
}

function getRatingEmoji(rating) {
  const emojis = {
    perfect: '🎯',
    great: '🔥',
    good: '👍',
    ok: '😐',
    far: '😬',
    miss: '❌'
  };
  return emojis[rating] || '❓';
}

function getRatingMessage(rating, score) {
  const messages = {
    perfect: ['INCROYABLE!', 'PARFAIT!', 'BULL\'S EYE!'],
    great: ['EXCELLENT!', 'TRES PROCHE!', 'PRESQUE PARFAIT!'],
    good: ['BIEN JOUE!', 'PAS MAL!', 'BON INSTINCT!'],
    ok: ['CORRECT', 'CA PASSE', 'PEUT MIEUX FAIRE'],
    far: ['LOIN...', 'RATE!', 'ESSAIE ENCORE'],
    miss: ['COMPLETEMENT A COTE!', 'PERDU!', 'HORS ZONE']
  };
  const options = messages[rating] || ['???'];
  return options[Math.floor(Math.random() * options.length)];
}

function startNewRound(telegramId, lastPhotoId = 0) {
  // Try to get a photo the user hasn't seen recently, never the same as last round
  let photo = db.getRandomPhoto.get(telegramId, lastPhotoId || 0);
  if (!photo) {
    photo = db.getAnyRandomPhoto.get(lastPhotoId || 0);
  }

  if (!photo) {
    return { error: 'No photos available. Please try again later.' };
  }

  const round = db.createRound.run(telegramId, photo.id);

  // Photos uploaded via manage tool are in /uploads/, demo photos in /photos/
  const isUploaded = photo.filename_modified.startsWith('ftb_');
  const modifiedUrl = isUploaded
    ? `/uploads/modified/${photo.filename_modified}`
    : `/photos/modified/${photo.filename_modified}`;

  return {
    roundId: round.lastInsertRowid,
    photo: {
      id: photo.id,
      url: modifiedUrl,
      difficulty: photo.difficulty,
      sport: photo.sport,
      description: photo.description
    }
  };
}

function submitGuess(roundId, telegramId, guessX, guessY, usedReveal, usedExpand) {
  const round = db.getRoundById.get(roundId);
  if (!round) return { error: 'Round not found' };
  if (round.completed) return { error: 'Round already completed' };
  if (round.user_id !== telegramId) return { error: 'Not your round' };

  const photo = db.getPhotoById.get(round.photo_id);
  if (!photo) return { error: 'Photo not found' };

  // Calculate score
  const result = calculateScore(guessX, guessY, photo.ball_x, photo.ball_y, 100, 100);

  // Deduct coins for expand power-up only (reveal is already deducted via /api/game/reveal)
  if (usedExpand) {
    const user = db.getUserCoins.get(telegramId);
    if (!user || user.coins < EXPAND_AREA_COST) {
      return { error: 'Not enough coins' };
    }
    db.updateUserCoins.run(-EXPAND_AREA_COST, telegramId);
    db.logTransaction.run(telegramId, -EXPAND_AREA_COST, 'powerup', `Expand area in round ${roundId}`);
  }

  // Complete the round
  db.completeRound.run(guessX, guessY, result.distance, result.score, usedReveal ? 1 : 0, usedExpand ? 1 : 0, roundId);

  // Update user stats
  db.updateUserScore.run(result.score, result.score, telegramId);

  // Award bonus coins for good scores
  let bonusCoins = 0;
  if (result.rating === 'perfect') bonusCoins = 50;
  else if (result.rating === 'great') bonusCoins = 25;
  else if (result.rating === 'good') bonusCoins = 10;
  else if (result.rating === 'ok') bonusCoins = 5;

  if (bonusCoins > 0) {
    db.updateUserCoins.run(bonusCoins, telegramId);
    db.logTransaction.run(telegramId, bonusCoins, 'reward', `Score reward: ${result.rating}`);
  }

  // Check referral reward: if this user was referred and just hit 5 games, reward referrer
  checkReferralReward(telegramId);

  // Check and award badges
  const newBadges = checkAndAwardBadges(telegramId, result);

  return {
    score: result.score,
    distance: result.distance,
    rating: result.rating,
    emoji: getRatingEmoji(result.rating),
    message: getRatingMessage(result.rating, result.score),
    bonusCoins,
    newBadges,
    ballPosition: {
      x: photo.ball_x,
      y: photo.ball_y
    },
    originalPhoto: photo.filename_original.startsWith('ftb_')
      ? `/uploads/originals/${photo.filename_original}`
      : `/photos/originals/${photo.filename_original}`,
    guessPosition: { x: guessX, y: guessY }
  };
}

function getLeaderboardData(limit = 50) {
  const entries = db.getLeaderboard.all(limit);
  return entries.map((entry, index) => ({
    rank: index + 1,
    username: entry.username || entry.first_name || 'Anonymous',
    firstName: entry.first_name,
    totalScore: entry.total_score,
    gamesPlayed: entry.games_played,
    bestScore: entry.best_round_score,
    bestSessionScore: entry.best_session_score || 0,
    dailyBestSession: entry.daily_best_session || 0,
    avgScore: entry.games_played > 0 ? Math.round(entry.total_score / entry.games_played) : 0
  }));
}

function endSession(telegramId, sessionScore) {
  if (sessionScore > 0) {
    db.updateBestSessionScore.run(sessionScore, sessionScore, telegramId);
  }
  const user = db.getUser.get(telegramId);
  return {
    bestSessionScore: user?.best_session_score || 0,
    dailyBestSession: user?.daily_best_session || 0
  };
}

function checkAndAwardBadges(telegramId, result) {
  const newBadges = [];

  // Get current user data
  const userData = db.getUser.get(telegramId);
  if (!userData) return newBadges;

  const existingBadges = db.getUserBadges.all(telegramId).map(b => b.badge_id);

  function award(badgeId) {
    if (!existingBadges.includes(badgeId)) {
      db.addBadge.run(telegramId, badgeId);
      newBadges.push(badgeId);
    }
  }

  // Games played milestones
  if (userData.games_played >= 1) award('first_game');
  if (userData.games_played >= 10) award('veteran');
  if (userData.games_played >= 50) award('addict');
  if (userData.games_played >= 100) award('legend');

  // Precision badges
  if (result.rating === 'perfect') {
    db.updatePerfectCount.run(telegramId);
    const updated = db.getUser.get(telegramId);
    if (updated.perfect_count >= 1) award('sharpshooter');
    if (updated.perfect_count >= 5) award('eagle_eye');
    if (updated.perfect_count >= 10) award('sniper');
  }

  // Streak badges (good round = not miss/far)
  if (result.rating !== 'miss' && result.rating !== 'far') {
    const newStreak = (userData.current_streak || 0) + 1;
    db.updateUserStreak.run(newStreak, newStreak, telegramId);
    if (newStreak >= 3) award('hot_streak_3');
    if (newStreak >= 5) award('unstoppable_5');
    if (newStreak >= 10) award('machine_10');
    if (newStreak >= 20) award('god_mode_20');
  } else {
    db.resetStreak.run(telegramId);
  }

  // Total score badges
  if (userData.total_score >= 1000) award('scorer_1k');
  if (userData.total_score >= 5000) award('scorer_5k');
  if (userData.total_score >= 25000) award('scorer_25k');
  if (userData.total_score >= 100000) award('scorer_100k');

  // Coin collector
  if (userData.coins >= 5000) award('coin_collector');

  // Comeback kid: score 800+ after having scored under 200 on previous round
  const lastScore = userData.last_round_score || 0;
  if (lastScore > 0 && lastScore < 200 && result.score >= 800) {
    award('comeback_kid');
  }

  // Save this round's score as last_round_score for next comeback check
  db.updateLastRoundScore.run(result.score, telegramId);

  return newBadges;
}

function getUserStats(telegramId) {
  const user = db.getUser.get(telegramId);
  if (!user) return null;

  const rank = db.getUserRank.get(telegramId);

  return {
    coins: user.coins,
    totalScore: user.total_score,
    gamesPlayed: user.games_played,
    bestRoundScore: user.best_round_score,
    bestSessionScore: user.best_session_score || 0,
    dailyBestSession: user.daily_best_session || 0,
    avgScore: user.games_played > 0 ? Math.round(user.total_score / user.games_played) : 0,
    rank: rank?.rank || 0
  };
}

module.exports = {
  calculateScore,
  startNewRound,
  submitGuess,
  getLeaderboardData,
  getUserStats,
  endSession,
  checkAndAwardBadges,
  setBot,
  REVEAL_QUARTER_COST,
  EXPAND_AREA_COST
};
