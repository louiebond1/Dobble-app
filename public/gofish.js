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
let actionAnimating = false;
let askPending = false;
const actionQueue = [];

const TURN_TIMING = {
  anticipation: 430,
  settle: 280,
  book: 760,
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
  FINAL_ROUND_INTRO: 'FINAL_ROUND_INTRO',
  FINAL_ROUND_PLAYER: 'FINAL_ROUND_PLAYER',
  FINAL_ROUND_CPU: 'FINAL_ROUND_CPU',
  GAME_OVER: 'GAME_OVER',
});

let gamePhase = GF_PHASES.SETUP;
let pendingFinalRoundIntro = null;

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
    [GF_PHASES.CPU_THINKING]: 'CPU thinking…',
    [GF_PHASES.CPU_ASKING]: 'CPU asking…',
    [GF_PHASES.FINAL_ROUND_INTRO]: 'Final Round',
    [GF_PHASES.FINAL_ROUND_PLAYER]: 'Final Round · Your ask',
    [GF_PHASES.FINAL_ROUND_CPU]: 'Final Round · CPU ask',
    [GF_PHASES.GAME_OVER]: 'Game over',
  };
  label.textContent = labels[phase] || 'Go Fish';
}

function humanSelectionPhase() {
  return gamePhase === GF_PHASES.PLAYER_SELECTING || gamePhase === GF_PHASES.FINAL_ROUND_PLAYER;
}

