// 3D effect toolkit for the survivor runtime. Characters build their effects from these parts:
//   sprite   camera-facing glow quad (flashes, cores, blooms)
//   streak   quad stretched between two points that turns about its own axis to face the camera
//            (bullets, lances, tracers, flame tongues)
//   decal    flat quad on the ground (rings, shockwaves, frost marks)
//   burst    pooled CPU particle systems (sparks, embers, vapour)
//   flash    one pooled point light for muzzle and explosion light
// Textures are drawn once at start-up; lights are additive, while smoke uses alpha blending
// to conceal disappearing bodies. Neither writes depth. Effects run on game time (pausable).
// Quads are plain records, not meshes: before each render they are written into one dynamic mesh
// per texture, blend and glow (a few draws for any number of quads). Alpha-blended textures share
// an atlas so every alpha quad sorts back to front within one draw.

import {
  Axis, BoundingInfo, Buffer, Color3, Constants, DynamicTexture, Effect as ShaderEffect, type Camera, Matrix, Mesh,
  MeshBuilder, ParticleSystem, PointLight, Quaternion, type Scene, ShaderMaterial, SubMesh, Texture, Vector3, VertexBuffer,
  type BaseTexture, type GlowLayer,
} from '@babylonjs/core';
import { smoothstep } from './math';
import { addAnimeEffectLight } from '../toon';

export type Rgb = readonly [number, number, number];
export const rgb = (hex: number): Rgb => [(hex >> 16 & 255) / 255, (hex >> 8 & 255) / 255, (hex & 255) / 255];

type TextureName = 'holy-seal' | 'holy-halo' | 'holy-shard' | 'rose-petal' | 'bleed-mark' | 'sword-cut' | 'petal' | 'glow' | 'ring' | 'warning-ring' | 'healing-ring' | 'streak' | 'lance' | 'spark' | 'vapour' | 'star' | 'tongue' | 'smoke' | 'fireball' | 'hunter-mark' | 'burn-mark' | 'sake' | 'bubble' | 'swirl';

/** A running effect: return false from update when finished. */
export interface Effect {
  update(dt: number, age: number): boolean;
  dispose?(): void;
}

/** A leased effect quad. sprite/streak/decal place (and show) it; it is drawn until hidden or released. */
export class FxQuad {
  busy = false;
  /** drawn this frame; placing the quad shows it */
  visible = false;
  texture: TextureName = 'glow';
  blend: 'add' | 'alpha' = 'add';
  /** also drawn into the glow layer */
  glow = false;
  /** drawn over every model, ignoring scene depth (status icons that must stay readable) */
  onTop = false;
  readonly color = new Color3();
  alpha = 1;
  /** sprite or decal position, streak midpoint */
  readonly position = new Vector3();
  /** sprite (size, size), streak (length, width), decal (size × sx, size) */
  readonly scaling = new Vector3(1, 1, 1);
  /** sprites turn to the camera when drawn; streaks and decals keep `corners` */
  billboard = false;
  spin = 0;
  /** world corners in plane order (-x -y, +x -y, +x +y, -x +y) */
  readonly corners = new Float32Array(12);
  /** @internal camera distance, for sorting */
  depth = 0;
}

// Effect quads: texture × colour at `alpha` strength, either added to the scene or blended over it.
// Babylon's StandardMaterial either adds an emissive texture on top of its colour (a filled square)
// or, unlit, drops the diffuse term, so the quads use this instead. Corners arrive in world space.
// One premultiplied blend covers both kinds exactly: an additive quad writes rgb·a with alpha 0
// (= SRC_ALPHA, ONE), an alpha quad writes rgb·a with alpha a (= SRC_ALPHA, ONE_MINUS_SRC_ALPHA).
// flags: 1 additive, 2 glowing; the glow layer's pass keeps only glowing quads.
ShaderEffect.ShadersStore.fxBatchVertexShader = `
precision highp float;
attribute vec3 position;
attribute vec2 uv;
attribute vec4 color;
attribute float flags;
uniform mat4 viewProjection;
uniform float glowPass;
varying vec2 vUV;
varying vec4 vColor;
varying float vAdditive;
void main() {
  if (glowPass > .5 && flags < 1.5) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); return; }
  vUV = uv; vColor = color; vAdditive = mod(flags, 2.0);
  gl_Position = viewProjection * vec4(position, 1.0);
}`;
ShaderEffect.ShadersStore.fxBatchFragmentShader = `
precision highp float;
varying vec2 vUV;
varying vec4 vColor;
varying float vAdditive;
uniform sampler2D tex;
void main() {
  vec4 sampleColor = texture2D(tex, vUV);
  float a = sampleColor.a * vColor.a;
  gl_FragColor = vec4(sampleColor.rgb * vColor.rgb * a, a * (1.0 - step(.5, vAdditive)));
}`;
// The same look for a lone quad with its own texture (labels; see `labelQuad`).
ShaderEffect.ShadersStore.fxQuadVertexShader = `
precision highp float;
attribute vec3 position;
attribute vec2 uv;
uniform mat4 worldViewProjection;
varying vec2 vUV;
void main() { vUV = uv; gl_Position = worldViewProjection * vec4(position, 1.0); }`;
ShaderEffect.ShadersStore.fxQuadFragmentShader = `
precision highp float;
varying vec2 vUV;
uniform sampler2D tex;
uniform vec3 color;
uniform float alpha;
void main() {
  vec4 sampleColor = texture2D(tex, vUV);
  gl_FragColor = vec4(sampleColor.rgb * color, sampleColor.a * alpha);
}`;

const TMP = { a: new Vector3(), b: new Vector3(), c: new Vector3(), d: new Vector3() };
const X = new Vector3(), Y = new Vector3();
const RIGHT = new Vector3(), UP = new Vector3(), KEY = new Vector3();
const DECAL_ROTATION = new Quaternion(), DECAL_MATRIX = new Matrix();

const ATLAS_WIDTH = 1024, ATLAS_HEIGHT = 1024;
/** Every quad texture's cell (x, y, w, h px) in one atlas. Cells sit on multiples of their own
 * power-of-two size, so mip levels never mix neighbours. */
const ATLAS: Record<TextureName, readonly [number, number, number, number]> = {
  'holy-seal': [0, 512, 256, 256], 'holy-halo': [256, 512, 256, 256], 'holy-shard': [512, 512, 128, 128],
  ring: [0, 0, 256, 256], 'warning-ring': [256, 0, 256, 256], fireball: [512, 0, 256, 256],
  glow: [768, 0, 128, 128], star: [896, 0, 128, 128], smoke: [768, 128, 128, 128], 'hunter-mark': [896, 128, 128, 128],
  'burn-mark': [0, 256, 128, 128], vapour: [0, 384, 128, 128], tongue: [128, 256, 128, 64], spark: [128, 320, 32, 32],
  petal: [512, 256, 128, 128],
  'bleed-mark': [640, 256, 128, 128],
  'rose-petal': [640, 384, 128, 128],
  'healing-ring': [768, 256, 256, 256],
  'sword-cut': [256, 384, 256, 64],
  streak: [256, 256, 256, 64], lance: [256, 320, 256, 64],
  sake: [640, 512, 128, 128], bubble: [768, 512, 128, 128], swirl: [896, 512, 128, 128],
};
const STRIDE = 10; // position 3, uv 2, colour 4, flags 1

