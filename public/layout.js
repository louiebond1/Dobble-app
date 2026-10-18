// Registered on every page so solo-playable modes (Memory Match, Trial
// Mode) keep working with no signal once they've been opened at least
// once. Two-person modes still need a live connection to sync the other
// phone — this only covers the app shell + solo game data.
const partyStyle=document.createElement('link');partyStyle.rel='stylesheet';partyStyle.href='/party-ui.css?v=3';document.head.append(partyStyle);
window.addEventListener('DOMContentLoaded',()=>{
  if(location.pathname==='/'){
    document.body.classList.add('party-home');
    const heading=document.querySelector('h1');if(heading)heading.textContent='Our Favourite Things';
    document.querySelectorAll('.feature-card').forEach(a=>{
      const cover=document.createElement('div');cover.className='party-cover';cover.setAttribute('aria-hidden','true');
      const url=a.getAttribute('href');
      if(url==='/country-memory.html')cover.innerHTML='<img src="/country-memory/italy.png" alt="" loading="lazy">';
      else if(url==='/guesswho.html'){cover.classList.add('faces');cover.innerHTML=[8,14,10].map(n=>'<img src="/guesswho/'+String(n).padStart(2,'0')+'.webp?v=8" alt="" loading="lazy">').join('');}
      else{
        const palette=['#245743','#bd8647','#657c93'];const i=[...document.querySelectorAll('.feature-card')].indexOf(a);const colour=palette[i%3];
        const board='<rect x="20" y="8" width="110" height="90" rx="12" fill="#fffaf1" stroke="'+colour+'" stroke-width="2"/>';
        const covers={
          '#':'<circle cx="75" cy="52" r="45" fill="#fffaf1" stroke="'+colour+'" stroke-width="2"/><path d="M52 24l9 17-19-2zM91 65l12 14H81z" fill="'+colour+'"/><circle cx="96" cy="29" r="9" fill="#c48d4f"/><rect x="44" y="63" width="16" height="16" rx="3" fill="#657c93"/><path d="M75 44l8 8-8 8-8-8z" fill="#b66e5d"/>',
          '/draft-night.html':'<path d="M15 85l40-22 35 10 45-22v40H15z" fill="#95ad8f"/><path d="M48 53l29-28 30 28v33H48z" fill="#fffaf1" stroke="'+colour+'" stroke-width="3"/><path d="M40 54l37-34 38 34" fill="none" stroke="'+colour+'" stroke-width="6"/><rect x="72" y="62" width="14" height="24" fill="#c48d4f"/><circle cx="123" cy="22" r="10" fill="#e8be64"/>',
          '/memory':board+[0,1,2,3,4,5].map((n)=>'<rect x="'+(31+(n%3)*31)+'" y="'+(20+Math.floor(n/3)*37)+'" width="25" height="30" rx="4" fill="'+(n===1||n===4?'#c48d4f':colour)+'"/>').join(''),
          '/gofish':'<g transform="rotate(-12 55 50)"><rect x="25" y="12" width="58" height="80" rx="7" fill="'+colour+'"/></g><g transform="rotate(9 90 50)"><rect x="60" y="8" width="58" height="80" rx="7" fill="#fffaf1" stroke="'+colour+'" stroke-width="2"/><text x="68" y="29" font-size="18" fill="#b6604c">K</text><path d="M89 38l13 15-13 15-13-15z" fill="#b6604c"/></g>',
          '/ttt':board+'<path d="M57 17v72M93 17v72M30 40h90M30 65h90" stroke="'+colour+'" stroke-width="2"/><circle cx="75" cy="52" r="9" fill="none" stroke="#bd8647" stroke-width="4"/><path d="M34 22l12 12m0-12L34 34m65 41l12 12m0-12L99 87" stroke="'+colour+'" stroke-width="4"/>',
          '/puzzle':board+[1,2,3,4,5,6,7,8].map(n=>'<rect x="'+(31+((n-1)%3)*30)+'" y="'+(17+Math.floor((n-1)/3)*25)+'" width="25" height="21" rx="3" fill="'+colour+'"/><text x="'+(39+((n-1)%3)*30)+'" y="'+(33+Math.floor((n-1)/3)*25)+'" fill="#fffaf1" font-size="14">'+n+'</text>').join(''),
          '/countries':'<circle cx="75" cy="52" r="41" fill="#a6c0ce" stroke="'+colour+'" stroke-width="2"/><ellipse cx="75" cy="52" rx="20" ry="41" fill="none" stroke="'+colour+'"/><path d="M35 52h80M42 29h66M42 75h66" stroke="'+colour+'"/><path d="M55 31l20-6 17 17-8 19-14 5-12-16z" fill="#688a69"/>',
          '/draw':'<rect x="25" y="10" width="88" height="84" rx="7" fill="#fffaf1"/><path d="M44 65q10-45 35-18t20 8" fill="none" stroke="'+colour+'" stroke-width="4"/><path d="M90 74l30-48 8 5-29 49-13 9z" fill="#c48d4f"/>',
          '/reaction':'<circle cx="75" cy="55" r="35" fill="#fffaf1" stroke="'+colour+'" stroke-width="4"/><path d="M75 55V32m0 23l17 8M65 10h20M75 10v9" stroke="'+colour+'" stroke-width="5" stroke-linecap="round"/>',
          '/roulette':'<circle cx="75" cy="52" r="40" fill="#fffaf1" stroke="'+colour+'" stroke-width="3"/><path d="M75 12v80M35 52h80M47 24l56 56M47 80l56-56" stroke="'+colour+'" stroke-width="2"/><circle cx="75" cy="52" r="12" fill="#c48d4f"/><path d="M69 4h12l-6 15z" fill="#b6604c"/>'
        };
        cover.innerHTML='<svg viewBox="0 0 150 105">'+(covers[url]||board+'<text x="75" y="70" text-anchor="middle" font-family="Georgia" font-size="52" fill="'+colour+'">'+(url==='/scramble'?'Aa':url==='/predict'?'…':url==='/mashup'?'↔':'?')+'</text>')+'</svg>';
      }
      a.prepend(cover);
    });
    const shelf=document.querySelector('.feature-cards');
    const featured=['/country-memory.html','/guesswho.html','/draft-night.html','/gofish'];
    if(shelf)featured.slice().reverse().forEach(url=>{const card=shelf.querySelector('a[href="'+url+'"]');if(card)shelf.prepend(card);});
    const copy={
      '/country-memory.html':['Country Memory','Study a country, roll the die and test each other’s memory.'],
      '/guesswho.html':['Guess Who','Find their secret face. Ask aloud or type your own questions.'],
      '/draft-night.html':['Draft Night','Bid for items and compare what you build.'],
      '/mashup':['Party Mashup','A different game in every round.'],
      '/gofish':['Go Fish','Collect books. Play each other or the computer.'],
      '/memory':['Memory Match','Turn over the cards and find the pairs.']};
    document.querySelectorAll('.feature-card').forEach(a=>{const c=copy[a.getAttribute('href')];if(c){a.querySelector('.feature-card-title').textContent=c[0];a.querySelector('.feature-card-sub').textContent=c[1];}});
  }
  // Long setup forms use short pages, with all existing controls and listeners retained.
  const setup=document.getElementById('setup');
  if(setup&&setup.querySelectorAll(':scope > .field-group').length>=4){
    const groups=[...setup.querySelectorAll(':scope > .field-group')];
    const remaining=[...setup.children].filter(n=>!groups.includes(n));
    const final=document.createElement('div');remaining.forEach(n=>final.append(n));setup.append(final);
    const pages=[...groups,final],nav=document.createElement('div');nav.className='setup-pages';
    nav.innerHTML='<button type="button">Back</button><span></span><button type="button">Next</button>';setup.append(nav);
    let page=0;const buttons=nav.querySelectorAll('button');
    const paint=()=>{pages.forEach((g,i)=>g.classList.toggle('setup-page-hidden',i!==page));buttons[0].disabled=page===0;buttons[1].disabled=page===pages.length-1;nav.querySelector('span').textContent='Setup '+(page+1)+' of '+pages.length;};
    buttons[0].onclick=()=>{page=Math.max(0,page-1);paint();};buttons[1].onclick=()=>{page=Math.min(pages.length-1,page+1);paint();};paint();
  }
  const filters=document.getElementById('filtersPanel');
  if(filters){const groups=[...filters.querySelectorAll(':scope > .filter-group')];let index=0;const nav=document.createElement('div');nav.className='setup-pages';nav.innerHTML='<button type="button">Previous filter</button><span></span><button type="button">Next filter</button>';filters.insertBefore(nav,filters.querySelector('.surprise-toggle'));const buttons=nav.querySelectorAll('button');const paint=()=>{groups.forEach((g,i)=>g.classList.toggle('setup-page-hidden',i!==index));buttons[0].disabled=!index;buttons[1].disabled=index===groups.length-1;nav.querySelector('span').textContent=(index+1)+' / '+groups.length;};buttons[0].onclick=()=>{index--;paint();};buttons[1].onclick=()=>{index++;paint();};paint();}
});
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

