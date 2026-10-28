// Snow White's Burst, Seven Dwarves (Survivors' burstSnowWhite / CharacterVfxSystem.snowWhiteBurst):
// a 90° cone of cold fire out to 1500 px dealing ten times her base damage. Over 0.82 s the cone
// grows out in the first 16%, holds, then fades.
//
// 3D: four nested fans of animated flame (a noise shader scrolling outward), nine flame lances,
// a ring of flame tongues at the muzzle, a bright edge arc riding the front, a frost mark left on
// the ground, shake and light. Targets light up as the front reaches them. The cone stays on the
// gun tip while she moves (the player holds the aim along it); hits resolve from where she fired.

import { Color3, Constants, Effect, Mesh, ShaderMaterial, Vector3, VertexBuffer, VertexData, type Scene } from '@babylonjs/core';
import { SFX } from '../../audio/sound-bank';
import { PX, type KitContext } from '../kit';
import type { FxQuad } from '../vfx';
import { SNOW } from './palette';
import { snowShieldsTarget } from '../projectile-collision';

const RANGE = 1500 * PX;
const HALF = Math.PI / 4;
const LIFE = .82;
const GROW = .16; // share of LIFE
const DAMAGE_MULTIPLIER = 10;
/** Focused Fire: a full 2.5 s hold deals up to 4× damage. */
const FOCUS_DAMAGE = 3;
/** Fully Active: burn for this share of the Burst's damage per second, for BURN_TIME seconds. */
const BURN_SHARE = .3, BURN_TIME = 3;
/** Shatter: double damage to marked or burning enemies. */
const SHATTER = 2;
/** Shock Blast stun by enemy tier: everything short of a boss stays stunned for good. */
const STUN = { horde: Infinity, specialist: Infinity, heavy: Infinity, boss: 5 } as const;
const SNOW_RAYS = 65;

Effect.ShadersStore.coldFireVertexShader = `
precision highp float;
attribute vec3 position;
attribute vec2 uv;
uniform mat4 worldViewProjection;
varying vec2 vUV;
void main() { vUV = uv; gl_Position = worldViewProjection * vec4(position, 1.0); }`;

// vUV.x: 0 at the muzzle, 1 at full range. vUV.y: -1..1 across the cone.
Effect.ShadersStore.coldFireFragmentShader = `
precision highp float;
varying vec2 vUV;
uniform float time, reach, alpha, seed;
uniform vec3 inner, outer;
uniform float snowStop[${SNOW_RAYS}], angleScale, rangeScale;
float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7)) + seed) * 43758.5453); }
float n(vec2 p) { vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
  return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
float fbm(vec2 p) { return n(p)*.5 + n(p*2.03+3.1)*.27 + n(p*4.1+7.7)*.15 + n(p*8.3)*.08; }
void main() {
  float r = vUV.x, a = vUV.y;
  float snowIndex = clamp((a * angleScale * .5 + .5) * ${SNOW_RAYS - 1}.0, 0.0, ${SNOW_RAYS - 1}.0);
  int snowLow = int(floor(snowIndex));
  int snowHigh = int(min(floor(snowIndex) + 1.0, ${SNOW_RAYS - 1}.0));
  if (r * rangeScale > mix(snowStop[snowLow], snowStop[snowHigh], fract(snowIndex))) discard;
  // tongues stream outward: noise stretched along the radius, scrolling with time
  float flow = fbm(vec2(r * 5.0 - time * 9.0, a * 3.2 + r * 1.5));
  float streaks = fbm(vec2(r * 2.2 - time * 5.0, a * 9.0));
  float across = 1.0 - smoothstep(.55, 1.0, abs(a) + (flow - .5) * .35);
  float front = 1.0 - smoothstep(reach - .14, reach, r + (flow - .5) * .08);
  float base = smoothstep(.0, .05, r);
  float fadeOut = 1.0 - smoothstep(.75, 1.0, r) * .55;
  float body = across * front * base * fadeOut;
  float fire = body * (.42 + .9 * flow * (.65 + .55 * streaks));
  float hot = smoothstep(.55, 1.05, fire);
  vec3 col = mix(outer, inner, hot) * fire;
  gl_FragColor = vec4(col * 1.35, alpha);
}`;

