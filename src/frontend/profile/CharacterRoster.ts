import {
  DEFAULT_PERMANENT_UPGRADE_LEVELS,
  PERMANENT_UPGRADES,
  permanentUpgradeCost,
  type PermanentUpgradeId,
  type PermanentUpgradeLevels,
} from "./PermanentUpgrades";
import { isCharacterId, type CharacterId } from "./Ids";
import {
  CHARACTER_MODULES,
  ACTIVE_CHARACTER_IDS,
  type CharacterProfile,
} from "../../characters";
import {
  NIPMH_CATALOG,
  STARTER_NIPMH_IDS,
  isNipmhId,
  nipmhUnlockCost,
  type NipmhId,
} from "../features/nipmh";
import {
  readProfileSection,
  writeProfileSection,
} from "../persistence/ProfileStorage";

/** Character card data; each character's lives in src/characters/<id>/profile.ts. */
export type CharacterDefinition = CharacterProfile;

export { characterBurstArt as characterBurstPath } from "../../characters/assets";

export const CHARACTERS: readonly CharacterDefinition[] = ACTIVE_CHARACTER_IDS.map(
  (id) => CHARACTER_MODULES[id].profile,
);

/** Released characters. Prototype kits remain available separately in the test range. */
export function characterLockReason(id: CharacterId): string | undefined {
  return id === "snow-white" || id === "scarlet" || id === "rapunzel" ? undefined : "COMING SOON";
}

/** Unfinished trees are visible only in development/testing, never the shipped game. */
export function canPreviewCharacterTalents(id: CharacterId): boolean {
  return import.meta.env.DEV || characterLockReason(id) === undefined;
}

export const STARTER_CHARACTER_ID: CharacterId = "snow-white";
// Unfinished kits remain locked regardless of saved unlocks.
export const DEFAULT_UNLOCKED_CHARACTER_IDS: readonly CharacterId[] =
  [STARTER_CHARACTER_ID, "scarlet", "rapunzel"];
interface StoredRoster {
  readonly roundCoreReceipts?: unknown;
  readonly ownedSkinIds?: unknown;
  readonly equippedSkins?: unknown;
  readonly permanentUpgradeLevels?: unknown;
  readonly pristineCores?: unknown;
  readonly selectedCharacterId?: unknown;
  readonly unlockedCharacterIds?: unknown;
  readonly unlockedNipmhIds?: unknown;
}

export interface RosterState {
  roundCoreReceipts: string[];
  ownedSkinIds: string[];
  equippedSkins: Record<string, string>;
  permanentUpgradeLevels: PermanentUpgradeLevels;
  pristineCores: number;
  selectedCharacterId: CharacterId;
  unlockedCharacterIds: CharacterId[];
  unlockedNipmhIds: NipmhId[];
}

export function loadRosterState(): RosterState {
  const stored = readProfileSection<StoredRoster>("roster", {});

  // Normalize older saves that selected an unfinished character.
  const unlockedCharacterIds = [...DEFAULT_UNLOCKED_CHARACTER_IDS];
  const selectedCharacterId =
    isCharacterId(stored.selectedCharacterId) &&
    unlockedCharacterIds.includes(stored.selectedCharacterId)
      ? stored.selectedCharacterId
      : STARTER_CHARACTER_ID;

  return {
    roundCoreReceipts: Array.isArray(stored.roundCoreReceipts) ? stored.roundCoreReceipts.filter((id):id is string=>typeof id==='string').slice(-100) : [],
    ownedSkinIds: Array.isArray(stored.ownedSkinIds) ? stored.ownedSkinIds.filter((id): id is string => typeof id === 'string') : [],
    equippedSkins: stored.equippedSkins && typeof stored.equippedSkins === 'object' && !Array.isArray(stored.equippedSkins) ? Object.fromEntries(Object.entries(stored.equippedSkins).filter(([, value]) => typeof value === 'string')) : {},
    permanentUpgradeLevels: normalizeUpgradeLevels(
      stored.permanentUpgradeLevels,
    ),
    pristineCores:
      Number.isSafeInteger(stored.pristineCores) &&
      Number(stored.pristineCores) >= 0
        ? Number(stored.pristineCores)
        : 0,
    selectedCharacterId,
    unlockedCharacterIds,
    unlockedNipmhIds: normalizeUnlockedNipmhIds(stored.unlockedNipmhIds),
  };
}

