// The supply squad's guns. Each mass-produced model carries a real weapon type, and the type sets
// how it fights (range it keeps, how it fires, what it does on hit) and how its shots look.
//
//   assault rifle  three-round bursts, mid range       Soldier EG, iDoll Sun
//   SMG            fast short bursts, close range      Soldier OW, iDoll Ocean
//   minigun        spins up, then a long stream        Product 12
//   sniper         slow piercing shot, laser sight     Product 08
//   shotgun        five-pellet cone, point blank       Soldier FA, Product 23
//   rocket         slow rocket, splash on impact       iDoll Flower
//
// Damage per second is kept close across types (~3 at level 1); the squad supports, it doesn't carry.

import { Vector3 } from '@babylonjs/core';
import type { Run } from '../run';
import type { Target, TargetField } from '../targets';
import type { FxQuad, Rgb, Vfx } from '../vfx';

export type SquadWeaponKind = 'assault' | 'smg' | 'minigun' | 'sniper' | 'shotgun' | 'rocket';

export interface SquadWeapon {
  readonly kind: SquadWeaponKind;
  /** furthest it will shoot */
  readonly range: number;
  /** the distance it tries to keep from its target */
  readonly prefer: number;
  readonly damage: number;
  /** shots per trigger pull, and the gap between them */
  readonly burst: number;
  readonly burstGap: number;
  /** rest after a burst */
  readonly cooldown: number;
  /** projectiles per shot, spread across `spread` radians */
  readonly pellets: number;
  readonly spread: number;
  /** seconds of wind-up before the first shot of a burst (minigun spin, sniper laser) */
  readonly windup: number;
  /** holds a steady aim pose while firing (automatic) instead of playing the shot clip per shot */
  readonly automatic: boolean;
  /** targets each shot passes through */
  readonly pierce: number;
  /** rocket splash radius (0: hitscan) */
  readonly splash: number;
  /** walking pace while firing */
  readonly firingPace: number;
}

export const SQUAD_WEAPONS: Readonly<Record<SquadWeaponKind, SquadWeapon>> = {
  assault: { kind: 'assault', range: 13, prefer: 9, damage: 2, burst: 3, burstGap: .11, cooldown: 1.6, pellets: 1, spread: .05, windup: 0, automatic: true, pierce: 1, splash: 0, firingPace: .8 },
  smg: { kind: 'smg', range: 9, prefer: 5.5, damage: 1, burst: 5, burstGap: .07, cooldown: 1.2, pellets: 1, spread: .12, windup: 0, automatic: true, pierce: 1, splash: 0, firingPace: 1 },
  minigun: { kind: 'minigun', range: 12, prefer: 8, damage: 1, burst: 14, burstGap: .085, cooldown: 2.2, pellets: 1, spread: .09, windup: .55, automatic: true, pierce: 1, splash: 0, firingPace: .45 },
  sniper: { kind: 'sniper', range: 22, prefer: 15, damage: 10, burst: 1, burstGap: 0, cooldown: 2.6, pellets: 1, spread: 0, windup: .45, automatic: false, pierce: 3, splash: 0, firingPace: .3 },
  shotgun: { kind: 'shotgun', range: 6.5, prefer: 3.8, damage: 1, burst: 1, burstGap: 0, cooldown: 1.5, pellets: 5, spread: .42, windup: 0, automatic: false, pierce: 1, splash: 0, firingPace: .9 },
  rocket: { kind: 'rocket', range: 15, prefer: 10, damage: 6, burst: 1, burstGap: 0, cooldown: 3, pellets: 1, spread: 0, windup: .2, automatic: false, pierce: 1, splash: 2.4, firingPace: .6 },
};

/** model id → weapon */
export const MODEL_WEAPONS: Readonly<Record<string, SquadWeaponKind>> = {
  c300_00: 'assault', c308_00: 'assault',
  c306_00: 'smg', c305_00: 'smg',
  c303_00: 'minigun',
  c302_00: 'sniper',
  c301_00: 'shotgun', c307_00: 'shotgun',
  c304_00: 'rocket',
};

