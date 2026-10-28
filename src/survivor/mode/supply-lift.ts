// The Survival Round's supply lift: every minute the arrival elevator cycles down and back up,
// bringing a health crate and a squad of one to five mass-produced NIKKEs (Soldier, Product and
// iDoll models) who fight beside the player until they fall. Both ride up visibly on the deck.
//
// Loading a model or building its animation rig mid-fight stalls a frame, so every squad model
// (with its rig) is loaded and compiled behind the loading screen (SupplyLift.create), and a fallen
// squad member's model goes back into the pool for a later delivery. Nothing loads during play.
//
// Raptures hunt squad members like the player (mode/horde.ts picks each Rapture's nearest victim),
// so the squad has health, a bar and a name overhead (hud.ts). Each model fights with its own weapon
// (squad-weapons.ts): it keeps that weapon's range, picks targets that suit it, pulls back to the
// player when hurt, spreads out from the others, and steps out of red ground warnings.

import { Color3, MeshBuilder, StandardMaterial, Texture, TransformNode, Vector3, type Mesh } from '@babylonjs/core';
import { Chibi, loadChibiIndex } from '../../chibi';
import { NavigationAgent, type NavigationBody } from '../../navigation';
import type { ArrivalElevator } from '../arrival-elevator';
import { onElevatorFootprint, SHAFT_HALF_WIDTH, ELEVATOR_ORIGIN } from '../elevator-footprint';
import { TwinStickRig, type Posture } from '../rig';
import type { SquadMember, Target } from '../targets';
import type { FxQuad, Rgb } from '../vfx';
import type { SortieModeInit } from './sortie-mode';
import type { TelegraphLayer } from './telegraph';
import { MODEL_WEAPONS, SQUAD_WEAPONS, SquadGunfire, type SquadWeapon } from './squad-weapons';

/** seconds between deliveries; the first lands one interval after the round starts */
export const SUPPLY_INTERVAL = 60;
/** close, descend, rise, open (elevator-motion.ts): start this early so the gates open on the minute */
const CYCLE_SECONDS = 1.8 + 6 + 6 + 1.8;
const SQUAD_MODELS = ['c300_00', 'c301_00', 'c306_00', 'c302_00', 'c303_00', 'c307_00', 'c304_00', 'c305_00', 'c308_00'] as const;
/** shown over each squad member (src/minion-roster.json) */
const SQUAD_NAMES: Readonly<Record<string, string>> = {
  c300_00: 'Soldier EG', c301_00: 'Soldier FA', c306_00: 'Soldier OW',
  c302_00: 'Product 08', c303_00: 'Product 12', c307_00: 'Product 23',
  c304_00: 'iDoll Flower', c305_00: 'iDoll Ocean', c308_00: 'iDoll Sun',
};
const MAX_SQUAD = 8;
/** enough for a full squad: with recycling, nothing ever loads mid-round */
const POOL_SIZE = MAX_SQUAD;
const CRATE_HEAL = .4;

const ALLY = {
  hp: 40,
  speed: 5,
  radius: .42,
  /** how fast the gun swings onto a new target (rad/s); it only fires once roughly on target */
  aimTurn: 5,
  /** below this share of health it falls back behind the player */
  retreatBelow: .35,
  /** keeps at least this far from other squad members */
  spacing: 2,
  /** seconds between changes of firing position while engaged */
  reposition: [1.6, 3] as const,
  /** formation ring around the player */
  ring: 3.6,
  /** how far from the player they'll push out to engage */
  engage: 11,
  /** beyond this they drop everything and regroup */
  leash: 15,
  /** a Rapture this close (beyond its own radius) is backed away from */
  personalSpace: 2.2,
  /** don't re-path for a goal that moved less than this (stops twitching after the player) */
  settle: 2.2,
} as const;

/** friendly cyan, as on lifts and sites, so the squad reads apart from Raptures at a glance */
const MARKER: Rgb = [.32, .92, 1];
const SIGHT: Rgb = [.6, 1.4, 2.4];

