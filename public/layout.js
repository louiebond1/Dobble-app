// Scatters n symbols inside a circular card using a sunflower (phyllotaxis)
// distribution so they don't overlap, with slight random size/rotation
// variance for a hand-made Dobble-card feel.
function layoutSymbols(n, containerSize) {
  const golden = Math.PI * (3 - Math.sqrt(5));
  const radius = containerSize / 2 * 0.78;
  const baseSize = containerSize * (0.54 / Math.sqrt(n));
  const positions = [];
  for (let i = 0; i < n; i++) {
    const r = radius * Math.sqrt((i + 0.5) / n);
    const theta = i * golden + Math.random() * 0.5;
    const x = containerSize / 2 + r * Math.cos(theta);
    const y = containerSize / 2 + r * Math.sin(theta);
    const size = baseSize * (0.82 + Math.random() * 0.36);
    const rotation = Math.random() * 30 - 15;
    positions.push({ x, y, size, rotation });
  }
  return positions;
}

// Warms the browser's image cache for every symbol up front (called during the
// lobby/waiting screen) so rounds don't stall on network fetches once the game starts.
function prefetchAllSymbolImages() {
  fetch('/api/symbols')
    .then((r) => r.json())
    .then((symbols) => {
      symbols.forEach((sym) => {
        if (!sym.image) return;
        const img = new Image();
        img.src = sym.image;
      });
    })
    .catch(() => {});
}

function renderCard(el, cardSymbols, { onTap } = {}) {
  el.innerHTML = '';
  const size = el.clientWidth || el.getBoundingClientRect().width;
  const order = cardSymbols
    .map((s) => s)
    .sort(() => Math.random() - 0.5);
  const positions = layoutSymbols(order.length, size);
  order.forEach((sym, i) => {
    const pos = positions[i];
    const div = document.createElement('div');
    div.className = 'symbol';
    div.dataset.id = String(sym.id);
    div.style.left = pos.x + 'px';
    div.style.top = pos.y + 'px';
    div.style.width = pos.size + 'px';
    div.style.height = pos.size + 'px';
    div.style.transform = `translate(-50%, -50%) rotate(${pos.rotation}deg)`;

    const makeEmoji = () => {
      const emojiDiv = document.createElement('div');
      emojiDiv.className = 'symbol-emoji';
      emojiDiv.style.fontSize = pos.size * 0.72 + 'px';
      emojiDiv.textContent = sym.emoji;
      return emojiDiv;
    };

    if (sym.image) {
      const img = document.createElement('img');
      img.className = 'symbol-image';
      img.alt = sym.label;
      img.title = sym.label;
      img.loading = 'eager';
      img.fetchPriority = 'high';
      img.addEventListener('load', () => img.classList.add('loaded'), { once: true });
      img.addEventListener('error', () => img.replaceWith(makeEmoji()), { once: true });
      img.src = sym.image;
      if (img.complete) img.classList.add('loaded');
      div.appendChild(img);
    } else {
      div.title = sym.label;
      div.appendChild(makeEmoji());
    }

    if (onTap) div.addEventListener('click', () => onTap(sym.id, div));
    el.appendChild(div);
  });
}
