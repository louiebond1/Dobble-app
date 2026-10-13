// Draft Night round engine ("market rounds"). Pure game logic: no network, no timers of its own. Callers pass a clock
// and a random source, call tick() whenever they look at a room, and act() for player moves.
//
// Rules
// - Builder themes with base options open with a base round: players + 1 bases, everyone ends with exactly one.
// - Then one round per category (the host picks how many, up to the theme's categories). Each round's market shows
//   players + 1 lots together: players' worth of that category, plus one upgrade to the base when the theme has them.
// - Lots are auctioned in the order shown. Only players who have not won anything this round may bid, and anyone may
//   pass, including whoever opens. A lot nobody bids on is set aside.
// - When only one player still needs something this round, or the lots left equal the players still needing one,
//   those players choose a lot for free, least money first. Nobody is ever handed a lot they did not bid on or choose.
// - So every player ends with exactly one base (when the theme has a base round) and exactly one item per round.
// - After the last round everyone votes for the best creation other than their own. A tie goes to the higher creation
//   score (Showpiece 3, Great 2, Solid 1 per item), so fighting for the best lots pays off; money left never wins it,
//   because that would reward never bidding.
const { MAX_PLAYERS, ARCHETYPES, summary } = require('./spec');
const { compose } = require('./layout');

const COLORS = ['#FF7A59', '#4EA8FF', '#3FD4A2', '#FFC145', '#B48CFF', '#FF6FAE'];
const TIMING = { turn: 30000, away: 20000, market: 5000, sold: 2600, pick: 30000, vote: 90000, cpu: 900 };

function createRoom({ theme, budget = 100, rounds = 5, capacity = 2, rng = Math.random, clock = Date.now, timing = {} }) {
  return {
    theme, rng, clock, timing: { ...TIMING, ...timing }, status: 'lobby', rev: 1,
    budget: clampInt(budget, 5, 1000), capacity: clampInt(capacity, 2, MAX_PLAYERS), roundsWanted: clampInt(rounds, 1, theme.categories.length),
    players: [], rounds: [], r: -1, phase: null, auction: null, pick: null, deadline: 0, result: null, history: [], votes: [], winners: null,
  };
}
function clampInt(n, lo, hi) { return Math.max(lo, Math.min(hi, Math.round(Number(n)) || lo)); }
const bump = room => { room.rev++; };

function addPlayer(room, name, { cpu = false } = {}) {
  if (room.status !== 'lobby') throw Error('The game has already started');
  if (room.players.length >= room.capacity) throw Error('That game is full');
  const taken = new Set(room.players.map(p => p.name.toLowerCase()));
  let nm = name, k = 2;
  while (taken.has(nm.toLowerCase())) nm = name.slice(0, 13) + ' ' + k++;
  room.players.push({ name: nm, color: COLORS[room.players.length], cpu, budget: room.budget, base: null, items: [], seen: room.clock() });
  bump(room);
  return room.players.length - 1;
}
function removePlayer(room, p) {
  if (room.status !== 'lobby') throw Error('The game has already started');
  room.players.splice(p, 1);
  room.players.forEach((pl, i) => { pl.color = COLORS[i]; });
  bump(room);
}

// ---------- Building the markets ----------
function shuffle(rng, a) { const x = [...a]; for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; } return x; }
// A market of k items from a category: at least one showpiece and one solid item, so there is always a real trade-off.
function sample(rng, items, k) {
  const pool = shuffle(rng, items), pick = [];
  const take = f => { const i = pool.findIndex(f); if (i >= 0 && pick.length < k) pick.push(pool.splice(i, 1)[0]); };
  take(x => x.tier === 3);
  if (k > 1) take(x => x.tier === 1);
  while (pick.length < k && pool.length) pick.push(pool.shift());
  return pick;
}
// Showpieces first, so the big decisions come while everyone is still bidding.
const byTier = lots => lots.map((l, i) => [l, i]).sort((a, b) => b[0].tier - a[0].tier || a[1] - b[1]).map(e => e[0]);
const lotOf = x => ({ id: x.id, tier: x.tier, state: 'waiting', winner: null, price: 0, how: null });

