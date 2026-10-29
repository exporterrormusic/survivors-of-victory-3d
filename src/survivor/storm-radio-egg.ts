import { Color3, MeshBuilder, StandardMaterial, Texture, TransformNode, Vector3, Vector4, type Scene, type ShadowGenerator } from '@babylonjs/core';
import { audioEngine } from '../audio/audio-engine';
import { type Cue } from '../audio/sound-bank';
import type { Player } from './player';
import type { ShotShield, TargetField } from './targets';
import type { Vfx } from './vfx';
import { type StormField } from './storm-field';
import { pickRadioLocations } from './storm-radio-locations';
import { StormFallenSquad } from './storm-fallen-squad';
import { DISTRESS_CALL, LAST_DISTRESS_CALL, FALLEN_LINES, lastDistressDistance } from './storm-radio-story';
import './storm-radio-egg.css';

export const RADIO_STEPS = ['waiting', 'crate', 'opening', 'radio', 'carrying', 'fallen', 'dissolve', 'done'] as const;
export type RadioStep = typeof RADIO_STEPS[number];
const LABELS: Record<RadioStep, string> = {
  waiting: 'Wait for the flood to recede', crate: 'Hit the washed-up Ark case', opening: 'Case opening',
  radio: 'Pick up the radio', carrying: 'Find good radio reception',
  fallen: 'Fallen Ark squad', dissolve: 'Golden farewell', done: 'Signal lost',
};
const RADIO_ICON = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M7 8 5 1" stroke="#b5f4ff" stroke-width="2"/><rect x="4" y="7" width="16" height="15" rx="3" fill="#243c47" stroke="#b5f4ff" stroke-width="1.5"/><rect x="7" y="10" width="10" height="3" rx="1" fill="#79edda"/><path d="M7 16h7m-7 3h7" stroke="#b5f4ff"/><circle cx="17" cy="17" r="1.5" fill="#ffcc76"/></svg>')}`;
const STATIC: Cue = { url: 'assets/audio/events/counters-radio.wav', volume: .16, voices: 1, gap: 1 };
const distance = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);
const ease = (n: number) => { const t = Math.max(0, Math.min(1, n)); return t * t * (3 - 2 * t); };
interface Context {
  scene: Scene; shadows: ShadowGenerator; targets: TargetField; player: Player; vfx: Vfx;
  field: StormField; hud: HTMLElement; radarLabel: HTMLElement | null;
  toScreen: (x: number, y: number, z: number) => { x: number; y: number };
  characterId: string;
  refreshUnits: () => void;
  softenRain: (soft: boolean) => void;
}

/** Once per map visit; all attack hooks and transient UI are removed on reset/map exit. */
export class StormRadioEgg {
  step: RadioStep = 'waiting';
  private enabled = false;
  private age = 0;
  private clock = 0;
  private previousPhase: StormField['phase'] = 'calm';
  private root: TransformNode | null = null;
  private lid: TransformNode | null = null;
  private radio: TransformNode | null = null;
  private materials: StandardMaterial[] = [];
  private shield: ShotShield | null = null;
  private listener: ((test: (x: number, z: number, pad: number) => boolean) => void) | null = null;
  private icon: HTMLImageElement | null = null;
  private caption: HTMLDivElement | null = null;
  private captionTime = 0;
  private captionDuration = 0;
  private fragment = 0;
  private approachStart = 0;
  private squad: StormFallenSquad | null = null;
  private glint = 0;
  readonly clearing = new Vector3();
  readonly crateAt = new Vector3();

