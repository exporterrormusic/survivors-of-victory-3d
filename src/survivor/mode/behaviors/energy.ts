// The Rapture attack look, after NIKKE's Rapture lasers: every enemy beam, shell and blast is the
// same unstable crimson energy, drawn as real 3D volumes that writhe.
// - The mesh itself is displaced by moving noise, so silhouettes boil and kink instead of being
//   clean tubes and spheres.
// - The surface is domain-warped turbulence: deep blood-red plasma with near-black scorched
//   pockets, threaded by ridged-noise lightning arcs that crawl and flicker.
// - Alpha-blended, not additive, so it stays a dark saturated red over the bright scene; only the
//   thin core and the arcs run hot.
// - EnergyBeam: a writhing tube. EnergyOrb: a boiling sphere (comet head, or a blast dome when
//   flattened on the ground). energyBlast() / energyPillar(): one-shot effects built on them.

import { Constants, Effect, Mesh, MeshBuilder, Quaternion, ShaderMaterial, Vector3, type Scene } from '@babylonjs/core';
import type { Vfx } from '../../vfx';

const NOISE = `
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = .5;
  for (int i = 0; i < 4; i++) { v += a * noise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= .5; }
  return v;
}
// thin bright ridges where fbm crosses the middle: lightning
float arcs(vec2 p) { return pow(1.0 - abs(fbm(p) * 2.0 - 1.0), 14.0); }`;

// Shared surface: everything here is in "field" coordinates p (2D) plus how squarely we face it.
const SURFACE = `
vec4 plasma(vec2 p, float facing, float time, float seed, float core) {
  // domain warp: the flow folds over itself
  vec2 w = vec2(fbm(p + vec2(seed, time * 1.3)), fbm(p * 1.3 - vec2(time * 1.7, seed)));
  float t = fbm(p * 1.6 + w * 2.6 + vec2(0.0, -time * 2.4));
  float arc = max(arcs(p * 1.1 + w * 1.8 + vec2(time * 3.1, seed)), arcs(p * 2.3 - w + vec2(seed, -time * 4.3)) * .8);
  arc *= step(.3, noise(vec2(time * 20.0, seed + p.y)));                 // arcs strobe on and off
  vec3 scorch = vec3(.10, .0, .01), blood = vec3(.62, .0, .03), red = vec3(1.0, .04, .02);
  vec3 c = mix(scorch, blood, smoothstep(.25, .55, t));
  c = mix(c, red, smoothstep(.55, .8, t));
  float hot = smoothstep(.8, .97, facing) * core;
  c = mix(c, vec3(1.6, .35, .18), hot);                                    // thin hot core, orange-white, not pink
  c = mix(c, vec3(1.8, .25, .12), arc);
  // ragged edges: thin parts of the turbulence tear away near the silhouette
  float body = smoothstep(.05, .2, facing + t * .6 - .35);
  float a = clamp(body * (.55 + t * .5) + arc + hot, 0.0, 1.0);
  return vec4(c, a);
}`;

