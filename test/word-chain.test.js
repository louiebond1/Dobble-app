'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path'), http = require('http');
const {Server} = require('socket.io');
const {io:client} = require('../node_modules/socket.io/client-dist/socket.io.js');
const {fresh, move, view, normalise} = require('../lib/word-chain/engine');
const {wordChain} = require('../lib/word-chain/socket');
function game(mode = 'competitive') {
  const g = fresh(); move(g,'louie',{action:'settings',mode,count:5,starter:'ariel'}); move(g,'ariel',{action:'agree'}); move(g,'louie',{action:'start'});
  if(mode==='manual')move(g,'louie',{action:'lock',words:['BIRD','BATH','TIME','LIMIT','BREAK'],confirmed:true});
  return g;
}
test('both agree to settings; settings lock; correct keeps turn and final word wins',()=>{
  const g=fresh(); assert.throws(()=>move(g,'louie',{action:'start'}),/agree/);
  Object.assign(g,game()); const who=g.turn; assert.throws(()=>move(g,who,{action:'settings'}),/locked/);
  while(g.phase==='play'){move(g,who,{action:'guess',guess:'  '+g.words[g.index].toLowerCase()+'  '});assert.equal(g.turn,who);}
  assert.equal(g.winner,who);assert.equal(g.scores[who],1);assert.equal(g.correct[who],4);
});
test('wrong guesses and sequential hints pass turns; never hint final letter',()=>{
  const g=game(); g.words=['BIRD','BATH','TIME','LIMIT','BREAK'];
  move(g,'ariel',{action:'guess',guess:'bad'});assert.equal(g.turn,'louie');assert.equal(g.index,1);
  assert.throws(()=>move(g,'ariel',{action:'guess',guess:'BATH'}),/partner/);
  move(g,'louie',{action:'hint'});assert.equal(g.turn,'ariel');assert.equal(view(g,'ariel',[]).board[1].text,'B A _ _');
  move(g,'ariel',{action:'hint'}); assert.equal(g.turn,'louie');assert.equal(view(g,'ariel',[]).canHint,false);
  assert.throws(()=>move(g,'louie',{action:'hint'}),/One letter/);assert.throws(()=>move(g,'louie',{action:'guess',guess:' '}),/Enter/);
});
test('views never contain hidden answers, lengths of future words, tokens or catalogue',()=>{
  const g=game();g.words=['BIRD','BATH','TIME','LIMIT','BREAK'];g.tokens={louie:'private-token'};
  for(const p of ['louie','ariel']){const v=view(g,p,[]),json=JSON.stringify(v);for(const secret of ['BATH','TIME','LIMIT','BREAK','private-token'])assert.ok(!json.includes(secret));assert.deepEqual(v.board[2],{text:'T',status:'future'});}
});
test('manual drafts private and resume; host cannot guess; controlled alternative becomes official',()=>{
  const g=game('manual');assert.equal(g.turn,'ariel');
  assert.throws(()=>move(g,'louie',{action:'guess',guess:'BATH'}),/partner/);
  move(g,'ariel',{action:'guess',guess:'BOX'});move(g,'ariel',{action:'dispute'});
  assert.throws(()=>move(g,'ariel',{action:'judge',approve:true}),/review/);
  move(g,'louie',{action:'judge',approve:true});assert.equal(g.words[1],'BOX');assert.equal(g.index,2);assert.equal(g.correct.ariel,1);
  const draft=fresh();move(draft,'louie',{action:'settings',count:5,starter:'random',mode:'manual'});move(draft,'ariel',{action:'agree'});move(draft,'louie',{action:'start'});move(draft,'louie',{action:'draft',words:['BIRD','','','','']});
  assert.deepEqual(view(draft,'louie',[]).draft,['BIRD','','','','']);assert.equal(view(draft,'ariel',[]).draft,undefined);
  for(const words of [['A','','','',''],['BIRD','BIRD','BATH','TIME','LIMIT'],['BIRD','B4TH','TIME','LIMIT','BREAK']])assert.throws(()=>move(draft,'louie',{action:'lock',confirmed:true,words}));
});
test('normalisation only ignores whitespace, case and minor punctuation',()=>{assert.equal(normalise('  o’clock '),normalise("O'CLOCK"));assert.notEqual(normalise('BATH'),normalise('BATHE'));});
test('rematch waits for both; swaps creator; retains settings and scores',()=>{
  const g=game('manual');while(g.phase==='play')move(g,'ariel',{action:'guess',guess:g.words[g.index]});
  move(g,'louie',{action:'rematch'});assert.equal(g.phase,'result');move(g,'ariel',{action:'rematch'});assert.equal(g.phase,'setup');assert.equal(g.creator,'ariel');assert.equal(g.scores.ariel,1);assert.equal(g.settings.count,5);assert.deepEqual(g.agreed,[]);
});
async function host(file){const server=http.createServer(),io=new Server(server);io.on('connection',wordChain(io,{saveFile:file}));await new Promise(r=>server.listen(0,'127.0.0.1',r));return {url:'http://127.0.0.1:'+server.address().port,close:()=>new Promise(r=>io.close(()=>server.close(()=>r())))};}
async function connect(url,who,token){const socket=client(url,{transports:['websocket'],forceNew:true});const c={socket,state:null};socket.on('wordchain:state',s=>c.state=s);await new Promise((r,j)=>{socket.once('connect',r);socket.once('connect_error',j);});c.join=await socket.emitWithAck('wordchain:join',{who,token});return c;}
const pause=()=>new Promise(r=>setTimeout(r,90));
async function action(c,p){await pause();return c.socket.emitWithAck('wordchain:action',{revision:c.state.revision,id:require('crypto').randomUUID(),...p});}
async function waitFor(fn){for(let i=0;i<100;i++){if(fn())return;await new Promise(r=>setTimeout(r,10));}throw Error('State did not synchronise');}
test('two independent sockets: authority, replay safety, disconnect, takeover and persisted restart',async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'word-chain-')),file=path.join(dir,'match.json');let h=await host(file);const clients=[];t.after(async()=>{clients.forEach(c=>c.socket.disconnect());await h.close();fs.rmSync(dir,{recursive:true,force:true});});
  const l=await connect(h.url,'louie'),a=await connect(h.url,'ariel');clients.push(l,a);assert.ok(l.join.ok&&a.join.ok);await waitFor(()=>l.state?.online.length===2&&a.state);
  assert.ok((await action(l,{action:'settings',count:5,starter:'ariel',mode:'manual'})).ok);
  await waitFor(()=>a.state.revision===l.state.revision);assert.ok((await action(a,{action:'agree'})).ok);await waitFor(()=>a.state.revision===l.state.revision);
  assert.ok((await action(l,{action:'start'})).ok);await waitFor(()=>a.state.phase==='create');
  assert.ok((await action(l,{action:'draft',words:['BIRD','BATH','','','']})).ok);assert.equal(a.state.draft,undefined);
  assert.ok((await action(l,{action:'lock',words:['BIRD','BATH','TIME','LIMIT','BREAK'],confirmed:true})).ok);await waitFor(()=>a.state.phase==='play');
  assert.ok(!JSON.stringify(a.state).includes('BATH'));assert.ok(!JSON.stringify(l.state).includes('BATH'));
  const duplicate={action:'guess',guess:'BATH',revision:a.state.revision,id:crypto.randomUUID()};await pause();assert.ok((await a.socket.emitWithAck('wordchain:action',duplicate)).ok);assert.ok((await a.socket.emitWithAck('wordchain:action',duplicate)).ok);await waitFor(()=>l.state.index===2);assert.equal(a.state.index,2);
  assert.equal((await action(l,{action:'guess',guess:'TIME'})).ok,false);
  const stale={action:'hint',revision:a.state.revision-1,id:crypto.randomUUID()};await pause();assert.equal((await a.socket.emitWithAck('wordchain:action',stale)).ok,false);
  l.socket.disconnect();await waitFor(()=>a.state.online.length===1);assert.equal((await action(a,{action:'guess',guess:'TIME'})).ok,false);
  const l2=await connect(h.url,'louie',l.join.token);clients.push(l2);await waitFor(()=>a.state.online.length===2);assert.equal(l2.state.index,2);
  const thief=await connect(h.url,'louie');clients.push(thief);assert.equal(thief.join.ok,false);
  const a2=await connect(h.url,'ariel',a.join.token);clients.push(a2);await waitFor(()=>a2.state);assert.equal((await action(a,{action:'hint'})).ok,false);
  const revision=a2.state.revision;clients.forEach(c=>c.socket.disconnect());await h.close();h=await host(file);
  const restored=await connect(h.url,'ariel',a.join.token);clients.push(restored);await waitFor(()=>restored.state);assert.equal(restored.state.index,2);assert.equal(restored.state.revision,revision);assert.equal(restored.state.totalGuesses,1);
});
test('simultaneous requests consume exactly one turn and preserve shared hints',async t=>{
  const h=await host();const l=await connect(h.url,'louie'),a=await connect(h.url,'ariel');t.after(async()=>{l.socket.disconnect();a.socket.disconnect();await h.close();});await waitFor(()=>l.state?.online.length===2&&a.state);
  await action(l,{action:'settings',count:10,starter:'louie',mode:'competitive'});await waitFor(()=>l.state.revision===a.state.revision);await action(a,{action:'agree'});await waitFor(()=>l.state.revision===a.state.revision);await action(l,{action:'start'});await waitFor(()=>a.state.phase==='play');
  const rev=l.state.revision;await pause();
  const results=await Promise.all([l.socket.emitWithAck('wordchain:action',{action:'hint',revision:rev,id:crypto.randomUUID()}),a.socket.emitWithAck('wordchain:action',{action:'guess',guess:'not the answer',revision:rev,id:crypto.randomUUID()})]);
  assert.equal(results.filter(r=>r.ok).length,1);await waitFor(()=>a.state.revision===rev+1);assert.equal(a.state.turn,'ariel');assert.equal(a.state.hints,1);assert.deepEqual(a.state.board,l.state.board);
});