class Ally implements NavigationBody, SquadMember {
  readonly position: Vector3;
  readonly radius = ALLY.radius;
  alive = true;
  hp: number = ALLY.hp;
  readonly maxHp = ALLY.hp;
  aimYaw = 0;
  /** seconds since death; disposed once the fall has played */
  deadFor = 0;
  /** standing on the deck while the lift brings it up: no AI, no damage, no shooting */
  riding = true;
  private readonly stand: TransformNode;
  private readonly agent: NavigationAgent;
  private readonly previous = new Vector3();
  private readonly velocity = new Vector3();
  private readonly goal = new Vector3();
  private readonly muzzle = new Vector3();
  /** rest before the next trigger pull */
  private cooldown = Math.random();
  /** wind-up left (minigun spin, sniper laser), then shots left in the burst and the gap timer */
  private windup = 0;
  private burstLeft = 0;
  private burstIn = 0;
  /** shots due this frame, fired from the real muzzle after animation */
  private pending = 0;
  /** single-shot weapons play their shot clip on the frame they fire */
  private shotPose = false;
  private readonly sight: FxQuad;
  private aimTarget: Target | null = null;
  private thinkIn = 0;
  private repositionIn = 0;
  private readonly marker: FxQuad;

  constructor(private readonly squad: SupplyLift, readonly chibi: Chibi, private readonly rig: TwinStickRig, readonly name: string, readonly weapon: SquadWeapon,
    at: Vector3, readonly slot: number, lean: number) {
    this.position = at.clone();
    this.stand = new TransformNode('ally-stand', chibi.root.getScene());
    chibi.root.parent = this.stand;
    chibi.root.position.setAll(0);
    this.stand.rotation.x = -lean;
    this.stand.position.copyFrom(at);
    this.agent = new NavigationAgent(squad.init.field.navigation, ALLY.radius, { delay: .3, distance: .6 });
    this.aimYaw = Math.PI;
    this.goal.copyFrom(at);
    this.marker = squad.init.vfx.quad('warning-ring', MARKER, .55, 'alpha');
    this.sight = squad.init.vfx.quad('streak', SIGHT, 0);
  }

  /** On the deck: idle, facing the gates, at the cage's height; shown once the cage is rising. */
  ride(dt: number, height: number, visible: boolean): void {
    this.chibi.root.setEnabled(visible);
    this.position.y = height;
    this.rig.update(dt, { moveX: 0, moveZ: 0, speed: 0, aimYaw: Math.PI, posture: 'relaxed' });
    this.stand.position.copyFrom(this.position);
  }

  get motion(): Readonly<Vector3> { return this.velocity; }

  /** Rapture hits: bolts, blasts and bodies (mode/horde.ts). */
  takeDamage(amount: number): boolean {
    if (!this.alive || this.riding || amount <= 0) return false;
    this.hp -= amount;
    if (this.hp <= 0) this.die();
    return true;
  }

  heal(amount: number): void {
    if (this.alive && !this.riding && amount > 0) this.hp = Math.min(this.maxHp, this.hp + amount);
  }

  /** The gates are open: step off and start fighting. */
  disembark(): void {
    this.riding = false;
    this.position.y = 0;
    this.chibi.root.setEnabled(true);
  }

