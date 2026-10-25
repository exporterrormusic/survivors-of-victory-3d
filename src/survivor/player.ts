// The survivor player: WASD movement, a 0.3 s dash, the kit's weapon with its magazine and reload,
// Special and Burst. Twin-stick: she always faces and aims at the cursor while her legs go where
// WASD points (src/survivor/rig.ts does the legs/torso split).

import { TransformNode, Vector3 } from '@babylonjs/core';
import type { Chibi } from '../chibi';
import type { SurvivorInput } from './input';
import type { CharacterKit, KitContext } from './kit';
import { PX } from './kit';
import { TwinStickRig, type Posture } from './rig';
import { spawnAfterimage } from './afterimage';
import { ARENA_RADIUS } from './arena';
import type { SnowField } from './snow-field';

const DASH_TIME = .3;
const DASH_SPEED = 800 * PX;
/** recoil clip length (cover_shot is 0.63 s) */
const RECOIL_TIME = .32;
/** the gun holds along a Burst's cone this long (its visual lasts 0.82 s) */
const BURST_HOLD = .8;
const RADIUS = .45;
/** Keep the character upright; camera angle controls how much of her face is visible. */
export const DEFAULT_LEAN = 0;

export class Player {
  transported = false;
  /** Elevator owns the pose while boarding/travelling; normal movement resumes at the surface. */
  setTransportPose(height: number, hidden: boolean): void {
    this.position.y=height;this.stand.position.copyFrom(this.position);
    this.chibi.root.setEnabled(!hidden);
    this.pendingShot=false;this.pendingBurst=false;this.cancelCharges();
  }
  readonly position = new Vector3();
  hp: number;
  ammo: number;
  reloading = 0;
  dashing = 0;
  damageFlash = 0;
  trainingReset = 0;
  private damageGrace = 0;
  /** seconds until the weapon can fire again */
  private shotCooldown = 0;
  private firedThisFrame = false;
  private readonly dashDir = new Vector3();
  private afterimageIn = 0;
  private readonly velocity = new Vector3();
  private readonly previousPosition = new Vector3();
  readonly rig: TwinStickRig;
  /** parent of the model: carries the position and the presentation lean */
  private readonly stand: TransformNode;
  /** cursor point at muzzle height */
  readonly aim = new Vector3(0, 1, 5);
  private readonly muzzle = new Vector3();
  /** A shot or Burst waits until after this frame's animation, when the gun is raised and aimed. */
  private pendingShot = false;
  private pendingBurst = false;
  /** while > 0 the aim is held on burstYaw */
  private burstHold = 0;
  private burstYaw = 0;
  /** Seconds held, or null when idle (also used by the HUD). */
  weaponCharge: number | null = null;
  burstCharge: number | null = null;
  private pendingShotCharge = 0;
  private pendingBurstCharge = 0;

  constructor(readonly chibi: Chibi, readonly kit: CharacterKit, private readonly ctx: KitContext, private readonly snow?: SnowField) {
    this.hp = kit.weapon.maxHp;
    this.ammo = kit.weapon.magazine;
    this.stand = new TransformNode('player-stand', chibi.root.getScene());
    chibi.root.parent = this.stand;
    chibi.root.position.setAll(0);
    this.lean = DEFAULT_LEAN;
    this.rig = new TwinStickRig(chibi);
  }

  /** Lean toward the camera, radians (the camera looks along +Z, so the top tips toward −Z). */
  get lean(): number { return -this.stand.rotation.x; }
  set lean(radians: number) { this.stand.rotation.x = -radians; }

  get maxHp(): number { return this.kit.weapon.maxHp; }
  /** Where the gun points: at the cursor, or along a Burst while it fires. */
  get aimYaw(): number {
    return this.burstHold > 0 ? this.burstYaw : Math.atan2(this.aim.x - this.position.x, this.aim.z - this.position.z);
  }

  takeDamage(amount: number): boolean {
    if (this.transported) return false;
    if (amount <= 0 || this.hp <= 0 || this.dashing > 0 || this.damageGrace > 0) return false;
    this.hp = Math.max(0, this.hp - amount);
    this.damageGrace = .45;
    this.damageFlash = .25;
    this.ctx.vfx.flashSprite(this.position.add(new Vector3(0, 1, 0)), [1, .15, .12], 1.2, .16, .8, 'star');
    this.ctx.camera.shake(.08, .12);
    if (this.hp === 0) {
      this.trainingReset = 2;
      this.pendingShot = this.pendingBurst = false;
      this.cancelCharges();
    }
    return true;
  }

