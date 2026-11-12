'use strict';
const crypto = require('crypto');
const chains = require('./chains');
const PLAYERS = ['louie', 'ariel'];
const other = p => p === 'louie' ? 'ariel' : 'louie';
const normalise = s => String(s).normalize('NFKC').trim().toUpperCase().replace(/[\s'’.-]/gu, '');
const letters = s => [...normalise(s)];
const fail = message => { throw Error(message); };
function fresh() {
  return {version: 1, revision: 0, phase: 'setup', tokens: {}, settings: {count: 8, starter: 'random', mode: 'competitive'}, agreed: [], round: 0, creator: 'louie', scores: {louie: 0, ariel: 0}, ready: [], words: [], draft: [], index: 1, revealed: 1, turn: null, winner: null, guesses: [], correct: {louie: 0, ariel: 0}, hints: 0, dispute: null, lastWrong: null, used: [], receipts: [], message: 'Choose your settings together.'};
}
function begin(g) {
  g.round++; g.winner = null; g.guesses = []; g.correct = {louie: 0, ariel: 0}; g.hints = 0;
  g.index = 1; g.revealed = 1; g.dispute = null; g.lastWrong = null; g.ready = []; g.draft = []; g.words = [];
  if (g.settings.mode === 'manual') { g.phase = 'create'; g.turn = other(g.creator); g.message = 'The host is creating your chain.'; }
  else {
    let choices = chains.map((_, i) => i).filter(i => !g.used.includes(i));
    if (!choices.length) { g.used = []; choices = chains.map((_, i) => i); }
    const id = choices[crypto.randomInt(choices.length)]; g.used.push(id);
    g.words = chains[id].slice(0, g.settings.count); g.phase = 'play';
    g.turn = g.settings.starter === 'random' ? PLAYERS[crypto.randomInt(2)] : g.settings.starter;
    g.message = 'Guess the next word. Correct means keep going.';
  }
}
function complete(g, who) {
  g.correct[who]++; g.lastWrong = null; g.dispute = null;
  if (g.index === g.words.length - 1) { g.phase = 'result'; g.winner = who; g.scores[who]++; g.message = 'Chain complete!'; }
  else { g.index++; g.revealed = 1; g.message = 'Got it! Keep going.'; }
}
function validateWords(words, count, complete = true) {
  if (!Array.isArray(words) || words.length !== count) fail('Enter the chosen number of words.');
  return words.map((value, i) => {
    if (typeof value !== 'string' || value.length > 32) fail('Keep each word under 33 characters.');
    const w = value.trim().normalize('NFKC').toUpperCase();
    if (!complete) { if (w && !/^[A-Z'’.-]+$/.test(w)) fail('Use letters, apostrophes or hyphens.'); return w; }
    if (!/^[A-Z]+(?:['’.-][A-Z]+)*$/.test(w) || letters(w).length < 2) fail('Use words of at least two letters, with apostrophes or hyphens if needed.');
    if (i && normalise(w) === normalise(words[i - 1])) fail('Two neighbouring words cannot be the same.');
    return w;
  });
}
function move(g, who, p) {
  if (!PLAYERS.includes(who)) fail('Choose your player first.');
  switch (p.action) {
    case 'settings':
      if (g.phase !== 'setup') fail('Settings are locked for this round.');
      if (!Number.isInteger(p.count) || p.count < 5 || p.count > 10 || !['random', ...PLAYERS].includes(p.starter) || !['manual', 'competitive'].includes(p.mode)) fail('Choose the settings shown on screen.');
      g.settings = {count: p.count, starter: p.starter, mode: p.mode}; g.agreed = [who]; break;
    case 'agree':
      if (g.phase !== 'setup') fail('The round has already started.');
      if (!g.agreed.includes(who)) g.agreed.push(who); break;
    case 'start':
      if (g.phase !== 'setup' || g.agreed.length !== 2) fail('Both players need to agree first.');
      begin(g); break;
    case 'draft':
    case 'lock':
      if (g.phase !== 'create' || who !== g.creator) fail('Only the host can create this chain.');
      if (p.action === 'lock' && p.confirmed !== true) fail('Confirm that your connections make sense.');
      g.draft = validateWords(p.words, g.settings.count, p.action === 'lock');
      if (p.action === 'lock') { g.words = g.draft; g.draft = []; g.phase = 'play'; g.message = 'Your chain is ready.'; }
      break;
    case 'guess':
    case 'hint': {
      if (g.phase !== 'play' || g.turn !== who) fail('It is your partner’s turn.');
      if (g.dispute) fail('Wait for the host’s decision.');
      const word = letters(g.words[g.index]);
      if (p.action === 'hint') {
        if (g.revealed >= word.length - 1) fail('One letter left. Have a guess!');
        g.revealed++; g.hints++; g.lastWrong = null;
        g.message = g.settings.mode === 'manual' ? 'One more letter. Try again.' : 'Letter revealed. Turn swapped.';
      } else {
        if (typeof p.guess !== 'string' || p.guess.length > 64 || !normalise(p.guess)) fail('Enter a guess first.');
        const guess = p.guess.trim(); const correct = normalise(guess) === normalise(g.words[g.index]);
        g.guesses.push({who, guess, correct, index: g.index});
        if (correct) { complete(g, who); break; }
        g.lastWrong = {who, guess, index: g.index, revision: g.revision + 1}; g.message = 'Not quite!';
      }
      if (g.settings.mode === 'competitive') g.turn = other(who);
      break;
    }
    case 'dispute':
      if (g.settings.mode !== 'manual' || g.phase !== 'play' || who === g.creator || !g.lastWrong || g.lastWrong.who !== who || g.lastWrong.index !== g.index || g.dispute) fail('Only your most recent wrong guess can be reviewed.');
      g.dispute = {...g.lastWrong}; g.lastWrong = null; g.message = 'Waiting for the host to review your guess.'; break;
    case 'judge': {
      if (g.settings.mode !== 'manual' || g.phase !== 'play' || who !== g.creator || !g.dispute || typeof p.approve !== 'boolean') fail('There is no answer waiting for review.');
      const d = g.dispute; g.dispute = null;
      if (p.approve) {
        // An alternative must preserve all hints already given. It becomes the
        // official current word so the next connection is explicit to both.
        if (normalise(d.guess).slice(0, g.revealed) !== normalise(g.words[g.index]).slice(0, g.revealed) || !/^[A-Za-z]+(?:['’.-][A-Za-z]+)*$/.test(d.guess)) fail('An alternative must match the letters already shown.');
        g.words[g.index] = d.guess.trim().toUpperCase();
        g.guesses.at(-1).correct = true; complete(g, d.who);
      } else g.message = 'The host kept the intended answer. Try again.';
      break;
    }
    case 'rematch':
      if (g.phase !== 'result') fail('Finish this chain first.');
      if (!g.ready.includes(who)) g.ready.push(who);
      if (g.ready.length === 2) { g.creator = other(g.creator); g.phase = 'setup'; g.agreed = []; g.words = []; g.draft = []; g.message = 'Same settings? Agree to play again.'; }
      break;
    default: fail('That action is unavailable.');
  }
  g.revision++;
}
function view(g, who, online) {
  const result = g.phase === 'result';
  const board = ['play', 'result'].includes(g.phase) ? g.words.map((w, i) => {
    if (result || i < g.index) return {text: w, status: 'complete'};
    if (i > g.index) return {text: letters(w)[0], status: 'future'};
    return {text: letters(w).map((c, j) => j < g.revealed ? c : '_').join(' '), status: 'current'};
  }) : [];
  return {me: who, online, phase: g.phase, revision: g.revision, settings: g.settings, agreed: g.agreed, round: g.round, creator: g.creator, scores: g.scores, ready: g.ready, turn: g.turn, index: g.index, board, canHint: g.phase === 'play' && g.revealed < letters(g.words[g.index]).length - 1, winner: g.winner, totalGuesses: g.guesses.length, correct: g.correct, hints: g.hints, message: g.message,
    draft: g.phase === 'create' && who === g.creator ? g.draft : undefined,
    dispute: g.dispute ? {guess: g.dispute.guess, who: g.dispute.who} : null,
    canDispute: g.settings.mode === 'manual' && who !== g.creator && !!g.lastWrong && !g.dispute};
}
module.exports = {fresh, move, view, normalise, validateWords};
