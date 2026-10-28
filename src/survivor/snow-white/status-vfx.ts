import { Axis, Vector3 } from '@babylonjs/core';
import type { KitContext } from '../kit';
import type { Target } from '../targets';
import type { FxQuad } from '../vfx';
import { SNOW } from './palette';

const FIRE_KEYS = ['fire-0', 'fire-1', 'fire-2', 'fire-3'];
const STUN_KEYS = ['stun-0', 'stun-1', 'stun-2'];
const STUN_COLOR = [1, .85, .3] as const;
const WHITE = [1, 1, 1] as const;
const right = new Vector3();

/** One lease per affected enemy; timers and respawn generations stay authoritative. */
export class SnowWhiteStatusVfx {
  private readonly active = new Set<Target>();
  constructor(private readonly ctx: KitContext) {}

  update(): void {
    for (const target of this.ctx.targets.targets) {
      if (!target.alive || this.active.has(target)) continue;
      if (!target.marked && target.stunned <= 0 && !this.ctx.run.isBurning(target)) continue;
      this.attach(target);
    }
  }

  private attach(target: Target): void {
    const { vfx, run } = this.ctx;
    const generation = target.generation;
    const quads = new Map<string, FxQuad>();
    const at = new Vector3(), tip = new Vector3();
    const get = (key: string, texture: 'ring' | 'star' | 'tongue' | 'hunter-mark' | 'burn-mark') => {
      let q = quads.get(key);
      if (!q) { q = vfx.quad(texture, SNOW.cyan, 1, texture === 'hunter-mark' || texture === 'burn-mark' ? 'alpha' : 'add'); quads.set(key, q); }
      return q;
    };
    this.active.add(target);
    vfx.add({
      update: (_dt, age) => {
        if (!target.alive || target.removed || target.generation !== generation) return false;
        const burning = run.isBurning(target);
        if (!target.marked && target.stunned <= 0 && !burning) return false;
        for (const q of quads.values()) q.visible = false;
        const marked = target.marked;
        vfx.camera.getDirectionToRef(Axis.X, right);
        const iconHeight = target.barHeight + .45 + Math.sin(age * 3) * .035;
        // Small red hunting arrows sit above the head instead of obscuring the body.
        if (target.marked) {
          const q = get('mark', 'hunter-mark');
          at.copyFrom(target.position).addInPlaceFromFloats(0, iconHeight, 0);
          if (burning) at.addInPlaceFromFloats(right.x * -.24, right.y * -.24, right.z * -.24);
          vfx.sprite(q, at, .45);
          vfx.tint(q, WHITE, 1);
        }
        if (burning) {
          const q = get('burn-icon', 'burn-mark');
          at.copyFrom(target.position).addInPlaceFromFloats(0, iconHeight, 0);
          if (marked) at.addInPlaceFromFloats(right.x * .24, right.y * .24, right.z * .24);
          vfx.sprite(q, at, .45);
          vfx.tint(q, WHITE, 1);
        }
        if (burning) for (let i = 0; i < 4; i++) {
          const q = get(FIRE_KEYS[i], 'tongue');
          const a = i * Math.PI / 2 + age * .6;
          at.copyFrom(target.position).addInPlaceFromFloats(Math.sin(a) * target.radius * .6, .2, Math.cos(a) * target.radius * .6);
          tip.copyFrom(at).addInPlaceFromFloats(Math.sin(age * 7 + i) * .12, .55 + .18 * Math.sin(age * 13 + i), 0);
          vfx.streak(q, at, tip, .3);
          vfx.tint(q, i % 2 ? SNOW.core : SNOW.cyan, .75);
        }
        if (target.stunned > 0) for (let i = 0; i < 3; i++) {
          const q = get(STUN_KEYS[i], 'star');
          const a = age * 2.5 + i * Math.PI * 2 / 3;
          at.copyFrom(target.position).addInPlaceFromFloats(Math.sin(a) * .45, target.barHeight + .15, Math.cos(a) * .45);
          vfx.sprite(q, at, .22, -a);
          vfx.tint(q, STUN_COLOR, .9);
        }
        return true;
      },
      dispose: () => { for (const q of quads.values()) vfx.release(q); this.active.delete(target); },
    });
  }
}
