/* Final investor-demo refinement. Loaded after countries-polish.js. */
(function () {
  const gulf = INSETS.find((r) => r.key === 'gulf');
  if (gulf) { gulf.latMin=12; gulf.latMax=38; gulf.lngMin=32; gulf.lngMax=62; gulf.aspect=30/26; }

  const SHORT_NAMES={
    'Antigua and Barbuda':'Antigua & Barbuda','Saint Kitts and Nevis':'St Kitts & Nevis',
    'Saint Vincent and the Grenadines':'St Vincent','Trinidad and Tobago':'Trinidad & Tobago',
    'Dominican Republic':'Dominican Rep.','Bosnia and Herzegovina':'Bosnia & Herz.',
    'United Arab Emirates':'UAE','Central African Republic':'Central African Rep.',
    'Democratic Republic of the Congo':'DR Congo'
  };
  const LABEL_ANCHORS={
    can:[55.5,-106],usa:[38.5,-98],mex:[23.5,-102],bra:[-10,-52],arg:[-38,-64],chl:[-34,-71],col:[4,-73],per:[-9.5,-75],bol:[-17,-64.5],ven:[7,-66],
    rus:[57,86],chn:[35,103],ind:[22.5,79],kaz:[48,67],mng:[46,104],irn:[32,54],sau:[24,45],tur:[39,35],idn:[-2,117],phl:[12.5,122],jpn:[37,138],
    aus:[-25,134],nzl:[-42,173],png:[-6.5,145],dza:[28,2.5],cod:[-3,23],ago:[-12,18],zaf:[-29,24],nam:[-22,17],bwa:[-22,24],tza:[-6,35],moz:[-18,35],mdg:[-20,47],
    sdn:[15,30],ssd:[7,30],eth:[9,40],egy:[27,30],lib:[27,17],ner:[17,9],tcd:[15,19],mli:[17,-4],mrt:[20,-10],nga:[9,8],grl:[72,-40],
    esp:[40,-4],fra:[46.5,2],deu:[51,10],ita:[42.5,12.5],swe:[62,16],nor:[64,12],fin:[64,26],ukr:[49,32],pol:[52,19],rou:[46,25],gbr:[54.5,-2.5]
  };

  /* Stable editorial priority beats random hash priority in tiny inset maps. */
  const INSET_PRIORITY={
    europe:['gbr','fra','deu','esp','ita','pol','nld','bel','che','aut','prt','irl','dnk','nor','swe','fin','cze','svk','hun','rou','grc','ukr'],
    caribbean:['cub','jam','hti','dom','bhs','tto','brb','atg','kna','vct','grd','lca'],
    gulf:['tur','isr','jor','lbn','irq','irn','sau','are','kwt','qat','bhr','omn','yem','cyp']
  };
  const INSET_LIMIT={0:14,30:14,60:13,90:12,120:11,150:10,197:10};

  function configureInsetGeography(){
    for(const region of INSETS){const inset=document.querySelector(`#gameArea .country-inset[data-inset="${region.key}"]`);if(!inset)continue;const bg=inset.querySelector('.country-inset-bg');if(!bg)continue;const lngSpan=region.lngMax-region.lngMin,latSpan=region.latMax-region.latMin;inset.style.aspectRatio=`${lngSpan} / ${latSpan}`;bg.style.width=`${(360/lngSpan)*100}%`;bg.style.left=`${-((region.lngMin+180)/lngSpan)*100}%`;bg.style.top=`${-((90-region.latMax)/latSpan)*100}%`;}
    const title=document.querySelector('#gameArea .country-inset[data-inset="gulf"] .country-inset-label');if(title)title.textContent='Middle East';
  }
  function compactInsetLabels(){document.querySelectorAll('#gameArea .country-marker-label[data-inset-key]').forEach(label=>{const c=countryById.get(label.dataset.countryId);if(c)label.textContent=SHORT_NAMES[c.name]||c.name;});}
  function insetTitleBlocker(key,host){const inset=host.closest('.country-inset'),title=inset&&inset.querySelector('.country-inset-label');if(!title)return[];const hr=host.getBoundingClientRect(),tr=title.getBoundingClientRect();return[{x:tr.left-hr.left-3,y:tr.top-hr.top-2,w:tr.width+7,h:tr.height+5}];}

  candidateLabelRects=function(anchorX,anchorY,w,h,gap){return[
    {x:anchorX-w/2,y:anchorY-h/2,w,h},{x:anchorX-w/2,y:anchorY-h-gap,w,h},{x:anchorX+gap,y:anchorY-h/2,w,h},
    {x:anchorX-w/2,y:anchorY+gap,w,h},{x:anchorX-w-gap,y:anchorY-h/2,w,h},{x:anchorX+gap,y:anchorY-h-gap,w,h},
    {x:anchorX-w-gap,y:anchorY-h-gap,w,h},{x:anchorX+gap,y:anchorY+gap,w,h},{x:anchorX-w-gap,y:anchorY+gap,w,h}];};

  function applyVisualAnchor(record){if(record.insetKey)return;const id=record.label&&record.label.dataset.countryId,a=LABEL_ANCHORS[id];if(!a)return;const p=projectMainBoard(a[0],a[1]);record.xPct=p.x;record.yPct=p.y;}
  function editorialInsetVisible(record,count){if(!record.insetKey)return true;const list=INSET_PRIORITY[record.insetKey]||[];const id=record.label.dataset.countryId;const idx=list.indexOf(id);const limit=INSET_LIMIT[Number(progressTier(count))]||14;if(idx>=0)return idx<limit;/* unlisted countries only get labels early if there is room */return count<30&&Number(record.label.dataset.labelRank||0)<.38;}

  layoutAllCountryLabels=function(){
    compactInsetLabels();const count=currentProgressCount(),groups=new Map();
    for(const record of polishedLabelRecords){if(!record.label.isConnected)continue;applyVisualAnchor(record);const density=Number(record.label.dataset.labelRank||0)>labelKeepThreshold(count,!!record.insetKey);const hidden=density||!editorialInsetVisible(record,count);record.label.classList.toggle('country-label-hidden',hidden);if(hidden)continue;const key=record.insetKey||'__main__';if(!groups.has(key))groups.set(key,[]);groups.get(key).push(record);}
    for(const[key,records]of groups){records.sort((a,b)=>{if(key!=='__main__'){const p=INSET_PRIORITY[key]||[];return (p.indexOf(a.label.dataset.countryId)<0?999:p.indexOf(a.label.dataset.countryId))-(p.indexOf(b.label.dataset.countryId)<0?999:p.indexOf(b.label.dataset.countryId));}return Number(a.label.dataset.labelRank)-Number(b.label.dataset.labelRank);});const occupied=[],blockers=key==='__main__'?mainInsetBlockers():insetTitleBlocker(key,records[0].host);for(const record of records)placeLabelRecord(record,occupied,blockers);}
  };

  const baseReveal=revealMarker;
  revealMarker=function(id,ownerName){baseReveal(id,ownerName);requestAnimationFrame(()=>{compactInsetLabels();const record=polishedLabelRecords.find(r=>r.label&&r.label.dataset.countryId===id);if(record)applyVisualAnchor(record);const label=document.querySelector(`#gameArea .country-marker-label[data-country-id="${id}"]`);if(label){label.classList.add('country-label-new');setTimeout(()=>label.classList.remove('country-label-new'),500);}layoutAllCountryLabels();});};

  configureInsetGeography();
  if('ResizeObserver'in window){const observer=new ResizeObserver(()=>requestAnimationFrame(layoutAllCountryLabels));document.querySelectorAll('#gameArea .country-inset').forEach(inset=>observer.observe(inset));}
})();