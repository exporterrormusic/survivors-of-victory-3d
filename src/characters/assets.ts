// Per-character asset locations under public/assets (recycled from Survivors of Victory).
import type { CharacterId } from './ids';

export const characterPortrait = (id: CharacterId): string => `assets/menus/character-select/${id}/portrait.png`;

export const characterBurstArt = (id: CharacterId): string => `assets/menus/character-select/${id}/burst.${id === 'dorothy' ? 'png' : 'webp'}`;

/** In-game burst button only. Character Select retains its existing vertical artwork. */
export const characterBurstButtonArt = (id: CharacterId): string | null =>
  (['marian', 'crown', 'kilo', 'cecil', 'sin', 'wells'] as readonly CharacterId[]).includes(id)
    ? `ui/survivor/${id}-burst-setup-v1.png` : null;

export const characterVoice = (id: CharacterId, file: string): string => `assets/audio/voice/characters/${id}/${file}`;
