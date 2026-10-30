// Twin-stick animation for a chibi: the legs run where WASD points while the torso aims at the cursor.
//
// Bip001 rigs hang the thighs off the pelvis and the torso, arms and weapon (Bip001 Prop1) off the
// spine, so every clip is cloned twice with a mask: `lower` (everything outside the spine's subtree)
// and `upper` (the spine's subtree). After Babylon evaluates the clips the spine is twisted about
// world up. Aiming, the twist is closed-loop: it turns until the gun (Prop1 origin → muzzle) points
// along the aim. Relaxed, the chest simply turns part of the way toward the aim. Moving away from
// the aim while aiming backpedals: the legs face back toward the aim and the run clip plays reversed.

import { AnimationGroup, AnimationGroupMask, AnimationGroupMaskMode, Matrix, type Node, Quaternion, Space, TransformNode, Vector3 } from '@babylonjs/core';
import { aimOffset, clipMuzzle, lerpAngle, type Chibi, type MuzzleRef } from '../chibi';
import { wrapAngle } from './math';
import { SwiftBunnyGrounding } from '../characters/sin/grounding';

// The gun (Prop1) and the arms (under Spine1) both hang off Spine, so the whole twist goes there;
// splitting it with Spine1 would pull the hands off the rifle.
const SPINE = 'Bip001 Spine';
const GUN = 'Bip001 Prop1';
const DEG = Math.PI / 180;
/** Moving more than this far from the aim backpedals (with hysteresis). */
const BACKPEDAL_ON = 110 * DEG;
const BACKPEDAL_OFF = 95 * DEG;
/** most the torso turns away from the legs while aiming; beyond it the legs crab toward the aim */
const MAX_TWIST = 35 * DEG;
const THIGHS = ['Bip001 L Thigh', 'Bip001 R Thigh'] as const;
/** leg clips whose hips get measured (see hipCorrection) */
const LEG_CLIPS = ['idle', 'run', 'walk'];
/** standing still, the feet step round once the aim is this far from them */
const STEP_AFTER = 35 * DEG;
/** relaxed, the chest turns this share of the way toward the aim, at most RELAXED_MAX */
const RELAXED_SHARE = .55;
const RELAXED_MAX = 40 * DEG;
/** legs turn this fast (1/s, exponential) */
const LEG_TURN = 14;
const UP = new Vector3(0, 1, 0);
/** Biped head bones use local +X toward the crown and +Y toward the face. */
const HEAD_UP = new Vector3(1, 0, 0);

/** What the arms are doing. */
export type Posture = 'relaxed' | 'aim' | 'shot' | 'reload';

interface Track { name: string; group: AnimationGroup; weight: number; target: number }

/** One body half: masked clones of the chibi's clips, crossfaded like Chibi.play. */
class Layer {
  readonly tracks: Track[] = [];
  current = '';
  private fade = .12;
  private readonly groups = new Map<string, AnimationGroup>();

  constructor(
    private readonly chibi: Chibi,
    private readonly suffix: string,
    private readonly mask: AnimationGroupMask,
    private readonly targets = new Map<TransformNode, TransformNode>(),
    private readonly smoothRecoil = false,
  ) {}

  play(name: string, { loop = true, speed = 1, fade = .12, restart = false, hold = false } = {}): void {
    const group = this.group(name);
    if (!group) return;
    if (name === this.current && !restart) {
      group.speedRatio = speed;
      return;
    }
    for (const t of this.tracks) t.target = 0;
    let track = this.tracks.find((t) => t.group === group);
    if (!track) {
      track = { name, group, weight: 0, target: 1 };
      this.tracks.push(track);
    }
    track.target = 1;
    if (restart || !group.isPlaying) {
      group.stop(true);
      // A held pose loops a sliver at the clip's very end: a paused group stops contributing to the
      // blend, so it must keep evaluating to stay on its last frame.
      if (hold) group.start(true, 1, group.to - .05, group.to);
      else group.start(loop, speed, group.from, group.to);
      // a reversed clip starts at its end and runs back from there
      if (speed < 0) group.goToFrame(group.to);
    } else {
      group.speedRatio = speed;
    }
    group.loopAnimation = loop || hold;
    group.weight = track.weight;
    this.fade = fade;
    this.current = name;
    if (fade <= 0) for (const t of this.tracks) t.weight = t.target;
  }

  /** Normalised play position of the current clip, 0..1. */
  progress(): number {
    const group = this.groups.get(this.current);
    const animatable = group?.isPlaying ? group.animatables[0] : undefined;
    if (!group || !animatable) return 1;
    const span = group.to - group.from;
    return span > 0 ? Math.min(1, Math.max(0, (animatable.masterFrame - group.from) / span)) : 1;
  }

  update(dt: number): void {
    const step = this.fade > 0 ? dt / this.fade : 1;
    for (const t of this.tracks) {
      t.weight = t.target > t.weight ? Math.min(t.target, t.weight + step) : Math.max(t.target, t.weight - step);
      t.group.weight = t.weight;
    }
    for (let i = this.tracks.length - 1; i >= 0; i--) {
      const t = this.tracks[i];
      if (t.target > 0 || t.weight > 0) continue;
      t.group.stop(true);
      this.tracks.splice(i, 1);
    }
  }

  dispose(): void {
    for (const group of this.groups.values()) group.dispose();
  }

  /** Build masked animation copies while loading rather than on the first action. */
  prepare(names: readonly string[]): void {
    for (const name of names) this.group(name);
  }

