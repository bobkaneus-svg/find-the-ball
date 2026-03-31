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
  sessionScore: 0,
  previousScreen: 'menu' // Track where we came from for back navigation
};

// ============ TRANSLATIONS ============

const TRANSLATIONS = {
  en: {
    loading: 'Loading...', high_score: 'HIGH SCORE', start_game: 'START GAME',
    leaderboard: 'LEADERBOARD', shop: 'SHOP', menu_subtitle: 'Can you spot it?',
    drag_hint: 'Touch and drag to place your cursor',
    buy_with_stars: 'BUY WITH', buy_with_ton: 'BUY WITH',
    payment_disclaimer: 'Transaction may take a few minutes to process.',
    invite_friend: 'Invite a friend — earn 10 000 coins!',
    lb_resets_in: 'Resets in',
    step_1: 'A photo appears — the ball is hidden',
    step_2: 'Place your cursor where you think it is',
    step_3: 'The closer you are, the more you score!',
    points: 'points', you: 'You', ball: 'Ball', precision: 'Precision', bonus: 'Bonus',
    next_photo: 'NEXT PHOTO', share_score: 'SHARE MY SCORE', menu: 'MENU',
    play_again: 'PLAY AGAIN', main_menu: 'MAIN MENU', pause: 'PAUSE',
    resume: 'RESUME', quit: 'QUIT', your_rank: 'Your rank: ',
    lb_subtitle: 'Top 50 players rewarded each season!',
    watch_ad: '+ 50 Coins / Watch One Video Ad',
    reveal_confirm: 'Reveal quarter?\n(100 Coins)',
    expand_confirm: 'Expand search area?\n(50 Coins)',
    not_enough_coins: 'Not enough coins!', buy_coins: 'BUY COINS', cancel: 'Cancel',
    no: 'No', yes: 'Yes',
    // Rating messages
    rating_perfect: ['INCREDIBLE!', 'PERFECT!', "BULL'S EYE!"],
    rating_great: ['EXCELLENT!', 'SO CLOSE!', 'ALMOST PERFECT!'],
    rating_good: ['WELL PLAYED!', 'NOT BAD!', 'GOOD INSTINCT!'],
    rating_ok: ['CORRECT', "IT'LL DO", 'COULD BE BETTER'],
    share_text: "I scored {score} points on Find the Ball! Can you do better?",
    badges: 'BADGES', badge_unlocked: 'BADGE UNLOCKED!'
  },
  fr: {
    loading: 'Chargement...', high_score: 'MEILLEUR SCORE', start_game: 'JOUER',
    leaderboard: 'CLASSEMENT', shop: 'BOUTIQUE', menu_subtitle: 'Sauras-tu le trouver ?',
    drag_hint: 'Touche et glisse pour placer ton curseur',
    buy_with_stars: 'PAYER AVEC', buy_with_ton: 'PAYER AVEC',
    payment_disclaimer: 'La transaction peut prendre quelques minutes.',
    invite_friend: 'Invite un ami — gagne 10 000 coins !',
    lb_resets_in: 'Reset dans',
    step_1: 'Une photo apparait — le ballon est cache',
    step_2: 'Place ton curseur la ou tu penses qu\'il est',
    step_3: 'Plus tu es proche, plus tu marques de points !',
    points: 'points', you: 'Toi', ball: 'Ballon', precision: 'Precision', bonus: 'Bonus',
    next_photo: 'PHOTO SUIVANTE', share_score: 'PARTAGER MON SCORE', menu: 'MENU',
    play_again: 'REJOUER', main_menu: 'MENU PRINCIPAL', pause: 'PAUSE',
    resume: 'REPRENDRE', quit: 'QUITTER', your_rank: 'Ton classement : ',
    lb_subtitle: 'Top 50 joueurs recompenses chaque saison !',
    watch_ad: '+ 50 Coins / Regarder une pub',
    reveal_confirm: 'Reveler un quart ?\n(100 Coins)',
    expand_confirm: 'Agrandir la zone ?\n(50 Coins)',
    not_enough_coins: 'Pas assez de coins !', buy_coins: 'ACHETER', cancel: 'Annuler',
    no: 'Non', yes: 'Oui',
    rating_perfect: ['INCROYABLE !', 'PARFAIT !', 'EN PLEIN DANS LE MILLE !'],
    rating_great: ['EXCELLENT !', 'TRES PROCHE !', 'PRESQUE PARFAIT !'],
    rating_good: ['BIEN JOUE !', 'PAS MAL !', 'BON INSTINCT !'],
    rating_ok: ['CORRECT', 'CA PASSE', 'PEUT MIEUX FAIRE'],
    share_text: "J'ai marque {score} points sur Find the Ball ! Tu peux faire mieux ?",
    badges: 'BADGES', badge_unlocked: 'BADGE DEBLOQUE !'
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
    not_enough_coins: 'No tienes suficientes monedas!', buy_coins: 'COMPRAR', cancel: 'Cancelar',
    no: 'No', yes: 'Si',
    rating_perfect: ['INCREIBLE!', 'PERFECTO!', 'DIANA!'],
    rating_great: ['EXCELENTE!', 'MUY CERCA!', 'CASI PERFECTO!'],
    rating_good: ['BIEN JUGADO!', 'NADA MAL!', 'BUEN INSTINTO!'],
    rating_ok: ['CORRECTO', 'VALE', 'PUEDE MEJORAR'],
    share_text: "He conseguido {score} puntos en Find the Ball! Puedes superarme?",
    badges: 'INSIGNIAS', badge_unlocked: 'INSIGNIA DESBLOQUEADA!'
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
    not_enough_coins: 'Moedas insuficientes!', buy_coins: 'COMPRAR', cancel: 'Cancelar',
    no: 'Nao', yes: 'Sim',
    rating_perfect: ['INCRIVEL!', 'PERFEITO!', 'NA MOSCA!'],
    rating_great: ['EXCELENTE!', 'MUITO PERTO!', 'QUASE PERFEITO!'],
    rating_good: ['BEM JOGADO!', 'NADA MAL!', 'BOM INSTINTO!'],
    rating_ok: ['CORRETO', 'PASSOU', 'PODE MELHORAR'],
    share_text: "Fiz {score} pontos no Find the Ball! Consegue me superar?",
    badges: 'MEDALHAS', badge_unlocked: 'MEDALHA DESBLOQUEADA!'
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
    not_enough_coins: 'Nicht genug Munzen!', buy_coins: 'KAUFEN', cancel: 'Abbrechen',
    no: 'Nein', yes: 'Ja',
    rating_perfect: ['UNGLAUBLICH!', 'PERFEKT!', 'VOLLTREFFER!'],
    rating_great: ['AUSGEZEICHNET!', 'GANZ NAH!', 'FAST PERFEKT!'],
    rating_good: ['GUT GESPIELT!', 'NICHT SCHLECHT!', 'GUTER INSTINKT!'],
    rating_ok: ['KORREKT', 'GEHT SO', 'KANN BESSER'],
    share_text: "Ich habe {score} Punkte bei Find the Ball erreicht! Kannst du das toppen?",
    badges: 'ABZEICHEN', badge_unlocked: 'ABZEICHEN FREIGESCHALTET!'
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
    not_enough_coins: 'Недостаточно монет!', buy_coins: 'КУПИТЬ', cancel: 'Отмена',
    no: 'Нет', yes: 'Да',
    rating_perfect: ['НЕВЕРОЯТНО!', 'ИДЕАЛЬНО!', 'В ЯБЛОЧКО!'],
    rating_great: ['ОТЛИЧНО!', 'ОЧЕНЬ БЛИЗКО!', 'ПОЧТИ ИДЕАЛЬНО!'],
    rating_good: ['ХОРОШО!', 'НЕПЛОХО!', 'ХОРОШИЙ ИНСТИНКТ!'],
    rating_ok: ['НОРМАЛЬНО', 'СОЙДЁТ', 'МОЖНО ЛУЧШЕ'],
    share_text: "Я набрал {score} очков в Find the Ball! Сможешь лучше?",
    badges: 'ЗНАЧКИ', badge_unlocked: 'ЗНАЧОК ПОЛУЧЕН!'
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
    not_enough_coins: 'Yeterli jeton yok!', buy_coins: 'SATIN AL', cancel: 'Iptal',
    no: 'Hayir', yes: 'Evet',
    rating_perfect: ['INANILMAZ!', 'MUKEMMEL!', 'TAM ISABET!'],
    rating_great: ['HARIKA!', 'COK YAKIN!', 'NEREDEYSE MUKEMMEL!'],
    rating_good: ['IYI OYNADIN!', 'FENA DEGIL!', 'IYI ICGUDU!'],
    rating_ok: ['DOGRU', 'IDARE EDER', 'DAHA IYI OLABILIR'],
    share_text: "Find the Ball'da {score} puan aldim! Beni gecebilir misin?",
    badges: 'ROZETLER', badge_unlocked: 'ROZET ACILDI!'
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
    not_enough_coins: 'عملات غير كافية!', buy_coins: 'شراء', cancel: 'إلغاء',
    no: 'لا', yes: 'نعم',
    rating_perfect: ['!لا يصدق', '!مثالي', '!في الهدف'],
    rating_great: ['!ممتاز', '!قريب جداً', '!شبه مثالي'],
    rating_good: ['!أحسنت', '!ليس سيئاً', '!حدس جيد'],
    rating_ok: ['صحيح', 'مقبول', 'يمكن أفضل'],
    share_text: "حققت {score} نقطة في Find the Ball! هل تستطيع التفوق علي؟",
    badges: 'الشارات', badge_unlocked: 'تم فتح شارة!'
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
    not_enough_coins: '金币不足！', buy_coins: '购买', cancel: '取消',
    no: '否', yes: '是',
    rating_perfect: ['难以置信！', '完美！', '正中靶心！'],
    rating_great: ['太棒了！', '非常接近！', '几乎完美！'],
    rating_good: ['不错！', '还行！', '好直觉！'],
    rating_ok: ['一般', '还行吧', '可以更好'],
    share_text: "我在Find the Ball中获得了{score}分！你能超过我吗？",
    badges: '徽章', badge_unlocked: '徽章解锁！'
  }
};

