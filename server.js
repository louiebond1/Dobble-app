const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const QRCode = require('qrcode');
const { Server } = require('socket.io');
const http = require('http');
const { SYMBOLS, DECK } = require('./lib/deck');
const { PHOTOS } = require('./lib/photos');
const { QUESTIONS, CATEGORIES: PREDICT_CATEGORIES, DIFFICULTY_POINTS } = require('./lib/whatWouldYouSay');
const { DATES, CATEGORIES: DATE_CATEGORIES } = require('./lib/dates');
const { CUPS: HUGO_SPRITZ_CUPS } = require('./lib/hugoSpritzPong');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O/1/I/L
const ROOM_TTL_MS = 6 * 60 * 60 * 1000;

/** @type {Map<string, any>} */
const rooms = new Map();

// Lifetime win/speed stats, keyed by lowercased player name so "Louie" and
// "louie" are the same person. Persisted to a local JSON file — this survives
// normal restarts but NOT a fresh Railway deploy (new container, blank disk)
// unless a persistent volume is attached to the service.
const STATS_DIR = path.join(__dirname, 'data');
const STATS_FILE = path.join(STATS_DIR, 'stats.json');
/** @type {Map<string, {name: string, wins: number, totalTimeMs: number}>} */
const statsStore = new Map();

function loadStats() {
  try {
    const raw = fs.readFileSync(STATS_FILE, 'utf8');
    const entries = JSON.parse(raw);
    for (const entry of entries) {
      if (entry && entry.name) statsStore.set(entry.name.trim().toLowerCase(), entry);
    }
  } catch (err) {
    // no stats file yet — start fresh
  }
}

function saveStats() {
  try {
    fs.mkdirSync(STATS_DIR, { recursive: true });
    fs.writeFileSync(STATS_FILE, JSON.stringify(Array.from(statsStore.values()), null, 2));
  } catch (err) {
    console.error('Failed to save stats:', err.message);
  }
}

function recordLifetimeWin(name, timeMs) {
  const key = name.trim().toLowerCase();
  if (!key) return;
  const existing = statsStore.get(key) || { name, wins: 0, totalTimeMs: 0 };
  existing.name = name;
  existing.wins += 1;
  existing.totalTimeMs += timeMs;
  statsStore.set(key, existing);
  saveStats();
}

function allTimeStats(room) {
  return Array.from(room.players.values())
    .map((p) => {
      const rec = statsStore.get(p.name.trim().toLowerCase());
      return {
        name: p.name,
        wins: rec ? rec.wins : 0,
        avgTimeMs: rec && rec.wins > 0 ? Math.round(rec.totalTimeMs / rec.wins) : null,
      };
    })
    .sort((a, b) => b.wins - a.wins);
}

loadStats();

// All-time "What Would You Say?" compatibility stats — one shared record for
// the pair (this app is always just the two of them), persisted the same way
// as the matching-game stats.
const PREDICT_STATS_FILE = path.join(STATS_DIR, 'predict-stats.json');
let predictStats = { gamesPlayed: 0, totalQuestions: 0, totalMatches: 0, bestAccuracy: 0 };

function loadPredictStats() {
  try {
    const raw = fs.readFileSync(PREDICT_STATS_FILE, 'utf8');
    predictStats = { ...predictStats, ...JSON.parse(raw) };
  } catch (err) {
    // no file yet — start fresh
  }
}

function savePredictStats() {
  try {
    fs.mkdirSync(STATS_DIR, { recursive: true });
    fs.writeFileSync(PREDICT_STATS_FILE, JSON.stringify(predictStats, null, 2));
  } catch (err) {
    console.error('Failed to save predict stats:', err.message);
  }
}

loadPredictStats();

// Completed Date Roulette entries — an ever-growing archive ("Our Dates"),
// persisted the same way as everything else in data/.
const DATES_LOG_FILE = path.join(STATS_DIR, 'dates-log.json');
/** @type {Array<any>} */
let datesLog = [];

function loadDatesLog() {
  try {
    const raw = fs.readFileSync(DATES_LOG_FILE, 'utf8');
    datesLog = JSON.parse(raw);
  } catch (err) {
    // no file yet — start fresh
  }
}

