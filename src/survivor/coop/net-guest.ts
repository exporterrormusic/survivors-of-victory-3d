// Phase 2b (?coop=join&room=CODE): this game is a guest in someone else's match. The guest's own
// hero runs locally for instant controls and reports its position; the host owns every hit, kill,
// health bar and the round. Everything else here is a puppet of the host's snapshots: squadmates
// are full heroes walked to their snapshot pose (so their kits animate and fire for show), and
// Raptures are crowd targets that follow their snapshot pose. Local damage is switched off in
// main.ts (Run.damage), so a guest's shots show but only the host's copy of them counts.

import { Vector3 } from '@babylonjs/core';
import type { ArrivalElevator } from '../arrival-elevator';
import { ELEVATOR_DEPTH } from '../elevator-motion';
import { interpolate } from '../../net/interpolation';
import { CoopGuest } from '../../net/session';
import type { LobbyGuest } from '../../net/lobby';
import { joinTrysteroRoom } from '../../net/trystero-transport';
import type { EntityState, PlayerState } from '../../net/protocol';
import { enemyDeath } from '../enemy-death';
import { EnemyAttackPacing } from '../enemy-attack';
import { BoltField } from '../mode/behaviors/bolts';
import type { AttackEcho } from '../mode/behaviors/echo';
import { MissileVolley } from '../mode/behaviors/missiles';
import { SilentTelegraph, TelegraphLayer, groundHeight } from '../mode/telegraph';
import type { InputSource } from '../input';
import { minionType } from '../mode/horde';
import { ROSTER, type RaptureSpec } from '../mode/roster';
import type { Player } from '../player';
import type { Run } from '../run';
import type { Target } from '../targets';
import { heldBits, RemoteInput } from './remote-input';
import { Teammate, type HeroId, type TeammateWorld } from './teammate';
import { deckSpot } from './coop-squad';
import type { RoundInfo } from './net-host';
import { GuestRoundHud } from './guest-hud';

const INPUT_HZ = 30;
const HEROES: readonly HeroId[] = ['snow-white', 'scarlet', 'rapunzel', 'nayuta', 'dorothy'];
const SPECS = Object.values(ROSTER) as RaptureSpec[];

interface Puppet { mate: Teammate; input: RemoteInput }

export class CoopNetGuest {
  readonly session: CoopGuest;
  /** the host's round clock and squad level, from its once-a-second 'round' event */
  round: RoundInfo | null = null;
  /** when `round` arrived (performance.now), so the clock runs between updates */
  private roundAt = 0;
  private readonly hud: GuestRoundHud;
  private readonly heroes = new Map<number, Puppet>();
  private readonly loadingHeroes = new Set<number>();
  private readonly enemies = new Map<number, Target>();
  private readonly loadingKinds = new Set<string>();
  private readonly loadedKinds = new Set<string>();
  private sendIn = 0;
  /** our talent picks as last sent, and when to send them again (a pick made before the host had our hero is resent) */
  private sentPicks = '';
  private picksIn = 0;
  /** the host's ground warnings, mirrored */
  private readonly tells: TelegraphLayer;
  /** harmless copies of the host's bolts and missiles (their own warnings stay hidden: the mirror shows them) */
  private readonly bolts: BoltField;
  private readonly missiles: MissileVolley;
  /** the Survival arrival lift: the whole squad rides it up here too, until the host's round starts */
  private lift: ArrivalElevator | null = null;
  private openedGates = false;

