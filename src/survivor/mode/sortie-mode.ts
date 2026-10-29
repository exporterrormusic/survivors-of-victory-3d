// A playable sortie on the test-range plaza (?run=test-range&mode=sortie): the lift drops you
// at the south edge, the director spawns the horde while Alert climbs, sites pay loot and field
// kits, a lift tower can be restored, and you extract by holding a lift platform, or you die.
// Optional query values: alert=<seconds per level>, grace=<seconds>, seed=<number>.

import { Vector3, type Scene, type ShadowGenerator } from '@babylonjs/core';
import type { CharacterId } from '../../characters/ids';
import { operationZone } from '../../frontend/profile/StageData';
import { EnemyAttackPacing } from '../enemy-attack';
import type { SurvivorCamera } from '../camera';
import type { ScreenPoint } from '../hud';
import type { CharacterKit } from '../kit';
import type { Player } from '../player';
import type { Run } from '../run';
import type { SnowField } from '../snow-field';
import type { TargetField } from '../targets';
import type { Vfx } from '../vfx';
import { AlertClock } from './alert';
import { CORE_GROUPS, DEFAULT_TUNING, SpawnDirector, pickSpawnPoint, type Point } from './director';
import { ExitSet, type ExitInit } from './exits';
import { FIELD_KITS, FIELD_KIT_IDS, type CombatStats } from './field-kits';
import { Horde } from './horde';
import { Ledger } from './ledger';
import { applyProgress, recordTrip } from './progress';
import { seededRandom } from './rng';
import { raptureSpec } from './roster';
import { SalvageRunJob, Sortie, type SortieEvent } from './sortie';
import { ResultsScreen } from './results-screen';
import { SortieHud, type Marker } from './sortie-hud';
import { FEATURES } from '../../features';
import { SITE_KINDS, SiteSet, type SiteInit } from './sites';
import { SiteView } from './site-view';
import { TelegraphLayer, groundHeight } from './telegraph';
import type { CoopSquad } from '../coop/coop-squad';

export interface SortieModeInit {
  readonly scene: Scene;
  readonly shadows: ShadowGenerator;
  readonly vfx: Vfx;
  readonly field: TargetField;
  readonly run: Run;
  readonly player: Player;
  readonly kit: CharacterKit;
  readonly camera: SurvivorCamera;
  readonly snow?: SnowField;
  readonly toScreen: (x: number, y: number, z: number) => ScreenPoint;
  readonly arenaRadius: number;
  readonly params: URLSearchParams;
  /** experimental co-op squad (?coop=bot); absent in normal play */
  readonly coop?: CoopSquad;
  /** whose saved level and ranks the run starts from, and where the trip's result is saved */
  readonly characterId: CharacterId;
  /** name and banner art (a path under public/) for the results screen */
  readonly nikke: { readonly name: string; readonly art: string | null };
  /** give newly loaded unit models (the supply squad) the anime unit materials */
  readonly refreshUnits?: () => void;
}

/** Test-range layout: arrival lift south, a dormant tower north, sites around the plaza. */
const TEST_RANGE_EXITS: ExitInit[] = [
  { id: 'arrival', kind: 'arrival', x: 0, z: -25 },
  { id: 'tower-north', kind: 'shaft', x: 0, z: 24 },
];
const TEST_RANGE_SITES: SiteInit[] = [
  { id: 'tower-north', kind: 'shaft', x: 0, z: 24 },
  { id: 'crate-w', kind: 'priority', x: -21, z: -3 },
  { id: 'crate-e', kind: 'priority', x: 22, z: 7 },
  { id: 'crate-n', kind: 'priority', x: -10, z: 17 },
  { id: 'cache-1', kind: 'cache', x: 9, z: -14 },
  { id: 'cache-2', kind: 'cache', x: -15, z: -17 },
  { id: 'cache-3', kind: 'cache', x: 25, z: -9 },
  { id: 'cache-4', kind: 'cache', x: 14, z: 19 },
  { id: 'cache-5', kind: 'cache', x: -26, z: 9 },
  { id: 'wreck', kind: 'wreck', x: -17, z: 23 },
  { id: 'scrambler', kind: 'scrambler', x: 12, z: 3 },
  { id: 'med', kind: 'med', x: -5, z: 3 },
  { id: 'module', kind: 'module', x: 24, z: 19 },
  { id: 'terminal', kind: 'terminal', x: -26, z: -8 },
];
/** The test plaza is ~68 m across, so the horde is thinner than a full 160 m sector's. */
const TEST_RANGE_TUNING = { ...DEFAULT_TUNING, budgetPerSecond: [1, 1.5, 2.1, 2.8, 3.5], maxAlive: [24, 36, 50, 66, 80] };
const SPAWN_TYPES = ['lure', 'crawler', 'pelican', 'capra', 'tripod', 'thermite'];
const HUNTER = 'thermite';

