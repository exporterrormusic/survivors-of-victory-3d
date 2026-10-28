// A reusable branched 3D bolt. The ribbon shader supplies a white core and blue corona;
// the atmosphere controller owns the matching scene light and delayed thunder.
import { type Camera, Constants, Effect, Mesh, type Scene, ShaderMaterial, Vector3, VertexBuffer } from '@babylonjs/core';

Effect.ShadersStore.stormBoltVertexShader = `
precision highp float;
attribute vec3 position;
attribute vec3 segmentEnd;
attribute float arcWidth;
attribute vec2 uv;
uniform mat4 viewProjection;
uniform vec3 cameraPosition;
varying vec2 vUV;
void main() {
  vec3 p = mix(position, segmentEnd, uv.x);
  vec3 axis = segmentEnd - position;
  vec3 side = cross(axis, cameraPosition - p);
  side /= max(length(side), .0001);
  p += side * (uv.y * 2.0 - 1.0) * arcWidth;
  vUV = uv;
  gl_Position = viewProjection * vec4(p, 1.0);
}`;
Effect.ShadersStore.stormBoltFragmentShader = `
precision highp float;
uniform float power;
varying vec2 vUV;
void main() {
  float across = abs(vUV.y * 2.0 - 1.0);
  float core = 1.0 - smoothstep(.04, .18, across);
  float corona = pow(1.0 - across, 2.0);
  vec3 color = vec3(.22, .45, 1.0) * corona + vec3(.9, .96, 1.0) * core * 2.5;
  gl_FragColor = vec4(color, power);
}`;

const SEGMENTS = 32;
export class StormLightning {
  readonly mesh: Mesh;
  private readonly material: ShaderMaterial;
  private readonly positions = new Float32Array(SEGMENTS * 12);
  private readonly ends = new Float32Array(SEGMENTS * 12);
  private readonly widths = new Float32Array(SEGMENTS * 4);
  private power = 1;
  /** seconds the bolt stays at full strength before it fades (the altar strike) */
  hold = 0;

  constructor(scene: Scene, private readonly camera: Camera) {
    this.mesh = new Mesh('storm-lightning', scene);
    this.mesh.isPickable = false;this.mesh.alwaysSelectAsActiveMesh = true;
    const uv: number[] = [], indices: number[] = [];
    for (let i = 0; i < SEGMENTS; i++) {
      uv.push(0,0,1,0,1,1,0,1);
      const k = i * 4;indices.push(k,k+1,k+2,k,k+2,k+3);
    }
    this.mesh.setVerticesData(VertexBuffer.PositionKind, this.positions, true);
    this.mesh.setVerticesData('segmentEnd', this.ends, true, 3);
    this.mesh.setVerticesData('arcWidth', this.widths, true, 1);
    this.mesh.setVerticesData(VertexBuffer.UVKind, uv);this.mesh.setIndices(indices);
    this.material = new ShaderMaterial('storm-lightning-mat', scene, 'stormBolt', {
      attributes: ['position','segmentEnd','arcWidth','uv'],
      uniforms: ['viewProjection','cameraPosition','power'], needAlphaBlending: true,
    });
    this.material.alphaMode = Constants.ALPHA_ADD;this.material.disableDepthWrite = true;this.material.backFaceCulling = false;
    this.mesh.material = this.material;this.mesh.setEnabled(false);
  }

  /** `exact` grounds the bolt on `focus` itself (an aimed strike), not beside it. */
  strike(focus: Vector3, strength: number, exact = false): void {
    // Land inside the visible play area even at the close test-range zoom. Farther strikes
    // put the entire bolt above the viewport (or behind the live controls).
    const x = exact ? focus.x : focus.x + (Math.random() < .5 ? -1 : 1) * (2 + Math.random() * 1.2);
    const z = exact ? focus.z : focus.z + 1.5 + Math.random() * 2;
    const main: Vector3[] = [];
    for (let i = 0; i <= 20; i++) {
      const t = i / 20, jitter = i === 0 || i === 20 ? 0 : .75 + Math.sin(t * Math.PI) * .45;
      main.push(new Vector3(x + (1-t) * 2.5 + (Math.random()-.5) * jitter, (1-t) * 19 + .1, z + (Math.random()-.5) * jitter));
    }
    let index = 0;
    const segment = (a: Vector3, b: Vector3, width: number) => {
      for (let j = 0; j < 4; j++) {
        this.positions.set(a.asArray(), (index*4+j)*3);this.ends.set(b.asArray(), (index*4+j)*3);
        this.widths[index*4+j] = width;
      }
      index++;
    };
    for (let i = 0; i < 20; i++) segment(main[i], main[i+1], .24);
    for (const [at, side] of [[14,-1],[17,1]]) {
      let from = main[at];
      for (let i = 0; i < 6; i++) {
        const to = from.add(new Vector3(side * (.35+Math.random()*.4), -.3-Math.random()*.2, (Math.random()-.5)*.7));
        segment(from,to,.14*(1-i/8));from=to;
      }
    }
    this.mesh.updateVerticesData(VertexBuffer.PositionKind,this.positions);
    this.mesh.updateVerticesData('segmentEnd',this.ends);
    this.mesh.updateVerticesData('arcWidth',this.widths);
    this.power = strength;this.update(0,false);
  }

  update(age: number, hidden: boolean): void {
    const a = Math.max(0, age - this.hold);
    const fade = Math.exp(-a * 7) * Math.max(0, 1 - (a / .65) ** 2);
    this.material.setVector3('cameraPosition',this.camera.globalPosition);
    this.material.setFloat('power',fade*this.power);
    this.mesh.setEnabled(!hidden && a < .65);
  }
  dispose(): void { this.mesh.dispose();this.material.dispose(); }
}
