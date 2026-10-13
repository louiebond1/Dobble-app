// Draft Night v2: market-round engine, theme specs and layout. These are the acceptance tests for rounds and allocation
// from docs/draft-night-investigation.md, run as thousands of complete simulated games.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadThemes, validate, hydrate, MAX_PLAYERS } = require('../lib/draftnight/spec');
const { createRoom, addPlayer, act, tick, view } = require('../lib/draftnight/engine');
const { compose } = require('../lib/draftnight/layout');

const THEMES = loadThemes();
const byId = id => THEMES.find(t => t.id === id);
// Small seeded generator so a failing game can be replayed from its seed.
function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; }; }

function newGame({ theme = 'house', n = 2, budget = 100, rounds = 5, seed = 1, cpu = [] } = {}) {
  let t = 1e9;
  const room = createRoom({ theme: byId(theme), budget, rounds, capacity: n, rng: rng(seed), clock: () => t });
  for (let i = 0; i < n; i++) addPlayer(room, 'P' + i, { cpu: cpu.includes(i) });
  const touch = () => room.players.forEach(p => { p.seen = t; });
  return { room, advance(ms) { t += ms; touch(); tick(room); }, touch, now: () => t };
}
const move = (g, p, m) => act(g.room, p, { round: g.room.r, lot: g.room.auction && g.room.auction.lot, seen: g.room.auction && g.room.auction.bid, ...m });

// Plays one game to the end with a random mix of bids, passes, choices and timeouts. Records every choice made by a
// player (as opposed to a timeout) so tests can check nobody was handed a lot they did not bid on or choose.
function playOut(g, r = g.room.rng) {
  const chosen = new Set();
  g.touch(); if (g.room.status === 'lobby') move(g, 0, { type: 'start' });
  for (let guard = 0; guard < 20000 && g.room.status === 'playing'; guard++) {
    const room = g.room;
    if (room.phase === 'bidding') {
      const p = room.auction.turn;
      if (room.players[p].cpu) { g.advance(room.timing.cpu); continue; }
      const x = r();
      if (x < 0.08) { g.advance(room.timing.turn); continue; } // time runs out
      const cap = Math.floor(room.players[p].budget * r() * 0.6);
      if (x < 0.75 && room.auction.bid + 1 <= Math.min(cap, room.players[p].budget)) move(g, p, { type: 'bid', amount: room.auction.bid + 1 + Math.floor(r() * 3 * (cap > room.auction.bid + 4)) });
      else move(g, p, { type: 'pass' });
    } else if (room.phase === 'picking') {
      const p = room.pick.order[room.pick.turn];
      if (room.players[p].cpu || r() < 0.1) { g.advance(room.timing.pick); continue; }
      const left = room.rounds[room.r].lots.filter(l => l.state === 'waiting');
      const id = left[Math.floor(r() * left.length)].id;
      chosen.add(room.r + ':' + id + ':' + p);
      move(g, p, { type: 'pick', id });
    } else g.advance(room.timing.market);
  }
  return chosen;
}

function checkGame(g, theme, n, rounds) {
  const room = g.room, t = room.theme;
  assert.equal(room.status, 'voting', 'game reaches voting');
  const itemRounds = Math.min(rounds, t.categories.length);
  const seen = new Set();
  room.players.forEach((p, i) => {
    assert.equal(p.items.length, itemRounds, `${theme} ${n}p: player ${i} has exactly one item per round`);
    assert.equal(Boolean(p.base), t.bases.length > 0, 'exactly one base when the theme has a base round');
    const spent = room.history.filter(h => h.winner === i).reduce((s, h) => s + h.price, 0);
    assert.ok(p.budget >= 0 && p.budget + spent === room.budget, 'money adds up and never goes negative');
    for (const id of [p.base, ...p.items].filter(Boolean)) { assert.ok(!seen.has(id), 'no item is owned twice'); seen.add(id); }
    // Each item round gave this player either that round's category item or the round's upgrade.
    room.rounds.forEach((rd, k) => {
      const mine = rd.lots.filter(l => l.winner === i);
      assert.equal(mine.length, 1, 'one lot per player per round');
      const x = t.index[mine[0].id];
      if (rd.kind === 'items') assert.ok(x.kind === 'upgrade' || x.category === rd.category, 'lot belongs to the round');
      else assert.equal(x.kind, 'base');
      assert.ok(rd.lots.length === n + 1, 'market has players + 1 lots');
    });
    // The picture plan holds every purchase exactly once (a repeated upgrade group keeps only the latest).
    const plan = compose(t, p), groups = new Set(p.items.map(id => t.index[id]).filter(x => x.kind === 'upgrade').map(x => x.group || x.id));
    const cats = p.items.filter(id => t.index[id].kind === 'item');
    assert.deepEqual(plan.pieces.filter(x => x.role === 'item').map(x => x.id).sort(), [...cats].sort(), 'every category item is placed once');
    assert.equal(plan.pieces.filter(x => x.role === 'upgrade').length, groups.size, 'every upgrade group is shown once');
    assert.equal(plan.pieces.filter(x => x.role === 'base').length, t.archetype === 'collection' ? 0 : 1, 'one base');
  });
  assert.equal(room.players.reduce((s, p) => s + p.items.length, 0), n * itemRounds, 'total allocations = players × rounds');
}

