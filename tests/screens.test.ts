import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { bestLabel, createScreens, type ScreensDeps, type StageListing } from '../src/ui/screens.ts';
import { DEFAULT_OPTIONS, type Options } from '../src/ui/options.ts';

/**
 * Minimal DOM stand-in. `src/ui/screens.ts` only uses createElement, appendChild,
 * removeChild, textContent, className, dataset, style, and click listeners, so a fake
 * is enough to assert the menu's behaviour headlessly (docs/browser-testing.md covers
 * the real-browser version).
 */
interface FakeNode {
  className: string;
  dataset: Record<string, string>;
  style: Record<string, string>;
  textContent: string;
  children: FakeNode[];
  parentNode: FakeNode | null;
  ownerDocument?: FakeDoc;
  listeners: Map<string, Array<() => void>>;
  appendChild(child: FakeNode): void;
  removeChild(child: FakeNode): void;
  addEventListener(type: string, handler: () => void): void;
  removeEventListener(type: string, handler: () => void): void;
}

function fakeNode(owner: FakeDoc, tag = 'div'): FakeNode {
  const node: FakeNode = {
    className: '',
    dataset: { tag },
    style: {},
    textContent: '',
    children: [],
    parentNode: null,
    listeners: new Map(),
    appendChild(child) {
      child.parentNode = this;
      this.children.push(child);
    },
    removeChild(child) {
      const at = this.children.indexOf(child);
      if (at >= 0) this.children.splice(at, 1);
      child.parentNode = null;
    },
    addEventListener(type, handler) {
      const list = this.listeners.get(type) ?? [];
      list.push(handler);
      this.listeners.set(type, list);
    },
    removeEventListener(type, handler) {
      const list = this.listeners.get(type) ?? [];
      const at = list.indexOf(handler);
      if (at >= 0) list.splice(at, 1);
    },
  };
  node.ownerDocument = owner;
  return node;
}

interface FakeDoc {
  createElement(tag: string): FakeNode;
}

function fakeDocument(): FakeDoc {
  const doc: FakeDoc = { createElement: (tag: string) => fakeNode(doc, tag) };
  return doc;
}

function click(node: FakeNode): void {
  for (const handler of node.listeners.get('click') ?? []) handler();
}

function find(node: FakeNode, testId: string): FakeNode {
  const walk = (n: FakeNode): FakeNode | null => {
    if (n.dataset.test === testId) return n;
    for (const child of n.children) {
      const found = walk(child);
      if (found) return found;
    }
    return null;
  };
  const found = walk(node);
  if (!found) throw new Error(`no element with data-test="${testId}"`);
  return found;
}

/** Option rows: a label span followed by the value button. */
function rowLabels(node: FakeNode): string[] {
  return node.children.map((row) => row.children.map((c) => `${c.textContent ?? ''}`.trim()).join(','));
}

/** Stage list rows: one button per li. */
function buttonLabels(list: FakeNode): string[] {
  return list.children.map((li) => child(li, 0).textContent);
}

/** Indexed access is unchecked in tsconfig, so menus assert their own shape. */
function child(node: FakeNode, index: number): FakeNode {
  const found = node.children[index];
  if (!found) throw new Error(`expected child ${index}`);
  return found;
}

/** The overlay holds one panel; panels hold heading + content + actions. */
function panelOf(root: FakeNode): FakeNode {
  return child(child(root, 0), 0);
}

function harness(stages: StageListing[], options: Options = DEFAULT_OPTIONS) {
  const doc = fakeDocument();
  const root = fakeNode(doc);
  const picked: number[] = [];
  const changes: Options[] = [];
  let resets = 0;
  let closes = 0;
  // Like src/main.ts, the harness keeps the current settings, so a cycle moves forward
  // rather than re-reading the same starting value.
  let current = options;
  const deps: ScreensDeps = {
    stages: () => stages,
    themes: () => [{ id: 'tron', name: 'Tron' }, { id: 'pixel', name: 'Pixel' }],
    options: () => current,
    pickStage: (index) => picked.push(index),
    changeOptions: (next) => {
      current = next;
      changes.push(next);
    },
    resetBest: () => {
      resets += 1;
      // The game forgets the records; the listing is rebuilt from what the store now holds.
      for (const stage of stages) stage.best = null;
    },
    onClose: () => {
      closes += 1;
    },
  };
  const screens = createScreens(root as unknown as HTMLElement, deps);
  return { root, screens, picked, changes, resets: () => resets, closes: () => closes };
}