  private group(name: string): AnimationGroup | undefined {
    let group = this.groups.get(name);
    if (group) return group;
    const source = this.chibi.animationGroup(name);
    if (!source) return undefined;
    group = source.clone(`${name}@${this.suffix}`, target => this.targets.get(target) ?? target);
    // Nirvana's floating disk has oversized authored recoil. Keep hands/body animated,
    // but reduce the disk subtree's shot displacement to 15% of the authored motion.
    // Wu Wei's overhead ribbons also need gentler firing motion.
    if (/^c223_0[01]$/.test(this.chibi.meta.variant) && name === 'cover_shot') {
      const gun = this.chibi.joint(GUN);
      const ribbons = this.chibi.meta.variant === 'c223_01' ? this.chibi.joint('root_shawl') : null;
      const aim = this.chibi.animationGroup('aim_idle');
      for (const track of group.targetedAnimations) {
        const target = track.target;
        if (!(target instanceof TransformNode)) continue;
        const weapon = gun && (target === gun || target.isDescendantOf(gun));
        const ribbon = ribbons && (target === ribbons || target.isDescendantOf(ribbons));
        if (!weapon && !ribbon) continue;
        const reference = aim?.targetedAnimations.find(a => a.target === target && a.animation.targetProperty === track.animation.targetProperty);
        const base = reference?.animation.getKeys()[0]?.value;
        if (!(base instanceof Vector3) && !(base instanceof Quaternion)) continue;
        track.animation = track.animation.clone();
        track.animation.setKeys(track.animation.getKeys().map(key => ({
          frame: key.frame,
          value: base instanceof Quaternion ? Quaternion.Slerp(base, key.value, .15) : Vector3.Lerp(base, key.value, .15),
        })));
      }
    }
    group.mask = this.mask;
    if (this.smoothRecoil && name === 'cover_shot') {
      const aim = this.chibi.animationGroup('aim_idle');
      for (const track of group.targetedAnimations) {
        if (track.animation.targetProperty === 'scaling') continue;
        const reference = aim?.targetedAnimations.find(a => (this.targets.get(a.target) ?? a.target) === track.target
          && a.animation.targetProperty === track.animation.targetProperty);
        const base = reference?.animation.getKeys()[0]?.value;
        if (!(base instanceof Vector3) && !(base instanceof Quaternion)) continue;
        track.animation = track.animation.clone();
        const span = Math.max(1, group.to - group.from);
        track.animation.setKeys(track.animation.getKeys().map(key => {
          // Each cycle eases out of and back into the same aiming pose.
          const amount = .3 * Math.sin(Math.PI * Math.max(0, Math.min(1, (key.frame - group.from) / span)));
          return { frame: key.frame, value: base instanceof Quaternion
            ? Quaternion.Slerp(base, key.value, amount) : Vector3.Lerp(base, key.value, amount) };
        }));
      }
    }
    group.weight = 0;
    this.groups.set(name, group);
    return group;
  }
}

export interface RigInput {
  /** world-space move direction (unit or zero) and ground speed in m/s */
  moveX: number;
  moveZ: number;
  speed: number;
  /** where the cursor is, as a yaw (atan2(x, z)) */
  aimYaw: number;
  posture: Posture;
  /** playback rate for the shot / reload clip */
  actionSpeed?: number;
}

export class TwinStickRig {
  private readonly grounding: SwiftBunnyGrounding;
  /** yaw of the legs (the gameplay root's yaw) */
  legYaw = 0;
  aimYaw = 0;
  backpedal = false;

  private readonly lower: Layer;
  private readonly upper: Layer;
  private readonly spine: TransformNode;
  private readonly chest: TransformNode;
  private readonly neck: TransformNode;
  private readonly head: TransformNode | null;
  private readonly gun: TransformNode;
  private readonly detachedWeapons: TransformNode[] = [];
  private readonly crownHold: { node: TransformNode; position: Vector3; rotation: Quaternion }[] = [];
  private crownHoldApplied = false;
  private readonly hoveringAttachments: { node: TransformNode; offset: Matrix }[] = [];
  private sanctuaryHalo: { node: TransformNode; fromCenter: Matrix; scale: Vector3 } | null = null;
  private readonly lowerSpine: TransformNode | null;
  private readonly torsoBefore = Matrix.Identity();
  private readonly weaponDelta = Matrix.Identity();
  private readonly weaponLocal = Matrix.Identity();
  private readonly weaponParentInverse = Matrix.Identity();
  private readonly muzzleRef: MuzzleRef;
  private readonly restSpine: Quaternion;
  private readonly restHead: Quaternion | null;
  /** The upper clip's own hip/root pose, evaluated without driving the visible legs. */
  private readonly upperFacing: TransformNode;
  private readonly upperParents: TransformNode[] = [];
  private readonly reloadFacingOffset: number;
  private readonly parentInverse = Matrix.Identity();
  private readonly parentDelta = Matrix.Identity();
  private readonly parentRotation = Quaternion.Identity();
  private readonly chain: TransformNode[];
  private posture: Posture = 'relaxed';
  /** 0 relaxed .. 1 aimed; fades so raising and lowering the gun doesn't snap */
  private aimWeight = 0;
  /** Chest heading relative to the cursor in the last aimed pose, retained throughout reload. */
  private chestAimOffset = 0;
  private readonly chestForward = new Vector3();
  private readonly torsoUp = new Vector3();
  private readonly uprightAxis = new Vector3();
  // Blender exports the research uniform with +Y crown / +Z face axes.
  private readonly localHeadUp: Vector3;
  private readonly localForward: Vector3;
  private readonly headUp = new Vector3();
  private readonly headForward = new Vector3();
  private readonly headAxis = new Vector3();
  /** Ease back to barrel steering after the last reload track fades out. Shots aim immediately. */
  private reloadAimWeight = 0;
  private full = false;
  private recoilCooldown = 0;
  private readonly muzzlePoint = new Vector3();
  private readonly gunBase = new Vector3();
  /** run clip cycles per metre, so the feet don't skate at any speed */
  private readonly cyclesPerMetre: number;
  /**
   * Per leg clip: the yaw that turns its hips to face the way idle's do. NIKKE's lobby run carries
   * the rifle across the body with the hips turned ~60° from the head, so head-based facing (fine
   * when relaxed) made an aimed torso twist that much extra. Aiming, the legs use hip facing instead.
   */
  private readonly hipCorrection = new Map<string, number>();

