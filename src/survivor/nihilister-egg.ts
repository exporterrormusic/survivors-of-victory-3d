// Ashen Caldera easter egg: Nihilister.
//
// A giant meteor arrives every two minutes, five times the normal size.
// Nihilister's dragon form climbs out of its crater (as the Siren rises from a broken lake), hovers,
// roars "RAPTURE REGICIDE! BURN!", then streaks off in a random direction breathing fire, leaving a
// meteor-wide strip of lava on the ground. Crater and strip are one lava surface (Volcano.addLavaTrail,
// a pool that grows into a strip), so they blend and burn, cool and fade together. She never aims the strip through the player or across the lift.
//
// Model: public/bosses/mba002_nihilister.glb, hand-rigged by tools/rig-nihilister.mjs.
// The Test Lab's Events tab can drop a giant meteor on an Ashen Caldera run.

import {
  Color4, Constants, DynamicTexture, Effect, LoadAssetContainerAsync, MeshBuilder, ParticleSystem,
  Quaternion, ShaderMaterial, TransformNode, Vector3, type AnimationGroup, type AssetContainer, type Mesh, type Scene, type ShadowGenerator,
} from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { audioEngine } from '../audio/audio-engine';
import { SFX } from '../audio/sound-bank';
import { lavaNoiseGLSL } from './caldera-materials';
import { onElevatorFootprint } from './elevator-footprint';
import { GIANT_TRAIL_WIDTH, type LavaTrail, type Volcano } from './volcano';
import type { Player } from './player';
import type { Vfx } from './vfx';
import { TelegraphLayer, TELL, type Tell } from './mode/telegraph';

const MODEL = `${import.meta.env.BASE_URL}bosses/mba002_nihilister.glb`;
const LINE = 'RAPTURE REGICIDE!  BURN!';
/** model is ~35 m across its wings; this fits her inside the giant crater */
const SCALE = .32;
/** root height while hovering: the model's lowest claw sits at y -3 */
const HOVER_Y = 3 * SCALE + .5, BURIED_Y = -30 * SCALE;
/** seconds after impact: let the dust settle, rise, hover, speak, then go */
const RISE_AT = .8, RISE_TIME = 1.8, LINE_AT = 2.9, LINE_TIME = 2.4, TAKEOFF_AT = 5.4;
/** a quick eased turn to her heading (the pose blends into the strafe meanwhile), then the dash */
const TURN_TIME = .55, LAUNCH_AT = TAKEOFF_AT + TURN_TIME;
/** per-frame crossfade step between clips (~.25 s) */
const BLEND_SPEED = .07;
/** flight: top speed (m/s), seconds to reach it, cruise height, and how far she goes before leaving */
const SPEED = 55, ACCEL = .45, CRUISE_Y = 4, EXIT_DISTANCE = 95;
/** lava stops at the basin rim (the massif beyond is rock) */
const BASIN = 58;
/** head-bone to mouth (model space), and how far ahead of her mouth the jet meets the ground */
const MOUTH = new Vector3(0, -.5, 4), JET_REACH = 7;
/** ground flames per second under the jet (kept low: this ran badly at 700 with a point light) */
const BREATH_RATE = 320;

const ease = (t: number): number => { const c = Math.max(0, Math.min(1, t)); return c * c * (3 - 2 * c); };

// The breath jet: a cone with fire scrolling from mouth to ground, white-hot at the mouth.
Effect.ShadersStore.nihilisterBreathVertexShader = `precision highp float;attribute vec3 position,normal;attribute vec2 uv;
 uniform mat4 world,worldViewProjection;varying vec2 vUV;varying vec3 vNormal,vWorld;
 void main(){vUV=uv;vNormal=normalize(mat3(world)*normal);vWorld=(world*vec4(position,1.)).xyz;gl_Position=worldViewProjection*vec4(position,1.);}`;