  constructor(private readonly ctx: Context) {
    this.pickLocations();
  }
  private pickLocations(): void {
    const { crate, reception } = pickRadioLocations();
    this.crateAt.set(crate.x, 0, crate.z);
    this.clearing.set(reception.x, 0, reception.z);
  }
  get active(): boolean { return this.enabled; }
  get label(): string { return LABELS[this.step]; }
  get objective(): Vector3 { return ['carrying', 'fallen', 'dissolve', 'done'].includes(this.step) ? this.clearing : this.crateAt; }
  setEnabled(enabled: boolean): void {
    if (enabled === this.enabled) return;
    this.enabled = enabled;
    this.reset();
    if (enabled) audioEngine.preload([STATIC.url]);
  }
  reset(): void {
    this.clear(); this.step = 'waiting'; this.age = this.clock = this.fragment = 0;
    this.previousPhase = this.ctx.field.phase;
    if (this.enabled) this.pickLocations();
  }
  /** Lab controls use the same setup and transitions as normal play. */
  goTo(step: RadioStep): void {
    if (!this.enabled) return;
    if (step === 'waiting') { this.reset(); return; }
    const squad = ['fallen', 'dissolve'].includes(step) ? this.squad : null;
    if (squad) this.squad = null;
    this.clear(); this.squad = squad;
    this.age = 0; this.fragment = 0; this.step = step;
    if (['crate', 'opening', 'radio'].includes(step)) {
      this.makeCase(this.crateAt);
      if (step === 'crate') this.arm();
      else if (step === 'radio') { this.lid!.rotation.x = 2; this.radio!.position.y = 1.45; this.radio!.setEnabled(true); }
    }
    if (step === 'carrying') {
      this.setIcon(); this.approachStart = distance(this.ctx.player.position, this.clearing);
      this.prepareSquad();
    }
    if (step === 'fallen' || step === 'dissolve') {
      // The rain keeps its full volume through the ending.
      this.prepareSquad(); this.squad!.reveal();
    }
  }
  hit(): void {
    if (!this.enabled || this.step !== 'crate') return;
    this.disarm(); this.step = 'opening'; this.age = 0;
    this.ctx.vfx.ring(this.crateAt, [.45, .9, 1], .2, 2, .5, .6);
  }
  update(dt: number): void {
    if (!this.enabled || dt <= 0) return;
    this.clock += dt; this.age += dt;
    if (this.caption) {
      this.captionTime -= dt;
      this.caption.style.opacity = String(ease((this.captionDuration - this.captionTime) / .4) * ease(this.captionTime / .5));
      if (this.captionTime <= 0) { this.caption.remove(); this.caption = null; }
    }
    const phase = this.ctx.field.phase;
    if (this.step === 'waiting' && this.previousPhase === 'recede' && phase === 'calm') this.goTo('crate');
    this.previousPhase = phase;
    const p = this.ctx.player;
    if (p.hp <= 0 || p.transported) return;
    if (this.step === 'opening') {
      this.lid!.rotation.x = 2 * ease(this.age / .65);
      if (this.age > .3) {
        this.radio!.setEnabled(true);
        const t = Math.min(1, (this.age - .3) / .9);
        this.radio!.position.y = .45 + t + Math.sin(t * Math.PI) * .9;
        this.radio!.rotation.y = t * Math.PI * 2;
      }
      if (this.age >= 1.25) { this.step = 'radio'; this.age = 0; }
    } else if (this.step === 'radio') {
      this.radio!.position.y = 1.45 + Math.sin(this.clock * 3) * .1;
      this.radio!.rotation.y += dt * .7;
      if (distance(p.position, this.crateAt) < 2) this.goTo('carrying');
    } else if (this.step === 'carrying') {
      const d = distance(p.position, this.clearing);
      if (this.age > 2 && this.fragment === 0) { this.fragment++; this.say(DISTRESS_CALL, 4); audioEngine.play(STATIC); }
      else if (this.captionTime <= 0 && this.fragment === 1 && d < lastDistressDistance(this.approachStart)) {
        this.fragment++; this.say(LAST_DISTRESS_CALL, 3); audioEngine.play(STATIC);
      }
      // Finish the last transmission before revealing the bodies, even if the player rushes ahead.
      if (this.fragment === 2 && this.captionTime <= 0 && this.squad?.ready) this.goTo('fallen');
    } else if (this.step === 'fallen' || this.step === 'dissolve') {
      // Slow asset loads cannot skip the held death poses or farewell.
      if (!this.squad?.ready) { this.age = 0; return; }
      if (this.step === 'fallen') {
        // Any of the three bodies counts; the player needn't find an invisible central point.
        if (this.squad.near(p.position)) this.goTo('dissolve');
      }
      if (this.step === 'dissolve') {
        this.squad!.dissolve(this.age);
        if (this.age >= 5) {
          this.goTo('done');
          const line = FALLEN_LINES[this.ctx.characterId];
          if (line) this.say(line, 4, false);
        }
      }
    }
    if (['crate', 'radio'].includes(this.step) && (this.glint -= dt) <= 0) {
      this.glint = 2.2;
      this.ctx.vfx.flashSprite(this.objective.add(new Vector3(0, 1.3, 0)), [.45, .95, 1], .8, .7, .8, 'star');
    }
  }
  private material(name: string, color: [number, number, number], glow = false): StandardMaterial {
    const m = new StandardMaterial(`radio-${name}`, this.ctx.scene); m.diffuseColor = new Color3(...color);
    if (glow) m.emissiveColor = m.diffuseColor; this.materials.push(m); return m;
  }
  private makeCase(at: Vector3): void {
    const root = this.root = new TransformNode('counters-case', this.ctx.scene); root.position.copyFrom(at);
    const shell = this.material('case', [1, 1, 1]);
    const atlas = new Texture(`${import.meta.env.BASE_URL}environment/counters-radio/ark-crate-atlas.png`, this.ctx.scene);
    atlas.anisotropicFilteringLevel = 8;
    shell.diffuseTexture = atlas; shell.specularColor.set(.32, .34, .31); shell.specularPower = 48;
    shell.emissiveColor.set(.12, .12, .12);
    // Atlas UVs: front, lid, side, bare hardware. Inset to avoid neighbouring panels in mipmaps.
    const frontUV = new Vector4(.005, .505, .495, .995), lidUV = new Vector4(.505, .505, .995, .995);
    const sideUV = new Vector4(.005, .005, .495, .495), steelUV = new Vector4(.505, .005, .995, .495);
    const faces = (face: number, uv: Vector4) => Array.from({ length: 6 }, (_, i) => i === face ? uv : steelUV);
    const box = (name: string, w: number, h: number, d: number, x: number, y: number, z: number, mat: StandardMaterial, parent = root, faceUV?: Vector4[]) => {
      const m = MeshBuilder.CreateBox(name, { width: w, height: h, depth: d, faceUV }, this.ctx.scene);
      m.parent = parent; m.position.set(x, y, z); m.material = mat; m.isPickable = false; this.ctx.shadows.addShadowCaster(m); return m;
    };
    const hardwareUV = Array.from({ length: 6 }, () => steelUV);
    box('case-floor', 1.7, .15, 1.15, 0, .12, 0, shell, root, hardwareUV);
    for (const x of [-.79, .79]) {
      box('case-side', .14, .7, 1.15, x, .48, 0, shell, root, faces(x > 0 ? 2 : 3, sideUV));
      // Recessed carry handle with two brackets and a horizontal steel grip.
      for (const z of [-.23, .23]) box('case-handle-mount', .1, .16, .08, Math.sign(x) * .9, .53, z, shell, root, hardwareUV);
      box('case-handle', .08, .08, .54, Math.sign(x) * .97, .49, 0, shell, root, hardwareUV);
    }
    for (const z of [-.51, .51]) box('case-wall', 1.7, .7, .13, 0, .48, z, shell, root, faces(z > 0 ? 0 : 1, z < 0 ? frontUV : sideUV));
    for (const x of [-.58, .58]) {
      box('case-latch', .16, .28, .09, x, .65, -.61, shell, root, hardwareUV);
      box('case-hinge', .24, .12, .13, x, .83, .61, shell, root, hardwareUV);
    }
    for (const x of [-.8, .8]) for (const z of [-.52, .52]) {
      box('case-corner-guard', .17, .23, .17, x, .24, z, shell, root, hardwareUV);
    }
    const lid = this.lid = new TransformNode('counters-case-hinge', this.ctx.scene); lid.parent = root; lid.position.set(0, .86, .58);
    box('case-lid', 1.76, .16, 1.2, 0, 0, -.58, shell, lid, faces(4, lidUV));
    const radio = this.radio = new TransformNode('counters-radio', this.ctx.scene); radio.parent = root; radio.position.y = .45;
    const radioMaterial = this.material('field-radio', [1, 1, 1]);
    const radioAtlas = new Texture(`${import.meta.env.BASE_URL}environment/counters-radio/ark-radio-atlas.png`, this.ctx.scene);
    radioAtlas.anisotropicFilteringLevel = 8;
    radioMaterial.diffuseTexture = radioAtlas;
    radioMaterial.emissiveColor.set(.15, .15, .15);
    radioMaterial.specularColor.set(.22, .24, .2); radioMaterial.specularPower = 40;
    // Front LCD/grille, rear battery plate, rubber side grips and top/bottom hardware.
    box('radio-body', .55, .7, .25, 0, 0, 0, radioMaterial, radio, [lidUV, frontUV, sideUV, sideUV, steelUV, steelUV]);
    const rubberUV = Array.from({ length: 6 }, () => new Vector4(.59, .425, .68, .475));
    box('radio-antenna', .035, .65, .035, -.2, .6, 0, radioMaterial, radio, rubberUV);
    box('radio-antenna-base', .075, .12, .075, -.2, .38, 0, radioMaterial, radio, rubberUV);
    box('radio-volume-knob', .09, .13, .09, .15, .4, 0, radioMaterial, radio, rubberUV);
    radio.setEnabled(false);
  }
  private arm(): void {
    this.shield = { center: this.crateAt, radius: 1, up: true, block: () => this.hit() };
    this.ctx.targets.shields.add(this.shield);
    this.listener = test => { if (test(this.crateAt.x, this.crateAt.z, 1)) this.hit(); };
    this.ctx.targets.areaListeners.add(this.listener);
  }
  private disarm(): void {
    if (this.shield) this.ctx.targets.shields.delete(this.shield);
    if (this.listener) this.ctx.targets.areaListeners.delete(this.listener);
    this.shield = null; this.listener = null;
  }
  private setIcon(): void {
    if (!this.ctx.radarLabel) return;
    const icon = this.icon = document.createElement('img'); icon.src = RADIO_ICON;
    icon.className = 'egg-radar-icon counters-radio-icon'; icon.alt = 'Ark radio';
    this.ctx.radarLabel.style.position ||= 'absolute'; this.ctx.radarLabel.append(icon);
  }
  private say(text: string, seconds: number, radio = true): void {
    this.caption?.remove(); const el = this.caption = document.createElement('div');
    el.className = 'egg-caption counters-radio-speech'; el.setAttribute('role', 'status'); el.textContent = radio ? `Radio: ${text}` : text;
    Object.assign(el.style, {
      position: 'absolute', left: '0', top: '0', pointerEvents: 'none', whiteSpace: 'nowrap', opacity: '0',
      font: 'italic 600 18px Rajdhani, sans-serif', letterSpacing: '.08em', color: '#fff0f5',
      textShadow: '0 0 8px #ff7fa8, 0 0 2px #000', visibility: 'visible',
    });
    this.ctx.hud.append(el); this.captionTime = this.captionDuration = seconds;
    this.layout();
  }
  layout(): void {
    if (!this.caption) return;
    const at = this.ctx.player.position;
    const p = this.ctx.toScreen(at.x, at.y + 4.1, at.z);
    this.caption.style.transform = `translate(${p.x.toFixed(1)}px,${p.y.toFixed(1)}px) translate(-50%,-100%)`;
  }
  private prepareSquad(): void {
    if (this.squad) return;
    this.squad = new StormFallenSquad(this.ctx.scene, this.ctx.shadows, this.ctx.vfx, this.clearing.clone(), this.ctx.refreshUnits);
    void this.squad.load();
  }
  private clear(): void {
    this.disarm(); this.ctx.softenRain(false);
    this.squad?.dispose(); this.squad = null;
    for (const mesh of this.root?.getChildMeshes() ?? []) this.ctx.shadows.removeShadowCaster(mesh);
    this.root?.dispose(); this.root = this.lid = this.radio = null;
    for (const m of this.materials) m.dispose(false, true); this.materials = [];
    this.icon?.remove(); this.icon = null; this.caption?.remove(); this.caption = null; this.captionTime = 0;
  }
  dispose(): void { this.enabled = false; this.clear(); }
}

