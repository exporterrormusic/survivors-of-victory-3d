import type {
  NipmhCategory,
  NipmhDefinition,
  NipmhEffect,
  NipmhFamily,
  NipmhTag,
} from "./NipmhTypes";

const ART_ROOT = "assets/ui/nipmh/memories";

interface NipmhOptions {
  readonly artId?: string;
  readonly family?: NipmhFamily;
}

function defineNipmh<const Id extends string>(
  id: Id,
  name: string,
  category: NipmhCategory,
  cost: number,
  tags: readonly NipmhTag[],
  description: string,
  effect: NipmhEffect,
  options: NipmhOptions = {},
): NipmhDefinition<Id> {
  return Object.freeze({
    artPath: `${ART_ROOT}/${options.artId ?? id}.png`,
    category,
    cost,
    description,
    effect,
    family: options.family,
    id,
    name,
    tags,
  });
}

export const NIPMH_CATALOG = Object.freeze([
  defineNipmh(
    "severed-circuit",
    "Severed Circuit",
    "assault",
    3,
    ["PRIMARY", "SKILL", "BURST"],
    "Weapon and Skill damage +40%. Natural Burst gain is reduced by 50%.",
    { burstGainMultiplier: 0.5, kind: "damage-tradeoff", multiplier: 1.4 },
  ),
  defineNipmh(
    "redline-instinct",
    "Redline Instinct",
    "assault",
    2,
    ["LOW HP"],
    "Damage +15% below 75% HP, +30% below 50% HP, and +50% below 25% HP.",
    {
      kind: "damage-at-low-health",
      tiers: [
        { belowHealthRatio: 0.25, multiplier: 1.5 },
        { belowHealthRatio: 0.5, multiplier: 1.3 },
        { belowHealthRatio: 0.75, multiplier: 1.15 },
      ],
    },
  ),
  defineNipmh(
    "last-breath",
    "Last Breath",
    "assault",
    1,
    ["LOW HP", "PRIMARY"],
    "Below 25% HP, fire rate and reload speed increase by 25%.",
    {
      belowHealthRatio: 0.25,
      fireRateMultiplier: 0.8,
      kind: "low-health-cadence",
      reloadSpeedMultiplier: 1.25,
    },
  ),
  defineNipmh(
    "echo-chamber",
    "Echo Chamber",
    "assault",
    2,
    ["PRIMARY"],
    "Every fifth trigger pull repeats after 0.12 seconds for 60% damage. The echo consumes no ammo and generates no Burst.",
    {
      damageMultiplier: 0.6,
      everyAttacks: 5,
      kind: "primary-echo",
      retarget: false,
    },
    { family: "echo" },
  ),
  defineNipmh(
    "adaptive-echo",
    "Adaptive Echo",
    "assault",
    3,
    ["PRIMARY"],
    "Every fourth trigger pull repeats toward the nearest enemy for 75% damage.",
    {
      damageMultiplier: 0.75,
      everyAttacks: 4,
      kind: "primary-echo",
      retarget: true,
    },
    { family: "echo" },
  ),
  defineNipmh(
    "gentle-hands",
    "Steady Hands",
    "assault",
    1,
    ["PRIMARY", "CRITICAL"],
    "Critical chance increases by 8 percentage points.",
    { amount: 0.08, kind: "critical-chance" },
    { artId: "steady-hands" },
  ),
  defineNipmh(
    "sacred-hands",
    "Loaded Hands",
    "assault",
    2,
    ["PRIMARY"],
    "Reload 25% faster. Infinite-ammo weapons instead attack 10% faster.",
    {
      infiniteAmmoFireRateMultiplier: 0.9,
      kind: "reload-or-cadence",
      reloadSpeedMultiplier: 1.25,
    },
    { artId: "loaded-hands" },
  ),
  defineNipmh(
    "miracle-hands",
    "Miracle Trigger",
    "assault",
    3,
    ["CRITICAL"],
    "Critical hits deal 40% additional damage.",
    { kind: "critical-damage", multiplier: 1.4 },
    { artId: "miracle-trigger" },
  ),
  defineNipmh(
    "distant-thunder",
    "Longshot Relay",
    "assault",
    1,
    ["PRIMARY"],
    "Primary attacks deal +20% damage to enemies at least 500 pixels away.",
    { distance: 500, kind: "long-range-damage", multiplier: 1.2 },
    { artId: "longshot-relay" },
  ),
  defineNipmh(
    "silent-thunder",
    "Storm Trigger",
    "assault",
    3,
    ["PRIMARY", "AREA"],
    "Every twentieth primary hit calls down a lightning blast for 150% weapon damage.",
    {
      damageMultiplier: 1.5,
      everyHits: 20,
      kind: "storm-trigger",
      radius: 180,
    },
    { artId: "storm-trigger" },
  ),
  defineNipmh(
    "ignition-trace",
    "Ignition Trace",
    "control",
    1,
    ["STAGE START", "BURST"],
    "Begin each stage with 15% Burst.",
    { amount: 0.15, kind: "initial-burst" },
    { family: "ignition" },
  ),
  defineNipmh(
    "ignition-pattern",
    "Ignition Pattern",
    "control",
    2,
    ["STAGE START", "BURST"],
    "Begin each stage with 30% Burst.",
    { amount: 0.3, kind: "initial-burst" },
    { family: "ignition" },
  ),
  defineNipmh(
    "ignition-core",
    "Ignition Core",
    "control",
    3,
    ["STAGE START", "BURST"],
    "Begin each stage with 50% Burst.",
    { amount: 0.5, kind: "initial-burst" },
    { family: "ignition" },
  ),
  defineNipmh(
    "first-signal",
    "First Signal",
    "control",
    1,
    ["WAVE START", "PRIMARY"],
    "For the first 5 seconds of each wave, movement and fire rate increase by 20%.",
    {
      duration: 5,
      fireRateMultiplier: 0.8,
      kind: "wave-opening-haste",
      movementMultiplier: 1.2,
    },
  ),
  defineNipmh(
    "fading-signal",
    "Learning Signal",
    "control",
    1,
    ["EXPERIENCE"],
    "Experience gained increases by 15%.",
    { kind: "experience-multiplier", multiplier: 1.15 },
  ),
  defineNipmh(
    "final-signal",
    "Final Signal",
    "control",
    2,
    ["ELITE KILL", "SKILL", "BURST"],
    "Killing an elite or boss readies the Skill and grants 25 Burst.",
    { burst: 25, kind: "elite-kill-signal", readySkill: true },
  ),
  defineNipmh(
    "last-broadcast",
    "Last Broadcast",
    "control",
    3,
    ["AREA"],
    "Every 25 kills disrupts the battlefield. Normal enemies are stunned for 1 second; bosses are slowed for 3 seconds. 10-second cooldown.",
    {
      bossSlowDuration: 3,
      bossSlowMultiplier: 0.65,
      cooldown: 10,
      kills: 25,
      kind: "kill-broadcast",
      stunDuration: 1,
    },
  ),
  defineNipmh(
    "null-state",
    "Null State",
    "control",
    1,
    ["PROJECTILE", "DEFENSE"],
    "Every 10 seconds, destroys the closest enemy projectile within 240 pixels. The charge waits until a projectile enters range.",
    { cooldown: 10, kind: "projectile-null", range: 240 },
  ),
  defineNipmh(
    "closed-circuit",
    "Closed Circuit",
    "control",
    3,
    ["SKILL", "BURST"],
    "Skill cooldowns are 50% shorter, but Burst is disabled.",
    { kind: "closed-circuit", skillCooldownMultiplier: 0.5 },
  ),
  defineNipmh(
    "lingering-warmth",
    "Lingering Warmth",
    "sustain",
    1,
    ["DEFENSE"],
    "After 6 seconds without damage, recover 1% maximum HP every 2 seconds.",
    { delayAfterDamage: 6, interval: 2, kind: "regeneration", ratio: 0.01 },
    { family: "regeneration" },
  ),
  defineNipmh(
    "restorative-echo",
    "Restorative Echo",
    "sustain",
    2,
    ["DEFENSE"],
    "After 4 seconds without damage, recover 1.5% maximum HP every 2 seconds.",
    { delayAfterDamage: 4, interval: 2, kind: "regeneration", ratio: 0.015 },
    { family: "regeneration" },
  ),
  defineNipmh(
    "undying-memory",
    "Undying Memory",
    "sustain",
    3,
    ["DEFENSE"],
    "After 3 seconds without damage, recover 2% maximum HP every 2 seconds.",
    { delayAfterDamage: 3, interval: 2, kind: "regeneration", ratio: 0.02 },
    { family: "regeneration" },
  ),
  defineNipmh(
    "first-shelter",
    "First Shelter",
    "sustain",
    1,
    ["STAGE START", "DEFENSE"],
    "Block the first damaging hit of each stage.",
    { instances: 1, kind: "initial-shield" },
    { family: "shelter" },
  ),
  defineNipmh(
    "lasting-shelter",
    "Lasting Shelter",
    "sustain",
    2,
    ["STAGE START", "DEFENSE"],
    "Block the first 2 damaging hits of each stage.",
    { instances: 2, kind: "initial-shield" },
    { family: "shelter" },
  ),
  defineNipmh(
    "perfect-shelter",
    "Perfect Shelter",
    "sustain",
    3,
    ["STAGE START", "DEFENSE"],
    "Block the first 3 damaging hits of each stage.",
    { instances: 3, kind: "initial-shield" },
    { family: "shelter" },
  ),
  defineNipmh(
    "second-dawn",
    "Second Dawn",
    "sustain",
    3,
    ["DEFENSE"],
    "Once per stage, revive at 40% HP and gain 2 seconds of invulnerability.",
    { healthRatio: 0.4, invulnerabilitySeconds: 2, kind: "revive-once" },
  ),
  defineNipmh(
    "vanguard-beacon",
    "Kinetic Buffer",
    "sustain",
    1,
    ["DEFENSE"],
    "Contact damage is reduced by 30%. Enemies that touch you are pushed away.",
    { contactDamageReduction: 0.3, kind: "contact-buffer", pushDistance: 90 },
  ),
  defineNipmh(
    "sheltered-thunder",
    "Sheltered Thunder",
    "sustain",
    2,
    ["AREA", "DEFENSE"],
    "Damage from explosions, beams, and hostile ground areas is reduced by 35%.",
    { kind: "area-damage-reduction", ratio: 0.35 },
  ),
] as const);

