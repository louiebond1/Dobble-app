'use strict';
const crypto = require('crypto');
const fs = require('fs');
const SEATS = ['louie','ariel'];
const other = p => p === 'louie' ? 'ariel' : 'louie';
function deck(random = Math.random) {
  const cards = ['♠','♥','♣','♦'].flatMap(suit => Array.from({length:13},(_,i)=>({rank:i+1,suit})));
  for(let i=cards.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[cards[i],cards[j]]=[cards[j],cards[i]];}
  return cards;
}
const value = c => c.rank===13 && ['♥','♦'].includes(c.suit) ? -1 : c.rank;
function fresh(){return {phase:'lobby',revision:0,tokens:{},settings:{mode:'target',limit:100},scores:{louie:0,ariel:0},history:[],ready:[],round:0,hands:{louie:[],ariel:[]},peek:null,drawn:null,caller:null,turn:'louie',message:'Take your seat. Your cards are waiting.'};}
function deal(g,random){g.round++;g.deck=deck(random);g.hands={louie:g.deck.splice(0,4),ariel:g.deck.splice(0,4)};g.discard=[g.deck.pop()];g.turn=SEATS[(g.round-1)%2];g.phase='initial';g.ready=[];g.peek=null;g.drawn=null;g.caller=null;g.passed=[];g.message='Remember your bottom two cards, then hide them.';}
function draw(g){if(!g.deck.length){const top=g.discard.pop();g.deck=g.discard;g.discard=[top];for(let i=g.deck.length-1;i>0;i--){const j=crypto.randomInt(i+1);[g.deck[i],g.deck[j]]=[g.deck[j],g.deck[i]];}}return g.deck.pop();}
function finish(g){const points=Object.fromEntries(SEATS.map(p=>[p,g.hands[p].reduce((a,c)=>a+(c?value(c):0),0)]));for(const p of SEATS)g.scores[p]+=points[p];g.history.push({round:g.round,...points,caller:g.caller});g.points=points;g.phase=(g.settings.mode==='rounds'?g.round>=g.settings.limit:SEATS.some(p=>g.scores[p]>=g.settings.limit))?'over':'result';g.message=points.louie===points.ariel?'A tied round.':`${points.louie<points.ariel?'Louie':'Ariel'} wins the round.`;g.drawn=null;g.peek=null;g.ready=[];}
function advance(g){if(g.caller && g.turn!==g.caller)return finish(g);g.turn=other(g.turn);g.phase='draw';g.peek=null;g.drawn=null;g.message=`${g.turn==='louie'?'Louie':'Ariel'} to draw or call Cambio.`;}
function reaction(g,c){g.discard.push(c);g.phase='reaction';g.drawn=null;g.peek=null;g.passed=[];g.message='Match the discard from memory, or continue.';}
function move(g,who,p,random=Math.random){
 const fail=m=>{throw Error(m);};const own=i=>Number.isInteger(i)&&i>=0&&i<g.hands[who].length&&g.hands[who][i];const theirs=i=>Number.isInteger(i)&&i>=0&&i<g.hands[other(who)].length&&g.hands[other(who)][i];
 const active=()=>{if(who!==g.turn)fail('It is not your turn.');};
 switch(p.action){
 case 'configure':if(!['result','over'].includes(g.phase))fail('Finish the round first.');g.phase='lobby';g.scores={louie:0,ariel:0};g.history=[];g.round=0;g.ready=[];break;
 case 'settings':if(g.phase!=='lobby')fail('Settings are locked during the match.');if(!['target','rounds'].includes(p.mode)||!Number.isSafeInteger(p.limit)||p.limit<1)fail('Enter a positive whole number.');g.settings={mode:p.mode,limit:p.limit};g.ready=[];break;
 case 'ready':if(!['lobby','result','over','initial'].includes(g.phase))fail('Finish this turn first.');if(!g.ready.includes(who))g.ready.push(who);if(g.ready.length===2){if(g.phase==='initial'){g.phase='draw';g.ready=[];g.message='The cards are hidden. Lowest score wins.';}else {if(g.phase==='over'){g.scores={louie:0,ariel:0};g.history=[];g.round=0;}deal(g,random);}}break;
 case 'draw':active();if(g.phase!=='draw')fail('You have already drawn.');g.drawn=draw(g);if(!g.drawn){finish(g);break;}g.phase='holding';g.message='Keep this card, or discard it to use its power.';break;
 case 'take':active();if(g.phase!=='draw')fail('You have already drawn.');g.drawn=g.discard.pop();if(!g.drawn)fail('The discard pile is empty.');g.fromDiscard=true;g.phase='holding';g.message='Choose one of your cards to replace. Discard pickups must be kept.';break;
 case 'replace':active();if(g.phase!=='holding'||!own(p.index))fail('Choose one of your face-down cards.');{const old=g.hands[who][p.index];g.hands[who][p.index]=g.drawn;g.fromDiscard=false;reaction(g,old);}break;
 case 'discard':active();if(g.phase!=='holding'||g.fromDiscard)fail('You must keep a card taken from the discard pile.');{const c=g.drawn;g.discard.push(c);g.drawn=null;g.peek=null;if([7,8].includes(c.rank))g.phase='self';else if([9,10].includes(c.rank))g.phase='opponent';else if(c.rank===11)g.phase='blind';else if(c.rank===12)g.phase='queen';else {g.discard.pop();reaction(g,c);}g.message='Use the card power, or skip it.';}break;
 case 'peek':active();if(g.phase==='self'&&own(p.index)){g.peek={who,index:p.index,card:g.hands[who][p.index]};g.phase='view';}else if(['opponent','queen'].includes(g.phase)&&theirs(p.index)){const queen=g.phase==='queen';g.peek={who:other(who),index:p.index,card:g.hands[other(who)][p.index]};g.phase=queen?'queenSwap':'view';}else fail('Choose a valid card.');break;
 case 'swap':active();if(!['blind','queenSwap'].includes(g.phase)||!own(p.index))fail('Choose your card to swap.');{const i=g.phase==='queenSwap'?g.peek.index:p.opponentIndex;if(!theirs(i))fail('Choose an opponent card.');[g.hands[who][p.index],g.hands[other(who)][i]]=[g.hands[other(who)][i],g.hands[who][p.index]];g.peek=null;g.phase='reaction';g.passed=[];g.message='Cards swapped. Match the discard, or continue.';}break;
 case 'skip':active();if(!['self','opponent','blind','queen','queenSwap','view'].includes(g.phase))fail('There is no power to finish.');g.peek=null;g.phase='reaction';g.passed=[];g.message='Match the discard from memory, or continue.';break;
 case 'snap':if(g.phase!=='reaction'||g.passed.includes(who)||!own(p.index))fail('Choose a card before continuing.');{const c=g.hands[who][p.index],top=g.discard.at(-1);if(!top)fail('There is no discard to match.');if(c.rank===top.rank){g.hands[who][p.index]=null;g.discard.push(c);g.message=`${who==='louie'?'Louie':'Ariel'} matched a ${c.rank===13?'King':c.rank}!`;}else{const penalty=draw(g);if(penalty)g.hands[who].push(penalty);g.passed.push(who);g.message='Wrong rank. One unseen penalty card added.';}if(!g.hands[who].some(Boolean))finish(g);else if(g.passed.length===2)advance(g);}break;
 case 'pass':if(g.phase!=='reaction'||g.passed.includes(who))fail('Already continued.');g.passed.push(who);if(g.passed.length===2)advance(g);break;
 case 'call':active();if(g.phase!=='draw'||g.caller)fail('Call Cambio before drawing, once per round.');g.caller=who;g.message='Cambio called. One final turn for your opponent.';g.turn=other(who);break;
 default:fail('Unknown action.');
 }
 g.revision++;
}
function view(g,who,online){return {me:who,phase:g.phase,revision:g.revision,settings:g.settings,scores:g.scores,history:g.history,ready:g.ready,round:g.round,turn:g.turn,caller:g.caller,passed:g.passed||[],message:g.message,online,deckCount:g.deck?.length||0,discard:g.discard?.at(-1)||null,drawn:g.turn===who?g.drawn:null,fromDiscard:g.turn===who&&!!g.fromDiscard,peek:g.turn===who?g.peek:null,hands:Object.fromEntries(SEATS.map(p=>[p,g.hands[p].map((c,i)=>!c?null:['result','over'].includes(g.phase)||(g.phase==='initial'&&p===who&&!g.ready.includes(who)&&i>=2)?c:{hidden:true})])),points:g.points||null};}
function cambio(io,{saveFile}={}){
 let g=fresh();const seats={louie:null,ariel:null};if(saveFile)try{const old=JSON.parse(fs.readFileSync(saveFile,'utf8'));if(old.tokens&&old.settings)g=old;}catch{}
 const online=()=>SEATS.filter(p=>seats[p]&&io.sockets.sockets.has(seats[p]));
 const push=()=>{if(saveFile){fs.mkdirSync(require('path').dirname(saveFile),{recursive:true});fs.writeFileSync(saveFile+'.tmp',JSON.stringify(g));fs.renameSync(saveFile+'.tmp',saveFile);}for(const p of online())io.to(seats[p]).emit('cambio:state',view(g,p,online()));};
 return socket=>{
 const me=()=>SEATS.find(p=>seats[p]===socket.id);const reply=(ack,v)=>typeof ack==='function'&&ack(v);
 socket.on('cambio:join',(p={},ack)=>{if(!SEATS.includes(p.who))return reply(ack,{ok:false,error:'Choose a seat.'});const token=g.tokens[p.who];if(token&&p.token!==token&&(online().includes(p.who)||g.phase!=='lobby'))return reply(ack,{ok:false,error:'This seat belongs to another device. Reopen it on your original device.'});for(const s of SEATS)if(seats[s]===socket.id)seats[s]=null;g.tokens[p.who]=token||crypto.randomUUID();seats[p.who]=socket.id;reply(ack,{ok:true,token:g.tokens[p.who]});push();});
 socket.on('cambio:action',(p={},ack)=>{const who=me();if(!who)return reply(ack,{ok:false,error:'Join a seat first.'});if(p.revision!==g.revision){push();return reply(ack,{ok:false,error:'The table updated. Try again.'});}if(!['ready','settings'].includes(p.action)&&online().length!==2)return reply(ack,{ok:false,error:'Waiting for your partner to reconnect.'});try{move(g,who,p);push();reply(ack,{ok:true});}catch(e){reply(ack,{ok:false,error:e.message});}});
 socket.on('disconnect',()=>{const who=me();if(who){seats[who]=null;push();}});
 };
}
module.exports={cambio,fresh,deal,move,view,deck,value};
