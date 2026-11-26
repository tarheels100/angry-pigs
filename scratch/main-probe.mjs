const listeners = new Map();
function stubElement() {
  const el = {
    innerHTML: '', textContent: '', listeners: new Map(),
    clientWidth: 1280, clientHeight: 720, width: 0, height: 0, style: {},
    addEventListener(t, h) { const l = this.listeners.get(t) ?? []; l.push(h); this.listeners.set(t, l); },
    removeEventListener(t, h) { this.listeners.set(t, (this.listeners.get(t) ?? []).filter(x => x !== h)); },
    querySelector(s) { if (!this._c) this._c = new Map(); const e = this._c.get(s); if (e) return e; const c = stubElement(); this._c.set(s, c); return c; },
    getBoundingClientRect: () => ({ left: 0, top: 0 }),
    getContext: () => ({ setTransform(){}, clearRect(){}, beginPath(){}, moveTo(){}, lineTo(){}, arc(){}, stroke(){}, fill(){}, closePath(){}, save(){}, restore(){}, translate(){}, scale(){}, fillRect(){}, strokeRect(){}, fillText(){}, createLinearGradient: () => ({ addColorStop(){} }), setLineDash(){}, rotate(){}, rect(){} }),
  };
  return el;
}
const canvas = stubElement(), hud = stubElement();
const frames = [];
globalThis.window = {
  devicePixelRatio: 1,
  addEventListener(t, h) { canvas.listeners.get(t) ?? canvas.listeners.set(t, []); canvas.listeners.get(t).push(h); },
  setTimeout: (fn) => { frames.push(fn); return 1; },
  clearTimeout: () => {},
};
globalThis.document = { getElementById: (id) => (id === 'stage' ? canvas : id === 'hud' ? hud : null) };
globalThis.requestAnimationFrame = (cb) => { frames.push(cb); return frames.length; };
await import('../src/main.ts');
let stamp = 0;
for (let i = 0; i < 60; i++) { const cb = frames.shift(); if (cb) { stamp += 16.7; cb(stamp); } }
console.log('message:', hud.querySelector('[data-stat="message"]').textContent);
console.log('level:', hud.querySelector('[data-stat="level"]').textContent);
console.log('phase:', hud.querySelector('[data-stat="phase"]').textContent);
console.log('camera zoom:', globalThis.window.__camera?.zoom?.(), 'pos:', JSON.stringify(globalThis.window.__camera?.position?.()));
