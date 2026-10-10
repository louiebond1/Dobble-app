// Draft Night API. Runs as a single-file Railway Function (Bun).
// The client lives in Dobble-app/public/draft-night.html and calls this API cross-origin.
// Keep this file well under 96KB: Railway passes it to the container as one base64 argument.

type Item = { name: string; blurb: string; visual: string };
type Mode = 'property' | 'build' | 'collection';
// bases: the starting options auctioned first (one per player). base: what everyone holds before winning one.
type Theme = { id: string; title: string; emoji: string; mode: Mode; noun: string; label: string; startLabel: string; base: Item | null; scene: string; bases: Item[]; items: Item[]; created: number };
type Lot = Item & { kind: 'base' | 'add' };
type Player = { name: string; color: string; budget: number; won: number[]; base: number | null; cpu: boolean; seen: number };
type Entry = { p: number; a: number | null; why?: string };
type Auction = { bid: number; leader: number | null; turn: number | null; passed: boolean[]; phase: 'bidding' | 'sold' | 'unsold'; deadline: number; log: Entry[]; result: { winner: number | null; price: number; note: string } | null };
type World = { v: number; state: string; busy: boolean; tries: number };
type Room = {
  code: string; rev: number; created: number; status: 'lobby' | 'playing' | 'finished'; theme: Theme; budget: number; capacity: number; cpu: boolean;
  players: Player[]; tokens: string[]; deckBases: Item[]; deckAdds: Item[]; lots: Lot[]; lot: number; auction: Auction;
  history: Array<{ lot: number; winner: number | null; price: number }>; lotImg: Record<string, string>; baseImg: string; imageError: string; worlds: World[]; verdict: string | null;
};

const env = (k: string, d: string) => String(Bun.env[k] || d);
const TURN_MS = Number(env('DRAFT_TURN_MS', '30000'));
const AWAY_MS = Number(env('DRAFT_AWAY_MS', '20000'));
const SOLD_MS = Number(env('DRAFT_SOLD_MS', '2400'));
const UNSOLD_MS = Number(env('DRAFT_UNSOLD_MS', '1600'));
const CPU_MS = Number(env('DRAFT_CPU_MS', '900'));
const LOTS_PER_PLAYER = 5;
const MAX_PLAYERS = 6;
const COLORS = ['#FF7A59', '#4EA8FF', '#3FD4A2', '#FFC145', '#B48CFF', '#FF6FAE'];
const API = env('OPENAI_BASE_URL', 'https://api.openai.com/v1');
const CLIENT_URL = env('DRAFT_CLIENT_URL', 'https://dobble-app-production.up.railway.app/draft-night.html');
let clock = () => Date.now();

// ---------- Curated themes ----------
// Each line: Name|short blurb shown to players|visual description used for image generation (what it looks like and where it goes).
const parse = (s: string): Item[] => s.trim().split('\n').map(l => { const [name, blurb, visual] = l.split('|').map(x => x.trim()); return { name, blurb, visual: visual || blurb }; });

const HOUSES = parse(`
Victorian Terrace|Two-up two-down with a tiny front yard|a modest two-storey red-brick Victorian mid-terrace house, one of a continuous row of near-identical terraced houses on a narrow residential street, with a low brick front wall and a tiny paved front yard
Semi-detached Home|A 1930s family semi with a driveway|an ordinary 1930s two-storey semi-detached house with a bay window, cream render, a short driveway and a small front lawn, joined to its neighbour on one side
Modern Townhouse|Three slim storeys of brick and glass|a narrow three-storey modern townhouse in grey brick with tall black-framed windows and a small front courtyard, between similar townhouses on a city street
Country Cottage|Stone walls, roses and a garden gate|a small detached stone cottage with a slate roof, a wooden front door, climbing roses and a modest cottage garden behind a low stone wall on a quiet village lane
Lakefront Cabin|A timber cabin on a quiet shore|a small single-storey timber cabin with a covered porch on a gently sloping grassy clearing at the edge of a calm lake, pine trees behind
Contemporary Villa|Clean white lines and big glass doors|a modern two-storey white-rendered villa with flat roofs, large glass sliding doors, a small paved terrace and a neat lawn in a sunny Mediterranean setting
Large Detached House|Five bedrooms on a leafy avenue|a large but realistic red-brick detached family house with a double garage, a gravel driveway and a mature front garden on a leafy suburban avenue
Seaside Bungalow|Single storey, sea breeze|a white-painted single-storey bungalow with a blue front door and a small gravel front garden, beside a coastal road with the sea behind
Converted Barn|Oak beams and a farmyard view|a converted timber-clad barn with a pitched roof, a tall glazed entrance and a gravel courtyard, set among green fields
Country Manor|Ivy, chimneys and a sweeping drive|a grand Georgian country manor house in honey-coloured stone with tall sash windows, several chimneys and a sweeping gravel drive across a lawn
Mansion on a Hill|Sweeping views from the top|a large modern white mansion with glass walls and terraces perched on top of a green hill, a winding drive leading up to it
Beachside House|Steps from the sand|a modern two-storey timber-and-glass beach house right on a sandy beach with dune grass in front and the sea behind
City Penthouse Building|The top floor is yours|a sleek glass apartment tower photographed from the street, with a penthouse on the top floor and a wide roof edge
Alpine Chalet|Snowy peaks and a wood burner|a traditional wooden alpine chalet with a steep roof and balconies on a snowy mountain slope with pine trees`);