function buildRounds(room) {
  const { theme: t, rng } = room, n = room.players.length, rounds = [];
  if (t.bases.length) rounds.push({ kind: 'base', name: 'Choose your ' + (t.archetype === 'plot' ? 'home' : t.noun), emoji: t.emoji, lots: byTier(sample(rng, t.bases, n + 1)).map(lotOf), got: [] });
  // Keep the theme's own order of categories (it is written to build up sensibly); a shorter game skips some at random.
  const keep = new Set(shuffle(rng, t.categories.map(c => c.id)).slice(0, room.roundsWanted));
  const upgrades = shuffle(rng, t.upgrades);
  for (const c of t.categories.filter(c => keep.has(c.id))) {
    const lots = sample(rng, c.items, upgrades.length ? n : n + 1);
    if (upgrades.length) lots.push(upgrades.shift());
    rounds.push({ kind: 'items', category: c.id, name: c.name, emoji: c.emoji, lots: byTier(lots).map(lotOf), got: [] });
  }
  return rounds;
}

function start(room) {
  if (room.status !== 'lobby') throw Error('The game has already started');
  if (room.players.length < 2) throw Error('Waiting for at least two players');
  room.rounds = buildRounds(room);
  room.status = 'playing'; room.r = -1;
  nextRound(room);
}

// ---------- Flow ----------
const round = room => room.rounds[room.r];
const needers = room => room.players.map((_, i) => i).filter(i => !round(room).got.includes(i));
const waiting = room => round(room).lots.filter(l => l.state === 'waiting');
const away = (room, p) => !room.players[p].cpu && room.clock() - room.players[p].seen > room.timing.away;

function nextRound(room) {
  room.r++;
  room.auction = null; room.pick = null; room.result = null;
  if (room.r >= room.rounds.length) return startVoting(room);
  // Everyone sees the whole market before the first lot, so they can plan what to fight for.
  room.phase = 'market'; room.deadline = room.clock() + room.timing.market;
}
// After each lot: auction the next one, or let the players still needing something choose.
function advance(room) {
  room.result = null;
  const need = needers(room), left = waiting(room);
  if (!need.length) { left.forEach(l => { l.state = 'left'; }); return nextRound(room); }
  if (need.length === 1 || left.length <= need.length) return startPick(room, need);
  startLot(room, left[0]);
}

function startLot(room, lot) {
  const rd = round(room), n = room.players.length, idx = rd.lots.indexOf(lot);
  lot.state = 'live';
  room.phase = 'bidding';
  room.auction = { lot: idx, bid: 0, leader: null, turn: null, out: room.players.map((_, i) => rd.got.includes(i)), log: [] };
  // A different player opens each lot.
  passTurn(room, (room.r + idx) % n - 1);
}
function canBid(room, p) { const a = room.auction; return !a.out[p] && a.leader !== p; }
function passTurn(room, from) {
  const a = room.auction, n = room.players.length;
  for (let i = 0; i < n; i++) if (canBid(room, i) && room.players[i].budget < a.bid + 1) { a.out[i] = true; a.log.push({ p: i, a: null, why: 'out of money' }); }
  const left = room.players.map((_, i) => i).filter(i => canBid(room, i));
  if (!left.length) return closeLot(room);
  let next = null;
  for (let k = 1; k <= n; k++) { const p = (((from + k) % n) + n) % n; if (canBid(room, p)) { next = p; break; } }
  a.turn = next;
  room.deadline = room.clock() + (room.players[next].cpu ? room.timing.cpu : away(room, next) ? 0 : room.timing.turn);
}
function closeLot(room) {
  const a = room.auction, rd = round(room), lot = rd.lots[a.lot];
  a.turn = null;
  if (a.leader === null) {
    lot.state = 'unsold';
    room.history.push({ round: room.r, id: lot.id, winner: null, price: 0, how: 'unsold' });
    room.result = { lot: a.lot, winner: null, price: 0, note: 'No bids, so it is set aside' };
  } else {
    award(room, a.leader, a.lot, a.bid, 'auction');
    room.result = { lot: a.lot, winner: a.leader, price: a.bid, note: '' };
  }
  room.phase = 'sold'; room.deadline = room.clock() + room.timing.sold;
}
function award(room, p, lotIndex, price, how) {
  const rd = round(room), lot = rd.lots[lotIndex], pl = room.players[p], x = room.theme.index[lot.id];
  if (rd.got.includes(p) || lot.state === 'sold' || lot.state === 'picked' || price < 0 || price > pl.budget) throw Error('Invalid allocation');
  pl.budget -= price;
  if (x.kind === 'base') pl.base = x.id; else pl.items.push(x.id);
  lot.state = how === 'pick' ? 'picked' : 'sold'; lot.winner = p; lot.price = price; lot.how = how;
  rd.got.push(p);
  room.history.push({ round: room.r, id: lot.id, winner: p, price, how });
}

