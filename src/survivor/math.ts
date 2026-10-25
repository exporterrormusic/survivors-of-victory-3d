// Small scalar helpers shared by the survivor runtime (effects, camera, aiming, turrets).
// Files loaded directly by the Node tests (snow-field, enemy-attack, talents) keep their own copies.

export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Hermite ease of `value` from 0 at `from` to 1 at `to`, clamped. */
export function smoothstep(from: number, to: number, value: number): number {
  const t = clamp((value - from) / (to - from), 0, 1);
  return t * t * (3 - 2 * t);
}

/** An angle wrapped into [-π, π]. */
export function wrapAngle(a: number): number {
  a %= Math.PI * 2;
  if (a > Math.PI) a -= Math.PI * 2;
  if (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/** Turn the angle `from` toward `to` the short way round, by at most `max` radians. */
export function turnToward(from: number, to: number, max: number): number {
  return from + clamp(wrapAngle(to - from), -max, max);
}
