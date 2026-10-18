'use strict';
// Faces are numbered photos in /guesswho/NN.webp. Each lists only features that
// are clearly visible, so the computer can answer questions honestly. To add a
// face, add the photo and one entry here; set `name` to show a name.
const F = (id, tags, name) => ({ id, tags: new Set(tags.split(' ').filter(Boolean)), name: name || '#' + id, src: '/guesswho/' + String(id).padStart(2, '0') + '.webp?v=8' });
const FACES = [
  F(1, 'teeth necklace blonde', 'Sue'), F(2, 'earrings curly grey', 'Grams'), F(3, 'teeth earrings blue', 'Susan'),
  F(4, 'hat sunglasses eyewear facialhair blue', 'Karim'), F(5, 'hat sunglasses eyewear teeth', 'Luca'), F(6, 'facialhair', 'Casey'),
  F(7, 'blonde long', 'Emily'), F(8, 'teeth facialhair curly', 'Louie'), F(9, 'hat teeth facialhair necklace', 'Lawrence'),
  F(10, 'hat teeth necklace blonde', 'Nanna'), F(11, 'teeth earrings necklace eyewear blonde hairup', 'Dani B'), F(12, 'long', 'Becca P'),
  F(13, 'teeth necklace curly long', 'Becca L'), F(14, 'teeth earrings long', 'Ariel'), F(15, 'earrings blonde long hairup', 'Jess'),
  F(16, 'teeth facialhair', 'Josh M'), F(17, 'facialhair', 'Josh B'), F(18, 'hat teeth curly blue', 'Harry'),
  F(19, 'teeth earrings necklace long', 'Dani K'), F(20, 'hat teeth curly blue', 'Zac'), F(21, 'sunglasses eyewear teeth necklace curly long blue', 'Shaine'),
  F(22, 'earrings', 'Rachael'), F(23, 'teeth earrings necklace', 'Izzy'), F(24, 'teeth long', 'Grace'), F(25, 'teeth blue', 'Rob'), F(26, 'teeth necklace', 'Cameron'), F(27, '', 'Jiggle'), F(28, 'teeth blue', 'Jared'), F(29, 'necklace', 'Jake'), F(30, 'teeth curly', 'Zach S'),
];
const QUESTIONS = [
  ['hat', 'Wearing a hat or cap?'], ['sunglasses', 'Wearing sunglasses?'], ['eyewear', 'Any glasses or sunglasses showing?'],
  ['facialhair', 'Beard, stubble or moustache?'], ['earrings', 'Earrings showing?'], ['necklace', 'Necklace or chain showing?'],
  ['teeth', 'Smiling with teeth showing?'], ['blonde', 'Blonde hair?'], ['grey', 'Grey or white hair?'], ['curly', 'Curly hair?'],
  ['long', 'Long hair past the shoulders?'], ['hairup', 'Hair tied up?'], ['blue', 'Wearing blue or navy?'],
].map(([tag, text]) => ({ tag, text }));
const app = document.getElementById('app');
const rnd = (a) => a[Math.floor(Math.random() * a.length)];
const el = (h) => { const t = document.createElement('template'); t.innerHTML = h.trim(); return t.content.firstChild; };
let S;
let cpuTimers = [];
const later = (fn, ms) => { const t = setTimeout(fn, ms); cpuTimers.push(t); };
const clearCpuTimers = () => { cpuTimers.forEach(clearTimeout); cpuTimers = []; };

