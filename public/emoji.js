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

const EMOJI_ROUND_MS = 18000;
let allPuzzles = [];
fetch('/api/emoji-puzzles')
  .then((r) => r.json())
  .then((data) => { allPuzzles = data.puzzles || []; })
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
  socket.emit('emoji:quickplay:join', { name }, (res) => {
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
  if (roomCode) socket.emit('emoji:host:cancel', { code: roomCode });
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

let mashupMode = false;
let mashupAutoStarted = false;

function amHost() {
  return !!hostToken;
}

socket.on('emoji:players:update', (list) => {
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

  if (mashupMode && amHost() && players.length >= 2 && !mashupAutoStarted) {
    mashupAutoStarted = true;
    socket.emit('emoji:host:start', { code: roomCode, rounds: 1 });
  }
}

el('startBtn').addEventListener('click', () => {
  if (!amHost() || !roomCode) return;
  totalRounds = parseInt(el('roundsInput').value, 10) || 8;
  socket.emit('emoji:host:start', { code: roomCode, rounds: totalRounds });
});

socket.on('emoji:room:cancelled', () => {
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
  const feed = el('emojiFeed');
  const item = document.createElement('div');
  item.className = 'trivia-feed-item';
  item.textContent = text;
  feed.appendChild(item);
  feed.scrollTop = feed.scrollHeight;
}

function renderPuzzle(data) {
  el('roundNum').textContent = roundNumber;
  el('totalRounds').textContent = totalRounds;
  el('emojiCategory').textContent = data.category;
  el('emojiDisplay').textContent = data.emoji;
  el('emojiFeed').innerHTML = '';

  const optionsEl = el('emojiOptions');
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

socket.on('emoji:round:start', (data) => {
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
  renderPuzzle(data);
});

function submitAnswer(index, btn) {
  if (!roundActive || myWrong || btn.disabled) return;
  if (mode === 'solo') return submitSoloAnswer(index, btn);
  socket.emit('emoji:answer', { code: roomCode, index });
}

socket.on('emoji:wrong', (data) => {
  if (mode !== 'duo') return;
  addFeedItem(`❌ ${data.name} guessed wrong`);
  if (data.name === myName) {
    myWrong = true;
    const buttons = el('emojiOptions').querySelectorAll('.trivia-option');
    if (buttons[data.index]) buttons[data.index].classList.add('wrong');
    buttons.forEach((b) => { b.disabled = true; });
  }
});

socket.on('emoji:round:result', (data) => {
  if (mode !== 'duo') return;
  roundActive = false;
  players = data.players;
  updateDuelHud();

  const buttons = el('emojiOptions').querySelectorAll('.trivia-option');
  buttons.forEach((b, i) => {
    b.disabled = true;
    if (i === data.correctIndex) b.classList.add('correct-reveal');
  });

  if (data.timedOut) {
    addFeedItem(`⏰ Time's up! It was "${data.correctText}"`);
  } else if (data.winnerName === myName) {
    addFeedItem('✅ You got it! +1');
    hapticSuccess();
    playSuccess();
  } else {
    addFeedItem(`✅ ${data.winnerName} got it first!`);
  }
});

socket.on('emoji:game:over', (data) => {
  if (mashupMode) return reportMashupLegResult(socket, data.players);
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
  socket.emit('emoji:host:start', { code: roomCode, rounds: totalRounds });
});

// --- Solo (local practice) mode -------------------------------------------

let soloName = 'You';
let soloTotalRounds = 8;
let soloQueue = [];
let soloScore = 0;
let soloCurrentPuzzle = null;
let soloTimer = null;

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// The bank's own option order clusters the correct answer at index 0 far
// more than chance would — shuffle per-deal so it isn't predictable.
function shuffleOptions(options, correctIndex) {
  const order = shuffle(options.map((_, i) => i));
  return { options: order.map((i) => options[i]), correctIndex: order.indexOf(correctIndex) };
}

el('soloStartBtn').addEventListener('click', () => {
  if (!allPuzzles.length) return; // still loading — button is effectively a no-op until ready
  soloName = el('soloNameInput').value.trim() || 'You';
  soloTotalRounds = parseInt(el('roundsInput').value, 10) || 8;
  startSoloGame();
});

function startSoloGame() {
  soloScore = 0;
  roundNumber = 0;
  totalRounds = Math.min(soloTotalRounds, allPuzzles.length);
  soloQueue = shuffle(allPuzzles).slice(0, totalRounds);
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
  const raw = soloQueue[roundNumber - 1];
  soloCurrentPuzzle = { ...raw, ...shuffleOptions(raw.options, raw.correctIndex) };
  roundActive = true;
  myWrong = false;
  el('hudP1Score').textContent = soloScore;

  renderPuzzle({
    category: soloCurrentPuzzle.category,
    emoji: soloCurrentPuzzle.emoji,
    options: soloCurrentPuzzle.options,
  });

  soloTimer = setTimeout(() => resolveSoloRound(true, null), EMOJI_ROUND_MS);
}

function submitSoloAnswer(index, btn) {
  if (index === soloCurrentPuzzle.correctIndex) {
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

  const buttons = el('emojiOptions').querySelectorAll('.trivia-option');
  buttons.forEach((b, i) => {
    b.disabled = true;
    if (i === soloCurrentPuzzle.correctIndex) b.classList.add('correct-reveal');
  });

  if (timedOut) {
    addFeedItem(`⏰ Time's up! It was "${soloCurrentPuzzle.options[soloCurrentPuzzle.correctIndex]}"`);
  } else if (correct) {
    addFeedItem('✅ Correct! +1');
    hapticSuccess();
    playSuccess();
  } else {
    addFeedItem(`❌ Not quite — it was "${soloCurrentPuzzle.options[soloCurrentPuzzle.correctIndex]}"`);
  }

  setTimeout(startSoloRound, 1800);
}

function soloBestKey(name) {
  return `emoji-solo-best-${name.trim().toLowerCase()}-${totalRounds}`;
}

function endSoloGame() {
  gameArea.classList.add('hidden');
  gameOver.classList.remove('hidden');
  el('playAgainBtn').classList.remove('hidden');
  el('finalBoard').classList.add('hidden');
  el('finalBoard').innerHTML = '';

  const pct = totalRounds > 0 ? Math.round((soloScore / totalRounds) * 100) : 0;
  el('overTitle').textContent = '🎭 Practice Complete!';

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

// --- Party Mashup: auto-join and auto-start a single-round leg ------------
(function initMashup() {
  const mp = mashupParams();
  if (!mp) return;
  mashupMode = true;
  rewireMashupQuitLink();
  quickPlayJoin(mp.name);
})();
