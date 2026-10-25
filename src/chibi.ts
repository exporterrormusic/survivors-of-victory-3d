// Loads a converted NIKKE chibi GLB (see tools/sdp.mjs) and plays its clips with crossfades.
//
// Node layout per character:
//   root      gameplay transform (position + heading). Model faces +Z at heading 0.
//   └ facing  per-clip yaw correction. NIKKE clips face wherever NIKKE's camera needed them:
//             lobby clips (idle/run/talk) face the camera, cover-shooter clips (aim_*, cover_shot)
//             aim away from it, and aim_start/aim_end turn between the two. The converter measures
//             each clip's head and gun yaw (ClipMeta.yaw); here we turn the model so the head
//             (or, for rifle aimed clips, the gun) points forward.
//     └ __root__ (glTF loader's handedness node) → skeleton + skinned meshes

import {
  AbstractMesh,
  AnimationGroup,
  ImportMeshAsync,
  Node,
  Scene,
  TransformNode,
  Vector3,
} from '@babylonjs/core';
import { GLTFLoaderAnimationStartMode } from '@babylonjs/loaders/glTF';
import '@babylonjs/loaders/glTF';
import { optimizeStaticTracks } from './model-library';

export interface ClipMeta {
  duration: number;
  frames: number;
  fps: number;
  loop: boolean;
  /** NKAS's body yaw; informational only (rifle stances stand side-on) */
  frontYaw: number | null;
  hide: string[];
  /** head / gun yaw sampled evenly over the clip; glTF space, degrees, atan2(x, z) */
  yaw: { head: number[] | null; gun: number[] | null };
  /** gun tip as an offset in a joint's local space; trustworthy for aimed clips only */
  muzzle: MuzzleRef | null;
}

export interface MuzzleRef {
  joint: string;
  offset: [number, number, number];
}

export interface VariantMeta {
  file: string;
  /** face icon next to the GLB, if NKAS had one */
  icon: string | null;
  variant: string;
  root: string;
  hips: string;
  frontYaw: number | null;
  parts: { role: string; node: string }[];
  clips: Record<string, ClipMeta>;
}

export interface ChibiIndex {
  variants: Record<string, VariantMeta>;
}

export type FacingMode = 'auto' | 'none';
/** Staff and sword users face their target with their head rather than a gun barrel. */
export type AimFacing = 'weapon' | 'head';
/** Where shots leave from: the measured gun tip, or in front of the chest ('body'). */
export type MuzzleMode = 'weapon' | 'body';

export interface PlayOptions {
  loop?: boolean;
  /** crossfade time in seconds */
  fade?: number;
  speed?: number;
  /** called once when a non-looping clip finishes, if it is still the current clip */
  onEnd?: () => void;
}

export const BASE = `${import.meta.env.BASE_URL}chibi/`;
const DEG = Math.PI / 180;

const AIMED = /shot|aim/;
const TRACKED = /aim_start|aim_end/; // the body turns inside the clip: follow it
const FIRST_FRAME = /death|stun/; // falls and flinches: keep the facing they start with
const MUZZLE_FALLBACK = ['shot', 'aim_idle', 'cover_shot', 'cover_aim_idle'];
/** Clips the game plays by name, and what some NKAS models call them instead (Nayuta: idle_eff, Modernia: idle_01). */
export const CLIP_FALLBACKS: Readonly<Record<string, readonly string[]>> = { idle: ['idle_eff', 'idle_01', 'talk_idle'] };

export async function loadChibiIndex(): Promise<ChibiIndex> {
  const r = await fetch(`${BASE}index.json`);
  if (!r.ok) throw new Error(`chibi/index.json: HTTP ${r.status} (run npm run chibi)`);
  return r.json();
}

interface Layer {
  name: string;
  group: AnimationGroup;
  weight: number;
  target: number;
}

export class Chibi {
  facingMode: FacingMode = 'auto';
  current = '';

