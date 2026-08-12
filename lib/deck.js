// 57 personal symbols (n=7 projective-plane construction: 57 cards, 8 symbols/card,
// every two cards share exactly one symbol).
// `image`, when set, is a filename under public/images/ shown instead of the emoji.
// Personal symbols (pets, in-jokes, specific people/places) have no stock photo
// available and stay emoji-only until a real photo is supplied.
const SYMBOLS = [
  { emoji: '🥗', label: 'Caesar Salad', image: 'caesar-salad.jpg' },
  { emoji: '🥯', label: 'Bagels', image: 'bagels.jpg' },
  { emoji: '🦃', label: 'Sliced Turkey', image: 'turkey.jpg' },
  { emoji: '🍕', label: 'Pizza', image: 'pizza.jpg' },
  { emoji: '🍝', label: 'Pasta', image: 'pasta.jpg' },
  { emoji: '🍣', label: 'Sushi', image: 'sushi.jpg' },
  { emoji: '🍨', label: 'Amorino', image: 'amorino-gelato.jpg' },
  { emoji: '🍜', label: 'Wagamama Teriyaki', image: 'wagamama-teriyaki.jpg' },
  { emoji: '🧀', label: 'Mac & Cheese', image: 'mac-cheese.jpg' },
  { emoji: '🛒', label: "Trader Joe's", image: 'trader-joes.jpg' },
  { emoji: '🟢', label: 'Green M&M', image: 'green-mm.jpg' },
  { emoji: '🤍', label: 'Burrata', image: 'burrata.jpg' },
  { emoji: '🧈', label: 'Parmesan', image: 'parmesan.jpg' },
  { emoji: '🍛', label: 'Butter Chicken (Dishoom)', image: 'butter-chicken.jpg' },
  { emoji: '🍦', label: 'Ice Cream', image: 'ice-cream.jpg' },
  { emoji: '🥤', label: 'Diet Coke', image: 'diet-coke.jpg' },
  { emoji: '☕', label: 'Hot Chocolate', image: 'hot-chocolate.jpg' },
  { emoji: '🎊', label: 'Multicolour Sprinkles', image: 'sprinkles.jpg' },
  { emoji: '🥑', label: 'Avocado Toast', image: 'avocado-toast.jpg' },
  { emoji: '🥂', label: 'Hugo Spritz', image: 'hugo-spritz.jpg' },
  { emoji: '🧋', label: 'Iced Coffee', image: 'iced-coffee.jpg' },
  { emoji: '🍰', label: 'Cookies & Cream Cake', image: 'cookies-cream-cake.jpg' },
  { emoji: '🥡', label: 'Pad Thai', image: 'pad-thai.jpg' },
  { emoji: '🍭', label: 'Orange Calippo', image: 'orange-calippo.jpg' },
  { emoji: '🍗', label: "Chicken Tenders (McDonald's)", image: 'chicken-tenders.jpg' },
  { emoji: '🏛️', label: 'Colosseum', image: 'colosseum.jpg' },
  { emoji: '🚇', label: 'London Underground', image: 'london-underground.jpg' },
  { emoji: '🏙️', label: 'Empire State Building', image: 'empire-state-building.jpg' },
  { emoji: '🛶', label: 'Venice', image: 'venice.jpg' },
  { emoji: '🌉', label: 'Brooklyn Bridge', image: 'brooklyn-bridge.jpg' },
  { emoji: '🏞️', label: 'Lake (Montanejos)', image: null },
  { emoji: '✈️', label: 'Plane', image: 'plane.jpg' },
  { emoji: '🐦', label: 'Mockingjay', image: 'mockingjay.jpg' },
  { emoji: '🧙‍♀️', label: 'Elphaba', image: 'elphaba.jpg' },
  { emoji: '❄️', label: 'Elsa', image: 'elsa.jpg' },
  { emoji: '🎭', label: 'Hamilton', image: 'hamilton.jpg' },
  { emoji: '🕶️', label: 'Men In Black', image: 'men-in-black.jpg' },
  { emoji: '🐨', label: 'Koalas', image: 'koalas.jpg' },
  { emoji: '🐶', label: 'Beige Cavapoo', image: null },
  { emoji: '🐩', label: 'Beige Labradoodle', image: null },
  { emoji: '🐹', label: 'Lemming', image: 'lemming.jpg' },
  { emoji: '🥔', label: 'A Furry Potato', image: null },
  { emoji: '🐄', label: 'Smudge (Jellycat Cow)', image: null },
  { emoji: '💃', label: 'Dancer', image: 'dancer.jpg' },
  { emoji: '🩰', label: 'Dance Shoes', image: 'dance-shoes.jpg' },
  { emoji: '🧸', label: 'Ballerina Teddy Bear', image: 'ballerina-teddy-bear.jpg' },
  { emoji: '🐰', label: 'Bunny Teddy Bear', image: 'bunny-teddy-bear.jpg' },
  { emoji: '🏷️', label: 'Jellycat Logo', image: 'jellycat-logo.jpg' },
  { emoji: '🐓', label: 'Spurs', image: 'spurs.jpg' },
  { emoji: '👑', label: 'Crown Hat', image: null },
  { emoji: '💌', label: 'A + L', image: null },
  { emoji: '🏕️', label: "Pinemere's Camp", image: null },
  { emoji: '🪑', label: 'Park Bench', image: null },
  { emoji: '📖', label: 'Book', image: 'book.jpg' },
  { emoji: '📲', label: 'Kindle', image: 'kindle.jpg' },
  { emoji: '🥷', label: 'Ninja Warrior Kit', image: 'ninja-warrior-kit.jpg' },
  { emoji: '🧪', label: 'Science Kit', image: 'science-kit.jpg' },
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
