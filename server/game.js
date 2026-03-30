const db = require('./database');

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

function startNewRound(telegramId) {
  // Try to get a photo the user hasn't seen recently
  let photo = db.getRandomPhoto.get(telegramId);
  if (!photo) {
    photo = db.getAnyRandomPhoto.get();
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

  // Deduct coins for power-ups used
  let coinsCost = 0;
  if (usedReveal) coinsCost += REVEAL_QUARTER_COST;
  if (usedExpand) coinsCost += EXPAND_AREA_COST;

  if (coinsCost > 0) {
    const user = db.getUserCoins.get(telegramId);
    if (!user || user.coins < coinsCost) {
      return { error: 'Not enough coins' };
    }
    db.updateUserCoins.run(-coinsCost, telegramId);
    db.logTransaction.run(telegramId, -coinsCost, 'powerup', `Power-ups used in round ${roundId}`);
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

  return {
    score: result.score,
    distance: result.distance,
    rating: result.rating,
    emoji: getRatingEmoji(result.rating),
    message: getRatingMessage(result.rating, result.score),
    bonusCoins,
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
    avgScore: entry.games_played > 0 ? Math.round(entry.total_score / entry.games_played) : 0
  }));
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
  REVEAL_QUARTER_COST,
  EXPAND_AREA_COST
};