Effect.ShadersStore.nihilisterBreathFragmentShader = `precision highp float;varying vec2 vUV;varying vec3 vNormal,vWorld;
 uniform float time,power;uniform vec3 eye;${lavaNoiseGLSL}
 void main(){float s=1.-vUV.y; // 0 at the mouth, 1 where it hits the ground
 float n=cnoise(vec2(vUV.x*9.,s*5.-time*11.))*.6+cnoise(vec2(vUV.x*23.,s*13.-time*19.))*.4;
 float body=smoothstep(.2,.8,n+.55-s*.45);
 float rim=pow(abs(dot(normalize(eye-vWorld),vNormal)),1.4); // soft silhouette
 vec3 col=mix(vec3(1.,.96,.78),vec3(1.,.5,.1),smoothstep(0.,.45,s));col=mix(col,vec3(.85,.16,.02),smoothstep(.5,1.,s));
 float a=body*rim*power*(1.-smoothstep(.85,1.,s)*.6)*smoothstep(0.,.06,vUV.y<.99?1.:0.);
 gl_FragColor=vec4(col*a*1.6,a);}`;

export interface NihilisterEggContext {
  scene: Scene; shadows: ShadowGenerator; vfx: Vfx; player: Player; volcano: Volcano; hud: HTMLElement;
  toScreen: (x: number, y: number, z: number) => { x: number; y: number };
  refreshUnits: () => void;
  shake: (strength: number) => void;
}

interface Boss { root: TransformNode; meshes: Mesh[]; groups: Map<string, AnimationGroup>; head: TransformNode | null }

export class NihilisterEgg {
  private enabled = false;
  private container: Promise<AssetContainer | null> | null = null;
  private boss: Boss | null = null;
  /** seconds since impact; -1 idle, -2 loading */
  private age = -1;
  private at = new Vector3();
  private dir = new Vector3(0, 0, 1);
  private travelled = 0;
  private yawFrom = 0;
  private yawTo = 0;
  private startY = 0;
  private trail: LavaTrail | null = null;
  private caption: HTMLDivElement | null = null;
  private jet: Mesh | null = null;
  private jetMaterial: ShaderMaterial | null = null;
  private flames: ParticleSystem | null = null;
  private flameTexture: DynamicTexture | null = null;
  private token = 0;
  private readonly mouth = new Vector3();
  private readonly ground = new Vector3();
  private readonly warnings: TelegraphLayer;
  private warning: Tell | null = null;
  private pathLength = 0;

  constructor(private readonly ctx: NihilisterEggContext) {
    this.warnings = new TelegraphLayer(ctx.scene);
    ctx.volcano.onGiantImpact = (at, pool) => this.summon(at, pool);
    ctx.volcano.giantAllowed = () => this.enabled && !this.busy;
  }

  get active(): boolean { return this.enabled; }
  /** an impact is being played out, or she is loading for one (one giant at a time) */
  get busy(): boolean { return this.age !== -1; }

  /** Only the Ashen Caldera throws giants; load her as the map opens so she is ready when one lands. */
  setEnabled(enabled: boolean): void {
    if (enabled === this.enabled) return;
    this.enabled = enabled;
    this.clear();
    if (enabled) this.container ??= LoadAssetContainerAsync(MODEL, this.ctx.scene).catch(() => null);
  }

  /** A giant meteor landed here: she climbs out of the crater. */
  summon(at: Vector3, pool: LavaTrail): void {
    if (!this.enabled) return;
    this.dropBoss();
    // The crater's lava pool: her fire trail grows out of it.
    this.trail = pool;
    this.at.set(at.x, 0, at.z);
    this.age = -2; // loading
    void this.load();
  }

