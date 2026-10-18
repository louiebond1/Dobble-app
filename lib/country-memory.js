'use strict';
const crypto = require('crypto');
const fs = require('fs');
const { illustratedCountries, observationCountries } = require('./country-memory-cards');
const SEATS = ['louie', 'ariel'];
const other = who => who === 'louie' ? 'ariel' : 'louie';
const cards=observationCountries;
const legacyCards=illustratedCountries.map(c=>({...c,country:{...c.country,art:`/country-memory/${c.country.id}.png`}}));
function makeDeck(random=Math.random){
  const shuffle=list=>{const copy=[...list];for(let i=copy.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[copy[i],copy[j]]=[copy[j],copy[i]];}return copy;};
  return cards.map(c=>({...c,questions:shuffle([...shuffle(c.pictureQuestions).slice(0,4),...c.questions.filter(q=>q.kind==='fact')])}));
}
function countryMemory(io, { now = Date.now, schedule = setTimeout, cancel = clearTimeout, random = Math.random, saveFile } = {}) {
  let game = fresh(), alarm;
  const seats = {louie:null, ariel:null};
  function fresh() { return {phase:'lobby',ready:[],tokens:{},scores:{louie:0,ariel:0},turn:0,order:[],die:null,answer:'',correct:null,deadline:null,revision:0}; }
  if (saveFile) { try { const saved=JSON.parse(fs.readFileSync(saveFile,'utf8')); if(saved.phase&&saved.tokens)game=saved; } catch {} }
  const live = who => seats[who] && io.sockets.sockets.has(seats[who]);
  const current = () => {const c=[...cards,...legacyCards].find(c=>c.id===game.order[game.turn]);return c&&game.questionOrder?.[c.id]?{...c,questions:game.questionOrder[c.id]}:c;};
  const learner = () => SEATS[game.turn%2];
  function persist() { if(saveFile){fs.mkdirSync(require('path').dirname(saveFile),{recursive:true});fs.writeFileSync(saveFile+'.tmp',JSON.stringify(game));fs.renameSync(saveFile+'.tmp',saveFile);} }
  function view(who) {
    const c=current(), isLearner=who===learner();
    const questionPhase=['roll','question','reveal','result'].includes(game.phase);
    const q=c&&game.die?c.questions[game.die-1]:null;
    return {me:who,online:SEATS.filter(live),phase:game.phase,ready:game.ready,scores:game.scores,turn:game.turn,total:12,
      learner:learner(),asker:other(learner()),deadline:game.deadline,serverNow:now(),revision:game.revision,die:game.die,
      art:game.phase==='loading'&&isLearner?c?.country.art:null,
      card:game.phase==='study'&&isLearner?c.country:null,
      questions:questionPhase&&!isLearner?c.questions.map(x=>x.text):null,
      question:game.phase==='question'&&isLearner?q?.text:null,
      spokenAnswer:game.answer, answer:['reveal','result'].includes(game.phase)?String(c.country[q.field]):null,
      correct:game.correct, winner:game.phase==='over'?(game.scores.louie===game.scores.ariel?'tie':game.scores.louie>game.scores.ariel?'louie':'ariel'):null};
  }
  function push() { persist(); for(const who of SEATS)if(live(who))io.to(seats[who]).emit('cm:state',view(who)); }
  function arm() { cancel(alarm);if(game.deadline)alarm=schedule(advance,Math.max(0,game.deadline-now())); }
  function setPhase(phase,ms) {game.phase=phase;game.deadline=ms?now()+ms:null;game.revision++;arm();push();}
  function advance() { if(game.phase==='intro')setPhase('deck');else if(game.phase==='countdown')setPhase('study',30000);else if(game.phase==='study')setPhase('fade',650);else if(game.phase==='fade')setPhase('roll'); }
  arm();
  const connect=socket=>{
    const me=()=>SEATS.find(w=>seats[w]===socket.id);
    const reply=(ack,v)=>typeof ack==='function'&&ack(v);
    const action=(event,allowed,fn)=>socket.on(event,(p={},ack)=>{const who=me();if(!who||!live(other(who))||p.revision!==game.revision||!allowed(who))return reply(ack,{ok:false,error:'The game has moved on. Try again.'});fn(who,p);reply(ack,{ok:true});});
    socket.on('cm:join',(p={},ack)=>{
      const who=p.who;if(!SEATS.includes(who))return reply(ack,{ok:false,error:'Choose a player.'});
      const token=game.tokens[who];
      if(live(who)&&seats[who]!==socket.id&&(!token||p.token!==token))return reply(ack,{ok:false,error:'That player is already connected on another device.'});
      if(!token||p.token!==token){game.tokens[who]=crypto.randomUUID();game.ready=game.ready.filter(w=>w!==who);}
      for(const w of SEATS)if(seats[w]===socket.id)seats[w]=null;
      seats[who]=socket.id;reply(ack,{ok:true,token:game.tokens[who]});push();
    });
    socket.on('cm:sync',()=>{const who=me();if(who)socket.emit('cm:state',view(who));});
    action('cm:ready',()=>['lobby','over'].includes(game.phase),(who)=>{
      if(!game.ready.includes(who))game.ready.push(who);
      if(game.ready.length===2){const tokens=game.tokens;game=fresh();game.tokens=tokens;const deck=makeDeck(random);game.questionOrder=Object.fromEntries(deck.map(c=>[c.id,c.questions]));game.order=deck.map(c=>c.id);for(let i=game.order.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[game.order[i],game.order[j]]=[game.order[j],game.order[i]];}setPhase('intro',2500);}else push();
    });
    action('cm:draw',who=>game.phase==='deck'&&who===learner(),()=>setPhase('loading'));
    action('cm:loaded',who=>game.phase==='loading'&&who===learner(),()=>setPhase('countdown',3000));
    action('cm:roll',who=>game.phase==='roll'&&who===learner(),()=>{game.die=1+Math.floor(random()*6);setPhase('question');});
    action('cm:answer',who=>game.phase==='question'&&who===learner(),(_who,p)=>{game.answer=String(p.text||'Answered aloud').trim().slice(0,180);push();});
    action('cm:reveal',who=>game.phase==='question'&&who!==learner(),()=>setPhase('reveal'));
    action('cm:judge',who=>game.phase==='reveal'&&who!==learner(),(_who,p)=>{if(typeof p.correct!=='boolean')return;game.correct=p.correct;if(p.correct)game.scores[learner()]++;setPhase('result');});
    action('cm:next',()=>game.phase==='result',()=>{game.turn++;game.die=null;game.answer='';game.correct=null;setPhase(game.turn>=12?'over':'deck');});
    action('cm:reset',()=>game.phase==='over',()=>{const tokens=game.tokens;game=fresh();game.tokens=tokens;push();});
    socket.on('cm:leave',()=>{const who=me();if(who){seats[who]=null;game.ready=game.ready.filter(w=>w!==who);push();}});
    socket.on('disconnect',()=>{const who=me();if(who){seats[who]=null;push();}});
  };
  return connect;
}
module.exports={countryMemory,cards,makeDeck};
