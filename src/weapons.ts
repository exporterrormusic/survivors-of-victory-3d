// Survivors weapon patterns in world units. Targeted and cursor attacks use the same
// physical pattern; aim assistance chooses a direction, not a generic homing bullet.
import { Vector3 } from '@babylonjs/core';
import { tintColor, type Combat } from './combat';
import type { BasicAttack, StatusSpec, TraitDefinition } from './abilities/types';

export function fireWeapon(combat: Combat, basic: BasicAttack, origin: Vector3, from: Vector3, dir: Vector3,
  aim: Vector3, damage: number, charged: boolean, sequence: number, status?: StatusSpec, splash?: TraitDefinition['splash']): void {
  const weapon = basic.weapon;
  const color = tintColor(basic.tint ?? '#ffd98a');
  if (weapon.kind === 'sword') {
    combat.melee(origin, dir, basic.range, weapon.angle, damage, color, status, sequence % 2 === 0);
    return;
  }
  if (weapon.kind === 'beam') return; // continuous damage and aim tracking are driven by Hero
  const count = weapon.kind === 'shotgun' ? weapon.pellets : weapon.kind === 'smg' ? 2 : 1;
  for (let i = 0; i < count; i++) {
    const angle = weapon.kind === 'shotgun' ? (i / (count - 1) - .5) * weapon.spread : 0;
    const cos = Math.cos(angle), sin = Math.sin(angle);
    const direction = new Vector3(dir.x * cos + dir.z * sin, 0, dir.z * cos - dir.x * sin);
    const muzzle = from.clone();
    if (weapon.kind === 'smg') {
      const offset = (i - .5) * weapon.separation;
      muzzle.addInPlaceFromFloats(dir.z * offset, 0, -dir.x * offset);
    }
    // Staff rockets detonate at the cursor / targeted unit's current position if they miss a body.
    const range = weapon.kind === 'rocket'
      ? Math.max(.25, Math.min(basic.aimedRange, Math.hypot(aim.x - from.x, aim.z - from.z))) : basic.aimedRange;
    combat.fireBolt(muzzle, direction, {
      damage: damage / count, range, speed: weapon.speed, pierce: weapon.kind === 'sniper',
      size: charged ? 1.35 : 1, color, status, visual: weapon.kind,
      splash: weapon.kind === 'rocket' ? splash ?? { radius: weapon.radius, fraction: 1 } : splash,
      explodeAtEnd: weapon.kind === 'rocket',
    });
  }
}
