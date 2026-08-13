const socket = io();
let roomCode = null;
let hostToken = null;
let myName = null;
let roundActive = false;

const el = (id) => document.getElementById(id);
const setup = el('setup');
const lobby = el('lobby');
const gameArea = el('gameArea');
const gameOver = el('gameOver');
const resultOverlay = el('resultOverlay');

el('createBtn').addEventListener('click', () => {
  const rounds = parseInt(el('roundsInput').value, 10) || 15;
  const name = el('hostNameInput').value.trim();
  socket.emit('host:create', { rounds, name }, (res) => {
    roomCode = res.code;
    hostToken = res.hostToken;
    myName = res.name;
    el('roomCode').textContent = roomCode;
    setup.classList.add('hidden');
    lobby.classList.remove('hidden');
    prefetchAllSymbolImages();
    fetch(`/api/qr?code=${roomCode}`)
      .then((r) => r.json())
      .then((data) => {
        el('qrImg').src = data.qrDataUrl;
        el('joinUrlText').textContent = data.joinUrl;
      });
  });
});

el('lobbyBackBtn').addEventListener('click', () => {
  if (roomCode) socket.emit('host:cancel', { code: roomCode });
  roomCode = null;
  hostToken = null;
  myName = null;
  lobby.classList.add('hidden');
  setup.classList.remove('hidden');
});

el('startBtn').addEventListener('click', () => {
  socket.emit('host:start', { code: roomCode });
  lobby.classList.add('hidden');
  gameArea.classList.remove('hidden');
});

el('playAgainBtn').addEventListener('click', () => {
  socket.emit('host:playAgain', { code: roomCode });
  gameOver.classList.add('hidden');
  gameArea.classList.remove('hidden');
});

// iOS suspends a backgrounded home-screen app and can hand it a fresh
// socket id when it wakes back up; without re-claiming host status the
// server silently ignores host:start/host:playAgain from the "wrong" socket.
socket.on('connect', () => {
  if (!roomCode || !hostToken) return;
  socket.emit('host:rejoin', { code: roomCode, hostToken }, (res) => {
    if (!res || !res.ok) return;
    updateLobby(res.players);
  });
});

socket.on('players:update', (scores) => {
  updateLobby(scores);
});

function updateLobby(scores) {
  el('playerCount').textContent = scores.length;
  el('startBtn').disabled = scores.length < 2;
  el('lobbyHint').classList.toggle('hidden', scores.length >= 2);
  el('playerList').innerHTML = scores.map((p) => `<li>${label(p.name)}</li>`).join('');
  renderLeaderboard('leaderboard', scores, { labelFn: label });
}

function label(name) {
  return name === myName ? `${name} (You)` : name;
}

let roundsPlayed = 0;

function handleTap(symbolId, node) {
  if (!roundActive) return;
  socket.emit('player:answer', { code: roomCode, symbolId });
  hapticTap();
  node.classList.add('correct');
  setTimeout(() => node.classList.remove('correct'), 600);
}

socket.on('round:new', async (data) => {
  roundActive = false;
  roundsPlayed = data.roundNumber;
  el('roundNum').textContent = data.roundNumber;
  el('totalRounds').textContent = data.totalRounds;
  await revealRound(
    el('countdownOverlay'),
    el('countdownNumber'),
    el('cardA'),
    el('cardB'),
    data.cardA,
    data.cardB,
    handleTap
  );
  roundActive = true;
});

socket.on('round:result', async (data) => {
  roundActive = false;
  await highlightMatch(el('cardA'), el('cardB'), data.symbolId);
  const won = data.winnerName === myName;
  showOverlay(data.image, data.emoji, won ? '🎉 You got it!' : `👀 ${data.winnerName} got it!`, data.label);
  renderLeaderboard('leaderboard', data.scores, { labelFn: label });
});

socket.on('round:timeout', async (data) => {
  roundActive = false;
  await highlightMatch(el('cardA'), el('cardB'), data.symbolId);
  showOverlay(data.image, data.emoji, "⏰ Time's up!", `It was ${data.label}`);
});

socket.on('game:over', (data) => {
  gameArea.classList.add('hidden');
  gameOver.classList.remove('hidden');
  el('roundsCompletedCount').textContent = roundsPlayed;
  renderLeaderboard('finalLeaderboard', data.scores, { labelFn: label });
  renderLeaderboard('allTimeLeaderboard', data.allTime, { valueKey: 'wins', labelFn: label });
});

function showOverlay(image, emoji, title, label) {
  renderResultPhoto(el('resultPhotoFrame'), image, emoji, label);
  el('resultTitle').textContent = title;
  el('resultLabel').textContent = label;
  resultOverlay.classList.remove('hidden');
  setTimeout(() => resultOverlay.classList.add('hidden'), 2600);
}

