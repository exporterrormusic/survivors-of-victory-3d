// What survives between trips (GAME_PLAN §10): each NIKKE's level, XP, unspent SP and ability
// ranks, plus the account bank that extracted loot goes into. Pristine Cores stay in the roster
// section, where the Shop spends them. Engine-free; tools/test-progress.mjs covers it.
import type { TalentTreeId } from "../../characters/talent-types";
import { isCharacterId, type CharacterId } from "./Ids";
import {
  readProfileSection,
  writeProfileSection,
} from "../persistence/ProfileStorage";

export type AbilityRanks = Record<TalentTreeId, number>;

export interface CharacterProgress {
  level: number;
  /** XP toward the next level */
  xp: number;
  /** unspent SP */
  skillPoints: number;
  ranks: AbilityRanks;
}

export interface AccountBank {
  credits: number;
  /** banked salvage becomes Core Dust */
  coreDust: number;
  /** NIPMH modules found on the surface, not yet resolved to catalog entries */
  modules: number;
}

export interface PlayerProgress {
  characters: Partial<Record<CharacterId, CharacterProgress>>;
  bank: AccountBank;
}

/** Banked loot, as a sortie's ledger reports it. */
export interface BankDeposit {
  readonly credits: number;
  readonly salvage: number;
  readonly modules: number;
  readonly pristineCores: number;
}

const ABILITIES: readonly TalentTreeId[] = ["attack", "skill", "burst"];
export const MAX_ABILITY_RANK = 5;

export function newCharacterProgress(): CharacterProgress {
  return { level: 1, xp: 0, skillPoints: 0, ranks: { attack: 1, burst: 1, skill: 1 } };
}

export function loadPlayerProgress(): PlayerProgress {
  const stored = readProfileSection<{ bank?: unknown; characters?: unknown }>("progress", {});
  const characters: PlayerProgress["characters"] = {};
  if (isRecord(stored.characters)) {
    for (const [id, value] of Object.entries(stored.characters)) {
      if (isCharacterId(id)) characters[id] = normalizeCharacter(value);
    }
  }
  return { bank: normalizeBank(stored.bank), characters };
}

export function loadCharacterProgress(id: CharacterId): CharacterProgress {
  return loadPlayerProgress().characters[id] ?? newCharacterProgress();
}

export function saveCharacterProgress(id: CharacterId, progress: CharacterProgress): boolean {
  const state = loadPlayerProgress();
  state.characters[id] = normalizeCharacter(progress);
  return writeProfileSection("progress", state);
}

/** Add an extraction's loot to the bank, converting salvage to Core Dust one for one. */
export function bankDeposit(deposit: BankDeposit): AccountBank {
  const state = loadPlayerProgress();
  state.bank.credits += wholeAtLeast(deposit.credits, 0);
  state.bank.coreDust += wholeAtLeast(deposit.salvage, 0);
  state.bank.modules += wholeAtLeast(deposit.modules, 0);
  writeProfileSection("progress", state);
  const cores = wholeAtLeast(deposit.pristineCores, 0);
  if (cores > 0) {
    // Same field CharacterRoster.awardPristineCores writes. That module pulls in Phaser (via the
    // NIPMH assets), so the 3D runtime adds to the stored roster here and leaves the rest as is.
    const roster = readProfileSection<Record<string, unknown>>("roster", {});
    const safe = isRecord(roster) ? roster : {};
    writeProfileSection("roster", { ...safe, pristineCores: wholeAtLeast(safe.pristineCores, 0) + cores });
  }
  return state.bank;
}

function normalizeCharacter(value: unknown): CharacterProgress {
  const fresh = newCharacterProgress();
  if (!isRecord(value)) return fresh;
  const ranks = isRecord(value.ranks) ? value.ranks : {};
  for (const ability of ABILITIES) {
    fresh.ranks[ability] = Math.min(MAX_ABILITY_RANK, wholeAtLeast(ranks[ability], 1));
  }
  fresh.level = wholeAtLeast(value.level, 1);
  fresh.skillPoints = wholeAtLeast(value.skillPoints, 0);
  fresh.xp = typeof value.xp === "number" && Number.isFinite(value.xp) && value.xp > 0 ? value.xp : 0;
  return fresh;
}

function normalizeBank(value: unknown): AccountBank {
  const bank = isRecord(value) ? value : {};
  return {
    coreDust: wholeAtLeast(bank.coreDust, 0),
    credits: wholeAtLeast(bank.credits, 0),
    modules: wholeAtLeast(bank.modules, 0),
  };
}

/** A safe integer no smaller than `min`; anything else becomes `min`. */
function wholeAtLeast(value: unknown, min: number): number {
  return Number.isSafeInteger(value) && Number(value) >= min ? Number(value) : min;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
