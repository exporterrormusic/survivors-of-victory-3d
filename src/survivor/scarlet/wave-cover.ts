import { SWORD_HALF_ANGLE } from './mechanics';

interface Point { x: number; y: number; z: number }
type Trace = (from: Point, to: Point, padding: number) => number | null;

/** Sweep the curved blade's full footprint, including charged width and forward lip. */
export function waveCoverContact(from: Point, to: Point, yaw: number, scale: number, trace: Trace): number | null {
  scale *= 1.35;
  let first = Infinity;
  const sin = Math.sin(yaw), cos = Math.cos(yaw);
  for (let i = 0; i <= 32; i++) {
    const u = i / 32, angle = -SWORD_HALF_ANGLE + u * 2 * SWORD_HALF_ANGLE;
    const taper = 4 * u * (1 - u);
    const inner = .96 - .32 * taper - .07 * taper;
    for (let row = 0; row <= 4; row++) {
      const radial = inner + (.975 - inner) * row / 4;
      const radius = .45 + radial * 1.65;
      const localX = Math.sin(angle) * radius * scale;
      const localZ = (Math.cos(angle) * radius - 1.25) * scale;
      const x = localX * cos + localZ * sin, z = localZ * cos - localX * sin;
      const y = .85 + Math.sin(angle) * .12;
      const contact = trace({ x: from.x + x, y: from.y + y, z: from.z + z },
        { x: to.x + x, y: to.y + y, z: to.z + z }, .10 * scale);
      if (contact !== null) first = Math.min(first, contact);
    }
  }
  return Number.isFinite(first) ? first : null;
}