function saveDatesLog() {
  try {
    fs.mkdirSync(STATS_DIR, { recursive: true });
    fs.writeFileSync(DATES_LOG_FILE, JSON.stringify(datesLog, null, 2));
  } catch (err) {
    console.error('Failed to save dates log:', err.message);
  }
}

loadDatesLog();

// Global (not per-room) anti-repeat memory — this app is always the same two
// players, so "recently used" is tracked once, not per room. Keeps the last
// third of each pool out of rotation, then lets it reshuffle back in.
function makeRecentTracker(poolSize) {
  const recent = [];
  const cap = Math.max(3, Math.round(poolSize * 0.34));
  return {
    has: (id) => recent.includes(id),
    add(id) {
      recent.push(id);
      if (recent.length > cap) recent.shift();
    },
  };
}
const recentQuestions = makeRecentTracker(QUESTIONS.length);
const recentDates = makeRecentTracker(DATES.length);

function pickQuestion(excludeIds) {
  const exclude = excludeIds instanceof Set ? excludeIds : new Set();
  let pool = QUESTIONS.filter((q) => !recentQuestions.has(q.id) && !exclude.has(q.id));
  if (pool.length === 0) pool = QUESTIONS.filter((q) => !exclude.has(q.id));
  if (pool.length === 0) pool = QUESTIONS;
  // Weight by category so the overall spread across a long play session
  // trends toward each category's target share instead of pure uniform draw.
  const weights = pool.map((q) => (PREDICT_CATEGORIES[q.category] || { weight: 10 }).weight);
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i];
    if (r <= 0) return pool[i];
  }
  return pool[pool.length - 1];
}

const MATCH_PHRASES = [
  "You two just RIZZ-ed the same brainwave 💫",
  "Certified telepathic. 🔮",
  "That's scary in-sync. 😳",
  "Same page, same paragraph, same word. 📖",
  "Compatibility level: unreasonable. 💕",
  "Okay but how. HOW. 🤯",
  "Couple goals, officially confirmed. ✅",
  "You read each other like a book. 📚",
  "Locked in. Perfectly. 🔒",
  "That's not luck, that's love. ❤️",
];
const NO_MATCH_PHRASES = [
  "Well. That's a conversation for later. 👀",
  "Somebody doesn't know somebody. 😬",
  "Plot twist! 🌀",
  "Back to the drawing board. 📝",
  "That one's going in the highlight reel. 🎬",
  "Bold guess. Wrong guess. 😅",
  "Not even close, but A for effort. 🫠",
  "Mysteries of love, deepened. 🌫️",
  "You'll get 'em next round. 🎯",
  "Interesting. Very interesting. 🕵️",
];
let lastMatchPhraseIdx = -1;
let lastNoMatchPhraseIdx = -1;
function pickRevealPhrase(match) {
  const list = match ? MATCH_PHRASES : NO_MATCH_PHRASES;
  let idx;
  do {
    idx = Math.floor(Math.random() * list.length);
  } while (list.length > 1 && idx === (match ? lastMatchPhraseIdx : lastNoMatchPhraseIdx));
  if (match) lastMatchPhraseIdx = idx;
  else lastNoMatchPhraseIdx = idx;
  return list[idx];
}

function compatibilityVerdict(pct) {
  if (pct >= 90) return 'Actually telepathic 🔮';
  if (pct >= 75) return "You two just get it ✨";
  if (pct >= 50) return 'Solid, with room to grow 🌱';
  return "Plenty left to learn about each other 👀";
}

/** @type {Map<string, any>} */
const predictRooms = new Map();

function predictRoomState(room) {
  return {
    code: room.code,
    roles: Array.from(room.sockets.values())
      .map((s) => s.role)
      .filter(Boolean),
    started: room.started,
  };
}