function t(key) {
  return (TRANSLATIONS[currentLang] && TRANSLATIONS[currentLang][key]) || TRANSLATIONS.en[key] || key;
}

// ============ BADGE DEFINITIONS ============

const BADGES = {
  first_game:    { emoji: '\u{1F3AE}', name: { en: 'First Game', fr: 'Premiere Partie' }, desc: { en: 'Play 1 game', fr: 'Jouer 1 partie' } },
  veteran:       { emoji: '\u{1F3AF}', name: { en: 'Veteran', fr: 'Veteran' }, desc: { en: 'Play 10 games', fr: 'Jouer 10 parties' } },
  addict:        { emoji: '\u{1F525}', name: { en: 'Addict', fr: 'Accro' }, desc: { en: 'Play 50 games', fr: 'Jouer 50 parties' } },
  legend:        { emoji: '\u{1F451}', name: { en: 'Legend', fr: 'Legende' }, desc: { en: 'Play 100 games', fr: 'Jouer 100 parties' } },
  sharpshooter:  { emoji: '\u{1F3AF}', name: { en: 'Sharpshooter', fr: 'Tireur d\'Elite' }, desc: { en: '1 perfect shot', fr: '1 tir parfait' } },
  eagle_eye:     { emoji: '\u{1F985}', name: { en: 'Eagle Eye', fr: 'Oeil d\'Aigle' }, desc: { en: '5 perfect shots', fr: '5 tirs parfaits' } },
  sniper:        { emoji: '\u{1F52B}', name: { en: 'Sniper', fr: 'Sniper' }, desc: { en: '10 perfect shots', fr: '10 tirs parfaits' } },
  hot_streak_3:  { emoji: '\u{1F525}', name: { en: 'Hot Streak', fr: 'Serie Chaude' }, desc: { en: '3 good rounds in a row', fr: '3 bons rounds d\'affilee' } },
  unstoppable_5: { emoji: '\u26A1', name: { en: 'Unstoppable', fr: 'Inarretable' }, desc: { en: '5 good rounds in a row', fr: '5 bons rounds d\'affilee' } },
  machine_10:    { emoji: '\u{1F916}', name: { en: 'Machine', fr: 'Machine' }, desc: { en: '10 good rounds in a row', fr: '10 bons rounds d\'affilee' } },
  god_mode_20:   { emoji: '\u{1F31F}', name: { en: 'God Mode', fr: 'Mode Dieu' }, desc: { en: '20 good rounds in a row', fr: '20 bons rounds d\'affilee' } },
  scorer_1k:     { emoji: '\u2B50', name: { en: '1K Scorer', fr: '1K Points' }, desc: { en: 'Reach 1 000 total points', fr: 'Atteindre 1 000 points au total' } },
  scorer_5k:     { emoji: '\u{1F31F}', name: { en: '5K Scorer', fr: '5K Points' }, desc: { en: 'Reach 5 000 total points', fr: 'Atteindre 5 000 points au total' } },
  scorer_25k:    { emoji: '\u{1F4AB}', name: { en: '25K Scorer', fr: '25K Points' }, desc: { en: 'Reach 25 000 total points', fr: 'Atteindre 25 000 points au total' } },
  scorer_100k:   { emoji: '\u{1F3C6}', name: { en: '100K Scorer', fr: '100K Points' }, desc: { en: 'Reach 100 000 total points', fr: 'Atteindre 100 000 points au total' } },
  comeback_kid:  { emoji: '\u{1F4AA}', name: { en: 'Comeback Kid', fr: 'Retour en Force' }, desc: { en: 'Score 800+ after a round under 200', fr: 'Faire 800+ apres un round sous 200' } },
  coin_collector:{ emoji: '\u{1F4B0}', name: { en: 'Coin Collector', fr: 'Collectionneur' }, desc: { en: 'Own 5 000 coins', fr: 'Posseder 5 000 coins' } },
  social_star:   { emoji: '\u{1F4E3}', name: { en: 'Social Star', fr: 'Star Sociale' }, desc: { en: 'Share your score', fr: 'Partager ton score' } }
};

