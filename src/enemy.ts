import { Matrix, Vector3 } from '@babylonjs/core';
import { BASE } from './chibi';
import { crowdWorld, type CrowdClip, type UnitModel, type UnitTint } from './crowd';
import { StatusSet } from './abilities/status';
import roster from './minion-roster.json';
import { BLUE_BASE, RED_BASE, type World } from './world';
import type { Combat } from './combat';
import { NavigationAgent } from './navigation';
import { LANES, type Lane } from './battleground';

export type Team = 'blue' | 'red';
/** Anything that fights: heroes, lane minions and summons. */
export interface EnemyTarget {
  readonly position: Vector3;
  readonly alive: boolean;
  readonly radius: number;
  readonly life: number;
  readonly hp: number;
  readonly maxHp: number;
  readonly status: StatusSet;
  /** Returns true when this hit kills. Statuses (vulnerable, invulnerable) scale `amount`. */
  takeDamage(amount: number): boolean;
  heal(amount: number): void;
}

export interface MinionType {
  id: string; name: string; team: Team; radius: number; modelLift: number;
  speed: number; range: number; aggro: number; windup: number; cooldown: number;
  damage: number; attack: 'bolt' | 'fan' | 'mortar';
  /** default 300 */
  hp?: number;
  /** model scale, default 1 (radius is already at this size) */
  size?: number;
  /** walk-cycle rate at full speed, default 1 (raise it when a unit moves faster than its clip) */
  stride?: number;
  /** health bar height above the feet, before modelLift; defaults by team */
  barHeight?: number;
}

/** A summoned or charmed unit: who it fights for and until when. Lane minions have none. */
export interface SummonBinding {
  readonly owner: { readonly position: Vector3 };
  /** the unit's age (seconds since it spawned) at which this ends */
  readonly endsAt: number;
  /** follow the owner between fights, or hold the spot */
  readonly behaviour: 'follow' | 'guard';
  /** charmed lane minions return to this side when it ends; summons die instead */
  readonly revertTo?: Team;
}

/** seconds a knockback takes */
const PUSH_TIME = .2;
/** Summons regroup on their owner past this distance, dropping their target. */
const LEASH = 12;
export const RAPTURE_TYPES: Record<string, MinionType> = {
  lure: { id: 'bma002', name: 'Lure', team: 'red', radius: .85, modelLift: .04, speed: 3.4, range: 6.5, aggro: 11, windup: .55, cooldown: 2.1, damage: 32, attack: 'bolt' },
  pelican: { id: 'bmg001', name: 'Pelican', team: 'red', radius: 1.2, modelLift: .07, speed: 3.4, range: 8, aggro: 11, windup: .8, cooldown: 2.8, damage: 22, attack: 'fan' },
  crawler: { id: 'mmg005', name: 'Crawler', team: 'red', radius: 1.1, modelLift: .05, speed: 3.4, range: 5.5, aggro: 11, windup: .85, cooldown: 3.1, damage: 65, attack: 'mortar' },
};
export const NIKKE_MINIONS: MinionType[] = roster.map(unit => ({
  ...unit, team: 'blue', radius: .65, modelLift: .04, speed: 3.4, range: 6.5,
  aggro: 11, windup: .45, cooldown: 1.8, damage: 30, attack: 'bolt',
}));
export const MINION_IDS = new Set(roster.map(unit => unit.id));
export const modelUrl = (type: MinionType) => type.team === 'blue'
  ? BASE + type.id + '.glb' : import.meta.env.BASE_URL + 'raptures/' + type.id + '.glb';

type EnemyState = 'march' | 'chase' | 'windup' | 'recover' | 'dead';
let nextUnitId = 0;

/** Shared lane minion. Dummy remains the internal name used by hero targeting.
 * Units are plain data; their model's CrowdModel draws them (see Combat.updatePresentation). */