/** centre ± ax ± ay in plane order */
function setCorners(c: Float32Array, centre: Vector3, ax: Vector3, ay: Vector3): void {
  c[0] = centre.x - ax.x - ay.x; c[1] = centre.y - ax.y - ay.y; c[2] = centre.z - ax.z - ay.z;
  c[3] = centre.x + ax.x - ay.x; c[4] = centre.y + ax.y - ay.y; c[5] = centre.z + ax.z - ay.z;
  c[6] = centre.x + ax.x + ay.x; c[7] = centre.y + ax.y + ay.y; c[8] = centre.z + ax.z + ay.z;
  c[9] = centre.x - ax.x + ay.x; c[10] = centre.y - ax.y + ay.y; c[11] = centre.z - ax.z + ay.z;
}

/**
 * Every visible quad in one dynamic mesh, rewritten each frame far to near, as Babylon sorted the
 * separate quad meshes this replaced. Where another transparent mesh sorts between quads, the draw
 * splits into submeshes that Babylon's back-to-front sort interleaves with it.
 */
class QuadBatch {
  readonly mesh: Mesh;
  /** set while the glow layer draws this mesh */
  glowPass = 0;
  private buffer: Buffer | null = null;
  private data = new Float32Array(0);
  private capacity = 0;
  private readonly segments: SubMesh[] = [];
  private readonly drawn: SubMesh[] = [];
  private readonly min = new Vector3();
  private readonly max = new Vector3();

  constructor(scene: Scene, atlas: BaseTexture, onTop = false) {
    this.mesh = new Mesh(onTop ? 'fx-quads-top' : 'fx-quads', scene);
    const material = new ShaderMaterial('fx-quads', scene, 'fxBatch', {
      attributes: ['position', 'uv', 'color', 'flags'],
      uniforms: ['viewProjection', 'glowPass'],
      samplers: ['tex'],
      needAlphaBlending: true,
    });
    material.alphaMode = Constants.ALPHA_PREMULTIPLIED;
    material.disableDepthWrite = true;
    if (onTop) { material.depthFunction = Constants.ALWAYS; this.mesh.renderingGroupId = 1; }
    material.backFaceCulling = false;
    material.setTexture('tex', atlas);
    material.onBindObservable.add(() => material.getEffect()?.setFloat('glowPass', this.glowPass));
    this.mesh.material = material;
    this.mesh.isPickable = false;
    // Submesh bounds only order the draws (see write); culling quads is not worth it.
    this.mesh.alwaysSelectAsActiveMesh = true;
    this.mesh.doNotSyncBoundingInfo = true;
    this.grow(256);
    this.mesh.freezeWorldMatrix();
    this.mesh.setEnabled(false);
  }

  private grow(quads: number): void {
    const previous = this.buffer;
    this.capacity = quads;
    this.data = new Float32Array(quads * 4 * STRIDE);
    this.buffer = new Buffer(this.mesh.getEngine(), this.data, true, STRIDE);
    this.mesh.setVerticesBuffer(this.buffer.createVertexBuffer(VertexBuffer.PositionKind, 0, 3));
    this.mesh.setVerticesBuffer(this.buffer.createVertexBuffer(VertexBuffer.UVKind, 3, 2));
    this.mesh.setVerticesBuffer(this.buffer.createVertexBuffer(VertexBuffer.ColorKind, 5, 4));
    this.mesh.setVerticesBuffer(this.buffer.createVertexBuffer('flags', 9, 1));
    previous?.dispose();
    // Front and back triangles, like the double-sided planes this replaced: each quad blends twice.
    const indices = new Uint32Array(quads * 12);
    for (let i = 0, v = 0; i < indices.length; i += 12, v += 4) {
      indices[i] = v; indices[i + 1] = v + 1; indices[i + 2] = v + 2;
      indices[i + 3] = v; indices[i + 4] = v + 2; indices[i + 5] = v + 3;
      indices[i + 6] = v + 2; indices[i + 7] = v + 1; indices[i + 8] = v;
      indices[i + 9] = v + 3; indices[i + 10] = v + 2; indices[i + 11] = v;
    }
    this.mesh.setIndices(indices, quads * 4);
    // Babylon just added a whole-mesh submesh; only the segments written below draw.
    this.drawn.length = 0;
    this.mesh.subMeshes = this.drawn;
  }

