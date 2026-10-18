# Country Memory audit — 19 October 2026

Scope: Country Memory multiplayer and solo practice. Main party home, other games and original Guess Who photographs are unchanged.

## Assessment

Subjective product assessment, not a player-study result: fun improved from approximately 6.5/10 to 8.5/10; visual presentation from 7/10 to 9/10. The illustration quality was already strong. The main weaknesses were inactive waiting, weak results and small-screen friction.

## Changes

- Reader sees six questions during the study timer, without the study picture or answers. After the die roll, a single large question replaces the distracting six-question grid.
- Timed phases pause if a player disconnects. A saved timed phase waits for both people to reconnect after a server restart. Joining alone and readying up works.
- The actual studied card fades away. A circular countdown and twelve-step progress strip make time and match progress easier to follow.
- Round results offer a tappable picture review after scoring. Answers remain private until the reader reveals them. Final scores have a stronger visual hierarchy.
- The deck uses consistent globe artwork and typography. Dice use proper dots rather than a nested emoji-like die. Motion respects reduced-motion settings.
- Solo practice distinguishes correct answers from misses and shuffles question positions as well as the question selection. Practice retains the same four-picture/two-fact balance.
- Mobile answer controls adapt to the visible keyboard area. Small-phone spacing is adjusted without adding gameplay scrolling.
- Picture-load acknowledgement now remains retryable when the other player disconnects during loading.

## Validation

- Automated suite: 118 tests, including first-arrival readiness, ready players rejoining, timed disconnect/reconnect, restart, card/answer privacy, question selection, old saved decks and scoring.
- Complete 12-turn multiplayer matches at 320×568, 390×667 and 820×1180, including refresh, shared dice, alternating roles, reader preparation, picture review, results and screen fit.
- Complete six-card solo games at those three sizes, including an intentionally missed answer, automatic timer expiry, skip timer, picture review and final score.
- Guess Who regression browser pass: questions, voice turn, live eliminated faces, undo, refresh, win and rematch.
- Main home files compared with the deployed baseline to ensure no redesign.

## Practical limits

There are twelve country scenes, with six available picture questions per scene. Question selection varies, but repeated play will teach the pictures. Solo practice is self-scored; it is not an artificial opponent. Multiplayer intentionally remains the shared Louie/Ariel table. These are product limits, not test failures.
