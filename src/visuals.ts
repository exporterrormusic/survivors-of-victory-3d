import {
  type AbstractMesh, type Camera, Color3, ColorCurves, Constants, DefaultRenderingPipeline, DirectionalLight,
  FxaaPostProcess, HemisphericLight, ImageProcessingConfiguration, PBRMaterial,
  type Scene, ShadowGenerator, SSAO2RenderingPipeline, StandardMaterial, Vector3,
} from '@babylonjs/core';
import type { World } from './world';
import { createAnimeLook } from './toon';
import { createEnemyRedGlow } from './enemy-glow';
import { createEnemyMetal } from './enemy-metal';

export const VISUAL_PRESETS = {
  anime: 'Anime',
  daylight: 'Painted daylight',
  warm: 'Warm daylight',
  cool: 'Cool woodland',
  original: 'Previous lighting (compare)',
} as const;
export type VisualPreset = keyof typeof VISUAL_PRESETS;

/** Scene lighting and switchable cel shading. DOM portraits/HUD stay outside the pass. */
export function createVisualSettings(scene: Scene, camera: Camera, world: Pick<World, 'shadows' | 'glow'>) {
  const sun = scene.getLightByName('sun') as DirectionalLight;
  const hemi = scene.getLightByName('hemi') as HemisphericLight;
  const toon = createAnimeLook(scene, camera, sun);
  const enemyGlow = createEnemyRedGlow(scene, camera);
  const enemyMetal = createEnemyMetal(scene, sun);
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
  let polish = true;
  let current: VisualPreset = 'original';
  const atmosphere = { night: 0, dusk: 0, clouds: 0, flash: 0, petals: 0, overcast: 0, ashen: 0 };
  const base = { sun: new Color3(), sky: new Color3(), ground: new Color3(), direction: new Vector3(), sunPower: 1, skyPower: 1, rimPower: 0, exposure: 1 };
  const sunsetDirection = new Vector3(-.85,-.36,.32).normalize();
  const moonDirection = new Vector3(.5,-.85,.3).normalize();
  const toonLight = new Color3(), toonShade = new Color3();
  const lightningWhite = new Color3(.92,.96,1);
  let playerFill: HemisphericLight | null = null;
  let baseReady = false;

  const ashSun = new Color3(1, .7, .5), ashSky = new Color3(.56, .48, .45), ashBounce = new Color3(.62, .26, .1);
  const ashToonLight = new Color3(.88, .76, .7), ashToonShade = new Color3(.78, .62, .56);
  function applyAtmosphere(): void {
    if (!baseReady) return;
    const { night, dusk, clouds, flash, petals, overcast, ashen } = atmosphere;
    // Night already supplies the dark palette. Cloud cover only nudges it further.
    const cloudShade = clouds * (1 - night * .8);
    Vector3.LerpToRef(base.direction,sunsetDirection,dusk,sun.direction);sun.direction.normalize();
    Vector3.LerpToRef(sun.direction,moonDirection,night,sun.direction);sun.direction.normalize();
    sun.diffuse.set(base.sun.r * (1 - night * .48 + dusk * .10), base.sun.g * (1 - night * .28 - dusk * .09), base.sun.b * (1 + night * .15 - dusk * .28));
    Color3.LerpToRef(sun.diffuse,lightningWhite,Math.min(1,flash*.7),sun.diffuse);
    sun.intensity = base.sunPower * (1 - night * .58) * (1 - cloudShade * .6) + flash * 2.5;
    hemi.diffuse.set(base.sky.r * (1 - night * .35), base.sky.g * (1 - night * .18 - dusk * .05), base.sky.b);
    hemi.groundColor.set(base.ground.r * (1 - night * .4), base.ground.g * (1 - night * .3), base.ground.b * (1 - night * .1));
    Color3.LerpToRef(hemi.diffuse,lightningWhite,Math.min(1,flash*.7),hemi.diffuse);
    hemi.intensity = base.skyPower * (1 - night * .42) * (1 + cloudShade * .12) + flash * .65;
    rim.intensity = base.rimPower * (1 + night * .2);
    image.exposure = base.exposure * (1 - night * .28 - cloudShade * .08 - dusk * .04 + flash * .10);
    // A soft edge falloff uses the existing grading pass and leaves the HUD untouched.
    image.vignetteEnabled = night > .001;
    image.vignetteWeight = night * .45;
    image.vignetteCameraFov = .7;
    image.vignetteStretch = .5;
    // Keep cool moonlit faces readable while deepening the cel shadows, rather than
    // increasing saturation across the painted textures and character skin.
    toonLight.set((1 - night * .50 + dusk * .12 - cloudShade * .12) + flash * .82,
      (1 - night * .35 - dusk * .06 - cloudShade * .08) + flash * .82,
      (1 - night * .10 - dusk * .21) + flash * .8);
    toonShade.set((1 - night * .64 - dusk * .07 - cloudShade * .12) + flash * .72,
      (1 - night * .54 - dusk * .06 - cloudShade * .08) + flash * .74,
      (1 - night * .34) + flash * .76);
    // Sakura bounce gently warms both material lighting and the anime pass.
    sun.diffuse.r *= 1 + petals * .07;sun.diffuse.g *= 1 - petals * .06;
    hemi.diffuse.r *= 1 + petals * .10;hemi.diffuse.g *= 1 - petals * .07;
    hemi.groundColor.r *= 1 + petals * .16;
    toonLight.r *= 1 + petals * .045;toonLight.g *= 1 - petals * .045;
    toonShade.r *= 1 + petals * .09;toonShade.g *= 1 - petals * .04;
    if(overcast){
      sun.diffuse.set(.84,.85,.86);sun.intensity=.45;
      sun.direction.set(-.3,-1,.2).normalize();
      hemi.diffuse.set(.74,.75,.76);hemi.groundColor.set(.33,.34,.35);hemi.intensity=.8;
      rim.intensity=0;image.exposure=.92;
      // Compensate the anime shader's warm highlights and blue shadow base.
      toonLight.set(.80,.82,.86);toonShade.set(.91,.84,.73);
    }
    if(ashen){
      // Ashen Caldera: smoke clouds choke the sun to a dim, rust-filtered light; the lava below
      // becomes the main light, so the ambient bounce from the ground runs red.
      Color3.LerpToRef(sun.diffuse,ashSun,ashen,sun.diffuse);sun.intensity*=1-.4*ashen;
      Color3.LerpToRef(hemi.diffuse,ashSky,ashen,hemi.diffuse);Color3.LerpToRef(hemi.groundColor,ashBounce,ashen,hemi.groundColor);
      hemi.intensity*=1-.12*ashen;rim.intensity*=1-.5*ashen;
      image.exposure*=1-.07*ashen;
      image.vignetteEnabled=true;image.vignetteWeight=Math.max(image.vignetteWeight,.3*ashen);
      Color3.LerpToRef(toonLight,ashToonLight,ashen,toonLight);Color3.LerpToRef(toonShade,ashToonShade,ashen,toonShade);
    }
    toon.setAtmosphere(toonLight,toonShade);
    toon.setPlayerFill(night * 1.3);
    if (playerFill) {
      playerFill.intensity = night * .9;
      playerFill.setEnabled(current !== 'anime' && night > .001 && playerFill.includedOnlyMeshes.length > 0);
    }
    enemyGlow.setAtmosphere(night, dusk);
    enemyMetal.setAtmosphere(night, dusk, flash);
  }

  function refreshUnits(): void {
    enemyGlow.refresh();
    enemyMetal.refresh();
    toon.refresh();
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
    // Use the material prepass so baked crowd animation and material normals match the visible pose.
    if (ambientShadows && aoSupported && (polish || current !== 'anime')) {
      occlusion = new SSAO2RenderingPipeline('outpost-contact-shadows', scene,
        { ssaoRatio: .5, blurRatio: 1 }, [camera], !polish, textureType);
      occlusion.samples = 16;occlusion.radius = polish ? .45 : .8;
      occlusion.totalStrength = polish ? (current === 'anime' ? .30 : .40) : .65;
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
    curves.globalSaturation = preset === 'anime' ? 14 : preset === 'cool' ? -6 : 3;
    curves.shadowsHue = preset === 'cool' ? 215 : 220;
    curves.shadowsDensity = preset === 'anime' ? 3 : preset === 'cool' ? 18 : 9;
    curves.shadowsExposure = 0;
    curves.highlightsHue = 38;
    curves.highlightsDensity = preset === 'anime' ? 2 : preset === 'warm' ? 38 : preset === 'cool' ? 3 : 9;
    curves.midtonesHue = preset === 'cool' ? 205 : 36;
    curves.midtonesDensity = preset === 'warm' ? 32 : preset === 'cool' ? 14 : 0;
    image.toneMappingEnabled = preset !== 'original';
    image.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_KHR_PBR_NEUTRAL;
    image.exposure = preset === 'original' ? 1.03 : preset === 'anime' ? 1.20 : 1.12;
    image.contrast = preset === 'original' || preset === 'anime' ? 1 : 1.04;
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
    /** Development A/B: compare the shader pass under identical lighting. */
    setPolish(enabled: boolean): void {
      polish = enabled;
      enemyMetal.setPolish(enabled);
      batched(buildPipeline);
    },
    /** Controlled character only; the fill follows its mesh through movement/animation. */
    setPlayerMeshes(meshes: readonly AbstractMesh[]): void {
      toon.setPlayerMeshes(meshes);
      if (!playerFill) {
        playerFill = new HemisphericLight('player-night-fill',new Vector3(0,1,-.5),scene);
        playerFill.diffuse.set(.86,.91,1);playerFill.groundColor.set(.45,.50,.62);
        playerFill.specular.set(0,0,0);
        playerFill.intensity = 0;playerFill.renderPriority = 1;
      }
      playerFill.includedOnlyMeshes = [...meshes];
      applyAtmosphere();
    },
    /** Compose world atmosphere with the chosen art preset; never rebuild postprocessing. */
    setAtmosphere(night: number, dusk: number, clouds: number, flash: number, petals = 0, overcast = 0, ashen = 0): void {
      if (atmosphere.night === night && atmosphere.dusk === dusk && atmosphere.clouds === clouds && atmosphere.flash === flash && atmosphere.petals === petals && atmosphere.overcast === overcast && atmosphere.ashen === ashen) return;
      Object.assign(atmosphere, { night, dusk, clouds, flash, petals, overcast, ashen });
      applyAtmosphere();
    },
    setAmbientShadows(enabled: boolean): void {
      if (ambientShadows === enabled) return;
      ambientShadows = enabled;
      if (current !== 'original') batched(buildPipeline);
    },
    apply(preset: VisualPreset): void { batched(() => applyPreset(preset)); },
  };

  function applyPreset(preset: VisualPreset): void {
    const changedFamily = (current === 'original') !== (preset === 'original')
      || (current === 'anime') !== (preset === 'anime');
    current = preset;
    toon.setEnabled(preset === 'anime');
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
    if (preset === 'anime') {
      rim.intensity = 0;
      world.shadows.darkness = .15;
    }
    world.shadows.usePercentageCloserFiltering = true;
    world.shadows.filteringQuality = previous ? ShadowGenerator.QUALITY_MEDIUM : ShadowGenerator.QUALITY_HIGH;
    grade(preset);
    base.sun.copyFrom(sun.diffuse);base.sky.copyFrom(hemi.diffuse);base.ground.copyFrom(hemi.groundColor);
    base.direction.copyFrom(sun.direction);
    base.sunPower = sun.intensity;base.skyPower = hemi.intensity;base.rimPower = rim.intensity;base.exposure = image.exposure;
    baseReady = true;
    applyAtmosphere();
    if (changedFamily || (!pipeline && !legacyAA)) buildPipeline();
  }
}
