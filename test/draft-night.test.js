// Draft Night engine tests. The Railway function source is loaded into a sandbox with a stubbed Bun runtime,
// a controllable clock and a fake OpenAI, so complete games run in milliseconds.
const { test } = require('node:test');
const assert = require('node:assert/strict');
// Values from the sandbox come from another realm, so compare them as plain JSON.
const same = (a, b, m) => assert.deepEqual(JSON.parse(JSON.stringify(a)), b, m);
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { stripTypeScriptTypes } = require('node:module');

const file = path.join(__dirname, '../draft-night/server.ts');
const source = fs.readFileSync(file, 'utf8');

function sandbox({ key = 'test-key', ai, image } = {}) {
  let handler, t = 1_000_000;
  const calls = [];
  const fakeFetch = async (url, opts) => {
    calls.push({ url, opts });
    if (url.endsWith('/chat/completions')) {
      const body = JSON.parse(opts.body);
      const out = ai ? ai(body) : { verdict: 'Everyone wins.' };
      return Response.json({ choices: [{ message: { content: JSON.stringify(out) } }] });
    }
    if (image) await image(url, opts);
    return Response.json({ data: [{ b64_json: Buffer.from('img' + calls.length).toString('base64') }] });
  };
  const ctx = { Bun: { env: key ? { OPENAI_API_KEY: key } : {}, serve(o) { handler = o.fetch; } }, Response, Request, URL, FormData, Blob, Buffer, crypto, AbortSignal, fetch: fakeFetch, console: { error() {} }, setTimeout: (f, ms) => { const h = setTimeout(f, Math.min(ms, 5)); h.unref(); return h; }, clearTimeout };
  vm.runInNewContext(stripTypeScriptTypes(source) + '\nglobalThis.qa={rooms,images,setClock(f){clock=f},worldPrompt,lotPrompt,presetFor,tick};', ctx);
  ctx.qa.setClock(() => t);
  const call = async (p, data) => {
    const res = await handler(new Request('http://localhost' + p, { method: data ? 'POST' : 'GET', body: data ? JSON.stringify(data) : undefined, headers: { 'Content-Type': 'application/json' } }));
    const type = res.headers.get('Content-Type') || '';
    return { status: res.status, body: type.includes('json') ? await res.json() : await res.arrayBuffer() };
  };
  return { call, qa: ctx.qa, calls, advance(ms) { t += ms; }, now: () => t };
}
const flush = () => new Promise(r => setTimeout(r, 15));

// Creates a room, joins everyone and starts it. Returns helpers bound to that room.
async function setup(env, { theme = 'house', names = ['Ariel', 'Louie'], budget = 100, cpu = false } = {}) {
  const made = await env.call('/api/create', { theme, name: names[0], capacity: names.length, budget, cpu });
  assert.equal(made.status, 200, JSON.stringify(made.body));
  const seats = [made.body];
  for (const n of names.slice(1)) { if (cpu) break; const j = await env.call('/api/join', { code: made.body.code, name: n }); assert.equal(j.status, 200); seats.push(j.body); }
  const code = made.body.code;
  const room = () => env.qa.rooms.get(code);
  const state = async () => (await env.call('/api/room?code=' + code)).body;
  const act = async (p, type, extra = {}) => {
    const r = room();
    return env.call('/api/action', { code, player: p, token: seats[p].token, type, lot: r.lot, seen: r.auction.bid, ...extra });
  };
  await flush(); // pictures are prepared in the lobby before the host can start
  const s = await act(0, 'start');
  assert.equal(s.status, 200, JSON.stringify(s.body));
  // Keep every human "present" so the away rule does not fire while the test clock jumps.
  const touch = () => { for (const p of room().players) p.seen = env.now(); };
  const settle = async () => { touch(); env.advance(3000); touch(); await env.call('/api/room?code=' + code); };
  return { code, seats, room, state, act, settle, touch };
}
function checkInvariants(r, budget) {
  for (const p of r.players) {
    assert.ok(p.budget >= 0, 'never negative');
    const spent = r.history.filter(h => h.winner === r.players.indexOf(p)).reduce((s, h) => s + h.price, 0);
    assert.equal(p.budget + spent, budget, 'budget accounting');
    if (r.theme.mode === 'property') assert.ok(p.won.filter(i => r.lots[i].kind === 'base').length <= 1, 'at most one house');
  }
}

