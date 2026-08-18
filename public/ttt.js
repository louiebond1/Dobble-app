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
let myMark = null;
let players = [];
let totalRounds = 5;
let roundNumber = 0;

const TTT_LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

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
  socket.emit('ttt:quickplay:join', { name }, (res) => {
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
  if (roomCode) socket.emit('ttt:host:cancel', { code: roomCode });
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

socket.on('ttt:players:update', (list) => {
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
  socket.emit('ttt:host:start', { code: roomCode, rounds: totalRounds });
});

socket.on('ttt:room:cancelled', () => {
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

// --- Board rendering ---------------------------------------------------

function renderBoard(board, onCellClick) {
  const boardEl = el('tttBoard');
  boardEl.innerHTML = '';
  board.forEach((mark, i) => {
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'ttt-cell';
    cell.textContent = mark || '';
    if (mark) cell.classList.add(mark === 'X' ? 'mark-x' : 'mark-o');
    if (!mark && onCellClick) cell.addEventListener('click', () => onCellClick(i));
    else cell.disabled = true;
    boardEl.appendChild(cell);
  });
}

function highlightWinLine(line) {
  if (!line) return;
  const cells = el('tttBoard').querySelectorAll('.ttt-cell');
  line.forEach((i) => cells[i] && cells[i].classList.add('win-cell'));
}

// --- Head-to-Head round lifecycle (server-driven) -------------------------

socket.on('ttt:round:start', (data) => {
  if (mode !== 'duo') return;
  roundNumber = data.roundNumber;
  totalRounds = data.totalRounds;
  players = data.players;
  myMark = data.xName === myName ? 'X' : 'O';

  setupWrap.classList.add('hidden');
  lobby.classList.add('hidden');
  gameOver.classList.add('hidden');
  gameArea.classList.remove('hidden');

  el('roundNum').textContent = roundNumber;
  el('totalRounds').textContent = totalRounds;
  updateDuelHud(data.turnName);
  el('tttStatus').textContent = data.turnName === myName ? 'Your turn' : `${data.turnName}'s turn`;
  renderBoard(data.board, (i) => {
    if (data.turnName !== myName) return;
    socket.emit('ttt:move', { code: roomCode, index: i });
  });
});

socket.on('ttt:state', (data) => {
  if (mode !== 'duo') return;
  updateDuelHud(data.turnName);
  el('tttStatus').textContent = data.turnName === myName ? 'Your turn' : `${data.turnName}'s turn`;
  renderBoard(data.board, (i) => {
    if (data.turnName !== myName) return;
    socket.emit('ttt:move', { code: roomCode, index: i });
  });
});

socket.on('ttt:round:result', (data) => {
  if (mode !== 'duo') return;
  players = data.players;
  updateDuelHud(null);
  renderBoard(data.board, null);
  highlightWinLine(data.line);
  if (data.draw) el('tttStatus').textContent = "🤝 It's a draw!";
  else if (data.winnerName === myName) {
    el('tttStatus').textContent = '🎉 You won this one!';
    hapticSuccess();
    playSuccess();
  } else el('tttStatus').textContent = `${data.winnerName} won this one!`;
});

socket.on('ttt:game:over', (data) => {
  if (mode !== 'duo') return;
  gameArea.classList.add('hidden');
  gameOver.classList.remove('hidden');
  el('playAgainBtn').classList.toggle('hidden', !amHost());
  el('soloSummary').textContent = '';

  const [p1, p2] = data.players;
  let title;
  if (!p2 || p1.score === p2.score) title = "It's a tie! 🤝";
  else title = `${p1.score > p2.score ? p1.name : p2.name} wins the match! 🏆`;
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
  socket.emit('ttt:host:start', { code: roomCode, rounds: totalRounds });
});

// --- Solo vs CPU (local minimax) -------------------------------------------

let soloName = 'You';
let soloTotalRounds = 5;
let soloBoard = Array(9).fill(null);
let soloTurn = 'X';
let soloGameActive = false;

function ttWinnerLocal(board) {
  for (const [a, b, c] of TTT_LINES) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return { mark: board[a], line: [a, b, c] };
  }
  return null;
}

function minimax(board, isMaximizing) {
  const win = ttWinnerLocal(board);
  if (win) return { score: win.mark === 'O' ? 1 : -1 };
  if (board.every((c) => c)) return { score: 0 };

  const moves = [];
  board.forEach((cell, idx) => {
    if (cell) return;
    const next = board.slice();
    next[idx] = isMaximizing ? 'O' : 'X';
    const result = minimax(next, !isMaximizing);
    moves.push({ idx, score: result.score });
  });
  moves.sort((a, b) => (isMaximizing ? b.score - a.score : a.score - b.score));
  return { score: moves[0].score, idx: moves[0].idx };
}

el('soloStartBtn').addEventListener('click', () => {
  soloName = el('soloNameInput').value.trim() || 'You';
  soloTotalRounds = parseInt(el('roundsInput').value, 10) || 5;
  startSoloGame();
});

function startSoloGame() {
  roundNumber = 0;
  totalRounds = soloTotalRounds;
  players = [{ name: soloName, score: 0 }, { name: 'CPU', score: 0 }];

  setupWrap.classList.add('hidden');
  lobby.classList.add('hidden');
  gameOver.classList.add('hidden');
  gameArea.classList.remove('hidden');
  el('hudP2').classList.remove('hidden');

  startSoloRound();
}

function startSoloRound() {
  if (roundNumber >= totalRounds) return endSoloGame();
  roundNumber += 1;
  soloBoard = Array(9).fill(null);
  soloGameActive = true;
  // Alternate who goes first each game, same as the duo match.
  const playerFirst = (roundNumber - 1) % 2 === 0;
  soloTurn = 'X';

  el('roundNum').textContent = roundNumber;
  el('totalRounds').textContent = totalRounds;
  updateDuelHud(playerFirst ? soloName : 'CPU');
  el('tttStatus').textContent = playerFirst ? 'Your turn' : "CPU's turn";
  renderBoard(soloBoard, handleSoloCellClick);

  if (!playerFirst) setTimeout(runCpuTurn, 500);
}

function handleSoloCellClick(index) {
  if (!soloGameActive || soloTurn !== 'X' || soloBoard[index]) return;
  soloBoard[index] = 'X';
  renderBoard(soloBoard, handleSoloCellClick);
  if (checkSoloGameEnd()) return;
  soloTurn = 'O';
  el('tttStatus').textContent = "CPU's turn";
  updateDuelHud('CPU');
  setTimeout(runCpuTurn, 500);
}

function runCpuTurn() {
  if (!soloGameActive) return;
  const { idx } = minimax(soloBoard, true);
  if (idx == null) return;
  soloBoard[idx] = 'O';
  renderBoard(soloBoard, handleSoloCellClick);
  if (checkSoloGameEnd()) return;
  soloTurn = 'X';
  el('tttStatus').textContent = 'Your turn';
  updateDuelHud(soloName);
}

function checkSoloGameEnd() {
  const win = ttWinnerLocal(soloBoard);
  const draw = !win && soloBoard.every((c) => c);
  if (!win && !draw) return false;

  soloGameActive = false;
  renderBoard(soloBoard, null);
  if (win) highlightWinLine(win.line);

  if (win && win.mark === 'X') {
    players[0].score += 1;
    el('tttStatus').textContent = '🎉 You won this one!';
    hapticSuccess();
    playSuccess();
  } else if (win) {
    players[1].score += 1;
    el('tttStatus').textContent = '🤖 CPU won this one!';
  } else {
    el('tttStatus').textContent = "🤝 It's a draw!";
  }
  updateDuelHud(null);
  setTimeout(startSoloRound, 2200);
  return true;
}

function soloBestKey(name) {
  return `ttt-solo-best-${name.trim().toLowerCase()}-${totalRounds}`;
}

function endSoloGame() {
  gameArea.classList.add('hidden');
  gameOver.classList.remove('hidden');
  el('playAgainBtn').classList.remove('hidden');
  el('finalBoard').classList.remove('hidden');
  renderLeaderboard('finalBoard', [...players].sort((a, b) => b.score - a.score));

  const wins = players[0].score;
  el('overTitle').textContent = wins > players[1].score ? '🏆 You beat the CPU!' : wins === players[1].score ? "🤝 Tied with the CPU!" : '🤖 The CPU got you this time.';

  const key = soloBestKey(soloName);
  let bestEver = null;
  try {
    bestEver = JSON.parse(localStorage.getItem(key) || 'null');
  } catch (e) {
    bestEver = null;
  }
  const improved = !bestEver || wins > bestEver.wins;
  if (improved) {
    try {
      localStorage.setItem(key, JSON.stringify({ wins, total: totalRounds }));
    } catch (e) {
      // localStorage unavailable — best-tracking just won't persist
    }
    el('soloSummary').textContent = `${wins} / ${totalRounds} games won — ${bestEver ? '🏆 New personal best!' : '🏆 First run in the books!'}`;
  } else {
    el('soloSummary').textContent = `${wins} / ${totalRounds} games won · Personal best: ${bestEver.wins} / ${bestEver.total}`;
  }
}
