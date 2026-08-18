const el = (id) => document.getElementById(id);
const nameWrap = el('nameWrap');
const lobbyWrap = el('lobbyWrap');
const redirectStage = el('redirectStage');
const transitionStage = el('transitionStage');
const finalStage = el('finalStage');

const socket = io();

const roomCode = 'OURS';
let isHost = false;
let myName = null;
let selectedGames = [];
let selectedLegs = 7;

let allGames = [];
fetch('/api/mashup-games')
  .then((r) => r.json())
  .then((data) => {
    allGames = data.games || [];
    renderGamePicker();
  })
  .catch(() => {});

function hideAll() {
  nameWrap.classList.add('hidden');
  lobbyWrap.classList.add('hidden');
  redirectStage.classList.add('hidden');
  transitionStage.classList.add('hidden');
  finalStage.classList.add('hidden');
}

function renderGamePicker() {
  const container = el('gamePicker');
  if (!container) return;
  container.innerHTML = '';
  allGames.forEach((g) => {
    const label = document.createElement('label');
    label.className = 'mashup-game-check';
    label.innerHTML = `<input type="checkbox" value="${g.key}" checked /> <span>${g.emoji} ${g.label}</span>`;
    container.appendChild(label);
  });
}

const LEG_PRESETS = [5, 7, 9, 12];
(function renderLegChips() {
  const container = el('legChips');
  LEG_PRESETS.forEach((n) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chip';
    btn.textContent = n;
    if (n === 7) btn.classList.add('active');
    btn.addEventListener('click', () => {
      container.querySelectorAll('.chip').forEach((c) => c.classList.toggle('active', c === btn));
      selectedLegs = n;
    });
    container.appendChild(btn);
  });
})();

// --- Join / rejoin -----------------------------------------------------

el('joinLouieBtn').addEventListener('click', () => quickPlayJoin('Louie'));
el('joinArielBtn').addEventListener('click', () => quickPlayJoin('Ariel'));

function quickPlayJoin(name) {
  sessionStorage.setItem('mashupName', name);
  socket.emit('mashup:quickplay:join', { name }, handleJoinAck);
}

function handleJoinAck(res) {
  if (!res || !res.ok) return;
  isHost = res.isHost;
  myName = res.name;

  if (!res.started) {
    showLobby(res.players);
    return;
  }
  if (res.awaitingResult && res.currentGame) {
    goToGame(res.currentGame);
    return;
  }
  if (res.legIndex >= res.totalLegs) {
    showFinalResults(res.legs, res.players);
    return;
  }
  showLegTransition(res.legs, res.players, res.legIndex, res.totalLegs);
}

// --- Lobby ---------------------------------------------------------------

function showLobby(players) {
  hideAll();
  lobbyWrap.classList.remove('hidden');
  el('playerCount').textContent = players.length;
  el('playerList').innerHTML = players
    .map((p) => `<li>${p.name === myName ? `${p.name} (You)` : p.name}</li>`)
    .join('');
  el('hostConfig').classList.toggle('hidden', !isHost);
  el('lobbyHint').classList.toggle('hidden', isHost || players.length < 1);
  if (!isHost) el('lobbyHint').textContent = 'Waiting for the host to configure and start…';
}

socket.on('mashup:players:update', (list) => {
  if (!lobbyWrap.classList.contains('hidden')) showLobby(list);
});

el('startMashupBtn').addEventListener('click', () => {
  if (!isHost) return;
  const checked = Array.from(document.querySelectorAll('#gamePicker input:checked')).map((i) => i.value);
  selectedGames = checked;
  socket.emit('mashup:host:start', { code: roomCode, games: selectedGames, legs: selectedLegs });
});

// --- Redirecting to a leg's game ------------------------------------------

function goToGame(game) {
  hideAll();
  redirectStage.classList.remove('hidden');
  el('loadingEmoji').textContent = game.emoji;
  el('loadingText').textContent = `Loading ${game.label}…`;
  window.location.href = `${game.route}?mashup=1&code=${encodeURIComponent(roomCode)}`;
}

socket.on('mashup:leg:start', (data) => {
  goToGame(data.game);
});

// --- Between-leg transition screen ----------------------------------------

function renderMashupHud(players) {
  if (!players[0]) return;
  el('mHudP1Name').textContent = players[0].name;
  el('mHudP1Score').textContent = players[0].score;
  if (players[1]) {
    el('mHudP2Name').textContent = players[1].name;
    el('mHudP2Score').textContent = players[1].score;
  }
}

function showLegTransition(legs, players, legIndex, totalLegs) {
  hideAll();
  transitionStage.classList.remove('hidden');
  el('legNum').textContent = legIndex;
  el('legTotal').textContent = totalLegs;
  renderMashupHud(players);

  const last = legs[legs.length - 1];
  const card = el('legResultCard');
  card.innerHTML = last
    ? `<div class="mashup-leg-title">${last.game.emoji} ${last.game.label}</div><div class="mashup-leg-winner">${
        last.winnerName ? `${last.winnerName} won that leg!` : "Tied — no point either way"
      }</div>`
    : '';
  el('nextUpText').textContent = 'Get ready for the next event…';

  if (isHost) {
    setTimeout(() => socket.emit('mashup:next', { code: roomCode }), 2600);
  }
}

// Only meaningfully redraws anything if we're already sitting on the
// transition screen when this arrives (e.g. the other player's own report
// landed fractionally after ours did) — otherwise the join ack already
// covers this, so it's a safe no-op.
socket.on('mashup:leg:result', (data) => {
  if (!transitionStage.classList.contains('hidden')) {
    renderMashupHud(data.players);
  }
});

// --- Final results ---------------------------------------------------------

function showFinalResults(legs, players) {
  hideAll();
  finalStage.classList.remove('hidden');
  el('playAgainBtn').classList.toggle('hidden', !isHost);

  const [p1, p2] = players;
  let title;
  if (!p2 || p1.score === p2.score) title = "It's a tie! 🤝";
  else title = `${p1.score > p2.score ? p1.name : p2.name} wins the Mashup! 🏆`;
  el('finalTitle').textContent = title;
  renderLeaderboard('finalBoard', [...players].sort((a, b) => b.score - a.score));

  el('legBreakdown').innerHTML = legs
    .map(
      (l, i) =>
        `<div class="mashup-leg-row"><span>${i + 1}. ${l.game.emoji} ${l.game.label}</span><span>${
          l.winnerName ? `${l.winnerName} won` : 'Tied'
        }</span></div>`
    )
    .join('');
}

el('playAgainBtn').addEventListener('click', () => {
  if (!isHost) return;
  socket.emit('mashup:host:start', { code: roomCode, games: selectedGames, legs: selectedLegs });
});

// --- Entry point -----------------------------------------------------------
// A stored name means we're either resuming mid-match (bounced back here
// from a leg's game page) or picked up right where a previous match left
// off — either way, skip straight to rejoining instead of asking again.
(function init() {
  const storedName = sessionStorage.getItem('mashupName');
  if (storedName) quickPlayJoin(storedName);
})();
