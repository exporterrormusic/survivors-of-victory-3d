// Hero controller, Heroes of the Storm style.
//
// Orders (what the player asked for) are separate from states (what the hero is doing now):
//   orders: move to a point, attack a target (chase into range, keep attacking),
//           attack-move (walk, engaging anything that comes into range), or nothing.
//   states: idle/move follow the order; attack/cast/channel/dash are actions that hold it;
//           mounting/hearth/emote are interrupted by any new order.
// Direct input (WASD) overrides orders while held.
// Abilities come from the character's kit (src/characters/<id>/kit.ts): each declares how it is
// cast (shot, dash or channel) and its effects, which src/abilities/effects.ts carries out.

import { Color3, Mesh, MeshBuilder, StandardMaterial, Vector3 } from '@babylonjs/core';
import type { Chibi } from './chibi';
import { COLORS, flatDist, tintColor, type Combat, type AttackTarget } from './combat';
import { EMOTE_COOLDOWN, HEARTH, MOUNT, abilityOf, slotInfo } from './abilities/common';
import { channelBeam, runEffects } from './abilities/effects';
import { StatusSet } from './abilities/status';
import { fireWeapon } from './weapons';
import type { AbilityDefinition, Kit, KitSlot, Slot } from './abilities/types';
import { ARENA, BLUE_SPAWN, type World } from './world';
import { NavigationAgent } from './navigation';

export type HeroState =
  | 'idle' | 'move' | 'attack' | 'cast' | 'channel' | 'dash' | 'mounting' | 'hearth' | 'emote' | 'dead';

type Order =
  | { kind: 'none' }
  | { kind: 'move'; to: Vector3 }
  | { kind: 'attack'; target: AttackTarget }
  | { kind: 'amove'; to: Vector3; target: AttackTarget | null };

const NO_ORDER: Order = { kind: 'none' };

const RUN_ANIM_SPEED = 1.2; // run clip playback rate, tuned against a 5.5 move speed for foot slide
const TURN_RATE = 18; // rad/s
const RADIUS = 0.6;
const CAST_ANIM_SPEED = 1.4; // shot clip rate for Q/E
const ATTACK_ANIM_SPEED = 1.6; // shot clip rate for basic attacks
const FIRE_AT = 0.1; // seconds into the shot clip when the projectile leaves
const RECOVER = 0.08; // after that, a new order may cancel the follow-through
const RESPAWN_TIME = 3;

export class Hero {
  state: HeroState = 'idle';
  heading = 0;
  mounted = false;
  /** basic attacks since the last charged one (trait) */
  traitStacks = 0;
  hp: number;
  readonly radius = RADIUS;
  life = 0;
  damageFlash = 0;
  private protection = 0;
  /** mana or fuel, per the kit's resource; unused when abilities cost health */
  energy: number;
  /** rounds left in the magazine; basic attacks without a magazine ignore it */
  ammo: number;
  /** seconds of reload left */
  reloading = 0;
  /** damage a redirect trait has stored for the next basic attack */
  stored = 0;
  /** chosen heroic (index into kit.heroics); null until the player picks one */
  heroic: number | null = null;
  private sinceHurt = Infinity;
  private sinceSpent = Infinity;
  readonly status = new StatusSet();
  readonly cooldowns: Record<Slot, number> = { Q: 0, W: 0, E: 0, R: 0, D: 0, Z: 0, B: 0, T: 0 };

  private order: Order = NO_ORDER;
  private pending: Order | null = null; // order issued during an action, applied after it
  private readonly input = new Vector3(); // direct movement, world space, length <= 1
  private timer = 0;
  private fired = false;
  private castSlot: KitSlot = 'Q';
  private swingTarget: AttackTarget | null = null; // null: aimed (WASD) basic attack
  private attackCd = 0;
  private shotIn = 0;
  private directAttackHeld = false;
  private attackSequence = 0;
  private channelPhase: 'start' | 'fire' | 'end' = 'start';
  private readonly aimDir = new Vector3(0, 0, 1);
  private readonly aimPoint = new Vector3();
  private readonly dashFrom = new Vector3();
  private readonly muzzle = new Vector3();
  private readonly board: Mesh;
  private readonly swirl: Mesh;
  private readonly navigator: NavigationAgent;
  private movementHold = 0;

