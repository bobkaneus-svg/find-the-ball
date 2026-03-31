// ============ FIND THE BALL - TELEGRAM MINI APP ============

const API_BASE = '';
let tg = null;
let initData = '';
let currentLang = 'en';

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

// ============ TRANSLATIONS ============

const TRANSLATIONS = {
  en: {
    loading: 'Loading...', high_score: 'HIGH SCORE', start_game: 'START GAME',
    leaderboard: 'LEADERBOARD', shop: 'SHOP', drag_hint: 'Touch and drag to place your cursor',
    points: 'points', you: 'You', ball: 'Ball', precision: 'Precision', bonus: 'Bonus',
    next_photo: 'NEXT PHOTO', share_score: 'SHARE MY SCORE', menu: 'MENU',
    play_again: 'PLAY AGAIN', main_menu: 'MAIN MENU', pause: 'PAUSE',
    resume: 'RESUME', quit: 'QUIT', your_rank: 'Your rank: ',
    lb_subtitle: 'Top 50 players rewarded each season!',
    watch_ad: '+ 50 Coins / Watch One Video Ad',
    reveal_confirm: 'Reveal quarter?\n(100 Coins)',
    expand_confirm: 'Expand search area?\n(50 Coins)',
    not_enough_coins: 'Not enough coins!',
    no: 'No', yes: 'Yes',
    // Rating messages
    rating_perfect: ['INCREDIBLE!', 'PERFECT!', "BULL'S EYE!"],
    rating_great: ['EXCELLENT!', 'SO CLOSE!', 'ALMOST PERFECT!'],
    rating_good: ['WELL PLAYED!', 'NOT BAD!', 'GOOD INSTINCT!'],
    rating_ok: ['CORRECT', "IT'LL DO", 'COULD BE BETTER'],
    share_text: "I scored {score} points on Find the Ball! Can you do better?"
  },
  fr: {
    loading: 'Chargement...', high_score: 'MEILLEUR SCORE', start_game: 'JOUER',
    leaderboard: 'CLASSEMENT', shop: 'BOUTIQUE', drag_hint: 'Touche et glisse pour placer ton curseur',
    points: 'points', you: 'Toi', ball: 'Ballon', precision: 'Precision', bonus: 'Bonus',
    next_photo: 'PHOTO SUIVANTE', share_score: 'PARTAGER MON SCORE', menu: 'MENU',
    play_again: 'REJOUER', main_menu: 'MENU PRINCIPAL', pause: 'PAUSE',
    resume: 'REPRENDRE', quit: 'QUITTER', your_rank: 'Ton classement : ',
    lb_subtitle: 'Top 50 joueurs recompenses chaque saison !',
    watch_ad: '+ 50 Coins / Regarder une pub',
    reveal_confirm: 'Reveler un quart ?\n(100 Coins)',
    expand_confirm: 'Agrandir la zone ?\n(50 Coins)',
    not_enough_coins: 'Pas assez de coins !',
    no: 'Non', yes: 'Oui',
    rating_perfect: ['INCROYABLE !', 'PARFAIT !', 'EN PLEIN DANS LE MILLE !'],
    rating_great: ['EXCELLENT !', 'TRES PROCHE !', 'PRESQUE PARFAIT !'],
    rating_good: ['BIEN JOUE !', 'PAS MAL !', 'BON INSTINCT !'],
    rating_ok: ['CORRECT', 'CA PASSE', 'PEUT MIEUX FAIRE'],
    share_text: "J'ai marque {score} points sur Find the Ball ! Tu peux faire mieux ?"
  },
  es: {
    loading: 'Cargando...', high_score: 'MEJOR PUNTUACION', start_game: 'JUGAR',
    leaderboard: 'CLASIFICACION', shop: 'TIENDA', drag_hint: 'Toca y arrastra para colocar tu cursor',
    points: 'puntos', you: 'Tu', ball: 'Balon', precision: 'Precision', bonus: 'Bonus',
    next_photo: 'SIGUIENTE FOTO', share_score: 'COMPARTIR PUNTUACION', menu: 'MENU',
    play_again: 'JUGAR DE NUEVO', main_menu: 'MENU PRINCIPAL', pause: 'PAUSA',
    resume: 'CONTINUAR', quit: 'SALIR', your_rank: 'Tu posicion: ',
    lb_subtitle: 'Top 50 jugadores premiados cada temporada!',
    watch_ad: '+ 50 Monedas / Ver un anuncio',
    reveal_confirm: 'Revelar cuarto?\n(100 Monedas)',
    expand_confirm: 'Ampliar zona?\n(50 Monedas)',
    not_enough_coins: 'No tienes suficientes monedas!',
    no: 'No', yes: 'Si',
    rating_perfect: ['INCREIBLE!', 'PERFECTO!', 'DIANA!'],
    rating_great: ['EXCELENTE!', 'MUY CERCA!', 'CASI PERFECTO!'],
    rating_good: ['BIEN JUGADO!', 'NADA MAL!', 'BUEN INSTINTO!'],
    rating_ok: ['CORRECTO', 'VALE', 'PUEDE MEJORAR'],
    share_text: "He conseguido {score} puntos en Find the Ball! Puedes superarme?"
  },
  pt: {
    loading: 'Carregando...', high_score: 'RECORDE', start_game: 'JOGAR',
    leaderboard: 'RANKING', shop: 'LOJA', drag_hint: 'Toque e arraste para posicionar',
    points: 'pontos', you: 'Voce', ball: 'Bola', precision: 'Precisao', bonus: 'Bonus',
    next_photo: 'PROXIMA FOTO', share_score: 'COMPARTILHAR', menu: 'MENU',
    play_again: 'JOGAR NOVAMENTE', main_menu: 'MENU PRINCIPAL', pause: 'PAUSA',
    resume: 'CONTINUAR', quit: 'SAIR', your_rank: 'Sua posicao: ',
    lb_subtitle: 'Top 50 jogadores premiados a cada temporada!',
    watch_ad: '+ 50 Moedas / Assistir anuncio',
    reveal_confirm: 'Revelar quarto?\n(100 Moedas)',
    expand_confirm: 'Ampliar area?\n(50 Moedas)',
    not_enough_coins: 'Moedas insuficientes!',
    no: 'Nao', yes: 'Sim',
    rating_perfect: ['INCRIVEL!', 'PERFEITO!', 'NA MOSCA!'],
    rating_great: ['EXCELENTE!', 'MUITO PERTO!', 'QUASE PERFEITO!'],
    rating_good: ['BEM JOGADO!', 'NADA MAL!', 'BOM INSTINTO!'],
    rating_ok: ['CORRETO', 'PASSOU', 'PODE MELHORAR'],
    share_text: "Fiz {score} pontos no Find the Ball! Consegue me superar?"
  },
  de: {
    loading: 'Laden...', high_score: 'HIGHSCORE', start_game: 'SPIEL STARTEN',
    leaderboard: 'RANGLISTE', shop: 'SHOP', drag_hint: 'Tippe und ziehe um den Cursor zu platzieren',
    points: 'Punkte', you: 'Du', ball: 'Ball', precision: 'Prazision', bonus: 'Bonus',
    next_photo: 'NACHSTES FOTO', share_score: 'SCORE TEILEN', menu: 'MENU',
    play_again: 'NOCHMAL SPIELEN', main_menu: 'HAUPTMENU', pause: 'PAUSE',
    resume: 'WEITER', quit: 'BEENDEN', your_rank: 'Dein Rang: ',
    lb_subtitle: 'Top 50 Spieler werden jede Saison belohnt!',
    watch_ad: '+ 50 Munzen / Werbung ansehen',
    reveal_confirm: 'Viertel aufdecken?\n(100 Munzen)',
    expand_confirm: 'Suchbereich erweitern?\n(50 Munzen)',
    not_enough_coins: 'Nicht genug Munzen!',
    no: 'Nein', yes: 'Ja',
    rating_perfect: ['UNGLAUBLICH!', 'PERFEKT!', 'VOLLTREFFER!'],
    rating_great: ['AUSGEZEICHNET!', 'GANZ NAH!', 'FAST PERFEKT!'],
    rating_good: ['GUT GESPIELT!', 'NICHT SCHLECHT!', 'GUTER INSTINKT!'],
    rating_ok: ['KORREKT', 'GEHT SO', 'KANN BESSER'],
    share_text: "Ich habe {score} Punkte bei Find the Ball erreicht! Kannst du das toppen?"
  },
  ru: {
    loading: 'Загрузка...', high_score: 'РЕКОРД', start_game: 'ИГРАТЬ',
    leaderboard: 'РЕЙТИНГ', shop: 'МАГАЗИН', drag_hint: 'Нажми и перетащи курсор',
    points: 'очков', you: 'Ты', ball: 'Мяч', precision: 'Точность', bonus: 'Бонус',
    next_photo: 'СЛЕДУЮЩЕЕ ФОТО', share_score: 'ПОДЕЛИТЬСЯ', menu: 'МЕНЮ',
    play_again: 'ИГРАТЬ СНОВА', main_menu: 'ГЛАВНОЕ МЕНЮ', pause: 'ПАУЗА',
    resume: 'ПРОДОЛЖИТЬ', quit: 'ВЫЙТИ', your_rank: 'Твой ранг: ',
    lb_subtitle: 'Топ-50 игроков получают награды каждый сезон!',
    watch_ad: '+ 50 Монет / Посмотреть рекламу',
    reveal_confirm: 'Показать четверть?\n(100 Монет)',
    expand_confirm: 'Расширить зону?\n(50 Монет)',
    not_enough_coins: 'Недостаточно монет!',
    no: 'Нет', yes: 'Да',
    rating_perfect: ['НЕВЕРОЯТНО!', 'ИДЕАЛЬНО!', 'В ЯБЛОЧКО!'],
    rating_great: ['ОТЛИЧНО!', 'ОЧЕНЬ БЛИЗКО!', 'ПОЧТИ ИДЕАЛЬНО!'],
    rating_good: ['ХОРОШО!', 'НЕПЛОХО!', 'ХОРОШИЙ ИНСТИНКТ!'],
    rating_ok: ['НОРМАЛЬНО', 'СОЙДЁТ', 'МОЖНО ЛУЧШЕ'],
    share_text: "Я набрал {score} очков в Find the Ball! Сможешь лучше?"
  },
  tr: {
    loading: 'Yukleniyor...', high_score: 'EN YUKSEK SKOR', start_game: 'OYNA',
    leaderboard: 'SIRALAMA', shop: 'MARKET', drag_hint: 'Imleci yerlestirmek icin dokun ve surukle',
    points: 'puan', you: 'Sen', ball: 'Top', precision: 'Hassasiyet', bonus: 'Bonus',
    next_photo: 'SONRAKI FOTO', share_score: 'SKORU PAYLAS', menu: 'MENU',
    play_again: 'TEKRAR OYNA', main_menu: 'ANA MENU', pause: 'DURAKLAT',
    resume: 'DEVAM', quit: 'CIK', your_rank: 'Siralamam: ',
    lb_subtitle: 'Her sezon en iyi 50 oyuncu odullendirilir!',
    watch_ad: '+ 50 Jeton / Reklam izle',
    reveal_confirm: 'Ceyregi goster?\n(100 Jeton)',
    expand_confirm: 'Alani genislet?\n(50 Jeton)',
    not_enough_coins: 'Yeterli jeton yok!',
    no: 'Hayir', yes: 'Evet',
    rating_perfect: ['INANILMAZ!', 'MUKEMMEL!', 'TAM ISABET!'],
    rating_great: ['HARIKA!', 'COK YAKIN!', 'NEREDEYSE MUKEMMEL!'],
    rating_good: ['IYI OYNADIN!', 'FENA DEGIL!', 'IYI ICGUDU!'],
    rating_ok: ['DOGRU', 'IDARE EDER', 'DAHA IYI OLABILIR'],
    share_text: "Find the Ball'da {score} puan aldim! Beni gecebilir misin?"
  },
  ar: {
    loading: '...جاري التحميل', high_score: 'أعلى نتيجة', start_game: 'ابدأ اللعب',
    leaderboard: 'لوحة المتصدرين', shop: 'المتجر', drag_hint: 'المس واسحب لوضع المؤشر',
    points: 'نقاط', you: 'أنت', ball: 'الكرة', precision: 'الدقة', bonus: 'مكافأة',
    next_photo: 'الصورة التالية', share_score: 'شارك نتيجتك', menu: 'القائمة',
    play_again: 'العب مجدداً', main_menu: 'القائمة الرئيسية', pause: 'إيقاف مؤقت',
    resume: 'استمرار', quit: 'خروج', your_rank: 'ترتيبك: ',
    lb_subtitle: 'أفضل 50 لاعب يكافأون كل موسم!',
    watch_ad: '+ 50 عملة / شاهد إعلان',
    reveal_confirm: 'كشف الربع؟\n(100 عملة)',
    expand_confirm: 'توسيع المنطقة؟\n(50 عملة)',
    not_enough_coins: 'عملات غير كافية!',
    no: 'لا', yes: 'نعم',
    rating_perfect: ['!لا يصدق', '!مثالي', '!في الهدف'],
    rating_great: ['!ممتاز', '!قريب جداً', '!شبه مثالي'],
    rating_good: ['!أحسنت', '!ليس سيئاً', '!حدس جيد'],
    rating_ok: ['صحيح', 'مقبول', 'يمكن أفضل'],
    share_text: "حققت {score} نقطة في Find the Ball! هل تستطيع التفوق علي؟"
  },
  zh: {
    loading: '加载中...', high_score: '最高分', start_game: '开始游戏',
    leaderboard: '排行榜', shop: '商店', drag_hint: '触摸并拖动放置光标',
    points: '分', you: '你', ball: '球', precision: '精度', bonus: '奖励',
    next_photo: '下一张', share_score: '分享成绩', menu: '菜单',
    play_again: '再玩一次', main_menu: '主菜单', pause: '暂停',
    resume: '继续', quit: '退出', your_rank: '你的排名：',
    lb_subtitle: '每赛季前50名玩家获得奖励！',
    watch_ad: '+ 50 金币 / 观看广告',
    reveal_confirm: '揭示象限？\n(100 金币)',
    expand_confirm: '扩大搜索范围？\n(50 金币)',
    not_enough_coins: '金币不足！',
    no: '否', yes: '是',
    rating_perfect: ['难以置信！', '完美！', '正中靶心！'],
    rating_great: ['太棒了！', '非常接近！', '几乎完美！'],
    rating_good: ['不错！', '还行！', '好直觉！'],
    rating_ok: ['一般', '还行吧', '可以更好'],
    share_text: "我在Find the Ball中获得了{score}分！你能超过我吗？"
  }
};