function endPredictGame(code) {
  const room = predictRooms.get(code);
  if (!room) return;
  room.started = false;
  clearTimeout(room.roundTimer);
  const pct = room.totalRoundsPlayed > 0 ? Math.round((room.matches / room.totalRoundsPlayed) * 100) : 0;

  predictStats.gamesPlayed += 1;
  predictStats.totalQuestions += room.totalRoundsPlayed;
  predictStats.totalMatches += room.matches;
  predictStats.bestAccuracy = Math.max(predictStats.bestAccuracy, pct);
  savePredictStats();

  const allTimePct =
    predictStats.totalQuestions > 0 ? Math.round((predictStats.totalMatches / predictStats.totalQuestions) * 100) : 0;

  io.to(code).emit('predict:game:over', {
    questionsPlayed: room.totalRoundsPlayed,
    matches: room.matches,
    accuracy: pct,
    verdict: compatibilityVerdict(pct),
    gameScore: room.gameScore,
    allTime: {
      gamesPlayed: predictStats.gamesPlayed,
      accuracy: allTimePct,
      bestAccuracy: predictStats.bestAccuracy,
    },
  });
}

function startPredictRound(code) {
  const room = predictRooms.get(code);
  if (!room) return;

  if (room.roundNumber >= room.totalRounds) {
    endPredictGame(code);
    return;
  }

  room.roundNumber += 1;
  room.targetRole = room.roundNumber % 2 === 1 ? 'Ariel' : 'Louie';
  const question = pickQuestion(room.usedQuestionIds);
  room.usedQuestionIds.add(question.id);
  recentQuestions.add(question.id);
  room.currentQuestion = question;
  room.submissions = { targetChoice: null, predictorChoice: null };

  io.to(code).emit('predict:round:new', {
    roundNumber: room.roundNumber,
    totalRounds: room.totalRounds,
    targetRole: room.targetRole,
    category: question.category,
    categoryLabel: (PREDICT_CATEGORIES[question.category] || {}).label || question.category,
    difficulty: question.difficulty,
    points: DIFFICULTY_POINTS[question.difficulty] || 100,
    question: question.question.split('{target}').join(room.targetRole),
    options: question.options,
  });

  clearTimeout(room.roundTimer);
  room.roundTimer = setTimeout(() => revealPredictRound(code, true), 45000);
}

function revealPredictRound(code, timedOut) {
  const room = predictRooms.get(code);
  if (!room || !room.currentQuestion) return;
  clearTimeout(room.roundTimer);

  const { targetChoice, predictorChoice } = room.submissions;
  const match = targetChoice != null && predictorChoice != null && targetChoice === predictorChoice;
  const points = match ? DIFFICULTY_POINTS[room.currentQuestion.difficulty] || 100 : 0;

  room.totalRoundsPlayed += 1;
  if (match) room.matches += 1;
  room.gameScore += points;

  const predictorRole = room.targetRole === 'Ariel' ? 'Louie' : 'Ariel';
  const predictorEntry = room.predictorTally.get(predictorRole);
  predictorEntry.total += 1;
  if (match) predictorEntry.correct += 1;

  io.to(code).emit('predict:reveal', {
    targetChoice,
    predictorChoice,
    match,
    timedOut: !!timedOut,
    points,
    gameScore: room.gameScore,
    correctText: room.currentQuestion.options[targetChoice] ?? null,
    revealPhrase: pickRevealPhrase(match),
    predictorAccuracy: Array.from(room.predictorTally.entries()).map(([role, t]) => ({
      role,
      correct: t.correct,
      total: t.total,
    })),
  });

  room.currentQuestion = null;
  setTimeout(() => startPredictRound(code), 4200);
}

function makeRoomCode() {
  let code;
  do {
    code = Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
  } while (rooms.has(code));
  return code;
}