test('Scenario A: two-player property game, one house each, ten lots, purchases go to the right player', async () => {
  const env = sandbox();
  const g = await setup(env, { names: ['Ariel', 'Louie'] });
  let r = g.room();
  assert.equal(r.lots.length, 10);
  same(r.lots.slice(0, 2).map(l => l.kind), ['base', 'base']);
  assert.notEqual(r.lots[0].name, r.lots[1].name, 'distinct houses');
  assert.ok(r.lots.slice(2).every(l => l.kind === 'add'));
  // Lot 1: Ariel opens, Louie passes. Ariel buys the first house.
  assert.equal(r.auction.turn, 0);
  assert.equal((await g.act(1, 'bid', { amount: 5 })).status, 400, 'not Louie\'s turn');
  assert.equal((await g.act(0, 'bid', { amount: 12 })).status, 200);
  assert.equal(r.auction.turn, 1);
  assert.equal((await g.act(1, 'pass')).status, 200);
  assert.equal(r.auction.phase, 'sold');
  assert.equal(r.players[0].base, 0);
  assert.equal(r.players[0].budget, 88);
  await g.settle();
  // Lot 2: only Louie still needs a home, so it is his automatically and Ariel cannot bid.
  assert.equal(r.lot, 1);
  assert.equal(r.auction.phase, 'sold');
  assert.equal(r.auction.result.winner, 1);
  assert.equal(r.players[1].base, 1);
  assert.equal(r.players[1].budget, 100);
  await g.settle();
  // Upgrades: whoever's turn it is bids on even lots for Ariel, odd lots for Louie.
  while (r.status === 'playing') {
    const a = r.auction;
    if (a.phase !== 'bidding') { await g.settle(); continue; }
    const want = r.lot % 2 === 0 ? 0 : 1;
    const p = a.turn;
    const res = p === want || a.leader === null ? await g.act(p, 'bid', { amount: a.bid + (p === want ? 3 : 1) }) : await g.act(p, 'pass');
    assert.equal(res.status, 200, JSON.stringify(res.body));
    checkInvariants(r, 100);
  }
  assert.equal(r.status, 'finished');
  assert.equal(r.history.length, 10);
  for (const [p, pl] of r.players.entries()) {
    assert.equal(pl.won.filter(i => r.lots[i].kind === 'base').length, 1, 'exactly one house');
    for (const i of pl.won.slice(1)) assert.equal(r.lots[i].kind, 'add');
    for (const h of r.history.filter(h => h.winner === p)) assert.ok(pl.won.includes(h.lot));
  }
  same(r.players[0].won.slice(1), [2, 4, 6, 8]);
  same(r.players[1].won.slice(1), [3, 5, 7, 9]);
  const view = await g.state();
  assert.equal(view.total, 10);
  assert.equal(view.players[0].name, 'Ariel');
  assert.equal(view.tokens, undefined, 'tokens never leak');
});

test('Scenario B: three-player property game gives everyone exactly one house across 15 lots', async () => {
  for (let run = 0; run < 20; run++) {
    const env = sandbox({ key: '' });
    const g = await setup(env, { names: ['A', 'B', 'C'] });
    const r = g.room();
    assert.equal(r.lots.length, 15);
    assert.equal(r.lots.filter(l => l.kind === 'base').length, 3);
    while (r.status === 'playing') {
      const a = r.auction;
      if (a.phase !== 'bidding') { await g.settle(); continue; }
      const roll = Math.random();
      const res = (roll < 0.45 || a.leader === null) && r.players[a.turn].budget > a.bid ? await g.act(a.turn, 'bid', { amount: a.bid + 1 + Math.floor(Math.random() * 4) > r.players[a.turn].budget ? a.bid + 1 : a.bid + 1 + Math.floor(Math.random() * 4) }) : await g.act(a.turn, 'pass');
      assert.equal(res.status, 200, JSON.stringify(res.body));
      // While houses are on offer, a player with a house never gets a turn.
      if (r.lot < 3 && r.auction.turn !== null) assert.equal(r.players[r.auction.turn].base, null);
      checkInvariants(r, 100);
    }
    for (const p of r.players) assert.equal(p.won.filter(i => r.lots[i].kind === 'base').length, 1);
    assert.equal(r.history.length, 15);
  }
});

