const el = (id) => document.getElementById(id);
const setupWrap = el('setupWrap');
const setup = el('setup');
const lobby = el('lobby');
const gameArea = el('gameArea');
const gameOver = el('gameOver');
const tapZone = el('tapZone');

const socket = io();

let mode = 'duo'; // 'solo' | 'duo'
let roomCode = null;
let hostToken = null;
let isHost = false;
let myName = null;
let players = [];
let totalRounds = 8;
let roundNumber = 0;
let phase = 'idle'; // 'idle' | 'waiting' | 'go' | 'resolved'

const REACTION_MIN_DELAY = 1200;
const REACTION_MAX_DELAY = 4500;

// --- Round-count picker ------------------------------------------------

const ROUND_PRESETS = [4, 6, 8, 12, 16];
(function renderRoundChips() {
  const container = el('roundChips');
  ROUND_PRESETS.forEach((n) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chip';
    btn.dataset.count = n;
    btn.textContent = n;
    if (n === 8) btn.classList.add('active');
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
  socket.emit('reaction:quickplay:join', { name }, (res) => {
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
  if (roomCode) socket.emit('reaction:host:cancel', { code: roomCode });
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

function amHost() {
  return mode === 'solo' || !!hostToken;
}

socket.on('reaction:players:update', (list) => {
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
  totalRounds = parseInt(el('roundsInput').value, 10) || 8;
  socket.emit('reaction:host:start', { code: roomCode, rounds: totalRounds });
});

socket.on('reaction:room:cancelled', () => {
  resetRoomState();
  lobby.classList.add('hidden');
  gameArea.classList.add('hidden');
  gameOver.classList.add('hidden');
  setup.classList.remove('hidden');
});

function updateDuelHud(activeName) {
  if (!players[0]) return;
  el('hudP1Name').textContent = players[0].name;
  el('hudP1Score').textContent = players[0].score;
  el('hudP1').classList.toggle('active', !!activeName && players[0].name === activeName);
  if (players[1]) {
    el('hudP2Name').textContent = players[1].name;
    el('hudP2Score').textContent = players[1].score;
    el('hudP2').classList.toggle('active', !!activeName && players[1].name === activeName);
  }
}

// --- Head-to-Head round lifecycle (server-driven) -------------------------

socket.on('reaction:round:start', (data) => {
  if (mode !== 'duo') return;
  roundNumber = data.roundNumber;
  totalRounds = data.totalRounds;
  players = data.players;
  phase = 'waiting';

  el('hudP2').classList.remove('hidden');
  setupWrap.classList.add('hidden');
  lobby.classList.add('hidden');
  gameOver.classList.add('hidden');
  gameArea.classList.remove('hidden');

  el('roundNum').textContent = roundNumber;
  el('totalRounds').textContent = totalRounds;
  updateDuelHud(null);

  tapZone.className = 'tap-zone waiting';
  el('tapZoneText').textContent = '✋ Wait for it…';
});

socket.on('reaction:go', () => {
  if (mode !== 'duo') return;
  phase = 'go';
  tapZone.className = 'tap-zone go';
  el('tapZoneText').textContent = '⚡ TAP NOW!';
  hapticTap();
});

tapZone.addEventListener('pointerdown', () => {
  if (mode === 'solo') return handleSoloTap();
  if (phase !== 'waiting' && phase !== 'go') return;
  socket.emit('reaction:tap', { code: roomCode });
  phase = 'resolved'; // optimistic local lock so a second local tap can't double-fire
});

socket.on('reaction:round:result', (data) => {
  if (mode !== 'duo') return;
  phase = 'resolved';
  players = data.players;
  updateDuelHud(null);

  const won = data.winnerName === myName;
  if (data.falseStart) {
    const iJumped = data.loserName === myName;
    tapZone.className = 'tap-zone resolved false-start';
    el('tapZoneText').textContent = iJumped ? '😅 Too soon! You jumped the gun.' : `😅 ${data.loserName} jumped the gun!`;
  } else if (won) {
    tapZone.className = 'tap-zone resolved win';
    el('tapZoneText').textContent = `⚡ You win! ${data.reactionMs}ms`;
    hapticSuccess();
    playSuccess();
  } else {
    tapZone.className = 'tap-zone resolved lose';
    el('tapZoneText').textContent = `${data.winnerName} was faster!`;
  }
});

socket.on('reaction:game:over', (data) => {
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
  socket.emit('reaction:host:start', { code: roomCode, rounds: totalRounds });
});

// --- Solo (local practice) mode -------------------------------------------

let soloName = 'You';
let soloRoundNumber = 0;
let soloTotalRounds = 8;
let soloTimes = [];
let soloGoAt = null;
let soloTimer = null;

el('soloStartBtn').addEventListener('click', () => {
  soloName = el('soloNameInput').value.trim() || 'You';
  soloTotalRounds = parseInt(el('roundsInput').value, 10) || 8;
  startSoloGame();
});

function startSoloGame() {
  soloRoundNumber = 0;
  soloTimes = [];
  players = [{ name: soloName, score: 0 }];

  setupWrap.classList.add('hidden');
  lobby.classList.add('hidden');
  gameOver.classList.add('hidden');
  gameArea.classList.remove('hidden');
  el('hudP2').classList.add('hidden');
  el('hudP1Name').textContent = soloName;
  el('hudP1').classList.remove('active');

  startSoloRound();
}

function startSoloRound() {
  clearTimeout(soloTimer);
  if (soloRoundNumber >= soloTotalRounds) return endSoloGame();

  soloRoundNumber += 1;
  phase = 'waiting';
  el('roundNum').textContent = soloRoundNumber;
  el('totalRounds').textContent = soloTotalRounds;
  tapZone.className = 'tap-zone waiting';
  el('tapZoneText').textContent = '✋ Wait for it…';

  const delay = REACTION_MIN_DELAY + Math.random() * (REACTION_MAX_DELAY - REACTION_MIN_DELAY);
  soloTimer = setTimeout(() => {
    phase = 'go';
    soloGoAt = Date.now();
    tapZone.className = 'tap-zone go';
    el('tapZoneText').textContent = '⚡ TAP NOW!';
    hapticTap();
  }, delay);
}

function handleSoloTap() {
  if (phase === 'waiting') {
    clearTimeout(soloTimer);
    phase = 'resolved';
    tapZone.className = 'tap-zone resolved false-start';
    el('tapZoneText').textContent = '😅 Too soon! Wait for the green.';
    setTimeout(startSoloRound, 1800);
    return;
  }
  if (phase !== 'go') return;

  phase = 'resolved';
  const reactionMs = Date.now() - soloGoAt;
  soloTimes.push(reactionMs);
  el('hudP1Score').textContent = `${reactionMs}ms`;
  tapZone.className = 'tap-zone resolved win';
  el('tapZoneText').textContent = `⚡ ${reactionMs}ms`;
  hapticSuccess();
  playSuccess();
  setTimeout(startSoloRound, 1400);
}

function soloBestKey(name) {
  return `reaction-solo-best-${name.trim().toLowerCase()}`;
}

function endSoloGame() {
  gameArea.classList.add('hidden');
  gameOver.classList.remove('hidden');
  el('playAgainBtn').classList.remove('hidden');
  el('finalBoard').classList.add('hidden');
  el('finalBoard').innerHTML = '';

  if (!soloTimes.length) {
    el('overTitle').textContent = 'No valid taps!';
    el('soloSummary').textContent = 'Every round was a false start — give it another go.';
    return;
  }

  const avg = Math.round(soloTimes.reduce((a, b) => a + b, 0) / soloTimes.length);
  const best = Math.min(...soloTimes);
  el('overTitle').textContent = '⚡ Practice Complete!';

  const key = soloBestKey(soloName);
  let bestEver = null;
  try {
    bestEver = JSON.parse(localStorage.getItem(key) || 'null');
  } catch (e) {
    bestEver = null;
  }
  const improved = !bestEver || avg < bestEver.avg;
  if (improved) {
    try {
      localStorage.setItem(key, JSON.stringify({ avg, best }));
    } catch (e) {
      // localStorage unavailable — best-tracking just won't persist
    }
    el('soloSummary').textContent = `Average ${avg}ms · Best ${best}ms — ${bestEver ? '🏆 New personal best average!' : '🏆 First run in the books!'}`;
  } else {
    el('soloSummary').textContent = `Average ${avg}ms · Best ${best}ms · Personal best average: ${bestEver.avg}ms`;
  }
}
