import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng, randomSeed } from '../src/rng.js';

test('same seed yields the same sequence', () => {
  const a = createRng('abc');
  const b = createRng('abc');
  for (let i = 0; i < 50; i++) assert.equal(a.next(), b.next());
});

test('different seeds diverge', () => {
  const a = createRng('seed-a');
  const b = createRng('seed-b');
  const seqA = Array.from({ length: 5 }, () => a.next());
  const seqB = Array.from({ length: 5 }, () => b.next());
  assert.notDeepEqual(seqA, seqB);
});

test('int stays within inclusive bounds and covers them', () => {
  const rng = createRng('ints');
  const seen = new Set();
  for (let i = 0; i < 2000; i++) {
    const n = rng.int(1, 6);
    assert.ok(n >= 1 && n <= 6);
    seen.add(n);
  }
  assert.equal(seen.size, 6);
});

test('weighted never picks zero-weight items', () => {
  const rng = createRng('weights');
  for (let i = 0; i < 500; i++) assert.notEqual(rng.weighted(['a', 'b', 'c'], (x) => (x === 'b' ? 0 : 1)), 'b');
  assert.throws(() => rng.weighted(['a'], () => 0));
});

test('weightedSample returns distinct items', () => {
  const rng = createRng('sample');
  for (let i = 0; i < 200; i++) {
    const out = rng.weightedSample([1, 2, 3, 4, 5], 3);
    assert.equal(new Set(out).size, 3);
  }
  assert.throws(() => rng.weightedSample([1], 2));
});

test('createRng rejects empty seeds; randomSeed is unpredictable', () => {
  assert.throws(() => createRng(''));
  assert.throws(() => createRng(null));
  const seeds = new Set(Array.from({ length: 20 }, randomSeed));
  assert.equal(seeds.size, 20);
});
