/* Countries map investor-polish layer. Keeps presentation isolated from
   game/network logic while owning label placement, density and iOS viewport. */

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

const polishedLabelRecords = [];

function labelKeepThreshold(count, isInset) {
  if (isInset) {
    if (count < 60) return 1;
    if (count < 90) return .90;
    if (count < 120) return .70;
    if (count < 150) return .50;
    if (count < 197) return .36;
    return .40;
  }
  if (count < 90) return 1;
  if (count < 120) return .90;
  if (count < 150) return .75;
  if (count < 197) return .60;
  return .62;
}

function refreshCountryLabelDensity(count) {
  const game = el('gameArea');
  if (!game) return;
  game.dataset.progressTier = progressTier(count);

  game.querySelectorAll('.country-marker-label').forEach((label) => {
    const rank = Number(label.dataset.labelRank || 0);
    const isInset = !!label.dataset.insetKey;
    label.classList.toggle('country-label-hidden', rank > labelKeepThreshold(count, isInset));
  });
  requestAnimationFrame(layoutAllCountryLabels);
}

/* Main markers use percentages within the exact same 2:1 rectangle as the SVG. */
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
  const minDist = region.key === 'europe' ? 5.0 : 7.2;
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

function clearPolishedLabels() {
  polishedLabelRecords.splice(0, polishedLabelRecords.length);
}

buildMarkers = function buildMarkersPolished() {
  const container = el('countryMarkers');
  container.innerHTML = '';
  markerEls.clear();
  clearPolishedLabels();
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
      insetPos: entry.insetPos || null,
    });
  }

  refreshCountryLabelDensity(currentProgressCount());
};

function rectsOverlap(a, b, pad = 0) {
  return a.x < b.x + b.w + pad && a.x + a.w + pad > b.x && a.y < b.y + b.h + pad && a.y + a.h + pad > b.y;
}

function clampLabelRect(rect, width, height, margin) {
  return {
    x: Math.max(margin, Math.min(rect.x, width - rect.w - margin)),
    y: Math.max(margin, Math.min(rect.y, height - rect.h - margin)),
    w: rect.w,
    h: rect.h,
  };
}

function candidateLabelRects(anchorX, anchorY, w, h, gap) {
  return [
    { x: anchorX - w / 2, y: anchorY - h - gap, w, h },
    { x: anchorX + gap, y: anchorY - h / 2, w, h },
    { x: anchorX - w / 2, y: anchorY + gap, w, h },
    { x: anchorX - w - gap, y: anchorY - h / 2, w, h },
    { x: anchorX + gap, y: anchorY - h - gap, w, h },
    { x: anchorX - w - gap, y: anchorY - h - gap, w, h },
    { x: anchorX + gap, y: anchorY + gap, w, h },
    { x: anchorX - w - gap, y: anchorY + gap, w, h },
  ];
}

function placeLabelRecord(record, occupied, blockers) {
  const host = record.host;
  const hostRect = host.getBoundingClientRect();
  if (!hostRect.width || !hostRect.height || !record.label.isConnected) return;

  const label = record.label;
  label.style.left = '0px';
  label.style.top = '0px';
  label.style.visibility = 'hidden';

  const w = Math.max(1, label.offsetWidth);
  const h = Math.max(1, label.offsetHeight);
  const anchorX = (record.xPct / 100) * hostRect.width;
  const anchorY = (record.yPct / 100) * hostRect.height;
  const margin = record.insetKey ? 2 : 3;
  const gap = record.insetKey ? 3 : 4;

  const candidates = candidateLabelRects(anchorX, anchorY, w, h, gap)
    .map((r) => clampLabelRect(r, hostRect.width, hostRect.height, margin));

  let chosen = candidates.find((candidate) =>
    !occupied.some((r) => rectsOverlap(candidate, r, 1)) &&
    !blockers.some((r) => rectsOverlap(candidate, r, 2))
  );

  if (!chosen) {
    /* Fall back to the candidate with the least overlap area instead of
       teleporting the label somewhere unrelated to its country. */
    let bestScore = Infinity;
    for (const candidate of candidates) {
      let score = 0;
      for (const r of occupied.concat(blockers)) {
        const ix = Math.max(0, Math.min(candidate.x + candidate.w, r.x + r.w) - Math.max(candidate.x, r.x));
        const iy = Math.max(0, Math.min(candidate.y + candidate.h, r.y + r.h) - Math.max(candidate.y, r.y));
        score += ix * iy;
      }
      if (score < bestScore) {
        bestScore = score;
        chosen = candidate;
      }
    }
  }

  label.style.left = chosen.x + 'px';
  label.style.top = chosen.y + 'px';
  label.style.visibility = '';
  occupied.push(chosen);
}

