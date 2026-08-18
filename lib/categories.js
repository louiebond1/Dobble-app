// Category Blitz — shared random letter + a handful of categories, race to
// fill each one with something starting with that letter before time's up.
// Skips Q/X/Z from the letter pool below (too punishing for a fast couples game).
const CATEGORIES = [
  '🍕 Food', '🎬 Movie', '🐾 Animal', '🌍 Country', '👖 Clothing item', '💼 Job',
  '🎵 Song or artist', '🚗 Car brand', '🏖️ Holiday destination', '🍹 Drink',
  '📺 TV show', '🧸 Toy', '⚽ Sport', '🎨 Colour', '🏙️ City', '📚 Book title',
  '🎮 Video game', '🍦 Dessert', '🐶 Pet name', '👗 Fashion brand', '🎭 Celebrity',
  '🏠 Household item', '🌳 Plant or tree', '🎓 School subject', '🧑‍🍳 Restaurant chain',
  '📱 App', '🎉 Party theme', '🏆 Board game', '🚲 Mode of transport', '🧴 Bathroom item',
  '🍫 Chocolate/sweet', '🎃 Halloween costume', '🏝️ Beach essential', '🛋️ Furniture item',
  '🎤 Musical instrument', '👟 Shoe brand', '🍺 Pub snack', '🌦️ Weather word',
  '🧳 Something you\'d pack for a holiday', '🕹️ Toy from your childhood',
];

const LETTER_POOL = 'ABCDEFGHIJKLMNOPRSTUVW'.split('');

module.exports = { CATEGORIES, LETTER_POOL };
