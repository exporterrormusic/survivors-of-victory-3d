import type { DamageSource } from "../../../gameplay/systems/AbilityTypes";
import { getNipmh, type NipmhId } from "../domain/NipmhCatalog";
import type { NipmhEffect } from "../domain/NipmhTypes";

export interface NipmhEchoRequest {
  readonly damageMultiplier: number;
  readonly retarget: boolean;
}

export interface NipmhStormRequest {
  readonly damageMultiplier: number;
  readonly radius: number;
}

export interface NipmhKillResult {
  readonly broadcast?: Extract<NipmhEffect, { kind: "kill-broadcast" }>;
  readonly burst: number;
  readonly readySkill: boolean;
}

export interface NipmhDamageResult {
  readonly damage: number;
  readonly shielded: boolean;
}

export interface NipmhUpdateResult {
  readonly healRatio: number;
}

type EnemyClass = "boss" | "elite" | "none" | "super";

export class NipmhCombatRuntime {
  private attackCount = 0;
  private broadcastCooldown = 0;
  private broadcastKills = 0;
  private lastWave = 1;
  private nullCooldown = 0;
  private primaryHitCount = 0;
  private regenerationAccumulator = 0;
  private reviveAvailable: boolean;
  private shieldCharges: number;
  private timeSinceDamage = 0;
  private waveHasteRemaining: number;
  private readonly effects: readonly NipmhEffect[];

  public constructor(public readonly equippedIds: readonly NipmhId[]) {
    this.effects = equippedIds.map((id) => getNipmh(id).effect);
    this.shieldCharges = this.effect("initial-shield")?.instances ?? 0;
    this.reviveAvailable = this.effect("revive-once") !== undefined;
    this.waveHasteRemaining = this.effect("wave-opening-haste")?.duration ?? 0;
  }

  public get initialBurst(): number {
    if (this.burstDisabled) return 0;
    return this.effects
      .filter((effect) => effect.kind === "initial-burst")
      .reduce((total, effect) => total + effect.amount * 100, 0);
  }

  public get burstDisabled(): boolean {
    return this.effect("closed-circuit") !== undefined;
  }

  public get naturalBurstMultiplier(): number {
    if (this.burstDisabled) return 0;
    return this.effect("damage-tradeoff")?.burstGainMultiplier ?? 1;
  }

  public get experienceMultiplier(): number {
    return this.effect("experience-multiplier")?.multiplier ?? 1;
  }

  public get criticalChanceBonus(): number {
    return this.effect("critical-chance")?.amount ?? 0;
  }

  public get criticalDamageMultiplier(): number {
    return this.effect("critical-damage")?.multiplier ?? 1;
  }

  public get skillCooldownMultiplier(): number {
    return this.effect("closed-circuit")?.skillCooldownMultiplier ?? 1;
  }

  public get projectileNullReady(): boolean {
    return (
      this.effect("projectile-null") !== undefined && this.nullCooldown <= 0
    );
  }

  public get projectileNullRange(): number {
    return this.effect("projectile-null")?.range ?? 0;
  }

  public get remainingShieldCharges(): number {
    return this.shieldCharges;
  }

  public get contactPushDistance(): number {
    return this.effect("contact-buffer")?.pushDistance ?? 0;
  }

  public update(delta: number, wave: number): NipmhUpdateResult {
    const previousTimeSinceDamage = this.timeSinceDamage;
    this.timeSinceDamage += delta;
    this.broadcastCooldown = Math.max(0, this.broadcastCooldown - delta);
    this.nullCooldown = Math.max(0, this.nullCooldown - delta);
    if (wave !== this.lastWave) {
      this.lastWave = wave;
      this.waveHasteRemaining =
        this.effect("wave-opening-haste")?.duration ?? 0;
    } else {
      this.waveHasteRemaining = Math.max(0, this.waveHasteRemaining - delta);
    }

    const regeneration = this.effect("regeneration");
    if (
      regeneration === undefined ||
      this.timeSinceDamage < regeneration.delayAfterDamage
    ) {
      this.regenerationAccumulator = 0;
      return { healRatio: 0 };
    }
    this.regenerationAccumulator += Math.max(
      0,
      this.timeSinceDamage -
        Math.max(previousTimeSinceDamage, regeneration.delayAfterDamage),
    );
    let healRatio = 0;
    while (this.regenerationAccumulator >= regeneration.interval) {
      this.regenerationAccumulator -= regeneration.interval;
      healRatio += regeneration.ratio;
    }
    return { healRatio };
  }

  public movementMultiplier(): number {
    const haste = this.effect("wave-opening-haste");
    return haste !== undefined && this.waveHasteRemaining > 0
      ? haste.movementMultiplier
      : 1;
  }

