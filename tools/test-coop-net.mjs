// Node 22.15+: node --experimental-strip-types tools/test-coop-net.mjs
// Engine-free co-op systems in src/net/ over the in-memory LoopbackHub (no WebRTC, no relays).
import assert from 'node:assert/strict';
import { register } from 'node:module';
register('./ts-hooks.mjs', import.meta.url);

const { LoopbackHub } = await import('../src/net/transport.ts');
const { CoopHost, CoopGuest } = await import('../src/net/session.ts');
const { SnapshotBuffer, interpolate } = await import('../src/net/interpolation.ts');
const { generateRoomCode, normalizeRoomCode } = await import('../src/net/room-code.ts');
const { coopScale, chooseTarget, ReviveTracker, CoopXp, REVIVE_SECONDS } = await import('../src/net/coop-rules.ts');
const { LobbyHost, LobbyGuest } = await import('../src/net/lobby.ts');
const { Button, PROTOCOL_VERSION } = await import('../src/net/protocol.ts');

const flush = () => new Promise(resolve => setTimeout(resolve, 0));
const me = (name) => ({ name, character: 'snow-white' });

// --- room codes ---------------------------------------------------------------------------
{
  const code = generateRoomCode();
  assert.match(code, /^[A-Z0-9]{3}-[A-Z0-9]{3}$/);
  assert.equal(normalizeRoomCode(code.toLowerCase().replace('-', ' ')), code);
  assert.equal(normalizeRoomCode('abc'), null, 'too short');
  assert.equal(normalizeRoomCode('ABC-DE0'), null, 'look-alike 0 is not in the alphabet');
}

// --- join, slots, full room, leave ------------------------------------------------------------
{
  const hub = new LoopbackHub();
  const host = new CoopHost(hub.join('h'), me('Host'), 3);
  const joined = [];
  host.onPlayerJoined = entry => joined.push(entry.slot);
  const a = new CoopGuest(hub.join('a'), me('A'), { timeoutMs: 1000 });
  const b = new CoopGuest(hub.join('b'), me('B'), { timeoutMs: 1000 });
  await flush();
  assert.equal(a.state, 'joined'); assert.equal(b.state, 'joined');
  assert.deepEqual(joined.sort(), [1, 2]);
  assert.deepEqual([a.slot, b.slot].sort(), [1, 2]);
  assert.equal(host.roster.length, 3);
  assert.equal(a.roster.length, 3, 'roster broadcast reaches earlier guests');

  const c = new CoopGuest(hub.join('c'), me('C'), { timeoutMs: 1000 });
  let rejected = null; c.onRejected = reason => { rejected = reason; };
  await flush();
  assert.equal(c.state, 'rejected'); assert.equal(rejected, 'full');

  const left = [];
  host.onPlayerLeft = entry => left.push(entry.slot);
  const freed = a.slot;
  await a.close(); await flush();
  assert.deepEqual(left, [freed]);
  assert.equal(b.roster.length, 2);
  const d = new CoopGuest(hub.join('d'), me('D'), { timeoutMs: 1000 });
  await flush();
  assert.equal(d.slot, freed, 'a freed slot is reused');

  let lost = null; b.onLost = reason => { lost = reason; };
  await host.close(); await flush();
  assert.equal(lost, 'host-left');
}

// --- version mismatch, started round, no host -----------------------------------------------------
{
  const hub = new LoopbackHub();
  const host = new CoopHost(hub.join('h'), me('Host'));
  const t = hub.join('old');
  const replies = [];
  t.listen({ message: (_c, data) => replies.push(data), peerJoin: id => t.send('ctrl', { t: 'hello', v: PROTOCOL_VERSION - 1, ...me('Old') }, id), peerLeave() {} });
  await flush();
  assert.deepEqual(replies, [{ t: 'reject', reason: 'version' }]);

  host.started = true;
  const late = new CoopGuest(hub.join('late'), me('Late'));
  await flush();
  assert.equal(late.state, 'rejected');

  const alone = new CoopGuest(new LoopbackHub().join('x'), me('X'), { timeoutMs: 20 });
  let lost = null; alone.onLost = reason => { lost = reason; };
  await new Promise(resolve => setTimeout(resolve, 40));
  assert.equal(lost, 'no-host');
}