/** Build the fans (four layers and a frost mark) and compile their shader while loading;
 * compiled on first use, the cone appeared a few frames into the first Burst. */
export async function prepareSevenDwarves(scene: Scene): Promise<void> {
  const fans = Array.from({ length: 5 }, (_, i) => fanMesh(scene, HALF, RANGE, i));
  await fans[0].material!.forceCompilationAsync(fans[0]);
  for (const fan of fans) disposeFan(fan);
}

export function sevenDwarves(ctx: KitContext, origin: Vector3, yaw: number, baseDamage: number, charge = 0): void {
  const { vfx, scene, targets, run, camera } = ctx;
  // Player passes its live position; damage and knockback retain the original cast origin.
  origin = origin.clone();
  const dir = new Vector3(Math.sin(yaw), 0, Math.cos(yaw));
  const side = new Vector3(dir.z, 0, -dir.x);
  const muzzle = ctx.muzzle(new Vector3());
  const castMuzzle = muzzle.clone();
  charge = Math.max(0, Math.min(1, charge));
  const half = HALF + (Math.PI / 24 - HALF) * charge;
  const damage = baseDamage * DAMAGE_MULTIPLIER * (1 + charge * FOCUS_DAMAGE);
  run.beginBurst();
  const snowStops = Array<number>(SNOW_RAYS).fill(1);
  const snowTip = new Vector3();
  const stopAt = (offset: number) => {
    const index = Math.max(0, Math.min(SNOW_RAYS - 1, (offset / half * .5 + .5) * (SNOW_RAYS - 1)));
    const low = Math.floor(index), high = Math.min(SNOW_RAYS - 1, low + 1);
    return (snowStops[low] + (snowStops[high] - snowStops[low]) * (index - low)) * RANGE;
  };

  // the targets it will catch, struck as the front passes them
  targets.areaHit((px, pz, r) => {
    const dx = px - origin.x, dz = pz - origin.z, d = Math.hypot(dx, dz);
    const off = Math.abs(Math.atan2(Math.sin(Math.atan2(dx, dz) - yaw), Math.cos(Math.atan2(dx, dz) - yaw)));
    return d <= RANGE + r && off <= half + Math.atan2(r, Math.max(d, .01));
  });
  const pending = targets.inCone(origin, yaw, half, RANGE)
    .map((target) => ({ target, generation: target.generation, at: Math.hypot(target.position.x - origin.x, target.position.z - origin.z) / RANGE }));

  // Nested color layers share one muzzle origin and plane. A second cone on the floor
  // cannot overlap this one in perspective, even if both follow the character perfectly.
  const fans = [
    { half, length: 1, inner: SNOW.cyan, outer: SNOW.bloom, strength: .55 },
    { half: half * .8, length: .96, inner: SNOW.core, outer: SNOW.outer, strength: .7 },
    { half: half * .55, length: .91, inner: SNOW.core, outer: SNOW.cyan, strength: .8 },
    { half: half * .28, length: .84, inner: SNOW.core, outer: SNOW.core, strength: .65 },
  ].map((f, i) => ({ ...f, mesh: fanMesh(scene, f.half, RANGE * f.length, i) }));
  for (const f of fans) {
    f.mesh.position.copyFrom(muzzle);
    f.mesh.rotation.y = yaw;
    const m = f.mesh.material as ShaderMaterial;
    m.setFloat('angleScale', f.half / half);
    m.setFloat('rangeScale', f.length);
    m.setColor3('inner', colour(f.inner));
    m.setColor3('outer', colour(f.outer));
  }
  // nine flame lances tearing through the cone
  const lances: { q: FxQuad; glow: FxQuad; offset: number; phase: number }[] = [];
  for (let i = -4; i <= 4; i++) {
    lances.push({ q: vfx.quad('lance', SNOW.core, .8), glow: vfx.quad('lance', SNOW.bloom, .25), offset: (i / 5) * half * .78, phase: i * 4.1 });
  }
  // flame tongues around the muzzle, spinning
  const tongues = Array.from({ length: 8 }, (_, i) => ({ q: vfx.quad('tongue', SNOW.cyan, .9), base: i * Math.PI / 4, length: .55 + (i % 3) * .18 }));
  const arc = Array.from({ length: 13 }, () => vfx.quad('glow', SNOW.cyan, .7));
  const core = vfx.quad('glow', SNOW.core, 1);
  const bloom = vfx.quad('glow', SNOW.bloom, .5);
  vfx.glowing(core);

  vfx.flash(muzzle, SNOW.cyan, 3, 10, .6, true);
  vfx.flashSprite(muzzle, SNOW.core, 2.6, .18, 1, 'star', true);
  camera.shake(.22, .17);
  ctx.sound(SFX.snowWhiteBurst, origin);

  const head = new Vector3(), tail = new Vector3(), p = new Vector3();
  vfx.add({
    update: (_dt, age) => {
      const t = age / LIFE;
      ctx.muzzle(muzzle);
      // The cone moves with the gun; clip every radial direction at the current
      // hill surface so it cannot reappear on the far side of a mound.
      if (ctx.snow?.enabled || ctx.targets.navigation.obstacles.length) {
        for (let i = 0; i < SNOW_RAYS; i++) {
          const angle = yaw + (i / (SNOW_RAYS - 1) * 2 - 1) * half;
          snowTip.set(muzzle.x + Math.sin(angle) * RANGE, muzzle.y, muzzle.z + Math.cos(angle) * RANGE);
          snowStops[i] = ctx.targets.navigation.traceCover(muzzle, snowTip) ?? 1;
        }
      } else snowStops.fill(1);
      if (t >= 1) {
        // Ground residue begins only after the active cone is gone, at its final footprint.
        const ground = new Vector3(muzzle.x, 0, muzzle.z);
        frostMark(ctx, ground, yaw, half, snowStops);
        // World-space embers belong to the finished blast, not a second cone at the cast point.
        for (let k = 0; k < 6; k++) {
          const a = (Math.random() * 2 - 1) * half * .9, r = stopAt(a) * (.25 + Math.random() * .7);
          if (r < .05) continue;
          const at = ground.add(dir.scale(Math.cos(a) * r)).addInPlace(side.scale(Math.sin(a) * r));
          vfx.sparks(at.addInPlaceFromFloats(0, .6, 0), 10, SNOW.outer, SNOW.cyan, 4, null, 1, .9);
        }
        return false;
      }
      for (const f of fans) f.mesh.position.copyFrom(muzzle);
      const growth = Math.min(1, t / GROW);
      const reach = 1 - (1 - growth) ** 3;
      const alpha = t < .08 ? t / .08 : t < .52 ? 1 : (1 - t) / .48;
      for (const f of fans) {
        const m = f.mesh.material as ShaderMaterial;
        m.setFloats('snowStop', snowStops);
        m.setFloat('time', age);
        m.setFloat('reach', reach / f.length);
        m.setFloat('alpha', alpha * f.strength);
      }
      const length = RANGE * reach;
      lances.forEach((l) => {
        const wave = .82 + Math.sin(l.phase + t * 38) * .12;
        const d = dir.scale(Math.cos(l.offset)).addInPlace(side.scale(Math.sin(l.offset)));
        tail.copyFrom(muzzle);
        head.copyFrom(muzzle).addInPlace(d.scale(Math.min(length * wave, stopAt(l.offset))));
        vfx.streak(l.q, tail, head, .22);
        vfx.tint(l.q, Math.abs(l.offset) < .2 ? SNOW.core : SNOW.cyan, .75 * alpha);
        vfx.streak(l.glow, tail, head, .9);
        vfx.tint(l.glow, SNOW.bloom, .18 * alpha);
      });
      tongues.forEach((tg, i) => {
        const a = tg.base + t * (i % 2 ? -4 : 5);
        const d = new Vector3(Math.sin(a), Math.cos(a) * .55, Math.cos(a) * .3);
        const out = dir.scale(d.z).addInPlace(side.scale(d.x)).addInPlace(new Vector3(0, d.y, 0)).normalize();
        vfx.streak(tg.q, muzzle.add(out.scale(.15)), muzzle.add(out.scale(.15 + tg.length * (1 + .3 * Math.sin(age * 30 + i)))), .3);
        vfx.tint(tg.q, i % 2 ? SNOW.core : SNOW.cyan, .9 * alpha);
      });
      // the bright arc at the front of the cone
      arc.forEach((q, i) => {
        const a = ((i / (arc.length - 1)) * 2 - 1) * half;
        const clipped = Math.min(length, stopAt(a));
        p.copyFrom(muzzle).addInPlace(dir.scale(Math.cos(a) * clipped)).addInPlace(side.scale(Math.sin(a) * clipped));
        vfx.sprite(q, p, 2.4 + Math.sin(age * 20 + i) * .3);
        vfx.tint(q, i % 2 ? SNOW.cyan : SNOW.core, .55 * alpha * Math.min(1, growth * 1.3));
      });
      vfx.sprite(core, muzzle, 1.1 + .4 * Math.sin(age * 40));
      vfx.tint(core, SNOW.core, alpha);
      vfx.sprite(bloom, muzzle, 3.2);
      vfx.tint(bloom, SNOW.bloom, .45 * alpha);

      for (let i = pending.length - 1; i >= 0; i--) {
        const { target, at, generation } = pending[i];
        if (at > reach) continue;
        pending.splice(i, 1);
        if (!target.alive || target.generation !== generation) continue;
        if (snowShieldsTarget(ctx, castMuzzle, target, castMuzzle.y - target.position.y)) continue;
        const push = target.position.subtract(origin);
        push.y = 0;
        const shattered = run.talents.has('shatter') && (target.marked || run.isBurning(target));
        run.damage(target, damage * (shattered ? SHATTER : 1), 'burst', push.normalize().scale(4));
        if (target.alive && run.talents.has('burst_stun')) target.stunned = Math.max(target.stunned, STUN[target.combatTier]);
        if (run.talents.has('burst_burn')) run.burn(target, 'burst-burn', damage * BURN_SHARE, BURN_TIME);
        const hit = target.position.add(new Vector3(0, .8, 0));
        vfx.flashSprite(hit, SNOW.core, 1.4, .14, 1, 'star');
        vfx.flashSprite(hit, SNOW.cyan, 2.6, .3, .7);
        vfx.sparks(hit, 16, SNOW.cyan, SNOW.core, 9, dir, .8, 1.1);
      }
      return true;
    },
    dispose: () => {
      for (const f of fans) disposeFan(f.mesh);
      for (const l of lances) { vfx.release(l.q); vfx.release(l.glow); }
      for (const tg of tongues) vfx.release(tg.q);
      for (const q of arc) vfx.release(q);
      vfx.release(core);
      vfx.release(bloom);
    },
  });
}

