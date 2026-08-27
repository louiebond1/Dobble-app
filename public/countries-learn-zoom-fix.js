/* Learn zoom fix: as geography zooms in, target markers progressively shrink on screen so precise locations become visible. */
(function(){
  function syncStage(stage){
    const t=stage.style.transform||'';
    const m=t.match(/scale\(([-\d.]+)\)/);
    const scale=m?Math.max(.001,parseFloat(m[1])):1;
    /* Stage scaling already enlarges markers by `scale`. Counter-scale harder than 1/scale,
       so the final on-screen marker size actually gets smaller as the user zooms in.
       screen size ratio ~= 1/sqrt(scale): 100% @1x, 71% @2x, 50% @4x, 45% @5x. */
    const markerScale=1/Math.pow(scale,1.5);
    stage.style.setProperty('--learn-marker-scale',String(markerScale));
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