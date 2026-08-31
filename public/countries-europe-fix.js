/* Europe map accuracy + label-layout fix.
   Keep European markers geographically anchored, then place every found label
   inside the inset without allowing labels into the title strip or outside the map. */
(function () {
  const europeRegion = () => INSETS.find((r) => r.key === 'europe');

  function trueEuropePosition(country) {
    const region = europeRegion();
    if (!region || !country) return null;
    return insetGeoPosition(region, country.lat, country.lng);
  }

  function pinEuropeMarkersToGeography() {
    for (const country of allCountries) {
      const entry = markerEls.get(country.id);
      if (!entry || entry.insetKey !== 'europe' || !entry.insetEl) continue;
      const p = trueEuropePosition(country);
      if (!p) continue;
      entry.insetPos = p;
      entry.insetEl.style.left = p.x + '%';
      entry.insetEl.style.top = p.y + '%';
    }
  }

  /* The old inset code deliberately spreads dense European markers apart.
     That made the inset tidy but meant countries could drift away from their
     actual position. Re-pin Europe after every marker rebuild. */
  const baseBuildMarkers = buildMarkers;
  buildMarkers = function buildMarkersWithAccurateEurope() {
    baseBuildMarkers.apply(this, arguments);
    pinEuropeMarkersToGeography();
  };

  function overlapArea(a, b, pad) {
    const x = Math.max(0, Math.min(a.x + a.w + pad, b.x + b.w + pad) - Math.max(a.x - pad, b.x - pad));
    const y = Math.max(0, Math.min(a.y + a.h + pad, b.y + b.h + pad) - Math.max(a.y - pad, b.y - pad));
    return x * y;
  }

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function layoutEuropeLabels() {
    const host = document.querySelector('[data-inset-markers="europe"]');
    const inset = document.querySelector('#gameArea .country-inset[data-inset="europe"]');
    if (!host || !inset) return;

    pinEuropeMarkersToGeography();

    const hostRect = host.getBoundingClientRect();
    if (!hostRect.width || !hostRect.height) return;
    const title = inset.querySelector('.country-inset-label');
    const titleRect = title ? title.getBoundingClientRect() : null;
    const safeTop = titleRect ? Math.max(4, titleRect.bottom - hostRect.top + 3) : 4;
    const margin = 3;
    const occupied = [];

    const records = polishedLabelRecords
      .filter((r) => r && r.insetKey === 'europe' && r.label && r.label.isConnected)
      .map((r) => {
        const c = countryById.get(r.label.dataset.countryId);
        const p = trueEuropePosition(c);
        if (p) { r.xPct = p.x; r.yPct = p.y; }
        return r;
      })
      .sort((a, b) => a.yPct - b.yPct || a.xPct - b.xPct);

    for (const record of records) {
      const label = record.label;
      label.classList.remove('country-label-hidden');
      label.style.visibility = 'hidden';
      label.style.transform = 'none';
      label.style.margin = '0';
      label.style.left = '0px';
      label.style.top = '0px';

      const w = Math.max(1, label.offsetWidth);
      const h = Math.max(1, label.offsetHeight);
      const ax = record.xPct / 100 * hostRect.width;
      const ay = record.yPct / 100 * hostRect.height;
      const gap = 3;
      const raw = [
        [ax - w / 2, ay - h - gap],
        [ax + gap, ay - h / 2],
        [ax - w / 2, ay + gap],
        [ax - w - gap, ay - h / 2],
        [ax + gap, ay - h - gap],
        [ax - w - gap, ay - h - gap],
        [ax + gap, ay + gap],
        [ax - w - gap, ay + gap],
      ];

      const candidates = raw.map(([x, y]) => ({
        x: clamp(x, margin, Math.max(margin, hostRect.width - w - margin)),
        y: clamp(y, safeTop, Math.max(safeTop, hostRect.height - h - margin)),
        w, h,
      }));

      let best = null;
      let bestScore = Infinity;
      for (const candidate of candidates) {
        let score = 0;
        for (const used of occupied) score += overlapArea(candidate, used, 1) * 120;
        /* Strongly prefer staying close to the country's true map position. */
        const cx = candidate.x + w / 2;
        const cy = candidate.y + h / 2;
        score += Math.hypot(cx - ax, cy - ay);
        if (score < bestScore) { bestScore = score; best = candidate; }
        if (score < 0.01) break;
      }

      if (!best) continue;
      label.style.left = best.x + 'px';
      label.style.top = best.y + 'px';
      label.style.visibility = '';
      occupied.push(best);
    }
  }

  /* Run the existing layout for the rest of the world, then replace only
     Europe's result with the geography-safe version above. */
  const baseLayout = layoutAllCountryLabels;
  layoutAllCountryLabels = function layoutCountriesWithAccurateEurope() {
    baseLayout.apply(this, arguments);
    layoutEuropeLabels();
  };

  window.addEventListener('resize', () => requestAnimationFrame(layoutEuropeLabels));
  if (window.visualViewport) window.visualViewport.addEventListener('resize', () => requestAnimationFrame(layoutEuropeLabels));
  requestAnimationFrame(layoutEuropeLabels);
})();
