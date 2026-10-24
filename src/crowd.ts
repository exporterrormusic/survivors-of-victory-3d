// Baked-animation crowds. Each lane-minion model is sampled once at load into bone-matrix
// textures; every unit of that model then renders through one thin-instanced draw per mesh
// part. Units own no meshes, skeletons or animation groups, so spawning is free and the CPU
// cost per unit is one matrix write instead of ~90 animated bones.

import {
  AbstractMesh,
  AnimationGroup,
  BakedVertexAnimationManager,
  Constants,
  Matrix,
  Mesh,
  Node,
  Quaternion,
  RawTexture,
  Scene,
  ShadowGenerator,
  Texture,
  TransformNode,
  Vector3,
} from '@babylonjs/core';
import type { MuzzleRef } from './chibi';
import { instantiateModel } from './model-library';

const SAMPLE_RATE = 30;
const CLIPS = ['idle', 'walk', 'run', 'aim_idle', 'shot', 'death', 'stun'];
const ONE_SHOT = new Set(['shot', 'death']);

export interface CrowdClip {
  readonly name: string;
  /** first row of this clip in every part's bone texture */
  readonly start: number;
  readonly frames: number;
  readonly duration: number;
  readonly loop: boolean;
  /** model-space facing correction (see Chibi.yawFor) */
  readonly yaw: number;
  /** per muzzle: model-space xyz for each sampled frame */
  readonly muzzles: Float32Array[];
}

export interface CrowdOptions {
  /** facing yaw per clip, radians; Raptures need none. Receives the model's own clip name. */
  yaw?: (clip: string) => number;
  /** gun tips per clip, as joint + local offset. Receives the model's own clip name. */
  muzzles: (clip: string, nodes: Map<string, TransformNode>) => MuzzleRef[];
  /** model clips to bake under a game clip name the model lacks (Nayuta: idle → idle_eff) */
  aliases?: Readonly<Record<string, readonly string[]>>;
}

/** Per-unit colour multiplier (1 = unchanged, above 1 glows): summoned clones, charmed minions. */
export type UnitTint = readonly [number, number, number];

/** What a unit needs from whatever draws it: a baked crowd or a static prop. */
export interface UnitModel {
  has(clip: string): boolean;
  clip(name: string): CrowdClip;
  /** sampled frame index within `clip` at `time` seconds */
  frameAt(clip: CrowdClip, time: number): number;
  begin(): void;
  /** Queue one unit. `world` is the model's transform (gameplay root plus lift and clip facing). */
  add(world: Matrix, clip: CrowdClip, frame: number, flash: number, tint?: UnitTint | null): void;
  end(): void;
  /** World position of muzzle `index` (wrapped) for a unit drawn with `world`. */
  muzzle(clip: CrowdClip, frame: number, index: number, world: Matrix, out: Vector3): Vector3;
}

/** One mesh drawn as many thin instances, with growable per-instance buffers. */
export class ThinBatch {
  count = 0;
  private capacity = 0;
  private readonly data = new Map<string, Float32Array>();

  constructor(readonly mesh: Mesh, private readonly strides: Record<string, number> = {}) {
    mesh.isPickable = false;
    mesh.alwaysSelectAsActiveMesh = true; // callers cull per instance
    mesh.doNotSyncBoundingInfo = true;
    this.grow(64);
    // Never drop to zero thin instances: Babylon would then prepare the material as a plain
    // mesh (no instance color) and keep that choice. An empty batch is disabled instead.
    mesh.thinInstanceCount = 1;
    mesh.setEnabled(false);
  }

  /** Start of instance i's slice in buffer `kind`, growing buffers as needed. */
  slot(kind: string, i: number): Float32Array {
    if (i >= this.capacity) this.grow(Math.max(i + 1, this.capacity * 2));
    return this.data.get(kind)!;
  }

  commit(): void {
    const visible = this.count > 0;
    if (this.mesh.isEnabled() !== visible) this.mesh.setEnabled(visible);
    if (!visible) return;
    this.mesh.thinInstanceCount = this.count;
    for (const kind of this.data.keys()) this.mesh.thinInstanceBufferUpdated(kind);
  }

