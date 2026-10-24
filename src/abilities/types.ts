// Ability data. A kit (src/characters/<id>/kit.ts) is plain data made of these types: the hero's
// cast states (hero.ts) take timing and animation from `cast`, and the shared effect runner
// (effects.ts) turns `effects` into Combat calls. Nothing here is written per hero.

export type Slot = 'Q' | 'W' | 'E' | 'R' | 'D' | 'Z' | 'B' | 'T';
/** Slots a kit defines. Z (mount), B (hearth) and T (emote) are shared; see common.ts. */
export type KitSlot = 'Q' | 'W' | 'E' | 'R';
export type AimShape = 'line' | 'circle' | 'dash' | 'cone' | 'none';

/** Effect colour as a hex string, e.g. '#ff8c40'. */
export type Tint = string;

/**
 * Debuffs: slow, stun (no actions), root (no movement), burn (damage over time), vulnerable
 * (takes more damage). Buffs: invulnerable, shield (absorbs damage), haste (move speed),
 * frenzy (attack speed), empower (damage dealt), fortify (takes less damage).
 */
export type StatusKind =
  | 'slow' | 'stun' | 'root' | 'burn' | 'vulnerable'
  | 'invulnerable' | 'shield' | 'haste' | 'frenzy' | 'empower' | 'fortify';

export interface StatusSpec {
  readonly kind: StatusKind;
  readonly duration: number;
  /** slow, vulnerable, haste, frenzy, empower, fortify: a fraction (0.3 = 30%); burn: damage per second; shield: hit points */
  readonly amount?: number;
}

/** Healing: flat hit points, a fraction of the target's max HP, or both. */
export interface HealSpec {
  readonly flat?: number;
  readonly percent?: number;
}

/** A persistent circle on the ground. Rates are per second while a unit stands inside. */
export interface ZoneSpec {
  readonly radius: number;
  readonly duration: number;
  readonly tint: Tint;
  readonly damage?: number;
  readonly heal?: HealSpec;
  /** kept on enemies inside, refreshed each tick */
  readonly status?: StatusSpec;
  /** kept on allies inside */
  readonly allyStatus?: StatusSpec;
}

/** A temporary allied unit. It fights with the lane-minion AI (src/enemy.ts). */
export interface SummonSpec {
  readonly name: string;
  /**
   * 'caster': the caster's own field model (clones); 'turret': the built-in turret prop;
   * or another chibi model (public/chibi/<variant>.glb), e.g. one Nikke calling in another.
   */
  readonly model:
    | 'caster' | 'turret'
    | { readonly variant: string; readonly aim: 'weapon' | 'head' }
    | { readonly rapture: 'lure' | 'pelican' | 'crawler' };
  readonly hp: number;
  readonly damage: number;
  readonly range: number;
  /** seconds between attacks */
  readonly cooldown: number;
  readonly lifetime: number;
  /** follow the caster between fights, or hold the spot it was placed on */
  readonly behaviour: 'follow' | 'guard';
  /** 0 for turrets */
  readonly speed: number;
  /** colour multiplier for the model, 1 = unchanged; above 1 glows */
  readonly tint?: readonly [number, number, number];
  /** most alive at once per caster; the oldest expires early */
  readonly limit?: number;
}

export type Effect =
  /** straight projectile from the muzzle along the aim; `count` of them fan out across `spread` radians */
  | {
    readonly kind: 'bolt'; readonly damage: number; readonly range: number; readonly pierce?: boolean;
    readonly size?: number; readonly tint?: Tint; readonly speed?: number; readonly status?: StatusSpec;
    readonly count?: number; readonly spread?: number; readonly knockback?: number;
  }
  /** shell lobbed to the aim point; on landing it hits enemies in `radius` and may leave a zone */
  | {
    readonly kind: 'lob'; readonly damage: number; readonly radius: number; readonly flight?: number;
    readonly tint?: Tint; readonly status?: StatusSpec; readonly zone?: ZoneSpec; readonly knockback?: number;
  }
  /** instant hit on enemies in a sector in front of the caster; `angle` is its full width in radians */
  | {
    readonly kind: 'cone'; readonly range: number; readonly angle: number; readonly tint: Tint;
    readonly damage?: number; readonly status?: StatusSpec; readonly knockback?: number;
  }
  /** persistent area at the aim point or under the caster */
  | { readonly kind: 'zone'; readonly at: 'aim' | 'self'; readonly zone: ZoneSpec }
  /** instant circle: damage and status to enemies, healing and status to allies */
  | {
    readonly kind: 'nova'; readonly at: 'aim' | 'self'; readonly radius: number; readonly tint: Tint;
    readonly damage?: number; readonly status?: StatusSpec; readonly heal?: HealSpec; readonly allyStatus?: StatusSpec;
    readonly knockback?: number;
  }
  /** channelled line from the muzzle; runs for the whole channel (channel casts only) */
  | { readonly kind: 'beam'; readonly dps: number; readonly width: number; readonly length: number; readonly tint?: Tint }
  /** status or healing on the caster */
  | { readonly kind: 'self'; readonly status?: StatusSpec; readonly heal?: HealSpec }
  | { readonly kind: 'summon'; readonly at: 'aim' | 'self'; readonly unit: SummonSpec; readonly count?: number }
  /** enemy minions in the circle fight for the caster for `duration`, then return to their side */
  | {
    readonly kind: 'convert'; readonly at: 'aim' | 'self'; readonly radius: number; readonly duration: number;
    readonly tint: Tint; readonly limit?: number;
  };