  private async load(): Promise<void> {
    const token = ++this.token;
    const container = await (this.container ??= LoadAssetContainerAsync(MODEL, this.ctx.scene).catch(() => null));
    if (token !== this.token || !container) { if (token === this.token) this.age = -1; return; }
    const entries = container.instantiateModelsToScene((name) => name, false, { doNotInstantiate: true });
    const root = new TransformNode('nihilister', this.ctx.scene);
    for (const node of entries.rootNodes) node.parent = root;
    root.scaling.setAll(SCALE);
    root.position.set(this.at.x, BURIED_Y, this.at.z);
    const meshes = root.getChildMeshes(false) as Mesh[];
    // No shadow casting: her full-detail mesh in the shadow pass cost too much.
    for (const m of meshes) m.isPickable = false;
    // Blend between clips so the hover, roar and strafe poses crossfade instead of snapping.
    const groups = new Map(entries.animationGroups.map((g) => { g.stop(); g.enableBlending = true; g.blendingSpeed = BLEND_SPEED; return [g.name, g] as const; }));
    const head = root.getChildTransformNodes(false).find((n) => n.name === 'head') ?? null;
    this.boss = { root, meshes, groups, head };
    this.play('idle_hover');
    // Always face south (toward the camera): her best angle.
    root.rotation.y = 0;
    this.ctx.refreshUnits();
    this.age = 0;
  }

  private play(name: string, loop = true): void {
    const b = this.boss; if (!b) return;
    for (const [n, g] of b.groups) if (n !== name) g.stop();
    const g = b.groups.get(name);
    if (g && !g.isPlaying) g.start(loop, 1, g.from, g.to);
  }

  update(dt: number): void {
    this.warnings.update(dt);
    if (!this.enabled || this.age < 0 || !this.boss) return;
    const t = this.age += dt, prev = t - dt;
    const crossed = (at: number) => prev < at && t >= at;
    const { root } = this.boss;

    if (crossed(RISE_AT)) this.burst(1);
    if (t < TAKEOFF_AT) {
      // Up out of the crater, then a heavy hover.
      const up = ease((t - RISE_AT) / RISE_TIME);
      root.position.y = BURIED_Y + (HOVER_Y - BURIED_Y) * up + Math.sin(t * 2.2) * .25 * up;
      if (t > RISE_AT && t < RISE_AT + RISE_TIME && Math.floor(t * 5) !== Math.floor(prev * 5)) this.burst(.4);
    }
    if (crossed(LINE_AT)) this.speak();
    if (crossed(TAKEOFF_AT)) this.takeOff();
    if (t >= TAKEOFF_AT && t < LAUNCH_AT) {
      // Swing round to the heading, rising a little and dipping into the strafe.
      const k = ease((t - TAKEOFF_AT) / TURN_TIME);
      root.rotation.y = this.yawFrom + (this.yawTo - this.yawFrom) * k;
      root.position.y = this.startY + .6 * k;
    }
    if (crossed(LAUNCH_AT)) this.launch();
    if (t >= LAUNCH_AT) this.fly(dt, t - LAUNCH_AT);
    this.updateCaption(t - LINE_AT);
  }

  /** Embers and a shock ring from the crater. */
  private burst(strength: number): void {
    const at = this.at.clone().addInPlaceFromFloats(0, .2, 0), { vfx } = this.ctx;
    // No ring here: the meteor's impact ring is the only one (a second read as clutter, repeats as a border).
    for (let i = 0; i < 14 * strength; i++) {
      const a = i * 2.4, r = 2 + (i % 4) * 1.3;
      vfx.flashSprite(at.add(new Vector3(Math.cos(a) * r, 1 + (i % 5) * .9, Math.sin(a) * r)), [1, .4 + (i % 3) * .15, .08], 1.6, .7, .9, 'spark');
    }
    if (strength >= 1) { this.ctx.shake(.3); audioEngine.playProcessed(SFX.explosion, { gain: 1, rate: .5, reverb: .5 }); }
  }

  private speak(): void {
    this.warnPath();
    const b = this.boss;
    if (b?.groups.has('roar')) { this.play('roar', false); b.groups.get('roar')!.onAnimationGroupEndObservable.addOnce(() => { if (this.age < TAKEOFF_AT) this.play('idle_hover'); }); }
    audioEngine.playProcessed(SFX.raptureDeath, { gain: 1.4, rate: .45, reverb: .6 });
    this.ctx.shake(.2);
    this.caption?.remove();
    this.caption = this.captionElement(LINE);
  }

