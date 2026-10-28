// Survivor follow camera: fixed yaw (screen up is world +Z, so WASD maps straight onto the ground),
// close enough that the chibi reads as a character, high enough to see the horde coming.
// Wheel zoom changes distance; pitch eases a little lower as it zooms in.

import { Scene, UniversalCamera, Vector3 } from '@babylonjs/core';
import { clamp } from './math';

const DEG = Math.PI / 180;
export const CAMERA_LIMITS = { min: 9, max: 28, default: 18 };
/**
 * Camera angle settings: pitch at the nearest and farthest zoom (degrees). Lower shows more of the
 * chibi (from above, her hair hides her face whenever she aims away from the camera); higher shows
 * more of the field.
 */
export const CAMERA_ANGLES = {
  high: { label: 'High (most of the field)', near: 50, far: 62 },
  standard: { label: 'Standard', near: 40, far: 56 },
  low: { label: 'Low (more of the character)', near: 32, far: 46 },
  showcase: { label: 'Showcase (lowest)', near: 24, far: 38 },
} as const;
export type CameraAngle = keyof typeof CAMERA_ANGLES;
const PITCH_NEAR = CAMERA_ANGLES.standard.near * DEG;
const PITCH_FAR = CAMERA_ANGLES.standard.far * DEG;
/** aim the camera this far above the feet so the body, not the shoes, sits at screen centre */
const LOOK_HEIGHT = .9;
/** follow stiffness (1/s); high enough that the hero never drifts off-centre while strafing */
const FOLLOW = 14;

export class SurvivorCamera {
  groundHeight:(x:number,z:number)=>number=()=>0;
  readonly camera: UniversalCamera;
  readonly focus = new Vector3();
  /** pitch (radians) at the nearest and farthest zoom */
  pitchNear = PITCH_NEAR;
  pitchFar = PITCH_FAR;
  private dist = CAMERA_LIMITS.default;
  private distTarget = CAMERA_LIMITS.default;
  /** A scripted zoom (zoomTo): eases in and out over its duration; the wheel cancels it. */
  private glide: { from: number; to: number; age: number; time: number } | null = null;
  private shakeTime = 0;
  private shakeStrength = 0;
  private readonly target = new Vector3();
  private held: Vector3 | null = null;
  private heldX = .5;
  private distBeforeHold = CAMERA_LIMITS.default;
  /** A cutscene takes the camera: called after the normal follow, it places the camera itself. */
  override: ((camera: UniversalCamera, dt: number) => void) | null = null;

  constructor(scene: Scene, canvas: HTMLCanvasElement) {
    this.camera = new UniversalCamera('survivor-cam', new Vector3(0, 12, -10), scene);
    this.camera.fov = .72;
    this.camera.minZ = .3;
    this.camera.maxZ = 300;
    this.camera.inputs.clear();
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.glide = null;
      this.distTarget = clamp(this.distTarget * (e.deltaY > 0 ? 1.1 : 1 / 1.1), CAMERA_LIMITS.min, CAMERA_LIMITS.max);
    }, { passive: false });
  }

  /** Actual eased distance, so atmosphere compensation follows the visible zoom. */
  get distance(): number { return this.dist; }

  setAngle(angle: CameraAngle): void {
    this.pitchNear = CAMERA_ANGLES[angle].near * DEG;
    this.pitchFar = CAMERA_ANGLES[angle].far * DEG;
  }

  /** Set an initial framing for large art previews; wheel zoom remains available. */
  setDistance(distance: number): void {
    this.glide = null;
    this.dist = this.distTarget = clamp(distance, CAMERA_LIMITS.min, CAMERA_LIMITS.max);
  }

  /** Glide to a distance over `seconds`, easing in and out (slower and softer than a wheel zoom). */
  zoomTo(distance: number, seconds = 1.8): void {
    this.glide = { from: this.dist, to: clamp(distance, CAMERA_LIMITS.min, CAMERA_LIMITS.max), age: 0, time: seconds };
  }

  /** Brief screen shake; stronger requests override weaker ones. */
  shake(strength: number, seconds: number): void {
    if (strength >= this.shakeStrength * (this.shakeTime > 0 ? 1 : 0)) {
      this.shakeStrength = strength;
      this.shakeTime = seconds;
    }
  }

  snap(to: Vector3): void {
    this.focus.copyFrom(to);
    this.update(0, to);
  }

  /**
   * Hold a close shot of `at` (the results screen), drawn at `screenX` (0–1 across the view)
   * instead of following. Null resumes following at the previous zoom.
   */
  hold(at: Vector3 | null, screenX = .5, distance = CAMERA_LIMITS.min): void {
    if (at && !this.held) this.distBeforeHold = this.distTarget;
    if (!at && this.held) this.distTarget = this.distBeforeHold;
    this.held = at ? (this.held ?? new Vector3()).copyFrom(at) : null;
    this.heldX = screenX;
    if (at) this.distTarget = distance;
  }

  update(dt: number, follow: Vector3): void {
    const k = dt > 0 ? 1 - Math.exp(-FOLLOW * dt) : 1;
    let goalX = follow.x, goalZ = follow.z;
    if (this.held) {
      // The yaw is fixed, so screen x is world x: shift the focus to put the held point at heldX.
      const halfWidth = this.dist * Math.tan(this.camera.fov / 2) * this.camera.getEngine().getAspectRatio(this.camera);
      goalX = this.held.x + (.5 - this.heldX) * 2 * halfWidth;
      goalZ = this.held.z;
    }
    this.focus.x += (goalX - this.focus.x) * k;
    this.focus.z += (goalZ - this.focus.z) * k;
    // Follow terrain descent without tracking the elevator's underground ride.
    const goalY=this.held?this.held.y:this.groundHeight(follow.x,follow.z);
    this.focus.y += (goalY-this.focus.y)*(dt>0?1-Math.exp(-5*dt):1);
    if (this.glide && !this.held) {
      const g = this.glide, t = Math.min(1, (g.age += dt) / g.time), e = t * t * (3 - 2 * t);
      this.dist = this.distTarget = g.from + (g.to - g.from) * e;
      if (t >= 1) this.glide = null;
    } else this.dist += (this.distTarget - this.dist) * (dt > 0 ? Math.min(1, dt * 10) : 1);
    const t = (this.dist - CAMERA_LIMITS.min) / (CAMERA_LIMITS.max - CAMERA_LIMITS.min);
    const pitch = this.pitchNear + (this.pitchFar - this.pitchNear) * t;
    this.target.set(this.focus.x, this.focus.y+LOOK_HEIGHT, this.focus.z);
    if (this.shakeTime > 0) {
      this.shakeTime -= dt;
      const s = this.shakeStrength * Math.max(0, this.shakeTime) * 6;
      this.target.x += (Math.random() - .5) * s;
      this.target.z += (Math.random() - .5) * s;
      if (this.shakeTime <= 0) this.shakeStrength = 0;
    }
    this.camera.position.set(this.target.x, this.target.y + Math.sin(pitch) * this.dist, this.target.z - Math.cos(pitch) * this.dist);
    this.camera.setTarget(this.target);
    this.override?.(this.camera, dt);
  }
}
