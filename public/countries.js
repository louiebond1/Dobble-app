const el = (id) => document.getElementById(id);
const setupWrap = el('setupWrap');
const setup = el('setup');
const lobby = el('lobby');
const gameArea = el('gameArea');
const gameOver = el('gameOver');
const learnArea = el('learnArea');

const socket = io();

let mode = 'duo'; // 'solo' | 'duo' | 'learn' (duo = co-op team, not competitive)
let roomCode = null;
let hostToken = null;
let isHost = false;
let myName = null;
let players = [];

let allCountries = [];
const countryById = new Map();
// id -> { main: dotEl, insetEl: dotEl|null, insetKey: string|null }
const markerEls = new Map();

// solo-only state
let foundIds = new Set();
let soloStartedAt = null;

// duo-only state
let revealedIds = new Set();
let timerHandle = null;

// learn-only state
let learnList = [];
let learnIndex = 0;
let learnActiveMarker = null;

fetch('/api/countries')
  .then((r) => r.json())
  .then((list) => {
    allCountries = Array.isArray(list) ? list : [];
    allCountries.forEach((c) => {
      countryById.set(c.id, c);
      c._norm = [c.name, ...c.aliases].map(normalizeGuess);
    });
  })
  .catch(() => {});

function amHost() {
  return mode === 'solo' || !!hostToken;
}

// --- Fuzzy country matching -------------------------------------------------
// Normalizes a raw guess (accents/punctuation/"Saint"-vs-"St"/"&"-vs-"and"
// stripped) and checks it against every not-yet-found country's name and
// aliases. Exact normalized matches win outright; otherwise a small
// Levenshtein-distance tolerance forgives typos, but only once the guess is
// at least as long as the candidate — that keeps "cha" from prematurely
// fuzzy-matching "Chad" while you're still mid-word.

