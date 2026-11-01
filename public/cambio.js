'use strict';
const $ = id => document.getElementById(id);
const socket = io();
const tableId = /^(?:qa|solo)-[a-z0-9-]{6,70}$/.test(new URLSearchParams(location.search).get('table') || '') ? new URLSearchParams(location.search).get('table') : 'main';
const storePrefix = `cambio:${tableId}:`;
let names={louie:'Louie',ariel:tableId.startsWith('solo-')?'🤖 Bot':'Ariel'};
const name = p => names[p];
const other = p => p === 'louie' ? 'ariel' : 'louie';
const rankName = rank => ['', 'Ace', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'Jack', 'Queen', 'King'][rank];
const label = c => c && !c.hidden ? `${rankName(c.rank)} ${c.suit}` : 'Face-down card';
const MATCH_PHASES = ['draw', 'holding', 'self', 'opponent', 'view', 'blind', 'queen', 'queenView', 'queenSwap', 'settling'];
let state = null, wire = null, busy = false, animating = false, seat = null, pending = null;
let picks = {mine: null, theirs: null}, matching = false, confirmCall = false;
let queuedSettings = null, toastTimer, seenSerial = 0, pumping = false;
const messages = [];
const storage = (key, value) => { try { if (value === undefined) return localStorage.getItem(storePrefix + key); localStorage.setItem(storePrefix + key, value); } catch {} return null; };
const tabStorage = (key, value) => { try { if (value === undefined) return sessionStorage.getItem(storePrefix + key); sessionStorage.setItem(storePrefix + key, value); } catch {} return null; };
const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const sleep = ms => new Promise(resolve => setTimeout(resolve, reduced() ? 0 : ms));
function toast(text) { $('toast').textContent = text; $('toast').classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 3200); }
function join(who) {
  seat = who;
  socket.timeout(6000).emit('cambio:join', {who, token: storage('token:' + who) || (tableId === 'main' ? (() => {try {return localStorage.getItem('cambio:token:' + who);} catch {return null;}})() : null), table: tableId}, (error, result) => {
    if (error || !result?.ok) { toast(result?.error || 'Could not connect. Try your seat again.'); return; }
    storage('token:' + who, result.token); storage('seat', who); tabStorage('seat', who);
  });
}
function act(action, extra = {}) {
  if (busy || animating || !wire || !socket.connected) return;
  busy = true; pending = action; render();
  socket.timeout(6000).emit('cambio:action', {action, revision: wire.revision, phase: wire.phase, round: wire.round, ply: wire.ply, discardGeneration: wire.discardGeneration, topCard: wire.discard ? `${wire.discard.rank}${wire.discard.suit}` : null, settingsKey: `${wire.settings.mode}:${wire.settings.limit}`, ...extra}, (error, result) => {
    busy = false; pending = null;
    if (error || !result?.ok) toast(result?.error || 'Connection interrupted. Your table is saved.');
    render(); flushSettings();
  });
}
function card(el, c) {
  const face = c ? c.hidden ? 'back' : `${c.rank}${c.suit}` : 'empty';
  if (el.dataset.face === face) return;
  el.dataset.face = face; el.replaceChildren(); el.className = 'playing';
  el.setAttribute('aria-label', c ? label(c) : 'Empty card slot');
  if (el.tagName !== 'BUTTON') el.setAttribute('role', 'img');
  if (!c) { el.classList.add('empty'); return; }
  if (c.hidden) { el.classList.add('back'); const seal = document.createElement('span'); seal.className = 'back-seal'; seal.textContent = 'A + L'; el.append(seal); return; }
  if (['♥', '♦'].includes(c.suit)) el.classList.add('red');
  const faceArt = document.createElement('span'); faceArt.className = 'real-face'; faceArt.setAttribute('aria-hidden', 'true');
  faceArt.style.backgroundPosition = `${(c.rank - 1) / 12 * 100}% ${{'♣': 0, '♦': 1, '♥': 2, '♠': 3}[c.suit] / 3 * 100}%`;
  el.append(faceArt);
  if (c.rank === 13 && ['♥', '♦'].includes(c.suit)) { const badge = document.createElement('span'); badge.className = 'value-badge'; badge.textContent = '−1'; el.append(badge); }
}
function text(el, value) { if (el.textContent !== value) { el.textContent = value; } }
function control(key, title, fn, {primary = false, disabled = false} = {}) { return {key, title, fn, primary, disabled}; }
function setControls(items) {
  const bar = $('actions');
  for (const el of [...bar.children]) if (!items.some(item => item.key === el.dataset.key)) el.remove();
  for (const item of items) {
    let button = [...bar.children].find(el => el.dataset.key === item.key);
    if (!button) { button = document.createElement('button'); button.dataset.key = item.key; bar.append(button); if (!reduced()) button.animate([{opacity: 0, transform: 'translateY(5px)'}, {opacity: 1, transform: 'translateY(0)'}], {duration: 180}); }
    text(button, item.title); button.className = item.primary ? 'primary' : '';
    button.disabled = busy || animating || item.disabled; button.onclick = item.fn;
  }
}
function pick(owner, index) {
  if (!state || busy || animating) return;
  const s = state, mine = owner === s.me, active = s.turn === s.me;
  if (matching || !active || ['draw', 'settling'].includes(s.phase)) {
    if (mine) act('snap', {index, owner}); return;
  }
  if (s.phase === 'holding' && mine) return act('replace', {index});
  if (s.phase === 'self' && mine || s.phase === 'opponent' && !mine || s.phase === 'queen') return act('peek', {index, owner});
  if (['blind', 'queenSwap'].includes(s.phase)) { picks[mine ? 'mine' : 'theirs'] = picks[mine ? 'mine' : 'theirs'] === index ? null : index; render(); }
}
function ownCanMatch(s) { return MATCH_PHASES.includes(s.phase) && !!s.discard; }
function canChoose(s, owner, index) {
  if (busy || animating || !socket.connected || !s.online.includes(other(s.me)) || !s.hands[owner][index]) return false;
  const mine = owner === s.me;
  if (matching) return mine && ownCanMatch(s);
  if (s.turn !== s.me || ['draw', 'settling'].includes(s.phase)) return mine && ownCanMatch(s);
  if (s.phase === 'holding' || s.phase === 'self') return mine;
  if (s.phase === 'opponent') return !mine;
  return ['queen', 'blind', 'queenSwap'].includes(s.phase);
}
function visibleCard(s, owner, index) {
  let c = s.hands[owner][index];
  if (s.peek?.who === owner && s.peek.index === index) c = s.peek.card;
  const live = wire || s;
  const allowedPeek = live.peek?.who === owner && live.peek.index === index;
  const allowedHand = live.hands[owner]?.[index] && !live.hands[owner][index].hidden;
  if (!socket.connected || document.hidden || ['ready', 'skip', 'hideQueen', 'swap', 'replace', 'discard'].includes(pending) || c && !c.hidden && !allowedPeek && !allowedHand) return c ? {hidden: true} : null;
  return c;
}
function renderHand(s, owner, id) {
  const hand = $(id), mine = owner === s.me;
  while (hand.children.length > s.hands[owner].length) hand.lastElementChild.remove();
  // Four normal cards stay in a stable 2×2 layout. Penalties spread into an extra column.
  hand.classList.toggle('expanded', s.hands[owner].length > 4);
  for (let i = 0; i < s.hands[owner].length; i++) {
    let button = hand.children[i]; if (!button) { button = document.createElement('button'); hand.append(button); }
    const c = visibleCard(s, owner, i); card(button, c);
    button.classList.remove('available', 'selected', 'peek-active', 'being-peeked');
    button.setAttribute('aria-label', `${mine ? 'Your' : "Opponent's"} card ${i + 1}${c && !c.hidden ? ': ' + label(c) : ''}`);
    button.disabled = !canChoose(s, owner, i); if (!button.disabled) button.classList.add('available');
    if (['blind', 'queenSwap'].includes(s.phase) && picks[mine ? 'mine' : 'theirs'] === i) button.classList.add('selected');
    if (s.peek?.who === owner && s.peek.index === i) button.classList.add('peek-active');
    const lastPeek = [...s.events].reverse().find(e => e.kind === 'peek' || e.kind === 'hide' || e.kind === 'swap' || e.kind === 'discard' || e.kind === 'replace');
    if (s.turn !== s.me && lastPeek?.kind === 'peek' && lastPeek.owner === owner && lastPeek.index === i && ['view', 'queenView'].includes(s.phase)) button.classList.add('being-peeked');
    let badge = button.querySelector('.pick-badge');
    if (button.classList.contains('selected')) { if (!badge) { badge = document.createElement('span'); badge.className = 'pick-badge'; button.append(badge); } badge.textContent = mine ? 'YOUR PICK' : 'THEIR PICK'; } else badge?.remove();
    button.onclick = () => pick(owner, i);
  }
}
function renderResult(s) {
  const key = `${s.round}:${s.phase}:${s.scores.louie}:${s.scores.ariel}`;
  if ($('results').dataset.key !== key) {
    $('results').dataset.key = key; $('results').replaceChildren();
    const h = document.createElement('h2'); h.textContent = s.phase === 'over' ? s.scores.louie === s.scores.ariel ? 'A tied match.' : `${name(s.scores.louie < s.scores.ariel ? 'louie' : 'ariel')} wins.` : s.message;
    const sub = document.createElement('p'); sub.textContent = `Round ${s.round} · lowest total wins`;
    $('results').append(h, sub); const scores = document.createElement('div'); scores.className = 'scorecards';
    for (const owner of ['louie', 'ariel']) { const panel = document.createElement('div'); panel.textContent = name(owner); const b = document.createElement('b'); b.textContent = s.points[owner]; panel.append(b); const small = document.createElement('small'); small.textContent = `${s.scores[owner]} total`; panel.append(small); const hand = document.createElement('div'); hand.className = 'hand result-hand'; for (const c of s.hands[owner]) if (c) { const el = document.createElement('div'); card(el, c); hand.append(el); } panel.append(hand); scores.append(panel); }
    $('results').append(scores); const history = document.createElement('details'); const summary = document.createElement('summary'); summary.textContent = 'Round history'; history.append(summary); const table = document.createElement('table'); table.innerHTML = '<thead><tr><th>Round</th><th>Louie</th><th>Ariel</th></tr></thead>'; const body = document.createElement('tbody'); for (const row of s.history) { const tr = document.createElement('tr'); for (const val of [row.round, row.louie, row.ariel]) { const td = document.createElement('td'); td.textContent = val; tr.append(td); } body.append(tr); } table.append(body); history.append(table); $('results').append(history);
  }
  setControls([control('next', s.ready.includes(s.me) ? 'Ready. Waiting for your partner…' : s.phase === 'over' ? 'Play again' : 'Next round', () => act('ready'), {primary: true, disabled: s.ready.includes(s.me)}), control('reset', 'New match', () => act('configure'))]);
}
function render() {
  if (!state) return;
  const s = state, me = s.me, opp = other(me), active = s.turn === me, connected = socket.connected && s.online.includes(opp), result = ['result', 'over'].includes(s.phase);
  $('setup').hidden = true; $('table').hidden = false; $('lobby').hidden = s.phase !== 'lobby'; $('board').hidden = s.phase === 'lobby' || result;
  $('statusPanel').hidden = s.phase === 'lobby' || result; $('results').hidden = !result;
  document.body.dataset.motion = String(animating); document.body.dataset.pending = pending || '';
  document.body.dataset.phase = s.phase; document.body.dataset.turn = active ? 'mine' : 'theirs'; document.body.dataset.matching = matching;
  text($('louieScoreName'),name('louie'));text($('arielScoreName'),name('ariel'));$('lobbySoloBtn').hidden=!!s.solo;$('headerSoloBtn').hidden=!!s.solo;$('switchSeat').hidden=!!s.solo;
  text($('roundLabel'), s.round ? `Round ${s.round}` : 'Cambio'); text($('targetLabel'), s.settings.mode === 'target' ? `Play to ${s.settings.limit}` : `${s.settings.limit} rounds`);
  for (const p of ['louie', 'ariel']) text($(p + 'Score'), String(s.scores[p]));
  text($('footnote'), !socket.connected ? 'Reconnecting. Your game is saved.' : !connected ? `Waiting for ${name(opp)} to reconnect.` : s.caller ? `${name(s.caller)} called Cambio · final turn` : 'Lowest total wins · Rules ↗');
  if (s.phase === 'lobby') {
    setControls([]); text($('presence'), `${s.online.map(name).join(' + ')}${connected ? ' · both here' : ' · waiting for your partner'}`);
    if (!queuedSettings && pending !== 'settings') { if (document.activeElement !== $('limit')) $('limit').value = s.settings.limit; $('mode').value = s.settings.mode; }
    $('readyBtn').disabled = busy || animating || s.ready.includes(me); text($('readyBtn'), s.ready.includes(me) ? 'Ready. Waiting for your partner…' : 'Ready to play'); return;
  }
  if (result) { renderResult(s); return; }
  text($('myName'), name(me)); text($('oppName'), name(opp)); text($('myAvatar'), name(me)[0]); text($('oppAvatar'),s.solo?'🤖':name(opp)[0]);
  text($('myStatus'), `${s.hands[me].filter(Boolean).length} cards`); text($('oppStatus'), `${s.hands[opp].filter(Boolean).length} cards`);
  renderHand(s, opp, 'oppHand'); renderHand(s, me, 'myHand');
  card($('discard'), s.discard); if (!s.discard) $('discard').className = 'playing blank';
  const held = s.drawn && (document.hidden || pending === 'discard' || pending === 'replace' ? {hidden: true} : s.drawn);
  card($('drawn'), held); if (!held) $('drawn').className = 'playing blank';
  $('discard').setAttribute('aria-label', `Discard pile${s.discard ? ': ' + label(s.discard) : ''}`);
  $('drawn').setAttribute('aria-label', held ? `${name(s.turn)}'s drawn card${!held.hidden ? ': ' + label(held) : ''}` : 'Drawn card area');
  text($('deckCount'), `${s.deckCount} left`); text($('heldLabel'), s.drawn ? active ? 'YOUR DRAW' : `${name(opp).toUpperCase()}'S DRAW` : 'DRAWN CARD');
  const canDraw = connected && active && s.phase === 'draw' && !busy && !animating;
  $('deck').disabled = !canDraw; $('discard').disabled = !canDraw || !s.discard;
  $('deck').classList.toggle('available', canDraw); $('discard').classList.toggle('available', canDraw && !!s.discard);
  $('matchBtn').disabled = !connected || busy || animating || !ownCanMatch(s);
  $('matchBtn').setAttribute('aria-pressed', String(matching)); text($('matchBtn'), matching ? 'Cancel match' : s.discard ? `Match ${rankName(s.discard.rank)}` : 'Match discard');
  let heading = active ? 'Your turn' : `${name(opp)}’s turn`, hint = '', steps = [], controls = [];
  const action = (key, title, serverAction, extra = {}, primary = false) => control(key, title, () => act(serverAction, extra), {primary, disabled: !connected});
  if (s.phase === 'initial') {
    heading = 'Remember these two'; hint = s.ready.includes(me) ? `Your cards are hidden. Waiting for ${name(opp)}.` : 'These are your only starting looks. Memorise your bottom two.';
    controls.push(action('hideStart', s.ready.includes(me) ? 'Cards hidden' : 'Hide my cards', 'ready', {}, true)); controls[0].disabled ||= s.ready.includes(me);
  } else if (s.phase === 'reveal') { heading = 'Cards on the table'; hint = 'Revealing both hands…'; }
  else if (matching) {
    heading = `Match a ${rankName(s.discard.rank)}`; hint = 'Tap the matching card in YOUR hand. A wrong guess adds a card.';
    controls.push(control('cancelMatch', 'Back to the turn', () => { matching = false; render(); }));
  } else if (s.phase === 'settling') {
    heading = s.caller && s.turn !== s.caller ? 'Last chance to match' : `${name(other(s.turn))} is next`;
    hint = s.caller && s.turn !== s.caller ? 'Tap your matching card now. The hands reveal automatically.' : `You can still tap your own ${rankName(s.discard?.rank)} to match.`;
  } else if (!active) {
    const descriptions = {draw: 'is choosing a card.', holding: 'drew a card. Watch where it goes.', self: 'is choosing one of their cards to look at.', opponent: 'is choosing one of your cards to look at.', view: 'is memorising a card.', blind: 'is choosing two cards for a blind swap.', queen: 'has a Queen: one look, then a swap.', queenView: 'is taking their one private look.', queenSwap: 'is choosing two cards to swap.'};
    hint = `${name(opp)} ${descriptions[s.phase] || 'is playing.'} You can match from your own hand.`;
  } else if (s.phase === 'draw') {
    hint = 'Tap the deck to draw, or take the face-up discard.';
    if (confirmCall) { heading = 'Call Cambio?'; hint = `${name(opp)} gets one final turn, including swaps.`; controls.push(action('yesCall', 'Yes, call Cambio', 'call', {}, true), control('noCall', 'Keep playing', () => { confirmCall = false; render(); })); }
    else controls.push(action('draw', 'Draw a card', 'draw', {}, true), ...(!s.caller ? [control('call', 'Call Cambio', () => { confirmCall = true; render(); }, {disabled: !connected})] : []));
  } else if (s.phase === 'holding') {
    heading = `You drew ${label(s.drawn)}`; hint = s.fromDiscard ? 'Choose one of your cards to replace. You must keep this pickup.' : 'Tap one of your cards to keep it there, or put your draw down.';
    if (!s.fromDiscard) controls.push(action('discard', 'Put it down', 'discard', {}, true));
  } else if (s.phase === 'self' || s.phase === 'opponent') {
    heading = s.phase === 'self' ? 'Look at one of yours' : 'Look at one of theirs'; hint = 'Tap ONE highlighted card. Only you will see its face.';
    controls.push(action('skip', 'Skip the look', 'skip'));
  } else if (s.phase === 'view') {
    heading = 'Your private look'; hint = 'Remember that card. Hide it when you are done.';
    controls.push(action('hide', 'Hide card', 'skip', {}, true));
  } else if (s.phase === 'queen') {
    heading = 'Queen · first, take a look'; hint = 'Tap ONE card on either side. Then choose any two to swap.'; steps = ['1 · Look', '2 · Choose pair', '3 · Swap'];
    controls.push(action('skip', 'Skip Queen', 'skip'));
  } else if (s.phase === 'queenView') {
    heading = 'Queen · remember this card'; hint = 'That was your one look. You can swap different cards afterwards.'; steps = ['1 · Look', '2 · Choose pair', '3 · Swap'];
    controls.push(action('hideQueen', 'Hide & choose cards', 'hideQueen', {}, true));
  } else if (['blind', 'queenSwap'].includes(s.phase)) {
    const both = picks.mine !== null && picks.theirs !== null;
    heading = both ? 'Swap these two?' : s.phase === 'blind' ? 'Jack · choose two cards' : 'Queen · choose your swap';
    hint = both ? 'Your two picks are marked. Confirm to move them.' : picks.mine !== null ? `Now choose one of ${name(opp)}’s cards.` : picks.theirs !== null ? 'Now choose one of your cards.' : 'Tap one card on each side, in either order. Both stay face down.';
    steps = [picks.mine !== null ? '✓ Your card' : '1 · Your card', picks.theirs !== null ? '✓ Their card' : '2 · Their card', '3 · Swap'];
    controls.push(action('swap', 'Swap selected cards', 'swap', {index: picks.mine, opponentIndex: picks.theirs}, true)); controls[0].disabled ||= !both;
    controls.push(action('skip', 'Skip swap', 'skip'));
  }
  text($('turnTag'), heading); text($('instruction'), hint);
  const stepKey = steps.join('|'); if ($('swapSteps').dataset.key !== stepKey) { $('swapSteps').dataset.key = stepKey; $('swapSteps').replaceChildren(); for (const item of steps) { const span = document.createElement('span'); span.textContent = item; span.classList.toggle('complete', item.startsWith('✓')); $('swapSteps').append(span); } }
  text($('powerLabel'), ''); setControls(controls);
  const recent = [...s.events].reverse().find(e => !['turn', 'hideStart', 'deal'].includes(e.kind)); text($('eventNote'), recent?.text || 'The table is ready.');
}
function rect(el) { if (!el) return null; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 ? {left: r.left, top: r.top, width: r.width, height: r.height} : null; }
function handEl(snapshot, owner, index) { return $(owner === snapshot.me ? 'myHand' : 'oppHand').children[index]; }
function capture(snapshot) {
  const boxes = {deck: rect($('deck')), discard: rect($('discard')), drawn: rect($('drawn')), hands: {louie: [], ariel: []}};
  if (snapshot) for (const owner of ['louie', 'ariel']) boxes.hands[owner] = snapshot.hands[owner].map((_, i) => rect(handEl(snapshot, owner, i)));
  return boxes;
}
async function animateEl(el, frames, options) {
  if (!el || reduced() || document.hidden || !el.animate) return;
  const animation = el.animate(frames, options); let watchdog;
  try { await Promise.race([animation.finished, new Promise(resolve => { watchdog = setTimeout(resolve, (options.duration || 0) + (options.delay || 0) + 120); })]); } catch {} finally { clearTimeout(watchdog); animation.cancel?.(); }
}
async function fly(c, from, target, {delay = 0, duration = 520, turn = 5, lift = 28} = {}) {
  const to = rect(target); if (!from || !to || reduced() || document.hidden) return;
  const floating = document.createElement('div'); card(floating, c); floating.classList.add('flying-card'); floating.style.cssText = `left:${from.left}px;top:${from.top}px;width:${from.width}px;height:${from.height}px;`;
  $('motionLayer').append(floating); const previousVisibility = target.style.visibility; target.style.visibility = 'hidden';
  const dx = to.left - from.left, dy = to.top - from.top;
  try { await animateEl(floating, [{transform: 'translate(0,0) rotate(0deg)', opacity: 1}, {transform: `translate(${dx * .48}px,${dy * .48 - lift}px) rotate(${turn}deg) scale(1.08)`, offset: .48, opacity: 1}, {transform: `translate(${dx}px,${dy}px) rotate(0deg) scale(${to.width / from.width},${to.height / from.height})`, opacity: 1}], {duration, delay, easing: 'cubic-bezier(.22,.68,.18,1)', fill: 'both'}); }
  finally { target.style.visibility = previousVisibility; floating.remove(); }
}
async function transition(e, before, next) {
  const boxes = capture(before);
  if (e.kind === 'score') {
    state = {...next, phase: 'reveal'}; render();
    const cards = [...$('myHand').children, ...$('oppHand').children];
    await Promise.all(cards.map((el, i) => animateEl(el, [{transform: 'rotateY(90deg)'}, {transform: 'rotateY(0deg)'}], {duration: 380, delay: i * 55, easing: 'ease-out'})));
    await sleep(600); state = next; render(); await animateEl($('results'), [{opacity: 0, transform: 'translateY(20px)'}, {opacity: 1, transform: 'translateY(0)'}], {duration: 360, easing: 'ease-out'}); return;
  }
  state = ['result', 'over'].includes(next.phase) ? {...next, phase: 'settling'} : next; render();
  if (e.kind === 'deal') {
    const from = rect($('deck')); const jobs = [];
    for (const [side, owner] of [other(next.me), next.me].entries()) for (let i = 0; i < next.hands[owner].length; i++) jobs.push(fly({hidden: true}, from, handEl(next, owner, i), {duration: 410, delay: (i * 2 + side) * 65, turn: side ? -7 : 7}));
    await Promise.all(jobs);
    for (const el of $('myHand').children) if (el.querySelector('.real-face')) await animateEl(el, [{transform: 'rotateY(90deg)'}, {transform: 'rotateY(0deg)'}], {duration: 200});
  } else if (e.kind === 'draw') {
    await fly({hidden: true}, boxes[e.from] || rect($(e.from)), $('drawn'), {duration: 540, turn: -10});
    if (next.turn === next.me) await animateEl($('drawn'), [{transform: 'rotateY(75deg)'}, {transform: 'rotateY(0deg)'}], {duration: 230});
  } else if (e.kind === 'discard') {
    await fly(e.card, boxes.drawn, $('discard'), {duration: 540, turn: 11});
  } else if (e.kind === 'replace') {
    await Promise.all([fly({hidden: true}, boxes.drawn, handEl(next, e.actor, e.index), {duration: 550, turn: -7}), fly(e.card, boxes.hands[e.actor][e.index], $('discard'), {duration: 580, turn: 9, lift: 45})]);
  } else if (e.kind === 'swap') {
    await Promise.all([fly({hidden: true}, boxes.hands[e.actor][e.index], handEl(next, other(e.actor), e.opponentIndex), {duration: 650, turn: -12, lift: 45}), fly({hidden: true}, boxes.hands[other(e.actor)][e.opponentIndex], handEl(next, e.actor, e.index), {duration: 650, turn: 12, lift: -35})]);
  } else if (e.kind === 'snap') {
    await fly(e.card, boxes.hands[e.actor][e.index], $('discard'), {duration: 460, turn: -8, lift: 40});
    await animateEl($('discard'), [{transform: 'scale(1.04)'}, {transform: 'scale(1)'}], {duration: 180});
  } else if (e.kind === 'penalty') {
    const chosen = handEl(next, e.actor, e.index), from = boxes.hands[e.actor][e.index];
    if (from && !document.hidden) { const proof = document.createElement('div'); card(proof, e.card); proof.classList.add('flying-card'); proof.style.cssText = `left:${from.left}px;top:${from.top}px;width:${from.width}px;height:${from.height}px;`; $('motionLayer').append(proof); chosen.style.visibility = 'hidden'; await animateEl(proof, [{transform: 'rotateY(80deg)'}, {transform: 'rotateY(0) translateX(-4px)'}, {transform: 'translateX(5px)'}, {transform: 'translateX(-4px)'}, {transform: 'rotateY(80deg)'}], {duration: 600}); proof.remove(); chosen.style.visibility = ''; }
    if (e.penaltyIndex != null) await fly({hidden: true}, boxes.deck, handEl(next, e.actor, e.penaltyIndex), {duration: 500, turn: 7});
  } else if (e.kind === 'peek') {
    const chosen = handEl(next, e.owner, e.index);
    await animateEl(chosen, [{transform: 'translateY(0) rotateY(75deg)'}, {transform: 'translateY(-9px) rotateY(0deg) scale(1.12)'}], {duration: 370, easing: 'cubic-bezier(.2,.8,.2,1)'});
  } else if (e.kind === 'hide' || e.kind === 'hideStart') {
    const cards = e.kind === 'hideStart' ? [...$(e.actor === next.me ? 'myHand' : 'oppHand').children].slice(2) : [...$('myHand').children, ...$('oppHand').children];
    await Promise.all(cards.map(el => animateEl(el, [{transform: 'rotateY(75deg)'}, {transform: 'rotateY(0deg)'}], {duration: 240})));
  } else if (e.kind === 'call') {
    await animateEl($('statusPanel'), [{boxShadow: '0 0 0 0 #e6ba5970', transform: 'scale(.98)'}, {boxShadow: '0 0 0 12px #e6ba5900', transform: 'scale(1)'}], {duration: 650});
  } else if (e.kind === 'turn') {
    await animateEl($('statusPanel'), [{opacity: .45, transform: 'translateY(4px)'}, {opacity: 1, transform: 'translateY(0)'}], {duration: 220});
  }
}
async function pump() {
  if (pumping) return; pumping = true;
  try {
    while (messages.length) {
      const job = messages.shift(); animating = job.events.length > 0; render();
      if (!job.events.length) { state = job.snapshot; render(); }
      for (const e of job.events) await transition(e, state, job.snapshot);
      if (job.events.length) state = job.snapshot;
    }
  } catch (error) { console.error('Cambio motion:', error); state = wire; }
  finally { pumping = false; animating = false; if (wire) state = wire; render(); flushSettings(); }
}
function receive(s) {
  const before = wire; wire = s;names=s.names||{louie:'Louie',ariel:'Ariel'};
  if (!before || before.round !== s.round || before.phase !== s.phase || before.turn !== s.turn) { picks = {mine: null, theirs: null}; matching = false; confirmCall = false; }
  if (picks.mine !== null && !s.hands[s.me][picks.mine]) picks.mine = null;
  if (picks.theirs !== null && !s.hands[other(s.me)][picks.theirs]) picks.theirs = null;
  if (!state) { state = s; seenSerial = s.serial; render(); return; }
  const events = s.events.filter(e => e.id > seenSerial); seenSerial = s.serial;
  messages.push({snapshot: s, events}); pump();
}
function flushSettings() { if (queuedSettings && !busy && !animating && wire?.phase === 'lobby') { const next = queuedSettings; queuedSettings = null; act('settings', next); } }
function settings() { const limit = Number($('limit').value); if (!Number.isSafeInteger(limit) || limit < 1) return; queuedSettings = {mode: $('mode').value, limit}; flushSettings(); }
$('mode').onchange = settings; $('limit').oninput = settings; $('limit').onchange = settings;
$('readyBtn').onclick = () => act('ready'); $('deck').onclick = () => act('draw'); $('discard').onclick = () => act('take');
$('matchBtn').onclick = () => { if (!busy && !animating) { matching = !matching; render(); } };
$('rulesBtn').onclick = () => $('rules').showModal(); $('closeRules').onclick = () => $('rules').close();
$('switchSeat').onclick = () => { $('table').hidden = true; $('setup').hidden = false; };
for (const b of document.querySelectorAll('[data-seat]')) b.onclick = () => join(b.dataset.seat);
socket.on('cambio:state', receive);
socket.on('cambio:seatLost', () => { state = wire = null; messages.length = 0; $('table').hidden = true; $('setup').hidden = false; toast('Your seat opened in another tab. Choose your seat here to return.'); });
socket.on('disconnect', () => { busy = false; pending = null; render(); });
socket.on('connect', () => { const last = seat || tabStorage('seat') || storage('seat'); if (tableId.startsWith('solo-'))join('louie');else if (last) join(last); });
document.addEventListener('visibilitychange', () => { $('motionLayer').hidden = document.hidden; render(); });

function startSolo(){let id;try{id=localStorage.getItem('cambio:solo-table');if(!id){id='solo-'+crypto.randomUUID();localStorage.setItem('cambio:solo-table',id);}}catch{id='solo-'+crypto.randomUUID();}location.assign('/cambio.html?table='+id);}
$('soloBtn').onclick=startSolo;$('lobbySoloBtn').onclick=startSolo;
$('headerSoloBtn').onclick=startSolo;
