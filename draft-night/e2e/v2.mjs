// Two phones play a complete Draft Night v2 game in Chromium against a running server, taking screenshots on the way.
// node draft-night/e2e/v2.mjs [baseUrl] [theme] [outDir]
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
let pw; try { pw = require('playwright'); } catch { pw = require(process.env.PLAYWRIGHT_PATH || '/opt/node-tools/node_modules/playwright'); }
const [base = 'http://localhost:3999', theme = 'house', out = 'shots/v2'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const browser = await pw.chromium.launch();
const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const host = await (await browser.newContext(phone)).newPage(), guest = await (await browser.newContext(phone)).newPage();
const errors = [];
for (const [who, p] of [['host', host], ['guest', guest]]) { p.on('pageerror', e => errors.push(who + ': ' + e.message)); p.on('console', m => m.type() === 'error' && errors.push(who + ' console: ' + m.text())); }
const shot = async (p, name) => p.screenshot({ path: `${out}/${name}.png`, fullPage: true });

await host.goto(base + '/draft-night-v2.html');
await host.waitForSelector(`[data-theme="${theme}"]`);
await host.click(`[data-theme="${theme}"]`);
await host.fill('#name', 'Louie');
await host.click('[data-rounds="4"]');
await shot(host, '01-home');
await host.click('[data-create]');
await host.waitForSelector('.big-code');
const code = (await host.textContent('.big-code')).trim();
await guest.goto(base + '/draft-night-v2.html?room=' + code);
await guest.fill('#name', 'Ariel');
await guest.click('#joinform button');
await host.waitForSelector('[data-start]:not([disabled])');
await shot(host, '02-lobby');
await host.click('[data-start]');

const seen = new Set();
const deadline = Date.now() + 240000;
let rounds = new Set();
while (Date.now() < deadline) {
  const status = await host.evaluate(() => document.querySelector('h1')?.textContent || document.querySelector('.stage h2')?.textContent || '');
  if (await host.$('[data-vote]') || await host.$('.entry.winner')) break;
  for (const [who, p] of [['host', host], ['guest', guest]]) {
    const stage = await p.$eval('.stage', el => el.className).catch(() => '');
    const label = await p.$eval('.market .eyebrow', el => el.textContent).catch(() => '');
    rounds.add(label);
    const key = label + stage;
    if (!seen.has(key)) { seen.add(key); await shot(p, `03-${who}-${seen.size}`); }
    const bidBtn = await p.$('[data-bid]'), passBtn = await p.$('[data-pass]'), pick = await p.$('[data-pick]');
    try {
      if (pick) await pick.click();
      else if (bidBtn && passBtn) { if (Math.random() < 0.55) await bidBtn.click(); else await passBtn.click(); }
    } catch {}
  }
  await host.waitForTimeout(350);
}
// Voting: each phone votes for the other.
for (const p of [host, guest]) { await p.waitForSelector('[data-vote]', { timeout: 20000 }); await shot(p, '04-vote-' + (p === host ? 'host' : 'guest')); await p.click('[data-vote]'); }
await host.waitForSelector('.entry.winner', { timeout: 20000 });
await shot(host, '05-final-phone');
await host.setViewportSize({ width: 1280, height: 900 });
await shot(host, '06-final-wide');
const result = await host.evaluate(() => ({ heading: document.querySelector('h1').textContent, entries: [...document.querySelectorAll('.entry')].map(e => ({ name: e.querySelector('h3').textContent, items: [...e.querySelectorAll('.owned .nm')].map(x => x.textContent) })) }));
console.log(JSON.stringify({ code, rounds: [...rounds].filter(Boolean), result, errors }, null, 1));
await browser.close();
if (errors.length) process.exit(1);