  constructor(private readonly world: TeammateWorld, private readonly local: Player, private readonly input: InputSource,
    private readonly aim: () => Vector3, readonly code: string, hero: HeroId, name: string, lobby: LobbyGuest | null = null) {
    // From the Multiplayer lobby: its session, already joined; from a ?coop=join link: join now.
    this.hud = new GuestRoundHud(document.getElementById('hud')!, code);
    this.session = lobby?.session ?? new CoopGuest(joinTrysteroRoom(code), { name, character: hero }, { timeoutMs: 30000 });
    this.tells = new TelegraphLayer(world.scene, groundHeight(world.snow));
    // Replayed shots stop on our hero like the real ones, but never hurt: the host already decided that.
    const harmless = new Proxy(local, { get: (real, prop) => prop === 'takeDamage' ? () => false : Reflect.get(real, prop, real) });
    const replay = { player: harmless, field: world.targets, run: world.run, vfx: world.vfx, tells: new SilentTelegraph(world.scene),
      snow: world.snow, pacing: new EnemyAttackPacing(), arenaRadius: 80 };
    this.bolts = new BoltField(replay);
    this.missiles = new MissileVolley(replay);
    this.session.onEvent = event => {
      if (event.name === 'round') { this.round = event.data as RoundInfo; this.roundAt = performance.now(); }
      else if (event.name === 'banner') { const b = event.data as { text: string; seconds?: number }; this.hud.banner(String(b.text), b.seconds); }
      else if (event.name === 'attack') this.replay(event.data as AttackEcho);
    };
    this.session.onRoster = roster => {
      const present = new Set(roster.map(r => r.slot));
      for (const slot of [...this.heroes.keys()]) if (!present.has(slot)) this.dropHero(slot);
    };
    this.session.onLost = reason => { for (const slot of [...this.heroes.keys()]) this.dropHero(slot); this.hud.lost(reason); };
    this.session.onReturnToLobby = () => {
      location.assign(`${location.pathname}?preview=multiplayer&lobby=join&room=${encodeURIComponent(this.code)}`);
    };
  }

  get status(): string {
    const s = this.session;
    return s.state === 'joined' ? `slot ${s.slot}` : s.state;
  }

  /**
   * Start the arrival as Survival mode does on the host: our hero and every squadmate stand on the
   * sealed lift at the bottom of the shaft, and ride it up together.
   */
  arriveBy(elevator: ArrivalElevator): void {
    this.lift = elevator;
    this.local.transported = true;
    elevator.motion.height = -ELEVATOR_DEPTH; elevator.motion.gateOpen = 0; elevator.motion.seal = 1;
    elevator.command('rise'); elevator.update(0);
    this.ride();
  }

  get arriving(): boolean { return !!this.lift; }

  get teammates(): readonly Teammate[] { return Array.from(this.heroes.values(), puppet => puppet.mate); }

  /** After the local player's update; before targets. */
  update(dt: number, worldDt: number): void {
    const s = this.session;
    this.ride();
    if (s.state !== 'joined') return;
    this.bolts.update(worldDt);
    this.missiles.update(worldDt);
    this.tells.mirror(s.snapshots.latest?.tells ?? []);
    this.tells.update(dt);
    if ((this.sendIn -= dt) <= 0) {
      this.sendIn += 1 / INPUT_HZ;
      if (this.sendIn < 0) this.sendIn = 0;
      const [moveX, moveZ] = this.input.move();
      const p = this.local.position;
      const aim = this.aim();
      s.sendInput({ moveX, moveZ, aimX: aim.x, aimZ: aim.z, buttons: this.local.hp > 0 ? heldBits(this.input) : 0, x: p.x, z: p.z });
    }
    this.sendPicks(dt);
    const latest = s.snapshots.latest;
    const sample = s.snapshots.sample(performance.now() / 1000);
    if (!latest || !sample) return;
    const { players, entities } = interpolate(sample);
    this.applySelf(latest.players.find(p => p.slot === s.slot));
    this.applyHeroes(players.filter(p => p.slot !== s.slot), dt, worldDt);
    this.applyEnemies(entities);
    if (this.round) {
      const run = this.world.run;
      run.level = this.round.level; run.kills = this.round.kills;
      // The host's round clock (and so its wave number), running on between its updates.
      run.time = this.round.elapsed + (this.round.phase === 'arrival' ? 0 : (performance.now() - this.roundAt) / 1000);
    }
    this.hud.update(dt, this.round, this.world.run);
  }

