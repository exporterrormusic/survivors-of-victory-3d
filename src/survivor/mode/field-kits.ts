// Field kits (GAME_PLAN §10): small boosts found on the surface that last until you extract or
// die. They give each trip its own climb now that the build itself is permanent. Fixed pickups,
// not random card choices; each stacks up to three.

export type FieldKitId = 'extendedMag' | 'hotLoads' | 'critChip' | 'quickHands' | 'turretParts' | 'burstCell';

export interface FieldKitSpec {
  readonly id: FieldKitId;
  readonly name: string;
  /** short effect line for the HUD tooltip and results */
  readonly effect: string;
  /** HUD icon name (drawn by the mode HUD) */
  readonly icon: string;
  readonly maxStacks: number;
}

export const FIELD_KITS: Readonly<Record<FieldKitId, FieldKitSpec>> = {
  extendedMag: { id: 'extendedMag', name: 'Extended Mag', effect: '+2 rounds', icon: 'mag', maxStacks: 3 },
  hotLoads: { id: 'hotLoads', name: 'Hot Loads', effect: '+10% damage', icon: 'flame', maxStacks: 3 },
  critChip: { id: 'critChip', name: 'Crit Chip', effect: '+5% crit', icon: 'chip', maxStacks: 3 },
  quickHands: { id: 'quickHands', name: 'Quick Hands', effect: '-15% reload', icon: 'hand', maxStacks: 3 },
  turretParts: { id: 'turretParts', name: 'Turret Parts', effect: '+1 Special charge', icon: 'turret', maxStacks: 3 },
  burstCell: { id: 'burstCell', name: 'Burst Cell', effect: '+15% Burst gain', icon: 'cell', maxStacks: 3 },
};

export const FIELD_KIT_IDS = Object.keys(FIELD_KITS) as FieldKitId[];

/** The stats field kits touch. Kits without a matching stat simply ignore it. */
export interface CombatStats {
  damage: number;
  magazine: number;
  /** seconds */
  reload: number;
  moveSpeed: number;
  critChance: number;
  burstPerHit: number;
  specialCharges: number;
}

export class FieldKitStacks {
  private readonly stacks = new Map<FieldKitId, number>();
  /** kits that can drop; a character whose kit can't use one (no Special charges) leaves it out */
  allowed: readonly FieldKitId[] = FIELD_KIT_IDS;

  count(id: FieldKitId): number { return this.stacks.get(id) ?? 0; }

  /** Add one stack; false when that kit is already at its maximum. */
  add(id: FieldKitId): boolean {
    const n = this.count(id);
    if (n >= FIELD_KITS[id].maxStacks) return false;
    this.stacks.set(id, n + 1);
    return true;
  }

  clear(): void { this.stacks.clear(); }

  get total(): number {
    let n = 0;
    for (const v of this.stacks.values()) n += v;
    return n;
  }

  entries(): { id: FieldKitId; count: number }[] {
    return FIELD_KIT_IDS.filter((id) => this.count(id) > 0).map((id) => ({ id, count: this.count(id) }));
  }

  /** Base stats with every stack applied. Multipliers stack additively per kit (3 × 10% = +30%). */
  apply(base: CombatStats): CombatStats {
    return {
      damage: base.damage * (1 + .1 * this.count('hotLoads')),
      magazine: base.magazine + 2 * this.count('extendedMag'),
      reload: base.reload * Math.max(.4, 1 - .15 * this.count('quickHands')),
      moveSpeed: base.moveSpeed,
      critChance: Math.min(1, base.critChance + .05 * this.count('critChip')),
      burstPerHit: base.burstPerHit * (1 + .15 * this.count('burstCell')),
      specialCharges: base.specialCharges + this.count('turretParts'),
    };
  }
}

/** A random allowed kit that isn't maxed yet, or null when everything is. */
export function rollFieldKit(random: () => number, stacks: FieldKitStacks): FieldKitId | null {
  const open = stacks.allowed.filter((id) => stacks.count(id) < FIELD_KITS[id].maxStacks);
  return open.length ? open[Math.floor(random() * open.length)] : null;
}