  private grow(capacity: number): void {
    for (const [kind, stride] of Object.entries({ matrix: 16, ...this.strides })) {
      const next = new Float32Array(capacity * stride);
      const previous = this.data.get(kind);
      if (previous) next.set(previous);
      this.data.set(kind, next);
      this.mesh.thinInstanceSetBuffer(kind, next, stride, false);
    }
    // Setting the matrix buffer resets the count to the full capacity.
    this.mesh.thinInstanceCount = Math.max(1, this.count);
    this.capacity = capacity;
  }
}

interface Part {
  batch: ThinBatch;
  /** inverse of the part's rest world matrix; it stays on the mesh so culling sees its handedness */
  correction: Matrix;
}

const NO_TINT: UnitTint = [1, 1, 1];
const instanceWorld = new Matrix();
const partWorld = new Matrix();
const rotation = new Quaternion();
const scaling = new Vector3();
const translation = new Vector3();

export class CrowdModel implements UnitModel {
  readonly clips = new Map<string, CrowdClip>();
  private readonly parts: Part[] = [];

  constructor(scene: Scene, url: string, shadows: ShadowGenerator, options: CrowdOptions) {
    const instance = instantiateModel(scene, url);
    const rig = new TransformNode('crowd-rig', scene);
    for (const node of instance.rootNodes) node.parent = rig;
    const nodes = new Map<string, TransformNode>();
    for (const node of rig.getDescendants(false)) {
      if (node instanceof TransformNode && !(node instanceof AbstractMesh) && !nodes.has(node.name)) nodes.set(node.name, node);
    }
    const meshes = rig.getChildMeshes(false).filter((mesh): mesh is Mesh =>
      mesh instanceof Mesh && !!mesh.skeleton && mesh.getTotalVertices() > 0 && mesh.metadata?.gltf?.extras?.disabled !== true);
    const groups = new Map(instance.animationGroups.map((group) => [group.name, group]));
    for (const group of groups.values()) group.stop();

    // game clip name -> the model's clip baked for it
    const sources = new Map<string, string>();
    for (const name of CLIPS) {
      const source = [name, ...(options.aliases?.[name] ?? [])].find((candidate) => groups.has(candidate));
      if (source) sources.set(name, source);
    }
    const names = [...sources.keys()];
    const sampled = names.map((name) => sampleTimes(groups.get(sources.get(name)!)!, ONE_SHOT.has(name)));
    const rows = sampled.reduce((sum, clip) => sum + clip.times.length, 0);
    const bakes = meshes.map((mesh) => ({ mesh, width: (mesh.skeleton!.bones.length + 1) * 16, data: null as Float32Array | null }));
    for (const bake of bakes) bake.data = new Float32Array(bake.width * rows);

    // Only ancestors of the skinned meshes and gun tips influence what is baked.
    const muzzleRefs = names.map((name) => options.muzzles(sources.get(name)!, nodes));
    const chain = ancestors([...meshes, ...muzzleRefs.flat().map((ref) => nodes.get(ref.joint)).filter((n): n is TransformNode => !!n)], rig);
    const bone = new Matrix();
    const baked = new Matrix();
    const point = new Vector3();
    let row = 0;
    names.forEach((name, c) => {
      const group = groups.get(sources.get(name)!)!;
      const { times, duration } = sampled[c];
      const refs = muzzleRefs[c];
      const muzzles = refs.map(() => new Float32Array(times.length * 3));
      group.start(false, 1, group.from, group.to);
      group.pause();
      times.forEach((frame, f) => {
        group.goToFrame(frame);
        for (const node of chain) node.computeWorldMatrix(true);
        for (const bake of bakes) {
          // Fold the mesh's own (possibly animated) model-space transform into each bone,
          // so an instance needs only the unit's transform.
          const skeleton = bake.mesh.skeleton!;
          skeleton.prepare(true);
          const matrices = skeleton.getTransformMatrices(bake.mesh);
          const meshWorld = bake.mesh.getWorldMatrix();
          for (let b = 0; b < bake.width; b += 16) {
            Matrix.FromArrayToRef(matrices, b, bone);
            bone.multiplyToRef(meshWorld, baked);
            baked.copyToArray(bake.data!, (row + f) * bake.width + b);
          }
        }
        refs.forEach((ref, m) => {
          const joint = nodes.get(ref.joint);
          if (joint) Vector3.TransformCoordinatesFromFloatsToRef(ref.offset[0], ref.offset[1], ref.offset[2], joint.getWorldMatrix(), point);
          else point.set(0, 1.2, 0.4);
          point.toArray(muzzles[m], f * 3);
        });
      });
      group.stop();
      this.clips.set(name, { name, start: row, frames: times.length, duration, loop: !ONE_SHOT.has(name), yaw: options.yaw?.(sources.get(name)!) ?? 0, muzzles });
      row += times.length;
    });

    for (const bake of bakes) {
      const mesh = bake.mesh;
      const rest = mesh.computeWorldMatrix(true).clone();
      mesh.parent = null;
      rest.decompose(scaling, rotation, translation);
      mesh.position.copyFrom(translation);
      mesh.rotationQuaternion = rotation.clone();
      mesh.scaling.copyFrom(scaling);
      const manager = new BakedVertexAnimationManager(scene);
      manager.texture = RawTexture.CreateRGBATexture(bake.data, bake.width / 4, rows, scene, false, false,
        Texture.NEAREST_NEAREST, Constants.TEXTURETYPE_FLOAT);
      mesh.bakedVertexAnimationManager = manager;
      mesh.receiveShadows = true;
      const batch = new ThinBatch(mesh, { bakedVertexAnimationSettingsInstanced: 4, color: 4 });
      shadows.addShadowCaster(mesh, false);
      this.parts.push({ batch, correction: Matrix.Invert(rest) });
    }
    // The rig's joints are only needed for baking. Unlinked bones stay clean, so Babylon
    // skips per-frame skeleton updates for the meshes (which keep it only for skin weights).
    for (const bake of bakes) for (const bone of bake.mesh.skeleton!.bones) bone.linkTransformNode(null);
    for (const group of instance.animationGroups) group.dispose();
    rig.setEnabled(false);
  }

