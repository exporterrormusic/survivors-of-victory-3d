// A second hero on the field: a full Player with its own kit, Run and position, driven by any
// InputSource (a bot now, a remote player in Phase 2). It joins TargetField.squad, so Raptures
// hunt and hit it exactly like the player (mode/horde.ts) and the HUD gives it a bar and name.

import { Vector3, type Scene, type ShadowGenerator } from '@babylonjs/core';
import { Chibi, loadChibiIndex } from '../../chibi';
import { CHARACTER_MODULES, HERO_VARIANTS } from '../../characters';
import type { SurvivorCamera } from '../camera';
import type { InputSource } from '../input';
import type { KitContext } from '../kit';
import { Player } from '../player';
import { Run } from '../run';
import type { SnowField } from '../snow-field';
import type { SquadMember, TargetField } from '../targets';
import type { Vfx } from '../vfx';
import { spawnAfterimage } from '../afterimage';
import { createDorothy } from '../dorothy';
import { createNayuta } from '../nayuta';
import { createRapunzel } from '../rapunzel';
import { createScarlet } from '../scarlet';
import { createSnowWhite } from '../snow-white';

export type HeroId = 'snow-white' | 'scarlet' | 'rapunzel' | 'nayuta' | 'dorothy';

export interface TeammateWorld {
  scene: Scene; shadows: ShadowGenerator; vfx: Vfx; targets: TargetField; camera: SurvivorCamera;
  snow?: SnowField; sound: KitContext['sound'];
  /** the local player's run: kills and XP flow into it (shared squad level) */
  run: Run;
}

/** Only the local player moves the camera; a teammate's hits and kit effects must not shake or zoom it. */
const CAMERA_ONLY_LOCAL = new Set<PropertyKey>(['shake', 'snap', 'setDistance', 'zoomTo']);
function quietCamera(camera: SurvivorCamera): SurvivorCamera {
  return new Proxy(camera, {
    get(real, prop) {
      if (CAMERA_ONLY_LOCAL.has(prop)) return () => {};
      const value = Reflect.get(real, prop, real);
      return typeof value === 'function' ? value.bind(real) : value;
    },
  });
}

/** AI squadmates: half again the kit's health, and Raptures treat them as 1.5x as far away */
const BOT_HP_SCALE = 1.5, BOT_THREAT = 1.5;

export class Teammate implements SquadMember {
  /** Raptures weigh a human teammate like the player; AI bots count as farther away so the player
   * draws the horde when both are equally close */
  threat = 1;
  readonly aim = new Vector3();
  /** chibi model id (the skin) */
  skin = '';
  private readonly ctx: KitContext;
  /** the local run, whose level everyone shares */
  private readonly squadRun: Run;

  private constructor(readonly slot: number, readonly hero: HeroId, readonly name: string, readonly player: Player, readonly run: Run, ctx: KitContext, squadRun: Run) {
    this.ctx = ctx;
    this.squadRun = squadRun;
  }

  static async create(world: TeammateWorld, slot: number, hero: HeroId, at: Vector3, skin?: string, bot = false): Promise<Teammate> {
    const character = CHARACTER_MODULES[hero];
    const variant = HERO_VARIANTS.find(h => h.character === character && h.variant === skin) ?? HERO_VARIANTS.find(h => h.character === character)!;
    const index = await loadChibiIndex();
    const chibi = await Chibi.load(world.scene, index.variants[variant.variant], variant.aim, variant.muzzle);
    for (const m of chibi.meshes) world.shadows.addShadowCaster(m);

    const run = new Run(hero);
    run.onHit = target => world.run.onHit?.(target);
    // Shared squad level: XP and kill credit land on the local run (its onKill carries mode
    // rewards such as the Obelisk core and heavy bonuses).
    run.gainXp = amount => world.run.gainXp(amount);
    run.onKill = target => { world.run.kills++; world.run.onKill?.(target); };

    const playerPosition = at.clone();
    // eslint-disable-next-line prefer-const -- the kit needs the context before the player exists
    let player: Player;
    const ctx: KitContext = {
      scene: world.scene, shadows: world.shadows, vfx: world.vfx, targets: world.targets, run,
      camera: quietCamera(world.camera), snow: world.snow, sound: world.sound, playerPosition,
      muzzle: out => player.rig.muzzle(out), heal: amount => { player.hp = Math.min(player.maxHp, player.hp + amount); },
    };
    Object.defineProperties(ctx, { hp: { get: () => player.hp }, maxHp: { get: () => player.maxHp }, aimYaw: { get: () => player.aimYaw }, aimPoint: { get: () => player.aim } });
    ctx.setHp = hp => { player.hp = Math.max(1, Math.min(player.maxHp, hp)); };
    ctx.afterimage = color => spawnAfterimage(world.vfx, chibi, color);
    ctx.invulnerable = (seconds, translucent) => player.grantInvulnerability(seconds, translucent);
    ctx.resist = (share, seconds) => player.grantResist(share, seconds);
    ctx.refundRound = () => player.refundRound();
    ctx.teleport = to => {
      const safe = world.targets.navigation.project(to, .45);
      player.position.set(safe.x, 0, safe.z); playerPosition.copyFrom(player.position); player.unstick();
    };
    const kit = hero === 'dorothy' ? createDorothy(ctx) : hero === 'nayuta' ? createNayuta(ctx, variant.variant) : hero === 'rapunzel' ? createRapunzel(ctx) : hero === 'scarlet' ? createScarlet(ctx) : createSnowWhite(ctx);
    player = new Player(chibi, kit, ctx, world.snow);
    // The next update grows current health along with the new maximum.
    if (bot) player.hpScale = BOT_HP_SCALE;
    player.position.copyFrom(at);
    player.unstick();
    await kit.prepare?.();
    const mate = new Teammate(slot, hero, character.name, player, run, ctx, world.run);
    mate.skin = variant.variant;
    if (bot) mate.threat = BOT_THREAT;
    return mate;
  }

  get position(): Vector3 { return this.player.position; }
  get motion(): Readonly<Vector3> { return this.player.motion; }
  get hp(): number { return this.player.hp; }
  get maxHp(): number { return this.player.maxHp; }
  get alive(): boolean { return this.player.hp > 0; }
  get meshes() { return this.player.chibi.meshes; }

  takeDamage(amount: number): boolean { return this.player.takeDamage(amount); }
  heal(amount: number): void { if (this.alive) this.player.hp = Math.min(this.player.maxHp, this.player.hp + amount); }

  /** Same order as the local player in main.ts: move and act, then the kit. */
  update(dt: number, input: InputSource, aimPoint: Vector3, worldDt: number): void {
    // Shared squad level: talent tiers unlock and level growth (damage, health) applies as it rises.
    this.run.level = this.squadRun.level;
    this.player.update(dt, input, aimPoint);
    this.ctx.playerPosition.copyFrom(this.player.position);
    this.player.kit.update(dt);
    this.run.update(worldDt);
  }

  /** Take a remote player's talent picks (option per tier, null = not picked), oldest tier first. */
  applyPicks(chosen: readonly (number | null)[]): void {
    const tiers = this.run.tiers;
    if (!tiers) return;
    for (let tier = 0; tier < chosen.length; tier++) {
      const option = chosen[tier];
      if (option === null || tiers.chosenIndex(tier) !== null) continue;
      if (!tiers.choose(tier, option, this.run.level)) break;
    }
  }

  dispose(): void { this.player.kit.dispose?.(); this.player.chibi.dispose(); }
}
