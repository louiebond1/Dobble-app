const el = (id) => document.getElementById(id);
let round = 0;
let commonId = null;
let active = false;

function nextRound() {
  el('feedback').textContent = '';
  fetch('/api/trial')
    .then((r) => r.json())
    .then((data) => {
      round += 1;
      commonId = data.commonId;
      active = true;
      el('roundNum').textContent = round;
      renderCard(el('cardA'), data.cardA, { onTap: handleTap });
      renderCard(el('cardB'), data.cardB, { onTap: handleTap });
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

nextRound();