  has(clip: string): boolean {
    return this.clips.has(clip);
  }

  clip(name: string): CrowdClip {
    const clip = this.clips.get(name);
    if (!clip) throw new Error(`Crowd model has no clip "${name}"`);
    return clip;
  }

  frameAt(clip: CrowdClip, time: number): number {
    if (clip.loop) {
      const t = ((time % clip.duration) + clip.duration) % clip.duration;
      return Math.min(clip.frames - 1, Math.floor((t / clip.duration) * clip.frames));
    }
    return Math.min(clip.frames - 1, Math.max(0, Math.floor(time * SAMPLE_RATE)));
  }

  begin(): void {
    for (const part of this.parts) part.batch.count = 0;
  }

  add(world: Matrix, clip: CrowdClip, frame: number, flash: number, tint?: UnitTint | null): void {
    const [r, g, b] = tint ?? NO_TINT;
    for (const part of this.parts) {
      const batch = part.batch;
      const i = batch.count++;
      // Thin instances apply before the mesh's own world matrix: (world × rest⁻¹) × rest = world.
      world.multiplyToRef(part.correction, partWorld);
      partWorld.copyToArray(batch.slot('matrix', i), i * 16);
      const settings = batch.slot('bakedVertexAnimationSettingsInstanced', i);
      settings[i * 4] = settings[i * 4 + 1] = clip.start + frame;
      settings[i * 4 + 2] = settings[i * 4 + 3] = 0;
      const color = batch.slot('color', i);
      color[i * 4] = r * (1 + 1.2 * flash);
      color[i * 4 + 1] = g * (1 + 0.95 * flash);
      color[i * 4 + 2] = b * (1 + 0.7 * flash);
      color[i * 4 + 3] = 1;
    }
  }

  end(): void {
    for (const part of this.parts) part.batch.commit();
  }

