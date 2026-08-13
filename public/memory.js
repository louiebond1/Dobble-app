const el = (id) => document.getElementById(id);
const setup = el('setup');
const gameArea = el('memoryGameArea');
const overPanel = el('memoryOver');

let symbols = [];
let players = [];
let currentPlayer = 0;
let moves = 0;
let matchedPairs = 0;
let firstCard = null;
let secondCard = null;
let lock = false;
let startedAt = null;
let timerInterval = null;

fetch('/api/symbols')
  .then((r) => r.json())
  .then((data) => {
    symbols = data;
  });

el('startBtn').addEventListener('click', () => {
  if (!symbols.length) return; // symbols still loading — button is effectively a no-op until ready
  const p1 = el('p1Input').value.trim() || 'Player 1';
  const p2 = el('p2Input').value.trim() || 'Player 2';
  players = [
    { name: p1, pairs: 0 },
    { name: p2, pairs: 0 },
  ];
  currentPlayer = 0;
  moves = 0;
  matchedPairs = 0;
  firstCard = null;
  secondCard = null;
  lock = false;

  setup.classList.add('hidden');
  overPanel.classList.add('hidden');
  gameArea.classList.remove('hidden');

  el('hudP1Name').textContent = p1;
  el('hudP2Name').textContent = p2;
  updateHud();
  buildBoard();
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

function buildBoard() {
  const deck = shuffle(symbols.flatMap((s) => [{ ...s, pairKey: `${s.id}a` }, { ...s, pairKey: `${s.id}b` }]));
  const grid = el('memoryGrid');
  grid.innerHTML = '';
  deck.forEach((card) => {
    const cardEl = document.createElement('div');
    cardEl.className = 'memory-card';
    cardEl.dataset.symbolId = card.id;

    const inner = document.createElement('div');
    inner.className = 'memory-card-inner';

    const back = document.createElement('div');
    back.className = 'memory-face memory-back';
    back.textContent = '💕';

    const front = document.createElement('div');
    front.className = 'memory-face memory-front';
    if (card.image) {
      const img = document.createElement('img');
      img.src = card.image;
      img.alt = card.label;
      img.loading = 'lazy';
      front.appendChild(img);
    } else {
      front.textContent = card.emoji;
    }

    inner.appendChild(back);
    inner.appendChild(front);
    cardEl.appendChild(inner);
    cardEl.addEventListener('click', () => handleCardClick(cardEl));
    grid.appendChild(cardEl);
  });
}

function handleCardClick(cardEl) {
  if (lock) return;
  if (cardEl.classList.contains('flipped') || cardEl.classList.contains('matched')) return;

  hapticTap();
  cardEl.classList.add('flipped');

  if (!firstCard) {
    firstCard = cardEl;
    return;
  }

  secondCard = cardEl;
  moves += 1;
  el('memoryMoves').textContent = `${moves} move${moves === 1 ? '' : 's'}`;
  lock = true;

  if (firstCard.dataset.symbolId === secondCard.dataset.symbolId) {
    setTimeout(() => {
      firstCard.classList.add('matched');
      secondCard.classList.add('matched');
      matchedPairs += 1;
      players[currentPlayer].pairs += 1;
      playSuccess();
      hapticSuccess();
      updateHud();
      el('memoryFound').textContent = `${matchedPairs} / ${symbols.length} pairs`;
      resetTurnState();
      if (matchedPairs === symbols.length) endGame();
    }, 420);
  } else {
    setTimeout(() => {
      firstCard.classList.add('mismatch');
      secondCard.classList.add('mismatch');
      setTimeout(() => {
        firstCard.classList.remove('flipped', 'mismatch');
        secondCard.classList.remove('flipped', 'mismatch');
        currentPlayer = 1 - currentPlayer;
        updateHud();
        resetTurnState();
      }, 500);
    }, 550);
  }
}

function resetTurnState() {
  firstCard = null;
  secondCard = null;
  lock = false;
}

function updateHud() {
  el('hudP1Score').textContent = players[0].pairs;
  el('hudP2Score').textContent = players[1].pairs;
  el('hudP1').classList.toggle('active', currentPlayer === 0);
  el('hudP2').classList.toggle('active', currentPlayer === 1);
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

function endGame() {
  clearInterval(timerInterval);
  gameArea.classList.add('hidden');
  overPanel.classList.remove('hidden');

  const [p1, p2] = players;
  let title;
  if (p1.pairs === p2.pairs) title = "It's a tie! 🤝";
  else title = `${p1.pairs > p2.pairs ? p1.name : p2.name} wins! 🏆`;
  el('memoryOverTitle').textContent = title;
  el('memoryOverSummary').textContent = `${moves} moves · ${el('memoryTimer').textContent} · all 57 pairs found`;
  renderLeaderboard('memoryFinalBoard', [...players].sort((a, b) => b.pairs - a.pairs), { valueKey: 'pairs' });
}