// --- inputs, button taps, acks, snapshots, events -----------------------------------------------------
{
  const hub = new LoopbackHub();
  const host = new CoopHost(hub.join('h'), me('Host'));
  const guest = new CoopGuest(hub.join('g'), me('G'), { now: () => clock });
  let clock = 0;
  await flush();
  assert.equal(guest.sendInput({ moveX: 1, moveZ: 0, aimX: 0, aimZ: 0, buttons: Button.dash }).seq, 1);
  guest.sendInput({ moveX: 0, moveZ: 1, aimX: 3, aimZ: 4, buttons: 0 });
  await flush();
  const input = host.takeInput(guest.slot);
  assert.equal(input.seq, 2); assert.equal(input.moveZ, 1);
  assert.equal(input.buttons & Button.dash, Button.dash, 'a tap between host frames survives');
  assert.equal(host.takeInput(guest.slot).buttons, 0, 'taps are consumed once');
  assert.equal(guest.unacked().length, 2);

  host.broadcast(1, [{ slot: guest.slot, id: 1, x: 0, z: 0, yaw: 0, hp: 50, maxHp: 50, down: false }], []);
  await flush();
  assert.equal(guest.unacked().length, 0, 'acked inputs are dropped from prediction replay');
  assert.equal(guest.snapshots.latest.tick, 1);

  const events = [], spends = [];
  guest.onEvent = e => events.push(e.name);
  host.onGuestEvent = (slot, e) => spends.push([slot, e.data]);
  host.emit({ name: 'banner', data: 'Heavy defeated' });
  guest.send({ name: 'spend', data: 'skill1' });
  await flush();
  assert.deepEqual(events, ['banner']);
  assert.deepEqual(spends, [[guest.slot, 'skill1']]);
}

// --- the host kicks a guest: they're told, dropped, and turned away if they come back ---------------
{
  const hub = new LoopbackHub();
  const host = new CoopHost(hub.join('h'), me('Host'), 3);
  const guest = new CoopGuest(hub.join('k'), me('K'));
  await flush();
  let lost = null;
  guest.onLost = reason => { lost = reason; };
  host.kick(guest.slot); await flush();
  assert.equal(lost, 'kicked');
  assert.equal(host.roster.length, 1, 'kicked guest leaves the roster');
  const again = new CoopGuest(hub.join('k'), me('K'));
  let rejected = null;
  again.onRejected = reason => { rejected = reason; };
  await flush();
  assert.equal(rejected, 'kicked', 'kicked peer is kept out');
}

// --- silent guests are dropped (a closed tab WebRTC hasn't noticed yet) ----------------------------
{
  const hub = new LoopbackHub();
  let clock = 0;
  const host = new CoopHost(hub.join('h'), me('Host'), 3, () => clock);
  const quiet = new CoopGuest(hub.join('q'), me('Q'));
  const chatty = new CoopGuest(hub.join('c'), me('C'));
  await flush();
  const left = [];
  host.onPlayerLeft = entry => left.push(entry.slot);
  // A guest still loading the match (no input yet) is never dropped for silence.
  clock = 20000; host.dropSilent(8000); assert.deepEqual(left, [], 'loading guests are kept');
  clock = 0; quiet.sendInput({ moveX: 0, moveZ: 0, aimX: 0, aimZ: 0, buttons: 0 }); await flush();
  clock = 5000; chatty.sendInput({ moveX: 0, moveZ: 0, aimX: 0, aimZ: 0, buttons: 0 }); await flush();
  host.dropSilent(8000); assert.deepEqual(left, []);
  clock = 9000; host.dropSilent(8000);
  assert.deepEqual(left, [quiet.slot], 'only the silent guest is dropped');
  assert.equal(host.roster.length, 2);
}

// --- guests ignore traffic that isn't from their host ------------------------------------------------
{
  const hub = new LoopbackHub();
  new CoopHost(hub.join('h'), me('Host'));
  const guest = new CoopGuest(hub.join('g'), me('G'));
  const rogue = hub.join('rogue');
  await flush();
  rogue.send('snap', { tick: 99, time: 0, acks: {}, players: [], entities: [] });
  await flush();
  assert.equal(guest.snapshots.latest, undefined);
}

// --- snapshot buffer + interpolation ---------------------------------------------------------------
{
  const buffer = new SnapshotBuffer(.1);
  const snap = (tick, time, x, yaw) => ({ tick, time, acks: {}, players: [], entities: [{ id: 7, x, z: 0, yaw, hp: 1 }] });
  assert.equal(buffer.sample(0), null);
  assert.ok(buffer.push(snap(1, 10.00, 0, Math.PI - .1), 0));
  assert.ok(buffer.push(snap(2, 10.05, 1, -Math.PI + .1), .05));
  assert.equal(buffer.push(snap(2, 10.05, 1, 0), .05), false, 'duplicate tick dropped');
  assert.equal(buffer.push(snap(1, 10, 0, 0), .06), false, 'stale tick dropped');
  // clock offset is 10, so render time = .125 + 10 - .1 = 10.025 -> halfway
  const sample = buffer.sample(.125);
  assert.ok(Math.abs(sample.alpha - .5) < 1e-6);
  const [e] = interpolate(sample).entities;
  assert.ok(Math.abs(e.x - .5) < 1e-6);
  assert.ok(Math.abs(Math.abs(e.yaw) - Math.PI) < 1e-6, 'yaw blends the short way across ±π');
  assert.equal(buffer.sample(5).alpha, 1, 'clamps to newest when the buffer runs dry');
}

