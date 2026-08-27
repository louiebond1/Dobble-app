/* Learn v3 — A–Z map challenge. Highlights every country for the current letter; names stay hidden until recalled. */
(function(){
  const area=document.getElementById('learnArea');
  if(!area)return;
  let letter='A', found=new Set(), revealed=new Set(), message='';
  const letters='ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').filter(l=>allCountries.some(c=>c.name.toUpperCase().startsWith(l)));
  const norm=s=>(s||'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');
  const project=(lat,lng)=>({x:((lng+180)/360)*100,y:((90-lat)/180)*100});
  const list=()=>allCountries.filter(c=>c.name.toUpperCase().startsWith(letter)).sort((a,b)=>a.name.localeCompare(b.name));
  function aliases(c){const a=[c.name,c.id];if(c.aliases)a.push(...c.aliases);return a.map(norm);}
  function shell(){let s=document.getElementById('learnV3');if(s)return s;s=document.createElement('div');s.id='learnV3';s.className='learn-v3';s.innerHTML=`
    <div class="learn-v3-head"><div><div class="learn-v3-kicker">A–Z CHALLENGE</div><h2 id="lv3Title"></h2><p id="lv3Sub"></p></div><div class="learn-v3-score" id="lv3Score"></div></div>
    <div class="learn-v3-letters" id="lv3Letters"></div>
    <form class="learn-v3-form" id="lv3Form"><input id="lv3Input" autocomplete="off" autocapitalize="words" spellcheck="false" placeholder="Name a highlighted country…"><button>Enter</button></form>
    <div class="learn-v3-msg" id="lv3Msg"></div>
    <div class="learn-v3-map"><img src="/images/world-map.svg" alt="World map"><div id="lv3Dots"></div></div>
    <div class="learn-v3-actions"><button id="lv3Hint" type="button">💡 Hint</button><button id="lv3Reveal" type="button">👀 Reveal one</button><button id="lv3Reset" type="button">↻ Restart letter</button></div>
    <div class="learn-v3-found"><strong id="lv3FoundTitle"></strong><div id="lv3Found"></div></div>`;area.appendChild(s);area.classList.add('learn-v3-enabled');
    s.querySelector('#lv3Form').addEventListener('submit',e=>{e.preventDefault();guess();});
    s.querySelector('#lv3Hint').onclick=hint;s.querySelector('#lv3Reveal').onclick=revealOne;s.querySelector('#lv3Reset').onclick=()=>{found.clear();revealed.clear();message='';render();};return s;}
  function setLetter(l){letter=l;found.clear();revealed.clear();message='';render();setTimeout(()=>document.getElementById('lv3Input')?.focus(),50);}
  function guess(){const inp=document.getElementById('lv3Input'),v=norm(inp.value);if(!v)return;const c=list().find(x=>aliases(x).includes(v));if(!c){message=`“${inp.value.trim()}” isn’t an unfound ${letter} country.`;inp.select();render(false);return;}if(found.has(c.id)||revealed.has(c.id)){message=`${c.name} is already revealed.`;inp.value='';render(false);return;}found.add(c.id);message=`✓ ${c.name}`;inp.value='';if(found.size+revealed.size===list().length){message=`🎉 Letter ${letter} complete — ${list().length}/${list().length}!`;const i=letters.indexOf(letter);if(i<letters.length-1)setTimeout(()=>setLetter(letters[i+1]),1100);}render(false);}
  function hint(){const left=list().filter(c=>!found.has(c.id)&&!revealed.has(c.id));if(!left.length)return;const c=left[Math.floor(Math.random()*left.length)];message=`Hint: one starts “${c.name.slice(0,Math.min(3,c.name.length))}…”`;render(false);}
  function revealOne(){const c=list().find(x=>!found.has(x.id)&&!revealed.has(x.id));if(!c)return;revealed.add(c.id);message=`Revealed: ${c.name}`;render(false);}
  function render(focus=true){shell();const countries=list(),done=found.size+revealed.size;
    document.getElementById('lv3Title').textContent=`Letter ${letter}`;document.getElementById('lv3Sub').textContent=`Name every country beginning with ${letter}. Every orange ring is one answer.`;document.getElementById('lv3Score').textContent=`${done} / ${countries.length}`;
    const lh=document.getElementById('lv3Letters');lh.innerHTML='';letters.forEach(l=>{const b=document.createElement('button');b.type='button';b.textContent=l;b.className=l===letter?'active':'';b.onclick=()=>setLetter(l);lh.appendChild(b);});
    document.getElementById('lv3Msg').textContent=message;
    const dots=document.getElementById('lv3Dots');dots.innerHTML='';countries.forEach(c=>{const p=project(c.lat,c.lng),d=document.createElement('div');d.className='learn-v3-dot'+(found.has(c.id)?' found':'')+(revealed.has(c.id)?' revealed':'');d.style.left=p.x+'%';d.style.top=p.y+'%';if(found.has(c.id)||revealed.has(c.id)){const n=document.createElement('span');n.textContent=c.name;d.appendChild(n);}dots.appendChild(d);});
    document.getElementById('lv3FoundTitle').textContent=done?`Revealed ${done} of ${countries.length}`:'Nothing revealed yet';const fh=document.getElementById('lv3Found');fh.innerHTML='';countries.filter(c=>found.has(c.id)||revealed.has(c.id)).forEach(c=>{const x=document.createElement('span');x.className=revealed.has(c.id)?'revealed':'';x.textContent=c.name;fh.appendChild(x);});if(focus)setTimeout(()=>document.getElementById('lv3Input')?.focus(),0);
  }
  const original=window.startLearnMode;window.startLearnMode=function(){mode='learn';setupWrap.classList.add('hidden');lobby.classList.add('hidden');gameOver.classList.add('hidden');learnArea.classList.remove('hidden');tryLockPortrait();shell();render();};
})();