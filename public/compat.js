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
let totalRounds = 10;
let roundNumber = 0;
let roundActive = false;
let myChoice = null;
let inSyncCount = 0;

// --- Round-count picker ------------------------------------------------

const ROUND_PRESETS = [6, 10, 14, 20];
(function renderRoundChips() {
  const container = el('roundChips');
  ROUND_PRESETS.forEach((n) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chip';
    btn.dataset.count = n;
    btn.textContent = n;
    if (n === 10) btn.classList.add('active');
    btn.addEventListener('click', () => {
      container.querySelectorAll('.chip').forEach((c) => c.classList.toggle('active', c === btn));
      el('roundsInput').value = n;
    });
    container.appendChild(btn);
  });
})();

// --- Quick Play --------------------------------------------------------

el('joinLouieBtn').addEventListener('click', () => quickPlayJoin('Louie'));
el('joinArielBtn').addEventListener('click', () => quickPlayJoin('Ariel'));

function quickPlayJoin(name) {
  socket.emit('compat:quickplay:join', { name }, (res) => {
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
  if (roomCode) socket.emit('compat:host:cancel', { code: roomCode });
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

let players = [];
socket.on('compat:players:update', (list) => {
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
  totalRounds = parseInt(el('roundsInput').value, 10) || 10;
  socket.emit('compat:host:start', { code: roomCode, rounds: totalRounds });
});

socket.on('compat:room:cancelled', () => {
  resetRoomState();
  lobby.classList.add('hidden');
  gameArea.classList.add('hidden');
  gameOver.classList.add('hidden');
  setup.classList.remove('hidden');
});

// --- Round lifecycle (server-driven) ---------------------------------------

socket.on('compat:round:start', (data) => {
  roundNumber = data.roundNumber;
  totalRounds = data.totalRounds;
  players = data.players;
  roundActive = true;
  myChoice = null;

  setupWrap.classList.add('hidden');
  lobby.classList.add('hidden');
  gameOver.classList.add('hidden');
  gameArea.classList.remove('hidden');

  el('roundNum').textContent = roundNumber;
  el('totalRounds').textContent = totalRounds;
  el('roundsPlayed').textContent = roundNumber - 1;
  el('compatStatus').textContent = '';
  el('compatReveal').classList.add('hidden');
  el('compatReveal').innerHTML = '';

  el('compatQuestionText').textContent = data.question;
  const optionsEl = el('compatOptions');
  optionsEl.innerHTML = '';
  data.options.forEach((text, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'trivia-option';
    btn.textContent = text;
    btn.addEventListener('click', () => submitAnswer(i, btn));
    optionsEl.appendChild(btn);
  });
});

function submitAnswer(index, btn) {
  if (!roundActive || myChoice != null) return;
  myChoice = index;
  const buttons = el('compatOptions').querySelectorAll('.trivia-option');
  buttons.forEach((b) => { b.disabled = true; });
  btn.classList.add('correct-reveal');
  el('compatStatus').textContent = '✅ Locked in — waiting for your partner…';
  socket.emit('compat:answer', { code: roomCode, choice: index });
}

socket.on('compat:opponent:locked', () => {
  if (myChoice != null) return; // already showed our own "waiting" text
  el('compatStatus').textContent = '🕐 Your partner has answered — your turn!';
});

socket.on('compat:round:result', (data) => {
  roundActive = false;
  players = data.players;
  el('roundsPlayed').textContent = roundNumber;

  const buttons = el('compatOptions').querySelectorAll('.trivia-option');
  buttons.forEach((b) => { b.disabled = true; });

  if (data.matched) {
    inSyncCount += 1;
    hapticSuccess();
    playSuccess();
  }
  el('inSyncCount').textContent = inSyncCount;
  el('compatStatus').textContent = data.timedOut ? "⏰ Time's up — one of you didn't answer in time." : '';

  const reveal = el('compatReveal');
  reveal.classList.remove('hidden');
  const names = Object.keys(data.choices);
  reveal.innerHTML =
    `<div class="compat-reveal-title">${data.matched ? '💕 In sync!' : "🤷 Not quite in sync"}</div>` +
    names
      .map((name) => {
        const choiceIdx = data.choices[name];
        const text = data.options[choiceIdx] != null ? data.options[choiceIdx] : '—';
        return `<div class="compat-reveal-row"><span class="compat-reveal-name">${name}</span><span>${text}</span></div>`;
      })
      .join('');
});

socket.on('compat:game:over', (data) => {
  gameArea.classList.add('hidden');
  gameOver.classList.remove('hidden');
  el('playAgainBtn').classList.toggle('hidden', !amHost());

  const rounds = data.players[0] ? totalRounds : totalRounds;
  const pct = rounds > 0 ? Math.round((data.inSync / rounds) * 100) : 0;
  el('overTitle').textContent = `💕 ${pct}% In Sync!`;
  el('soloSummary').textContent = `You matched on ${data.inSync} out of ${rounds} rounds.`;
});

el('playAgainBtn').addEventListener('click', () => {
  if (!amHost() || !roomCode) return;
  gameOver.classList.add('hidden');
  inSyncCount = 0;
  socket.emit('compat:host:start', { code: roomCode, rounds: totalRounds });
});