// The beam is a focused laser, not the boiling plasma of shells and blasts: a solid hot core, a tight
// red sheath of fast streaks running along its length, and arcs that crackle down it. The surface
// barely moves sideways; all the motion runs forward.
Effect.ShadersStore.raptureBeamVertexShader = `
precision highp float;
attribute vec3 position;
attribute vec3 normal;
attribute vec2 uv;
uniform mat4 world;
uniform mat4 worldViewProjection;
uniform vec3 eye;
uniform float time;
uniform float seed;
uniform float length;
uniform float taper;
varying vec3 vNormal;
varying vec3 vView;
varying vec2 vUV;
${NOISE}
void main() {
  float along = uv.y * length;
  // only a faint shimmer of the surface, streaming forward
  float shimmer = noise(vec2(uv.x * 5.0 + seed, along * .5 - time * 18.0));
  // taper == 1: thin out over the last third so the beam fades instead of stopping (lanes);
  // taper == 0: full width to the end (orbital lances hitting the ground)
  float tail = max(2.5, length * .33);
  float pinch = mix(.5, 1.0, smoothstep(0.0, .5, along)) * mix(1.0, smoothstep(0.0, tail, length - along), taper);
  vec3 p = position * vec3(pinch, 1.0, pinch) + normal * (shimmer - .5) * .08 * pinch;
  vec4 wp = world * vec4(p, 1.0);
  vNormal = normalize(mat3(world) * normal);
  vView = normalize(eye - wp.xyz);
  vUV = uv;
  gl_Position = worldViewProjection * vec4(p, 1.0);
}`;
Effect.ShadersStore.raptureBeamFragmentShader = `
precision highp float;
varying vec3 vNormal;
varying vec3 vView;
varying vec2 vUV;
uniform float time;
uniform float alpha;
uniform float length;
uniform float seed;
uniform float taper;
${NOISE}
void main() {
  float facing = abs(dot(normalize(vNormal), normalize(vView)));
  float along = vUV.y * length;
  // streaks: noise stretched hard along the beam and racing down it
  float streak = fbm(vec2(vUV.x * 14.0 + seed, along * .18 - time * 16.0));
  float fine = noise(vec2(vUV.x * 30.0, along * .6 - time * 30.0));
  // arcs crackling along the length, strobing
  float arc = pow(1.0 - abs(fbm(vec2(vUV.x * 6.0 + time * 2.0, along * .5 - time * 22.0 + seed)) * 2.0 - 1.0), 18.0);
  arc *= step(.35, noise(vec2(time * 25.0, seed + floor(along))));
  float core = smoothstep(.55, .8, facing);
  float sheath = smoothstep(.0, .12, facing - .08 + (streak - .5) * .25);
  vec3 dark = vec3(.35, .0, .02), red = vec3(1.0, .03, .02), hot = vec3(1.7, .45, .2);
  vec3 c = mix(dark, red, smoothstep(.3, .7, streak * .7 + fine * .3 + facing * .4));
  c = mix(c, hot, core * (.75 + .25 * fine));
  c = mix(c, vec3(1.9, .4, .2), arc);
  float a = clamp(sheath * (.65 + .35 * streak) + core + arc, 0.0, 1.0);
  // fray the ends through noise so there's never a straight cut
  float tear = noise(vec2(vUV.x * 9.0 + seed, along * 3.0 - time * 12.0));
  float tail = mix(.4, max(2.5, length * .33), taper);
  float ends = smoothstep(0.0, .4, along - tear * .4) * smoothstep(0.0, tail, length - along - tear * tail * .4);
  gl_FragColor = vec4(c, a * alpha * ends);
}`;

Effect.ShadersStore.raptureOrbVertexShader = `
precision highp float;
attribute vec3 position;
attribute vec3 normal;
uniform mat4 world;
uniform mat4 worldViewProjection;
uniform vec3 eye;
uniform float time;
uniform float seed;
varying vec3 vNormal;
varying vec3 vView;
varying vec3 vObj;
${NOISE}
void main() {
  vec3 o = normalize(position);
  float boil = fbm(o.xy * 2.5 + vec2(time * 2.5, seed)) * .6 + fbm(o.yz * 3.0 - vec2(seed, time * 3.0)) * .4;
  vec3 p = position * (.8 + boil * .5);
  vec4 wp = world * vec4(p, 1.0);
  vNormal = normalize(mat3(world) * normal);
  vView = normalize(eye - wp.xyz);
  vObj = position;
  gl_Position = worldViewProjection * vec4(p, 1.0);
}`;
Effect.ShadersStore.raptureOrbFragmentShader = `
precision highp float;
varying vec3 vNormal;
varying vec3 vView;
varying vec3 vObj;
uniform float time;
uniform float alpha;
uniform float seed;
uniform float core;
${NOISE}
${SURFACE}
void main() {
  float facing = abs(dot(normalize(vNormal), normalize(vView)));
  vec3 o = normalize(vObj);
  vec4 c = plasma(vec2(atan(o.z, o.x) * 1.6, o.y * 3.0 - time * 1.5), facing, time, seed, core);
  gl_FragColor = vec4(c.rgb, c.a * alpha);
}`;

/** HDR red for flares and sprites that sit alongside the energy meshes. */
export const ENERGY = [2.6, .05, .04] as const;

const UP = new Vector3(0, 1, 0);
const axis = new Vector3();

function energyMaterial(scene: Scene, shader: string, extra: string[]): ShaderMaterial {
  const material = new ShaderMaterial(`${shader}-mat`, scene, shader, {
    attributes: ['position', 'normal', 'uv'],
    uniforms: ['world', 'worldViewProjection', 'eye', 'time', 'alpha', 'seed', ...extra],
    needAlphaBlending: true,
  });
  // Blended, not added: additive light can only brighten, which turns red pink over a bright scene.
  material.alphaMode = Constants.ALPHA_COMBINE;
  material.disableDepthWrite = true;
  material.backFaceCulling = false;
  material.setFloat('seed', Math.random() * 50);
  material.onBindObservable.add(() => {
    const camera = scene.activeCamera;
    if (camera) material.getEffect()?.setVector3('eye', camera.globalPosition);
  });
  return material;
}

/** Point a Y-up mesh along `dir` (any length). */
function alignY(mesh: Mesh, dir: Vector3): void {
  const len = dir.length();
  if (len < 1e-6) return;
  mesh.rotationQuaternion ??= new Quaternion();
  const dot = dir.y / len;
  if (dot > .9999) { mesh.rotationQuaternion.set(0, 0, 0, 1); return; }
  if (dot < -.9999) { Quaternion.RotationAxisToRef(new Vector3(1, 0, 0), Math.PI, mesh.rotationQuaternion); return; }
  Vector3.CrossToRef(UP, dir, axis).normalize();
  Quaternion.RotationAxisToRef(axis, Math.acos(dot), mesh.rotationQuaternion);
}