async function showFinalRoundIntro() {
  setGamePhase(GF_PHASES.FINAL_ROUND_INTRO);
  gameArea.classList.add('gf-resolving');
  const overlay = el('finalRoundOverlay');
  overlay.classList.remove('hidden');
  hapticSuccess();
  await wait(1550);
  overlay.classList.add('hidden');
  gameArea.classList.remove('gf-resolving');
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

function cardEl(card, { interactive = false } = {}) {
  const node = document.createElement(interactive ? 'button' : 'div');
  node.className = 'gf-card' + (RED_SUITS.has(card.suit) ? ' red' : '');
  node.dataset.rank = card.rank;
  node.dataset.suit = card.suit;
  node.dataset.cardKey = cardKey(card);
  node.innerHTML = cardFaceMarkup(card);
  if (interactive) {
    node.type = 'button';
    node.setAttribute('aria-label', `Select ${rankPlural(card.rank)}`);
    node.addEventListener('click', () => selectRank(card.rank));
  }
  return node;
}

function renderMyHand(hand, { interactive = false, askableRanks = [] } = {}) {
  const container = el('myHand');
  container.innerHTML = '';
  const sorted = sortHand(hand);
  setHandOverlap(container, sorted.length, false);
  sorted.forEach((card, i) => {
    // The visible card is a real tap target. The rank chips below are a
    // second way to select, not a displaced substitute for the card.
    const canSelect = interactive && askableRanks.includes(card.rank);
    const node = cardEl(card, { interactive: canSelect });
    const isSelected = selectedRank === card.rank;
    node.style.transform = fanTransform(i, sorted.length, false) + (isSelected ? ' translateY(-10px)' : '');
    node.style.zIndex = String(i + 1 + (isSelected ? 30 : 0));
    node.classList.toggle('selected', isSelected);
    if (!canSelect) node.classList.add('is-disabled');
    container.appendChild(node);
  });
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
  const enabled = data.isMyTurn && !data.actionLocked && !actionAnimating && !askPending &&
    (mode !== 'solo' || humanSelectionPhase());

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
  const canAct = data.isMyTurn && !data.actionLocked && !actionAnimating && !askPending &&
    (mode !== 'solo' || humanSelectionPhase());
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
    askButton.disabled = !canAct;
    askButton.textContent = `Ask ${opponentName} for ${rankPlural(selectedRank)}`;
    hint.textContent = `Your ${rankPlural(selectedRank)} are highlighted. Nothing happens until you ask.`;
  } else {
    askButton.disabled = true;
    askButton.textContent = 'Choose a rank';
    hint.textContent = 'Pick any rank you already hold.';
  }

  const handCards = Array.from(document.querySelectorAll('#myHand .gf-card'));
  handCards.forEach((card, index) => {
    const on = !!selectedRank && card.dataset.rank === selectedRank;
    card.classList.toggle('selected', on);
    card.style.transform = fanTransform(index, handCards.length, false) + (on ? ' translateY(-10px)' : '');
    card.style.zIndex = String(index + 1 + (on ? 30 : 0));
  });
  document.querySelectorAll('#rankChoices .gf-rank-chip').forEach((button) => {
    const on = button.textContent === selectedRank;
    button.classList.toggle('selected', on);
    button.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
}

function selectRank(rank) {
  if (!lastGameState || !lastGameState.isMyTurn || lastGameState.actionLocked || actionAnimating || askPending) return;
  if (mode === 'solo' && !humanSelectionPhase()) return;
  if (!(lastGameState.askableRanks || []).includes(rank)) return;
  selectedRank = selectedRank === rank ? null : rank;
  updateAskControls(lastGameState);
}

function applyGameState(data, { freezeTurn = false } = {}) {
  lastGameState = data;
  const interactive = data.isMyTurn && !data.actionLocked && !actionAnimating && !askPending;
  if (!data.isMyTurn || !(data.askableRanks || []).includes(selectedRank)) selectedRank = null;

  renderMyHand(data.myHand, { interactive, askableRanks: data.askableRanks || [] });
  renderBooks('myBooks', data.myBooks || []);
  if (data.opponent) {
    renderOpponentBacks(data.opponent.handCount);
    renderBooks('opponentBooks', data.opponent.books || []);
  }
  el('pondCount').textContent = data.pondCount;
  updateIdentity(data);
  if (!freezeTurn) updateTurnPill(data.isMyTurn, data.turnName);
  renderRankChoices(data);
  updateAskControls(data);
  gameArea.classList.toggle('gf-resolving', !!data.actionLocked || actionAnimating || askPending);
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
  if (targetNode) targetNode.classList.remove('gf-staging-hidden');
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
  updateTurnPill(nextState.isMyTurn, nextState.turnName);
  renderRankChoices(nextState);
  updateAskControls(nextState);
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
  const targetName = action.opponentName || 'your opponent';
  gameArea.classList.add('gf-resolving');

  if (action.kind === 'replenish') {
    setGamePhase(GF_PHASES.DRAWING);
    showEventBanner(mine ? 'Your hand is empty — draw one' : `${action.askerName} draws back in`, { persist: true });
  } else {
    setGamePhase(mine ? GF_PHASES.PLAYER_ASKING : GF_PHASES.CPU_ASKING);
    showEventBanner(
      mine
        ? `You ask ${targetName} for ${rankPlural(action.rank)}…`
        : `${action.askerName} asks you for ${rankPlural(action.rank)}…`,
      { persist: true }
    );
    await wait(TURN_TIMING.anticipation);

    if (action.kind === 'take') {
      setGamePhase(GF_PHASES.CARD_TRANSFER);
      showEventBanner(
        mine
          ? `${targetName} had ${humanCount(action.count)}`
          : `You hand over ${humanCount(action.count)} ${action.count === 1 ? rankSingular(action.rank) : rankPlural(action.rank)}`,
        { persist: true }
      );
    } else if (action.kind === 'final-miss') {
      showEventBanner(mine ? 'Nothing there' : 'You have none', { persist: true, emphasis: true });
    } else {
      setGamePhase(GF_PHASES.GO_FISH);
      showEventBanner(mine ? 'GO FISH' : `${action.askerName} goes fishing`, { persist: true, emphasis: true });
      await wait(220);
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

  if (action.books && action.books.length) {
    setGamePhase(GF_PHASES.BOOK_COMPLETING);
  }
  await wait(TURN_TIMING.settle);
}

function applyPendingAfterAction(action) {
  const mine = action.askerName === currentPlayerName();

  if (action.books && action.books.length) {
    const who = mine ? 'You' : action.askerName;
    showEventBanner(`${who} completed the book of ${rankPlural(action.books[0])}`, { book: true });
    return;
  }

  if (action.finalRound) {
    if (action.kind === 'take') {
      showEventBanner(mine ? 'Got them — final ask complete' : `${action.askerName} got them`);
    } else {
      showEventBanner(mine ? 'Nothing there — final ask complete' : `${action.askerName} found nothing`);
    }
    return;
  }

  if (action.kind === 'replenish') {
    if (mine && action.drawnCard) {
      showEventBanner(`You draw ${action.drawnCard.rank}${action.drawnCard.suit} — keep playing`);
    } else {
      showEventBanner(`${action.askerName} is back in`);
    }
  } else if (action.kind === 'take') {
    showEventBanner(mine ? 'Got them — your turn again' : `${action.askerName} goes again`);
  } else if (action.matched) {
    showEventBanner('LUCKY CATCH', { emphasis: true });
  } else if (mine && action.drawnCard) {
    showEventBanner(`You drew ${action.drawnCard.rank}${action.drawnCard.suit} — ${action.opponentName}’s turn`);
  } else {
    showEventBanner(`${action.opponentName}’s turn`);
  }
}

async function drainActionQueue() {
  if (actionAnimating || !actionQueue.length) return;
  actionAnimating = true;
  askPending = false;
  const action = actionQueue.shift();
  try {
    await playTurnAction(action);
    applyPendingAfterAction(action);
    if (action.books && action.books.length) await wait(TURN_TIMING.book);
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
    if (pendingRoundResult) {
      const result = pendingRoundResult;
      players = result.players;
      pendingRoundResult = null;
      updateDuelHud();
      showEventBanner(result.winnerName ? `${result.winnerName} took this deal` : 'This deal is a tie');
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

// --- Round-count picker ------------------------------------------------

const ROUND_PRESETS = [3, 5, 7, 10];
(function renderRoundChips() {
  const container = el('roundChips');
  ROUND_PRESETS.forEach((n) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chip';
    btn.dataset.count = n;
    btn.textContent = n;
    if (n === 5) btn.classList.add('active');
    btn.addEventListener('click', () => {
      container.querySelectorAll('.chip').forEach((c) => c.classList.toggle('active', c === btn));
      el('roundsInput').value = n;
    });
    container.appendChild(btn);
  });
})();

// --- Mode toggle ---------------------------------------------------------

document.querySelectorAll('#modeToggle .mode-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    mode = btn.dataset.mode;
    document.querySelectorAll('#modeToggle .mode-btn').forEach((b) => b.classList.toggle('active', b === btn));
    el('soloFields').classList.toggle('hidden', mode !== 'solo');
    el('duoFields').classList.toggle('hidden', mode !== 'duo');
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
  totalRounds = parseInt(el('roundsInput').value, 10) || 5;
  socket.emit('gofish:host:start', { code: roomCode, rounds: totalRounds });
});

socket.on('gofish:room:cancelled', () => {
  resetRoomState();
  lobby.classList.add('hidden');
  gameArea.classList.add('hidden');
  gameOver.classList.add('hidden');
  setup.classList.remove('hidden');
});

function updateDuelHud() {
  if (!players[0]) return;
  el('hudP1Name').textContent = players[0].name;
  el('hudP1Score').textContent = players[0].score;
  if (players[1]) {
    el('hudP2Name').textContent = players[1].name;
    el('hudP2Score').textContent = players[1].score;
  }
}

// --- Head-to-Head round lifecycle (server-driven) -------------------------

socket.on('gofish:round:start', (data) => {
  if (mode !== 'duo') return;
  selectedRank = null;
  pendingGameState = null;
  pendingRoundResult = null;
  actionQueue.length = 0;
  actionAnimating = false;
  askPending = false;
  roundNumber = data.roundNumber;
  totalRounds = data.totalRounds;
  if (Array.isArray(data.players)) players = data.players;
  el('roundNum').textContent = roundNumber;
  el('totalRounds').textContent = totalRounds;
  el('eventBanner').textContent = '';

  setupWrap.classList.add('hidden');
  lobby.classList.add('hidden');
  gameOver.classList.add('hidden');
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

socket.on('gofish:feed', (data) => {
  if (!actionAnimating) showEventBanner(data.text);
});

socket.on('gofish:round:result', (data) => {
  if (mode !== 'duo') return;
  if (actionAnimating || askPending) {
    pendingRoundResult = data;
    return;
  }
  players = data.players;
  updateDuelHud();
});

socket.on('gofish:game:over', (data) => {
  if (mashupMode) return reportMashupLegResult(socket, data.players);
  if (mode !== 'duo') return;
  gameArea.classList.add('hidden');
  gameOver.classList.remove('hidden');
  el('playAgainBtn').classList.toggle('hidden', !amHost());
  el('soloSummary').textContent = '';

  const [p1, p2] = data.players;
  let title;
  if (!p2 || p1.score === p2.score) title = "It's a tie! 🤝";
  else title = `${p1.score > p2.score ? p1.name : p2.name} wins! 🏆`;
  el('overTitle').textContent = title;
  el('finalBoard').classList.remove('hidden');
  renderLeaderboard('finalBoard', [...data.players].sort((a, b) => b.score - a.score));
});

el('playAgainBtn').addEventListener('click', () => {
  if (mode === 'solo') {
    gameOver.classList.add('hidden');
    startSoloGame();
    return;
  }
  if (!amHost() || !roomCode) return;
  gameOver.classList.add('hidden');
  socket.emit('gofish:host:start', { code: roomCode, rounds: totalRounds });
});

// --- Solo vs CPU (local) ---------------------------------------------------

let soloName = 'You';
let soloTotalRounds = 5;
let soloHands = { me: [], cpu: [] };
let soloBooks = { me: [], cpu: [] };
let soloScore = { me: 0, cpu: 0 };
let soloPond = [];
let soloTurn = 'me';
let soloGameActive = false;

function soloCheckBooks(who) {
  const completed = [];
  const hand = soloHands[who];
  const counts = new Map();
  for (const c of hand) counts.set(c.rank, (counts.get(c.rank) || 0) + 1);
  for (const [rank, count] of counts) {
    if (count >= 4) {
      soloHands[who] = soloHands[who].filter((c) => c.rank !== rank);
      soloBooks[who].push(rank);
      completed.push(rank);
    }
  }
  return completed;
}

function soloTotalBooks() {
  return soloBooks.me.length + soloBooks.cpu.length;
}

el('soloStartBtn').addEventListener('click', () => {
  soloName = el('soloNameInput').value.trim() || 'You';
  soloTotalRounds = parseInt(el('roundsInput').value, 10) || 5;
  startSoloGame();
});

function startSoloGame() {
  mode = 'solo';
  actionQueue.length = 0;
  actionAnimating = false;
  askPending = false;
  pendingGameState = null;
  lastGameState = null;
  roundNumber = 0;
  totalRounds = soloTotalRounds;
  soloScore = { me: 0, cpu: 0 };
  players = [{ name: soloName, score: 0 }, { name: 'CPU', score: 0 }];

  setupWrap.classList.add('hidden');
  lobby.classList.add('hidden');
  gameOver.classList.add('hidden');
  gameArea.classList.remove('hidden');
  el('hudP2').classList.remove('hidden');
  updateDuelHud();

  startSoloRound();
}

function startSoloRound() {
  if (roundNumber >= totalRounds) return endSoloGame();
  roundNumber += 1;
  el('roundNum').textContent = roundNumber;
  el('totalRounds').textContent = totalRounds;
  el('eventBanner').textContent = '';

  const deck = shuffle(buildDeck());
  soloHands = { me: deck.splice(0, 7), cpu: deck.splice(0, 7) };
  soloBooks = { me: [], cpu: [] };
  soloPond = deck;
  // Alternate who asks first each deal, same convention as duo mode.
  soloTurn = (roundNumber - 1) % 2 === 0 ? 'me' : 'cpu';
  soloGameActive = true;

  selectedRank = null;
  soloCheckBooks('me');
  soloCheckBooks('cpu');
  soloBeginTurn();
  showEventBanner(`${soloTurn === 'me' ? 'You go' : 'CPU goes'} first`);
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
    askableRanks: [...new Set(soloHands.me.map((c) => c.rank))],
    actionLocked: actionAnimating || askPending,
  };
}

function soloRenderState() {
  applyGameState(getSoloStateSnapshot());
}

function soloBeginTurn() {
  if (!soloGameActive) return;
  const hand = soloHands[soloTurn];
  if (hand.length === 0) {
    if (soloPond.length > 0) {
      hand.push(soloPond.pop());
      soloCheckBooks(soloTurn);
      if (soloTotalBooks() >= RANKS.length) return soloEndDeal();
    } else {
      return soloEndDeal();
    }
  }
  soloRenderState();
  if (soloTurn === 'cpu') setTimeout(runCpuTurn, 900);
}

function soloAsk(rank) {
  if (actionAnimating || askPending || !soloGameActive || soloTurn !== 'me' || !soloHands.me.some((c) => c.rank === rank)) return;
  lockVisibleHand();
  showEventBanner(`You ask CPU for ${rankPlural(rank)}…`, { persist: true });
  soloResolveAsk('me', 'cpu', rank, soloName, 'CPU');
}

function runCpuTurn() {
  if (actionAnimating || !soloGameActive || soloTurn !== 'cpu') return;
  // Prefer the rank it holds the most copies of — a decent, not perfect, heuristic.
  const counts = new Map();
  for (const c of soloHands.cpu) counts.set(c.rank, (counts.get(c.rank) || 0) + 1);
  let bestRank = null;
  let bestCount = 0;
  for (const [rank, count] of counts) {
    if (count > bestCount || (count === bestCount && Math.random() < 0.5)) {
      bestRank = rank;
      bestCount = count;
    }
  }
  if (!bestRank) return soloBeginTurn();
  soloResolveAsk('cpu', 'me', bestRank, 'CPU', soloName);
}

async function soloResolveAsk(askerKey, targetKey, rank, askerName, targetName) {
  if (actionAnimating) return;
  actionAnimating = true;

  const asker = soloHands[askerKey];
  const target = soloHands[targetKey];
  const matches = target.filter((c) => c.rank === rank);
  let action;

  if (matches.length > 0) {
    soloHands[targetKey] = target.filter((c) => c.rank !== rank);
    soloHands[askerKey] = asker.concat(matches);
    const books = soloCheckBooks(askerKey);
    action = {
      kind: 'take',
      askerName,
      opponentName: targetName,
      rank,
      count: matches.length,
      cards: matches.map((card) => ({ rank: card.rank, suit: card.suit })),
      books,
      keepsTurn: true,
    };
  } else {
    let drawn = null;
    if (soloPond.length > 0) {
      drawn = soloPond.pop();
      soloHands[askerKey].push(drawn);
    }
    const books = soloCheckBooks(askerKey);
    const matched = !!drawn && drawn.rank === rank;
    action = {
      kind: 'fish',
      askerName,
      opponentName: targetName,
      rank,
      matched,
      pondEmpty: !drawn,
      drawnCard: askerKey === 'me' ? drawn : null,
      books,
      keepsTurn: matched,
    };
    if (!matched) soloTurn = targetKey;
  }

  try {
    await playTurnAction(action);
    applyPendingAfterAction(action);
    if (action.books.length) await wait(TURN_TIMING.book);
  } finally {
    actionAnimating = false;
    askPending = false;
    gameArea.classList.remove('gf-resolving');
  }

  if (soloTotalBooks() >= RANKS.length) return soloEndDeal();
  soloBeginTurn();
}

function soloEndDeal() {
  soloGameActive = false;
  soloRenderState();

  let winnerName = null;
  if (soloBooks.me.length > soloBooks.cpu.length) { soloScore.me += 1; winnerName = soloName; }
  else if (soloBooks.cpu.length > soloBooks.me.length) { soloScore.cpu += 1; winnerName = 'CPU'; }
  players[0].score = soloScore.me;
  players[1].score = soloScore.cpu;
  updateDuelHud();

  showEventBanner(winnerName ? `${winnerName} took this deal` : 'This deal is a tie');
  if (winnerName === soloName) { hapticSuccess(); playSuccess(); }

  setTimeout(startSoloRound, 3200);
}

function soloBestKey(name) {
  return `gofish-solo-best-${name.trim().toLowerCase()}-${totalRounds}`;
}

function endSoloGame() {
  gameArea.classList.add('hidden');
  gameOver.classList.remove('hidden');
  el('playAgainBtn').classList.remove('hidden');
  el('finalBoard').classList.remove('hidden');
  renderLeaderboard('finalBoard', [...players].sort((a, b) => b.score - a.score));

  const wins = soloScore.me;
  el('overTitle').textContent = wins > soloScore.cpu ? '🏆 You beat the CPU!' : wins === soloScore.cpu ? "🤝 Tied with the CPU!" : '🤖 The CPU got you this time.';

  const key = soloBestKey(soloName);
  let bestEver = null;
  try {
    bestEver = JSON.parse(localStorage.getItem(key) || 'null');
  } catch (e) {
    bestEver = null;
  }
  const improved = !bestEver || wins > bestEver.wins;
  if (improved) {
    try {
      localStorage.setItem(key, JSON.stringify({ wins, total: totalRounds }));
    } catch (e) {
      // localStorage unavailable — best-tracking just won't persist
    }
    el('soloSummary').textContent = `${wins} / ${totalRounds} deals won — ${bestEver ? '🏆 New personal best!' : '🏆 First run in the books!'}`;
  } else {
    el('soloSummary').textContent = `${wins} / ${totalRounds} deals won · Personal best: ${bestEver.wins} / ${bestEver.total}`;
  }
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
  }
});
