// Browser end-to-end run of Draft Night: real client, real API (Bun), mock OpenAI.
// Usage: PW_PATH=/opt/node22/lib/node_modules/playwright node run.mjs <screenshot dir> [scenario...]
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const { chromium } = createRequire(import.meta.url)(process.env.PW_PATH || 'playwright');
const here = path.dirname(new URL(import.meta.url).pathname);
const repo = path.resolve(here, '../..');
const shots = path.resolve(process.argv[2] || 'shots');
const only = process.argv.slice(3);
fs.mkdirSync(shots, { recursive: true });

const procs = [];
function run(cmd, args, env, ready) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { env: { ...process.env, ...env }, cwd: repo });
    procs.push(p);
    const onData = d => { const s = String(d); if (process.env.VERBOSE) process.stdout.write('[' + path.basename(args[0] || cmd) + '] ' + s); if (s.includes(ready)) resolve(p); };
    p.stdout.on('data', onData); p.stderr.on('data', onData);
    p.on('exit', c => reject(new Error(cmd + ' exited ' + c)));
    if (!ready) setTimeout(() => resolve(p), 800);
  });
}
process.on('exit', () => procs.forEach(p => p.kill()));
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => process.exit(1));

await run('node', [path.join(here, 'mock-openai.mjs'), '4010'], { MOCK_DELAY: '900' }, 'mock openai');
await run('bun', ['draft-night/server.ts'], { PORT: '3999', OPENAI_API_KEY: 'mock', OPENAI_BASE_URL: 'http://127.0.0.1:4010/v1', DRAFT_SOLD_MS: '1300', DRAFT_UNSOLD_MS: '900', DRAFT_TURN_MS: '25000', DRAFT_CPU_MS: '500' }, null);
await run('node', ['server.js'], { PORT: '3100' }, 'listening');
const URL0 = 'http://127.0.0.1:3100/draft-night.html?api=' + encodeURIComponent('http://127.0.0.1:3999');

const browser = await chromium.launch();
const results = [];
async function phone(name, viewport = { width: 390, height: 844 }) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  page.on('pageerror', e => { throw new Error(name + ' page error: ' + e.message); });
  await page.goto(URL0);
  await page.fill('#name', name);
  return page;
}
const shot = (page, file) => page.screenshot({ path: path.join(shots, file) });

// Fails if any visible text boxes in the game overlap, controls fall off screen or the page scrolls sideways.
async function layoutCheck(page, label) {
  const issues = await page.evaluate(() => {
    const out = [];
    const W = innerWidth, H = innerHeight;
    if (document.scrollingElement.scrollWidth > W + 1) out.push('horizontal scroll ' + document.scrollingElement.scrollWidth);
    const sel = '.custom,.opening,.sub,.meta b,.meta .money,.lot-img,.lot-kind,.lot-name,.lot-blurb,.amt,.who b,.trail,.dock-head span,.bids button,.pass,.progress span,.wait b,.wait span,.verdict-bar span,.code,.roster li,.primary,.theme b,.theme small,h1';
    const els = [...document.querySelectorAll(sel)].filter(e => e.offsetParent && e.getClientRects().length);
    const boxes = els.map(e => ({ e, r: e.getBoundingClientRect() }));
    for (const { e, r } of boxes) {
      if ((r.right > W + 1 || r.left < -1) && !e.closest('.worlds.many, .compare.many')) out.push('off-screen x: ' + e.className + ' ' + e.textContent.slice(0, 30));
      if (document.querySelector('.game') && (r.bottom > H + 1)) out.push('below fold: ' + e.className + ' ' + e.textContent.slice(0, 30));
      if (e.scrollWidth > e.clientWidth + 2 && getComputedStyle(e).textOverflow !== 'ellipsis' && getComputedStyle(e).overflow !== 'visible') out.push('clipped: ' + e.className);
    }
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      if (a.e.contains(b.e) || b.e.contains(a.e)) continue;
      if (!!a.e.closest('.footer') !== !!b.e.closest('.footer')) continue; // sticky footer floats over scrolling content
      const x = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left), y = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
      if (x > 1 && y > 1) out.push('overlap: "' + a.e.textContent.slice(0, 24) + '" × "' + b.e.textContent.slice(0, 24) + '"');
    }
    // The six questions: item, image, leader, my money, bid controls, creations.
    if (document.querySelector('.game')) {
      for (const need of ['.lot-name', '.lot-img', '.dock-head', '.world .canvas']) {
        const el = document.querySelector(need); if (!el) { out.push('missing ' + need); continue; }
        const r = el.getBoundingClientRect(); if (r.bottom > H || r.top < 0) out.push('not visible without scrolling: ' + need);
      }
    }
    return out;
  });
  if (issues.length) throw new Error(label + ' layout: ' + [...new Set(issues)].join('; '));
}

