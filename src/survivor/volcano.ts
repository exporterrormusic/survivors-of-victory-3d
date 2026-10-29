// Ashen Caldera: a volcano east of the basin lobs molten rocks into the fight.
//
// Each rock arcs from the summit; its shadow on the ground grows and darkens as it falls, which is
// the only warning. It flattens whatever it lands on and leaves a crater that burns (hurting and
// slowing anyone in it, Raptures included) before cooling to embers, then to a harmless scorch.
// Volleys come faster and heavier as the round goes on: the threat comes from time, not from what
// the player does. Rocks mostly land around the horde, so a barrage is also something to use.

import { Color3, Constants, DynamicTexture, Effect, Mesh, MeshBuilder, ParticleSystem, Color4, PointLight, ShaderMaterial, StandardMaterial, TransformNode, Vector2, Vector3, type Scene, type ShadowGenerator } from '@babylonjs/core';
import { CalderaArt, createCalderaCraterFloor, createCalderaImpactRim, crumbleCalderaRim } from './caldera-art';
import { calderaTexture } from './caldera-materials';
import { calderaEffectVertex, calderaFissureFragment, calderaCraterFragment, calderaTrailFragment } from './caldera-effects';
import { audioEngine } from '../audio/audio-engine';
import { SFX } from '../audio/sound-bank';
import type { Player } from './player';
import type { Run } from './run';
import type { TargetField } from './targets';
import type { Vfx } from './vfx';

/** The cone stands beyond the east edge; its summit is where every rock starts. */
import { CALDERA_ADVANCE_TIME, CALDERA_MAX_ADVANCE, CALDERA_SHORE, VOLCANO, calderaShoreDepth, inCalderaLava } from './caldera-layout';
import { CalderaHeatHaze } from './caldera-heat-haze';
import { CalderaBorderEmbers } from './caldera-border-embers';
import { onElevatorFootprint } from './elevator-footprint';
import { NihilisterSchedule } from './nihilister-schedule';
export { VOLCANO } from './caldera-layout';
const SUMMIT = new Vector3(VOLCANO.x, VOLCANO.height, VOLCANO.z);
const FALL_TIME = 2.4;
const IMPACT_RADIUS = 2.6;
const IMPACT_DAMAGE = 18;
const BURN_TIME = 9, COOL_TIME = 4, SCORCH_TIME = 18;
const CRATER_RADIUS = 2.4;
const CRATER_DPS = 5;
const TREE_SINK_TIME = 14;
const RAPTURE_CRATER_DPS = 40;
/** Giant meteor (nihilister-egg.ts): rock size and crater size against a normal one. */
export const GIANT_SCALE = 5, GIANT_CRATER_SCALE = 3.75;
/** Giant rock diameter (m): the width of the fire trail she leaves. */
export const GIANT_TRAIL_WIDTH = 9;
/** A giant's pool stays molten through her appearance (~6 s) so the strip she adds burns as long as a crater. */
const POOL_EXTRA_BURN = 6;

// Shared flow textures, cooling crust, and scene fog for all molten surfaces.
Effect.ShadersStore.volcanoFissureVertexShader=calderaEffectVertex;
Effect.ShadersStore.volcanoFissureFragmentShader=calderaFissureFragment;
Effect.ShadersStore.volcanoCraterVertexShader=calderaEffectVertex;
Effect.ShadersStore.volcanoCraterFragmentShader=calderaCraterFragment;
Effect.ShadersStore.volcanoTrailVertexShader=calderaEffectVertex;
Effect.ShadersStore.volcanoTrailFragmentShader=calderaTrailFragment;

interface Rock { mesh: Mesh; shadow: Mesh; from: Vector3; to: Vector3; age: number; scale: number }
interface Crater { rim: Mesh; disc: Mesh; material: ShaderMaterial; fire: ParticleSystem; at: Vector3; age: number; r: number }
/** A strip of fresh lava from `from` to `to` (grown by setLavaTrailEnd), with an optional round pool at
 * `from` (a giant meteor's crater) melting into it; one surface, so it all burns, cools and fades together. */
interface Trail { mesh: Mesh; material: ShaderMaterial; from: Vector3; to: Vector3; halfWidth: number; pool: number; age: number; burn: number }
export type LavaTrail = { readonly id: number };

