// Ashen Caldera: a volcano east of the basin lobs molten rocks into the fight.
//
// Each rock arcs from the summit; its shadow on the ground grows and darkens as it falls, which is
// the only warning. It flattens whatever it lands on and leaves a crater that burns (hurting and
// slowing anyone in it, Raptures included) before cooling to embers, then to a harmless scorch.
// Volleys come faster and heavier as the round goes on: the threat comes from time, not from what
// the player does. Rocks mostly land around the horde, so a barrage is also something to use.

import { Color3, Constants, DynamicTexture, Effect, Mesh, MeshBuilder, ParticleSystem, Color4, PointLight, ShaderMaterial, StandardMaterial, TransformNode, Vector3, type Scene, type ShadowGenerator } from '@babylonjs/core';
import { CalderaArt, createCalderaCraterFloor, createCalderaImpactRim, crumbleCalderaRim } from './caldera-art';
import { calderaTexture } from './caldera-materials';
import { calderaEffectVertex, calderaFissureFragment, calderaCraterFragment } from './caldera-effects';
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

// Shared flow textures, cooling crust, and scene fog for all molten surfaces.
Effect.ShadersStore.volcanoFissureVertexShader=calderaEffectVertex;
Effect.ShadersStore.volcanoFissureFragmentShader=calderaFissureFragment;
Effect.ShadersStore.volcanoCraterVertexShader=calderaEffectVertex;
Effect.ShadersStore.volcanoCraterFragmentShader=calderaCraterFragment;

