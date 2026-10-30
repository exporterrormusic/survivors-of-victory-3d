import { Vector3 } from '@babylonjs/core';
import { loadControlSettings } from '../frontend/settings/GameSettings';
import type { SurvivorCamera } from './camera';
import type { SurvivorInput } from './input';
import type { Player } from './player';
import { firstPersonClearance } from './first-person-clearance';
import { firstPersonArms } from './first-person-arms';

/** Local presentation only: network peers continue to see the complete animated chibi. */
export class FirstPersonView {
  enabled = false;
  yaw = 0;
  pitch = .12;
  private readonly heldAlt = new Set<string>();
  private readonly events = new AbortController();
  private readonly headScale = new Vector3();
  private headHidden = false;
  private wasActive = false;
  private cursorReleased = false;
  private pointerLocked = false;
  private intentionalUnlock = false;
  private escapeUnlock = false;
  private menuRequested = false;
  private readonly lookTarget = new Vector3();
  /** Calibrate once per character; attack/run animation must not move the viewpoint. */
  private eyeHeight: number | null = null;
  private readonly head;
  private readonly hideArms: (hidden: boolean) => void;

  constructor(private readonly canvas: HTMLCanvasElement, private readonly follow: SurvivorCamera,
    private readonly input: SurvivorInput, private readonly player: Player,
    private readonly available: () => boolean,
    private readonly openMenu: () => void = () => input.trigger('openMenu')) {
    this.head = player.chibi.joint('Bip001 Head');
    this.hideArms = /^(c222_0[01]|c225_0[01]|c472_00)$/.test(player.chibi.meta.variant)
      ? firstPersonArms(player.chibi.meshes) : () => {};
    firstPersonClearance(player.chibi.meshes, () => this.active, follow.camera.position);
    const options = { signal: this.events.signal };
    // Browsers can consume Escape to exit pointer lock without delivering keydown.
    // Treat that exit as an idempotent menu-open request, never a menu toggle.
    document.addEventListener('pointerlockchange', () => {
      const locked = document.pointerLockElement === canvas;
      if (this.pointerLocked && !locked && !this.intentionalUnlock && this.active && this.input.enabled) {
        this.escapeUnlock = true;
        this.requestMenu();
      }
      this.pointerLocked = locked;
      this.intentionalUnlock = false;
      if (locked) this.escapeUnlock = false;
    }, options);
    window.addEventListener('keydown', e => {
      if (e.code !== 'Escape' || (!this.pointerLocked && !this.escapeUnlock)) return;
      e.preventDefault(); e.stopImmediatePropagation();
      if (!e.repeat) this.requestMenu();
    }, { ...options, capture: true });
    window.addEventListener('keyup', e => { if (e.code === 'Escape') this.escapeUnlock = false; }, options);
    window.addEventListener('keydown', e => {
      if (e.code === 'AltLeft' || e.code === 'AltRight') {
        if (this.active) { e.preventDefault(); this.heldAlt.add(e.code); this.input.clear(); this.sync(); }
        return;
      }
      if (e.code !== 'KeyV' || e.repeat || e.ctrlKey || e.altKey || e.metaKey ||
        (e.target instanceof HTMLElement && e.target.closest('input,textarea,select,button,[contenteditable="true"]'))) return;
      // Respect a user's existing custom gameplay binding.
      if (Object.values(loadControlSettings().bindings).some(b => b.device === 'keyboard' && b.keyCode === 86)) return;
      this.toggle();
    }, options);
    window.addEventListener('keyup', e => {
      if (!this.heldAlt.delete(e.code)) return;
      e.preventDefault(); this.sync();
      if (!this.heldAlt.size && this.active) this.capture();
    }, options);
    window.addEventListener('blur', () => { this.heldAlt.clear(); this.input.clear(); this.release(); this.sync(); }, options);
    canvas.addEventListener('pointerdown', () => { if (this.active) this.capture(); }, options);
    document.addEventListener('mousemove', e => {
      if (!this.active || this.menuRequested || !this.input.enabled || this.heldAlt.size || document.pointerLockElement !== canvas) return;
      this.yaw += e.movementX * .002;
      this.pitch = Math.max(-.9, Math.min(.9, this.pitch + e.movementY * .002));
    }, options);
    const scene = player.chibi.root.getScene();
    scene.onBeforeRenderObservable.add(() => this.render());
    scene.onAfterRenderObservable.add(() => this.restoreHead());
    scene.onDisposeObservable.addOnce(() => {
      this.hideArms(false);
      this.restoreHead(); this.release(); this.events.abort(); this.canvas.classList.remove('first-person-cursor'); this.input.mouseSuppressed = false;
    });
  }

