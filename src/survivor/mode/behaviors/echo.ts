// Co-op: projectile launches announced to a listener, so a host can send them to guests, who fly
// harmless copies (src/survivor/coop/net-guest.ts). Bolts and missiles are fully determined at
// launch, so one message per shot is enough. No listener outside co-op hosting.

export type AttackEcho =
  | { kind: 'bolt'; x: number; y: number; z: number; yaw: number; speed: number; range: number; size: number }
  | { kind: 'missile'; x: number; y: number; z: number; tx: number; tz: number; radius: number; flight: number; wait: number; side: number; size: number; loft: number };

export const attackEcho: { listener: ((echo: AttackEcho) => void) | null } = { listener: null };
