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

Dobble Party's Draft Night card opens `/draft-night-v2.html`. The original game is still reachable at `/draft-night.html`, and its Railway function has the triage fixes listed at the end.

## Rules

- **Builder** games build one creation each. **Drafter** games (Dream Garage) collect cards, with no scene.
- **Base round.** Builder themes with base options (house, pancakes) open with players + 1 bases, and everyone ends with exactly one. The base does not count towards the items each.
- **Item rounds.** The host chooses 3–6 items each, and there is one round per category. Each round's market shows players + 1 lots *together*: players' worth from that category, plus **one upgrade to the base** in every round of a theme that has upgrades. A second upgrade from the same group (a second batter or roof) replaces the first, and its card says so.
- **Bidding.** Lots are auctioned in the order shown, showpieces first. Only players without a lot this round can bid, and **anyone can pass**, including the opener. A timeout or a phone left idle passes; it never buys. A lot nobody bids on is set aside.
- **Free choice.** When one player still needs a lot, or the lots left equal the players still needing one, those players **choose** for free, least money first. Nobody is ever handed a specific lot they didn't bid on or choose.
- So 3 players × 5 items = 15 allocations and 4 × 5 = 20, plus one base each when the theme has a base round.
- **Duds** are not part of v2.
- **Voting.** At the end everyone votes for the best creation other than their own. A tie goes to the higher creation score (Showpiece 3, Great 2, Solid 1). If that is also tied, it is a draw. Money left never decides, because that would reward never bidding.

## Pictures: photographs only

There are no emoji anywhere in the game. Every base, item, upgrade, theme cover and empty plot is a photograph from the library at `public/draft-night/art/<artKey>.jpg`: 640 × 640 JPEG, about 90 KB each. Photos are drawn once and reused by every game.

`layout.compose(theme, owned)` plans each creation exactly; the client places photos by that plan:

- **Site** (zoo, water park, island) and **plot** (house): a 3 × 3 grid of photos. The base is in the centre and each purchase fills its own plot. Unbought plots show empty land (grass for the zoo, untouched jungle for the island, lawn for the house), so the board always reads as one whole place.
- **Room** (bedroom) and **stack** (pancakes): the base photo is the board. Purchases are layered on top: framed photos in their part of the room, or round topping photos around the plate, with the side dish bottom right.
- **Collection** (Drafter garage): one photo card per car.
- **Upgrades** appear as a strip of photo badges under the board. A replaced upgrade (a second batter) is listed as "Replaced by …", and the lot card warns before you take it.
- A photo that is still loading shows a neutral shimmer, never a symbol.

### How the library is made

`lib/draftnight/photos.js` plans one prompt per photo (422 for the seven themes). Prompts are short and positive; FLUX.2 has no negative prompting. Rules that came out of reviewing real output:

- Zoo habitats are shot from a low drone so the animals are large. From high up they were dots.
- Gates and signs are described as "plain and unlabelled". One gateway came back with its name painted on it.
- Brand names (Ferrari, Rolls-Royce, Nutella, Oreos…) are refused by Cloudflare's output filter, so those items carry a plain visual description, used automatically when the name is refused.

The list is `draft-night/photo-jobs.json`. The Railway function `draft-night-photos` (in the `draft-night` project, with Cloudflare credentials referenced from `draft-night-web`) draws them on FLUX.2 klein 9B. `PHOTO_FROM`, `PHOTO_TO`, `PHOTO_STEP` or `PHOTO_KEYS` choose which. It shrinks each photo with sharp and prints it to its log in chunks; `draft-night/collect-photos.py` rebuilds the files and a contact sheet for review. The 9B price is about $0.015 per photo, so the full library costs about $6.

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
- `test/draftnight-api.test.js` runs the real Express routes. It covers lobby, join, rejoin, full and started rooms, stale taps, voting, leaving and host hand-over, and a photo for every lot and board piece. It also checks the photo plan covers every picture with unique, negation-free prompts, and that every site or plot grid tile is drawn exactly once.
- `draft-night/e2e/v2-matrix.mjs` has one browser per player across 17 games. It covers every theme, 2–6 players, a CPU game, and screens from 320 × 568 to 1920 × 1080. On every screen it checks:
  - no page errors;
  - no emoji;
  - no raw markup;
  - every photo loaded;
  - no sideways scrolling;
  - each final board matching that player's purchases.

## Triage applied to the original game (`draft-night/server.ts`, `public/draft-night.js`)

The repo copy of the function was reset to what is live (`2951e95`). The staged changes after it lost the final picture in almost every replayed game. Then four fixes were applied:

1. Duds only when the host ticks "Include bad items". The live server ignored that setting.
2. Item thumbnails keep their subject. Live sends "Clear photograph of a as…" for 1,298 catalogue items.
3. A final picture the checker doubts is labelled ("Some purchases may not show clearly in this picture.") instead of thrown away. The one stronger repair still runs.
4. Custom-theme planning is no longer charged to the game's picture budget.

Replays with half of all final pictures rejected by the checker showed every final picture: 16/16, 12/12 and 8/8 per configuration. The live code showed 19–75%. `npm test`: 85 pass, 0 fail. The function was redeployed on 13 October, and its live code matches the repo byte for byte.

## Library status (13 October)

All 421 photos the seven themes can show are in `public/draft-night/art` and were checked by eye. About 40 were redrawn after review, for lettering, wrong animals, a literal crown and empty plots.

The Rolls-Royce Spectre was removed. Cloudflare refused every attempt to draw it, and its category still has the seven cars a six-player game needs.

Games make no image requests. The photo job `draft-night-photos` is parked (`PHOTO_KEYS=none`), so a restart draws nothing. To draw new photos, set `PHOTO_KEYS` (or `PHOTO_FROM`/`PHOTO_TO`) and `PHOTO_JOBS_URL` to the job list at an exact commit.
