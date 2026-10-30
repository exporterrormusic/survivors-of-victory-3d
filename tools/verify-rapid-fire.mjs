import { chromium } from 'file:///C:/Users/rmdou/Desktop/GAME%20DEV/NIKKE%20POKEMON/node_modules/playwright-core/index.mjs';
import assert from 'node:assert/strict';
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.goto(`${process.env.REVIEW_URL || 'http://127.0.0.1:5198'}/tools/review/character-setup.html`);
  await page.waitForSelector('[data-model]');
  const reports = await page.evaluate(async () => {
    const { Engine, Scene, Vector3, Quaternion } = await import('/node_modules/.vite/deps/@babylonjs_core.js');
    const { Chibi, loadChibiIndex } = await import('/src/chibi.ts');
    const { TwinStickRig } = await import('/src/survivor/rig.ts');
    const engine = new Engine(document.createElement('canvas')), index = await loadChibiIndex(), reports = [];
    for (const variant of ['c223_00', 'c223_01', 'c233_00']) {
      const scene = new Scene(engine), chibi = await Chibi.load(scene, index.variants[variant]);
      const rig = new TwinStickRig(chibi, undefined, variant.startsWith('c223') ? 'head' : 'weapon', true);
      let starts = 0, frame = 0, lastStart = -100, minGap = Infinity, shotRequests = 0;
      const play = rig.upper.play.bind(rig.upper);
      rig.upper.play = (name, options) => {
        if (name === 'cover_shot' && options?.restart) { minGap = Math.min(minGap, frame - lastStart); lastStart = frame; starts++; }
        return play(name, options);
      };
      for (frame = 0; frame < 240; frame++) {
        const shot = frame % 5 === 0; if (shot) shotRequests++;
        rig.update(1 / 60, { moveX: 0, moveZ: 1, speed: 3, aimYaw: .7, posture: shot ? 'shot' : 'aim', actionSpeed: 3 });
        for (const group of scene.animationGroups) if (group.weight > 0) {
          group.pause(); group.goToFrame(group.from + (group.to - group.from) * Math.min(1, (frame - lastStart) / 24));
        }
        rig.applyAim();
      }
      const shot = scene.animationGroups.find(group => group.name === 'cover_shot@upper');
      const aim = chibi.animationGroup('aim_idle');
      let endpointError = 0, checked = 0;
      for (const track of shot.targetedAnimations) {
        if (track.animation.targetProperty === 'scaling') continue;
        const source = aim.targetedAnimations.find(a => a.target === track.target && a.animation.targetProperty === track.animation.targetProperty);
        const base = source?.animation.getKeys()[0]?.value;
        if (!(base instanceof Vector3) && !(base instanceof Quaternion)) continue;
        const keys = track.animation.getKeys();
        for (const key of [keys[0], keys.at(-1)]) {
          if (Math.abs(key.frame - shot.from) > .01 && Math.abs(key.frame - shot.to) > .01) continue;
          const error = base instanceof Quaternion ? 1 - Math.abs(Quaternion.Dot(base, key.value) / (base.length() * key.value.length())) : Vector3.Distance(base, key.value);
          endpointError = Math.max(endpointError, error); checked++;
        }
      }
      const firingGap = minGap;
      rig.update(1 / 60, { moveX: 0, moveZ: 0, speed: 0, aimYaw: .7, posture: 'reload' });
      const reloadStarted = rig.upper.current === 'cover_reload';
      const before = starts;
      rig.update(1 / 60, { moveX: 0, moveZ: 0, speed: 0, aimYaw: .7, posture: 'shot' });
      reports.push({ variant, shotRequests, cycles: before, minGap: firingGap, endpointError, checked, reloadStarted, firesAfterReload: starts === before + 1 });
      rig.dispose(); scene.dispose();
    }
    engine.dispose(); return reports;
  });
  console.log(reports);
  for (const report of reports) {
    assert.equal(report.shotRequests, 48);
    assert.ok(report.cycles >= 8 && report.cycles <= 10 && report.minGap >= 24, 'Rapid shots must not restart unfinished recoil');
    assert.ok(report.checked > 0 && report.endpointError < .0001, 'Recoil must ease back to its starting aim pose');
    assert.ok(report.reloadStarted && report.firesAfterReload, 'Reload must interrupt recoil without blocking the next shot');
  }
} finally { await browser.close(); }