let userBadgesData = null;
let newlyUnlockedBadges = [];

function getBadgeName(badgeId) {
  const badge = BADGES[badgeId];
  if (!badge) return badgeId;
  return badge.name[currentLang] || badge.name.en || badgeId;
}

function getBadgeDesc(badgeId) {
  const badge = BADGES[badgeId];
  if (!badge || !badge.desc) return '';
  return badge.desc[currentLang] || badge.desc.en || '';
}

async function loadBadges() {
  try {
    const data = await api('/api/user/badges');
    userBadgesData = data;
    renderMenuBadges(data);
    return data;
  } catch (e) {
    console.error('Failed to load badges:', e);
    return null;
  }
}

function renderMenuBadges(data) {
  if (!data) return;

  // Update count
  const countEl = document.getElementById('badges-count');
  if (countEl) countEl.textContent = `${data.unlocked}/${data.total}`;

  // Render scroll row
  const scroll = document.getElementById('badges-scroll');
  if (!scroll) return;
  scroll.innerHTML = '';

  // Show unlocked first, then locked
  const sorted = [...data.badges].sort((a, b) => {
    if (a.unlocked && !b.unlocked) return -1;
    if (!a.unlocked && b.unlocked) return 1;
    return 0;
  });

  sorted.forEach(badge => {
    const def = BADGES[badge.id];
    if (!def) return;
    const item = document.createElement('div');
    item.className = 'badge-item' + (badge.unlocked ? '' : ' locked');
    if (newlyUnlockedBadges.includes(badge.id)) {
      item.classList.add('new');
    }
    item.textContent = def.emoji;
    item.title = getBadgeName(badge.id);
    scroll.appendChild(item);
  });
}

