/* Country marker accuracy guard.
   Show every unanswered country as a small geographic point from the start,
   then let the normal reveal flow replace that point with the found-state label.
   Insets remain the authoritative display for Europe/Caribbean/Middle East. */
(function () {
  function installAccuracyStyle() {
    if (document.getElementById('countryAccuracyStyle')) return;
    const style = document.createElement('style');
    style.id = 'countryAccuracyStyle';
    style.textContent = `
      #gameArea .country-marker{opacity:1!important;visibility:visible!important;pointer-events:none!important}
      #gameArea .country-marker.found{opacity:1!important;visibility:visible!important}
      #gameArea #countryMap,#gameArea #countryMap *{-webkit-user-select:none!important;user-select:none!important;-webkit-touch-callout:none!important}
      #gameArea:not(.hidden) .country-middle{display:flex!important;flex-direction:column!important;align-items:stretch!important;min-height:0!important}
      #gameArea:not(.hidden) .country-map-wrap{display:block!important;flex:0 0 auto!important;width:100%!important;height:clamp(246px,61vw,306px)!important;min-height:246px!important;max-height:306px!important;visibility:visible!important;opacity:1!important}
      #gameArea:not(.hidden) #countryMap{display:block!important;width:100%!important;height:100%!important;min-height:100%!important;visibility:visible!important;opacity:1!important}
      #gameArea.country-input-active .country-map-wrap,#gameArea.country-keyboard-open .country-map-wrap{height:min(71vw,calc(var(--country-vvh) - 88px))!important;min-height:214px!important;max-height:312px!important}
      @media (max-width:900px){#gameArea:not(.hidden) .country-feed{display:none!important}}
    `;
    document.head.appendChild(style);
  }

  function pointFor(country) {
    return typeof window.__countryReferencePoint === 'function'
      ? window.__countryReferencePoint(country)
      : { lat: country.lat, lng: country.lng };
  }

  /* IMPORTANT: the inset background is already an exact crop of the same
     equirectangular world map. Therefore marker coordinates must use the full
     0-100% inset plane with NO visual padding. The previous 7-9% inset padding
     compressed every marker toward the centre and made e.g. Portugal appear in
     Spain. */
  function exactInsetPosition(region, lat, lng) {
    if (!region) return null;
    const x = ((lng - region.lngMin) / (region.lngMax - region.lngMin)) * 100;
    const y = ((region.latMax - lat) / (region.latMax - region.latMin)) * 100;
    return {
      x: Math.max(0, Math.min(100, x)),
      y: Math.max(0, Math.min(100, y)),
    };
  }

  /* Replace the older padded projection globally so Europe label placement and
     any later layout code use exactly the same geography as the inset image. */
  insetGeoPosition = exactInsetPosition;

  function geographicInsetPosition(region, country) {
    if (!region || !country) return null;
    const point = pointFor(country);
    return exactInsetPosition(region, point.lat, point.lng);
  }

  function repinAllMarkers() {
    if (typeof allCountries === 'undefined' || typeof markerEls === 'undefined') return;
    for (const country of allCountries) {
      const entry = markerEls.get(country.id);
      if (!entry) continue;
      const point = pointFor(country);
      if (entry.insetKey && entry.insetEl) {
        const region = INSETS.find(r => r.key === entry.insetKey);
        const p = geographicInsetPosition(region, country);
        if (p) {
          entry.insetPos = p;
          entry.insetEl.style.left = p.x + '%';
          entry.insetEl.style.top = p.y + '%';
        }
      } else if (entry.main) {
        const p = projectMainBoard(point.lat, point.lng);
        entry.mainPos = p;
        entry.main.style.left = p.x + '%';
        entry.main.style.top = p.y + '%';
      }
    }
  }

  function makeSingleTapInert() {
    const map = document.getElementById('countryMap');
    if (!map || map.dataset.tapGuardReady === '1') return;
    map.dataset.tapGuardReady = '1';
    map.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch' && e.isPrimary) e.preventDefault();
    }, { passive: false, capture: true });
    map.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopImmediatePropagation();
    }, { passive: false, capture: true });
    map.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopImmediatePropagation();
    }, { passive: false, capture: true });
  }

  function forceMapVisible() {
    const wrap = document.querySelector('#gameArea .country-map-wrap');
    const map = document.getElementById('countryMap');
    if (!wrap || !map) return;
    wrap.style.visibility = 'visible';
    wrap.style.opacity = '1';
    map.style.visibility = 'visible';
    map.style.opacity = '1';
  }

  installAccuracyStyle();
  makeSingleTapInert();

  const baseBuild = buildMarkers;
  buildMarkers = function buildMarkersAccuracyGuard() {
    baseBuild.apply(this, arguments);
    repinAllMarkers();
    forceMapVisible();
  };

  const input = document.getElementById('guessInput');
  if (input) input.addEventListener('blur', () => {
    requestAnimationFrame(forceMapVisible);
    setTimeout(forceMapVisible, 60);
  });

  requestAnimationFrame(() => { repinAllMarkers(); forceMapVisible(); });
  window.addEventListener('resize', () => requestAnimationFrame(() => { repinAllMarkers(); forceMapVisible(); }));
  if (window.visualViewport) window.visualViewport.addEventListener('resize', () => requestAnimationFrame(() => { repinAllMarkers(); forceMapVisible(); }));
})();