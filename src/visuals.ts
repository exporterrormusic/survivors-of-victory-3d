import {
  type Camera, ColorCurves, Constants, DefaultRenderingPipeline, DirectionalLight,
  FxaaPostProcess, HemisphericLight, ImageProcessingConfiguration, PBRMaterial,
  type Scene, ShadowGenerator, SSAO2RenderingPipeline, StandardMaterial, Vector3,
} from '@babylonjs/core';
import type { World } from './world';

export const VISUAL_PRESETS = {
  daylight: 'Painted daylight',
  warm: 'Warm daylight',
  cool: 'Cool woodland',
  original: 'Previous lighting (compare)',
} as const;
export type VisualPreset = keyof typeof VISUAL_PRESETS;

/** First lighting pass: directional depth, contact shading and restrained grades.
 * All three grades share the same lighting. DOM portraits/HUD stay outside the pass. */
export function createVisualSettings(scene: Scene, camera: Camera, world: World) {
  const sun = scene.getLightByName('sun') as DirectionalLight;
  const hemi = scene.getLightByName('hemi') as HemisphericLight;
  const image = scene.imageProcessingConfiguration;
  const rim = new DirectionalLight('unit-rim', new Vector3(.5, -.35, -1).normalize(), scene);
  rim.diffuse.set(.8, .9, 1);rim.specular.copyFrom(rim.diffuse);
  rim.intensity = 0;
  const unitMaterials = new Map<PBRMaterial, number | null>();
  const curves = new ColorCurves();
  const aoSupported = SSAO2RenderingPipeline.IsSupported;
  const caps = scene.getEngine().getCaps();
  const textureType = caps.textureHalfFloatRender ? Constants.TEXTURETYPE_HALF_FLOAT : Constants.TEXTURETYPE_UNSIGNED_BYTE;
  let pipeline: DefaultRenderingPipeline | null = null;
  let occlusion: SSAO2RenderingPipeline | null = null;
  let legacyAA: FxaaPostProcess | null = null;
  let ambientShadows = true;
  let current: VisualPreset = 'original';

  function refreshUnits(): void {
    rim.includedOnlyMeshes = scene.meshes.filter(mesh => !!mesh.skeleton);
    for (const mesh of rim.includedOnlyMeshes) {
      if (!(mesh.material instanceof PBRMaterial)) continue;
      const material = mesh.material;
      if (!unitMaterials.has(material)) unitMaterials.set(material, material.roughness);
      material.roughness = Math.min(unitMaterials.get(material) ?? 1, .72);
    }
  }

  function disposePipeline(): void {
    pipeline?.dispose();pipeline = null;
    occlusion?.dispose(true);occlusion = null;
    legacyAA?.dispose(camera);legacyAA = null;
  }

  function buildPipeline(): void {
    disposePipeline();
    if (current === 'original') {
      legacyAA = new FxaaPostProcess('previous-lighting-aa', 1, camera);
      return;
    }
    // AO precedes grading/AA. Preserve HDR scene color through the AO composite.
    // Geometry buffer avoids a prepass changing the custom terrain material path.
    if (ambientShadows && aoSupported) {
      occlusion = new SSAO2RenderingPipeline('outpost-contact-shadows', scene,
        { ssaoRatio: .5, blurRatio: 1 }, [camera], true, textureType);
      occlusion.samples = 16;occlusion.radius = .8;occlusion.totalStrength = .65;
      occlusion.base = 0;occlusion.maxZ = 120;occlusion.epsilon = .025;
      occlusion.bilateralSamples = 8;occlusion.bilateralSoften = .25;
    }
    pipeline = new DefaultRenderingPipeline('outpost-lighting', true, scene, [camera]);
    pipeline.fxaaEnabled = true;
    // Existing selective GlowLayer handles energy/abilities. No second bloom pass.
    pipeline.bloomEnabled = false;
  }

  function grade(preset: VisualPreset): void {
    image.colorGradingEnabled = false;
    image.colorCurvesEnabled = preset !== 'original';
    image.colorCurves = curves;
    // Parametric color grades, kept editable while the art direction is being tuned.
    curves.globalSaturation = preset === 'cool' ? -6 : 3;
    curves.shadowsHue = preset === 'cool' ? 215 : 220;
    curves.shadowsDensity = preset === 'cool' ? 18 : 9;
    curves.shadowsExposure = 0;
    curves.highlightsHue = 38;
    curves.highlightsDensity = preset === 'warm' ? 38 : preset === 'cool' ? 3 : 9;
    curves.midtonesHue = preset === 'cool' ? 205 : 36;
    curves.midtonesDensity = preset === 'warm' ? 32 : preset === 'cool' ? 14 : 0;
    image.toneMappingEnabled = preset !== 'original';
    image.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_KHR_PBR_NEUTRAL;
    image.exposure = preset === 'original' ? 1.03 : 1.12;
    image.contrast = preset === 'original' ? 1 : 1.04;
  }

  /** Every image-processing, light or material edit rescans all meshes once per material;
   * a preset makes dozens of edits (measured 440-800 ms). Invalidate once at the end instead. */
  function batched(change: () => void): void {
    scene.blockMaterialDirtyMechanism = true;
    try { change(); } finally { scene.blockMaterialDirtyMechanism = false; }
  }

  scene.onDisposeObservable.add(disposePipeline);
  return {
    get current(): VisualPreset { return current; },
    get ambientShadowsSupported(): boolean { return aoSupported; },
    refreshUnits,
    setAmbientShadows(enabled: boolean): void {
      if (ambientShadows === enabled) return;
      ambientShadows = enabled;
      if (current !== 'original') batched(buildPipeline);
    },
    apply(preset: VisualPreset): void { batched(() => applyPreset(preset)); },
  };

  function applyPreset(preset: VisualPreset): void {
    const changedFamily = (current === 'original') !== (preset === 'original');
    current = preset;
    refreshUnits();
    const previous = preset === 'original';
    // The previous paint was unintentionally self-lit: emissiveTexture adds its
    // full color in StandardMaterial, independently of emissiveColor's value.
    for (const material of scene.materials) {
      if (!(material instanceof StandardMaterial) || !material.metadata?.atlas) continue;
      material.emissiveTexture = previous ? material.diffuseTexture : null;
      material.emissiveColor.set(previous ? .12 : 0, previous ? .12 : 0, previous ? .12 : 0);
      material.diffuseColor.set(previous ? .76 : .95, previous ? .78 : .97, previous ? .8 : 1);
    }
    if (previous) {
      sun.direction.set(-.45, -1, .35).normalize();
      sun.diffuse.set(1, .95, .86);sun.intensity = 1.2;
      hemi.diffuse.set(.82, .91, 1);hemi.groundColor.set(.26, .3, .35);hemi.intensity = .6;
      rim.intensity = .55;world.shadows.darkness = .3;
    } else {
      sun.direction.set(-.55, -.8, .4).normalize();
      sun.diffuse.set(1, .94, .83);sun.intensity = 1.65;
      hemi.diffuse.set(.69, .82, 1);hemi.groundColor.set(.17, .22, .3);hemi.intensity = .48;
      rim.intensity = .38;world.shadows.darkness = .2;
    }
    world.glow.intensity = .45;
    world.shadows.usePercentageCloserFiltering = true;
    world.shadows.filteringQuality = previous ? ShadowGenerator.QUALITY_MEDIUM : ShadowGenerator.QUALITY_HIGH;
    grade(preset);
    if (changedFamily || (!pipeline && !legacyAA)) buildPipeline();
  }
}
