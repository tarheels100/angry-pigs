import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import type { LevelDef } from '../src/levels/index.ts';
import { LEVELS } from '../src/levels/index.ts';
import { createEditor, type EditorDeps } from '../src/ui/editor.ts';
import { emptyDraft } from '../src/levels/draft.ts';

/**
 * Fake DOM for the editor panel (M23). The panel only uses createElement, appendChild,
 * removeChild, textContent, className, style, and click listeners — the same subset
 * tests/screens.test.ts stubs — so its behaviour is checked headlessly and the real
 * browser behaviour in tests/browser/game.browser.mjs.
 */
interface FakeNode {
  tagName: string;
  className: string;
  textContent: string;
  style: Record<string, string>;
  children: FakeNode[];
  parentNode: FakeNode | null;
  value: string;
  listeners: Map<string, Array<() => void>>;
  appendChild(child: FakeNode): void;
  removeChild(child: FakeNode): void;
  addEventListener(type: string, handler: () => void): void;
  dispatch(type: string): void;
  click(): void;
}

function fakeNode(tagName: string): FakeNode {
  const node: FakeNode = {
    tagName,
    className: '',
    textContent: '',
    style: {},
    children: [],
    parentNode: null,
    value: '',
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
    dispatch(type) {
      for (const handler of this.listeners.get(type) ?? []) handler();
    },
    click() {
      this.dispatch('click');
    },
  };
  return node;
}

function withDocument(): void {
  (globalThis as Record<string, unknown>).document = {
    createElement: (tag: string) => fakeNode(tag),
  };
}

function findButton(node: FakeNode, match: (text: string) => boolean): FakeNode | null {
  for (const child of node.children) {
    if (child.tagName === 'button' && match(child.textContent)) return child;
    const nested = findButton(child, match);
    if (nested) return nested;
  }
  return null;
}

interface EditorFixture {
  editor: ReturnType<typeof createEditor>;
  mount: FakeNode;
  previews: LevelDef[];
  messages: string[];
  closes: () => number;
}

function makeEditor(): EditorFixture {
  withDocument();
  const previews: LevelDef[] = [];
  let closed = 0;
  const messages: string[] = [];
  const deps: EditorDeps = {
    onPreview: (def) => previews.push(def),
    onClose: () => { closed += 1; },
    onSave: () => {},
    onLoad: () => emptyDraft('from-store'),
    stageDefs: () => LEVELS,
    onMessage: (text) => messages.push(text),
  };
  const mount = fakeNode('div');
  const editor = createEditor(deps, mount as unknown as HTMLElement);
  return { editor, mount, previews, messages, closes: () => closed };
}

describe('level editor UI (M23)', () => {
  test('opening shows the panel and closing hands control back', () => {
    const { editor, mount, messages, closes } = makeEditor();
    const panel = mount.children[0]!;
    assert.equal(panel.style.display, 'none', 'the panel starts hidden');
    editor.open();
    assert.equal(panel.style.display, 'flex');
    assert.equal(editor.isOpen(), true);
    assert.ok(editor.key('Escape'));
    assert.equal(editor.isOpen(), false);
    assert.equal(panel.style.display, 'none');
    assert.equal(closes(), 1, 'closing hands control back to the game');
    assert.ok(messages.length > 0, 'the HUD gets a message');
  });

  test('a press on empty stage places the armed piece and previews the level', () => {
    const { editor, previews } = makeEditor();
    editor.open();
    // 9 is the bird slot in the palette; a bird alone is a complete, loadable stage.
    assert.ok(editor.key('9'));
    editor.pointerDown({ x: 900, y: 800 });
    const last = previews[previews.length - 1];
    assert.ok(last, 'placing a piece reloaded the level');
    assert.equal(last!.targets!.length, 1);
    assert.equal(last!.targets![0]!.x, 900);
  });

  test('a press on an existing piece selects it instead of placing one', () => {
    const { editor, mount } = makeEditor();
    editor.open();
    editor.pointerDown({ x: 900, y: 800 }); // a column, armed by default
    const before = editor.draft().pieces.length;
    editor.pointerDown({ x: 900, y: 820 }); // same column footprint
    assert.equal(editor.draft().pieces.length, before, 'the press selected, it did not place');
    const selected = findButton(mount, (text) => text.includes('column 30x130'));
    assert.ok(selected, 'the piece list shows the column');
    assert.match(selected!.className, /is-selected/);
  });

  test('stepping a parameter changes the exported level', () => {
    const { editor, mount } = makeEditor();
    editor.open();
    editor.pointerDown({ x: 900, y: 800 });
    const grow = findButton(mount, (text) => text.startsWith('width') && text.endsWith('+'))!;
    grow.click();
    const json = editor.exportJson();
    assert.match(json, /"w": 40/, `width stepped from 30: ${json.slice(0, 80)}`);
    assert.match(json, /"objects"/);
    assert.match(json, /"targets"/);
  });

  test('undo and delete take pieces back off', () => {
    const { editor } = makeEditor();
    editor.open();
    editor.pointerDown({ x: 700, y: 800 });
    editor.pointerDown({ x: 1200, y: 800 });
    assert.equal(editor.draft().pieces.length, 4); // ground, plinth, two columns
    assert.ok(editor.key('d')); // the last placed column is the selected one
    assert.equal(editor.draft().pieces.length, 3);
    assert.ok(editor.key('u'));
    assert.equal(editor.draft().pieces.length, 4, 'undo brings the deleted piece back');
  });

  test('a shipped stage opens for editing', () => {
    const { editor, mount, previews } = makeEditor();
    editor.open();
    const openStage = findButton(mount, (text) => text === 'open stage-01')!;
    openStage.click();
    const draft = editor.draft();
    assert.equal(draft.name, 'stage-01');
    assert.ok(draft.pieces.some((p) => p.kind === 'bird'), 'stage 01 brings its birds');
    assert.ok(previews.length > 0, 'the opened stage is previewed in the game');
  });

  test('keys outside the palette are left to the game', () => {
    const { editor } = makeEditor();
    editor.open();
    assert.equal(editor.key('r'), false, 'restart stays a game key');
    assert.equal(editor.key('t'), false, 'theme switching stays a game key');
    assert.equal(editor.key('m'), false, 'music stays a game key while editing');
    // When the editor is closed it consumes nothing.
    editor.close();
    assert.equal(editor.key('u'), false);
  });
});