  update(dt: number, allies: readonly NavigationBody[]): void {
    if (!this.alive) {
      this.deadFor += dt;
      this.rig.updateFull(dt);
      return;
    }
    const { init } = this.squad;
    const { field } = init;
    this.thinkIn -= dt;
    if (this.thinkIn <= 0) { this.thinkIn = .15; this.think(); }

    this.previous.copyFrom(this.position);
    const far = flat(this.goal, this.position) > .5;
    const firing = this.windup > 0 || this.burstLeft > 0;
    const river=field.navigation.storm;
    const pace = (firing ? this.weapon.firingPace : 1) * (field.navigation.snow?.speedScale(this.position.x, this.position.z) ?? 1)*(river?.speed(this.position)??1)*(field.navigation.lake?.speed(this.position)??1);
    const riverGoal=river?.steer(this,this.goal,allies,this.slot)??this.goal;
    if (far||riverGoal!==this.goal) this.agent.step(this, riverGoal, ALLY.speed * pace, dt, allies);
    if (!init.field.navigation.clear(this.position, this.position, ALLY.radius)) {
      const safe = init.field.navigation.project(this.position, ALLY.radius); this.position.x = safe.x; this.position.z = safe.z;
    }
    this.position.subtractToRef(this.previous, this.velocity).scaleInPlace(1 / dt);
    this.position.y = 0;

    // Shoot while moving: the torso tracks the target, the legs keep running.
    const target = this.aimTarget?.alive ? this.aimTarget : null;
    const weapon = this.weapon;
    this.shotPose = false;
    this.cooldown -= dt;
    // The gun swings smoothly toward whatever it wants to face instead of snapping between targets.
    let want = this.aimYaw;
    if (target) want = Math.atan2(target.position.x - this.position.x, target.position.z - this.position.z);
    else if (Math.hypot(this.velocity.x, this.velocity.z) > .3) want = Math.atan2(this.velocity.x, this.velocity.z);
    const turn = Math.atan2(Math.sin(want - this.aimYaw), Math.cos(want - this.aimYaw));
    this.aimYaw += Math.sign(turn) * Math.min(Math.abs(turn), ALLY.aimTurn * dt);
    const inReach = !!target && Math.abs(turn) < .2 && flat(target.position, this.position) <= weapon.range;
    if (!target) { this.windup = 0; this.burstLeft = 0; }
    else if (this.burstLeft > 0) {
      if ((this.burstIn -= dt) <= 0) { this.pending++; this.burstLeft--; this.burstIn = weapon.burstGap; this.shotPose = !weapon.automatic; }
      if (this.burstLeft === 0) this.cooldown = weapon.cooldown * (.85 + Math.random() * .3);
    } else if (this.windup > 0) {
      if ((this.windup -= dt) <= 0) { this.burstLeft = weapon.burst; this.burstIn = 0; }
    } else if (inReach && this.cooldown <= 0) {
      this.windup = weapon.windup || 1e-4;
    }
    // Sniper laser sight while it lines up the shot.
    if (weapon.kind === 'sniper' && this.windup > 0 && target) {
      const from = this.position.add(new Vector3(0, 1.1, 0)), to = target.position.add(new Vector3(0, 1, 0));
      this.squad.init.vfx.streak(this.sight, from, to, .035);
      this.squad.init.vfx.tint(this.sight, SIGHT, .5 + .5 * (1 - this.windup / weapon.windup));
    } else this.squad.init.vfx.tint(this.sight, SIGHT, 0);

    const speed = Math.hypot(this.velocity.x, this.velocity.z);
    // Automatic weapons hold the aim pose (muzzle flashes and tracers carry the firing); single
    // shots play the model's own shot clip once, at its natural speed.
    const posture: Posture = this.shotPose ? 'shot' : target ? 'aim' : 'relaxed';
    this.rig.update(dt, {
      moveX: speed > .05 ? this.velocity.x / speed : 0, moveZ: speed > .05 ? this.velocity.z / speed : 0,
      speed: speed > .05 ? speed : 0, aimYaw: this.aimYaw, posture, actionSpeed: 1,
    });
    this.stand.position.copyFrom(this.position);
    // Fades with health so a hurt squad member is visible at a glance.
    this.squad.init.vfx.tint(this.marker, MARKER, .25 + .4 * Math.max(0, this.hp / ALLY.hp));
    this.squad.init.vfx.decal(this.marker, this.position.add(new Vector3(0, .05, 0)), 1.25);
  }

  /** After animation: aim the torso, then shoot from the real gun tip. */
  afterAnimation(): void {
    if (!this.alive || this.riding) return;
    this.rig.applyAim();
    const shots = Math.min(this.pending, 2);
    this.pending = 0;
    if (!shots || !this.aimTarget?.alive) return;
    this.rig.muzzle(this.muzzle);
    for (let i = 0; i < shots; i++) this.squad.gunfire.fire(this.weapon, this.muzzle, this.aimTarget);
  }