  /**
   * Upload `items` and split them at `depths` (other transparent submeshes' camera distances,
   * far to near). Returns whether any quad glows.
   */
  write(items: FxQuad[], eye: Vector3, right: Vector3, up: Vector3, depths: readonly number[]): boolean {
    const count = items.length;
    this.drawn.length = 0;
    if (!count) { this.mesh.setEnabled(false); return false; }
    if (count > this.capacity) this.grow(2 ** Math.ceil(Math.log2(count)));
    for (const q of items) q.depth = Vector3.Distance(q.position, eye);
    items.sort((a, b) => b.depth - a.depth);
    const d = this.data, min = this.min.setAll(Infinity), max = this.max.setAll(-Infinity);
    let o = 0, glows = false;
    for (const q of items) {
      const c = q.corners;
      if (q.billboard) {
        // Babylon's BILLBOARDMODE_ALL: the plane takes the camera's rotation, spun about its normal.
        const hx = q.scaling.x * .5, hy = q.scaling.y * .5, cos = Math.cos(q.spin), sin = Math.sin(q.spin);
        X.set((right.x * cos + up.x * sin) * hx, (right.y * cos + up.y * sin) * hx, (right.z * cos + up.z * sin) * hx);
        Y.set((up.x * cos - right.x * sin) * hy, (up.y * cos - right.y * sin) * hy, (up.z * cos - right.z * sin) * hy);
        setCorners(c, q.position, X, Y);
      }
      const [cx, cy, cw, ch] = ATLAS[q.texture];
      const u0 = cx / ATLAS_WIDTH, u1 = (cx + cw) / ATLAS_WIDTH, v0 = cy / ATLAS_HEIGHT, v1 = (cy + ch) / ATLAS_HEIGHT;
      const { r, g, b } = q.color;
      const flags = (q.blend === 'add' ? 1 : 0) + (q.glow ? 2 : 0);
      glows ||= q.glow;
      for (let k = 0; k < 4; k++) {
        const x = c[k * 3], y = c[k * 3 + 1], z = c[k * 3 + 2];
        d[o] = x; d[o + 1] = y; d[o + 2] = z;
        d[o + 3] = k === 1 || k === 2 ? u1 : u0;
        d[o + 4] = k >= 2 ? v1 : v0;
        d[o + 5] = r; d[o + 6] = g; d[o + 7] = b; d[o + 8] = q.alpha;
        d[o + 9] = flags;
        o += STRIDE;
        if (x < min.x) min.x = x; if (x > max.x) max.x = x;
        if (y < min.y) min.y = y; if (y > max.y) max.y = y;
        if (z < min.z) min.z = z; if (z > max.z) max.z = z;
      }
    }
    this.buffer!.updateDirectly(d, 0, count * 4);
    this.mesh.getBoundingInfo().reConstruct(min, max, Matrix.IdentityReadOnly);
    // One draw per run of quads with no other transparent mesh between them by distance.
    for (let start = 0, boundary = 0; start < count;) {
      while (boundary < depths.length && depths[boundary] >= items[start].depth) boundary++;
      const limit = boundary < depths.length ? depths[boundary] : -Infinity;
      let end = start + 1, sum = items[start].depth;
      while (end < count && items[end].depth > limit) sum += items[end++].depth;
      const sub = this.segment(this.drawn.length);
      sub.verticesStart = start * 4; sub.verticesCount = (end - start) * 4;
      sub.indexStart = start * 12; sub.indexCount = (end - start) * 12;
      // Babylon sorts by the distance to a submesh's bounding-sphere centre: put it at the run's mean depth.
      KEY.copyFrom(items[start].position).subtractInPlace(eye).normalize().scaleInPlace(sum / (end - start)).addInPlace(eye);
      sub.getBoundingInfo().reConstruct(KEY, KEY, Matrix.IdentityReadOnly);
      this.drawn.push(sub);
      start = end;
    }
    this.mesh.subMeshes = this.drawn;
    this.mesh.setEnabled(true);
    return glows;
  }

  private segment(i: number): SubMesh {
    while (this.segments.length <= i) {
      // Created in order with addToMesh, so each takes its index as its id (Babylon keys per-draw state by it).
      this.mesh.subMeshes = this.segments;
      new SubMesh(0, 0, 0, 0, 0, this.mesh, undefined, false).setBoundingInfo(new BoundingInfo(Vector3.Zero(), Vector3.Zero()));
    }
    return this.segments[i];
  }
}

export class Vfx {
  readonly textures = new Map<TextureName, Texture>();
  private readonly effects: { effect: Effect; age: number }[] = [];
  /** every pooled quad (the artifacts/ verification scripts inspect it) */
  private readonly quads: FxQuad[] = [];
  /** released quads ready for reuse; the pool only grows when this is empty */
  private readonly freeQuads: FxQuad[] = [];
  /** Live emission sources for world-space fog scattering. */
  get fogEmitters(): readonly FxQuad[] { return this.quads; }
  private readonly batch: QuadBatch;
  /** quads drawn over everything (FxQuad.onTop) */
  private readonly topBatch: QuadBatch;
  private readonly topList: FxQuad[] = [];
  /** this frame's visible quads and the other transparent draws' depths (scratch) */
  private readonly drawList: FxQuad[] = [];
  private readonly depths: number[] = [];
  private glowIncluded = false;
  private readonly sparkSystems: ParticleSystem[] = [];
  private readonly vapourSystems: ParticleSystem[] = [];
  private sparkNext = 0;
  private vapourNext = 0;
  private readonly light: PointLight;
  private lightLife = 0;
  private lightAge = 0;
  private lightPeak = 0;
  private lightFollow: Vector3 | null = null;

  constructor(readonly scene: Scene, readonly camera: Camera, private readonly glow: GlowLayer) {
    const atlas = this.makeTextures();
    this.batch = new QuadBatch(scene, atlas);
    this.topBatch = new QuadBatch(scene, atlas, true);
    glow.onBeforeRenderMeshToEffect.add((mesh) => { if (mesh === this.batch.mesh) this.batch.glowPass = 1; });
    glow.onAfterRenderMeshToEffect.add((mesh) => { if (mesh === this.batch.mesh) this.batch.glowPass = 0; });
    this.light = new PointLight('fx-light', Vector3.Zero(), scene);
    this.light.intensity = 0;
    this.light.range = 9;
    this.light.specular.set(0, 0, 0);
    addAnimeEffectLight(scene, this.light);
    for (let i = 0; i < 8; i++) this.sparkSystems.push(this.makeSparks(i));
    for (let i = 0; i < 6; i++) this.vapourSystems.push(this.makeVapour(i));
    // After animations and the camera update, so attached quads and billboards use this frame's poses.
    scene.onBeforeRenderObservable.add(() => this.flush());
  }

  /** Compile the quad shader before play. */
  async prepare(): Promise<void> {
    await this.batch.mesh.material!.forceCompilationAsync(this.batch.mesh);
  }

  add(effect: Effect): void {
    this.effects.push({ effect, age: 0 });
  }

