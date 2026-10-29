// What a character folder provides. Systems (Character Select, the match loader, audio)
// read these fields; they never special-case a character by id.
import type { Kit } from '../abilities/types';
import type { BattleTrackId } from '../audio/sound-bank';
import type { CharacterId } from './ids';
import type { TalentDefinition } from './talent-types';

/** Survivors of Victory card data: stats and ability text shown in Character Select. */
export interface CharacterProfile {
  readonly accent: number;
  readonly attack: number;
  readonly basicAttackDescription: string;
  readonly burstDescription: string;
  readonly burstName: string;
  readonly crit: number;
  readonly description: string;
  readonly hp: number;
  readonly id: CharacterId;
  readonly name: string;
  readonly normalAttackDescription: string;
  readonly portraitPath: string;
  readonly speed: number;
  readonly specialDescription: string;
  readonly specialName: string;
  readonly skill2Description?: string;
  readonly skill2Name?: string;
  readonly squad: string;
  readonly unlockCost: number;
  readonly weapon: string;
  readonly weaponTag: string;
}

/** Firing sound family; see src/audio/sound-bank.ts. */
export type WeaponSound = 'assault' | 'pulse-rifle' | 'minigun' | 'rocket' | 'shotgun' | 'smg' | 'sniper' | 'sword' | 'beam';

export interface VoiceLine {
  /** file in assets/audio/voice/characters/<id>/ */
  readonly file: string;
  /** loudness correction against the other lines */
  readonly offsetDb: number;
  /** relative pick chance when a character has several */
  readonly weight: number;
}

/** The 3D chibi a character uses in matches. */
export interface FieldModel {
  /** NKAS model id: public/chibi/<variant>.glb (npm run chibi -- <variant>) */
  readonly variant: string;
  /** 'head' for staff/sword users whose weapon does not point along the attack */
  readonly aim: 'weapon' | 'head';
  /** 'body': shots leave from in front of the chest, for weapons that don't point at the target
   *  (Nayuta's ring floats behind her; Rapunzel carries her launcher sideways). Default 'weapon'. */
  readonly muzzle?: 'weapon' | 'body';
  /** alternate outfits offered in the in-match F10 menu */
  readonly skins?: readonly { readonly variant: string; readonly name: string }[];
}

export interface CharacterModule {
  readonly id: CharacterId;
  /** in-match display name */
  readonly name: string;
  readonly profile: CharacterProfile;
  readonly talents: readonly TalentDefinition[];
  /** null keeps the character locked in Character Select */
  readonly model: FieldModel | null;
  /** shown on locked cards instead of a shop price */
  readonly lockedReason?: string;
  readonly weapon: WeaponSound;
  /** burst lines: Character Select picks and in-match bursts */
  readonly voices: readonly VoiceLine[];
  /** MOBA abilities (./<id>/kit.ts); without one the character plays the prototype kit */
  readonly kit?: Kit;
  /** battle track that usually opens their matches */
  readonly theme?: BattleTrackId;
}