export class Dummy implements EnemyTarget {
  readonly id = nextUnitId++;
  readonly name: string;
  readonly position: Vector3;
  readonly radius: number;
  readonly barHeight: number;
  readonly maxHp: number;
  readonly life = 0; // Units are never revived; replacement waves receive new objects.
  /** changes while charmed (see convert) */
  team: Team;
  readonly status = new StatusSet();
  hp: number;
  tint: UnitTint | null = null;
  state: EnemyState = 'march';
  currentClip = '';
  removable = false;
  renderActive = true;
  /** heading about +Y; 0 faces +Z */
  yaw: number;
  private scale = 1;
  private clip!: CrowdClip;
  private clipTime = 0;
  private clipSpeed = 1;
  private target: EnemyTarget | null = null;
  private readonly navigators: Record<Team, NavigationAgent>;
  private readonly nikke: boolean;
  private thinkIn = 0;
  private lostSight = 0;
  private muzzleIndex = 0;
  private flash = 0;
  /** knockback: velocity and time left */
  private pushX = 0;
  private pushZ = 0;
  private pushLeft = 0;
  private timer = 0;
  private cooldown = 0;
  private age = 0;
  private movementHold = 0;
  private moveSpeed = 0;
  private readonly aim = new Vector3();
  private readonly destination: Vector3;
  private readonly route: Vector3[];
  private routeIndex = 1;

  constructor(home: Vector3, readonly type: MinionType, private readonly world: World, private readonly crowd: UnitModel,
    public summon: SummonBinding | null = null, readonly lane: Lane = LANES.find(l=>l.id==='mid')!) {
    this.name = type.name;
    this.maxHp = this.hp = type.hp ?? 300;
    this.team = type.team;
    // Nikke bodies run and have a death clip; Raptures (also when summoned) and props do not
    this.nikke = crowd.has('run') && crowd.has('death');
    this.radius = type.radius;
    this.navigators = { blue:new NavigationAgent(world.navigationFor('blue'),this.radius), red:new NavigationAgent(world.navigationFor('red'),this.radius) };
    this.thinkIn = (this.id % 15) / 60;
    this.barHeight = (type.barHeight ?? (this.team === 'blue' ? 2.45 : 2.7)) + type.modelLift;
    this.destination = (this.team === 'blue' ? RED_BASE : BLUE_BASE).clone();
    this.route = (this.team==='blue' ? lane.points : [...lane.points].reverse()).map(p=>new Vector3(p.x,0,p.z));
    // Start at the next waypoint along the segment where this wave spawned.
    let closest=Infinity;
    for(let i=1;i<this.route.length;i++) {
      const a=this.route[i-1],b=this.route[i],dx=b.x-a.x,dz=b.z-a.z;
      const t=Math.max(0,Math.min(1,((home.x-a.x)*dx+(home.z-a.z)*dz)/(dx*dx+dz*dz)));
      const d=Math.hypot(home.x-a.x-dx*t,home.z-a.z-dz*t);
      if(d<closest){closest=d;this.routeIndex=i;}
    }
    this.position = home.clone();
    this.yaw = this.team === 'blue' ? Math.PI / 4 : -3 * Math.PI / 4;
    this.play('idle');
  }

