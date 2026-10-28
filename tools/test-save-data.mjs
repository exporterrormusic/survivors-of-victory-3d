// Engine-free checks for save export/import/erase (src/frontend/persistence/ProfileStorage.ts) and
// Survival Round stats (src/frontend/profile/SurvivalStats.ts).
// Run: npm run test:save
import assert from 'node:assert/strict';
import { register } from 'node:module';
register('./ts-hooks.mjs', import.meta.url);

const items = new Map();
globalThis.window = {
  localStorage: {
    get length() { return items.size; },
    key: (i) => [...items.keys()][i] ?? null,
    getItem: (key) => (items.has(key) ? items.get(key) : null),
    setItem: (key, value) => { items.set(key, String(value)); },
    removeItem: (key) => { items.delete(key); },
  },
};

const { exportSaveData, importSaveData, eraseAllSaveData, writeProfileSection, readProfileSection } =
  await import('../src/frontend/persistence/ProfileStorage.ts');
const { recordSurvivalRound, loadSurvivalStats } = await import('../src/frontend/profile/SurvivalStats.ts');
const { GAME_VERSION } = await import('../src/version.ts');

// Export takes every game key (profile sections and loose settings), and nothing from other games.
writeProfileSection('roster', { pristineCores: 4 });
items.set('nikke-moba.camera-angle', 'high');
items.set('other-itch-game.save', 'keep me');
const save = exportSaveData();
assert.equal(save.gameVersion, GAME_VERSION);
assert.equal(save.entries['nikke-moba.camera-angle'], 'high');
assert.ok(!('other-itch-game.save' in save.entries), 'other games on the shared itch.io origin are left alone');
const file = JSON.stringify(save);

// Erase removes only our keys.
eraseAllSaveData();
assert.equal(readProfileSection('roster', null), null);
assert.equal(items.get('other-itch-game.save'), 'keep me');

// Import restores it exactly; junk files are refused without touching the current save.
assert.deepEqual(importSaveData(file), { ok: true, gameVersion: GAME_VERSION });
assert.deepEqual(readProfileSection('roster', null), { pristineCores: 4 });
assert.equal(items.get('nikke-moba.camera-angle'), 'high');
assert.equal(importSaveData('not json').ok, false);
assert.equal(importSaveData(JSON.stringify({ kind: 'something-else' })).ok, false);
assert.equal(importSaveData(JSON.stringify({ ...save, format: 99 })).ok, false, 'newer save formats are refused');
assert.deepEqual(readProfileSection('roster', null), { pristineCores: 4 }, 'a refused import changes nothing');
// Keys that aren't ours are never written from a file.
importSaveData(JSON.stringify({ ...save, entries: { ...save.entries, 'evil.key': 'x' } }));
assert.ok(!items.has('evil.key'));

// Survival stats: totals, bests, once per round.
eraseAllSaveData();
const first = recordSurvivalRound({ roundId: 'a', characterId: 'snow-white', endless: false, won: true, bossDefeated: true, kills: 300, level: 22, seconds: 640 });
assert.ok(first.saved);
assert.deepEqual(first.newBests, [], 'the first round sets records without calling them new bests');
const again = recordSurvivalRound({ roundId: 'a', characterId: 'snow-white', endless: false, won: true, bossDefeated: true, kills: 300, level: 22, seconds: 640 });
assert.equal(again.stats.rounds, 1, 'the same round is only counted once');
const second = recordSurvivalRound({ roundId: 'b', characterId: 'snow-white', endless: false, won: true, bossDefeated: true, kills: 350, level: 20, seconds: 610 });
assert.deepEqual([...second.newBests].sort(), ['kills', 'win']);
const stats = loadSurvivalStats('snow-white');
assert.equal(stats.rounds, 2); assert.equal(stats.wins, 2); assert.equal(stats.totalKills, 650);
assert.equal(stats.fastestWinSeconds, 610); assert.equal(stats.bestLevel, 22);
assert.equal(loadSurvivalStats('scarlet').rounds, 0);
assert.equal(again.counted, false);

console.log('save data: ok');
