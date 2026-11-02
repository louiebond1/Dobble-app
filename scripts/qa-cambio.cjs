// Plays complete Cambio games in two separate browser sessions against the real engine.
// Usage: node scripts/qa-cambio.cjs   (screenshots go to $QA_SHOTS or /tmp/cambio-qa)
const fs = require('fs');
const {chromium} = require(process.env.PW_ROOT || 'playwright');
const {start} = require('./qa-cambio-server.cjs');
const shots = process.env.QA_SHOTS || '/tmp/cambio-qa'; fs.mkdirSync(shots, {recursive: true});
const sizes = (process.env.QA_SIZES || '390x844,375x667,320x568,430x932').split(',').map(s => s.split('x').map(Number));
function assert(v, m) { if (!v) throw Error('FAIL: ' + m); }
const stackOn = (base, body) => fetch(base + '/qa/stack', {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify(body)});

async function session(browser, url, [w, h], errors) {
  const ctx = await browser.newContext({viewport: {width: w, height: h}, deviceScaleFactor: 2, isMobile: true, hasTouch: true});
  const p = await ctx.newPage(); p.on('pageerror', e => errors.push(e.message)); await p.goto(url); return p;
}
const idle = p => p.waitForFunction(() => typeof wire !== 'undefined' && wire && state && !animating && !busy && !pumping && !messages.length, null, {timeout: 15000});
const until = (p, fn, arg) => p.waitForFunction(fn, arg, {timeout: 15000}).then(() => idle(p));
const w = p => p.evaluate(() => JSON.parse(JSON.stringify(wire)));
const tap = async (p, sel) => { await idle(p); await p.locator(sel).click(); };
const control = async (p, key) => { await idle(p); await p.locator(`#actions [data-key="${key}"]`).click(); };
const mine = i => `#myHand > button:nth-child(${i + 1})`, theirs = i => `#oppHand > button:nth-child(${i + 1})`;
const faces = (p, id) => p.evaluate(id => [...document.querySelectorAll(`#${id} > .playing`)].map(e => e.dataset.face), id);
// Layout: no page scroll, nothing off-screen, controls never cover cards.
async function fit(p, label) {
  const r = await p.evaluate(() => {
    const box = el => el && el.getClientRects().length ? el.getBoundingClientRect() : null;
    const hit = (a, b) => a && b && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
    const visible = [...document.querySelectorAll('button,input,select')].filter(e => e.getClientRects().length && !e.closest('dialog'));
    const cards = [...document.querySelectorAll('#myHand > .playing, #oppHand > .playing')].map(box);
    const controls = [...document.querySelectorAll('#actions button, #matchBtn, #statusPanel')].filter(e => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden').map(box);
    const small = [...document.querySelectorAll('#actions button')].filter(e => e.getClientRects().length).map(box).filter(b => b.height < 40);
    return {scroll: document.documentElement.scrollHeight > innerHeight + 1 || document.documentElement.scrollWidth > innerWidth + 1,
      out: visible.filter(e => { const b = e.getBoundingClientRect(); return b.bottom > innerHeight + 1 || b.right > innerWidth + 1 || b.left < -1 || b.top < -1; }).map(e => e.id || e.textContent),
      overlap: controls.some(c => cards.some(card => hit(c, card))), small: small.length,
      cardWidth: Math.min(...cards.filter(Boolean).map(b => b.width))};
  });
  assert(!r.scroll && !r.out.length && !r.overlap && !r.small, `${label} layout ${JSON.stringify(r)}`);
  return r;
}
async function shot(p, name) { await idle(p); await p.waitForTimeout(250); await p.screenshot({path: `${shots}/${name}.png`}); }

async function twoPlayer(browser, base, size) {
  const tag = size.join('x'), errors = [], url = `${base}/cambio.html?table=qa-full-${tag}-${Date.now().toString(36)}`;
  const L = await session(browser, url, size, errors), A = await session(browser, url, size, errors);
  await L.click('[data-seat=louie]'); await A.click('[data-seat=ariel]');
  await until(L, () => wire.online.length === 2);
  await L.selectOption('#mode', 'rounds'); await L.fill('#limit', '2');
  await until(A, () => wire.settings.mode === 'rounds' && wire.settings.limit === 2).catch(async e => { console.log(await L.evaluate(() => [wire.settings, wire.phase, busy, queuedSettings, $('limit').value, $('toast').textContent]), await A.evaluate(() => wire.settings)); throw e; });
  await stackOn(base, {louie: ['5♠', '6♠', '7♥', '3♣'], ariel: ['9♣', '13♥', '2♦', '4♠'], draws: ['12♦', '11♣', '6♥', '6♦', '2♣']});
  await tap(L, '#readyBtn'); await tap(A, '#readyBtn');
  await until(L, () => wire.phase === 'initial').catch(async e => { for (const p of [L, A]) console.log(await p.evaluate(() => [wire.phase, wire.ready, wire.round, $('toast').textContent, $('readyBtn').disabled])); throw e; });
  assert(JSON.stringify(await faces(L, 'myHand')) === JSON.stringify(['back', 'back', '7♥', '3♣']), 'Louie sees exactly his bottom two');
  assert((await faces(A, 'oppHand')).every(f => f === 'back'), 'Ariel cannot see Louie’s cards');
  await fit(L, 'initial ' + tag); await shot(L, `${tag}-01-first-look`);
  await control(L, 'hideStart'); await control(A, 'hideStart');
  await until(L, () => wire.phase === 'draw');
  assert((await faces(L, 'myHand')).every(f => f === 'back'), 'hidden cards stay hidden');
  assert(await A.locator('#deck').isDisabled(), 'only the starter can draw');
  assert((await w(L)).deckCount === 44 && !(await w(L)).discard, '44 cards and empty discard');

  // Queen: look at Ariel's K♥, hide, then swap a different pair (my 5♠ for her 4♠).
  await tap(L, '#deck'); await until(L, () => wire.phase === 'holding');
  assert((await w(A)).drawn.hidden && !(await A.evaluate(() => document.querySelector('#drawn .real-face'))), 'draw stays private');
  await fit(L, 'holding ' + tag); await shot(L, `${tag}-02-drew-queen`);
  await control(L, 'discard'); await until(L, () => wire.phase === 'queen');
  await tap(L, theirs(1)); await until(L, () => wire.phase === 'queenView');
  assert((await faces(L, 'oppHand'))[1] === '13♥', 'Queen shows the looked-at card');
  assert((await faces(L, 'oppHand')).filter(f => f !== 'back').length === 1 && (await faces(L, 'myHand')).every(f => f === 'back'), 'Queen reveals only one card');
  assert((await faces(A, 'myHand')).every(f => f === 'back') && (await faces(A, 'oppHand')).every(f => f === 'back'), 'watcher sees no faces during the Queen look');
  assert(await A.locator(mine(1) + ' .card-flag').textContent() === 'Looking', 'watcher sees which card is being looked at');
  assert(await L.locator(theirs(2)).isDisabled(), 'no second Queen look');
  await shot(L, `${tag}-03-queen-look`); await shot(A, `${tag}-03-queen-watching`);
  await control(L, 'hideQueen'); await until(L, () => wire.phase === 'queenSwap');
  assert((await faces(L, 'oppHand')).every(f => f === 'back'), 'Queen card hidden again');
  await tap(L, mine(0)); await tap(L, theirs(3));
  assert(await L.locator(mine(0) + ' .pick-badge').textContent() === 'Give' && await L.locator(theirs(3) + ' .pick-badge').textContent() === 'Take', 'selected pair is marked');
  await fit(L, 'queen pair ' + tag); await shot(L, `${tag}-04-queen-pair`);
  await control(L, 'swap'); await until(A, () => wire.phase === 'draw' && wire.turn === 'ariel');
  assert(await L.locator(theirs(3) + ' .card-flag').textContent() === 'Swapped', 'swapped cards are labelled');

  // Jack: Ariel blind swaps her 9♣ for Louie's 6♠.
  await tap(A, '#deck'); await until(A, () => wire.phase === 'holding');
  await control(A, 'discard'); await until(A, () => wire.phase === 'blind');
  await tap(A, mine(0)); await tap(A, theirs(1)); await shot(A, `${tag}-05-jack-pair`);
  await control(A, 'swap'); await until(L, () => wire.phase === 'draw' && wire.turn === 'louie');

  // Louie discards 6♥. Ariel matches her (swapped-in) 6♠ without any Continue step; Louie guesses wrong.
  await tap(L, '#deck'); await until(L, () => wire.phase === 'holding'); await control(L, 'discard');
  await until(A, () => wire.discard?.rank === 6);
  await tap(A, mine(0)); await until(A, () => wire.hands.ariel[0] === null);
  await until(L, () => wire.hands.ariel[0] === null);
  await shot(L, `${tag}-06-opponent-matched`);
  await until(L, () => wire.discard?.rank === 6 && ['draw', 'settling'].includes(wire.phase));
  await tap(L, mine(2)); await until(L, () => wire.hands.louie.length === 5);
  assert(await L.locator(mine(4) + ' .card-flag').textContent() === '+1 penalty', 'penalty card is labelled');
  assert((await faces(L, 'myHand'))[4] === 'back', 'penalty card is unseen');
  await fit(L, 'penalty ' + tag); await shot(L, `${tag}-07-penalty`);

  // Ariel calls Cambio; Louie's final turn; reveal before scores.
  await until(A, () => wire.phase === 'draw' && wire.turn === 'ariel');
  await control(A, 'call'); await control(A, 'yesCall');
  await until(L, () => wire.turn === 'louie' && wire.phase === 'draw');
  assert((await L.locator('#turnTag').textContent()) === 'Your final turn', 'final turn is announced');
  assert((await L.locator('#oppTurn').textContent()) === 'Called Cambio', 'caller is marked');
  await shot(L, `${tag}-08-final-turn`);
  await tap(L, '#deck'); await until(L, () => wire.phase === 'holding');
  await tap(L, mine(0)); await until(L, () => wire.phase === 'result');
  await until(L, () => reviewRound === wire.round);
  assert((await faces(L, 'oppHand')).every(f => f !== 'back'), 'both hands revealed');
  assert(await L.locator('#louieScore').textContent() === '0', 'totals wait for the score screen');
  await fit(L, 'reveal ' + tag); await shot(L, `${tag}-09-reveal`);
  const r1 = await w(L);
  // Louie: 2♣ 9♣ 7♥ 3♣ + penalty 6♦ = 27. Ariel: K♥ 2♦ 5♠ with 6♠ matched away = 6.
  assert(r1.points.louie === 27 && r1.points.ariel === 6, 'round scores ' + JSON.stringify(r1.points));
  await control(L, 'scores'); await shot(L, `${tag}-10-scores`);
  await A.locator('#actions [data-key=scores]').click();

  // Round 2: Ariel starts. Louie refreshes mid-round and gets the right seat and game back.
  await stackOn(base, {louie: ['1♠', '2♠', '3♠', '4♠'], ariel: ['1♥', '2♥', '3♥', '4♥'], draws: ['10♣', '9♦']});
  await control(L, 'next'); await control(A, 'next');
  await until(A, () => wire.phase === 'initial' && wire.round === 2);
  await control(L, 'hideStart'); await control(A, 'hideStart');
  await until(A, () => wire.phase === 'draw');
  assert((await w(A)).turn === 'ariel', 'starting player alternates');
  await L.reload(); await until(L, () => wire && wire.me === 'louie' && wire.round === 2);
  assert((await w(L)).online.length === 2, 'refresh restores Louie');
  await tap(A, '#deck'); await until(A, () => wire.phase === 'holding'); await control(A, 'discard');
  await until(A, () => wire.phase === 'opponent'); await tap(A, theirs(2)); await until(A, () => wire.phase === 'view');
  assert((await faces(A, 'oppHand'))[2] === '3♠' && (await faces(L, 'myHand')).every(f => f === 'back'), '10 shows one opponent card privately');
  await control(A, 'hide'); await until(L, () => wire.phase === 'draw' && wire.turn === 'louie');
  await control(L, 'call'); await control(L, 'yesCall');
  await until(A, () => wire.turn === 'ariel' && wire.phase === 'draw');
  await tap(A, '#deck'); await until(A, () => wire.phase === 'holding'); await control(A, 'discard');
  await until(A, () => wire.phase === 'view' || wire.phase === 'opponent');
  if ((await w(A)).phase === 'opponent') await control(A, 'skip'); else await control(A, 'hide');
  await until(L, () => wire.phase === 'over'); await control(L, 'scores');
  const over = await w(L);
  assert(over.scores.louie === 27 + 10 && over.scores.ariel === 6 + 10, 'cumulative scores ' + JSON.stringify(over.scores));
  await shot(L, `${tag}-11-match-over`);

  // Reset during play needs confirmation and returns both players to setup with zero scores.
  await until(A, () => reviewRound === wire.round); await control(A, 'scores');
  await control(L, 'next'); await control(A, 'next'); await until(L, () => wire.phase === 'initial');
  await tap(L, '#resetBtn'); await L.locator('#resetDialog').waitFor();
  await shot(L, `${tag}-12-reset-confirm`);
  await L.click('#confirmReset');
  await until(A, () => wire.phase === 'lobby' && wire.scores.louie === 0 && wire.history.length === 0);
  assert(await A.locator('#lobby').isVisible(), 'partner returns to setup');
  assert(!errors.length, 'page errors ' + errors.join('; '));
  await L.context().close(); await A.context().close();
  console.log('PASS two-player match', tag);
}

async function solo(browser, base) {
  const errors = [], p = await session(browser, `${base}/cambio.html`, [390, 844], errors);
  await p.click('#soloBtn'); await until(p, () => wire && wire.solo && wire.online.length === 2);
  await p.selectOption('#mode', 'rounds'); await p.fill('#limit', '1');
  await until(p, () => wire.settings.limit === 1);
  await tap(p, '#readyBtn'); await until(p, () => wire.phase === 'initial'); await control(p, 'hideStart');
  for (let turn = 0; turn < 40; turn++) {
    await until(p, () => ['result', 'over'].includes(wire.phase) || wire.turn === 'louie' && wire.phase === 'draw');
    if (['result', 'over'].includes((await w(p)).phase)) break;
    if (turn === 3) { await shot(p, 'solo-turn'); await control(p, 'call'); await control(p, 'yesCall'); continue; }
    // The bot can match its last card at any moment, which ends the round.
    try { await tap(p, '#deck'); await until(p, () => wire.phase === 'holding'); await control(p, 'discard'); await until(p, () => !['holding'].includes(wire.phase)); }
    catch (e) { if (['result', 'over'].includes((await w(p)).phase)) break; throw e; }
    const s = await w(p); if (s.turn === 'louie' && !['settling', 'draw', 'result', 'over'].includes(s.phase)) await control(p, s.phase === 'view' ? 'hide' : 'skip');
  }
  await until(p, () => wire.phase === 'over');
  assert(await p.locator('#oppAvatar').textContent() === 'B', 'bot avatar uses an initial');
  assert(!errors.length, 'solo errors ' + errors.join('; '));
  await shot(p, 'solo-over'); await p.context().close(); console.log('PASS solo game vs bot');
}

(async () => {
  const {server, port} = await start(0), base = `http://localhost:${port}`;
  const browser = await chromium.launch({executablePath: process.env.PW_EXECUTABLE_PATH});
  try { for (const size of sizes) await twoPlayer(browser, base, size); await solo(browser, base); console.log('ALL PASS'); }
  catch (e) { console.error(e); process.exitCode = 1; }
  finally { await browser.close(); server.close(); setTimeout(() => process.exit(), 100); }
})();