  get alive(): boolean { return this.hp > 0; }
  /** Windup telegraph ring scale, or 0 when not winding up. */
  get charge(): number { return this.state === 'windup' ? .6 + .4 * Math.max(0, this.timer) / this.type.windup : 0; }
  takeDamage(amount: number): boolean { return this.hit(amount); }
  hit(damage: number): boolean {
    damage = this.status.absorb(damage * this.status.damageTaken);
    if (!this.alive || damage <= 0) return false;
    this.hp = Math.max(0, this.hp - damage);
    this.flash = .12;
    if (this.alive) return false;
    this.die();
    return true;
  }
  heal(amount: number): void {
    if (this.alive) this.hp = Math.min(this.maxHp, this.hp + amount);
  }
  /** Knock back `distance` along (dx, dz) over a fifth of a second; walls stop it. */
  displace(dx: number, dz: number, distance: number): void {
    const length = Math.hypot(dx, dz);
    if (!this.alive || distance <= 0) return;
    const [x, z] = length > 1e-3 ? [dx / length, dz / length] : [Math.sin(this.yaw), Math.cos(this.yaw)];
    this.pushX = x * distance / PUSH_TIME;
    this.pushZ = z * distance / PUSH_TIME;
    this.pushLeft = PUSH_TIME;
  }
  /** Fight for `team` (following `owner`) for `duration` seconds, then return to this side. */
  convert(team: Team, owner: { readonly position: Vector3 }, duration: number, tint: UnitTint): void {
    if (!this.alive || this.summon && !this.summon.revertTo) return;
    this.summon = { owner, endsAt: this.age + duration, behaviour: 'follow', revertTo: this.summon?.revertTo ?? this.team };
    this.team = team;
    this.tint = tint;
    this.target = null;
    if (this.state === 'windup') this.state = 'march';
  }
  /** A summon's time ran out (or a newer one replaced it): it dies without giving XP. */
  expire(): void {
    if (!this.alive) return;
    this.hp = 0;
    this.die();
  }
  private die(): void {
    this.state = 'dead';
    this.timer = 1.2;
    this.target = null;
    this.status.clear();
    if (this.nikke) this.play('death');
    else this.clipSpeed = 0; // Raptures have no death clip: hold the pose while shrinking.
  }