  constructor(readonly chibi: Chibi, cyclesPerMetre = 1.2 / (5.5 * .73), private readonly aimFacing: 'head' | 'weapon' = 'weapon', private readonly smoothRecoil = false) {
    this.grounding = new SwiftBunnyGrounding(chibi);
    // Queen's floating dress weapons have no forward barrel: the sampled
    // accessory tip points behind her. Steer her beam by her face instead.
    if (/^c019_0[01]$/.test(chibi.meta.variant)) this.aimFacing = 'head';
    this.localHeadUp = chibi.meta.variant === 'wells_research' ? Vector3.Up() : HEAD_UP;
    this.localForward = chibi.meta.variant === 'wells_research' ? new Vector3(0, 0, 1) : UP;
    const spine = chibi.joint(SPINE);
    // Crown's Glorious King aim sample picks a moving side barrel. Use the
    // central lance tip measured in her firing clip for every combat posture.
    const muzzle = clipMuzzle(chibi.meta, /^c330_0[012]$/.test(chibi.meta.variant) ? 'cover_shot' : 'aim_idle');
    const gun = (chibi.meta.variant === 'c471_01' ? chibi.joint('Bone_weapon01') : null)
      ?? chibi.joint(GUN) ?? (muzzle ? chibi.joint(muzzle.joint) : null);
    if (!spine || !gun) throw new Error(`${chibi.meta.variant}: the twin-stick rig needs ${SPINE} and ${GUN}`);
    this.spine = spine;
    this.chest = chibi.joint('Bip001 Spine1') ?? spine;
    this.neck = chibi.joint('Bip001 Neck') ?? this.chest;
    this.head = chibi.joint('Bip001 Head') ?? null;
    this.gun = gun;
    if (/^(c330_0[012]|c471_01)$/.test(chibi.meta.variant)) {
      for (const node of [chibi.joint('Bip001 L Clavicle'), chibi.joint('Bip001 R Clavicle'), gun]) {
        if (node) this.crownHold.push({ node, position: node.position.clone(), rotation: node.rotationQuaternion?.clone() ?? Quaternion.FromEulerVector(node.rotation) });
      }
    }
    this.muzzleRef = muzzle ?? { joint: gun.name, offset: [0, 1, 0] };
    spine.rotationQuaternion ??= Quaternion.FromEulerVector(spine.rotation);
    this.restSpine = spine.rotationQuaternion.clone();
    if (this.head) this.head.rotationQuaternion ??= Quaternion.FromEulerVector(this.head.rotation);
    this.restHead = this.head?.rotationQuaternion?.clone() ?? null;
    this.cyclesPerMetre = cyclesPerMetre;
    this.reloadFacingOffset = aimOffset(chibi.meta, this.aimFacing) * DEG;

    // T.A.L.O.S. hangs its thighs off Spine instead of Pelvis. Give those legs
    // a locomotion-driven copy of that parent, so upper-body masking and aiming
    // cannot freeze or twist the whole leg assembly along with the gun.
    const lowerTargets = new Map<TransformNode, TransformNode>();
    const spineLegs = THIGHS.map(name => chibi.joint(name)).filter((node): node is TransformNode => !!node && node.parent === spine);
    this.lowerSpine = spineLegs.length ? new TransformNode('lower-clip-spine', chibi.root.getScene()) : null;
    if (this.lowerSpine) {
      this.lowerSpine.parent = spine.parent;
      this.lowerSpine.position.copyFrom(spine.position);
      this.lowerSpine.scaling.copyFrom(spine.scaling);
      this.lowerSpine.rotationQuaternion = spine.rotationQuaternion.clone();
      lowerTargets.set(spine, this.lowerSpine);
      for (const leg of spineLegs) leg.parent = this.lowerSpine;
    }

    const upperNames: string[] = [];
    const collect = (n: Node) => { upperNames.push(n.name); for (const c of n.getChildren()) collect(c); };
    collect(spine);
    // Swift Bunny's gun is a sibling of the pelvis, not part of the torso.
    // Give it the combat clip and the same final aiming correction as her arms.
    if (chibi.meta.variant === 'c405_00' && !gun.isDescendantOf(spine)) {
      this.detachedWeapons.push(gun);
      collect(gun);
    }
    // Heavy Arms animates its weapons beside the biped instead of under the spine.
    // Keep them on the upper-body animation layer and carry the torso correction over.
    if (!gun.isDescendantOf(spine)) {
      for (const name of ['Bone_weapon01', 'Bone_weapon02', 'Bone_weapon03']) {
        const weapon = chibi.joint(name);
        if (weapon && !weapon.isDescendantOf(spine)) { this.detachedWeapons.push(weapon); collect(weapon); }
      }
    }
    // Marian's hovering assemblies are authored beside the biped, rather
    // than beneath its spine. They need both the upper clip and its final
    // torso correction; otherwise they keep the legs' heading while aiming.
    const marianAttachments: Record<string, readonly string[]> = {
      c019_00: ['Bip001 Prop1', 'Bip001 Prop2'],
      c019_01: ['Bip001 Prop1', 'Bip001 Prop2'],
    };
    for (const name of marianAttachments[chibi.meta.variant] ?? []) {
      const attachment = chibi.joint(name);
      if (attachment && !attachment.isDescendantOf(spine)) {
        this.detachedWeapons.push(attachment);
        collect(attachment);
      }
    }
    this.lower = new Layer(chibi, 'lower', new AnimationGroupMask(upperNames, AnimationGroupMaskMode.Exclude), lowerTargets);
    // Local spine keys are relative to each clip's own pelvis/root orientation. Using aim keys
    // directly under idle/run hips changes their pitch and roll as well as their yaw. Animate a
    // transform-only copy of those ancestors with the upper clip, then rebase at the waist.
    const ancestors: TransformNode[] = [];
    for (let n = spine.parent; n && n !== chibi.facingNode; n = n.parent) {
      if (n instanceof TransformNode) ancestors.unshift(n);
    }
    const targets = new Map<TransformNode, TransformNode>();
    this.upperFacing = new TransformNode('upper-clip-facing', chibi.root.getScene());
    this.upperFacing.parent = chibi.root;
    let parent = this.upperFacing;
    for (const source of ancestors) {
      const proxy = new TransformNode(`${source.name}@upper-parent`, chibi.root.getScene());
      proxy.parent = parent;
      proxy.position.copyFrom(source.position);
      proxy.scaling.copyFrom(source.scaling);
      proxy.rotationQuaternion = source.rotationQuaternion?.clone() ?? Quaternion.FromEulerVector(source.rotation);
      targets.set(source, proxy);
      this.upperParents.push(proxy);
      upperNames.push(proxy.name);
      parent = proxy;
    }
    this.upper = new Layer(chibi, 'upper', new AnimationGroupMask(upperNames, AnimationGroupMaskMode.Include), targets, smoothRecoil);

    this.chain = [];
    for (let n: Node | null = gun; n; n = n.parent) if (n instanceof TransformNode) this.chain.unshift(n);
    // Some rifles/floating weapons measure the muzzle on a child of Prop1.
    // Refresh that entire branch after steering, not only Prop1: reading a
    // cached child matrix makes aim feedback trail the current torso pose.
    const muzzleChain: TransformNode[] = [];
    for (let n: Node | null = chibi.joint(this.muzzleRef.joint) ?? null; n; n = n.parent) {
      if (n instanceof TransformNode) muzzleChain.unshift(n);
    }
    for (const n of muzzleChain) if (!this.chain.includes(n)) this.chain.push(n);
    const hips = new Map(LEG_CLIPS.filter((c) => chibi.has(c)).map((c) => [c, this.hipYaw(c) + chibi.clipYaw(c)] as const));
    const idleHips = hips.get('idle');
    if (idleHips !== undefined) for (const [clip, yaw] of hips) this.hipCorrection.set(clip, wrapAngle(idleHips - yaw));
    // Second Affection hides its floating drones in every cover/aim clip.
    // Keep their lower-layer hover animation, but anchor the assembly to the
    // torso using its visible idle pose instead of inheriting those hide keys.
    // Sanctuary uses its halo center as an upright, head-aligned attachment.
    if (chibi.meta.variant === 'c260_02' || chibi.meta.variant === 'c473_00') {
      const node = chibi.joint(chibi.meta.variant === 'c473_00' ? 'P_base_acc_01' : 'Dummy_Wp_root'), idle = chibi.animationGroup('idle');
      if (node && idle) {
        const weight = idle.weight;
        idle.weight = -1; idle.start(false); idle.pause();
        idle.goToFrame(idle.from + (chibi.meta.variant === 'c473_00' ? 6.3 * 30 : 0));
        const refresh = (n: TransformNode): void => {
          if (n.parent instanceof TransformNode) refresh(n.parent);
          n.computeWorldMatrix(true);
        };
        refresh(node); refresh(spine);
        if (chibi.meta.variant === 'c473_00') {
          const center = chibi.joint('P_light_acc_03')!;
          refresh(center);
          const scale = new Vector3();
          center.getWorldMatrix().decompose(scale);
          // Keep glTF's handedness reflection on X; a negative Y would turn
          // the display upside down when replacing its cinematic rotation.
          scale.set(-Math.abs(scale.x), Math.abs(scale.y), Math.abs(scale.z));
          this.sanctuaryHalo = {
            node, scale,
            fromCenter: node.getWorldMatrix().multiply(Matrix.Invert(center.getWorldMatrix())),
          };
        } else {
          this.hoveringAttachments.push({ node, offset: node.getWorldMatrix().multiply(Matrix.Invert(spine.getWorldMatrix())) });
        }
        idle.stop(true); idle.weight = weight;
      }
    }
    // Dorothy's gameplay idle aliases her rifle stance, whose hips are turned ~65 degrees.
    // That stance is not a locomotion reference: running hips must face local forward.
    // Queen and Lacrimosa also turn their idle hips; align all combat leg clips.
    if (/^(c233_0[012]|c234_00|c019_0[01]|c471_01|c405_00)$/.test(chibi.meta.variant)) {
      for (const clip of /^(c019_0[01]|c471_01|c405_00)$/.test(chibi.meta.variant) ? LEG_CLIPS : ['run', 'walk']) {
        const yaw = hips.get(clip);
        if (yaw !== undefined) this.hipCorrection.set(clip, wrapAngle(-yaw));
      }
    }
    // Calibrate even when reload is the first action, before a normal aimed frame has rendered.
    const aimPose = chibi.animationGroup('aim_idle');
    if (aimPose) {
      const weight = aimPose.weight;
      aimPose.weight = -1;
      aimPose.start(false);
      aimPose.pause();
      aimPose.goToFrame(aimPose.from);
      const gunYaw = this.measure();
      this.chestAimOffset = wrapAngle(this.chestYaw() - gunYaw);
      aimPose.stop(true);
      aimPose.weight = weight;
    }

    this.legYaw = chibi.root.rotation.y;
    this.lower.play('idle', { fade: 0 });
    this.upper.play('idle', { fade: 0 });
  }

