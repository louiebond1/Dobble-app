const socket = io();

const el = (id) => document.getElementById(id);
const setup = el('setup');
const lobby = el('lobby');
const roundArea = el('roundArea');
const gameOver = el('gameOver');
const revealOverlay = el('revealOverlay');

let code = null;
let hostToken = null;
let isHost = false;
let myRole = null; // 'Louie' | 'Ariel'
let currentTargetRole = null;
let locked = false;
let gameScore = 0;

const SESSION_KEY = 'predictSession';

function saveSession() {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ code, hostToken, isHost, myRole }));
  } catch (e) {
    /* storage unavailable — ignore */
  }
}
function clearSession() {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch (e) {
    /* ignore */
  }
}

// Pre-fill the room code if we arrived via a /predict/:code QR link.
const pathCode = window.location.pathname.match(/^\/predict\/([A-Za-z0-9]{4})$/);
if (pathCode) el('codeInput').value = pathCode[1].toUpperCase();

// Restore an in-progress game across a reload/backgrounding — the 'connect'
// handler below turns this into an actual predict:rejoin call once the
// socket (re)establishes.
(function restoreSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    if (!saved || !saved.code || !saved.myRole) return;
    code = saved.code;
    hostToken = saved.hostToken || null;
    isHost = !!saved.isHost;
    myRole = saved.myRole;
  } catch (e) {
    /* ignore */
  }
})();

el('hostBtn').addEventListener('click', () => {
  const rounds = parseInt(el('roundsInput').value, 10) || 12;
  socket.emit('predict:host:create', { rounds }, (res) => {
    if (!res || !res.ok) return;
    code = res.code;
    hostToken = res.hostToken;
    isHost = true;
    saveSession();
    enterLobby();
    el('roomCodeWrap').classList.remove('hidden');
    el('roomCode').textContent = code;
    el('qrImg').classList.remove('hidden');
    el('joinUrlText').classList.remove('hidden');
    fetch(`/api/qr?code=${code}&type=predict`)
      .then((r) => r.json())
      .then((data) => {
        el('qrImg').src = data.qrDataUrl;
        el('joinUrlText').textContent = data.joinUrl;
      })
      .catch(() => {});
  });
});

el('joinBtn').addEventListener('click', () => {
  const c = el('codeInput').value.trim().toUpperCase();
  if (!c) {
    el('joinError').textContent = 'Enter a room code.';
    return;
  }
  socket.emit('predict:player:join', { code: c }, (res) => {
    if (!res || !res.ok) {
      el('joinError').textContent = (res && res.error) || 'Could not join.';
      return;
    }
    code = c;
    isHost = false;
    saveSession();
    enterLobby();
  });
});

function enterLobby() {
  el('joinError').textContent = '';
  setup.classList.add('hidden');
  lobby.classList.remove('hidden');
}

el('lobbyBackBtn').addEventListener('click', () => {
  if (isHost && code) socket.emit('predict:host:cancel', { code });
  resetToSetup();
});

function resetToSetup() {
  code = null;
  hostToken = null;
  isHost = false;
  myRole = null;
  clearSession();
  lobby.classList.add('hidden');
  roundArea.classList.add('hidden');
  gameOver.classList.add('hidden');
  setup.classList.remove('hidden');
  el('roomCodeWrap').classList.add('hidden');
  el('qrImg').classList.add('hidden');
  el('joinUrlText').classList.add('hidden');
  el('startBtn').classList.add('hidden');
  document.querySelectorAll('.role-btn').forEach((b) => {
    b.disabled = false;
    b.classList.remove('picked', 'taken');
  });
}

document.querySelectorAll('.role-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const role = btn.dataset.role;
    socket.emit('predict:role:pick', { code, role }, (res) => {
      if (!res || !res.ok) {
        el('lobbyHint').textContent = (res && res.error) || "Couldn't claim that.";
        return;
      }
      myRole = role;
      hapticTap();
      saveSession();
    });
  });
});

el('startBtn').addEventListener('click', () => {
  socket.emit('predict:host:start', { code });
});

el('playAgainBtn').addEventListener('click', () => {
  gameOver.classList.add('hidden');
  roundArea.classList.remove('hidden');
  socket.emit('predict:host:playAgain', { code });
});

socket.on('connect', () => {
  if (!code || !myRole) return;
  socket.emit('predict:rejoin', { code, role: myRole, hostToken }, (res) => {
    if (!res || !res.ok) {
      resetToSetup();
      return;
    }
    setup.classList.add('hidden');
    lobby.classList.add('hidden');
    gameOver.classList.add('hidden');
    gameScore = res.gameScore || 0;
    el('gameScoreDisplay').textContent = gameScore;
    if (res.started && res.currentRound) {
      roundArea.classList.remove('hidden');
      renderRound(res.currentRound);
      if (res.currentRound.alreadyLocked) lockWaiting();
    } else if (res.started) {
      roundArea.classList.remove('hidden');
    } else {
      lobby.classList.remove('hidden');
    }
  });
});