export class Volcano {
  private readonly root: TransformNode;
  private readonly art:CalderaArt;
  private readonly fissures: Mesh;
  private readonly fissureMaterial: ShaderMaterial;
  private readonly rockMaterial: StandardMaterial;
  private readonly shadowMaterial: StandardMaterial;
  private readonly shadowTexture: DynamicTexture;
  private readonly flameTexture: DynamicTexture;
  private readonly summitLight: PointLight;
  private readonly smoke: ParticleSystem;
  private readonly haze: CalderaHeatHaze | null;
  private readonly borderEmbers: CalderaBorderEmbers;
  private readonly rocks: Rock[] = [];
  private readonly craters: Crater[] = [];
  private readonly trails = new Map<LavaTrail, Trail>();
  private trailIds = 0;
  private enabled = false;
  /** A giant meteor landed (nihilister-egg.ts takes it from here). */
  onGiantImpact: ((at: Vector3, pool: LavaTrail) => void) | null = null;
  /** Whether a giant may fall now (one at a time: not while the last one's event is running). */
  giantAllowed: () => boolean = () => false;
  private time = 0;
  private readonly reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
  /** seconds since the eruptions began (drives the ramp) */
  private elapsed = 0;
  private nextVolley = 6;
  private launchFlash = 0;
  /** eruptions on schedule; the Test Lab can pause them */
  erupting = true;
  private readonly nihilisterSchedule = new NihilisterSchedule();
  /** dry lightning in the ash cloud: main.ts routes it through the atmosphere's strike */
  onThunder: ((x: number, z: number) => void) | null = null;
  private nextThunder = 14;
  private readonly burning=new Map<TransformNode,{fire:ParticleSystem;age:number;scale:number;gone:boolean}>();
  private treeScan=0;
  private dangerList:{x:number;z:number;r:number}[]|null=null;
  /** heat-vignette level: .85 baseline on this map, ~1.55 at the lava edge, 2 in lava or a burning crater */
  playerHeat = 0;

  constructor(private readonly scene: Scene, private readonly shadows: ShadowGenerator, private readonly vfx: Vfx, edge: number) {
    this.root = new TransformNode('volcano', scene);

    this.art=new CalderaArt(scene,this.root,shadows,edge);
    this.borderEmbers=new CalderaBorderEmbers(scene);
    this.summitLight = new PointLight('volcano-summit', SUMMIT.add(new Vector3(0, 3, 0)), scene);
    this.summitLight.diffuse = new Color3(1, .45, .15); this.summitLight.range = 70; this.summitLight.intensity = 1.2;

    // Lava fissures over the whole floor.
    const fissures = this.fissures = MeshBuilder.CreateGround('volcano-fissures', { width: edge * 2, height: edge * 2, subdivisions: 1 }, scene);
    fissures.position.y = .03; fissures.parent = this.root; fissures.isPickable = false;
    const fm = this.fissureMaterial = new ShaderMaterial('volcano-fissures', scene, 'volcanoFissure', { attributes: ['position','uv'], uniforms: ['world','worldViewProjection','time','edge','advance','eye','fogColor','fogDensity'],samplers:['lavaTex'], needAlphaBlending: true });
    this.bindSurface(fm);fm.setFloat('time',0);fm.setFloat('edge', edge);fm.setFloat('advance',0); fm.disableDepthWrite = true; fm.alphaMode = Constants.ALPHA_COMBINE;
    fissures.material = fm; fissures.alphaIndex = 1;

    // Rocks: dark crust with a molten glow.
    this.rockMaterial = new StandardMaterial('volcano-rock', scene);
    this.rockMaterial.diffuseTexture=calderaTexture(scene,'basalt.webp');this.rockMaterial.diffuseColor.set(.5,.4,.38);
    this.rockMaterial.emissiveTexture=calderaTexture(scene,'lava.webp');this.rockMaterial.emissiveColor.set(.7,.35,.12);this.rockMaterial.specularColor.set(.04,.03,.02);
    // The falling shadow: a soft dark disc.
    const st = this.shadowTexture = new DynamicTexture('volcano-shadow', { width: 128, height: 128 }, scene, true);
    const sc = st.getContext() as CanvasRenderingContext2D, sg = sc.createRadialGradient(64, 64, 0, 64, 64, 64);
    sg.addColorStop(0, 'rgba(0,0,0,1)'); sg.addColorStop(.6, 'rgba(0,0,0,.75)'); sg.addColorStop(1, 'rgba(0,0,0,0)');
    sc.fillStyle = sg; sc.fillRect(0, 0, 128, 128); st.hasAlpha = true; st.update();
    this.shadowMaterial = new StandardMaterial('volcano-shadow', scene);
    this.shadowMaterial.diffuseTexture = st; this.shadowMaterial.opacityTexture = st; this.shadowMaterial.useAlphaFromDiffuseTexture = true;
    this.shadowMaterial.disableLighting = true; this.shadowMaterial.emissiveColor = new Color3(.05, .02, .02); this.shadowMaterial.disableDepthWrite = true;

    // Crater flames share one soft flame card.
    const ft = this.flameTexture = new DynamicTexture('volcano-flame', { width: 64, height: 64 }, scene, true);
    const fc = ft.getContext() as CanvasRenderingContext2D, fg = fc.createRadialGradient(32, 40, 2, 32, 34, 30);
    fg.addColorStop(0, 'rgba(255,255,255,1)'); fg.addColorStop(.4, 'rgba(255,255,255,.55)'); fg.addColorStop(1, 'rgba(255,255,255,0)');
    fc.fillStyle = fg; fc.fillRect(0, 0, 64, 64); ft.hasAlpha = true; ft.update();

    // Smoke from the summit.
    const smoke = this.smoke = new ParticleSystem('volcano-smoke', 260, scene);
    smoke.particleTexture = calderaTexture(scene,'smoke.png');smoke.blendMode=ParticleSystem.BLENDMODE_STANDARD;smoke.minAngularSpeed=-.18;smoke.maxAngularSpeed=.22; smoke.emitter = SUMMIT.add(new Vector3(0,-3,0)); smoke.minEmitBox = new Vector3(-3, 0, -3); smoke.maxEmitBox = new Vector3(3, 1, 3);
    smoke.minSize = 8; smoke.maxSize = 15; smoke.minLifeTime = 8; smoke.maxLifeTime = 14; smoke.emitRate = 16;
    smoke.direction1 = new Vector3(-1.5, 3, -.5); smoke.direction2 = new Vector3(-.5, 4.5, .8); smoke.minEmitPower = 1; smoke.maxEmitPower = 1.6;
    smoke.addColorGradient(0, new Color4(.35, .16, .08, 0)); smoke.addColorGradient(.1, new Color4(.24, .2, .19, .5)); smoke.addColorGradient(1, new Color4(.3, .29, .28, 0));
    smoke.addSizeGradient(0, 4);smoke.addSizeGradient(.25,12); smoke.addSizeGradient(1, 28); smoke.preWarmCycles = 120; smoke.preWarmStepOffset = 4;
    // Ash and cinders fill the air as weather (Atmosphere.volcanic), like rain and snow.
    this.haze = scene.activeCamera ? new CalderaHeatHaze(scene.activeCamera) : null;
    this.root.setEnabled(false);this.summitLight.setEnabled(false);
  }