  private layers: Layer[] = [];
  private fade = 0.15;
  private clipTime = 0;
  private clipSpeed = 1;
  private yawFrom = 0;
  private readonly staticYaw = new Map<string, number>();
  /** gun yaw minus head yaw while aiming; constant per character (cheek on the stock) */
  private readonly gunOffset: number;

  private constructor(
    readonly meta: VariantMeta,
    readonly root: TransformNode,
    private readonly facing: TransformNode,
    readonly meshes: AbstractMesh[],
    private readonly groups: Map<string, AnimationGroup>,
    private readonly nodes: Map<string, TransformNode>,
    aimFacing: AimFacing,
    private readonly muzzleMode: MuzzleMode,
  ) {
    this.gunOffset = aimOffset(meta, aimFacing);
    for (const name of Object.keys(meta.clips)) this.staticYaw.set(name, staticClipYaw(meta, name, this.gunOffset));
  }

  static async load(scene: Scene, meta: VariantMeta, aimFacing: AimFacing = 'weapon', muzzleMode: MuzzleMode = 'weapon'): Promise<Chibi> {
    const result = await ImportMeshAsync(`${BASE}${meta.file}`, scene, {
      pluginOptions: { gltf: { animationStartMode: GLTFLoaderAnimationStartMode.NONE } },
    });
    optimizeStaticTracks(result.animationGroups);
    return Chibi.fromModel(scene, meta, result, aimFacing, muzzleMode);
  }

  private static fromModel(scene: Scene, meta: VariantMeta, result: {
    meshes: AbstractMesh[]; transformNodes: TransformNode[]; animationGroups: AnimationGroup[];
  }, aimFacing: AimFacing, muzzleMode: MuzzleMode): Chibi {
    const root = new TransformNode(`${meta.variant}`, scene);
    const facing = new TransformNode(`${meta.variant}_facing`, scene);
    facing.parent = root;
    result.meshes[0].parent = facing; // __root__

    const groups = new Map<string, AnimationGroup>();
    for (const g of result.animationGroups) {
      g.stop();
      g.weight = 0;
      groups.set(g.name, g);
    }
    for (const [clip, alternatives] of Object.entries(CLIP_FALLBACKS)) {
      const alternative = groups.has(clip) ? undefined : alternatives.find((name) => groups.has(name));
      if (!alternative) continue;
      groups.set(clip, groups.get(alternative)!);
      meta.clips[clip] ??= meta.clips[alternative];
    }
    const meshes = result.meshes.filter((m) => m.getTotalVertices() > 0);
    for (const m of meshes) {
      m.alwaysSelectAsActiveMesh = true; // skinned bounds don't follow the animation
      m.isPickable = false;
      // NKAS includes disabled helper geometry (e.g. Scarlet's white weapon blocks).
      // Hide its geometry while keeping the transform hierarchy available to animation.
      if (m.metadata?.gltf?.extras?.disabled === true) m.isVisible = false;
    }
    // joints only: a weapon bone can share its name with the weapon mesh
    const nodes = new Map<string, TransformNode>();
    for (const n of result.transformNodes) if (!nodes.has(n.name)) nodes.set(n.name, n);

    return new Chibi(meta, root, facing, meshes, groups, nodes, aimFacing, muzzleMode);
  }

  has(name: string): boolean {
    return this.groups.has(name);
  }

  /** The clip's animation group, for callers that layer clips themselves (src/survivor/rig.ts). */
  animationGroup(name: string): AnimationGroup | undefined {
    return this.groups.get(name);
  }

  /** A skeleton joint by name. */
  joint(name: string): TransformNode | undefined {
    return this.nodes.get(name);
  }

  /** The per-clip yaw node under root; layered callers set its rotation instead of calling update(). */
  get facingNode(): TransformNode {
    return this.facing;
  }

  /** Facing yaw (radians) that points clip `name` forward; aimed clips point the gun forward. */
  clipYaw(name: string): number {
    return this.staticYaw.get(name) ?? Math.PI;
  }