// --- loss and latency don't break ordering ------------------------------------------------------------
{
  let seed = 1; const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const hub = new LoopbackHub({ latencyMs: 2, snapDropChance: .3, random });
  const host = new CoopHost(hub.join('h'), me('Host'));
  const guest = new CoopGuest(hub.join('g'), me('G'));
  await new Promise(resolve => setTimeout(resolve, 60));
  assert.equal(guest.state, 'joined');
  for (let i = 1; i <= 60; i++) host.broadcast(i / 20, [], []);
  await new Promise(resolve => setTimeout(resolve, 60));
  const tick = guest.snapshots.latest?.tick ?? 0;
  assert.ok(tick > 30 && tick <= 60, `received through 30% loss (latest tick ${tick})`);
}

// --- co-op rules -----------------------------------------------------------------------------------
{
  assert.deepEqual(coopScale(1), { hp: 1, spawn: 1, alive: 1 });
  assert.ok(coopScale(3).hp > coopScale(2).hp);

  const players = [{ slot: 0, x: 0, z: 0, down: false }, { slot: 1, x: 10, z: 0, down: false }, { slot: 2, x: 4, z: 0, down: true }];
  assert.equal(chooseTarget(3, 0, players).slot, 0, 'downed players are ignored');
  assert.equal(chooseTarget(6, 0, players, 0).slot, 0, 'sticks with current target when the other is only a bit closer');
  assert.equal(chooseTarget(9, 0, players, 0).slot, 1, 'switches when clearly closer');
  assert.equal(chooseTarget(0, 0, players.map(p => ({ ...p, down: true }))), null);

  const revive = new ReviveTracker();
  const squad = [{ slot: 0, x: 0, z: 0, down: false }, { slot: 1, x: 1, z: 0, down: true }, { slot: 2, x: 50, z: 0, down: false }];
  assert.deepEqual(revive.update(REVIVE_SECONDS / 2, squad).revived, []);
  squad[0].x = 20; revive.update(10, squad);
  assert.ok(Math.abs(revive.progressOf(1) - .5) < 1e-6, 'progress kept while nobody is near');
  squad[0].x = 0;
  assert.deepEqual(revive.update(REVIVE_SECONDS / 2 + .01, squad).revived, [1]);
  assert.equal(revive.update(1, squad.map(p => ({ ...p, down: true }))).wiped, true);

  const shared = new CoopXp('shared', () => 100, 5);
  shared.addPlayer(0); shared.addPlayer(1);
  assert.deepEqual(shared.gain(1, 250).sort(), [0, 0, 1, 1], 'two shared levels give everyone two points');
  assert.equal(shared.levelOf(0), 3);
  shared.addPlayer(2);
  assert.equal(shared.pointsOf(2), 2, 'a late joiner gets the points the bar already earned');
  assert.ok(shared.spend(0)); assert.equal(shared.pointsOf(0), 1);
  shared.gain(0, 10000); assert.equal(shared.levelOf(1), 5, 'capped at max level');

  const split = new CoopXp('split', () => 100, 5);
  split.addPlayer(0); split.addPlayer(1);
  assert.deepEqual(split.gain(0, 100), [0]);
  assert.equal(split.levelOf(1), 1);
  assert.equal(split.spend(1), false);
}

// --- lobby: picks, stage, ready, start, late joiner -------------------------------------------
{
  const hub = new LoopbackHub();
  const stage = { zoneId: 'forest_day', time: 'day', modeId: 'survival_round' };
  const lobby = new LobbyHost(new CoopHost(hub.join('h'), me('Host'), 3), { character: 'snow-white', skin: '', ready: true }, stage);
  const guest = new LobbyGuest(new CoopGuest(hub.join('g'), { name: 'G', character: 'scarlet' }), { character: 'scarlet', skin: 'c' });
  await flush();
  guest.update(0); await flush();
  assert.deepEqual(lobby.state.players.map(p => [p.slot, p.character, p.ready]), [[0, 'snow-white', true], [1, 'scarlet', false]]);
  assert.equal(lobby.allReady, false, 'a guest who has not readied up holds the start');
  assert.equal(guest.state?.players.length, 2, 'the lobby state reaches the guest');
  guest.setPick({ ready: true, character: 'rapunzel' }); await flush();
  assert.equal(lobby.allReady, true);
  assert.equal(lobby.picks.get(1).character, 'rapunzel');
  lobby.setStage({ zoneId: 'frozen_night', time: 'night' }); await flush();
  assert.equal(guest.state.stage.zoneId, 'frozen_night', "the host's map shows on the guest");
  let started = null;
  guest.onStart = state => { started = state; };
  lobby.start(); await flush();
  assert.equal(started?.stage.modeId, 'survival_round');
  assert.deepEqual(started.players.map(p => p.character), ['snow-white', 'rapunzel']);
  guest.setPick({ character: 'snow-white' }); await flush();
  assert.equal(lobby.picks.get(1).character, 'rapunzel', 'picks lock once the match starts');
  const late = new CoopGuest(hub.join('late'), me('Late'), { timeoutMs: 1000 }); await flush();
  assert.equal(late.state, 'rejected', 'no joining once the match has started');
}

console.log('coop net: all tests passed');
