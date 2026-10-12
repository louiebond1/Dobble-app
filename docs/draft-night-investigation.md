# Draft Night: investigation, diagnosis and redesign

Written 12 October 2026, against branch `main` at `0e5b852`, the live Railway services and their logs. No paid image requests were made and nothing was deployed.

## How to read this

Every finding carries one of these labels:

- **Measured.** I reproduced it by running the real server code. `draft-night/investigation/repro.js` re-runs these games with mocked providers, so they cost nothing.
- **Live evidence.** Taken from the production Railway logs, deployments or HTTP metrics.
- **Confirmed in code.** Read directly from the source. The behaviour follows with certainty.
- **Suspected.** A probable cause that I could not prove without looking at real pictures.
- **Estimate.** A forward-looking figure. The inputs are stated with it.

**What I could not do.** I could not look at pictures the live system produced. The bucket credentials are redacted from me, and this sandbox cannot reach Railway's public domains. Statements about how pictures *look* therefore rest on two things: the live vision checker's own descriptions of real outputs, found in the logs, and analysis of the exact prompts sent. I mark those as suspected wherever that applies.

---

## Stage 1–2: what is actually happening

### A. You are not playing the code in the repository (live evidence)

| Part | What's live | What the repo has |
| --- | --- | --- |
| Game API (`draft-night-web` function) | Commit `2951e95` (11 Oct 14:58) | Six later server changes. They sit *staged* on Railway but were never deployed. |
| Client (`dobble-party`) | Commit `247c149` (11 Oct 16:23). This is the last successful deploy. | Every deploy since then **failed**: `ee3607f`, `6891f2a`, `237b634`, `83eb834`, `0f455d6`, `0e5b852`. |

The client deploys fail because `npm test` is the pre-deploy step, and the suite fails: 11 of 55 tests on the current branch, 10 in the last Railway run. Those tests describe behaviour that later commits changed on purpose, such as duds being optional and render batching. Nobody updated the tests, so every "fix" since Saturday afternoon has been blocked. `docs/draft-night.md` still says "70 tests pass".

Consequences:

- **Duds are still on for everyone.** The live backend ignores the `badItems` flag, and the live client has no toggle. About 1 in 8 additions is a dud. The logs show real games with three duds in one resort.
- **The fixes you were told about have never reached a player.** Neither has the "third purchase and final only" change, nor the premium final renders.
- **Deploying what is staged today would make things worse** (measured, section C).

This is a process failure, not a game-design one. But it explains why weeks of fixes have not changed the experience.

### B. The live item pictures are mostly the same picture (confirmed in code and measured)

The live thumbnail prompt keeps an item's description up to the first word from a list that includes "clearly". All 2,992 pool items in the 244 generated ideas have descriptions that begin "a clearly visible …". So for every non-aerial idea, the live server sends this exact prompt:

> "Clear photograph of **a** as a single isolated subject, centred and filling most of the frame, on a plain softly lit warm-grey background…"

That affects **1,298 distinct items, 10,824 item slots across 123 of the 250 ideas**. All of them send one identical prompt with no subject. The picture library caches by prompt, so they all show the same one or two stored pictures. This is the "bakery shows the same fruit for everything" problem.

Commit `ee3607f` tried to fix it but misdiagnosed it. It added "STRICT OBJECT IDENTITY … absolutely no apples, fruit … a pot rack must not be a piece of fruit … a double oven …" to every item prompt. That injects *apples, fruit, pot rack and oven* into every thumbnail, including pancake toppings, and it was never deployed anyway.

### C. Final pictures are being thrown away (measured, with live evidence)

The live logs, 10–12 October, show three ways a creation picture is lost:

1. **"Game AI budget reached"** appears 9 times. Each game has a hard $0.058 ceiling for all AI work, and the final render, composition plan and vision check do not fit after earlier spending.
2. **The vision checker rejects the picture and the game shows nothing.** Real rejections include:
   - "the cheese appears to be American cheese, not pepper jack"
   - "the leaking tap is not clearly visible"
   - "the modest entrance pavilion … is not visible"
   - "a stack of four pancakes … but the original base should be a Belgian waffle"
   - zoo: "multiple animals mixed together in a single enclosure … extra animals (walrus, duplicate polar bears, emus, penguins…)"
