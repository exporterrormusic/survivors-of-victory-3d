// Ground warnings in the game's tell language (GAME_PLAN §6): every enemy attack warns in red, as
// a circle that fills before an area hit lands or a chevron lane before a beam, charge or run; cyan
// rings mark friendly things. Procedural with hard, anti-aliased edges (like Rapunzel's seals), so
// outlines stay crisp at any size and the fill is exact.

import type { TellState } from '../../net/protocol';
import { Color3, Constants, Effect, Mesh, MeshBuilder, ShaderMaterial, Vector2, type Scene } from '@babylonjs/core';

export type TellColor = readonly [number, number, number];

export const TELL = {
  /** area damage incoming */
  area: [1, .13, .1],
  /** beam, charge or strafing path: red like every enemy attack */
  charge: [1, .1, .14],
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
// Edges are hard steps with a ~2 cm anti-alias, never wide smoothstep falloffs.
Effect.ShadersStore.modeTellFragmentShader = `
precision highp float;
varying vec2 vUV;
uniform vec3 color;
uniform float alpha;
uniform float fill;
uniform float shape;
uniform vec2 size;
uniform float time;
const float AA = .025;
// 1 inside [lo, hi] (metres), crisp edges
float strip(float d, float lo, float hi) { return smoothstep(lo - AA, lo, d) * (1.0 - smoothstep(hi, hi + AA, d)); }
void main() {
  float a = 0.0;
  if (shape < .5) {
    float radius = size.x * .5;
    float r = length(vUV - .5) * 2.0 * radius;
    if (r > radius) discard;
    float outline = strip(r, radius - .11, radius);
    // short ticks just inside the rim, slowly turning
    float angle = atan(vUV.y - .5, vUV.x - .5) + time * .6;
    float tick = step(.75, fract(angle / 6.2832 * 24.0)) * strip(r, radius - .38, radius - .2);
    float front = fill > .001 && fill < .999 ? strip(r, fill * radius - .07, fill * radius) : 0.0;
    float filled = r <= fill * radius ? .26 : 0.0;
    a = max(max(outline, front), max(max(filled, tick * .8), .07));
  } else {
    float halfW = size.x * .5, along = vUV.y * size.y, across = abs(vUV.x - .5) * size.x;
    float edge = strip(across, halfW - .08, halfW);
    // chevrons point away from the attacker, down the lane, and stream that way
    float chevron = step(.72, fract((along + across * .9) / 1.1 - time * 1.4)) * .3;
    float filled = along <= fill * size.y ? .22 : 0.0;
    float front = fill > .001 && fill < .999 ? strip(along, fill * size.y - .1, fill * size.y) : 0.0;
    float tip = step(size.y - .12, along);
    a = max(max(edge, chevron), max(filled, max(front, .06))) * (1.0 - tip);
  }
  gl_FragColor = vec4(color, clamp(a * alpha, 0.0, 1.0));
}`;

/** The pooled mesh and shader behind a tell; reused across many leases. */
class TellSlot {
  readonly mesh: Mesh;
  readonly material: ShaderMaterial;
  /** the live handle using this slot, if any */
  owner: Tell | null = null;
  /** an enemy attack is coming (red), not a spawn, status or friendly marker */
  harmful = false;
  shape: 0 | 1 = 0;
  private readonly sizeUniform = new Vector2();
  private readonly colorUniform = new Color3();

  constructor(scene: Scene) {
    this.mesh = MeshBuilder.CreateGround('mode-tell', { width: 1, height: 1 }, scene);
    this.mesh.isPickable = false;
    // Slots are moved and rescaled to wherever the next warning lands. Frustum culling against a
    // stale bounding box hid warnings at some spots and not others, so always draw them; there are
    // only ever a few dozen.
    this.mesh.alwaysSelectAsActiveMesh = true;
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

  setColor(color: TellColor, alpha: number): void {
    this.color = color; this.alpha = alpha;
    this.harmful = color === TELL.area || color === TELL.charge;
    this.material.setColor3('color', this.colorUniform.set(color[0], color[1], color[2]));
    this.material.setFloat('alpha', alpha);
  }

  setShape(shape: 0 | 1, width: number, length: number): void {
    this.shape = shape;
    this.material.setFloat('shape', shape);
    this.material.setVector2('size', this.sizeUniform.set(width, length));
    this.mesh.scaling.set(width, 1, length);
  }

  /** @internal last colour and alpha, for co-op snapshots */
  color: TellColor = TELL.area;
  alpha = 1;

  sync(fill: number, time: number): void {
    this.material.setFloat('fill', Math.max(0, Math.min(1, fill)));
    this.material.setFloat('time', time);
  }
}

/**
 * One lease of a ground warning. Each lease is a fresh handle over a pooled slot, so a handle kept
 * after release can't touch (or hide) whatever warning reuses that slot next: once released, every
 * call on it does nothing.
 */
export class Tell {
  fill = 0;
  private slot: TellSlot | null;

  /** null: a handle that is never live (SilentTelegraph) */
  constructor(slot: TellSlot | null) { this.slot = slot; }

  get live(): boolean { return this.slot?.owner === this; }

  setColor(color: TellColor, alpha = 1): void { if (this.live) this.slot!.setColor(color, alpha); }

  setShape(shape: 0 | 1, width: number, length: number): void { if (this.live) this.slot!.setShape(shape, width, length); }

  /** @internal the slot's mesh while this handle owns it */
  get mesh(): Mesh | null { return this.live ? this.slot!.mesh : null; }

  /** @internal give the slot back; later calls on this handle are ignored */
  detach(): TellSlot | null {
    if (!this.live) return null;
    const slot = this.slot!;
    slot.owner = null;
    this.slot = null;
    return slot;
  }
}

/** Ground height for tells: the top of any snow, so drifts never bury a warning. */
export function groundHeight(snow?: { depth(x: number, z: number): number }): (x: number, z: number) => number {
  return snow ? (x, z) => Math.max(0, snow.depth(x, z)) : () => 0;
}

export class TelegraphLayer {
  private readonly pool: TellSlot[] = [];
  /** blast rings: fully lit circles that fade out on their own */
  private readonly blasts: { tell: Tell; color: TellColor; age: number; life: number }[] = [];
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
    const mesh = tell.mesh;
    if (!mesh) return;
    mesh.rotation.y = 0;
    mesh.position.set(x, this.heightAt(x, z) + .05, z);
  }

  /** A lane from (x, z) along `yaw` (atan2(dx, dz)) for `length` metres, `width` across. */
  lane(x: number, z: number, yaw: number, length: number, width: number, color: TellColor, alpha = 1): Tell {
    const tell = this.lease(color, alpha);
    tell.setShape(1, width, length);
    this.moveLane(tell, x, z, yaw, length);
    return tell;
  }

  /** Re-aim a lane from `lane()` (same length). */
  moveLane(tell: Tell, x: number, z: number, yaw: number, length: number): void {
    const mesh = tell.mesh;
    if (!mesh) return;
    const cx = x + Math.sin(yaw) * length / 2, cz = z + Math.cos(yaw) * length / 2;
    mesh.rotation.y = yaw;
    mesh.position.set(cx, this.heightAt(cx, cz) + .05, cz);
  }

  /** A hard-edged lit circle where an area hit lands, fading over `life` seconds. */
  blast(x: number, z: number, radius: number, color: TellColor = TELL.area, life = .35): void {
    const tell = this.circle(x, z, radius, color);
    tell.fill = 1;
    this.blasts.push({ tell, color, age: 0, life });
  }

  /** Hide the warning and free its slot. Safe to call twice, or on a stale handle. */
  release(tell: Tell): void {
    tell.detach()?.mesh.setEnabled(false);
  }

  update(dt: number): void {
    this.time += dt;
    for (let i = this.blasts.length - 1; i >= 0; i--) {
      const b = this.blasts[i];
      b.age += dt;
      if (b.age >= b.life) { this.release(b.tell); this.blasts.splice(i, 1); continue; }
      b.tell.setColor(b.color, 1.6 * (1 - b.age / b.life) ** 2);
    }
    for (const slot of this.pool) if (slot.owner) slot.sync(slot.owner.fill, this.time);
  }

  /**
   * Whether (x, z) lies inside a live enemy-attack warning, grown by `margin` metres, that has
   * filled to at least `minFill` (1 = landing now). Allies use it to step out of incoming hits; the
   * player reads the same warnings on screen.
   */
  dangerAt(x: number, z: number, margin = 0, minFill = 0): boolean {
    for (const slot of this.pool) {
      if (!slot.owner || !slot.harmful || slot.owner.fill < minFill) continue;
      const { position: c, scaling: size, rotation } = slot.mesh;
      const dx = x - c.x, dz = z - c.z;
      if (slot.shape === 0) {
        if (Math.hypot(dx, dz) <= size.x / 2 + margin) return true;
        continue;
      }
      // Lane: local axes from its yaw (length along +Z when yaw is 0).
      const sin = Math.sin(rotation.y), cos = Math.cos(rotation.y);
      const along = dx * sin + dz * cos, across = dx * cos - dz * sin;
      if (Math.abs(along) <= size.z / 2 + margin && Math.abs(across) <= size.x / 2 + margin) return true;
    }
    return false;
  }

  /** Every live warning, for a co-op snapshot. */
  snapshot(): TellState[] {
    const out: TellState[] = [];
    for (const slot of this.pool) {
      if (!slot.owner) continue;
      const m = slot.mesh, r = (v: number) => Math.round(v * 100) / 100;
      out.push({ s: slot.shape as 0 | 1, x: r(m.position.x), z: r(m.position.z), yaw: r(m.rotation.y), w: r(m.scaling.x), l: r(m.scaling.z),
        c: slot.color, a: r(slot.alpha), f: r(slot.owner.fill) });
    }
    return out;
  }

  /** Co-op guest: show exactly the host's warnings (replaces whatever this layer mirrored last time). */
  mirror(states: readonly TellState[]): void {
    while (this.mirrored.length > states.length) this.release(this.mirrored.pop()!);
    states.forEach((state, i) => {
      const tell = this.mirrored[i] ??= this.lease(state.c, state.a);
      tell.setColor(state.c, state.a);
      tell.setShape(state.s, state.w, state.l);
      tell.fill = state.f;
      const mesh = tell.mesh;
      if (mesh) { mesh.rotation.y = state.yaw; mesh.position.set(state.x, this.heightAt(state.x, state.z) + .05, state.z); }
    });
  }
  private readonly mirrored: Tell[] = [];

  dispose(): void {
    this.blasts.length = 0;
    for (const slot of this.pool) { slot.owner?.detach(); slot.material.dispose(); slot.mesh.dispose(); }
    this.pool.length = 0;
  }

  private lease(color: TellColor, alpha: number): Tell {
    let slot = this.pool.find((s) => !s.owner);
    if (!slot) { slot = new TellSlot(this.scene); this.pool.push(slot); }
    const tell = new Tell(slot);
    slot.owner = tell;
    slot.setColor(color, alpha);
    slot.sync(0, this.time);
    slot.mesh.setEnabled(true);
    return tell;
  }
}

/** Warnings that never show: a co-op guest replays the host's missiles with this, because the
 * host's own warnings already arrive through TelegraphLayer.mirror. */
export class SilentTelegraph extends TelegraphLayer {
  override circle(): Tell { return new Tell(null); }
  override lane(): Tell { return new Tell(null); }
  override blast(): void {}
}
