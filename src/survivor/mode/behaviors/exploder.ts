// Exploder (Solaris): plants within 3 m, a red ring fills for 1 s, then it blows. Shot first, it
// drops its charge, which goes off 0.6 s later. The blast hurts Raptures too.

import { Vector3 } from '@babylonjs/core';
import { enemyDeath } from '../../enemy-death';
import type { Target } from '../../targets';
import type { RaptureSpec } from '../roster';
import { TELL, type Tell } from '../telegraph';
import { detonate, flatDistance } from './common';
import type { Behavior, BehaviorContext, BehaviorFactory } from './types';

class ExploderBehavior implements Behavior {
  private phase: 'ready' | 'fuse' | 'dropped' | 'spent' = 'ready';
  private timer = 0;
  private tell: Tell | null = null;
  private readonly at = new Vector3();
  private readonly ctx: BehaviorContext;
  private readonly target: Target;
  private readonly damage: number;
  private static readonly TRIGGER = 3;
  private static readonly RADIUS = 4;
  private static readonly FUSE = 1;
  private static readonly DROP_RADIUS = 3;
  private static readonly DROP_FUSE = .6;

  constructor(ctx: BehaviorContext, target: Target, spec: RaptureSpec) {
    this.ctx = ctx; this.target = target; this.damage = spec.damage;
  }

  get active(): boolean { return this.phase !== 'spent' && (this.target.alive || this.phase === 'dropped'); }

  update(dt: number): void {
    const { target, ctx } = this;
    if (this.phase === 'spent') return;
    if (!target.alive && this.phase !== 'dropped') {
      // Shot before or during the fuse: the charge falls where it died.
      this.at.copyFrom(target.position);
      this.releaseTell();
      this.tell = ctx.tells.circle(this.at.x, this.at.z, ExploderBehavior.DROP_RADIUS, TELL.area);
      this.phase = 'dropped';
      this.timer = ExploderBehavior.DROP_FUSE;
      return;
    }
    if (this.phase === 'ready') {
      if (target.scale < .99 || ctx.player.hp <= 0 || flatDistance(target.position, ctx.player.position) > ExploderBehavior.TRIGGER) return;
      this.at.copyFrom(target.position);
      this.tell = ctx.tells.circle(this.at.x, this.at.z, ExploderBehavior.RADIUS, TELL.area);
      this.phase = 'fuse';
      this.timer = ExploderBehavior.FUSE;
      return;
    }
    this.timer -= dt;
    target.attackHold = .2;
    const fuse = this.phase === 'fuse' ? ExploderBehavior.FUSE : ExploderBehavior.DROP_FUSE;
    this.tell!.fill = 1 - Math.max(0, this.timer) / fuse;
    if (this.timer > 0) return;
    const radius = this.phase === 'fuse' ? ExploderBehavior.RADIUS : ExploderBehavior.DROP_RADIUS;
    this.releaseTell();
    this.phase = 'spent';
    if (target.alive) {
      // Its own blast: no kill credit, but the usual death burst.
      target.hit(target.hp);
      enemyDeath(ctx.vfx, target.position, target.radius, target.barHeight);
    }
    detonate(ctx, this.at, radius, this.damage, 30, target);
  }

  private releaseTell(): void {
    if (this.tell) this.ctx.tells.release(this.tell);
    this.tell = null;
  }

  dispose(): void { this.releaseTell(); }
}

export const exploder: BehaviorFactory = (ctx, target, spec) => new ExploderBehavior(ctx, target, spec);
