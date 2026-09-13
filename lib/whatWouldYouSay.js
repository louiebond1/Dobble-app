// "What Would You Say?" question bank — 270 questions across 8 sub-categories.
// Grows over time: append more entries with unique ids; nothing else needs to change.
// `target`: "either" means the {target} placeholder in `question` is swapped for
// "Louie"/"Ariel" client-side at render time; "Louie"/"Ariel" means the question is
// one-directional and always asked about that specific person.
// `difficulty` sets round scoring: easy +75, medium +100, hard +150.
const CATEGORIES = {
  funny: { label: '😂 Funny / Unhinged', weight: 25 },
  relationship: { label: '💑 Relationship', weight: 20 },
  food: { label: '🍕 Food & Drink', weight: 15 },
  travel: { label: '✈️ Travel & Memories', weight: 15 },
  everyday: { label: '🏠 Everyday Life', weight: 10 },
  entertainment: { label: '🎭 Entertainment & Culture', weight: 10 },
  romantic: { label: '❤️ Romantic', weight: 3 },
  difficult: { label: '🧠 Difficult', weight: 2 },
};

const DIFFICULTY_POINTS = { easy: 75, medium: 100, hard: 150 };

const QUESTIONS = [
  {
    "id": "funny-001",
    "category": "funny",
    "difficulty": "easy",
    "question": "What would {target} do if they found £1,000 in cash lying on the pavement?",
    "options": [
      "Hand it straight in at the nearest police station",
      "Pocket it and tell absolutely no one",
      "Blow it within the hour on something ridiculous",
      "Split it — half into savings, half on a treat immediately"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "funny-002",
    "category": "funny",
    "difficulty": "medium",
    "question": "In a zombie apocalypse, how would {target} most likely meet their end?",
    "options": [
      "Tripping over their own feet while running away",
      "Going back for their phone charger",
      "Trusting a stranger who was obviously already bitten",
      "Refusing to leave the sofa until it was too late"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "funny-003",
    "category": "funny",
    "difficulty": "easy",
    "question": "If {target} went on a reality dating show as a contestant, what would get them sent home first?",
    "options": [
      "Falling asleep during a group date",
      "Starting an unnecessary argument at the villa dinner",
      "Being way too honest in the confession booth",
      "Getting caught complaining about the food on camera"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "funny-004",
    "category": "funny",
    "difficulty": "easy",
    "question": "What would {target} actually do if their partner suddenly shaved their head with zero warning?",
    "options": [
      "Burst out laughing before saying anything supportive",
      "Cry — genuinely, not a joke",
      "Pretend to love it while secretly panicking",
      "Immediately start planning how to fix it"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "funny-005",
    "category": "funny",
    "difficulty": "medium",
    "question": "If {target} had £10,000 to spend in exactly one hour, what would they blow most of it on?",
    "options": [
      "A spontaneous flight and hotel somewhere neither of them has been",
      "Designer clothes and shoes, no budget in mind",
      "Upgrading everything in the flat at once",
      "Something absurd and impulsive they'd never admit to planning"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "funny-006",
    "category": "funny",
    "difficulty": "hard",
    "question": "If a news reporter grabbed {target} on the street for a random vox pop, what unhinged opinion would they confidently give?",
    "options": [
      "A wildly specific conspiracy theory about pigeons",
      "Extremely strong feelings about how people load dishwashers",
      "A completely made-up 'fact' said with total confidence",
      "An unprompted rant about Underground escalator etiquette"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "funny-007",
    "category": "funny",
    "difficulty": "medium",
    "question": "Stranded on a desert island, what one useless-but-comforting item would {target} have smuggled in their bag?",
    "options": [
      "A plushie from home",
      "A book they still haven't finished",
      "Their phone, despite having zero signal",
      "A specific snack they can't function without"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "funny-008",
    "category": "funny",
    "difficulty": "easy",
    "question": "If {target} became a superhero tomorrow, what disappointingly lame power would they end up with?",
    "options": [
      "The ability to always find a parking space",
      "Perfectly reheating leftovers without a microwave",
      "Never getting lost on the Underground",
      "Always knowing exactly when food's about to arrive"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "funny-009",
    "category": "funny",
    "difficulty": "medium",
    "question": "If {target} was forced onto a talent show with zero preparation, what would they actually perform?",
    "options": [
      "A dramatic lip-sync to a musical theatre showstopper",
      "An improvised stand-up routine about their partner",
      "A dance routine that's mostly made up on the spot",
      "A painfully off-key karaoke song, sung with full commitment"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "funny-010",
    "category": "funny",
    "difficulty": "hard",
    "question": "If {target} accidentally started a cult, what would be the one non-negotiable rule?",
    "options": [
      "Everyone must agree with them about food opinions",
      "No one is allowed to interrupt during a TV show",
      "Mandatory group participation in Rummikub",
      "Everyone has to compliment their outfit daily"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "funny-011",
    "category": "funny",
    "difficulty": "easy",
    "question": "What's the most likely reason {target} would get politely asked to leave a supermarket?",
    "options": [
      "Taste-testing something before paying for it",
      "Getting into a heated debate with a stranger over the last item on a shelf",
      "Blocking the aisle having a full conversation on the phone",
      "Trying to return something without a receipt and refusing to back down"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "funny-012",
    "category": "funny",
    "difficulty": "medium",
    "question": "If an animal got loose at the zoo, which reaction sounds most like {target}?",
    "options": [
      "Freeze completely and just scream",
      "Try to film it for social media instead of running",
      "Grab the nearest stranger and use them as a shield",
      "Calmly walk away like nothing is happening"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "funny-013",
    "category": "funny",
    "difficulty": "easy",
    "question": "If {target} won a goldfish at a fair, what would they name it?",
    "options": [
      "Something dramatic and overly theatrical",
      "A pun they'd find hilarious and no one else would",
      "Just naming it after themselves",
      "Something borrowed from a Hunger Games or Wicked character"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "funny-014",
    "category": "funny",
    "difficulty": "easy",
    "question": "When {target} is running late, what's their actual go-to excuse?",
    "options": [
      "Blaming the Underground for a delay that didn't happen",
      "Claiming they 'just left' when they clearly haven't",
      "Saying they lost track of time getting ready",
      "Blaming their partner for making them late"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "funny-015",
    "category": "funny",
    "difficulty": "medium",
    "question": "If {target} were cursed to turn into a household object, what would it be?",
    "options": [
      "The remote control, because everyone would fight over them",
      "A comfy blanket everyone hoards",
      "The Diet Coke in the fridge — everyone wants a piece",
      "A phone charger, always missing when needed most"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "funny-016",
    "category": "funny",
    "difficulty": "easy",
    "question": "Who cries first during the sad part of a musical like Wicked or Hamilton — and is it {target}?",
    "options": [
      "Yes, instantly, no shame about it",
      "Yes, but they'll deny it after",
      "No, they hold it together every time",
      "No, but they make fun of their partner for crying"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "funny-017",
    "category": "funny",
    "difficulty": "medium",
    "question": "If {target} had to enter a wrestling ring with an over-the-top persona, what would their entrance be like?",
    "options": [
      "Walking out to a musical theatre power ballad",
      "A dramatic entrance with a plushie held aloft as a mascot",
      "Storming in already mid-argument with the crowd",
      "Way too polite, apologising to the opponent before the match starts"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "funny-018",
    "category": "funny",
    "difficulty": "hard",
    "question": "If {target} was helping plan a surprise party, what would most likely blow the surprise?",
    "options": [
      "Accidentally texting the wrong person the details",
      "Getting way too excited and dropping a hint out loud",
      "Being visibly suspicious the entire week beforehand",
      "Forgetting to hide the evidence somewhere obvious"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "funny-019",
    "category": "funny",
    "difficulty": "medium",
    "question": "If {target} became a low-level criminal, what would they actually get caught doing?",
    "options": [
      "Jaywalking dramatically in front of a police officer",
      "Trying to sneak snacks into the cinema and getting stopped",
      "Attempting to return worn clothes to a shop",
      "Getting caught mid-argument while trying to skip a queue"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "funny-020",
    "category": "funny",
    "difficulty": "hard",
    "question": "If {target} and their partner were handcuffed together for 24 hours, what would end the honeymoon phase fastest?",
    "options": [
      "One of them needing the bathroom within the first hour",
      "Trying to sleep in completely different positions",
      "One of them wanting to nap while the other wants to go out",
      "Arguing over whose arm gets to rest where"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "funny-021",
    "category": "funny",
    "difficulty": "medium",
    "question": "If the plane made a sudden emergency landing, how would {target} actually react?",
    "options": [
      "Stay eerily calm and start narrating it like a movie",
      "Grip their partner's hand and not let go until they're on the ground",
      "Immediately start making a joke to cope with the panic",
      "Start listing everything they never got to do"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "funny-022",
    "category": "funny",
    "difficulty": "easy",
    "question": "If {target} went on Bake Off, what would go wrong first?",
    "options": [
      "Forgetting to actually turn the oven on",
      "Panicking and serving it raw under a nice glaze",
      "Running dramatically out of time on the showstopper",
      "Accidentally using salt instead of sugar"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "funny-023",
    "category": "funny",
    "difficulty": "medium",
    "question": "If {target} owned a parrot that copied everything they said, what phrase would it learn first?",
    "options": [
      "Their most-used nagging phrase to their partner",
      "A dramatic complaint about being hungry",
      "Something they yell at the TV during football",
      "An overused pet name for their partner"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "funny-024",
    "category": "funny",
    "difficulty": "easy",
    "question": "If {target} became the Spurs mascot for a day, how would it go?",
    "options": [
      "They'd take it way too seriously and steal the show",
      "They'd get distracted and miss their cue completely",
      "They'd trip over the costume in front of everyone",
      "They'd start an unplanned dance-off with the crowd"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "funny-025",
    "category": "funny",
    "difficulty": "hard",
    "question": "If {target} had to give a TED talk with zero notice, what topic would they confidently bluff their way through?",
    "options": [
      "Why their favourite food is objectively the best food in the world",
      "How to win at Rummikub every single time",
      "The correct way to survive London Underground rush hour",
      "Why everyone should get a cavapoo or labradoodle"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "funny-026",
    "category": "funny",
    "difficulty": "medium",
    "question": "If {target} got wrongly arrested and had to give an alibi on the spot, what would they blurt out?",
    "options": [
      "A wildly overcomplicated story that makes them sound guiltier",
      "The truth, but told so nervously no one believes it",
      "Immediately asking to call their partner instead of a lawyer",
      "A alibi that accidentally incriminates their partner instead"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "funny-027",
    "category": "funny",
    "difficulty": "easy",
    "question": "Which karaoke moment sounds most like {target} absolutely butchering a song?",
    "options": [
      "Belting a power ballad completely off-key with full confidence",
      "Forgetting every single lyric after the first line",
      "Picking a song way outside their vocal range on purpose",
      "Turning it into a dramatic musical theatre performance instead of singing it straight"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "funny-028",
    "category": "funny",
    "difficulty": "easy",
    "question": "On the scariest ride at a horror theme park, what does {target} actually do?",
    "options": [
      "Scream the entire time and grab whoever's nearest",
      "Go completely silent and rigid with fear",
      "Laugh nervously through the whole thing",
      "Try to act unbothered and fail immediately"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "funny-029",
    "category": "funny",
    "difficulty": "medium",
    "question": "If {target} won a free tattoo with zero say in the placement, what would they secretly hope it'd be?",
    "options": [
      "Something tiny and meaningful, like their initials",
      "A ridiculous cartoon they'd regret within a year",
      "Their partner's name, no hesitation",
      "A tiny symbol from one of their trips together"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "funny-030",
    "category": "funny",
    "difficulty": "medium",
    "question": "If the flat caught fire and everyone was already safe, what weird item would {target} still run back in for?",
    "options": [
      "A specific plushie off the bed",
      "Their phone, purely for the photos",
      "A single, oddly specific item of clothing",
      "A book they haven't even finished reading yet"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "funny-031",
    "category": "funny",
    "difficulty": "easy",
    "question": "If {target} had to eat the exact same meal every single day for a year, which would they actually survive on?",
    "options": [
      "Pizza, no debate needed",
      "Pasta in some form, every time",
      "A Caesar salad, somehow never getting bored",
      "Sushi, no matter the cost"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "funny-032",
    "category": "funny",
    "difficulty": "hard",
    "question": "If {target} became the dictator of a tiny country overnight, what would their first official decree be?",
    "options": [
      "Mandatory nap time nationwide",
      "Banning anyone from talking during films",
      "Free ice cream for all citizens, funded however necessary",
      "Compulsory Rummikub tournaments every weekend"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "funny-033",
    "category": "funny",
    "difficulty": "easy",
    "question": "In a staring contest with their partner, who caves first — and would it be {target}?",
    "options": [
      "Yes, they'd crack within seconds laughing",
      "Yes, but only because their partner pulls a face",
      "No, they'd win out of sheer stubbornness",
      "No, but only by accident — they'd zone out and win"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "funny-034",
    "category": "funny",
    "difficulty": "medium",
    "question": "If {target} had superhuman strength for exactly one day, what's the first silly thing they'd do with it?",
    "options": [
      "Carry their partner around everywhere just because they can",
      "Open every stubborn jar lid in the flat out of spite",
      "Try to move furniture that's been annoying them for months",
      "Show off to strangers for absolutely no reason"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "funny-035",
    "category": "funny",
    "difficulty": "medium",
    "question": "If {target} had to busk on the London Underground for money, what would their act be?",
    "options": [
      "An enthusiastic but rough acoustic cover of a musical theatre song",
      "Some kind of improvised dance routine",
      "Loudly reciting movie lines for tips",
      "Just standing there awkwardly holding a hat, too shy to actually perform"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "funny-036",
    "category": "funny",
    "difficulty": "easy",
    "question": "How does {target} actually behave when they're losing at Rummikub?",
    "options": [
      "Gets suspiciously quiet and intensely focused",
      "Starts subtly trying to distract their partner",
      "Openly complains the tiles are rigged against them",
      "Flips the board energy entirely and just laughs it off"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "funny-037",
    "category": "funny",
    "difficulty": "hard",
    "question": "If aliens abducted {target} and offered to send them home in exchange for one thing, what would they bargain with?",
    "options": [
      "Every embarrassing childhood photo, gladly handed over",
      "Their least favourite item of clothing, no hesitation",
      "A full confession of every white lie they've ever told",
      "Their partner's phone passcode, without asking permission first"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "funny-038",
    "category": "funny",
    "difficulty": "medium",
    "question": "If {target} had to describe their most annoying flatmate habit honestly, what would it be?",
    "options": [
      "Leaving cups and plates around instead of washing up straight away",
      "Hogging the duvet or the remote, no negotiation",
      "Taking forever to get ready when they're already 'nearly done'",
      "Snacking on shared food and denying it happened"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "funny-039",
    "category": "funny",
    "difficulty": "easy",
    "question": "If {target} went viral and became briefly famous, what's the most likely reason?",
    "options": [
      "Tripping spectacularly in public on camera",
      "Saying something accidentally hilarious that got clipped",
      "Being caught doing something oddly wholesome",
      "Losing it dramatically over something completely trivial"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "funny-040",
    "category": "funny",
    "difficulty": "medium",
    "question": "What's most likely to make {target} start an argument with a total stranger online?",
    "options": [
      "Someone being wrong about a football opinion",
      "A hot take about food that's clearly incorrect",
      "Someone being rude in the comments for no reason",
      "A ridiculous take on a TV show or musical they love"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "funny-041",
    "category": "funny",
    "difficulty": "medium",
    "question": "If {target} could only have one wildly useless superpower forever, which would they actually pick?",
    "options": [
      "Always knowing exactly what's for dinner before anyone says it",
      "Never losing at board games again, specifically Rummikub",
      "Instantly knowing when a plane's about to be delayed",
      "Always finding the comfiest seat in any room"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "funny-042",
    "category": "funny",
    "difficulty": "easy",
    "question": "Who's more likely to cry watching Elphaba's big number in Wicked — is it {target}?",
    "options": [
      "Absolutely, every single time, no shame",
      "Only if they've had a rough week already",
      "No, but they get suspiciously quiet",
      "No, they're too busy judging the staging"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "funny-043",
    "category": "funny",
    "difficulty": "hard",
    "question": "If {target} woke up in medieval times with no explanation, what job would they realistically end up with?",
    "options": [
      "Town crier, purely because they love an audience",
      "Jester, whether they meant to or not",
      "Someone who gets banished within a week for being too opinionated",
      "A baker, mostly so they'd have unlimited access to food"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "funny-044",
    "category": "funny",
    "difficulty": "easy",
    "question": "How does {target} react the second the wifi goes down?",
    "options": [
      "Full meltdown within the first two minutes",
      "Weirdly calm, actually enjoys the break",
      "Immediately blames their partner for it somehow",
      "Starts frantically trying every fix they've ever heard of"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "funny-045",
    "category": "funny",
    "difficulty": "medium",
    "question": "If {target} had to pick a completely over-the-top wrestling name for themselves, what energy would it have?",
    "options": [
      "Something dramatic referencing their favourite musical villain",
      "A pun based on their favourite food",
      "Something built entirely around being terrifyingly competitive at board games",
      "Just their actual name but shouted with way too much confidence"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "funny-046",
    "category": "funny",
    "difficulty": "easy",
    "question": "Who's more likely to get them both lost despite having Google Maps open — is it {target}?",
    "options": [
      "Yes, confidently walking the wrong direction anyway",
      "Yes, but only because they're distracted talking",
      "No, they're annoyingly good at directions",
      "No, but they'll still somehow get blamed for it"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "funny-047",
    "category": "funny",
    "difficulty": "hard",
    "question": "If {target} had to survive an entire day only speaking in movie quotes, how long before they'd give up?",
    "options": [
      "Less than an hour — they'd crack almost immediately",
      "They'd actually commit to the whole day out of stubbornness",
      "They'd forget the rule entirely within minutes",
      "They'd get so into it their partner would beg them to stop"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "funny-048",
    "category": "funny",
    "difficulty": "medium",
    "question": "How good is {target} at lying with a straight face, honestly?",
    "options": [
      "Terrible — they laugh and give it away instantly",
      "Surprisingly good — they've gotten away with plenty",
      "Fine with strangers, hopeless with their partner",
      "Fine with their partner, terrible with everyone else"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "funny-049",
    "category": "funny",
    "difficulty": "medium",
    "question": "If {target} had a time machine for exactly one hour, where would they actually go?",
    "options": [
      "Back to one specific holiday, to relive it exactly",
      "Forward, just to see if they're still together and happy",
      "Back to fix one embarrassing moment from their past",
      "Nowhere specific — they'd just go somewhere in history for fun"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "funny-050",
    "category": "funny",
    "difficulty": "easy",
    "question": "How does {target} react when they lose a close game of Rummikub?",
    "options": [
      "Demands an immediate rematch, no exceptions",
      "Sulks dramatically for a suspiciously long time",
      "Accuses their partner of cheating, at least half-joking",
      "Actually takes it well and moves on straight away"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "funny-051",
    "category": "funny",
    "difficulty": "easy",
    "question": "If {target} were a dog breed, which one would actually suit their personality?",
    "options": [
      "A cavapoo — sweet but secretly a lot of energy",
      "A labradoodle — big presence, loves everyone instantly",
      "Something small and dramatic that demands constant attention",
      "A golden retriever — relentlessly happy about everything"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "funny-052",
    "category": "funny",
    "difficulty": "medium",
    "question": "If {target} had to wear their partner's entire wardrobe for a week, how would they cope?",
    "options": [
      "Actually enjoy it and refuse to give it back after",
      "Complain constantly but secretly not mind",
      "Struggle within a day and cave completely",
      "Try to make it work and somehow pull it off anyway"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "funny-053",
    "category": "funny",
    "difficulty": "medium",
    "question": "If {target} got told off inside the Sistine Chapel, what would they most likely have been doing?",
    "options": [
      "Talking too loudly mid-tour without realising",
      "Trying to sneak a photo despite the no-photo rule",
      "Lying on the floor to get a better look at the ceiling",
      "Being generally too enthusiastic and blocking the walkway"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "funny-054",
    "category": "funny",
    "difficulty": "easy",
    "question": "If {target} got to pick the puppy's ridiculous middle name, what direction would they go?",
    "options": [
      "Something dramatic, straight out of a musical",
      "A pun based on one of their favourite foods",
      "Something borrowed from a plushie's name at home",
      "Their own initials worked in somehow"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "funny-055",
    "category": "funny",
    "difficulty": "medium",
    "question": "If {target} got pulled over and tried to talk their way out of a parking ticket, what approach would they take?",
    "options": [
      "Full charm offensive, complimenting the officer relentlessly",
      "Over-explaining with a wildly elaborate excuse",
      "Playing completely innocent and confused about the rules",
      "Just accepting it immediately, no fight at all"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "funny-056",
    "category": "funny",
    "difficulty": "hard",
    "question": "If {target} got stuck in a lift with their partner for two hours, who would crack first and how?",
    "options": [
      "Them, by turning it into a game to pass the time",
      "Them, by getting weirdly anxious within minutes",
      "Their partner would crack first and {target} would find it hilarious",
      "Neither — they'd both just sit in comfortable silence"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "funny-057",
    "category": "funny",
    "difficulty": "medium",
    "question": "On a long road trip, what's {target}'s worst habit as the navigator?",
    "options": [
      "Confidently giving directions that are completely wrong",
      "Getting distracted by the playlist and missing the turn",
      "Falling asleep mid-journey and leaving their partner to figure it out",
      "Backseat driving even when they're the one holding the map"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "funny-058",
    "category": "funny",
    "difficulty": "easy",
    "question": "If {target} had to pick a stage name to join a boy band tomorrow, what direction would they go?",
    "options": [
      "Something dramatically over-the-top and theatrical",
      "A version of their real name that barely counts as a stage name",
      "Something based on their favourite food or drink",
      "Something that references a football team they love"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "funny-059",
    "category": "funny",
    "difficulty": "medium",
    "question": "If {target} was a contestant on Survivor, why would they most likely be voted off first?",
    "options": [
      "Being too openly strategic and scaring everyone off",
      "Being too likeable and seen as a threat",
      "Refusing to eat the survival food and getting weak fast",
      "Starting unnecessary drama within the first two days"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "funny-060",
    "category": "funny",
    "difficulty": "hard",
    "question": "Which conspiracy theory would {target} most plausibly fall for, at least a little?",
    "options": [
      "Something about a celebrity secretly being replaced",
      "A theory about a food brand changing its recipe in secret",
      "Something wildly overblown about air travel",
      "A completely baseless one about their favourite sports team being sabotaged"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "funny-061",
    "category": "funny",
    "difficulty": "hard",
    "question": "If {target} became a spy, what would blow their cover almost immediately?",
    "options": [
      "Getting way too invested in a conversation and forgetting the mission",
      "Being physically unable to lie convincingly to their partner",
      "Ordering their actual favourite food out of habit, in character or not",
      "Laughing at the wrong moment during a serious operation"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "funny-062",
    "category": "funny",
    "difficulty": "easy",
    "question": "How does {target} usually respond to the fire alarm going off at 3am?",
    "options": [
      "Sleeps straight through it, no exceptions",
      "Panics instantly and grabs random items on the way out",
      "Assumes it's nothing and goes back to bed anyway",
      "Wide awake instantly, fully prepared for an emergency"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "funny-063",
    "category": "funny",
    "difficulty": "medium",
    "question": "If the Furry Potato plushie somehow came to life for a day, what would {target} do first?",
    "options": [
      "Introduce it to the dog immediately",
      "Take it everywhere and document the whole day",
      "Ask it a genuinely serious question, half expecting an answer",
      "Get weirdly protective and not let anyone else near it"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "funny-064",
    "category": "funny",
    "difficulty": "medium",
    "question": "If {target} ended up on a 'wanted' poster for something minor, what would the crime most likely be?",
    "options": [
      "Public disturbance for arguing too loudly about football",
      "Petty theft, specifically of someone else's food",
      "Causing a scene while trying to return something to a shop",
      "Impersonating an official just to skip a queue"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "funny-065",
    "category": "funny",
    "difficulty": "easy",
    "question": "If {target} had unlimited money to spend for just one day, what's the weirdest thing they'd actually buy?",
    "options": [
      "A ridiculously oversized plushie collection",
      "A private chef purely for their favourite meal on demand",
      "Renting out an entire cinema just for the two of them",
      "Buying way too many of one tiny useless gadget"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "relationship-001",
    "category": "relationship",
    "difficulty": "easy",
    "question": "What would {target} say is our best trip together?",
    "options": [
      "Venice",
      "Rome",
      "Montanejos",
      "New York City"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "relationship-002",
    "category": "relationship",
    "difficulty": "medium",
    "question": "Which of our shared favourites would {target} say instantly feels like 'home'?",
    "options": [
      "Mac & Cheese",
      "The beige cavapoo curled up on the sofa",
      "Bagels on a lazy morning",
      "Rummikub after dinner"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "relationship-003",
    "category": "relationship",
    "difficulty": "medium",
    "question": "Which memory would {target} choose to relive above all others?",
    "options": [
      "Swimming in the Montanejos gorge",
      "The day we got the puppy",
      "The Time Out Market photobooth strip",
      "The birthday party"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "relationship-004",
    "category": "relationship",
    "difficulty": "easy",
    "question": "What would {target} say is the ideal way to spend a rainy day together?",
    "options": [
      "Board games and snacks",
      "A film marathon",
      "Reading side by side",
      "Cooking something ambitious"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "relationship-005",
    "category": "relationship",
    "difficulty": "medium",
    "question": "What would {target} say we do best together?",
    "options": [
      "Make each other laugh at the worst moments",
      "Plan a trip down to the last detail",
      "Argue and make up fast",
      "Do absolutely nothing together"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "relationship-006",
    "category": "relationship",
    "difficulty": "medium",
    "question": "Which would {target} say is the best surprise their partner has ever pulled off?",
    "options": [
      "A surprise trip booked in secret",
      "A last-minute ticket to a show they wanted",
      "Turning up somewhere they didn't expect",
      "Remembering something they mentioned once and acting on it"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "relationship-007",
    "category": "relationship",
    "difficulty": "medium",
    "question": "What would {target} say their partner's love language is?",
    "options": [
      "Physical closeness",
      "Small thoughtful gestures",
      "Uninterrupted quality time",
      "Doing the annoying chore first"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "relationship-008",
    "category": "relationship",
    "difficulty": "easy",
    "question": "Which shared favourite would {target} say says the most about us as a couple?",
    "options": [
      "Rummikub",
      "The beige cavapoo",
      "'A + L'",
      "Hamilton"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "relationship-009",
    "category": "relationship",
    "difficulty": "medium",
    "question": "What would {target} say is the couple habit we should never lose?",
    "options": [
      "Ice cream after a long day",
      "Keeping the 'table is reserved' joke alive",
      "Splitting dessert down the middle",
      "Talking through the day before falling asleep"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "relationship-010",
    "category": "relationship",
    "difficulty": "medium",
    "question": "What would {target} say is the household task they secretly don't mind doing?",
    "options": [
      "The food shop",
      "Cooking",
      "Tidying after a trip",
      "Planning the next holiday"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "relationship-011",
    "category": "relationship",
    "difficulty": "medium",
    "question": "What would {target} say is our funniest shared memory?",
    "options": [
      "The McDonald's escalator photo in Rome",
      "Rowing in circles in Retiro Park",
      "Losing badly at Rummikub",
      "Getting lost looking for the Sistine Chapel"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "relationship-012",
    "category": "relationship",
    "difficulty": "easy",
    "question": "What would {target} say is the best way to spend a lazy Sunday together?",
    "options": [
      "Bagels and a slow morning",
      "A film and takeout",
      "A long walk and a coffee",
      "Sorting through old trip photos"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "relationship-013",
    "category": "relationship",
    "difficulty": "medium",
    "question": "Which of these would {target} say is the most 'us' thing about how we travel?",
    "options": [
      "Photographing every bridge we cross",
      "Getting lost and laughing about it",
      "Finding the nearest gelato within an hour",
      "Arguing about the map for five minutes, then figuring it out"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "relationship-014",
    "category": "relationship",
    "difficulty": "medium",
    "question": "What would {target} say is the thing their partner does that makes them feel calmest?",
    "options": [
      "Sitting close in silence",
      "Making them a coffee without asking",
      "Putting on Hamilton",
      "Bringing up an old trip to make them laugh"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "relationship-015",
    "category": "relationship",
    "difficulty": "easy",
    "question": "Which plushie would {target} say best represents their partner's personality?",
    "options": [
      "A Furry Potato",
      "Smudge the Jellycat Cow",
      "Lemming",
      "The Bunny Teddy Bear"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "relationship-016",
    "category": "relationship",
    "difficulty": "medium",
    "question": "What would {target} say is the small thing their partner does that they secretly love?",
    "options": [
      "Narrating things out loud that don't need narrating",
      "Reorganising the trip photos the moment they land",
      "Saving the green M&M for last",
      "Falling asleep before the film ends"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "relationship-017",
    "category": "relationship",
    "difficulty": "medium",
    "question": "What would {target} say is our biggest disagreement as a couple, in the end?",
    "options": [
      "Where to eat",
      "How much to plan versus wing it",
      "Who's navigating",
      "What to watch"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "relationship-018",
    "category": "relationship",
    "difficulty": "medium",
    "question": "Which would {target} say is the trip that tested us the most, in a good way?",
    "options": [
      "Getting to Montanejos with no signal",
      "Losing the map in Rome",
      "The overnight flight to New York",
      "The heat in Madrid"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "relationship-019",
    "category": "relationship",
    "difficulty": "easy",
    "question": "What would {target} say is the best gift they've given their partner?",
    "options": [
      "The puppy",
      "A surprise trip",
      "Tickets to a show",
      "Something small they'd mentioned once and forgot"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "relationship-020",
    "category": "relationship",
    "difficulty": "medium",
    "question": "What would {target} say they're most looking forward to with their partner?",
    "options": [
      "The next big trip",
      "A bigger place together",
      "More lazy Sundays",
      "Watching the dog grow up"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "relationship-021",
    "category": "relationship",
    "difficulty": "medium",
    "question": "Which of these would {target} say is the most 'them' way to apologise?",
    "options": [
      "Turning up with their favourite food",
      "Just saying sorry straight out",
      "Making a joke to break the tension first",
      "Doing the thing they were supposed to do without being asked"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "relationship-022",
    "category": "relationship",
    "difficulty": "easy",
    "question": "What would {target} say is our go-to comfort food as a couple?",
    "options": [
      "Mac & Cheese",
      "Pizza",
      "Sushi",
      "Bagels"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "relationship-023",
    "category": "relationship",
    "difficulty": "medium",
    "question": "What would {target} say is the trait they'd most want to pass on, if we had kids?",
    "options": [
      "Their sense of humour",
      "Their stubbornness",
      "Their competitiveness",
      "Their patience"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "relationship-024",
    "category": "relationship",
    "difficulty": "medium",
    "question": "Which would {target} say their partner takes way too seriously?",
    "options": [
      "Winning at Rummikub",
      "Spurs results",
      "Getting the photo just right",
      "Being on time for the plane"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "relationship-025",
    "category": "relationship",
    "difficulty": "medium",
    "question": "What would {target} say their partner is most likely to cry at?",
    "options": [
      "A wedding speech",
      "The end of Hamilton",
      "A photo from an old trip",
      "Nothing — they'd deny it"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "relationship-026",
    "category": "relationship",
    "difficulty": "easy",
    "question": "What would {target} say is the best souvenir from any trip?",
    "options": [
      "The photobooth strip from NYC",
      "A magnet from Rome",
      "Nothing but the photos",
      "Something ridiculous from a gift shop"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "relationship-027",
    "category": "relationship",
    "difficulty": "medium",
    "question": "What would {target} say is the one thing their partner does that keeps them grounded?",
    "options": [
      "Making them slow down and enjoy the moment",
      "Talking them out of a bad decision",
      "Reminding them to eat",
      "Making them laugh right when they need it"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "relationship-028",
    "category": "relationship",
    "difficulty": "medium",
    "question": "Which would {target} say is our most 'married couple' moment so far?",
    "options": [
      "Arguing over the thermostat",
      "Finishing each other's orders at a restaurant",
      "Doing a food shop together like it's a date",
      "Falling asleep on the sofa mid-conversation"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "relationship-029",
    "category": "relationship",
    "difficulty": "easy",
    "question": "What would {target} say is the best candid photo for a lock screen?",
    "options": [
      "The Rome escalator photo",
      "Rowing the boat in Retiro Park",
      "The Time Out Market photobooth strip",
      "The Venice daytime bridge photo"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "relationship-030",
    "category": "relationship",
    "difficulty": "medium",
    "question": "What would {target} say their partner needs most after a bad day?",
    "options": [
      "Twenty minutes alone first",
      "A hug and their comfort food",
      "To talk it out immediately",
      "A distraction, like a film or a game"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "relationship-031",
    "category": "relationship",
    "difficulty": "medium",
    "question": "What would {target} say is the thing about their partner that surprised them most, early on?",
    "options": [
      "How competitive they are at board games",
      "How much they cry at musicals",
      "How organised their travel planning is",
      "How easily they talk to strangers"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "relationship-032",
    "category": "relationship",
    "difficulty": "easy",
    "question": "Which activity would {target} say brings out their partner's competitive side the most?",
    "options": [
      "Rummikub",
      "Anything involving Spurs",
      "The Ninja Warrior Kit",
      "Deciding where to eat"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "relationship-033",
    "category": "relationship",
    "difficulty": "medium",
    "question": "What would {target} say is the thing they'd want their partner to never change?",
    "options": [
      "Their laugh",
      "How hard they try at everything",
      "Their honesty",
      "Their patience with them"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "relationship-034",
    "category": "relationship",
    "difficulty": "medium",
    "question": "Which would {target} say was the moment we became a 'we' instead of two people dating?",
    "options": [
      "Getting the puppy together",
      "The first time we said 'I love you'",
      "Moving in together, or planning to",
      "The first trip we booked together"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "relationship-035",
    "category": "relationship",
    "difficulty": "easy",
    "question": "What would {target} say is the best thing about a lie-in together?",
    "options": [
      "No alarms, no plans",
      "The dog sneaking onto the bed",
      "Talking about nothing for an hour",
      "Whoever loses rock-paper-scissors makes breakfast"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "relationship-036",
    "category": "relationship",
    "difficulty": "medium",
    "question": "What would {target} say is the thing their partner is better at handling than they are?",
    "options": [
      "Confrontation",
      "Getting lost without panicking",
      "Big decisions",
      "Saying no to plans"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "relationship-037",
    "category": "relationship",
    "difficulty": "medium",
    "question": "What would {target} say is the most 'them' way to show love without saying it?",
    "options": [
      "Making a coffee exactly the right way",
      "Remembering a tiny preference from ages ago",
      "Saving them the best bit of food",
      "Showing up early to something that matters"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "relationship-038",
    "category": "relationship",
    "difficulty": "easy",
    "question": "Which would {target} say is the better travel style for us?",
    "options": [
      "Plan every hour",
      "Wing it completely",
      "Plan the big things, wing the rest",
      "Let one person decide everything"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "relationship-039",
    "category": "relationship",
    "difficulty": "medium",
    "question": "What would {target} say is the thing their partner worries about most, that they'd never admit?",
    "options": [
      "Not being good enough",
      "Something happening to the people they love",
      "Missing out on something",
      "Not having enough time together"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "relationship-040",
    "category": "relationship",
    "difficulty": "medium",
    "question": "Which style of photo would {target} say their partner is secretly proudest of taking?",
    "options": [
      "A perfectly timed candid",
      "A posed 'iconic' shot",
      "A goofy one that makes them laugh",
      "A moody one with great light"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "relationship-041",
    "category": "relationship",
    "difficulty": "easy",
    "question": "What would {target} say is the best thing about doing nothing together?",
    "options": [
      "No one has to perform",
      "It's when they talk the most",
      "It's the most 'them' version of each other",
      "It never feels like wasted time"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "relationship-042",
    "category": "relationship",
    "difficulty": "medium",
    "question": "What would {target} say is the thing about their partner they'd brag about to a stranger?",
    "options": [
      "How thoughtful they are",
      "How funny they are",
      "How hard they work at things they care about",
      "How loyal they are"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "relationship-043",
    "category": "relationship",
    "difficulty": "medium",
    "question": "What does Louie think is Ariel's best quality?",
    "options": [
      "How fiercely she plans a trip",
      "Her ability to make him laugh mid-argument",
      "How she remembers every tiny detail he mentions once",
      "Her competitive streak at Rummikub"
    ],
    "target": "Louie",
    "revealText": ""
  },
  {
    "id": "relationship-044",
    "category": "relationship",
    "difficulty": "medium",
    "question": "What does Ariel think is Louie's most endearing bad habit?",
    "options": [
      "Narrating the football to no one",
      "Taking twenty minutes to pick a restaurant then ordering the same thing anyway",
      "Falling asleep mid-film every time",
      "Reorganising the photos from every trip the moment they land"
    ],
    "target": "Ariel",
    "revealText": ""
  },
  {
    "id": "relationship-045",
    "category": "relationship",
    "difficulty": "medium",
    "question": "What would Louie say is the thing Ariel does that instantly calms him down?",
    "options": [
      "Making him a coffee without being asked",
      "Putting on Hamilton",
      "Just sitting next to him in silence",
      "Bringing up something from a trip to make him laugh"
    ],
    "target": "Louie",
    "revealText": ""
  },
  {
    "id": "relationship-046",
    "category": "relationship",
    "difficulty": "medium",
    "question": "What would Ariel say is the thing Louie does that makes her feel most looked after?",
    "options": [
      "Saving her the last green M&M",
      "Booking the table and keeping the joke going",
      "Carrying everything so her hands are free for photos",
      "Remembering exactly how she takes her iced coffee"
    ],
    "target": "Ariel",
    "revealText": ""
  },
  {
    "id": "relationship-047",
    "category": "relationship",
    "difficulty": "easy",
    "question": "What does Louie think Ariel would want to hear more often?",
    "options": [
      "That she was right",
      "That he's proud of her",
      "That today was a good day",
      "That he'd choose her again"
    ],
    "target": "Louie",
    "revealText": ""
  },
  {
    "id": "relationship-048",
    "category": "relationship",
    "difficulty": "medium",
    "question": "What would Ariel say is the one thing she relies on Louie for?",
    "options": [
      "Making the final call on where to eat",
      "Keeping her calm before something big",
      "Remembering the way when they're lost",
      "Making sure she actually laughs every day"
    ],
    "target": "Ariel",
    "revealText": ""
  },
  {
    "id": "relationship-049",
    "category": "relationship",
    "difficulty": "medium",
    "question": "What does Louie think Ariel is most proud of him for?",
    "options": [
      "Sticking with the science kit projects he starts",
      "Being brave enough to sing in public",
      "How he treats her friends and family",
      "Never once missing a plan they made"
    ],
    "target": "Louie",
    "revealText": ""
  },
  {
    "id": "relationship-050",
    "category": "relationship",
    "difficulty": "medium",
    "question": "What would Ariel say is the thing she's learned from being with Louie?",
    "options": [
      "To actually relax on holiday",
      "To try the food before deciding she won't like it",
      "To say what she's feeling instead of sitting on it",
      "To take more photos of the boring, ordinary days"
    ],
    "target": "Ariel",
    "revealText": ""
  },
  {
    "id": "romantic-001",
    "category": "romantic",
    "difficulty": "medium",
    "question": "What would {target} say is their favourite memory of us?",
    "options": [
      "The sunset bridge in Venice",
      "The night kiss at the Colosseum",
      "The day we got the puppy",
      "The hotel mirror selfie kiss"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "romantic-002",
    "category": "romantic",
    "difficulty": "medium",
    "question": "What would {target} choose as our perfect date?",
    "options": [
      "A quiet dinner just the two of us",
      "A show, then late-night food",
      "A day trip somewhere new",
      "Cooking together and staying in"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "romantic-003",
    "category": "romantic",
    "difficulty": "easy",
    "question": "Which photo of us would {target} want framed on the wall?",
    "options": [
      "The Venice sunset bridge",
      "The Colosseum night kiss",
      "The Time Out Market photobooth strip",
      "The hotel mirror selfie"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "romantic-004",
    "category": "romantic",
    "difficulty": "medium",
    "question": "Which moment would {target} most like to relive?",
    "options": [
      "The first kiss",
      "The Colosseum night kiss",
      "The moment they said 'I love you' first",
      "A quiet moment neither of them expected to remember"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "romantic-005",
    "category": "romantic",
    "difficulty": "medium",
    "question": "What would {target} say is the most romantic place we've ever been?",
    "options": [
      "Venice",
      "Rome",
      "Montanejos",
      "New York City"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "romantic-006",
    "category": "romantic",
    "difficulty": "easy",
    "question": "What would {target} say they'd most want to hear on a hard day?",
    "options": [
      "That everything will be okay",
      "That they're proud of them",
      "That they're not alone in it",
      "That they love them, simply"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "romantic-007",
    "category": "romantic",
    "difficulty": "medium",
    "question": "What would {target} say is the sweetest thing their partner has ever said to them?",
    "options": [
      "Something about wanting a future together",
      "Something about how they make ordinary days better",
      "A promise made half-jokingly that they kept",
      "Something said without realising it was said out loud"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "romantic-008",
    "category": "romantic",
    "difficulty": "easy",
    "question": "Which would {target} say is our song, if we had to pick one?",
    "options": [
      "Something from Hamilton",
      "Something from Wicked",
      "Something slow and unexpected",
      "Something ridiculous that became ours by accident"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "romantic-009",
    "category": "romantic",
    "difficulty": "medium",
    "question": "What would {target} say they'd want written on something permanent, like a card or a ring?",
    "options": [
      "'A + L'",
      "A date that matters to them",
      "A line from a show they love",
      "Something too private to guess"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "romantic-010",
    "category": "romantic",
    "difficulty": "medium",
    "question": "What would {target} say is the moment they fell hardest for their partner?",
    "options": [
      "Watching them be kind to a stranger",
      "A quiet, ordinary moment that caught them off guard",
      "Somewhere on a trip, out of nowhere",
      "The way they handled a hard day"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "romantic-011",
    "category": "romantic",
    "difficulty": "easy",
    "question": "What would {target} say makes a place feel romantic to them?",
    "options": [
      "Water and a sunset",
      "Being somewhere new together",
      "No plans and no phones",
      "Good food and no rush"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "romantic-012",
    "category": "romantic",
    "difficulty": "medium",
    "question": "What would {target} say they'd want to do for our next big anniversary?",
    "options": [
      "Go back to Venice",
      "A brand new trip somewhere neither has been",
      "Something small and quiet at home",
      "Recreate our first date"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "romantic-013",
    "category": "romantic",
    "difficulty": "medium",
    "question": "What would {target} say is the most romantic thing about the way their partner travels with them?",
    "options": [
      "How they always find a reason to hold hands crossing something",
      "How they stop just to look at a view",
      "How they take the photo without being asked",
      "How they make even the boring travel days feel good"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "romantic-014",
    "category": "romantic",
    "difficulty": "easy",
    "question": "Which would {target} say is the most 'them' way to say I love you without the words?",
    "options": [
      "Booking the thing without telling them why",
      "Remembering the small thing they mentioned once",
      "Showing up, every time, without fail",
      "Making the ordinary day feel like an occasion"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "romantic-015",
    "category": "romantic",
    "difficulty": "medium",
    "question": "What does Louie think is the most romantic thing he's ever done for Ariel?",
    "options": [
      "Booked the sunset gondola in Venice without telling her why",
      "Learned to sit through a full musical without checking his phone",
      "Planned a surprise around one photo she wanted",
      "Kept the 'table is reserved' joke going for years"
    ],
    "target": "Louie",
    "revealText": ""
  },
  {
    "id": "romantic-016",
    "category": "romantic",
    "difficulty": "medium",
    "question": "What does Ariel think is the most romantic thing she's ever done for Louie?",
    "options": [
      "Planned a whole day around his favourite football match",
      "Learned the rules of something he loves just to join in",
      "Surprised him with a trip he'd mentioned once in passing",
      "Saved every photo from every trip into one place for him"
    ],
    "target": "Ariel",
    "revealText": ""
  },
  {
    "id": "difficult-001",
    "category": "difficult",
    "difficulty": "hard",
    "question": "Which single Favourite Thing would {target} refuse to cut from the list?",
    "options": [
      "Green M&M",
      "Diet Coke",
      "Burrata",
      "Multicolour Sprinkles"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "difficult-002",
    "category": "difficult",
    "difficulty": "hard",
    "question": "Which plushie would {target} say they'd grab first in a fire?",
    "options": [
      "A Furry Potato",
      "Smudge the Jellycat Cow",
      "Lemming",
      "The Bunny Teddy Bear"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "difficult-003",
    "category": "difficult",
    "difficulty": "hard",
    "question": "Between our two Venice bridge photos, which one would {target} say they actually love more?",
    "options": [
      "The sunset one over the Grand Canal",
      "The daytime one",
      "Neither — the Colosseum kiss beats them both",
      "Neither — the hotel mirror selfie beats them both"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "difficult-004",
    "category": "difficult",
    "difficulty": "hard",
    "question": "Which of these would {target} secretly be most annoyed to lose from the Favourite Things list?",
    "options": [
      "Rummikub",
      "The Crown Hat",
      "Dance Shoes",
      "The Ninja Warrior Kit"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "difficult-005",
    "category": "difficult",
    "difficulty": "hard",
    "question": "What tiny thing always makes {target} happy, without fail?",
    "options": [
      "An Orange Calippo on a hot day",
      "Finding a green M&M in the packet",
      "The dog waiting by the door",
      "A window seat on the plane"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "difficult-006",
    "category": "difficult",
    "difficulty": "hard",
    "question": "Which memory would {target} say they remember most vividly, down to small details?",
    "options": [
      "Sitting on the dam wall at Montanejos",
      "The sunset bridge crossing in Venice",
      "Seeing Avenue Q in New York",
      "The M&M store in New York"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "difficult-007",
    "category": "difficult",
    "difficulty": "hard",
    "question": "Which of these foods would {target} say they could genuinely eat every single day?",
    "options": [
      "Avocado Toast",
      "Pasta",
      "Caesar Salad",
      "Burrata"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "difficult-008",
    "category": "difficult",
    "difficulty": "hard",
    "question": "Which of these would {target} say is the most underrated thing on the Favourite Things list?",
    "options": [
      "Parmesan",
      "Sliced Turkey",
      "The Park Bench",
      "Koalas"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "difficult-009",
    "category": "difficult",
    "difficulty": "hard",
    "question": "Which specific detail from Montanejos would {target} say they remember best?",
    "options": [
      "The taste of the cheese by the water",
      "The exact spot on the dam wall",
      "How cold the gorge water was",
      "The colour of the water in the gorge"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "difficult-010",
    "category": "difficult",
    "difficulty": "hard",
    "question": "Which of these would {target} say they'd be most surprised to learn was their partner's actual favourite?",
    "options": [
      "Chicken Tenders from McDonald's",
      "The London Underground",
      "The Jellycat Logo",
      "A Book over a Kindle"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "difficult-011",
    "category": "difficult",
    "difficulty": "hard",
    "question": "Which show moment would {target} say gets them every time?",
    "options": [
      "Elphaba's big number in Wicked",
      "The finale of Hamilton",
      "A specific scene from Avenue Q",
      "It's the music in general, not one moment"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "difficult-012",
    "category": "difficult",
    "difficulty": "hard",
    "question": "Which of these would {target} say they'd choose over the other three, no hesitation?",
    "options": [
      "Wagamama Teriyaki",
      "Pad Thai",
      "Chicken Tenders from McDonald's",
      "Butter Chicken from Dishoom"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "difficult-013",
    "category": "difficult",
    "difficulty": "hard",
    "question": "Which small sensory detail would instantly take {target} back to a specific trip?",
    "options": [
      "The smell of the water at Montanejos",
      "The sound of the vaporetto in Venice",
      "The taste of Amorino gelato in Rome",
      "The noise of the Underground on the way home"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "food-001",
    "category": "food",
    "difficulty": "easy",
    "question": "What would {target} choose for dinner tonight?",
    "options": [
      "Pizza",
      "Sushi",
      "Pasta",
      "Butter Chicken"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "food-002",
    "category": "food",
    "difficulty": "easy",
    "question": "Which takeaway would {target} order in on a lazy night?",
    "options": [
      "Wagamama",
      "Dishoom",
      "Pad Thai",
      "Pizza"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "food-003",
    "category": "food",
    "difficulty": "easy",
    "question": "What dessert would {target} pick off the menu?",
    "options": [
      "Chocolate Fondant",
      "Cookies & Cream Cake",
      "Ice Cream",
      "Amorino Gelato"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "food-004",
    "category": "food",
    "difficulty": "easy",
    "question": "What would {target} order at the café counter?",
    "options": [
      "Iced Coffee",
      "Diet Coke",
      "Hugo Spritz",
      "Sparkling Water"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "food-005",
    "category": "food",
    "difficulty": "easy",
    "question": "What would {target} choose for breakfast?",
    "options": [
      "Bagels",
      "Avocado Toast",
      "Cereal",
      "Full English Fry-Up"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "food-006",
    "category": "food",
    "difficulty": "easy",
    "question": "What would {target} raid the kitchen for as a midnight snack?",
    "options": [
      "Chicken Tenders",
      "Cookies & Cream Cake",
      "Cereal",
      "Toast"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "food-007",
    "category": "food",
    "difficulty": "easy",
    "question": "Which fast food order would {target} go for?",
    "options": [
      "McDonald's Chicken Tenders",
      "KFC",
      "Nando's",
      "Burger King"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "food-008",
    "category": "food",
    "difficulty": "easy",
    "question": "Which ice lolly would {target} grab from the freezer on a hot day?",
    "options": [
      "Orange Calippo",
      "Twister",
      "Magnum",
      "Solero"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "food-009",
    "category": "food",
    "difficulty": "easy",
    "question": "What snack would {target} bring into the cinema?",
    "options": [
      "Popcorn",
      "Pick 'n' Mix",
      "Nachos",
      "Hot Dog"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "food-010",
    "category": "food",
    "difficulty": "easy",
    "question": "Where would {target} choose to go for Sunday brunch?",
    "options": [
      "Dishoom",
      "Wagamama",
      "A bagel shop",
      "An avocado toast café"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "food-011",
    "category": "food",
    "difficulty": "easy",
    "question": "What would {target} throw in the basket at Trader Joe's?",
    "options": [
      "Cookie Butter",
      "Everything Bagel Seasoning",
      "Mac & Cheese",
      "Frozen Gyoza"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "food-012",
    "category": "food",
    "difficulty": "easy",
    "question": "What pizza topping would {target} pick?",
    "options": [
      "Pepperoni",
      "Margherita",
      "Mushroom",
      "Hawaiian"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "food-013",
    "category": "food",
    "difficulty": "easy",
    "question": "Which cheese would {target} raid the fridge for?",
    "options": [
      "Burrata",
      "Parmesan",
      "Cheddar",
      "Brie"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "food-014",
    "category": "food",
    "difficulty": "easy",
    "question": "Which colour M&M would {target} eat first out of the bag?",
    "options": [
      "Green",
      "Red",
      "Blue",
      "Yellow"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "food-015",
    "category": "food",
    "difficulty": "easy",
    "question": "What would {target} order to drink with lunch?",
    "options": [
      "Diet Coke",
      "Sprite",
      "Fanta",
      "Still Water"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "food-016",
    "category": "food",
    "difficulty": "medium",
    "question": "Cook from scratch or order in tonight — which takeaway would {target} pick if they gave in?",
    "options": [
      "Wagamama Teriyaki",
      "Dishoom Butter Chicken",
      "Pizza",
      "Pad Thai"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "food-017",
    "category": "food",
    "difficulty": "medium",
    "question": "What would {target} order at a sushi restaurant?",
    "options": [
      "Salmon Nigiri",
      "California Roll",
      "Dragon Roll",
      "Chirashi Bowl"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "food-018",
    "category": "food",
    "difficulty": "medium",
    "question": "What would {target} order at Dishoom?",
    "options": [
      "Butter Chicken",
      "Chicken Ruby",
      "Bacon Naan Roll",
      "Chole"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "food-019",
    "category": "food",
    "difficulty": "medium",
    "question": "What food would {target} crave after a big night out?",
    "options": [
      "Bacon Naan Roll",
      "Chicken Tenders",
      "Pizza",
      "Mac & Cheese"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "food-020",
    "category": "food",
    "difficulty": "medium",
    "question": "What would {target} pack for a picnic in the park?",
    "options": [
      "Caesar Salad",
      "Sliced Turkey Sandwiches",
      "Sushi",
      "Pasta Salad"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "food-021",
    "category": "food",
    "difficulty": "medium",
    "question": "What would {target} cook up for a rainy Sunday comfort meal?",
    "options": [
      "Mac & Cheese",
      "Butter Chicken",
      "Pasta",
      "Chicken Tenders"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "food-022",
    "category": "food",
    "difficulty": "medium",
    "question": "Which dessert would {target} refuse to share a single bite of?",
    "options": [
      "Chocolate Fondant",
      "Cookies & Cream Cake",
      "Ice Cream",
      "Amorino Gelato"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "food-023",
    "category": "food",
    "difficulty": "medium",
    "question": "What would {target} eat straight out of the fridge at midnight?",
    "options": [
      "Sliced Turkey",
      "Parmesan",
      "Leftover Pasta",
      "Cereal"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "food-024",
    "category": "food",
    "difficulty": "medium",
    "question": "What snack would {target} stash in their bag for a long journey?",
    "options": [
      "Green M&M's",
      "Crisps",
      "A Protein Bar",
      "Biscuits"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "food-025",
    "category": "food",
    "difficulty": "medium",
    "question": "What would {target} order for lunch on a beach holiday?",
    "options": [
      "Caesar Salad",
      "Sushi",
      "Pizza",
      "Fish and Chips"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "food-026",
    "category": "food",
    "difficulty": "medium",
    "question": "What food would {target} get from a food van at a festival?",
    "options": [
      "Burger",
      "Pizza Slice",
      "Noodles",
      "Hot Dog"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "food-027",
    "category": "food",
    "difficulty": "medium",
    "question": "How would {target} take their coffee?",
    "options": [
      "Iced Coffee",
      "Flat White",
      "Cappuccino",
      "Americano"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "food-028",
    "category": "food",
    "difficulty": "medium",
    "question": "How spicy would {target} order their Pad Thai?",
    "options": [
      "Mild",
      "Medium",
      "Thai Hot",
      "No Spice at All"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "food-029",
    "category": "food",
    "difficulty": "medium",
    "question": "What salad would {target} order at lunch?",
    "options": [
      "Caesar Salad",
      "Greek Salad",
      "Poke Bowl",
      "Niçoise Salad"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "food-030",
    "category": "food",
    "difficulty": "medium",
    "question": "What flavour birthday cake would {target} choose?",
    "options": [
      "Chocolate Fondant Cake",
      "Cookies & Cream Cake",
      "Carrot Cake",
      "Red Velvet Cake"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "food-031",
    "category": "food",
    "difficulty": "hard",
    "question": "If {target} could only keep one favourite food forever, which would they save?",
    "options": [
      "Pizza",
      "Sushi",
      "Burrata",
      "Butter Chicken"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "food-032",
    "category": "food",
    "difficulty": "hard",
    "question": "What food could {target} eat on repeat without ever getting bored of it?",
    "options": [
      "Pasta",
      "Sushi",
      "Chicken Tenders",
      "Avocado Toast"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "food-033",
    "category": "food",
    "difficulty": "hard",
    "question": "What would {target} grab at the airport before a flight?",
    "options": [
      "A Pret Sandwich",
      "Wagamama",
      "McDonald's",
      "Sushi from the Bar"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "food-034",
    "category": "food",
    "difficulty": "hard",
    "question": "What would {target} pick as their ultimate cheat day splurge?",
    "options": [
      "A Full Dishoom Feast",
      "An Entire Cookies & Cream Cake",
      "Pizza and Chocolate Fondant",
      "A McDonald's Large Meal"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "food-035",
    "category": "food",
    "difficulty": "hard",
    "question": "Which stall would {target} head straight for at a street food market?",
    "options": [
      "Pad Thai Stall",
      "Cheese Stall",
      "Burger Stall",
      "Dumpling Stall"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "food-036",
    "category": "food",
    "difficulty": "hard",
    "question": "What would {target} cook to win over a fussy eater?",
    "options": [
      "Mac & Cheese",
      "Pizza",
      "Butter Chicken",
      "Sushi"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "food-037",
    "category": "food",
    "difficulty": "hard",
    "question": "What would {target} cook for a date night in?",
    "options": [
      "Pasta with Burrata",
      "Butter Chicken from Scratch",
      "Mac & Cheese",
      "Caesar Salad and Chicken"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "food-038",
    "category": "food",
    "difficulty": "hard",
    "question": "If it were {target}'s last meal ever, what would they choose?",
    "options": [
      "Sushi",
      "Pizza",
      "Butter Chicken",
      "Burrata and Bread"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "travel-001",
    "category": "travel",
    "difficulty": "easy",
    "question": "Which trip would {target} repeat tomorrow if they could?",
    "options": [
      "Venice",
      "Rome",
      "Montanejos",
      "New York"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "travel-002",
    "category": "travel",
    "difficulty": "medium",
    "question": "If we booked a flight tomorrow with zero planning, where would {target} want it to take us?",
    "options": [
      "Back to Venice",
      "Back to New York",
      "Back to Montanejos",
      "Somewhere brand new"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "travel-003",
    "category": "travel",
    "difficulty": "medium",
    "question": "Which trip would {target} say was the funniest?",
    "options": [
      "Rome",
      "New York",
      "Madrid",
      "Montanejos"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "travel-004",
    "category": "travel",
    "difficulty": "hard",
    "question": "Which trip would {target} call the most romantic?",
    "options": [
      "Venice",
      "Rome",
      "Montanejos",
      "Madrid"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "travel-005",
    "category": "travel",
    "difficulty": "medium",
    "question": "Which trip would {target} say was the most stressful or chaotic?",
    "options": [
      "Venice",
      "Rome",
      "New York",
      "Montanejos"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "travel-006",
    "category": "travel",
    "difficulty": "easy",
    "question": "When we're packing for a trip, what would {target} say they always do?",
    "options": [
      "Pack way too early",
      "Pack the night before",
      "Forget something every time",
      "Pack too much"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "travel-007",
    "category": "travel",
    "difficulty": "easy",
    "question": "Who does {target} say is more likely to be running late for a flight?",
    "options": [
      "Louie",
      "Ariel",
      "Both of us equally",
      "Neither — we're always early"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "travel-008",
    "category": "travel",
    "difficulty": "medium",
    "question": "Who does {target} say actually navigates when we're lost in a new city?",
    "options": [
      "Louie",
      "Ariel",
      "We both just guess",
      "We ask a stranger"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "travel-009",
    "category": "travel",
    "difficulty": "medium",
    "question": "What does the shirt say in the daytime bridge photo from Venice?",
    "options": [
      "Corb Aperitif",
      "Aperol Spritz",
      "Venezia",
      "Nothing — it's plain"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "travel-010",
    "category": "travel",
    "difficulty": "hard",
    "question": "In the Venice sunset bridge photo, are we facing the canal or facing away from it?",
    "options": [
      "Facing the canal",
      "Backs to the canal",
      "Side-on to the canal",
      "Can't remember"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "travel-011",
    "category": "travel",
    "difficulty": "hard",
    "question": "In the Rome escalator photo, what are we holding onto?",
    "options": [
      "Each other's hands",
      "The escalator rail",
      "Our McDonald's bags",
      "Nothing"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "travel-012",
    "category": "travel",
    "difficulty": "medium",
    "question": "What were we eating in the photo by the water at Montanejos?",
    "options": [
      "Parmesan/Grana Padano cheese",
      "Sandwiches",
      "Ice cream",
      "We weren't eating anything"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "travel-013",
    "category": "travel",
    "difficulty": "hard",
    "question": "What colour is the water in the Montanejos gorge photo?",
    "options": [
      "Turquoise",
      "Deep blue",
      "Green",
      "Murky brown"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "travel-014",
    "category": "travel",
    "difficulty": "easy",
    "question": "Where did we row a boat together?",
    "options": [
      "Retiro Park in Madrid",
      "The Venice canals",
      "Central Park",
      "A Montanejos lake"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "travel-015",
    "category": "travel",
    "difficulty": "medium",
    "question": "How many poses are in our Time Out Market photobooth strip?",
    "options": [
      "3",
      "2",
      "4",
      "5"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "travel-016",
    "category": "travel",
    "difficulty": "easy",
    "question": "Which New York shop did we visit that's basically a giant candy store?",
    "options": [
      "The M&M's Store",
      "Hershey's",
      "Dylan's Candy Bar",
      "A corner bodega"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "travel-017",
    "category": "travel",
    "difficulty": "medium",
    "question": "What musical did we see in New York?",
    "options": [
      "Avenue Q",
      "Wicked",
      "Hamilton",
      "The Lion King"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "travel-018",
    "category": "travel",
    "difficulty": "hard",
    "question": "Which trip would {target} say took the most planning?",
    "options": [
      "New York",
      "Venice",
      "Rome",
      "Montanejos"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "travel-019",
    "category": "travel",
    "difficulty": "hard",
    "question": "Which trip would {target} say we basically winged with no real plan?",
    "options": [
      "Montanejos",
      "Rome",
      "Madrid",
      "Venice"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "travel-020",
    "category": "travel",
    "difficulty": "medium",
    "question": "Which past trip would {target} tell a friend they 'have to' go on?",
    "options": [
      "Venice",
      "Montanejos",
      "Rome",
      "New York"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "travel-021",
    "category": "travel",
    "difficulty": "easy",
    "question": "City break or beach holiday — what would {target} choose right now?",
    "options": [
      "City break",
      "Beach holiday",
      "Depends on the season",
      "Neither — mountains"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "travel-022",
    "category": "travel",
    "difficulty": "easy",
    "question": "Would {target} rather repeat a trip we've done or go somewhere brand new?",
    "options": [
      "Repeat a favourite",
      "Somewhere brand new",
      "A mix of both",
      "Whatever's cheapest"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "travel-023",
    "category": "travel",
    "difficulty": "medium",
    "question": "If we had one free flight anywhere tomorrow, where would {target} send us?",
    "options": [
      "Japan",
      "Back to Italy",
      "Back to Spain",
      "Somewhere we've never discussed"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "travel-024",
    "category": "travel",
    "difficulty": "medium",
    "question": "Who does {target} say takes more photos on a trip?",
    "options": [
      "Louie",
      "Ariel",
      "We take about the same",
      "Whoever still has battery"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "travel-025",
    "category": "travel",
    "difficulty": "hard",
    "question": "In which trip's photos are we actually kissing, not just posing?",
    "options": [
      "Venice",
      "Rome",
      "Montanejos",
      "Madrid"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "travel-026",
    "category": "travel",
    "difficulty": "medium",
    "question": "What would {target} say is our biggest travel-day argument trigger?",
    "options": [
      "Being late",
      "Directions",
      "What to eat",
      "How much to spend"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "travel-027",
    "category": "travel",
    "difficulty": "easy",
    "question": "What would {target} say we always do at the airport before a flight?",
    "options": [
      "Grab food",
      "Buy something we don't need",
      "Panic-check the gate",
      "Just wait quietly"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "travel-028",
    "category": "travel",
    "difficulty": "medium",
    "question": "Would {target} rather revisit Italy or explore a new part of Spain?",
    "options": [
      "Revisit Italy",
      "New part of Spain",
      "Somewhere else in Europe",
      "Further afield"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "travel-029",
    "category": "travel",
    "difficulty": "hard",
    "question": "Which trip came first — Rome or Venice?",
    "options": [
      "Venice came first",
      "Rome came first",
      "They were the same trip",
      "Can't remember"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "travel-030",
    "category": "travel",
    "difficulty": "easy",
    "question": "What would {target} say is their go-to travel snack or drink?",
    "options": [
      "Coffee",
      "Something sweet",
      "Whatever's at the airport",
      "They never eat before flying"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "travel-031",
    "category": "travel",
    "difficulty": "hard",
    "question": "Where was the photo of us eating cheese by the water taken?",
    "options": [
      "Montanejos",
      "Venice",
      "Rome",
      "Madrid"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "travel-032",
    "category": "travel",
    "difficulty": "medium",
    "question": "Who does {target} say is better at keeping to a budget on trips?",
    "options": [
      "Louie",
      "Ariel",
      "Neither — we overspend together",
      "We don't really try"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "travel-033",
    "category": "travel",
    "difficulty": "easy",
    "question": "Given a free weekend to go anywhere, what would {target} pick?",
    "options": [
      "A city we love",
      "Somewhere new",
      "Somewhere with a beach",
      "Home — just relax"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "travel-034",
    "category": "travel",
    "difficulty": "hard",
    "question": "Which of these is NOT one of our real trips together?",
    "options": [
      "Barcelona",
      "Venice",
      "Montanejos",
      "Madrid"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "travel-035",
    "category": "travel",
    "difficulty": "medium",
    "question": "Would {target} rather do a fast city-hopping trip or one slow week in one place?",
    "options": [
      "Fast city-hopping",
      "One slow week",
      "A bit of both",
      "Depends who's paying"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "travel-036",
    "category": "travel",
    "difficulty": "easy",
    "question": "Out of our favourite-things collection, which would {target} say is their top pick?",
    "options": [
      "Venice",
      "The Colosseum",
      "Lake Montanejos",
      "Pinemere's Camp"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "travel-037",
    "category": "travel",
    "difficulty": "medium",
    "question": "Which item in our favourite-things collage would {target} say feels the most personal to them?",
    "options": [
      "Pinemere's Camp",
      "Lake Montanejos",
      "The Sistine Chapel",
      "The Empire State Building"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "travel-038",
    "category": "travel",
    "difficulty": "hard",
    "question": "Which trip is the only one where we actually went swimming together?",
    "options": [
      "Montanejos",
      "Venice",
      "Rome",
      "Madrid"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "everyday-001",
    "category": "everyday",
    "difficulty": "easy",
    "question": "What would {target} order at a coffee shop on a random Tuesday?",
    "options": [
      "Iced coffee",
      "Diet Coke instead",
      "A flat white",
      "Just water, they don't need it"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "everyday-002",
    "category": "everyday",
    "difficulty": "easy",
    "question": "Who is more likely to hit snooze on the alarm?",
    "options": [
      "Louie, always",
      "Ariel, always",
      "Depends on the day",
      "Neither, they're both up instantly"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "everyday-003",
    "category": "everyday",
    "difficulty": "medium",
    "question": "What would {target} eat for a 2am snack?",
    "options": [
      "A bagel",
      "Leftover pizza",
      "A bowl of cereal",
      "Cheese and crackers"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "everyday-004",
    "category": "everyday",
    "difficulty": "medium",
    "question": "Which household chore would {target} put off the longest?",
    "options": [
      "Washing up",
      "Laundry",
      "Taking the bins out",
      "Hoovering"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "everyday-005",
    "category": "everyday",
    "difficulty": "easy",
    "question": "What would {target} choose for a rainy afternoon with nothing planned?",
    "options": [
      "Rummikub",
      "Reading a book",
      "Watching something on the sofa",
      "A nap"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "everyday-006",
    "category": "everyday",
    "difficulty": "easy",
    "question": "Who is more likely to be the one running late leaving the house?",
    "options": [
      "Louie",
      "Ariel",
      "Depends who's ready first",
      "They actually leave on time together"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "everyday-007",
    "category": "everyday",
    "difficulty": "medium",
    "question": "What would {target} pack first for a weekend away?",
    "options": [
      "Phone charger",
      "Kindle",
      "Toiletries bag",
      "Snacks for the journey"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "everyday-008",
    "category": "everyday",
    "difficulty": "easy",
    "question": "On the London Underground, if both seats were free, which would {target} pick?",
    "options": [
      "Window seat",
      "Aisle seat",
      "Stand by the doors anyway",
      "Doesn't matter to them"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "everyday-009",
    "category": "everyday",
    "difficulty": "easy",
    "question": "What's the first thing {target} does after waking up?",
    "options": [
      "Checks their phone",
      "Sees to the dog",
      "Makes a coffee",
      "Tries to go back to sleep"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "everyday-010",
    "category": "everyday",
    "difficulty": "medium",
    "question": "What would {target} order at Wagamama without even looking at the menu?",
    "options": [
      "Katsu curry",
      "Chicken ramen",
      "Pad thai",
      "Something different every time"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "everyday-011",
    "category": "everyday",
    "difficulty": "medium",
    "question": "Who's more likely to take the dog out in the rain without complaining?",
    "options": [
      "Louie",
      "Ariel",
      "Whoever loses the argument about it",
      "Both moan equally"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "everyday-012",
    "category": "everyday",
    "difficulty": "medium",
    "question": "What would {target} spend an unexpected £50 on?",
    "options": [
      "Food",
      "Something for the dog",
      "Saving it",
      "A treat for the flat"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "everyday-013",
    "category": "everyday",
    "difficulty": "easy",
    "question": "Which takeaway would {target} pick on a night neither of us wants to cook?",
    "options": [
      "Sushi",
      "Pizza",
      "Butter chicken from Dishoom",
      "Chinese"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "everyday-014",
    "category": "everyday",
    "difficulty": "medium",
    "question": "What would {target} do if the wifi went down for an hour?",
    "options": [
      "Read a book",
      "Use up their phone data anyway",
      "Actually talk to me",
      "Get annoyed and try to fix it"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "everyday-015",
    "category": "everyday",
    "difficulty": "medium",
    "question": "Who's messier with their side of the room?",
    "options": [
      "Louie",
      "Ariel",
      "Depends on the week",
      "Neither, both tidy"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "everyday-016",
    "category": "everyday",
    "difficulty": "medium",
    "question": "What would {target} throw in the basket on a Trader Joe's run?",
    "options": [
      "Snacks",
      "Something sweet",
      "Something they'll never actually eat",
      "Whatever's on sale"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "everyday-017",
    "category": "everyday",
    "difficulty": "easy",
    "question": "What would {target} do if the puppy chewed something important?",
    "options": [
      "Panic first",
      "Laugh it off",
      "Blame the other one",
      "Hide it and deal with it later"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "everyday-018",
    "category": "everyday",
    "difficulty": "easy",
    "question": "What would {target} want to snack on during a film?",
    "options": [
      "Popcorn",
      "Ice cream",
      "Crisps",
      "Nothing, they'll just steal mine"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "everyday-019",
    "category": "everyday",
    "difficulty": "medium",
    "question": "Who's more likely to check their phone at the dinner table?",
    "options": [
      "Louie",
      "Ariel",
      "Both of us",
      "Neither of us"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "everyday-020",
    "category": "everyday",
    "difficulty": "medium",
    "question": "What time would {target} actually want to leave for the airport, worst case?",
    "options": [
      "Three hours early",
      "Two hours early",
      "Cutting it fine",
      "Whatever I say goes"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "everyday-021",
    "category": "everyday",
    "difficulty": "easy",
    "question": "What would {target} do with a free afternoon and zero plans?",
    "options": [
      "Nap",
      "Go for a walk",
      "Watch something",
      "Tidy the flat"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "everyday-022",
    "category": "everyday",
    "difficulty": "medium",
    "question": "Which chore would {target} claim as \"their job\" without ever being asked?",
    "options": [
      "Cooking",
      "Washing up",
      "Walking the dog",
      "Sorting the bins"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "everyday-023",
    "category": "everyday",
    "difficulty": "medium",
    "question": "What happens when {target} pops out \"for just one thing\"?",
    "options": [
      "Comes back with exactly one thing",
      "One thing plus snacks",
      "A full basket somehow",
      "Whatever was on offer"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "everyday-024",
    "category": "everyday",
    "difficulty": "easy",
    "question": "Who's more likely to fall asleep first during a film?",
    "options": [
      "Louie",
      "Ariel",
      "Both of us",
      "Neither of us"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "everyday-025",
    "category": "everyday",
    "difficulty": "medium",
    "question": "What would {target} do if plans got cancelled on us last minute?",
    "options": [
      "Be secretly relieved",
      "Be genuinely disappointed",
      "Suggest a new plan straight away",
      "Just ask what's for dinner"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "entertainment-001",
    "category": "entertainment",
    "difficulty": "easy",
    "question": "Which musical would {target} choose to watch again tonight?",
    "options": [
      "Hamilton",
      "Wicked",
      "Avenue Q",
      "Something they haven't seen yet"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "entertainment-002",
    "category": "entertainment",
    "difficulty": "medium",
    "question": "Which Hunger Games character would {target} most want to be?",
    "options": [
      "Katniss",
      "Peeta",
      "Effie",
      "Haymitch"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "entertainment-003",
    "category": "entertainment",
    "difficulty": "easy",
    "question": "Which Wicked character does {target} relate to more?",
    "options": [
      "Elphaba",
      "Glinda",
      "Neither, honestly",
      "Fiyero"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "entertainment-004",
    "category": "entertainment",
    "difficulty": "hard",
    "question": "What would {target} pick as their Hamilton karaoke song?",
    "options": [
      "My Shot",
      "The Room Where It Happens",
      "Satisfied",
      "Helpless"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "entertainment-005",
    "category": "entertainment",
    "difficulty": "medium",
    "question": "Which fictional world would {target} most want to live in?",
    "options": [
      "The Capitol (for the luxury)",
      "Oz",
      "Hogwarts",
      "Somewhere with koalas"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "entertainment-006",
    "category": "entertainment",
    "difficulty": "easy",
    "question": "Who is more competitive at Rummikub?",
    "options": [
      "Louie",
      "Ariel",
      "Both equally",
      "Whoever's losing at the time"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "entertainment-007",
    "category": "entertainment",
    "difficulty": "easy",
    "question": "Which animal would {target} choose as their spirit animal?",
    "options": [
      "A koala",
      "Their own dog",
      "A cat",
      "Something more surprising"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "entertainment-008",
    "category": "entertainment",
    "difficulty": "hard",
    "question": "Which Avenue Q character would {target} say is most like them?",
    "options": [
      "Princeton",
      "Kate Monster",
      "Nicky",
      "Rod"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "entertainment-009",
    "category": "entertainment",
    "difficulty": "medium",
    "question": "What would {target} say is the most quotable line from Hamilton?",
    "options": [
      "\"I am not throwing away my shot\"",
      "\"Talk less, smile more\"",
      "\"The world was wide enough\"",
      "Something else entirely"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "entertainment-010",
    "category": "entertainment",
    "difficulty": "medium",
    "question": "Which Hunger Games film would {target} rewatch first?",
    "options": [
      "The Hunger Games",
      "Catching Fire",
      "Mockingjay Part 1",
      "Mockingjay Part 2"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "entertainment-011",
    "category": "entertainment",
    "difficulty": "medium",
    "question": "If {target} could bring back one Broadway show for a single more performance, which would it be?",
    "options": [
      "Hamilton",
      "Wicked",
      "Avenue Q",
      "Something not on this list"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "entertainment-012",
    "category": "entertainment",
    "difficulty": "medium",
    "question": "Which villain would {target} secretly find themselves rooting for?",
    "options": [
      "President Snow",
      "The Wicked Witch, before we knew her story",
      "King George III",
      "Someone else entirely"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "entertainment-013",
    "category": "entertainment",
    "difficulty": "easy",
    "question": "What genre would {target} pick for a random Friday night film?",
    "options": [
      "Musical",
      "Thriller",
      "Comedy",
      "Documentary"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "entertainment-014",
    "category": "entertainment",
    "difficulty": "easy",
    "question": "Which game night would {target} choose over all others?",
    "options": [
      "Rummikub",
      "Something new",
      "Cards",
      "Whatever I pick"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "entertainment-015",
    "category": "entertainment",
    "difficulty": "easy",
    "question": "Who is more likely to cry during a musical?",
    "options": [
      "Louie",
      "Ariel",
      "Both of us",
      "Neither of us"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "entertainment-016",
    "category": "entertainment",
    "difficulty": "medium",
    "question": "Which song would {target} say we most associate with us?",
    "options": [
      "Something from Hamilton",
      "Something from Wicked",
      "A random pop song",
      "Our actual \"our song\""
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "entertainment-017",
    "category": "entertainment",
    "difficulty": "medium",
    "question": "Which character would {target} most want to meet in real life?",
    "options": [
      "Elphaba",
      "Katniss",
      "Alexander Hamilton",
      "Someone else entirely"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "entertainment-018",
    "category": "entertainment",
    "difficulty": "medium",
    "question": "What would {target} pick as the best film adaptation of a book?",
    "options": [
      "The Hunger Games",
      "Something else entirely",
      "They'd insist the book is always better",
      "Wicked, once it's fully out"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "entertainment-019",
    "category": "entertainment",
    "difficulty": "easy",
    "question": "Which reality show would {target} actually admit to enjoying?",
    "options": [
      "A dating show",
      "A baking show",
      "A talent show",
      "They'd deny watching any"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "entertainment-020",
    "category": "entertainment",
    "difficulty": "hard",
    "question": "Who is more likely to know all the words to a Hamilton song?",
    "options": [
      "Louie",
      "Ariel",
      "Both of us",
      "Neither of us"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "entertainment-021",
    "category": "entertainment",
    "difficulty": "medium",
    "question": "What would {target} put on as background music while cooking?",
    "options": [
      "A musical theatre soundtrack",
      "A random playlist",
      "Silence",
      "Whatever's already playing"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "entertainment-022",
    "category": "entertainment",
    "difficulty": "hard",
    "question": "Which of Effie Trinket's outfits would {target} secretly want to wear?",
    "options": [
      "The reaping outfit",
      "Something more subtle",
      "None of them",
      "All of them, honestly"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "entertainment-023",
    "category": "entertainment",
    "difficulty": "easy",
    "question": "Would {target} rather do theatre or cinema on a night out?",
    "options": [
      "Theatre every time",
      "Cinema every time",
      "Depends what's showing",
      "Neither, stay in"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "entertainment-024",
    "category": "entertainment",
    "difficulty": "hard",
    "question": "Which Rummikub strategy best describes {target}?",
    "options": [
      "Hoards tiles and waits",
      "Plays fast and loose",
      "Overthinks every move",
      "Just wants it to be over"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "entertainment-025",
    "category": "entertainment",
    "difficulty": "medium",
    "question": "Which fictional couple would {target} say we're most like?",
    "options": [
      "Peeta and Katniss",
      "Fiyero and Elphaba",
      "Hamilton and Eliza",
      "None of them, we're our own thing"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "funny-066",
    "category": "funny",
    "difficulty": "easy",
    "question": "If {target} had to survive a week on vending machine food only, what would go first?",
    "options": [
      "The chocolate bar",
      "The crisps",
      "The fizzy drink",
      "They'd never even attempt it"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "funny-067",
    "category": "funny",
    "difficulty": "medium",
    "question": "What's the most likely reason {target} would get banned from a supermarket?",
    "options": [
      "Taste-testing without paying",
      "Racing a trolley down the aisle",
      "Arguing with the self-checkout",
      "Rearranging the shelves \"for fun\""
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "funny-068",
    "category": "funny",
    "difficulty": "easy",
    "question": "If {target} accidentally sent a text to the wrong person, what would it most likely be about?",
    "options": [
      "Complaining about someone in the group chat",
      "An inside joke that makes no sense out of context",
      "Something way too honest",
      "A meme with no caption"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "funny-069",
    "category": "funny",
    "difficulty": "medium",
    "question": "In an office prank war, what would {target}'s signature move be?",
    "options": [
      "Filling a drawer with something ridiculous",
      "Swapping someone's keyboard keys",
      "Sticky notes on absolutely everything",
      "Refusing to join in, then secretly loving it"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "funny-070",
    "category": "funny",
    "difficulty": "easy",
    "question": "What would {target} do if the wifi went down for a whole week?",
    "options": [
      "Actually read a book",
      "Complain nonstop",
      "Go outside like it's a punishment",
      "Find a way to hotspot from somewhere illegal"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "funny-071",
    "category": "funny",
    "difficulty": "easy",
    "question": "If {target} won a lifetime supply of one snack, which would cause the most chaos?",
    "options": [
      "Crisps",
      "Chocolate",
      "Cheese",
      "Energy drinks"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "funny-072",
    "category": "funny",
    "difficulty": "medium",
    "question": "What's {target} most likely to lie about to avoid an awkward conversation?",
    "options": [
      "Being busy",
      "Having already eaten",
      "Liking a gift",
      "Being on their way"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "funny-073",
    "category": "funny",
    "difficulty": "hard",
    "question": "If {target} started a conspiracy theory, what would it be about?",
    "options": [
      "Pigeons",
      "The moon landing",
      "Their own phone listening to them",
      "Odd numbers being unlucky"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "funny-074",
    "category": "funny",
    "difficulty": "easy",
    "question": "What would {target} do if they found a spider the size of a coin in the bathroom?",
    "options": [
      "Scream and abandon the room forever",
      "Trap it under a glass and forget about it",
      "Calmly remove it outside",
      "Pretend it doesn't exist"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "funny-075",
    "category": "funny",
    "difficulty": "medium",
    "question": "If {target} had to DJ a party with only one genre, which would it be?",
    "options": [
      "2000s pop",
      "Cheesy party anthems",
      "Whatever's trending on TikTok",
      "Music nobody else recognises"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "funny-076",
    "category": "funny",
    "difficulty": "medium",
    "question": "What would {target}'s villain origin story most likely involve?",
    "options": [
      "Someone stealing their food",
      "Bad wifi at a crucial moment",
      "Being kept waiting",
      "A parking situation"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "funny-077",
    "category": "funny",
    "difficulty": "medium",
    "question": "If {target} had a warning label, what would it say?",
    "options": [
      "\"Do not talk to before coffee\"",
      "\"Handle with snacks\"",
      "\"May overreact to small things\"",
      "\"Runs on 4 hours of sleep and spite\""
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "funny-078",
    "category": "funny",
    "difficulty": "easy",
    "question": "What would {target} most likely do at a karaoke night?",
    "options": [
      "Pick a power ballad and commit fully",
      "Refuse to go up but sing loudest from the seat",
      "Pick something ironic",
      "Need to be dragged up there"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "funny-079",
    "category": "funny",
    "difficulty": "medium",
    "question": "If {target} got stuck in a lift with a stranger, what would they do?",
    "options": [
      "Make awkward small talk",
      "Stay dead silent and stare at the numbers",
      "Try to befriend them immediately",
      "Start mentally planning what to say if it breaks down"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "funny-080",
    "category": "funny",
    "difficulty": "easy",
    "question": "What's the most likely thing to make {target} rage-quit a game?",
    "options": [
      "Losing to bad luck",
      "A teammate messing up",
      "A rule they think is unfair",
      "Losing to the other of us"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "relationship-051",
    "category": "relationship",
    "difficulty": "medium",
    "question": "What would {target} say is our \"song\"?",
    "options": [
      "Something from when we first met",
      "Something ridiculous we both love",
      "Whatever's stuck in our heads lately",
      "We don't really have one"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "relationship-052",
    "category": "relationship",
    "difficulty": "hard",
    "question": "If we had a couple's motto, what would {target} say it is?",
    "options": [
      "Something funny",
      "Something soppy",
      "Something practical",
      "We'd argue about it and never agree"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "relationship-053",
    "category": "relationship",
    "difficulty": "medium",
    "question": "What would {target} say is the best thing about arguing with me?",
    "options": [
      "Making up afterwards",
      "That we always sort it out",
      "Nothing, arguing is the worst",
      "Proving them right eventually"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "relationship-054",
    "category": "relationship",
    "difficulty": "medium",
    "question": "If {target} had to describe our relationship as a weather forecast, what would it be?",
    "options": [
      "Mostly sunny with occasional storms",
      "Unpredictable but never boring",
      "Calm and steady",
      "Depends entirely on the day"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "relationship-055",
    "category": "relationship",
    "difficulty": "easy",
    "question": "What would {target} say is the one household task I always get out of?",
    "options": [
      "The bins",
      "The washing up",
      "The cleaning",
      "All of them, somehow"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "relationship-056",
    "category": "relationship",
    "difficulty": "easy",
    "question": "If {target} had to pick, who falls asleep first most nights?",
    "options": [
      "Me",
      "Them",
      "Whoever's more tired that day",
      "Neither of us notices"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "relationship-057",
    "category": "relationship",
    "difficulty": "hard",
    "question": "What would {target} say I do that secretly annoys them the most?",
    "options": [
      "Leaving things half-finished",
      "Being late",
      "Talking during films",
      "Something else entirely"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "relationship-058",
    "category": "relationship",
    "difficulty": "medium",
    "question": "If we were a sitcom couple, what would {target} say our dynamic is?",
    "options": [
      "The bickering-but-loving pair",
      "The chaotic one and the sensible one",
      "Both equally chaotic",
      "Impossible to write, too normal"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "relationship-059",
    "category": "relationship",
    "difficulty": "medium",
    "question": "What would {target} say is the real reason we work so well together?",
    "options": [
      "We balance each other out",
      "We just get each other",
      "We laugh at the same things",
      "Honestly, no idea, it just works"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "relationship-060",
    "category": "relationship",
    "difficulty": "hard",
    "question": "If {target} had to relive one of our dates on repeat forever, which would it be?",
    "options": [
      "The first one",
      "A random ordinary one",
      "A disaster that turned out fun",
      "One we haven't had yet"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "relationship-061",
    "category": "relationship",
    "difficulty": "medium",
    "question": "What would {target} say is the thing I'm most stubborn about?",
    "options": [
      "Being right in an argument",
      "How I like things done",
      "Food choices",
      "Something completely random"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "relationship-062",
    "category": "relationship",
    "difficulty": "hard",
    "question": "If {target} had to write a one-star review of me as a partner, what would the complaint be?",
    "options": [
      "Too messy",
      "Too competitive",
      "Too much of a homebody",
      "Snores or talks in their sleep"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "relationship-063",
    "category": "relationship",
    "difficulty": "medium",
    "question": "What would {target} say is the most \"us\" thing we do together?",
    "options": [
      "A specific inside joke",
      "A weekly routine",
      "Bickering about something trivial",
      "Just being lazy together"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "relationship-064",
    "category": "relationship",
    "difficulty": "hard",
    "question": "If {target} had to guess, what will we be arguing about in 10 years?",
    "options": [
      "The exact same things as now",
      "Something about the kids or pets",
      "Whose turn it is to do something",
      "We'll have it all figured out by then"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "relationship-065",
    "category": "relationship",
    "difficulty": "hard",
    "question": "What would {target} say is the most romantic thing I've ever done, even if small?",
    "options": [
      "Something planned",
      "Something spontaneous",
      "Something practical done out of love",
      "They'd struggle to pick just one"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "food-039",
    "category": "food",
    "difficulty": "easy",
    "question": "If {target} had to eat one cuisine forever, what would it be?",
    "options": [
      "Italian",
      "Indian",
      "Chinese",
      "Mexican"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "food-040",
    "category": "food",
    "difficulty": "medium",
    "question": "What would {target} order if a restaurant menu had zero prices listed?",
    "options": [
      "The most expensive-sounding thing",
      "Their usual safe choice",
      "Whatever the waiter recommends",
      "Ask for the prices anyway"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "food-041",
    "category": "food",
    "difficulty": "easy",
    "question": "If {target} could only drink one hot drink for the rest of their life, what would it be?",
    "options": [
      "Tea",
      "Coffee",
      "Hot chocolate",
      "Neither, they'd switch to cold drinks"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "food-042",
    "category": "food",
    "difficulty": "easy",
    "question": "What's {target} most likely to order at 2am after a night out?",
    "options": [
      "Chips",
      "A kebab",
      "Pizza",
      "Cereal at home"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "food-043",
    "category": "food",
    "difficulty": "medium",
    "question": "If {target} had to give up one food forever, what would be hardest?",
    "options": [
      "Chocolate",
      "Cheese",
      "Bread",
      "Crisps"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "food-044",
    "category": "food",
    "difficulty": "medium",
    "question": "What would {target} do if their food arrived and it was wrong?",
    "options": [
      "Send it back immediately",
      "Eat it anyway rather than make a fuss",
      "Mention it but still eat some",
      "Complain about it for days after"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "food-045",
    "category": "food",
    "difficulty": "medium",
    "question": "If {target} had to cook a meal to impress someone, what would they make?",
    "options": [
      "Something they've made a hundred times",
      "Something new and risky",
      "Order in and pretend",
      "A dessert to distract from the mains"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "food-046",
    "category": "food",
    "difficulty": "hard",
    "question": "What would {target} say is the most overrated food?",
    "options": [
      "Avocado on toast",
      "Oysters",
      "Truffle anything",
      "Something we both actually love"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "food-047",
    "category": "food",
    "difficulty": "medium",
    "question": "If {target} won a free table at any restaurant, which would they pick?",
    "options": [
      "Somewhere fancy we've never been",
      "Our usual favourite",
      "Somewhere with the best dessert menu",
      "Somewhere purely for the photo"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "food-048",
    "category": "food",
    "difficulty": "medium",
    "question": "What would {target} do if they were the only one who liked a dish I cooked?",
    "options": [
      "Eat it all anyway to be nice",
      "Be brutally honest",
      "Ask for the recipe to make it better next time",
      "Pretend to like it more than they do"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "travel-039",
    "category": "travel",
    "difficulty": "hard",
    "question": "If {target} could relive one holiday we've had, which would it be?",
    "options": [
      "The most recent one",
      "The most chaotic one",
      "The most relaxing one",
      "One we haven't been on yet"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "travel-040",
    "category": "travel",
    "difficulty": "easy",
    "question": "What would {target} pack first for any trip, no matter where?",
    "options": [
      "Phone charger",
      "Snacks",
      "A book",
      "Something totally unnecessary"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "travel-041",
    "category": "travel",
    "difficulty": "easy",
    "question": "If {target} had to choose, beach holiday or city break?",
    "options": [
      "Beach every time",
      "City every time",
      "Depends on the mood",
      "A bit of both, or nothing"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "travel-042",
    "category": "travel",
    "difficulty": "medium",
    "question": "What's the most likely reason {target} would want to leave a holiday early?",
    "options": [
      "Missing home comforts",
      "An argument over plans",
      "Bad weather ruining it",
      "They'd never want to leave early"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "travel-043",
    "category": "travel",
    "difficulty": "medium",
    "question": "If we got hopelessly lost abroad, what would {target} do first?",
    "options": [
      "Pull out a map or phone immediately",
      "Ask a local for directions",
      "Wing it and hope for the best",
      "Blame whoever was navigating"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "travel-044",
    "category": "travel",
    "difficulty": "hard",
    "question": "What would {target} say was the worst travel mishap we've had?",
    "options": [
      "A missed flight or delay",
      "Lost luggage",
      "A booking mix-up",
      "Something else entirely"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "travel-045",
    "category": "travel",
    "difficulty": "medium",
    "question": "If {target} could teleport anywhere right now, where would they go?",
    "options": [
      "Somewhere we've already been and loved",
      "Somewhere brand new",
      "Somewhere warm",
      "Just back to bed"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "travel-046",
    "category": "travel",
    "difficulty": "easy",
    "question": "What souvenir is {target} most likely to bring home from a trip?",
    "options": [
      "A fridge magnet",
      "Local snacks",
      "Something overpriced and unnecessary",
      "Nothing, they always forget"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "travel-047",
    "category": "travel",
    "difficulty": "medium",
    "question": "If {target} planned a surprise trip for us, what would matter most to them?",
    "options": [
      "The destination",
      "Where we'd be staying",
      "Keeping it a secret successfully",
      "The food we'd get to try"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "travel-048",
    "category": "travel",
    "difficulty": "easy",
    "question": "What would {target} do if our flight got delayed by 6 hours?",
    "options": [
      "Find the nearest food",
      "Get stressed and check the app every 5 minutes",
      "Make the most of it and explore the airport",
      "Nap wherever possible"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "everyday-026",
    "category": "everyday",
    "difficulty": "easy",
    "question": "What would {target} do if the alarm didn't go off and we were already late?",
    "options": [
      "Panic and rush everyone",
      "Stay weirdly calm about it",
      "Blame the alarm or their phone",
      "Try to fix their hair anyway"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "everyday-027",
    "category": "everyday",
    "difficulty": "medium",
    "question": "If {target} had an extra hour in the day, what would they actually do with it?",
    "options": [
      "Sleep",
      "Something productive",
      "Scroll their phone",
      "Spend it with me"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "everyday-028",
    "category": "everyday",
    "difficulty": "easy",
    "question": "What's {target} most likely to forget when leaving the house?",
    "options": [
      "Their keys",
      "Their phone",
      "Their wallet",
      "Whatever they specifically went back for already"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "everyday-029",
    "category": "everyday",
    "difficulty": "easy",
    "question": "If {target} had to do one chore for the rest of their life, which would they pick?",
    "options": [
      "Washing up",
      "Vacuuming",
      "Laundry",
      "Cooking"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "everyday-030",
    "category": "everyday",
    "difficulty": "medium",
    "question": "What would {target} do if they walked in on a huge mess I made?",
    "options": [
      "Help clean it up without a word",
      "Ask what happened first",
      "Sigh dramatically then help",
      "Leave it for me to sort"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "everyday-031",
    "category": "everyday",
    "difficulty": "easy",
    "question": "If {target} had a free Sunday with zero plans, what would they do?",
    "options": [
      "Stay in bed as long as possible",
      "Get up and be productive",
      "Watch something all day",
      "Whatever I suggest"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "everyday-032",
    "category": "everyday",
    "difficulty": "easy",
    "question": "What's the most likely thing to ruin {target}'s morning?",
    "options": [
      "Running late",
      "Bad traffic",
      "No coffee or tea",
      "Someone being annoying early"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "everyday-033",
    "category": "everyday",
    "difficulty": "medium",
    "question": "If {target} had to give up their phone for a full day, how would they cope?",
    "options": [
      "Fine, actually kind of relieved",
      "Struggling but pretending not to",
      "Genuinely miserable",
      "Would find a loophole"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "everyday-034",
    "category": "everyday",
    "difficulty": "medium",
    "question": "What would {target} do if they got home and realised they'd left the oven on?",
    "options": [
      "Panic and rush back immediately",
      "Call someone to check",
      "Assume it's fine and deal with it later",
      "Never let it happen in the first place, too careful"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "everyday-035",
    "category": "everyday",
    "difficulty": "hard",
    "question": "If {target} had to pick a nickname for me based on a habit, what would it highlight?",
    "options": [
      "Something about being messy or tidy",
      "Something about being late or early",
      "Something about food habits",
      "Something about being dramatic"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "entertainment-026",
    "category": "entertainment",
    "difficulty": "medium",
    "question": "If {target} had to rewatch one show forever, what would it be?",
    "options": [
      "A sitcom we both love",
      "A drama they're obsessed with",
      "Something from childhood",
      "Whatever's on right now"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "entertainment-027",
    "category": "entertainment",
    "difficulty": "easy",
    "question": "What would {target} do if a film got spoiled for them?",
    "options": [
      "Be genuinely furious",
      "Shrug it off",
      "Pretend they didn't hear it",
      "Watch it anyway just to see for themselves"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "entertainment-028",
    "category": "entertainment",
    "difficulty": "medium",
    "question": "If {target} were in a movie, what genre would it be?",
    "options": [
      "Romantic comedy",
      "Action",
      "Documentary",
      "Chaotic slapstick comedy"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "entertainment-029",
    "category": "entertainment",
    "difficulty": "hard",
    "question": "What would {target} say is the most quotable film or show we watch together?",
    "options": [
      "Something we quote constantly",
      "Something from years ago",
      "Something recent",
      "We don't really quote things"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "entertainment-030",
    "category": "entertainment",
    "difficulty": "medium",
    "question": "If {target} had to choose one book, show, or film to make me experience, what would it be?",
    "options": [
      "Their all-time favourite",
      "Something nostalgic for them",
      "Something they think I'd secretly love",
      "They wouldn't be able to pick just one"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "entertainment-031",
    "category": "entertainment",
    "difficulty": "easy",
    "question": "What would {target} do during a scary film?",
    "options": [
      "Watch it head-on, no problem",
      "Hide behind a cushion or hand",
      "Need to pause it constantly",
      "Refuse to watch scary films at all"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "entertainment-032",
    "category": "entertainment",
    "difficulty": "medium",
    "question": "If {target} joined a random reality show, which would it be?",
    "options": [
      "A dating show",
      "A cooking competition",
      "A survival or adventure show",
      "A quiz show"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "entertainment-033",
    "category": "entertainment",
    "difficulty": "medium",
    "question": "What music would {target} put on to instantly improve their mood?",
    "options": [
      "Something upbeat and nostalgic",
      "Whatever's trending",
      "A specific artist they always return to",
      "Something a bit embarrassing they'd never admit to"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "entertainment-034",
    "category": "entertainment",
    "difficulty": "hard",
    "question": "If {target} had to be a character from a show we both watch, who would suit them?",
    "options": [
      "The chaotic one",
      "The sensible one",
      "The dramatic one",
      "The one who says what everyone's thinking"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "entertainment-035",
    "category": "entertainment",
    "difficulty": "easy",
    "question": "What would {target} do if I fell asleep 10 minutes into a film they picked?",
    "options": [
      "Wake me up immediately",
      "Let me sleep and watch it anyway",
      "Pause it and wait",
      "Be mildly offended about it"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "romantic-017",
    "category": "romantic",
    "difficulty": "hard",
    "question": "What would {target} say is the moment they knew this was serious?",
    "options": [
      "A specific early moment",
      "Somewhere further into the relationship",
      "They just eased into knowing",
      "They'd need to think about it"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "romantic-018",
    "category": "romantic",
    "difficulty": "hard",
    "question": "If {target} had to write one sentence about why they love me, what would it focus on?",
    "options": [
      "How I make them feel",
      "Something I do for them",
      "Something about my personality",
      "Something small and specific"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "romantic-019",
    "category": "romantic",
    "difficulty": "medium",
    "question": "What would {target} say is their favourite way to be shown love?",
    "options": [
      "Quality time together",
      "Thoughtful little gestures",
      "Physical affection",
      "Being told outright"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "romantic-020",
    "category": "romantic",
    "difficulty": "hard",
    "question": "If {target} could freeze one moment of us together forever, which would it be?",
    "options": [
      "A big milestone moment",
      "A quiet ordinary one",
      "Something from early on",
      "Something recent"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "romantic-021",
    "category": "romantic",
    "difficulty": "medium",
    "question": "What would {target} say is the most romantic place we've been together?",
    "options": [
      "Somewhere on a trip",
      "Somewhere close to home",
      "Somewhere unexpected",
      "Nowhere fancy, just wherever we're together"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "romantic-022",
    "category": "romantic",
    "difficulty": "medium",
    "question": "If {target} had to pick our love language as a couple, what would it be?",
    "options": [
      "Acts of service",
      "Quality time",
      "Words of affirmation",
      "Physical touch"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "romantic-023",
    "category": "romantic",
    "difficulty": "hard",
    "question": "What would {target} say they look forward to most about our future together?",
    "options": [
      "Building a home together",
      "More travel and adventures",
      "Just growing old together",
      "Something specific they've mentioned before"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "romantic-024",
    "category": "romantic",
    "difficulty": "hard",
    "question": "If {target} had to sum up our relationship in one word, what would it be?",
    "options": [
      "Something funny",
      "Something sincere",
      "Something simple",
      "They'd refuse to pick just one word"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "difficult-014",
    "category": "difficult",
    "difficulty": "hard",
    "question": "If {target} had to change one thing about how we communicate, what would it be?",
    "options": [
      "Talking things through sooner",
      "Being more direct",
      "Listening better in the moment",
      "Nothing, it already works"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "difficult-015",
    "category": "difficult",
    "difficulty": "hard",
    "question": "What would {target} say is the hardest thing we've gotten through together?",
    "options": [
      "A specific tough period",
      "Time apart or long distance",
      "A big disagreement",
      "Something they'd rather not revisit"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "difficult-016",
    "category": "difficult",
    "difficulty": "hard",
    "question": "If {target} had to admit one fear about our relationship, what would it be?",
    "options": [
      "Growing apart over time",
      "Not being able to fix a big problem",
      "Taking each other for granted",
      "They wouldn't want to say"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "difficult-017",
    "category": "difficult",
    "difficulty": "hard",
    "question": "What would {target} say is something they've learned about themselves through being with me?",
    "options": [
      "How to compromise better",
      "How to communicate feelings",
      "Patience",
      "Something else entirely"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "difficult-018",
    "category": "difficult",
    "difficulty": "hard",
    "question": "If {target} could redo one conversation we've had, which would it be?",
    "options": [
      "A specific argument",
      "A moment they wish they'd said more",
      "A moment they wish they'd said less",
      "They wouldn't change anything"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "difficult-019",
    "category": "difficult",
    "difficulty": "hard",
    "question": "What would {target} say is the biggest compromise they've made for this relationship?",
    "options": [
      "Something about time or priorities",
      "Something about lifestyle habits",
      "Something about future plans",
      "They wouldn't call it a compromise"
    ],
    "target": "either",
    "revealText": ""
  },
  {
    "id": "difficult-020",
    "category": "difficult",
    "difficulty": "hard",
    "question": "If {target} had to be completely honest, what's one thing they need more of from me?",
    "options": [
      "More reassurance",
      "More patience",
      "More quality time",
      "More space"
    ],
    "target": "either",
    "revealText": ""
  }
];

module.exports = { QUESTIONS, CATEGORIES, DIFFICULTY_POINTS };
