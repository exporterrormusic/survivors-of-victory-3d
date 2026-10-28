// Training Raptures can hold their marks or pursue the player. Grounded rigs use
// body-sized routes around snow banks; their baked crowd animations follow travel.

import { LAKE_ENEMY_ICE_SPEED, LAKE_HESITATION } from './frozen-lake';
import { type Scene, type ShadowGenerator, Vector3 } from '@babylonjs/core';
import { CrowdModel, crowdWorld, type CrowdClip } from '../crowd';
import { RAPTURE_TYPES, modelUrl, type MinionType } from '../enemy';
import { addPelicanWalk, preloadModels } from '../model-library';
import { DEATH_COLLAPSE_TIME, DEATH_COVER_DELAY } from './enemy-death';
import { createSnowTrack, RAPTURE_SNOW_CONTACTS, type SnowField, type SnowTrack } from './snow-field';
import { NavigationAgent, type NavigationBody } from '../navigation';
import { SnowNavigationMap } from './snow-navigation';
import { ARENA_RADIUS } from './arena';
import { turnToward } from './math';

const RESPAWN = 2.5;
const TARGET_HP = 60;
export const ENEMY_MOVEMENT = { inactive: 'Inactive', hold: 'Hold positions', pursue: 'Pursue player' } as const;
export type EnemyMovement = keyof typeof ENEMY_MOVEMENT;

/** Older kits' marks (no explicit strength) keep their original 4× damage taken. */
const LEGACY_MARK_BONUS = 3;

/**
 * A target carries at most one mark. A new mark replaces it only if at least as strong;
 * an equal one refreshes its timer. Keeps the Set-like add/has/clear/size older code reads.
 */
export class MarkSlot {
  kind: string | null = null;
  /** extra damage taken: .5 = +50% */
  bonus = 0;
  remaining = 0;
  get size(): number { return this.kind === null ? 0 : 1; }
  has(kind: string): boolean { return this.kind === kind; }
  add(kind: string, bonus = LEGACY_MARK_BONUS, seconds = Infinity): this {
    if (this.kind !== null && bonus < this.bonus) return this;
    this.kind = kind; this.bonus = bonus; this.remaining = seconds;
    return this;
  }
  clear(): void { this.kind = null; this.bonus = 0; this.remaining = 0; }
  update(dt: number): void {
    if (this.kind === null) return;
    this.remaining -= dt;
    if (this.remaining <= 0) this.clear();
  }
}

/** player body radius plus a hand's width: where pursuing melee Raptures stop */
const PURSUE_GAP = .55;
/** how far past standoff the player must get before a settled Rapture moves again */
const RESETTLE = .5;

/** Someone Raptures attack: the player, or a supply-squad NIKKE (mode/supply-lift.ts). */
export interface Defender {
  readonly position: Vector3;
  readonly motion: Readonly<Vector3>;
  readonly hp: number;
  readonly maxHp: number;
  readonly alive: boolean;
  takeDamage(amount: number): boolean;
}

/** A squad NIKKE as the field and HUD see it. */
export interface SquadMember extends Defender {
  readonly name: string;
  /** restore health (healer kits: Rapunzel's zones and Burst) */
  heal(amount: number): void;
}

