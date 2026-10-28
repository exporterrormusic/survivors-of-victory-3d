// Hero passives, all rewarding a deliberate hold. Each waits 3 s so none fires by accident.
// Scarlet drinks to heal (any action stops her), Snow White's damage climbs while she stays put,
// and Rapunzel consecrates ground that grows and keeps buffing damage until she makes a new one.

import { Vector3 } from '@babylonjs/core';
import type { Player } from './player';
import type { KitContext } from './kit';
import type { WaterLayer } from './water';

/** Seconds of holding still before any passive starts. */
export const PASSIVE_DELAY = 3;

/** Scarlet: one drink lasts this long and heals this share of max HP over it; she keeps sipping while idle. */
export const DRINK_TIME = 4, DRINK_HEAL = .096;
/** Scarlet starts drinking after this long without acting (Snow White's Focus keeps PASSIVE_DELAY). */
export const DRINK_DELAY = 2;
/** height above her feet where the drink icons start: just over the HUD health bar (2.55 m) */
const DRINK_ICONS = 3.3;
/** after this long drinking she passes out: the last frame of her death clip */
export const PASS_OUT = 5;
/** Snow White: damage gained per second held after the delay, and its cap. */
export const FOCUS_RATE = .1, FOCUS_MAX = .5;
/** Cold Focus talent: Focus starts after this long instead of PASSIVE_DELAY, and survives this long after moving. */
export const COLD_FOCUS_DELAY = 1, COLD_FOCUS_GRACE = 1.5;
/** the shot origin sits low on her barrel; the sparkle rides this far above it */
const SPARKLE_LIFT = .02;
/** Rapunzel: the zone grows from START to MAX radius by GROW seconds of stillness, slowly at first; bonus while inside. */
export const ZONE_START = 2, ZONE_MAX = 12, ZONE_GROW = 20, ZONE_BONUS = .2;
/** seconds for a zone to fade in, and for a replaced one to fade out */
const ZONE_FADE = 1;
/** seconds for a new zone to bloom from a point out to its starting radius */
const ZONE_OPEN = 2.5;

const DRINK_PINK = [1, .45, .55] as const, SAKE = [1, .86, .55] as const;
const FOCUS_BLUE = [.6, .85, 1] as const;

export interface HeroPassive {
  update(dt: number): void;
  /** for the HUD and tests: 0..1 progress of the passive */
  readonly level: number;
}

export function createPassive(id: string, player: Player, ctx: KitContext, water: WaterLayer): HeroPassive | null {
  if (id === 'scarlet') return drinking(player, ctx);
  if (id === 'snow-white') return focus(player, ctx);
  if (id === 'rapunzel') return sacredGround(player, ctx, water);
  return null;
}

function drinking(player: Player, ctx: KitContext): HeroPassive {
  let sip = 0, drank = 0, drinking = false;
  return {
    get level() { return drinking ? sip / DRINK_TIME : 0; },
    update(dt) {
      const hurt = player.hp > 0 && player.hp < player.maxHp;
      const start = player.idleTime >= DRINK_DELAY && hurt;
      if (!start) {
        if (drinking) { player.heldClip = null; player.heldLast = false; }
        drinking = false; sip = drank = 0;
        return;
      }
      if (!drinking) {
        drinking = true; player.heldClip = 'stun'; player.heldLast = false; sip = drank = 0;
        drunkEffect(ctx, player, () => drinking);
      }
      sip = (sip + dt) % DRINK_TIME;
      drank += dt;
      if (drank >= PASS_OUT && !player.heldLast) { player.heldClip = 'death'; player.heldLast = true; }
      player.hp = Math.min(player.maxHp, player.hp + player.maxHp * DRINK_HEAL / DRINK_TIME * dt);
    },
  };
}

/** Unmistakable tipsy read while she drinks: a swigging sake bottle and rising bubbles, all drawn over models. */
function drunkEffect(ctx: KitContext, player: Player, alive: () => boolean): void {
  const vfx = ctx.vfx, top = new Vector3(), at = new Vector3();
  const bottle = vfx.quad('sake', SAKE);
  const bubbles = Array.from({ length: 7 }, (_, i) => ({ q: vfx.quad('bubble', i % 2 ? SAKE : DRINK_PINK), phase: i / 7 }));
  vfx.glowing(bottle);
  // Status icons stay readable over her model and any nearby effects.
  for (const q of [bottle, ...bubbles.map(b => b.q)]) q.onTop = true;
  let out = 0;
  vfx.add({
    update: (dt, age) => {
      // Eases in and out gently; no pop when she starts or stops.
      const ease = (t: number) => t * t * (3 - 2 * t);
      out = alive() ? 0 : out + dt;
      const a = ease(Math.min(1, age / 1.2)) * ease(Math.max(0, 1 - out / .8));
      if (a <= 0) return false;
      // Icons stack above the health bar, clear of her hat.
      top.copyFrom(player.position).addInPlaceFromFloats(0, DRINK_ICONS, 0);
      // The bottle hovers above the bubble column, clear of her hat, tipping to swig every second and a half.
      const swig = Math.max(0, Math.sin(age * Math.PI / .75)) ** 2;
      at.copyFrom(top).addInPlaceFromFloats(0, 1.75 + Math.sin(age * 3) * .05, 0);
      // The atlas glyph draws inverted on sprites, hence the half turn; the swig tips its neck toward her.
      vfx.sprite(bottle, at, .8 + swig * .1, Math.PI - .25 - swig * 1.1);
      vfx.tint(bottle, SAKE, a);
      bubbles.forEach((b, i) => {
        const t = (age * .55 + b.phase) % 1;
        at.copyFrom(top).addInPlaceFromFloats(Math.sin(i * 2.4 + t * 6) * .4, .1 + t * 1.3, 0);
        vfx.sprite(b.q, at, .25 + (i % 3) * .08 + t * .1);
        vfx.tint(b.q, i % 2 ? SAKE : DRINK_PINK, a * Math.sin(t * Math.PI) * .9);
      });
      return true;
    },
    dispose: () => { for (const q of [bottle, ...bubbles.map(b => b.q)]) vfx.release(q); },
  });
}

