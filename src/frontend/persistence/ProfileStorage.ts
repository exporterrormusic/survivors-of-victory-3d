import { GAME_VERSION } from "../../version";

export type ProfileSection =
  | "achievements"
  | "progress"
  | "roster"
  | "settings"
  | "stage"
  | "survival";

const CURRENT_SCHEMA_VERSION = 1;
const META_KEY = "nikke-moba.profile-meta-v1";
const SECTION_KEYS: Readonly<Record<ProfileSection, string>> = {
  achievements: "nikke-moba.achievements-v1",
  progress: "nikke-moba.progress-v1",
  roster: "nikke-moba.roster-v1",
  settings: "nikke-moba.front-settings-v1",
  stage: "nikke-moba.stage-v1",
  survival: "nikke-moba.survival-stats-v1",
};

/** Every key the game owns starts with this, including settings and capstones stored outside the
 * profile sections. On itch.io all HTML games share one storage origin, so never write unprefixed keys. */
const SAVE_KEY_PREFIX = "nikke-moba.";
const SAVE_FILE_KIND = "sov-save";
const SAVE_FILE_FORMAT = 1;

interface ProfileMetadata {
  readonly schemaVersion: number;
}

export function readProfileSection<T>(section: ProfileSection, fallback: T): T {
  const storage = browserStorage();
  if (storage === undefined) return fallback;
  ensureSchema(storage);
  try {
    const raw = storage.getItem(SECTION_KEYS[section]);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function writeProfileSection(
  section: ProfileSection,
  value: unknown,
): boolean {
  const storage = browserStorage();
  if (storage === undefined) return false;
  ensureSchema(storage);
  try {
    storage.setItem(SECTION_KEYS[section], JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function resetProfileProgress(): void {
  const storage = browserStorage();
  if (storage === undefined) return;
  (["achievements", "progress", "roster", "stage", "survival"] as const).forEach((section) =>
    storage.removeItem(SECTION_KEYS[section]),
  );
  writeMetadata(storage);
}

export function resetEntireProfile(): void {
  const storage = browserStorage();
  if (storage === undefined) return;
  Object.values(SECTION_KEYS).forEach((key) => storage.removeItem(key));
  storage.removeItem(META_KEY);
}

/** A portable copy of everything the game has saved: moves progress between the itch.io web build,
 * the download and another machine, and is the player's backup if the browser clears site data. */
export interface SaveFile {
  readonly entries: Readonly<Record<string, string>>;
  readonly exportedAt: string;
  readonly format: number;
  readonly gameVersion: string;
  readonly kind: typeof SAVE_FILE_KIND;
}

export function exportSaveData(): SaveFile {
  const storage = browserStorage();
  const entries: Record<string, string> = {};
  if (storage !== undefined)
    for (const key of ownedKeys(storage)) {
      const value = storage.getItem(key);
      if (value !== null) entries[key] = value;
    }
  return {
    entries,
    exportedAt: new Date().toISOString(),
    format: SAVE_FILE_FORMAT,
    gameVersion: GAME_VERSION,
    kind: SAVE_FILE_KIND,
  };
}

export type SaveImportResult =
  | { readonly ok: true; readonly gameVersion: string }
  | { readonly ok: false; readonly reason: string };

/** Replaces the current save with the file's contents. Nothing is touched unless the file is valid. */
export function importSaveData(text: string): SaveImportResult {
  const storage = browserStorage();
  if (storage === undefined)
    return { ok: false, reason: "This browser is blocking saved data." };
  let file: Partial<SaveFile>;
  try {
    file = JSON.parse(text) as Partial<SaveFile>;
  } catch {
    return { ok: false, reason: "That file isn't a save file." };
  }
  if (file === null || typeof file !== "object" || file.kind !== SAVE_FILE_KIND)
    return { ok: false, reason: "That file isn't a save file." };
  if (!Number.isSafeInteger(file.format) || Number(file.format) > SAVE_FILE_FORMAT)
    return { ok: false, reason: "This save is from a newer version of the game." };
  const entries = file.entries;
  if (entries === null || typeof entries !== "object" || Array.isArray(entries))
    return { ok: false, reason: "The save file is damaged." };
  const valid = Object.entries(entries).filter(
    (entry): entry is [string, string] =>
      entry[0].startsWith(SAVE_KEY_PREFIX) && typeof entry[1] === "string",
  );
  const previous = exportSaveData().entries;
  try {
    ownedKeys(storage).forEach((key) => storage.removeItem(key));
    valid.forEach(([key, value]) => storage.setItem(key, value));
  } catch {
    // Out of space part-way: put the old save back rather than leave half of each.
    ownedKeys(storage).forEach((key) => storage.removeItem(key));
    Object.entries(previous).forEach(([key, value]) => {
      try {
        storage.setItem(key, value);
      } catch {
        // Nothing more can be done if even the original no longer fits.
      }
    });
    return { ok: false, reason: "There isn't enough storage space to load this save." };
  }
  ensureSchema(storage);
  return {
    ok: true,
    gameVersion: typeof file.gameVersion === "string" ? file.gameVersion : "unknown",
  };
}

/** Wipes progress, settings and everything else the game stored. */
export function eraseAllSaveData(): void {
  const storage = browserStorage();
  if (storage === undefined) return;
  ownedKeys(storage).forEach((key) => storage.removeItem(key));
}

export function saveStorageAvailable(): boolean {
  const storage = browserStorage();
  if (storage === undefined) return false;
  try {
    const probe = `${SAVE_KEY_PREFIX}probe`;
    storage.setItem(probe, "1");
    storage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

/** Asks the browser not to evict our data under storage pressure (Safari otherwise clears it after
 * a week without a visit). Resolves false when refused or unsupported; saving still works either way. */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    const manager = typeof navigator === "undefined" ? undefined : navigator.storage;
    if (manager?.persist === undefined) return false;
    if (await manager.persisted()) return true;
    return await manager.persist();
  } catch {
    return false;
  }
}

function ownedKeys(storage: Storage): string[] {
  const keys: string[] = [];
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index);
    if (key?.startsWith(SAVE_KEY_PREFIX)) keys.push(key);
  }
  return keys;
}

function browserStorage(): Storage | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

function ensureSchema(storage: Storage): void {
  try {
    const raw = storage.getItem(META_KEY);
    if (raw !== null) {
      const metadata = JSON.parse(raw) as Partial<ProfileMetadata>;
      if (
        Number.isSafeInteger(metadata.schemaVersion) &&
        Number(metadata.schemaVersion) >= CURRENT_SCHEMA_VERSION
      )
        return;
    }
    // Schema v1 adopts existing section keys without transforming their data.
    writeMetadata(storage);
  } catch {
    writeMetadata(storage);
  }
}

function writeMetadata(storage: Storage): void {
  try {
    storage.setItem(
      META_KEY,
      JSON.stringify({ schemaVersion: CURRENT_SCHEMA_VERSION }),
    );
  } catch {
    // Persistence is optional in restricted browser contexts.
  }
}