  /** Pick where to stand and whom to shoot (10 Hz is plenty, and spreads the cost). */
  private think(): void {
    const { player, field } = this.squad.init;
    const tells = this.squad.tells;
    const p = this.position;
    let nearest: Target | null = null, nearestDistance = Infinity, best: Target | null = null, bestScore = Infinity;
    const weapon = this.weapon;
    for (const target of field.targets) {
      if (!target.alive || target.scale < .99) continue;
      const d = flat(target.position, p);
      if (d < nearestDistance) { nearestDistance = d; nearest = target; }
      if (d > weapon.range) continue;
      // Protect the player first (Raptures on them, or close to them), then whoever is after us,
      // then finish off the wounded; each weapon adds its own taste. Only what we can actually hit.
      const nearPlayer = flat(target.position, player.position);
      let score = d * (weapon.kind === 'shotgun' || weapon.kind === 'smg' ? 1.4 : 1) + nearPlayer * .6;
      if (!target.victim && nearPlayer < 6) score -= 3;
      if (target.victim === this) score -= 2.5;
      score -= 2 * (1 - target.hp / target.maxHp);
      if (weapon.kind === 'sniper' && (target.combatTier === 'heavy' || target.combatTier === 'boss' || target.combatTier === 'specialist')) score -= 5;
      if (weapon.kind === 'rocket') for (const other of field.targets) if (other !== target && other.alive && flat(other.position, target.position) < weapon.splash) score -= 1.5;
      if (target === this.aimTarget) score -= 4;
      if (score < bestScore && field.navigation.traceCover({ x: p.x, y: 1.1, z: p.z }, { x: target.position.x, y: 1.1, z: target.position.z }) == null) { bestScore = score; best = target; }
    }
    this.aimTarget = best;

    // 0. Off the lift first, out through the gates (−Z): the next delivery needs the deck clear.
    if (onElevatorFootprint(p.x, p.z, .3)) { this.setGoal(ELEVATOR_ORIGIN.x+Math.max(-2, Math.min(2, p.x-ELEVATOR_ORIGIN.x)), ELEVATOR_ORIGIN.z-SHAFT_HALF_WIDTH - 1.6, true); return; }
    // 1. Out of any red warning, toward the player's side if there's a choice.
    if (tells.dangerAt(p.x, p.z, .6)) {
      const escape = this.findSpot((x, z) => !tells.dangerAt(x, z, .8), 2.8);
      if (escape) { this.setGoal(escape.x, escape.z, true); return; }
    }
    // 2. Too far from the player: regroup.
    if (flat(player.position, p) > ALLY.leash) { this.slotGoal(); return; }
    // 3. Badly hurt: fall back behind the player, away from the nearest Rapture (still shooting).
    if (this.hp < this.maxHp * ALLY.retreatBelow && nearest) {
      const ax = player.position.x - nearest.position.x, az = player.position.z - nearest.position.z, l = Math.hypot(ax, az) || 1;
      const x = player.position.x + ax / l * 2.5, z = player.position.z + az / l * 2.5;
      if (!tells.dangerAt(x, z, .6) && !onElevatorFootprint(x, z, .5) && field.navigation.clear({ x, z }, { x, z }, ALLY.radius)) { this.setGoal(x, z); return; }
    }
    // 4. A Rapture right on top of us: one step back, toward the player (close-range guns hold).
    const space = weapon.kind === 'shotgun' || weapon.kind === 'smg' ? 1 : ALLY.personalSpace;
    if (nearest && nearestDistance < nearest.radius + space) {
      const ax = p.x - nearest.position.x, az = p.z - nearest.position.z, l = Math.hypot(ax, az) || 1;
      const x = p.x + ax / l * 2.5 + (player.position.x - p.x) * .2, z = p.z + az / l * 2.5 + (player.position.z - p.z) * .2;
      if (!tells.dangerAt(x, z, .6) && !onElevatorFootprint(x, z, .5)) { this.setGoal(x, z, true); return; }
    }
    // 5. A target in range: shoot, and every couple of seconds move to a new firing spot that keeps
    //    this weapon's preferred distance, steps across the line of fire, and spreads from the squad.
    if (best) {
      this.repositionIn -= .15;
      if (this.repositionIn <= 0) {
        this.repositionIn = ALLY.reposition[0] + Math.random() * (ALLY.reposition[1] - ALLY.reposition[0]);
        const tx = best.position.x - p.x, tz = best.position.z - p.z, l = Math.hypot(tx, tz) || 1;
        const side = Math.random() < .5 ? -1 : 1, reach = 1.5 + Math.random() * 2;
        const closer = Math.max(-3, Math.min(3, l - weapon.prefer));
        let x = p.x + (-tz / l * side) * reach + tx / l * closer, z = p.z + (tx / l * side) * reach + tz / l * closer;
        for (const other of this.squad.members) {
          if (other === this || !other.alive) continue;
          const ox = x - other.position.x, oz = z - other.position.z, d = Math.hypot(ox, oz);
          if (d < ALLY.spacing && d > 1e-3) { x += ox / d * (ALLY.spacing - d); z += oz / d * (ALLY.spacing - d); }
        }
        if (flat({ x, z }, player.position) <= ALLY.engage && !tells.dangerAt(x, z, .6) && !onElevatorFootprint(x, z, .5)
          && field.navigation.clear({ x, z }, { x, z }, ALLY.radius)) this.setGoal(x, z, true);
      }
      return;
    }
    // 6. Raptures near the player but out of our reach: push toward the closest one.
    if (nearest && flat(nearest.position, player.position) < ALLY.engage + weapon.range) {
      const dx = nearest.position.x - p.x, dz = nearest.position.z - p.z, l = Math.hypot(dx, dz) || 1, step = Math.max(0, l - weapon.prefer);
      const x = p.x + dx / l * step, z = p.z + dz / l * step;
      if (flat({ x, z }, player.position) <= ALLY.engage && !tells.dangerAt(x, z, .6)) { this.setGoal(x, z); return; }
    }
    // 7. Nothing to shoot: hold a slot around the player.
    this.slotGoal();
  }

