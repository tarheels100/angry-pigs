import { emptyDraft, draftToLevelDef, defaultPiece } from '../src/levels/draft.ts';
const d = emptyDraft('t');
d.pieces.push(defaultPiece('hut', 800, 'hut-1'));
const def = draftToLevelDef(d);
console.log(JSON.stringify(def));
