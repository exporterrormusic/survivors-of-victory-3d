/** Phaser ScarletMechanics, in world metres (80 pixels per metre). */
export function missingHpMultiplier(hp: number, maxHp: number, enabled: boolean): number {
  // Scraping the Bottle: up to +150% at 50% HP or lower, the floor her sword swings take her to.
  return enabled && maxHp > 0 ? 1 + Math.min(1.5, Math.max(0, 1 - hp / maxHp) / .5 * 1.5) : 1;
}
export const burstHpAfterCost = (hp: number) => Math.max(1, hp - Math.floor(hp * .5));
export const SWORD_HALF_ANGLE = Math.PI * 4 / 9;
export const SWORD_SWEEP_SECONDS = .18;
export function slashContains(dx: number, dz: number, yaw: number, radius = 0, wipe = 1): boolean {
  const d = Math.hypot(dx, dz);
  if (d > 3.9 + radius || wipe <= 0) return false;
  if (d <= radius) return true;
  const angle = Math.atan2(dx * Math.cos(yaw) - dz * Math.sin(yaw), dx * Math.sin(yaw) + dz * Math.cos(yaw));
  const padding = Math.asin(Math.min(1, radius / d));
  return angle >= -SWORD_HALF_ANGLE - padding && angle <= -SWORD_HALF_ANGLE + 2 * SWORD_HALF_ANGLE * Math.min(1, wipe) + padding;
}
