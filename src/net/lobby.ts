// Co-op lobby (the Multiplayer menu): who's in, which NIKKE and skin each picked, who's ready, and
// the host's map and mode. Runs on an open CoopHost / CoopGuest session, which carries on into the
// match (coop-handoff.ts), so nobody joins twice. No Phaser or Babylon: the Node tests load it.
//
// Events: guest → host `pick` (LobbyPick); host → all `lobby` (LobbyState, on every change and once
// a second, since an event can beat the welcome) and `start` (the final LobbyState).

import type { CoopGuest, CoopHost } from './session';

export interface LobbyPick { character: string; skin: string; ready: boolean }
export interface LobbyPlayer extends LobbyPick { slot: number; name: string }
export interface LobbyStage { zoneId: string; time: string; modeId: string }
export interface LobbyState { stage: LobbyStage; players: LobbyPlayer[] }

const RESEND_SECONDS = 1;

const isPick = (data: unknown): data is LobbyPick => {
  const p = data as LobbyPick | null;
  return !!p && typeof p.character === 'string' && typeof p.skin === 'string' && typeof p.ready === 'boolean';
};

export class LobbyHost {
  readonly session: CoopHost;
  stage: LobbyStage;
  /** every player's pick by slot; the host is slot 0 */
  readonly picks = new Map<number, LobbyPick>();
  onChange: (() => void) | null = null;
  private resendIn = 0;

  constructor(session: CoopHost, pick: LobbyPick, stage: LobbyStage) {
    this.session = session;
    this.stage = stage;
    this.picks.set(0, { ...pick, ready: true });
    session.onPlayerJoined = entry => { this.picks.set(entry.slot, { character: entry.character, skin: '', ready: false }); this.changed(); };
    session.onPlayerLeft = entry => { this.picks.delete(entry.slot); this.changed(); };
    session.onGuestEvent = (slot, event) => {
      if (event.name === 'ping') session.emit({ name: 'pong', data: { slot, sent: event.data } });
      else if (event.name === 'pick' && isPick(event.data) && this.picks.has(slot) && !session.started) {
        const { character, skin, ready } = event.data;
        this.picks.set(slot, { character, skin, ready });
        this.changed();
      }
    };
  }

  get state(): LobbyState {
    const names = new Map(this.session.roster.map(entry => [entry.slot, entry.name]));
    const players = [...this.picks].filter(([slot]) => names.has(slot)).sort(([a], [b]) => a - b)
      .map(([slot, pick]) => ({ slot, name: names.get(slot)!, ...pick }));
    return { stage: { ...this.stage }, players };
  }

  /** Everyone but the host has readied up (the host can also start alone). */
  get allReady(): boolean { return this.state.players.every(p => p.ready); }

  setPick(pick: Omit<LobbyPick, 'ready'>): void { this.picks.set(0, { ...pick, ready: true }); this.changed(); }
  setStage(stage: Partial<LobbyStage>): void { this.stage = { ...this.stage, ...stage }; this.changed(); }

  /** Close the doors (late joiners are turned away) and send everyone into the match. */
  start(): LobbyState {
    this.session.started = true;
    const state = this.state;
    this.session.emit({ name: 'start', data: state });
    return state;
  }

  update(dt: number): void {
    this.session.dropSilent();
    if ((this.resendIn -= dt) <= 0) this.broadcast();
  }

  private changed(): void { this.broadcast(); this.onChange?.(); }
  private broadcast(): void {
    this.resendIn = RESEND_SECONDS;
    if (this.session.roster.length > 1) this.session.emit({ name: 'lobby', data: this.state });
  }
}

export class LobbyGuest {
  readonly session: CoopGuest;
  state: LobbyState | null = null;
  pick: LobbyPick;
  onChange: (() => void) | null = null;
  onStart: ((state: LobbyState) => void) | null = null;
  private sentPick = '';
  private resendIn = 0;

  constructor(session: CoopGuest, pick: Omit<LobbyPick, 'ready'>) {
    this.session = session;
    this.pick = { ...pick, ready: false };
    session.onEvent = event => {
      if (event.name === 'lobby') { this.state = event.data as LobbyState; this.onChange?.(); }
      else if (event.name === 'start') { this.state = event.data as LobbyState; this.onStart?.(this.state); }
    };
  }

  setPick(pick: Partial<LobbyPick>): void { this.pick = { ...this.pick, ...pick }; this.update(0); this.onChange?.(); }

  /** Send our pick when it changes (and now and then, in case the host missed it). */
  update(dt: number): void {
    if (this.session.state !== 'joined') return;
    const key = JSON.stringify(this.pick);
    if (key === this.sentPick && (this.resendIn -= dt) > 0) return;
    this.sentPick = key; this.resendIn = RESEND_SECONDS * 2;
    this.session.send({ name: 'pick', data: this.pick });
  }
}