export class Target {
  combatTier: 'horde' | 'specialist' | 'heavy' | 'boss' = 'horde';
  hp: number;
  alive = true;
  flash = 0;
  yaw: number;
  scale = 1;
  /** seconds since the last hit, for the health bar's fade */
  sinceHit = 99;
  /** Incremented on respawn so effects from a previous life cannot hurt the new target. */
  generation = 0;
  readonly marks = new MarkSlot();
  /** Snow White's Armor Break: a second slot so it stacks with Weak Point instead of replacing it */
  readonly breaks = new MarkSlot();
  /** carries any mark, in either slot */
  get marked(): boolean { return this.marks.size > 0 || this.breaks.size > 0; }
  slowed = 0;
  /** seconds of a heavier 50% slow (Rapunzel's Judgement); outranks `slowed` */
  slowedHard = 0;
  stunned = 0;
  /** Frozen in time (Scarlet's D1 Crashout): no movement, attacks or shots in flight. */
  frozen = 0;
  /** Seconds spent waiting at a lake shore for the player to come back to the snow. */
  iceWait = 0;
  /** attacking: keeps walking at half speed and faces the player, so Raptures fire on the move */
  attackHold = 0;
  /** planted for an attack whose tell is drawn on the ground (lanes, slams, dives): no movement */
  rooted = 0;
  /** A Tripod shield covering this target (game mode): player damage drains it first. */
  ward: { absorb(damage: number, target: Target): number } | null = null;
  /** Training targets come back on their mark; game-mode spawns stay dead. */
  respawns = true;
  /** A non-respawning target has finished collapsing; the field drops it. */
  removed = false;
  /** Chase the player regardless of the field's movement setting (game-mode spawns). */
  pursues = false;
  /** whom this Rapture is after when it isn't the player (the horde picks the nearest) */
  victim: Defender | null = null;
  private clip: CrowdClip;
  private clipTime = Math.random() * 3;
  private deadFor = 0;
  private deathScale = 1;
  /** knockback velocity, m/s */
  private readonly push = new Vector3();
  private readonly recoil = new Vector3();
  private readonly drawPosition = new Vector3();
  private navigator: NavigationAgent | null = null;
  private navigationVersion = -1;
  private walkHold = 0;
  /** holding at standoff range (pursue) */
  private settled = false;
  private readonly orbit = new Vector3();

  constructor(readonly type: MinionType, private readonly crowd: CrowdModel, readonly home: Vector3, readonly maxHp = TARGET_HP,
    private readonly navigation?: SnowNavigationMap, readonly hover=false) {
    this.hp = maxHp;
    this.yaw = Math.atan2(-home.x, -home.z);
    this.clip = crowd.clip('idle');
    this.position = home.clone();
  }

  readonly position: Vector3;
  get radius(): number { return this.type.radius; }
  get damageMultiplier(): number { return 1 + this.marks.bonus + this.breaks.bonus; }
  get barHeight(): number { return (this.type.barHeight ?? 2.7) + this.type.modelLift; }
  resetNavigation(): void { this.navigator = null; this.navigationVersion = -1; }

  /** Knock back without damage (m/s, decays like hit knockback). */
  shove(velocity: Vector3): void {
    if (this.alive) this.push.addInPlace(velocity);
  }

  hit(damage: number, knock?: Vector3): boolean {
    if (!this.alive) return false;
    this.hp = Math.max(0, this.hp - damage);
    this.flash = .12;
    // Cosmetic kick only: collision, navigation and weapon knockback stay authoritative.
    if (knock && Math.hypot(knock.x, knock.z) > .001) this.recoil.set(knock.x, 0, knock.z).normalize();
    else this.recoil.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    this.sinceHit = 0;
    if (knock) this.push.addInPlace(knock);
    if (this.hp <= 0) {
      this.alive = false;
      this.deadFor = 0;
      this.deathScale = this.scale;
      this.push.setAll(0);
      return true;
    }
    return false;
  }

