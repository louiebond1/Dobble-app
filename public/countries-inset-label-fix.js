/* Keep every inset label inside its panel, below the title, and near its marker. */
(function(){
  function overlap(a,b,pad=0){return a.x<b.x+b.w+pad&&a.x+a.w+pad>b.x&&a.y<b.y+b.h+pad&&a.y+a.h+pad>b.y;}
  function overlapArea(a,b){const ix=Math.max(0,Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x));const iy=Math.max(0,Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y));return ix*iy;}
  function clamp(v,min,max){return Math.max(min,Math.min(max,v));}

  function layoutInset(key){
    const host=document.querySelector(`[data-inset-markers="${key}"]`);
    const inset=document.querySelector(`#gameArea .country-inset[data-inset="${key}"]`);
    if(!host||!inset||typeof polishedLabelRecords==='undefined')return;
    const hr=host.getBoundingClientRect();
    if(!hr.width||!hr.height)return;
    inset.style.overflow='hidden';host.style.overflow='hidden';
    const title=inset.querySelector('.country-inset-label');
    const tr=title?title.getBoundingClientRect():null;
    const safeTop=tr?Math.max(4,tr.bottom-hr.top+4):4;
    const margin=3,occupied=[];
    const records=polishedLabelRecords.filter(r=>r&&r.insetKey===key&&r.label&&r.label.isConnected&&!r.label.classList.contains('country-label-hidden'));
    for(const r of records){
      const label=r.label;label.style.transform='none';label.style.margin='0';label.style.visibility='hidden';label.style.left='0px';label.style.top='0px';
      const w=Math.max(1,label.offsetWidth),h=Math.max(1,label.offsetHeight);
      const ax=(r.xPct/100)*hr.width,ay=(r.yPct/100)*hr.height,gap=3;
      const raw=[[ax-w/2,ay-h-gap],[ax+gap,ay-h/2],[ax-w/2,ay+gap],[ax-w-gap,ay-h/2],[ax+gap,ay-h-gap],[ax-w-gap,ay-h-gap],[ax+gap,ay+gap],[ax-w-gap,ay+gap]];
      let best=null,bestScore=Infinity;
      for(const [rx,ry] of raw){
        const c={x:clamp(rx,margin,Math.max(margin,hr.width-w-margin)),y:clamp(ry,safeTop,Math.max(safeTop,hr.height-h-margin)),w,h};
        let score=Math.hypot((c.x+w/2)-ax,(c.y+h/2)-ay);
        for(const o of occupied)score+=overlapArea(c,o)*150;
        if(score<bestScore){bestScore=score;best=c;}
        if(!occupied.some(o=>overlap(c,o,1))&&score<30){best=c;break;}
      }
      if(!best)continue;
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
