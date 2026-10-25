// Snow White's Special, Auto-Turret (Survivors' SnowWhiteTurretSystem.ts): two charges, one back
// every 8 s. A turret lands beside her with four missiles and fires a volley of up to two homing
// missiles at the nearest Raptures every 2 s; each bursts for half her base damage. Out of
// missiles, it powers down and folds away.
//
// Primitive-built Seven Dwarves launcher and textured physical rockets live in weapon-models.ts.

import {
  Color4, DynamicTexture, Mesh, ParticleSystem, Quaternion, TransformNode, Vector3,
} from '@babylonjs/core';
import { SFX } from '../../audio/sound-bank';
import { PX, type KitContext, type SpecialState } from '../kit';
import type { Target } from '../targets';
import { SNOW } from './palette';
import { rocketImpact } from './rocket-impact';
import { snowShieldsTarget, targetContact } from '../projectile-collision';
import { turnToward } from '../math';
import { buildSnowWhiteLauncher, buildSnowWhiteMissile, ROCKET_COLORS, weaponMaterials } from './weapon-models';

const BASE_CHARGES = 2;
const AMMO = 4;
const RECHARGE = 8;
const FIRE_INTERVAL = 2;
/** lands 72-92 px from her (Survivors), pushed out a little so it clears a 3D chibi */
const DEPLOY_MIN = 92 * PX, DEPLOY_MAX = 120 * PX;
const MISSILE_RADIUS = 120 * PX;
const MISSILE_START = 300 * PX, MISSILE_MAX = 2500 * PX, MISSILE_ACCEL = 1200 * PX, MISSILE_TURN = 6.5;
const MISSILE_LIFE = 3.2;
const SMOKE_LIFE = 1.15;
const DROP = .35; // seconds to land

interface Turret {
  root: TransformNode;
  /** turns to track */
  yaw: TransformNode;
  /** recoils along the barrel */
  head: TransformNode;
  sockets: TransformNode[];
  caps: Mesh[];
  pips: Mesh[];
  ammo: number;
  fireIn: number;
  age: number;
  retiring: number;
  kick: number;
  meshes: Mesh[];
  scan: number;
  capacity: number;
  reload: number;
  auraIn: number;
}

interface Missile {
  body: TransformNode;
  smoke: ParticleSystem;
  exhaust: TransformNode;
  previousExhaust: Vector3;
  flame: Mesh;
  velocity: Vector3;
  speed: number;
  target: Target | null;
  life: number;
}

export class SnowWhiteTurrets {
  private charges = BASE_CHARGES;
  private recharge = 0;
  private readonly turrets: Turret[] = [];
  private readonly missiles: Missile[] = [];
  private readonly materials: ReturnType<typeof weaponMaterials>;
  private readonly smokeTexture: DynamicTexture;

