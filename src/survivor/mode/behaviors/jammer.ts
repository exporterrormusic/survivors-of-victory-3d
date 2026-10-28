// Jammer (Squid): hides behind the horde and lobs a glob (1 s arc, its landing circle shown). It
// leaves a 4 m pool for 6 s that slows the player by 35% and stops the Burst gauge filling while
// they stand in it. Pools herd you, so watch your exits, or kill it first. Pools outlast it.

import { Vector3 } from '@babylonjs/core';
import type { Target } from '../../targets';
import type { FxQuad } from '../../vfx';
import type { RaptureSpec } from '../roster';
import { TELL, type Tell } from '../telegraph';
import { BLAST, FLARE, flatDistance } from './common';
import type { Behavior, BehaviorContext, BehaviorFactory } from './types';

const FLIGHT = 1;
const RADIUS = 4;
const POOL = 6;
const COOLDOWN = 5;

interface Glob { readonly from: Vector3; readonly to: Vector3; time: number; readonly quad: FxQuad; readonly tell: Tell }
interface Pool { readonly at: Vector3; remaining: number; readonly tell: Tell }

class JammerBehavior implements Behavior {
  private cooldown = 2 + Math.random() * 2;
  private readonly globs: Glob[] = [];
  private readonly pools: Pool[] = [];
  private readonly at = new Vector3();
  private readonly ctx: BehaviorContext;
  private readonly target: Target;
  private readonly spec: RaptureSpec;

  constructor(ctx: BehaviorContext, target: Target, spec: RaptureSpec) {
    this.ctx = ctx; this.target = target; this.spec = spec;
  }

  get active(): boolean { return this.target.alive || this.globs.length > 0 || this.pools.length > 0; }

  update(dt: number): void {
    const { target, ctx } = this;
    this.updateGlobs(dt);
    this.updatePools(dt);
    if (!target.alive || ctx.player.hp <= 0) return;
    this.cooldown -= dt;
    if (this.cooldown > 0 || target.scale < .99 || target.stunned > 0 || flatDistance(target.position, ctx.player.position) > this.spec.range + 4) return;
    this.cooldown = COOLDOWN;
    const p = ctx.player.position;
    const quad = ctx.vfx.quad('star', FLARE);
    ctx.vfx.glowing(quad);
    this.globs.push({ from: target.muzzle(new Vector3()), to: new Vector3(p.x, 0, p.z), time: 0, quad, tell: ctx.tells.circle(p.x, p.z, RADIUS, TELL.area, .55) });
  }

  private updateGlobs(dt: number): void {
    const { ctx } = this;
    for (let i = this.globs.length - 1; i >= 0; i--) {
      const g = this.globs[i];
      g.time += dt;
      const t = Math.min(1, g.time / FLIGHT);
      g.tell.fill = t;
      Vector3.LerpToRef(g.from, g.to, t, this.at);
      this.at.y += Math.sin(Math.PI * t) * 4;
      ctx.vfx.sprite(g.quad, this.at, .8, g.time * 6);
      if (t < 1) continue;
      ctx.vfx.release(g.quad);
      ctx.tells.release(g.tell);
      this.globs.splice(i, 1);
      ctx.vfx.flashSprite(g.to.add(new Vector3(0, .5, 0)), FLARE, 2, .2, .9, 'star');
      this.pools.push({ at: g.to, remaining: POOL, tell: ctx.tells.circle(g.to.x, g.to.z, RADIUS, TELL.area, .45) });
    }
  }

  private updatePools(dt: number): void {
    const { ctx } = this;
    for (let i = this.pools.length - 1; i >= 0; i--) {
      const pool = this.pools[i];
      pool.remaining -= dt;
      // fully lit while it lasts, fading over its last second
      pool.tell.fill = 1;
      pool.tell.setColor(TELL.area, .45 * Math.min(1, pool.remaining));
      if (Math.random() < dt * 6) {
        const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * RADIUS;
        ctx.vfx.vapour(this.at.set(pool.at.x + Math.cos(a) * r, .1, pool.at.z + Math.sin(a) * r), 1, BLAST, .7, .5, .8);
      }
      const inside = pool.remaining > 0 && ctx.player.hp > 0 && flatDistance(pool.at, ctx.player.position) <= RADIUS;
      this.mark(pool, inside);
      if (pool.remaining > 0) continue;
      ctx.tells.release(pool.tell);
      this.pools.splice(i, 1);
    }
  }

  private mark(pool: Pool, inside: boolean): void {
    const { player, run } = this.ctx;
    if (inside) { player.snares.add(pool); run.burstJams.add(pool); }
    else { player.snares.delete(pool); run.burstJams.delete(pool); }
  }

  dispose(): void {
    for (const g of this.globs) { this.ctx.vfx.release(g.quad); this.ctx.tells.release(g.tell); }
    for (const pool of this.pools) { this.mark(pool, false); this.ctx.tells.release(pool.tell); }
    this.globs.length = this.pools.length = 0;
  }
}

export const jammer: BehaviorFactory = (ctx, target, spec) => new JammerBehavior(ctx, target, spec);
