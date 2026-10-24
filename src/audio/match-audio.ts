// Match sound: the battle playlist plus combat events mapped to cues. Positional falloff from
// the camera focus keeps distant lane fights quiet; the hero's sounds come from their
// character folder (weapon family, theme, burst voice lines), never from per-hero code here.
import type { Vector3 } from '@babylonjs/core';
import type { CastSound } from '../abilities/types';
import type { CharacterModule, VoiceLine } from '../characters';
import { characterVoice } from '../characters/assets';
import type { CombatEvent } from '../combat-events';
import type { Combat } from '../combat';
import { audioEngine } from './audio-engine';
import { setNowPlaying } from './music-control';
import { BATTLE_TRACKS, SFX, UI, WEAPON_FIRE, WEAPON_RELOAD, WEAPON_SPECIAL, type Cue, type Track } from './sound-bank';

/** Full volume within this many metres of the camera focus, silent beyond FAR. */
const NEAR = 12;
const FAR = 48;
/** metres of horizontal offset that pan fully to one side */
const PAN_WIDTH = 24;
/** Survivors opened a match with the hero's theme this often. */
const THEME_CHANCE = .75;

/** `hero` is read per event, so switching outfit or hero mid-match changes the sounds too. */
export function startMatchAudio(combat: Combat, hero: () => CharacterModule, listener: Vector3): void {
  const voiceCues = new Map<VoiceLine, Cue>();
  const kit = () => {
    const character = hero();
    const voices = character.voices.map((line) => {
      let cue = voiceCues.get(line);
      if (!cue) { cue = voiceCue(character, line); voiceCues.set(line, cue); audioEngine.preload([cue.url]); }
      return { line, cue };
    });
    const weapon = WEAPON_FIRE[character.weapon];
    const special = WEAPON_SPECIAL[character.weapon] ?? weapon;
    const reload = WEAPON_RELOAD[character.weapon];
    audioEngine.preload([weapon.url, special.url, ...(reload ? [reload.url] : [])]);
    return { weapon, special, reload, voices };
  };
  audioEngine.preload([...Object.values(SFX), ...Object.values(UI)].map((cue) => cue.url));
  kit();

  const playlist = battlePlaylist(hero());
  let trackIndex = 0;
  const playTrack = (index: number) => {
    trackIndex = index % playlist.length;
    const track = playlist[trackIndex];
    void audioEngine.playMusic(track, () => playTrack(trackIndex + 1));
    setNowPlaying(track.title, {
      next: () => playTrack(trackIndex + 1),
      previous: () => playTrack(trackIndex - 1 + playlist.length),
    });
  };
  playTrack(0);

  const at = (cue: Cue, position: Vector3, gain = 1) => {
    const dx = position.x - listener.x, dz = position.z - listener.z, distance = Math.hypot(dx, dz);
    const falloff = Math.max(0, Math.min(1, 1 - (distance - NEAR) / (FAR - NEAR)));
    if (falloff > 0) audioEngine.play(cue, gain * falloff, dx / PAN_WIDTH);
  };
  const castCue = (sound: CastSound): Cue | null => {
    switch (sound) {
      case 'weapon': return kit().weapon;
      case 'special': return kit().special;
      case 'dash': return SFX.whoosh;
      case 'beam': return SFX.burstBeam;
      case 'heal': return SFX.heal;
      case 'summon': return SFX.summon;
      case 'none': return null;
    }
  };

  let stopWeaponBeam: (() => void) | undefined;
  combat.events.add((event: CombatEvent) => {
    switch (event.kind) {
      case 'attack':
        at(kit().weapon, event.at, event.charged ? 1.15 : 1);
        break;
      case 'weapon-beam':
        stopWeaponBeam?.();
        stopWeaponBeam = event.active ? audioEngine.loop(WEAPON_FIRE.beam) : undefined;
        break;
      case 'reload': {
        const reload = kit().reload;
        if (reload) at(reload, event.at);
        break;
      }
      case 'ability': {
        const cue = castCue(event.sound);
        if (cue) at(cue, event.at, event.sound === 'weapon' ? 1.2 : 1);
        if (event.slot === 'R') {
          const voice = pickVoice(kit().voices);
          if (voice) audioEngine.play(voice);
        }
        break;
      }
      case 'minion-attack':
        at(event.team === 'blue' ? SFX.nikkeMinionFire : event.attack === 'mortar' ? SFX.raptureMortar : SFX.raptureBolt, event.at);
        break;
      case 'explosion':
        at(SFX.explosion, event.at, Math.min(1.3, 0.6 + event.radius * 0.2));
        break;
      case 'death':
        if (event.team === 'red') at(SFX.raptureDeath, event.at);
        break;
      case 'level-up':
        if (event.team === 'blue') audioEngine.play(UI.level);
        break;
    }
  });

  // The in-match settings panel (F10 / menu button) clicks like the front end's menus.
  const menu = document.getElementById('menu');
  if (menu) {
    let open = !menu.classList.contains('hidden');
    new MutationObserver(() => {
      const now = !menu.classList.contains('hidden');
      if (now !== open) audioEngine.play(now ? UI.select : UI.back);
      open = now;
    }).observe(menu, { attributes: true, attributeFilter: ['class'] });
  }
}

/** Every battle track, shuffled; the hero's theme usually goes first. */
function battlePlaylist(character: CharacterModule): Track[] {
  const tracks: Track[] = Object.values(BATTLE_TRACKS);
  for (let i = tracks.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [tracks[i], tracks[j]] = [tracks[j], tracks[i]];
  }
  const theme = character.theme && BATTLE_TRACKS[character.theme];
  if (theme && Math.random() < THEME_CHANCE) tracks.unshift(...tracks.splice(tracks.indexOf(theme), 1));
  return tracks;
}

function voiceCue(character: CharacterModule, line: VoiceLine): Cue {
  // Survivors' selection-voice mix: 0.5 base, corrected per line.
  return { url: characterVoice(character.id, line.file), volume: 0.5 * 10 ** (line.offsetDb / 20), voices: 1, gap: 0 };
}

function pickVoice(voices: readonly { line: VoiceLine; cue: Cue }[]): Cue | undefined {
  let roll = Math.random() * voices.reduce((sum, v) => sum + v.line.weight, 0);
  for (const v of voices) if ((roll -= v.line.weight) <= 0) return v.cue;
  return voices.at(-1)?.cue;
}
