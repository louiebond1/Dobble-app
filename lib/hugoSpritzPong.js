// "Hugo Spritz Pong" — a real-world beer-pong companion game, played with
// Hugo Spritz instead of beer. 10 cups, each named after one of the 57
// Favourite Things, each with its own forfeit when sunk. `symbolLabel` must
// match a label in lib/deck.js's SYMBOLS exactly, so the app can reuse the
// same illustrated artwork instead of duplicating assets.
const CUPS = [
  { id: 1, symbolLabel: 'Hugo Spritz', forfeit: 'Both players down an extra sip together — a toast to whoever set this cup up.' },
  { id: 2, symbolLabel: 'Dance Shoes', forfeit: 'The shooter dances for 10 seconds, right now, no exceptions.' },
  { id: 3, symbolLabel: 'Crown Hat', forfeit: 'The shooter wears the Crown Hat (or the nearest thing to it) for the rest of the game.' },
  { id: 4, symbolLabel: 'Spurs', forfeit: 'The shooter sings a football chant, badly, before the next shot.' },
  { id: 5, symbolLabel: 'Rummikub', forfeit: 'Chaos twist — swap ends of the table with your opponent for one full round.' },
  { id: 6, symbolLabel: 'Ninja Warrior Kit', forfeit: "The shooter's next shot must be taken with their non-dominant hand." },
  { id: 7, symbolLabel: 'Green M&M', forfeit: 'The opponent asks one truth question the shooter must answer honestly before shooting again.' },
  { id: 8, symbolLabel: 'Diet Coke', forfeit: "Fizz out — the shooter's next turn is skipped entirely." },
  { id: 9, symbolLabel: 'Beige Cavapoo', forfeit: 'Play pauses while everyone looks at a photo of the puppy. Non-negotiable.' },
  { id: 10, symbolLabel: 'A + L', forfeit: 'GAME OVER — sinking this cup wins the whole game outright.', wins: true },
];

module.exports = { CUPS };
