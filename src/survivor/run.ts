// One survivor run's shared state and the damage path every kit uses: crits on weapon hits,
// Burst gauge from weapon hits, kill XP, floating damage numbers. Values follow Survivors of
// Victory (RunState.ts, SurvivorGameScene.damageEnemy).

import type { Vector3 } from '@babylonjs/core';
import type { Target } from './targets';
import { talents } from '../characters/snow-white/talents';
import { RunTalents } from './talents';
import { talents as scarletTalents } from '../characters/scarlet/talents';
import { SCARLET_TRACKS } from './scarlet/ranks';
import { talents as rapunzelTalents } from '../characters/rapunzel/talents';
import { RAPUNZEL_TRACKS } from './rapunzel/ranks';
import { TalentTiers, type TierTalent } from './talent-tiers';
import { SNOW_WHITE_TALENTS } from './snow-white/tiers';
import { SCARLET_TALENTS } from './scarlet/tiers';
import { RAPUNZEL_TALENTS } from './rapunzel/tiers';

import { talents as nayutaTalents } from '../characters/nayuta/talents';
import { NAYUTA_TALENTS } from './nayuta/tiers';

export type DamageSource = 'attack' | 'special' | 'burst' | 'effect';

export interface DamageNumber {
  x: number;
  y: number;
  z: number;
  value: number;
  crit: boolean;
  age: number;
}

/** Survivors' standard level curve (RunState.requiredExperience): XP to go from `level` to the next. */
const xpToNext = (level: number) => level === 1 ? 79 * 5
  : (Math.round((4 * (level + 1)) ** 2.1) - Math.round((4 * level) ** 2.1)) * 5;
/** XP per training target; real enemies will carry their own */
const KILL_XP = 40;
/** a new wave every 30 seconds, as in Survivors */
const WAVE_SECONDS = 30;
const CRIT_MULTIPLIER = 1.5;
const NUMBER_LIFE = .75;
/** Talent-tier heroes grow 4% in damage and health every level, as in Heroes of the Storm. */
const LEVEL_GROWTH = 1.04;
/** Tiered gauge: the first enemy a shot pierces gives the full amount, later ones a little, capped per shot. */
const EXTRA_PIERCE_GAUGE = 2, SHOT_GAUGE_CAP = 15;
/** Second Wind: gauge back per Burst kill, capped per Burst. */
const BURST_KILL_GAUGE = 3, BURST_REFUND_CAP = 30;