test('every v2 theme passes validation and supports six players', () => {
  assert.ok(THEMES.length >= 7);
  for (const t of THEMES) assert.deepEqual(validate(t), [], t.id);
  for (const id of ['house', 'pancakes', 'zoo', 'water-park', 'island', 'bedroom', 'garage']) assert.ok(byId(id), id);
  assert.equal(byId('garage').mode, 'drafter');
  // Pancakes start with pancakes: no waffles, crêpes or French toast among the bases.
  for (const b of byId('pancakes').bases) assert.ok(!/waffle|cr[eê]pe|french toast|dutch baby/i.test(b.name), b.name);
  // No starting home is a mansion with a pool.
  for (const b of byId('house').bases) assert.ok(!/mansion|manor|pool/i.test(b.name + b.blurb), b.name);
});

test('invalid themes are rejected with a reason', () => {
  const bad = hydrate({ id: 'x', title: 'X', noun: 'x', mode: 'builder', archetype: 'stack', bases: ['A | a'], categories: [{ id: 'c', name: 'C', slot: 'nowhere', items: ['A | a | 2'] }] });
  const errs = validate(bad).join('\n');
  assert.match(errs, /base options/); assert.match(errs, /slot nowhere/); assert.match(errs, /at least 3 categories/); assert.match(errs, /showpiece/);
});

test('3 players × 5 rounds = 15 allocations and 4 × 5 = 20, plus exactly one house each', () => {
  for (const [n, total] of [[3, 15], [4, 20]]) {
    const g = newGame({ theme: 'house', n, rounds: 5, seed: n });
    playOut(g);
    checkGame(g, 'house', n, 5);
    assert.equal(g.room.players.reduce((s, p) => s + p.items.length, 0), total);
    assert.equal(g.room.players.filter(p => p.base).length, n);
  }
});

test('thousands of random games: every theme, 2–6 players, 1–6 rounds, with CPUs and timeouts', () => {
  let games = 0;
  for (const t of THEMES) for (let n = 2; n <= MAX_PLAYERS; n++) for (const rounds of [1, 3, 5, 6]) for (let s = 0; s < 12; s++) {
    const seed = 1 + games * 7919;
    const g = newGame({ theme: t.id, n, rounds, seed, cpu: s % 3 === 0 ? [n - 1] : [], budget: [5, 20, 100][s % 3] });
    playOut(g);
    checkGame(g, t.id, n, rounds);
    games++;
  }
  assert.ok(games >= 1500, games + ' games');
});

test('nobody is ever handed a lot they did not bid on or choose', () => {
  for (let s = 1; s <= 300; s++) {
    const n = 2 + (s % 5), g = newGame({ theme: THEMES[s % THEMES.length].id, n, seed: s * 31 });
    // Everyone stays active (no timeouts) so every allocation must come from a bid or a choice.
    const chosen = new Set(), room = g.room;
    g.touch(); move(g, 0, { type: 'start' });
    while (room.status === 'playing') {
      if (room.phase === 'bidding') { const p = room.auction.turn; if (room.rng() < 0.6 && room.players[p].budget > room.auction.bid) move(g, p, { type: 'bid', amount: room.auction.bid + 1 }); else move(g, p, { type: 'pass' }); }
      else if (room.phase === 'picking') { const p = room.pick.order[room.pick.turn], id = room.rounds[room.r].lots.find(l => l.state === 'waiting').id; chosen.add(room.r + ':' + id + ':' + p); move(g, p, { type: 'pick', id }); }
      else g.advance(room.timing.market);
    }
    for (const h of room.history.filter(h => h.winner !== null)) {
      if (h.how === 'pick') assert.ok(chosen.has(h.round + ':' + h.id + ':' + h.winner), 'a free lot was chosen by its owner');
      else assert.ok(h.price >= 1, 'an auctioned lot was bought with a bid');
    }
  }
});

