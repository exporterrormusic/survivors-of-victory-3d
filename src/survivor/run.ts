// One survivor run's shared state and the damage path every kit uses: crits on weapon hits,
// Burst gauge from weapon hits, kill XP, floating damage numbers. Values follow Survivors of
// Victory (RunState.ts, SurvivorGameScene.damageEnemy).

import type { Vector3 } from '@babylonjs/core';
import type { Target } from './targets';
import { talents } from '../characters/snow-white/talents';
import { RunTalents } from './talents';
import { loadCapstone } from './capstone-loadout';

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

export class Run {
  /** Burst gauge, 0..100 */
  burst = 0;
  level = 1;
  skillPoints = 0;
  readonly talents = new RunTalents(talents, undefined, loadCapstone());
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
  onKill: ((target: Target) => void) | null = null;
  onHit: ((target: Target) => void) | null = null;

  get xpToNext(): number { return xpToNext(this.level); }
  get wave(): number { return Math.floor(this.time / WAVE_SECONDS) + 1; }

  addBurst(amount: number): void {
    this.burst = Math.min(100, this.burst + amount);
  }

  spendBurst(): boolean {
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

  /** Damage a target. Returns the damage dealt (after a crit) or 0 if it was already down. */
  damage(target: Target, amount: number, source: DamageSource, knock?: Vector3): number {
    if (!target.alive) return 0;
    const crit = source === 'attack' && Math.random() < this.critChance;
    const dealt = Math.round(amount * this.damageScale * target.damageMultiplier * (crit ? CRIT_MULTIPLIER : 1));
    const killed = target.hit(dealt, knock);
    if (dealt > 0) this.onHit?.(target);
    if (source === 'attack') this.addBurst(this.burstPerHit);
    this.numbers.push({ x: target.position.x + (Math.random() - .5) * .5, y: target.barHeight * .8, z: target.position.z, value: dealt, crit, age: 0 });
    if (this.numbers.length > 60) this.numbers.shift();
    if (killed) {
      this.kills++;
      this.gainXp(KILL_XP);
      if (source === 'burst' && this.talents.has('burst_gauge') && Math.random() < .5) this.addBurst(this.burstPerHit);
      this.onKill?.(target);
    }
    return dealt;
  }

  gainXp(amount: number): void {
    this.xp += amount;
    while (this.xp >= this.xpToNext) {
      this.xp -= this.xpToNext;
      this.level++;
      this.skillPoints++;
    }
  }

  update(dt: number): void {
    if (dt <= 0) return;
    this.time += dt;
    for (const [target, burns] of this.burns) {
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