  /** Move the goal only when it changed enough to matter (or `now`), so small shifts don't twitch. */
  private setGoal(x: number, z: number, now = false): void {
    if (now || Math.hypot(this.goal.x - x, this.goal.z - z) > ALLY.settle) this.goal.set(x, 0, z);
  }

  private slotGoal(): void {
    const { player } = this.squad.init;
    const count = Math.max(1, this.squad.count);
    const yaw = (this.slot % count) * Math.PI * 2 / count + .4;
    let x = player.position.x + Math.sin(yaw) * ALLY.ring, z = player.position.z + Math.cos(yaw) * ALLY.ring;
    if (this.squad.tells.dangerAt(x, z, .6) || onElevatorFootprint(x, z, .5)) {
      const spot = this.findSpot((sx, sz) => !this.squad.tells.dangerAt(sx, sz, .8) && !onElevatorFootprint(sx, sz, .5), 2.5, { x, z });
      if (spot) { x = spot.x; z = spot.z; }
    }
    // Already near the player and the slot: stay put rather than trail every step they take.
    if (flat(player.position, this.position) < ALLY.ring + 2 && flat({ x, z }, this.position) < ALLY.ring) return;
    this.setGoal(x, z);
  }

  /** A walkable point `radius` metres around `from` (default: here) that passes `ok`. */
  private findSpot(ok: (x: number, z: number) => boolean, radius: number, from: { x: number; z: number } = this.position): { x: number; z: number } | null {
    const { player, field } = this.squad.init;
    let best: { x: number; z: number } | null = null, bestScore = Infinity;
    for (const r of [radius, radius * 1.8]) {
      for (let i = 0; i < 12; i++) {
        const a = i * Math.PI / 6, x = from.x + Math.sin(a) * r, z = from.z + Math.cos(a) * r;
        if (!ok(x, z) || !field.navigation.clear({ x, z }, { x, z }, ALLY.radius)) continue;
        const score = Math.hypot(x - player.position.x, z - player.position.z);
        if (score < bestScore) { bestScore = score; best = { x, z }; }
      }
      if (best) return best;
    }
    return null;
  }

  private die(): void {
    this.alive = false;
    this.squad.leave(this);
    this.squad.init.vfx.release(this.marker);
    this.squad.init.vfx.release(this.sight);
    this.hp = 0;
    this.rig.playFull(this.chibi.has('death') ? 'death' : 'stun', false, true);
  }

  /** Off the field; the model and rig go back to the pool (or are disposed with `final`). */
  dispose(final = false): PooledModel | null {
    if (this.alive) { this.squad.init.vfx.release(this.marker); this.squad.init.vfx.release(this.sight); this.squad.leave(this); }
    this.chibi.root.parent = null;
    this.chibi.root.setEnabled(false);
    this.stand.dispose();
    if (!final) return { chibi: this.chibi, rig: this.rig, name: this.name, weapon: this.weapon };
    this.rig.dispose();
    this.chibi.dispose();
    return null;
  }
}

interface PooledModel { chibi: Chibi; rig: TwinStickRig; name: string; weapon: SquadWeapon }

