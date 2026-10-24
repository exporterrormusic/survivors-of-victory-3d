export type NipmhCategory = "assault" | "control" | "sustain";

export type NipmhFamily = "echo" | "ignition" | "regeneration" | "shelter";

export type NipmhTag =
  | "AREA"
  | "BURST"
  | "CRITICAL"
  | "DEFENSE"
  | "ELITE KILL"
  | "EXPERIENCE"
  | "LOW HP"
  | "PRIMARY"
  | "PROJECTILE"
  | "SKILL"
  | "STAGE START"
  | "WAVE START";

export type NipmhEffect =
  | {
      readonly burstGainMultiplier: number;
      readonly kind: "damage-tradeoff";
      readonly multiplier: number;
    }
  | {
      readonly kind: "damage-at-low-health";
      readonly tiers: readonly {
        readonly belowHealthRatio: number;
        readonly multiplier: number;
      }[];
    }
  | {
      readonly belowHealthRatio: number;
      readonly fireRateMultiplier: number;
      readonly kind: "low-health-cadence";
      readonly reloadSpeedMultiplier: number;
    }
  | {
      readonly damageMultiplier: number;
      readonly everyAttacks: number;
      readonly kind: "primary-echo";
      readonly retarget: boolean;
    }
  | { readonly amount: number; readonly kind: "critical-chance" }
  | {
      readonly infiniteAmmoFireRateMultiplier: number;
      readonly kind: "reload-or-cadence";
      readonly reloadSpeedMultiplier: number;
    }
  | { readonly kind: "critical-damage"; readonly multiplier: number }
  | {
      readonly distance: number;
      readonly kind: "long-range-damage";
      readonly multiplier: number;
    }
  | {
      readonly damageMultiplier: number;
      readonly everyHits: number;
      readonly kind: "storm-trigger";
      readonly radius: number;
    }
  | { readonly amount: number; readonly kind: "initial-burst" }
  | {
      readonly duration: number;
      readonly fireRateMultiplier: number;
      readonly kind: "wave-opening-haste";
      readonly movementMultiplier: number;
    }
  | { readonly kind: "experience-multiplier"; readonly multiplier: number }
  | {
      readonly burst: number;
      readonly kind: "elite-kill-signal";
      readonly readySkill: boolean;
    }
  | {
      readonly bossSlowDuration: number;
      readonly bossSlowMultiplier: number;
      readonly cooldown: number;
      readonly kills: number;
      readonly kind: "kill-broadcast";
      readonly stunDuration: number;
    }
  | {
      readonly cooldown: number;
      readonly kind: "projectile-null";
      readonly range: number;
    }
  | {
      readonly kind: "closed-circuit";
      readonly skillCooldownMultiplier: number;
    }
  | {
      readonly delayAfterDamage: number;
      readonly interval: number;
      readonly kind: "regeneration";
      readonly ratio: number;
    }
  | { readonly instances: number; readonly kind: "initial-shield" }
  | {
      readonly healthRatio: number;
      readonly invulnerabilitySeconds: number;
      readonly kind: "revive-once";
    }
  | {
      readonly contactDamageReduction: number;
      readonly kind: "contact-buffer";
      readonly pushDistance: number;
    }
  | { readonly kind: "area-damage-reduction"; readonly ratio: number };

export interface NipmhDefinition<Id extends string = string> {
  readonly artPath: string;
  readonly category: NipmhCategory;
  readonly cost: number;
  readonly description: string;
  readonly effect: NipmhEffect;
  readonly family?: NipmhFamily;
  readonly id: Id;
  readonly name: string;
  readonly tags: readonly NipmhTag[];
}
