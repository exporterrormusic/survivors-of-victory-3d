// Turns ability effects into Combat calls. Kits only list effects; this is the one place that
// knows how each kind is carried out. Beams are run by the hero's channel, not here.
import { Vector3 } from '@babylonjs/core';
import { COLORS, tintColor, type Combat } from '../combat';
import type { EnemyTarget } from '../enemy';
import type { Effect } from './types';

export interface CastContext {
  readonly combat: Combat;
  readonly caster: EnemyTarget;
  /** the caster's damage multiplier (empower, rage), applied to every damaging effect */
  readonly power: number;
  /** the caster's model id, for summoned clones */
  readonly variant: string;
  /** muzzle position */
  readonly from: Vector3;
  /** unit aim direction on the ground plane */
  readonly dir: Vector3;
  /** aim point, clamped to the ability's range */
  readonly point: Vector3;
}

const fanDir = new Vector3();

export function runEffects(effects: readonly Effect[], ctx: CastContext): void {
  const { combat, caster } = ctx;
  const power = ctx.power;
  for (const effect of effects) {
    switch (effect.kind) {
      case 'bolt': {
        const count = effect.count ?? 1, spread = count > 1 ? effect.spread ?? 0.5 : 0;
        for (let i = 0; i < count; i++) {
          const angle = count > 1 ? -spread / 2 + (spread * i) / (count - 1) : 0;
          const cos = Math.cos(angle), sin = Math.sin(angle);
          fanDir.set(ctx.dir.x * cos + ctx.dir.z * sin, 0, ctx.dir.z * cos - ctx.dir.x * sin);
          combat.fireBolt(ctx.from, fanDir, {
            damage: effect.damage * power, range: effect.range, pierce: effect.pierce, size: effect.size ?? 1.6,
            color: effect.tint ? tintColor(effect.tint) : COLORS.skill, speed: effect.speed, status: effect.status,
            knockback: effect.knockback,
          });
        }
        break;
      }
      case 'lob':
        combat.throwGrenade(ctx.from, ctx.point, {
          damage: effect.damage * power, radius: effect.radius, flight: effect.flight,
          color: effect.tint ? tintColor(effect.tint) : undefined, status: effect.status, knockback: effect.knockback,
          zone: effect.zone && effect.zone.damage ? { ...effect.zone, damage: effect.zone.damage * power } : effect.zone,
        });
        break;
      case 'zone': {
        const zone = effect.zone.damage ? { ...effect.zone, damage: effect.zone.damage * power } : effect.zone;
        combat.addZone(effect.at === 'self' ? caster.position : ctx.point, zone);
        break;
      }
      case 'nova':
        combat.nova(effect.at === 'self' ? caster.position : ctx.point, effect.damage ? { ...effect, damage: effect.damage * power } : effect);
        break;
      case 'cone':
        combat.cone(caster.position, ctx.dir, effect.damage ? { ...effect, damage: effect.damage * power } : effect);
        break;
      case 'self':
        if (effect.status) caster.status.apply(effect.status);
        if (effect.heal) combat.heal(caster, effect.heal);
        break;
      case 'summon': {
        // several at once spread in a ring around the spot instead of stacking on it
        const count = effect.count ?? 1, at = effect.at === 'self' ? caster.position : ctx.point;
        for (let i = 0; i < count; i++) {
          const angle = (i / count) * Math.PI * 2;
          const spot = count > 1 ? new Vector3(at.x + Math.sin(angle) * 1.6, 0, at.z + Math.cos(angle) * 1.6) : at;
          combat.summon(effect.unit, spot, caster, ctx.variant);
        }
        break;
      }
      case 'convert':
        combat.convert(effect.at === 'self' ? caster.position : ctx.point, effect.radius, effect.duration, effect.tint, caster, effect.limit);
        break;
      case 'beam':
        break;
    }
  }
}

/** The beam a channel runs, if any. */
export function channelBeam(effects: readonly Effect[]): Extract<Effect, { kind: 'beam' }> | undefined {
  return effects.find((e): e is Extract<Effect, { kind: 'beam' }> => e.kind === 'beam');
}
