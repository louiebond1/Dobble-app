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

The function source is passed to its container as one base64 argument, so `server.ts` must stay under 96KB (a test enforces this). To deploy it, replace the function's source with the contents of `draft-night/server.ts` (Railway dashboard, or the Railway MCP `update-function-source-code` tool). Redeploying ends any game in progress, because rooms live in memory.

Pictures: when `CF_ACCOUNT_ID` and `CF_API_TOKEN` are set, pictures use Cloudflare Workers AI, model `@cf/black-forest-labs/flux-2-klein-4b` (`DRAFT_CF_MODEL` to change). Workers Paid is enabled; actual cost per picture has not yet been measured. A Cloudflare output flagged with error 3030 gets one retry with neutral photographic wording; a second refusal stops. Other errors are not retried by this rule. OpenAI fallback is off unless `DRAFT_ALLOW_PAID_FALLBACK=1`, so a failed Cloudflare picture does not silently incur OpenAI image costs. `OPENAI_API_KEY` is still needed for typed themes and the closing verdict. OpenAI-only variables: `DRAFT_IMAGE_MODEL` (default `gpt-image-2.5-flare`), `DRAFT_ITEM_QUALITY` / `DRAFT_WORLD_QUALITY` (default `low`), `DRAFT_HIGH_FIDELITY=1` and `DRAFT_ITEM_REFERENCE=1` (off by default), and `DRAFT_TEXT_MODEL` (default `gpt-4.1-mini`). `DRAFT_CLIENT_URL` identifies the client site; timing variables are at the top of the server file.

Picture library: starting-scene and item pictures depend only on their prompt, so they are stored permanently in the Railway bucket `draft-night-art` (draft-night project; variables `ART_ENDPOINT`, `ART_BUCKET`, `ART_REGION`, `ART_KEY_ID`, `ART_SECRET` on `draft-night-web` reference it); `ART_PATH_STYLE=1` is required, because this storage only accepts path-style addresses even though Railway reports virtual-host style. Stored pictures are reused by every later game. Only players' own creations are made per game (in memory, as before). `/api/img` redirects stored pictures to a signed bucket link, so phones load them straight from storage. Up to `DRAFT_ART_VARIANTS` (default 2) versions of each picture are kept; a game uses any stored version and never pays for an extra one. Changing a picture's description, quality or model gives it a new library name, so it is made again. `POST /api/prefill {key, themes?, variants?, max?}` (key = `DRAFT_ADMIN_KEY`) fills the presets' library behind live games, 40 pictures per run by default, and stops at the first failure (such as Cloudflare's daily allowance); `GET /api/prefill?key=` shows progress. If the bucket is unreachable, pictures are made and served from memory as before.

Daily picture cap: `DRAFT_DAILY_PICTURES` (live: 900) limits pictures made per UTC day across games and prefill; the count is kept in the library (`meta/usage-YYYY-MM-DD.json`) so restarts do not reset it, and `/health` shows it. Past the cap, or when Cloudflare's free daily allowance runs out, games show item lists instead of pictures with a clear message, and do not retry.

Other live image settings: `DRAFT_WORLD_BATCH` (default 2) wins per creation edit; the end of the game redraws any creation still behind. `DRAFT_ALLOW_PAID_FALLBACK=1` re-enables the OpenAI fallback when a Cloudflare picture fails (off by default).

## Curated pools and deployment order

The six preset themes live in `public/draft-night-themes.json`, not inside the function. Each entry is `Name|blurb|visual description`. The function loads this file from the client site's root at startup (override with `DRAFT_THEMES_URL`), with two retries; requests wait for loading. Deploy the client site and verify it has succeeded before deploying the function that uses the new file.

| Theme | Starting options | Additions | Duds | Pictures for one variant, including empty scene |
| --- | ---: | ---: | ---: | ---: |
| Dream House | 14 | 75 | 14 | 104 |
| Pancakes | 8 | 75 | 12 | 96 |
| Burgers | 8 | 76 | 12 | 97 |
| Pizza | 8 | 75 | 12 | 96 |
| Gaming Setup | 6 | 75 | 12 | 94 |
| Dream Garage | 6 | 75 | 12 | 94 |

Dream House uses houses with proper grounds and large additions visible from a drone. Small objects and houses without room for pools or courts have been removed. Base and item assets can be prefilled once and reused; creation updates and the AI verdict still happen per game, so filling the library alone does not make complete games cost zero.

Before changing code, pull from git and compare deployed function code with the repo. Before deploying the function, inspect the last ten minutes of HTTP logs; if `/api/room` is being polled, wait because a restart ends in-memory games. Commit and push server changes as well as replacing the whole function source. Fetch deployed source afterwards and compare it byte for byte with `draft-night/server.ts`. Keep `draft-night-verifier`.

Paid picture experiments require the user's approval. The handover authorises filling one variant of the six preset pools within the daily cap. Cloudflare price lookups also require approval. The proposed method of rebuilding each creation update from its original clean base has not been tested or adopted; current updates still edit the previous version.

## Game rules (as implemented)

- Total lots: the host picks the auction count (Auto is 5 × players; 2–6 players, or 1 player against the CPU). Everyone finishes with exactly auctions ÷ players items, starting option included (12 for 2 players is 6 each); an uneven split gives some players one more. Before each lot the server works out who may receive it so everyone can still finish; if only one player can, it is theirs free with no bidding. Every lot goes to someone.
- Reverse auctions: each addition has a 1 in 8 chance (`DRAFT_REVERSE_SHARE`, 0.125) of being a dud, so some games have none and some two or more (presets have curated lists; typed themes get `bad_items` from the AI). Everyone who could receive it bids in secret, £0 up to their money; bids are revealed together, the lowest bidder gets it free and everyone else pays their bid. A tie for lowest is drawn at random. Missing bids count as £0 after 30 s, sooner if the only missing bidders are away. The CPU bids too.
- Only lots that have already come up are sent to players, so nobody can see what is coming next.
- Houses are drawn from above (a drone view) so gardens and additions are visible.
- **Every theme opens with its starting options** (houses, burger types, pancake/waffle/crêpe bases, pizza styles, starter setups, garages; typed themes get 8 generated by the AI). The first N lots are these, one per player. Only players without a house can bid on them. If only one homeless player is left, the last house is theirs for free. If nobody who still needs one can afford £1, one of them is drawn at random and gets it free. The remaining 4 × N lots are additions.
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

Each player's picture is a chain of edits, worked out from a structured list of what they own:

- Version 1 is the exact photo of the starting option they won (their house, burger, waffle…). Each later version edits the previous image and adds only the newly won item(s). The prompt names what must stay and lists luxury features they don't own as forbidden.
- Jobs run one at a time per player, versions only move forward, and several wins are combined into one edit. A failed edit leaves the last good image on screen and is retried.
- The client swaps in a new picture only once it has fully loaded.
- Item pictures for each lot are generated ahead of time, nearest lot first.

Rooms and images are held in memory and reset when the function redeploys or restarts.