  /** Hold everyone on the arrival lift's deck (deckSpot); step off when the host's round begins. */
  private ride(): void {
    const lift = this.lift;
    if (!lift) return;
    const started = !!this.round && this.round.phase !== 'arrival';
    const state = lift.state;
    if (state.height >= -.001 && state.action === 'idle' && !this.openedGates) { lift.command('open'); this.openedGates = true; }
    if (started && (state.action !== 'idle' || state.height < -.001 || state.gateOpen < .999) && !this.openedGates) {
      // Joined after the host's lift had already arrived: the lift is simply open at the top.
      lift.motion.height = 0; lift.motion.gateOpen = 1; lift.motion.seal = 0; lift.motion.phase = 'idle';
    }
    const release = started || (this.openedGates && state.gateOpen >= .999 && state.action === 'idle' && !this.round);
    const own = this.session.slot >= 0 ? this.session.slot : 1;
    const slots = [...new Set([0, own, ...this.session.roster.map(r => r.slot)])].sort((a, b) => a - b);
    const height = lift.transportHeight, hidden = lift.transportHidden;
    const place = (player: Player, slot: number) => {
      if (release) { player.transported = false; player.setTransportPose(0, false); player.unstick(); return; }
      const spot = deckSpot(Math.max(0, slots.indexOf(slot)), slots.length);
      player.transported = true;
      player.position.x = lift.root.position.x + spot.x; player.position.z = lift.root.position.z + spot.z;
      // Face the gates (−Z) for the ride up, as on the host.
      player.rig.legYaw = Math.PI;
      player.setTransportPose(height, hidden);
    };
    place(this.local, own);
    for (const [slot, { mate }] of this.heroes) place(mate.player, slot);
    if (release) this.lift = null;
  }

  /** Talents are picked on this machine (the normal picker); the host applies them to our hero there. */
  private sendPicks(dt: number): void {
    const tiers = this.world.run.tiers;
    if (!tiers) return;
    const chosen = tiers.tiers.map((_, tier) => tiers.chosenIndex(tier));
    const key = chosen.join();
    if (key === this.sentPicks && (this.picksIn -= dt) > 0) return;
    this.sentPicks = key; this.picksIn = 3;
    if (chosen.some(option => option !== null)) this.session.send({ name: 'talents', data: chosen });
  }

  /** After Babylon animates: puppet heroes' queued shots (for show). */
  afterAnimation(): void { for (const { mate } of this.heroes.values()) mate.player.afterAnimation(); }

  async close(): Promise<void> {
    for (const slot of [...this.heroes.keys()]) this.dropHero(slot);
    this.bolts.dispose(); this.missiles.dispose(); this.tells.dispose(); this.hud.dispose();
    await this.session.close();
  }

  /** The host decides our health: take it as is (no blending, so hits land when the host says). */
  private applySelf(state: PlayerState | undefined): void {
    if (!state) return;
    const p = this.local;
    if (state.hp < p.hp && state.hp > 0) p.damageFlash = .25;
    p.hp = state.hp;
    if (state.down) p.trainingReset = Infinity;
    else if (p.trainingReset === Infinity) { p.trainingReset = 0; p.grantInvulnerability(1.5, true); }
  }

  private applyHeroes(states: readonly PlayerState[], dt: number, worldDt: number): void {
    for (const state of states) {
      const puppet = this.heroes.get(state.slot);
      if (!puppet) { void this.addHero(state); continue; }
      const { mate, input } = puppet;
      const p = mate.player;
      if (this.lift) { p.hp = state.hp; mate.update(dt, input, input.aim, worldDt); continue; }
      // Walk toward the host's pose (so the legs animate), then sit exactly on it.
      const dx = state.x - p.position.x, dz = state.z - p.position.z, gap = Math.hypot(dx, dz);
      const move = gap > .05 ? Math.min(1, gap * 4) / gap : 0;
      input.apply({ seq: 0, moveX: dx * move, moveZ: dz * move,
        aimX: state.x + Math.sin(state.yaw) * 5, aimZ: state.z + Math.cos(state.yaw) * 5, buttons: state.buttons ?? 0 });
      p.hp = state.hp;
      p.trainingReset = state.down ? Infinity : 0;
      mate.update(dt, input, input.aim, worldDt);
      p.position.x = state.x; p.position.z = state.z;
    }
  }

