// MOBA camera: fixed yaw, wheel zoom, locked to the hero or free with edge pan.
// Pitch follows zoom: zoomed in it drops toward eye level so the chibis' faces show,
// zoomed out it rises to a classic top-down MOBA view. Presets pick the pitch range.

import { Scene, UniversalCamera, Vector3 } from '@babylonjs/core';

const DEG = Math.PI / 180;
const MIN_DIST = 8;
const MAX_DIST = 52;
const EDGE = 14; // px from the window edge that pans a free camera
const PAN_SPEED = 28;

export const CAMERA_PRESETS = {
  dynamic: { label: 'Dynamic (tilts with zoom)', near: 24, far: 58, dist: 15 },
  classic: { label: 'Classic MOBA (~56°)', near: 56, far: 56, dist: 32 },
  low: { label: 'Low / showcase (~30°)', near: 22, far: 34, dist: 12 },
} as const;
export type CameraPreset = keyof typeof CAMERA_PRESETS;

export class MobaCamera {
  readonly camera: UniversalCamera;
  locked = true;
  focus = new Vector3();

  private preset: (typeof CAMERA_PRESETS)[CameraPreset] = CAMERA_PRESETS.dynamic;
  private dist = 15;
  private distTarget = 15;
  private mouse = { x: -1, y: -1, inside: false };
  private keys = new Set<string>();

  constructor(
    scene: Scene,
    private readonly canvas: HTMLCanvasElement,
    private readonly bounds: number,
  ) {
    this.camera = new UniversalCamera('moba-cam', new Vector3(0, 20, -15), scene);
    this.camera.fov = 0.7;
    this.camera.minZ = 0.5;
    this.camera.maxZ = 400;
    this.camera.inputs.clear();

    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.distTarget = clamp(this.distTarget * (e.deltaY > 0 ? 1.12 : 1 / 1.12), MIN_DIST, MAX_DIST);
    }, { passive: false });
    canvas.addEventListener('pointermove', (e) => {
      this.mouse.x = e.offsetX;
      this.mouse.y = e.offsetY;
      this.mouse.inside = true;
    });
    canvas.addEventListener('pointerleave', () => (this.mouse.inside = false));
    window.addEventListener('keydown', (e) => this.keys.add(e.code));
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  setPreset(name: CameraPreset): void {
    this.preset = CAMERA_PRESETS[name];
    this.distTarget = this.preset.dist;
  }

  update(dt: number, hero: Vector3): void {
    if (this.locked || this.keys.has('Space')) {
      this.focus.copyFrom(hero);
    } else {
      let dx = 0;
      let dz = 0;
      const { x, y, inside } = this.mouse;
      const w = this.canvas.clientWidth;
      const h = this.canvas.clientHeight;
      if (inside && x <= EDGE) dx -= 1;
      if (inside && x >= w - EDGE) dx += 1;
      if (inside && y <= EDGE) dz += 1;
      if (inside && y >= h - EDGE) dz -= 1;
      if (this.keys.has('ArrowLeft')) dx -= 1;
      if (this.keys.has('ArrowRight')) dx += 1;
      if (this.keys.has('ArrowUp')) dz += 1;
      if (this.keys.has('ArrowDown')) dz -= 1;
      this.focus.x = clamp(this.focus.x + dx * PAN_SPEED * dt, -this.bounds, this.bounds);
      this.focus.z = clamp(this.focus.z + dz * PAN_SPEED * dt, -this.bounds, this.bounds);
    }

    this.dist += (this.distTarget - this.dist) * Math.min(1, dt * 12);
    const t = (this.dist - MIN_DIST) / (MAX_DIST - MIN_DIST);
    const pitch = (this.preset.near + (this.preset.far - this.preset.near) * t) * DEG;
    // aim a little higher when low so the hero isn't framed by her feet
    const target = this.focus.add(new Vector3(0, 0.9 + (1 - t) * 0.4, 0));
    this.camera.position.set(
      target.x,
      target.y + Math.sin(pitch) * this.dist,
      target.z - Math.cos(pitch) * this.dist,
    );
    this.camera.setTarget(target);
  }
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
