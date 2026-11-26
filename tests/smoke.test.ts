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
}

function stubElement(): StubElement {
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
      const child = stubElement();
      children.set(selector, child);
      return child;
    },
    getBoundingClientRect: () => ({ left: 0, top: 0 }),
    getContext: () => stubCtx(),
  };
  return el;
}

test('main.ts wires level + physics + renderer + input without throwing', async () => {
  const canvas = stubElement();
  const hud = stubElement();
  const frameCallbacks: Array<(stamp: number) => void> = [];

  const win = {
    devicePixelRatio: 1,
    addEventListener: (type: string, handler: (e: unknown) => void) => canvas.listeners.set(type, [handler]),
  };
  const doc = { getElementById: (id: string) => (id === 'stage' ? canvas : id === 'hud' ? hud : null) };

  const previousWindow = (globalThis as Record<string, unknown>).window;
  const previousDocument = (globalThis as Record<string, unknown>).document;
  const previousRaf = (globalThis as Record<string, unknown>).requestAnimationFrame;
  (globalThis as Record<string, unknown>).window = win;
  (globalThis as Record<string, unknown>).document = doc;
  (globalThis as Record<string, unknown>).requestAnimationFrame = (cb: (stamp: number) => void) => {
    frameCallbacks.push(cb);
    return frameCallbacks.length;
  };

  try {
    await import('../src/main.ts');

    // Drive frames: 60 steps of simulated time.
    let stamp = 0;
    for (let i = 0; i < 60; i++) {
      const cb = frameCallbacks.shift();
      assert.ok(cb, 'the loop keeps requesting frames');
      stamp += 16.7;
      cb(stamp);
    }
    assert.ok(hud.innerHTML.includes('hud-restart'), 'HUD markup is installed');
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
  } finally {
    (globalThis as Record<string, unknown>).window = previousWindow;
    (globalThis as Record<string, unknown>).document = previousDocument;
    (globalThis as Record<string, unknown>).requestAnimationFrame = previousRaf;
  }
});
