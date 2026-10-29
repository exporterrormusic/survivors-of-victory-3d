// Rapture Lab (?mode=lab): the test plaza with a spawn panel for every roster Rapture, to check
// behaviors one at a time. Raptures spawn 9 m ahead of where the player aims. Nothing saves.

import { Horde } from './horde';
import { EnemyAttackPacing } from '../enemy-attack';
import { returnToArk, type SortieModeInit } from './sortie-mode';
import { RAPTURE_KEYS, raptureSpec, type Tier } from './roster';
import { TelegraphLayer, groundHeight } from './telegraph';
import './lab-mode.css';

const TIERS: readonly Tier[] = ['horde', 'specialist', 'heavy', 'boss', 'archive'];
/** roles with their own behavior file; the rest use the fallback bolt */
const CUSTOM = new Set(['swarmer', 'charger', 'exploder', 'spotter', 'shielder', 'sniper', 'mortar', 'diver', 'skirmisher', 'emplacement', 'spinner', 'jammer', 'gunship', 'bombard', 'incinerator', 'howler', 'boss']);

export class LabMode {
  readonly ended = false;
  private count = 1;
  private god = true;
  private frozen = false;
  private loading = false;
  private disposed = false;
  private loadError = '';
  private readonly loaded = new Set<string>();
  /** the spawn panel; main.ts mounts it as the ENEMY tab of the test lab */
  readonly panel = document.createElement('div');
  private readonly status = document.createElement('p');

  private constructor(private readonly init: SortieModeInit, private readonly horde: Horde,
    private readonly tells: TelegraphLayer, private readonly pacing: EnemyAttackPacing,
    private readonly standalone: boolean) {
    this.god = standalone;
    if (standalone) {
      init.field.setMovement('pursue');
      init.run.burstAlwaysMax = true;
    }
    this.panel.className = 'rapture-lab';
    this.panel.innerHTML = `<div class="lab-body">
        <div class="lab-row" data-counts>${[1, 3, 10].map((n) => `<button data-count="${n}" aria-pressed="${n === 1}">×${n}</button>`).join('')}</div>
        <div class="lab-list">${TIERS.map((tier) => {
          const keys = RAPTURE_KEYS.filter((k) => raptureSpec(k).tier === tier);
          return `<details ${tier === 'horde' || tier === 'specialist' ? 'open' : ''}><summary>${tier.toUpperCase()} <span>${keys.length}</span></summary><div class="lab-grid">${keys.map((k) => {
            const s = raptureSpec(k);
            return `<button data-spawn="${k}" title="${s.name} · ${s.hp} HP · ${s.speed} m/s · ${s.damage} dmg · range ${s.range} m"><b>${s.name}</b><small class="${CUSTOM.has(s.role) ? 'custom' : ''}">${s.role}</small></button>`;
          }).join('')}</div></details>`;
        }).join('')}</div>
        <div class="lab-row">
          <button data-toggle="god" aria-pressed="${this.god}">God mode</button>
          <button data-toggle="freeze" aria-pressed="false">Freeze AI</button>
          <button data-clear>Clear</button>
        </div>
      </div>`;
    this.panel.querySelector('.lab-body')!.append(this.status);
    // Keep clicks off the canvas so they don't fire the weapon.
    this.panel.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.panel.addEventListener('click', (e) => this.click(e));
    document.getElementById('hud')!.append(this.panel);
  }

  static async create(init: SortieModeInit, standalone = true): Promise<LabMode> {
    const tells = new TelegraphLayer(init.scene, groundHeight(init.snow)), pacing = new EnemyAttackPacing();
    const horde = new Horde(init.field, { player: init.player, field: init.field, run: init.run, vfx: init.vfx, tells, pacing, snow: init.snow, arenaRadius: init.arenaRadius });
    if (standalone) await horde.load(RAPTURE_KEYS);
    return new LabMode(init, horde, tells, pacing, standalone);
  }

  get alive(): number { return this.horde.counts().total; }

  abandon(): void { returnToArk(); }

  update(dt: number): void {
    const { player } = this.init;
    if (this.god) { player.hp = player.maxHp; }
    // No level-ups: the talent picker would cover the panel.
    if (this.standalone) this.init.run.xp = 0;
    const step = this.frozen ? 0 : dt;
    this.pacing.update(step);
    this.horde.update(step);
    this.tells.update(step);
    if (this.frozen) for (const t of this.init.field.targets) if (t.alive && !t.respawns) t.frozen = Math.max(t.frozen, .1);
    this.status.textContent = this.loading ? 'Loading enemy…' : this.loadError || `${this.alive} alive`;
  }

  private click(e: MouseEvent): void {
    const button = (e.target as HTMLElement).closest('button');
    if (!button) return;
    button.blur();
    if (button.dataset.count) {
      this.count = Number(button.dataset.count);
      for (const b of this.panel.querySelectorAll<HTMLButtonElement>('[data-count]')) b.setAttribute('aria-pressed', String(b === button));
    } else if (button.dataset.spawn) void this.spawn(button.dataset.spawn);
    else if (button.dataset.clear !== undefined) this.horde.clear();
    else if (button.dataset.toggle) {
      const on = button.getAttribute('aria-pressed') !== 'true';
      button.setAttribute('aria-pressed', String(on));
      if (button.dataset.toggle === 'god') this.god = on; else this.frozen = on;
    }
  }

  private async spawn(key: string): Promise<void> {
    if (this.loading || this.disposed) return;
    if (!this.standalone && !this.loaded.has(key)) {
      this.loading = true; this.loadError = '';
      try {
        await this.horde.load([key]);
        if (this.disposed) return;
        this.loaded.add(key); this.init.refreshUnits?.();
      } catch {
        this.loadError = 'Enemy could not load. Try again.';
        return;
      } finally { this.loading = false; }
    }
    const { player, field } = this.init;
    const spec = raptureSpec(key);
    const yaw = player.aimYaw, ahead = spec.tier === 'boss' ? 14 : 9;
    for (let i = 0; i < this.count; i++) {
      const spread = this.count === 1 ? 0 : (i / (this.count - 1) - .5) * Math.min(12, this.count * 1.6);
      const x = player.position.x + Math.sin(yaw) * ahead + Math.cos(yaw) * spread;
      const z = player.position.z + Math.cos(yaw) * ahead - Math.sin(yaw) * spread;
      const at = field.navigation.project({ x, z }, spec.radius);
      this.horde.spawn(key, at.x, at.z);
    }
  }

  dispose(): void {
    this.disposed = true;
    this.horde.dispose();
    this.tells.dispose();
    this.panel.remove();
  }
}
