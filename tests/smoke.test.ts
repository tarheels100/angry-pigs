import assert from 'node:assert/strict';
import test from 'node:test';

/**
 * Headless wiring smoke test for src/main.ts (M7 acceptance: "aim, launch, settle,
 * win/lose" runs end to end). The DOM and rAF are stubbed; nothing here is a real
 * browser check, it only proves the wiring does not throw and reacts to pointer events.
 */

interface StubCall {
  op: string;
}

function stubCtx(): CanvasRenderingContext2D {
  const calls: StubCall[] = [];
  const ctx = {
    calls,
    canvas: { width: 0, height: 0 },
    fillStyle: '#000',
    strokeStyle: '#000',
    lineWidth: 1,
    setTransform: () => calls.push({ op: 'setTransform' }),
    save: () => calls.push({ op: 'save' }),
    restore: () => calls.push({ op: 'restore' }),
    translate: () => calls.push({ op: 'translate' }),
    rotate: () => calls.push({ op: 'rotate' }),
    scale: () => calls.push({ op: 'scale' }),
    fillRect: () => calls.push({ op: 'fillRect' }),
    strokeRect: () => calls.push({ op: 'strokeRect' }),
    beginPath: () => calls.push({ op: 'beginPath' }),
    moveTo: () => calls.push({ op: 'moveTo' }),
    lineTo: () => calls.push({ op: 'lineTo' }),
    arc: () => calls.push({ op: 'arc' }),
    ellipse: () => calls.push({ op: 'ellipse' }),
    closePath: () => calls.push({ op: 'closePath' }),
    quadraticCurveTo: () => calls.push({ op: 'quadraticCurveTo' }),
    rect: () => calls.push({ op: 'rect' }),
    stroke: () => calls.push({ op: 'stroke' }),
    fill: () => calls.push({ op: 'fill' }),
    shadowColor: '',
    shadowBlur: 0,
    globalAlpha: 1,
    createLinearGradient: () => ({ addColorStop: () => {} }),
  };
  return ctx as unknown as CanvasRenderingContext2D;
}

interface StubElement {
  innerHTML: string;
  textContent: string;
  listeners: Map<string, Array<(e: unknown) => void>>;
  addEventListener(type: string, handler: (e: unknown) => void): void;
  removeEventListener(type: string, handler: (e: unknown) => void): void;
  dispatch(type: string, event: unknown): void;
  querySelector(selector: string): StubElement;
  getBoundingClientRect(): { left: number; top: number };
  getContext(type: string): CanvasRenderingContext2D | null;
  clientWidth: number;
  clientHeight: number;
  width: number;
  height: number;
  style: Record<string, string>;
  className: string;
  dataset: Record<string, string>;
  children: StubElement[];
  parentNode: StubElement | null;
  ownerDocument: { createElement: (tag: string) => StubElement };
  appendChild(child: StubElement): void;
  removeChild(child: StubElement): void;
}

function stubElement(owner: { createElement: (tag: string) => StubElement }): StubElement {
  const listeners = new Map<string, Array<(e: unknown) => void>>();
  // innerHTML is never parsed, so querySelector hands out persistent stubs;
  // that is enough to prove the HUD writes text and wires the restart button.
  const children = new Map<string, StubElement>();
  const el: StubElement = {
    innerHTML: '',
    textContent: '',
    listeners,
    clientWidth: 1280,
    clientHeight: 720,
    width: 0,
    height: 0,
    style: {},
    className: '',
    dataset: {},
    children: [],
    parentNode: null,
    ownerDocument: owner,
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
      const list = listeners.get(type) ?? [];
      list.push(handler);
      listeners.set(type, list);
    },
    removeEventListener(type, handler) {
      listeners.set(type, (listeners.get(type) ?? []).filter((h) => h !== handler));
    },
    dispatch(type, event) {
      for (const handler of listeners.get(type) ?? []) handler(event);
    },
    querySelector(selector: string) {
      const existing = children.get(selector);
      if (existing) return existing;
      const child = stubElement(owner);
      children.set(selector, child);
      return child;
    },
    getBoundingClientRect: () => ({ left: 0, top: 0 }),
    getContext: () => stubCtx(),
  };
  return el;
}