const stages: StageListing[] = [
  { index: 0, name: 'stage-01', best: { levelId: 'stage-01', score: 3500, stars: 3, launches: 1 } },
  { index: 1, name: 'stage-02', best: null },
  { index: 2, name: 'stage-03', best: { levelId: 'stage-03', score: 1200, stars: 1, launches: 3 } },
];

describe('title screen (M19)', () => {
  test('lists every stage with its best result', () => {
    const { screens, root } = harness(stages);
    screens.showTitle();
    assert.equal(screens.openKind(), 'title');
    assert.equal(root.children[0]!.style.display, 'flex');
    assert.equal(screens.text().title, 'angry pigs');
    const buttons = buttonLabels(child(panelOf(root), 1));
    assert.deepEqual(buttons, [
      'play stage-01 · best ★★★ 3500',
      'play stage-02 · no record yet',
      'play stage-03 · best ★ 1200',
    ]);
  });

  test('picking a stage hands the index to the game', () => {
    const { screens, root, picked } = harness(stages);
    screens.showTitle();
    click(find(root, 'stage-1'));
    assert.deepEqual(picked, [1]);
  });

  test('resume closes the overlay and returns control', () => {
    const { screens, root, closes } = harness(stages);
    screens.showTitle();
    click(find(root, 'resume'));
    assert.equal(screens.openKind(), null);
    assert.equal(root.children[0]!.style.display, 'none');
    assert.equal(closes(), 1);
    assert.equal(panelOf(root).children.length, 0);
  });

  test('dispose removes the overlay from the root', () => {
    const { screens, root } = harness(stages);
    screens.showTitle();
    screens.dispose();
    assert.equal(root.children.length, 0);
    assert.equal(screens.openKind(), null);
  });
});

describe('options screen (M19)', () => {
  test('shows current settings and cycles the theme', () => {
    const { screens, root, changes } = harness(stages, { ...DEFAULT_OPTIONS, themeId: 'tron' });
    screens.showOptions();
    assert.equal(screens.openKind(), 'options');
    assert.deepEqual(rowLabels(child(panelOf(root), 1)), [
      'theme,tron',
      'sound,on',
      // The soundtrack ships off (playtest item 2); the row makes the revisit reachable.
      'music,off',
      'debris,on',
      'trail,on',
    ]);
    click(find(root, 'opt-theme'));
    assert.deepEqual(changes, [{ ...DEFAULT_OPTIONS, themeId: 'pixel' }]);
    // The game re-renders the panel with the new setting, so the row shows it.
    screens.showOptions();
    assert.equal(rowLabels(child(panelOf(root), 1))[0], 'theme,pixel');
    click(find(root, 'opt-theme'));
    assert.deepEqual(changes[1], { ...DEFAULT_OPTIONS, themeId: 'tron' });
  });

  test('toggles report the flipped value', () => {
    const { screens, root, changes } = harness(stages);
    screens.showOptions();
    click(find(root, 'opt-sound'));
    click(find(root, 'opt-debris'));
    click(find(root, 'opt-trail'));
    assert.deepEqual(changes, [
      { ...DEFAULT_OPTIONS, sound: false },
      { ...DEFAULT_OPTIONS, debris: false },
      { ...DEFAULT_OPTIONS, trail: false },
    ]);
  });

  test('forget best scores goes through the save store and rebuilds the list', () => {
    const { screens, root, resets } = harness(stages);
    screens.showOptions();
    click(find(root, 'reset-best'));
    assert.equal(resets(), 1);
    // The options panel stays open; the game re-opens the title screen afterwards.
    assert.equal(screens.openKind(), 'options');
    screens.showTitle();
    assert.equal(buttonLabels(child(panelOf(root), 1))[0], 'play stage-01 · no record yet');
  });

  test('a title screen "options" action opens the options panel', () => {
    const { screens, root } = harness(stages);
    screens.showTitle();
    click(find(root, 'options'));
    assert.equal(screens.openKind(), 'options');
  });
});

describe('best label', () => {
  test('renders stars and score, and says so when there is no record', () => {
    assert.equal(bestLabel({ levelId: 'x', score: 3500, stars: 3, launches: 1 }), 'best ★★★ 3500');
    assert.equal(bestLabel(null), 'no record yet');
  });
});
