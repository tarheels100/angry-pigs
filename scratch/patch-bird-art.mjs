import { readFileSync, writeFileSync } from 'node:fs';

// --- Tron ---
let t = readFileSync('src/render/themes/tron.ts', 'utf8');
const start = t.indexOf('function paintBird(ctx: CanvasRenderingContext2D, r: number): void {');
if (start === -1) throw new Error('tron paintBird not found');
const end = t.indexOf('\n}\n', start) + 3;
t = t.slice(0, start) + `/**
 * Bird silhouettes by variant (docs/theme-contract.md). The level names the bird kind;
 * the theme decides what each one looks like. \`worker\` is the fallback for an unknown
 * variant, so a theme never has to know the whole list.
 */
const BIRD_SHAPES = {
  runner: { rx: 1.3, ry: 0.7, tail: 1.75, comb: 0.9, spikes: 1, wing: 0.75 },
  worker: { rx: 1.08, ry: 0.88, tail: 1.45, comb: 1.2, spikes: 3, wing: 0.62 },
  broody: { rx: 1.02, ry: 1.05, tail: 1.15, comb: 1.55, spikes: 4, wing: 0.5 },
} as const;

type BirdShape = (typeof BIRD_SHAPES)['worker'];

function birdShape(variant?: string): BirdShape {
  return (variant ? BIRD_SHAPES[variant as keyof typeof BIRD_SHAPES] : undefined) ?? BIRD_SHAPES.worker;
}

function paintBird(ctx: CanvasRenderingContext2D, r: number, variant?: string): void {
  const shape = birdShape(variant);
  const outline = 'rgba(255, 214, 90, 0.95)';

  // Tail feathers behind the body: a runner's are longer and flatter.
  ctx.strokeStyle = outline;
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (const dy of [-0.35, 0, 0.35]) {
    ctx.moveTo(-shape.rx * r * 0.75, dy * shape.ry * r);
    ctx.lineTo(-shape.tail * r, dy * shape.ry * r - r * 0.22);
  }
  ctx.stroke();

  // Legs.
  ctx.strokeStyle = 'rgba(255, 150, 60, 0.9)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (const dx of [-0.2, 0.25]) {
    ctx.moveTo(dx * r, shape.ry * r * 0.8);
    ctx.lineTo(dx * r + r * 0.12, shape.ry * r * 1.25);
  }
  ctx.stroke();

  // Body: an egg whose proportions come from the variant, so three birds in one
  // stage are not three copies of the same outline.
  ctx.fillStyle = 'rgba(255, 210, 74, 0.55)';
  ctx.strokeStyle = outline;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.ellipse(0, 0, shape.rx * r, shape.ry * r, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Wing: darker oval across the body, swept back further on a runner.
  ctx.fillStyle = 'rgba(214, 150, 46, 0.5)';
  ctx.strokeStyle = outline;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.ellipse(-shape.rx * r * 0.25, -shape.ry * r * 0.15, shape.wing * r, shape.wing * r * 0.66, -0.35, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Comb: spike count and height are the variant's signature.
  ctx.fillStyle = 'rgba(255, 80, 60, 0.9)';
  ctx.beginPath();
  const spread = shape.spikes === 1 ? 0 : 0.25;
  for (let i = 0; i < shape.spikes; i++) {
    const dx = (i - (shape.spikes - 1) / 2) * spread * r;
    ctx.moveTo(dx, -shape.ry * r * 0.9);
    ctx.lineTo(dx + r * 0.14, -shape.comb * r);
    ctx.lineTo(dx + r * 0.28, -shape.ry * r * 0.9);
  }
  ctx.fill();

  // Beak: a triangle past the body edge, orange against yellow.
  ctx.fillStyle = 'rgba(255, 160, 60, 0.9)';
  ctx.strokeStyle = 'rgba(190, 110, 30, 0.95)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(shape.rx * r * 0.8, -shape.ry * r * 0.25);
  ctx.lineTo(shape.rx * r * 1.5, r * 0.05);
  ctx.lineTo(shape.rx * r * 0.8, shape.ry * r * 0.32);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Eye near the head.
  ctx.fillStyle = 'rgba(240, 250, 255, 0.92)';
  ctx.beginPath();
  ctx.arc(shape.rx * r * 0.4, -shape.ry * r * 0.4, r * 0.22, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(12, 20, 26, 0.95)';
  ctx.beginPath();
  ctx.arc(shape.rx * r * 0.45, -shape.ry * r * 0.4, r * 0.1, 0, Math.PI * 2);
  ctx.fill();
}
` + t.slice(end);
t = t.replace("else if (state.kind === 'bird') paintBird(ctx, state.radius ?? 16);", "else if (state.kind === 'bird') paintBird(ctx, state.radius ?? 16, state.variant);");
writeFileSync('src/render/themes/tron.ts', t);

