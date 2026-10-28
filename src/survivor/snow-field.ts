/** World-space snow data shared by rendering and locomotion. No renderer dependency. */
export interface SnowPoint { x: number; z: number }
export interface SnowPoint3 extends SnowPoint { y: number }
export interface SnowBounds { minX: number; minZ: number; width: number; depth: number }
export interface SnowFieldOptions {
  bounds: SnowBounds;
  resolution?: number;
  /** Metres of fresh snow. Return zero for uncovered ground / holes. */
  depthAt: (x: number, z: number) => number;
  blockingDepth?: number;
  /** Permanent holes, retained across preset changes and snowfall refill. */
  excludeAt?: (x: number, z: number) => boolean;
  /** Supporting floor elevation; shared by the overlay and projectile collision. */
  heightAt?: (x: number, z: number) => number;
}

export const MAX_SNOW_DEPTH = 2;
export const SNOW_PRESETS = { off: 'Off', powder: 'Light powder', deep: 'Deep snow', drifts: 'Mixed drifts + banks' } as const;
export type SnowPreset = keyof typeof SNOW_PRESETS;
export type SnowPrintShape = 'boot' | 'spike' | 'hook';
export interface SnowTrack { shape: SnowPrintShape; distance: number; phase: number; revision: number; scale: number }
export const createSnowTrack = (shape: SnowPrintShape = 'boot', scale = 1): SnowTrack => ({ shape, distance: 0, phase: 0, revision: -1, scale });
/** Explicit contact profiles: unknown/hovering rigs never inherit humanoid prints. */
export const RAPTURE_SNOW_CONTACTS: Readonly<Record<string, SnowPrintShape | null>> = {
  bma002: null, // Lure: hovering body, no grounded foot sockets
  mmg005: 'spike', // Crawler: four pointed mechanical feet
  bmg001: 'hook', // Pelican: four hooked claws
};

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const smooth = (n: number) => { const t = clamp01(n); return t * t * (3 - 2 * t); };

/** Test-range layout only; other floors supply their own depthAt function. */
export function rangeSnowDepth(preset: SnowPreset, x: number, z: number): number {
  if (preset === 'off') return 0;
  const wind = Math.sin(x * .73 + Math.sin(z * .41)) * Math.cos(z * .57) * .018;
  let depth = (preset === 'deep' ? .58 : .115) + wind;
  if (preset === 'drifts') {
    const mound = (cx: number, cz: number, rx: number, rz: number, height: number) =>
      height * smooth(1 - Math.hypot((x - cx) / rx, (z - cz) / rz));
    depth += mound(5, -2, 5.8, 5, .64) + mound(-6, -4, 4, 3.5, .43);
    depth += mound(-4, 3.4, 3.2, 2.8, 1.65) + mound(11, 7, 4.5, 5, 1.7);
    depth += mound(-13, 0, 4.5, 6, 1.5) + mound(0, -13, 7, 3.5, 1.45);
  }
  // Continuous cover: the rendered snow border extends past the editable trail field.
  return depth;
}

export class SnowField {
  readonly bounds: SnowBounds;
  readonly resolution: number;
  readonly blockingDepth: number;
  /** RGBA8: fresh depth / MAX, footprint compression, packed surface, reserved. */
  readonly data: Uint8Array;
  dirty = true;
  enabled = true;
  lastMoveScale = 1;
  revision = 0;
  /** Walkability changes only when authored depths change, not on every footfall/reset. */
  terrainRevision = 0;
  private readonly playerTrack = createSnowTrack();
  private readonly markedPixels = new Map<number, { at: number; value: number }>();
  private readonly displacedPixels = new Map<number, { at: number; value: number }>();
  private readonly originalDepth: Uint8Array;
  private snowfallTime = 0;
  private readonly excludeAt?: (x: number, z: number) => boolean;
  private readonly groundHeight: (x: number, z: number) => number;

  constructor(options: SnowFieldOptions) {
    this.excludeAt = options.excludeAt;
    this.bounds = { ...options.bounds };
    this.resolution = options.resolution ?? 1024;
    this.blockingDepth = options.blockingDepth ?? .95;
    this.groundHeight = options.heightAt ?? (() => 0);
    if (this.bounds.width <= 0 || this.bounds.depth <= 0 || this.resolution < 2 || !Number.isInteger(this.resolution))
      throw new Error('Snow requires positive bounds and an integer resolution of at least 2.');
    this.data = new Uint8Array(this.resolution * this.resolution * 4);
    this.originalDepth = new Uint8Array(this.resolution * this.resolution);
    this.fill(options.depthAt);
  }