async function create(page, { theme, players, budget = 100, custom }) {
  if (custom) {
    await page.fill('#topic', custom);
    await page.click('#ask button');
  } else await page.click(`[data-theme="${theme}"]`);
  if (players === 'cpu') await page.click('[data-players="0"]'); else await page.click(`[data-players="${players}"]`);
  await page.click(`[data-budget="${budget}"]`);
}
async function join(page, code) {
  await page.click('[data-go="join"]');
  await page.fill('#code', code);
  await page.click('#joinForm .primary');
  await page.waitForSelector('.code');
}
const lotNo = async page => Number((await page.textContent('#prog')).match(/Lot (\d+)/)[1]) - 1;
async function finished(page) { return (await page.$('.compare')) !== null; }

// Drives a whole game through the UI. decide(seat, lot, page) returns 'pass' or an index into the bid buttons.
async function play(pages, decide, onLot) {
  const seen = new Set();
  for (let guard = 0; guard < 4000; guard++) {
    if (await finished(pages[0])) return;
    for (let i = 0; i < pages.length; i++) {
      const p = pages[i];
      if (!(await p.$('.game'))) continue;
      const lot = await lotNo(p);
      if (onLot && !seen.has(lot) && i === 0) { seen.add(lot); await onLot(lot); }
      const btn = await p.$('.bids button:not([disabled])');
      if (!btn) continue;
      const choice = await decide(i, lot, p);
      if (choice === 'custom') { await p.fill('#customBid', '12'); await p.click('#customForm button'); }
      else if (choice === 'pass' && await p.$('[data-pass]')) await p.click('[data-pass]');
      else if (choice === 'pass') await p.click('.bids button.main'); // nobody may pass on the opening bid
      else { const all = await p.$$('.bids button:not([disabled])'); await all[Math.min(choice, all.length - 1)].click(); }
      await p.waitForTimeout(120);
    }
    await pages[0].waitForTimeout(150);
  }
  throw new Error('game did not finish');
}
async function scenario(name, fn) {
  if (only.length && !only.includes(name)) return;
  const t0 = Date.now();
  try { await fn(); results.push(['PASS', name, ((Date.now() - t0) / 1000).toFixed(1) + 's']); }
  catch (e) { results.push(['FAIL', name, e.message.split('\n')[0]]); console.error(e); }
}

await scenario('A-property-2p', async () => {
  const ariel = await phone('Ariel'), louie = await phone('Louie');
  await shot(ariel, 'A0-home.png'); await layoutCheck(ariel, 'home');
  await create(ariel, { theme: 'house', players: 2 });
  await ariel.click('#create'); await ariel.waitForSelector('.code');
  const code = (await ariel.textContent('.code')).trim();
  await join(louie, code);
  await ariel.waitForSelector('[data-start]:not([disabled])');
  await shot(ariel, 'A1-lobby.png'); await layoutCheck(ariel, 'lobby');
  await ariel.click('[data-start]');
  await ariel.waitForSelector('.game'); await louie.waitForSelector('.game');
  assert.match(await ariel.textContent('#prog'), /Lot 1 of 10/);
  assert.match(await ariel.textContent('.lot-kind'), /Home 1 of 2/);
  await ariel.waitForSelector('.lot-img img.on', { timeout: 15000 });
  await shot(ariel, 'A2-house1-ariel.png'); await shot(louie, 'A2-house1-louie.png');
  await layoutCheck(ariel, 'game ariel'); await layoutCheck(louie, 'game louie');
  let shotMid = false;
  await play([ariel, louie], async (seat, lot) => {
    if (lot === 0) return seat === 0 ? 'custom' : 'pass';
    return (lot % 2 === 0) === (seat === 0) ? 0 : 'pass';
  }, async lot => {
    if (lot === 1) { await ariel.waitForTimeout(400); assert.ok(!(await ariel.$('.bids')), 'Ariel already has a house: no bid buttons on home 2'); await shot(ariel, 'A3-house2-auto.png'); }
    if (lot === 5 && !shotMid) { shotMid = true; await ariel.waitForTimeout(2500); await shot(ariel, 'A4-mid-ariel.png'); await shot(louie, 'A4-mid-louie.png'); await layoutCheck(louie, 'mid'); }
  });
  await ariel.waitForSelector('.compare');
  const spent = await ariel.$$eval('.entry .spend', es => es.map(e => e.textContent));
  assert.ok(spent[0].includes('£12') || /Spent £(1[2-9]|[2-9]\d)/.test(spent[0]), 'custom £12 bid was charged: ' + spent[0]);
  await ariel.waitForTimeout(9000);
  await ariel.evaluate(() => scrollTo(0, 0));
  await shot(ariel, 'A5-final.png');
  await ariel.screenshot({ path: path.join(shots, 'A5-final-full.png'), fullPage: true });
  const lists = await ariel.$$eval('.entry', es => es.map(e => [...e.querySelectorAll('li span:first-child')].map(s => s.textContent)));
  assert.equal(lists.length, 2);
  assert.equal(lists[0].length, 5); assert.equal(lists[1].length, 5);
  await ariel.context().close(); await louie.context().close();
});

