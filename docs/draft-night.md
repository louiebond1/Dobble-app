# Draft Night

A party auction game: everyone gets the same budget, bids on one item at a time, and watches their own creation (a house, a pancake stack, a garage…) change with every win. At the end, the creations are shown side by side.

## Where things live

| Part | File | Deployed as |
| --- | --- | --- |
| Client (all screens) | `public/draft-night.html`, `public/draft-night.css`, `public/draft-night.js` | Served by this app (`dobble-party` Railway project, deploys from `main`) |
| Game API and images | `draft-night/server.ts` | Railway Function `draft-night-web` in the `draft-night` project |
| Curated theme pools | `public/draft-night-themes.json` | Served by the client site; loaded by the game API at startup |
| Tests | `test/draft-night.test.js` (runs in `npm test`, the Railway pre-deploy step) | |
| Browser end-to-end run | `draft-night/e2e/run.mjs` with `draft-night/e2e/mock-openai.mjs` | Local only |

Dobble Party’s Draft link opens `/draft-night.html`. The standalone Draft Night domain redirects to this same page, which uses the same API and stored image keys. There is no separate frontend catalogue to keep in sync. Versioned CSS/JavaScript links are bumped with this revision so refreshed clients load the new library.

The function source is passed to its container as one base64 argument, so `server.ts` must stay under 96KB (a test enforces this). To deploy it, replace the function's source with the contents of `draft-night/server.ts` (Railway dashboard, or the Railway MCP `update-function-source-code` tool). Redeploying ends any game in progress, because rooms live in memory.

Pictures use Cloudflare FLUX 2 Klein 4B when configured. Item thumbnails are 512px; starting scenes and creations are 1024px. A flagged output gets one neutral-wording retry. With `DRAFT_ALLOW_PAID_FALLBACK=1` (default on), a failed or semantically incomplete picture can use the stronger Klein 9B model. Credit, daily allowance and cost-limit errors never trigger fallback. Runtime games block variable-price OpenAI images to keep the cost ceiling enforceable. `OPENAI_API_KEY` powers custom-theme planning (`DRAFT_PLANNER_MODEL`, default `gpt-4.1`), a second review with `DRAFT_TEXT_MODEL` (default `gpt-4.1-mini`), final composition planning, inventory vision checks (`gpt-4.1`) and the closing verdict.

Every room reserves costs before each provider request, including retries and failures. The room ceiling is $0.058 in API usage; custom-theme setup usage is carried into the room. This leaves room for 20% VAT below 7p at a conservative $1 = £1 conversion; hosting and future provider price changes are outside this calculation. Unknown model prices fail closed. Text reservations bound UTF-8 prompt/schema bytes, image input and maximum output tokens; successful calls reconcile to reported usage. Cloudflare reserves fixed tile prices. A separate persistent daily dollar ceiling, `DRAFT_DAILY_PICTURES × $0.001384`, preserves the previous default-model spending envelope, alongside the existing picture-count limit. Failed requests consume dollar allowance even when their picture slot is refunded. If a limit is reached, the game keeps playing with the complete item list and explains the picture limit.
Picture library: starting-scene and item pictures depend only on their prompt, so they are stored permanently in the Railway bucket `draft-night-art` (draft-night project; variables `ART_ENDPOINT`, `ART_BUCKET`, `ART_REGION`, `ART_KEY_ID`, `ART_SECRET` on `draft-night-web` reference it); `ART_PATH_STYLE=1` is required, because this storage only accepts path-style addresses even though Railway reports virtual-host style. Stored pictures are reused by every later game. Only players' own creations are made per game (in memory, as before). `/api/img` redirects stored pictures to a signed bucket link, so phones load them straight from storage. Up to `DRAFT_ART_VARIANTS` (default 2) versions of each picture are kept; a game uses any stored version and never pays for an extra one. Changing a picture's description, quality or model gives it a new library name, so it is made again. `POST /api/prefill {key, themes?, variants?, max?}` (key = `DRAFT_ADMIN_KEY`) fills the presets' library behind live games, 40 pictures per run by default, and stops at the first failure (such as Cloudflare's daily allowance); `GET /api/prefill?key=` shows progress. If the bucket is unreachable, pictures are made and served from memory as before.

Daily picture cap: `DRAFT_DAILY_PICTURES` (live: 900) limits pictures made per UTC day across games and prefill; the count is kept in the library (`meta/usage-YYYY-MM-DD.json`) so restarts do not reset it, and `/health` shows it. Past the cap, or when Cloudflare's free daily allowance runs out, games show item lists instead of pictures with a clear message, and do not retry.

