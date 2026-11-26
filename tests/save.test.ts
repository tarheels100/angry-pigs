import assert from 'node:assert/strict';
import test from 'node:test';

import { createSaveStore, memoryStore, type KeyValueStore } from '../src/game/save.ts';

test('the best result for a stage is kept', () => {
  const save = createSaveStore(memoryStore());
  save.record('stage-01', { score: 2000, stars: 1, launches: 4 });
  assert.deepEqual(save.best('stage-01'), { levelId: 'stage-01', score: 2000, stars: 1, launches: 4 });

  save.record('stage-01', { score: 3000, stars: 3, launches: 1 });
  assert.equal(save.best('stage-01')!.score, 3000, 'a better clear replaces the record');

  save.record('stage-01', { score: 1000, stars: 1, launches: 4 });
  assert.equal(save.best('stage-01')!.score, 3000, 'a worse clear does not replace it');
  assert.equal(save.best('stage-02'), null, 'an untouched stage has no record');
});

test('ties break on stars, then on fewer shots', () => {
  const save = createSaveStore(memoryStore());
  save.record('stage-01', { score: 3000, stars: 2, launches: 2 });
  save.record('stage-01', { score: 3000, stars: 3, launches: 1 });
  assert.equal(save.best('stage-01')!.stars, 3, 'more stars win a score tie');

  save.record('stage-01', { score: 3000, stars: 3, launches: 3 });
  assert.equal(save.best('stage-01')!.launches, 1, 'fewer shots win a star tie');
});

test('corrupt storage is treated as no record', () => {
  const store = memoryStore();
  store.set('angry-pigs:best:stage-01', 'not json');
  const save = createSaveStore(store);
  assert.equal(save.best('stage-01'), null, 'a malformed value must not crash or score');

  store.set('angry-pigs:best:stage-01', JSON.stringify({ score: 'high' }));
  assert.equal(save.best('stage-01'), null, 'wrong field types are rejected');

  // A record can still be written over corrupt data.
  save.record('stage-01', { score: 1500, stars: 2, launches: 2 });
  assert.equal(save.best('stage-01')!.score, 1500);
});

test('clear forgets only the named stages', () => {
  const save = createSaveStore(memoryStore());
  save.record('stage-01', { score: 1000, stars: 1, launches: 3 });
  save.record('stage-02', { score: 2000, stars: 2, launches: 2 });
  save.clear(['stage-01']);
  assert.equal(save.best('stage-01'), null);
  assert.equal(save.best('stage-02')!.score, 2000);
});

test('a throwing store degrades to nothing rather than breaking the game', () => {
  const hostile: KeyValueStore = {
    get: () => {
      throw new Error('storage disabled');
    },
    set: () => {},
    remove: () => {},
  };
  const save = createSaveStore(hostile);
  assert.equal(save.best('stage-01'), null);
});
