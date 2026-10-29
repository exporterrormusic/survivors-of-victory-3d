import { Vector3 } from '@babylonjs/core';
import type { Vfx } from '../vfx';

export const LASER_PINK = [1, .12, .55] as const;
export const LASER_HIT_RADIUS = .3;
export const LASER_LENGTH = 1.5;
export const LASER_WIDTH = .72;

/** Compact energy pulse; the collision radius is independent of its soft glow. */
export function laserBolt(vfx: Vfx, origin: Vector3, direction: Vector3) {
  const beam = vfx.quad('streak', LASER_PINK, .85);
  beam.glow = beam.laser = true;
  const tail = new Vector3();
  let stopped = false;
  return {
    draw(at: Vector3) {
      if (stopped) return;
      const length = Math.min(LASER_LENGTH, Vector3.Distance(origin, at));
      tail.copyFrom(at).subtractInPlace(direction.scale(length));
      vfx.streak(beam, tail, at, LASER_WIDTH);
    },
    stop() { if (!stopped) { stopped = true; vfx.release(beam); } },
  };
}

/** White/cyan muzzle snap with pink-violet sparks, inspired by the official motion demo. */
export function laserFlash(vfx: Vfx, at: Vector3, direction: Vector3, impact = false) {
  const ring = vfx.quad('glow', LASER_PINK, .4);
  const core = vfx.quad('star', [1, .48, .72], .7);
  ring.glow = core.glow = true;
  const origin = at.clone(), life = impact ? .16 : .085;
  const shards = Array.from({ length: impact ? 4 : 2 }, (_, i) => {
    const angle = Math.atan2(direction.x, direction.z) + Math.PI + (i - 1.5) * .8;
    const q = vfx.quad('streak', LASER_PINK, .75); q.glow = true;
    return { q, velocity: new Vector3(Math.sin(angle) * 3.4, 1 + (i % 2), Math.cos(angle) * 3.4) };
  });
  const head = new Vector3(), tail = new Vector3();
  vfx.add({
    update(_dt, age) {
      if (age >= life) return false;
      const fade = 1 - age / life;
      vfx.sprite(ring, origin, (impact ? .5 : .35) + age * 1.4); ring.alpha = fade * fade * .3;
      vfx.sprite(core, origin, (impact ? .6 : .44) * (.25 + fade * .75)); core.alpha = fade * .75;
      for (const s of shards) {
        head.copyFrom(origin).addInPlace(s.velocity.scale(age));
        tail.copyFrom(origin).addInPlace(s.velocity.scale(Math.max(0, age - .045)));
        vfx.streak(s.q, tail, head, .08 * fade); s.q.alpha = fade;
      }
      return true;
    },
    dispose() { vfx.release(ring); vfx.release(core); for (const s of shards) vfx.release(s.q); },
  });
}
