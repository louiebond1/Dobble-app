/* Country marker accuracy guard.
   The quiz should not show a field of orange answer-hint dots at 0/197.
   Keep every marker geographically positioned internally, but only reveal its
   orange dot when that country has actually been guessed. Insets remain the
   authoritative display for countries assigned to Europe/Caribbean/Middle East. */
(function () {
  function installHiddenUnansweredStyle() {
    if (document.getElementById('countryAccuracyStyle')) return;
    const style = document.createElement('style');
    style.id = 'countryAccuracyStyle';
    style.textContent = `
      #gameArea .country-marker:not(.found){opacity:0!important;visibility:hidden!important;pointer-events:none!important}
      #gameArea .country-marker.found{opacity:1!important;visibility:visible!important}
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

  installHiddenUnansweredStyle();

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
