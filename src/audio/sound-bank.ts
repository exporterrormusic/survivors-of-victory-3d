// Every sound a match uses, recycled from Survivors of Victory (public/assets/audio).
// Base volumes follow that game's mix; the SFX and music settings scale them.
import type { WeaponSound } from '../characters';

export interface Cue {
  readonly url: string;
  /** base volume before the SFX setting */
  readonly volume: number;
  /** most simultaneous plays; further requests are dropped */
  readonly voices: number;
  /** minimum seconds between starts */
  readonly gap: number;
}

export interface Track {
  readonly url: string;
  readonly title: string;
  /** base volume before the music setting */
  readonly volume: number;
}

const path = (file: string): string => `assets/audio/${file}`;
const cue = (file: string, volume: number, voices = 4, gap = 0): Cue => ({ url: path(file), volume, voices, gap });

/** Basic attacks and weapon abilities, by the character's weapon family. */
export const WEAPON_FIRE: Readonly<Record<WeaponSound, Cue>> = {
  sniper: cue('gameplay/weapons/fire-sniper.mp3', .65, 3),
  rocket: cue('gameplay/weapons/fire-rocket.mp3', .48, 3),
  shotgun: cue('gameplay/weapons/fire-shotgun.mp3', .48, 3),
  assault: cue('gameplay/weapons/fire-assault.mp3', .32),
  smg: cue('gameplay/weapons/fire-smg.mp3', .32, 4, .072),
  minigun: cue('gameplay/weapons/fire-minigun.mp3', .32, 4, .072),
  sword: cue('gameplay/weapons/fire-sword.mp3', .4, 3),
  beam: cue('gameplay/enemies/beam.wav', .3, 2),
};

/** Magazine reloads (basic attacks with a magazine), by weapon family. */
export const WEAPON_RELOAD: Readonly<Partial<Record<WeaponSound, Cue>>> = {
  sniper: cue('gameplay/weapons/reload-sniper.mp3', .45, 1),
  shotgun: cue('gameplay/weapons/reload-shotgun.mp3', .45, 1),
  rocket: cue('gameplay/weapons/reload-rocket.mp3', .45, 1),
  smg: cue('gameplay/weapons/reload-smg.mp3', .4, 1),
  assault: cue('gameplay/weapons/reload-assault.mp3', .4, 1),
  minigun: cue('gameplay/weapons/reload-minigun.mp3', .4, 1),
  beam: cue('gameplay/weapons/marian-beam-reload.wav', .4, 1),
};

/** Ability casts marked `sound: 'special'`: the weapon's special-attack sound, else its shot. */
export const WEAPON_SPECIAL: Readonly<Partial<Record<WeaponSound, Cue>>> = {
  sword: cue('gameplay/weapons/special-sword.mp3', .5, 2),
  assault: cue('gameplay/weapons/special-assault.mp3', .5, 2),
  minigun: cue('gameplay/weapons/special-minigun.mp3', .45, 2),
  rocket: cue('gameplay/weapons/rocket-fly.mp3', .45, 2),
};

export const SFX = {
  explosion: cue('gameplay/weapons/rocket-explosion.mp3', .45, 4, .04),
  /** dash and other quick movement */
  whoosh: cue('gameplay/weapons/fire-sword.mp3', .25, 2),
  /** heroic beam */
  burstBeam: cue('gameplay/enemies/beam.wav', .5, 1),
  /** many minions fire at once, so these are quiet and tightly limited */
  nikkeMinionFire: cue('gameplay/weapons/fire-assault.mp3', .14, 3, .07),
  raptureBolt: cue('gameplay/enemies/beam.wav', .14, 3, .08),
  raptureMortar: cue('gameplay/weapons/fire-rocket.mp3', .18, 2, .12),
  raptureDeath: cue('gameplay/enemies/rapture-growl.mp3', .3, 2, .25),
  /** healing casts and summons */
  heal: cue('ui/confirm.wav', .3, 2),
  summon: cue('ui/select.wav', .35, 2),
} as const;

/** Interface sounds shared with the menus (same files and levels as the Phaser front end). */
export const UI = {
  select: cue('ui/select.wav', .16, 2),
  confirm: cue('ui/confirm.wav', .22, 2),
  back: cue('ui/back.wav', .3, 2),
  /** team level up (Survivors' level-up chime) */
  level: cue('ui/level.wav', .3, 1),
} as const;

/** Survivors' battle mix: one base volume, corrected per track to equal loudness (its volume_offset_db). */
const MUSIC_BASE = .27;
const music = (file: string, title: string, offsetDb: number): Track =>
  ({ url: path(`gameplay/music/${file}`), title, volume: MUSIC_BASE * 10 ** (offsetDb / 20) });

/** In-match music. A character's `theme` names one of these; it usually opens the match. */
export const BATTLE_TRACKS = {
  battle: music('battle.mp3', 'Battle', .3),
  breakbeat: music('breakbeat.mp3', 'Breakbeat', -1.6),
  dark: music('dark.mp3', 'Dark', -.3),
  fast: music('racer.mp3', 'Fast', .9),
  train: music('train.mp3', 'Train', -.3),
  western: music('western.mp3', 'Western', .9),
  nayuta: music('nayuta.mp3', "Seen It All (Nayuta's Theme)", .5),
  rapunzel: music('rapunzel.mp3', "Yet Still I Believe (Rapunzel's Theme)", 1.1),
  sin: music('sin.mp3', "Taste My Silver Tongue (Sin's Theme)", -.3),
  snow: music('snow.mp3', "Unyielding (Snow White's Theme)", -1.1),
} as const satisfies Record<string, Track>;

export type BattleTrackId = keyof typeof BATTLE_TRACKS;