  update(dt: number): void {
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const e = this.effects[i];
      e.age += dt;
      if (!e.effect.update(dt, e.age)) {
        e.effect.dispose?.();
        this.effects.splice(i, 1);
      }
    }
    if (this.lightLife > 0) {
      if (this.lightFollow) this.light.position.copyFrom(this.lightFollow);
      this.lightAge += dt;
      const t = this.lightAge / this.lightLife;
      // a short rise then an eased fall: an instant spike reads as a strobe against the shadows
      const k = t < .2 ? t / .2 : (1 - (t - .2) / .8) ** 2;
      this.light.intensity = t >= 1 ? 0 : this.lightPeak * k;
      if (t >= 1) { this.lightLife = 0; this.lightFollow = null; }
    }
  }

  // --- quads ------------------------------------------------------------------

  /** A pooled quad, hidden until sprite/streak/decal places it. Release with `release`. */
  quad(texture: TextureName, color: Rgb, alpha = 1, blend: 'add' | 'alpha' = 'add'): FxQuad {
    let q = this.freeQuads.pop();
    if (!q) {
      q = new FxQuad();
      this.quads.push(q);
    }
    q.busy = true;
    // Shots spawn after the VFX update; impacts can spawn during it. Keep a new lease hidden
    // until placement, or it renders for one frame at its previous effect's position.
    q.visible = false;
    q.texture = texture;
    q.blend = blend;
    q.glow = false;
    q.onTop = false;
    q.spin = 0;
    q.scaling.setAll(1);
    this.tint(q, color, alpha);
    return q;
  }

  tint(q: FxQuad, color: Rgb, alpha: number): void {
    q.color.set(color[0], color[1], color[2]);
    q.alpha = Math.max(0, Math.min(1, alpha));
  }

  release(q: FxQuad): void {
    // A second release must not put the quad in the free list twice (two owners at once).
    if (!q.busy) return;
    q.busy = false;
    q.visible = false;
    q.glow = false;
    this.freeQuads.push(q);
  }

  /** Camera-facing quad of `size` metres at `at`. */
  sprite(q: FxQuad, at: Vector3, size: number, spin = 0): void {
    q.billboard = true;
    q.position.copyFrom(at);
    q.scaling.set(size, size, 1);
    q.spin = spin;
    q.visible = true;
  }

  /** Stretch a quad from `tail` to `head` (texture u: 0 at the tail, 1 at the head), facing the camera. */
  streak(q: FxQuad, tail: Vector3, head: Vector3, width: number): void {
    head.subtractToRef(tail, X);
    const length = X.length();
    if (length < 1e-4) { q.visible = false; return; }
    X.scaleInPlace(1 / length);
    tail.addToRef(head, TMP.a).scaleInPlace(.5);
    this.camera.globalPosition.subtractToRef(TMP.a, TMP.b);
    Vector3.CrossToRef(TMP.b, X, Y);
    if (Y.lengthSquared() < 1e-8) Y.set(0, 1, 0);
    Y.normalize();
    q.billboard = false;
    q.position.copyFrom(TMP.a);
    q.scaling.set(length, width, 1);
    setCorners(q.corners, TMP.a, X.scaleInPlace(length * .5), Y.scaleInPlace(width * .5));
    q.visible = true;
  }

  /** Flat quad on the ground (y a little above 0), `size` metres across. */
  decal(q: FxQuad, at: Vector3, size: number, yaw = 0, sx = 1): void {
    Quaternion.RotationYawPitchRollToRef(yaw, Math.PI / 2, 0, DECAL_ROTATION);
    const m = DECAL_ROTATION.toRotationMatrix(DECAL_MATRIX).m;
    q.billboard = false;
    q.position.set(at.x, at.y + .03, at.z);
    q.scaling.set(size * sx, size, 1);
    X.set(m[0], m[1], m[2]).scaleInPlace(size * sx * .5);
    Y.set(m[4], m[5], m[6]).scaleInPlace(size * .5);
    setCorners(q.corners, q.position, X, Y);
    q.visible = true;
  }

  private flush(): void {
    const items = this.drawList;
    items.length = 0;
    const top = this.topList;
    top.length = 0;
    for (const q of this.quads) if (q.busy && q.visible && q.alpha > 0) (q.onTop ? top : items).push(q);
    const eye = this.camera.globalPosition;
    this.camera.getDirectionToRef(Axis.X, RIGHT);
    this.camera.getDirectionToRef(Axis.Y, UP);
    const glows = this.batch.write(items, eye, RIGHT, UP, items.length ? this.transparentDepths(eye) : this.depths);
    // A later rendering group with depth testing off: over every model and the other effects.
    this.depths.length = 0;
    this.topBatch.write(top, eye, RIGHT, UP, this.depths);
    // The glow layer draws its included meshes in a pass of their own; skip it when nothing glows.
    if (glows !== this.glowIncluded) {
      this.glowIncluded = glows;
      if (glows) {
        this.glow.addIncludedOnlyMesh(this.batch.mesh);
        // the glow pass reads emissive by default, which these quads don't use
        this.glow.referenceMeshToUseItsOwnMaterial(this.batch.mesh);
      } else {
        this.glow.removeIncludedOnlyMesh(this.batch.mesh);
        this.glow.unReferenceMeshFromUsingItsOwnMaterial(this.batch.mesh);
      }
    }
  }

  /** Camera distances of the other transparent submeshes, far to near: Babylon sorts by these. */
  private transparentDepths(eye: Vector3): number[] {
    const depths = this.depths;
    depths.length = 0;
    for (const mesh of this.scene.meshes) {
      if (mesh === this.batch.mesh || mesh === this.topBatch.mesh || !mesh.subMeshes || mesh.renderingGroupId !== 0 || mesh.alphaIndex !== Number.MAX_VALUE
        || !mesh.isVisible || !mesh.isEnabled()) continue;
      for (const sub of mesh.subMeshes) {
        if (sub.getMaterial()?.needAlphaBlendingForMesh(mesh)) depths.push(Vector3.Distance(sub.getBoundingInfo().boundingSphere.centerWorld, eye));
      }
    }
    return depths.sort((a, b) => b - a);
  }

  // --- ready-made pieces --------------------------------------------------------

  /** A glow that blooms and fades. `follow` tracks the supplied position vector. */
  flashSprite(at: Vector3, color: Rgb, size: number, life: number, alpha = 1, texture: TextureName = 'glow', follow = false): void {
    const q = this.quad(texture, color, alpha);
    const pos = follow ? at : at.clone();
    const spin = Math.random() * Math.PI * 2;
    this.add({
      update: (_dt, age) => {
        const t = age / life;
        if (t >= 1) return false;
        this.sprite(q, pos, size * (.6 + .4 * Math.sqrt(t)), spin);
        this.tint(q, color, alpha * (1 - t) * (1 - t));
        return true;
      },
      dispose: () => this.release(q),
    });
  }

  /** An expanding ground ring from radius r0 to r1. */
  ring(at: Vector3, color: Rgb, r0: number, r1: number, life: number, alpha = 1): void {
    const q = this.quad('ring', color, alpha);
    const pos = at.clone();
    this.add({
      update: (_dt, age) => {
        const t = age / life;
        if (t >= 1) return false;
        const e = 1 - (1 - t) ** 3;
        this.decal(q, pos, (r0 + (r1 - r0) * e) * 2);
        this.tint(q, color, alpha * (1 - t));
        return true;
      },
      dispose: () => this.release(q),
    });
  }

  /** A soft ground glow that fades (scorch / frost mark). */
  groundGlow(at: Vector3, color: Rgb, radius: number, life: number, alpha = .6): void {
    const q = this.quad('glow', color, alpha);
    const pos = at.clone();
    this.add({
      update: (_dt, age) => {
        const t = age / life;
        if (t >= 1) return false;
        this.decal(q, pos, radius * 2);
        this.tint(q, color, alpha * (1 - t));
        return true;
      },
      dispose: () => this.release(q),
    });
  }

  /** Light the surroundings briefly. `follow` tracks the supplied position vector. */
  flash(at: Vector3, color: Rgb, intensity: number, range: number, life: number, follow = false): void {
    if (this.lightLife > 0 && this.lightPeak * (1 - this.lightAge / this.lightLife) > intensity) return;
    // A flash can be requested after update(). Do not move the previous flash's intensity
    // to this new location for the frame before the new envelope starts.
    this.light.intensity = 0;
    this.light.position.copyFrom(at);
    this.lightFollow = follow ? at : null;
    this.light.diffuse.set(color[0], color[1], color[2]);
    this.light.range = range;
    this.lightPeak = intensity;
    this.lightLife = life;
    this.lightAge = 0;
  }

  /**
   * Fast stretched sparks. `dir` biases them (null: all round); `spread` 0..1 is the cone width.
   */
  sparks(at: Vector3, count: number, color: Rgb, hot: Rgb, speed: number, dir: Vector3 | null = null, spread = 1, size = 1): void {
    const ps = this.sparkSystems[this.sparkNext++ % this.sparkSystems.length];
    (ps.emitter as Vector3).copyFrom(at);
    ps.color1.set(hot[0], hot[1], hot[2], 1);
    ps.color2.set(color[0], color[1], color[2], 1);
    ps.colorDead.set(color[0] * .2, color[1] * .2, color[2] * .3, 0);
    ps.minEmitPower = speed * .45;
    ps.maxEmitPower = speed;
    ps.minSize = .05 * size;
    ps.maxSize = .11 * size;
    const d = dir ?? Vector3.UpReadOnly;
    const s = dir ? spread : 1;
    ps.direction1.set(d.x - s, (dir ? d.y : 0) + .15, d.z - s);
    ps.direction2.set(d.x + s, (dir ? d.y : 0) + .9, d.z + s);
    ps.manualEmitCount = (ps.manualEmitCount > 0 ? ps.manualEmitCount : 0) + count;
  }

  /** A small metal-hit spray; quads keep simultaneous hits at their own contact points. */
  hitSparks(at: Vector3): void {
    const color: Rgb = [1, .78, .38];
    const origin = at.clone();
    const glint = this.quad('star', GLINT);
    this.glowing(glint);
    const spin = Math.random() * Math.PI;
    const normal = this.camera.globalPosition.subtract(origin).normalize();
    const right = Vector3.Cross(Vector3.Up(), normal).normalize();
    const up = Vector3.Cross(normal, right).normalize();
    const phase = Math.random() * Math.PI * 2;
    const sparks = Array.from({ length: 7 }, (_, i) => {
      const angle = phase + i * Math.PI / 3 + Math.random() * .3;
      const speed = 2.8 + Math.random() * 2;
      const q = this.quad('streak', color);
      this.glowing(q);
      return {
        q,
        velocity: right.scale(Math.cos(angle) * speed).addInPlace(up.scale(Math.sin(angle) * speed)).addInPlace(normal.scale(.8)),
        life: .22 + Math.random() * .1,
      };
    });
    const head = new Vector3(), tail = new Vector3();
    const effect: Effect = {
      update: (_dt, age) => {
        let active = age < .09;
        if (active) {
          this.sprite(glint, origin, .5 + age * 2, spin);
          this.tint(glint, GLINT, 1 - age / .09);
        } else glint.visible = false;
        for (const spark of sparks) {
          if (age >= spark.life) { spark.q.visible = false; continue; }
          active = true;
          const end = age + .025;
          const start = Math.max(0, end - .065);
          spark.velocity.scaleToRef(end, head).addInPlace(origin);
          spark.velocity.scaleToRef(start, tail).addInPlace(origin);
          head.y -= 5 * end * end;
          tail.y -= 5 * start * start;
          this.streak(spark.q, tail, head, .09);
          this.tint(spark.q, color, Math.min(1, (1 - age / spark.life) * 1.6));
        }
        return active;
      },
      dispose: () => { this.release(glint); for (const spark of sparks) this.release(spark.q); },
    };
    // Show a visible streak on the hit frame, including hits spawned during VFX updates.
    effect.update(0, 0);
    this.add(effect);
  }

  /** Slow luminous vapour puffs. */
  vapour(at: Vector3, count: number, color: Rgb, size = 1, rise = .6, life = .7): void {
    const ps = this.vapourSystems[this.vapourNext++ % this.vapourSystems.length];
    (ps.emitter as Vector3).copyFrom(at);
    ps.color1.set(color[0], color[1], color[2], .55);
    ps.color2.set(color[0] * .7, color[1] * .8, color[2], .4);
    ps.colorDead.set(0, 0, 0, 0);
    ps.minSize = .5 * size;
    ps.maxSize = 1.1 * size;
    ps.minLifeTime = life * .6;
    ps.maxLifeTime = life;
    ps.direction1.set(-.4, rise * .5, -.4);
    ps.direction2.set(.4, rise, .4);
    ps.manualEmitCount = (ps.manualEmitCount > 0 ? ps.manualEmitCount : 0) + count;
  }

  /** Make a quad glow through the scene's glow layer for its lifetime. */
  glowing(q: FxQuad): void {
    q.glow = true;
  }

  /** Add a model's emissive part to the glow layer (it leaves when disposed). */
  glowMesh(mesh: Mesh): void {
    this.glow.addIncludedOnlyMesh(mesh);
  }

  // --- setup ------------------------------------------------------------------

  private makeSparks(i: number): ParticleSystem {
    const ps = new ParticleSystem(`fx-sparks-${i}`, 400, this.scene);
    ps.particleTexture = this.textures.get('spark')!;
    ps.emitter = new Vector3();
    ps.blendMode = ParticleSystem.BLENDMODE_ADD;
    ps.billboardMode = ParticleSystem.BILLBOARDMODE_STRETCHED;
    ps.minEmitBox = new Vector3(-.05, -.05, -.05);
    ps.maxEmitBox = new Vector3(.05, .05, .05);
    ps.minLifeTime = .18;
    ps.maxLifeTime = .42;
    ps.minScaleX = 1; ps.maxScaleX = 1;
    ps.minScaleY = 3.5; ps.maxScaleY = 6;
    ps.gravity = new Vector3(0, -14, 0);
    ps.emitRate = 0;
    ps.manualEmitCount = 0;
    ps.updateSpeed = 1 / 60;
    ps.isLocal = false;
    ps.preventAutoStart = false;
    ps.start();
    return ps;
  }

  private makeVapour(i: number): ParticleSystem {
    const ps = new ParticleSystem(`fx-vapour-${i}`, 160, this.scene);
    ps.particleTexture = this.textures.get('vapour')!;
    ps.emitter = new Vector3();
    ps.blendMode = ParticleSystem.BLENDMODE_ADD;
    ps.minEmitBox = new Vector3(-.15, 0, -.15);
    ps.maxEmitBox = new Vector3(.15, .15, .15);
    ps.minEmitPower = .3;
    ps.maxEmitPower = 1.1;
    ps.minAngularSpeed = -1.5;
    ps.maxAngularSpeed = 1.5;
    ps.minInitialRotation = 0;
    ps.maxInitialRotation = Math.PI * 2;
    ps.addSizeGradient(0, .6);
    ps.addSizeGradient(1, 1.6);
    ps.gravity = new Vector3(0, .5, 0);
    ps.emitRate = 0;
    ps.manualEmitCount = 0;
    ps.updateSpeed = 1 / 60;
    ps.start();
    return ps;
  }

  /** Effect textures, drawn white-on-black for additive tinting. */
  private makeTextures(): DynamicTexture {
    const make = (name: TextureName, w: number, h: number, draw: (x: CanvasRenderingContext2D, w: number, h: number) => void, alpha = false) => {
      const tex = new DynamicTexture(`fx-${name}`, { width: w, height: h }, this.scene, true);
      const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, w, h);
      draw(ctx, w, h);
      tex.update(false);
      tex.wrapU = tex.wrapV = Texture.CLAMP_ADDRESSMODE;
      tex.hasAlpha = alpha;
      this.textures.set(name, tex);
    };
    const pixels = (ctx: CanvasRenderingContext2D, w: number, h: number, f: (u: number, v: number) => number | [number, number, number] | [number, number, number, number]) => {
      const img = ctx.createImageData(w, h);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const value = f((x + .5) / w, (y + .5) / h);
        const [r, g, b] = typeof value === 'number' ? [value, value, value] : value;
        const i = (y * w + x) * 4;
        img.data[i] = clamp255(r); img.data[i + 1] = clamp255(g); img.data[i + 2] = clamp255(b);
        img.data[i + 3] = clamp255(typeof value === 'number' ? 1 : value[3] ?? 1);
      }
      ctx.putImageData(img, 0, 0);
    };
    // soft round glow with a hot centre
    make('glow', 128, 128, (ctx, w, h) => pixels(ctx, w, h, (u, v) => {
      const r = Math.hypot(u - .5, v - .5) * 2;
      return r >= 1 ? 0 : Math.pow(1 - r, 2.2) * .85 + Math.exp(-r * r * 40) * .5;
    }));
    // thin ring with an inner haze
    make('ring', 256, 256, (ctx, w, h) => pixels(ctx, w, h, (u, v) => {
      const r = Math.hypot(u - .5, v - .5) * 2;
      return bell((r - .86) / .045) + bell((r - .86) / .16) * .35 + (r < .86 ? r ** 6 * .25 : 0);
    }));
    // Blessing halos need room outside the bright ring for their soft falloff.
    // A transparent circular margin prevents the square decal from clipping the glow.
    make('healing-ring', 256, 256, (ctx, w, h) => pixels(ctx, w, h, (u, v) => {
      const r = Math.hypot(u - .5, v - .5) * 2;
      const scaled = r * .86 / .68;
      const intensity = bell((scaled - .86) / .045) + bell((scaled - .86) / .16) * .35
        + (scaled < .86 ? scaled ** 6 * .25 : 0);
      const alpha = Math.min(1, intensity) * (1 - smoothstep(.88, .96, r));
      return [1, 1, 1, alpha];
    }), true);
    // Padded transparent danger ring: its glow ends before any texture edge.
    // Alpha blending preserves red over bright ground instead of adding it to green.
    make('warning-ring', 256, 256, (ctx, w, h) => pixels(ctx, w, h, (u, v) => {
      const r = Math.hypot(u - .5, v - .5) * 2;
      const a = (bell((r - .78) / .025) + bell((r - .78) / .07) * .3)
        * (1 - smoothstep(.9, .97, r));
      return [1, 1, 1, Math.min(1, a)];
    }), true);

    // tracer: bright head at u=1, long taper to the tail, gaussian across
    make('streak', 256, 64, (ctx, w, h) => pixels(ctx, w, h, (u, v) => {
      const across = bell((v - .5) / .2) * .7 + bell((v - .5) / .06);
      const along = Math.pow(u, 1.6) * (1 - smoothstep(.94, 1, u));
      return across * along;
    }));
    // Transparent sword silhouette: unequal splintered tips at both ends, no rectangular backing.
    make('sword-cut', 256, 64, (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      const points = [[.015,.51],[.30,.39],[.13,.20],[.45,.38],[.67,.40],
        [.91,.17],[.77,.43],[.985,.49],[.70,.60],[.86,.79],
        [.54,.62],[.35,.60],[.07,.76],[.23,.56]];
      points.forEach(([u,v],i) => i ? ctx.lineTo(u*w,v*h) : ctx.moveTo(u*w,v*h));
      ctx.closePath(); ctx.fill();
    }, true);
    // lance: a rounded flame-spear head with a slowly fading body (Snow White's shot)
    make('lance', 256, 64, (ctx, w, h) => pixels(ctx, w, h, (u, v) => {
      const width = .12 + .34 * Math.pow(u, .7) * (1 - smoothstep(.88, 1, u)) + .1 * bell((u - .9) / .05);
      const d = Math.abs(v - .5) / Math.max(.02, width);
      const body = Math.exp(-d * d * 2.2) * (.25 + .75 * Math.pow(u, 1.3)) * (1 - smoothstep(.95, 1, u));
      const core = bell((v - .5) / .045) * smoothstep(.15, .85, u) * (1 - smoothstep(.96, 1, u));
      return body + core * .9;
    }));
    // spark: soft dot (stretched by the particle system)
    make('spark', 32, 32, (ctx, w, h) => pixels(ctx, w, h, (u, v) => {
      const r = Math.hypot(u - .5, v - .5) * 2;
      return r >= 1 ? 0 : Math.pow(1 - r, 1.5);
    }));
    // vapour: lumpy soft blob
    make('vapour', 128, 128, (ctx, w, h) => pixels(ctx, w, h, (u, v) => {
      const r = Math.hypot(u - .5, v - .5) * 2;
      const n = fbm(u * 5, v * 5);
      return r >= 1 ? 0 : Math.pow(1 - r, 1.8) * (.45 + .75 * n);
    }));
    // Opaque billowing centre, feathered irregular edge. RGB carries the soot detail;
    // alpha provides actual cover instead of just brightening the model underneath.
    make('smoke', 128, 128, (ctx, w, h) => pixels(ctx, w, h, (u, v) => {
      const x = (u - .5) * 2, y = (v - .5) * 2;
      const n = fbm(u * 8, v * 8);
      const edge = Math.hypot(x, y) + (n - .5) * .18 + Math.sin(Math.atan2(y, x) * 7) * .035;
      const shade = .25 + n * .85;
      return [shade, shade, shade, 1 - smoothstep(.58, .94, edge)];
    }), true);
    // Hot fractured lobes rather than a uniform glow: white-yellow pockets, orange seams,
    // dark red outer folds and a crisp, irregular silhouette.
    make('fireball', 256, 256, (ctx, w, h) => pixels(ctx, w, h, (u, v) => {
      const x = (u - .5) * 2, y = (v - .5) * 2;
      const r = Math.hypot(x, y), n = fbm(u * 7, v * 7);
      const folds = Math.abs(noise(u * 11, v * 11) - .5) * 2;
      const heat = Math.max(0, Math.min(1, 1.25 - r * .85 + (n - .5) * .8 - folds * .55));
      const edge = r + (n - .5) * .32 + Math.sin(Math.atan2(y, x) * 9) * .055;
      return [Math.min(1, .55 + heat), .08 + .92 * heat ** 1.4, .015 + .8 * heat ** 4, 1 - smoothstep(.7, .92, edge)];
    }), true);
    // four-point muzzle star
    make('hunter-mark', 128, 128, (ctx) => {
      ctx.clearRect(0, 0, 128, 128);
      ctx.save(); ctx.translate(0, 128); ctx.scale(1, -1);
      // Compact downward hunting arrow with barbed shoulders and a dark keyline.
      ctx.beginPath();
      ctx.moveTo(53, 12); ctx.lineTo(75, 12); ctx.lineTo(75, 58);
      ctx.lineTo(104, 43); ctx.lineTo(64, 116); ctx.lineTo(24, 43);
      ctx.lineTo(53, 58); ctx.closePath();
      ctx.strokeStyle = '#190403'; ctx.lineWidth = 9; ctx.lineJoin = 'round'; ctx.stroke();
      ctx.fillStyle = '#f52c24'; ctx.fill();
      ctx.beginPath(); ctx.moveTo(59, 20); ctx.lineTo(59, 70); ctx.lineTo(39, 60);
      ctx.strokeStyle = '#ff8d74'; ctx.lineWidth = 4; ctx.stroke();
      ctx.restore();
    }, true);
    make('bleed-mark', 128, 128, (ctx) => {
      ctx.clearRect(0, 0, 128, 128);
      ctx.save(); ctx.translate(0, 128); ctx.scale(1, -1);
      // Blood drop with a dark keyline, matching the other overhead status icons.
      ctx.beginPath(); ctx.moveTo(64, 9);
      ctx.bezierCurveTo(57, 38, 28, 59, 28, 82);
      ctx.bezierCurveTo(28, 126, 100, 126, 100, 82);
      ctx.bezierCurveTo(100, 59, 71, 38, 64, 9);
      ctx.closePath(); ctx.strokeStyle = '#300711'; ctx.lineWidth = 9;
      ctx.lineJoin = 'round'; ctx.stroke(); ctx.fillStyle = '#f32949'; ctx.fill();
      ctx.beginPath(); ctx.moveTo(49, 65);
      ctx.bezierCurveTo(36, 84, 42, 98, 54, 101);
      ctx.strokeStyle = '#ffbac6'; ctx.lineWidth = 7; ctx.lineCap = 'round'; ctx.stroke();
      ctx.restore();
    }, true);
    make('burn-mark', 128, 128, (ctx) => {
      ctx.clearRect(0, 0, 128, 128);
      ctx.save();ctx.translate(0, 128);ctx.scale(1, -1);
      // Readable flame silhouette with a dark keyline, cyan body and white-hot core.
      ctx.beginPath();ctx.moveTo(66, 8);
      ctx.bezierCurveTo(80, 38, 43, 40, 65, 65);
      ctx.bezierCurveTo(78, 59, 87, 44, 85, 32);
      ctx.bezierCurveTo(119, 63, 111, 111, 68, 117);
      ctx.bezierCurveTo(25, 121, 9, 85, 31, 57);
      ctx.bezierCurveTo(29, 75, 39, 79, 43, 71);
      ctx.bezierCurveTo(28, 44, 56, 32, 66, 8);ctx.closePath();
      ctx.strokeStyle='#062334';ctx.lineWidth=9;ctx.lineJoin='round';ctx.stroke();
      ctx.fillStyle='#32cfff';ctx.fill();
      ctx.beginPath();ctx.moveTo(65, 63);
      ctx.bezierCurveTo(61, 82, 83, 82, 82, 97);
      ctx.bezierCurveTo(79, 115, 47, 111, 48, 94);
      ctx.bezierCurveTo(49, 82, 58, 79, 65, 63);ctx.closePath();
      ctx.fillStyle='#f2ffff';ctx.fill();ctx.restore();
    }, true);
    make('rose-petal', 128, 128, ctx => {
      ctx.clearRect(0, 0, 128, 128);
      const shade = ctx.createLinearGradient(25, 18, 95, 112);
      shade.addColorStop(0, '#ffb4d1'); shade.addColorStop(.38, '#ed477d');
      shade.addColorStop(.72, '#b51850'); shade.addColorStop(1, '#650d35');
      ctx.beginPath(); ctx.moveTo(28, 111);
      ctx.bezierCurveTo(12, 76, 13, 31, 47, 17);
      ctx.bezierCurveTo(62, 10, 76, 16, 79, 29);
      ctx.bezierCurveTo(94, 15, 114, 37, 109, 59);
      ctx.bezierCurveTo(104, 91, 56, 99, 28, 111);
      ctx.closePath(); ctx.fillStyle = shade; ctx.fill();
      ctx.strokeStyle = '#681438'; ctx.lineWidth = 3; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(29, 106); ctx.bezierCurveTo(53, 85, 66, 58, 77, 33);
      ctx.strokeStyle = '#ffa4c9'; ctx.lineWidth = 3; ctx.stroke();
    }, true);
    make('petal', 128, 128, (ctx, w, h) => {
      ctx.fillStyle = '#fff'; ctx.beginPath();
      ctx.moveTo(w*.18,h*.85); ctx.bezierCurveTo(-w*.05,h*.25,w*.25,-h*.1,w*.62,h*.2);
      ctx.lineTo(w*.62,h*.32); ctx.lineTo(w*.76,h*.22);
      ctx.bezierCurveTo(w*1.05,h*.58,w*.65,h*.94,w*.18,h*.85); ctx.fill();
    });
    make('star', 128, 128, (ctx, w, h) => pixels(ctx, w, h, (u, v) => {
      const x = Math.abs(u - .5) * 2, y = Math.abs(v - .5) * 2, r = Math.hypot(x, y);
      const rays = Math.exp(-x * 26) * (1 - y) + Math.exp(-y * 26) * (1 - x);
      return Math.max(0, rays * 1.1 + (r < 1 ? Math.pow(1 - r, 3) : 0));
    }));
    // flame tongue: teardrop pointing toward u=1
    make('tongue', 128, 64, (ctx, w, h) => pixels(ctx, w, h, (u, v) => {
      const width = .45 * Math.sin(Math.PI * Math.min(1, Math.pow(u, .55))) * (1 - u * .65);
      const d = Math.abs(v - .5) / Math.max(.01, width);
      return d >= 1 ? 0 : Math.pow(1 - d, 1.4) * (1 - smoothstep(.8, 1, u)) * (.5 + .5 * smoothstep(0, .3, u));
    }));
    // Crisp sacred geometry with a generous transparent border for mipmaps/bloom.
    for (const name of ['holy-seal', 'holy-halo'] as const) make(name, 256, 256, (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h); ctx.translate(w / 2, h / 2);
      ctx.strokeStyle = '#fff'; ctx.fillStyle = '#fff'; ctx.lineWidth = 2;
      const circle = (r: number) => { ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke(); };
      circle(96); circle(90); circle(name === 'holy-seal' ? 68 : 80);
      for (let i = 0; i < 24; i++) {
        ctx.save(); ctx.rotate(i * Math.PI / 12);
        ctx.beginPath(); ctx.moveTo(0, -90); ctx.lineTo(0, i % 3 === 0 ? -78 : -85); ctx.stroke();
        if (i % 3 === 0) {
          ctx.beginPath(); ctx.moveTo(0, -107); ctx.lineTo(3, -101); ctx.lineTo(0, -95); ctx.lineTo(-3, -101); ctx.closePath(); ctx.fill();
        }
        ctx.restore();
      }
      if (name === 'holy-seal') {
        // User-provided priest emblem: four curved blades and two left flourishes.
        // Keep its asymmetric silhouette and open junction inside the ornate rings.
        ctx.save(); ctx.scale(.38, .38); ctx.translate(-103, -160);
        const emblem = new Path2D([
          'M103 3 C89 48 88 94 103 124 C119 94 118 49 103 3 Z',
          'M2 130 C36 113 69 114 97 130 C69 145 34 146 2 130 Z',
          'M109 130 C139 114 174 113 205 130 C172 146 139 145 109 130 Z',
          'M103 137 C82 178 84 240 103 319 C122 242 125 181 103 137 Z',
          'M32 64 L73 91 C79 88 84 87 89 88 L85 97 C76 99 74 106 77 116 C69 113 65 110 64 103 Z',
          'M32 203 L65 158 C65 152 69 148 77 145 C74 155 77 162 86 164 L89 173 C82 173 77 172 73 169 Z',
        ].join(' '));
        ctx.fill(emblem); ctx.restore();
      }
    }, true);
    make('holy-shard', 128, 128, (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h); ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.moveTo(64, 10); ctx.lineTo(74, 54); ctx.lineTo(106, 64);
      ctx.lineTo(74, 74); ctx.lineTo(64, 118); ctx.lineTo(54, 74); ctx.lineTo(22, 64); ctx.lineTo(54, 54); ctx.closePath(); ctx.fill();
    }, true);
    // Scarlet's drink: a tokkuri sake bottle, a hollow bubble and a dizzy spiral, as bold line glyphs.
    make('sake', 128, 128, (ctx) => {
      ctx.clearRect(0, 0, 128, 128); ctx.fillStyle = '#fff'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 6; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(56, 14); ctx.lineTo(72, 14); ctx.lineTo(70, 36);
      ctx.bezierCurveTo(98, 52, 100, 96, 88, 114); ctx.lineTo(40, 114); ctx.bezierCurveTo(28, 96, 30, 52, 58, 36); ctx.closePath(); ctx.stroke();
      ctx.fillRect(52, 8, 24, 8);
      ctx.globalAlpha = .45; ctx.beginPath(); ctx.moveTo(38, 84); ctx.bezierCurveTo(52, 78, 76, 90, 90, 84); ctx.lineTo(88, 112); ctx.lineTo(40, 112); ctx.closePath(); ctx.fill();
    }, true);
    make('bubble', 128, 128, (ctx) => {
      ctx.clearRect(0, 0, 128, 128); ctx.strokeStyle = '#fff'; ctx.fillStyle = '#fff'; ctx.lineWidth = 7;
      ctx.beginPath(); ctx.arc(64, 64, 46, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(46, 44, 12, 7, -.7, 0, Math.PI * 2); ctx.fill();
    }, true);
    make('swirl', 128, 128, (ctx) => {
      ctx.clearRect(0, 0, 128, 128); ctx.strokeStyle = '#fff'; ctx.lineWidth = 7; ctx.lineCap = 'round';
      ctx.beginPath();
      for (let i = 0; i <= 80; i++) { const a = i / 80 * Math.PI * 5, r = 4 + i / 80 * 50; ctx[i ? 'lineTo' : 'moveTo'](64 + Math.cos(a) * r, 64 + Math.sin(a) * r); }
      ctx.stroke();
    }, true);
    // The quads draw from one atlas of all of these (particle systems keep the separate textures).
    const atlas = new DynamicTexture('fx-atlas', { width: ATLAS_WIDTH, height: ATLAS_HEIGHT }, this.scene, true);
    const paint = atlas.getContext() as unknown as CanvasRenderingContext2D;
    paint.clearRect(0, 0, ATLAS_WIDTH, ATLAS_HEIGHT);
    for (const [name, [x, y]] of Object.entries(ATLAS) as [TextureName, readonly number[]][]) {
      const source = (this.textures.get(name) as DynamicTexture).getContext() as unknown as CanvasRenderingContext2D;
      paint.drawImage(source.canvas, x, y);
    }
    atlas.update(false);
    atlas.wrapU = atlas.wrapV = Texture.CLAMP_ADDRESSMODE;
    atlas.hasAlpha = true;
    return atlas;
  }
}

