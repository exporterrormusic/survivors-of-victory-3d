// Snow White's sniper round: a lance of cold blue fire that pierces everything in its path
// (Survivors: 1650 px/s, 999 hits, 360 px visual reaching forward from a 50x12 body).
// In 3D it is four camera-facing layers (bloom, outer flame, cyan, white core) stretched from the
// muzzle to the round, a muzzle star with flame tongues and light, and a spark burst per hit.

import { Vector3 } from '@babylonjs/core';
import { WEAPON_FIRE } from '../../audio/sound-bank';
import { PX, type KitContext } from '../kit';
import type { Target } from '../targets';
import type { Effect } from '../vfx';
import { SNOW } from './palette';
import { afterburnHalfWidth, blueFireTrail } from './blue-fire';
import { snowShieldsTarget } from '../projectile-collision';

const SPEED = 1650 * PX * 1.5; // a touch faster than the 2D round reads better at 3D scale
const RANGE = 5000 * PX;
const LANCE = 360 * PX;
const HIT_PAD = .12;
/** width of each layer, metres, and its strength */
const LAYERS = [
  { color: SNOW.bloom, width: .95, alpha: .22 },
  { color: SNOW.outer, width: .62, alpha: .4 },
  { color: SNOW.cyan, width: .34, alpha: .85 },
  { color: SNOW.core, width: .13, alpha: 1 },
] as const;

/** Weak Point: +50% damage taken for 4 s (one mark per target; Armor Break is stronger). */
const WEAK_POINT_BONUS = .5, WEAK_POINT_TIME = 4;
const INFERNO_TIME = 5;
/** Unyielding heals once per this many rifle hits on heavies and bosses. */
const UNYIELDING_HITS = 10;

/** Per-kit rifle state shared by every shot. `attack` is the unscaled base damage. */
export interface LanceState { readonly attack: number; heavyHits: number }

/**
 * One rifle round. `damage` is this shot's hit damage (charge and Seventh Dwarf already applied);
 * fire, explosions and burns scale from the base attack so a big shot doesn't multiply them.
 */
export function fireLance(ctx: KitContext, muzzle: Vector3, aim: Vector3, damage: number, width: number, state: LanceState): void {
  const { vfx, targets, run } = ctx;
  const dir = aim.subtract(muzzle);
  dir.y = 0;
  if (dir.lengthSquared() < 1e-6) return;
  dir.normalize();
  run.beginShot();
  const origin = muzzle.clone();
  const attack = state.attack;
  let refunded = false;
  muzzleFlash(ctx, origin, dir);
  ctx.sound(WEAPON_FIRE.sniper, origin);

  const quads = LAYERS.map((l) => vfx.quad('lance', l.color, l.alpha));
  vfx.glowing(quads[3]);
  const wake = vfx.quad('streak', SNOW.cyan, .35);
  const hit = new Set<Target>();
  const head = new Vector3();
  const tail = new Vector3();
  const wakeTail = origin.clone();
  let travelled = 0;
  let wakeFade = 0;
  let done = false;
  if (run.talents.has('afterburn')) fireTrail(ctx, origin, dir, attack, width, () => travelled);
  const effect: Effect = {
    update: (dt, age) => {
      if (!done) {
        const step = Math.min(SPEED * dt, RANGE - travelled);
        const from = origin.add(dir.scale(travelled)), to = from.add(dir.scale(step));
        const cover = ctx.targets.navigation.traceCover(from, to, HIT_PAD * width) ?? null;
        const shield = targets.shieldContact(from, to);
        const snowHit = shield && shield.t < (cover ?? 1) ? shield.t : cover;
        const allowed = step * (snowHit ?? 1);
        // hits along this frame's step
        for (const { target, at } of targets.alongSegment(from, dir, allowed, HIT_PAD * width)) {
          if (snowHit !== null && at >= allowed) break;
          if (hit.has(target)) continue;
          if (snowShieldsTarget(ctx, origin, target, origin.y - target.position.y)) continue;
          hit.add(target);
          const point = origin.add(dir.scale(travelled + at));
          point.y = Math.min(point.y, target.barHeight * .5);
          run.damage(target, damage, 'attack', dir.scale(1.2));
          if (target.alive && run.talents.has('weak_point')) target.marks.add('weak-point', WEAK_POINT_BONUS, WEAK_POINT_TIME);
          if (target.alive && run.talents.has('inferno')) run.burn(target, 'inferno', attack, INFERNO_TIME);
          if (run.talents.has('unyielding') && target.alive && (target.combatTier === 'heavy' || target.combatTier === 'boss')
            && ++state.heavyHits % UNYIELDING_HITS === 0) ctx.heal(1);
          if (!target.alive) {
            if (run.talents.has('unyielding')) ctx.heal(1);
            if (run.talents.has('quick_hands') && !refunded) { refunded = true; ctx.refundRound?.(); }
            if (run.talents.has('explosive_rounds') && Math.random() < .25) {
              vfx.ring(target.position, SNOW.cyan, .2, 2, .3, .8);
              vfx.flashSprite(point, SNOW.core, 2, .2, .9);
              for (const nearby of targets.inRadius(target.position, 2))
                if (!snowShieldsTarget(ctx, point, nearby)) run.damage(nearby, attack, 'effect');
            }
          }
          impact(ctx, point, dir);
        }
        travelled += allowed;
        if (snowHit !== null) {
          const contact = from.add(dir.scale(allowed));
          impact(ctx, contact, dir.scale(-1));
          if (shield && snowHit === shield.t) shield.shield.block(contact, damage);
          else vfx.vapour(contact, 7, [.82, .92, 1], .65, .65, .6);
          done = true;
        } else if (travelled >= RANGE) done = true;
      } else {
        wakeFade += dt;
      }
      const flicker = .97 + Math.sin(age * 16) * .03;
      head.copyFrom(origin).addInPlace(dir.scale(Math.min(travelled, RANGE)));
      tail.copyFrom(origin).addInPlace(dir.scale(Math.max(0, travelled - LANCE)));
      const fade = done ? Math.max(0, 1 - wakeFade / .12) : 1;
      LAYERS.forEach((l, i) => {
        vfx.streak(quads[i], tail, head, l.width * width * (i === 3 ? 1 : flicker));
        vfx.tint(quads[i], l.color, l.alpha * fade);
      });
      // a thin heat line lingers behind the lance and fades from the muzzle forward
      wakeTail.copyFrom(origin).addInPlace(dir.scale(Math.min(travelled, age * SPEED * .55)));
      vfx.streak(wake, wakeTail, tail, .07);
      vfx.tint(wake, SNOW.cyan, .3 * Math.max(0, 1 - age / .45) * fade);
      return !done || wakeFade < .12;
    },
    dispose: () => {
      for (const q of quads) vfx.release(q);
      vfx.release(wake);
    },
  };
  vfx.add(effect);
}

