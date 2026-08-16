const el = (id) => document.getElementById(id);
const setupWrap = el('setupWrap');
const setup = el('setup');
const lobby = el('lobby');
const gameArea = el('gameArea');
const gameOver = el('gameOver');
const tapZone = el('tapZone');

const socket = io();

let roomCode = null;
let hostToken = null;
let isHost = false;
let myName = null;
let players = [];
let totalRounds = 8;
let roundNumber = 0;
let phase = 'idle'; // 'idle' | 'waiting' | 'go' | 'resolved'

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
  return !!hostToken;
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

// --- Round lifecycle -------------------------------------------------

socket.on('reaction:round:start', (data) => {
  roundNumber = data.roundNumber;
  totalRounds = data.totalRounds;
  players = data.players;
  phase = 'waiting';

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
  phase = 'go';
  tapZone.className = 'tap-zone go';
  el('tapZoneText').textContent = '⚡ TAP NOW!';
  hapticTap();
});

tapZone.addEventListener('pointerdown', () => {
  if (phase !== 'waiting' && phase !== 'go') return;
  socket.emit('reaction:tap', { code: roomCode });
  phase = 'resolved'; // optimistic local lock so a second local tap can't double-fire
});

socket.on('reaction:round:result', (data) => {
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
  socket.emit('reaction:host:start', { code: roomCode, rounds: totalRounds });
});