  setEnabled(enabled: boolean): void {
    if (enabled === this.enabled) return;
    this.enabled = enabled;
    this.root.setEnabled(enabled);
    this.summitLight.setEnabled(enabled);
    this.haze?.setEnabled(enabled);this.borderEmbers.setEnabled(enabled);
    this.smoke.stop();
    this.clear();
    this.elapsed = 0; CALDERA_SHORE.advance = 0; this.nextVolley = 6; this.nextThunder = 10 + Math.random() * 8;
    this.nihilisterSchedule.reset();
  }

  /** 0..1 how far the lava sea has advanced toward its final shoreline (the Test Lab can set it). */
  get lavaProgress(): number { return Math.min(1, this.elapsed / CALDERA_ADVANCE_TIME); }
  set lavaProgress(value: number) { this.elapsed = Math.max(0, Math.min(1, value)) * CALDERA_ADVANCE_TIME; }

  /** Fire a volley now (the Test Lab, or the schedule). */
  volley(count: number, player: Player, targets: TargetField): void {
    this.launchFlash = 1;
    // A deep boom from the summit: thunder slowed right down.
    audioEngine.playProcessed(SFX.explosion, { gain: 1.1, rate: .45, reverb: .5 });
    const alive = targets.targets.filter((t) => t.alive);
    for (let i = 0; i < count; i++) {
      // Most rocks fall among the horde; some near the player, never closer than a stride.
      let x: number, z: number;
      if (alive.length && Math.random() < .65) {
        const t = alive[Math.floor(Math.random() * alive.length)];
        x = t.position.x + (Math.random() - .5) * 6; z = t.position.z + (Math.random() - .5) * 6;
      } else {
        const a = Math.random() * Math.PI * 2, d = 2 + Math.random() * 7;
        x = player.position.x + Math.cos(a) * d; z = player.position.z + Math.sin(a) * d;
      }
      // Reserve the complete crater footprint, including rocks still in flight.
      for(let attempt=0;attempt<24;attempt++){
        const a=attempt*2.39996,d=attempt===0?0:5.7*Math.sqrt(attempt);
        const at=targets.navigation.project({x:x+Math.cos(a)*d,z:z+Math.sin(a)*d},CRATER_RADIUS+ .4);
        if(!this.craterSpaceFree(at))continue;
        this.launch(new Vector3(at.x,0,at.z),i*.18);break;
      }
    }
  }

