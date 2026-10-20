'use strict';
// Guess Who for two people on two phones (Louie and Ariel). Each picks a secret
// face, then they take turns: ask any yes/no question, the other answers
// honestly, the asker flips faces down on their own board, then ends the turn.
// The server holds both secrets so neither phone can peek at the other's.
const ROOM = 'guesswho:LA';
const SEATS = ['louie', 'ariel'];
const MAX_FACE = 30;
const other = (who) => (who === 'louie' ? 'ariel' : 'louie');

function newGame() {
  const order=Array.from({length:MAX_FACE},(_,i)=>i+1);for(let i=order.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[order[i],order[j]]=[order[j],order[i]];}
  return { phase: 'pick', secrets: {}, order, down:{louie:[],ariel:[]}, turn: null, step: 'ask', question: '', log: [], winner: null, wins: null };
}

function guessWho(io, {saveFile} = {}) {
  const seats = { louie: null, ariel: null }; // socket ids
  const record = { louie: 0, ariel: 0 };
  let game = newGame();
  if(saveFile)try{const s=JSON.parse(require('fs').readFileSync(saveFile,'utf8'));if(s.game?.down){game=s.game;Object.assign(record,s.record);}}catch{}
  const live = (id) => !!id && io.sockets.sockets.has(id);
  const present = (who) => live(seats[who]);

  function view(who) {
    const opp = other(who);
    const over = game.phase === 'over';
    return {
      me: who,
      opponent: opp,
      opponentOnline: present(opp),
      phase: present(opp) ? game.phase : 'waiting',
      mySecret: game.secrets[who] ?? null,
      opponentPicked: game.secrets[opp] !== undefined,
      opponentSecret: over ? game.secrets[opp] : null,
      turn: game.turn,
      step: game.step,
      question: game.question,
      myDown: game.down[who],
      opponentDown: game.down[opp],
      order: game.order,
      log: game.log.slice(-8),
      winner: game.winner,
      record,
    };
  }
  function push() {
    if(saveFile){const fs=require('fs');fs.mkdirSync(require('path').dirname(saveFile),{recursive:true});fs.writeFileSync(saveFile+'.tmp',JSON.stringify({game,record}));fs.renameSync(saveFile+'.tmp',saveFile);}
    for (const who of SEATS) if (present(who)) io.to(seats[who]).emit('gw:state', view(who));
  }
  const validId = (id) => Number.isInteger(id) && id >= 1 && id <= MAX_FACE;

  return function connect(socket) {
    const me = () => (seats[socket.data.gwWho] === socket.id ? socket.data.gwWho : null);
    const reply = (ack, o) => typeof ack === 'function' && ack(o);

    socket.on('gw:join', (p, ack) => {
      const who = p && p.who;
      if (!SEATS.includes(who)) return reply(ack, { ok: false, error: 'bad-seat' });
      if (live(seats[who]) && seats[who] !== socket.id)
        return reply(ack, { ok: false, error: 'seat-taken' });
      const old = socket.data.gwWho;
      if (old && old !== who && seats[old] === socket.id) seats[old] = null;
      seats[who] = socket.id;
      socket.data.gwWho = who;
      socket.join(ROOM);
      reply(ack, { ok: true, who });
      push();
    });
    socket.on('gw:leave', () => {
      const who = me();
      if (who) seats[who] = null;
      socket.data.gwWho = null;
      socket.leave(ROOM);
      push();
    });
    socket.on('gw:pick', (p, ack) => {
      const who = me();
      if (!who || game.phase !== 'pick' || !present(other(who)) || !validId(p && p.id))
        return reply(ack, { ok: false });
      game.secrets[who] = p.id;
      if (game.secrets.louie !== undefined && game.secrets.ariel !== undefined) {
        game.phase = 'play';
        game.turn = Math.random() < 0.5 ? 'louie' : 'ariel';
        game.step = 'ask';
      }
      reply(ack, { ok: true });
      push();
    });
    socket.on('gw:ask', (p, ack) => {
      const who = me();
      const text = String((p && p.text) || '').replace(/\s+/g, ' ').trim().slice(0, 90);
      if (!who || game.phase !== 'play' || game.turn !== who || game.step !== 'ask' || !text)
        return reply(ack, { ok: false });
      game.question = text;
      game.step = 'answer';
      reply(ack, { ok: true });
      push();
    });
    socket.on('gw:answer', (p, ack) => {
      const who = me();
      if (!who || game.phase !== 'play' || game.turn !== other(who) || game.step !== 'answer' || typeof (p && p.yes) !== 'boolean')
        return reply(ack, { ok: false });
      game.log.push({ by: game.turn, q: game.question, yes: p.yes });
      game.step = 'flip';
      reply(ack, { ok: true });
      push();
    });
    socket.on('gw:spoken', (_p, ack) => {
      const who=me();
      if(!who||game.phase!=='play'||game.turn!==who||game.step!=='ask'||!present(other(who)))return reply(ack,{ok:false});
      game.question='Asked and answered aloud';game.step='flip';
      reply(ack,{ok:true});push();
    });
    socket.on('gw:flip', (p, ack) => {
      const who=me();
      if(!who||game.phase!=='play'||game.turn!==who||game.step!=='flip'||!validId(p?.id)||typeof p.down!=='boolean')return reply(ack,{ok:false});
      const set=new Set(game.down[who]);if(p.down)set.add(p.id);else set.delete(p.id);game.down[who]=[...set];
      reply(ack,{ok:true});push();
    });
    socket.on('gw:done', (_p, ack) => {
      const who = me();
      if (!who || game.phase !== 'play' || game.turn !== who || game.step !== 'flip')
        return reply(ack, { ok: false });
      game.turn = other(who);
      game.step = 'ask';
      game.question = '';
      reply(ack, { ok: true });
      push();
    });
    socket.on('gw:guess', (p, ack) => {
      const who = me();
      if (!who || game.phase !== 'play' || game.turn !== who || game.step !== 'ask' || !validId(p && p.id))
        return reply(ack, { ok: false });
      if (p.id === game.secrets[other(who)]) {
        game.phase = 'over';
        game.winner = who;
        record[who]++;
        reply(ack, { ok: true, correct: true });
      } else {
        game.log.push({ by: who, guess: p.id, wrong: true });
        game.turn = other(who);
        game.step = 'ask';
        reply(ack, { ok: true, correct: false });
      }
      push();
    });
    socket.on('gw:restart', (_p, ack) => {
      if (!me()) return reply(ack, { ok: false });
      game = newGame();
      reply(ack, { ok: true });
      push();
    });
    socket.on('gw:again', (_p, ack) => {
      const who = me();
      if (!who || game.phase !== 'over') return reply(ack, { ok: false });
      game = newGame();
      reply(ack, { ok: true });
      push();
    });
    socket.on('disconnect', () => {
      const who = socket.data.gwWho;
      if (who && seats[who] === socket.id) {
        seats[who] = null;
        push();
      }
    });
  };
}

module.exports = { guessWho };
