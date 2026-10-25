// Engine-free checks for the saved NIKKE progress and account bank (src/frontend/profile/PlayerProgress.ts).
// Run: npm run test:progress
import assert from 'node:assert/strict';
import { register } from 'node:module';
register('./ts-hooks.mjs', import.meta.url);

const items = new Map();
globalThis.window = {
  localStorage: {
    getItem: (key) => (items.has(key) ? items.get(key) : null),
    setItem: (key, value) => { items.set(key, String(value)); },
    removeItem: (key) => { items.delete(key); },
  },
};
const KEY = 'nikke-moba.progress-v1';

const { loadPlayerProgress, loadCharacterProgress, saveCharacterProgress, bankDeposit, newCharacterProgress } =
  await import('../src/frontend/profile/PlayerProgress.ts');
const { resetProfileProgress, readProfileSection } = await import('../src/frontend/persistence/ProfileStorage.ts');

// Defaults: a new NIKKE starts at level 1 with every ability at rank 1, and the bank is empty.
assert.deepEqual(loadCharacterProgress('snow-white'), newCharacterProgress());
assert.deepEqual(loadPlayerProgress().bank, { credits: 0, coreDust: 0, modules: 0 });

// Round trip, per character.
const saved = { level: 7, xp: 120.5, skillPoints: 2, ranks: { attack: 4, skill: 3, burst: 1 } };
assert.ok(saveCharacterProgress('snow-white', saved));
assert.deepEqual(loadCharacterProgress('snow-white'), saved);
assert.deepEqual(loadCharacterProgress('crown'), newCharacterProgress(), 'other NIKKEs are unaffected');

// Banking adds up across trips; salvage becomes Core Dust one for one.
bankDeposit({ credits: 640, salvage: 23, modules: 1, pristineCores: 0 });
assert.deepEqual(bankDeposit({ credits: 60, salvage: 2, modules: 0, pristineCores: 0 }), { credits: 700, coreDust: 25, modules: 1 });
assert.deepEqual(loadCharacterProgress('snow-white'), saved, 'banking keeps character progress');
bankDeposit({ credits: -50, salvage: Number.NaN, modules: 1.5, pristineCores: -2 });
assert.deepEqual(loadPlayerProgress().bank, { credits: 700, coreDust: 25, modules: 1 }, 'bad deposits add nothing');

// Pristine Cores go to the roster section the Shop spends from, keeping its other fields.
items.set('nikke-moba.roster-v1', JSON.stringify({ selectedCharacterId: 'crown', pristineCores: 3 }));
bankDeposit({ credits: 0, salvage: 0, modules: 0, pristineCores: 2 });
assert.deepEqual(JSON.parse(items.get('nikke-moba.roster-v1')), { selectedCharacterId: 'crown', pristineCores: 5 });
items.delete('nikke-moba.roster-v1');
bankDeposit({ credits: 0, salvage: 0, modules: 0, pristineCores: 1 });
assert.deepEqual(JSON.parse(items.get('nikke-moba.roster-v1')), { pristineCores: 1 }, 'works with no roster saved yet');

// Corrupt or tampered data falls back field by field.
items.set(KEY, JSON.stringify({
  characters: {
    'snow-white': { level: -3, xp: 'lots', skillPoints: 1.5, ranks: { attack: 9, skill: 0, burst: 'x' } },
    'not-a-nikke': { level: 50 },
  },
  bank: { credits: 'free', coreDust: 12, modules: -1 },
}));
assert.deepEqual(loadCharacterProgress('snow-white'), { level: 1, xp: 0, skillPoints: 0, ranks: { attack: 5, skill: 1, burst: 1 } });
assert.equal(loadPlayerProgress().characters['not-a-nikke'], undefined);
assert.deepEqual(loadPlayerProgress().bank, { credits: 0, coreDust: 12, modules: 0 });
items.set(KEY, '{not json');
assert.deepEqual(loadCharacterProgress('snow-white'), newCharacterProgress(), 'unreadable data starts fresh');

// Reset progress clears it.
saveCharacterProgress('snow-white', saved);
resetProfileProgress();
assert.deepEqual(readProfileSection('progress', null), null);
assert.deepEqual(loadCharacterProgress('snow-white'), newCharacterProgress());

console.log('player progress: all checks passed');
