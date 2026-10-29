import {
  readProfileSection,
  writeProfileSection,
} from "../persistence/ProfileStorage";

const KEY = {
  A: 65,
  BACKSPACE: 8,
  D: 68,
  DOWN: 40,
  E: 69,
  ENTER: 13,
  ESC: 27,
  LEFT: 37,
  NINE: 57,
  RIGHT: 39,
  S: 83,
  SHIFT: 16,
  SPACE: 32,
  TAB: 9,
  UP: 38,
  W: 87,
  Z: 90,
  ZERO: 48,
} as const;

export interface AudioSettings {
  musicVolume: number;
  sfxVolume: number;
}

export interface DisplayResolution {
  height: number;
  width: number;
}

export interface DisplaySettings {
  fullscreen: boolean;
  resolution: DisplayResolution;
}

export interface GameplaySettings {
  damageNumbers: boolean;
  screenShake: boolean;
}

export type ControlAction =
  | "fire"
  | "reload"
  | "talents"
  | "pause"
  | "menu"
  | "dash"
  | "moveDown"
  | "moveLeft"
  | "moveRight"
  | "moveUp"
  | "specialAttack"
  | "burst";

export type MouseBindingButton =
  "LEFT" | "BACK" | "FORWARD" | "MIDDLE" | "RIGHT" | "WHEEL DOWN" | "WHEEL UP";

export type ControlBinding =
  | { readonly device: "keyboard"; readonly keyCode: number }
  | { readonly button: MouseBindingButton; readonly device: "mouse" };

export interface ControlSettings {
  bindings: Record<ControlAction, ControlBinding>;
}

export const CONTROL_BINDING_DEFINITIONS: readonly {
  readonly action: ControlAction;
  readonly label: string;
}[] = [
  { action: "moveUp", label: "MOVE UP" },
  { action: "moveDown", label: "MOVE DOWN" },
  { action: "moveLeft", label: "MOVE LEFT" },
  { action: "moveRight", label: "MOVE RIGHT" },
  { action: "fire", label: "FIRE" },
  { action: "reload", label: "RELOAD" },
  { action: "talents", label: "UPGRADES" },
  { action: "dash", label: "DASH" },
  { action: "burst", label: "BURST" },
  { action: "specialAttack", label: "SPECIAL ATTACK" },
  { action: "pause", label: "PAUSE" },
  { action: "menu", label: "MENU" },
] as const;

export const SUPPORTED_RESOLUTIONS: readonly DisplayResolution[] = [
  { height: 720, width: 1280 },
  { height: 768, width: 1366 },
  { height: 900, width: 1600 },
  { height: 1080, width: 1920 },
  { height: 1440, width: 2560 },
  { height: 2160, width: 3840 },
];

const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
  musicVolume: 0.8,
  sfxVolume: 0.8,
};

const DEFAULT_DISPLAY_SETTINGS: DisplaySettings = {
  fullscreen: false,
  resolution: { height: 1080, width: 1920 },
};

const DEFAULT_GAMEPLAY_SETTINGS: GameplaySettings = {
  damageNumbers: true,
  screenShake: true,
};

const DEFAULT_CONTROL_SETTINGS: ControlSettings = {
  bindings: {
    fire: { device: "mouse", button: "LEFT" },
    reload: { device: "keyboard", keyCode: 82 },
    talents: { device: "keyboard", keyCode: 9 },
    burst: { device: "keyboard", keyCode: KEY.E },
    dash: { device: "keyboard", keyCode: KEY.SHIFT },
    moveDown: { device: "keyboard", keyCode: KEY.S },
    moveLeft: { device: "keyboard", keyCode: KEY.A },
    moveRight: {
      device: "keyboard",
      keyCode: KEY.D,
    },
    moveUp: { device: "keyboard", keyCode: KEY.W },
    pause: { device: "keyboard", keyCode: KEY.SPACE },
    menu: { device: "keyboard", keyCode: KEY.ESC },
    specialAttack: { button: "RIGHT", device: "mouse" },
  },
};

