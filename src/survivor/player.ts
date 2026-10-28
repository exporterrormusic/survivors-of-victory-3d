// The survivor player: WASD movement, a 0.3 s dash, the kit's weapon with its magazine and reload,
// Special and Burst. Twin-stick: she always faces and aims at the cursor while her legs go where
// WASD points (src/survivor/rig.ts does the legs/torso split).

import { TransformNode, Vector3 } from '@babylonjs/core';
import type { Target } from './targets';
import type { Chibi } from '../chibi';
import type { SurvivorInput } from './input';
import type { CharacterKit, KitContext } from './kit';
import { PX } from './kit';
import { TwinStickRig, type Posture } from './rig';
import { spawnAfterimage } from './afterimage';
import { InvincibilityHologram } from './invincibility-hologram';
import type { SnowField } from './snow-field';

const DASH_TIME = .3;
const DASH_SPEED = 800 * PX;
/** recoil clip length (cover_shot is 0.63 s) */
const RECOIL_TIME = .32;
/** the gun holds along a Burst's cone this long (its visual lasts 0.82 s) */
const BURST_HOLD = .8;
const RADIUS = .45;
/** move-speed cut while standing in a Rapture slow zone */
const SNARE_SLOW = .35;
/** Charging talent: seconds to a full weapon charge. */
export const WEAPON_CHARGE_TIME = 1.5;
/** Quick Hands reload time multiplier */
const QUICK_RELOAD = .7;
/** Keep the character upright; camera angle controls how much of her face is visible. */
export const DEFAULT_LEAN = 0;

export class Player {
  groundHeight:(x:number,z:number)=>number=()=>0;
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
  /** Time until another dash may start, measured from dash activation. */
  dashCooldown = 0;
  get dashCooldownDuration(): number { return this.kit.dash?.cooldown ?? 1; }
  damageFlash = 0;
  trainingReset = 0;
  private damageGrace = 0;
  private resistShare = 0;
  private resistTime = 0;
  private translucentGrace = 0;
  private readonly hologram: InvincibilityHologram;
  /** seconds until the weapon can fire again */
  private shotCooldown = 0;
  private firedThisFrame = false;
  private readonly dashDir = new Vector3();
  private afterimageIn = 0;
  private readonly velocity = new Vector3();
  /** Rapture slow zones the player stands in (jammer pools); any one slows by SNARE_SLOW */
  readonly snares = new Set<object>();
  /** actual travel this frame, m/s (for Raptures that lead their shots) */
  get motion(): Readonly<Vector3> { return this.velocity; }
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
  /** max HP last frame, so level growth also adds the new health */
  private grownMaxHp: number;
  /** length of the current reload (Quick Hands shortens it) */
  reloadTime: number;
  /** Seconds without moving or dashing (Snow White's Focus, Rapunzel's Sacred Ground). */
  stillTime = 0;
  /** Seconds without any action at all: moving, shooting, reloading, skills (Scarlet's drink). */
  idleTime = 0;
  /** A passive's looping full-body clip; it replaces the twin-stick pose while set. */
  heldClip: string | null = null;
  /** hold the held clip's last frame instead of looping it */
  heldLast = false;
  private playingHeld: string | null = null;

  constructor(readonly chibi: Chibi, readonly kit: CharacterKit, private readonly ctx: KitContext, private readonly snow?: SnowField) {
    this.hologram = new InvincibilityHologram(chibi);
    this.hp = this.grownMaxHp = this.maxHp;
    this.ammo = kit.weapon.magazine;
    this.reloadTime = kit.weapon.reload;
    this.stand = new TransformNode('player-stand', chibi.root.getScene());
    chibi.root.parent = this.stand;
    chibi.root.position.setAll(0);
    this.lean = DEFAULT_LEAN;
    this.rig = new TwinStickRig(chibi, undefined, kit.aimFacing);
  }