test('Scenario C: "Pancakes" starts with a bid for the base (pancakes, waffle, crêpe…) then toppings, never houses', async () => {
  const env = sandbox();
  const t = await env.call('/api/theme', { topic: 'Pancakes', players: 2 });
  assert.equal(t.body.status, 'ok');
  assert.equal(t.body.theme.id, 'pancakes');
  assert.ok(t.body.theme.starts.includes('Belgian Waffle') && t.body.theme.starts.includes('French Crêpes'));
  assert.equal(env.calls.filter(c => c.url.includes('chat')).length, 0);
  for (const topic of ['pancakes', 'Dream pancakes', 'PANCAKE STACK', 'The perfect pancakes']) assert.equal(env.qa.presetFor(topic)?.id, 'pancakes', topic);
  const g = await setup(env, { theme: 'pancakes', names: ['Ariel', 'Louie'] });
  const r = g.room();
  assert.equal(r.theme.mode, 'build');
  assert.equal(r.lots.length, 10);
  same(r.lots.map(l => l.kind), ['base', 'base', 'add', 'add', 'add', 'add', 'add', 'add', 'add', 'add']);
  assert.ok(r.lots.every(l => !/house|garden|pool|villa|terrace/i.test(l.name)), 'only pancake things');
  await flush();
  assert.ok(r.worlds.every(w => w.v === 0), 'everyone shows the shared starting picture (an empty plate) until they win a base');
  // Ariel wins the first base; the second is Louie's automatically.
  await g.act(0, 'bid', { amount: 7 }); await g.act(1, 'pass');
  await g.settle();
  assert.equal(r.players[1].base, 1);
  await g.settle();
  // Lot 3 (first topping): Ariel opens and Louie passes.
  await g.act(0, 'bid', { amount: 4 }); await g.act(1, 'pass');
  await flush(); await flush();
  same(r.players[0].won, [0, 2]);
  assert.equal(r.worlds[0].v, 2, 'base photo, then the topping edited on');
  assert.equal(r.worlds[1].v, 1, 'Louie still shows just his base');
  const p0 = env.qa.worldPrompt(r, 0, 1, 2);
  assert.match(p0, /breakfast plate/);
  assert.ok(p0.includes(r.lots[0].name) && p0.includes(r.lots[2].name + ':'));
  assert.ok(!/house|swimming pool/i.test(p0));
  assert.ok(!p0.includes(r.lots[1].name), "Louie's base is not on Ariel's plate");
});

test('Scenario D: four-player custom theme has 20 lots and separate budgets, inventories and worlds', async () => {
  const ai = (body) => {
    const n = Number(/N = (\d+)/.exec(body.messages[1].content)[1]);
    return { status: 'ok', question: '', options: [], title: 'Treehouse', emoji: '🌳', kind: 'build', noun: 'treehouse', label: 'Upgrade', base_name: 'Plain treehouse', base_blurb: 'Four walls in an oak', base_visual: 'an oak tree', scene: 'Garden photo, eye level', start_label: 'Treehouse', bases: Array.from({ length: 8 }, (_, i) => ({ name: 'Treehouse style ' + i, blurb: 'A start', visual: 'a plain treehouse of style ' + i })), items: Array.from({ length: n }, (_, i) => ({ name: 'Upgrade ' + i, blurb: 'Nice', visual: 'a thing number ' + i + ' on the treehouse' })) };
  };
  const env = sandbox({ ai });
  const t = await env.call('/api/theme', { topic: 'Ultimate treehouse', players: 4 });
  assert.equal(t.body.status, 'ok');
  assert.ok(t.body.theme.maxPlayers >= 4);
  const g = await setup(env, { theme: t.body.theme.id, names: ['A', 'B', 'C', 'D'], budget: 50 });
  const r = g.room();
  assert.equal(r.lots.length, 20);
  while (r.status === 'playing') {
    const a = r.auction;
    if (a.phase !== 'bidding') { await g.settle(); continue; }
    const want = r.lot % 4;
    await g.act(a.turn, a.turn === want ? 'bid' : 'pass', { amount: a.bid + 1 });
  }
  await flush();
  // The last starting option goes free to the only player still without one.
  r.players.forEach((p, i) => { same(p.won, [i, i + 4, i + 8, i + 12, i + 16]); assert.equal(p.budget, i === 3 ? 46 : 45); });
  assert.equal(new Set(r.worlds.map((w, i) => i)).size, 4);
  for (let i = 0; i < 4; i++) {
    const prompt = env.qa.worldPrompt(r, i, 0, 5);
    for (let j = 0; j < 4; j++) for (const lot of r.players[j].won) {
      if (r.lots[lot].kind === 'add') assert.equal(prompt.includes(r.lots[lot].name + ':'), i === j);
      else assert.equal(prompt.includes(r.lots[lot].name), i === j, 'only their own starting option');
    }
  }
});

