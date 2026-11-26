import type { RulesSnapshot } from '../game/rules.ts';

/** HUD overlay in DOM, not canvas (docs/adr.md D4). */
export interface Hud {
  update(snapshot: RulesSnapshot | null): void;
  message(text: string | null): void;
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
      <span class="hud-stat" data-stat="phase">ready</span>
      <span class="hud-stat" data-stat="ammo">pigs 0</span>
      <span class="hud-stat" data-stat="targets">birds 0</span>
      <span class="hud-stat" data-stat="score">0</span>
    </div>
    <div class="hud-message" data-stat="message"></div>
    <button class="hud-restart" type="button">restart</button>
  `;

  const stats = {
    phase: el.querySelector('[data-stat="phase"]') as HTMLElement | null,
    ammo: el.querySelector('[data-stat="ammo"]') as HTMLElement | null,
    targets: el.querySelector('[data-stat="targets"]') as HTMLElement | null,
    score: el.querySelector('[data-stat="score"]') as HTMLElement | null,
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
    },
    message(text) {
      if (stats.message) stats.message.textContent = text ?? '';
    },
    onRestart(handler) {
      if (!stats.restart) return () => {};
      stats.restart.addEventListener('click', handler);
      return () => stats.restart!.removeEventListener('click', handler);
    },
  };
}
