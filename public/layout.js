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

// Preloads every image a round needs and resolves once all are ready (or
// after a timeout), so the reveal never has to show a pop-in/loading state.
function preloadRoundImages(symbols, timeoutMs = 4000) {
  const urls = symbols.map((s) => s.image).filter(Boolean);
  if (!urls.length) return Promise.resolve();
  const loaders = urls.map(
    (url) =>
      new Promise((resolve) => {
        const img = new Image();
        img.onload = resolve;
        img.onerror = resolve;
        img.src = url;
      })
  );
  return Promise.race([Promise.all(loaders), new Promise((r) => setTimeout(r, timeoutMs))]);
}

// Runs a "3, 2, 1, 💥" countdown inside the given overlay element, resolving
// once the animation completes.
function showCountdown(overlay, numberEl) {
  return new Promise((resolve) => {
    if (!overlay || !numberEl) {
      resolve();
      return;
    }
    overlay.classList.remove('hidden');
    const steps = ['3', '2', '1', '💥'];
    let i = 0;
    const tick = () => {
      const isLast = i === steps.length - 1;
      numberEl.textContent = steps[i];
      numberEl.className = isLast ? 'countdown-boom' : 'countdown-number';
      void numberEl.offsetWidth; // restart CSS animation
      numberEl.classList.add('play');
      i += 1;
      if (i < steps.length) {
        setTimeout(tick, 650);
      } else {
        setTimeout(() => {
          overlay.classList.add('hidden');
          resolve();
        }, 400);
      }
    };
    tick();
  });
}

// Clears both cards, plays the countdown while preloading the round's
// images in parallel, then reveals both cards fully loaded and instant.
async function revealRound(overlay, numberEl, cardAEl, cardBEl, cardASymbols, cardBSymbols, onTap) {
  cardAEl.innerHTML = '';
  cardBEl.innerHTML = '';
  await Promise.all([
    showCountdown(overlay, numberEl),
    preloadRoundImages([...cardASymbols, ...cardBSymbols]),
  ]);
  renderCard(cardAEl, cardASymbols, { onTap });
  renderCard(cardBEl, cardBSymbols, { onTap });
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
