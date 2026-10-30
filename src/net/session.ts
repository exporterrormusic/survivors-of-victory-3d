// Host-authoritative co-op sessions. The host simulates; guests send inputs and draw snapshots.
// Engine-free: the game loop (Phase 1+) calls takeInput/broadcast on the host and sendInput on guests.
import { DEFAULT_MAX_PLAYERS, HOST_SLOT, PROTOCOL_VERSION,
  type ControlMessage, type GameEvent, type PlayerInput, type RejectReason, type RosterEntry, type Snapshot } from './protocol';
import { SnapshotBuffer } from './interpolation';
import type { Transport } from './transport';

export interface LocalPlayer { name: string; character: string }

export class CoopHost {
  readonly slot = HOST_SLOT;
  /** set once the round starts; later joiners are turned away (drop-in is Phase 4) */
  started = false;
  onPlayerJoined: ((entry: RosterEntry) => void) | null = null;
  onPlayerLeft: ((entry: RosterEntry) => void) | null = null;
  /** reliable events from guests, e.g. { name: 'spend', data: abilityId } */
  onGuestEvent: ((slot: number, event: GameEvent) => void) | null = null;
  private readonly entries = new Map<number, RosterEntry>();
  private readonly latest = new Map<number, PlayerInput>();
  /** buttons pressed since the last takeInput, so a tap between host frames isn't lost */
  private readonly held = new Map<number, number>();
  private readonly acks: Record<number, number> = {};
  /** when each guest was last heard from (any message), for dropping closed tabs */
  private readonly heard = new Map<number, number>();
  private readonly now: () => number;
  private tick = 0;
  private lobbyReturn: Promise<void> | null = null;
  /** peers the host kicked: turned away if they say hello again */
  private readonly kicked = new Set<string>();
  private acknowledgeLobbyReturn: ((slot: number) => void) | null = null;

  private readonly transport: Transport;
  readonly maxPlayers: number;

  constructor(transport: Transport, me: LocalPlayer, maxPlayers = DEFAULT_MAX_PLAYERS, now = () => performance.now()) {
    this.transport = transport; this.maxPlayers = maxPlayers; this.now = now;
    this.entries.set(HOST_SLOT, { slot: HOST_SLOT, peerId: transport.selfId, ...me });
    transport.listen({
      message: (channel, data, from) => {
        const known = this.slotOf(from);
        // Silence counts only once a guest plays: loading a match can block a tab for many seconds.
        if (known !== undefined && (this.heard.has(known) || channel === 'input')) this.heard.set(known, this.now());
        if (channel === 'ctrl') this.control(data as ControlMessage, from);
        else if (channel === 'input') this.input(data as PlayerInput, from);
        else if (channel === 'event') {
          const slot = this.slotOf(from), event = data as GameEvent;
          if (slot !== undefined) {
            if (event.name === 'return-to-lobby-ack') this.acknowledgeLobbyReturn?.(slot);
            else this.onGuestEvent?.(slot, event);
          }
        }
      },
      peerJoin: () => {},
      peerLeave: peerId => this.drop(peerId),
    });
  }

  /** whether a guest's match is running (they've sent controls), not still loading */
  playing(slot: number): boolean { return this.heard.has(slot); }

  get roster(): RosterEntry[] { return [...this.entries.values()].sort((a, b) => a.slot - b.slot); }

  /** The guest's latest controls, with every button pressed since the previous call. */
  takeInput(slot: number): PlayerInput | undefined {
    const input = this.latest.get(slot);
    if (!input) return undefined;
    const buttons = input.buttons | (this.held.get(slot) ?? 0);
    this.held.set(slot, 0);
    return { ...input, buttons };
  }

  broadcast(time: number, players: Snapshot['players'], entities: Snapshot['entities'], tells?: Snapshot['tells']): Snapshot {
    const snapshot: Snapshot = { tick: ++this.tick, time, acks: { ...this.acks }, players, entities, ...(tells ? { tells } : {}) };
    this.transport.send('snap', snapshot);
    return snapshot;
  }

  emit(event: GameEvent): void { this.transport.send('event', event); }

