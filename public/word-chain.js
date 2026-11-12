'use strict';
(() => {
  const $ = id => document.getElementById(id), socket = io(), names = {louie: 'Louie', ariel: 'Ariel'};
  const params = new URLSearchParams(location.search), table = /^qa-[a-z0-9-]{6,60}$/.test(params.get('table') || '') ? params.get('table') : 'main';
  const prefix = `wordchain:${table}:`;
  const storage = (key, value) => { try { if (value === undefined) return localStorage.getItem(prefix + key); localStorage.setItem(prefix + key, value); } catch {} return null; };
  const tabSeat = value => { try { if (value === undefined) return sessionStorage.getItem(prefix + 'seat'); sessionStorage.setItem(prefix + 'seat', value); } catch {} return null; };
  let s = null, seat = null, busy = false, joined = false, toastTimer, draftTimer, draftDirty = false, editorKey = '', settingsDirty = false, count = 8, lastBoard = '', seenRevision = -1;
  function toast(message) { $('toast').textContent = message; $('toast').classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 4000); }
  function join(who) {
    if (!socket.connected) { toast('Connecting. Try again in a moment.'); return; }
    seat = who;
    socket.timeout(7000).emit('wordchain:join', {who, table, token: storage('token:' + who)}, (error, r) => {
      if (error || !r?.ok) { joined = false; toast(r?.error || 'Could not connect. Try again.'); return; }
      storage('token:' + who, r.token); storage('seat', who); tabSeat(who); storage('lastPlayer', who); joined = true; render();
    });
  }
  function act(action, extra = {}, done) {
    if (busy || !s || !joined || !socket.connected) return;
    busy = true; render();
    const id = crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);
    socket.timeout(7000).emit('wordchain:action', {action, revision: s.revision, id, ...extra}, (error, r) => {
      busy = false;
      if (error || !r?.ok) toast(r?.error || 'Connection interrupted. Your game is saved. Reconnect to check the board.');
      render();
      if (!error && r?.ok) done?.();
    });
  }
  const show = (id, yes) => { $(id).hidden = !yes; };
  const text = (id, value) => { if ($(id).textContent !== value) $(id).textContent = value; };
  function paintCounts() {
    $('counts').replaceChildren(...[5,6,7,8,9,10].map(n => {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = n; b.setAttribute('aria-pressed', String(n === count)); b.disabled = busy || !s || s.online.length !== 2;
      b.onclick = () => { count = n; settingsDirty = true; paintCounts(); renderSetup(); }; return b;
    }));
  }
  function renderSetup() {
    const both = s.online.length === 2;
    if (!settingsDirty) { count = s.settings.count; $('mode').value = s.settings.mode; $('starter').value = s.settings.starter; }
    $('settingsFields').disabled = busy || !both;
    show('starterField', $('mode').value === 'competitive');
    text('modeNote', $('mode').value === 'manual' ? `${names[s.creator]} writes and hosts. ${names[s.creator === 'louie' ? 'ariel' : 'louie']} solves. Roles swap next round.` : 'Both guess. Wrong or reveal means swap turns. A fresh chain each round.');
    text('presence', both ? `${names[seat]} + ${names[seat === 'louie' ? 'ariel' : 'louie']}. Both here.` : `Waiting for ${names[seat === 'louie' ? 'ariel' : 'louie']} to join…`);
    text('agreement', s.agreed.length ? `${s.agreed.map(p => names[p]).join(' + ')} agreed${settingsDirty ? ' to the previous settings' : ''}.` : 'Both players need to agree.');
    $('propose').disabled = busy || !both; $('agree').disabled = busy || !both || settingsDirty || s.agreed.includes(seat);
    $('start').disabled = busy || !both || settingsDirty || s.agreed.length !== 2;
    paintCounts();
  }
  function currentDraft() { return [...$('wordInputs').querySelectorAll('input')].map(el => el.value); }
  function preview() {
    const words = currentDraft();
    $('preview').replaceChildren(...words.map((w, i) => { const li = document.createElement('li'); li.textContent = i === 0 ? w.toUpperCase() || 'FIRST WORD' : (w.trim()[0]?.toUpperCase() || '?'); return li; }));
    [...$('wordInputs').querySelectorAll('.join-words')].forEach((el, i) => { el.textContent = `${words[i].toUpperCase() || '…'} + ${words[i+1].toUpperCase() || '…'}`; });
  }
  function saveDraft() {
    if (!draftDirty || busy || !joined || !socket.connected || s?.phase !== 'create' || s.creator !== seat) return;
    const words = currentDraft();
    act('draft', {words}, () => { if (JSON.stringify(words) === JSON.stringify(currentDraft())) { draftDirty = false; text('saved', 'Draft saved. Only you can see it.'); } });
  }
  function renderEditor() {
    const key = `${s.round}:${s.creator}:${s.settings.count}`;
    if (key !== editorKey) {
      editorKey = key; draftDirty = false; $('confirmChain').checked = false;
      $('wordInputs').replaceChildren(...Array.from({length:s.settings.count}, (_, i) => {
        const row = document.createElement('div'), label = document.createElement('label'), input = document.createElement('input');
        label.htmlFor = `word-${i}`; label.textContent = `Word ${i+1}`;
        if (!i) { const small = document.createElement('small'); small.textContent = 'The starting word'; label.append(small); }
        input.id = `word-${i}`; input.value = s.draft?.[i] || ''; input.maxLength = 32; input.required = true; input.autocomplete = 'off'; input.spellcheck = false; input.setAttribute('autocorrect','off'); input.setAttribute('autocapitalize','characters'); input.enterKeyHint = i === s.settings.count - 1 ? 'done' : 'next';
        input.oninput = () => { draftDirty = true; text('saved', 'Saving draft…'); preview(); clearTimeout(draftTimer); draftTimer = setTimeout(saveDraft, 800); };
        input.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); if (i < s.settings.count - 1) $(`word-${i+1}`).focus(); else $('confirmChain').focus(); } };
        row.append(label, input); if (i < s.settings.count-1) { const connection = document.createElement('p'); connection.className = 'join-words'; row.append(connection); } return row;
      })); preview(); text('saved', 'Your draft saves as you type.');
    }
    $('lock').disabled = busy || !socket.connected;
  }
  function paintBoard(id, board) {
    $(id).replaceChildren(...board.map(w => { const li = document.createElement('li'); li.textContent = w.text; li.className = w.status; if (w.status === 'current') li.setAttribute('aria-current','step'); return li; }));
  }
  function render() {
    show('connection', !socket.connected);
    show('welcome', !joined); show('game', joined && !!s);
    if (!s || !joined) return;
    text('round', s.round ? `Round ${s.round}` : 'Your table'); text('score', `LOUIE ${s.scores.louie} | ARIEL ${s.scores.ariel}`);
    ['setup','creation','play','results'].forEach(id => show(id, s.phase === ({creation:'create',results:'result'}[id] || id)));
    if (s.phase === 'setup') renderSetup();
    if (s.phase === 'create') {
      const host = seat === s.creator;
      text('createTitle', host ? 'Create your chain.' : `${names[s.creator]} is creating…`);
      text('createNote', host ? 'Each neighbouring pair should make a familiar phrase. Use single words, like BIRD → BATH → TIME.' : 'Your first word will appear when the host locks it in.');
      show('editor', host); if (host) renderEditor();
    }
    if (s.phase === 'play') {
      const active = s.turn === seat, manual = s.settings.mode === 'manual', both = s.online.length === 2, can = active && both && !s.dispute && socket.connected && !busy;
      text('turn', `${names[s.turn].toUpperCase()}’S TURN`); $('turn').classList.toggle('mine', active);
      text('role', manual ? `${names[s.creator]} hosts · ${names[s.turn]} solves` : 'Correct means keep going.');
      const boardKey = JSON.stringify(s.board); if (boardKey !== lastBoard) { paintBoard('board', s.board); lastBoard = boardKey; }
      text('message', both ? s.message : 'Paused. Waiting for your partner to reconnect.');
      show('guessForm', active); show('thinking', !active || !!s.dispute);
      text('thinking', s.dispute ? 'Waiting for the host’s decision…' : `${names[s.turn]} is thinking…`);
      text('prompt', `What comes after ${s.board[s.index - 1]?.text}?`);
      $('guess').disabled = !can; $('guessBtn').disabled = !can; $('hint').disabled = !can || !s.canHint;
      text('hintNote', !s.canHint ? 'One letter left. Have a guess.' : manual ? 'A hint reveals one letter. The final letter is yours to guess.' : 'Reveal a letter and pass the turn.');
      show('dispute', s.canDispute); $('dispute').disabled = busy || !both;
      show('judging', !!s.dispute && seat === s.creator); text('disputedGuess', s.dispute ? `${names[s.dispute.who]} guessed “${s.dispute.guess}”.` : '');
      $('approve').disabled = $('reject').disabled = busy || !both;
    }
    if (s.phase === 'result') {
      text('winner', `${names[s.winner]} wins.`); text('finishedBy', `${names[s.winner]} completed the final word.`); paintBoard('fullChain', s.board);
      const rows = [['Total guesses', s.totalGuesses],['Louie’s correct guesses',s.correct.louie],['Ariel’s correct guesses',s.correct.ariel],['Letters revealed',s.hints]];
      $('stats').replaceChildren(...rows.flatMap(([label,value]) => { const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=value;return [dt,dd]; }));
      $('rematch').disabled = busy || s.ready.includes(seat) || s.online.length !== 2;
      text('rematchNote', s.ready.includes(seat) ? 'Rematch requested. Waiting for your partner…' : s.ready.length ? `${names[s.ready[0]]} wants to play again.` : 'Both tap Play Again. The chain creator swaps next round.');
    }
  }
  document.querySelectorAll('[data-seat]').forEach(b => b.onclick = () => join(b.dataset.seat));
  $('mode').onchange = $('starter').onchange = () => { settingsDirty = true; renderSetup(); };
  $('settingsForm').onsubmit = e => { e.preventDefault(); act('settings', {count, mode:$('mode').value, starter:$('starter').value}, () => { settingsDirty = false; }); };
  $('agree').onclick = () => act('agree'); $('start').onclick = () => act('start');
  $('editor').onsubmit = e => { e.preventDefault(); clearTimeout(draftTimer); act('lock', {words:currentDraft(), confirmed:$('confirmChain').checked}, () => { $('wordInputs').replaceChildren(); $('preview').replaceChildren(); editorKey=''; draftDirty=false; }); };
  $('guessForm').onsubmit = e => { e.preventDefault(); const guess=$('guess').value.trim(); if (!guess) { toast('Enter a guess first.'); $('guess').focus(); return; } act('guess', {guess}, () => { $('guess').value=''; if (s.phase === 'play' && s.turn === seat) $('guess').focus(); }); };
  $('hint').onclick = () => act('hint'); $('dispute').onclick = () => act('dispute'); $('approve').onclick = () => act('judge',{approve:true}); $('reject').onclick = () => act('judge',{approve:false}); $('rematch').onclick = () => act('rematch');
  $('switch').onclick = () => { socket.disconnect(); joined=false; seat=null; s=null; tabSeat(''); storage('seat',''); socket.connect(); render(); };
  $('rulesOpen').onclick = () => $('rules').showModal(); $('rulesClose').onclick = () => $('rules').close();
  socket.on('connect', () => { const saved = seat || tabSeat() || storage('seat') || (()=>{try{return localStorage.getItem('cambio:main:seat') || localStorage.getItem('cambio:seat');}catch{return null;}})(); if (names[saved]) join(saved); render(); });
  socket.on('disconnect', () => { busy=false; render(); });
  socket.on('wordchain:seatLost', () => { joined=false; toast('This player was opened in another tab. Continue there or take your seat again.'); render(); });
  socket.on('wordchain:state', next => {
    const previous=s; s=next; joined=true; seat=next.me;
    if (next.revision !== seenRevision) {
      if (previous?.phase === 'play' && next.index !== previous.index && !matchMedia('(prefers-reduced-motion: reduce)').matches) navigator.vibrate?.(15);
      seenRevision=next.revision;
    }
    render();
  });
  window.addEventListener('online',saveDraft); document.addEventListener('visibilitychange',()=>{if(document.hidden)saveDraft();});
  setInterval(()=>{if(draftDirty)saveDraft();},2000);
  render();
})();
