// Transport over Trystero's Nostr strategy: peers meet through public Nostr relays (no accounts, no
// server of ours), then talk over direct WebRTC DataChannels. Strict NATs fail without TURN; a future
// relay server goes in turnConfig.
import { joinRoom, selfId } from '@trystero-p2p/nostr';
import type { DataPayload, MessageAction } from '@trystero-p2p/nostr';
import { APP_ID, CHANNELS, PROTOCOL_VERSION, type Channel } from './protocol';
import type { Transport, TransportHandlers } from './transport';
import { joinBroadcastRoom } from './broadcast-transport';

export interface TrysteroOptions {
  /** e.g. [{ urls: 'turn:example.com:3478', username, credential }] once we run a relay */
  turnConfig?: { urls: string | string[]; username?: string; credential?: string }[];
  relayUrls?: string[];
}

export function joinTrysteroRoom(code: string, options: TrysteroOptions = {}): Transport {
  // Dev builds: ?net=local plays between tabs of this browser instead (broadcast-transport.ts).
  if (import.meta.env?.DEV && new URLSearchParams(location.search).get('net') === 'local') return joinBroadcastRoom(code);
  // The version is in the room id so mismatched builds never meet; the code doubles as the password,
  // which encrypts signaling on the public relays.
  const room = joinRoom({
    appId: APP_ID, password: code, turnConfig: options.turnConfig,
    relayConfig: options.relayUrls ? { urls: options.relayUrls } : undefined,
  }, `v${PROTOCOL_VERSION}-${code}`);
  let handlers: TransportHandlers | null = null;
  const actions = new Map<Channel, MessageAction<DataPayload>>();
  for (const channel of CHANNELS) {
    const action = room.makeAction<DataPayload>(channel);
    action.onMessage = (data, { peerId }) => handlers?.message(channel, data, peerId);
    actions.set(channel, action);
  }
  room.onPeerJoin = peerId => handlers?.peerJoin(peerId);
  room.onPeerLeave = peerId => handlers?.peerLeave(peerId);
  return {
    selfId,
    send(channel, data, to) { void actions.get(channel)!.send(data as DataPayload, to ? { target: to } : undefined).catch(() => {}); },
    listen(next) { handlers = next; },
    async leave() { handlers = null; await room.leave(); },
  };
}
