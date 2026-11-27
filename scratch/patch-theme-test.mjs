import { readFileSync, writeFileSync } from 'node:fs';
let s = readFileSync('tests/themes.test.ts', 'utf8');
const start = s.indexOf("\ntest('birds get a different silhouette per variant (D39)', () => {");
if (start === -1) throw new Error('appended test not found');
s = s.slice(0, start) + `
test('birds get a different silhouette per variant (D39)', () => {
  const bird = (variant?: string): EntityState => ({
    id: 'bird-1',
    kind: 'bird',
    shape: 'circle',
    material: 'feather',
    x: 0,
    y: 0,
    angle: 0,
    vx: 0,
    vy: 0,
    sleeping: false,
    destroyed: false,
    health: 1,
    healthMax: 1,
    impactEnergy: 0,
    radius: 20,
    ...(variant ? { variant } : {}),
  });
  const viewport = { width: 400, height: 200, zoom: 1, offsetX: 0, offsetY: 0, dpr: 1 };

  const paintsFor = (theme: Theme, variant?: string): string[] => {
    const { ctx, ops } = recordingContext();
    theme.paintEntity(ctx, bird(variant), viewport);
    return ops.filter((o) => o.op === 'fillRect' || o.op === 'ellipse').map((o) => o.args.join(','));
  };

  for (const theme of [createTronTheme(), createPixelTheme()]) {
    assert.ok(paintsFor(theme, 'runner').length > 0, 'a runner bird paints');
    // Three named variants take different paths, so a mixed stage is not three copies.
    assert.notDeepEqual(paintsFor(theme, 'runner'), paintsFor(theme, 'broody'));
    assert.notDeepEqual(paintsFor(theme, 'worker'), paintsFor(theme, 'broody'));
    // An unknown variant falls back to the default shape rather than painting nothing.
    assert.ok(paintsFor(theme, 'something-else').length > 0, 'an unknown variant still paints');
  }
});
`;
writeFileSync('tests/themes.test.ts', s);