  /** Lean toward the camera, radians (the camera looks along +Z, so the top tips toward −Z). */
  get lean(): number { return -this.stand.rotation.x; }
  set lean(radians: number) { this.stand.rotation.x = -radians; }

  get maxHp(): number { return Math.round(this.kit.weapon.maxHp * this.ctx.run.growth); }
  /** Where the gun points: at the cursor, or along a Burst while it fires. */
  get aimYaw(): number {
    return this.burstHold > 0 ? this.burstYaw : Math.atan2(this.aim.x - this.position.x, this.aim.z - this.position.z);
  }

  damageReflected(target: Target, damage: number): void { this.ctx.run.damage(target, damage, 'effect'); }

  grantInvulnerability(seconds: number, translucent = false): void {
    this.damageGrace = Math.max(this.damageGrace, seconds);
    if (translucent) {
      this.translucentGrace = Math.max(this.translucentGrace, seconds);
      this.hologram.active = true;
    }
  }

  /** Block `share` of incoming damage for `seconds` (the strongest active block wins). */
  grantResist(share: number, seconds: number): void {
    if (this.resistTime <= 0 || share >= this.resistShare) this.resistShare = share;
    this.resistTime = Math.max(this.resistTime, seconds);
  }

  /** `drain`: continuous environmental damage (lake water). No per-frame hit burst or shake;
   * the lake shows its own hit cue once per damage interval. */
  takeDamage(amount: number, environmental=false, drain=false): boolean {
    if (this.resistTime > 0) amount *= 1 - this.resistShare;
    if (this.transported) return false;
    if (amount <= 0 || this.hp <= 0 || (!environmental&&(this.dashing > 0 || this.damageGrace > 0))) return false;
    this.hp = Math.max(0, this.hp - amount);
    // The lake's hurt cue sets the flash on its own rhythm; a per-frame drain never strobes it.
    if (!drain) {
      this.damageGrace = .45;
      this.damageFlash = .25;
      this.ctx.vfx.flashSprite(this.position.add(new Vector3(0, 1, 0)), [1, .15, .12], 1.2, .16, .8, 'star');
      this.ctx.camera.shake(.08, .12);
    }
    if (this.hp === 0) {
      this.trainingReset = 2;
      this.pendingShot = this.pendingBurst = false;
      this.cancelCharges();
    }
    return true;
  }

