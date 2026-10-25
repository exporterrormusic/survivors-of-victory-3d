// Snow White in the survivor runtime. Weapon numbers are Survivors' CombatData:
// 7 damage, 30% crit, 7 rounds, 1.5 s reload, 0.35 s between shots, semi-automatic, 50 HP.
import type { Vector3 } from '@babylonjs/core';
import { WEAPON_RELOAD } from '../../audio/sound-bank';
import { PX, type CharacterKit, type KitContext } from '../kit';
import { sevenDwarves } from './burst';
import { SNOW } from './palette';
import { SnowWhiteTurrets } from './turret';
import { fireLance } from './weapon';

const DAMAGE = 7;

export function createSnowWhite(ctx: KitContext): CharacterKit {
  const turrets = new SnowWhiteTurrets(ctx, DAMAGE);
  return {
    weapon: { damage: DAMAGE, magazine: 7, reload: 1.5, cooldown: .35, automatic: false, moveSpeed: 480 * PX, maxHp: 50 },
    specialName: 'Auto-Turret',
    burstName: 'Seven Dwarves',
    affiliation: 'Pilgrim',
    accent: SNOW.cyan,
    reloadSound: WEAPON_RELOAD.sniper,
    icons: { weapon: 'rifle', special: 'turret', dash: 'dash' },
    fire: (muzzle: Vector3, aim: Vector3, charge = 0) => fireLance(ctx, muzzle, aim, DAMAGE, charge),
    useSpecial: () => turrets.use(),
    special: () => turrets.state(),
    useBurst: (origin: Vector3, yaw: number, charge = 0) => {
      sevenDwarves(ctx, origin, yaw, DAMAGE, charge);
      if (ctx.run.talents.has('century_prep')) turrets.deployPerimeter();
    },
    update: (dt: number) => turrets.update(dt),
  };
}
