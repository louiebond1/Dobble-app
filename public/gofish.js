const el = (id) => document.getElementById(id);
const setupWrap = el('setupWrap');
const setup = el('setup');
const lobby = el('lobby');
const gameArea = el('gameArea');
const gameOver = el('gameOver');

const socket = io();

let mode = 'solo'; // 'solo' | 'duo'
let roomCode = null;
let hostToken = null;
let isHost = false;
let myName = null;
let players = [];
let totalRounds = 1;
let roundNumber = 0;

// A Go Fish move is deliberately presented as a short story rather than an
// instant state replacement. Server state can arrive while an animation is
// running; we hold the newest snapshot and reveal it only once the physical
// card movement has finished.
let lastGameState = null;
let pendingGameState = null;
let pendingRoundResult = null;
let pendingGameOver = null;
let actionAnimating = false;
let askPending = false;
const actionQueue = [];

const TURN_TIMING = {
  anticipation: 430,
  settle: 280,
  book: 760,
};

const CPU_PACING = {
  thinkMin: 1180,
  thinkJitter: 620,
  finalThinkMin: 1350,
  finalThinkJitter: 520,
  preAsk: 460,
  preAskMemory: 680,
  askRead: 900,
  responseRead: 560,
  fishRead: 680,
  settle: 520,
  outcomeHold: 900,
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const GF_STORAGE = {
  tutorial: 'gofish:tutorial:v2',
  soundMuted: 'gofish:sound-muted:v1',
  soloRecord: 'gofish:solo-record:v1',
  duoRecord: 'gofish:duo-record:v1',
};

function gfStorageGet(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch (e) {
    return fallback;
  }
}

function gfStorageSet(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
}

let gfSoundMuted = !!gfStorageGet(GF_STORAGE.soundMuted, false);
let gfAudioContext = null;

function ensureGfAudio() {
  if (gfSoundMuted) return null;
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    if (!gfAudioContext) gfAudioContext = new AudioCtx();
    if (gfAudioContext.state === 'suspended') gfAudioContext.resume().catch(() => {});
    return gfAudioContext;
  } catch (e) {
    return null;
  }
}

function gfNote(freq, duration = .08, {
  type = 'sine',
  gain = .025,
  delay = 0,
  endFreq = null,
} = {}) {
  const ctx = ensureGfAudio();
  if (!ctx) return;
  const start = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (endFreq) osc.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), start + duration);
  amp.gain.setValueAtTime(.0001, start);
  amp.gain.exponentialRampToValueAtTime(gain, start + .012);
  amp.gain.exponentialRampToValueAtTime(.0001, start + duration);
  osc.connect(amp);
  amp.connect(ctx.destination);
  osc.start(start);
  osc.stop(start + duration + .02);
}

function gfSound(kind) {
  if (gfSoundMuted) return;
  if (kind === 'slide') gfNote(260, .10, { type: 'triangle', gain: .014, endFreq: 175 });
  else if (kind === 'flip') gfNote(860, .055, { type: 'sine', gain: .020, endFreq: 1120 });
  else if (kind === 'land') gfNote(165, .075, { type: 'triangle', gain: .018, endFreq: 125 });
  else if (kind === 'fish') gfNote(185, .18, { type: 'sine', gain: .020, endFreq: 145 });
  else if (kind === 'turn') gfNote(440, .06, { type: 'sine', gain: .012, endFreq: 520 });
  else if (kind === 'book') {
    gfNote(520, .13, { type: 'sine', gain: .022 });
    gfNote(780, .14, { type: 'sine', gain: .020, delay: .08 });
    gfNote(1040, .18, { type: 'sine', gain: .018, delay: .16 });
  } else if (kind === 'lucky') {
    gfNote(720, .10, { type: 'triangle', gain: .020 });
    gfNote(1080, .16, { type: 'sine', gain: .020, delay: .09 });
  } else if (kind === 'closing') {
    gfNote(220, .22, { type: 'triangle', gain: .021, endFreq: 185 });
    gfNote(330, .24, { type: 'sine', gain: .018, delay: .16, endFreq: 300 });
    gfNote(494, .28, { type: 'sine', gain: .014, delay: .34 });
  } else if (kind === 'final') {
    gfNote(196, .20, { type: 'triangle', gain: .022 });
    gfNote(294, .22, { type: 'triangle', gain: .020, delay: .15 });
    gfNote(392, .32, { type: 'sine', gain: .018, delay: .31 });
  }
}

document.addEventListener('pointerdown', () => ensureGfAudio(), { once: true, capture: true });

let cpuBubbleTimer = null;
function showCpuBubble(text, { memory = false, duration = 1300 } = {}) {
  if (mode !== 'solo') return;
  const bubble = el('cpuBubble');
  if (!bubble) return;
  clearTimeout(cpuBubbleTimer);
  bubble.textContent = text;
  bubble.classList.remove('hidden', 'show', 'memory');
  bubble.classList.toggle('memory', memory);
  void bubble.offsetWidth;
  bubble.classList.add('show');
  cpuBubbleTimer = setTimeout(() => bubble.classList.add('hidden'), duration);
}

function cpuLine(lines) {
  return lines[Math.floor(Math.random() * lines.length)];
}

let tutorialMode = false;
let coachStep = null;
const tutorialSeen = new Set();
let coachTimer = null;

function startTutorialIfNeeded() {
  tutorialMode = !gfStorageGet(GF_STORAGE.tutorial, false);
  tutorialSeen.clear();
  coachStep = null;
  const coach = el('coachCard');
  if (coach) coach.classList.add('hidden');
}

function finishTutorial() {
  if (!tutorialMode) return;
  gfStorageSet(GF_STORAGE.tutorial, true);
  tutorialMode = false;
  const coach = el('coachCard');
  if (coach) coach.classList.add('hidden');
}

function showCoach(step, text, { kicker = 'FIRST GAME', autoHide = 0 } = {}) {
  if (!tutorialMode || tutorialSeen.has(step)) return;
  tutorialSeen.add(step);
  coachStep = step;
  clearTimeout(coachTimer);
  el('coachKicker').textContent = kicker;
  el('coachText').textContent = text;
  el('coachCard').classList.remove('hidden');
  if (autoHide) coachTimer = setTimeout(() => el('coachCard').classList.add('hidden'), autoHide);
}

function hideCoach() {
  clearTimeout(coachTimer);
  el('coachCard').classList.add('hidden');
}

el('coachDismiss').addEventListener('click', hideCoach);

function emptySoloRecord() {
  return { games: 0, wins: 0, losses: 0, draws: 0, streak: 0, bestStreak: 0 };
}

function loadSoloRecord() {
  return { ...emptySoloRecord(), ...(gfStorageGet(GF_STORAGE.soloRecord, {}) || {}) };
}

function updateSoloRecord(result) {
  const record = loadSoloRecord();
  record.games += 1;
  if (result.winner === 'me') {
    record.wins += 1;
    record.streak += 1;
    record.bestStreak = Math.max(record.bestStreak, record.streak);
  } else if (result.winner === 'cpu') {
    record.losses += 1;
    record.streak = 0;
  } else {
    record.draws += 1;
    record.streak = 0;
  }
  gfStorageSet(GF_STORAGE.soloRecord, record);
  return record;
}

function soloRecordText(record = loadSoloRecord()) {
  if (!record.games) return '';
  return `On this phone · <strong>You ${record.wins}</strong> – ${record.losses} CPU${record.draws ? ` · ${record.draws} draw${record.draws === 1 ? '' : 's'}` : ''}${record.bestStreak > 1 ? ` · best streak ${record.bestStreak}` : ''}`;
}

function renderSetupRecord() {
  const strip = el('setupRecordStrip');
  if (!strip) return;
  const text = soloRecordText();
  strip.classList.toggle('hidden', !text);
  strip.innerHTML = text;
}

function loadDuoRecord() {
  return { louie: 0, ariel: 0, draws: 0, games: 0, ...(gfStorageGet(GF_STORAGE.duoRecord, {}) || {}) };
}

function updateDuoRecord(winnerName) {
  const record = loadDuoRecord();
  record.games += 1;
  if (winnerName === 'Louie') record.louie += 1;
  else if (winnerName === 'Ariel') record.ariel += 1;
  else record.draws += 1;
  gfStorageSet(GF_STORAGE.duoRecord, record);
  return record;
}

function duoRecordText(record = loadDuoRecord()) {
  if (!record.games) return '';
  return `On this phone · <strong>Louie ${record.louie}</strong> – ${record.ariel} Ariel${record.draws ? ` · ${record.draws} draw${record.draws === 1 ? '' : 's'}` : ''}`;
}

let activeFinalOrder = [];
function displayFinalName(name) {
  if (name === 'me' || name === currentPlayerName() || name === myName) return 'You';
  if (name === 'cpu') return 'CPU';
  return name || 'Opponent';
}

function renderFinalOrder(order = activeFinalOrder, currentIndex = 0) {
  activeFinalOrder = (order || []).map(displayFinalName);
  const markup = activeFinalOrder.map((name, index) => {
    const cls = index < currentIndex ? ' done' : index === currentIndex ? ' current' : '';
    return `<span class="gf-final-order-step${cls}"><b>${index + 1}</b>${escapeResultText(name)}</span>`;
  }).join('');
  const overlay = el('finalRoundOrder');
  if (overlay) overlay.innerHTML = markup;

  const progress = el('finalProgress');
  if (!progress) return;
  if (!activeFinalOrder.length) {
    progress.classList.add('hidden');
    progress.innerHTML = '';
    return;
  }
  progress.classList.remove('hidden');
  progress.innerHTML = activeFinalOrder.map((name, index) => {
    const cls = index < currentIndex ? ' done' : index === currentIndex ? ' current' : '';
    return `<span class="gf-final-progress-step${cls}"><b>${index + 1}</b>${escapeResultText(name)}</span>`;
  }).join('');
}

let lastTurnFocus = null;
function updateTurnFocus(data) {
  if (!data) return;
  gameArea.classList.toggle('gf-turn-me', !!data.isMyTurn);
  gameArea.classList.toggle('gf-turn-them', !data.isMyTurn);
  const focus = data.turnName || (data.isMyTurn ? currentPlayerName() : 'opponent');
  if (focus && lastTurnFocus && focus !== lastTurnFocus && !actionAnimating) gfSound('turn');
  lastTurnFocus = focus;
}

function updatePondPressure(count) {
  gameArea.classList.toggle('gf-pond-low', count > 0 && count <= 5);
  gameArea.classList.toggle('gf-pond-critical', count > 0 && count <= 3);
  gameArea.classList.toggle('gf-last-card', count === 1);

  const warning = el('pondWarning');
  const title = el('pondTitle');
  if (!warning || !title) return;
  warning.classList.toggle('hidden', count > 5);
  title.textContent = count === 0 ? 'Pond empty' : 'Fish pond';
  if (count === 1) warning.textContent = 'LAST CARD';
  else if (count > 1 && count <= 3) warning.textContent = `${count} LEFT`;
  else if (count > 3 && count <= 5) warning.textContent = 'GETTING LOW';
  else if (count === 0) warning.textContent = 'FINAL ROUND';
  else warning.textContent = '';
}