socket.on('predict:room:cancelled', () => {
  resetToSetup();
  el('joinError').textContent = 'The host ended the game.';
});

socket.on('predict:roles:update', (state) => {
  const roles = state.roles || [];
  document.querySelectorAll('.role-btn').forEach((btn) => {
    const role = btn.dataset.role;
    const takenByOther = roles.includes(role) && myRole !== role;
    const pickedByMe = myRole === role;
    btn.disabled = takenByOther || pickedByMe;
    btn.classList.toggle('taken', takenByOther);
    btn.classList.toggle('picked', pickedByMe);
  });
  const bothReady = roles.includes('Louie') && roles.includes('Ariel');
  el('lobbyHint').classList.toggle('hidden', bothReady);
  if (isHost) {
    el('startBtn').classList.remove('hidden');
    el('startBtn').disabled = !bothReady;
  }
});

let currentOptionsCache = [];

function renderRound(data) {
  currentTargetRole = data.targetRole;
  currentOptionsCache = data.options;
  locked = false;
  el('waitingText').classList.add('hidden');
  el('categoryBadge').textContent = data.categoryLabel || data.category;
  el('roundNum').textContent = data.roundNumber;
  el('totalRounds').textContent = data.totalRounds;
  const amITarget = myRole === data.targetRole;
  el('roundHeader').textContent = amITarget ? '🎯 Answer honestly' : `🔮 Predict ${data.targetRole}`;
  el('questionText').textContent = data.question;
  const list = el('optionsList');
  list.innerHTML = '';
  data.options.forEach((opt, i) => {
    const btn = document.createElement('button');
    btn.className = 'option-btn';
    btn.textContent = opt;
    btn.addEventListener('click', () => selectOption(i, btn));
    list.appendChild(btn);
  });
}

function selectOption(index, btnEl) {
  if (locked) return;
  locked = true;
  hapticTap();
  document.querySelectorAll('.option-btn').forEach((b) => b.classList.remove('selected'));
  btnEl.classList.add('selected');
  socket.emit('predict:answer:submit', { code, choice: index });
  lockWaiting();
}

function lockWaiting() {
  document.querySelectorAll('.option-btn').forEach((b) => (b.disabled = true));
  el('waitingText').classList.remove('hidden');
}

socket.on('predict:round:new', (data) => {
  roundArea.classList.remove('hidden');
  renderRound(data);
});

async function revealCountdown() {
  const overlay = el('countdownOverlay');
  const numberEl = el('countdownNumber');
  overlay.classList.remove('hidden');
  const steps = ['3', '2', '1', 'REVEAL!'];
  for (let i = 0; i < steps.length; i++) {
    const isLast = i === steps.length - 1;
    numberEl.textContent = steps[i];
    numberEl.className = isLast ? 'countdown-go' : 'countdown-number';
    void numberEl.offsetWidth;
    numberEl.classList.add('play');
    if (isLast) playGo();
    else playTick();
    await new Promise((r) => setTimeout(r, 650));
  }
  overlay.classList.add('hidden');
}

socket.on('predict:reveal', async (data) => {
  gameScore = data.gameScore;
  el('gameScoreDisplay').textContent = gameScore;
  await revealCountdown();

  const targetLabel = currentTargetRole ? `${currentTargetRole}'s honest answer` : 'Honest answer';
  const predictorRole = currentTargetRole === 'Ariel' ? 'Louie' : 'Ariel';
  el('flipTargetLabel').textContent = targetLabel;
  el('flipPredictorLabel').textContent = `${predictorRole}'s prediction`;
  el('flipTargetValue').textContent = data.correctText != null ? data.correctText : "No answer — didn't lock in";
  el('flipPredictorValue').textContent =
    data.predictorChoice != null ? currentOptionsCache[data.predictorChoice] : "No guess — didn't lock in";
  el('matchBanner').textContent = data.match ? '🎉 MATCH!' : '❌ NO MATCH';
  el('matchBanner').className = data.match ? 'match-yes' : 'match-no';
  el('revealPhrase').textContent = data.revealPhrase;
  el('pointsEarned').textContent = data.match ? `+${data.points} points` : '';

  if (data.match) {
    playSuccess();
    hapticSuccess();
  } else {
    hapticTap();
  }

  revealOverlay.classList.remove('hidden');
  setTimeout(() => revealOverlay.classList.add('hidden'), 3600);
});

socket.on('predict:game:over', (data) => {
  roundArea.classList.add('hidden');
  gameOver.classList.remove('hidden');
  el('compatPct').textContent = data.accuracy;
  el('verdictHeading').textContent = data.verdict;
  el('questionsPlayedCount').textContent = data.questionsPlayed;
  el('matchesCount').textContent = data.matches;
  el('allTimeAccuracy').textContent = data.allTime.accuracy;
  el('allTimeGames').textContent = data.allTime.gamesPlayed;
});
