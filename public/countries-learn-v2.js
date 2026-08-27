/* Learn v4 — A–Z Challenge, Browse & Learn, Find It, and 60s Recall. */
(function(){
  const area=document.getElementById('learnArea');
  if(!area)return;

  const ALPHABET='ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  const REGIONS=['All','Africa','Americas','Asia','Europe','Oceania'];
  let activeMode='az';
  let letter='A';
  let region='All';
  let found=new Set();
  let revealed=new Set();
  let message='';
  let findTarget=null;
  let findScore=0;
  let findAttempts=0;
  let recallFound=new Set();
  let recallRemaining=60;
  let recallTimer=null;

  const norm=s=>(s||'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');
  const project=(lat,lng)=>({x:((lng+180)/360)*100,y:((90-lat)/180)*100});
  const aliases=c=>[c.name,c.id,...(c.aliases||[])].map(norm);
  const byLetter=l=>allCountries.filter(c=>c.name.toUpperCase().startsWith(l)).sort((a,b)=>a.name.localeCompare(b.name));
  const byRegion=r=>(r==='All'?allCountries:allCountries.filter(c=>c.region===r)).slice().sort((a,b)=>a.name.localeCompare(b.name));
  const random=a=>a[Math.floor(Math.random()*a.length)];

  function buildShell(){
    let shell=document.getElementById('learnV4');
    if(shell)return shell;
    shell=document.createElement('div');
    shell.id='learnV4';
    shell.className='learn-v4';
    shell.innerHTML=`
      <div class="learn-v4-modebar" id="lv4Modes">
        <button data-mode="az">🔤 A–Z</button>
        <button data-mode="browse">📚 Browse</button>
        <button data-mode="find">📍 Find It</button>
        <button data-mode="recall">⚡ 60s Recall</button>
      </div>
      <section id="lv4Content"></section>`;
    area.appendChild(shell);
    area.classList.add('learn-v4-enabled');
    shell.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>switchMode(b.dataset.mode)));
    return shell;
  }

  function switchMode(next){
    clearInterval(recallTimer);recallTimer=null;
    activeMode=next;message='';found.clear();revealed.clear();recallFound.clear();recallRemaining=60;findScore=0;findAttempts=0;findTarget=null;
    render();
  }

  function render(){
    buildShell();
    document.querySelectorAll('#lv4Modes [data-mode]').forEach(b=>b.classList.toggle('active',b.dataset.mode===activeMode));
    const top=area.querySelector('#learnProgress');if(top)top.textContent='Learn';
    if(activeMode==='az')renderAZ();
    if(activeMode==='browse')renderBrowse();
    if(activeMode==='find')renderFind();
    if(activeMode==='recall')renderRecall();
  }

  function mapHTML(id){return `<div class="learn-v4-map"><img src="/images/world-map.svg" alt="World map"><div id="${id}"></div></div>`;}
  function renderRegionPicker(hostId,onChange){
    const host=document.getElementById(hostId);if(!host)return;
    REGIONS.forEach(r=>{const b=document.createElement('button');b.type='button';b.textContent=r;b.className=r===region?'active':'';b.addEventListener('click',()=>{region=r;onChange();});host.appendChild(b);});
  }

  // A–Z ---------------------------------------------------------------
  function renderAZ(){
    const countries=byLetter(letter),done=found.size+revealed.size;
    const c=document.getElementById('lv4Content');
    c.innerHTML=`<div class="learn-v4-head"><div><span>A–Z CHALLENGE</span><h2>Letter ${letter}</h2><p>Name every highlighted country beginning with ${letter}.</p></div><strong>${done} / ${countries.length}</strong></div>
      <div class="learn-v4-letters" id="lv4Letters"></div>
      <form class="learn-v4-form" id="lv4AzForm"><input id="lv4AzInput" autocomplete="off" autocapitalize="words" spellcheck="false" placeholder="Name a highlighted country…"><button>Enter</button></form>
      <div class="learn-v4-message">${message||'Every orange ring is one answer. Correct answers reveal their names.'}</div>
      ${mapHTML('lv4AzDots')}
      <div class="learn-v4-actions"><button id="lv4Hint">💡 Hint</button><button id="lv4Reveal">👀 Reveal one</button><button id="lv4Reset">↻ Restart letter</button></div>
      <div class="learn-v4-chips"><strong>${countries.length?`Revealed ${done} of ${countries.length}`:'No countries begin with this letter.'}</strong><div id="lv4AzFound"></div></div>`;
    const letters=document.getElementById('lv4Letters');ALPHABET.forEach(l=>{const b=document.createElement('button');b.type='button';b.textContent=l;b.className=l===letter?'active':'';b.addEventListener('click',()=>{letter=l;found.clear();revealed.clear();message='';renderAZ();});letters.appendChild(b);});
    const dots=document.getElementById('lv4AzDots');countries.forEach(country=>{const p=project(country.lat,country.lng),d=document.createElement('div');d.className='learn-v4-dot'+(found.has(country.id)?' found':'')+(revealed.has(country.id)?' revealed':'');d.style.left=p.x+'%';d.style.top=p.y+'%';if(found.has(country.id)||revealed.has(country.id)){const s=document.createElement('span');s.textContent=country.name;d.appendChild(s);}dots.appendChild(d);});
    const foundHost=document.getElementById('lv4AzFound');countries.filter(x=>found.has(x.id)||revealed.has(x.id)).forEach(x=>{const s=document.createElement('span');s.className=revealed.has(x.id)?'revealed':'';s.textContent=x.name;foundHost.appendChild(s);});
    document.getElementById('lv4AzForm').addEventListener('submit',e=>{e.preventDefault();const inp=document.getElementById('lv4AzInput'),v=norm(inp.value);const match=countries.find(x=>aliases(x).includes(v));if(!v)return;if(!match){message=`“${inp.value.trim()}” isn’t a ${letter} country.`;renderAZ();return;}if(found.has(match.id)||revealed.has(match.id)){message=`${match.name} is already revealed.`;renderAZ();return;}found.add(match.id);message=`✓ ${match.name}`;if(found.size+revealed.size===countries.length&&countries.length){message=`🎉 Letter ${letter} complete!`;const i=ALPHABET.indexOf(letter);if(i<25)setTimeout(()=>{letter=ALPHABET[i+1];found.clear();revealed.clear();message='';renderAZ();},1000);}renderAZ();});
    document.getElementById('lv4Hint').onclick=()=>{const left=countries.filter(x=>!found.has(x.id)&&!revealed.has(x.id));if(left.length){const x=random(left);message=`Hint: one is ${x.name.length} letters and starts “${x.name.slice(0,2)}…”`;renderAZ();}};
    document.getElementById('lv4Reveal').onclick=()=>{const x=countries.find(x=>!found.has(x.id)&&!revealed.has(x.id));if(x){revealed.add(x.id);message=`Revealed: ${x.name}`;renderAZ();}};
    document.getElementById('lv4Reset').onclick=()=>{found.clear();revealed.clear();message='';renderAZ();};
    setTimeout(()=>document.getElementById('lv4AzInput')?.focus(),0);
  }

  // Browse ------------------------------------------------------------
  function renderBrowse(){
    const pool=byRegion(region),c=document.getElementById('lv4Content');
    c.innerHTML=`<div class="learn-v4-head"><div><span>BROWSE & LEARN</span><h2>${region==='All'?'Every country':region}</h2><p>Scroll the full list. Tap a country to see exactly where it is.</p></div><strong>${pool.length}</strong></div><div class="learn-v4-regions" id="lv4BrowseRegions"></div>${mapHTML('lv4BrowseDots')}<div class="learn-v4-list" id="lv4BrowseList"></div>`;
    renderRegionPicker('lv4BrowseRegions',renderBrowse);
    const dots=document.getElementById('lv4BrowseDots');pool.forEach(x=>{const p=project(x.lat,x.lng),d=document.createElement('div');d.className='learn-v4-dot soft';d.style.left=p.x+'%';d.style.top=p.y+'%';dots.appendChild(d);});
    const list=document.getElementById('lv4BrowseList');pool.forEach(x=>{const b=document.createElement('button');b.type='button';b.innerHTML=`<strong>${x.name}</strong><span>${x.region}</span>`;b.addEventListener('click',()=>highlightBrowse(x,b));list.appendChild(b);});
  }
  function highlightBrowse(country,button){document.querySelectorAll('#lv4BrowseList button').forEach(b=>b.classList.toggle('active',b===button));const dots=document.getElementById('lv4BrowseDots');dots.innerHTML='';byRegion(region).forEach(x=>{const p=project(x.lat,x.lng),d=document.createElement('div');d.className='learn-v4-dot soft'+(x.id===country.id?' target':'');d.style.left=p.x+'%';d.style.top=p.y+'%';if(x.id===country.id){const s=document.createElement('span');s.textContent=x.name;d.appendChild(s);}dots.appendChild(d);});document.querySelector('.learn-v4-map')?.scrollIntoView({behavior:'smooth',block:'nearest'});}

  // Find It -----------------------------------------------------------
  function nextFind(){const pool=byRegion(region);findTarget=random(pool);renderFind();}
  function renderFind(){
    const pool=byRegion(region);if(!findTarget||!pool.some(x=>x.id===findTarget.id))findTarget=random(pool);
    const c=document.getElementById('lv4Content');c.innerHTML=`<div class="learn-v4-head"><div><span>FIND IT</span><h2>${findTarget?`Find: ${findTarget.name}`:'Choose a region'}</h2><p>Tap the correct orange location on the map.</p></div><strong>${findScore} ✓</strong></div><div class="learn-v4-regions" id="lv4FindRegions"></div><div class="learn-v4-message">${message||`Attempts: ${findAttempts}`}</div>${mapHTML('lv4FindDots')}<div class="learn-v4-actions two"><button id="lv4FindSkip">Skip</button><button id="lv4FindReset">Reset score</button></div>`;
    renderRegionPicker('lv4FindRegions',()=>{findTarget=null;message='';renderFind();});
    const dots=document.getElementById('lv4FindDots');pool.forEach(x=>{const p=project(x.lat,x.lng),b=document.createElement('button');b.type='button';b.className='learn-v4-dot tappable';b.style.left=p.x+'%';b.style.top=p.y+'%';b.setAttribute('aria-label','Country location');b.addEventListener('click',()=>{findAttempts++;if(x.id===findTarget.id){findScore++;message=`✓ ${x.name}`;findTarget=random(pool.filter(y=>y.id!==x.id));}else message='Not quite — try another highlighted location.';renderFind();});dots.appendChild(b);});
    document.getElementById('lv4FindSkip').onclick=()=>{message=`That was ${findTarget.name}.`;findTarget=random(pool.filter(y=>y.id!==findTarget.id));renderFind();};
    document.getElementById('lv4FindReset').onclick=()=>{findScore=0;findAttempts=0;message='';findTarget=null;renderFind();};
  }

  // 60s Recall -------------------------------------------------------
  function startRecall(){clearInterval(recallTimer);recallFound.clear();recallRemaining=60;message='Go!';renderRecall();recallTimer=setInterval(()=>{recallRemaining--;if(recallRemaining<=0){clearInterval(recallTimer);recallTimer=null;message=`Time! You recalled ${recallFound.size}.`;recallRemaining=0;}renderRecall(false);},1000);}
  function renderRecall(focus=true){
    const pool=byRegion(region),running=!!recallTimer,c=document.getElementById('lv4Content');c.innerHTML=`<div class="learn-v4-head"><div><span>60s RECALL</span><h2>${recallRemaining}s</h2><p>Type as many ${region==='All'?'countries':region+' countries'} as you can before time runs out.</p></div><strong>${recallFound.size}</strong></div><div class="learn-v4-regions" id="lv4RecallRegions"></div><form class="learn-v4-form" id="lv4RecallForm"><input id="lv4RecallInput" ${running?'':'disabled'} autocomplete="off" autocapitalize="words" spellcheck="false" placeholder="Type a country…"><button ${running?'':'disabled'}>Enter</button></form><div class="learn-v4-message">${message||'Press Start when you’re ready.'}</div><button class="learn-v4-bigstart" id="lv4RecallStart">${running?'Restart':'Start 60 seconds'}</button><div class="learn-v4-chips"><strong>Recalled</strong><div id="lv4RecallFound"></div></div>`;
    renderRegionPicker('lv4RecallRegions',()=>{clearInterval(recallTimer);recallTimer=null;recallFound.clear();recallRemaining=60;message='';renderRecall(false);});
    document.getElementById('lv4RecallStart').onclick=startRecall;
    document.getElementById('lv4RecallForm').addEventListener('submit',e=>{e.preventDefault();if(!recallTimer)return;const inp=document.getElementById('lv4RecallInput'),v=norm(inp.value),match=pool.find(x=>aliases(x).includes(v));if(!match){message='Not in this set — keep going.';}else if(recallFound.has(match.id)){message=`Already got ${match.name}.`;}else{recallFound.add(match.id);message=`✓ ${match.name}`;}renderRecall();});
    const fh=document.getElementById('lv4RecallFound');pool.filter(x=>recallFound.has(x.id)).forEach(x=>{const s=document.createElement('span');s.textContent=x.name;fh.appendChild(s);});if(running&&focus)setTimeout(()=>document.getElementById('lv4RecallInput')?.focus(),0);
  }

  window.startLearnMode=function(){mode='learn';setupWrap.classList.add('hidden');lobby.classList.add('hidden');gameOver.classList.add('hidden');learnArea.classList.remove('hidden');tryLockPortrait();buildShell();render();};
})();