function isClosingState(data = lastGameState) {
  if (mode === 'solo') return !!(typeof soloClosing !== 'undefined' && soloClosing);
  return !!data && ['CLOSING_INTRO', 'CLOSING'].includes(data.gamePhase);
}

function updateClosingAtmosphere(data = lastGameState) {
  const active = isClosingState(data) && !(data && ['FINAL_ROUND_INTRO', 'FINAL_ROUND', 'GAME_OVER'].includes(data.gamePhase));
  gameArea.classList.toggle('gf-closing-mode', active);
  const badge = el('closingBadge');
  if (badge) badge.classList.toggle('hidden', !active);

  if (active) {
    const warning = el('pondWarning');
    if (warning && Number(data && data.pondCount) > 0) {
      warning.classList.remove('hidden');
      warning.textContent = Number(data.pondCount) === 1 ? 'LAST CARD' : `${data.pondCount} LEFT · CLOSING`;
    }
  }
}

function updateFinalProgressFromState(data) {
  if (mode === 'solo') {
    if (typeof soloFinal !== 'undefined' && soloFinal && soloFinal.active) {
      renderFinalOrder(soloFinal.order, soloFinal.index);
    } else {
      renderFinalOrder([], 0);
    }
    return;
  }

  if (data && (data.gamePhase === 'FINAL_ROUND' || data.gamePhase === 'FINAL_ROUND_INTRO')) {
    const index = Number.isInteger(data.finalRoundIndex) ? data.finalRoundIndex : 0;
    renderFinalOrder(activeFinalOrder, index);
  } else {
    renderFinalOrder([], 0);
  }
}

const soundButton = el('soundBtn');
soundButton.setAttribute('aria-pressed', gfSoundMuted ? 'true' : 'false');
soundButton.textContent = gfSoundMuted ? '×' : '♪';
soundButton.setAttribute('aria-label', gfSoundMuted ? 'Turn Go Fish sounds on' : 'Mute Go Fish sounds');
soundButton.addEventListener('click', () => {
  gfSoundMuted = !gfSoundMuted;
  gfStorageSet(GF_STORAGE.soundMuted, gfSoundMuted);
  soundButton.setAttribute('aria-pressed', gfSoundMuted ? 'true' : 'false');
  soundButton.textContent = gfSoundMuted ? '×' : '♪';
  soundButton.setAttribute('aria-label', gfSoundMuted ? 'Turn Go Fish sounds on' : 'Mute Go Fish sounds');
  if (!gfSoundMuted) {
    ensureGfAudio();
    gfSound('turn');
  }
});

renderSetupRecord();


const GF_PHASES = Object.freeze({
  SETUP: 'SETUP',
  PLAYER_SELECTING: 'PLAYER_SELECTING',
  PLAYER_ASKING: 'PLAYER_ASKING',
  CARD_TRANSFER: 'CARD_TRANSFER',
  GO_FISH: 'GO_FISH',
  DRAWING: 'DRAWING',
  BOOK_COMPLETING: 'BOOK_COMPLETING',
  CPU_THINKING: 'CPU_THINKING',
  CPU_ASKING: 'CPU_ASKING',
  CLOSING_INTRO: 'CLOSING_INTRO',
  CLOSING_PLAYER: 'CLOSING_PLAYER',
  CLOSING_CPU: 'CLOSING_CPU',
  FINAL_ROUND_INTRO: 'FINAL_ROUND_INTRO',
  FINAL_ROUND_PLAYER: 'FINAL_ROUND_PLAYER',
  FINAL_ROUND_CPU: 'FINAL_ROUND_CPU',
  GAME_OVER: 'GAME_OVER',
});

let gamePhase = GF_PHASES.SETUP;
let pendingClosingRoundIntro = null;
let closingRoundIntroShowing = false;
let pendingFinalRoundIntro = null;
let finalRoundIntroShowing = false;

function setGamePhase(phase) {
  gamePhase = phase;
  const label = el('phaseLabel');
  if (!label) return;
  const labels = {
    [GF_PHASES.SETUP]: 'Classic · 52 cards',
    [GF_PHASES.PLAYER_SELECTING]: 'Your turn',
    [GF_PHASES.PLAYER_ASKING]: 'Asking…',
    [GF_PHASES.CARD_TRANSFER]: 'Cards moving…',
    [GF_PHASES.GO_FISH]: 'Go Fish',
    [GF_PHASES.DRAWING]: 'Drawing…',
    [GF_PHASES.BOOK_COMPLETING]: 'Book complete',
    [GF_PHASES.CPU_THINKING]: mode === 'solo' ? 'CPU thinking…' : 'Their turn',
    [GF_PHASES.CPU_ASKING]: mode === 'solo' ? 'CPU asking…' : 'They’re asking…',
    [GF_PHASES.CLOSING_INTRO]: 'Closing Phase',
    [GF_PHASES.CLOSING_PLAYER]: 'Closing · Your one ask',
    [GF_PHASES.CLOSING_CPU]: mode === 'solo' ? 'Closing · CPU one ask' : 'Closing · Their one ask',
    [GF_PHASES.FINAL_ROUND_INTRO]: 'Final Round',
    [GF_PHASES.FINAL_ROUND_PLAYER]: 'Final Round · Your ask',
    [GF_PHASES.FINAL_ROUND_CPU]: mode === 'solo' ? 'Final Round · CPU ask' : 'Final Round · Their ask',
    [GF_PHASES.GAME_OVER]: 'Game over',
  };
  label.textContent = labels[phase] || 'Go Fish';
}

function humanSelectionPhase() {
  return [
    GF_PHASES.PLAYER_SELECTING,
    GF_PHASES.CLOSING_PLAYER,
    GF_PHASES.FINAL_ROUND_PLAYER,
  ].includes(gamePhase);
}

function syncPhaseFromState(data) {
  if (!data || mode !== 'duo' || actionAnimating) return;
  if (data.gamePhase === 'CLOSING_INTRO') {
    setGamePhase(GF_PHASES.CLOSING_INTRO);
  } else if (data.gamePhase === 'CLOSING') {
    setGamePhase(data.isMyTurn ? GF_PHASES.CLOSING_PLAYER : GF_PHASES.CLOSING_CPU);
  } else if (data.gamePhase === 'FINAL_ROUND_INTRO') {
    setGamePhase(GF_PHASES.FINAL_ROUND_INTRO);
  } else if (data.gamePhase === 'FINAL_ROUND') {
    setGamePhase(data.isMyTurn ? GF_PHASES.FINAL_ROUND_PLAYER : GF_PHASES.FINAL_ROUND_CPU);
  } else if (data.gamePhase === 'GAME_OVER') {
    setGamePhase(GF_PHASES.GAME_OVER);
  } else {
    setGamePhase(data.isMyTurn ? GF_PHASES.PLAYER_SELECTING : GF_PHASES.CPU_THINKING);
  }
}

function stateAllowsSelection(data) {
  if (!data || !data.isMyTurn || data.actionLocked) return false;
  if (mode === 'solo') return humanSelectionPhase();
  return ['NORMAL', 'CLOSING', 'FINAL_ROUND'].includes(data.gamePhase);
}

async function showClosingRoundIntro(info = pendingClosingRoundIntro || {}) {
  setGamePhase(GF_PHASES.CLOSING_INTRO);
  gameArea.classList.add('gf-resolving');
  gameArea.classList.add('gf-closing-mode');

  const overlay = el('closingOverlay');
  const eyebrow = overlay.querySelector('.gf-closing-eyebrow');
  const pondCount = Number(info.pondCount) || 5;
  if (eyebrow) eyebrow.textContent = `${pondCount} CARD${pondCount === 1 ? '' : 'S'} LEFT`;

  overlay.classList.remove('hidden');
  gfSound('closing');
  hapticSuccess();
  await wait(2300);
  overlay.classList.add('hidden');
  gameArea.classList.remove('gf-resolving');
}

async function presentPendingClosingRoundIntro() {
  if (mode !== 'duo' || closingRoundIntroShowing || !pendingClosingRoundIntro) return;
  closingRoundIntroShowing = true;
  const info = pendingClosingRoundIntro;
  pendingClosingRoundIntro = null;
  try {
    await showClosingRoundIntro(info);
    if (lastGameState) applyGameState(lastGameState);
  } finally {
    closingRoundIntroShowing = false;
  }
}

async function showFinalRoundIntro(info = pendingFinalRoundIntro || {}) {
  setGamePhase(GF_PHASES.FINAL_ROUND_INTRO);
  gameArea.classList.add('gf-resolving');

  const fallbackSoloOrder = typeof soloFinal !== 'undefined' && soloFinal && soloFinal.active ? soloFinal.order : [];
  const order = Array.isArray(info.order) && info.order.length ? info.order : fallbackSoloOrder;
  renderFinalOrder(order, 0);

  const overlay = el('finalRoundOverlay');
  overlay.classList.remove('hidden');
  gfSound('final');
  hapticSuccess();
  await wait(1900);
  overlay.classList.add('hidden');
  gameArea.classList.remove('gf-resolving');

  finishTutorial();
}

async function presentPendingFinalRoundIntro() {
  if (mode !== 'duo' || finalRoundIntroShowing || !pendingFinalRoundIntro) return;
  finalRoundIntroShowing = true;
  const info = pendingFinalRoundIntro;
  pendingFinalRoundIntro = null;
  try {
    await showFinalRoundIntro(info);
    if (lastGameState) applyGameState(lastGameState);
  } finally {
    finalRoundIntroShowing = false;
  }
}

const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const SUITS = ['♠', '♥', '♦', '♣'];
const RED_SUITS = new Set(['♥', '♦']);

