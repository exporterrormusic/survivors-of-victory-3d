// Ability primitives (bolts, lobs, beams, zones, novas, heals, summons) used by the shared
// effect runner (src/abilities/effects.ts), hostile minion attacks, hit resolution and team XP.

import {
  Color3,
  Mesh,
  MeshBuilder,
  Scene,
  StandardMaterial,
  Vector3,
  Frustum,
  Matrix,
  Observable,
  type Ray,
} from '@babylonjs/core';
import { Dummy, RAPTURE_TYPES, NIKKE_MINIONS, modelUrl, type EnemyTarget, type MinionType, type Team } from './enemy';
import { BASE, CLIP_FALLBACKS, aimOffset, clipMuzzle, loadChibiIndex, staticClipYaw, type AimFacing, type ChibiIndex, type MuzzleMode } from './chibi';
import { CrowdModel, ThinBatch, type UnitModel } from './crowd';
import { createTurretModel } from './props';
import { createSector } from './sector';
import type { Effect, HealSpec, Kit, StatusSpec, SummonSpec, ZoneSpec } from './abilities/types';
import { addPelicanWalk, preloadModels } from './model-library';
import { SpatialGrid } from './spatial-grid';
import { MeshPool } from './mesh-pool';
import { WeaponVfx, type ProjectileLook } from './weapon-vfx';
import type { CombatEvent } from './combat-events';
export { Dummy } from './enemy';
import type { World } from './world';
import { LANES, pathPoint } from './battleground';
import { Structure, createStructures } from './structures';
export type AttackTarget = Dummy | Structure;

export const WAVE_INTERVAL = 30;

const BOLT_SPEED = 34;
const BOLT_LENGTH = 1.1;
const HOMING_SPEED = 30;
const HOMING_RANGE = 40;
const HIT_HEIGHT = 1.1; // where bolts aim on a dummy
const FLASH_TIME = 0.08;
/** seconds between zone applications; rates are per second */
const ZONE_TICK = 0.25;
const MARKER_TIME = 0.45;

export const COLORS = {
  basic: new Color3(1, 0.85, 0.45),
  charged: new Color3(0.55, 0.9, 1),
  skill: new Color3(1, 0.55, 0.25),
  move: new Color3(0.3, 1, 0.5),
  attack: new Color3(1, 0.3, 0.3),
  beam: new Color3(1, 0.55, 0.3),
};

const tints = new Map<string, Color3>();
/** Kit colours are hex strings; this caches their Color3. */
export function tintColor(hex: string): Color3 {
  let color = tints.get(hex);
  if (!color) { color = Color3.FromHexString(hex); tints.set(hex, color); }
  return color;
}

type NovaEffect = Extract<Effect, { kind: 'nova' }>;
type ConeEffect = Extract<Effect, { kind: 'cone' }>;

export interface BoltOptions {
  damage: number;
  range: number;
  speed?: number;
  pierce?: boolean;
  size?: number;
  color?: Color3;
  status?: StatusSpec;
  /** distance enemies hit are pushed along the bolt */
  knockback?: number;
  visual?: ProjectileLook;
  splash?: { radius: number; fraction: number };
  /** Rockets detonate on first contact, cover, or at the aimed endpoint. */
  explodeAtEnd?: boolean;
}

export interface HomingOptions {
  damage: number;
  size?: number;
  color?: Color3;
  status?: StatusSpec;
  /** also hit enemies near the target for a fraction of the damage */
  splash?: { radius: number; fraction: number };
}

export interface GrenadeOptions {
  damage: number;
  radius: number;
  flight?: number;
  color?: Color3;
  status?: StatusSpec;
  /** left behind on landing */
  zone?: ZoneSpec;
  /** distance enemies are pushed away from the impact */
  knockback?: number;
}

export interface BeamOptions {
  dps: number;
  width: number;
  length: number;
  color?: Color3;
}

interface Shot {
  mesh: Mesh;
  pool: MeshPool;
  dir: Vector3;
  speed: number;
  damage: number;
  range: number;
  travelled: number;
  pierce: boolean;
  hit: Set<AttackTarget>;
  homing: AttackTarget | null;
  size: number;
  color: Color3;
  status?: StatusSpec;
  splash?: { radius: number; fraction: number };
  knockback?: number;
  visual?: ProjectileLook;
  explodeAtEnd?: boolean;
  trailIn: number;
}

interface Grenade {
  mesh: Mesh;
  from: Vector3;
  to: Vector3;
  t: number;
  flight: number;
  damage: number;
  radius: number;
  color: Color3;
  status?: StatusSpec;
  zone?: ZoneSpec;
  knockback?: number;
}

/** A fading ground shape: cone hits. */
interface Flash {
  mesh: Mesh;
  pool: MeshPool;
  t: number;
  dur: number;
}

interface Zone {
  spec: ZoneSpec;
  at: Vector3;
  left: number;
  tick: number;
  disc: Mesh;
  edge: Mesh;
  team: Team;
}

/** What one application of an area (zone tick, nova) does to the units inside. */
interface AreaHit {
  damage?: number;
  status?: StatusSpec;
  heal?: HealSpec;
  /** heal multiplier: zone rates are per second, applied every ZONE_TICK */
  healScale?: number;
  allyStatus?: StatusSpec;
  /** distance enemies are pushed away from the centre */
  knockback?: number;
}

interface Ring {
  mesh: Mesh;
  t: number;
  dur: number;
  scale: number;
}

interface HostileShot {
  mesh: Mesh; dir: Vector3; speed: number; damage: number; remaining: number; life: number;
  team: Team; target: EnemyTarget;
  homing?: boolean;
}
interface HostileBlast {
  mesh: Mesh; warning: Mesh; from: Vector3; to: Vector3;
  elapsed: number; flight: number; radius: number; damage: number; life: number;
  team: Team; target: EnemyTarget;
}

export class TeamProgress {
  level = 1;
  xp = 0;
  get required(): number { return 160 + this.level * 40; }
  gain(amount: number): void {
    if (this.level >= 20) return;
    this.xp += amount;
    while (this.level < 20 && this.xp >= this.required) { this.xp -= this.required; this.level++; }
    if (this.level === 20) this.xp = 0;
  }
}

export class Combat {
  readonly weaponFx: WeaponVfx;
  /** living and dying red units: what the hero's attacks hit (rebuilt as teams change) */
  readonly dummies: AttackTarget[] = [];
  readonly units: Dummy[] = [];
  readonly structures: Structure[];
  winner: Team | null = null;
  readonly ready: Promise<void>;
  /** Hero takedowns only; lane minion kills grant XP without inflating this score. */
  kills = 0;
  deaths = 0;
  elapsed = 0;
  wave = 0;
  nextWaveIn = WAVE_INTERVAL;
  readonly minionKills = { blue: 0, red: 0 };
  private index!: ChibiIndex;
  readonly blue = new TeamProgress();
  readonly red = new TeamProgress();
  private hero: EnemyTarget | null = null;
  private readonly spatial = new SpatialGrid<Dummy>();
  private readonly targetCandidates: Dummy[] = [];
  private readonly neighbors: Dummy[] = [];
  private readonly projectileUnits: Dummy[] = [];
  private readonly projectileTargets: EnemyTarget[] = [];
  private spatialReady = false;
  private readonly frustum = Frustum.GetPlanes(Matrix.Identity());
  /** one baked crowd per minion model id, plus summon models (see prepareKit) */
  private readonly crowds = new Map<string, UnitModel>();
  /** live summons per spec, oldest first, for SummonSpec.limit */
  private readonly summons = new Map<SummonSpec, Dummy[]>();
  private readonly areaTargets: EnemyTarget[] = [];
  private readonly areaUnits: Dummy[] = [];
  private readonly chargeRings: Record<Team, ThinBatch>;
  private readonly targetRing: Mesh;
  private readonly hoverRing: Mesh;
  /** what happened this frame, for audio and other presentation (see combat-events.ts) */
  readonly events = new Observable<CombatEvent>();
  private hostileShots: HostileShot[] = [];
  private hostileBlasts: HostileBlast[] = [];