  /** Before animation: read input, move, act, drive the rig. */
  update(dt: number, input: SurvivorInput, aimPoint: Vector3): void {
    if (this.transported) return;
    this.damageFlash = Math.max(0, this.damageFlash - dt);
    this.damageGrace = Math.max(0, this.damageGrace - dt);
    if (this.trainingReset > 0) {
      this.trainingReset = Math.max(0, this.trainingReset - dt);
      if (this.trainingReset === 0) { this.hp = this.maxHp; this.damageGrace = 1.5; }
      return;
    }
    this.aim.copyFrom(aimPoint);
    const weapon = this.kit.weapon;
    this.shotCooldown = Math.max(0, this.shotCooldown - dt);
    this.burstHold = Math.max(0, this.burstHold - dt);
    this.firedThisFrame = false;

    // reload
    if (this.reloading > 0) {
      this.reloading -= dt;
      if (this.reloading <= 0) {
        this.reloading = 0;
        this.ammo = weapon.magazine;
      }
    }
    if (input.wasPressed('reload')) this.beginReload();

    // weapon: semi-automatic fires once per click, automatic while held
    const pressed = input.wasPressed('fire');
    const released = input.wasReleased('fire');
    const chargeWeapon = this.ctx.run.talents.has('charging');
    const trigger = pressed || (weapon.automatic && input.isHeld('fire'));
    if (trigger) {
      if (this.ammo <= 0) this.beginReload();
      else if (this.reloading <= 0 && this.shotCooldown <= 0) {
        if (chargeWeapon && input.isHeld('fire')) this.weaponCharge ??= 0;
        else this.fire();
      }
    }
    if (this.weaponCharge !== null) {
      this.weaponCharge = Math.min(3, this.weaponCharge + dt);
      if (released || !input.isHeld('fire')) {
        this.fire(this.weaponCharge / 3);
        this.weaponCharge = null;
      }
    }

    if (input.wasPressed('special')) this.kit.useSpecial();
    if (input.wasPressed('burst') && this.burstHold <= 0 && this.ctx.run.burst >= 100) {
      if (this.ctx.run.talents.has('focused_fire') && input.isHeld('burst')) this.burstCharge ??= 0;
      else this.fireBurst(0);
    }
    const burstReleased = input.wasReleased('burst');
    if (this.burstCharge !== null) {
      this.burstCharge = Math.min(2.5, this.burstCharge + dt);
      if (burstReleased || !input.isHeld('burst')) {
        this.fireBurst(this.burstCharge / 2.5);
        this.burstCharge = null;
      }
    }

    // movement and dash
    const [mx, mz] = input.move();
    if (input.wasPressed('dash') && this.dashing <= 0) {
      if (mx || mz) this.dashDir.set(mx, 0, mz);
      else this.dashDir.set(Math.sin(this.aimYaw), 0, Math.cos(this.aimYaw));
      this.dashing = DASH_TIME;
      this.afterimageIn = 0;
      this.ctx.vfx.ring(this.position, this.kit.accent, .3, 1.1, .3, .6);
      this.ctx.vfx.vapour(this.position, 4, this.kit.accent, .5, .3, .5);
    }
    if (this.dashing > 0) {
      this.dashing -= dt;
      this.velocity.copyFrom(this.dashDir).scaleInPlace(DASH_SPEED);
      this.afterimageIn -= dt;
      if (this.afterimageIn <= 0) {
        this.afterimageIn = .055;
        spawnAfterimage(this.ctx.vfx, this.chibi, this.kit.accent);
      }
    } else {
      this.velocity.set(mx * weapon.moveSpeed, 0, mz * weapon.moveSpeed);
    }
    this.previousPosition.copyFrom(this.position);
    if (this.snow?.enabled) this.snow.move(this.position, this.velocity.x * dt, this.velocity.z * dt, RADIUS);
    else this.position.addInPlace(this.velocity.scale(dt));
    // Sweep the requested travel, including dash and snow resistance, against the
    // same cover used by AI routes. Never teleport through a thin wall.
    const dx=this.position.x-this.previousPosition.x,dz=this.position.z-this.previousPosition.z;
    this.position.copyFrom(this.previousPosition);
    const nav=this.ctx.targets.navigation;
    if(!nav.clear(this.position,this.position,RADIUS)){
      const safe=nav.project(this.position,RADIUS);this.position.x=safe.x;this.position.z=safe.z;
    }
    nav.push(this.position,dx,dz,RADIUS);
    const beforeSeparation=this.position.clone();
    this.collide();
    const sx=this.position.x-beforeSeparation.x,sz=this.position.z-beforeSeparation.z;
    this.position.copyFrom(beforeSeparation);nav.push(this.position,sx,sz,RADIUS);
    // Leave a contact trail at the final position after unit separation.
    if (this.snow?.enabled) {
      this.snow.trail(this.previousPosition, this.position);
    }
    // Animate actual travel, including slowing in snow.
    if (dt > 0) this.position.subtractToRef(this.previousPosition, this.velocity).scaleInPlace(1 / dt);
    else this.velocity.setAll(0);

    // arms
    let posture: Posture = 'aim';
    let actionSpeed = 1;
    // The last round starts the reload timer immediately, but must still leave an aimed rifle.
    // Let its shot pose win this frame; the reload pose begins on the next update.
    if (this.firedThisFrame) {
      posture = 'shot';
      actionSpeed = this.chibi.duration('cover_shot') / RECOIL_TIME;
    } else if (this.reloading > 0) {
      posture = 'reload';
      actionSpeed = this.chibi.duration('cover_reload') / weapon.reload;
    }
    const speed = Math.hypot(this.velocity.x, this.velocity.z);
    this.rig.update(dt, {
      moveX: speed > 0 ? this.velocity.x / speed : 0,
      moveZ: speed > 0 ? this.velocity.z / speed : 0,
      speed,
      aimYaw: this.aimYaw,
      posture,
      actionSpeed,
    });
    this.stand.position.copyFrom(this.position);
  }

