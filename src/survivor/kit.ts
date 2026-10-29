// What a playable NIKKE supplies to the survivor runtime. The shared Player handles movement,
// dash, magazine, reload and the Burst gauge; a kit supplies what its weapon, Special and Burst
// do and look like (src/survivor/<character>/). Numbers follow Survivors of Victory's CombatData.

import type { Chibi } from '../chibi';
import type { Scene, ShadowGenerator, Vector3 } from '@babylonjs/core';
import type { Cue } from '../audio/sound-bank';
import type { SurvivorCamera } from './camera';
import type { Run } from './run';
import type { TargetField } from './targets';
import type { Vfx } from './vfx';
import type { SnowField } from './snow-field';

/** Pixels-per-metre used to bring Survivors' 2D distances and speeds into the 3D world. */
export const PX = 1 / 80;

export interface WeaponSpec {
  /** base damage per hit (CombatData baseDamage) */
  damage: number;
  magazine: number;
  /** seconds */
  reload: number;
  /** seconds between shots */
  cooldown: number;
  /** hold to keep firing; otherwise one shot per click */
  automatic: boolean;
  /** m/s */
  moveSpeed: number;
  maxHp: number;
  melee?: boolean;
}

export interface SpecialState {
  available?: boolean;
  label?: string;
  hint?: string;
  /** Held special charge, normalized; null/absent when not charging. */
  charge?: number | null;
  charges: number;
  maxCharges: number;
  /** recharge progress of the next charge, 0..1 (1 when full) */
  progress: number;
}

/** Everything a kit can reach. */
export interface KitContext {
  playerModel?: Chibi;
  readonly scene: Scene;
  readonly shadows: ShadowGenerator;
  readonly vfx: Vfx;
  readonly targets: TargetField;
  readonly run: Run;
  readonly camera: SurvivorCamera;
  /** Shared terrain collision for every projectile, beam and blast. */
  readonly snow?: SnowField;
  /** Play a sound at a world position. */
  sound(cue: Cue, at: Vector3, gain?: number): void;
  /** The player's feet. */
  readonly playerPosition: Vector3;
  /** The gun tip this frame (after the torso is aimed), for effects that stay on the muzzle. */
  muzzle(out: Vector3): Vector3;
  heal(amount: number): void;
  readonly hp?: number;
  /** current maximum health (grows with level for talent-tier heroes) */
  readonly maxHp?: number;
  readonly aimYaw?: number;
  readonly aimPoint?: Vector3;
  setHp?(hp: number): void;
  teleport?(position: Vector3): void;
  invulnerable?(seconds: number, translucent?: boolean): void;
  /** Block a share (0..1) of incoming damage for `seconds`. */
  resist?(share: number, seconds: number): void;
  /** Put one round back in the magazine (Quick Hands). */
  refundRound?(): void;
  afterimage?(color: readonly [number, number, number]): void;
}

export interface CharacterKit {
  readonly insightDisplay?: { stacks:number; seconds:number; duration:number; damage:number; speed:number; meditating:boolean; regular:number; mature:number; silver:number; armySeconds:number };
  /** Passive receives the shared player's complete-idle state. */
  setMeditating?(active: boolean): void;
  readonly meditateWhileCommanding?: boolean;
  /** False for weapon-only prototypes whose Burst is not designed yet. */
  readonly burstAvailable?: boolean;
  readonly presentationLift?: number;
  /** Ability-driven movement, still swept against terrain by Player. Weapons stay usable. */
  specialMovement?(dt: number): Vector3 | null;
  afterPlayerAnimation?(): void;
  /** Temporarily hide auxiliary models and poses during story cutscenes. */
  setCutscenePresentation?(active: boolean): void;
  readonly blocksWeapon?: boolean;
  readonly burstActionReady?: boolean;
  readonly burstLabel?: string;
  continueBurst?(): void;
  readonly unlimitedAmmo?: boolean;
  readonly burstActive?: boolean;
  readonly status?: string;
  /** Staff users look toward the cursor; their carried weapon axis is not their facing. */
  readonly aimFacing?: 'head' | 'weapon';
  /** Pick the ground under the cursor and preserve that endpoint, including close shots. */
  readonly groundTargeted?: boolean;
  readonly weapon: WeaponSpec;
  /** picks talents by tier (src/survivor/talent-tiers.ts) instead of buying ordered ranks */
  readonly talentTiers?: boolean;
  /** Character-specific dodge tuning; omitted kits use the shared default. */
  readonly dash?: { speed: number; duration: number; afterimageInterval: number; cooldown?: number };
  readonly specialName: string;
  readonly burstName: string;
  /** squad or manufacturer, shown above the name in the HUD */
  readonly affiliation: string;
  /** dash afterimages and other shared effects take this colour */
  readonly accent: readonly [number, number, number];
  readonly reloadSound?: Cue;
  /** HUD card icons (src/survivor/hud.ts ICONS) */
  readonly icons: { weapon: string; special: string; dash: string };
  /** One weapon shot from the gun tip toward `aim` (a point at muzzle height). */
  fire(muzzle: Vector3, aim: Vector3, charge?: number): void;
  /** Right mouse. Returns false if it couldn't be used (no charge). */
  useSpecial(): boolean;
  cancelSpecial?(): void;
  /** Clear persistent ability state immediately on death. */
  onDeath?(): void;
  /** Ignore unit separation while airborne, including the landing frame. */
  readonly throughEnemies?: boolean;
  /** Ability-owned immunity; ends immediately with the ability. */
  readonly invulnerable?: boolean;
  chargeSpecial?(dt: number, held: boolean, released: boolean): void;
  onDash?(): void;
  readonly dashThroughEnemies?: boolean;
  readonly busy?: boolean;
  readonly freezesEnemies?: boolean;
  parry?(from: Vector3, to: Vector3): number;
  special(): SpecialState;
  /** E with a full gauge, aimed along `yaw` from `origin`. */
  useBurst(origin: Vector3, yaw: number, charge?: number): void;
  previewCharge?(weapon: number | null, burst: number | null, yaw: number): void;
  update(dt: number): void;
  /** Build pooled models and compile effect shaders while the loading screen is up. */
  prepare?(): Promise<void>;
  /** Release kit-owned summons when a teammate leaves or the scene closes. */
  dispose?(): void;
}