  constructor(
    public chibi: Chibi,
    private readonly world: World,
    private readonly combat: Combat,
    private readonly spawn: Vector3,
    public kit: Kit,
    /** model id, for summoned clones */
    public variant: string,
  ) {
    this.hp = kit.stats.hp;
    this.energy = this.maxEnergy;
    this.ammo = kit.basic.magazine?.size ?? 0;
    this.navigator = new NavigationAgent(world.navigation, RADIUS, { delay: .1, distance: .3 });
    chibi.root.position.copyFrom(spawn);
    chibi.play('idle', { fade: 0 });

    const scene = chibi.root.getScene();
    // placeholder mount: a hoverboard (no NIKKE mount models exist)
    this.board = MeshBuilder.CreateBox('hoverboard', { width: 0.9, height: 0.1, depth: 1.7 }, scene);
    const boardMat = new StandardMaterial('hoverboard-mat', scene);
    boardMat.diffuseColor = new Color3(0.85, 0.88, 0.95);
    boardMat.emissiveColor = new Color3(0.15, 0.45, 0.8);
    this.board.material = boardMat;
    this.board.isPickable = false;
    this.board.setEnabled(false);
    world.shadows.addShadowCaster(this.board);
    world.glow.addIncludedOnlyMesh(this.board);

    this.swirl = MeshBuilder.CreateTorus('hearth-swirl', { diameter: 1.8, thickness: 0.07, tessellation: 48 }, scene);
    const swirlMat = new StandardMaterial('hearth-mat', scene);
    swirlMat.emissiveColor = new Color3(0.4, 0.7, 1);
    swirlMat.disableLighting = true;
    this.swirl.material = swirlMat;
    this.swirl.isPickable = false;
    this.swirl.setEnabled(false);
    world.glow.addIncludedOnlyMesh(this.swirl);
  }

  get position(): Vector3 {
    return this.chibi.root.position;
  }

  get alive(): boolean { return this.state !== 'dead' && this.hp > 0; }

  get maxHp(): number { return this.kit.stats.hp; }

  heal(amount: number): void {
    if (this.alive) this.hp = Math.min(this.maxHp, this.hp + amount);
  }

  /** The ability in a kit slot; R is the chosen heroic (the first one before a choice). */
  ability(slot: KitSlot): AbilityDefinition {
    return abilityOf(this.kit, slot, this.heroic ?? 0);
  }

  /** Pick heroic `index`, once. Returns false if already chosen or out of range. */
  chooseHeroic(index: number): boolean {
    if (this.heroic !== null || !this.kit.heroics[index]) return false;
    this.heroic = index;
    return true;
  }

  /** Mana or fuel capacity; 0 when abilities cost health. */
  get maxEnergy(): number {
    const resource = this.kit.stats.resource;
    return resource.kind === 'health' ? 0 : resource.max;
  }

  /** Whether the kit's resource covers `cost`. A health cost may not be fatal. */
  canPay(cost: number): boolean {
    if (cost <= 0) return true;
    return this.kit.stats.resource.kind === 'health' ? this.hp > cost : this.energy >= cost;
  }

  /** Damage multiplier for everything the hero deals: empower, and rage as health falls. */
  get power(): number {
    const rage = this.kit.trait.rage;
    return this.status.damageDealt * (rage ? 1 + rage.maxBonus * (1 - this.hp / this.maxHp) : 1);
  }

  /** Enemy damage interrupts mount/recall and awards a kill only once. */
  takeDamage(amount: number): boolean {
    if (!this.alive || this.protection > 0) return false;
    amount *= this.status.damageTaken;
    if (amount <= 0) return false;
    this.sinceHurt = 0;
    const redirect = this.kit.trait.redirect;
    if (redirect) this.stored = Math.min(redirect.max, this.stored + amount * redirect.fraction);
    amount = this.status.absorb(amount);
    if (amount <= 0) return false;
    this.hp = Math.max(0, this.hp - amount);
    this.damageFlash = .25;
    this.dismount();
    if (this.state === 'hearth' || this.state === 'mounting') this.stop();
    if (this.hp > 0) return false;
    this.kill();
    return true;
  }

  /** The AttackTarget we're attacking or chasing, for highlighting. */
  get target(): AttackTarget | null {
    if (this.state === 'attack' && this.swingTarget) return this.swingTarget;
    const o = this.pending ?? this.order;
    return o.kind === 'attack' ? o.target : o.kind === 'amove' ? o.target : null;
  }

  /** Progress of the current channel or cast bar, if any. */
  get channel(): { label: string; progress: number } | null {
    if (this.state === 'mounting') return { label: 'Mount', progress: this.timer / MOUNT.castTime };
    if (this.state === 'hearth') return { label: 'Hearthstone', progress: this.timer / HEARTH.channel };
    if (this.state === 'channel' && this.channelPhase === 'fire') {
      const ability = this.ability(this.castSlot);
      return { label: ability.name, progress: this.timer / channelTime(ability) };
    }
    return null;
  }

