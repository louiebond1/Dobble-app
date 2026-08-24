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
const { DECK: DRAW_WORDS } = require('./lib/drawWords');
const { TRIVIA_QUESTIONS } = require('./lib/triviaQuestions');
const { SCRAMBLE_WORDS } = require('./lib/scrambleWords');
const { COUNTRIES } = require('./lib/countries');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O/1/I/L
const ROOM_TTL_MS = 6 * 60 * 60 * 1000;

/** @type {Map<string, any>} */
const rooms = new Map();

/** @type {Map<string, any>} */
const memoryRooms = new Map();

/** @type {Map<string, any>} */
const drawRooms = new Map();
const DRAW_ROUND_MS = 70000;

/** @type {Map<string, any>} */
const reactionRooms = new Map();
const REACTION_MIN_DELAY_MS = 1200;
const REACTION_MAX_DELAY_MS = 4500;

/** @type {Map<string, any>} */
const triviaRooms = new Map();
const TRIVIA_ROUND_MS = 20000;

/** @type {Map<string, any>} */
const scrambleRooms = new Map();
const SCRAMBLE_ROUND_MS = 35000;

/** @type {Map<string, any>} */
const tttRooms = new Map();
const TTT_LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

/** @type {Map<string, any>} */
const puzzleRooms = new Map();
const PUZZLE_ROUND_MS = 90000;
const PUZZLE_SIZE = 3; // 3x3, 8 tiles + 1 blank

// Countries of the World — one long shared match instead of discrete rounds:
// both players guess against the same 197-marker map, first to claim a
// country keeps it, first to the target score (or most claimed when the
// 15-minute clock runs out) wins. Fuzzy-matching a typed guess against a
// country's name/aliases happens client-side (the client already needs the
// full list to render the map); the server only needs to arbitrate which
// player claimed a given country id first.
/** @type {Map<string, any>} */
const countryRooms = new Map();
const COUNTRY_ROUND_MS = 15 * 60 * 1000;
const COUNTRY_IDS = new Set(COUNTRIES.map((c) => c.id));

// Party Mashup — a decathlon-style match where each "leg" is a single round
// (rounds: 1) of a different existing duel game, played on that game's own
// page. It doesn't reimplement any game's rendering: reportMashupLegResult()
// (public/layout.js) reads the winner off that game's own game:over payload
// and reports it here, then the player is bounced back to /mashup for the
// next leg.
/** @type {Map<string, any>} */
const mashupRooms = new Map();
const MASHUP_GAMES = [
  { key: 'reaction', label: 'Reaction Duel', emoji: '⚡', route: '/reaction' },
  { key: 'trivia', label: 'Trivia Showdown', emoji: '🧠', route: '/trivia' },
  { key: 'scramble', label: 'Word Scramble Sprint', emoji: '🔤', route: '/scramble' },
  { key: 'ttt', label: 'Tic-Tac-Toe Showdown', emoji: '⭕', route: '/ttt' },
  { key: 'puzzle', label: 'Sliding Puzzle Race', emoji: '🧩', route: '/puzzle' },
  { key: 'draw', label: 'Doodle Duel', emoji: '🎨', route: '/draw' },
];
const MASHUP_GAME_KEYS = new Set(MASHUP_GAMES.map((g) => g.key));

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

// Overall "who's actually winning" tally between the two of them — this app
// only ever has two players, so it's a flat couple's scoreboard rather than
// a per-game leaderboard. Logged manually (tap "I won") after playing
// anything, in the app or in real life.
const LEADERBOARD_FILE = path.join(STATS_DIR, 'leaderboard.json');
let leaderboard = { louie: 2, ariel: 3 };

