import { CHARACTERS, STARTER_CHARACTER_ID } from "./CharacterRoster";
import { isCharacterId, type CharacterId } from "./Ids";
import {
  readProfileSection,
  writeProfileSection,
} from "../persistence/ProfileStorage";

export type AchievementCategory = "combat" | "expedition" | "mastery";

export interface AchievementStats {
  bossVictories: number;
  characterWins: number;
  fullTalentTrees: number;
  mapsPlayed: number;
  maxCharacterKills: number;
  noDamageWaves: number;
  n01Spawns: number;
  stageOneWins: number;
  totalKills: number;
  wave11NoShots: number;
  waveReached: number;
}

export interface AchievementDefinition {
  readonly category: AchievementCategory;
  readonly description: string;
  readonly id: string;
  readonly operatorId?: CharacterId;
  readonly points: number;
  readonly source:
    | keyof AchievementStats
    | "operatorFullTree"
    | "operatorKills"
    | "operatorShopUnlock"
    | "operatorWins";
  readonly target: number;
  readonly title: string;
}

export interface AchievementProgressEntry {
  readonly current: number;
  readonly definition: AchievementDefinition;
  readonly unlocked: boolean;
  readonly unlockedAt?: string;
}

export interface AchievementSnapshot {
  readonly completed: number;
  readonly entries: readonly AchievementProgressEntry[];
  readonly pointsEarned: number;
  readonly total: number;
  readonly totalPoints: number;
}

export interface AchievementProgressUpdate {
  readonly additions?: Partial<AchievementStats>;
  readonly characterId?: CharacterId;
  readonly characterKills?: number;
  readonly fullTalentTree?: boolean;
  readonly mapId?: string;
  readonly maxima?: Partial<AchievementStats>;
  readonly operatorWin?: boolean;
  readonly shopUnlockedCharacterId?: CharacterId;
}

interface AchievementStorage extends AchievementStats {
  readonly characterKills?: Partial<Record<CharacterId, number>>;
  readonly mapIds?: readonly string[];
  readonly operatorFullTrees?: readonly CharacterId[];
  readonly operatorShopUnlocks?: readonly CharacterId[];
  readonly operatorWins?: Partial<Record<CharacterId, number>>;
  readonly unlockedAt?: Readonly<Record<string, string>>;
}

const DEFAULT_STATS: AchievementStats = {
  bossVictories: 0,
  characterWins: 0,
  fullTalentTrees: 0,
  mapsPlayed: 0,
  maxCharacterKills: 0,
  noDamageWaves: 0,
  n01Spawns: 0,
  stageOneWins: 0,
  totalKills: 0,
  wave11NoShots: 0,
  waveReached: 0,
};

const GENERAL_ACHIEVEMENTS: readonly AchievementDefinition[] = [
  {
    category: "combat",
    description: "Defeat 50,000 Raptures across all deployments.",
    id: "massacre",
    points: 500,
    source: "totalKills",
    target: 50_000,
    title: "MASSACRE",
  },
  {
    category: "combat",
    description: "Defeat a boss enemy.",
    id: "boss-slayer",
    points: 250,
    source: "bossVictories",
    target: 1,
    title: "BOSS SLAYER",
  },
  {
    category: "combat",
    description: "Complete a Stage 1 operation.",
    id: "first-blood",
    points: 100,
    source: "stageOneWins",
    target: 1,
    title: "FIRST BLOOD",
  },
  {
    category: "combat",
    description: "Complete a wave without taking damage.",
    id: "untouchable",
    points: 200,
    source: "noDamageWaves",
    target: 1,
    title: "UNTOUCHABLE",
  },
  {
    category: "expedition",
    description: "Deploy across all four operation maps.",
    id: "world-traveler",
    points: 300,
    source: "mapsPlayed",
    target: 4,
    title: "WORLD TRAVELER",
  },
  {
    category: "expedition",
    description: "Reach Wave 10 in a single deployment.",
    id: "abandoned-wishes",
    points: 250,
    source: "waveReached",
    target: 10,
    title: "ABANDONED WISHES",
  },
  {
    category: "expedition",
    description: "Witness the arrival of N01.",
    id: "she-descends",
    points: 300,
    source: "n01Spawns",
    target: 1,
    title: "SHE DESCENDS",
  },
  {
    category: "expedition",
    description: "Clear Wave 11 without firing bullets, rockets, or pellets.",
    id: "no-shots-fired",
    points: 500,
    source: "wave11NoShots",
    target: 1,
    title: "LOOK COMMANDER, NO HANDS!",
  },
] as const;

