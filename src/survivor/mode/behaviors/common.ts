// Helpers shared by the role behaviors.

import { Vector3 } from '@babylonjs/core';
import type { Target } from '../../targets';
import type { Rgb } from '../../vfx';
import { energyBlast } from './energy';
import type { BehaviorContext } from './types';

export const PLAYER_RADIUS = .45;
/** red eye/muzzle flare: about to attack. Every Rapture attack reads red. */
export const FLARE: Rgb = [3.4, .3, .32];
export const BLAST: Rgb = [1, .12, .1];

export const flatDistance = (a: Vector3, b: Vector3) => Math.hypot(a.x - b.x, a.z - b.z);

/**
 * Where to drop the `n`th follow-up shot of a predicted volley, `ahead` seconds along the player's
 * path. A player standing still or barely moving would stack every shot on one spot, so those
 * shots fan out around them instead, `spread` metres per step, on alternating sides of `angle`.
 */
export function leadSpot(ctx: BehaviorContext, n: number, ahead: number, angle: number, spread = 2.6): { x: number; z: number } {
  const p = ctx.player.position, v = ctx.player.motion;
  const led = Math.hypot(v.x, v.z) * ahead;
  if (led >= spread * n) return { x: p.x + v.x * ahead, z: p.z + v.z * ahead };
  const a = angle + (n % 2 ? 0 : Math.PI) + n * .4, r = spread * Math.ceil(n / 2) + .4;
  return { x: p.x + Math.cos(a) * r, z: p.z + Math.sin(a) * r };
}

/** No cover between the two points at chest height. */
export function clearShot(ctx: BehaviorContext, from: Vector3, to: Vector3): boolean {
  return ctx.field.navigation.traceCover({ x: from.x, y: 1.1, z: from.z }, { x: to.x, y: 1.1, z: to.z }) == null;
}

/** Area blast: hurts the player inside `radius`. Raptures are one team, so it never hurts them. */
export function detonate(ctx: BehaviorContext, at: Vector3, radius: number, playerDamage: number): void {
  if (flatDistance(at, ctx.player.position) <= radius + PLAYER_RADIUS * .5) ctx.player.takeDamage(playerDamage);
  blastFx(ctx, at, radius);
}

/** The look of every Rapture area hit: a hard red ring on the ground, an energy dome and sparks. */
export function blastFx(ctx: BehaviorContext, at: Vector3, radius: number): void {
  const up = at.add(new Vector3(0, .8, 0));
  ctx.tells.blast(at.x, at.z, radius);
  energyBlast(ctx.vfx, at, radius);
  ctx.vfx.flashSprite(up, FLARE, radius * .4, .15, .9, 'star');
  ctx.vfx.sparks(up, 14, BLAST, FLARE, 7);
}
