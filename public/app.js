// ============ FIND THE BALL - TELEGRAM MINI APP ============

const API_BASE = '';
let tg = null;
let initData = '';

// State
const state = {
  user: null,
  currentRound: null,
  cursorPosition: null,
  isDragging: false,
  hintDismissed: false,
  usedReveal: false,
  usedExpand: false,
  sessionScore: 0
};

// ============ INIT ============

document.addEventListener('DOMContentLoaded', () => {
  // Telegram WebApp
  if (window.Telegram?.WebApp) {
    tg = window.Telegram.WebApp;
    tg.ready();
    tg.expand();
    initData = tg.initData;

    // Apply Telegram theme
    if (tg.themeParams) {
      document.documentElement.style.setProperty('--tg-bg', tg.themeParams.bg_color || '#2a2a2a');
    }
  }

  init();
});

async function init() {
  const loadingStart = Date.now();
  try {
    const res = await api('/api/auth', 'POST');
    state.user = res.user;
    updateAllCoinDisplays();
    updateMenuStats();

    // Ensure loading screen is visible for at least 1.5s
    const elapsed = Date.now() - loadingStart;
    const remaining = 1500 - elapsed;
    if (remaining > 0) {
      await new Promise(resolve => setTimeout(resolve, remaining));
    }

    showScreen('menu');
  } catch (err) {
    console.error('Auth failed:', err);
    // Dev mode fallback
    state.user = { telegramId: 12345, coins: 200, totalScore: 0, gamesPlayed: 0, bestRoundScore: 0, rank: 0 };
    updateAllCoinDisplays();
    updateMenuStats();

    const elapsed = Date.now() - loadingStart;
    const remaining = 1500 - elapsed;
    if (remaining > 0) {
      await new Promise(resolve => setTimeout(resolve, remaining));
    }

    showScreen('menu');
  }
}

// ============ API ============

async function api(path, method = 'GET', body = null) {
  const headers = { 'Content-Type': 'application/json' };

  if (initData) {
    headers['X-Telegram-Init-Data'] = initData;
  } else {
    headers['X-Telegram-Id'] = '12345'; // Dev mode
  }

  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(`${API_BASE}${path}`, opts);
  const data = await res.json();

  if (!res.ok) throw new Error(data.error || 'API error');
  return data;
}

// ============ CUSTOM MODAL (iOS-style alert) ============

function showModal(message) {
  return new Promise((resolve) => {
    const overlay = document.getElementById('custom-modal');
    const msgEl = document.getElementById('modal-message');
    const btnNo = document.getElementById('modal-btn-no');
    const btnYes = document.getElementById('modal-btn-yes');

    msgEl.textContent = message;
    overlay.classList.add('active');

    function cleanup() {
      overlay.classList.remove('active');
      btnNo.removeEventListener('click', onNo);
      btnYes.removeEventListener('click', onYes);
    }

    function onNo() {
      cleanup();
      resolve(false);
    }

    function onYes() {
      cleanup();
      resolve(true);
    }

    btnNo.addEventListener('click', onNo);
    btnYes.addEventListener('click', onYes);
  });
}

// ============ SCREENS ============

function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const screen = document.getElementById(`screen-${name}`);
  screen.classList.add('active');
  screen.classList.add('screen-enter');
  setTimeout(() => screen.classList.remove('screen-enter'), 300);
}

// ============ MENU ============

function updateMenuStats() {
  if (!state.user) return;
  document.getElementById('menu-high-score').textContent = state.user.bestRoundScore || 0;

  // Trophies
  const totalScore = state.user.totalScore || 0;
  document.querySelectorAll('.trophy').forEach(t => {
    const threshold = parseInt(t.dataset.threshold);
    if (totalScore >= threshold) {
      t.classList.add('unlocked');
    } else {
      t.classList.remove('unlocked');
    }
  });
}

