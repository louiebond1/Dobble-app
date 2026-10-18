process.env.PORT='3152';require('../server');
const {chromium}=require(process.env.PW_ROOT||'playwright');
(async()=>{
 await new Promise(r=>setTimeout(r,150));
 const browser=await chromium.launch({executablePath:process.env.PW_EXECUTABLE_PATH});
 try{
  for(const size of [[390,667],[820,1180]]){
   const p=await browser.newPage({viewport:{width:size[0],height:size[1]},serviceWorkers:'block',reducedMotion:'reduce'}),errors=[];
   await p.clock.install();
   p.on('pageerror',e=>errors.push(e.message));
   await p.goto('http://localhost:3152/');await p.waitForTimeout(200);
   if(await p.locator('.party-cover,body.party-home').count())throw Error('Home still redesigned');
   if(await p.locator('.feature-cards a').first().getAttribute('href')!='/draft-night.html')throw Error('Home order changed');
   await p.goto('http://localhost:3152/country-memory.html');
   await p.getByRole('link',{name:'Practise solo · no other player needed',exact:true}).click();
   await p.getByRole('heading',{name:'Take a good look.',exact:true}).waitFor();await p.clock.fastForward(2300);
   for(let i=0;i<6;i++){
    await p.getByRole('button',{name:'Draw a country card',exact:true}).click();
    await p.waitForSelector('.count');await p.clock.fastForward(3100);await p.waitForSelector('.study .art-box img');
    if(await p.locator('.caption').count()!==3)throw Error('Expected three card fact labels');
    if(!/-v[23]\.png$/.test(await p.locator('.art-box img').getAttribute('src')))throw Error('Old observation art');
    if(i===0){
     await p.clock.runFor(1100);const n=Number(await p.locator('#count').textContent());
     if(n>29||n<27)throw Error('Study timer did not start '+n);
     if(await p.evaluate(()=>document.documentElement.scrollHeight>innerHeight+1))throw Error('Study overflow');
     await p.clock.fastForward(30000);
    }else await p.getByRole('button',{name:'Skip timer · practice only',exact:true}).click();
    await p.clock.fastForward(700);await p.getByRole('button',{name:'Roll the die',exact:true}).click();
    await p.getByRole('button',{name:'Check answer',exact:true}).click();
    await p.getByRole('button',{name:'I got it · +1',exact:true}).click();
    await p.getByRole('button',{name:i===5?'See practice score':'Next card',exact:true}).click();
   }
   await p.getByRole('heading',{name:'6 out of 6',exact:true}).waitFor();
   if(errors.length)throw Error(errors.join(';'));
   console.log('PASS original home and complete solo practice: auto timer, skip, dice, answers, final score',size);
   await p.close();
  }
 }finally{await browser.close();}
})().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1)});
