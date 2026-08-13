const el = (id) => document.getElementById(id);
const resultOverlay = el('resultOverlay');
let round = 0;
let commonId = null;
let commonSymbol = null;
let active = false;

function nextRound() {
  active = false;
  fetch('/api/trial')
    .then((r) => r.json())
    .then(async (data) => {
      round += 1;
      commonId = data.commonId;
      commonSymbol = data.cardA.find((s) => s.id === commonId) || null;
      el('roundNum').textContent = round;
      await revealRound(
        el('countdownOverlay'),
        el('countdownNumber'),
        el('cardA'),
        el('cardB'),
        data.cardA,
        data.cardB,
        handleTap
      );
      active = true;
    });
}

async function handleTap(symbolId, node) {
  if (!active) return;
  hapticTap();
  if (symbolId === commonId) {
    active = false;
    node.classList.add('correct');
    await highlightMatch(el('cardA'), el('cardB'), symbolId);
    showOverlay(commonSymbol && commonSymbol.image, commonSymbol && commonSymbol.emoji, '✅ Correct!', commonSymbol && commonSymbol.label);
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

prefetchAllSymbolImages();
nextRound();