function buildDeck() {
  const deck = [];
  for (const suit of SUITS) for (const rank of RANKS) deck.push({ rank, suit });
  return deck;
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function sortHand(hand) {
  return [...hand].sort((a, b) => RANKS.indexOf(a.rank) - RANKS.indexOf(b.rank));
}

// --- Premium rendering + turn choreography ---------------------------------

let selectedRank = null;

const RANK_SINGULAR = { A: 'Ace', J: 'Jack', Q: 'Queen', K: 'King' };
const RANK_PLURAL = { A: 'Aces', J: 'Jacks', Q: 'Queens', K: 'Kings' };

function rankSingular(rank) {
  return RANK_SINGULAR[rank] || rank;
}

function rankPlural(rank) {
  return RANK_PLURAL[rank] || `${rank}s`;
}

function cardKey(card) {
  return `${card.rank}-${card.suit}`;
}

function currentPlayerName() {
  if (mode === 'solo') return typeof soloName !== 'undefined' ? soloName : 'You';
  return myName || 'You';
}

function initialFor(name) {
  return String(name || '?').trim().charAt(0).toUpperCase() || '?';
}

function fanTransform(index, count, opponent = false) {
  const mid = (count - 1) / 2;
  const offset = index - mid;
  const rotateStep = opponent ? 2.25 : 2.7;
  const rotate = Math.max(-11, Math.min(11, offset * rotateStep));
  const arc = Math.min(opponent ? 7 : 10, Math.abs(offset) * (opponent ? 1.15 : 1.45));
  return `rotate(${rotate}deg) translateY(${arc}px)`;
}

function setHandOverlap(container, count, opponent = false) {
  const viewport = Math.min(window.innerWidth || 390, 620);
  const available = Math.max(250, viewport - 46);
  const cardWidth = opponent ? Math.min(60, Math.max(49, viewport * 0.138)) : Math.min(72, Math.max(58, viewport * 0.166));
  const needed = count * cardWidth;
  const overlap = count <= 1 ? 0 : Math.max(opponent ? 8 : 10, (needed - available) / (count - 1));
  const cap = opponent ? cardWidth * 0.74 : cardWidth * 0.76;
  container.style.setProperty('--gf-overlap', `${-Math.min(cap, overlap)}px`);
}

function cardFaceMarkup(card) {
  return `
    <span class="gf-card-corner">
      <span class="gf-card-rank">${card.rank}</span>
      <span class="gf-card-suit">${card.suit}</span>
    </span>
    <span class="gf-card-center">${card.suit}</span>
    <span class="gf-card-corner bottom">
      <span class="gf-card-rank">${card.rank}</span>
      <span class="gf-card-suit">${card.suit}</span>
    </span>`;
}

function cardEl(card) {
  const node = document.createElement('div');
  node.className = 'gf-card' + (RED_SUITS.has(card.suit) ? ' red' : '');
  node.dataset.rank = card.rank;
  node.dataset.suit = card.suit;
  node.dataset.cardKey = cardKey(card);
  node.innerHTML = cardFaceMarkup(card);
  node.setAttribute('aria-hidden', 'true');
  return node;
}

function renderMyHand(hand, { interactive = false, askableRanks = [] } = {}) {
  const container = el('myHand');
  container.innerHTML = '';
  const sorted = sortHand(hand);
  setHandOverlap(container, sorted.length, false);
  sorted.forEach((card, i) => {
    const node = cardEl(card);
    const isSelected = selectedRank === card.rank;
    node.style.transform = fanTransform(i, sorted.length, false) + (isSelected ? ' translateY(-10px)' : '');
    node.style.zIndex = String(i + 1 + (isSelected ? 30 : 0));
    node.classList.toggle('selected', isSelected);
    node.classList.toggle('is-disabled', !(interactive && askableRanks.includes(card.rank)));
    container.appendChild(node);
  });
  scheduleHandHitLayer(interactive ? askableRanks : []);
}

let handHitLayerFrame = 0;
let handHitLayerTimer = 0;
let handHitRanks = [];

function handHitLayer() {
  let layer = document.getElementById('myHandHitLayer');
  if (!layer) {
    layer = document.createElement('div');
    layer.id = 'myHandHitLayer';
    layer.className = 'gf-hand-hit-layer';
    layer.setAttribute('aria-label', 'Your hand');
    el('myHand').appendChild(layer);
  }
  return layer;
}

function rebuildHandHitLayer() {
  const container = el('myHand');
  const layer = handHitLayer();
  layer.innerHTML = '';

  if (!lastGameState || !stateAllowsSelection(lastGameState) || actionAnimating || askPending) return;

  const containerRect = container.getBoundingClientRect();
  const cards = Array.from(container.children).filter((node) => node.classList && node.classList.contains('gf-card'));
  cards.forEach((card, index) => {
    const rank = card.dataset.rank;
    if (!handHitRanks.includes(rank)) return;

    const rect = card.getBoundingClientRect();
    const hit = document.createElement('button');
    hit.type = 'button';
    hit.className = 'gf-card-hit';
    hit.dataset.rank = rank;
    hit.setAttribute('aria-label', `Select ${rankPlural(rank)}`);
    hit.style.left = `${rect.left - containerRect.left}px`;
    hit.style.top = `${rect.top - containerRect.top}px`;
    hit.style.width = `${rect.width}px`;
    hit.style.height = `${rect.height}px`;
    hit.style.zIndex = String(index + 1 + (selectedRank === rank ? 30 : 0));
    hit.addEventListener('click', (event) => {
      event.preventDefault();
      selectRank(rank);
    });
    layer.appendChild(hit);
  });
}

function scheduleHandHitLayer(askableRanks = handHitRanks) {
  handHitRanks = Array.from(new Set(askableRanks || []));
  cancelAnimationFrame(handHitLayerFrame);
  clearTimeout(handHitLayerTimer);
  handHitLayerFrame = requestAnimationFrame(() => {
    requestAnimationFrame(rebuildHandHitLayer);
  });
  // Safari can finish transform interpolation a frame later than paint.
  handHitLayerTimer = setTimeout(rebuildHandHitLayer, 230);
}

function renderOpponentBacks(count) {
  const container = el('opponentHand');
  container.innerHTML = '';
  setHandOverlap(container, count, true);
  for (let i = 0; i < count; i++) {
    const back = document.createElement('div');
    back.className = 'gf-card gf-card-back';
    back.dataset.backIndex = String(i);
    back.innerHTML = '<span class="gf-card-back-mark">A+L</span>';
    back.style.transform = fanTransform(i, count, true);
    back.style.zIndex = String(i + 1);
    container.appendChild(back);
  }
}

function renderBooks(containerId, books) {
  const container = el(containerId);
  container.innerHTML = '';
  books.forEach((rank) => {
    const book = document.createElement('span');
    book.className = 'gf-book';
    book.dataset.bookRank = rank;
    book.textContent = rank;
    book.title = `Book of ${rankPlural(rank)}`;
    container.appendChild(book);
  });
}

function updateIdentity(data) {
  const opponentName = data.opponent ? data.opponent.name : (mode === 'solo' ? 'CPU' : 'Opponent');
  const mine = currentPlayerName();

  el('opponentLabel').textContent = opponentName;
  el('opponentAvatar').textContent = initialFor(opponentName);
  el('opponentAvatar').classList.toggle('gf-avatar-ariel', opponentName === 'Ariel');
  el('opponentAvatar').classList.toggle('gf-avatar-louie', opponentName === 'Louie');

  el('myNameLabel').textContent = mine;
  el('myAvatar').textContent = initialFor(mine);
  el('myAvatar').classList.toggle('gf-avatar-louie', mine === 'Louie');
  el('myAvatar').classList.toggle('gf-avatar-ariel', mine === 'Ariel');

  el('askTargetName').textContent = opponentName;
  el('myCardCount').textContent = `${data.myHand.length} card${data.myHand.length === 1 ? '' : 's'}`;
  el('myBookCount').textContent = `${data.myBooks.length} book${data.myBooks.length === 1 ? '' : 's'}`;
  if (data.opponent) {
    el('opponentCardCount').textContent = `${data.opponent.handCount} card${data.opponent.handCount === 1 ? '' : 's'}`;
    el('opponentBookCount').textContent = `${data.opponent.books.length} book${data.opponent.books.length === 1 ? '' : 's'}`;
  }
}

function updateTurnPill(isMyTurn, turnName) {
  const pill = el('turnPill');
  pill.textContent = isMyTurn ? 'Your turn' : `${turnName || 'Opponent'}’s turn`;
  pill.classList.toggle('mine', isMyTurn);
}

function renderRankChoices(data) {
  const wrap = el('rankChoices');
  wrap.innerHTML = '';
  const ranks = (data.askableRanks || [])
    .filter((rank, index, arr) => arr.indexOf(rank) === index)
    .sort((a, b) => RANKS.indexOf(a) - RANKS.indexOf(b));
  const enabled = stateAllowsSelection(data) && !actionAnimating && !askPending;

  ranks.forEach((rank) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'gf-rank-chip';
    button.textContent = rank;
    button.disabled = !enabled;
    button.classList.toggle('selected', selectedRank === rank);
    button.setAttribute('aria-pressed', selectedRank === rank ? 'true' : 'false');
    button.addEventListener('click', () => selectRank(rank));
    wrap.appendChild(button);
  });
}