function t(key) {
  return (TRANSLATIONS[currentLang] && TRANSLATIONS[currentLang][key]) || TRANSLATIONS.en[key] || key;
}

function tRating(rating) {
  const key = `rating_${rating}`;
  const msgs = (TRANSLATIONS[currentLang] && TRANSLATIONS[currentLang][key]) || TRANSLATIONS.en[key];
  if (!msgs) return rating.toUpperCase();
  return msgs[Math.floor(Math.random() * msgs.length)];
}

function detectLanguage() {
  // 1. Telegram user language_code
  if (tg?.initDataUnsafe?.user?.language_code) {
    const code = tg.initDataUnsafe.user.language_code.toLowerCase().split('-')[0];
    if (TRANSLATIONS[code]) return code;
  }
  // 2. Browser language
  const nav = (navigator.language || navigator.userLanguage || 'en').toLowerCase().split('-')[0];
  if (TRANSLATIONS[nav]) return nav;
  return 'en';
}

function applyTranslations() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    const val = t(key);
    if (val) el.textContent = val;
  });
  // Update modal buttons
  document.getElementById('modal-btn-no').textContent = t('no');
  document.getElementById('modal-btn-yes').textContent = t('yes');
  document.documentElement.lang = currentLang;
}

// ============ INIT ============

