// Engine-free co-op gameplay rules the host applies: difficulty scaling, enemy target choice,
// downs and revives, and shared or per-player XP. The game loop wires these in during Phase 1.

export interface CoopPlayer { slot: number; x: number; z: number; down: boolean }

/** Multipliers on survival-round hpScale / spawnRate / aliveCap. First-pass tuning, playtest it. */
export function coopScale(playerCount: number): { hp: number; spawn: number; alive: number } {
  const extra = Math.max(0, playerCount - 1);
  return { hp: 1 + .6 * extra, spawn: 1 + .5 * extra, alive: 1 + .35 * extra };
}

/**
 * Nearest standing player, but keep the current target unless someone is clearly closer,
 * so enemies don't flicker between two players standing side by side. null when everyone is down.
 */
export function chooseTarget(x: number, z: number, players: readonly CoopPlayer[], current?: number, stickiness = 3): CoopPlayer | null {
  let best: CoopPlayer | null = null, bestDistance = Infinity, kept: CoopPlayer | null = null, keptDistance = Infinity;
  for (const player of players) {
    if (player.down) continue;
    const distance = Math.hypot(player.x - x, player.z - z);
    if (distance < bestDistance) { best = player; bestDistance = distance; }
    if (player.slot === current) { kept = player; keptDistance = distance; }
  }
  return kept && keptDistance - bestDistance < stickiness ? kept : best;
}

export const REVIVE_RADIUS = 2.5;
export const REVIVE_SECONDS = 3;
export const REVIVE_HP_SHARE = .4;

/**
 * Downed players wait (no bleed-out timer: never punish playing) and stand back up after
 * REVIVE_SECONDS with a teammate nearby; extra teammates speed it up. Progress is kept if the
 * reviver steps away. The run ends only when everyone is down.
 */
export class ReviveTracker {
  private readonly progress = new Map<number, number>();

  update(dt: number, players: readonly CoopPlayer[]): { revived: number[]; wiped: boolean } {
    const revived: number[] = [];
    const standing = players.filter(p => !p.down);
    for (const player of players) {
      if (!player.down) { this.progress.delete(player.slot); continue; }
      const helpers = standing.filter(p => Math.hypot(p.x - player.x, p.z - player.z) <= REVIVE_RADIUS).length;
      if (!helpers) continue;
      const next = (this.progress.get(player.slot) ?? 0) + dt * (1 + .5 * (helpers - 1)) / REVIVE_SECONDS;
      if (next >= 1) { this.progress.delete(player.slot); revived.push(player.slot); }
      else this.progress.set(player.slot, next);
    }
    return { revived, wiped: players.length > 0 && standing.length === 0 };
  }

  /** 0..1, for the revive ring VFX */
  progressOf(slot: number): number { return this.progress.get(slot) ?? 0; }
}

export type XpMode = 'shared' | 'split';

interface Track { level: number; xp: number }

/**
 * Round XP for the squad. 'shared': one bar, every kill feeds it, each level gives every player a
 * skill point. 'split': each player levels from their own kills. Skill points are per player either way.
 */
export class CoopXp {
  private readonly tracks = new Map<number, Track>();
  private readonly points = new Map<number, number>();

  readonly mode: XpMode;
  readonly xpToNext: (level: number) => number;
  readonly maxLevel: number;
  constructor(mode: XpMode, xpToNext: (level: number) => number, maxLevel: number) { this.mode = mode; this.xpToNext = xpToNext; this.maxLevel = maxLevel; }

  addPlayer(slot: number): void {
    if (this.points.has(slot)) return;
    this.points.set(slot, 0);
    // A player joining a shared bar gets the points it has already earned.
    if (this.mode === 'shared') this.points.set(slot, this.track(0).level - 1);
  }
  removePlayer(slot: number): void { this.points.delete(slot); if (this.mode === 'split') this.tracks.delete(slot); }

  /** Returns the slots that gained a level (once per level gained). */
  gain(slot: number, amount: number): number[] {
    const track = this.track(this.mode === 'shared' ? 0 : slot);
    const leveled: number[] = [];
    track.xp += amount;
    while (track.level < this.maxLevel && track.xp >= this.xpToNext(track.level)) {
      track.xp -= this.xpToNext(track.level);
      track.level++;
      for (const owner of this.mode === 'shared' ? this.points.keys() : [slot]) {
        this.points.set(owner, (this.points.get(owner) ?? 0) + 1);
        leveled.push(owner);
      }
    }
    if (track.level >= this.maxLevel) track.xp = 0;
    return leveled;
  }

  /** Spend one skill point; false when the player has none. */
  spend(slot: number): boolean {
    const have = this.points.get(slot) ?? 0;
    if (have <= 0) return false;
    this.points.set(slot, have - 1);
    return true;
  }

  levelOf(slot: number): number { return this.track(this.mode === 'shared' ? 0 : slot).level; }
  xpOf(slot: number): number { return this.track(this.mode === 'shared' ? 0 : slot).xp; }
  pointsOf(slot: number): number { return this.points.get(slot) ?? 0; }

  private track(key: number): Track {
    let track = this.tracks.get(key);
    if (!track) this.tracks.set(key, track = { level: 1, xp: 0 });
    return track;
  }
}
