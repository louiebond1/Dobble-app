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
