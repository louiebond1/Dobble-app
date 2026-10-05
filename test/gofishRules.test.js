'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildFinalOrder,
  legalAskRanks,
  isLuckyCatch,
  shouldKeepTurn,
  determineGoFishWinner,
} = require('../lib/gofishRules');

test('only ranks held may be asked for', () => {
  assert.deepEqual(
    legalAskRanks([
      { rank: '3', suit: '♠' },
      { rank: '3', suit: '♥' },
      { rank: 'Q', suit: '♦' },
    ]),
    ['3', 'Q']
  );
});

test('successful asks keep the turn only in normal play', () => {
  assert.equal(shouldKeepTurn({ successfulAsk: true }), true);
  assert.equal(shouldKeepTurn({ successfulAsk: true, finalRound: true }), false);
});

test('only the exact requested draw is a Lucky Catch', () => {
  assert.equal(isLuckyCatch('8', { rank: '8', suit: '♣' }), true);
  assert.equal(isLuckyCatch('8', { rank: '9', suit: '♣' }), false);
  assert.equal(shouldKeepTurn({ askedRank: '8', drawnCard: { rank: '8', suit: '♣' } }), true);
  assert.equal(shouldKeepTurn({ askedRank: '8', drawnCard: { rank: '9', suit: '♣' } }), false);
});

test('Final Round order starts with the player who would act next', () => {
  assert.deepEqual(buildFinalOrder(['human', 'cpu'], 'cpu'), ['cpu', 'human']);
  assert.deepEqual(buildFinalOrder(['human', 'cpu'], 'human'), ['human', 'cpu']);
});

test('winner is decided by books first', () => {
  const result = determineGoFishWinner([
    { id: 'human', books: ['A', '2', '3'], hand: [] },
    { id: 'cpu', books: ['4', '5'], hand: Array(10).fill({}) },
  ]);
  assert.deepEqual(result, { winnerId: 'human', reason: 'books' });
});

test('equal books are broken by remaining hand size', () => {
  const result = determineGoFishWinner([
    { id: 'human', books: ['A', '2'], hand: [{}, {}, {}] },
    { id: 'cpu', books: ['3', '4'], hand: [{}] },
  ]);
  assert.deepEqual(result, { winnerId: 'human', reason: 'cards' });
});

test('equal books and hand size are broken by most recent book', () => {
  const players = [
    { id: 'human', books: ['A', '2'], hand: [{}, {}] },
    { id: 'cpu', books: ['3', '4'], hand: [{}, {}] },
  ];
  assert.deepEqual(
    determineGoFishWinner(players, 'cpu'),
    { winnerId: 'cpu', reason: 'recent-book' }
  );
});

test('fully tied games remain draws', () => {
  const players = [
    { id: 'human', books: ['A'], hand: [{}, {}] },
    { id: 'cpu', books: ['2'], hand: [{}, {}] },
  ];
  assert.deepEqual(determineGoFishWinner(players), { winnerId: null, reason: 'draw' });
});
