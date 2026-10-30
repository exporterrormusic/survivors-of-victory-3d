import { Vector3 } from '@babylonjs/core';
import type { KitContext } from './kit';
import type { Target } from './targets';

/** Blasts and wide attacks must not leak damage through cover at their endpoint. */
export function snowShieldsTarget(ctx: KitContext, from: Vector3, target: Target, height = .7): boolean {
  const to = new Vector3(target.position.x, target.position.y + height, target.position.z);
  return ctx.targets.navigation.traceCover(from, to) != null;
}

/** Earliest swept contact with the enemy's upright body, including its upper half.
 * A small sphere at foot height lets eye-level rockets pass through visible torsos.
 * Intersect horizontal circle and vertical slab intervals to retain true 3D misses
 * above/below enemies and order body hits against terrain/shields in the same step. */
export function targetContact(from: Vector3, to: Vector3,
  target: Pick<Target, 'position' | 'radius' | 'barHeight' | 'scale'>): number | null {
  const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
  const ox = from.x - target.position.x, oz = from.z - target.position.z;
  const radius = Math.max(.3, target.radius), c = ox * ox + oz * oz - radius * radius;
  let enter = 0, exit = 1;
  const a = dx * dx + dz * dz;
  if (a < 1e-12) { if (c > 0) return null; }
  else {
    const b = ox * dx + oz * dz, disc = b * b - a * c;
    if (disc < 0) return null;
    const root = Math.sqrt(disc);
    enter = Math.max(enter, (-b - root) / a);
    exit = Math.min(exit, (-b + root) / a);
  }
  const bottom = target.position.y, top = bottom + Math.max(.6, target.barHeight * target.scale);
  if (Math.abs(dy) < 1e-12) {
    if (from.y < bottom || from.y > top) return null;
  } else {
    const lo = (bottom - from.y) / dy, hi = (top - from.y) / dy;
    enter = Math.max(enter, Math.min(lo, hi));
    exit = Math.min(exit, Math.max(lo, hi));
  }
  return enter <= exit ? enter : null;
}

/** Swept ground-plane circle for horizontal rifle shots, like the sniper's footprint targeting.
 * Weapon height must not let a shot pass over a small ground enemy. Target.radius already
 * reflects the model size; pad is the damaging beam radius, excluding its soft glow. */
export function targetFootprintContact(from: Vector3, to: Vector3, target: Pick<Target, 'position' | 'radius'>, pad: number): number | null {
  const dx = to.x - from.x, dz = to.z - from.z;
  const ox = from.x - target.position.x, oz = from.z - target.position.z;
  const radius = target.radius + pad, c = ox * ox + oz * oz - radius * radius;
  if (c <= 0) return 0;
  const a = dx * dx + dz * dz;
  if (a < 1e-12) return null;
  const b = ox * dx + oz * dz, disc = b * b - a * c;
  if (disc < 0) return null;
  const t = (-b - Math.sqrt(disc)) / a;
  return t >= 0 && t <= 1 ? t : null;
}
