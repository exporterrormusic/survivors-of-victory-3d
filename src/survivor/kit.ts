// What a playable NIKKE supplies to the survivor runtime. The shared Player handles movement,
// dash, magazine, reload and the Burst gauge; a kit supplies what its weapon, Special and Burst
// do and look like (src/survivor/<character>/). Numbers follow Survivors of Victory's CombatData.

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
}

export interface SpecialState {
  charges: number;
  maxCharges: number;
  /** recharge progress of the next charge, 0..1 (1 when full) */
  progress: number;
}

/** Everything a kit can reach. */
export interface KitContext {
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
}

export interface CharacterKit {
  readonly weapon: WeaponSpec;
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
  special(): SpecialState;
  /** E with a full gauge, aimed along `yaw` from `origin`. */
  useBurst(origin: Vector3, yaw: number, charge?: number): void;
  update(dt: number): void;
}