  clipNames(): string[] {
    return [...this.groups.keys()].sort();
  }

  duration(name: string): number {
    return this.meta.clips[name]?.duration ?? 0;
  }

  play(name: string, opts: PlayOptions = {}): boolean {
    const group = this.groups.get(name);
    if (!group) {
      console.warn(`${this.meta.variant}: no clip "${name}"`);
      return false;
    }
    const loop = opts.loop ?? this.meta.clips[name]?.loop ?? false;
    const speed = opts.speed ?? 1;
    if (name === this.current && loop && group.isPlaying && !opts.onEnd) {
      group.speedRatio = speed;
      return true;
    }

    for (const l of this.layers) l.target = 0;
    let layer = this.layers.find((l) => l.group === group);
    if (!layer) {
      layer = { name, group, weight: 0, target: 1 };
      this.layers.push(layer);
    }
    layer.target = 1;

    group.onAnimationGroupEndObservable.clear();
    group.stop(true);
    group.start(loop, speed, group.from, group.to);
    group.weight = layer.weight;
    if (opts.onEnd && !loop) {
      const onEnd = opts.onEnd;
      group.onAnimationGroupEndObservable.addOnce(() => {
        if (this.current === name) onEnd();
      });
    }

    this.fade = opts.fade ?? 0.15;
    this.current = name;
    this.clipTime = 0;
    this.clipSpeed = speed;
    this.yawFrom = this.facing.rotation.y;
    if (this.fade <= 0) layer.weight = group.weight = 1;
    return true;
  }

  setSpeed(speed: number): void {
    const g = this.groups.get(this.current);
    if (g) g.speedRatio = speed;
    this.clipSpeed = speed;
  }

  /** Raise the model (e.g. standing on a mount) without moving the gameplay root. */
  setLift(y: number): void {
    this.facing.position.y = y;
  }

  setFacingMode(mode: FacingMode): void {
    this.facingMode = mode;
    this.yawFrom = this.facing.rotation.y = this.yawFor(this.current, this.clipTime);
  }

  update(dt: number): void {
    const step = this.fade > 0 ? dt / this.fade : 1;
    for (const l of this.layers) {
      l.weight = l.target > l.weight ? Math.min(l.target, l.weight + step) : Math.max(l.target, l.weight - step);
      l.group.weight = l.weight;
    }
    for (let i = this.layers.length - 1; i >= 0; i--) {
      const layer = this.layers[i];
      if (layer.target > 0 || layer.weight > 0) continue;
      layer.group.onAnimationGroupEndObservable.clear(); layer.group.stop(true); this.layers.splice(i, 1);
    }

    const clip = this.meta.clips[this.current];
    if (clip) {
      this.clipTime += dt * this.clipSpeed;
      this.clipTime = clip.loop ? this.clipTime % clip.duration : Math.min(this.clipTime, clip.duration);
    }
    // turn in step with the pose crossfade so the two cancel out
    const w = this.layers.find((l) => l.name === this.current)?.weight ?? 1;
    this.facing.rotation.y = lerpAngle(this.yawFrom, this.yawFor(this.current, this.clipTime), w);
  }

  /**
   * World position of the gun tip in the pose being rendered this frame (call after update()),
   * or a point in front of the chest if the variant has no measured muzzle.
   */
  muzzle(out: Vector3): Vector3 {
    const ref = this.muzzleMode === 'weapon' ? clipMuzzle(this.meta, this.current) : null;
    if (ref && this.jointPoint(ref.joint, ref.offset, out)) return out;
    this.root.computeWorldMatrix(true);
    return Vector3.TransformCoordinatesFromFloatsToRef(0, 1, 0.6, this.root.getWorldMatrix(), out);
  }

  /** World position of the head bone this frame (falls back to above the root). */
  head(out: Vector3): Vector3 {
    if (this.jointPoint('Bip001 Head', [0, 0, 0], out)) return out;
    return out.copyFrom(this.root.position).addInPlaceFromFloats(0, 1.6, 0);
  }

