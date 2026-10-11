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
const THEMES = JSON.parse(fs.readFileSync(path.join(__dirname, '../public/draft-night-themes.json'), 'utf8'));

// rev: share of reverse auctions (duds). Older scenarios script every lot as a normal auction, so it defaults to none.
// batch: wins per picture edit (live default 2; older scenarios check one edit per win). fallback: allow paid OpenAI fallback.
// bucket: a Map standing in for the picture library's storage bucket (shared between sandboxes like the real one).
function sandbox({ key = 'test-key', ai, image, cf, rev = '0', batch = '1', fallback, bucket, admin, broken, cap, fallbackCap = 50, check } = {}) {
  cf = cf ?? (key ? {} : undefined);
  let handler, t = 1_000_000;
  const calls = [];
  const fakeFetch = async (url, opts) => {
    // The preset themes come from the client site's themes file.
    if (url.endsWith('/draft-night-themes.json')) return Response.json(THEMES);
    calls.push({ url, opts });
    if (url.includes('/ai/run/')) {
      if (cf.flagged && (!cf.once || calls.filter(c => c.url.includes('/ai/run/')).length === 1)) return Response.json({ errors: [{ code: 3030, message: 'output flagged' }] }, { status: 400 });
      if (cf.fail && !(cf.stronger && url.endsWith('9b'))) return cf.quota ? new Response('{"errors":[{"code":4006,"message":"daily free allocation used up"}]}', { status: 429 }) : new Response('temporary provider failure', { status: 500 });
      if (image) await image(url, opts);
      return Response.json({ result: { image: Buffer.from('cf' + calls.length).toString('base64') }, success: true });
    }
    if (url.endsWith('/chat/completions')) {
      const body = JSON.parse(opts.body);
      if (body.response_format?.json_schema?.name === 'creation_check') return Response.json({ usage: { prompt_tokens: 100, completion_tokens: 100 }, choices: [{ message: { content: JSON.stringify(check ? check(body) : { complete: true, missing: [], reason: '' }) } }] });
      const out = ai ? ai(body) : { verdict: 'Everyone wins.' };
      return Response.json({ usage: { prompt_tokens: 100, completion_tokens: 100 }, choices: [{ message: { content: JSON.stringify(out) } }] });
    }
    if (image) await image(url, opts);
    return Response.json({ data: [{ b64_json: Buffer.from('img' + calls.length).toString('base64') }] });
  };
  const vars = { DRAFT_REVERSE_SHARE: rev, DRAFT_WORLD_BATCH: batch, ...(bucket ? { ART_BUCKET: 'art', ART_KEY_ID: 'id', ART_SECRET: 's', ART_ENDPOINT: 'https://store.test' } : {}), ...(admin ? { DRAFT_ADMIN_KEY: admin } : {}), ...(cap ? { DRAFT_DAILY_PICTURES: String(cap) } : {}), DRAFT_DAILY_OPENAI_FALLBACKS: String(fallbackCap), DRAFT_ALLOW_PAID_FALLBACK: fallback === false ? '0' : '1', ...(key ? { OPENAI_API_KEY: key } : {}), ...(cf ? { CF_ACCOUNT_ID: 'acc123', CF_API_TOKEN: 'cf-token' } : {}) };
  const S3Client = class { file(k) { return { exists: async () => { if (broken) throw Error('down'); return bucket.has(k); }, arrayBuffer: async () => bucket.get(k).buffer, text: async () => { if (!bucket.has(k)) throw Error('NoSuchKey'); return new TextDecoder().decode(bucket.get(k)); }, write: async (b) => { if (broken) throw Error('down'); bucket.set(k, typeof b === 'string' ? new TextEncoder().encode(b) : new Uint8Array(b)); }, presign: () => 'https://store.test/' + k + '?sig=1' }; } };
  const ctx = { TextEncoder, Bun: { env: vars, S3Client, serve(o) { handler = o.fetch; } }, Response, Request, URL, FormData, Blob, Buffer, crypto, AbortSignal, fetch: fakeFetch, console: { error() {} }, setTimeout: (f, ms) => { const h = setTimeout(f, Math.min(ms, 5)); h.unref(); return h; }, clearTimeout };
  vm.runInNewContext(stripTypeScriptTypes(source) + '\nglobalThis.qa={rooms,images,setClock(f){clock=f},worldPrompt,lotPrompt,presetFor,tick,fill,makeImage,ensureWorld,openaiJSON,newCost,weightedDeck,hydrateCatalogue,essentialRules,cacheJobs,ready:loadPresets(),PRESETS,themes};', ctx);
  ctx.qa.setClock(() => t);
  const call = async (p, data) => {
    await ctx.qa.ready;
    const res = await handler(new Request('http://localhost' + p, { method: data ? 'POST' : 'GET', body: data ? JSON.stringify(data) : undefined, headers: { 'Content-Type': 'application/json' } }));
    const type = res.headers.get('Content-Type') || '';
    return { status: res.status, body: type.includes('json') ? await res.json() : await res.arrayBuffer() };
  };
  return { call, qa: ctx.qa, calls, advance(ms) { t += ms; }, now: () => t };
}
const flush = () => new Promise(r => setTimeout(r, 15));

// Creates a room, joins everyone and starts it. Returns helpers bound to that room.
async function setup(env, { theme = 'house', names = ['Ariel', 'Louie'], budget = 100, cpu = false, auctionCount } = {}) {
  const made = await env.call('/api/create', { theme, name: names[0], capacity: names.length, budget, cpu, auctionCount });
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
  // Storage hashing can take longer on Railway than locally; wait for the actual readiness condition.
  let prepared;
  for (let i = 0; i < 200; i++) {
    prepared = (await state()).prep;
    if (!prepared.enabled || prepared.ready + prepared.failed === prepared.total) break;
    await flush();
  }
  assert.ok(!prepared.enabled || prepared.ready + prepared.failed === prepared.total, 'mock pictures finish preparing');
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
    const me = r.players.indexOf(p);
    const spent = r.history.reduce((s, h) => s + (h.winner === me ? h.price : 0) + (h.paid ? h.paid[me] : 0), 0);
    assert.equal(p.budget + spent, budget, 'budget accounting');
    if (r.theme.mode === 'property') assert.ok(p.won.filter(i => r.lots[i].kind === 'base').length <= 1, 'at most one house');
  }
}

test('all 250 curated ideas have 75–100 distinct compatible choices and valid essentials',async()=>{
  const env=sandbox({key:''});await env.qa.ready;
  assert.equal(env.qa.PRESETS.length,250);
  assert.equal(new Set(env.qa.PRESETS.map(t=>t.id)).size,250);
  for(const t of env.qa.PRESETS){
    assert.ok(t.items.length>=75&&t.items.length<=100,t.id);
    assert.equal(new Set(t.items.map(x=>x.name)).size,t.items.length,t.id);
    assert.ok(env.qa.weightedDeck(t).length>=30,t.id+' supports six players');
    for(const e of t.essentials||[]) for(const base of t.startMode==='included'?[t.base]:t.bases) assert.ok(base.visual.includes(e.visual),t.id+' includes '+e.name);
    if(t.startMode==='included') assert.equal(t.bases.length,0,t.id);
  }
  for(const topic of ['bedroom','dream bedroom','desert island','lazy river','bathroom','kitchen']){
    if(topic==='lazy river')continue;
    assert.ok(env.qa.presetFor(topic),topic);
  }
  const result=await env.call('/api/theme',{topic:'Dream bedroom'});
  assert.equal(result.body.theme.id,'bedroom');assert.equal(result.body.theme.hasBases,false);
  same(result.body.theme.essentials,['Basic bed','Basic clothes storage']);assert.equal(env.calls.length,0,'library lookup needs no AI');
});

test('functional starters are complete across every venue family and upgrades replace their baseline',async()=>{
 const env=sandbox({key:''});await env.qa.ready;
 const required={
  bedroom:['bed','storage'],'living-room':['seating'],kitchen:['cooker','sink','fridge','worktop','storage','tools'],bathroom:['toilet','sink','shower'],city:['homes','roads','services'],
  'theme-park':['entrance','ride','facilities'],'water-park':['entrance','pool','facilities'],zoo:['entrance','habitat','care'],resort:['reception','rooms','dining'],restaurant:['kitchen','tables'],
  cafe:['counter','seating','brewer','sink'],bakery:['oven','counter','prep','bread'],bar:['bar','seating','drinks','sink'],office:['desk','chair','computer'],gym:['floor','equipment'],studio:['bench','tools'],
  'space-base':['habitat','airlock','life-support','power'],campsite:['camp','facilities'],'sports-complex':['reception','court','changing'],festival:['entrance','stage','facilities'],arcade:['entrance','machine'],
  museum:['entrance','collection'],airport:['runway','terminal','taxiway','tower'],yacht:['hull','helm','cabin','galley','bathroom'],supercar:['body','wheels','engine','seats','steering','brakes'],
  aquarium:['entrance','tank'],hotel:['rooms','reception','bathrooms'],cinema:['screen','seating','projector','sound'],'golf-course':['clubhouse','holes'],bookshop:['counter','shelves'],
 };
 for(const t of env.qa.PRESETS){
  const expected=required[t.pool||t.id];if(!expected)continue;
  for(const id of expected)assert.ok(t.essentials.some(e=>e.id===id),t.id+' needs '+id);
 }
 for(const id of ['garden','island'])assert.equal(env.qa.PRESETS.find(t=>t.id===id).essentials.length,0,'undeveloped land does not include free attractions');
 for(const [id,name,replaces] of [['kitchen','American Fridge','fridge'],['office','Standing Desk','desk'],['bar','Marble Bar','bar'],['cinema','IMAX Screen','screen'],['cinema','Laser Projector','projector'],['supercar','Bucket Seats','seats'],['gaming','Gaming PC','gaming-unit']]){
  const t=env.qa.PRESETS.find(t=>t.id===id),it=t.items.find(x=>x.name===name);assert.equal(it.replaces,replaces);
  const r={theme:t,players:[{won:[0]}],lots:[it]};assert.match(env.qa.essentialRules(r,0,1),new RegExp(name+' REPLACES'));
 }
 const car=env.qa.PRESETS.find(t=>t.id==='supercar');
 assert.match(env.qa.essentialRules({theme:car,players:[{won:[]}],lots:[]},0,0),/Engine MUST remain part of the working creation; it need not be externally visible/);
});