const BULLET: Rgb = [1.7, 1.25, .55];
const BULLET_CORE: Rgb = [2.4, 2.1, 1.6];
const SMG: Rgb = [1.9, 1.6, .7];
const MINIGUN: Rgb = [2.2, .95, .3];
const SNIPER: Rgb = [.75, 1.6, 2.6];
const SNIPER_CORE: Rgb = [2.6, 2.8, 3];
const PELLET: Rgb = [2, 1.35, .6];
const ROCKET: Rgb = [2.6, 1.1, .35];
const BLAST: Rgb = [2.4, .9, .25];
const SMOKE: Rgb = [.55, .55, .58];

interface Streak { glow: FxQuad; core: FxQuad; from: Vector3; to: Vector3; age: number; life: number; width: number; color: Rgb; coreColor: Rgb; travel: boolean }
interface Rocket { at: Vector3; velocity: Vector3; travelled: number; range: number; body: FxQuad; trail: FxQuad; smokeIn: number; damage: number; splash: number }

/** Resolves squad shots against the Raptures and draws them. One per supply lift. */
export class SquadGunfire {
  private readonly streaks: Streak[] = [];
  private readonly rockets: Rocket[] = [];

  constructor(private readonly vfx: Vfx, private readonly field: TargetField, private readonly run: Run) {}

  /**
   * One trigger pull of `weapon` from `muzzle` at `target` (pellets and spread included). Hitscan
   * weapons resolve now; rockets fly.
   */
  fire(weapon: SquadWeapon, muzzle: Vector3, target: Target): void {
    const chest = target.position.add(new Vector3(0, Math.min(1.4, target.barHeight * .45), 0));
    const base = Math.atan2(chest.x - muzzle.x, chest.z - muzzle.z);
    this.muzzleFlash(weapon, muzzle, base);
    if (weapon.kind === 'rocket') { this.launch(weapon, muzzle, chest); return; }
    for (let i = 0; i < weapon.pellets; i++) {
      const yaw = base + (weapon.pellets > 1 ? (i / (weapon.pellets - 1) - .5) * weapon.spread : (Math.random() - .5) * weapon.spread);
      const dir = new Vector3(Math.sin(yaw), (chest.y - muzzle.y) / Math.max(1, Vector3.Distance(muzzle, chest)), Math.cos(yaw)).normalize();
      this.hitscan(weapon, muzzle, dir);
    }
  }

  update(dt: number): void {
    this.updateStreaks(dt);
    this.updateRockets(dt);
  }

  dispose(): void {
    for (const s of this.streaks) { this.vfx.release(s.glow); this.vfx.release(s.core); }
    for (const r of this.rockets) { this.vfx.release(r.body); this.vfx.release(r.trail); }
    this.streaks.length = this.rockets.length = 0;
  }

  // --- hitscan --------------------------------------------------------------------------------

  private hitscan(weapon: SquadWeapon, from: Vector3, dir: Vector3): void {
    const flatFrom = { x: from.x, y: 1.1, z: from.z };
    const far = from.add(dir.scale(weapon.range));
    const cover = this.field.navigation.traceCover(flatFrom, { x: far.x, y: 1.1, z: far.z });
    const limit = cover ?? 1;
    // Everything the ray touches before cover, nearest first; a sniper round passes through several.
    const hits: { t: number; target: Target }[] = [];
    for (const target of this.field.targets) {
      if (!target.alive || target.scale < .99) continue;
      const t = raySphere(from, far, target.position.add(new Vector3(0, Math.min(1.4, target.barHeight * .45), 0)), target.radius + .15);
      if (t !== null && t <= limit) hits.push({ t, target });
    }
    hits.sort((a, b) => a.t - b.t);
    const struck = hits.slice(0, weapon.pierce);
    const endT = struck.length && struck.length >= weapon.pierce ? struck[struck.length - 1].t : limit;
    const end = Vector3.Lerp(from, far, endT);
    for (const { target, t } of struck) {
      const at = Vector3.Lerp(from, far, t);
      const knock = dir.scale(weapon.kind === 'shotgun' ? 1.6 : weapon.kind === 'sniper' ? 2.2 : .5); knock.y = 0;
      this.run.damage(target, weapon.damage, 'effect', knock);
      this.impact(weapon, at);
    }
    if (!struck.length && cover !== null) this.vfx.flashSprite(end, BULLET, .25, .08, .7, 'star');
    this.streak(weapon, from, end);
  }

