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
  ['Hair', 'hat', 'Hat or cap', 'Are they wearing a hat?'], ['Accessories', 'sunglasses', 'Sunglasses', 'Are they wearing sunglasses?'],
  ['Accessories', 'eyewear', 'Any glasses', 'Are there glasses or sunglasses showing?'], ['Face', 'facialhair', 'Beard or stubble', 'Do they have a beard or stubble?'],
  ['Accessories', 'earrings', 'Earrings', 'Are they wearing earrings?'], ['Accessories', 'necklace', 'Necklace or chain', 'Are they wearing a necklace?'],
  ['Face', 'teeth', 'Smiling with teeth', 'Are they smiling with teeth?'], ['Hair', 'blonde', 'Blonde', 'Do they have blonde hair?'],
  ['Hair', 'grey', 'Grey or white', 'Do they have grey or white hair?'], ['Hair', 'curly', 'Curly', 'Do they have curly hair?'],
  ['Hair', 'long', 'Long, past shoulders', 'Is their hair long, past the shoulders?'], ['Hair', 'hairup', 'Tied up', 'Is their hair tied up?'],
  ['Clothes', 'blue', 'Blue or navy', 'Are they wearing blue?'],
].map(([cat, tag, label, text]) => ({ cat, tag, label, text }));
const CATS = ['Hair', 'Face', 'Accessories', 'Clothes'];

