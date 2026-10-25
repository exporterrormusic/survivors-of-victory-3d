// One trip to the surface (GAME_PLAN §2): arrive by lift, search sites, do the job, get back to
// any working exit and hold its platform while the gates cycle. Engine-free: the runtime feeds
// it the player's position and health and acts on the events it returns.

import { AlertClock, MAX_ALERT } from './alert';
import type { ExitSet, Exit } from './exits';
import { rollSiteLoot, type Ledger, type Loot, type Purse } from './ledger';
import type { Random } from './rng';
import type { Site, SiteSet } from './sites';
import type { FieldKitId } from './field-kits';

export type SortiePhase = 'arrival' | 'search' | 'extracted' | 'defeated';

export type SortieEvent =
  | { type: 'phase'; phase: SortiePhase }
  | { type: 'alert'; level: number }
  | { type: 'site'; site: Site; loot: Loot }
  | { type: 'exit-restored'; exit: Exit }
  | { type: 'scrambled'; level: number }
  | { type: 'revealed' }
  | { type: 'job-complete' }
  | { type: 'hunter' }
  | { type: 'extracted'; exit: Exit }
  | { type: 'defeated' };

export interface Job {
  readonly title: string;
  readonly progress: number;
  readonly target: number;
  readonly done: boolean;
  /** credits paid on extraction if done */
  readonly reward: number;
  /** the objective's second line, e.g. "Crates 1/4" */
  line(): string;
  /** a site was completed; returns true if that advanced the job */
  onSite(site: Site): boolean;
}

/** Recover N priority crates (the existing "supply" objective, GAME_PLAN §4). */
export class SalvageRunJob implements Job {
  readonly title = 'Salvage Run';
  readonly reward = 300;
  readonly target: number;
  progress = 0;

  constructor(target: number) {
    this.target = target;
  }

  get done(): boolean { return this.progress >= this.target; }
  line(): string { return `Crates ${this.progress}/${this.target}`; }

  onSite(site: Site): boolean {
    if (site.kind !== 'priority' || this.done) return false;
    this.progress++;
    return true;
  }
}

export interface SortieResults {
  readonly outcome: 'extracted' | 'defeated';
  readonly time: number;
  readonly alertReached: number;
  readonly jobTitle: string;
  readonly jobProgress: number;
  readonly jobTarget: number;
  readonly jobDone: boolean;
  readonly jobReward: number;
  /** banked on extraction, or lost on defeat */
  readonly purse: Purse;
  readonly fieldKits: readonly { id: FieldKitId; count: number }[];
  readonly hunters: number;
  /** left from the pause menu; counts as a defeat */
  readonly abandoned: boolean;
}

export interface SortieInit {
  readonly sites: SiteSet;
  readonly exits: ExitSet;
  readonly ledger: Ledger;
  readonly job: Job;
  readonly random: Random;
  readonly alert?: AlertClock;
  /** no spawns for this long after the lift arrives */
  readonly arrivalGrace?: number;
  /** seconds between Hunters once Alert 5 is reached */
  readonly hunterEvery?: number;
}

export interface PlayerState {
  readonly x: number;
  readonly z: number;
  readonly hp: number;
}

export class Sortie {
  phase: SortiePhase = 'arrival';
  time = 0;
  readonly alert: AlertClock;
  readonly sites: SiteSet;
  readonly exits: ExitSet;
  readonly ledger: Ledger;
  readonly job: Job;
  /** seconds until the next Hunter, once Alert 5 is reached */
  hunterIn: number | null = null;
  huntersSent = 0;
  alertReached = 1;
  private results_: SortieResults | null = null;
  private readonly random: Random;
  private readonly arrivalGrace: number;
  private readonly hunterEvery: number;

