// Browser matrix for Draft Night v2: every theme, 2–6 players, several phone and desktop sizes, and a CPU game.
// Each phone plays its own seat. On every screen it checks: no page errors, no emoji anywhere, every photo loaded, no
// sideways overflow, and each board shows exactly the items that player owns. Screenshots go to the output folder.
//
//   node draft-night/e2e/v2-matrix.mjs <baseUrl> <outDir> [onlyTheme]
// The server should run with DRAFT_NIGHT_TIMING='{"market":1200,"sold":700,"cpu":300}' for speed, and with
// DRAFT_NIGHT_ART_DIR pointing at stand-in photos (node draft-night/e2e/fixture-art.js <dir>) or the real library.
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
let pw; try { pw = require('playwright'); } catch { pw = require(process.env.PLAYWRIGHT_PATH || '/opt/node-tools/node_modules/playwright'); }
const [base = 'http://localhost:4100', out = 'shots/v2-matrix', only] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });

const SIZES = { small: [320, 568], phone: [390, 844], tall: [430, 932], tablet: [768, 1024], desktop: [1280, 800], tv: [1920, 1080] };
const THEMES = ['house', 'pancakes', 'zoo', 'water-park', 'island', 'bedroom', 'garage'];
const RUNS = [];
THEMES.forEach((theme, i) => {
  RUNS.push({ theme, players: 2, rounds: 4, size: 'phone' });
  RUNS.push({ theme, players: [3, 4, 5, 6][i % 4], rounds: [3, 5, 6, 5][i % 4], size: ['small', 'tall', 'tablet', 'phone'][i % 4] });
});
RUNS.push({ theme: 'house', players: 6, rounds: 6, size: 'desktop' });
RUNS.push({ theme: 'zoo', players: 4, rounds: 6, size: 'tv' });
RUNS.push({ theme: 'pancakes', players: 1, cpu: true, rounds: 5, size: 'phone' });
const EMOJI = /[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u;

const browser = await pw.chromium.launch();
const summary = [];
for (const run of RUNS.filter(r => !only || r.theme === only)) {
  const tag = `${run.theme}-${run.cpu ? 'cpu' : run.players + 'p'}-${run.size}`;
  const problems = [], [w, h] = SIZES[run.size];
  const pages = [];
  for (let i = 0; i < run.players; i++) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: w < 800, hasTouch: w < 800 });
    const p = await ctx.newPage();
    p.on('pageerror', e => problems.push(`player ${i}: page error ${e.message}`));
    p.on('console', m => { if (m.type() === 'error') problems.push(`player ${i}: console ${m.text()}`); });
    pages.push(p);
  }
  const host = pages[0];
  await host.goto(base + '/draft-night-v2.html');
  await host.waitForSelector(`[data-theme="${run.theme}"]`);
  await host.click(`[data-theme="${run.theme}"]`);
  await host.fill('#name', 'Louie');
  if (run.cpu) await host.check('#cpu'); else await host.click(`[data-players="${run.players}"]`);
  const roundsBtn = await host.$(`[data-rounds="${run.rounds}"]`);
  if (roundsBtn) await roundsBtn.click();
  await host.click('[data-create]');
  await host.waitForSelector('.big-code');
  const code = (await host.textContent('.big-code')).trim();
  for (let i = 1; i < pages.length; i++) {
    await pages[i].goto(base + '/draft-night-v2.html?room=' + code);
    await pages[i].fill('#name', ['Ariel', 'Mario', 'Priya', 'Sam', 'Jo'][i - 1]);
    await pages[i].click('#joinform button');
    await pages[i].waitForSelector('.seats');
  }
  await host.waitForSelector('[data-start]:not([disabled])');
  await host.screenshot({ path: `${out}/${tag}-lobby.png`, fullPage: true });
  await host.click('[data-start]');

  // Checks run on every page whenever its screen changes.
  const check = async (p, i, label) => {
    const r = await p.evaluate(async () => {
      const imgs = [...document.querySelectorAll('.board img, .lot-card img, .hero img, .cover img, .mini img, .up img')];
      await Promise.all(imgs.map(im => im.complete ? 0 : new Promise(ok => { im.onload = im.onerror = ok; setTimeout(ok, 3000); })));
      return {
        text: document.body.innerText,
        broken: imgs.filter(im => !im.naturalWidth).map(im => im.getAttribute('src')),
        placeholders: document.querySelectorAll('.board .ph, .lot-card .ph, .hero .ph, .ups .ph').length,
        overflow: document.documentElement.scrollWidth - window.innerWidth,
        // On the final reveal each purchase is a tile on the board or an upgrade badge beneath it.
        // A replaced upgrade (a second batter) is listed as replaced rather than drawn, so it is counted from the list.
        boards: [...document.querySelectorAll('.entry')].map(e => e.querySelectorAll('.board .piece.item, .board .piece.card:not(.open), .ups .up, .owned li.replaced').length),
      };
    });
    if (/(style|class|data-\w+)="|<\/?\w+[ >]/.test(r.text)) problems.push(`${label} player ${i}: raw markup on screen: ${r.text.match(/.{0,30}(style|class|data-\w+)=".{0,20}|.{0,20}<\/?\w+[ >].{0,20}/)[0]}`);
    if (EMOJI.test(r.text)) problems.push(`${label} player ${i}: emoji on screen: ${r.text.match(EMOJI)[0]}`);
    if (r.broken.length) problems.push(`${label} player ${i}: ${r.broken.length} photos failed: ${r.broken.slice(0, 3).join(', ')}`);
    if (r.placeholders) problems.push(`${label} player ${i}: ${r.placeholders} tiles without a photo`);
    if (r.overflow > 1) problems.push(`${label} player ${i}: page is ${r.overflow}px wider than the screen`);
    return r;
  };
  const seen = new Set(), shots = new Set();
  const deadline = Date.now() + 8 * 60000;
  let done = false;
  while (!done && Date.now() < deadline) {
    for (let i = 0; i < pages.length; i++) {
      const p = pages[i];
      const state = await p.evaluate(() => ({ voting: !!document.querySelector('[data-vote]'), final: !!document.querySelector('.entry.winner'), label: (document.querySelector('.market .eyebrow') || {}).textContent || '', stage: (document.querySelector('.stage') || {}).className || '' })).catch(() => ({}));
      if (state.final) { done = true; break; }
      const key = i + state.label + state.stage + state.voting;
      if (!seen.has(key)) {
        seen.add(key);
        await check(p, i, state.label || (state.voting ? 'voting' : 'screen'));
        // Screenshots of the key moments only: the first market, bid, sale, free choice and the vote, from two seats.
        const moment = state.voting ? 'vote' : (state.stage.match(/market|pick/) || [state.stage.includes('stage') ? 'bid' : ''])[0];
        if ((i === 0 || i === pages.length - 1) && moment && !shots.has(i + moment)) { shots.add(i + moment); await p.screenshot({ path: `${out}/${tag}-p${i}-${moment}.png`, fullPage: true }); }
      }
      try {
        const pick = await p.$('[data-pick]'), bid = await p.$('[data-bid]'), pass = await p.$('[data-pass]'), vote = await p.$('[data-vote]:not(.primary)');
        if (vote && !(await p.$('[data-vote].primary'))) await vote.click();
        else if (pick) await pick.click();
        else if (bid && pass) { if (Math.random() < 0.6) await bid.click(); else await pass.click(); }
      } catch { /* the screen moved on between looking and tapping */ }
    }
    await host.waitForTimeout(150);
  }
  if (!done) problems.push('game did not reach the final reveal in time');
  // Final reveal on every phone: boards match item lists, photos loaded, no emoji.
  for (let i = 0; i < pages.length; i++) {
    const p = pages[i];
    const r = await check(p, i, 'final');
    const lists = await p.$$eval('.entry .owned', ls => ls.map(l => l.querySelectorAll('li').length));
    const expected = run.rounds + (['house', 'pancakes'].includes(run.theme) ? 1 : 0);
    if (!lists.every(n => n === expected)) problems.push(`final player ${i}: item lists ${lists} expected ${expected} each`);
    if (!r.boards.every(n => n === run.rounds)) problems.push(`final player ${i}: boards show ${r.boards} items, expected ${run.rounds} each`);
    if (i === 0) await p.screenshot({ path: `${out}/${tag}-final.png`, fullPage: true });
  }
  summary.push({ run: tag, ok: !problems.length, problems: problems.slice(0, 12) });
  console.log((problems.length ? 'FAIL ' : 'ok   ') + tag + (problems.length ? '\n  ' + problems.slice(0, 6).join('\n  ') : ''));
  for (const p of pages) await p.context().close();
}
await browser.close();
fs.writeFileSync(out + '/summary.json', JSON.stringify(summary, null, 1));
const failed = summary.filter(s => !s.ok).length;
console.log(`${summary.length - failed}/${summary.length} runs clean`);
process.exit(failed ? 1 : 0);