test('the opener may pass; a lot nobody bids on is set aside and the round still completes', () => {
  const g = newGame({ theme: 'zoo', n: 3, rounds: 1, seed: 5 }), room = g.room;
  g.touch(); move(g, 0, { type: 'start' }); g.advance(room.timing.market);
  const first = room.auction.turn;
  move(g, first, { type: 'pass' });
  assert.equal(room.auction.leader, null, 'the opener passed without paying');
  while (room.phase === 'bidding') move(g, room.auction.turn, { type: 'pass' });
  assert.equal(room.rounds[0].lots[0].state, 'unsold');
  assert.equal(room.result.note, 'No bids, so it is set aside');
  g.advance(room.timing.sold);
  // 3 lots left for 3 players: they now choose, least money first.
  assert.equal(room.phase, 'picking');
  while (room.phase === 'picking') { const p = room.pick.order[room.pick.turn]; move(g, p, { type: 'pick', id: room.rounds[0].lots.find(l => l.state === 'waiting').id }); }
  assert.equal(room.status, 'voting');
  assert.ok(room.players.every(p => p.items.length === 1 && p.budget === 100));
});

test('the last player in a round chooses from what is left, and the poorest chooses first', () => {
  const g = newGame({ theme: 'pancakes', n: 3, rounds: 1, seed: 9 }), room = g.room;
  g.touch(); move(g, 0, { type: 'start' }); g.advance(room.timing.market);
  // Base round: two lots are bought, the third player chooses between the last two.
  for (let k = 0; k < 2; k++) {
    const p = room.auction.turn; move(g, p, { type: 'bid', amount: 10 + k });
    while (room.phase === 'bidding') move(g, room.auction.turn, { type: 'pass' });
    g.advance(room.timing.sold);
  }
  assert.equal(room.phase, 'picking');
  assert.equal(room.pick.order.length, 1);
  assert.equal(room.rounds[0].lots.filter(l => l.state === 'waiting').length, 2, 'a real choice of two');
  const who = room.pick.order[0];
  move(g, who, { type: 'pick', id: room.rounds[0].lots.filter(l => l.state === 'waiting')[1].id });
  assert.ok(room.players.every(p => p.base), 'everyone has pancakes');
  assert.ok(room.players.every(p => /pancake|stack/i.test(room.theme.index[p.base].name + room.theme.index[p.base].blurb)));
  // Item round: nobody bids at all, so all four lots fall to free choice in order of least money.
  g.advance(room.timing.market);
  while (room.phase === 'bidding') move(g, room.auction.turn, { type: 'pass' });
  for (let i = 0; i < 4 && room.phase === 'sold'; i++) { g.advance(room.timing.sold); while (room.phase === 'bidding') move(g, room.auction.turn, { type: 'pass' }); }
  assert.equal(room.phase, 'picking');
  const budgets = room.pick.order.map(p => room.players[p].budget);
  assert.deepEqual(budgets, [...budgets].sort((a, b) => a - b), 'least money chooses first');
});

test('timeouts pass rather than buying, and away players never stall a lot', () => {
  const g = newGame({ theme: 'island', n: 2, rounds: 1, seed: 3 }), room = g.room;
  g.touch(); move(g, 0, { type: 'start' }); g.advance(room.timing.market);
  const opener = room.auction.turn;
  g.advance(room.timing.turn);
  assert.ok(room.auction.out[opener], 'the opener timed out and passed');
  assert.equal(room.auction.leader, null, 'nobody was charged');
  // The other player stops polling: they are passed straight away and the lot is set aside.
  room.players[1 - opener].seen = g.now() - room.timing.away - 1; tick(room);
  assert.equal(room.phase, 'sold'); assert.equal(room.result.winner, null);
});