  /**
   * Swap the model (outfit or hero switch) and keep position, heading and facing mode.
   * A different kit keeps the same fraction of health and mana or fuel, with a full magazine.
   */
  setChibi(next: Chibi, kit = this.kit, variant = this.variant): void {
    this.interrupt();
    this.attackCd = 0;
    this.directAttackHeld = false;
    if (kit !== this.kit) {
      const energy = this.maxEnergy > 0 ? this.energy / this.maxEnergy : 1;
      this.hp = (this.hp / this.kit.stats.hp) * kit.stats.hp;
      this.kit = kit;
      this.energy = energy * this.maxEnergy;
      this.ammo = kit.basic.magazine?.size ?? 0;
      this.reloading = 0;
      this.stored = 0;
      this.traitStacks = 0;
      this.heroic = null;
    }
    this.variant = variant;
    next.root.position.copyFrom(this.position);
    next.root.rotation.y = this.heading;
    next.setFacingMode(this.chibi.facingMode);
    this.chibi.dispose();
    this.chibi = next;
    this.combat.beamStop();
    this.chibi.setLift(this.mounted ? 0.18 : 0);
    if (this.state === 'dead') {
      this.chibi.play('death', { fade: 0 });
    } else {
      this.state = 'idle';
      this.chibi.play('idle', { fade: 0 });
    }
  }

  // --- orders ------------------------------------------------------------

  moveTo(p: Vector3): void {
    this.issue({ kind: 'move', to: clampToArena(p) });
  }

  attack(target: AttackTarget): void {
    const cur = this.pending ?? this.order;
    if (cur.kind === 'attack' && cur.target === target) return; // repeated right-clicks
    this.issue({ kind: 'attack', target });
  }

  attackMove(p: Vector3): void {
    this.issue({ kind: 'amove', to: clampToArena(p), target: null });
  }

  stop(): void {
    this.pending = null;
    this.issue(NO_ORDER);
  }

  /** Direct movement (WASD / stick) in world x/z; (0, 0) releases it. */
  setMoveInput(x: number, z: number): void {
    const len = Math.hypot(x, z);
    this.input.set(len > 1 ? x / len : x, 0, len > 1 ? z / len : z);
  }

  // --- abilities ---------------------------------------------------------

  canCast(slot: Slot): boolean {
    if (slot === 'R' && this.heroic === null) return false;
    const spec = slotInfo(this.kit, slot, this.heroic);
    if (spec.passive || this.state === 'dead' || this.locked() || this.status.stunned) return false;
    if (slot === 'T' && this.state !== 'idle' && this.state !== 'move') return false;
    return this.cooldowns[slot] <= 0 && this.canPay(spec.cost);
  }

  cast(slot: Slot, aim: Vector3): boolean {
    if (!this.canCast(slot)) return false;
    switch (slot) {
      case 'Z':
        return this.toggleMount();
      case 'B':
        return this.startChannel('hearth');
      case 'T':
        return this.emote('talk_1');
      case 'D':
        return false;
    }
    const ability = this.ability(slot);
    // untargeted abilities (aim 'none') face where the hero already looks
    if (ability.aim === 'none') this.aimDir.set(Math.sin(this.heading), 0, Math.cos(this.heading));
    else if (!this.aimAt(aim)) return false;
    this.interrupt();
    this.dismount();
    if (this.order.kind !== 'none') this.pending = this.order; // resume after the cast, like LoL/HotS
    this.cooldowns[slot] = ability.cooldown;
    this.pay(ability.cost);
    this.timer = 0;
    this.fired = false;
    this.castSlot = slot;

    // clamp ground-targeted abilities to their range
    const reach = ability.aim === 'none' ? 0 : Math.min(ability.range, flatDist(this.position, aim));
    this.aimPoint.copyFrom(this.position).addInPlace(this.aimDir.scale(reach));

    switch (ability.cast.kind) {
      case 'dash':
        this.state = 'dash';
        this.dashFrom.copyFrom(this.position);
        if (ability.cast.invulnerable) this.status.apply({ kind: 'invulnerable', duration: ability.cast.time + 0.05 });
        this.combat.ring(this.position, 1, COLORS.charged, 0.25);
        this.announce(this.position);
        this.chibi.play('run', { speed: 2.4, fade: 0.05 });
        break;
      case 'channel':
        this.state = 'channel';
        this.channelPhase = 'start';
        this.chibi.play('aim_start', { fade: 0.1 });
        break;
      case 'shot':
        this.state = 'cast';
        this.chibi.play('shot', { fade: 0.05, speed: CAST_ANIM_SPEED });
        break;
    }
    return true;
  }

