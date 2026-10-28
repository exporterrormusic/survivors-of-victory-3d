import { Constants, GlowLayer, Mesh, ShaderMaterial, Vector3, VertexData } from '@babylonjs/core';
import type { KitContext } from '../kit';
import { SWORD_HALF_ANGLE, SWORD_SWEEP_SECONDS } from './mechanics';

// Original GLSL implementation of a UV-unwrapped arc with a travelling reveal.
// Reference technique: cyanilux.com/tutorials/sword-slash-shader-breakdown/
const vertexSource = `
precision highp float;
attribute vec3 position;
attribute vec2 uv;
uniform mat4 worldViewProjection;
uniform mat4 world;
uniform mat4 view;
varying vec2 vUV;
varying float fogDistance;
void main() {
  vUV = uv;
  fogDistance = length((view * world * vec4(position, 1.0)).xyz);
  gl_Position = worldViewProjection * vec4(position, 1.0);
}
`;
const fragmentSource = `
precision highp float;
varying vec2 vUV;
uniform float age;
uniform float glowPass;
uniform float waveMode;
uniform vec4 fogInfo;
uniform vec3 fogColor;
varying float fogDistance;
float electricHash(float x) { return fract(sin(x * 127.1 + 311.7) * 43758.5453); }
float electricZig(float x, float seed) {
  float cell = floor(x);
  return mix(electricHash(cell + seed), electricHash(cell + 1.0 + seed), fract(x)) * 2.0 - 1.0;
}
void main() {
  float u = vUV.x, r = vUV.y;
  float reveal = clamp(age / ${SWORD_SWEEP_SECONDS.toFixed(3)}, 0.0, 1.0);
  float head = 1.0 - smoothstep(reveal - .003, reveal + .003, u);
  // Broad close-range sweep with a fixed outer cutting edge and pointed ends.
  // No wavy contour or soft radial glow on the white blade.
  float taper = 4.0 * u * (1.0 - u);
  float outer = .97;
  float inner = outer - .38 * taper;
  float blade = smoothstep(inner, inner + .004, r) * (1.0 - smoothstep(outer - .003, outer, r));
  float rim = smoothstep(inner - .022 * taper, inner - .018 * taper, r) * (1.0 - smoothstep(inner, inner + .004, r));
  // Broken parallel speed scratches live behind the blade, never deform its edge.
  float scratch1 = step(.035, u) * (1.0 - step(.71, u)) *
    step(abs(r - (inner - .065)), .006 * taper);
  float scratch2 = step(.23, u) * (1.0 - step(.94, u)) *
    step(abs(r - (inner - .115)), .004 * taper);
  float cuts = step(.25, fract(u * 11.0 + r * 3.0));
  float scratches = (scratch1 + scratch2) * cuts;
  float fade = 1.0 - smoothstep(.20, .30, age);
  float tail = smoothstep((age - .16) * 4.0 - .04, (age - .16) * 4.0, u);
  // Bright ivory-lavender sweep with a restrained purple tint toward the inner edge.
  float across = clamp((r - inner) / max(.001, outer - inner), 0.0, 1.0);
  float highlight = smoothstep(.08, .42, across);
  float alpha = (blade * .96 + rim * .9 + scratches * .75) * head * fade * tail;
  vec3 color = blade > .5 ? mix(vec3(.72, .53, .87), vec3(.89, .86, .94), highlight) : vec3(.60, .17, .95);
  if (waveMode > .5) {
    // One continuous energy blade. Ripples modulate its color and inner wake,
    // never cut holes through the body or interrupt the outer cutting edge.
    float ripple = sin(u * 25.0 - age * 27.0 + sin(r * 15.0 + age * 9.0) * 1.1);
    float fine = sin(u * 49.0 + r * 22.0 - age * 38.0);
    float waveInner = .96 - .32 * taper + ripple * .018 * taper;
    float body = smoothstep(waveInner, waveInner + .018, r) * (1.0 - smoothstep(.963, .975, r));
    float acrossWave = clamp((r - waveInner) / max(.001, .97 - waveInner), 0.0, 1.0);
    vec3 purple = vec3(.64, .19, 1.12);
    color = mix(vec3(.73, .53, .94), vec3(.98, .94, 1.06), smoothstep(.05, .36, acrossWave));
    color += vec3(.035, .025, .045) * (ripple * .6 + fine * .4);
    // Angular, forked bolts crawl through the purple blade. Only the narrow
    // discharge cores go white; the travelling mass stays strongly violet.
    float tick = floor(age * 22.0);
    float bolt = 0.0, corona = 0.0;
    for (int i = 0; i < 4; i++) {
      float fi = float(i);
      float seed = fi * 37.0 + tick * 11.0;
      float spine = .18 + fi * .20 + electricZig(u * 25.0, seed) * .15;
      float distanceToBolt = abs(acrossWave - spine);
      float core = 1.0 - smoothstep(.008, .022, distanceToBolt);
      float halo = 1.0 - smoothstep(.02, .095, distanceToBolt);
      float branchStart = .18 + fi * .23;
      float branchU = u - branchStart;
      float junction = .18 + fi * .20 + electricZig(branchStart * 25.0, seed) * .15;
      float fork = junction + branchU * (fi == 1.0 ? -2.2 : 2.0) + electricZig(branchU * 35.0, seed + 5.0) * .045;
      float forkMask = step(0.0, branchU) * (1.0 - smoothstep(.13, .22, branchU));
      float forkLine = (1.0 - smoothstep(.006, .017, abs(acrossWave - fork))) * forkMask;
      bolt = max(bolt, max(core, forkLine));
      corona = max(corona, halo);
    }
    color += vec3(.22, .07, .32) * corona;
    color = mix(color, vec3(.72, .31, 1.24), bolt * .65);
    float edge = smoothstep(.94, .99, acrossWave);
    color = mix(color, vec3(1.18, 1.10, 1.28), edge);
    float wake = smoothstep(waveInner - .07 * taper, waveInner - .035 * taper, r) *
      (1.0 - smoothstep(waveInner - .01, waveInner + .01, r));
    float arrive = smoothstep(0.0, .025, age);
    float depart = 1.0 - smoothstep(1.68, 1.8, age);
    alpha = (body * .97 + wake * .55) * arrive * depart;
    if (body < .1) color = purple;
    color *= 1.50;
  }
  if (alpha < .005) discard;
  float visibility = 1.0;
  if (fogInfo.x == 1.0) visibility = exp(-fogDistance * fogInfo.w);
  else if (fogInfo.x == 2.0) visibility = exp(-pow(fogDistance * fogInfo.w, 2.0));
  else if (fogInfo.x == 3.0) visibility = clamp((fogInfo.z - fogDistance) / max(.001, fogInfo.z - fogInfo.y), 0.0, 1.0);
  // Fog tints the visible surface; only transmitted light contributes to bloom.
  // Normal scene fog only: the forest volume already applies its own attenuation.
  vec3 surface = mix(fogColor, color, visibility);
  // The special's bloom is violet even where its visible cutting edge is white.
  vec3 waveEmission = mix(color, vec3(.90, .18, 1.50), .80) * 1.65;
  vec3 emission = mix(color * .30, waveEmission, waveMode) * visibility;
  gl_FragColor = vec4(mix(surface, emission, glowPass), min(1.0, alpha));
}`;