test('related ideas share art jobs and cache planning never generates images',async()=>{
 const env=sandbox({key:'',admin:'sekret'});await env.qa.ready;
 const plan=await env.call('/api/cache-plan?key=sekret');
 assert.equal(plan.status,200);assert.equal(plan.body.themes,250);assert.equal(plan.body.choices,19971);
 assert.ok(plan.body.uniqueAssets<5000,'shared pools avoid 20,000 duplicate image requests');
 assert.ok(plan.body.startingScenes>=250);assert.equal(env.calls.length,0);
 const one=env.qa.cacheJobs(['bedroom']).length;
 const both=env.qa.cacheJobs(['bedroom','loft-bedroom']).length;
 assert.equal(both,one+1,'only the new included room requires extra art');
 assert.equal((await env.call('/api/cache-plan')).status,403);
});

test('every library theme finishes balanced games for two and six players',async()=>{
  const env=sandbox({key:'',rev:'0.25'});await env.qa.ready;
  for(const theme of env.qa.PRESETS)for(const n of [2,6]){
    const g=await setup(env,{theme:theme.id,names:Array.from({length:n},(_,i)=>'P'+i),budget:15});const r=g.room();
    for(let i=0;i<240&&r.status==='playing';i++){
      g.touch();env.advance(r.auction.phase==='sold'?3000:31000);g.touch();await env.call('/api/room?code='+g.code);
    }
    assert.equal(r.status,'finished',theme.id+' '+n+' players');
    assert.equal(r.history.length,n*5);for(const p of r.players)assert.equal(p.won.length,5);
    checkInvariants(r,15);
    assert.equal(r.lots.filter(l=>l.kind==='base').length,theme.startMode==='included'?0:n);
  }
});

test('bedroom starts with a free bed and a four-poster replaces it without a base auction',async()=>{
  const env=sandbox({key:''});const g=await setup(env,{theme:'bedroom'}),r=g.room();
  assert.ok(r.lots.every(l=>l.kind==='add'));assert.equal(r.players[0].base,null);
  assert.match(r.theme.base.visual,/one plain double bed/);
  assert.equal(r.players[0].budget,100,'included essential costs nothing');
  const upgrade=r.theme.items.find(x=>x.name==='Four-poster Bed');assert.equal(upgrade.replaces,'bed');
  assert.equal(upgrade.group,'bed-upgrade');
  r.lots[0]={...upgrade,kind:'add'};r.players[0].won=[0];
  const prompt=env.qa.worldPrompt(r,0,0,1);
  assert.match(prompt,/Four-poster Bed REPLACES the included Basic bed/);
  assert.match(prompt,/do not also draw the basic version/);
  r.players[1].won=[];assert.match(env.qa.essentialRules(r,1,0),/Basic bed MUST remain/);
  const state=await g.state();same(state.theme.essentials,['Basic bed','Basic clothes storage']);
});

test('weights favour common items, rare choices still occur and alternatives never repeat',async()=>{
  const env=sandbox({key:''});await env.qa.ready;
  let common=0,rare=0;
  const fake={items:[{name:'Common',weight:10},{name:'Rare',weight:1}]};
  for(let i=0;i<4000;i++){const d=env.qa.weightedDeck(fake);if(d[0].name==='Common')common++;else rare++;}
  assert.ok(common>rare*5&&rare>100,{common,rare});
  const bedroom=env.qa.presetFor('bedroom');
  for(let i=0;i<500;i++){
    const d=env.qa.weightedDeck(bedroom);
    assert.ok(d.filter(x=>x.group==='bed-upgrade').length<=1);
    assert.equal(new Set(d.map(x=>x.name)).size,d.length);
  }
});

test('invalid prerequisites and replacements fail catalogue loading instead of reaching a game',async()=>{
 const env=sandbox({key:''});await env.qa.ready;
 const base={id:'invalid',base:{name:'Room',visual:'empty room'},bases:[],items:Array.from({length:75},(_,i)=>({name:'Item '+i,visual:'item '+i})),bad:[]};
 assert.throws(()=>env.qa.hydrateCatalogue({themes:[{...base,items:[{name:'Four-poster',visual:'bed',replaces:'bed'},...base.items.slice(1)]}]}),/Replacement has no included essential/);
 assert.throws(()=>env.qa.hydrateCatalogue({themes:[{...base,items:[{name:'Bedding',visual:'bedding',requires:['bed']},...base.items.slice(1)]}]}),/Missing item prerequisite/);
});

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
  // The last starting option, and the last lot, go free to the only player who still needs them.
  r.players.forEach((p, i) => { same(p.won, [i, i + 4, i + 8, i + 12, i + 16]); assert.equal(p.budget, i === 3 ? 47 : 45); });
  assert.equal(new Set(r.worlds.map((w, i) => i)).size, 4);
  for (let i = 0; i < 4; i++) {
    const prompt = env.qa.worldPrompt(r, i, 0, 5);
    for (let j = 0; j < 4; j++) for (const lot of r.players[j].won) {
      if (r.lots[lot].kind === 'add') assert.equal(prompt.includes(r.lots[lot].name + ':'), i === j);
      else assert.equal(prompt.includes(r.lots[lot].name), i === j, 'only their own starting option');
    }
  }
});

