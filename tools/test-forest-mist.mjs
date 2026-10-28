import assert from 'node:assert/strict';
import { NullEngine, Scene, UniversalCamera, Vector3, MeshBuilder } from '@babylonjs/core';
import { register } from 'node:module';
register('./ts-hooks.mjs', import.meta.url);
const { ForestMist } = await import('../src/survivor/forest-mist.ts');

const engine = new NullEngine();
const scene = new Scene(engine);
const camera = new UniversalCamera('test', new Vector3(0, 4, -10), scene);
camera.setTarget(Vector3.Zero());
MeshBuilder.CreateBox('subject', {}, scene);
const fog = new ForestMist(scene, camera);
fog.update(0, 1, Vector3.Zero());
assert.ok(fog.lanternData.some((value,index)=>index%4===3&&value>0), 'nearby roadside lanterns illuminate the clearing');
assert.ok(fog.lanternData.every(Number.isFinite), 'lantern transforms produce finite light coordinates');
fog.update(0, 1, new Vector3(1000,0,1000));
assert.ok(fog.lanternData.every((value,index)=>index%4!==3||value===0), 'distant lanterns fade out of the light budget');
fog.update(0, 1, Vector3.Zero());
const depth = camera.customRenderTargets.find(target => target.name === 'forest-volume-depth');
assert.ok(depth, 'fog depth must run in the camera render stage');
assert.ok(!scene.customRenderTargets.includes(depth));
let evaluated = false;
let depthFrames = 0;
scene.onBeforeActiveMeshesEvaluationObservable.add(() => { evaluated = false; });
scene.onAfterActiveMeshesEvaluationObservable.add(() => { evaluated = true; });
depth.onBeforeRenderObservable.add(() => {
  assert.ok(evaluated, 'depth must follow current-frame mesh evaluation');
  depthFrames++;
});
for (let frame = 0; frame < 4; frame++) {
  evaluated = false;
  camera.position.x += 1;
  fog.update(frame / 60, 1, new Vector3(frame, 0, 0));
  scene.render();
}
assert.equal(depthFrames, 4);
fog.update(1, 0, Vector3.Zero());
assert.ok(!camera.customRenderTargets.includes(depth));
fog.update(2, 1, Vector3.Zero());
assert.equal(camera.customRenderTargets.filter(target => target === depth).length, 1);
fog.dispose();
assert.ok(!camera.customRenderTargets.includes(depth));
scene.dispose();
engine.dispose();
console.log('Fog depth follows current-frame mesh evaluation; toggle and disposal clean up correctly.');