type StoredSettings = Partial<AudioSettings> & {
  controlBindings?: unknown;
  damageNumbers?: unknown;
  fullscreen?: unknown;
  resolutionHeight?: unknown;
  resolutionWidth?: unknown;
  screenShake?: unknown;
};

function readStoredSettings(): StoredSettings {
  return readProfileSection<StoredSettings>("settings", {});
}

function writeStoredSettings(settings: StoredSettings): void {
  writeProfileSection("settings", settings);
}

function clampUnit(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function normalizedVolume(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? clampUnit(value)
    : fallback;
}

export function loadAudioSettings(): AudioSettings {
  const stored = readStoredSettings();
  return {
    musicVolume: normalizedVolume(
      stored.musicVolume,
      DEFAULT_AUDIO_SETTINGS.musicVolume,
    ),
    sfxVolume: normalizedVolume(
      stored.sfxVolume,
      DEFAULT_AUDIO_SETTINGS.sfxVolume,
    ),
  };
}

/** Window event fired after audio settings change, so menu and match audio follow live. */
export const AUDIO_SETTINGS_EVENT = "nikke-audio-settings";

export function saveAudioSettings(settings: AudioSettings): void {
  const normalized: AudioSettings = {
    musicVolume: normalizedVolume(
      settings.musicVolume,
      DEFAULT_AUDIO_SETTINGS.musicVolume,
    ),
    sfxVolume: normalizedVolume(
      settings.sfxVolume,
      DEFAULT_AUDIO_SETTINGS.sfxVolume,
    ),
  };
  writeStoredSettings({ ...readStoredSettings(), ...normalized });
  window.dispatchEvent(new Event(AUDIO_SETTINGS_EVENT));
}

export function scaledSfxVolume(
  baseVolume: number,
  settings: AudioSettings,
): number {
  return clampUnit(baseVolume * settings.sfxVolume);
}

export function loadDisplaySettings(): DisplaySettings {
  const stored = readStoredSettings();
  const resolution = SUPPORTED_RESOLUTIONS.find(
    (candidate) =>
      candidate.width === stored.resolutionWidth &&
      candidate.height === stored.resolutionHeight,
  );
  return {
    fullscreen:
      typeof stored.fullscreen === "boolean"
        ? stored.fullscreen
        : DEFAULT_DISPLAY_SETTINGS.fullscreen,
    resolution:
      resolution === undefined
        ? { ...DEFAULT_DISPLAY_SETTINGS.resolution }
        : { ...resolution },
  };
}

export function saveDisplaySettings(settings: DisplaySettings): void {
  const supported = SUPPORTED_RESOLUTIONS.some(
    (candidate) =>
      candidate.width === settings.resolution.width &&
      candidate.height === settings.resolution.height,
  );
  const resolution = supported
    ? settings.resolution
    : DEFAULT_DISPLAY_SETTINGS.resolution;
  writeStoredSettings({
    ...readStoredSettings(),
    fullscreen: settings.fullscreen,
    resolutionHeight: resolution.height,
    resolutionWidth: resolution.width,
  });
}

export function loadGameplaySettings(): GameplaySettings {
  const stored = readStoredSettings();
  return {
    damageNumbers:
      typeof stored.damageNumbers === "boolean"
        ? stored.damageNumbers
        : DEFAULT_GAMEPLAY_SETTINGS.damageNumbers,
    screenShake:
      typeof stored.screenShake === "boolean"
        ? stored.screenShake
        : DEFAULT_GAMEPLAY_SETTINGS.screenShake,
  };
}

export function saveGameplaySettings(settings: GameplaySettings): void {
  writeStoredSettings({
    ...readStoredSettings(),
    damageNumbers: settings.damageNumbers,
    screenShake: settings.screenShake,
  });
}

export function loadControlSettings(): ControlSettings {
  const stored = readStoredSettings();
  const savedBindings =
    typeof stored.controlBindings === "object" &&
    stored.controlBindings !== null
      ? (stored.controlBindings as Partial<Record<ControlAction, unknown>>)
      : {};
  const bindings = { ...DEFAULT_CONTROL_SETTINGS.bindings };
  // Saves from before the Menu binding stored the Escape menu key as "pause" (or "cancel").
  const legacyMenu = savedBindings.menu === undefined;
  CONTROL_BINDING_DEFINITIONS.forEach(({ action }) => {
    const legacyAction =
      action === "specialAttack"
        ? "special"
        : action === "menu" && legacyMenu
          ? savedBindings.pause === undefined ? "cancel" : "pause"
          : action;
    const candidate =
      action === "pause" && legacyMenu
        ? undefined
        : savedBindings[action] ?? savedBindings[legacyAction as ControlAction];
    const normalized = normalizeControlBinding(candidate);
    if (normalized !== undefined) {
      bindings[action] = normalized;
    }
  });
  // An old save may already use Space for something else; Pause then takes P.
  if (legacyMenu && CONTROL_BINDING_DEFINITIONS.some(({ action }) =>
    action !== "pause" && controlBindingsEqual(bindings[action], bindings.pause))) {
    bindings.pause = { device: "keyboard", keyCode: 80 };
  }
  return { bindings };
}

export function saveControlSettings(settings: ControlSettings): void {
  writeStoredSettings({
    ...readStoredSettings(),
    controlBindings: { ...settings.bindings },
  });
  if (typeof window !== 'undefined') window.dispatchEvent?.(new Event('sov:controls-changed'));
}

export function resetControlSettings(): ControlSettings {
  const settings: ControlSettings = {
    bindings: { ...DEFAULT_CONTROL_SETTINGS.bindings },
  };
  saveControlSettings(settings);
  return settings;
}

export function formatControlBinding(binding: ControlBinding): string {
  if (binding.device === "mouse") return `MOUSE ${binding.button}`;
  return formatKeyCode(binding.keyCode);
}

export function controlBindingsEqual(
  left: ControlBinding,
  right: ControlBinding,
): boolean {
  return (
    left.device === right.device &&
    (left.device === "keyboard"
      ? left.keyCode ===
        (right as Extract<ControlBinding, { device: "keyboard" }>).keyCode
      : left.button ===
        (right as Extract<ControlBinding, { device: "mouse" }>).button)
  );
}

function normalizeControlBinding(value: unknown): ControlBinding | undefined {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return { device: "keyboard", keyCode: value };
  }
  if (value === null || typeof value !== "object") return undefined;
  const candidate = value as Partial<ControlBinding> & {
    button?: unknown;
    keyCode?: unknown;
  };
  if (
    candidate.device === "keyboard" &&
    typeof candidate.keyCode === "number" &&
    Number.isInteger(candidate.keyCode) &&
    candidate.keyCode > 0
  ) {
    return { device: "keyboard", keyCode: candidate.keyCode };
  }
  const mouseButtons: readonly MouseBindingButton[] = [
    "LEFT",
    "BACK",
    "FORWARD",
    "MIDDLE",
    "RIGHT",
    "WHEEL DOWN",
    "WHEEL UP",
  ];
  if (
    candidate.device === "mouse" &&
    typeof candidate.button === "string" &&
    mouseButtons.includes(candidate.button as MouseBindingButton)
  ) {
    return { button: candidate.button as MouseBindingButton, device: "mouse" };
  }
  return undefined;
}

function formatKeyCode(keyCode: number): string {
  const specialLabels: Readonly<Record<number, string>> = {
    [KEY.BACKSPACE]: "BACKSPACE",
    [KEY.DOWN]: "DOWN",
    [KEY.ENTER]: "ENTER",
    [KEY.ESC]: "ESC",
    [KEY.LEFT]: "LEFT",
    [KEY.RIGHT]: "RIGHT",
    [KEY.SPACE]: "SPACE",
    [KEY.SHIFT]: "SHIFT",
    [KEY.TAB]: "TAB",
    [KEY.UP]: "UP",
  };
  if (specialLabels[keyCode] !== undefined) {
    return specialLabels[keyCode];
  }
  if (
    (keyCode >= KEY.ZERO && keyCode <= KEY.NINE) ||
    (keyCode >= KEY.A && keyCode <= KEY.Z)
  ) {
    return String.fromCharCode(keyCode);
  }
  return `KEY ${keyCode}`;
}