  private streak(weapon: SquadWeapon, from: Vector3, to: Vector3): void {
    const style: Record<SquadWeaponKind, [Rgb, Rgb, number, number, boolean]> = {
      // color, core, width, life, travels (a bolt flying) or lingers (a full beam). Widths are
      // generous on purpose: at the top-down camera a thin tracer reads as nothing firing.
      assault: [BULLET, BULLET_CORE, .26, .13, true],
      smg: [SMG, BULLET_CORE, .2, .1, true],
      minigun: [MINIGUN, BULLET_CORE, .22, .11, true],
      sniper: [SNIPER, SNIPER_CORE, .42, .45, false],
      shotgun: [PELLET, BULLET_CORE, .18, .13, true],
      rocket: [ROCKET, BULLET_CORE, .26, .13, true],
    };
    const [color, coreColor, width, life, travel] = style[weapon.kind];
    const glow = this.vfx.quad('streak', color), core = this.vfx.quad('streak', coreColor);
    this.vfx.glowing(glow);
    this.streaks.push({ glow, core, from: from.clone(), to: to.clone(), age: 0, life, width, color, coreColor, travel });
  }

  private updateStreaks(dt: number): void {
    for (let i = this.streaks.length - 1; i >= 0; i--) {
      const s = this.streaks[i];
      s.age += dt;
      const k = s.age / s.life;
      if (k >= 1) { this.vfx.release(s.glow); this.vfx.release(s.core); this.streaks.splice(i, 1); continue; }
      // Bolts race from the muzzle to the hit; beams appear whole and thin out.
      // Bolts are long (a third of the shot) so the line of fire reads at a glance.
      const head = s.travel ? Vector3.Lerp(s.from, s.to, Math.min(1, k * 1.8)) : s.to;
      const tail = s.travel ? Vector3.Lerp(s.from, s.to, Math.max(0, k * 1.8 - .9)) : s.from;
      const fade = s.travel ? 1 - k : (1 - k) ** 1.5;
      this.vfx.streak(s.glow, tail, head, s.width * (s.travel ? 1 : 1 + k));
      this.vfx.streak(s.core, tail, head, s.width * .4 * (s.travel ? 1 : 1 - k));
      this.vfx.tint(s.glow, s.color, fade); this.vfx.tint(s.core, s.coreColor, fade);
    }
  }

  private muzzleFlash(weapon: SquadWeapon, at: Vector3, yaw: number): void {
    const dir = new Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    switch (weapon.kind) {
      case 'sniper':
        this.vfx.flashSprite(at, SNIPER, 1.6, .16, 1, 'star');
        this.vfx.flash(at, SNIPER, 1.2, 4, .12);
        this.vfx.sparks(at, 6, SNIPER, SNIPER_CORE, 4, dir, .3, .8);
        break;
      case 'shotgun':
        this.vfx.flashSprite(at, PELLET, 1.5, .12, 1, 'star');
        this.vfx.flash(at, PELLET, 1, 3.5, .1);
        this.vfx.sparks(at, 8, PELLET, BULLET_CORE, 6, dir, .6, .7);
        this.vfx.vapour(at, 2, SMOKE, .5, .4, .5);
        break;
      case 'rocket':
        this.vfx.flashSprite(at, ROCKET, 1.6, .18, 1, 'star');
        this.vfx.vapour(at.subtract(dir.scale(.4)), 4, SMOKE, .8, .3, .8);
        break;
      case 'minigun':
        this.vfx.flashSprite(at, MINIGUN, .85, .07, 1, 'star');
        this.vfx.sparks(at, 2, MINIGUN, BULLET_CORE, 5, dir, .5, .7);
        break;
      default:
        this.vfx.flashSprite(at, weapon.kind === 'smg' ? SMG : BULLET, .8, .07, 1, 'star');
        this.vfx.sparks(at, 2, weapon.kind === 'smg' ? SMG : BULLET, BULLET_CORE, 5, dir, .5, .7);
    }
  }

  private impact(weapon: SquadWeapon, at: Vector3): void {
    if (weapon.kind === 'sniper') {
      this.vfx.flashSprite(at, SNIPER, 1.8, .2, 1, 'star');
      this.vfx.sparks(at, 14, SNIPER, SNIPER_CORE, 7);
    } else if (weapon.kind === 'shotgun') {
      this.vfx.flashSprite(at, PELLET, .6, .08, .9, 'star');
      this.vfx.sparks(at, 4, PELLET, BULLET_CORE, 5);
    } else {
      this.vfx.flashSprite(at, weapon.kind === 'minigun' ? MINIGUN : BULLET, .65, .08, 1, 'star');
      this.vfx.sparks(at, 3, weapon.kind === 'minigun' ? MINIGUN : BULLET, BULLET_CORE, 4);
    }
  }

