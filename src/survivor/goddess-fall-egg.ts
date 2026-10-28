// Haunted Pine Forest easter egg: the Goddess Fall unlock.
//
//   1. lamp     one random lamp flickers now and then; shoot (or slash) it
//   2. ghost    Nihilister's ghost rises, whispers "Lilith's... Body...", dies and fades
//   3. grave    shoot one random churchyard gravestone
//   4. pumpkin  a pumpkin pops out; walk over it to take it (pumpkin icon by RADAR)
//   5. vial     take the Vapaus Vial in the woodcutter's cabin (screen glitch, vial icon)
//   6. altar    step into the stone circle: the cutscene
//   7. done     Goddess Fall Mode is saved as unlocked
//
// The Test Lab's Events tab steps back and forward through these on any forest run.

import { Color3, Material, MaterialPluginBase, MeshBuilder, StandardMaterial, TransformNode, Vector3, type Mesh, type Scene, type ShadowGenerator, type UniversalCamera } from '@babylonjs/core';
import { audioEngine } from '../audio/audio-engine';
import { playPlaylist } from '../audio/music-control';
import { BATTLE_TRACKS, UI, type Track } from '../audio/sound-bank';
import { Chibi, loadChibiIndex } from '../chibi';
import { saveSetting } from '../settings-store';
import { GODDESS_FALL_KEY } from '../goddess-fall-unlock';
export { GODDESS_FALL_KEY, goddessFallUnlocked } from '../goddess-fall-unlock';
import type { Atmosphere } from './atmosphere';
import type { SurvivorCamera } from './camera';
import { forestPlacements } from './forest-layout';
import { createJackOLantern } from './jack-o-lantern';
import { createVapausVial } from './vapaus-vial';
import { mountUnderUi } from './fire-vignette';
import type { ScreenPoint } from './hud';
import type { SurvivorInput } from './input';
import type { Player } from './player';
import type { ShotShield, TargetField } from './targets';
import type { Vfx } from './vfx';

export const EGG_STEPS = ['lamp', 'ghost', 'grave', 'pumpkin', 'vial', 'altar', 'cutscene', 'done'] as const;
export type EggStep = typeof EGG_STEPS[number];
const STEP_LABELS: Record<EggStep, string> = {
  lamp: 'Hit the flickering lamp', ghost: 'Nihilister\'s ghost', grave: 'Hit the marked gravestone',
  pumpkin: 'Take the pumpkin', vial: 'Take the Vapaus Vial (cabin)', altar: 'Enter the altar circle',
  cutscene: 'Altar cutscene', done: 'Goddess Fall Mode unlocked',
};

const NIHILISTER = 'c261_00', LILIWEISS = 'c5029_00';
/** shot speeds in m/s (snow-white/weapon.ts SPEED, RAPUNZEL_ROCKET_SPEED), for timing an aimed hit */
const SHOT_SPEED: Record<string, number> = { 'snow-white': 31, rapunzel: 18 };
/** each NIKKE's line once the cutscene hands control back */
const CLOSING_LINES: Record<string, string> = {
  scarlet: 'What ruin hath mine own hands wrought?',
  rapunzel: 'No... the dead should stay dead...',
  'snow-white': "Soon, you'll have your final rest...",
};
const REVEAL_TRACK: Track = { url: 'assets/audio/music/liliweiss-reveal.mp3', title: 'Liliweiss Reveal', volume: .27 };
/** cutscene seconds: the offering appears, the strike, the bolt behind her, the cut to red */
const ITEMS_AT = 3.4, STRIKE_AT = 5.6, BACKLIGHT_AT = 10.6, CUT_AT = 16.6;
/** shot start times: arrival, offering, strike, reveal (holds on her face), reaction, face-off (then the cut to red) */
const SHOTS: readonly number[] = [0, 3.2, 5.2, 6.6, 12.4, 14.6];

const PUMPKIN_ICON = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'><path d='M8 4.2c.3-1.4 1-2.2 2-2.5' stroke='%23597a2e' stroke-width='1.4' fill='none'/><ellipse cx='5.4' cy='9.6' rx='3.6' ry='4.4' fill='%23d9661c'/><ellipse cx='10.6' cy='9.6' rx='3.6' ry='4.4' fill='%23d9661c'/><ellipse cx='8' cy='9.6' rx='3.4' ry='4.8' fill='%23f07f26'/></svg>`).replace(/%2523/g, '%23')}`;
const VIAL_ICON = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'><rect x='5.6' y='1' width='4.8' height='2.4' rx='.6' fill='%23a4adb6'/><rect x='5.2' y='3.2' width='5.6' height='11.6' rx='1.6' fill='%23cfe3ea' fill-opacity='.45' stroke='%23d8e6ea' stroke-width='.8'/><rect x='6' y='7' width='4' height='7' rx='1' fill='%23b00a1d'/></svg>`).replace(/%2523/g, '%23')}`;

interface Place { x: number; z: number; yaw: number; scale: number }
const placements = (asset: string): Place[] => forestPlacements().filter((p) => p.asset === asset);
const ease = (t: number): number => { const c = Math.max(0, Math.min(1, t)); return c * c * (3 - 2 * c); };
const flat = (a: { x: number; z: number }, b: { x: number; z: number }): number => Math.hypot(a.x - b.x, a.z - b.z);

/**
 * Ghost look on her own (PBR) materials: faces turned toward the camera thin out to almost
 * nothing while the silhouette burns red, so she reads as a glowing outline with her painted
 * detail showing faintly through. A depth pre-pass keeps the back of the model hidden.
 */
