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
  const prev = document.querySelector('.screen.active');
  if (prev) {
    prev.classList.add('screen-exit');
    setTimeout(() => {
      prev.classList.remove('active', 'screen-exit');
    }, 200);
  }

  const screen = document.getElementById(`screen-${name}`);
  setTimeout(() => {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    screen.classList.add('active', 'screen-enter');
    setTimeout(() => screen.classList.remove('screen-enter'), 400);
  }, prev ? 150 : 0);
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

// Preload next photo for instant display
let preloadedRound = null;

async function preloadNextRound() {
  try {
    const res = await api('/api/game/start', 'POST');
    preloadedRound = res;
    // Preload image into browser cache
    const img = new Image();
    img.src = res.photo.url;
  } catch (e) {
    preloadedRound = null;
  }
}

// Continue session with next round (keeps score)
async function loadNextRound() {
  try {
    let res;
    if (preloadedRound) {
      res = preloadedRound;
      preloadedRound = null;
    } else {
      res = await api('/api/game/start', 'POST');
    }

    state.currentRound = res;
    state.cursorPosition = null;
    state.isDragging = false;
    state.hintDismissed = false;
    state.usedReveal = false;
    state.usedExpand = false;

    // Set photo (already cached if preloaded)
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

    updateAllCoinDisplays();

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

  function getImageBounds() {
    // Calculate the actual rendered image area within the container
    // when using object-fit: contain, there may be black bars
    const img = document.getElementById('game-photo');
    const containerRect = photoContainer.getBoundingClientRect();

    const imgNaturalW = img.naturalWidth || 800;
    const imgNaturalH = img.naturalHeight || 600;
    const containerW = containerRect.width;
    const containerH = containerRect.height;

    const imgRatio = imgNaturalW / imgNaturalH;
    const containerRatio = containerW / containerH;

    let renderW, renderH, offsetX, offsetY;

    if (imgRatio > containerRatio) {
      // Image is wider than container → black bars top/bottom
      renderW = containerW;
      renderH = containerW / imgRatio;
      offsetX = 0;
      offsetY = (containerH - renderH) / 2;
    } else {
      // Image is taller than container → black bars left/right
      renderH = containerH;
      renderW = containerH * imgRatio;
      offsetX = (containerW - renderW) / 2;
      offsetY = 0;
    }

    return { renderW, renderH, offsetX, offsetY, containerRect };
  }

  function handleMove(clientX, clientY) {
    const { renderW, renderH, offsetX, offsetY, containerRect } = getImageBounds();

    // Position relative to the actual image area (not the container)
    const relX = clientX - containerRect.left - offsetX;
    const relY = clientY - containerRect.top - offsetY;

    // Convert to percentage of actual image (0-100)
    const pctX = (relX / renderW) * 100;
    const pctY = (relY / renderH) * 100;

    // Clamp to image bounds
    const clampedX = Math.max(0, Math.min(100, pctX));
    const clampedY = Math.max(0, Math.min(100, pctY));

    state.cursorPosition = { x: clampedX, y: clampedY };

    // Position the search circle within the container using absolute offsets
    // so it aligns with the actual image content
    const sc = document.getElementById('search-circle');
    const pixelLeft = offsetX + (clampedX / 100) * renderW;
    const pixelTop = offsetY + (clampedY / 100) * renderH;
    sc.style.left = pixelLeft + 'px';
    sc.style.top = pixelTop + 'px';
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

    // Game over when too far (far or miss = you lose)
    if (result.rating === 'miss' || result.rating === 'far') {
      // Score from this bad round does NOT count
      state.sessionScore -= result.score;
      if (state.sessionScore > (state.user.bestRoundScore || 0)) {
        state.user.bestRoundScore = state.sessionScore;
      }
      showGameOver(result);
    } else {
      // Preload next photo while showing result
      preloadNextRound();
      showResult(result);
    }
  } catch (err) {
    showModal(err.message || 'Erreur');
    confirmBtn.disabled = false;
  }
}

// Position markers accurately on a photo container with object-fit: contain
function positionMarkerOnPhoto(container, img, marker, pctX, pctY) {
  const cW = container.offsetWidth;
  const cH = container.offsetHeight;
  const nW = img.naturalWidth || 800;
  const nH = img.naturalHeight || 600;

  // Calculate actual rendered image bounds
  const imgRatio = nW / nH;
  const cRatio = cW / cH;
  let rW, rH, oX, oY;

  if (cH === 0 || img.style.height === 'auto' || !img.style.height) {
    // height:auto means image width fills container, no letterboxing
    marker.style.left = `${pctX}%`;
    marker.style.top = `${pctY}%`;
    return;
  }

  if (imgRatio > cRatio) {
    rW = cW; rH = cW / imgRatio;
    oX = 0; oY = (cH - rH) / 2;
  } else {
    rH = cH; rW = cH * imgRatio;
    oX = (cW - rW) / 2; oY = 0;
  }

  const px = oX + (pctX / 100) * rW;
  const py = oY + (pctY / 100) * rH;
  marker.style.left = px + 'px';
  marker.style.top = py + 'px';
}

async function showGameOver(result) {
  // Haptic
  if (tg) tg.HapticFeedback.notificationOccurred('error');

  document.getElementById('gameover-score').textContent = state.sessionScore;

  const photo = document.getElementById('gameover-photo');
  photo.src = result.originalPhoto;

  const guessMarker = document.getElementById('gameover-guess');
  const ballMarker = document.getElementById('gameover-ball');
  const line = document.getElementById('gameover-distance-line');
  const container = document.getElementById('gameover-photo-container');

  photo.onload = () => {
    positionMarkerOnPhoto(container, photo, guessMarker, result.guessPosition.x, result.guessPosition.y);
    positionMarkerOnPhoto(container, photo, ballMarker, result.ballPosition.x, result.ballPosition.y);
    line.setAttribute('x1', guessMarker.style.left);
    line.setAttribute('y1', guessMarker.style.top);
    line.setAttribute('x2', ballMarker.style.left);
    line.setAttribute('y2', ballMarker.style.top);
  };

  showScreen('gameover');

  // Load leaderboard into game over screen
  try {
    const [lbData, statsData] = await Promise.all([
      api('/api/leaderboard?limit=10'),
      api('/api/user/stats')
    ]);

    const myRank = statsData?.rank || '-';
    document.getElementById('gameover-rank').textContent = `Toi: #${myRank}`;

    const list = document.getElementById('gameover-lb-list');
    list.innerHTML = '';

    const medals = ['🥇', '🥈', '🥉'];
    const myId = state.user?.telegramId;

    lbData.leaderboard.forEach(entry => {
      const div = document.createElement('div');
      const isMe = entry.username === (state.user?.username || state.user?.firstName);
      div.className = 'go-lb-entry' + (isMe ? ' is-me' : '');
      div.innerHTML = `
        <span class="go-lb-rank">${medals[entry.rank - 1] || entry.rank}</span>
        <span class="go-lb-name">${escapeHtml(entry.username)}${isMe ? ' (toi)' : ''}</span>
        <span class="go-lb-pts">${entry.totalScore.toLocaleString()}</span>
      `;
      list.appendChild(div);
    });

    // If player not in top 10, add their entry at the bottom
    if (myRank > 10 && statsData) {
      const sep = document.createElement('div');
      sep.style.cssText = 'text-align:center;padding:4px;color:var(--text-muted);font-size:11px;';
      sep.textContent = '...';
      list.appendChild(sep);

      const myDiv = document.createElement('div');
      myDiv.className = 'go-lb-entry is-me';
      myDiv.innerHTML = `
        <span class="go-lb-rank">${myRank}</span>
        <span class="go-lb-name">${escapeHtml(state.user?.username || state.user?.firstName || 'Toi')} (toi)</span>
        <span class="go-lb-pts">${statsData.totalScore.toLocaleString()}</span>
      `;
      list.appendChild(myDiv);
    }
  } catch (err) {
    console.error('Failed to load gameover leaderboard:', err);
  }
}

function showResult(result) {
  // Set result header
  const header = document.getElementById('result-header');
  header.className = `result-header rating-${result.rating}`;

  document.getElementById('result-emoji').textContent = result.emoji;
  document.getElementById('result-message').textContent = result.message;
  document.getElementById('result-score').textContent = `+${result.score}`;
  document.getElementById('result-score').classList.add('score-animate');

  // Precision (inverse of distance - closer = higher precision)
  const precision = Math.max(0, Math.round(100 - result.distance * 2.5));
  document.getElementById('result-distance').textContent = `${precision}/100`;
  const precBar = document.getElementById('result-precision-bar');
  if (precBar) {
    precBar.style.width = `${precision}%`;
    precBar.style.background = precision > 80 ? '#4CAF50' : precision > 50 ? '#F5C518' : '#e74c3c';
  }

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

  const guessMarker = document.getElementById('result-guess');
  const ballMarker = document.getElementById('result-ball');
  const line = document.getElementById('distance-line');
  const container = document.getElementById('result-photo-container');

  resultPhoto.onload = () => {
    positionMarkerOnPhoto(container, resultPhoto, guessMarker, result.guessPosition.x, result.guessPosition.y);
    positionMarkerOnPhoto(container, resultPhoto, ballMarker, result.ballPosition.x, result.ballPosition.y);

    line.setAttribute('x1', guessMarker.style.left);
    line.setAttribute('y1', guessMarker.style.top);
    line.setAttribute('x2', ballMarker.style.left);
    line.setAttribute('y2', ballMarker.style.top);
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

  try {
    // Ask server which quarter contains the ball
    const res = await api('/api/game/reveal', 'POST', { roundId: state.currentRound.roundId });

    state.usedReveal = true;
    state.user.coins = res.coins;
    updateAllCoinDisplays();
    document.getElementById('btn-reveal').classList.add('used');
    document.getElementById('btn-reveal').disabled = true;

    // Highlight quarters - green for ball quarter, red for others
    const ballQ = res.quarter; // "tl", "tr", "bl", "br"
    const quarters = { tl: 'q-tl', tr: 'q-tr', bl: 'q-bl', br: 'q-br' };

    document.querySelectorAll('.quarter').forEach(q => {
      q.classList.remove('revealed-yes', 'revealed-no');
    });

    Object.entries(quarters).forEach(([key, cls]) => {
      const el = document.querySelector(`.${cls}`);
      if (key === ballQ) {
        el.classList.add('revealed-yes');
      } else {
        el.classList.add('revealed-no');
      }
    });

    // Show quarter overlay
    const overlay = document.getElementById('quarter-overlay');
    overlay.classList.add('active');

    // Auto-hide after 4 seconds
    setTimeout(() => {
      overlay.classList.remove('active');
    }, 4000);

    if (tg) tg.HapticFeedback.impactOccurred('light');
  } catch (err) {
    await showModal(err.message || 'Erreur');
  }
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
document.getElementById('btn-menu-leaderboard').addEventListener('click', showLeaderboard);
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
