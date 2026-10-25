// Helpers shared by the role behaviors.

import { Vector3 } from '@babylonjs/core';
import type { Target } from '../../targets';
import type { Rgb } from '../../vfx';
import type { BehaviorContext } from './types';

export const PLAYER_RADIUS = .45;
/** yellow eye/muzzle flare: about to attack (GAME_PLAN §6) */
export const FLARE: Rgb = [3.2, 2.1, .5];
export const BLAST: Rgb = [1, .45, .12];

export const flatDistance = (a: Vector3, b: Vector3) => Math.hypot(a.x - b.x, a.z - b.z);

/** No cover between the two points at chest height. */
export function clearShot(ctx: BehaviorContext, from: Vector3, to: Vector3): boolean {
  return ctx.field.navigation.traceCover({ x: from.x, y: 1.1, z: from.z }, { x: to.x, y: 1.1, z: to.z }) == null;
}

/** Area blast: hurts the player inside `radius` and every Rapture in it (credited to the player). */
export function detonate(ctx: BehaviorContext, at: Vector3, radius: number, playerDamage: number, raptureDamage: number, source?: Target): void {
  if (flatDistance(at, ctx.player.position) <= radius + PLAYER_RADIUS * .5) ctx.player.takeDamage(playerDamage);
  for (const other of ctx.field.inRadius(at, radius)) if (other !== source) ctx.run.damage(other, raptureDamage, 'effect');
  const up = at.add(new Vector3(0, .8, 0));
  ctx.vfx.flashSprite(up, BLAST, radius * .75, .35, 1, 'fireball');
  ctx.vfx.ring(at, BLAST, .4, radius, .35, .9);
  ctx.vfx.sparks(up, 14, BLAST, FLARE, 7);
}
