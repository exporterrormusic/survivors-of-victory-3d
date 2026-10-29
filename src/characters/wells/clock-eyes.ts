import { MaterialPluginBase, PBRMaterial, type AbstractMesh, type MaterialDefines, type UniformBuffer } from '@babylonjs/core';

/** Delicate luminous clocks drawn in the existing iris UV island, so the
 * markings follow the skinned face without floating decals or extra meshes. */
export class WellsClockEyes extends MaterialPluginBase {
  elapsed = 0;
  private lastFrame = -1;
  /** Review tools can hold an exact phase; normal gameplay leaves this null. */
  previewTime: number | null = null;

  constructor(material: PBRMaterial) {
    super(material, 'WellsClockEyes', 190, { WELLS_CLOCK_EYES: false }, true, false);
    this.doNotSerialize = true;
    this.registerForExtraEvents = true;
    this._enable(true);
  }

  override getClassName(): string { return 'WellsClockEyes'; }

  override prepareDefines(defines: MaterialDefines): void {
    // Keep this shader's extra uniform layout out of the rifle's effect cache.
    (defines as MaterialDefines & { WELLS_CLOCK_EYES: boolean }).WELLS_CLOCK_EYES = true;
  }

  override getUniforms() {
    return {
      ubo: [{ name: 'wellsClockTime', size: 1, type: 'float' }],
      fragment: 'uniform float wellsClockTime;',
    };
  }

  override hardBindForSubMesh(buffer: UniformBuffer) {
    const scene = this._material.getScene();
    if (this.lastFrame !== scene.getFrameId()) {
      this.lastFrame = scene.getFrameId();
      this.elapsed += Math.min(.1, Math.max(0, scene.getEngine().getDeltaTime() / 1000));
    }
    buffer.updateFloat('wellsClockTime', this.previewTime ?? this.elapsed);
    buffer.update();
  }

  override getCustomCode(shaderType: string) {
    if (shaderType !== 'fragment') return null;
    return {
      CUSTOM_FRAGMENT_DEFINITIONS: `
float wellsSegment(vec2 p, vec2 a, vec2 b) {
  vec2 d = b-a;
  return length(p-a-d*clamp(dot(p-a,d)/dot(d,d),0.0,1.0));
}
float wellsClockEnvelope(float time) {
  // Three unequal quiet intervals repeat over 47 seconds. Each appearance
  // lasts four seconds, with soft 1.2-second fade-in and 1.4-second fade-out.
  float t = mod(time,47.0);
  float age = t<17.0 ? t-4.0 : (t<31.0 ? t-20.0 : t-36.0);
  return smoothstep(0.0,1.2,age)*(1.0-smoothstep(2.6,4.0,age));
}
vec2 wellsClockLight(vec2 uv, float time) {
  // Top-left PNG coordinates of the shared, mirrored Product 08 iris island.
  vec2 p = (uv-vec2(0.087,0.241))/vec2(0.027,0.027);
  float radius = length(p);
  if(radius>1.05) return vec2(0.0);
  float d = abs(radius-0.84);
  for(int i=0;i<12;i++) {
    float a = float(i)*6.28318530718/12.0;
    vec2 dir = vec2(sin(a),-cos(a));
    float inside = mod(float(i),3.0)<0.5 ? 0.66 : 0.73;
    d = min(d,wellsSegment(p,dir*inside,dir*0.81));
  }
  float minute = time*1.65;
  float hour = time*0.1375+1.1;
  d = min(d,wellsSegment(p,vec2(0.0),vec2(sin(minute),-cos(minute))*0.67));
  d = min(d,wellsSegment(p,vec2(0.0),vec2(sin(hour),-cos(hour))*0.43));
  d = min(d,abs(radius-0.045));
  float aa = max(fwidth(d),0.006);
  float fine = 1.0-smoothstep(0.008,0.008+aa,d);
  float halo = exp(-d*32.0)*0.45;
  float edge = 1.0-smoothstep(0.94,1.02,radius);
  return vec2(fine,halo)*edge*wellsClockEnvelope(time);
}
`,
      CUSTOM_FRAGMENT_BEFORE_FINALCOLORCOMPOSITION: `
#ifdef ALBEDO
  // A small emissive halo provides glow without making the dial opaque.
  finalEmissive += vec3(wellsClockLight(vAlbedoUV, wellsClockTime).y*0.15);
#endif
`,
      CUSTOM_FRAGMENT_BEFORE_FRAGCOLOR: `
#ifdef ALBEDO
  vec2 clockInk = wellsClockLight(vAlbedoUV, wellsClockTime);
  float clockOpacity = clamp(clockInk.x*0.58+clockInk.y*0.12,0.0,0.68);
  // Screen blend with translucent white: preserve the blue iris underneath.
  finalColor.rgb = vec3(1.0)-(vec3(1.0)-finalColor.rgb)*(1.0-clockOpacity);
#endif
`,
    };
  }
}

export function attachWellsClockEyes(variant: string, meshes: readonly AbstractMesh[]): void {
  if (variant !== 'wells_research') return;
  for (const mesh of meshes) {
    const material = mesh.material;
    if (!(material instanceof PBRMaterial) || material.name !== 'c302_00') continue;
    if (!material.pluginManager?.getPlugin('WellsClockEyes')) new WellsClockEyes(material);
  }
}