  update(dt: number, player: Vector3, pursue = false, neighbors: readonly NavigationBody[] = [], inactive = false): void {
    if (dt <= 0) return;
    this.flash = Math.max(0, this.flash - dt);
    this.attackHold = Math.max(0, this.attackHold - dt);
    this.rooted = Math.max(0, this.rooted - dt);
    this.sinceHit += dt;
    if (!this.alive) {
      this.deadFor += dt;
      const collapse = Math.max(0, Math.min(1, (this.deadFor - DEATH_COVER_DELAY) / DEATH_COLLAPSE_TIME));
      this.scale = this.deathScale * (1 - collapse) ** 2;
      if (!this.respawns) {
        if (collapse >= 1) this.removed = true;
        return;
      }
      if (this.deadFor >= RESPAWN) {
        this.generation++;
        this.marks.clear(); this.breaks.clear();
        this.slowed = this.slowedHard = this.stunned = this.frozen = 0;
        this.alive = true;
        this.hp = this.maxHp;
        this.scale = .001;
        this.position.copyFrom(this.home);
        this.resetNavigation();
        this.safePosition();
        this.flash = 0;
        this.sinceHit = 99;
      }
      return;
    }
    this.marks.update(dt); this.breaks.update(dt);
    this.slowed = Math.max(0, this.slowed - dt);
    this.slowedHard = Math.max(0, this.slowedHard - dt);
    this.stunned = Math.max(0, this.stunned - dt);
    this.frozen = Math.max(0, this.frozen - dt);
    const animationDt = this.stunned > 0 || this.frozen > 0 ? 0 : dt * (this.slowedHard > 0 ? .5 : this.slowed > 0 ? .7 : 1);
    const motionDt = inactive || this.rooted > 0 ? 0 : animationDt;
    if (this.scale < 1) this.scale = Math.min(1, this.scale + dt * 4);
    this.safePosition();
    const oldX = this.position.x, oldZ = this.position.z;
    if (this.navigation) this.navigation.push(this.position, this.push.x * dt, this.push.z * dt, this.radius);
    else this.position.addInPlace(this.push.scale(dt));
    this.push.scaleInPlace(Math.exp(-dt * 7));
    let goal = pursue ? player : this.home;
    const dx = goal.x - this.position.x, dz = goal.z - this.position.z, distance = Math.hypot(dx, dz);
    // Ranged enemies only settle at standoff distance when the hill no longer
    // hides the player. Otherwise keep routing around it to regain a firing line.
    // Melee ranges are shorter than the two bodies; stop just outside the player instead of
    // grinding into them. Once settled, only step in again when the player drifts clear.
    const standoff = Math.max(this.type.range * .8, this.radius + PURSUE_GAP);
    const covered = pursue && distance <= standoff && this.navigation?.traceCover(
      { x: this.position.x, y: 1.1, z: this.position.z }, { x: player.x, y: 1.1, z: player.z }) != null;
    if (distance <= standoff) this.settled = true;
    else if (distance > standoff + RESETTLE) this.settled = false;
    // Settled ranged Raptures don't stand still: they circle the player at standoff, so they keep
    // walking (and firing) instead of stopping dead and restarting each time the player steps away.
    const circling = pursue && this.settled && !covered && this.type.range > 3;
    if (circling) {
      const around = Math.atan2(this.position.x - player.x, this.position.z - player.z) + (this.generation % 2 ? .6 : -.6);
      goal = this.orbit.set(player.x + Math.sin(around) * standoff, 0, player.z + Math.cos(around) * standoff);
    }
    const river=this.navigation?.storm;
    const lake=this.navigation?.lake;
    // Ground Raptures hesitate at the shore before following the player onto the ice.
    if(lake?.enabled&&!this.hover){
      if(lake.onIce(this.position,0)||!lake.onIce(goal,0))this.iceWait=0;
      else if((this.iceWait+=motionDt)<LAKE_HESITATION+(this.generation*.37%1)*1.5){const shore=lake.shoreGoal(goal);goal=this.orbit.set(shore.x,0,shore.z);}
    }
    // Raptures caught by a collapse climb out toward the nearest solid footing.
    const escape=lake?.enabled&&!this.hover?lake.escape(this.position):null;
    if(escape)goal=this.orbit.set(escape.x,0,escape.z);
    // Every unit gets out from under a falling meteor or off a burning crater, and won't walk into one.
    let dodging=false;
    for(const d of this.navigation?.dangers??[]){
      const clear=d.r+this.radius+.8,ox=this.position.x-d.x,oz=this.position.z-d.z,od=Math.hypot(ox,oz);
      if(od<clear){
        const ux=od>.01?ox/od:Math.sin(this.generation),uz=od>.01?oz/od:Math.cos(this.generation);
        goal=this.orbit.set(d.x+ux*clear*1.4,0,d.z+uz*clear*1.4);dodging=true;break;
      }
      const gx=goal.x-d.x,gz=goal.z-d.z,gd=Math.hypot(gx,gz);
      if(gd<clear&&gd>.01)goal=this.orbit.set(d.x+gx/gd*clear,0,d.z+gz/gd*clear);
    }
    const fleeing=dodging||!!escape||!!river?.enabled&&!this.hover&&river.phase==='surge'&&river.wet(this.position,this.radius);
    const moving = fleeing || (pursue ? !this.settled || covered || circling : distance > .04);
    if (moving && motionDt > 0) {
      const pace = (circling ? .45 : 1) * (this.attackHold > 0 ? .55 : 1);
      const speed = (pursue||fleeing ? this.type.speed : Math.min(this.type.speed, distance * 1.5)) * pace;
      if (this.navigation) {
        if (!this.navigator || this.navigationVersion !== this.navigation.version) {
          this.navigator = new NavigationAgent(this.navigation, this.radius, { delay: .4, distance: .65 });
          this.navigationVersion = this.navigation.version;
        }
        const resistance = this.hover ? 1 : (this.navigation.snow?.speedScale(this.position.x, this.position.z) ?? 1)*(river?.speed(this.position)??1)*(this.navigation.lake?.speed(this.position)??1)*(this.navigation.lake?.onIce(this.position)?LAKE_ENEMY_ICE_SPEED:1);
        const routeGoal=river?.steer(this,goal,neighbors,Math.abs(Math.round(this.home.x*73+this.home.z*31))+this.generation,this.hover)??goal;
        const fromX=this.position.x,fromZ=this.position.z;
        this.navigator.step(this, routeGoal, speed * resistance, motionDt, neighbors);
        if(lake?.enabled&&!this.hover)lake.avoidHoles({x:fromX,z:fromZ},this.position);
      } else if (distance > .001) {
        // Hovering rigs ignore ground drifts. Hold mode keeps their familiar return spring.
        const travel = Math.min(distance, speed * motionDt);
        this.position.x += dx / distance * travel; this.position.z += dz / distance * travel;
      }
    }
    const travelled = Math.hypot(this.position.x - oldX, this.position.z - oldZ);
    // A longer hold bridges one-frame navigation stalls, which used to flick walk → idle → walk.
    this.walkHold = travelled > .003 ? .3 : Math.max(0, this.walkHold - dt);
    const walk = this.walkHold > 0 && this.crowd.has('walk');
    const nextClip = this.crowd.clip(walk ? 'walk' : 'idle');
    // Keep the clip clock running across the swap: restarting at frame 0 read as a hitch.
    if (nextClip !== this.clip) this.clip = nextClip;
    this.clipTime += animationDt * (walk ? Math.max(.35, Math.min(1.5, travelled / dt / this.type.speed)) * (this.type.stride ?? 1) : 1);
    // Attacking or circling: face the player while walking (strafe), else face the way it walks.
    const aiming = pursue && (this.attackHold > 0 || this.rooted > 0 || circling);
    const want = !aiming && this.navigation && travelled > .003 ? Math.atan2(this.position.x - oldX, this.position.z - oldZ)
      : Math.atan2(player.x - this.position.x, player.z - this.position.z);
    this.yaw = turnToward(this.yaw, want, animationDt * (aiming ? 6 : 3));
  }

