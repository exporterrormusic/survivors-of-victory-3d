// Co-op wire format. Everything is plain JSON so it crosses any transport; binary packing can come later.
// Not imported by the game yet — see docs/COOP_PLAN.md.

export const PROTOCOL_VERSION = 1;
export const APP_ID = 'nikke-survivors-coop';
/** Survival co-op design target. A MOBA mode would raise this to 10; nothing else assumes 3. */
export const DEFAULT_MAX_PLAYERS = 3;
/** Slot 0 is always the host. */
export const HOST_SLOT = 0;

/** Bit flags for held buttons in PlayerInput.buttons; one per survivor Action a guest can use. */
export const Button = { fire: 1, special: 2, burst: 4, dash: 8, reload: 16 } as const;

/** One frame of a guest's controls, sent to the host. seq increases by one per input. */
export interface PlayerInput {
  seq: number;
  moveX: number; moveZ: number;
  /** world-space aim point */
  aimX: number; aimZ: number;
  buttons: number;
  /** where the guest's hero is: guests move their own hero (instant controls) and the host trusts it */
  x?: number; z?: number;
}

export interface EntityState { id: number; x: number; z: number; yaw: number; hp: number; anim?: number
  /** what it is (a Rapture model id), so a guest can draw the right thing */
  kind?: string; maxHp?: number }
export interface PlayerState extends EntityState { slot: number; maxHp: number; down: boolean; name?: string
  /** hero id, so a guest can build the right model */
  hero?: string;
  /** the hero's skin (chibi model id), if not the default */
  skin?: string;
  /** held Button bits, so a guest can show this hero firing */
  buttons?: number }

/** Host world state. Guests drop any snapshot older than the newest they have. */
export interface Snapshot {
  tick: number;
  /** host simulation seconds */
  time: number;
  /** last input seq the host applied, per slot, for guest prediction replay */
  acks: Record<number, number>;
  players: PlayerState[];
  entities: EntityState[];
  /** ground warnings, so guests can dodge what the host's Raptures are about to do */
  tells?: TellState[];
}

/** A live ground warning on the host (mode/telegraph.ts), centre-positioned: shape 0 circle, 1 lane. */
export interface TellState { s: 0 | 1; x: number; z: number; yaw: number; w: number; l: number; c: readonly [number, number, number]; a: number; f: number }

export interface RosterEntry { slot: number; peerId: string; name: string; character: string }

/** One-off gameplay events (kills, downs, revives, lift state, banners, round end). */
export interface GameEvent { name: string; data?: unknown }

export type RejectReason = 'full' | 'version' | 'started';

export type ControlMessage =
  | { t: 'hello'; v: number; name: string; character: string }
  | { t: 'welcome'; slot: number; maxPlayers: number; roster: RosterEntry[] }
  | { t: 'reject'; reason: RejectReason }
  | { t: 'roster'; roster: RosterEntry[] };

/** Logical channels; Trystero gives each its own action, so names stay short. */
export type Channel = 'ctrl' | 'input' | 'snap' | 'event';
export const CHANNELS: readonly Channel[] = ['ctrl', 'input', 'snap', 'event'];