test('out-of-date taps are refused, bids must beat the price and fit the budget', () => {
  const g = newGame({ theme: 'bedroom', n: 2, budget: 10, seed: 4 }), room = g.room;
  g.touch(); move(g, 0, { type: 'start' }); g.advance(room.timing.market);
  const p = room.auction.turn;
  assert.throws(() => act(room, p, { type: 'bid', amount: 2, round: room.r, lot: room.auction.lot, seen: 5 }), /moved on/);
  assert.throws(() => move(g, p, { type: 'bid', amount: 11 }), /Invalid bid/);
  assert.throws(() => move(g, 1 - p, { type: 'bid', amount: 1 }), /not your turn/);
  move(g, p, { type: 'bid', amount: 3 });
  assert.throws(() => move(g, 1 - p, { type: 'bid', amount: 3 }), /Invalid bid/);
});

test('upgrades to the base come up every round, and a second upgrade of the same kind replaces the first', () => {
  for (const id of ['house', 'pancakes', 'zoo', 'bedroom']) {
    const g = newGame({ theme: id, n: 4, rounds: 6, seed: 11 });
    g.touch(); move(g, 0, { type: 'start' });
    assert.ok(g.room.rounds.filter(r => r.kind === 'items').every(r => r.lots.filter(l => g.room.theme.index[l.id].kind === 'upgrade').length === 1), id + ': one upgrade per round');
  }
  const t = byId('pancakes'), [choc, red] = t.upgrades.filter(u => u.group === 'batter');
  const plan = compose(t, { base: t.bases[0].id, items: [choc.id, t.categories[0].items[0].id, red.id] });
  assert.deepEqual(plan.pieces.filter(x => x.role === 'upgrade').map(x => x.id), [red.id]);
  assert.deepEqual(plan.replaced, { [choc.id]: red.id }, 'the replaced batter is reported, not silently dropped');
  // A bed bought in the bed round replaces the basic bed rather than adding a second one.
  const b = byId('bedroom'), bed = b.categories.find(c => c.id === 'bed').items[0];
  assert.deepEqual(compose(b, { base: null, items: [bed.id] }).hidden, ['bed']);
});

test('drafter games are collections: no base, no upgrades, one card per pick', () => {
  const g = newGame({ theme: 'garage', n: 3, rounds: 6, seed: 2 });
  playOut(g); checkGame(g, 'garage', 3, 6);
  const v = view(g.room, 0);
  assert.equal(v.theme.mode, 'drafter');
  assert.ok(v.players.every(p => p.base === null && p.layout.pieces.length === 6 && p.layout.pieces.every(x => x.slot === 'card')));
});

test('voting: never for yourself, everyone voted ends it, creation score (not money) breaks a tie', () => {
  const g = newGame({ theme: 'zoo', n: 2, rounds: 1, seed: 8 }), room = g.room;
  playOut(g);
  assert.throws(() => act(room, 0, { type: 'vote', target: 0 }), /someone else/);
  act(room, 0, { type: 'vote', target: 1 });
  assert.equal(room.status, 'voting');
  act(room, 1, { type: 'vote', target: 0 });
  assert.equal(room.status, 'finished');
  const pts = room.winners.points, best = pts[0] === pts[1] ? null : pts[0] > pts[1] ? 0 : 1;
  assert.deepEqual(room.winners.players, best === null ? [0, 1] : [best]);
  assert.equal(room.winners.tiebreak, best === null ? 'shared' : 'score');
  // Saving money is no route to victory: a player who never bids cannot win a tie on cash.
  assert.ok(!('money' === room.winners.tiebreak));
});

test('voting closes on its timer, and players only see markets for rounds that have started', () => {
  const g = newGame({ theme: 'water-park', n: 3, rounds: 4, seed: 6 }), room = g.room;
  g.touch(); move(g, 0, { type: 'start' });
  const v = view(room, 0);
  const future = room.rounds.slice(1).flatMap(r => r.lots.map(l => l.id));
  assert.ok(future.every(id => !(id in v.items)), 'later markets stay hidden');
  assert.equal(v.round.lots.length, 4);
  playOut(g);
  g.advance(room.timing.vote);
  assert.equal(room.status, 'finished');
});
