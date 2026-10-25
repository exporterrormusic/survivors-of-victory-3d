import { Color3, type DirectionalLight, MaterialPluginBase, PBRMaterial, type Scene, type UniformBuffer } from '@babylonjs/core';

interface MetalState { sun: DirectionalLight; color: Color3; polish: number }

/** A restrained painted-metal reflection, shared by every instance of an enemy material.
 * Added after Anime's custom lighting, before fog/grading, so it survives every art preset. */
class EnemyMetal extends MaterialPluginBase {
  constructor(material: PBRMaterial, private readonly state: MetalState) {
    super(material, 'EnemyMetal', 270, {}, true, true);
    this.doNotSerialize = true;
  }
  override getClassName(): string { return 'EnemyMetal'; }
  override getUniforms() {
    return {
      ubo: [{ name: 'enemyMetalPolish', size: 1, type: 'float' }, { name: 'enemyMetalSun', size: 3, type: 'vec3' }, { name: 'enemyMetalColor', size: 3, type: 'vec3' }],
      fragment: 'uniform float enemyMetalPolish;\nuniform vec3 enemyMetalSun;\nuniform vec3 enemyMetalColor;',
    };
  }
  override bindForSubMesh(buffer: UniformBuffer): void {
    const d = this.state.sun.direction;
    buffer.updateFloat3('enemyMetalSun', -d.x, -d.y, -d.z);
    buffer.updateColor3('enemyMetalColor', this.state.color);
    buffer.updateFloat('enemyMetalPolish', this.state.polish);
  }
  override getCustomCode(type: string): Record<string, string> | null {
    if (type !== 'fragment') return null;
    return {
      CUSTOM_FRAGMENT_BEFORE_LIGHTS: 'vec3 enemyMetalPaint = surfaceAlbedo;',
      CUSTOM_FRAGMENT_BEFORE_FOG: `
        vec3 metalPaint = toGammaSpace(enemyMetalPaint);
        float metalValue = max(metalPaint.r, max(metalPaint.g, metalPaint.b));
        float redDetail = smoothstep(.08, .35, (metalPaint.r - max(metalPaint.g, metalPaint.b)) / max(metalValue, .001));
        float metalMask = smoothstep(.10, .30, metalValue) * (1.0 - .95 * redDetail);
        vec3 metalNormal = normalize(normalW);
        vec3 metalView = normalize(viewDirectionW);
        vec3 metalHalf = normalize(metalView + normalize(enemyMetalSun));
        float metalFacing = max(0.0, dot(metalNormal, metalHalf));
        // Broad painted bands with derivative smoothing to avoid sparkling at range.
        float metalAA = max(.012, fwidth(metalFacing) * 1.5);
        float metalBand = smoothstep(.80 - metalAA, .80 + metalAA, metalFacing);
        float metalGlint = smoothstep(.96 - metalAA, .96 + metalAA, metalFacing);
        float metalLit = smoothstep(-.05, .25, dot(metalNormal, normalize(enemyMetalSun)));
        float metalKey = mix(pow(metalFacing, 26.0) * .20 + pow(metalFacing, 85.0) * .28,
          (metalBand * .19 + metalGlint * .15) * metalLit, enemyMetalPolish);
        vec3 metalReflection = reflect(-metalView, metalNormal);
        float metalSky = pow(max(0.0, dot(metalReflection, normalize(vec3(-.35, .8, -.45)))), 18.0) * .13;
        float metalEdge = pow(1.0 - max(0.0, dot(metalNormal, metalView)), 4.0) * .045;
        #ifdef ANIME_TOON
          metalKey *= mix(.3, 1.0, animeShadow);
        #endif
        // Retain the armor paint instead of laying a flat white stripe over its details.
        vec3 metalTint = mix(vec3(1.0), clamp(metalPaint, 0.0, 1.0), .28 * enemyMetalPolish);
        finalColor.rgb += enemyMetalColor * metalTint * (metalKey + metalSky + metalEdge) * metalMask;
      `,
    };
  }
}

export function createEnemyMetal(scene: Scene, sun: DirectionalLight) {
  const state: MetalState = { sun, color: new Color3(.80,.87,1), polish: 1 };
  let dirty = true;
  function refresh(): void {
    dirty = false;
    for (const material of scene.materials) {
      if (material instanceof PBRMaterial && material.metadata?.enemyRedGlow && !material.pluginManager?.getPlugin('EnemyMetal'))
        new EnemyMetal(material,state);
    }
  }
  const added = scene.onNewMeshAddedObservable.add(() => { dirty = true; });
  const before = scene.onBeforeRenderObservable.add(() => { if (dirty) refresh(); });
  scene.onDisposeObservable.add(() => {
    scene.onNewMeshAddedObservable.remove(added);scene.onBeforeRenderObservable.remove(before);
  });
  return {
    refresh,
    setPolish(enabled: boolean): void { state.polish = enabled ? 1 : 0; },
    setAtmosphere(night: number, dusk: number, flash: number): void {
      state.color.set(.80 - night * .16 + dusk * .14 + flash * .50,
        .87 - night * .13 + dusk * .04 + flash * .52, 1 - night * .10 - dusk * .10 + flash * .55);
    },
  };
}