  private shots: Shot[] = [];
  private grenades: Grenade[] = [];
  private rings: Ring[] = [];
  private zones: Zone[] = [];
  private flashes: Flash[] = [];
  /** cone-hit meshes, one pool per cone width */
  private readonly sectorPools = new Map<number, MeshPool>();
  private boltTemplate: Mesh;
  private grenadeTemplate: Mesh;
  private ringTemplate: Mesh;
  private readonly boltPool: MeshPool;
  private readonly grenadePool: MeshPool;
  private readonly ringPool: MeshPool;
  private readonly zonePool: MeshPool;
  private mats = new Map<string, StandardMaterial>();
  private zoneMats = new Map<string, StandardMaterial>();
  private beam: Mesh;
  private beamCore: Mesh;
  private readonly beamMat: StandardMaterial;
  private beamTime = 0;
  private beamDps = 0;
  private beamWidth = 1;
  private beamLength = 1;
  private beamReach = 1;
  private beamStatus?: StatusSpec;
  private weaponBeamActive = false;
  private beamFrom = new Vector3();
  private beamDir = new Vector3(0, 0, 1);
  private marker: Mesh;
  private markerTime = 0;
  private flash: Mesh;
  private flashTime = 0;

  constructor(private readonly scene: Scene, private readonly world: World) {
    this.weaponFx = new WeaponVfx(scene, world);
    this.structures = createStructures(scene, world, s => this.structureDestroyed(s));
    this.boltTemplate = MeshBuilder.CreateCapsule('bolt', { radius: 0.16, height: BOLT_LENGTH, orientation: Vector3.Forward() }, scene);
    this.grenadeTemplate = MeshBuilder.CreateSphere('grenade', { diameter: 0.45, segments: 10 }, scene);
    this.ringTemplate = MeshBuilder.CreateTorus('blast', { diameter: 2, thickness: 0.12, tessellation: 48 }, scene);
    for (const t of [this.boltTemplate, this.grenadeTemplate, this.ringTemplate]) {
      t.isPickable = false;
      t.setEnabled(false);
    }
    this.boltPool = new MeshPool(this.boltTemplate);
    this.grenadePool = new MeshPool(this.grenadeTemplate, 64);
    this.ringPool = new MeshPool(this.ringTemplate, 96);
    const zoneTemplate = MeshBuilder.CreateDisc('zone', { radius: 1, tessellation: 64 }, scene);
    zoneTemplate.rotation.x = Math.PI / 2;
    zoneTemplate.bakeCurrentTransformIntoVertices();
    zoneTemplate.isPickable = false;
    zoneTemplate.setEnabled(false);
    this.zonePool = new MeshPool(zoneTemplate, 16);

    // the beam is a unit-length cylinder along +Z from its origin, scaled each frame
    const beamMat = this.beamMat = new StandardMaterial('beam-mat', scene);
    beamMat.emissiveColor = COLORS.beam.clone();
    beamMat.disableLighting = true;
    beamMat.alpha = 0.55;
    this.beam = MeshBuilder.CreateCylinder('beam', { diameter: 1, height: 1, tessellation: 20 }, scene);
    this.beam.rotation.x = Math.PI / 2; // Y-up cylinder onto +Z ...
    this.beam.position.z = 0.5; // ... starting at the origin
    this.beam.bakeCurrentTransformIntoVertices();
    this.beam.material = beamMat;
    this.beam.isPickable = false;
    this.beam.setEnabled(false);
    this.beamCore = this.beam.clone('beam-core');
    this.beamCore.material = this.glowMat(new Color3(1, 1, 0.9));
    this.beamCore.setEnabled(false);
    world.glow.addIncludedOnlyMesh(this.beam);
    world.glow.addIncludedOnlyMesh(this.beamCore);

    this.marker = MeshBuilder.CreateTorus('move-marker', { diameter: 1.2, thickness: 0.1, tessellation: 32 }, scene);
    this.marker.isPickable = false;
    this.marker.setEnabled(false);
    world.glow.addIncludedOnlyMesh(this.marker);

    this.flash = MeshBuilder.CreateSphere('muzzle-flash', { diameter: 0.5, segments: 8 }, scene);
    this.flash.isPickable = false;
    this.flash.setEnabled(false);
    world.glow.addIncludedOnlyMesh(this.flash);

    // Minion selection (hovered / targeted) needs at most two rings; windup telegraphs
    // can appear under every minion at once, so they are thin instances per team.
    const ring = (name: string, color: Color3, alpha: number, thickness: number) => {
      const mat = new StandardMaterial(`${name}-mat`, scene);
      mat.emissiveColor = color;
      mat.disableLighting = true;
      mat.alpha = alpha;
      const mesh = MeshBuilder.CreateTorus(name, { diameter: 1, thickness, tessellation: 24 }, scene);
      mesh.material = mat;
      mesh.isPickable = false;
      mesh.setEnabled(false);
      return mesh;
    };
    this.targetRing = ring('minion-target', new Color3(1, .3, .3), 1, .03);
    this.hoverRing = ring('minion-hover', new Color3(1, .3, .3), .45, .03);
    this.chargeRings = {
      blue: new ThinBatch(ring('minion-windup-blue', new Color3(.3, .75, 1), .8, .04)),
      red: new ThinBatch(ring('minion-windup-red', new Color3(1, .3, .12), .8, .04)),
    };

    this.ready = this.initializeWaves();
  }

  private async initializeWaves(): Promise<void> {
    this.index = await loadChibiIndex();
    for (const type of NIKKE_MINIONS) {
      if (!this.index.variants[type.id]) throw new Error(`Missing ${type.name}; run npm run minions`);
    }
    await preloadModels(this.scene, [...NIKKE_MINIONS, ...Object.values(RAPTURE_TYPES)].map(modelUrl));
    addPelicanWalk(this.scene, modelUrl(RAPTURE_TYPES.pelican), modelUrl(RAPTURE_TYPES.crawler));
    for (const type of NIKKE_MINIONS) {
      const meta = this.index.variants[type.id];
      const gunOffset = aimOffset(meta, 'weapon');
      this.crowds.set(type.id, new CrowdModel(this.scene, modelUrl(type), this.world.shadows, {
        yaw: (clip) => staticClipYaw(meta, clip, gunOffset),
        muzzles: (clip) => { const ref = clipMuzzle(meta, clip); return ref ? [ref] : []; },
      }));
    }
    for (const type of Object.values(RAPTURE_TYPES)) {
      this.crowds.set(type.id, new CrowdModel(this.scene, modelUrl(type), this.world.shadows, {
        muzzles: (_clip, nodes) => [...nodes.keys()].filter((name) => name.startsWith('socket_muzzle_fire_'))
          .map((joint) => ({ joint, offset: [0, 0, 0] as [number, number, number] })),
      }));
    }
    for(const team of ['blue','red'] as const)this.world.navigationFor(team).prepare([.6,.65,.85,1.1,1.2]);
    this.spawnWave();
  }

