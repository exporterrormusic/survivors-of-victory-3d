// Shielder (Tripod), after the Phaser build's shielder: a bubble with its own HP covers it and
// every Rapture inside. Player shots from outside stop on the bubble and drain it; shots fired from
// inside it pass freely, and Rapture attacks ignore it. Splash on covered Raptures drains it too.
// Broken, it recharges after 5 s. It still fights with the standard charge-and-bolt.

import { Vector3 } from '@babylonjs/core';
import { EnemyLaserAttack } from '../../enemy-attack';
import type { ShotShield, Target } from '../../targets';
import type { RaptureSpec } from '../roster';
import { ShieldBubble } from './shield-bubble';
import type { Behavior, BehaviorContext, BehaviorFactory } from './types';

const RADIUS = 5;
const RECHARGE = 5;
const COLOR = [.15, .68, 1] as const;

class ShielderBehavior implements Behavior {
  private shield: number;
  private recharge = 0;
  private readonly maxShield: number;
  private readonly covered = new Set<Target>();
  private readonly bubble: ShieldBubble;
  private readonly attack: EnemyLaserAttack;
  private readonly center = new Vector3();
  private readonly ctx: BehaviorContext;
  private readonly target: Target;
  private readonly ward = { absorb: (damage: number, hit: Target) => this.absorb(damage, hit === this.target ? this.ctx.player.position : hit.position) };
  private readonly wall: ShotShield;

  constructor(ctx: BehaviorContext, target: Target, spec: RaptureSpec) {
    this.ctx = ctx; this.target = target;
    this.maxShield = this.shield = Math.round(spec.hp * .8);
    this.bubble = new ShieldBubble(ctx.vfx.scene, COLOR);
    this.attack = new EnemyLaserAttack({ vfx: ctx.vfx, snow: ctx.snow, targets: ctx.field }, target, ctx.player, 1 + Math.random() * 2, ctx.pacing);
    const self = this;
    this.wall = {
      center: this.center, radius: RADIUS,
      get up() { return self.raised; },
      block: (at, damage) => { this.absorb(damage, at); },
    };
    ctx.field.shields.add(this.wall);
  }

  private get raised(): boolean { return this.target.alive && this.shield > 0 && this.target.scale > .99; }

  get active(): boolean { return this.target.alive; }

  update(dt: number): void {
    const { target } = this;
    const up = this.raised;
    if (target.alive && this.shield <= 0) {
      this.recharge -= dt;
      if (this.recharge <= 0) this.shield = this.maxShield;
    }
    this.cover(up);
    this.center.set(target.position.x, target.position.y + target.barHeight * .4, target.position.z);
    this.bubble.update(dt, this.center, RADIUS, up, this.shield / this.maxShield);
    if (target.alive) this.attack.update(dt);
  }

  private cover(up: boolean): void {
    const now = up ? this.ctx.field.inRadius(this.target.position, RADIUS) : [];
    for (const other of this.covered) if (!now.includes(other)) { if (other.ward === this.ward) other.ward = null; this.covered.delete(other); }
    for (const other of now) {
      if (!other.alive || other.ward) continue;
      other.ward = this.ward;
      this.covered.add(other);
    }
  }

  /** Drain the shield by `damage`, rippling on the side facing `from`. Returns what got through. */
  private absorb(damage: number, from: Vector3): number {
    if (this.shield <= 0) return damage;
    const taken = Math.min(this.shield, damage);
    this.shield -= taken;
    this.bubble.hit(new Vector3(from.x, this.center.y, from.z));
    if (this.shield <= 0) {
      this.recharge = RECHARGE;
      this.ctx.vfx.ring(this.target.position, COLOR, RADIUS * .8, RADIUS * 1.2, .35, .9);
      this.cover(false);
    }
    return damage - taken;
  }

  dispose(): void {
    this.ctx.field.shields.delete(this.wall);
    this.cover(false);
    this.bubble.dispose();
    this.attack.dispose();
  }
}

export const shielder: BehaviorFactory = (ctx, target, spec) => new ShielderBehavior(ctx, target, spec);