function shuffledIndices(n) {
  const arr = Array.from({ length: n }, (_, i) => i);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function commonSymbol(cardA, cardB) {
  const setA = new Set(cardA);
  return cardB.find((id) => setA.has(id));
}

function scoreboard(room) {
  return Array.from(room.players.values())
    .map((p) => ({
      name: p.name,
      score: p.score,
      avgTimeMs: p.score > 0 ? Math.round(p.totalTimeMs / p.score) : null,
    }))
    .sort((a, b) => b.score - a.score);
}

function buildCard(indices) {
  return indices.map((id) => ({
    id,
    emoji: SYMBOLS[id].emoji,
    label: SYMBOLS[id].label,
    image: SYMBOLS[id].image || null,
  }));
}

function startRound(code) {
  const room = rooms.get(code);
  if (!room) return;

  if (room.roundNumber >= room.totalRounds || room.cardOrder.length < 2) {
    room.started = false;
    io.to(code).emit('game:over', { scores: scoreboard(room), allTime: allTimeStats(room) });
    return;
  }

  const aIdx = room.cardOrder.pop();
  const bIdx = room.cardOrder.pop();
  const cardA = DECK[aIdx];
  const cardB = DECK[bIdx];
  const commonId = commonSymbol(cardA, cardB);

  room.roundNumber += 1;
  room.roundActive = true;
  room.currentCommonId = commonId;
  room.roundStartedAt = Date.now();

  io.to(code).emit('round:new', {
    roundNumber: room.roundNumber,
    totalRounds: room.totalRounds,
    cardA: buildCard(cardA),
    cardB: buildCard(cardB),
  });

  clearTimeout(room.roundTimer);
  room.roundTimer = setTimeout(() => {
    if (!room.roundActive) return;
    room.roundActive = false;
    io.to(code).emit('round:timeout', {
      symbolId: commonId,
      emoji: SYMBOLS[commonId].emoji,
      label: SYMBOLS[commonId].label,
      image: SYMBOLS[commonId].image || null,
    });
    setTimeout(() => startRound(code), 3000);
  }, 23000); // padded ~3s over the visible answer window to cover the client-side countdown reveal
}

io.on('connection', (socket) => {
  socket.on('host:create', (payload, ack) => {
    const rounds = Math.max(3, Math.min(28, Number(payload && payload.rounds) || 15));
    const hostName = String((payload && payload.name) || '').trim().slice(0, 20) || 'Host';
    const code = makeRoomCode();
    const hostToken = crypto.randomUUID();
    const room = {
      code,
      hostSocketId: socket.id,
      hostToken,
      players: new Map(),
      started: false,
      totalRounds: rounds,
      roundNumber: 0,
      cardOrder: [],
      roundActive: false,
      currentCommonId: null,
      roundTimer: null,
      roundStartedAt: null,
      createdAt: Date.now(),
    };
    // The host plays too — they're a player like anyone who scans the QR code.
    room.players.set(socket.id, { name: hostName, score: 0, totalTimeMs: 0 });
    rooms.set(code, room);
    socket.join(code);
    socket.data.role = 'host';
    socket.data.code = code;
    if (typeof ack === 'function') ack({ code, hostToken, name: hostName });
    io.to(code).emit('players:update', scoreboard(room));
  });

  // Re-claims host privileges for a room after the host's socket reconnects
  // (e.g. iOS suspends a backgrounded home-screen app and issues a new
  // socket id on resume) — otherwise host:start/host:playAgain silently
  // no-op because they're gated on the stale socket id.
  socket.on('host:rejoin', (payload, ack) => {
    const code = String((payload && payload.code) || '').toUpperCase();
    const hostToken = String((payload && payload.hostToken) || '');
    const room = rooms.get(code);
    if (!room || !hostToken || room.hostToken !== hostToken) {
      if (typeof ack === 'function') ack({ ok: false });
      return;
    }
    // Carry the host's own player entry (name + score) over to their new
    // socket id so reconnecting mid-game doesn't reset their progress.
    const oldHostSocketId = room.hostSocketId;
    if (oldHostSocketId !== socket.id && room.players.has(oldHostSocketId)) {
      room.players.set(socket.id, room.players.get(oldHostSocketId));
      room.players.delete(oldHostSocketId);
    }
    room.hostSocketId = socket.id;
    socket.join(code);
    socket.data.role = 'host';
    socket.data.code = code;
    if (typeof ack === 'function') {
      ack({
        ok: true,
        players: scoreboard(room),
        started: room.started,
        roundNumber: room.roundNumber,
        totalRounds: room.totalRounds,
      });
    }
  });

  socket.on('player:join', (payload, ack) => {
    const code = String((payload && payload.code) || '').toUpperCase();
    const name = String((payload && payload.name) || '').trim().slice(0, 20) || 'Player';
    const room = rooms.get(code);
    if (!room) {
      if (typeof ack === 'function') ack({ ok: false, error: 'Room not found' });
      return;
    }
    room.players.set(socket.id, { name, score: 0, totalTimeMs: 0 });
    socket.join(code);
    socket.data.role = 'player';
    socket.data.code = code;
    if (typeof ack === 'function') ack({ ok: true, code, name, started: room.started });
    io.to(code).emit('players:update', scoreboard(room));
  });

  // Lets the host back out of a room they created (before or during a game)
  // instead of it just lingering until the TTL sweep. Anyone already
  // joined gets bounced back to the join screen.
  socket.on('host:cancel', (payload) => {
    const code = String((payload && payload.code) || '').toUpperCase();
    const room = rooms.get(code);
    if (!room || room.hostSocketId !== socket.id) return;
    clearTimeout(room.roundTimer);
    io.to(code).emit('room:cancelled');
    rooms.delete(code);
  });

  socket.on('host:start', (payload) => {
    const code = String((payload && payload.code) || '').toUpperCase();
    const room = rooms.get(code);
    if (!room || room.hostSocketId !== socket.id || room.players.size < 2) return;
    room.started = true;
    room.roundNumber = 0;
    room.cardOrder = shuffledIndices(DECK.length);
    for (const p of room.players.values()) {
      p.score = 0;
      p.totalTimeMs = 0;
    }
    startRound(code);
  });

  socket.on('host:playAgain', (payload) => {
    const code = String((payload && payload.code) || '').toUpperCase();
    const room = rooms.get(code);
    if (!room || room.hostSocketId !== socket.id) return;
    room.started = true;
    room.roundNumber = 0;
    room.cardOrder = shuffledIndices(DECK.length);
    for (const p of room.players.values()) {
      p.score = 0;
      p.totalTimeMs = 0;
    }
    io.to(code).emit('players:update', scoreboard(room));
    startRound(code);
  });

  socket.on('player:answer', (payload) => {
    const code = String((payload && payload.code) || '').toUpperCase();
    const symbolId = Number(payload && payload.symbolId);
    const room = rooms.get(code);
    if (!room || !room.roundActive) return;
    if (symbolId !== room.currentCommonId) return;

    const player = room.players.get(socket.id);
    if (!player) return;

    room.roundActive = false;
    clearTimeout(room.roundTimer);
    const answerTimeMs = Math.max(0, Date.now() - (room.roundStartedAt || Date.now()));
    player.score += 1;
    player.totalTimeMs += answerTimeMs;
    recordLifetimeWin(player.name, answerTimeMs);

    io.to(code).emit('round:result', {
      winnerName: player.name,
      symbolId,
      emoji: SYMBOLS[symbolId].emoji,
      label: SYMBOLS[symbolId].label,
      image: SYMBOLS[symbolId].image || null,
      scores: scoreboard(room),
    });

    setTimeout(() => startRound(code), 3000);
  });

  socket.on('disconnect', () => {
    const code = socket.data.code;
    if (code) {
      const room = rooms.get(code);
      if (room && socket.data.role === 'player' && room.players.delete(socket.id)) {
        io.to(code).emit('players:update', scoreboard(room));
      }
    }
    const predictCode = socket.data.predictCode;
    if (predictCode) {
      const room = predictRooms.get(predictCode);
      if (room) {
        room.sockets.delete(socket.id);
        io.to(predictCode).emit('predict:roles:update', predictRoomState(room));
      }
    }
  });

  // --- "What Would You Say?" ---------------------------------------------

  socket.on('predict:host:create', (payload, ack) => {
    const rounds = Math.max(3, Math.min(30, Number(payload && payload.rounds) || 12));
    const code = makeRoomCode();
    const hostToken = crypto.randomUUID();
    const room = {
      code,
      hostSocketId: socket.id,
      hostToken,
      sockets: new Map(),
      started: false,
      totalRounds: rounds,
      roundNumber: 0,
      totalRoundsPlayed: 0,
      matches: 0,
      gameScore: 0,
      targetRole: null,
      currentQuestion: null,
      submissions: { targetChoice: null, predictorChoice: null },
      usedQuestionIds: new Set(),
      predictorTally: new Map([
        ['Louie', { correct: 0, total: 0 }],
        ['Ariel', { correct: 0, total: 0 }],
      ]),
      roundTimer: null,
      createdAt: Date.now(),
    };
    room.sockets.set(socket.id, { role: null });
    predictRooms.set(code, room);
    socket.join(code);
    socket.data.predictRole2 = 'host';
    socket.data.predictCode = code;
    if (typeof ack === 'function') ack({ ok: true, code, hostToken });
    io.to(code).emit('predict:roles:update', predictRoomState(room));
  });

  socket.on('predict:player:join', (payload, ack) => {
    const code = String((payload && payload.code) || '').toUpperCase();
    const room = predictRooms.get(code);
    if (!room) {
      if (typeof ack === 'function') ack({ ok: false, error: 'Room not found' });
      return;
    }
    room.sockets.set(socket.id, { role: null });
    socket.join(code);
    socket.data.predictCode = code;
    if (typeof ack === 'function') ack({ ok: true, code, started: room.started });
    io.to(code).emit('predict:roles:update', predictRoomState(room));
  });

  socket.on('predict:host:cancel', (payload) => {
    const code = String((payload && payload.code) || '').toUpperCase();
    const room = predictRooms.get(code);
    if (!room || room.hostSocketId !== socket.id) return;
    clearTimeout(room.roundTimer);
    io.to(code).emit('predict:room:cancelled');
    predictRooms.delete(code);
  });

  // Reclaims a seat (and, if provided, host status) after a dropped/rebuilt
  // socket — same problem/fix as host:rejoin on the matching game.
  socket.on('predict:rejoin', (payload, ack) => {
    const code = String((payload && payload.code) || '').toUpperCase();
    const role = String((payload && payload.role) || '');
    const hostToken = payload && payload.hostToken;
    const room = predictRooms.get(code);
    if (!room || (role !== 'Louie' && role !== 'Ariel')) {
      if (typeof ack === 'function') ack({ ok: false });
      return;
    }
    if (hostToken && hostToken === room.hostToken) {
      room.hostSocketId = socket.id;
      socket.data.predictRole2 = 'host';
    }
    // Drop any stale socket entries still holding this role, then claim it fresh.
    for (const [sid, entry] of room.sockets) {
      if (entry.role === role && sid !== socket.id) room.sockets.delete(sid);
    }
    room.sockets.set(socket.id, { role });
    socket.join(code);
    socket.data.predictCode = code;
    if (typeof ack === 'function') {
      ack({
        ok: true,
        started: room.started,
        roundNumber: room.roundNumber,
        totalRounds: room.totalRounds,
        gameScore: room.gameScore,
        roles: predictRoomState(room).roles,
        currentRound: room.currentQuestion
          ? {
              roundNumber: room.roundNumber,
              totalRounds: room.totalRounds,
              targetRole: room.targetRole,
              category: room.currentQuestion.category,
              categoryLabel: (PREDICT_CATEGORIES[room.currentQuestion.category] || {}).label || room.currentQuestion.category,
              difficulty: room.currentQuestion.difficulty,
              points: DIFFICULTY_POINTS[room.currentQuestion.difficulty] || 100,
              question: room.currentQuestion.question.split('{target}').join(room.targetRole),
              options: room.currentQuestion.options,
              alreadyLocked:
                role === room.targetRole ? room.submissions.targetChoice != null : room.submissions.predictorChoice != null,
            }
          : null,
      });
    }
    io.to(code).emit('predict:roles:update', predictRoomState(room));
  });

  socket.on('predict:role:pick', (payload, ack) => {
    const code = String((payload && payload.code) || '').toUpperCase();
    const role = String((payload && payload.role) || '');
    const room = predictRooms.get(code);
    if (!room || (role !== 'Louie' && role !== 'Ariel')) {
      if (typeof ack === 'function') ack({ ok: false });
      return;
    }
    const taken = Array.from(room.sockets.values()).some((s) => s.role === role && room.sockets.get(socket.id) !== s);
    if (taken) {
      if (typeof ack === 'function') ack({ ok: false, error: 'That person already joined.' });
      return;
    }
    const entry = room.sockets.get(socket.id) || {};
    entry.role = role;
    room.sockets.set(socket.id, entry);
    if (typeof ack === 'function') ack({ ok: true, role });
    io.to(code).emit('predict:roles:update', predictRoomState(room));
  });

  socket.on('predict:host:start', (payload) => {
    const code = String((payload && payload.code) || '').toUpperCase();
    const room = predictRooms.get(code);
    if (!room || room.hostSocketId !== socket.id) return;
    const roles = Array.from(room.sockets.values()).map((s) => s.role);
    if (!roles.includes('Louie') || !roles.includes('Ariel')) return;
    room.started = true;
    room.roundNumber = 0;
    room.totalRoundsPlayed = 0;
    room.matches = 0;
    room.gameScore = 0;
    room.usedQuestionIds = new Set();
    room.predictorTally = new Map([
      ['Louie', { correct: 0, total: 0 }],
      ['Ariel', { correct: 0, total: 0 }],
    ]);
    startPredictRound(code);
  });

  socket.on('predict:answer:submit', (payload) => {
    const code = String((payload && payload.code) || '').toUpperCase();
    const choice = Number(payload && payload.choice);
    const room = predictRooms.get(code);
    if (!room || !room.currentQuestion || Number.isNaN(choice)) return;
    const entry = room.sockets.get(socket.id);
    if (!entry || !entry.role) return;
    if (entry.role === room.targetRole) {
      if (room.submissions.targetChoice != null) return;
      room.submissions.targetChoice = choice;
      socket.to(code).emit('predict:opponent:locked', { who: 'target' });
    } else {
      if (room.submissions.predictorChoice != null) return;
      room.submissions.predictorChoice = choice;
      socket.to(code).emit('predict:opponent:locked', { who: 'predictor' });
    }
    if (room.submissions.targetChoice != null && room.submissions.predictorChoice != null) {
      revealPredictRound(code, false);
    }
  });

  socket.on('predict:host:playAgain', (payload) => {
    const code = String((payload && payload.code) || '').toUpperCase();
    const room = predictRooms.get(code);
    if (!room || room.hostSocketId !== socket.id) return;
    room.started = true;
    room.roundNumber = 0;
    room.totalRoundsPlayed = 0;
    room.matches = 0;
    room.gameScore = 0;
    room.usedQuestionIds = new Set();
    room.predictorTally = new Map([
      ['Louie', { correct: 0, total: 0 }],
      ['Ariel', { correct: 0, total: 0 }],
    ]);
    startPredictRound(code);
  });
});

// Periodic cleanup of stale predict rooms — mirrors the matching-game sweep.
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of predictRooms) {
    if (now - room.createdAt > ROOM_TTL_MS) {
      clearTimeout(room.roundTimer);
      predictRooms.delete(code);
    }
  }
}, 30 * 60 * 1000);

