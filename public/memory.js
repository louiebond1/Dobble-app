const el = (id) => document.getElementById(id);
const setup = el('setup');
const gameArea = el('memoryGameArea');
const overPanel = el('memoryOver');

let symbols = [];
let photos = [];
let source = 'favourites';
let theme = 'romantic';
let players = [];
let mode = 'solo';
let pairCount = 12;
let deckSize = 0;
let currentPlayer = 0;
let moves = 0;
let matchedPairs = 0;
let firstCard = null;
let secondCard = null;
let lock = false;
let startedAt = null;
let timerInterval = null;

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

document.querySelectorAll('.theme-card').forEach((btn) => {
  btn.addEventListener('click', () => {
    theme = btn.dataset.theme;
    document.querySelectorAll('.theme-card').forEach((b) => b.classList.toggle('active', b === btn));
    document.body.dataset.theme = theme;
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

el('startBtn').addEventListener('click', () => {
  const pool = currentPool();
  if (!pool.length) return; // still loading — button is effectively a no-op until ready

  pairCount = Math.max(2, Math.min(pool.length, parseInt(el('pairCountInput').value, 10) || 12));

  if (mode === 'solo') {
    const name = el('soloNameInput').value.trim() || 'You';
    players = [{ name, pairs: 0 }];
  } else {
    const p1 = el('p1Input').value.trim() || 'Player 1';
    const p2 = el('p2Input').value.trim() || 'Player 2';
    players = [
      { name: p1, pairs: 0 },
      { name: p2, pairs: 0 },
    ];
  }
  currentPlayer = 0;
  moves = 0;
  matchedPairs = 0;
  firstCard = null;
  secondCard = null;
  lock = false;

  setup.classList.add('hidden');
  overPanel.classList.add('hidden');
  gameArea.classList.remove('hidden');
  el('memoryHud').classList.toggle('hidden', mode === 'solo');
  el('memoryMoves').textContent = '0 moves';

  el('hudP1Name').textContent = players[0].name;
  if (players[1]) el('hudP2Name').textContent = players[1].name;
  updateHud();
  buildWall();
  startTimer();
});

el('memoryPlayAgainBtn').addEventListener('click', () => {
  overPanel.classList.add('hidden');
  setup.classList.remove('hidden');
});

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Lays cards out along 3+ loosely organic "washing lines" instead of a grid —
// even spacing per line with small randomized jitter in position/rotation/
// string length, computed once so the wall stays stable during play.
function computeLayout(n, wallWidth) {
  const cardsPerLine = n <= 12 ? 3 : n <= 24 ? 4 : n <= 48 ? 5 : 6;
  const lines = Math.max(1, Math.ceil(n / cardsPerLine));
  const sidePad = Math.max(18, wallWidth * 0.05);
  const gapX = Math.max(10, wallWidth * 0.025);
  const avail = wallWidth - sidePad * 2;
  let cardW = (avail - gapX * (cardsPerLine - 1)) / cardsPerLine;
  cardW = Math.max(64, Math.min(150, cardW));
  const cardH = (cardW * 4) / 3;
  const stringBase = 20;
  const stringJitter = 12;
  const rotJitter = 7;
  const vJitter = 10;
  const lineGap = cardH + stringBase + stringJitter + vJitter + 36;
  const topPad = 40;

  const cards = [];
  let idx = 0;
  for (let line = 0; line < lines && idx < n; line++) {
    const countThisLine = Math.min(cardsPerLine, n - idx);
    const usedWidth = countThisLine * cardW + (countThisLine - 1) * gapX;
    const lineStartX = sidePad + Math.max(0, (avail - usedWidth) / 2);
    for (let c = 0; c < countThisLine; c++) {
      const baseX = lineStartX + c * (cardW + gapX) + cardW / 2;
      const jitterX = (Math.random() - 0.5) * gapX * 0.4;
      cards.push({
        x: baseX + jitterX,
        lineY: topPad + line * lineGap,
        stringLen: stringBase + Math.random() * stringJitter + (Math.random() - 0.5) * vJitter,
        rot: (Math.random() - 0.5) * 2 * rotJitter,
        cardW,
        cardH,
      });
      idx++;
    }
  }
  return { cards, lines, lineGap, topPad, cardW, cardH };
}

function buildWall() {
  const chosen = shuffle([...currentPool()]).slice(0, pairCount);
  deckSize = chosen.length;
  const deck = shuffle(chosen.flatMap((s) => [s, s]));

  const wall = el('memoryWall');
  wall.innerHTML = '';
  el('memoryFound').textContent = `0 / ${deckSize} pairs`;

  const inner = document.createElement('div');
  inner.className = 'memory-wall-inner';
  wall.appendChild(inner);

  const wallWidth = wall.clientWidth || window.innerWidth;
  const layout = computeLayout(deck.length, wallWidth);
  inner.style.height = `${layout.topPad + layout.lines * layout.lineGap}px`;

  for (let line = 0; line < layout.lines; line++) {
    const y = layout.topPad + line * layout.lineGap - 6;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'memory-string-line');
    svg.style.top = `${y}px`;
    svg.setAttribute('viewBox', '0 0 100 20');
    svg.setAttribute('preserveAspectRatio', 'none');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M0,6 Q50,14 100,6');
    path.setAttribute('vector-effect', 'non-scaling-stroke');
    svg.appendChild(path);
    inner.appendChild(svg);
  }

  deck.forEach((card, i) => {
    const pos = layout.cards[i];
    inner.appendChild(buildHangCard(card, pos));
  });

  spawnDecor(inner);
}

function buildHangCard(card, pos) {
  const hangCard = document.createElement('div');
  hangCard.className = 'hang-card';
  hangCard.style.left = `${pos.x}px`;
  hangCard.style.top = `${pos.lineY}px`;
  hangCard.dataset.symbolId = card.id;

  const stringEl = document.createElement('div');
  stringEl.className = 'hang-string';
  stringEl.style.height = `${pos.stringLen}px`;

  const peg = document.createElement('div');
  peg.className = 'hang-peg';
  peg.style.top = `${pos.stringLen - 4}px`;

  const swing = document.createElement('div');
  swing.className = 'swing-wrapper';
  swing.style.setProperty('--rest-rotate', `${pos.rot}deg`);
  swing.style.top = `${pos.stringLen}px`;
  swing.style.width = `${pos.cardW}px`;
  swing.style.height = `${pos.cardH}px`;

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
  hangCard.appendChild(stringEl);
  hangCard.appendChild(peg);
  hangCard.appendChild(swing);

  hangCard.addEventListener('click', () => handleCardClick({ hangCard, cardEl, swing }));
  return hangCard;
}

function spawnDecor(container) {
  const count = 9;
  for (let i = 0; i < count; i++) {
    const decor = document.createElement('div');
    const x = 4 + Math.random() * 92;
    const y = 4 + Math.random() * 14;
    decor.style.left = `${x}%`;
    decor.style.top = `${y}px`;
    decor.style.animationDelay = `${(Math.random() * 2).toFixed(2)}s`;
    if (theme === 'holiday') {
      decor.className = 'bunting-flag';
      decor.style.transform = `rotate(${(Math.random() - 0.5) * 10}deg)`;
    } else {
      decor.className = 'fairy-light';
    }
    container.appendChild(decor);
  }
}

function handleCardClick(picked) {
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
      updateHud();
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
        if (players.length > 1) currentPlayer = 1 - currentPlayer;
        updateHud();
        resetTurnState();
      }, 500);
    }, 650);
  }
}

function resetTurnState() {
  firstCard = null;
  secondCard = null;
  lock = false;
}

function updateHud() {
  el('hudP1Score').textContent = players[0].pairs;
  el('hudP1').classList.toggle('active', currentPlayer === 0);
  if (players[1]) {
    el('hudP2Score').textContent = players[1].pairs;
    el('hudP2').classList.toggle('active', currentPlayer === 1);
  }
  el('memoryTurn').textContent = `${players[currentPlayer].name}'s turn`;
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
