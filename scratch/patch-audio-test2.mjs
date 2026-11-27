import { readFileSync, writeFileSync } from 'node:fs';
let s = readFileSync('tests/audio.test.ts', 'utf8');

// Tone needs a real AudioParam graph, so playback is asserted in the browser, not in node.
const drop = s.indexOf("test('music reports the stage it is playing and stops on command', () => {");
const dropEnd = s.indexOf("test('sfx plays a blip for impact events', () => {");
if (drop === -1 || dropEnd === -1) throw new Error('markers not found');
s = s.slice(0, drop) + s.slice(dropEnd);

// sfx only sounds once a gesture unlocked the context.
s = s.replace(/(\n  const sfx = createSfx\(\(\) => context\);\n  sfx\.attach\(bus\);\n)/g, `$1  sfx.unlock();\n`);
writeFileSync('tests/audio.test.ts', s);
