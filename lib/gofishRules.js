'use strict';

const CLOSING_POND_COUNT = 5;

const GO_FISH_PHASES = Object.freeze({
  SETUP: 'SETUP',
  NORMAL: 'NORMAL',
  CLOSING_INTRO: 'CLOSING_INTRO',
  CLOSING: 'CLOSING',
  FINAL_ROUND_INTRO: 'FINAL_ROUND_INTRO',
  FINAL_ROUND: 'FINAL_ROUND',
  GAME_OVER: 'GAME_OVER',
});

function buildFinalOrder(playerOrder, firstPlayerId) {
  if (!Array.isArray(playerOrder) || playerOrder.length !== 2 || !playerOrder.includes(firstPlayerId)) return [];
  return [firstPlayerId, playerOrder.find((id) => id !== firstPlayerId)];
}

function legalAskRanks(hand) {
  if (!Array.isArray(hand)) return [];
  return [...new Set(hand.map((card) => card && card.rank).filter(Boolean))];
}

function isLuckyCatch(askedRank, drawnCard) {
  return !!drawnCard && drawnCard.rank === askedRank;
}

function shouldEnterClosingPhase(pondCount) {
  return Number.isInteger(pondCount) && pondCount > 0 && pondCount <= CLOSING_POND_COUNT;
}

function shouldKeepTurn({
  finalRound = false,
  closingPhase = false,
  successfulAsk = false,
  askedRank = null,
  drawnCard = null,
} = {}) {
  if (finalRound || closingPhase) return false;
  if (successfulAsk) return true;
  return isLuckyCatch(askedRank, drawnCard);
}

function determineGoFishWinner(players, lastBookOwnerId = null) {
  if (!Array.isArray(players) || players.length !== 2) {
    return { winnerId: null, reason: 'draw' };
  }

  const [a, b] = players;
  const aBooks = Array.isArray(a.books) ? a.books.length : 0;
  const bBooks = Array.isArray(b.books) ? b.books.length : 0;
  if (aBooks !== bBooks) {
    return { winnerId: aBooks > bBooks ? a.id : b.id, reason: 'books' };
  }

  const aCards = Array.isArray(a.hand) ? a.hand.length : 0;
  const bCards = Array.isArray(b.hand) ? b.hand.length : 0;
  if (aCards !== bCards) {
    return { winnerId: aCards > bCards ? a.id : b.id, reason: 'cards' };
  }

  if (lastBookOwnerId && players.some((player) => player.id === lastBookOwnerId)) {
    return { winnerId: lastBookOwnerId, reason: 'recent-book' };
  }

  return { winnerId: null, reason: 'draw' };
}

module.exports = {
  CLOSING_POND_COUNT,
  GO_FISH_PHASES,
  buildFinalOrder,
  legalAskRanks,
  isLuckyCatch,
  shouldEnterClosingPhase,
  shouldKeepTurn,
  determineGoFishWinner,
};