  /** WASD trigger: update aim while held without restarting the weapon's cadence. */
  attackToward(aim: Vector3): boolean {
    this.directAttackHeld = true;
    if (this.state === 'dead' || this.locked() || this.reloading > 0 || this.status.stunned) return false;
    if (this.state !== 'attack' && this.attackCd > 0) return false;
    if (!this.aimAt(aim)) return false;
    this.aimPoint.copyFrom(aim);
    if (this.state === 'attack' && !this.swingTarget) return true;
    this.startAttack(null);
    return true;
  }

  releaseAttackInput(): void { this.directAttackHeld = false; }

  /** Play any clip once (looping clips keep going until the next order). */
  emote(clip: string): boolean {
    if (this.state === 'dead' || this.locked() || !this.chibi.has(clip)) return false;
    if (clip === 'talk_1') this.cooldowns.T = EMOTE_COOLDOWN;
    this.interrupt();
    this.dismount();
    this.order = NO_ORDER;
    this.pending = null;
    this.state = 'emote';
    this.timer = 0;
    this.chibi.play(clip, { fade: 0.2 });
    return true;
  }

  kill(): void {
    if (this.state === 'dead') return;
    this.interrupt();
    this.dismount();
    this.combat.beamStop();
    this.order = NO_ORDER;
    this.pending = null;
    this.state = 'dead';
    this.hp = 0;
    this.timer = 0;
    this.status.clear();
    this.chibi.play('death', { fade: 0.1 });
  }

  // --- frame -------------------------------------------------------------

  update(dt: number): void {
    this.damageFlash = Math.max(0, this.damageFlash - dt);
    this.protection = Math.max(0, this.protection - dt);
    const stats = this.kit.stats;
    if (this.alive && flatDist(this.position, BLUE_SPAWN) < 5) this.hp = Math.min(stats.hp, this.hp + 180 * dt);
    for (const k of Object.keys(this.cooldowns) as Slot[]) {
      this.cooldowns[k] = Math.max(0, this.cooldowns[k] - dt);
    }
    this.attackCd = Math.max(0, this.attackCd - dt);
    this.sinceHurt += dt;
    this.sinceSpent += dt;
    if (this.state !== 'dead') this.recover(dt);
    this.timer += dt;
    // Stuns cancel what the hero is doing, except a dash already under way.
    const stunned = this.status.stunned && this.state !== 'dead' && this.state !== 'dash';
    if (stunned && this.state !== 'idle') {
      this.interrupt();
      this.pending = null;
      this.state = 'idle';
    }
    if (stunned) this.chibi.play(this.chibi.has('stun') ? 'stun' : 'idle', { fade: 0.1, loop: true });
    const steering = this.hasInput() && !stunned;

    switch (this.state) {
      case 'idle':
      case 'move':
        if (!stunned) this.followOrder(dt);
        break;
      case 'emote': {
        const loops = this.chibi.meta.clips[this.chibi.current]?.loop;
        if (steering || (!loops && this.timer >= this.clipTime(this.chibi.current, 1))) this.finishAction();
        break;
      }
      case 'mounting':
      case 'hearth':
        if (steering) this.finishAction();
        else if (this.state === 'mounting' && this.timer >= MOUNT.castTime) this.mountUp();
        else if (this.state === 'hearth' && this.timer >= HEARTH.channel) this.arriveHome();
        break;
      case 'attack': {
        const target = this.swingTarget;
        if (target && (!target.alive || flatDist(this.position, target.position) > this.kit.basic.range + target.radius
          || !this.combat.lineOfSight(this.position, target.position))) {
          this.finishAction();
        } else if (!target && !this.directAttackHeld && (this.fired || this.kit.basic.weapon.kind === 'beam')) {
          this.finishAction();
        } else if (steering && target) {
          this.finishAction();
        } else {
          if (target) { this.aimAt(target.position); this.aimPoint.copyFrom(target.position); }
          if (steering) this.walk(this.input.x, this.input.z, Infinity, dt, true);
          this.turnTo(yawOf(this.aimDir), dt);
        }
        break;
      }
      case 'cast':
        this.turnTo(yawOf(this.aimDir), dt);
        break;
      case 'channel':
        this.turnTo(yawOf(this.aimDir), dt);
        this.stepChannel();
        break;
      case 'dash':
        this.stepDash();
        break;
      case 'dead':
        if (this.timer >= RESPAWN_TIME) {
          this.position.copyFrom(this.spawn);
          this.hp = stats.hp;
          this.energy = this.maxEnergy;
          this.ammo = this.kit.basic.magazine?.size ?? 0;
          this.reloading = 0;
          this.stored = 0;
          this.life++;
          this.protection = 2;
          this.finishAction();
        }
        break;
    }

    this.chibi.root.rotation.y = this.heading;
    this.chibi.update(dt);

    // anything spawned from the gun goes after chibi.update so it matches the rendered pose
    if (this.state === 'attack') {
      this.updateWeapon(dt);
    } else if (this.state === 'cast') {
      if (!this.fired && this.timer >= FIRE_AT) {
        this.fired = true;
        this.releaseCast();
      }
      const done = this.timer >= this.clipTime('shot', CAST_ANIM_SPEED);
      if (done || (this.fired && this.timer >= FIRE_AT + RECOVER && (this.pending || steering))) this.finishAction();
    } else if (this.state === 'channel' && this.channelPhase === 'fire') {
      const ability = this.ability(this.castSlot);
      const beam = channelBeam(ability.effects);
      if (!this.fired) {
        this.fired = true;
        const from = this.chibi.muzzle(this.muzzle);
        if (beam) {
          this.combat.beamStart(from, this.aimDir, { dps: beam.dps * this.power, width: beam.width, length: beam.length,
            color: beam.tint ? tintColor(beam.tint) : undefined });
        }
        this.release(ability, from);
      } else if (beam) {
        this.combat.beamMove(this.chibi.muzzle(this.muzzle));
      }
    }

    this.updateFx(dt);
  }

