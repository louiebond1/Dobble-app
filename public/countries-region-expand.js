/* Live tap-to-expand view for Europe / Caribbean / Middle East. */
(function(){
  const game=document.getElementById('gameArea');
  const map=document.getElementById('countryMap');
  if(!game||!map)return;

  const NAMES={europe:'Europe',caribbean:'Caribbean',gulf:'Middle East'};
  /* Expanded views deliberately use a little breathing room around the small
     inset crop. This keeps edge countries and their labels on-screen. */
  const EXPANDED={
    europe:{key:'europe',latMin:33,latMax:72,lngMin:-13,lngMax:43},
    caribbean:{key:'caribbean',latMin:6,latMax:28,lngMin:-87,lngMax:-57},
    gulf:{key:'gulf',latMin:12,latMax:39,lngMin:28,lngMax:61}
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

  function placeLabels(items){
    const W=markerHost.clientWidth||700,H=markerHost.clientHeight||350;
    const occupied=[];
    for(const item of items){
      const label=document.createElement('div');
      label.className='country-region-label';
      label.textContent=item.c.name;
      label.style.visibility='hidden';
      markerHost.appendChild(label);
      const lw=Math.min(label.offsetWidth||70,W*.34),lh=label.offsetHeight||14;
      const ax=item.pos.x/100*W,ay=item.pos.y/100*H;
      const candidates=[
        {x:ax+7,y:ay-lh/2},{x:ax-lw-7,y:ay-lh/2},
        {x:ax-lw/2,y:ay-lh-7},{x:ax-lw/2,y:ay+7}
      ];
      let best=null,bestScore=Infinity;
      for(const c of candidates){
        const x=Math.max(5,Math.min(W-lw-5,c.x));
        const y=Math.max(42,Math.min(H-lh-5,c.y));
        const r={x,y,w:lw,h:lh};
        let score=Math.hypot(x-c.x,y-c.y)*3;
        for(const o of occupied){
          const ox=Math.max(0,Math.min(x+lw,o.x+o.w)-Math.max(x,o.x));
          const oy=Math.max(0,Math.min(y+lh,o.y+o.h)-Math.max(y,o.y));
          score+=ox*oy*8;
        }
        if(score<bestScore){bestScore=score;best=r;}
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
