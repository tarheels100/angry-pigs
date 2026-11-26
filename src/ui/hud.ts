import type { RulesSnapshot } from '../game/rules.ts';

/** HUD overlay in DOM, not canvas (docs/adr.md D4). */
export interface Hud {
  update(snapshot: RulesSnapshot | null): void;
  message(text: string | null): void;
  /** Level label (name + index) — the HUD gets text, never level data. */
  setLevel(label: string): void;
  /** Best previous result for the stage, e.g. "best 2★ 3500"; null hides it. */
  setBest(text: string | null): void;
  /** The next pig in the launcher's queue (M18). Kept separate from update() so the
   * HUD still reads only the rules snapshot for game state. */
  setNextPig(label: string | null): void;
  /** Wire the restart control; returns an unsubscribe. */
  onRestart(handler: () => void): () => void;
}

/**
 * The HUD reads only the rules snapshot. It never touches physics or level data,
 * so a theme swap or engine swap cannot change what it shows.
 */
export function createHud(el: HTMLElement): Hud {
  el.innerHTML = `
    <div class="hud-row">
      <span class="hud-stat" data-stat="level">stage 1</span>
      <span class="hud-stat" data-stat="phase">ready</span>
      <span class="hud-stat" data-stat="ammo">pigs 0</span>
      <span class="hud-stat" data-stat="targets">birds 0</span>
      <span class="hud-stat" data-stat="score">0</span>
      <span class="hud-stat" data-stat="stars"></span>
      <span class="hud-stat" data-stat="best"></span>
      <span class="hud-stat" data-stat="next-pig"></span>
    </div>
    <div class="hud-message" data-stat="message"></div>
    <button class="hud-restart" type="button">restart</button>
  `;

  const stats = {
    level: el.querySelector('[data-stat="level"]') as HTMLElement | null,
    phase: el.querySelector('[data-stat="phase"]') as HTMLElement | null,
    ammo: el.querySelector('[data-stat="ammo"]') as HTMLElement | null,
    targets: el.querySelector('[data-stat="targets"]') as HTMLElement | null,
    score: el.querySelector('[data-stat="score"]') as HTMLElement | null,
    stars: el.querySelector('[data-stat="stars"]') as HTMLElement | null,
    nextPig: el.querySelector('[data-stat="next-pig"]') as HTMLElement | null,
    best: el.querySelector('[data-stat="best"]') as HTMLElement | null,
    message: el.querySelector('[data-stat="message"]') as HTMLElement | null,
    restart: el.querySelector('.hud-restart') as HTMLButtonElement | null,
  };

  return {
    update(snapshot) {
      if (!snapshot) return;
      if (stats.phase) stats.phase.textContent = snapshot.phase;
      if (stats.ammo) stats.ammo.textContent = `pigs ${snapshot.ammoLeft}`;
      if (stats.targets) stats.targets.textContent = `birds ${snapshot.targetsAlive}/${snapshot.targetsTotal}`;
      if (stats.score) stats.score.textContent = String(snapshot.score);
      // Stars only exist for a cleared stage; an empty span keeps the row stable.
      if (stats.stars) stats.stars.textContent = snapshot.phase === 'won' ? `${'★'.repeat(snapshot.stars)}${'·'.repeat(3 - snapshot.stars)}` : '';
    },
    message(text) {
      if (stats.message) stats.message.textContent = text ?? '';
    },
    setLevel(label) {
      if (stats.level) stats.level.textContent = label;
    },
    setBest(text) {
      if (stats.best) stats.best.textContent = text ?? '';
    },
    setNextPig(label) {
      if (stats.nextPig) stats.nextPig.textContent = label ? `next ${label}` : '';
    },
    onRestart(handler) {
      if (!stats.restart) return () => {};
      stats.restart.addEventListener('click', handler);
      return () => stats.restart!.removeEventListener('click', handler);
    },
  };
}
