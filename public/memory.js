const el = (id) => document.getElementById(id);
const setup = el('setup');
const gameArea = el('memoryGameArea');
const overPanel = el('memoryOver');
const memoryLobby = el('memoryLobby');

const socket = io();

let symbols = [];
let photos = [];
let source = 'favourites';
let bg = 'blush';
let mount = 'string';
let players = [];
let mode = 'solo';
let pairCount = 12;
let deckSize = 0;
let deck = [];
let currentPlayer = 0;
let moves = 0;
let matchedPairs = 0;
let firstCard = null;
let secondCard = null;
let lock = false;
let startedAt = null;
let timerInterval = null;

// Networked Head-to-Head state
let roomCode = null;
let hostToken = null;
let isHost = false;
let myName = null;
let duoConfig = null; // { source, pairCount } captured when tapping Quick Play
let turnName = null;

const CHIP_PRESETS = { favourites: [8, 12, 16, 24], photos: [6, 10, 14] };

function currentPool() {
  return source === 'photos' ? photos : symbols;
}

Promise.all([
  fetch('/api/symbols').then((r) => r.json()),
  fetch('/api/photos').then((r) => r.json()),
]).then(([symbolData, photoData]) => {
  symbols = symbolData;
  photos = photoData;
  renderChips();
});

document.querySelectorAll('.bg-swatch[data-bg]').forEach((btn) => {
  btn.addEventListener('click', () => {
    bg = btn.dataset.bg;
    document.querySelectorAll('.bg-swatch').forEach((b) => b.classList.toggle('active', b === btn));
    document.body.dataset.bg = bg;
    el('bgUploadHint').classList.add('hidden');
    [gameArea, overPanel].forEach((stage) => {
      stage.style.backgroundImage = '';
    });
  });
});

el('bgUploadInput').addEventListener('change', (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    bg = 'custom';
    document.body.dataset.bg = bg;
    document.querySelectorAll('.bg-swatch').forEach((b) => b.classList.toggle('active', b === el('bgUploadSwatch')));
    el('bgUploadHint').classList.remove('hidden');
    [gameArea, overPanel].forEach((stage) => {
      stage.style.backgroundImage = `url(${reader.result})`;
    });
  };
  reader.readAsDataURL(file);
});

document.querySelectorAll('.mount-chip').forEach((btn) => {
  btn.addEventListener('click', () => {
    mount = btn.dataset.mount;
    document.querySelectorAll('.mount-chip').forEach((b) => b.classList.toggle('active', b === btn));
    document.body.dataset.mount = mount;
  });
});

document.querySelectorAll('#sourceToggle .mode-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    source = btn.dataset.source;
    document.querySelectorAll('#sourceToggle .mode-btn').forEach((b) => b.classList.toggle('active', b === btn));
    renderChips();
  });
});

document.querySelectorAll('#modeToggle .mode-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    mode = btn.dataset.mode;
    document.querySelectorAll('#modeToggle .mode-btn').forEach((b) => b.classList.toggle('active', b === btn));
    el('soloFields').classList.toggle('hidden', mode !== 'solo');
    el('duoFields').classList.toggle('hidden', mode !== 'duo');
  });
});

function renderChips() {
  const pool = currentPool();
  if (!pool.length) return; // still loading
  const container = el('pairChips');
  container.innerHTML = '';
  const presets = CHIP_PRESETS[source].filter((n) => n < pool.length);
  presets.forEach((n) => addChip(container, n, `${n}`));
  addChip(container, pool.length, `All ${pool.length}`);
  const defaultChip = container.children[Math.min(1, container.children.length - 1)];
  defaultChip.classList.add('active');
  el('pairCountInput').value = defaultChip.dataset.count;
  el('pairCountInput').max = pool.length;
}

function addChip(container, count, text) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'chip';
  btn.dataset.count = count;
  btn.textContent = text;
  btn.addEventListener('click', () => {
    container.querySelectorAll('.chip').forEach((c) => c.classList.toggle('active', c === btn));
    el('pairCountInput').value = count;
  });
  container.appendChild(btn);
}