test('main.ts wires level + physics + renderer + input without throwing', async () => {
  const doc: { createElement(tag: string): StubElement; getElementById(id: string): StubElement | null } = {
    // `createElement` must point back at this document so screens can build nodes.
    createElement: (tag: string) => stubElement(doc),
    getElementById: (id: string) => (id === 'stage' ? canvas : id === 'hud' ? hud : id === 'app' ? app : null),
  };
  const canvas = stubElement(doc);
  const hud = stubElement(doc);
  const app = stubElement(doc);
  const frameCallbacks: Array<(stamp: number) => void> = [];

  const win = {
    devicePixelRatio: 1,
    addEventListener: (type: string, handler: (e: unknown) => void) => canvas.listeners.set(type, [handler]),
  };

  const previousWindow = (globalThis as Record<string, unknown>).window;
  const previousDocument = (globalThis as Record<string, unknown>).document;
  const previousRaf = (globalThis as Record<string, unknown>).requestAnimationFrame;
  const previousCancel = (globalThis as Record<string, unknown>).cancelAnimationFrame;
  (globalThis as Record<string, unknown>).window = win;
  (globalThis as Record<string, unknown>).document = doc;
  (globalThis as Record<string, unknown>).requestAnimationFrame = (cb: (stamp: number) => void) => {
    frameCallbacks.push(cb);
    return frameCallbacks.length;
  };
  // The paused menu path calls cancelAnimationFrame; the fake queue is drained instead.
  (globalThis as Record<string, unknown>).cancelAnimationFrame = () => {};

  try {
    await import('../src/main.ts');

    // The game opens on the title screen, so the loop is paused at load (docs/adr.md D35).
    // The frame queued before the pause is still in the fake queue; cancelAnimationFrame is
    // a no-op stub, so it is drained and then nothing more arrives.
    assert.equal(frameCallbacks.length, 1, 'a paused menu queues no further frame');
    frameCallbacks.shift()!(0);
    assert.equal(frameCallbacks.length, 0, 'a paused menu takes no frames');

    const menuKey = canvas.listeners.get('keydown')?.[0];
    assert.ok(menuKey, 'keyboard handler installed');
    menuKey({ key: 'Escape' });
    assert.ok(frameCallbacks.length > 0, 'closing the menu resumes the loop');

    // Drive frames: 60 steps of simulated time.
    let stamp = 0;
    for (let i = 0; i < 60; i++) {
      const cb = frameCallbacks.shift();
      assert.ok(cb, 'the loop keeps requesting frames');
      stamp += 16.7;
      cb(stamp);
    }
    const steps = (window as unknown as { __steps?: () => number }).__steps?.() ?? 0;
    assert.ok(steps >= 59, `resumed play advances simulated time (${steps} steps from 60 frames)`);
    assert.ok(hud.innerHTML.includes('hud-restart'), 'HUD markup is installed');
    assert.ok(hud.innerHTML.includes('hud-menu'), 'HUD menu button is installed (M19)');
    const messageEl = hud.querySelector('[data-stat="message"]');
    assert.ok(messageEl.textContent.includes('stage-01'), 'HUD reports the loaded stage');

    // A drag then release goes through pointer wiring into the cannon.
    canvas.dispatch('pointerdown', { clientX: 60, clientY: 500 });
    canvas.dispatch('pointermove', { clientX: 30, clientY: 520 });
    canvas.dispatch('pointerup', { clientX: 30, clientY: 520 });
    for (let i = 0; i < 120; i++) {
      const cb = frameCallbacks.shift();
      if (!cb) break;
      stamp += 16.7;
      cb(stamp);
    }
    const ammoEl = hud.querySelector('[data-stat="ammo"]');
    const phaseEl = hud.querySelector('[data-stat="phase"]');
    assert.ok(ammoEl.textContent.startsWith('pigs'), 'HUD shows remaining pigs');
    assert.ok(phaseEl.textContent && phaseEl.textContent !== 'ready', 'HUD shows a live phase');
    assert.ok(canvas.listeners.has('pointerdown'), 'pointer listeners installed');

    // Options are persisted settings, and the menu pauses the loop (M19).
    const debug = win as unknown as { __options?: () => { themeId: string; sound: boolean; music: boolean; debris: boolean; trail: boolean } };
    assert.ok(debug.__options, 'options seam is exposed for tests');
    const musicBefore = debug.__options!().music;
    canvas.dispatch('keydown', { key: 'm' });
    assert.equal(debug.__options!().music, !musicBefore, 'M flips music and stores it');
    assert.equal(debug.__options!().sound, true, 'sound stays on; M is the music key (M22)');

    const overlays = () => app.children.filter((c) => c.dataset.overlay !== undefined);
    canvas.dispatch('keydown', { key: 'Escape' });
    // The editor panel (M23) shares the container, so overlays are counted by their
    // `dataset.overlay` rather than by index.
    assert.equal(overlays().length, 1, 'the title overlay is mounted');
    assert.equal(overlays()[0]!.dataset.overlay, 'title');
    assert.ok(overlays()[0]!.children[0]!.children.length > 0, 'the title panel lists stages');
    // A menu must not step physics: while it is open the loop stops requesting frames.
    while (frameCallbacks.length > 0) frameCallbacks.shift()?.(stamp += 16.7);
    assert.equal(frameCallbacks.length, 0, 'the paused loop queues no further frames');

    canvas.dispatch('keydown', { key: 'Escape' });
    assert.equal(overlays()[0]!.dataset.overlay, '', 'Esc closes the overlay');
    assert.ok(frameCallbacks.length > 0, 'closing the menu resumes the loop');
  } finally {
    (globalThis as Record<string, unknown>).window = previousWindow;
    (globalThis as Record<string, unknown>).document = previousDocument;
    (globalThis as Record<string, unknown>).requestAnimationFrame = previousRaf;
    (globalThis as Record<string, unknown>).cancelAnimationFrame = previousCancel;
  }
});
