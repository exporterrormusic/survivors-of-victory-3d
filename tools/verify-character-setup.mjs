import { chromium } from 'file:///C:/Users/rmdou/Desktop/GAME%20DEV/NIKKE%20POKEMON/node_modules/playwright-core/index.mjs';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const base = process.env.REVIEW_URL || 'http://127.0.0.1:5198';
const out = 'artifacts/character-setup';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${base}/tools/review/character-setup.html`);
  await page.waitForSelector('[data-model]', { timeout: 60000 });
  const ids = ['marian', 'crown', 'kilo', 'cecil', 'sin', 'wells'];
  const paths = await page.evaluate(async ids => {
    const { characterBurstArt, characterBurstButtonArt } = await import('/src/characters/assets.ts');
    return ids.map(id => ({ id, menu: characterBurstArt(id), button: characterBurstButtonArt(id) }));
  }, ids);
  for (const { id, menu, button } of paths) {
    assert.equal(menu, `assets/menus/character-select/${id}/burst.webp`);
    assert.equal(button, `ui/survivor/${id}-burst-setup-v1.png`);
  }
  for (const id of ids) {
    await page.selectOption('#character', id);
    const skins = await page.locator('#skin option').evaluateAll(options => options.map(o => o.value));
    for (const skin of skins) {
      await page.selectOption('#skin', skin);
      await page.waitForFunction(id => document.querySelector('[data-model]')?.dataset.model === id, skin);
      await page.waitForFunction(() => document.querySelector('#burst').naturalWidth > 0);
      await page.screenshot({ path: `${out}/${id}-${skin}.png` });
    }
  }
  const results = await page.evaluate(async ids => {
    const { Engine, Scene, ArcRotateCamera, HemisphericLight, Vector3 } = await import('/node_modules/.vite/deps/@babylonjs_core.js');
    const { Chibi, loadChibiIndex } = await import('/src/chibi.ts');
    const { TwinStickRig } = await import('/src/survivor/rig.ts');
    const { CHARACTER_MODULES } = await import('/src/characters/index.ts');
    const { characterSkins } = await import('/src/frontend/profile/Skins.ts');
    const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 480;
    const engine = new Engine(canvas, true);
    const index = await loadChibiIndex(), results = [];
    try {
      for (const id of ids) for (const skin of characterSkins(id)) {
        const scene = new Scene(engine);
        new ArcRotateCamera('camera', Math.PI / 2, 1.2, 5, new Vector3(0, 1, 0), scene);
        new HemisphericLight('light', Vector3.Up(), scene);
        const model = CHARACTER_MODULES[id].model;
        const chibi = await Chibi.load(scene, index.variants[skin.id], model.aim, model.muzzle);
        const clips = {};
        for (const name of ['idle', 'walk', 'run', 'aim_idle', 'shot', 'cover_reload', 'stun', 'death']) {
          const group = chibi.animationGroup(name);
          if (!group || !chibi.play(name, { fade: 0, loop: true })) throw Error(`${skin.id}: missing ${name}`);
          chibi.update(.016); group.goToFrame((group.from + group.to) / 2); scene.render();
          const animated = group.targetedAnimations.some(track => {
            const keys = track.animation.getKeys();
            return keys.length > 1 && keys.some(k => JSON.stringify(k.value) !== JSON.stringify(keys[0].value));
          });
          if (!animated) throw Error(`${skin.id}: static ${name}`);
          clips[name] = { duration: chibi.duration(name), tracks: group.targetedAnimations.length };
        }
        const rig = new TwinStickRig(chibi, undefined, model.aim);
        for (const posture of ['relaxed', 'aim', 'shot', 'reload']) for (const moveZ of [0, 1, -1]) {
          for (let frame = 0; frame < 20; frame++) {
            rig.update(1 / 60, { moveX: 0, moveZ, speed: moveZ ? 3 : 0, aimYaw: .6, posture });
            scene.render();
          }
          for (const node of scene.transformNodes) if (!Array.from(node.getWorldMatrix().m).every(Number.isFinite)) throw Error(`${skin.id}: invalid rig transform`);
        }
        results.push({ character: id, variant: skin.id, clips, rig: 'passed' });
        rig.dispose(); scene.dispose();
      }
    } finally { engine.dispose(); }
    return results;
  }, ids);
  assert.equal(results.length, 16);
  assert.deepEqual(errors, []);
  await writeFile(`${out}/verification.json`, JSON.stringify({ results, errors }, null, 2));
  console.log(`PASS: ${results.length} appearances; 8 animated clips each; layered movement/aim/fire/reload; burst art loads; no browser errors.`);
} finally { await browser.close(); }