function updateAskControls(data) {
  const askButton = el('askBtn');
  const hint = el('askHint');
  const opponentName = data.opponent ? data.opponent.name : 'your opponent';
  const canAct = stateAllowsSelection(data) && !actionAnimating && !askPending;
  const rankStillValid = selectedRank && (data.askableRanks || []).includes(selectedRank);

  if (!rankStillValid) selectedRank = null;

  if (!data.isMyTurn) {
    askButton.disabled = true;
    askButton.textContent = `${data.turnName || opponentName}’s turn`;
    hint.textContent = 'Their move — your hand will update when they finish.';
  } else if (actionAnimating || askPending || data.actionLocked) {
    askButton.disabled = true;
    askButton.textContent = 'Resolving…';
    hint.textContent = 'Watch the cards — the result is playing out.';
  } else if (selectedRank) {
    const finalAsk = mode === 'solo'
      ? soloFinal.active
      : data.gamePhase === 'FINAL_ROUND';
    const closingAsk = !finalAsk && isClosingState(data);
    askButton.disabled = !canAct;
    askButton.textContent = finalAsk
      ? `Final ask · ${rankPlural(selectedRank)}`
      : closingAsk
        ? `One ask · ${rankPlural(selectedRank)}`
        : `Ask ${opponentName} for ${rankPlural(selectedRank)}`;
    hint.textContent = finalAsk
      ? 'One ask only. No fishing and no extra turn.'
      : closingAsk
        ? 'Closing Phase: this ask ends your turn, even if you get the cards.'
        : `Your ${rankPlural(selectedRank)} are highlighted. Nothing happens until you ask.`;
  } else {
    askButton.disabled = true;
    askButton.textContent = 'Choose a rank';
    hint.textContent = 'Pick any rank you already hold.';
  }

  const handCards = Array.from(document.querySelectorAll('#myHand > .gf-card'));
  handCards.forEach((card, index) => {
    const on = !!selectedRank && card.dataset.rank === selectedRank;
    card.classList.toggle('selected', on);
    card.style.transform = fanTransform(index, handCards.length, false) + (on ? ' translateY(-10px)' : '');
    card.style.zIndex = String(index + 1 + (on ? 30 : 0));
  });
  scheduleHandHitLayer(data.askableRanks || []);
  document.querySelectorAll('#rankChoices .gf-rank-chip').forEach((button) => {
    const on = button.textContent === selectedRank;
    button.classList.toggle('selected', on);
    button.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
}

function selectRank(rank) {
  if (!lastGameState || !lastGameState.isMyTurn || lastGameState.actionLocked || actionAnimating || askPending) return;
  if (!stateAllowsSelection(lastGameState)) return;
  if (!(lastGameState.askableRanks || []).includes(rank)) return;
  selectedRank = selectedRank === rank ? null : rank;
  hapticTap();
  updateAskControls(lastGameState);
  if (selectedRank) {
    showCoach(
      'ask',
      `Good. ${rankPlural(selectedRank)} are selected — now press the Ask button. Nothing happens until you do.`,
      { autoHide: 3000 }
    );
  }
}

function applyGameState(data, { freezeTurn = false } = {}) {
  lastGameState = data;
  const interactive = stateAllowsSelection(data) && !actionAnimating && !askPending;
  if (!data.isMyTurn || !(data.askableRanks || []).includes(selectedRank)) selectedRank = null;

  renderMyHand(data.myHand, { interactive, askableRanks: data.askableRanks || [] });
  renderBooks('myBooks', data.myBooks || []);
  if (data.opponent) {
    renderOpponentBacks(data.opponent.handCount);
    renderBooks('opponentBooks', data.opponent.books || []);
  }
  el('pondCount').textContent = data.pondCount;
  updateIdentity(data);
  updateDuelHud(data);
  updatePondPressure(data.pondCount);
  updateClosingAtmosphere(data);
  if (!freezeTurn) {
    updateTurnFocus(data);
    updateFinalProgressFromState(data);
    syncPhaseFromState(data);
    updateTurnPill(data.isMyTurn, data.turnName);
  }
  renderRankChoices(data);
  updateAskControls(data);
  gameArea.classList.toggle('gf-resolving', !!data.actionLocked || actionAnimating || askPending);

  if (!freezeTurn && stateAllowsSelection(data)) {
    showCoach('select', 'Choose a rank you already hold. Tap the card itself or the rank below.');
  }
}

function lockVisibleHand() {
  askPending = true;
  gameArea.classList.add('gf-resolving');
  if (lastGameState) {
    renderRankChoices(lastGameState);
    updateAskControls(lastGameState);
  }
}

function rectOf(node) {
  if (!node) return null;
  const r = node.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height, right: r.right, bottom: r.bottom };
}

function captureVisualState() {
  const my = new Map();
  document.querySelectorAll('#myHand [data-card-key]').forEach((node) => my.set(node.dataset.cardKey, rectOf(node)));
  const opponent = Array.from(document.querySelectorAll('#opponentHand .gf-card')).map(rectOf);
  return {
    my,
    opponent,
    pond: rectOf(el('pondCard')),
  };
}

function cardDifference(fromCards, toCards) {
  const toKeys = new Set((toCards || []).map(cardKey));
  return (fromCards || []).filter((card) => !toKeys.has(cardKey(card)));
}

function createFlightCard(card, back = false) {
  const node = document.createElement('div');
  node.className = 'gf-card gf-flight-card';
  if (back || !card) {
    node.classList.add('gf-card-back');
    node.innerHTML = '<span class="gf-card-back-mark">A+L</span>';
  } else {
    if (RED_SUITS.has(card.suit)) node.classList.add('red');
    node.innerHTML = cardFaceMarkup(card);
  }
  document.body.appendChild(node);
  return node;
}

function setFlightAppearance(node, card, back) {
  node.className = 'gf-card gf-flight-card';
  if (back || !card) {
    node.classList.add('gf-card-back');
    node.innerHTML = '<span class="gf-card-back-mark">A+L</span>';
  } else {
    if (RED_SUITS.has(card.suit)) node.classList.add('red');
    node.innerHTML = cardFaceMarkup(card);
  }
}

async function flyBetweenRects(startRect, endRect, {
  card = null,
  startBack = false,
  endBack = false,
  delay = 0,
  targetNode = null,
} = {}) {
  if (!startRect || !endRect) return;
  if (delay) await wait(delay);
  if (targetNode) targetNode.classList.add('gf-staging-hidden');

  const node = createFlightCard(card, startBack);
  const endW = Math.max(1, endRect.width);
  const endH = Math.max(1, endRect.height);
  const startCx = startRect.left + startRect.width / 2;
  const startCy = startRect.top + startRect.height / 2;
  const endCx = endRect.left + endRect.width / 2;
  const endCy = endRect.top + endRect.height / 2;
  const dx = endCx - startCx;
  const dy = endCy - startCy;
  const sx = startRect.width / endW;
  const sy = startRect.height / endH;

  node.style.left = `${startCx - endW / 2}px`;
  node.style.top = `${startCy - endH / 2}px`;
  node.style.width = `${endW}px`;
  node.style.height = `${endH}px`;

  const startTransform = `translate3d(0,0,0) scale(${sx},${sy}) rotate(0deg)`;
  const midTransform = `translate3d(${dx * .56}px,${dy * .48 - 24}px,0) scale(${(sx + 1) / 2},${(sy + 1) / 2}) rotate(-4deg)`;
  const endTransform = `translate3d(${dx}px,${dy}px,0) scale(1,1) rotate(0deg)`;

  gfSound('slide');
  const first = node.animate(
    [{ transform: startTransform }, { transform: midTransform }],
    { duration: 390, easing: 'cubic-bezier(.24,.75,.22,1)', fill: 'forwards' }
  );
  try { await first.finished; } catch (e) {}

  if (startBack !== endBack) {
    const close = node.animate(
      [{ transform: midTransform + ' scaleX(1)' }, { transform: midTransform + ' scaleX(.06)' }],
      { duration: 95, easing: 'ease-in', fill: 'forwards' }
    );
    try { await close.finished; } catch (e) {}
    gfSound('flip');
    setFlightAppearance(node, card, endBack);
    const open = node.animate(
      [{ transform: midTransform + ' scaleX(.06)' }, { transform: midTransform + ' scaleX(1)' }],
      { duration: 120, easing: 'ease-out', fill: 'forwards' }
    );
    try { await open.finished; } catch (e) {}
  }

  const second = node.animate(
    [{ transform: midTransform }, { transform: endTransform }],
    { duration: 330, easing: 'cubic-bezier(.18,.8,.25,1)', fill: 'forwards' }
  );
  try { await second.finished; } catch (e) {}
  node.remove();
  gfSound('land');
  if (targetNode) {
    targetNode.classList.remove('gf-staging-hidden');
    targetNode.classList.remove('gf-landed');
    void targetNode.offsetWidth;
    targetNode.classList.add('gf-landed');
    setTimeout(() => targetNode.classList.remove('gf-landed'), 330);
  }
  scheduleHandHitLayer();
}

function playLayoutAnimation(node, keyframes, options) {
  const animation = node.animate(keyframes, options);
  return animation.finished
    .catch(() => {})
    .finally(() => {
      // iOS Safari can keep a composited transform's hit-test geometry
      // around after a WAAPI animation has visually finished. Explicitly
      // cancel the animation and force a layout read so the tap target is
      // rebuilt at the card's real DOM position.
      try { animation.cancel(); } catch (e) {}
      void node.offsetHeight;
      scheduleHandHitLayer();
    });
}

function animateExistingLayout(before) {
  const jobs = [];
  document.querySelectorAll('#myHand [data-card-key]').forEach((node) => {
    const oldRect = before.my.get(node.dataset.cardKey);
    if (!oldRect) return;
    const now = rectOf(node);
    const dx = oldRect.left - now.left;
    const dy = oldRect.top - now.top;
    const sx = oldRect.width / now.width;
    const sy = oldRect.height / now.height;
    const base = node.style.transform || '';
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1 && Math.abs(sx - 1) < .01 && Math.abs(sy - 1) < .01) return;
    jobs.push(playLayoutAnimation(
      node,
      [
        { transform: `translate(${dx}px,${dy}px) scale(${sx},${sy}) ${base}` },
        { transform: base },
      ],
      { duration: 520, easing: 'cubic-bezier(.2,.8,.2,1)' }
    ));
  });

  const newOpp = Array.from(document.querySelectorAll('#opponentHand .gf-card'));
  const common = Math.min(before.opponent.length, newOpp.length);
  for (let i = 0; i < common; i++) {
    const oldRect = before.opponent[i];
    const node = newOpp[i];
    const now = rectOf(node);
    const dx = oldRect.left - now.left;
    const dy = oldRect.top - now.top;
    const base = node.style.transform || '';
    jobs.push(playLayoutAnimation(
      node,
      [{ transform: `translate(${dx}px,${dy}px) ${base}` }, { transform: base }],
      { duration: 480, easing: 'cubic-bezier(.2,.8,.2,1)' }
    ));
  }
  return jobs;
}

function findBookNode(containerId, rank) {
  return document.querySelector(`#${containerId} [data-book-rank="${rank}"]`);
}

async function waitForPendingState(timeout = 1500) {
  const start = Date.now();
  while (!pendingGameState && Date.now() - start < timeout) await wait(18);
  return pendingGameState;
}

async function animateStateTransition(action, nextState) {
  if (!nextState) return;
  const oldState = lastGameState;
  const before = captureVisualState();
  const mine = action.askerName === currentPlayerName();
  const bookRank = Array.isArray(action.books) && action.books.length ? action.books[0] : null;

  selectedRank = null;
  applyGameState(nextState, { freezeTurn: true });

  const layoutJobs = animateExistingLayout(before);
  const flightJobs = [];
  const newMy = new Map();
  document.querySelectorAll('#myHand [data-card-key]').forEach((node) => newMy.set(node.dataset.cardKey, node));
  const newOpp = Array.from(document.querySelectorAll('#opponentHand .gf-card'));

  if (action.kind === 'take') {
    const movedCards = Array.isArray(action.cards) ? action.cards : [];
    if (mine) {
      if (bookRank) {
        const bookNode = findBookNode('myBooks', bookRank);
        const targetRect = rectOf(bookNode);
        if (bookNode) bookNode.classList.add('gf-staging-hidden');

        const existing = (oldState && oldState.myHand || []).filter((card) => card.rank === bookRank);
        existing.forEach((card, index) => {
          const startRect = before.my.get(cardKey(card));
          flightJobs.push(flyBetweenRects(startRect, targetRect, { card, startBack: false, endBack: false, delay: index * 55 }));
        });
        movedCards.forEach((card, index) => {
          const source = before.opponent[Math.max(0, before.opponent.length - 1 - index)];
          flightJobs.push(flyBetweenRects(source, targetRect, { card, startBack: true, endBack: false, delay: 80 + index * 60 }));
        });
        Promise.all(flightJobs).then(() => {
          if (bookNode) {
            bookNode.classList.remove('gf-staging-hidden');
            bookNode.classList.add('gf-book-pop');
          }
        });
      } else {
        movedCards.forEach((card, index) => {
          const targetNode = newMy.get(cardKey(card));
          const source = before.opponent[Math.max(0, before.opponent.length - 1 - index)];
          flightJobs.push(flyBetweenRects(source, rectOf(targetNode), {
            card, startBack: true, endBack: false, delay: index * 80, targetNode,
          }));
        });
      }
    } else {
      const targetBook = bookRank ? findBookNode('opponentBooks', bookRank) : null;
      const targetRect = targetBook ? rectOf(targetBook) : null;
      if (targetBook) targetBook.classList.add('gf-staging-hidden');
      movedCards.forEach((card, index) => {
        const startRect = before.my.get(cardKey(card));
        const targetNode = targetBook ? null : newOpp[Math.max(0, newOpp.length - 1 - index)];
        flightJobs.push(flyBetweenRects(startRect, targetBook ? targetRect : rectOf(targetNode), {
          card, startBack: false, endBack: true, delay: index * 75, targetNode,
        }));
      });
      Promise.all(flightJobs).then(() => {
        if (targetBook) {
          targetBook.classList.remove('gf-staging-hidden');
          targetBook.classList.add('gf-book-pop');
        }
      });
    }
  } else if ((action.kind === 'fish' || action.kind === 'replenish') && !action.pondEmpty) {
    if (mine) {
      const drawn = action.drawnCard;
      if (bookRank) {
        const bookNode = findBookNode('myBooks', bookRank);
        const targetRect = rectOf(bookNode);
        if (bookNode) bookNode.classList.add('gf-staging-hidden');
        const existing = (oldState && oldState.myHand || []).filter((card) => card.rank === bookRank);
        existing.forEach((card, index) => {
          flightJobs.push(flyBetweenRects(before.my.get(cardKey(card)), targetRect, {
            card, startBack: false, endBack: false, delay: index * 45,
          }));
        });
        flightJobs.push(flyBetweenRects(before.pond, targetRect, {
          card: drawn, startBack: true, endBack: false, delay: 90,
        }));
        Promise.all(flightJobs).then(() => {
          if (bookNode) {
            bookNode.classList.remove('gf-staging-hidden');
            bookNode.classList.add('gf-book-pop');
          }
        });
      } else if (drawn) {
        const targetNode = newMy.get(cardKey(drawn));
        flightJobs.push(flyBetweenRects(before.pond, rectOf(targetNode), {
          card: drawn, startBack: true, endBack: false, targetNode,
        }));
      }
    } else {
      const targetBook = bookRank ? findBookNode('opponentBooks', bookRank) : null;
      const targetNode = targetBook ? null : newOpp[newOpp.length - 1];
      if (targetBook) targetBook.classList.add('gf-staging-hidden');
      flightJobs.push(flyBetweenRects(before.pond, rectOf(targetBook || targetNode), {
        card: null, startBack: true, endBack: true, targetNode,
      }));
      Promise.all(flightJobs).then(() => {
        if (targetBook) {
          targetBook.classList.remove('gf-staging-hidden');
          targetBook.classList.add('gf-book-pop');
        }
      });
    }
  }

  await Promise.all([...layoutJobs, ...flightJobs]);
  ['myHand', 'opponentHand'].forEach((id) => {
    const hand = el(id);
    hand.classList.remove('gf-hand-settle');
    void hand.offsetWidth;
    hand.classList.add('gf-hand-settle');
    setTimeout(() => hand.classList.remove('gf-hand-settle'), 380);
  });
  updateTurnFocus(nextState);
  updateFinalProgressFromState(nextState);
  updateTurnPill(nextState.isMyTurn, nextState.turnName);
  renderRankChoices(nextState);
  updateAskControls(nextState);
  scheduleHandHitLayer(nextState.askableRanks || []);
}