  update(dt: number, combat: Combat): void {
    this.clipTime += dt * this.clipSpeed;
    this.flash = Math.max(0, this.flash - dt);
    if (!this.alive) {
      this.timer -= dt;
      if (!this.nikke || this.timer < .35) this.scale = Math.max(.001, this.scale - dt * 4);
      this.removable = this.timer <= 0;
      return;
    }
    this.age += dt;
    if (this.summon && this.age >= this.summon.endsAt) {
      if (!this.summon.revertTo) { this.expire(); return; }
      this.team = this.summon.revertTo;
      this.summon = null;
      this.target = null;
      this.tint = null;
    }
    if (!this.summon && this.age >= 240) {
      // Bound unattended population; units reaching a base stay and attack its core.
      this.hp = 0; this.removable = true; return;
    }
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.pushLeft > 0) {
      const step = Math.min(dt, this.pushLeft);
      this.pushLeft -= dt;
      const next = { x: this.position.x + this.pushX * step, z: this.position.z + this.pushZ * step };
      if (this.world.navigationFor(this.team).clear(this.position, next, this.radius)) { this.position.x = next.x; this.position.z = next.z; }
      else this.pushLeft = 0;
      if (this.state === 'windup') this.state = 'march';
      return;
    }
    if (this.status.stunned) {
      if (this.state === 'windup') this.state = 'march';
      // Nikkes have a stun clip; Raptures freeze in place until it ends.
      if (this.crowd.has('stun')) this.play('stun');
      else this.clipSpeed = 0;
      return;
    }
    if (this.clipSpeed === 0) this.clipSpeed = 1;
    if (this.state === 'windup') {
      if (!this.target?.alive) this.state = 'march';
      else {
        this.timer -= dt;
        this.face(this.aim, dt);
        if (this.timer <= 0) {
          this.state = 'recover'; this.timer = .35; this.cooldown = this.type.cooldown / this.status.attackSpeed;
          this.play('shot', true);
          if (combat.lineOfSight(this.position, this.aim)) combat.enemyAttack(this, this.muzzle(), this.aim, this.target);
        }
        return;
      }
    }
    if (this.state === 'recover') {
      this.timer -= dt;
      if (this.timer > 0) return;
      this.state = 'march';
    }
    this.thinkIn -= dt;
    if (this.target && !combat.lineOfSight(this.position, this.target.position)) this.lostSight += dt;
    else this.lostSight = 0;
    const leashed = this.summon?.behaviour === 'follow' && distance(this.position, this.summon.owner.position) > LEASH;
    if (this.target && (!this.target.alive || distance(this.position, this.target.position) > this.type.aggro + 3 || this.lostSight > 2 || leashed)) this.target = null;
    if (this.thinkIn <= 0) {
      if (!leashed) this.target = combat.minionTarget(this, this.target);
      this.thinkIn = .25;
    }
    if (!this.target) {
      this.state = 'march';
      if (!this.summon) {
        while (this.routeIndex<this.route.length-1 && distance(this.position,this.route[this.routeIndex])<3) this.routeIndex++;
        this.move(this.route[this.routeIndex] ?? this.destination, dt, combat);
      }
      else if (this.summon.behaviour === 'follow' && distance(this.position, this.summon.owner.position) > 3) this.move(this.summon.owner.position, dt, combat);
      else this.play('idle');
      return;
    }
    if (distance(this.position, this.target.position) > this.type.range + this.target.radius || !combat.lineOfSight(this.position, this.target.position)) {
      if (this.summon?.behaviour === 'guard') { this.target = null; this.play('idle'); return; }
      this.state = 'chase'; this.move(this.target.position, dt, combat); return;
    }
    this.face(this.target.position, dt);
    this.play(this.crowd.has('aim_idle') ? 'aim_idle' : 'idle');
    if (this.cooldown > 0) return;
    this.state = 'windup'; this.timer = this.type.windup;
    this.aim.copyFrom(this.target.position);
  }

  setRenderActive(active: boolean): void { this.renderActive = active; }

  /** Queue this unit in its crowd for the current frame. */
  draw(): void {
    this.crowd.add(this.modelWorld(), this.clip, this.crowd.frameAt(this.clip, this.clipTime), this.flash > 0 ? 1 : 0, this.tint);
  }

  private modelWorld(): Matrix {
    return crowdWorld(this.position, this.yaw + this.clip.yaw, this.scale, this.type.modelLift);
  }
  private play(name: string, restart = false): void {
    if (this.currentClip === name && !restart) return;
    this.currentClip = name;
    this.clip = this.crowd.clip(name);
    this.clipTime = 0;
    this.clipSpeed = name === 'run' ? .8 : 1;
  }
  private face(at: Vector3, dt: number): void {
    const yaw = Math.atan2(at.x - this.position.x, at.z - this.position.z);
    const delta = Math.atan2(Math.sin(yaw - this.yaw), Math.cos(yaw - this.yaw));
    this.yaw += Math.max(-dt * 9, Math.min(dt * 9, delta));
  }
  private move(at: Vector3, dt: number, combat: Combat): void {
    const x = this.position.x, z = this.position.z;
    this.navigators[this.team].step(this, at, this.type.speed * this.status.speedFactor, dt, combat.nearbyUnits(this));
    combat.resolveEnemyPosition(this);
    const dx = this.position.x - x, dz = this.position.z - z, distance = Math.hypot(dx, dz);
    const speed = dt > 0 ? distance / dt : 0;
    this.moveSpeed += (speed - this.moveSpeed) * Math.min(1, dt * 12);
    if (speed > .3) this.movementHold = .18;
    else this.movementHold = Math.max(0, this.movementHold - dt);
    if (distance > .002) {
      const yaw = Math.atan2(dx, dz), delta = Math.atan2(Math.sin(yaw - this.yaw), Math.cos(yaw - this.yaw));
      this.yaw += Math.max(-dt * 9, Math.min(dt * 9, delta));
    }
    if (this.movementHold > 0) {
      this.play(this.nikke ? 'run' : this.crowd.has('walk') ? 'walk' : 'idle');
      this.clipSpeed = Math.max(.25, Math.min(1, this.moveSpeed / this.type.speed)) * (this.nikke ? .8 : 1);
    } else this.play('idle');
  }
  private muzzle(): Vector3 {
    return this.crowd.muzzle(this.clip, this.crowd.frameAt(this.clip, this.clipTime), this.muzzleIndex++, this.modelWorld(), new Vector3());
  }
}
function distance(a: Vector3, b: Vector3): number { return Math.hypot(a.x - b.x, a.z - b.z); }