interface PendingSpawn { type: string; count: number; tries: number }

/** Back to the front end's Stage Select (the Ark), with the last selected NIKKE. */
export function returnToArk(): void {
  location.assign(`${location.pathname}?preview=stage-select`);
}

export class SortieMode {
  readonly sortie: Sortie;
  private readonly init: SortieModeInit;
  private readonly hud = new SortieHud();
  private readonly tells: TelegraphLayer;
  private readonly horde: Horde;
  private readonly director: SpawnDirector;
  private readonly view: SiteView;
  /** shared by every behavior that uses the laser attack, so only a couple charge at once */
  private readonly pacing: EnemyAttackPacing;
  private readonly random: () => number;
  private readonly pending: PendingSpawn[] = [];
  private readonly baseStats: CombatStats;
  private shownKits = -1;
  /** the NIKKE's level when she deployed, for the results screen */
  private levelBefore = 1;
  private results: ResultsScreen | null = null;

  private constructor(init: SortieModeInit, horde: Horde, tells: TelegraphLayer, pacing: EnemyAttackPacing) {
    this.init = init;
    this.horde = horde;
    this.tells = tells;
    this.pacing = pacing;
    const seed = Number(init.params.get('seed')) || (Date.now() & 0xffffff);
    this.random = seededRandom(seed);
    const alertSeconds = Number(init.params.get('alert')) || 90;
    const grace = init.params.has('grace') ? Number(init.params.get('grace')) : 10;
    const ledger = new Ledger();
    // Snow White's turret count isn't exposed to field kits yet, so Turret Parts can't drop.
    ledger.kits.allowed = FIELD_KIT_IDS.filter((id) => id !== 'turretParts');
    // Module cases hold NIPMH modules, which are switched off for the first version.
    const sites = new SiteSet(TEST_RANGE_SITES.filter((site) => site.kind !== 'module' || FEATURES.nipmh));
    const exits = new ExitSet(TEST_RANGE_EXITS);
    this.sortie = new Sortie({
      sites, exits, ledger, job: new SalvageRunJob(3), random: this.random,
      alert: new AlertClock(alertSeconds), arrivalGrace: grace,
    });
    this.director = new SpawnDirector(this.random, CORE_GROUPS, TEST_RANGE_TUNING);
    this.view = new SiteView(init.scene, init.shadows, tells, sites, exits);
    const { kit, run } = init;
    // Deploy as the saved NIKKE, before field kits take their base stats from the kit.
    applyProgress(run, init.characterId);
    this.levelBefore = run.level;
    this.baseStats = {
      damage: 1, magazine: kit.weapon.magazine, reload: kit.weapon.reload, moveSpeed: kit.weapon.moveSpeed,
      critChance: run.critChance, burstPerHit: run.burstPerHit, specialCharges: 0,
    };
    // Start on the arrival lift.
    const lift = exits.get('arrival')!;
    init.player.position.set(lift.x, 0, lift.z);
    init.camera.snap(init.player.position);
    // Every zone runs on the test plaza until its sector map exists; only the weather differs.
    this.hud.banner(`${operationZone(init.params.get('zone') ?? '').name} · ${this.sortie.job.title}`, 4, 'good');
  }

  static async create(init: SortieModeInit): Promise<SortieMode> {
    const tells = new TelegraphLayer(init.scene, groundHeight(init.snow));
    const pacing = new EnemyAttackPacing();
    const horde = new Horde(init.field, {
      player: init.player, field: init.field, run: init.run, vfx: init.vfx, tells, snow: init.snow,
      pacing, arenaRadius: init.arenaRadius,
    });
    await horde.load([...SPAWN_TYPES]);
    return new SortieMode(init, horde, tells, pacing);
  }

  get ended(): boolean { return this.sortie.ended; }

  /** Leave from the pause menu: ends the trip as a defeat and shows the results. */
  abandon(): void {
    for (const event of this.sortie.abandon()) this.handle(event);
  }

  /** Living horde size (for tests and the console). */
  get alive(): number { return this.horde.counts().total; }

  /** Dev/test helper: spawn one Rapture of a loaded type at (x, z). */
  debugSpawn(key: string, x: number, z: number): void { this.horde.spawn(key, x, z); }