function normalizeGuess(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\bst\.?\b/g, 'saint')
    .replace(/['‘’".,]/g, '')
    .replace(/[-_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function levenshtein(a, b) {
  if (a === b) return 0;
  const al = a.length;
  const bl = b.length;
  if (al === 0) return bl;
  if (bl === 0) return al;
  let prev = new Array(bl + 1);
  for (let j = 0; j <= bl; j++) prev[j] = j;
  for (let i = 1; i <= al; i++) {
    const cur = [i];
    for (let j = 1; j <= bl; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = cur;
  }
  return prev[bl];
}

// Exact matches (e.g. short aliases like "UK") are unambiguous regardless of
// length or typing progress, so this runs on every keystroke.
function exactMatchCountry(raw, excludeIds) {
  const guess = normalizeGuess(raw);
  if (!guess) return null;
  for (const c of allCountries) {
    if (excludeIds.has(c.id)) continue;
    if (c._norm.includes(guess)) return c;
  }
  return null;
}

// Typo-tolerant match via Levenshtein distance. Deliberately NOT run on every
// keystroke — a still-being-typed fragment ("vati…" on the way to "Vatican")
// can coincidentally sit one edit away from an unrelated short alias (Fiji's
// native name is "Viti"), so the caller only invokes this once typing has
// paused, at which point the current value is a "finished" guess rather than
// a fragment. A tie between two equally-close countries is treated as no
// match rather than guessing which one was meant.
function fuzzyMatchCountry(raw, excludeIds) {
  const guess = normalizeGuess(raw);
  if (guess.length < 4) return null;
  let best = null;
  let tie = false;
  for (const c of allCountries) {
    if (excludeIds.has(c.id)) continue;
    for (const norm of c._norm) {
      if (norm.length < 5) continue; // too short for typo tolerance to be meaningful
      if (Math.abs(guess.length - norm.length) > 2) continue;
      const threshold = norm.length <= 5 ? 1 : norm.length <= 9 ? 2 : 3;
      const dist = levenshtein(guess, norm);
      if (dist > threshold) continue;
      if (!best || dist < best.dist) {
        best = { country: c, dist };
        tie = false;
      } else if (dist === best.dist && best.country.id !== c.id) {
        tie = true;
      }
    }
  }
  return best && !tie ? best.country : null;
}

// --- Map + markers -----------------------------------------------------------
// Plain equirectangular projection matching the bundled world-map.svg
// (viewBox 0 0 1000 500 — a straight lng/lat -> x/y linear mapping), so
// marker percentages line up with the backdrop at any rendered size.

function project(lat, lng) {
  return { x: ((lng + 180) / 360) * 100, y: ((90 - lat) / 180) * 100 };
}

// Best-effort: some browsers (mostly Android Chrome, especially as an
// installed PWA) will actually rotate the screen for us. Where that's not
// supported (notably iOS Safari, which never lets a page do this) it just
// silently fails — the CSS rotate-lock overlay still blocks landscape play
// once the player rotates the phone themselves.
function tryLockPortrait() {
  try {
    if (screen.orientation && screen.orientation.lock) {
      screen.orientation.lock('portrait').catch(() => {});
    }
  } catch (e) {
    /* orientation lock unsupported — ignore */
  }
}

// Regions where 197 evenly-spread dots collapse into an unreadable clump on
// any flat world map at phone size — Sporcle solves this with zoomed inset
// panels, so we do too. Each country whose centroid falls in a box also gets
// a second, larger marker rendered inside that inset. Unlike the main map
// (true lat/lng position), inset markers are laid out in a plain packed
// grid, not geographic scatter — a physics-style repulsion pass still left
// residual overlap in the densest region (Europe, 47 countries); a grid
// guarantees even spacing by construction, matching how Sporcle's own inset
// panels read (a tidy lattice, not a scatter plot).
const INSETS = [
  { key: 'europe', latMin: 34, latMax: 71, lngMin: -11, lngMax: 42, aspect: 46 / 56 },
  { key: 'caribbean', latMin: 7, latMax: 27, lngMin: -85, lngMax: -59, aspect: 32 / 38 },
  { key: 'gulf', latMin: 20, latMax: 31, lngMin: 44, lngMax: 58, aspect: 25 / 28 },
];

function findInset(lat, lng) {
  return INSETS.find((r) => lat >= r.latMin && lat <= r.latMax && lng >= r.lngMin && lng <= r.lngMax) || null;
}

// Even grid packing: pick a column count that roughly matches the panel's
// own aspect ratio, then place item i at the center of its cell. Guarantees
// uniform spacing regardless of count — no overlap is possible by
// construction, unlike a physics-relaxation approach.
function gridPosition(index, count, aspect) {
  const cols = Math.max(1, Math.round(Math.sqrt(count * aspect)));
  const rows = Math.ceil(count / cols);
  const col = index % cols;
  const row = Math.floor(index / cols);
  return {
    x: ((col + 0.5) / cols) * 100,
    y: ((row + 0.5) / rows) * 100,
  };
}

// Reveal order can bunch labels close together in the same inset (found
// nearly at once, or just geographically adjacent) — reset per game so
// placeInsetLabel() below has a clean slate to pack into.
const insetLabelRects = { europe: [], caribbean: [], gulf: [] };

function buildMarkers() {
  const container = el('countryMarkers');
  container.innerHTML = '';
  markerEls.clear();
  INSETS.forEach((r) => { insetLabelRects[r.key] = []; });

  const insetContainers = {};
  const insetLists = {};
  INSETS.forEach((r) => {
    const c = document.querySelector(`[data-inset-markers="${r.key}"]`);
    if (c) c.innerHTML = '';
    insetContainers[r.key] = c;
    insetLists[r.key] = [];
  });

  const placements = [];
  for (const c of allCountries) {
    const { x, y } = project(c.lat, c.lng);
    const inset = findInset(c.lat, c.lng);
    const entry = { country: c, mainPos: { x, y }, inset: inset && inset.key };
    if (inset) insetLists[inset.key].push(entry);
    placements.push(entry);
  }

  INSETS.forEach((r) => {
    const list = insetLists[r.key].sort((a, b) => a.country.name.localeCompare(b.country.name));
    list.forEach((entry, i) => {
      entry.insetPos = gridPosition(i, list.length, r.aspect);
    });
  });

  for (const entry of placements) {
    const dot = document.createElement('div');
    dot.className = 'country-marker';
    dot.style.left = entry.mainPos.x + '%';
    dot.style.top = entry.mainPos.y + '%';
    container.appendChild(dot);

    const markerEntry = { main: dot, insetEl: null, insetKey: null };
    if (entry.inset && insetContainers[entry.inset]) {
      const insetDot = document.createElement('div');
      insetDot.className = 'country-marker';
      insetDot.style.left = entry.insetPos.x + '%';
      insetDot.style.top = entry.insetPos.y + '%';
      insetContainers[entry.inset].appendChild(insetDot);
      markerEntry.insetEl = insetDot;
      markerEntry.insetKey = entry.inset;
    }
    markerEls.set(entry.country.id, markerEntry);
  }
}

// Even with grid-packed dots, the TEXT labels next to them can still
// collide — a country name is much wider than its own dot's cell, so two
// labels whose dots sit in neighboring cells can still overlap into an
// unreadable mess (this is what actually made insets unreadable, not dot
// spacing). Real per-label collision avoidance: place a label at its dot,
// measure its real rendered size, and if it overlaps anything already
// placed in that inset this game, nudge it straight down in fixed steps
// until it doesn't. Guarantees zero overlap by construction, same as
// gridPosition() does for the dots themselves.
function placeInsetLabel(label, container, xPct, yPct, rects) {
  const rect = container.getBoundingClientRect();
  label.style.left = '0px';
  label.style.top = '0px';
  label.style.transform = 'none';
  label.style.margin = '0';
  container.appendChild(label);

  const w = label.offsetWidth;
  const h = label.offsetHeight;
  let x = (xPct / 100) * rect.width - w / 2;
  let y = (yPct / 100) * rect.height - h - 3;

  const overlaps = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  const step = h + 1;
  let guard = 0;
  while (guard < 60 && rects.some((r) => overlaps({ x, y, w, h }, r))) {
    y += step;
    guard++;
  }

  // Horizontal is clamped (the box never scrolls sideways). Vertical is
  // only floor-clamped — a box that's genuinely full grows scrollable
  // rather than the last few labels getting forced back into overlap.
  x = Math.max(1, Math.min(x, rect.width - w - 1));
  y = Math.max(1, y);

  label.style.left = x + 'px';
  label.style.top = y + 'px';
  rects.push({ x, y, w, h });
}

function revealMarker(id, ownerName) {
  const entry = markerEls.get(id);
  const country = countryById.get(id);
  if (!entry || !country) return;
  const mine = mode === 'duo' && ownerName === myName;

  entry.main.classList.add('found');
  entry.main.classList.toggle('mine', mine);
  if (entry.insetEl) {
    entry.insetEl.classList.add('found');
    entry.insetEl.classList.toggle('mine', mine);
  }

  // The label is a permanent record on the map (like Sporcle) — it outlives
  // the dot(s), which pop and vanish almost immediately, so it's appended as
  // its own sibling rather than nested inside one. It goes wherever there's
  // actually room to read it: the zoomed inset copy when one exists,
  // otherwise the main map position.
  const label = document.createElement('div');
  label.className = 'country-marker-label';
  label.textContent = country.name;

  if (entry.insetEl) {
    label.classList.add('country-marker-label--inset');
    const host = document.querySelector(`[data-inset-markers="${entry.insetKey}"]`);
    const xPct = parseFloat(entry.insetEl.style.left);
    const yPct = parseFloat(entry.insetEl.style.top);
    placeInsetLabel(label, host, xPct, yPct, insetLabelRects[entry.insetKey]);
  } else {
    label.style.left = entry.main.style.left;
    label.style.top = entry.main.style.top;
    el('countryMarkers').appendChild(label);
  }

  setTimeout(() => {
    entry.main.remove();
    if (entry.insetEl) entry.insetEl.remove();
    markerEls.delete(id);
  }, 550);
}

function addFeedItem(name, byName) {
  const feed = el('countryFeed');
  const item = document.createElement('div');
  item.className = 'country-feed-item';
  if (byName) {
    const by = document.createElement('span');
    by.className = 'country-feed-by';
    by.textContent = byName;
    item.appendChild(by);
    item.appendChild(document.createTextNode(' found ' + name));
  } else {
    item.textContent = name;
  }
  feed.appendChild(item);
}

// --- Guess input -------------------------------------------------------------

function applyMatch(match) {
  el('guessInput').value = '';
  if (mode === 'solo') {
    handleSoloFound(match);
  } else {
    socket.emit('countries:guess', { code: roomCode, countryId: match.id }, () => {});
  }
}

let fuzzyTimer = null;

el('guessInput').addEventListener('input', () => {
  clearTimeout(fuzzyTimer);
  const excluded = mode === 'solo' ? foundIds : revealedIds;
  const exact = exactMatchCountry(el('guessInput').value, excluded);
  if (exact) {
    applyMatch(exact);
    return;
  }
  // Give typing a brief pause before treating the current value as a
  // "finished" guess eligible for typo-tolerant fuzzy matching.
  const snapshot = el('guessInput').value;
  fuzzyTimer = setTimeout(() => {
    if (el('guessInput').value !== snapshot) return; // kept typing — not finished yet
    const excludedNow = mode === 'solo' ? foundIds : revealedIds;
    const fuzzy = fuzzyMatchCountry(snapshot, excludedNow);
    if (fuzzy) applyMatch(fuzzy);
  }, 450);
});

// --- Mode toggle ---------------------------------------------------------

document.querySelectorAll('#modeToggle .mode-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    mode = btn.dataset.mode;
    document.querySelectorAll('#modeToggle .mode-btn').forEach((b) => b.classList.toggle('active', b === btn));
    el('learnFields').classList.toggle('hidden', mode !== 'learn');
    el('soloFields').classList.toggle('hidden', mode !== 'solo');
    el('duoFields').classList.toggle('hidden', mode !== 'duo');
  });
});

// --- Learn mode (untimed flashcard-style study) -----------------------------

const CONTINENTS = ['All', 'Africa', 'Americas', 'Asia', 'Europe', 'Oceania'];
let learnContinent = 'All';
(function renderContinentChips() {
  const container = el('continentChips');
  CONTINENTS.forEach((name) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chip';
    btn.textContent = name;
    if (name === 'All') btn.classList.add('active');
    btn.addEventListener('click', () => {
      container.querySelectorAll('.chip').forEach((c) => c.classList.toggle('active', c === btn));
      learnContinent = name;
    });
    container.appendChild(btn);
  });
})();

el('learnStartBtn').addEventListener('click', () => {
  if (!allCountries.length) return;
  startLearnMode();
});

function startLearnMode() {
  mode = 'learn';
  const pool = learnContinent === 'All' ? allCountries : allCountries.filter((c) => c.region === learnContinent);
  learnList = pool.slice();
  learnIndex = 0;

  setupWrap.classList.add('hidden');
  lobby.classList.add('hidden');
  gameOver.classList.add('hidden');
  learnArea.classList.remove('hidden');

  tryLockPortrait();
  buildLearnMarkers();
  showLearnCard();
}

// The full 197-country reference stays visible (dim) behind the one active,
// pulsing marker, so location sinks in relative to neighboring countries
// rather than in isolation.
function buildLearnMarkers() {
  const container = el('learnMarkers');
  container.innerHTML = '';
  learnActiveMarker = null;
  for (const c of allCountries) {
    const { x, y } = project(c.lat, c.lng);
    const dot = document.createElement('div');
    dot.className = 'country-marker';
    dot.style.left = x + '%';
    dot.style.top = y + '%';
    dot.style.opacity = '0.35';
    container.appendChild(dot);
  }
}

function showLearnCard() {
  if (!learnList.length) return;
  const country = learnList[learnIndex];
  el('learnCountryName').textContent = country.name;
  el('learnCountryRegion').textContent = country.region;
  el('learnProgress').textContent = `${learnIndex + 1} / ${learnList.length}`;

  if (learnActiveMarker) learnActiveMarker.remove();
  const { x, y } = project(country.lat, country.lng);
  const marker = document.createElement('div');
  marker.className = 'country-learn-marker';
  marker.style.left = x + '%';
  marker.style.top = y + '%';
  el('learnMarkers').appendChild(marker);
  learnActiveMarker = marker;
}

el('learnPrevBtn').addEventListener('click', () => {
  if (!learnList.length) return;
  learnIndex = (learnIndex - 1 + learnList.length) % learnList.length;
  showLearnCard();
});

el('learnNextBtn').addEventListener('click', () => {
  if (!learnList.length) return;
  learnIndex = (learnIndex + 1) % learnList.length;
  showLearnCard();
});

el('learnShuffleBtn').addEventListener('click', () => {
  for (let i = learnList.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [learnList[i], learnList[j]] = [learnList[j], learnList[i]];
  }
  learnIndex = 0;
  showLearnCard();
});

// --- Quick Play (Team Up) --------------------------------------------------

el('joinLouieBtn').addEventListener('click', () => quickPlayJoin('Louie'));
el('joinArielBtn').addEventListener('click', () => quickPlayJoin('Ariel'));

function quickPlayJoin(name) {
  socket.emit('countries:quickplay:join', { name }, (res) => {
    if (!res || !res.ok) return;
    isHost = res.isHost;
    hostToken = res.hostToken || null;
    roomCode = res.code;
    myName = res.name;
    setup.classList.add('hidden');
    lobby.classList.remove('hidden');
  });
}

el('lobbyBackBtn').addEventListener('click', () => {
  if (roomCode) socket.emit('countries:host:cancel', { code: roomCode });
  resetRoomState();
  lobby.classList.add('hidden');
  setup.classList.remove('hidden');
});

function resetRoomState() {
  roomCode = null;
  hostToken = null;
  isHost = false;
  myName = null;
}

socket.on('countries:players:update', (list) => {
  players = list;
  updateLobby();
});

function updateLobby() {
  el('playerCount').textContent = players.length;
  el('startBtn').classList.toggle('hidden', !amHost());
  el('startBtn').disabled = players.length < 2;
  if (amHost()) {
    el('lobbyHint').textContent = 'Waiting for at least one more player to join…';
    el('lobbyHint').classList.toggle('hidden', players.length >= 2);
  } else {
    el('lobbyHint').textContent = 'Waiting for the host to start the game…';
    el('lobbyHint').classList.remove('hidden');
  }
  el('playerList').innerHTML = players
    .map((p) => `<li>${p.name === myName ? `${p.name} (You)` : p.name}</li>`)
    .join('');
}

el('startBtn').addEventListener('click', () => {
  if (!amHost() || !roomCode) return;
  socket.emit('countries:host:start', { code: roomCode });
});

socket.on('countries:room:cancelled', () => {
  resetRoomState();
  lobby.classList.add('hidden');
  gameArea.classList.add('hidden');
  gameOver.classList.add('hidden');
  setup.classList.remove('hidden');
});

// Team mode has no "vs" score board — both players contribute to one
// shared total, shown in the same HUD slot solo mode uses for its own count.
function updateTeamHud() {
  const total = players.reduce((sum, p) => sum + (p.score || 0), 0);
  el('hudP1Name').textContent = 'Team';
  el('hudP1Score').textContent = total;
}

// --- Timer display -----------------------------------------------------------

function formatClock(ms) {
  const total = Math.max(0, Math.round(ms / 1000));
  const mm = Math.floor(total / 60);
  const ss = total % 60;
  return `⏱ ${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

function startCountdown(deadline) {
  clearInterval(timerHandle);
  const tick = () => {
    el('timerDisplay').textContent = formatClock(deadline - Date.now());
  };
  tick();
  timerHandle = setInterval(tick, 500);
}

function startElapsedClock(startedAt) {
  clearInterval(timerHandle);
  const tick = () => {
    el('timerDisplay').textContent = formatClock(Date.now() - startedAt);
  };
  tick();
  timerHandle = setInterval(tick, 500);
}

function updateProgress(count) {
  el('countryProgress').textContent = `${count} / ${allCountries.length}`;
}

// --- Team Up lifecycle (server-driven, co-op) -------------------------------

socket.on('countries:game:start', (data) => {
  mode = 'duo';
  players = data.players;
  revealedIds = new Set();

  setupWrap.classList.add('hidden');
  lobby.classList.add('hidden');
  gameOver.classList.add('hidden');
  gameArea.classList.remove('hidden');
  el('hudP2').classList.add('hidden');
  el('giveUpBtn').classList.toggle('hidden', !amHost());
  el('countryFeed').innerHTML = '';
  el('guessInput').value = '';

  tryLockPortrait();
  buildMarkers();
  updateTeamHud();
  updateProgress(revealedIds.size);
  startCountdown(data.deadline);
  el('guessInput').focus();
});

socket.on('countries:reveal', (data) => {
  players = data.players;
  updateTeamHud();
  revealedIds.add(data.countryId);
  updateProgress(revealedIds.size);
  revealMarker(data.countryId, data.byName);
  const country = countryById.get(data.countryId);
  addFeedItem(country ? country.name : data.countryId, data.byName);
  if (data.byName === myName) {
    hapticSuccess();
    playSuccess();
  }
});

socket.on('countries:game:over', (data) => {
  clearInterval(timerHandle);
  players = data.players;
  showGameOver(new Set(data.claimedIds || []), data.reason);
});

el('giveUpBtn').addEventListener('click', () => {
  if (mode === 'solo') {
    endSoloGame('given-up');
  } else if (amHost() && roomCode) {
    socket.emit('countries:host:end', { code: roomCode });
  }
});

el('playAgainBtn').addEventListener('click', () => {
  if (mode === 'solo') {
    gameOver.classList.add('hidden');
    startSoloGame();
    return;
  }
  if (!amHost() || !roomCode) return;
  gameOver.classList.add('hidden');
  socket.emit('countries:host:start', { code: roomCode });
});

// --- Solo (local, untimed practice) mode -----------------------------------

el('soloStartBtn').addEventListener('click', () => {
  if (!allCountries.length) return;
  myName = el('soloNameInput').value.trim() || 'You';
  startSoloGame();
});

function startSoloGame() {
  mode = 'solo';
  foundIds = new Set();
  players = [{ name: myName, score: 0 }];
  soloStartedAt = Date.now();

  setupWrap.classList.add('hidden');
  lobby.classList.add('hidden');
  gameOver.classList.add('hidden');
  gameArea.classList.remove('hidden');
  el('hudP2').classList.add('hidden');
  el('hudP1Name').textContent = myName;
  el('hudP1Score').textContent = '0';
  el('giveUpBtn').classList.remove('hidden');
  el('countryFeed').innerHTML = '';
  el('guessInput').value = '';

  tryLockPortrait();
  buildMarkers();
  updateProgress(0);
  startElapsedClock(soloStartedAt);
  el('guessInput').focus();
}

function handleSoloFound(country) {
  foundIds.add(country.id);
  updateProgress(foundIds.size);
  revealMarker(country.id, myName);
  addFeedItem(country.name, null);
  el('hudP1Score').textContent = foundIds.size;
  hapticSuccess();
  playSuccess();
  if (foundIds.size >= allCountries.length) endSoloGame('complete');
}

function endSoloGame(reason) {
  clearInterval(timerHandle);
  showGameOver(foundIds, reason);
}

// --- Shared end screen ---------------------------------------------------

function showGameOver(foundOrClaimedIds, reason) {
  gameArea.classList.add('hidden');
  gameOver.classList.remove('hidden');
  el('playAgainBtn').classList.toggle('hidden', mode === 'duo' && !amHost());
  el('soloSummary').textContent = '';
  el('finalBoard').classList.add('hidden');
  el('finalBoard').innerHTML = '';

  if (mode === 'solo') {
    const elapsed = Date.now() - soloStartedAt;
    const complete = foundOrClaimedIds.size >= allCountries.length;
    el('overTitle').textContent = complete ? '🗺️ All 197 found!' : '🗺️ Practice Complete!';
    el('soloSummary').textContent = `${foundOrClaimedIds.size} / ${allCountries.length} found in ${formatClock(elapsed).replace('⏱ ', '')}`;
  } else {
    const total = players.reduce((sum, p) => sum + (p.score || 0), 0);
    const complete = total >= allCountries.length;
    el('overTitle').textContent = complete
      ? '🌍 Found all 197 as a team!'
      : `🌍 Team found ${total} / ${allCountries.length}!`;
    const reasonText =
      reason === 'complete' ? 'Every country found!' : reason === 'timeout' ? "Time's up!" : 'Ended early.';
    const breakdown = players.map((p) => `${p.name}: ${p.score}`).join(' · ');
    el('soloSummary').textContent = `${reasonText} ${breakdown}`;
  }

  const missed = allCountries.filter((c) => !foundOrClaimedIds.has(c.id)).map((c) => c.name).sort();
  el('missedCount').textContent = missed.length;
  el('missedList').textContent = missed.length ? missed.join(', ') : '— none, nice! —';
}
