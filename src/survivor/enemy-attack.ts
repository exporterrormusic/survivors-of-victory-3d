import { Vector3 } from '@babylonjs/core';
import type { KitContext } from './kit';
import type { Player } from './player';
import type { Target } from './targets';
import type { FxQuad, Rgb } from './vfx';

const RED: Rgb = [1, .025, .065];
const CHARGE: Rgb = [3.6, .28, .38];
/** Ease in over 80 ms, then retain the full-strength attack warning. */
function chargeFade(age: number): number {
  const t = Math.max(0, Math.min(1, age / .08));
  return t * t * (3 - 2 * t);
}
// HDR flight colors retain a vivid red shell and hot core under night exposure.
const PROJECTILE: Rgb = [2.8, .18, .28];
const CORE: Rgb = [3, 1.1, 1.05];
const RANGE_FIZZLE = .24;
// Deliberately no audio capability: enemy attack sounds are disabled.
type LaserContext = Pick<KitContext, 'vfx' | 'snow' | 'targets'>;
interface Barrel {
  origin: Vector3;
  end: Vector3;
  previous: Vector3;
  velocity: Vector3;
  distance: number;
  fizzle: number | null;
  glow: FxQuad;
  beam: FxQuad;
  core: FxQuad;
}

/** Shared pressure budget includes charges and live projectiles; all timers use game time. */
export class EnemyAttackPacing {
  private readonly active = new Set<object>();
  private gap = 0;
  update(dt: number): void { this.gap = Math.max(0, this.gap - Math.max(0, dt)); }
  acquire(owner: object): boolean {
    if (this.active.has(owner)) return true;
    if (this.active.size >= 2 || this.gap > 0) return false;
    this.active.add(owner); this.gap = .65;
    return true;
  }
  release(owner: object): void { this.active.delete(owner); }
}

/** Short beam-shaped bullets with travel time and straight trajectories. */
export class EnemyLaserAttack {
  private phase: 'ready' | 'charge' | 'flight' | 'melee' = 'ready';
  private timer: number;
  private generation: number;
  private readonly aim = new Vector3();
  private readonly body = new Vector3();
  private readonly barrels: Barrel[] = [];
  private readonly count: number;
  private readonly windup: number;
  private readonly speed: number;
  private volleyHit = false;
  private readonly damage: number;
  private readonly cooldown: number;
  private readonly width: number;
  private readonly chargeSize: number;
  private meleeMarker: FxQuad | null = null;
  private meleeGlow: FxQuad | null = null;

  constructor(private readonly ctx: LaserContext, readonly target: Target, private readonly player: Player, delay = 3, private readonly pacing?: EnemyAttackPacing) {
    const crawler = target.type.attack === 'mortar';
    const pelican = target.type.attack === 'fan';
    this.count = crawler ? 2 : 1;
    this.windup = crawler ? 1.2 : pelican ? 1 : .7;
    this.speed = crawler ? 7 : pelican ? 8 : 9;
    this.damage = crawler ? 8 : pelican ? 6 : 5;
    this.cooldown = crawler ? 4.8 : pelican ? 3.8 : 2.6;
    this.width = pelican ? .2 : .12;
    this.chargeSize = !crawler && !pelican ? .55 : 1.05;
    this.timer = delay;
    this.generation = target.generation;
  }