const PRESETS: Theme[] = [
  { id: 'house', title: 'Dream House', emoji: '🏡', mode: 'property', noun: 'home', label: 'Upgrade', startLabel: 'Home', base: { name: 'Empty plot', blurb: 'Bid for your home first', visual: 'an empty grassy building plot with a low fence around it on a quiet residential street, neighbouring houses at the edges' }, scene: 'Elevated drone photograph from above and in front at about 45 degrees, showing the whole house, its roof and its entire plot including the back garden, with a little space around the boundaries', bases: HOUSES, created: 0, items: parse(`
Swimming Pool|A sparkling outdoor pool|a rectangular outdoor swimming pool with stone edging in the garden beside the house
Hot Tub|Bubbles under the stars|a round cedar hot tub with steam rising, on a patio beside the house
Supercar|Red, loud and Italian|a glossy red Italian supercar parked on the driveway or kerb directly outside the house
Paddleboard|For calm-water mornings|a turquoise stand-up paddleboard and paddle leaning against the front wall of the house
Outdoor Kitchen|Grill, pizza oven and bar stools|a stone outdoor kitchen with a grill, a dome pizza oven and two bar stools on a patio beside the house
Landscaped Garden|Lush planting and stone paths|lush landscaped flower beds, clipped box hedges and a stone path, replacing the plain planting within the existing plot
Treehouse|Every kid's dream (and yours)|a wooden treehouse with a rope ladder in a tree beside the house
Home Cinema|Huge screen, reclining seats|a home cinema with a huge glowing screen and red reclining seats, clearly visible through a large ground-floor window
Games Room|Pool table and arcade machines|a games room with a green pool table and retro arcade cabinets, clearly visible through a large ground-floor window
Rooftop Terrace|Loungers with a view|a rooftop terrace with a glass balustrade, two sun loungers and potted olive trees on the roof
Luxury Garage|Sleek glass-fronted garage|a modern single garage with a sleek glass door attached to the side of the house
Classic Mini|A 1960s British icon|a classic 1960s Mini Cooper in British racing green with a white roof parked outside the house
Campervan|Weekends, sorted|a two-tone orange and white vintage VW campervan parked outside the house
Trampoline|Bounce off the stress|a round garden trampoline with a black safety net beside the house
Fire Pit|Marshmallow nights|a stone fire pit with low flames surrounded by four wooden Adirondack chairs beside the house
Greenhouse|Grow your own tomatoes|a small Victorian-style glass greenhouse beside the house
Garden Office|The shortest commute|a small modern timber garden office pod with a glass front beside the house
Solar Panels|Free sunshine|a neat array of black solar panels fitted on the roof
Golden Retriever|Best friend included|a happy golden retriever sitting on the front step
Basketball Hoop|Shoot hoops on the drive|a basketball hoop on a black pole beside the driveway or front path
Pergola & Lights|Golden-hour dinners|a wooden pergola strung with warm festoon lights over a small dining table beside the house
Koi Pond|Calm, colourful fish|a small koi pond with orange fish and lily pads in front of the house
Tennis Court|Your own Centre Court|a green hard tennis court with a net squeezed in beside the house
Sauna Cabin|Scandinavian steam|a small barrel-shaped cedar sauna beside the house
Hammock|Do absolutely nothing|a striped rope hammock strung between two posts beside the house
Helipad|Arrive in style|a small circular helipad marked with a white H next to the house, with a small white helicopter on it
Climbing Frame|Swings and a slide|a wooden climbing frame with two swings and a slide beside the house
Chicken Coop|Fresh eggs every morning|a wooden chicken coop with three brown hens pecking around it beside the house
Water Slide|Pure summer chaos|a bright blue twisting inflatable water slide on the lawn beside the house
Speedboat|Ready for the water|a white speedboat on a trailer parked beside the house
E-bikes|Two bikes, zero sweat|two electric bikes in a bike rack by the front door
Yellow Front Door|First impressions count|a glossy bright yellow front door with a brass knocker, replacing the existing front door
Electric Gates|Very private|black metal electric gates at the entrance to the property
Rose Arch|Romance at the gate|an arched trellis covered in pink climbing roses over the front path`) },
  { id: 'pancakes', title: 'Pancakes', emoji: '🥞', mode: 'build', noun: 'breakfast plate', label: 'Topping', startLabel: 'Base', created: 0,
    base: { name: 'Empty plate', blurb: 'Bid for what goes on it first', visual: 'an empty round white ceramic plate' },
    bases: parse(`
Buttermilk Pancakes|A fluffy stack of three|a plain stack of three golden buttermilk pancakes on a round white plate, nothing on top
Belgian Waffle|Deep pockets for toppings|a plain thick golden Belgian waffle on a round white plate, nothing on top
French Crêpes|Thin, folded and delicate|two plain thin golden crêpes folded into triangles on a round white plate, nothing on top
Brioche French Toast|Eggy, golden slices|three plain thick slices of golden brioche French toast stacked on a round white plate, nothing on top
Japanese Soufflé Pancakes|Tall and wobbly|two tall jiggly Japanese soufflé pancakes on a round white plate, nothing on top
Dutch Baby|A puffy oven pancake|a plain puffed golden Dutch baby pancake in a small black cast-iron pan on the plate, nothing on top
Scotch Pancakes|Little thick drop scones|a neat pile of five small plain Scotch pancakes on a round white plate, nothing on top
Churro Waffle|Cinnamon-sugar crunch|a plain churro waffle dusted with cinnamon sugar on a round white plate, nothing else on top`),
    scene: 'Food photograph on a pale oak table, three-quarter view from slightly above, soft window daylight, the whole plate in frame with space around it', items: parse(`
Fresh Strawberries|Sweet, sliced, scattered|sliced fresh strawberries scattered over the top of the stack
Nutella|The chocolate-hazelnut classic|a thick glossy swirl of Nutella chocolate-hazelnut spread across the top pancake
Maple Syrup|Poured until it drips|amber maple syrup poured over the stack and dripping down the sides
Whipped Cream|A cloud on top|a tall swirl of whipped cream on top of the stack
Crushed Oreos|Cookies-and-cream crunch|crushed Oreo cookie pieces sprinkled over the top
Vanilla Ice Cream|A melting scoop|a scoop of vanilla ice cream melting on top of the stack
Caramelised Bananas|Golden and sticky|glossy caramelised banana slices on top of the stack
Crispy Bacon|Sweet meets salty|three rashers of crispy streaky bacon laid across the top
Chocolate Chips|Little pockets of joy|dark chocolate chips scattered over the stack
Lotus Biscoff|Spiced caramel spread|a drizzle of Lotus Biscoff spread with a crumbled Biscoff biscuit on top
Blueberries|Bursting and fresh|fresh blueberries scattered over the stack and plate
Lemon & Sugar|The pancake-day classic|a lemon wedge on the plate and a dusting of sugar on top
Golden Syrup|Sticky and sweet|glossy golden syrup drizzled over the stack
Raspberries|Tart and bright|fresh raspberries on top of the stack
Salted Caramel|Rich and glossy|salted caramel sauce drizzled over the stack
Peanut Butter|Thick and creamy|a thick layer of peanut butter melting on the top pancake
Toasted Marshmallows|Gooey and golden|toasted mini marshmallows on top of the stack
Rainbow Sprinkles|Party mode on|colourful rainbow sprinkles scattered over the top
Fried Egg|Brunch, sorted|a sunny-side-up fried egg on top of the stack
Honey|Straight from the comb|honey drizzled over the stack with a wooden honey dipper on the plate
Greek Yoghurt|Tangy and thick|a dollop of thick Greek yoghurt on top
Pistachio Cream|Green and luxurious|a pistachio cream drizzle with chopped pistachios on top
White Chocolate Sauce|Creamy drizzle|white chocolate sauce drizzled in lines over the stack
Cinnamon Apples|Warm apple-pie vibes|warm cinnamon-spiced apple slices on top
Clotted Cream|A proper Cornish dollop|a dollop of clotted cream on top
Fresh Mango|Tropical sunshine|fresh mango cubes on top of the stack
Toasted Coconut|Crunchy golden flakes|toasted coconut flakes sprinkled over the top
Extra Pancake|A taller stack|one extra pancake added to the stack, making it four pancakes tall
Butter|Simple perfection|a melting square pat of butter on the top pancake
Hot Fudge|Thick and molten|hot fudge sauce poured over the top
Pomegranate Seeds|Jewel-like crunch|ruby pomegranate seeds scattered on top
Kinder Bueno|Wafer and hazelnut|broken Kinder Bueno bar pieces on top`) },
  { id: 'burger', title: 'Burgers', emoji: '🍔', mode: 'build', noun: 'burger', label: 'Topping', startLabel: 'Burger', created: 0,
    base: { name: 'Empty bun', blurb: 'Bid for what goes inside it first', visual: 'an empty sesame-seed bun' },
    bases: parse(`
Beef Burger|A thick grilled beef patty|a burger with one thick grilled beef patty in a plain sesame-seed bun, nothing else inside
Cheeseburger|Beef with melted cheese|a burger with a grilled beef patty and one slice of melted cheese in a plain sesame-seed bun, nothing else inside
Chicken Burger|Crispy buttermilk fillet|a burger with one crispy golden fried chicken fillet in a plain sesame-seed bun, nothing else inside
Veggie Plant Burger|A juicy plant-based patty|a burger with one plant-based veggie patty in a plain sesame-seed bun, nothing else inside
Double Smash Burger|Two thin crispy patties|a burger with two thin smashed crispy-edged beef patties in a plain sesame-seed bun, nothing else inside
Lamb Burger|Spiced and juicy|a burger with one spiced lamb patty in a plain sesame-seed bun, nothing else inside
Fish Burger|Golden battered fillet|a burger with one golden battered fish fillet in a plain sesame-seed bun, nothing else inside
Halloumi Burger|Two grilled slabs|a burger with two thick slabs of grilled halloumi in a plain sesame-seed bun, nothing else inside`),

    scene: 'Food photograph on a dark slate board, eye-level side view so every layer of the burger is visible, warm restaurant lighting, the whole burger in frame', items: parse(`
Crispy Bacon|Smoky streaky rashers|crispy streaky bacon rashers layered on the patty
Mature Cheddar|Melted right over the edge|a slice of melted orange cheddar draped over the patty
American Cheese|The classic melt|a melted slice of yellow American cheese on the patty
Blue Cheese|Bold and tangy|crumbled blue cheese melting on the patty
Extra Patty|Double trouble|a second grilled beef patty stacked in the burger
Pickles|Sharp and crunchy|sliced dill pickles layered in the burger
Caramelised Onions|Sweet and jammy|a layer of soft brown caramelised onions
Onion Rings|Crunchy battered rings|two golden battered onion rings stacked in the burger
Jalapeños|Bring the heat|sliced green jalapeños layered on the patty
Fried Egg|Runny yolk guaranteed|a fried egg with a runny yolk on top of the patty
Avocado|Creamy green slices|sliced avocado layered in the burger
Lettuce|Fresh crunch|crisp iceberg lettuce leaves in the burger
Beef Tomato|Thick juicy slices|thick slices of red beef tomato in the burger
Burger Sauce|Secret pink sauce|creamy pink burger sauce dripping from the burger
BBQ Sauce|Sticky and smoky|sticky dark BBQ sauce dripping from the patty
Truffle Mayo|Fancy and garlicky|a smear of truffle mayonnaise on the bun
Brioche Bun|Glossy and soft|a glossy golden brioche bun replacing the sesame bun
Pretzel Bun|Dark and salty|a dark pretzel bun with salt flakes replacing the sesame bun
Garlic Mushrooms|Earthy and buttery|sautéed garlic mushrooms piled on the patty
Hash Brown|Crispy potato layer|a crispy golden hash brown inside the burger
Pineapple Ring|Controversial sweetness|a grilled pineapple ring on the patty
Mac & Cheese|Gloriously messy|a slab of fried mac and cheese inside the burger
Pulled Pork|Slow-cooked and saucy|a pile of saucy pulled pork on the patty
Grilled Halloumi|Squeaky extra cheese|a thick slice of grilled halloumi in the burger
Ketchup|The essential|ketchup oozing from the burger
American Mustard|Bright yellow tang|a zigzag of yellow mustard on the patty
Red Onion|Sharp raw rings|thin rings of raw red onion in the burger
Fries on the Side|Golden and salted|a pile of golden fries on the board beside the burger
Milkshake on the Side|Thick vanilla shake|a tall glass of vanilla milkshake on the board beside the burger
Chilli Con Carne|Spicy beef topping|a spoonful of chilli con carne spilling over the patty
Coleslaw|Creamy and crunchy|creamy coleslaw piled on the patty
Smoked Gouda|Rich and smoky|a melted slice of smoked gouda in the burger`) },
  { id: 'pizza', title: 'Pizza', emoji: '🍕', mode: 'build', noun: 'pizza', label: 'Topping', startLabel: 'Pizza', created: 0,
    base: { name: 'Empty peel', blurb: 'Bid for your pizza style first', visual: 'an empty wooden pizza peel' },
    bases: parse(`
Neapolitan Margherita|Puffy, charred crust|a round Neapolitan pizza with a puffy charred crust, tomato sauce and a few mozzarella patches only
Detroit Square|Crispy cheesy edges|a rectangular Detroit-style pizza with crispy caramelised cheese edges, tomato sauce and cheese only
Chicago Deep Dish|Tall and saucy|a whole Chicago deep-dish pizza in its pan with a tall crust, tomato sauce and cheese only
New York Pie|Big, thin and foldable|a large thin New York-style pizza with tomato sauce and mozzarella only
Roman Pinsa|Light and crunchy oval|an oval Roman pinsa with tomato sauce and mozzarella only
Sicilian Sfincione|Thick and spongy|a thick square Sicilian pizza with tomato sauce and a sprinkle of breadcrumbs only
White Pizza|No tomato, all cheese|a round white pizza with mozzarella, ricotta and olive oil only, no tomato
Sourdough Flatbread|Long and blistered|a long blistered sourdough flatbread pizza with tomato sauce and mozzarella only`),

    scene: 'Overhead flat-lay food photograph of the whole pizza on a large wooden pizza peel on a light stone counter, soft daylight', items: parse(`
Pepperoni|Crispy-edged cups|crispy pepperoni slices spread across the pizza
Mushrooms|Sliced chestnut mushrooms|sliced chestnut mushrooms scattered across the pizza
Fresh Basil|Bright green leaves|fresh basil leaves scattered on top
Burrata|A creamy centrepiece|a whole torn burrata in the centre of the pizza
Nduja|Spicy spreadable salami|dollops of red spicy nduja across the pizza
Pineapple|The great debate|chunks of pineapple across the pizza
Ham|Thin pink slices|pieces of cooked ham across the pizza
Black Olives|Salty little rings|sliced black olives scattered across the pizza
Green Peppers|Fresh and crunchy|strips of green pepper across the pizza
Red Onion|Sweet and sharp|thin red onion slices across the pizza
Jalapeños|Proper heat|sliced green jalapeños across the pizza
Hot Honey|Sweet heat drizzle|a glossy drizzle of chilli hot honey over the pizza
Rocket|Peppery leaves|a pile of fresh rocket leaves on the centre of the pizza
Parma Ham|Silky cured slices|draped slices of Parma ham across the pizza
Anchovies|Salty and bold|anchovy fillets laid across the pizza
Sweetcorn|Little golden pops|sweetcorn kernels scattered across the pizza
Extra Mozzarella|Maximum stretch|extra melted mozzarella covering more of the pizza
Goat's Cheese|Tangy white rounds|rounds of goat's cheese across the pizza
Sun-dried Tomatoes|Rich and chewy|sun-dried tomatoes scattered across the pizza
Artichokes|Tender hearts|quartered artichoke hearts across the pizza
Truffle Oil|A fancy drizzle|a glossy drizzle of truffle oil with a few truffle shavings
Garlic Dip|For the crusts|a small pot of garlic and herb dip on the peel beside the pizza
Meatballs|Little Italian meatballs|halved beef meatballs across the pizza
King Prawns|Juicy and pink|pink king prawns across the pizza
Chilli Flakes|A fiery dusting|red chilli flakes sprinkled over the pizza
Parmesan Shavings|Nutty and salty|thin parmesan shavings across the pizza
Cherry Tomatoes|Sweet and blistered|halved roasted cherry tomatoes across the pizza
Pesto Drizzle|Basil and pine nut|swirls of green pesto across the pizza
Spicy Chicken|Tandoori-style pieces|pieces of spicy red chicken across the pizza
Cracked Egg|A runny centre|a baked egg with a runny yolk in the centre of the pizza
Stuffed Crust|Cheese in the crust|a fatter stuffed crust with cheese oozing from a cut in the crust edge
Caramelised Figs|Sweet and jammy|halved caramelised figs across the pizza`) },
  { id: 'gaming', title: 'Gaming Setup', emoji: '🎮', mode: 'build', noun: 'gaming setup', label: 'Upgrade', startLabel: 'Setup', created: 0,
    base: { name: 'Empty room', blurb: 'Bid for your starting setup first', visual: 'an empty small room' },
    bases: parse(`
Basic Desk Setup|One screen, an office chair|a basic gaming setup: a plain white desk with one ordinary 24-inch monitor, a basic keyboard and mouse and a plain grey office chair against a bare white wall
Corner L-Desk|Room to spread out|a black L-shaped corner desk with one monitor, keyboard, mouse and a plain office chair in the corner of a plain room
Cosy Bedroom Nook|Gaming by the bed|a small wooden desk with one monitor beside a single bed in a cosy plain bedroom, with a simple chair
Loft Battle Station|Under the eaves|a simple desk with one monitor under a sloping attic ceiling with a skylight, with a plain chair
Living Room Console Corner|Sofa and a big TV|a plain grey sofa facing a TV on a low white TV unit in a simple living room corner
Minimalist Studio Desk|Clean wood and white walls|a slim light-oak desk with one monitor and a white chair against a clean white wall with a large window`),

    scene: 'Wide interior photograph from behind and slightly to the side of the seating, showing the whole setup, the wall above it and the floor around it, evenly lit', items: parse(`
Ultrawide Monitor|A huge curved screen|a huge curved ultrawide monitor replacing the ordinary monitor
Second Monitor|Double the screens|a second monitor beside the first on the desk
RGB Light Strips|Glowing everything|glowing purple and blue LED strips along the back of the desk and wall
Racing Gaming Chair|Bucket seat comfort|a black and red racing-style gaming chair replacing the office chair
Mechanical Keyboard|Clicky RGB keys|a mechanical keyboard with glowing RGB keys on the desk
Wireless Headset|Pro-level sound|a black wireless gaming headset resting on a stand on the desk
PlayStation 5|Sony's console|a white PlayStation 5 console standing on the desk
Xbox Series X|Microsoft's console|a black Xbox Series X standing on the desk
Nintendo Switch|Handheld and docked|a Nintendo Switch in its dock on the desk with red and blue controllers
Racing Wheel|Sim-racing kit|a racing wheel and pedals clamped to the desk
Streaming Mic|Podcast-quality voice|a studio microphone on a boom arm over the desk
Ring Light & Webcam|Ready to stream|a ring light and webcam mounted above the monitor
Mini Fridge|Cold drinks on tap|a small glass-door mini fridge full of cans under the desk
Gaming PC|Glass tower, glowing fans|a glass-sided gaming PC tower with glowing fans on the desk
Bean Bag|For couch co-op|a large grey bean bag on the floor beside the desk
Hexagon Light Panels|Wall art that glows|colourful glowing hexagon light panels on the wall above the desk
Acoustic Panels|Studio-grade quiet|dark grey acoustic foam panels on the wall
Desk Plants|A little greenery|a few potted green plants on the desk and shelf
VR Headset|Step inside the game|a white VR headset and controllers on the desk
Arcade Cabinet|Retro classics|a retro arcade cabinet standing in the corner beside the desk
Projector Screen|Cinema-size gaming|a projector on a shelf and a large pull-down screen on the side wall
Bookshelf Speakers|Room-filling sound|two bookshelf speakers either side of the monitor
Standing Desk|Up and down|a larger dark wooden standing desk replacing the white desk
Figure Shelf|Collectible figures|a wall shelf lined with collectible game figures above the desk
Cat|Supervisor on duty|a ginger cat sitting on the desk beside the keyboard
Snack Station|Crisps and sweets|a small shelf of crisps, sweets and energy drinks beside the desk
Big Desk Mat|Edge to edge|a large black desk mat covering the desk under the keyboard and mouse
Flight Stick|Take to the skies|a flight stick and throttle on the desk
Gaming Laptop|A second rig|an open gaming laptop with glowing keys on the side of the desk
Lava Lamp|Groovy glow|an orange lava lamp glowing on the desk
Neon Lightning Bolt|Pure vibes|a neon lightning-bolt light glowing on the wall
Controller Charging Dock|Always topped up|a charging dock with two controllers on the desk`) },
  { id: 'garage', title: 'Dream Garage', emoji: '🏎️', mode: 'collection', noun: 'garage', label: 'Car', startLabel: 'Garage', created: 0,
    base: { name: 'No garage yet', blurb: 'Bid for your garage first', visual: 'an empty plot' },
    bases: parse(`
Modern Double Garage|Polished concrete, bright lights|an empty spotless modern private garage with a polished grey concrete floor, white walls and overhead strip lighting, room for several cars
Underground Car Vault|Hidden beneath the house|an empty underground concrete car vault with dramatic downlights and a ramp, room for several cars
Glass Showroom|Cars on display|an empty glass-walled showroom with a glossy white floor and spotlights, room for several cars
Converted Barn Garage|Oak beams and brick|an empty converted barn with exposed oak beams, brick walls and a flagstone floor, room for several cars
Racing Pit Garage|Race-day ready|an empty racing pit garage with a grey epoxy floor, tool chests along the walls and bright lights, room for several cars
Mews Garage|A cobbled London classic|an empty old mews garage with whitewashed brick walls, a cobbled floor and big timber doors open, room for several cars`),

    scene: 'Wide interior photograph from the open entrance, the whole floor visible, even soft lighting', items: parse(`
Porsche 911|The timeless sports car|a silver Porsche 911 sports car parked in the garage
Lamborghini Huracán|Wild, bright and loud|a lime-green Lamborghini Huracán parked in the garage
Ferrari F8|Italian red perfection|a red Ferrari F8 parked in the garage
McLaren 720S|Dihedral doors up|an orange McLaren 720S with its doors raised, parked in the garage
Land Rover Defender|Go anywhere|a classic green Land Rover Defender parked in the garage
1967 Ford Mustang|American muscle|a blue 1967 Ford Mustang fastback with white stripes parked in the garage
Classic Mini|Small but mighty|a red classic Mini Cooper with a white roof parked in the garage
Tesla Model S|Silent speed|a white Tesla Model S parked in the garage
Aston Martin DB5|Very secret agent|a silver birch Aston Martin DB5 parked in the garage
Bugatti Chiron|The hypercar|a two-tone blue Bugatti Chiron parked in the garage
Mercedes G-Wagon|The boxy icon|a black Mercedes G-Class parked in the garage
Nissan GT-R|Godzilla|a grey Nissan GT-R parked in the garage
Toyota Supra|Tuner legend|an orange 1990s Toyota Supra parked in the garage
Audi R8|Everyday supercar|a white Audi R8 parked in the garage
VW Beetle|Cheerful classic|a pale blue classic VW Beetle parked in the garage
Rolls-Royce Phantom|Pure luxury|a black Rolls-Royce Phantom parked in the garage
Ford GT40|Le Mans legend|a blue and orange Ford GT40 race car parked in the garage
Lotus Elise|Light and nimble|a yellow Lotus Elise parked in the garage
Fiat 500 Classic|Tiny Italian charm|a cream classic Fiat 500 parked in the garage
Jeep Wrangler|Roof off, ready|a red Jeep Wrangler parked in the garage
Range Rover|Country-house cool|a dark green Range Rover parked in the garage
Ducati Panigale|Superbike on two wheels|a red Ducati Panigale motorbike parked in the garage
Vespa|La dolce vita|a mint-green Vespa scooter parked in the garage
Racing Go-Kart|Small car, big grin|a racing go-kart parked in the garage
Car Lift|Show-off storage|a hydraulic two-post car lift installed in the garage
Tool Wall|Every spanner in place|a pegboard wall of neatly organised tools above a workbench
Chequered Floor|Race-day style|a black and white chequered floor replacing the grey concrete floor
Delorean|Time-travel optional|a stainless steel DeLorean with gull-wing doors open, parked in the garage
Mini Moke|Beach buggy fun|a white Mini Moke beach car parked in the garage
Bentley Continental|Grand tourer|a dark blue Bentley Continental GT parked in the garage
Golf Buggy|For the estate|a white electric golf buggy parked in the garage
Vintage Petrol Pump|Retro decoration|a red vintage petrol pump standing in the corner of the garage`) },
];
const ALIASES: Record<string, string> = { house: 'house', home: 'house', 'dream house': 'house', 'dream home': 'house', property: 'house', mansion: 'house', pancake: 'pancakes', pancakes: 'pancakes', 'pancake stack': 'pancakes', burger: 'burger', burgers: 'burger', hamburger: 'burger', cheeseburger: 'burger', pizza: 'pizza', pizzas: 'pizza', 'gaming setup': 'gaming', 'gaming set up': 'gaming', 'gaming station': 'gaming', 'gaming room': 'gaming', 'gaming desk': 'gaming', garage: 'garage', 'dream garage': 'garage', 'car collection': 'garage', 'supercar collection': 'garage' };
function presetFor(topic: string) {
  const t = topic.toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\b(the|my|a|an|our|best|ultimate|perfect|dream|build|your|of)\b/g, ' ').replace(/\s+/g, ' ').trim();
  const id = ALIASES[t] || ALIASES[topic.toLowerCase().trim()];
  return PRESETS.find(p => p.id === id) || null;
}