class GhostShade extends MaterialPluginBase {
  fade = 0;
  constructor(material: Material) { super(material, 'GoddessGhost', 220, {}, true, true); }
  override getUniforms() { return { ubo: [{ name: 'ghostFade', size: 1, type: 'float' }], fragment: 'uniform float ghostFade;' }; }
  override bindForSubMesh(b: import('@babylonjs/core').UniformBuffer): void { b.updateFloat('ghostFade', this.fade); }
  override getCustomCode(type: string): Record<string, string> | null {
    if (type !== 'fragment') return null;
    return {
      CUSTOM_FRAGMENT_BEFORE_FRAGCOLOR: `
        float ghostRim=pow(1.-clamp(abs(dot(normalize(normalW),normalize(viewDirectionW))),0.,1.),2.);
        float ghostLuma=dot(finalColor.rgb,vec3(.2126,.7152,.0722));
        vec3 ghostBody=mix(finalColor.rgb,vec3(ghostLuma)*vec3(1.,.6,.6),.35);
        finalColor.rgb=mix(ghostBody,vec3(1.,.22,.2),ghostRim*.8)+vec3(.3,.04,.04)*ghostRim;
        finalColor.a*=ghostFade*mix(.38,1.,ghostRim);
      `,
    };
  }
}

export interface EggContext {
  scene: Scene;
  shadows: ShadowGenerator;
  vfx: Vfx;
  targets: TargetField;
  player: Player;
  camera: SurvivorCamera;
  atmosphere: Atmosphere;
  input: SurvivorInput;
  toScreen(x: number, y: number, z: number): ScreenPoint;
  refreshUnits(): void;
  /** the HUD root, hidden for the cutscene */
  hud: HTMLElement;
  /** the RADAR label the carried-item icon sits beside */
  radarLabel: HTMLElement | null;
  /** the playable NIKKE, for her own closing line */
  characterId: string;
  /** true while the lift moves or carries the player; the cutscene waits for it */
  liftBusy(): boolean;
  /** hold the lift still while the cutscene owns the player */
  lockLift(locked: boolean): void;
}

export class GoddessFallEgg {
  step: EggStep = 'lamp';
  /** Raptures, the run clock and the kit hold still (the cutscene). */
  get freezesWorld(): boolean { return this.cutsceneRunning; }
  /** where the player looks during the cutscene; null otherwise */
  aim: Vector3 | null = null;
  onStep: ((step: EggStep) => void) | null = null;

  private enabled = false;
  private readonly root: TransformNode;
  private readonly lamp: Place;
  private readonly lantern: Vector3;
  private readonly grave: Place;
  private readonly cabin: Place;
  private readonly altar: Place;
  private readonly altarTop: number;
  private readonly lampCover: Mesh;
  /** the lamp's light after it has been struck: red for the rest of the event */
  private readonly lampRed: Mesh;
  private backlit = false;
  private squaredOff = false;
  /** the cutscene was asked for while the lift was busy; it starts once the lift is free */
  private cutsceneWaiting = false;
  private cutsceneRunning = false;
  private flickerIn = 3;
  private flickerAge = 99;
  private shield: ShotShield | null = null;
  private wasSwinging = false;
  /** seconds until an aimed gun shot counts as landing; negative when none is in flight */
  private pendingHit = -1;
  private areaListener: ((test: (x: number, z: number, r: number) => boolean) => void) | null = null;
  private pumpkin: TransformNode | null = null;
  private pumpkinAge = 0;
  private readonly pumpkinFrom = new Vector3();
  private readonly pumpkinTo = new Vector3();
  private vial: TransformNode | null = null;
  private icon: HTMLImageElement | null = null;
  private ghost: Chibi | null = null;
  private ghostAge = 0;
  private ghostGlow = 0;
  /** her own blended copies of the model's materials (the originals alpha-test, which ignores fading) */
  private ghostMaterials: Material[] = [];
  private ghostShades: (GhostShade & { material: Material })[] = [];
  private caption: HTMLDivElement | null = null;
  /** the player's own line over their head; survives step changes */
  private bark: { el: HTMLDivElement; age: number; delay: number } | null = null;
  private lili: Chibi | null = null;
  private altarItems: TransformNode[] = [];
  private cut = 0;
  private cutPhase = 0;
  private overlay: HTMLDivElement | null = null;
  private readonly camFrom = new Vector3();
  private readonly camLook = new Vector3();
  private token = 0;