  // --- the strafing run ------------------------------------------------------------------
  private takeOff(): void {
    const { root } = this.boss!;
    // The glTF loader turns the model round, so her face is at yaw + PI. Take the short way round.
    const goal = Math.atan2(this.dir.x, this.dir.z) + Math.PI;
    this.yawFrom = root.rotation.y;
    this.yawTo = this.yawFrom + Math.atan2(Math.sin(goal - this.yawFrom), Math.cos(goal - this.yawFrom));
    this.startY = root.position.y;
    this.travelled = 0;
    this.play('fly_breath');
  }

  /** Turned: dash off breathing fire. */
  private launch(): void {
    this.clearWarning();
    this.boss!.root.rotation.y = this.yawTo;
    this.startY = this.boss!.root.position.y;
    this.startBreath();
    this.ctx.shake(.25);
    audioEngine.playProcessed(SFX.explosion, { gain: .9, rate: .75, reverb: .3 });
  }

  /** Lock and show the full fire corridor about three seconds before she attacks. */
  private warnPath(): void {
    this.clearWarning();
    this.dir.copyFrom(this.pickDirection());
    const dot = this.at.x * this.dir.x + this.at.z * this.dir.z;
    this.pathLength = Math.max(0, -dot + Math.sqrt(Math.max(0, dot * dot + BASIN * BASIN - this.at.x ** 2 - this.at.z ** 2)) - GIANT_TRAIL_WIDTH / 2);
    this.warning = this.warnings.lane(this.at.x, this.at.z, Math.atan2(this.dir.x, this.dir.z),
      this.pathLength + GIANT_TRAIL_WIDTH / 2, GIANT_TRAIL_WIDTH + .5, TELL.charge, .95);
    this.warning.fill = 1;
  }

  private clearWarning(): void {
    if (this.warning) this.warnings.release(this.warning);
    this.warning = null;
  }

  /** A random heading whose lava strip stays clear of the player and the lift. */
  private pickDirection(): Vector3 {
    const p = this.ctx.player.position, half = GIANT_TRAIL_WIDTH / 2;
    const clear = (a: number): boolean => {
      for (let d = 0; d <= EXIT_DISTANCE; d += 2) {
        const x = this.at.x + Math.sin(a) * d, z = this.at.z + Math.cos(a) * d;
        if (Math.hypot(x, z) > BASIN) break;
        if (Math.hypot(x - p.x, z - p.z) < half + 4 || onElevatorFootprint(x, z, half + 1)) return false;
      }
      return true;
    };
    for (let i = 0; i < 32; i++) { const a = Math.random() * Math.PI * 2; if (clear(a)) return new Vector3(Math.sin(a), 0, Math.cos(a)); }
    // Fallback: straight away from the player.
    return new Vector3(this.at.x - p.x, 0, this.at.z - p.z).normalize();
  }

  private fly(dt: number, f: number): void {
    const { root } = this.boss!;
    const speed = SPEED * ease(f / ACCEL);
    this.travelled += speed * dt;
    root.position.set(this.at.x + this.dir.x * this.travelled, this.startY + (CRUISE_Y - this.startY) * ease(f / ACCEL), this.at.z + this.dir.z * this.travelled);

    // The jet runs from her mouth to the ground a little ahead of her.
    this.mouthPosition(this.mouth);
    // Keep the damaging strip on the exact corridor shown by the warning;
    // animated head offsets must not sweep the lava outside that corridor.
    const along = Math.max(0, Math.min(this.pathLength,
      (this.mouth.x - this.at.x) * this.dir.x + (this.mouth.z - this.at.z) * this.dir.z + JET_REACH));
    this.ground.set(this.at.x + this.dir.x * along, 0, this.at.z + this.dir.z * along);
    const onBasin = this.travelled < this.pathLength;
    if (this.trail && onBasin) this.ctx.volcano.setLavaTrailEnd(this.trail, this.ground);
    this.placeJet(this.mouth, this.ground, onBasin ? 1 : 0);

    if (this.travelled > EXIT_DISTANCE) this.dropBoss();
  }

