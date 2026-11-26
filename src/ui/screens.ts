import type { StageRecord } from '../game/save.ts';
import type { Options } from './options.ts';

/**
 * Title and options overlays (M19). DOM, not canvas: these screens are UI chrome, and
 * the theme contract (docs/theme-contract.md) has no notion of a menu.
 *
 * The overlay covers the canvas, so while it is open the pointer never reaches the
 * launcher — `src/main.ts` also pauses the loop, so a menu cannot step physics.
 */

export type OverlayKind = 'title' | 'options' | null;

export interface StageListing {
  index: number;
  name: string;
  best: StageRecord | null;
}

export interface ThemeListing {
  id: string;
  name: string;
}

export interface ScreensDeps {
  /** Read at open time, so best scores and ammo are current. */
  stages(): StageListing[];
  themes(): ThemeListing[];
  options(): Options;
  pickStage(index: number): void;
  changeOptions(next: Options): void;
  resetBest(): void;
  onClose(): void;
}

export interface Screens {
  showTitle(): void;
  showOptions(): void;
  hide(): void;
  openKind(): OverlayKind;
  /** Painted text for tests and debugging. */
  text(): { title: string; options: string[] };
  dispose(): void;
}

export function bestLabel(record: StageRecord | null): string {
  return record ? `best ${'★'.repeat(record.stars)} ${record.score}` : 'no record yet';
}

export function createScreens(root: HTMLElement, deps: ScreensDeps): Screens {
  const doc = root.ownerDocument;
  const overlay = doc.createElement('div');
  overlay.className = 'overlay';
  overlay.dataset.overlay = '';
  root.appendChild(overlay);

  const panel = doc.createElement('div');
  panel.className = 'panel';
  overlay.appendChild(panel);

  let kind: OverlayKind = null;

  function clear(): void {
    for (const child of Array.from(panel.children)) panel.removeChild(child);
  }

  function heading(text: string): HTMLElement {
    const h = doc.createElement('h2');
    h.className = 'overlay-title';
    h.textContent = text;
    panel.appendChild(h);
    return h;
  }

  function button(label: string, onClick: () => void, testId: string): HTMLElement {
    const b = doc.createElement('button');
    b.className = 'overlay-button';
    b.textContent = label;
    b.dataset.test = testId;
    b.addEventListener('click', onClick);
    return b;
  }

  /** Stage list with best scores, plus the actions that do not need a stage. */
  function renderTitle(): void {
    clear();
    overlay.dataset.overlay = 'title';
    heading('angry pigs');
    const list = doc.createElement('ul');
    list.className = 'stage-list';
    panel.appendChild(list);
    for (const stage of deps.stages()) {
      const li = doc.createElement('li');
      li.appendChild(button(`play ${stage.name} · ${bestLabel(stage.best)}`, () => deps.pickStage(stage.index), `stage-${stage.index}`));
      list.appendChild(li);
    }
    const actions = doc.createElement('div');
    actions.className = 'overlay-actions';
    actions.appendChild(button('options', () => showOptions(), 'options'));
    actions.appendChild(button('resume', () => close(), 'resume'));
    panel.appendChild(actions);
  }

  function renderOptions(): void {
    clear();
    overlay.dataset.overlay = 'options';
    heading('options');
    const options = deps.options();
    const rows = doc.createElement('div');
    rows.className = 'opt-list';
    panel.appendChild(rows);

    function row(label: string, value: string, cycle: () => Options, testId: string): void {
      const line = doc.createElement('div');
      line.className = 'opt-row';
      const name = doc.createElement('span');
      name.textContent = label;
      line.appendChild(name);
      line.appendChild(button(value, () => deps.changeOptions(cycle()), testId));
      rows.appendChild(line);
    }

    const themes = deps.themes();
    row(
      'theme',
      options.themeId,
      () => {
        const at = themes.findIndex((t) => t.id === options.themeId);
        const next = themes[(at + 1) % themes.length] ?? themes[0]!;
        return { ...options, themeId: next.id };
      },
      'opt-theme',
    );
    row('sound', onOff(options.sound), () => ({ ...options, sound: !options.sound }), 'opt-sound');
    row('debris', onOff(options.debris), () => ({ ...options, debris: !options.debris }), 'opt-debris');
    row('trail', onOff(options.trail), () => ({ ...options, trail: !options.trail }), 'opt-trail');

    const reset = doc.createElement('div');
    reset.className = 'opt-row';
    reset.appendChild(button('forget best scores', () => deps.resetBest(), 'reset-best'));
    panel.appendChild(reset);

    const actions = doc.createElement('div');
    actions.className = 'overlay-actions';
    actions.appendChild(button('resume', () => close(), 'resume'));
    panel.appendChild(actions);
  }

  function onOff(value: boolean): string {
    return value ? 'on' : 'off';
  }

  function show(next: Exclude<OverlayKind, null>): void {
    kind = next;
    overlay.dataset.open = 'true';
    overlay.style.display = 'flex';
    if (next === 'title') renderTitle();
    else renderOptions();
  }

  function hide(): void {
    kind = null;
    overlay.dataset.overlay = '';
    overlay.dataset.open = '';
    overlay.style.display = 'none';
    clear();
  }

  /** `resume` closes the overlay and hands control back to the game. */
  function close(): void {
    hide();
    deps.onClose();
  }

  function showTitle(): void {
    show('title');
  }

  function showOptions(): void {
    show('options');
  }

  return {
    showTitle,
    showOptions,
    hide,
    openKind: () => kind,
    text() {
      const items: string[] = [];
      for (const child of Array.from(panel.children)) {
        for (const inner of Array.from(child.children)) items.push(`${inner.textContent ?? ''}`.trim());
        if (child.textContent) items.push(`${child.textContent}`.trim());
      }
      return { title: `${panel.children[0]?.textContent ?? ''}`.trim(), options: items };
    },
    dispose() {
      kind = null;
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    },
  };
}