// Periodic cleanup of stale rooms.
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (now - room.createdAt > ROOM_TTL_MS) rooms.delete(code);
  }
}, 30 * 60 * 1000);

app.get('/api/symbols', (req, res) => {
  res.json(buildCard(SYMBOLS.map((_, id) => id)));
});

app.get('/api/photos', (req, res) => {
  res.json(PHOTOS);
});

app.get('/api/qr', async (req, res) => {
  const code = String(req.query.code || '').toUpperCase();
  const type = req.query.type === 'predict' ? 'predict' : 'play';
  const store = type === 'predict' ? predictRooms : rooms;
  if (!store.has(code)) return res.status(404).json({ error: 'Room not found' });
  const joinUrl = `${req.protocol}://${req.get('host')}/${type}/${code}`;
  try {
    const qrDataUrl = await QRCode.toDataURL(joinUrl, { margin: 1, width: 320 });
    res.json({ joinUrl, qrDataUrl });
  } catch (err) {
    res.status(500).json({ error: 'QR generation failed' });
  }
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/play/:code', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'play.html'));
});

app.get('/trial', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'trial.html'));
});

app.get('/memory', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'memory.html'));
});

app.get('/predict', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'predict.html'));
});

app.get('/predict/:code', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'predict.html'));
});

app.get('/roulette', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'roulette.html'));
});