  /** Throw a giant meteor onto open ground near the player (but clear of them). False if there is no room. */
  giant(player: Player, targets: TargetField, delay = 0): boolean {
    if (!this.enabled || !this.giantAllowed() || this.rocks.some((r) => r.scale > 1)) return false;
    const r = CRATER_RADIUS * GIANT_CRATER_SCALE;
    for (let attempt = 0; attempt < 24; attempt++) {
      // Beside the player (east or west) first: the screen is widest there, so all of her rises into
      // view (north runs off the top, south under the HUD). Anywhere after that.
      const a = attempt < 16 ? (Math.random() < .5 ? 0 : Math.PI) + (Math.random() - .5) * .8 : Math.random() * Math.PI * 2, d = r + 3 + Math.random() * 4;
      const at = targets.navigation.project({ x: player.position.x + Math.cos(a) * d, z: player.position.z + Math.sin(a) * d }, r + .4);
      if (!this.craterSpaceFree(at, r) || Math.hypot(at.x - player.position.x, at.z - player.position.z) < r + 2) continue;
      this.launch(new Vector3(at.x, 0, at.z), delay, GIANT_SCALE);
      return true;
    }
    return false;
  }

  private launch(to: Vector3, delay: number, scale = 1): void {
    if(onElevatorFootprint(to.x,to.z,3.8))return;
    const mesh = MeshBuilder.CreateIcoSphere('volcano-rock', { radius: scale > 1 ? GIANT_TRAIL_WIDTH / 2 : .7 + Math.random() * .4, subdivisions: scale > 1 ? 3 : 2 }, this.scene);
    mesh.material = this.rockMaterial; mesh.parent = this.root; mesh.isPickable = false;
    mesh.scaling.set(1, .8 + Math.random() * .3, 1.1); mesh.setEnabled(false);
    this.shadows.addShadowCaster(mesh);
    const shadow = MeshBuilder.CreateGround('volcano-rock-shadow', { width: 1, height: 1 }, this.scene);
    shadow.material = this.shadowMaterial; shadow.parent = this.root; shadow.isPickable = false;
    shadow.position.set(to.x, .06, to.z); shadow.visibility = 0; shadow.alphaIndex = 2;
    this.rocks.push({ mesh, shadow, from: SUMMIT.clone(), to, age: -delay, scale });
  }

  private land(rock: Rock, player: Player, targets: TargetField, run: Run, shake: (s: number) => void): void {
    const at = rock.to, giant = rock.scale > 1, k = giant ? GIANT_CRATER_SCALE : 1, reach = IMPACT_RADIUS * k;
    if(onElevatorFootprint(at.x,at.z,3.8)){rock.mesh.dispose();rock.shadow.dispose();return;}
    this.vfx.ring(at.clone().addInPlaceFromFloats(0, .1, 0), [1, .5, .15], .4 * k, reach * 1.6, .45 * (giant ? 2 : 1), .9);
    for (let i = 0; i < (giant ? 24 : 9); i++) this.vfx.flashSprite(at.add(new Vector3(Math.cos(i * 2.4) * 1.2 * k, (.4 + (i % 3) * .35) * k, Math.sin(i * 2.4) * 1.2 * k)), [1, .45 + (i % 3) * .12, .1], 1.4 * k, .55 * (giant ? 1.6 : 1), .9, 'spark');
    if (giant) audioEngine.playProcessed(SFX.explosion, { gain: 1.3, rate: .55, reverb: .6 });
    else audioEngine.play(SFX.explosion, .9);
    const near = Math.hypot(player.position.x - at.x, player.position.z - at.z);
    shake(giant ? .45 * Math.max(.3, 1 - near / 40) : near < 18 ? .22 * (1 - near / 18) + .05 : 0);
    if (near < reach + .45) player.takeDamage(IMPACT_DAMAGE);
    for (const t of targets.targets) if (t.alive && Math.hypot(t.position.x - at.x, t.position.z - at.z) < reach + t.radius) run.environmentDamage(t, IMPACT_DAMAGE * 3);
    rock.mesh.dispose(); rock.shadow.dispose();
    // A giant's crater is the start of her fire trail: one lava surface, so they blend and cool together.
    if (giant) this.onGiantImpact?.(at.clone(), this.addLavaTrail(at, GIANT_TRAIL_WIDTH, CRATER_RADIUS * GIANT_CRATER_SCALE));
    else this.spawnCrater(at);
  }