export class Run {
  /** Modes can tune leveling without altering the ordered talent costs or effects. */
  experienceCurve: (level:number)=>number = xpToNext;
  /** multiplies every XP gain; a mode can steer pacing with it (the survival round's catch-up) */
  xpScale = 1;
  maxLevel = Infinity;
  /** Burst gauge, 0..100 */
  burst = 0;
  /** Rapture jam zones the player stands in (jammer pools): the gauge can't fill while any are */
  readonly burstJams = new Set<object>();
  /** Training-range option; missions leave normal gauge consumption enabled. */
  burstAlwaysMax = false;
  level = 1;
  skillPoints = 0;
  readonly talents: RunTalents;
  /** HotS-style picks (Snow White); null for heroes still on ordered rank tracks. */
  readonly tiers: TalentTiers | null = null;
  /** a talent quest was just completed */
  onQuestComplete: ((talent: TierTalent) => void) | null = null;
  private shotGauge = 0;
  private shotHits = 0;
  private burstRefund = 0;
  constructor(readonly characterId: 'snow-white' | 'scarlet' | 'rapunzel' | 'nayuta' | 'dorothy' = 'snow-white') {
    this.talents = new RunTalents(characterId === 'dorothy' ? [] : characterId === 'nayuta' ? nayutaTalents : characterId === 'rapunzel' ? rapunzelTalents : characterId === 'scarlet' ? scarletTalents : talents,
      characterId === 'dorothy' || characterId === 'nayuta' ? [] : characterId === 'rapunzel' ? RAPUNZEL_TRACKS : characterId === 'scarlet' ? SCARLET_TRACKS : undefined,
      null);
    const tierSet = characterId === 'dorothy' ? { abilities: { weapon: 'Ungrateful OZ', special: 'Angel’s Flight', burst: 'Paradise Lost', utility: 'Talents pending' }, tiers: [] } : characterId === 'nayuta' ? NAYUTA_TALENTS : characterId === 'snow-white' ? SNOW_WHITE_TALENTS : characterId === 'scarlet' ? SCARLET_TALENTS : RAPUNZEL_TALENTS;
    if (tierSet) {
      this.tiers = new TalentTiers(tierSet);
      this.talents.addSource(this.tiers);
    }
    if (characterId === 'dorothy') { this.critChance = .15; this.burstPerHit = 2; }
    if (characterId === 'nayuta') { this.critChance = .2; this.burstPerHit = 1.2; }
    if (characterId === 'rapunzel') { this.critChance = .1; this.burstPerHit = 10; }
    if (characterId === 'scarlet') { this.critChance = .25; this.burstPerHit = 5; }
  }
  get characterName(): string { return this.characterId === 'dorothy' ? 'Dorothy' : this.characterId === 'nayuta' ? 'Nayuta' : this.characterId === 'rapunzel' ? 'Rapunzel' : this.characterId === 'scarlet' ? 'Scarlet' : 'Snow White'; }
  xp = 0;
  kills = 0;
  time = 0;
  readonly numbers: DamageNumber[] = [];
  private readonly burns = new Map<Target, Map<string, { dps: number; remaining: number; tick: number; generation: number }>>();
  /** weapon hit: crit chance and Burst gauge per hit */
  critChance = .3;
  burstPerHit = 7;
  /** multiplies every hit (game-mode field kits) */
  damageScale = 1;
  /** multiplies every hit while a hero passive is active (src/survivor/passives.ts) */
  passiveScale = 1;
  onKill: ((target: Target) => void) | null = null;
  onHit: ((target: Target) => void) | null = null;

  get xpToNext(): number { return this.experienceCurve(this.level); }
  /** Damage and health multiplier from levels (1 for rank-track heroes). */
  get growth(): number { return this.tiers ? LEVEL_GROWTH ** (this.level - 1) : 1; }

  /** A new weapon shot: its pierced hits share one gauge allowance. */
  beginShot(): void { this.shotGauge = this.shotHits = 0; }
  /** A new Burst: Second Wind's refund cap starts over. */
  beginBurst(): void { this.burstRefund = 0; }

  /** Gain one level now (Weather Lab testing). */
  grantLevel(): void {
    if (this.level >= this.maxLevel) return;
    this.gainXp(Math.max(0, this.xpToNext - this.xp));
  }
  get wave(): number { return Math.floor(this.time / WAVE_SECONDS) + 1; }

  addBurst(amount: number): void {
    if (this.burstJams.size) return;
    this.burst = Math.min(100, this.burst + amount);
  }

  spendBurst(): boolean {
    if (this.burstAlwaysMax) { this.burst = 100; return true; }
    if (this.burst < 100) return false;
    const roll = this.talents.has('goddess_no_yield') ? Math.random() : 1;
    this.burst = roll < .25 ? 100 : roll < .5 ? 50 : 0;
    return true;
  }

  burn(target: Target, source: string, dps: number, duration: number): void {
    if (!target.alive) return;
    let burns = this.burns.get(target);
    if (!burns) this.burns.set(target, burns = new Map());
    const previous = burns.get(source);
    burns.set(source, { dps, remaining: duration, tick: previous?.generation === target.generation ? previous.tick : 0, generation: target.generation });
  }

  /** Read the authoritative DoT state without giving presentation ownership of its timers. */
  isBurning(target: Target, source?: string): boolean {
    // Status effects ask for every target every frame, so no intermediate array.
    if (!target.alive) return false;
    if (source !== undefined) {
      const burn = this.burns.get(target)?.get(source);
      return !!burn && burn.generation === target.generation && burn.remaining > 0;
    }
    for (const burn of this.burns.get(target)?.values() ?? []) if (burn.generation === target.generation && burn.remaining > 0) return true;
    return false;
  }

