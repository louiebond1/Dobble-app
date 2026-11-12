'use strict';
(() => {
  const $ = id => document.getElementById(id), socket = io(), names = {louie: 'Louie', ariel: 'Ariel'};
  const params = new URLSearchParams(location.search), table = /^qa-[a-z0-9-]{6,60}$/.test(params.get('table') || '') ? params.get('table') : 'main';
  const prefix = `wordchain:${table}:`;
  const storage = (key, value) => { try { if (value === undefined) return localStorage.getItem(prefix + key); localStorage.setItem(prefix + key, value); } catch {} return null; };
  const tabSeat = value => { try { if (value === undefined) return sessionStorage.getItem(prefix + 'seat'); sessionStorage.setItem(prefix + 'seat', value); } catch {} return null; };
  let s = null, seat = null, busy = false, joined = false, toastTimer, draftTimer, draftDirty = false, editorKey = '', settingsDirty = false, count = 8, lastBoard = '', seenRevision = -1, joiningWho = null;
  function toast(message) { $('toast').textContent = message; $('toast').classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 4000); }
  function join(who) {
    if (!socket.connected) { toast('Connecting. Try again in a moment.'); return; }
    joiningWho = who; render();
    socket.timeout(7000).emit('wordchain:join', {who, table, token: storage('token:' + who)}, (error, r) => {
      joiningWho = null;
      if (error || !r?.ok) { toast(r?.error || 'Could not connect. Try again.'); render(); return; }
      seat = who;
      storage('token:' + who, r.token); storage('seat', who); tabSeat(who); storage('lastPlayer', who); joined = true; render();
    });
  }
  function act(action, extra = {}, done) {
    if (busy || !s || !joined || !socket.connected) return;
    busy = true; render();
    const id = crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);
    socket.timeout(7000).emit('wordchain:action', {action, revision:s.revision, round:s.round, draftVersion:s.draftVersion, id, ...extra}, (error, r) => {
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
      const b = document.createElement('button'); b.type = 'button'; b.textContent = n; b.setAttribute('aria-pressed', String(n === count)); b.disabled = busy;
      b.onclick = () => { count = n; settingsDirty = true; paintCounts(); renderSetup(); }; return b;
    }));
  }
  function renderSetup() {
    if (s && joined && !settingsDirty) { count=s.settings.count; $('starter').value=s.settings.starter; }
    $('settingsFields').disabled=busy;
    for(const b of document.querySelectorAll('[data-seat]')) {
      b.setAttribute('aria-pressed',String(joined && seat===b.dataset.seat));
      b.disabled=busy || !!joiningWho;
    }
    $('start').disabled=busy || !!joiningWho || !socket.connected || !joined;
    const partner=seat==='louie'?'ariel':'louie';
    const mine=joined && s?.agreed.includes(seat) && !settingsDirty;
    text('homeStatus', joiningWho ? `Taking ${names[joiningWho]}’s seat…` : !joined ? 'Choose your name to play.' : mine ? `You’re ready. Waiting for ${names[partner]}…` : s?.agreed.includes(partner) && !settingsDirty ? `${names[partner]} is ready. Tap Start Game.` : s?.online.includes(partner) ? 'Both here. Let’s play.' : `Waiting for ${names[partner]} to join.`);
    paintCounts();
  }
  function currentDraft() { return [...$('wordInputs').querySelectorAll('input')].map(el => el.value); }
  function preview() {
    const words = currentDraft();
    $('preview').replaceChildren(...words.map((w, i) => { const li = document.createElement('li'); li.textContent = i === 0 ? w.toUpperCase() || 'FIRST WORD' : (w.trim()[0]?.toUpperCase() || '?'); return li; }));
    [...$('wordInputs').querySelectorAll('.join-words')].forEach((el, i) => { el.textContent = `${words[i].toUpperCase() || '…'} + ${words[i+1].toUpperCase() || '…'}`; });
  }
  function saveDraft() {
    if (!draftDirty || busy || !joined || !socket.connected || s?.phase !== 'create' || !s.canCreate) return;
    const words = currentDraft();
    act('draft', {words}, () => { if (JSON.stringify(words) === JSON.stringify(currentDraft())) { draftDirty = false; text('saved', 'Draft saved. Only you can see it.'); } });
  }
  function renderEditor() {
    const key = `${s.round}:${seat}:${s.settings.count}`;
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
    $(id).replaceChildren(...board.map(w => { const li = document.createElement('li'); li.textContent = w.text; li.className = w.status; if(w.text.length>13) li.classList.add('long-word'); if (w.status === 'current') li.setAttribute('aria-current','step'); return li; }));
  }
  function render() {
    show('connection', !socket.connected);
    const home=!joined || !s || s.phase==='setup';
    show('home',home); show('game',!home); document.body.classList.toggle('on-home',home); text('brand',home?'A + L':'Word Chain');
    if(home){renderSetup();return;}
    text('round', `ROUND ${s.round || 1} · ${s.settings.count} WORDS`); text('score', `Louie ${s.scores.louie} : ${s.scores.ariel} Ariel`);
    document.body.dataset.turn = s.phase === 'play' ? s.turn : '';
    const boardKey = JSON.stringify(s.boards);
    for (const player of ['louie','ariel']) {
      const active = s.phase === 'play' && s.turn === player;
      const status = !s.online.includes(player) ? 'Offline · saved' : s.phase === 'play' ? active ? 'Your turn' : 'Waiting' : s.phase === 'result' ? s.winner === player ? 'Round winner' : 'Next one’s yours' : s.phase === 'create' ? s.locked.includes(player) ? 'Chain locked' : 'Writing a chain' : s.agreed.includes(player) ? 'Ready to play' : 'At the table';
      text(player+'Status',status); text(player+'Wins',`${s.scores[player]} won`);
      $(player+'Side').classList.toggle('active',active);
      $(player+'Side').setAttribute('aria-label',`${names[player]}${seat===player?' (you)':''}, ${status}`);
      show(player+'Board',['play','result'].includes(s.phase)); show(player+'Progress',['play','result'].includes(s.phase));
      if(boardKey !== lastBoard) paintBoard(player+'Board',s.boards[player]);
      const solved=s.boards[player].filter(w=>w.status==='complete').length;
      text(player+'Progress',`${solved} of ${s.settings.count}`);
    }
    lastBoard = boardKey;
    show('turn', s.phase==='play');
    ['creation','play','results'].forEach(id => show(id, s.phase === ({creation:'create',results:'result'}[id] || id)));
    if (s.phase === 'create') {
      text('createTitle',s.canCreate ? `Make ${names[seat==='louie'?'ariel':'louie']}’s chain.` : 'Your chain is locked.');
      text('createNote',s.canCreate ? 'Write a chain for your partner to solve. Each pair must make a familiar phrase, like BIRD → BATH → TIME.' : 'Waiting for your partner to lock theirs. Your answers stay hidden.');
      show('editor',s.canCreate); if(s.canCreate) renderEditor();
    }
    if (s.phase === 'play') {
      const active = s.turn === seat, manual = s.settings.mode === 'manual', both = s.online.length === 2, can = active && both && !s.dispute && socket.connected && !busy;
      text('turn', `${names[s.turn]}’s turn`);
      show('role',!!s.legacy); text('role',s.legacy ? 'Finishing your shared round. Two chains start next round.' : '');
      text('message', both ? s.message : 'Paused. Waiting for your partner to reconnect.');
      show('guessForm', active); show('thinking', !active || !!s.dispute);
      text('thinking', s.dispute ? 'Waiting for your partner’s decision…' : `${names[s.turn]} is thinking…`);
      text('prompt', `What follows ${s.boards[seat][s.indices[seat]-1]?.text}, ${names[seat]}?`);
      $('guess').disabled = !can; $('guessBtn').disabled = !can; $('hint').disabled = !can || !s.canHint;
      text('hintNote', !s.canHint ? 'One letter left. Have a guess.' : 'Reveal a letter and pass the turn.');
      show('dispute', s.canDispute); $('dispute').disabled = busy || !both;
      show('judging', s.canJudge); text('disputedGuess', s.dispute ? `${names[s.dispute.who]} guessed “${s.dispute.guess}”.` : '');
      $('approve').disabled = $('reject').disabled = busy || !both;
    }
    if (s.phase === 'result') {
      text('winner', `${names[s.winner]} wins.`); text('finishedBy', `${names[s.winner]} completed the final word.`);
      const rows = [['Total guesses', s.totalGuesses],['Louie’s correct guesses',s.correct.louie],['Ariel’s correct guesses',s.correct.ariel],['Letters revealed',s.hints]];
      $('stats').replaceChildren(...rows.flatMap(([label,value]) => { const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=value;return [dt,dd]; }));
      $('rematch').disabled = busy || s.ready.includes(seat) || s.online.length !== 2;
      text('rematchNote', s.ready.includes(seat) ? 'Rematch requested. Waiting for your partner…' : s.ready.length ? `${names[s.ready[0]]} wants to play again.` : 'Both tap Play Again. Make fresh chains for each other.');
    }
  }
  document.querySelectorAll('[data-seat]').forEach(b => b.onclick = () => join(b.dataset.seat));
  $('starter').onchange = () => { settingsDirty=true; renderSetup(); };
  $('start').onclick = () => act('readyToStart',{count,starter:$('starter').value},()=>{settingsDirty=false;render();});
  $('editor').onsubmit = e => { e.preventDefault(); clearTimeout(draftTimer); act('lock', {words:currentDraft(), confirmed:$('confirmChain').checked}, () => { $('wordInputs').replaceChildren(); $('preview').replaceChildren(); editorKey=''; draftDirty=false; }); };
  $('guessForm').onsubmit = e => { e.preventDefault(); const guess=$('guess').value.trim(); if (!guess) { toast('Enter a guess first.'); $('guess').focus(); return; } act('guess', {guess}, () => { $('guess').value=''; if (s.phase === 'play' && s.turn === seat) $('guess').focus(); }); };
  $('hint').onclick = () => act('hint'); $('dispute').onclick = () => act('dispute'); $('approve').onclick = () => act('judge',{approve:true}); $('reject').onclick = () => act('judge',{approve:false}); $('rematch').onclick = () => act('rematch');
  $('rulesOpen').onclick = () => $('rules').showModal(); $('rulesClose').onclick = () => $('rules').close();
  socket.on('connect', () => { const saved = seat || tabSeat() || storage('seat') || (()=>{try{return localStorage.getItem('cambio:main:seat') || localStorage.getItem('cambio:seat');}catch{return null;}})(); if (names[saved]) join(saved); render(); });
  socket.on('disconnect', () => { busy=false; render(); });
  socket.on('wordchain:seatLost', () => { joined=false; toast('This player was opened in another tab. Continue there or take your seat again.'); render(); });
  socket.on('wordchain:state', next => {
    const previous=s; s=next; joined=true; seat=next.me;
    if (next.revision !== seenRevision) {
      if (previous?.phase === 'play' && next.indices?.[seat] !== previous.indices?.[seat] && !matchMedia('(prefers-reduced-motion: reduce)').matches) navigator.vibrate?.(15);
      seenRevision=next.revision;
    }
    render();
  });
  window.addEventListener('online',saveDraft); document.addEventListener('visibilitychange',()=>{if(document.hidden)saveDraft();});
  setInterval(()=>{if(draftDirty)saveDraft();},2000);
  render();
})();
