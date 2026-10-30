import { chromium } from 'file:///C:/Users/rmdou/Desktop/GAME%20DEV/NIKKE%20POKEMON/node_modules/playwright-core/index.mjs';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.goto(`${process.env.REVIEW_URL || 'http://127.0.0.1:5198'}/tools/review/character-setup.html`);
  await page.waitForSelector('[data-model]');
  const result = await page.evaluate(async () => {
    const { Engine, Scene, Vector3, Matrix, ArcRotateCamera, HemisphericLight } = await import('/node_modules/.vite/deps/@babylonjs_core.js');
    const { Chibi, loadChibiIndex } = await import('/src/chibi.ts');
    const { TwinStickRig } = await import('/src/survivor/rig.ts');
    const canvas = document.createElement('canvas'); canvas.width = 900; canvas.height = 900;
    const engine = new Engine(canvas, true, { preserveDrawingBuffer: true }), scene = new Scene(engine);
    const camera = new ArcRotateCamera('camera', -Math.PI / 2, 1.15, 6.5, new Vector3(0, 1.2, 0), scene);
    new HemisphericLight('light', Vector3.Up(), scene);
    const index = await loadChibiIndex(), chibi = await Chibi.load(scene, index.variants.c473_00, 'head', 'body');
    const parts = ['P_base_acc_01', 'P_light_acc_01', 'P_light_acc_02', 'P_light_acc_04'].map(name => chibi.joint(name));
    let minScale = Infinity, samples = 0, maxDrift = 0, maxTilt = 0;
    const check = () => {
      for (const part of parts) minScale = Math.min(minScale, Math.abs(part.scaling.x), Math.abs(part.scaling.y), Math.abs(part.scaling.z));
      samples++;
    };
    // Also cover showroom/full-body clips, before creating gameplay layers.
    for (const group of new Set(scene.animationGroups)) {
      group.weight = -1; group.start(false); group.pause();
      for (let i = 0; i <= 30; i++) { group.goToFrame(group.from + (group.to - group.from) * i / 30); check(); }
      group.stop(true); group.weight = 0;
    }
    const rig = new TwinStickRig(chibi, undefined, 'head');
    const refresh = node => { if (node.parent) refresh(node.parent); node.computeWorldMatrix(true); };
    for (const posture of ['aim', 'shot', 'reload', 'relaxed', 'aim']) for (const moveZ of [0, 1, -1]) {
      for (let frame = 0; frame < 90; frame++) {
        rig.update(1 / 60, { moveX: 0, moveZ, speed: moveZ ? 3 : 0, aimYaw: frame / 15, posture });
        for (const group of scene.animationGroups) if (group.weight > 0) {
          group.pause(); group.goToFrame(group.from + (group.to - group.from) * frame / 90);
        }
        rig.applyAim(); check();
        const halo = chibi.joint('P_light_acc_03'), head = chibi.joint('Bip001 Head');
        refresh(halo); refresh(head);
        const forward = Vector3.TransformNormal(Vector3.Up(), head.getWorldMatrix());
        const yaw = Math.atan2(forward.x, forward.z);
        const expected = head.getAbsolutePosition().add(new Vector3(-Math.sin(yaw) * .65, .65, -Math.cos(yaw) * .65));
        maxDrift = Math.max(maxDrift, Vector3.Distance(halo.getAbsolutePosition(), expected));
        const up = Vector3.TransformNormal(Vector3.Up(), halo.getWorldMatrix()).normalize();
        maxTilt = Math.max(maxTilt, Math.hypot(up.x, up.z), Math.abs(1 - up.y));
      }
    }
    await scene.whenReadyAsync();
    scene.onAfterAnimationsObservable.add(() => rig.applyAim());
    for (let frame = 0; frame < 45; frame++) {
      rig.update(1 / 60, { moveX: 0, moveZ: 0, speed: 0, aimYaw: Math.PI, posture: 'aim' }); scene.render();
    }
    const image = canvas.toDataURL();
    camera.alpha = 0;
    rig.update(1 / 60, { moveX: 0, moveZ: 0, speed: 0, aimYaw: Math.PI, posture: 'aim' }); scene.render();
    const sideImage = canvas.toDataURL();
    rig.dispose(); scene.dispose(); engine.dispose();
    return { minScale, samples, maxDrift, maxTilt, image, sideImage };
  });
  await mkdir('artifacts/sanctuary', { recursive: true });
  await writeFile('artifacts/sanctuary/visible.png', Buffer.from(result.image.split(',')[1], 'base64'));
  await writeFile('artifacts/sanctuary/side.png', Buffer.from(result.sideImage.split(',')[1], 'base64'));
  delete result.image; delete result.sideImage; console.log(result);
  assert.ok(result.minScale > .99, 'Floating pieces must remain full size across every clip');
  assert.ok(result.maxDrift < .001, 'Halo must remain directly behind her head');
  assert.ok(result.maxTilt < .001, 'Halo must stay upright');
} finally { await browser.close(); }