let bannerTimer = null;
function showEventBanner(text, { book = false, persist = false, emphasis = false } = {}) {
  const banner = el('eventBanner');
  clearTimeout(bannerTimer);
  banner.textContent = text;
  banner.classList.remove('show', 'book', 'emphasis');
  void banner.offsetWidth;
  banner.classList.add('show');
  banner.classList.toggle('book', book);
  banner.classList.toggle('emphasis', emphasis);
  if (book) {
    const table = document.querySelector('.gf-table');
    table.classList.remove('gf-celebrate');
    void table.offsetWidth;
    table.classList.add('gf-celebrate');
    hapticSuccess();
  }
  if (!persist) {
    bannerTimer = setTimeout(() => {
      banner.textContent = '';
      banner.classList.remove('show', 'book', 'emphasis');
    }, book ? 3000 : 2300);
  }
}

function humanCount(count) {
  if (count === 1) return 'one';
  if (count === 2) return 'two';
  if (count === 3) return 'three';
  return String(count);
}

async function playTurnAction(action) {
  const mine = action.askerName === currentPlayerName();
  const cpuActor = mode === 'solo' && action.askerName === 'CPU';
  const targetName = action.opponentName || 'your opponent';
  gameArea.classList.add('gf-resolving');

  if (action.kind === 'skip') {
    setGamePhase(GF_PHASES.FINAL_ROUND_INTRO);
    showEventBanner(
      mine ? 'No cards left — your final ask is skipped' : `${action.askerName} has no cards — final ask skipped`,
      { persist: true }
    );
    await wait(650);
  } else if (action.kind === 'replenish') {
    setGamePhase(GF_PHASES.DRAWING);
    showEventBanner(mine ? 'Your hand is empty — drawing one' : `${action.askerName} draws back in`, { persist: true });
    await wait(180);
  } else {
    setGamePhase(mine ? GF_PHASES.PLAYER_ASKING : GF_PHASES.CPU_ASKING);
    showEventBanner(
      mine
        ? `You ask ${targetName} for ${rankPlural(action.rank)}…`
        : `${action.askerName} asks you for ${rankPlural(action.rank)}…`,
      { persist: true }
    );
    await wait(cpuActor ? CPU_PACING.askRead : TURN_TIMING.anticipation);

    if (action.kind === 'take') {
      setGamePhase(GF_PHASES.CARD_TRANSFER);
      if (mode === 'solo' && mine) {
        showCpuBubble(
          cpuLine([
            action.count === 1 ? 'Yep. I had one.' : `Yep. I had ${humanCount(action.count)}.`,
            action.count === 1 ? 'You got one.' : `You got all ${humanCount(action.count)}.`,
            'Fair enough.',
          ]),
          { duration: 980 }
        );
      }
      showEventBanner(
        mine
          ? `${targetName} had ${humanCount(action.count)}`
          : `You hand over ${humanCount(action.count)} ${action.count === 1 ? rankSingular(action.rank) : rankPlural(action.rank)}`,
        { persist: true }
      );
      if (cpuActor) await wait(CPU_PACING.responseRead);
    } else if (action.kind === 'final-miss') {
      if (mode === 'solo' && mine) showCpuBubble('Nothing.', { duration: 850 });
      showEventBanner(mine ? 'Nothing there' : 'You have none', { persist: true, emphasis: true });
      await wait(cpuActor ? CPU_PACING.responseRead : 260);
    } else {
      setGamePhase(GF_PHASES.GO_FISH);
      gfSound('fish');
      if (mode === 'solo' && mine) {
        showCpuBubble(cpuLine(['Nope. Go fish.', 'Nothing. Fish.', 'Not this time. Go fish.']), { duration: 1150 });
      }
      showEventBanner(mine ? 'GO FISH' : `${action.askerName} goes fishing`, { persist: true, emphasis: true });
      if (mine) {
        showCoach(
          'fish',
          'They had none, so one card comes from the pond. If it matches what you asked for, you keep the turn.',
          { autoHide: 3300 }
        );
      }
      await wait(cpuActor ? CPU_PACING.fishRead : 300);
      setGamePhase(GF_PHASES.DRAWING);
    }
  }

  let nextState = null;
  if (mode === 'solo') {
    nextState = getSoloStateSnapshot();
  } else {
    nextState = await waitForPendingState();
    if (nextState) pendingGameState = null;
  }

  if (nextState) await animateStateTransition(action, nextState);

  if (action.books && action.books.length) setGamePhase(GF_PHASES.BOOK_COMPLETING);
  await wait(cpuActor ? CPU_PACING.settle : TURN_TIMING.settle);
}

async function applyPendingAfterAction(action) {
  const mine = action.askerName === currentPlayerName();
  const cpuActor = mode === 'solo' && action.askerName === 'CPU';

  if (action.books && action.books.length) {
    const who = mine ? 'You' : action.askerName;
    gfSound('book');
    if (mode === 'solo' && !mine) showCpuBubble('That’s a book.', { duration: 1050 });
    showEventBanner(`${who} completed the book of ${rankPlural(action.books[0])}`, { book: true });
    showCoach(
      'book',
      'Four of a rank becomes a book automatically. Those four cards are now locked out of play.',
      { autoHide: 3300 }
    );
    await wait(TURN_TIMING.book);
  }

  if (action.finalRoundStarts) {
    await showFinalRoundIntro();
    return;
  }

  if (action.finalRound) {
    if (action.kind === 'skip') {
      showEventBanner(mine ? 'Your final turn is skipped' : `${action.askerName}’s final turn is skipped`);
    } else if (action.kind === 'take') {
      showEventBanner(mine ? 'Got them — final ask complete' : `${action.askerName} got them — final ask complete`);
    } else {
      showEventBanner(mine ? 'Nothing there — final ask complete' : `${action.askerName} found nothing — final ask complete`);
    }
    if (cpuActor) await wait(CPU_PACING.outcomeHold);
    return;
  }

  if (action.kind === 'replenish') {
    if (mine && action.drawnCard) {
      showEventBanner(`You draw ${action.drawnCard.rank}${action.drawnCard.suit} — keep playing`);
    } else {
      showEventBanner(`${action.askerName} is back in`);
    }
  } else if (action.kind === 'take') {
    if (mode === 'solo' && !mine) {
      showCpuBubble(
        lastCpuDecision && lastCpuDecision.reason === 'memory'
          ? cpuLine(['Knew it.', 'I remembered that.', 'Thought so.'])
          : cpuLine(['I’ll take those.', 'Got them.', 'That works.']),
        { memory: !!(lastCpuDecision && lastCpuDecision.reason === 'memory'), duration: 980 }
      );
    }
    showEventBanner(mine ? 'Got them — your turn again' : `${action.askerName} goes again`);
  } else if (action.luckyCatch || action.matched) {
    gfSound('lucky');
    if (mode === 'solo' && !mine) showCpuBubble('That’ll do.', { duration: 900 });
    showEventBanner('LUCKY CATCH — go again', { emphasis: true });
    showCoach(
      'lucky',
      'Exact match. That’s a Lucky Catch, so the same player gets another turn.',
      { autoHide: 3200 }
    );
  } else if (mine && action.drawnCard) {
    showEventBanner(`You drew ${action.drawnCard.rank}${action.drawnCard.suit} — ${action.opponentName}’s turn`);
  } else {
    showEventBanner(`${action.opponentName}’s turn`);
  }

  if (cpuActor) await wait(CPU_PACING.outcomeHold);
}

async function drainActionQueue() {
  if (actionAnimating || !actionQueue.length) return;
  actionAnimating = true;
  askPending = false;
  const action = actionQueue.shift();

  try {
    await playTurnAction(action);
    await applyPendingAfterAction(action);
  } finally {
    actionAnimating = false;
    askPending = false;
    gameArea.classList.remove('gf-resolving');

    if (pendingGameState) {
      const state = pendingGameState;
      pendingGameState = null;
      applyGameState(state);
    } else if (lastGameState) {
      applyGameState(lastGameState);
    }

    pendingRoundResult = null;

    if (!actionQueue.length && pendingFinalRoundIntro) {
      await presentPendingFinalRoundIntro();
    }

    if (!actionQueue.length && pendingGameOver) {
      const over = pendingGameOver;
      pendingGameOver = null;
      handleDuoGameOver(over);
      return;
    }

    drainActionQueue();
  }
}

function queueTurnAction(action) {
  actionQueue.push(action);
  drainActionQueue();
}

function askForRank(rank) {
  if (!rank || actionAnimating || askPending) return;
  if (mode === 'solo') return soloAsk(rank);
  if (!lastGameState || !lastGameState.isMyTurn || lastGameState.actionLocked) return;
  if (!(lastGameState.askableRanks || []).includes(rank)) return;
  lockVisibleHand();
  const opponentName = lastGameState.opponent ? lastGameState.opponent.name : 'your opponent';
  showEventBanner(`You ask ${opponentName} for ${rankPlural(rank)}…`, { persist: true });
  socket.emit('gofish:ask', { code: roomCode, rank }, (res) => {
    if (res && res.ok) return;
    askPending = false;
    gameArea.classList.remove('gf-resolving');
    if (lastGameState) applyGameState(lastGameState);
    showEventBanner('That move is no longer available');
  });
}

el('askBtn').addEventListener('click', () => {
  if (selectedRank) askForRank(selectedRank);
});

