/* Learn zoom fix: zoom/pan the geography, but keep target markers readable at a constant screen size. */
(function(){
  function syncStage(stage){
    const t=stage.style.transform||'';
    const m=t.match(/scale\(([-\d.]+)\)/);
    const scale=m?Math.max(.001,parseFloat(m[1])):1;
    stage.style.setProperty('--learn-marker-scale',String(1/scale));
  }
  function watch(stage){
    if(!stage||stage.dataset.markerScaleReady==='1')return;
    stage.dataset.markerScaleReady='1';
    syncStage(stage);
    new MutationObserver(()=>syncStage(stage)).observe(stage,{attributes:true,attributeFilter:['style']});
  }
  function scan(){document.querySelectorAll('.learn-v4-map-stage').forEach(watch);}
  new MutationObserver(scan).observe(document.documentElement,{childList:true,subtree:true});
  document.addEventListener('DOMContentLoaded',scan);
  scan();
})();