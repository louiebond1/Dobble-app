"use strict";
// Original country cards. Questions are derived from the same fields that the
// browser illustrates; factual recall is never needed beyond the visible card.
const rows = [
  ["france", "France", "Paris", "Eiffel Tower", "Baguette", "Mediterranean Sea", "blue", 3],
  ["italy", "Italy", "Rome", "Leaning Tower", "Pizza", "Mediterranean Sea", "red", 2],
  ["greece", "Greece", "Athens", "Parthenon", "Olives", "Aegean Sea", "yellow", 4],
  ["spain", "Spain", "Madrid", "Sagrada Familia", "Paella", "Atlantic Ocean", "green", 3],
  ["japan", "Japan", "Tokyo", "Mount Fuji", "Sushi", "Pacific Ocean", "red", 2],
  ["egypt", "Egypt", "Cairo", "Pyramids", "Dates", "Red Sea", "blue", 4],
  ["australia", "Australia", "Canberra", "Sydney Opera House", "Pavlova", "Indian Ocean", "green", 2],
  ["brazil", "Brazil", "Brasília", "Christ the Redeemer", "Pineapple", "Atlantic Ocean", "yellow", 3],
  ["canada", "Canada", "Ottawa", "CN Tower", "Maple syrup", "Pacific Ocean", "red", 4],
  ["india", "India", "New Delhi", "Taj Mahal", "Samosas", "Indian Ocean", "blue", 2],
  ["netherlands", "Netherlands", "Amsterdam", "Windmill", "Gouda cheese", "North Sea", "green", 3],
  ["germany", "Germany", "Berlin", "Brandenburg Gate", "Pretzel", "Baltic Sea", "yellow", 4],
];
const fields = ["capital", "landmark", "food", "water", "shirt", "birds"];
const prompts = ["Which capital city was named?", "Which landmark was shown?", "Which food was shown?", "Which sea or ocean was named?", "What colour was the traveller’s shirt?", "How many birds were in the sky?"];
const countries = rows.map(([id, name, capital, landmark, food, water, shirt, birds]) => {
  const country = { id, name, capital, landmark, food, water, shirt, birds };
  return { id: `country-${id}`, title: name, sky: "day", items: [], country,
    questions: fields.map((field, i) => ({ type: "country", field, text: prompts[i] })) };
});
// Facts are shown verbatim on the study card and used to resolve questions.
// Animal is a wildlife/symbol caption, not a claim of official national status.
const facts = {
  france: ['Rooster', 'Baguette-making is UNESCO heritage.', 'Which bread-making craft had UNESCO recognition?', 'Baguette-making', ['Pizza-making','Sushi-making','Pretzel-making'], 'https://www.elysee.fr/en/french-presidency/the-rooster', 'https://www.culture.gouv.fr/actualites/La-baguette-de-pain-inscrite-au-patrimoine-immateriel-de-l-Unesco'],
  italy: ['Wolf', 'Italy is shaped like a boot.', 'What shape was Italy compared to?', 'Boot', ['Heart','Star','Circle'], 'https://www.italia.it/en/italy/things-to-do/nature/national-parks', 'https://www.italia.it/en'],
  greece: ['Dolphin', 'The ancient Olympics took place at Olympia.', 'Where did the ancient Olympics take place?', 'Olympia', ['Athens','Rome','Sparta'], 'https://ioniandolphinproject.org/species-identification-guide/', 'https://whc.unesco.org/en/list/517/'],
  spain: ['Iberian lynx', 'Flamenco combines song, dance and music.', 'What was the music and dance style called?', 'Flamenco', ['Tango','Samba','Waltz'], 'https://sustainability.spain.info/en/discover-spain/observation-flora-fauna/', 'https://ich.unesco.org/en/RL/flamenco-00363'],
  japan: ['Macaque', 'Mount Fuji is a volcano.', 'What kind of mountain is Mount Fuji?', 'Volcano', ['Glacier','Coral reef','Waterfall'], 'https://www.japan.travel/en/spot/1344/', 'https://www.japan.travel/en/spot/1308/'],
  egypt: ['Camel', 'Pyramids were built as royal tombs.', 'What were the pyramids built as?', 'Royal tombs', ['Markets','Lighthouses','Schools'], 'https://www.experienceegypt.eg/en/attraction-details/154/hop-on-a-camel', 'https://www.experienceegypt.eg/files/Egypt%20Tourism%20Guide-Eng.pdf'],
  australia: ['Kangaroo', 'The Great Barrier Reef is off its coast.', 'Which reef was named?', 'Great Barrier Reef', ['Belize Reef','Red Sea Reef','Andros Reef'], 'https://www.australia.com/en/things-to-do/wildlife/kangaroo-interesting-facts.html', 'https://www.australia.com/en/places/cairns-and-surrounds/guide-to-the-great-barrier-reef.html'],
  brazil: ['Jaguar', 'The jaguar is the largest cat in the Americas.', 'Which region’s largest cat is the jaguar?', 'Americas', ['Europe','Antarctica','Arctic'], 'https://www.visitbrasil.com/en/location/pantanal-en/', 'https://www.visitbrasil.com/en/location/pantanal-en/'],
  canada: ['Beaver', 'The maple leaf on its flag has 11 points.', 'How many points are on the flag’s maple leaf?', '11', ['9','13','15'], 'https://www.canada.ca/en/canadian-heritage/services/official-symbols-canada.html', 'https://www.canada.ca/en/canadian-heritage/services/flag-canada-description.html'],
  india: ['Tiger', 'The Taj Mahal is made of white marble.', 'What stone was the Taj Mahal made from?', 'White marble', ['Red sandstone','Black granite','Limestone'], 'https://www.india.gov.in/explore-india/facts-of-india/national-identity/national-animal', 'https://culture.gov.in/taj-mahal'],
  netherlands: ['Otter', 'Old windmills helped pump water.', 'What did the old windmills help pump?', 'Water', ['Oil','Milk','Honey'], 'https://www.holland.com/global/tourism/getting-around/interests/water-story', 'https://www.holland.com/global/tourism/get-inspired/dutch-icons/windmills-in-the-netherlands'],
  germany: ['Eagle', 'Berlin was once divided by a wall.', 'What once divided Berlin?', 'A wall', ['A canal','A mountain','A desert'], 'https://www.bundestag.de/en/parliament/symbols/eagle', 'https://www.berlin.de/en/attractions-and-sights/3560266-3104052-brandenburg-gate.en.html'],
};
const illustratedCountries = countries.map(card => {
  const [animal, funFact, factQuestion, factAnswer, distractors, ...sources] = facts[card.country.id];
  return { ...card, id: `facts-${card.id}-v1`,
    country: { ...card.country, animal, funFact, factAnswer, art: `/assets/illustrated/${card.country.id}.png` }, sources,
    questions: [
      {type:'country',field:'capital',text:'Which capital city was named?'},
      {type:'country',field:'food',text:'Which food was named on the card?'},
      {type:'country',field:'animal',text:'Which animal was named on the card?'},
      {type:'country',field:'factAnswer',text:factQuestion,options:[factAnswer,...distractors]},
      {type:'country',field:'shirt',text:'What colour was the visitor’s jacket or shirt?'},
      {type:'country',field:'birds',text:'How many pigeons were in the picture?'},
    ] };
});
module.exports = { countries, illustratedCountries };
