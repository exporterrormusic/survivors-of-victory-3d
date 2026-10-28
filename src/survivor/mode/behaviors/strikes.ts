// Called-in strikes shared by the spotter and boss roles: a red circle fills on the ground under a
// faint targeting beam from the sky, then an orbital lance slams down there. Stepping out of the circle dodges it; cover between the circle's centre and
// the player shields them.

import { Vector3 } from '@babylonjs/core';
import { TELL, type Tell } from '../telegraph';
import { PLAYER_RADIUS, blastFx, clearShot, flatDistance } from './common';
import { EnergyBeam, energyPillar } from './energy';
import type { BehaviorContext } from './types';

interface Strike { readonly at: Vector3; readonly fuse: number; remaining: number; readonly radius: number; readonly damage: number; readonly tell: Tell; readonly sight: EnergyBeam }

export class StrikeField {
  private readonly strikes: Strike[] = [];
  private readonly top = new Vector3();
  private readonly ctx: BehaviorContext;

  constructor(ctx: BehaviorContext) { this.ctx = ctx; }

  get active(): boolean { return this.strikes.length > 0; }

  place(x: number, z: number, radius: number, fuse: number, damage: number): void {
    this.strikes.push({ at: new Vector3(x, 0, z), fuse, remaining: fuse, radius, damage, tell: this.ctx.tells.circle(x, z, radius, TELL.area, .7), sight: new EnergyBeam(this.ctx.vfx, false) });
  }

  update(dt: number): void {
    const { ctx } = this;
    for (let i = this.strikes.length - 1; i >= 0; i--) {
      const strike = this.strikes[i];
      strike.remaining -= dt;
      strike.tell.fill = 1 - strike.remaining / strike.fuse;
      if (strike.remaining > 0) {
        strike.sight.draw(this.top.set(strike.at.x, 24, strike.at.z), strike.at, .05 + .12 * strike.tell.fill, dt, .25 + .35 * strike.tell.fill);
        continue;
      }
      this.drop(strike);
      this.strikes.splice(i, 1);
      energyPillar(ctx.vfx, strike.at, .6);
      blastFx(ctx, strike.at, strike.radius);
      if (flatDistance(strike.at, ctx.player.position) < strike.radius + PLAYER_RADIUS * .5 && clearShot(ctx, strike.at, ctx.player.position)) {
        ctx.player.takeDamage(strike.damage);
      }
    }
  }

  private drop(strike: Strike): void {
    this.ctx.tells.release(strike.tell);
    strike.sight.dispose();
  }

  /** Call off every strike still falling. */
  dispose(): void {
    for (const strike of this.strikes) this.drop(strike);
    this.strikes.length = 0;
  }
}
