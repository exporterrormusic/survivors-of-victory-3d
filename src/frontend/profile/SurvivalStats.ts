import { isCharacterId, type CharacterId } from "./Ids";
import {
  readProfileSection,
  writeProfileSection,
} from "../persistence/ProfileStorage";

/** Lifetime Survival Round totals and bests for one NIKKE. Talents and levels reset each round,
 * so these are the only gameplay numbers that outlive a run. */
export interface SurvivalCharacterStats {
  /** rounds where the Obelisk went down */
  bossesDefeated: number;
  /** longest ENDLESS run, in seconds */
  bestEndlessSeconds: number;
  bestKills: number;
  bestLevel: number;
  /** quickest WAVE victory, in seconds (0 until the first win) */
  fastestWinSeconds: number;
  lastPlayedAt: string;
  rounds: number;
  totalKills: number;
  totalSeconds: number;
  wins: number;
}

export interface SurvivalRoundSummary {
  readonly bossDefeated: boolean;
  readonly characterId: CharacterId;
  readonly endless: boolean;
  readonly kills: number;
  readonly level: number;
  /** map name (zone name, not its time of day); rounds without one only count toward lifetime totals */
  readonly mapName?: string;
  /** recording the same round twice (a retried save) only counts it once */
  readonly roundId: string;
  readonly seconds: number;
  readonly won: boolean;
}

export interface SurvivalRoundOutcome {
  readonly counted: boolean;
  readonly newBests: readonly ("endless" | "kills" | "level" | "win")[];
  readonly saved: boolean;
  readonly stats: SurvivalCharacterStats;
}

type StatsByCharacter = Partial<Record<CharacterId, SurvivalCharacterStats>>;
type NewBest = SurvivalRoundOutcome["newBests"][number];

/** One finished round, newest first in the saved history. */
export interface SurvivalRoundEntry {
  readonly characterId: CharacterId;
  readonly endless: boolean;
  readonly finishedAt: string;
  readonly kills: number;
  readonly level: number;
  readonly mapName: string;
  readonly newBests: readonly NewBest[];
  readonly seconds: number;
  readonly won: boolean;
}

const HISTORY_LIMIT = 10;

interface SurvivalStorage {
  readonly characters: StatsByCharacter;
  readonly history: readonly SurvivalRoundEntry[];
  readonly maps: Readonly<Record<string, StatsByCharacter>>;
  readonly receipts: readonly string[];
}

const EMPTY: SurvivalCharacterStats = {
  bossesDefeated: 0,
  bestEndlessSeconds: 0,
  bestKills: 0,
  bestLevel: 0,
  fastestWinSeconds: 0,
  lastPlayedAt: "",
  rounds: 0,
  totalKills: 0,
  totalSeconds: 0,
  wins: 0,
};

/** Lifetime stats, or only those from one map when `mapName` is given. */
export function loadSurvivalStats(
  characterId: CharacterId,
  mapName?: string,
): SurvivalCharacterStats {
  const storage = loadStorage();
  const source =
    mapName === undefined ? storage.characters : storage.maps[mapName] ?? {};
  return { ...EMPTY, ...source[characterId] };
}

/** Map names that have at least one recorded round. */
export function loadSurvivalMapNames(): readonly string[] {
  return Object.keys(loadStorage().maps);
}

export function loadSurvivalHistory(): readonly SurvivalRoundEntry[] {
  return loadStorage().history;
}

/** Records one finished round once (keyed by roundId). `counted` is false for a repeat. */
export function recordSurvivalRound(summary: SurvivalRoundSummary): SurvivalRoundOutcome {
  const storage = loadStorage();
  const before = loadSurvivalStats(summary.characterId);
  if (storage.receipts.includes(summary.roundId))
    return { counted: false, newBests: [], saved: true, stats: before };

  const finishedAt = new Date().toISOString();
  const { newBests, stats } = applyRound(before, summary, finishedAt);
  const maps = { ...storage.maps };
  if (summary.mapName !== undefined) {
    const mapStats = maps[summary.mapName] ?? {};
    maps[summary.mapName] = {
      ...mapStats,
      [summary.characterId]: applyRound(
        { ...EMPTY, ...mapStats[summary.characterId] },
        summary,
        finishedAt,
      ).stats,
    };
  }
  const entry: SurvivalRoundEntry = {
    characterId: summary.characterId,
    endless: summary.endless,
    finishedAt,
    kills: stats.totalKills - before.totalKills,
    level: Math.max(0, Math.floor(summary.level)),
    mapName: summary.mapName ?? "",
    newBests,
    seconds: stats.totalSeconds - before.totalSeconds,
    won: summary.won,
  };

  const saved = writeProfileSection("survival", {
    characters: { ...storage.characters, [summary.characterId]: stats },
    history: [entry, ...storage.history].slice(0, HISTORY_LIMIT),
    maps,
    receipts: [...storage.receipts.slice(-99), summary.roundId],
  });
  return { counted: saved, newBests, saved, stats };
}

