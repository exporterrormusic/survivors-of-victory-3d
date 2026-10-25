import {
  type AbstractMesh, type Camera, Color3, type DirectionalLight, Material,
  type MaterialDefines, MaterialPluginBase, Mesh, PBRMaterial, RegisterMaterialPlugin,
  type Scene, StandardMaterial, type UniformBuffer, Vector3,
} from '@babylonjs/core';

interface ToonState {
  enabled: boolean;
  sun: DirectionalLight;
  atmosphere: Color3;
  atmosphereShade: Color3;
  playerFill: number;
  playerMaterials: Set<Material>;
  plugins: Set<AnimeToon>;
}
const states = new WeakMap<Scene, ToonState>();

/** Keep the original materials, UVs, alpha tests and skinning. Only replace their
 * lighting before fog/grading; terrain and range-ground plugins still paint the albedo. */
class AnimeToon extends MaterialPluginBase {
  constructor(material: StandardMaterial | PBRMaterial, private readonly state: ToonState) {
    super(material, 'AnimeToon', 250, { ANIME_TOON: false, CUSTOMUSERLIGHTING: false }, true, true);
    this.doNotSerialize = true;
    state.plugins.add(this);
  }

  override getClassName(): string { return 'AnimeToon'; }

  override prepareDefines(defines: MaterialDefines): void {
    const flags = defines as MaterialDefines & { ANIME_TOON: boolean; CUSTOMUSERLIGHTING: boolean; UNLIT?: boolean };
    const material = this._material as StandardMaterial | PBRMaterial;
    // Emissive effects, telegraphs and HUD-like world markers keep their authored colors.
    const enabled = this.state.enabled && !material.disableLighting && material.metadata?.anime !== false;
    flags.ANIME_TOON = flags.CUSTOMUSERLIGHTING = enabled;
    // Turning the preset off dirties all defines, letting Babylon restore UNLIT
    // from the original material (including its wireframe/point-cloud handling).
    if (enabled && material instanceof PBRMaterial) flags.UNLIT = false;
  }

  override getUniforms() {
    return {
      ubo: [{ name: 'animeSun', size: 3, type: 'vec3' }, { name: 'animePainted', size: 1, type: 'float' }, { name: 'animeSoft', size: 1, type: 'float' }, { name: 'animeAtmosphere', size: 3, type: 'vec3' }, { name: 'animeAtmosphereShade', size: 3, type: 'vec3' }, { name: 'animePlayerFill', size: 1, type: 'float' }],
      fragment: '#ifdef ANIME_TOON\nuniform vec3 animeSun;\nuniform float animePainted;\nuniform float animeSoft;\nuniform vec3 animeAtmosphere;\nuniform vec3 animeAtmosphereShade;\nuniform float animePlayerFill;\n#endif',
    };
  }

  override bindForSubMesh(buffer: UniformBuffer): void {
    const direction = this.state.sun.direction;
    buffer.updateFloat3('animeSun', -direction.x, -direction.y, -direction.z);
    buffer.updateFloat('animeSoft', this._material.metadata?.softEnvironment ? 1 : 0);
    buffer.updateFloat('animePainted', this._material instanceof PBRMaterial && this._material.unlit ? 1 : 0);
    buffer.updateColor3('animeAtmosphere', this.state.atmosphere);
    buffer.updateColor3('animeAtmosphereShade', this.state.atmosphereShade);
    buffer.updateFloat('animePlayerFill', this.state.playerMaterials.has(this._material) ? this.state.playerFill : 0);
  }

