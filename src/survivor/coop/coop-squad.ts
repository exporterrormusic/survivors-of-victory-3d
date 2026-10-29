// Co-op on one machine (Phase 1, ?coop=bot): the local player plus teammates, with downs and
// revives instead of instant defeat. The rules themselves are engine-free in src/net/coop-rules.ts;
// this applies them to Players. Experimental — see docs/COOP_PLAN.md.

import { Vector3 } from '@babylonjs/core';
import { coopScale, ReviveTracker, REVIVE_HP_SHARE, REVIVE_RADIUS, type CoopPlayer } from '../../net/coop-rules';
import type { Player } from '../player';
import type { FxQuad } from '../vfx';
import { BotInput } from './bot-input';
import { RemoteInput } from './remote-input';
import { Teammate, type HeroId, type TeammateWorld } from './teammate';

/** a downed hero holds still until revived (Player.update skips while this counts down) */
const HELD_DOWN = Infinity;
/** how far a bot will walk to revive someone */
const REVIVE_REACH = 25;
const RING: [number, number, number] = [.3, .85, 1];
/** a ring for bigger bot squads on the lift deck (the deck is about 4.9 m square) */
const DECK_SPOT = 1.3;

/**
 * Where squad member `index` (in slot order, host first) stands on the lift deck, relative to its
 * centre, facing the gates (−Z): alone in the middle, two side by side, three as one in front and
 * two behind. Every machine uses this, so the deck looks the same for the whole squad.
 */
export function deckSpot(index: number, count: number): { x: number; z: number } {
  if (count <= 1) return { x: 0, z: 0 };
  if (count === 2) return { x: index === 0 ? -.75 : .75, z: 0 };
  if (count === 3) return index === 0 ? { x: 0, z: -.75 } : { x: index === 1 ? -.85 : .85, z: .6 };
  const a = index * Math.PI * 2 / count;
  return { x: Math.sin(a) * DECK_SPOT, z: -Math.cos(a) * DECK_SPOT };
}

export class CoopSquad {
  readonly teammates: Teammate[] = [];
  /** who drives each teammate: an AI bot or a guest over the network */
  private readonly controllers = new Map<Teammate, BotInput | RemoteInput>();
  private readonly revive = new ReviveTracker();
  private readonly rings = new Map<number, FxQuad>();
  private readonly world: TeammateWorld;
  private readonly local: Player;
  /** teammates are riding a lift (or held in a cutscene) with the player */
  private riding = false;
  /** a hero joined or left (main.ts refreshes the toon pass's player materials) */
  onChange: (() => void) | null = null;

  constructor(world: TeammateWorld, local: Player) {
    this.world = world;
    this.local = local;
  }

  async addBot(hero: HeroId): Promise<Teammate> {
    const slot = this.freeSlot();
    return this.add(slot, hero, new BotInput(slot));
  }

  /** A network guest's hero, in their session slot; feed it with RemoteInput.apply each frame. */
  async addRemote(slot: number, hero: HeroId, skin?: string): Promise<{ mate: Teammate; input: RemoteInput }> {
    const input = new RemoteInput();
    return { mate: await this.add(slot, hero, input, skin), input };
  }

  remove(mate: Teammate): void {
    const i = this.teammates.indexOf(mate);
    if (i < 0) return;
    this.teammates.splice(i, 1);
    this.controllers.delete(mate);
    const squad = this.world.targets.squad, j = squad.indexOf(mate);
    if (j >= 0) squad.splice(j, 1);
    const ring = this.rings.get(mate.slot);
    if (ring) { this.world.vfx.release(ring); this.rings.delete(mate.slot); }
    mate.dispose();
    this.onChange?.();
  }

  private async add(slot: number, hero: HeroId, controller: BotInput | RemoteInput, skin?: string): Promise<Teammate> {
    const at = this.local.position.add(new Vector3(Math.cos(slot * 2.4) * 2.5, 0, Math.sin(slot * 2.4) * 2.5));
    at.y = 0;
    const mate = await Teammate.create(this.world, slot, hero, at, skin);
    this.teammates.push(mate);
    this.controllers.set(mate, controller);
    this.world.targets.squad.push(mate);
    this.onChange?.();
    return mate;
  }

  private freeSlot(): number {
    let slot = 1;
    while (this.teammates.some(t => t.slot === slot)) slot++;
    return slot;
  }