  update(dt: number): void {
    const { player } = this.init;
    const sortie = this.sortie;
    if (!sortie.ended && dt > 0) {
      for (const event of sortie.update(dt, { x: player.position.x, z: player.position.z, hp: player.hp })) this.handle(event);
    }
    if (!sortie.ended && dt > 0) {
      if (sortie.spawning) {
        for (const request of this.director.update(dt, sortie.alert.level, this.horde.counts())) {
          for (const member of request.members) this.pending.push({ type: member.type, count: member.count, tries: 0 });
        }
      }
      this.flushSpawns();
      this.pacing.update(dt);
      for (const _hunter of this.horde.update(dt)) {
        const level = sortie.hunterKilled();
        this.hud.banner(`Hunter down · Alert ${level} · +1 Pristine Core`, 4, 'good');
      }
    }
    this.tells.update(dt);
    this.view.update();
    this.applyFieldKits();
    this.updateHud(dt);
    // A close shot of the NIKKE beside the results panel (the main loop updates the camera next).
    if (this.results) this.init.camera.hold(this.init.player.position, this.results.standX);
  }

  private handle(event: SortieEvent): void {
    const { hud, sortie } = this;
    switch (event.type) {
      case 'phase':
        if (event.phase === 'search') hud.banner('Gates open · search the area', 3, 'info');
        break;
      case 'alert':
        hud.banner(`Alert ${event.level} · ${sortie.alert.name}`, 3, event.level >= 4 ? 'warn' : 'info');
        break;
      case 'site': {
        const { loot, site } = event;
        if (loot.heal) {
          const player = this.init.player;
          player.hp = Math.min(player.maxHp, player.hp + loot.heal * player.maxHp);
        }
        const parts = [SITE_KINDS[site.kind].label];
        if (loot.salvage) parts.push(`◆ ${loot.salvage}`);
        if (loot.credits) parts.push(`+${loot.credits} cr`);
        if (loot.fieldKit) parts.push(FIELD_KITS[loot.fieldKit].name);
        if (loot.heal) parts.push('Healed');
        if (loot.modules) parts.push('Module');
        if (site.kind !== 'shaft' && site.kind !== 'scrambler') hud.banner(parts.join(' · '), 2.5, 'good');
        this.init.vfx.ring(new Vector3(site.x, 0, site.z), [.3, .9, 1], .4, site.radius, .4, .8);
        break;
      }
      case 'exit-restored': hud.banner('Lift tower restored · a second way out', 3.5, 'good'); break;
      case 'scrambled': hud.banner(`Signal scrambled · Alert ${event.level}`, 3, 'good'); break;
      case 'revealed': hud.banner('Sector data recovered', 3, 'good'); break;
      case 'job-complete': hud.banner(`${sortie.job.title} complete · get to a lift`, 4, 'good'); break;
      case 'hunter': {
        const at = this.spawnPoint();
        if (at) this.horde.spawn(HUNTER, at.x, at.z, 1, true);
        hud.banner('A Hunter is tracking you', 4, 'warn');
        break;
      }
      case 'extracted':
      case 'defeated': {
        const results = sortie.results!;
        const player = this.init.player;
        if (event.type === 'defeated') player.trainingReset = 0;
        recordTrip(this.init.run, this.init.characterId, results);
        hud.setSticky('');
        hud.clearForResults();
        // Extracted: the gates have closed and she's gone down the shaft, so the horde leaves the
        // shot. A defeat keeps the moment she fell.
        if (event.type === 'extracted') this.horde.clear();
        const { run, nikke, params } = this.init;
        const zone = operationZone(params.get('zone') ?? '');
        this.results = new ResultsScreen(document.getElementById('hud')!, {
          results, kills: run.kills,
          zone: { name: zone.name, image: `${import.meta.env.BASE_URL}${zone.previewPath}` },
          nikke: { ...nikke, levelBefore: this.levelBefore, level: run.level, xp: run.xp, xpToNext: run.xpToNext },
        }, returnToArk);
        break;
      }
    }
  }

  private spawnPoint(): Point | null {
    const { player, arenaRadius, snow } = this.init;
    return pickSpawnPoint(this.random, { x: player.position.x, z: player.position.z }, (p) =>
      Math.hypot(p.x, p.z) <= arenaRadius - 2 && (!snow?.enabled || snow.canOccupy(p.x, p.z, 1.2)), undefined, 14, 24);
  }

