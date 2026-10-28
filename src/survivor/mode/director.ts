// Spawn director (GAME_PLAN §9): a threat budget per second, scaled by Alert, buys whole groups
// from a weighted table within per-type caps and an alive limit. Every pulse (30 s) adds a lump
// of budget so the horde surges. It decides what spawns; pickSpawnPoint decides where.

import { HEAVY_CAP, raptureSpec } from './roster';
import { randomInt, weightedPick, type Random } from './rng';

export interface GroupMember {
  readonly type: string;
  readonly count: readonly [number, number];
}

export interface GroupDef {
  readonly key: string;
  readonly members: readonly GroupMember[];
  readonly weight: number;
  /** lowest Alert level it can be bought at */
  readonly minAlert: number;
}

export interface SpawnRequest {
  readonly group: string;
  readonly members: readonly { type: string; count: number }[];
  /** spawn the members together at one point (flocks, gun lines) */
  readonly cost: number;
}

export interface AliveCounts {
  total: number;
  byType: ReadonlyMap<string, number>;
}

export interface DirectorTuning {
  /** threat points per second at each Alert level (index 0 = Alert 1) */
  readonly budgetPerSecond: readonly number[];
  /** most enemies alive at each Alert level */
  readonly maxAlive: readonly number[];
  readonly pulseSeconds: number;
  /** a pulse adds this many seconds' worth of budget at once */
  readonly pulseBudgetSeconds: number;
  /** unspent budget is capped so a long lull can't bank a flood */
  readonly maxBankedSeconds: number;
}

export const DEFAULT_TUNING: DirectorTuning = {
  budgetPerSecond: [1.2, 1.8, 2.6, 3.4, 4.2],
  maxAlive: [40, 70, 110, 160, 220],
  pulseSeconds: 30,
  pulseBudgetSeconds: 8,
  maxBankedSeconds: 20,
};

/** Groups for the core horde and first specialists (GAME_PLAN §9 "Groups, not single units"). */
export const CORE_GROUPS: readonly GroupDef[] = [
  { key: 'swarm', members: [{ type: 'lure', count: [10, 16] }], weight: 10, minAlert: 1 },
  { key: 'gun-line', members: [{ type: 'crawler', count: [2, 4] }], weight: 6, minAlert: 1 },
  { key: 'kamikaze', members: [{ type: 'pelican', count: [2, 3] }], weight: 4, minAlert: 1 },
  { key: 'demolition', members: [{ type: 'lure', count: [8, 12] }, { type: 'pelican', count: [1, 2] }], weight: 4, minAlert: 2 },
  { key: 'shield-line', members: [{ type: 'tripod', count: [1, 1] }, { type: 'crawler', count: [3, 4] }], weight: 3, minAlert: 2 },
  { key: 'charge', members: [{ type: 'capra', count: [1, 2] }], weight: 3, minAlert: 2 },
  { key: 'heavy', members: [{ type: 'thermite', count: [1, 1] }], weight: 1, minAlert: 3 },
];

export class SpawnDirector {
  budget = 0;
  /** seconds until the next pulse */
  pulseIn: number;
  readonly groups: readonly GroupDef[];
  readonly tuning: DirectorTuning;
  private readonly random: Random;
  private readonly groupCost = new Map<string, number>();

  constructor(random: Random, groups: readonly GroupDef[] = CORE_GROUPS, tuning: DirectorTuning = DEFAULT_TUNING) {
    this.random = random;
    this.groups = groups;
    this.tuning = tuning;
    this.pulseIn = tuning.pulseSeconds;
    for (const group of groups) {
      // a group's price is its average size × each member's cost
      this.groupCost.set(group.key, group.members.reduce((sum, m) => sum + raptureSpec(m.type).cost * (m.count[0] + m.count[1]) / 2, 0));
    }
  }

  costOf(group: string): number { return this.groupCost.get(group) ?? Infinity; }

