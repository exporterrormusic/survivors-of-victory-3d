// Node 22.15+: node --experimental-strip-types tools/test-sortie.mjs
// Engine-free game-mode systems in src/survivor/mode/.
import assert from 'node:assert/strict';
import { register } from 'node:module';
register('./ts-hooks.mjs', import.meta.url);

const { seededRandom, weightedPick } = await import('../src/survivor/mode/rng.ts');
const { AlertClock } = await import('../src/survivor/mode/alert.ts');
const { SpawnDirector, CORE_GROUPS, DEFAULT_TUNING, pickSpawnPoint, DEFAULT_VIEW } = await import('../src/survivor/mode/director.ts');
const { ROSTER, RAPTURE_KEYS, raptureSpec } = await import('../src/survivor/mode/roster.ts');
const { SiteSet } = await import('../src/survivor/mode/sites.ts');
const { ExitSet, GATE_CYCLE } = await import('../src/survivor/mode/exits.ts');
const { FieldKitStacks, FIELD_KIT_IDS } = await import('../src/survivor/mode/field-kits.ts');
const { Ledger, rollSiteLoot } = await import('../src/survivor/mode/ledger.ts');
const { Sortie, SalvageRunJob } = await import('../src/survivor/mode/sortie.ts');

const step = (fn, seconds, dt = 1 / 30) => { const out = []; for (let t = 0; t < seconds - 1e-9; t += dt) out.push(...(fn(dt) ?? [])); return out; };

// --- rng ---------------------------------------------------------------------------------
{
  const a = seededRandom(7), b = seededRandom(7);
  for (let i = 0; i < 20; i++) assert.equal(a(), b(), 'same seed, same sequence');
  const r = seededRandom(1);
  for (let i = 0; i < 1000; i++) { const v = r(); assert.ok(v >= 0 && v < 1); }
  assert.equal(weightedPick(r, ['x', 'y'], (s) => (s === 'y' ? 1 : 0)), 'y');
  assert.equal(weightedPick(r, ['x'], () => 0), undefined);
}

// --- roster ----------------------------------------------------------------------------------
{
  assert.equal(RAPTURE_KEYS.length, 22, 'all 22 Outpost Raptures');
  assert.equal(new Set(RAPTURE_KEYS.map((k) => ROSTER[k].model)).size, 22, 'one model each');
  const tiers = { horde: 0, specialist: 0, heavy: 0, boss: 0, archive: 0 };
  for (const k of RAPTURE_KEYS) tiers[ROSTER[k].tier]++;
  assert.deepEqual(tiers, { horde: 4, specialist: 6, heavy: 3, boss: 3, archive: 6 });
  for (const k of RAPTURE_KEYS) assert.ok(ROSTER[k].tier === 'boss' ? ROSTER[k].cost === 0 : ROSTER[k].cost > 0, `${k} cost`);
  assert.throws(() => raptureSpec('nope'));
}

// --- alert -----------------------------------------------------------------------------------
{
  const alert = new AlertClock(90);
  assert.equal(alert.level, 1);
  assert.equal(alert.update(89), 0);
  assert.equal(alert.update(2), 2, 'reports the level change');
  assert.ok(Math.abs(alert.nextIn - 89) < 1e-9);
  alert.update(1000);
  assert.equal(alert.level, 5, 'caps at 5');
  assert.equal(alert.nextIn, Infinity);
  assert.equal(alert.fraction, 1);
  alert.progress = 4 * 90 - 1; // just below the cap is still level 4
  assert.equal(alert.level, 4);
  alert.progress = 3 * 90 + 30; // level 4, a third of the way through
  assert.equal(alert.lower(), 3);
  assert.ok(Math.abs(alert.fraction - 1 / 3) < 1e-9, 'lowering keeps partial progress');
  alert.lower(10);
  assert.equal(alert.progress, 0);
  const slow = new AlertClock(90); slow.rate = .5; slow.update(90);
  assert.equal(slow.level, 1, 'rate scales the clock');
}

