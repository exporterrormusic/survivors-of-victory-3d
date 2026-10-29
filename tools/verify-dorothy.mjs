import { chromium } from 'file:///C:/Users/rmdou/Desktop/GAME%20DEV/NIKKE%20POKEMON/node_modules/playwright-core/index.mjs';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
await mkdir('artifacts/dorothy', { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('http://127.0.0.1:5197/?run=test-range&character=dorothy&enemies=inactive');
  await page.waitForFunction(() => window.game?.scene?.isReady(), null, { timeout: 180000 });
  const result = await page.evaluate(async () => {
    const g = window.game;
    g.engine.stopRenderLoop();
    g.scene.onBeforeAnimationsObservable.clear(); g.scene.onAfterAnimationsObservable.clear();
    const V = g.player.position.constructor;
    const { CHARACTERS } = await import('/src/frontend/profile/CharacterRoster.ts');
    const { CHARACTER_MODULES, isCharacterId } = await import('/src/characters/index.ts');
    const { characterSkins } = await import('/src/frontend/profile/Skins.ts');
    const roster = CHARACTERS.map(c => c.id);
    const target = g.targets.targets[0];
    for (const t of g.targets.targets) t.alive = false;
    target.alive = true; target.hp = 100; target.position.set(0, 0, 3); target.marks.clear(); target.breaks.clear(); target.ward = null;
    g.run.critChance = 0;
    const trace = g.targets.navigation.traceCover, shield = g.targets.shieldContact;
    g.targets.navigation.traceCover = () => null; g.targets.shieldContact = () => null;
    g.kit.fire(new V(0,.7,0), new V(0,.7,5));
    for (let i=0;i<80;i++) g.kit.update(.01);
    const damage = 100-target.hp;
    target.hp = 100; g.targets.navigation.traceCover = () => 0;
    g.kit.fire(new V(0,.7,0), new V(0,.7,5));
    for (let i=0;i<80;i++) g.kit.update(.01);
    const coveredDamage = 100-target.hp;
    let blocked=0; g.targets.navigation.traceCover=()=>null;
    g.targets.shieldContact=()=>({t:0,shield:{block(){blocked++;}}});
    g.kit.fire(new V(0,.7,0),new V(0,.7,5));g.kit.update(.1);
    const shieldDamage=100-target.hp;
    g.targets.navigation.traceCover=trace;g.targets.shieldContact=shield;
    g.scene.render();
    return { hero:g.run.characterId, model:g.player.chibi.meta.variant, roster, damage, coveredDamage, shieldDamage, blocked,
      specialReady:g.kit.special().charges, burstAvailable:g.kit.burstAvailable!==false, tiers:g.run.tiers.tiers.length,
      commanderRetained:isCharacterId('commander') && !!CHARACTER_MODULES.commander.model,
      skins:characterSkins('dorothy').map(s=>s.id), weapon:g.kit.weapon };
  });
  assert.equal(result.hero,'dorothy');assert.equal(result.model,'c233_00');
  assert.deepEqual(result.roster.slice(0,5),['snow-white','scarlet','rapunzel','dorothy','nayuta']);
  assert.ok(!result.roster.includes('commander') && result.commanderRetained);
  assert.equal(result.damage,3);assert.equal(result.coveredDamage,0);assert.equal(result.shieldDamage,0);assert.equal(result.blocked,1);
  assert.equal(result.specialReady,1);assert.equal(result.burstAvailable,true);assert.equal(result.tiers,0);
  assert.equal(result.weapon.magazine,60);
  await page.screenshot({path:'artifacts/dorothy/base.png'});
  // Load every appearance through the actual skin persistence / runtime path.
  for (const skin of result.skins.slice(1)) {
    await page.evaluate(async skin => {
      const { loadRosterState, saveRosterState } = await import('/src/frontend/profile/CharacterRoster.ts');
      const s=loadRosterState();s.ownedSkinIds.push(skin);s.equippedSkins.dorothy=skin;saveRosterState(s);
    },skin);
    await page.reload();await page.waitForFunction(()=>window.game?.scene?.isReady(),null,{timeout:180000});
    assert.equal(await page.evaluate(()=>game.player.chibi.meta.variant),skin);
    await page.screenshot({path:`artifacts/dorothy/${skin}.png`});
  }
  assert.deepEqual(errors,[]);
  await writeFile('artifacts/dorothy/verification.json',JSON.stringify({...result,errors},null,2));
  console.log(JSON.stringify(result,null,2));
} finally { await browser.close(); }
