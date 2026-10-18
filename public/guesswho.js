'use strict';
// Faces are numbered photos in /guesswho/NN.webp. Each lists only features that
// are clearly visible, so the computer can answer questions honestly. To add a
// face, add the photo and one entry here; set `name` to show a name.
const F = (id, tags, name) => ({ id, tags: new Set(tags.split(' ').filter(Boolean)), name: name || '#' + id, src: '/guesswho/' + String(id).padStart(2, '0') + '.webp' });
const FACES = [
  F(1, 'teeth necklace blonde'), F(2, 'earrings curly grey'), F(3, 'teeth earrings blue'),
  F(4, 'hat sunglasses eyewear facialhair blue'), F(5, 'hat sunglasses eyewear teeth'), F(6, 'facialhair'),
  F(7, 'blonde long'), F(8, 'teeth facialhair curly'), F(9, 'hat teeth facialhair necklace'),
  F(10, 'hat teeth necklace blonde'), F(11, 'teeth earrings necklace eyewear blonde hairup'), F(12, 'long'),
  F(13, 'teeth necklace curly long'), F(14, 'teeth earrings long'), F(15, 'earrings blonde long hairup'),
  F(16, 'teeth facialhair'), F(17, 'facialhair'), F(18, 'hat teeth curly blue'),
  F(19, 'teeth earrings necklace long'), F(20, 'hat teeth curly blue'), F(21, 'sunglasses eyewear teeth necklace curly long blue'),
  F(22, 'earrings'), F(23, 'teeth earrings necklace'), F(24, 'teeth long'), F(25, 'teeth blue'),
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

function board(opts) {
  const b = el('<div class="board"></div>');
  for (const f of FACES) {
    const c = el(`<button class="face" aria-label="Face ${f.id}"><img src="${f.src}" alt="" loading="lazy"><span class="n">${f.name}</span></button>`);
    if (opts.down && opts.down.has(f.id)) c.classList.add('down');
    if (opts.mine === f.id) c.classList.add('mine');
    c.onclick = () => opts.tap(f.id);
    b.append(c);
  }
  return b;
}
function home() {
  S = null; app.innerHTML = '';
  app.append(el(`<div class="panel"><h2>Guess Who?</h2><p class="msg">${FACES.length} faces. Work out their secret face before they work out yours.</p>
    <div class="row"><button id="vs">Play the computer</button><button class="alt" id="ip">Play a friend in person</button></div></div>`));
  document.getElementById('vs').onclick = pickSecret;
  document.getElementById('ip').onclick = inPerson;
}
// ---- in person: shared board, players ask each other out loud ----
function inPerson() {
  S = { down: new Set(), mine: null };
  const draw = () => {
    app.innerHTML = '';
    app.append(el('<div class="panel"><h2>In person</h2><p class="msg">Tap a face to flip it down or up. Ask each other yes/no questions out loud. Tap “Pick my secret” and keep the screen hidden.</p><div class="row"><button id="rs">Pick my secret</button><button class="alt" id="reset">Flip all up</button><button class="alt" id="h">Home</button></div><p class="msg" id="sec"></p></div>'));
    app.append(board({ down: S.down, mine: S.mine, tap: (id) => { S.down.has(id) ? S.down.delete(id) : S.down.add(id); draw(); } }));
    document.getElementById('rs').onclick = () => { const f = rnd(FACES); alert('Your secret face is #' + f.id + '. Memorise it, then press OK.'); };
    document.getElementById('reset').onclick = () => { S.down.clear(); draw(); };
    document.getElementById('h').onclick = home;
  };
  draw();
}
// ---- vs computer ----
function pickSecret() {
  S = { phase: 'pick' };
  app.innerHTML = '';
  app.append(el('<div class="panel"><h2>Pick your secret face</h2><p class="msg">Tap the face the computer has to find. Keep it in mind.</p></div>'));
  app.append(board({ tap: (id) => start(id) }));
}
function start(mine) {
  S = { phase: 'play', mine, secret: rnd(FACES).id, down: new Set(), cpuLeft: FACES.map((f) => f.id), asked: new Set(), cpuAsked: new Set(), log: [], turn: 'you', guessing: false, over: null };
  render();
}
const face = (id) => FACES.find((f) => f.id === id);
function render() {
  app.innerHTML = '';
  const p = el('<div class="panel"></div>');
  if (S.over) {
    p.append(el(`<h2>${S.over.win ? '🎉 You win!' : '😬 You lose'}</h2>`), el(`<p class="msg">${S.over.text}</p>`),
      el(`<img class="secret" src="${face(S.secret).src}" alt="">`));
    const again = el('<button>Play again</button>'); again.onclick = pickSecret; p.append(again);
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
  if (!S.over && S.turn === 'cpu') p.append(el('<p class="msg">Computer is thinking…</p>'));
  app.append(p);
  app.append(board({ down: S.down, mine: S.mine, tap: (id) => {
    if (S.over || S.turn !== 'you') return;
    if (S.guessing) return guess(id);
    S.down.has(id) ? S.down.delete(id) : S.down.add(id); render();
  } }));
  app.append(el('<p class="msg" style="opacity:.7">Your secret face has a yellow border. Faces you flip down are out.</p>'));
}
function ask(q) {
  const yes = face(S.secret).tags.has(q.tag);
  S.asked.add(q.tag);
  S.log.push(`You: ${q.text} <span class="${yes ? 'yes' : 'no'}">${yes ? 'YES' : 'NO'}</span>`);
  // Auto flip the faces ruled out; they can be flipped back by tapping.
  for (const f of FACES) if (f.id !== S.mine && f.tags.has(q.tag) !== yes) S.down.add(f.id);
  S.turn = 'cpu'; render(); setTimeout(cpuTurn, 900);
}
function guess(id) {
  if (id === S.secret) S.over = { win: true, text: 'Correct! It was face #' + id + '.' };
  else { S.log.push(`You guessed #${id}: <span class="no">wrong</span>`); S.guessing = false; S.turn = 'cpu'; render(); return setTimeout(cpuTurn, 900); }
  render();
}
function cpuTurn() {
  if (S.over) return;
  if (S.cpuLeft.length === 1) {
    const g = S.cpuLeft[0];
    if (g === S.mine) S.over = { win: false, text: `The computer guessed face #${g}, your secret.` };
    return finishCpu();
  }
  // Ask the question that splits the remaining faces closest to half.
  const half = S.cpuLeft.length / 2;
  const opts = QUESTIONS.filter((q) => !S.cpuAsked.has(q.tag)).map((q) => {
    const n = S.cpuLeft.filter((id) => face(id).tags.has(q.tag)).length;
    return { q, n, d: Math.abs(n - half) };
  }).filter((o) => o.n > 0 && o.n < S.cpuLeft.length).sort((a, b) => a.d - b.d);
  if (!opts.length) { const g = rnd(S.cpuLeft); S.log.push(`Computer guessed #${g}: <span class="no">wrong</span>`); S.cpuLeft = S.cpuLeft.filter((x) => x !== g); return finishCpu(); }
  const { q } = opts[0];
  const yes = face(S.mine).tags.has(q.tag);
  S.cpuAsked.add(q.tag);
  S.cpuLeft = S.cpuLeft.filter((id) => face(id).tags.has(q.tag) === yes);
  S.log.push(`Computer: ${q.text} <span class="${yes ? 'yes' : 'no'}">${yes ? 'YES' : 'NO'}</span> (your secret)`);
  finishCpu();
}
function finishCpu() { if (!S.over) S.turn = 'you'; S.guessing = false; render(); }
home();
