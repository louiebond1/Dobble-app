// Draft Night client. Game state lives on the Draft Night API (a Railway function); this page renders it.
(function () {
  'use strict';
  var params = new URLSearchParams(location.search);
  var API = params.get('api') || 'https://draft-night-web-production.up.railway.app';
  var app = document.getElementById('app');
  var BUDGETS = [5, 10, 15, 20, 50, 100];
  var FALLBACK_PRESETS = [
    { id: 'house', title: 'Dream House', emoji: '🏡', mode: 'property', noun: 'home', label: 'Upgrade', startLabel: 'Home', hasBases: true, base: null, maxPlayers: 6 },
    { id: 'pancakes', title: 'Pancakes', emoji: '🥞', mode: 'build', noun: 'breakfast plate', label: 'Topping', startLabel: 'Base', hasBases: true, base: { name: 'Empty plate' }, maxPlayers: 6 },
    { id: 'burger', title: 'Burgers', emoji: '🍔', mode: 'build', noun: 'burger', label: 'Topping', startLabel: 'Burger', hasBases: true, base: { name: 'Empty bun' }, maxPlayers: 6 },
    { id: 'pizza', title: 'Pizza', emoji: '🍕', mode: 'build', noun: 'pizza', label: 'Topping', startLabel: 'Pizza', hasBases: true, base: { name: 'Empty peel' }, maxPlayers: 6 },
    { id: 'gaming', title: 'Gaming Setup', emoji: '🎮', mode: 'build', noun: 'gaming setup', label: 'Upgrade', startLabel: 'Setup', hasBases: true, base: { name: 'Empty room' }, maxPlayers: 6 },
    { id: 'garage', title: 'Dream Garage', emoji: '🏎️', mode: 'collection', noun: 'garage', label: 'Car', startLabel: 'Garage', hasBases: true, base: { name: 'No garage yet' }, maxPlayers: 6 }
  ];

  var store = {
    get: function (k, d) { try { var v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  };
  var legacyName = (function () { try { return localStorage.getItem('draft-night-person'); } catch (e) { return null; } })();

  var ui = {
    view: 'home',
    presets: FALLBACK_PRESETS,
    name: store.get('dn-name', legacyName || ''),
    names: store.get('dn-names', ['Louie', 'Ariel']),
    themeId: store.get('dn-theme', 'house'),
    custom: null, customTopic: '', asking: false, ambiguous: null, askError: '',
    auctionCount: store.get('dn-auction-count', 0), players: store.get('dn-players', 2), cpu: store.get('dn-cpu', false), budget: store.get('dn-budget', 100),
    busy: false, error: '', joinCode: (params.get('room') || '').toUpperCase().slice(0, 4),
    tab: 'create', open: null, openErr: false, editName: false, joining: '', listed: store.get('dn-listed', true)
  };
  // A random id for this phone, so joining the same game again returns your own seat instead of adding you twice.
  var device = store.get('dn-device', '');
  if (!device) { device = (Date.now().toString(36) + Math.random().toString(36).slice(2, 10)); store.set('dn-device', device); }
  var openTimer = null;
  var session = store.get('dn-session', null); // { code, player, token }
  var room = null, offset = 0, pollTimer = null, built = false, sending = false;
  var shown = {};   // world image currently on screen per player: key

  // ---------- helpers ----------
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function $(sel) { return document.querySelector(sel); }
  function money(n) { return '£' + n; }
  function now() { return Date.now() + offset; }
  function imgUrl(key) { return API + '/api/img?code=' + encodeURIComponent(room.code) + '&k=' + encodeURIComponent(key); }
  function toast(msg) {
    var t = document.getElementById('toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toast.t); toast.t = setTimeout(function () { t.hidden = true; }, 2200);
  }
  function api(path, body) {
    return fetch(API + path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {})
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { d._status = r.status; return d; }); });
  }
  function theme() {
    if (ui.custom && ui.themeId === ui.custom.id) return ui.custom;
    return ui.presets.filter(function (p) { return p.id === ui.themeId; })[0] || ui.presets[0];
  }
  function seats() { return ui.cpu ? 2 : ui.players; }
  function auctionTotal() { return ui.auctionCount || seats() * 5; }
  function patch(el, html) { if (el && el.__html !== html) { el.innerHTML = html; el.__html = html; } }
  function lotName(i) { return room.lots[i] ? room.lots[i].name : ''; }
  function me() { return session ? session.player : -1; }
  // What the opening lots are called for a theme ("Home", "Burger", "Base"…), and whether it has them.
  function startWord(t) { return (t && t.startLabel) || 'Home'; }
  function hasStarts(t) { return !!(t && (t.hasBases || t.mode === 'property')); }

  // Swap an <img> only once the next picture has fully loaded, so the last good image stays visible.
  function showImage(img, url) {
    if (!img || img.dataset.want === url) return;
    img.dataset.want = url;
    var next = new Image();
    next.onload = function () {
      if (img.dataset.want !== url) return;
      var swap = function () { img.src = url; img.classList.add('on'); };
      if (next.decode) next.decode().then(swap, swap); else swap();
    };
    next.onerror = function () { if (img.dataset.want === url) img.dataset.want = ''; };
    next.src = url;
  }

  // ---------- home ----------
  function renderHome() {
    var t = theme(), n = seats(), total = auctionTotal(), max = t.maxPlayers || 6;
    var presetTiles = ui.presets.map(function (p) {
      return '<button class="theme" data-theme="' + esc(p.id) + '" aria-pressed="' + (ui.themeId === p.id) + '"><span class="em">' + esc(p.emoji) + '</span><b>' + esc(p.title) + '</b><small>' +
        (hasStarts(p) ? 'Bid for your ' + esc(startWord(p).toLowerCase()) + (p.starts && p.starts.length ? ': ' + esc(p.starts.slice(0, 3).join(', ')) + '…' : ', then build on it') : 'Start: ' + esc(p.base && p.base.name)) + '</small></button>';
    }).join('');
    var custom = '';
    if (ui.asking) custom = '<div class="interpret muted"><span class="spinner"></span>Working out what to auction…</div>';
    else if (ui.ambiguous) custom = '<div class="interpret"><p>' + esc(ui.ambiguous.question) + '</p><div class="choices">' + ui.ambiguous.options.map(function (o, i) {
      return '<button data-option="' + i + '">' + esc(o.label) + '</button>'; }).join('') + '</div></div>';
    else if (ui.custom) custom = '<div class="custom-pick"><button class="theme" data-theme="' + esc(ui.custom.id) + '" aria-pressed="' + (ui.themeId === ui.custom.id) + '"><span class="em">' + esc(ui.custom.emoji) + '</span><b>' + esc(ui.custom.title) + '</b><small>Bid for your ' + esc(startWord(ui.custom).toLowerCase()) + ' first' +
      (ui.custom.starts && ui.custom.starts.length ? '. First up: ' + esc(ui.custom.starts.slice(0, 4).join(', ')) + '…' : '') + '</small><span class="examples">Up for auction: ' + esc((ui.custom.examples || []).slice(0, 6).join(', ')) + '…</span></button></div>';
    if (ui.askError) custom += '<div class="error">' + esc(ui.askError) + '</div>';
    var counts = [0, 2, 3, 4, 5, 6].map(function (c) {
      var pressed = c === 0 ? ui.cpu : !ui.cpu && ui.players === c;
      return '<button data-players="' + c + '" aria-pressed="' + pressed + '"' + (c > max && t !== ui.custom ? ' disabled' : '') + '>' + (c === 0 ? 'vs CPU' : c) + '</button>';
    }).join('');
    var waiting = ui.open ? ui.open.length : 0;
    var tabs = '<div class="seg tabs"><button data-tab="create" aria-pressed="' + (ui.tab === 'create') + '">Create game</button><button data-tab="join" aria-pressed="' + (ui.tab === 'join') + '">Join game' + (waiting ? '<span class="count num">' + waiting + '</span>' : '') + '</button></div>';
    if (ui.tab === 'join') return renderOpen(tabs);
    app.innerHTML = '<div class="screen"><div class="bar"><a class="link" href="/">‹ Games</a><span class="wordmark">Draft Night</span><span style="width:52px"></span></div>' +
      '<div class="content">' + tabs + '<h1>Build the best anything.</h1><p class="lede">Same budget for everyone. Bid on one item at a time, and watch each creation take shape.</p>' +
      '<div class="eyebrow">Your name</div><input class="field" id="name" maxlength="16" autocomplete="given-name" placeholder="Your name" value="' + esc(ui.name) + '">' +
      '<div class="names">' + ui.names.slice(0, 4).map(function (nm) { return '<button data-name="' + esc(nm) + '" aria-pressed="' + (nm === ui.name) + '">' + esc(nm) + '</button>'; }).join('') + '</div>' +
      '<div class="eyebrow">What are you building?</div><div class="themes">' + presetTiles + '</div>' +
      '<form class="ask" id="ask"><input class="field" id="topic" maxlength="80" placeholder="Or type anything, e.g. Dream bedroom" value="' + esc(ui.customTopic) + '" autocomplete="off"><button aria-label="Use this theme"' + (ui.asking ? ' disabled' : '') + '>→</button></form>' + custom +
      '<div class="eyebrow">Players</div><div class="seg">' + counts + '</div>' +
      (ui.cpu ? '' : '<label class="check"><input type="checkbox" id="private"' + (ui.listed ? '' : ' checked') + '><span>Private game: friends join with the room code instead of finding it under Join</span></label>') +
      '<div class="eyebrow">Total auctions</div><div class="seg">' + [0, 12, 16, 20, 24, 30].map(function (c) { return '<button data-auctions="' + c + '" aria-pressed="' + (ui.auctionCount === c) + '">' + (c === 0 ? 'Auto (' + (n * 5) + ')' : c) + '</button>'; }).join('') + '</div>' +
      '<div class="hint">Each player can win auctions ÷ players, e.g. 12 auctions for 2 players is 6 each.</div>' +
      '<div class="eyebrow">Budget each</div><div class="seg">' + BUDGETS.map(function (b) { return '<button data-budget="' + b + '" aria-pressed="' + (ui.budget === b) + '">' + money(b) + '</button>'; }).join('') + '</div>' +
      '<label class="budget-other"><span>Or any amount £</span><input id="budgetOther" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="off" placeholder="e.g. 30" value="' + (BUDGETS.indexOf(ui.budget) < 0 ? ui.budget : '') + '"></label>' +
      (ui.error ? '<div class="error">' + esc(ui.error) + '</div>' : '') + '</div>' +
      '<div class="footer"><button class="primary" id="create"' + (ui.busy || ui.asking || ui.ambiguous ? ' disabled' : '') + '>' + (ui.busy ? 'Creating…' : ui.ambiguous ? 'Pick what you meant above' : pendingTopic() ? 'Use “' + esc(pendingTopic().slice(0, 24)) + '”' : ui.cpu ? 'Play ' + esc(t.title) + ' vs CPU' : 'Create ' + esc(t.title) + ' room') + '</button>' +
      '<div class="hint">' + total + ' auctions · ' + (hasStarts(t) ? 'first ' + n + ' are ' + esc(startWord(t).toLowerCase()) + 's, one each' : Math.ceil(total / n) + ' wins each') + '</div></div></div>';
  }
  function homeClick(e) {
    var b = e.target.closest('button'); if (!b) return;
    if (b.dataset.theme) { ui.themeId = b.dataset.theme; if (ui.themeId !== (ui.custom && ui.custom.id)) store.set('dn-theme', ui.themeId); ensureCount(); }
    else if (b.dataset.name) { ui.name = b.dataset.name; }
    else if (b.dataset.players) { var c = +b.dataset.players; ui.cpu = c === 0; if (c) ui.players = c; store.set('dn-players', ui.players); store.set('dn-cpu', ui.cpu); ensureCount(); }
    else if (b.dataset.auctions !== undefined) { ui.auctionCount = +b.dataset.auctions; store.set('dn-auction-count', ui.auctionCount); }
    else if (b.dataset.budget) { ui.budget = +b.dataset.budget; store.set('dn-budget', ui.budget); }
    else if (b.dataset.option) { var o = ui.ambiguous.options[+b.dataset.option]; ui.customTopic = ui.lastAsked = o.label; askTheme(o.topic, true); return; }
    else if (b.dataset.go === 'join') { ui.view = 'join'; return render(); }
    else if (b.dataset.tab) { ui.tab = b.dataset.tab; ui.error = ''; loadOpen(); }
    else if (b.dataset.seat) { return quickJoin(b.dataset.seat); }
    else if (b.dataset.change !== undefined) { ui.editName = true; render(); var f = $('#name'); if (f) f.focus(); return; }
    else if (b.id === 'create') { if (pendingTopic()) { ui.lastAsked = pendingTopic(); return askTheme(ui.lastAsked, false); } return createRoom(); }
    else return;
    render();
  }
  // Text typed into the theme box that has not been turned into a theme yet.
  function pendingTopic() { var t = (ui.customTopic || '').trim(); return t.length > 1 && t !== ui.lastAsked ? t : ''; }
  // A custom theme is generated for a player count; regenerate if more players are chosen.
  function ensureCount() {
    var t = theme();
    if (ui.custom && t === ui.custom && seats() > (t.maxPlayers || 0) && ui.custom.topic) askTheme(ui.custom.topic, true);
  }
  function askTheme(topic, confirmed) {
    topic = String(topic || '').trim(); if (topic.length < 2) return;
    ui.asking = true; ui.ambiguous = null; ui.askError = ''; render();
    api('/api/theme', { topic: topic, players: Math.max(seats(), 2), confirmed: !!confirmed }).then(function (d) {
      ui.asking = false;
      if (d.status === 'ambiguous') ui.ambiguous = d;
      else if (d.status === 'ok') {
        var preset = ui.presets.filter(function (p) { return p.id === d.theme.id; })[0];
        if (preset) { ui.themeId = preset.id; ui.custom = null; }
        else { d.theme.topic = topic; ui.custom = d.theme; ui.themeId = d.theme.id; if (seats() > d.theme.maxPlayers) { ui.players = Math.max(2, d.theme.maxPlayers); } }
      } else ui.askError = d.error || 'Could not set up that theme. Try again.';
      render();
      var shown = document.querySelector('.interpret, .custom-pick, .error');
      if (shown && shown.scrollIntoView) shown.scrollIntoView({ block: 'center' });
    }, function () { ui.asking = false; ui.askError = 'No connection. Try again.'; render(); });
  }
  function rememberName() {
    var n = ($('#name') ? $('#name').value : ui.name).trim().slice(0, 16);
    ui.name = n; store.set('dn-name', n);
    if (n) { ui.names = [n].concat(ui.names.filter(function (x) { return x.toLowerCase() !== n.toLowerCase(); })).slice(0, 4); store.set('dn-names', ui.names); }
    try { localStorage.setItem('draft-night-person', n); } catch (e) {}
    return n;
  }
  function createRoom() {
    var name = rememberName();
    if (!name) { ui.error = 'Add your name first.'; render(); $('#name').focus(); return; }
    ui.busy = true; ui.error = ''; render();
    api('/api/create', { theme: theme().id, name: name, capacity: seats(), auctionCount: auctionTotal(), budget: ui.budget, cpu: ui.cpu, device: device, listed: ui.listed }).then(function (d) {
      ui.busy = false;
      if (!d.code) { ui.error = d.error || 'Could not create a room.'; return render(); }
      enter(d);
    }, function () { ui.busy = false; ui.error = 'No connection to the game server.'; render(); });
  }
  function enter(d) {
    clearTimeout(openTimer);
    session = { code: d.code, player: d.player, token: d.token }; store.set('dn-session', session);
    history.replaceState(null, '', location.pathname + '?room=' + d.code + (params.get('api') ? '&api=' + encodeURIComponent(API) : ''));
    accept(d.room); poll();
  }

  // ---------- quick play ----------
  // Waiting games are listed by the server; tapping a seat joins it, no code needed.
  function renderOpen(tabs) {
    var named = ui.name.trim() && !ui.editName;
    app.innerHTML = '<div class="screen"><div class="bar"><a class="link" href="/">‹ Games</a><span class="wordmark">Draft Night</span><span style="width:52px"></span></div>' +
      '<div class="content">' + tabs +
      (named ? '<p class="as">Joining as <b>' + esc(ui.name.trim()) + '</b><button class="link" data-change>Change</button></p>' :
        '<div class="eyebrow">Your name</div><input class="field" id="name" maxlength="16" autocomplete="given-name" placeholder="Your name" value="' + esc(ui.name) + '">' +
        '<div class="names">' + ui.names.slice(0, 4).map(function (nm) { return '<button data-name="' + esc(nm) + '" aria-pressed="' + (nm === ui.name) + '">' + esc(nm) + '</button>'; }).join('') + '</div>') +
      '<div class="eyebrow">Games waiting for players</div><div id="openList"></div>' +
      (ui.error ? '<div class="error">' + esc(ui.error) + '</div>' : '') +
      '<button class="link code-link" data-go="join">Join with room code</button></div></div>';
    paintOpen();
  }
  function paintOpen() {
    var el = $('#openList'); if (!el) return;
    var list = ui.open, html;
    if (!list) html = '<p class="muted empty-note"><span class="spinner"></span>Looking for games…</p>';
    else if (!list.length) html = '<p class="muted empty-note">' + (ui.openErr ? 'Can’t reach the game server. Retrying…' : 'No games waiting yet. When a friend creates one, it appears here.') + '</p>';
    else html = '<ul class="open">' + list.map(function (g) {
      var busy = ui.joining === g.code;
      return '<li><span class="em">' + esc(g.theme.emoji) + '</span><div><b>' + esc(g.host) + '’s game</b><small>' + esc(g.theme.title) + ' · ' + g.players.length + '/' + g.capacity + ' players</small></div>' +
        '<button class="pill" data-seat="' + esc(g.code) + '"' + (ui.joining ? ' disabled' : '') + '>' + (busy ? 'Joining…' : 'I’m Player ' + g.seat) + '</button></li>';
    }).join('') + '</ul>';
    patch(el, html);
  }
  function loadOpen() {
    clearTimeout(openTimer);
    if (ui.view !== 'home' || session) return;
    api('/api/lobbies').then(function (d) {
      var had = ui.open ? ui.open.length : -1;
      ui.open = d.rooms || []; ui.openErr = !d.rooms;
      if (ui.view !== 'home') return;
      if (ui.tab === 'join') paintOpen();
      var c = document.querySelector('[data-tab="join"]');
      if (c && had !== ui.open.length) c.innerHTML = 'Join game' + (ui.open.length ? '<span class="count num">' + ui.open.length + '</span>' : '');
    }, function () { ui.openErr = true; ui.open = ui.open || []; if (ui.tab === 'join') paintOpen(); }).then(function () {
      if (ui.view === 'home' && !session) openTimer = setTimeout(loadOpen, ui.tab === 'join' ? 2000 : 4000);
    });
  }
  function quickJoin(code) {
    var name = ui.editName || !ui.name.trim() ? rememberName() : ui.name.trim();
    if (!name) { ui.error = 'Add your name first.'; render(); var f = $('#name'); if (f) f.focus(); return; }
    if (!ui.editName) rememberName();
    ui.joining = code; ui.error = ''; paintOpen();
    api('/api/join', { code: code, name: name, device: device }).then(function (d) {
      ui.joining = '';
      if (!d.code) { ui.error = d.error || 'Could not join that game.'; render(); return loadOpen(); }
      ui.editName = false; enter(d);
    }, function () { ui.joining = ''; ui.error = 'No connection to the game server.'; render(); });
  }

  // ---------- join ----------
  function renderJoin() {
    app.innerHTML = '<div class="screen"><div class="bar"><button class="link" data-go="home">‹ Back</button><span class="wordmark">Join a room</span><span style="width:40px"></span></div>' +
      '<form class="content" id="joinForm"><div class="eyebrow">Room code</div><input class="field num" id="code" maxlength="4" autocapitalize="characters" autocomplete="off" placeholder="ABCD" style="font-size:24px;letter-spacing:.2em;height:60px;text-transform:uppercase" value="' + esc(ui.joinCode) + '">' +
      '<div class="eyebrow">Your name</div><input class="field" id="name" maxlength="16" placeholder="Your name" value="' + esc(ui.name) + '">' +
      '<div class="names">' + ui.names.slice(0, 4).map(function (nm) { return '<button type="button" data-name="' + esc(nm) + '" aria-pressed="' + (nm === ui.name) + '">' + esc(nm) + '</button>'; }).join('') + '</div>' +
      (ui.error ? '<div class="error">' + esc(ui.error) + '</div>' : '') +
      '<div style="margin-top:24px"><button class="primary"' + (ui.busy ? ' disabled' : '') + '>' + (ui.busy ? 'Joining…' : 'Join') + '</button></div></form></div>';
  }
  function joinRoom() {
    var code = ($('#code').value || '').trim().toUpperCase(), name = rememberName();
    ui.joinCode = code;
    if (code.length !== 4 || !name) { ui.error = 'Enter the 4-letter code and your name.'; return render(); }
    if (session && session.code === code) { ui.view = 'game'; return poll(); }
    ui.busy = true; ui.error = ''; render();
    api('/api/join', { code: code, name: name, device: device }).then(function (d) {
      ui.busy = false;
      if (!d.code) { ui.error = d.error || 'Could not join.'; return render(); }
      enter(d);
    }, function () { ui.busy = false; ui.error = 'No connection to the game server.'; render(); });
  }

  // ---------- room state ----------
  function accept(r) {
    if (!r || !r.code) return;
    var prev = room; room = r; offset = r.now - Date.now();
    var v = r.status === 'lobby' ? 'lobby' : r.status === 'finished' ? 'final' : 'game';
    if (ui.view !== v) { ui.view = v; built = false; }
    if (prev && prev.auction && r.auction && r.status === 'playing' && r.auction.turn === me() && (prev.auction.turn !== me() || prev.lot !== r.lot) && navigator.vibrate) navigator.vibrate(18);
    render();
  }
  function poll() {
    clearTimeout(pollTimer);
    if (!session) return;
    var q = '/api/room?code=' + session.code + '&p=' + session.player + '&t=' + encodeURIComponent(session.token) + (room && room.code === session.code ? '&rev=' + room.rev : '');
    api(q).then(function (d) {
      if (d._status === 404) { dropSession('That game has closed.'); return; }
      // The server says which seat this phone holds; it moves if someone earlier left the lobby, and is -1 if the seat was freed.
      if (typeof d.me === 'number' && d.me !== session.player) {
        if (d.me < 0) { dropSession('You’re no longer in that game. Pick a seat again.'); return; }
        session.player = d.me; store.set('dn-session', session);
      }
      if (d.same) offset = d.now - Date.now(); else accept(d);
      schedulePoll();
    }, schedulePoll);
  }
  function dropSession(msg) {
    clearTimeout(pollTimer); session = null; store.set('dn-session', null); room = null; built = false;
    history.replaceState(null, '', location.pathname + (params.get('api') ? '?api=' + encodeURIComponent(API) : ''));
    ui.view = 'home'; ui.tab = 'join'; ui.error = msg; ui.open = null; render(); loadOpen();
  }
  function schedulePoll() { clearTimeout(pollTimer); pollTimer = setTimeout(poll, !room ? 2000 : room.status === 'playing' ? 700 : 1500); }
  document.addEventListener('visibilitychange', function () { if (!document.hidden && session) poll(); });

  function act(type, extra) {
    if (sending || !room) return;
    sending = true; render();
    var body = { code: room.code, player: session.player, token: session.token, type: type, lot: room.lot, seen: room.auction.bid };
    for (var k in extra) body[k] = extra[k];
    api('/api/action', body).then(function (d) {
      sending = false;
      if (d.room) { if (d.error) toast(d.error); accept(d.room); }
      else if (d.code) accept(d);
      else { toast(d.error || 'Something went wrong'); render(); }
    }, function () { sending = false; toast('Connection lost. Try again.'); render(); });
  }

  // ---------- lobby ----------
  function renderLobby() {
    var t = room.theme, mine = me(), host = mine === 0, n = room.players.length;
    var slots = '';
    for (var i = 0; i < room.capacity; i++) {
      var p = room.players[i];
      var tag = p ? 'Player ' + (i + 1) + ' · ' + (p.cpu ? 'Computer' : i === 0 ? 'Host' : p.away ? 'Away' : 'Ready') + (i === mine ? ' · You' : '') : '';
      slots += p ? '<li style="--c:' + p.color + '"' + (i === mine ? ' class="mine"' : '') + '><span class="dot"></span><b>' + esc(p.name) + '</b><span class="tag' + (p.away ? ' away' : '') + '">' + tag + '</span></li>'
        : '<li class="empty"><span class="dot" style="--c:var(--line-strong)"></span>Player ' + (i + 1) + '<span class="tag">Waiting…</span></li>';
    }
    var brief = hasStarts(t) ? 'The first ' + n + ' lots are ' + esc(startWord(t).toLowerCase()) + 's. Everyone ends up with exactly one, then the bidding moves to ' + esc(t.label.toLowerCase()) + 's.' :
      'Everyone starts with the same ' + esc(t.base && t.base.name.toLowerCase()) + '. Every ' + esc(t.label.toLowerCase()) + ' you win is added to yours.';
    var link = location.origin + location.pathname + '?room=' + room.code;
    app.innerHTML = '<div class="screen"><div class="bar"><button class="link" data-leave>‹ Leave</button><span class="wordmark">Draft Night</span><span style="width:48px"></span></div><div class="content">' +
      (room.listed || room.cpu ? '' : '<div class="eyebrow" style="margin-top:12px">Room code</div><div class="code num">' + esc(room.code) + '</div><p class="muted" style="margin:0">Private game. Friends tap Join game, then Join with room code.</p>') +
      '<div class="eyebrow"' + (room.listed || room.cpu ? ' style="margin-top:12px"' : '') + '>Tonight</div><div class="brief"><span class="em">' + esc(t.emoji) + '</span><div><b>' + esc(t.title) + '</b><p>' + brief + '</p><p>' + (room.auctionCount || n * 5) + ' auctions · ' + (room.maxWins || 5) + ' possible wins per player · ' + money(room.budget) + ' each</p></div></div>' +
      '<div class="eyebrow split"><span>Players</span><span>' + n + ' of ' + room.capacity + ' joined</span></div><ul class="roster">' + slots + '</ul>' +
      (room.notice ? '<p class="notice">' + esc(room.notice) + '</p>' : '') +
      (room.listed && !room.cpu ? '<p class="muted small">' + (n < room.capacity ? 'Friends open Draft Night and tap Join game to take a seat. ' : '') + 'Room code <span class="num">' + esc(room.code) + '</span> · <button class="link inline" data-share="' + esc(link) + '">Share invite</button></p>' : '') + '</div>' +
      '<div class="footer">' + (room.cpu || room.listed ? '' : '<button class="secondary" data-share="' + esc(link) + '">Share invite link</button>') +
      prepHtml() + (host ? startButton(n) : '<div class="hint">' + (prepReady() ? 'Waiting for ' + esc(room.players[0].name) + ' to start' : 'Preparing pictures…') + '</div>') + '</div></div>';
  }

  // Pictures are prepared while the lobby fills; the host can start once every one is ready.
  function prepReady() { var p = room.prep; return !p || !p.enabled || p.ready + p.failed >= p.total; }
  function prepHtml() {
    var p = room.prep; if (!p || !p.enabled || !p.total) return '';
    if (p.error) return '<div class="prep error">' + esc(p.error) + '</div>';
    var pct = Math.round(100 * p.ready / p.total);
    return '<div class="prep"><div class="prep-row"><span>' + (p.ready >= p.total ? 'All pictures ready' : 'Preparing pictures') + '</span><span class="num">' + p.ready + ' / ' + p.total + '</span></div><i><b style="width:' + pct + '%"></b></i>' +
      (p.failed && !p.error ? '<div class="muted" style="font-size:12.5px;margin-top:4px">' + p.failed + ' could not be made</div>' : '') + '</div>';
  }
  function startButton(n) {
    var p = room.prep || {};
    if (n < 2) return '<button class="primary" disabled>Waiting for players…</button>';
    if (!prepReady()) return '<button class="primary" disabled>Preparing pictures… ' + p.ready + '/' + p.total + '</button>';
    if (p.enabled && p.failed) return '<button class="primary" data-start data-force' + (sending ? ' disabled' : '') + '>Start without all pictures</button>';
    return '<button class="primary" data-start' + (sending ? ' disabled' : '') + '>Start the auction' + (n < room.capacity ? ' with ' + n : '') + '</button>';
  }

  // ---------- game ----------
  function buildGame() {
    app.innerHTML = '<div class="game"><div class="bar"><button class="icon-btn" data-menu aria-label="Menu">•••</button><div class="progress"><span id="prog" class="num"></span><i><b id="progbar"></b></i></div><span class="icon-btn num" id="roomcode"></span></div>' +
      '<div class="worlds" id="worlds"></div><section class="lot" id="lot"></section><div class="dock" id="dock"></div></div>';
    built = true; shown = {};
    var worlds = $('#worlds');
    worlds.className = 'worlds ' + (room.players.length === 2 ? 'two' : 'many');
    worlds.innerHTML = room.players.map(function (p, i) {
      return '<button class="world" data-world="' + i + '" style="--c:' + p.color + '"><div class="canvas"><img alt=""><div class="ph"></div><div class="slot"></div></div><div class="meta"><span class="dot"></span><b></b><span class="money num"></span></div><div class="sub"></div></button>';
    }).join('');
    // In a big group, start the row on your own creation.
    var mine = worlds.children[me()]; if (mine && room.players.length > 2) worlds.scrollLeft = Math.max(0, mine.offsetLeft - 16);
  }
  function placeholder(i) {
    var t = room.theme, p = room.players[i], w = room.worlds[i] || {};
    if (hasStarts(t) && p.base === null) return '<span class="em">' + esc(t.emoji) + '</span>' + (room.lots[room.lot] && room.lots[room.lot].kind === 'base' ? 'Bidding for a ' + esc(startWord(t).toLowerCase()) : 'No ' + esc(startWord(t).toLowerCase()) + ' yet');
    if (w.state === 'none' || w.state === 'error' || (room.base && (room.base.state === 'none' || room.base.state === 'error'))) return ''; // inventory list shown instead
    return '<span class="em">' + esc(t.emoji) + '</span>' + (hasStarts(t) ? esc(lotName(p.base)) : esc(t.base && t.base.name));
  }
  function inventory(i) {
    var p = room.players[i], t = room.theme;
    return '<div class="inv"><b>' + esc(hasStarts(t) ? lotName(p.base) || 'No ' + startWord(t).toLowerCase() + ' yet' : t.base.name) + '</b>' + p.won.filter(function (x) { return x !== p.base; }).map(function (x) { return '<span>+ ' + esc(lotName(x)) + '</span>'; }).join('') + '</div>';
  }
  function worldStatus(i) {
    var p = room.players[i], w = room.worlds[i] || {};
    var pending = p.won.length - Math.max(w.v, 0);
    if (w.state === 'updating' || w.state === 'retrying' || (pending > 0 && w.v >= (hasStarts(room.theme) ? 1 : 0))) {
      var adding = p.won.slice(Math.max(w.v, 0)).filter(function (x) { return x !== p.base; }).map(lotName);
      return adding.length ? 'Adding ' + adding.join(', ') + '…' : '';
    }
    return '';
  }
  function updateWorlds() {
    var a = room.auction;
    room.players.forEach(function (p, i) {
      var el = document.querySelector('[data-world="' + i + '"]'); if (!el) return;
      var w = room.worlds[i] || { v: -1 }, img = el.querySelector('img');
      var noImages = w.state === 'none' || w.state === 'error' || (room.base && (room.base.state === 'none' || room.base.state === 'error') && w.v < 0);
      if (w.key && !noImages) showImage(img, imgUrl(w.key));
      var hasImg = img.classList.contains('on');
      patch(el.querySelector('.ph'), hasImg ? '' : noImages ? '' : placeholder(i));
      var status = worldStatus(i);
      var gain = a.phase === 'sold' && a.result && a.result.winner === i && room.lots[room.lot] && room.lots[room.lot].kind === 'add' ? '<div class="gain">+ ' + esc(room.lots[room.lot].name) + '</div>' : '';
      // Show newly purchased items instantly over the saved scene while AI batches a polished update.
      var pendingItems = p.won.slice(Math.max(0, w.v)).filter(function (n) { return n !== p.base; });
      var previews = pendingItems.map(function (n) {
        var l = room.lots[n];
        return l ? '<span style="display:inline-flex;align-items:center;gap:5px;padding:4px 7px;border-radius:9px;background:rgba(15,20,25,.82);color:white;font-size:10px;max-width:135px"><img alt="" src="' + esc(imgUrl(l.key)) + '" style="width:27px;height:27px;object-fit:cover;border-radius:5px" onerror="this.style.display=\'none\'"><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(l.name) + '</span></span>' : '';
      }).join('');
      var additions = previews ? '<div style="position:absolute;bottom:8px;left:6px;right:6px;display:flex;flex-wrap:wrap;gap:4px;justify-content:center;pointer-events:none;z-index:2">' + previews + '</div>' : '';
      patch(el.querySelector('.slot'), (noImages ? inventory(i) : '') + gain + additions + (status && hasImg ? '<div class="status">' + esc(status) + '</div>' : ''));
      patch(el.querySelector('b'), esc(p.name) + (i === me() ? ' <span class="muted" style="font-weight:500">(you)</span>' : ''));
      patch(el.querySelector('.money'), money(p.budget));
      var sub = '', hot = false;
      if (room.status === 'playing' && a.phase === 'bidding') {
        if (a.leader === i) { sub = 'Leading at ' + money(a.bid); hot = true; }
        else if (a.turn === i) { sub = i === me() ? 'Your turn' : 'Deciding…'; hot = true; }
        else if (a.passed[i]) sub = 'Passed';
      }
      if (!sub) { var count = p.won.filter(function (x) { return x !== p.base; }).length; sub = count + ' ' + (count === 1 ? 'item' : 'items') + (p.away ? ' · away' : ''); }
      var subEl = el.querySelector('.sub'); patch(subEl, esc(sub)); subEl.classList.toggle('hot', hot);
      el.classList.toggle('leading', a.phase === 'bidding' && a.leader === i);
    });
  }
  function updateLot() {
    var a = room.auction, lot = room.lots[room.lot], t = room.theme; if (!lot) return;
    var kind = lot.kind === 'base' ? startWord(t) + ' ' + (room.lot + 1) + ' of ' + room.players.length : t.label + ' · Lot ' + (room.lot + 1);
    var leader = a.leader !== null ? room.players[a.leader] : null;
    var priceHtml;
    if (a.phase === 'sold') {
      var w = room.players[a.result.winner];
      priceHtml = '<div class="verdict-bar" style="--c:' + w.color + '"><span>' + (a.result.winner === me() ? 'You won it' : 'Sold to ' + esc(w.name)) + '</span><span class="num">' + (a.result.price ? money(a.result.price) : 'Free') + '</span></div>' +
        (a.result.note ? '<div class="trail">' + esc(a.result.note) + '</div>' : '<div class="trail"></div>');
    } else if (a.phase === 'unsold') {
      priceHtml = '<div class="verdict-bar unsold"><span>No bids, so nobody gets it</span><span>Unsold</span></div><div class="trail"></div>';
    } else {
      priceHtml = '<div class="price"><div><div class="muted" style="font-size:12px;font-weight:600;letter-spacing:.06em;text-transform:uppercase">' + (leader ? 'Highest bid' : 'Opening bid') + '</div><div class="amt num">' + money(leader ? a.bid : 1) + '</div></div>' +
        '<div class="who" style="--c:' + (leader ? leader.color : 'var(--muted)') + '">' + (leader ? '<b>' + (a.leader === me() ? 'You lead' : esc(leader.name) + ' leads') + '</b>' : '<b>' + (a.turn === null ? 'No bids yet' : a.turn === me() ? 'You open' : esc(room.players[a.turn].name) + ' opens') + '</b>') + '</div></div>' +
        '<div class="trail">' + trail() + '</div>';
    }
    var homes = ''; // upcoming lots stay secret
    var lotEl = $('#lot');
    if (!lotEl.__built || lotEl.__lot !== room.lot) {
      lotEl.innerHTML = '<div class="lot-row"><div class="lot-img"><img alt=""><div class="ph"></div></div><div class="lot-text"><div class="lot-kind"></div><div class="lot-name"></div><div class="lot-blurb"></div></div></div><div id="price"></div><div id="homes"></div>';
      lotEl.__built = true; lotEl.__lot = room.lot;
    }
    var img = lotEl.querySelector('.lot-img img');
    if (lot.img === 'ready') showImage(img, imgUrl(lot.key));
    patch(lotEl.querySelector('.lot-img .ph'), img.classList.contains('on') ? '' : lot.img === 'pending' || lot.img === '' ? '<span>' + esc(t.emoji) + '</span>' : '<span class="ph-name">' + esc(lot.name) + '</span>');
    lotEl.querySelector('.lot-img .ph').classList.toggle('loading', lot.img === 'pending' && !img.classList.contains('on'));
    patch(lotEl.querySelector('.lot-kind'), esc(kind));
    patch(lotEl.querySelector('.lot-name'), esc(lot.name));
    patch(lotEl.querySelector('.lot-blurb'), esc(lot.blurb));
    patch($('#price'), priceHtml);
    patch($('#homes'), homes);
    lotEl.classList.toggle('has-homes', !!homes);
  }
  function trail() {
    var a = room.auction;
    return a.log.slice(-4).map(function (e) {
      var nm = e.p === me() ? 'You' : room.players[e.p].name;
      return esc(nm) + ' ' + (e.a === null ? (e.why ? 'passed (' + esc(e.why) + ')' : 'passed') : money(e.a) + (e.why ? ' (' + esc(e.why) + ')' : ''));
    }).join(' · ');
  }
  function updateDock() {
    var a = room.auction, mine = me(), p = room.players[mine], dock = $('#dock');
    if (!p) return;
    var head = '<div class="dock-head"><span>You have <b class="num">' + money(p.budget) + '</b></span><span class="muted" id="tleft"></span></div>';
    var body;
    if (a.phase !== 'bidding') {
      var last = room.lot + 1 >= room.total;
      body = '<div class="wait"><b>' + (last ? 'Final lot complete' : 'Next lot coming up') + '</b><span>' + (last ? 'Revealing every creation…' : 'Lot ' + (room.lot + 2) + ' of ' + room.total) + '</span></div>';
    } else if (a.turn === mine) {
      var steps = [1, 2, 5, 10], base = a.bid;
      body = '<div class="bids">' + steps.map(function (s, i) {
        var amt = base + s, ok = amt <= p.budget && !sending;
        return '<button data-bid="' + amt + '" class="' + (i === 0 ? 'main' : '') + '"' + (ok ? '' : ' disabled') + ' aria-label="Bid ' + money(amt) + '"><b class="num">' + money(amt) + '</b><small>+' + money(s) + '</small></button>';
      }).join('') + '</div><div class="dock-row"><form class="custom" id="customForm"><span>£</span><input id="customBid" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="off" placeholder="Amount" aria-label="Custom bid amount"><button' + (sending ? ' disabled' : '') + '>Bid</button></form>' +
        (a.leader === null ? '<div class="opening">You open the bidding</div>' : '<button class="pass" data-pass' + (sending ? ' disabled' : '') + '>Pass</button>') + '</div>';
    } else {
      var turn = a.turn !== null ? room.players[a.turn] : null, msg, sub;
      if (room.players[mine].won.length >= 5) { msg = 'You have your 5'; sub = 'Watch the others fill theirs'; }
      else if (!eligibleMe()) { msg = room.lots[room.lot].kind === 'base' ? 'You already have your ' + esc(startWord(room.theme).toLowerCase()) : 'Sitting this one out'; sub = room.lots[room.lot].kind === 'base' ? 'Everyone gets exactly one' : ''; }
      else if (a.leader === mine) { msg = 'You lead at ' + money(a.bid); sub = turn ? esc(turn.name) + ' can raise or pass' : ''; }
      else if (a.passed[mine]) { msg = 'You passed'; sub = p.budget <= a.bid ? 'Not enough left to raise' : turn ? esc(turn.name) + ' is deciding' : ''; }
      else { msg = turn ? esc(turn.name) + '’s turn' : 'Waiting…'; sub = a.leader === null ? (turn ? esc(turn.name) + ' opens the bidding at £1 or more' : '') : 'You’re up next if they raise or pass'; }
      body = '<div class="wait"><b>' + msg + '</b><span>' + sub + '</span></div>';
    }
    // Keep whatever the player is typing if the dock redraws mid-turn.
    var typed = $('#customBid'), keep = typed ? typed.value : '', focused = typed && document.activeElement === typed;
    patch(dock, head + '<div class="clock"><i id="clock"></i></div>' + body);
    var input = $('#customBid');
    if (input && keep && !input.value) { input.value = keep; if (focused) input.focus(); }
  }
  function eligibleMe() {
    var lot = room.lots[room.lot], p = room.players[me()];
    if (lot.kind === 'base') return p.base === null;
    return !hasStarts(room.theme) || p.base !== null;
  }
  function renderGame() {
    if (!built) buildGame();
    patch($('#prog'), 'Lot ' + Math.min(room.lot + 1, room.total) + ' of ' + room.total);
    $('#progbar').style.width = (100 * (room.lot + (room.auction.phase === 'bidding' ? 0 : 1)) / room.total) + '%';
    patch($('#roomcode'), esc(room.code));
    updateWorlds(); updateLot(); updateDock(); tickClock();
  }
  function tickClock() {
    var bar = document.getElementById('clock'), label = document.getElementById('tleft');
    if (!bar || !room || room.status !== 'playing') return;
    var a = room.auction;
    if (a.phase === 'bidding' && a.turn !== null && !room.players[a.turn].cpu) {
      var left = Math.max(0, a.deadline - now()), frac = Math.min(1, left / 30000);
      bar.style.transform = 'scaleX(' + frac + ')';
      bar.style.background = left < 8000 ? '#ff8a7a' : '';
      if (label) label.textContent = (a.turn === me() ? 'Your turn · ' : room.players[a.turn].name + ' · ') + Math.ceil(left / 1000) + 's';
    } else { bar.style.transform = 'scaleX(0)'; if (label) label.textContent = a.phase === 'bidding' && a.turn !== null ? room.players[a.turn].name + ' is thinking' : ''; }
  }
  setInterval(tickClock, 250);

  // ---------- results ----------
  function entryHtml(i) {
    var p = room.players[i], w = room.worlds[i] || {}, t = room.theme;
    var spent = room.budget - p.budget;
    var items = p.won.map(function (x) {
      var h = room.history.filter(function (e) { return e.lot === x; })[0];
      return '<li class="' + (x === p.base ? 'basei' : '') + '"><span>' + esc(lotName(x)) + '</span><span class="num">' + (h && h.price ? money(h.price) : 'Free') + '</span></li>';
    }).join('');
    var showImg = w.key && w.state !== 'none';
    var status = worldStatus(i);
    return '<div class="entry" style="--c:' + p.color + '" data-entry="' + i + '"><div class="canvas">' + (showImg ? '<img alt="' + esc(p.name) + '’s ' + esc(t.noun) + '" data-src="' + esc(imgUrl(w.key)) + '">' : inventory(i)) +
      (status && showImg ? '<div class="status">' + esc(status) + '</div>' : '') + '</div>' +
      '<h2><span class="dot"></span>' + esc(p.name) + (i === me() ? ' <span class="muted" style="font-weight:500;font-size:14px">you</span>' : '') + '</h2><div class="spend num">Spent ' + money(spent) + ' · ' + money(p.budget) + ' left</div>' +
      '<ul>' + (!hasStarts(t) ? '<li class="basei"><span>' + esc(t.base.name) + '</span><span>Start</span></li>' : '') + (items || '<li><span class="muted">Nothing won</span><span></span></li>') + '</ul></div>';
  }
  function renderFinal() {
    var many = room.players.length > 2, t = room.theme;
    var key = room.players.map(function (p, i) { var w = room.worlds[i] || {}; return w.key + w.state; }).join('|') + room.verdict;
    if (built && app.__final === key) return;
    var scroll = $('#compare') ? $('#compare').scrollLeft : 0;
    app.__final = key; built = true;
    app.innerHTML = '<div class="screen"><div class="bar"><button class="link" data-leave>‹ New game</button><span class="wordmark">Draft Night</span><span style="width:60px"></span></div>' +
      '<div class="reveal-head"><div class="eyebrow" style="margin-top:4px">' + esc(t.emoji + ' ' + t.title) + ' · Final reveal</div><h1>Every ' + esc(t.noun) + ', side by side.</h1>' +
      (room.verdict ? '<p class="quote">' + esc(room.verdict) + '</p>' : '') + '</div>' +
      (many ? '<div class="dots">' + room.players.map(function (p, i) { return '<button data-jump="' + i + '" style="--c:' + p.color + '">' + esc(p.name) + '</button>'; }).join('') + '</div>' : '') +
      '<div class="compare' + (many ? ' many' : '') + '" id="compare">' + room.players.map(function (_, i) { return entryHtml(i); }).join('') + '</div>' +
      '<div class="footer"><button class="primary" data-again>Play again</button>' + (navigator.share ? '<button class="secondary" data-sharefinal>Share results</button>' : '') + '</div></div>';
    document.querySelectorAll('.entry img[data-src]').forEach(function (img) { showImage(img, img.dataset.src); });
    if ($('#compare')) $('#compare').scrollLeft = scroll;
  }

  // ---------- sheet (tap a creation) ----------
  function openWorld(i) {
    var p = room.players[i], sheet = document.getElementById('sheet');
    sheet.innerHTML = '<div class="sheet-body" role="dialog" aria-modal="true" aria-label="' + esc(p.name) + '"><div class="grab"></div>' + entryHtml(i) + '<div style="margin-top:16px"><button class="secondary" data-close>Close</button></div></div>';
    sheet.hidden = false;
    var img = sheet.querySelector('img[data-src]'); if (img) showImage(img, img.dataset.src);
  }
  document.getElementById('sheet').addEventListener('click', function (e) {
    if (e.target.id === 'sheet' || e.target.closest('[data-close]')) document.getElementById('sheet').hidden = true;
  });

  // ---------- routing & events ----------
  function render() {
    if (ui.view === 'home') renderHome();
    else if (ui.view === 'join') renderJoin();
    else if (!room) app.innerHTML = '<div class="screen"><div class="content" style="display:grid;place-items:center"><span class="muted"><span class="spinner"></span>Connecting…</span></div></div>';
    else if (ui.view === 'lobby') renderLobby();
    else if (ui.view === 'game') renderGame();
    else if (ui.view === 'final') renderFinal();
  }
  function leave() {
    if (session && room && room.status === 'lobby') api('/api/leave', { code: session.code, token: session.token }).then(null, function () {});
    clearTimeout(pollTimer); session = null; room = null; store.set('dn-session', null); built = false;
    history.replaceState(null, '', location.pathname + (params.get('api') ? '?api=' + encodeURIComponent(API) : ''));
    ui.view = 'home'; ui.error = ''; ui.open = null; render(); loadOpen();
  }
  app.addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    if (ui.view === 'home') return homeClick(e);
    if (b.dataset.go === 'home') { ui.view = 'home'; ui.error = ''; render(); return loadOpen(); }
    if (b.dataset.name !== undefined && ui.view === 'join') { ui.name = b.dataset.name; $('#name').value = ui.name; return; }
    if (b.hasAttribute('data-bid')) return act('bid', { amount: +b.dataset.bid });
    if (b.hasAttribute('data-pass')) return act('pass');
    if (b.hasAttribute('data-start')) return act('start', b.hasAttribute('data-force') ? { force: true } : {});
    if (b.dataset.world) return openWorld(+b.dataset.world);
    if (b.hasAttribute('data-leave') || b.hasAttribute('data-again')) return leave();
    if (b.hasAttribute('data-menu')) { if (confirm('Leave this game? You can rejoin with code ' + room.code + '.')) leave(); return; }
    if (b.dataset.share) {
      var link = b.dataset.share;
      if (navigator.share) navigator.share({ title: 'Draft Night', text: 'Join my Draft Night room: ' + room.code, url: link }).catch(function () {});
      else if (navigator.clipboard) navigator.clipboard.writeText(link).then(function () { toast('Invite link copied'); });
      return;
    }
    if (b.dataset.jump) { var el = document.querySelector('[data-entry="' + b.dataset.jump + '"]'); if (el) el.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' }); return; }
    if (b.hasAttribute('data-sharefinal')) {
      var text = 'Draft Night: ' + room.theme.title + '\n' + room.players.map(function (p) { return p.name + ': ' + p.won.map(lotName).join(', '); }).join('\n');
      navigator.share({ title: 'Draft Night results', text: text }).catch(function () {});
    }
  });
  app.addEventListener('submit', function (e) {
    e.preventDefault();
    if (e.target.id === 'ask') { ui.name = $('#name').value; ui.customTopic = ui.lastAsked = $('#topic').value.trim(); askTheme(ui.customTopic, false); }
    if (e.target.id === 'joinForm') joinRoom();
    if (e.target.id === 'customForm') {
      var amount = Number(($('#customBid').value || '').trim()), p = room.players[me()], low = room.auction.bid + 1;
      if (!Number.isInteger(amount) || amount < low) return toast('Bid at least ' + money(low));
      if (amount > p.budget) return toast('You only have ' + money(p.budget));
      act('bid', { amount: amount });
    }
  });
  app.addEventListener('change', function (e) {
    if (e.target.id === 'private') { ui.listed = !e.target.checked; store.set('dn-listed', ui.listed); }
  });
  app.addEventListener('input', function (e) {
    if (e.target.id === 'name') ui.name = e.target.value;
    if (e.target.id === 'budgetOther') { var v = parseInt(e.target.value, 10); if (v >= 5 && v <= 1000) { ui.budget = v; store.set('dn-budget', v); document.querySelectorAll('[data-budget]').forEach(function (x) { x.setAttribute('aria-pressed', String(+x.dataset.budget === v)); }); } }
    if (e.target.id === 'topic') { ui.customTopic = e.target.value; var c = $('#create'); if (c && !ui.busy && !ui.asking && !ui.ambiguous) c.textContent = pendingTopic() ? 'Use “' + pendingTopic().slice(0, 24) + '”' : (ui.cpu ? 'Play ' + theme().title + ' vs CPU' : 'Create ' + theme().title + ' room'); }
    if (e.target.id === 'code') ui.joinCode = e.target.value.toUpperCase();
  });

  // ---------- boot ----------
  api('/api/presets').then(function (d) { if (d.presets && d.presets.length) { ui.presets = d.presets; if (ui.view === 'home') render(); } }, function () {});
  if (session && (!ui.joinCode || ui.joinCode === session.code)) { ui.view = 'game'; render(); poll(); }
  else { ui.view = ui.joinCode ? 'join' : 'home'; render(); loadOpen(); }
})();
