// Training Raptures can hold their marks or pursue the player. Grounded rigs use
// body-sized routes around snow banks; their baked crowd animations follow travel.

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

export class Target {
  hp: number;
  alive = true;
  flash = 0;
  yaw: number;
  scale = 1;
  /** seconds since the last hit, for the health bar's fade */
  sinceHit = 99;
  /** Incremented on respawn so effects from a previous life cannot hurt the new target. */
  generation = 0;
  readonly marks = new Set<string>();
  slowed = 0;
  stunned = 0;
  attackHold = 0;
  /** Training targets come back on their mark; game-mode spawns stay dead. */
  respawns = true;
  /** A non-respawning target has finished collapsing; the field drops it. */
  removed = false;
  /** Chase the player regardless of the field's movement setting (game-mode spawns). */
  pursues = false;
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

  constructor(readonly type: MinionType, private readonly crowd: CrowdModel, readonly home: Vector3, readonly maxHp = TARGET_HP,
    private readonly navigation?: SnowNavigationMap, private readonly hover=false) {
    this.hp = maxHp;
    this.yaw = Math.atan2(-home.x, -home.z);
    this.clip = crowd.clip('idle');
    this.position = home.clone();
  }

  readonly position: Vector3;
  get radius(): number { return this.type.radius; }
  get damageMultiplier(): number { return 4 ** this.marks.size; }
  get barHeight(): number { return (this.type.barHeight ?? 2.7) + this.type.modelLift; }
  resetNavigation(): void { this.navigator = null; this.navigationVersion = -1; }

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
        this.marks.clear();
        this.slowed = this.stunned = 0;
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
    this.slowed = Math.max(0, this.slowed - dt);
    this.stunned = Math.max(0, this.stunned - dt);
    const animationDt = this.stunned > 0 ? 0 : dt * (this.slowed > 0 ? .7 : 1);
    const motionDt = inactive || this.attackHold > 0 ? 0 : animationDt;
    if (this.scale < 1) this.scale = Math.min(1, this.scale + dt * 4);
    this.safePosition();
    const oldX = this.position.x, oldZ = this.position.z;
    if (this.navigation) this.navigation.push(this.position, this.push.x * dt, this.push.z * dt, this.radius);
    else this.position.addInPlace(this.push.scale(dt));
    this.push.scaleInPlace(Math.exp(-dt * 7));
    const goal = pursue ? player : this.home;
    const dx = goal.x - this.position.x, dz = goal.z - this.position.z, distance = Math.hypot(dx, dz);
    // Ranged enemies only settle at standoff distance when the hill no longer
    // hides the player. Otherwise keep routing around it to regain a firing line.
    const covered = pursue && distance <= this.type.range * .8 && this.navigation?.traceCover(
      { x: this.position.x, y: 1.1, z: this.position.z }, { x: player.x, y: 1.1, z: player.z }) != null;
    const moving = pursue ? distance > this.type.range * .8 || covered : distance > .04;
    if (moving && motionDt > 0) {
      const speed = pursue ? this.type.speed : Math.min(this.type.speed, distance * 1.5);
      if (this.navigation) {
        if (!this.navigator || this.navigationVersion !== this.navigation.version) {
          this.navigator = new NavigationAgent(this.navigation, this.radius, { delay: .4, distance: .65 });
          this.navigationVersion = this.navigation.version;
        }
        const resistance = this.hover ? 1 : this.navigation.snow?.speedScale(this.position.x, this.position.z) ?? 1;
        this.navigator.step(this, goal, speed * resistance, motionDt, neighbors);
      } else if (distance > .001) {
        // Hovering rigs ignore ground drifts. Hold mode keeps their familiar return spring.
        const travel = Math.min(distance, speed * motionDt);
        this.position.x += dx / distance * travel; this.position.z += dz / distance * travel;
      }
    }
    const travelled = Math.hypot(this.position.x - oldX, this.position.z - oldZ);
    this.walkHold = travelled > .003 ? .12 : Math.max(0, this.walkHold - dt);
    const walk = this.attackHold <= 0 && this.walkHold > 0 && this.crowd.has('walk');
    const nextClip = this.crowd.clip(walk ? 'walk' : 'idle');
    if (nextClip !== this.clip) { this.clip = nextClip; this.clipTime = 0; }
    // Charging holds locomotion, but the idle pose must keep animating.
    this.clipTime += animationDt * (walk ? Math.max(.2, Math.min(1.5, travelled / dt / this.type.speed)) : 1);
    const want = this.navigation && travelled > .003 ? Math.atan2(this.position.x - oldX, this.position.z - oldZ)
      : Math.atan2(player.x - this.position.x, player.z - this.position.z);
    this.yaw = turnToward(this.yaw, want, motionDt * 3);
  }

  private safePosition(): void {
    if (this.navigation && !this.navigation.clear(this.position, this.position, this.radius)) {
      const safe = this.navigation.project(this.position, this.radius);
      this.position.x = safe.x; this.position.z = safe.z;
    }
  }

  muzzle(out: Vector3, index = 0): Vector3 {
    const world = crowdWorld(this.position, this.yaw + this.clip.yaw, this.scale, this.type.modelLift);
    if (this.clip.muzzles.length) this.crowd.muzzle(this.clip, this.crowd.frameAt(this.clip, this.clipTime), index, world, out);
    else out.copyFrom(this.position).addInPlaceFromFloats(0, this.barHeight * .55, 0);
    return out;
  }

  draw(): void {
    if (this.scale <= .002) return;
    const t = Math.min(1, this.sinceHit / .2);
    const kick = this.alive ? Math.sin(t * Math.PI) * (1 - t) * .24 : 0;
    this.drawPosition.copyFrom(this.position).addInPlaceFromFloats(this.recoil.x * kick, 0, this.recoil.z * kick);
    const world = crowdWorld(this.drawPosition, this.yaw + this.clip.yaw, this.scale, this.type.modelLift);
    this.crowd.add(world, this.clip, this.crowd.frameAt(this.clip, this.clipTime), Math.min(1, this.flash / .07) * 1.6);
  }
}

export class TargetField {
  readonly targets: Target[] = [];
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
      t.update(dt, player, t.pursues || this.movement === 'pursue', neighbors, this.movement === 'inactive');
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