  /** A full-body clip on both halves (death, stun). Ends when update() is called again.
   * `hold` blends to the clip's final frame and stays there (Scarlet passed out). */
  playFull(name: string, loop = false, hold = false): void {
    this.restoreCrownHold();
    this.full = true;
    const fade = hold ? .45 : .1;
    this.lower.play(name, { loop, fade, restart: true, hold });
    this.upper.play(name, { loop, fade, restart: true, hold });
  }

  /** While a full-body clip is held instead of calling update(): keep its blend fading in. */
  updateFull(dt: number): void {
    this.full = true;
    this.lower.update(dt);
    this.upper.update(dt);
  }

  /** Play position of the arms' clip, 0..1 (1 once a one-shot clip has finished). */
  upperProgress(): number {
    return this.upper.progress();
  }

  /** Preload the locomotion and firing layers for pooled actors. */
  prepare(): void {
    this.lower.prepare(['idle', 'run']);
    this.upper.prepare(['idle', 'run', 'aim_idle', 'cover_shot', 'cover_reload']);
  }

  /** Before Babylon animates: pick clips and speeds, turn the legs. */
  update(dt: number, input: RigInput): void {
    this.restoreCrownHold();
    this.full = false;
    this.recoilCooldown = input.posture === 'relaxed' || input.posture === 'reload' ? 0 : Math.max(0, this.recoilCooldown - dt);
    const moving = input.speed > .05 && (input.moveX !== 0 || input.moveZ !== 0);
    const moveYaw = moving ? Math.atan2(input.moveX, input.moveZ) : this.legYaw;
    const aim = this.aimYaw = input.aimYaw;
    this.posture = input.posture;
    const aimed = input.posture !== 'relaxed';

    let legTarget = this.legYaw;
    if (moving) {
      if (aimed) {
        const off = Math.abs(wrapAngle(moveYaw - aim));
        this.backpedal = this.backpedal ? off > BACKPEDAL_OFF : off > BACKPEDAL_ON;
      } else {
        this.backpedal = false;
      }
      legTarget = this.backpedal ? moveYaw + Math.PI : moveYaw;
      if (aimed) {
        // keep the torso within MAX_TWIST of the legs: past it the legs crab toward the aim
        const twist = wrapAngle(legTarget - aim);
        if (Math.abs(twist) > MAX_TWIST) legTarget = aim + Math.sign(twist) * MAX_TWIST;
      }
    } else {
      this.backpedal = false;
      if (Math.abs(wrapAngle(aim - this.legYaw)) > (aimed ? STEP_AFTER : STEP_AFTER * 1.5)) legTarget = aim;
    }
    this.legYaw = lerpAngle(this.legYaw, legTarget, 1 - Math.exp(-LEG_TURN * dt));
    this.chibi.root.rotation.y = this.legYaw;

    // legs: the run clip's rate follows the ground speed; reversed when backpedalling
    const rate = input.speed * this.cyclesPerMetre * this.chibi.duration('run');
    if (moving) this.lower.play('run', { speed: this.backpedal ? -rate : rate, fade: .12 });
    else this.lower.play('idle', { fade: .2 });

    const actionSpeed = input.actionSpeed ?? 1;
    switch (input.posture) {
      case 'relaxed':
        this.upper.play(moving ? 'run' : 'idle', { speed: moving ? rate : 1, fade: .2 });
        break;
      case 'aim':
        // let a shot's recoil finish before settling back into the aim
        if (this.upper.current !== 'cover_shot' || this.upper.progress() >= 1) this.upper.play('aim_idle', { fade: .1 });
        break;
      case 'shot': // the frame a shot fires: the gun snaps up, so the round leaves the real muzzle
        if (this.smoothRecoil || /^c223_0[01]$/.test(this.chibi.meta.variant)) {
          // Visual recoil is independent of projectile cadence (player and clone rigs).
          if (this.recoilCooldown > 1e-6) break;
          this.recoilCooldown = .4;
        }
        this.upper.play('cover_shot', { loop: false,
          speed: this.smoothRecoil ? this.chibi.duration('cover_shot') / .4 : actionSpeed,
          fade: this.aimWeight < 1 || this.reloadVisible() ? 0 : .04, restart: true });
        this.aimWeight = 1;
        break;
      case 'reload':
        this.upper.play('cover_reload', { loop: false, speed: actionSpeed, fade: .12 });
        break;
    }
    this.lower.update(dt);
    this.upper.update(dt);
    this.reloadAimWeight = this.reloadVisible() ? 1
      : input.posture === 'shot' ? 0 : Math.max(0, this.reloadAimWeight - dt / .1);
    if (input.posture !== 'shot') this.aimWeight = aimed ? Math.min(1, this.aimWeight + dt / .1) : Math.max(0, this.aimWeight - dt / .25);

    // the legs set the model's facing: blend the lower clips' yaw corrections by weight
    // (head facing when relaxed, hip facing when aimed)
    let sum = 0, total = 0, ref = 0;
    for (const t of this.lower.tracks) {
      if (t.weight <= 0) continue;
      const alignTravel = /^(c233_0[012]|c234_00|c471_01|c405_00)$/.test(this.chibi.meta.variant) && (t.name === 'run' || t.name === 'walk');
      const clipYaw = this.chibi.clipYaw(t.name) + (this.hipCorrection.get(t.name) ?? 0) * (alignTravel ? 1 : this.aimWeight);
      if (total === 0) ref = clipYaw;
      sum += wrapAngle(clipYaw - ref) * t.weight;
      total += t.weight;
    }
    this.chibi.facingNode.rotation.y = total > 0 ? ref + sum / total : this.chibi.clipYaw('idle');
    // Normalize the upper clip in its own coordinate frame too. Reload was authored facing a
    // different direction from aim; retaining that source yaw would turn the chest away mid-reload.
    sum = 0; total = 0; ref = 0;
    for (const t of this.upper.tracks) {
      if (t.weight <= 0) continue;
      const yaw = this.chibi.clipYaw(t.name) + (t.name === 'cover_reload' ? this.reloadFacingOffset : 0);
      if (total === 0) ref = yaw;
      sum += wrapAngle(yaw - ref) * t.weight;
      total += t.weight;
    }
    this.upperFacing.rotation.y = total > 0 ? ref + sum / total : this.chibi.clipYaw('idle');
    // every clip animates the spine, but reset it anyway so a twist can never accumulate
    this.spine.rotationQuaternion!.copyFrom(this.restSpine);
    if (this.head && this.restHead) this.head.rotationQuaternion!.copyFrom(this.restHead);
  }

