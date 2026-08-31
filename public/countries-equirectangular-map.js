/* Builds the quiz map from Natural Earth country boundaries in the same exact
   equirectangular coordinate plane used by the country markers. */
(function(){
  const d=window.__WORLD_EQ_PATH||'';
  if(!d)return;
  const svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 500" preserveAspectRatio="xMidYMid meet"><style>.c{fill:#f5f3e8;stroke:#c7c7bc;stroke-width:.6;stroke-linejoin:round;fill-rule:evenodd}</style><path class="c" d="'+d+'"/></svg>';
  const url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml'}));
  window.__WORLD_EQ_MAP_URL=url;
  document.querySelectorAll('.country-map-bg,.country-inset-bg').forEach(img=>{img.src=url;});

  /* No visual padding: longitude/latitude maps directly to the crop beneath it. */
  window.insetGeoPosition=function(region,lat,lng){
    const x=((lng-region.lngMin)/(region.lngMax-region.lngMin))*100;
    const y=((region.latMax-lat)/(region.latMax-region.latMin))*100;
    return {x:Math.max(0,Math.min(100,x)),y:Math.max(0,Math.min(100,y))};
  };
})();