  private spawnWave(): void {
    this.wave++;
    const raptures = Object.values(RAPTURE_TYPES);
    for (const team of ['blue', 'red'] as const) {
      for (const [laneIndex,lane] of LANES.entries()) for (let i = 0; i < 6; i++) {
        const type = team === 'blue' ? NIKKE_MINIONS[(i+laneIndex*3)%NIKKE_MINIONS.length] : raptures[i % raptures.length];
        const path = team==='blue' ? lane.points : [...lane.points].reverse();
        const p=pathPoint(path,7+Math.floor(i/2)*1.9), next=pathPoint(path,8+Math.floor(i/2)*1.9);
        const yaw=Math.atan2(next.x-p.x,next.z-p.z), side=(i%2-.5)*2.6;
        const safe=this.world.navigationFor(team).project({x:p.x+Math.cos(yaw)*side,z:p.z-Math.sin(yaw)*side},type.radius);
        this.units.push(new Dummy(new Vector3(safe.x,0,safe.z), type, this.world, this.crowds.get(type.id)!, null, lane));
      }
    }
    this.sortTeams();
  }

  /** Units change sides when charmed; keep `dummies` (the red side) in step. */
  private sortTeams(): void {
    this.dummies.length = 0;
    for (const unit of this.units) if (unit.team === 'red') this.dummies.push(unit);
    for (const structure of this.structures) if (structure.team==='red') this.dummies.push(structure);
  }

  private opponents(team: Team, x: number, z: number, radius: number): EnemyTarget[] {
    const targets = this.projectileTargets; targets.length = 0;
    const candidates = this.spatialReady ? this.spatial.query(x, z, radius, this.projectileUnits) : this.units;
    for (const unit of candidates) if (unit.team !== team && unit.alive) targets.push(unit);
    for (const structure of this.structures) if (structure.team!==team && structure.alive) targets.push(structure);
    if (team === 'red' && this.hero?.alive) targets.push(this.hero);
    return targets;
  }

  minionTarget(unit: Dummy, current: EnemyTarget | null = null): EnemyTarget | null {
    // Keep a valid opponent unless another is substantially closer. Brief loss
    // of sight is handled by the unit, allowing it to pursue around cover.
    let nearest = current?.alive && !(current instanceof Structure && current.shielded) ? current : null;
    let best = nearest ? flatDist(unit.position, nearest.position) * .75 : unit.type.aggro;
    const candidates: EnemyTarget[] = this.spatialReady
      ? this.spatial.query(unit.position.x, unit.position.z, unit.type.aggro, this.targetCandidates)
      : this.units;
    for (const target of candidates) {
      if (!target.alive || (target instanceof Dummy && target.team === unit.team)) continue;
      const distance = flatDist(unit.position, target.position);
      if (distance < best && this.lineOfSight(unit.position, target.position)) { nearest = target; best = distance; }
    }
    if (unit.team === 'red' && this.hero?.alive) {
      const distance = flatDist(unit.position, this.hero.position);
      if (distance < best && this.lineOfSight(unit.position, this.hero.position)) { nearest = this.hero; best=distance; }
    }
    for (const structure of this.structures) {
      if (!structure.alive || structure.team===unit.team || structure.shielded) continue;
      const distance=flatDist(unit.position,structure.position)-structure.radius;
      if(distance<best && this.lineOfSight(unit.position,structure.position)){nearest=structure;best=distance;}
    }
    return nearest;
  }

  private updateStructures(dt: number): void {
    for(const structure of this.structures) {
      structure.updateVisual(dt);
      if(!structure.alive || structure.site.kind==='gate') continue;
      structure.cooldown=Math.max(0,structure.cooldown-dt);
      const inRange=(target: EnemyTarget)=>target.alive && flatDist(structure.position,target.position)<=structure.range+target.radius && this.lineOfSight(structure.position,target.position);
      if(structure.target && (!inRange(structure.target) || structure.target instanceof Dummy && structure.target.team===structure.team)) structure.target=null;
      if(!structure.target) {
        let best=Infinity;
        for(const unit of this.units) {
          const d=flatDist(unit.position,structure.position);
          if(unit.team!==structure.team && d<best && inRange(unit)){structure.target=unit;best=d;}
        }
        if(!structure.target && structure.team==='red' && this.hero && inRange(this.hero)) structure.target=this.hero;
      }
      if(!structure.target || structure.cooldown>0) continue;
      const target=structure.target;
      structure.aimAt(target);
      const muzzles=structure.muzzles();
      const color=structure.team==='blue' ? COLORS.charged : COLORS.skill;
      for(const from of muzzles) {
        const dir=target.position.add(new Vector3(0,1.1,0)).subtract(from).normalize();
        const mesh=this.spawnBolt(from,dir,.7,color);
        this.hostileShots.push({mesh,dir,speed:28,damage:structure.damage/muzzles.length,remaining:35,life:target.life,team:structure.team,target,homing:true});
        this.muzzleFlash(from,color);
      }
      structure.cooldown=1.1;
      this.events.notifyObservers({kind:'minion-attack',at:muzzles[0],team:structure.team,attack:'bolt'});
    }
  }

  private structureDestroyed(structure: Structure): void {
    if(structure.site.kind==='gate')this.world.openGate(structure.site.id);
    const winner=structure.team==='blue'?'red':'blue';
    this.award(winner,structure.site.kind==='core'?0:150);
    this.ring(structure.position,structure.radius*2,COLORS.skill,.8);
    this.events.notifyObservers({kind:'explosion',at:structure.position.clone(),radius:structure.radius*2});
    if(structure.site.kind==='core' && !this.winner){this.winner=winner;this.beamStop();}
  }

  setHero(hero: EnemyTarget | null): void { this.hero = hero; }

  /** Build the models a kit's summons use. Call before the hero can cast (load and outfit swaps). */
  async prepareKit(kit: Kit, variant: string, aim: AimFacing, muzzle: MuzzleMode = 'weapon'): Promise<void> {
    await this.ready;
    for (const ability of [...Object.values(kit.abilities), ...kit.heroics]) {
      for (const effect of ability.effects) {
        if (effect.kind !== 'summon') continue;
        const model = effect.unit.model;
        const key = summonModelKey(effect.unit, variant);
        if (this.crowds.has(key) || typeof model === 'object' && 'rapture' in model) continue; // lane crowds already exist
        if (model === 'turret') {
          this.crowds.set(key, createTurretModel(this.scene, this.world.shadows));
          continue;
        }
        const [id, facing] = model === 'caster' ? [variant, aim] : [model.variant, model.aim] as const;
        const meta = this.index.variants[id];
        if (!meta) { console.warn(`summon ${effect.unit.name}: no model ${id} (npm run chibi -- ${id})`); continue; }
        const url = BASE + meta.file;
        await preloadModels(this.scene, [url]);
        if (this.crowds.has(key)) continue;
        const gunOffset = aimOffset(meta, facing);
        this.crowds.set(key, new CrowdModel(this.scene, url, this.world.shadows, {
          yaw: (clip) => staticClipYaw(meta, clip, gunOffset),
          // clones shoot like their caster; no muzzle falls back to in front of the chest
          muzzles: (clip) => { const ref = model === 'caster' && muzzle === 'body' ? null : clipMuzzle(meta, clip); return ref ? [ref] : []; },
          aliases: CLIP_FALLBACKS,
        }));
      }
    }
  }