function updateAllCoinDisplays() {
  const coins = state.user?.coins || 0;
  document.querySelectorAll('#game-coins, #shop-coins').forEach(el => {
    el.textContent = coins.toLocaleString();
  });
}

// ============ GAME ============

// Start a fresh game session (resets score)
function startNewSession() {
  state.sessionScore = 0;
  loadNextRound();
}

// Continue session with next round (keeps score)
async function loadNextRound() {
  try {
    const res = await api('/api/game/start', 'POST');
    state.currentRound = res;
    state.cursorPosition = null;
    state.isDragging = false;
    state.hintDismissed = false;
    state.usedReveal = false;
    state.usedExpand = false;

    // Set photo
    const photo = document.getElementById('game-photo');
    photo.src = res.photo.url;

    // Reset UI
    const searchCircle = document.getElementById('search-circle');
    searchCircle.classList.remove('visible', 'expanded', 'placed');
    document.getElementById('drag-hint').classList.remove('hidden');
    document.getElementById('quarter-overlay').classList.remove('active');
    document.getElementById('btn-confirm').disabled = true;
    document.getElementById('btn-confirm').classList.remove('ready');
    document.getElementById('btn-reveal').classList.remove('used');
    document.getElementById('btn-expand').classList.remove('used');
    document.getElementById('btn-reveal').disabled = false;
    document.getElementById('btn-expand').disabled = false;
    document.getElementById('game-score-text').textContent = `SCORE ${state.sessionScore}`;

    // Update coins in HUD
    updateAllCoinDisplays();

    // Clear quarter highlights
    document.querySelectorAll('.quarter').forEach(q => {
      q.classList.remove('revealed-yes', 'revealed-no');
    });

    showScreen('game');
    setupGameTouchHandlers();
  } catch (err) {
    showModal(err.message || 'Impossible de demarrer la partie');
  }
}

// Legacy alias
function startGame() {
  startNewSession();
}

function setupGameTouchHandlers() {
  const container = document.getElementById('photo-container');

  // Remove old listeners by cloning
  const newContainer = container.cloneNode(true);
  container.parentNode.replaceChild(newContainer, container);

  const photoContainer = document.getElementById('photo-container');

  function handleMove(clientX, clientY) {
    const rect = photoContainer.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * 100;
    const y = ((clientY - rect.top) / rect.height) * 100;

    // Clamp
    const clampedX = Math.max(0, Math.min(100, x));
    const clampedY = Math.max(0, Math.min(100, y));

    state.cursorPosition = { x: clampedX, y: clampedY };

    const sc = document.getElementById('search-circle');
    sc.style.left = `${clampedX}%`;
    sc.style.top = `${clampedY}%`;
    sc.classList.add('visible');
    sc.classList.add('placed');

    // Hide hint
    if (!state.hintDismissed) {
      state.hintDismissed = true;
      document.getElementById('drag-hint').classList.add('hidden');
    }

    // Enable confirm
    const cb = document.getElementById('btn-confirm');
    cb.disabled = false;
    cb.classList.add('ready');
  }

  photoContainer.addEventListener('touchstart', (e) => {
    e.preventDefault();
    state.isDragging = true;
    const touch = e.touches[0];
    handleMove(touch.clientX, touch.clientY);
  }, { passive: false });

  photoContainer.addEventListener('touchmove', (e) => {
    e.preventDefault();
    if (!state.isDragging) return;
    const touch = e.touches[0];
    handleMove(touch.clientX, touch.clientY);
  }, { passive: false });

  photoContainer.addEventListener('touchend', () => {
    state.isDragging = false;
  });

  // Mouse support for dev
  photoContainer.addEventListener('mousedown', (e) => {
    state.isDragging = true;
    handleMove(e.clientX, e.clientY);
  });

  photoContainer.addEventListener('mousemove', (e) => {
    if (!state.isDragging) return;
    handleMove(e.clientX, e.clientY);
  });

  photoContainer.addEventListener('mouseup', () => {
    state.isDragging = false;
  });
}