  private craterSpaceFree(at:{x:number;z:number},r=CRATER_RADIUS):boolean {
    // Keep the whole crater on dry ground, with room for the lava to creep while it burns.
    const gap=(o:number)=>r+o+.9;
    return !onElevatorFootprint(at.x,at.z,r+1.4)&&calderaShoreDepth(at.x,at.z)< -(r+3)&&this.craters.every(c=>Math.hypot(c.at.x-at.x,c.at.z-at.z)>=gap(c.r))
      &&this.rocks.every(k=>Math.hypot(k.to.x-at.x,k.to.z-at.z)>=gap(CRATER_RADIUS*(k.scale>1?GIANT_CRATER_SCALE:1)));
  }

  private spawnCrater(at: Vector3, scale = 1): void {
    if(onElevatorFootprint(at.x,at.z,3.8))return;
    const r=CRATER_RADIUS*scale;
    if(scale===1&&this.craters.some(c=>Math.hypot(c.at.x-at.x,c.at.z-at.z)<c.r+r+.9))return;
    const disc = createCalderaCraterFloor(this.scene);
    disc.position.set(at.x, .05, at.z); disc.rotation.y = Math.random() * 6.28; disc.parent = this.root; disc.isPickable = false; disc.alphaIndex = 3;
    disc.scaling.set(scale, 1, scale);
    const material = new ShaderMaterial('volcano-crater', this.scene, 'volcanoCrater', { attributes: ['position', 'uv'], uniforms: ['world','worldViewProjection','heat','scorch','crumble','rimBand','time','seed','eye','fogColor','fogDensity'],samplers:['lavaTex','basaltTex'], needAlphaBlending: true });
    material.setTexture('basaltTex',calderaTexture(this.scene,'basalt.webp'));material.setFloat('crumble',0);material.setFloat('rimBand',scale===1?1:0);
    this.bindSurface(material);material.setFloat('heat',1);material.setFloat('scorch',1);material.setFloat('time',this.time);
    material.setFloat('seed', Math.random() * 50); material.disableDepthWrite = true; material.backFaceCulling = false;
    disc.material = material;
    const fire = new ParticleSystem('volcano-crater-fire', 160, this.scene);
    fire.particleTexture = this.flameTexture; fire.blendMode = ParticleSystem.BLENDMODE_ADD; fire.emitter = at.clone().addInPlaceFromFloats(0, .1, 0);
    fire.minEmitBox = new Vector3(-r * .6, 0, -r * .6); fire.maxEmitBox = new Vector3(r * .6, .2, r * .6);
    fire.minSize = .5 * Math.sqrt(scale); fire.maxSize = 1.1 * Math.sqrt(scale); fire.minLifeTime = .5; fire.maxLifeTime = 1; fire.emitRate = 80 * scale;
    fire.direction1 = new Vector3(-.2, 2, -.2); fire.direction2 = new Vector3(.2, 3.2, .2); fire.minEmitPower = .8; fire.maxEmitPower = 1.2;
    fire.addColorGradient(0, new Color4(1, .9, .6, 0)); fire.addColorGradient(.15, new Color4(1, .7, .3, .7)); fire.addColorGradient(.6, new Color4(1, .35, .05, .4)); fire.addColorGradient(1, new Color4(.4, .05, 0, 0));
    fire.start();
    // A giant crater has no raised rim: just the molten floor.
    const rim=createCalderaImpactRim(this.scene);rim.position.copyFrom(at);rim.parent=this.root;rim.setEnabled(scale===1);
    this.craters.push({rim, disc, material, fire, at: at.clone(), age: 0, r });
  }

  /** Start a strip of fresh lava at `from`, `width` m across, with a `pool` m radius pool there; grow it with setLavaTrailEnd. */
  addLavaTrail(from: Vector3, width: number, pool = 0): LavaTrail {
    const handle: LavaTrail = { id: ++this.trailIds };
    // One ground quad, refitted as the strip grows; the shader cuts the ragged band and its border.
    const mesh = MeshBuilder.CreateGround('volcano-lava-trail', { width: 1, height: 1 }, this.scene);
    mesh.parent = this.root; mesh.isPickable = false; mesh.alphaIndex = 3; mesh.position.y = .055;
    const material = new ShaderMaterial('volcano-lava-trail', this.scene, 'volcanoTrail', { attributes: ['position', 'uv'], uniforms: ['world','worldViewProjection','a','b','halfWidth','pool','heat','scorch','time','seed','eye','fogColor','fogDensity'], samplers: ['lavaTex','basaltTex'], needAlphaBlending: true });
    this.bindSurface(material); material.setTexture('basaltTex', calderaTexture(this.scene, 'basalt.webp')); material.setFloat('heat', 1); material.setFloat('scorch', 1); material.setFloat('time', this.time);
    material.setFloat('halfWidth', width / 2); material.setFloat('pool', pool); material.setFloat('seed', Math.random() * 50); material.disableDepthWrite = true; material.backFaceCulling = false;
    mesh.material = material;
    this.trails.set(handle, { mesh, material, from: from.clone(), to: from.clone(), halfWidth: width / 2, pool, age: 0, burn: BURN_TIME + (pool > 0 ? POOL_EXTRA_BURN : 0) });
    this.setLavaTrailEnd(handle, from);
    return handle;
  }