// One shuffled deck is one complete Go Fish game.

// --- Mode toggle ---------------------------------------------------------

document.querySelectorAll('#modeToggle .mode-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    mode = btn.dataset.mode;
    document.querySelectorAll('#modeToggle .mode-btn').forEach((b) => b.classList.toggle('active', b === btn));
    el('soloFields').classList.toggle('hidden', mode !== 'solo');
    el('duoFields').classList.toggle('hidden', mode !== 'duo');
    if (mode === 'solo') renderSetupRecord();
  });
});

// --- Quick Play (Head-to-Head) --------------------------------------------

el('joinLouieBtn').addEventListener('click', () => quickPlayJoin('Louie'));
el('joinArielBtn').addEventListener('click', () => quickPlayJoin('Ariel'));

function quickPlayJoin(name) {
  const note = el('quickplayNote');
  if (note) note.textContent = 'Joining…';
  socket.emit('gofish:quickplay:join', { name }, (res) => {
    if (!res || !res.ok) {
      if (note) {
        const messages = {
          'seat-taken': `${name} is already in the game on another phone.`,
          'room-full': 'Louie and Ariel are already both in the game.',
          'game-in-progress': 'A Go Fish game is already in progress.',
        };
        note.textContent = messages[res && res.error] || 'Couldn’t join that game. Try again.';
      }
      return;
    }
    isHost = res.isHost;
    hostToken = res.hostToken || null;
    roomCode = res.code;
    myName = res.name;
    if (note) note.textContent = 'Open Go Fish on both phones, then each take your seat.';
    setup.classList.add('hidden');
    lobby.classList.remove('hidden');
  });
}

el('lobbyBackBtn').addEventListener('click', () => {
  if (roomCode) {
    socket.emit(amHost() ? 'gofish:host:cancel' : 'gofish:leave', { code: roomCode });
  }
  resetRoomState();
  lobby.classList.add('hidden');
  setup.classList.remove('hidden');
});

function resetRoomState() {
  roomCode = null;
  hostToken = null;
  isHost = false;
  myName = null;
}

let mashupMode = false;
let mashupAutoStarted = false;

function amHost() {
  return !!hostToken;
}

socket.on('gofish:players:update', (list) => {
  players = list;
  updateLobby();
});

function updateLobby() {
  el('playerCount').textContent = players.length;
  el('startBtn').classList.toggle('hidden', !amHost());
  el('startBtn').disabled = players.length < 2;
  if (amHost()) {
    el('lobbyHint').textContent = 'Waiting for at least one more player to join…';
    el('lobbyHint').classList.toggle('hidden', players.length >= 2);
  } else {
    el('lobbyHint').textContent = 'Waiting for the host to start the game…';
    el('lobbyHint').classList.remove('hidden');
  }
  el('playerList').innerHTML = players
    .map((p) => `<li>${p.name === myName ? `${p.name} (You)` : p.name}</li>`)
    .join('');

  if (mashupMode && amHost() && players.length >= 2 && !mashupAutoStarted) {
    mashupAutoStarted = true;
    socket.emit('gofish:host:start', { code: roomCode, rounds: 1 });
  }
}

el('startBtn').addEventListener('click', () => {
  if (!amHost() || !roomCode) return;
  totalRounds = 1;
  socket.emit('gofish:host:start', { code: roomCode, rounds: 1 });
});

socket.on('gofish:room:cancelled', () => {
  resetRoomState();
  lobby.classList.add('hidden');
  gameArea.classList.add('hidden');
  gameOver.classList.add('hidden');
  setup.classList.remove('hidden');
});

function updateDuelHud(state = null) {
  if (state) {
    const mine = currentPlayerName();
    const opponentName = state.opponent ? state.opponent.name : 'Opponent';
    el('hudP1Name').textContent = mine;
    el('hudP1Score').textContent = (state.myBooks || []).length;
    el('hudP2Name').textContent = opponentName;
    el('hudP2Score').textContent = state.opponent ? (state.opponent.books || []).length : 0;
    return;
  }

  if (!players[0]) return;
  el('hudP1Name').textContent = players[0].name;
  el('hudP1Score').textContent = players[0].score || 0;
  if (players[1]) {
    el('hudP2Name').textContent = players[1].name;
    el('hudP2Score').textContent = players[1].score || 0;
  }
}

// --- Head-to-Head round lifecycle (server-driven) -------------------------

socket.on('gofish:round:start', (data) => {
  if (mode !== 'duo') return;
  selectedRank = null;
  pendingGameState = null;
  pendingRoundResult = null;
  pendingGameOver = null;
  pendingFinalRoundIntro = null;
  activeFinalOrder = [];
  renderFinalOrder([], 0);
  lastTurnFocus = null;
  actionQueue.length = 0;
  actionAnimating = false;
  askPending = false;
  roundNumber = 1;
  totalRounds = 1;
  if (Array.isArray(data.players)) players = data.players;
  el('roundNum').textContent = '1';
  el('totalRounds').textContent = '1';
  setGamePhase(GF_PHASES.SETUP);
  el('eventBanner').textContent = '';

  setupWrap.classList.add('hidden');
  lobby.classList.add('hidden');
  gameOver.classList.add('hidden');
  el('finalRecordStrip').classList.add('hidden');
  gameArea.classList.remove('hidden');
  updateDuelHud();
});

socket.on('gofish:state', (data) => {
  if (mode !== 'duo') return;
  if (actionAnimating || askPending) {
    pendingGameState = data;
    return;
  }
  applyGameState(data);
});

socket.on('gofish:action', (data) => {
  if (mode !== 'duo') return;
  queueTurnAction(data);
});

socket.on('gofish:final-round', (data) => {
  if (mode !== 'duo') return;
  pendingFinalRoundIntro = data || {};
  if (!actionAnimating && !askPending && !actionQueue.length) {
    presentPendingFinalRoundIntro();
  }
});

socket.on('gofish:feed', (data) => {
  if (!actionAnimating) showEventBanner(data.text);
});

function finalReasonText(reason) {
  return {
    books: 'Most completed books',
    'hand-count': 'Tiebreak: more cards left in hand',
    'last-book': 'Tiebreak: most recent book',
    cards: 'Tiebreak: more cards left in hand',
    'recent-book': 'Tiebreak: most recent book',
    draw: 'Still level after every tiebreak',
  }[reason] || '';
}

function handleDuoGameOver(data) {
  if (mashupMode) {
    const legPlayers = (data.players || []).map((player) => ({
      ...player,
      score: data.winnerName ? (player.name === data.winnerName ? 1 : 0) : 0,
    }));
    reportMashupLegResult(socket, legPlayers);
    return;
  }
  if (mode !== 'duo') return;

  setGamePhase(GF_PHASES.GAME_OVER);
  gameArea.classList.add('hidden');
  gameOver.classList.remove('hidden');
  el('playAgainBtn').classList.toggle('hidden', !amHost());
  el('finalBoard').classList.add('hidden');

  const publicPlayers = Array.isArray(data.players) ? data.players : [];
  const revealed = Array.isArray(data.hands) ? data.hands : [];
  const minePublic = publicPlayers.find((player) => player.name === myName) || publicPlayers[0] || null;
  const opponentPublic = publicPlayers.find((player) => !minePublic || player.name !== minePublic.name) || publicPlayers[1] || null;
  const mineReveal = revealed.find((entry) => entry.name === myName) || revealed[0] || { name: myName, hand: [], books: [] };
  const opponentReveal = revealed.find((entry) => entry.name !== mineReveal.name) || revealed[1] || { name: opponentPublic ? opponentPublic.name : 'Opponent', hand: [], books: [] };

  if (!data.winnerName) {
    el('overTitle').textContent = 'DRAW';
  } else if (data.winnerName === myName) {
    el('overTitle').textContent = 'YOU WIN';
    hapticSuccess();
    playSuccess();
  } else {
    el('overTitle').textContent = 'YOU LOSE';
  }
  el('soloSummary').textContent = finalReasonText(data.reason);

  const myBookCount = (mineReveal.books || []).length;
  const opponentBookCount = (opponentReveal.books || []).length;
  const opponentName = opponentPublic ? opponentPublic.name : (opponentReveal.name || 'Opponent');

  el('finalScore').classList.remove('hidden');
  el('finalScore').innerHTML = `
    <div class="gf-final-score-side"><strong>${myBookCount}</strong><span>You · books</span></div>
    <div class="gf-final-score-vs">vs</div>
    <div class="gf-final-score-side"><strong>${opponentBookCount}</strong><span>${escapeResultText(opponentName)} · books</span></div>`;

  el('finalBooks').classList.remove('hidden');
  el('finalBooks').innerHTML = `
    <div class="gf-final-section-title">Completed books</div>
    <div class="gf-result-row"><span class="gf-result-row-name">You</span><div class="gf-result-mini-cards">${resultBooksMarkup(mineReveal.books || [])}</div></div>
    <div class="gf-result-row"><span class="gf-result-row-name">${escapeResultText(opponentName)}</span><div class="gf-result-mini-cards">${resultBooksMarkup(opponentReveal.books || [])}</div></div>`;

  el('finalHands').classList.remove('hidden');
  el('finalHands').innerHTML = `
    <div class="gf-final-section-title">Cards left in hand</div>
    <div class="gf-result-row"><span class="gf-result-row-name">You</span><div class="gf-result-mini-cards">${resultHandMarkup(mineReveal.hand || [])}</div></div>
    <div class="gf-result-row"><span class="gf-result-row-name">${escapeResultText(opponentName)}</span><div class="gf-result-mini-cards">${resultHandMarkup(opponentReveal.hand || [])}</div></div>`;

  const duoRecord = updateDuoRecord(data.winnerName || null);
  el('finalRecordStrip').classList.remove('hidden');
  el('finalRecordStrip').innerHTML = duoRecordText(duoRecord);

  const myStats = minePublic && minePublic.stats ? minePublic.stats : {};
  el('finalStats').classList.remove('hidden');
  el('finalStats').innerHTML = `
    <div class="gf-stat"><strong>${myStats.luckyCatches || 0}</strong><span>Lucky catches</span></div>
    <div class="gf-stat"><strong>${myStats.successfulAsks || 0}</strong><span>Successful asks</span></div>
    <div class="gf-stat"><strong>${myStats.longestTurnStreak || 0}</strong><span>Longest streak</span></div>`;
}

socket.on('gofish:game:over', (data) => {
  if (actionAnimating || askPending || actionQueue.length) {
    pendingGameOver = data;
    return;
  }
  handleDuoGameOver(data);
});

el('playAgainBtn').addEventListener('click', () => {
  if (mode === 'solo') {
    gameOver.classList.add('hidden');
    startSoloGame();
    return;
  }
  if (!amHost() || !roomCode) return;
  gameOver.classList.add('hidden');
  socket.emit('gofish:host:start', { code: roomCode, rounds: 1 });
});

// --- Solo vs CPU (authoritative local state machine) ----------------------

let soloName = 'You';
let soloHands = { me: [], cpu: [] };
let soloBooks = { me: [], cpu: [] };
let soloPond = [];
let soloTurn = 'me';
let soloGameActive = false;
let soloClosing = false;
let soloFinal = { active: false, order: [], index: 0 };
let soloLastBookOwner = null;
let soloCpuMemory = new Map();
let soloMemoryClock = 0;
let soloStats = null;
let lastCpuDecision = null;

