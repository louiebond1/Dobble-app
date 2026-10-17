# Draft Night 2.0 rebuild

Implemented on `rebuild/draft-night-2`, based on `898ba0f`. No production deploy, variable change, infrastructure creation or paid API call was made during development.

## Play locally

Use Node 22.14+ (Node 24 used for verification), then:

```sh
npm ci
npm start
```

Open `http://localhost:3000/draft-night.html`. Create a room and open the invite in a different browser profile or an incognito window. On two phones on the same network, use the computer's LAN address in both browsers. Mock images and offline featured themes are the defaults; no API key is needed.

The page now uses `public/draft2.js` and `public/draft2.css`. The original frontend is retained at `/draft-night-legacy.html`, with its original scripts and external API. The preceding photo-based implementation remains at `/draft-night-v2.html` and `/api/dn`. Their engines and the other games are unchanged. The Party home link already points at `/draft-night.html` and therefore opens this rebuild on this branch.

## Flow and rules

Home → featured/custom theme → setup → invite lobby → secret auction → final preparation → simultaneous reveal → locked voting → result → rematch.

- This release supports **two human players**, £20 and five items each by default. Host can choose £20/£30/£50 and 3–6 items each. More players and CPUs are deliberately outside this two-image version.
- The server chooses and hides the complete deck before bidding. No image or commentary request blocks a bid. Twelve authored themes have randomised pools; other themes use a cached text plan when the text host is enabled.
- £1 minimum raise. The highest bidder cannot raise themselves. Only the final winner pays. Passing is final for that lot.
- If everyone passes without a bid, free priority alternates by lot number, subject to available collection slots. This rule is shown before play. A pass therefore declines paying, not eventual free allocation.
- A player with a full collection is excluded. If only one player has room, the lot is assigned free after the brief sold transition. Zero budgets never prevent allocation.
- Unopened lots close after 25 seconds; a bid gives rivals 15 seconds. Passing immediately closes an uncontested bid. No countdown is required after everyone else passes.
- Both players may vote for either creation, including their own. Ballots remain private until completion. A split vote is a draw; no arbitrary or AI-selected winner. Voting has no timeout; the original device can reconnect and cast its saved ballot.
- Rematch retains both seats and settings but creates a fresh shuffled deck and independent final-image job IDs.

## Architecture

`lib/draft2/engine.js`: deterministic rules with injectable timestamps. Synchronous actions and revisions reject stale/duplicate bids. Concurrent ballots for the same match are accepted independently; duplicate ballots are rejected.

`lib/draft2/routes.js`: authenticated room API under `/api/draft2`, 650 ms client polling, 300 ms server timer, saved rooms, reconnect with original token, cross-site write rejection, creation rate limits and 24-hour room retention. Clients never decide an item winner. Future lots and other players' session tokens are omitted from views. The service worker explicitly bypasses these endpoints.

`lib/draft2/store.js`: SQLite WAL room state, cached text plans, generation ledger, response usage and daily request reservations. There are no new npm runtime dependencies. Run **one server replica** against one persistent data directory. This is not a multi-replica architecture.

`lib/draft2/ai.js`: authored offline plans, custom-theme text planning, matching final art direction and exact-inventory image prompts. Zoo/park/island layouts request the entire site from the air with separated habitats. The host uses short factual event updates; there are no per-bid model calls. Custom theme planning is AI-generated; live improvisational commentary is not implemented.

## Spending controls

By default `DRAFT2_IMAGES` is mock and text calls are disabled. Development tests explicitly blank the key and disable live text.

A completed game can reserve only these final-image jobs: `<room>:<match>:image:0` and `:1`. Reservation commits before the provider request. `n=1` per request. Refreshes and simultaneous triggers reuse saved status. A failed or interrupted request is terminal and **never retried automatically**, including after restart. This guarantees at most two image requests, not two successful images if the provider fails. Failed creations remain reviewable as inventory lists.

Both image files are decoded before the reveal is displayed. If a file fails to load, its inventory fallback is shown. Images are authenticated and served by the app; they are not generated in the browser. Mock renders are visibly labelled.

Daily ceilings are 10 image attempts and 30 custom-theme text attempts per UTC day in this release. Reservations count failures. Text output is capped at 2,200 tokens. Room creation is limited to 20 attempts per IP in ten minutes and 500 retained rooms. These caps are deliberately conservative; do not raise them without checking the spending scope.

Paid operation is intentionally disabled until the following are configured in an approved deployment:

| Variable | Purpose |
| --- | --- |
| `DRAFT2_DATA_DIR` | A directory on a persistent volume, not ephemeral container storage |
| `OPENAI_API_KEY` | The existing approved server-side key, via a secret/reference |
| `DRAFT2_TEXT=live` | Allow bounded custom-theme planning |
| `DRAFT2_IMAGES=live` | Choose provider images rather than mocked images |
| `DRAFT2_ENABLE_PAID=1` | Second explicit switch required for paid final images |

Read-only Railway inspection found the main `Dobble-app` service on `main`, one replica, no mounted volumes and no service variables. The existing AI key belongs to the separate legacy deployment; it has not been copied, printed or replaced. A persistent mount and approved key reference must be arranged before paid launch. No production changes were staged.