  private safePosition(): void {
    if (this.navigation && !this.navigation.clear(this.position, this.position, this.radius)) {
      const safe = this.navigation.project(this.position, this.radius);
      this.position.x = safe.x; this.position.z = safe.z;
    }
  }

  muzzle(out: Vector3, index = 0): Vector3 {
    const world = crowdWorld(this.position, this.yaw + this.clip.yaw, this.scale * (this.type.size ?? 1), this.type.modelLift);
    if (this.clip.muzzles.length) this.crowd.muzzle(this.clip, this.crowd.frameAt(this.clip, this.clipTime), index, world, out);
    else out.copyFrom(this.position).addInPlaceFromFloats(0, this.barHeight * .55, 0);
    return out;
  }

  draw(): void {
    if (this.scale <= .002) return;
    const t = Math.min(1, this.sinceHit / .2);
    const kick = this.alive ? Math.sin(t * Math.PI) * (1 - t) * .24 : 0;
    this.drawPosition.copyFrom(this.position).addInPlaceFromFloats(this.recoil.x * kick, 0, this.recoil.z * kick);
    const world = crowdWorld(this.drawPosition, this.yaw + this.clip.yaw, this.scale * (this.type.size ?? 1), this.type.modelLift);
    this.crowd.add(world, this.clip, this.crowd.frameAt(this.clip, this.clipTime), Math.min(1, this.flash / .07) * 1.6);
  }
}