Other live image settings: `DRAFT_WORLD_BATCH` (default 2) wins per creation edit; the end of the game redraws any creation still behind. `DRAFT_ALLOW_PAID_FALLBACK=1` permits the priced stronger Cloudflare fallback within both limits.

## Curated pools and deployment order

The version-2 catalogue contains **250 selectable ideas**, with **75–80 additions per idea** (19,971 per-theme choices). Thirty broad families have eight related location/style variants, four additional standalone ideas and the six original presets. Shared pools keep this to 2,720 reusable pool item records plus the original six pools. `scripts/build-draft-catalogue.py` builds the checked-in JSON deterministically; the backend hydrates references, validates prerequisites and replacements, and refuses invalid definitions.

Bedroom, island and the other 244 new ideas start with a ready setting and any functional essentials included. They auction additions immediately. A bedroom includes a basic bed; a four-poster or other bed upgrade explicitly replaces it. Weighted sampling without replacement makes everyday additions more common and statement pieces rarer. Mutually exclusive bed, floor, paint and other variants are capped within the deck. Every idea has at least 30 compatible additions, enough for six players. The original house, food, gaming and garage presets retain meaningful starting auctions; garage starts include two distinct full-size vehicle entrances.

The functional audit covers every family and applies the same rules to all its location/style variants. Included items are plain working starters, rather than luxury upgrades:

| Idea | Functional starter |
| --- | --- |
| Bedroom | Bed and clothes storage |
| Living room | Sofa |
| Kitchen | Cooker, sink, fridge, preparation counter, cupboards and basic cookware |
| Bathroom | Toilet, washbasin and shower |
| City | Homes, connecting local streets and basic utilities |
| Theme park | Entrance, simple starter ride and visitor toilets |
| Water park | Entrance, starter pool and changing/toilet facilities |
| Zoo | Entrance, enclosed starter animal habitat with live goats and animal care building |
| Resort | Reception, guest accommodation and dining room |
| Restaurant | Working kitchen with cooker, counter, sink and fridge plus tables/chairs |
| Cafe | Counter, seating, coffee brewer and sink |
| Bakery | Oven, counter, preparation tools and a modest bread display |
| Bar | Counter, stools, drinks/glasses and sink |
| Office | Desk, chair and work computer |
| Gym | Exercise floor, basic weights and mat |
| Creative studio | Work table and basic art tools |
| Space base | Sealed habitat, airlock, life support and power |
| Campsite | Tent, fire ring, drinking water and toilets |
| Sports complex | Reception, usable multi-use court and changing/toilet facilities |
| Festival | Entrance, simple stage with sound, toilets and water |
| Arcade | Entrance and working starter cabinet |
| Museum | Entrance and real starter exhibits |
| Airport | Runway, terminal, connecting taxiway/apron and control tower |
| Yacht | Hull, helm, sleeping cabin, galley and bathroom |
| Supercar | Complete body, wheels, engine, seats, steering and brakes |
| Aquarium | Entrance and filled starter tank with live fish |
| Hotel | Reception, working guest bedrooms and bathrooms |
| Cinema | Screen, seats, projector and sound |
| Bookshop | Counter and shelves with books |
| Golf course | Clubhouse and three playable starter holes |
| Garden / undeveloped island | Usable natural land; no free attractions or buildings |
| Breakfast plate / dessert buffet | Empty serving surface; food comes from the draft |
| House | Awarded house with usable entrance and habitable rooms |
| Gaming setup | Awarded setup with working gaming unit connected to its screen/controller |
| Garage | Awarded garage with two vehicle entrances |
| Pancakes / burger / pizza | Awarded edible base; extra toppings come from the draft |

Baseline fridge, desk, chair, bar, screen, projector, gaming computer and other supported upgrades explicitly replace their basic counterpart. Additional facilities remain additions. Internal components stay required without forcing cutaways or visible engines in an exterior photograph. The catalogue picker shows each game's starting policy, exact choice count, included essentials and example upgrades before selection; search matches names, categories, essentials and sample choices.

The client offers a searchable 250-idea picker. Typed topics matching catalogue IDs, titles or aliases reuse the authored definitions without a model request. Other custom topics use the planner to choose included essentials or a meaningful starting auction; image prompts and checks follow that policy.