interface Rock { mesh: Mesh; shadow: Mesh; from: Vector3; to: Vector3; age: number }
interface Crater { rim: Mesh; disc: Mesh; material: ShaderMaterial; fire: ParticleSystem; at: Vector3; age: number }

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
  private enabled = false;
  private time = 0;
  private readonly reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
  /** seconds since the eruptions began (drives the ramp) */
  private elapsed = 0;
  private nextVolley = 6;
  private launchFlash = 0;
  /** eruptions on schedule; the Test Lab can pause them */
  erupting = true;
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

  private launch(to: Vector3, delay: number): void {
    if(onElevatorFootprint(to.x,to.z,3.8))return;
    const mesh = MeshBuilder.CreateIcoSphere('volcano-rock', { radius: .7 + Math.random() * .4, subdivisions: 2 }, this.scene);
    mesh.material = this.rockMaterial; mesh.parent = this.root; mesh.isPickable = false;
    mesh.scaling.set(1, .8 + Math.random() * .3, 1.1); mesh.setEnabled(false);
    this.shadows.addShadowCaster(mesh);
    const shadow = MeshBuilder.CreateGround('volcano-rock-shadow', { width: 1, height: 1 }, this.scene);
    shadow.material = this.shadowMaterial; shadow.parent = this.root; shadow.isPickable = false;
    shadow.position.set(to.x, .06, to.z); shadow.visibility = 0; shadow.alphaIndex = 2;
    this.rocks.push({ mesh, shadow, from: SUMMIT.clone(), to, age: -delay });
  }

  private land(rock: Rock, player: Player, targets: TargetField, run: Run, shake: (s: number) => void): void {
    const at = rock.to;
    if(onElevatorFootprint(at.x,at.z,3.8)){rock.mesh.dispose();rock.shadow.dispose();return;}
    this.vfx.ring(at.clone().addInPlaceFromFloats(0, .1, 0), [1, .5, .15], .4, IMPACT_RADIUS * 1.6, .45, .9);
    for (let i = 0; i < 9; i++) this.vfx.flashSprite(at.add(new Vector3(Math.cos(i * 2.4) * 1.2, .4 + (i % 3) * .35, Math.sin(i * 2.4) * 1.2)), [1, .45 + (i % 3) * .12, .1], 1.4, .55, .9, 'spark');
    audioEngine.play(SFX.explosion, .9);
    const near = Math.hypot(player.position.x - at.x, player.position.z - at.z);
    shake(near < 18 ? .22 * (1 - near / 18) + .05 : 0);
    if (near < IMPACT_RADIUS + .45) player.takeDamage(IMPACT_DAMAGE);
    for (const t of targets.targets) if (t.alive && Math.hypot(t.position.x - at.x, t.position.z - at.z) < IMPACT_RADIUS + t.radius) run.environmentDamage(t, IMPACT_DAMAGE * 3);
    rock.mesh.dispose(); rock.shadow.dispose();
    this.spawnCrater(at);
  }

  private craterSpaceFree(at:{x:number;z:number}):boolean {
    // Keep the whole crater on dry ground, with room for the lava to creep while it burns.
    return !onElevatorFootprint(at.x,at.z,3.8)&&calderaShoreDepth(at.x,at.z)< -(CRATER_RADIUS+3)&&this.craters.every(c=>Math.hypot(c.at.x-at.x,c.at.z-at.z)>=5.7)
      &&this.rocks.every(r=>Math.hypot(r.to.x-at.x,r.to.z-at.z)>=5.7);
  }

  private spawnCrater(at: Vector3): void {
    if(onElevatorFootprint(at.x,at.z,3.8))return;
    if(this.craters.some(c=>Math.hypot(c.at.x-at.x,c.at.z-at.z)<5.7))return;
    const disc = createCalderaCraterFloor(this.scene);
    disc.position.set(at.x, .05, at.z); disc.rotation.y = Math.random() * 6.28; disc.parent = this.root; disc.isPickable = false; disc.alphaIndex = 3;
    const material = new ShaderMaterial('volcano-crater', this.scene, 'volcanoCrater', { attributes: ['position', 'uv'], uniforms: ['world','worldViewProjection','heat','scorch','crumble','time','seed','eye','fogColor','fogDensity'],samplers:['lavaTex','basaltTex'], needAlphaBlending: true });
    material.setTexture('basaltTex',calderaTexture(this.scene,'basalt.webp'));material.setFloat('crumble',0);
    this.bindSurface(material);material.setFloat('heat',1);material.setFloat('scorch',1);material.setFloat('time',this.time);
    material.setFloat('seed', Math.random() * 50); material.disableDepthWrite = true; material.backFaceCulling = false;
    disc.material = material;
    const fire = new ParticleSystem('volcano-crater-fire', 160, this.scene);
    fire.particleTexture = this.flameTexture; fire.blendMode = ParticleSystem.BLENDMODE_ADD; fire.emitter = at.clone().addInPlaceFromFloats(0, .1, 0);
    fire.minEmitBox = new Vector3(-CRATER_RADIUS * .6, 0, -CRATER_RADIUS * .6); fire.maxEmitBox = new Vector3(CRATER_RADIUS * .6, .2, CRATER_RADIUS * .6);
    fire.minSize = .5; fire.maxSize = 1.1; fire.minLifeTime = .5; fire.maxLifeTime = 1; fire.emitRate = 80;
    fire.direction1 = new Vector3(-.2, 2, -.2); fire.direction2 = new Vector3(.2, 3.2, .2); fire.minEmitPower = .8; fire.maxEmitPower = 1.2;
    fire.addColorGradient(0, new Color4(1, .9, .6, 0)); fire.addColorGradient(.15, new Color4(1, .7, .3, .7)); fire.addColorGradient(.6, new Color4(1, .35, .05, .4)); fire.addColorGradient(1, new Color4(.4, .05, 0, 0));
    fire.start();
    const rim=createCalderaImpactRim(this.scene);rim.position.copyFrom(at);rim.parent=this.root;
    this.craters.push({rim, disc, material, fire, at: at.clone(), age: 0 });
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
      this.elapsed += dt;
      this.nextVolley -= dt;
      if (this.nextVolley <= 0) {
        const ramp = Math.min(1, this.elapsed / 600);
        this.nextVolley = 9 - 6 * ramp + Math.random() * 1.5;
        this.volley(1 + Math.round(ramp * 3 + Math.random()), player, targets);
      }
    }

    // Publish the danger zones (every rock in flight, every burning crater) for unit steering.
    const nav = targets.navigation as { dangers?: { x: number; z: number; r: number }[] } | undefined;
    if (nav?.dangers) {
      nav.dangers.length = 0;
      for (const r of this.rocks) nav.dangers.push({ x: r.to.x, z: r.to.z, r: IMPACT_RADIUS });
      for (const c of this.craters) if (c.age < BURN_TIME + COOL_TIME * .7) nav.dangers.push({ x: c.at.x, z: c.at.z, r: CRATER_RADIUS });
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
      const s = .8 + t * t * CRATER_RADIUS * 1.9;
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
      c.fire.emitRate = 80 * (burning ? 1 : heat * .4);
      if (!burning && c.fire.isStarted() && heat < .3) c.fire.stop();
      if (heat>0) {
        // Burning craters hurt and slow everyone in them; once they cool they are safe ground.
        const pd = Math.hypot(player.position.x - c.at.x, player.position.z - c.at.z);
        if (pd < CRATER_RADIUS && player.hp > 0) {
          this.playerHeat = Math.max(this.playerHeat, 2 * (1 - pd / CRATER_RADIUS * .4));
          if (player.takeDamage(Math.max(CRATER_DPS,player.maxHp*.8)*heat*dt, true, true)) player.damageFlash = Math.max(player.damageFlash, .1);
        }
        for (const t of targets.targets) if (t.alive && Math.hypot(t.position.x - c.at.x, t.position.z - c.at.z) < CRATER_RADIUS + t.radius) {
          run.environmentDamage(t, Math.max(RAPTURE_CRATER_DPS,t.maxHp*.8)*heat*dt);
          t.slowed = Math.max(t.slowed, .4);
        }
      }
      if (scorch <= 0) { c.rim.dispose();c.disc.dispose(); c.material.dispose(); c.fire.dispose(false); this.craters.splice(i, 1); }
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