  muzzle(clip: CrowdClip, frame: number, index: number, world: Matrix, out: Vector3): Vector3 {
    const track = clip.muzzles[index % Math.max(1, clip.muzzles.length)];
    if (!track) return Vector3.TransformCoordinatesFromFloatsToRef(0, 1.2, 0.4, world, out);
    return Vector3.TransformCoordinatesFromFloatsToRef(track[frame * 3], track[frame * 3 + 1], track[frame * 3 + 2], world, out);
  }
}

/** An unanimated model (a deployed turret) drawn like a crowd: every clip is its one pose. */
export class PropModel implements UnitModel {
  private readonly batch: ThinBatch;
  private readonly pose: CrowdClip;

  /** `mesh` has an identity transform; `muzzle` is the gun tip in its space. */
  constructor(mesh: Mesh, shadows: ShadowGenerator, muzzle: readonly [number, number, number]) {
    mesh.receiveShadows = true;
    shadows.addShadowCaster(mesh, false);
    this.batch = new ThinBatch(mesh, { color: 4 });
    this.pose = { name: 'pose', start: 0, frames: 1, duration: 1, loop: true, yaw: 0, muzzles: [new Float32Array(muzzle)] };
  }

  has(clip: string): boolean {
    return clip === 'idle';
  }

  clip(): CrowdClip {
    return this.pose;
  }

  frameAt(): number {
    return 0;
  }

  begin(): void {
    this.batch.count = 0;
  }

  add(world: Matrix, _clip: CrowdClip, _frame: number, flash: number, tint?: UnitTint | null): void {
    const [r, g, b] = tint ?? NO_TINT;
    const batch = this.batch, i = batch.count++;
    world.copyToArray(batch.slot('matrix', i), i * 16);
    const color = batch.slot('color', i);
    color[i * 4] = r * (1 + 1.2 * flash);
    color[i * 4 + 1] = g * (1 + 0.95 * flash);
    color[i * 4 + 2] = b * (1 + 0.7 * flash);
    color[i * 4 + 3] = 1;
  }

  end(): void {
    this.batch.commit();
  }

  muzzle(clip: CrowdClip, _frame: number, _index: number, world: Matrix, out: Vector3): Vector3 {
    const tip = clip.muzzles[0];
    return Vector3.TransformCoordinatesFromFloatsToRef(tip[0], tip[1], tip[2], world, out);
  }
}

/** Model transform for a unit: yaw about its feet, uniform scale, and a lift above the ground. */
export function crowdWorld(position: Vector3, yaw: number, scale: number, lift: number, out = instanceWorld): Matrix {
  Quaternion.RotationYawPitchRollToRef(yaw, 0, 0, rotation);
  scaling.setAll(scale);
  translation.set(position.x, position.y + lift * scale, position.z);
  return Matrix.ComposeToRef(scaling, rotation, translation, out);
}

function sampleTimes(group: AnimationGroup, oneShot: boolean): { times: number[]; duration: number } {
  const fps = group.targetedAnimations[0]?.animation.framePerSecond ?? 60;
  const length = Math.max(0, group.to - group.from);
  const duration = Math.max(length / fps, 1 / SAMPLE_RATE);
  // Loops omit the closing frame, which repeats the first.
  const count = Math.max(1, Math.round(duration * SAMPLE_RATE)) + (oneShot ? 1 : 0);
  const times = Array.from({ length: count }, (_, i) =>
    group.from + Math.min(length, (oneShot ? i / SAMPLE_RATE : (i / count) * duration) * fps));
  return { times, duration };
}

/** Every node from `stop` (exclusive) down to each target, parents first, without repeats. */
function ancestors(targets: Node[], stop: Node): TransformNode[] {
  const ordered: TransformNode[] = [];
  const seen = new Set<Node>();
  for (const target of targets) {
    const chain: TransformNode[] = [];
    for (let node: Node | null = target; node && node !== stop && !seen.has(node); node = node.parent) {
      if (node instanceof TransformNode) chain.push(node);
      seen.add(node);
    }
    ordered.push(...chain.reverse());
  }
  return ordered;
}