  private async addHero(state: PlayerState): Promise<void> {
    if (this.loadingHeroes.has(state.slot)) return;
    this.loadingHeroes.add(state.slot);
    const hero = HEROES.includes(state.hero as HeroId) ? state.hero as HeroId : 'snow-white';
    const mate = await Teammate.create(this.world, state.slot, hero, new Vector3(state.x, 0, state.z), state.skin);
    disableLocalDamage(mate.run);
    this.loadingHeroes.delete(state.slot);
    if (this.session.state !== 'joined' || this.heroes.has(state.slot)) { mate.dispose(); return; }
    this.heroes.set(state.slot, { mate, input: new RemoteInput() });
    // In the squad list for overhead names and bars (no Rapture AI runs on a guest).
    this.world.targets.squad.push(mate);
    this.onHeroesChanged?.();
  }

  /** a hero model was added or removed (main.ts refreshes the toon pass's player materials) */
  onHeroesChanged: (() => void) | null = null;
  get heroMeshes() { return [...this.heroes.values()].flatMap(h => h.mate.meshes); }

  private dropHero(slot: number): void {
    const puppet = this.heroes.get(slot);
    if (!puppet) return;
    this.heroes.delete(slot);
    const squad = this.world.targets.squad, i = squad.indexOf(puppet.mate);
    if (i >= 0) squad.splice(i, 1);
    puppet.mate.dispose();
    this.onHeroesChanged?.();
  }

  private applyEnemies(states: readonly EntityState[]): void {
    const seen = new Set<number>();
    for (const state of states) {
      seen.add(state.id);
      let target = this.enemies.get(state.id);
      if (!target) {
        const spec = SPECS.find(s => s.model === state.kind);
        if (!spec) continue;
        if (!this.loadedKinds.has(spec.model)) { void this.loadKind(spec); continue; }
        target = this.world.targets.spawn(minionType(spec), new Vector3(state.x, 0, state.z), state.maxHp ?? spec.hp, { hover: spec.mobility !== 'ground' });
        target.pursues = false;
        this.enemies.set(state.id, target);
      }
      if (state.hp < target.hp) target.flash = .12;
      target.hp = state.hp;
      target.puppet = { x: state.x, z: state.z, yaw: state.yaw };
    }
    for (const [id, target] of this.enemies) {
      if (seen.has(id)) continue;
      this.enemies.delete(id);
      // Gone from the host's world: it died there (or left the field); collapse it here.
      target.puppet = null;
      target.alive = false; target.hp = 0;
      enemyDeath(this.world.vfx, target.position, target.radius * target.scale, target.barHeight * target.scale);
    }
  }

  private replay(echo: AttackEcho): void {
    const from = new Vector3(echo.x, echo.y, echo.z);
    if (echo.kind === 'bolt') this.bolts.fire(from, echo.yaw, echo.speed, 0, { range: echo.range, size: echo.size });
    else this.missiles.fire(from, echo.tx, echo.tz, { damage: 0, radius: echo.radius, flight: echo.flight, wait: echo.wait, side: echo.side, size: echo.size, loft: echo.loft });
  }

  private async loadKind(spec: RaptureSpec): Promise<void> {
    if (this.loadingKinds.has(spec.model)) return;
    this.loadingKinds.add(spec.model);
    await this.world.targets.ensureTypes([minionType(spec)]);
    this.loadedKinds.add(spec.model);
  }
}

/** A guest never deals damage itself: the host's copy of every shot does. Hits still spark here. */
export function disableLocalDamage(run: Run): void {
  run.damage = target => { if (target.alive) run.onHit?.(target); return 0; };
}
