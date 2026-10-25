// The live enemy population for the game mode. Spawned Raptures join the shared TargetField, so
// weapons, health bars, collision, death bursts and snow tracks treat them like any target; the
// horde adds the roster stats, a role behavior per enemy, alive counts and Hunter tracking.

import { Vector3 } from '@babylonjs/core';
import type { MinionType } from '../../enemy';
import type { Target, TargetField } from '../targets';
import { createBehavior, type Behavior, type BehaviorContext } from './behaviors';
import type { AliveCounts } from './director';
import { raptureSpec, type RaptureSpec } from './roster';

/** The roster entry as the shared target/crowd type. */
export function minionType(spec: RaptureSpec): MinionType {
  return {
    id: spec.model, name: spec.name, team: 'red', radius: spec.radius, modelLift: spec.modelLift,
    speed: spec.speed, range: spec.range, aggro: 40, windup: .8, cooldown: 3, damage: spec.damage,
    // enemy-attack.ts picks its bolt pattern from this
    attack: spec.role === 'gunner' ? 'mortar' : spec.role === 'pouncer' ? 'fan' : 'bolt',
    hp: spec.hp, barHeight: spec.height + .25,
  };
}

interface Member {
  readonly key: string;
  readonly behavior: Behavior;
  readonly hunter: boolean;
  reported: boolean;
}

export class Horde {
  private readonly members = new Map<Target, Member>();
  private readonly types = new Map<string, MinionType>();
  private readonly field: TargetField;
  private readonly ctx: BehaviorContext;
  private readonly byType = new Map<string, number>();

  constructor(field: TargetField, ctx: BehaviorContext) {
    this.field = field;
    this.ctx = ctx;
  }

  /** Load the crowds for every roster key this sortie can spawn. */
  async load(keys: readonly string[]): Promise<void> {
    for (const key of keys) this.types.set(key, minionType(raptureSpec(key)));
    await this.field.ensureTypes([...this.types.values()]);
  }

  spawn(key: string, x: number, z: number, hpScale = 1, hunter = false): Target {
    const spec = raptureSpec(key);
    const type = this.types.get(key);
    if (!type) throw new Error(`Rapture "${key}" was not loaded for this sortie`);
    const target = this.field.spawn(type, new Vector3(x, 0, z), Math.round(spec.hp * hpScale * (hunter ? 2 : 1)), {
      hover: spec.mobility !== 'ground',
    });
    this.members.set(target, { key, behavior: createBehavior(this.ctx, target, spec), hunter, reported: false });
    return target;
  }

  /** Run behaviors and retire finished ones. Returns Hunters killed this frame. */
  update(dt: number): Target[] {
    const huntersKilled: Target[] = [];
    for (const [target, member] of this.members) {
      member.behavior.update(dt);
      if (member.hunter && !target.alive && !member.reported) { member.reported = true; huntersKilled.push(target); }
      if (target.removed && !member.behavior.active) {
        member.behavior.dispose();
        this.members.delete(target);
      }
    }
    return huntersKilled;
  }

  /** Living members by roster key, for the director's caps and alive limit. */
  counts(): AliveCounts {
    this.byType.clear();
    let total = 0;
    for (const [target, member] of this.members) {
      if (!target.alive) continue;
      total++;
      this.byType.set(member.key, (this.byType.get(member.key) ?? 0) + 1);
      if (raptureSpec(member.key).tier === 'heavy') this.byType.set('#heavy', (this.byType.get('#heavy') ?? 0) + 1);
    }
    return { total, byType: this.byType };
  }

  /** Living Hunters, for the HUD's edge marker. */
  hunters(): Target[] {
    const out: Target[] = [];
    for (const [target, member] of this.members) if (member.hunter && target.alive) out.push(target);
    return out;
  }

  /**
   * Take every member off the field at once, telegraphs included (the lift has left). Works while
   * the world is frozen: a zero-scale target isn't drawn, and the field prunes `removed` ones later.
   */
  clear(): void {
    for (const [target, member] of this.members) {
      member.behavior.dispose();
      target.removed = true;
      target.scale = 0;
    }
    this.members.clear();
  }

  dispose(): void {
    for (const member of this.members.values()) member.behavior.dispose();
    this.members.clear();
  }
}