  /** Add layers to every mesh's mask, e.g. so a second camera can see the hero. */
  addLayer(mask: number): void {
    for (const m of this.meshes) m.layerMask |= mask;
  }

  private jointPoint(name: string, [x, y, z]: readonly number[], out: Vector3): boolean {
    const joint = this.nodes.get(name);
    if (!joint) return false;
    // bone world matrices are otherwise only refreshed during render; walk the chain top-down
    const chain: TransformNode[] = [];
    for (let n: Node | null = joint; n; n = n.parent) if (n instanceof TransformNode) chain.push(n);
    for (let i = chain.length - 1; i >= 0; i--) chain[i].computeWorldMatrix(true);
    Vector3.TransformCoordinatesFromFloatsToRef(x, y, z, joint.getWorldMatrix(), out);
    return true;
  }

  dispose(): void {
    for (const g of this.groups.values()) g.dispose();
    this.root.dispose(false, true);
  }

  /** Facing-node yaw (radians) that points clip `name` at time `t` toward +Z. */
  private yawFor(name: string, t: number): number {
    if (this.facingMode === 'none') return 0;
    const clip = this.meta.clips[name];
    const head = clip?.yaw?.head;
    if (!head) return Math.PI; // unmeasured: NIKKE chibis face the camera, i.e. glTF -Z
    if (!TRACKED.test(name)) return this.staticYaw.get(name) ?? Math.PI;
    let deg = sampleCurve(head, clip.duration > 0 ? t / clip.duration : 0);
    if (AIMED.test(name)) deg += this.gunOffset;
    // The glTF loader mirrors X, which negates yaw: a clip facing glTF yaw θ faces -θ in
    // Babylon, so turning the parent by +θ brings it back to 0 (+Z).
    return deg * DEG;
  }
}

/** Gun yaw minus head yaw while aiming; constant per character (cheek on the stock). */
export function aimOffset(meta: VariantMeta, aimFacing: AimFacing): number {
  const ref = ['aim_idle', 'cover_aim_idle', 'cover_shot', 'shot'].map((n) => meta.clips[n]?.yaw).find((y) => y?.head && y.gun);
  return aimFacing === 'weapon' && ref ? circularMean(ref.gun!.map((g, i) => g - ref.head![i])) : 0;
}

/** Facing yaw (radians) that points clip `name` forward, ignoring turns inside aim_start/aim_end. */
export function staticClipYaw(meta: VariantMeta, name: string, gunOffset: number): number {
  const head = meta.clips[name]?.yaw.head;
  return head ? ((FIRST_FRAME.test(name) ? head[0] : circularMean(head)) + (AIMED.test(name) ? gunOffset : 0)) * DEG : Math.PI;
}

/** Gun tip used while clip `name` plays: its own if aimed and measured, else an aimed fallback. */
export function clipMuzzle(meta: VariantMeta, name: string): MuzzleRef | null {
  return (AIMED.test(name) && meta.clips[name]?.muzzle) || MUZZLE_FALLBACK.map((n) => meta.clips[n]?.muzzle).find(Boolean) || null;
}

export function lerpAngle(a: number, b: number, t: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

/** degrees in, degrees out */
function circularMean(deg: number[]): number {
  let x = 0;
  let y = 0;
  for (const d of deg) {
    x += Math.cos(d * DEG);
    y += Math.sin(d * DEG);
  }
  return Math.atan2(y, x) / DEG;
}

/** Evenly spaced angle samples (degrees) at u in [0, 1], interpolated the short way round. */
function sampleCurve(deg: number[], u: number): number {
  const f = Math.max(0, Math.min(1, u)) * (deg.length - 1);
  const i = Math.min(Math.floor(f), deg.length - 2);
  if (i < 0) return deg[0];
  return lerpAngle(deg[i] * DEG, deg[i + 1] * DEG, f - i) / DEG;
}