  fill(depthAt: (x: number, z: number) => number): void {
    this.terrainRevision++;
    const { minX, minZ, width, depth } = this.bounds, n = this.resolution;
    for (let z = 0; z < n; z++) for (let x = 0; x < n; x++) {
      const i = (z * n + x) * 4;
      const wx = minX + x / (n - 1) * width, wz = minZ + z / (n - 1) * depth;
      const value = this.excludeAt?.(wx, wz) ? 0 : depthAt(wx, wz);
      this.data[i] = Math.round(clamp01(Number.isFinite(value) ? value / MAX_SNOW_DEPTH : 0) * 255);
      this.originalDepth[i / 4] = this.data[i];
      this.data[i + 1] = this.data[i + 2] = 0;
      this.data[i + 3] = 255;
    }
    this.displacedPixels.clear(); this.markedPixels.clear(); this.snowfallTime = 0; this.revision++; this.dirty = true;
  }

  resetTrails(): void {
    for (const i of this.displacedPixels.keys()) this.data[i] = this.originalDepth[i / 4];
    for (let i = 0; i < this.data.length; i += 4) this.data[i + 1] = this.data[i + 2] = 0;
    this.displacedPixels.clear(); this.markedPixels.clear(); this.snowfallTime = 0; this.revision++; this.dirty = true;
  }

  /** Bilinear sampling matches the GPU, including the half-texel inset. */
  private channel(x: number, z: number, channel: number): number {
    const { minX, minZ, width, depth } = this.bounds, n = this.resolution;
    const u = (x - minX) / width, v = (z - minZ) / depth;
    if (u < 0 || u > 1 || v < 0 || v > 1 || !this.enabled) return 0;
    const px = u * (n - 1), pz = v * (n - 1);
    const ix = Math.min(n - 2, Math.floor(px)), iz = Math.min(n - 2, Math.floor(pz));
    const fx = px - ix, fz = pz - iz, i = (iz * n + ix) * 4 + channel;
    const a = this.data[i] * (1 - fx) + this.data[i + 4] * fx;
    const b = this.data[i + n * 4] * (1 - fx) + this.data[i + n * 4 + 4] * fx;
    return (a * (1 - fz) + b * fz) / 255;
  }

  freshDepth(x: number, z: number): number { return this.channel(x, z, 0) * MAX_SNOW_DEPTH; }
  depth(x: number, z: number): number {
    const fresh = this.freshDepth(x, z);
    return fresh - Math.min(fresh * .88, .24) * this.channel(x, z, 1);
  }

  /** Null for uncovered ground. Includes the overlay's small anti-z-fighting lift. */
  surfaceHeight(x: number, z: number): number | null {
    const depth = this.depth(x, z);
    return depth >= .006 ? this.groundHeight(x, z) + depth + .008 : null;
  }

  /** First snow contact as a segment fraction. Sweeps the entire frame, so fast
   * projectiles cannot skip a bank. Above-crest shots remain clear. Radius is the
   * projectile's vertical half-size, not the larger cosmetic glow around it. */
  traceSegment(from: SnowPoint3, to: SnowPoint3, radius = 0): number | null {
    if (!this.enabled) return null;
    const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
    const b = this.bounds;
    // Clip long shots to the finite snow tile before sampling.
    let enter = 0, exit = 1;
    for (const [p, delta, min, max] of [[from.x, dx, b.minX, b.minX + b.width], [from.z, dz, b.minZ, b.minZ + b.depth]]) {
      if (Math.abs(delta) < 1e-10) { if (p < min || p > max) return null; }
      else {
        const a = (min - p) / delta, c = (max - p) / delta;
        enter = Math.max(enter, Math.min(a, c)); exit = Math.min(exit, Math.max(a, c));
        if (enter > exit) return null;
      }
    }
    const inside = (t: number) => {
      const h = this.surfaceHeight(from.x + dx * t, from.z + dz * t);
      return h !== null && from.y + dy * t - Math.max(0, radius) <= h;
    };
    if (inside(enter)) return enter;
    const spacing = Math.min(.08, b.width / (this.resolution - 1) * .5, b.depth / (this.resolution - 1) * .5);
    const steps = Math.max(1, Math.ceil(Math.max(Math.hypot(dx, dz), Math.abs(dy)) * (exit - enter) / spacing));
    let previous = enter;
    for (let i = 1; i <= steps; i++) {
      const t = enter + (exit - enter) * i / steps;
      if (inside(t)) {
        let lo = previous, hi = t;
        for (let j = 0; j < 10; j++) { const mid = (lo + hi) * .5; if (inside(mid)) hi = mid; else lo = mid; }
        return hi;
      }
      previous = t;
    }
    return null;
  }
  speedScale(x: number, z: number): number {
    return 1 - .62 * smooth((this.depth(x, z) - .14) / .66);
  }
  /** Snow affects speed only; even the deepest banks remain traversable. */
  canOccupy(_x: number, _z: number, _radius: number): boolean {
    return true;
  }

