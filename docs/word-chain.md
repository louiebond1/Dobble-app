# Word Chain

Open `/word-chain` or the home menu tile. The existing Express + Socket.IO server and Railway `/data` volume handle both phones. No AI API, paid service or new package dependency.

## Two chains, side by side

The reference is now implemented literally: Louie solves the blue left chain; Ariel solves the pink right chain. Both boards remain visible, with a cream shell, local licensed Kalam chalk handwriting, restrained board texture, a turn pill, progress count and shared bottom controls. Future words show only their initials. Active words show known letters and blanks. Columns never stack, including on narrow phones; longer rounds scroll naturally.

Default **Make chains for each other**: both players privately write a chain for their partner. Louie writes Ariel’s answers; Ariel writes Louie’s answers. Neither solves their own authored chain. Both must lock before play starts. Drafts resume after refresh. Both authors confirm the phrase associations themselves; there is no semantic validation claim.

Optional **Ready-made chains** deals two different handwritten server-held chains. Word count (5–10, default 8) includes the starting word. Both players agree to the same settings and starting player.

A correct guess advances only that player’s chain and keeps the turn. A wrong guess or letter reveal passes the turn; the other player resumes their own chain. Hints reveal sequential letters, never the final letter. Whoever completes their own final word first wins. Both chains reveal at the result; unfinished words are not marked as solved. Scores count rounds won. Both consent to a rematch and confirm settings again; both write new chains.

## Privacy and authority

`engine.js` exposes allowlisted projections for both boards, with no future answer or length leakage. Full answers and catalogue live outside `public/`. Each author sees only their own unfinished draft during creation. Locked answers disappear from both gameplay projections and editor DOM. The guessing player never receives their answer list.

Minor punctuation, whitespace and case are normalised; no fuzzy matching. A manual review concerns only the latest wrong guess before another move. Only that chain’s author can judge it. Approval explicitly substitutes the current answer if it matches all shown letters and returns the correct guesser’s turn. It never exposes a future answer. All play pauses during review.

Socket-bound identities, persisted reconnect tokens, one current connection per player, request receipts, revision checks and transactional atomic saves follow existing app patterns. Concurrent creation uses per-author draft versions plus the round number, so one author saving cannot invalidate the other author’s simultaneous lock. Stale updates on the same draft are rejected. Losing either phone pauses play. Duplicate submissions cannot advance twice. Reconnect and server restart preserve progress and scores.

`legacy-engine.js` lets an already-running v1 shared round finish without clearing it. Its next setup upgrades to two chains with the same tokens, scores and word count. New/setup games start directly on version 2.

The app uses one server replica with a persistent `/data` volume. Multiple replicas would require a shared transactional store and cross-process coordination. Keep the original phone storage for seat tokens, as with Cambio.

## Verification

`node --test test/word-chain.test.js`: 11 tests cover simultaneous locks from independent sockets, both chains, turn rules, hints, privacy, deterministic validation, manual alternatives, first-to-finish, rematches, legacy migration, replay safety, stale moves, disconnection, seat takeover and saved restart recovery.

`npm test` runs the full existing regression suite. Browser QA uses isolated `?table=qa-...` tables, never the couple’s main match. Both player views were checked through manual chain creation and locking, own-chain correct guesses and hint-driven turn swapping. Physical phones were not available.

Local font source: Google Fonts Kalam, licensed under SIL OFL; license included under `public/fonts/Kalam-OFL.txt`. The shipped TTF is subset to Latin characters.

## Main page revision

The welcome and setup steps now share one page, matching the supplied letter-tile reference: green/cream styling, raised WORD CHAIN tiles, blue/pink identity buttons, chain length and starting player. There is no mode picker or proposal/approval button group. Each player taps Start Game once to confirm the exact settings. A player may confirm before their partner arrives. When both have confirmed the same settings and are connected, the server starts creation atomically. Changes clear previous consent. Concurrent identical confirmations are safe; different concurrent settings must be reviewed again. Active games resume directly after refresh. Handwritten manual chains are the only mode offered by the main page; older server endpoints remain for compatibility.

Three additional tests cover changed-setting consent, readiness before a partner joins and simultaneous Start Game taps. All 14 Word Chain tests pass.