test('Scenario E: an ambiguous theme asks a question instead of guessing', async () => {
  let seen = [];
  const ai = (body) => {
    seen.push(body.messages[1].content);
    if (!body.messages[1].content.includes('confirmed')) return { status: 'ambiguous', question: 'Who or what is Pam?', options: [{ label: "Pam's dream birthday cake", topic: 'birthday cake' }, { label: 'A pampering spa day', topic: 'spa day' }, { label: "Pam's dream house", topic: 'dream house' }], title: '', emoji: '', kind: 'build', noun: '', label: '', base_name: '', base_blurb: '', base_visual: '', scene: '', items: [] };
    return { status: 'ok', question: '', options: [], title: 'Birthday Cake', emoji: '🎂', kind: 'build', noun: 'cake', label: 'Decoration', base_name: 'Plain sponge', base_blurb: 'Two layers', base_visual: 'an empty cake stand', scene: 'Side view', start_label: 'Cake', bases: [{ name: 'Victoria Sponge', blurb: 'x', visual: 'a plain sponge' }, { name: 'Chocolate Cake', blurb: 'x', visual: 'a plain chocolate cake' }, { name: 'Carrot Cake', blurb: 'x', visual: 'a plain carrot cake' }], items: Array.from({ length: 14 }, (_, i) => ({ name: 'Decoration ' + i, blurb: 'x', visual: 'decoration ' + i + ' on the cake' })) };
  };
  const env = sandbox({ ai });
  const a = await env.call('/api/theme', { topic: 'Pam', players: 2 });
  assert.equal(a.body.status, 'ambiguous');
  assert.equal(a.body.options.length, 3);
  assert.equal(env.qa.presetFor('Pam'), null);
  const b = await env.call('/api/theme', { topic: a.body.options[0].topic, players: 2, confirmed: true });
  assert.equal(b.body.status, 'ok');
  assert.equal(b.body.theme.noun, 'cake');
  assert.match(seen[1], /already confirmed/);
});

test('Scenario F: a modest terrace keeps its identity; only purchased items are requested', async () => {
  const env = sandbox();
  const g = await setup(env, { names: ['Louie', 'Ariel'] });
  const r = g.room();
  // Force the deck: Victorian Terrace first; upgrades include a paddleboard and a supercar.
  const terrace = r.lots.findIndex(l => l.name === 'Victorian Terrace');
  assert.ok(env.qa.lotPrompt(r, r.theme.bases.find(b => b.name === 'Victorian Terrace'), 'base').match(/no swimming pool/i));
  const pb = r.theme.items.find(i => i.name === 'Paddleboard'), car = r.theme.items.find(i => i.name === 'Supercar');
  r.lots[0] = { ...r.theme.bases.find(b => b.name === 'Victorian Terrace'), kind: 'base' };
  r.lots[2] = { ...pb, kind: 'add' }; r.lots[3] = { ...car, kind: 'add' };
  void terrace;
  await g.act(0, 'bid', { amount: 3 }); await g.act(1, 'pass'); await g.settle(); await g.settle();
  for (const lot of [2, 3]) { while (r.lot < lot) await g.settle(); while (r.auction.phase === 'bidding') await g.act(r.auction.turn, r.auction.turn === 0 || r.auction.leader === null ? 'bid' : 'pass', { amount: r.auction.bid + 1 }); }
  await flush(); await flush();
  same(r.players[0].won, [0, 2, 3]);
  const prompt = env.qa.worldPrompt(r, 0, 1, 3);
  assert.match(prompt, /victorian terrace/i);
  assert.match(prompt, /Paddleboard/); assert.match(prompt, /Supercar/);
  assert.match(prompt, /Do not enlarge the house or its plot/);
  assert.match(prompt, /swimming pool/); // listed under "Do not add"
  assert.ok(prompt.indexOf('swimming pool') > prompt.indexOf('Do not add'));
  assert.ok(!/supercar,/.test(prompt.slice(prompt.indexOf('Do not add'))), 'owned supercar is not forbidden');
  // Image chain: v1 is the exact house photo players bid on; later versions are edits of the previous image.
  const edits = env.calls.filter(c => c.url.endsWith('/images/edits'));
  assert.ok(edits.length >= 1);
  const first = edits[0].opts.body;
  assert.ok(first.getAll('image[]').length === 2 || first.getAll('image').length === 1, 'previous world (+ item reference) sent');
  assert.equal(r.worlds[0].v, 3);
  const w = await g.state();
  assert.equal(w.worlds[0].key, 'w0-3');
  const img = await env.call('/api/img?code=' + g.code + '&k=w0-3');
  assert.equal(img.status, 200);
});

