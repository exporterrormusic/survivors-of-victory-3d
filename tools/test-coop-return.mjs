import assert from 'node:assert/strict';
import { register } from 'node:module';
register('./ts-hooks.mjs', import.meta.url);
const { LoopbackHub } = await import('../src/net/transport.ts');
const { CoopHost, CoopGuest } = await import('../src/net/session.ts');
const flush = () => new Promise(resolve => setTimeout(resolve, 0));
const player = name => ({name, character:'snow-white'});
const hub = new LoopbackHub();
const host = new CoopHost(hub.join('host'), player('Host'));
const aWire = hub.join('a');
const a = new CoopGuest(aWire, player('A'));
const b = new CoopGuest(hub.join('b'), player('B'));
let returns = 0, lost = 0;
for (const guest of [a,b]) {
 guest.onReturnToLobby = () => returns++;
 guest.onLost = () => lost++;
}
await flush();
assert.equal(host.roster.length, 3);
// A guest cannot command another guest to leave the match.
aWire.send('event', {name:'return-to-lobby'}, 'b');
await flush();
assert.equal(returns, 0);
const quit = host.returnToLobby();
assert.equal(host.returnToLobby(), quit, 'duplicate host clicks share one operation');
await quit; await flush();
assert.equal(returns, 2, 'every guest returns after the host closes');
assert.equal(lost, 0, 'intentional lobby return does not show disconnection');
await a.close(); await b.close();
// A normal host disconnect still follows the normal lost-connection path.
const h2 = new CoopHost(hub.join('host2'), player('Host'));
const c = new CoopGuest(hub.join('c'), player('C'));
c.onReturnToLobby = () => returns++;
c.onLost = () => lost++;
await flush();await h2.close();await flush();
assert.equal(returns,2);assert.equal(lost,1);await c.close();
const solo = new CoopHost(hub.join('solo'), player('Solo'));
await solo.returnToLobby();
console.log('Co-op lobby return: two guests, host-only authority, duplicate clicks, normal disconnect, solo host passed.');
