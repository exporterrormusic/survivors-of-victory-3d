// What each Rapture role does (GAME_PLAN §7): one file per role, registered here.
// To give a role its own behavior: write behaviors/<role>.ts exporting a BehaviorFactory, then add
// one line to ROLE_BEHAVIORS. Roles left out use the fallback attack, so every Rapture fights.

import type { Target } from '../../targets';
import type { RaptureSpec, Role } from '../roster';
import { bombard } from './bombard';
import { boss } from './boss';
import { diver } from './diver';
import { emplacement } from './emplacement';
import { exploder } from './exploder';
import { fallback } from './fallback';
import { gunship } from './gunship';
import { howler } from './howler';
import { jammer } from './jammer';
import { charger } from './lanes';
import { incinerator } from './incinerator';
import { mortar, sniper } from './ranged';
import { shielder } from './shielder';
import { skirmisher } from './skirmisher';
import { spinner } from './spinner';
import { spotter } from './spotter';
import { swarmer } from './swarmer';
import type { Behavior, BehaviorContext, BehaviorFactory } from './types';

export type { Behavior, BehaviorContext, BehaviorFactory } from './types';
export { detonate } from './common';

const ROLE_BEHAVIORS: Partial<Record<Role, BehaviorFactory>> = {
  swarmer,
  charger,
  exploder,
  spotter,
  shielder,
  sniper,
  mortar,
  diver,
  skirmisher,
  emplacement,
  spinner,
  jammer,
  gunship,
  bombard,
  incinerator,
  howler,
  boss,
};

export function createBehavior(ctx: BehaviorContext, target: Target, spec: RaptureSpec): Behavior {
  return (ROLE_BEHAVIORS[spec.role] ?? fallback)(ctx, target, spec);
}