export function mountStormRadioLab(egg: StormRadioEgg, player: Player): HTMLElement {
  const panel = document.createElement('div');
  panel.innerHTML = `<h3>Message in the Current</h3><p data-radio-status></p><div class="weather-presets">${RADIO_STEPS.map(s => `<button type="button" data-radio-step="${s}">${LABELS[s]}</button>`).join('')}<button type="button" data-radio-go>Go to objective</button><button type="button" data-radio-hit>Hit case</button></div>`;
  const status = panel.querySelector<HTMLElement>('[data-radio-status]')!;
  const timer = setInterval(() => { status.textContent = egg.label; }, 250);
  panel.addEventListener('click', e => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button'); if (!b) return;
    if (b.dataset.radioStep) egg.goTo(b.dataset.radioStep as RadioStep);
    if (b.hasAttribute('data-radio-hit')) egg.hit();
    if (b.hasAttribute('data-radio-go')) { const at = egg.objective; player.position.set(at.x, 0, at.z - 3); player.unstick(); }
    b.blur(); status.textContent = egg.label;
  });
  // Same lifetime as the scene owning the egg; no polling after the panel is removed.
  const observer = new MutationObserver(() => { if (!panel.isConnected) { clearInterval(timer); observer.disconnect(); } });
  queueMicrotask(() => observer.observe(document.body, { childList: true, subtree: true }));
  return panel;
}
