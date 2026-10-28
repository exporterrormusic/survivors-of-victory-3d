/** Authored graybox route. Progress depends on position, never ordinary enemy kills. */
export const RELAY_ROUTE = [
  { x: 21, z: -19, name: 'East street' },
  { x: 21, z: 0, name: 'Market crossing' },
  { x: -20, z: 0, name: 'West street' },
  { x: -20, z: 20, name: 'Relay approach' },
  { x: 0, z: 24, name: 'Relay tower' },
] as const;
export const RELAY_BLOCKS = [
  { x: -7, z: -10, width: 42, depth: 8 },
  { x: 9, z: 10, width: 36, depth: 8 },
] as const;
export class RelayRoute {
  step = 0;
  outcome: 'victory' | 'defeat' | null = null;
  healingUsed = false;
  get destination() { return RELAY_ROUTE[Math.min(this.step, RELAY_ROUTE.length - 1)]; }
  get atTower() { return this.step === RELAY_ROUTE.length; }
  update(x: number, z: number, hp: number, bossDefeated: boolean): boolean {
    if (this.outcome) return false;
    if (hp <= 0) { this.outcome = 'defeat'; return false; }
    if (this.atTower && bossDefeated) { this.outcome = 'victory'; return false; }
    // Waypoints guide the player; taking a shortcut must never strand the mission.
    const tower=RELAY_ROUTE[RELAY_ROUTE.length-1];
    if(!this.atTower && Math.hypot(x-tower.x,z-tower.z)<7){this.step=RELAY_ROUTE.length;return true;}
    if (!this.atTower && Math.hypot(x - this.destination.x, z - this.destination.z) < 7) {
      this.step++; return true;
    }
    return false;
  }
  heal(x: number, z: number, hp: number, maxHp: number): number {
    if (this.outcome || this.healingUsed || hp <= 0 || hp >= maxHp || Math.hypot(x + 24, z + 23) > 3) return 0;
    this.healingUsed = true;
    return Math.min(maxHp - hp, maxHp * .6);
  }
}