  private mouthPosition(out: Vector3): Vector3 {
    const b = this.boss!;
    if (b.head) { b.head.computeWorldMatrix(true); return Vector3.TransformCoordinatesToRef(MOUTH, b.head.getWorldMatrix(), out); }
    return out.copyFrom(b.root.position).addInPlaceFromFloats(this.dir.x * 4, 4, this.dir.z * 4);
  }

  private startBreath(): void {
    const { scene } = this.ctx;
    const jet = this.jet = MeshBuilder.CreateCylinder('nihilister-breath', { height: 1, diameterTop: .25, diameterBottom: 1, tessellation: 20, subdivisions: 6 }, scene);
    jet.isPickable = false;
    jet.rotationQuaternion = new Quaternion();
    const m = this.jetMaterial = new ShaderMaterial('nihilister-breath', scene, 'nihilisterBreath', { attributes: ['position', 'normal', 'uv'], uniforms: ['world', 'worldViewProjection', 'time', 'power', 'eye'], needAlphaBlending: true });
    m.alphaMode = Constants.ALPHA_ADD; m.disableDepthWrite = true; m.backFaceCulling = false; m.setFloat('power', 0);
    m.onBindObservable.add(() => { const c = scene.activeCamera; if (c) m.setVector3('eye', c.globalPosition); m.setFloat('time', this.age); });
    jet.material = m;

    // Flames boiling up where the jet strikes the ground.
    const tex = this.flameTexture = new DynamicTexture('nihilister-flame', { width: 64, height: 64 }, scene, true);
    const c = tex.getContext() as CanvasRenderingContext2D;
    for (let i = 0; i < 5; i++) {
      const g = c.createRadialGradient(32 + Math.sin(i * 2.1) * 7, 38 - i * 3, 1, 32, 34, 30 - i * 3);
      g.addColorStop(0, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g; c.fillRect(0, 0, 64, 64);
    }
    tex.hasAlpha = true; tex.update();
    const fire = this.flames = new ParticleSystem('nihilister-breath-fire', 260, scene);
    fire.particleTexture = tex; fire.blendMode = ParticleSystem.BLENDMODE_ADD; fire.emitter = this.ground;
    const h = GIANT_TRAIL_WIDTH * .4;
    fire.minEmitBox = new Vector3(-h, 0, -h); fire.maxEmitBox = new Vector3(h, .5, h);
    fire.minSize = 1.4; fire.maxSize = 3; fire.minLifeTime = .35; fire.maxLifeTime = .8; fire.emitRate = BREATH_RATE;
    fire.direction1 = new Vector3(-1, 4, -1); fire.direction2 = new Vector3(1, 7, 1); fire.minEmitPower = 1; fire.maxEmitPower = 2;
    fire.minAngularSpeed = -2; fire.maxAngularSpeed = 2;
    fire.addColorGradient(0, new Color4(1, .95, .7, .9)); fire.addColorGradient(.25, new Color4(1, .55, .12, .8));
    fire.addColorGradient(.7, new Color4(.8, .15, .02, .35)); fire.addColorGradient(1, new Color4(.2, .03, 0, 0));
    fire.addSizeGradient(0, .6); fire.addSizeGradient(1, 1.8);
    fire.start();
  }

  private placeJet(from: Vector3, to: Vector3, on: number): void {
    const jet = this.jet; if (!jet) return;
    const axis = from.subtract(to), len = axis.length();
    jet.position.copyFrom(to).addInPlace(from).scaleInPlace(.5);
    Quaternion.FromUnitVectorsToRef(Vector3.Up(), axis.scaleInPlace(1 / Math.max(len, .001)), jet.rotationQuaternion!);
    jet.scaling.set(GIANT_TRAIL_WIDTH * .45, len, GIANT_TRAIL_WIDTH * .45);
    this.jetMaterial?.setFloat('power', on * ease((this.age - LAUNCH_AT) / .2));
    if (this.flames) this.flames.emitRate = BREATH_RATE * on;
  }

  private stopBreath(): void {
    this.jet?.dispose(); this.jet = null;
    this.jetMaterial?.dispose(); this.jetMaterial = null;
    // Let the last flames burn out rather than vanish.
    const fire = this.flames; if (fire) { fire.emitter = this.ground.clone(); fire.stop(); fire.disposeOnStop = true; this.flames = null; }
    this.flameTexture = null; // the stopped system disposes it with itself
  }

  // --- caption --------------------------------------------------------------------------
  /** Place her line over her. main.ts calls this after the camera has moved this frame. */
  layout(): void {
    if (!this.caption || !this.boss) return;
    const r = this.boss.root.position;
    const p = this.ctx.toScreen(r.x, r.y + 30 * SCALE * .55, r.z);
    // She is tall: keep the line on screen when her head is above the top edge.
    const x = Math.min(innerWidth - 220, Math.max(220, p.x)), y = Math.min(innerHeight * .55, Math.max(90, p.y));
    this.caption.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) translate(-50%,-100%)`;
  }
  private updateCaption(a: number): void {
    const c = this.caption; if (!c || a < 0) return;
    c.style.opacity = String(a < LINE_TIME ? ease(a / .2) : 1 - ease((a - LINE_TIME) / .4));
    if (a > LINE_TIME + .4) { c.remove(); this.caption = null; }
  }
  private captionElement(text: string): HTMLDivElement {
    const el = document.createElement('div');
    el.className = 'egg-caption';
    el.textContent = text;
    Object.assign(el.style, {
      position: 'absolute', left: '0', top: '0', pointerEvents: 'none', whiteSpace: 'pre', opacity: '0',
      font: 'italic 700 30px Rajdhani, sans-serif', letterSpacing: '.1em', color: '#fff1d6',
      textShadow: '0 0 10px #ff6a1a, 0 0 22px #c41a00, 0 0 2px #000',
    });
    this.ctx.hud.append(el);
    return el;
  }

  private dropBoss(): void {
    this.clearWarning();
    this.token++;
    this.stopBreath();
    const b = this.boss;
    if (b) {
      for (const g of b.groups.values()) g.dispose();
      b.root.dispose(false, true);
    }
    this.boss = null; this.trail = null;
    this.age = -1;
  }
  private clear(): void {
    this.dropBoss();
    this.caption?.remove(); this.caption = null;
  }
  dispose(): void {
    this.enabled = false; this.clear();
    this.warnings.dispose();
    void this.container?.then((c) => c?.dispose());
    this.container = null;
  }
}

/** Test Lab "Events" section: drop a giant meteor now. */
export function mountNihilisterEggLab(egg: NihilisterEgg, giant: () => boolean, toCaldera: () => void): HTMLElement {
  const panel = document.createElement('div');
  panel.className = 'egg-lab';
  panel.innerHTML = `<h3>Nihilister's meteor</h3>
    <p data-status></p>
    <div class="weather-presets">
      <button type="button" data-act="giant">Drop giant meteor</button>
      <button type="button" data-act="caldera">Load Ashen Caldera</button>
    </div>`;
  const status = panel.querySelector<HTMLElement>('[data-status]')!;
  const sync = (note = '') => { status.textContent = note || (egg.active ? 'A giant meteor arrives every 2 minutes.' : 'Only runs on the Ashen Caldera. Load it below.'); };
  panel.addEventListener('pointerdown', (e) => e.stopPropagation());
  panel.addEventListener('click', (e) => {
    const act = (e.target as HTMLElement).closest<HTMLButtonElement>('button')?.dataset.act;
    if (act === 'caldera') toCaldera();
    if (act === 'giant') return sync(egg.busy ? 'She is already out.' : giant() ? '' : 'No room for the crater here; move toward open ground.');
    sync();
  });
  sync();
  return panel;
}