app.get('/hugo-spritz-pong', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'hugo-spritz-pong.html'));
});

app.get('/hugo-pong', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'hugo-pong.html'));
});

app.get('/api/hugo-spritz-pong', (req, res) => {
  const cups = HUGO_SPRITZ_CUPS.map((cup) => {
    const symbol = SYMBOLS.find((s) => s.label === cup.symbolLabel) || {};
    return { ...cup, emoji: symbol.emoji || '🥂', image: symbol.image || null };
  });
  res.json({ cups });
});

app.get('/api/trial', (req, res) => {
  const a = Math.floor(Math.random() * DECK.length);
  let b = Math.floor(Math.random() * DECK.length);
  while (b === a) b = Math.floor(Math.random() * DECK.length);
  const cardA = DECK[a];
  const cardB = DECK[b];
  const commonId = commonSymbol(cardA, cardB);
  res.json({ cardA: buildCard(cardA), cardB: buildCard(cardB), commonId });
});

function pickRandomDistinct(arr, n) {
  const pool = arr.slice();
  const picked = [];
  while (picked.length < n && pool.length) {
    const i = Math.floor(Math.random() * pool.length);
    picked.push(pool.splice(i, 1)[0]);
  }
  return picked;
}

function resolveDate(dateEntry) {
  if (!dateEntry.dynamic) return dateEntry;
  const resolved = { ...dateEntry };
  if (dateEntry.dynamicType === 'photo-recreate') {
    const photo = PHOTOS[Math.floor(Math.random() * PHOTOS.length)];
    resolved.resolvedPhoto = photo;
    resolved.description = `${dateEntry.description} (Tonight's memory: "${photo.label}")`;
  } else if (dateEntry.dynamicType === 'random-favourites') {
    const picks = pickRandomDistinct(SYMBOLS.map((s, id) => ({ id, ...s })), 3);
    resolved.resolvedSymbols = picks;
    resolved.description = `${dateEntry.description} (Tonight's three: ${picks.map((p) => p.label).join(', ')})`;
  }
  return resolved;
}