  // --- rockets --------------------------------------------------------------------------------

  private launch(weapon: SquadWeapon, from: Vector3, to: Vector3): void {
    const velocity = to.subtract(from); velocity.y *= .6;
    const range = Math.min(weapon.range + 2, velocity.length() + 1.5);
    velocity.normalize().scaleInPlace(17);
    const body = this.vfx.quad('glow', ROCKET), trail = this.vfx.quad('streak', ROCKET);
    this.vfx.glowing(body); this.vfx.glowing(trail);
    this.rockets.push({ at: from.clone(), velocity, travelled: 0, range, body, trail, smokeIn: 0, damage: weapon.damage, splash: weapon.splash });
  }

  private updateRockets(dt: number): void {
    for (let i = this.rockets.length - 1; i >= 0; i--) {
      const r = this.rockets[i];
      const next = r.at.add(r.velocity.scale(dt));
      const cover = this.field.navigation.traceCover({ x: r.at.x, y: 1.1, z: r.at.z }, { x: next.x, y: 1.1, z: next.z });
      let contact = cover !== null;
      if (!contact) for (const target of this.field.targets) {
        if (target.alive && target.scale >= .99 && Math.hypot(target.position.x - next.x, target.position.z - next.z) < target.radius + .3) { contact = true; break; }
      }
      r.travelled += r.velocity.length() * dt;
      if (contact || r.travelled >= r.range) {
        this.explode(cover !== null ? Vector3.Lerp(r.at, next, cover) : next, r.damage, r.splash);
        this.vfx.release(r.body); this.vfx.release(r.trail);
        this.rockets.splice(i, 1);
        continue;
      }
      r.at.copyFrom(next);
      this.vfx.sprite(r.body, r.at, .75);
      this.vfx.streak(r.trail, r.at.subtract(r.velocity.scale(.09)), r.at, .4);
      if ((r.smokeIn -= dt) <= 0) { r.smokeIn = .05; this.vfx.vapour(r.at, 1, SMOKE, .45, .2, .6); }
    }
  }

  private explode(at: Vector3, damage: number, radius: number): void {
    for (const target of this.field.targets) {
      if (!target.alive || target.scale < .99) continue;
      const d = Math.hypot(target.position.x - at.x, target.position.z - at.z) - target.radius;
      if (d > radius) continue;
      const knock = target.position.subtract(at); knock.y = 0;
      if (knock.lengthSquared() > 1e-6) knock.normalize().scaleInPlace(2.5);
      // Full damage at the centre, half at the edge.
      this.run.damage(target, Math.max(1, Math.round(damage * (1 - .5 * Math.max(0, d) / radius))), 'effect', knock);
    }
    const ground = new Vector3(at.x, .05, at.z);
    this.vfx.flashSprite(at, BLAST, radius * 1.1, .22, 1, 'star');
    this.vfx.flashSprite(at, ROCKET, radius * .8, .35, .8, 'glow');
    this.vfx.ring(ground, BLAST, radius * .3, radius, .3, .9);
    this.vfx.groundGlow(ground, BLAST, radius * .8, .6, .5);
    this.vfx.sparks(at, 16, BLAST, BULLET_CORE, 8);
    this.vfx.vapour(at, 6, SMOKE, 1.2, .8, 1.1);
    this.vfx.flash(at, BLAST, 2.5, radius * 3, .25);
  }
}

/** Where the segment from→to first meets a sphere, as 0..1 along it, or null. */
function raySphere(from: Vector3, to: Vector3, center: Vector3, radius: number): number | null {
  const d = to.subtract(from), f = from.subtract(center);
  const a = d.lengthSquared(), b = 2 * Vector3.Dot(f, d), c = f.lengthSquared() - radius * radius;
  if (c <= 0) return 0;
  const disc = b * b - 4 * a * c;
  if (disc < 0 || a < 1e-9) return null;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  return t >= 0 && t <= 1 ? t : null;
}
