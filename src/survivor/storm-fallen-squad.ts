import { MaterialPluginBase, Mesh, PBRMaterial, StandardMaterial, Vector3, type Material, type Scene, type ShadowGenerator, type UniformBuffer } from '@babylonjs/core';
import { Chibi, loadChibiIndex } from '../chibi';
import roster from '../minion-roster.json';
import type { FxQuad, Vfx } from './vfx';

/** Smooth white-gold transfiguration, applied only to the fallen squad's materials. */
class GoldenDissolve extends MaterialPluginBase {
  progress = 0;
  constructor(material: Material) { super(material, 'StormGoldenDissolve', 250, {}, true, true); }
  override getUniforms() { return { ubo: [{ name: 'fallenDissolve', size: 1, type: 'float' }], fragment: 'uniform float fallenDissolve;' }; }
  override bindForSubMesh(buffer: UniformBuffer): void { buffer.updateFloat('fallenDissolve', this.progress); }
  override getCustomCode(type: string): Record<string, string> | null {
    if (type !== 'fragment') return null;
    const color = this._material instanceof PBRMaterial ? 'finalColor' : 'color';
    return { CUSTOM_FRAGMENT_BEFORE_FRAGCOLOR: `
      if (fallenDissolve > 0.) {
        float warmth = smoothstep(0., .32, fallenDissolve);
        ${color}.rgb = mix(${color}.rgb, vec3(1.8,1.5,.85), warmth * .75);
      }
    ` };
  }
}

interface Mote { quad: FxQuad; at: Vector3; delay: number; speed: number; drift: number }
export class StormFallenSquad {
  readonly members: Chibi[] = [];
  ready = false;
  failed = false;
  private disposed = false;
  private visible = false;
  private shades: GoldenDissolve[] = [];
  private motes: Mote[] = [];
  private luminous: (PBRMaterial | StandardMaterial)[] = [];
  private removedShadows = false;
  private readonly scratch = new Vector3();
  constructor(private scene: Scene, private shadows: ShadowGenerator, private vfx: Vfx, private at: Vector3, private refresh: () => void) {}
  async load(): Promise<void> {
    const pool = [...roster];
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    try {
      const index = await loadChibiIndex();
      for (const [i, unit] of pool.slice(0, 3).entries()) {
        if (this.disposed) return;
        const chibi = await Chibi.load(this.scene, index.variants[unit.id]);
        if (this.disposed) { chibi.dispose(); return; }
        this.members.push(chibi);
        chibi.root.setEnabled(false);
        chibi.root.position.copyFrom(this.at).addInPlaceFromFloats((i - 1) * 1.8, .03, i === 1 ? 1 : -.4);
        chibi.root.rotation.y = [-.6, 2.5, .8][i];
        chibi.play('death', { loop: false, speed: 0, fade: 0 });
        chibi.animationGroup('death')!.goToFrame(chibi.animationGroup('death')!.to);
        chibi.animationGroup('death')!.pause();
        chibi.update(0);
        const materials = new Set<Material>();
        for (const mesh of chibi.meshes) {
          mesh.isPickable = false;
          if (mesh.material) materials.add(mesh.material);
          this.shadows.addShadowCaster(mesh);
        }
        for (const material of materials) {
          this.shades.push(new GoldenDissolve(material));
          if (material instanceof PBRMaterial || material instanceof StandardMaterial) {
            material.transparencyMode = 2;
            material.needDepthPrePass = true;
            material.alpha = .9999;
            this.luminous.push(material);
          }
        }
      }
      this.refresh();
      this.prepareEffects();
      // Compile both scene and glow passes while the radio is still playing, not on approach.
      for (const member of this.members) for (const mesh of member.meshes) {
        if (this.disposed) return;
        if (!mesh.getTotalVertices() || !mesh.material) continue;
        await mesh.material.forceCompilationAsync(mesh);
        if (this.disposed) return;
        if (mesh instanceof Mesh) await this.vfx.prepareGlowMesh(mesh);
      }
      if (this.disposed) return;
      for (const member of this.members) member.root.setEnabled(this.visible);
      this.ready = true;
    } catch (error) {
      if (!this.disposed) { this.failed = true; console.error('Could not load fallen Ark squad', error); }
    }
  }
  reveal(): void {
    this.visible = true;
    if (this.ready) for (const member of this.members) member.root.setEnabled(true);
  }
  near(at: { x: number; z: number }): boolean {
    return this.ready && this.members.some(member => Math.hypot(member.root.position.x - at.x, member.root.position.z - at.z) <= 6);
  }
  private prepareEffects(): void {
    for (const member of this.members) {
      for (const mesh of member.meshes) if (mesh instanceof Mesh) this.vfx.glowMesh(mesh);
        for (let i = 0; i < 56; i++) {
          const quad = this.vfx.quad(i % 5 === 0 ? 'holy-shard' : 'glow', [1, .9, .6], 0); this.vfx.glowing(quad);
          this.motes.push({ quad, at: member.root.position.add(new Vector3((Math.random() - .5) * 1.4, .15 + Math.random() * .5, (Math.random() - .5) * 1.6)), delay: Math.random() * 2.4, speed: .8 + Math.random(), drift: Math.random() * Math.PI * 2 });
        }
    }
  }
  /** Bodies become luminous, softly fade, then leave only ascending particles. */
  dissolve(age: number): void {
    if (!this.ready) return;
    if (!this.removedShadows) {
      this.removedShadows = true;
      for (const member of this.members) {
        for (const mesh of member.meshes) {
          this.shadows.removeShadowCaster(mesh);
        }
      }
    }
    const smooth = (n: number) => { const t = Math.max(0, Math.min(1, n)); return t * t * (3 - 2 * t); };
    const radiance = smooth(age / .22) * (1 - smooth((age - 2.2) / 2.8));
    for (const shade of this.shades) shade.progress = Math.min(1, age / 3.4);
    for (const material of this.luminous) {
      material.alpha = .9999 * (1 - smooth((age - .65) / 2.75));
      material.emissiveColor.set(2.8 * radiance, 2.15 * radiance, .95 * radiance);
    }
    for (const member of this.members) member.root.setEnabled(age < 3.4);
    for (const mote of this.motes) {
      const t = age - mote.delay, life = 2.6;
      if (t < 0 || t >= life) { this.vfx.tint(mote.quad, [1, .76, .25], 0); continue; }
      const pos = this.scratch.copyFrom(mote.at).addInPlaceFromFloats(Math.sin(mote.drift + t * 2) * .22, t * mote.speed, Math.cos(mote.drift + t) * .2);
      this.vfx.sprite(mote.quad, pos, .16 + .13 * Math.sin(t * 2) ** 2, mote.drift + t * .2);
      this.vfx.tint(mote.quad, [1, .9, .6], smooth(t / .35) * (1 - smooth(t / life)));
    }
  }
  dispose(): void {
    this.disposed = true;
    for (const mote of this.motes) this.vfx.release(mote.quad);
    this.motes = [];
    this.luminous = [];
    for (const member of this.members) { for (const mesh of member.meshes) this.shadows.removeShadowCaster(mesh); member.dispose(); }
    this.members.length = 0; this.shades = []; this.ready = false;
  }
}
