const el = (id) => document.getElementById(id);
let round = 0;
let commonId = null;
let active = false;

function nextRound() {
  el('feedback').textContent = '';
  active = false;
  fetch('/api/trial')
    .then((r) => r.json())
    .then(async (data) => {
      round += 1;
      commonId = data.commonId;
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

function handleTap(symbolId, node) {
  if (!active) return;
  if (symbolId === commonId) {
    active = false;
    node.classList.add('correct');
    el('feedback').textContent = '✅ Correct!';
    setTimeout(nextRound, 1200);
  } else {
    node.classList.add('wrong');
    setTimeout(() => node.classList.remove('wrong'), 400);
  }
}

prefetchAllSymbolImages();
nextRound();