  /** Accrue budget and buy groups. `alive` is the current population; returns what to spawn now. */
  update(dt: number, alert: number, alive: AliveCounts): SpawnRequest[] {
    const out: SpawnRequest[] = [];
    if (dt <= 0) return out;
    const level = Math.max(1, Math.min(this.tuning.budgetPerSecond.length, alert));
    const rate = this.tuning.budgetPerSecond[level - 1];
    this.budget = Math.min(rate * this.tuning.maxBankedSeconds, this.budget + rate * dt);
    this.pulseIn -= dt;
    if (this.pulseIn <= 0) {
      this.pulseIn += this.tuning.pulseSeconds;
      this.budget += rate * this.tuning.pulseBudgetSeconds;
    }
    const maxAlive = this.tuning.maxAlive[Math.min(this.tuning.maxAlive.length, level) - 1];
    let total = alive.total;
    const byType = new Map(alive.byType);
    // Several cheap groups can go out in one frame after a pulse; stop at the first unaffordable pick.
    for (let guard = 0; guard < 8; guard++) {
      const room = maxAlive - total;
      const options = this.groups.filter((g) => g.minAlert <= level && this.costOf(g.key) <= this.budget && this.fits(g, byType, room));
      const group = weightedPick(this.random, options, (g) => g.weight);
      if (!group) break;
      const members = group.members.map((m) => ({ type: m.type, count: randomInt(this.random, m.count[0], m.count[1]) }));
      // Trim to the caps and the alive limit after rolling the counts.
      let spent = 0, size = 0;
      for (const m of members) {
        m.count = Math.min(m.count, this.capRoom(m.type, byType), Math.max(0, room - size));
        size += m.count;
        spent += raptureSpec(m.type).cost * m.count;
        byType.set(m.type, (byType.get(m.type) ?? 0) + m.count);
        if (raptureSpec(m.type).tier === 'heavy') byType.set('#heavy', (byType.get('#heavy') ?? 0) + m.count);
      }
      if (size === 0) break;
      total += size;
      this.budget -= spent;
      out.push({ group: group.key, members: members.filter((m) => m.count > 0), cost: spent });
    }
    return out;
  }

  private fits(group: GroupDef, byType: ReadonlyMap<string, number>, room: number): boolean {
    if (room <= 0) return false;
    // Every member must have room for at least one, or the group loses its identity.
    return group.members.every((m) => this.capRoom(m.type, byType) > 0);
  }

  private capRoom(type: string, byType: ReadonlyMap<string, number>): number {
    const spec = raptureSpec(type);
    let room = spec.cap > 0 ? spec.cap - (byType.get(type) ?? 0) : Infinity;
    if (spec.tier === 'heavy') room = Math.min(room, HEAVY_CAP - (byType.get('#heavy') ?? 0));
    return Math.max(0, room);
  }
}

export interface Point { x: number; z: number }

/** What the camera shows around the player (metres): GAME_PLAN §5 measured the default zoom. */
export interface ViewBox {
  /** half the widest visible width (the top of the screen; 19 m across at the player itself) */
  readonly halfWidth: number;
  /** visible ground above the player on screen (+z) */
  readonly ahead: number;
  /** visible ground below the player on screen (-z) */
  readonly behind: number;
}

export const DEFAULT_VIEW: ViewBox = { halfWidth: 15.6, ahead: 13.5, behind: 4.6 };

/**
 * A spawn point off screen and at least `minDistance` from the player, inside the playable area.
 * The view box is padded so units walk in from the edge rather than popping in. South spawns get
 * extra distance because the camera shows little below the player (GAME_PLAN §9).
 */
export function pickSpawnPoint(random: Random, player: Point, valid: (p: Point) => boolean,
  view: ViewBox = DEFAULT_VIEW, minDistance = 14, maxDistance = 26, tries = 24): Point | null {
  const pad = 2.5;
  for (let i = 0; i < tries; i++) {
    const angle = random() * Math.PI * 2;
    const south = Math.cos(angle) < -.3;
    const distance = minDistance + (south ? 4 : 0) + random() * (maxDistance - minDistance);
    const p = { x: player.x + Math.sin(angle) * distance, z: player.z + Math.cos(angle) * distance };
    const dx = p.x - player.x, dz = p.z - player.z;
    const onScreen = Math.abs(dx) < view.halfWidth + pad && dz < view.ahead + pad && dz > -(view.behind + pad);
    if (!onScreen && valid(p)) return p;
  }
  return null;
}