/** A continuous, damaging ground trail. Its reach follows the actual projectile. */
function fireTrail(ctx: KitContext, origin: Vector3, dir: Vector3, damage: number, width: number, distance: () => number): void {
  const { vfx, run, targets } = ctx;
  const from = new Vector3(origin.x, .08, origin.z);
  const fire = blueFireTrail(ctx, from, dir, width, RANGE);
  let tick = 0;
  const life = RANGE / SPEED + 3;
  vfx.add({
    update: (dt, age) => {
      if (age >= life) return false;
      fire.update(age, Math.min(distance(), RANGE), Math.min(1, (life - age) / .7) * .85);
      tick += dt;
      if (tick >= .5) {
        tick -= .5;
        for (const { target } of targets.alongSegment(from, dir, Math.min(distance(), RANGE), afterburnHalfWidth(width))) {
          if (snowShieldsTarget(ctx, origin, target, origin.y - target.position.y)) continue;
          run.damage(target, damage * .5, 'effect');
          // Inferno sets anything the trail touches alight too (its slow is applied to every burn).
          if (run.talents.has('inferno')) run.burn(target, 'inferno', damage, INFERNO_TIME);
        }
      }
      return true;
    },
    dispose: () => fire.dispose(),
  });
}

/** Muzzle: a four-point star, forward flame tongues and a glow that stay on the moving gun tip,
 * cold vapour, and a soft swell of light (a hard per-shot strobe flickered against the shadows). */
function muzzleFlash(ctx: KitContext, at: Vector3, dir: Vector3): void {
  const { vfx } = ctx;
  const side = new Vector3(dir.z, 0, -dir.x);
  const tip = at.clone();
  const life = .13;
  const star = vfx.quad('star', SNOW.core, 1);
  const glow = vfx.quad('glow', SNOW.cyan, .6);
  const bloom = vfx.quad('glow', SNOW.bloom, .35);
  // a long tongue along the barrel and four short ones fanning out: [angle, length, width, life share]
  const tongues = ([[0, 1.25, .5, .7], [.55, .55, .26, .6], [-.55, .55, .26, .6], [.25, .8, .34, .7], [-.25, .8, .34, .7]] as const)
    .map(([angle, length, width, share]) => ({
      q: vfx.quad('tongue', SNOW.cyan, .95), d: dir.scale(Math.cos(angle)).addInPlace(side.scale(Math.sin(angle))), length, width,
      life: life * share * (.85 + Math.random() * .3),
    }));
  const spin = Math.random() * Math.PI;
  vfx.add({
    update: (_dt, age) => {
      const t = age / life;
      if (t >= 1) return false;
      ctx.muzzle(tip);
      vfx.sprite(star, tip, .75 * (.7 + .3 * t), spin);
      vfx.tint(star, SNOW.core, Math.max(0, 1 - t / .55));
      vfx.sprite(glow, tip, 1.5 * (.6 + .4 * t));
      vfx.tint(glow, SNOW.cyan, .6 * (1 - t) * (1 - t));
      vfx.sprite(bloom, tip.add(dir.scale(.35)), 2.2);
      vfx.tint(bloom, SNOW.bloom, .35 * (1 - t) * (1 - t));
      for (const g of tongues) {
        const k = age / g.life;
        vfx.streak(g.q, tip, tip.add(g.d.scale(g.length * (.6 + .6 * Math.min(1, k)))), g.width * (1 - Math.min(1, k) * .5));
        vfx.tint(g.q, k < .4 ? SNOW.core : SNOW.cyan, .95 * Math.max(0, 1 - k));
      }
      return true;
    },
    dispose: () => {
      for (const q of [star, glow, bloom, ...tongues.map((g) => g.q)]) vfx.release(q);
    },
  });
  vfx.flash(at, SNOW.cyan, 1.1, 5, .18);
  vfx.vapour(at.add(dir.scale(.25)), 3, SNOW.outer, .35, .4, .5);
}

function impact(ctx: KitContext, at: Vector3, dir: Vector3): void {
  const { vfx } = ctx;
  vfx.flashSprite(at, SNOW.core, .55, .08, 1, 'star');
  vfx.flashSprite(at, SNOW.cyan, 1.3, .16, .7);
  vfx.sparks(at, 14, SNOW.cyan, SNOW.core, 9, dir, .7, 1);
  vfx.vapour(at, 2, SNOW.outer, .4, .5, .45);
}