// --- director --------------------------------------------------------------------------------
{
  const director = new SpawnDirector(seededRandom(3));
  const none = { total: 0, byType: new Map() };
  assert.deepEqual(director.update(0, 1, none), [], 'no time, no spawns');
  // One minute at Alert 1 spends roughly its budget and only buys Alert-1 groups.
  let spent = 0, alive = 0;
  const byType = new Map();
  for (let i = 0; i < 1800; i++) {
    for (const req of director.update(1 / 30, 1, { total: alive, byType })) {
      spent += req.cost;
      assert.ok(['swarm', 'gun-line', 'kamikaze'].includes(req.group), `Alert 1 group ${req.group}`);
      for (const m of req.members) { alive += m.count; byType.set(m.type, (byType.get(m.type) ?? 0) + m.count); }
    }
  }
  const expected = DEFAULT_TUNING.budgetPerSecond[0] * (60 + DEFAULT_TUNING.pulseBudgetSeconds * 2);
  assert.ok(spent <= expected + 1e-6 && spent > expected * .6, `spent ${spent} of ~${expected}`);
  assert.ok(alive <= DEFAULT_TUNING.maxAlive[0], 'alive limit');

  // Caps: Tripod 3, heavies 2 combined, even with a huge budget.
  const capped = new SpawnDirector(seededRandom(9), [
    { key: 'p', members: [{ type: 'tripod', count: [5, 5] }], weight: 1, minAlert: 1 },
    { key: 'h', members: [{ type: 'hardHat', count: [1, 1] }, { type: 'thermite', count: [1, 1] }], weight: 1, minAlert: 1 },
  ]);
  capped.budget = 1e6;
  const counts = new Map();
  let total = 0;
  for (let i = 0; i < 20; i++) for (const req of capped.update(.1, 5, { total, byType: counts })) for (const m of req.members) {
    counts.set(m.type, (counts.get(m.type) ?? 0) + m.count); total += m.count;
  }
  assert.equal(counts.get('tripod'), 3, 'tripod cap');
  assert.equal((counts.get('hardHat') ?? 0) + (counts.get('thermite') ?? 0), 2, 'shared heavy cap');

  // Pulses add a lump of budget.
  const pulsing = new SpawnDirector(seededRandom(1), CORE_GROUPS, { ...DEFAULT_TUNING, maxAlive: [0, 0, 0, 0, 0] });
  pulsing.update(29.9, 1, none);
  const before = pulsing.budget;
  pulsing.update(.2, 1, none);
  assert.ok(pulsing.budget > before + DEFAULT_TUNING.budgetPerSecond[0] * DEFAULT_TUNING.pulseBudgetSeconds - 1e-6, 'pulse budget');
}

// --- spawn points ----------------------------------------------------------------------------
{
  const random = seededRandom(5), player = { x: 0, z: 0 };
  for (let i = 0; i < 200; i++) {
    const p = pickSpawnPoint(random, player, () => true);
    assert.ok(p, 'found a point');
    const dx = p.x, dz = p.z;
    assert.ok(Math.hypot(dx, dz) >= 14 - 1e-9, 'minimum distance');
    const inView = Math.abs(dx) < DEFAULT_VIEW.halfWidth && dz < DEFAULT_VIEW.ahead && dz > -DEFAULT_VIEW.behind;
    assert.ok(!inView, 'never on screen');
  }
  assert.equal(pickSpawnPoint(random, player, () => false), null, 'respects validity');
  const p = pickSpawnPoint(random, player, (q) => q.x > 0);
  assert.ok(p && p.x > 0);
}

// --- sites -----------------------------------------------------------------------------------
{
  const sites = new SiteSet([{ id: 'a', kind: 'cache', x: 0, z: 0 }, { id: 'b', kind: 'priority', x: 2, z: 0 }]);
  const a = sites.get('a'), b = sites.get('b');
  sites.update(1, 0, 0);
  assert.equal(a.progress, 1, 'works the nearest site');
  assert.equal(b.progress, 0, 'one site at a time');
  sites.update(5, 20, 20);
  assert.equal(a.progress, 1, 'stepping out pauses, never resets');
  assert.deepEqual(sites.update(.6, 0, 0).map((s) => s.id), ['a']);
  assert.ok(a.done && a.fraction === 1);
  assert.deepEqual(sites.update(1, 0, 0), [], 'completes once');
  assert.equal(b.progress, 1, 'next site takes over once the first is done');
}

