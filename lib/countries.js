// The 197 "Countries of the World" quiz set — 193 UN member states plus
// Vatican City, Palestine, Taiwan, and Kosovo (the same list Sporcle's
// Countries of the World quiz uses). Sourced from the mledoze/countries
// public dataset (name + centroid lat/lng + common alternate spellings +
// continent), trimmed to Latin-script aliases of 3+ characters plus a
// short hand-picked list of everyday nicknames (UK, UAE, CAR, PNG,
// Bosnia, ...) that dataset doesn't carry. lat/lng are simple centroids,
// used to place each country's marker on the equirectangular map. region
// is one of Africa/Americas/Asia/Europe/Oceania, used by Learn mode's
// continent filter.

const COUNTRIES = [
  {
    "id": "afg",
    "name": "Afghanistan",
    "aliases": [
      "Islamic Republic of Afghanistan"
    ],
    "lat": 33,
    "lng": 65,
    "region": "Asia"
  },
  {
    "id": "alb",
    "name": "Albania",
    "aliases": [
      "Republic of Albania",
      "Shqipëri",
      "Shqipëria",
      "Shqipnia"
    ],
    "lat": 41,
    "lng": 20,
    "region": "Europe"
  },
  {
    "id": "dza",
    "name": "Algeria",
    "aliases": [
      "People's Democratic Republic of Algeria",
      "Dzayer",
      "Algérie"
    ],
    "lat": 28,
    "lng": 3,
    "region": "Africa"
  },
  {
    "id": "and",
    "name": "Andorra",
    "aliases": [
      "Principality of Andorra",
      "Principat d'Andorra"
    ],
    "lat": 42.5,
    "lng": 1.5,
    "region": "Europe"
  },
  {
    "id": "ago",
    "name": "Angola",
    "aliases": [
      "Republic of Angola",
      "República de Angola"
    ],
    "lat": -12.5,
    "lng": 18.5,
    "region": "Africa"
  },
  {
    "id": "atg",
    "name": "Antigua and Barbuda",
    "aliases": [],
    "lat": 17.05,
    "lng": -61.8,
    "region": "Americas"
  },
  {
    "id": "arg",
    "name": "Argentina",
    "aliases": [
      "Argentine Republic",
      "República Argentina"
    ],
    "lat": -34,
    "lng": -64,
    "region": "Americas"
  },
  {
    "id": "arm",
    "name": "Armenia",
    "aliases": [
      "Republic of Armenia",
      "Hayastan"
    ],
    "lat": 40,
    "lng": 45,
    "region": "Asia"
  },
  {
    "id": "aus",
    "name": "Australia",
    "aliases": [
      "Commonwealth of Australia"
    ],
    "lat": -27,
    "lng": 133,
    "region": "Oceania"
  },
  {
    "id": "aut",
    "name": "Austria",
    "aliases": [
      "Republic of Austria",
      "Osterreich",
      "Oesterreich"
    ],
    "lat": 47.333,
    "lng": 13.333,
    "region": "Europe"
  },
  {
    "id": "aze",
    "name": "Azerbaijan",
    "aliases": [
      "Republic of Azerbaijan"
    ],
    "lat": 40.5,
    "lng": 47.5,
    "region": "Asia"
  },
  {
    "id": "bhs",
    "name": "Bahamas",
    "aliases": [
      "Commonwealth of the Bahamas",
      "The Bahamas"
    ],
    "lat": 24.25,
    "lng": -76,
    "region": "Americas"
  },
  {
    "id": "bhr",
    "name": "Bahrain",
    "aliases": [
      "Kingdom of Bahrain"
    ],
    "lat": 26,
    "lng": 50.55,
    "region": "Asia"
  },
  {
    "id": "bgd",
    "name": "Bangladesh",
    "aliases": [
      "People's Republic of Bangladesh",
      "Gônôprôjatôntri Bangladesh"
    ],
    "lat": 24,
    "lng": 90,
    "region": "Asia"
  },
  {
    "id": "brb",
    "name": "Barbados",
    "aliases": [],
    "lat": 13.167,
    "lng": -59.533,
    "region": "Americas"
  },
  {
    "id": "blr",
    "name": "Belarus",
    "aliases": [
      "Republic of Belarus"
    ],
    "lat": 53,
    "lng": 28,
    "region": "Europe"
  },
  {
    "id": "bel",
    "name": "Belgium",
    "aliases": [
      "Kingdom of Belgium",
      "België",
      "Belgie",
      "Belgien",
      "Belgique",
      "Koninkrijk België",
      "Royaume de Belgique",
      "Königreich Belgien"
    ],
    "lat": 50.833,
    "lng": 4,
    "region": "Europe"
  },
  {
    "id": "blz",
    "name": "Belize",
    "aliases": [],
    "lat": 17.25,
    "lng": -88.75,
    "region": "Americas"
  },
  {
    "id": "ben",
    "name": "Benin",
    "aliases": [
      "Republic of Benin",
      "République du Bénin"
    ],
    "lat": 9.5,
    "lng": 2.25,
    "region": "Africa"
  },
  {
    "id": "btn",
    "name": "Bhutan",
    "aliases": [
      "Kingdom of Bhutan"
    ],
    "lat": 27.5,
    "lng": 90.5,
    "region": "Asia"
  },
  {
    "id": "bol",
    "name": "Bolivia",
    "aliases": [
      "Plurinational State of Bolivia",
      "Buliwya",
      "Wuliwya",
      "Bolivia, Plurinational State of",
      "Estado Plurinacional de Bolivia",
      "Buliwya Mamallaqta",
      "Wuliwya Suyu",
      "Tetã Volívia"
    ],
    "lat": -17,
    "lng": -65,
    "region": "Americas"
  },
  {
    "id": "bih",
    "name": "Bosnia and Herzegovina",
    "aliases": [
      "Bosnia-Herzegovina",
      "Bosnia"
    ],
    "lat": 44,
    "lng": 18,
    "region": "Europe"
  },
  {
    "id": "bwa",
    "name": "Botswana",
    "aliases": [
      "Republic of Botswana",
      "Lefatshe la Botswana"
    ],
    "lat": -22,
    "lng": 24,
    "region": "Africa"
  },
  {
    "id": "bra",
    "name": "Brazil",
    "aliases": [
      "Federative Republic of Brazil",
      "Brasil",
      "República Federativa do Brasil"
    ],
    "lat": -10,
    "lng": -55,
    "region": "Americas"
  },
  {
    "id": "brn",
    "name": "Brunei",
    "aliases": [
      "Nation of Brunei, Abode of Peace",
      "Brunei Darussalam",
      "Nation of Brunei",
      "the Abode of Peace"
    ],
    "lat": 4.5,
    "lng": 114.667,
    "region": "Asia"
  },
  {
    "id": "bgr",
    "name": "Bulgaria",
    "aliases": [
      "Republic of Bulgaria"
    ],
    "lat": 43,
    "lng": 25,
    "region": "Europe"
  },
  {
    "id": "bfa",
    "name": "Burkina Faso",
    "aliases": [],
    "lat": 13,
    "lng": -2,
    "region": "Africa"
  },
  {
    "id": "bdi",
    "name": "Burundi",
    "aliases": [
      "Republic of Burundi",
      "Republika y'Uburundi",
      "République du Burundi"
    ],
    "lat": -3.5,
    "lng": 30,
    "region": "Africa"
  },
  {
    "id": "khm",
    "name": "Cambodia",
    "aliases": [
      "Kingdom of Cambodia"
    ],
    "lat": 13,
    "lng": 105,
    "region": "Asia"
  },
  {
    "id": "cmr",
    "name": "Cameroon",
    "aliases": [
      "Republic of Cameroon",
      "République du Cameroun"
    ],
    "lat": 6,
    "lng": 12,
    "region": "Africa"
  },
  {
    "id": "can",
    "name": "Canada",
    "aliases": [],
    "lat": 60,
    "lng": -95,
    "region": "Americas"
  },
  {
    "id": "cpv",
    "name": "Cape Verde",
    "aliases": [
      "Republic of Cabo Verde",
      "República de Cabo Verde"
    ],
    "lat": 16,
    "lng": -24,
    "region": "Africa"
  },
  {
    "id": "caf",
    "name": "Central African Republic",
    "aliases": [
      "République centrafricaine",
      "CAR"
    ],
    "lat": 7,
    "lng": 21,
    "region": "Africa"
  },
  {
    "id": "tcd",
    "name": "Chad",
    "aliases": [
      "Republic of Chad",
      "Tchad",
      "République du Tchad"
    ],
    "lat": 15,
    "lng": 19,
    "region": "Africa"
  },
  {
    "id": "chl",
    "name": "Chile",
    "aliases": [
      "Republic of Chile",
      "República de Chile"
    ],
    "lat": -30,
    "lng": -71,
    "region": "Americas"
  },
  {
    "id": "chn",
    "name": "China",
    "aliases": [
      "People's Republic of China",
      "Zhongguo",
      "Zhonghua"
    ],
    "lat": 35,
    "lng": 105,
    "region": "Asia"
  },
  {
    "id": "col",
    "name": "Colombia",
    "aliases": [
      "Republic of Colombia",
      "República de Colombia"
    ],
    "lat": 4,
    "lng": -72,
    "region": "Americas"
  },
  {
    "id": "com",
    "name": "Comoros",
    "aliases": [
      "Union of the Comoros",
      "Union des Comores",
      "Udzima wa Komori"
    ],
    "lat": -12.167,
    "lng": 44.25,
    "region": "Africa"
  },
  {
    "id": "cog",
    "name": "Congo",
    "aliases": [
      "Republic of the Congo",
      "Congo-Brazzaville"
    ],
    "lat": -1,
    "lng": 15,
    "region": "Africa"
  },
  {
    "id": "cri",
    "name": "Costa Rica",
    "aliases": [
      "Republic of Costa Rica",
      "República de Costa Rica"
    ],
    "lat": 10,
    "lng": -84,
    "region": "Americas"
  },
  {
    "id": "hrv",
    "name": "Croatia",
    "aliases": [
      "Republic of Croatia",
      "Hrvatska",
      "Republika Hrvatska"
    ],
    "lat": 45.167,
    "lng": 15.5,
    "region": "Europe"
  },
  {
    "id": "cub",
    "name": "Cuba",
    "aliases": [
      "Republic of Cuba",
      "República de Cuba"
    ],
    "lat": 21.5,
    "lng": -80,
    "region": "Americas"
  },
  {
    "id": "cyp",
    "name": "Cyprus",
    "aliases": [
      "Republic of Cyprus",
      "Kýpros"
    ],
    "lat": 35,
    "lng": 33,
    "region": "Europe"
  },
  {
    "id": "cze",
    "name": "Czechia",
    "aliases": [
      "Czech Republic"
    ],
    "lat": 49.75,
    "lng": 15.5,
    "region": "Europe"
  },
  {
    "id": "dnk",
    "name": "Denmark",
    "aliases": [
      "Kingdom of Denmark",
      "Danmark",
      "Kongeriget Danmark"
    ],
    "lat": 56,
    "lng": 10,
    "region": "Europe"
  },
  {
    "id": "dji",
    "name": "Djibouti",
    "aliases": [
      "Republic of Djibouti",
      "Jabuuti",
      "Gabuuti",
      "République de Djibouti",
      "Gabuutih Ummuuno",
      "Jamhuuriyadda Jabuuti"
    ],
    "lat": 11.5,
    "lng": 43,
    "region": "Africa"
  },
  {
    "id": "dma",
    "name": "Dominica",
    "aliases": [
      "Commonwealth of Dominica",
      "Dominique"
    ],
    "lat": 15.417,
    "lng": -61.333,
    "region": "Americas"
  },
  {
    "id": "dom",
    "name": "Dominican Republic",
    "aliases": [],
    "lat": 19,
    "lng": -70.667,
    "region": "Americas"
  },
  {
    "id": "cod",
    "name": "DR Congo",
    "aliases": [
      "Democratic Republic of the Congo",
      "Congo-Kinshasa",
      "Congo, the Democratic Republic of the",
      "Democratic Republic of Congo",
      "DRC"
    ],
    "lat": 0,
    "lng": 25,
    "region": "Africa"
  },
  {
    "id": "ecu",
    "name": "Ecuador",
    "aliases": [
      "Republic of Ecuador",
      "República del Ecuador"
    ],
    "lat": -2,
    "lng": -77.5,
    "region": "Americas"
  },
  {
    "id": "egy",
    "name": "Egypt",
    "aliases": [
      "Arab Republic of Egypt"
    ],
    "lat": 27,
    "lng": 30,
    "region": "Africa"
  },
  {
    "id": "slv",
    "name": "El Salvador",
    "aliases": [
      "Republic of El Salvador",
      "República de El Salvador"
    ],
    "lat": 13.833,
    "lng": -88.917,
    "region": "Americas"
  },
  {
    "id": "gnq",
    "name": "Equatorial Guinea",
    "aliases": [
      "Republic of Equatorial Guinea",
      "República de Guinea Ecuatorial",
      "République de Guinée équatoriale",
      "República da Guiné Equatorial"
    ],
    "lat": 2,
    "lng": 10,
    "region": "Africa"
  },
  {
    "id": "eri",
    "name": "Eritrea",
    "aliases": [
      "State of Eritrea",
      "Dawlat Iritriyá"
    ],
    "lat": 15,
    "lng": 39,
    "region": "Africa"
  },
  {
    "id": "est",
    "name": "Estonia",
    "aliases": [
      "Republic of Estonia",
      "Eesti",
      "Eesti Vabariik"
    ],
    "lat": 59,
    "lng": 26,
    "region": "Europe"
  },
  {
    "id": "swz",
    "name": "Eswatini",
    "aliases": [
      "Kingdom of Eswatini",
      "Swaziland",
      "weSwatini",
      "Swatini",
      "Ngwane",
      "Umbuso weSwatini"
    ],
    "lat": -26.5,
    "lng": 31.5,
    "region": "Africa"
  },
  {
    "id": "eth",
    "name": "Ethiopia",
    "aliases": [
      "Federal Democratic Republic of Ethiopia"
    ],
    "lat": 8,
    "lng": 38,
    "region": "Africa"
  },
  {
    "id": "fji",
    "name": "Fiji",
    "aliases": [
      "Republic of Fiji",
      "Viti",
      "Matanitu ko Viti"
    ],
    "lat": -18,
    "lng": 175,
    "region": "Oceania"
  },
  {
    "id": "fin",
    "name": "Finland",
    "aliases": [
      "Republic of Finland",
      "Suomi",
      "Suomen tasavalta",
      "Republiken Finland"
    ],
    "lat": 64,
    "lng": 26,
    "region": "Europe"
  },
  {
    "id": "fra",
    "name": "France",
    "aliases": [
      "French Republic",
      "République française"
    ],
    "lat": 46,
    "lng": 2,
    "region": "Europe"
  },
  {
    "id": "gab",
    "name": "Gabon",
    "aliases": [
      "Gabonese Republic",
      "République Gabonaise"
    ],
    "lat": -1,
    "lng": 11.75,
    "region": "Africa"
  },
  {
    "id": "gmb",
    "name": "Gambia",
    "aliases": [
      "Republic of the Gambia"
    ],
    "lat": 13.467,
    "lng": -16.567,
    "region": "Africa"
  },
  {
    "id": "geo",
    "name": "Georgia",
    "aliases": [
      "Sakartvelo"
    ],
    "lat": 42,
    "lng": 43.5,
    "region": "Asia"
  },
  {
    "id": "deu",
    "name": "Germany",
    "aliases": [
      "Federal Republic of Germany",
      "Bundesrepublik Deutschland"
    ],
    "lat": 51,
    "lng": 9,
    "region": "Europe"
  },
  {
    "id": "gha",
    "name": "Ghana",
    "aliases": [
      "Republic of Ghana"
    ],
    "lat": 8,
    "lng": -2,
    "region": "Africa"
  },
  {
    "id": "grc",
    "name": "Greece",
    "aliases": [
      "Hellenic Republic",
      "Elláda"
    ],
    "lat": 39,
    "lng": 22,
    "region": "Europe"
  },
  {
    "id": "grd",
    "name": "Grenada",
    "aliases": [],
    "lat": 12.117,
    "lng": -61.667,
    "region": "Americas"
  },
  {
    "id": "gtm",
    "name": "Guatemala",
    "aliases": [
      "Republic of Guatemala"
    ],
    "lat": 15.5,
    "lng": -90.25,
    "region": "Americas"
  },
  {
    "id": "gin",
    "name": "Guinea",
    "aliases": [
      "Republic of Guinea",
      "République de Guinée"
    ],
    "lat": 11,
    "lng": -10,
    "region": "Africa"
  },
  {
    "id": "gnb",
    "name": "Guinea-Bissau",
    "aliases": [
      "Republic of Guinea-Bissau",
      "República da Guiné-Bissau"
    ],
    "lat": 12,
    "lng": -15,
    "region": "Africa"
  },
  {
    "id": "guy",
    "name": "Guyana",
    "aliases": [
      "Co-operative Republic of Guyana"
    ],
    "lat": 5,
    "lng": -59,
    "region": "Americas"
  },
  {
    "id": "hti",
    "name": "Haiti",
    "aliases": [
      "Republic of Haiti",
      "République d'Haïti",
      "Repiblik Ayiti"
    ],
    "lat": 19,
    "lng": -72.417,
    "region": "Americas"
  },
  {
    "id": "hnd",
    "name": "Honduras",
    "aliases": [
      "Republic of Honduras",
      "República de Honduras"
    ],
    "lat": 15,
    "lng": -86.5,
    "region": "Americas"
  },
  {
    "id": "hun",
    "name": "Hungary",
    "aliases": [],
    "lat": 47,
    "lng": 20,
    "region": "Europe"
  },
  {
    "id": "isl",
    "name": "Iceland",
    "aliases": [
      "Island",
      "Republic of Iceland",
      "Lýðveldið Ísland"
    ],
    "lat": 65,
    "lng": -18,
    "region": "Europe"
  },
  {
    "id": "ind",
    "name": "India",
    "aliases": [
      "Republic of India",
      "Bharat Ganrajya"
    ],
    "lat": 20,
    "lng": 77,
    "region": "Asia"
  },
  {
    "id": "idn",
    "name": "Indonesia",
    "aliases": [
      "Republic of Indonesia",
      "Republik Indonesia"
    ],
    "lat": -5,
    "lng": 120,
    "region": "Asia"
  },
  {
    "id": "irn",
    "name": "Iran",
    "aliases": [
      "Islamic Republic of Iran",
      "Iran, Islamic Republic of"
    ],
    "lat": 32,
    "lng": 53,
    "region": "Asia"
  },
  {
    "id": "irq",
    "name": "Iraq",
    "aliases": [
      "Republic of Iraq"
    ],
    "lat": 33,
    "lng": 44,
    "region": "Asia"
  },
  {
    "id": "irl",
    "name": "Ireland",
    "aliases": [
      "Republic of Ireland",
      "Éire",
      "Poblacht na hÉireann"
    ],
    "lat": 53,
    "lng": -8,
    "region": "Europe"
  },
  {
    "id": "isr",
    "name": "Israel",
    "aliases": [
      "State of Israel"
    ],
    "lat": 31.47,
    "lng": 35.13,
    "region": "Asia"
  },
  {
    "id": "ita",
    "name": "Italy",
    "aliases": [
      "Italian Republic",
      "Repubblica italiana"
    ],
    "lat": 42.833,
    "lng": 12.833,
    "region": "Europe"
  },
  {
    "id": "civ",
    "name": "Ivory Coast",
    "aliases": [
      "Republic of Côte d'Ivoire",
      "Côte d'Ivoire",
      "Cote d'Ivoire",
      "République de Côte d'Ivoire"
    ],
    "lat": 8,
    "lng": -5,
    "region": "Africa"
  },
  {
    "id": "jam",
    "name": "Jamaica",
    "aliases": [],
    "lat": 18.25,
    "lng": -77.5,
    "region": "Americas"
  },
  {
    "id": "jpn",
    "name": "Japan",
    "aliases": [
      "Nippon",
      "Nihon"
    ],
    "lat": 36,
    "lng": 138,
    "region": "Asia"
  },
  {
    "id": "jor",
    "name": "Jordan",
    "aliases": [
      "Hashemite Kingdom of Jordan"
    ],
    "lat": 31,
    "lng": 36,
    "region": "Asia"
  },
  {
    "id": "kaz",
    "name": "Kazakhstan",
    "aliases": [
      "Republic of Kazakhstan",
      "Qazaqstan",
      "Respublika Kazakhstan"
    ],
    "lat": 48,
    "lng": 68,
    "region": "Asia"
  },
  {
    "id": "ken",
    "name": "Kenya",
    "aliases": [
      "Republic of Kenya",
      "Jamhuri ya Kenya"
    ],
    "lat": 1,
    "lng": 38,
    "region": "Africa"
  },
  {
    "id": "kir",
    "name": "Kiribati",
    "aliases": [
      "Independent and Sovereign Republic of Kiribati",
      "Republic of Kiribati",
      "Ribaberiki Kiribati"
    ],
    "lat": 1.417,
    "lng": 173,
    "region": "Oceania"
  },
  {
    "id": "unk",
    "name": "Kosovo",
    "aliases": [
      "Republic of Kosovo"
    ],
    "lat": 42.667,
    "lng": 21.167,
    "region": "Europe"
  },
  {
    "id": "kwt",
    "name": "Kuwait",
    "aliases": [
      "State of Kuwait",
      "Dawlat al-Kuwait"
    ],
    "lat": 29.5,
    "lng": 45.75,
    "region": "Asia"
  },
  {
    "id": "kgz",
    "name": "Kyrgyzstan",
    "aliases": [
      "Kyrgyz Republic",
      "Kyrgyz Respublikasy"
    ],
    "lat": 41,
    "lng": 75,
    "region": "Asia"
  },
  {
    "id": "lao",
    "name": "Laos",
    "aliases": [
      "Lao People's Democratic Republic",
      "Lao",
      "Sathalanalat Paxathipatai Paxaxon Lao"
    ],
    "lat": 18,
    "lng": 105,
    "region": "Asia"
  },
  {
    "id": "lva",
    "name": "Latvia",
    "aliases": [
      "Republic of Latvia",
      "Latvijas Republika"
    ],
    "lat": 57,
    "lng": 25,
    "region": "Europe"
  },
  {
    "id": "lbn",
    "name": "Lebanon",
    "aliases": [
      "Lebanese Republic"
    ],
    "lat": 33.833,
    "lng": 35.833,
    "region": "Asia"
  },
  {
    "id": "lso",
    "name": "Lesotho",
    "aliases": [
      "Kingdom of Lesotho",
      "Muso oa Lesotho"
    ],
    "lat": -29.5,
    "lng": 28.5,
    "region": "Africa"
  },
  {
    "id": "lbr",
    "name": "Liberia",
    "aliases": [
      "Republic of Liberia"
    ],
    "lat": 6.5,
    "lng": -9.5,
    "region": "Africa"
  },
  {
    "id": "lby",
    "name": "Libya",
    "aliases": [
      "State of Libya",
      "Dawlat Libya"
    ],
    "lat": 25,
    "lng": 17,
    "region": "Africa"
  },
  {
    "id": "lie",
    "name": "Liechtenstein",
    "aliases": [
      "Principality of Liechtenstein",
      "Fürstentum Liechtenstein"
    ],
    "lat": 47.267,
    "lng": 9.533,
    "region": "Europe"
  },
  {
    "id": "ltu",
    "name": "Lithuania",
    "aliases": [
      "Republic of Lithuania",
      "Lietuvos Respublika"
    ],
    "lat": 56,
    "lng": 24,
    "region": "Europe"
  },
  {
    "id": "lux",
    "name": "Luxembourg",
    "aliases": [
      "Grand Duchy of Luxembourg",
      "Grand-Duché de Luxembourg",
      "Großherzogtum Luxemburg",
      "Groussherzogtum Lëtzebuerg"
    ],
    "lat": 49.75,
    "lng": 6.167,
    "region": "Europe"
  },
  {
    "id": "mdg",
    "name": "Madagascar",
    "aliases": [
      "Republic of Madagascar",
      "Repoblikan'i Madagasikara",
      "République de Madagascar"
    ],
    "lat": -20,
    "lng": 47,
    "region": "Africa"
  },
  {
    "id": "mwi",
    "name": "Malawi",
    "aliases": [
      "Republic of Malawi"
    ],
    "lat": -13.5,
    "lng": 34,
    "region": "Africa"
  },
  {
    "id": "mys",
    "name": "Malaysia",
    "aliases": [],
    "lat": 2.5,
    "lng": 112.5,
    "region": "Asia"
  },
  {
    "id": "mdv",
    "name": "Maldives",
    "aliases": [
      "Republic of the Maldives",
      "Maldive Islands",
      "Dhivehi Raajjeyge Jumhooriyya"
    ],
    "lat": 3.25,
    "lng": 73,
    "region": "Asia"
  },
  {
    "id": "mli",
    "name": "Mali",
    "aliases": [
      "Republic of Mali",
      "République du Mali"
    ],
    "lat": 17,
    "lng": -4,
    "region": "Africa"
  },
  {
    "id": "mlt",
    "name": "Malta",
    "aliases": [
      "Republic of Malta",
      "Repubblika ta' Malta"
    ],
    "lat": 35.833,
    "lng": 14.583,
    "region": "Europe"
  },
  {
    "id": "mhl",
    "name": "Marshall Islands",
    "aliases": [
      "Republic of the Marshall Islands"
    ],
    "lat": 9,
    "lng": 168,
    "region": "Oceania"
  },
  {
    "id": "mrt",
    "name": "Mauritania",
    "aliases": [
      "Islamic Republic of Mauritania"
    ],
    "lat": 20,
    "lng": -12,
    "region": "Africa"
  },
  {
    "id": "mus",
    "name": "Mauritius",
    "aliases": [
      "Republic of Mauritius",
      "République de Maurice"
    ],
    "lat": -20.283,
    "lng": 57.55,
    "region": "Africa"
  },
  {
    "id": "mex",
    "name": "Mexico",
    "aliases": [
      "United Mexican States",
      "Mexicanos",
      "Estados Unidos Mexicanos"
    ],
    "lat": 23,
    "lng": -102,
    "region": "Americas"
  },
  {
    "id": "fsm",
    "name": "Micronesia",
    "aliases": [
      "Federated States of Micronesia",
      "Micronesia, Federated States of"
    ],
    "lat": 6.917,
    "lng": 158.25,
    "region": "Oceania"
  },
  {
    "id": "mda",
    "name": "Moldova",
    "aliases": [
      "Republic of Moldova",
      "Moldova, Republic of",
      "Republica Moldova"
    ],
    "lat": 47,
    "lng": 29,
    "region": "Europe"
  },
  {
    "id": "mco",
    "name": "Monaco",
    "aliases": [
      "Principality of Monaco",
      "Principauté de Monaco"
    ],
    "lat": 43.733,
    "lng": 7.4,
    "region": "Europe"
  },
  {
    "id": "mng",
    "name": "Mongolia",
    "aliases": [],
    "lat": 46,
    "lng": 105,
    "region": "Asia"
  },
  {
    "id": "mne",
    "name": "Montenegro",
    "aliases": [
      "Crna Gora"
    ],
    "lat": 42.5,
    "lng": 19.3,
    "region": "Europe"
  },
  {
    "id": "mar",
    "name": "Morocco",
    "aliases": [
      "Kingdom of Morocco"
    ],
    "lat": 32,
    "lng": -5,
    "region": "Africa"
  },
  {
    "id": "moz",
    "name": "Mozambique",
    "aliases": [
      "Republic of Mozambique",
      "República de Moçambique"
    ],
    "lat": -18.25,
    "lng": 35,
    "region": "Africa"
  },
  {
    "id": "mmr",
    "name": "Myanmar",
    "aliases": [
      "Republic of the Union of Myanmar",
      "Burma"
    ],
    "lat": 22,
    "lng": 98,
    "region": "Asia"
  },
  {
    "id": "nam",
    "name": "Namibia",
    "aliases": [
      "Republic of Namibia",
      "Namibië"
    ],
    "lat": -22,
    "lng": 17,
    "region": "Africa"
  },
  {
    "id": "nru",
    "name": "Nauru",
    "aliases": [
      "Republic of Nauru",
      "Naoero",
      "Pleasant Island",
      "Ripublik Naoero"
    ],
    "lat": -0.533,
    "lng": 166.917,
    "region": "Oceania"
  },
  {
    "id": "npl",
    "name": "Nepal",
    "aliases": [
      "Federal Democratic Republic of Nepal"
    ],
    "lat": 28,
    "lng": 84,
    "region": "Asia"
  },
  {
    "id": "nld",
    "name": "Netherlands",
    "aliases": [
      "Kingdom of the Netherlands",
      "Holland",
      "Nederland",
      "The Netherlands"
    ],
    "lat": 52.5,
    "lng": 5.75,
    "region": "Europe"
  },
  {
    "id": "nzl",
    "name": "New Zealand",
    "aliases": [
      "Aotearoa"
    ],
    "lat": -41,
    "lng": 174,
    "region": "Oceania"
  },
  {
    "id": "nic",
    "name": "Nicaragua",
    "aliases": [
      "Republic of Nicaragua",
      "República de Nicaragua"
    ],
    "lat": 13,
    "lng": -85,
    "region": "Americas"
  },
  {
    "id": "ner",
    "name": "Niger",
    "aliases": [
      "Republic of Niger",
      "Nijar"
    ],
    "lat": 16,
    "lng": 8,
    "region": "Africa"
  },
  {
    "id": "nga",
    "name": "Nigeria",
    "aliases": [
      "Federal Republic of Nigeria",
      "Nijeriya",
      "Naíjíríà"
    ],
    "lat": 10,
    "lng": 8,
    "region": "Africa"
  },
  {
    "id": "prk",
    "name": "North Korea",
    "aliases": [
      "Democratic People's Republic of Korea",
      "DPRK",
      "Korea, Democratic People's Republic of",
      "Korea North"
    ],
    "lat": 40,
    "lng": 127,
    "region": "Asia"
  },
  {
    "id": "mkd",
    "name": "North Macedonia",
    "aliases": [
      "Republic of North Macedonia",
      "The former Yugoslav Republic of Macedonia",
      "Macedonia, The Former Yugoslav Republic of",
      "Macedonia",
      "FYROM"
    ],
    "lat": 41.833,
    "lng": 22,
    "region": "Europe"
  },
  {
    "id": "nor",
    "name": "Norway",
    "aliases": [
      "Kingdom of Norway",
      "Norge",
      "Noreg",
      "Kongeriket Norge",
      "Kongeriket Noreg"
    ],
    "lat": 62,
    "lng": 10,
    "region": "Europe"
  },
  {
    "id": "omn",
    "name": "Oman",
    "aliases": [
      "Sultanate of Oman"
    ],
    "lat": 21,
    "lng": 57,
    "region": "Asia"
  },
  {
    "id": "pak",
    "name": "Pakistan",
    "aliases": [
      "Islamic Republic of Pakistan"
    ],
    "lat": 30,
    "lng": 70,
    "region": "Asia"
  },
  {
    "id": "plw",
    "name": "Palau",
    "aliases": [
      "Republic of Palau",
      "Beluu er a Belau"
    ],
    "lat": 7.5,
    "lng": 134.5,
    "region": "Oceania"
  },
  {
    "id": "pse",
    "name": "Palestine",
    "aliases": [
      "State of Palestine",
      "Palestine, State of"
    ],
    "lat": 31.9,
    "lng": 35.2,
    "region": "Asia"
  },
  {
    "id": "pan",
    "name": "Panama",
    "aliases": [
      "Republic of Panama",
      "República de Panamá"
    ],
    "lat": 9,
    "lng": -80,
    "region": "Americas"
  },
  {
    "id": "png",
    "name": "Papua New Guinea",
    "aliases": [
      "Independent State of Papua New Guinea",
      "Independen Stet bilong Papua Niugini",
      "PNG"
    ],
    "lat": -6,
    "lng": 147,
    "region": "Oceania"
  },
  {
    "id": "pry",
    "name": "Paraguay",
    "aliases": [
      "Republic of Paraguay",
      "República del Paraguay",
      "Tetã Paraguái"
    ],
    "lat": -23,
    "lng": -58,
    "region": "Americas"
  },
  {
    "id": "per",
    "name": "Peru",
    "aliases": [
      "Republic of Peru",
      "República del Perú"
    ],
    "lat": -10,
    "lng": -76,
    "region": "Americas"
  },
  {
    "id": "phl",
    "name": "Philippines",
    "aliases": [
      "Republic of the Philippines",
      "Repúblika ng Pilipinas"
    ],
    "lat": 13,
    "lng": 122,
    "region": "Asia"
  },
  {
    "id": "pol",
    "name": "Poland",
    "aliases": [
      "Republic of Poland",
      "Rzeczpospolita Polska"
    ],
    "lat": 52,
    "lng": 20,
    "region": "Europe"
  },
  {
    "id": "prt",
    "name": "Portugal",
    "aliases": [
      "Portuguese Republic",
      "Portuguesa",
      "República Portuguesa"
    ],
    "lat": 39.5,
    "lng": -8,
    "region": "Europe"
  },
  {
    "id": "qat",
    "name": "Qatar",
    "aliases": [
      "State of Qatar"
    ],
    "lat": 25.5,
    "lng": 51.25,
    "region": "Asia"
  },
  {
    "id": "rou",
    "name": "Romania",
    "aliases": [
      "Rumania",
      "Roumania",
      "România"
    ],
    "lat": 46,
    "lng": 25,
    "region": "Europe"
  },
  {
    "id": "rus",
    "name": "Russia",
    "aliases": [
      "Russian Federation"
    ],
    "lat": 60,
    "lng": 100,
    "region": "Europe"
  },
  {
    "id": "rwa",
    "name": "Rwanda",
    "aliases": [
      "Republic of Rwanda",
      "Repubulika y'u Rwanda",
      "République du Rwanda"
    ],
    "lat": -2,
    "lng": 30,
    "region": "Africa"
  },
  {
    "id": "kna",
    "name": "Saint Kitts and Nevis",
    "aliases": [
      "Federation of Saint Christopher and Nevis"
    ],
    "lat": 17.333,
    "lng": -62.75,
    "region": "Americas"
  },
  {
    "id": "lca",
    "name": "Saint Lucia",
    "aliases": [],
    "lat": 13.883,
    "lng": -60.967,
    "region": "Americas"
  },
  {
    "id": "vct",
    "name": "Saint Vincent and the Grenadines",
    "aliases": [],
    "lat": 13.25,
    "lng": -61.2,
    "region": "Americas"
  },
  {
    "id": "wsm",
    "name": "Samoa",
    "aliases": [
      "Independent State of Samoa"
    ],
    "lat": -13.583,
    "lng": -172.333,
    "region": "Oceania"
  },
  {
    "id": "smr",
    "name": "San Marino",
    "aliases": [
      "Most Serene Republic of San Marino",
      "Republic of San Marino",
      "Repubblica di San Marino"
    ],
    "lat": 43.767,
    "lng": 12.417,
    "region": "Europe"
  },
  {
    "id": "stp",
    "name": "São Tomé and Príncipe",
    "aliases": [
      "Democratic Republic of São Tomé and Príncipe",
      "Sao Tome and Principe",
      "República Democrática de São Tomé e Príncipe"
    ],
    "lat": 1,
    "lng": 7,
    "region": "Africa"
  },
  {
    "id": "sau",
    "name": "Saudi Arabia",
    "aliases": [
      "Kingdom of Saudi Arabia",
      "Saudi"
    ],
    "lat": 25,
    "lng": 45,
    "region": "Asia"
  },
  {
    "id": "sen",
    "name": "Senegal",
    "aliases": [
      "Republic of Senegal",
      "République du Sénégal"
    ],
    "lat": 14,
    "lng": -14,
    "region": "Africa"
  },
  {
    "id": "srb",
    "name": "Serbia",
    "aliases": [
      "Republic of Serbia",
      "Srbija",
      "Republika Srbija"
    ],
    "lat": 44,
    "lng": 21,
    "region": "Europe"
  },
  {
    "id": "syc",
    "name": "Seychelles",
    "aliases": [
      "Republic of Seychelles",
      "Repiblik Sesel",
      "République des Seychelles"
    ],
    "lat": -4.583,
    "lng": 55.667,
    "region": "Africa"
  },
  {
    "id": "sle",
    "name": "Sierra Leone",
    "aliases": [
      "Republic of Sierra Leone"
    ],
    "lat": 8.5,
    "lng": -11.5,
    "region": "Africa"
  },
  {
    "id": "sgp",
    "name": "Singapore",
    "aliases": [
      "Republic of Singapore",
      "Singapura",
      "Republik Singapura"
    ],
    "lat": 1.367,
    "lng": 103.8,
    "region": "Asia"
  },
  {
    "id": "svk",
    "name": "Slovakia",
    "aliases": [
      "Slovak Republic",
      "Slovenská republika"
    ],
    "lat": 48.667,
    "lng": 19.5,
    "region": "Europe"
  },
  {
    "id": "svn",
    "name": "Slovenia",
    "aliases": [
      "Republic of Slovenia",
      "Republika Slovenija"
    ],
    "lat": 46.117,
    "lng": 14.817,
    "region": "Europe"
  },
  {
    "id": "slb",
    "name": "Solomon Islands",
    "aliases": [],
    "lat": -8,
    "lng": 159,
    "region": "Oceania"
  },
  {
    "id": "som",
    "name": "Somalia",
    "aliases": [
      "Federal Republic of Somalia",
      "Jamhuuriyadda Federaalka Soomaaliya"
    ],
    "lat": 10,
    "lng": 49,
    "region": "Africa"
  },
  {
    "id": "zaf",
    "name": "South Africa",
    "aliases": [
      "Republic of South Africa",
      "RSA",
      "Suid-Afrika"
    ],
    "lat": -29,
    "lng": 24,
    "region": "Africa"
  },
  {
    "id": "kor",
    "name": "South Korea",
    "aliases": [
      "Republic of Korea",
      "Korea, Republic of",
      "Korea"
    ],
    "lat": 37,
    "lng": 127.5,
    "region": "Asia"
  },
  {
    "id": "ssd",
    "name": "South Sudan",
    "aliases": [
      "Republic of South Sudan"
    ],
    "lat": 7,
    "lng": 30,
    "region": "Africa"
  },
  {
    "id": "esp",
    "name": "Spain",
    "aliases": [
      "Kingdom of Spain",
      "Reino de España"
    ],
    "lat": 40,
    "lng": -4,
    "region": "Europe"
  },
  {
    "id": "lka",
    "name": "Sri Lanka",
    "aliases": [
      "Democratic Socialist Republic of Sri Lanka"
    ],
    "lat": 7,
    "lng": 81,
    "region": "Asia"
  },
  {
    "id": "sdn",
    "name": "Sudan",
    "aliases": [
      "Republic of the Sudan"
    ],
    "lat": 15,
    "lng": 30,
    "region": "Africa"
  },
  {
    "id": "sur",
    "name": "Suriname",
    "aliases": [
      "Republic of Suriname",
      "Sarnam",
      "Sranangron",
      "Republiek Suriname"
    ],
    "lat": 4,
    "lng": -56,
    "region": "Americas"
  },
  {
    "id": "swe",
    "name": "Sweden",
    "aliases": [
      "Kingdom of Sweden",
      "Konungariket Sverige"
    ],
    "lat": 62,
    "lng": 15,
    "region": "Europe"
  },
  {
    "id": "che",
    "name": "Switzerland",
    "aliases": [
      "Swiss Confederation",
      "Schweiz",
      "Suisse",
      "Svizzera",
      "Svizra"
    ],
    "lat": 47,
    "lng": 8,
    "region": "Europe"
  },
  {
    "id": "syr",
    "name": "Syria",
    "aliases": [
      "Syrian Arab Republic"
    ],
    "lat": 35,
    "lng": 38,
    "region": "Asia"
  },
  {
    "id": "twn",
    "name": "Taiwan",
    "aliases": [
      "Republic of China (Taiwan)",
      "Republic of China",
      "Chinese Taipei"
    ],
    "lat": 23.5,
    "lng": 121,
    "region": "Asia"
  },
  {
    "id": "tjk",
    "name": "Tajikistan",
    "aliases": [
      "Republic of Tajikistan",
      "Toçikiston",
      "Çumhuriyi Toçikiston"
    ],
    "lat": 39,
    "lng": 71,
    "region": "Asia"
  },
  {
    "id": "tza",
    "name": "Tanzania",
    "aliases": [
      "United Republic of Tanzania",
      "Tanzania, United Republic of",
      "Jamhuri ya Muungano wa Tanzania"
    ],
    "lat": -6,
    "lng": 35,
    "region": "Africa"
  },
  {
    "id": "tha",
    "name": "Thailand",
    "aliases": [
      "Kingdom of Thailand",
      "Prathet",
      "Thai",
      "Ratcha Anachak Thai"
    ],
    "lat": 15,
    "lng": 100,
    "region": "Asia"
  },
  {
    "id": "tls",
    "name": "Timor-Leste",
    "aliases": [
      "Democratic Republic of Timor-Leste",
      "East Timor",
      "Timor",
      "República Democrática de Timor-Leste",
      "Repúblika Demokrátika Timór-Leste",
      "Timór Lorosa'e",
      "Timor Lorosae"
    ],
    "lat": -8.833,
    "lng": 125.917,
    "region": "Asia"
  },
  {
    "id": "tgo",
    "name": "Togo",
    "aliases": [
      "Togolese Republic",
      "Togolese",
      "République Togolaise"
    ],
    "lat": 8,
    "lng": 1.167,
    "region": "Africa"
  },
  {
    "id": "ton",
    "name": "Tonga",
    "aliases": [
      "Kingdom of Tonga"
    ],
    "lat": -20,
    "lng": -175,
    "region": "Oceania"
  },
  {
    "id": "tto",
    "name": "Trinidad and Tobago",
    "aliases": [
      "Republic of Trinidad and Tobago"
    ],
    "lat": 11,
    "lng": -61,
    "region": "Americas"
  },
  {
    "id": "tun",
    "name": "Tunisia",
    "aliases": [
      "Tunisian Republic",
      "Republic of Tunisia"
    ],
    "lat": 34,
    "lng": 9,
    "region": "Africa"
  },
  {
    "id": "tur",
    "name": "Türkiye",
    "aliases": [
      "Republic of Türkiye",
      "Turkiye",
      "Republic of Turkey",
      "Türkiye Cumhuriyeti"
    ],
    "lat": 39,
    "lng": 35,
    "region": "Asia"
  },
  {
    "id": "tkm",
    "name": "Turkmenistan",
    "aliases": [],
    "lat": 40,
    "lng": 60,
    "region": "Asia"
  },
  {
    "id": "tuv",
    "name": "Tuvalu",
    "aliases": [],
    "lat": -8,
    "lng": 178,
    "region": "Oceania"
  },
  {
    "id": "uga",
    "name": "Uganda",
    "aliases": [
      "Republic of Uganda",
      "Jamhuri ya Uganda"
    ],
    "lat": 1,
    "lng": 32,
    "region": "Africa"
  },
  {
    "id": "ukr",
    "name": "Ukraine",
    "aliases": [
      "Ukrayina"
    ],
    "lat": 49,
    "lng": 32,
    "region": "Europe"
  },
  {
    "id": "are",
    "name": "United Arab Emirates",
    "aliases": [
      "UAE",
      "Emirates"
    ],
    "lat": 24,
    "lng": 54,
    "region": "Asia"
  },
  {
    "id": "gbr",
    "name": "United Kingdom",
    "aliases": [
      "United Kingdom of Great Britain and Northern Ireland",
      "Great Britain",
      "UK"
    ],
    "lat": 54,
    "lng": -2,
    "region": "Europe"
  },
  {
    "id": "usa",
    "name": "United States",
    "aliases": [
      "United States of America",
      "USA"
    ],
    "lat": 38,
    "lng": -97,
    "region": "Americas"
  },
  {
    "id": "ury",
    "name": "Uruguay",
    "aliases": [
      "Oriental Republic of Uruguay",
      "República Oriental del Uruguay"
    ],
    "lat": -33,
    "lng": -56,
    "region": "Americas"
  },
  {
    "id": "uzb",
    "name": "Uzbekistan",
    "aliases": [
      "Republic of Uzbekistan"
    ],
    "lat": 41,
    "lng": 64,
    "region": "Asia"
  },
  {
    "id": "vut",
    "name": "Vanuatu",
    "aliases": [
      "Republic of Vanuatu",
      "Ripablik blong Vanuatu",
      "République de Vanuatu"
    ],
    "lat": -16,
    "lng": 167,
    "region": "Oceania"
  },
  {
    "id": "vat",
    "name": "Vatican City",
    "aliases": [
      "Vatican City State",
      "Vatican",
      "Stato della Città del Vaticano"
    ],
    "lat": 41.9,
    "lng": 12.45,
    "region": "Europe"
  },
  {
    "id": "ven",
    "name": "Venezuela",
    "aliases": [
      "Bolivarian Republic of Venezuela",
      "Venezuela, Bolivarian Republic of",
      "República Bolivariana de Venezuela"
    ],
    "lat": 8,
    "lng": -66,
    "region": "Americas"
  },
  {
    "id": "vnm",
    "name": "Vietnam",
    "aliases": [
      "Socialist Republic of Vietnam",
      "Viet Nam"
    ],
    "lat": 16.167,
    "lng": 107.833,
    "region": "Asia"
  },
  {
    "id": "yem",
    "name": "Yemen",
    "aliases": [
      "Republic of Yemen",
      "Yemeni Republic"
    ],
    "lat": 15,
    "lng": 48,
    "region": "Asia"
  },
  {
    "id": "zmb",
    "name": "Zambia",
    "aliases": [
      "Republic of Zambia"
    ],
    "lat": -15,
    "lng": 30,
    "region": "Africa"
  },
  {
    "id": "zwe",
    "name": "Zimbabwe",
    "aliases": [
      "Republic of Zimbabwe"
    ],
    "lat": -20,
    "lng": 30,
    "region": "Africa"
  }
];

module.exports = { COUNTRIES };