async function submitGuess() {
  if (!state.cursorPosition || !state.currentRound) return;

  const confirmBtn = document.getElementById('btn-confirm');
  confirmBtn.disabled = true;

  try {
    const result = await api('/api/game/guess', 'POST', {
      roundId: state.currentRound.roundId,
      guessX: state.cursorPosition.x,
      guessY: state.cursorPosition.y,
      usedReveal: state.usedReveal,
      usedExpand: state.usedExpand
    });

    // Update user state
    state.sessionScore += result.score;
    state.user.coins = state.user.coins - (state.usedReveal ? 100 : 0) - (state.usedExpand ? 50 : 0) + (result.bonusCoins || 0);
    state.user.totalScore = (state.user.totalScore || 0) + result.score;
    state.user.gamesPlayed = (state.user.gamesPlayed || 0) + 1;
    if (result.score > (state.user.bestRoundScore || 0)) {
      state.user.bestRoundScore = result.score;
    }

    // Check if game over (miss = 0 points)
    if (result.rating === 'miss') {
      // Update high score if session score is the best
      if (state.sessionScore > (state.user.bestRoundScore || 0)) {
        state.user.bestRoundScore = state.sessionScore;
      }
      showGameOver(result);
    } else {
      showResult(result);
    }
  } catch (err) {
    showModal(err.message || 'Erreur');
    confirmBtn.disabled = false;
  }
}

function showGameOver(result) {
  // Haptic
  if (tg) tg.HapticFeedback.notificationOccurred('error');

  document.getElementById('gameover-score').textContent = state.sessionScore;
  showScreen('gameover');
}

function showResult(result) {
  // Set result header
  const header = document.getElementById('result-header');
  header.className = `result-header rating-${result.rating}`;

  document.getElementById('result-emoji').textContent = result.emoji;
  document.getElementById('result-message').textContent = result.message;
  document.getElementById('result-score').textContent = `+${result.score}`;
  document.getElementById('result-score').classList.add('score-animate');

  // Distance
  document.getElementById('result-distance').textContent = `${result.distance}%`;

  // Bonus coins
  const bonusContainer = document.getElementById('result-bonus-container');
  if (result.bonusCoins > 0) {
    bonusContainer.style.display = 'block';
    document.getElementById('result-bonus').textContent = `+${result.bonusCoins}`;
  } else {
    bonusContainer.style.display = 'none';
  }

  // Show original photo with markers
  const resultPhoto = document.getElementById('result-photo');
  resultPhoto.src = result.originalPhoto;

  // Position guess marker
  const guessMarker = document.getElementById('result-guess');
  guessMarker.style.left = `${result.guessPosition.x}%`;
  guessMarker.style.top = `${result.guessPosition.y}%`;

  // Position ball marker
  const ballMarker = document.getElementById('result-ball');
  ballMarker.style.left = `${result.ballPosition.x}%`;
  ballMarker.style.top = `${result.ballPosition.y}%`;

  // Draw distance line
  const line = document.getElementById('distance-line');
  resultPhoto.onload = () => {
    line.setAttribute('x1', `${result.guessPosition.x}%`);
    line.setAttribute('y1', `${result.guessPosition.y}%`);
    line.setAttribute('x2', `${result.ballPosition.x}%`);
    line.setAttribute('y2', `${result.ballPosition.y}%`);
  };

  // Haptic feedback
  if (tg) {
    if (result.rating === 'perfect' || result.rating === 'great') {
      tg.HapticFeedback.notificationOccurred('success');
    } else {
      tg.HapticFeedback.impactOccurred('medium');
    }
  }

  updateAllCoinDisplays();

  // Celebrate animation for perfect/great scores
  const resultHeader = document.getElementById('result-header');
  resultHeader.classList.remove('celebrate');
  if (result.rating === 'perfect' || result.rating === 'great') {
    resultHeader.classList.add('celebrate');
  }

  // Show coin bonus toast
  if (result.bonusCoins > 0) {
    showToast(`+${result.bonusCoins} coins!`);
  }

  showScreen('result');
}

