# Shared table upgrade

Country Memory now has a complete 12-turn, two-phone match. Both players ready up, then alternate studying and reading questions. The learner draws from the deck, waits for the local artwork to load, sees a three-second countdown, studies for 30 seconds, watches the card disappear, then rolls a server-owned die. The reader sees all six questions and reveals the selected answer before marking the spoken or typed response. Six turns each, a final score, ties and mutual rematch readiness are supported. Pictures and captions use the same source data as Nanna Games; sources are retained in `lib/country-memory-cards.js`. All twelve pictures are hosted by this app.

Guess Who shares eliminated face IDs and the board order between phones, animates individual changes on the watching player's board, supports undo, typed custom questions, optional suggestions, and phone-call turns without typing. Opponent secrets are withheld until the result. Both games save their match on the existing Railway `/data` volume; local runs use the existing data directory.

Home has a visual game shelf, game-specific covers, readable text and a consistent tabletop palette. Legacy games share accessible form controls and navigation styling. Long Memory Match, Trivia and Date Roulette settings are paged. Draft Night's separately merged home-navigation fix is preserved, with sideways decorative overflow removed.

## Validation

- `npm test`: all 111 tests passed on the final engine changes.
- `node --test test/country-memory.test.js test/guesswho.test.js`: full match, role privacy, turn guards, shared dice, duplicate-action rejection, scoring, rematch, refresh recovery, restart persistence, all 12 asset files, live face changes, undo, voice turns and secret privacy.
- `scripts/qa-party.cjs`: real Socket.IO engines and shipped browser UI. Complete 12-turn memory matches at 390×667 and 820×1180, correct final tie, six questions, role swap, refresh, image loading, and fitted study/question screens. Complete Guess Who match with typed question, opponent answer, live face elimination/undo, spoken turn, refresh, winning guess and rematch. No browser page errors. Only the browser QA harness accelerates server time; production study time is 30 seconds.
- Additional entry-screen survey at 390×667 and 820×1180 across 16 routes and every new settings step. The game shelf can scroll by design. Small-phone Trivia genre and Date Roulette mood overflow identified in the survey was corrected with tighter shared spacing; a follow-up browser check passed every step in both forms and confirmed no sideways Draft Night overflow.

Physical iOS Safari, audio hardware, OS notification interruption and the external video were not independently exercised in this environment. The reference's visible-face board behaviour is implemented using the existing hinge animation and shared eliminated IDs. No new paid AI calls are introduced.
