// One mechanical death burst shared by every damage source. A compact flash covers the
// collapse, then cools into fading embers; pooled quads keep simultaneous kills reusable.
import { Vector3 } from '@babylonjs/core';
import { type Effect, type Rgb, type Vfx } from './vfx';
import { smoothstep } from './math';

/** Hold the final pose for the flash, then collapse entirely inside the opaque plume. */
export const DEATH_COVER_DELAY = .04;
export const DEATH_COLLAPSE_TIME = .08;
const LIFE = .68;
const HOT: Rgb = [1, .9, .65];
const FIRE: Rgb = [1, .43, .09];
const CINDER: Rgb = [.38, .16, .055];
const SOOT: Rgb = [.16, .17, .19];
const WHITE: Rgb = [1, 1, 1];
const EMBER: Rgb = [.8, .38, .12];

export function enemyDeath(vfx: Vfx, feet: Vector3, radius: number, height: number): void {
  // Copy the origin: targets return to their spawn marks after death.
  const origin = feet.add(new Vector3(0, height * .4, 0));
  const size = Math.max(radius * 1.9, height * .72);
  const towardsCamera = new Vector3();
  const at = new Vector3(), head = new Vector3(), tail = new Vector3();
  const smokeColor: [number, number, number] = [1, 1, 1];
  const fireColor: [number, number, number] = [1, 1, 1];
  const sparkColor: [number, number, number] = [1, 1, 1];
  const phase = Math.random() * Math.PI * 2;
  const smoke = Array.from({ length: 3 }, (_, i) => ({
    q: vfx.quad('smoke', CINDER, 1, 'alpha'),
    angle: phase + i * Math.PI * 2 / 3,
    spin: Math.random() * Math.PI * 2,
  }));
  const core = vfx.quad('fireball', WHITE, 1, 'alpha');
  const glint = vfx.quad('star', HOT);
  const sparks = Array.from({ length: 8 }, (_, i) => {
    const angle = phase + i * Math.PI / 4 + (Math.random() - .5) * .25;
    const speed = radius * (7 + Math.random() * 5);
    return {
      q: vfx.quad('streak', HOT),
      velocity: new Vector3(Math.cos(angle) * speed, 1.5 + Math.random() * 3, Math.sin(angle) * speed),
      life: .38 + Math.random() * .26,
    };
  });
  const quads = [...smoke.map(p => p.q), core, glint, ...sparks.map(p => p.q)];
  vfx.flash(origin, FIRE, 1.4, size * 1.5, .12);

  const effect: Effect = {
    update: (_dt, age) => {
      if (age >= LIFE) return false;
      // Keep the original compact footprint while giving the fade more time.
      const t = Math.min(1, age / .42);
      // Keep the cover in front of the dying body at every camera pitch, without bypassing
      // depth testing against other units or the arena. Re-evaluate if the camera moves.
      vfx.camera.globalPosition.subtractToRef(origin, towardsCamera).normalize();
      const cool = smoothstep(.04, .18, age);
      for (let c = 0; c < 3; c++) smokeColor[c] = CINDER[c] + (SOOT[c] - CINDER[c]) * cool;
      for (const [i, puff] of smoke.entries()) {
        const spread = size * (.04 + t * .13);
        at.copyFrom(origin).addInPlaceFromFloats(
          Math.cos(puff.angle) * spread,
          Math.sin(puff.angle) * spread * .5 + age * (.4 + i * .1),
          Math.sin(puff.angle) * spread * .3,
        ).addInPlace(towardsCamera.scale(radius * (.75 + i * .09)));
        vfx.sprite(puff.q, at, size * (.85 + .25 * Math.sqrt(t)), puff.spin + age * (i - 1) * .4);
        // Cover remains solid until the model is fully gone, then clears the play area.
        const fade = (1 - smoothstep(.13, .4 + i * .04, age)) ** 2;
        vfx.tint(puff.q, smokeColor, fade);
        puff.q.visible = fade > 0;
      }
      at.copyFrom(origin).addInPlace(towardsCamera.scale(radius * 1.15));
      // The bright body hands off to a warm, faint tail. Squaring the smooth envelope
      // brings it almost to zero well before retirement, rather than cutting off a glow.
      const flash = (1 - smoothstep(.10, .54, age)) ** 2;
      const cooling = smoothstep(.12, .5, age);
      for (let c = 0; c < 3; c++) fireColor[c] = WHITE[c] + (EMBER[c] - WHITE[c]) * cooling;
      at.y += size * .06 * cooling;
      vfx.sprite(core, at, size * (.9 + .3 * Math.min(1, age / .07)), phase + age * .35);
      vfx.tint(core, fireColor, flash);
      core.visible = flash > 0;
      at.addInPlace(towardsCamera.scale(radius * .08));
      vfx.sprite(glint, at, size * (1.1 + age * 5), phase);
      vfx.tint(glint, HOT, 1 - smoothstep(0, .085, age));
      glint.visible = age < .085;
      for (const spark of sparks) {
        if (age >= spark.life) { spark.q.visible = false; continue; }
        const fade = (1 - smoothstep(.06, spark.life, age)) ** 1.5;
        const end = age + .018, start = Math.max(0, end - .055 * (.4 + .6 * fade));
        // Air drag lets the embers linger without spreading the explosion farther out.
        const endTravel = (1 - Math.exp(-end * 3.5)) / 3.5;
        const startTravel = (1 - Math.exp(-start * 3.5)) / 3.5;
        head.copyFrom(origin).addInPlaceFromFloats(spark.velocity.x * endTravel, spark.velocity.y * end - 6 * end * end, spark.velocity.z * endTravel);
        tail.copyFrom(origin).addInPlaceFromFloats(spark.velocity.x * startTravel, spark.velocity.y * start - 6 * start * start, spark.velocity.z * startTravel);
        for (let c = 0; c < 3; c++) sparkColor[c] = FIRE[c] + (HOT[c] - FIRE[c]) * fade;
        vfx.streak(spark.q, tail, head, radius * .075 * (.35 + .65 * fade));
        vfx.tint(spark.q, sparkColor, fade);
      }
      return true;
    },
    dispose: () => { for (const q of quads) vfx.release(q); },
  };
  // Weapon kills can occur after the normal VFX update. Place cover on the kill frame.
  effect.update(0, 0);
  vfx.add(effect);
}