The function loads this JSON from the client site's root at startup (`DRAFT_THEMES_URL` override), with two retries; requests wait for loading. **Deploy the client catalogue first, then the backend.** The admin-only `/api/cache-plan?key=` returns the distinct image prompt count without generating images. Prefill deduplicates shared item prompts across related ideas and prioritises the original presets before the new catalogue. The updated `draft-night/prefill-presets.ts` worker derives the number of batches from this plan, fills one stored variant in batches of up to 300 and stops on any provider/storage failure. Its final pass must find every planned asset already stored; it then checks house, bedroom and island lobbies create no new images. Daily limits remain unchanged; rerun on a later day to continue after a cap stops it.

Before changing code, pull from git and compare deployed function code with the repo. Before deploying the function, inspect the last ten minutes of HTTP logs; if `/api/room` is being polled, wait because a restart ends in-memory games. Commit and push server changes as well as replacing the whole function source. Fetch deployed source afterwards and compare it byte for byte with `draft-night/server.ts`. Keep `draft-night-verifier`.

The request authorises filling one stored variant of the expanded catalogue within the existing spending limits. Definitions alone do not prove the images have been generated or stored; the full expanded prefill has not completed. Confirm a complete prefill pass reports all assets present, then check cached lobbies make no new image requests before claiming instant preset starts.

## Game rules (as implemented)

- Total lots: the host picks the auction count (Auto is 5 × players; 2–6 players, or 1 player against the CPU). Everyone finishes with exactly auctions ÷ players items, starting option included (12 for 2 players is 6 each); an uneven split gives some players one more. Before each lot the server works out who may receive it so everyone can still finish; if only one player can, it is theirs free with no bidding. Every lot goes to someone.
- Reverse auctions (only when the host ticks "Include bad items"; off by default): each addition has a 1 in 8 chance (`DRAFT_REVERSE_SHARE`, 0.125) of being a dud, so some games have none and some two or more (presets have curated lists; typed themes get `bad_items` from the AI). Everyone who could receive it bids in secret, £0 up to their money; bids are revealed together, the lowest bidder gets it free and everyone else pays their bid. A tie for lowest is drawn at random. Missing bids count as £0 after 30 s, sooner if the only missing bidders are away. The CPU bids too.
- Only lots that have already come up are sent to players, so nobody can see what is coming next.
- Houses are drawn from above (a drone view) so gardens and additions are visible.
- **Starting policy varies by idea.** Included settings begin with their required essentials at no charge and the first lot is an addition. Starting-auction themes open with one base per player, then additions. Essentials are outside item quotas in included settings. An acquired upgrade replaces its matching baseline essential; other essentials remain mandatory in the image and checker instructions.
- Starting budgets: £5, £10, £15, £20, £50, £100, or any amount from £5 to £1,000.
- Bidding goes round in turns, starting with a different player each lot. Whoever opens a lot must bid at least £1, because nobody may pass on the opening bid, so every lot sells. After that, on your turn you raise (quick +£1/+£2/+£5/+£10 buttons, or type any amount up to your money) or pass, and passing takes you out of that lot. The leader never gets a turn, so you can't bid against yourself. Players who can't afford the next bid are passed automatically. A lot goes unsold only if nobody eligible can afford £1.
- Each turn lasts 30 seconds. An opener who runs out of time, or whose device stops polling for 20 seconds, is entered at £1 automatically. Anyone else in that situation is passed, so a phone left on the table can't stall the game.
- Requests include the lot and price the player saw. A tap based on an out-of-date price gets a 409 and the fresh state.

## Quick Play (joining without a code)

- The home screen has two tabs: **Create game** and **Join game**. Join game lists open games (`GET /api/lobbies`): in the lobby, not full, not private, not CPU, and with a host whose phone polled in the last 2 minutes. Each row shows the host, theme and seats ("Louie's game · Dream House · 1/2 players · I'm Player 2"). It refreshes every 2 seconds.
- Tapping a seat calls `/api/join` with the room code from the list, the remembered name and a random per-phone `device` id. The server hands out the next free seat. It handles one request at a time, so two phones tapping together get seats 2 and 3, never the same one, and a phone arriving at a full game is told it just filled up.
- The same phone joining again (same `device`) gets its own seat and token back instead of a duplicate player. Refreshing restores the session from the stored token; the server identifies players by token and returns `me` (their seat) with every state, so seats that move when someone leaves still resolve.
- Before the game starts, **Leave** (`POST /api/leave`) frees the seat; the seats close up (Player 3 becomes Player 2) and the lobby shows "Mario left." If the host leaves, the next player becomes host ("Louie left. Mario is now the host."). If no humans remain the room closes. A guest whose phone stops polling for 2 minutes (`DRAFT_LOBBY_IDLE_MS`) loses their seat and is told to pick one again. After the start, leaving does not remove anyone; the away rule handles absent players.
- **Private game** (a tick box under Players) keeps a game out of the list; friends join with the room code via "Join with room code". Every game still has a code and an invite link.