  /** Spawn an allied unit (team blue) owned by `owner`. `variant` is the caster's model, for clones. */
  summon(spec: SummonSpec, at: Vector3, owner: { readonly position: Vector3 }, variant: string): void {
    const model = this.crowds.get(summonModelKey(spec, variant));
    if (!model) { console.warn(`summon ${spec.name}: model not prepared (Combat.prepareKit)`); return; }
    const turret = spec.model === 'turret';
    // called-in Raptures keep their lane body (size, lift, attack); Nikkes and turrets use chibi proportions
    const rapture = typeof spec.model === 'object' && 'rapture' in spec.model ? RAPTURE_TYPES[spec.model.rapture] : null;
    const type: MinionType = {
      id: summonModelKey(spec, variant), name: spec.name, team: 'blue',
      radius: rapture?.radius ?? (turret ? .55 : .65), modelLift: rapture?.modelLift ?? (turret ? 0 : .04),
      speed: spec.speed, range: spec.range, aggro: spec.behaviour === 'guard' ? spec.range : spec.range + 4,
      windup: .3, cooldown: spec.cooldown, damage: spec.damage, attack: rapture?.attack ?? 'bolt', hp: spec.hp,
      barHeight: turret ? 2.25 : rapture ? 2.7 : undefined,
    };
    const spot = this.world.navigationFor(type.team).project(at, type.radius);
    const unit = new Dummy(new Vector3(spot.x, 0, spot.z), type, this.world, model,
      { owner, endsAt: spec.lifetime, behaviour: spec.behaviour });
    unit.tint = spec.tint ?? null;
    this.units.push(unit);
    const live = (this.summons.get(spec) ?? []).filter((u) => u.alive);
    live.push(unit);
    while (spec.limit && live.length > spec.limit) live.shift()!.expire();
    this.summons.set(spec, live);
    this.ring(unit.position, 1.1, COLORS.charged, .35);
  }

  /** Charm up to `limit` enemy minions (nearest first) in the circle onto the caster's side. */
  convert(at: Vector3, radius: number, duration: number, hex: string, owner: { readonly position: Vector3 }, limit = Infinity): void {
    const c = tintColor(hex);
    const tint = [0.6 + c.r * 0.8, 0.6 + c.g * 0.8, 0.6 + c.b * 0.8] as const;
    const victims = this.around(at, radius, 'blue', 'enemies')
      .filter((u): u is Dummy => u instanceof Dummy)
      .sort((a, b) => flatDist(a.position, at) - flatDist(b.position, at))
      .slice(0, limit);
    for (const unit of victims) {
      unit.convert('blue', owner, duration, tint);
      this.ring(unit.position, unit.radius + 0.5, c, 0.4);
    }
    this.ring(at, radius, c, 0.45);
    this.sortTeams();
  }

  /** Persistent area; `team` is the caster's side. */
  addZone(at: Vector3, spec: ZoneSpec, team: Team = 'blue'): void {
    const color = tintColor(spec.tint);
    const disc = this.zonePool.acquire('zone');
    disc.material = this.zoneMat(spec.tint);
    disc.position.set(at.x, .07, at.z);
    disc.scaling.set(spec.radius, 1, spec.radius);
    const edge = this.ringPool.acquire('zone-edge');
    edge.material = this.glowMat(color);
    edge.position.set(at.x, .09, at.z);
    edge.scaling.set(spec.radius, 1, spec.radius);
    this.world.glow.addIncludedOnlyMesh(edge);
    this.zones.push({ spec, at: new Vector3(at.x, 0, at.z), left: spec.duration, tick: 0, disc, edge, team });
  }

  /** Instant circle: damage and status to enemies, healing and status to allies. */
  nova(at: Vector3, o: Omit<NovaEffect, 'kind' | 'at'>, team: Team = 'blue'): void {
    const color = tintColor(o.tint);
    this.ring(at, o.radius, color, .45);
    this.ring(at, o.radius * .55, color, .3);
    this.affectArea(at, o.radius, team, { damage: o.damage, status: o.status, heal: o.heal, allyStatus: o.allyStatus, knockback: o.knockback });
    if (o.damage) this.events.notifyObservers({ kind: 'explosion', at: at.clone(), radius: o.radius });
  }

  /** Instant hit on enemies in the sector from `origin` along `dir` (unit, ground plane). */
  cone(origin: Vector3, dir: Vector3, o: Omit<ConeEffect, 'kind'>, team: Team = 'blue'): void {
    const cosHalf = Math.cos(o.angle / 2);
    for (const target of this.around(origin, o.range, team, 'enemies')) {
      const dx = target.position.x - origin.x, dz = target.position.z - origin.z, d = Math.hypot(dx, dz);
      if (d > 1e-3 && (dx * dir.x + dz * dir.z) / d < cosHalf) continue;
      if (o.status) target.status.apply(o.status);
      if (o.damage) this.damageTarget(target, o.damage);
      if (o.knockback && target instanceof Dummy) target.displace(dx, dz, o.knockback);
    }
    let pool = this.sectorPools.get(o.angle);
    if (!pool) {
      const template = createSector(`cone-${o.angle.toFixed(2)}`, o.angle, this.scene);
      template.setEnabled(false);
      pool = new MeshPool(template, 8);
      this.sectorPools.set(o.angle, pool);
    }
    const mesh = pool.acquire('cone-hit');
    mesh.material = this.zoneMat(o.tint);
    mesh.position.set(origin.x, 0.08, origin.z);
    mesh.rotation.y = Math.atan2(dir.x, dir.z);
    mesh.scaling.set(o.range, 1, o.range);
    this.flashes.push({ mesh, pool, t: 0, dur: 0.35 });
  }

  heal(target: EnemyTarget, spec: HealSpec, scale = 1): void {
    const amount = ((spec.flat ?? 0) + (spec.percent ?? 0) * target.maxHp) * scale;
    if (amount > 0) target.heal(amount);
  }

  lineOfSight(from: Vector3, to: Vector3): boolean {
    const dx = to.x - from.x, dz = to.z - from.z, lengthSq = dx * dx + dz * dz;
    if (lengthSq < .000001) return true;
    for (const o of this.world.obstacles) {
      const t = Math.max(0, Math.min(1, ((o.x - from.x) * dx + (o.z - from.z) * dz) / lengthSq));
      const x = from.x + dx * t - o.x, z = from.z + dz * t - o.z;
      if (x * x + z * z <= (o.r + .1) ** 2) return false;
    }
    return true;
  }

  nearbyUnits(unit: Dummy): readonly Dummy[] {
    return this.spatialReady ? this.spatial.query(unit.position.x, unit.position.z, 5, this.neighbors) : this.units;
  }

  updatePresentation(viewProjection: Matrix): void {
    Frustum.GetPlanesToRef(viewProjection, this.frustum);
    for (const crowd of this.crowds.values()) crowd.begin();
    this.chargeRings.blue.count = this.chargeRings.red.count = 0;
    for (const unit of this.units) {
      const p = unit.position;
      let visible = true;
      // Conservative whole-character sphere includes weapons and edge shadows.
      for (const plane of this.frustum) {
        if (plane.normal.x * p.x + plane.normal.y * (p.y + 1.5) + plane.normal.z * p.z + plane.d < -4.5) { visible = false; break; }
      }
      unit.setRenderActive(visible);
      if (!visible) continue;
      unit.draw();
      const charge = unit.charge;
      if (charge > 0) {
        const batch = this.chargeRings[unit.team], i = batch.count++, m = batch.slot('matrix', i), o = i * 16;
        const size = (unit.radius * 2 + .6) * charge;
        m.fill(0, o, o + 16);
        m[o] = m[o + 10] = size; m[o + 5] = m[o + 15] = 1;
        m[o + 12] = p.x; m[o + 13] = .09; m[o + 14] = p.z;
      }
    }
    for (const crowd of this.crowds.values()) crowd.end();
    this.chargeRings.blue.commit();
    this.chargeRings.red.commit();
  }