export class SupplyLift {
  readonly tells: TelegraphLayer;
  readonly gunfire: SquadGunfire;
  private readonly allies: Ally[] = [];
  private readonly bodies: NavigationBody[] = [];
  private readonly crate: Mesh;
  private readonly crateMaterial: StandardMaterial;
  private crateReady = false;
  private nextDelivery = SUPPLY_INTERVAL - CYCLE_SECONDS;
  private delivery = 0;
  private cycling = false;
  /** loaded, hidden and compiled models waiting for a delivery */
  private readonly pool: PooledModel[] = [];
  /** the crate is on the cage for this delivery */
  private crateRiding = false;
  /** this cycle's cage has started back up (riders and crate are shown) */
  private risen = false;
  private readonly afterAnimations;

  /** the crate is standing on the cage (it rides it); a Test Range crate sits on the ground */
  private crateOnLift = true;

  constructor(readonly init: SortieModeInit, private readonly elevator: ArrivalElevator | null, tells: TelegraphLayer,
    private readonly banner: (text: string) => void, private readonly random: () => number) {
    this.tells = tells;
    this.gunfire = new SquadGunfire(init.vfx, init.field, init.run);
    const { scene, shadows } = init;
    this.crateMaterial = new StandardMaterial('supply-crate', scene);
    const crateTexture = new Texture(`${import.meta.env.BASE_URL}items/health-crate.png`, scene);
    crateTexture.anisotropicFilteringLevel = 8;
    this.crateMaterial.diffuseTexture = crateTexture;
    this.crateMaterial.diffuseColor = Color3.White();
    this.crateMaterial.specularColor.set(.12, .12, .12);
    // A little textured fill keeps the medical marking readable in night missions.
    // Lit like the props around it: no self-glow (emissive made it bloom under the glow layer).
    this.crateMaterial.emissiveColor.set(0, 0, 0);
    this.crate = MeshBuilder.CreateBox('supply-crate', { width: 1.1, depth: .8, height: .7 }, scene);
    this.crate.material = this.crateMaterial;
    this.crate.setEnabled(false);
    shadows.addShadowCaster(this.crate);
    this.afterAnimations = scene.onAfterAnimationsObservable.add(() => { for (const ally of this.allies) ally.afterAnimation(); });
  }

  /** everyone on the field (for spacing) */
  get members(): readonly Ally[] { return this.allies; }
  /** squad members still standing */
  get count(): number { return this.allies.filter((a) => a.alive && !a.riding).length; }
  /** seconds until the next delivery's gates open (for the HUD) */
  get nextIn(): number { return this.cycling ? Math.max(0, CYCLE_SECONDS - this.elevatorTime) : Math.max(0, this.nextDelivery - this.elapsed) + CYCLE_SECONDS; }
  get crateWaiting(): boolean { return this.crateReady; }
  private elapsed = 0;
  private elevatorTime = 0;
  private disposed = false;

  /** `elapsed` is the round clock; deliveries only run while the round is being survived. */
  update(dt: number, elapsed: number, active: boolean): void {
    this.elapsed = elapsed;
    const { player } = this.init;
    const lift = this.elevator?.state ?? { action: 'idle', height: 0, gateOpen: 1 };
    // The crate rides the deck, so one left on the lift goes down and comes back with it.
    if (this.cycling && !this.risen && lift.action === 'rise') {
      this.risen = true;
      if (this.crateRiding) this.crate.setEnabled(true);
    }
    if (this.crate.isEnabled()) {
      if (this.crateOnLift) this.crate.position.y = (this.elevator?.transportHeight??lift.height) + .35;
      if (this.crateReady && !this.cycling && player.hp < player.maxHp && flat(player.position, this.crate.position) < 1.6) {
        player.hp = Math.min(player.maxHp, player.hp + player.maxHp * CRATE_HEAL);
        this.crateReady = false; this.crate.setEnabled(false);
        this.banner('Supply crate · health restored');
      }
    }
    if (active && this.elevator && !this.cycling && elapsed >= this.nextDelivery) {
      // Never take the player (or a squad member) down with the lift.
      const blocked = this.elevator.onDeck(player.position) || this.allies.some((a) => a.alive && !a.riding && onElevatorFootprint(a.position.x, a.position.z, .3));
      if (!blocked) {
        this.cycling = true; this.risen = false; this.elevatorTime = 0; this.delivery++;
        this.elevator.command('cycle');
        this.board(this.squadSize());
        this.banner(this.elevator.isVault?'Vault delivery inbound ? squad and supplies':'Supply lift inbound · squad and supplies');
      } else if (elapsed >= this.nextDelivery + .1 && Math.floor(elapsed) !== Math.floor(elapsed - dt)) {
        this.banner(this.elevator.isVault?'Vault delivery waiting ? leave the chamber':'Supply lift waiting · step off the deck');
      }
    }
    if (lift.action !== 'idle' || lift.height < -.001) this.clearDeck();
    if (this.cycling) {
      this.elevatorTime += dt;
      if (lift.action === 'idle' && lift.gateOpen >= .999 && lift.height >= -.001 && this.elevatorTime > 2) {
        this.cycling = false;
        this.nextDelivery += SUPPLY_INTERVAL;
        this.arrive();
      }
    }

    this.bodies.length = 0;
    for (const ally of this.allies) if (ally.alive && !ally.riding) this.bodies.push(ally);
    for (const target of this.init.field.targets) if (target.alive) this.bodies.push(target);
    // The horde spends the shared route budget first; keep one search a frame for the squad so it
    // never stalls behind a crowd.
    if (this.allies.length) this.init.field.navigation.grantSearches(1);
    for (let i = this.allies.length - 1; i >= 0; i--) {
      const ally = this.allies[i];
      if (ally.riding) { ally.ride(dt, this.elevator?.transportHeight??lift.height, this.risen&&!(this.elevator?.transportHidden)); continue; }
      ally.update(dt, this.bodies);
      if (!ally.alive && ally.deadFor > 2.5) { const model = ally.dispose(); if (model) this.pool.push(model); this.allies.splice(i, 1); }
    }
    this.gunfire.update(dt);
  }