/** A Rapture energy shield that stops player shots (the Tripod bubble). */
export interface ShotShield {
  readonly center: Vector3;
  readonly radius: number;
  readonly up: boolean;
  /** a shot of `damage` struck the shield at `at` */
  block(at: Vector3, damage: number): void;
}

export class TargetField {
  readonly targets: Target[] = [];
  /** supply-squad NIKKEs on the field: Raptures may chase and shoot them instead of the player */
  readonly squad: SquadMember[] = [];
  /** shields player shots can't pass into (shots fired from inside them pass out freely) */
  readonly shields = new Set<ShotShield>();
  /**
   * Scripted props that any player attack can strike (the forest easter egg). Player shots
   * (alongSegment) and each kit's blasts and slashes report their shape here as an "is (x, z)
   * within `r`" test. Raptures also query inRadius, so that query does not report.
   */
  readonly areaListeners = new Set<(test: (x: number, z: number, pad: number) => boolean) => void>();
  areaHit(test: (x: number, z: number, pad: number) => boolean): void { for (const listen of this.areaListeners) listen(test); }
  private readonly crowds = new Map<string, CrowdModel>();
  private readonly snowTracks = new Map<Target, { track: SnowTrack; generation: number }>();
  readonly navigation: SnowNavigationMap;
  private movement: EnemyMovement = 'hold';
  private readonly playerBody: NavigationBody = { position: { x: 0, z: 0 }, radius: .45, alive: true };
  /** every target plus the player, refilled each update so steering allocates nothing */
  private readonly neighbors: NavigationBody[] = [];

  constructor(private readonly scene: Scene, private readonly shadows: ShadowGenerator, private readonly snow?: SnowField) {
    this.navigation = new SnowNavigationMap(snow, ARENA_RADIUS);
  }
  get movementMode(): EnemyMovement { return this.movement; }
  setMovement(mode: EnemyMovement): void {
    if (this.movement === mode) return;
    this.movement = mode;
    for (const target of this.targets) target.resetNavigation();
  }

  /** Load the training Raptures' models; `training: false` skips placing the twelve targets. */
  async load({ training = true }: { training?: boolean } = {}): Promise<void> {
    const types = Object.values(RAPTURE_TYPES);
    await preloadModels(this.scene, types.map(modelUrl));
    addPelicanWalk(this.scene, modelUrl(RAPTURE_TYPES.pelican), modelUrl(RAPTURE_TYPES.crawler));
    for (const type of types) this.crowds.set(type.id, this.createCrowd(type));
    if (!training) return;
    // An arc in view of the starting camera, two flankers, and a cluster further out for area attacks.
    const { lure, pelican, crawler } = RAPTURE_TYPES;
    const layout: [MinionType, number, number][] = [
      [lure, -5, 5.5], [crawler, -1.8, 7], [pelican, 2.2, 6.8], [lure, 5.5, 5],
      [lure, 7, -.5], [crawler, -7, 0],
      [lure, -2, 13], [lure, 0, 14.5], [lure, 2, 13], [crawler, 0, 11.5], [pelican, -4, 15.5], [pelican, 4, 15.5],
    ];
    for (const [type, x, z] of layout) this.targets.push(new Target(type, this.crowds.get(type.id)!, new Vector3(x, 0, z), TARGET_HP,
      this.navigation, RAPTURE_SNOW_CONTACTS[type.id] === null));
  }

  /** Load crowds for more Rapture types (game-mode spawns); models already loaded are reused. */
  async ensureTypes(types: readonly MinionType[]): Promise<void> {
    const missing = types.filter((type) => !this.crowds.has(type.id));
    await preloadModels(this.scene, missing.map(modelUrl));
    for (const type of missing) if (!this.crowds.has(type.id)) this.crowds.set(type.id, this.createCrowd(type));
  }

