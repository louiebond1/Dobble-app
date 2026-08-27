/* Final investor-demo refinement. Loaded after countries-polish.js. */
(function () {
  const gulf = INSETS.find((r) => r.key === 'gulf');
  if (gulf) {
    gulf.latMin = 12;
    gulf.latMax = 38;
    gulf.lngMin = 32;
    gulf.lngMax = 62;
    gulf.aspect = 30 / 26;
  }

  const SHORT_NAMES = {
    'Antigua and Barbuda': 'Antigua & Barbuda',
    'Saint Kitts and Nevis': 'St Kitts & Nevis',
    'Saint Vincent and the Grenadines': 'St Vincent',
    'Trinidad and Tobago': 'Trinidad & Tobago',
    'Dominican Republic': 'Dominican Rep.',
    'Bosnia and Herzegovina': 'Bosnia & Herz.',
    'United Arab Emirates': 'UAE',
    'Central African Republic': 'Central African Rep.',
    'Democratic Republic of the Congo': 'DR Congo'
  };

  function configureInsetGeography() {
    for (const region of INSETS) {
      const inset = document.querySelector(`#gameArea .country-inset[data-inset="${region.key}"]`);
      if (!inset) continue;
      const bg = inset.querySelector('.country-inset-bg');
      if (!bg) continue;
      const lngSpan = region.lngMax - region.lngMin;
      const latSpan = region.latMax - region.latMin;
      inset.style.aspectRatio = `${lngSpan} / ${latSpan}`;
      bg.style.width = `${(360 / lngSpan) * 100}%`;
      bg.style.left = `${-((region.lngMin + 180) / lngSpan) * 100}%`;
      bg.style.top = `${-((90 - region.latMax) / latSpan) * 100}%`;
    }
    const gulfTitle = document.querySelector('#gameArea .country-inset[data-inset="gulf"] .country-inset-label');
    if (gulfTitle) gulfTitle.textContent = 'Middle East';
  }

  function compactInsetLabels() {
    document.querySelectorAll('#gameArea .country-marker-label[data-inset-key]').forEach((label) => {
      const country = countryById.get(label.dataset.countryId);
      if (!country) return;
      label.textContent = SHORT_NAMES[country.name] || country.name;
    });
  }

  function insetTitleBlocker(key, host) {
    const inset = host.closest('.country-inset');
    const title = inset && inset.querySelector('.country-inset-label');
    if (!title) return [];
    const hr = host.getBoundingClientRect();
    const tr = title.getBoundingClientRect();
    return [{
      x: tr.left - hr.left - 2,
      y: tr.top - hr.top - 1,
      w: tr.width + 4,
      h: tr.height + 3,
    }];
  }

  /* Same placement engine, but inset titles become real blockers and compact
     names are measured before collision resolution. */
  layoutAllCountryLabels = function layoutAllCountryLabelsInvestor() {
    compactInsetLabels();
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
      const blockers = key === '__main__'
        ? mainInsetBlockers()
        : insetTitleBlocker(key, records[0].host);
      for (const record of records) placeLabelRecord(record, occupied, blockers);
    }
  };

  const baseReveal = revealMarker;
  revealMarker = function revealMarkerInvestor(id, ownerName) {
    baseReveal(id, ownerName);
    requestAnimationFrame(() => {
      compactInsetLabels();
      const label = document.querySelector(`#gameArea .country-marker-label[data-country-id="${id}"]`);
      if (label) {
        label.classList.add('country-label-new');
        setTimeout(() => label.classList.remove('country-label-new'), 650);
      }
      layoutAllCountryLabels();
    });
  };

  configureInsetGeography();
  if ('ResizeObserver' in window) {
    const observer = new ResizeObserver(() => requestAnimationFrame(layoutAllCountryLabels));
    document.querySelectorAll('#gameArea .country-inset').forEach((inset) => observer.observe(inset));
  }
})();