const el = (id) => document.getElementById(id);
const setupWrap = el('setupWrap');
const setup = el('setup');
const lobby = el('lobby');
const gameArea = el('gameArea');
const gameOver = el('gameOver');

const socket = io();

let mode = 'duo'; // 'solo' | 'duo'
let roomCode = null;
let hostToken = null;
let isHost = false;
let myName = null;
let players = [];
let totalRounds = 5;
let roundNumber = 0;
let roundActive = false;
let submitted = false;
let currentLetter = '';
let currentCategories = [];
let roundDeadline = null;
let tickTimer = null;

const BLITZ_ROUND_MS = 60000;
const CATEGORIES_PER_ROUND = 4;
let allCategories = [];
let allLetters = [];
fetch('/api/categories')
  .then((r) => r.json())
  .then((data) => {
    allCategories = data.categories || [];
    allLetters = data.letters || [];
  })
  .catch(() => {});

// --- Round-count picker ------------------------------------------------

const ROUND_PRESETS = [3, 5, 7, 10];
(function renderRoundChips() {
  const container = el('roundChips');
  ROUND_PRESETS.forEach((n) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chip';
    btn.dataset.count = n;
    btn.textContent = n;
    if (n === 5) btn.classList.add('active');
    btn.addEventListener('click', () => {
      container.querySelectorAll('.chip').forEach((c) => c.classList.toggle('active', c === btn));
      el('roundsInput').value = n;
    });
    container.appendChild(btn);
  });
})();

// --- Mode toggle ---------------------------------------------------------

document.querySelectorAll('#modeToggle .mode-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    mode = btn.dataset.mode;
    document.querySelectorAll('#modeToggle .mode-btn').forEach((b) => b.classList.toggle('active', b === btn));
    el('soloFields').classList.toggle('hidden', mode !== 'solo');
    el('duoFields').classList.toggle('hidden', mode !== 'duo');
  });
});

// --- Quick Play (Head-to-Head) --------------------------------------------

el('joinLouieBtn').addEventListener('click', () => quickPlayJoin('Louie'));
el('joinArielBtn').addEventListener('click', () => quickPlayJoin('Ariel'));

