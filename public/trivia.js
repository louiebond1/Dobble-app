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
let roundActive = false;
let myWrong = false;

// --- Round-count picker ------------------------------------------------

const ROUND_PRESETS = [5, 8, 12, 16, 20];
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
  socket.emit('trivia:quickplay:join', { name }, (res) => {
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
  if (roomCode) socket.emit('trivia:host:cancel', { code: roomCode });
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

socket.on('trivia:players:update', (list) => {
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
  socket.emit('trivia:host:start', { code: roomCode, rounds: totalRounds });
});

socket.on('trivia:room:cancelled', () => {
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

function addFeedItem(text) {
  const feed = el('triviaFeed');
  const item = document.createElement('div');
  item.className = 'trivia-feed-item';
  item.textContent = text;
  feed.appendChild(item);
  feed.scrollTop = feed.scrollHeight;
}

// --- Round lifecycle -------------------------------------------------

socket.on('trivia:round:start', (data) => {
  roundNumber = data.roundNumber;
  totalRounds = data.totalRounds;
  players = data.players;
  roundActive = true;
  myWrong = false;

  setupWrap.classList.add('hidden');
  lobby.classList.add('hidden');
  gameOver.classList.add('hidden');
  gameArea.classList.remove('hidden');

  el('roundNum').textContent = roundNumber;
  el('totalRounds').textContent = totalRounds;
  el('triviaCategory').textContent = data.category;
  el('triviaQuestionText').textContent = data.question;
  el('triviaFeed').innerHTML = '';
  updateDuelHud();

  const optionsEl = el('triviaOptions');
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
  if (!roundActive || myWrong || btn.disabled) return;
  socket.emit('trivia:answer', { code: roomCode, index });
}

socket.on('trivia:wrong', (data) => {
  addFeedItem(`❌ ${data.name} guessed wrong`);
  if (data.name === myName) {
    myWrong = true;
    const buttons = el('triviaOptions').querySelectorAll('.trivia-option');
    if (buttons[data.index]) buttons[data.index].classList.add('wrong');
    buttons.forEach((b) => { b.disabled = true; });
    // Leave room to re-enable if the opponent also misses and the round
    // isn't over — but once *I've* answered wrong I'm out for this
    // question regardless, matching the server's per-round lockout.
  }
});

socket.on('trivia:round:result', (data) => {
  roundActive = false;
  players = data.players;
  updateDuelHud();

  const buttons = el('triviaOptions').querySelectorAll('.trivia-option');
  buttons.forEach((b, i) => {
    b.disabled = true;
    if (i === data.correctIndex) b.classList.add('correct-reveal');
  });

  if (data.timedOut) {
    addFeedItem(`⏰ Time's up! It was "${data.correctText}"`);
  } else if (data.winnerName === myName) {
    addFeedItem(`✅ You got it! +1`);
    hapticSuccess();
    playSuccess();
  } else {
    addFeedItem(`✅ ${data.winnerName} got it first!`);
  }
});

socket.on('trivia:game:over', (data) => {
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
  socket.emit('trivia:host:start', { code: roomCode, rounds: totalRounds });
});
