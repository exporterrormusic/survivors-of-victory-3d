// The lobby's open session carries into the match: the menus and the survivor run share one page
// (src/app.ts swaps Phaser for Babylon without a reload), so the lobby leaves it here and the
// match's CoopNetHost / CoopNetGuest picks it up. A guest keeps pinging while its match loads, so
// the host (who may load faster) doesn't drop it as silent.

import type { LobbyGuest, LobbyHost } from './lobby';

export type CoopHandoff =
  | { role: 'host'; code: string; lobby: LobbyHost }
  | { role: 'guest'; code: string; lobby: LobbyGuest };

const KEEPALIVE_MS = 2000;
let pending: CoopHandoff | null = null;
let keepAlive: ReturnType<typeof setInterval> | undefined;

export function handOffCoop(handoff: CoopHandoff): void {
  pending = handoff;
  clearInterval(keepAlive);
  if (handoff.role === 'guest') keepAlive = setInterval(() => handoff.lobby.session.send({ name: 'loading' }), KEEPALIVE_MS);
}

/** The lobby's session for this room, once; null when the match was opened from a link. */
export function takeCoopHandoff<R extends CoopHandoff['role']>(role: R, code: string): Extract<CoopHandoff, { role: R }> | null {
  if (!pending || pending.role !== role || pending.code !== code) return null;
  const handoff = pending as Extract<CoopHandoff, { role: R }>;
  pending = null;
  clearInterval(keepAlive);
  return handoff;
}
