'use strict';
const cardValue = c => c.rank === 13 && ['♥', '♦'].includes(c.suit) ? -1 : Math.min(c.rank, 10);
const matchingPhases = ['draw','holding','self','opponent','view','blind','queen','queenView','queenSwap','settling'];
function remember(s, m) {
  const latestDeal=[...s.events].reverse().find(e=>e.kind==='deal');
  if (m.round !== s.round || latestDeal && m.dealId !== latestDeal.id) Object.assign(m, {round:s.round, dealId:latestDeal?.id??null, seen:latestDeal?.id??s.serial, own:{}, theirs:{}, held:null, humanHeld:null, turns:0, previousDiscard:null});
  m.own ||= {}; m.theirs ||= {};
  for (const e of s.events.filter(e => e.id > (m.seen || 0))) {
    const mine = e.actor === 'ariel';
    if (e.kind === 'draw') { if (mine) m.turns++; else m.humanHeld = e.from === 'discard' ? m.previousDiscard : null; }
    if (e.kind === 'replace') { if (mine) { if(m.held)m.own[e.index]=m.held;else delete m.own[e.index]; } else { if(m.humanHeld)m.theirs[e.index]=m.humanHeld;else delete m.theirs[e.index]; } }
    if (e.kind === 'swap') { const ownIndex = mine ? e.index : e.opponentIndex, theirIndex = mine ? e.opponentIndex : e.index; const a=m.own[ownIndex],b=m.theirs[theirIndex]; delete m.own[ownIndex];delete m.theirs[theirIndex];if(b)m.own[ownIndex]=b;if(a)m.theirs[theirIndex]=a; }
    if (e.kind === 'snap') delete (mine ? m.own : m.theirs)[e.index];
    if (e.kind === 'penalty') (mine ? m.own : m.theirs)[e.index]=e.card;
  }
  m.seen=s.serial;
  for(const [owner,key] of [['ariel','own'],['louie','theirs']])s.hands[owner].forEach((c,i)=>{if(!c)delete m[key][i];else if(!c.hidden)m[key][i]=c;});
  if(s.peek)m[s.peek.who==='ariel'?'own':'theirs'][s.peek.index]=s.peek.card;
  if(s.drawn&&!s.drawn.hidden&&s.turn==='ariel')m.held=s.drawn;
  m.previousDiscard=s.discard;
}
// Receives only the same private snapshot a human in the bot's seat would see.
function chooseBotAction(s,m={}) {
  remember(s,m);
  const own=s.hands.ariel.map((c,i)=>c?i:null).filter(i=>i!==null),theirs=s.hands.louie.map((c,i)=>c?i:null).filter(i=>i!==null);
  const expected=(map,i)=>map[i]?cardValue(map[i]):6.5;
  const worst=own.reduce((a,i)=>a===null||expected(m.own,i)>expected(m.own,a)?i:a,null);
  const best=theirs.reduce((a,i)=>a===null||expected(m.theirs,i)<expected(m.theirs,a)?i:a,null);
  if(['lobby','result','over'].includes(s.phase))return s.ready.includes('louie')&&!s.ready.includes('ariel')?{action:'ready'}:null;
  if(s.phase==='initial')return !s.ready.includes('ariel')?{action:'ready'}:null;
  if(matchingPhases.includes(s.phase)&&s.discard){const match=own.find(i=>m.own[i]?.rank===s.discard.rank);if(match!==undefined)return {action:'snap',index:match,owner:'ariel',discardGeneration:s.discardGeneration};}
  if(s.turn!=='ariel')return null;
  switch(s.phase){
    case 'draw': {
      const allKnown=own.every(i=>m.own[i]);const total=own.reduce((sum,i)=>sum+expected(m.own,i),0);
      if(!s.caller&&((s.ply>=6&&allKnown&&total<=7)||m.turns>=18))return {action:'call'};
      if(s.discard&&worst!==null&&cardValue(s.discard)<=3&&cardValue(s.discard)+2<expected(m.own,worst))return {action:'take'};
      return {action:'draw'};
    }
    case 'holding':return s.fromDiscard||s.drawn&&cardValue(s.drawn)<expected(m.own,worst)?{action:'replace',index:worst}:{action:'discard'};
    case 'self': {const i=own.find(i=>!m.own[i]);return i!==undefined?{action:'peek',owner:'ariel',index:i}:{action:'skip'};}
    case 'opponent': {const i=theirs.find(i=>!m.theirs[i])??theirs[0];return i!==undefined?{action:'peek',owner:'louie',index:i}:{action:'skip'};}
    case 'queen': {const i=own.find(i=>!m.own[i]);if(i!==undefined)return {action:'peek',owner:'ariel',index:i};const j=theirs.find(i=>!m.theirs[i])??theirs[0];return j!==undefined?{action:'peek',owner:'louie',index:j}:{action:'skip'};}
    case 'queenView':return {action:'hideQueen'};
    case 'view':return {action:'skip'};
    case 'blind':case 'queenSwap':return worst!==null&&best!==null&&expected(m.own,worst)>expected(m.theirs,best)+1?{action:'swap',index:worst,opponentIndex:best}:{action:'skip'};
    default:return null;
  }
}
module.exports={chooseBotAction,remember};