  /** Extend a lava strip to `to` (its burn clock keeps running from when it started). */
  setLavaTrailEnd(handle: LavaTrail, to: Vector3): void {
    const t = this.trails.get(handle); if (!t) return;
    t.to.set(to.x, 0, to.z);
    const dx = t.to.x - t.from.x, dz = t.to.z - t.from.z, len = Math.hypot(dx, dz), pad = (Math.max(t.halfWidth, t.pool) + 6) * 2;
    t.mesh.position.x = (t.from.x + t.to.x) / 2; t.mesh.position.z = (t.from.z + t.to.z) / 2;
    t.mesh.rotation.y = Math.atan2(dx, dz); t.mesh.scaling.set(pad, 1, len + pad);
    t.material.setVector2('a', new Vector2(t.from.x, t.from.z)); t.material.setVector2('b', new Vector2(t.to.x, t.to.z));
  }

  /** Metres from (x, z) to a strip's centre line, with its pool counted as a wider part of the strip. */
  private trailDistance(t: Trail, x: number, z: number): number {
    return Math.min(this.lineDistance(t, x, z), Math.hypot(x - t.from.x, z - t.from.z) - t.pool + t.halfWidth);
  }
  private lineDistance(t: Trail, x: number, z: number): number {
    const ax = t.to.x - t.from.x, az = t.to.z - t.from.z, l2 = ax * ax + az * az;
    const k = l2 ? Math.max(0, Math.min(1, ((x - t.from.x) * ax + (z - t.from.z) * az) / l2)) : 0;
    return Math.hypot(x - t.from.x - ax * k, z - t.from.z - az * k);
  }

