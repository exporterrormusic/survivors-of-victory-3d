import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
const url = source => `data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source, { mode: 'transform' })).toString('base64')}`;
const ranksUrl = url(await fs.readFile(new URL('../src/survivor/ability-ranks.ts', import.meta.url), 'utf8'));
const { ABILITY_TRACKS } = await import(ranksUrl);
const talentSource = (await fs.readFile(new URL('../src/survivor/talents.ts', import.meta.url), 'utf8')).replace("'./ability-ranks'", JSON.stringify(ranksUrl));
const { RunTalents } = await import(url(talentSource));
const maxAll = talents => {
  const wallet = { skillPoints: 30 };
  for (const track of ABILITY_TRACKS) for (let rank = 2; rank <= 5; rank++) assert.ok(talents.purchase(track.id, rank, wallet));
  assert.equal(wallet.skillPoints, 0, 'rank costs unchanged');
};
for (const chosen of [null, 'attack', 'skill', 'burst']) {
  const talents = new RunTalents([], ABILITY_TRACKS, chosen);
  assert.equal(talents.activeCapstone, null, 'selection is dormant before Rank 5');
  maxAll(talents);
  assert.equal(talents.activeCapstone, chosen);
  for (const track of ABILITY_TRACKS) for (const effect of track.capstone.effects) {
    assert.equal(talents.has(effect), track.id === chosen, 'only the equipped capstone grants combat effects');
  }
  const nextRun = new RunTalents([], ABILITY_TRACKS, chosen);
  for (const track of ABILITY_TRACKS) assert.equal(nextRun.abilityRank(track.id), 1, 'new run resets ability ranks');
  assert.equal(nextRun.activeCapstone, null);
}
const storage = new Map();
globalThis.localStorage = {
  getItem: key => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, value),
  removeItem: key => storage.delete(key),
};
const { loadCapstone, saveCapstone } = await import(url(await fs.readFile(new URL('../src/survivor/capstone-loadout.ts', import.meta.url), 'utf8')));
assert.equal(loadCapstone(), null);
saveCapstone('attack');
const liveRun = new RunTalents([], ABILITY_TRACKS, loadCapstone());
saveCapstone('burst');
assert.equal(liveRun.selectedCapstone, 'attack', 'lobby changes cannot modify an existing run');
assert.equal(new RunTalents([], ABILITY_TRACKS, loadCapstone()).selectedCapstone, 'burst');
saveCapstone(null); assert.equal(loadCapstone(), null);
storage.set('nikke-moba.snow-white-capstone', 'invalid'); assert.equal(loadCapstone(), null);
console.log('Capstones: exclusive effects, rank prerequisites, costs, new-run reset, lobby swapping, invalid storage passed.');
