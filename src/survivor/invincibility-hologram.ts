import { MaterialPluginBase, PBRMaterial, StandardMaterial, type UniformBuffer } from '@babylonjs/core';
import type { Chibi } from '../chibi';

/** Runs on the original skinned materials so the hologram keeps the animated silhouette. */
export class InvincibilityHologram {
  active = false;
  time = 0;
  constructor(chibi: Chibi) {
    const materials = new Set(chibi.meshes.map(mesh => mesh.material));
    for (const material of materials) {
      if (material instanceof PBRMaterial || material instanceof StandardMaterial) new HologramMaterial(material, this);
    }
  }
  update(dt: number): void { this.time += dt; }
}

class HologramMaterial extends MaterialPluginBase {
  constructor(material: PBRMaterial | StandardMaterial, private readonly state: InvincibilityHologram) {
    super(material, 'InvincibilityHologram', 300, {}, true, true);
    this.doNotSerialize = true;
  }
  override getClassName(): string { return 'InvincibilityHologram'; }
  override getUniforms() {
    return {
      ubo: [{ name: 'hologramState', size: 2, type: 'vec2' }],
      fragment: 'uniform vec2 hologramState;',
    };
  }
  override bindForSubMesh(buffer: UniformBuffer): void {
    buffer.updateFloat2('hologramState', this.state.active ? 1 : 0, this.state.time);
  }
  override getCustomCode(type: string): Record<string, string> | null {
    if (type !== 'fragment') return null;
    const output = this._material instanceof PBRMaterial ? 'finalColor' : 'color';
    return { CUSTOM_FRAGMENT_BEFORE_FOG: `
      if (hologramState.x > .5) {
        float phase = vPositionW.y * 32.0 - hologramState.y * 2.5;
        float scan = fract(phase);
        // Real gaps reveal the world without sorting translucent body parts.
        if (scan < .24) discard;
        float rim = pow(1.0 - abs(dot(normalize(normalW), normalize(viewDirectionW))), 2.0);
        float line = smoothstep(.78, .95, scan);
        float flicker = .94 + .06 * sin(hologramState.y * 37.0);
        vec3 projection = vec3(.95,.035,.12) * (.32 + rim * 1.4 + line * .55) * flicker;
        ${output}.rgb = ${output}.rgb * .28 + projection;
      }
    ` };
  }
}