export type NipmhId = (typeof NIPMH_CATALOG)[number]["id"];

const CATALOG_BY_ID = new Map<NipmhId, NipmhDefinition<NipmhId>>(
  NIPMH_CATALOG.map((definition) => [definition.id, definition]),
);

if (CATALOG_BY_ID.size !== NIPMH_CATALOG.length)
  throw new Error("NIPMH catalog IDs must be unique.");

export const STARTER_NIPMH_IDS = Object.freeze([
  "redline-instinct",
  "echo-chamber",
  "ignition-trace",
  "fading-signal",
  "lingering-warmth",
  "first-shelter",
] as const satisfies readonly NipmhId[]);

export function getNipmh(id: NipmhId): NipmhDefinition<NipmhId> {
  const definition = CATALOG_BY_ID.get(id);
  if (definition === undefined) throw new RangeError(`Unknown NIPMH: ${id}`);
  return definition;
}

export function isNipmhId(value: unknown): value is NipmhId {
  return typeof value === "string" && CATALOG_BY_ID.has(value as NipmhId);
}

export function nipmhUnlockCost(id: NipmhId): number {
  return STARTER_NIPMH_IDS.includes(id as (typeof STARTER_NIPMH_IDS)[number])
    ? 0
    : getNipmh(id).cost;
}
