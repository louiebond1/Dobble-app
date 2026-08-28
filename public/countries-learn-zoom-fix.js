/* Learn zoom + Team Up safety/recovery. */
(function(){
  /* Learn mode marker scaling while zooming. */
  function syncStage(stage){
    const t=stage.style.transform||'';
    const m=t.match(/scale\(([-\d.]+)\)/);
    const scale=m?Math.max(.001,parseFloat(m[1])):1;
    stage.style.setProperty('--learn-marker-scale',String(1/Math.pow(scale,1.5)));
  }
  function watch(stage){
    if(!stage||stage.dataset.markerScaleReady==='1')return;
    stage.dataset.markerScaleReady='1';syncStage(stage);
    new MutationObserver(()=>syncStage(stage)).observe(stage,{attributes:true,attributeFilter:['style']});
  }
  function scan(){document.querySelectorAll('.learn-v4-map-stage').forEach(watch);}
  new MutationObserver(scan).observe(document.documentElement,{childList:true,subtree:true});
  document.addEventListener('DOMContentLoaded',scan);scan();

  /* ------------------------------------------------------------------
     Team Up safe map zoom. iOS/Safari pinch gestures are captured by the
     map itself instead of zooming/reflowing the whole page. This means a
     pinch cannot make the gameplay board vanish or trigger the resize path
     that caused the reported disconnect.
  ------------------------------------------------------------------ */
  function installTeamMapZoom(){
    const map=document.getElementById('countryMap');
    if(!map||map.dataset.safeZoomReady==='1')return;
    map.dataset.safeZoomReady='1';
    map.style.transformOrigin='50% 50%';
    map.style.willChange='transform';
    map.style.touchAction='none';
    let scale=1,tx=0,ty=0,pointers=new Map(),startX=0,startY=0,startTx=0,startTy=0,pinchStart=0,pinchScale=1;
    const parent=map.parentElement;
    if(parent)parent.style.overflow='hidden';
    function clamp(){const r=(parent||map).getBoundingClientRect();const mx=Math.max(0,r.width*(scale-1)/2),my=Math.max(0,r.height*(scale-1)/2);tx=Math.max(-mx,Math.min(mx,tx));ty=Math.max(-my,Math.min(my,ty));}
    function apply(){clamp();map.style.transform=`translate(${tx}px,${ty}px) scale(${scale})`;map.style.setProperty('--team-map-scale',String(scale));}
    function setScale(next,cx,cy){next=Math.max(1,Math.min(4,next));const r=(parent||map).getBoundingClientRect();const ox=(cx??r.left+r.width/2)-r.left-r.width/2,oy=(cy??r.top+r.height/2)-r.top-r.height/2;const ratio=next/scale;tx=ox-(ox-tx)*ratio;ty=oy-(oy-ty)*ratio;scale=next;apply();}
    map.addEventListener('pointerdown',e=>{if(e.pointerType==='mouse'&&e.button!==0)return;map.setPointerCapture?.(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(pointers.size===1){startX=e.clientX;startY=e.clientY;startTx=tx;startTy=ty;}else if(pointers.size===2){const a=[...pointers.values()];pinchStart=Math.hypot(a[1].x-a[0].x,a[1].y-a[0].y);pinchScale=scale;}},{passive:true});
    map.addEventListener('pointermove',e=>{if(!pointers.has(e.pointerId))return;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(pointers.size===1&&scale>1){tx=startTx+(e.clientX-startX);ty=startTy+(e.clientY-startY);apply();}else if(pointers.size===2){const a=[...pointers.values()],d=Math.hypot(a[1].x-a[0].x,a[1].y-a[0].y);if(pinchStart)setScale(pinchScale*(d/pinchStart),(a[0].x+a[1].x)/2,(a[0].y+a[1].y)/2);}},{passive:true});
    const end=e=>{pointers.delete(e.pointerId);if(pointers.size===1){const p=[...pointers.values()][0];startX=p.x;startY=p.y;startTx=tx;startTy=ty;}};
    map.addEventListener('pointerup',end);map.addEventListener('pointercancel',end);
    map.addEventListener('gesturestart',e=>e.preventDefault(),{passive:false});
    map.addEventListener('gesturechange',e=>e.preventDefault(),{passive:false});
    map.addEventListener('gestureend',e=>e.preventDefault(),{passive:false});
    map.addEventListener('dblclick',e=>{e.preventDefault();setScale(scale>1?1:2,e.clientX,e.clientY);});
    window.__resetCountriesMapZoom=()=>{scale=1;tx=0;ty=0;apply();};
    apply();
  }
  installTeamMapZoom();

  /* ------------------------------------------------------------------
     Team Up crash recovery.
  ------------------------------------------------------------------ */
  const KEY='countries-teamup-live-v1';
  let resumeData=null,resumePending=false,resumeStarted=false,resumeTimer=null;
  const safeRead=()=>{try{const d=JSON.parse(localStorage.getItem(KEY)||'null');if(!d||!d.active||Date.now()-(d.savedAt||0)>30*60*1000)return null;return d;}catch(e){return null;}};
  const timerSeconds=()=>{const t=document.getElementById('timerDisplay')?.textContent||'';const m=t.match(/(\d+):(\d{2})/);return m?Number(m[1])*60+Number(m[2]):null;};
  function saveSnapshot(){
    try{
      if(typeof mode==='undefined'||mode!=='duo'||!roomCode||!myName||!gameArea||gameArea.classList.contains('hidden'))return;
      const secs=timerSeconds();
      const prev=safeRead();
      const data={active:true,name:myName,code:roomCode,found:[...revealedIds],remaining:Number.isFinite(secs)?secs:(prev?.remaining||900),savedAt:Date.now()};
      localStorage.setItem(KEY,JSON.stringify(data));
    }catch(e){}
  }
  setInterval(saveSnapshot,1000);
  window.addEventListener('pagehide',saveSnapshot);
  window.addEventListener('beforeunload',saveSnapshot);
  socket.on('disconnect',saveSnapshot);
  socket.on('countries:game:over',()=>{try{localStorage.removeItem(KEY);}catch(e){};if(resumeTimer)clearInterval(resumeTimer);});
  socket.on('countries:room:cancelled',()=>{if(!resumePending)try{localStorage.removeItem(KEY);}catch(e){}});

  function showResumeOffer(){
    const d=safeRead();if(!d||document.getElementById('countriesResumeCard'))return;
    const panel=document.getElementById('setup');if(!panel)return;
    const card=document.createElement('div');card.id='countriesResumeCard';card.style.cssText='margin:0 0 14px;padding:13px;border-radius:14px;background:rgba(255,209,102,.16);border:1px solid rgba(255,209,102,.42);color:#4a3070;text-align:left';
    const mins=Math.max(0,Math.floor((d.remaining||0)/60)),secs=Math.max(0,(d.remaining||0)%60);
    card.innerHTML=`<strong style="display:block;margin-bottom:4px">↩️ Continue Team Up?</strong><span style="font-size:.8rem">${(d.found||[]).length}/197 found · ${mins}:${String(secs).padStart(2,'0')} left</span><div style="display:flex;gap:8px;margin-top:10px"><button type="button" id="countriesResumeBtn" style="flex:1;border:0;border-radius:10px;padding:10px;background:#ed3b8f;color:white;font-weight:800">Resume game</button><button type="button" id="countriesDiscardBtn" style="border:1px solid rgba(74,48,112,.2);border-radius:10px;padding:10px;background:white;color:#4a3070;font-weight:750">Discard</button></div>`;
    panel.prepend(card);
    card.querySelector('#countriesDiscardBtn').onclick=()=>{localStorage.removeItem(KEY);card.remove();};
    card.querySelector('#countriesResumeBtn').onclick=()=>{resumeData=d;resumePending=true;card.remove();quickPlayJoin(d.name);setTimeout(tryResumeIntoGame,500);};
  }
  function tryResumeIntoGame(){if(!resumePending||!resumeData)return;if(roomCode){mode='duo';setupWrap.classList.add('hidden');lobby.classList.remove('hidden');}}
  socket.on('countries:players:update',list=>{if(!resumePending||resumeStarted||!Array.isArray(list)||list.length<2||!roomCode)return;if(amHost()){resumeStarted=true;setTimeout(()=>socket.emit('countries:host:start',{code:roomCode}),250);}});
  function restoreSnapshot(){
    if(!resumePending||!resumeData)return;
    try{
      if(typeof buildMarkers==='function')buildMarkers();revealedIds.clear();
      (resumeData.found||[]).forEach((id,i)=>{revealedIds.add(id);setTimeout(()=>{try{socket.emit('countries:guess',{code:roomCode,countryId:id},()=>{});if(markerEls.has(id))revealMarker(id,'Recovered');}catch(e){}},i*12);});
      const progress=document.getElementById('countryProgress');if(progress)progress.textContent=`${revealedIds.size} / 197`;
      const fill=document.getElementById('countryProgressFill');if(fill)fill.style.width=`${(revealedIds.size/197)*100}%`;
      setupWrap.classList.add('hidden');lobby.classList.add('hidden');gameOver.classList.add('hidden');gameArea.classList.remove('hidden');
      const endAt=Date.now()+Math.max(1,resumeData.remaining||900)*1000;
      clearInterval(resumeTimer);resumeTimer=setInterval(()=>{const left=Math.max(0,Math.ceil((endAt-Date.now())/1000)),m=Math.floor(left/60),s=left%60;const td=document.getElementById('timerDisplay');if(td)td.textContent=`⏱️ ${m}:${String(s).padStart(2,'0')}`;if(left<=0){clearInterval(resumeTimer);if(amHost()&&roomCode)socket.emit('countries:host:end',{code:roomCode});}},200);
      document.getElementById('guessInput')?.focus();resumePending=false;
    }catch(e){console.error('Countries resume failed',e);}
  }
  socket.on('countries:game:start',()=>setTimeout(restoreSnapshot,250));
  socket.on('countries:reveal',saveSnapshot);

  /* ------------------------------------------------------------------
     Solo crash/reload recovery. Solo is untimed, so we preserve the exact
     found-country set plus the original start timestamp. Resuming restores
     the board and elapsed clock exactly where the player left off.
  ------------------------------------------------------------------ */
  const SOLO_KEY='countries-solo-live-v1';
  const readSolo=()=>{try{const d=JSON.parse(localStorage.getItem(SOLO_KEY)||'null');if(!d||!d.active||Date.now()-(d.savedAt||0)>24*60*60*1000)return null;return d;}catch(e){return null;}};
  function saveSolo(){
    try{
      if(typeof mode==='undefined'||mode!=='solo'||!gameArea||gameArea.classList.contains('hidden')||!soloStartedAt)return;
      localStorage.setItem(SOLO_KEY,JSON.stringify({active:true,name:myName||'You',found:[...foundIds],startedAt:soloStartedAt,savedAt:Date.now()}));
    }catch(e){}
  }
  setInterval(saveSolo,1000);
  window.addEventListener('pagehide',saveSolo);
  window.addEventListener('beforeunload',saveSolo);

  const originalStartSoloGame=typeof startSoloGame==='function'?startSoloGame:null;
  if(originalStartSoloGame){
    startSoloGame=function(){try{localStorage.removeItem(SOLO_KEY);}catch(e){};return originalStartSoloGame.apply(this,arguments);};
  }
  const originalEndSoloGame=typeof endSoloGame==='function'?endSoloGame:null;
  if(originalEndSoloGame){
    endSoloGame=function(){try{localStorage.removeItem(SOLO_KEY);}catch(e){};return originalEndSoloGame.apply(this,arguments);};
  }

  function restoreSolo(d){
    if(!d||!allCountries.length){setTimeout(()=>restoreSolo(d),120);return;}
    try{
      mode='solo';myName=d.name||'You';foundIds=new Set((d.found||[]).filter(id=>countryById.has(id)));players=[{name:myName,score:foundIds.size}];soloStartedAt=Number(d.startedAt)||Date.now();
      setupWrap.classList.add('hidden');lobby.classList.add('hidden');gameOver.classList.add('hidden');gameArea.classList.remove('hidden');
      document.getElementById('hudP2')?.classList.add('hidden');
      if(document.getElementById('hudP1Name'))document.getElementById('hudP1Name').textContent=myName;
      if(document.getElementById('hudP1Score'))document.getElementById('hudP1Score').textContent=String(foundIds.size);
      document.getElementById('giveUpBtn')?.classList.remove('hidden');
      if(document.getElementById('countryFeed'))document.getElementById('countryFeed').innerHTML='';
      if(document.getElementById('guessInput'))document.getElementById('guessInput').value='';
      tryLockPortrait();buildMarkers();updateProgress(foundIds.size);
      const ids=[...foundIds];ids.forEach((id,i)=>setTimeout(()=>{const c=countryById.get(id);if(markerEls.has(id))revealMarker(id,myName);if(c)addFeedItem(c.name,null);},i*8));
      startElapsedClock(soloStartedAt);window.__resetCountriesMapZoom?.();document.getElementById('guessInput')?.focus();saveSolo();
    }catch(e){console.error('Solo resume failed',e);}
  }

  function showSoloResumeOffer(){
    const d=readSolo();if(!d||document.getElementById('countriesSoloResumeCard'))return;
    const panel=document.getElementById('setup');if(!panel)return;
    const elapsed=Math.max(0,Date.now()-(Number(d.startedAt)||Date.now())),mins=Math.floor(elapsed/60000),secs=Math.floor((elapsed%60000)/1000);
    const card=document.createElement('div');card.id='countriesSoloResumeCard';card.style.cssText='margin:0 0 14px;padding:13px;border-radius:14px;background:rgba(126,211,255,.14);border:1px solid rgba(126,211,255,.38);color:#4a3070;text-align:left';
    card.innerHTML=`<strong style="display:block;margin-bottom:4px">↩️ Continue Solo?</strong><span style="font-size:.8rem">${(d.found||[]).length}/197 found · ${mins}:${String(secs).padStart(2,'0')} elapsed</span><div style="display:flex;gap:8px;margin-top:10px"><button type="button" id="countriesSoloResumeBtn" style="flex:1;border:0;border-radius:10px;padding:10px;background:#ed3b8f;color:white;font-weight:800">Resume Solo</button><button type="button" id="countriesSoloDiscardBtn" style="border:1px solid rgba(74,48,112,.2);border-radius:10px;padding:10px;background:white;color:#4a3070;font-weight:750">Discard</button></div>`;
    panel.prepend(card);
    card.querySelector('#countriesSoloDiscardBtn').onclick=()=>{localStorage.removeItem(SOLO_KEY);card.remove();};
    card.querySelector('#countriesSoloResumeBtn').onclick=()=>{card.remove();restoreSolo(d);};
  }

  setTimeout(()=>{showResumeOffer();showSoloResumeOffer();},250);
})();