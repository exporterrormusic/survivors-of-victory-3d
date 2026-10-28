// The live enemy population for the game mode. Spawned Raptures join the shared TargetField, so
// weapons, health bars, collision, death bursts and snow tracks treat them like any target; the
// horde adds the roster stats, a role behavior per enemy, alive counts and Hunter tracking.

import { Vector3 } from '@babylonjs/core';
import type { MinionType } from '../../enemy';
import type { Player } from '../player';
import type { Defender, Target, TargetField } from '../targets';
import { createBehavior, type Behavior, type BehaviorContext } from './behaviors';
import { PLAYER_RADIUS, flatDistance } from './behaviors/common';
import type { AliveCounts } from './director';
import { raptureSpec, type RaptureSpec } from './roster';

/** The roster entry as the shared target/crowd type. */
export function minionType(spec: RaptureSpec): MinionType {
  return {
    id: spec.model, name: spec.name, team: 'red', radius: spec.radius, modelLift: spec.modelLift,
    speed: spec.speed, range: spec.range, aggro: 40, windup: .8, cooldown: 3, damage: spec.damage,
    // enemy-attack.ts picks its bolt pattern from this
    attack: spec.role === 'gunner' ? 'mortar' : 'bolt',
    hp: spec.hp, barHeight: spec.height + .25, size: spec.size, stride: spec.stride,
  };
}

interface Member {
  readonly key: string;
  readonly behavior: Behavior;
  readonly hunter: boolean;
  /** contact damage per touch */
  readonly touch: number;
  /** seconds until this Rapture can hurt the player by touch again */
  touchIn: number;
  /** seconds until it next picks whom to chase */
  pickIn: number;
  reported: boolean;
}

/** Every Rapture hurts on contact: half its main hit, at most once per TOUCH_COOLDOWN each. */
const TOUCH_SHARE = .5;
const TOUCH_COOLDOWN = .8;

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
    target.combatTier = spec.tier === 'archive' ? 'horde' : spec.tier;
    // Every behavior aims at `ctx.player`; this one's player is whoever the Rapture is after.
    this.members.set(target, { key, behavior: createBehavior({ ...this.ctx, player: victimView(this.ctx.player, target) }, target, spec), hunter,
      touch: Math.max(2, Math.round(spec.damage * TOUCH_SHARE)), touchIn: 0, pickIn: 0, reported: false });
    return target;
  }

  /** Run behaviors and retire finished ones. Returns Hunters killed this frame. */
  update(dt: number): Target[] {
    const huntersKilled: Target[] = [];
    for (const [target, member] of this.members) {
      const step = this.ctx.player.kit.freezesEnemies || target.frozen > 0 ? 0 : dt;
      if ((member.pickIn -= dt) <= 0) { member.pickIn = .4 + Math.random() * .2; this.pickVictim(target); }
      member.behavior.update(step);
      this.touch(target, member, step);
      if (member.hunter && !target.alive && !member.reported) { member.reported = true; huntersKilled.push(target); }
      if (target.removed && !member.behavior.active) {
        member.behavior.dispose();
        this.members.delete(target);
      }
    }
    return huntersKilled;
  }

  /**
   * Go after whoever is nearest: the player or a squad NIKKE. Squad members count as a third
   * closer than they are, so they draw a real share of the horde; a Rapture keeps its current
   * victim unless someone is clearly closer.
   */
  private pickVictim(target: Target): void {
    const p = this.ctx.player.position;
    const keep = (who: Defender | null) => (target.victim === who ? .8 : 1);
    let best = flatDistance(target.position, p) * keep(null), victim: Defender | null = null;
    for (const ally of this.ctx.field.squad) {
      if (!ally.alive) continue;
      const d = flatDistance(target.position, ally.position) * .65 * keep(ally);
      if (d < best) { best = d; victim = ally; }
    }
    target.victim = victim;
  }

  private touch(target: Target, member: Member, dt: number): void {
    member.touchIn = Math.max(0, member.touchIn - dt);
    if (dt <= 0 || member.touchIn > 0 || !target.alive || target.scale < .99 || target.stunned > 0) return;
    // Bodies hurt anyone they press against: the player or a squad NIKKE.
    const { player } = this.ctx;
    let victim: Pick<Defender, 'takeDamage'> | null = null;
    if (player.hp > 0 && flatDistance(target.position, player.position) <= target.radius + PLAYER_RADIUS + .25) victim = player;
    else for (const ally of this.ctx.field.squad)
      if (ally.alive && flatDistance(target.position, ally.position) <= target.radius + PLAYER_RADIUS + .25) { victim = ally; break; }
    if (!victim) return;
    victim.takeDamage(member.touch);
    member.touchIn = TOUCH_COOLDOWN;
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
      target.alive = false;
      target.hp = 0;
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

/**
 * The player as one Rapture sees it: position, motion, health and damage come from its current
 * victim (a squad NIKKE) when it has one; everything else (kit, parry, reflections) is the player's.
 */
function victimView(player: Player, target: Target): Player {
  const redirected = new Set<PropertyKey>(['position', 'motion', 'hp', 'maxHp', 'takeDamage']);
  return new Proxy(player, {
    get(real, prop) {
      const victim = target.victim;
      const source: object = victim?.alive && redirected.has(prop) ? victim : real;
      const value = Reflect.get(source, prop, source);
      return typeof value === 'function' ? value.bind(source) : value;
    },
  });
}