  /** Damage a target. Returns the damage dealt (after a crit) or 0 if it was already down. */
  damage(target: Target, amount: number, source: DamageSource, knock?: Vector3): number {
    if (!target.alive) return 0;
    const crit = source === 'attack' && Math.random() < this.critChance;
    const raw = Math.round(amount * this.damageScale * this.passiveScale * this.growth * target.damageMultiplier * (crit ? CRIT_MULTIPLIER : 1));
    // Direct shots are stopped by the shield itself (TargetField.shieldContact); the ward soaks splash.
    const dealt = target.ward && source !== 'attack' ? target.ward.absorb(raw, target) : raw;
    // Quests ask whether the target was burning or bleeding; burns end with the target.
    const burning = this.tiers !== null && this.isBurning(target);
    const killed = target.hit(dealt, knock);
    if (dealt > 0) this.onHit?.(target);
    if (source === 'attack') this.addBurst(this.tiers ? this.shotGaugeFor() : this.burstPerHit);
    this.numbers.push({ x: target.position.x + (Math.random() - .5) * .5, y: target.barHeight * .8, z: target.position.z, value: dealt, crit, age: 0 });
    if (this.numbers.length > 60) this.numbers.shift();
    if (killed) {
      this.kills++;
      this.gainXp(KILL_XP);
      if (this.tiers) {
        if (source === 'burst' && this.talents.has('burst_gauge') && this.burstRefund < BURST_REFUND_CAP) {
          const refund = Math.min(BURST_KILL_GAUGE, BURST_REFUND_CAP - this.burstRefund);
          this.burstRefund += refund;
          this.addBurst(refund);
        }
        for (const talent of this.tiers.recordKill({ marked: target.marked, burning, source })) this.onQuestComplete?.(talent);
      } else if (source === 'burst' && this.talents.has('burst_gauge') && Math.random() < .5) this.addBurst(this.burstPerHit);
      this.onKill?.(target);
    }
    return dealt;
  }

  /** Flood damage is raw world damage, independent of weapon talents, shields and crits. */
  environmentDamage(target:Target,amount:number):void {
    if(!target.alive)return;
    const killed=target.hit(amount);
    if(killed){this.kills++;this.gainXp(KILL_XP);this.onKill?.(target);}
  }

  private shotGaugeFor(): number {
    const gain = Math.max(0, Math.min(this.shotHits === 0 ? this.burstPerHit : EXTRA_PIERCE_GAUGE, SHOT_GAUGE_CAP - this.shotGauge));
    this.shotHits++;
    this.shotGauge += gain;
    return gain;
  }

  gainXp(amount: number): void {
    if(this.level>=this.maxLevel)return;
    this.xp += amount * this.xpScale;
    while (this.xp >= this.xpToNext && this.level<this.maxLevel) {
      this.xp -= this.xpToNext;
      this.level++;
      this.skillPoints++;
    }
    if(this.level>=this.maxLevel)this.xp=0;
  }

  update(dt: number): void {
    if (dt <= 0) return;
    this.time += dt;
    // Inferno: anything burning, whatever set it alight, is slowed.
    const inferno = this.talents.has('inferno');
    for (const [target, burns] of this.burns) {
      if (inferno && target.alive && burns.size) target.slowed = Math.max(target.slowed, .2);
      for (const [source, burn] of burns) {
        if (!target.alive || target.generation !== burn.generation) { burns.delete(source); continue; }
        const elapsed = Math.min(dt, burn.remaining);
        burn.remaining -= elapsed;
        burn.tick += elapsed;
        // Half-second ticks preserve small damage amounts without rounding every frame to zero.
        if (burn.tick >= .5 - 1e-6 || burn.remaining <= 1e-6) {
          this.damage(target, burn.dps * burn.tick, 'effect');
          burn.tick = 0;
        }
        if (burn.remaining <= 1e-6) burns.delete(source);
      }
      if (!burns.size) this.burns.delete(target);
    }
    for (let i = this.numbers.length - 1; i >= 0; i--) {
      const n = this.numbers[i];
      n.age += dt;
      if (n.age >= NUMBER_LIFE) this.numbers.splice(i, 1);
    }
  }
}

export { NUMBER_LIFE };