  constructor(private readonly ctx: EggContext) {
    const pick = <T>(list: T[]): T => list[Math.floor(Math.random() * list.length)];
    // Any lamp but the two lighting the lift clearing.
    this.lamp = pick(placements('forest-lamp').filter((p) => Math.hypot(p.x, p.z) > 12));
    this.lantern = new Vector3(this.lamp.x + Math.cos(this.lamp.yaw) * .55 * this.lamp.scale, 1.72 * this.lamp.scale, this.lamp.z - Math.sin(this.lamp.yaw) * .55 * this.lamp.scale);
    this.grave = pick(placements('forest-grave'));
    this.cabin = placements('forest-cabin')[0];
    this.altar = placements('forest-altar')[0];
    this.altarTop = 1.14 * this.altar.scale;
    this.root = new TransformNode('goddess-fall-egg', ctx.scene);
    // An iron shutter over the lamp's ghost-light: shown, the lamp reads as guttered out.
    const cover = this.lampCover = MeshBuilder.CreateBox('egg-lamp-cover', { width: .29, height: .37, depth: .29 }, ctx.scene);
    const dark = new StandardMaterial('egg-lamp-cover', ctx.scene);
    dark.diffuseColor = new Color3(.05, .06, .06); dark.specularColor = Color3.Black();
    cover.material = dark; cover.parent = this.root; cover.isPickable = false;
    cover.position.copyFrom(this.lantern); cover.rotation.y = this.lamp.yaw; cover.scaling.setAll(this.lamp.scale);
    cover.setEnabled(false);
    const red = this.lampRed = MeshBuilder.CreateBox('egg-lamp-red', { width: .3, height: .38, depth: .3 }, ctx.scene);
    const blood = new StandardMaterial('egg-lamp-red', ctx.scene);
    blood.diffuseColor = new Color3(.4, 0, 0); blood.emissiveColor = new Color3(1, .06, .04); blood.specularColor = Color3.Black(); blood.disableLighting = true;
    red.material = blood; red.parent = this.root; red.isPickable = false;
    red.position.copyFrom(this.lantern); red.rotation.y = this.lamp.yaw; red.scaling.setAll(this.lamp.scale);
    red.setEnabled(false);
    this.root.setEnabled(false);
  }

  get label(): string { return STEP_LABELS[this.step]; }
  /** the current objective's ground position, for the lab's teleport */
  get objective(): { x: number; z: number } {
    switch (this.step) {
      case 'lamp': case 'ghost': return { x: this.lamp.x - Math.sin(this.lamp.yaw) * 4, z: this.lamp.z - Math.cos(this.lamp.yaw) * 4 };
      case 'grave': return { x: this.grave.x, z: this.grave.z - 4 };
      case 'pumpkin': return { x: this.pumpkinTo.x, z: this.pumpkinTo.z - 1.5 };
      case 'vial': return { x: this.cabin.x - 1, z: this.cabin.z };
      default: return { x: this.altar.x + 9, z: this.altar.z };
    }
  }

  /** Only the Haunted Pine Forest hosts the egg. */
  setEnabled(enabled: boolean): void {
    if (enabled === this.enabled) return;
    this.enabled = enabled;
    this.root.setEnabled(enabled);
    this.goTo('lamp', true);
  }
  get active(): boolean { return this.enabled; }

  /** Jump to a step: clears everything in flight, then sets up that step's world state. */
  goTo(step: EggStep, quiet = false): void {
    this.token++;
    this.clear();
    this.step = step;
    const at = EGG_STEPS.indexOf(step);
    if (this.enabled) {
      if (at >= EGG_STEPS.indexOf('pumpkin') && at < EGG_STEPS.indexOf('vial')) this.dropPumpkin(true);
      if (at > EGG_STEPS.indexOf('pumpkin') && at <= EGG_STEPS.indexOf('vial')) this.setIcon(PUMPKIN_ICON);
      if (step === 'vial') this.placeVial();
      if (at > EGG_STEPS.indexOf('vial') && at < EGG_STEPS.indexOf('done')) this.setIcon(VIAL_ICON);
      if (step === 'lamp' || step === 'grave') this.armShield(step);
      if (at > 0) {
        // Struck: the ghost-green light turns red and stays that way.
        this.lampRed.setEnabled(true);
        Object.assign(this.ctx.atmosphere.lanternDim, { at: this.lantern, factor: 1, red: true });
      }
      if (step === 'ghost') void this.raiseGhost();
      if (step === 'cutscene') { if (this.ctx.liftBusy()) this.cutsceneWaiting = true; else this.startCutscene(); }
      if (step === 'done') this.unlock();
    }
    if (!quiet) this.onStep?.(step);
  }

  update(dt: number): void {
    if (!this.enabled) return;
    const player = this.ctx.player;
    if (this.step === 'lamp') this.flicker(dt);
    if (this.step === 'lamp' || this.step === 'grave') {
      this.checkMelee();
      if (this.pendingHit >= 0 && (this.pendingHit -= dt) < 0) this.struck();
    }
    if (this.step === 'ghost') this.updateGhost(dt);
    if (this.step === 'pumpkin' && this.pumpkin) {
      this.pumpkinAge += dt;
      const t = Math.min(1, this.pumpkinAge / .7), p = this.pumpkin.position;
      Vector3.LerpToRef(this.pumpkinFrom, this.pumpkinTo, t, p);
      p.y = this.pumpkinTo.y + Math.sin(t * Math.PI) * 1.4 + (t >= 1 ? Math.sin(this.pumpkinAge * 2.4) * .04 : 0);
      this.pumpkin.rotation.y += dt * (t < 1 ? 9 : .6);
      if (t >= 1 && player.hp > 0 && flat(player.position, p) < 1.2) {
        player.hp = Math.min(player.maxHp, player.hp + player.maxHp * .25);
        this.pickupFlash(p, [1, .55, .15]);
        this.goTo('vial');
        this.speak('...');
      }
    }
    if (this.step === 'vial' && this.vial) {
      this.vial.rotation.y += dt * .8;
      this.vial.position.y = .22 + Math.sin(performance.now() / 600) * .03;
      if (player.hp > 0 && flat(player.position, this.vial.position) < 1.1) {
        this.pickupFlash(this.vial.position, [.85, .05, .12]);
        this.vialGlitch();
        this.goTo('altar');
        this.speak('Commander...?', .5);
      }
    }
    if (this.step === 'altar' && player.hp > 0 && !this.ctx.liftBusy() && flat(player.position, this.altar) < 7.2) this.goTo('cutscene');
    if (this.step === 'cutscene' && this.cutsceneWaiting && !this.ctx.liftBusy()) { this.cutsceneWaiting = false; this.startCutscene(); }
    if (this.step === 'cutscene' && this.cutsceneRunning) this.updateCutscene(dt);
    this.updateBark(dt);
  }