  /** After Babylon animates: twist the spine toward the aim. */
  applyAim(): void {
    if (this.full) {
      this.measure();
      return;
    }
    if (this.detachedWeapons.length) this.torsoBefore.copyFrom(this.spine.computeWorldMatrix(true));
    this.rebaseTorso();
    this.uprightTorso();
    this.followTorsoWithWeapons();
    this.levelCrownHold();
    const toAim = wrapAngle(this.aimYaw - this.legYaw);
    const relaxed = Math.max(-RELAXED_MAX, Math.min(RELAXED_MAX, toAim * RELAXED_SHARE));
    const gunYaw = this.measure();
    // A reload deliberately moves the rifle. Steer by the chest instead, cancelling the clip's
    // authored body turns while preserving the hand/weapon motion. Keep this through both fades;
    // switching back to barrel steering while reload still contributes causes a whole-body snap.
    const aimed = this.aimFacing === 'head' && this.head ? wrapAngle(this.aimYaw - this.headYaw()) : lerpAngle(
      wrapAngle(this.aimYaw - gunYaw),
      wrapAngle(this.aimYaw + this.chestAimOffset - this.chestYaw()),
      this.reloadAimWeight,
    );
    const w = this.aimWeight;
    const twist = relaxed * (1 - w) + aimed * w;
    if (this.detachedWeapons.length) this.torsoBefore.copyFrom(this.spine.computeWorldMatrix(true));
    if (Math.abs(twist) > 1e-4) this.spine.rotate(UP.clone(), twist, Space.WORLD);
    this.followTorsoWithWeapons();
    this.measure();
    if (this.reloadAimWeight === 0 && this.posture !== 'relaxed' && w >= 1) {
      this.chestAimOffset = wrapAngle(this.chestYaw() - this.aimYaw);
    }
    this.levelHead();
    if (this.sanctuaryHalo && this.head) {
      // Anchor to her look direction and world up, not the animated spine's
      // roll or sideways firing stance. The halo stays upright behind her head.
      const { node, fromCenter, scale } = this.sanctuaryHalo;
      const yaw = this.headYaw();
      const center = this.head.getAbsolutePosition().add(new Vector3(-Math.sin(yaw) * .65, .65, -Math.cos(yaw) * .65));
      const world = fromCenter.multiply(Matrix.Compose(scale, Quaternion.RotationYawPitchRoll(yaw, 0, 0), center));
      const local = node.parent ? world.multiply(Matrix.Invert(node.parent.computeWorldMatrix(true))) : world;
      node.rotationQuaternion ??= Quaternion.Identity();
      local.decompose(node.scaling, node.rotationQuaternion, node.position);
      node.computeWorldMatrix(true);
    }
    for (const { node, offset } of this.hoveringAttachments) {
      offset.multiplyToRef(this.spine.computeWorldMatrix(true), this.weaponLocal);
      if (node.parent) {
        node.parent.computeWorldMatrix(true).invertToRef(this.weaponParentInverse);
        this.weaponLocal.multiplyToRef(this.weaponParentInverse, this.weaponLocal);
      }
      node.rotationQuaternion ??= Quaternion.Identity();
      this.weaponLocal.decompose(node.scaling, node.rotationQuaternion, node.position);
      node.computeWorldMatrix(true);
    }
    if (this.chibi.meta.variant === 'c405_00') {
      this.grounding.apply();
      this.measure();
    }
  }

