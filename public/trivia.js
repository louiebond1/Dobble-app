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
let myWrong = false;

const TRIVIA_ROUND_MS = 20000;
let allQuestions = [];
fetch('/api/trivia')
  .then((r) => r.json())
  .then((data) => { allQuestions = data.questions || []; })
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

function renderQuestion(data) {
  el('roundNum').textContent = roundNumber;
  el('totalRounds').textContent = totalRounds;
  el('triviaCategory').textContent = data.category;
  el('triviaQuestionText').textContent = data.question;
  el('triviaFeed').innerHTML = '';

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
}

// --- Head-to-Head round lifecycle (server-driven) -------------------------

socket.on('trivia:round:start', (data) => {
  if (mode !== 'duo') return;
  roundNumber = data.roundNumber;
  totalRounds = data.totalRounds;
  players = data.players;
  roundActive = true;
  myWrong = false;

  setupWrap.classList.add('hidden');
  lobby.classList.add('hidden');
  gameOver.classList.add('hidden');
  gameArea.classList.remove('hidden');
  updateDuelHud();
  renderQuestion(data);
});

function submitAnswer(index, btn) {
  if (!roundActive || myWrong || btn.disabled) return;
  if (mode === 'solo') return submitSoloAnswer(index, btn);
  socket.emit('trivia:answer', { code: roomCode, index });
}

socket.on('trivia:wrong', (data) => {
  if (mode !== 'duo') return;
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
  if (mode !== 'duo') return;
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
  socket.emit('trivia:host:start', { code: roomCode, rounds: totalRounds });
});

// --- Solo (local practice) mode -------------------------------------------

let soloName = 'You';
let soloTotalRounds = 8;
let soloQueue = [];
let soloScore = 0;
let soloCurrentQuestion = null;
let soloTimer = null;

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

el('soloStartBtn').addEventListener('click', () => {
  if (!allQuestions.length) return; // still loading — button is effectively a no-op until ready
  soloName = el('soloNameInput').value.trim() || 'You';
  soloTotalRounds = parseInt(el('roundsInput').value, 10) || 8;
  startSoloGame();
});

function startSoloGame() {
  soloScore = 0;
  roundNumber = 0;
  totalRounds = Math.min(soloTotalRounds, allQuestions.length);
  soloQueue = shuffle(allQuestions).slice(0, totalRounds);
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
  soloCurrentQuestion = soloQueue[roundNumber - 1];
  roundActive = true;
  myWrong = false;
  el('hudP1Score').textContent = soloScore;

  renderQuestion({
    category: soloCurrentQuestion.category,
    question: soloCurrentQuestion.question,
    options: soloCurrentQuestion.options,
  });

  soloTimer = setTimeout(() => resolveSoloRound(true, null), TRIVIA_ROUND_MS);
}

function submitSoloAnswer(index, btn) {
  if (index === soloCurrentQuestion.correctIndex) {
    resolveSoloRound(false, index);
  } else {
    btn.classList.add('wrong');
    resolveSoloRound(false, index, true);
  }
}

function resolveSoloRound(timedOut, chosenIndex, wasWrong) {
  if (!roundActive) return;
  clearTimeout(soloTimer);
  roundActive = false;

  const correct = !timedOut && !wasWrong;
  if (correct) soloScore += 1;
  el('hudP1Score').textContent = soloScore;

  const buttons = el('triviaOptions').querySelectorAll('.trivia-option');
  buttons.forEach((b, i) => {
    b.disabled = true;
    if (i === soloCurrentQuestion.correctIndex) b.classList.add('correct-reveal');
  });

  if (timedOut) {
    addFeedItem(`⏰ Time's up! It was "${soloCurrentQuestion.options[soloCurrentQuestion.correctIndex]}"`);
  } else if (correct) {
    addFeedItem('✅ Correct! +1');
    hapticSuccess();
    playSuccess();
  } else {
    addFeedItem(`❌ Not quite — it was "${soloCurrentQuestion.options[soloCurrentQuestion.correctIndex]}"`);
  }

  setTimeout(startSoloRound, 1800);
}

function soloBestKey(name) {
  return `trivia-solo-best-${name.trim().toLowerCase()}-${totalRounds}`;
}

function endSoloGame() {
  gameArea.classList.add('hidden');
  gameOver.classList.remove('hidden');
  el('playAgainBtn').classList.remove('hidden');
  el('finalBoard').classList.add('hidden');
  el('finalBoard').innerHTML = '';

  const pct = totalRounds > 0 ? Math.round((soloScore / totalRounds) * 100) : 0;
  el('overTitle').textContent = '🧠 Practice Complete!';

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
    el('soloSummary').textContent = `${soloScore} / ${totalRounds} correct (${pct}%) — ${bestEver ? '🏆 New personal best!' : '🏆 First run in the books!'}`;
  } else {
    el('soloSummary').textContent = `${soloScore} / ${totalRounds} correct (${pct}%) · Personal best: ${bestEver.score} / ${bestEver.total}`;
  }
}