// A fresh random board order every game, so the faces are always mixed up.
let LAYOUT = FACES.slice();
function reshuffle() { for (let i = LAYOUT.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [LAYOUT[i], LAYOUT[j]] = [LAYOUT[j], LAYOUT[i]]; } }
function board(opts) {
  const b = el('<div class="board"></div>');
  for (const f of LAYOUT) {
    const c = el(`<button class="face" data-face="${f.id}" aria-label="${f.name}"><img src="${f.src}" alt="" loading="lazy"><span class="n">${f.name}</span></button>`);
    if (opts.down && opts.down.has(f.id)) c.classList.add('down');
    if (opts.mine === f.id) c.classList.add('mine');
    c.onclick = () => opts.tap(f.id);
    b.append(c);
  }
  const away = !!opts.away;
  awayCards(b, away, away !== lastAway);
  lastAway = away;
  return b;
}
function home() {
  clearCpuTimers(); duoLeave(); lastAway = false; flipStack = [];
  S = null; app.innerHTML = '';
  app.append(el(`<div class="panel"><h2>Guess Who?</h2><p class="msg">${FACES.length} faces. Work out their secret face before they work out yours.</p>
    <div class="row"><button id="vs">Play the computer</button><button class="alt" id="ip">Play a friend in person</button></div>
    <p class="msg" style="margin-top:14px">Two phones, one game. Who are you?</p>
    <div class="row"><button id="iL">I’m Louie</button><button id="iA">I’m Ariel</button></div></div>`));
  document.getElementById('iL').onclick = () => duo('louie');
  document.getElementById('iA').onclick = () => duo('ariel');
  document.getElementById('vs').onclick = pickSecret;
  document.getElementById('ip').onclick = inPerson;
}
// ---- in person: shared board, players ask each other out loud ----
function inPerson() {
  reshuffle();
  S = { down: new Set(), mine: null };
  const draw = () => {
    app.innerHTML = '';
    app.append(el('<div class="panel"><h2>In person</h2><p class="msg">Tap a face to flip it down or up. Ask each other yes/no questions out loud. Tap “Pick my secret” and keep the screen hidden.</p><div class="row"><button id="rs">Pick my secret</button><button class="alt" id="reset">Flip all up</button><button class="alt" id="h">Home</button></div><p class="msg" id="sec"></p></div>'));
    app.append(board({ down: S.down, mine: S.mine, tap: (id) => { toggleCard(id, S.down, app); } }));
    document.getElementById('rs').onclick = () => { const f = rnd(FACES); alert('Your secret face is ' + f.name + '. Memorise it, then press OK.'); };
    document.getElementById('reset').onclick = () => { S.down.clear(); draw(); };
    document.getElementById('h').onclick = home;
  };
  draw();
}
// ---- vs computer ----
function pickSecret() {
  reshuffle();
  clearCpuTimers();
  S = { phase: 'pick' };
  app.innerHTML = '';
  app.append(el('<div class="panel"><h2>Pick your secret face</h2><p class="msg">Tap the face the computer has to find. Keep it in mind.</p></div>'));
  app.append(board({ tap: (id) => start(id) }));
}
function start(mine) {
  clearCpuTimers(); lastAway = false; flipStack = [];
  S = { phase: 'play', mine, secret: rnd(FACES).id, down: new Set(), cpuDown: new Set(), cpuLeft: FACES.map((f) => f.id), asked: new Set(), cpuAsked: new Set(), log: [], turn: 'cpu', guessing: false, over: null, cpuMessage: 'Computer is choosing a question…', cpuAnswer: '', lastAnswer: '' };
  render(); later(cpuTurn, 850);
}