test('image jobs never let an older picture replace a newer one, and failures keep the last good image', async () => {
  let fail = false;
  const gates = [];
  const env = sandbox({ image: async (url) => { if (url.endsWith('/edits')) { if (fail) throw new Error('boom'); await new Promise(r => gates.push(r)); } } });
  const g = await setup(env, { theme: 'pizza', names: ['A', 'B'] });
  const r = g.room();
  await flush();
  const win = async who => { while (r.auction.phase !== 'bidding') await g.settle(); while (r.auction.phase === 'bidding') await g.act(r.auction.turn, r.auction.turn === who || r.auction.leader === null ? 'bid' : 'pass', { amount: r.auction.bid + 1 }); };
  await win(0); // A's pizza style; B gets the other one free
  await g.settle(); await flush();
  assert.equal(r.worlds[0].v, 1, 'v1 is the exact pizza photo that was auctioned');
  await win(0); await flush();
  assert.equal(r.worlds[0].state, 'updating');
  await win(0);
  assert.equal(r.players[0].won.length, 3);
  assert.equal(gates.length, 1, 'one edit at a time per player');
  gates.shift()(); await flush(); await flush();
  assert.equal(r.worlds[0].v, 2, 'first edit lands');
  assert.equal(gates.length, 1, 'then the next purchase is edited on top of it');
  gates.shift()(); await flush(); await flush();
  assert.equal(r.worlds[0].v, 3);
  assert.equal(r.worlds[1].v, 1, 'other player untouched');
  fail = true;
  await win(0); await flush(); await flush();
  assert.equal(r.worlds[0].v, 3, 'a failed edit keeps the last good picture');
  assert.equal((await g.state()).worlds[0].key, 'w0-3');
});

test('Scenario G: auction edge cases', async () => {
  const env = sandbox({ key: '' });
  const g = await setup(env, { theme: 'burger', names: ['A', 'B', 'C'], budget: 20 });
  const r = g.room();
  assert.equal(r.auction.turn, 0);
  // Invalid bids are rejected and leave state untouched.
  for (const amount of [0, -1, 1.5, 21, 'x']) assert.equal((await g.act(0, 'bid', { amount })).status, 400);
  assert.equal((await g.act(1, 'pass')).status, 400, 'cannot act out of turn');
  // Rapid double tap: the second request was based on a stale price.
  const seen = r.auction.bid;
  assert.equal((await g.act(0, 'bid', { amount: 3 })).status, 200);
  const stale = await env.call('/api/action', { code: g.code, player: 1, token: g.seats[1].token, type: 'bid', lot: r.lot, seen, amount: 4 });
  assert.equal(stale.status, 409);
  assert.equal(stale.body.room.auction.bid, 3);
  // The leader never gets a turn, so cannot bid against themselves.
  assert.notEqual(r.auction.turn, 0);
  assert.equal((await g.act(0, 'bid', { amount: 5 })).status, 400);
  // B goes all in; C cannot afford to raise beyond 20 so the turn skips straight past anyone who is out.
  assert.equal((await g.act(1, 'bid', { amount: 20 })).status, 200);
  assert.equal(r.auction.phase, 'sold', 'nobody else can afford more than £20');
  assert.equal(r.players[1].budget, 0);
  await g.settle();
  // B has no money: never offered a turn again. Nobody may pass on the opening bid, so every lot sells.
  for (let i = 0; i < 3 && r.status === 'playing'; i++) {
    while (r.auction.phase !== 'bidding') await g.settle();
    const opener = r.auction.turn;
    assert.notEqual(opener, 1);
    const refused = await g.act(opener, 'pass');
    assert.equal(refused.status, 400, 'the opener cannot pass');
    assert.match(refused.body.error, /open the bidding/);
    assert.equal((await g.act(opener, 'bid', { amount: 1 })).status, 200);
    while (r.auction.phase === 'bidding') { assert.notEqual(r.auction.turn, 1); assert.equal((await g.act(r.auction.turn, 'pass')).status, 200); }
    assert.equal(r.auction.phase, 'sold');
    same(r.auction.result, { winner: opener, price: 1, note: '' });
    await g.settle();
  }
  // Timeout on the opening bid: the idle opener is entered at £1 automatically.
  const before = r.auction.turn; g.touch();
  env.advance(31000); g.touch(); // present (still polling) but not acting
  await env.call('/api/room?code=' + g.code);
  assert.equal(r.auction.leader, before);
  assert.equal(r.auction.bid, 1);
  assert.ok(r.auction.log.some(e => e.p === before && /time ran out/.test(e.why)));
  // Timeout after the opening: the idle player is passed.
  const next = r.auction.turn; g.touch(); env.advance(31000); g.touch();
  await env.call('/api/room?code=' + g.code);
  assert.ok(r.auction.log.some(e => e.p === next && e.a === null && e.why === 'time ran out') || r.auction.phase !== 'bidding');
  // Away: a player who stopped polling is skipped immediately.
  g.touch(); while (r.auction.phase !== 'bidding' && r.status === 'playing') await g.settle();
  const t = r.auction.turn; env.advance(25000); for (let i = 0; i < 3; i++) if (i !== t) r.players[i].seen = env.now();
  await env.call('/api/room?code=' + g.code);
  assert.ok(r.auction.log.some(e => e.p === t && /away/.test(e.why || '')) || r.auction.phase !== 'bidding');
  checkInvariants(r, 20);
});

