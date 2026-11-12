# Word Chain

Access `/word-chain` or the Word Chain tile on the home menu. Existing Express + Socket.IO server, two named seats and atomic JSON saves on the existing Railway `/data` volume. No new dependencies or paid APIs.

## Rules decision

The request included incompatible rules: the manual chain author cannot fairly compete in guessing against someone who has never seen their answers. Two explicit modes resolve this:

- **Head to head** (default): both players guess, a correct answer keeps the turn, a wrong answer or letter hint passes it. Final word wins. Twelve handwritten server-only chains, truncated to the agreed 5–10 words; no repeat until the catalogue is exhausted.
- **Make a chain**: one host writes and judges; the other solves. Wrong guesses and hints keep the solver active. Host/solver roles swap after both request a rematch. The host cannot guess. Session scores in this mode record completed chains, not comparative difficulty.

Both agree to setup. Settings changes clear previous agreement. Rematches keep settings and scores but require fresh agreement before Start Game. Creator alternates for every rematch.

## Privacy and authority

`lib/word-chain/engine.js` returns an explicit allowlisted projection. During play neither player receives answers beyond completed words. Only the current word exposes its length; future words expose just an initial. Host draft is available only to that seat during creation, then removed from both wire projections and editor DOM. Answers and catalogue are outside `public/`.

Normalisation ignores case, outer whitespace and minor punctuation; no fuzzy matching. Manual disputes concern only the last incorrect guess on the current word. Host approval explicitly replaces that word with the proposed alternative only if it matches the visible prefix. No future answers are exposed. Players judge the phrase connections themselves.

All moves are checked on the server. Socket-bound seat identity and secret reconnect tokens follow Cambio's established pattern. One active connection per seat: a second tab with the token takes over and disables the old tab; a device without the token cannot claim an existing seat. Settings, turns, draft, receipts and scores are saved before broadcast. Revisions reject stale moves; request IDs make duplicate delivery idempotent. Losing either player pauses play without resetting it. Host can save/lock while the solver is offline.

Saved files use atomic rename and owner-only file mode. This uses the existing single Railway replica with mounted `/data`; horizontal scaling would require shared storage and a cross-process lock before enabling multiple replicas. Existing player identification is deliberately lightweight rather than an account system. Keep original phone storage for reconnect tokens.

## Verification

`node --test test/word-chain.test.js` covers both modes, both-player consent, correct/wrong/hint rules, final-word results, hidden-answer projections, alternatives, invalid chains, rematches, server restart recovery, disconnected players, seat theft, same-seat takeover, stale moves, duplicate delivery and simultaneous requests using independent Socket.IO clients.

Run `npm test` for the existing regression suite. Browser checks use an isolated `?table=qa-...` so they never touch the couple's main match.

Browser verification completed in both player tabs on an isolated table: shared settings, manual draft recovery after refresh, lock, hints, four correct guesses, shared results, mutual rematch and creator swap. Competitive wrong guesses and hints were verified to swap turns in the live UI. Physical phones were not available for testing.
