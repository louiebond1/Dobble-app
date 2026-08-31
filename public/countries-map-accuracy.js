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

    /* A normal tap used to blur the input, close the keyboard and trigger a
       different label layout, which looked like the map had changed into text.
       Keep the typing state stable on single taps. Multi-touch is left alone
       so pinch zoom can still work. */
    map.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch' && e.isPrimary) {
        e.preventDefault();
        if (document.activeElement !== input) input.focus({ preventScroll: true });
      }
    }, { passive: false, capture: true });
    map.addEventListener('click', (e) => e.preventDefault(), { passive: false });
    map.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  installAccuracyStyle();
  keepTypingWhenMapTapped();

  const baseBuild = buildMarkers;
  buildMarkers = function buildMarkersAccuracyGuard() {
    baseBuild.apply(this, arguments);
    repinAllMarkers();
  };

  /* Earlier polish intentionally spread dense inset dots apart. Re-pin all
     inset countries after that process so their coordinates mean geography,
     not visual spacing. */
  requestAnimationFrame(repinAllMarkers);
  window.addEventListener('resize', () => requestAnimationFrame(repinAllMarkers));
  if (window.visualViewport) window.visualViewport.addEventListener('resize', () => requestAnimationFrame(repinAllMarkers));
})();