  /** Swept speed sampling also applies to dashes through deep snow. */
  move(position: SnowPoint, dx: number, dz: number, radius: number): void {
    const distance = Math.hypot(dx, dz), steps = Math.max(1, Math.ceil(distance / .1));
    // Meet fresh snow at the leading foot. Sampling only the centre would read the
    // prints just stamped under the body and reduce resistance on the next frame.
    const leadX = distance > 0 ? dx / distance * radius : 0, leadZ = distance > 0 ? dz / distance * radius : 0;
    this.lastMoveScale = 0;
    for (let i = 0; i < steps; i++) {
      const speed = this.speedScale(position.x + leadX, position.z + leadZ), x = dx / steps * speed, z = dz / steps * speed;
      this.lastMoveScale += speed / steps;
      position.x += x; position.z += z;
    }
  }

  /** Moving contact clears deep snow; shallow snow keeps discrete footprints. */
  trail(from: SnowPoint, to: SnowPoint, track = this.playerTrack, yaw?: number, radius = .45): void {
    const dx = to.x - from.x, dz = to.z - from.z, distance = Math.hypot(dx, dz);
    if (!this.enabled || distance < .001 || distance > 2) return;
    this.carve(from, to, radius);
    if (track.revision !== this.revision) { track.distance = 0; track.phase = 0; track.revision = this.revision; }
    const stride = (track.shape === 'boot' ? .62 : .8) * track.scale;
    const heading = yaw ?? Math.atan2(dx, dz);
    let at = stride - track.distance;
    for (; at <= distance; at += stride) {
      const x = from.x + dx * at / distance, z = from.z + dz * at / distance;
      this.footfall(x, z, heading, track, false);
    }
    track.distance = (track.distance + distance) % stride;
  }

  /** Plant a grounded actor's stance once; standing still does not continually re-dig. */
  plant(at: SnowPoint, yaw: number, track: SnowTrack): void {
    if (!this.enabled) return;
    track.revision = this.revision; track.distance = 0;
    this.footfall(at.x, at.z, yaw, track, true);
  }

  private footfall(x: number, z: number, yaw: number, track: SnowTrack, stance: boolean): void {
    const ux = Math.sin(yaw), uz = Math.cos(yaw), s = track.scale;
    const side = track.phase++ % 2 ? 1 : -1;
    const foot = (across: number, along: number, turn = 0) =>
      this.stampFoot(x + (uz * across + ux * along) * s, z + (-ux * across + uz * along) * s, yaw + turn, track.shape, s);
    if (track.shape === 'boot') {
      foot(side * .19, 0);
      if (stance) foot(-side * .19, 0);
    } else {
      // Diagonal pairs, with the toes splayed away from each other.
      foot(side * .67, .58, side * .38);
      foot(-side * .67, -.58, -side * .55);
      if (stance) { foot(-side * .67, .58, -side * .38); foot(side * .67, -.58, side * .55); }
    }
  }

  /** Rounded swept contact, with no flat-sided rectangular cut or distant halo. */
  private carve(from: SnowPoint, to: SnowPoint, radius: number): void {
    const b = this.bounds, n = this.resolution, sx = b.width / (n - 1), sz = b.depth / (n - 1);
    const dx = to.x - from.x, dz = to.z - from.z, length2 = dx * dx + dz * dz;
    const length = Math.sqrt(length2);
    if (length < .001) return;
    const ux = dx / length, uz = dz / length, lipWidth = .18, outer = radius + lipWidth;
    const x0 = Math.max(0, Math.floor((Math.min(from.x, to.x) - outer - b.minX) / sx));
    const x1 = Math.min(n - 1, Math.ceil((Math.max(from.x, to.x) + outer - b.minX) / sx));
    const z0 = Math.max(0, Math.floor((Math.min(from.z, to.z) - outer - b.minZ) / sz));
    const z1 = Math.min(n - 1, Math.ceil((Math.max(from.z, to.z) + outer - b.minZ) / sz));
    for (let iz = z0; iz <= z1; iz++) for (let ix = x0; ix <= x1; ix++) {
      const i = (iz * n + ix) * 4, original = this.originalDepth[i / 4];
      // Start at ankle-deep snow, before the hill rises. Gating this on bank
      // depth leaves normal footsteps followed by a sudden deep trench.
      const depth = original * MAX_SNOW_DEPTH / 255, strength = smooth((depth - .10) / .25);
      if (!strength) continue;
      const x = b.minX + ix * sx - from.x, z = b.minZ + iz * sz - from.z;
      const along = x * ux + z * uz, across = Math.abs(x * uz - z * ux);
      const t = clamp01(along / length);
      const distance = Math.hypot(x - dx * t, z - dz * t);
      let next = this.data[i];
      if (distance < radius) {
        // A cosine shoulder spans nearly the whole contact radius. It reaches
        // zero slope at both ends, unlike a deep flat trench with thin walls.
        const edge = clamp01((distance / radius - .25) / .75);
        const contact = .5 + .5 * Math.cos(Math.PI * edge);
        next = Math.min(next, Math.round((depth - (depth - .10) * contact * strength) / MAX_SNOW_DEPTH * 255));
      } else if (along >= 0 && along <= length && across < outer && next >= original) {
        // Small side lips only; never a raised ring across the path's ends.
        const lip = .025 * Math.sin(Math.PI * (across - radius) / lipWidth) ** 2 * strength;
        next = Math.max(next, Math.min(255, Math.round((depth + lip) / MAX_SNOW_DEPTH * 255)));
      }
      if (next !== this.data[i]) {
        this.data[i] = next; this.dirty = true;
      }
      if (next !== original && (distance < radius || (along >= 0 && along <= length && across < outer))) {
        this.displacedPixels.set(i, { at: this.snowfallTime, value: next });
      }
    }
  }

