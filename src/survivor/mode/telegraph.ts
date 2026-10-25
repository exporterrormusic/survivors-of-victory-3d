// Ground warnings in the game's tell language (GAME_PLAN §6): a red circle that fills before an
// area hit lands, an orange chevron lane before a charge or leap, cyan rings for friendly things.
// Procedural, so outlines stay crisp at any size and the fill is exact.

import { Color3, Constants, Effect, Mesh, MeshBuilder, ShaderMaterial, Vector2, type Scene } from '@babylonjs/core';

export type TellColor = readonly [number, number, number];

export const TELL = {
  /** area damage incoming */
  area: [1, .13, .1],
  /** charge, leap or strafing path */
  charge: [1, .52, .1],
  /** slow / jam zones */
  status: [.72, .3, 1],
  /** sites, lifts, relays */
  friendly: [.32, .92, 1],
} as const satisfies Record<string, TellColor>;

Effect.ShadersStore.modeTellVertexShader = `
precision highp float;
attribute vec3 position;
attribute vec2 uv;
uniform mat4 worldViewProjection;
varying vec2 vUV;
void main() { vUV = uv; gl_Position = worldViewProjection * vec4(position, 1.0); }`;

// shape 0: circle (size.x = diameter). shape 1: lane (size = width, length; v runs along it).
Effect.ShadersStore.modeTellFragmentShader = `
precision highp float;
varying vec2 vUV;
uniform vec3 color;
uniform float alpha;
uniform float fill;
uniform float shape;
uniform vec2 size;
uniform float time;
float band(float d, float w) { return 1.0 - smoothstep(w * .5, w, abs(d)); }
void main() {
  float a = 0.0;
  if (shape < .5) {
    float radius = size.x * .5;
    float r = length(vUV - .5) * 2.0 * radius;
    if (r > radius) discard;
    float outline = band(r - (radius - .09), .1);
    float front = fill > .001 && fill < .999 ? band(r - fill * radius, .12) : 0.0;
    float filled = r <= fill * radius ? .42 : 0.0;
    a = max(max(outline * .95, front * .9), max(filled, .1));
  } else {
    float halfW = size.x * .5, along = vUV.y * size.y, across = (vUV.x - .5) * size.x;
    float edge = band(abs(across) - (halfW - .07), .09);
    float chevron = band(fract((along - abs(across) * .9) / 1.1 - time * 1.4) - .5, .22) * .38;
    float filled = along <= fill * size.y ? .34 : 0.0;
    float front = fill > .001 && fill < .999 ? band(along - fill * size.y, .14) : 0.0;
    float tip = smoothstep(size.y - .25, size.y, along);
    a = max(max(edge * .9, chevron), max(filled, max(front * .85, .08))) * (1.0 - tip * .6);
  }
  gl_FragColor = vec4(color, clamp(a * alpha, 0.0, 1.0));
}`;

export class Tell {
  fill = 0;
  readonly mesh: Mesh;
  readonly material: ShaderMaterial;
  busy = false;
  private readonly sizeUniform = new Vector2();
  private readonly colorUniform = new Color3();

  constructor(scene: Scene) {
    this.mesh = MeshBuilder.CreateGround('mode-tell', { width: 1, height: 1 }, scene);
    this.mesh.isPickable = false;
    this.mesh.doNotSyncBoundingInfo = true;
    this.material = new ShaderMaterial('mode-tell-mat', scene, 'modeTell', {
      attributes: ['position', 'uv'],
      uniforms: ['worldViewProjection', 'color', 'alpha', 'fill', 'shape', 'size', 'time'],
      needAlphaBlending: true,
    });
    this.material.alphaMode = Constants.ALPHA_COMBINE;
    this.material.disableDepthWrite = true;
    this.material.backFaceCulling = false;
    this.mesh.material = this.material;
    this.mesh.setEnabled(false);
  }

  setColor(color: TellColor, alpha = 1): void {
    this.material.setColor3('color', this.colorUniform.set(color[0], color[1], color[2]));
    this.material.setFloat('alpha', alpha);
  }

  setShape(shape: 0 | 1, width: number, length: number): void {
    this.material.setFloat('shape', shape);
    this.material.setVector2('size', this.sizeUniform.set(width, length));
    this.mesh.scaling.set(width, 1, length);
  }

  sync(time: number): void {
    this.material.setFloat('fill', Math.max(0, Math.min(1, this.fill)));
    this.material.setFloat('time', time);
  }
}

export class TelegraphLayer {
  private readonly pool: Tell[] = [];
  private time = 0;
  private readonly scene: Scene;
  private readonly heightAt: (x: number, z: number) => number;

  constructor(scene: Scene, heightAt: (x: number, z: number) => number = () => 0) {
    this.scene = scene;
    this.heightAt = heightAt;
  }

  /** A circle of `radius` metres centred on (x, z). Set `fill` 0→1; release when done. */
  circle(x: number, z: number, radius: number, color: TellColor, alpha = 1): Tell {
    const tell = this.lease(color, alpha);
    tell.setShape(0, radius * 2, radius * 2);
    this.moveCircle(tell, x, z);
    return tell;
  }

  moveCircle(tell: Tell, x: number, z: number): void {
    tell.mesh.rotation.y = 0;
    tell.mesh.position.set(x, this.heightAt(x, z) + .05, z);
  }

  /** A lane from (x, z) along `yaw` (atan2(dx, dz)) for `length` metres, `width` across. */
  lane(x: number, z: number, yaw: number, length: number, width: number, color: TellColor, alpha = 1): Tell {
    const tell = this.lease(color, alpha);
    tell.setShape(1, width, length);
    const cx = x + Math.sin(yaw) * length / 2, cz = z + Math.cos(yaw) * length / 2;
    tell.mesh.rotation.y = yaw;
    tell.mesh.position.set(cx, this.heightAt(cx, cz) + .05, cz);
    return tell;
  }

  release(tell: Tell): void {
    tell.busy = false;
    tell.fill = 0;
    tell.mesh.setEnabled(false);
  }

  update(dt: number): void {
    this.time += dt;
    for (const tell of this.pool) if (tell.busy) tell.sync(this.time);
  }

  dispose(): void {
    for (const tell of this.pool) { tell.material.dispose(); tell.mesh.dispose(); }
    this.pool.length = 0;
  }

  private lease(color: TellColor, alpha: number): Tell {
    let tell = this.pool.find((t) => !t.busy);
    if (!tell) { tell = new Tell(this.scene); this.pool.push(tell); }
    tell.busy = true;
    tell.fill = 0;
    tell.setColor(color, alpha);
    tell.sync(this.time);
    tell.mesh.setEnabled(true);
    return tell;
  }
}