// ---- card flip, timed from a 60fps frame breakdown of the reference video ----
// ~12 frames: card lifts and grows 4-6%, squashes to edge-on over 3 frames, the
// back opens over ~5 frames with a slight overshoot, then settles.
const FLIP_OUT = 110, FLIP_IN = 85;
const reduceMotion = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
function flipClass(card, cls, on, delay = 0) {
  if (!card) return;
  const apply = () => card.classList.toggle(cls, on);
  if (reduceMotion() || !card.animate) return apply();
  setTimeout(() => {
    card.getAnimations().forEach((a) => a.cancel());
    const out = card.animate([
      { transform: 'translateY(0) scale(1,1)' },
      { transform: 'translateY(-3%) scale(1.04,1.06)', offset: 0.5 },
      { transform: 'translateY(-3%) scale(0.02,1.06)' },
    ], { duration: FLIP_OUT, easing: 'ease-in', fill: 'forwards' });
    out.onfinish = () => {
      apply();
      const back = card.animate([
        { transform: 'translateY(-3%) scale(0.02,1.06)' },
        { transform: 'translateY(-1%) scale(1.03,1.03)', offset: 0.62 },
        { transform: 'translateY(0) scale(1,1)' },
      ], { duration: FLIP_IN, easing: 'ease-out' });
      back.onfinish = () => { out.cancel(); };
    };
  }, delay);
}
let flipStack = [];
function toggleCard(id, set, root) {
  const down = !set.has(id);
  if (down) { set.add(id); flipStack.push(id); } else { set.delete(id); flipStack = flipStack.filter((x) => x !== id); }
  flipClass(root.querySelector('.board:not(.opponent-board) .face[data-face="' + id + '"]'), 'down', down);
}
function undoFlip(set, root) {
  const id = flipStack.pop();
  if (id === undefined) return;
  set.delete(id);
  flipClass(root.querySelector('.board:not(.opponent-board) .face[data-face="' + id + '"]'), 'down', false);
}
// Turn change: every face-up card flips to its back together (and back again on your turn).
let lastAway = false;
function awayCards(boardEl, away, animate) {
  const cards = [...boardEl.querySelectorAll('.face:not(.down)')];
  cards.forEach((c) => { if (animate) c.classList.toggle('away', !away); else c.classList.toggle('away', away); });
  if (animate) cards.forEach((c) => flipClass(c, 'away', away, Math.random() * 70));
}