  public attackCooldownMultiplier(
    healthRatio: number,
    infiniteAmmoWeapon: boolean,
  ): number {
    let multiplier = 1;
    const lowHealth = this.effect("low-health-cadence");
    if (lowHealth !== undefined && healthRatio <= lowHealth.belowHealthRatio)
      multiplier *= lowHealth.fireRateMultiplier;
    const reload = this.effect("reload-or-cadence");
    if (reload !== undefined && infiniteAmmoWeapon)
      multiplier *= reload.infiniteAmmoFireRateMultiplier;
    const haste = this.effect("wave-opening-haste");
    if (haste !== undefined && this.waveHasteRemaining > 0)
      multiplier *= haste.fireRateMultiplier;
    return multiplier;
  }

  public reloadSpeedMultiplier(healthRatio: number): number {
    let multiplier = 1;
    const lowHealth = this.effect("low-health-cadence");
    if (lowHealth !== undefined && healthRatio <= lowHealth.belowHealthRatio)
      multiplier *= lowHealth.reloadSpeedMultiplier;
    multiplier *= this.effect("reload-or-cadence")?.reloadSpeedMultiplier ?? 1;
    return multiplier;
  }

  public damageMultiplier(
    healthRatio: number,
    distance: number,
    source: DamageSource,
  ): number {
    if (source === "nipmh") return 1;
    let multiplier = 1;
    const tradeoff = this.effect("damage-tradeoff");
    if (tradeoff !== undefined && (source === "attack" || source === "special"))
      multiplier *= tradeoff.multiplier;
    const redline = this.effect("damage-at-low-health");
    const tier = redline?.tiers.find(
      ({ belowHealthRatio }) => healthRatio <= belowHealthRatio,
    );
    multiplier *= tier?.multiplier ?? 1;
    const longRange = this.effect("long-range-damage");
    if (
      longRange !== undefined &&
      source === "attack" &&
      distance >= longRange.distance
    )
      multiplier *= longRange.multiplier;
    return multiplier;
  }

  public onPrimaryFired(): NipmhEchoRequest | undefined {
    const echo = this.effect("primary-echo");
    if (echo === undefined) return undefined;
    this.attackCount += 1;
    if (this.attackCount < echo.everyAttacks) return undefined;
    this.attackCount = 0;
    return {
      damageMultiplier: echo.damageMultiplier,
      retarget: echo.retarget,
    };
  }

  public onPrimaryHit(): NipmhStormRequest | undefined {
    const storm = this.effect("storm-trigger");
    if (storm === undefined) return undefined;
    this.primaryHitCount += 1;
    if (this.primaryHitCount < storm.everyHits) return undefined;
    this.primaryHitCount = 0;
    return { damageMultiplier: storm.damageMultiplier, radius: storm.radius };
  }

  public onEnemyKilled(enemyClass: EnemyClass): NipmhKillResult {
    const eliteSignal = this.effect("elite-kill-signal");
    const elite = enemyClass !== "none";
    const result: NipmhKillResult = {
      burst: elite && !this.burstDisabled ? (eliteSignal?.burst ?? 0) : 0,
      readySkill: elite && (eliteSignal?.readySkill ?? false),
    };
    const broadcast = this.effect("kill-broadcast");
    if (broadcast === undefined) return result;
    this.broadcastKills += 1;
    if (this.broadcastKills < broadcast.kills || this.broadcastCooldown > 0)
      return result;
    this.broadcastKills = 0;
    this.broadcastCooldown = broadcast.cooldown;
    return { ...result, broadcast };
  }

  public absorbDamage(damage: number, source: string): NipmhDamageResult {
    if (damage <= 0) return { damage: 0, shielded: false };
    if (this.shieldCharges > 0) {
      this.shieldCharges -= 1;
      return { damage: 0, shielded: true };
    }
    let adjusted = damage;
    if (source.endsWith(":Collision"))
      adjusted *=
        1 - (this.effect("contact-buffer")?.contactDamageReduction ?? 0);
    if (isAreaDamage(source))
      adjusted *= 1 - (this.effect("area-damage-reduction")?.ratio ?? 0);
    return { damage: adjusted, shielded: false };
  }

  public recordDamageTaken(): void {
    this.timeSinceDamage = 0;
    this.regenerationAccumulator = 0;
  }

  public consumeProjectileNull(): void {
    const effect = this.effect("projectile-null");
    if (effect !== undefined) this.nullCooldown = effect.cooldown;
  }

  public consumeRevive():
    | { readonly healthRatio: number; readonly invulnerabilitySeconds: number }
    | undefined {
    const revive = this.effect("revive-once");
    if (revive === undefined || !this.reviveAvailable) return undefined;
    this.reviveAvailable = false;
    return {
      healthRatio: revive.healthRatio,
      invulnerabilitySeconds: revive.invulnerabilitySeconds,
    };
  }

  private effect<Kind extends NipmhEffect["kind"]>(
    kind: Kind,
  ): Extract<NipmhEffect, { kind: Kind }> | undefined {
    return this.effects.find(
      (effect): effect is Extract<NipmhEffect, { kind: Kind }> =>
        effect.kind === kind,
    );
  }
}

function isAreaDamage(source: string): boolean {
  const normalized = source.toLowerCase();
  return [
    "beam",
    "burning oil",
    "enrage",
    "explosion",
    "missile",
    "self-destruct",
  ].some((keyword) => normalized.includes(keyword));
}