  private followTorsoWithWeapons(): void {
    if (!this.detachedWeapons.length) return;
    this.torsoBefore.invertToRef(this.weaponDelta);
    this.weaponDelta.multiplyToRef(this.spine.computeWorldMatrix(true), this.weaponDelta);
    for (const weapon of this.detachedWeapons) {
      weapon.computeWorldMatrix(true).multiplyToRef(this.weaponDelta, this.weaponLocal);
      if (weapon.parent) {
        weapon.parent.getWorldMatrix().invertToRef(this.weaponParentInverse);
        this.weaponLocal.multiplyToRef(this.weaponParentInverse, this.weaponLocal);
      }
      weapon.rotationQuaternion ??= Quaternion.Identity();
      this.weaponLocal.decompose(weapon.scaling, weapon.rotationQuaternion, weapon.position);
      weapon.computeWorldMatrix(true);
    }
  }

  /** World position of the gun tip after this frame's twist. */
  muzzle(out: Vector3): Vector3 {
    return out.copyFrom(this.muzzlePoint);
  }

  /** Horizontal yaw the barrel points along this frame. */
  gunYaw(): number {
    return Math.atan2(this.muzzlePoint.x - this.gunBase.x, this.muzzlePoint.z - this.gunBase.z);
  }

  dispose(): void {
    this.lower.dispose();
    this.upper.dispose();
    this.upperFacing.dispose();
    if (this.lowerSpine) {
      for (const leg of [...this.lowerSpine.getChildren()]) leg.parent = this.spine;
      this.lowerSpine.dispose();
    }
  }

