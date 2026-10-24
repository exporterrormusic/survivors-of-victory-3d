import { isCharacterId, type CharacterId } from "./Ids";
import {
  readProfileSection,
  writeProfileSection,
} from "../persistence/ProfileStorage";

export interface RunRecord {
  readonly characterId: CharacterId;
  readonly completedAt: string;
  readonly difficulty: number;
  readonly goddessFall: boolean;
  readonly score: number;
  readonly wave: number;
}

export function loadRunRecords(): readonly RunRecord[] {
  const parsed = readProfileSection<unknown>("records", []);
  return Array.isArray(parsed) ? parsed.filter(isRunRecord) : [];
}

export function saveRunRecord(record: RunRecord): boolean {
  if (!isRunRecord(record)) return false;
  const records = [...loadRunRecords()];
  const index = records.findIndex(
    (entry) => entry.characterId === record.characterId,
  );
  const current = records[index];
  if (
    current !== undefined &&
    (current.score > record.score ||
      (current.score === record.score && current.wave >= record.wave))
  )
    return false;
  if (index >= 0) records[index] = record;
  else records.push(record);
  return writeProfileSection("records", records);
}

function isRunRecord(value: unknown): value is RunRecord {
  if (value === null || typeof value !== "object") return false;
  const candidate = value as Partial<Record<keyof RunRecord, unknown>>;
  return (
    isCharacterId(candidate.characterId) &&
    typeof candidate.completedAt === "string" &&
    !Number.isNaN(Date.parse(candidate.completedAt)) &&
    typeof candidate.difficulty === "number" &&
    Number.isFinite(candidate.difficulty) &&
    candidate.difficulty > 0 &&
    typeof candidate.goddessFall === "boolean" &&
    Number.isSafeInteger(candidate.score) &&
    Number(candidate.score) >= 0 &&
    Number.isSafeInteger(candidate.wave) &&
    Number(candidate.wave) >= 0
  );
}