  /** Ring the targeted and hovered enemies; each may be null. */
  highlight(target: AttackTarget | null, hovered: AttackTarget | null): void {
    for(const structure of this.structures) structure.showRange(structure===hovered || structure===target);
    for (const [ring, unit] of [[this.targetRing, target], [this.hoverRing, hovered === target ? null : hovered]] as const) {
      const shown = !!unit?.alive && unit.renderActive;
      ring.setEnabled(shown);
      if (!shown) continue;
      const size = unit.radius * 2 + .3;
      ring.scaling.set(size, 1, size);
      ring.position.set(unit.position.x, .06, unit.position.z);
    }
  }

  /** Nearest living, visible enemy whose body (an upright cylinder) the ray passes through. */
  enemyOnRay(ray: Ray): AttackTarget | null {
    const o = ray.origin, d = ray.direction;
    const a = d.x * d.x + d.z * d.z;
    if (a < 1e-9 || Math.abs(d.y) < 1e-9) return null;
    let best: AttackTarget | null = null;
    let bestT = Infinity;
    for (const unit of this.dummies) {
      if (!unit.alive || !unit.renderActive) continue;
      const ox = o.x - unit.position.x, oz = o.z - unit.position.z, r = unit.radius * .9;
      const b = ox * d.x + oz * d.z, c = ox * ox + oz * oz - r * r, disc = b * b - a * c;
      if (disc < 0) continue;
      const root = Math.sqrt(disc);
      const t0 = (-b - root) / a, t1 = (-b + root) / a;
      const ya = (unit.position.y - o.y) / d.y, yb = (unit.position.y + unit.barHeight - .3 - o.y) / d.y;
      const enter = Math.max(t0, Math.min(ya, yb)), exit = Math.min(t1, Math.max(ya, yb));
      if (enter <= exit && exit > 0 && enter < bestT) { best = unit; bestT = enter; }
    }
    return best;
  }

  resolveEnemyPosition(enemy: Dummy): void {
    // Separate bodies without affecting the ground height or visual lift.
    for (const other of this.nearbyUnits(enemy)) {
      if (other === enemy || !other.alive) continue;
      const dx = enemy.position.x - other.position.x, dz = enemy.position.z - other.position.z;
      const distance = Math.hypot(dx, dz), radius = (enemy.radius + other.radius) * .8;
      if (distance < radius) {
        const sign = enemy.id < other.id ? -1 : 1;
        const next = { x: enemy.position.x + (distance > .001 ? dx / distance : sign) * (radius - distance) * .5,
          z: enemy.position.z + (distance > .001 ? dz / distance : 0) * (radius - distance) * .5 };
        if (this.world.navigationFor(enemy.team).clear(enemy.position, next, enemy.radius)) {
          enemy.position.x = next.x; enemy.position.z = next.z;
        }
      }
    }
    // Separation must never leave a body inside cover or outside the arena.
    if (!this.world.navigationFor(enemy.team).clear(enemy.position, enemy.position, enemy.radius)) {
      const safe = this.world.navigationFor(enemy.team).project(enemy.position, enemy.radius);
      enemy.position.x = safe.x; enemy.position.z = safe.z;
    }
  }

  enemyAttack(enemy: Dummy, from: Vector3, aim: Vector3, target: EnemyTarget): void {
    const color = enemy.team === 'red' ? new Color3(1, .27, .13) : new Color3(.4, .8, 1);
    const damage = enemy.type.damage * enemy.status.damageDealt;
    if (enemy.type.attack === 'mortar') {
      const mesh = this.grenadePool.acquire('enemy-mortar');
      mesh.material = this.glowMat(color); mesh.setEnabled(true);
      const warning = this.ringPool.acquire('enemy-blast-warning');
      warning.scaling.setAll(2);
      warning.position.set(aim.x, .08, aim.z);
      warning.material = this.glowMat(color); warning.isPickable = false;
      this.world.glow.addIncludedOnlyMesh(warning);
      this.world.glow.addIncludedOnlyMesh(mesh);
      this.hostileBlasts.push({ mesh, warning, from, to: aim.clone(), elapsed: 0, flight: .95, radius: 2, damage, life: target.life, team: enemy.team, target });
    } else {
      const direction = aim.add(new Vector3(0, 1.1, 0)).subtract(from).normalize();
      for (const angle of enemy.type.attack === 'fan' ? [-.16, 0, .16] : [0]) {
        const dir = new Vector3(direction.x * Math.cos(angle) + direction.z * Math.sin(angle), direction.y,
          direction.z * Math.cos(angle) - direction.x * Math.sin(angle)).normalize();
        const mesh = this.spawnBolt(from, dir, .7, color);
        mesh.name = 'enemy-bolt';
        this.hostileShots.push({ mesh, dir, speed: 18, damage, remaining: 20, life: target.life, team: enemy.team, target });
      }
    }
    this.muzzleFlash(from, color);
    this.events.notifyObservers({ kind: 'minion-attack', at: from, team: enemy.team, attack: enemy.type.attack });
  }

  /** Living dummy under a ground point (with some slack for clicking), nearest first. */
  enemyAt(p: Vector3, slack = 0.6): AttackTarget | null {
    let best: AttackTarget | null = null;
    let bestD = Infinity;
    for (const d of this.dummies) {
      const dist = flatDist(p, d.position);
      if (d.alive && dist <= d.radius + slack && dist < bestD) {
        best = d;
        bestD = dist;
      }
    }
    return best;
  }

  /** Nearest living dummy whose edge is within `range` of p. */
  nearestEnemy(p: Vector3, range: number): AttackTarget | null {
    let best: AttackTarget | null = null;
    let bestD = Infinity;
    for (const d of this.dummies) {
      const dist = flatDist(p, d.position) - d.radius;
      if (d.alive && !(d instanceof Structure && d.shielded) && dist <= range && dist < bestD) {
        best = d;
        bestD = dist;
      }
    }
    return best;
  }

  moveMarker(at: Vector3, color = COLORS.move): void {
    this.marker.material = this.glowMat(color);
    this.marker.position.set(at.x, 0.08, at.z);
    this.marker.setEnabled(true);
    this.markerTime = MARKER_TIME;
  }

  /** Straight bolt; `from` is the gun tip and the bolt starts with its tail there. */
  fireBolt(from: Vector3, dir: Vector3, o: BoltOptions): void {
    const size = o.size ?? 1;
    const color = o.color ?? COLORS.basic;
    const { mesh, pool } = o.visual ? this.weaponFx.projectile(o.visual, from, dir, color, size)
      : { mesh: this.spawnBolt(from, dir, size, color), pool: this.boltPool };
    this.shots.push({
      mesh, pool, dir: dir.clone(), speed: o.speed ?? BOLT_SPEED, damage: o.damage, range: o.range,
      travelled: 0, pierce: !!o.pierce, hit: new Set(), homing: null, size, color: o.color ?? COLORS.basic, status: o.status,
      knockback: o.knockback, visual: o.visual, splash: o.splash, explodeAtEnd: o.explodeAtEnd, trailIn: 0,
    });
    if (o.visual) this.weaponFx.muzzle(from, dir, color, o.visual === 'rocket' || o.visual === 'sniper');
    else this.muzzleFlash(from, o.color);
  }

  /** Basic attack: follows its target until it connects. */
  fireHoming(from: Vector3, target: AttackTarget, o: HomingOptions): void {
    const size = o.size ?? 0.8;
    const dir = target.position.add(new Vector3(0, HIT_HEIGHT, 0)).subtract(from).normalize();
    const mesh = this.spawnBolt(from, dir, size, o.color ?? COLORS.basic);
    this.shots.push({
      mesh, pool: this.boltPool, trailIn: 0, dir, speed: HOMING_SPEED, damage: o.damage, range: HOMING_RANGE,
      travelled: 0, pierce: false, hit: new Set(), homing: target, size, color: o.color ?? COLORS.basic,
      status: o.status, splash: o.splash,
    });
    this.muzzleFlash(from, o.color);
  }