  /**
   * While the lift moves, nobody may stand on its footprint. Survival Round keeps the lift's resting
   * collision for the whole round (rebuilding navigation stalls a frame), so Raptures, squad members
   * and the player are simply shoved to the nearest edge instead.
   */
  private clearDeck(): void {
    const edge = SHAFT_HALF_WIDTH + .1;
    const shove = (p: Vector3, radius: number): void => {
      const reach = edge + radius;
      const x=p.x-ELEVATOR_ORIGIN.x,z=p.z-ELEVATOR_ORIGIN.z;
      if (Math.abs(x) >= reach || Math.abs(z) >= reach) return;
      if(this.elevator?.isVault){p.z=ELEVATOR_ORIGIN.z-reach;return;}
      if (reach - Math.abs(x) < reach - Math.abs(z)) p.x = ELEVATOR_ORIGIN.x+Math.sign(x || 1) * reach;
      else p.z = ELEVATOR_ORIGIN.z+Math.sign(z || -1) * reach;
    };
    for (const target of this.init.field.targets) if (target.alive && target.scale > .01) shove(target.position, target.radius);
    for (const ally of this.allies) if (ally.alive && !ally.riding) shove(ally.position, ALLY.radius);
    if (!this.init.player.transported) shove(this.init.player.position, .45);
  }

  /** One at first, growing toward five as the round goes on. */
  private squadSize(): number {
    const most = Math.min(5, 1 + Math.floor(this.delivery / 2));
    const room = MAX_SQUAD - this.count;
    return Math.max(0, Math.min(room, 1 + Math.floor(this.random() * most)));
  }

  /** Load models into the pool one at a time, each hidden and its shaders compiled ahead of use. */
  /** Test Range: one squad member beside the player (from the pool, loading one more if it's empty). */
  async spawnAlly(): Promise<boolean> {
    if (!this.pool.length) await this.preload(1);
    const model = this.pool.shift();
    if (!model || this.disposed) return false;
    const { player, field } = this.init;
    const yaw = this.random() * Math.PI * 2;
    const spot = field.navigation.project({ x: player.position.x + Math.sin(yaw) * 2.5, z: player.position.z + Math.cos(yaw) * 2.5 }, ALLY.radius);
    const ally = new Ally(this, model.chibi, model.rig, model.name, model.weapon, new Vector3(spot.x, 0, spot.z), this.allies.length, player.lean);
    ally.disembark();
    this.allies.push(ally);
    field.squad.push(ally);
    return true;
  }

  /** Test Range: a health crate on the ground just ahead of the player. */
  dropCrate(): void {
    const { player, field } = this.init;
    const spot = field.navigation.project({ x: player.position.x + Math.sin(player.aimYaw) * 2, z: player.position.z + Math.cos(player.aimYaw) * 2 }, .6);
    this.crateOnLift = false;
    this.crate.position.set(spot.x, .35, spot.z);
    this.crate.setEnabled(true);
    this.crateReady = true;
  }

