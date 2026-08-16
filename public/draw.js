const el = (id) => document.getElementById(id);
const setupWrap = el('setupWrap');
const setup = el('setup');
const lobby = el('lobby');
const gameArea = el('gameArea');
const gameOver = el('gameOver');

const socket = io();

let roomCode = null;
let hostToken = null;
let isHost = false;
let myName = null;
let players = [];
let totalRounds = 8;
let roundNumber = 0;
let drawerName = null;
let myRole = null; // 'drawer' | 'guesser'
let roundDeadline = null;
let timerInterval = null;
let currentColor = '#2c2138';
let drawing = false;
let eraserMode = false;
let strokes = []; // finalized strokes: { tool: 'pen'|'eraser', color, points: [{x,y},...] }
let activeStroke = null; // in-progress stroke, mine or the remote drawer's

const PEN_WIDTH = 4;
const ERASER_WIDTH = 16;

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

// --- Quick Play ----------------------------------------------------------

el('drawLouieBtn').addEventListener('click', () => quickPlayJoin('Louie'));
el('drawArielBtn').addEventListener('click', () => quickPlayJoin('Ariel'));

function quickPlayJoin(name) {
  socket.emit('draw:quickplay:join', { name }, (res) => {
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
  if (roomCode) socket.emit('draw:host:cancel', { code: roomCode });
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
  return !!hostToken;
}

socket.on('draw:players:update', (list) => {
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
  socket.emit('draw:host:start', { code: roomCode, rounds: totalRounds });
});

socket.on('draw:room:cancelled', () => {
  resetRoomState();
  lobby.classList.add('hidden');
  gameArea.classList.add('hidden');
  gameOver.classList.add('hidden');
  setup.classList.remove('hidden');
});

// --- Canvas drawing engine -----------------------------------------------

const canvas = el('drawCanvas');
const ctx = canvas.getContext('2d');

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.round(rect.width * dpr));
  canvas.height = Math.max(1, Math.round(rect.height * dpr));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 4;
}

function cssSize() {
  const rect = canvas.getBoundingClientRect();
  return { w: rect.width, h: rect.height };
}

function clearCanvas() {
  const { w, h } = cssSize();
  ctx.clearRect(0, 0, w, h);
}

function resetStrokes() {
  strokes = [];
  activeStroke = null;
}

function pointFromEvent(e) {
  const rect = canvas.getBoundingClientRect();
  return { x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height };
}

function applyTool(tool, color) {
  if (tool === 'eraser') {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.lineWidth = ERASER_WIDTH;
  } else {
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = color || currentColor;
    ctx.lineWidth = PEN_WIDTH;
  }
}

function beginStroke(nx, ny, tool, color) {
  const { w, h } = cssSize();
  ctx.beginPath();
  applyTool(tool, color);
  ctx.moveTo(nx * w, ny * h);
  // Draw a dot for a single tap (no move before release)
  ctx.lineTo(nx * w + 0.01, ny * h + 0.01);
  ctx.stroke();
}

function continueStroke(nx, ny) {
  const { w, h } = cssSize();
  ctx.lineTo(nx * w, ny * h);
  ctx.stroke();
}

// Replays the full stroke history from scratch — used for undo, since
// pixels erased by the eraser can't be un-erased any other way than
// redrawing everything up to (but not including) the removed stroke.
function redrawAll() {
  clearCanvas();
  strokes.forEach((s) => {
    if (!s.points.length) return;
    beginStroke(s.points[0].x, s.points[0].y, s.tool, s.color);
    for (let i = 1; i < s.points.length; i++) continueStroke(s.points[i].x, s.points[i].y);
  });
  ctx.globalCompositeOperation = 'source-over';
}