export function saveSelectedCharacter(characterId: CharacterId): void {
  const state = loadRosterState();
  if (state.unlockedCharacterIds.includes(characterId)) {
    state.selectedCharacterId = characterId;
    saveRosterState(state);
  }
}

export function unlockCharacter(characterId: CharacterId): boolean {
  const character = CHARACTERS.find((entry) => entry.id === characterId);
  if (character === undefined || characterLockReason(characterId) !== undefined) return false;
  const state = loadRosterState();
  if (
    state.unlockedCharacterIds.includes(characterId) ||
    state.pristineCores < character.unlockCost
  )
    return false;
  state.pristineCores -= character.unlockCost;
  state.unlockedCharacterIds.push(characterId);
  saveRosterState(state);
  return true;
}

export function unlockNipmh(id: NipmhId): boolean {
  const state = loadRosterState();
  const cost = nipmhUnlockCost(id);
  if (state.unlockedNipmhIds.includes(id) || state.pristineCores < cost)
    return false;
  state.pristineCores -= cost;
  state.unlockedNipmhIds.push(id);
  saveRosterState(state);
  return true;
}

export function purchasePermanentUpgrade(id: PermanentUpgradeId): boolean {
  const upgrade = PERMANENT_UPGRADES.find((entry) => entry.id === id);
  if (upgrade === undefined) return false;
  const state = loadRosterState();
  const level = state.permanentUpgradeLevels[id];
  const cost = permanentUpgradeCost(upgrade, level);
  if (level >= upgrade.maxLevel || state.pristineCores < cost) return false;
  state.pristineCores -= cost;
  state.permanentUpgradeLevels[id] = level + 1;
  saveRosterState(state);
  return true;
}

export function awardPristineCores(amount: number): number {
  if (!Number.isSafeInteger(amount) || amount < 0)
    throw new RangeError("Pristine Cores must be a non-negative integer.");
  const state = loadRosterState();
  state.pristineCores += amount;
  saveRosterState(state);
  return state.pristineCores;
}

export function setAllContentUnlocked(unlocked: boolean): RosterState {
  const state = loadRosterState();
  state.unlockedCharacterIds = [...DEFAULT_UNLOCKED_CHARACTER_IDS];
  if (!state.unlockedCharacterIds.includes(state.selectedCharacterId))
    state.selectedCharacterId = STARTER_CHARACTER_ID;
  state.unlockedNipmhIds = unlocked
    ? NIPMH_CATALOG.map(({ id }) => id)
    : [...STARTER_NIPMH_IDS];
  saveRosterState(state);
  return state;
}

function normalizeUnlockedNipmhIds(value: unknown): NipmhId[] {
  const stored = Array.isArray(value) ? value.filter(isNipmhId) : [];
  return [...new Set<NipmhId>([...STARTER_NIPMH_IDS, ...stored])];
}

function normalizeUpgradeLevels(value: unknown): PermanentUpgradeLevels {
  const levels = { ...DEFAULT_PERMANENT_UPGRADE_LEVELS };
  if (value === null || typeof value !== "object") return levels;
  for (const upgrade of PERMANENT_UPGRADES) {
    const candidate = (value as Partial<Record<PermanentUpgradeId, unknown>>)[
      upgrade.id
    ];
    if (Number.isSafeInteger(candidate))
      levels[upgrade.id] = Math.max(
        0,
        Math.min(upgrade.maxLevel, Number(candidate)),
      );
  }
  return levels;
}

export function saveRosterState(state: RosterState): boolean {
  return writeProfileSection("roster", state);
}
