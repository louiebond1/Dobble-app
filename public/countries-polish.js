/* Countries map polish layer.
   Keeps presentation changes isolated from game/network logic. */

function countryLabelRank(id) {
  let h = 2166136261;
  const s = String(id || '');
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

function currentProgressCount() {
  return mode === 'solo' ? foundIds.size : revealedIds.size;
}

function progressTier(count) {
  if (count >= 197) return '197';
  if (count >= 150) return '150';
  if (count >= 120) return '120';
  if (count >= 90) return '90';
  if (count >= 60) return '60';
  if (count >= 30) return '30';
  return '0';
}

function refreshCountryLabelDensity(count) {
  const game = el('gameArea');
  if (!game) return;
  game.dataset.progressTier = progressTier(count);

  const insetKeep = count < 60 ? 1 : count < 90 ? .90 : count < 120 ? .70 : count < 150 ? .50 : count < 197 ? .36 : .40;
  const mainKeep = count < 90 ? 1 : count < 120 ? .90 : count < 150 ? .75 : count < 197 ? .60 : .62;

  game.querySelectorAll('.country-marker-label').forEach((label) => {
    const rank = Number(label.dataset.labelRank || 0);
    const isInset = !!label.dataset.insetKey;
    const keep = isInset ? insetKeep : mainKeep;
    label.classList.toggle('country-label-hidden', rank > keep);
  });
}

/* The polished board is intentionally a little taller than a strict 2:1 map,
   matching the dense phone-friendly proportions of good map quizzes. Markers
   therefore project directly into the rendered board so they always stay
   aligned when the keyboard layout switches. */
function projectMainBoard(lat, lng) {
  return {
    x: ((lng + 180) / 360) * 100,
    y: ((90 - lat) / 180) * 100,
  };
}

function insetGeoPosition(region, lat, lng) {
  const pad = region.key === 'europe' ? 7 : 9;
  const x = pad + ((lng - region.lngMin) / (region.lngMax - region.lngMin)) * (100 - pad * 2);
  const y = pad + ((region.latMax - lat) / (region.latMax - region.latMin)) * (100 - pad * 2);
  return {
    x: Math.max(pad, Math.min(100 - pad, x)),
    y: Math.max(pad, Math.min(100 - pad, y)),
  };
}

function spreadInsetPositions(entries, region) {
  const points = entries.map((entry) => ({ entry, ...insetGeoPosition(region, entry.country.lat, entry.country.lng) }));
  const minDist = region.key === 'europe' ? 5.1 : 7.4;
  const pad = region.key === 'europe' ? 6 : 8;

  for (let pass = 0; pass < 100; pass++) {
    let moved = false;
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        const a = points[i];
        const b = points[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let d = Math.hypot(dx, dy);
        if (d >= minDist) continue;
        if (d < .01) {
          const angle = ((i * 37 + j * 19) % 360) * Math.PI / 180;
          dx = Math.cos(angle);
          dy = Math.sin(angle);
          d = 1;
        }
        const push = (minDist - d) * .20;
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
  points.forEach((p) => { p.entry.insetPos = { x: p.x, y: p.y }; });
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
    const mainPos = projectMainBoard(country.lat, country.lng);
    const inset = findInset(country.lat, country.lng);
    const entry = { country, mainPos, inset: inset ? inset.key : null };
    if (inset) insetLists[inset.key].push(entry);
    return entry;
  });

  INSETS.forEach((region) => spreadInsetPositions(insetLists[region.key], region));

  for (const entry of placements) {
    let mainDot = null;
    let insetDot = null;

    /* Exactly one unanswered marker per country. Dense micro-regions live only
       in their inset; they are not duplicated on the main world. */
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

  refreshCountryLabelDensity(currentProgressCount());
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
  label.dataset.countryId = country.id;
  label.dataset.labelRank = String(countryLabelRank(country.id));

  if (entry.insetEl) {
    label.classList.add('country-marker-label--inset');
    label.dataset.insetKey = entry.insetKey;
    const host = document.querySelector(`[data-inset-markers="${entry.insetKey}"]`);
    const xPct = parseFloat(entry.insetEl.style.left);
    const yPct = parseFloat(entry.insetEl.style.top);
    placeInsetLabel(label, host, xPct, yPct, insetLabelRects[entry.insetKey]);
  } else {
    label.style.left = entry.main ? entry.main.style.left : entry.mainPos.x + '%';
    label.style.top = entry.main ? entry.main.style.top : entry.mainPos.y + '%';
    el('countryMarkers').appendChild(label);
  }

  refreshCountryLabelDensity(currentProgressCount());

  setTimeout(() => {
    if (entry.main && entry.main.isConnected) entry.main.remove();
    if (entry.insetEl && entry.insetEl.isConnected) entry.insetEl.remove();
    markerEls.delete(id);
  }, 550);
};

const updateProgressBase = updateProgress;
updateProgress = function updateProgressPolished(count) {
  updateProgressBase(count);
  refreshCountryLabelDensity(count);
};

/* -------------------------------------------------------------------------
   iOS keyboard / VisualViewport handling

   Safari focuses inputs by scrolling them into view. Because our input used to
   live below the map, that pushed the header and most of the world off-screen.
   We now switch layout as soon as the input receives focus: input moves above
   the map, and the fixed stage is pinned to the *visible* viewport as the
   keyboard animates. The input stays focused after every answer, so play is
   continuous with the full map visible. */

(function installCountryKeyboardLayout() {
  const game = el('gameArea');
  const input = el('guessInput');
  if (!game || !input) return;

  const vv = window.visualViewport;
  let raf = 0;

  function applyViewportState() {
    raf = 0;
    const viewportHeight = vv ? vv.height : window.innerHeight;
    const viewportTop = vv ? vv.offsetTop : 0;
    const layoutHeight = window.innerHeight;
    const focused = document.activeElement === input;
    const keyboardLikelyOpen = focused && (layoutHeight - viewportHeight > 90);

    game.style.setProperty('--country-vvh', Math.max(320, viewportHeight) + 'px');
    game.style.setProperty('--country-vvtop', Math.max(0, viewportTop) + 'px');
    game.classList.toggle('country-input-active', focused);
    game.classList.toggle('country-keyboard-open', keyboardLikelyOpen);

    if (focused) {
      /* Keep the document itself at the origin; the game stage follows the
         visual viewport, so Safari has no reason to leave the header above it. */
      if (window.scrollY !== 0) window.scrollTo(0, 0);
    }
  }

  function scheduleViewportState() {
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(applyViewportState);
  }

  input.addEventListener('focus', () => {
    game.classList.add('country-input-active');
    scheduleViewportState();
    setTimeout(scheduleViewportState, 60);
    setTimeout(scheduleViewportState, 250);
  });

  input.addEventListener('blur', () => {
    scheduleViewportState();
    setTimeout(scheduleViewportState, 80);
  });

  if (vv) {
    vv.addEventListener('resize', scheduleViewportState);
    vv.addEventListener('scroll', scheduleViewportState);
  }
  window.addEventListener('resize', scheduleViewportState);
  window.addEventListener('orientationchange', () => setTimeout(scheduleViewportState, 150));

  applyViewportState();
})();

/* Visual regression helper used for 30/60/90/120/150/197 stress states. */
window.countryVisualStressTest = function countryVisualStressTest(count) {
  const target = Math.max(0, Math.min(allCountries.length, Number(count) || 0));
  if (!allCountries.length || !el('countryMarkers')) return { ok: false, reason: 'countries not loaded' };
  buildMarkers();
  const sample = allCountries
    .slice()
    .sort((a, b) => countryLabelRank(a.id) - countryLabelRank(b.id))
    .slice(0, target);
  sample.forEach((country) => revealMarker(country.id, null));
  updateProgress(target);
  return {
    ok: true,
    count: target,
    tier: progressTier(target),
    visibleLabels: [...el('gameArea').querySelectorAll('.country-marker-label:not(.country-label-hidden)')].length,
  };
};

/* Manual device-test hook: useful from Safari devtools without changing game
   state. true forces the compressed typing layout; false restores live state. */
window.countryKeyboardLayoutTest = function countryKeyboardLayoutTest(open) {
  const game = el('gameArea');
  if (!game) return false;
  game.classList.toggle('country-input-active', !!open);
  game.classList.toggle('country-keyboard-open', !!open);
  return true;
};