  constructor(private readonly ctx: KitContext, private readonly baseDamage: number) {
    this.materials = weaponMaterials(ctx.scene);
    this.smokeTexture = new DynamicTexture('sw-rocket-smoke', 64, ctx.scene, false);
    const paint = this.smokeTexture.getContext();
    const gradient = paint.createRadialGradient(32, 32, 2, 32, 32, 31);
    gradient.addColorStop(0, 'rgba(255,255,255,.95)');
    gradient.addColorStop(.35, 'rgba(255,255,255,.72)');
    gradient.addColorStop(.7, 'rgba(255,255,255,.22)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    paint.fillStyle = gradient; paint.fillRect(0, 0, 64, 64);
    this.smokeTexture.hasAlpha = true; this.smokeTexture.update();
  }

  private get maxCharges(): number { return BASE_CHARGES + (this.ctx.run.talents.has('special_count') ? 2 : 0); }
  private get capacity(): number { return AMMO + (this.ctx.run.talents.has('special_capacity') ? 4 : 0); }

  state(): SpecialState {
    return { charges: this.charges, maxCharges: this.maxCharges, progress: this.charges >= this.maxCharges ? 1 : 1 - this.recharge / RECHARGE };
  }

  use(): boolean {
    if (this.charges <= 0) return false;
    const angle = Math.random() * Math.PI * 2;
    const distance = DEPLOY_MIN + Math.random() * (DEPLOY_MAX - DEPLOY_MIN);
    const p = this.ctx.playerPosition;
    this.deploy(new Vector3(p.x + Math.sin(angle) * distance, 0, p.z + Math.cos(angle) * distance));
    this.charges--;
    if (this.recharge <= 0) this.recharge = RECHARGE;
    return true;
  }

  update(dt: number): void {
    if (this.charges < this.maxCharges) {
      if (this.recharge <= 0) this.recharge = RECHARGE;
      this.recharge -= dt;
      if (this.recharge <= 0) {
        this.charges++;
        this.recharge = this.charges < this.maxCharges ? RECHARGE : 0;
      }
    }
    this.updateTurrets(dt);
    this.updateMissiles(dt);
  }

  deployPerimeter(): void {
    const center = this.ctx.camera.focus;
    for (let i = 0; i < 4; i++) {
      const angle = i * Math.PI / 2 + .3 + Math.random() * .4;
      const radius = 8 + Math.random() * 2;
      this.deploy(new Vector3(center.x + Math.sin(angle) * radius, 0, center.z + Math.cos(angle) * radius), 4);
    }
  }

  // --- turrets ------------------------------------------------------------------

  private deploy(at: Vector3, cap = this.maxCharges): void {
    const { vfx } = this.ctx;
    const active = this.turrets.filter((t) => !t.retiring);
    while (active.length >= cap) this.retire(active.shift()!);
    const t = this.build(at);
    this.turrets.push(t);
    // a cyan beacon marks the landing spot while it drops in
    vfx.ring(at, SNOW.cyan, .55, .7, DROP, .7);
    vfx.groundGlow(at, SNOW.bloom, .9, DROP + .2, .5);
  }

  private retire(t: Turret): void {
    if (t.retiring) return;
    t.retiring = .001;
    if (this.ctx.run.talents.has('detonation')) this.explode(t.root.position.clone(), 3, 3);
  }

  private land(t: Turret): void {
    const { vfx, camera } = this.ctx;
    const at = t.root.position;
    vfx.ring(at, SNOW.cyan, .4, 1.6, .4, 1);
    vfx.ring(at, SNOW.outer, .3, 2.4, .55, .45);
    vfx.flashSprite(at.add(new Vector3(0, .25, 0)), SNOW.cyan, 2.2, .22, .55);
    vfx.sparks(at.add(new Vector3(0, .1, 0)), 18, SNOW.cyan, SNOW.core, 5, null, 1, .9);
    vfx.vapour(at, 6, SNOW.outer, .7, .35, .7);
    vfx.flash(at.add(new Vector3(0, .5, 0)), SNOW.cyan, 2, 6, .25);
    camera.shake(.05, .12);
  }

  private updateTurrets(dt: number): void {
    const { targets, vfx } = this.ctx;
    for (let i = this.turrets.length - 1; i >= 0; i--) {
      const t = this.turrets[i];
      t.age += dt;
      // drop in with a little overshoot
      if (t.age < DROP) {
        const k = t.age / DROP;
        t.root.position.y = 3.2 * (1 - k) * (1 - k);
        const s = .55 + .45 * k;
        t.root.scaling.setAll(s);
        continue;
      }
      if (t.root.position.y !== 0) {
        t.root.position.y = 0;
        t.root.scaling.setAll(1);
        this.land(t);
      }
      if (t.retiring > 0) {
        t.retiring += dt;
        const k = Math.min(1, (t.retiring - .35) / .3);
        if (k > 0) {
          t.root.scaling.set(1 - k * .45, 1 - k, 1 - k * .45);
          if (t.retiring - dt <= .35) {
            vfx.vapour(t.root.position, 6, SNOW.shadow, .7, .5, .8);
            vfx.flashSprite(t.root.position.add(new Vector3(0, .4, 0)), SNOW.outer, 1.6, .25, .4);
          }
        }
        if (k >= 1) {
          for (const m of t.meshes) m.dispose();
          t.root.dispose();
          this.turrets.splice(i, 1);
        }
        continue;
      }
      if (t.capacity < this.capacity) {
        t.ammo += this.capacity - t.capacity;
        t.capacity = this.capacity;
        this.updatePips(t);
      }
      if (this.ctx.run.talents.has('defensive_line')) {
        t.auraIn -= dt;
        if (t.auraIn <= 0) {
          t.auraIn = 1;
          const red = [1, .2, .18] as const;
          vfx.ring(t.root.position, red, 2.8, 3.2, 1, .45);
          for (const target of targets.inRadius(t.root.position, 3.2)) this.ctx.run.damage(target, this.baseDamage * .5, 'special');
        }
      }
      if (t.reload > 0) {
        t.reload -= dt;
        if (t.reload <= 0) { t.ammo = t.capacity; this.updatePips(t); }
        else continue;
      }
      const head = t.yaw.position.add(t.root.position);
      const aims = targets.nearest(head, 2);
      const yaw = t.yaw.rotation.y;
      let want = yaw;
      if (aims[0]) want = Math.atan2(aims[0].position.x - head.x, aims[0].position.z - head.z);
      else { t.scan += dt; want = yaw + Math.sin(t.scan * .8) * dt * .6; }
      t.yaw.rotation.y = turnToward(yaw, want, dt * 8);
      t.kick = Math.max(0, t.kick - dt * 6);
      t.head.position.z = -t.kick * .08;
      t.fireIn -= dt;
      if (t.fireIn > 0 || aims.length === 0) continue;
      t.fireIn = FIRE_INTERVAL;
      const volley = Math.min(2, t.ammo, aims.length);
      for (let s = 0; s < volley; s++) this.launch(t, aims[s], s === 0 ? -1 : 1);
      t.kick = 1;
      t.ammo -= volley;
      this.updatePips(t);
      this.ctx.sound(SFX.snowWhiteTurretFire, head, 1.6);
      if (t.ammo <= 0) {
        if (this.ctx.run.talents.has('permanent_emplacement')) t.reload = 6;
        else this.retire(t);
      }
    }
  }

  private updatePips(t: Turret): void {
    t.pips.forEach((pip, n) => {
      pip.setEnabled(n < t.capacity);
      pip.position.x = (n % 4 - 1.5) * .057;
      pip.material = n < t.ammo ? this.materials.lamp : this.materials.spent;
    });
    // Capacity upgrades feed reserve rounds through the six physical chambers.
    const loaded = new Set<number>();
    for (let shot = t.capacity - t.ammo; shot < t.capacity; shot++) loaded.add((shot % 2) * 3 + Math.floor(shot / 2) % 3);
    t.caps.forEach((cap, n) => cap.setEnabled(loaded.has(n)));
  }

  private build(at: Vector3): Turret {
    const model = buildSnowWhiteLauncher(this.ctx.scene, {
      shadows: this.ctx.shadows, glow: (mesh) => this.ctx.vfx.glowMesh(mesh),
    });
    model.root.position.copyFrom(at); model.root.position.y = 3.2;
    model.yaw.rotation.y = Math.random() * Math.PI * 2;
    const turret = { ...model, ammo: this.capacity, capacity: this.capacity, reload: 0, auraIn: 0,
      fireIn: .35 + Math.random() * .3 + DROP, age: 0, retiring: 0, kick: 0, scan: Math.random() * 6 };
    this.updatePips(turret);
    return turret;
  }

  // --- missiles -------------------------------------------------------------------

  private launch(t: Turret, target: Target, side: -1 | 1): void {
    const { scene, vfx } = this.ctx;
    // Six visible tubes match the reference; upgraded capacity feeds reserve rounds.
    // Alternate the two banks even when only one enemy is available.
    const round = t.capacity - t.ammo + (side > 0 ? 1 : 0);
    const bank = round % 2;
    const tube = Math.floor(round / 2) % 3;
    const socket = t.sockets[bank * 3 + tube];
    t.caps[bank * 3 + tube].setEnabled(false);
    socket.computeWorldMatrix(true);
    const from = socket.getAbsolutePosition().clone();
    const yaw = t.yaw.rotation.y;
    const model = buildSnowWhiteMissile(scene, { glow: (mesh) => vfx.glowMesh(mesh) });
    const body = model.root;
    body.position.copyFrom(from);
    body.rotationQuaternion = new Quaternion();
    const smoke = new ParticleSystem('sw-missile-smoke', 224, scene);
    smoke.particleTexture = this.smokeTexture;
    smoke.emitter = from.clone();
    smoke.blendMode = ParticleSystem.BLENDMODE_STANDARD;
    smoke.addColorGradient(0, new Color4(.87, .85, .79, .72), new Color4(.67, .68, .67, .6));
    smoke.addColorGradient(.45, new Color4(.73, .74, .71, .48));
    smoke.addColorGradient(1, new Color4(.64, .66, .65, 0));
    smoke.addSizeGradient(0, .20, .27);
    smoke.addSizeGradient(.45, .36, .48);
    smoke.addSizeGradient(1, .6, .75);
    smoke.minLifeTime = .85; smoke.maxLifeTime = SMOKE_LIFE;
    smoke.emitRate = 160; smoke.minEmitPower = .1; smoke.maxEmitPower = .3;
    smoke.direction1.set(-.2, .15, -.2); smoke.direction2.set(.2, .45, .2);
    smoke.minInitialRotation = 0; smoke.maxInitialRotation = Math.PI * 2;
    smoke.minAngularSpeed = -.6; smoke.maxAngularSpeed = .6;
    smoke.gravity.set(0, .12, 0);
    smoke.isLocal = false;
    smoke.updateSpeed = 1 / 60;
    // launched up and out of the pod, then it turns onto the target
    const launchSide = bank === 0 ? -1 : 1;
    const velocity = new Vector3(Math.sin(yaw) * Math.cos(.55) + launchSide * .25 * Math.cos(yaw), Math.sin(.55), Math.cos(yaw) * Math.cos(.55) - launchSide * .25 * Math.sin(yaw)).normalize();
    lookAlong(body, velocity);
    model.exhaust.computeWorldMatrix(true);
    const previousExhaust = model.exhaust.getAbsolutePosition().clone();
    (smoke.emitter as Vector3).copyFrom(previousExhaust);
    // Fill the distance traveled each frame, so fast rockets leave a continuous trail.
    smoke.startPositionFunction = (_world, position) => {
      Vector3.LerpToRef(previousExhaust, smoke.emitter as Vector3, Math.random(), position);
      position.addInPlaceFromFloats((Math.random() - .5) * .035, (Math.random() - .5) * .035, (Math.random() - .5) * .035);
    };
    smoke.start();
    const missile = { body, smoke, exhaust: model.exhaust, previousExhaust, flame: model.flame, velocity, speed: MISSILE_START, target, life: MISSILE_LIFE };
    this.missiles.push(missile);
    this.ignite(missile);
    vfx.flashSprite(from, ROCKET_COLORS.hot, .27, .05, .65, 'star');
    vfx.flashSprite(from, ROCKET_COLORS.flame, .42, .08, .3);
    vfx.vapour(from, 2, ROCKET_COLORS.smoke, .22, .15, .3);
  }

  /** Short camera-facing fire layers keep the nozzle flame readable through its smoke. */
  private ignite(m: Missile): void {
    const { vfx } = this.ctx;
    const orange = [1, .3, .035] as const;
    const yellow = [1, .85, .36] as const;
    const outer = vfx.quad('tongue', orange, .95);
    const core = vfx.quad('tongue', yellow, 1);
    const flare = vfx.quad('glow', ROCKET_COLORS.flame, .55);
    vfx.glowing(outer); vfx.glowing(core);
    const at = new Vector3(), tip = new Vector3();
    const phase = Math.random() * Math.PI * 2;
    vfx.add({
      update: (_dt, age) => {
        if (m.body.isDisposed()) return false;
        m.exhaust.computeWorldMatrix(true);
        at.copyFrom(m.exhaust.getAbsolutePosition());
        const pulse = 1 + Math.sin(age * 53 + phase) * .12 + Math.sin(age * 91 + phase) * .06;
        m.flame.scaling.y = pulse;
        m.flame.position.z = -.14 * pulse; // keep its broad end attached to the nozzle
        at.addInPlaceFromFloats(m.velocity.x * .025, m.velocity.y * .025, m.velocity.z * .025);
        tip.copyFrom(at).subtractInPlace(m.velocity.scale(.54 * pulse));
        vfx.streak(outer, at, tip, .24 * pulse);
        tip.copyFrom(at).subtractInPlace(m.velocity.scale(.31 * pulse));
        vfx.streak(core, at, tip, .13);
        vfx.sprite(flare, at, .3 * pulse);
        return true;
      },
      dispose: () => { vfx.release(outer); vfx.release(core); vfx.release(flare); },
    });
  }

  private updateMissiles(dt: number): void {
    const { targets } = this.ctx;
    const want = new Vector3();
    for (let i = this.missiles.length - 1; i >= 0; i--) {
      const m = this.missiles[i];
      m.life -= dt;
      if (!m.target?.alive) m.target = targets.nearest(m.body.position, 1)[0] ?? null;
      if (m.target) {
        want.copyFrom(m.target.position).addInPlaceFromFloats(0, .7, 0).subtractInPlace(m.body.position).normalize();
        const angle = Math.acos(Math.max(-1, Math.min(1, Vector3.Dot(m.velocity, want))));
        const turn = MISSILE_TURN * dt;
        if (angle > 1e-4) m.velocity = slerp(m.velocity, want, Math.min(1, turn / angle));
      }
      m.speed = Math.min(MISSILE_MAX, m.speed + MISSILE_ACCEL * dt);
      const travel = m.speed * dt;
      const from = m.body.position.clone(), to = from.add(m.velocity.scale(travel));
      const snowHit = this.ctx.targets.navigation.traceCover(from, to, .1) ?? null;
      const targetHit = m.target ? targetContact(from, to, m.target) : null;
      const groundHit = to.y <= .05 ? (from.y <= .05 ? 0 : (from.y - .05) / (from.y - to.y)) : null;
      const contact = Math.min(snowHit ?? Infinity, targetHit ?? Infinity, groundHit ?? Infinity);
      Vector3.LerpToRef(from, to, Math.min(1, contact), m.body.position);
      lookAlong(m.body, m.velocity);
      // Smoke originates at the nozzle; the white shell and dark nose never bloom.
      m.exhaust.computeWorldMatrix(true);
      m.previousExhaust.copyFrom(m.smoke.emitter as Vector3);
      (m.smoke.emitter as Vector3).copyFrom(m.exhaust.getAbsolutePosition());
      const p = m.body.position;
      if (contact <= 1 || m.life <= 0) {
        this.explode(p.clone());
        if (snowHit !== null && snowHit === contact) this.ctx.vfx.vapour(p, 9, [.82, .92, 1], .8, .8, .7);
        m.smoke.stop();
        // Particle systems share the smoke texture; disposing a plume must not destroy it.
        const smoke = m.smoke;
        this.ctx.vfx.add({ update: (_dt, age) => age < SMOKE_LIFE + .1, dispose: () => smoke.dispose(false) });
        m.body.dispose();
        this.missiles.splice(i, 1);
      }
    }
  }

  private explode(at: Vector3, damageScale = 1, radiusScale = 1): void {
    const { vfx, targets, run, camera } = this.ctx;
    // A retiring ground turret can be under powder. Put its blast on the surface
    // so that the thin snow beneath it does not falsely shield every nearby target.
    const surface = this.ctx.snow?.surfaceHeight(at.x, at.z);
    if (surface != null && at.y <= surface) at = new Vector3(at.x, surface + .1, at.z);
    const ground = new Vector3(at.x, 0, at.z);
    rocketImpact(vfx, at, MISSILE_RADIUS * radiusScale);
    camera.shake(.06, .12);
    this.ctx.sound(SFX.explosion, at);
    const damage = this.baseDamage * .5 * damageScale;
    for (const target of targets.inRadius(ground, MISSILE_RADIUS * radiusScale)) {
      if (snowShieldsTarget(this.ctx, at, target)) continue;
      const push = target.position.subtract(ground);
      push.y = 0;
      run.damage(target, damage, 'special', push.lengthSquared() > 1e-4 ? push.normalize().scale(2) : undefined);
      if (target.alive && run.talents.has('armor_piercing')) target.marks.add('armor-piercing');
      if (run.talents.has('incendiary_ammo')) run.burn(target, 'incendiary-ammo', damage * 4 / 5, 5);
    }
  }
}

function slerp(a: Vector3, b: Vector3, t: number): Vector3 {
  const dot = Math.max(-1, Math.min(1, Vector3.Dot(a, b)));
  const theta = Math.acos(dot) * t;
  const rel = b.subtract(a.scale(dot));
  if (rel.lengthSquared() < 1e-8) return a.clone();
  rel.normalize();
  return a.scale(Math.cos(theta)).add(rel.scale(Math.sin(theta))).normalize();
}

function lookAlong(node: TransformNode, dir: Vector3): void {
  const yaw = Math.atan2(dir.x, dir.z);
  const pitch = -Math.asin(Math.max(-1, Math.min(1, dir.y)));
  Quaternion.RotationYawPitchRollToRef(yaw, pitch, 0, node.rotationQuaternion!);
}