  // --- 1. the flickering lamp ---------------------------------------------------------
  private flicker(dt: number): void {
    this.flickerIn -= dt; this.flickerAge += dt;
    if (this.flickerIn <= 0) { this.flickerAge = 0; this.flickerIn = 4 + Math.random() * 5; }
    // A burst of stutters, then steady again until the next one.
    const a = this.flickerAge;
    const off = a < 1.1 && Math.sin(a * 41) * Math.sin(a * 17 + 1) > .1;
    this.lampCover.setEnabled(off);
    this.ctx.atmosphere.lanternDim.at = this.lantern;
    this.ctx.atmosphere.lanternDim.factor = off ? .05 : a < 1.1 ? .6 : 1;
  }
  private armShield(step: 'lamp' | 'grave'): void {
    // The gravestone's stone stands 0.6 m in front of its origin (range-collision.ts).
    const g = this.grave;
    const center = step === 'lamp' ? new Vector3(this.lamp.x, 0, this.lamp.z)
      : new Vector3(g.x - Math.sin(g.yaw) * .6 * g.scale, 0, g.z - Math.cos(g.yaw) * .6 * g.scale);
    this.shield = { center, radius: step === 'lamp' ? .9 : 1.3, up: true, block: () => this.struck() };
    this.ctx.targets.shields.add(this.shield);
    // Any blast, slash, cone or beam that reaches it counts too, not just a direct hit.
    const shield = this.shield;
    this.areaListener = (test) => { if (this.shield === shield && test(center.x, center.z, shield.radius)) this.struck(); };
    this.ctx.targets.areaListeners.add(this.areaListener);
  }
  /**
   * Shots can be stopped by neighbouring graves and fences, and Scarlet's sword never crosses a
   * shield, so an attack also counts when the cursor is on the object (within range) or, for a
   * melee kit, when it is swung toward the object up close.
   */
  private checkMelee(): void {
    const swinging = this.ctx.input.isHeld('fire');
    const started = swinging && !this.wasSwinging; this.wasSwinging = swinging;
    if (!started || !this.shield) return;
    const player = this.ctx.player, p = player.position, c = this.shield.center;
    const melee = !!player.kit.weapon.melee, d = flat(p, c);
    const aimed = flat(player.aim, c) < this.shield.radius + .3 && d < (melee ? 3.8 : 16);
    const toward = Math.atan2(c.x - p.x, c.z - p.z) - player.aimYaw;
    const swing = melee && d < 3.8 && Math.abs(Math.atan2(Math.sin(toward), Math.cos(toward))) < 1.3;
    if (swing || (aimed && melee)) { this.struck(); return; }
    // A gun's shot counts when it would have arrived, never before the projectile visibly lands.
    // A real hit on the shield usually gets there first and clears this.
    if (aimed && this.pendingHit < 0) this.pendingHit = d / (SHOT_SPEED[this.ctx.characterId] ?? 30) * 1.2 + .08;
  }
  private struck(): void {
    if (this.step === 'lamp') {
      this.ctx.vfx.flashSprite(this.lantern.clone(), [.3, 1, .7], 1.6, .5, .9);
      this.goTo('ghost');
    } else if (this.step === 'grave') {
      this.goTo('pumpkin');
      this.pumpkin?.dispose();
      this.dropPumpkin(false);
    }
  }