  throwGrenade(from: Vector3, to: Vector3, o: GrenadeOptions): void {
    const color = o.color ?? COLORS.skill;
    const mesh = this.grenadePool.acquire('grenade');
    mesh.setEnabled(true);
    mesh.material = this.glowMat(color);
    mesh.position.copyFrom(from);
    this.world.glow.addIncludedOnlyMesh(mesh);
    this.grenades.push({
      mesh, from: from.clone(), to: new Vector3(to.x, 0.2, to.z), t: 0,
      flight: o.flight ?? 0.45, damage: o.damage, radius: o.radius, color, status: o.status, zone: o.zone,
      knockback: o.knockback,
    });
    this.muzzleFlash(from, color);
  }

  /** Expanding ring on the ground, e.g. an explosion or a dash. */
  ring(at: Vector3, radius: number, color: Color3, dur = 0.3): void {
    const mesh = this.ringPool.acquire('ring');
    mesh.setEnabled(true);
    mesh.material = this.glowMat(color);
    mesh.position.set(at.x, 0.1, at.z);
    this.world.glow.addIncludedOnlyMesh(mesh);
    this.rings.push({ mesh, t: 0, dur, scale: radius });
  }

  muzzleFlash(at: Vector3, color = COLORS.basic): void {
    this.flash.material = this.glowMat(color);
    this.flash.position.copyFrom(at);
    this.flash.setEnabled(true);
    this.flashTime = FLASH_TIME;
  }

  beamStart(from: Vector3, dir: Vector3, o: BeamOptions): void {
    this.beamFrom.copyFrom(from);
    this.beamDir.copyFrom(dir);
    this.beamTime = 0;
    this.beamDps = o.dps;
    this.beamWidth = o.width;
    this.beamReach = o.length;
    this.beamLength = this.clearShotDistance(from, dir, o.length);
    this.beamStatus = undefined;
    this.beamMat.emissiveColor.copyFrom(o.color ?? COLORS.beam);
    this.beam.setEnabled(true);
    this.beamCore.setEnabled(true);
    this.placeBeam(0);
  }

  beamMove(from: Vector3): void {
    this.beamFrom.copyFrom(from);
  }

  beamStop(): void {
    this.beam.setEnabled(false);
    this.beamCore.setEnabled(false);
    if (this.weaponBeamActive) this.events.notifyObservers({ kind: 'weapon-beam', active: false });
    this.weaponBeamActive = false;
  }

  /** The primary beam tracks aim continuously; ability channels retain their own direction. */
  weaponBeam(from: Vector3, dir: Vector3, o: BeamOptions, status?: StatusSpec): void {
    if (!this.weaponBeamActive) {
      this.beamStart(from, dir, o);
      this.weaponBeamActive = true;
      this.events.notifyObservers({ kind: 'weapon-beam', active: true });
    }
    this.beamFrom.copyFrom(from); this.beamDir.copyFrom(dir);
    this.beamDps = o.dps; this.beamStatus = status;
  }

  /** One-time trait payload on a beam's next ammo tick, separate from its continuous DPS. */
  beamPulse(from: Vector3, dir: Vector3, reach: number, width: number, damage: number): void {
    if (damage <= 0) return;
    const length = this.clearShotDistance(from, dir, reach);
    for (const target of this.dummies) {
      const along = (target.position.x - from.x) * dir.x + (target.position.z - from.z) * dir.z;
      if (target.alive && along >= 0 && this.lineOfSight(from, target.position)
        && segmentDist(target.position, from, dir, length) <= target.radius + width / 2) this.damage(target, damage);
    }
  }

  /** A physical sword sweep: all enemies in front, once each, and no projectile. */
  melee(origin: Vector3, dir: Vector3, range: number, angle: number, damage: number, color: Color3,
    status?: StatusSpec, reverse = false): void {
    for (const target of this.dummies) {
      if (!target.alive || !this.lineOfSight(origin, target.position)) continue;
      const dx = target.position.x - origin.x, dz = target.position.z - origin.z, distance = Math.hypot(dx, dz);
      if (distance > range + target.radius || distance > .001 && (dx * dir.x + dz * dir.z) / distance < Math.cos(angle / 2)) continue;
      if (status) target.status.apply(status);
      this.damage(target, damage);
      this.weaponFx.impact(target.position.add(new Vector3(0, HIT_HEIGHT, 0)), color);
    }
    this.weaponFx.slash(origin, dir, range, color, reverse);
  }

  /** First cover intersection along a horizontal ray, shared by fast rounds and beams. */
  clearShotDistance(from: Vector3, dir: Vector3, range: number): number {
    let nearest = range;
    for (const obstacle of this.world.obstacles) {
      const dx = from.x - obstacle.x, dz = from.z - obstacle.z, radius = obstacle.r + .1;
      const along = dx * dir.x + dz * dir.z;
      const outside = dx * dx + dz * dz - radius * radius;
      if (outside <= 0) return 0;
      const disc = along * along - outside;
      if (disc < 0) continue;
      const entry = -along - Math.sqrt(disc);
      if (entry >= 0) nearest = Math.min(nearest, entry);
    }
    return Math.max(0, nearest);
  }

  update(dt: number): void {
    this.weaponFx.update(dt);
    if(this.winner){for(const structure of this.structures) structure.updateVisual(dt);return;}
    for(const team of ['blue','red'] as const)this.world.navigationFor(team).beginFrame();
    this.elapsed += dt;
    this.nextWaveIn -= dt;
    while (this.nextWaveIn <= 0) { this.spawnWave(); this.nextWaveIn += WAVE_INTERVAL; }
    this.spatial.rebuild(this.units); this.spatialReady = true;
    this.updateStatuses(dt);
    this.updateShots(dt);
    this.updateGrenades(dt);
    this.updateZones(dt);
    this.updateHostileAttacks(dt);
    this.updateStructures(dt);
    for (const f of this.flashes) {
      f.t += dt;
      f.mesh.visibility = 1 - Math.min(1, f.t / f.dur);
      if (f.t >= f.dur) f.pool.release(f.mesh);
    }
    this.flashes = this.flashes.filter((f) => f.t < f.dur);

    for (const r of this.rings) {
      r.t += dt;
      const k = Math.min(1, r.t / r.dur);
      r.mesh.scaling.set(r.scale * (0.3 + 0.7 * k), 1, r.scale * (0.3 + 0.7 * k));
      r.mesh.visibility = 1 - k;
      if (k >= 1) this.ringPool.release(r.mesh);
    }
    this.rings = this.rings.filter((r) => r.mesh.isEnabled());

    if (this.beam.isEnabled()) {
      this.beamTime += dt;
      this.beamLength = this.clearShotDistance(this.beamFrom, this.beamDir, this.beamReach);
      this.placeBeam(this.beamTime);
      for (const d of this.dummies) {
        const along = (d.position.x - this.beamFrom.x) * this.beamDir.x + (d.position.z - this.beamFrom.z) * this.beamDir.z;
        if (dt > 0 && d.alive && along >= 0 && this.lineOfSight(this.beamFrom, d.position)
          && segmentDist(d.position, this.beamFrom, this.beamDir, this.beamLength) < d.radius + this.beamWidth / 2) {
          if (this.beamStatus) d.status.apply(this.beamStatus);
          this.damage(d, this.beamDps * dt);
        }
      }
    }

    if (this.flashTime > 0) {
      this.flashTime -= dt;
      this.flash.scaling.setAll(0.6 + (1 - this.flashTime / FLASH_TIME) * 0.8);
      if (this.flashTime <= 0) this.flash.setEnabled(false);
    }

    if (this.markerTime > 0) {
      this.markerTime -= dt;
      const t = Math.max(0, this.markerTime / MARKER_TIME);
      this.marker.scaling.setAll(0.4 + t * 0.8);
      this.marker.visibility = t;
      if (this.markerTime <= 0) this.marker.setEnabled(false);
    }

    for (const unit of this.units) unit.update(dt, this);
    for (let i = this.units.length - 1; i >= 0; i--) {
      if (this.units[i].removable) this.units.splice(i, 1);
    }
    this.sortTeams();
  }