  update(dt: number, active = true): void {
    if (!active) { this.reset(); return; }
    if (dt <= 0) return;
    if (this.generation !== this.target.generation) {
      this.reset(); this.generation = this.target.generation; return;
    }
    if (this.player.hp <= 0 || (this.phase !== 'flight' && (!this.target.alive || this.target.stunned > 0))) { this.reset(); return; }
    this.timer -= dt;
    if (this.phase === 'ready') {
      if (this.timer > 0 || this.target.scale < .99 || Vector3.DistanceSquared(this.target.position, this.player.position) > 12 ** 2) return;
      if (this.pacing && !this.pacing.acquire(this)) return;
      if (this.inMeleeRange()) { this.startMelee(); return; }
      this.aim.copyFrom(this.player.position).addInPlaceFromFloats(0, .8, 0);
      this.phase = 'charge'; this.timer = this.windup;
      this.target.attackHold = this.windup + .15;
      for (let i = 0; i < this.count; i++) {
        const barrel: Barrel = {
          origin: new Vector3(), end: new Vector3(), previous: new Vector3(), velocity: new Vector3(), distance: 0, fizzle: null,
          glow: this.ctx.vfx.quad('star', CHARGE), beam: this.ctx.vfx.quad('streak', RED),
          core: this.ctx.vfx.quad('streak', CORE, 0),
        };
        this.ctx.vfx.glowing(barrel.glow);
        this.barrels.push(barrel);
      }
    }
    if (this.phase === 'melee') { this.updateMelee(); return; }
    if (this.phase === 'charge') {
      for (let i = 0; i < this.barrels.length; i++) {
        const barrel = this.barrels[i];
        this.target.muzzle(barrel.origin, i);
        const charge = Math.max(0, Math.min(1, 1 - this.timer / this.windup));
        // Ease in quickly, then build the bright warning toward release.
        // Keep the small central emitter aligned rather than hiding it in a huge bloom.
        this.ctx.vfx.tint(barrel.glow, CHARGE, (.8 + .2 * charge) * chargeFade(this.windup - this.timer));
        this.ctx.vfx.sprite(barrel.glow, barrel.origin, this.chargeSize * (.7 + .3 * charge));
      }
      if (this.timer <= 0) this.fire();
    } else if (this.phase === 'flight') {
      this.updateProjectiles(dt);
    }
  }

  private inMeleeRange(): boolean {
    return Math.hypot(this.player.position.x - this.target.position.x, this.player.position.z - this.target.position.z)
      <= this.target.radius + .95;
  }

  private startMelee(): void {
    this.phase = 'melee'; this.timer = .6;
    this.target.attackHold = .75;
    this.aim.copyFrom(this.player.position);
    this.aim.y = Math.max(.04, this.ctx.snow?.depth(this.aim.x, this.aim.z) ?? 0);
    this.meleeMarker = this.ctx.vfx.quad('warning-ring', RED, .9, 'alpha');
    this.meleeGlow = this.ctx.vfx.quad('star', CHARGE);
    this.ctx.vfx.glowing(this.meleeGlow);
    this.updateMelee();
  }

  private updateMelee(): void {
    const { vfx } = this.ctx;
    vfx.decal(this.meleeMarker!, this.aim, 1.7 / .78);
    this.target.muzzle(this.body);
    vfx.tint(this.meleeGlow!, CHARGE, chargeFade(.6 - this.timer));
    vfx.sprite(this.meleeGlow!, this.body, .4 + .3 * (1 - Math.max(0, this.timer) / .6));
    if (this.timer > 0) return;
    const from = this.target.position.add(new Vector3(0, .8, 0));
    this.body.copyFrom(this.player.position).addInPlaceFromFloats(0, .8, 0);
    const inWarning = Math.hypot(this.player.position.x - this.aim.x, this.player.position.z - this.aim.z) <= .85;
    if (this.inMeleeRange() && inWarning && this.ctx.targets.navigation.traceCover(from, this.body) == null) this.player.takeDamage(6);
    vfx.flashSprite(this.aim.add(new Vector3(0, .65, 0)), PROJECTILE, .7, .12, .9, 'star');
    this.reset();
    this.timer = 1.8;
  }

  private fire(): void {
    this.phase = 'flight';
    this.volleyHit = false;
    this.target.attackHold = 0;
    for (const barrel of this.barrels) {
      barrel.end.copyFrom(barrel.origin);
      barrel.velocity.copyFrom(this.aim).subtractInPlace(barrel.origin).normalize().scaleInPlace(this.speed);
      this.ctx.vfx.tint(barrel.beam, PROJECTILE, 1);
      this.ctx.vfx.tint(barrel.core, CORE, 1);
      this.ctx.vfx.tint(barrel.glow, PROJECTILE, 1);
      this.ctx.vfx.glowing(barrel.beam);
      this.ctx.vfx.glowing(barrel.core);
      this.ctx.vfx.sprite(barrel.glow, barrel.end, .44);
    }
  }