function freshSoloStats() {
  return {
    me: { successfulAsks: 0, luckyCatches: 0, booksCompleted: 0, currentStreak: 0, longestTurnStreak: 0 },
    cpu: { successfulAsks: 0, luckyCatches: 0, booksCompleted: 0, currentStreak: 0, longestTurnStreak: 0 },
  };
}

function syncSoloHud() {
  players = [
    { name: soloName, score: soloBooks.me.length },
    { name: 'CPU', score: soloBooks.cpu.length },
  ];
  updateDuelHud();
}

function rememberHumanRank(rank, confidence = 3) {
  soloMemoryClock += 1;
  const existing = soloCpuMemory.get(rank);
  soloCpuMemory.set(rank, {
    confidence: Math.max(confidence, existing ? existing.confidence : 0),
    seenAt: soloMemoryClock,
  });
}

function forgetHumanRank(rank) {
  soloCpuMemory.delete(rank);
}

function decayCpuMemory() {
  for (const [rank, info] of soloCpuMemory) {
    const next = info.confidence * 0.92;
    if (next < 0.55) soloCpuMemory.delete(rank);
    else soloCpuMemory.set(rank, { ...info, confidence: next });
  }
}

function noteSoloAsk(who) {
  soloStats[who].currentStreak += 1;
  soloStats[who].longestTurnStreak = Math.max(
    soloStats[who].longestTurnStreak,
    soloStats[who].currentStreak
  );
}

function endSoloTurnStreak(who) {
  soloStats[who].currentStreak = 0;
}

function soloCheckBooks(who, { recordRecent = true } = {}) {
  const completed = [];
  const counts = new Map();
  for (const card of soloHands[who]) counts.set(card.rank, (counts.get(card.rank) || 0) + 1);

  for (const [rank, count] of counts) {
    if (count < 4) continue;
    soloHands[who] = soloHands[who].filter((card) => card.rank !== rank);
    soloBooks[who].push(rank);
    soloStats[who].booksCompleted += 1;
    completed.push(rank);

    // A completed human book is public information and removes that rank
    // from play, so CPU memory for it is no longer useful.
    if (who === 'me') forgetHumanRank(rank);
    if (recordRecent) soloLastBookOwner = who;
  }

  if (completed.length) syncSoloHud();
  return completed;
}

function soloTotalBooks() {
  return soloBooks.me.length + soloBooks.cpu.length;
}

function getSoloStateSnapshot() {
  return {
    myHand: soloHands.me.slice(),
    myBooks: soloBooks.me.slice(),
    opponent: {
      name: 'CPU',
      handCount: soloHands.cpu.length,
      books: soloBooks.cpu.slice(),
    },
    pondCount: soloPond.length,
    isMyTurn: soloGameActive && soloTurn === 'me',
    turnName: soloTurn === 'me' ? soloName : 'CPU',
    askableRanks: [...new Set(soloHands.me.map((card) => card.rank))],
    actionLocked: actionAnimating || askPending ||
      ![GF_PHASES.PLAYER_SELECTING, GF_PHASES.CLOSING_PLAYER, GF_PHASES.FINAL_ROUND_PLAYER].includes(gamePhase),
    phase: gamePhase,
    gamePhase: soloFinal.active
      ? 'FINAL_ROUND'
      : soloClosing
        ? 'CLOSING'
        : 'NORMAL',
    closingPhase: soloClosing,
    finalRound: soloFinal.active,
  };
}

function soloRenderState() {
  applyGameState(getSoloStateSnapshot());
}

el('soloStartBtn').addEventListener('click', () => {
  soloName = el('soloNameInput').value.trim() || 'You';
  startSoloGame();
});

function startSoloGame() {
  mode = 'solo';
  startTutorialIfNeeded();
  lastCpuDecision = null;
  lastTurnFocus = null;
  activeFinalOrder = [];
  renderFinalOrder([], 0);
  clearTimeout(cpuBubbleTimer);
  el('cpuBubble').classList.add('hidden');
  actionQueue.length = 0;
  actionAnimating = false;
  askPending = false;
  pendingGameState = null;
  pendingRoundResult = null;
  pendingFinalRoundIntro = null;
  lastGameState = null;
  selectedRank = null;

  totalRounds = 1;
  roundNumber = 1;
  el('roundNum').textContent = '1';
  el('totalRounds').textContent = '1';
  el('eventBanner').textContent = '';

  const deck = shuffle(buildDeck());
  soloHands = { me: deck.splice(0, 7), cpu: deck.splice(0, 7) };
  soloBooks = { me: [], cpu: [] };
  soloPond = deck;
  soloTurn = Math.random() < 0.5 ? 'me' : 'cpu';
  soloGameActive = true;
  soloClosing = false;
  soloFinal = { active: false, order: [], index: 0 };
  soloLastBookOwner = null;
  soloCpuMemory = new Map();
  soloMemoryClock = 0;
  soloStats = freshSoloStats();

  // Setup books are automatic. They count, but because setup is simultaneous
  // they do not decide the "most recent book" tiebreak.
  soloCheckBooks('me', { recordRecent: false });
  soloCheckBooks('cpu', { recordRecent: false });
  syncSoloHud();

  setupWrap.classList.add('hidden');
  lobby.classList.add('hidden');
  gameOver.classList.add('hidden');
  gameArea.classList.remove('hidden');
  el('finalRoundOverlay').classList.add('hidden');
  el('hudP2').classList.remove('hidden');
  el('finalBoard').classList.add('hidden');

  soloBeginTurn();
  showEventBanner(soloTurn === 'me' ? 'You start' : 'CPU starts');
}

function chooseCpuRank() {
  // Deliberately only reads CPU cards + public memory. It never inspects
  // soloHands.me, so the CPU cannot cheat.
  decayCpuMemory();
  soloMemoryClock += 1;

  const counts = new Map();
  for (const card of soloHands.cpu) counts.set(card.rank, (counts.get(card.rank) || 0) + 1);
  const options = [...counts.entries()];
  if (!options.length) return null;

  const weighted = options.map(([rank, count]) => {
    const memory = soloCpuMemory.get(rank);
    const age = memory ? Math.max(0, soloMemoryClock - memory.seenAt) : 0;
    const recency = memory ? Math.max(.36, 1 - age * .10) : 0;
    const memoryScore = memory ? memory.confidence * recency : 0;

    let weight = 1 + count * 3;
    if (count >= 2) weight += 2.5;
    if (count >= 3) weight += 4.5;
    if (memory) weight += memoryScore * 7.5;
    weight += Math.random() * 2.4;

    return {
      rank,
      count,
      memoryScore,
      weight,
      reason: memoryScore >= 2.2 ? 'memory' : count >= 2 ? 'cluster' : 'probe',
    };
  });

  const total = weighted.reduce((sum, item) => sum + item.weight, 0);
  let roll = Math.random() * total;
  for (const item of weighted) {
    roll -= item.weight;
    if (roll <= 0) return item;
  }
  return weighted[weighted.length - 1];
}

async function soloBeginTurn() {
  if (!soloGameActive || soloFinal.active || actionAnimating) return;

  const hand = soloHands[soloTurn];
  if (hand.length === 0) {
    if (soloPond.length > 0) {
      await soloReplenish(soloTurn);
      return;
    }
    await soloEnterFinalRound(soloTurn);
    return;
  }

  selectedRank = null;
  if (soloTurn === 'me') {
    setGamePhase(soloClosing ? GF_PHASES.CLOSING_PLAYER : GF_PHASES.PLAYER_SELECTING);
    soloRenderState();
  } else {
    setGamePhase(soloClosing ? GF_PHASES.CLOSING_CPU : GF_PHASES.CPU_THINKING);
    soloRenderState();
    const delay = soloClosing
      ? CPU_PACING.finalThinkMin + Math.floor(Math.random() * CPU_PACING.finalThinkJitter)
      : CPU_PACING.thinkMin + Math.floor(Math.random() * CPU_PACING.thinkJitter);
    setTimeout(runCpuTurn, delay);
  }
}

async function soloReplenish(who) {
  if (!soloGameActive || soloFinal.active || actionAnimating || soloPond.length === 0) return;
  actionAnimating = true;
  askPending = false;

  const wasClosing = soloClosing;
  const drawn = soloPond.pop();
  soloHands[who].push(drawn);
  const books = soloCheckBooks(who);
  const emptiedPond = soloPond.length === 0;
  const startsClosing = !wasClosing && soloPond.length > 0 && soloPond.length <= 5;
  const action = {
    kind: 'replenish',
    askerName: who === 'me' ? soloName : 'CPU',
    opponentName: who === 'me' ? 'CPU' : soloName,
    drawnCard: who === 'me' ? drawn : null,
    books,
    pondEmpty: false,
    emptiedPond,
    closingPhase: wasClosing,
    closingPhaseStarts: startsClosing,
    keepsTurn: true,
  };

  try {
    await playTurnAction(action);
    await applyPendingAfterAction(action);
  } finally {
    actionAnimating = false;
    askPending = false;
    gameArea.classList.remove('gf-resolving');
  }

  if (emptiedPond) {
    await soloEnterFinalRound(who);
    return;
  }
  if (startsClosing) {
    soloClosing = true;
    pendingClosingRoundIntro = { starterName: who === 'me' ? soloName : 'CPU', pondCount: soloPond.length };
    soloRenderState();
    await showClosingRoundIntro(pendingClosingRoundIntro);
    pendingClosingRoundIntro = null;
  }
  await soloBeginTurn();
}

function soloAsk(rank) {
  if (
    actionAnimating ||
    askPending ||
    !soloGameActive ||
    soloTurn !== 'me' ||
    !humanSelectionPhase() ||
    !soloHands.me.some((card) => card.rank === rank)
  ) return;

  lockVisibleHand();
  setGamePhase(GF_PHASES.PLAYER_ASKING);
  showEventBanner(`You ask CPU for ${rankPlural(rank)}…`, { persist: true });
  soloResolveAsk('me', 'cpu', rank, soloName, 'CPU');
}

function runCpuTurn() {
  if (
    actionAnimating ||
    !soloGameActive ||
    soloTurn !== 'cpu' ||
    ![GF_PHASES.CPU_THINKING, GF_PHASES.CLOSING_CPU, GF_PHASES.FINAL_ROUND_CPU].includes(gamePhase)
  ) return;

  const decision = chooseCpuRank();
  if (!decision) {
    if (soloFinal.active) soloSkipFinalTurn('cpu');
    else soloBeginTurn();
    return;
  }

  lastCpuDecision = decision;
  if (decision.reason === 'memory') {
    showCpuBubble(
      cpuLine([`I remember ${rankPlural(decision.rank)}.`, `You showed me ${rankPlural(decision.rank)} earlier.`, `I haven't forgotten ${rankPlural(decision.rank)}.`]),
      { memory: true, duration: 1150 }
    );
  } else if (decision.reason === 'cluster' && Math.random() < .72) {
    showCpuBubble(cpuLine(['This feels promising.', 'Worth asking.', 'I like this one.']), { duration: 900 });
  } else if (Math.random() < .34) {
    showCpuBubble(cpuLine(['Let’s see.', 'Hmm.', 'Worth a try.']), { duration: 760 });
  }

  setGamePhase(GF_PHASES.CPU_ASKING);
  setTimeout(() => {
    if (!soloGameActive || soloTurn !== 'cpu') return;
    soloResolveAsk('cpu', 'me', decision.rank, 'CPU', soloName);
  }, decision.reason === 'memory' ? CPU_PACING.preAskMemory : CPU_PACING.preAsk);
}