  // --- order following ---------------------------------------------------

  private followOrder(dt: number): void {
    if (this.hasInput()) {
      this.order = NO_ORDER;
      this.walk(this.input.x, this.input.z, Infinity, dt);
      return;
    }
    const o = this.order;
    switch (o.kind) {
      case 'none':
        this.locomote(false);
        return;
      case 'move':
        if (this.walkTo(o.to, 0.05, dt, true)) this.order = NO_ORDER;
        return;
      case 'attack':
        if (!o.target.alive) {
          this.order = NO_ORDER;
          this.locomote(false);
        } else {
          this.engage(o.target, dt);
        }
        return;
      case 'amove':
        if (o.target && !o.target.alive) o.target = null;
        o.target ??= this.combat.nearestEnemy(this.position, this.kit.basic.range);
        if (o.target) this.engage(o.target, dt);
        else if (this.walkTo(o.to, 0.05, dt, true)) this.order = NO_ORDER;
        return;
    }
  }

  /** Close to attack range, then attack whenever the attack is ready. */
  private engage(target: AttackTarget, dt: number): void {
    const reach = this.kit.basic.range + target.radius;
    if (flatDist(this.position, target.position) > reach || !this.combat.lineOfSight(this.position, target.position)) {
      this.walkTo(target.position, reach - 0.1, dt, false);
      return;
    }
    const yaw = yawTo(this.position, target.position);
    this.turnTo(yaw, dt);
    if (this.attackCd <= 0 && this.reloading <= 0 && Math.abs(angleDiff(yaw, this.heading)) < 0.6) {
      this.aimDir.set(Math.sin(yaw), 0, Math.cos(yaw));
      this.startAttack(target);
    } else {
      this.locomote(false);
    }
  }

  /** Returns true on arrival. */
  private walkTo(to: Vector3, stopAt: number, dt: number, _giveUpWhenPinned: boolean): boolean {
    const dist = flatDist(to, this.position);
    if (dist <= stopAt && this.combat.lineOfSight(this.position, to)) {
      this.locomote(false);
      return true;
    }
    this.collide();
    // On open ground head straight for the point, so held-mouse steering answers every frame;
    // the path search is only for routes around cover.
    const waypoint = this.world.navigation.clear(this.position, to, RADIUS) ? to : this.navigator.waypoint(this.position, to, dt);
    if (!waypoint) {
      this.locomote(false);
      const goal = this.world.navigation.project(to, RADIUS);
      return Math.hypot(this.position.x - goal.x, this.position.z - goal.z) < .12;
    }
    const dx = waypoint.x - this.position.x, dz = waypoint.z - this.position.z;
    const remaining = Math.hypot(dx, dz);
    this.walk(dx, dz, Math.min(remaining, this.combat.lineOfSight(this.position, to) ? Math.max(0, dist - stopAt) : remaining), dt);
    return false;
  }