el('pairCountInput').addEventListener('input', () => {
  const val = String(el('pairCountInput').value);
  document.querySelectorAll('.chip').forEach((c) => c.classList.toggle('active', c.dataset.count === val));
});

// --- Solo mode --------------------------------------------------------------

el('startBtn').addEventListener('click', () => {
  const pool = currentPool();
  if (!pool.length) return; // still loading — button is effectively a no-op until ready

  mode = 'solo';
  pairCount = Math.max(2, Math.min(pool.length, parseInt(el('pairCountInput').value, 10) || 12));
  const name = el('soloNameInput').value.trim() || 'You';
  players = [{ name, pairs: 0 }];
  currentPlayer = 0;

  const chosen = shuffle([...currentPool()]).slice(0, pairCount);
  startGame(shuffle(chosen.flatMap((s) => [s, s])));
});

// --- Head-to-Head (networked) ------------------------------------------------

el('memoryLouieBtn').addEventListener('click', () => quickPlayJoin('Louie'));
el('memoryArielBtn').addEventListener('click', () => quickPlayJoin('Ariel'));

function quickPlayJoin(name) {
  const pool = currentPool();
  duoConfig = {
    source,
    pairCount: Math.max(2, Math.min(pool.length || 57, parseInt(el('pairCountInput').value, 10) || 12)),
  };
  socket.emit('memory:quickplay:join', { name }, (res) => {
    if (!res || !res.ok) return;
    mode = 'duo';
    isHost = res.isHost;
    hostToken = res.hostToken || null;
    roomCode = res.code;
    myName = res.name;
    setup.classList.add('hidden');
    overPanel.classList.add('hidden');
    memoryLobby.classList.remove('hidden');
  });
}

el('memoryLobbyBackBtn').addEventListener('click', () => {
  if (roomCode) socket.emit('memory:host:cancel', { code: roomCode });
  resetDuoState();
  memoryLobby.classList.add('hidden');
  setup.classList.remove('hidden');
});

el('memoryStartBtn').addEventListener('click', () => {
  if (!isHost || !roomCode || !duoConfig) return;
  socket.emit('memory:host:start', { code: roomCode, source: duoConfig.source, pairCount: duoConfig.pairCount });
});

function resetDuoState() {
  roomCode = null;
  hostToken = null;
  isHost = false;
  myName = null;
  turnName = null;
}

socket.on('memory:players:update', (list) => {
  players = list;
  updateMemoryLobby();
});

function updateMemoryLobby() {
  el('memoryPlayerCount').textContent = players.length;
  el('memoryStartBtn').classList.toggle('hidden', !isHost);
  el('memoryStartBtn').disabled = players.length < 2;
  if (isHost) {
    el('memoryLobbyHint').textContent = 'Waiting for at least one more player to join…';
    el('memoryLobbyHint').classList.toggle('hidden', players.length >= 2);
  } else {
    el('memoryLobbyHint').textContent = 'Waiting for the host to start the game…';
    el('memoryLobbyHint').classList.remove('hidden');
  }
  el('memoryPlayerList').innerHTML = players
    .map((p) => `<li>${p.name === myName ? `${p.name} (You)` : p.name}</li>`)
    .join('');
}

socket.on('memory:round:start', (data) => {
  mode = 'duo';
  source = data.source;
  players = data.players;
  turnName = data.turnName;
  memoryLobby.classList.add('hidden');
  startGame(data.deck);
});

socket.on('memory:room:cancelled', () => {
  resetDuoState();
  memoryLobby.classList.add('hidden');
  gameArea.classList.add('hidden');
  overPanel.classList.add('hidden');
  setup.classList.remove('hidden');
});

function updateDuoHud() {
  el('hudP1Score').textContent = players[0].pairs;
  el('hudP1').classList.toggle('active', players[0].name === turnName);
  if (players[1]) {
    el('hudP2Score').textContent = players[1].pairs;
    el('hudP2').classList.toggle('active', players[1].name === turnName);
  }
  el('memoryTurn').textContent = turnName === myName ? 'Your turn' : `${turnName}'s turn`;
}

