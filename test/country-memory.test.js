const test=require('node:test'),assert=require('node:assert/strict');
const {countryMemory,cards}=require('../lib/country-memory');
function table(options={}){
  let clock=0,task=null;const sockets=new Map(),messages=[];
  const io={sockets:{sockets},to:id=>({emit:(ev,s)=>messages.push({id,ev,s:JSON.parse(JSON.stringify(s))})})};
  const connect=countryMemory(io,{now:()=>clock,schedule:(fn,ms)=>(task={fn,at:clock+ms}),cancel:()=>{task=null;},random:()=>.3,...options});
  const view=id=>messages.filter(x=>x.id===id).at(-1)?.s;
  function add(id,who,token){const handlers={};const s={id,on:(e,f)=>handlers[e]=f,emit:(ev,v)=>messages.push({id,ev,s:v})};sockets.set(id,s);connect(s);const call=(ev,p={})=>{let result;handlers['cm:'+ev]({...p,revision:p.revision??view(id)?.revision},r=>result=r);return result;};const join=call('join',{who,token});return {id,who,call,join,view:()=>view(id),disconnect:()=>{sockets.delete(id);handlers.disconnect();}};}
  return {add,view,advance:ms=>{clock+=ms;const pending=task;if(pending&&pending.at<=clock){task=null;pending.fn();}},messages};
}
test('Country Memory: full 12-card match, shared dice, role privacy, scoring, replay and no duplicate actions',()=>{
  const t=table(),l=t.add('L','louie'),a=t.add('A','ariel');assert.ok(l.join.token);
  l.call('ready');assert.equal(l.view().phase,'lobby');a.call('ready');assert.equal(l.view().phase,'intro');t.advance(2500);
  const seen=new Set();
  for(let i=0;i<12;i++){
    const learner=i%2?a:l,asker=i%2?l:a;
    assert.equal(asker.call('draw').ok,false);learner.call('draw');assert.equal(learner.view().phase,'loading');assert.equal(asker.view().art,null);
    learner.call('loaded');assert.equal(learner.view().phase,'countdown');t.advance(3000);
    assert.equal(learner.view().deadline-learner.view().serverNow,30000);seen.add(learner.view().card.id);assert.equal(asker.view().card,null);
    assert.equal(learner.call('roll').ok,false);t.advance(30000);assert.equal(learner.view().phase,'fade');t.advance(650);
    assert.equal(learner.view().card,null);assert.equal(asker.view().questions.length,6);
    learner.call('roll');assert.equal(l.view().die,a.view().die);assert.equal(learner.view().answer,null);assert.equal(learner.view().questions,null);
    learner.call('answer',{text:'My answer'});assert.equal(asker.view().spokenAnswer,'My answer');assert.equal(learner.call('reveal').ok,false);
    asker.call('reveal');const revision=asker.view().revision;asker.call('judge',{correct:i%2===0});assert.equal(asker.call('judge',{correct:true,revision}).ok,false);
    asker.call('next');
  }
  assert.equal(seen.size,12);assert.equal(l.view().phase,'over');assert.equal(l.view().scores.louie,6);assert.equal(l.view().scores.ariel,0);assert.equal(l.view().winner,'louie');
  l.call('ready');assert.equal(l.view().phase,'over');a.call('ready');assert.equal(l.view().phase,'intro');assert.equal(l.view().scores.louie,0);
});
test('Country Memory: refresh resumes a saved seat and blocks another live device',()=>{
  const t=table(),l=t.add('L','louie'),a=t.add('A','ariel');l.call('ready');a.call('ready');t.advance(2500);l.call('draw');l.call('loaded');t.advance(3000);
  const bad=t.add('X','louie');assert.equal(bad.join.ok,false);
  l.disconnect();const resumed=t.add('L2','louie',l.join.token);assert.equal(resumed.join.ok,true);assert.equal(resumed.view().phase,'study');assert.equal(resumed.view().deadline,35500);
});
test('Country Memory: every picture and six question answers exist in its study card',()=>{
  const fs=require('fs'),path=require('path');for(const card of cards){assert.equal(card.questions.length,6);assert.ok(fs.existsSync(path.join(__dirname,'../public',card.country.art)));for(const q of card.questions)assert.notEqual(card.country[q.field],undefined);assert.ok(card.country.funFact.toLowerCase().includes(card.country.factAnswer.toLowerCase()));}
});
test('Country Memory: server restart restores the match and its remaining study time',()=>{
  const fs=require('fs'),os=require('os'),path=require('path'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'country-memory-test-')),saveFile=path.join(dir,'match.json');
  try{
    const first=table({saveFile}),l=first.add('L','louie'),a=first.add('A','ariel');l.call('ready');a.call('ready');first.advance(2500);l.call('draw');l.call('loaded');first.advance(3000);
    const restored=table({saveFile}),back=restored.add('L2','louie',l.join.token),other=restored.add('A2','ariel',a.join.token);
    assert.equal(back.view().phase,'study');assert.equal(back.view().deadline,35500);assert.equal(other.view().card,null);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('Country Memory: each shuffled card has four picture questions and two caption facts',()=>{
  const {makeDeck}=require('../lib/country-memory');const first=makeDeck(()=>.1),second=makeDeck(()=>.9);
  for(const deck of [first,second])for(const c of deck){
    assert.equal(c.pictureQuestions.length,6);assert.equal(c.questions.length,6);
    assert.equal(new Set(c.questions.map(q=>q.field)).size,6);
    assert.equal(c.questions.filter(q=>q.kind==='picture').length,4);
    assert.equal(c.questions.filter(q=>q.kind==='fact').length,2);
    assert.equal(c.country.captions.length,3);
    for(const q of c.pictureQuestions)assert.notEqual(c.country[q.field],undefined);
    assert.ok(!c.questions.some(q=>q.field==='birds'));
  }
  assert.notDeepEqual(first[0].questions,second[0].questions);
});
test('Country Memory: saved v1 games retain their original artwork and answers',()=>{
  const fs=require('fs'),os=require('os'),path=require('path'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'cm-old-')),saveFile=path.join(dir,'match.json');
  try{
    const first=table({saveFile}),l=first.add('L','louie'),a=first.add('A','ariel');l.call('ready');a.call('ready');first.advance(2500);l.call('draw');l.call('loaded');first.advance(3000);
    const saved=JSON.parse(fs.readFileSync(saveFile,'utf8'));saved.order[0]='facts-country-france-v1';fs.writeFileSync(saveFile,JSON.stringify(saved));
    const t=table({saveFile}),back=t.add('L2','louie',l.join.token),other=t.add('A2','ariel',a.join.token);
    assert.equal(back.view().card.art,'/country-memory/france.png');t.advance(35500);t.advance(650);
    assert.ok(other.view().questions.includes('How many pigeons were in the picture?'));
    back.call('roll');other.call('reveal');assert.equal(back.view().answer,'Baguette');
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('Country Memory: restarting the server preserves the selected question bank',()=>{
  const fs=require('fs'),os=require('os'),path=require('path'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'cm-bank-')),saveFile=path.join(dir,'match.json');
  try{
    const first=table({saveFile}),l=first.add('L','louie'),a=first.add('A','ariel');l.call('ready');a.call('ready');first.advance(2500);l.call('draw');l.call('loaded');first.advance(3000);first.advance(30000);first.advance(650);
    const expected=a.view().questions;
    const t=table({saveFile}),back=t.add('L2','louie',l.join.token),other=t.add('A2','ariel',a.join.token);
    assert.deepEqual(other.view().questions,expected);back.call('roll');assert.equal(back.view().question,expected[back.view().die-1]);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
