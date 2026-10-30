import { chromium } from 'file:///C:/Users/rmdou/Desktop/GAME%20DEV/NIKKE%20POKEMON/node_modules/playwright-core/index.mjs';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${process.env.REVIEW_URL || 'http://127.0.0.1:5198'}/tools/review/character-setup.html`);
  await page.waitForSelector('[data-model]');
  const result = await page.evaluate(async () => {
    const { Engine, Scene, ArcRotateCamera, Vector3, HemisphericLight, Matrix } = await import('/node_modules/.vite/deps/@babylonjs_core.js');
    const { Chibi, loadChibiIndex } = await import('/src/chibi.ts');
    const { TwinStickRig } = await import('/src/survivor/rig.ts');
    const canvas = document.createElement('canvas');
    canvas.width = 900; canvas.height = 900;
    const engine = new Engine(canvas, true, { preserveDrawingBuffer: true });
    const scene = new Scene(engine);
    new ArcRotateCamera('camera', -.7, 1.1, 6, new Vector3(0, 1, 0), scene);
    new HemisphericLight('light', Vector3.Up(), scene);
    const index = await loadChibiIndex();
    const chibi = await Chibi.load(scene, index.variants.c405_00);
    const rig = new TwinStickRig(chibi);
    const coffin = chibi.joint('Bip001 Prop1'), shoulder = chibi.joint('Bip001 L Clavicle');
    const refresh = node => { if (node.parent) refresh(node.parent); node.computeWorldMatrix(true); };
    const relative = () => {
      refresh(coffin); refresh(shoulder);
      return coffin.getWorldMatrix().multiply(Matrix.Invert(shoulder.getWorldMatrix()));
    };
    let maxAimError = 0, maxTipError = 0, maxAttachmentError = 0, maxPitch = 0, cases = 0;
    for (const posture of ['aim', 'shot', 'reload', 'aim']) {
      for (const moveZ of [0, 1, -1]) for (const aimYaw of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
        for (let frame = 0; frame < 60; frame++) {
          rig.update(1 / 60, { moveX: 0, moveZ, speed: moveZ ? 3 : 0, aimYaw, posture });
          for (const group of scene.animationGroups) if (group.weight > 0) {
            group.pause(); group.goToFrame(group.from + (group.to - group.from) * frame / 60);
          }
          const before = relative();
          rig.applyAim();
          const after = relative();
          for (let k = 0; k < 16; k++) maxAttachmentError = Math.max(maxAttachmentError, Math.abs(before.m[k] - after.m[k]));
          if (frame < 30 || posture === 'reload') continue;
          const axis = Vector3.TransformNormal(new Vector3(.0087, .7176, .048), coffin.getWorldMatrix()).normalize();
          const error = Math.atan2(axis.x, axis.z) - aimYaw;
          maxAimError = Math.max(maxAimError, Math.abs(Math.atan2(Math.sin(error), Math.cos(error))));
          maxPitch = Math.max(maxPitch, Math.abs(Math.asin(axis.y)));
          const tip = Vector3.TransformCoordinates(new Vector3(.0087, .7176, .048), coffin.getWorldMatrix());
          maxTipError = Math.max(maxTipError, Vector3.Distance(tip, rig.muzzle(new Vector3())));
          cases++;
        }
      }
    }
    await scene.whenReadyAsync();
    scene.onAfterAnimationsObservable.add(() => rig.applyAim());
    for (let frame = 0; frame < 60; frame++) {
      rig.update(1 / 60, { moveX: 0, moveZ: 0, speed: 0, aimYaw: 0, posture: 'aim' });
      scene.render();
    }
    const image = canvas.toDataURL();
    rig.dispose(); scene.dispose(); engine.dispose();
    return { cases, maxAimError, maxTipError, maxAttachmentError, maxPitch, image };
  });
  await mkdir('artifacts/sin', { recursive: true });
  await writeFile('artifacts/sin/aim.png', Buffer.from(result.image.split(',')[1], 'base64'));
  delete result.image;
  console.log(result);
  assert.ok(result.maxAimError < .01, 'Swift Bunny gun barrel must track the requested aim direction');
  assert.ok(result.maxTipError < .001, 'Shots must originate at the coffin tip');
  assert.ok(result.maxAttachmentError < .001, 'Swift Bunny gun must preserve its animated alignment with the holding arm');

  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}