// ============ POWER-UPS ============

async function useRevealQuarter() {
  if (state.usedReveal) return;
  if ((state.user?.coins || 0) < 100) {
    await showModal('Pas assez de coins! (100 requis)');
    return;
  }

  const confirmed = await showModal('Reveal quarter?\n(100 Coins)');
  if (!confirmed) return;

  state.usedReveal = true;
  document.getElementById('btn-reveal').classList.add('used');
  document.getElementById('btn-reveal').disabled = true;

  // Show quarter overlay
  const overlay = document.getElementById('quarter-overlay');
  overlay.classList.add('active');

  // Auto-hide after 3 seconds
  setTimeout(() => {
    overlay.classList.remove('active');
  }, 3000);

  if (tg) tg.HapticFeedback.impactOccurred('light');
}

async function useExpandArea() {
  if (state.usedExpand) return;
  if ((state.user?.coins || 0) < 50) {
    await showModal('Pas assez de coins! (50 requis)');
    return;
  }

  const confirmed = await showModal('Expand search area?\n(50 Coins)');
  if (!confirmed) return;

  state.usedExpand = true;
  document.getElementById('btn-expand').classList.add('used');
  document.getElementById('btn-expand').disabled = true;

  // Show expanded search circle
  const searchCircle = document.getElementById('search-circle');
  searchCircle.classList.add('expanded');

  if (tg) tg.HapticFeedback.impactOccurred('light');
}

// ============ LEADERBOARD ============

async function showLeaderboard() {
  showScreen('leaderboard');

  try {
    const [lbData, statsData] = await Promise.all([
      api('/api/leaderboard?limit=50'),
      state.user ? api('/api/user/stats') : null
    ]);

    if (statsData) {
      document.getElementById('lb-my-rank').textContent = `#${statsData.rank || '-'}`;
    }

    const list = document.getElementById('lb-list');
    list.innerHTML = '';

    if (lbData.leaderboard.length === 0) {
      list.innerHTML = '<p style="text-align:center;padding:40px;color:var(--text-muted)">Aucun joueur pour le moment.<br>Sois le premier!</p>';
      return;
    }

    const medals = ['&#129351;', '&#129352;', '&#129353;'];

    lbData.leaderboard.forEach(entry => {
      const div = document.createElement('div');
      div.className = 'lb-entry';
      div.innerHTML = `
        <span class="lb-rank">${medals[entry.rank - 1] || entry.rank}</span>
        <div class="lb-info">
          <div class="lb-name">${escapeHtml(entry.username)}</div>
          <div class="lb-games">${entry.gamesPlayed} parties | Moy: ${entry.avgScore}</div>
        </div>
        <span class="lb-score">${entry.totalScore.toLocaleString()}</span>
      `;
      list.appendChild(div);
    });
  } catch (err) {
    console.error('Leaderboard error:', err);
  }
}

// ============ SHOP ============

function showShop() {
  updateAllCoinDisplays();
  showScreen('shop');
}

async function buyPack(packSize) {
  try {
    // In production, integrate Telegram Stars payment
    if (tg) {
      await showModal('Paiement Telegram Stars bientot disponible!\nPour le moment, utilise les pubs gratuites.');
      return;
    }

    const res = await api('/api/shop/buy', 'POST', { pack: packSize });
    state.user.coins = res.coins;
    updateAllCoinDisplays();
    if (tg) tg.HapticFeedback.notificationOccurred('success');
    showToast(`+${res.purchased} coins!`);
  } catch (err) {
    await showModal(err.message);
  }
}

