import { Axis, Vector3 } from '@babylonjs/core';
import type { KitContext } from '../kit';
import type { FxQuad } from '../vfx';
import { SNOW } from './palette';

// Updated every frame while charging; no per-frame vectors.
const muzzle = new Vector3(), right = new Vector3(), up = new Vector3();
const from = new Vector3(), to = new Vector3(), end = new Vector3();
/** A point on the capacitor ring, in the camera plane around the muzzle. */
function ringPoint(a: number, radius: number, out: Vector3): Vector3 {
  const c = Math.cos(a) * radius, s = Math.sin(a) * radius;
  return out.set(muzzle.x + right.x * c + up.x * s, muzzle.y + right.y * c + up.y * s, muzzle.z + right.z * c + up.z * s);
}

/** Muzzle buildup and cover-clipped guides use the same angle/range as the released burst. */
export class SnowWhiteChargeVfx {
  private quads: FxQuad[] = [];
  private wasFull = false;
  private mode: 'weapon' | 'burst' | null = null;
  constructor(private readonly ctx: KitContext) {}

  update(weapon: number | null, burst: number | null, yaw: number): void {
    const { vfx } = this.ctx;
    if (weapon === null && burst === null) {
      for (const q of this.quads) vfx.release(q);
      this.quads = [];
      this.wasFull = false;
      this.mode = null;
      return;
    }
    if (!this.quads.length) this.quads = [vfx.quad('glow', SNOW.cyan), vfx.quad('star', SNOW.core),
      vfx.quad('streak', SNOW.cyan), vfx.quad('streak', SNOW.cyan),
      ...Array.from({ length: 18 }, () => vfx.quad('spark', SNOW.cyan))];
    const charge = Math.max(0, Math.min(1, burst ?? weapon ?? 0));
    const mode = burst !== null ? 'burst' : 'weapon';
    if (mode !== this.mode) { this.mode = mode; this.wasFull = false; }
    const full = charge >= 1 - 1e-6;
    this.ctx.muzzle(muzzle);
    const time = this.ctx.run.time;
    const pulse = full ? 1 + Math.sin(time * 5) * .07 : 1;
    vfx.sprite(this.quads[0], muzzle, (.55 + charge * .85) * pulse);
    vfx.tint(this.quads[0], SNOW.cyan, full ? .6 : .2 + charge * .25);
    vfx.sprite(this.quads[1], muzzle, (full ? .65 : .15 + charge * .3) * pulse, full ? Math.PI / 4 : time * 2);
    vfx.tint(this.quads[1], SNOW.core, full ? 1 : .45 + charge * .45);
    // A segmented capacitor contracts onto the muzzle and fills clockwise.
    // At full charge it locks into a white halo rather than continuing to spin.
    this.ctx.vfx.camera.getDirectionToRef(Axis.X, right); right.normalize();
    this.ctx.vfx.camera.getDirectionToRef(Axis.Y, up); up.normalize();
    const radius = (full ? .48 : .8 - charge * .32) * pulse;
    for (let i = 0; i < 12; i++) {
      const a = -Math.PI / 2 + i * Math.PI / 6 + (full ? 0 : time * .55);
      const lit = (i + 1) / 12 <= charge;
      vfx.streak(this.quads[4 + i], ringPoint(a, radius, from), ringPoint(a + Math.PI / 6 * .72, radius, to), full ? .07 : .035);
      vfx.tint(this.quads[4 + i], full ? SNOW.core : SNOW.cyan, full ? .95 : lit ? .85 : .14);
    }
    // Six inward-moving energy streaks; full charge replaces them with steady prongs.
    for (let i = 0; i < 6; i++) {
      const a = i * Math.PI / 3 + (full ? Math.PI / 6 : time * .9);
      const phase = (time * (1.1 + charge) + i / 6) % 1;
      const r = full ? .57 : .25 + (1 - phase) * (1 + charge * .3);
      vfx.streak(this.quads[16 + i], ringPoint(a, r, from), ringPoint(a + (full ? 0 : .08), r + (full ? .18 : .14), to), full ? .045 : .025 + charge * .02);
      vfx.tint(this.quads[16 + i], full ? SNOW.core : SNOW.cyan, full ? .8 : Math.sin(phase * Math.PI) * (.3 + charge * .55));
    }
    if (full && !this.wasFull) {
      vfx.flashSprite(muzzle, SNOW.core, 1.2, .18, .9, 'star');
      vfx.flashSprite(muzzle, SNOW.cyan, 1.8, .26, .45, 'ring');
    }
    this.wasFull = full;
    const half = Math.PI / 4 + (Math.PI / 24 - Math.PI / 4) * charge;
    for (let i = 0; i < 2; i++) {
      const q = this.quads[2 + i];
      if (burst === null) { q.visible = false; continue; }
      const a = yaw + (i ? half : -half);
      end.set(muzzle.x + Math.sin(a) * 18.75, muzzle.y, muzzle.z + Math.cos(a) * 18.75);
      const stop = this.ctx.targets.navigation.traceCover(muzzle, end) ?? 1;
      Vector3.LerpToRef(muzzle, end, stop, end);
      vfx.streak(q, muzzle, end, .045);
      vfx.tint(q, SNOW.cyan, .3 + charge * .25);
    }
  }
}
