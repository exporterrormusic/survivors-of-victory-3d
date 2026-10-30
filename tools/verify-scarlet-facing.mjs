import { chromium } from 'file:///C:/Users/rmdou/Desktop/GAME%20DEV/NIKKE%20POKEMON/node_modules/playwright-core/index.mjs';
import assert from 'node:assert/strict';

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.goto(`${process.env.REVIEW_URL || 'http://127.0.0.1:5198'}/tools/review/character-setup.html`);
  await page.waitForSelector('[data-model]');
  const reports = await page.evaluate(async () => {
    const { Engine, Scene, Vector3, FreeCamera } = await import('/node_modules/.vite/deps/@babylonjs_core.js');
    const { Chibi, loadChibiIndex } = await import('/src/chibi.ts');
    const { TwinStickRig } = await import('/src/survivor/rig.ts');
    const { HERO_VARIANTS } = await import('/src/characters/index.ts');
    const { createScarlet } = await import('/src/survivor/scarlet/index.ts');
    const engine = new Engine(document.createElement('canvas'));
    const index = await loadChibiIndex(), reports = [];
    for (const variant of HERO_VARIANTS.filter(item => item.character.id === 'scarlet')) {
      const scene = new Scene(engine);
      const kit = createScarlet({ scene, camera: { camera: new FreeCamera('camera', Vector3.Zero(), scene) } });
      const chibi = await Chibi.load(scene, index.variants[variant.variant], 'head');
      const rig = new TwinStickRig(chibi, undefined, kit.aimFacing);
      let maxHeadError = 0, cases = 0;
      for (const posture of ['aim', 'shot', 'reload', 'aim']) {
        for (const moveZ of [0, 1, -1]) for (const aimYaw of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
          for (let frame = 0; frame < 45; frame++) {
            rig.update(1 / 60, { moveX: 0, moveZ, speed: moveZ ? 3 : 0, aimYaw, posture });
            for (const group of scene.animationGroups) if (group.weight > 0) {
              group.pause(); group.goToFrame(group.from + (group.to - group.from) * frame / 45);
            }
            rig.applyAim();
            if (frame < 15) continue;
            const head = chibi.joint('Bip001 Head');
            const direction = Vector3.TransformNormal(Vector3.Up(), head.computeWorldMatrix(true));
            const offset = Math.atan2(direction.x, direction.z) - aimYaw;
            maxHeadError = Math.max(maxHeadError, Math.abs(Math.atan2(Math.sin(offset), Math.cos(offset))));
            cases++;
          }
        }
      }
      reports.push({ variant: variant.variant, maxHeadError, cases });
      rig.dispose(); scene.dispose();
    }
    engine.dispose(); return reports;
  });
  console.log(reports);
  for (const report of reports) assert.ok(report.maxHeadError < .01, `Scarlet must face the cursor: ${JSON.stringify(report)}`);
} finally {
  await browser.close();
}
