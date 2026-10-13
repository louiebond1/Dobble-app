// Photo prompts for the Draft Night v2 picture library. Every base, item, upgrade and empty plot has one photograph,
// drawn once and reused by every game, so nothing in the game is ever an emoji or a placeholder.
// Prompts only describe what should be in the picture: FLUX.2 has no negative prompting, so "no X" would add X.
const { artKey } = require('./layout');

const PHOTO = 'Professional photograph, photorealistic, natural daylight, sharp focus, rich true-to-life colour.';
const lower = s => s.charAt(0).toLowerCase() + s.slice(1);
const an = w => (/^[aeiou]/i.test(w) ? 'an ' : 'a ') + w;

// What an unbought plot or zone looks like, so a creation is always a complete photographic board.
const EMPTY = {
  zoo: 'an empty square plot of mown grass with a few mature trees and a gravel footpath along its edge, inside a zoo',
  'water-park': 'an empty square plot of sunny paving with a few palm trees and sun loungers along its edge, inside a water park',
  island: 'a square patch of untouched tropical land with palm trees, jungle and a strip of white sand',
  house: 'an empty square of neatly mown garden lawn bordered by low hedges',
  pancakes: 'an empty round white plate on a pale oak table, soft window light',
};

function prompt(t, x) {
  const what = `${x.name}: ${lower(x.blurb)}`;
  switch (t.archetype) {
    case 'site':
      // The hub at the centre of the board: the entrance of a park, or the untouched heart of an island.
      if (x.kind === 'base') return `High aerial drone photograph looking down at 45 degrees on the centre of ${an(t.noun)}: ${lower(x.blurb)}, filling a square plot of land with paths leading away on every side. ${PHOTO}`;
      if (x.kind === 'upgrade') return `Aerial drone photograph of ${an(t.noun)} featuring ${what}. The feature fills the frame, its surfaces plain and unlabelled. ${PHOTO}`;
      // Zoo animals vanish from a high aerial view, so habitats are shot from a low drone with the animals large in frame.
      if (t.id === 'zoo') return `Low drone photograph at 30 degrees over ${what}, a habitat in a modern zoo. The animals are large and clearly visible in the foreground, with natural landscaping and a visitor path along the edge. ${PHOTO}`;
      return `High aerial drone photograph looking down at 45 degrees on ${what}, part of ${an(t.noun)}. The whole attraction fills a square plot of land, with a footpath along its edge, every surface plain and unlabelled. ${PHOTO}`;
    case 'plot':
      if (x.kind === 'base') return `Aerial drone photograph at 45 degrees of a ${what}, standing in the middle of a neat green lawn, the whole house in view. ${PHOTO}`;
      if (x.kind === 'upgrade') return `Photograph of a family home with ${what}. The whole house in view, seen from the garden. ${PHOTO}`;
      return `Photograph of ${what} in a private garden, seen from slightly above, the whole feature in view. ${PHOTO}`;
    case 'room':
      if (x.kind === 'base') return `Wide-angle interior photograph of a plain bedroom with neutral walls, a window, a light wooden floor and one simple double bed with white bedding. ${PHOTO}`;
      if (x.kind === 'upgrade') return `Wide-angle interior photograph of a stylish bedroom with ${what}. ${PHOTO}`;
      return `Interior design photograph of ${what} in a stylish bedroom. The ${x.name.toLowerCase()} fills most of the frame. ${PHOTO}`;
    case 'stack':
      if (x.kind === 'base') return `Food photograph of ${what}, on a round white plate on a pale oak table, seen from a 45-degree angle, plain with nothing on top, soft window light. ${PHOTO}`;
      if (x.kind === 'upgrade') return `Food photograph of a stack of pancakes with ${what}, on a pale oak table, soft window light. ${PHOTO}`;
      return `Close-up food photograph of ${what}, a generous portion in a small white ceramic dish on a pale oak table, soft window light. ${PHOTO}`;
    default:
      return `Professional automotive photograph of ${t.looks[x.name] ? t.looks[x.name] + ' (' + x.name + ')' : 'a ' + x.name}, three-quarter front view, the whole car in view, parked on a polished concrete floor in a modern showroom, soft studio lighting. ${PHOTO}`;
  }
}

// Every photograph the seven themes need: one per base, item and upgrade (shared across themes by art key), plus the
// empty-plot photo for each site and plot theme.
function photoJobs(themes) {
  const out = new Map();
  for (const t of themes) {
    for (const x of Object.values(t.index)) {
      const key = artKey(t, x);
      if (out.has(key)) continue;
      const job = { key, theme: t.id, prompt: prompt(t, x) };
      // Brand names (cars, Nutella, Oreos) can be refused by the provider; the fallback describes the look instead.
      if (t.looks[x.name]) job.fallback = t.archetype === 'collection'
        ? `Professional automotive photograph of ${t.looks[x.name]}, three-quarter front view, the whole car in view, parked on a polished concrete floor in a modern showroom, soft studio lighting, unbadged. ${PHOTO}`
        : prompt(t, { ...x, name: t.looks[x.name], blurb: x.blurb });
      out.set(key, job);
    }
    if (EMPTY[t.id]) out.set(emptyKey(t), { key: emptyKey(t), theme: t.id, prompt: `${t.archetype === 'site' ? 'High aerial drone photograph looking down at 45 degrees on' : t.archetype === 'stack' ? 'Food photograph, seen from a 45-degree angle, of' : 'Photograph looking down at'} ${EMPTY[t.id]}. ${PHOTO}` });
  }
  return [...out.values()];
}
const emptyKey = t => t.archetype + '/empty/' + t.id;

module.exports = { prompt, photoJobs, emptyKey, EMPTY };
