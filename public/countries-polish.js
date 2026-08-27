/* Countries map polish layer.
   This intentionally replaces only the marker-building/reveal functions from
   countries.js. Keeping it separate makes the visual pass easy to iterate or
   remove without disturbing game/network logic. */

function insetGeoPosition(region, lat, lng) {
  const pad = 8;
  const x = pad + ((lng - region.lngMin) / (region.lngMax - region.lngMin)) * (100 - pad * 2);
  const y = pad + ((region.latMax - lat) / (region.latMax - region.latMin)) * (100 - pad * 2);
  return {
    x: Math.max(pad, Math.min(100 - pad, x)),
    y: Math.max(pad, Math.min(100 - pad, y)),
  };
}

/* Gently separate very close centroids while preserving the geographic
   pattern. This is deliberately mild: the inset should still look like a map,
   not the alphabetical marker grid used by the previous version. */
function spreadInsetPositions(entries, region) {
  const points = entries.map((entry) => ({
    entry,
    ...insetGeoPosition(region, entry.country.lat, entry.country.lng),
  }));

  const minDist = region.key === 'europe' ? 6.1 : 8;
  const pad = 7;

  for (let pass = 0; pass < 90; pass++) {
    let moved = false;
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        const a = points[i];
        const b = points[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let d = Math.hypot(dx, dy);
        if (d >= minDist) continue;

        if (d < 0.01) {
          const angle = ((i * 37 + j * 19) % 360) * Math.PI / 180;
          dx = Math.cos(angle);
          dy = Math.sin(angle);
          d = 1;
        }

        const push = (minDist - d) * 0.22;
        const ux = dx / d;
        const uy = dy / d;
        a.x -= ux * push;
        a.y -= uy * push;
        b.x += ux * push;
        b.y += uy * push;
        moved = true;
      }
    }

    for (const p of points) {
      p.x = Math.max(pad, Math.min(100 - pad, p.x));
      p.y = Math.max(pad, Math.min(100 - pad, p.y));
    }
    if (!moved) break;
  }

  points.forEach((p) => {
    p.entry.insetPos = { x: p.x, y: p.y };
  });
}

buildMarkers = function buildMarkersPolished() {
  const container = el('countryMarkers');
  container.innerHTML = '';
  markerEls.clear();
  INSETS.forEach((r) => { insetLabelRects[r.key] = []; });

  const insetContainers = {};
  const insetLists = {};
  INSETS.forEach((r) => {
    const host = document.querySelector(`[data-inset-markers="${r.key}"]`);
    if (host) host.innerHTML = '';
    insetContainers[r.key] = host;
    insetLists[r.key] = [];
  });

  const placements = allCountries.map((country) => {
    const mainPos = project(country.lat, country.lng);
    const inset = findInset(country.lat, country.lng);
    const entry = { country, mainPos, inset: inset ? inset.key : null };
    if (inset) insetLists[inset.key].push(entry);
    return entry;
  });

  INSETS.forEach((region) => spreadInsetPositions(insetLists[region.key], region));

  for (const entry of placements) {
    /* Critical rule: exactly one unanswered marker per country. Countries
       represented in an inset are omitted from the main map, eliminating the
       duplicate-Turkey style problem and reducing clutter substantially. */
    let mainDot = null;
    let insetDot = null;

    if (entry.inset && insetContainers[entry.inset]) {
      insetDot = document.createElement('div');
      insetDot.className = 'country-marker';
      insetDot.style.left = entry.insetPos.x + '%';
      insetDot.style.top = entry.insetPos.y + '%';
      insetContainers[entry.inset].appendChild(insetDot);
    } else {
      mainDot = document.createElement('div');
      mainDot.className = 'country-marker';
      mainDot.style.left = entry.mainPos.x + '%';
      mainDot.style.top = entry.mainPos.y + '%';
      container.appendChild(mainDot);
    }

    markerEls.set(entry.country.id, {
      main: mainDot,
      insetEl: insetDot,
      insetKey: entry.inset || null,
      mainPos: entry.mainPos,
    });
  }
};

revealMarker = function revealMarkerPolished(id, ownerName) {
  const entry = markerEls.get(id);
  const country = countryById.get(id);
  if (!entry || !country) return;
  const mine = mode === 'duo' && ownerName === myName;

  if (entry.main) {
    entry.main.classList.add('found');
    entry.main.classList.toggle('mine', mine);
  }
  if (entry.insetEl) {
    entry.insetEl.classList.add('found');
    entry.insetEl.classList.toggle('mine', mine);
  }

  const label = document.createElement('div');
  label.className = 'country-marker-label';
  label.textContent = country.name;

  if (entry.insetEl) {
    label.classList.add('country-marker-label--inset');
    const host = document.querySelector(`[data-inset-markers="${entry.insetKey}"]`);
    const xPct = parseFloat(entry.insetEl.style.left);
    const yPct = parseFloat(entry.insetEl.style.top);
    placeInsetLabel(label, host, xPct, yPct, insetLabelRects[entry.insetKey]);
  } else if (entry.main) {
    label.style.left = entry.main.style.left;
    label.style.top = entry.main.style.top;
    el('countryMarkers').appendChild(label);
  } else if (entry.mainPos) {
    label.style.left = entry.mainPos.x + '%';
    label.style.top = entry.mainPos.y + '%';
    el('countryMarkers').appendChild(label);
  }

  setTimeout(() => {
    if (entry.main && entry.main.isConnected) entry.main.remove();
    if (entry.insetEl && entry.insetEl.isConnected) entry.insetEl.remove();
    markerEls.delete(id);
  }, 550);
};
