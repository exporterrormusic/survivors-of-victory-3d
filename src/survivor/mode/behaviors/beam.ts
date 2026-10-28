// Charged beams shared by the sniper, charger, skirmisher, incinerator and boss roles (after the
// Phaser build's boss beam): a red lane tell that turns toward the player while it fills, then
// LOCKS for the last `lock` seconds (it flares brighter) so there is time to step out, then the red
// energy beam fires flat down it from the lane's own start, at the muzzle's height (so twin lanes
// fire from both sides and the beam always sits on its lane). `track` keeps turning while firing (bosses only); `tick` 0 makes it a
// single shot. Cover blocks it.

import { Vector3 } from '@babylonjs/core';
import type { Target } from '../../targets';
import { TELL, type Tell, type TellColor } from '../telegraph';
import { PLAYER_RADIUS, clearShot, flatDistance } from './common';
import { ENERGY, EnergyBeam } from './energy';
import type { BehaviorContext } from './types';

/** where sniper beams aim on the player, metres up */
const CHEST = 1;

export interface BeamTuning {
  readonly length: number;
  readonly width: number;
  readonly charge: number;
  /** seconds at the end of the charge with the aim frozen; default 1.2 */
  readonly lock?: number;
  readonly fire: number;
  /** seconds between damage ticks while firing; 0 = one hit when it fires */
  readonly tick: number;
  readonly damage: number;
  /** turn rate toward the player, rad/s, while charging (before the lock) and while firing */
  readonly aim: number;
  readonly track: number;
  /** ground lane colour; defaults to the red area tell */
  readonly tell?: TellColor;
  /** lane opacity while aiming; it rises when the aim locks */
  readonly tellAlpha?: number;
  /** muzzle socket index to fire from */
  readonly muzzle?: number;
  /** sideways offset of the lane, metres (twin beams) */
  readonly side?: number;
  /** a thin aiming laser from the muzzle while charging (sniper sightline); it replaces the ground lane */
  readonly sight?: boolean;
  /** turn at this fixed rate (rad/s, signed) while firing instead of tracking */
  readonly sweep?: number;
  /** fire from the muzzle socket itself (the lane starts under it) rather than the body's centre line */
  readonly fromMuzzle?: boolean;
  /** keep walking while charging and firing (the lane moves with it); otherwise it plants */
  readonly mobile?: boolean;
}

export class Beam {
  private phase: 'idle' | 'charge' | 'fire' = 'idle';
  private timer = 0;
  private tickIn = 0;
  private yaw = 0;
  /** fixed angle off the player line, for fans */
  private offset = 0;
  private tell: Tell | null = null;
  private energy: EnergyBeam | null = null;
  private laser: EnergyBeam | null = null;
  private sweepRate = 0;
  private locked = false;
  private readonly from = new Vector3();
  private readonly to = new Vector3();
  private readonly eye = new Vector3();
  private readonly base = new Vector3();
  private readonly ctx: BehaviorContext;
  private readonly target: Target;
  private readonly tuning: BeamTuning;

  constructor(ctx: BehaviorContext, target: Target, tuning: BeamTuning) {
    this.ctx = ctx; this.target = target; this.tuning = tuning;
  }

  get busy(): boolean { return this.phase !== 'idle'; }
  get firing(): boolean { return this.phase === 'fire'; }
  get charging(): boolean { return this.phase === 'charge'; }
  /** 0..1 through the charge */
  get progress(): number { return this.phase === 'charge' ? 1 - this.timer / this.tuning.charge : 1; }

  /** `offset` (rad) aims this beam that far off the player line, for fans; `sweepSign` flips a sweep. */
  start(offset = 0, sweepSign = 1): void {
    const { target, ctx, tuning } = this;
    this.offset = offset;
    this.sweepRate = (tuning.sweep ?? 0) * sweepSign;
    // A muzzle-mounted lane starts out on the arm, so aim from there or it runs parallel past the player.
    if (tuning.fromMuzzle) this.laneBase(true);
    this.yaw = this.bearing() + offset;
    this.phase = 'charge';
    this.timer = tuning.charge;
    this.locked = false;
    this.laneBase(true);
    if (tuning.sight) this.laser = new EnergyBeam(ctx.vfx);
    if (!tuning.sight) this.tell = ctx.tells.lane(this.base.x, this.base.z, this.yaw, tuning.length, tuning.width, tuning.tell ?? TELL.area, tuning.tellAlpha ?? .55);
  }

