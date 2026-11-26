import assert from 'node:assert/strict';
import test from 'node:test';

import type { GamePhase } from '../src/core/types.ts';
import { createHud } from '../src/ui/hud.ts';

/** Minimal DOM stand-in: the HUD writes textContent and wires one click handler.
 * Nodes are cached per selector, so a write survives a later read. */
function fakeElement(): {
  el: HTMLElement;
  clicks: Array<() => void>;
} {
  const clicks: Array<() => void> = [];
  type FakeNode = {
    textContent: string;
    addEventListener(type: string, handler: () => void): void;
    removeEventListener(type: string, handler: () => void): void;
  };
  const nodes = new Map<string, FakeNode>();

  const el = {
    innerHTML: '',
    querySelector(selector: string): FakeNode {
      const key = selector.replace('[data-stat="', '').replace('"]', '').replace('.', '');
      let node = nodes.get(key);
      if (!node) {
        node = {
          textContent: '',
          addEventListener(_type: string, handler: () => void) {
            clicks.push(handler);
          },
          removeEventListener(_type: string, handler: () => void) {
            const i = clicks.indexOf(handler);
            if (i >= 0) clicks.splice(i, 1);
          },
        };
        nodes.set(key, node);
      }
      return node;
    },
  } as unknown as HTMLElement;

  return { el, clicks };
}

function snapshotLike(phase: GamePhase, overrides: Partial<Record<string, number>> = {}) {
  return {
    phase,
    launches: 1,
    ammoLeft: overrides.ammoLeft ?? 3,
    targetsAlive: overrides.targetsAlive ?? 2,
    targetsTotal: overrides.targetsTotal ?? 2,
    score: overrides.score ?? 1200,
    stars: overrides.stars ?? 2,
  };
}

test('hud reports the pig type waiting in the chamber (M18)', () => {
  const { el } = fakeElement();
  const hud = createHud(el);

  hud.setNextPig('basic');
  const read = () => (el.querySelector('[data-stat="next-pig"]') as { textContent: string }).textContent;

  hud.setNextPig('heavy');
  assert.equal(read(), 'next heavy', 'the chamber label follows the ammo queue');
  hud.setNextPig('bomb');
  assert.equal(read(), 'next bomb', 'a bomb reads as a bomb');
  hud.setNextPig('cluster');
  assert.equal(read(), 'next cluster', 'a cluster reads as a cluster');
  hud.setNextPig(null);
  assert.equal(read(), '', 'an empty chamber shows nothing');
});

test('hud renders stage, ammo, birds, score, stars, and best', () => {
  const { el } = fakeElement();
  const hud = createHud(el);
  const read = (stat: string) => (el.querySelector(`[data-stat="${stat}"]`) as { textContent: string }).textContent;

  hud.setLevel('stage 02');
  hud.setBest('best 2★ 3500');
  hud.update(snapshotLike('won', { ammoLeft: 1, targetsAlive: 0, score: 2300, stars: 3 }));

  assert.equal(read('level'), 'stage 02');
  assert.equal(read('phase'), 'won');
  assert.equal(read('ammo'), 'pigs 1');
  assert.equal(read('targets'), 'birds 0/2');
  assert.equal(read('score'), '2300');
  assert.equal(read('stars'), '★★★', 'a cleared stage shows its stars');
  assert.equal(read('best'), 'best 2★ 3500');

  hud.message('won 3★');
  assert.equal(read('message'), 'won 3★');

  // An unfinished round shows no stars, so the row never promises a result.
  hud.update(snapshotLike('in_flight'));
  assert.equal(read('stars'), '');
});

test('hud restart wiring can be unsubscribed', () => {
  const { el, clicks } = fakeElement();
  const hud = createHud(el);
  let fired = 0;
  const off = hud.onRestart(() => {
    fired++;
  });
  assert.equal(clicks.length, 1, 'one click handler wired');

  clicks[0]!();
  assert.equal(fired, 1, 'a click restarts the round');
  off();
  assert.equal(clicks.length, 0, 'unsubscribe detaches the HUD handler');
});
