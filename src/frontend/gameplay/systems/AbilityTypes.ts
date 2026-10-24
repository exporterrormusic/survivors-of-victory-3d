export type DamageSource =
  | "attack"
  | "attack-effect"
  | "burst"
  | "dot"
  | "nipmh"
  | "reflected"
  | "special"
  | "summon";

export interface SpecialHudState {
  readonly charges: number;
  readonly cooldownProgress: number;
  readonly locked: boolean;
  readonly maxCharges: number;
}

export interface AbilityHudState {
  readonly burstFollowupReady?: boolean;
  readonly burstFollowupLabel?: string;
  readonly burstUnlocked: boolean;
  readonly commander?: {
    readonly contractName?: string;
    readonly contractValue: number;
    readonly goddessRemaining: number;
    readonly paidStacks: number;
    readonly queenActive: boolean;
    readonly queenSignal: number;
  };
  readonly marian?: {
    readonly blackLight: number;
    readonly blackLightOverdrive: boolean;
    readonly blackLightVisible: boolean;
    readonly burstRemaining: number;
    readonly maxBlackLight: number;
  };
  readonly special: SpecialHudState;
}