function mainInsetBlockers() {
  const host = el('countryMarkers');
  if (!host) return [];
  const base = host.getBoundingClientRect();
  return [...document.querySelectorAll('#gameArea .country-inset')].map((inset) => {
    const r = inset.getBoundingClientRect();
    return { x: r.left - base.left, y: r.top - base.top, w: r.width, h: r.height };
  });
}

function layoutAllCountryLabels() {
  const count = currentProgressCount();
  const groups = new Map();

  for (const record of polishedLabelRecords) {
    if (!record.label.isConnected) continue;
    const hiddenByDensity = Number(record.label.dataset.labelRank || 0) > labelKeepThreshold(count, !!record.insetKey);
    record.label.classList.toggle('country-label-hidden', hiddenByDensity);
    if (hiddenByDensity) continue;
    const key = record.insetKey || '__main__';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(record);
  }

  for (const [key, records] of groups) {
    records.sort((a, b) => Number(a.label.dataset.labelRank) - Number(b.label.dataset.labelRank));
    const occupied = [];
    const blockers = key === '__main__' ? mainInsetBlockers() : [];
    for (const record of records) placeLabelRecord(record, occupied, blockers);
  }
}

function flashCorrectInput() {
  const input = el('guessInput');
  if (!input) return;
  input.classList.add('country-input-success');
  clearTimeout(flashCorrectInput._timer);
  flashCorrectInput._timer = setTimeout(() => input.classList.remove('country-input-success'), 170);
}

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

  let host;
  let xPct;
  let yPct;
  let insetKey = null;

  if (entry.insetEl) {
    insetKey = entry.insetKey;
    label.classList.add('country-marker-label--inset');
    label.dataset.insetKey = insetKey;
    host = document.querySelector(`[data-inset-markers="${insetKey}"]`);
    xPct = parseFloat(entry.insetEl.style.left);
    yPct = parseFloat(entry.insetEl.style.top);
  } else {
    host = el('countryMarkers');
    xPct = entry.main ? parseFloat(entry.main.style.left) : entry.mainPos.x;
    yPct = entry.main ? parseFloat(entry.main.style.top) : entry.mainPos.y;
  }

  host.appendChild(label);
  polishedLabelRecords.push({ label, host, xPct, yPct, insetKey });
  refreshCountryLabelDensity(currentProgressCount());
  requestAnimationFrame(layoutAllCountryLabels);
  flashCorrectInput();

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
   iOS keyboard / VisualViewport handling */
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

    if (focused && window.scrollY !== 0) window.scrollTo(0, 0);
    requestAnimationFrame(layoutAllCountryLabels);
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

/* Reflow labels whenever the map/insets resize for any reason. */
if ('ResizeObserver' in window) {
  const labelResizeObserver = new ResizeObserver(() => requestAnimationFrame(layoutAllCountryLabels));
  const map = el('countryMap');
  if (map) labelResizeObserver.observe(map);
  document.querySelectorAll('#gameArea .country-inset').forEach((inset) => labelResizeObserver.observe(inset));
}

/* Visual regression helper for 30/60/90/120/150/197 states. */
window.countryVisualStressTest = function countryVisualStressTest(count) {
  const target = Math.max(0, Math.min(allCountries.length, Number(count) || 0));
  if (!allCountries.length || !el('countryMarkers')) return { ok: false, reason: 'countries not loaded' };
  buildMarkers();
  const sample = allCountries.slice().sort((a, b) => countryLabelRank(a.id) - countryLabelRank(b.id)).slice(0, target);
  sample.forEach((country) => revealMarker(country.id, null));
  updateProgress(target);
  requestAnimationFrame(layoutAllCountryLabels);
  return {
    ok: true,
    count: target,
    tier: progressTier(target),
    visibleLabels: [...el('gameArea').querySelectorAll('.country-marker-label:not(.country-label-hidden)')].length,
  };
};

window.countryKeyboardLayoutTest = function countryKeyboardLayoutTest(open) {
  const game = el('gameArea');
  if (!game) return false;
  game.classList.toggle('country-input-active', !!open);
  game.classList.toggle('country-keyboard-open', !!open);
  requestAnimationFrame(layoutAllCountryLabels);
  return true;
};
