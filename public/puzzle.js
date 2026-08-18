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

const PUZZLE_SIZE = 3;
let currentOrder = [];
let currentImage = '';
let solved = false;
let startedAt = null;

let allPhotos = [];
fetch('/api/photos')
  .then((r) => r.json())
  .then((data) => { allPhotos = Array.isArray(data) ? data : []; })
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
  socket.emit('puzzle:quickplay:join', { name }, (res) => {
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
  if (roomCode) socket.emit('puzzle:host:cancel', { code: roomCode });
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

socket.on('puzzle:players:update', (list) => {
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
    socket.emit('puzzle:host:start', { code: roomCode, rounds: 1 });
  }
}

el('startBtn').addEventListener('click', () => {
  if (!amHost() || !roomCode) return;
  totalRounds = parseInt(el('roundsInput').value, 10) || 5;
  socket.emit('puzzle:host:start', { code: roomCode, rounds: totalRounds });
});

socket.on('puzzle:room:cancelled', () => {
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

// --- Sliding puzzle engine ---------------------------------------------

function neighborsOf(idx) {
  const row = Math.floor(idx / PUZZLE_SIZE);
  const col = idx % PUZZLE_SIZE;
  const list = [];
  if (row > 0) list.push(idx - PUZZLE_SIZE);
  if (row < PUZZLE_SIZE - 1) list.push(idx + PUZZLE_SIZE);
  if (col > 0) list.push(idx - 1);
  if (col < PUZZLE_SIZE - 1) list.push(idx + 1);
  return list;
}

function isSolved(order) {
  for (let i = 0; i < 8; i++) if (order[i] !== i) return false;
  return order[8] === null;
}

function shufflePuzzle(moves = 80) {
  const order = [0, 1, 2, 3, 4, 5, 6, 7, null];
  let blankIdx = order.indexOf(null);
  let lastMove = -1;
  for (let i = 0; i < moves; i++) {
    const candidates = neighborsOf(blankIdx).filter((c) => c !== lastMove);
    const swapWith = candidates[Math.floor(Math.random() * candidates.length)];
    [order[blankIdx], order[swapWith]] = [order[swapWith], order[blankIdx]];
    lastMove = blankIdx;
    blankIdx = swapWith;
  }
  return order;
}

function renderPuzzleBoard(order, image, onTileClick) {
  const board = el('puzzleBoard');
  board.innerHTML = '';
  order.forEach((val, i) => {
    const tile = document.createElement('div');
    tile.className = 'puzzle-tile';
    if (val == null) {
      tile.classList.add('blank');
    } else {
      const row = Math.floor(val / PUZZLE_SIZE);
      const col = val % PUZZLE_SIZE;
      tile.style.backgroundImage = `url(${image})`;
      tile.style.backgroundPosition = `${(col / (PUZZLE_SIZE - 1)) * 100}% ${(row / (PUZZLE_SIZE - 1)) * 100}%`;
      tile.addEventListener('click', () => onTileClick(i));
    }
    board.appendChild(tile);
  });
}

function attemptMove(index, onSolved) {
  if (solved) return;
  const blankIdx = currentOrder.indexOf(null);
  if (!neighborsOf(blankIdx).includes(index)) return;
  [currentOrder[blankIdx], currentOrder[index]] = [currentOrder[index], currentOrder[blankIdx]];
  renderPuzzleBoard(currentOrder, currentImage, (i) => attemptMove(i, onSolved));
  if (isSolved(currentOrder)) {
    solved = true;
    onSolved();
  }
}

// --- Head-to-Head round lifecycle (server-driven) -------------------------

socket.on('puzzle:round:start', (data) => {
  if (mode !== 'duo') return;
  roundNumber = data.roundNumber;
  totalRounds = data.totalRounds;
  players = data.players;
  currentOrder = data.order.slice();
  currentImage = data.image;
  solved = false;

  setupWrap.classList.add('hidden');
  lobby.classList.add('hidden');
  gameOver.classList.add('hidden');
  gameArea.classList.remove('hidden');

  el('roundNum').textContent = roundNumber;
  el('totalRounds').textContent = totalRounds;
  el('puzzleStatus').textContent = '';
  updateDuelHud();
  renderPuzzleBoard(currentOrder, currentImage, (i) =>
    attemptMove(i, () => {
      el('puzzleStatus').textContent = "✅ Solved! Waiting to see who was faster…";
      socket.emit('puzzle:solved', { code: roomCode });
    })
  );
});

socket.on('puzzle:round:result', (data) => {
  if (mode !== 'duo') return;
  players = data.players;
  updateDuelHud();
  if (data.timedOut) {
    el('puzzleStatus').textContent = "⏰ Time's up — neither of you solved it in time!";
  } else if (data.winnerName === myName) {
    el('puzzleStatus').textContent = '🎉 You solved it first!';
    hapticSuccess();
    playSuccess();
  } else {
    el('puzzleStatus').textContent = `${data.winnerName} solved it first!`;
  }
});

socket.on('puzzle:game:over', (data) => {
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
  socket.emit('puzzle:host:start', { code: roomCode, rounds: totalRounds });
});

// --- Solo (local practice) mode -------------------------------------------

let soloName = 'You';
let soloTotalRounds = 5;
let soloTimes = [];

el('soloStartBtn').addEventListener('click', () => {
  if (!allPhotos.length) return;
  soloName = el('soloNameInput').value.trim() || 'You';
  soloTotalRounds = parseInt(el('roundsInput').value, 10) || 5;
  startSoloGame();
});

function startSoloGame() {
  soloTimes = [];
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
  currentImage = allPhotos[Math.floor(Math.random() * allPhotos.length)].image;
  currentOrder = shufflePuzzle();
  solved = false;
  startedAt = Date.now();

  el('roundNum').textContent = roundNumber;
  el('totalRounds').textContent = totalRounds;
  el('puzzleStatus').textContent = '';
  el('hudP1Score').textContent = soloTimes.length;
  renderPuzzleBoard(currentOrder, currentImage, (i) =>
    attemptMove(i, () => {
      const elapsed = Date.now() - startedAt;
      soloTimes.push(elapsed);
      el('hudP1Score').textContent = soloTimes.length;
      el('puzzleStatus').textContent = `🎉 Solved in ${(elapsed / 1000).toFixed(1)}s!`;
      hapticSuccess();
      playSuccess();
      setTimeout(startSoloRound, 1600);
    })
  );
}

function soloBestKey(name) {
  return `puzzle-solo-best-${name.trim().toLowerCase()}-${totalRounds}`;
}

function endSoloGame() {
  gameArea.classList.add('hidden');
  gameOver.classList.remove('hidden');
  el('playAgainBtn').classList.remove('hidden');
  el('finalBoard').classList.add('hidden');
  el('finalBoard').innerHTML = '';

  if (!soloTimes.length) {
    el('overTitle').textContent = 'No rounds solved!';
    el('soloSummary').textContent = 'Give it another go.';
    return;
  }

  const avg = Math.round(soloTimes.reduce((a, b) => a + b, 0) / soloTimes.length);
  el('overTitle').textContent = '🧩 Practice Complete!';

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
      localStorage.setItem(key, JSON.stringify({ avg }));
    } catch (e) {
      // localStorage unavailable — best-tracking just won't persist
    }
    el('soloSummary').textContent = `Average ${(avg / 1000).toFixed(1)}s per puzzle — ${bestEver ? '🏆 New personal best average!' : '🏆 First run in the books!'}`;
  } else {
    el('soloSummary').textContent = `Average ${(avg / 1000).toFixed(1)}s per puzzle · Personal best: ${(bestEver.avg / 1000).toFixed(1)}s`;
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
