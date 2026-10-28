// Snow White in the survivor runtime. Weapon numbers are Survivors' CombatData:
// 7 damage, 30% crit, 7 rounds, 1.5 s reload, 0.35 s between shots, semi-automatic, 50 HP.
import type { Vector3 } from '@babylonjs/core';
import { WEAPON_RELOAD } from '../../audio/sound-bank';
import { PX, type CharacterKit, type KitContext } from '../kit';
import { prepareSevenDwarves, sevenDwarves } from './burst';
import { SNOW } from './palette';
import { SnowWhiteTurrets } from './turret';
import { fireLance, type LanceState } from './weapon';
import { SnowWhiteStatusVfx } from './status-vfx';
import { SnowWhiteChargeVfx } from './charge-vfx';
import { prepareBlueFire } from './blue-fire';

const DAMAGE = 7;
/** Charging: a full 1.5 s hold triples damage and width. */
const CHARGE_DAMAGE = 2, CHARGE_WIDTH = 2;
/** Seventh Dwarf: every 7th round hits like a Burst (10× attack) and is visibly wider. */
const SEVENTH_SHOT = 7, SEVENTH_DAMAGE = 10, SEVENTH_WIDTH = 2.2;

export function createSnowWhite(ctx: KitContext): CharacterKit {
  const turrets = new SnowWhiteTurrets(ctx, DAMAGE);
  const statuses = new SnowWhiteStatusVfx(ctx);
  const chargeVfx = new SnowWhiteChargeVfx(ctx);
  const lance: LanceState = { attack: DAMAGE, heavyHits: 0 };
  let shots = 0;
  const fire = (muzzle: Vector3, aim: Vector3, charge = 0) => {
    const held = Math.max(0, Math.min(1, charge));
    let damage = DAMAGE * (1 + CHARGE_DAMAGE * held), width = 1 + CHARGE_WIDTH * held;
    shots++;
    if (ctx.run.talents.has('seventh_dwarf') && shots % SEVENTH_SHOT === 0) {
      damage = Math.max(damage, DAMAGE * SEVENTH_DAMAGE);
      width = Math.max(width, SEVENTH_WIDTH);
      ctx.camera.shake(.08, .1);
    }
    fireLance(ctx, muzzle, aim, damage, width, lance);
  };
  return {
    weapon: { damage: DAMAGE, magazine: 7, reload: 1.5, cooldown: .35, automatic: false, moveSpeed: 640 * PX, maxHp: 50 },
    talentTiers: true,
    specialName: 'Auto-Turret',
    burstName: 'Seven Dwarves',
    affiliation: 'Pilgrim',
    accent: SNOW.cyan,
    reloadSound: WEAPON_RELOAD.sniper,
    icons: { weapon: 'rifle', special: 'turret', dash: 'dash' },
    fire,
    useSpecial: () => turrets.use(),
    special: () => turrets.state(),
    previewCharge: (weapon, burst, yaw) => chargeVfx.update(weapon, burst, yaw),
    useBurst: (origin: Vector3, yaw: number, charge = 0) => {
      sevenDwarves(ctx, origin, yaw, DAMAGE, charge);
      if (ctx.run.talents.has('century_prep')) turrets.deployPerimeter();
    },
    update: (dt: number) => { turrets.update(dt); statuses.update(); },
    prepare: async () => { await prepareBlueFire(ctx); await prepareSevenDwarves(ctx.scene); await turrets.prepare(); },
  };
}