  /** Each touched pixel recovers over the same snowfall duration, irrespective
   * of cut depth. Older path sections finish first; revisiting restarts only them. */
  refill(dt: number, snowfall: number): void {
    if (!this.enabled || dt <= 0 || snowfall <= 0) return;
    this.snowfallTime += dt * snowfall;
    for (const [i, mark] of this.displacedPixels) {
      const progress = clamp01((this.snowfallTime - mark.at) / 35);
      const next = Math.round(mark.value + (this.originalDepth[i / 4] - mark.value) * progress);
      if (next !== this.data[i]) { this.data[i] = next; this.dirty = true; }
      if (progress >= 1) this.displacedPixels.delete(i);
    }
    for (const [i, mark] of this.markedPixels) {
      const progress = clamp01((this.snowfallTime - mark.at) / 35);
      const next = Math.round(mark.value * (1 - progress));
      if (next !== this.data[i + 1] || next !== this.data[i + 2]) {
        this.data[i + 1] = this.data[i + 2] = next; this.dirty = true;
      }
      if (progress >= 1) this.markedPixels.delete(i);
    }
  }

  stampFoot(x: number, z: number, yaw: number, shape: SnowPrintShape, scale = 1): void {
    if (!this.enabled) return;
    const b = this.bounds, n = this.resolution, rx = b.width / (n - 1), rz = b.depth / (n - 1);
    const extent = .5 * scale, ux = Math.sin(yaw), uz = Math.cos(yaw);
    const x0 = Math.max(0, Math.floor((x - extent - b.minX) / rx)), x1 = Math.min(n - 1, Math.ceil((x + extent - b.minX) / rx));
    const z0 = Math.max(0, Math.floor((z - extent - b.minZ) / rz)), z1 = Math.min(n - 1, Math.ceil((z + extent - b.minZ) / rz));
    for (let iz = z0; iz <= z1; iz++) for (let ix = x0; ix <= x1; ix++) {
      const i = (iz * n + ix) * 4;
      if (!this.data[i] || this.data[i] / 255 * MAX_SNOW_DEPTH >= this.blockingDepth) continue;
      const dx = b.minX + ix * rx - x, dz = b.minZ + iz * rz - z;
      const across = (dx * uz - dz * ux) / scale, along = (dx * ux + dz * uz) / scale;
      let mask: number;
      if (shape === 'boot') {
        const toe = Math.hypot(across / .145, (along - .08) / .2);
        const heel = Math.hypot(across / .115, (along + .175) / .1);
        mask = 1 - smooth((Math.min(toe, heel) - .68) / .32);
      } else {
        // Tapered pointed toe; Pelican's toe hooks laterally, Crawler's stays straight.
        const centre = shape === 'hook' ? .13 * smooth((along + .08) / .38) : 0;
        const width = .16 * clamp01((.34 - along) / .48);
        const edge = Math.min(width - Math.abs(across - centre), along + .17, .34 - along);
        mask = smooth(edge / .035);
      }
      const value = Math.round(mask * 255);
      if (value > this.data[i + 1]) {
        this.data[i + 1] = this.data[i + 2] = value;
        this.dirty = true;
      }
      if (value > 0) this.markedPixels.set(i, { at: this.snowfallTime, value: this.data[i + 1] });
    }
  }
}