function opponentBoard() {
  const wrap = el('<section class="opponent-wrap"><div class="opponent-title">COMPUTER’S BOARD <span id="cpu-count"></span></div></section>');
  const b = el('<div class="opponent-board" aria-label="Computer board facing away"></div>');
  for (const f of LAYOUT) { const c = el('<div class="opponent-card" data-cpu="'+f.id+'"><span>?</span></div>'); if (S.cpuDown.has(f.id)) c.classList.add('down'); b.append(c); }
  wrap.append(b); return wrap;
}
const face = (id) => FACES.find((f) => f.id === id);
function render() {
  app.innerHTML = '';
  const p = el('<div class="panel"></div>');
  if (S.over) {
    p.append(el(`<h2>${S.over.win ? '🎉 You win!' : '😬 You lose'}</h2>`), el(`<p class="msg">${S.over.text}</p>`),
      el(`<img class="secret" src="${face(S.secret).src}" alt="">`));
    const again = el('<button>Play again</button>'); again.onclick = pickSecret; p.append(again);
  } else if (S.turn === 'eliminate') {
    p.append(el('<h2>Your move</h2><p class="msg">'+S.lastAnswer+' Tap each face you want to put down. Then end your turn.</p>'));
    const undo = el('<button class="alt undo" aria-label="Undo last flip">↶ Undo</button>'); undo.onclick = () => undoFlip(S.down, app); p.append(undo);
    const done = el('<button class="end-turn">Done flipping · Computer’s turn →</button>'); done.onclick = () => { S.turn='cpu'; S.cpuMessage='Computer is choosing a question…'; render(); later(cpuTurn, 750); }; p.append(done);
  } else if (S.turn === 'you') {
    p.append(el('<h2>Your turn</h2>'));
    if (S.guessing) p.append(el('<p class="msg">Tap the face you think is the computer’s secret.</p>'));
    else {
      p.append(el('<p class="msg">Ask a question about the computer’s secret face:</p>'));
      const qs = el('<div class="qs"></div>');
      for (const q of QUESTIONS) { const b = el(`<button class="alt">${q.text}</button>`); b.disabled = S.asked.has(q.tag); b.onclick = () => ask(q); qs.append(b); }
      p.append(qs);
    }
    const g = el(`<button style="margin-top:8px">${S.guessing ? 'Cancel guess' : 'Make a guess'}</button>`);
    g.onclick = () => { S.guessing = !S.guessing; render(); }; p.append(g);
  }
  if (S.log.length) { const l = el('<div class="log"></div>'); S.log.slice(-6).forEach((t) => l.append(el(`<div>${t}</div>`))); p.append(l); }
  if (!S.over && S.turn === 'cpu') p.append(el('<p class="msg cpu-question">'+(S.cpuMessage || 'Computer is thinking…')+'</p>'));
  if (!S.over) app.append(opponentBoard());
  app.append(p);
  app.append(board({ down: S.down, mine: S.mine, away: S.turn === 'cpu' && !S.over, tap: (id) => {
    if (S.over || (S.turn !== 'you' && S.turn !== 'eliminate')) return;
    if (S.guessing) return guess(id);
    toggleCard(id, S.down, app);
  } }));
  app.append(el('<p class="msg" style="opacity:.7">Your secret face has a yellow border. Faces you flip down are out.</p>'));
}
function ask(q) {
  const yes = face(S.secret).tags.has(q.tag);
  S.asked.add(q.tag); flipStack = [];
  S.log.push(`You: ${q.text} <span class="${yes ? 'yes' : 'no'}">${yes ? 'YES' : 'NO'}</span>`);
  S.lastAnswer = `Answer: <strong class="${yes ? 'yes' : 'no'}">${yes ? 'YES' : 'NO'}</strong>. Your turn to flip down faces.`;
  S.turn = 'eliminate'; render();
}
function guess(id) {
  if (id === S.secret) S.over = { win: true, text: 'Correct! It was ' + face(id).name + '.' };
  else { S.log.push(`You guessed ${face(id).name}: <span class="no">wrong</span>`); S.guessing = false; S.turn = 'cpu'; render(); return later(cpuTurn, 900); }
  render();
}
function cpuTurn() {
  if (!S || S.over || S.turn !== 'cpu') return;
  if (S.cpuLeft.length === 1) {
    const g = S.cpuLeft[0];
    S.cpuMessage = 'Computer guesses '+face(g).name+'…';
    render();
    later(() => { if (g === S.mine) S.over = {win:false,text:'The computer found your secret face.'}; else S.cpuLeft = S.cpuLeft.filter(x=>x!==g); finishCpu(); }, 1200);
    return;
  }
  const half = S.cpuLeft.length / 2;
  const opts = QUESTIONS.filter(q=>!S.cpuAsked.has(q.tag)).map(q=>{
    const n=S.cpuLeft.filter(id=>face(id).tags.has(q.tag)).length;
    return {q,n,d:Math.abs(n-half)};
  }).filter(o=>o.n>0 && o.n<S.cpuLeft.length).sort((a,b)=>a.d-b.d);
  if (!opts.length) {
    const g=rnd(S.cpuLeft); S.cpuMessage='Computer guesses '+face(g).name+'…'; render();
    later(()=>{if(g===S.mine)S.over={win:false,text:'The computer found your secret face.'};else S.cpuLeft=S.cpuLeft.filter(x=>x!==g);finishCpu();},1100);
    return;
  }
  const {q}=opts[0], yes=face(S.mine).tags.has(q.tag);
  S.cpuAsked.add(q.tag);
  S.cpuMessage='Computer asks: “'+q.text+'”';
  render();
  later(()=>{
    S.cpuMessage='Your answer: '+(yes?'YES':'NO')+' · Computer is flipping cards…';
    const removed=S.cpuLeft.filter(id=>face(id).tags.has(q.tag)!==yes);
    S.cpuLeft=S.cpuLeft.filter(id=>face(id).tags.has(q.tag)===yes);
    S.log.push('Computer: '+q.text+' <span class="'+(yes?'yes':'no')+'">'+(yes?'YES':'NO')+'</span>');
    render();
    removed.forEach((id,i)=>later(()=>{
      if(!S || S.over)return;
      S.cpuDown.add(id);
      flipClass(app.querySelector('[data-cpu="'+id+'"]'), 'down', true);
    },350+i*140));
    later(finishCpu,650+removed.length*140);
  },1400);
}
function finishCpu() {
  if (!S || S.over) { if(S)render(); return; }
  S.turn='you'; S.guessing=false; render();
}