  /** After animation: aim the torso, then release anything fired this frame from the real gun tip. */
  afterAnimation(): void {
    if (this.transported) return;
    this.rig.applyAim();
    if (this.pendingShot) {
      this.pendingShot = false;
      this.rig.muzzle(this.muzzle);
      // aim from the gun tip at the cursor; a cursor right on top of her fires straight ahead instead
      const target = this.aim.clone();
      const close = Math.hypot(target.x - this.position.x, target.z - this.position.z) < 2.5;
      if (close) target.copyFrom(this.muzzle).addInPlaceFromFloats(Math.sin(this.aimYaw) * 10, 0, Math.cos(this.aimYaw) * 10);
      target.y = this.muzzle.y;
      this.kit.fire(this.muzzle, target, this.pendingShotCharge);
    }
    if (this.pendingBurst) {
      this.pendingBurst = false;
      this.kit.useBurst(this.position, this.burstYaw, this.pendingBurstCharge);
    }
  }

  beginReload(): void {
    if (this.reloading > 0 || this.ammo >= this.kit.weapon.magazine) return;
    this.reloading = this.kit.weapon.reload;
    this.weaponCharge = null;
    if (this.kit.reloadSound) this.ctx.sound(this.kit.reloadSound, this.position);
  }

  cancelCharges(): void { this.weaponCharge = this.burstCharge = null; }

  /** Snow remains traversable; preset changes keep the player on the arena floor. */
  unstick(): void {
    this.position.y = 0;
    this.stand.position.copyFrom(this.position);
  }

  private fireBurst(charge: number): void {
    if (!this.ctx.run.spendBurst()) return;
    this.burstYaw = this.aimYaw;
    this.burstHold = BURST_HOLD;
    this.pendingBurstCharge = charge;
    this.pendingBurst = true;
    this.firedThisFrame = true;
  }

  private fire(charge = 0): void {
    this.pendingShot = true;
    this.pendingShotCharge = charge;
    this.ammo--;
    this.shotCooldown = this.kit.weapon.cooldown;
    this.firedThisFrame = true;
    if (this.ammo <= 0) this.beginReload();
  }

  private collide(): void {
    for (const t of this.ctx.targets.targets) {
      if (!t.alive) continue;
      const dx = this.position.x - t.position.x, dz = this.position.z - t.position.z;
      const d = Math.hypot(dx, dz), min = RADIUS + t.radius * .8;
      if (d < min && d > 1e-4) {
        this.position.x = t.position.x + dx / d * min;
        this.position.z = t.position.z + dz / d * min;
      }
    }
    const max = ARENA_RADIUS - RADIUS;
    const d = Math.hypot(this.position.x, this.position.z);
    if (d > max) this.position.scaleInPlace(max / d);
  }
}
