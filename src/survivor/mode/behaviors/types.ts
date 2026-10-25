// What every Rapture behavior gets and must provide (GAME_PLAN §7). Every attack follows the same
// shape: notice the player, show its tell, act, recover.

import type { EnemyAttackPacing } from '../../enemy-attack';
import type { Player } from '../../player';
import type { Run } from '../../run';
import type { SnowField } from '../../snow-field';
import type { Target, TargetField } from '../../targets';
import type { Vfx } from '../../vfx';
import type { RaptureSpec } from '../roster';
import type { TelegraphLayer } from '../telegraph';

export interface BehaviorContext {
  readonly player: Player;
  readonly field: TargetField;
  readonly run: Run;
  readonly vfx: Vfx;
  readonly tells: TelegraphLayer;
  readonly snow?: SnowField;
  readonly pacing: EnemyAttackPacing;
  readonly arenaRadius: number;
}

export interface Behavior {
  /** false once the behavior has nothing left to do (it may outlive its body, e.g. a dropped charge) */
  readonly active: boolean;
  update(dt: number): void;
  dispose(): void;
}

/** Builds one Rapture's behavior; each role file exports one (see index.ts). */
export type BehaviorFactory = (ctx: BehaviorContext, target: Target, spec: RaptureSpec) => Behavior;
