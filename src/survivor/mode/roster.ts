// The 22 Outpost Raptures as game-mode enemies: tier, role and first-pass numbers from
// docs/GAME_PLAN.md §7. Sizes come from measuring every clip on /tools/review/rapture-review.html
// (height, horizontal reach, the lift that keeps standing poses on the floor).
// HP and damage are base values (difficulty 1, first sortie) before zone/difficulty scaling.

/** 'archive': kept and loadable in the Lab, but nothing spawns it yet */
export type Tier = 'horde' | 'specialist' | 'heavy' | 'boss' | 'archive';
export type Role =
  | 'swarmer' | 'gunner' | 'charger' | 'exploder'
  | 'spotter' | 'shielder' | 'sniper' | 'mortar' | 'diver' | 'skirmisher' | 'emplacement' | 'spinner' | 'jammer' | 'gunship'
  | 'carrier' | 'incinerator' | 'bombard' | 'howler'
  | 'boss';
/** ground units route around terrain; hover and flying units ignore it */
export type Mobility = 'ground' | 'hover' | 'flying';

export interface RaptureSpec {
  /** roster key, e.g. 'lure' */
  readonly key: string;
  /** model id in public/raptures/ */
  readonly model: string;
  readonly name: string;
  readonly tier: Tier;
  readonly role: Role;
  readonly mobility: Mobility;
  readonly hp: number;
  /** m/s; Snow White runs at 6 */
  readonly speed: number;
  /** damage of its main hit */
  readonly damage: number;
  /** what the spawn director pays for one; 0 = scripted only (bosses) */
  readonly cost: number;
  /** most alive at once; 0 = no cap */
  readonly cap: number;
  /** distance it tries to hold from the player, metres */
  readonly range: number;
  readonly radius: number;
  readonly modelLift: number;
  /** model scale; radius and height below are already at this size */
  readonly size?: number;
  /** walk-cycle rate at full speed (faster or smaller than the clip was made for), default 1 */
  readonly stride?: number;
  /** tallest animated point, metres */
  readonly height: number;
  /** kill XP (not wired to Run yet, which awards a flat amount) */
  readonly xp: number;
}

const r = (spec: RaptureSpec) => spec;

