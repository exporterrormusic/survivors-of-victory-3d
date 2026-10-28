// The survival round, after the Phaser build's run: ten minutes of a horde that grows in rate,
// size and variety, heavies as timed mini-bosses, then Obelisk (WAVE). ENDLESS runs the same
// schedule without an end: pressure keeps rising, the heavies cycle every ten minutes and Obelisk
// crashes in at each ten-minute mark while the horde keeps coming. Arrival and menus do not consume
// time. No DOM or engine imports: the Node tests load this file directly.

export const ROUND_SECONDS = 10 * 60;
export const ROUND_CORE_REWARD = 1;
export const ROUND_MAX_LEVEL = 31; // 30 SP buys all three ordered trees (10 SP each).
/** every hero's last talent tier unlocks here */
export const FINAL_TALENT_LEVEL = 20;
/** when a player on pace reaches FINAL_TALENT_LEVEL: the last minute of the run */
export const FINAL_TALENT_SECONDS = 9 * 60;
export const roundXpToNext = (level: number): number => 220 + level * 120;
export type RoundPhase = 'arrival' | 'survive' | 'boss' | 'victory' | 'defeat';

/** The basic horde: joins at `at` seconds and stays; `weight` is its share of ordinary spawns. */
export const HORDE_UNLOCKS = [
  { at: 0, key: 'lure', weight: 6 },
  { at: 0, key: 'crawler', weight: 3 },
  { at: 60, key: 'pelican', weight: 2 },
  { at: 150, key: 'capra', weight: 1.5 },
] as const;

/** Specialists: a rarer pool (SPECIALIST_SHARE of spawns) that broadens over the run. */
export const SPECIALIST_UNLOCKS = [
  { at: 120, key: 'cube' },
  { at: 210, key: 'hangedMan' },
  { at: 270, key: 'tripod' },
  { at: 330, key: 'tailBone' },
  { at: 390, key: 'squid' },
  { at: 450, key: 'seahorse' },
] as const;
export const SPECIALIST_SHARE = .12;

/** Heavies arrive as timed mini-bosses. */
export const HEAVY_SCHEDULE = [
  { at: 180, key: 'cucumber' },
  { at: 360, key: 'loudMouth' },
  { at: 510, key: 'thermite' },
] as const;
export const FINAL_BOSS = 'obelisk';

/** Banner names, one per two minutes. */
export const ROUND_WAVES = [
  { name: 'First contact' },
  { name: 'Flanking packs' },
  { name: 'Crossfire' },
  { name: 'Siege' },
  { name: 'Final surge' },
] as const;

/** 0 at the start, 1 at ten minutes, and still climbing in ENDLESS */
const progress = (elapsed: number) => Math.max(0, elapsed / ROUND_SECONDS);
/** ordinary spawns per second: 1.2 at the start, 4 at ten minutes, at most 8 */
export const spawnRate = (elapsed: number): number => Math.min(8, 1.2 + 2.8 * progress(elapsed));
/** most enemies alive at once: 35 at the start, 100 at ten minutes, at most 160 */
export const aliveCap = (elapsed: number): number => Math.min(160, Math.round(35 + 65 * progress(elapsed)));
/** enemy HP multiplier: ×2 at ten minutes, rising on in ENDLESS */
export const hpScale = (elapsed: number): number => 1 + progress(elapsed);

/**
 * The level a player on pace should be at: quick early levels, FINAL_TALENT_LEVEL at
 * FINAL_TALENT_SECONDS. The round steers XP toward it (catchUp), so kill rates that vary a lot
 * between heroes and players still land the last talent in the last waves.
 */
export const targetLevel = (elapsed: number): number =>
  1 + (FINAL_TALENT_LEVEL - 1) * Math.min(1, Math.max(0, elapsed) / FINAL_TALENT_SECONDS) ** .8;

/** XP multiplier: up to ×3.5 when behind pace, down to ×0.2 when ahead. */
export const catchUp = (level: number, xpFraction: number, elapsed: number): number => {
  const behind = targetLevel(elapsed) - (level + xpFraction);
  return Math.max(.2, Math.min(3.5, 1 + behind * .8));
};

export interface RoundEvents {
  boss: boolean;
  /** a heavy mini-boss to send in now */
  heavy: string | null;
  /** roster keys that joined the pool this frame */
  unlocked: string[];
}

export class SurvivalRound {
  phase: RoundPhase = 'arrival';
  elapsed = 0;
  private nextHeavy = 0;
  private nextBoss = ROUND_SECONDS;
  readonly endless: boolean;
  constructor(endless = false) { this.endless = endless; }
  private readonly seen = new Set<string>();
  get ended(): boolean { return this.phase === 'victory' || this.phase === 'defeat'; }
  get waveIndex(): number { return Math.min(ROUND_WAVES.length - 1, Math.floor((this.elapsed % ROUND_SECONDS) / 120)); }
  /** ENDLESS: how many ten-minute cycles are done */
  get cycle(): number { return Math.floor(this.elapsed / ROUND_SECONDS); }
  get wave(): { name: string } {
    const name = ROUND_WAVES[this.waveIndex].name;
    return this.cycle > 0 ? { name: `${name} · cycle ${this.cycle + 1}` } : { name };
  }
  get remaining(): number { return Math.max(0, ROUND_SECONDS - this.elapsed); }
  /** the basic horde available now, with weights */
  get horde() { return HORDE_UNLOCKS.filter((u) => u.at <= this.elapsed); }
  get specialists() { return SPECIALIST_UNLOCKS.filter((u) => u.at <= this.elapsed); }
  start(): void { if (this.phase === 'arrival') this.phase = 'survive'; }
  abandon(): void { if (!this.ended) this.phase = 'defeat'; }
  update(dt: number, hp: number, bossDefeated = false): RoundEvents {
    const events: RoundEvents = { boss: false, heavy: null, unlocked: [] };
    if (this.ended || dt <= 0 || !Number.isFinite(dt)) return events;
    if (hp <= 0) { this.phase = 'defeat'; return events; }
    if (this.phase === 'arrival') return events;
    this.elapsed += dt;
    if (this.phase === 'boss') {
      if (bossDefeated) this.phase = 'victory';
      return events;
    }
    if (this.elapsed >= this.nextBoss) {
      events.boss = true;
      // WAVE ends in the boss fight; ENDLESS sends Obelisk in and carries on.
      if (!this.endless) { this.phase = 'boss'; return events; }
      this.nextBoss += ROUND_SECONDS;
    }
    for (const u of [...HORDE_UNLOCKS, ...SPECIALIST_UNLOCKS]) {
      if (u.at <= this.elapsed && !this.seen.has(u.key)) { this.seen.add(u.key); if (u.at > 0) events.unlocked.push(u.key); }
    }
    // ENDLESS repeats the heavy schedule every ten minutes.
    const n = HEAVY_SCHEDULE.length, heavy = HEAVY_SCHEDULE[this.nextHeavy % n];
    const at = heavy.at + Math.floor(this.nextHeavy / n) * ROUND_SECONDS;
    if ((this.endless || this.nextHeavy < n) && this.elapsed >= at) { this.nextHeavy++; events.heavy = heavy.key; }
    return events;
  }
}
