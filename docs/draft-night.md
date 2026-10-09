# Draft Night

A party auction game: everyone gets the same budget, bids on one item at a time, and watches their own creation (a house, a pancake stack, a garage…) change with every win. At the end, the creations are shown side by side.

## Where things live

| Part | File | Deployed as |
| --- | --- | --- |
| Client (all screens) | `public/draft-night.html`, `public/draft-night.css`, `public/draft-night.js` | Served by this app (`dobble-party` Railway project, deploys from `main`) |
| Game API, themes, images | `draft-night/server.ts` | Railway Function `draft-night-web` in the `draft-night` project |
| Tests | `test/draft-night.test.js` (runs in `npm test`, the Railway pre-deploy step) | |
| Browser end-to-end run | `draft-night/e2e/run.mjs` with `draft-night/e2e/mock-openai.mjs` | Local only |

The function source is passed to its container as one base64 argument, so `server.ts` must stay under 96KB (a test enforces this). To deploy it, replace the function's source with the contents of `draft-night/server.ts` (Railway dashboard, or the Railway MCP `update-function-source-code` tool). It needs `OPENAI_API_KEY`. Optional variables: `DRAFT_IMAGE_MODEL` (default `gpt-image-2.5-flare`), `DRAFT_TEXT_MODEL` (default `gpt-4.1-mini`), `DRAFT_CLIENT_URL`, and the timing variables at the top of the file.

## Game rules (as implemented)

- Total lots = 5 × players (2–6 players, or 1 player against the CPU).
- **Dream House** (`property` mode): the first N lots are houses, one per player. Only players without a house can bid on them. If only one homeless player is left, the last house is theirs for free. If nobody bids, a homeless player is drawn at random and gets it free. The remaining 4 × N lots are upgrades.
- **Build / collection** modes (Pancakes, Burgers, Pizza, Gaming Setup, Dream Garage, or anything typed in): everyone starts with the same base, and all 5 × N lots are additions.
- Bidding goes round in turns, starting with a different player each lot. On your turn you raise (+£1, +£2, +£5, +£10, capped at your money) or pass, and passing takes you out of that lot. The current leader never gets a turn, so you can't bid against yourself. Players who can't afford the next bid are passed automatically. A lot ends when nobody is left to challenge. Add-on lots with no bids go unsold.
- Each turn lasts 30 seconds. A player whose device stops polling for 20 seconds is passed automatically, so a phone left on the table can't stall the game.
- Requests include the lot and price the player saw. A tap based on an out-of-date price gets a 409 and the fresh state.

## Typed themes

`/api/theme` first checks the curated themes ("pancakes", "dream house", "burgers" and so on). Anything else goes to the text model with a strict JSON schema. Names, in-jokes and vague words come back as `ambiguous`, with 3–4 concrete interpretations to choose from. The chosen interpretation is confirmed and then kept for the whole game. Items must be real, recognisable, visible additions to that subject.

## Images

Each player's picture is a chain of edits, worked out from a structured list of what they own:

- **House:** version 1 is the exact photo of the house they won. Each later version edits the previous image and adds only the newly won item(s). The prompt names what must stay and lists luxury features they don't own as forbidden.
- **Build / collection:** one shared base image, then the same edit chain.
- Jobs run one at a time per player, versions only move forward, and several wins are combined into one edit. A failed edit leaves the last good image on screen and is retried.
- The client swaps in a new picture only once it has fully loaded.
- Item pictures for each lot are generated ahead of time, nearest lot first.

Rooms and images are held in memory and reset when the function redeploys or restarts.
