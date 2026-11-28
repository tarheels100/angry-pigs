import type { LevelDef } from '../levels/index.ts';
import {
  PIECE_FIELDS,
  PIECE_KINDS,
  PIECE_LABELS,
  draftFromDef,
  draftToJson,
  draftToLevelDef,
  emptyDraft,
  pieceAt,
  pieceSummary,
  defaultPiece,
  pieceParam,
  validateDraft,
  withParam,
  type Draft,
  type Piece,
  type PieceKind,
} from '../levels/draft.ts';

/**
 * The level editor panel (M23). It is DOM chrome only: the model lives in
 * `src/levels/draft.ts`, and the only way it reaches the game is `onPreview`, which hands a
 * `LevelDef` to `game.loadLevel()`. So editing a stage uses the same loader, validation, and
 * physics as a shipped stage (docs/level-format.md).
 */

export interface EditorDeps {
  /** Reload the edited level into the running game. Always a full `loadLevel`, never a patch. */
  onPreview(def: LevelDef): void;
  /** Close the panel and hand the pointer back to aiming. */
  onClose(): void;
  /** Persist the draft so a design survives a reload. */
  onSave(draft: Draft): void;
  /** A previously saved draft, or null. */
  onLoad(): Draft | null;
  /** The bundled stages, so a shipped level can be opened and modified. */
  stageDefs(): LevelDef[];
  /** Message line for the HUD (the HUD owns the text, the editor does not). */
  onMessage(text: string): void;
}

export interface LevelEditor {
  open(): void;
  close(): void;
  isOpen(): boolean;
  /** A canvas press while editing: place the armed piece, or select the piece under the point. */
  pointerDown(point: { x: number; y: number }): void;
  /** Keys while editing. Returns true when the editor consumed the key. */
  key(key: string): boolean;
  draft(): Draft;
  /** Level JSON for the edited stage, ready to paste into `src/levels/lXX.ts`. */
  exportJson(): string;
  /** Re-render the panel after a change made outside the editor. */
  refresh(): void;
}

/** Horizontal nudge per press, in world units. */
const NUDGE = 10;
/** How many previous drafts undo keeps. */
const UNDO_DEPTH = 20;

