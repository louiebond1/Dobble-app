// Draft Test burger art: every ingredient is its own hand-drawn SVG layer, stacked in the order it was added,
// so a burger always shows exactly what its owner bought. No images are fetched; everything is drawn here.
(function (root) {
  const W = 400, CX = 200, INK = '#3b2314';

  // Wobbly edge along a horizontal line, for lettuce and cheese drips.
  function wave(x0, x1, y, amp, n, phase) {
    let d = '';
    for (let i = 0; i <= n; i++) {
      const x = x0 + (x1 - x0) * i / n, yy = y + Math.sin(i * 1.7 + (phase || 0)) * amp + (i % 2 ? amp * .6 : 0);
      d += (i ? ' L' : 'M') + x.toFixed(1) + ' ' + yy.toFixed(1);
    }
    return d;
  }
  const g = (id, stops) => `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">${stops.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('')}</linearGradient>`;
  const DEFS = `<defs>
    ${g('bunTop', [[0, '#f6b25a'], [.55, '#e08a2c'], [1, '#c46a1c']])}
    ${g('bunBot', [[0, '#f2a84e'], [1, '#c8701f']])}
    ${g('beef', [[0, '#7a3f22'], [.5, '#5b2c17'], [1, '#43200f']])}
    ${g('chicken', [[0, '#f0b347'], [1, '#c77f22']])}
    ${g('cheese', [[0, '#ffd23f'], [1, '#f5a800']])}
    ${g('tomato', [[0, '#ff5a4a'], [1, '#d42a1e']])}
    ${g('lettuce', [[0, '#9be15d'], [1, '#4caf3a']])}
    ${g('bacon', [[0, '#c9473a'], [1, '#8e2a20']])}
    ${g('egg', [[0, '#ffffff'], [1, '#ece6da']])}
    ${g('plate', [[0, '#ffffff'], [1, '#d9dde3']])}
    <radialGradient id="shine" cx=".35" cy=".25" r=".6"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
  </defs>`;

  // Each layer draws itself with its top edge at y and returns the SVG plus how much height it uses.
  const LAYERS = {
    'bottom-bun': y => ({ h: 46, svg: `
      <path d="M${CX - 150} ${y + 6} Q${CX - 152} ${y + 46} ${CX - 110} ${y + 48} L${CX + 110} ${y + 48} Q${CX + 152} ${y + 46} ${CX + 150} ${y + 6} Z" fill="url(#bunBot)" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>
      <path d="M${CX - 148} ${y + 8} L${CX + 148} ${y + 8}" stroke="#fbe3b5" stroke-width="7" stroke-linecap="round"/>` }),
    'beef': y => ({ h: 34, svg: `
      <rect x="${CX - 158}" y="${y}" width="316" height="38" rx="19" fill="url(#beef)" stroke="${INK}" stroke-width="4"/>
      ${[-110, -60, -5, 50, 105].map((dx, i) => `<path d="M${CX + dx} ${y + 12 + (i % 2) * 6} q10 -4 20 0" stroke="#8d4b28" stroke-width="4" fill="none" stroke-linecap="round"/>`).join('')}` }),
    'double-beef': y => { const a = LAYERS.beef(y), b = LAYERS.beef(y + 30); return { h: 64, svg: b.svg + a.svg }; },
    'crispy-chicken': y => ({ h: 38, svg: `
      <path d="${wave(CX - 160, CX + 160, y + 4, 4, 16, 1)} L${CX + 160} ${y + 36} ${wave(CX + 160, CX - 160, y + 40, 4, 16, 2).replace('M', 'L')} Z" fill="url(#chicken)" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>
      ${Array.from({ length: 14 }, (_, i) => `<circle cx="${CX - 135 + i * 21}" cy="${y + 14 + (i * 7) % 16}" r="2.6" fill="#a8641a"/>`).join('')}` }),
    'cheese': y => ({ h: 16, svg: `
      <path d="M${CX - 165} ${y} L${CX + 165} ${y} L${CX + 160} ${y + 10} L${CX + 120} ${y + 10} L${CX + 108} ${y + 34} L${CX + 96} ${y + 10} L${CX + 20} ${y + 10} L${CX + 6} ${y + 28} L${CX - 8} ${y + 10} L${CX - 90} ${y + 10} L${CX - 104} ${y + 40} L${CX - 118} ${y + 10} L${CX - 160} ${y + 10} Z" fill="url(#cheese)" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>` }),
    'tomato': y => ({ h: 26, svg: [-95, 0, 95].map(dx => `
      <ellipse cx="${CX + dx}" cy="${y + 11}" rx="56" ry="13" fill="url(#tomato)" stroke="${INK}" stroke-width="4"/>
      <ellipse cx="${CX + dx}" cy="${y + 10}" rx="38" ry="7" fill="#ff8a7a"/>
      ${[-20, 0, 20].map(s => `<ellipse cx="${CX + dx + s}" cy="${y + 10}" rx="4" ry="2.4" fill="#ffe08a"/>`).join('')}`).join('') }),
    'lettuce': y => ({ h: 20, svg: `
      <path d="${wave(CX - 172, CX + 172, y + 2, 7, 18)} L${CX + 160} ${y + 22} L${CX - 160} ${y + 22} Z" fill="url(#lettuce)" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>
      <path d="${wave(CX - 150, CX + 150, y + 12, 3, 12, 1)}" stroke="#c8f59a" stroke-width="3" fill="none"/>` }),
    'onion': y => ({ h: 20, svg: [-110, -38, 34, 106].map(dx => `
      <ellipse cx="${CX + dx}" cy="${y + 8}" rx="38" ry="10" fill="#f6e9f5" stroke="#8b4a8a" stroke-width="4"/>
      <ellipse cx="${CX + dx}" cy="${y + 8}" rx="24" ry="5" fill="none" stroke="#b77ab5" stroke-width="3"/>`).join('') }),
    'bacon': y => ({ h: 28, svg: [0, 1].map(k => `
      <path d="${wave(CX - 165, CX + 165, y + 4 + k * 9, 5, 10, k * 2)}" stroke="${INK}" stroke-width="15" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="${wave(CX - 165, CX + 165, y + 4 + k * 9, 5, 10, k * 2)}" stroke="url(#bacon)" stroke-width="9" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="${wave(CX - 160, CX + 160, y + 4 + k * 9, 5, 10, k * 2)}" stroke="#f3c1a8" stroke-width="2.5" fill="none" stroke-dasharray="26 18"/>`).join('') }),
    'pickles': y => ({ h: 20, svg: [-120, -60, 0, 60, 120].map(dx => `
      <ellipse cx="${CX + dx}" cy="${y + 7}" rx="27" ry="8" fill="#7cb342" stroke="${INK}" stroke-width="4"/>
      <ellipse cx="${CX + dx}" cy="${y + 6}" rx="17" ry="4" fill="#c5e1a5"/>`).join('') }),
    'jalapenos': y => ({ h: 20, svg: [-125, -75, -25, 25, 75, 125].map(dx => `
      <ellipse cx="${CX + dx}" cy="${y + 7}" rx="21" ry="8" fill="#2e7d32" stroke="${INK}" stroke-width="4"/>
      <ellipse cx="${CX + dx}" cy="${y + 7}" rx="11" ry="4" fill="#dcedc8"/>`).join('') }),
    'fried-egg': y => ({ h: 28, svg: `
      <path d="M${CX - 150} ${y + 12} Q${CX - 160} ${y - 6} ${CX - 80} ${y} Q${CX} ${y - 8} ${CX + 70} ${y + 1} Q${CX + 165} ${y - 4} ${CX + 150} ${y + 14} Q${CX + 120} ${y + 26} ${CX} ${y + 24} Q${CX - 130} ${y + 28} ${CX - 150} ${y + 12} Z" fill="url(#egg)" stroke="${INK}" stroke-width="4"/>
      <ellipse cx="${CX + 10}" cy="${y + 8}" rx="34" ry="13" fill="#ffb300" stroke="${INK}" stroke-width="4"/>
      <ellipse cx="${CX}" cy="${y + 4}" rx="12" ry="4" fill="#ffe082"/>` }),
    'bbq-sauce': y => ({ h: 12, svg: `
      <path d="M${CX - 155} ${y} L${CX + 155} ${y} L${CX + 150} ${y + 8} Q${CX + 70} ${y + 12} ${CX + 62} ${y + 30} Q${CX + 52} ${y + 12} ${CX - 30} ${y + 10} Q${CX - 38} ${y + 24} ${CX - 46} ${y + 10} L${CX - 150} ${y + 8} Z" fill="#6d2a12" stroke="${INK}" stroke-width="3.5" stroke-linejoin="round"/>` }),
    'top-bun': y => ({ h: 110, svg: `
      <path d="M${CX - 160} ${y + 108} Q${CX - 170} ${y + 20} ${CX} ${y} Q${CX + 170} ${y + 20} ${CX + 160} ${y + 108} Z" fill="url(#bunTop)" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>
      <path d="M${CX - 160} ${y + 108} Q${CX - 170} ${y + 20} ${CX} ${y} Q${CX + 170} ${y + 20} ${CX + 160} ${y + 108} Z" fill="url(#shine)"/>
      ${[[-90, 50, -20], [-40, 30, 15], [10, 24, -10], [60, 34, 25], [105, 58, -30], [-120, 80, 10], [-15, 62, 40], [40, 68, -15], [125, 88, 20], [-60, 86, -35]].map(([dx, dy, r]) => `<ellipse cx="${CX + dx}" cy="${y + dy}" rx="8" ry="4" fill="#fff4dc" stroke="#d9b98a" stroke-width="1.2" transform="rotate(${r} ${CX + dx} ${y + dy})"/>`).join('')}` }),
  };

  // Ingredients in the order they were won, between the buns. Returns a complete SVG string.
  function burger(fillings) {
    const order = ['top-bun', ...fillings.slice().reverse(), 'bottom-bun'];
    // Measure first, then draw from the bottom up so upper layers overlap lower ones.
    const heights = order.map(k => LAYERS[k](0).h), total = heights.reduce((a, b) => a + b, 0);
    const H = Math.max(300, total + 70), top = H - 30 - total;
    let y = top; const ys = heights.map(h => { const v = y; y += h; return v; });
    const plate = `<ellipse cx="${CX}" cy="${H - 26}" rx="190" ry="22" fill="url(#plate)" stroke="#b9bec7" stroke-width="3"/>`;
    let body = '';
    for (let i = order.length - 1; i >= 0; i--) body += LAYERS[order[i]](ys[i]).svg;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img">${DEFS}${plate}${body}</svg>`;
  }
  // One ingredient on its own, for item cards.
  function ingredient(k) {
    const l = LAYERS[k](0), pad = 26, H = l.h + pad * 2 + 24;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${CX - 185} ${-pad - 8} 370 ${H}" role="img">${DEFS}${l.svg}</svg>`;
  }
  const api = { burger, ingredient, LAYERS: Object.keys(LAYERS) };
  if (typeof module !== 'undefined') module.exports = api; else root.BurgerArt = api;
})(this);