The reservation database and image records must be retained during deployments and rollbacks. Restoring an old database can remove its history of attempted requests, so do not restore an older ledger and resume those same rooms. Interrupted requests are marked failed instead of resent. SQLite single-process authority is unsuitable for horizontal scaling; move both state and job claims to a shared transactional service first.

## Current pricing, checked against provider documentation

- `gpt-image-1.5`, medium, 1024×1024: **US$0.034 output per image**, so two outputs are **US$0.068**, plus text prompt input at US$5 per million tokens. This is not an all-in fixed price. No quality or inventory accuracy claim is made without paid visual evaluation.
- `gpt-4.1-mini`: **US$0.40 input / US$1.60 output per million tokens**. An illustrative 800-input / 1,500-output-token plan is US$0.00272; cached authored themes need no text request. Actual usage is saved from provider responses, and failures retain their reservation.
- Source: https://developers.openai.com/api/docs/models/gpt-image-1.5 and https://developers.openai.com/api/docs/models/gpt-4.1-mini . Prices exclude hosting, tax and exchange rates. The provider marks GPT-4.1 mini deprecated, so account availability and migration should be reviewed before enabling live text. No live compatibility check or provider spend was performed.

## Validation

`npm test` runs the legacy regression suite plus eight new test groups. The new suite includes 1,000 seeded code-only game simulations, accounting/ownership invariants, illegal/stale bids, zero budgets, timeouts, simultaneous HTTP bids, restart recovery, private room access, two mocked final images, ballots and rematches. Mocked provider transport verifies bounded requests, cached plans and terminal failures. These tests make zero paid requests.

`draft-night/e2e/draft2.mjs` starts the real main app with a temporary database, mock images and no key. It uses two independent Chromium contexts to play the default game, test reload and temporary offline recovery, inspect a creation, vote a draw and rematch. It checks 320×568, 375×667, 390×844, 430×932 and desktop layouts for horizontal overflow and visible bidding controls. It smoke-checks the old Draft Night pages and other game routes. Screenshots use reduced motion so entrance animations do not obscure the captured state.

```sh
node draft-night/e2e/draft2.mjs
```

Requires Playwright and its Chromium binary in the development environment. `DRAFT2_CHROMIUM` can specify an installed executable. Browser tooling is not a production dependency.

Remaining limits: real generated image quality and live custom-theme output are unverified; only two human players; no CPU, spectator ballot or persistent shareable result page. Share sends a text summary and the game link. A disconnect retains the original seat; no replacement-player claim or host-transfer flow is implemented. Finished rooms and images expire after 24 hours. Existing unrelated-game unit tests and route smoke checks pass; full manual sessions of every other game were not replayed.

## Recorded results

- Full test suite: **98 pass, 0 fail** (including eight new test groups and 1,000 seeded simulations).
- Default two-phone browser game: **10 allocations, 5 per player**, draw voting and rematch passed. Temporary offline recovery and a page reload retained the original seats.
- Layout widths: **320, 375, 390, 430 and 1440 px**. No sideways overflow; bidding controls inside every tested viewport.
- Browser page errors: **0**. Provider requests in browser: **0**. Development API spend: **£0**.
- Screenshots and captured results: [home](draft2-preview/home-desktop.webp), [auction](draft2-preview/auction-phone.webp), [reveal](draft2-preview/reveal-phone.webp), [result](draft2-preview/result-phone.webp), [browser measurements](draft2-preview/browser-results.json), [test output](draft2-preview/tests.log).

## Wording update

Removed marketing slogans, invented host branding and forced jokes from all rebuilt screens, invitations and host updates. Labels now describe actions directly, such as Play, Create game, Start game, Play again and It’s a draw. AI planning now requests friendly factual descriptions without teasing or catchphrases. Custom-theme cache keys are versioned so old wording is not reused. No deployment or paid API request was made for this update.

## Final images, key safety and passing (update)

- Final images: one `gpt-image-1.5` 1024x1024 photo per player, from a numbered prompt listing all purchased items. Job ids `CODE:match:image:0|1` are reserved before the request, so a match makes at most two requests and never retries.
- The OpenAI key stays in the `draft-night` Railway project. The `draft-night-image-gateway` function reads it by same-project reference to `draft-night-web`; the site only holds a shared token. Gateway source: `draft-night/image-gateway.ts` (token check, id whitelist, once per id, daily cap `IMAGE_GATEWAY_DAILY_MAX`).
- Site variables: `DRAFT2_IMAGES=live`, `DRAFT2_ENABLE_PAID=1`, `DRAFT2_DATA_DIR=/data/draft2` (volume at `/data`), `DRAFT2_IMAGE_GATEWAY_URL`, `DRAFT2_IMAGE_GATEWAY_TOKEN`, `DRAFT2_IMAGE_QUALITY` (default medium), `DRAFT2_MAX_IMAGES_PER_DAY`. `DRAFT2_TEXT` stays off.
- Passing: a player who passes can never receive that lot. The other player gets it at their current bid, or free if nobody bid. If nobody bids before the timer, the lot goes free by rotating priority and nobody is marked as passed.