  /** Keep the upper clip's authored orientation, anchored to the moving legs' waist. */
  private rebaseTorso(): void {
    for (const n of this.chain) n.computeWorldMatrix(true);
    this.upperFacing.computeWorldMatrix(true);
    for (const n of this.upperParents) n.computeWorldMatrix(true);
    const source = this.upperParents[this.upperParents.length - 1];
    if (!source || !this.spine.parent) return;
    this.spine.parent.getWorldMatrix().invertToRef(this.parentInverse);
    source.getWorldMatrix().multiplyToRef(this.parentInverse, this.parentDelta);
    Quaternion.FromRotationMatrixToRef(this.parentDelta, this.parentRotation);
    this.parentRotation.normalize();
    this.parentRotation.multiplyToRef(this.spine.rotationQuaternion!, this.spine.rotationQuaternion!);
  }

  private reloadVisible(): boolean {
    return this.upper.tracks.some(t => t.name === 'cover_reload' && t.weight > 0);
  }

  /** Rapunzel carries Holy Grace across her body, so its shaft cannot define look direction. */
  private headYaw(): number {
    this.chest.computeWorldMatrix(true);
    this.neck.computeWorldMatrix(true);
    Vector3.TransformNormalToRef(this.localForward, this.head!.computeWorldMatrix(true), this.headForward);
    return Math.atan2(this.headForward.x, this.headForward.z);
  }

  /** Keep the torso vertical while aiming, moving and reloading. Rotate the whole upper
   * subtree at the waist so hands stay attached, then steer the corrected muzzle's yaw. */
  private uprightTorso(): void {
    if (this.aimWeight <= 0) return;
    this.spine.computeWorldMatrix(true);
    this.chest.computeWorldMatrix(true);
    this.neck.computeWorldMatrix(true);
    this.neck.getAbsolutePosition().subtractToRef(this.spine.getAbsolutePosition(), this.torsoUp);
    if (this.torsoUp.lengthSquared() < 1e-8) return;
    this.torsoUp.normalize();
    const tilt = Math.acos(Math.max(-1, Math.min(1, this.torsoUp.y)));
    Vector3.CrossToRef(this.torsoUp, UP, this.uprightAxis);
    if (this.uprightAxis.lengthSquared() < 1e-8) return;
    this.spine.rotate(this.uprightAxis.normalize(), tilt * this.aimWeight, Space.WORLD);
  }

  private restoreCrownHold(): void {
    if (!this.crownHoldApplied) return;
    for (const { node, position, rotation } of this.crownHold) {
      node.position.copyFrom(position);
      node.rotationQuaternion!.copyFrom(rotation);
    }
    this.crownHoldApplied = false;
  }

  /** Lower the entire firing hold around the shoulders, keeping both hands on
   * Crown's lance or Lacrimosa's coffin without pitching the chest or changing lobby animation. */
  private levelCrownHold(): void {
    const weight = this.aimWeight * (1 - this.reloadAimWeight);
    if (this.crownHold.length !== 3 || weight <= 0) return;
    this.measure();
    const barrel = this.chibi.joint(this.chibi.meta.variant === 'c471_01' ? 'Bone_weapon01_01' : 'B_weapon_01');
    if (!barrel) return;
    const direction = Vector3.TransformNormal(new Vector3(1, 0, 0), barrel.computeWorldMatrix(true)).normalize();
    const forward = new Vector3(direction.x, 0, direction.z).normalize();
    const axis = Vector3.Cross(direction, forward);
    if (axis.lengthSquared() < 1e-8) return;
    const rotation = Quaternion.RotationAxis(axis.normalize(), Math.acos(Math.max(-1, Math.min(1, Vector3.Dot(direction, forward)))) * weight);
    const [left, right] = this.crownHold;
    this.chest.computeWorldMatrix(true);
    left.node.computeWorldMatrix(true);
    right.node.computeWorldMatrix(true);
    const pivot = Vector3.Center(left.node.getAbsolutePosition(), right.node.getAbsolutePosition());
    const delta = Matrix.Translation(-pivot.x, -pivot.y, -pivot.z)
      .multiply(Matrix.Compose(Vector3.One(), rotation, pivot));
    for (const hold of this.crownHold) {
      const { node } = hold;
      hold.position.copyFrom(node.position);
      hold.rotation.copyFrom(node.rotationQuaternion!);
      const local = node.computeWorldMatrix(true).multiply(delta).multiply(node.parent!.getWorldMatrix().clone().invert());
      local.decompose(undefined, node.rotationQuaternion!, node.position);
      node.computeWorldMatrix(true);
    }
    this.crownHoldApplied = true;
  }