async function soloResolveAsk(askerKey, targetKey, rank, askerName, targetName) {
  if (actionAnimating || !soloGameActive) return;
  const finalRound = soloFinal.active;
  if (finalRound) {
    const expected = soloFinal.order[soloFinal.index];
    if (expected !== askerKey) return;
  }

  actionAnimating = true;
  noteSoloAsk(askerKey);

  // A human asking for a rank publicly proves they hold that rank right now.
  if (askerKey === 'me') rememberHumanRank(rank, 3.5);

  const asker = soloHands[askerKey];
  const target = soloHands[targetKey];
  const matches = target.filter((card) => card.rank === rank);
  let action;
  let nextNormalTurn = targetKey;
  let emptiedPond = false;

  if (matches.length > 0) {
    soloHands[targetKey] = target.filter((card) => card.rank !== rank);
    soloHands[askerKey] = asker.concat(matches);
    soloStats[askerKey].successfulAsks += 1;

    // These are public transfers, so CPU memory can update without cheating.
    if (askerKey === 'me') rememberHumanRank(rank, 5);
    else forgetHumanRank(rank);

    const books = soloCheckBooks(askerKey);
    action = {
      kind: 'take',
      askerName,
      opponentName: targetName,
      rank,
      count: matches.length,
      cards: matches.map((card) => ({ rank: card.rank, suit: card.suit })),
      books,
      keepsTurn: !finalRound,
      finalRound,
    };
    nextNormalTurn = askerKey;
  } else if (finalRound) {
    if (askerKey === 'cpu') forgetHumanRank(rank);
    action = {
      kind: 'final-miss',
      askerName,
      opponentName: targetName,
      rank,
      count: 0,
      books: [],
      keepsTurn: false,
      finalRound: true,
      pondEmpty: true,
    };
  } else {
    let drawn = null;
    if (soloPond.length > 0) {
      drawn = soloPond.pop();
      soloHands[askerKey].push(drawn);
    }

    const books = soloCheckBooks(askerKey);
    const matched = !!drawn && drawn.rank === rank;
    if (matched) {
      soloStats[askerKey].luckyCatches += 1;
      if (askerKey === 'me' && !books.includes(rank)) rememberHumanRank(rank, 5);
    }
    if (askerKey === 'cpu' && !matches.length) forgetHumanRank(rank);

    nextNormalTurn = matched ? askerKey : targetKey;
    emptiedPond = !!drawn && soloPond.length === 0;
    action = {
      kind: 'fish',
      askerName,
      opponentName: targetName,
      rank,
      matched,
      pondEmpty: !drawn,
      emptiedPond,
      drawnCard: askerKey === 'me' ? drawn : null,
      books,
      keepsTurn: matched,
      finalRound: false,
    };
  }

  // State may already know who would normally act next, but the UI keeps the
  // visible turn frozen until the physical action has completed.
  if (!finalRound) soloTurn = nextNormalTurn;

  try {
    await playTurnAction(action);
    await applyPendingAfterAction(action);
  } finally {
    actionAnimating = false;
    askPending = false;
    gameArea.classList.remove('gf-resolving');
  }

  if (finalRound) {
    endSoloTurnStreak(askerKey);
    soloFinal.index += 1;
    await wait(260);
    await soloBeginFinalTurn();
    return;
  }

  if (!action.keepsTurn) endSoloTurnStreak(askerKey);

  if (emptiedPond) {
    // Per the final rules, the player who would normally act next gets the
    // first Final Round ask. The move that emptied the pond is already done.
    await soloEnterFinalRound(nextNormalTurn);
    return;
  }

  if (soloTotalBooks() >= RANKS.length) {
    // All 52 cards are already in books. There are no legal final asks to
    // make, so the final-round skipper will close the game cleanly.
    await soloEnterFinalRound(nextNormalTurn);
    return;
  }

  await soloBeginTurn();
}

async function soloEnterFinalRound(starterKey) {
  if (!soloGameActive || soloFinal.active) return;
  soloFinal = {
    active: true,
    order: [starterKey, starterKey === 'me' ? 'cpu' : 'me'],
    index: 0,
  };
  selectedRank = null;
  pendingFinalRoundIntro = { starter: starterKey, order: soloFinal.order.slice() };
  soloRenderState();
  await showFinalRoundIntro(pendingFinalRoundIntro);
  pendingFinalRoundIntro = null;
  await soloBeginFinalTurn();
}

async function soloSkipFinalTurn(who) {
  if (!soloFinal.active || soloFinal.order[soloFinal.index] !== who) return;
  soloTurn = who;
  setGamePhase(who === 'me' ? GF_PHASES.FINAL_ROUND_PLAYER : GF_PHASES.FINAL_ROUND_CPU);
  soloRenderState();
  showEventBanner(who === 'me' ? 'No cards — your final ask is skipped' : 'CPU has no cards — final ask skipped');
  await wait(950);
  soloFinal.index += 1;
  renderFinalOrder(soloFinal.order, soloFinal.index);
  await soloBeginFinalTurn();
}

async function soloBeginFinalTurn() {
  if (!soloGameActive || !soloFinal.active || actionAnimating) return;
  if (soloFinal.index >= soloFinal.order.length) {
    soloFinishGame();
    return;
  }

  const who = soloFinal.order[soloFinal.index];
  soloTurn = who;
  selectedRank = null;
  renderFinalOrder(soloFinal.order, soloFinal.index);

  if (soloHands[who].length === 0) {
    await soloSkipFinalTurn(who);
    return;
  }

  if (who === 'me') {
    setGamePhase(GF_PHASES.FINAL_ROUND_PLAYER);
    soloRenderState();
    showEventBanner('Your final ask — choose carefully');
  } else {
    setGamePhase(GF_PHASES.FINAL_ROUND_CPU);
    soloRenderState();
    showEventBanner('CPU has one final ask');
    const delay = CPU_PACING.finalThinkMin + Math.floor(Math.random() * CPU_PACING.finalThinkJitter);
    setTimeout(runCpuTurn, delay);
  }
}

function soloDetermineWinner() {
  const myBooks = soloBooks.me.length;
  const cpuBooks = soloBooks.cpu.length;
  if (myBooks !== cpuBooks) {
    return { winner: myBooks > cpuBooks ? 'me' : 'cpu', reason: 'books' };
  }

  if (soloHands.me.length !== soloHands.cpu.length) {
    return { winner: soloHands.me.length > soloHands.cpu.length ? 'me' : 'cpu', reason: 'cards' };
  }

  if (soloLastBookOwner) {
    return { winner: soloLastBookOwner, reason: 'recent-book' };
  }

  return { winner: null, reason: 'draw' };
}

function escapeResultText(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function resultBooksMarkup(books) {
  if (!books.length) return '<span class="gf-player-meta">None</span>';
  return books
    .slice()
    .sort((a, b) => RANKS.indexOf(a) - RANKS.indexOf(b))
    .map((rank) => `<span class="gf-mini-book">${rank}</span>`)
    .join('');
}

function resultHandMarkup(hand) {
  if (!hand.length) return '<span class="gf-player-meta">No cards left</span>';
  return sortHand(hand).map((card) => {
    const red = RED_SUITS.has(card.suit) ? ' red' : '';
    return `<span class="gf-mini-card${red}">${card.rank}${card.suit}</span>`;
  }).join('');
}

function soloFinishGame() {
  if (!soloGameActive) return;
  soloGameActive = false;
  setGamePhase(GF_PHASES.GAME_OVER);
  syncSoloHud();

  const result = soloDetermineWinner();
  const record = updateSoloRecord(result);
  renderSetupRecord();
  gameArea.classList.add('hidden');
  gameOver.classList.remove('hidden');
  el('playAgainBtn').classList.remove('hidden');
  el('finalBoard').classList.add('hidden');

  if (result.winner === 'me') {
    el('overTitle').textContent = 'YOU WIN';
    hapticSuccess();
    playSuccess();
  } else if (result.winner === 'cpu') {
    el('overTitle').textContent = 'YOU LOSE';
  } else {
    el('overTitle').textContent = 'DRAW';
  }

  const reasonText = {
    books: 'Most completed books',
    cards: 'Tiebreak: more cards left in hand',
    'recent-book': 'Tiebreak: most recent book',
    draw: 'Still level after every tiebreak',
  }[result.reason];
  el('soloSummary').textContent = reasonText;

  el('finalScore').classList.remove('hidden');
  el('finalScore').innerHTML = `
    <div class="gf-final-score-side"><strong>${soloBooks.me.length}</strong><span>You · books</span></div>
    <div class="gf-final-score-vs">vs</div>
    <div class="gf-final-score-side"><strong>${soloBooks.cpu.length}</strong><span>CPU · books</span></div>`;

  el('finalBooks').classList.remove('hidden');
  el('finalBooks').innerHTML = `
    <div class="gf-final-section-title">Completed books</div>
    <div class="gf-result-row"><span class="gf-result-row-name">You</span><div class="gf-result-mini-cards">${resultBooksMarkup(soloBooks.me)}</div></div>
    <div class="gf-result-row"><span class="gf-result-row-name">CPU</span><div class="gf-result-mini-cards">${resultBooksMarkup(soloBooks.cpu)}</div></div>`;

  el('finalHands').classList.remove('hidden');
  el('finalHands').innerHTML = `
    <div class="gf-final-section-title">Cards left in hand</div>
    <div class="gf-result-row"><span class="gf-result-row-name">You</span><div class="gf-result-mini-cards">${resultHandMarkup(soloHands.me)}</div></div>
    <div class="gf-result-row"><span class="gf-result-row-name">CPU</span><div class="gf-result-mini-cards">${resultHandMarkup(soloHands.cpu)}</div></div>`;

  el('finalStats').classList.remove('hidden');
  el('finalStats').innerHTML = `
    <div class="gf-stat"><strong>${soloStats.me.luckyCatches}</strong><span>Lucky catches</span></div>
    <div class="gf-stat"><strong>${soloStats.me.successfulAsks}</strong><span>Successful asks</span></div>
    <div class="gf-stat"><strong>${soloStats.me.longestTurnStreak}</strong><span>Longest streak</span></div>`;

  el('finalRecordStrip').classList.remove('hidden');
  el('finalRecordStrip').innerHTML = soloRecordText(record);
}

// --- Party Mashup: auto-join and auto-start a single-round leg ------------
(function initMashup() {
  const mp = mashupParams();
  if (!mp) return;
  mashupMode = true;
  rewireMashupQuitLink();
  quickPlayJoin(mp.name);
})();

window.addEventListener('resize', () => {
  if (!gameArea.classList.contains('hidden') && lastGameState && !actionAnimating) {
    applyGameState(lastGameState);
    scheduleHandHitLayer(lastGameState.askableRanks || []);
  }
});
