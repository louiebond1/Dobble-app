'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../public/cambio.js'),'utf8');
function ui(phase='queenSwap') {
  const context={busy:false,animating:false,matching:false,socket:{connected:true},picks:{mine:null,theirs:null},other:p=>p==='louie'?'ariel':'louie',MATCH_PHASES:['queen','queenView','queenSwap','blind'],render(){},act(action,args){this.lastAction={action,args};}};
  context.state={me:'louie',turn:'louie',phase,online:['louie','ariel'],hands:{louie:[{},{}],ariel:[{},{}]},discard:{rank:12}};
  vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf('function pick('),source.indexOf('function visibleCard(')),context);
  return context;
}
test('Queen look permits either hand but the private view permits no second look',()=>{const u=ui('queen');assert(u.canChoose(u.state,'louie',0));assert(u.canChoose(u.state,'ariel',0));u.state.phase='queenView';assert(!u.canChoose(u.state,'louie',0));assert(!u.canChoose(u.state,'ariel',0));});
test('guided swap asks for own card before enabling opponent cards',()=>{for(const phase of ['queenSwap','blind']){const u=ui(phase);assert(u.canChoose(u.state,'louie',0));assert(!u.canChoose(u.state,'ariel',0));u.pick('ariel',0);assert.equal(u.picks.theirs,null);u.pick('louie',1);assert(u.canChoose(u.state,'ariel',0));u.pick('ariel',0);assert.equal(u.picks.mine,1);assert.equal(u.picks.theirs,0);}});
test('both swap picks remain editable and clearing own pick resets the pair',()=>{const u=ui();u.pick('louie',0);u.pick('ariel',0);u.pick('louie',1);u.pick('ariel',1);assert.equal(u.picks.mine,1);assert.equal(u.picks.theirs,1);u.pick('louie',1);assert.equal(u.picks.mine,null);assert.equal(u.picks.theirs,null);assert(!u.canChoose(u.state,'ariel',0));});
test('matching mode never lets a player discard an opponent card',()=>{const u=ui();u.matching=true;assert(u.canChoose(u.state,'louie',0));assert(!u.canChoose(u.state,'ariel',0));});
test('cards are locked while moving, disconnected or absent',()=>{const u=ui('queen');u.animating=true;assert(!u.canChoose(u.state,'louie',0));u.animating=false;u.socket.connected=false;assert(!u.canChoose(u.state,'louie',0));u.socket.connected=true;u.state.hands.louie[0]=null;assert(!u.canChoose(u.state,'louie',0));});