  /** Before animation: read input, move, act, drive the rig. */
  update(dt: number, input: SurvivorInput, aimPoint: Vector3): void {
    if (this.transported) {
      // Input is locked on the lift, but animation blends must keep advancing.
      // Cancel the dash so it cannot resume when the lift releases the player.
      this.dashing = 0;
      this.velocity.setAll(0);
      this.stillTime = this.idleTime = 0;
      this.rig.update(dt, {
        moveX: 0, moveZ: 0, speed: 0,
        aimYaw: this.rig.legYaw, posture: 'relaxed',
      });
      return;
    }
    if (this.kit.busy) { this.stillTime = this.idleTime = 0; return; }
    const maxHp = this.maxHp;
    if (maxHp > this.grownMaxHp && this.hp > 0) this.hp += maxHp - this.grownMaxHp;
    this.grownMaxHp = maxHp;
    this.damageFlash = Math.max(0, this.damageFlash - dt);
    this.dashCooldown = Math.max(0, this.dashCooldown - dt);
    this.damageGrace = Math.max(0, this.damageGrace - dt);
    this.resistTime = Math.max(0, this.resistTime - dt);
    this.translucentGrace = Math.max(0, this.translucentGrace - dt);
    this.hologram.active = this.translucentGrace > 0;
    this.hologram.update(dt);
    if (this.trainingReset > 0) {
      this.trainingReset = Math.max(0, this.trainingReset - dt);
      if (this.trainingReset === 0) { this.hp = this.maxHp; this.damageGrace = 1.5; }
      this.stillTime = this.idleTime = 0;
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
    let acted = false;
    if (input.wasPressed('reload')) { this.beginReload(); acted = true; }

    // weapon: semi-automatic fires once per click, automatic while held
    const pressed = input.wasPressed('fire');
    const released = input.wasReleased('fire');
    const chargeWeapon = this.ctx.run.talents.has('charging');
    const trigger = pressed || (weapon.automatic && input.isHeld('fire'));
    if (trigger) {
      acted = true;
      if (!weapon.melee && this.ammo <= 0) this.beginReload();
      else if (this.reloading <= 0 && this.shotCooldown <= 0) {
        if (chargeWeapon && input.isHeld('fire')) this.weaponCharge ??= 0;
        else this.fire();
      }
    }
    if (this.weaponCharge !== null) {
      this.weaponCharge = Math.min(WEAPON_CHARGE_TIME, this.weaponCharge + dt);
      if (released || !input.isHeld('fire')) {
        this.fire(this.weaponCharge / WEAPON_CHARGE_TIME);
        this.weaponCharge = null;
      }
    }

    if (input.wasPressed('special')) { this.kit.useSpecial(); acted = true; }
    this.kit.chargeSpecial?.(dt, input.isHeld('special'), input.wasReleased('special'));
    const burstPressed = input.wasPressed('burst');
    if (burstPressed) acted = true;
    if (burstPressed && this.burstHold <= 0 && this.ctx.run.burst >= 100) {
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
    if (input.wasPressed('dash') && this.dashing <= 0 && this.dashCooldown <= 0) {
      acted = true;
      if (mx || mz) this.dashDir.set(mx, 0, mz);
      else this.dashDir.set(Math.sin(this.aimYaw), 0, Math.cos(this.aimYaw));
      this.dashing = this.kit.dash?.duration ?? DASH_TIME;
      this.dashCooldown = this.dashCooldownDuration;
      this.kit.onDash?.();
      this.afterimageIn = 0;
      this.ctx.vfx.ring(this.position, this.kit.accent, .3, 1.1, .3, .6);
      this.ctx.vfx.vapour(this.position, 4, this.kit.accent, .5, .3, .5);
    }
    const dashMovement = this.dashing > 0;
    if (dashMovement) {
      this.dashing -= dt;
      this.dashing = Math.max(0, this.dashing);
      this.velocity.copyFrom(this.dashDir).scaleInPlace(this.kit.dash?.speed ?? DASH_SPEED);
      this.afterimageIn -= dt;
      if (this.afterimageIn <= 0) {
        this.afterimageIn = this.kit.dash?.afterimageInterval ?? .055;
        spawnAfterimage(this.ctx.vfx, this.chibi, this.kit.accent);
      }
    } else {
      const snared = this.snares.size ? 1 - SNARE_SLOW : 1;
      this.velocity.set(mx * weapon.moveSpeed * snared, 0, mz * weapon.moveSpeed * snared);
    }
    this.previousPosition.copyFrom(this.position);
    const river=this.ctx.targets.navigation.storm;
    if(river?.enabled)this.velocity.scaleInPlace(river.travelScale(this.position,{x:this.position.x+this.velocity.x*dt,z:this.position.z+this.velocity.z*dt}));
    const lake=this.ctx.targets.navigation.lake;
    if(lake?.enabled)this.velocity.scaleInPlace(lake.travelScale(this.position,{x:this.position.x+this.velocity.x*dt,z:this.position.z+this.velocity.z*dt}));
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
    this.collide(dashMovement && !!this.kit.dashThroughEnemies);
    const sx=this.position.x-beforeSeparation.x,sz=this.position.z-beforeSeparation.z;
    this.position.copyFrom(beforeSeparation);nav.push(this.position,sx,sz,RADIUS);
    this.position.y=this.groundHeight(this.position.x,this.position.z);
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
      actionSpeed = this.chibi.duration('cover_reload') / this.reloadTime;
    }
    const speed = Math.hypot(this.velocity.x, this.velocity.z);
    const moved = speed > .05 || this.dashing > 0;
    this.stillTime = moved ? 0 : this.stillTime + dt;
    const busy = moved || acted || this.firedThisFrame || this.reloading > 0 || this.burstHold > 0
      || this.weaponCharge !== null || this.burstCharge !== null
      || input.isHeld('fire') || input.isHeld('special') || input.isHeld('burst');
    this.idleTime = busy ? 0 : this.idleTime + dt;
    if (this.heldClip) {
      const key = this.heldLast ? `${this.heldClip}:last` : this.heldClip;
      if (this.playingHeld !== key) {
        this.playingHeld = key;
        this.rig.playFull(this.heldClip, !this.heldLast, this.heldLast);
      }
      this.rig.updateFull(dt);
      this.stand.position.copyFrom(this.position);
      return;
    }
    this.playingHeld = null;
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
    this.kit.previewCharge?.(this.weaponCharge === null ? null : this.weaponCharge / WEAPON_CHARGE_TIME,
      this.burstCharge === null ? null : this.burstCharge / 2.5, this.aimYaw);
    if (this.pendingShot) {
      this.pendingShot = false;
      this.rig.muzzle(this.muzzle);
      // aim from the gun tip at the cursor; a cursor right on top of her fires straight ahead instead
      const target = this.aim.clone();
      const close = Math.hypot(target.x - this.position.x, target.z - this.position.z) < 2.5;
      if (!this.kit.groundTargeted) {
        if (close) target.copyFrom(this.muzzle).addInPlaceFromFloats(Math.sin(this.aimYaw) * 10, 0, Math.cos(this.aimYaw) * 10);
        target.y = this.muzzle.y;
      }
      this.kit.fire(this.muzzle, target, this.pendingShotCharge);
    }
    if (this.pendingBurst) {
      this.pendingBurst = false;
      this.kit.useBurst(this.position, this.burstYaw, this.pendingBurstCharge);
    }
  }

  beginReload(): void {
    if (this.kit.weapon.melee || this.reloading > 0 || this.ammo >= this.kit.weapon.magazine) return;
    this.reloading = this.reloadTime = this.kit.weapon.reload * (this.ctx.run.talents.has('quick_hands') ? QUICK_RELOAD : 1);
    this.weaponCharge = null;
    if (this.kit.reloadSound) this.ctx.sound(this.kit.reloadSound, this.position);
  }

  /** Quick Hands: one round back. A kill by the last round cancels the reload it started. */
  refundRound(): void {
    if (this.kit.weapon.melee || this.ammo >= this.kit.weapon.magazine) return;
    if (this.reloading > 0 && this.ammo === 0) this.reloading = 0;
    if (this.reloading <= 0) this.ammo++;
  }

  cancelCharges(): void {
    this.weaponCharge = this.burstCharge = null;
    this.kit.previewCharge?.(null, null, this.aimYaw);
  }

  /** Snow remains traversable; preset changes keep the player on the arena floor. */
  unstick(): void {
    this.position.y = this.groundHeight(this.position.x,this.position.z);
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
    if (!this.kit.weapon.melee) this.ammo--;
    this.shotCooldown = this.kit.weapon.cooldown;
    this.firedThisFrame = true;
    if (!this.kit.weapon.melee && this.ammo <= 0) this.beginReload();
  }

  private collide(throughEnemies = false): void {
    for (const t of this.ctx.targets.targets) {
      if (throughEnemies || !t.alive) continue;
      const dx = this.position.x - t.position.x, dz = this.position.z - t.position.z;
      const d = Math.hypot(dx, dz), min = RADIUS + t.radius * .8;
      if (d < min && d > 1e-4) {
        this.position.x = t.position.x + dx / d * min;
        this.position.z = t.position.z + dz / d * min;
      }
    }
    const max = this.ctx.targets.navigation.extent - RADIUS;
    const d = Math.hypot(this.position.x, this.position.z);
    if (d > max) this.position.scaleInPlace(max / d);
  }
}