test('a house always sells: the opener must bid £1, and the winner gets only one house', async () => {
  const env = sandbox({ key: '' });
  const g = await setup(env, { names: ['A', 'B', 'C'] });
  const r = g.room();
  assert.equal((await g.act(r.auction.turn, 'pass')).status, 400);
  await g.act(r.auction.turn, 'bid', { amount: 1 }); await g.act(r.auction.turn, 'pass'); await g.act(r.auction.turn, 'pass');
  assert.equal(r.auction.phase, 'sold');
  assert.equal(r.auction.result.price, 1);
  const owner = r.auction.result.winner; await g.settle();
  assert.notEqual(r.auction.turn, owner);
  assert.ok(!r.auction.passed[owner]);
});

test('random games for 2 to 6 players in every mode keep the books balanced', async () => {
  for (const theme of ['house', 'pancakes', 'garage']) for (let n = 2; n <= 6; n++) {
    const env = sandbox({ key: '' });
    const g = await setup(env, { theme, names: Array.from({ length: n }, (_, i) => 'P' + i), budget: 30 });
    const r = g.room();
    assert.equal(r.lots.length, 5 * n);
    let moves = 0;
    while (r.status === 'playing') {
      assert.ok(++moves < 5000, 'game stalled');
      const a = r.auction;
      if (a.phase !== 'bidding') { await g.settle(); continue; }
      const p = r.players[a.turn];
      const res = (Math.random() < 0.5 || a.leader === null) && p.budget > a.bid ? await g.act(a.turn, 'bid', { amount: Math.min(p.budget, a.bid + 1 + Math.floor(Math.random() * 6)) }) : await g.act(a.turn, 'pass');
      assert.equal(res.status, 200, JSON.stringify(res.body));
      checkInvariants(r, 30);
    }
    assert.equal(r.history.length, 5 * n);
    if (theme === 'house') for (const p of r.players) assert.equal(p.won.filter(i => r.lots[i].kind === 'base').length, 1);
  }
});

test('playing against the CPU finishes with the CPU bidding on its own', async () => {
  const env = sandbox({ key: '' });
  const g = await setup(env, { theme: 'house', names: ['Solo'], cpu: true });
  const r = g.room();
  assert.equal(r.players[1].cpu, true);
  let moves = 0;
  while (r.status === 'playing') {
    assert.ok(++moves < 2000);
    g.touch();
    if (r.auction.phase === 'bidding' && r.auction.turn === 0) await g.act(0, (Math.random() < 0.5 || r.auction.leader === null) && r.players[0].budget > r.auction.bid ? 'bid' : 'pass', { amount: r.auction.bid + 1 });
    else { env.advance(1000); await env.call('/api/room?code=' + g.code); }
  }
  assert.ok(r.players[1].won.length >= 1);
  for (const p of r.players) assert.equal(p.won.filter(i => r.lots[i].kind === 'base').length, 1);
});