  /** Notify every connected guest before closing the match's room connection. */
  returnToLobby(): Promise<void> {
    if (this.lobbyReturn) return this.lobbyReturn;
    this.started = true;
    this.lobbyReturn = (async () => {
      const waiting = new Set(this.roster.filter(entry => entry.slot !== HOST_SLOT).map(entry => entry.slot));
      if (waiting.size) await new Promise<void>(resolve => {
        // A dead peer must not strand the remaining squad in the match.
        const timer = setTimeout(finish, 5000);
        const self = this;
        function finish(): void { clearTimeout(timer); self.acknowledgeLobbyReturn = null; resolve(); }
        this.acknowledgeLobbyReturn = slot => { waiting.delete(slot); if (!waiting.size) finish(); };
        this.emit({ name: 'return-to-lobby' });
      });
      await this.close();
    })();
    return this.lobbyReturn;
  }

  /**
   * Drop guests silent for `silenceMs`. A closed tab can take WebRTC 30 s or more to notice, while a
   * live guest sends inputs many times a second. Guests still loading (no input yet) are left to the
   * transport's own leave. Call every frame or so.
   */
  dropSilent(silenceMs = 8000): void {
    const now = this.now();
    for (const [slot, at] of this.heard) if (now - at > silenceMs) this.drop(this.entries.get(slot)!.peerId);
  }

  /** Remove a guest from the room; they're told, and kept out if they try this room again. */
  kick(slot: number): void {
    const entry = this.entries.get(slot);
    if (!entry || slot === HOST_SLOT) return;
    this.kicked.add(entry.peerId);
    this.transport.send('ctrl', { t: 'kicked' } satisfies ControlMessage, entry.peerId);
    this.drop(entry.peerId);
  }

  async close(): Promise<void> { await this.transport.leave(); }

  private control(message: ControlMessage, from: string): void {
    if (message.t !== 'hello' || this.slotOf(from) !== undefined) return;
    const reject = (reason: RejectReason) => this.transport.send('ctrl', { t: 'reject', reason } satisfies ControlMessage, from);
    if (this.kicked.has(from)) return reject('kicked');
    if (message.v !== PROTOCOL_VERSION) return reject('version');
    if (this.started) return reject('started');
    let slot = 1;
    while (this.entries.has(slot)) slot++;
    if (slot >= this.maxPlayers) return reject('full');
    const entry: RosterEntry = { slot, peerId: from, name: message.name, character: message.character };
    this.entries.set(slot, entry);
    this.transport.send('ctrl', { t: 'welcome', slot, maxPlayers: this.maxPlayers, roster: this.roster } satisfies ControlMessage, from);
    this.sendRoster();
    this.onPlayerJoined?.(entry);
  }

  private input(input: PlayerInput, from: string): void {
    const slot = this.slotOf(from);
    if (slot === undefined || input.seq <= (this.acks[slot] ?? 0)) return;
    this.acks[slot] = input.seq;
    this.latest.set(slot, input);
    this.held.set(slot, (this.held.get(slot) ?? 0) | input.buttons);
  }

  private drop(peerId: string): void {
    const slot = this.slotOf(peerId);
    if (slot === undefined) return;
    const entry = this.entries.get(slot)!;
    this.entries.delete(slot); this.latest.delete(slot); this.held.delete(slot); this.heard.delete(slot); delete this.acks[slot];
    this.acknowledgeLobbyReturn?.(slot);
    this.sendRoster();
    this.onPlayerLeft?.(entry);
  }

  private sendRoster(): void { this.transport.send('ctrl', { t: 'roster', roster: this.roster } satisfies ControlMessage); }
  private slotOf(peerId: string): number | undefined {
    for (const entry of this.entries.values()) if (entry.peerId === peerId && entry.slot !== HOST_SLOT) return entry.slot;
    return undefined;
  }
}

export type GuestState = 'joining' | 'joined' | 'rejected' | 'lost';
export type LostReason = 'no-host' | 'host-left' | 'kicked';