await scenario('C-pancakes-2p', async () => {
  const a = await phone('Ariel'), b = await phone('Louie');
  await create(a, { custom: 'Pancakes', players: 2 });
  await a.waitForSelector('[data-theme="pancakes"][aria-pressed="true"]');
  await a.click('#create'); await a.waitForSelector('.code');
  await join(b, (await a.textContent('.code')).trim());
  await a.waitForSelector('[data-start]:not([disabled])'); await a.click('[data-start]');
  await a.waitForSelector('.game');
  const names = [];
  await play([a, b], async (seat, lot) => (lot % 2 === 0) === (seat === 0) ? (lot < 4 ? 2 : 0) : 'pass', async lot => {
    names.push(await a.textContent('.lot-name'));
    if (lot === 3) { await a.waitForTimeout(3000); await shot(a, 'C1-mid.png'); await layoutCheck(a, 'pancakes mid'); }
  });
  assert.ok(names.every(n => !/house|pool|garden|villa/i.test(n)), 'pancake items only: ' + names.join(', '));
  await a.waitForTimeout(9000); await shot(a, 'C2-final.png');
  await a.context().close(); await b.context().close();
});

await scenario('E-ambiguous', async () => {
  const a = await phone('Louie');
  await a.fill('#topic', 'Pam'); await a.click('#ask button');
  await a.waitForSelector('[data-option]');
  await shot(a, 'E1-ambiguous.png'); await layoutCheck(a, 'ambiguous');
  await a.click('[data-option="0"]');
  await a.waitForSelector('.custom-pick [aria-pressed="true"]');
  await shot(a, 'E2-confirmed.png');
  await a.context().close();
});

await scenario('D-custom-4p', async () => {
  const ps = [await phone('Ariel'), await phone('Louie'), await phone('Sam'), await phone('Jo')];
  await create(ps[0], { custom: 'Treehouse', players: 4, budget: 50 });
  await ps[0].waitForSelector('.custom-pick [aria-pressed="true"]');
  await ps[0].click('#create'); await ps[0].waitForSelector('.code');
  const code = (await ps[0].textContent('.code')).trim();
  for (const p of ps.slice(1)) await join(p, code);
  await ps[0].waitForSelector('[data-start]:not([disabled])'); await ps[0].click('[data-start]');
  await ps[0].waitForSelector('.game');
  assert.match(await ps[0].textContent('#prog'), /of 20/);
  await play(ps, async (seat, lot) => lot % 4 === seat ? 0 : 'pass', async lot => { if (lot === 9) { await ps[2].waitForTimeout(2000); await shot(ps[2], 'D1-mid-sam.png'); await layoutCheck(ps[2], '4p'); } });
  await ps[0].waitForTimeout(8000); await shot(ps[0], 'D2-final.png');
  const budgets = await ps[0].$$eval('.entry .spend', es => es.map(e => e.textContent));
  assert.equal(budgets.length, 4);
  for (const p of ps) await p.context().close();
});

await scenario('narrow-320', async () => {
  const a = await phone('Ariel', { width: 320, height: 568 });
  await layoutCheck(a, 'home 320');
  await create(a, { theme: 'burger', players: 'cpu' });
  await a.click('#create'); await a.waitForSelector('[data-start]:not([disabled])');
  await layoutCheck(a, 'lobby 320');
  await a.click('[data-start]'); await a.waitForSelector('.game');
  await a.waitForSelector('.bids button', { timeout: 10000 });
  await shot(a, 'N1-320-turn.png'); await layoutCheck(a, 'game 320 your turn');
  await a.click('.bids button.main');
  await a.waitForTimeout(300); await layoutCheck(a, 'game 320 waiting');
  await shot(a, 'N2-320-wait.png');
  await a.context().close();
  for (const [w, h] of [[390, 664], [430, 740], [375, 667], [390, 844]]) {
    const c = await phone('Sam', { width: w, height: h });
    await create(c, { theme: 'house', players: 'cpu' }); await c.click('#create'); await c.waitForSelector('[data-start]:not([disabled])'); await c.click('[data-start]');
    await c.waitForSelector('.bids button', { timeout: 10000 }); await c.waitForTimeout(1200); await layoutCheck(c, 'game ' + w + 'x' + h); await shot(c, `N4-${w}x${h}.png`);
    await c.context().close();
  }
  const b = await phone('Louie', { width: 375, height: 667 });
  await create(b, { theme: 'house', players: 'cpu' }); await b.click('#create'); await b.waitForSelector('[data-start]:not([disabled])'); await b.click('[data-start]');
  await b.waitForSelector('.game'); await b.waitForTimeout(1500); await layoutCheck(b, 'game 375x667'); await shot(b, 'N3-375.png');
  await b.context().close();
});

console.log('\n' + results.map(r => r.join('  ')).join('\n'));
await browser.close();
process.exit(results.some(r => r[0] === 'FAIL') ? 1 : 0);