  update(dt: number, player: Player, targets: TargetField, run: Run, focus: Vector3, shake: (s: number) => void): void {
    this.playerHeat = 0;
    if (!this.enabled) return;
    this.time += dt;
    const visualTime=this.reducedMotion.matches?0:this.time;
    // The lava sea creeps in over the round (only while eruptions run), taking ~30% of the basin by 10 min.
    const advance=CALDERA_MAX_ADVANCE*Math.min(1,this.elapsed/CALDERA_ADVANCE_TIME);
    CALDERA_SHORE.clock=visualTime;CALDERA_SHORE.advance=advance;
    this.fissureMaterial.setFloat('time', visualTime);this.fissureMaterial.setFloat('advance',advance);this.art.update(visualTime);this.borderEmbers.update(visualTime,advance);
    this.smoke.updateSpeed = dt > 0 ? .01 : 0;
    this.launchFlash = Math.max(0, this.launchFlash - dt * 1.6);
    this.summitLight.intensity = 1.2 + this.launchFlash * 4;
    if (dt <= 0) return;
    // Lava is traversable. Drain bypasses hit grace without producing per-frame impact effects.
    if(player.hp>0&&inCalderaLava(player.position.x,player.position.z)){
      this.playerHeat=1;player.takeDamage(player.maxHp*.8*dt,true,true);player.damageFlash=Math.max(player.damageFlash,.1);
    }
    for(const t of targets.targets)if(t.alive&&inCalderaLava(t.position.x,t.position.z))run.environmentDamage(t,t.maxHp*.8*dt);
    // The caldera always burns: the fire vignette's full level is this map's baseline, and it flares
    // past that in lava or a burning crater. Haze strengthens as the player nears the lava edge.
    // ~14 m is about when the lava edge comes into a 16:9 view at the default zoom.
    const near=1-Math.min(1,Math.max(0,-calderaShoreDepth(player.position.x,player.position.z)/14));
    this.playerHeat=Math.max(this.playerHeat*2,.85+.7*near);
    this.burnTrees(dt);
    this.haze?.update(dt,near*near);


    // Dry lightning in the ash: now and then a bolt cracks down, usually out over the basin,
    // sometimes close enough to see. It is only spectacle, never damage.
    if ((this.nextThunder -= dt) <= 0) {
      this.nextThunder = 14 + Math.random() * 16;
      const a = Math.random() * Math.PI * 2, d = Math.random() < .4 ? 4 + Math.random() * 8 : 16 + Math.random() * 20;
      this.onThunder?.(focus.x + Math.cos(a) * d, focus.z + Math.sin(a) * d);
    }

    // The schedule: a volley every 9 s at the start, every 3 s by ten minutes, with more rocks.
    if (this.erupting) {
      this.nihilisterSchedule.update(dt, () => this.giant(player, targets));
      this.elapsed += dt;
      this.nextVolley -= dt;
      if (this.nextVolley <= 0) {
        const ramp = Math.min(1, this.elapsed / 600);
        this.nextVolley = 9 - 6 * ramp + Math.random() * 1.5;
        this.volley(1 + Math.round(ramp * 3 + Math.random()), player, targets);
      }
    }

    // Warn steering about falling rocks only. Raptures walk through grounded lava and take damage.
    const nav = targets.navigation as { dangers?: { x: number; z: number; r: number }[] } | undefined;
    if (nav?.dangers) {
      nav.dangers.length = 0;
      for (const r of this.rocks) nav.dangers.push({ x: r.to.x, z: r.to.z, r: IMPACT_RADIUS * (r.scale > 1 ? GIANT_CRATER_SCALE : 1) });
      this.dangerList = nav.dangers;
    }
    for (let i = this.rocks.length - 1; i >= 0; i--) {
      const r = this.rocks[i];
      r.age += dt;
      if (r.age < 0) continue;
      const t = Math.min(1, r.age / FALL_TIME);
      // A high lob: across the sky, then dropping almost straight down onto its shadow.
      const p = Vector3.Lerp(r.from, r.to, 1 - (1 - t) * (1 - t));
      p.y = r.from.y * (1 - t) + 26 * Math.sin(t * Math.PI) * (1 - t * .6) + r.to.y * t;
      r.mesh.position.copyFrom(p); r.mesh.setEnabled(true);
      r.mesh.rotation.x += dt * 3; r.mesh.rotation.z += dt * 2;
      // The shadow is the warning: it grows and darkens as the rock comes down.
      const s = (.8 + t * t * CRATER_RADIUS * 1.9) * (r.scale > 1 ? GIANT_CRATER_SCALE : 1);
      r.shadow.scaling.set(s, 1, s); r.shadow.visibility = .15 + .75 * t * t;
      if (t >= 1) { this.rocks.splice(i, 1); this.land(r, player, targets, run, shake); }
    }

    for (let i = this.craters.length - 1; i >= 0; i--) {
      const c = this.craters[i];
      c.age += dt;
      const burning = c.age < BURN_TIME;
      const heat = burning ? 1 : Math.max(0, 1 - (c.age - BURN_TIME) / COOL_TIME);
      const scorch = Math.max(0, 1 - Math.max(0, c.age - BURN_TIME - COOL_TIME) / SCORCH_TIME);
      const crumble=Math.max(0,Math.min(1,(c.age-BURN_TIME-COOL_TIME-SCORCH_TIME+3)/3));
      crumbleCalderaRim(c.rim,crumble);crumbleCalderaRim(c.disc,crumble);
      c.material.setFloat('crumble',crumble);
      c.material.setFloat('heat', heat); c.material.setFloat('scorch', 1); c.material.setFloat('time', visualTime);
      c.fire.emitRate = 80 * (c.r / CRATER_RADIUS) * (burning ? 1 : heat * .4);
      if (!burning && c.fire.isStarted() && heat < .3) c.fire.stop();
      if (heat>0) this.burnInside((x, z) => Math.hypot(x - c.at.x, z - c.at.z), c.r, heat, dt, player, targets, run);
      if (scorch <= 0) { c.rim.dispose();c.disc.dispose(); c.material.dispose(); c.fire.dispose(false); this.craters.splice(i, 1); }
    }

    // Lava trails: the same burn, cool and fade clock as a crater, and the same harm while hot.
    for (const [handle, t] of this.trails) {
      t.age += dt;
      const heat = t.age < t.burn ? 1 : Math.max(0, 1 - (t.age - t.burn) / COOL_TIME);
      const scorch = Math.max(0, 1 - Math.max(0, t.age - t.burn - COOL_TIME) / SCORCH_TIME);
      t.material.setFloat('heat', heat); t.material.setFloat('scorch', scorch); t.material.setFloat('time', visualTime);
      if (heat > 0) this.burnInside((x, z) => this.trailDistance(t, x, z), t.halfWidth, heat, dt, player, targets, run);
      if (scorch <= 0) { t.mesh.dispose(); t.material.dispose(); this.trails.delete(handle); }
    }
  }

