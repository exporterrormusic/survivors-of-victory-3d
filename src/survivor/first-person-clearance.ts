import { MaterialPluginBase, MultiMaterial, PBRMaterial, StandardMaterial,
  type AbstractEngine, type AbstractMesh, type Material, type Scene, type SubMesh,
  type UniformBuffer, type Vector3 } from '@babylonjs/core';

/** Clip only the local character near the lens, never the world or other players.
 * Uses the existing opaque pass: no transparent sorting or extra draw calls. */
export function firstPersonClearance(meshes: readonly AbstractMesh[], active: () => boolean, eye: Vector3): void {
  const owned = new Set(meshes), materials = new Set<Material>();
  const collect = (material: Material | null) => {
    if (material instanceof MultiMaterial) material.subMaterials.forEach(collect);
    else if (material) materials.add(material);
  };
  meshes.forEach(mesh => collect(mesh.material));
  for (const material of materials) {
    if (material instanceof PBRMaterial || material instanceof StandardMaterial)
      new LensClearance(material, owned, active, eye);
  }
}

class LensClearance extends MaterialPluginBase {
  constructor(material: Material, private readonly owned: Set<AbstractMesh>,
    private readonly active: () => boolean, private readonly eye: Vector3) {
    super(material, 'FirstPersonClearance', 260, {}, true, false);
    this.registerForExtraEvents = true;
    this.doNotSerialize = true;
    this._enable(true);
  }
  override getUniforms() {
    return { ubo: [{name: 'fpClearance', size: 4, type: 'vec4'}],
      fragment: 'uniform vec4 fpClearance;' };
  }
  override hardBindForSubMesh(buffer: UniformBuffer, _scene: Scene, _engine: AbstractEngine, subMesh: SubMesh): void {
    const radius = this.active() && this.owned.has(subMesh.getRenderingMesh()) ? .45 : 0;
    buffer.updateFloat4('fpClearance', this.eye.x, this.eye.y, this.eye.z, radius * radius);
  }
  override getCustomCode(type: string): Record<string, string> | null {
    return type === 'fragment' ? { CUSTOM_FRAGMENT_MAIN_BEGIN: `
      if (fpClearance.w > 0.0) {
        vec3 fpOffset = vPositionW - fpClearance.xyz;
        if (dot(fpOffset, fpOffset) < fpClearance.w) discard;
      }` } : null;
  }
}
