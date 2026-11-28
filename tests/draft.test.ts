import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { LEVELS, loadLevel } from '../src/levels/index.ts';
import {
  draftFromDef,
  draftFromJson,
  draftToJson,
  draftToLevelDef,
  defaultPiece,
  emptyDraft,
  pieceAt,
  pieceFootprint,
  pieceSummary,
  validateDraft,
  withParam,
  type Piece,
} from '../src/levels/draft.ts';
import { GROUND_TOP } from '../src/levels/pieces.ts';

function withPieces(pieces: Piece[]): ReturnType<typeof emptyDraft> {
  return { ...emptyDraft('draft-test'), pieces };
}

describe('draft model (M23)', () => {
  test('the starting draft loads but is not ready until a bird exists', () => {
    const draft = emptyDraft('draft-01');
    // The ground and plinth are there; the report only asks for a target.
    assert.deepEqual(validateDraft(draft).warnings, []);
    assert.match(validateDraft(draft).errors.join(' '), /at least one bird/);
    const withBird = { ...draft, pieces: [...draft.pieces, defaultPiece('bird', 900, 'bird-1')] };
    assert.deepEqual(validateDraft(withBird), { errors: [], warnings: [] });
    const loaded = loadLevel(draftToLevelDef(withBird));
    assert.equal(loaded.def.name, 'draft-01');
    assert.equal(loaded.targetIds.length, 1);
  });

  test('a bird is required, and unknown ammo is rejected by name', () => {
    const draft = withPieces([
      { id: 'g', kind: 'static', x: 1100, w: 2200, h: 40, y: 860, type: 'ground' },
      defaultPiece('block', 900, 'b1'),
    ]);
    assert.ok(validateDraft(draft).errors.some((e) => e.includes('bird')));

    const armed = { ...draft, cannon: { ...draft.cannon, ammo: ['spark'] } };
    assert.ok(validateDraft(armed).errors.some((e) => e.includes('ammo "spark"')));
  });

  test('structures rest on the ground and expand through the builders', () => {
    const draft = withPieces([
      { id: 'g', kind: 'static', x: 1100, w: 2200, h: 40, y: 860, type: 'ground' },
      defaultPiece('hut', 800, 'h1'),
      defaultPiece('bird', 800, 'bird-1'),
    ]);
    const def = draftToLevelDef(draft);
    assert.ok(def.objects.length >= 4, 'a shelter is several blocks');
    assert.equal(def.targets?.length, 1);
    const shelter = pieceFootprint(draft.pieces[1]!);
    assert.equal(shelter.bottom, GROUND_TOP, 'the shelter sits on the ground surface');
    assert.equal(def.targets![0]!.y, GROUND_TOP - 20, 'a bird rests on the surface');
    assert.deepEqual(validateDraft(draft).errors, []);
  });

  test('overlapping structures are warned about, not silently accepted', () => {
    const draft = withPieces([
      { id: 'g', kind: 'static', x: 1100, w: 2200, h: 40, y: 860, type: 'ground' },
      defaultPiece('bird', 1000, 'bird-1'),
      defaultPiece('wall', 900, 'w1'),
      defaultPiece('block', 900, 'b1'), // same x as the wall
    ]);
    const report = validateDraft(draft);
    assert.ok(report.warnings.some((w) => w.includes('overlaps')), `expected an overlap warning: ${report.warnings.join(' | ')}`);
    assert.deepEqual(report.errors, [], 'an overlap is a warning — the level still loads');
  });

  test('a missing ground and a missing plinth are warnings', () => {
    const draft = withPieces([defaultPiece('bird', 900, 'bird-1')]);
    const report = validateDraft(draft);
    assert.ok(report.warnings.some((w) => w.includes('ground')));
    assert.ok(report.warnings.some((w) => w.includes('plinth')));
  });

  test('editing a parameter changes the expanded level', () => {
    const piece = defaultPiece('block', 900, 'b1');
    const wider = withParam(piece, 'w', 60) as Piece;
    assert.equal(pieceFootprint(wider).right - pieceFootprint(wider).left, 60);
    assert.equal(pieceFootprint(piece).right - pieceFootprint(piece).left, 30);
    // A prop's height re-seats it on the ground rather than floating it.
    const prop = withParam(defaultPiece('prop', 400, 'p1'), 'h', 400) as Piece;
    assert.equal(prop.kind === 'prop' ? prop.y : null, GROUND_TOP - 200);
  });

  test('a shipped stage opens as a draft and re-exports a loadable level', () => {
    for (const def of LEVELS) {
      const draft = draftFromDef(def);
      assert.deepEqual(validateDraft(draft).errors, [], `${def.name}: re-imported draft must load`);
      const reloaded = loadLevel(draftToLevelDef(draft));
      assert.equal(reloaded.bodies.length, loadLevel(def).bodies.length, `${def.name}: body count survives the round trip`);
      assert.equal(reloaded.targetIds.length, loadLevel(def).targetIds.length, `${def.name}: birds survive the round trip`);
    }
  });

  test('level JSON parses back into a draft', () => {
    const json = draftToJson(withPieces([
      { id: 'g', kind: 'static', x: 1100, w: 2200, h: 40, y: 860, type: 'ground' },
      defaultPiece('bird', 900, 'bird-1'),
      defaultPiece('ball', 700, 'ball-1'),
    ]));
    const back = draftFromJson(json);
    assert.equal(back.name, 'draft-test');
    assert.ok(back.pieces.some((p) => p.kind === 'ball'));
    assert.ok(back.pieces.some((p) => p.kind === 'bird'));
    assert.throws(() => draftFromJson('{not json'), /could not be parsed/);
    assert.throws(() => draftFromJson('{"bounds":{"width":1,"height":1},"cannon":{"x":1,"y":1,"maxPull":10,"powerScale":1,"ammo":["basic"]},"statics":[],"objects":[],"targets":[]}'), /level "name"/);
  });

  test('pieceSummary names the piece and its position', () => {
    assert.match(pieceSummary(defaultPiece('hut', 800, 'h1')), /shelter 150x200/);
    assert.match(pieceSummary(defaultPiece('bird', 760, 'b')), /worker bird \(right\) at 760/);
  });

  test('pieceAt finds the piece under a world point', () => {
    const draft = withPieces([
      { id: 'g', kind: 'static', x: 1100, w: 2200, h: 40, y: 860, type: 'ground' },
      defaultPiece('block', 900, 'b1'),
    ]);
    assert.equal(pieceAt(draft, { x: 900, y: GROUND_TOP - 60 })!.id, 'b1');
    assert.equal(pieceAt(draft, { x: 300, y: 400 }), null);
  });
});
