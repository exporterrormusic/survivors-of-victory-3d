import { isCharacterId, type CharacterId } from "./Ids";
import {
  readProfileSection,
  writeProfileSection,
} from "../persistence/ProfileStorage";

/** Lifetime Survival Round totals and bests for one NIKKE. Talents and levels reset each round,
 * so these are the only gameplay numbers that outlive a run. */
export interface SurvivalCharacterStats {
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

interface SurvivalStorage {
  readonly characters: Partial<Record<CharacterId, SurvivalCharacterStats>>;
  readonly receipts: readonly string[];
}

const EMPTY: SurvivalCharacterStats = {
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

export function loadSurvivalStats(characterId: CharacterId): SurvivalCharacterStats {
  return { ...EMPTY, ...loadStorage().characters[characterId] };
}

/** Records one finished round once (keyed by roundId). `counted` is false for a repeat. */
export function recordSurvivalRound(summary: SurvivalRoundSummary): SurvivalRoundOutcome {
  const storage = loadStorage();
  const before = loadSurvivalStats(summary.characterId);
  if (storage.receipts.includes(summary.roundId))
    return { counted: false, newBests: [], saved: true, stats: before };

  const seconds = Math.max(0, Math.floor(summary.seconds));
  const kills = Math.max(0, Math.floor(summary.kills));
  const level = Math.max(0, Math.floor(summary.level));
  const newBests: SurvivalRoundOutcome["newBests"][number][] = [];
  const stats: SurvivalCharacterStats = {
    ...before,
    lastPlayedAt: new Date().toISOString(),
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
  if (summary.won && !summary.endless) {
    stats.wins = before.wins + 1;
    if (before.fastestWinSeconds === 0 || seconds < before.fastestWinSeconds) {
      if (before.fastestWinSeconds > 0) newBests.push("win");
      stats.fastestWinSeconds = seconds;
    }
  }

  const saved = writeProfileSection("survival", {
    characters: { ...storage.characters, [summary.characterId]: stats },
    receipts: [...storage.receipts.slice(-99), summary.roundId],
  });
  return { counted: saved, newBests, saved, stats };
}

function loadStorage(): SurvivalStorage {
  const value = readProfileSection<unknown>("survival", {});
  const raw =
    value !== null && typeof value === "object" && !Array.isArray(value)
      ? (value as Partial<Record<keyof SurvivalStorage, unknown>>)
      : {};
  const characters: Partial<Record<CharacterId, SurvivalCharacterStats>> = {};
  if (raw.characters !== null && typeof raw.characters === "object")
    for (const [id, entry] of Object.entries(raw.characters as object)) {
      if (isCharacterId(id)) characters[id] = sanitize(entry);
    }
  const receipts = Array.isArray(raw.receipts)
    ? raw.receipts.filter((x): x is string => typeof x === "string")
    : [];
  return { characters, receipts };
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
