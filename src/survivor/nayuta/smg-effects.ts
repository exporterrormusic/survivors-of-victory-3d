// Nirvana: paired gold lances with an ivory core, amber wake and compact impact shards.
// Each live projectile owns three pooled quads; no frame-by-frame dots or lingering sprite train.
import { Vector3 } from '@babylonjs/core';
import type { Vfx } from '../vfx';
const AMBER = [1, .42, .045] as const;
const GOLD = [1, .76, .18] as const;
const IVORY = [1, .97, .72] as const;

export function nirvanaBolt(vfx: Vfx, origin: Vector3, direction: Vector3, clone: boolean, silver=false) {
  const wake = vfx.quad('streak', silver?[.65,.8,1]:AMBER, .32);
  const body = vfx.quad('lance', silver?[.83,.93,1]:GOLD, .95);
  const core = vfx.quad('streak', IVORY, 1);
  for (const q of [wake, body, core]) q.glow = true;
  const tail = new Vector3(), tip = new Vector3();
  const scale = clone ? .75 : 1;
  let stopped = false;
  return {
    draw(at: Vector3) {
      if (stopped) return;
      const length = Math.min(.95 * scale, Vector3.Distance(origin, at) + .12);
      tail.copyFrom(at).subtractInPlace(direction.scale(length));
      tip.copyFrom(at).addInPlace(direction.scale(.09));
      vfx.streak(wake, tail, tip, .34 * scale);
      tail.copyFrom(at).subtractInPlace(direction.scale(length * .72));
      vfx.streak(body, tail, tip, .15 * scale);
      tail.copyFrom(at).subtractInPlace(direction.scale(length * .56));
      vfx.streak(core, tail, at, .055 * scale);
    },
    stop() {
      if (stopped) return;
      stopped = true;
      for (const q of [wake, body, core]) vfx.release(q);
    },
  };
}

export function nirvanaMuzzle(vfx: Vfx, at: Vector3, direction: Vector3, clone: boolean, silver=false) {
  const ring = vfx.quad('ring', GOLD, .65), tongue = vfx.quad('lance', IVORY, .9);
  ring.glow = tongue.glow = true;
  const origin = at.clone(), end = origin.add(direction.scale(clone ? .35 : .55));
  vfx.add({
    update(_dt, age) {
      if (age >= .075) return false;
      const fade = 1 - age / .075;
      vfx.sprite(ring, origin, (clone ? .22 : .32) * (1 + age * 6));
      vfx.streak(tongue, origin, end, .16 * fade);
      vfx.tint(ring, silver?[.83,.93,1]:GOLD, .65 * fade); vfx.tint(tongue, IVORY, fade);
      return true;
    },
    dispose() { vfx.release(ring); vfx.release(tongue); },
  });
}

export function nirvanaImpact(vfx: Vfx, at: Vector3, direction: Vector3, clone = false) {
  const origin = at.clone(), ring = vfx.quad('ring', GOLD, .8);
  ring.glow = true;
  const yaw = Math.atan2(direction.x, direction.z);
  const sparks = Array.from({length: clone ? 3 : 5}, (_, i) => {
    const a = yaw + Math.PI + (i - (clone ? 1 : 2)) * .7;
    const q = vfx.quad('streak', i % 2 ? GOLD : IVORY, 1); q.glow = true;
    return { q, velocity: new Vector3(Math.sin(a) * (2.4 + i * .35), 1.2 + (i % 3) * .5, Math.cos(a) * (2.4 + i * .35)) };
  });
  const tail = new Vector3(), head = new Vector3();
  vfx.add({
    update(_dt, age) {
      if (age >= .2) return false;
      const fade = 1 - age / .2;
      vfx.sprite(ring, origin, .15 + age * 3.6); vfx.tint(ring, GOLD, fade * fade * .7);
      for (const spark of sparks) {
        head.copyFrom(origin).addInPlace(spark.velocity.scale(age));
        tail.copyFrom(origin).addInPlace(spark.velocity.scale(Math.max(0, age - .035)));
        vfx.streak(spark.q, tail, head, .045 * fade); spark.q.alpha = fade;
      }
      return true;
    },
    dispose() { vfx.release(ring); for (const spark of sparks) vfx.release(spark.q); },
  });
}
