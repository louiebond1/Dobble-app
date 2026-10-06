# Go Fish — canonical app rules

This file is the single source of truth for Go Fish gameplay, CPU decisions, endgame handling and turn UX.

## Core game

- Use one standard 52-card deck, no jokers.
- Two players. Deal 7 cards each and put the remaining 38 cards face down in the pond.
- Randomly choose the starting player.
- A book is all four suits of one rank. Books are detected and removed automatically after setup, transfers and draws.
- A player may ask only for a rank currently in their own hand.
- A successful ask transfers **all** cards of that rank and normally gives the asker another turn.
- A failed ask draws exactly one card from the pond.
- If that card is the exact requested rank, it is a **Lucky Catch** and the same player continues during normal play.
- Any other drawn rank ends the turn, even if that unrelated draw completes a book.
- Closing Phase overrides extra-turn rules: successful asks and Lucky Catches both pass the turn.
- If a player's hand is empty when they need to play and the pond still has cards, automatically draw one replacement card and continue from that new hand.

## Closing Phase

The 1v1 game changes once the pond reaches **5 cards remaining**.

Finish the move that drew the pond down to five first. Then enter:

**THE POND IS CLOSING**  
*One ask each turn from here.*

During Closing Phase:

- each player gets exactly one ask on their turn;
- a successful ask still transfers every matching card and may complete a book;
- a successful ask does **not** grant another ask;
- a failed ask still draws one card while the pond contains cards;
- an exact requested draw is still recorded as a Lucky Catch, but it does **not** extend the turn;
- after that one ask resolves, play always passes to the opponent;
- an empty-handed player may draw one replacement card before making their one ask.

The player who would normally act next after the threshold-crossing move gets the first Closing Phase turn. This prevents a player with good memory from sweeping several known ranks in one uninterrupted chain.

The UI treats this as a dramatic late-game transition: lights dim, the inactive player recedes, and the active player/hand is visually spotlighted. A persistent **1 ASK PER TURN** indicator remains visible.

## Final Round

The moment the last pond card is drawn, finish the current move completely, including its draw, reveal, book animation and normal turn result. Then enter:

**FINAL ROUND**  
*No more fishing. One last turn each.*

The player who would normally act next gets the first Final Round ask. The other player gets the second.

Each Final Round participant receives exactly one ask:

- they may ask only for a rank they hold;
- matching cards are transferred and may complete a book;
- a successful ask does **not** grant another turn;
- a failed ask draws nothing;
- an empty-handed player has their final turn skipped.

After the two asks/skips, the game ends immediately.

## Winner

1. More completed books wins.
2. If books are tied, more cards remaining in hand wins.
3. If still tied, the player who completed the most recent in-play book wins.
4. If there is still no winner, declare a draw.

Setup books are simultaneous and do not create an arbitrary “most recent book” tiebreak.

## CPU

The CPU obeys exactly the same legal-move rules and must never read the human's hidden current hand to choose an ask.

It may use only its own cards and public information. It remembers public evidence such as ranks the human asked for and cards the CPU previously handed over. It should strongly prefer a remembered rank when it later holds that rank, next prefer ranks where it holds multiple copies, and otherwise choose among its legal ranks with some randomness.

## UX and locking

A move must be understandable as a sequence rather than an instant state replacement.

Successful ask:

ask → response → cards travel → cards land → optional book → turn result

Failed ask:

ask → GO FISH → pause → pond card travels → reveal → card lands → optional book → Lucky Catch or turn pass

During any move/animation, all gameplay input is locked. Final Round introduction also locks input.

Client phases are explicit:

- SETUP
- PLAYER_SELECTING
- PLAYER_ASKING
- CARD_TRANSFER
- GO_FISH
- DRAWING
- BOOK_COMPLETING
- CPU_THINKING
- CPU_ASKING
- CLOSING_INTRO
- CLOSING_PLAYER
- CLOSING_CPU
- FINAL_ROUND_INTRO
- FINAL_ROUND_PLAYER
- FINAL_ROUND_CPU
- GAME_OVER

## End screen

Show WIN / LOSS / DRAW, final book score, both completed-book collections and both remaining hands. Play Again starts a completely new shuffled 52-card game.
