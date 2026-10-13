// Draft Night v2 HTTP API, photo library and board frames, run against the real Express routes.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const { draftNight } = require('../lib/draftnight/routes');
const { loadThemes, ARCHETYPES } = require('../lib/draftnight/spec');
const { photoJobs, emptyKey } = require('../lib/draftnight/photos');
const { artKey } = require('../lib/draftnight/layout');

const THEMES = loadThemes();
const { fixtureArt } = require('../draft-night/e2e/fixture-art');

async function server(opts = {}) {
  let t = 1e9;
  const app = express(), clock = () => t;
  const dn = draftNight(app, { clock, timing: { market: 10, sold: 10, cpu: 10 }, ...opts });
  const srv = await new Promise(ok => { const s = app.listen(0, () => ok(s)); });
  const base = 'http://127.0.0.1:' + srv.address().port;
  const call = async (p, body) => { const r = await fetch(base + p, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}); return { status: r.status, body: r.headers.get('content-type')?.includes('json') ? await r.json() : await r.arrayBuffer() }; };
  return { call, base, close: () => srv.close(), advance: ms => { t += ms; }, dn };
}

test('the photo plan covers every picture any game can show, with unique positive prompts', () => {
  const jobs = photoJobs(THEMES), keys = new Set(jobs.map(j => j.key));
  for (const t of THEMES) {
    for (const x of Object.values(t.index)) assert.ok(keys.has(artKey(t, x)), t.id + ' ' + x.name);
    if (t.archetype === 'site' || t.archetype === 'plot') assert.ok(keys.has(emptyKey(t)), t.id + ' empty land');
  }
  assert.equal(new Set(jobs.map(j => j.prompt)).size, jobs.length, 'every picture has its own prompt');
  for (const j of jobs) {
    assert.doesNotMatch(j.prompt, /\b(no|not|never|without|avoid)\b/i, 'FLUX has no negative prompting: ' + j.key);
    assert.doesNotMatch(j.prompt, /[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}]/u, 'no emoji in prompts');
    assert.match(j.prompt, /photograph/i, 'every picture is a photograph');
  }
});

test('site and plot boards cover the whole grid exactly once, whatever the round count', () => {
  const engine = require('../lib/draftnight/engine');
  for (const t of THEMES) for (let rounds = 1; rounds <= t.categories.length; rounds++) {
    const room = engine.createRoom({ theme: t, capacity: 2, rounds, rng: () => 0.3 });
    engine.addPlayer(room, 'A'); engine.addPlayer(room, 'B'); engine.act(room, 0, { type: 'start' });
    const f = engine.view(room, 0).frame, a = ARCHETYPES[t.archetype];
    assert.equal(f.slots.length, rounds, t.id);
    if (a.grid) {
      const cells = [f.base, ...f.slots.map(s => s.rect), ...f.fill].map(r => r.join());
      assert.equal(new Set(cells).size, 9, t.id + ' ' + rounds + ': nine distinct tiles');
      assert.equal(cells.length, 9, t.id + ' ' + rounds + ': no tile drawn twice');
    }
  }
});

