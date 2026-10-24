// Timed conditions on any unit (hero, lane minion or summon). Like HotS, effects of one kind do
// not stack: the strongest amount and the longest remaining time win, and re-applying refreshes.
import type { StatusKind, StatusSpec } from './types';

interface Active {
  left: number;
  amount: number;
}

/** Most visible first. Shields use the health-bar overlay instead of a status marker. */
const SHOWN_ORDER: readonly Exclude<StatusKind, 'shield'>[] = ['stun', 'root', 'invulnerable', 'fortify', 'vulnerable', 'slow', 'burn', 'frenzy', 'empower', 'haste'];

export class StatusSet {
  private readonly active = new Map<StatusKind, Active>();

  apply(spec: StatusSpec): void {
    const amount = spec.amount ?? 0;
    const current = this.active.get(spec.kind);
    if (!current) this.active.set(spec.kind, { left: spec.duration, amount });
    else {
      current.left = Math.max(current.left, spec.duration);
      current.amount = Math.max(current.amount, amount);
    }
  }

  /** Advance the timers. Returns the burn damage taken over `dt`. */
  update(dt: number): number {
    let burn = 0;
    for (const [kind, status] of this.active) {
      if (kind === 'burn') burn += status.amount * Math.min(dt, status.left);
      status.left -= dt;
      if (status.left <= 0) this.active.delete(kind);
    }
    return burn;
  }

  has(kind: StatusKind): boolean {
    return this.active.has(kind);
  }

  clear(): void {
    this.active.clear();
  }

  /** Damage left after the shield soaks what it can. */
  absorb(damage: number): number {
    const shield = this.active.get('shield');
    if (!shield || damage <= 0) return damage;
    const soaked = Math.min(shield.amount, damage);
    shield.amount -= soaked;
    if (shield.amount <= 0) this.active.delete('shield');
    return damage - soaked;
  }

  /** Hit points of shield remaining. */
  get shield(): number {
    return this.active.get('shield')?.amount ?? 0;
  }

  /** No moving, attacking or casting. */
  get stunned(): boolean {
    return this.active.has('stun');
  }

  /** Movement multiplier: 0 while stunned or rooted. */
  get speedFactor(): number {
    if (this.active.has('stun') || this.active.has('root')) return 0;
    return (1 - Math.min(0.9, this.amount('slow'))) * (1 + this.amount('haste'));
  }

  /** Attack-rate multiplier. */
  get attackSpeed(): number {
    return 1 + this.amount('frenzy');
  }

  /** Damage-dealt multiplier. */
  get damageDealt(): number {
    return 1 + this.amount('empower');
  }

  /** Damage-taken multiplier: 0 while invulnerable. */
  get damageTaken(): number {
    if (this.active.has('invulnerable')) return 0;
    return (1 + this.amount('vulnerable')) * (1 - Math.min(0.9, this.amount('fortify')));
  }

  /** The most visible condition, for markers and labels. */
  get shown(): Exclude<StatusKind, 'shield'> | null {
    for (const kind of SHOWN_ORDER) if (this.active.has(kind)) return kind;
    return null;
  }

  private amount(kind: StatusKind): number {
    return this.active.get(kind)?.amount ?? 0;
  }
}