export const ROSTER = {
  // --- horde -------------------------------------------------------------------------
  lure: r({ key: 'lure', model: 'bma002', name: 'Lure', tier: 'horde', role: 'swarmer', mobility: 'hover', hp: 6, speed: 3.2, damage: 4, cost: 1, cap: 0, range: .8, radius: .43, modelLift: .04, size: .5, height: 1.13, xp: 6 }),
  crawler: r({ key: 'crawler', model: 'mmg005', name: 'Crawler', tier: 'horde', role: 'gunner', mobility: 'ground', hp: 12, speed: 3.6, damage: 4, cost: 2, cap: 0, range: 10, radius: .88, modelLift: .05, size: .8, stride: 1.75, height: 1.85, xp: 8 }),
  pelican: r({ key: 'pelican', model: 'bmg001', name: 'Pelican', tier: 'horde', role: 'exploder', mobility: 'ground', hp: 10, speed: 4.4, damage: 16, cost: 2, cap: 0, range: 2.5, radius: .78, modelLift: .07, size: .65, height: 1.56, xp: 8 }),
  capra: r({ key: 'capra', model: 'beg003', name: 'Capra', tier: 'horde', role: 'charger', mobility: 'ground', hp: 75, speed: 2.8, damage: 14, cost: 4, cap: 0, range: 11, radius: 1.09, modelLift: .03, height: 2.05, xp: 14 }),
  // --- specialists ---------------------------------------------------------------------
  cube: r({ key: 'cube', model: 'emg003', name: 'Cube', tier: 'specialist', role: 'spotter', mobility: 'ground', hp: 20, speed: 2.4, damage: 12, cost: 6, cap: 2, range: 17, radius: 1.22, modelLift: .07, height: 2.37, xp: 20 }),
  seahorse: r({ key: 'seahorse', model: 'xma003', name: 'Seahorse', tier: 'specialist', role: 'sniper', mobility: 'hover', hp: 14, speed: 2, damage: 16, cost: 6, cap: 3, range: 24, radius: .6, modelLift: 0, height: 2.35, xp: 20 }),
  tripod: r({ key: 'tripod', model: 'eea002', name: 'Tripod', tier: 'specialist', role: 'shielder', mobility: 'hover', hp: 60, speed: 1.8, damage: 10, cost: 6, cap: 3, range: 2.5, radius: 1.18, modelLift: .18, height: 3.93, xp: 24 }),
  hangedMan: r({ key: 'hangedMan', model: 'xea003', name: 'Hanged Man', tier: 'specialist', role: 'diver', mobility: 'flying', hp: 18, speed: 5, damage: 14, cost: 5, cap: 4, range: 10, radius: .76, modelLift: .02, height: 2.33, xp: 18 }),
  tailBone: r({ key: 'tailBone', model: 'bea001', name: 'Tail Bone', tier: 'specialist', role: 'spinner', mobility: 'hover', hp: 26, speed: 2.2, damage: 4, cost: 6, cap: 2, range: 9, radius: .85, modelLift: .33, height: 2.39, xp: 22 }),
  squid: r({ key: 'squid', model: 'ema002', name: 'Squid', tier: 'specialist', role: 'jammer', mobility: 'hover', hp: 35, speed: 2.4, damage: 0, cost: 7, cap: 2, range: 12, radius: .6, modelLift: .04, height: 3.13, xp: 24 }),
  // --- heavies (mini-bosses) --------------------------------------------------------------
  thermite: r({ key: 'thermite', model: 'mcg002', name: 'Thermite', tier: 'heavy', role: 'incinerator', mobility: 'ground', hp: 600, speed: 2.2, damage: 8, cost: 35, cap: 2, range: 6, radius: 1.57, modelLift: .11, height: 4.45, xp: 350 }),
  cucumber: r({ key: 'cucumber', model: 'bcg001', name: 'Cucumber', tier: 'heavy', role: 'bombard', mobility: 'ground', hp: 700, speed: 1.8, damage: 14, cost: 40, cap: 2, range: 17, radius: 2.13, modelLift: .07, height: 4.67, xp: 400 }),
  loudMouth: r({ key: 'loudMouth', model: 'ecg001', name: 'Loud Mouth', tier: 'heavy', role: 'howler', mobility: 'ground', hp: 800, speed: 2, damage: 12, cost: 45, cap: 2, range: 9, radius: 2.52, modelLift: .04, height: 5.07, xp: 450 }),
  // --- bosses ----------------------------------------------------------------------------
  obelisk: r({ key: 'obelisk', model: 'eca001', name: 'Obelisk', tier: 'boss', role: 'boss', mobility: 'hover', hp: 3500, speed: 1.2, damage: 20, cost: 0, cap: 1, range: 8, radius: 1.48, modelLift: .03, height: 6.1, xp: 1500 }),
  cocytus: r({ key: 'cocytus', model: 'bca001', name: 'Cocytus', tier: 'boss', role: 'boss', mobility: 'flying', hp: 4500, speed: 3, damage: 18, cost: 0, cap: 1, range: 12, radius: 6.16, modelLift: 3.29, height: 8.08, xp: 1800 }),
  sinister: r({ key: 'sinister', model: 'mca001', name: 'Sinister', tier: 'boss', role: 'boss', mobility: 'flying', hp: 6000, speed: 1, damage: 35, cost: 0, cap: 1, range: 20, radius: 6.67, modelLift: .2, height: 17.32, xp: 3000 }),
  // --- archive: no current use; Lab only -------------------------------------------------
  phalanx: r({ key: 'phalanx', model: 'xmg001', name: 'Phalanx', tier: 'archive', role: 'mortar', mobility: 'hover', hp: 50, speed: 1.6, damage: 10, cost: 7, cap: 3, range: 20, radius: .95, modelLift: .02, height: 3.01, xp: 20 }),
  twinTail: r({ key: 'twinTail', model: 'meg006', name: 'Twin Tail', tier: 'archive', role: 'skirmisher', mobility: 'ground', hp: 40, speed: 4.2, damage: 10, cost: 6, cap: 4, range: 10.5, radius: 1.19, modelLift: .03, height: 2.44, xp: 22 }),
  sentry: r({ key: 'sentry', model: 'eeg003', name: 'Sentry', tier: 'archive', role: 'emplacement', mobility: 'ground', hp: 70, speed: 2, damage: 3, cost: 8, cap: 2, range: 14, radius: 1.19, modelLift: .06, height: 3.02, xp: 26 }),
  penetrator: r({ key: 'penetrator', model: 'mea001', name: 'Penetrator', tier: 'archive', role: 'gunship', mobility: 'flying', hp: 55, speed: 3, damage: 12, cost: 8, cap: 2, range: 10, radius: 1.24, modelLift: .24, height: 2.81, xp: 26 }),
  hardHat: r({ key: 'hardHat', model: 'mma001', name: 'Hard Hat', tier: 'archive', role: 'carrier', mobility: 'hover', hp: 450, speed: 2, damage: 16, cost: 30, cap: 2, range: 8, radius: 1.49, modelLift: 0, height: 4.15, xp: 300 }),
  solaris: r({ key: 'solaris', model: 'xeg006', name: 'Solaris', tier: 'archive', role: 'exploder', mobility: 'ground', hp: 16, speed: 4.2, damage: 18, cost: 3, cap: 0, range: 2.5, radius: .98, modelLift: .02, height: 2.37, xp: 10 }),
} as const satisfies Record<string, RaptureSpec>;

export type RaptureKey = keyof typeof ROSTER;
export const RAPTURE_KEYS = Object.keys(ROSTER) as RaptureKey[];

/** Heavies share one cap outside boss fights (GAME_PLAN §6). */
export const HEAVY_CAP = 2;

export function raptureSpec(key: string): RaptureSpec {
  const spec = (ROSTER as Record<string, RaptureSpec>)[key];
  if (!spec) throw new Error(`Unknown Rapture "${key}"`);
  return spec;
}
