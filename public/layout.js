// Registered on every page so solo-playable modes (Memory Match, Trial
// Mode, Hugo Pong) keep working with no signal once they've been opened
// at least once. Two-person modes still need a live connection to sync
// the other phone — this only covers the app shell + solo game data.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

// Scatters n symbols inside a circular card using a sunflower (phyllotaxis)
// distribution for the starting layout, then runs a collision-relaxation
// pass so symbols of different sizes never actually overlap — the sunflower
// formula alone only spaces out *centers*, not the varying footprints.
function layoutSymbols(n, containerSize) {
  const golden = Math.PI * (3 - Math.sqrt(5));
  const cardRadius = containerSize / 2;
  const edgeMargin = containerSize * 0.035; // clears the card's decorative inset rings
  const baseSize = containerSize * (0.585 / Math.sqrt(n));

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

// Tiny, dependency-free sound/haptics layer. Every call is best-effort — if the
// browser blocks audio (no user gesture yet) or doesn't support vibration, it
// just silently no-ops rather than breaking the game.
let _audioCtx = null;
function _tone(freq, durationMs, type = 'sine', volume = 0.14) {
  try {
    _audioCtx = _audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (_audioCtx.state === 'suspended') _audioCtx.resume();
    const osc = _audioCtx.createOscillator();
    const gain = _audioCtx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.value = volume;
    gain.gain.exponentialRampToValueAtTime(0.001, _audioCtx.currentTime + durationMs / 1000);
    osc.connect(gain).connect(_audioCtx.destination);
    osc.start();
    osc.stop(_audioCtx.currentTime + durationMs / 1000);
  } catch (e) {
    /* audio unavailable — ignore */
  }
}
function playTick() {
  _tone(880, 90, 'square', 0.08);
}
function playGo() {
  _tone(1320, 220, 'triangle', 0.16);
}
function playSuccess() {
  _tone(880, 110, 'sine', 0.13);
  setTimeout(() => _tone(1320, 160, 'sine', 0.13), 90);
}
function hapticTap() {
  try {
    if (navigator.vibrate) navigator.vibrate(15);
  } catch (e) {
    /* vibration unavailable — ignore */
  }
}
function hapticSuccess() {
  try {
    if (navigator.vibrate) navigator.vibrate([12, 40, 20]);
  } catch (e) {
    /* vibration unavailable — ignore */
  }
}

// A quick rising sweep for a throw's release — several close tones in fast
// succession reads as a "whoosh" without needing real noise synthesis.
function playWhoosh() {
  _tone(320, 70, 'sine', 0.06);
  setTimeout(() => _tone(460, 70, 'sine', 0.06), 35);
  setTimeout(() => _tone(600, 90, 'sine', 0.05), 70);
}
function playSplash() {
  _tone(200, 60, 'sine', 0.1);
  setTimeout(() => _tone(700, 140, 'triangle', 0.12), 40);
  setTimeout(() => _tone(1100, 180, 'sine', 0.1), 110);
}
function playMissThud() {
  _tone(180, 120, 'sine', 0.08);
}
function playCelebrate() {
  [660, 880, 1100, 1320].forEach((f, i) => setTimeout(() => _tone(f, 160, 'triangle', 0.13), i * 90));
}

// Briefly highlights the same symbol (by id) on both cards — the "spot it,
// tap it" payoff before the reveal modal appears. Resolves once the
// highlight has been visible long enough to register.
function highlightMatch(cardAEl, cardBEl, symbolId, durationMs = 480) {
  const nodes = [cardAEl, cardBEl]
    .map((el) => el && el.querySelector(`.symbol[data-id="${symbolId}"]`))
    .filter(Boolean);
  nodes.forEach((n) => n.classList.add('matched'));
  playSuccess();
  hapticSuccess();
  return new Promise((resolve) => {
    setTimeout(() => {
      nodes.forEach((n) => n.classList.remove('matched'));
      resolve();
    }, durationMs);
  });
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

// Runs a "3, 2, 1, GO!" countdown inside the given overlay element, resolving
// once the animation completes. GO! is a quick, punchy beat — not a slow step.
function showCountdown(overlay, numberEl) {
  return new Promise((resolve) => {
    if (!overlay || !numberEl) {
      resolve();
      return;
    }
    overlay.classList.remove('hidden');
    const steps = ['3', '2', '1', 'GO!'];
    let i = 0;
    const tick = () => {
      const isLast = i === steps.length - 1;
      numberEl.textContent = steps[i];
      numberEl.className = isLast ? 'countdown-go' : 'countdown-number';
      void numberEl.offsetWidth; // restart CSS animation
      numberEl.classList.add('play');
      if (isLast) playGo();
      else playTick();
      i += 1;
      if (i < steps.length) {
        setTimeout(tick, 650);
      } else {
        setTimeout(() => {
          overlay.classList.add('hidden');
          resolve();
        }, 380);
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

// Renders a scored leaderboard list — used for both the live "this game"
// leaderboard (valueKey 'score') and the "all-time" lifetime one (valueKey
// 'wins'). Rows may optionally carry avgTimeMs, shown as a small time badge.
function renderLeaderboard(targetId, rows, opts = {}) {
  const target = document.getElementById(targetId);
  if (!target) return;
  const valueKey = opts.valueKey || 'score';
  const labelFn = opts.labelFn || ((name) => name);
  const medals = ['🥇', '🥈', '🥉'];
  target.innerHTML = rows
    .map((p, i) => {
      const value = p[valueKey] || 0;
      const timeBadge =
        p.avgTimeMs != null ? `<span class="leaderboard-time">${(p.avgTimeMs / 1000).toFixed(1)}s avg</span>` : '';
      return `<div class="leaderboard-row"><span>${medals[i] || ''} ${labelFn(p.name)}</span><span class="leaderboard-value">${value}${timeBadge}</span></div>`;
    })
    .join('');
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