  // --- 2. Nihilister's ghost --------------------------------------------------------------
  private async raiseGhost(): Promise<void> {
    const token = this.token;
    const index = await loadChibiIndex();
    const chibi = await Chibi.load(this.ctx.scene, index.variants[NIHILISTER]).catch(() => null);
    if (!chibi) return;
    if (token !== this.token) { chibi.dispose(); return; }
    this.ghost = chibi; this.ghostAge = 0;
    chibi.root.parent = this.root;
    // She hovers on top of the lamp post.
    chibi.root.position.set(this.lamp.x, 0, this.lamp.z);
    for (const m of chibi.meshes) {
      // Her model loads with its own materials: fade those directly so her shading and
      // detail stay intact. Blend on top of the cutout; the depth pre-pass keeps one shell.
      const ghost = m.material;
      if (!ghost) continue;
      ghost.transparencyMode = Material.MATERIAL_ALPHATESTANDBLEND;
      ghost.needDepthPrePass = true;
      if (!this.ghostShades.some((g) => g.material === ghost)) this.ghostShades.push(Object.assign(new GhostShade(ghost), { material: ghost }));
      m.metadata = { ...(m.metadata ?? {}), skipFogDepth: true };
      if (!this.ghostMaterials.includes(ghost)) this.ghostMaterials.push(ghost);
    }
    this.ctx.refreshUnits();
    chibi.play('idle', { loop: true });
  }
  private updateGhost(dt: number): void {
    const g = this.ghost; if (!g) return;
    const a = this.ghostAge += dt, p = this.ctx.player.position;
    g.root.rotation.y = Math.atan2(p.x - g.root.position.x, p.z - g.root.position.z);
    g.setLift(2.7 * this.lamp.scale + Math.sin(a * 1.6) * .12);
    g.update(dt);
    // Fade in, whisper, die and fade out across the death clip.
    // Fade in, then speak, then die and fade out across the death clip.
    const talkAt = 1.6, dieAt = 4.8, deathTime = g.meta.clips.death?.duration ?? 1.9;
    const shown = a < dieAt ? ease(a / 1.5) : 1 - ease((a - dieAt) / deathTime);
    for (const shade of this.ghostShades) shade.fade = shown;
    // Out of the mist's depth while faint (no hard silhouette popping in); back in once she is
    // mostly solid, or the mist draws over her as if she were the ground behind.
    for (const m of g.meshes) if (m.metadata) m.metadata.skipFogDepth = shown < .6;
    // A faint red ghost glow (it also lights the mist). Long, overlapping sprites keep it steady:
    // short ones strobed the fog light.
    if ((this.ghostGlow -= dt) <= 0 && shown > .02) {
      this.ghostGlow = .15;
      this.ctx.vfx.flashSprite(g.root.position.add(new Vector3(0, 2.7 * this.lamp.scale + .8, 0)), [1, .18, .14], 2.2, .9, shown * .22);
    }
    if (a >= talkAt && a < dieAt && !this.caption) this.say('Lilith\'s... Body...');
    if (this.caption) {
      this.caption.style.opacity = a < dieAt ? String(ease((a - talkAt) / .6)) : String(1 - ease((a - dieAt) / .5));
    }
    if (a >= dieAt && g.current !== 'death') g.play('death', { loop: false });
    if (a >= dieAt + deathTime + .2) this.goTo('grave');
  }
  /**
   * Place the floating lines. main.ts calls this after the camera has moved this frame;
   * placing them earlier used the previous view and made them jitter while walking.
   */
  layout(): void {
    const g = this.ghost;
    if (this.caption && g) {
      const head = g.root.position;
      const s = this.ctx.toScreen(head.x, head.y + 2.7 * this.lamp.scale + 2.4, head.z);
      this.caption.style.transform = `translate(${s.x.toFixed(1)}px,${s.y.toFixed(1)}px) translate(-50%,-100%)`;
    }
    if (this.bark) {
      // Well clear of the overhead name and health bar.
      const p = this.ctx.player.position, s = this.ctx.toScreen(p.x, p.y + 4.1, p.z);
      this.bark.el.style.transform = `translate(${s.x.toFixed(1)}px,${s.y.toFixed(1)}px) translate(-50%,-100%)`;
    }
  }
  /** A line over the player's head in the ghost's whisper style, after `delay` seconds. */
  private speak(text: string, delay = 0): void {
    this.bark?.el.remove();
    this.bark = { el: this.captionElement(text), age: 0, delay };
  }
  private updateBark(dt: number): void {
    const b = this.bark; if (!b) return;
    const a = (b.age += dt) - b.delay;
    b.el.style.opacity = String(a < 0 ? 0 : a < 2.2 ? ease(a / .4) : 1 - ease((a - 2.2) / .5));
    if (a > 2.7) { b.el.remove(); this.bark = null; }
  }
  private say(text: string): void {
    this.caption = this.captionElement(text);
  }
  private captionElement(text: string): HTMLDivElement {
    const el = document.createElement('div');
    el.className = 'egg-caption';
    el.textContent = text;
    Object.assign(el.style, {
      position: 'absolute', left: '0', top: '0', pointerEvents: 'none', whiteSpace: 'nowrap', opacity: '0',
      font: 'italic 600 18px Rajdhani, sans-serif', letterSpacing: '.08em', color: '#d9e2ff',
      textShadow: '0 0 8px #7f8cff, 0 0 2px #000',
    });
    this.ctx.hud.append(el);
    return el;
  }