  /** Move along (dx, dz), at most maxDist this frame. Returns the step taken. */
  private walk(dx: number, dz: number, maxDist: number, dt: number, firing = false): number {
    if (Math.hypot(dx, dz) < 1e-6 || dt <= 0) return 0;
    const previousX = this.position.x, previousZ = this.position.z;
    const yaw = Math.atan2(dx, dz);
    if (!firing) this.turnTo(yaw, dt);
    // slow down while still turning, so a reversal doesn't moonwalk
    const align = firing ? 1 : Math.max(0, Math.cos(angleDiff(yaw, this.heading)));
    const len = Math.hypot(dx, dz);
    const speed = this.kit.stats.moveSpeed * (this.mounted ? 1 + MOUNT.speedBonus : 1) * this.status.speedFactor;
    const step = Math.min(maxDist, speed * Math.min(1, len) * (0.35 + 0.65 * align) * dt);
    this.position.x += (dx / len) * step;
    this.position.z += (dz / len) * step;
    this.collide();
    const moved = Math.hypot(this.position.x - previousX, this.position.z - previousZ);
    if (moved / dt > .2) this.movementHold = .15;
    else this.movementHold = Math.max(0, this.movementHold - dt);
    if (!firing) this.locomote(this.movementHold > 0);
    return moved;
  }

  /** Set idle/move state and its clip. Mounted, she stands on the board either way. */
  private locomote(moving: boolean): void {
    this.state = moving ? 'move' : 'idle';
    const running = moving && !this.mounted;
    this.chibi.play(running ? 'run' : 'idle', { speed: running ? RUN_ANIM_SPEED : 1, fade: 0.15 });
  }

  // --- actions -----------------------------------------------------------

  private startAttack(target: AttackTarget | null): void {
    this.interrupt();
    this.dismount();
    this.state = 'attack';
    this.swingTarget = target;
    this.timer = 0;
    this.fired = false;
    this.shotIn = Math.max(this.attackCd, this.kit.basic.windup / this.status.attackSpeed);
    this.heading = yawOf(this.aimDir); // heroes snap to their target
    this.chibi.root.rotation.y = this.heading;
    const basic = this.kit.basic;
    const clip = basic.weapon.kind === 'beam' && this.chibi.has('aim_idle') ? 'aim_idle' : 'shot';
    this.chibi.play(clip, { fade: 0.05, loop: true, speed: basic.period < .15 ? ATTACK_ANIM_SPEED
      : Math.max(1, this.chibi.duration(clip) / basic.period) * this.status.attackSpeed });
  }

  private updateWeapon(dt: number): void {
    if (dt <= 0) return;
    const basic = this.kit.basic;
    this.shotIn -= dt;
    const from = this.chibi.muzzle(this.muzzle);
    if (!this.fired && basic.windup >= .1 && this.shotIn > 0) {
      this.combat.weaponFx.charging(from, this.aimDir, Math.min(1, this.timer / basic.windup), tintColor(basic.tint ?? '#bcecff'));
    }
    // Accumulate the remainder instead of rounding every shot to a frame or animation boundary.
    while (this.shotIn <= 1e-6 && this.reloading <= 0) {
      this.fired = true;
      this.combat.weaponFx.stopCharge();
      this.releaseAttack();
      this.shotIn += basic.period / this.status.attackSpeed;
    }
    this.attackCd = Math.max(0, this.shotIn);
    if (basic.weapon.kind === 'beam' && this.fired && this.reloading <= 0) {
      const dir = new Vector3(this.aimPoint.x - from.x, 0, this.aimPoint.z - from.z).normalize();
      this.combat.weaponBeam(from, dir, { dps: basic.damage / basic.period * this.power * this.status.attackSpeed,
        width: basic.weapon.width, length: basic.aimedRange, color: tintColor(basic.tint ?? '#ba73ff') }, this.kit.trait.onHit);
    }
    if (this.reloading > 0 || !this.swingTarget && !this.directAttackHeld && this.fired) this.finishAction();
  }

