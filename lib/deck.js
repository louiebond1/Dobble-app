// 57 personal symbols (n=7 projective-plane construction: 57 cards, 8 symbols/card,
// every two cards share exactly one symbol).
// `image`, when set, is a stable Wikimedia Commons URL shown instead of the emoji
// (fetched by the player's own browser, not this server). Personal symbols (pets,
// in-jokes, specific people/places) have no stock photo and stay emoji-only until
// a real photo is supplied.
const SYMBOLS = [
  { emoji: '🥗', label: 'Caesar Salad', image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Caesar_salad_(2).jpg?width=300' },
  { emoji: '🥯', label: 'Bagels', image: '/images/bagels.jpg' },
  { emoji: '🦃', label: 'Sliced Turkey', image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Turkey_slices_prepared_for_Christmas_dinner.jpg?width=300' },
  { emoji: '🍕', label: 'Pizza', image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Pizza_(1).jpg?width=300' },
  { emoji: '🍝', label: 'Pasta', image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Spaghetti_carbonara.jpg?width=300' },
  { emoji: '🍣', label: 'Sushi', image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Sushi_plate.JPG?width=300' },
  { emoji: '🍨', label: 'Amorino', image: '/images/amorino.jpg' },
  { emoji: '🍜', label: 'Wagamama Teriyaki', image: '/images/wagamama-teriyaki.webp' },
  { emoji: '🧀', label: 'Mac & Cheese', image: '/images/mac-cheese.jpg' },
  { emoji: '🛒', label: "Trader Joe's", image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Food_aisle_at_Publix_Super_Market_at_The_Paramount_on_Lake_Eola,_Orlando,_Florida.jpg?width=300' },
  { emoji: '🟢', label: 'Green M&M', image: '/images/green-mm.webp' },
  { emoji: '🤍', label: 'Burrata', image: '/images/burrata.jpg' },
  { emoji: '🧈', label: 'Parmesan', image: '/images/parmesan.webp' },
  { emoji: '🍛', label: 'Butter Chicken (Dishoom)', image: '/images/butter-chicken.jpg' },
  { emoji: '🍦', label: 'Ice Cream', image: '/images/ice-cream.jpg' },
  { emoji: '🥤', label: 'Diet Coke', image: '/images/diet-coke.webp' },
  { emoji: '☕', label: 'Hot Chocolate', image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Chocolate_drink_in_mug.jpg?width=300' },
  { emoji: '🎊', label: 'Multicolour Sprinkles', image: '/images/sprinkles.jpg' },
  { emoji: '🥑', label: 'Avocado Toast', image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Avocado_toast.jpg?width=300' },
  { emoji: '🥂', label: 'Hugo Spritz', image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Aperol_Spritz_2014a.jpg?width=300' },
  { emoji: '🧋', label: 'Iced Coffee', image: '/images/iced-coffee.jpg' },
  { emoji: '🍰', label: 'Cookies & Cream Cake', image: '/images/cookies-cream-cake.jpg' },
  { emoji: '🥡', label: 'Pad Thai', image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Pad_Thai_Noodles_-_Little_Thai,_Brighton_2024-03-21.jpg?width=300' },
  { emoji: '🍭', label: 'Orange Calippo', image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Orange_Calippo.jpg?width=300' },
  { emoji: '🍗', label: "Chicken Tenders (McDonald's)", image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Crispy_Chicken_Strips_-_FotoosVanRobin.jpg?width=300' },
  { emoji: '🏛️', label: 'Colosseum', image: '/images/colosseum.jpg' },
  { emoji: '🚇', label: 'London Underground', image: '/images/london-underground.webp' },
  { emoji: '🏙️', label: 'Empire State Building', image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Empire_State_Building,_New_York,_NY.jpg?width=300' },
  { emoji: '🛶', label: 'Venice', image: '/images/venice.jpg' },
  { emoji: '🌉', label: 'Brooklyn Bridge', image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Brooklyn_Bridge_Jun_2014.jpg?width=300' },
  { emoji: '🏞️', label: 'Lake (Montanejos)', image: '/images/lake-montanejos.jpg' },
  { emoji: '✈️', label: 'Plane', image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Airplane_in_flight.jpg?width=300' },
  { emoji: '🐦', label: 'Mockingjay', image: '/images/mockingjay.jpg' },
  { emoji: '🧙‍♀️', label: 'Elphaba', image: '/images/elphaba.jpg' },
  { emoji: '❄️', label: 'Elsa', image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Snowflake_macro_photography_1.jpg?width=300' },
  { emoji: '🎭', label: 'Hamilton', image: '/images/hamilton.jpg' },
  { emoji: '🕶️', label: 'Men In Black', image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Ray-Ban_Aviator_sunglasses.jpg?width=300' },
  { emoji: '🐨', label: 'Koalas', image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Koala_climbing_tree.jpg?width=300' },
  { emoji: '🐶', label: 'Beige Cavapoo', image: '/images/beige-cavapoo.webp' },
  { emoji: '🐩', label: 'Beige Labradoodle', image: '/images/beige-labradoodle.webp' },
  { emoji: '🐹', label: 'Lemming', image: '/images/lemming.webp' },
  { emoji: '🥔', label: 'A Furry Potato', image: '/images/furry-potato.webp' },
  { emoji: '🐄', label: 'Smudge (Jellycat Cow)', image: '/images/smudge-cow.jpg' },
  { emoji: '🕺', label: 'Dancer', image: null },
  { emoji: '🩰', label: 'Dance Shoes', image: null },
  { emoji: '🧸', label: 'Ballerina Teddy Bear', image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Tommy_Bear_-_A_Teddy_Bear.jpg?width=300' },
  { emoji: '🐰', label: 'Bunny Teddy Bear', image: '/images/bunny-teddy-bear.webp' },
  { emoji: '🏷️', label: 'Jellycat Logo', image: '/images/jellycat-logo.webp' },
  { emoji: '🐓', label: 'Spurs', image: '/images/spurs.webp' },
  { emoji: '👑', label: 'Crown Hat', image: '/images/crown-hat.jpg' },
  { emoji: '💌', label: 'A + L', image: '/images/a-plus-l.jpg' },
  { emoji: '🏕️', label: "Pinemere's Camp", image: '/images/pinemere-camp.webp' },
  { emoji: '🪑', label: 'Park Bench', image: '/images/park-bench.jpg' },
  { emoji: '📖', label: 'Book', image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Books_in_a_stack_(a_stack_of_books)_-_Flickr_-_austinevan.jpg?width=300' },
  { emoji: '📲', label: 'Kindle', image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Amazon_Kindle_Paperwhite_5_Eleventh_Generation_(C2V2L3)_6-inch_e-reader.jpg?width=300' },
  { emoji: '🥷', label: 'Ninja Warrior Kit', image: '/images/ninja-warrior-kit.jpg' },
  { emoji: '🧪', label: 'Science Kit', image: '/images/science-kit.jpg' },
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