  update(dt: number): void {
    if (this.phase === 'idle') return;
    const { target, ctx, tuning } = this;
    if (!target.alive || target.stunned > 0) { this.stop(); return; }
    if (!tuning.mobile) target.rooted = .2;
    const lock = Math.min(tuning.lock ?? 1.2, tuning.charge);
    if (this.phase === 'charge' && !this.locked && this.timer <= lock) {
      this.locked = true;
      this.tell?.setColor(tuning.tell ?? TELL.area, 1);
    }
    if (this.phase === 'fire' && this.sweepRate) this.yaw += this.sweepRate * dt;
    this.turn(dt, this.phase === 'charge' ? (this.locked ? 0 : tuning.aim) : this.sweepRate ? 0 : tuning.track);
    this.timer -= dt;
    if (this.phase === 'charge') {
      if (this.tell) this.tell.fill = 1 - this.timer / tuning.charge;
      this.origin();
      ctx.vfx.flashSprite(this.from, ENERGY, (.35 + .5 * this.progress) * Math.max(1, tuning.width * .6), .05, .9, 'star');
      if (this.laser) {
        target.muzzle(this.eye, tuning.muzzle);
        this.end(this.eye.y);
        this.laser.draw(this.eye, this.to, this.locked ? .07 : .035, dt, this.locked ? .9 : .45);
      }
      if (this.timer > 0) return;
      this.laser?.dispose();
      this.laser = null;
      // the warning has done its job: only the beam itself remains
      if (this.tell) ctx.tells.release(this.tell);
      this.tell = null;
      this.phase = 'fire';
      this.timer = tuning.fire;
      this.tickIn = 0;
      this.energy = new EnergyBeam(ctx.vfx);
      ctx.vfx.flash(target.position, ENERGY, 2, 6, .2);
    }
    this.origin();
    this.end(this.from.y);
    // full strength, then dies away over the last 0.3 s (or the whole shot, if shorter)
    const fade = Math.max(0, Math.min(1, this.timer / Math.min(.3, tuning.fire)));
    this.energy!.draw(this.from, this.to, tuning.width * (.75 + .25 * fade), dt, .4 + .6 * fade);
    this.tickIn -= dt;
    if (this.tickIn <= 0) {
      this.tickIn = tuning.tick > 0 ? tuning.tick : Infinity;
      if (this.playerInside()) ctx.player.takeDamage(tuning.damage);
    }
    if (this.timer <= 0) this.stop();
  }

  /** A short burn mark where the firing beam meets the ground or its end. */
  scorch(): void {
    if (this.phase !== 'fire') return;
    const at = new Vector3(this.to.x, .05, this.to.z);
    this.ctx.vfx.groundGlow(at, ENERGY, this.tuning.width * .7, .8, .45);
    this.ctx.vfx.sparks(new Vector3(this.to.x, .4, this.to.z), 3, ENERGY, [3, 1.2, 1], 4);
  }

  stop(): void {
    if (this.tell) this.ctx.tells.release(this.tell);
    this.energy?.dispose();
    this.laser?.dispose();
    this.tell = null;
    this.energy = this.laser = null;
    this.phase = 'idle';
  }

  /** Where the beam leaves: the lane's start, a little forward, at the muzzle's height. */
  private origin(): void {
    this.target.muzzle(this.from, this.tuning.muzzle);
    if (this.tuning.fromMuzzle) return;
    const y = Math.max(.8, this.from.y);
    const ahead = this.target.radius * .6;
    this.from.set(this.base.x + Math.sin(this.yaw) * ahead, y, this.base.z + Math.cos(this.yaw) * ahead);
  }

  /**
   * The far end of the beam, starting at height `y`. Sniper (sightline) beams tilt down through the
   * player's chest instead of running flat, so up close they don't sail over the player's head;
   * past the player they continue down into the ground.
   */
  private end(y: number): void {
    const { tuning } = this;
    let length = tuning.length, endY = y;
    if (tuning.sight) {
      const p = this.ctx.player.position;
      const reach = Math.max(1.5, (p.x - this.base.x) * Math.sin(this.yaw) + (p.z - this.base.z) * Math.cos(this.yaw));
      const drop = (y - CHEST) / reach;
      if (drop > 0) length = Math.min(length, y / drop);
      endY = Math.max(0, y - drop * length);
    }
    this.to.set(this.base.x + Math.sin(this.yaw) * length, endY, this.base.z + Math.cos(this.yaw) * length);
  }

  /** `fresh` re-reads a muzzle-mounted lane's start; otherwise it stays put through the attack. */
  private laneBase(fresh = false): void {
    const { target, tuning } = this;
    if (tuning.fromMuzzle) {
      // fixed where the cannon was when the charge began, so idle sway can't swing the warning
      if (!fresh) return;
      target.muzzle(this.base, tuning.muzzle);
      this.base.y = 0;
      return;
    }
    const side = tuning.side ?? 0;
    this.base.set(target.position.x + Math.cos(this.yaw) * side, 0, target.position.z - Math.sin(this.yaw) * side);
  }

  private turn(dt: number, rate: number): void {
    const { target, ctx } = this;
    if (rate > 0) {
      const want = this.bearing() + this.offset;
      const delta = Math.atan2(Math.sin(want - this.yaw), Math.cos(want - this.yaw));
      this.yaw += Math.sign(delta) * Math.min(Math.abs(delta), rate * dt);
    }
    // Muzzle-mounted beams (twin cannons) leave the body's facing to their owner.
    if (!this.tuning.fromMuzzle) target.yaw = this.yaw - this.offset;
    this.laneBase();
    if (this.tell) ctx.tells.moveLane(this.tell, this.base.x, this.base.z, this.yaw, this.tuning.length);
  }

  /**
   * Yaw to the player from where the beam aims: the muzzle for muzzle-mounted beams, else the body.
   * A player inside the muzzle's reach (closer to the body than the muzzle is) is aimed at from the
   * body, or the shot would point away from them.
   */
  private bearing(): number {
    const { target } = this, p = this.ctx.player.position;
    const inside = flatDistance(target.position, p) < flatDistance(target.position, this.base) + 1;
    const from = this.tuning.fromMuzzle && !inside ? this.base : target.position;
    return Math.atan2(p.x - from.x, p.z - from.z);
  }

  private playerInside(): boolean {
    const { ctx, tuning } = this;
    const dx = ctx.player.position.x - this.base.x, dz = ctx.player.position.z - this.base.z;
    const along = dx * Math.sin(this.yaw) + dz * Math.cos(this.yaw);
    const across = Math.abs(dx * Math.cos(this.yaw) - dz * Math.sin(this.yaw));
    return along > 0 && along < tuning.length && across < tuning.width / 2 + PLAYER_RADIUS && clearShot(ctx, this.base, ctx.player.position);
  }
}