  private releaseAttack(): void {
    const { basic, trait } = this.kit;
    const every = trait.chargedShot?.every ?? 0;
    const charged = every > 0 && this.traitStacks === every - 1;
    if (every > 0) this.traitStacks = (this.traitStacks + 1) % every;
    // a redirect trait releases its stored damage with this shot
    const released = this.stored;
    this.stored = 0;
    const damage = (basic.damage * (charged ? trait.chargedShot!.multiplier : 1) + released) * this.power;
    const from = this.chibi.muzzle(this.muzzle).clone();
    const dir = this.aimDir.clone();
    if (this.swingTarget) {
      this.aimPoint.copyFrom(this.swingTarget.position);
    }
    if (basic.weapon.kind !== 'sword') dir.set(this.aimPoint.x - from.x, 0, this.aimPoint.z - from.z).normalize();
    fireWeapon(this.combat, basic, this.position, from, dir, this.aimPoint, damage, charged, this.attackSequence++, trait.onHit, trait.splash);
    if (basic.weapon.kind === 'beam') this.combat.beamPulse(from, dir, basic.aimedRange, basic.weapon.width,
      damage - basic.damage * this.power);
    if (basic.weapon.kind !== 'beam') this.combat.events.notifyObservers({ kind: 'attack', at: from, charged });
    const magazine = basic.magazine;
    if (magazine && --this.ammo <= 0) {
      this.reloading = magazine.reload;
      this.combat.events.notifyObservers({ kind: 'reload', at: this.position.clone() });
    }
  }

  /** Resource regeneration, the guard trait's shield, and reloads. */
  private recover(dt: number): void {
    const resource = this.kit.stats.resource;
    if (resource.kind === 'mana' || (resource.kind === 'fuel' && this.sinceSpent >= resource.delay)) {
      this.energy = Math.min(resource.max, this.energy + resource.regen * dt);
    }
    const guard = this.kit.trait.guard;
    if (guard && this.sinceHurt >= guard.delay && this.status.shield < guard.amount) {
      this.status.apply({ kind: 'shield', duration: Infinity, amount: guard.amount });
    }
    if (this.reloading > 0 && (this.reloading -= dt) <= 0) {
      this.reloading = 0;
      this.ammo = this.kit.basic.magazine?.size ?? 0;
    }
  }

  private pay(cost: number): void {
    if (cost <= 0) return;
    if (this.kit.stats.resource.kind === 'health') this.hp -= cost;
    else {
      this.energy -= cost;
      this.sinceSpent = 0;
    }
  }

  private releaseCast(): void {
    this.release(this.ability(this.castSlot), this.chibi.muzzle(this.muzzle));
  }

  /** Run an ability's effects from `from` and tell presentation it happened. */
  private release(ability: AbilityDefinition, from: Vector3): void {
    runEffects(ability.effects, {
      combat: this.combat, caster: this, power: this.power, variant: this.variant, from, dir: this.aimDir, point: this.aimPoint,
    });
    if (ability.cast.kind !== 'dash') this.announce(from);
  }

  private announce(at: Vector3): void {
    const ability = this.ability(this.castSlot);
    this.combat.events.notifyObservers({ kind: 'ability', slot: this.castSlot, at: at.clone(), sound: ability.sound });
  }

  private stepDash(): void {
    const ability = this.ability(this.castSlot);
    const t = Math.min(1, this.timer / (ability.cast.kind === 'dash' ? ability.cast.time : 0.22));
    const k = 1 - (1 - t) * (1 - t); // ease out
    Vector3.LerpToRef(this.dashFrom, this.aimPoint, k, this.position);
    this.position.y = 0;
    this.collide();
    if (t >= 1) {
      this.combat.ring(this.position, 1, COLORS.charged, 0.25);
      // arrival effects (a slash wave, a landing blast) leave from where the dash ends
      if (ability.effects.length) this.release(ability, this.chibi.muzzle(this.muzzle));
      this.finishAction();
    }
  }

  private stepChannel(): void {
    const ability = this.ability(this.castSlot);
    if (this.channelPhase === 'start' && this.timer >= this.clipTime('aim_start', 1)) {
      this.channelPhase = 'fire';
      this.timer = 0;
      this.fired = false; // effects start after chibi.update, from the aiming pose
      this.chibi.play('aim_idle', { fade: 0.08, loop: true });
    } else if (this.channelPhase === 'fire' && this.timer >= channelTime(ability)) {
      this.channelPhase = 'end';
      this.timer = 0;
      this.combat.beamStop();
      this.chibi.play('aim_end', { fade: 0.1 });
    } else if (this.channelPhase === 'end') {
      // aim_end is follow-through: any order cancels it
      if (this.timer >= this.clipTime('aim_end', 1) || this.pending || this.hasInput()) this.finishAction();
    }
  }

  private toggleMount(): boolean {
    if (this.mounted) {
      this.dismount();
      return true;
    }
    return this.startChannel('mounting');
  }

  /** Mount and hearth are channels: you stand still and any order cancels them. */
  private startChannel(kind: 'mounting' | 'hearth'): boolean {
    this.interrupt();
    if (kind === 'hearth') this.dismount();
    this.order = NO_ORDER;
    this.pending = null;
    this.state = kind;
    this.timer = 0;
    // Dialogue poses can park the weapon on the ground (e.g. Red Hood's talk_idle).
    // Keep the equipped idle pose throughout mount and recall channels.
    this.chibi.play('idle', { fade: 0.2 });
    return true;
  }

