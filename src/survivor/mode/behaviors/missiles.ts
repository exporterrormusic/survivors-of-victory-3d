// Lobbed shells shared by the mortar, bombard and boss roles (after the Phaser build's barrage):
// red plasma bolts after the Halo 2 Wraith's mortar: a white-hot ball inside a big flickering glow,
// smearing a thick trail of glowing plasma behind it. They kick out sideways, curl over onto a spot
// locked at launch, and that spot's red circle fills as they fall. Stepping out of the circle dodges it.

import { Vector3 } from '@babylonjs/core';
import type { FxQuad, Rgb } from '../../vfx';
import { TELL, type Tell } from '../telegraph';
import { PLAYER_RADIUS, blastFx, clearShot, flatDistance } from './common';
import { EnergyOrb } from './energy';
import { attackEcho } from './echo';
import type { BehaviorContext } from './types';

// No green or blue in the glows: added over the bright scene, any shows up as pink.
const HALO: Rgb = [1.1, 0, 0];
const CORE: Rgb = [3, .6, .2];
const TRAIL: Rgb = [1.3, 0, 0];

interface Missile {
  readonly from: Vector3;
  readonly to: Vector3;
  /** sideways kick at launch: +1 / -1 / 0 */
  readonly side: number;
  readonly flight: number;
  readonly radius: number;
  /** visual scale of the shell (1 = mortar plasma ball) */
  readonly size: number;
  /** peak height of the arc above the straight line, metres; 0 = scaled with distance */
  readonly loft: number;
  readonly damage: number;
  wait: number;
  time: number;
  head: EnergyOrb | null;
  halo: FxQuad | null;
  corona: FxQuad | null;
  trail: number;
  tell: Tell;
}

export class MissileVolley {
  private readonly missiles: Missile[] = [];
  private readonly at = new Vector3();
  private readonly back = new Vector3();
  private readonly dir = new Vector3();
  private readonly ctx: BehaviorContext;

  constructor(ctx: BehaviorContext) { this.ctx = ctx; }

  get active(): boolean { return this.missiles.length > 0; }

  /** Launch from `from` at the ground spot (x, z). `wait` staggers a volley. */
  fire(from: Vector3, x: number, z: number, { damage, radius = 2.5, flight = 1.4, wait = 0, side = 0, size = 1, loft = 0 }: { damage: number; radius?: number; flight?: number; wait?: number; side?: number; size?: number; loft?: number }): void {
    attackEcho.listener?.({ kind: 'missile', x: from.x, y: from.y, z: from.z, tx: x, tz: z, radius, flight, wait, side, size, loft });
    this.missiles.push({
      from: from.clone(), to: new Vector3(x, 0, z), side, flight, radius, size, loft, damage, wait, time: 0, head: null, halo: null, corona: null, trail: 0,
      tell: this.ctx.tells.circle(x, z, radius, TELL.area, .7),
    });
  }

  update(dt: number): void {
    const { ctx } = this;
    for (let i = this.missiles.length - 1; i >= 0; i--) {
      const m = this.missiles[i];
      if (m.wait > 0) { m.wait -= dt; continue; }
      if (!m.head) {
        m.head = new EnergyOrb(ctx.vfx);
        m.halo = ctx.vfx.quad('glow', HALO);
        m.corona = ctx.vfx.quad('star', CORE);
        ctx.vfx.glowing(m.halo); ctx.vfx.glowing(m.corona);
      }
      m.time += dt;
      const t = Math.min(1, m.time / m.flight);
      m.tell.fill = t;
      this.position(m, t, this.at);
      this.position(m, Math.max(0, t - .05 / m.flight), this.back);
      this.at.subtractToRef(this.back, this.dir);
      // plasma ball: a white-hot boiling core, a flickering star and a wide glow around it
      const flicker = .85 + Math.random() * .3;
      m.head.draw(this.at, .34 * m.size, dt, 1, this.dir, 1.35 + (m.size < 1 ? 1 : 0));
      ctx.vfx.sprite(m.corona!, this.at, 1.1 * flicker * m.size, m.time * 7);
      ctx.vfx.sprite(m.halo!, this.at, 2.6 * flicker * m.size);
      // the smear: glowing plasma blobs left along the arc that swell a little and die out
      m.trail -= dt;
      while (m.trail <= 0) {
        m.trail += .018;
        const jitter = this.back.set(this.at.x + (Math.random() - .5) * .25, this.at.y + (Math.random() - .5) * .25, this.at.z + (Math.random() - .5) * .25);
        ctx.vfx.flashSprite(jitter, TRAIL, (.8 + Math.random() * .5) * m.size, .5, .85, 'glow');
      }
      if (Math.random() < dt * 30) ctx.vfx.sparks(this.at, 1, TRAIL, CORE, 2.5);
      if (t < 1) continue;
      this.explode(m);
      this.missiles.splice(i, 1);
    }
  }

  dispose(): void {
    for (const m of this.missiles) this.drop(m);
    this.missiles.length = 0;
  }

  private position(m: Missile, t: number, out: Vector3): Vector3 {
    const dx = m.to.x - m.from.x, dz = m.to.z - m.from.z, length = Math.hypot(dx, dz) || 1;
    // The kick fades out by mid-flight, so it reads as launch-then-turn.
    const swing = m.side * Math.sin(Math.PI * Math.min(1, t * 1.6)) * Math.min(4, length * .35);
    const height = m.loft || 2 + length * .25;
    return out.set(
      m.from.x + dx * t + (-dz / length) * swing,
      m.from.y * (1 - t) + Math.sin(Math.PI * t) * height + .3,
      m.from.z + dz * t + (dx / length) * swing,
    );
  }

  private explode(m: Missile): void {
    const { ctx } = this;
    if (flatDistance(m.to, ctx.player.position) <= m.radius + PLAYER_RADIUS * .5 && clearShot(ctx, m.to, ctx.player.position)) ctx.player.takeDamage(m.damage);
    blastFx(ctx, m.to, m.radius);
    this.drop(m);
  }

  private drop(m: Missile): void {
    m.head?.dispose();
    if (m.halo) this.ctx.vfx.release(m.halo);
    if (m.corona) this.ctx.vfx.release(m.corona);
    m.head = null;
    m.halo = m.corona = null;
    this.ctx.tells.release(m.tell);
  }
}
