'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {fresh, move, view, upgrade} = require('./engine');
const SEATS = ['louie', 'ariel'];
const message = e => e.code || e instanceof SyntaxError ? 'We couldn’t load or save the game. Please try again.' : e.message;
function wordChain(io, {saveFile} = {}) {
  const tables = new Map();
  function tableFor(key) {
    if (tables.has(key)) return tables.get(key);
    if (tables.size >= 64) throw Error('All tables are busy. Try again later.');
    const file = saveFile && (key === 'main' ? saveFile : path.join(path.dirname(saveFile), 'word-chain-tests', key + '.json'));
    let g = fresh();
    if (file && fs.existsSync(file)) { g = JSON.parse(fs.readFileSync(file, 'utf8')); if (![1,2].includes(g.version)) throw Error('This saved game needs an update.'); upgrade(g); }
    const seats = {louie: null, ariel: null};
    const t = {game: g, seats, online: () => SEATS.filter(who => seats[who] && io.sockets.sockets.has(seats[who])),
      commit(next) { if (file) { fs.mkdirSync(path.dirname(file), {recursive: true}); fs.writeFileSync(file + '.tmp', JSON.stringify(next), {mode: 0o600}); fs.renameSync(file + '.tmp', file); } t.game = next; },
      push() { for (const who of t.online()) io.to(seats[who]).emit('wordchain:state', view(t.game, who, t.online())); }};
    tables.set(key, t); return t;
  }
  return socket => {
    let table = null, who = null, lastAction = 0;
    const ack = (fn, data) => typeof fn === 'function' && fn(data);
    const detach = () => { if (table && table.seats[who] === socket.id) { table.seats[who] = null; table.push(); } };
    socket.on('wordchain:join', (p = {}, reply) => {
      try {
        if (!SEATS.includes(p.who)) throw Error('Choose Louie or Ariel.');
        const key = p.table == null || p.table === 'main' ? 'main' : typeof p.table === 'string' && /^qa-[a-z0-9-]{6,60}$/.test(p.table) ? p.table : null;
        if (!key) throw Error('This table link is invalid.');
        const next = tableFor(key), token = next.game.tokens[p.who];
        if (token && p.token !== token) throw Error('This player is already paired on another device. Use your original phone.');
        const game = structuredClone(next.game); game.tokens[p.who] ||= crypto.randomUUID(); next.commit(game);
        detach(); table = next; who = p.who;
        const previous = table.seats[who]; table.seats[who] = socket.id;
        if (previous && previous !== socket.id) io.to(previous).emit('wordchain:seatLost');
        ack(reply, {ok: true, token: game.tokens[who]}); table.push();
      } catch (e) { ack(reply, {ok: false, error: message(e)}); }
    });
    socket.on('wordchain:action', (p = {}, reply) => {
      try {
        if (!table || table.seats[who] !== socket.id) throw Error('Rejoin on your current phone.');
        const g = table.game;
        if (typeof p.id !== 'string' || !/^[a-zA-Z0-9-]{8,80}$/.test(p.id)) throw Error('Please try that move again.');
        if (g.receipts.some(r => r.id === p.id && r.who === who)) { table.push(); return ack(reply, {ok: true}); }
        if (Date.now() - lastAction < 80) throw Error('One move at a time.');
        lastAction = Date.now();
        const parallelDraft = g.version === 2 && ['draft', 'lock'].includes(p.action) && g.phase === 'create' && p.round === g.round && p.draftVersion === g.draftVersions[who];
        if (p.revision !== g.revision && !parallelDraft) { table.push(); throw Error('The game changed. Check the board and try again.'); }
        if (!['draft', 'lock'].includes(p.action) && table.online().length !== 2) throw Error('Waiting for your partner to reconnect. Your game is saved.');
        const next = structuredClone(g); move(next, who, p);
        next.receipts.push({id: p.id, who}); next.receipts = next.receipts.slice(-128);
        table.commit(next); table.push(); ack(reply, {ok: true});
      } catch (e) { ack(reply, {ok: false, error: message(e)}); }
    });
    socket.on('disconnect', detach);
  };
}
module.exports = {wordChain};
