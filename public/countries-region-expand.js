/* Live tap-to-expand view for Europe / Caribbean / Middle East. */
(function(){
  const game=document.getElementById('gameArea');
  const map=document.getElementById('countryMap');
  if(!game||!map)return;

  const NAMES={europe:'Europe',caribbean:'Caribbean',gulf:'Middle East'};
  let activeKey=null;
  let overlay=null;
  let markerHost=null;
  let bg=null;
  let title=null;

  function pointFor(country){
    return typeof window.__countryReferencePoint==='function'
      ? window.__countryReferencePoint(country)
      : {lat:country.lat,lng:country.lng};
  }

  function isFound(id){
    if(mode==='solo')return foundIds.has(id);
    if(mode==='duo')return revealedIds.has(id);
    return false;
  }

  function regionFor(key){return INSETS.find(r=>r.key===key)||null;}

  function ensureOverlay(){
    if(overlay)return;
    overlay=document.createElement('div');
    overlay.className='country-region-expanded';
    overlay.setAttribute('aria-hidden','true');
    overlay.innerHTML='<div class="country-region-expanded-map"><img class="country-region-expanded-bg" alt=""><div class="country-region-expanded-markers"></div></div><div class="country-region-expanded-title"></div><button type="button" class="country-region-close" aria-label="Close enlarged region">×</button><div class="country-region-hint">Tap × to return to the world map</div>';
    map.appendChild(overlay);
    markerHost=overlay.querySelector('.country-region-expanded-markers');
    bg=overlay.querySelector('.country-region-expanded-bg');
    title=overlay.querySelector('.country-region-expanded-title');
    overlay.querySelector('.country-region-close').addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();closeRegion();});
  }

  function configureBackground(region){
    const lngSpan=region.lngMax-region.lngMin;
    const latSpan=region.latMax-region.latMin;
    const src=window.__WORLD_EQ_MAP_URL||document.querySelector('#countryMap .country-map-bg')?.src||'/images/world-map.svg';
    bg.src=src;
    bg.style.width=(360/lngSpan*100)+'%';
    bg.style.height=(180/latSpan*100)+'%';
    bg.style.left=(-((region.lngMin+180)/lngSpan)*100)+'%';
    bg.style.top=(-((90-region.latMax)/latSpan)*100)+'%';
  }

  function pct(region,lat,lng){
    return {
      x:((lng-region.lngMin)/(region.lngMax-region.lngMin))*100,
      y:((region.latMax-lat)/(region.latMax-region.latMin))*100
    };
  }

  function render(){
    if(!activeKey||!markerHost)return;
    const region=regionFor(activeKey);if(!region)return;
    markerHost.innerHTML='';
    const frag=document.createDocumentFragment();
    const foundLabels=[];
    for(const c of allCountries){
      const p=pointFor(c);
      if(p.lat<region.latMin||p.lat>region.latMax||p.lng<region.lngMin||p.lng>region.lngMax)continue;
      const pos=pct(region,p.lat,p.lng);
      const dot=document.createElement('div');
      dot.className='country-region-dot'+(isFound(c.id)?' found':'');
      dot.style.left=pos.x+'%';dot.style.top=pos.y+'%';
      dot.dataset.countryId=c.id;
      frag.appendChild(dot);
      if(isFound(c.id))foundLabels.push({c,pos});
    }
    markerHost.appendChild(frag);

    /* Put found labels right by their real marker. On an enlarged map a little
       overlap is preferable to moving a label away from its country. */
    for(const item of foundLabels){
      const label=document.createElement('div');
      label.className='country-region-label';
      label.textContent=item.c.name;
      label.style.left=item.pos.x+'%';label.style.top=item.pos.y+'%';
      markerHost.appendChild(label);
    }
  }

  function openRegion(key){
    const region=regionFor(key);if(!region)return;
    ensureOverlay();
    activeKey=key;
    title.textContent=NAMES[key]||key;
    configureBackground(region);
    render();
    overlay.classList.add('is-open');
    overlay.setAttribute('aria-hidden','false');
  }

  function closeRegion(){
    if(!overlay)return;
    overlay.classList.remove('is-open');
    overlay.setAttribute('aria-hidden','true');
    activeKey=null;
  }

  /* Existing map tap guard suppresses click events. Use pointerup directly on
     the inset itself so a deliberate tap enlarges it without changing focus. */
  map.addEventListener('pointerup',e=>{
    const inset=e.target.closest&&e.target.closest('.country-inset');
    if(!inset||overlay?.classList.contains('is-open'))return;
    const key=inset.dataset.inset;
    if(!key)return;
    e.preventDefault();e.stopPropagation();
    openRegion(key);
  },true);

  const baseReveal=revealMarker;
  revealMarker=function(id,ownerName){
    baseReveal(id,ownerName);
    if(activeKey)requestAnimationFrame(render);
  };

  const baseBuild=buildMarkers;
  buildMarkers=function(){
    baseBuild.apply(this,arguments);
    if(activeKey)requestAnimationFrame(render);
  };

  window.addEventListener('resize',()=>{if(activeKey)requestAnimationFrame(render);});
})();