// --- Party Mashup leg glue -------------------------------------------------
// Shared helpers used by every "duel"-style game when it's opened as a single
// leg of a Party Mashup match (?mashup=1&code=OURS in the URL) instead of
// being played standalone from its own setup screen. Keeping this in one
// place means each game only needs a few branch lines, not a full copy.

// Returns { code, name } if this page load is a mashup leg, else null.
function mashupParams() {
  const params = new URLSearchParams(location.search);
  if (params.get('mashup') !== '1') return null;
  const name = sessionStorage.getItem('mashupName');
  if (!name) return null;
  return { code: params.get('code') || 'OURS', name };
}

// Sends a "← Quit" link back to the mashup hub instead of this game's own
// setup screen, so leaving mid-leg doesn't strand the player.
function rewireMashupQuitLink() {
  const quit = document.querySelector('.duel-quit');
  if (quit) quit.href = '/mashup';
}

// Called from a game's own `*:game:over` handler when mashupMode is true.
// Works out the round's winner from the two-player score list every game's
// game:over payload already carries, reports it to the mashup room on the
// same already-connected socket, then hands control back to /mashup.
function reportMashupLegResult(socket, players) {
  const code = new URLSearchParams(location.search).get('code') || 'OURS';
  const [p1, p2] = players || [];
  let winnerName = null;
  if (p1 && p2 && p1.score !== p2.score) winnerName = p1.score > p2.score ? p1.name : p2.name;
  socket.emit('mashup:leg:result', { code, winnerName }, () => {
    window.location.href = `/mashup?code=${encodeURIComponent(code)}`;
  });
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
