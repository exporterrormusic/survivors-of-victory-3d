// The Tripod shield bubble, after pmnd.rs "Creating a Flow Shield": an additive fresnel sphere
// with object-space hex cells, two drifting noise octaves, ripples from the last four hits (a ring
// buffer of uniforms) and a tint that slides to red as the shield runs down.

import { Color3, Constants, Effect, Mesh, MeshBuilder, ShaderMaterial, Vector3, type Scene } from '@babylonjs/core';

Effect.ShadersStore.modeShieldVertexShader = `
precision highp float;
attribute vec3 position;
attribute vec3 normal;
uniform mat4 world;
uniform mat4 worldViewProjection;
uniform vec3 eye;
varying vec3 vNormal;
varying vec3 vView;
varying vec3 vObj;
void main() {
  vec4 p = world * vec4(position, 1.0);
  vNormal = normalize(mat3(world) * normal);
  vView = normalize(eye - p.xyz);
  vObj = position;
  gl_Position = worldViewProjection * vec4(position, 1.0);
}`;

Effect.ShadersStore.modeShieldFragmentShader = `
precision highp float;
varying vec3 vNormal;
varying vec3 vView;
varying vec3 vObj;
uniform vec3 color;
uniform float time;
uniform float life;
uniform float reveal;
uniform vec4 hits[4];
float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float noise(vec3 p) {
  vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float hexEdge(vec2 p) {
  p *= 3.2;
  vec2 r = vec2(1.0, 1.732), h = r * .5;
  vec2 a = mod(p, r) - h, b = mod(p - h, r) - h;
  vec2 g = dot(a, a) < dot(b, b) ? a : b;
  vec2 q = abs(g);
  float d = max(q.x * .866 + q.y * .5, q.y);
  return smoothstep(.40, .47, d);
}
void main() {
  vec3 n = normalize(vNormal), o = normalize(vObj);
  float fresnel = pow(1.0 - abs(dot(n, normalize(vView))), 3.0) * 1.2;
  vec3 an = abs(o);
  vec2 uv = an.x > an.y && an.x > an.z ? o.yz : an.y > an.z ? o.xz : o.xy;
  float seam = smoothstep(.55, .75, max(an.x, max(an.y, an.z)));
  float hex = hexEdge(uv) * seam;
  float t = time * .35;
  float flow = noise(vObj * 1.6 + vec3(t, t * .6, t * .4)) * .6 + noise(vObj * 3.4 - vec3(t * .5, t, t * .3)) * .4;
  if (flow < 1.0 - reveal) discard;
  float ripple = 0.0;
  for (int i = 0; i < 4; i++) {
    float age = time - hits[i].w;
    if (age < 0.0 || age > .8) continue;
    float dist = acos(clamp(dot(o, normalize(hits[i].xyz)), -1.0, 1.0));
    float ring = min(age * 4.5, 1.6);
    ripple += smoothstep(.22, 0.0, abs(dist + (flow - .5) * .3 - ring)) * (1.0 - age / .8);
  }
  vec3 tint = mix(vec3(1.0, .08, .04), color, life);
  // Additive over a bright anime scene: keep the body faint so only the rim, cells and ripples read.
  float a = fresnel * .45 + hex * (.12 + fresnel * .3) + flow * .04 + ripple * .9;
  gl_FragColor = vec4(tint * a + vec3(ripple * .25), 1.0);
}`;

export class ShieldBubble {
  readonly mesh: Mesh;
  private readonly material: ShaderMaterial;
  private readonly hits = new Float32Array(16).fill(-99);
  private next = 0;
  private time = 0;
  private reveal = 0;
  private up = false;

  constructor(scene: Scene, color: readonly [number, number, number]) {
    this.mesh = MeshBuilder.CreateSphere('tripod-shield', { diameter: 2, segments: 48 }, scene);
    this.mesh.isPickable = false;
    this.material = new ShaderMaterial('tripod-shield-mat', scene, 'modeShield', {
      attributes: ['position', 'normal'],
      uniforms: ['world', 'worldViewProjection', 'eye', 'color', 'time', 'life', 'reveal', 'hits'],
      needAlphaBlending: true,
    });
    this.material.alphaMode = Constants.ALPHA_ADD;
    this.material.disableDepthWrite = true;
    this.material.backFaceCulling = false;
    this.material.setColor3('color', new Color3(color[0], color[1], color[2]));
    this.material.onBindObservable.add(() => {
      const camera = scene.activeCamera;
      if (camera) this.material.getEffect()?.setVector3('eye', camera.globalPosition);
    });
    this.mesh.material = this.material;
    this.mesh.setEnabled(false);
  }

  /** `up` fades the bubble in (dissolve) or out; `life` 0..1 is the remaining shield. */
  update(dt: number, at: Vector3, radius: number, up: boolean, life: number): void {
    this.time += dt;
    this.up = up;
    this.reveal = Math.max(0, Math.min(1, this.reveal + (up ? dt * 2.5 : -dt * 4)));
    this.mesh.setEnabled(this.reveal > 0);
    if (this.reveal <= 0) return;
    this.mesh.position.copyFrom(at);
    this.mesh.scaling.setAll(radius);
    this.material.setFloat('time', this.time);
    this.material.setFloat('life', life);
    this.material.setFloat('reveal', this.reveal);
    this.material.setArray4('hits', Array.from(this.hits));
  }

  /** A ripple from the world point `at`. */
  hit(at: Vector3): void {
    if (!this.up) return;
    const d = at.subtract(this.mesh.position);
    const i = this.next * 4;
    this.hits[i] = d.x; this.hits[i + 1] = d.y; this.hits[i + 2] = d.z; this.hits[i + 3] = this.time;
    this.next = (this.next + 1) % 4;
  }

  dispose(): void { this.material.dispose(); this.mesh.dispose(); }
}
