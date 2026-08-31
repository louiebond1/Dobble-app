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

      /* Never allow the gameplay map to collapse when the input blurs or the
         iOS keyboard closes. The previous flex override could reduce the map
         wrapper to zero height, leaving only the text feed on purple. */
      #gameArea:not(.hidden) .country-middle{
        display:flex!important;
        flex-direction:column!important;
        align-items:stretch!important;
        min-height:0!important;
      }
      #gameArea:not(.hidden) .country-map-wrap{
        display:block!important;
        flex:0 0 auto!important;
        width:100%!important;
        height:clamp(246px,61vw,306px)!important;
        min-height:246px!important;
        max-height:306px!important;
        visibility:visible!important;
        opacity:1!important;
      }
      #gameArea:not(.hidden) #countryMap{
        display:block!important;
        width:100%!important;
        height:100%!important;
        min-height:100%!important;
        visibility:visible!important;
        opacity:1!important;
      }
      #gameArea.country-input-active .country-map-wrap,
      #gameArea.country-keyboard-open .country-map-wrap{
        height:min(71vw,calc(var(--country-vvh) - 88px))!important;
        min-height:214px!important;
        max-height:312px!important;
      }

      /* The feed is supplementary only. Never let it become a text-only
         replacement for the map on mobile. */
      @media (max-width:900px){
        #gameArea:not(.hidden) .country-feed{display:none!important}
      }
    `;
    document.head.appendChild(style);
  }

  function geographicInsetPosition(region, country) {
    if (!region || !country) return null;
    const pad = region.key === 'europe' ? 7 : 9;
    const x = pad + ((country.lng - region.lngMin) / (region.lngMax - region.lngMin)) * (100 - pad * 2);
    const y = pad + ((region.latMax - country.lat) / (region.latMax - region.latMin)) * (100 - pad * 2);
    return {
      x: Math.max(pad, Math.min(100 - pad, x)),
      y: Math.max(pad, Math.min(100 - pad, y))
    };
  }

  function repinAllMarkers() {
    if (typeof allCountries === 'undefined' || typeof markerEls === 'undefined') return;
    for (const country of allCountries) {
      const entry = markerEls.get(country.id);
      if (!entry) continue;
      if (entry.insetKey && entry.insetEl) {
        const region = INSETS.find(r => r.key === entry.insetKey);
        const p = geographicInsetPosition(region, country);
        if (p) {
          entry.insetPos = p;
          entry.insetEl.style.left = p.x + '%';
          entry.insetEl.style.top = p.y + '%';
        }
      } else if (entry.main) {
        const p = projectMainBoard(country.lat, country.lng);
        entry.mainPos = p;
        entry.main.style.left = p.x + '%';
        entry.main.style.top = p.y + '%';
      }
    }
  }

  function keepTypingWhenMapTapped() {
    const map = document.getElementById('countryMap');
    const input = document.getElementById('guessInput');
    if (!map || !input || map.dataset.tapGuardReady === '1') return;
    map.dataset.tapGuardReady = '1';

    /* Normal taps are inert: they must not switch view, hide the map, select
       labels, or create a text-only state. Multi-touch remains available to
       the existing pinch-zoom handler. */
    map.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch' && e.isPrimary) {
        e.preventDefault();
        requestAnimationFrame(() => {
          if (document.activeElement !== input) input.focus({ preventScroll: true });
        });
      }
    }, { passive: false, capture: true });
    map.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
    }, { passive: false, capture: true });
    map.addEventListener('contextmenu', (e) => e.preventDefault());
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
  keepTypingWhenMapTapped();

  const baseBuild = buildMarkers;
  buildMarkers = function buildMarkersAccuracyGuard() {
    baseBuild.apply(this, arguments);
    repinAllMarkers();
    forceMapVisible();
  };

  const input = document.getElementById('guessInput');
  if (input) {
    input.addEventListener('blur', () => {
      requestAnimationFrame(forceMapVisible);
      setTimeout(forceMapVisible, 60);
    });
  }

  requestAnimationFrame(() => { repinAllMarkers(); forceMapVisible(); });
  window.addEventListener('resize', () => requestAnimationFrame(() => { repinAllMarkers(); forceMapVisible(); }));
  if (window.visualViewport) window.visualViewport.addEventListener('resize', () => requestAnimationFrame(() => { repinAllMarkers(); forceMapVisible(); }));
})();