  get count(): number { return 1 + this.teammates.length; }
  /** where a slot stands on the lift deck, relative to its centre (deckSpot) */
  deckSpotOf(slot: number): { x: number; z: number } {
    const slots = [0, ...this.teammates.map(t => t.slot)].sort((a, b) => a - b);
    return deckSpot(Math.max(0, slots.indexOf(slot)), slots.length);
  }
  /** difficulty multipliers for the round's hp / spawn rate / alive cap */
  get scale() { return coopScale(this.count); }
  /** every mesh a hero owns, for the toon pass's player materials */
  get meshes() { return this.teammates.flatMap(t => t.meshes); }
  /** who drives a teammate (net-host reads held buttons for snapshots) */
  controllerOf(mate: Teammate): BotInput | RemoteInput | undefined { return this.controllers.get(mate); }
  /** The round's defeat check: positive while anyone in the squad is standing. */
  get squadHp(): number { return this.local.hp > 0 ? this.local.hp : this.teammates.some(t => t.alive) ? 1 : 0; }

  /** After the local player's update; before targets and the mode. */
  update(dt: number, worldDt: number): void {
    this.ride();
    const heroes = [this.local, ...this.teammates.map(t => t.player)];
    const slots = [0, ...this.teammates.map(t => t.slot)];
    const members: CoopPlayer[] = heroes.map((p, i) => ({ slot: slots[i], x: p.position.x, z: p.position.z, down: p.hp <= 0 }));
    // Hold the downed in place: no training-range auto-respawn while co-op is on.
    for (const p of heroes) if (p.hp <= 0) p.trainingReset = HELD_DOWN;

    for (const mate of this.teammates) {
      const controller = this.controllers.get(mate);
      if (!controller) continue;
      if (controller instanceof BotInput && mate.alive)
        controller.think(mate.player, mate.run, this.local.position, this.world.targets, this.reviveTarget(mate, members));
      mate.update(dt, controller, controller.aim, mate.alive ? worldDt : 0);
      // A network guest moves their own hero; take their position (not while carried by a lift).
      if (controller instanceof RemoteInput && controller.reported && mate.alive && !mate.player.transported) {
        mate.position.x = controller.reported.x; mate.position.z = controller.reported.z;
      }
    }

    for (const slot of this.revive.update(worldDt, members).revived) {
      const p = heroes[slots.indexOf(slot)];
      p.trainingReset = 0;
      p.hp = Math.max(1, Math.round(p.maxHp * REVIVE_HP_SHARE));
      p.grantInvulnerability(1.5, true);
    }
    this.drawRings(heroes, members, slots);
  }

  /** After Babylon animates: aim the torsos and fire the shots queued in update (as Player.afterAnimation). */
  afterAnimation(): void { for (const mate of this.teammates) mate.player.afterAnimation(); }

  /**
   * Whenever the player is carried (the arrival lift, a lift ride), teammates ride along on the
   * deck beside them, and step off together.
   */
  private ride(): void {
    const local = this.local;
    if (local.transported) {
      const hidden = !local.chibi.root.isEnabled();
      const own = this.deckSpotOf(0), cx = local.position.x - own.x, cz = local.position.z - own.z;
      for (const mate of this.teammates) {
        const spot = this.deckSpotOf(mate.slot);
        mate.player.transported = true;
        mate.position.x = cx + spot.x;
        mate.position.z = cz + spot.z;
        mate.player.rig.legYaw = local.rig.legYaw;
        mate.player.setTransportPose(local.position.y, hidden);
      }
      this.riding = true;
    } else if (this.riding) {
      this.riding = false;
      for (const mate of this.teammates) { mate.player.transported = false; mate.player.setTransportPose(0, false); mate.player.unstick(); }
    }
  }

  /** nearest downed squadmate within reach */
  private reviveTarget(mate: Teammate, members: readonly CoopPlayer[]): Vector3 | null {
    let best: CoopPlayer | null = null, bestDistance = REVIVE_REACH;
    for (const m of members) {
      if (!m.down || m.slot === mate.slot) continue;
      const d = Math.hypot(m.x - mate.position.x, m.z - mate.position.z);
      if (d < bestDistance) { best = m; bestDistance = d; }
    }
    return best ? new Vector3(best.x, 0, best.z) : null;
  }

  /** A revive ring under each downed hero that fills as they're helped up (a VFX, not text). */
  private drawRings(heroes: readonly Player[], members: readonly CoopPlayer[], slots: readonly number[]): void {
    const { vfx } = this.world;
    for (const m of members) {
      let ring = this.rings.get(m.slot);
      if (!m.down) { if (ring) { vfx.release(ring); this.rings.delete(m.slot); } continue; }
      if (!ring) this.rings.set(m.slot, ring = vfx.quad('warning-ring', RING, .6, 'alpha'));
      const progress = this.revive.progressOf(m.slot);
      vfx.tint(ring, RING, .35 + .5 * progress);
      vfx.decal(ring, heroes[slots.indexOf(m.slot)].position.add(new Vector3(0, .05, 0)), REVIVE_RADIUS * 2 * (.4 + .6 * progress));
    }
  }

  dispose(): void {
    for (const ring of this.rings.values()) this.world.vfx.release(ring);
    this.rings.clear();
    for (const mate of [...this.teammates]) this.remove(mate);
  }
}