/**
 * How the hero performs a cast.
 *  shot:    one shot clip; effects leave FIRE_AT seconds into it.
 *  dash:    travel to the aim point (clamped to range) over `time`; effects fire on arrival.
 *  channel: aim_start, then aim_idle for `time`, then aim_end. Beams run for the channel;
 *           other effects fire when it starts.
 */
export type CastStyle =
  | { readonly kind: 'shot' }
  /** `invulnerable`: untouchable while travelling (charges, blinks) */
  | { readonly kind: 'dash'; readonly time: number; readonly invulnerable?: boolean }
  | { readonly kind: 'channel'; readonly time: number };

/** What a cast sounds like (src/audio/match-audio.ts); landing sounds come from the effects. */
export type CastSound = 'weapon' | 'special' | 'dash' | 'beam' | 'heal' | 'summon' | 'none';

export interface AbilityDefinition {
  readonly name: string;
  readonly desc: string;
  /** image path under public/; without one the HUD draws a glyph tile */
  readonly icon?: string;
  readonly cooldown: number;
  /** paid in the kit's resource: mana, fuel, or hit points */
  readonly cost: number;
  readonly aim: AimShape;
  readonly range: number;
  /** line and dash indicator width */
  readonly width?: number;
  /** circle indicator radius */
  readonly radius?: number;
  /** cone indicator width, radians */
  readonly angle?: number;
  readonly cast: CastStyle;
  readonly effects: readonly Effect[];
  readonly sound: CastSound;
}

export interface TraitDefinition {
  readonly name: string;
  readonly desc: string;
  readonly icon?: string;
  /** every Nth basic attack deals `multiplier` times damage; the HUD shows the count */
  readonly chargedShot?: { readonly every: number; readonly multiplier: number };
  /** basic attacks also hit enemies near the target for a fraction of their damage */
  readonly splash?: { readonly radius: number; readonly fraction: number };
  /** basic attacks apply this to what they hit */
  readonly onHit?: StatusSpec;
  /** damage dealt rises as health falls, up to +maxBonus (a fraction) near zero health */
  readonly rage?: { readonly maxBonus: number };
  /** a shield of `amount` that refills after `delay` seconds without taking damage */
  readonly guard?: { readonly amount: number; readonly delay: number };
  /** `fraction` of damage taken is stored, up to `max`, and added to the next basic attack */
  readonly redirect?: { readonly fraction: number; readonly max: number };
}

/** Weapon mechanics, independent of the character's ability kit and sound family. */
export type WeaponStyle =
  | { readonly kind: 'sniper' | 'assault' | 'minigun'; readonly speed: number }
  | { readonly kind: 'smg'; readonly speed: number; readonly separation: number }
  | { readonly kind: 'shotgun'; readonly speed: number; readonly pellets: number; readonly spread: number }
  | { readonly kind: 'rocket'; readonly speed: number; readonly radius: number }
  | { readonly kind: 'sword'; readonly angle: number }
  | { readonly kind: 'beam'; readonly width: number };

export interface BasicAttack {
  readonly weapon: WeaponStyle;
  /** Initial trigger wind-up. Sustained fire uses period, never the model's clip length. */
  readonly windup: number;
  /** edge to edge, like HotS */
  readonly range: number;
  /** seconds between attacks */
  readonly period: number;
  /** Total damage per volley (split between SMG rounds / shotgun pellets); beam damage per ammo tick. */
  readonly damage: number;
  /** Maximum projectile / beam reach in either control scheme. */
  readonly aimedRange: number;
  readonly tint?: Tint;
  readonly size?: number;
  /** shots before a reload of `reload` seconds, during which there are no basic attacks */
  readonly magazine?: { readonly size: number; readonly reload: number };
}

/** What abilities cost. */
export type ResourceSpec =
  | { readonly kind: 'mana'; readonly max: number; readonly regen: number }
  /** refills at `regen` per second once nothing has been spent for `delay` seconds */
  | { readonly kind: 'fuel'; readonly max: number; readonly regen: number; readonly delay: number }
  /** abilities cost hit points, and cannot be cast if they would be fatal */
  | { readonly kind: 'health' };

export interface HeroStats {
  readonly hp: number;
  /** units per second; the chibi is about 2 units tall */
  readonly moveSpeed: number;
  readonly resource: ResourceSpec;
}

/** Basic abilities; R comes from `Kit.heroics`. */
export type BasicSlot = 'Q' | 'W' | 'E';

export interface Kit {
  readonly stats: HeroStats;
  readonly basic: BasicAttack;
  readonly trait: TraitDefinition;
  readonly abilities: Readonly<Record<BasicSlot, AbilityDefinition>>;
  /** R options; the player picks one (HotS: at level 10) */
  readonly heroics: readonly [AbilityDefinition, ...AbilityDefinition[]];
}

/** What the HUD, tooltips, targeting and cast checks need from any slot. */
export interface SlotInfo {
  readonly name: string;
  readonly desc: string;
  readonly icon?: string;
  /** fallback art when there is no icon */
  readonly glyph: string;
  readonly cooldown: number;
  /** in the kit's resource; 0 for shared slots and the trait */
  readonly cost: number;
  readonly aim: AimShape;
  readonly range: number;
  readonly width?: number;
  readonly radius?: number;
  readonly angle?: number;
  readonly passive: boolean;
}