function renderBadgesOverlay(data) {
  if (!data) return;
  const grid = document.getElementById('badges-grid');
  if (!grid) return;
  grid.innerHTML = '';

  data.badges.forEach(badge => {
    const def = BADGES[badge.id];
    if (!def) return;

    const item = document.createElement('div');
    item.className = 'badge-grid-item' + (badge.unlocked ? '' : ' locked');

    const progressPct = badge.target > 0 ? Math.min(100, Math.round((badge.progress / badge.target) * 100)) : 0;

    item.innerHTML = `
      <div class="badge-grid-emoji">${def.emoji}</div>
      <div class="badge-grid-name">${getBadgeName(badge.id)}</div>
      <div class="badge-grid-desc">${getBadgeDesc(badge.id)}</div>
      <div class="badge-grid-progress">${badge.unlocked ? '\u2705' : `${badge.progress}/${badge.target}`}</div>
      ${!badge.unlocked ? `<div class="badge-grid-progress-bar"><div class="badge-grid-progress-fill" style="width:${progressPct}%"></div></div>` : ''}
    `;
    grid.appendChild(item);
  });
}

function showBadgeToast(badgeId) {
  const def = BADGES[badgeId];
  if (!def) return;

  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = 'toast badge-toast';
  toast.innerHTML = `
    <span class="badge-toast-emoji">${def.emoji}</span>
    <div class="badge-toast-text">
      <span class="badge-toast-label">${t('badge_unlocked')}</span>
      <span class="badge-toast-name">${getBadgeName(badgeId)}</span>
    </div>
  `;
  container.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add('visible');
  });

  // Haptic
  if (tg) tg.HapticFeedback.notificationOccurred('success');

  setTimeout(() => {
    toast.classList.remove('visible');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

function handleNewBadges(badges) {
  if (!badges || badges.length === 0) return;
  newlyUnlockedBadges = badges;

  // Show toast for each new badge with staggered timing
  badges.forEach((badgeId, i) => {
    setTimeout(() => showBadgeToast(badgeId), i * 1500);
  });

  // Reload badges data
  loadBadges();
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

    // Set header/background color to match app
    if (tg.setHeaderColor) tg.setHeaderColor('#0e0e0e');
    if (tg.setBackgroundColor) tg.setBackgroundColor('#0e0e0e');

    // Apply Telegram safe area insets as CSS custom properties
    // contentSafeAreaInset = Telegram UI (header bar)
    // safeAreaInset = device (notch, status bar)
    function applyTgSafeAreas() {
      const csa = tg.contentSafeAreaInset || {};
      const sa = tg.safeAreaInset || {};
      const topInset = (sa.top || 0) + (csa.top || 0);
      const bottomInset = (sa.bottom || 0) + (csa.bottom || 0);
      // Fallback: if APIs not available but we're in Telegram, use minimum safe padding
      const minTop = (topInset === 0 && tg.platform !== 'unknown') ? 60 : topInset;
      document.documentElement.style.setProperty('--tg-safe-top', minTop + 'px');
      document.documentElement.style.setProperty('--tg-safe-bottom', (bottomInset || 0) + 'px');
    }
    applyTgSafeAreas();

    // Listen for changes (orientation, fullscreen toggle)
    if (tg.onEvent) {
      tg.onEvent('contentSafeAreaChanged', applyTgSafeAreas);
      tg.onEvent('safeAreaChanged', applyTgSafeAreas);
    }

    // Try fullscreen (removes Telegram header on supported clients)
    if (tg.requestFullscreen) {
      try { tg.requestFullscreen(); } catch (e) { /* not supported */ }
    }

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
    loadBadges();

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
    state.user = { telegramId: 12345, coins: 200, totalScore: 0, gamesPlayed: 0, bestRoundScore: 0, bestSessionScore: 0, rank: 0 };
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
    btnNo.textContent = t('no');
    btnYes.textContent = t('yes');
    btnNo.className = 'modal-btn modal-btn-no';
    btnYes.className = 'modal-btn modal-btn-yes';
    const icon = document.getElementById('modal-icon');
    if (icon) icon.classList.remove('visible');
    overlay.classList.add('active');

    function cleanup() {
      overlay.classList.remove('active');
      btnNo.removeEventListener('click', onNo);
      btnYes.removeEventListener('click', onYes);
    }

    function onNo() { cleanup(); resolve(false); }
    function onYes() { cleanup(); resolve(true); }

    btnNo.addEventListener('click', onNo);
    btnYes.addEventListener('click', onYes);
  });
}