function loadLeaderboard() {
  try {
    const raw = fs.readFileSync(LEADERBOARD_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    leaderboard = {
      louie: Number.isFinite(parsed.louie) ? parsed.louie : 0,
      ariel: Number.isFinite(parsed.ariel) ? parsed.ariel : 0,
    };
  } catch (err) {
    // no file yet — start from the seeded score above
  }
}

function saveLeaderboard() {
  try {
    fs.mkdirSync(STATS_DIR, { recursive: true });
    fs.writeFileSync(LEADERBOARD_FILE, JSON.stringify(leaderboard, null, 2));
  } catch (err) {
    console.error('Failed to save leaderboard:', err.message);
  }
}

loadLeaderboard();
if (!fs.existsSync(LEADERBOARD_FILE)) saveLeaderboard(); // persist the initial seed on first boot

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

function memoryPool(source) {
  return source === 'photos' ? PHOTOS : buildCard(SYMBOLS.map((_, id) => id));
}

function buildMemoryDeck(source, pairCount) {
  const pool = memoryPool(source);
  const n = Math.max(2, Math.min(pool.length, pairCount));
  const chosen = shuffledIndices(pool.length).slice(0, n).map((i) => pool[i]);
  const doubled = [...chosen, ...chosen];
  const order = shuffledIndices(doubled.length);
  return order.map((i) => {
    const c = doubled[i];
    return { id: c.id, label: c.label, image: c.image || null, emoji: c.emoji || null };
  });
}

function memoryRoomPlayers(room) {
  return Array.from(room.players.values()).map((p) => ({ name: p.name, pairs: p.pairs }));
}

function memoryTurnName(room) {
  const id = room.playerOrder[room.turnIndex];
  const p = id && room.players.get(id);
  return p ? p.name : null;
}

function drawRoomPlayers(room) {
  return Array.from(room.players.values()).map((p) => ({ name: p.name, score: p.score }));
}

function pickDrawWord(usedIds) {
  const pool = DRAW_WORDS.filter((w) => !usedIds.has(w.id));
  const source = pool.length ? pool : DRAW_WORDS; // ran out of fresh words — allow repeats
  return source[Math.floor(Math.random() * source.length)];
}

function normalizeGuess(s) {
  return String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function startDrawRound(code) {
  const room = drawRooms.get(code);
  if (!room) return;

  if (room.roundNumber >= room.totalRounds) {
    endDrawGame(code);
    return;
  }

  room.roundNumber += 1;
  const drawerId = room.playerOrder[(room.roundNumber - 1) % 2];
  const guesserId = room.playerOrder[1 - ((room.roundNumber - 1) % 2)];
  const word = pickDrawWord(room.usedWordIds);
  room.usedWordIds.add(word.id);
  room.currentWord = word;
  room.drawerSocketId = drawerId;
  room.guesserSocketId = guesserId;
  room.roundDeadline = Date.now() + DRAW_ROUND_MS;
  room.roundActive = true;

  const drawer = room.players.get(drawerId);
  const guesser = room.players.get(guesserId);

  io.to(`draw:${code}`).emit('draw:round:start', {
    roundNumber: room.roundNumber,
    totalRounds: room.totalRounds,
    word: word.word,
    drawerName: drawer && drawer.name,
    guesserName: guesser && guesser.name,
    deadline: room.roundDeadline,
    players: drawRoomPlayers(room),
  });

  clearTimeout(room.roundTimer);
  room.roundTimer = setTimeout(() => resolveDrawRound(code, { timedOut: true }), DRAW_ROUND_MS);
}

function resolveDrawRound(code, { timedOut = false } = {}) {
  const room = drawRooms.get(code);
  if (!room || !room.roundActive) return;
  clearTimeout(room.roundTimer);
  room.roundActive = false;

  if (!timedOut) {
    const guesser = room.players.get(room.guesserSocketId);
    if (guesser) guesser.score += 1;
  }

  io.to(`draw:${code}`).emit('draw:round:result', {
    timedOut,
    word: room.currentWord.word,
    players: drawRoomPlayers(room),
  });

  setTimeout(() => startDrawRound(code), 2600);
}

function endDrawGame(code) {
  const room = drawRooms.get(code);
  if (!room) return;
  room.started = false;
  clearTimeout(room.roundTimer);
  io.to(`draw:${code}`).emit('draw:game:over', { players: drawRoomPlayers(room) });
}

// --- Reaction Duel helpers -------------------------------------------------

function reactionRoomPlayers(room) {
  return Array.from(room.players.values()).map((p) => ({ name: p.name, score: p.score }));
}

function startReactionRound(code) {
  const room = reactionRooms.get(code);
  if (!room) return;

  if (room.roundNumber >= room.totalRounds) {
    room.started = false;
    io.to(`reaction:${code}`).emit('reaction:game:over', { players: reactionRoomPlayers(room) });
    return;
  }

  room.roundNumber += 1;
  room.phase = 'waiting';
  room.goAt = null;
  clearTimeout(room.goTimer);

  io.to(`reaction:${code}`).emit('reaction:round:start', {
    roundNumber: room.roundNumber,
    totalRounds: room.totalRounds,
    players: reactionRoomPlayers(room),
  });

  const delay = REACTION_MIN_DELAY_MS + Math.random() * (REACTION_MAX_DELAY_MS - REACTION_MIN_DELAY_MS);
  room.goTimer = setTimeout(() => {
    room.phase = 'go';
    room.goAt = Date.now();
    io.to(`reaction:${code}`).emit('reaction:go', { at: room.goAt });
  }, delay);
}

// --- Trivia Showdown helpers -------------------------------------------------

function triviaRoomPlayers(room) {
  return Array.from(room.players.values()).map((p) => ({ name: p.name, score: p.score }));
}

function pickTriviaQuestion(usedIds) {
  const pool = TRIVIA_QUESTIONS.filter((q) => !usedIds.has(q.id));
  const source = pool.length ? pool : TRIVIA_QUESTIONS;
  return source[Math.floor(Math.random() * source.length)];
}

function startTriviaRound(code) {
  const room = triviaRooms.get(code);
  if (!room) return;

  if (room.roundNumber >= room.totalRounds) {
    room.started = false;
    io.to(`trivia:${code}`).emit('trivia:game:over', { players: triviaRoomPlayers(room) });
    return;
  }

  room.roundNumber += 1;
  const question = pickTriviaQuestion(room.usedQuestionIds);
  room.usedQuestionIds.add(question.id);
  room.currentQuestion = question;
  room.roundActive = true;
  room.wrongAnswerers = new Set();

  io.to(`trivia:${code}`).emit('trivia:round:start', {
    roundNumber: room.roundNumber,
    totalRounds: room.totalRounds,
    category: question.category,
    question: question.question,
    options: question.options,
    players: triviaRoomPlayers(room),
  });

  clearTimeout(room.roundTimer);
  room.roundTimer = setTimeout(() => resolveTriviaRound(code, { timedOut: true }), TRIVIA_ROUND_MS);
}

function resolveTriviaRound(code, { timedOut = false, winnerSocketId = null } = {}) {
  const room = triviaRooms.get(code);
  if (!room || !room.roundActive) return;
  clearTimeout(room.roundTimer);
  room.roundActive = false;

  let winner = null;
  if (winnerSocketId) {
    winner = room.players.get(winnerSocketId);
    if (winner) winner.score += 1;
  }

  io.to(`trivia:${code}`).emit('trivia:round:result', {
    timedOut,
    winnerName: winner ? winner.name : null,
    correctIndex: room.currentQuestion.correctIndex,
    correctText: room.currentQuestion.options[room.currentQuestion.correctIndex],
    players: triviaRoomPlayers(room),
  });

  room.currentQuestion = null;
  setTimeout(() => startTriviaRound(code), 2800);
}

// --- Word Scramble Sprint helpers -------------------------------------------------

function scrambleRoomPlayers(room) {
  return Array.from(room.players.values()).map((p) => ({ name: p.name, score: p.score }));
}

function pickScrambleWord(usedIds) {
  const pool = SCRAMBLE_WORDS.filter((w) => !usedIds.has(w.id));
  const source = pool.length ? pool : SCRAMBLE_WORDS;
  return source[Math.floor(Math.random() * source.length)];
}

function scrambleLetters(word) {
  const letters = word.split('');
  let scrambled = word;
  let attempts = 0;
  // Reshuffle until it actually differs from the original (a short word can
  // otherwise shuffle right back into itself) — capped so it can't loop forever.
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

function startScrambleRound(code) {
  const room = scrambleRooms.get(code);
  if (!room) return;

  if (room.roundNumber >= room.totalRounds) {
    room.started = false;
    io.to(`scramble:${code}`).emit('scramble:game:over', { players: scrambleRoomPlayers(room) });
    return;
  }

  room.roundNumber += 1;
  const word = pickScrambleWord(room.usedWordIds);
  room.usedWordIds.add(word.id);
  room.currentWord = word.word;
  room.roundActive = true;

  io.to(`scramble:${code}`).emit('scramble:round:start', {
    roundNumber: room.roundNumber,
    totalRounds: room.totalRounds,
    scrambled: scrambleLetters(word.word),
    players: scrambleRoomPlayers(room),
  });

  clearTimeout(room.roundTimer);
  room.roundTimer = setTimeout(() => resolveScrambleRound(code, { timedOut: true }), SCRAMBLE_ROUND_MS);
}

function resolveScrambleRound(code, { timedOut = false, winnerSocketId = null } = {}) {
  const room = scrambleRooms.get(code);
  if (!room || !room.roundActive) return;
  clearTimeout(room.roundTimer);
  room.roundActive = false;

  let winner = null;
  if (winnerSocketId) {
    winner = room.players.get(winnerSocketId);
    if (winner) winner.score += 1;
  }

  io.to(`scramble:${code}`).emit('scramble:round:result', {
    timedOut,
    winnerName: winner ? winner.name : null,
    word: room.currentWord,
    players: scrambleRoomPlayers(room),
  });

  room.currentWord = null;
  setTimeout(() => startScrambleRound(code), 2400);
}

// --- Tic-Tac-Toe Showdown helpers --------------------------------------------

function tttRoomPlayers(room) {
  return Array.from(room.players.values()).map((p) => ({ name: p.name, score: p.score }));
}

function tttWinner(board) {
  for (const [a, b, c] of TTT_LINES) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return { mark: board[a], line: [a, b, c] };
  }
  return null;
}

function startTttGame(code) {
  const room = tttRooms.get(code);
  if (!room) return;

  if (room.roundNumber >= room.totalRounds) {
    room.started = false;
    io.to(`ttt:${code}`).emit('ttt:game:over', { players: tttRoomPlayers(room) });
    return;
  }

  room.roundNumber += 1;
  room.board = Array(9).fill(null);
  // Alternate who plays X (and therefore goes first) each game in the match.
  const firstIdx = (room.roundNumber - 1) % 2;
  room.xSocketId = room.playerOrder[firstIdx];
  room.oSocketId = room.playerOrder[1 - firstIdx];
  room.turn = room.xSocketId;
  room.gameActive = true;

  io.to(`ttt:${code}`).emit('ttt:round:start', {
    roundNumber: room.roundNumber,
    totalRounds: room.totalRounds,
    board: room.board,
    xName: (room.players.get(room.xSocketId) || {}).name,
    oName: (room.players.get(room.oSocketId) || {}).name,
    turnName: (room.players.get(room.turn) || {}).name,
    players: tttRoomPlayers(room),
  });
}

function endTttGame(code, { winnerSocketId = null, draw = false, line = null } = {}) {
  const room = tttRooms.get(code);
  if (!room) return;
  room.gameActive = false;

  if (winnerSocketId) {
    const winner = room.players.get(winnerSocketId);
    if (winner) winner.score += 1;
  }

  io.to(`ttt:${code}`).emit('ttt:round:result', {
    board: room.board,
    draw,
    line,
    winnerName: winnerSocketId ? (room.players.get(winnerSocketId) || {}).name : null,
    players: tttRoomPlayers(room),
  });

  setTimeout(() => startTttGame(code), 2800);
}

// --- Sliding Puzzle Race helpers ---------------------------------------------

function puzzleRoomPlayers(room) {
  return Array.from(room.players.values()).map((p) => ({ name: p.name, score: p.score }));
}

function pickPuzzlePhoto(usedIds) {
  const pool = PHOTOS.filter((p) => !usedIds.has(p.id));
  const source = pool.length ? pool : PHOTOS;
  return source[Math.floor(Math.random() * source.length)];
}

// Shuffles by applying random *valid* slide moves from the solved state, so
// the result is always solvable — never generates an unsolvable permutation.
function shufflePuzzle(moves = 80) {
  const order = [0, 1, 2, 3, 4, 5, 6, 7, null];
  let blankIdx = order.indexOf(null);
  let lastMove = -1;
  for (let i = 0; i < moves; i++) {
    const row = Math.floor(blankIdx / PUZZLE_SIZE);
    const col = blankIdx % PUZZLE_SIZE;
    const candidates = [];
    if (row > 0) candidates.push(blankIdx - PUZZLE_SIZE);
    if (row < PUZZLE_SIZE - 1) candidates.push(blankIdx + PUZZLE_SIZE);
    if (col > 0) candidates.push(blankIdx - 1);
    if (col < PUZZLE_SIZE - 1) candidates.push(blankIdx + 1);
    const options = candidates.filter((c) => c !== lastMove);
    const swapWith = options[Math.floor(Math.random() * options.length)];
    [order[blankIdx], order[swapWith]] = [order[swapWith], order[blankIdx]];
    lastMove = blankIdx;
    blankIdx = swapWith;
  }
  return order;
}

function startPuzzleRound(code) {
  const room = puzzleRooms.get(code);
  if (!room) return;

  if (room.roundNumber >= room.totalRounds) {
    room.started = false;
    io.to(`puzzle:${code}`).emit('puzzle:game:over', { players: puzzleRoomPlayers(room) });
    return;
  }

  room.roundNumber += 1;
  const photo = pickPuzzlePhoto(room.usedPhotoIds);
  room.usedPhotoIds.add(photo.id);
  room.currentPhoto = photo;
  room.roundActive = true;

  io.to(`puzzle:${code}`).emit('puzzle:round:start', {
    roundNumber: room.roundNumber,
    totalRounds: room.totalRounds,
    image: photo.image,
    order: shufflePuzzle(),
    players: puzzleRoomPlayers(room),
  });

  clearTimeout(room.roundTimer);
  room.roundTimer = setTimeout(() => resolvePuzzleRound(code, { timedOut: true }), PUZZLE_ROUND_MS);
}

function resolvePuzzleRound(code, { timedOut = false, winnerSocketId = null } = {}) {
  const room = puzzleRooms.get(code);
  if (!room || !room.roundActive) return;
  clearTimeout(room.roundTimer);
  room.roundActive = false;

  let winner = null;
  if (winnerSocketId) {
    winner = room.players.get(winnerSocketId);
    if (winner) winner.score += 1;
  }

  io.to(`puzzle:${code}`).emit('puzzle:round:result', {
    timedOut,
    winnerName: winner ? winner.name : null,
    players: puzzleRoomPlayers(room),
  });

  room.currentPhoto = null;
  setTimeout(() => startPuzzleRound(code), 2800);
}

// --- Countries of the World helpers ----------------------------------------

function countryRoomPlayers(room) {
  return Array.from(room.players.values()).map((p) => ({ name: p.name, score: p.score }));
}

function endCountriesGame(code, reason) {
  const room = countryRooms.get(code);
  if (!room || !room.started) return;
  room.started = false;
  clearTimeout(room.gameTimer);
  io.to(`countries:${code}`).emit('countries:game:over', {
    reason,
    players: countryRoomPlayers(room),
    claimedIds: Array.from(room.claimed.keys()),
  });
}

// --- Party Mashup helpers ----------------------------------------------------

function mashupRoomPlayers(room) {
  return Array.from(room.players.values()).map((p) => ({ name: p.name, score: p.score }));
}

// Builds a leg order of exactly `totalLegs` game keys with no repeats until
// every selected game has appeared once (repeated shuffled passes through
// the pool, concatenated and trimmed) — a fair rotation instead of pure
// random-with-replacement, which could otherwise repeat the same game twice
// in a row.
function buildMashupLegOrder(gameKeys, totalLegs) {
  const pool = gameKeys && gameKeys.length ? gameKeys : MASHUP_GAMES.map((g) => g.key);
  const order = [];
  while (order.length < totalLegs) {
    const shuffled = pool.slice();
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    order.push(...shuffled);
  }
  return order.slice(0, totalLegs);
}

// Dispatches the next leg: picks the next game in legOrder, marks the room
// as awaiting that leg's result, and broadcasts it so any client currently
// sitting on /mashup (lobby or leg-transition screen) redirects to it.
// Clients that reconnect later (having already navigated away) instead learn
// about the active leg from the join ack — see mashup:quickplay:join.
function startMashupLeg(code) {
  const room = mashupRooms.get(code);
  if (!room || room.awaitingResult || room.legIndex >= room.legOrder.length) return;

  const gameKey = room.legOrder[room.legIndex];
  const game = MASHUP_GAMES.find((g) => g.key === gameKey);
  room.legIndex += 1;
  room.awaitingResult = true;
  room.currentGame = game;

  io.to(`mashup:${code}`).emit('mashup:leg:start', {
    legIndex: room.legIndex,
    totalLegs: room.legOrder.length,
    game,
    players: mashupRoomPlayers(room),
  });
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

  // Fast path for the two of them specifically: no code to share, no QR to
  // scan. Both devices join the same well-known room — whoever gets here
  // first creates it (and becomes host), the second just joins it. "OURS"
  // can never collide with a random makeRoomCode() code since 'O' is
  // excluded from CODE_CHARS.
  socket.on('quickplay:join', (payload, ack) => {
    const name = String((payload && payload.name) || '').trim().slice(0, 20) || 'Player';
    const code = 'OURS';
    let room = rooms.get(code);
    // Quick play doesn't persist the hostToken across page reloads, so a
    // room abandoned without a clean host:cancel (tab closed, next-day
    // reopen) can be left with a hostSocketId/players pointing at sockets
    // that are no longer connected. Prune those before deciding host status
    // so the fixed 'OURS' room never gets permanently stuck host-less.
    if (room) {
      for (const pid of room.players.keys()) {
        if (!io.sockets.sockets.has(pid)) room.players.delete(pid);
      }
    }
    let isHost = false;
    let hostToken = null;
    if (!room || room.players.size === 0 || !io.sockets.sockets.has(room.hostSocketId)) {
      isHost = true;
      hostToken = crypto.randomUUID();
      if (!room) {
        room = {
          code,
          players: new Map(),
          started: false,
          totalRounds: 15,
          roundNumber: 0,
          cardOrder: [],
          roundActive: false,
          currentCommonId: null,
          roundTimer: null,
          roundStartedAt: null,
          createdAt: Date.now(),
        };
        rooms.set(code, room);
      } else {
        clearTimeout(room.roundTimer);
        room.started = false;
        room.roundNumber = 0;
        room.roundActive = false;
      }
      room.hostToken = hostToken;
      room.hostSocketId = socket.id;
    }
    room.players.set(socket.id, { name, score: 0, totalTimeMs: 0 });
    socket.join(code);
    socket.data.role = isHost ? 'host' : 'player';
    socket.data.code = code;
    if (typeof ack === 'function') {
      ack({ ok: true, code, name, isHost, hostToken, started: room.started });
    }
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

  // --- Memory Match (networked head-to-head) ------------------------------
  // Same fixed-code Quick Play pattern as the matching game's 'OURS' room,
  // but on its own Map/io-room namespace ('mem:OURS') so the two games never
  // cross-broadcast. The deck is built and owned server-side so both phones
  // stay in sync — clients only render what they're told and emit taps.

  socket.on('memory:quickplay:join', (payload, ack) => {
    const name = String((payload && payload.name) || '').trim().slice(0, 20) || 'Player';
    const code = 'OURS';
    let room = memoryRooms.get(code);
    // Same staleness guard as the matching game's quickplay:join — quick
    // play never persists a hostToken across reloads, so an abandoned room
    // (tab closed without a clean cancel) must not get stuck host-less.
    if (room) {
      for (const pid of room.players.keys()) {
        if (!io.sockets.sockets.has(pid)) room.players.delete(pid);
      }
    }
    let isHost = false;
    let hostToken = null;
    if (!room || room.players.size === 0 || !io.sockets.sockets.has(room.hostSocketId)) {
      isHost = true;
      hostToken = crypto.randomUUID();
      if (!room) {
        room = {
          code,
          players: new Map(),
          started: false,
          source: 'favourites',
          pairCount: 12,
          deck: [],
          matched: [],
          pending: [],
          turnIndex: 0,
          playerOrder: [],
          createdAt: Date.now(),
        };
        memoryRooms.set(code, room);
      } else {
        room.started = false;
        room.deck = [];
        room.matched = [];
        room.pending = [];
        room.turnIndex = 0;
        room.playerOrder = [];
      }
      room.hostToken = hostToken;
      room.hostSocketId = socket.id;
    }
    room.players.set(socket.id, { name, pairs: 0 });
    socket.join(`mem:${code}`);
    socket.data.memoryRole = isHost ? 'host' : 'player';
    socket.data.memoryCode = code;
    if (typeof ack === 'function') {
      ack({ ok: true, code, name, isHost, hostToken, started: room.started });
    }
    io.to(`mem:${code}`).emit('memory:players:update', memoryRoomPlayers(room));
  });

  socket.on('memory:host:cancel', (payload) => {
    const code = String((payload && payload.code) || '').toUpperCase();
    const room = memoryRooms.get(code);
    if (!room || room.hostSocketId !== socket.id) return;
    io.to(`mem:${code}`).emit('memory:room:cancelled');
    memoryRooms.delete(code);
  });

  socket.on('memory:host:start', (payload) => {
    const code = String((payload && payload.code) || '').toUpperCase();
    const room = memoryRooms.get(code);
    if (!room || room.hostSocketId !== socket.id || room.players.size < 2) return;
    const source = (payload && payload.source) === 'photos' ? 'photos' : 'favourites';
    const pool = memoryPool(source);
    const pairCount = Math.max(2, Math.min(pool.length, Number(payload && payload.pairCount) || 12));

    room.source = source;
    room.pairCount = pairCount;
    room.deck = buildMemoryDeck(source, pairCount);
    room.matched = [];
    room.pending = [];
    room.turnIndex = 0;
    room.playerOrder = Array.from(room.players.keys());
    room.started = true;
    for (const p of room.players.values()) p.pairs = 0;

    io.to(`mem:${code}`).emit('memory:round:start', {
      deck: room.deck,
      source,
      pairCount,
      players: memoryRoomPlayers(room),
      turnName: memoryTurnName(room),
    });
  });

  socket.on('memory:flip', (payload) => {
    const code = String((payload && payload.code) || '').toUpperCase();
    const index = Number(payload && payload.index);
    const room = memoryRooms.get(code);
    if (!room || !room.started) return;
    if (room.playerOrder[room.turnIndex] !== socket.id) return;
    if (!Number.isInteger(index) || index < 0 || index >= room.deck.length) return;
    if (room.matched.includes(index) || room.pending.includes(index)) return;
    if (room.pending.length >= 2) return;

    room.pending.push(index);
    io.to(`mem:${code}`).emit('memory:flip', { index });
    if (room.pending.length < 2) return;

    const [i1, i2] = room.pending;
    const isMatch = room.deck[i1].id === room.deck[i2].id;
    setTimeout(() => {
      if (isMatch) {
        room.matched.push(i1, i2);
        const turnPlayer = room.players.get(room.playerOrder[room.turnIndex]);
        if (turnPlayer) turnPlayer.pairs += 1;
      } else {
        room.turnIndex = 1 - room.turnIndex;
      }
      room.pending = [];
      const over = room.matched.length === room.deck.length;
      if (over) room.started = false;
      io.to(`mem:${code}`).emit('memory:resolve', {
        index1: i1,
        index2: i2,
        matched: isMatch,
        players: memoryRoomPlayers(room),
        turnName: memoryTurnName(room),
        over,
      });
    }, 700);
  });

  // --- Doodle Duel (networked draw & guess) --------------------------------
  // Same fixed-code Quick Play pattern as the other two-person games. The
  // word is broadcast to both players (same trust model the rest of this
  // private app already uses) — the client just doesn't display it to
  // whoever isn't the drawer. Pen strokes are relayed live, drawer -> guesser
  // only, with the server owning the round timer, word choice, and scoring.

  socket.on('draw:quickplay:join', (payload, ack) => {
    const name = String((payload && payload.name) || '').trim().slice(0, 20) || 'Player';
    const code = 'OURS';
    let room = drawRooms.get(code);
    if (room) {
      for (const pid of room.players.keys()) {
        if (!io.sockets.sockets.has(pid)) room.players.delete(pid);
      }
    }
    let isHost = false;
    let hostToken = null;
    if (!room || room.players.size === 0 || !io.sockets.sockets.has(room.hostSocketId)) {
      isHost = true;
      hostToken = crypto.randomUUID();
      if (!room) {
        room = {
          code,
          players: new Map(),
          started: false,
          totalRounds: 8,
          roundNumber: 0,
          roundActive: false,
          currentWord: null,
          drawerSocketId: null,
          guesserSocketId: null,
          roundDeadline: null,
          roundTimer: null,
          usedWordIds: new Set(),
          playerOrder: [],
          createdAt: Date.now(),
        };
        drawRooms.set(code, room);
      } else {
        clearTimeout(room.roundTimer);
        room.started = false;
        room.roundNumber = 0;
        room.roundActive = false;
        room.currentWord = null;
        room.usedWordIds = new Set();
        room.playerOrder = [];
      }
      room.hostToken = hostToken;
      room.hostSocketId = socket.id;
    }
    room.players.set(socket.id, { name, score: 0 });
    socket.join(`draw:${code}`);
    socket.data.drawRole = isHost ? 'host' : 'player';
    socket.data.drawCode = code;
    if (typeof ack === 'function') {
      ack({ ok: true, code, name, isHost, hostToken, started: room.started });
    }
    io.to(`draw:${code}`).emit('draw:players:update', drawRoomPlayers(room));
  });

  socket.on('draw:host:cancel', (payload) => {
    const code = String((payload && payload.code) || '').toUpperCase();
    const room = drawRooms.get(code);
    if (!room || room.hostSocketId !== socket.id) return;
    clearTimeout(room.roundTimer);
    io.to(`draw:${code}`).emit('draw:room:cancelled');
    drawRooms.delete(code);
  });

  socket.on('draw:host:start', (payload) => {
    const code = String((payload && payload.code) || '').toUpperCase();
    const room = drawRooms.get(code);
    if (!room || room.hostSocketId !== socket.id || room.players.size < 2) return;
    room.totalRounds = Math.max(1, Math.min(20, Number(payload && payload.rounds) || 8));
    room.roundNumber = 0;
    room.usedWordIds = new Set();
    room.playerOrder = Array.from(room.players.keys());
    room.started = true;
    for (const p of room.players.values()) p.score = 0;
    startDrawRound(code);
  });

  socket.on('draw:stroke', (payload) => {
    const code = String((payload && payload.code) || '').toUpperCase();
    const room = drawRooms.get(code);
    if (!room || !room.roundActive || socket.id !== room.drawerSocketId) return;
    socket.to(`draw:${code}`).emit('draw:stroke', {
      type: payload && payload.type,
      x: Number(payload && payload.x),
      y: Number(payload && payload.y),
      tool: payload && payload.tool === 'eraser' ? 'eraser' : 'pen',
      color: String((payload && payload.color) || '').slice(0, 20),
    });
  });

  socket.on('draw:clear', (payload) => {
    const code = String((payload && payload.code) || '').toUpperCase();
    const room = drawRooms.get(code);
    if (!room || !room.roundActive || socket.id !== room.drawerSocketId) return;
    socket.to(`draw:${code}`).emit('draw:clear');
  });

  socket.on('draw:undo', (payload) => {
    const code = String((payload && payload.code) || '').toUpperCase();
    const room = drawRooms.get(code);
    if (!room || !room.roundActive || socket.id !== room.drawerSocketId) return;
    socket.to(`draw:${code}`).emit('draw:undo');
  });

  socket.on('draw:skip', (payload) => {
    const code = String((payload && payload.code) || '').toUpperCase();
    const room = drawRooms.get(code);
    if (!room || !room.roundActive || socket.id !== room.drawerSocketId) return;

    clearTimeout(room.roundTimer);
    const word = pickDrawWord(room.usedWordIds);
    room.usedWordIds.add(word.id);
    room.currentWord = word;
    room.roundDeadline = Date.now() + DRAW_ROUND_MS;

    io.to(`draw:${code}`).emit('draw:word:skipped', { word: word.word, deadline: room.roundDeadline });
    room.roundTimer = setTimeout(() => resolveDrawRound(code, { timedOut: true }), DRAW_ROUND_MS);
  });

  socket.on('draw:guess', (payload) => {
    const code = String((payload && payload.code) || '').toUpperCase();
    const text = String((payload && payload.text) || '').slice(0, 60);
    const room = drawRooms.get(code);
    if (!room || !room.roundActive || socket.id !== room.guesserSocketId || !text.trim()) return;

    const guesser = room.players.get(socket.id);
    if (!guesser) return;

    const correct = normalizeGuess(text) === normalizeGuess(room.currentWord.word);
    io.to(`draw:${code}`).emit('draw:guess', { name: guesser.name, text, correct });
    if (correct) resolveDrawRound(code, { timedOut: false });
  });

  // --- Reaction Duel (networked reflex race) --------------------------------
  // Same fixed-code Quick Play pattern as the other two-person games. The
  // "go" moment is decided server-side and only broadcast at the instant it
  // actually happens — the delay itself is never sent to the client ahead of
  // time, so there's nothing to time or cheat. First tap the server receives
  // during the 'go' phase wins; a tap during 'waiting' is an instant false
  // start for whoever sent it.

  socket.on('reaction:quickplay:join', (payload, ack) => {
    const name = String((payload && payload.name) || '').trim().slice(0, 20) || 'Player';
    const code = 'OURS';
    let room = reactionRooms.get(code);
    if (room) {
      for (const pid of room.players.keys()) {
        if (!io.sockets.sockets.has(pid)) room.players.delete(pid);
      }
    }
    let isHost = false;
    let hostToken = null;
    if (!room || room.players.size === 0 || !io.sockets.sockets.has(room.hostSocketId)) {
      isHost = true;
      hostToken = crypto.randomUUID();
      if (!room) {
        room = {
          code,
          players: new Map(),
          started: false,
          totalRounds: 8,
          roundNumber: 0,
          phase: 'idle',
          goAt: null,
          goTimer: null,
          createdAt: Date.now(),
        };
        reactionRooms.set(code, room);
      } else {
        clearTimeout(room.goTimer);
        room.started = false;
        room.roundNumber = 0;
        room.phase = 'idle';
        room.goAt = null;
      }
      room.hostToken = hostToken;
      room.hostSocketId = socket.id;
    }
    room.players.set(socket.id, { name, score: 0 });
    socket.join(`reaction:${code}`);
    socket.data.reactionRole = isHost ? 'host' : 'player';
    socket.data.reactionCode = code;
    if (typeof ack === 'function') {
      ack({ ok: true, code, name, isHost, hostToken, started: room.started });
    }
    io.to(`reaction:${code}`).emit('reaction:players:update', reactionRoomPlayers(room));
  });

  socket.on('reaction:host:cancel', (payload) => {
    const code = String((payload && payload.code) || '').toUpperCase();
    const room = reactionRooms.get(code);
    if (!room || room.hostSocketId !== socket.id) return;
    clearTimeout(room.goTimer);
    io.to(`reaction:${code}`).emit('reaction:room:cancelled');
    reactionRooms.delete(code);
  });

  socket.on('reaction:host:start', (payload) => {
    const code = String((payload && payload.code) || '').toUpperCase();
    const room = reactionRooms.get(code);
    if (!room || room.hostSocketId !== socket.id || room.players.size < 2) return;
    room.totalRounds = Math.max(1, Math.min(20, Number(payload && payload.rounds) || 8));
    room.roundNumber = 0;
    room.started = true;
    for (const p of room.players.values()) p.score = 0;
    startReactionRound(code);
  });

  socket.on('reaction:tap', (payload) => {
    const code = String((payload && payload.code) || '').toUpperCase();
    const room = reactionRooms.get(code);
    if (!room || !room.started || room.phase === 'idle' || room.phase === 'resolved') return;
    const player = room.players.get(socket.id);
    if (!player) return;

    if (room.phase === 'waiting') {
      room.phase = 'resolved';
      clearTimeout(room.goTimer);
      const opponent = Array.from(room.players.values()).find((p) => p !== player);
      if (opponent) opponent.score += 1;
      io.to(`reaction:${code}`).emit('reaction:round:result', {
        falseStart: true,
        loserName: player.name,
        winnerName: opponent ? opponent.name : null,
        players: reactionRoomPlayers(room),
      });
      setTimeout(() => startReactionRound(code), 2200);
      return;
    }

    // room.phase === 'go' — first tap the server processes wins the round.
    room.phase = 'resolved';
    const reactionMs = Date.now() - room.goAt;
    player.score += 1;
    io.to(`reaction:${code}`).emit('reaction:round:result', {
      falseStart: false,
      winnerName: player.name,
      reactionMs,
      players: reactionRoomPlayers(room),
    });
    setTimeout(() => startReactionRound(code), 2200);
  });

  // --- Trivia Showdown (networked buzzer race) ------------------------------

  socket.on('trivia:quickplay:join', (payload, ack) => {
    const name = String((payload && payload.name) || '').trim().slice(0, 20) || 'Player';
    const code = 'OURS';
    let room = triviaRooms.get(code);
    if (room) {
      for (const pid of room.players.keys()) {
        if (!io.sockets.sockets.has(pid)) room.players.delete(pid);
      }
    }
    let isHost = false;
    let hostToken = null;
    if (!room || room.players.size === 0 || !io.sockets.sockets.has(room.hostSocketId)) {
      isHost = true;
      hostToken = crypto.randomUUID();
      if (!room) {
        room = {
          code,
          players: new Map(),
          started: false,
          totalRounds: 8,
          roundNumber: 0,
          roundActive: false,
          currentQuestion: null,
          wrongAnswerers: new Set(),
          usedQuestionIds: new Set(),
          roundTimer: null,
          createdAt: Date.now(),
        };
        triviaRooms.set(code, room);
      } else {
        clearTimeout(room.roundTimer);
        room.started = false;
        room.roundNumber = 0;
        room.roundActive = false;
        room.currentQuestion = null;
        room.usedQuestionIds = new Set();
      }
      room.hostToken = hostToken;
      room.hostSocketId = socket.id;
    }
    room.players.set(socket.id, { name, score: 0 });
    socket.join(`trivia:${code}`);
    socket.data.triviaRole = isHost ? 'host' : 'player';
    socket.data.triviaCode = code;
    if (typeof ack === 'function') {
      ack({ ok: true, code, name, isHost, hostToken, started: room.started });
    }
    io.to(`trivia:${code}`).emit('trivia:players:update', triviaRoomPlayers(room));
  });

  socket.on('trivia:host:cancel', (payload) => {
    const code = String((payload && payload.code) || '').toUpperCase();
    const room = triviaRooms.get(code);
    if (!room || room.hostSocketId !== socket.id) return;
    clearTimeout(room.roundTimer);
    io.to(`trivia:${code}`).emit('trivia:room:cancelled');
    triviaRooms.delete(code);
  });

  socket.on('trivia:host:start', (payload) => {
    const code = String((payload && payload.code) || '').toUpperCase();
    const room = triviaRooms.get(code);
    if (!room || room.hostSocketId !== socket.id || room.players.size < 2) return;
    room.totalRounds = Math.max(1, Math.min(25, Number(payload && payload.rounds) || 8));
    room.roundNumber = 0;
    room.usedQuestionIds = new Set();
    room.started = true;
    for (const p of room.players.values()) p.score = 0;
    startTriviaRound(code);
  });

  socket.on('trivia:answer', (payload) => {
    const code = String((payload && payload.code) || '').toUpperCase();
    const index = Number(payload && payload.index);
    const room = triviaRooms.get(code);
    if (!room || !room.roundActive) return;
    if (!room.players.has(socket.id) || room.wrongAnswerers.has(socket.id)) return;

    if (index === room.currentQuestion.correctIndex) {
      resolveTriviaRound(code, { timedOut: false, winnerSocketId: socket.id });
      return;
    }

    room.wrongAnswerers.add(socket.id);
    const player = room.players.get(socket.id);
    io.to(`trivia:${code}`).emit('trivia:wrong', { name: player.name, index });
    if (room.wrongAnswerers.size >= room.players.size) {
      resolveTriviaRound(code, { timedOut: false, winnerSocketId: null });
    }
  });

  // --- Word Scramble Sprint (networked unscramble race) ---------------------

  socket.on('scramble:quickplay:join', (payload, ack) => {
    const name = String((payload && payload.name) || '').trim().slice(0, 20) || 'Player';
    const code = 'OURS';
    let room = scrambleRooms.get(code);
    if (room) {
      for (const pid of room.players.keys()) {
        if (!io.sockets.sockets.has(pid)) room.players.delete(pid);
      }
    }
    let isHost = false;
    let hostToken = null;
    if (!room || room.players.size === 0 || !io.sockets.sockets.has(room.hostSocketId)) {
      isHost = true;
      hostToken = crypto.randomUUID();
      if (!room) {
        room = {
          code,
          players: new Map(),
          started: false,
          totalRounds: 8,
          roundNumber: 0,
          roundActive: false,
          currentWord: null,
          usedWordIds: new Set(),
          roundTimer: null,
          createdAt: Date.now(),
        };
        scrambleRooms.set(code, room);
      } else {
        clearTimeout(room.roundTimer);
        room.started = false;
        room.roundNumber = 0;
        room.roundActive = false;
        room.currentWord = null;
        room.usedWordIds = new Set();
      }
      room.hostToken = hostToken;
      room.hostSocketId = socket.id;
    }
    room.players.set(socket.id, { name, score: 0 });
    socket.join(`scramble:${code}`);
    socket.data.scrambleRole = isHost ? 'host' : 'player';
    socket.data.scrambleCode = code;
    if (typeof ack === 'function') {
      ack({ ok: true, code, name, isHost, hostToken, started: room.started });
    }
    io.to(`scramble:${code}`).emit('scramble:players:update', scrambleRoomPlayers(room));
  });

  socket.on('scramble:host:cancel', (payload) => {
    const code = String((payload && payload.code) || '').toUpperCase();
    const room = scrambleRooms.get(code);
    if (!room || room.hostSocketId !== socket.id) return;
    clearTimeout(room.roundTimer);
    io.to(`scramble:${code}`).emit('scramble:room:cancelled');
    scrambleRooms.delete(code);
  });

  socket.on('scramble:host:start', (payload) => {
    const code = String((payload && payload.code) || '').toUpperCase();
    const room = scrambleRooms.get(code);
    if (!room || room.hostSocketId !== socket.id || room.players.size < 2) return;
    room.totalRounds = Math.max(1, Math.min(25, Number(payload && payload.rounds) || 8));
    room.roundNumber = 0;
    room.usedWordIds = new Set();
    room.started = true;
    for (const p of room.players.values()) p.score = 0;
    startScrambleRound(code);
  });

  socket.on('scramble:guess', (payload) => {
    const code = String((payload && payload.code) || '').toUpperCase();
    const text = String((payload && payload.text) || '').slice(0, 40);
    const room = scrambleRooms.get(code);
    if (!room || !room.roundActive || !room.players.has(socket.id) || !text.trim()) return;

    const player = room.players.get(socket.id);
    const correct = text.trim().toUpperCase() === room.currentWord;
    io.to(`scramble:${code}`).emit('scramble:guess', { name: player.name, text, correct });
    if (correct) resolveScrambleRound(code, { timedOut: false, winnerSocketId: socket.id });
  });

  // --- Tic-Tac-Toe Showdown -----------------------------------------------------

  socket.on('ttt:quickplay:join', (payload, ack) => {
    const name = String((payload && payload.name) || '').trim().slice(0, 20) || 'Player';
    const code = 'OURS';
    let room = tttRooms.get(code);
    if (room) {
      for (const pid of room.players.keys()) {
        if (!io.sockets.sockets.has(pid)) room.players.delete(pid);
      }
    }
    let isHost = false;
    let hostToken = null;
    if (!room || room.players.size === 0 || !io.sockets.sockets.has(room.hostSocketId)) {
      isHost = true;
      hostToken = crypto.randomUUID();
      if (!room) {
        room = {
          code,
          players: new Map(),
          playerOrder: [],
          started: false,
          totalRounds: 5,
          roundNumber: 0,
          board: Array(9).fill(null),
          xSocketId: null,
          oSocketId: null,
          turn: null,
          gameActive: false,
          createdAt: Date.now(),
        };
        tttRooms.set(code, room);
      } else {
        room.started = false;
        room.roundNumber = 0;
        room.gameActive = false;
        room.board = Array(9).fill(null);
      }
      room.hostToken = hostToken;
      room.hostSocketId = socket.id;
    }
    room.players.set(socket.id, { name, score: 0 });
    socket.join(`ttt:${code}`);
    socket.data.tttRole = isHost ? 'host' : 'player';
    socket.data.tttCode = code;
    if (typeof ack === 'function') {
      ack({ ok: true, code, name, isHost, hostToken, started: room.started });
    }
    io.to(`ttt:${code}`).emit('ttt:players:update', tttRoomPlayers(room));
  });

  socket.on('ttt:host:cancel', (payload) => {
    const code = String((payload && payload.code) || '').toUpperCase();
    const room = tttRooms.get(code);
    if (!room || room.hostSocketId !== socket.id) return;
    io.to(`ttt:${code}`).emit('ttt:room:cancelled');
    tttRooms.delete(code);
  });

  socket.on('ttt:host:start', (payload) => {
    const code = String((payload && payload.code) || '').toUpperCase();
    const room = tttRooms.get(code);
    if (!room || room.hostSocketId !== socket.id || room.players.size < 2) return;
    room.totalRounds = Math.max(1, Math.min(15, Number(payload && payload.rounds) || 5));
    room.roundNumber = 0;
    room.playerOrder = Array.from(room.players.keys());
    room.started = true;
    for (const p of room.players.values()) p.score = 0;
    startTttGame(code);
  });

  socket.on('ttt:move', (payload) => {
    const code = String((payload && payload.code) || '').toUpperCase();
    const index = Number(payload && payload.index);
    const room = tttRooms.get(code);
    if (!room || !room.gameActive || !Number.isInteger(index) || index < 0 || index > 8) return;
    if (socket.id !== room.turn || room.board[index]) return;

    const mark = socket.id === room.xSocketId ? 'X' : 'O';
    room.board[index] = mark;

    const win = tttWinner(room.board);
    if (win) {
      endTttGame(code, { winnerSocketId: socket.id, line: win.line });
      return;
    }
    if (room.board.every((c) => c)) {
      endTttGame(code, { draw: true });
      return;
    }
    room.turn = room.turn === room.xSocketId ? room.oSocketId : room.xSocketId;
    io.to(`ttt:${code}`).emit('ttt:state', {
      board: room.board,
      turnName: (room.players.get(room.turn) || {}).name,
    });
  });

  // --- Sliding Puzzle Race -------------------------------------------------------

  socket.on('puzzle:quickplay:join', (payload, ack) => {
    const name = String((payload && payload.name) || '').trim().slice(0, 20) || 'Player';
    const code = 'OURS';
    let room = puzzleRooms.get(code);
    if (room) {
      for (const pid of room.players.keys()) {
        if (!io.sockets.sockets.has(pid)) room.players.delete(pid);
      }
    }
    let isHost = false;
    let hostToken = null;
    if (!room || room.players.size === 0 || !io.sockets.sockets.has(room.hostSocketId)) {
      isHost = true;
      hostToken = crypto.randomUUID();
      if (!room) {
        room = {
          code,
          players: new Map(),
          started: false,
          totalRounds: 5,
          roundNumber: 0,
          roundActive: false,
          currentPhoto: null,
          usedPhotoIds: new Set(),
          roundTimer: null,
          createdAt: Date.now(),
        };
        puzzleRooms.set(code, room);
      } else {
        clearTimeout(room.roundTimer);
        room.started = false;
        room.roundNumber = 0;
        room.roundActive = false;
        room.currentPhoto = null;
        room.usedPhotoIds = new Set();
      }
      room.hostToken = hostToken;
      room.hostSocketId = socket.id;
    }
    room.players.set(socket.id, { name, score: 0 });
    socket.join(`puzzle:${code}`);
    socket.data.puzzleRole = isHost ? 'host' : 'player';
    socket.data.puzzleCode = code;
    if (typeof ack === 'function') {
      ack({ ok: true, code, name, isHost, hostToken, started: room.started });
    }
    io.to(`puzzle:${code}`).emit('puzzle:players:update', puzzleRoomPlayers(room));
  });

  socket.on('puzzle:host:cancel', (payload) => {
    const code = String((payload && payload.code) || '').toUpperCase();
    const room = puzzleRooms.get(code);
    if (!room || room.hostSocketId !== socket.id) return;
    clearTimeout(room.roundTimer);
    io.to(`puzzle:${code}`).emit('puzzle:room:cancelled');
    puzzleRooms.delete(code);
  });

  socket.on('puzzle:host:start', (payload) => {
    const code = String((payload && payload.code) || '').toUpperCase();
    const room = puzzleRooms.get(code);
    if (!room || room.hostSocketId !== socket.id || room.players.size < 2) return;
    room.totalRounds = Math.max(1, Math.min(10, Number(payload && payload.rounds) || 5));
    room.roundNumber = 0;
    room.usedPhotoIds = new Set();
    room.started = true;
    for (const p of room.players.values()) p.score = 0;
    startPuzzleRound(code);
  });

  socket.on('puzzle:solved', (payload) => {
    const code = String((payload && payload.code) || '').toUpperCase();
    const room = puzzleRooms.get(code);
    if (!room || !room.roundActive || !room.players.has(socket.id)) return;
    resolvePuzzleRound(code, { timedOut: false, winnerSocketId: socket.id });
  });

  // --- Countries of the World (shared-map head-to-head quiz) ---------------

  socket.on('countries:quickplay:join', (payload, ack) => {
    const name = String((payload && payload.name) || '').trim().slice(0, 20) || 'Player';
    const code = 'OURS';
    let room = countryRooms.get(code);
    if (room) {
      for (const pid of room.players.keys()) {
        if (!io.sockets.sockets.has(pid)) room.players.delete(pid);
      }
    }
    let isHost = false;
    let hostToken = null;
    if (!room || room.players.size === 0 || !io.sockets.sockets.has(room.hostSocketId)) {
      isHost = true;
      hostToken = crypto.randomUUID();
      if (!room) {
        room = {
          code,
          players: new Map(),
          started: false,
          claimed: new Map(),
          deadline: null,
          gameTimer: null,
          createdAt: Date.now(),
        };
        countryRooms.set(code, room);
      } else {
        clearTimeout(room.gameTimer);
        room.started = false;
        room.claimed = new Map();
        room.deadline = null;
      }
      room.hostToken = hostToken;
      room.hostSocketId = socket.id;
    }
    room.players.set(socket.id, { name, score: 0 });
    socket.join(`countries:${code}`);
    socket.data.countriesRole = isHost ? 'host' : 'player';
    socket.data.countriesCode = code;
    if (typeof ack === 'function') {
      ack({ ok: true, code, name, isHost, hostToken, started: room.started });
    }
    io.to(`countries:${code}`).emit('countries:players:update', countryRoomPlayers(room));
  });

  socket.on('countries:host:cancel', (payload) => {
    const code = String((payload && payload.code) || '').toUpperCase();
    const room = countryRooms.get(code);
    if (!room || room.hostSocketId !== socket.id) return;
    clearTimeout(room.gameTimer);
    io.to(`countries:${code}`).emit('countries:room:cancelled');
    countryRooms.delete(code);
  });

  socket.on('countries:host:start', (payload) => {
    const code = String((payload && payload.code) || '').toUpperCase();
    const room = countryRooms.get(code);
    if (!room || room.hostSocketId !== socket.id || room.players.size < 2) return;
    room.claimed = new Map();
    room.deadline = Date.now() + COUNTRY_ROUND_MS;
    room.started = true;
    for (const p of room.players.values()) p.score = 0;
    clearTimeout(room.gameTimer);
    room.gameTimer = setTimeout(() => endCountriesGame(code, 'timeout'), COUNTRY_ROUND_MS);
    io.to(`countries:${code}`).emit('countries:game:start', {
      deadline: room.deadline,
      players: countryRoomPlayers(room),
    });
  });

  // Co-op, not competitive: whoever guesses a country first claims it (so it
  // isn't double-counted), but both players' finds add up into one shared
  // team total — there's no individual win condition, only the shared
  // 15-minute clock and the shared "did we get all 197" finish line.
  socket.on('countries:guess', (payload, ack) => {
    const code = String((payload && payload.code) || '').toUpperCase();
    const countryId = String((payload && payload.countryId) || '');
    const room = countryRooms.get(code);
    const respond = typeof ack === 'function' ? ack : () => {};
    if (!room || !room.started || !COUNTRY_IDS.has(countryId)) return respond({ ok: false });
    const player = room.players.get(socket.id);
    if (!player) return respond({ ok: false });
    if (room.claimed.has(countryId)) return respond({ ok: false, reason: 'claimed' });

    room.claimed.set(countryId, socket.id);
    player.score += 1;
    io.to(`countries:${code}`).emit('countries:reveal', {
      countryId,
      byName: player.name,
      players: countryRoomPlayers(room),
    });
    respond({ ok: true });
    if (room.claimed.size >= COUNTRY_IDS.size) endCountriesGame(code, 'complete');
  });

  socket.on('countries:host:end', (payload) => {
    const code = String((payload && payload.code) || '').toUpperCase();
    const room = countryRooms.get(code);
    if (!room || room.hostSocketId !== socket.id) return;
    endCountriesGame(code, 'ended');
  });

  // --- Party Mashup ------------------------------------------------------
  // Unlike every other game's quickplay:join, this one has to survive full
  // page navigations *mid-match* — each leg is played on a different game's
  // own page, so the player's socket disconnects and reconnects with a new
  // socket.id between every leg. Re-attach by matching on name instead of
  // wiping the room, so an in-progress match (legOrder/legIndex/scores)
  // isn't reset just because someone's tab navigated away and back.

  socket.on('mashup:quickplay:join', (payload, ack) => {
    const name = String((payload && payload.name) || '').trim().slice(0, 20) || 'Player';
    const code = 'OURS';
    let room = mashupRooms.get(code);

    // Deliberately no dead-socket pruning here (unlike every other game's
    // quickplay:join) — a mashup player's socket disconnects and
    // reconnects with a new socket.id on *every single leg transition* by
    // design (full page navigation to and from each game). Pruning by
    // socket id would delete the score-bearing player entry the instant
    // they leave for a leg, right before the name-match reattach below
    // could reclaim it. The reattach logic already handles staleness
    // correctly on its own.
    if (!room) {
      room = {
        code,
        players: new Map(),
        hostSocketId: null,
        hostToken: null,
        started: false,
        legOrder: [],
        legIndex: 0,
        legResults: [],
        awaitingResult: false,
        currentGame: null,
        createdAt: Date.now(),
      };
      mashupRooms.set(code, room);
    }

    const existingEntry = Array.from(room.players.entries()).find(([, p]) => p.name === name);
    if (existingEntry) {
      const [oldSocketId, playerData] = existingEntry;
      room.players.delete(oldSocketId);
      room.players.set(socket.id, playerData);
      if (room.hostSocketId === oldSocketId) room.hostSocketId = socket.id;
    } else {
      room.players.set(socket.id, { name, score: 0 });
    }

    let isHost = false;
    let hostToken = null;
    if (!room.hostSocketId || !io.sockets.sockets.has(room.hostSocketId)) {
      isHost = true;
      hostToken = crypto.randomUUID();
      room.hostToken = hostToken;
      room.hostSocketId = socket.id;
    } else if (room.hostSocketId === socket.id) {
      isHost = true;
      hostToken = room.hostToken;
    }

    socket.join(`mashup:${code}`);
    socket.data.mashupRole = 'player';
    socket.data.mashupCode = code;
    if (typeof ack === 'function') {
      ack({
        ok: true,
        code,
        name,
        isHost,
        hostToken,
        started: room.started,
        awaitingResult: room.awaitingResult,
        currentGame: room.currentGame,
        legIndex: room.legIndex,
        totalLegs: room.legOrder.length,
        legs: room.legResults,
        players: mashupRoomPlayers(room),
      });
    }
    io.to(`mashup:${code}`).emit('mashup:players:update', mashupRoomPlayers(room));
  });

  socket.on('mashup:host:cancel', (payload) => {
    const code = String((payload && payload.code) || '').toUpperCase();
    const room = mashupRooms.get(code);
    if (!room || room.hostSocketId !== socket.id) return;
    io.to(`mashup:${code}`).emit('mashup:room:cancelled');
    mashupRooms.delete(code);
  });

  socket.on('mashup:host:start', (payload, ack) => {
    const code = String((payload && payload.code) || '').toUpperCase();
    const room = mashupRooms.get(code);
    if (!room || room.hostSocketId !== socket.id || room.players.size < 2) {
      if (typeof ack === 'function') ack({ ok: false });
      return;
    }
    const requestedGames = Array.isArray(payload && payload.games)
      ? payload.games.filter((g) => MASHUP_GAME_KEYS.has(g))
      : [];
    const totalLegs = Math.max(3, Math.min(20, Number(payload && payload.legs) || 7));
    room.legOrder = buildMashupLegOrder(requestedGames, totalLegs);
    room.legIndex = 0;
    room.legResults = [];
    room.awaitingResult = false;
    room.currentGame = null;
    room.started = true;
    for (const p of room.players.values()) p.score = 0;
    if (typeof ack === 'function') ack({ ok: true });
    startMashupLeg(code);
  });

  // Requests the next leg — sent by the host's client after it's shown the
  // previous leg's result for a couple of seconds. Harmless if a race causes
  // a duplicate call: startMashupLeg() no-ops once awaitingResult is true.
  socket.on('mashup:next', (payload) => {
    const code = String((payload && payload.code) || '').toUpperCase();
    startMashupLeg(code);
  });

  // Fired by an individual game's client (reportMashupLegResult in
  // layout.js) once its single-round leg has resolved. Both players in that
  // game typically report at nearly the same instant since they both
  // receive that game's own game:over broadcast together — awaitingResult
  // makes the second report a harmless no-op that still acks (so both
  // clients redirect back to /mashup).
  socket.on('mashup:leg:result', (payload, ack) => {
    const code = String((payload && payload.code) || '').toUpperCase();
    const room = mashupRooms.get(code);
    if (!room || !room.started || !room.awaitingResult) {
      if (typeof ack === 'function') ack();
      return;
    }
    room.awaitingResult = false;
    const winnerName = payload && payload.winnerName ? String(payload.winnerName).slice(0, 20) : null;
    if (winnerName) {
      for (const p of room.players.values()) {
        if (p.name === winnerName) p.score += 1;
      }
    }
    room.legResults.push({ game: room.currentGame, winnerName });
    room.currentGame = null;
    if (typeof ack === 'function') ack();
    io.to(`mashup:${code}`).emit('mashup:leg:result', {
      legs: room.legResults,
      players: mashupRoomPlayers(room),
    });
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
    const memoryCode = socket.data.memoryCode;
    if (memoryCode) {
      const room = memoryRooms.get(memoryCode);
      if (room && socket.data.memoryRole === 'player' && room.players.delete(socket.id)) {
        io.to(`mem:${memoryCode}`).emit('memory:players:update', memoryRoomPlayers(room));
      }
    }
    const drawCode = socket.data.drawCode;
    if (drawCode) {
      const room = drawRooms.get(drawCode);
      if (room && socket.data.drawRole === 'player' && room.players.delete(socket.id)) {
        io.to(`draw:${drawCode}`).emit('draw:players:update', drawRoomPlayers(room));
      }
    }
    const reactionCode = socket.data.reactionCode;
    if (reactionCode) {
      const room = reactionRooms.get(reactionCode);
      if (room && socket.data.reactionRole === 'player' && room.players.delete(socket.id)) {
        io.to(`reaction:${reactionCode}`).emit('reaction:players:update', reactionRoomPlayers(room));
      }
    }
    const triviaCode = socket.data.triviaCode;
    if (triviaCode) {
      const room = triviaRooms.get(triviaCode);
      if (room && socket.data.triviaRole === 'player' && room.players.delete(socket.id)) {
        io.to(`trivia:${triviaCode}`).emit('trivia:players:update', triviaRoomPlayers(room));
      }
    }
    const scrambleCode = socket.data.scrambleCode;
    if (scrambleCode) {
      const room = scrambleRooms.get(scrambleCode);
      if (room && socket.data.scrambleRole === 'player' && room.players.delete(socket.id)) {
        io.to(`scramble:${scrambleCode}`).emit('scramble:players:update', scrambleRoomPlayers(room));
      }
    }
    const tttCode = socket.data.tttCode;
    if (tttCode) {
      const room = tttRooms.get(tttCode);
      if (room && socket.data.tttRole === 'player' && room.players.delete(socket.id)) {
        io.to(`ttt:${tttCode}`).emit('ttt:players:update', tttRoomPlayers(room));
      }
    }
    const puzzleCode = socket.data.puzzleCode;
    if (puzzleCode) {
      const room = puzzleRooms.get(puzzleCode);
      if (room && socket.data.puzzleRole === 'player' && room.players.delete(socket.id)) {
        io.to(`puzzle:${puzzleCode}`).emit('puzzle:players:update', puzzleRoomPlayers(room));
      }
    }
    const countriesCode = socket.data.countriesCode;
    if (countriesCode) {
      const room = countryRooms.get(countriesCode);
      if (room && socket.data.countriesRole === 'player' && room.players.delete(socket.id)) {
        io.to(`countries:${countriesCode}`).emit('countries:players:update', countryRoomPlayers(room));
      }
    }
    // Deliberately no cleanup here — a mashup player's socket disconnects on
    // every single leg transition by design (see mashup:quickplay:join), so
    // deleting the player entry on disconnect would wipe their score right
    // before they reattach on the next page. Genuinely abandoned mashup
    // rooms are still reclaimed by the periodic TTL sweep below.
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
  for (const [code, room] of memoryRooms) {
    if (now - room.createdAt > ROOM_TTL_MS) memoryRooms.delete(code);
  }
  for (const [code, room] of drawRooms) {
    if (now - room.createdAt > ROOM_TTL_MS) {
      clearTimeout(room.roundTimer);
      drawRooms.delete(code);
    }
  }
  for (const [code, room] of reactionRooms) {
    if (now - room.createdAt > ROOM_TTL_MS) {
      clearTimeout(room.goTimer);
      reactionRooms.delete(code);
    }
  }
  for (const [code, room] of triviaRooms) {
    if (now - room.createdAt > ROOM_TTL_MS) {
      clearTimeout(room.roundTimer);
      triviaRooms.delete(code);
    }
  }
  for (const [code, room] of scrambleRooms) {
    if (now - room.createdAt > ROOM_TTL_MS) {
      clearTimeout(room.roundTimer);
      scrambleRooms.delete(code);
    }
  }
  for (const [code, room] of tttRooms) {
    if (now - room.createdAt > ROOM_TTL_MS) tttRooms.delete(code);
  }
  for (const [code, room] of puzzleRooms) {
    if (now - room.createdAt > ROOM_TTL_MS) {
      clearTimeout(room.roundTimer);
      puzzleRooms.delete(code);
    }
  }
  for (const [code, room] of countryRooms) {
    if (now - room.createdAt > ROOM_TTL_MS) {
      clearTimeout(room.gameTimer);
      countryRooms.delete(code);
    }
  }
  for (const [code, room] of mashupRooms) {
    if (now - room.createdAt > ROOM_TTL_MS) mashupRooms.delete(code);
  }
}, 30 * 60 * 1000);

app.get('/api/leaderboard', (req, res) => {
  res.json(leaderboard);
});

app.post('/api/leaderboard/win', express.json(), (req, res) => {
  const who = req.body && req.body.who;
  if (who !== 'louie' && who !== 'ariel') return res.status(400).json({ error: 'who must be "louie" or "ariel"' });
  leaderboard[who] += 1;
  saveLeaderboard();
  res.json(leaderboard);
});

app.post('/api/leaderboard/undo', express.json(), (req, res) => {
  const who = req.body && req.body.who;
  if (who !== 'louie' && who !== 'ariel') return res.status(400).json({ error: 'who must be "louie" or "ariel"' });
  leaderboard[who] = Math.max(0, leaderboard[who] - 1);
  saveLeaderboard();
  res.json(leaderboard);
});

app.get('/api/symbols', (req, res) => {
  res.json(buildCard(SYMBOLS.map((_, id) => id)));
});

app.get('/api/photos', (req, res) => {
  res.json(PHOTOS);
});

// Raw deck structure (which symbol ids are on each of the 57 cards) so Trial
// Mode can generate rounds entirely client-side — offline-capable once this
// and /api/symbols are cached, instead of round-tripping to the server on
// every round.
app.get('/api/deck', (req, res) => {
  res.json({ deck: DECK });
});

// Powers solo/practice modes for Trivia Showdown and Word Scramble Sprint —
// fetched once, then played entirely client-side with no server round-trip
// per question/word, same reasoning as /api/deck for Trial Mode.
app.get('/api/trivia', (req, res) => {
  res.json({ questions: TRIVIA_QUESTIONS });
});

app.get('/api/scramble-words', (req, res) => {
  res.json({ words: SCRAMBLE_WORDS });
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

app.get('/draw', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'draw.html'));
});

app.get('/reaction', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'reaction.html'));
});

app.get('/trivia', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'trivia.html'));
});

app.get('/scramble', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'scramble.html'));
});

app.get('/ttt', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'ttt.html'));
});

app.get('/puzzle', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'puzzle.html'));
});

app.get('/countries', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'countries.html'));
});

app.get('/api/countries', (req, res) => {
  res.json(COUNTRIES);
});

app.get('/mashup', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'mashup.html'));
});

// Small static catalog the setup screen's game picker renders from — kept
// server-side too so MASHUP_GAME_KEYS stays the single source of truth for
// which games are eligible.
app.get('/api/mashup-games', (req, res) => {
  res.json({ games: MASHUP_GAMES });
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