// --- Shared game start --------------------------------------------------

function startGame(builtDeck) {
  currentPlayer = 0;
  moves = 0;
  matchedPairs = 0;
  firstCard = null;
  secondCard = null;
  lock = false;

  setup.classList.add('hidden');
  memoryLobby.classList.add('hidden');
  overPanel.classList.add('hidden');
  gameArea.classList.remove('hidden');
  el('memoryHud').classList.toggle('hidden', mode !== 'duo');
  el('memoryMoves').textContent = '0 moves';

  if (mode === 'duo') {
    el('hudP1Name').textContent = players[0].name;
    if (players[1]) el('hudP2Name').textContent = players[1].name;
    updateDuoHud();
  }

  buildWall(builtDeck);
  startTimer();
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Lays cards out along 3+ loosely organic "washing lines" instead of a grid —
// even spacing per line with small randomized jitter in position/rotation/
// hang length, computed once so the wall stays stable during play. Geometry
// adapts per mount: string needs room to sag, pins barely any, shelves need
// none (cards share one baseline so they visibly rest on the ledge). Values
// are RATIOS of card height, not fixed pixels — the per-line overhead has to
// shrink along with the cards themselves, or a big board could never
// converge on a layout that fits one screen.
const MOUNT_GEOM = {
  string: { base: 0.22, jitter: 0.13, vJitter: 0.11, extra: 0.3, rotJitter: 7 },
  pin: { base: 0.08, jitter: 0.05, vJitter: 0.07, extra: 0.24, rotJitter: 6 },
  shelf: { base: 0, jitter: 0, vJitter: 0, extra: 0.2, rotJitter: 5 },
};

// The wall must always fit on one screen — never scroll — so instead of a
// fixed cards-per-line guess, this searches column counts ascending and
// takes the first (largest-card) layout whose total height fits the actual
// available space. More columns means smaller cards but fewer rows, so
// height only gets easier to satisfy as columns increase; if nothing fits
// even at the column cap, the tightest option found is used as a last resort.
function computeLayout(n, wallWidth, wallHeight) {
  const geom = MOUNT_GEOM[mount] || MOUNT_GEOM.string;
  const sidePad = Math.max(14, wallWidth * 0.04);
  const gapX = Math.max(8, wallWidth * 0.02);
  const avail = wallWidth - sidePad * 2;
  const maxCols = Math.max(2, Math.min(n, 16));

  let cols = maxCols;
  let cardW = 0;
  let cardH = 0;
  let lineGap = 0;
  let topPad = 0;
  let lines = 0;

  for (let tryCols = 2; tryCols <= maxCols; tryCols++) {
    let w = (avail - gapX * (tryCols - 1)) / tryCols;
    w = Math.max(24, Math.min(150, w));
    const h = (w * 4) / 3;
    const gap = h * (1 + geom.base + geom.jitter + geom.vJitter + geom.extra);
    // Shelf cards extend upward from the line (they rest ON the shelf,
    // rather than hang below it), so the first row needs a full card
    // height of headroom or it renders off the top of the wall.
    const pad = mount === 'shelf' ? h * 1.15 : Math.max(24, h * 0.4);
    const ln = Math.ceil(n / tryCols);
    const totalHeight = pad + ln * gap;

    cols = tryCols;
    cardW = w;
    cardH = h;
    lineGap = gap;
    topPad = pad;
    lines = ln;

    if (totalHeight <= wallHeight) break; // largest-card fitting config found
  }

  const cards = [];
  let idx = 0;
  for (let line = 0; line < lines && idx < n; line++) {
    const countThisLine = Math.min(cols, n - idx);
    const usedWidth = countThisLine * cardW + (countThisLine - 1) * gapX;
    const lineStartX = sidePad + Math.max(0, (avail - usedWidth) / 2);
    for (let c = 0; c < countThisLine; c++) {
      const baseX = lineStartX + c * (cardW + gapX) + cardW / 2;
      const jitterX = (Math.random() - 0.5) * gapX * 0.4;
      const hangLen = cardH * (geom.base + Math.random() * geom.jitter + (Math.random() - 0.5) * geom.vJitter);
      cards.push({
        x: baseX + jitterX,
        lineY: topPad + line * lineGap,
        hangLen: Math.max(0, hangLen),
        rot: (Math.random() - 0.5) * 2 * geom.rotJitter,
        cardW,
        cardH,
      });
      idx++;
    }
  }
  return { cards, lines, lineGap, topPad, cardW, cardH };
}

function buildWall(builtDeck) {
  deck = builtDeck;
  deckSize = deck.length / 2;

  const wall = el('memoryWall');
  wall.innerHTML = '';
  el('memoryFound').textContent = `0 / ${deckSize} pairs`;

  const inner = document.createElement('div');
  inner.className = 'memory-wall-inner';
  wall.appendChild(inner);

  const wallWidth = wall.clientWidth || window.innerWidth;
  const wallHeight = wall.clientHeight || window.innerHeight;
  const layout = computeLayout(deck.length, wallWidth, wallHeight);
  inner.style.height = `${layout.topPad + layout.lines * layout.lineGap}px`;

  for (let line = 0; line < layout.lines; line++) {
    const lineY = layout.topPad + line * layout.lineGap;
    if (mount === 'string') {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', 'memory-string-line');
      svg.style.top = `${lineY - 6}px`;
      svg.setAttribute('viewBox', '0 0 100 20');
      svg.setAttribute('preserveAspectRatio', 'none');
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', 'M0,6 Q50,14 100,6');
      path.setAttribute('vector-effect', 'non-scaling-stroke');
      svg.appendChild(path);
      inner.appendChild(svg);
    } else if (mount === 'shelf') {
      const bar = document.createElement('div');
      bar.className = 'shelf-bar';
      bar.style.top = `${lineY + 6}px`;
      inner.appendChild(bar);
    }
    // pin mount: no shared line — cards attach straight to the wall
  }

  deck.forEach((card, i) => {
    const pos = layout.cards[i];
    inner.appendChild(buildHangCard(card, pos, i));
  });

  spawnDecor(inner);
}

function buildHangCard(card, pos, index) {
  const hangCard = document.createElement('div');
  hangCard.className = 'hang-card';
  hangCard.style.left = `${pos.x}px`;
  hangCard.style.top = `${pos.lineY}px`;
  hangCard.dataset.symbolId = card.id;
  hangCard.dataset.index = index;

  const swing = document.createElement('div');
  swing.className = 'swing-wrapper';
  swing.style.setProperty('--rest-rotate', `${pos.rot}deg`);
  swing.style.width = `${pos.cardW}px`;
  swing.style.height = `${pos.cardH}px`;

  if (mount === 'string') {
    const stringEl = document.createElement('div');
    stringEl.className = 'hang-string';
    stringEl.style.height = `${pos.hangLen}px`;
    const peg = document.createElement('div');
    peg.className = 'hang-peg';
    peg.style.top = `${pos.hangLen - 4}px`;
    swing.style.top = `${pos.hangLen}px`;
    hangCard.appendChild(stringEl);
    hangCard.appendChild(peg);
  } else if (mount === 'pin') {
    const pin = document.createElement('div');
    pin.className = 'hang-pin';
    swing.style.top = `${pos.hangLen}px`;
    hangCard.appendChild(pin);
  } else if (mount === 'shelf') {
    swing.classList.add('pivot-bottom');
    swing.style.top = `${-(pos.cardH - 6)}px`;
  }

  const cardEl = document.createElement('div');
  cardEl.className = 'memory-card';

  const inner = document.createElement('div');
  inner.className = 'memory-card-inner';

  const back = document.createElement('div');
  back.className = 'memory-face memory-back';

  const front = document.createElement('div');
  front.className = `memory-face memory-front ${source === 'photos' ? 'is-photo' : 'is-icon'}`;
  if (card.image) {
    const img = document.createElement('img');
    img.src = card.image;
    img.alt = card.label;
    img.loading = 'lazy';
    front.appendChild(img);
  } else {
    const fallback = document.createElement('div');
    fallback.className = 'symbol-emoji-fallback';
    fallback.textContent = card.emoji;
    front.appendChild(fallback);
  }

  inner.appendChild(back);
  inner.appendChild(front);
  cardEl.appendChild(inner);
  swing.appendChild(cardEl);
  hangCard.appendChild(swing);

  hangCard.addEventListener('click', () => handleCardClick({ hangCard, cardEl, swing, index }));
  return hangCard;
}

function spawnDecor(container) {
  if (mount === 'pin') return; // clean pinboard look, no extra decor
  const count = 9;
  for (let i = 0; i < count; i++) {
    const decor = document.createElement('div');
    const x = 4 + Math.random() * 92;
    const y = 4 + Math.random() * 14;
    decor.className = 'fairy-light';
    decor.style.left = `${x}%`;
    decor.style.top = `${y}px`;
    decor.style.animationDelay = `${(Math.random() * 2).toFixed(2)}s`;
    container.appendChild(decor);
  }
}

function handleCardClick(picked) {
  if (mode === 'duo') return handleDuoClick(picked);
  return handleSoloClick(picked);
}

function handleSoloClick(picked) {
  if (lock) return;
  if (picked.cardEl.classList.contains('flipped') || picked.hangCard.classList.contains('matched')) return;

  hapticTap();
  picked.swing.classList.add('swinging');
  setTimeout(() => picked.swing.classList.remove('swinging'), 500);
  picked.cardEl.classList.add('flipped');

  if (!firstCard) {
    firstCard = picked;
    return;
  }

  secondCard = picked;
  moves += 1;
  el('memoryMoves').textContent = `${moves} move${moves === 1 ? '' : 's'}`;
  lock = true;

  if (firstCard.hangCard.dataset.symbolId === secondCard.hangCard.dataset.symbolId) {
    setTimeout(() => {
      [firstCard, secondCard].forEach(({ hangCard, swing }) => {
        hangCard.classList.add('matched');
        swing.classList.add('match-pulse');
        const flag = document.createElement('span');
        flag.className = 'match-flag';
        flag.textContent = 'Match! 💕';
        swing.appendChild(flag);
        setTimeout(() => flag.remove(), 800);
      });
      matchedPairs += 1;
      players[currentPlayer].pairs += 1;
      playSuccess();
      hapticSuccess();
      el('memoryFound').textContent = `${matchedPairs} / ${deckSize} pairs`;
      resetTurnState();
      if (matchedPairs === deckSize) endGame();
    }, 420);
  } else {
    setTimeout(() => {
      [firstCard, secondCard].forEach(({ swing }) => swing.classList.add('mismatch'));
      setTimeout(() => {
        [firstCard, secondCard].forEach(({ cardEl, swing }) => {
          cardEl.classList.remove('flipped');
          swing.classList.remove('mismatch');
        });
        resetTurnState();
      }, 500);
    }, 650);
  }
}

function handleDuoClick(picked) {
  if (turnName !== myName) return; // not your turn
  if (picked.cardEl.classList.contains('flipped') || picked.hangCard.classList.contains('matched')) return;
  socket.emit('memory:flip', { code: roomCode, index: picked.index });
}

socket.on('memory:flip', (data) => {
  const hangCard = document.querySelector(`.hang-card[data-index="${data.index}"]`);
  if (!hangCard) return;
  const cardEl = hangCard.querySelector('.memory-card');
  const swing = hangCard.querySelector('.swing-wrapper');
  hapticTap();
  swing.classList.add('swinging');
  setTimeout(() => swing.classList.remove('swinging'), 500);
  cardEl.classList.add('flipped');
});

socket.on('memory:resolve', (data) => {
  const card1 = document.querySelector(`.hang-card[data-index="${data.index1}"]`);
  const card2 = document.querySelector(`.hang-card[data-index="${data.index2}"]`);
  players = data.players;
  turnName = data.turnName;
  moves += 1;
  el('memoryMoves').textContent = `${moves} move${moves === 1 ? '' : 's'}`;

  if (data.matched) {
    [card1, card2].forEach((hangCard) => {
      if (!hangCard) return;
      const swing = hangCard.querySelector('.swing-wrapper');
      hangCard.classList.add('matched');
      swing.classList.add('match-pulse');
      const flag = document.createElement('span');
      flag.className = 'match-flag';
      flag.textContent = 'Match! 💕';
      swing.appendChild(flag);
      setTimeout(() => flag.remove(), 800);
    });
    matchedPairs += 1;
    playSuccess();
    hapticSuccess();
    el('memoryFound').textContent = `${matchedPairs} / ${deckSize} pairs`;
  } else {
    [card1, card2].forEach((hangCard) => {
      if (hangCard) hangCard.querySelector('.swing-wrapper').classList.add('mismatch');
    });
    setTimeout(() => {
      [card1, card2].forEach((hangCard) => {
        if (!hangCard) return;
        hangCard.querySelector('.memory-card').classList.remove('flipped');
        hangCard.querySelector('.swing-wrapper').classList.remove('mismatch');
      });
    }, 500);
  }

  updateDuoHud();
  if (data.over) setTimeout(() => endGame(), 500);
});

function resetTurnState() {
  firstCard = null;
  secondCard = null;
  lock = false;
}

function startTimer() {
  startedAt = Date.now();
  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    const secs = Math.floor((Date.now() - startedAt) / 1000);
    const m = Math.floor(secs / 60);
    const s = String(secs % 60).padStart(2, '0');
    el('memoryTimer').textContent = `${m}:${s}`;
  }, 1000);
}