test('custom outdoor creation retains environment scale through base auctions and purchase edits', async () => {
  const ai = body => {
    const n = Number(/N = (\d+)/.exec(body.messages[1].content)[1]);
    return { status: 'ok', title: 'Dream Island', emoji: '🏝️', scope: 'environment', kind: 'collection', noun: 'tropical island', label: 'Development', start_label: 'Island', base_name: 'Bare Island', base_visual: 'an undeveloped tropical island surrounded by ocean', scene: 'Wide oblique aerial view of a whole island in daylight', bases: Array.from({ length: 8 }, (_, i) => ({ name: 'Lagoon Island ' + i, visual: 'whole undeveloped island with a lagoon and open land', blurb: 'Room for your dream developments' })), items: Array.from({ length: n }, (_, i) => ({ name: ['Motorway', 'Beach Resort', 'Theme Park', 'Lazy River'][i % 4] + ' ' + i, visual: 'full-size development occupying inland terrain beside the lagoon', blurb: 'Transforms your island' })), bad_items: [] };
  };
  const env = sandbox({ ai });
  const t = await env.call('/api/theme', { topic: 'My private tropical archipelago', players: 2 });
  assert.equal(t.status, 200);
  const g = await setup(env, { theme: t.body.theme.id });
  const r = g.room();
  assert.equal(r.theme.mode, 'build', 'outdoor designs cannot become accessory collections');
  const base = env.qa.lotPrompt(r, r.lots[0], 'base');
  assert.match(base, /whole undeveloped starting landscape/);
  assert.match(base, /never a printed photograph, tabletop/);
  assert.match(env.qa.lotPrompt(r, r.lots[2], 'add'), /full-size development in its natural outdoor setting/);
  r.players[0].won = [0, 2, 4];
  r.players[1].won = [1, 3];
  const edit = env.qa.worldPrompt(r, 0, 2, 3);
  assert.ok(edit.includes(r.lots[4].name + ':'), 'new development is added');
  assert.ok(edit.includes(r.lots[2].name), 'previous development is preserved');
  assert.ok(!edit.includes(r.lots[3].name), 'opponent development is excluded');
  assert.match(edit, /footprint clearly visible/);
  assert.match(edit, /Keep the coastline, terrain, land area/);
  assert.ok(!edit.includes('toppings'), 'landscapes do not use food editing instructions');
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

test('Scenario F: a cottage keeps its identity; only purchased items are requested', async () => {
  const env = sandbox();
  const g = await setup(env, { names: ['Louie', 'Ariel'] });
  const r = g.room();
  // Force the deck: Country Cottage first; upgrades include a camper van and a supercar.
  assert.ok(env.qa.lotPrompt(r, r.theme.bases.find(b => b.name === 'Country Cottage'), 'base').match(/no swimming pool/i));
  const pesto = { name: 'Pesto Drizzle', blurb: '', visual: 'swirls of green pesto across the pizza' };
  assert.ok(!env.qa.lotPrompt(r, pesto, 'add').includes('Pesto Drizzle'), 'item pictures never name the item, or the model writes it on the picture');
  const pb = r.theme.items.find(i => i.name === 'Camper Van'), car = r.theme.items.find(i => i.name === 'Supercar');
  r.lots[0] = { ...r.theme.bases.find(b => b.name === 'Country Cottage'), kind: 'base', key: 'lot0' };
  r.lots[2] = { ...pb, kind: 'add' }; r.lots[3] = { ...car, kind: 'add' };
  await g.act(0, 'bid', { amount: 3 }); await g.act(1, 'pass'); await g.settle(); await g.settle();
  for (const lot of [2, 3]) { while (r.lot < lot) await g.settle(); while (r.auction.phase === 'bidding') await g.act(r.auction.turn, r.auction.turn === 0 || r.auction.leader === null ? 'bid' : 'pass', { amount: r.auction.bid + 1 }); }
  await flush(); await flush();
  same(r.players[0].won, [0, 2, 3]);
  const prompt = env.qa.worldPrompt(r, 0, 1, 3);
  assert.match(prompt, /country cottage/i);
  assert.match(prompt, /Camper Van/); assert.match(prompt, /Supercar/);
  assert.match(prompt, /Do not enlarge the house or its plot/);
  assert.match(prompt, /swimming pool/); // listed under "Do not add"
  assert.ok(prompt.indexOf('swimming pool') > prompt.indexOf('Do not add'));
  assert.ok(!/supercar,/.test(prompt.slice(prompt.indexOf('Do not add'))), 'owned supercar is not forbidden');
  // Image chain: v1 is the exact house photo players bid on; later versions are edits of the previous image.
  const edits = env.calls.filter(c => c.url.includes('/ai/run/') && c.opts.body.get('input_image_0'));
  assert.ok(edits.length >= 1);
  const first = edits[0].opts.body;
  assert.equal(first.getAll('input_image_0').length, 1, 'only the previous picture is sent (cheapest setting)');
  assert.equal(first.get('width'), '1024');
  assert.equal(first.get('input_fidelity'), null);
  assert.equal(r.worlds[0].v, 3);
  const w = await g.state();
  assert.equal(w.worlds[0].key, 'w0-3');
  const img = await env.call('/api/img?code=' + g.code + '&k=w0-3');
  assert.equal(img.status, 200);
});

test('image jobs never let an older picture replace a newer one, and failures keep the last good image', async () => {
  let fail = false;
  const gates = [];
  const env = sandbox({ image: async (url, opts) => { if (opts.body.get('input_image_0')) { if (fail) throw new Error('boom'); await new Promise(r => gates.push(r)); } } });
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

test('a player with money can buy a normal lot or give it to their broke opponent', async () => {
  for (const choose of ['bid', 'pass', 'timeout']) {
    const env = sandbox({ key: '' });
    const g = await setup(env, { theme: 'garage', budget: 10 });
    const r = g.room();
    await g.act(0, 'bid', { amount: 10 }); await g.settle(); await g.settle();
    assert.equal(r.players[0].budget, 0);
    assert.equal(r.auction.turn, 1);
    assert.equal((await g.state()).auction.giveTo, 0);
    assert.equal((await g.act(0, 'pass')).status, 400, 'broke player cannot choose for their opponent');
    if (choose === 'timeout') { env.advance(31000); g.touch(); await g.state(); }
    else assert.equal((await g.act(1, choose, { amount: 1 })).status, 200);
    assert.equal(r.auction.result.winner, choose === 'bid' ? 1 : 0);
    assert.equal(r.auction.result.price, choose === 'bid' ? 1 : 0);
    assert.equal(r.players[1].budget, choose === 'bid' ? 9 : 10);
    while (r.status === 'playing') {
      if (r.auction.phase !== 'bidding') { await g.settle(); continue; }
      await g.act(r.auction.turn, 'bid', { amount: r.auction.bid + 1 });
    }
    same(r.players.map(p => p.won.length), [5, 5], 'gifting still respects final quotas');
  }
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
  const broke = sandbox({ fallback: false, image: async () => { throw new Error('Image service 429 {"error":{"type":"insufficient_quota","message":"You have no credits remaining."}}'); } });
  const m2 = (await broke.call('/api/create', { theme: 'pizza', name: 'A', capacity: 2 })).body;
  await broke.call('/api/join', { code: m2.code, name: 'B' }); await flush(); await flush();
  const view = (await broke.call('/api/room?code=' + m2.code)).body;
  assert.match(view.prep.error, /run out of credit/);
  const blocked = await broke.call('/api/action', { code: m2.code, player: 0, token: m2.token, type: 'start' });
  assert.equal(blocked.status, 400);
  assert.equal((await broke.call('/api/action', { code: m2.code, player: 0, token: m2.token, type: 'start', force: true })).status, 200);
});

test('nobody can win more than their share (10 auctions, 2 players: 5 each), and upcoming lots are never revealed', async () => {
  const env = sandbox({ key: '' });
  const g = await setup(env, { theme: 'house', names: ['Rich', 'Poor'], budget: 100 });
  const r = g.room();
  r.players[1].budget = 10; // Poor can afford to open every remaining lot at £1
  let peeked = false;
  while (r.status === 'playing') {
    const a = r.auction;
    if (a.phase !== 'bidding') { await g.settle(); continue; }
    const view = await g.state();
    if (view.lots.length !== r.lot + 1) peeked = true;
    // Rich always bids when allowed; Poor only opens when forced.
    const p = a.turn;
    await g.act(p, p === 0 || a.leader === null ? 'bid' : 'pass', { amount: a.bid + 1 });
    for (const pl of r.players) assert.ok(pl.won.length <= 5, pl.name + ' has ' + pl.won.length);
  }
  assert.equal(peeked, false, 'the API never sends lots that have not come up');
  assert.equal(r.players[0].won.length, 5, 'Rich stopped at 5');
  assert.equal(r.players[1].won.length, 5, 'the rest went to Poor');
  const final = await g.state();
  assert.equal(final.lots.length, 10, 'everything is visible once the game is over');
});

test('the win limit is auctions ÷ players: 12 → 6 each, 16 → 8 each, 15 → 8 and 7', async () => {
  for (const [n, want] of [[12, [6, 6]], [16, [8, 8]], [15, [8, 7]]]) {
  const env = sandbox({ key: '' });
  const made = (await env.call('/api/create', { theme: 'burger', name: 'A', capacity: 2, auctionCount: n, budget: 100 })).body;
  assert.equal(made.room.maxWins, Math.ceil(n / 2));
  const j = (await env.call('/api/join', { code: made.code, name: 'B' })).body;
  await flush();
  const seats = [made, j];
  const r = env.qa.rooms.get(made.code);
  assert.equal((await env.call('/api/action', { code: made.code, player: 0, token: made.token, type: 'start' })).status, 200);
  assert.equal(r.lots.length, n);
  let guard = 0;
  while (r.status === 'playing' && guard++ < 500) {
    for (const p of r.players) p.seen = env.now();
    const a = r.auction;
    if (a.phase !== 'bidding') { env.advance(3000); await env.call('/api/room?code=' + made.code); continue; }
    await env.call('/api/action', { code: made.code, player: a.turn, token: seats[a.turn].token, type: a.leader === null ? 'bid' : 'pass', lot: r.lot, seen: a.bid, amount: a.bid + 1 });
  }
  same(r.players.map(p => p.won.length).sort((x, y) => y - x), want, n + ' auctions');
  assert.equal(r.history.filter(h => h.winner === null).length, 0, 'every lot sells');
  }
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
  assert.equal(pre.body.presets.length,250);
  same(pre.body.presets.slice(0,6).map(p => p.id), ['house','pancakes','burger','pizza','gaming','garage']);
});

test('pictures come from Cloudflare when it is set up: lot pictures, then edits of the previous picture', async () => {
  const env = sandbox({ key: '', cf: {} });
  const g = await setup(env, { theme: 'house', names: ['Ariel', 'Louie'] });
  const r = g.room();
  assert.equal((await g.state()).prep.enabled, true, 'pictures are on with only Cloudflare configured');
  // Ariel wins the first house and the first upgrade, so her picture is edited once.
  await g.act(0, 'bid', { amount: 3 }); await g.act(1, 'pass'); await g.settle(); await g.settle();
  while (r.lot < 2) await g.settle();
  while (r.auction.phase === 'bidding') await g.act(r.auction.turn, r.auction.turn === 0 || r.auction.leader === null ? 'bid' : 'pass', { amount: r.auction.bid + 1 });
  await flush(); await flush();
  const cfCalls = env.calls.filter(c => c.url.includes('/ai/run/'));
  assert.ok(cfCalls.length > 0);
  assert.equal(env.calls.filter(c => c.url.includes('/images/')).length, 0, 'OpenAI is not used');
  assert.ok(cfCalls.every(c => c.url === 'https://api.cloudflare.com/client/v4/accounts/acc123/ai/run/@cf/black-forest-labs/flux-2-klein-4b'));
  assert.equal(cfCalls[0].opts.headers.Authorization, 'Bearer cf-token');
  const edit = cfCalls.find(c => c.opts.body.get('input_image_0'));
  assert.ok(edit, 'the world update sends the previous picture');
  same([edit.opts.body.get('width'), edit.opts.body.get('height')], ['1024', '1024']);
  assert.equal(r.worlds[0].v, 2);
  const img = await env.call(`/api/img?code=${g.code}&k=w0-2`);
  assert.equal(img.status, 200);
});

test('game spending stops before unaffordable requests, including parallel failures', async () => {
  const env = sandbox({cf: {fail:true}, fallback:false});
  const cost = env.qa.newCost();
  await Promise.allSettled(Array.from({length:100}, () => env.qa.makeImage('subject', [], 'low', cost)));
  assert.ok(cost.used <= 58000);
  assert.equal(env.calls.filter(c=>c.url.includes('/ai/run/')).length, 50);
  const before=env.calls.length;
  await assert.rejects(env.qa.makeImage('subject', [], 'low',cost), /Game AI budget reached/);
  assert.equal(env.calls.length,before,'budget rejection never sends a provider request');
  await assert.rejects(env.qa.openaiJSON('s','u',{},200,45000,undefined,env.qa.newCost(),'unpriced-model'),/Unpriced text model/);
});

test('a priced stronger model replaces failed pictures only when fallback is enabled', async () => {
  const off = sandbox({ cf: { fail: true, quota: true }, fallback: false });
  const m0 = (await off.call('/api/create', { theme: 'pizza', name: 'A', capacity: 2 })).body;
  await flush(); await flush();
  assert.ok(off.calls.some(c => c.url.includes('/ai/run/')));
  assert.equal(off.calls.filter(c => c.url.includes('/images/')).length, 0, 'explicitly disabling fallback prevents OpenAI spend');
  assert.ok((await off.call('/api/room?code=' + m0.code)).body.prep.failed > 0);
  const env = sandbox({ cf: { fail: true, stronger: true }, fallback: true });
  const made = (await env.call('/api/create', { theme: 'pizza', name: 'A', capacity: 2 })).body;
  await flush(); await flush();
  const v = (await env.call('/api/room?code=' + made.code)).body;
  assert.ok(env.calls.some(c => c.url.includes('/ai/run/')), 'Cloudflare was tried first');
  assert.ok(env.calls.some(c => c.url.endsWith('9b')), 'stronger model was attempted');
  assert.equal(env.calls.filter(c => c.url.includes('/images/')).length, 0, 'variable-price image API is never called');
  assert.ok(v.prep.failed > 0, 'unaffordable retries stop at the game budget');
  assert.ok(v.cost.used <= v.cost.limit);
});

test('provider spending ceiling survives a restart and failed requests are charged', async () => {
  const bucket = new Map();
  const env = sandbox({ cf: { fail: true, stronger: true }, bucket, cap: 20 });
  const made = (await env.call('/api/create', { theme: 'garage', name: 'A', capacity: 2 })).body;
  await flush(); await flush();
  const view = (await env.call('/api/room?code=' + made.code)).body;
  assert.ok(view.cost.used <= 58000);
  const again = sandbox({ cf: {}, bucket, cap: 20 });
  const day = new Date(env.now()).toISOString().slice(0, 10);
  const before = JSON.parse(new TextDecoder().decode(bucket.get('meta/usage-' + day + '.json'))).cfMicros;
  assert.ok(before > 15000, 'failed and stronger attempts both charged');
  for (let i = 0; i < 30; i++) { try { await again.qa.makeImage('another image', [], 'low'); } catch (e) { assert.match(String(e), /Cloudflare cost limit/); break; } }
  const after = JSON.parse(new TextDecoder().decode(bucket.get('meta/usage-' + day + '.json'))).cfMicros;
  assert.ok(after >= before && after <= 20 * 1384);
  assert.ok(again.calls.filter(c => c.url.includes('/ai/run/')).length < 24, 'restart keeps the earlier spend');
});

test('an incomplete final collection is repaired with bounded stronger generation and checked again', async () => {
  let checks = 0;
  const env = sandbox({ check: () => ++checks === 1 ? { complete: false, missing: ['Porsche 911'], reason: 'one car missing' } : { complete: true, missing: [], reason: '' } });
  const g = await setup(env, { theme: 'garage' });
  const r = g.room();
  r.players[0].won = [0, 2, 4, 6, 8]; r.players[0].base = 0; r.worlds[0].v = 1;
  await env.qa.ensureWorld(r, 0); await flush(); await flush();
  assert.equal(checks, 2, 'both initial picture and repaired picture checked');
  const repair = env.calls.filter(c => c.url.includes('/ai/run/') && c.opts.body.get('input_image_0')).at(-1).opts.body;
  assert.ok(env.calls.some(c => c.url.endsWith('9b')), 'stronger repair model used');
  assert.match(repair.get('prompt'), /one car missing/);
  assert.equal(r.worlds[0].v, 5);
  assert.equal(r.worlds[0].state, 'ready');
});

test('a final breakfast image with missing sardines or invented pancakes is rejected', async () => {
  const env=sandbox({check:()=>({complete:false,missing:['Sardines'],reason:'Invented pancakes; sardines missing'})});
  const g=await setup(env,{theme:'pancakes'}),r=g.room();
  r.players[0].won=[0,2,4,6,8];r.players[0].base=0;r.worlds[0].v=1;
  await env.qa.ensureWorld(r,0);await flush();await flush();
  assert.equal(r.worlds[0].v,1,'neither incorrect image is published');
  assert.equal(r.worlds[0].state,'error');
  assert.equal(r.players[0].won.length,5,'all actual purchases remain in inventory');
  const check=env.calls.find(c=>c.url.endsWith('/chat/completions')&&JSON.parse(c.opts.body).response_format.json_schema.name==='creation_check');
  assert.match(JSON.parse(check.opts.body).messages[0].content,/Reject invented extras/);
});

test('garage edits use the original garage and the full inventory on every update', async () => {
  const env = sandbox();
  const g = await setup(env, { theme: 'garage' });
  const r = g.room();
  r.players[0].won = [0, 2, 4, 6, 8]; r.players[0].base = 0;
  r.players[1].won = [1, 3, 5, 7, 9]; r.players[1].base = 1;
  r.worlds[0].v = 3;
  env.qa.images.set(g.code + '/w0-3', new Uint8Array([99]));
  await env.qa.ready;
  const prompt = env.qa.worldPrompt(r, 0, 3, 5, false);
  for (const i of [2, 4, 6, 8]) assert.ok(prompt.includes(r.lots[i].name + ':'), 'all purchases, including earlier cars, are explicitly drawn');
  for (const i of [3, 5, 7, 9]) assert.ok(!prompt.includes(r.lots[i].name + ':'), 'no opponent purchases');
  assert.match(prompt, /exactly 4 purchased additions/);
  assert.match(prompt, /widen the view/);
  assert.ok(!prompt.includes('every existing element identical'), 'collection can make room for every purchase');
  await env.qa.ensureWorld(r, 0); await flush();
  const edit = env.calls.filter(c => c.url.includes('/ai/run/') && c.opts.body.get('input_image_0')).at(-1);
  assert.ok(edit, 'real collection pipeline made an edit');
  const sent = new Uint8Array(await edit.opts.body.get('input_image_0').arrayBuffer());
  same(Array.from(sent), Array.from(env.qa.images.get(g.code + '/lot0')), 'reference is the original garage, not the partial image');
});

test('Quick Play: open games are listed, seats are claimed in order, and the host starts for everyone', async () => {
  const env = sandbox({ key: '' });
  const made = (await env.call('/api/create', { theme: 'house', name: 'Louie', capacity: 4, auctionCount: 16, device: 'dev-louie' })).body;
  let list = (await env.call('/api/lobbies')).body.rooms;
  assert.equal(list.length, 1);
  same({ host: list[0].host, title: list[0].theme.title, players: list[0].players, capacity: list[0].capacity, seat: list[0].seat }, { host: 'Louie', title: 'Dream House', players: ['Louie'], capacity: 4, seat: 2 });
  // Mario, Ariel and Sam join from their own phones and get seats 2, 3 and 4 in that order.
  const names = ['Mario', 'Ariel', 'Sam'], seats = [];
  for (const n of names) { const j = await env.call('/api/join', { code: list[0].code, name: n, device: 'dev-' + n }); assert.equal(j.status, 200); seats.push(j.body); }
  same(seats.map(s => s.player), [1, 2, 3]);
  same(seats[2].room.players.map(p => p.name), ['Louie', 'Mario', 'Ariel', 'Sam']);
  assert.equal(seats[2].room.me, 3);
  assert.equal((await env.call('/api/lobbies')).body.rooms.length, 0, 'a full game disappears from Quick Play');
  // Every phone sees the same lobby, with its own seat.
  for (const s of seats) { const v = (await env.call(`/api/room?code=${s.code}&t=${s.token}`)).body; assert.equal(v.me, s.player); same(v.players.map(p => p.name), ['Louie', 'Mario', 'Ariel', 'Sam']); }
  assert.equal((await env.call('/api/action', { code: made.code, token: seats[0].token, type: 'start' })).status, 400, 'only the host starts');
  const st = await env.call('/api/action', { code: made.code, token: made.token, type: 'start' });
  assert.equal(st.status, 200, JSON.stringify(st.body));
  for (const s of [made, ...seats]) { const v = (await env.call(`/api/room?code=${s.code}&t=${s.token}`)).body; assert.equal(v.status, 'playing'); assert.equal(v.lot, 0); assert.equal(v.total, 16); }
  assert.equal(env.qa.rooms.get(made.code).lots.length, 16);
});

test('Quick Play: simultaneous claims never share a seat, and a full game turns the late phone away', async () => {
  const env = sandbox({ key: '' });
  const made = (await env.call('/api/create', { theme: 'pancakes', name: 'Ariel', capacity: 3, device: 'a' })).body;
  // Two phones tap "I'm Player 2" at the same moment, then a third tries too.
  const [x, y] = await Promise.all([env.call('/api/join', { code: made.code, name: 'Mario', device: 'm', seat: 2 }), env.call('/api/join', { code: made.code, name: 'Luigi', device: 'l', seat: 2 })]);
  same([x.status, y.status], [200, 200]);
  same([x.body.player, y.body.player].sort(), [1, 2], 'one gets Player 2, the other Player 3');
  const late = await env.call('/api/join', { code: made.code, name: 'Peach', device: 'p', seat: 2 });
  assert.equal(late.status, 400); assert.match(late.body.error, /filled up/);
  same(env.qa.rooms.get(made.code).players.map(p => p.name).sort(), ['Ariel', 'Luigi', 'Mario']);
});

test('Quick Play: refreshing or rejoining keeps your seat; leaving frees it for someone else', async () => {
  const env = sandbox({ key: '' });
  const made = (await env.call('/api/create', { theme: 'house', name: 'Louie', capacity: 3, device: 'L' })).body;
  const mario = (await env.call('/api/join', { code: made.code, name: 'Mario', device: 'M' })).body;
  const ariel = (await env.call('/api/join', { code: made.code, name: 'Ariel', device: 'A' })).body;
  // Mario's phone lost its session and he taps join again: same seat, no duplicate.
  const again = (await env.call('/api/join', { code: made.code, name: 'Mario', device: 'M' })).body;
  same([again.player, again.token], [1, mario.token]);
  assert.equal(env.qa.rooms.get(made.code).players.length, 3);
  // Refreshing restores identity from the stored token.
  assert.equal((await env.call(`/api/room?code=${made.code}&t=${ariel.token}`)).body.me, 2);
  // Mario leaves: his seat opens, Ariel keeps her identity (now Player 2) and Sam takes the free seat.
  await env.call('/api/leave', { code: made.code, token: mario.token });
  let v = (await env.call(`/api/room?code=${made.code}&t=${ariel.token}`)).body;
  same([v.me, v.players.map(p => p.name), v.notice], [1, ['Louie', 'Ariel'], 'Mario left.']);
  assert.equal((await env.call(`/api/room?code=${made.code}&t=${mario.token}`)).body.me, -1, 'the old token no longer has a seat');
  assert.equal((await env.call('/api/lobbies')).body.rooms[0].seat, 3);
  const sam = (await env.call('/api/join', { code: made.code, name: 'Sam', device: 'S' })).body;
  same([sam.player, sam.room.players.map(p => p.name)], [2, ['Louie', 'Ariel', 'Sam']]);
  assert.equal((await env.call('/api/action', { code: made.code, token: ariel.token, type: 'bid', lot: 0, seen: 0, amount: 1 })).status, 400, 'actions resolve by token after the seats moved');
  // The host leaves: the next player becomes host and can start.
  await env.call('/api/leave', { code: made.code, token: made.token });
  v = (await env.call(`/api/room?code=${made.code}&t=${ariel.token}`)).body;
  same([v.me, v.players.map(p => p.name), v.notice], [0, ['Ariel', 'Sam'], 'Louie left. Ariel is now the host.']);
  assert.equal((await env.call('/api/action', { code: made.code, token: ariel.token, type: 'start' })).status, 200);
  assert.equal((await env.call('/api/lobbies')).body.rooms.length, 0, 'a started game disappears from Quick Play');
  assert.equal((await env.call('/api/join', { code: made.code, name: 'Late', device: 'Z' })).status, 400);
  // Once playing, leaving does not remove anyone (the away rule handles absent players).
  await env.call('/api/leave', { code: made.code, token: sam.token });
  assert.equal(env.qa.rooms.get(made.code).players.length, 2);
});

test('Quick Play: phones that go quiet free their seat, private and CPU games are never listed, the last player leaving closes the room', async () => {
  const env = sandbox({ key: '' });
  const made = (await env.call('/api/create', { theme: 'burger', name: 'Louie', capacity: 2, device: 'L' })).body;
  await env.call('/api/join', { code: made.code, name: 'Mario', device: 'M' });
  assert.equal((await env.call('/api/lobbies')).body.rooms.length, 0);
  for (let i = 0; i < 26; i++) { env.advance(5000); await env.call(`/api/room?code=${made.code}&t=${made.token}`); } // only the host keeps polling
  const v = (await env.call(`/api/room?code=${made.code}&t=${made.token}`)).body;
  same(v.players.map(p => p.name), ['Louie']);
  assert.equal((await env.call('/api/lobbies')).body.rooms.length, 1, 'the freed seat is offered again');
  env.advance(130000);
  assert.equal((await env.call('/api/lobbies')).body.rooms.length, 0, 'a host who has gone quiet is not advertised');
  await env.call('/api/create', { theme: 'house', name: 'Private', capacity: 2, listed: false });
  await env.call('/api/create', { theme: 'house', name: 'Solo', cpu: true });
  assert.equal((await env.call('/api/lobbies')).body.rooms.length, 0);
  await env.call('/api/leave', { code: made.code, token: made.token });
  assert.equal(env.qa.rooms.has(made.code), false);
  assert.equal((await env.call(`/api/room?code=${made.code}`)).status, 404);
});

test('room-code joining still works and 12, 16 and 20 auctions are honoured', async () => {
  for (const n of [12, 16, 20]) {
    const env = sandbox({ key: '' });
    const made = (await env.call('/api/create', { theme: 'house', name: 'Louie', capacity: 2, auctionCount: n })).body;
    const j = await env.call('/api/join', { code: made.code.toLowerCase(), name: 'Mario' });
    assert.equal(j.status, 200);
    assert.equal(j.body.room.total, n);
    assert.equal((await env.call('/api/action', { code: made.code, player: 0, token: made.token, type: 'start' })).status, 200);
    const r = env.qa.rooms.get(made.code);
    same([r.lots.length, r.lots.filter(l => l.kind === 'base').length], [n, 2]);
  }
});

// ---------- Reverse auctions and exact allocations ----------
// Every lot goes to exactly one player, everyone ends with their share (lots ÷ players, uneven splits differ by one),
// one starting option each, the books balance, and nobody who paid to dodge a lot received it.
function checkFinal(r, budget) {
  const n = r.players.length, L = r.lots.length, lo = Math.floor(L / n), hi = Math.ceil(L / n);
  assert.equal(r.status, 'finished');
  assert.equal(r.history.length, L, 'one result per lot');
  assert.ok(r.history.every(h => h.winner !== null), 'no lot goes unallocated');
  same(r.players.flatMap(p => p.won).sort((a, b) => a - b), Array.from({ length: L }, (_, i) => i));
  for (const p of r.players) assert.ok(p.won.length >= lo && p.won.length <= hi, `${p.name} has ${p.won.length}, share is ${lo}–${hi}`);
  for (const h of r.history) if (h.paid) { assert.equal(h.paid[h.winner], 0, 'the player stuck with a dud never pays for it'); assert.ok(r.lots[h.lot].rev); }
  if (r.lots[0].kind === 'base') for (const p of r.players) assert.equal(p.won.filter(i => r.lots[i].kind === 'base').length, 1);
  checkInvariants(r, budget);
}
// Plays a game through the API with random choices. Secret bids are random from £0 to all-in; some players never
// bid, so the timer has to settle those lots.
async function playOut(env, g, budget) {
  const r = g.room();
  let moves = 0;
  while (r.status === 'playing') {
    assert.ok(++moves < 20000, 'game stalled');
    const a = r.auction;
    if (a.phase === 'sealed') {
      const open = a.elig.map((e, i) => e && !r.players[i].cpu ? i : -1).filter(i => i >= 0);
      assert.ok(a.elig.filter(Boolean).length >= 2, 'a reverse auction only runs with two or more possible receivers');
      for (const p of open) {
        if (r.auction.phase !== 'sealed' || Math.random() < 0.1) continue;
        const amount = Math.floor(Math.random() * (r.players[p].budget + 1));
        const res = await g.act(p, 'seal', { amount });
        assert.equal(res.status, 200, JSON.stringify(res.body));
      }
      if (r.auction.phase === 'sealed') { g.touch(); env.advance(31000); g.touch(); await env.call('/api/room?code=' + g.code); }
      assert.notEqual(r.auction.phase, 'sealed');
      continue;
    }
    if (a.phase !== 'bidding') { await g.settle(); continue; }
    const p = r.players[a.turn];
    const res = (Math.random() < 0.5 || a.leader === null) && p.budget > a.bid ? await g.act(a.turn, 'bid', { amount: Math.min(p.budget, a.bid + 1 + Math.floor(Math.random() * 6)) }) : await g.act(a.turn, 'pass');
    assert.equal(res.status, 200, JSON.stringify(res.body));
    checkInvariants(r, budget);
  }
  checkFinal(r, budget);
}

test('random games with reverse auctions for 2 to 6 players always finish with every lot allocated and every share filled', async () => {
  let revealed = 0, auto = 0;
  for (const theme of ['house', 'pancakes', 'garage']) for (let n = 2; n <= 6; n++) for (const count of [n * 5, Math.min(30, n * 5 + 1), Math.min(30, n * 4 + 3)]) {
    const env = sandbox({ key: '', rev: '0.2' });
    const made = (await env.call('/api/create', { theme, name: 'P0', capacity: n, auctionCount: count, budget: [5, 20, 100][n % 3] })).body;
    const seats = [made];
    for (let i = 1; i < n; i++) seats.push((await env.call('/api/join', { code: made.code, name: 'P' + i })).body);
    await flush();
    const code = made.code, room = () => env.qa.rooms.get(code);
    const touch = () => { for (const p of room().players) p.seen = env.now(); };
    const g = { code, room, touch, act: (p, type, extra = {}) => env.call('/api/action', { code, token: seats[p].token, type, lot: room().lot, seen: room().auction.bid, ...extra }), settle: async () => { touch(); env.advance(6000); touch(); await env.call('/api/room?code=' + code); } };
    assert.equal((await g.act(0, 'start')).status, 200);
    const r = room();
    assert.equal(r.lots.length, count);
    const adds = r.lots.filter(l => l.kind === 'add').length;
    assert.ok(r.lots.filter(l => l.rev).length <= Math.min(r.theme.bad.length, adds), `duds are additions (${count} lots, ${n} players)`);
    assert.ok(r.lots.every(l => !(l.kind === 'base' && l.rev)), 'starting options are never reverse auctions');
    await playOut(env, g, r.budget);
    revealed += r.history.filter(h => h.paid).length;
    auto += r.history.filter(h => r.lots[h.lot].rev && !h.paid).length;
  }
  assert.ok(revealed > 50 && auto > 0, `secret bids were revealed ${revealed} times; ${auto} duds had only one possible taker`);
});

test('each addition is a dud with a 1 in 8 chance: about one per 8 additions, some games none and some two or more', async () => {
  const counts = [];
  for (let run = 0; run < 400; run++) {
    const env = sandbox({ key: '', rev: '0.125' });
    const made = (await env.call('/api/create', { theme: 'pizza', name: 'A', capacity: 2, auctionCount: 10 })).body;
    await env.call('/api/join', { code: made.code, name: 'B' });
    await env.call('/api/action', { code: made.code, token: made.token, type: 'start' });
    const r = env.qa.rooms.get(made.code);
    counts.push(r.lots.filter(l => l.rev).length);
    assert.ok(r.lots.slice(0, 2).every(l => !l.rev), 'never a starting option');
  }
  const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
  assert.ok(mean > 0.8 && mean < 1.2, 'about 1 dud in 8 additions, got ' + mean);
  assert.ok(counts.includes(0) && counts.some(c => c >= 2), 'some games have none, some two or more');
});

test('two players finish with exactly 5, 6, 8 and 10 items from 10, 12, 16 and 20 auctions, duds included', async () => {
  for (const count of [10, 12, 16, 20]) for (let run = 0; run < 6; run++) {
    const env = sandbox({ key: '', rev: '0.2' });
    const made = (await env.call('/api/create', { theme: 'house', name: 'Louie', capacity: 2, auctionCount: count, budget: run % 2 ? 5 : 50 })).body;
    const j = (await env.call('/api/join', { code: made.code, name: 'Mario' })).body;
    await flush();
    const seats = [made, j], code = made.code, room = () => env.qa.rooms.get(code);
    const touch = () => { for (const p of room().players) p.seen = env.now(); };
    const g = { code, room, touch, act: (p, type, extra = {}) => env.call('/api/action', { code, token: seats[p].token, type, lot: room().lot, seen: room().auction.bid, ...extra }), settle: async () => { touch(); env.advance(6000); touch(); await env.call('/api/room?code=' + code); } };
    assert.equal((await g.act(0, 'start')).status, 200);
    await playOut(env, g, room().budget);
    same(room().players.map(p => p.won.length), [count / 2, count / 2]);
  }
});

// Starts a 2+ player game whose lot `at` is turned into a reverse auction, and moves on to it.
async function reverseAt(env, opts, at) {
  const g = await setup(env, opts);
  const r = g.room();
  r.lots[at] = { ...r.lots[at], rev: true };
  let guard = 0;
  while (r.lot < at && guard++ < 200) {
    if (r.auction.phase === 'bidding') { await g.act(r.auction.turn, r.auction.leader === null ? 'bid' : 'pass', { amount: 1 }); continue; }
    await g.settle();
  }
  assert.equal(r.lot, at); assert.equal(r.auction.phase, 'sealed');
  return g;
}

test('reverse auction: Louie bids £12 and Mario £18 to avoid it, so Mario pays £18 and Louie gets it free', async () => {
  const env = sandbox();
  const g = await reverseAt(env, { names: ['Louie', 'Mario'], budget: 50 }, 2);
  const r = g.room();
  const before = r.players.map(p => p.budget);
  assert.equal((await g.act(0, 'seal', { amount: 12 })).status, 200);
  // Bids stay secret: Mario sees that Louie has locked one in, never the amount.
  const marioView = (await env.call(`/api/room?code=${g.code}&t=${g.seats[1].token}`)).body;
  same([marioView.auction.phase, marioView.auction.rev, marioView.auction.sealed, marioView.auction.mine, marioView.auction.result, marioView.auction.log], ['sealed', true, [true, false], null, null, []]);
  assert.ok(!JSON.stringify(marioView).includes('"mine":12'));
  assert.equal((await env.call(`/api/room?code=${g.code}&t=${g.seats[0].token}`)).body.auction.mine, 12, 'Louie sees his own bid');
  assert.equal(marioView.lots[2].rev, true);
  assert.equal(marioView.lots.length, 3, 'later lots stay hidden');
  // A locked bid cannot be changed, and nobody can bid more than they have.
  assert.equal((await g.act(0, 'seal', { amount: 30 })).status, 400);
  for (const amount of [-1, 1.5, 51, 'x']) assert.equal((await g.act(1, 'seal', { amount })).status, 400);
  assert.equal((await g.act(1, 'bid', { amount: 5 })).status, 400, 'no open bidding on a reverse lot');
  assert.equal((await g.act(1, 'seal', { amount: 18 })).status, 200);
  assert.equal(r.auction.phase, 'sold', 'revealed as soon as every bid is in');
  same(r.auction.result, { winner: 0, price: 0, note: '', bids: [{ p: 1, a: 18 }, { p: 0, a: 12 }] });
  same(r.players.map(p => p.budget), [before[0], before[1] - 18]);
  assert.ok(r.players[0].won.includes(2) && !r.players[1].won.includes(2));
  same(r.history.at(-1), { lot: 2, winner: 0, price: 0, paid: [0, 18] });
  assert.equal(r.auction.deadline - env.now(), 5000, 'the reveal stays up longer than a normal sale');
  await flush(); await flush();
  assert.ok(env.qa.worldPrompt(r, 0, 1, r.players[0].won.length).includes(r.lots[2].name + ':'), 'the dud is drawn into Louie\'s picture');
  checkInvariants(r, 50);
});

test('reverse auction: £0 bids, ties drawn at random, three players, and the payers never receive it', async () => {
  const losers = new Set();
  for (let run = 0; run < 30; run++) {
    const env = sandbox({ key: '' });
    const g = await reverseAt(env, { theme: 'burger', names: ['A', 'B', 'C'], budget: 20 }, 3);
    const r = g.room();
    const before = r.players.map(p => p.budget);
    await g.act(0, 'seal', { amount: 5 }); await g.act(1, 'seal', { amount: 0 }); await g.act(2, 'seal', { amount: 0 });
    const res = r.auction.result;
    assert.ok(res.winner === 1 || res.winner === 2); losers.add(res.winner);
    assert.equal(res.note, 'Tied at £0: drawn at random');
    same(r.players.map(p => p.budget), [before[0] - 5, before[1], before[2]], 'only the escapers pay, £0 costs nothing');
    checkInvariants(r, 20);
  }
  assert.equal(losers.size, 2, 'either tied player can be drawn');
});

test('reverse auction: missing bids count as £0 after 30 seconds, and players who stopped polling do not hold it up', async () => {
  const env = sandbox({ key: '' });
  let g = await reverseAt(env, { theme: 'pizza', names: ['A', 'B', 'C'], budget: 20 }, 4);
  let r = g.room();
  await g.act(0, 'seal', { amount: 3 });
  g.touch(); env.advance(29000); g.touch(); await env.call('/api/room?code=' + g.code);
  assert.equal(r.auction.phase, 'sealed', 'still waiting for players who are there');
  env.advance(2000); g.touch(); await env.call('/api/room?code=' + g.code);
  assert.equal(r.auction.phase, 'sold');
  same(r.auction.result.bids.slice(1).map(b => [b.a, b.why]), [[0, 'no bid in time'], [0, 'no bid in time']]);
  assert.notEqual(r.auction.result.winner, 0);
  // B's phone goes quiet: once A and C are in, the reveal does not wait for B.
  const env2 = sandbox({ key: '' });
  g = await reverseAt(env2, { theme: 'pizza', names: ['A', 'B', 'C'], budget: 20 }, 4);
  r = g.room();
  await g.act(0, 'seal', { amount: 2 });
  env2.advance(21000); r.players[0].seen = r.players[2].seen = env2.now();
  await g.act(2, 'seal', { amount: 1 });
  assert.equal(r.auction.phase, 'sold');
  same([r.auction.result.winner, r.auction.result.bids.at(-1)], [1, { p: 1, a: 0, why: 'away' }]);
});

test('reverse auction: only players who can still take the lot bid; one possible taker gets it with no bidding', async () => {
  const env = sandbox({ key: '' });
  const g = await setup(env, { theme: 'pancakes', names: ['A', 'B'], budget: 50 });
  const r = g.room();
  r.lots = r.lots.map((l, i) => i >= 2 ? { ...l, rev: i >= 6 } : l);
  // A wins everything until full (5 of 10): the rest, duds included, can only go to B.
  while (r.lot < 6) {
    if (r.auction.phase === 'bidding') await g.act(r.auction.turn, r.auction.turn === 0 || r.auction.leader === null ? 'bid' : 'pass', { amount: r.auction.bid + 1 });
    else await g.settle();
  }
  assert.equal(r.players[0].won.length, 5);
  assert.equal(r.auction.phase, 'sold', 'no secret bidding when only B can take it');
  same([r.auction.result.winner, r.auction.result.price, r.auction.result.note], [1, 0, 'Everyone else has their full set']);
  assert.equal((await g.act(0, 'seal', { amount: 0 })).status, 400);
  while (r.status === 'playing') await g.settle();
  checkFinal(r, 50);
  assert.equal(r.history.filter(h => h.paid).length, 0, 'nobody paid for a dud they could never have received');
});

test('reverse auction: the CPU places its own secret bids', async () => {
  // Force duds here: this tests CPU bidding, rather than whether a random deck contains a dud.
  const env = sandbox({ key: '', rev: '1' });
  const g = await setup(env, { theme: 'garage', names: ['Solo'], cpu: true, budget: 40 });
  const r = g.room();
  let moves = 0, cpuBids = 0;
  while (r.status === 'playing') {
    assert.ok(++moves < 3000);
    g.touch();
    const a = r.auction;
    if (a.phase === 'sealed') {
      assert.ok(a.sealed[1] !== null, 'the CPU bids as soon as the lot opens'); cpuBids++;
      assert.ok(a.sealed[1] >= 0 && a.sealed[1] <= r.players[1].budget);
      if (a.elig[0]) await g.act(0, 'seal', { amount: Math.floor(Math.random() * (r.players[0].budget + 1)) });
    } else if (a.phase === 'bidding' && a.turn === 0) await g.act(0, (Math.random() < 0.5 || a.leader === null) && r.players[0].budget > a.bid ? 'bid' : 'pass', { amount: a.bid + 1 });
    else { env.advance(1000); await env.call('/api/room?code=' + g.code); }
  }
  assert.ok(cpuBids > 0);
  checkFinal(r, 40);
});

test('duds: typed themes get them from the AI, pictures are prepared in the lobby, and a game never reveals which lots are coming', async () => {
  const ai = (body) => {
    const n = Number(/N = (\d+)/.exec(body.messages[1].content)[1]);
    assert.match(body.messages[0].content, /bad_items/);
    return { status: 'ok', question: '', options: [], title: 'Garden', emoji: '🌻', kind: 'build', noun: 'garden', label: 'Feature', base_name: 'Bare lawn', base_blurb: '', base_visual: 'a bare lawn', scene: 'Garden photo', start_label: 'Garden', bases: Array.from({ length: 8 }, (_, i) => ({ name: 'Garden ' + i, blurb: 'x', visual: 'garden ' + i })), items: Array.from({ length: n }, (_, i) => ({ name: 'Feature ' + i, blurb: 'x', visual: 'feature ' + i + ' in the garden' })), bad_items: Array.from({ length: 8 }, (_, i) => ({ name: 'Dud ' + i, blurb: 'x', visual: 'dud ' + i + ' in the garden' })) };
  };
  const env = sandbox({ ai, rev: '1' });
  const t = (await env.call('/api/theme', { topic: 'Custom orchard estate', players: 2 })).body;
  const made = (await env.call('/api/create', { theme: t.theme.id, name: 'A', capacity: 2, auctionCount: 12 })).body;
  const j = (await env.call('/api/join', { code: made.code, name: 'B' })).body;
  const room = env.qa.rooms.get(made.code);
  await flush(); await flush();
  const prep = (await env.call('/api/room?code=' + made.code)).body.prep;
  assert.equal(prep.total, 1 + 2 + 10, 'bare lawn + 2 gardens + 10 additions');
  assert.equal(Object.keys(room.lotImg).filter(k => k.startsWith('bad')).length, 8, 'every addition may be a dud here, up to the 8 the AI wrote');
  assert.equal((await env.call('/api/action', { code: made.code, token: made.token, type: 'start' })).status, 200);
  assert.ok(room.lots.filter(l => l.rev).every(l => l.name.startsWith('Dud')));
  assert.equal(room.lots.filter(l => l.rev).length, 8, 'the duds in the game are the ones whose pictures were prepared');
  for (let i = 0; i < 12 && room.status === 'playing'; i++) {
    const v = (await env.call(`/api/room?code=${made.code}&t=${j.token}`)).body;
    assert.equal(v.lots.length, room.lot + 1, 'only lots that have come up are sent');
    for (const l of room.lots.slice(room.lot + 1)) assert.ok(!JSON.stringify(v).includes('"' + l.name + '"'), 'upcoming lot leaked: ' + l.name);
    for (const p of room.players) p.seen = env.now();
    if (room.auction.phase === 'bidding') await env.call('/api/action', { code: made.code, token: [made, j][room.auction.turn].token, type: room.auction.leader === null ? 'bid' : 'pass', lot: room.lot, seen: room.auction.bid, amount: 1 });
    else if (room.auction.phase === 'sealed') for (const s of [made, j]) await env.call('/api/action', { code: made.code, token: s.token, type: 'seal', lot: room.lot, amount: 0 });
    env.advance(6000); for (const p of room.players) p.seen = env.now(); await env.call('/api/room?code=' + made.code);
  }
});

test('pictures are edited two wins at a time by default, and every win is in the final picture', async () => {
  for (const [auctionCount, names] of [[10, ['A', 'B']], [15, ['A', 'B']], [14, ['A', 'B', 'C']]]) {
  const env = sandbox({ key: '', cf: {}, batch: '2' });
  const g = await setup(env, { theme: 'burger', names, auctionCount });
  const r = g.room();
  await flush();
  const edits = () => env.calls.filter(c => c.url.includes('/ai/run/') && c.opts.body.get('input_image_0')).length;
  while (r.status === 'playing') {
    if (r.auction.phase === 'bidding') await g.act(r.auction.turn, r.auction.leader === null ? 'bid' : 'pass', { amount: 1 });
    else await g.settle();
    await flush();
  }
  await flush(); await flush();
  for (const [p, pl] of r.players.entries()) assert.equal(r.worlds[p].v, pl.won.length, `${pl.name}'s final picture includes every win`);
  if (auctionCount === 10) assert.ok(edits() <= 6, `burger, 5 each: 2 edits per player, not 4 (made ${edits()})`);
  }
});

const pictureTotal = id => {
  const t = THEMES.themes.find(t => t.id === id);
  return 1 + t.bases.length + t.items.length + t.bad.length;
};
const pics = bucket => [...bucket.keys()].filter(k => k.startsWith('art/')).length;
test('picture library: the first game stores starting and item pictures, later games reuse them without paying again', async () => {
  const bucket = new Map();
  const made = (env) => env.calls.filter(c => c.url.includes('/ai/run/')).length;
  const first = sandbox({ key: '', cf: {}, bucket });
  const g1 = await setup(first, { theme: 'burger', names: ['A', 'B'] });
  assert.equal(made(first), 11, 'empty bun + 2 burgers + 8 toppings');
  assert.equal(pics(bucket), 11);
  assert.ok([...bucket.keys()].filter(k => k.startsWith('art/')).every(k => /^art\/[0-9a-f]{32}-[01]\.jpg$/.test(k)));
  // Phones are sent straight to the library for stored pictures; creations still come from the game server.
  const img = await first.call(`/api/img?code=${g1.code}&k=add0`);
  assert.equal(img.status, 302);
  const lot0 = await first.call(`/api/img?code=${g1.code}&k=lot0`);
  assert.equal(lot0.status, 302, 'the starting burger photo (a creation\'s first picture) is served from the library too');
  // Every new picture went into the library, and nothing else did.
  assert.equal(first.calls.filter(c => c.url.includes('/ai/run/') && !c.opts.body.get('input_image_0')).length, pics(bucket));
  // Fill the rest of the burger library, then restarted servers (fresh memory) play without making any new library picture.
  const admin = sandbox({ key: '', cf: {}, bucket, admin: 'k' });
  await admin.call('/api/prefill', { key: 'k', themes: ['burger'], max: 1000 });
  for (let i = 0; i < 60 && admin.qa.fill.running; i++) await flush();
  assert.equal(pics(bucket), pictureTotal('burger'));
  for (let run = 0; run < 3; run++) {
    const again = sandbox({ key: '', cf: {}, bucket });
    const g = await setup(again, { theme: 'burger', names: ['C', 'D'] });
    const r = g.room();
    assert.equal(made(again), 0, 'no new pictures for a replayed preset');
    assert.equal(r.lots.filter(l => r.art[l.key]).length, r.lots.length, 'every lot picture comes from the library');
    // Winning a burger starts that player's creation from the library photo; the edit is the only picture made.
    await g.act(0, 'bid', { amount: 1 }); await g.act(1, 'pass'); await g.settle(); await g.settle();
    assert.ok(r.worlds.every(w => w.v >= 1));
    while (r.lot < 2) await g.settle();
    while (r.auction.phase === 'bidding') await g.act(r.auction.turn, r.auction.leader === null ? 'bid' : 'pass', { amount: 1 });
    await flush(); await flush();
    assert.equal(made(again), 1, 'one creation edit, nothing else');
    assert.ok(again.calls.find(c => c.url.includes('/ai/run/')).opts.body.get('input_image_0'), 'and it edits the stored photo');
  }
});

test('picture library: a game never pays for a second version, and a broken bucket falls back to memory', async () => {
  const bucket = new Map();
  const a = sandbox({ key: '', cf: {}, bucket });
  await setup(a, { theme: 'pizza', names: ['A', 'B'] });
  const first = new Map(bucket);
  // Same deck order is not guaranteed, so compare only pictures both games used: no item is ever made twice.
  for (let run = 0; run < 4; run++) {
    const b = sandbox({ key: '', cf: {}, bucket });
    await setup(b, { theme: 'pizza', names: ['A', 'B'] });
  }
  const names = [...bucket.keys()].filter(k => k.startsWith('art/')).map(k => k.slice(0, -6));
  assert.equal(new Set(names).size, names.length, 'one version per picture unless the prefill makes more');
  void first;
  const down = sandbox({ key: '', cf: {}, bucket: new Map(), broken: true });
  const g = await setup(down, { theme: 'pizza', names: ['A', 'B'] });
  assert.equal((await g.state()).prep.failed, 0, 'pictures still work from memory');
  assert.equal((await down.call(`/api/img?code=${g.code}&k=add0`)).status, 200);
});

test('picture library prefill: admin only, fills each preset once, stops at the first failure and can be rerun', async () => {
  const bucket = new Map();
  const env = sandbox({ key: '', cf: {}, bucket, admin: 'sekret' });
  assert.equal((await env.call('/api/prefill', { key: 'wrong' })).status, 404);
  assert.equal((await env.call('/api/prefill', { key: 'sekret', themes: ['burger'], max: 5 })).status, 200);
  for (let i = 0; i < 20 && env.qa.fill.running; i++) await flush();
  same([env.qa.fill.made, pics(bucket)], [5, 5]);
  await env.call('/api/prefill', { key: 'sekret', themes: ['burger'], max: 1000 });
  for (let i = 0; i < 40 && env.qa.fill.running; i++) await flush();
  same([env.qa.fill.made, env.qa.fill.had, pics(bucket)], [pictureTotal('burger') - 5, 5, pictureTotal('burger')], 'empty scene + every base, addition and dud in the themes file');
  // A second version of everything, and nothing is made twice.
  await env.call('/api/prefill', { key: 'sekret', themes: ['burger'], variants: 2 });
  for (let i = 0; i < 80 && env.qa.fill.running; i++) await flush();
  same([env.qa.fill.had, pics(bucket)], [pictureTotal('burger'), pictureTotal('burger') + 40], 'max 40 per run by default');
  // Cloudflare's allowance runs out: the run stops and reports why.
  const broke = sandbox({ key: '', cf: { fail: true, quota: true }, fallback: false, bucket: new Map(), admin: 'sekret' });
  await broke.call('/api/prefill', { key: 'sekret', themes: ['pizza'] });
  for (let i = 0; i < 20 && broke.qa.fill.running; i++) await flush();
  same([broke.qa.fill.made, broke.qa.fill.failed], [0, 1]);
  assert.match(broke.qa.fill.error, /daily free allocation/);
  assert.equal((await broke.call('/api/prefill?key=sekret')).body.failed, 1);
});

test('flagged Cloudflare output gets exactly one reworded retry and no paid fallback', async () => {
  const prompt = 'A camper van parked beside a country cottage. Photorealistic, natural light, crisp detail, consistent colour grading. No text, captions, labels, logos, watermarks or people.';
  const ok = sandbox({ key: '', cf: { flagged: true, once: true }, bucket: new Map(), cap: 2, fallback: false });
  await ok.qa.makeImage(prompt, [], 'low');
  assert.equal(ok.calls.filter(c => c.url.includes('/ai/run/')).length, 2);
  const wording = ok.calls[1].opts.body.get('prompt');
  assert.notEqual(wording, prompt);
  assert.ok(wording.includes('camper van parked beside a country cottage'), 'keeps the actual subject and placement');
  assert.equal(ok.calls.filter(c => c.url.includes('/images/')).length, 0);
  await assert.rejects(ok.qa.makeImage(prompt, [], 'low'), /Cloudflare cost limit/);
  const refused = sandbox({ key: '', cf: { flagged: true }, bucket: new Map(), cap: 2, fallback: false });
  await assert.rejects(refused.qa.makeImage(prompt, [], 'low'), /3030/);
  assert.equal(refused.calls.filter(c => c.url.includes('/ai/run/')).length, 2, 'a repeated refusal stops');
  assert.equal(refused.calls.filter(c => c.url.includes('/images/')).length, 0);
  refused.calls.length = 0;
  await assert.rejects(refused.qa.makeImage(prompt, [], 'low'), /Cloudflare cost limit/, 'failed requests still consume spending allowance');
});

test('daily picture cap: stops at the limit, survives a restart, resets the next day, and explains itself', async () => {
  const bucket = new Map();
  const env = sandbox({ key: '', cf: {}, bucket, cap: 5 });
  const made = (await env.call('/api/create', { theme: 'burger', name: 'A', capacity: 2 })).body;
  await flush(); await flush();
  const v = (await env.call('/api/room?code=' + made.code)).body;
  assert.equal(env.calls.filter(c => c.url.includes('/ai/run/')).length, 5, 'only 5 pictures made');
  same([v.prep.ready, v.prep.failed], [5, 6]);
  assert.match(v.prep.error, /picture allowance is used up/);
  const day = new Date(env.now()).toISOString().slice(0, 10);
  const saved = JSON.parse(new TextDecoder().decode(bucket.get('meta/usage-' + day + '.json')));
  assert.equal(saved.n, 5); assert.ok(saved.cfMicros > 0);
  // A restarted server reads today's count from the library and makes nothing more.
  const again = sandbox({ key: '', cf: {}, bucket, cap: 5 });
  await again.call('/api/create', { theme: 'pizza', name: 'A', capacity: 2 }); await flush(); await flush();
  assert.equal(again.calls.filter(c => c.url.includes('/ai/run/')).length, 0);
  // The next day it starts again.
  again.advance(24 * 3600e3);
  await again.call('/api/create', { theme: 'pizza', name: 'B', capacity: 2 }); await flush(); await flush();
  assert.equal(again.calls.filter(c => c.url.includes('/ai/run/')).length, 5);
  assert.equal((await again.call('/health')).body.pictures.made, 5);
});

test("Cloudflare's free allowance running out is explained once instead of retried", async () => {
  const env = sandbox({ key: '', cf: { fail: true, quota: true }, fallback: false });
  const made = (await env.call('/api/create', { theme: 'pizza', name: 'A', capacity: 2 })).body;
  await flush(); await flush();
  const v = (await env.call('/api/room?code=' + made.code)).body;
  assert.match(v.prep.error, /picture allowance is used up/);
  assert.equal(env.calls.filter(c => c.url.includes('/ai/run/')).length, 11, 'one try per picture, no retries');
  assert.equal((await env.call('/health')).body.pictures.made, 0, 'failed pictures do not count against the daily cap');
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
