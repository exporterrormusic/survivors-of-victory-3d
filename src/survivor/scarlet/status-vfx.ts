import { Vector3 } from '@babylonjs/core';
import type { KitContext } from '../kit';
import type { Target } from '../targets';

/** Bleed icons follow the actual damage timer, including refreshes and respawns. */
export class ScarletStatusVfx {
  private readonly active = new Set<Target>();
  constructor(private readonly ctx: KitContext) {}

  private readonly frozen = new Set<Target>();

  update(): void {
    const { run, vfx } = this.ctx;
    for (const target of this.ctx.targets.targets) {
      // D1 Crashout: a violet ring under each frozen enemy, fading as the freeze runs out.
      if (target.frozen > 0 && !this.frozen.has(target)) {
        this.frozen.add(target);
        const generation = target.generation, total = target.frozen;
        const ring = vfx.quad('ring', [.75, .2, 1], .8);
        const at = new Vector3();
        vfx.add({
          update: (_dt, age) => {
            if (target.removed || !target.alive || target.generation !== generation || target.frozen <= 0) return false;
            at.copyFrom(target.position);
            vfx.decal(ring, at, target.radius * 2.6, age);
            vfx.tint(ring, [.75, .2, 1], .35 + .45 * target.frozen / total);
            return true;
          },
          dispose: () => { vfx.release(ring); this.frozen.delete(target); },
        });
      }
      if (this.active.has(target) || !run.isBurning(target, 'scarlet-bleed')) continue;
      this.active.add(target);
      const generation = target.generation;
      const icon = vfx.quad('bleed-mark', [1, 1, 1], 1, 'alpha');
      const at = new Vector3();
      vfx.add({
        update: (_dt, age) => {
          if (target.removed || target.generation !== generation || !run.isBurning(target, 'scarlet-bleed')) return false;
          at.copyFrom(target.position).addInPlaceFromFloats(0, target.barHeight + .45 + Math.sin(age * 3) * .035, 0);
          vfx.sprite(icon, at, .45);
          return true;
        },
        dispose: () => { vfx.release(icon); this.active.delete(target); },
      });
    }
  }
}