async function watchAdReward() {
  try {
    // In production, integrate ad SDK
    if (tg) tg.HapticFeedback.impactOccurred('medium');

    const res = await api('/api/shop/ad-reward', 'POST');
    state.user.coins = res.coins;
    updateAllCoinDisplays();
    showToast(`+${res.reward} coins!`);
  } catch (err) {
    await showModal(err.message);
  }
}

// ============ UTILITIES ============

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function showToast(message, duration = 3000) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  container.appendChild(toast);

  // Trigger slide-in
  requestAnimationFrame(() => {
    toast.classList.add('visible');
  });

  setTimeout(() => {
    toast.classList.remove('visible');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

function shareScore() {
  if (!state.currentRound) return;
  const score = state.sessionScore;
  const shareText = `J'ai marque ${score} points sur Find the Ball! Tu peux faire mieux?`;

  if (tg && tg.shareUrl) {
    const url = window.location.origin || 'https://t.me/FindTheBallBot';
    tg.shareUrl(url, shareText);
  } else {
    showToast(shareText, 4000);
  }
}

// ============ EVENT LISTENERS ============

// Menu buttons
document.getElementById('btn-play').addEventListener('click', startNewSession);
document.getElementById('btn-shop').addEventListener('click', showShop);

// Game buttons
document.getElementById('btn-pause').addEventListener('click', () => {
  document.getElementById('overlay-pause').classList.add('active');
});
document.getElementById('btn-confirm').addEventListener('click', submitGuess);
document.getElementById('btn-reveal').addEventListener('click', useRevealQuarter);
document.getElementById('btn-expand').addEventListener('click', useExpandArea);

// Pause overlay
document.getElementById('btn-resume').addEventListener('click', () => {
  document.getElementById('overlay-pause').classList.remove('active');
});
document.getElementById('btn-leaderboard').addEventListener('click', () => {
  document.getElementById('overlay-pause').classList.remove('active');
  showLeaderboard();
});
document.getElementById('btn-quit').addEventListener('click', () => {
  document.getElementById('overlay-pause').classList.remove('active');
  // Quitting mid-game = game over with current score
  if (state.sessionScore > (state.user.bestRoundScore || 0)) {
    state.user.bestRoundScore = state.sessionScore;
  }
  state.sessionScore = 0;
  updateMenuStats();
  showScreen('menu');
});

// Result buttons - continue session (don't reset score)
document.getElementById('btn-next-round').addEventListener('click', loadNextRound);
document.getElementById('btn-back-menu').addEventListener('click', () => {
  state.sessionScore = 0;
  updateMenuStats();
  updateAllCoinDisplays();
  showScreen('menu');
});

// Game Over buttons
document.getElementById('btn-restart').addEventListener('click', startNewSession);
document.getElementById('btn-gameover-shop').addEventListener('click', () => {
  showShop();
});
document.getElementById('btn-gameover-menu').addEventListener('click', () => {
  state.sessionScore = 0;
  updateMenuStats();
  updateAllCoinDisplays();
  showScreen('menu');
});

// Leaderboard back
document.getElementById('btn-lb-back').addEventListener('click', async () => {
  try {
    const statsData = await api('/api/user/stats');
    if (statsData && state.user) {
      Object.assign(state.user, statsData);
      updateMenuStats();
      updateAllCoinDisplays();
    }
  } catch (e) {
    console.error('Failed to refresh stats:', e);
  }
  showScreen('menu');
});

// Shop
document.getElementById('btn-shop-back').addEventListener('click', () => showScreen('menu'));
document.querySelectorAll('.shop-item[data-pack]').forEach(item => {
  item.addEventListener('click', () => {
    const pack = parseInt(item.dataset.pack);
    buyPack(pack);
  });
});
document.getElementById('btn-watch-ad').addEventListener('click', watchAdReward);

// Share score button
const shareBtn = document.getElementById('btn-share-score');
if (shareBtn) {
  shareBtn.addEventListener('click', shareScore);
}
