// The seam between co-op sessions and whatever carries the bytes: Trystero today, a small server later,
// an in-memory hub in tests.
import type { Channel } from './protocol';

export interface TransportHandlers {
  message(channel: Channel, data: unknown, from: string): void;
  peerJoin(peerId: string): void;
  peerLeave(peerId: string): void;
}

export interface Transport {
  readonly selfId: string;
  /** to omitted = everyone in the room */
  send(channel: Channel, data: unknown, to?: string): void;
  listen(handlers: TransportHandlers): void;
  leave(): Promise<void>;
}

/**
 * In-memory room for tests and local multi-player work. Delivery is async like a network;
 * latency applies to every channel, drop chance to 'snap' only (the one the game tolerates losing).
 */
export class LoopbackHub {
  private readonly peers = new Map<string, LoopbackTransport>();
  readonly options: { latencyMs?: number; snapDropChance?: number; random?: () => number };
  constructor(options: LoopbackHub['options'] = {}) { this.options = options; }

  join(id: string): Transport {
    if (this.peers.has(id)) throw new Error(`peer ${id} already joined`);
    const peer = new LoopbackTransport(id, this);
    const others = [...this.peers.values()];
    this.peers.set(id, peer);
    for (const other of others) {
      this.later(() => other.handlers?.peerJoin(id));
      this.later(() => peer.handlers?.peerJoin(other.selfId));
    }
    return peer;
  }

  /** @internal */
  deliver(from: string, channel: Channel, data: unknown, to?: string): void {
    const { latencyMs = 0, snapDropChance = 0, random = Math.random } = this.options;
    const copy = JSON.parse(JSON.stringify(data)) as unknown;
    for (const [id, peer] of this.peers) {
      if (id === from || (to !== undefined && id !== to)) continue;
      if (channel === 'snap' && snapDropChance > 0 && random() < snapDropChance) continue;
      this.later(() => { if (this.peers.get(id) === peer) peer.handlers?.message(channel, copy, from); }, latencyMs);
    }
  }

  /** @internal */
  remove(id: string): void {
    if (!this.peers.delete(id)) return;
    for (const peer of this.peers.values()) this.later(() => peer.handlers?.peerLeave(id));
  }

  private later(fn: () => void, ms = 0): void { if (ms > 0) setTimeout(fn, ms); else queueMicrotask(fn); }
}

class LoopbackTransport implements Transport {
  handlers: TransportHandlers | null = null;
  readonly selfId: string;
  private readonly hub: LoopbackHub;
  constructor(selfId: string, hub: LoopbackHub) { this.selfId = selfId; this.hub = hub; }
  send(channel: Channel, data: unknown, to?: string): void { this.hub.deliver(this.selfId, channel, data, to); }
  listen(handlers: TransportHandlers): void { this.handlers = handlers; }
  async leave(): Promise<void> { this.handlers = null; this.hub.remove(this.selfId); }
}