const OPERATOR_ACHIEVEMENTS: readonly AchievementDefinition[] =
  CHARACTERS.flatMap((character): AchievementDefinition[] => [
    ...(character.id === STARTER_CHARACTER_ID
      ? []
      : [
          {
            category: "mastery" as const,
            description: `Recruit ${character.name} through the Core Exchange.`,
            id: `unlock_${character.id}`,
            operatorId: character.id,
            points: 100,
            source: "operatorShopUnlock" as const,
            target: 1,
            title: `UNLOCK ${character.name.toUpperCase()}`,
          },
        ]),
    {
      category: "mastery",
      description: `Defeat 10,000 Raptures while playing as ${character.name}.`,
      id: `kills_${character.id}`,
      operatorId: character.id,
      points: 500,
      source: "operatorKills",
      target: 10_000,
      title: `${character.name.toUpperCase()} // 10,000 KILLS`,
    },
    {
      category: "mastery",
      description: `Purchase every available ${character.name} talent during one deployment.`,
      id: `all_skills_${character.id}`,
      operatorId: character.id,
      points: 300,
      source: "operatorFullTree",
      target: 1,
      title: `${character.name.toUpperCase()} // FULL POTENTIAL`,
    },
    {
      category: "mastery",
      description: `Complete an operation while playing as ${character.name}.`,
      id: `win_${character.id}`,
      operatorId: character.id,
      points: 300,
      source: "operatorWins",
      target: 1,
      title: `${character.name.toUpperCase()} // VICTORY`,
    },
  ]);

export const ACHIEVEMENTS: readonly AchievementDefinition[] = [
  ...GENERAL_ACHIEVEMENTS,
  ...OPERATOR_ACHIEVEMENTS,
];

export function loadAchievementSnapshot(): AchievementSnapshot {
  const storage = loadStorage();
  const stats = statsFrom(storage);
  const entries = ACHIEVEMENTS.map((definition): AchievementProgressEntry => {
    const current = progressFor(definition, storage, stats);
    return {
      current,
      definition,
      unlocked: current >= definition.target,
      unlockedAt: storage.unlockedAt?.[definition.id],
    };
  });
  const completed = entries.filter((entry) => entry.unlocked);
  return {
    completed: completed.length,
    entries,
    pointsEarned: completed.reduce(
      (total, entry) => total + entry.definition.points,
      0,
    ),
    total: entries.length,
    totalPoints: entries.reduce(
      (total, entry) => total + entry.definition.points,
      0,
    ),
  };
}

export function updateAchievementStats(
  update: Partial<AchievementStats>,
): void {
  const storage = loadStorage();
  const stats = statsFrom(storage);
  for (const key of Object.keys(DEFAULT_STATS) as (keyof AchievementStats)[]) {
    const value = update[key];
    if (Number.isSafeInteger(value) && Number(value) >= 0)
      stats[key] = Number(value);
  }
  saveStorage({ ...storage, ...stats });
}