  constructor(init: SortieInit) {
    this.sites = init.sites;
    this.exits = init.exits;
    this.ledger = init.ledger;
    this.job = init.job;
    this.random = init.random;
    this.alert = init.alert ?? new AlertClock();
    this.arrivalGrace = init.arrivalGrace ?? 10;
    this.hunterEvery = init.hunterEvery ?? 150;
  }

  get ended(): boolean { return this.phase === 'extracted' || this.phase === 'defeated'; }
  /** the director may spawn */
  get spawning(): boolean { return this.phase === 'search'; }
  get results(): SortieResults | null { return this.results_; }

  update(dt: number, player: PlayerState): SortieEvent[] {
    const events: SortieEvent[] = [];
    if (this.ended || dt <= 0) return events;
    this.time += dt;
    if (player.hp <= 0) { this.finish('defeated', null, events); return events; }
    if (this.phase === 'arrival' && this.time >= this.arrivalGrace) {
      this.phase = 'search';
      events.push({ type: 'phase', phase: 'search' });
    }
    // Alert only runs once the gates are open and the search is on.
    if (this.phase === 'search') {
      const level = this.alert.update(dt);
      if (level) {
        this.alertReached = Math.max(this.alertReached, level);
        events.push({ type: 'alert', level });
        if (level === MAX_ALERT && this.hunterIn === null) this.hunterIn = 0;
      }
      if (this.hunterIn !== null && this.alert.level === MAX_ALERT) {
        this.hunterIn -= dt;
        if (this.hunterIn <= 0) {
          this.hunterIn = this.hunterEvery;
          this.huntersSent++;
          events.push({ type: 'hunter' });
        }
      }
    }
    for (const site of this.sites.update(dt, player.x, player.z)) this.complete(site, events);
    const departed = this.exits.update(dt, player.x, player.z, this.phase === 'search');
    if (departed) this.finish('extracted', departed, events);
    return events;
  }

  /** Leaving from the pause menu counts as dying: XP is kept, carried loot is lost. */
  abandon(): SortieEvent[] {
    const events: SortieEvent[] = [];
    if (!this.ended) this.finish('defeated', null, events, true);
    return events;
  }

  /** The runtime reports a Hunter kill: Alert drops a level and it pays a Pristine Core. */
  hunterKilled(): number {
    this.ledger.take({ pristineCores: 1, credits: 200 });
    return this.alert.lower(1);
  }

  private complete(site: Site, events: SortieEvent[]): void {
    const loot = rollSiteLoot(site.kind, this.random, this.ledger.kits);
    this.ledger.take(loot);
    events.push({ type: 'site', site, loot });
    if (site.kind === 'shaft') {
      const exit = this.exits.activate(site.id);
      if (exit) events.push({ type: 'exit-restored', exit });
    } else if (site.kind === 'scrambler') {
      events.push({ type: 'scrambled', level: this.alert.lower(1) });
    } else if (site.kind === 'terminal') {
      events.push({ type: 'revealed' });
    }
    if (this.job.onSite(site) && this.job.done) events.push({ type: 'job-complete' });
  }

  private finish(outcome: 'extracted' | 'defeated', exit: Exit | null, events: SortieEvent[], abandoned = false): void {
    const fieldKits = this.ledger.kits.entries();
    const jobReward = outcome === 'extracted' && this.job.done ? this.job.reward : 0;
    if (jobReward) this.ledger.take({ credits: jobReward });
    const purse = outcome === 'extracted' ? this.ledger.bank() : this.ledger.lose();
    this.phase = outcome;
    this.results_ = {
      outcome, time: this.time, alertReached: this.alertReached,
      jobTitle: this.job.title, jobProgress: this.job.progress, jobTarget: this.job.target, jobDone: this.job.done,
      jobReward, purse, fieldKits, hunters: this.huntersSent, abandoned,
    };
    events.push(outcome === 'extracted' ? { type: 'extracted', exit: exit! } : { type: 'defeated' });
    events.push({ type: 'phase', phase: outcome });
  }
}