  /** Off the field (dead or disposed): Raptures stop choosing it. */
  leave(ally: Ally): void {
    const squad = this.init.field.squad, i = squad.indexOf(ally);
    if (i >= 0) squad.splice(i, 1);
    for (const target of this.init.field.targets) if (target.victim === ally) target.victim = null;
  }

  /** Load, rig and compile the whole squad pool. Called once, before the round is shown. */
  async preload(count = POOL_SIZE): Promise<void> {
    const index = await loadChibiIndex().catch(() => null);
    if (!index) return;
    // Consecutive models from one random start: eight different NIKKEs (and every weapon type
    // but at most one) in each round's pool.
    const start = Math.floor(this.random() * SQUAD_MODELS.length);
    const picks = Array.from({ length: count }, (_, i) => SQUAD_MODELS[(start + i) % SQUAD_MODELS.length]);
    const loaded = await Promise.all(picks.map(async (id) => {
      const meta = index.variants[id];
      const chibi = meta ? await Chibi.load(this.init.scene, meta).catch(() => null) : null;
      return chibi ? { chibi, id } : null;
    }));
    for (const entry of loaded) {
      if (!entry) continue;
      const { chibi, id } = entry;
      if (this.disposed) { chibi.dispose(); continue; }
      chibi.root.setEnabled(false);
      for (const mesh of chibi.meshes) this.init.shadows.addShadowCaster(mesh);
      this.pool.push({ chibi, rig: new TwinStickRig(chibi), name: SQUAD_NAMES[id] ?? 'NIKKE', weapon: SQUAD_WEAPONS[MODEL_WEAPONS[id] ?? 'assault'] });
    }
    // Anime unit materials (one refresh for all), then compile them so the cage coming up never
    // stalls on first sight.
    this.init.refreshUnits?.();
    await Promise.all(this.pool.flatMap(({ chibi }) => chibi.meshes.map((mesh) => mesh.material?.forceCompilationAsync(mesh).catch(() => undefined))));
  }

  /** Put this delivery's squad and crate on the cage (hidden until it starts back up). */
  private board(size: number): void {
    this.crateRiding = !this.crateReady;
    if (this.crateRiding) { this.crateOnLift = true; this.crate.position.set(ELEVATOR_ORIGIN.x, (this.elevator?.transportHeight ?? 0) + .35, ELEVATOR_ORIGIN.z); }
    const chibis = this.pool.splice(0, size);
    const lean = this.init.player.lean;
    chibis.forEach(({ chibi, rig, name, weapon }, i) => {
      const across = (i - (chibis.length - 1) / 2) * 1.1;
      const at = new Vector3(ELEVATOR_ORIGIN.x+Math.max(-SHAFT_HALF_WIDTH + .6, Math.min(SHAFT_HALF_WIDTH - .6, across)), 0, ELEVATOR_ORIGIN.z+(i % 2 ? .9 : -.9));
      this.allies.push(new Ally(this, chibi, rig, name, weapon, at, this.allies.length, lean));
    });
  }

  private arrive(): void {
    if (this.crateRiding) { this.crateReady = true; this.crateRiding = false; }
    const joined = this.allies.filter((a) => a.riding);
    for (const ally of joined) { ally.disembark(); this.init.field.squad.push(ally); }
    const label=this.elevator?.isVault?'Vault delivery':'Supply lift';
    this.banner(`${label} ? ${joined.length ? `${joined.length} NIKKE${joined.length>1?'s':''} joined` : 'Delivery complete'}${this.crateReady?' ? health crate ready':''}`);
  }

  dispose(): void {
    this.disposed = true;
    this.init.scene.onAfterAnimationsObservable.remove(this.afterAnimations);
    for (const ally of this.allies) ally.dispose(true);
    this.allies.length = 0;
    this.gunfire.dispose();
    for (const { chibi, rig } of this.pool) { rig.dispose(); chibi.dispose(); }
    this.pool.length = 0;
    this.init.shadows.removeShadowCaster(this.crate);
    this.crate.dispose(); this.crateMaterial.dispose(false, true);
  }
}

function flat(a: { x: number; z: number }, b: { x: number; z: number }): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}