3. **Cloudflare's free tier runs out.** The 10,000-neuron daily allowance was exhausted on 11 October. Base pictures then failed with HTTP 429, and some outputs were flagged by moderation (code 3030).

I replayed complete games against both the live code and the repo code. The mock providers return realistic token usage. "Vision reject" is the assumed chance that the checker rejects a render. The live rate is unknown, but the logs show it is frequent.

| Code | Vision reject | Complete final pictures (house / pancakes / zoo, 2–4 players, 6 games each) |
| --- | --- | --- |
| Live | 0% | 100% |
| Live | 50% | 3/18 to 14/18 per row. 3 to 6 of every 6 games hit the budget. |
| Repo HEAD (staged) | 0% | **0 to 3 out of 12–24 per row. Nearly every game hits the budget.** |
| Repo HEAD (staged) | 50% | 0 to 3 out of 12–24 per row |

Why HEAD is worse (confirmed in code): it renders the third-purchase and final pictures on FLUX.2 klein 9B. Each costs about $0.017, and two per player already exceed $0.058 for two players. The gpt-4.1 vision check reserves about $0.016 more before it runs.

The client then shows whatever older picture exists. That can be the empty starting scene, labelled "Photo preview", which is why the final result sometimes shows the wrong picture. A player whose share is 2 or fewer items never gets a picture at all, because the client only displays version 3 and above (confirmed in code).

**Custom themes are worse** (measured). Two planner passes spend about $0.029–0.035 of the same $0.058 ceiling before any picture is drawn. With all vision checks passing, live custom games produced complete final pictures for 2 of 4 players (2-player games), 2 of 8 (4-player) and 0 of 12 (6-player). HEAD produced 0 in every case. For 6 players the planner is asked for 34 items plus 8 bases plus 8 duds. That is estimated at about 3,050 output tokens against `max_tokens` 3000, so the JSON is likely to be cut off and the theme to fail (estimate).

### D. Why the pictures that do appear don't match purchases (confirmed in code; visual effects suspected)