  /** Add a pursuing target that stays dead (game-mode spawns). Its type must be loaded. */
  spawn(type: MinionType, at: Vector3, maxHp: number, { hover = false }: { hover?: boolean } = {}): Target {
    const crowd = this.crowds.get(type.id);
    if (!crowd) throw new Error(`Rapture model ${type.id} is not loaded`);
    const target = new Target(type, crowd, at.clone(), maxHp, this.navigation, hover);
    target.respawns = false;
    target.pursues = true;
    target.scale = .001; // grows in over a quarter second, like a respawn
    this.targets.push(target);
    return target;
  }

  private createCrowd(type: MinionType): CrowdModel {
    return new CrowdModel(this.scene, modelUrl(type), this.shadows, {
      muzzles: (_clip, nodes) => {
        // Lure fires from its central red emitter, not either side weapon.
        // Bake the body attachment with each animation so the charge and laser
        // follow its hover; the offset puts the origin on the front of the core.
        if (type.id === RAPTURE_TYPES.lure.id && nodes.has('socket_position_center')) {
          // The red face is near model z=.86, y=1.22; the socket is y=1.262.
          return [{ joint: 'socket_position_center', offset: [0, -.04, .88] as [number, number, number] }];
        }
        // Loud Mouth's cannons: each barrel is two long jaws (Bone011 upper, Bone009 lower) along the
        // bone's +x. Muzzles 0/1 sit at the left/right barrel tips in the gap between the jaws;
        // 2/3 sit back along the same gap, so the charge can glow down the barrel.
        if (type.id === 'ecg001' && nodes.has('Bone009_L')) {
          const at = (joint: string, x: number) => ({ joint, offset: [x, .42, 0] as [number, number, number] });
          // 4–6: the rocket slots on top of the head
          const slot = (joint: string) => ({ joint, offset: [0, 0, 0] as [number, number, number] });
          return [at('Bone009_L', 5.1), at('Bone009_R', 5.1), at('Bone009_L', .6), at('Bone009_R', .6),
            slot('Bone_body_022'), slot('Bone_body_026'), slot('Bone_body_020')];
        }
        // Cucumber: muzzle 0 is the tip of the single long cannon on its left arm (Bone017); 1–3
        // are the tips of the right arm's three orb barrels. (Its own sockets sit on a belly bone.)
        if (type.id === 'bcg001' && nodes.has('Bone017')) {
          const tip = (joint: string, x: number, y = 0) => ({ joint, offset: [x, y, 0] as [number, number, number] });
          return [tip('Bone017', 3.3), tip('Bone004', 2.4, -.3), tip('Bone0055', 2.4, -.25), tip('Bone0066', 2.2, -.25)];
        }
        // Seahorse fires from the red eye on top of its head, not the tail muzzle.
        if (type.id === 'xma003' && nodes.has('Bone_eye')) return [{ joint: 'Bone_eye', offset: [0, 0, 0] as [number, number, number] }];
        return [...nodes.keys()].filter((n) => n.startsWith('socket_muzzle_fire_'))
          .map((joint) => ({ joint, offset: [0, 0, 0] as [number, number, number] }));
      },
    });
  }

  update(dt: number, player: Vector3): void {
    if (dt <= 0) return;
    this.navigation.beginFrame(2);
    this.playerBody.position.x = player.x; this.playerBody.position.z = player.z;
    const neighbors = this.neighbors;
    neighbors.length = 0;
    for (const t of this.targets) neighbors.push(t);
    neighbors.push(this.playerBody);
    for (const t of this.targets) {
      const from = { x: t.position.x, z: t.position.z };
      t.update(dt, t.victim?.alive ? t.victim.position : player, t.pursues || this.movement === 'pursue', neighbors, this.movement === 'inactive');
      const shape = RAPTURE_SNOW_CONTACTS[t.type.id];
      if (!this.snow?.enabled || !shape || !t.alive || t.scale < .99 || dt <= 0) continue;
      let state = this.snowTracks.get(t);
      if (!state) {
        state = { track: createSnowTrack(shape), generation: t.generation };
        this.snowTracks.set(t, state);
      }
      if (state.track.revision !== this.snow.revision || state.generation !== t.generation) {
        this.snow.plant(t.position, t.yaw, state.track);
        state.generation = t.generation;
      } else this.snow.trail(from, t.position, state.track, t.yaw, t.radius);
    }
    for (let i = this.targets.length - 1; i >= 0; i--) {
      const t = this.targets[i];
      if (!t.removed) continue;
      this.targets.splice(i, 1);
      this.snowTracks.delete(t);
    }
  }

