// 3D effect toolkit for the survivor runtime. Characters build their effects from these parts:
//   sprite   camera-facing glow quad (flashes, cores, blooms)
//   streak   quad stretched between two points that turns about its own axis to face the camera
//            (bullets, lances, tracers, flame tongues)
//   decal    flat quad on the ground (rings, shockwaves, frost marks)
//   burst    pooled CPU particle systems (sparks, embers, vapour)
//   flash    one pooled point light for muzzle and explosion light
// Textures are drawn once at start-up; lights are additive, while smoke uses alpha blending
// to conceal disappearing bodies. Neither writes depth. Effects run on game time (pausable).

import {
  Color3, Constants, DynamicTexture, Effect as ShaderEffect, type Camera, Mesh, MeshBuilder, ParticleSystem,
  PointLight, Quaternion, type Scene, ShaderMaterial, Texture, Vector3, type GlowLayer,
} from '@babylonjs/core';
import { smoothstep } from './math';

export type Rgb = readonly [number, number, number];
export const rgb = (hex: number): Rgb => [(hex >> 16 & 255) / 255, (hex >> 8 & 255) / 255, (hex & 255) / 255];

type TextureName = 'glow' | 'ring' | 'warning-ring' | 'streak' | 'lance' | 'spark' | 'vapour' | 'star' | 'tongue' | 'smoke' | 'fireball';

/** A running effect: return false from update when finished. */
export interface Effect {
  update(dt: number, age: number): boolean;
  dispose?(): void;
}

export interface FxQuad {
  mesh: Mesh;
  material: ShaderMaterial;
  /** bound to the material's `color` uniform (ShaderMaterial keeps the reference) */
  color: Color3;
  busy: boolean;
}

// Effect quads: texture × colour, added to the scene at `alpha` strength. Babylon's StandardMaterial
// either adds an emissive texture on top of its colour (a filled square) or, unlit, drops the
// diffuse term, so the quads use this instead.
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
const X = new Vector3(), Y = new Vector3(), Z = new Vector3();

