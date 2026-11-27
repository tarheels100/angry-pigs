import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { memoryStore } from '../src/game/save.ts';
import { DEFAULT_OPTIONS, loadOptions, saveOptions } from '../src/ui/options.ts';

describe('options persistence (M19)', () => {
  test('defaults when nothing is stored', () => {
    assert.deepEqual(loadOptions(memoryStore()), DEFAULT_OPTIONS);
  });

  test('a saved value round-trips', () => {
    const store = memoryStore();
    saveOptions(store, { themeId: 'pixel', sound: false, music: true, debris: true, trail: false });
    assert.deepEqual(loadOptions(store), { themeId: 'pixel', sound: false, music: true, debris: true, trail: false });
  });

  test('the soundtrack ships off; impact sound ships on', () => {
    // Playtest items 1-2: the generated track is on theme but weak, and its load-time
    // notes read as a burst of noise, so it is a choice rather than the default.
    assert.equal(DEFAULT_OPTIONS.music, false);
    assert.equal(DEFAULT_OPTIONS.sound, true);
    assert.equal(loadOptions(memoryStore()).music, false);
  });

  test('corrupt storage falls back to defaults instead of throwing', () => {
    const store = memoryStore();
    store.set('angry-pigs:options', 'not json at all');
    assert.deepEqual(loadOptions(store), DEFAULT_OPTIONS);
    store.set('angry-pigs:options', '{"themeId": 7, "sound": "yes"}');
    // Wrong types are dropped field by field; a valid theme id would still be kept.
    assert.deepEqual(loadOptions(store), DEFAULT_OPTIONS);
    store.set('angry-pigs:options', '{"themeId": "pixel", "sound": "yes"}');
    assert.deepEqual(loadOptions(store), { themeId: 'pixel', sound: true, music: false, debris: true, trail: true });
  });

  test('a blocked store keeps the session settings usable', () => {
    const blocked = {
      get: () => {
        throw new Error('storage blocked');
      },
      set: () => {
        throw new Error('storage blocked');
      },
      remove: () => {
        throw new Error('storage blocked');
      },
    };
    assert.deepEqual(loadOptions(blocked), DEFAULT_OPTIONS);
    saveOptions(blocked, { themeId: 'pixel', sound: false, music: false, debris: false, trail: false });
    assert.deepEqual(loadOptions(blocked), DEFAULT_OPTIONS);
  });

  test('an unknown theme id is stored as-is and only falls back where the theme is looked up', () => {
    const store = memoryStore();
    saveOptions(store, { ...DEFAULT_OPTIONS, themeId: 'removed-in-a-later-build' });
    assert.equal(loadOptions(store).themeId, 'removed-in-a-later-build');
  });
});
