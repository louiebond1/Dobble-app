// 57 personal symbols (n=7 projective-plane construction: 57 cards, 8 symbols/card,
// every two cards share exactly one symbol).
// `image`, when set, is a stable Wikimedia Commons URL shown instead of the emoji
// (fetched by the player's own browser, not this server). Personal symbols (pets,
// in-jokes, specific people/places) have no stock photo and stay emoji-only until
// a real photo is supplied.
const SYMBOLS = [
  { emoji: '🥗', label: 'Caesar Salad', image: '/images/caesar-salad.webp' },
  { emoji: '🥯', label: 'Bagels', image: '/images/bagels.webp' },
  { emoji: '🦃', label: 'Sliced Turkey', image: '/images/turkey.webp' },
  { emoji: '🍕', label: 'Pizza', image: '/images/pizza-ill.webp' },
  { emoji: '🍝', label: 'Pasta', image: '/images/pasta-ill.webp' },
  { emoji: '🍣', label: 'Sushi', image: '/images/sushi.webp' },
  { emoji: '🍨', label: 'Amorino', image: '/images/amorino.webp' },
  { emoji: '🍜', label: 'Wagamama Teriyaki', image: '/images/wagamama-teriyaki.webp' },
  { emoji: '🧀', label: 'Mac & Cheese', image: '/images/mac-cheese.webp' },
  { emoji: '🛒', label: "Trader Joe's", image: '/images/trader-joes.webp' },
  { emoji: '🟢', label: 'Green M&M', image: '/images/green-mm.webp' },
  { emoji: '🤍', label: 'Burrata', image: '/images/burrata.webp' },
  { emoji: '🧈', label: 'Parmesan', image: '/images/parmesan.webp' },
  { emoji: '🍛', label: 'Butter Chicken (Dishoom)', image: '/images/butter-chicken.webp' },
  { emoji: '🍦', label: 'Ice Cream', image: '/images/ice-cream.webp' },
  { emoji: '🥤', label: 'Diet Coke', image: '/images/diet-coke.webp' },
  { emoji: '🍫', label: 'Chocolate Fondant', image: '/images/chocolate-fondant.webp' },
  { emoji: '🎊', label: 'Multicolour Sprinkles', image: '/images/sprinkles-ill.webp' },
  { emoji: '🥑', label: 'Avocado Toast', image: '/images/avocado-toast.webp' },
  { emoji: '🥂', label: 'Hugo Spritz', image: '/images/hugo-spritz.webp' },
  { emoji: '🧋', label: 'Iced Coffee', image: '/images/iced-coffee.webp' },
  { emoji: '🍰', label: 'Cookies & Cream Cake', image: '/images/cookies-cream-cake.webp' },
  { emoji: '🥡', label: 'Pad Thai', image: '/images/pad-thai.webp' },
  { emoji: '🍭', label: 'Orange Calippo', image: '/images/orange-calippo.webp' },
  { emoji: '🍗', label: "Chicken Tenders (McDonald's)", image: '/images/chicken-tenders.webp' },
  { emoji: '🏛️', label: 'Colosseum', image: '/images/colosseum-ill.webp' },
  { emoji: '🚇', label: 'London Underground', image: '/images/london-underground.webp' },
  { emoji: '🏙️', label: 'Empire State Building', image: '/images/empire-state-ill.webp' },
  { emoji: '🛶', label: 'Venice', image: '/images/venice-ill.webp' },
  { emoji: '🌉', label: 'Brooklyn Bridge', image: '/images/brooklyn-bridge-ill.webp' },
  { emoji: '🏞️', label: 'Lake (Montanejos)', image: '/images/lake-montanejos-ill.webp' },
  { emoji: '✈️', label: 'Plane', image: '/images/plane-ill.webp' },
  { emoji: '🐦', label: 'Mockingjay', image: '/images/mockingjay.webp' },
  { emoji: '🧙‍♀️', label: 'Elphaba', image: '/images/elphaba.webp' },
  { emoji: '⛪', label: 'Sistine Chapel', image: '/images/sistine-chapel-ill.webp' },
  { emoji: '🎭', label: 'Hamilton', image: '/images/hamilton-ill.webp' },
  { emoji: '🀄', label: 'Rummikub', image: '/images/rummikub.webp' },
  { emoji: '🐨', label: 'Koalas', image: '/images/koala-ill.webp' },
  { emoji: '🐶', label: 'Beige Cavapoo', image: '/images/beige-cavapoo.webp' },
  { emoji: '🐩', label: 'Beige Labradoodle', image: '/images/beige-labradoodle.webp' },
  { emoji: '🐹', label: 'Lemming', image: '/images/lemming.webp' },
  { emoji: '🥔', label: 'A Furry Potato', image: '/images/furry-potato.webp' },
  { emoji: '🐄', label: 'Smudge (Jellycat Cow)', image: '/images/smudge-cow.webp' },
  { emoji: '🕺', label: 'Dancer', image: '/images/dancer-ill.webp' },
  { emoji: '🩰', label: 'Dance Shoes', image: '/images/dance-shoes-ill.webp' },
  { emoji: '🧸', label: 'Ballerina Teddy Bear', image: '/images/ballerina-teddy-bear.webp' },
  { emoji: '🐰', label: 'Bunny Teddy Bear', image: '/images/bunny-teddy-bear.webp' },
  { emoji: '🏷️', label: 'Jellycat Logo', image: '/images/jellycat-logo.webp' },
  { emoji: '🐓', label: 'Spurs', image: '/images/spurs.webp' },
  { emoji: '👑', label: 'Crown Hat', image: '/images/crown-hat.webp' },
  { emoji: '💌', label: 'A + L', image: '/images/a-plus-l-ill.webp' },
  { emoji: '🏕️', label: "Pinemere's Camp", image: '/images/pinemere-camp.webp' },
  { emoji: '🪑', label: 'Park Bench', image: '/images/park-bench-ill.webp' },
  { emoji: '📖', label: 'Book', image: '/images/book-ill.webp' },
  { emoji: '📲', label: 'Kindle', image: '/images/kindle.webp' },
  { emoji: '🥷', label: 'Ninja Warrior Kit', image: '/images/ninja-warrior-kit-ill.webp' },
  { emoji: '🧪', label: 'Science Kit', image: '/images/science-kit.webp' },
];

// Classic finite-projective-plane construction (n must be prime).
// Produces n^2+n+1 cards from n^2+n+1 symbols, each card holding n+1 symbols,
// with every pair of cards sharing exactly one symbol.
function generateDeck(n) {
  const deck = [];
  for (let i = 0; i <= n; i++) {
    const card = [0];
    for (let j = 0; j < n; j++) card.push(1 + i * n + j);
    deck.push(card);
  }
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const card = [1 + i];
      for (let k = 0; k < n; k++) {
        card.push(1 + n + n * k + ((i * k + j) % n));
      }
      deck.push(card);
    }
  }
  return deck;
}

const N = 7; // -> 57 symbols, 57 cards, 8 symbols/card
const DECK = generateDeck(N);

module.exports = { SYMBOLS, DECK, N };