// Only photograph-verifiable features. Never infer age, eye colour, skin tone or gender.
const CATEGORIES = [
  {name:'Hair', icon:'💇', tags:['blonde','grey','curly','long','hairup']},
  {name:'Accessories',icon:'🕶️',tags:['hat','sunglasses','eyewear','earrings','necklace']},
  {name:'Facial hair',icon:'〰️',tags:['facialhair']},
  {name:'Headwear',icon:'🧢',tags:['hat']},
  {name:'Visible features',icon:'😊',tags:['teeth','blue']}
];
function categoryPicker(onQuestion, used = new Set()) {
  const dock = el('<div class="category-dock" aria-label="Question categories"></div>');
  for (const cat of CATEGORIES) {
    const b = el('<button class="category-btn" type="button"><span class="category-icon">'+cat.icon+'</span><span>'+cat.name+'</span></button>');
    b.onclick = () => {
      const overlay = el('<div class="category-overlay"><div class="category-shade"></div><section class="category-modal" role="dialog" aria-modal="true"><div class="category-head"><h2>'+cat.name+'</h2><button class="category-close" aria-label="Close">×</button></div><div class="category-choices"></div></section></div>');
      const close = () => overlay.remove();
      overlay.querySelector('.category-shade').onclick=close;
      overlay.querySelector('.category-close').onclick=close;
      const choices=overlay.querySelector('.category-choices');
      cat.tags.forEach(tag=>{
        const q=QUESTIONS.find(x=>x.tag===tag);
        if (!q) return;
        const option=el('<button type="button" class="category-choice"><span class="choice-symbol">'+({hat:'🧢',sunglasses:'🕶️',eyewear:'👓',earrings:'💍',necklace:'📿',facialhair:'〰️',teeth:'😁',blonde:'💛',grey:'🩶',curly:'➰',long:'💇',hairup:'🎀',blue:'👕'}[tag]||'❔')+'</span><span>'+q.label+'</span></button>');
        option.disabled=used.has(tag);
        option.onclick=()=>{close();onQuestion(q);};
        choices.append(option);
      });
      document.body.append(overlay);
    };
    dock.append(b);
  }
  return dock;
}
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
  // The whole board turns blue together (flipped-down cards too), so it never looks patchy.
  if (away) { if (lastAway) b.classList.add('away-board'); else requestAnimationFrame(() => requestAnimationFrame(() => b.classList.add('away-board'))); }
  lastAway = away;
  if (opts.enter) { const cs = [...b.querySelectorAll('.face:not(.down)')]; cs.forEach((c) => c.classList.add('away')); cs.forEach((c) => flipClass(c, 'away', false, Math.random() * 70)); }
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
// The computer's go: your board flips to blue backs, then their board takes its place and you
// watch them put faces down. Your board comes back (flipping up) on your turn.
function beginCpuTurn() {
  S.turn = 'cpu'; S.cpuStage = 'away'; S.cpuEntered = false; S.cpuMessage = ''; render();
  later(() => { if (S && S.turn === 'cpu') { S.cpuStage = 'theirs'; render(); } }, 700);
  later(cpuTurn, 1500);
}
function start(mine) {
  clearCpuTimers(); lastAway = false; flipStack = [];
  S = { phase: 'play', mine, secret: rnd(FACES).id, down: new Set(), cpuDown: new Set(), cpuLeft: FACES.map((f) => f.id), asked: new Set(), cpuAsked: new Set(), log: [], turn: 'you', guessing: false, over: null, cpuMessage: '', qa: null, cpuStage: null };
  beginCpuTurn();
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


// ---- bottom dock: whose turn, the question card with its answer stamp, and the actions ----
function dock({ pill, tone, qa, hint, actions, picker }) {
  const d = el(`<div class="dock tone-${tone || 'mine'}"><div class="dock-top"><span class="pill">${pill}</span><span class="dock-hint">${hint || ''}</span></div></div>`);
  if (qa) {
    const stamp = qa.ans === 'wait' ? '<span class="stamp wait"><i></i><i></i><i></i></span>' : qa.ans ? `<span class="stamp ${qa.ans}">${qa.ans === 'yes' ? 'Yes' : 'No'}</span>` : '';
    d.append(el(`<div class="qa"><div class="qa-main"><div class="qa-who">${qa.who}</div><div class="qa-text">${esc(qa.text)}</div></div>${stamp}</div>`));
  }
  if (picker) d.append(picker);
  const row = el('<div class="dock-actions"></div>');
  (actions || []).forEach((a) => row.append(a));
  d.append(row);
  return d;
}
const btn = (label, cls, fn) => { const b = el(`<button class="${cls || ''}">${label}</button>`); b.onclick = fn; return b; };
// Question picker: a bottom sheet with a tab per topic and one tidy row per question.
function openSheet({ asked, onPick, custom, onGuess }) {
  closeSheet();
  let cat = CATS[0];
  const sh = el('<div class="sheet-wrap"><div class="sheet-bg"></div><div class="sheet" role="dialog" aria-label="Ask a question"><div class="sheet-grab"></div><div class="tabs"></div><div class="rows"></div><div class="sheet-foot"></div></div></div>');
  const tabs = sh.querySelector('.tabs'), rows = sh.querySelector('.rows'), foot = sh.querySelector('.sheet-foot');
  const draw = () => {
    tabs.innerHTML = ''; rows.innerHTML = '';
    CATS.forEach((c) => { const t = el(`<button class="tab${c === cat ? ' on' : ''}">${c}</button>`); t.onclick = () => { cat = c; draw(); }; tabs.append(t); });
    QUESTIONS.filter((q) => q.cat === cat).forEach((q) => {
      const r = el(`<button class="row-q"${asked && asked.has(q.tag) ? ' disabled' : ''}><span>${q.label}</span><i>${asked && asked.has(q.tag) ? 'asked' : '›'}</i></button>`);
      r.onclick = () => { closeSheet(); onPick(q.text); }; rows.append(r);
    });
  };
  draw();
  if (custom) {
    const f = el('<form class="own"><input maxlength="90" placeholder="Or type your own yes/no question" autocomplete="off"><button>Ask</button></form>');
    f.onsubmit = (e) => { e.preventDefault(); const v = f.querySelector('input').value.trim(); if (v) { closeSheet(); onPick(v); } };
    foot.append(f);
  }
  sh.querySelector('.sheet-bg').onclick = closeSheet;
  document.body.append(sh);
  requestAnimationFrame(() => sh.classList.add('open'));
}
function closeSheet() { document.querySelectorAll('.sheet-wrap').forEach((n) => n.remove()); }

const face = (id) => FACES.find((f) => f.id === id);
function render() {
  closeSheet();
  app.innerHTML = '';
  document.body.classList.toggle('has-dock', !S.over);
  if (S.over) {
    const p = el('<div class="panel"></div>');
    p.append(el(`<h2>${S.over.win ? 'You win' : 'You lose'}</h2>`), el(`<p class="msg">${S.over.text}</p>`),
      el(`<img class="secret" src="${face(S.secret).src}" alt="">`));
    p.append(btn('Play again', '', pickSecret)); app.append(p);
  }
  if (!S.over && S.turn === 'cpu' && S.cpuStage === 'theirs') {
    // Their board, face up, so you can see what they put down.
    app.append(el('<div class="board-title">Computer’s board</div>'));
    app.append(board({ down: S.cpuDown, away: false, enter: !S.cpuEntered, tap: () => {} }));
    S.cpuEntered = true;
  } else {
    app.append(board({ down: S.down, mine: S.mine, away: S.turn === 'cpu' && !S.over, enter: S.enterMine, tap: (id) => {
      if (S.over || (S.turn !== 'you' && S.turn !== 'eliminate')) return;
      if (S.guessing) return guess(id);
      toggleCard(id, S.down, app);
    } }));
    S.enterMine = false;
  }
  if (S.over) return;
  let d;
  if (S.turn === 'eliminate') {
    d = dock({ pill: 'Your move', qa: S.qa, hint: 'Tap faces to put them down',
      actions: [btn('Undo', 'alt', () => undoFlip(S.down, app)), btn('End turn', 'main', () => beginCpuTurn())] });
  } else if (S.turn === 'you') {
    d = S.guessing
      ? dock({ pill: 'Your guess', qa: S.qa, hint: 'Tap the face you think it is', actions: [btn('Cancel', 'alt', () => { S.guessing = false; render(); })] })
      : dock({ pill: 'Your turn', qa: S.qa, hint: '',
          actions: [btn('Guess face', 'alt', () => { S.guessing = true; render(); })], picker: categoryPicker(ask, S.asked) });
  } else {
    d = dock({ pill: 'Computer’s turn', tone: 'theirs', qa: S.qa, hint: S.cpuMessage || '', actions: [] });
  }
  app.append(d);
}
function ask(q) {
  const yes = face(S.secret).tags.has(q.tag);
  S.asked.add(q.tag); flipStack = [];
  S.qa = { who: 'You asked', text: q.text, ans: yes ? 'yes' : 'no' };
  S.turn = 'eliminate'; render();
}
function guess(id) {
  if (id === S.secret) S.over = { win: true, text: 'Correct! It was ' + face(id).name + '.' };
  else { S.qa = { who: 'You guessed', text: 'Is it ' + face(id).name + '?', ans: 'no' }; S.guessing = false; return beginCpuTurn(); }
  render();
}
function cpuTurn() {
  if (!S || S.over || S.turn !== 'cpu') return;
  if (S.cpuLeft.length === 1) {
    const g = S.cpuLeft[0];
    S.qa={who:'Computer guesses',text:'Is it '+face(g).name+'?',ans:'wait'}; S.cpuMessage='';
    render();
    later(() => { if (g === S.mine) S.over = {win:false,text:'The computer found your secret face.'}; else { S.cpuLeft = S.cpuLeft.filter(x=>x!==g); S.qa.ans='no'; } finishCpu(); }, 1200);
    return;
  }
  const half = S.cpuLeft.length / 2;
  const opts = QUESTIONS.filter(q=>!S.cpuAsked.has(q.tag)).map(q=>{
    const n=S.cpuLeft.filter(id=>face(id).tags.has(q.tag)).length;
    return {q,n,d:Math.abs(n-half)};
  }).filter(o=>o.n>0 && o.n<S.cpuLeft.length).sort((a,b)=>a.d-b.d);
  if (!opts.length) {
    const g=rnd(S.cpuLeft); S.qa={who:'Computer guesses',text:'Is it '+face(g).name+'?',ans:'wait'}; S.cpuMessage=''; render();
    later(()=>{if(g===S.mine)S.over={win:false,text:'The computer found your secret face.'};else { S.cpuLeft=S.cpuLeft.filter(x=>x!==g); S.qa.ans='no'; } finishCpu();},1100);
    return;
  }
  const {q}=opts[0], yes=face(S.mine).tags.has(q.tag);
  S.cpuAsked.add(q.tag);
  S.qa={who:'Computer asks',text:q.text,ans:'wait'}; S.cpuMessage='';
  render();
  later(()=>{
    S.qa={who:'Computer asks',text:q.text,ans:yes?'yes':'no'}; S.cpuMessage='Flipping cards…';
    const removed=S.cpuLeft.filter(id=>face(id).tags.has(q.tag)!==yes);
    S.cpuLeft=S.cpuLeft.filter(id=>face(id).tags.has(q.tag)===yes);
    render();
    removed.forEach((id,i)=>later(()=>{
      if(!S || S.over)return;
      S.cpuDown.add(id);
      flipClass(app.querySelector('.board .face[data-face="'+id+'"]'), 'down', true);
    },350+i*140));
    later(finishCpu,650+removed.length*140);
  },1400);
}
function finishCpu() {
  if (!S || S.over) { if(S)render(); return; }
  S.turn='you'; S.cpuStage=null; S.enterMine=true; S.guessing=false; render();
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
  closeSheet();
  const st = D.st, me = NAME[st.me], opp = NAME[st.opponent];
  app.innerHTML = '';
  document.body.classList.toggle('has-dock', st.phase === 'play');
  const top = el(`<div class="topline"><span>${NAME.louie} <b>${st.record.louie}</b> – <b>${st.record.ariel}</b> ${NAME.ariel}</span></div>`);
  top.append(btn('Leave', 'linkbtn', home));
  app.append(top);
  const logQA = (l) => !l ? null : l.wrong ? { who: `${NAME[l.by]} guessed`, text: `Is it ${face(l.guess)?.name || '?'}?`, ans: 'no' } : { who: `${NAME[l.by]} asked`, text: l.q, ans: l.yes ? 'yes' : 'no' };
  let showBoard = true;
  if (st.phase === 'waiting') {
    const p = el('<div class="panel"></div>');
    p.append(el(`<h2>Hi ${me}</h2>`), el(`<p class="msg">Waiting for ${opp} to open Guess Who and tap “I’m ${opp}”…</p>`)); app.append(p); showBoard = false;
  } else if (st.phase === 'pick') {
    const p = el('<div class="panel"></div>');
    p.append(el(`<h2>${st.mySecret === null ? 'Pick your secret face' : 'Secret picked'}</h2>`),
      el(`<p class="msg">${st.mySecret === null ? `Tap the face ${opp} has to find.` : st.opponentPicked ? 'Starting…' : `Waiting for ${opp} to pick…`}</p>`)); app.append(p);
  } else if (st.phase === 'over') {
    const won = st.winner === st.me;
    const p = el('<div class="panel"></div>');
    p.append(el(`<h2>${won ? 'You win' : `${opp} wins`}</h2>`),
      el(`<p class="msg">${won ? `You found ${opp}’s face.` : `${opp} found your face.`} ${opp}’s secret was ${face(st.opponentSecret)?.name}.</p>`),
      el(`<img class="secret" src="${face(st.opponentSecret)?.src}" alt="">`));
    p.append(btn('Play again', '', () => sock.emit('gw:again'))); app.append(p); showBoard = false;
  }
  if (showBoard) app.append(board({ down: D.down, mine: st.mySecret, away: st.phase === 'play' && st.turn !== st.me && st.step !== 'answer', tap: (id) => {
    if (st.phase === 'pick') { if (st.mySecret === null) sock.emit('gw:pick', { id }); return; }
    if (st.turn !== st.me) return;
    if (D.guessing && st.step === 'ask') { D.guessing = false; return sock.emit('gw:guess', { id }); }
    if (st.step === 'flip') toggleCard(id, D.down, app);
  } }));
  if (st.phase !== 'play') return;
  const mine = st.turn === st.me, last = logQA(st.log[st.log.length - 1]);
  let d;
  if (mine && st.step === 'ask') {
    d = D.guessing
      ? dock({ pill: 'Your guess', qa: last, hint: `Tap the face you think is ${opp}’s`, actions: [btn('Cancel', 'alt', () => { D.guessing = false; duoRender(); })] })
      : dock({ pill: 'Your turn', qa: last, actions: [btn('Guess face', 'alt', () => { D.guessing = true; duoRender(); })], picker: categoryPicker(q => sock.emit('gw:ask', { text: q.text })) });
  } else if (mine && st.step === 'answer') {
    d = dock({ pill: 'Your turn', qa: { who: 'You asked', text: st.question, ans: 'wait' }, hint: `Waiting for ${opp}`, actions: [] });
  } else if (mine && st.step === 'flip') {
    d = dock({ pill: 'Your move', qa: last, hint: 'Tap faces to put them down',
      actions: [btn('Undo', 'alt', () => undoFlip(D.down, app)), btn('End turn', 'main', () => sock.emit('gw:done'))] });
  } else if (!mine && st.step === 'answer') {
    d = dock({ pill: `${opp} asks`, tone: 'theirs', qa: { who: `${opp} asked`, text: st.question, ans: null }, hint: 'Answer about your face (yellow border)',
      actions: [btn('Yes', 'yes-btn', () => sock.emit('gw:answer', { yes: true })), btn('No', 'no-btn', () => sock.emit('gw:answer', { yes: false }))] });
  } else {
    d = dock({ pill: `${opp}’s turn`, tone: 'theirs', qa: last, hint: st.step === 'flip' ? `${opp} is flipping cards…` : `${opp} is choosing a question…`, actions: [] });
  }
  app.append(d);
}
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

home();