  /** The head has its own animated nod, separate from the waist-to-neck lean. Level it
   * after torso steering in every normal posture, retaining its horizontal look direction. */
  private levelHead(): void {
    const head = this.head;
    if (!head) return;
    this.chest.computeWorldMatrix(true);
    this.neck.computeWorldMatrix(true);
    const world = head.computeWorldMatrix(true);
    Vector3.TransformNormalToRef(this.localHeadUp, world, this.headUp);
    Vector3.TransformNormalToRef(this.localForward, world, this.headForward);
    const yaw = Math.hypot(this.headForward.x, this.headForward.z) > 1e-5
      ? Math.atan2(this.headForward.x, this.headForward.z) : this.aimYaw;
    this.headUp.normalize();
    Vector3.CrossToRef(this.headUp, UP, this.headAxis);
    if (this.headAxis.lengthSquared() < 1e-8) return;
    const tilt = Math.acos(Math.max(-1, Math.min(1, this.headUp.y)));
    head.rotate(this.headAxis.normalize(), tilt, Space.WORLD);
    Vector3.TransformNormalToRef(this.localForward, head.computeWorldMatrix(true), this.headForward);
    const turn = wrapAngle(yaw - Math.atan2(this.headForward.x, this.headForward.z));
    if (Math.abs(turn) > 1e-5) head.rotate(UP.clone(), turn, Space.WORLD);
    head.computeWorldMatrix(true);
  }

  /** Biped's local Y runs through the chest; its sign is calibrated against the aimed rifle. */
  private chestYaw(): number {
    this.chest.computeWorldMatrix(true);
    Vector3.TransformNormalToRef(this.localForward, this.chest.getWorldMatrix(), this.chestForward);
    return Math.atan2(this.chestForward.x, this.chestForward.z);
  }

  /**
   * Average yaw the hips face in clip `name`, in the facing node's space (before the clip's facing
   * correction). Samples the clip across its length; the thighs give the hips' left-right axis.
   */
  private hipYaw(name: string): number {
    const group = this.chibi.animationGroup(name);
    const thighs = THIGHS.map((n) => this.chibi.joint(n));
    if (!group || !thighs[0] || !thighs[1]) return 0;
    const facing = this.chibi.facingNode;
    const saved = facing.rotation.y;
    facing.rotation.y = 0;
    // weight -1 applies each frame directly instead of through the scene's blending
    const weight = group.weight;
    group.weight = -1;
    group.start(false, 1, group.from, group.to);
    group.pause();
    const toFacing = facing.computeWorldMatrix(true).clone().invert();
    const a = new Vector3(), b = new Vector3();
    let x = 0, z = 0;
    for (let i = 0; i < 12; i++) {
      group.goToFrame(group.from + (group.to - group.from) * i / 12);
      for (const [n, out] of [[thighs[0], a], [thighs[1], b]] as const) {
        const chain: TransformNode[] = [];
        for (let p: Node | null = n; p; p = p.parent) if (p instanceof TransformNode) chain.unshift(p);
        for (const c of chain) c.computeWorldMatrix(true);
        Vector3.TransformCoordinatesToRef(n.getAbsolutePosition(), toFacing, out);
      }
      // forward = up × (left − right); a mirrored rig flips every clip alike, so differences hold
      const hx = a.x - b.x, hz = a.z - b.z;
      const fx = hz, fz = -hx;
      const l = Math.hypot(fx, fz) || 1;
      x += fx / l;
      z += fz / l;
    }
    group.stop(true);
    group.weight = weight;
    facing.rotation.y = saved;
    return Math.atan2(x, z);
  }

  /** Recompute the gun's world transform; returns the barrel's yaw. */
  private measure(): number {
    for (const n of this.chain) n.computeWorldMatrix(true);
    const [x, y, z] = this.muzzleRef.offset;
    const joint = this.muzzleRef.joint === GUN ? this.gun : this.chibi.joint(this.muzzleRef.joint) ?? this.gun;
    Vector3.TransformCoordinatesFromFloatsToRef(x, y, z, joint.getWorldMatrix(), this.muzzlePoint);
    this.gun.getWorldMatrix().getTranslationToRef(this.gunBase);
    if (/^c019_0[01]$/.test(this.chibi.meta.variant) && this.head) {
      const yaw = this.headYaw();
      this.gunBase.set(this.muzzlePoint.x - Math.sin(yaw), this.muzzlePoint.y, this.muzzlePoint.z - Math.cos(yaw));
    }
    return this.gunYaw();
  }
}
