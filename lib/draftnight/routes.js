// Draft Night v2 HTTP API, served by the main Dobble Party app under /api/dn. Phones poll /api/dn/room with the last
// revision they saw; moves go to /api/dn/action. Rooms are in memory, like the other party games in this app.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const { loadThemes, summary } = require('./spec');
const { artKey } = require('./layout');
const engine = require('./engine');

const LOBBY_IDLE_MS = 120000, ROOM_TTL_MS = 8 * 3600e3;
const CODE = 'ABCDEFGHJKMNPQRSTUVWXYZ';

// Pictures are pre-made assets in public/draft-night/art/<archetype>/<slot>/<name>.webp, drawn once and reused by every
// game. Items without art yet fall back to their category emoji in the client.
function artIndex(root) {
  const out = new Set();
  const walk = dir => { if (!fs.existsSync(dir)) return; for (const f of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, f.name); if (f.isDirectory()) walk(p); else if (/\.(webp|png|jpg)$/.test(f.name)) out.add(path.relative(root, p).replace(/\\/g, '/')); } };
  walk(root);
  return out;
}

function draftNight(app, { publicDir = path.join(__dirname, '../../public'), clock = Date.now, rng = Math.random, timing } = {}) {
  const themes = loadThemes(), rooms = new Map();
  const artRoot = path.join(publicDir, 'draft-night/art');
  const art = artIndex(artRoot);
  const artFor = (t, ids) => {
    const out = {};
    for (const id of ids) {
      const key = artKey(t, t.index[id]);
      const file = ['webp', 'png', 'jpg'].map(e => key + '.' + e).find(f => art.has(f));
      if (file) out[id] = '/draft-night/art/' + file;
    }
    return out;
  };
  const view = (r, me) => {
    const v = engine.view(r.game, me);
    v.code = r.code; v.listed = r.listed; v.notice = r.notice; v.host = 0;
    v.art = artFor(r.game.theme, Object.keys(v.items));
    return v;
  };
  const sweep = () => { for (const [k, r] of rooms) if (r.created < clock() - ROOM_TTL_MS) rooms.delete(k); };
  const newCode = () => { let c; do c = Array.from({ length: 4 }, () => CODE[crypto.randomInt(CODE.length)]).join(''); while (rooms.has(c)); return c; };
  const clean = (x, d) => String(x || '').replace(/[^\p{L}\p{N} '\-]/gu, '').trim().slice(0, 16) || d;
  const device = x => String(x || '').replace(/[^\w-]/g, '').slice(0, 64);
  const seat = (r, token) => token ? r.tokens.indexOf(String(token)) : -1;
  const join = (r, name, cpu, dev) => { const p = engine.addPlayer(r.game, name, { cpu }); r.tokens.push(crypto.randomUUID()); r.devices.push(dev || ''); return p; };
  // Before the start a quiet phone loses its seat; if the host goes, the next player hosts.
  const tidy = r => {
    if (r.game.status !== 'lobby') return;
    for (let i = r.game.players.length - 1; i > 0; i--) {
      const p = r.game.players[i];
      if (!p.cpu && clock() - p.seen > LOBBY_IDLE_MS) unseat(r, i, 'left');
    }
  };
  const unseat = (r, p, why) => {
    const gone = r.game.players[p].name;
    engine.removePlayer(r.game, p); r.tokens.splice(p, 1); r.devices.splice(p, 1);
    if (!r.game.players.some(x => !x.cpu)) { rooms.delete(r.code); return; }
    r.notice = p === 0 ? `${gone} ${why}. ${r.game.players[0].name} is now the host.` : `${gone} ${why}.`;
  };

  const api = express.Router();
  api.use(express.json({ limit: '16kb' }));
  api.get('/themes', (req, res) => res.json({ themes: themes.map(t => ({ ...summary(t), cover: artFor(t, [t.base ? t.base.id : t.categories[0].items.find(x => x.tier === 3).id])[t.base ? t.base.id : t.categories[0].items.find(x => x.tier === 3).id] || null })) }));
  api.post('/create', (req, res) => {
    sweep();
    const b = req.body || {}, theme = themes.find(t => t.id === b.theme);
    if (!theme) return res.status(400).json({ error: 'Choose a game to play' });
    const cpu = Boolean(b.cpu);
    const game = engine.createRoom({ theme, budget: b.budget, rounds: b.rounds, capacity: cpu ? 2 : b.capacity, rng, clock, timing });
    const r = { code: newCode(), game, tokens: [], devices: [], created: clock(), listed: !cpu && b.listed !== false, notice: '' };
    rooms.set(r.code, r);
    join(r, clean(b.name, 'Player 1'), false, device(b.device));
    if (cpu) join(r, 'CPU', true);
    res.json({ code: r.code, token: r.tokens[0], room: view(r, 0) });
  });
  api.post('/join', (req, res) => {
    const b = req.body || {}, r = rooms.get(String(b.code || '').toUpperCase());
    if (!r) return res.status(404).json({ error: 'That game has closed' });
    engine.tick(r.game); tidy(r);
    if (rooms.get(r.code) !== r) return res.status(404).json({ error: 'That game has closed' });
    // The same phone joining again gets its own seat back.
    const dev = device(b.device), mine = dev ? r.devices.indexOf(dev) : -1;
    if (mine >= 0) { r.game.players[mine].seen = clock(); return res.json({ code: r.code, token: r.tokens[mine], room: view(r, mine) }); }
    if (r.game.status !== 'lobby') return res.status(409).json({ error: 'That game has already started' });
    if (r.game.players.length >= r.game.capacity) return res.status(409).json({ error: 'That game just filled up' });
    const p = join(r, clean(b.name, 'Player ' + (r.game.players.length + 1)), false, dev);
    r.notice = ''; r.game.rev++;
    res.json({ code: r.code, token: r.tokens[p], room: view(r, p) });
  });
  api.post('/leave', (req, res) => {
    const b = req.body || {}, r = rooms.get(String(b.code || '').toUpperCase());
    if (r && r.game.status === 'lobby') { const p = seat(r, b.token); if (p >= 0) { unseat(r, p, 'left'); r.game.rev++; } }
    res.json({ ok: true });
  });
  api.get('/lobbies', (req, res) => {
    const out = [];
    for (const r of rooms.values()) {
      tidy(r);
      const g = r.game;
      if (rooms.get(r.code) !== r || !r.listed || g.status !== 'lobby' || g.players.length >= g.capacity || clock() - g.players[0].seen > LOBBY_IDLE_MS) continue;
      out.push({ code: r.code, host: g.players[0].name, theme: { title: g.theme.title, emoji: g.theme.emoji }, players: g.players.map(p => p.name), capacity: g.capacity, rounds: g.roundsWanted, budget: g.budget, created: r.created });
    }
    res.json({ rooms: out.sort((a, b) => b.created - a.created).slice(0, 20), now: clock() });
  });
  api.get('/room', (req, res) => {
    const r = rooms.get(String(req.query.code || '').toUpperCase());
    if (!r) return res.status(404).json({ error: 'Room not found' });
    const p = seat(r, req.query.t);
    if (p >= 0) r.game.players[p].seen = clock();
    engine.tick(r.game); tidy(r);
    if (rooms.get(r.code) !== r) return res.status(404).json({ error: 'Room not found' });
    const me = seat(r, req.query.t);
    res.set('Cache-Control', 'no-store');
    if (Number(req.query.rev) === r.game.rev) return res.json({ same: true, rev: r.game.rev, now: clock(), me });
    res.json(view(r, me));
  });
  api.post('/action', (req, res) => {
    const b = req.body || {}, r = rooms.get(String(b.code || '').toUpperCase());
    if (!r) return res.status(404).json({ error: 'Room not found' });
    const p = seat(r, b.token);
    if (p < 0) return res.status(403).json({ error: 'Session expired. Please rejoin.' });
    try { engine.act(r.game, p, b); }
    catch (e) { return res.status(e.stale ? 409 : 400).json({ error: e.message, room: view(r, p) }); }
    res.json(view(r, p));
  });
  app.use('/api/dn', api);
  return { rooms, themes };
}

module.exports = { draftNight };
