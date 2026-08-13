const socket = io();
let roomCode = null;
let roundActive = false;
let playerName = '';

const el = (id) => document.getElementById(id);
const joinPanel = el('joinPanel');
const waitingPanel = el('waitingPanel');
const gameArea = el('gameArea');
const gameOver = el('gameOver');
const resultOverlay = el('resultOverlay');

const pathCode = window.location.pathname.split('/play/')[1];
if (pathCode) el('codeInput').value = pathCode.toUpperCase();

el('joinBtn').addEventListener('click', join);
el('nameInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') join(); });

function join() {
  const code = el('codeInput').value.trim().toUpperCase();
  const name = el('nameInput').value.trim();
  if (!code || !name) {
    el('joinError').textContent = 'Enter a room code and your name.';
    return;
  }
  socket.emit('player:join', { code, name }, (res) => {
    if (!res.ok) {
      el('joinError').textContent = res.error || 'Could not join.';
      return;
    }
    roomCode = code;
    playerName = res.name;
    el('playerNameBadge').textContent = playerName;
    el('playerAvatar').textContent = playerName.charAt(0).toUpperCase();
    prefetchAllSymbolImages();
    joinPanel.classList.add('hidden');
    waitingPanel.classList.remove('hidden');
  });
}

function label(name) {
  return name === playerName ? `${name} (You)` : name;
}

socket.on('players:update', (scores) => {
  const mine = scores.find((p) => p.name === playerName);
  if (mine) el('playerScoreBadge').textContent = mine.score;
});

let roundsPlayed = 0;

socket.on('round:new', async (data) => {
  roundActive = false;
  roundsPlayed = data.roundNumber;
  waitingPanel.classList.add('hidden');
  gameOver.classList.add('hidden');
  gameArea.classList.remove('hidden');
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

function handleTap(symbolId, node) {
  if (!roundActive) return;
  socket.emit('player:answer', { code: roomCode, symbolId });
  hapticTap();
  node.classList.add('correct');
  setTimeout(() => node.classList.remove('correct'), 600);
}

socket.on('round:result', async (data) => {
  roundActive = false;
  await highlightMatch(el('cardA'), el('cardB'), data.symbolId);
  const won = data.winnerName === playerName;
  showOverlay(data.image, data.emoji, won ? '🎉 You got it!' : `👀 ${data.winnerName} got it!`, data.label);
  const mine = data.scores.find((p) => p.name === playerName);
  if (mine) el('playerScoreBadge').textContent = mine.score;
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
  setTimeout(() => resultOverlay.classList.add('hidden'), 2200);
}