test('the host cannot start until every picture is ready, and out-of-credit errors are explained', async () => {
  let gate; const held = new Promise(r => gate = r);
  const env = sandbox({ image: async () => { await held; } });
  const made = (await env.call('/api/create', { theme: 'burger', name: 'A', capacity: 2 })).body;
  const j = (await env.call('/api/join', { code: made.code, name: 'B' })).body;
  const first = await env.call('/api/action', { code: made.code, player: 0, token: made.token, type: 'start' });
  assert.equal(first.status, 400);
  assert.match(first.body.error, /preparing pictures/i);
  const prep = (await env.call('/api/room?code=' + made.code)).body.prep;
  assert.equal(prep.total, 1 + 2 + 8, 'empty bun + 2 burgers + 8 toppings');
  gate(); await flush(); await flush();
  const ready = (await env.call('/api/room?code=' + made.code)).body.prep;
  assert.equal(ready.ready, ready.total);
  assert.equal((await env.call('/api/action', { code: made.code, player: 0, token: made.token, type: 'start' })).status, 200);
  void j;
  // No credit: every picture fails at once with a clear reason, and the host may start without them.
  const broke = sandbox({ image: async () => { throw new Error('Image service 429 {"error":{"type":"insufficient_quota","message":"You have no credits remaining."}}'); } });
  const m2 = (await broke.call('/api/create', { theme: 'pizza', name: 'A', capacity: 2 })).body;
  await broke.call('/api/join', { code: m2.code, name: 'B' }); await flush(); await flush();
  const view = (await broke.call('/api/room?code=' + m2.code)).body;
  assert.match(view.prep.error, /run out of credit/);
  const blocked = await broke.call('/api/action', { code: m2.code, player: 0, token: m2.token, type: 'start' });
  assert.equal(blocked.status, 400);
  assert.equal((await broke.call('/api/action', { code: m2.code, player: 0, token: m2.token, type: 'start', force: true })).status, 200);
});

test('auth and joining rules', async () => {
  const env = sandbox({ key: '' });
  const made = (await env.call('/api/create', { theme: 'pizza', name: 'Host', capacity: 2 })).body;
  assert.equal((await env.call('/api/action', { code: made.code, player: 0, token: 'nope', type: 'start' })).status, 403);
  assert.equal((await env.call('/api/action', { code: made.code, player: 0, token: made.token, type: 'start' })).status, 400, 'needs two players');
  const j = (await env.call('/api/join', { code: made.code.toLowerCase(), name: 'Host' })).body;
  assert.equal(j.room.players[1].name, 'Host 2', 'duplicate names are made unique');
  assert.equal((await env.call('/api/join', { code: made.code, name: 'Late' })).status, 400, 'room full');
  assert.equal((await env.call('/api/action', { code: made.code, player: 1, token: j.token, type: 'start' })).status, 400, 'only host starts');
  assert.equal((await env.call('/api/create', { theme: 'nonsense', name: 'X' })).status, 400);
  const pre = await env.call('/api/presets');
  same(pre.body.presets.map(p => p.id), ['house', 'pancakes', 'burger', 'pizza', 'gaming', 'garage']);
});

test('function source also parses as TSX (Railway saves it as index.tsx)', () => {
  // In TSX a generic arrow like <T>(x) => x is read as a JSX tag and the function crashes on boot.
  assert.ok(!/=\s*<[A-Z]\w*>\s*\(/.test(source), 'write generic arrows as <T,>(...) or use a function declaration');
});

test('Railway function stays below the startup argument limit', () => {
  assert.ok(Buffer.byteLength(source, 'utf8') < 96000, 'Single-file Railway function must stay below 96KB (it is passed base64-encoded as one argument)');
});

test('client script parses and talks to the API', () => {
  const client = fs.readFileSync(path.join(__dirname, '../public/draft-night.js'), 'utf8');
  new vm.Script(client);
  assert.match(client, /draft-night-web-production\.up\.railway\.app/);
  const html = fs.readFileSync(path.join(__dirname, '../public/draft-night.html'), 'utf8');
  assert.ok(html.includes('/draft-night.js') && html.includes('/draft-night.css'));
  assert.ok(!html.includes('<iframe'), 'no longer an iframe wrapper');
});