  draw(): void {
    for (const crowd of this.crowds.values()) crowd.begin();
    for (const t of this.targets) t.draw();
    for (const crowd of this.crowds.values()) crowd.end();
  }

  /**
   * Targets a horizontal segment passes through, nearest first: from `origin` along unit `dir` for
   * `length` metres, `pad` metres thick.
   */
  alongSegment(origin: Vector3, dir: Vector3, length: number, pad: number, out: { target: Target; at: number }[] = []): { target: Target; at: number }[] {
    out.length = 0;
    if (this.areaListeners.size) this.areaHit((px, pz, r) => {
      const ox = px - origin.x, oz = pz - origin.z, along = ox * dir.x + oz * dir.z;
      return along >= -r && along <= length + r && Math.abs(ox * dir.z - oz * dir.x) <= pad + r;
    });
    for (const target of this.targets) {
      if (!target.alive) continue;
      const ox = target.position.x - origin.x, oz = target.position.z - origin.z;
      const along = ox * dir.x + oz * dir.z;
      const r = target.radius + pad;
      if (along < -r || along > length + r) continue;
      const side = Math.abs(ox * dir.z - oz * dir.x);
      if (side > r) continue;
      out.push({ target, at: Math.max(0, along - Math.sqrt(Math.max(0, r * r - side * side))) });
    }
    return out.sort((a, b) => a.at - b.at);
  }

  /**
   * Where the shot segment from→to first enters a raised shield from outside, as a 0..1 fraction
   * of the segment, or null. Shields are vertical cylinders, so height never lets a shot through.
   */
  shieldContact(from: Vector3, to: Vector3): { t: number; shield: ShotShield } | null {
    let best: { t: number; shield: ShotShield } | null = null;
    for (const shield of this.shields) {
      if (!shield.up) continue;
      const ox = from.x - shield.center.x, oz = from.z - shield.center.z, r2 = shield.radius * shield.radius;
      const c = ox * ox + oz * oz - r2;
      if (c <= 0) continue; // fired from inside
      const dx = to.x - from.x, dz = to.z - from.z, a = dx * dx + dz * dz;
      if (a < 1e-9) continue;
      const b = ox * dx + oz * dz, disc = b * b - a * c;
      if (disc < 0) continue;
      const t = (-b - Math.sqrt(disc)) / a;
      if (t >= 0 && t <= 1 && (!best || t < best.t)) best = { t, shield };
    }
    return best;
  }

  inRadius(center: Vector3, radius: number): Target[] {
    return this.targets.filter((t) => t.alive && Math.hypot(t.position.x - center.x, t.position.z - center.z) <= radius + t.radius);
  }

  /** Living targets inside a horizontal cone (yaw = atan2(x, z)). */
  inCone(origin: Vector3, yaw: number, halfAngle: number, range: number): Target[] {
    return this.targets.filter((t) => {
      if (!t.alive) return false;
      const dx = t.position.x - origin.x, dz = t.position.z - origin.z, d = Math.hypot(dx, dz);
      if (d > range + t.radius) return false;
      const off = Math.abs(Math.atan2(Math.sin(Math.atan2(dx, dz) - yaw), Math.cos(Math.atan2(dx, dz) - yaw)));
      return off <= halfAngle + Math.atan2(t.radius, Math.max(d, .01));
    });
  }

  nearest(from: Vector3, count: number, maxRange = Infinity): Target[] {
    return this.targets
      .filter((t) => t.alive && t.scale > .5)
      .map((t) => ({ t, d: Math.hypot(t.position.x - from.x, t.position.z - from.z) }))
      .filter((e) => e.d <= maxRange)
      .sort((a, b) => a.d - b.d)
      .slice(0, count)
      .map((e) => e.t);
  }
}
