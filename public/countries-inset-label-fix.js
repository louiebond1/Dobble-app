/* Geography-first inset labels. Every label anchor is recomputed from the
   audited country reference point, never from a stale/spread marker position.
   Labels stay inside their panel and close to the country even if that means
   tolerating some text overlap in very dense microstate areas. */
(function(){
  function overlapArea(a,b){const ix=Math.max(0,Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x));const iy=Math.max(0,Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y));return ix*iy;}
  function clamp(v,min,max){return Math.max(min,Math.min(max,v));}
  function regionFor(key){return typeof INSETS!=='undefined'?INSETS.find(r=>r.key===key):null;}
  function pointFor(country){return typeof window.__countryReferencePoint==='function'?window.__countryReferencePoint(country):{lat:country.lat,lng:country.lng};}
  function anchorFor(key,country){
    const region=regionFor(key);if(!region||!country)return null;
    const p=pointFor(country);
    return {x:((p.lng-region.lngMin)/(region.lngMax-region.lngMin))*100,y:((region.latMax-p.lat)/(region.latMax-region.latMin))*100};
  }

  const MICRO={vat:[7,-2],smr:[7,-2],mco:[7,-2],lie:[7,-2],and:[-7,-2],lux:[-7,-2],mlt:[7,-2],xkx:[7,-2]};

  function layoutInset(key){
    const host=document.querySelector(`[data-inset-markers="${key}"]`);
    const inset=document.querySelector(`#gameArea .country-inset[data-inset="${key}"]`);
    if(!host||!inset||typeof polishedLabelRecords==='undefined')return;
    const hr=host.getBoundingClientRect();if(!hr.width||!hr.height)return;
    inset.style.overflow='hidden';host.style.overflow='hidden';
    const title=inset.querySelector('.country-inset-label');
    const tr=title?title.getBoundingClientRect():null;
    const safeTop=tr?Math.max(4,tr.bottom-hr.top+4):4;
    const margin=3,occupied=[];
    const records=polishedLabelRecords.filter(r=>r&&r.insetKey===key&&r.label&&r.label.isConnected&&!r.label.classList.contains('country-label-hidden'));

    for(const r of records){
      const label=r.label;
      const country=typeof countryById!=='undefined'?countryById.get(label.dataset.countryId):null;
      const geo=anchorFor(key,country);
      if(!geo)continue;
      r.xPct=geo.x;r.yPct=geo.y;

      label.style.transform='none';label.style.margin='0';label.style.visibility='hidden';label.style.left='0px';label.style.top='0px';
      const w=Math.max(1,label.offsetWidth),h=Math.max(1,label.offsetHeight);
      const ax=(geo.x/100)*hr.width,ay=(geo.y/100)*hr.height,gap=3;
      const id=label.dataset.countryId;

      /* Microstates get a deterministic tiny offset from their true point.
         This is intentionally geography-first: never move Vatican across Italy
         just to win a collision score. */
      let raw;
      if(key==='europe'&&MICRO[id]){
        const [dx,dy]=MICRO[id];
        raw=[[dx>=0?ax+gap:ax-w-gap, ay-h/2+dy]];
      }else{
        raw=[[ax+gap,ay-h/2],[ax-w-gap,ay-h/2],[ax-w/2,ay-h-gap],[ax-w/2,ay+gap],[ax+gap,ay-h-gap],[ax-w-gap,ay-h-gap],[ax+gap,ay+gap],[ax-w-gap,ay+gap]];
      }

      let best=null,bestScore=Infinity;
      for(const [rx,ry] of raw){
        const c={x:clamp(rx,margin,Math.max(margin,hr.width-w-margin)),y:clamp(ry,safeTop,Math.max(safeTop,hr.height-h-margin)),w,h};
        const centerDist=Math.hypot((c.x+w/2)-ax,(c.y+h/2)-ay);
        /* Hard geography constraint: never allow a normal label to drift more
           than roughly one label-height/22px from its country's point. */
        if(centerDist>Math.max(22,h*2.6)&&raw.length>1)continue;
        let score=centerDist;
        for(const o of occupied)score+=overlapArea(c,o)*18;
        if(score<bestScore){bestScore=score;best=c;}
      }
      if(!best){
        best={x:clamp(ax+gap,margin,Math.max(margin,hr.width-w-margin)),y:clamp(ay-h/2,safeTop,Math.max(safeTop,hr.height-h-margin)),w,h};
      }
      label.style.left=best.x+'px';label.style.top=best.y+'px';label.style.visibility='';occupied.push(best);
    }
  }

  function layoutAllInsets(){['europe','caribbean','gulf'].forEach(layoutInset);}
  const base=layoutAllCountryLabels;
  layoutAllCountryLabels=function(){base.apply(this,arguments);layoutAllInsets();};
  window.addEventListener('resize',()=>requestAnimationFrame(layoutAllInsets));
  if(window.visualViewport)window.visualViewport.addEventListener('resize',()=>requestAnimationFrame(layoutAllInsets));
  requestAnimationFrame(layoutAllInsets);
})();
