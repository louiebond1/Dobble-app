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
let totalRounds = 5;
let roundNumber = 0;

const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const SUITS = ['♠', '♥', '♦', '♣'];
const RED_SUITS = new Set(['♥', '♦']);

function buildDeck() {
  const deck = [];
  for (const suit of SUITS) for (const rank of RANKS) deck.push({ rank, suit });
  return deck;
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function sortHand(hand) {
  return [...hand].sort((a, b) => RANKS.indexOf(a.rank) - RANKS.indexOf(b.rank));
}

// --- Rendering helpers -------------------------------------------------

// Fans a row of cards out around center — each card's rotation/lift is set
// inline since it depends on how many cards are in the hand right now (a
// fixed CSS angle would look cramped at 3 cards and absurd at 13).
function fanTransform(index, count) {
  const mid = (count - 1) / 2;
  const offset = index - mid;
  const rotate = Math.max(-10, Math.min(10, offset * 3.5));
  const lift = Math.min(8, Math.abs(offset) * 1.3);
  return `rotate(${rotate}deg) translateY(${lift}px)`;
}

function cardEl(card, { tag = 'div', onClick = null, disabled = false } = {}) {
  const node = document.createElement(tag);
  node.className = 'gofish-card' + (RED_SUITS.has(card.suit) ? ' red' : '');
  node.innerHTML = `<span class="rank">${card.rank}</span><span class="suit">${card.suit}</span>`;
  if (tag === 'button') {
    node.type = 'button';
    node.disabled = disabled;
    if (onClick) node.addEventListener('click', () => onClick(card));
  }
  return node;
}

function renderMyHand(hand, { interactive, askableRanks } = {}) {
  const container = el('myHand');
  container.innerHTML = '';
  const sorted = sortHand(hand);
  sorted.forEach((card, i) => {
    const canAsk = interactive && (!askableRanks || askableRanks.includes(card.rank));
    const node = cardEl(card, {
      tag: 'button',
      disabled: !canAsk,
      onClick: () => askForRank(card.rank),
    });
    node.style.transform = fanTransform(i, sorted.length);
    container.appendChild(node);
  });
}

function renderOpponentBacks(count) {
  const container = el('opponentHand');
  container.innerHTML = '';
  for (let i = 0; i < count; i++) {
    const back = document.createElement('div');
    back.className = 'gofish-card back';
    back.textContent = '🂠';
    back.style.transform = fanTransform(i, count);
    container.appendChild(back);
  }
}

function renderBooks(containerId, books) {
  const container = el(containerId);
  container.innerHTML = '';
  books.forEach((rank) => {
    const chip = document.createElement('span');
    chip.className = 'gofish-book-chip';
    chip.textContent = `📚 ${rank}s`;
    container.appendChild(chip);
  });
}

function updateTurnPill(isMyTurn, turnName) {
  const pill = el('turnPill');
  pill.textContent = isMyTurn ? "🫵 Your turn!" : `⏳ ${turnName}'s turn…`;
  pill.classList.toggle('mine', isMyTurn);
}

let bannerTimer = null;
function showEventBanner(text, { book = false } = {}) {
  const banner = el('eventBanner');
  clearTimeout(bannerTimer);
  banner.textContent = text;
  banner.classList.remove('show');
  // Force a reflow so re-triggering the animation on consecutive events
  // (the class never actually left) still plays from the start each time.
  void banner.offsetWidth;
  banner.classList.add('show');
  banner.classList.toggle('book', book);
  if (book) {
    const table = document.querySelector('.gofish-table');
    table.classList.remove('gofish-celebrate');
    void table.offsetWidth;
    table.classList.add('gofish-celebrate');
    hapticSuccess();
  }
  bannerTimer = setTimeout(() => { banner.textContent = ''; banner.classList.remove('show', 'book'); }, 2600);
}

function askForRank(rank) {
  if (mode === 'solo') return soloAsk(rank);
  socket.emit('gofish:ask', { code: roomCode, rank });
}

// --- Round-count picker ------------------------------------------------

const ROUND_PRESETS = [3, 5, 7, 10];
(function renderRoundChips() {
  const container = el('roundChips');
  ROUND_PRESETS.forEach((n) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chip';
    btn.dataset.count = n;
    btn.textContent = n;
    if (n === 5) btn.classList.add('active');
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
  socket.emit('gofish:quickplay:join', { name }, (res) => {
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
  if (roomCode) socket.emit('gofish:host:cancel', { code: roomCode });
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

socket.on('gofish:players:update', (list) => {
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
    socket.emit('gofish:host:start', { code: roomCode, rounds: 1 });
  }
}

el('startBtn').addEventListener('click', () => {
  if (!amHost() || !roomCode) return;
  totalRounds = parseInt(el('roundsInput').value, 10) || 5;
  socket.emit('gofish:host:start', { code: roomCode, rounds: totalRounds });
});

socket.on('gofish:room:cancelled', () => {
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

// --- Head-to-Head round lifecycle (server-driven) -------------------------

socket.on('gofish:round:start', (data) => {
  if (mode !== 'duo') return;
  roundNumber = data.roundNumber;
  totalRounds = data.totalRounds;
  el('roundNum').textContent = roundNumber;
  el('totalRounds').textContent = totalRounds;
  el('eventBanner').textContent = '';

  setupWrap.classList.add('hidden');
  lobby.classList.add('hidden');
  gameOver.classList.add('hidden');
  gameArea.classList.remove('hidden');
});

socket.on('gofish:state', (data) => {
  if (mode !== 'duo') return;
  renderMyHand(data.myHand, { interactive: data.isMyTurn, askableRanks: data.askableRanks });
  renderBooks('myBooks', data.myBooks);
  if (data.opponent) {
    el('opponentLabel').textContent = data.opponent.name;
    renderOpponentBacks(data.opponent.handCount);
    renderBooks('opponentBooks', data.opponent.books);
  }
  el('pondCount').textContent = data.pondCount;
  updateTurnPill(data.isMyTurn, data.turnName);
});

socket.on('gofish:feed', (data) => showEventBanner(data.text));
socket.on('gofish:book', (data) => showEventBanner(`📚 ${data.name === myName ? 'You' : data.name} got the book of ${data.rank}s!`, { book: true }));

socket.on('gofish:round:result', (data) => {
  if (mode !== 'duo') return;
  players = data.players;
  updateDuelHud();
});

socket.on('gofish:game:over', (data) => {
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
  socket.emit('gofish:host:start', { code: roomCode, rounds: totalRounds });
});

// --- Solo vs CPU (local) ---------------------------------------------------

let soloName = 'You';
let soloTotalRounds = 5;
let soloHands = { me: [], cpu: [] };
let soloBooks = { me: [], cpu: [] };
let soloScore = { me: 0, cpu: 0 };
let soloPond = [];
let soloTurn = 'me';
let soloGameActive = false;

function soloCheckBooks(who) {
  const hand = soloHands[who];
  const counts = new Map();
  for (const c of hand) counts.set(c.rank, (counts.get(c.rank) || 0) + 1);
  for (const [rank, count] of counts) {
    if (count >= 4) {
      soloHands[who] = soloHands[who].filter((c) => c.rank !== rank);
      soloBooks[who].push(rank);
      showEventBanner(`📚 ${who === 'me' ? 'You' : 'CPU'} got the book of ${rank}s!`, { book: true });
    }
  }
}

function soloTotalBooks() {
  return soloBooks.me.length + soloBooks.cpu.length;
}

el('soloStartBtn').addEventListener('click', () => {
  soloName = el('soloNameInput').value.trim() || 'You';
  soloTotalRounds = parseInt(el('roundsInput').value, 10) || 5;
  startSoloGame();
});

function startSoloGame() {
  mode = 'solo';
  roundNumber = 0;
  totalRounds = soloTotalRounds;
  soloScore = { me: 0, cpu: 0 };
  players = [{ name: soloName, score: 0 }, { name: 'CPU', score: 0 }];

  setupWrap.classList.add('hidden');
  lobby.classList.add('hidden');
  gameOver.classList.add('hidden');
  gameArea.classList.remove('hidden');
  el('hudP2').classList.remove('hidden');
  el('opponentLabel').textContent = 'CPU';

  startSoloRound();
}

function startSoloRound() {
  if (roundNumber >= totalRounds) return endSoloGame();
  roundNumber += 1;
  el('roundNum').textContent = roundNumber;
  el('totalRounds').textContent = totalRounds;
  el('eventBanner').textContent = '';

  const deck = shuffle(buildDeck());
  soloHands = { me: deck.splice(0, 7), cpu: deck.splice(0, 7) };
  soloBooks = { me: [], cpu: [] };
  soloPond = deck;
  // Alternate who asks first each deal, same convention as duo mode.
  soloTurn = (roundNumber - 1) % 2 === 0 ? 'me' : 'cpu';
  soloGameActive = true;

  showEventBanner(`🎴 New deal — ${soloTurn === 'me' ? soloName : 'CPU'} goes first.`);
  soloCheckBooks('me');
  soloCheckBooks('cpu');
  soloBeginTurn();
}

function soloRenderState() {
  renderMyHand(soloHands.me, {
    interactive: soloGameActive && soloTurn === 'me',
    askableRanks: [...new Set(soloHands.me.map((c) => c.rank))],
  });
  renderBooks('myBooks', soloBooks.me);
  renderOpponentBacks(soloHands.cpu.length);
  renderBooks('opponentBooks', soloBooks.cpu);
  el('pondCount').textContent = soloPond.length;
  updateTurnPill(soloTurn === 'me', soloTurn === 'me' ? soloName : 'CPU');
}

function soloBeginTurn() {
  if (!soloGameActive) return;
  const hand = soloHands[soloTurn];
  if (hand.length === 0) {
    if (soloPond.length > 0) {
      hand.push(soloPond.pop());
      soloCheckBooks(soloTurn);
      if (soloTotalBooks() >= RANKS.length) return soloEndDeal();
    } else {
      return soloEndDeal();
    }
  }
  soloRenderState();
  if (soloTurn === 'cpu') setTimeout(runCpuTurn, 900);
}

function soloAsk(rank) {
  if (!soloGameActive || soloTurn !== 'me' || !soloHands.me.some((c) => c.rank === rank)) return;
  soloResolveAsk('me', 'cpu', rank, soloName, 'CPU');
}

function runCpuTurn() {
  if (!soloGameActive || soloTurn !== 'cpu') return;
  // Prefer the rank it holds the most copies of — a decent, not perfect, heuristic.
  const counts = new Map();
  for (const c of soloHands.cpu) counts.set(c.rank, (counts.get(c.rank) || 0) + 1);
  let bestRank = null;
  let bestCount = 0;
  for (const [rank, count] of counts) {
    if (count > bestCount || (count === bestCount && Math.random() < 0.5)) {
      bestRank = rank;
      bestCount = count;
    }
  }
  if (!bestRank) return soloBeginTurn();
  soloResolveAsk('cpu', 'me', bestRank, 'CPU', soloName);
}

function soloResolveAsk(askerKey, targetKey, rank, askerName, targetName) {
  const asker = soloHands[askerKey];
  const target = soloHands[targetKey];
  const matches = target.filter((c) => c.rank === rank);

  if (matches.length > 0) {
    soloHands[targetKey] = target.filter((c) => c.rank !== rank);
    soloHands[askerKey] = asker.concat(matches);
    showEventBanner(`🎣 ${askerName} asked ${targetName} for ${rank}s — got ${matches.length}!`);
    soloCheckBooks(askerKey);
    if (soloTotalBooks() >= RANKS.length) return soloEndDeal();
    soloBeginTurn(); // same player goes again
    return;
  }

  showEventBanner(`🎣 ${askerName} asked ${targetName} for ${rank}s — Go Fish!`);
  if (soloPond.length > 0) {
    const drawn = soloPond.pop();
    soloHands[askerKey].push(drawn);
    soloCheckBooks(askerKey);
    if (soloTotalBooks() >= RANKS.length) return soloEndDeal();
    if (drawn.rank === rank) {
      showEventBanner(`🐟 Drew a ${rank} — go again!`);
      soloBeginTurn();
      return;
    }
  }
  soloTurn = targetKey;
  soloBeginTurn();
}

function soloEndDeal() {
  soloGameActive = false;
  soloRenderState();

  let winnerName = null;
  if (soloBooks.me.length > soloBooks.cpu.length) { soloScore.me += 1; winnerName = soloName; }
  else if (soloBooks.cpu.length > soloBooks.me.length) { soloScore.cpu += 1; winnerName = 'CPU'; }
  players[0].score = soloScore.me;
  players[1].score = soloScore.cpu;
  updateDuelHud();

  showEventBanner(winnerName ? `🏆 ${winnerName} took this deal!` : "🤝 This deal's a tie!");
  if (winnerName === soloName) { hapticSuccess(); playSuccess(); }

  setTimeout(startSoloRound, 3200);
}

function soloBestKey(name) {
  return `gofish-solo-best-${name.trim().toLowerCase()}-${totalRounds}`;
}

function endSoloGame() {
  gameArea.classList.add('hidden');
  gameOver.classList.remove('hidden');
  el('playAgainBtn').classList.remove('hidden');
  el('finalBoard').classList.remove('hidden');
  renderLeaderboard('finalBoard', [...players].sort((a, b) => b.score - a.score));

  const wins = soloScore.me;
  el('overTitle').textContent = wins > soloScore.cpu ? '🏆 You beat the CPU!' : wins === soloScore.cpu ? "🤝 Tied with the CPU!" : '🤖 The CPU got you this time.';

  const key = soloBestKey(soloName);
  let bestEver = null;
  try {
    bestEver = JSON.parse(localStorage.getItem(key) || 'null');
  } catch (e) {
    bestEver = null;
  }
  const improved = !bestEver || wins > bestEver.wins;
  if (improved) {
    try {
      localStorage.setItem(key, JSON.stringify({ wins, total: totalRounds }));
    } catch (e) {
      // localStorage unavailable — best-tracking just won't persist
    }
    el('soloSummary').textContent = `${wins} / ${totalRounds} deals won — ${bestEver ? '🏆 New personal best!' : '🏆 First run in the books!'}`;
  } else {
    el('soloSummary').textContent = `${wins} / ${totalRounds} deals won · Personal best: ${bestEver.wins} / ${bestEver.total}`;
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
