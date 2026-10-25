export type ProfileSection =
  "achievements" | "progress" | "records" | "roster" | "settings" | "stage";

const CURRENT_SCHEMA_VERSION = 1;
const META_KEY = "nikke-moba.profile-meta-v1";
const SECTION_KEYS: Readonly<Record<ProfileSection, string>> = {
  achievements: "nikke-moba.achievements-v1",
  progress: "nikke-moba.progress-v1",
  records: "nikke-moba.records-v1",
  roster: "nikke-moba.roster-v1",
  settings: "nikke-moba.front-settings-v1",
  stage: "nikke-moba.stage-v1",
};

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
  (["achievements", "progress", "records", "roster", "stage"] as const).forEach((section) =>
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