// Choosing for free: least money first (a catch-up for whoever saved), then seat order.
function startPick(room, need) {
  const order = [...need].sort((a, b) => room.players[a].budget - room.players[b].budget || a - b);
  room.phase = 'picking'; room.auction = null;
  room.pick = { order, turn: 0 };
  armPick(room);
}
function armPick(room) {
  const p = room.pick.order[room.pick.turn];
  room.deadline = room.clock() + (room.players[p].cpu ? room.timing.cpu : away(room, p) ? 0 : room.timing.pick);
}
function choose(room, p, id) {
  const pk = room.pick, rd = round(room);
  if (room.phase !== 'picking' || pk.order[pk.turn] !== p) throw Error('It is not your choice');
  const i = rd.lots.findIndex(l => l.id === id && l.state === 'waiting');
  if (i < 0) throw Error('That one is not available');
  award(room, p, i, 0, 'pick');
  pk.turn++;
  if (pk.turn >= pk.order.length) { waiting(room).forEach(l => { l.state = 'left'; }); room.pick = null; return nextRound(room); }
  armPick(room);
}
// Timeouts and the CPU take the best tier left (first in market order).
const bestLeft = room => waiting(room)[0].id;

// ---------- Moves ----------
function bid(room, p, amount) {
  const a = room.auction;
  if (room.phase !== 'bidding' || a.turn !== p) throw Error('It is not your turn');
  if (!Number.isSafeInteger(amount) || amount <= a.bid || amount > room.players[p].budget) throw Error('Invalid bid');
  a.bid = amount; a.leader = p; a.log.push({ p, a: amount });
  passTurn(room, p);
}
function pass(room, p, why) {
  const a = room.auction;
  if (room.phase !== 'bidding' || a.turn !== p) throw Error('It is not your turn');
  a.out[p] = true; a.log.push(why ? { p, a: null, why } : { p, a: null });
  passTurn(room, p);
}
function cpuBid(room, p) {
  const a = room.auction, pl = room.players[p], lot = round(room).lots[a.lot];
  const left = room.rounds.length - room.r;
  const value = Math.floor((pl.budget / Math.max(1, left)) * [0, 0.5, 1, 1.6][lot.tier] * (0.7 + room.rng() * 0.6));
  if (a.bid + 1 <= Math.min(value, pl.budget)) bid(room, p, Math.min(pl.budget, a.bid + (value - a.bid > 6 && room.rng() < 0.5 ? 3 : 1)));
  else pass(room, p);
}

// ---------- Voting ----------
function startVoting(room) {
  room.status = 'voting'; room.phase = null; room.deadline = room.clock() + room.timing.vote;
  room.votes = room.players.map((pl, i) => pl.cpu ? others(room, i)[Math.floor(room.rng() * (room.players.length - 1))] : null);
}
const others = (room, p) => room.players.map((_, i) => i).filter(i => i !== p);
function vote(room, p, target) {
  if (room.status !== 'voting') throw Error('Voting is closed');
  if (!Number.isInteger(target) || target === p || !room.players[target]) throw Error('Vote for someone else’s creation');
  room.votes[p] = target;
  if (room.players.every((pl, i) => room.votes[i] !== null || away(room, i))) finish(room);
}
const creationScore = (room, p) => [room.players[p].base, ...room.players[p].items].filter(Boolean).reduce((s, id) => s + (room.theme.index[id].kind === 'base' ? 0 : room.theme.index[id].tier), 0);
function finish(room) {
  const score = room.players.map((_, i) => room.votes.filter(v => v === i).length);
  const points = room.players.map((_, i) => creationScore(room, i));
  const top = Math.max(...score), tied = score.map((s, i) => i).filter(i => score[i] === top);
  const best = Math.max(...tied.map(i => points[i])), win = tied.filter(i => points[i] === best);
  room.winners = { score, points, players: win, tiebreak: tied.length > 1 ? (win.length < tied.length ? 'score' : 'shared') : null };
  room.status = 'finished'; room.deadline = 0;
}

// ---------- Clock ----------
// Applies everything that is due. Call it on every request; it is idempotent.
function tick(room) {
  for (let guard = 0; guard < 500; guard++) {
    const now = room.clock();
    if (room.status === 'voting') { if (now >= room.deadline) { finish(room); bump(room); } return; }
    if (room.status !== 'playing') return;
    if (room.phase === 'bidding') {
      const p = room.auction.turn;
      if (now < room.deadline && !away(room, p)) return;
      if (room.players[p].cpu) cpuBid(room, p);
      else pass(room, p, away(room, p) ? 'away' : 'time ran out');
    } else if (room.phase === 'picking') {
      const p = room.pick.order[room.pick.turn];
      if (now < room.deadline && !away(room, p)) return;
      choose(room, p, bestLeft(room));
    } else if (now >= room.deadline) advance(room); // market preview or a lot result has been shown long enough
    else return;
    bump(room);
  }
}

