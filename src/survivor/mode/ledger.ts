// What the player carries on this trip versus what is banked (GAME_PLAN §10). Carried loot is
// banked on extraction and lost on death; XP and levels are never at risk (Run owns those).

import { FieldKitStacks, rollFieldKit, type FieldKitId } from './field-kits';
import type { SiteKind } from './sites';
import { randomInt, type Random } from './rng';

export interface Purse {
  credits: number;
  salvage: number;
  /**
   * NIPMH modules found, resolved against the catalog when banked. Dormant: NIPMH is switched off
   * for the first version (src/features.ts), so no module cases are placed and this stays 0.
   */
  modules: number;
  pristineCores: number;
}

const emptyPurse = (): Purse => ({ credits: 0, salvage: 0, modules: 0, pristineCores: 0 });

export interface Loot {
  credits?: number;
  salvage?: number;
  modules?: number;
  pristineCores?: number;
  fieldKit?: FieldKitId;
  /** fraction of max HP restored right away */
  heal?: number;
}

export class Ledger {
  carried: Purse = emptyPurse();
  readonly banked: Purse;
  readonly kits = new FieldKitStacks();

  constructor(banked: Purse = emptyPurse()) {
    this.banked = banked;
  }

  /** Take loot into the carried purse; field kits stack (a maxed kit is wasted). */
  take(loot: Loot): void {
    this.carried.credits += loot.credits ?? 0;
    this.carried.salvage += loot.salvage ?? 0;
    this.carried.modules += loot.modules ?? 0;
    this.carried.pristineCores += loot.pristineCores ?? 0;
    if (loot.fieldKit) this.kits.add(loot.fieldKit);
  }

  /** Extraction: move everything carried into the bank. Field kits end with the trip. */
  bank(): Purse {
    const moved = this.carried;
    this.banked.credits += moved.credits;
    this.banked.salvage += moved.salvage;
    this.banked.modules += moved.modules;
    this.banked.pristineCores += moved.pristineCores;
    this.carried = emptyPurse();
    this.kits.clear();
    return moved;
  }

  /** Death: lose what was carried and the field kits. */
  lose(): Purse {
    const lost = this.carried;
    this.carried = emptyPurse();
    this.kits.clear();
    return lost;
  }
}

/** Loot for working a site (GAME_PLAN §3). Shafts, terminals and scramblers give effects, not loot. */
export function rollSiteLoot(kind: SiteKind, random: Random, kits: FieldKitStacks): Loot {
  const kit = () => rollFieldKit(random, kits) ?? undefined;
  switch (kind) {
    case 'cache': {
      const loot: Loot = { credits: randomInt(random, 40, 80), salvage: randomInt(random, 1, 2) };
      if (random() < .3) loot.fieldKit = kit();
      if (random() < .25) loot.heal = .4;
      return loot;
    }
    case 'priority': return { credits: 60, salvage: 3 };
    case 'wreck': return { credits: 150, salvage: randomInt(random, 4, 6), fieldKit: kit() };
    case 'module': return { modules: 1 };
    case 'med': return { heal: .5 };
    case 'terminal': return { credits: 30 };
    default: return {};
  }
}
