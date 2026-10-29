// Frozen North easter egg: the Little Mermaid (Siren).
//
// Eligible lake collapses have a 20% chance (100% on the Test Range), guaranteed by the fifth.
// After an appearance, the next eligible collapse is always skipped. She surfaces waist-deep
// and bobbing as she treads water, says one line and slips back under:
//   40% "Awoo"   40% "Bubbles!"   20% "Stop": every Rapture on the field is sealed in a pink soap
//   bubble and holds still (Target.bubbled) until a hit pops it.
//
// The Test Lab's Events tab can summon her with any line on a Frozen North run.

import { Color3, MeshBuilder, StandardMaterial, Vector3, type Mesh, type Scene } from '@babylonjs/core';
import { Chibi, loadChibiIndex } from '../chibi';
import type { Player } from './player';
import type { TargetField, Target } from './targets';
import type { Vfx } from './vfx';

const SIREN = 'c513_00';
/** odds per lake collapse; the Test Range uses SIREN_TEST_CHANCE */
export const SIREN_CHANCE = .2, SIREN_TEST_CHANCE = 1;
export const SIREN_LINES = ['Awoo', 'Bubbles!', 'Stop'] as const;
export type SirenLine = typeof SIREN_LINES[number];
/** Weights for SIREN_LINES. */
const LINE_ODDS = [.4, .4, .2];
/** seconds: wait out the shatter (chunks, splash) so the rise is seen, rise, speak, sink */
const RISE_AT = .7, RISE_TIME = 1.2, LINE_AT = 2.2, LINE_TIME = 2.4, SINK_AT = 5.3, SINK_TIME = 1;
/** Her head bone's height above the water while wading, as a fraction of her height: head and torso show.
 * The lift follows the bone, so idle and talk poses sit at the same depth. */
const HEAD_ABOVE = .22;
/** head bone depth while fully under, as a fraction of her height */
const HEAD_UNDER = .5;
const PINK: [number, number, number] = [1, .62, .82];
const FOAM: [number, number, number] = [.85, .96, 1];

const ease = (t: number): number => { const c = Math.max(0, Math.min(1, t)); return c * c * (3 - 2 * c); };

export function rollSirenLine(r = Math.random()): SirenLine {
  for (let i = 0; i < LINE_ODDS.length; i++) if ((r -= LINE_ODDS[i]) < 0) return SIREN_LINES[i];
  return SIREN_LINES[SIREN_LINES.length - 1];
}

export interface SirenEggContext {
  scene: Scene; vfx: Vfx; targets: TargetField; player: Player; hud: HTMLElement;
  toScreen: (x: number, y: number, z: number) => { x: number; y: number };
  refreshUnits: () => void;
  /** chance per collapse that she surfaces */
  chance: number;
}

export class SirenEgg {
  private enabled = false;
  private siren: Chibi | null = null;
  private at = new Vector3();
  private line: SirenLine = 'Awoo';
  private age = -1;
  private loading = false;
  private collapsesSinceAppearance = 0;
  private skipNextCollapse = false;
  /** model height with no lift, measured from her mesh bounds once she loads */
  private height = 2;
  private lift = 0;
  /** head bone height above her lift; negative until first measured */
  private headOffset = -1;
  private caption: HTMLDivElement | null = null;
  private readonly head = new Vector3();
  private readonly bubbles = new Map<Target, { mesh: Mesh; generation: number; phase: number }>();
  private material: StandardMaterial | null = null;
  private token = 0;

  constructor(private readonly ctx: SirenEggContext) {}

  get active(): boolean { return this.enabled; }
  get chance(): number { return this.ctx.chance; }
  get surfaced(): boolean { return this.age >= 0 || this.loading; }

  /** Only Frozen North has lakes. */
  setEnabled(enabled: boolean): void {
    if (enabled === this.enabled) return;
    this.enabled = enabled;
    this.clear();
    this.collapsesSinceAppearance = 0;
    this.skipNextCollapse = false;
  }

  /** A lake collapse opened water here: maybe she comes up. */
  onBreak(x: number, z: number): void {
    if (!this.enabled || this.surfaced) return;
    this.collapsesSinceAppearance++;
    if (this.skipNextCollapse) {
      this.skipNextCollapse = false;
      return;
    }
    if (this.collapsesSinceAppearance >= 5 || Math.random() < this.ctx.chance) this.summon(x, z);
  }

  summon(x: number, z: number, line: SirenLine = rollSirenLine()): void {
    if (!this.enabled) return;
    this.collapsesSinceAppearance = 0;
    this.skipNextCollapse = true;
    this.dropSiren();
    this.at.set(x, 0, z); this.line = line;
    // The timeline starts once she has loaded, so a slow load cannot skip her rise.
    this.loading = true;
    void this.load();
  }