// ---------- State ----------
const rooms = new Map<string, Room>();
const themes = new Map<string, Theme>();
const images = new Map<string, Uint8Array>();
const timers = new Map<string, any>();
const retries = new Map<string, number>();

const shuffle = <T,>(a: T[]): T[] => { const x = [...a]; for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; } return x; };
const cleanName = (x: any, d: string) => String(x || '').replace(/[^\p{L}\p{N} '\-]/gu, '').trim().slice(0, 16) || d;
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
function newCode() { let c = ''; do { c = Array.from({ length: 4 }, () => 'ABCDEFGHJKMNPQRSTUVWXYZ'[Math.floor(Math.random() * 23)]).join(''); } while (rooms.has(c)); return c; }
function sweep() { const cut = clock() - 8 * 3600e3; for (const [k, r] of rooms) if (r.created < cut) { rooms.delete(k); clearTimeout(timers.get(k)); for (const key of images.keys()) if (key.startsWith(k + '/')) images.delete(key); } for (const [k, t] of themes) if (t.created < clock() - 3600e3) themes.delete(k); }

// ---------- Auction engine ----------
const bump = (r: Room) => { r.rev++; };
const isBaseLot = (r: Room) => r.lots[r.lot]?.kind === 'base';
// Themes with starting options auction them first, one per player, before any additions.
const hasBases = (t: Theme) => t.bases.length > 0;
// Everyone ends with at most LOTS_PER_PLAYER things (their starting option counts as one).
function eligible(r: Room, p: number) { return r.status === 'playing' && p >= 0 && p < r.players.length && r.players[p].won.length < LOTS_PER_PLAYER && (isBaseLot(r) ? r.players[p].base === null : !hasBases(r.theme) || r.players[p].base !== null); }
const eligibleSeats = (r: Room) => r.players.map((_, i) => i).filter(i => eligible(r, i));
const canAct = (r: Room, p: number) => eligible(r, p) && !r.auction.passed[p] && r.auction.leader !== p;
const away = (r: Room, p: number) => !r.players[p].cpu && clock() - r.players[p].seen > AWAY_MS;

function beginLot(r: Room) {
  const n = r.players.length;
  r.auction = { bid: 0, leader: null, turn: null, passed: Array(n).fill(false), phase: 'bidding', deadline: 0, log: [], result: null };
  const seats = eligibleSeats(r);
  if (isBaseLot(r) && seats.length === 1) { award(r, seats[0], 0, 'Last one left: theirs for free'); return; }
  if (!seats.length) { closeLot(r); return; }
  passTo(r, (r.lot % n) - 1);
}
// Moves the turn to the next player who can still raise; resolves the lot when nobody can.
function passTo(r: Room, from: number) {
  const a = r.auction, n = r.players.length;
  for (let i = 0; i < n; i++) if (canAct(r, i) && r.players[i].budget < a.bid + 1) { a.passed[i] = true; a.log.push({ p: i, a: null, why: 'out of money' }); }
  let next: number | null = null;
  for (let k = 1; k <= n; k++) { const p = (((from + k) % n) + n) % n; if (canAct(r, p)) { next = p; break; } }
  if (next === null) { closeLot(r); return; }
  a.turn = next;
  a.deadline = clock() + (r.players[next].cpu ? CPU_MS : away(r, next) ? 0 : TURN_MS);
}
function closeLot(r: Room) {
  const a = r.auction;
  if (a.leader !== null) return award(r, a.leader, a.bid, '');
  const seats = eligibleSeats(r);
  if (isBaseLot(r) && seats.length) return award(r, seats[Math.floor(Math.random() * seats.length)], 0, 'No bids: drawn at random');
  a.phase = 'unsold'; a.turn = null; a.result = { winner: null, price: 0, note: 'No bids' }; a.deadline = clock() + UNSOLD_MS;
  r.history.push({ lot: r.lot, winner: null, price: 0 });
}
function award(r: Room, p: number, price: number, note: string) {
  const pl = r.players[p], a = r.auction;
  if (!eligible(r, p) || price > pl.budget || price < 0) throw Error('Invalid allocation');
  pl.budget -= price; pl.won.push(r.lot); if (r.lots[r.lot].kind === 'base') pl.base = r.lot;
  r.history.push({ lot: r.lot, winner: p, price });
  a.phase = 'sold'; a.turn = null; a.bid = price; a.leader = p; a.result = { winner: p, price, note }; a.deadline = clock() + SOLD_MS;
  void ensureWorld(r, p);
}
function nextLot(r: Room) {
  r.lot++;
  if (r.lot >= r.lots.length) { r.status = 'finished'; r.auction.turn = null; void judge(r); return; }
  beginLot(r);
}
function bid(r: Room, p: number, amount: number, why?: string) {
  const a = r.auction;
  if (a.phase !== 'bidding' || a.turn !== p) throw Error('It is not your turn');
  if (!Number.isSafeInteger(amount) || amount <= a.bid || amount > r.players[p].budget) throw Error('Invalid bid');
  a.bid = amount; a.leader = p; a.log.push(why ? { p, a: amount, why } : { p, a: amount });
  passTo(r, p);
}
function pass(r: Room, p: number, why?: string) {
  const a = r.auction;
  if (a.phase !== 'bidding' || a.turn !== p) throw Error('It is not your turn');
  // Every lot sells: whoever opens must bid at least £1. Only running out of money excuses it.
  if (a.leader === null && r.players[p].budget >= 1) throw Error('You open the bidding: bid at least £1');
  a.passed[p] = true; a.log.push(why ? { p, a: null, why } : { p, a: null });
  passTo(r, p);
}
function forcePass(r: Room, p: number, why: string) {
  const a = r.auction;
  a.passed[p] = true; a.log.push({ p, a: null, why });
  passTo(r, p);
}
function cpuMove(r: Room, p: number) {
  const pl = r.players[p], a = r.auction, lot = r.lots[r.lot];
  const left = r.lots.length - r.lot, share = Math.max(1, Math.round(left / r.players.length));
  let value = lot.kind === 'base' ? pl.budget * (0.25 + Math.random() * 0.3) : (pl.budget / share) * (0.6 + Math.random() * 0.9);
  value = Math.floor(Math.min(value, pl.budget));
  if (a.bid < value || a.leader === null) bid(r, p, Math.min(pl.budget, a.bid + (value - a.bid > 5 && Math.random() < 0.5 ? 2 : 1)));
  else pass(r, p);
}
// Advances any timers that have expired. Called on every request and by a per-room timeout.
function tick(r: Room) {
  let guard = 0;
  while (r.status === 'playing' && guard++ < 200) {
    const a = r.auction, now = clock();
    if (a.phase === 'bidding' && a.turn !== null) {
      const p = a.turn;
      if (a.deadline > now && !away(r, p)) break;
      if (r.players[p].cpu) { if (a.deadline > now) break; cpuMove(r, p); }
      else if (a.leader === null) bid(r, p, 1, away(r, p) ? 'away, opened automatically' : 'time ran out, opened automatically');
      else forcePass(r, p, away(r, p) ? 'away' : 'time ran out');
    } else if (a.deadline <= now) nextLot(r);
    else break;
    bump(r);
  }
  schedule(r);
}
function schedule(r: Room) {
  clearTimeout(timers.get(r.code));
  if (r.status !== 'playing') return;
  const wait = clamp(r.auction.deadline - clock(), 0, 60000) + 25;
  const t = setTimeout(() => { if (rooms.get(r.code) === r) tick(r); }, wait);
  t?.unref?.(); timers.set(r.code, t);
}
function start(r: Room) {
  const n = r.players.length;
  r.lots = hasBases(r.theme)
    ? [...r.deckBases.slice(0, n).map(x => ({ ...x, kind: 'base' as const })), ...r.deckAdds.slice(0, 4 * n).map(x => ({ ...x, kind: 'add' as const }))]
    : r.deckAdds.slice(0, LOTS_PER_PLAYER * n).map(x => ({ ...x, kind: 'add' as const }));
  r.status = 'playing'; r.lot = 0;
  prefetch(r, r.lots.filter(l => l.kind === 'add').length);
  r.worlds = r.players.map(() => ({ v: r.baseImg === 'ready' ? 0 : -1, state: 'idle', busy: false, tries: 0 }));
  beginLot(r);
}

// ---------- Images ----------
// Each player's world is a chain of edits. Version v shows the base plus their first v acquisitions
// (property: v=1 is exactly the house photo they bid on). Each new version edits the previous image,
// so the original creation and earlier purchases stay put. Versions only ever move forwards.
// Cheapest settings that still look right: a side-by-side test showed low quality on this model keeps houses, placement
// and earlier items as well as medium, while gpt-image-1-mini drifted (wrong angle, items in the wrong place).
const ITEM_Q = env('DRAFT_ITEM_QUALITY', 'low');
const WORLD_Q = env('DRAFT_WORLD_QUALITY', 'low');
// Extras that add input cost; edits stayed faithful without them in the same test.
const HIGH_FIDELITY = env('DRAFT_HIGH_FIDELITY', '') === '1';
const ITEM_REFERENCE = env('DRAFT_ITEM_REFERENCE', '') === '1';
const STYLE = 'Photorealistic, natural light, crisp detail, consistent colour grading. No text, captions, labels, logos, watermarks or people.';
const queue: Array<{ pri: number; run: () => Promise<void> }> = [];
let running = 0;
const MAX_JOBS = Number(env('DRAFT_IMAGE_CONCURRENCY', '4'));
function enqueue(pri: number, run: () => Promise<void>) { queue.push({ pri, run }); queue.sort((a, b) => a.pri - b.pri); pump(); }
function pump() {
  while (running < MAX_JOBS && queue.length) {
    const job = queue.shift()!; running++;
    job.run().catch(() => {}).finally(() => { running--; pump(); });
  }
}
const imgKey = (r: Room, k: string) => r.code + '/' + k;
function worldKey(r: Room, p: number, v: number) {
  if (v < 0) return '';
  if (v === 0) return 'base';
  if (hasBases(r.theme) && v === 1) return 'lot' + r.players[p].won[0];
  return 'w' + p + '-' + v;
}
function lotPrompt(r: Room, it: Item, kind: string) {
  const t = r.theme;
  if (kind === 'base' && t.mode === 'property') return `${t.scene}. The property is ${it.visual}. Show it exactly as described at its true real-world size, with nothing that is not described: no swimming pool, no hot tub, no cars, no extra buildings or grounds unless described. Square framing with the whole property visible. ${STYLE}`;
  if (kind === 'base') return `${t.scene}. Subject: ${it.visual}. Show it exactly as described, plain, with nothing added on or around it, leaving space for additions later. Square framing. ${STYLE}`;
  return `Clear photograph of ${it.visual.replace(/ (on|in|beside|across|over|into|outside|by|at|under|above|scattered|draped|layered|piled|replacing|parked|leaning|sitting|standing|strung|fitted|attached|added|clamped|mounted|squeezed|clearly)\b.*$/i, '') || it.name} (${it.name}) as a single isolated subject, centred and filling most of the frame, on a plain softly lit warm-grey background. Square framing. ${STYLE}`;
}
function basePrompt(r: Room) {
  const t = r.theme;
  return `${t.scene}. Subject: ${t.base!.visual}. Show it plain and unembellished, exactly as described, with clear space around and on it so additions can be placed later. Square framing. ${STYLE}`;
}
const LUXURIES = ['swimming pool', 'hot tub', 'supercar', 'tennis court', 'helicopter', 'extra storeys', 'larger garden or extra land', 'outbuildings'];
function worldPrompt(r: Room, p: number, from: number, to: number, withRef = false) {
  const t = r.theme, pl = r.players[p];
  const acq = pl.won.map(i => r.lots[i]);
  const adds = acq.filter(x => x.kind === 'add');
  const already = acq.slice(0, from).filter(x => x.kind === 'add');
  const fresh = acq.slice(from, to).filter(x => x.kind === 'add');
  const baseName = hasBases(t) ? (acq[0]?.name || t.noun) : t.base!.name;
  const lines = fresh.map(x => `- ${x.name}: ${x.visual}.`).join('\n');
  const keep = already.length ? `It already contains these purchased items, which must stay exactly as they are: ${already.map(x => x.name).join(', ')}.` : 'Nothing has been added to it yet.';
  let forbid = 'Do not add anything else that is not listed.';
  if (t.mode === 'property') {
    const owned = adds.map(x => (x.name + ' ' + x.visual).toLowerCase()).join(' ');
    const missing = LUXURIES.filter(l => !owned.includes(l.split(' ')[0]));
    forbid = `Do not enlarge the house or its plot and do not change its architecture. Do not add: ${missing.join(', ')}, or any other feature that is not listed above.`;
  } else if (t.mode === 'build') forbid = `Do not add any other toppings, ingredients, accessories or objects. Keep the ${t.noun} the same size and shape.`;
  else forbid = 'Do not add any other items. Do not remove, move or restyle the items already there.';
  return `Edit this photograph of a ${t.mode === 'property' ? baseName.toLowerCase() : t.noun} (${baseName}). Keep the camera angle, framing, lighting, background and every existing element identical. ${keep}\nAdd ONLY the following newly purchased item${fresh.length > 1 ? 's' : ''}, each clearly recognisable and naturally placed:\n${lines}\n${forbid} ${withRef ? 'The second image is a reference photo of the purchased item: reproduce that item, not its background.' : ''} ${STYLE}`.trim();
}
async function openaiImage(prompt: string, refs: Uint8Array[], quality: string): Promise<Uint8Array> {
  const key = Bun.env.OPENAI_API_KEY; if (!key) throw Error('No image key');
  const model = env('DRAFT_IMAGE_MODEL', 'gpt-image-2.5-flare');
  const call = async (full: boolean) => {
    let body: any; const headers: Record<string, string> = { Authorization: 'Bearer ' + key };
    const params: Record<string, string> = { model, prompt, size: '1024x1024', quality, output_format: 'jpeg' };
    if (!refs.length) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(params); }
    else {
      body = new FormData();
      for (const [k, v] of Object.entries(params)) body.append(k, v);
      if (full && HIGH_FIDELITY) body.append('input_fidelity', 'high');
      const use = full ? refs : refs.slice(0, 1);
      use.forEach((b, i) => body.append(use.length > 1 ? 'image[]' : 'image', new Blob([b as BlobPart], { type: 'image/jpeg' }), 'ref' + i + '.jpg'));
    }
    return fetch(API + '/images/' + (refs.length ? 'edits' : 'generations'), { method: 'POST', headers, body, signal: AbortSignal.timeout(120000) });
  };
  let res = await call(true);
  if (res.status === 400) { console.error('Image request rejected, retrying simplified:', (await res.text()).slice(0, 300)); res = await call(false); }
  if (!res.ok) throw Error('Image service ' + res.status + ' ' + (await res.text()).slice(0, 200));
  const d = await res.json() as any; const b64 = d.data?.[0]?.b64_json;
  if (!b64) throw Error('Empty image');
  return Uint8Array.from(Buffer.from(b64, 'base64'));
}
// OpenAI answers 429 insufficient_quota when the account has no credit; retrying cannot help.
const CREDIT_MSG = 'Pictures are unavailable: the OpenAI account behind Draft Night has run out of credit. Add credit at platform.openai.com → Billing.';
function outOfCredit(r: Room | null, e: unknown) {
  const hit = /insufficient_quota|no credits remaining|billing/i.test(String(e));
  if (hit && r) { r.imageError = CREDIT_MSG; bump(r); }
  return hit;
}
function genLot(r: Room, k: string, it: Item, kind: string, pri: number) {
  if (r.lotImg[k]) return;
  r.lotImg[k] = Bun.env.OPENAI_API_KEY ? 'pending' : 'none';
  if (!Bun.env.OPENAI_API_KEY) return;
  enqueue(pri, async () => {
    try { images.set(imgKey(r, k), await openaiImage(lotPrompt(r, it, kind), [], kind === 'base' ? WORLD_Q : ITEM_Q)); r.lotImg[k] = 'ready'; }
    catch (e) {
      console.error('Lot image failed', String(e));
      if (outOfCredit(r, e)) { r.lotImg[k] = 'error'; bump(r); return; }
      const n = (retries.get(imgKey(r, k)) || 0) + 1; retries.set(imgKey(r, k), n);
      r.lotImg[k] = n < 3 ? '' : 'error';
      if (n < 3) setTimeout(() => genLot(r, k, it, kind, pri), 3000 * n);
    }
    bump(r);
    if (r.status !== 'lobby') r.players.forEach((_, p) => void ensureWorld(r, p));
  });
}
function genBase(r: Room) {
  if (!r.theme.base?.visual) return;
  if (!Bun.env.OPENAI_API_KEY) { r.baseImg = 'none'; return; }
  r.baseImg = 'pending';
  enqueue(0, async () => {
    try { images.set(imgKey(r, 'base'), await openaiImage(basePrompt(r), [], WORLD_Q)); r.baseImg = 'ready'; }
    catch (e) {
      console.error('Base image failed', String(e));
      const n = (retries.get(imgKey(r, 'base')) || 0) + 1; retries.set(imgKey(r, 'base'), n);
      r.baseImg = 'error'; if (n < 3 && !outOfCredit(r, e)) setTimeout(() => genBase(r), 3000 * n);
    }
    if (r.status !== 'lobby') r.worlds.forEach((w, p) => { if (w.v < 0 && r.baseImg === 'ready') w.v = 0; void ensureWorld(r, p); });
    bump(r);
  });
}
async function ensureWorld(r: Room, p: number) {
  const w = r.worlds[p], pl = r.players[p];
  if (!w || w.busy) return;
  if (!Bun.env.OPENAI_API_KEY) { w.state = 'none'; return; }
  const property = hasBases(r.theme);
  if (w.v < 0 && r.baseImg === 'ready') { w.v = 0; bump(r); }
  if (property && pl.base !== null && w.v < 1 && r.lotImg['lot' + pl.base] === 'ready') { w.v = 1; bump(r); }
  const target = pl.won.length;
  if (w.v < (property ? 1 : 0) || w.v >= target) { if (w.v >= target) w.state = 'ready'; return; }
  w.busy = true; w.state = 'updating'; bump(r);
  const from = w.v;
  enqueue(-1, async () => {
    try {
      const prev = images.get(imgKey(r, worldKey(r, p, from)));
      if (!prev) throw Error('Missing previous world');
      const refs = [prev];
      const lotRef = images.get(imgKey(r, lotImageKey(r, pl.won[from])));
      if (ITEM_REFERENCE && lotRef && target - from === 1) refs.push(lotRef);
      const out = await openaiImage(worldPrompt(r, p, from, target, refs.length > 1), refs, WORLD_Q);
      images.set(imgKey(r, worldKey(r, p, target)), out);
      if (target > w.v) w.v = target;
      w.state = 'ready'; w.tries = 0;
    } catch (e) {
      w.tries++; w.state = w.tries > 2 || outOfCredit(r, e) ? 'error' : 'retrying';
      console.error('World image failed', String(e));
    } finally {
      w.busy = false; bump(r);
      if (w.state === 'retrying') setTimeout(() => void ensureWorld(r, p), 4000);
      else if (w.v < pl.won.length && w.state !== 'error') void ensureWorld(r, p);
    }
  });
}
function prefetch(r: Room, adds: number) {
  if (hasBases(r.theme)) r.deckBases.slice(0, r.capacity).forEach((it, i) => genLot(r, 'lot' + i, it, 'base', 1 + i / 100));
  r.deckAdds.slice(0, adds).forEach((it, i) => genLot(r, 'add' + i, it, 'add', 2 + i / 100));
}
// Lots are assembled at start; map each lot to its prefetched image key.
function lotImageKey(r: Room, i: number) {
  const n = r.players.length;
  if (hasBases(r.theme)) return i < n ? 'lot' + i : 'add' + (i - n);
  return 'add' + i;
}

// ---------- Text AI ----------
async function openaiJSON(system: string, user: string, schema: any, maxTokens: number, timeout = 45000) {
  const key = Bun.env.OPENAI_API_KEY; if (!key) throw Error('AI is not configured');
  const res = await fetch(API + '/chat/completions', {
    method: 'POST', signal: AbortSignal.timeout(timeout),
    headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: env('DRAFT_TEXT_MODEL', 'gpt-4.1-mini'), max_tokens: maxTokens, temperature: 0.7, response_format: { type: 'json_schema', json_schema: { name: 'out', strict: true, schema } }, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }),
  });
  if (!res.ok) throw Error('AI service ' + res.status + ' ' + (await res.text()).slice(0, 200));
  const d = await res.json() as any;
  return JSON.parse(d.choices?.[0]?.message?.content || '{}');
}
const S = (props: Record<string, any>) => ({ type: 'object', additionalProperties: false, required: Object.keys(props), properties: props });
const str = { type: 'string' };
const THEME_SCHEMA = S({
  status: { type: 'string', enum: ['ok', 'ambiguous'] }, question: str,
  options: { type: 'array', items: S({ label: str, topic: str }) },
  title: str, emoji: str, kind: { type: 'string', enum: ['build', 'collection'] }, noun: str, label: str,
  base_name: str, base_blurb: str, base_visual: str, scene: str, start_label: str,
  bases: { type: 'array', items: S({ name: str, blurb: str, visual: str }) },
  items: { type: 'array', items: S({ name: str, blurb: str, visual: str }) },
});
const THEME_SYSTEM = `You set up rounds of Draft Night, a party auction game. Players type a subject; every player starts with the same plain BASE and wins items at auction that visibly change their own version of it. Images of each player's creation are generated from your descriptions, so everything must be concrete and photographable.

Decide what the subject means:
- If it is clear (e.g. "Pancakes", "Burgers", "Supercars", "Dream bedroom", "Garden", "Gaming setup", "Holiday", "Football team"), return status "ok".
- If it is a person's name, a nickname or in-joke, a single vague word, or could mean several quite different things to build, return status "ambiguous" with one short question and 3 or 4 concrete options (label: what players see, e.g. "Pam's dream birthday cake"; topic: a precise subject to build). Never invent a meaning for a name. When ambiguous, leave the other text fields empty and items empty.

When ok:
- kind "build": each player improves ONE object (a pancake stack, a burger, a car, a bedroom, a garden). kind "collection": each player assembles separate things inside one shared container scene (a garage of cars, a football squad on a pitch, a holiday suitcase).
- base_name/base_blurb/base_visual: what everyone holds before the first round, e.g. "Empty bun" for burgers or "Empty plate" for pancakes.
- bases: exactly 8 distinct STARTING OPTIONS that players bid on first (each player wins exactly one), e.g. burgers: Beef Burger, Cheeseburger, Chicken Burger, Veggie Plant Burger; pancakes: Buttermilk Pancakes, Belgian Waffle, French Crêpes; supercars: a garage style. Each visual describes the whole plain starting thing in the scene with nothing added (max 25 words). start_label: one word for these lots (e.g. "Burger", "Base", "Garage"). Never a house unless the subject is about houses.
- scene: one sentence on camera angle, surface/setting and lighting so the whole base and every addition is visible.
- noun: 1-3 words for what each player builds (e.g. "pancake stack", "garage"). label: one word for an auction lot (e.g. "Topping", "Upgrade", "Car", "Signing").
- items: exactly N distinct additions (not starting options), real, instantly recognisable things that make sense for THIS subject and can be seen in the picture. Use plain common names people know ("Nutella", "Maple Syrup", "Carbon-Fibre Wheels", "Rooftop Pool"). Mix desirable and cheaper options; one or two may be funny-but-plausible (e.g. "Bacon" on pancakes). Never include unrelated objects, characters, mascots, plush toys, fantasy concepts, buildings unrelated to the subject, or real named people.
- blurb: at most 7 natural words. visual: at most 22 words describing what it looks like and exactly where it goes on the base.
- title: 1-3 words. emoji: one emoji.`;
async function interpret(topic: string, n: number, confirmed: boolean): Promise<any> {
  const out = await openaiJSON(THEME_SYSTEM, `Subject: ${JSON.stringify(topic)}\nN = ${n}${confirmed ? '\nThe players have already confirmed this meaning, so status must be "ok".' : ''}`, THEME_SCHEMA, 4500);
  if (out.status === 'ambiguous' && !confirmed && Array.isArray(out.options) && out.options.length >= 2)
    return { status: 'ambiguous', question: String(out.question || 'What are you building?').slice(0, 120), options: out.options.slice(0, 4).map((o: any) => ({ label: String(o.label).slice(0, 48), topic: String(o.topic).slice(0, 80) })) };
  const seen = new Set<string>();
  const items: Item[] = (Array.isArray(out.items) ? out.items : []).map((x: any) => ({ name: String(x.name || '').trim().slice(0, 32), blurb: String(x.blurb || '').trim().slice(0, 60), visual: String(x.visual || '').trim().slice(0, 200) }))
    .filter((x: Item) => x.name && x.visual && !seen.has(x.name.toLowerCase()) && seen.add(x.name.toLowerCase()));
  const clean = (x: any): Item => ({ name: String(x.name || '').trim().slice(0, 32), blurb: String(x.blurb || '').trim().slice(0, 60), visual: String(x.visual || '').trim().slice(0, 220) });
  const bases = (Array.isArray(out.bases) ? out.bases : []).map(clean).filter((x: Item) => x.name && x.visual && !seen.has(x.name.toLowerCase()) && seen.add(x.name.toLowerCase()));
  if (items.length < LOTS_PER_PLAYER * 2 || bases.length < 2) throw Error('Could not build that theme. Try describing it a little more.');
  const t: Theme = {
    id: crypto.randomUUID().slice(0, 8), title: String(out.title || topic).slice(0, 28), emoji: String(out.emoji || '✨').slice(0, 4),
    mode: out.kind === 'collection' ? 'collection' : 'build', noun: String(out.noun || topic).slice(0, 24).toLowerCase(), label: String(out.label || 'Lot').slice(0, 14),
    base: { name: String(out.base_name || 'Nothing yet').slice(0, 32), blurb: String(out.base_blurb || '').slice(0, 60), visual: String(out.base_visual || '').slice(0, 240) },
    startLabel: String(out.start_label || 'Base').slice(0, 14), scene: String(out.scene || 'Clear, evenly lit photograph showing the whole subject').slice(0, 240), bases, items, created: clock(),
  };
  themes.set(t.id, t);
  return { status: 'ok', theme: themeSummary(t) };
}
function themeSummary(t: Theme) {
  return { id: t.id, title: t.title, emoji: t.emoji, mode: t.mode, noun: t.noun, label: t.label, startLabel: t.startLabel, hasBases: hasBases(t), base: t.base && { name: t.base.name, blurb: t.base.blurb }, maxPlayers: Math.min(MAX_PLAYERS, hasBases(t) ? Math.min(t.bases.length, Math.floor(t.items.length / 4)) : Math.floor(t.items.length / 5)), starts: t.bases.slice(0, 8).map(x => x.name), examples: t.items.slice(0, 8).map(x => x.name) };
}
async function judge(r: Room) {
  if (!Bun.env.OPENAI_API_KEY) return;
  try {
    const lists = r.players.map(p => `${p.name}: ${p.won.map(i => r.lots[i].name).join(', ') || 'nothing'} (spent £${r.budget - p.budget})`).join('\n');
    const out = await openaiJSON('You are the witty host of Draft Night, a party auction game. Players each built their own version of the theme. Crown the best creation on taste, combination and value. Reply with one or two warm, funny sentences (max 45 words) that name the winner. Never insult anyone.', `Theme: ${r.theme.title} (${r.theme.noun})\n${lists}`, S({ verdict: str }), 200, 20000);
    r.verdict = String(out.verdict || '').slice(0, 320) || null; bump(r);
  } catch (e) { console.error('Judge failed', String(e)); }
}