function act(room, p, m) {
  room.players[p].seen = room.clock();
  tick(room);
  if (m.type === 'start') { if (p !== 0) throw Error('Only the host can start'); start(room); }
  else if (m.type === 'vote') vote(room, p, Number(m.target));
  else {
    if (room.status !== 'playing') throw Error('The auction is not running');
    // Moves carry what the player saw; a tap based on an out-of-date screen is refused with the fresh state.
    if (Number(m.round) !== room.r || (m.type !== 'pick' && (!room.auction || Number(m.lot) !== room.auction.lot || Number(m.seen) !== room.auction.bid))) { const e = Error('The bidding moved on. Check the new price.'); e.stale = true; throw e; }
    if (m.type === 'bid') bid(room, p, Number(m.amount));
    else if (m.type === 'pass') pass(room, p);
    else if (m.type === 'pick') choose(room, p, String(m.id));
    else throw Error('Unknown action');
  }
  bump(room);
  tick(room);
}

// ---------- What players see ----------
// Only rounds that have started are revealed, so nobody can plan around markets they should not know yet.
function view(room, me = -1) {
  const t = room.theme, shown = room.rounds.slice(0, room.r + 1), ids = new Set();
  room.players.forEach(p => { if (p.base) ids.add(p.base); p.items.forEach(i => ids.add(i)); });
  shown.forEach(rd => rd.lots.forEach(l => ids.add(l.id)));
  if (t.base) ids.add(t.base.id);
  const items = {};
  for (const id of ids) { const x = t.index[id]; items[id] = { name: x.name, blurb: x.blurb, tier: x.tier, kind: x.kind, group: x.group || null, category: x.category || null }; }
  const rd = room.r >= 0 && room.r < room.rounds.length ? room.rounds[room.r] : null;
  return {
    rev: room.rev, now: room.clock(), me, status: room.status, budget: room.budget, capacity: room.capacity, roundsWanted: room.roundsWanted,
    theme: { ...summary(t), categoryInfo: t.categories.map(c => ({ id: c.id, name: c.name, emoji: c.emoji, slot: c.slot, replaces: c.replaces })), baseItem: t.base && t.base.id },
    players: room.players.map((p, i) => ({ name: p.name, color: p.color, cpu: p.cpu, budget: p.budget, base: p.base, items: p.items, away: away(room, i), got: rd ? rd.got.includes(i) : false, voted: room.status === 'voting' ? room.votes[i] !== null : undefined, layout: compose(t, p) })),
    round: rd && { index: room.r, total: room.rounds.length, kind: rd.kind, name: rd.name, emoji: rd.emoji, category: rd.category || null, lots: rd.lots },
    rounds: room.rounds.map(x => ({ kind: x.kind, name: x.name, emoji: x.emoji })),
    frame: frame(room),
    phase: room.phase, deadline: room.deadline,
    auction: room.auction && { ...room.auction, log: room.auction.log.slice(-6) },
    pick: room.pick && { order: room.pick.order, turn: room.pick.turn, who: room.pick.order[room.pick.turn] },
    result: room.result, history: room.history, items,
    votes: room.status === 'finished' ? room.votes : room.status === 'voting' && me >= 0 ? { mine: room.votes[me] } : null,
    winners: room.winners,
  };
}

// Every place on a board this game can fill, so unfilled plots can be drawn as empty land rather than left blank.
function frame(room) {
  const t = room.theme, a = ARCHETYPES[t.archetype], rounds = room.rounds.filter(r => r.kind === 'items');
  const slots = rounds.map((r, i) => {
    const c = t.categories.find(k => k.id === r.category), spot = a.slots[c.slot];
    return { rect: spot === 'sequence' ? a.parcels[i] : spot, category: c.id, sequence: spot === 'sequence' };
  });
  // Grid cells no category uses are shown as empty land, so a site or plot always reads as one whole place.
  const used = new Set(slots.map(x => x.rect.join()));
  const fill = (a.grid || []).filter(r => !used.has(r.join()));
  return { base: a.base, slots, fill };
}

module.exports = { createRoom, addPlayer, removePlayer, start, act, tick, view, TIMING, COLORS };
