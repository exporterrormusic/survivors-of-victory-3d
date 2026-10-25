import {
  type Camera, GlowLayer, MaterialPluginBase, Mesh, PBRMaterial, type Scene,
  StandardMaterial, type UniformBuffer,
} from '@babylonjs/core';

interface GlowState { strength: number }

// Evaluate the painted color before lighting, cel shading or instance hit tints.
// Relative red dominance includes shaded red paint without selecting grey armor;
// hue limits keep orange/yellow and purple details from becoming red lamps.
const RED_EMISSION = `
  vec3 enemyRedEmission(vec3 paint) {
    float red = max(paint.r, 0.0001);
    float dominance = (red - max(paint.g, paint.b)) / red;
    float mask = smoothstep(0.12, 0.42, dominance);
    mask *= 1.0 - smoothstep(0.45, 0.80, paint.g / red);
    mask *= 1.0 - smoothstep(0.40, 0.80, paint.b / red);
    mask *= smoothstep(0.08, 0.35, red);
    float detail = mix(0.4, 1.0, smoothstep(0.10, 0.70, red));
    return vec3(1.0, 0.018, 0.035) * mask * detail * enemyRedStrength;
  }
`;

/** The same mask drives the surface emission and the compact enemy GlowLayer's source.
 * StandardMaterial is used only as a lightweight glow-pass material, preserving
 * Babylon's skinning, baked animation, thin instances, texture UVs and alpha test. */
class EnemyRedGlow extends MaterialPluginBase {
  constructor(material: PBRMaterial | StandardMaterial, private readonly state: GlowState) {
    super(material, 'EnemyRedGlow', 260, {}, true, true);
    this.doNotSerialize = true;
  }

  override getClassName(): string { return 'EnemyRedGlow'; }

  override getUniforms() {
    return {
      ubo: [{ name: 'enemyRedStrength', size: 1, type: 'float' }],
      fragment: 'uniform float enemyRedStrength;',
    };
  }

  override bindForSubMesh(buffer: UniformBuffer): void {
    buffer.updateFloat('enemyRedStrength', this.state.strength);
  }

  override getCustomCode(type: string): Record<string, string> | null {
    if (type !== 'fragment') return null;
    if (this._material instanceof PBRMaterial) return {
      CUSTOM_FRAGMENT_DEFINITIONS: RED_EMISSION,
      CUSTOM_FRAGMENT_BEFORE_LIGHTS: `
        vec3 enemyRedPaint = toGammaSpace(vAlbedoColor.rgb);
        #ifdef ALBEDO
          #ifdef GAMMAALBEDO
            enemyRedPaint *= albedoTexture.rgb;
          #else
            enemyRedPaint *= toGammaSpace(albedoTexture.rgb);
          #endif
        #endif
      `,
      // Anime also uses finalEmissive, so this survives every lighting preset.
      CUSTOM_FRAGMENT_BEFORE_FINALCOLORCOMPOSITION: 'finalEmissive += enemyRedEmission(enemyRedPaint);',
    };
    return {
      CUSTOM_FRAGMENT_DEFINITIONS: RED_EMISSION,
      CUSTOM_FRAGMENT_MAIN_BEGIN: 'vec3 enemyRedPaint = vDiffuseColor.rgb;',
      // This hook follows texture sampling and precedes vertex/instance colors.
      CUSTOM_FRAGMENT_UPDATE_ALPHA: `enemyRedPaint *= ${(this._material as StandardMaterial).diffuseTexture?.gammaSpace === false ? 'toGammaSpace(baseColor.rgb)' : 'baseColor.rgb'};`,
      // Write only the red mask into the halo texture, with black armor still
      // writing depth. Do not grade it a second time or emit the whole model.
      CUSTOM_FRAGMENT_BEFORE_FRAGCOLOR: 'color = vec4(enemyRedEmission(enemyRedPaint), alpha);',
    };
  }
}

/** Scene-owned, shared across every instance of each Rapture material. */
export function createEnemyRedGlow(scene: Scene, camera: Camera) {
  // A separate narrow blur keeps red details tight without shrinking weapon/ability glow.
  const glow = new GlowLayer('enemy-red-glow',scene,{ camera, blurKernelSize: 8, mainTextureRatio: .5, excludeByDefault: true });
  glow.intensity = .32;
  const state: GlowState = { strength: .75 };
  const materials = new Map<PBRMaterial, StandardMaterial>();
  const meshes = new Set<Mesh>();
  let dirty = true;

  function refresh(): void {
    dirty = false;
    for (const mesh of scene.meshes) {
      if (!(mesh instanceof Mesh) || meshes.has(mesh) || !mesh.getTotalVertices()) continue;
      const source = mesh.material;
      if (!(source instanceof PBRMaterial) || !source.metadata?.enemyRedGlow) continue;
      let mask = materials.get(source);
      if (!mask) {
        new EnemyRedGlow(source, state);
        mask = new StandardMaterial(`${source.name}-red-glow`, scene);
        mask.disableLighting = true;
        mask.metadata = { anime: false };
        mask.diffuseTexture = source.albedoTexture;
        source.albedoColor.toGammaSpaceToRef(mask.diffuseColor);
        mask.opacityTexture = source.opacityTexture;
        mask.alpha = source.alpha;
        mask.transparencyMode = source.transparencyMode;
        mask.useAlphaFromDiffuseTexture = source.useAlphaFromAlbedoTexture;
        mask.alphaCutOff = source.alphaCutOff;
        mask.backFaceCulling = source.backFaceCulling;
        mask.fogEnabled = false;
        new EnemyRedGlow(mask, state);
        materials.set(source, mask);
        source.onDisposeObservable.addOnce(() => {
          materials.get(source)?.dispose(); // shared source textures remain owned by the asset
          materials.delete(source);
        });
      }
      glow.addIncludedOnlyMesh(mesh);
      glow.setMaterialForRendering(mesh, mask);
      meshes.add(mesh);
    }
  }

  const added = scene.onNewMeshAddedObservable.add(() => { dirty = true; });
  const removed = scene.onMeshRemovedObservable.add(mesh => {
    if (!(mesh instanceof Mesh) || !meshes.delete(mesh)) return;
    glow.removeIncludedOnlyMesh(mesh);
    glow.setMaterialForRendering(mesh);
  });
  const before = scene.onBeforeRenderObservable.add(() => { if (dirty) refresh(); });
  scene.onDisposeObservable.add(() => {
    scene.onNewMeshAddedObservable.remove(added);
    scene.onMeshRemovedObservable.remove(removed);
    scene.onBeforeRenderObservable.remove(before);
    for (const mask of materials.values()) mask.dispose();
    materials.clear();meshes.clear();glow.dispose();
  });

  return {
    refresh,
    setAtmosphere(night: number, dusk: number): void {
      state.strength = .75 + 2.05 * Math.max(0, Math.min(1, night)) + .6 * Math.max(0, Math.min(1, dusk));
    },
  };
}