export class Vfx {
  readonly textures = new Map<TextureName, Texture>();
  private readonly effects: { effect: Effect; age: number }[] = [];
  /** every pooled quad (the artifacts/ verification scripts inspect it) */
  private readonly quads: FxQuad[] = [];
  /** released quads ready for reuse; the pool only grows when this is empty */
  private readonly freeQuads: FxQuad[] = [];
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
    this.makeTextures();
    this.light = new PointLight('fx-light', Vector3.Zero(), scene);
    this.light.intensity = 0;
    this.light.range = 9;
    this.light.specular.set(0, 0, 0);
    for (let i = 0; i < 8; i++) this.sparkSystems.push(this.makeSparks(i));
    for (let i = 0; i < 6; i++) this.vapourSystems.push(this.makeVapour(i));
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
      const mesh = MeshBuilder.CreatePlane('fx-quad', { size: 1, sideOrientation: Mesh.DOUBLESIDE }, this.scene);
      mesh.isPickable = false;
      mesh.rotationQuaternion = new Quaternion();
      const material = new ShaderMaterial('fx-quad-mat', this.scene, 'fxQuad', {
        attributes: ['position', 'uv'],
        uniforms: ['worldViewProjection', 'color', 'alpha'],
        samplers: ['tex'],
        needAlphaBlending: true,
      });
      material.alphaMode = Constants.ALPHA_ADD;
      material.disableDepthWrite = true;
      material.backFaceCulling = false;
      mesh.material = material;
      const color = new Color3();
      material.setColor3('color', color);
      q = { mesh, material, color, busy: false };
      this.quads.push(q);
    }
    q.busy = true;
    // Shots spawn after the VFX update; impacts can spawn during it. Keep a new lease hidden
    // until placement, or it renders for one frame at the origin / its previous effect's position.
    q.mesh.setEnabled(false);
    q.mesh.billboardMode = Mesh.BILLBOARDMODE_NONE;
    // sprite() drops the quaternion for billboarding; every other placement sets its own
    q.mesh.rotationQuaternion ??= new Quaternion();
    q.mesh.rotationQuaternion.copyFromFloats(0, 0, 0, 1);
    q.mesh.rotation.setAll(0);
    q.mesh.scaling.setAll(1);
    q.material.alphaMode = blend === 'alpha' ? Constants.ALPHA_COMBINE : Constants.ALPHA_ADD;
    q.material.setTexture('tex', this.textures.get(texture)!);
    this.tint(q, color, alpha);
    return q;
  }

  tint(q: FxQuad, color: Rgb, alpha: number): void {
    q.color.set(color[0], color[1], color[2]);
    q.material.setFloat('alpha', Math.max(0, Math.min(1, alpha)));
  }

  release(q: FxQuad): void {
    // A second release must not put the quad in the free list twice (two owners at once).
    if (!q.busy) return;
    q.busy = false;
    q.mesh.setEnabled(false);
    this.glow.removeIncludedOnlyMesh(q.mesh);
    this.glow.unReferenceMeshFromUsingItsOwnMaterial(q.mesh);
    this.freeQuads.push(q);
  }

  /** Camera-facing quad of `size` metres at `at`. */
  sprite(q: FxQuad, at: Vector3, size: number, spin = 0): void {
    q.mesh.billboardMode = Mesh.BILLBOARDMODE_ALL;
    q.mesh.position.copyFrom(at);
    q.mesh.scaling.set(size, size, 1);
    q.mesh.rotationQuaternion = null;
    q.mesh.rotation.set(0, 0, spin);
    q.mesh.setEnabled(true);
  }

  /** Stretch a quad from `tail` to `head` (texture u: 0 at the tail, 1 at the head), facing the camera. */
  streak(q: FxQuad, tail: Vector3, head: Vector3, width: number): void {
    q.mesh.billboardMode = Mesh.BILLBOARDMODE_NONE;
    if (!q.mesh.rotationQuaternion) q.mesh.rotationQuaternion = new Quaternion();
    head.subtractToRef(tail, X);
    const length = X.length();
    if (length < 1e-4) { q.mesh.setEnabled(false); return; }
    X.scaleInPlace(1 / length);
    tail.addToRef(head, TMP.a).scaleInPlace(.5);
    this.camera.globalPosition.subtractToRef(TMP.a, TMP.b);
    Vector3.CrossToRef(TMP.b, X, Y);
    if (Y.lengthSquared() < 1e-8) Y.set(0, 1, 0);
    Y.normalize();
    Vector3.CrossToRef(X, Y, Z);
    Quaternion.RotationQuaternionFromAxisToRef(X, Y, Z, q.mesh.rotationQuaternion);
    q.mesh.position.copyFrom(TMP.a);
    q.mesh.scaling.set(length, width, 1);
    q.mesh.setEnabled(true);
  }

  /** Flat quad on the ground (y a little above 0), `size` metres across. */
  decal(q: FxQuad, at: Vector3, size: number, yaw = 0, sx = 1): void {
    q.mesh.billboardMode = Mesh.BILLBOARDMODE_NONE;
    if (!q.mesh.rotationQuaternion) q.mesh.rotationQuaternion = new Quaternion();
    Quaternion.RotationYawPitchRollToRef(yaw, Math.PI / 2, 0, q.mesh.rotationQuaternion);
    q.mesh.position.set(at.x, at.y + .03, at.z);
    q.mesh.scaling.set(size * sx, size, 1);
    q.mesh.setEnabled(true);
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
    const glint = this.quad('star', [1, .94, .72]);
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
          this.tint(glint, [1, .94, .72], 1 - age / .09);
        } else glint.mesh.setEnabled(false);
        for (const spark of sparks) {
          if (age >= spark.life) { spark.q.mesh.setEnabled(false); continue; }
          active = true;
          const end = age + .025;
          const start = Math.max(0, end - .065);
          head.copyFrom(origin).addInPlace(spark.velocity.scale(end));
          tail.copyFrom(origin).addInPlace(spark.velocity.scale(start));
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
    this.glow.addIncludedOnlyMesh(q.mesh);
    // the glow pass reads emissive by default, which these quads don't use
    this.glow.referenceMeshToUseItsOwnMaterial(q.mesh);
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
  private makeTextures(): void {
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
  }
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