app.post('/api/dates/spin', express.json(), (req, res) => {
  const body = req.body || {};
  const surpriseMe = !!body.surpriseMe;
  let pool = DATES;
  if (!surpriseMe) {
    if (body.duration) pool = pool.filter((d) => d.duration === body.duration);
    if (body.budget) pool = pool.filter((d) => d.budget === body.budget);
    if (body.mood) pool = pool.filter((d) => d.mood === body.mood);
    if (body.location) pool = pool.filter((d) => d.location === body.location || d.location === 'either');
  }
  if (pool.length === 0) pool = DATES;

  let candidates = pool.filter((d) => !recentDates.has(d.id));
  if (candidates.length === 0) candidates = pool;

  const chosen = candidates[Math.floor(Math.random() * candidates.length)];
  recentDates.add(chosen.id);
  res.json({ date: resolveDate(chosen), poolSize: pool.length });
});

app.post('/api/dates/complete', express.json({ limit: '6mb' }), (req, res) => {
  const body = req.body || {};
  const dateId = String(body.dateId || '');
  const dateEntry = DATES.find((d) => d.id === dateId);
  if (!dateEntry) return res.status(404).json({ error: 'Unknown date' });
  const rating = Math.max(0, Math.min(10, Number(body.rating) || 0));
  const entry = {
    id: crypto.randomUUID(),
    dateId,
    title: dateEntry.title,
    category: dateEntry.category,
    completedAt: Date.now(),
    note: String(body.note || '').slice(0, 500),
    rating,
    photo: typeof body.photo === 'string' ? body.photo.slice(0, 6_000_000) : null,
    favourite: !!body.favourite,
  };
  datesLog.push(entry);
  saveDatesLog();
  res.json({ ok: true, entry, stats: datesStats() });
});

function datesStats() {
  const completed = datesLog.length;
  const rated = datesLog.filter((e) => e.rating > 0);
  const bestRated = rated.length ? rated.reduce((a, b) => (b.rating > a.rating ? b : a)) : null;
  const favourite = datesLog.filter((e) => e.favourite).slice(-1)[0] || null;
  return { completed, bestRated, favourite };
}

app.get('/api/dates/history', (req, res) => {
  res.json({ entries: datesLog.slice().reverse(), stats: datesStats(), categories: DATE_CATEGORIES });
});

app.use(express.static(path.join(__dirname, 'public')));

server.listen(PORT, () => {
  console.log(`Dobble Party listening on port ${PORT}`);
});