const GLINT: Rgb = [1, .94, .72];

/** A lone camera-facing quad with its own texture (world labels), alpha-blended like the effect quads. */
export function labelQuad(scene: Scene, name: string, texture: BaseTexture): Mesh {
  const mesh = MeshBuilder.CreatePlane(name, { size: 1, sideOrientation: Mesh.DOUBLESIDE }, scene);
  mesh.isPickable = false;
  mesh.billboardMode = Mesh.BILLBOARDMODE_ALL;
  const material = new ShaderMaterial(name, scene, 'fxQuad', {
    attributes: ['position', 'uv'],
    uniforms: ['worldViewProjection', 'color', 'alpha'],
    samplers: ['tex'],
    needAlphaBlending: true,
  });
  material.alphaMode = Constants.ALPHA_COMBINE;
  material.disableDepthWrite = true;
  material.backFaceCulling = false;
  material.setTexture('tex', texture);
  material.setColor3('color', Color3.White());
  material.setFloat('alpha', 1);
  mesh.material = material;
  return mesh;
}

/** exp(-x²) */
const bell = (x: number) => Math.exp(-x * x);
const clamp255 = (v: number) => Math.max(0, Math.min(255, Math.round(v * 255)));
function hash(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function noise(x: number, y: number): number {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy), b = hash(ix + 1, iy), c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}
function fbm(x: number, y: number): number {
  return noise(x, y) * .5 + noise(x * 2.1, y * 2.1) * .3 + noise(x * 4.3, y * 4.3) * .2;
}