// ---- two phones: "I'm Louie" / "I'm Ariel" ----
const NAME = { louie: 'Louie', ariel: 'Ariel' };
let D = null, sock = null;
function duoLeave() { if (sock) { sock.emit('gw:leave'); sock.off('gw:state'); } D = null; }
function duo(who) {
  if (typeof io === 'undefined') { alert('Could not connect. Reload and try again.'); return; }
  sock = sock || io();
  lastAway = false; flipStack = [];
  D = { who, st: null, down: new Set(), guessing: false, shuffledFor: null, prevStep: null };
  sock.off('gw:state');
  sock.on('gw:state', (st) => { if (!D) return; onDuoState(st); });
  const join = () => sock.emit('gw:join', { who }, (r) => {
    if (r && r.ok) return;
    app.innerHTML = '';
    app.append(el(`<div class="panel"><h2>${NAME[who]} is already playing</h2><p class="msg">That seat is taken on another phone. If that was you, close the other page and try again.</p><button id="back">Back</button></div>`));
    document.getElementById('back').onclick = home;
  });
  sock.off('connect'); sock.on('connect', () => { if (D) join(); });
  app.innerHTML = '<div class="panel"><p class="msg">Connecting…</p></div>';
  join();
}
function onDuoState(st) {
  const fresh = st.phase === 'pick' && st.mySecret === null;
  if (fresh && D.shuffledFor !== 'pick') { reshuffle(); D.down.clear(); D.guessing = false; }
  D.shuffledFor = st.phase;
  if (st.step === 'flip' && D.prevStep !== 'flip') flipStack = [];
  D.prevStep = st.step;
  D.st = st; duoRender();
}
function duoRender() {
  const st = D.st, me = NAME[st.me], opp = NAME[st.opponent];
  app.innerHTML = '';
  const p = el('<div class="panel"></div>');
  const back = el('<button class="alt" style="margin-top:10px">Leave game</button>'); back.onclick = home;
  const rec = el(`<p class="msg">${NAME.louie} ${st.record.louie} – ${st.record.ariel} ${NAME.ariel}</p>`);
  const lastLog = st.log[st.log.length - 1];
  const logLine = (l) => l.wrong ? `${NAME[l.by]} guessed ${face(l.guess)?.name || '?'}: <span class="no">wrong</span>` : `${NAME[l.by]}: ${esc(l.q)} <span class="${l.yes ? 'yes' : 'no'}">${l.yes ? 'YES' : 'NO'}</span>`;
  let showBoard = true;
  if (st.phase === 'waiting') {
    p.append(el(`<h2>Hi ${me}</h2>`), el(`<p class="msg">Waiting for ${opp} to open Guess Who and tap “I’m ${opp}”…</p>`)); showBoard = false;
  } else if (st.phase === 'pick') {
    p.append(el(`<h2>${st.mySecret === null ? 'Pick your secret face' : 'Secret picked'}</h2>`),
      el(`<p class="msg">${st.mySecret === null ? `Tap the face ${opp} has to find.` : st.opponentPicked ? 'Starting…' : `Waiting for ${opp} to pick…`}</p>`));
    if (st.mySecret !== null) showBoard = true;
  } else if (st.phase === 'over') {
    const won = st.winner === st.me;
    p.append(el(`<h2>${won ? '🎉 You win!' : `😬 ${opp} wins`}</h2>`),
      el(`<p class="msg">${won ? `You found ${opp}’s face.` : `${opp} found your face.`} ${opp}’s secret was ${face(st.opponentSecret)?.name}.</p>`),
      el(`<img class="secret" src="${face(st.opponentSecret)?.src}" alt="">`), rec);
    const again = el('<button>Play again</button>'); again.onclick = () => sock.emit('gw:again'); p.append(again); showBoard = false;
  } else {
    const mine = st.turn === st.me;
    if (mine && st.step === 'ask') {
      p.append(el('<h2>Your turn</h2>'));
      if (D.guessing) p.append(el(`<p class="msg">Tap the face you think is ${opp}’s secret.</p>`));
      else {
        p.append(el(`<p class="msg">Ask ${opp} a yes/no question about their face:</p>`));
        const row = el('<div class="row"><input id="q" maxlength="90" placeholder="Type your own question…" style="flex:1 1 200px;font:inherit;padding:11px;border-radius:7px;border:1px solid #555d65;background:#1f242b;color:#f5f2e9"><button id="send">Ask</button></div>');
        p.append(row);
        const qs = el('<div class="qs" style="margin-top:8px"></div>');
        for (const q of QUESTIONS) { const b = el(`<button class="alt">${q.text}</button>`); b.onclick = () => sock.emit('gw:ask', { text: q.text }); qs.append(b); }
        p.append(qs);
        setTimeout(() => { const send = () => { const v = document.getElementById('q').value.trim(); if (v) sock.emit('gw:ask', { text: v }); }; document.getElementById('send').onclick = send; document.getElementById('q').onkeydown = (e) => { if (e.key === 'Enter') send(); }; }, 0);
      }
      const g = el(`<button style="margin-top:8px">${D.guessing ? 'Cancel guess' : 'Make a guess'}</button>`);
      g.onclick = () => { D.guessing = !D.guessing; duoRender(); }; p.append(g);
    } else if (mine && st.step === 'answer') {
      p.append(el('<h2>Your turn</h2>'), el(`<p class="msg cpu-question">You asked: “${esc(st.question)}” — waiting for ${opp}…</p>`));
    } else if (mine && st.step === 'flip') {
      p.append(el('<h2>Your move</h2>'), el(`<p class="msg">${opp} answered <strong class="${lastLog?.yes ? 'yes' : 'no'}">${lastLog?.yes ? 'YES' : 'NO'}</strong>. Tap each face you want to put down, then end your turn.</p>`));
      const undo = el('<button class="alt undo" aria-label="Undo last flip">↶ Undo</button>'); undo.onclick = () => undoFlip(D.down, app); p.append(undo);
      const done = el(`<button class="end-turn">Done flipping · ${opp}’s turn →</button>`); done.onclick = () => sock.emit('gw:done'); p.append(done);
    } else if (!mine && st.step === 'answer') {
      p.append(el(`<h2>${opp} asks</h2>`), el(`<p class="msg cpu-question">“${esc(st.question)}”</p>`), el('<p class="msg">Answer honestly about your secret face (yellow border).</p>'));
      const row = el('<div class="row"><button id="y">YES</button><button class="alt" id="n">NO</button></div>');
      p.append(row);
      setTimeout(() => { document.getElementById('y').onclick = () => sock.emit('gw:answer', { yes: true }); document.getElementById('n').onclick = () => sock.emit('gw:answer', { yes: false }); }, 0);
    } else {
      p.append(el(`<h2>${opp}’s turn</h2>`), el(`<p class="msg cpu-question">${st.step === 'flip' ? `${opp} is flipping cards…` : `${opp} is choosing a question…`}</p>`));
    }
    if (st.log.length) { const l = el('<div class="log"></div>'); st.log.slice(-5).forEach((x) => l.append(el(`<div>${logLine(x)}</div>`))); p.append(l); }
    p.append(rec);
  }
  p.append(back);
  app.append(p);
  if (showBoard) app.append(board({ down: D.down, mine: st.mySecret, away: st.phase === 'play' && st.turn !== st.me && st.step !== 'answer', tap: (id) => {
    if (st.phase === 'pick') { if (st.mySecret === null) sock.emit('gw:pick', { id }); return; }
    if (st.turn !== st.me) return;
    if (D.guessing && st.step === 'ask') { D.guessing = false; return sock.emit('gw:guess', { id }); }
    if (st.step === 'flip') toggleCard(id, D.down, app);
  } }));
}
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

home();