  /** Each group member set spawns clustered at one off-screen point; misses retry next frame. */
  private flushSpawns(): void {
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const request = this.pending[i];
      const at = this.spawnPoint();
      if (!at) {
        if (++request.tries > 120) this.pending.splice(i, 1);
        continue;
      }
      const spread = raptureSpec(request.type).radius * 2.2;
      for (let n = 0; n < request.count; n++) {
        const angle = n * 2.39996, r = spread * Math.sqrt(n);
        this.horde.spawn(request.type, at.x + Math.cos(angle) * r, at.z + Math.sin(angle) * r);
      }
      this.pending.splice(i, 1);
    }
  }

  private applyFieldKits(): void {
    const kits = this.sortie.ledger.kits;
    if (kits.total === this.shownKits) return;
    this.shownKits = kits.total;
    const s = kits.apply(this.baseStats);
    const { kit, run } = this.init;
    kit.weapon.magazine = s.magazine;
    kit.weapon.reload = s.reload;
    run.critChance = s.critChance;
    run.burstPerHit = s.burstPerHit;
    run.damageScale = s.damage;
  }

  private updateHud(dt: number): void {
    const { hud, sortie } = this;
    const { player, toScreen } = this.init;
    const job = sortie.job;
    hud.setObjective(job.done ? 'Get to a lift' : job.title, job.done ? `${job.title} complete` : job.line(),
      sortie.ledger.carried.salvage, sortie.ledger.carried.salvage > 0 && sortie.alert.level >= 4);
    hud.setAlert(sortie.alert.level, sortie.alert.name, sortie.alert.nextIn, sortie.phase !== 'arrival');
    hud.setKits(sortie.ledger.kits.entries());
    const boarding = sortie.exits.boardingExit;
    const site = sortie.sites.active;
    hud.setSticky(sortie.ended ? '' : boarding ? `Gates closing ${Math.ceil(boarding.gatesRemaining)}`
      : site ? `${SITE_KINDS[site.kind].label} ${Math.floor(site.fraction * 100)}%` : '');
    hud.update(dt);

    const markers: Marker[] = [];
    if (!sortie.ended) {
      const rect = document.getElementById('hud')!.getBoundingClientRect();
      // Keep markers inside the play area: clear of the clock/banner above and the dock below
      // (sizes from the HUD's 1771 × 888 reference, like survivor.css --k).
      const k = Math.min(rect.width / 1771, rect.height / 888);
      const left = 60 * k, right = rect.width - 60 * k, top = 160 * k, bottom = rect.height - 300 * k;
      const origin = toScreen(player.position.x, 1, player.position.z);
      const add = (kind: Marker['kind'], x: number, z: number, label: string) => {
        const p = toScreen(x, 1.6, z);
        const inside = p.visible && p.x > left && p.x < right && p.y > top && p.y < bottom;
        if (inside) { markers.push({ kind, x: p.x, y: p.y - 40 * k, label, offscreen: false }); return; }
        // Off screen: walk from the hero toward the point (screen up = north) and stop at the edge.
        let dx = x - player.position.x, dy = -(z - player.position.z);
        const len = Math.hypot(dx, dy) || 1; dx /= len; dy /= len;
        const tx = dx > 0 ? (right - origin.x) / dx : dx < 0 ? (left - origin.x) / dx : Infinity;
        const ty = dy > 0 ? (bottom - origin.y) / dy : dy < 0 ? (top - origin.y) / dy : Infinity;
        const t = Math.max(0, Math.min(tx, ty));
        markers.push({ kind, x: origin.x + dx * t, y: origin.y + dy * t, label, offscreen: true });
      };
      for (const exit of sortie.exits.exits) {
        const d = Math.round(exit.distanceTo(player.position.x, player.position.z));
        if (d < 4) continue;
        add(exit.active ? 'exit' : 'tower', exit.x, exit.z, `${exit.active ? 'Lift' : 'Tower'} ${d} m`);
      }
      for (const hunter of this.horde.hunters()) {
        const d = Math.round(Math.hypot(hunter.position.x - player.position.x, hunter.position.z - player.position.z));
        add('hunter', hunter.position.x, hunter.position.z, `Hunter ${d} m`);
      }
    }
    hud.setMarkers(markers);
  }

  dispose(): void {
    const { kit, run } = this.init;
    kit.weapon.magazine = this.baseStats.magazine;
    kit.weapon.reload = this.baseStats.reload;
    run.critChance = this.baseStats.critChance;
    run.burstPerHit = this.baseStats.burstPerHit;
    run.damageScale = 1;
    this.horde.dispose();
    this.view.dispose();
    this.tells.dispose();
    this.hud.dispose();
    this.results?.dispose();
  }
}
