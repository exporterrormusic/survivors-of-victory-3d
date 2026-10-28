// Howler (Loud Mouth): plants and charges both of its huge side cannons for 1.8 s, aimed where the
// player stood when it began: energy builds down the gap between each barrel's jaws into a ball at the tip. Red
// lanes, fixed from the start, show where each beam begins. Then a beam leaves each barrel
// tip and the two sweep inward like scissors, crossing in front of it. Get out of the wedge, behind
// cover or out of reach. Afterwards the cannons overheat for 2.5 s: it can't move and takes double
// damage. Between beams, the slots on top of its head fire salvos of tiny rockets that shoot up and
// plunge onto small red circles around the player.

import { Vector3 } from '@babylonjs/core';
import type { Target } from '../../targets';
import type { RaptureSpec } from '../roster';
import { Beam } from './beam';
import { clearShot, flatDistance } from './common';
import { EnergyBeam, EnergyOrb } from './energy';
import { MissileVolley } from './missiles';
import type { Behavior, BehaviorContext, BehaviorFactory } from './types';

const SPREAD = 1;
const FIRE = 2.2;
const COOLDOWN = 6;
const OVERHEAT = 2.5;
/** muzzles 0/1 are the barrel tips, 2/3 the same barrels further back (targets.ts) */
const TIPS = [0, 1];
/** muzzles 4–6: the rocket slots on top of the head */
const SLOTS = [4, 5, 6];
const SALVO = 6;
const SALVO_EVERY = 5;

interface Charge { slot: EnergyBeam; ball: EnergyOrb }

class HowlerBehavior implements Behavior {
  private cooldown = 2 + Math.random() * 2;
  private overheat = 0;
  /** the body faces this way from the charge until the overheat ends */
  private aimYaw = 0;
  private charges: Charge[] | null = null;
  private salvoIn = 3;
  private readonly rockets: MissileVolley;
  private readonly beams: Beam[];
  private readonly tip = new Vector3();
  private readonly back = new Vector3();
  private readonly ctx: BehaviorContext;
  private readonly target: Target;
  private readonly spec: RaptureSpec;

  constructor(ctx: BehaviorContext, target: Target, spec: RaptureSpec) {
    this.ctx = ctx; this.target = target; this.spec = spec;
    this.rockets = new MissileVolley(ctx);
    this.beams = TIPS.map((muzzle) => new Beam(ctx, target, {
      length: 22, width: 1.1, charge: 1.8, lock: 1.2, fire: FIRE, tick: .2, damage: Math.round(spec.damage * .5),
      aim: 0, track: 0, muzzle, fromMuzzle: true, sweep: SPREAD * 2 / FIRE,
    }));
  }

  // rockets already in the air still land after it dies
  get active(): boolean { return this.target.alive || this.rockets.active; }

  update(dt: number): void {
    const { target, ctx } = this;
    this.rockets.update(dt);
    if (!target.alive || ctx.player.hp <= 0) { this.stop(); return; }
    if (this.beams[0].busy) {
      target.yaw = this.aimYaw;
      for (const beam of this.beams) beam.update(dt);
      this.glow(dt);
      if (!this.beams[0].busy) {
        this.overheat = OVERHEAT;
        target.breaks.add('overheat', 1, OVERHEAT);
      }
      return;
    }
    this.glow(dt);
    if (this.overheat > 0) {
      this.overheat -= dt;
      target.rooted = .2;
      target.yaw = this.aimYaw;
      if (Math.random() < dt * 14) for (const i of TIPS) ctx.vfx.vapour(target.muzzle(this.tip, i), 1, [.6, .3, .28], 1.2, 1.2, .9);
      if (this.overheat <= 0) this.cooldown = COOLDOWN;
      return;
    }
    if (target.scale < .99 || target.stunned > 0) return;
    this.salvoIn -= dt;
    if (this.salvoIn <= 0 && flatDistance(target.position, ctx.player.position) < 24) this.salvo();
    this.cooldown -= dt;
    if (this.cooldown > 0) return;
    if (flatDistance(target.position, ctx.player.position) > 18 || !clearShot(ctx, target.position, ctx.player.position)) return;
    this.aimYaw = target.yaw = Math.atan2(ctx.player.position.x - target.position.x, ctx.player.position.z - target.position.z);
    // Each cannon starts aimed out to its own side and sweeps inward, past the other.
    const rx = Math.cos(target.yaw), rz = -Math.sin(target.yaw);
    this.beams.forEach((beam, i) => {
      target.muzzle(this.tip, TIPS[i]);
      const side = Math.sign((this.tip.x - target.position.x) * rx + (this.tip.z - target.position.z) * rz) || (i ? 1 : -1);
      beam.start(side * SPREAD, -side);
    });
  }

  /** Tiny rockets from the head slots: straight up, then down onto circles on and around the player. */
  private salvo(): void {
    const p = this.ctx.player.position;
    for (let i = 0; i < SALVO; i++) {
      this.target.muzzle(this.tip, SLOTS[i % SLOTS.length]);
      const a = Math.random() * Math.PI * 2, r = i === 0 ? 0 : 1.5 + Math.random() * 2.5;
      this.rockets.fire(this.tip, p.x + Math.cos(a) * r, p.z + Math.sin(a) * r, {
        damage: Math.round(this.spec.damage * .5), radius: 1.5, flight: 1.8, wait: i * .14, size: .4, loft: 10,
      });
    }
    this.salvoIn = SALVO_EVERY;
  }

  /** While charging: energy down the gap between each barrel's jaws, gathering in a ball at the tip. */
  private glow(dt: number): void {
    const charging = this.beams[0].charging;
    if (!charging) {
      if (this.charges) for (const c of this.charges) { c.slot.dispose(); c.ball.dispose(); }
      this.charges = null;
      return;
    }
    this.charges ??= TIPS.map(() => ({ slot: new EnergyBeam(this.ctx.vfx, false), ball: new EnergyOrb(this.ctx.vfx) }));
    const k = this.beams[0].progress;
    this.charges.forEach((c, i) => {
      this.target.muzzle(this.tip, TIPS[i]);
      this.target.muzzle(this.back, TIPS[i] + 2);
      c.slot.draw(this.back, this.tip, .12 + .22 * k, dt, .5 + .5 * k);
      c.ball.draw(this.tip, .15 + .4 * k * (.9 + Math.random() * .2), dt);
    });
  }

  private stop(): void { for (const beam of this.beams) beam.stop(); this.glow(0); }

  dispose(): void { this.stop(); this.rockets.dispose(); }
}

export const howler: BehaviorFactory = (ctx, target, spec) => new HowlerBehavior(ctx, target, spec);
