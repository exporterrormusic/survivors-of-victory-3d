import { Vector3 } from '@babylonjs/core';
import type { KitContext } from './kit';
import type { Target } from './targets';

/** Blasts and wide attacks must not leak damage through cover at their endpoint. */
export function snowShieldsTarget(ctx: KitContext, from: Vector3, target: Target, height = .7): boolean {
  const to = new Vector3(target.position.x, target.position.y + height, target.position.z);
  return ctx.targets.navigation.traceCover(from, to) != null;
}

/** Earliest swept sphere contact, used to order rocket/target and terrain hits. */
export function targetContact(from: Vector3, to: Vector3, target: Target): number | null {
  const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
  const ox = from.x - target.position.x, oy = from.y - target.position.y - .7, oz = from.z - target.position.z;
  const radius = Math.max(.3, target.radius * .65), c = ox * ox + oy * oy + oz * oz - radius * radius;
  if (c <= 0) return 0;
  const a = dx * dx + dy * dy + dz * dz;
  if (a < 1e-12) return null;
  const b = ox * dx + oy * dy + oz * dz, disc = b * b - a * c;
  if (disc < 0) return null;
  const t = (-b - Math.sqrt(disc)) / a;
  return t >= 0 && t <= 1 ? t : null;
}