  /** Burning ground hurts and slows everyone in it; once it cools it is safe. `distance` is to its centre (line). */
  private burnInside(distance: (x: number, z: number) => number, r: number, heat: number, dt: number, player: Player, targets: TargetField, run: Run): void {
    const pd = distance(player.position.x, player.position.z);
    if (pd < r && player.hp > 0) {
      this.playerHeat = Math.max(this.playerHeat, 2 * (1 - pd / r * .4));
      if (player.takeDamage(Math.max(CRATER_DPS,player.maxHp*.8)*heat*dt, true, true)) player.damageFlash = Math.max(player.damageFlash, .1);
    }
    for (const t of targets.targets) if (t.alive && distance(t.position.x, t.position.z) < r + t.radius) {
      run.environmentDamage(t, Math.max(RAPTURE_CRATER_DPS,t.maxHp*.8)*heat*dt);
      t.slowed = Math.max(t.slowed, .4);
    }
  }

  /** Dead trees the lava reaches catch fire and slowly sink, burning, until the lava swallows them. */
  private burnTrees(dt:number):void {
    if((this.treeScan-=dt)<=0){
      this.treeScan=1;
      for(const node of this.scene.transformNodes)if(node.name==='dressing-dead-pine'&&node.parent?.name==='range-environment-volcano'&&!node.isDisposed()&&!this.burning.has(node))
        if(calderaShoreDepth(node.position.x,node.position.z)>-.6)this.ignite(node);
    }
    for(const [node,b] of this.burning){
      b.age+=dt;
      if(node.isDisposed()){b.fire.dispose(false);this.burning.delete(node);continue;}
      const t=Math.min(1,b.age/TREE_SINK_TIME);
      // Sinks slowly at first, then slumps under; the trunk softens as it goes.
      node.position.y=-t*t*6.5;node.scaling.x=node.scaling.z=b.scale*(1+.15*t);
      (b.fire.emitter as Vector3).set(node.position.x,Math.max(.2,node.position.y+2.4),node.position.z);
      b.fire.emitRate=t<.85?70:0;
      if(t>=1&&!b.gone){b.gone=true;node.setEnabled(false);}
    }
  }

  private ignite(node:TransformNode):void {
    const fire=new ParticleSystem('volcano-tree-fire',220,this.scene);
    fire.particleTexture=this.flameTexture;fire.blendMode=ParticleSystem.BLENDMODE_ADD;fire.emitter=node.position.clone();
    fire.minEmitBox=new Vector3(-.5,-2,-.5);fire.maxEmitBox=new Vector3(.5,3,.5);
    fire.minSize=.5;fire.maxSize=1.3;fire.minLifeTime=.5;fire.maxLifeTime=1.1;fire.emitRate=70;
    fire.direction1=new Vector3(-.3,2,-.3);fire.direction2=new Vector3(.3,3.4,.3);fire.minEmitPower=.6;fire.maxEmitPower=1.1;
    fire.addColorGradient(0,new Color4(1,.6,.2,0));fire.addColorGradient(.15,new Color4(1,.45,.1,.75));fire.addColorGradient(.6,new Color4(.95,.22,.03,.4));fire.addColorGradient(1,new Color4(.3,.04,0,0));
    fire.start();
    this.burning.set(node,{fire,age:0,scale:node.scaling.x,gone:false});
  }

  private bindSurface(material:ShaderMaterial):void {
    material.setTexture('lavaTex',calderaTexture(this.scene,'lava.webp'));
    material.onBindObservable.add(()=>{
      const camera=this.scene.activeCamera;if(camera)material.setVector3('eye',camera.globalPosition);
      material.setColor3('fogColor',this.scene.fogColor);material.setFloat('fogDensity',this.scene.fogEnabled?this.scene.fogDensity:0);
    });
  }

  private clear(): void {
    for (const r of this.rocks) { r.mesh.dispose(); r.shadow.dispose(); }
    this.rocks.length = 0;
    for (const c of this.craters) { c.rim.dispose();c.disc.dispose(); c.material.dispose(); c.fire.dispose(false); }
    this.craters.length = 0;
    for (const t of this.trails.values()) { t.mesh.dispose(); t.material.dispose(); }
    this.trails.clear();
    for (const b of this.burning.values()) b.fire.dispose(false);
    if (this.dangerList) this.dangerList.length = 0;
    this.burning.clear();
  }

  dispose(): void {
    this.clear();
    this.root.dispose();this.art.dispose(); this.fissureMaterial.dispose(); this.rockMaterial.dispose(); this.shadowMaterial.dispose();
    this.shadowTexture.dispose(); this.flameTexture.dispose(); this.summitLight.dispose(); this.haze?.dispose(); this.borderEmbers.dispose(); this.smoke.dispose(false);
  }
}

