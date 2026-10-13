// Reproduces the measurements in docs/draft-night-investigation.md with mocked providers (no paid calls).
// node draft-night/investigation/repro.js [pictures|custom|allocation|prompts|all] [games]
const { sandbox, play, source } = require('./harness.js');
const LIVE = '2951e95', what = process.argv[2] || 'all', G = Number(process.argv[3]) || 6;
const vers = { live: source(LIVE), head: source('head') };
const words = k => Array.from({ length: k }, (_, i) => ['golden', 'syrup', 'drizzled', 'across', 'the', 'top', 'of', 'stack', 'with', 'fresh'][i % 10]).join(' ');
const it = i => ({ name: 'Topping number ' + i, blurb: words(6), visual: words(22), weight: 5, replaces: null });
const planner = N => () => ({ status: 'ok', question: '', options: [], title: 'Dream Waffles', emoji: '🧇', kind: 'build', scope: 'object', noun: 'waffle plate', label: 'Topping', start_mode: 'auction', essentials: [], base_name: 'Empty plate', base_blurb: words(5), base_visual: words(15), scene: words(25), start_label: 'Base', bases: Array.from({ length: 8 }, (_, i) => ({ name: 'Base ' + i, blurb: words(6), visual: words(22) })), items: Array.from({ length: N }, (_, i) => it(i)), bad_items: Array.from({ length: 8 }, (_, i) => ({ ...it(100 + i), name: 'Dud ' + i })) });
const finalOk = r => r.worlds.filter((w, p) => w.v >= r.players[p].won.length && w.state === 'ready').length;
const flagged = r => r.worlds.filter(w => w.note).length;
(async () => {
  if (what === 'pictures' || what === 'all') for (const ver of ['live', 'head']) for (const checkFail of [0, 0.5]) for (const theme of ['house', 'pancakes', 'zoo']) for (const n of [2, 3, 4]) {
    let ok = 0, all = 0, cost = 0, fl = 0;
    for (let g = 0; g < G; g++) { const r = await play(sandbox(vers[ver], { checkFailFirst: checkFail }), { theme, n }); ok += finalOk(r); fl += flagged(r); all += n; cost += r.cost.used; }
    console.log(`pictures ${ver} vision-reject=${checkFail} ${theme} ${n}p: final pictures shown ${ok}/${all} (${fl} labelled as possibly incomplete), mean game AI spend $${(cost / G / 1e6).toFixed(4)} of $0.058`);
  }
  if (what === 'custom' || what === 'all') for (const ver of ['live', 'head']) for (const n of [2, 4, 6]) {
    const N = Math.min(6, Math.max(4, n)) * 5 + 4; let ok = 0, all = 0, setup = 0, comp = 0;
    for (let g = 0; g < Math.ceil(G / 2); g++) {
      const env = sandbox(vers[ver], { plannerOut: planner(N) });
      const th = await env.call('/api/theme', { topic: 'waffles with friends', players: n, confirmed: true });
      const t = env.qa.themes.get(th.body.theme.id); setup += t.setupCost; comp = env.calls.find(c => c.kind === 'planner').completion_tokens;
      const r = await play(env, { theme: t.id, n }); ok += finalOk(r); all += n;
    }
    console.log(`custom ${ver} ${n}p: planning spend $${(setup / Math.ceil(G / 2) / 1e6).toFixed(4)} of $0.058, planner output ~${comp} tokens (max_tokens 3000), complete final pictures ${ok}/${all}`);
  }
  if (what === 'allocation' || what === 'all') for (const ver of ['live', 'head']) for (const theme of ['house', 'bedroom']) for (const n of [2, 3, 4]) {
    const c = { lots: 0, free: 0, tail: 0, tailFree: 0, duds: 0 };
    for (let g = 0; g < G * 3; g++) {
      const r = await play(sandbox(vers[ver]), { theme, n, badItems: false });
      for (const x of r._results || []) { c.lots++; if (x.rev) { c.duds++; continue; } const free = /free|drawn at random|Everyone else|need every/i.test(x.note || ''); c.free += free; if (x.left <= Math.ceil(r.lots.length / 3)) { c.tail++; c.tailFree += free; } }
    }
    console.log(`allocation ${ver} ${theme} ${n}p (dud toggle off): handed out free by the quota rule ${(100 * c.free / c.lots).toFixed(0)}% of lots, ${(100 * c.tailFree / c.tail).toFixed(0)}% in the final third; duds per game ${(c.duds / (G * 3)).toFixed(2)}`);
  }
  if (what === 'prompts' || what === 'all') {
    const env = sandbox(vers.live); await env.qa.ready; let same = 0, total = 0; const names = new Set();
    for (const t of env.qa.PRESETS) for (const x of [...t.items, ...t.bad]) { total++; if (env.qa.lotPrompt({ theme: t }, x, 'add').startsWith('Clear photograph of a as ')) { same++; names.add(x.name); } }
    console.log(`prompts live: ${same}/${total} item slots (${names.size} distinct items) send the subject-less thumbnail prompt "Clear photograph of a as a single isolated subject..."`);
  }
})();