// Special modal for "not enough coins" with CTA to shop
function showNoCoinsModal() {
  return new Promise((resolve) => {
    const overlay = document.getElementById('custom-modal');
    const msgEl = document.getElementById('modal-message');
    const btnNo = document.getElementById('modal-btn-no');
    const btnYes = document.getElementById('modal-btn-yes');

    msgEl.textContent = t('not_enough_coins');
    btnNo.textContent = t('cancel');
    btnNo.className = 'modal-btn modal-btn-no';
    btnYes.textContent = t('buy_coins');
    btnYes.className = 'modal-btn modal-btn-yes modal-btn-cta';
    const icon = document.getElementById('modal-icon');
    if (icon) { icon.textContent = '\u{1FA99}'; icon.classList.add('visible'); }
    overlay.classList.add('active');

    function cleanup() {
      overlay.classList.remove('active');
      btnNo.removeEventListener('click', onNo);
      btnYes.removeEventListener('click', onYes);
    }

    function onNo() { cleanup(); resolve(false); }
    function onYes() { cleanup(); resolve(true); }

    btnNo.addEventListener('click', onNo);
    btnYes.addEventListener('click', onYes);
  });
}

// ============ SCREENS ============

function showScreen(name, trackPrevious = true) {
  const prev = document.querySelector('.screen.active');
  const prevName = prev ? prev.id.replace('screen-', '') : 'menu';

  // Track previous screen for back navigation (except for transient screens)
  if (trackPrevious && prevName !== name && !['loading'].includes(prevName)) {
    state.previousScreen = prevName;
  }

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

function goBack() {
  const target = state.previousScreen || 'menu';
  showScreen(target);
}

// ============ MENU ============

function updateMenuStats() {
  if (!state.user) return;
  const best = state.user.bestSessionScore || 0;
  document.getElementById('menu-high-score').textContent = best.toLocaleString();

}

function updateAllCoinDisplays() {
  const coins = state.user?.coins || 0;
  document.querySelectorAll('#game-coins, #shop-coins').forEach(el => {
    el.textContent = coins.toLocaleString();
  });
}

// ============ GAME ============

// Save session score to server on game over or quit
async function endSession(sessionScore) {
  try {
    const res = await api('/api/game/end-session', 'POST', { sessionScore });
    if (res.bestSessionScore != null) {
      state.user.bestSessionScore = res.bestSessionScore;
    }
  } catch (e) {
    console.error('Failed to save session score:', e);
  }
}

// Start a fresh game session (resets score)
function startNewSession() {
  state.sessionScore = 0;
  loadNextRound();
}

// Preload next photo for instant display
let preloadedRound = null;

function getLastPhotoId() {
  return state.currentRound?.photo?.id || 0;
}

async function preloadNextRound() {
  try {
    const res = await api('/api/game/start', 'POST', { lastPhotoId: getLastPhotoId() });
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
      res = await api('/api/game/start', 'POST', { lastPhotoId: getLastPhotoId() });
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

    // Show drag hint only on first game ever
    const hintEl = document.getElementById('drag-hint');
    if (localStorage.getItem('ftb_hint_seen')) {
      hintEl.classList.add('hidden');
    } else {
      hintEl.classList.remove('hidden');
    }
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

  // Use global getImageBounds (defined below setupGame)

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

    // Hide hint and remember it permanently
    if (!state.hintDismissed) {
      state.hintDismissed = true;
      document.getElementById('drag-hint').classList.add('hidden');
      localStorage.setItem('ftb_hint_seen', '1');
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

function getImageBounds() {
  const img = document.getElementById('game-photo');
  const pc = document.getElementById('photo-container');
  const containerRect = pc.getBoundingClientRect();

  const imgNaturalW = img.naturalWidth || 800;
  const imgNaturalH = img.naturalHeight || 600;
  const containerW = containerRect.width;
  const containerH = containerRect.height;

  const imgRatio = imgNaturalW / imgNaturalH;
  const containerRatio = containerW / containerH;

  let renderW, renderH, offsetX, offsetY;

  if (imgRatio > containerRatio) {
    renderW = containerW;
    renderH = containerW / imgRatio;
    offsetX = 0;
    offsetY = (containerH - renderH) / 2;
  } else {
    renderH = containerH;
    renderW = containerH * imgRatio;
    offsetX = (containerW - renderW) / 2;
    offsetY = 0;
  }

  return { renderW, renderH, offsetX, offsetY, containerRect };
}

async function submitGuess() {
  if (!state.cursorPosition || !state.currentRound) return;

  const confirmBtn = document.getElementById('btn-confirm');
  confirmBtn.disabled = true;

  try {
    // Calculate actual search circle radius as % of rendered image width
    const { renderW } = getImageBounds();
    const circleRadiusPx = state.usedExpand ? 88 : 44; // half of 176px or 88px CSS
    const searchRadiusPct = (circleRadiusPx / renderW) * 100;

    const result = await api('/api/game/guess', 'POST', {
      roundId: state.currentRound.roundId,
      guessX: state.cursorPosition.x,
      guessY: state.cursorPosition.y,
      usedReveal: state.usedReveal,
      usedExpand: state.usedExpand,
      searchRadiusPct
    });

    // Update user state — use server-authoritative coin balance
    state.sessionScore += result.score;
    state.user.coins = result.coins;
    state.user.totalScore = (state.user.totalScore || 0) + result.score;
    state.user.gamesPlayed = (state.user.gamesPlayed || 0) + 1;
    updateAllCoinDisplays();

    // Handle new badges
    if (result.newBadges && result.newBadges.length > 0) {
      handleNewBadges(result.newBadges);
    }

    // Game over when too far (far or miss = you lose)
    if (result.rating === 'miss' || result.rating === 'far') {
      // Score from this bad round does NOT count
      state.sessionScore -= result.score;
      // Save best session score to server
      await endSession(state.sessionScore);
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
  // Haptic - double vibration for impact
  if (tg) {
    tg.HapticFeedback.notificationOccurred('error');
    setTimeout(() => tg.HapticFeedback.impactOccurred('heavy'), 200);
  }

  // Random game over emoji
  const goEmojis = ['😱', '😵', '💀', '😭', '🤦', '😤', '😩'];
  document.getElementById('gameover-emoji').textContent = goEmojis[Math.floor(Math.random() * goEmojis.length)];

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
        <span class="go-lb-pts">${(entry.dailyBestSession || 0).toLocaleString()}</span>
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
        <span class="go-lb-pts">${(statsData.dailyBestSession || 0).toLocaleString()}</span>
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
    const goShop = await showNoCoinsModal();
    if (goShop) showShop();
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
    const goShop = await showNoCoinsModal();
    if (goShop) showShop();
    return;
  }

  const confirmed = await showModal(t('expand_confirm'));
  if (!confirmed) return;

  // Mark as used visually — server will deduct coins on guess submission
  state.usedExpand = true;
  document.getElementById('btn-expand').classList.add('used');
  document.getElementById('btn-expand').disabled = true;

  // Show expanded search circle
  const searchCircle = document.getElementById('search-circle');
  searchCircle.classList.add('expanded');

  if (tg) tg.HapticFeedback.impactOccurred('light');
}

// ============ LEADERBOARD ============

let lbTimerInterval = null;
let lbResetAt = null;

async function startLbTimer() {
  if (!lbResetAt) {
    try {
      const data = await api('/api/leaderboard/timer');
      lbResetAt = new Date(data.resetAt).getTime();
    } catch (e) {
      return;
    }
  }
  if (lbTimerInterval) clearInterval(lbTimerInterval);
  lbTimerInterval = setInterval(() => {
    const now = Date.now();
    const diff = Math.max(0, lbResetAt - now);
    const h = String(Math.floor(diff / 3600000)).padStart(2, '0');
    const m = String(Math.floor((diff % 3600000) / 60000)).padStart(2, '0');
    const s = String(Math.floor((diff % 60000) / 1000)).padStart(2, '0');
    const el = document.getElementById('lb-timer');
    if (el) el.textContent = `${h}:${m}:${s}`;
    if (diff <= 0) {
      lbResetAt = null;
      clearInterval(lbTimerInterval);
    }
  }, 1000);
}

async function showLeaderboard() {
  showScreen('leaderboard');
  startLbTimer();

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
      list.innerHTML = '<p style="text-align:center;padding:40px;color:var(--on-surface-variant)">Aucun joueur pour le moment.<br>Sois le premier!</p>';
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
          <div class="lb-games">${entry.gamesPlayed} parties</div>
        </div>
        <span class="lb-score">${(entry.dailyBestSession || 0).toLocaleString()}</span>
      `;
      list.appendChild(div);
    });
  } catch (err) {
    console.error('Leaderboard error:', err);
  }
}

// ============ SHOP ============

let selectedPack = null;
let shopPricesLoaded = false;

function showShop() {
  updateAllCoinDisplays();
  showScreen('shop');
  if (!shopPricesLoaded) loadShopPrices();
}

async function loadShopPrices() {
  try {
    const data = await api('/api/shop/prices');
    if (!data.packs) return;
    data.packs.forEach(p => {
      const item = document.querySelector(`#shop-list .shop-item[data-pack="${p.pack}"]`);
      if (item) {
        item.dataset.stars = p.stars;
        item.dataset.ton = p.ton;
        item.dataset.price = p.usd;
      }
    });
    shopPricesLoaded = true;
  } catch (e) {
    console.error('Failed to load prices:', e);
  }
}

// Open bottom sheet with pack details
function openPaymentSheet(element) {
  const pack = element.dataset.pack;
  const price = element.dataset.price;
  const stars = element.dataset.stars;
  const ton = element.dataset.ton;

  selectedPack = { pack: parseInt(pack), price, stars: parseInt(stars), ton: parseFloat(ton) };

  document.getElementById('sheet-pack-label').textContent = `+ ${parseInt(pack).toLocaleString()} Coins`;
  document.getElementById('sheet-price').textContent = `$${price}`;
  document.getElementById('sheet-stars-amount').innerHTML = `&#11088; ${stars}`;
  document.getElementById('sheet-ton-amount').innerHTML = `&#128142; ${ton} TON`;

  document.getElementById('payment-sheet').classList.add('active');
}

function closePaymentSheet() {
  document.getElementById('payment-sheet').classList.remove('active');
  selectedPack = null;
}

async function buyWithStars() {
  if (!selectedPack) return;
  const { pack, stars } = selectedPack;

  try {
    const invoiceRes = await api('/api/shop/create-invoice', 'POST', { pack, stars });

    if (invoiceRes.invoiceLink && tg?.openInvoice) {
      tg.openInvoice(invoiceRes.invoiceLink, async (status) => {
        if (status === 'paid') {
          // Payment verified server-side via webhook. Poll for updated balance.
          await new Promise(r => setTimeout(r, 1500));
          const res = await api('/api/user/coins');
          state.user.coins = res.coins;
          updateAllCoinDisplays();
          showToast(`+${pack} coins!`);
          if (tg) tg.HapticFeedback.notificationOccurred('success');
          closePaymentSheet();
        }
      });
    } else {
      // Dev mode fallback
      const res = await api('/api/shop/buy', 'POST', { pack });
      state.user.coins = res.coins;
      updateAllCoinDisplays();
      showToast(`+${res.purchased} coins!`);
      closePaymentSheet();
    }
  } catch (err) {
    await showModal(err.message || 'Payment error');
  }
}

async function buyWithTon() {
  if (!selectedPack) return;
  const { pack } = selectedPack;

  try {
    const res = await api('/api/shop/ton-invoice', 'POST', { pack });
    if (res.paymentUrl) {
      window.open(res.paymentUrl, '_blank');
      showToast(t('payment_disclaimer'));
      closePaymentSheet();
    }
  } catch (err) {
    await showModal(err.message || 'Payment error');
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

  // Award social_star badge
  api('/api/user/badges/social', 'POST').then(res => {
    if (res && res.awarded) {
      handleNewBadges(['social_star']);
    }
  }).catch(() => {});

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
document.getElementById('btn-quit').addEventListener('click', async () => {
  document.getElementById('overlay-pause').classList.remove('active');
  // Quitting mid-game = save session score
  await endSession(state.sessionScore);
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
  loadBadges();
  showScreen('menu');
});

// Game Over buttons
document.getElementById('btn-restart').addEventListener('click', startNewSession);
document.getElementById('btn-gameover-menu').addEventListener('click', () => {
  state.sessionScore = 0;
  updateMenuStats();
  updateAllCoinDisplays();
  loadBadges();
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
  goBack();
});

// Shop
document.getElementById('btn-shop-back').addEventListener('click', goBack);
document.querySelectorAll('#shop-list .shop-item[data-pack]').forEach(item => {
  item.addEventListener('click', () => openPaymentSheet(item));
});

// Invite friend
document.getElementById('btn-invite-friend').addEventListener('click', async () => {
  try {
    const res = await api('/api/invite-link');
    if (res.link && tg) {
      tg.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(res.link)}&text=${encodeURIComponent(t('share_text').replace('{score}', ''))}`);
    } else if (res.link) {
      navigator.clipboard?.writeText(res.link);
      showToast('Link copied!');
    }
  } catch (e) {
    console.error('Invite error:', e);
  }
});

// Payment bottom sheet
document.getElementById('payment-sheet-backdrop').addEventListener('click', closePaymentSheet);
document.getElementById('payment-sheet-close').addEventListener('click', closePaymentSheet);
document.getElementById('sheet-btn-stars').addEventListener('click', buyWithStars);
document.getElementById('sheet-btn-ton').addEventListener('click', buyWithTon);

// Share score button
const shareBtn = document.getElementById('btn-share-score');
if (shareBtn) {
  shareBtn.addEventListener('click', shareScore);
}

// Badges section - open overlay
document.getElementById('menu-badges').addEventListener('click', async () => {
  const data = userBadgesData || await loadBadges();
  renderBadgesOverlay(data);
  document.getElementById('overlay-badges').classList.add('active');
});

// Badges overlay close
document.getElementById('btn-badges-close').addEventListener('click', () => {
  document.getElementById('overlay-badges').classList.remove('active');
});