  get active(): boolean { return this.enabled && !this.follow.scripted && this.available(); }

  toggle(): void {
    if (!this.input.enabled) return;
    if (!this.available() && !this.enabled) return;
    this.enabled = !this.enabled;
    if (this.enabled) { this.yaw = this.player.aimYaw; this.pitch = .12; this.capture(); }
    else { this.release(); this.follow.snap(this.player.position); }
    this.sync();
  }

  private capture(): void {
    if (this.active && this.input.enabled && !this.heldAlt.size && document.pointerLockElement !== this.canvas) {
      try { void this.canvas.requestPointerLock()?.catch(() => {}); } catch { /* Click canvas to retry. */ }
    }
  }
  private requestMenu(): void {
    if (this.menuRequested) return;
    // Freeze look and open the DOM menu in the input event, before the next paint.
    this.menuRequested = true;
    this.openMenu();
    this.sync();
  }
  resumeMouseLook(): void { this.menuRequested = false; this.sync(); this.capture(); }
  private release(): void {
    if (document.pointerLockElement === this.canvas) {
      this.intentionalUnlock = true;
      document.exitPointerLock();
    }
  }
  sync(): void {
    const active = this.active;
    this.input.viewYaw = active ? this.yaw : null;
    this.input.mouseSuppressed = active && (!this.input.enabled || this.heldAlt.size > 0);
    // classList.toggle mutates the attribute even when its value is unchanged.
    // Do not invalidate canvas styles several times per frame during mouse-look.
    if (this.cursorReleased !== this.input.mouseSuppressed) {
      this.cursorReleased = this.input.mouseSuppressed;
      this.canvas.classList.toggle('first-person-cursor', this.cursorReleased);
    }
    if (!active || !this.input.enabled || this.heldAlt.size) this.release();
  }

  aim(point: Vector3): boolean {
    if (!this.active) return false;
    // Combat is planar: intersect the crosshair with the weapon's existing aim plane.
    // Looking near/above the horizon uses a finite forward target, never a point behind us.
    const height = this.player.kit.groundTargeted ? 0 : 1.1;
    const eyeHeight = this.follow.camera.position.y - this.player.position.y;
    const distance = Math.max(2, Math.min(80, this.pitch > .015 ? (eyeHeight - height) / Math.tan(this.pitch) : 80));
    point.set(this.player.position.x + Math.sin(this.yaw) * distance,
      this.player.position.y + height, this.player.position.z + Math.cos(this.yaw) * distance);
    return true;
  }

  updateCamera(): void {
    this.sync();
    const camera = this.follow.camera;
    if (this.active || this.wasActive) {
      camera.minZ = this.active ? .025 : .3;
      camera.fov = this.active ? 1.25 : .72;
    }
    if (this.wasActive && !this.active && !this.follow.scripted) this.follow.snap(this.player.position);
    this.wasActive = this.active;
    if (!this.active) return;
    // Follow the gameplay position, not the animated head. Scarlet's sword swings
    // and running poses move the head substantially on all three axes. Retain a
    // character-specific eye height across toggles and cutscenes without head bob.
    if (this.eyeHeight === null) {
      const height = this.head ? this.head.getAbsolutePosition().y - this.player.position.y + .12 : 1.62;
      this.eyeHeight = Number.isFinite(height) && height > .3 ? height : 1.62;
    }
    camera.position.copyFrom(this.player.position).addInPlaceFromFloats(
      Math.sin(this.yaw) * .12, this.eyeHeight, Math.cos(this.yaw) * .12);
    this.lookTarget.copyFrom(camera.position).addInPlaceFromFloats(
      Math.sin(this.yaw) * Math.cos(this.pitch), -Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch));
    camera.setTarget(this.lookTarget);
  }

  private render(): void {
    this.updateCamera();
    this.hideArms(this.active);
    if (!this.active) return;
    // Collapse only the head subtree during drawing, preserving arms, weapon and gameplay joints.
    if (this.head) {
      this.headScale.copyFrom(this.head.scaling); this.head.scaling.setAll(.0001);
      this.head.computeWorldMatrix(true); this.headHidden = true;
    }
  }
  private restoreHead(): void {
    if (this.headHidden && this.head) { this.head.scaling.copyFrom(this.headScale); this.head.computeWorldMatrix(true); }
    this.headHidden = false;
  }
}
