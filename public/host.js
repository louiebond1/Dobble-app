const socket = io();
let roomCode = null;
let hostToken = null;
let myName = null;
let roundActive = false;
let isQuickPlay = false;

const el = (id) => document.getElementById(id);
const setup = el('setup');
const spotMatchCard = el('spotMatchCard');
const moreGames = el('moreGames');
const lobby = el('lobby');
const gameArea = el('gameArea');
const gameOver = el('gameOver');
const resultOverlay = el('resultOverlay');

spotMatchCard.addEventListener('click', (e) => {
  e.preventDefault();
  spotMatchCard.classList.add('hidden');
  setup.classList.remove('hidden');
});

el('setupBackBtn').addEventListener('click', () => {
  setup.classList.add('hidden');
  spotMatchCard.classList.remove('hidden');
});

el('createBtn').addEventListener('click', () => {
  const rounds = parseInt(el('roundsInput').value, 10) || 15;
  const name = el('hostNameInput').value.trim();
  socket.emit('host:create', { rounds, name }, (res) => {
    isQuickPlay = false;
    roomCode = res.code;
    hostToken = res.hostToken;
    myName = res.name;
    el('roomCode').textContent = roomCode;
    enterLobby();
    prefetchAllSymbolImages();
    fetch(`/api/qr?code=${roomCode}`)
      .then((r) => r.json())
      .then((data) => {
        el('qrImg').src = data.qrDataUrl;
        el('joinUrlText').textContent = data.joinUrl;
      });
  });
});

function quickPlayJoin(name) {
  socket.emit('quickplay:join', { name }, (res) => {
    if (!res || !res.ok) return;
    isQuickPlay = true;
    roomCode = res.code;
    hostToken = res.hostToken || null;
    myName = res.name;
    enterLobby();
    prefetchAllSymbolImages();
  });
}

el('quickPlayLouieBtn').addEventListener('click', () => quickPlayJoin('Louie'));
el('quickPlayArielBtn').addEventListener('click', () => quickPlayJoin('Ariel'));

function enterLobby() {
  setup.classList.add('hidden');
  moreGames.classList.add('hidden');
  lobby.classList.remove('hidden');
  el('roomCode').classList.toggle('hidden', isQuickPlay);
  el('qrImg').classList.toggle('hidden', isQuickPlay);
  el('joinUrlText').classList.toggle('hidden', isQuickPlay);
}

el('lobbyBackBtn').addEventListener('click', () => {
  if (roomCode) socket.emit('host:cancel', { code: roomCode });
  roomCode = null;
  hostToken = null;
  myName = null;
  isQuickPlay = false;
  lobby.classList.add('hidden');
  setup.classList.add('hidden');
  spotMatchCard.classList.remove('hidden');
  moreGames.classList.remove('hidden');
});

el('startBtn').addEventListener('click', () => {
  socket.emit('host:start', { code: roomCode });
});

el('playAgainBtn').addEventListener('click', () => {
  socket.emit('host:playAgain', { code: roomCode });
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

function amHost() {
  return !isQuickPlay || !!hostToken;
}

function updateLobby(scores) {
  const amHost_ = amHost();
  el('playerCount').textContent = scores.length;
  el('startBtn').classList.toggle('hidden', !amHost_);
  el('startBtn').disabled = scores.length < 2;
  if (amHost_) {
    el('lobbyHint').textContent = 'Waiting for at least one more player to join…';
    el('lobbyHint').classList.toggle('hidden', scores.length >= 2);
  } else {
    el('lobbyHint').textContent = 'Waiting for the host to start the game…';
    el('lobbyHint').classList.remove('hidden');
  }
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
  lobby.classList.add('hidden');
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
  el('playAgainBtn').classList.toggle('hidden', !amHost());
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

// --- All-time couple's scoreboard ------------------------------------------
const scoreboardHint = el('scoreboardHint');
let scoreboardHintTimer = null;

function renderScoreboard(scores) {
  el('louieScore').textContent = scores.louie;
  el('arielScore').textContent = scores.ariel;
}

fetch('/api/leaderboard')
  .then((r) => r.json())
  .then(renderScoreboard)
  .catch(() => {});

function logWin(who) {
  fetch(`/api/leaderboard/win`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ who }),
  })
    .then((r) => r.json())
    .then((scores) => {
      renderScoreboard(scores);
      hapticSuccess();
      playSuccess();
      const name = who === 'louie' ? 'Louie' : 'Ariel';
      scoreboardHint.innerHTML = `Logged for ${name} — <a href="#" id="scoreboardUndoLink">undo</a>`;
      el('scoreboardUndoLink').addEventListener('click', (e) => {
        e.preventDefault();
        clearTimeout(scoreboardHintTimer);
        fetch('/api/leaderboard/undo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ who }),
        })
          .then((r) => r.json())
          .then((scores) => {
            renderScoreboard(scores);
            resetScoreboardHint();
          });
      });
      clearTimeout(scoreboardHintTimer);
      scoreboardHintTimer = setTimeout(resetScoreboardHint, 4000);
    });
}

function resetScoreboardHint() {
  scoreboardHint.textContent = 'Tap your name when you win something';
}

el('louieWinBtn').addEventListener('click', () => logWin('louie'));
el('arielWinBtn').addEventListener('click', () => logWin('ariel'));

