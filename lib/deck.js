// 57 personal symbols (n=7 projective-plane construction: 57 cards, 8 symbols/card,
// every two cards share exactly one symbol).
// `image`, when set, is a stable Wikimedia Commons URL shown instead of the emoji
// (fetched by the player's own browser, not this server). Personal symbols (pets,
// in-jokes, specific people/places) have no stock photo and stay emoji-only until
// a real photo is supplied.
const SYMBOLS = [
  { emoji: '🥗', label: 'Caesar Salad', image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Caesar_salad_(2).jpg?width=800' },
  { emoji: '🥯', label: 'Bagels', image: '/images/bagels.jpg' },
  { emoji: '🦃', label: 'Sliced Turkey', image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Turkey_slices_prepared_for_Christmas_dinner.jpg?width=800' },
  { emoji: '🍕', label: 'Pizza', image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Pizza_(1).jpg?width=800' },
  { emoji: '🍝', label: 'Pasta', image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Spaghetti_carbonara.jpg?width=800' },
  { emoji: '🍣', label: 'Sushi', image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Sushi_plate.JPG?width=800' },
  { emoji: '🍨', label: 'Amorino', image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Amorino_Gelato_Flowers.jpg?width=800' },
  { emoji: '🍜', label: 'Wagamama Teriyaki', image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Chicken_teriyaki.jpg?width=800' },
  { emoji: '🧀', label: 'Mac & Cheese', image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Macaroni_and_cheese.jpg?width=800' },
  { emoji: '🛒', label: "Trader Joe's", image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Food_aisle_at_Publix_Super_Market_at_The_Paramount_on_Lake_Eola,_Orlando,_Florida.jpg?width=800' },
  { emoji: '🟢', label: 'Green M&M', image: "https://commons.wikimedia.org/wiki/Special:FilePath/(Green)_M%26M%27s.JPG?width=800" },
  { emoji: '🤍', label: 'Burrata', image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Burrata2.jpg?width=800' },
  { emoji: '🧈', label: 'Parmesan', image: '/images/parmesan.png' },
  { emoji: '🍛', label: 'Butter Chicken (Dishoom)', image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Murgh_Makhani_(Butter_Chicken)_2_(8925280003).jpg?width=800' },
  { emoji: '🍦', label: 'Ice Cream', image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Ice_cream_cone_(cropped).jpg?width=800' },
  { emoji: '🥤', label: 'Diet Coke', image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Generic_Cola_Cans_1980s.jpg?width=800' },
  { emoji: '☕', label: 'Hot Chocolate', image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Chocolate_drink_in_mug.jpg?width=800' },
  { emoji: '🎊', label: 'Multicolour Sprinkles', image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Strawberry_donut_with_sprinkles_(2).jpg?width=800' },
  { emoji: '🥑', label: 'Avocado Toast', image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Avocado_toast.jpg?width=800' },
  { emoji: '🥂', label: 'Hugo Spritz', image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Aperol_Spritz_2014a.jpg?width=800' },
  { emoji: '🧋', label: 'Iced Coffee', image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Iced_coffee_beverages.jpg?width=800' },
  { emoji: '🍰', label: 'Cookies & Cream Cake', image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Strawberry_layer_cake.jpg?width=800' },
  { emoji: '🥡', label: 'Pad Thai', image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Pad_Thai_Noodles_-_Little_Thai,_Brighton_2024-03-21.jpg?width=800' },
  { emoji: '🍭', label: 'Orange Calippo', image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Orange_Calippo.jpg?width=800' },
  { emoji: '🍗', label: "Chicken Tenders (McDonald's)", image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Crispy_Chicken_Strips_-_FotoosVanRobin.jpg?width=800' },
  { emoji: '🏛️', label: 'Colosseum', image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Colosseum,_Rome_(15235081322).jpg?width=800' },
  { emoji: '🚇', label: 'London Underground', image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Underground.svg?width=800' },
  { emoji: '🏙️', label: 'Empire State Building', image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Empire_State_Building,_New_York,_NY.jpg?width=800' },
  { emoji: '🛶', label: 'Venice', image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Gondola_on_the_Grand_Canal,_Venice,_Italy.jpg?width=800' },
  { emoji: '🌉', label: 'Brooklyn Bridge', image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Brooklyn_Bridge_Jun_2014.jpg?width=800' },
  { emoji: '🏞️', label: 'Lake (Montanejos)', image: '/images/lake-montanejos.jpg' },
  { emoji: '✈️', label: 'Plane', image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Airplane_in_flight.jpg?width=800' },
  { emoji: '🐦', label: 'Mockingjay', image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Mimus_polyglottos1.jpg?width=800' },
  { emoji: '🧙‍♀️', label: 'Elphaba', image: '/images/elphaba.jpg' },
  { emoji: '❄️', label: 'Elsa', image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Snowflake_macro_photography_1.jpg?width=800' },
  { emoji: '🎭', label: 'Hamilton', image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Broadway_Theatre_NYC_entrance.jpg?width=800' },
  { emoji: '🕶️', label: 'Men In Black', image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Ray-Ban_Aviator_sunglasses.jpg?width=800' },
  { emoji: '🐨', label: 'Koalas', image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Koala_climbing_tree.jpg?width=800' },
  { emoji: '🐶', label: 'Beige Cavapoo', image: '/images/beige-cavapoo.png' },
  { emoji: '🐩', label: 'Beige Labradoodle', image: null },
  { emoji: '🐹', label: 'Lemming', image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Northern_collared_lemming.jpg?width=800' },
  { emoji: '🥔', label: 'A Furry Potato', image: null },
  { emoji: '🐄', label: 'Smudge (Jellycat Cow)', image: null },
  { emoji: '💃', label: 'Dancer', image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Victoria_Aletta_Ballet_Dancer.jpg?width=800' },
  { emoji: '🩰', label: 'Dance Shoes', image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Russian_ballet_pointe_shoes,_1997,_silk_-_Bata_Shoe_Museum_-_DSC00244.JPG?width=800' },
  { emoji: '🧸', label: 'Ballerina Teddy Bear', image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Tommy_Bear_-_A_Teddy_Bear.jpg?width=800' },
  { emoji: '🐰', label: 'Bunny Teddy Bear', image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Wild_black_Oryctologus_cuniculus.jpg?width=800' },
  { emoji: '🏷️', label: 'Jellycat Logo', image: "https://commons.wikimedia.org/wiki/Special:FilePath/Price_Tag_99+TX_99_cents_+_tax.jpg?width=800" },
  { emoji: '🐓', label: 'Spurs', image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Beautifull_big_cockerel_(5752263978).jpg?width=800' },
  { emoji: '👑', label: 'Crown Hat', image: '/images/crown-hat.jpg' },
  { emoji: '💌', label: 'A + L', image: null },
  { emoji: '🏕️', label: "Pinemere's Camp", image: null },
  { emoji: '🪑', label: 'Park Bench', image: null },
  { emoji: '📖', label: 'Book', image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Books_in_a_stack_(a_stack_of_books)_-_Flickr_-_austinevan.jpg?width=800' },
  { emoji: '📲', label: 'Kindle', image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Amazon_Kindle_Paperwhite_5_Eleventh_Generation_(C2V2L3)_6-inch_e-reader.jpg?width=800' },
  { emoji: '🥷', label: 'Ninja Warrior Kit', image: null },
  { emoji: '🧪', label: 'Science Kit', image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Graduated_Cylinders_and_Beaker_filled_with_Chemical_Compounds.jpg?width=800' },
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