test('API: create, join, lobby list, start, play to voting and results, with photos for every piece', async () => {
  const s = await server({ artRoot: fixtureArt() });
  try {
    const themes = (await s.call('/api/dn/themes')).body.themes;
    assert.equal(themes.length, THEMES.length);
    assert.ok(themes.every(t => t.cover && t.cover.startsWith('/draft-night/art/')), 'every game has a cover photo');
    const cover = await s.call(themes[0].cover);
    assert.equal(cover.status, 200, 'art is served');
    const a = (await s.call('/api/dn/create', { theme: 'zoo', name: 'Louie', capacity: 3, rounds: 4, budget: 50, device: 'phone-a' })).body;
    assert.match(a.code, /^[A-Z]{4}$/);
    assert.equal((await s.call('/api/dn/lobbies')).body.rooms[0].code, a.code, 'listed for Join game');
    const b = (await s.call('/api/dn/join', { code: a.code, name: 'Ariel', device: 'phone-b' })).body;
    const again = (await s.call('/api/dn/join', { code: a.code, name: 'Ariel', device: 'phone-b' })).body;
    assert.equal(again.token, b.token, 'the same phone gets its own seat back');
    const c = (await s.call('/api/dn/join', { code: a.code.toLowerCase(), name: 'Ariel', device: 'phone-c' })).body;
    assert.equal(c.room.players[2].name, 'Ariel 2', 'duplicate names are numbered');
    assert.equal((await s.call('/api/dn/join', { code: a.code, name: 'Late', device: 'phone-d' })).status, 409, 'a full game turns the late phone away');
    const tokens = [a.token, b.token, c.token];
    assert.equal((await s.call('/api/dn/action', { code: a.code, token: b.token, type: 'start' })).status, 400, 'only the host starts');
    let v = (await s.call('/api/dn/action', { code: a.code, token: a.token, type: 'start' })).body;
    assert.equal(v.status, 'playing');
    assert.equal((await s.call('/api/dn/action', { code: a.code, token: 'nope', type: 'pass' })).status, 403);
    for (let guard = 0; guard < 500 && v.status === 'playing'; guard++) {
      s.advance(20);
      v = (await s.call('/api/dn/room?code=' + a.code + '&t=' + a.token)).body;
      if (v.phase === 'bidding') {
        const p = v.auction.turn, me = { code: a.code, token: tokens[p], round: v.round.index, lot: v.auction.lot, seen: v.auction.bid };
        const r = await s.call('/api/dn/action', guard % 3 ? { ...me, type: 'bid', amount: v.auction.bid + 1 } : { ...me, type: 'pass' });
        assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 200));
        if (guard === 4) assert.equal((await s.call('/api/dn/action', { ...me, type: 'bid', amount: 99 })).status, 409, 'a stale tap gets the fresh state');
      } else if (v.phase === 'picking') {
        const p = v.pick.who, id = v.round.lots.find(l => l.state === 'waiting').id;
        assert.equal((await s.call('/api/dn/action', { code: a.code, token: tokens[p], type: 'pick', round: v.round.index, id })).status, 200);
      }
      // Every lot and every piece on every board has a photograph.
      for (const l of v.round ? v.round.lots : []) assert.ok(v.art[l.id], 'lot photo ' + l.id);
      for (const pl of v.players) for (const x of pl.layout.pieces) assert.ok(v.art[x.id], 'board photo ' + x.id);
      assert.ok(v.emptyArt, 'empty land photo');
    }
    assert.equal(v.status, 'voting');
    assert.ok(v.players.every(p => p.items.length === 4));
    for (let i = 0; i < 3; i++) await s.call('/api/dn/action', { code: a.code, token: tokens[i], type: 'vote', target: (i + 1) % 3 });
    v = (await s.call('/api/dn/room?code=' + a.code + '&t=' + a.token)).body;
    assert.equal(v.status, 'finished');
    assert.ok(v.winners.players.length >= 1);
    assert.equal((await s.call('/api/dn/join', { code: a.code, name: 'Late', device: 'phone-e' })).status, 409, 'a started game cannot be joined');
  } finally { s.close(); }
});

test('API: leaving the lobby frees the seat and passes host on; rooms close when empty', async () => {
  const s = await server();
  try {
    const a = (await s.call('/api/dn/create', { theme: 'house', name: 'Host', capacity: 3, device: 'h' })).body;
    const b = (await s.call('/api/dn/join', { code: a.code, name: 'Guest', device: 'g' })).body;
    await s.call('/api/dn/leave', { code: a.code, token: a.token });
    const v = (await s.call('/api/dn/room?code=' + a.code + '&t=' + b.token)).body;
    assert.equal(v.players.length, 1); assert.equal(v.players[0].name, 'Guest'); assert.equal(v.me, 0);
    assert.match(v.notice, /Guest is now the host/);
    await s.call('/api/dn/leave', { code: a.code, token: b.token });
    assert.equal((await s.call('/api/dn/room?code=' + a.code)).status, 404);
    // A CPU game is never listed and starts straight away.
    const cpu = (await s.call('/api/dn/create', { theme: 'garage', name: 'Solo', cpu: true })).body;
    assert.equal(cpu.room.players.length, 2);
    assert.equal((await s.call('/api/dn/lobbies')).body.rooms.length, 0);
    assert.equal((await s.call('/api/dn/create', { theme: 'nope', name: 'x' })).status, 400);
  } finally { s.close(); }
});

test('API: without photos the game still plays, and the view never invents a picture', async () => {
  const s = await server({ artRoot: fs.mkdtempSync(path.join(os.tmpdir(), 'dn-none-')) });
  try {
    const a = (await s.call('/api/dn/create', { theme: 'pancakes', name: 'A', capacity: 2 })).body;
    assert.deepEqual(a.room.art, {});
    assert.equal(a.room.emptyArt, null);
    assert.equal((await s.call('/api/dn/themes')).body.themes[0].cover, null);
  } finally { s.close(); }
});