1. **The task is beyond the model.** Each creation picture asks a 4-step distilled diffusion model (klein 4B, or 9B on HEAD) to *invent an entire scene* from a text list of 3–8 named objects plus essentials, in one shot. Putting many specific, countable objects into one generated image is the weakest capability of these models, and it gets worse as items are added. Nothing in the pipeline supplies layout, position or size, so each render is an independent gamble. The vision checker then rejects the gamble. *This is the root cause of mismatched items, random extras and inconsistency between progress pictures and the final picture.*
2. **The prompts fight the model.**
   - The zoo final prompt is 446 words, measured from what the code sends.
   - It contains "maple syrup does not imply pancakes, and an empty plate stays an empty plate", "coastline", and "never a tabletop, tray, miniature, printed photograph or collage". Those are copied into every theme.
   - FLUX.2 does not support negative prompting. Black Forest Labs says to describe what you want instead ([BFL help](https://help.bfl.ai/articles/7734566352-does-flux-2-support-negative-prompting)).
   - So "no swimming pool, no hot tub, no cars, no extra buildings" in every house prompt puts pools, hot tubs and cars into the conditioning. *Suspected cause of houses appearing with pools nobody bought.*
   - The repo's house planning guide also says "mansion upgrade… increase land" inside the empty-plot prompt.
3. **There is no content behind 244 of the 250 ideas** (confirmed in data). `scripts/build-draft-catalogue.py` builds every item as `"a clearly visible " + name + one generic placement phrase per family`. The blurb players see is just the name repeated. Examples:
   - Wave Pool is "a clearly visible wave pool as a full-size separate pool, slide or leisure area within the water park".
   - Dud zoo items read "broken safari train as a spacious natural habitat with the named living animals plainly visible".
   - Habitats include "several live wolfs".

   Only house, pancakes, burger, pizza, gaming and garage were written by hand. `docs/draft-night-visual-specs-250.json` is not read by anything.
4. **Scale cannot be achieved at this resolution** (confirmed by geometry). An aerial shot that makes a zoo look *enormous* puts a lion at a few pixels in a 1024px image. "Huge site" and "every animal recognisable" pull against each other in a single photo. The prompt asks for both, so the model compromises with a small field and crowded animals. That is exactly what the logs describe.
5. **Progress is invisible** (confirmed in code). The live server edits the picture every two wins. HEAD renders only after the third acquisition and at the end, and the client hides everything below version 3. Players spend most of the game looking at a list.

### E. The rounds don't make sense: the allocation rules (confirmed in code and measured)

The live engine (`recipients`, `beginLot`, `pass` in `server.ts`) combines four rules:

1. **Every lot must go to someone**, and the game has exactly `players × share` lots.
2. **Hard per-player quota.** Once someone has their share, they are excluded. Once the lots left equal the slots still owed, only the owed players can receive them.
3. **The opener must bid at least £1** and cannot pass. A timeout or idle phone auto-bids £1.
4. **Lots come from a random weighted deck**, regardless of what anyone owns or needs.

Together, these mean money stops mattering and the game starts dealing items. Measured over 20 replays per row, with no duds:

| Players | Lots handed out free by the quota rule | …in the final third of the game |
| --- | --- | --- |
| 2 (house) | 39–50% | 73–100% |
| 3 (house) | 20–28% | 40–64% |
| 4 (house) | 10–20% | 14–42% |
| 2 (bedroom) | 10–33% | 25–76% |

The range depends on how evenly players bid. In a two-player game, whoever spends early fills their share. The opponent is then simply *given* everything that comes up, whatever it is. The opener rule adds forced £1 purchases of items nobody wanted. Each one permanently uses up one of five slots. Random dealing means one player can be offered three pools and no garden.

The houses themselves are handled correctly: one each, and the last house goes free to the last player. But the share counts the house as one of the five. With "Auto" and 3 players, everyone ends with **1 house + 4 additions**, not 5 additions.

The pancakes theme opens with Belgian waffles, crêpes, French toast and Dutch babies, not pancakes.

There is no separate "Builder" and "Drafter" mode in the code. There is an internal `mode` (property, build or collection) that players never see. Collection themes such as garages and squads still try to produce one generated photo.

### F. Other architectural weaknesses (confirmed in code)

- **Rooms live in memory in a single function.** Any redeploy or restart ends every game, and it cannot scale horizontally.
- **The 96 KB single-file limit** (Railway passes the source as one argument) has driven the code into very dense, 300+ character lines. It is why deployed code and repo code drifted apart.
- **The host cannot start until every thumbnail for the game is ready.** On a cache miss, that is 10–30 serial image jobs before play begins.
- **The closing verdict is a short LLM opinion.** There is no player voting or scoring, so "who won" carries no weight.

---

## Stage 3: design

### The five biggest underlying problems

1. **The picture system asks an AI to invent a different scene every time, then throws its own work away.** The live and HEAD architecture regenerates each creation from a text inventory. Accuracy is low by construction, consistency is impossible, and a strict all-or-nothing checker turns imperfect pictures into no picture.
2. **Image spending is gated in a way that guarantees missing pictures.** A $0.058 per-game ceiling is shared with planning, the 9B render pricing does not fit it, and production relies on Cloudflare's free daily allowance (about 80 creation edits a day).
3. **The allocation rules make most of the endgame meaningless.** A fixed quota, mandatory selling, forced opening bids and a random deal hand out up to half of a two-player game for free.
4. **There is no structured understanding of themes.** 98% of the catalogue is templated names. There is no notion of *what kind* of thing is being built: its camera, layout, scale, categories or slots. Custom themes rely on a long prompt and luck.
5. **The delivery pipeline is broken.** Red tests block deploys silently, the function is edited out of band, and the docs describe behaviour nobody is playing. No fix can be trusted until this is repaired.

### Image architecture: options compared

All costs below are estimates. Cloudflare prices are from the Workers AI price list and match the constants in the code: klein 4B costs $0.000287 per 512px output tile plus $0.000059 per input tile, and klein 9B costs $0.015 for the first megapixel plus $0.002 per extra or input megapixel. Other providers' prices are third-party aggregates (roughly $0.005–0.07 per image) and must be re-checked before any decision.

| Option | Accuracy to purchases | Consistency between players | Speed per purchase | Marginal cost per 4-player game | Main risk |
| --- | --- | --- | --- | --- | --- |
| 1. Current: regenerate whole scene from text, small model, vision gate | Low (logs) | None | 10–60 s plus checks | $0.02–0.06, often hits the ceiling | Already failing |
| 2. Same, but a premium model (gpt-image, Gemini Flash Image, Seedream, FLUX.2 pro) | Better, still unreliable beyond about 5 objects | None | 10–30 s | About $0.04–0.07 per image. Progressive pictures for 4×5 purchases come to about $0.8–1.4. | Cost scales with play. Still a gamble. |
| 3. Incremental edit adding one item per win | Medium (one target per edit) | Low (drift) | 5–20 s | 4B ≈ $0.03; 9B ≈ $0.35 | Cumulative drift. Aerial scale still unsolved. |
| **4. Composite from pre-made, cached item art placed in theme layouts** | **Exact by construction.** Every purchase is drawn because it is placed. | **High.** Same base, same camera, same art for everyone. | **Instant** for cached art | **≈ $0** for catalogue themes | Can look like stickers unless the art direction is designed for compositing |
| **5. Option 4, plus one optional AI "finish" pass on the final composite** | Exact layout. The finish is checked against the composite and the composite is the fallback. | High | Instant during play, about 10–20 s at the reveal | About $0.07 (4 × 9B edit) or $0 if skipped | One extra moving part, but it can never remove the picture |

### Recommended: option 5, with option 4 as the guaranteed core

The principle: **decide layout in code; use AI only to paint assets once and, optionally, to polish.** A purchase should appear in the creation because the game *placed* it, not because a model happened to draw it.

**1. Scene archetypes.** Five reusable layout systems replace per-theme prompt rules:

| Archetype | Examples | Camera and art | Layout engine |
| --- | --- | --- | --- |
| **Site** | Zoo, water park, theme park, island, resort, golf, festival, airport, city, campsite | High isometric masterplan | A grid of large parcels around paths and an entrance hub. Each purchase fills a parcel as an isometric tile, which solves scale: a zoo of nine big habitat parcels reads as *enormous*, and each habitat is a recognisable tile. |
| **Plot** | House, villa, farm | Isometric plot with the purchased house in the centre | Zones around the house: back lawn, side, front drive, roof, water edge. Pools take the lawn zone, garages the drive. |
| **Room** | Bedroom, kitchen, office, gym, bar, cinema | Isometric cut-away room ("diorama") | Floor and wall slots. Upgrades *replace* the slot's item, such as bed → four-poster. |
| **Stack/layer** | Pancakes, burger, pizza, sundae, cake | Fixed product shot | Toppings are layer art aligned to the base shape: a burger stacks, pizza toppings scatter, syrup drips. |
| **Collection** (Drafter) | Garage, football squad, dinner-party guests, band | Cards on a board, formation or garage bays | One card per pick. There is no single generated scene. |

**2. Art direction for compositing.** Photoreal compositing is the hardest style to make seamless: lighting, shadow and perspective must all match. A **consistent stylised 3D or isometric illustration** (in the spirit of polished management sims) composites cleanly, reads well on a phone, and makes the five finished creations easy to compare side by side. I recommend testing it against photoreal-plus-AI-finish in a small spike before committing. This is a product decision, and you should see both.

**3. One asset, used everywhere.** The art shown on the auction card *is* the art placed in the creation. "The picture looks nothing like what I bought" stops being possible.

**4. The AI finish (optional).** At the reveal, one image edit per player takes the composite as input, with a short positive prompt such as "unify lighting and shadows, keep every object and position". A cheap check compares the result to the composite. If it fails or times out, the composite is shown. The reveal is never empty.

**5. Delivery.** Assets are stored as WebP in the bucket behind a CDN and composited on the phone (canvas or CSS layers). There are no server image jobs during play, and no "preparing pictures" wait in the lobby for catalogue themes.

### Recommended round engine: "market rounds"

The aim is for every round to make sense, every allocation to be a choice, money to matter until the end, and the allocation count to be exactly `players × share`.

**Structure**

- **Round 0, base round** (base themes only: house, pancakes, burger…). Show **players + 1** base options together. Auction them one at a time. Each player can win **one**. When one player is left without a base, they **choose** from the two that remain, free.
- **Rounds 1…S, category rounds.** Each round has a category from the theme: for pancakes, *Sauces, Fruit, Crunch, Indulgence, Sides*; for a zoo, *Big cats & predators, Savannah, Primates, Water & polar, Attractions*. Show **players + 1** items from that category *all at once*, so people can plan: "do I fight for the lion, or wait for the cheaper tiger?" Auction them in turn. Each player wins **at most one per round**, and anyone may **pass on any lot**, including the opener. If everyone passes, the lot is discarded. When the items left equal the players still needing one, those players **pick** in order, from least money to most (a catch-up rule).

**Why this fixes the measured problems**

- The totals are exact by construction. With 3 players and 5 rounds there are 15 allocations; with 4 players, 20. Every player ends with exactly one item per round.
- Nobody is handed a specific item they didn't want. The worst outcome is choosing the last of two items in a category, for free.
- Categories keep creations balanced and comparable (no three-pool houses), and they map directly to layout slots in the picture system.
- Money matters until the last round. A fair-share hint (budget ÷ rounds) helps new players judge bids.

**Budgets.** One budget across all rounds. Leftover money is shown, and it breaks ties.

**Winning.** At the reveal, everyone votes for the best creation other than their own. The AI host's line is optional colour, not the judge.

**Duds.** Removed from the standard game, deck and code path. They can return later as an opt-in "Chaos" modifier. Item **tiers** (Showpiece, Great, Solid) replace them: a Solid item such as a picnic bench is cheap and sensible, not a joke. Each market mixes tiers so there is a real trade-off.

**Drafter mode** is a separate mode, not a theme flag. It uses the Collection archetype, with snake draft or the same market rounds, card art and a board or formation reveal. There is no scene generation.

### Recommended theme system (catalogue and custom)

A theme becomes a small, validated **spec** instead of free text:

```
archetype: site | plot | room | stack | collection
base:      (fixed starter) or base options (one per player + 1)
categories: 4–6 × { name, slot type, 6–12 items }
item:      { name, 6–10 word blurb, tier, slot size, replaces? }
```

- **Catalogue.** Fewer, better themes. I recommend roughly **30–40 hand-curated themes**, written and art-directed properly, instead of 250 where 244 are templated. The location variants (Beach Bedroom, Cabin Bedroom…) should become one theme with a *style* option on the base, not 8 near-identical entries.
- **Custom themes.**
  - One planner call returns this spec under a strict schema with an archetype enum. Code validates it: category counts, item counts, slot fit and duplicates. Ambiguous topics get the existing "which did you mean" question.
  - The planner understands scale and composition because the *archetype* carries those rules, not the prompt. A "safari park" maps to *site*, a "hot chocolate" to *stack*, a "spa bathroom" to *room*. No per-theme rules are needed for hundreds of topics.
  - Assets come from short, positive, archetype-specific templates, for example: "isometric illustration of a lion habitat occupying a square parcel of land, 45° view, {style}". They are **cached globally** by archetype, style version and normalised item name. A lion habitat painted once serves every zoo-like custom theme, so the cache gets cheaper as people play.
  - Custom themes are the natural **paid feature**. Their cost is mostly first-time asset painting.
- **Planning cost moves off the per-game picture budget**, because pictures no longer need one. Setup is reported separately.

---

## Stage 4: costs, times and trade-offs

### Measured (mock providers, real code)

- Live game AI spend with every check passing: $0.021 (2 players) to $0.045 (4-player zoo) per game. With 50% vision rejection it reaches the $0.058 ceiling in most 3–4 player games.
- HEAD game AI spend reaches the ceiling in nearly every game, even with no rejections.
- Custom theme planning: about $0.029 (2–4 players) and about $0.035 (6 players) per theme, before any pictures.
- Allocation: the free-handout rates in section E.

### Live evidence

- About 180 rooms were created in the last 7 days.
- Cloudflare's free daily allowance was exhausted on 11 October.
- Real rejections and budget failures are quoted in section C.

### Estimates for the recommended design

The inputs are Cloudflare's published prices. Asset counts are my assumptions.

| Item | Estimate |
| --- | --- |
| Painting one catalogue theme | About 50 assets × 3 candidates on klein 4B at 1024px (about $0.0011 each) ≈ **$0.20**. On 9B (about $0.015 each) ≈ **$2.25**. Human curation time is the real cost. |
| A 35-theme curated catalogue | **About $7–80 one-off**, depending on the model chosen in the spike |
| Per catalogue game, pictures during play | **About $0.** Cached assets, composited on the phone. |
| Optional AI finish at the reveal | About **$0.017 per player** on 9B. **About $0.07** for 4 players. Can be off, sampled, or a paid extra. |
| Per custom theme | Planner about $0.01–0.03, plus new assets only: about $0.05 (4B) to $0.60 (9B) for 40 new items, falling as the global cache fills |
| Time to show a purchase in the creation | Instant (under 1 s, image already cached on the phone) |
| Time to first play, catalogue theme | No picture wait |
| Time to first play, custom theme | About 15–60 s on first use while missing assets are painted, done in parallel during the lobby. I have no latency measurements, so this needs measuring in the spike. |
| Hosting | Unchanged at small scale. At large scale, rooms need a shared store (Redis or Postgres) and WebSockets or longer polling. Not measured. |

**Trade-offs, stated plainly**

- Compositing trades "anything can happen" for "exactly what you bought". Creations within a theme will share a visual language. That is good for comparison, but less surprising.
- A stylised art direction is a real product change. If you insist on photoreal, the AI finish carries more weight, and the per-game cost becomes about $0.07 or more.
- Moving from 250 themes to about 35 is a smaller catalogue that actually works. Custom themes cover the long tail.

---

## Stage 4: implementation plan, in order of importance

**Phase 0: stop the bleeding (1–2 days, no new spend)**

1. Do **not** deploy the staged function. It loses the final picture in nearly every game (measured). Discard the staged patch.
2. Fix or replace the 11 stale tests. Run `npm test` in CI on every push. Deploy the backend only from CI, from a commit. Add the commit hash to `/health` and the client footer, so "what's live" is never a guess again.
3. A minimal live patch, on top of `2951e95`:
   - Duds respect the toggle, off by default.
   - Fix the thumbnail prompt that loses the item name, with **no** apples or ovens text.
   - Show the latest picture with a note instead of discarding a checker-rejected one.
   - Exclude planning from the picture ceiling.
   - Remove the negations and the cross-theme sentences (pancakes, plates, coastline) from prompts.

   This is triage, not the redesign.
4. Decide whether to move Cloudflare to the paid plan (about $5/month base per Cloudflare's published plan; please verify). The free 10k-neuron allowance cannot support real play. **This needs your approval.**

**Phase 1: round engine v2 (about 1 week, no spend)**

5. Implement market rounds, the base round, pass-anytime, catch-up picks, tiers, fair-share hints, voting, and duds removed.
6. Separate Builder and Drafter modes in the API and UI.
7. Move the backend out of the 96 KB single-file function into a normal multi-file service built from the repo, with rooms in a durable store.
8. Simulation tests: thousands of random games per mode and player count, asserting the acceptance tests below.

**Phase 2: visual spike (2–3 days, about $5 of image generation, needs your approval)**

9. Build three archetypes end to end (**site: zoo**, **plot: house**, **stack: pancakes**), with 8–10 assets each, in two art directions: stylised isometric, and photoreal plus AI finish. Composite real game inventories and compare side by side on a phone.
10. Choose the art direction and asset model from what you see, not from my guess.

**Phase 3: content and composer (2–3 weeks)**

11. A theme spec format, a validator and a layout engine for all five archetypes.
12. Rewrite the catalogue as about 35 curated themes with real blurbs, tiers and categories, and paint and curate their assets.
13. Optional AI finish pass with the composite as fallback.

**Phase 4: custom themes as a product (1–2 weeks)**

14. Single-call planner producing the spec, with a global asset cache, lobby-time painting, and paid gating or per-day limits.

**Phase 5: scale and polish**

15. WebSockets or longer polling, horizontal scaling, results sharing images, analytics on bids and passes so content can be tuned.

---

## Acceptance tests

Automated tests are simulation or unit tests run in CI. Manual tests are a human on two or more real phones.

**Rounds and allocation (automated, 10,000 random games per player count 2–6, both modes)**

- Final item count is exactly `players × share`, for example 15 for 3×5 and 20 for 4×5. Every player has exactly `share`.
- Base themes: every player has exactly one base, and it was won or *chosen*, never assigned.
- No player ever receives an item they did not bid on or choose.
- The opener can pass. A lot that everyone passes is discarded, and the game still completes.
- Each round's items all belong to that round's category, and every item belongs to the theme spec.
- With duds off (the default), no reverse-auction lot ever appears, and none of the theme's dud items appear anywhere.
- Money never goes negative, and spent plus left equals the budget.

**Pictures (automated)**

- For every catalogue theme and every possible inventory, the composite contains exactly one placed asset per purchase plus the essentials, and nothing else (checked on the layout data, not by vision).
- The asset shown on each auction card is byte-identical to the asset placed in the creation.
- A failed AI finish leaves the composite in place, so the final reveal always has a picture.
- Item prompts are unique per item: no two different item names produce the same prompt or cache key.
- No prompt contains words for objects from other themes, and none contains negations.

**Pictures (manual, before launch)**

- Zoo with 5 habitats reads as a large zoo, with each animal identifiable on a 375px-wide phone.
- House: the starting house matches its card. A pool appears only when bought, in the garden zone.
- Pancakes: the base is pancakes, and each bought topping is visible on that stack.
- Two players' creations side by side are instantly comparable.

**Speed and cost (automated, plus production metrics)**

- Catalogue game: the lobby can start with no picture wait. A purchase appears in the creation in under 1 s at the 95th percentile.
- Catalogue game: zero image-generation calls during play when the AI finish is off.
- The cost per game recorded in logs stays within the agreed figure. The daily spend dashboard is visible in `/health`.

**Delivery (automated)**

- `/health` reports the same commit as `main`. A CI job fails if they differ for more than 30 minutes after a merge.

**Experience (manual, with two phones and a shared screen)**

- At any moment, each phone shows the current lot, the leader and their bid, everyone's remaining money, and each player's items.
- The reveal shows every creation and item list, money left and the vote, and the winner is announced.

---

## Decisions I need from you

1. **Does the starting base count as one of the five?** For example, in a 3-player house game, is it "1 house + 5 additions" (18 allocations) or "1 house + 4 additions" (15)? Your brief can be read either way, and the code currently does the second.
2. **Art direction.** Are you open to a stylised isometric look if it is exact and instant, or must it be photoreal? I recommend deciding after the Phase 2 spike.
3. **Approval to spend** about $5 on the Phase 2 visual spike, and whether to move Cloudflare to the paid plan.
4. **Catalogue size.** Are you comfortable cutting from 250 templated ideas to about 35 curated themes plus custom themes?

## Reproducing the measurements

```
node draft-night/investigation/repro.js all 6        # everything
node draft-night/investigation/repro.js pictures 6
node draft-night/investigation/repro.js custom 4
node draft-night/investigation/repro.js allocation 6
node draft-night/investigation/repro.js prompts
```

"Live" means commit `2951e95` (what Railway was running on 12 October). "Head" means the working tree. No network or paid calls are made.

Sources: [Cloudflare Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/), [BFL: FLUX.2 negative prompting](https://help.bfl.ai/articles/7734566352-does-flux-2-support-negative-prompting), [third-party image API price comparison (re-check before use)](https://intuitionlabs.ai/articles/ai-image-generation-pricing-google-openai).