  private updateProjectiles(dt: number): void {
    this.body.copyFrom(this.player.position).addInPlaceFromFloats(0, .8, 0);
    for (let i = this.barrels.length - 1; i >= 0; i--) {
      const barrel = this.barrels[i];
      if (barrel.fizzle !== null) {
        barrel.fizzle += dt;
        if (barrel.fizzle >= RANGE_FIZZLE) {
          this.release(barrel); this.barrels.splice(i, 1);
        } else {
          this.drawFizzle(barrel);
        }
        continue;
      }
      barrel.previous.copyFrom(barrel.end);
      const travel = Math.min(this.speed * dt, 14 - barrel.distance);
      barrel.end.addInPlace(barrel.velocity.scale(travel / this.speed));
      barrel.distance += travel;
      const cover = this.ctx.targets.navigation.traceCover(barrel.previous, barrel.end, this.width * .5) ?? null;
      const contact = segmentSphereContact(barrel.previous, barrel.end, this.body, .45 + this.width * .5);
      const ground = barrel.end.y <= .04
        ? Math.max(0, (barrel.previous.y - .04) / Math.max(.0001, barrel.previous.y - barrel.end.y)) : null;
      const obstruction = Math.min(cover ?? Infinity, ground ?? Infinity);
      const hit = contact != null && contact < obstruction;
      if (hit || obstruction < Infinity) {
        if (hit && !this.volleyHit) {
          this.player.takeDamage(this.damage);
          this.volleyHit = true;
        }
        this.release(barrel); this.barrels.splice(i, 1);
        continue;
      }
      if (barrel.distance >= 14) {
        // Range expiry is visual only: stop movement and collision while the energy withers.
        barrel.fizzle = 0;
        this.drawFizzle(barrel);
        continue;
      }
      // A short luminous segment travels with the bullet; it never spans the firing lane.
      const tail = barrel.end.subtract(barrel.velocity.scale(Math.min(.9, barrel.distance) / this.speed));
      // Increase the luminous envelope independently of the existing hit radius.
      this.ctx.vfx.streak(barrel.beam, tail, barrel.end, this.width * 2.5);
      this.ctx.vfx.streak(barrel.core, tail, barrel.end, this.width * .8);
      this.ctx.vfx.sprite(barrel.glow, barrel.end, .44);
    }
    if (!this.barrels.length) this.reset();
  }

  private drawFizzle(barrel: Barrel): void {
    const t = barrel.fizzle! / RANGE_FIZZLE;
    const remaining = 1 - t;
    const alpha = remaining * remaining;
    const flicker = 1 - .18 * Math.sin(t * Math.PI * 4) ** 2;
    const tail = barrel.end.subtract(barrel.velocity.scale(.9 * remaining / this.speed));
    const { vfx } = this.ctx;
    vfx.streak(barrel.beam, tail, barrel.end, this.width * 2.5 * remaining);
    vfx.streak(barrel.core, tail, barrel.end, this.width * .8 * remaining);
    vfx.sprite(barrel.glow, barrel.end, .44 * remaining * flicker);
    vfx.tint(barrel.beam, PROJECTILE, alpha);
    vfx.tint(barrel.core, CORE, alpha * remaining);
    vfx.tint(barrel.glow, PROJECTILE, alpha * flicker);
  }

  private release(barrel: Barrel): void {
    this.ctx.vfx.release(barrel.glow); this.ctx.vfx.release(barrel.beam); this.ctx.vfx.release(barrel.core);
  }

  private reset(): void {
    this.pacing?.release(this);
    if (this.meleeMarker) this.ctx.vfx.release(this.meleeMarker);
    if (this.meleeGlow) this.ctx.vfx.release(this.meleeGlow);
    this.meleeMarker = this.meleeGlow = null;
    for (const barrel of this.barrels) this.release(barrel);
    this.barrels.length = 0;
    this.phase = 'ready'; this.timer = this.cooldown;
    this.target.attackHold = 0;
  }

  dispose(): void { this.reset(); }
}

function segmentSphereContact(from: Vector3, to: Vector3, center: Vector3, radius: number): number | null {
  const delta = to.subtract(from), offset = from.subtract(center);
  const c = offset.lengthSquared() - radius * radius;
  if (c <= 0) return 0;
  const a = delta.lengthSquared();
  if (a < 1e-12) return null;
  const b = Vector3.Dot(offset, delta), discriminant = b * b - a * c;
  if (discriminant < 0) return null;
  const t = (-b - Math.sqrt(discriminant)) / a;
  return t >= 0 && t <= 1 ? t : null;
}
