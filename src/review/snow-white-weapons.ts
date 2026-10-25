import {
  ArcRotateCamera, Color3, Color4, DirectionalLight, Engine, HemisphericLight, MeshBuilder,
  Scene, ShadowGenerator, StandardMaterial, Vector3,
} from '@babylonjs/core';
import { buildSnowWhiteLauncher, buildSnowWhiteMissile } from '../survivor/snow-white/weapon-models';

const canvas = document.getElementById('view') as HTMLCanvasElement;
const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
const scene = new Scene(engine); scene.clearColor = new Color4(.105, .135, .16, 1);
const camera = new ArcRotateCamera('weapon-camera', 1.02, 1.1, 5.7, new Vector3(.15, .8, 0), scene);
camera.minZ = .02; camera.lowerRadiusLimit = 1.6; camera.upperRadiusLimit = 12;
camera.wheelDeltaPercentage = .02; camera.attachControl(canvas, true);
const hemi = new HemisphericLight('weapon-fill', new Vector3(0, 1, 0), scene); hemi.intensity = .85;
hemi.groundColor = new Color3(.35, .37, .40);
const sun = new DirectionalLight('weapon-key', new Vector3(-.6, -1, -.5), scene); sun.position.set(5, 9, 5); sun.intensity = 1.6;
const shadows = new ShadowGenerator(2048, sun); shadows.usePercentageCloserFiltering = true; shadows.bias = .0004; shadows.darkness = .6;
const ground = MeshBuilder.CreateGround('review-floor', { width: 200, height: 200 }, scene);
const floor = new StandardMaterial('review-floor-material', scene); floor.diffuseColor.set(.14, .18, .21); floor.specularColor.setAll(0);
ground.material = floor; ground.receiveShadows = true;
const blockout = new URLSearchParams(location.search).has('blockout');
const turret = buildSnowWhiteLauncher(scene, { shadows, blockout }); turret.root.position.x = -.7;
const rocket = buildSnowWhiteMissile(scene, { shadows, blockout });
rocket.root.position.set(1.3, .85, .08); rocket.root.scaling.scaleInPlace(2); rocket.root.rotation.x = -.35; rocket.root.rotation.y = -.6;
const finish = document.getElementById('finish')!; finish.textContent = blockout ? 'Show textures' : 'Show blockout';
finish.addEventListener('click', () => location.assign(blockout ? location.pathname : `${location.pathname}?blockout`));
function view(name: string) {
  camera.alpha = name === 'back' ? -Math.PI / 2 : name === 'hero' ? 1.02 : Math.PI / 2;
  camera.beta = name === 'top' ? .03 : name === 'hero' ? 1.1 : Math.PI / 2;
  camera.radius = 5.7;
}
for (const button of document.querySelectorAll<HTMLButtonElement>('[data-view]')) button.addEventListener('click', () => view(button.dataset.view!));
scene.executeWhenReady(() => { document.getElementById('status')!.textContent = `${blockout ? 'Geometry blockout' : 'Generated surface atlas'} · ${turret.meshes.reduce((n, m) => n + m.getTotalIndices() / 3, 0).toLocaleString()} turret triangles`; });
engine.runRenderLoop(() => scene.render()); window.addEventListener('resize', () => engine.resize());
Object.assign(window, { weaponReview: { scene, engine, camera, turret, rocket, view } });