## Typed themes

Typed themes distinguish whole outdoor environments from objects. Island, city, resort, zoo and theme-park designs ask for substantial developments, attractions, terrain and infrastructure at the scale of the place rather than loosely related accessories. A desert island gets a motorway, beach resort, theme park or lazy river rather than a surfboard or snorkel. Environment bases show the whole undeveloped place from an aerial view; thumbnails and creation edits depict actual full-size landscapes, explicitly excluding tabletop displays, miniature models and printed photographs. Environment scope is retained through each purchase edit, preserving terrain and previous purchases. This is enforced in generation instructions and image prompts; model output still needs visual review.

`/api/theme` first checks the curated themes ("pancakes", "dream house", "burgers" and so on). Anything else goes to the text model with a strict JSON schema. Names, in-jokes and vague words come back as `ambiguous`, with 3–4 concrete interpretations to choose from. The chosen interpretation is confirmed and then kept for the whole game. Items must be real, recognisable, visible additions to that subject. If an addition or dud has an exact case-insensitive name match in a preset pool, its optional `pic` field borrows that preset item’s visual description for the thumbnail prompt. The item keeps its own `visual` description for creation updates. This reuses the same stored thumbnail when model and quality also match; starting options and non-matching names do not use this rule.

## Images

Each picture is rebuilt from the original starting scene and the complete owned inventory:

- The initial scene is the included setting and essentials, or the exact photo of the starting option they won (their house, burger, waffle…). Each later version uses that original base and explicitly lists every purchase, including duds. The prompt names what must stay and lists luxury features they don't own as forbidden.
- Jobs run one at a time per player, versions only move forward, and several wins are combined into one update. Final scenes receive a composition plan and a vision check against the original base plus inventory. Missing, substituted or invented objects cause one bounded stronger repair and another check. Rejected pictures are not published; the final reveal keeps the latest accepted photo with a clear preview label when a later render fails or is still running. The full purchase list and cached thumbnails remain underneath; if no photo was ever saved, an inventory view is shown. Budget and semantic failures stop retries.
- The client swaps in a new picture only once it has fully loaded.
- Item pictures for each lot are generated ahead of time, nearest lot first.

Rooms and images are held in memory and reset when the function redeploys or restarts.

## Zero-budget opponent

In a normal two-player auction, if only the opener has money and both can still receive a lot, the opener can bid or choose **Give to [opponent]**. Giving awards the lot free to the broke opponent. Timeout also gives it away. The exact item-share limit still applies; if only one player has room, allocation remains automatic. Reverse-auction rules are unchanged.

## Validation of this revision

This file is reset to the live function (`2951e95`), plus the four triage fixes listed in `docs/draft-night-v2.md`: duds opt-in, thumbnails keep their subject, doubted final pictures are kept and labelled, and planning is not charged to the picture budget. `npm test` passes 85 tests. Earlier revisions of this section claimed passing tests while 11 failed, and client deploys had failed since 11 October. Check `npm test` and the Railway deploy status rather than this paragraph. The redesign is in `docs/draft-night-v2.md`, and the diagnosis is in `docs/draft-night-investigation.md`. Picture accuracy is not guaranteed by this engine.


## Library navigation

The library is a full-height dialog with a fixed header, Close control, search and nine genre filters. Only the compact two-column game grid scrolls on phones; the page underneath is locked. Each tile opens a separate preview with included fundamentals, starting choices and sample additions. Back returns to the current search/genre; choosing a game closes the dialog. Escape and a keyboard focus loop are supported. Genre labels are Home & rooms, Food & drink, Worlds & outdoors, Attractions, Travel & cars, Sport & fitness, Work & hobbies and Sci-fi, plus All. Browser checks cover a deeply scrolled 320×568 view, visible Close, genre/search/reset, preview/back and complete bedroom play.
