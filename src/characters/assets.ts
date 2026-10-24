// Per-character asset locations under public/assets (recycled from Survivors of Victory).
import type { CharacterId } from './ids';

export const characterPortrait = (id: CharacterId): string => `assets/menus/character-select/${id}/portrait.png`;

export const characterBurstArt = (id: CharacterId): string => `assets/menus/character-select/${id}/burst.webp`;

export const characterVoice = (id: CharacterId, file: string): string => `assets/audio/voice/characters/${id}/${file}`;
