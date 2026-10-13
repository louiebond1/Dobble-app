// Draft Night v2 client. All game state lives on /api/dn (lib/draftnight); this page renders it and sends moves.
(function () {
  'use strict';
  var app = document.getElementById('app');
  var params = new URLSearchParams(location.search);
  var store = {
    get: function (k, d) { try { var v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  };
  var TIER = { 1: 'Solid', 2: 'Great', 3: 'Showpiece' };
  var ui = {
    tab: params.get('room') ? 'join' : 'create', themes: [], themeId: store.get('dn2-theme', 'house'),
    name: store.get('dn-name', ''), players: store.get('dn2-players', 2), cpu: store.get('dn2-cpu', false),
    rounds: store.get('dn2-rounds', 5), budget: store.get('dn2-budget', 100), listed: store.get('dn2-listed', true),
    joinCode: (params.get('room') || '').toUpperCase().slice(0, 4), open: [], busy: false, error: ''
  };
  var device = store.get('dn-device', '');
  if (!device) { device = Date.now().toString(36) + Math.random().toString(36).slice(2, 10); store.set('dn-device', device); }
  var session = store.get('dn2-session', null); // { code, token }
  var room = null, offset = 0, pollTimer = null, openTimer = null, sending = false, screen = '';

  // ---------- helpers ----------
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function money(n) { return '£' + n; }
  function now() { return Date.now() + offset; }
  function $(s) { return document.querySelector(s); }
  function api(path, body) {
    return fetch('/api/dn' + path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {})
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { d._status = r.status; return d; }); });
  }
  function toast(msg) { var t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(function () { t.hidden = true; }, 2400); }
  function me() { return room ? room.me : -1; }
  function item(id) { return (room && room.items[id]) || { name: '?', blurb: '', tier: 2, kind: 'item' }; }
  function category(id) { return room.theme.categoryInfo.filter(function (c) { return c.id === id; })[0]; }
  // Every picture is a photograph. A photo that has not loaded yet is a neutral tile, never a symbol.
  function photo(url, cls) {
    return url ? '<img class="' + (cls || '') + '" alt="" loading="lazy" src="' + esc(url) + '">' : '<span class="ph ' + (cls || '') + '" aria-hidden="true"></span>';
  }
  function picture(id, cls) { return photo(room && room.art && room.art[id], cls); }
  function tierBadge(t) { return '<span class="tier t' + t + '">' + TIER[t] + '</span>'; }
  function secs(deadline) { return Math.max(0, Math.ceil((deadline - now()) / 1000)); }
  function playerName(i) { return i === me() ? 'You' : room.players[i].name; }
  function rectStyle(r, z) { return 'left:' + r[0] * 100 + '%;top:' + r[1] * 100 + '%;width:' + r[2] * 100 + '%;height:' + r[3] * 100 + '%' + (z ? ';z-index:' + z : ''); }

  // ---------- a player's creation, drawn from the server's layout plan ----------
  // Every purchase is a photograph placed in its own part of the board, so the creation is exactly what was bought.
  // Sites and plots are a grid of aerial photos around the base; rooms and dishes layer purchases on the base photo;
  // Drafter collections are photo cards. Plots nobody has bought yet show empty land, so the board is always whole.
  function board(i, big) {
    var p = room.players[i], t = room.theme, L = p.layout, f = room.frame || { slots: [], fill: [] }, a = t.archetype;
    var tile = function (id, r, role, z) {
      return '<div class="piece ' + role + '" style="' + rectStyle(r, z) + '">' + picture(id) + (big ? '<b>' + esc(item(id).name) + '</b>' : '') + '</div>';
    };
    var land = function (r) { return '<div class="piece land" style="' + rectStyle(r) + '">' + photo(room.emptyArt) + '</div>'; };
    var html = '';
    var base = L.pieces.filter(function (x) { return x.role === 'base'; })[0];
    var items = L.pieces.filter(function (x) { return x.role === 'item'; });
    var ups = L.pieces.filter(function (x) { return x.role === 'upgrade'; });
    if (a === 'site' || a === 'plot') {
      // Before a home is won, its plot is shown as empty land.
      html += base ? tile(base.id, base.rect, 'base', 2) : '<div class="piece base waiting" style="' + rectStyle(f.base) + '">' + photo(room.emptyArt) + (big ? '<b>Wins a ' + esc(startWord()) + ' first</b>' : '') + '</div>';
      items.forEach(function (x) { html += tile(x.id, x.rect, 'item', 2); });
      var taken = items.map(function (x) { return x.rect.join(); });
      f.slots.concat((f.fill || []).map(function (r) { return { rect: r }; })).forEach(function (sl) { if (taken.indexOf(sl.rect.join()) < 0) html += land(sl.rect); });
    } else if (a === 'room' || a === 'stack') {
      // Before pancakes are won, the board is the empty plate.
      html += base ? '<div class="piece backdrop">' + picture(base.id) + '</div>' : '<div class="piece backdrop waiting">' + photo(room.emptyArt) + (big ? '<b>Wins a ' + esc(startWord()) + ' first</b>' : '') + '</div>';
      items.forEach(function (x) { html += tile(x.id, x.rect, 'item ' + (a === 'stack' && x.slot !== 'side' ? 'round' : 'framed'), 3); });
    } else {
      items.forEach(function (x) { html += tile(x.id, x.rect, 'card', 2); });
      f.slots.slice(items.length).forEach(function (sl) { html += '<div class="piece card open" style="' + rectStyle(sl.rect) + '">' + (big ? '<b>Still to pick</b>' : '') + '</div>'; });
    }
    // Upgrades change the base itself: shown as photo badges on it, latest of each kind only.
    var strip = big && ups.length ? '<div class="ups">' + ups.map(function (x) { return '<span class="up">' + picture(x.id) + '<b>' + esc(item(x.id).name) + '</b></span>'; }).join('') + '</div>' : '';
    return '<div class="board ' + a + (big ? ' big' : '') + '" style="--c:' + p.color + '">' + html + '</div>' + strip;
  }
  function startWord() { return room.theme.archetype === 'plot' ? 'home' : room.theme.noun.split(' ').slice(-1)[0]; }
  function owned(i) {
    var p = room.players[i];
    return (p.base ? [p.base] : []).concat(p.items).map(function (id) {
      var h = room.history.filter(function (e) { return e.id === id; })[0];
      return '<li><span class="mini">' + picture(id) + '</span><span class="nm">' + esc(item(id).name) + '</span><span class="num">' + (h ? (h.how === 'pick' ? 'Free pick' : money(h.price)) : '') + '</span></li>';
    }).join('');
  }

  // ---------- home ----------
  function renderHome() {
    screen = 'home';
    var t = ui.themes.filter(function (x) { return x.id === ui.themeId; })[0] || ui.themes[0];
    var tiles = ui.themes.map(function (x) {
      return '<button class="theme" data-theme="' + x.id + '" aria-pressed="' + (t && x.id === t.id) + '"><span class="cover">' + photo(x.cover) + '</span><b>' + esc(x.title) + '</b><span class="mode">' + (x.mode === 'drafter' ? 'Drafter' : 'Builder') + '</span></button>';
    }).join('');
    var seg = function (key, values, label) {
      return '<div class="seg">' + values.map(function (v) { return '<button data-' + key + '="' + v + '" aria-pressed="' + (ui[key] === v) + '">' + label(v) + '</button>'; }).join('') + '</div>';
    };
    var maxRounds = t ? t.maxRounds : 6;
    var create = !t ? '<p class="muted">Loading games…</p>' :
      '<div class="eyebrow">Game</div><div class="themes">' + tiles + '</div>' +
      '<div class="brief"><b>' + esc(t.title) + '</b><p>' + esc(t.intro) + '</p><p class="muted">Rounds: ' + esc(t.categories.join(' · ')) + (t.upgrades ? ' · upgrades every round' : '') + '</p></div>' +
      '<div class="eyebrow">Your name</div><input id="name" maxlength="16" autocomplete="nickname" placeholder="Name" value="' + esc(ui.name) + '">' +
      '<div class="eyebrow">Players</div>' + seg('players', [2, 3, 4, 5, 6], String) + '<label class="check"><input type="checkbox" id="cpu"' + (ui.cpu ? ' checked' : '') + '><span>Play against the computer</span></label>' +
      '<div class="eyebrow">Items each</div>' + seg('rounds', [3, 4, 5, 6].filter(function (n) { return n <= maxRounds; }), String) +
      '<p class="hint">' + (t.hasBaseRound ? 'Everyone wins a ' + (t.archetype === 'plot' ? 'home' : 'base') + ' first, then one item per round.' : 'One item per round, one round per category.') + ' Every player ends with the same number.</p>' +
      '<div class="eyebrow">Budget each</div>' + seg('budget', [20, 50, 100, 200], money) +
      (ui.cpu ? '' : '<label class="check"><input type="checkbox" id="listed"' + (ui.listed ? ' checked' : '') + '><span>List in Join game so friends can tap in</span></label>') +
      (ui.error ? '<p class="error">' + esc(ui.error) + '</p>' : '') +
      '<button class="primary" data-create' + (ui.busy ? ' disabled' : '') + '>' + (ui.busy ? 'Creating…' : 'Create game') + '</button>';
    var join = '<div class="eyebrow">Your name</div><input id="name" maxlength="16" placeholder="Name" value="' + esc(ui.name) + '">' +
      '<div class="eyebrow">Open games</div><div id="open">' + openHtml() + '</div>' +
      '<div class="eyebrow">Room code</div><form id="joinform" class="row"><input id="code" maxlength="4" autocapitalize="characters" placeholder="ABCD" value="' + esc(ui.joinCode) + '"><button class="secondary" type="submit">Join</button></form>' +
      (ui.error ? '<p class="error">' + esc(ui.error) + '</p>' : '');
    app.innerHTML = '<div class="screen"><div class="bar"><a class="link" href="/">‹ Party</a><span class="wordmark">Draft Night</span><span style="width:48px"></span></div><div class="content">' +
      '<h1>Bid. Build. Brag.</h1><p class="muted">Everyone gets the same money. Win one thing per round, build the best creation, then vote.</p>' +
      '<div class="tabs"><button data-tab="create" aria-pressed="' + (ui.tab === 'create') + '">Create game</button><button data-tab="join" aria-pressed="' + (ui.tab === 'join') + '">Join game</button></div>' +
      (ui.tab === 'create' ? create : join) + '</div></div>';
    if (ui.tab === 'join') loadOpen();
  }
  function openHtml() {
    if (!ui.open.length) return '<p class="muted">No open games right now.</p>';
    return '<ul class="open">' + ui.open.map(function (g) {
      return '<li><button data-open="' + g.code + '"><span><b>' + esc(g.host) + '’s ' + esc(g.theme.title) + '</b><span class="muted">' + g.players.length + '/' + g.capacity + ' players · ' + g.rounds + ' rounds · ' + money(g.budget) + '</span></span><span class="go">Join</span></button></li>';
    }).join('') + '</ul>';
  }
  function loadOpen() {
    clearTimeout(openTimer);
    if (screen !== 'home' || ui.tab !== 'join') return;
    api('/lobbies').then(function (d) { ui.open = d.rooms || []; var el = $('#open'); if (el) el.innerHTML = openHtml(); }, function () {})
      .then(function () { openTimer = setTimeout(loadOpen, 2500); });
  }
  function rememberName() { var el = $('#name'); if (el) { ui.name = el.value.trim(); store.set('dn-name', ui.name); } }
  function createGame() {
    rememberName();
    if (!ui.name) { ui.error = 'Add your name first.'; return renderHome(); }
    ui.busy = true; ui.error = ''; renderHome();
    api('/create', { theme: ui.themeId, name: ui.name, capacity: ui.cpu ? 2 : ui.players, cpu: ui.cpu, rounds: ui.rounds, budget: ui.budget, listed: ui.listed, device: device })
      .then(function (d) { ui.busy = false; if (d.error) { ui.error = d.error; return renderHome(); } enter(d); }, function () { ui.busy = false; ui.error = 'No connection to the game server.'; renderHome(); });
  }
  function joinGame(code) {
    rememberName();
    if (!ui.name) { ui.error = 'Add your name first.'; return renderHome(); }
    api('/join', { code: code, name: ui.name, device: device }).then(function (d) { if (d.error) { ui.error = d.error; return renderHome(); } enter(d); }, function () { ui.error = 'No connection to the game server.'; renderHome(); });
  }
  function enter(d) {
    session = { code: d.code, token: d.token }; store.set('dn2-session', session);
    history.replaceState(null, '', location.pathname + '?room=' + d.code);
    accept(d.room); poll();
  }

  // ---------- sync ----------
  function accept(r) {
    if (!r || r.same) return;
    offset = r.now - Date.now();
    room = r;
    render();
  }
  function poll() {
    clearTimeout(pollTimer);
    if (!session) return;
    api('/room?code=' + session.code + '&t=' + encodeURIComponent(session.token) + '&rev=' + (room ? room.rev : '')).then(function (d) {
      if (d._status === 404) { leave('That game has ended.'); return; }
      if (d.same) offset = d.now - Date.now(); else accept(d);
    }, function () {}).then(function () { pollTimer = setTimeout(poll, room && room.status === 'playing' ? 700 : 1500); });
  }
  function act(type, extra) {
    if (sending) return;
    sending = true;
    var body = { code: session.code, token: session.token, type: type, round: room.round ? room.round.index : -1, lot: room.auction ? room.auction.lot : -1, seen: room.auction ? room.auction.bid : -1 };
    for (var k in extra) body[k] = extra[k];
    api('/action', body).then(function (d) {
      sending = false;
      if (d.error) { toast(d.error); if (d.room) accept(d.room); return; }
      accept(d);
    }, function () { sending = false; toast('Connection lost. Try again.'); });
  }
  function leave(msg) {
    if (session && room && room.status === 'lobby') api('/leave', { code: session.code, token: session.token });
    session = null; room = null; store.set('dn2-session', null); clearTimeout(pollTimer);
    history.replaceState(null, '', location.pathname);
    if (msg) ui.error = msg;
    renderHome();
  }

  // ---------- lobby ----------
  function renderLobby() {
    screen = 'lobby';
    var t = room.theme, host = me() === 0, n = room.players.length;
    var link = location.origin + location.pathname + '?room=' + room.code;
    app.innerHTML = '<div class="screen"><div class="bar"><button class="link" data-leave>‹ Leave</button><span class="wordmark">Draft Night</span><span class="code num">' + esc(room.code) + '</span></div><div class="content">' +
      '<div class="brief"><b>' + esc(t.title) + '</b><p>' + esc(t.intro) + '</p><p class="muted">' + room.roundsWanted + ' items each' + (t.hasBaseRound ? ' plus a ' + (t.archetype === 'plot' ? 'home' : 'base') : '') + ' · ' + money(room.budget) + ' each' + (t.upgrades ? ' · upgrades every round' : '') + '</p></div>' +
      '<div class="eyebrow">Players ' + n + '/' + room.capacity + '</div><ul class="seats">' + room.players.map(function (p, i) {
        return '<li style="--c:' + p.color + '"><span class="dot"></span>' + esc(p.name) + (i === me() ? ' <span class="muted">(you)</span>' : '') + (i === 0 ? ' <span class="muted">· host</span>' : '') + '</li>';
      }).join('') + '</ul>' +
      (room.notice ? '<p class="muted">' + esc(room.notice) + '</p>' : '') +
      '<div class="eyebrow">Invite</div><div class="row"><span class="big-code num">' + esc(room.code) + '</span><button class="secondary" data-share="' + esc(link) + '">Share link</button></div>' +
      (host ? '<button class="primary" data-start' + (n < 2 ? ' disabled' : '') + '>' + (n < 2 ? 'Waiting for players…' : 'Start game') + '</button>' : '<p class="muted center">Waiting for ' + esc(room.players[0].name) + ' to start…</p>') +
      '</div></div>';
  }

  // ---------- game ----------
  function lotCard(l, i) {
    var a = room.auction, live = room.phase === 'bidding' && a && a.lot === i;
    var picking = room.phase === 'picking' && room.pick && room.pick.who === me() && l.state === 'waiting';
    var state = l.state === 'sold' ? playerName(l.winner) + ' · ' + money(l.price) : l.state === 'picked' ? playerName(l.winner) + ' · free' : l.state === 'unsold' ? 'Set aside' : l.state === 'left' ? 'Not taken' : live ? 'Up now' : '';
    var x = item(l.id);
    return '<button class="lot-card ' + l.state + (live ? ' live' : '') + (picking ? ' choosable' : '') + '"' + (picking ? ' data-pick="' + esc(l.id) + '"' : ' data-info="' + esc(l.id) + '"') + (l.winner != null ? ' style="--c:' + room.players[l.winner].color + '"' : '') + '>' +
      '<span class="pic">' + picture(l.id) + '</span><span class="nm">' + esc(x.name) + '</span>' + (x.kind === 'upgrade' ? '<span class="kind">Upgrade</span>' : '') + '<span class="st">' + esc(state) + '</span></button>';
  }
  // A warning when a lot would replace something you already own (a second batter, a bed upgrade).
  function replacesNote(id) {
    var x = item(id), p = room.players[me()]; if (!p) return '';
    if (x.kind === 'upgrade' && x.group) {
      var clash = p.items.filter(function (o) { return item(o).kind === 'upgrade' && item(o).group === x.group; })[0];
      if (clash) return 'Replaces your ' + item(clash).name;
    }
    if (x.kind === 'item') { var c = category(x.category); if (c && c.replaces) return 'Replaces the basic ' + c.replaces; }
    if (x.kind === 'upgrade') return 'Upgrades your ' + startWord();
    return '';
  }
  function stage() {
    var rd = room.round, a = room.auction;
    if (room.phase === 'market') {
      return '<div class="stage market"><div class="eyebrow">Round ' + (rd.index + 1) + ' of ' + rd.total + '</div><h2>' + esc(rd.name) + '</h2><p class="muted">' + (rd.kind === 'base' ? 'Everyone ends with one. Auctions start in ' + secs(room.deadline) + 's.' : 'Everyone wins one of these. Auctions start in ' + secs(room.deadline) + 's.') + '</p></div>';
    }
    if (room.phase === 'picking') {
      var who = room.pick.who;
      return '<div class="stage pick"><div class="eyebrow">Free choice</div><h2>' + (who === me() ? 'Choose yours' : esc(room.players[who].name) + ' is choosing') + '</h2><p class="muted">' + (who === me() ? 'Tap any lot that’s still waiting. It’s free.' : 'Free picks go to whoever has the least money first.') + ' <span class="num" data-count>' + secs(room.deadline) + 's</span></p></div>';
    }
    var lotIndex = a ? a.lot : room.result ? room.result.lot : 0, l = rd.lots[lotIndex], x = item(l.id);
    var status = '';
    if (room.phase === 'sold' && room.result) status = room.result.winner === null ? '<div class="verdict">' + esc(room.result.note) + '</div>' : '<div class="verdict won" style="--c:' + room.players[room.result.winner].color + '">' + esc(playerName(room.result.winner)) + ' won it for ' + money(room.result.price) + '</div>';
    else if (a) {
      var lead = a.leader === null ? 'No bids yet' : esc(playerName(a.leader)) + ' lead' + (a.leader === me() ? '' : 's') + ' at <b class="num">' + money(a.bid) + '</b>';
      var turn = a.turn === null ? '' : a.turn === me() ? 'Your turn' : esc(room.players[a.turn].name) + '’s turn';
      status = '<div class="status"><span>' + lead + '</span><span>' + turn + ' · <span class="num" data-count>' + secs(room.deadline) + 's</span></span></div>' +
        '<div class="trail">' + a.log.map(function (e) { return '<span style="--c:' + room.players[e.p].color + '">' + esc(room.players[e.p].name) + ' ' + (e.a === null ? (e.why ? e.why : 'passed') : money(e.a)) + '</span>'; }).join('') + '</div>';
    }
    var note = replacesNote(l.id);
    return '<div class="stage"><div class="hero">' + picture(l.id, 'hero-img') + '</div><div class="lot-info"><div class="eyebrow">Round ' + (rd.index + 1) + ' of ' + rd.total + ' · ' + esc(rd.name) + '</div><h2>' + esc(x.name) + '</h2><p class="muted">' + esc(x.blurb) + '</p><p>' + tierBadge(x.tier) + (note ? ' <span class="note">' + esc(note) + '</span>' : '') + '</p></div>' + status + '</div>';
  }
  function dock() {
    var a = room.auction, p = room.players[me()];
    if (!p) return '<p class="muted center">Watching</p>';
    if (room.phase === 'bidding' && a) {
      if (room.players[me()].got) return '<p class="muted center">You’ve got yours this round. Watching…</p>';
      if (a.out[me()]) return '<p class="muted center">You passed on this one.</p>';
      if (a.leader === me()) return '<p class="center">You’re leading at <b class="num">' + money(a.bid) + '</b></p>';
      if (a.turn !== me()) return '<p class="muted center">Waiting for ' + esc(room.players[a.turn].name) + '…</p>';
      var steps = [1, 2, 5, 10].map(function (s) { return a.bid + s; }).filter(function (v) { return v <= p.budget; });
      return '<div class="bids">' + steps.map(function (v, i) { return '<button class="' + (i ? 'secondary' : 'primary') + ' num" data-bid="' + v + '">' + money(v) + '</button>'; }).join('') + '</div>' +
        '<form id="custom" class="row"><input id="amount" type="number" inputmode="numeric" min="' + (a.bid + 1) + '" max="' + p.budget + '" placeholder="Other amount"><button class="secondary" type="submit">Bid</button><button class="ghost" type="button" data-pass>Pass</button></form>';
    }
    if (room.phase === 'picking' && room.pick.who === me()) return '<p class="center">Tap a lot above to take it free.</p>';
    if (p.got) return '<p class="muted center">You’ve got yours this round.</p>';
    return '';
  }
  function playersHtml() {
    var a = room.auction;
    return room.players.map(function (p, i) {
      var sub = p.got ? 'Got one this round' : a && room.phase === 'bidding' ? (a.leader === i ? 'Leading' : a.turn === i ? 'Deciding' : a.out[i] ? 'Passed' : '') : '';
      return '<button class="who' + (a && a.leader === i && room.phase === 'bidding' ? ' leading' : '') + '" data-world="' + i + '" style="--c:' + p.color + '">' + board(i, false) +
        '<span class="meta"><span class="dot"></span><b>' + esc(p.name) + (i === me() ? ' (you)' : '') + '</b><span class="num">' + money(p.budget) + '</span></span><span class="sub">' + esc(sub + (p.away ? ' · away' : '')) + '</span></button>';
    }).join('');
  }
  function renderGame() {
    screen = 'game';
    var rd = room.round;
    app.innerHTML = '<div class="game"><div class="bar"><button class="icon-btn" data-menu aria-label="Leave">‹</button><div class="progress"><span>' + esc(room.theme.title) + '</span><i><b style="width:' + (100 * (rd.index + (room.phase === 'market' ? 0 : 0.5)) / rd.total) + '%"></b></i></div><span class="code num">' + esc(room.code) + '</span></div>' +
      '<div class="layout"><div class="main">' +
      '<div class="market"><div class="eyebrow">Round ' + (rd.index + 1) + ' · ' + esc(rd.name) + ' · ' + rd.lots.length + ' lots, everyone gets one</div><div class="lots">' + rd.lots.map(lotCard).join('') + '</div></div>' +
      stage() + '<div class="dock">' + dock() + '</div></div>' +
      '<aside class="side"><div class="eyebrow">Creations</div><div class="players' + (room.players.length > 2 ? ' many' : '') + '">' + playersHtml() + '</div></aside></div></div>';
  }

  // ---------- voting and results ----------
  function renderVoting() {
    screen = 'voting';
    var mine = room.votes && room.votes.mine, n = room.players.length;
    var done = room.players.filter(function (p) { return p.voted; }).length;
    app.innerHTML = '<div class="screen"><div class="bar"><span></span><span class="wordmark">Draft Night</span><span class="code num">' + esc(room.code) + '</span></div><div class="content wide">' +
      '<h1>Vote for the best ' + esc(room.theme.noun) + '</h1><p class="muted">Not your own. ' + done + ' of ' + n + ' voted · closes in <span class="num" data-count>' + secs(room.deadline) + 's</span></p>' +
      '<div class="compare">' + room.players.map(function (p, i) {
        var self = i === me();
        return '<div class="entry" style="--c:' + p.color + '">' + board(i, true) + '<h3><span class="dot"></span>' + esc(p.name) + (self ? ' (you)' : '') + '</h3><ul class="owned">' + owned(i) + '</ul>' +
          (self ? '' : '<button class="' + (mine === i ? 'primary' : 'secondary') + '" data-vote="' + i + '">' + (mine === i ? 'Your vote' : 'Vote for ' + esc(p.name)) + '</button>') + '</div>';
      }).join('') + '</div></div></div>';
  }
  function renderFinal() {
    screen = 'final';
    var w = room.winners, names = w.players.map(function (i) { return room.players[i].name; });
    var head = names.length > 1 ? 'A draw: ' + names.join(' & ') : names[0] + ' wins!';
    var why = w.tiebreak === 'score' ? 'Tied on votes, so the higher creation score wins (Showpiece 3, Great 2, Solid 1).' : w.tiebreak === 'shared' ? 'Tied on votes and creation score.' : '';
    app.innerHTML = '<div class="screen"><div class="bar"><button class="link" data-leave>‹ New game</button><span class="wordmark">Draft Night</span><span style="width:60px"></span></div><div class="content wide">' +
      '<div class="eyebrow">' + esc(room.theme.title) + ' · Final reveal</div><h1>' + esc(head) + '</h1>' + (why ? '<p class="muted">' + why + '</p>' : '') +
      '<div class="compare">' + room.players.map(function (p, i) {
        var win = w.players.indexOf(i) >= 0;
        return '<div class="entry' + (win ? ' winner' : '') + '" style="--c:' + p.color + '">' + board(i, true) + '<h3><span class="dot"></span>' + esc(p.name) + (win ? ' <span class="crown">Winner</span>' : '') + '</h3><p class="muted num">' + w.score[i] + ' vote' + (w.score[i] === 1 ? '' : 's') + ' · score ' + w.points[i] + ' · spent ' + money(room.budget - p.budget) + ' · ' + money(p.budget) + ' left</p><ul class="owned">' + owned(i) + '</ul></div>';
      }).join('') + '</div><button class="primary" data-leave>Play again</button></div></div>';
  }

  // ---------- render loop ----------
  var last = '';
  function render() {
    if (!room) return renderHome();
    // Redraw only when something visible changed; the countdown updates in place.
    var key = room.rev + ':' + room.status + ':' + room.me;
    if (key === last && screen !== 'home') return;
    last = key;
    var scroll = window.scrollY, typed = $('#amount') && $('#amount').value;
    if (room.status === 'lobby') renderLobby();
    else if (room.status === 'playing') renderGame();
    else if (room.status === 'voting') renderVoting();
    else renderFinal();
    if (typed && $('#amount')) $('#amount').value = typed;
    window.scrollTo(0, scroll);
  }
  setInterval(function () { if (!room) return; document.querySelectorAll('[data-count]').forEach(function (el) { el.textContent = secs(room.deadline) + 's'; }); }, 250);

  function openWorld(i) {
    var p = room.players[i], sheet = $('#sheet');
    sheet.innerHTML = '<div class="sheet-body" role="dialog" aria-modal="true" aria-label="' + esc(p.name) + '"><div class="grab"></div><h3 style="--c:' + p.color + '"><span class="dot"></span>' + esc(p.name) + ' · ' + money(p.budget) + ' left</h3>' + board(i, true) + '<ul class="owned">' + owned(i) + '</ul><button class="secondary" data-close>Close</button></div>';
    sheet.hidden = false;
  }
  function openInfo(id) {
    var x = item(id), sheet = $('#sheet');
    sheet.innerHTML = '<div class="sheet-body" role="dialog" aria-modal="true"><div class="grab"></div><div class="hero">' + picture(id, 'hero-img') + '</div><h3>' + esc(x.name) + '</h3><p class="muted">' + esc(x.blurb) + '</p><p>' + tierBadge(x.tier) + (replacesNote(id) ? ' <span class="note">' + esc(replacesNote(id)) + '</span>' : '') + '</p><button class="secondary" data-close>Close</button></div>';
    sheet.hidden = false;
  }
  $('#sheet').addEventListener('click', function (e) { if (e.target.id === 'sheet' || e.target.closest('[data-close]')) $('#sheet').hidden = true; });

  app.addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    var d = b.dataset;
    if (d.tab) { ui.tab = d.tab; ui.error = ''; rememberName(); renderHome(); }
    else if (d.theme) { ui.themeId = d.theme; store.set('dn2-theme', d.theme); var t = ui.themes.filter(function (x) { return x.id === d.theme; })[0]; if (t && ui.rounds > t.maxRounds) ui.rounds = t.maxRounds; rememberName(); renderHome(); }
    else if (d.players) { ui.players = Number(d.players); ui.cpu = false; store.set('dn2-players', ui.players); store.set('dn2-cpu', false); rememberName(); renderHome(); }
    else if (d.rounds) { ui.rounds = Number(d.rounds); store.set('dn2-rounds', ui.rounds); rememberName(); renderHome(); }
    else if (d.budget) { ui.budget = Number(d.budget); store.set('dn2-budget', ui.budget); rememberName(); renderHome(); }
    else if (d.create !== undefined) createGame();
    else if (d.open) joinGame(d.open);
    else if (d.start !== undefined) act('start');
    else if (d.leave !== undefined || d.menu !== undefined) { if (d.menu === undefined || confirm('Leave this game?')) leave(); }
    else if (d.share) { if (navigator.share) navigator.share({ title: 'Draft Night', text: 'Join my Draft Night game: ' + room.code, url: d.share }).catch(function () {}); else if (navigator.clipboard) navigator.clipboard.writeText(d.share).then(function () { toast('Invite link copied'); }); }
    else if (d.bid) act('bid', { amount: Number(d.bid) });
    else if (d.pass !== undefined) act('pass');
    else if (d.pick) act('pick', { id: d.pick });
    else if (d.info) openInfo(d.info);
    else if (d.vote) act('vote', { target: Number(d.vote) });
    else if (d.world) openWorld(Number(d.world));
  });
  app.addEventListener('change', function (e) {
    if (e.target.id === 'cpu') { ui.cpu = e.target.checked; store.set('dn2-cpu', ui.cpu); rememberName(); renderHome(); }
    if (e.target.id === 'listed') { ui.listed = e.target.checked; store.set('dn2-listed', ui.listed); }
  });
  app.addEventListener('submit', function (e) {
    e.preventDefault();
    if (e.target.id === 'joinform') { var c = $('#code').value.trim().toUpperCase(); if (c.length === 4) joinGame(c); else toast('Room codes are 4 letters'); }
    if (e.target.id === 'custom') { var v = parseInt($('#amount').value, 10); if (v > 0) act('bid', { amount: v }); }
  });
  document.addEventListener('visibilitychange', function () { if (!document.hidden && session) poll(); });

  api('/themes').then(function (d) { ui.themes = d.themes || []; if (!ui.themes.some(function (t) { return t.id === ui.themeId; })) ui.themeId = ui.themes[0] && ui.themes[0].id; if (!room) renderHome(); });
  if (session && (!ui.joinCode || ui.joinCode === session.code)) poll();
  else if (ui.joinCode) { ui.tab = 'join'; renderHome(); }
  else renderHome();
})();