canvas.addEventListener('pointerdown', (e) => {
  if (myRole !== 'drawer') return;
  drawing = true;
  canvas.setPointerCapture(e.pointerId);
  const p = pointFromEvent(e);
  const tool = eraserMode ? 'eraser' : 'pen';
  activeStroke = { tool, color: currentColor, points: [{ x: p.x, y: p.y }] };
  beginStroke(p.x, p.y, tool, currentColor);
  socket.emit('draw:stroke', { code: roomCode, type: 'start', tool, color: currentColor, x: p.x, y: p.y });
});

canvas.addEventListener('pointermove', (e) => {
  if (myRole !== 'drawer' || !drawing) return;
  const p = pointFromEvent(e);
  if (activeStroke) activeStroke.points.push({ x: p.x, y: p.y });
  continueStroke(p.x, p.y);
  socket.emit('draw:stroke', { code: roomCode, type: 'move', x: p.x, y: p.y });
});

function endStroke() {
  if (myRole !== 'drawer' || !drawing) return;
  drawing = false;
  if (activeStroke) {
    strokes.push(activeStroke);
    activeStroke = null;
  }
  socket.emit('draw:stroke', { code: roomCode, type: 'end' });
}
canvas.addEventListener('pointerup', endStroke);
canvas.addEventListener('pointercancel', endStroke);
canvas.addEventListener('pointerleave', endStroke);

document.querySelectorAll('.color-swatch').forEach((btn) => {
  btn.addEventListener('click', () => {
    currentColor = btn.dataset.color;
    eraserMode = false;
    el('eraserBtn').classList.remove('active');
    document.querySelectorAll('.color-swatch').forEach((b) => b.classList.toggle('active', b === btn));
  });
});

el('eraserBtn').addEventListener('click', () => {
  eraserMode = !eraserMode;
  el('eraserBtn').classList.toggle('active', eraserMode);
});

el('undoBtn').addEventListener('click', () => {
  if (myRole !== 'drawer' || !strokes.length) return;
  strokes.pop();
  redrawAll();
  socket.emit('draw:undo', { code: roomCode });
});

el('clearCanvasBtn').addEventListener('click', () => {
  if (myRole !== 'drawer') return;
  resetStrokes();
  clearCanvas();
  socket.emit('draw:clear', { code: roomCode });
});

el('skipWordBtn').addEventListener('click', () => {
  if (myRole !== 'drawer') return;
  socket.emit('draw:skip', { code: roomCode });
});

socket.on('draw:stroke', (data) => {
  if (data.type === 'start') {
    activeStroke = { tool: data.tool || 'pen', color: data.color, points: [{ x: data.x, y: data.y }] };
    beginStroke(data.x, data.y, activeStroke.tool, activeStroke.color);
  } else if (data.type === 'move') {
    if (activeStroke) activeStroke.points.push({ x: data.x, y: data.y });
    continueStroke(data.x, data.y);
  } else if (data.type === 'end' && activeStroke) {
    strokes.push(activeStroke);
    activeStroke = null;
  }
});

socket.on('draw:clear', () => {
  resetStrokes();
  clearCanvas();
});

socket.on('draw:undo', () => {
  strokes.pop();
  redrawAll();
});

// --- Round lifecycle -------------------------------------------------

socket.on('draw:round:start', (data) => {
  roundNumber = data.roundNumber;
  totalRounds = data.totalRounds;
  players = data.players;
  drawerName = data.drawerName;
  roundDeadline = data.deadline;
  myRole = myName === drawerName ? 'drawer' : 'guesser';

  setupWrap.classList.add('hidden');
  lobby.classList.add('hidden');
  gameOver.classList.add('hidden');
  gameArea.classList.remove('hidden');

  el('roundNum').textContent = roundNumber;
  el('totalRounds').textContent = totalRounds;
  el('guessFeed').innerHTML = '';
  el('guessInput').value = '';

  resetStrokes();
  eraserMode = false;
  el('eraserBtn').classList.remove('active');
  requestAnimationFrame(() => {
    resizeCanvas();
    clearCanvas();
  });

  applyRoleUI(data.word);
  updateDrawHud();
  startCountdown();
});

