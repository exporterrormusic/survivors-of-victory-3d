// What each Rapture role does (GAME_PLAN §7): one file per role, registered here.
// To give a role its own behavior: write behaviors/<role>.ts exporting a BehaviorFactory, then add
// one line to ROLE_BEHAVIORS. Roles left out use the fallback attack, so every Rapture fights.

import type { Target } from '../../targets';
import type { RaptureSpec, Role } from '../roster';
import { charger, pouncer } from './dash';
import { exploder } from './exploder';
import { fallback } from './fallback';
import { swarmer } from './swarmer';
import type { Behavior, BehaviorContext, BehaviorFactory } from './types';

export type { Behavior, BehaviorContext, BehaviorFactory } from './types';
export { detonate } from './common';

const ROLE_BEHAVIORS: Partial<Record<Role, BehaviorFactory>> = {
  swarmer,
  pouncer,
  charger,
  exploder,
};

export function createBehavior(ctx: BehaviorContext, target: Target, spec: RaptureSpec): Behavior {
  return (ROLE_BEHAVIORS[spec.role] ?? fallback)(ctx, target, spec);
}
