/* Interactive Learn v2: region-based Explore/Alphabetical study, then self-test. */
(function(){
  const area=document.getElementById('learnArea');
  if(!area)return;

  const REGION_ORDER=['Africa','Americas','Asia','Europe','Oceania'];
  let selectedRegion='Oceania';
  let studyOrder='alphabetical';
  let studyList=[];
  let studyIndex=0;
  let mastered=new Set();
  let testQueue=[];
  let testIndex=0;
  let testScore=0;
  let testLocked=false;

  function projectPct(lat,lng){return{x:((lng+180)/360)*100,y:((90-lat)/180)*100};}
  function regionCountries(region){return allCountries.filter(c=>c.region===region);}
  function orderedRegion(region){const list=regionCountries(region).slice();return studyOrder==='alphabetical'?list.sort((a,b)=>a.name.localeCompare(b.name)):shuffle(list);}
  function shuffle(a){const x=a.slice();for(let i=x.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[x[i],x[j]]=[x[j],x[i]];}return x;}
  function sampleOptions(correct,pool){const others=shuffle(pool.filter(c=>c.id!==correct.id)).slice(0,3);return shuffle([correct,...others]);}

  function ensureShell(){
    let shell=document.getElementById('learnV2Shell');
    if(shell)return shell;
    shell=document.createElement('div');
    shell.id='learnV2Shell';shell.className='learn-v2-shell';
    shell.innerHTML=`
      <div class="learn-v2-toolbar">
        <div class="learn-v2-region" id="learnV2Regions"></div>
        <div class="learn-v2-region" id="learnV2Order">
          <button type="button" data-order="alphabetical">A–Z</button>
          <button type="button" data-order="explore">Explore</button>
        </div>
        <button type="button" class="learn-v2-action primary" id="learnV2TestBtn">🎯 Test me</button>
      </div>
      <div class="learn-v2-study" id="learnV2Study">
        <div class="learn-v2-map-card">
          <div class="learn-v2-map" id="learnV2Map"><img src="/images/world-map.svg" alt="World map"><div class="learn-v2-dots" id="learnV2Dots"></div></div>
          <div class="learn-v2-card">
            <div><div class="learn-v2-name" id="learnV2Name"></div><div class="learn-v2-meta" id="learnV2Meta"></div></div>
            <div class="learn-v2-nav"><button type="button" id="learnV2Prev" aria-label="Previous country">←</button><button type="button" id="learnV2Next" aria-label="Next country">→</button></div>
          </div>
        </div>
        <div class="learn-v2-strip" id="learnV2Strip"></div>
      </div>
      <div class="learn-v2-test" id="learnV2Test">
        <div class="learn-v2-test-head"><strong id="learnV2TestTitle"></strong><span class="learn-v2-test-progress" id="learnV2TestProgress"></span></div>
        <div class="learn-v2-map" id="learnV2TestMap"><img src="/images/world-map.svg" alt="World map"><div class="learn-v2-dots" id="learnV2TestDots"></div></div>
        <div class="learn-v2-question" id="learnV2Question"></div>
        <div class="learn-v2-options" id="learnV2Options"></div>
        <div id="learnV2Result"></div>
      </div>`;
    area.appendChild(shell);area.classList.add('learn-v2-enabled');
    document.getElementById('learnV2Prev').addEventListener('click',()=>moveStudy(-1));
    document.getElementById('learnV2Next').addEventListener('click',()=>moveStudy(1));
    document.getElementById('learnV2TestBtn').addEventListener('click',startTest);
    document.querySelectorAll('#learnV2Order button').forEach(btn=>btn.addEventListener('click',()=>setOrder(btn.dataset.order)));
    renderRegions();renderOrder();
    return shell;
  }

  function renderRegions(){const host=document.getElementById('learnV2Regions');if(!host)return;host.innerHTML='';REGION_ORDER.forEach(region=>{const b=document.createElement('button');b.type='button';b.textContent=region;b.classList.toggle('active',region===selectedRegion);b.addEventListener('click',()=>selectRegion(region));host.appendChild(b);});}
  function renderOrder(){document.querySelectorAll('#learnV2Order button').forEach(b=>b.classList.toggle('active',b.dataset.order===studyOrder));}
  function setOrder(order){if(!['alphabetical','explore'].includes(order))return;studyOrder=order;studyList=orderedRegion(selectedRegion);studyIndex=0;renderOrder();renderStudy();}
  function selectRegion(region){selectedRegion=region;studyList=orderedRegion(region);studyIndex=0;renderRegions();renderStudy();}

  function renderStudy(){
    if(!studyList.length)studyList=orderedRegion(selectedRegion);
    const c=studyList[studyIndex];if(!c)return;
    document.getElementById('learnV2Study').classList.remove('hidden');
    document.getElementById('learnV2Test').classList.remove('active');
    document.getElementById('learnV2Name').textContent=c.name;
    document.getElementById('learnV2Meta').textContent=`${selectedRegion} · ${studyIndex+1} of ${studyList.length} · ${studyOrder==='alphabetical'?'A–Z study':'Explore mode'}`;
    renderStudyDots(c.id);renderStrip();
    const top=area.querySelector('#learnProgress');if(top)top.textContent=`Learn · ${selectedRegion}`;
  }

  function renderStudyDots(activeId){const host=document.getElementById('learnV2Dots');host.innerHTML='';studyList.forEach(c=>{const p=projectPct(c.lat,c.lng),b=document.createElement('button');b.type='button';b.className='learn-v2-dot'+(c.id===activeId?' current':'')+(mastered.has(c.id)?' mastered':'');b.style.left=p.x+'%';b.style.top=p.y+'%';b.title=c.name;b.setAttribute('aria-label',c.name);b.addEventListener('click',()=>{studyIndex=studyList.findIndex(x=>x.id===c.id);renderStudy();});host.appendChild(b);});}
  function renderStrip(){const host=document.getElementById('learnV2Strip');host.innerHTML='';studyList.forEach((c,i)=>{const b=document.createElement('button');b.type='button';b.className='learn-v2-country-pill'+(i===studyIndex?' active':'')+(mastered.has(c.id)?' mastered':'');b.textContent=c.name;b.addEventListener('click',()=>{studyIndex=i;renderStudy();});host.appendChild(b);if(i===studyIndex)setTimeout(()=>b.scrollIntoView({behavior:'smooth',block:'nearest',inline:'center'}),0);});}
  function moveStudy(delta){if(!studyList.length)return;studyIndex=(studyIndex+delta+studyList.length)%studyList.length;renderStudy();}

  function startTest(){
    studyList=orderedRegion(selectedRegion);if(!studyList.length)return;
    testQueue=shuffle(studyList);testIndex=0;testScore=0;testLocked=false;
    document.getElementById('learnV2Study').classList.add('hidden');
    document.getElementById('learnV2Test').classList.add('active');
    document.getElementById('learnV2Result').innerHTML='';
    renderQuestion();
  }

  function renderQuestion(){
    if(testIndex>=testQueue.length){finishTest();return;}
    testLocked=false;
    const c=testQueue[testIndex],p=projectPct(c.lat,c.lng);
    document.getElementById('learnV2TestTitle').textContent=`${selectedRegion} test`;
    document.getElementById('learnV2TestProgress').textContent=`${testIndex+1} / ${testQueue.length}`;
    const dots=document.getElementById('learnV2TestDots');dots.innerHTML='';
    testQueue.forEach(country=>{const q=projectPct(country.lat,country.lng),d=document.createElement('div');d.className='learn-v2-dot';d.style.left=q.x+'%';d.style.top=q.y+'%';if(country.id===c.id)d.classList.add('current');dots.appendChild(d);});
    document.getElementById('learnV2Question').innerHTML=`<strong>Which country is highlighted?</strong><span>Choose the correct name.</span>`;
    const opts=document.getElementById('learnV2Options');opts.innerHTML='';
    sampleOptions(c,studyList).forEach(option=>{const b=document.createElement('button');b.type='button';b.textContent=option.name;b.addEventListener('click',()=>answer(option,c,b));opts.appendChild(b);});
  }

  function answer(choice,correct,button){
    if(testLocked)return;testLocked=true;
    const buttons=[...document.querySelectorAll('#learnV2Options button')];
    buttons.forEach(b=>{if(b.textContent===correct.name)b.classList.add('correct');b.disabled=true;});
    if(choice.id===correct.id){testScore++;mastered.add(correct.id);}else{button.classList.add('wrong');}
    setTimeout(()=>{testIndex++;renderQuestion();},650);
  }

  function finishTest(){
    const pct=testQueue.length?Math.round((testScore/testQueue.length)*100):0;
    document.getElementById('learnV2TestDots').innerHTML='';
    document.getElementById('learnV2Options').innerHTML='';
    document.getElementById('learnV2Question').innerHTML='';
    document.getElementById('learnV2TestProgress').textContent='Complete';
    document.getElementById('learnV2Result').innerHTML=`<div class="learn-v2-result"><h3>${testScore} / ${testQueue.length}</h3><p>${pct}% correct in ${selectedRegion}.</p><button type="button" class="learn-v2-action primary" id="learnV2Again">Test again</button> <button type="button" class="learn-v2-action" id="learnV2Back">Back to learning</button></div>`;
    document.getElementById('learnV2Again').addEventListener('click',startTest);
    document.getElementById('learnV2Back').addEventListener('click',renderStudy);
  }

  const originalStart=window.startLearnMode;
  window.startLearnMode=function(){
    mode='learn';
    setupWrap.classList.add('hidden');lobby.classList.add('hidden');gameOver.classList.add('hidden');learnArea.classList.remove('hidden');
    tryLockPortrait();ensureShell();studyList=orderedRegion(selectedRegion);studyIndex=0;renderStudy();
  };
})();