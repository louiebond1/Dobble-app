/* Team Up reconnect/replay hardening.
   Recovery can replay a country locally and then receive the same reveal back
   from the server. Never allow that to create two labels/records for one id. */
(function () {
  if (typeof revealMarker !== 'function') return;

  function cleanDuplicateRecords(id) {
    if (typeof polishedLabelRecords === 'undefined' || !Array.isArray(polishedLabelRecords)) return;
    let kept = false;
    for (let i = polishedLabelRecords.length - 1; i >= 0; i--) {
      const record = polishedLabelRecords[i];
      if (!record || !record.label || record.label.dataset.countryId !== id) continue;
      if (!record.label.isConnected) {
        polishedLabelRecords.splice(i, 1);
        continue;
      }
      if (!kept) {
        kept = true;
      } else {
        record.label.remove();
        polishedLabelRecords.splice(i, 1);
      }
    }
  }

  function hasLiveLabel(id) {
    return !!document.querySelector(`#gameArea .country-marker-label[data-country-id="${CSS.escape(String(id))}"]`);
  }

  const baseReveal = revealMarker;
  revealMarker = function revealMarkerReconnectSafe(id, ownerName) {
    cleanDuplicateRecords(id);

    // A repeated server/local replay for the same country must not create a
    // second permanent label. Keep the existing label and only tidy layout.
    if (hasLiveLabel(id)) {
      const marker = typeof markerEls !== 'undefined' ? markerEls.get(id) : null;
      if (marker) {
        if (marker.main) marker.main.classList.add('found');
        if (marker.insetEl) marker.insetEl.classList.add('found');
      }
      if (typeof layoutAllCountryLabels === 'function') requestAnimationFrame(layoutAllCountryLabels);
      return;
    }

    baseReveal(id, ownerName);
    cleanDuplicateRecords(id);
    if (typeof layoutAllCountryLabels === 'function') requestAnimationFrame(layoutAllCountryLabels);
  };

  // Defensive cleanup for any burst of reconnect events that lands in the
  // same frame. This also repairs an already-duplicated DOM without touching
  // game score/progress.
  function sweepDuplicates() {
    const seen = new Set();
    document.querySelectorAll('#gameArea .country-marker-label[data-country-id]').forEach((label) => {
      const id = label.dataset.countryId;
      if (!seen.has(id)) {
        seen.add(id);
        return;
      }
      label.remove();
    });

    if (typeof polishedLabelRecords !== 'undefined' && Array.isArray(polishedLabelRecords)) {
      const recordSeen = new Set();
      for (let i = polishedLabelRecords.length - 1; i >= 0; i--) {
        const record = polishedLabelRecords[i];
        const id = record?.label?.dataset?.countryId;
        if (!id || !record.label.isConnected || recordSeen.has(id)) {
          polishedLabelRecords.splice(i, 1);
        } else {
          recordSeen.add(id);
        }
      }
    }

    if (typeof layoutAllCountryLabels === 'function') requestAnimationFrame(layoutAllCountryLabels);
  }

  if (typeof socket !== 'undefined' && socket && typeof socket.on === 'function') {
    socket.on('countries:game:start', () => setTimeout(sweepDuplicates, 450));
    socket.on('countries:reveal', () => setTimeout(sweepDuplicates, 0));
    socket.on('connect', () => setTimeout(sweepDuplicates, 250));
  }

  window.addEventListener('pageshow', () => setTimeout(sweepDuplicates, 250));
  setTimeout(sweepDuplicates, 300);
})();
