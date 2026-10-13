// Draft Night theme specs: loading, validation and the layout slots each archetype offers.
// A theme is data, not prompt text: an archetype (how creations are laid out), an optional base round, base upgrades that
// can be won in any round, and categories. Each item round auctions one category, so every player ends with one item
// per category and each category fills one slot of the layout.
const fs = require('fs');
const path = require('path');

// Normalised rectangles [x, y, w, h] on a square board. Site and plot boards are a 3 × 3 grid of photo tiles with the
// base in the middle; category slots name a cell (or fill the next free one, for sites). Rooms and dishes use the base
// photo as the whole board with purchases layered on top; Drafter collections are cards.
const cell = (c, r) => [0.02 + c * 0.33, 0.02 + r * 0.33, 0.31, 0.31];
const GRID = [cell(0, 0), cell(2, 0), cell(0, 2), cell(2, 2), cell(1, 0), cell(1, 2), cell(0, 1), cell(2, 1)];
const ARCHETYPES = {
  // A whole place seen from above: the base is the entrance hub, each category claims a whole plot around it.
  site: { base: cell(1, 1), slots: { parcel: 'sequence' }, parcels: GRID, grid: GRID },
  // A house on its plot: the won house in the middle and categories in named parts of the grounds.
  plot: {
    base: cell(1, 1), grid: GRID,
    slots: { patio: cell(0, 0), 'back-garden': cell(1, 0), 'far-lawn': cell(2, 0), 'left-garden': cell(0, 1), 'right-garden': cell(2, 1), 'front-drive': cell(1, 2) },
  },
  // One room: its photo is the board, purchases are framed photos in their part of the room.
  room: {
    base: [0, 0, 1, 1],
    slots: { 'centre-floor': [0.34, 0.5, 0.32, 0.32], 'left-wall': [0.04, 0.06, 0.28, 0.32], 'right-wall': [0.68, 0.06, 0.28, 0.32], 'back-wall': [0.36, 0.06, 0.28, 0.32], 'left-floor': [0.04, 0.6, 0.28, 0.32], 'right-floor': [0.68, 0.6, 0.28, 0.32] },
  },
  // One dish: its photo is the board, each topping is a round photo layered around it, the side dish bottom right.
  stack: {
    base: [0, 0, 1, 1],
    slots: { drizzle: [0.03, 0.03, 0.25, 0.25], crown: [0.375, 0.03, 0.25, 0.25], fruit: [0.72, 0.03, 0.25, 0.25], sprinkle: [0.03, 0.375, 0.25, 0.25], garnish: [0.03, 0.72, 0.25, 0.25], side: [0.66, 0.66, 0.31, 0.31] },
  },
  // A Drafter collection: no scene, one card per pick.
  collection: {
    base: null,
    slots: { card: 'sequence' },
    parcels: [[0.02, 0.02, 0.31, 0.47], [0.345, 0.02, 0.31, 0.47], [0.67, 0.02, 0.31, 0.47], [0.02, 0.51, 0.31, 0.47], [0.345, 0.51, 0.31, 0.47], [0.67, 0.51, 0.31, 0.47]],
  },
};
const TIERS = { 1: 'Solid', 2: 'Great', 3: 'Showpiece' };
const MAX_PLAYERS = 6;

const slug = s => String(s).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
// "Name | blurb | tier | group": the compact line format used by the theme files.
function line(s, kind, extra = {}) {
  const [name, blurb = '', tier = '2', group] = String(s).split('|').map(x => x.trim());
  return { id: kind + ':' + slug(name), name, blurb, tier: Number(tier), kind, ...(group ? { group } : {}), ...extra };
}

function hydrate(raw) {
  const t = { id: raw.id, title: raw.title, emoji: raw.emoji, mode: raw.mode, archetype: raw.archetype, noun: raw.noun, intro: raw.intro || '' };
  t.bases = (raw.bases || []).map(s => line(s, 'base', { tier: 2 }));
  t.base = raw.base ? line(raw.base, 'base', { tier: 2 }) : null;
  t.upgrades = (raw.upgrades || []).map(s => line(s, 'upgrade'));
  t.categories = raw.categories.map(c => ({ id: c.id, name: c.name, slot: c.slot, emoji: c.emoji || '', replaces: c.replaces || null, items: c.items.map(s => line(s, 'item', { category: c.id })) }));
  t.index = {};
  for (const x of [...t.bases, ...(t.base ? [t.base] : []), ...t.upgrades, ...t.categories.flatMap(c => c.items)]) t.index[x.id] = x;
  return t;
}

