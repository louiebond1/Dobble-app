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
let totalRounds = 8;
let roundNumber = 0;
let roundActive = false;

const SCRAMBLE_ROUND_MS = 35000;
let allWords = [];
fetch('/api/scramble-words')
  .then((r) => r.json())
  .then((data) => { allWords = data.words || []; })
  .catch(() => {});

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
  socket.emit('scramble:quickplay:join', { name }, (res) => {
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
  if (roomCode) socket.emit('scramble:host:cancel', { code: roomCode });
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

socket.on('scramble:players:update', (list) => {
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
  socket.emit('scramble:host:start', { code: roomCode, rounds: totalRounds });
});

socket.on('scramble:room:cancelled', () => {
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

function renderScrambleLetters(word) {
  const container = el('scrambleLetters');
  container.innerHTML = '';
  word.split('').forEach((ch) => {
    const tile = document.createElement('div');
    tile.className = 'scramble-tile';
    tile.textContent = ch;
    container.appendChild(tile);
  });
}

function addGuessBubble(text, correct) {
  const feed = el('guessFeed');
  const bubble = document.createElement('div');
  bubble.className = correct ? 'guess-bubble correct' : 'guess-bubble';
  bubble.textContent = correct ? `✅ ${text} — correct!` : text;
  feed.prepend(bubble);
}

// --- Head-to-Head round lifecycle (server-driven) -------------------------

socket.on('scramble:round:start', (data) => {
  if (mode !== 'duo') return;
  roundNumber = data.roundNumber;
  totalRounds = data.totalRounds;
  players = data.players;
  roundActive = true;

  setupWrap.classList.add('hidden');
  lobby.classList.add('hidden');
  gameOver.classList.add('hidden');
  gameArea.classList.remove('hidden');

  el('roundNum').textContent = roundNumber;
  el('totalRounds').textContent = totalRounds;
  el('guessFeed').innerHTML = '';
  el('guessInput').value = '';
  updateDuelHud();
  renderScrambleLetters(data.scrambled);
});

el('guessSubmitBtn').addEventListener('click', submitGuess);
el('guessInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') submitGuess();
});

function submitGuess() {
  const text = el('guessInput').value.trim();
  if (!text || !roundActive) return;
  el('guessInput').value = '';
  if (mode === 'solo') return submitSoloGuess(text);
  socket.emit('scramble:guess', { code: roomCode, text });
}

socket.on('scramble:guess', (data) => {
  if (mode !== 'duo') return;
  addGuessBubble(`${data.name}: ${data.text}`, data.correct);
});

socket.on('scramble:round:result', (data) => {
  if (mode !== 'duo') return;
  roundActive = false;
  players = data.players;
  updateDuelHud();

  if (data.timedOut) {
    addGuessBubble(`⏰ Time's up! It was "${data.word}"`, false);
  } else if (data.winnerName === myName) {
    hapticSuccess();
    playSuccess();
  }
});

socket.on('scramble:game:over', (data) => {
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
  socket.emit('scramble:host:start', { code: roomCode, rounds: totalRounds });
});

// --- Solo (local practice) mode -------------------------------------------

let soloName = 'You';
let soloTotalRounds = 8;
let soloQueue = [];
let soloScore = 0;
let soloCurrentWord = null;
let soloTimer = null;

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function scrambleLetters(word) {
  const letters = word.split('');
  let scrambled = word;
  let attempts = 0;
  while (scrambled === word && attempts < 20) {
    for (let i = letters.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [letters[i], letters[j]] = [letters[j], letters[i]];
    }
    scrambled = letters.join('');
    attempts += 1;
  }
  return scrambled;
}

el('soloStartBtn').addEventListener('click', () => {
  if (!allWords.length) return; // still loading — button is effectively a no-op until ready
  soloName = el('soloNameInput').value.trim() || 'You';
  soloTotalRounds = parseInt(el('roundsInput').value, 10) || 8;
  startSoloGame();
});

function startSoloGame() {
  soloScore = 0;
  roundNumber = 0;
  totalRounds = Math.min(soloTotalRounds, allWords.length);
  soloQueue = shuffle(allWords).slice(0, totalRounds);
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
  clearTimeout(soloTimer);
  if (roundNumber >= totalRounds) return endSoloGame();

  roundNumber += 1;
  soloCurrentWord = soloQueue[roundNumber - 1].word;
  roundActive = true;
  el('hudP1Score').textContent = soloScore;

  el('roundNum').textContent = roundNumber;
  el('totalRounds').textContent = totalRounds;
  el('guessFeed').innerHTML = '';
  el('guessInput').value = '';
  renderScrambleLetters(scrambleLetters(soloCurrentWord));

  soloTimer = setTimeout(() => resolveSoloRound(true, false), SCRAMBLE_ROUND_MS);
}

function submitSoloGuess(text) {
  const correct = text.trim().toUpperCase() === soloCurrentWord;
  addGuessBubble(text, correct);
  if (correct) resolveSoloRound(false, true);
}

function resolveSoloRound(timedOut, correct) {
  if (!roundActive) return;
  clearTimeout(soloTimer);
  roundActive = false;

  if (correct) {
    soloScore += 1;
    el('hudP1Score').textContent = soloScore;
    hapticSuccess();
    playSuccess();
  } else if (timedOut) {
    addGuessBubble(`⏰ Time's up! It was "${soloCurrentWord}"`, false);
  }

  setTimeout(startSoloRound, 1600);
}

function soloBestKey(name) {
  return `scramble-solo-best-${name.trim().toLowerCase()}-${totalRounds}`;
}

function endSoloGame() {
  gameArea.classList.add('hidden');
  gameOver.classList.remove('hidden');
  el('playAgainBtn').classList.remove('hidden');
  el('finalBoard').classList.add('hidden');
  el('finalBoard').innerHTML = '';

  const pct = totalRounds > 0 ? Math.round((soloScore / totalRounds) * 100) : 0;
  el('overTitle').textContent = '🔤 Practice Complete!';

  const key = soloBestKey(soloName);
  let bestEver = null;
  try {
    bestEver = JSON.parse(localStorage.getItem(key) || 'null');
  } catch (e) {
    bestEver = null;
  }
  const improved = !bestEver || soloScore > bestEver.score;
  if (improved) {
    try {
      localStorage.setItem(key, JSON.stringify({ score: soloScore, total: totalRounds }));
    } catch (e) {
      // localStorage unavailable — best-tracking just won't persist
    }
    el('soloSummary').textContent = `${soloScore} / ${totalRounds} solved (${pct}%) — ${bestEver ? '🏆 New personal best!' : '🏆 First run in the books!'}`;
  } else {
    el('soloSummary').textContent = `${soloScore} / ${totalRounds} solved (${pct}%) · Personal best: ${bestEver.score} / ${bestEver.total}`;
  }
}
