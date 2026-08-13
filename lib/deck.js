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
  { emoji: '🍕', label: 'Pizza', image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Pizza_(1).jpg?width=300' },
  { emoji: '🍝', label: 'Pasta', image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Spaghetti_carbonara.jpg?width=300' },
  { emoji: '🍣', label: 'Sushi', image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Sushi_plate.JPG?width=300' },
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
  { emoji: '🎊', label: 'Multicolour Sprinkles', image: '/images/sprinkles.jpg' },
  { emoji: '🥑', label: 'Avocado Toast', image: '/images/avocado-toast.webp' },
  { emoji: '🥂', label: 'Hugo Spritz', image: '/images/hugo-spritz.webp' },
  { emoji: '🧋', label: 'Iced Coffee', image: '/images/iced-coffee.webp' },
  { emoji: '🍰', label: 'Cookies & Cream Cake', image: '/images/cookies-cream-cake.webp' },
  { emoji: '🥡', label: 'Pad Thai', image: '/images/pad-thai.webp' },
  { emoji: '🍭', label: 'Orange Calippo', image: '/images/orange-calippo.webp' },
  { emoji: '🍗', label: "Chicken Tenders (McDonald's)", image: '/images/chicken-tenders.webp' },
  { emoji: '🏛️', label: 'Colosseum', image: '/images/colosseum.jpg' },
  { emoji: '🚇', label: 'London Underground', image: '/images/london-underground.webp' },
  { emoji: '🏙️', label: 'Empire State Building', image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Empire_State_Building,_New_York,_NY.jpg?width=300' },
  { emoji: '🛶', label: 'Venice', image: '/images/venice.jpg' },
  { emoji: '🌉', label: 'Brooklyn Bridge', image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Brooklyn_Bridge_Jun_2014.jpg?width=300' },
  { emoji: '🏞️', label: 'Lake (Montanejos)', image: '/images/lake-montanejos.jpg' },
  { emoji: '✈️', label: 'Plane', image: null },
  { emoji: '🐦', label: 'Mockingjay', image: '/images/mockingjay.webp' },
  { emoji: '🧙‍♀️', label: 'Elphaba', image: '/images/elphaba.webp' },
  { emoji: '⛪', label: 'Sistine Chapel', image: '/images/sistine-chapel.jpg' },
  { emoji: '🎭', label: 'Hamilton', image: '/images/hamilton.jpg' },
  { emoji: '🎆', label: 'Fireworks', image: null },
  { emoji: '🐨', label: 'Koalas', image: '/images/koala.webp' },
  { emoji: '🐶', label: 'Beige Cavapoo', image: '/images/beige-cavapoo.webp' },
  { emoji: '🐩', label: 'Beige Labradoodle', image: '/images/beige-labradoodle.webp' },
  { emoji: '🐹', label: 'Lemming', image: '/images/lemming.webp' },
  { emoji: '🥔', label: 'A Furry Potato', image: '/images/furry-potato.webp' },
  { emoji: '🐄', label: 'Smudge (Jellycat Cow)', image: '/images/smudge-cow.webp' },
  { emoji: '🕺', label: 'Dancer', image: null },
  { emoji: '🩰', label: 'Dance Shoes', image: null },
  { emoji: '🧸', label: 'Ballerina Teddy Bear', image: '/images/ballerina-teddy-bear.webp' },
  { emoji: '🐰', label: 'Bunny Teddy Bear', image: '/images/bunny-teddy-bear.webp' },
  { emoji: '🏷️', label: 'Jellycat Logo', image: '/images/jellycat-logo.webp' },
  { emoji: '🐓', label: 'Spurs', image: '/images/spurs.webp' },
  { emoji: '👑', label: 'Crown Hat', image: '/images/crown-hat.webp' },
  { emoji: '💌', label: 'A + L', image: '/images/a-plus-l.jpg' },
  { emoji: '🏕️', label: "Pinemere's Camp", image: '/images/pinemere-camp.webp' },
  { emoji: '🪑', label: 'Park Bench', image: '/images/park-bench.webp' },
  { emoji: '📖', label: 'Book', image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Books_in_a_stack_(a_stack_of_books)_-_Flickr_-_austinevan.jpg?width=300' },
  { emoji: '📲', label: 'Kindle', image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Amazon_Kindle_Paperwhite_5_Eleventh_Generation_(C2V2L3)_6-inch_e-reader.jpg?width=300' },
  { emoji: '🥷', label: 'Ninja Warrior Kit', image: '/images/ninja-warrior-kit.jpg' },
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