  private updateShots(dt: number): void {
    if (dt <= 0) return;
    for (const shot of this.shots) {
      const from = shot.mesh.position.clone();
      if (shot.homing?.alive) {
        shot.dir.set(shot.homing.position.x - from.x, 0, shot.homing.position.z - from.z).normalize();
      }
      const wanted = Math.min(shot.speed * dt, Math.max(0, shot.range - shot.travelled));
      const step = this.clearShotDistance(from, shot.dir, wanted);
      const blocked = step < wanted;
      // Swept circles, ordered by entry distance: fast sniper rounds cannot tunnel through a unit,
      // and the nearest body catches pellets even when both bodies are crossed in one frame.
      const hits: { target: AttackTarget; at: number }[] = [];
      for (const target of shot.homing ? [shot.homing] : this.dummies) {
        if (!target.alive || shot.hit.has(target)) continue;
        const dx = from.x - target.position.x, dz = from.z - target.position.z;
        const radius = target.radius + (shot.visual === 'rocket' ? .16 : .09) * shot.size;
        const along = dx * shot.dir.x + dz * shot.dir.z;
        const outside = dx * dx + dz * dz - radius * radius;
        const disc = along * along - outside;
        if (disc < 0 || -along + Math.sqrt(disc) < 0) continue;
        const entry = Math.max(0, -along - Math.sqrt(disc));
        if (entry <= step && (!blocked || entry < step)) hits.push({ target, at: entry });
      }
      hits.sort((a, b) => a.at - b.at);
      let ended = false;
      for (const hit of hits) {
        shot.mesh.position.copyFrom(from).addInPlace(shot.dir.scale(hit.at));
        if (shot.status) hit.target.status.apply(shot.status);
        this.damage(hit.target, shot.damage);
        if (shot.knockback && hit.target instanceof Dummy) hit.target.displace(shot.dir.x, shot.dir.z, shot.knockback);
        shot.hit.add(hit.target);
        if (shot.visual) this.weaponFx.impact(shot.mesh.position, shot.color, shot.visual === 'sniper');
        if (shot.splash) this.explodeShot(shot, hit.target);
        if (!shot.pierce) { ended = true; break; }
      }
      if (!ended) {
        shot.mesh.position.copyFrom(from).addInPlace(shot.dir.scale(Math.max(0, step - (blocked ? .02 : 0))));
        shot.travelled += step;
        ended = blocked || shot.travelled >= shot.range - 1e-6;
        if (ended && shot.explodeAtEnd) this.explodeShot(shot);
        else if (blocked && shot.visual) this.weaponFx.impact(shot.mesh.position, shot.color);
      }
      shot.mesh.lookAt(shot.mesh.position.add(shot.dir));
      shot.trailIn -= dt;
      if (!ended && shot.trailIn <= 0 && (shot.visual === 'rocket' || shot.visual === 'sniper')) {
        this.weaponFx.trail(shot.mesh.position, shot.dir, shot.color, shot.visual === 'rocket');
        shot.trailIn += .04;
      }
      if (ended) shot.pool.release(shot.mesh);
    }
    this.shots = this.shots.filter(shot => shot.mesh.isEnabled());
  }

  private explodeShot(shot: Shot, primary?: AttackTarget): void {
    const splash = shot.splash;
    if (!splash) return;
    // Centre direct-hit splash on the body rather than its near collision edge.
    const at = primary ? primary.position.add(new Vector3(0, HIT_HEIGHT, 0)) : shot.mesh.position.clone();
    for (const target of this.dummies) {
      if (target === primary || !target.alive || flatDist(at, target.position) > splash.radius + target.radius * .5
        || !this.lineOfSight(at, target.position)) continue;
      if (shot.status) target.status.apply(shot.status);
      this.damage(target, shot.damage * (primary ? splash.fraction : 1));
    }
    this.ring(at, splash.radius, shot.color, .3);
    this.weaponFx.impact(at, shot.color, true);
    this.events.notifyObservers({ kind: 'explosion', at, radius: splash.radius });
  }

  private updateGrenades(dt: number): void {
    for (const g of this.grenades) {
      g.t += dt / g.flight;
      const t = Math.min(1, g.t);
      Vector3.LerpToRef(g.from, g.to, t, g.mesh.position);
      g.mesh.position.y += 4 * 2.2 * t * (1 - t); // arc
      if (t < 1) continue;
      for (const d of this.dummies) {
        if (!d.alive || flatDist(g.to, d.position) > g.radius + d.radius * 0.5) continue;
        if (g.status) d.status.apply(g.status);
        this.damage(d, g.damage);
        if (g.knockback && d instanceof Dummy) d.displace(d.position.x - g.to.x, d.position.z - g.to.z, g.knockback);
      }
      if (g.zone) this.addZone(g.to, g.zone);
      this.ring(g.to, g.radius, g.color, 0.35);
      this.muzzleFlash(g.to.add(new Vector3(0, 0.4, 0)), g.color);
      this.events.notifyObservers({ kind: 'explosion', at: g.to, radius: g.radius });
      this.grenadePool.release(g.mesh);
    }
    this.grenades = this.grenades.filter((g) => g.mesh.isEnabled());
  }

  /** Burn damage: statuses tick for every living unit and the hero. */
  private updateStatuses(dt: number): void {
    for (const unit of this.units) {
      if (!unit.alive) continue;
      const burn = unit.status.update(dt);
      if (burn > 0) this.damage(unit, burn);
    }
    if (this.hero) {
      const burn = this.hero.status.update(dt);
      if (burn > 0) this.damageHero(burn);
    }
  }

  private updateZones(dt: number): void {
    for (const z of this.zones) {
      z.left -= dt;
      z.tick -= dt;
      const fade = Math.max(0, Math.min(1, z.left / 0.4, (z.spec.duration - z.left) / 0.15));
      z.disc.visibility = fade;
      z.edge.visibility = fade;
      const r = z.spec.radius * (1 + 0.025 * Math.sin(this.elapsed * 6));
      z.edge.scaling.set(r, 1, r);
      if (z.tick <= 0 && z.left > 0) {
        z.tick += ZONE_TICK;
        this.affectArea(z.at, z.spec.radius, z.team, {
          damage: (z.spec.damage ?? 0) * ZONE_TICK, status: z.spec.status,
          heal: z.spec.heal, healScale: ZONE_TICK, allyStatus: z.spec.allyStatus,
        });
      }
      if (z.left <= 0) {
        this.zonePool.release(z.disc);
        this.ringPool.release(z.edge);
      }
    }
    this.zones = this.zones.filter((z) => z.left > 0);
  }

  private affectArea(at: Vector3, radius: number, team: Team, hit: AreaHit): void {
    if (hit.damage || hit.status || hit.knockback) {
      for (const target of this.around(at, radius, team, 'enemies')) {
        if (hit.status) target.status.apply(hit.status);
        if (hit.damage) this.damageTarget(target, hit.damage);
        if (hit.knockback && target instanceof Dummy) target.displace(target.position.x - at.x, target.position.z - at.z, hit.knockback);
      }
    }
    if (hit.heal || hit.allyStatus) {
      for (const target of this.around(at, radius, team, 'allies')) {
        if (hit.allyStatus) target.status.apply(hit.allyStatus);
        if (hit.heal) this.heal(target, hit.heal, hit.healScale);
      }
    }
  }