/** Only the finished blast leaves a faint ground glow; it never overlaps the active cone. */
function frostMark(ctx: KitContext, origin: Vector3, yaw: number, half: number, stops: number[]): void {
  const mesh = fanMesh(ctx.scene, half, RANGE, 11);
  mesh.position.set(origin.x, .04, origin.z);
  mesh.rotation.y = yaw;
  const m = mesh.material as ShaderMaterial;
  m.setFloats('snowStop', stops);
  m.setColor3('inner', colour(SNOW.cyan));
  m.setColor3('outer', colour(SNOW.shadow));
  m.setFloat('reach', 1);
  m.setFloat('alpha', .2);
  ctx.vfx.add({
    update: (_dt, age) => {
      const t = age / 1.1;
      if (t >= 1) return false;
      m.setFloat('time', 3 + age * .15);
      m.setFloat('alpha', .2 * (1 - t));
      return true;
    },
    dispose: () => disposeFan(mesh),
  });
}

const FAN_RINGS = 24, FAN_SPOKES = 28;
/** Finished fans, per scene: a Burst reshapes these rather than creating meshes and materials. */
const spareFans = new WeakMap<Scene, Mesh[]>();

/** A flat fan (pie slice) of `half` angle and `length`, with uv = (radius 0..1, across -1..1). */
function fanMesh(scene: Scene, half: number, length: number, seed: number): Mesh {
  let spares = spareFans.get(scene);
  if (!spares) spareFans.set(scene, spares = []);
  const mesh = spares.pop() ?? createFan(scene);
  const positions = mesh.getVerticesData(VertexBuffer.PositionKind)!;
  for (let r = 0, k = 0; r <= FAN_RINGS; r++) {
    const u = r / FAN_RINGS;
    for (let s = 0; s <= FAN_SPOKES; s++, k += 3) {
      const a = ((s / FAN_SPOKES) * 2 - 1) * half;
      positions[k] = Math.sin(a) * u * length;
      positions[k + 2] = Math.cos(a) * u * length;
    }
  }
  mesh.updateVerticesData(VertexBuffer.PositionKind, positions, true);
  const material = mesh.material as ShaderMaterial;
  material.setFloat('seed', seed * 1.618);
  material.setFloats('snowStop', Array<number>(SNOW_RAYS).fill(1));
  material.setFloat('angleScale', 1);
  material.setFloat('rangeScale', 1);
  material.setFloat('time', 0);
  material.setFloat('reach', 0);
  material.setFloat('alpha', 0);
  material.setColor3('inner', colour(SNOW.core));
  material.setColor3('outer', colour(SNOW.outer));
  mesh.position.setAll(0);
  mesh.rotation.setAll(0);
  mesh.setEnabled(true);
  return mesh;
}

