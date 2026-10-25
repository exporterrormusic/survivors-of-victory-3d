// The sortie's threat clock (GAME_PLAN §2): Alert 1–5 rises with time only. Nothing the player
// does raises it; a scrambler or a Hunter kill lowers it by one level, keeping partial progress.

export const ALERT_NAMES = ['Quiet', 'Aware', 'Hunting', 'Swarming', 'Hunted'] as const;
export const MAX_ALERT = 5;

export class AlertClock {
  /** seconds of Alert progress; level n starts at (n - 1) × interval */
  progress = 0;
  /** seconds per level */
  interval: number;
  /** 1 = normal; large sectors rise more slowly (0.85) */
  rate = 1;

  constructor(interval = 90) {
    this.interval = interval;
  }

  get level(): number {
    return Math.min(MAX_ALERT, 1 + Math.floor(this.progress / this.interval));
  }

  get name(): string { return ALERT_NAMES[this.level - 1]; }

  /** 0..1 through the current level; 1 at the top level */
  get fraction(): number {
    if (this.level >= MAX_ALERT) return 1;
    return (this.progress % this.interval) / this.interval;
  }

  /** seconds until the next level, or Infinity at the top */
  get nextIn(): number {
    if (this.level >= MAX_ALERT) return Infinity;
    return (this.interval - (this.progress % this.interval)) / this.rate;
  }

  /** Advance; returns the new level when it changed, else 0. */
  update(dt: number): number {
    if (dt <= 0) return 0;
    const before = this.level;
    this.progress = Math.min((MAX_ALERT - 1) * this.interval, this.progress + dt * this.rate);
    const after = this.level;
    return after !== before ? after : 0;
  }

  /** Drop by whole levels, keeping progress within the level. Returns the new level. */
  lower(levels = 1): number {
    this.progress = Math.max(0, this.progress - levels * this.interval);
    return this.level;
  }
}