function applyRound(
  before: SurvivalCharacterStats,
  summary: SurvivalRoundSummary,
  finishedAt: string,
): { newBests: NewBest[]; stats: SurvivalCharacterStats } {
  const seconds = Math.max(0, Math.floor(summary.seconds));
  const kills = Math.max(0, Math.floor(summary.kills));
  const level = Math.max(0, Math.floor(summary.level));
  const newBests: NewBest[] = [];
  const stats: SurvivalCharacterStats = {
    ...before,
    lastPlayedAt: finishedAt,
    rounds: before.rounds + 1,
    totalKills: before.totalKills + kills,
    totalSeconds: before.totalSeconds + seconds,
  };
  // A first result is only a "new best" when there was a previous one to beat.
  if (kills > before.bestKills) {
    if (before.rounds > 0) newBests.push("kills");
    stats.bestKills = kills;
  }
  if (level > before.bestLevel) {
    if (before.rounds > 0) newBests.push("level");
    stats.bestLevel = level;
  }
  if (summary.endless && seconds > before.bestEndlessSeconds) {
    if (before.bestEndlessSeconds > 0) newBests.push("endless");
    stats.bestEndlessSeconds = seconds;
  }
  if (summary.bossDefeated) stats.bossesDefeated = before.bossesDefeated + 1;
  // Endless rounds are won by earning the core; only WAVE wins set a fastest time.
  if (summary.won) stats.wins = before.wins + 1;
  if (summary.won && !summary.endless) {
    if (before.fastestWinSeconds === 0 || seconds < before.fastestWinSeconds) {
      if (before.fastestWinSeconds > 0) newBests.push("win");
      stats.fastestWinSeconds = seconds;
    }
  }
  return { newBests, stats };
}

function loadStorage(): SurvivalStorage {
  const value = readProfileSection<unknown>("survival", {});
  const raw =
    value !== null && typeof value === "object" && !Array.isArray(value)
      ? (value as Partial<Record<keyof SurvivalStorage, unknown>>)
      : {};
  const characters = sanitizeCharacters(raw.characters);
  const maps: Record<string, StatsByCharacter> = {};
  if (isObject(raw.maps))
    for (const [name, entry] of Object.entries(raw.maps))
      maps[name] = sanitizeCharacters(entry);
  const history = Array.isArray(raw.history)
    ? raw.history.filter(isRoundEntry).slice(0, HISTORY_LIMIT)
    : [];
  const receipts = Array.isArray(raw.receipts)
    ? raw.receipts.filter((x): x is string => typeof x === "string")
    : [];
  return { characters, history, maps, receipts };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function sanitizeCharacters(value: unknown): StatsByCharacter {
  const characters: StatsByCharacter = {};
  if (isObject(value))
    for (const [id, entry] of Object.entries(value)) {
      if (isCharacterId(id)) characters[id] = sanitize(entry);
    }
  return characters;
}

function isRoundEntry(value: unknown): value is SurvivalRoundEntry {
  if (!isObject(value)) return false;
  return (
    isCharacterId(value.characterId) &&
    typeof value.endless === "boolean" &&
    typeof value.finishedAt === "string" &&
    Number.isSafeInteger(value.kills) &&
    Number.isSafeInteger(value.level) &&
    typeof value.mapName === "string" &&
    Array.isArray(value.newBests) &&
    Number.isSafeInteger(value.seconds) &&
    typeof value.won === "boolean"
  );
}

function sanitize(entry: unknown): SurvivalCharacterStats {
  const stats = { ...EMPTY };
  if (entry === null || typeof entry !== "object") return stats;
  const source = entry as Record<string, unknown>;
  for (const key of Object.keys(EMPTY) as (keyof SurvivalCharacterStats)[]) {
    const value = source[key];
    if (key === "lastPlayedAt") {
      if (typeof value === "string") stats.lastPlayedAt = value;
    } else if (Number.isSafeInteger(value) && Number(value) >= 0) {
      stats[key] = Number(value);
    }
  }
  return stats;
}