function applyRoleUI(word) {
  const banner = el('wordBanner');
  el('drawerToolbar').classList.toggle('hidden', myRole !== 'drawer');
  el('guesserRow').classList.toggle('hidden', myRole !== 'guesser');
  el('drawRoleBadge').textContent = myRole === 'drawer' ? '🎨 You\'re drawing!' : '🤔 Your turn to guess!';

  if (myRole === 'drawer') {
    banner.textContent = `✏️ Draw: ${word}`;
    banner.classList.remove('guesser');
  } else {
    banner.textContent = `🤔 Guess what ${drawerName} is drawing!`;
    banner.classList.add('guesser');
  }
}

function updateDrawHud() {
  if (!players[0]) return;
  el('hudP1Name').textContent = players[0].name;
  el('hudP1Score').textContent = players[0].score;
  el('hudP1').classList.toggle('active', players[0].name === drawerName);
  if (players[1]) {
    el('hudP2Name').textContent = players[1].name;
    el('hudP2Score').textContent = players[1].score;
    el('hudP2').classList.toggle('active', players[1].name === drawerName);
  }
}

function startCountdown() {
  clearInterval(timerInterval);
  const tick = () => {
    const remaining = Math.max(0, Math.round((roundDeadline - Date.now()) / 1000));
    const m = Math.floor(remaining / 60);
    const s = String(remaining % 60).padStart(2, '0');
    const timerEl = el('drawTimer');
    timerEl.textContent = `${m}:${s}`;
    timerEl.classList.toggle('low', remaining <= 15);
  };
  tick();
  timerInterval = setInterval(tick, 500);
}

socket.on('draw:word:skipped', (data) => {
  roundDeadline = data.deadline;
  if (myRole === 'drawer') {
    el('wordBanner').textContent = `✏️ Draw: ${data.word}`;
  }
  resetStrokes();
  clearCanvas();
  startCountdown();
});

el('guessSubmitBtn').addEventListener('click', submitGuess);
el('guessInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') submitGuess();
});

function submitGuess() {
  const text = el('guessInput').value.trim();
  if (!text || myRole !== 'guesser') return;
  socket.emit('draw:guess', { code: roomCode, text });
  el('guessInput').value = '';
}

socket.on('draw:guess', (data) => {
  addGuessBubble(`${data.name}: ${data.text}`, data.correct);
});

function addGuessBubble(text, correct) {
  const feed = el('guessFeed');
  const bubble = document.createElement('div');
  bubble.className = correct ? 'guess-bubble correct' : 'guess-bubble';
  bubble.textContent = correct ? `✅ ${text} — correct!` : text;
  feed.appendChild(bubble);
  feed.scrollTop = feed.scrollHeight;
}

socket.on('draw:round:result', (data) => {
  clearInterval(timerInterval);
  players = data.players;
  updateDrawHud();
  if (data.timedOut) {
    addGuessBubble(`⏰ Time's up! It was "${data.word}"`, false);
  }
  hapticSuccess();
  playSuccess();
});

socket.on('draw:game:over', (data) => {
  clearInterval(timerInterval);
  gameArea.classList.add('hidden');
  gameOver.classList.remove('hidden');
  el('playAgainBtn').classList.toggle('hidden', !amHost());

  const [p1, p2] = data.players;
  let title;
  if (!p2 || p1.score === p2.score) title = "It's a tie! 🤝";
  else title = `${p1.score > p2.score ? p1.name : p2.name} wins! 🏆`;
  el('overTitle').textContent = title;
  renderLeaderboard('finalBoard', [...data.players].sort((a, b) => b.score - a.score));
});

el('playAgainBtn').addEventListener('click', () => {
  if (!amHost() || !roomCode) return;
  gameOver.classList.add('hidden');
  socket.emit('draw:host:start', { code: roomCode, rounds: totalRounds });
});

window.addEventListener('resize', () => {
  if (!gameArea.classList.contains('hidden')) resizeCanvas();
});
