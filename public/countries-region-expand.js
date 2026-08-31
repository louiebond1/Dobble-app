/* Live tap-to-expand view for Europe / Caribbean / Middle East. */
(function(){
  const game=document.getElementById('gameArea');
  const map=document.getElementById('countryMap');
  if(!game||!map)return;

  const NAMES={europe:'Europe',caribbean:'Caribbean',gulf:'Middle East'};
  const EXPANDED={
    europe:{key:'europe',latMin:33,latMax:72,lngMin:-13,lngMax:43},
    caribbean:{key:'caribbean',latMin:6,latMax:28,lngMin:-87,lngMax:-57},
    gulf:{key:'gulf',latMin:10,latMax:40,lngMin:25,lngMax:63}
  };
  const SHORT={
    'United Arab Emirates':'UAE',
    'Bosnia and Herzegovina':'Bosnia & Herz.',
    'United Kingdom':'UK'
  };
  let activeKey=null,overlay=null,markerHost=null,bg=null,title=null;

  function pointFor(country){
    return typeof window.__countryReferencePoint==='function'?window.__countryReferencePoint(country):{lat:country.lat,lng:country.lng};
  }
  function isFound(id){
    if(mode==='solo')return foundIds.has(id);
    if(mode==='duo')return revealedIds.has(id);
    return false;
  }
  function regionFor(key){return EXPANDED[key]||INSETS.find(r=>r.key===key)||null;}

  function ensureOverlay(){
    if(overlay)return;
    overlay=document.createElement('div');
    overlay.className='country-region-expanded';
    overlay.setAttribute('aria-hidden','true');
    overlay.innerHTML='<div class="country-region-expanded-map"><img class="country-region-expanded-bg" alt=""><div class="country-region-expanded-markers"></div></div><div class="country-region-expanded-title"></div><button type="button" class="country-region-close" aria-label="Return to world map">×</button>';
    map.appendChild(overlay);
    markerHost=overlay.querySelector('.country-region-expanded-markers');
    bg=overlay.querySelector('.country-region-expanded-bg');
    title=overlay.querySelector('.country-region-expanded-title');
    overlay.querySelector('.country-region-close').addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();closeRegion();});
  }

  function configureBackground(region){
    const lngSpan=region.lngMax-region.lngMin,latSpan=region.latMax-region.latMin;
    const src=window.__WORLD_EQ_MAP_URL||document.querySelector('#countryMap .country-map-bg')?.src||'/images/world-map.svg';
    bg.src=src;
    bg.style.width=(360/lngSpan*100)+'%';
    bg.style.height=(180/latSpan*100)+'%';
    bg.style.left=(-((region.lngMin+180)/lngSpan)*100)+'%';
    bg.style.top=(-((90-region.latMax)/latSpan)*100)+'%';
  }
  function pct(region,lat,lng){return{x:((lng-region.lngMin)/(region.lngMax-region.lngMin))*100,y:((region.latMax-lat)/(region.latMax-region.latMin))*100};}

  function overlaps(a,b,pad){
    return !(a.x+a.w+pad<=b.x||b.x+b.w+pad<=a.x||a.y+a.h+pad<=b.y||b.y+b.h+pad<=a.y);
  }
  function placeLabels(items){
    const W=markerHost.clientWidth||700,H=markerHost.clientHeight||350;
    const occupied=[];
    /* Dense clusters are placed top-to-bottom so the collision solver produces
       tidy readable stacks rather than depending on guess order. */
    items.sort((a,b)=>a.pos.y-b.pos.y||a.pos.x-b.pos.x);
    for(const item of items){
      const label=document.createElement('div');
      label.className='country-region-label';
      label.textContent=SHORT[item.c.name]||item.c.name;
      label.style.visibility='hidden';
      markerHost.appendChild(label);
      const lw=Math.min(label.offsetWidth||70,W*.28),lh=label.offsetHeight||14;
      const ax=item.pos.x/100*W,ay=item.pos.y/100*H;
      const offsets=[
        [8,-lh/2],[-lw-8,-lh/2],[-lw/2,-lh-9],[-lw/2,9],
        [12,-lh-10],[12,10],[-lw-12,-lh-10],[-lw-12,10],
        [18,-lh/2-18],[-lw-18,-lh/2-18],[18,-lh/2+18],[-lw-18,-lh/2+18]
      ];
      let best=null,bestScore=Infinity;
      for(const [dx,dy] of offsets){
        const x=Math.max(7,Math.min(W-lw-7,ax+dx));
        const y=Math.max(48,Math.min(H-lh-7,ay+dy));
        const r={x,y,w:lw,h:lh};
        let score=Math.hypot(x-(ax+dx),y-(ay+dy))*4 + Math.hypot((x+lw/2)-ax,(y+lh/2)-ay)*.05;
        for(const o of occupied){
          if(overlaps(r,o,3)){
            const ox=Math.max(0,Math.min(x+lw,o.x+o.w)-Math.max(x,o.x));
            const oy=Math.max(0,Math.min(y+lh,o.y+o.h)-Math.max(y,o.y));
            score+=10000+(ox+3)*(oy+3)*100;
          }
        }
        if(score<bestScore){bestScore=score;best=r;}
      }
      /* If all natural positions collide, scan a compact ring around the dot.
         This is mainly for Israel/Palestine/Jordan/Lebanon and micro-Europe. */
      if(bestScore>=10000){
        for(let radius=18;radius<=72;radius+=9){
          for(let deg=0;deg<360;deg+=30){
            const rad=deg*Math.PI/180;
            const x=Math.max(7,Math.min(W-lw-7,ax+Math.cos(rad)*radius-lw/2));
            const y=Math.max(48,Math.min(H-lh-7,ay+Math.sin(rad)*radius-lh/2));
            const r={x,y,w:lw,h:lh};
            if(occupied.every(o=>!overlaps(r,o,3))){best=r;bestScore=radius;break;}
          }
          if(bestScore<10000)break;
        }
      }
      label.style.left=best.x+'px';label.style.top=best.y+'px';
      label.style.transform='none';label.style.visibility='visible';
      occupied.push(best);
    }
  }

  function render(){
    if(!activeKey||!markerHost)return;
    const region=regionFor(activeKey);if(!region)return;
    markerHost.innerHTML='';
    const frag=document.createDocumentFragment(),foundLabels=[];
    for(const c of allCountries){
      const p=pointFor(c);
      if(p.lat<region.latMin||p.lat>region.latMax||p.lng<region.lngMin||p.lng>region.lngMax)continue;
      const pos=pct(region,p.lat,p.lng);
      const dot=document.createElement('div');
      dot.className='country-region-dot'+(isFound(c.id)?' found':'');
      dot.style.left=pos.x+'%';dot.style.top=pos.y+'%';dot.dataset.countryId=c.id;
      frag.appendChild(dot);
      if(isFound(c.id))foundLabels.push({c,pos});
    }
    markerHost.appendChild(frag);
    placeLabels(foundLabels);
  }

  function openRegion(key){
    const region=regionFor(key);if(!region)return;
    ensureOverlay();activeKey=key;title.textContent=NAMES[key]||key;
    configureBackground(region);overlay.classList.add('is-open');overlay.setAttribute('aria-hidden','false');
    requestAnimationFrame(render);
  }
  function closeRegion(){if(!overlay)return;overlay.classList.remove('is-open');overlay.setAttribute('aria-hidden','true');activeKey=null;}

  map.addEventListener('pointerup',e=>{
    const inset=e.target.closest&&e.target.closest('.country-inset');
    if(!inset||overlay?.classList.contains('is-open'))return;
    const key=inset.dataset.inset;if(!key)return;
    e.preventDefault();e.stopPropagation();openRegion(key);
  },true);

  const baseReveal=revealMarker;
  revealMarker=function(id,ownerName){baseReveal(id,ownerName);if(activeKey)requestAnimationFrame(render);};
  const baseBuild=buildMarkers;
  buildMarkers=function(){baseBuild.apply(this,arguments);if(activeKey)requestAnimationFrame(render);};
  window.addEventListener('resize',()=>{if(activeKey)requestAnimationFrame(render);});
})();