// ---------- HTTP ----------
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };
const reply = (v: any, status = 200) => Response.json(v, { status, headers: { ...CORS, 'Cache-Control': 'no-store' } });
const fail = (m: string, status = 400) => reply({ error: m }, status);

function prep(r: Room) {
  const states = [...Object.values(r.lotImg), ...(r.theme.base?.visual ? [r.baseImg] : [])].filter(x => x !== 'none');
  return { total: states.length, ready: states.filter(x => x === 'ready').length, failed: states.filter(x => x === 'error').length, error: r.imageError, enabled: Boolean(Bun.env.OPENAI_API_KEY) };
}
function view(r: Room) {
  const a = r.auction;
  return {
    code: r.code, rev: r.rev, now: clock(), status: r.status, budget: r.budget, capacity: r.capacity, cpu: r.cpu,
    theme: { ...themeSummary(r.theme), examples: undefined, starts: undefined },
    players: r.players.map((p, i) => ({ name: p.name, color: p.color, budget: p.budget, won: p.won, base: p.base, cpu: p.cpu, away: r.status === 'playing' && away(r, i) })),
    // Only lots that have already come up are sent, so nobody can peek at what is next.
    lots: r.lots.slice(0, r.lot + 1).map((l, i) => ({ name: l.name, blurb: l.blurb, kind: l.kind, img: r.lotImg[lotImageKey(r, i)] || 'none', key: lotImageKey(r, i) })),
    lot: r.lot, total: r.status === 'lobby' ? LOTS_PER_PLAYER * r.players.length : r.lots.length,
    auction: { bid: a.bid, leader: a.leader, turn: a.turn, passed: a.passed, phase: a.phase, deadline: a.deadline, log: a.log.slice(-6), result: a.result },
    worlds: r.worlds.map((w, p) => ({ v: w.v, state: w.state, key: worldKey(r, p, w.v) })),
    base: { state: r.baseImg }, prep: prep(r),
    history: r.history, verdict: r.verdict,
  };
}
function join(r: Room, name: string, cpu = false) {
  const taken = new Set(r.players.map(p => p.name.toLowerCase()));
  let nm = name, k = 2; while (taken.has(nm.toLowerCase())) nm = name.slice(0, 13) + ' ' + k++;
  r.players.push({ name: nm, color: COLORS[r.players.length], budget: r.budget, won: [], base: null, cpu, seen: clock() });
  r.tokens.push(crypto.randomUUID());
  r.worlds.push({ v: -1, state: 'idle', busy: false, tries: 0 });
  bump(r);
  return r.players.length - 1;
}
async function handle(req: Request): Promise<Response> {
  const u = new URL(req.url);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (u.pathname === '/' || u.pathname === '/index.html') return Response.redirect(CLIENT_URL, 302);
  if (u.pathname === '/health') return reply({ ok: true, images: Boolean(Bun.env.OPENAI_API_KEY) });
  const body = req.method === 'POST' ? await req.json().catch(() => ({})) as any : {};
  const room = () => rooms.get(String(u.searchParams.get('code') || body.code || '').toUpperCase());

  if (u.pathname === '/api/img') {
    const r = rooms.get(String(u.searchParams.get('code') || '').toUpperCase());
    const data = r && images.get(imgKey(r, String(u.searchParams.get('k') || '')));
    return data ? new Response(data as BodyInit, { headers: { ...CORS, 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=21600, immutable' } }) : new Response('Not ready', { status: 404, headers: CORS });
  }
  if (u.pathname === '/api/presets') return reply({ presets: PRESETS.map(themeSummary), images: Boolean(Bun.env.OPENAI_API_KEY) });
  if (u.pathname === '/api/theme' && req.method === 'POST') {
    const topic = String(body.topic || '').replace(/\s+/g, ' ').trim().slice(0, 80);
    if (topic.length < 2) return fail('Tell us what you are building');
    const preset = presetFor(topic);
    if (preset) return reply({ status: 'ok', theme: themeSummary(preset) });
    try { return reply(await interpret(topic, clamp(Number(body.players) || 4, 4, MAX_PLAYERS) * LOTS_PER_PLAYER + 4, Boolean(body.confirmed))); }
    catch (e) { console.error('Theme failed', String(e)); return fail(outOfCredit(null, e) ? 'Typed themes are unavailable: the OpenAI account behind Draft Night has run out of credit. Pick a ready-made theme, or add credit at platform.openai.com.' : e instanceof Error && e.message.startsWith('Could not') ? e.message : 'Could not create that theme right now. Try again or pick a ready-made one.', 502); }
  }
  if (u.pathname === '/api/create' && req.method === 'POST') {
    sweep();
    const theme = PRESETS.find(p => p.id === body.theme) || themes.get(String(body.theme));
    if (!theme) return fail('That theme has expired. Please choose it again.');
    const cpu = Boolean(body.cpu);
    const maxP = themeSummary(theme).maxPlayers;
    const r: Room = {
      code: newCode(), rev: 1, created: clock(), status: 'lobby', theme, budget: clamp(Math.round(Number(body.budget) || 100), 5, 1000),
      capacity: cpu ? 2 : clamp(Math.round(Number(body.capacity) || 2), 2, maxP), cpu, players: [], tokens: [],
      deckBases: shuffle(theme.bases), deckAdds: shuffle(theme.items), lots: [], lot: 0,
      auction: { bid: 0, leader: null, turn: null, passed: [], phase: 'bidding', deadline: 0, log: [], result: null },
      history: [], lotImg: {}, baseImg: 'none', imageError: '', worlds: [], verdict: null,
    };
    rooms.set(r.code, r);
    join(r, cleanName(body.name, 'Player 1'));
    if (cpu) join(r, 'CPU', true);
    // Every picture for the whole game is prepared while the lobby fills; the host starts once they are ready.
    genBase(r); prefetch(r, r.capacity * (hasBases(theme) ? 4 : LOTS_PER_PLAYER));
    return reply({ code: r.code, player: 0, token: r.tokens[0], room: view(r) });
  }
  if (u.pathname === '/api/join' && req.method === 'POST') {
    const r = room(); if (!r) return fail('Room not found', 404);
    tick(r);
    if (r.status !== 'lobby' || r.players.length >= r.capacity) return fail(r.status === 'lobby' ? 'That room is full' : 'That game has already started');
    const p = join(r, cleanName(body.name, 'Player ' + (r.players.length + 1)));
    return reply({ code: r.code, player: p, token: r.tokens[p], room: view(r) });
  }
  if (u.pathname === '/api/room') {
    const r = room(); if (!r) return fail('Room not found', 404);
    const p = Number(u.searchParams.get('p'));
    if (Number.isInteger(p) && r.tokens[p] && u.searchParams.get('t') === r.tokens[p]) {
      const wasAway = r.status === 'playing' && away(r, p); r.players[p].seen = clock(); if (wasAway) bump(r);
    }
    tick(r);
    if (Number(u.searchParams.get('rev')) === r.rev) return reply({ same: true, rev: r.rev, now: clock() });
    return reply(view(r));
  }
  if (u.pathname === '/api/action' && req.method === 'POST') {
    const r = room(); if (!r) return fail('Room not found', 404);
    const p = Number(body.player);
    if (!Number.isInteger(p) || !r.tokens[p] || body.token !== r.tokens[p]) return fail('Session expired. Please rejoin.', 403);
    r.players[p].seen = clock();
    tick(r);
    try {
      if (body.type === 'start') {
        if (p !== 0) return fail('Only the host can start');
        if (r.status !== 'lobby' || r.players.length < 2) return fail('Waiting for at least two players');
        const ready = prep(r);
        // Pictures first: the game only starts without them if the image service has failed and the host chooses to.
        if (ready.enabled && ready.ready + ready.failed < ready.total) return fail(`Still preparing pictures (${ready.ready}/${ready.total})`);
        if (ready.enabled && ready.failed && !body.force) return fail(r.imageError || 'Some pictures could not be made. Start anyway?');
        start(r);
      } else if (body.type === 'bid' || body.type === 'pass') {
        if (r.status !== 'playing') return fail('The auction is not running');
        // Optimistic check: the action must be based on the lot and price the player saw.
        if (Number(body.lot) !== r.lot || Number(body.seen) !== r.auction.bid) return reply({ error: 'The bidding moved on. Check the new price.', room: view(r) }, 409);
        if (body.type === 'bid') bid(r, p, Number(body.amount)); else pass(r, p);
      } else return fail('Unknown action');
    } catch (e) { return reply({ error: e instanceof Error ? e.message : 'Action failed', room: view(r) }, 400); }
    bump(r); tick(r);
    return reply(view(r));
  }
  return fail('Not found', 404);
}
Bun.serve({ hostname: '0.0.0.0', port: Number(Bun.env.PORT || 3000), async fetch(req) { try { return await handle(req); } catch (e) { console.error('Request failed', String(e)); return fail('Request failed', 500); } } });