export class EnergyBeam {
  private readonly mesh: Mesh;
  private readonly material: ShaderMaterial;
  private readonly dir = new Vector3();
  private time = Math.random() * 10;

  /** `taper` thins the far end out (lanes); off, it stays full width to the end (lances hitting the ground). */
  constructor(vfx: Vfx, taper = true) {
    this.mesh = MeshBuilder.CreateCylinder('rapture-beam', { height: 1, diameter: 1, tessellation: 20, subdivisions: 48, cap: Mesh.NO_CAP }, vfx.scene);
    this.mesh.isPickable = false;
    this.material = energyMaterial(vfx.scene, 'raptureBeam', ['length', 'taper']);
    this.material.setFloat('taper', taper ? 1 : 0);
    this.mesh.material = this.material;
    this.mesh.setEnabled(false);
  }

  /** Draw the beam from `from` to `to`, `width` metres across; `alpha` fades it. */
  draw(from: Vector3, to: Vector3, width: number, dt: number, alpha = 1): void {
    this.time += dt;
    to.subtractToRef(from, this.dir);
    const length = this.dir.length();
    Vector3.LerpToRef(from, to, .5, this.mesh.position);
    alignY(this.mesh, this.dir);
    this.mesh.scaling.set(width, Math.max(.01, length), width);
    this.material.setFloat('length', length);
    this.material.setFloat('time', this.time);
    this.material.setFloat('alpha', alpha);
    this.mesh.setEnabled(true);
  }

  hide(): void { this.mesh.setEnabled(false); }

  dispose(): void { this.material.dispose(); this.mesh.dispose(); }
}

export class EnergyOrb {
  private readonly mesh: Mesh;
  private readonly material: ShaderMaterial;
  private time = Math.random() * 10;

  constructor(vfx: Vfx, { core = 1 }: { core?: number } = {}) {
    this.mesh = MeshBuilder.CreateSphere('rapture-orb', { diameter: 2, segments: 28 }, vfx.scene);
    this.mesh.isPickable = false;
    this.material = energyMaterial(vfx.scene, 'raptureOrb', ['core']);
    this.material.setFloat('core', core);
    this.mesh.material = this.material;
    this.mesh.setEnabled(false);
  }

  /** Draw at `at` with `radius`; give `along` (a velocity) and `stretch` to elongate it into a comet head. */
  draw(at: Vector3, radius: number, dt: number, alpha = 1, along?: Vector3, stretch = 1, height = radius): void {
    this.time += dt;
    this.mesh.position.copyFrom(at);
    if (along) alignY(this.mesh, along);
    else if (this.mesh.rotationQuaternion) this.mesh.rotationQuaternion.set(0, 0, 0, 1);
    this.mesh.scaling.set(radius, along ? radius * stretch : height, radius);
    this.material.setFloat('time', this.time);
    this.material.setFloat('alpha', alpha);
    this.mesh.setEnabled(true);
  }

  dispose(): void { this.material.dispose(); this.mesh.dispose(); }
}

/** A red energy dome that bursts out to `radius` over 0.18 s and burns away by `life`. */
export function energyBlast(vfx: Vfx, at: Vector3, radius: number, life = .45): void {
  const dome = new EnergyOrb(vfx, { core: 0 });
  const center = new Vector3(at.x, at.y, at.z);
  vfx.add({
    update: (dt, age) => {
      if (age >= life) return false;
      const grow = 1 - (1 - Math.min(1, age / .18)) ** 3;
      const fade = 1 - Math.max(0, (age - .1) / (life - .1));
      dome.draw(center, radius * grow, dt, fade * fade, undefined, 1, radius * grow * .55);
      return true;
    },
    dispose: () => dome.dispose(),
  });
}

/** An orbital lance: a thick red pillar slams down from the sky onto (x, z), then burns away. */
export function energyPillar(vfx: Vfx, at: Vector3, width: number, life = .4): void {
  const beam = new EnergyBeam(vfx, false);
  const top = new Vector3(at.x, 24, at.z), ground = new Vector3(at.x, at.y, at.z), head = new Vector3();
  vfx.add({
    update: (dt, age) => {
      if (age >= life) return false;
      Vector3.LerpToRef(top, ground, Math.min(1, age / .1), head);
      const fade = 1 - Math.max(0, (age - .12) / (life - .12));
      beam.draw(top, head, width * (.6 + .4 * fade), dt, fade);
      return true;
    },
    dispose: () => beam.dispose(),
  });
}
