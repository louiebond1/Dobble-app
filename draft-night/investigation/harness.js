// Reproduction harness: runs whole Draft Night games against a given server.ts with mocked providers.
// Mock text usage is realistic: prompt tokens ~ bytes/4 (+1100 for a high-detail image), completion tokens per call type.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { stripTypeScriptTypes } = require('node:module');
const REPO = path.join(__dirname, '../..');
const { execSync } = require('node:child_process');
// live: the commit running on Railway when this was written (2951e95); head: the working tree.
const source = ver => ver === 'head' ? fs.readFileSync(REPO + '/draft-night/server.ts', 'utf8') : execSync('git show ' + ver + ':draft-night/server.ts', { cwd: REPO, encoding: 'utf8', maxBuffer: 1 << 26 });
const THEMES = JSON.parse(fs.readFileSync(REPO + '/public/draft-night-themes.json', 'utf8'));
function sandbox(source, { checkFailFirst = 0, plannerOut } = {}) {
  let handler, t = 1_000_000; const calls = [];
  const fakeFetch = async (url, opts) => {
    if (url.endsWith('/draft-night-themes.json')) return Response.json(THEMES);
    if (url.includes('/ai/run/')) { const fd = opts.body; calls.push({ kind: url.endsWith('9b') ? 'cf9b' : 'cf4b', prompt: fd.get('prompt'), side: fd.get('width'), refs: [...fd.keys()].filter(k => k.startsWith('input_image')).length }); return Response.json({ result: { image: Buffer.from('cf' + calls.length).toString('base64') } }); }
    if (url.endsWith('/chat/completions')) {
      const body = JSON.parse(opts.body); const isCheck = body.response_format?.json_schema?.name === 'creation_check';
      const bytes = JSON.stringify(body.messages).length; const prompt_tokens = Math.ceil(bytes / 4) + (isCheck ? 1100 : 0);
      let out, completion_tokens;
      if (isCheck) { const n = calls.filter(c => c.kind === 'check').length; out = { complete: Math.random() >= checkFailFirst, missing: [], extras: [], reason: 'x' }; completion_tokens = 120; calls.push({ kind: 'check' }); }
      else if (body.response_format.json_schema.schema.properties.layout) { out = { layout: 'Layout' }; completion_tokens = 150; calls.push({ kind: 'compose' }); }
      else if (body.response_format.json_schema.schema.properties.verdict) { out = { verdict: 'v' }; completion_tokens = 60; calls.push({ kind: 'judge' }); }
      else { out = plannerOut(); completion_tokens = Math.ceil(JSON.stringify(out).length / 4); calls.push({ kind: 'planner', completion_tokens, max: body.max_tokens }); }
      return Response.json({ usage: { prompt_tokens, completion_tokens }, choices: [{ message: { content: JSON.stringify(out) } }] });
    }
    throw Error('unexpected ' + url);
  };
  const vars = { DRAFT_REVERSE_SHARE: '0.125', OPENAI_API_KEY: 'k', CF_ACCOUNT_ID: 'a', CF_API_TOKEN: 't', DRAFT_DAILY_PICTURES: '100000' };
  const ctx = { TextEncoder, Bun: { env: vars, S3Client: class {}, serve(o) { handler = o.fetch; } }, Response, Request, URL, FormData, Blob, Buffer, crypto, AbortSignal, fetch: fakeFetch, console: { error() {} }, setTimeout: (f, ms) => { const h = setTimeout(f, Math.min(ms, 3)); h.unref(); return h; }, clearTimeout, Math };
  vm.runInNewContext(stripTypeScriptTypes(source) + '\nglobalThis.qa={rooms,setClock(f){clock=f},worldPrompt,lotPrompt,basePrompt:typeof basePrompt!=="undefined"?basePrompt:null,ready:loadPresets(),PRESETS,themes};', ctx);
  ctx.qa.setClock(() => t);
  const call = async (p, data) => { await ctx.qa.ready; const res = await handler(new Request('http://x' + p, { method: data ? 'POST' : 'GET', body: data ? JSON.stringify(data) : undefined })); return { status: res.status, body: await res.json().catch(() => ({})) }; };
  return { call, qa: ctx.qa, calls, advance(ms) { t += ms; }, now: () => t };
}
const flush = (ms = 8) => new Promise(r => setTimeout(r, ms));
// Players value each lot at random around their fair share and bid +1 while it is below that value.
async function play(env, { theme, n, budget = 100, auctionCount, badItems = false, style = 'value' }) {
  const made = await env.call('/api/create', { theme, name: 'P0', capacity: n, budget, auctionCount, badItems });
  if (made.status !== 200) throw Error(JSON.stringify(made.body));
  const code = made.body.code, seats = [made.body];
  for (let i = 1; i < n; i++) seats.push((await env.call('/api/join', { code, name: 'P' + i })).body);
  const room = () => env.qa.rooms.get(code);
  for (let i = 0; i < 400; i++) { const p = room() && (await env.call('/api/room?code=' + code)).body.prep; if (!p.enabled || p.ready + p.failed >= p.total) break; await flush(); }
  let s = await env.call('/api/action', { code, token: seats[0].token, type: 'start', force: true });
  if (s.status !== 200) throw Error('start ' + JSON.stringify(s.body).slice(0, 200));
  const values = {};
  for (let guard = 0; guard < 5000 && room().status === 'playing'; guard++) {
    const r = room(), a = r.auction; for (const p of r.players) p.seen = env.now();
    if (a.phase === 'bidding' && a.turn !== null) {
      const p = a.turn, pl = r.players[p], key = r.lot + ':' + p, slots = Math.max(1, Math.ceil(r.lots.length / n) - pl.won.length);
      const v = values[key] ??= Math.floor((pl.budget / slots) * (style === 'value' ? Math.random() * 2 : 1));
      const want = a.leader === null || (a.bid + 1 <= v && a.bid + 1 <= pl.budget);
      const type = want && pl.budget >= a.bid + 1 ? 'bid' : 'pass';
      await env.call('/api/action', { code, token: seats[p].token, type, amount: a.bid + 1, lot: r.lot, seen: a.bid });
    } else if (a.phase === 'sealed') { for (const p of r.players.keys()) if (a.elig[p] && a.sealed[p] === null) await env.call('/api/action', { code, token: seats[p].token, type: 'seal', amount: Math.floor(Math.random() * r.players[p].budget / 3), lot: r.lot }); env.advance(31000); await env.call('/api/room?code=' + code); }
    else { if (a.phase === 'sold' && !room()._seen?.has(r.lot)) { (room()._seen ??= new Set()).add(r.lot); (room()._results ??= []).push({ lot: r.lot, kind: r.lots[r.lot].kind, rev: !!r.lots[r.lot].rev, note: a.result.note, price: a.result.price, bids: a.log.filter(e => e.a !== null).length, bidders: new Set(a.log.filter(e => e.a !== null).map(e => e.p)).size, left: r.lots.length - r.lot }); } env.advance(6000); await env.call('/api/room?code=' + code); }
    await flush(1);
  }
  for (let i = 0; i < 300; i++) { await flush(10); const r = room(); if (r.worlds.every(w => !w.busy && (w.state === 'ready' || w.state === 'error')) && r.worlds.every((w, p) => w.v >= r.players[p].won.length || w.state === 'error')) break; }
  return room();
}
module.exports = { sandbox, play, flush, THEMES, source };
