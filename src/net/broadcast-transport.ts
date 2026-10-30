// Dev-only: a co-op room between tabs of one browser over BroadcastChannel (?net=local), so two
// windows can play together with no relays or WebRTC — for local testing and automated checks.
import type { Channel } from './protocol';
import type { Transport, TransportHandlers } from './transport';

type Packet =
  | { kind: 'hello' | 'here' | 'bye'; from: string; to?: string }
  | { kind: 'msg'; from: string; to?: string; channel: Channel; data: unknown };

export function joinBroadcastRoom(code: string): Transport {
  const selfId = Math.random().toString(36).slice(2, 10);
  const bus = new BroadcastChannel(`nikke-coop-${code}`);
  const peers = new Set<string>();
  let handlers: TransportHandlers | null = null;
  const post = (packet: Packet) => bus.postMessage(packet);
  const meet = (id: string) => { if (!peers.has(id)) { peers.add(id); handlers?.peerJoin(id); } };
  bus.onmessage = ({ data }: MessageEvent<Packet>) => {
    if (data.from === selfId || (data.to && data.to !== selfId)) return;
    if (data.kind === 'hello') { meet(data.from); post({ kind: 'here', from: selfId, to: data.from }); }
    else if (data.kind === 'here') meet(data.from);
    else if (data.kind === 'bye') { if (peers.delete(data.from)) handlers?.peerLeave(data.from); }
    else if (data.kind === 'msg') { meet(data.from); handlers?.message(data.channel, data.data, data.from); }
  };
  const bye = () => post({ kind: 'bye', from: selfId });
  addEventListener('pagehide', bye);
  return {
    selfId,
    send(channel, data, to) { post({ kind: 'msg', from: selfId, to, channel, data }); },
    // Announce once someone listens, so the replies have a handler to land in.
    listen(next) { handlers = next; post({ kind: 'hello', from: selfId }); },
    async leave() { handlers = null; bye(); removeEventListener('pagehide', bye); bus.close(); },
  };
}