  private async load(): Promise<void> {
    const token = ++this.token;
    const index = await loadChibiIndex();
    const variant = index.variants[SIREN];
    const chibi = variant ? await Chibi.load(this.ctx.scene, variant).catch(() => null) : null;
    if (token !== this.token) { chibi?.dispose(); return; }
    this.loading = false;
    if (!chibi) return;
    this.siren = chibi;
    chibi.root.position.copyFrom(this.at);
    chibi.play('idle', { loop: true });
    chibi.update(0);
    chibi.root.computeWorldMatrix(true);
    // Her weapon is the soap bubble she sits on: leave it out, here it would float on the water.
    for (const m of chibi.meshes) if (/wea/i.test(m.name) || /wea/i.test(m.parent?.name ?? '')) m.setEnabled(false);
    let top = -Infinity;
    for (const m of chibi.meshes) { if (!m.isEnabled()) continue; m.computeWorldMatrix(true); top = Math.max(top, m.getBoundingInfo().boundingBox.maximumWorld.y); }
    this.height = Number.isFinite(top) ? Math.max(.5, top - this.at.y) : 2;
    // Hidden under the water until she rises.
    chibi.setLift(-this.height * 2);
    // The water is translucent: keep her out of sight until she starts up.
    chibi.root.setEnabled(false);
    this.ctx.refreshUnits();
    this.lift = -this.height * 2; this.headOffset = -1;
    this.age = 0;
  }

  update(dt: number): void {
    if (!this.enabled) return;
    this.updateBubbles(dt);
    if (this.age < 0) return;
    const t = this.age += dt, prev = t - dt;
    const crossed = (at: number) => prev < at && t >= at;
    if (crossed(RISE_AT) || crossed(SINK_AT)) this.splash();
    if (crossed(LINE_AT)) this.speak();
    const s = this.siren;
    if (s) {
      // Up through the hole, treading water, then back down.
      // Only drawn while rising, wading or sinking; under the water she would show through it.
      s.root.setEnabled(t >= RISE_AT && t < SINK_AT + SINK_TIME);
      const up = ease((t - RISE_AT) / RISE_TIME) * (1 - ease((t - SINK_AT) / SINK_TIME));
      const under = -this.height * HEAD_UNDER, wading = this.height * HEAD_ABOVE;
      const goal = under + (wading - under) * up + Math.sin(t * 2.6) * .05 * up;
      // Where the head sits relative to her lift in the current pose (a frame behind, smoothed).
      const offset = s.head(this.head).y - this.lift - this.at.y;
      this.headOffset = this.headOffset < 0 ? offset : this.headOffset + (offset - this.headOffset) * Math.min(1, dt * 8);
      this.lift = goal - this.headOffset;
      s.setLift(this.lift);
      s.root.rotation.z = Math.sin(t * 1.3) * .04;
      const p = this.ctx.player.position;
      s.root.rotation.y = Math.atan2(p.x - this.at.x, p.z - this.at.z);
      s.update(dt);
      // Ripples where her body cuts the water.
      if (up > .5 && Math.floor(t * 1.4) !== Math.floor(prev * 1.4)) this.ctx.vfx.ring(this.at.clone().addInPlaceFromFloats(0, .08, 0), FOAM, .3, 1.6, .9, .4);
    }
    this.updateCaption(t - LINE_AT);
    if (t >= SINK_AT + SINK_TIME) this.dropSiren();
  }

  private splash(): void {
    const { vfx } = this.ctx, at = this.at.clone().addInPlaceFromFloats(0, .15, 0);
    vfx.ring(at, FOAM, .3, 2.4, .6, .7);
    for (let i = 0; i < 9; i++) {
      const a = i * 2.4, r = .3 + (i % 3) * .35;
      vfx.flashSprite(at.add(new Vector3(Math.cos(a) * r, .2 + (i % 4) * .3, Math.sin(a) * r)), i % 3 ? FOAM : PINK, .35 + (i % 3) * .15, .8, .85, 'bubble');
    }
  }

  private speak(): void {
    const s = this.siren;
    if (s) s.play(s.has('talk_1') ? 'talk_1' : 'talk_idle', { loop: false, fade: .2, onEnd: () => s.play('idle', { loop: true, fade: .3 }) });
    this.caption?.remove();
    this.caption = this.captionElement(this.line);
    if (this.line === 'Stop') this.stop();
  }

