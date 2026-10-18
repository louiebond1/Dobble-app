// Runs the real socket engines against the shipped browser UI, with accelerated
// server time for a complete 12-turn match. Production keeps the 30-second timer.
const http=require('http'),path=require('path'),fs=require('fs');
const express=require('express'),{Server}=require('socket.io');
const {chromium}=require(process.env.PW_ROOT||'playwright');
const {countryMemory}=require('../lib/country-memory'),{guessWho}=require('../lib/guesswho');
const app=express(),server=http.createServer(app),io=new Server(server);
io.on('connection',countryMemory(io,{now:()=>Date.now()*15,schedule:(fn,ms)=>setTimeout(fn,ms/15)}));
io.on('connection',guessWho(io));
app.get('/api/leaderboard',(_q,r)=>r.json({louie:0,ariel:0}));
app.get('/api/symbols',(_q,r)=>r.json([]));app.get('/api/photos',(_q,r)=>r.json([]));
app.use(express.static(path.join(__dirname,'../public')));
const shots=process.env.QA_SHOTS||'/tmp/party-qa';fs.mkdirSync(shots,{recursive:true});
function assert(value,message){if(!value)throw Error(message);}
server.listen(0,async()=>{
 const base='http://localhost:'+server.address().port;
 const browser=await chromium.launch({executablePath:process.env.PW_EXECUTABLE_PATH});
 let errors=[];
 try{
  for(const size of [[390,667],[820,1180]]){
   const a=await browser.newContext({viewport:{width:size[0],height:size[1]}}),b=await browser.newContext({viewport:{width:size[0],height:size[1]}});
   const l=await a.newPage(),r=await b.newPage();for(const p of [l,r])p.on('pageerror',e=>errors.push(e.message));
   const fit=async(p,label)=>{const overflow=await p.evaluate(()=>{const es=[...document.querySelectorAll('button,input,textarea')].filter(e=>e.getClientRects().length);return {page:document.documentElement.scrollHeight>innerHeight+1,sideways:document.documentElement.scrollWidth>innerWidth+1,out:es.filter(e=>{const r=e.getBoundingClientRect();return r.bottom>innerHeight+1||r.right>innerWidth+1||r.left<0;}).map(e=>e.textContent)};});assert(!overflow.page&&!overflow.sideways&&!overflow.out.length,label+' '+JSON.stringify(overflow));};
   await l.goto(base+'/country-memory.html');await r.goto(base+'/country-memory.html');
   await l.getByRole('button',{name:'I’m Louie',exact:true}).click();await r.getByRole('button',{name:'I’m Ariel',exact:true}).click();
   await l.getByRole('button',{name:'I’m ready',exact:true}).click();await r.getByRole('button',{name:'I’m ready',exact:true}).click();
   for(let i=0;i<12;i++){
    console.log('Memory browser turn',size[0],i+1);
    const learner=i%2?r:l,asker=i%2?l:r;
    await learner.getByRole('button',{name:'Draw a country card',exact:true}).click();
    await learner.waitForSelector('.study .art-box img');
    if(i===0){await learner.waitForTimeout(500);await learner.screenshot({path:shots+'/memory-study-'+size[0]+'.png'});await fit(learner,'memory study '+size);await learner.reload();await learner.waitForSelector('.study .art-box img');}
    await learner.getByRole('button',{name:'Roll the die',exact:true}).click();
    await learner.getByRole('button',{name:'I’ve answered aloud',exact:true}).click();
    assert(await asker.locator('.question-list p').count()===6,'six questions');
    if(i===0){await fit(asker,'memory question '+size);await asker.screenshot({path:shots+'/memory-questions-'+size[0]+'.png'});}
    await asker.getByRole('button',{name:'Reveal the answer',exact:true}).click();await asker.getByRole('button',{name:'Correct · +1',exact:true}).click();
    await asker.getByRole('button',{name:i===11?'See final scores':'Next card',exact:true}).click();
   }
   await l.getByRole('button',{name:'Play again',exact:true}).waitFor();assert(await l.locator('h1').textContent()==='A perfect match.','draw result');
   await l.screenshot({path:shots+'/memory-result-'+size[0]+'.png'});console.log('PASS memory complete match, role swap, refresh, shared dice, captions, score and fit '+size);
   await l.evaluate(()=>new Promise(resolve=>socket.emit('cm:reset',{revision:state.revision},resolve)));
   await a.close();await b.close();
  }
  const a=await browser.newContext({viewport:{width:390,height:667}}),b=await browser.newContext({viewport:{width:390,height:667}}),l=await a.newPage(),r=await b.newPage();
  for(const p of [l,r]){p.on('pageerror',e=>errors.push(e.message));await p.goto(base+'/guesswho.html');}
  await l.getByRole('button',{name:'I’m Louie',exact:true}).click();await r.getByRole('button',{name:'I’m Ariel',exact:true}).click();
  await l.locator('.face[data-face="8"]').click();await r.locator('.face[data-face="14"]').click();
  await l.waitForSelector('.dock');await r.waitForSelector('.dock');
  let turn=await l.getByRole('button',{name:'Asked aloud',exact:true}).count()?l:r;let opponent=turn===l?r:l;
  await turn.getByRole('button',{name:'Type question',exact:true}).click();await turn.locator('textarea').fill('Does your person have a necklace?');await turn.getByRole('button',{name:'Send question',exact:true}).click();
  await opponent.getByRole('button',{name:'Yes',exact:true}).click();await turn.locator('.face[data-face="2"]').click();await opponent.waitForSelector('.face[data-face="2"].down');
  await turn.getByRole('button',{name:'Undo',exact:true}).click();await opponent.waitForSelector('.face[data-face="2"]:not(.down)');
  await turn.getByRole('button',{name:'End turn',exact:true}).click();await opponent.getByRole('button',{name:'Asked aloud',exact:true}).click();await opponent.locator('.face[data-face="3"]').click();await turn.waitForSelector('.face[data-face="3"].down');
  await opponent.screenshot({path:shots+'/guesswho-my-board.png'});await turn.screenshot({path:shots+'/guesswho-opponent-board.png'});
  await opponent.reload();await opponent.getByRole('button',{name:opponent===l?'I’m Louie':'I’m Ariel',exact:true}).click();await opponent.waitForSelector('.face[data-face="3"].down');
  await opponent.getByRole('button',{name:'End turn',exact:true}).click();await turn.getByRole('button',{name:'Guess face',exact:true}).click();await turn.locator('.face[data-face="'+(turn===l?14:8)+'"]').click();
  await turn.getByText('You win',{exact:true}).waitFor();await turn.getByRole('button',{name:'Play again',exact:true}).click();await turn.getByText('Pick your secret face',{exact:true}).waitFor();
  console.log('PASS Guess Who: typed question, voice turn, live opponent flips, undo, refresh, win and rematch');await a.close();await b.close();
  const p=await browser.newPage({viewport:{width:390,height:667}});await p.goto(base);await p.waitForTimeout(200);await p.screenshot({path:shots+'/home.png',fullPage:true});
  assert(!errors.length,errors.join('\n'));console.log('PASS no browser errors');
 }catch(e){console.error(e);for(const [i,c] of browser.contexts().entries())for(const p of c.pages()){console.log('FAILED PAGE',await p.locator('body').innerText());await p.screenshot({path:shots+'/failure-'+i+'.png'});}process.exitCode=1;}finally{await browser.close();io.close();server.close();}
});
