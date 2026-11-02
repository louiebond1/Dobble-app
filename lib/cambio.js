'use strict';
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const {chooseBotAction} = require('./cambio-bot');
const SEATS = ['louie', 'ariel'];
const other = p => p === 'louie' ? 'ariel' : 'louie';
const title = p => p === 'louie' ? 'Louie' : 'Ariel';
const cardName = c => `${['', 'Ace', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'Jack', 'Queen', 'King'][c.rank]}${c.suit}`;
const value = c => c.rank === 13 && ['♥', '♦'].includes(c.suit) ? -1 : Math.min(c.rank, 10);
const MATCH_PHASES = ['draw', 'holding', 'self', 'opponent', 'view', 'blind', 'queen', 'queenView', 'queenSwap', 'settling'];
function deck(random = Math.random) {
  const cards = ['♠', '♥', '♣', '♦'].flatMap(suit => Array.from({length: 13}, (_, i) => ({rank: i + 1, suit})));
  for (let i = cards.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [cards[i], cards[j]] = [cards[j], cards[i]]; }
  return cards;
}
function fresh() {
  return {phase: 'lobby', revision: 0, tokens: {}, settings: {mode: 'target', limit: 100}, scores: {louie: 0, ariel: 0}, history: [], ready: [], round: 0, ply: 0, hands: {louie: [], ariel: []}, deck: [], discard: [], peek: null, drawn: null, fromDiscard: false, caller: null, turn: 'louie', events: [], serial: 0, discardGeneration: 0, settleUntil: null, settleRemaining: null, points: null, message: 'Choose your seat.'};
}
function event(g, kind, data = {}) {
  const e = {id: ++g.serial, kind, ...data};
  g.events.push(e); g.events = g.events.slice(-18);
  return e;
}
function deal(g, random = Math.random) {
  g.round++; g.deck = deck(random); g.hands = {louie: g.deck.splice(0, 4), ariel: g.deck.splice(0, 4)};
  g.discard = []; g.discardGeneration++; g.turn = SEATS[(g.round - 1) % 2]; g.phase = 'initial'; g.ply = 0;
  g.ready = []; g.peek = null; g.drawn = null; g.fromDiscard = false; g.caller = null; g.settleUntil = null; g.settleRemaining = null; g.points = null;
  g.message = 'Remember your two bottom cards.'; event(g, 'deal', {text: 'Four cards each. Remember your bottom two.'});
}
function draw(g) {
  if (!g.deck.length && g.discard.length > 1) {
    const top = g.discard.pop(); g.deck = g.discard; g.discard = [top];
    for (let i = g.deck.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [g.deck[i], g.deck[j]] = [g.deck[j], g.deck[i]]; }
  }
  return g.deck.pop() || null;
}
function finish(g) {
  const points = Object.fromEntries(SEATS.map(p => [p, g.hands[p].reduce((sum, c) => sum + (c ? value(c) : 0), 0)]));
  for (const p of SEATS) g.scores[p] += points[p];
  g.history.push({round: g.round, ...points, caller: g.caller}); g.points = points;
  g.phase = (g.settings.mode === 'rounds' ? g.round >= g.settings.limit : SEATS.some(p => g.scores[p] >= g.settings.limit)) ? 'over' : 'result';
  g.drawn = null; g.peek = null; g.ready = []; g.settleUntil = null; g.settleRemaining = null;
  g.message = points.louie === points.ariel ? 'A tied round.' : `${points.louie < points.ariel ? 'Louie' : 'Ariel'} wins the round.`;
  event(g, 'score', {text: g.message});
}
function completeTurn(g, now) {
  g.phase = 'settling'; g.peek = null; g.drawn = null; g.fromDiscard = false;
  g.settleUntil = now + (g.caller && g.turn !== g.caller ? 2600 : 850); g.settleRemaining = null;
}
function settle(g, now = Date.now()) {
  if (g.phase !== 'settling' || g.settleUntil == null || now < g.settleUntil) return false;
  g.settleUntil = null;
  if (g.caller && g.turn !== g.caller) finish(g);
  else { g.turn = other(g.turn); g.ply++; g.phase = 'draw'; g.message = `${title(g.turn)}'s turn.`; event(g, 'turn', {actor: g.turn, text: g.message}); }
  g.revision++; return true;
}
function move(g, who, p, random = Math.random, now = Date.now()) {
  const fail = text => { throw Error(text); };
  const exists = (owner, i) => SEATS.includes(owner) && Number.isInteger(i) && i >= 0 && i < g.hands[owner].length && !!g.hands[owner][i];
  const own = i => exists(who, i), theirs = i => exists(other(who), i);
  const active = () => { if (who !== g.turn) fail('It is your partner’s turn.'); };
  switch (p.action) {
    case 'reset':
    case 'configure': {
      if (p.action === 'configure' && !['result', 'over'].includes(g.phase)) fail('Finish this round first.');
      const {tokens, settings, revision, serial} = g; Object.assign(g, fresh(), {tokens, settings, revision, serial}); break;
    }
    case 'settings':
      if (g.phase !== 'lobby') fail('Settings are locked during the match.');
      if (!['target', 'rounds'].includes(p.mode) || !Number.isSafeInteger(p.limit) || p.limit < 1) fail('Choose a positive whole number.');
      g.settings = {mode: p.mode, limit: p.limit}; g.ready = []; break;
    case 'ready':
      if (!['lobby', 'result', 'over', 'initial'].includes(g.phase)) fail('This round has already started.');
      if (!g.ready.includes(who)) g.ready.push(who);
      if (g.phase === 'initial') event(g, 'hideStart', {actor: who, text: `${title(who)} is ready.`});
      if (g.ready.length === 2) {
        if (g.phase === 'initial') { g.phase = 'draw'; g.ready = []; g.message = `${title(g.turn)} starts.`; event(g, 'turn', {actor: g.turn, text: g.message}); }
        else { if (g.phase === 'over') { g.scores = {louie: 0, ariel: 0}; g.history = []; g.round = 0; } deal(g, random); }
      }
      break;
    case 'draw':
    case 'take': {
      active(); if (g.phase !== 'draw') fail('Finish the card you already drew.');
      if (p.action === 'take' && !g.discard.length) fail('There is no discard to take.');
      if (p.action === 'take' && p.topCard && p.topCard !== `${g.discard.at(-1).rank}${g.discard.at(-1).suit}`) fail('The discard changed. Check the new top card.');
      g.drawn = p.action === 'take' ? g.discard.pop() : draw(g);
      if (!g.drawn) { finish(g); break; }
      g.fromDiscard = p.action === 'take'; g.phase = 'holding';
      g.message = `${title(who)} drew ${g.fromDiscard ? cardName(g.drawn) + ' from the discard' : 'a card'}.`;
      event(g, 'draw', {actor: who, from: g.fromDiscard ? 'discard' : 'deck', text: g.message}); break;
    }
    case 'replace': {
      active(); if (g.phase !== 'holding' || !own(p.index)) fail('Choose one of your cards to replace.');
      const old = g.hands[who][p.index]; g.hands[who][p.index] = g.drawn; g.discard.push(old); g.discardGeneration++;
      g.message = `${title(who)} replaced a card and discarded ${cardName(old)}.`;
      event(g, 'replace', {actor: who, index: p.index, card: old, text: g.message}); completeTurn(g, now); break;
    }
    case 'discard': {
      active(); if (g.phase !== 'holding' || g.fromDiscard) fail('A card taken from the discard must replace one of yours.');
      const c = g.drawn; g.discard.push(c); g.discardGeneration++; g.drawn = null; g.peek = null;
      g.message = `${title(who)} discarded ${cardName(c)}.`; event(g, 'discard', {actor: who, card: c, text: g.message});
      if ([7, 8].includes(c.rank)) g.phase = 'self'; else if ([9, 10].includes(c.rank)) g.phase = 'opponent';
      else if (c.rank === 11) g.phase = 'blind'; else if (c.rank === 12) g.phase = 'queen'; else completeTurn(g, now);
      break;
    }
    case 'peek': {
      active(); const owner = p.owner === who ? who : other(who);
      if (g.phase === 'self' && owner === who && own(p.index)) g.phase = 'view';
      else if (g.phase === 'opponent' && owner !== who && theirs(p.index)) g.phase = 'view';
      else if (g.phase === 'queen' && exists(owner, p.index)) g.phase = 'queenView';
      else fail('Choose one highlighted card. You only get one peek.');
      g.peek = {who: owner, index: p.index, card: g.hands[owner][p.index]};
      event(g, 'peek', {actor: who, owner, index: p.index, text: `${title(who)} is looking at ${owner === who ? 'their' : title(owner) + '’s'} card.`}); break;
    }
    case 'hideQueen':
      active(); if (g.phase !== 'queenView') fail('Finish the Queen’s look first.');
      g.peek = null; g.phase = 'queenSwap'; event(g, 'hide', {actor: who, text: `${title(who)} is choosing two cards to swap.`}); break;
    case 'swap': {
      active(); if (!['blind', 'queenSwap'].includes(g.phase) || !own(p.index) || !theirs(p.opponentIndex)) fail('Choose one of yours and one of theirs.');
      [g.hands[who][p.index], g.hands[other(who)][p.opponentIndex]] = [g.hands[other(who)][p.opponentIndex], g.hands[who][p.index]];
      g.message = `${title(who)} swapped two cards.`; event(g, 'swap', {actor: who, index: p.index, opponentIndex: p.opponentIndex, text: g.message}); completeTurn(g, now); break;
    }
    case 'skip':
      active(); if (!['self', 'opponent', 'view', 'blind', 'queen', 'queenView', 'queenSwap'].includes(g.phase)) fail('There is no power to finish.');
      event(g, 'hide', {actor: who, text: g.phase === 'view' ? `${title(who)} finished looking.` : `${title(who)} finished their power.`}); completeTurn(g, now); break;
    case 'snap': {
      if (!MATCH_PHASES.includes(g.phase) || !own(p.index) || p.owner && p.owner !== who) fail('Match using a card from your own hand.');
      const top = g.discard.at(-1); if (!top) fail('Wait for a card on the discard pile.');
      if (p.discardGeneration != null && p.discardGeneration !== g.discardGeneration) fail('The discard changed. Check the new card.');
      const c = g.hands[who][p.index], correct = c.rank === top.rank;
      if (correct) {
        g.hands[who][p.index] = null; g.discard.push(c);
        g.message = `${title(who)} matched ${cardName(c)}!`;
        event(g, 'snap', {actor: who, index: p.index, card: c, text: g.message});
        if (g.peek?.who === who && g.peek.index === p.index) g.peek = null;
        if (!g.hands[who].some(Boolean)) finish(g);
      } else {
        const penalty = draw(g); if (penalty) g.hands[who].push(penalty);
        g.message = `${title(who)} missed. One extra card.`;
        event(g, 'penalty', {actor: who, index: p.index, card: c, penaltyIndex: penalty ? g.hands[who].length - 1 : null, text: g.message});
      }
      break;
    }
    case 'call':
      active(); if (g.phase !== 'draw' || g.caller) fail('Call Cambio before drawing.');
      g.caller = who; g.turn = other(who); g.ply++; g.message = `${title(who)} called Cambio. ${title(g.turn)} gets one last turn.`;
      event(g, 'call', {actor: who, text: g.message}); break;
    default: fail('That move is not available.');
  }
  g.revision++;
}
function view(g, who, online, now = Date.now()) {
  const revealed = ['result', 'over'].includes(g.phase);
  return {me: who, phase: g.phase, revision: g.revision, settings: g.settings, scores: g.scores, history: g.history, ready: g.ready,
    solo: !!g.solo, names: {louie:'Louie',ariel:g.solo?'🤖 Bot':'Ariel'}, round: g.round, ply: g.ply, turn: g.turn, caller: g.caller, online, serial: g.serial, events: g.solo ? g.events.map(e=>({...e,text:e.text?.replaceAll('Ariel','Bot')})) : g.events, message: g.solo ? g.message.replaceAll('Ariel','Bot') : g.message,
    discardGeneration: g.discardGeneration, deckCount: g.deck.length, discard: g.discard.at(-1) || null,
    drawn: g.phase === 'holding' ? (g.turn === who ? g.drawn : {hidden: true}) : null, fromDiscard: g.turn === who && g.fromDiscard,
    peek: g.turn === who ? g.peek : null, points: g.points, settleUntil: g.settleUntil, serverNow: now,
    hands: Object.fromEntries(SEATS.map(p => [p, g.hands[p].map((c, i) => !c ? null : revealed || g.phase === 'initial' && p === who && !g.ready.includes(who) && i >= 2 ? c : {hidden: true})]))};
}
function cambio(io, {saveFile, now = Date.now, schedule = setTimeout, cancel = clearTimeout} = {}) {
  const tables = new Map();
  function createTable(key) {
    const solo=key.startsWith('solo-');
    const file = key === 'main' ? saveFile : solo && saveFile ? path.join(path.dirname(saveFile),'cambio-solo',key+'.json') : null; let g = fresh(), alarm, botAlarm, botMemory={};
    if (file) try { const saved = JSON.parse(fs.readFileSync(file, 'utf8')); if (saved.settings && saved.tokens) g = {...fresh(), ...saved}; } catch {}
    // Resume an old match without preserving its Continue gate.
    if (['reaction', 'transfer'].includes(g.phase)) { g.phase = 'settling'; g.settleUntil = now() + 850; g.peek = null; }
    g.solo=solo;botMemory=g.botMemory||{};
    g.events ||= []; g.serial ||= 0; g.discardGeneration ||= 0;
    if (g.phase === 'settling') { g.settleRemaining = Math.max(600, (g.settleUntil || now() + 850) - now()); g.settleUntil = null; }
    const seats = {louie: null, ariel: null};
    const online = () => SEATS.filter(p => solo && p==='ariel' || seats[p] && io.sockets.sockets.has(seats[p]));
    const persist = () => { if (file) { fs.mkdirSync(path.dirname(file), {recursive: true}); fs.writeFileSync(file + '.tmp', JSON.stringify(g)); fs.renameSync(file + '.tmp', file); } };
    function push() { g.solo=solo;if(solo)g.botMemory=botMemory;persist(); for (const p of online()) if(seats[p])io.to(seats[p]).emit('cambio:state', view(g, p, online(), now())); }
    function armBot() {
      if(!solo||!seats.louie||!io.sockets.sockets.has(seats.louie)){cancel(botAlarm);botAlarm=null;return;}
      if(botAlarm)return;
      const plan=chooseBotAction(view(g,'ariel',online(),now()),botMemory);if(!plan)return;
      botAlarm=schedule(()=>{botAlarm=null;if(!seats.louie||!io.sockets.sockets.has(seats.louie))return;const next=chooseBotAction(view(g,'ariel',online(),now()),botMemory);if(next){try{move(g,'ariel',next,Math.random,now());}catch{}push();}arm();},['view','queenView'].includes(g.phase)?1800:1100);
    }
    function arm() {
      armBot();cancel(alarm); alarm = null;
      if (g.phase === 'settling' && online().length === 2) {
        if (g.settleUntil == null) { g.settleUntil = now() + (g.settleRemaining ?? 850); g.settleRemaining = null; }
        alarm = schedule(() => { if (settle(g, now())) push(); arm(); }, Math.max(1, g.settleUntil - now()));
      }
    }
    function pause() { cancel(botAlarm);botAlarm=null;cancel(alarm); if (g.settleUntil != null) { g.settleRemaining = Math.max(0, g.settleUntil - now()); g.settleUntil = null; } }
    return {seats, online, push, arm, pause, resetBot:()=>{botMemory={};}, get game() { return g; }};
  }
  tables.set('main', createTable('main'));
  return socket => {
    let table = null;
    const me = () => table && SEATS.find(p => table.seats[p] === socket.id);
    const reply = (ack, data) => typeof ack === 'function' && ack(data);
    socket.on('cambio:join', (p = {}, ack) => {
      if (!SEATS.includes(p.who)) return reply(ack, {ok: false, error: 'Choose Louie or Ariel.'});
      const key = typeof p.table === 'string' && /^(?:qa|solo)-[a-z0-9-]{6,70}$/.test(p.table) ? p.table : 'main';
      if(key.startsWith('solo-')&&p.who!=='louie')return reply(ack,{ok:false,error:'The second seat belongs to the bot.'});
      if (!tables.has(key)) { if (tables.size >= 64) return reply(ack, {ok: false, error: 'Test table limit reached.'}); tables.set(key, createTable(key)); }
      const next = tables.get(key), token = next.game.tokens[p.who];
      if (token && p.token !== token && (next.online().includes(p.who) || next.game.phase !== 'lobby')) return reply(ack, {ok: false, error: 'This seat is in use. Open your original tab.'});
      if (table) { const old = me(); if (old) { table.seats[old] = null; table.pause(); table.push(); } }
      table = next;
      const previous = table.seats[p.who]; if (previous && previous !== socket.id) io.to(previous).emit('cambio:seatLost');
      table.game.tokens[p.who] = token || crypto.randomUUID(); table.seats[p.who] = socket.id;
      reply(ack, {ok: true, token: table.game.tokens[p.who]}); table.arm(); table.push();
    });
    socket.on('cambio:action', (p = {}, ack) => {
      const who = me(); if (!who) return reply(ack, {ok: false, error: 'Choose your seat again.'});
      const g = table.game;
      const sameTurn = p.phase === g.phase && p.round === g.round && p.ply === g.ply;
      const safeSnap = p.action === 'snap' && p.round === g.round && p.discardGeneration === g.discardGeneration;
      const sameSettings = p.settingsKey === `${g.settings.mode}:${g.settings.limit}`;
      if (p.revision !== g.revision && !safeSnap && !(sameTurn && (p.action !== 'ready' || g.phase !== 'lobby' || sameSettings))) { table.push(); return reply(ack, {ok: false, error: 'The table changed. Try that move again.'}); }
      if (!['ready', 'settings', 'configure', 'reset'].includes(p.action) && table.online().length !== 2) return reply(ack, {ok: false, error: 'Waiting for your partner to reconnect.'});
      try { move(g, who, p, Math.random, now()); if(['configure','reset'].includes(p.action))table.resetBot();table.arm(); table.push(); reply(ack, {ok: true}); } catch (error) { table.push(); reply(ack, {ok: false, error: error.message}); }
    });
    socket.on('disconnect', () => { const who = me(); if (who) { table.seats[who] = null; table.pause(); table.push(); } });
  };
}
module.exports = {cambio, fresh, deal, move, view, deck, value, settle, MATCH_PHASES};
