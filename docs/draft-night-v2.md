# Draft Night v2

The redesign from `docs/draft-night-investigation.md`. It runs inside the main Dobble Party app (`server.js`), so it ships through the same tested Railway deploy as the client. There is no separate function and no 96 KB limit.

| Part | File |
| --- | --- |
| Page | `public/draft-night-v2.html`, `.css`, `.js` (open `/draft-night-v2.html`) |
| API (`/api/dn/*`) | `lib/draftnight/routes.js` |
| Round engine | `lib/draftnight/engine.js` (pure logic: injectable clock and random source) |
| Theme format, validation, layouts | `lib/draftnight/spec.js` |
| Picture plan | `lib/draftnight/layout.js` |
| Themes | `lib/draftnight/themes/*.json` |
| Art generator | `scripts/draftnight-art.js` |
| Tests | `test/draftnight-engine.test.js` (in `npm test`), `draft-night/e2e/v2.mjs` (two phones in Chromium) |

The original game at `/draft-night.html` and its Railway function are untouched apart from the triage fixes listed at the end.

## Rules

- **Builder** games build one creation each. **Drafter** games (Dream Garage) collect cards, with no scene.
- **Base round.** Builder themes with base options (house, pancakes) open with players + 1 bases, and everyone ends with exactly one. The base does not count towards the items each.
- **Item rounds.** The host chooses 3–6 items each, and there is one round per category. Each round's market shows players + 1 lots *together*: players' worth from that category, plus **one upgrade to the base** in every round of a theme that has upgrades. A second upgrade from the same group (a second batter or roof) replaces the first, and its card says so.
- **Bidding.** Lots are auctioned in the order shown, showpieces first. Only players without a lot this round can bid, and **anyone can pass**, including the opener. A timeout or a phone left idle passes; it never buys. A lot nobody bids on is set aside.
- **Free choice.** When one player still needs a lot, or the lots left equal the players still needing one, those players **choose** for free, least money first. Nobody is ever handed a specific lot they didn't bid on or choose.
- So 3 players × 5 items = 15 allocations and 4 × 5 = 20, plus one base each when the theme has a base round.
- **Duds** are not part of v2.
- **Voting.** At the end everyone votes for the best creation other than their own. A tie goes to the higher creation score (Showpiece 3, Great 2, Solid 1). If that is also tied, it is a draw. Money left never decides, because that would reward never bidding.

## Pictures

`layout.compose(theme, owned)` turns what a player owns into placed pieces: the base, one piece per category in its slot or parcel, and the latest upgrade per group. The page draws exactly that plan. With art, each piece is its picture. Without art, it is a labelled tile. Either way the creation is exactly what was bought, and every phone draws it instantly with no image generation during play.

Archetypes are `site` (zoo, water park, island), `plot` (house), `room` (bedroom), `stack` (pancakes) and `collection` (Drafter). A theme names its archetype and gives each category a slot. Adding a theme means writing data, not prompt rules.

Art lives at `public/draft-night/art/<artKey>.jpg`, for example `site/parcel/lion-pride-plains.jpg`. The server indexes it at start-up. `node scripts/draftnight-art.js --dry` lists all 417 assets for the seven themes with their prompts. A full draw is about $0.48 on klein 4B, or $6.25 on 9B, at published prices.

**Not decided yet (needs the visual trial):** how pancake toppings and house upgrades are drawn *onto* the base. Either transparent cut-outs layered on the base, or one image edit per purchase. For now they appear as labelled tiles on the board.

## Measured

- `test/draftnight-engine.test.js`: 13 tests, including about 1,680 random complete games (every theme, 2–6 players, 1–6 rounds, CPUs, timeouts). They cover exact counts, one lot per player per round, money accounting, every purchase placed once in the picture plan, the opener passing, set-aside lots, the free-choice order, stale-tap rejection, upgrade replacement, voting and hidden future markets.
- `draft-night/investigation/strategy.js`. A player who never bids, against value bidders, averaged these creation scores:

  | Players | Never bids | Value bidders |
  | --- | --- | --- |
  | 2 | 9.6 | 15.0 |
  | 3 | 8.0 | 13.1 |
  | 4 | 7.3 | 12.2 |
  | 6 | 6.0 | 11.4 |

  The value bidders took nearly every showpiece. Free choices are 50% of allocations with 2 players and 17% with 6, because the last player in each round chooses from the two lots left.
- `draft-night/e2e/v2.mjs` played a complete two-phone house game in Chromium with no page errors: one home plus four items each, voting, and the final reveal on phone and wide layouts.

## Triage applied to the original game (`draft-night/server.ts`, `public/draft-night.js`)

The repo copy of the function was reset to what is live (`2951e95`). The staged changes after it lost the final picture in almost every replayed game. Then four fixes were applied:

1. Duds only when the host ticks "Include bad items". The live server ignored that setting.
2. Item thumbnails keep their subject. Live sends "Clear photograph of a as…" for 1,298 catalogue items.
3. A final picture the checker doubts is labelled ("Some purchases may not show clearly in this picture.") instead of thrown away. The one stronger repair still runs.
4. Custom-theme planning is no longer charged to the game's picture budget.

Replays with half of all final pictures rejected by the checker showed every final picture: 16/16, 12/12 and 8/8 per configuration. The live code showed 19–75%. `npm test`: 85 pass, 0 fail. **The function is not redeployed.** That needs approval, and the steps in `docs/draft-night.md`.