function quickPlayJoin(name) {
  socket.emit('blitz:quickplay:join', { name }, (res) => {
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
  if (roomCode) socket.emit('blitz:host:cancel', { code: roomCode });
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

let mashupMode = false;
let mashupAutoStarted = false;

function amHost() {
  return mode === 'solo' || !!hostToken;
}

socket.on('blitz:players:update', (list) => {
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

  if (mashupMode && amHost() && players.length >= 2 && !mashupAutoStarted) {
    mashupAutoStarted = true;
    socket.emit('blitz:host:start', { code: roomCode, rounds: 1 });
  }
}

el('startBtn').addEventListener('click', () => {
  if (!amHost() || !roomCode) return;
  totalRounds = parseInt(el('roundsInput').value, 10) || 5;
  socket.emit('blitz:host:start', { code: roomCode, rounds: totalRounds });
});

socket.on('blitz:room:cancelled', () => {
  resetRoomState();
  lobby.classList.add('hidden');
  gameArea.classList.add('hidden');
  gameOver.classList.add('hidden');
  setup.classList.remove('hidden');
});

function updateDuelHud() {
  if (!players[0]) return;
  el('hudP1Name').textContent = players[0].name;
  el('hudP1Score').textContent = players[0].score;
  if (players[1]) {
    el('hudP2Name').textContent = players[1].name;
    el('hudP2Score').textContent = players[1].score;
  }
}

function renderInputs(categories, letter) {
  const container = el('blitzCategories');
  container.innerHTML = '';
  categories.forEach((cat, i) => {
    const row = document.createElement('div');
    row.className = 'blitz-row';
    const label = document.createElement('label');
    label.textContent = cat;
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'blitz-input';
    input.dataset.index = i;
    input.maxLength = 30;
    input.placeholder = `Starts with ${letter}…`;
    input.autocomplete = 'off';
    row.appendChild(label);
    row.appendChild(input);
    container.appendChild(row);
  });
}

function readInputs() {
  return Array.from(el('blitzCategories').querySelectorAll('.blitz-input')).map((i) => i.value);
}

function startTicker() {
  clearInterval(tickTimer);
  tickTimer = setInterval(() => {
    const remaining = Math.max(0, Math.ceil((roundDeadline - Date.now()) / 1000));
    el('blitzTimer').textContent = `${remaining}s`;
    if (remaining <= 0) {
      clearInterval(tickTimer);
      if (!submitted) doSubmit();
    }
  }, 250);
}

el('blitzSubmitBtn').addEventListener('click', () => {
  if (!roundActive || submitted) return;
  doSubmit();
});

function doSubmit() {
  submitted = true;
  clearInterval(tickTimer);
  el('blitzCategories').querySelectorAll('.blitz-input').forEach((i) => { i.disabled = true; });
  el('blitzSubmitBtn').disabled = true;
  const answers = readInputs();
  if (mode === 'solo') return resolveSoloRound(answers);
  el('blitzStatus').textContent = '✅ Submitted — waiting for your partner…';
  socket.emit('blitz:submit', { code: roomCode, answers });
}

// --- Head-to-Head round lifecycle (server-driven) -------------------------

socket.on('blitz:round:start', (data) => {
  if (mode !== 'duo') return;
  roundNumber = data.roundNumber;
  totalRounds = data.totalRounds;
  players = data.players;
  roundActive = true;
  submitted = false;
  currentLetter = data.letter;
  currentCategories = data.categories;
  roundDeadline = data.deadline;

  el('hudP2').classList.remove('hidden');
  setupWrap.classList.add('hidden');
  lobby.classList.add('hidden');
  gameOver.classList.add('hidden');
  gameArea.classList.remove('hidden');

  el('roundNum').textContent = roundNumber;
  el('totalRounds').textContent = totalRounds;
  el('blitzLetter').textContent = currentLetter;
  el('blitzStatus').textContent = '';
  el('blitzReveal').classList.add('hidden');
  el('blitzReveal').innerHTML = '';
  el('blitzSubmitBtn').disabled = false;
  updateDuelHud();
  renderInputs(currentCategories, currentLetter);
  startTicker();
});

socket.on('blitz:opponent:locked', () => {
  if (mode !== 'duo' || submitted) return;
  el('blitzStatus').textContent = '🕐 Your partner has submitted — hurry up!';
});

socket.on('blitz:round:result', (data) => {
  if (mode !== 'duo') return;
  roundActive = false;
  clearInterval(tickTimer);
  players = data.players;
  updateDuelHud();
  el('blitzStatus').textContent = '';
  renderBreakdown(data.breakdown, [players[0] && players[0].name, players[1] && players[1].name]);
  setTimeout(() => {}, 0);
});

function renderBreakdown(breakdown, names) {
  const reveal = el('blitzReveal');
  reveal.classList.remove('hidden');
  reveal.innerHTML = breakdown
    .map((b) => {
      const rows = b.answers
        .map((ans, i) => {
          const pts = b.points[i] || 0;
          const label = names[i] || `Player ${i + 1}`;
          const text = ans && ans.trim() ? ans : '—';
          const cls = pts > 0 ? 'blitz-ans valid' : 'blitz-ans';
          return `<div class="${cls}"><span class="blitz-ans-name">${label}</span><span>${text}</span><span class="blitz-ans-pts">+${pts}</span></div>`;
        })
        .join('');
      return `<div class="blitz-reveal-cat"><div class="blitz-reveal-cat-title">${b.category}</div>${rows}</div>`;
    })
    .join('');
}

socket.on('blitz:game:over', (data) => {
  if (mashupMode) return reportMashupLegResult(socket, data.players);
  if (mode !== 'duo') return;
  gameArea.classList.add('hidden');
  gameOver.classList.remove('hidden');
  el('playAgainBtn').classList.toggle('hidden', !amHost());
  el('soloSummary').textContent = '';

  const [p1, p2] = data.players;
  let title;
  if (!p2 || p1.score === p2.score) title = "It's a tie! 🤝";
  else title = `${p1.score > p2.score ? p1.name : p2.name} wins! 🏆`;
  el('overTitle').textContent = title;
  el('finalBoard').classList.remove('hidden');
  renderLeaderboard('finalBoard', [...data.players].sort((a, b) => b.score - a.score));
});

el('playAgainBtn').addEventListener('click', () => {
  if (mode === 'solo') {
    gameOver.classList.add('hidden');
    startSoloGame();
    return;
  }
  if (!amHost() || !roomCode) return;
  gameOver.classList.add('hidden');
  socket.emit('blitz:host:start', { code: roomCode, rounds: totalRounds });
});

// --- Solo (local practice) mode -------------------------------------------

let soloName = 'You';
let soloTotalRounds = 5;
let soloScore = 0;

function pickRandomDistinct(arr, n) {
  const pool = arr.slice();
  const picked = [];
  while (picked.length < n && pool.length) {
    const i = Math.floor(Math.random() * pool.length);
    picked.push(pool.splice(i, 1)[0]);
  }
  return picked;
}

function scoreAnswer(text, letter) {
  const v = String(text || '').trim();
  return v.length > 0 && v[0].toUpperCase() === letter;
}

el('soloStartBtn').addEventListener('click', () => {
  if (!allCategories.length || !allLetters.length) return;
  soloName = el('soloNameInput').value.trim() || 'You';
  soloTotalRounds = parseInt(el('roundsInput').value, 10) || 5;
  startSoloGame();
});

function startSoloGame() {
  soloScore = 0;
  roundNumber = 0;
  totalRounds = soloTotalRounds;
  players = [{ name: soloName, score: 0 }];

  setupWrap.classList.add('hidden');
  lobby.classList.add('hidden');
  gameOver.classList.add('hidden');
  gameArea.classList.remove('hidden');
  el('hudP2').classList.add('hidden');
  el('hudP1Name').textContent = soloName;

  startSoloRound();
}

function startSoloRound() {
  if (roundNumber >= totalRounds) return endSoloGame();
  roundNumber += 1;
  roundActive = true;
  submitted = false;
  currentLetter = allLetters[Math.floor(Math.random() * allLetters.length)];
  currentCategories = pickRandomDistinct(allCategories, CATEGORIES_PER_ROUND);
  roundDeadline = Date.now() + BLITZ_ROUND_MS;

  el('roundNum').textContent = roundNumber;
  el('totalRounds').textContent = totalRounds;
  el('blitzLetter').textContent = currentLetter;
  el('blitzStatus').textContent = '';
  el('blitzReveal').classList.add('hidden');
  el('blitzReveal').innerHTML = '';
  el('blitzSubmitBtn').disabled = false;
  el('hudP1Score').textContent = soloScore;
  renderInputs(currentCategories, currentLetter);
  startTicker();
}

function resolveSoloRound(answers) {
  roundActive = false;
  const breakdown = currentCategories.map((cat, i) => {
    const ans = answers[i] || '';
    const valid = scoreAnswer(ans, currentLetter);
    const pts = valid ? 1 : 0;
    soloScore += pts;
    return { category: cat, answers: [ans], points: [pts] };
  });
  el('hudP1Score').textContent = soloScore;
  renderBreakdown(breakdown, [soloName]);
  setTimeout(startSoloRound, 3200);
}

function soloBestKey(name) {
  return `blitz-solo-best-${name.trim().toLowerCase()}-${totalRounds}`;
}

function endSoloGame() {
  gameArea.classList.add('hidden');
  gameOver.classList.remove('hidden');
  el('playAgainBtn').classList.remove('hidden');
  el('finalBoard').classList.add('hidden');
  el('finalBoard').innerHTML = '';

  const maxPossible = totalRounds * CATEGORIES_PER_ROUND;
  el('overTitle').textContent = '🎯 Practice Complete!';

  const key = soloBestKey(soloName);
  let bestEver = null;
  try {
    bestEver = JSON.parse(localStorage.getItem(key) || 'null');
  } catch (e) {
    bestEver = null;
  }
  const improved = !bestEver || soloScore > bestEver.score;
  if (improved) {
    try {
      localStorage.setItem(key, JSON.stringify({ score: soloScore, max: maxPossible }));
    } catch (e) {
      // localStorage unavailable — best-tracking just won't persist
    }
    el('soloSummary').textContent = `${soloScore} / ${maxPossible} points — ${bestEver ? '🏆 New personal best!' : '🏆 First run in the books!'}`;
  } else {
    el('soloSummary').textContent = `${soloScore} / ${maxPossible} points · Personal best: ${bestEver.score} / ${bestEver.max}`;
  }
}

// --- Party Mashup: auto-join and auto-start a single-round leg ------------
(function initMashup() {
  const mp = mashupParams();
  if (!mp) return;
  mashupMode = true;
  rewireMashupQuitLink();
  quickPlayJoin(mp.name);
})();