document.addEventListener('DOMContentLoaded', () => {
  // Telegram WebApp
  if (window.Telegram?.WebApp) {
    tg = window.Telegram.WebApp;
    tg.ready();
    tg.expand();
    initData = tg.initData;
  }

  // Detect and apply language
  currentLang = detectLanguage();
  applyTranslations();

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

    // Update user state (coins already deducted server-side for power-ups)
    state.sessionScore += result.score;
    state.user.coins += (result.bonusCoins || 0);
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
  const container = document.getElementById('gameover-photo-container');

  photo.onload = () => {
    positionMarkerOnPhoto(container, photo, guessMarker, result.guessPosition.x, result.guessPosition.y);
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
  document.getElementById('result-message').textContent = tRating(result.rating);
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
  const container = document.getElementById('result-photo-container');

  resultPhoto.onload = () => {
    positionMarkerOnPhoto(container, resultPhoto, guessMarker, result.guessPosition.x, result.guessPosition.y);
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
    await showModal(t('not_enough_coins'));
    return;
  }

  const confirmed = await showModal(t('reveal_confirm'));
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
    await showModal(t('not_enough_coins'));
    return;
  }

  const confirmed = await showModal(t('expand_confirm'));
  if (!confirmed) return;

  // Pre-check: will server accept? (coins already checked above)
  state.usedExpand = true;
  state.user.coins -= 50;
  updateAllCoinDisplays();
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
  const shareText = t('share_text').replace('{score}', score);

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