  private mountUp(): void {
    this.mounted = true;
    this.chibi.setLift(0.18);
    this.combat.ring(this.position, 1.2, COLORS.charged, 0.3);
    this.finishAction();
  }

  private dismount(): void {
    if (!this.mounted) return;
    this.mounted = false;
    this.chibi.setLift(0);
  }

  private arriveHome(): void {
    this.position.copyFrom(this.spawn);
    this.combat.ring(this.position, 2, COLORS.charged, 0.4);
    this.finishAction();
  }

  /** Leave an action: apply a pending order, then let followOrder pick the clip. */
  private finishAction(): void {
    this.interrupt();
    if (this.pending) this.order = this.pending;
    this.pending = null;
    this.state = 'idle';
    this.swingTarget = null;
    this.followOrder(0);
  }

  /**
   * A new order or ability arrives. Channels and emotes end, and so does the follow-through
   * of an attack or cast. Actions still winding up keep the order for later.
   */
  private issue(o: Order): void {
    if (this.state === 'dead') return;
    this.directAttackHeld = false;
    if (this.locked()) {
      this.pending = o;
      return;
    }
    this.interrupt();
    this.order = o;
    this.pending = null;
    if (this.state !== 'idle' && this.state !== 'move') this.finishAction();
  }

  /** Cancel the parts of the current state that don't survive a new command. */
  private interrupt(): void {
    if (this.state === 'channel' || this.state === 'attack' && this.kit.basic.weapon.kind === 'beam') this.combat.beamStop();
    this.combat.weaponFx.stopCharge();
  }

  /** States a new order has to wait for. */
  private locked(): boolean {
    if (this.state === 'dash') return true;
    if (this.state === 'channel') return this.channelPhase !== 'end';
    if (this.state === 'cast') return !this.fired;
    return false;
  }

  private hasInput(): boolean {
    return this.input.x !== 0 || this.input.z !== 0;
  }

  private collide(): void {
    const p = this.position;
    if (!this.world.navigation.clear(p, p, RADIUS)) {
      const safe = this.world.navigation.project(p, RADIUS);
      p.x = safe.x; p.z = safe.z;
    }
    p.x = clamp(p.x, -ARENA, ARENA);
    p.z = clamp(p.z, -ARENA, ARENA);
  }

  private turnTo(yaw: number, dt: number): void {
    const d = angleDiff(yaw, this.heading);
    const max = TURN_RATE * dt;
    this.heading += Math.abs(d) <= max ? d : Math.sign(d) * max;
  }

  private aimAt(aim: Vector3): boolean {
    const dx = aim.x - this.position.x;
    const dz = aim.z - this.position.z;
    const len = Math.hypot(dx, dz);
    if (len < 1e-3) return false;
    this.aimDir.set(dx / len, 0, dz / len);
    this.heading = yawOf(this.aimDir); // snap, like HotS/LoL casts
    this.chibi.root.rotation.y = this.heading;
    return true;
  }

  private clipTime(clip: string, speed: number): number {
    return this.chibi.duration(clip) / speed;
  }

  private updateFx(dt: number): void {
    this.board.setEnabled(this.mounted && this.state !== 'dead');
    if (this.mounted) {
      this.board.position.set(this.position.x, 0.12 + Math.sin(performance.now() / 300) * 0.03, this.position.z);
      this.board.rotation.y = this.heading;
    }
    this.swirl.setEnabled(this.state === 'hearth');
    if (this.state === 'hearth') {
      const k = this.timer / HEARTH.channel;
      this.swirl.position.set(this.position.x, 0.1 + ((this.timer * 1.5) % 2), this.position.z);
      this.swirl.scaling.setAll(1 + k * 0.4);
      this.swirl.rotation.y += dt * 4;
    }
  }
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

const channelTime = (ability: AbilityDefinition) => (ability.cast.kind === 'channel' ? ability.cast.time : 0);

function clampToArena(p: Vector3): Vector3 {
  return new Vector3(clamp(p.x, -ARENA, ARENA), 0, clamp(p.z, -ARENA, ARENA));
}

const yawOf = (dir: Vector3) => Math.atan2(dir.x, dir.z);
const yawTo = (from: Vector3, to: Vector3) => Math.atan2(to.x - from.x, to.z - from.z);

function angleDiff(a: number, b: number): number {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