export class CoopGuest {
  state: GuestState = 'joining';
  slot = -1;
  maxPlayers = 0;
  roster: RosterEntry[] = [];
  readonly snapshots: SnapshotBuffer;
  onJoined: ((slot: number) => void) | null = null;
  onRejected: ((reason: RejectReason) => void) | null = null;
  onLost: ((reason: LostReason) => void) | null = null;
  onReturnToLobby: (() => void) | null = null;
  private returningToLobby = false;
  onRoster: ((roster: RosterEntry[]) => void) | null = null;
  onEvent: ((event: GameEvent) => void) | null = null;
  private hostId: string | null = null;
  private seq = 0;
  private pending: PlayerInput[] = [];
  private readonly timer: ReturnType<typeof setTimeout>;

  private readonly transport: Transport;
  private readonly me: LocalPlayer;

  constructor(transport: Transport, me: LocalPlayer,
    { timeoutMs = 15000, interpolationDelay = .1, now = () => performance.now() / 1000 } = {}) {
    this.transport = transport; this.me = me;
    this.snapshots = new SnapshotBuffer(interpolationDelay);
    transport.listen({
      message: (channel, data, from) => {
        if (channel === 'ctrl') this.control(data as ControlMessage, from);
        else if (from !== this.hostId) return;
        else if (channel === 'snap') this.snapshot(data as Snapshot, now());
        else if (channel === 'event') {
          const event = data as GameEvent;
          if (event.name === 'return-to-lobby') {
            this.returningToLobby = true;
            this.send({ name: 'return-to-lobby-ack' });
          } else this.onEvent?.(event);
        }
      },
      // Everyone in the room gets a hello; only a host answers it.
      peerJoin: peerId => { if (this.state === 'joining') this.hello(peerId); },
      peerLeave: peerId => { if (peerId === this.hostId) this.lose('host-left'); },
    });
    this.timer = setTimeout(() => { if (this.state === 'joining') this.lose('no-host'); }, timeoutMs);
  }

  /** Queue a frame of controls to the host; keep it for prediction replay until acked. */
  sendInput(controls: Omit<PlayerInput, 'seq'>): PlayerInput | null {
    if (this.state !== 'joined') return null;
    const input = { ...controls, seq: ++this.seq };
    this.pending.push(input);
    if (this.pending.length > 120) this.pending.shift();
    this.transport.send('input', input, this.hostId!);
    return input;
  }

  /** Reliable gameplay requests (skill-point spends, revive pings, emotes). */
  send(event: GameEvent): void { if (this.state === 'joined') this.transport.send('event', event, this.hostId!); }

  /** Inputs the host hasn't applied yet, oldest first: replay these on top of the latest snapshot. */
  unacked(): readonly PlayerInput[] { return this.pending; }

  async close(): Promise<void> { clearTimeout(this.timer); this.state = 'lost'; await this.transport.leave(); }

  private hello(peerId: string): void {
    this.transport.send('ctrl', { t: 'hello', v: PROTOCOL_VERSION, ...this.me } satisfies ControlMessage, peerId);
  }

  private control(message: ControlMessage, from: string): void {
    if (message.t === 'welcome' && this.state === 'joining') {
      clearTimeout(this.timer);
      this.state = 'joined'; this.hostId = from; this.slot = message.slot; this.maxPlayers = message.maxPlayers; this.roster = message.roster;
      this.onJoined?.(this.slot);
    } else if (message.t === 'reject' && this.state === 'joining') {
      clearTimeout(this.timer); this.state = 'rejected'; this.onRejected?.(message.reason);
    } else if (message.t === 'kicked' && from === this.hostId) {
      this.lose('kicked');
      void this.transport.leave();
    } else if (message.t === 'roster' && from === this.hostId) {
      this.roster = message.roster; this.onRoster?.(this.roster);
    }
  }

  private snapshot(snapshot: Snapshot, now: number): void {
    if (!this.snapshots.push(snapshot, now)) return;
    const acked = snapshot.acks[this.slot] ?? 0;
    while (this.pending.length && this.pending[0].seq <= acked) this.pending.shift();
  }

  private lose(reason: LostReason): void {
    if (this.state === 'lost') return;
    clearTimeout(this.timer);
    this.state = 'lost';
    if (this.returningToLobby && this.onReturnToLobby) this.onReturnToLobby();
    else this.onLost?.(reason);
  }
}