function createFan(scene: Scene): Mesh {
  const positions: number[] = [], uvs: number[] = [], indices: number[] = [];
  for (let r = 0; r <= FAN_RINGS; r++) {
    for (let s = 0; s <= FAN_SPOKES; s++) {
      positions.push(0, 0, 0);
      uvs.push(r / FAN_RINGS, (s / FAN_SPOKES) * 2 - 1);
    }
  }
  for (let r = 0; r < FAN_RINGS; r++) for (let s = 0; s < FAN_SPOKES; s++) {
    const i = r * (FAN_SPOKES + 1) + s;
    indices.push(i, i + FAN_SPOKES + 1, i + 1, i + 1, i + FAN_SPOKES + 1, i + FAN_SPOKES + 2);
  }
  const mesh = new Mesh('cold-fire-fan', scene);
  const data = new VertexData();
  data.positions = positions;
  data.uvs = uvs;
  data.indices = indices;
  data.applyToMesh(mesh, true);
  mesh.isPickable = false;
  const material = new ShaderMaterial('cold-fire', scene, 'coldFire', {
    attributes: ['position', 'uv'],
    uniforms: ['worldViewProjection', 'time', 'reach', 'alpha', 'seed', 'inner', 'outer', 'snowStop', 'angleScale', 'rangeScale'],
    needAlphaBlending: true,
  });
  material.alphaMode = Constants.ALPHA_ADD;
  material.backFaceCulling = false;
  material.disableDepthWrite = true;
  mesh.material = material;
  return mesh;
}

function disposeFan(mesh: Mesh): void {
  mesh.setEnabled(false);
  spareFans.get(mesh.getScene())!.push(mesh);
}

function colour(c: readonly [number, number, number]): Color3 {
  return new Color3(c[0], c[1], c[2]);
}