function bestKey(name) {
  return `memory-solo-best-${source}-${name.trim().toLowerCase()}-${deckSize}`;
}

function endGame() {
  clearInterval(timerInterval);
  gameArea.classList.add('hidden');
  overPanel.classList.remove('hidden');
  el('memoryPlayAgainBtn').classList.toggle('hidden', mode === 'duo' && !isHost);

  const elapsedSec = Math.floor((Date.now() - startedAt) / 1000);
  el('memoryOverSummary').textContent = `${moves} moves · ${el('memoryTimer').textContent} · all ${deckSize} pairs found`;

  if (mode === 'solo') {
    el('memoryOverTitle').textContent = '🎉 All memories found!';
    el('memoryFinalBoard').innerHTML = '';

    const key = bestKey(players[0].name);
    let best = null;
    try {
      best = JSON.parse(localStorage.getItem(key) || 'null');
    } catch (e) {
      best = null;
    }
    const improved = !best || moves < best.moves || (moves === best.moves && elapsedSec < best.seconds);
    if (improved) {
      try {
        localStorage.setItem(key, JSON.stringify({ moves, seconds: elapsedSec }));
      } catch (e) {
        // localStorage unavailable — best-tracking just won't persist
      }
      el('memorySoloBest').textContent = best ? '🏆 New personal best!' : '🏆 First run in the books!';
    } else {
      const bestM = Math.floor(best.seconds / 60);
      const bestS = String(best.seconds % 60).padStart(2, '0');
      el('memorySoloBest').textContent = `Best: ${best.moves} moves · ${bestM}:${bestS}`;
    }
  } else {
    const [p1, p2] = players;
    let title;
    if (p1.pairs === p2.pairs) title = "It's a tie! 🤝";
    else title = `${p1.pairs > p2.pairs ? p1.name : p2.name} wins! 🏆`;
    el('memoryOverTitle').textContent = title;
    el('memorySoloBest').textContent = '';
    renderLeaderboard('memoryFinalBoard', [...players].sort((a, b) => b.pairs - a.pairs), { valueKey: 'pairs' });
  }
}

el('memoryPlayAgainBtn').addEventListener('click', () => {
  overPanel.classList.add('hidden');
  if (mode === 'duo' && isHost && roomCode && duoConfig) {
    socket.emit('memory:host:start', { code: roomCode, source: duoConfig.source, pairCount: duoConfig.pairCount });
  } else if (mode !== 'duo') {
    setup.classList.remove('hidden');
  }
});
