// Rocket detonation: a fast fireball gives way to expanding soot and falling embers.
// Uses the shared VFX pool, so overlapping volleys do not create permanent scene objects.
import { Vector3 } from '@babylonjs/core';
import { type Effect, type Rgb, type Vfx } from '../vfx';
import { smoothstep } from '../math';

const WHITE: Rgb = [1, 1, 1];
const HOT: Rgb = [1, .94, .68];
const FIRE: Rgb = [1, .38, .055];
const LIFE = 1.65;

export function rocketImpact(vfx: Vfx, impact: Vector3, radius: number): void {
  const origin = impact.clone(); origin.y = Math.max(.35, origin.y);
  const ground = new Vector3(impact.x, .025, impact.z);
  const phase = Math.random() * Math.PI * 2;
  const core = vfx.quad('fireball', WHITE, 1, 'alpha');
  const flash = vfx.quad('star', HOT, 1);
  const glow = vfx.quad('glow', FIRE, .65);
  const scorch = vfx.quad('smoke', [.035, .028, .023], .3, 'alpha');
  const lobes = Array.from({ length: 4 }, (_, i) => ({
    fire: vfx.quad('fireball', WHITE, 1, 'alpha'),
    smoke: vfx.quad('smoke', [.3, .27, .24], .7, 'alpha'),
    angle: phase + i * Math.PI / 2,
    spin: Math.random() * Math.PI * 2,
    rise: .35 + Math.random() * .3,
  }));
  const quads = [core, flash, glow, scorch, ...lobes.flatMap(lobe => [lobe.fire, lobe.smoke])];
  const at = new Vector3(), towardCamera = new Vector3();
  const fireColor: [number, number, number] = [1, 1, 1];
  const smokeColor: [number, number, number] = [.3, .27, .24];

  vfx.glowing(flash);
  vfx.ring(ground, FIRE, radius * .16, radius * 1.08, .32, .7);
  vfx.groundGlow(ground, FIRE, radius * .95, .5, .3);
  vfx.sparks(origin, 28, FIRE, HOT, radius * 5, null, 1, 1.25);
  vfx.flash(origin, FIRE, 2.2, radius * 4, .22);

  const effect: Effect = {
    update: (_dt, age) => {
      if (age >= LIFE) return false;
      vfx.camera.globalPosition.subtractToRef(origin, towardCamera).normalize();
      const bloom = 1 - Math.exp(-age * 24);
      const cool = smoothstep(.12, .6, age);
      fireColor[0] = 1 - cool * .45;
      fireColor[1] = 1 - cool * .76;
      fireColor[2] = 1 - cool * .93;

      // A defined orange body remains after the initial hot flash, rather than only a ring.
      at.copyFrom(origin).addInPlace(towardCamera.scale(radius * .24));
      vfx.sprite(core, at, radius * (.45 + bloom * 1.05), phase + age * .4);
      vfx.tint(core, fireColor, 1 - smoothstep(.2, .59, age));
      core.visible = age < .59;
      vfx.sprite(flash, at, radius * (.9 + bloom * .7), phase);
      vfx.tint(flash, HOT, 1 - smoothstep(.015, .1, age));
      flash.visible = age < .1;
      vfx.sprite(glow, at, radius * (1.6 + bloom * .7));
      vfx.tint(glow, FIRE, .5 * (1 - smoothstep(.04, .38, age)));
      glow.visible = age < .38;

      const smokeFade = smoothstep(.08, .24, age) * (1 - smoothstep(.55, LIFE, age));
      smokeColor[0] = .38 - cool * .16;
      smokeColor[1] = .29 - cool * .06;
      smokeColor[2] = .22 + cool * .03;
      for (const [i, lobe] of lobes.entries()) {
        const spread = radius * (.12 + bloom * .35);
        at.copyFrom(origin).addInPlaceFromFloats(
          Math.cos(lobe.angle) * spread,
          Math.sin(lobe.angle) * radius * .12 + age * lobe.rise,
          Math.sin(lobe.angle) * spread,
        );
        vfx.sprite(lobe.smoke, at, radius * (.65 + Math.sqrt(Math.min(1, age)) * .75), lobe.spin + age * (i % 2 ? .3 : -.3));
        vfx.tint(lobe.smoke, smokeColor, smokeFade * .75);
        lobe.smoke.visible = smokeFade > 0;

        at.addInPlace(towardCamera.scale(radius * .18));
        vfx.sprite(lobe.fire, at, radius * (.25 + bloom * .65), lobe.spin - age * .5);
        vfx.tint(lobe.fire, fireColor, .9 * (1 - smoothstep(.14 + i * .015, .48 + i * .025, age)));
        lobe.fire.visible = age < .48 + i * .025;
      }
      vfx.decal(scorch, ground, radius * 1.8, phase);
      vfx.tint(scorch, [.035, .028, .023], .26 * (1 - smoothstep(.45, LIFE, age)));
      return true;
    },
    dispose: () => { for (const q of quads) vfx.release(q); },
  };
  effect.update(0, 0);
  vfx.add(effect);
}
