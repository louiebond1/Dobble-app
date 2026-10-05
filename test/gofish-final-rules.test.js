'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildFinalOrder, determineGoFishWinner } = require('../lib/gofishRules');

function player(id, bookCount, handCount) {
  return {
    id,
    books: Array.from({ length: bookCount }, (_, i) => String(i)),
    hand: Array.from({ length: handCount }, (_, i) => ({ rank: String(i), suit: '♠' })),
  };
}

test('final round starts with whoever would normally act next', () => {
  assert.deepEqual(buildFinalOrder(['human', 'cpu'], 'cpu'), ['cpu', 'human']);
  assert.deepEqual(buildFinalOrder(['human', 'cpu'], 'human'), ['human', 'cpu']);
});

test('most books wins', () => {
  assert.deepEqual(
    determineGoFishWinner([player('human', 7, 1), player('cpu', 5, 8)]),
    { winnerId: 'human', reason: 'books' }
  );
});

test('more cards in hand breaks an equal-book tie', () => {
  assert.deepEqual(
    determineGoFishWinner([player('human', 6, 4), player('cpu', 6, 2)]),
    { winnerId: 'human', reason: 'cards' }
  );
});

test('most recent book breaks equal books and equal hand counts', () => {
  assert.deepEqual(
    determineGoFishWinner([player('human', 6, 2), player('cpu', 6, 2)], 'cpu'),
    { winnerId: 'cpu', reason: 'recent-book' }
  );
});

test('remaining equality is a true draw', () => {
  assert.deepEqual(
    determineGoFishWinner([player('human', 0, 7), player('cpu', 0, 7)]),
    { winnerId: null, reason: 'draw' }
  );
});

test('invalid final-round starter never creates a phantom turn', () => {
  assert.deepEqual(buildFinalOrder(['human', 'cpu'], 'other'), []);
});