export function applyAchievementProgress(
  update: AchievementProgressUpdate,
): readonly AchievementDefinition[] {
  const before = loadAchievementSnapshot();
  const storage = loadStorage();
  const stats = statsFrom(storage);
  for (const key of Object.keys(DEFAULT_STATS) as (keyof AchievementStats)[]) {
    const addition = update.additions?.[key];
    if (Number.isSafeInteger(addition) && Number(addition) >= 0)
      stats[key] += Number(addition);
    const maximum = update.maxima?.[key];
    if (Number.isSafeInteger(maximum) && Number(maximum) >= 0)
      stats[key] = Math.max(stats[key], Number(maximum));
  }

  const mapIds = new Set(
    Array.isArray(storage.mapIds)
      ? storage.mapIds.filter(
          (value): value is string => typeof value === "string",
        )
      : [],
  );
  if (update.mapId !== undefined) mapIds.add(update.mapId);
  stats.mapsPlayed = Math.max(stats.mapsPlayed, mapIds.size);

  const characterKills: Partial<Record<CharacterId, number>> = {};
  if (storage.characterKills !== undefined) {
    for (const [id, value] of Object.entries(storage.characterKills)) {
      if (
        isCharacterId(id) &&
        Number.isSafeInteger(value) &&
        Number(value) >= 0
      )
        characterKills[id] = Number(value);
    }
  }
  if (
    update.characterId !== undefined &&
    Number.isSafeInteger(update.characterKills) &&
    Number(update.characterKills) >= 0
  ) {
    characterKills[update.characterId] =
      (characterKills[update.characterId] ?? 0) + Number(update.characterKills);
  }
  stats.maxCharacterKills = Math.max(
    stats.maxCharacterKills,
    ...Object.values(characterKills).map(Number),
  );

  const operatorWins = normalizedCharacterCounts(storage.operatorWins);
  if (update.characterId !== undefined && update.operatorWin === true)
    operatorWins[update.characterId] =
      (operatorWins[update.characterId] ?? 0) + 1;

  const operatorFullTrees = normalizedCharacterSet(storage.operatorFullTrees);
  if (update.characterId !== undefined && update.fullTalentTree === true)
    operatorFullTrees.add(update.characterId);

  const operatorShopUnlocks = normalizedCharacterSet(
    storage.operatorShopUnlocks,
  );
  if (update.shopUnlockedCharacterId !== undefined)
    operatorShopUnlocks.add(update.shopUnlockedCharacterId);

  const previouslyUnlocked = new Set(
    before.entries
      .filter((entry) => entry.unlocked)
      .map((entry) => entry.definition.id),
  );
  const unlockedAt = { ...storage.unlockedAt };
  const newlyUnlocked = ACHIEVEMENTS.filter((definition) => {
    const current = progressFor(
      definition,
      {
        ...storage,
        characterKills,
        operatorFullTrees: [...operatorFullTrees],
        operatorShopUnlocks: [...operatorShopUnlocks],
        operatorWins,
      },
      stats,
    );
    if (current < definition.target || previouslyUnlocked.has(definition.id))
      return false;
    unlockedAt[definition.id] = new Date().toISOString();
    return true;
  });
  saveStorage({
    ...storage,
    ...stats,
    characterKills,
    mapIds: [...mapIds],
    operatorFullTrees: [...operatorFullTrees],
    operatorShopUnlocks: [...operatorShopUnlocks],
    operatorWins,
    unlockedAt,
  });
  return newlyUnlocked;
}

function normalizedCharacterCounts(
  stored: Partial<Record<CharacterId, number>> | undefined,
): Partial<Record<CharacterId, number>> {
  const counts: Partial<Record<CharacterId, number>> = {};
  if (stored === undefined) return counts;
  for (const [id, value] of Object.entries(stored)) {
    if (isCharacterId(id) && Number.isSafeInteger(value) && Number(value) >= 0)
      counts[id] = Number(value);
  }
  return counts;
}

function normalizedCharacterSet(
  values: readonly string[] | undefined,
): Set<CharacterId> {
  return new Set(Array.isArray(values) ? values.filter(isCharacterId) : []);
}

function progressFor(
  definition: AchievementDefinition,
  storage: Partial<AchievementStorage>,
  stats: AchievementStats,
): number {
  const operatorId = definition.operatorId;
  switch (definition.source) {
    case "operatorKills":
      return operatorId === undefined
        ? 0
        : (normalizedCharacterCounts(storage.characterKills)[operatorId] ?? 0);
    case "operatorWins":
      return operatorId === undefined
        ? 0
        : (normalizedCharacterCounts(storage.operatorWins)[operatorId] ?? 0);
    case "operatorFullTree":
      return operatorId !== undefined &&
        normalizedCharacterSet(storage.operatorFullTrees).has(operatorId)
        ? 1
        : 0;
    case "operatorShopUnlock":
      return operatorId !== undefined &&
        normalizedCharacterSet(storage.operatorShopUnlocks).has(operatorId)
        ? 1
        : 0;
    default:
      return stats[definition.source];
  }
}

function loadStorage(): Partial<AchievementStorage> {
  return readProfileSection<Partial<AchievementStorage>>("achievements", {});
}

function statsFrom(stored: Partial<AchievementStorage>): AchievementStats {
  const stats = { ...DEFAULT_STATS };
  for (const key of Object.keys(DEFAULT_STATS) as (keyof AchievementStats)[]) {
    const value = stored[key];
    if (Number.isSafeInteger(value) && Number(value) >= 0)
      stats[key] = Number(value);
  }
  return stats;
}

function saveStorage(storage: Partial<AchievementStorage>): void {
  writeProfileSection("achievements", storage);
}