// --- Pixel ---
let p = readFileSync('src/render/themes/pixel.ts', 'utf8');
const pStart = p.indexOf('function paintBird(ctx: CanvasRenderingContext2D, palette: ThemePalette, half: number): void {');
if (pStart === -1) throw new Error('pixel paintBird not found');
const pEnd = p.indexOf('\n}\n', pStart) + 3;
p = p.slice(0, pStart) + `/** Chunky bird silhouettes by variant, mirroring the tron theme's shapes (D39). */
const BIRD_SHAPES = {
  runner: { rx: 1.3, ry: 0.7, tail: 3, comb: 1, wing: 5 },
  worker: { rx: 1.08, ry: 0.88, tail: 2, comb: 3, wing: 4 },
  broody: { rx: 1.02, ry: 1.05, tail: 1, comb: 4, wing: 3 },
} as const;

type BirdShape = (typeof BIRD_SHAPES)['worker'];

function birdShape(variant?: string): BirdShape {
  return (variant ? BIRD_SHAPES[variant as keyof typeof BIRD_SHAPES] : undefined) ?? BIRD_SHAPES.worker;
}

function paintBird(ctx: CanvasRenderingContext2D, palette: ThemePalette, half: number, variant?: string): void {
  const shape = birdShape(variant);
  const yellow = palette.bird;
  const dark = '#8a5a22';
  const orange = '#ff9a4a';
  const red = '#e04a3a';
  const rx = snap(half * shape.rx);
  const ry = snap(half * shape.ry);

  // Tail steps behind the body: a runner carries more of them.
  ctx.fillStyle = yellow;
  for (let i = 0; i < shape.tail; i++) {
    ctx.fillRect(-rx - PIXEL * 2, snap(-ry * 0.5) + i * PIXEL * 1.5 - PIXEL, PIXEL * 2, PIXEL);
  }

  // Legs.
  ctx.fillStyle = orange;
  ctx.fillRect(-PIXEL, ry - PIXEL, PIXEL, PIXEL * 2);
  ctx.fillRect(PIXEL, ry - PIXEL, PIXEL, PIXEL * 2);

  // Body: the variant decides how wide and how tall the block is.
  ctx.fillStyle = yellow;
  ctx.fillRect(-rx, -ry, rx * 2, ry * 2);

  // Wing: a darker band, longer on a runner.
  ctx.fillStyle = dark;
  ctx.fillRect(-rx + PIXEL, -PIXEL, PIXEL * shape.wing, PIXEL * 2);

  // Comb: one spike for a runner, four for a broody bird.
  ctx.fillStyle = red;
  for (let i = 0; i < shape.comb; i++) {
    const dx = snap(((i - (shape.comb - 1) / 2) * half * 0.35));
    ctx.fillRect(dx, -ry - PIXEL * 2, PIXEL, PIXEL * 2);
  }

  // Beak: an orange step past the body edge.
  ctx.fillStyle = orange;
  ctx.fillRect(rx, -PIXEL, PIXEL * 2, PIXEL);

  // Eye: dark pixel near the head.
  ctx.fillStyle = '#0d141a';
  ctx.fillRect(rx - PIXEL * 2, -ry + PIXEL, PIXEL, PIXEL);
}
` + p.slice(pEnd);
p = p.replace("else if (state.kind === 'bird') paintBird(ctx, palette, snap(state.radius ?? 16));", "else if (state.kind === 'bird') paintBird(ctx, palette, snap(state.radius ?? 16), state.variant);");
writeFileSync('src/render/themes/pixel.ts', p);
console.log('bird art patched');