function focus(player: Player, ctx: KitContext): HeroPassive {
  const vfx = ctx.vfx, muzzle = new Vector3();
  // A twinkling sparkle on her gun tip that grows and brightens with focus.
  const sparkle = vfx.quad('star', FOCUS_BLUE, 0), core = vfx.quad('glow', FOCUS_BLUE, 0);
  vfx.glowing(sparkle);
  // Drawn over every model so her body never hides it, whichever way she faces.
  sparkle.onTop = core.onTop = true;
  let step = 0, shown = 0, level = 0, glint = 0;
  // Seconds of focus built; Cold Focus starts it sooner and keeps it through a short step.
  let ramp = 0, grace = 0;
  const bonus = () => Math.min(FOCUS_MAX, ramp * FOCUS_RATE);
  // Drawn in the effect pass, after the torso is aimed, so it sits exactly on this frame's gun tip.
  vfx.add({
    update: (_dt, clock) => {
      if (shown < .01) { sparkle.visible = core.visible = false; return true; }
      ctx.muzzle(muzzle).y += SPARKLE_LIFT;
      const twinkle = .8 + .2 * Math.sin(clock * 9) + (level >= 1 ? .15 * Math.sin(clock * 4) : 0);
      vfx.sprite(sparkle, muzzle, (.45 + level * .5) * twinkle, clock * .8);
      vfx.tint(sparkle, FOCUS_BLUE, shown * twinkle);
      vfx.sprite(core, muzzle, .3 + level * .2);
      vfx.tint(core, FOCUS_BLUE, shown * .8);
      // A brighter glint each time focus deepens a step.
      if (glint) { vfx.flashSprite(muzzle, FOCUS_BLUE, glint, .35, .9, 'star'); glint = 0; }
      return true;
    },
  });
  return {
    get level() { return bonus() / FOCUS_MAX; },
    update(dt) {
      const cold = ctx.run.talents.has('cold_focus');
      if (player.hp <= 0) ramp = 0;
      else if (player.stillTime > 0) {
        grace = cold ? COLD_FOCUS_GRACE : 0;
        if (player.stillTime >= (cold ? COLD_FOCUS_DELAY : PASSIVE_DELAY)) ramp += dt;
      } else if ((grace -= dt) <= 0) ramp = 0;
      const b = bonus();
      level = b / FOCUS_MAX;
      ctx.run.passiveScale = 1 + b;
      // Ease toward the target so the sparkle fades in and out rather than popping.
      const target = b > 0 ? .4 + .6 * level : 0;
      shown += (target - shown) * Math.min(1, dt * (target > shown ? 3 : 8));
      const next = Math.round(b / FOCUS_RATE);
      if (next > step) glint = next * FOCUS_RATE >= FOCUS_MAX ? .9 : .5;
      step = next;
    },
  };
}

function sacredGround(player: Player, ctx: KitContext, water: WaterLayer): HeroPassive {
  const centre = new Vector3(), oldCentre = new Vector3();
  let radius = 0, growth = 0, opening = 0, active = false, fade = 0, oldRadius = 0, oldFade = 0;
  const inside = () => radius > 0 && Math.hypot(player.position.x - centre.x, player.position.z - centre.z) <= radius;
  return {
    get level() { return radius / ZONE_MAX; },
    update(dt) {
      if (player.stillTime >= PASSIVE_DELAY && player.hp > 0) {
        if (!active) {
          active = true;
          // Settling after any move starts a fresh zone; the previous one fades out.
          if (radius > 0) { oldCentre.copyFrom(centre); oldRadius = radius; oldFade = fade; }
          fade = 0;
          centre.set(player.position.x, 0, player.position.z);
          growth = radius = opening = 0;
        }
        growth = Math.min(ZONE_GROW - PASSIVE_DELAY, growth + dt);
        const t = growth / (ZONE_GROW - PASSIVE_DELAY);
        opening = Math.min(1, opening + dt / ZONE_OPEN);
        // Opens from a point, then the slow growth adds on top.
        radius = Math.max(radius, .02 + (ZONE_START - .02) * opening * opening * (3 - 2 * opening) + (ZONE_MAX - ZONE_START) * t * t);
      } else active = false;
      if (radius > 0) fade = Math.min(1, fade + dt / ZONE_FADE);
      oldFade = Math.max(0, oldFade - dt / ZONE_FADE);
      if (oldFade === 0) oldRadius = 0;
      const ease = (t: number) => t * t * (3 - 2 * t);
      water.setZone(centre.x, centre.z, radius, ease(fade));
      water.setOldZone(oldCentre.x, oldCentre.z, oldRadius, ease(oldFade));
      ctx.run.passiveScale = inside() ? 1 + ZONE_BONUS : 1;
    },
  };
}