// Every rule the round engine and layout rely on. Returns a list of problems; empty means valid.
function validate(t) {
  const errs = [], a = ARCHETYPES[t.archetype];
  if (!t.id || !t.title || !t.noun) errs.push('missing id, title or noun');
  if (!['builder', 'drafter'].includes(t.mode)) errs.push('mode must be builder or drafter');
  if (!a) { errs.push('unknown archetype ' + t.archetype); return errs; }
  if (t.mode === 'drafter' && t.archetype !== 'collection') errs.push('drafter themes use the collection archetype');
  if (t.mode === 'builder' && t.archetype === 'collection') errs.push('builder themes need a scene archetype');
  if (t.mode === 'builder' && !t.base && t.bases.length < MAX_PLAYERS + 1) errs.push('a base round needs at least ' + (MAX_PLAYERS + 1) + ' base options');
  if (t.base && t.bases.length) errs.push('use either a fixed base or base options, not both');
  if (t.mode === 'drafter' && (t.base || t.bases.length || t.upgrades.length)) errs.push('drafter themes have no base or upgrades');
  if (t.categories.length < 3) errs.push('at least 3 categories');
  const parcels = a.parcels ? a.parcels.length : Infinity;
  if (t.categories.filter(c => a.slots[c.slot] === 'sequence').length > parcels) errs.push('more categories than layout parcels');
  const used = new Set();
  for (const c of t.categories) {
    if (!a.slots[c.slot]) errs.push(c.id + ': slot ' + c.slot + ' is not in the ' + t.archetype + ' layout');
    if (a.slots[c.slot] !== 'sequence') { if (used.has(c.slot)) errs.push(c.id + ': slot ' + c.slot + ' used twice'); used.add(c.slot); }
    // One market per round offers each player one category item (plus one upgrade, or one more item without upgrades).
    if (c.items.length < MAX_PLAYERS + 1) errs.push(c.id + ': needs at least ' + (MAX_PLAYERS + 1) + ' items');
    if (!c.items.some(x => x.tier === 3) || !c.items.some(x => x.tier === 1)) errs.push(c.id + ': needs showpiece and solid items');
  }
  const ids = new Set();
  for (const x of [...t.bases, ...t.upgrades, ...t.categories.flatMap(c => c.items)]) {
    if (!x.name || !x.blurb) errs.push('item without name or blurb: ' + x.id);
    if (!TIERS[x.tier]) errs.push(x.id + ': tier must be 1, 2 or 3');
    if (ids.has(x.id)) errs.push('duplicate item ' + x.id);
    ids.add(x.id);
  }
  // One upgrade is offered per round. Upgrades sharing a group (two batters, two roofs) replace each other on a base.
  if (t.upgrades.length && t.upgrades.length < t.categories.length) errs.push('needs at least one upgrade per round');
  return errs;
}

// The order games appear in the picker; anything else follows alphabetically.
const ORDER = ['house', 'pancakes', 'zoo', 'water-park', 'island', 'bedroom', 'garage'];
const rank = t => (ORDER.indexOf(t.id) + 1 || ORDER.length + 1);
function loadThemes(dir = path.join(__dirname, 'themes')) {
  return fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort().map(f => {
    const t = hydrate(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
    const errs = validate(t);
    if (errs.length) throw Error('Invalid Draft Night theme ' + f + ': ' + errs.join('; '));
    return t;
  }).sort((a, b) => rank(a) - rank(b) || a.id.localeCompare(b.id));
}

function summary(t) {
  return { id: t.id, title: t.title, emoji: t.emoji, mode: t.mode, archetype: t.archetype, noun: t.noun, intro: t.intro, maxRounds: t.categories.length, hasBaseRound: t.bases.length > 0, base: t.base && t.base.name, categories: t.categories.map(c => c.name), upgrades: t.upgrades.length > 0, examples: t.categories.map(c => c.items.find(x => x.tier === 3).name) };
}

module.exports = { ARCHETYPES, TIERS, MAX_PLAYERS, slug, hydrate, validate, loadThemes, summary };