  /** Living units on `side` of `team` whose bodies overlap the circle. The hero is blue. */
  private around(at: Vector3, radius: number, team: Team, side: 'enemies' | 'allies'): EnemyTarget[] {
    const out = this.areaTargets;
    out.length = 0;
    const blue = (team === 'blue') === (side === 'allies');
    const candidates = this.spatialReady ? this.spatial.query(at.x, at.z, radius + 1.5, this.areaUnits) : this.units;
    for (const unit of candidates) {
      if (unit.alive && (unit.team === 'blue') === blue && flatDist(unit.position, at) <= radius + unit.radius * 0.5) out.push(unit);
    }
    if(side==='enemies') for(const structure of this.structures) {
      if(structure.alive && (structure.team==='blue')===blue && flatDist(structure.position,at)<=radius+structure.radius*.5) out.push(structure);
    }
    const hero = this.hero;
    if (blue && hero?.alive && flatDist(hero.position, at) <= radius + hero.radius * 0.5) out.push(hero);
    return out;
  }

  private zoneMat(hex: string): StandardMaterial {
    let m = this.zoneMats.get(hex);
    if (!m) {
      m = new StandardMaterial(`zone-${hex}`, this.scene);
      m.emissiveColor = tintColor(hex);
      m.disableLighting = true;
      m.alpha = 0.2;
      m.backFaceCulling = false;
      this.zoneMats.set(hex, m);
    }
    return m;
  }

  private spawnBolt(from: Vector3, dir: Vector3, size: number, color: Color3): Mesh {
    const mesh = this.boltPool.acquire('bolt');
    mesh.setEnabled(true);
    mesh.material = this.glowMat(color);
    mesh.scaling.setAll(size);
    mesh.position.copyFrom(from).addInPlace(dir.scale((BOLT_LENGTH * size) / 2));
    mesh.lookAt(mesh.position.add(dir));
    this.world.glow.addIncludedOnlyMesh(mesh);
    return mesh;
  }

  private damage(d: AttackTarget, amount: number): void {
    if(this.winner) return;
    if(d instanceof Structure){d.takeDamage(amount);return;}
    if (d.hit(amount)) {
      const winner = d.team === 'red' ? 'blue' : 'red';
      this.minionKills[winner]++;
      this.award(winner, 35);
      this.events.notifyObservers({ kind: 'death', at: d.position, team: d.team });
    }
  }

  private damageHero(amount: number): void {
    if (this.hero?.takeDamage(amount)) { this.deaths++; this.award('red', 200); }
  }

  private award(team: Team, xp: number): void {
    const before = this[team].level;
    this[team].gain(xp);
    if (this[team].level > before) this.events.notifyObservers({ kind: 'level-up', team, level: this[team].level });
  }

  private damageTarget(target: EnemyTarget, amount: number): void {
    if(this.winner) return;
    if (target instanceof Dummy || target instanceof Structure) this.damage(target, amount);
    else if (target === this.hero) this.damageHero(amount);
  }

  private updateHostileAttacks(dt: number): void {
    for (const s of this.hostileShots) {
      if (!s.target.alive || s.target.life !== s.life) { this.boltPool.release(s.mesh); continue; }
      if(s.homing) {
        s.target.position.add(new Vector3(0,1.1,0)).subtractToRef(s.mesh.position,s.dir).normalize();
        s.mesh.lookAt(s.mesh.position.add(s.dir));
      }
      const from = s.mesh.position.clone(), step = s.speed * dt;
      s.mesh.position.addInPlaceFromFloats(s.dir.x * step, s.dir.y * step, s.dir.z * step); s.remaining -= step;
      if (!this.lineOfSight(from, s.mesh.position)) s.remaining = 0;
      else {
        let hit: EnemyTarget | null = null, first = Infinity;
        for (const target of this.opponents(s.team, from.x + s.dir.x * step * .5, from.z + s.dir.z * step * .5, 1.6 + step * .5)) {
          const dx = target.position.x - from.x, dy = target.position.y + 1.1 - from.y, dz = target.position.z - from.z;
          const along = Math.max(0, Math.min(step, dx * s.dir.x + dy * s.dir.y + dz * s.dir.z));
          const ox = dx - s.dir.x * along, oy = dy - s.dir.y * along, oz = dz - s.dir.z * along;
          if (along < first && ox * ox + oy * oy + oz * oz <= (target.radius + .18) ** 2) {
            hit = target; first = along;
          }
        }
        if (hit) { this.damageTarget(hit, s.damage); s.remaining = 0; }
      }
      if (s.remaining <= 0) this.boltPool.release(s.mesh);
    }
    this.hostileShots = this.hostileShots.filter(s => s.mesh.isEnabled());
    for (const g of this.hostileBlasts) {
      if (!g.target.alive || g.target.life !== g.life) { this.grenadePool.release(g.mesh); this.ringPool.release(g.warning); continue; }
      g.elapsed += dt;
      const t = Math.min(1, g.elapsed / g.flight);
      Vector3.LerpToRef(g.from, g.to, t, g.mesh.position);
      g.mesh.position.y += Math.sin(t * Math.PI) * 3;
      g.warning.scaling.setAll(2 * (.92 + .08 * Math.sin(t * Math.PI * 10)));
      if (t < 1) continue;
      for (const target of this.opponents(g.team, g.to.x, g.to.z, g.radius + 1.2)) {
        if (flatDist(target.position, g.to) <= g.radius + target.radius * .5) this.damageTarget(target, g.damage);
      }
      this.ring(g.to, g.radius, new Color3(1, .3, .12), .4);
      this.events.notifyObservers({ kind: 'explosion', at: g.to, radius: g.radius });
      this.grenadePool.release(g.mesh); this.ringPool.release(g.warning);
    }
    this.hostileBlasts = this.hostileBlasts.filter(g => g.mesh.isEnabled());
  }

  private glowMat(color: Color3): StandardMaterial {
    const key = color.toHexString();
    let m = this.mats.get(key);
    if (!m) {
      m = new StandardMaterial(`glow-${key}`, this.scene);
      m.emissiveColor = color;
      m.disableLighting = true;
      this.mats.set(key, m);
    }
    return m;
  }

  private placeBeam(t: number): void {
    const pulse = 1 + Math.sin(t * 40) * 0.08;
    const grow = Math.min(1, t * 6);
    for (const [mesh, width] of [[this.beam, this.beamWidth], [this.beamCore, this.beamWidth * 0.35]] as const) {
      mesh.position.copyFrom(this.beamFrom);
      mesh.lookAt(this.beamFrom.add(this.beamDir));
      mesh.scaling.set(width * pulse, width * pulse, this.beamLength * grow);
    }
  }
}

/** Summons of one model share a crowd: clones their caster's, called-in Nikkes theirs, turrets one prop. */
function summonModelKey(spec: SummonSpec, variant: string): string {
  const model = spec.model;
  if (model === 'turret') return 'summon:turret';
  if (model === 'caster') return `summon:${variant}`;
  return 'rapture' in model ? RAPTURE_TYPES[model.rapture].id : `summon:${model.variant}`;
}

export function flatDist(a: Vector3, b: Vector3): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/** distance on the ground plane from p to the segment origin + dir * [0, len] */
function segmentDist(p: Vector3, origin: Vector3, dir: Vector3, len: number): number {
  const px = p.x - origin.x;
  const pz = p.z - origin.z;
  const t = Math.max(0, Math.min(len, px * dir.x + pz * dir.z));
  return Math.hypot(px - dir.x * t, pz - dir.z * t);
}
