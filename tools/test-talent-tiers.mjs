// Talent tiers (src/survivor/talent-tiers.ts) and Snow White's tier data.
import assert from 'node:assert/strict';
import { register } from 'node:module';
import fs from 'node:fs/promises';
register('./ts-hooks.mjs', import.meta.url);
const { TalentTiers } = await import('../src/survivor/talent-tiers.ts');
const { SNOW_WHITE_TALENTS } = await import('../src/survivor/snow-white/tiers.ts');
const { SCARLET_TALENTS } = await import('../src/survivor/scarlet/tiers.ts');
const { RAPUNZEL_TALENTS } = await import('../src/survivor/rapunzel/tiers.ts');
const SNOW_WHITE_TIERS = SNOW_WHITE_TALENTS.tiers;

// Shape: HotS levels, 2-3 options, unique ids, every art file exists.
assert.deepEqual(SNOW_WHITE_TIERS.map((t) => t.level), [1, 4, 7, 10, 13, 16, 20]);
const all = SNOW_WHITE_TIERS.flatMap((t) => t.options);
assert.equal(new Set(all.map((t) => t.id)).size, all.length, 'talent ids are unique');
for (const tier of SNOW_WHITE_TIERS) assert.ok(tier.options.length >= 2 && tier.options.length <= 3, `tier ${tier.level} has 2-3 options`);
for (const talent of all) if (talent.art) await fs.access(new URL(`../public/${talent.art}`, import.meta.url));

// Every effect flag (and quest reward) is read somewhere in the survivor combat code.
const sources = await Promise.all(['run.ts', 'player.ts', 'snow-white/weapon.ts', 'snow-white/turret.ts', 'snow-white/burst.ts', 'snow-white/index.ts', 'passives.ts']
  .map((file) => fs.readFile(new URL(`../src/survivor/${file}`, import.meta.url), 'utf8')));
const code = sources.join('\n');
for (const talent of all) for (const effect of [...talent.effects, ...(talent.quest?.reward ?? [])])
  assert.ok(code.includes(`'${effect}'`), `${talent.name}: combat reads '${effect}'`);

// Picks: oldest tier first, one per tier, locked by level, effects granted.
// Scarlet: same shape, and every flag is read by her kit, run.ts or player.ts.
assert.deepEqual(SCARLET_TALENTS.tiers.map((t) => t.level), [1, 4, 7, 10, 13, 16, 20]);
const scarletCode = (await Promise.all(['run.ts', 'player.ts', 'scarlet/index.ts'].map((file) => fs.readFile(new URL(`../src/survivor/${file}`, import.meta.url), 'utf8')))).join('\n');
for (const talent of SCARLET_TALENTS.tiers.flatMap((t) => t.options)) for (const effect of [...talent.effects, ...(talent.quest?.reward ?? [])])
  assert.ok(scarletCode.includes(`'${effect}'`), `Scarlet ${talent.name}: combat reads '${effect}'`);

// Rapunzel: same checks against her kit.
assert.deepEqual(RAPUNZEL_TALENTS.tiers.map((t) => t.level), [1, 4, 7, 10, 13, 16, 20]);
const rapunzelCode = (await Promise.all(['run.ts', 'player.ts', 'rapunzel/index.ts'].map((file) => fs.readFile(new URL(`../src/survivor/${file}`, import.meta.url), 'utf8')))).join('\n');
for (const talent of RAPUNZEL_TALENTS.tiers.flatMap((t) => t.options)) for (const effect of [...talent.effects, ...(talent.quest?.reward ?? [])])
  assert.ok(rapunzelCode.includes(`'${effect}'`), `Rapunzel ${talent.name}: combat reads '${effect}'`);

const tiers = new TalentTiers(SNOW_WHITE_TALENTS);
assert.equal(tiers.pending(1), 0, 'level 1 opens the first tier');
assert.equal(tiers.choose(1, 0, 4), null, 'cannot skip an open tier');
assert.equal(tiers.choose(0, 5, 1), null, 'invalid option');
assert.equal(tiers.choose(0, 0, 1)?.id, 'marked_rounds');
assert.ok(tiers.has('weak_point'));
assert.equal(tiers.pending(3), -1, 'nothing until level 4');
assert.equal(tiers.choose(0, 1, 1), null, 'a tier is picked once');
assert.equal(tiers.pendingCount(13), 4, 'levels 4, 7, 10 and 13 wait');
assert.equal(tiers.choose(1, 2, 13)?.id, 'cold_focus');
assert.equal(tiers.pending(13), 2);

// Quests count matching kills and grant their reward once.
assert.equal(tiers.recordKill({ marked: false, burning: false, source: 'special' }).length, 0, 'turret kills on unmarked enemies do not count');
for (let i = 0; i < 149; i++) tiers.recordKill({ marked: true, burning: false, source: 'attack' });
assert.ok(!tiers.has('explosive_rounds'));
assert.equal(tiers.quests[0].count, 149);
assert.equal(tiers.recordKill({ marked: true, burning: false, source: 'effect' })[0]?.id, 'marked_rounds', 'any marked kill counts');
assert.ok(tiers.has('explosive_rounds'), 'quest reward granted');
assert.equal(tiers.recordKill({ marked: true, burning: false, source: 'attack' }).length, 0, 'completes once');
assert.ok(tiers.quests[0].done);

tiers.reset();
assert.ok(!tiers.has('weak_point') && !tiers.has('explosive_rounds') && tiers.pending(1) === 0, 'reset clears picks and quests');
console.log('talent tiers: ok');

const { NAYUTA_TALENTS } = await import('../src/survivor/nayuta/tiers.ts');
assert.deepEqual(NAYUTA_TALENTS.tiers.map(t => t.level), [1, 4, 7, 10, 13, 16, 20]);
const nayutaCode = await fs.readFile(new URL('../src/survivor/nayuta/index.ts', import.meta.url), 'utf8');
for (const talent of NAYUTA_TALENTS.tiers.flatMap(t => t.options)) for (const flag of talent.effects)
  assert.ok(nayutaCode.includes(`'${flag}'`), `Nayuta ${talent.name}: implemented flag ${flag}`);

for(const [option,event,amount,reward] of [[0,'clone-return',20,'return_gauge'],[2,'insight-time',60,'shared_insight']]){
 const tree=new TalentTiers(NAYUTA_TALENTS);
 tree.recordEvent(event,amount);assert.equal(tree.quests.length,0);
 tree.choose(0,option,1);
 tree.recordKill({source:'burst',marked:false,burning:false});assert.equal(tree.quests[0].count,0);
 tree.recordEvent(event,amount-.5);assert.ok(!tree.has(reward));
 assert.equal(tree.recordEvent(event,.5).length,1);assert.ok(tree.has(reward));
 assert.equal(tree.recordEvent(event,100).length,0);
 tree.reset();assert.ok(!tree.has(reward));
}
const cloneQuest=new TalentTiers(NAYUTA_TALENTS);cloneQuest.choose(0,1,1);
for(let i=0;i<30;i++){cloneQuest.recordKill({source:'special',marked:false,burning:false});cloneQuest.recordKill({source:'burst',marked:false,burning:false});}
assert.ok(cloneQuest.has('united_volley'));
console.log('Nayuta quests: retrieval events, cumulative seconds, both clone kill sources and reset: ok');