  // --- "Stop": soap bubbles ---------------------------------------------------------------
  private stop(): void {
    for (const t of this.ctx.targets.targets) {
      if (!t.alive || t.removed || this.bubbles.has(t)) continue;
      t.bubbled = true;
      const mesh = MeshBuilder.CreateSphere('siren-bubble', { diameter: 1, segments: 16 }, this.ctx.scene);
      mesh.material = this.bubbleMaterial();
      mesh.isPickable = false;
      this.bubbles.set(t, { mesh, generation: t.generation, phase: Math.random() * 6 });
    }
  }
  private bubbleMaterial(): StandardMaterial {
    if (this.material) return this.material;
    const m = this.material = new StandardMaterial('siren-bubble', this.ctx.scene);
    m.diffuseColor = new Color3(1, .7, .88);
    m.emissiveColor = new Color3(.45, .2, .35);
    m.specularColor = new Color3(1, 1, 1); m.specularPower = 64;
    m.alpha = .32; m.backFaceCulling = false;
    m.metadata = { softEnvironment: true };
    return m;
  }
  private updateBubbles(dt: number): void {
    for (const [t, b] of this.bubbles) {
      const popped = !t.bubbled || !t.alive || t.removed || t.generation !== b.generation;
      const size = Math.max(t.radius * 3.2, t.barHeight * 1.15) * Math.max(.2, t.scale);
      const centre = t.position.clone().addInPlaceFromFloats(0, size * .42, 0);
      if (popped) {
        t.bubbled = false;
        b.mesh.dispose(); this.bubbles.delete(t);
        this.ctx.vfx.ring(centre, PINK, size * .4, size * .9, .25, .8);
        for (let i = 0; i < 6; i++) this.ctx.vfx.flashSprite(centre.add(new Vector3(Math.cos(i * 1.05) * size * .45, Math.sin(i * 2.1) * size * .3, Math.sin(i * 1.05) * size * .45)), PINK, .3, .35, .8, 'bubble');
        continue;
      }
      // A soap film wobbles: squash and stretch a little out of phase on each axis.
      b.phase += dt;
      const w = Math.sin(b.phase * 3.1) * .04;
      b.mesh.position.copyFrom(centre).addInPlaceFromFloats(0, Math.sin(b.phase * 1.7) * .06, 0);
      b.mesh.scaling.set(size * (1 + w), size * (1 - w), size * (1 + w * .6));
    }
  }

  // --- caption --------------------------------------------------------------------------
  /** Place her line over her head. main.ts calls this after the camera has moved this frame. */
  layout(): void {
    if (!this.caption) return;
    const head = this.siren ? this.siren.head(this.head) : this.at.clone().addInPlaceFromFloats(0, 1, 0);
    const p = this.ctx.toScreen(head.x, head.y + .55, head.z);
    this.caption.style.transform = `translate(${p.x.toFixed(1)}px,${p.y.toFixed(1)}px) translate(-50%,-100%)`;
  }
  private updateCaption(a: number): void {
    const c = this.caption; if (!c || a < 0) return;
    c.style.opacity = String(a < LINE_TIME ? ease(a / .3) : 1 - ease((a - LINE_TIME) / .5));
    if (a > LINE_TIME + .5) { c.remove(); this.caption = null; }
  }
  private captionElement(text: string): HTMLDivElement {
    const el = document.createElement('div');
    el.className = 'egg-caption';
    el.textContent = text;
    Object.assign(el.style, {
      position: 'absolute', left: '0', top: '0', pointerEvents: 'none', whiteSpace: 'nowrap', opacity: '0',
      font: 'italic 600 20px Rajdhani, sans-serif', letterSpacing: '.08em', color: '#fff0f8',
      textShadow: '0 0 8px #ff8fc8, 0 0 2px #000',
    });
    this.ctx.hud.append(el);
    return el;
  }

  private dropSiren(): void {
    this.token++;
    this.siren?.dispose(); this.siren = null;
    this.age = -1; this.loading = false;
  }
  private clear(): void {
    this.dropSiren();
    this.caption?.remove(); this.caption = null;
    for (const [t, b] of this.bubbles) { t.bubbled = false; b.mesh.dispose(); }
    this.bubbles.clear();
  }
  dispose(): void { this.enabled = false; this.clear(); this.material?.dispose(); this.material = null; }
}

/** Test Lab "Events" section: summon her with a chosen line. */
export function mountSirenEggLab(egg: SirenEgg, player: Player, toFrozen: () => void): HTMLElement {
  const panel = document.createElement('div');
  panel.className = 'egg-lab';
  panel.innerHTML = `<h3>Siren in the lake</h3>
    <p data-status></p>
    <div class="weather-presets">
      ${SIREN_LINES.map((l) => `<button type="button" data-line="${l}">“${l}”</button>`).join('')}
      <button type="button" data-act="frozen">Load Frozen North</button>
    </div>`;
  const status = panel.querySelector<HTMLElement>('[data-status]')!;
  const sync = () => { status.textContent = egg.active ? `${egg.chance * 100}% per eligible lake collapse; guaranteed by the fifth, never back to back. Summon her in front of you:` : 'Only runs in Frozen North. Load it below.'; };
  panel.addEventListener('pointerdown', (e) => e.stopPropagation());
  panel.addEventListener('click', (e) => {
    const button = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
    if (!button) return;
    if (button.dataset.act === 'frozen') toFrozen();
    const line = button.dataset.line as SirenLine | undefined;
    if (line) egg.summon(player.position.x + 3, player.position.z + 3, line);
    sync();
  });
  sync();
  return panel;
}