// --- exits -----------------------------------------------------------------------------------
{
  const exits = new ExitSet([{ id: 'lift', kind: 'arrival', x: 0, z: -10 }, { id: 'tower', kind: 'shaft', x: 0, z: 20 }]);
  assert.ok(exits.get('lift').active && !exits.get('tower').active);
  assert.equal(exits.nearestActive(0, 19).exit.id, 'lift', 'dormant towers are not exits');
  assert.equal(exits.update(10, 0, 20), null, 'cannot board a dormant tower');
  exits.activate('tower');
  assert.equal(exits.nearestActive(0, 19).exit.id, 'tower');
  exits.update(5, 0, 20);
  exits.update(3, 30, 30);
  assert.equal(exits.get('tower').boarding, 5, 'stepping off pauses the gates');
  assert.equal(exits.update(2.9, 0, 20), null);
  assert.equal(exits.update(.2, 0, 20)?.id, 'tower', 'departs after the full cycle');
  assert.equal(GATE_CYCLE, 8);
  assert.equal(new ExitSet([{ id: 'l', kind: 'arrival', x: 0, z: 0 }]).update(10, 10, 0, false), null, 'boarding can be disabled');
  const arrival = new ExitSet([{ id: 'l', kind: 'arrival', x: 0, z: 0 }]);
  assert.equal(arrival.update(20, 0, 0), null, 'standing where you arrived never extracts');
  arrival.update(.1, 10, 0);
  assert.equal(arrival.update(8, 0, 0)?.id, 'l', 'stepping off arms the arrival lift');
}

// --- field kits and ledger -------------------------------------------------------------------
{
  const kits = new FieldKitStacks();
  for (let i = 0; i < 3; i++) assert.ok(kits.add('hotLoads'));
  assert.equal(kits.add('hotLoads'), false, 'max three stacks');
  kits.add('extendedMag'); kits.add('quickHands'); kits.add('critChip'); kits.add('burstCell'); kits.add('turretParts');
  const s = kits.apply({ damage: 10, magazine: 7, reload: 1.5, moveSpeed: 6, critChance: .3, burstPerHit: 7, specialCharges: 2 });
  assert.ok(Math.abs(s.damage - 13) < 1e-9 && s.magazine === 9 && Math.abs(s.reload - 1.275) < 1e-9);
  assert.ok(Math.abs(s.critChance - .35) < 1e-9 && Math.abs(s.burstPerHit - 8.05) < 1e-9 && s.specialCharges === 3);
  assert.equal(kits.total, 8);
  assert.equal(FIELD_KIT_IDS.length, 6);

  const ledger = new Ledger();
  ledger.take({ credits: 50, salvage: 2, fieldKit: 'critChip' });
  assert.equal(ledger.kits.count('critChip'), 1);
  assert.deepEqual(ledger.bank(), { credits: 50, salvage: 2, modules: 0, pristineCores: 0 });
  assert.equal(ledger.banked.salvage, 2);
  assert.equal(ledger.kits.total, 0, 'field kits end with the trip');
  ledger.take({ salvage: 9 });
  ledger.lose();
  assert.equal(ledger.banked.salvage, 2, 'death keeps the bank');
  assert.equal(ledger.carried.salvage, 0);

  const random = seededRandom(11);
  for (let i = 0; i < 200; i++) {
    const loot = rollSiteLoot('cache', random, new FieldKitStacks());
    assert.ok(loot.credits >= 40 && loot.credits <= 80 && loot.salvage >= 1 && loot.salvage <= 2);
  }
  assert.ok(rollSiteLoot('wreck', random, new FieldKitStacks()).fieldKit, 'wrecks always give a field kit');
}

