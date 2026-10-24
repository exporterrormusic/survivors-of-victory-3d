// Gameplay → presentation events, published on Combat.events. Gameplay code only reports what
// happened; presentation systems (src/audio/match-audio.ts) decide how it sounds or looks.
import type { Vector3 } from '@babylonjs/core';
import type { Team } from './enemy';
import type { CastSound, KitSlot } from './abilities/types';

export type CombatEvent =
  /** the hero's basic attack left the barrel */
  | { readonly kind: 'attack'; readonly at: Vector3; readonly charged: boolean }
  | { readonly kind: 'weapon-beam'; readonly active: boolean }
  /** the hero emptied their magazine and started reloading */
  | { readonly kind: 'reload'; readonly at: Vector3 }
  /** the hero used an ability: on release, at the start of a dash, or when a channel starts firing */
  | { readonly kind: 'ability'; readonly slot: KitSlot; readonly at: Vector3; readonly sound: CastSound }
  | { readonly kind: 'minion-attack'; readonly at: Vector3; readonly team: Team; readonly attack: 'bolt' | 'fan' | 'mortar' }
  | { readonly kind: 'explosion'; readonly at: Vector3; readonly radius: number }
  | { readonly kind: 'death'; readonly at: Vector3; readonly team: Team }
  | { readonly kind: 'level-up'; readonly team: Team; readonly level: number };
