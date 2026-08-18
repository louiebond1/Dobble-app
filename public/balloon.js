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

const BALLOON_ROUND_MS = 12000;
let liveScore = 0;
let spawning = false;
let spawnTimer = null;
let tickTimer = null;

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
  socket.emit('balloon:quickplay:join', { name }, (res) => {
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
  if (roomCode) socket.emit('balloon:host:cancel', { code: roomCode });
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

socket.on('balloon:players:update', (list) => {
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
  totalRounds = parseInt(el('roundsInput').value, 10) || 5;
  socket.emit('balloon:host:start', { code: roomCode, rounds: totalRounds });
});

socket.on('balloon:room:cancelled', () => {
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

// --- Balloon arena engine ---------------------------------------------------

function spawnOne() {
  const arena = el('balloonArena');
  if (!arena) return;
  const isBomb = Math.random() < 0.22;
  const item = document.createElement('div');
  item.className = 'balloon-item' + (isBomb ? ' bomb' : '');
  item.textContent = isBomb ? '💣' : '🎈';
  item.style.left = `${6 + Math.random() * 84}%`;
  const duration = 2200 + Math.random() * 900;
  item.style.transition = `transform ${duration}ms linear`;
  arena.appendChild(item);

  requestAnimationFrame(() => {
    item.style.transform = `translateY(-${arena.clientHeight + 80}px)`;
  });

  const removeTimer = setTimeout(() => item.remove(), duration + 50);

  item.addEventListener(
    'pointerdown',
    (e) => {
      e.preventDefault();
      if (!spawning) return;
      clearTimeout(removeTimer);
      if (isBomb) {
        liveScore = Math.max(0, liveScore - 1);
        item.classList.add('popped-bomb');
      } else {
        liveScore += 1;
        item.classList.add('popped');
        hapticTap();
      }
      el('balloonLive').textContent = liveScore;
      item.style.pointerEvents = 'none';
      setTimeout(() => item.remove(), 160);
    },
    { once: true }
  );
}

function scheduleNextSpawn() {
  spawnTimer = setTimeout(() => {
    spawnOne();
    if (spawning) scheduleNextSpawn();
  }, 480 + Math.random() * 360);
}

function startArenaRound(durationMs, deadline) {
  el('balloonArena').innerHTML = '';
  liveScore = 0;
  el('balloonLive').textContent = '0';
  spawning = true;
  scheduleNextSpawn();

  clearInterval(tickTimer);
  tickTimer = setInterval(() => {
    const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
    el('balloonTimer').textContent = `${remaining}s`;
    if (remaining <= 0) endArenaRound();
  }, 250);
}

function endArenaRound() {
  if (!spawning) return;
  spawning = false;
  clearTimeout(spawnTimer);
  clearInterval(tickTimer);
  el('balloonArena').innerHTML = '';
  el('balloonTimer').textContent = 'Done!';

  if (mode === 'solo') {
    resolveSoloBalloonRound(liveScore);
    return;
  }
  socket.emit('balloon:score', { code: roomCode, score: liveScore });
}

// --- Head-to-Head round lifecycle (server-driven) -------------------------

socket.on('balloon:round:start', (data) => {
  if (mode !== 'duo') return;
  roundNumber = data.roundNumber;
  totalRounds = data.totalRounds;
  players = data.players;

  el('hudP2').classList.remove('hidden');
  setupWrap.classList.add('hidden');
  lobby.classList.add('hidden');
  gameOver.classList.add('hidden');
  gameArea.classList.remove('hidden');

  el('roundNum').textContent = roundNumber;
  el('totalRounds').textContent = totalRounds;
  updateDuelHud();
  startArenaRound(data.durationMs, data.deadline);
});

socket.on('balloon:round:result', (data) => {
  if (mode !== 'duo') return;
  players = data.players;
  updateDuelHud();
  const [a, b] = data.roundScores;
  if (a && b) {
    el('balloonTimer').textContent = a.popped === b.popped ? "Round tied!" : `${a.popped > b.popped ? a.name : b.name} won the round!`;
  }
});

socket.on('balloon:game:over', (data) => {
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
  socket.emit('balloon:host:start', { code: roomCode, rounds: totalRounds });
});

// --- Solo (local practice) mode -------------------------------------------

let soloName = 'You';
let soloTotalRounds = 5;
let soloScore = 0;
let soloBestSingleRound = 0;

el('soloStartBtn').addEventListener('click', () => {
  soloName = el('soloNameInput').value.trim() || 'You';
  soloTotalRounds = parseInt(el('roundsInput').value, 10) || 5;
  startSoloGame();
});

function startSoloGame() {
  soloScore = 0;
  soloBestSingleRound = 0;
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
  el('roundNum').textContent = roundNumber;
  el('totalRounds').textContent = totalRounds;
  el('hudP1Score').textContent = soloScore;
  startArenaRound(BALLOON_ROUND_MS, Date.now() + BALLOON_ROUND_MS);
}

function resolveSoloBalloonRound(score) {
  soloScore += score;
  soloBestSingleRound = Math.max(soloBestSingleRound, score);
  el('hudP1Score').textContent = soloScore;
  el('balloonTimer').textContent = `+${score} this round!`;
  setTimeout(startSoloRound, 1800);
}

function soloBestKey(name) {
  return `balloon-solo-best-${name.trim().toLowerCase()}-${totalRounds}`;
}

function endSoloGame() {
  gameArea.classList.add('hidden');
  gameOver.classList.remove('hidden');
  el('playAgainBtn').classList.remove('hidden');
  el('finalBoard').classList.add('hidden');
  el('finalBoard').innerHTML = '';

  el('overTitle').textContent = '🎈 Practice Complete!';

  const key = soloBestKey(soloName);
  let bestEver = null;
  try {
    bestEver = JSON.parse(localStorage.getItem(key) || 'null');
  } catch (e) {
    bestEver = null;
  }
  const improved = !bestEver || soloScore > bestEver.total;
  if (improved) {
    try {
      localStorage.setItem(key, JSON.stringify({ total: soloScore, best: soloBestSingleRound }));
    } catch (e) {
      // localStorage unavailable — best-tracking just won't persist
    }
    el('soloSummary').textContent = `${soloScore} popped total · Best round ${soloBestSingleRound} — ${bestEver ? '🏆 New personal best!' : '🏆 First run in the books!'}`;
  } else {
    el('soloSummary').textContent = `${soloScore} popped total · Best round ${soloBestSingleRound} · Personal best: ${bestEver.total} total`;
  }
}
