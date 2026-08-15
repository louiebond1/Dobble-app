const el = (id) => document.getElementById(id);
const resultOverlay = el('resultOverlay');
let round = 0;
let commonId = null;
let commonSymbolCard = null;
let active = false;

let symbolsById = [];
let deck = [];

function sharedSymbolId(idsA, idsB) {
  const setA = new Set(idsA);
  return idsB.find((id) => setA.has(id));
}

function buildCard(ids) {
  return ids.map((id) => symbolsById[id]);
}

async function nextRound() {
  active = false;
  round += 1;

  const a = Math.floor(Math.random() * deck.length);
  let b = Math.floor(Math.random() * deck.length);
  while (b === a) b = Math.floor(Math.random() * deck.length);
  const idsA = deck[a];
  const idsB = deck[b];
  commonId = sharedSymbolId(idsA, idsB);
  commonSymbolCard = symbolsById[commonId] || null;

  el('roundNum').textContent = round;
  await revealRound(
    el('countdownOverlay'),
    el('countdownNumber'),
    el('cardA'),
    el('cardB'),
    buildCard(idsA),
    buildCard(idsB),
    handleTap
  );
  active = true;
}

async function handleTap(symbolId, node) {
  if (!active) return;
  hapticTap();
  if (symbolId === commonId) {
    active = false;
    node.classList.add('correct');
    await highlightMatch(el('cardA'), el('cardB'), symbolId);
    showOverlay(
      commonSymbolCard && commonSymbolCard.image,
      commonSymbolCard && commonSymbolCard.emoji,
      '✅ Correct!',
      commonSymbolCard && commonSymbolCard.label
    );
    setTimeout(nextRound, 1600);
  } else {
    node.classList.add('wrong');
    setTimeout(() => node.classList.remove('wrong'), 400);
  }
}

function showOverlay(image, emoji, title, label) {
  renderResultPhoto(el('resultPhotoFrame'), image, emoji, label);
  el('resultTitle').textContent = title;
  el('resultLabel').textContent = label;
  resultOverlay.classList.remove('hidden');
  setTimeout(() => resultOverlay.classList.add('hidden'), 1400);
}

// Fetched once, then every round is generated locally — no per-round
// network round-trip, so Trial Mode keeps working offline once this
// (and /api/symbols, /api/deck) are cached.
Promise.all([
  fetch('/api/symbols').then((r) => r.json()),
  fetch('/api/deck').then((r) => r.json()),
]).then(([symbolData, deckData]) => {
  symbolsById = symbolData;
  deck = deckData.deck;
  prefetchAllSymbolImages();
  nextRound();
});
