/* Keep main-map labels readable at the ±180° map seam.
   Pacific countries such as Samoa/Tonga sit correctly at the far-left edge
   of an equirectangular world map, while Tuvalu/Kiribati can sit at far right.
   Their labels must flip inward instead of being clipped off-screen. */
(function(){
  const host=document.getElementById('countryMarkers');
  if(!host)return;
  let raf=0;

  function pointFor(country){
    return typeof window.__countryReferencePoint==='function'
      ? window.__countryReferencePoint(country)
      : {lat:country.lat,lng:country.lng};
  }

  function schedule(){
    if(raf)cancelAnimationFrame(raf);
    raf=requestAnimationFrame(fixEdgeLabels);
  }

  function fixEdgeLabels(){
    raf=0;
    const rect=host.getBoundingClientRect();
    if(!rect.width||!rect.height)return;
    const margin=4,gap=5;

    host.querySelectorAll(':scope > .country-marker-label').forEach(label=>{
      const country=countryById&&countryById.get(label.dataset.countryId);
      if(!country)return;
      const p=pointFor(country);
      const xPct=((p.lng+180)/360)*100;
      const yPct=((90-p.lat)/180)*100;

      /* Only take over when the geographic anchor is close enough to a map
         edge that the normal collision placer can clip the label. */
      if(xPct>9&&xPct<91&&yPct>5&&yPct<95)return;

      label.style.transform='none';
      label.style.visibility='hidden';
      const w=Math.max(1,label.offsetWidth),h=Math.max(1,label.offsetHeight);
      const ax=xPct/100*rect.width,ay=yPct/100*rect.height;
      let x=ax-w/2;
      let y=ay-h-5;

      if(xPct<=9)x=ax+gap;
      else if(xPct>=91)x=ax-w-gap;

      if(yPct<=5)y=ay+gap;
      else if(yPct>=95)y=ay-h-gap;

      x=Math.max(margin,Math.min(rect.width-w-margin,x));
      y=Math.max(margin,Math.min(rect.height-h-margin,y));
      label.style.left=x+'px';
      label.style.top=y+'px';
      label.style.visibility='';
    });
  }

  const observer=new MutationObserver(schedule);
  observer.observe(host,{childList:true,subtree:false});
  window.addEventListener('resize',schedule);
  if(window.visualViewport)window.visualViewport.addEventListener('resize',schedule);

  /* Later label-layout passes can run after a reveal, so repeat briefly. */
  if(typeof revealMarker==='function'){
    const baseReveal=revealMarker;
    revealMarker=function(){
      const result=baseReveal.apply(this,arguments);
      schedule();
      setTimeout(schedule,40);
      setTimeout(schedule,180);
      setTimeout(schedule,600);
      return result;
    };
  }
})();

/* Once a found-country label has settled, keep it in that position. The older
   collision layout recalculates every label after each new answer, which makes
   existing names visibly jiggle. We still let the full layout run so density,
   inset rules and new-label placement keep working, but restore previously
   settled labels before the browser paints. A real map-size change is allowed
   to recalculate positions and becomes the new locked layout. */
(function(){
  if(typeof layoutAllCountryLabels!=='function')return;
  const unstableLayout=layoutAllCountryLabels;
  const locks=new WeakMap();

  function hostState(label){
    const host=label&&label.parentElement;
    if(!host)return null;
    const r=host.getBoundingClientRect();
    if(!r.width||!r.height)return null;
    return{host,w:r.width,h:r.height};
  }

  function sizeChanged(lock,state){
    if(!lock||!state||lock.host!==state.host)return true;
    return Math.abs(state.w-lock.w)>Math.max(2,lock.w*.02)||
      Math.abs(state.h-lock.h)>Math.max(2,lock.h*.02);
  }

  function capture(label){
    const state=hostState(label);
    if(!state)return;
    const x=parseFloat(label.style.left),y=parseFloat(label.style.top);
    if(!Number.isFinite(x)||!Number.isFinite(y))return;
    locks.set(label,{host:state.host,xRatio:x/state.w,yRatio:y/state.h,w:state.w,h:state.h});
  }

  function captureAll(){
    document.querySelectorAll('#gameArea .country-marker-label').forEach(capture);
  }

  layoutAllCountryLabels=function(){
    const preserve=[];
    document.querySelectorAll('#gameArea .country-marker-label').forEach(label=>{
      const lock=locks.get(label),state=hostState(label);
      if(lock&&state&&!sizeChanged(lock,state))preserve.push({label,lock,state});
    });

    const result=unstableLayout.apply(this,arguments);

    /* Restore old labels immediately. New labels keep the placement chosen by
       the normal collision engine, so only the newly-entered country changes. */
    for(const item of preserve){
      if(!item.label.isConnected)continue;
      item.label.style.left=(item.lock.xRatio*item.state.w)+'px';
      item.label.style.top=(item.lock.yRatio*item.state.h)+'px';
    }

    document.querySelectorAll('#gameArea .country-marker-label').forEach(label=>{
      const state=hostState(label),lock=locks.get(label);
      if(state&&(!lock||sizeChanged(lock,state)))capture(label);
    });
    return result;
  };

  /* Edge-label and reveal corrections finish over a few animation frames. Save
     the final settled result, then future guesses leave it completely still. */
  const game=document.getElementById('gameArea');
  if(game){
    const observer=new MutationObserver(()=>{
      requestAnimationFrame(captureAll);
      setTimeout(captureAll,90);
      setTimeout(captureAll,650);
    });
    observer.observe(game,{childList:true,subtree:true});
  }
  requestAnimationFrame(captureAll);
})();
