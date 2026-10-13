// Composition planner: turns what a player owns into an exact list of placed pieces. Pictures are drawn from this list,
// so every purchase appears exactly once, in its own place, by construction rather than by asking a model to remember it.
const { ARCHETYPES } = require('./spec');

// The art for an item is shared by every theme with the same archetype and slot kind ("site/parcel/lion-pride-plains").
function artKey(theme, x) {
  const name = x.id.split(':')[1];
  if (x.kind === 'base') return theme.archetype + '/base/' + theme.id + '-' + name;
  if (x.kind === 'upgrade') return theme.archetype + '/upgrade/' + theme.id + '-' + name;
  const c = theme.categories.find(k => k.id === x.category);
  return theme.archetype + '/' + c.slot + '/' + name;
}

// owned: { base: itemId|null, items: [itemId in order won] }. Returns { pieces, hidden } where hidden lists base
// essentials that a purchase replaced (the basic bed once a four-poster is won).
function compose(theme, owned) {
  const a = ARCHETYPES[theme.archetype], pieces = [], hidden = [];
  const base = owned.base ? theme.index[owned.base] : theme.base;
  if (a.base && base) pieces.push({ id: base.id, role: 'base', rect: a.base, z: 0 });
  let parcel = 0, z = 10;
  const upgrades = new Map();
  for (const id of owned.items) {
    const x = theme.index[id];
    if (!x) continue;
    if (x.kind === 'upgrade') { upgrades.set(x.group || x.id, x); continue; } // a later upgrade in a group replaces the earlier one
    const c = theme.categories.find(k => k.id === x.category), spot = a.slots[c.slot];
    const rect = spot === 'sequence' ? a.parcels[parcel++] : spot;
    if (c.replaces) hidden.push(c.replaces);
    pieces.push({ id, role: 'item', slot: c.slot, category: c.id, rect, z: z++ });
  }
  // Upgrades change the base itself, so they sit over it in the order they were won.
  for (const x of upgrades.values()) pieces.push({ id: x.id, role: 'upgrade', group: x.group || null, rect: a.base || [0, 0, 1, 1], z: 5 });
  pieces.sort((p, q) => p.z - q.z);
  return { pieces, hidden };
}

module.exports = { compose, artKey };
