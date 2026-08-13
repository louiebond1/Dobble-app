const el = (id) => document.getElementById(id);
let cups = [];

async function load() {
  const res = await fetch('/api/hugo-spritz-pong').then((r) => r.json());
  cups = res.cups;
  render(cups);
}

function render(list) {
  const grid = el('cupGrid');
  grid.innerHTML = list
    .map((cup, i) => {
      const img = cup.image
        ? `<img class="cup-image" src="${cup.image}" alt="${cup.symbolLabel}" />`
        : `<div class="cup-emoji">${cup.emoji}</div>`;
      return `<div class="cup-card${cup.wins ? ' cup-wins' : ''}">
        <div class="cup-number">${i + 1}</div>
        ${img}
        <div class="cup-name">${cup.symbolLabel}</div>
        <div class="cup-forfeit">${cup.forfeit}</div>
      </div>`;
    })
    .join('');
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

el('shuffleBtn').addEventListener('click', () => {
  hapticTap();
  playSuccess();
  cups = shuffle(cups);
  render(cups);
});

load();