// --- sortie ----------------------------------------------------------------------------------
{
  const make = () => new Sortie({
    sites: new SiteSet([
      { id: 'c1', kind: 'priority', x: 10, z: 0 },
      { id: 'c2', kind: 'priority', x: -10, z: 0 },
      { id: 'tower', kind: 'shaft', x: 0, z: 25 },
      { id: 'scr', kind: 'scrambler', x: 5, z: 5 },
    ]),
    exits: new ExitSet([{ id: 'lift', kind: 'arrival', x: 0, z: -20 }, { id: 'tower', kind: 'shaft', x: 0, z: 25 }]),
    ledger: new Ledger(), job: new SalvageRunJob(2), random: seededRandom(2),
  });
  const s = make();
  const at = (x, z, hp = 50) => (dt) => s.update(dt, { x, z, hp });
  assert.equal(s.phase, 'arrival');
  step(at(0, -20), 9);
  assert.equal(s.exits.get('lift').boarding, 0, 'no boarding during the arrival');
  assert.ok(!s.spawning);
  const opened = step(at(50, 50), 1.1);
  assert.ok(opened.some((e) => e.type === 'phase' && e.phase === 'search'));
  assert.ok(s.spawning);
  step(at(10, 0), 4.1);
  const jobEvents = step(at(-10, 0), 4.1);
  assert.ok(jobEvents.some((e) => e.type === 'job-complete') && s.job.done);
  const restored = step(at(0, 25), 8.1);
  assert.ok(restored.some((e) => e.type === 'exit-restored' && e.exit.id === 'tower'), 'restoring a shaft opens an exit');
  const out = step(at(0, 25), 8.1);
  assert.ok(out.some((e) => e.type === 'extracted' && e.exit.id === 'tower'));
  assert.equal(s.phase, 'extracted');
  assert.equal(s.results.jobReward, 300);
  assert.equal(s.results.purse.salvage, 6, 'two priority crates banked');
  assert.equal(s.ledger.banked.credits, 120 + 300);
  assert.deepEqual(s.update(1, { x: 0, z: 0, hp: 50 }), [], 'nothing happens after it ends');

  // Alert 5 sends Hunters on a timer; killing one drops Alert by one.
  const h = make();
  const hunt = (dt) => h.update(dt, { x: 100, z: 100, hp: 50 });
  step(hunt, 10);
  const hunters = step(hunt, 360 + 150 + 1, 1 / 10).filter((e) => e.type === 'hunter');
  assert.equal(hunters.length, 2, 'one at Alert 5, another 150 s later');
  assert.equal(h.alertReached, 5);
  assert.equal(h.hunterKilled(), 4);
  assert.equal(h.ledger.carried.pristineCores, 1);

  // Scrambler lowers Alert; dying loses what was carried.
  const d = make();
  step((dt) => d.update(dt, { x: 100, z: 100, hp: 50 }), 10 + 200, 1 / 10);
  assert.equal(d.alert.level, 3);
  const scr = step((dt) => d.update(dt, { x: 5, z: 5, hp: 50 }), 5.1);
  assert.ok(scr.some((e) => e.type === 'scrambled' && e.level === 2));
  d.ledger.take({ salvage: 5 });
  const dead = d.update(.1, { x: 0, z: 0, hp: 0 });
  assert.ok(dead.some((e) => e.type === 'defeated'));
  assert.equal(d.results.outcome, 'defeated');
  assert.equal(d.results.purse.salvage, 5, 'lost');
  assert.equal(d.ledger.banked.salvage, 0);
  assert.equal(d.results.abandoned, false);

  // Abandoning from the pause menu counts as dying, even with the job done.
  const a = make();
  step((dt) => a.update(dt, { x: 10, z: 0, hp: 50 }), 10 + 4.1);
  step((dt) => a.update(dt, { x: -10, z: 0, hp: 50 }), 4.1);
  assert.ok(a.job.done);
  const left = a.abandon();
  assert.ok(left.some((e) => e.type === 'defeated'));
  assert.equal(a.phase, 'defeated');
  assert.equal(a.results.abandoned, true);
  assert.equal(a.results.jobReward, 0, 'an abandoned job pays nothing');
  assert.equal(a.results.purse.salvage, 6, 'carried crates are lost');
  assert.equal(a.ledger.banked.salvage, 0);
  assert.deepEqual(a.abandon(), [], 'abandoning twice does nothing');
}

console.log('sortie systems: all checks passed');