/** Small fixed pool: no mesh/material allocations when swinging. Pauses with Vfx time. */
export class SwordSweep {
  private readonly pool: { mesh: Mesh; material: ShaderMaterial; busy: boolean }[] = [];
  constructor(private readonly ctx: KitContext, private readonly waveMode = false) {
    for (let slot = 0; slot < 3; slot++) {
      const mesh = new Mesh(`scarlet-${waveMode ? 'dash-wave' : 'sword-sweep'}-${slot}`, ctx.scene);
      const positions: number[] = [], uvs: number[] = [], indices: number[] = [];
      const segments = 96;
      for (let i = 0; i <= segments; i++) {
        const u = i / segments, halfAngle = SWORD_HALF_ANGLE, angle = -halfAngle + u * 2 * halfAngle;
        for (const radial of [0, 1]) {
          const radius = waveMode ? .45 + radial * 1.65 : .55 + radial * 3.35;
          positions.push(Math.sin(angle) * radius, .85 + Math.sin(angle) * .12, Math.cos(angle) * radius - (waveMode ? 1.25 : 0));
          uvs.push(u, radial);
        }
        if (i < segments) { const n = i * 2; indices.push(n, n + 1, n + 2, n + 1, n + 3, n + 2); }
      }
      const data = new VertexData(); data.positions = positions; data.uvs = uvs; data.indices = indices; data.applyToMesh(mesh);
      const material = new ShaderMaterial(`scarlet-sword-material-${slot}`, ctx.scene,
        { vertexSource, fragmentSource }, { attributes: ['position', 'uv'], uniforms: ['worldViewProjection', 'world', 'view', 'age', 'glowPass', 'waveMode', 'fogInfo', 'fogColor'], needAlphaBlending: true });
      material.backFaceCulling = false; material.disableDepthWrite = true; material.alphaMode = Constants.ALPHA_COMBINE;
      material.setFloat('age', 0);
      material.setFloat('waveMode', waveMode ? 1 : 0);
      let glowPass = 0;
      material.onBindObservable.add(() => {
        const effect = material.getEffect();
        effect?.setFloat('glowPass', glowPass);
        effect?.setFloat4('fogInfo', ctx.scene.fogEnabled ? ctx.scene.fogMode : 0, ctx.scene.fogStart, ctx.scene.fogEnd, ctx.scene.fogDensity);
        effect?.setColor3('fogColor', ctx.scene.fogColor);
      });
      const glow = ctx.scene.effectLayers?.find(layer => layer instanceof GlowLayer) as GlowLayer | undefined;
      if (glow) {
        glow.addIncludedOnlyMesh(mesh);
        glow.referenceMeshToUseItsOwnMaterial(mesh);
        const before = glow.onBeforeRenderMeshToEffect.add(rendered => { if (rendered === mesh) glowPass = 1; });
        const after = glow.onAfterRenderMeshToEffect.add(rendered => { if (rendered === mesh) glowPass = 0; });
        mesh.onDisposeObservable.addOnce(() => {
          glow.onBeforeRenderMeshToEffect.remove(before);
          glow.onAfterRenderMeshToEffect.remove(after);
          glow.removeIncludedOnlyMesh(mesh);
          glow.unReferenceMeshFromUsingItsOwnMaterial(mesh);
        });
      }
      mesh.material = material; mesh.isPickable = false; mesh.setEnabled(false);
      this.pool.push({ mesh, material, busy: false });
    }
  }
  async prepare(): Promise<void> {
    await Promise.all(this.pool.map(p => p.material.forceCompilationAsync(p.mesh)));
  }
  /** One persistent visual follows the authoritative projectile until hit/expiry/recast. */
  launchWave(position: Vector3, yaw: number, scale: number, alive: () => boolean): void {
    const slot = this.pool.find(p => !p.busy);
    if (!slot) return;
    slot.busy = true; slot.mesh.position.copyFrom(position); slot.mesh.rotation.y = yaw;
    slot.mesh.scaling.set(scale * 1.35, 1, scale * 1.35); slot.material.setFloat('age', 0); slot.mesh.setEnabled(true);
    this.ctx.vfx.add({ update: (_dt, age) => {
      if (!alive()) return false;
      slot.mesh.position.copyFrom(position); slot.material.setFloat('age', age);
      return true;
    }, dispose: () => { slot.mesh.setEnabled(false); slot.busy = false; } });
  }
  fire(origin: Vector3, yaw: number, onSweep: (wipe: number) => void): void {
    const slot = this.pool.find(p => !p.busy);
    if (!slot) return;
    slot.busy = true; slot.mesh.position.copyFrom(origin); slot.mesh.rotation.y = yaw;
    slot.material.setFloat('age', .001); slot.mesh.setEnabled(true);
    this.ctx.vfx.add({ update: (_dt, age) => {
      slot.mesh.position.copyFrom(origin); slot.material.setFloat('age', age);
      slot.mesh.setEnabled(age < .30);
      if (age <= .30) onSweep(Math.min(1, age / SWORD_SWEEP_SECONDS));
      return age < .4;
    }, dispose: () => {
      slot.mesh.setEnabled(false); slot.busy = false;
    } });
  }
}