  // --- 3–5. pumpkin and vial ---------------------------------------------------------------
  private dropPumpkin(landed: boolean): void {
    const node = this.pumpkin = createJackOLantern(this.ctx.scene);
    node.parent = this.root; node.scaling.setAll(.45);
    for (const m of node.getChildMeshes()) this.ctx.shadows.addShadowCaster(m);
    // Out of the grave toward the path in front of it.
    this.pumpkinFrom.set(this.grave.x, .3, this.grave.z);
    this.pumpkinTo.set(this.grave.x, .02, this.grave.z - 1.8);
    node.position.copyFrom(landed ? this.pumpkinTo : this.pumpkinFrom);
    this.pumpkinAge = landed ? 1 : 0;
    if (!landed) {
      this.ctx.vfx.ring(this.pumpkinFrom.clone(), [.5, .42, .32], .3, 2.2, .6, .6);
      for (let i = 0; i < 8; i++) this.ctx.vfx.flashSprite(this.pumpkinFrom.add(new Vector3(Math.cos(i * 2.4) * .6, .3 + (i % 3) * .2, Math.sin(i * 2.4) * .6)), [.45, .36, .26], .7, .6, .8, 'spark');
    }
  }
  private placeVial(): void {
    const node = this.vial = createVapausVial(this.ctx.scene);
    // Twice its 14 cm so it can be spotted on the cabin floor, with a faint red glint.
    node.parent = this.root; node.scaling.setAll(2);
    node.position.set(this.cabin.x, .22, this.cabin.z);
  }
  private pickupFlash(at: Vector3, color: [number, number, number]): void {
    audioEngine.play(UI.select);
    this.ctx.vfx.flashSprite(at.clone().addInPlaceFromFloats(0, .4, 0), color, 1.4, .4, .9);
    this.ctx.vfx.ring(at.clone(), color, .2, 1.4, .45, .7);
  }
  private setIcon(url: string | null): void {
    if (!url) { this.icon?.remove(); this.icon = null; return; }
    const label = this.ctx.radarLabel; if (!label) return;
    if (!this.icon) {
      const img = this.icon = document.createElement('img');
      img.className = 'egg-radar-icon'; img.alt = '';
      Object.assign(img.style, { position: 'absolute', width: '1em', height: '1em', right: '100%', top: '50%', transform: 'translate(-1.6em,-50%)', opacity: '.8', pointerEvents: 'none' });
      label.style.position ||= 'absolute';
      label.append(img);
    }
    this.icon.src = url;
  }
  /**
   * The vial pickup's short, hard RGB-split stutter. The view is zoomed in a little while it
   * jolts, so its shifts and skews never expose an edge.
   */
  private vialGlitch(): void {
    const canvas = document.getElementById('game'); if (!canvas) return;
    canvas.animate([
      { filter: 'none', transform: 'none' },
      { filter: 'hue-rotate(90deg) saturate(3) contrast(1.4)', transform: 'scale(1.08) translate(6px,-2px) skewX(4deg)' },
      { filter: 'invert(.85) hue-rotate(180deg)', transform: 'scale(1.08) translate(-8px,3px)' },
      { filter: 'saturate(4) hue-rotate(-60deg)', transform: 'scale(1.08) translate(3px,0) skewX(-6deg)' },
      { filter: 'contrast(2) brightness(1.4)', transform: 'scale(1.08) translate(-2px,-3px)' },
      { filter: 'none', transform: 'none' },
    ], { duration: 420, easing: 'steps(6)' });
  }
  /**
   * A signal-loss glitch over the whole game view, under the HUD: fine rolling scanlines and a
   * brief contrast and brightness flicker. The canvas itself never moves.
   */
  private glitch(duration = 420): void {
    const canvas = document.getElementById('game'); if (!canvas) return;
    canvas.animate([
      { filter: 'none' }, { filter: 'contrast(1.4) saturate(1.5)' }, { filter: 'brightness(1.4) contrast(1.2)' },
      { filter: 'saturate(.4) contrast(1.4)' }, { filter: 'none' }, { filter: 'brightness(1.3)' }, { filter: 'none' },
    ], { duration, easing: `steps(${Math.max(6, Math.round(duration / 60))})` });
    const layer = document.createElement('div');
    layer.className = 'egg-signal-glitch';
    mountUnderUi(layer);
    Object.assign(layer.style, { overflow: 'hidden', background: 'repeating-linear-gradient(0deg, #0000 0 2px, #00000038 2px 3px)' });
    layer.animate([{ backgroundPosition: '0 0' }, { backgroundPosition: '0 30px' }], { duration: 160, iterations: Infinity });
    layer.animate([{ opacity: 1 }, { opacity: 1, offset: .8 }, { opacity: 0 }], { duration, fill: 'forwards' }).finished.then(() => layer.remove(), () => layer.remove());
  }