  override getCustomCode(type: string): Record<string, string> | null {
    if (type !== 'fragment') return null;
    const pbr = this._material instanceof PBRMaterial;
    return {
      // Unlit glTF materials can leave metallic at its default of 1. Capture the
      // painted albedo before PBR's energy-conservation step subtracts it away.
      ...(pbr ? { CUSTOM_FRAGMENT_BEFORE_LIGHTS: '#ifdef ANIME_TOON\nvec3 animeAlbedo = surfaceAlbedo;\n#endif' } : {}),
      CUSTOM_FRAGMENT_DEFINITIONS: `
        #ifdef ANIME_TOON
        float animeShadow = 1.0;
        // Both material families use this hook. Collect cast shadows without
        // dividing by N.L (undefined on back-facing surfaces and absent in PBR).
        vec3 computeCustomDiffuseLighting(lightingInfo info, vec3 base, float shadow) {
          animeShadow = min(animeShadow, shadow);
          return info.diffuse * shadow;
        }
        #ifdef SPECULARTERM
        vec3 computeCustomSpecularLighting(lightingInfo info, vec3 base, float shadow) {
          return vec3(0.0);
        }
        #endif
        vec3 animeLight(vec3 normal, vec3 viewDirection) {
          float facing = max(0.0, dot(normal, normalize(animeSun)));
          // Keep a small derivative-based transition to avoid crawling band edges.
          float width = max(0.012, fwidth(facing) * 0.8);
          float band = smoothstep(0.25 - width, 0.25 + width, facing);
          // Painted scenery shares the established palette with broad light transitions.
          band = mix(band, smoothstep(0.0, 0.85, facing), animeSoft);
          band *= mix(smoothstep(0.48, 0.58, animeShadow), animeShadow, animeSoft);
          vec3 shade = mix(vec3(0.70, 0.77, 0.91), vec3(0.82, 0.86, 0.96), animePainted);
          vec3 light = mix(shade, vec3(1.08, 1.05, 1.0), band);
          float edge = 1.0 - clamp(dot(normal, viewDirection), 0.0, 1.0);
          float rim = smoothstep(0.72, 0.88, edge) * smoothstep(0.0, 0.65, facing);
          light *= mix(animeAtmosphereShade, animeAtmosphere, band);
          // Broad camera-side fill on the controlled character. Lift its painted
          // surfaces without flattening the cel bands or emitting a glowing silhouette.
          float facingCamera = max(0.0, dot(normal, viewDirection));
          light += vec3(0.38, 0.36, 0.30) * animePlayerFill * (0.75 + 0.25 * facingCamera);
          return light + vec3(0.04, 0.05, 0.07) * rim * animeShadow * animeAtmosphere;
        }
        vec3 animePalette(vec3 paint) {
          // Work on material color, before lighting: lift the dark baked-in
          // shading and group its gradients into broad painted values. Keep
          // hue and small dark markings; never posterize the final screen/HUD.
          float luma = dot(paint, vec3(0.299, 0.587, 0.114));
          float lifted = pow(max(luma, 0.0001), mix(0.56, 0.88, max(animePainted, animeSoft)));
          float value = lifted * 6.0;
          float edge = clamp(fwidth(value), 0.08, 0.45);
          float bands = (floor(value) + smoothstep(0.5 - edge, 0.5 + edge, fract(value))) / 6.0;
          lifted = mix(lifted, bands, ${pbr ? '0.72' : '0.48'} * (1.0 - max(animePainted, animeSoft)));
          // Retain black linework/eyes and HDR per-instance hit flashes.
          lifted = mix(luma, lifted, smoothstep(0.025, 0.12, luma));
          vec3 color = paint * (lifted / max(luma, 0.0001));
          return max(vec3(0.0), mix(vec3(lifted), color, 1.13));
        }
        #endif
      `,
      CUSTOM_FRAGMENT_BEFORE_FOG: `
        #ifdef ANIME_TOON
        ${pbr
          ? `vec3 animeColor = animePalette(toGammaSpace(animeAlbedo)) * animeLight(normalW, viewDirectionW);
             finalColor.rgb = toLinearSpace(animeColor) + finalEmissive;`
          : 'color.rgb = animePalette(baseColor.rgb * diffuseColor) * animeLight(normalW, viewDirectionW) + emissiveColor;'}
        #endif
      `,
    };
  }

  override dispose(): void { this.state.plugins.delete(this); }
}

function attach(material: Material): AnimeToon | null {
  const state = states.get(material.getScene());
  if (state && (material instanceof StandardMaterial || material instanceof PBRMaterial)
    && !material.pluginManager?.getPlugin('AnimeToon')) return new AnimeToon(material, state);
  return null;
}

/** One controller per scene, shared by the MOBA and survivor renderers. */
export function createAnimeLook(scene: Scene, camera: Camera, sun: DirectionalLight) {
  const state: ToonState = { enabled: false, sun, atmosphere: Color3.White(), atmosphereShade: Color3.White(), playerFill: 0, playerMaterials: new Set(), plugins: new Set() };
  states.set(scene, state);
  RegisterMaterialPlugin('AnimeToon', attach);
  for (const material of scene.materials) attach(material);
  const units = new Map<Mesh, boolean>();
  let dirty = true;
  function refresh(): void {
    dirty = false;
    for (const mesh of scene.meshes) {
      if (!(mesh instanceof Mesh) || !(mesh.skeleton || mesh.bakedVertexAnimationManager)) continue;
      if (!units.has(mesh)) units.set(mesh, mesh.receiveShadows);
      mesh.renderOutline = false;
      mesh.receiveShadows = state.enabled || units.get(mesh)!;
    }
  }

  const added = scene.onNewMeshAddedObservable.add(() => { dirty = true; });
  const removed = scene.onMeshRemovedObservable.add((mesh: AbstractMesh) => { if (mesh instanceof Mesh) units.delete(mesh); });
  const before = scene.onBeforeRenderObservable.add(() => { if (dirty) refresh(); });
  scene.onDisposeObservable.add(() => {
    scene.onNewMeshAddedObservable.remove(added);
    scene.onMeshRemovedObservable.remove(removed);
    scene.onBeforeRenderObservable.remove(before);
    units.clear();state.plugins.clear();state.playerMaterials.clear();states.delete(scene);
  });

  return {
    refresh,
    /** Weather changes only the light palette; cel bands and emissive colors remain. */
    setAtmosphere(light: Color3, shade: Color3): void { state.atmosphere.copyFrom(light);state.atmosphereShade.copyFrom(shade); },
    setPlayerFill(strength: number): void { state.playerFill = strength; },
    setPlayerMeshes(meshes: readonly AbstractMesh[]): void {
      state.playerMaterials.clear();
      for (const mesh of meshes) if (mesh.material) state.playerMaterials.add(mesh.material);
    },
    setEnabled(enabled: boolean): void {
      if (state.enabled === enabled) return;
      state.enabled = enabled;
      refresh();
      for (const plugin of state.plugins) plugin.markAllDefinesAsDirty();
    },
  };
}