export function createEditor(deps: EditorDeps, mount: HTMLElement): LevelEditor {
  let draft: Draft = emptyDraft();
  const history: Draft[] = [];
  let armed: PieceKind = 'block';
  let selectedId: string | null = null;
  let open = false;
  let seq = 0;

  const panel = document.createElement('div');
  panel.className = 'editor-panel';
  const title = document.createElement('div');
  title.className = 'editor-title';
  const palette = document.createElement('div');
  palette.className = 'editor-palette';
  const pieceList = document.createElement('div');
  pieceList.className = 'editor-pieces';
  const controls = document.createElement('div');
  controls.className = 'editor-controls';
  const ammoRow = document.createElement('div');
  ammoRow.className = 'editor-row';
  const actions = document.createElement('div');
  actions.className = 'editor-actions';
  const report = document.createElement('div');
  report.className = 'editor-report';
  const exportBox = document.createElement('textarea');
  exportBox.className = 'editor-export';
  exportBox.rows = 10;
  exportBox.readOnly = true;
  panel.style.display = 'none';
  // Only createElement / appendChild / removeChild / textContent / className / style, the
  // same subset src/ui/screens.ts uses, so the panel is testable with a fake DOM.
  for (const child of [title, palette, pieceList, controls, ammoRow, actions, report, exportBox]) panel.appendChild(child);
  mount.appendChild(panel);

  function clear(node: HTMLElement): void {
    for (const child of [...((node as unknown as { children?: HTMLElement[] }).children ?? [])]) node.removeChild(child);
  }

  function button(label: string, className: string, onClick: () => void): HTMLButtonElement {
    const el = document.createElement('button');
    el.className = className;
    el.type = 'button';
    el.textContent = label;
    el.addEventListener('click', onClick);
    return el;
  }

  function clone(source: Draft): Draft {
    return JSON.parse(JSON.stringify(source)) as Draft;
  }

  /** Every mutation goes through here: push undo, commit, re-validate, preview, repaint. */
  function commit(next: Draft): void {
    history.push(clone(draft));
    if (history.length > UNDO_DEPTH) history.shift();
    draft = next;
    const reportData = validateDraft(draft);
    exportBox.value = reportData.errors.length === 0 ? draftToJson(draft) : '';
    if (reportData.errors.length === 0) deps.onPreview(draftToLevelDef(draft));
    deps.onMessage(
      reportData.errors.length > 0
        ? `edit: ${reportData.errors[0]}`
        : reportData.warnings.length > 0
          ? `edit: ${reportData.warnings.length} warning(s)`
          : 'edit: ready',
    );
    render();
  }

  function render(): void {
    title.textContent = `level editor · ${draft.name}`;
    renderPalette();
    renderPieces();
    renderControls();
    renderAmmo();
    renderReport();
  }

  function renderPalette(): void {
    clear(palette);
    for (const [index, kind] of PIECE_KINDS.entries()) {
      const label = `${PIECE_LABELS[kind] ?? kind} [${index + 1}]`;
      const btn = button(label, armed === kind ? 'editor-arm is-active' : 'editor-arm', () => {
        armed = kind;
        render();
        deps.onMessage(`edit: placing ${PIECE_LABELS[kind]} — click the stage`);
      });
      palette.appendChild(btn);
    }
  }

  function renderPieces(): void {
    clear(pieceList);
    for (const piece of draft.pieces) {
      const row = document.createElement('button');
      row.className = piece.id === selectedId ? 'editor-piece is-selected' : 'editor-piece';
      row.type = 'button';
      row.textContent = pieceSummary(piece);
      row.addEventListener('click', () => {
        selectedId = piece.id;
        render();
      });
      pieceList.appendChild(row);
    }
    if (draft.pieces.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'editor-empty';
      empty.textContent = 'no pieces — pick one above and click the stage';
      pieceList.appendChild(empty);
    }
  }

  function selected(): Piece | null {
    return draft.pieces.find((p) => p.id === selectedId) ?? null;
  }

  function renderControls(): void {
    clear(controls);
    const piece = selected();
    if (!piece) {
      const hint = document.createElement('div');
      hint.className = 'editor-hint';
      hint.textContent = 'click a piece on the stage (or in the list) to edit it';
      controls.appendChild(hint);
      return;
    }
    const label = document.createElement('div');
    label.className = 'editor-selected';
    label.textContent = `${PIECE_LABELS[piece.kind]} at ${Math.round(piece.x)}`;
    controls.appendChild(label);

    controls.appendChild(button(`move ${NUDGE} left`, 'editor-step', () => moveSelected(-NUDGE)));
    controls.appendChild(button(`move ${NUDGE} right`, 'editor-step', () => moveSelected(NUDGE)));
    for (const field of PIECE_FIELDS[piece.kind] ?? []) {
      const value = pieceParam(piece, field.key);
      if (field.choices) {
        const at = field.choices.indexOf(String(value));
        controls.appendChild(
          button(`${field.label}: ${value}`, 'editor-step', () => {
            const next = field.choices![(at + 1) % field.choices!.length]!;
            commit({ ...draft, pieces: draft.pieces.map((p) => (p.id === piece.id ? withParam(p, field.key, next) : p)) });
          }),
        );
        continue;
      }
      controls.appendChild(
        button(`${field.label} ${value} −`, 'editor-step', () => stepField(piece.id, field.key, -field.step)),
      );
      controls.appendChild(
        button(`${field.label} ${value} +`, 'editor-step', () => stepField(piece.id, field.key, field.step)),
      );
    }
    controls.appendChild(button('delete', 'editor-step editor-delete', () => deleteSelected()));
  }

  function stepField(id: string, key: string, delta: number): void {
    const piece = draft.pieces.find((p) => p.id === id);
    if (!piece) return;
    const field = PIECE_FIELDS[piece.kind]?.find((f) => f.key === key);
    const current = pieceParam(piece, key);
    if (typeof current !== 'number') return;
    const value = current + delta;
    if (field && (value < field.min || value > field.max)) return;
    commit({ ...draft, pieces: draft.pieces.map((p) => (p.id === id ? withParam(p, key, value) : p)) });
  }

  function moveSelected(delta: number): void {
    const piece = selected();
    if (!piece) return;
    commit({ ...draft, pieces: draft.pieces.map((p) => (p.id === piece.id ? { ...p, x: p.x + delta } : p)) });
  }

  function deleteSelected(): void {
    const piece = selected();
    if (!piece) return;
    selectedId = null;
    commit({ ...draft, pieces: draft.pieces.filter((p) => p.id !== piece.id) });
  }

  function renderAmmo(): void {
    clear(ammoRow);
    const label = document.createElement('div');
    label.className = 'editor-ammo';
    label.textContent = `ammo: ${draft.cannon.ammo.join(' ') || 'none'}`;
    ammoRow.appendChild(label);
    for (const kind of ['basic', 'heavy', 'bomb', 'cluster']) {
      ammoRow.appendChild(button(`+ ${kind}`, 'editor-step', () => commit({ ...draft, cannon: { ...draft.cannon, ammo: [...draft.cannon.ammo, kind] } })));
    }
    ammoRow.appendChild(button('remove last', 'editor-step', () => commit({ ...draft, cannon: { ...draft.cannon, ammo: draft.cannon.ammo.slice(0, -1) } })));
    ammoRow.appendChild(button(`pull ${draft.cannon.maxPull} −`, 'editor-step', () => commit({ ...draft, cannon: { ...draft.cannon, maxPull: Math.max(20, draft.cannon.maxPull - 5) } })));
    ammoRow.appendChild(button(`pull ${draft.cannon.maxPull} +`, 'editor-step', () => commit({ ...draft, cannon: { ...draft.cannon, maxPull: Math.min(140, draft.cannon.maxPull + 5) } })));
  }

  function renderActions(): void {
    clear(actions);
    actions.appendChild(button('undo', 'editor-action', undo));
    actions.appendChild(button('clear', 'editor-action', () => commit(emptyDraft(draft.name))));
    actions.appendChild(button('play', 'editor-action', () => { closePanel(); deps.onClose(); }));
    actions.appendChild(button('export', 'editor-action', () => { exportBox.value = draftToJson(draft); }));
    actions.appendChild(button('save', 'editor-action', () => deps.onSave(clone(draft))));
    actions.appendChild(button('load saved', 'editor-action', () => {
      const saved = deps.onLoad();
      if (saved) {
        draft = saved;
        selectedId = null;
        history.length = 0;
        render();
      } else deps.onMessage('edit: no saved draft');
    }));
    deps.stageDefs().forEach((def, index) => {
      actions.appendChild(button(`open ${def.name}`, 'editor-action', () => {
        draft = draftFromDef(def);
        selectedId = null;
        history.length = 0;
        commit(clone(draft));
      }));
    });
  }

  function renderReport(): void {
    const { errors, warnings } = validateDraft(draft);
    clear(report);
    for (const line of [...errors, ...warnings]) {
      const row = document.createElement('div');
      row.className = errors.includes(line) ? 'editor-error' : 'editor-warning';
      row.textContent = line;
      report.appendChild(row);
    }
    if (errors.length === 0 && warnings.length === 0) {
      const ok = document.createElement('div');
      ok.className = 'editor-ok';
      ok.textContent = 'no errors — solvability is checked by the probes, not here';
      report.appendChild(ok);
    }
  }

  function undo(): void {
    const previous = history.pop();
    if (!previous) {
      deps.onMessage('edit: nothing to undo');
      return;
    }
    draft = previous;
    selectedId = null;
    const reportData = validateDraft(draft);
    if (reportData.errors.length === 0) deps.onPreview(draftToLevelDef(draft));
    render();
  }

  function openPanel(): void {
    if (open) return;
    open = true;
    panel.style.display = 'flex';
    deps.onMessage('level editor: click the stage to place, e to play');
    render();
  }

  function closePanel(): void {
    if (!open) return;
    open = false;
    panel.style.display = 'none';
  }

  renderActions();
  render();

  return {
    open(): void {
      openPanel();
    },
    close(): void {
      closePanel();
      deps.onClose();
    },
    isOpen(): boolean {
      return open;
    },
    pointerDown(point: { x: number; y: number }): void {
      const hit = pieceAt(draft, point);
      if (hit && hit.kind !== 'static') {
        // A press on an existing piece selects it; a press on empty stage places the armed piece.
        selectedId = hit.id;
        render();
        deps.onMessage(`edit: selected ${pieceSummary(hit)}`);
        return;
      }
      seq += 1;
      const piece = defaultPiece(armed, point.x, `p${seq}`);
      // Balls and statics take the pressed height, so an elevated platform is placeable;
      // structures and scenery always rest on the ground (docs/level-format.md rule 7).
      if (piece.kind === 'ball' || piece.kind === 'static') piece.y = point.y;
      selectedId = piece.id;
      commit({ ...draft, pieces: [...draft.pieces, piece] });
      deps.onMessage(`edit: placed ${PIECE_LABELS[armed]} at ${Math.round(piece.x)}`);
    },
    key(key: string): boolean {
      if (!open) return false;
      if (key === 'Escape' || key === 'e') {
        closePanel();
        deps.onClose();
        return true;
      }
      if (key === 'u') { undo(); return true; }
      if (key === 'd' || key === 'Delete') { deleteSelected(); return true; }
      if (key === 'Enter') { closePanel(); deps.onClose(); return true; }
      if (key === '[') { moveSelected(-NUDGE); return true; }
      if (key === ']') { moveSelected(NUDGE); return true; }
      const digit = Number(key);
      if (Number.isInteger(digit) && digit >= 1 && digit <= PIECE_KINDS.length) {
        armed = PIECE_KINDS[digit - 1]!;
        render();
        deps.onMessage(`edit: placing ${PIECE_LABELS[armed]}`);
        return true;
      }
      return false;
    },
    draft(): Draft {
      return clone(draft);
    },
    exportJson(): string {
      return draftToJson(draft);
    },
    refresh(): void {
      render();
    },
  };
}
