const el = (id) => document.getElementById(id);
const setupPanel = el('setupPanel');
const playPanel = el('playPanel');
const gameOverOverlay = el('gameOverOverlay');

let cups = [];
let sunk = new Set();
let phase = 'setup'; // 'setup' | 'playing'

async function load() {
  const res = await fetch('/api/hugo-spritz-pong').then((r) => r.json());
  cups = res.cups;
  render();
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function cupCardHtml(cup, index) {
  const isSunk = sunk.has(cup.id);
  if (phase === 'setup' || isSunk) {
    const img = cup.image
      ? `<img class="cup-image" src="${cup.image}" alt="${cup.symbolLabel}" />`
      : `<div class="cup-emoji">${cup.emoji}</div>`;
    return `<div class="cup-card${cup.wins ? ' cup-wins' : ''}${isSunk ? ' cup-sunk' : ''}" data-id="${cup.id}">
      <div class="cup-number">${index + 1}</div>
      ${isSunk ? '<div class="cup-sunk-badge">SUNK</div>' : ''}
      ${img}
      <div class="cup-name">${cup.symbolLabel}</div>
      <div class="cup-forfeit">${cup.forfeit}</div>
    </div>`;
  }
  // Playing phase, not yet sunk — identity stays a secret until tapped.
  return `<button class="cup-card cup-hidden" data-id="${cup.id}">
    <div class="cup-number">${index + 1}</div>
    <div class="cup-emoji">🥤</div>
    <div class="cup-tap-hint">Tap when sunk</div>
  </button>`;
}

function render() {
  el('cupGrid').innerHTML = cups.map((cup, i) => cupCardHtml(cup, i)).join('');
  if (phase === 'playing') {
    document.querySelectorAll('.cup-hidden').forEach((btn) => {
      btn.addEventListener('click', () => sinkCup(Number(btn.dataset.id)));
    });
  }
  el('cupsRemainingCount').textContent = cups.length - sunk.size;
}

function sinkCup(id) {
  if (sunk.has(id)) return;
  const cup = cups.find((c) => c.id === id);
  if (!cup) return;
  sunk.add(id);
  hapticSuccess();
  playSuccess();
  render();
  if (cup.wins) {
    setTimeout(() => gameOver(cup), 900);
  }
}

function gameOver(winningCup) {
  el('gameOverText').textContent = `The "${winningCup.symbolLabel}" cup went down — that's the game.`;
  gameOverOverlay.classList.remove('hidden');
}

function startNewGame() {
  cups = shuffle(cups);
  sunk = new Set();
  phase = 'setup';
  gameOverOverlay.classList.add('hidden');
  playPanel.classList.add('hidden');
  setupPanel.classList.remove('hidden');
  render();
}

el('shuffleBtn').addEventListener('click', () => {
  hapticTap();
  cups = shuffle(cups);
  render();
});

el('startGameBtn').addEventListener('click', () => {
  hapticTap();
  phase = 'playing';
  sunk = new Set();
  setupPanel.classList.add('hidden');
  playPanel.classList.remove('hidden');
  render();
});

el('playBackBtn').addEventListener('click', () => {
  phase = 'setup';
  sunk = new Set();
  playPanel.classList.add('hidden');
  setupPanel.classList.remove('hidden');
  render();
});

el('newGameBtn').addEventListener('click', startNewGame);

load();
