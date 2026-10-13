// Draws the Draft Night v2 art library: one picture per base, item and card, shared by every game.
//
//   node scripts/draftnight-art.js --dry                       list every asset, its prompt and the estimated cost
//   node scripts/draftnight-art.js --themes zoo,house --limit 20 draw missing assets (needs CF_ACCOUNT_ID, CF_API_TOKEN)
//   options: --model 9b (default 4b), --variants 2, --force (redraw existing)
//
// Pictures go to public/draft-night/art/<archetype>/<slot>/<name>.jpg, the path the game looks for (lib/draftnight/layout.js
// artKey). Prompts describe only what should be in the picture: FLUX.2 has no negative prompting, so "no X" adds X.
// Upgrades and pancake toppings are drawn as stand-alone tiles for now; layering them onto the base is the open question
// for the visual trial (docs/draft-night-investigation.md, Phase 2).
const fs = require('fs');
const path = require('path');
const { loadThemes } = require('../lib/draftnight/spec');
const { artKey } = require('../lib/draftnight/layout');

const args = process.argv.slice(2), opt = k => { const i = args.indexOf('--' + k); return i < 0 ? null : args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true; };
const OUT = path.join(__dirname, '../public/draft-night/art');
const MODEL = opt('model') === '9b' ? '@cf/black-forest-labs/flux-2-klein-9b' : '@cf/black-forest-labs/flux-2-klein-4b';
// Published Workers AI prices: 4B $0.000287 per 512px output tile; 9B $0.015 for the first megapixel.
const PRICE = MODEL.endsWith('9b') ? 0.015 : 4 * 0.000287;

// One look for everything, so pieces from different prompts sit together on one board.
const STYLE = 'Polished 3D isometric game illustration, soft rounded shapes, warm afternoon sunlight from the upper left, gentle shadows, rich saturated colours, crisp clean detail';
const BACKDROP = 'set on a plain pale warm-grey background';

function prompt(t, x) {
  const what = `${x.name} (${x.blurb.toLowerCase()})`;
  if (t.archetype === 'site') {
    if (x.kind === 'base') return `${STYLE}. Seen from above at a 45-degree angle: the main entrance plaza of a ${t.noun}, ${x.blurb.toLowerCase()}, on a square plot with paved paths leading off each edge, ${BACKDROP}.`;
    if (x.kind === 'upgrade') return `${STYLE}. Seen from above at a 45-degree angle: ${what} for a ${t.noun}, shown as a compact feature on a small square plot, ${BACKDROP}.`;
    return `${STYLE}. Seen from above at a 45-degree angle: a large square plot completely filled by ${what}, part of a ${t.noun}, with a path running along the plot edge, ${BACKDROP}.`;
  }
  if (t.archetype === 'plot') {
    if (x.kind === 'base') return `${STYLE}. Seen from above at a 45-degree angle: a ${what}, a modest family home standing on a small square of green lawn, ${BACKDROP}.`;
    if (x.kind === 'upgrade') return `${STYLE}. Seen from above at a 45-degree angle: ${what}, a home improvement shown on its own, ${BACKDROP}.`;
    return `${STYLE}. Seen from above at a 45-degree angle: ${what} in a garden, on a square patch of green lawn, ${BACKDROP}.`;
  }
  if (t.archetype === 'room') {
    if (x.kind === 'base') return `${STYLE}. Isometric cut-away of a plain empty ${t.noun}: two neutral walls with a window, a light wooden floor and one simple double bed with white bedding.`;
    return `${STYLE}. Isometric 45-degree view of ${what} for a ${t.noun}, a single piece shown on its own, ${BACKDROP}.`;
  }
  if (t.archetype === 'stack') {
    if (x.kind === 'base') return `${STYLE}. A ${what} on a round white plate, seen from a 45-degree angle, ${BACKDROP}.`;
    return `${STYLE}. ${what} as a breakfast topping, shown on its own in a small white dish, seen from a 45-degree angle, ${BACKDROP}.`;
  }
  return `${STYLE}. A ${x.name} car in a three-quarter front view, ${x.blurb.toLowerCase()}, on a clean studio floor ${BACKDROP}.`;
}

function jobs() {
  const wanted = typeof opt('themes') === 'string' ? opt('themes').split(',') : null, out = new Map();
  for (const t of loadThemes()) {
    if (wanted && !wanted.includes(t.id)) continue;
    for (const x of Object.values(t.index)) {
      const key = artKey(t, x);
      if (!out.has(key)) out.set(key, { key, theme: t.id, prompt: prompt(t, x) });
    }
  }
  return [...out.values()];
}

async function draw(p) {
  const body = new FormData();
  body.append('prompt', p); body.append('width', '1024'); body.append('height', '1024');
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${process.env.CF_ACCOUNT_ID}/ai/run/${MODEL}`, { method: 'POST', headers: { Authorization: 'Bearer ' + process.env.CF_API_TOKEN }, body, signal: AbortSignal.timeout(120000) });
  if (!res.ok) throw Error('Cloudflare ' + res.status + ' ' + (await res.text()).slice(0, 300));
  const d = await res.json();
  if (!d.result || !d.result.image) throw Error('Empty image');
  return Buffer.from(d.result.image, 'base64');
}

(async () => {
  const all = jobs(), variants = Number(opt('variants')) || 1;
  const missing = all.filter(j => opt('force') || !fs.existsSync(path.join(OUT, j.key + '.jpg')));
  const limit = Number(opt('limit')) || missing.length;
  console.log(`${all.length} assets, ${missing.length} missing; drawing ${Math.min(limit, missing.length) * variants} with ${MODEL} ≈ $${(Math.min(limit, missing.length) * variants * PRICE).toFixed(2)}`);
  if (opt('dry')) { for (const j of all) console.log(j.key + '\n  ' + j.prompt); return; }
  if (!process.env.CF_ACCOUNT_ID || !process.env.CF_API_TOKEN) throw Error('Set CF_ACCOUNT_ID and CF_API_TOKEN, or use --dry');
  let made = 0;
  for (const j of missing.slice(0, limit)) for (let v = 0; v < variants; v++) {
    const file = path.join(OUT, j.key + (v ? '.v' + v : '') + '.jpg');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, await draw(j.prompt));
    made++; console.log('drew', path.relative(OUT, file));
  }
  console.log(`done: ${made} pictures`);
})().catch(e => { console.error(String(e)); process.exit(1); });
