// Scatters n symbols inside a circular card using a sunflower (phyllotaxis)
// distribution for the starting layout, then runs a collision-relaxation
// pass so symbols of different sizes never actually overlap — the sunflower
// formula alone only spaces out *centers*, not the varying footprints.
function layoutSymbols(n, containerSize) {
  const golden = Math.PI * (3 - Math.sqrt(5));
  const cardRadius = containerSize / 2;
  const edgeMargin = containerSize * 0.035; // clears the card's decorative inset rings
  const baseSize = containerSize * (0.52 / Math.sqrt(n));

  const items = [];
  for (let i = 0; i < n; i++) {
    // Tighter size variance (was ±18%) so symbols read as more uniform.
    const size = baseSize * (0.92 + Math.random() * 0.16);
    const rotation = Math.random() * 24 - 12;
    // Half-diagonal of the symbol's (rotated) square footprint — the true
    // distance its farthest corner can reach from its own center.
    const halfDiag = size * 0.5 * Math.SQRT2;
    const maxR = Math.max(0, cardRadius - halfDiag - edgeMargin);
    const r = maxR * Math.sqrt((i + 0.5) / n);
    const theta = i * golden + Math.random() * 0.5;
    items.push({
      x: cardRadius + r * Math.cos(theta),
      y: cardRadius + r * Math.sin(theta),
      size,
      rotation,
      maxR,
    });
  }

  // Push apart any symbols whose footprints collide, then re-clamp each
  // back inside its own safe radius. A few passes is enough to settle.
  const GAP = 1.1; // small breathing room beyond just-touching
  for (let pass = 0; pass < 30; pass++) {
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const a = items[i];
        const b = items[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 0.001;
        const minDist = ((a.size + b.size) / 2) * GAP;
        if (dist < minDist) {
          const push = (minDist - dist) / 2;
          const nx = dx / dist;
          const ny = dy / dist;
          a.x -= nx * push;
          a.y -= ny * push;
          b.x += nx * push;
          b.y += ny * push;
        }
      }
    }
    for (const it of items) {
      const dx = it.x - cardRadius;
      const dy = it.y - cardRadius;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > it.maxR && d > 0) {
        const scale = it.maxR / d;
        it.x = cardRadius + dx * scale;
        it.y = cardRadius + dy * scale;
      }
    }
  }

  return items.map(({ x, y, size, rotation }) => ({ x, y, size, rotation }));
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

// Fills a result-overlay frame with the actual symbol photo (big, so the
// "what was it" reveal is unmistakable), falling back to a large emoji.
function renderResultPhoto(frameEl, image, emoji, label) {
  frameEl.innerHTML = '';
  if (image) {
    const img = document.createElement('img');
    img.className = 'overlay-photo';
    img.alt = label || '';
    img.addEventListener(
      'error',
      () => {
        frameEl.innerHTML = '';
        const fallback = document.createElement('div');
        fallback.style.fontSize = '5rem';
        fallback.textContent = emoji || '';
        frameEl.appendChild(fallback);
      },
      { once: true }
    );
    img.src = image;
    frameEl.appendChild(img);
  } else {
    const div = document.createElement('div');
    div.style.fontSize = '5rem';
    div.textContent = emoji || '';
    frameEl.appendChild(div);
  }
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