  // --- 6. the altar cutscene --------------------------------------------------------------
  private startCutscene(): void {
    const { player, camera, hud } = this.ctx;
    this.cutsceneRunning = true;
    this.ctx.lockLift(true);
    this.cut = 0; this.cutPhase = 0; this.backlit = false; this.squaredOff = false;
    // Stand the player on a fixed mark facing the altar, so every shot frames the same way.
    // The slab's long sides face along its local Z: stand 2.4 m out on whichever side they came from.
    const side = Math.sign((player.position.x - this.altar.x) * Math.sin(this.altar.yaw) + (player.position.z - this.altar.z) * Math.cos(this.altar.yaw)) || 1;
    player.position.set(this.altar.x + Math.sin(this.altar.yaw) * 2.4 * side, player.position.y, this.altar.z + Math.cos(this.altar.yaw) * 2.4 * side);
    player.unstick();
    player.transported = true;
    this.camFrom.copyFrom(camera.camera.position);
    hud.style.visibility = 'hidden';
    void audioEngine.playMusic(REVEAL_TRACK);
    this.aim = new Vector3(this.altar.x, 1.1, this.altar.z);
    camera.override = (cam, dt) => this.placeCamera(cam, dt);
    void this.raiseLiliweiss(new Vector3(this.altar.x, this.altarTop, this.altar.z));
  }
  private updateCutscene(dt: number): void {
    const t = this.cut += dt;
    const me = this.ctx.player.position;
    // Locked in place, facing the altar.
    this.ctx.player.rig.legYaw = Math.atan2(this.altar.x - me.x, this.altar.z - me.z);
    const top = new Vector3(this.altar.x, this.altarTop, this.altar.z);
    if (this.cutPhase === 0 && t >= ITEMS_AT) {
      this.cutPhase = 1;
      // Keep both small so they sit on the slab side by side.
      const pumpkin = createJackOLantern(this.ctx.scene); pumpkin.scaling.setAll(.28);
      pumpkin.position.set(top.x, top.y, top.z - .45);
      const vial = createVapausVial(this.ctx.scene); vial.scaling.setAll(1.5);
      vial.position.set(top.x, top.y, top.z + .45);
      this.ctx.atmosphere.thunder(1.1);
      for (const n of [pumpkin, vial]) { n.parent = this.root; this.altarItems.push(n); this.ctx.vfx.flashSprite(n.position.clone().addInPlaceFromFloats(0, .2, 0), [.7, .8, 1], .9, .5, .8); }
    }
    if (this.cutPhase === 1 && t >= STRIKE_AT) {
      this.cutPhase = 2;
      // Deeper, with a stuttering reverb, while the screen glitches.
      this.ctx.atmosphere.processedThunder = true;
      this.ctx.atmosphere.strike({ x: top.x, z: top.z }, 1.25, true, .4);
      this.ctx.atmosphere.processedThunder = false;
      this.ctx.atmosphere.glitchedThunder();
      this.glitch(1100);
      this.ctx.camera.shake(.5, .6);
      this.ctx.vfx.ring(top.clone(), [.85, .9, 1], .3, 5, .8, 1);
      this.ctx.vfx.flashSprite(top.clone().addInPlaceFromFloats(0, .5, 0), [1, 1, 1], 5, .5, 1);
      for (const n of this.altarItems) n.dispose();
      this.altarItems = [];
      // She appears under the strike's flash (the sky shot hides the altar anyway).
      this.lili?.root.setEnabled(true);
    }
    if (!this.squaredOff && t >= SHOTS[4]) {
      // On the cut to the reaction, teleport the player further back for the last two shots, so
      // the face-off reads as the two squaring off. unstick() moves the model with them.
      this.squaredOff = true;
      const dx = me.x - this.altar.x, dz = me.z - this.altar.z, d = Math.hypot(dx, dz) || 1;
      me.set(this.altar.x + dx / d * 6, me.y, this.altar.z + dz / d * 6);
      this.ctx.player.unstick();
    }
    if (!this.backlit && t >= BACKLIGHT_AT) {
      // A second bolt beyond her while the camera holds on her face: she is lit from behind.
      this.backlit = true;
      const dx = this.altar.x - me.x, dz = this.altar.z - me.z, d = Math.hypot(dx, dz) || 1;
      this.ctx.atmosphere.strike({ x: this.altar.x + dx / d * 7 - dz / d * 1.5, z: this.altar.z + dz / d * 7 + dx / d * 1.5 }, 1.1, true, .25);
    }
    // She was loaded at the start of the scene and appears on the cut to the reveal.
    if (this.lili) {
      this.lili.setLift(this.altarTop + .35 + Math.sin(t * 1.4) * .06);
      this.lili.root.rotation.y = Math.atan2(me.x - this.altar.x, me.z - this.altar.z);
      this.lili.update(dt);
    }
    // Straight from the player's face to red: no lunge.
    if (this.cutPhase === 2 && t >= CUT_AT) { this.cutPhase = 4; this.showUnlocked(); }
    if (this.cutPhase === 4 && t >= CUT_AT + 5.5) {
      this.goTo('done');
      // Back in control, once the red has faded.
      this.speak(CLOSING_LINES[this.ctx.characterId] ?? 'What have I done...', .8);
    }
  }
  private async raiseLiliweiss(top: Vector3): Promise<void> {
    const token = this.token;
    const index = await loadChibiIndex();
    const chibi = await Chibi.load(this.ctx.scene, index.variants[LILIWEISS]).catch(() => null);
    if (!chibi) return;
    if (token !== this.token) { chibi.dispose(); return; }
    this.lili = chibi;
    chibi.root.setEnabled(this.cutPhase >= 2);
    // Pose her before she can be seen, so the first visible frame isn't the bind pose.
    chibi.update(0);
    chibi.root.parent = this.root;
    chibi.root.position.set(top.x, 0, top.z);
    for (const m of chibi.meshes) this.ctx.shadows.addShadowCaster(m);
    this.ctx.refreshUnits();
    chibi.play('talk_idle', { loop: true });
  }
  /**
   * A shot list with hard cuts (SHOTS): arrival, offering, strike, reveal, reaction, face-off.
   * Each shot is a slow move between two framings; `f` points from the player to the altar.
   */
  private placeCamera(cam: UniversalCamera, _dt: number): void {
    const P = this.ctx.player.position, t = this.cut;
    const A = new Vector3(this.altar.x, 0, this.altar.z);
    const f = A.subtract(new Vector3(P.x, 0, P.z)).normalize(), r = new Vector3(f.z, 0, -f.x);
    const at = (base: Vector3, fwd: number, side: number, up: number) => base.add(f.scale(fwd)).addInPlace(r.scale(side)).addInPlaceFromFloats(0, up, 0);
    const hover = this.altarTop + .35;
    const slab = at(A, 0, 0, this.altarTop), face = at(A, 0, 0, hover + 1.35);
    const chest = at(P, 0, 0, 1.05), mid = Vector3.Lerp(P, A, .5);
    let shot = 0; while (shot + 1 < SHOTS.length && t >= SHOTS[shot + 1]) shot++;
    const k = ease((t - SHOTS[shot]) / ((SHOTS[shot + 1] ?? t + 1) - SHOTS[shot]));
    let from: Vector3, to: Vector3, lookFrom: Vector3, lookTo: Vector3, tilt = k;
    switch (shot) {
      case 0: // Arrival: low side-on profile, the altar waiting ahead.
        from = at(P, .6, -5.2, 1.4); to = at(P, 1.2, -4.8, 1.3);
        lookFrom = at(P, 1, 0, .9); lookTo = at(P, 1.3, 0, .9); break;
      case 1: // Offering: close on the slab, slow push in as the items appear.
        from = at(A, -.6, -2.6, this.altarTop + 1.4); to = at(A, -.4, -2, this.altarTop + 1.1);
        lookFrom = lookTo = slab; break;
      case 2: // Strike: looking up into the night sky over the altar as the bolt tears down.
        // From the altar's far end, away from the player, so no hat or hair edges into the sky.
        from = at(A, .6, -3.4, 1); to = at(A, .5, -3.2, .95);
        lookFrom = at(A, 0, 0, 9); lookTo = at(A, 0, 0, 8); break;
      case 3: // Reveal: close on her, rising with the view from her feet to her face.
        // In front of her, between her and the player, so the face she turns on them is the payoff.
        // Kept a step clear of the player and to one side, so a wide hat stays out of frame.
        // The tilt finishes early, then holds on her face with a slow push in.
        from = at(A, -1.3, .8, hover + .15); to = at(A, -1.05, .6, hover + 1.4);
        lookFrom = at(A, 0, 0, hover + .1); lookTo = face; tilt = ease((t - SHOTS[3]) / 4); break;
      case 4: // Reaction: the player's face, almost head-on, as they look up at her.
        from = at(P, 2.05, -.55, 1.2); to = at(P, 1.9, -.47, 1.17);
        lookFrom = lookTo = chest.add(new Vector3(0, .15, 0)); break;
      default: // Face-off: wide profile of the two of them, still, before the cut to red.
        from = at(mid, -.3, 7.8, 2.2); to = at(mid, -.2, 7.4, 2.15);
        lookFrom = lookTo = at(mid, 0, 0, 1.7); break;
    }
    // The first shot eases in from the gameplay view instead of cutting.
    const blend = shot === 0 ? ease(t / 1.2) : 1;
    cam.position.copyFrom(Vector3.Lerp(this.camFrom, Vector3.Lerp(from, to, k), blend));
    this.camLook.copyFrom(Vector3.Lerp(lookFrom, lookTo, tilt));
    cam.setTarget(this.camLook);
  }
  private showUnlocked(): void {
    const el = this.overlay = document.createElement('div');
    el.className = 'egg-unlocked';
    el.innerHTML = '<i class="egg-red"></i><span>Goddess Fall Mode Unlocked</span>';
    Object.assign(el.style, {
      position: 'fixed', inset: '0', zIndex: '50', display: 'grid', placeItems: 'center', background: '#8a0010', overflow: 'hidden',
      font: '700 clamp(28px,4.4vw,64px) Rajdhani, sans-serif', letterSpacing: '.14em', textTransform: 'uppercase',
      color: '#ffe9ec', textShadow: '0 0 18px #ff3b55', pointerEvents: 'none',
    });
    if (!document.getElementById('egg-glitch-style')) {
      const style = document.createElement('style');
      style.id = 'egg-glitch-style';
      style.textContent = `
.egg-unlocked .egg-red { position: absolute; inset: 0; background: linear-gradient(180deg, #7a000e, #9a0014 48%, #6d000c); }
.egg-unlocked span { position: relative; opacity: 0; }`;
      document.head.append(style);
    }
    document.body.append(el);
    // Hard cut to red mid-punch, then the words fade in.
    el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 30, fill: 'forwards' });
    el.querySelector('span')!.animate([{ opacity: 0, letterSpacing: '.3em' }, { opacity: 1, letterSpacing: '.14em' }], { duration: 1200, delay: 900, fill: 'forwards', easing: 'ease-out' });
  }
  private unlock(): void {
    saveSetting(GODDESS_FALL_KEY, 'unlocked');
  }

  /** Remove whatever the current step put in the world and give back what the cutscene took. */
  private clear(): void {
    if (this.shield) { this.ctx.targets.shields.delete(this.shield); this.shield = null; }
    if (this.areaListener) { this.ctx.targets.areaListeners.delete(this.areaListener); this.areaListener = null; }
    this.pendingHit = -1;
    this.lampCover.setEnabled(false);
    this.lampRed.setEnabled(false);
    Object.assign(this.ctx.atmosphere.lanternDim, { at: null, factor: 1, red: false });
    this.pumpkin?.dispose(); this.pumpkin = null;
    this.vial?.dispose(); this.vial = null;
    this.ghost?.dispose(); this.ghost = null;
    for (const m of this.ghostMaterials) m.dispose();
    this.ghostMaterials = [];
    this.ghostShades = [];
    this.caption?.remove(); this.caption = null;
    this.lili?.dispose(); this.lili = null;
    for (const n of this.altarItems) n.dispose();
    this.altarItems = [];
    this.setIcon(null);
    this.cutsceneWaiting = false;
    if (this.step === 'cutscene' && this.cutsceneRunning) {
      this.cutsceneRunning = false;
      this.ctx.lockLift(false);
      const { player, camera, hud } = this.ctx;
      player.transported = false;
      camera.override = null;
      hud.style.visibility = '';
      this.aim = null;
      const overlay = this.overlay;
      overlay?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 600, fill: 'forwards' }).finished.then(() => overlay.remove(), () => overlay.remove());
      this.overlay = null;
      const tracks = Object.values(BATTLE_TRACKS).sort(() => Math.random() - .5);
      playPlaylist(tracks);
    }
  }

  dispose(): void { this.token++; this.clear(); this.bark?.el.remove(); this.root.dispose(); }
}
