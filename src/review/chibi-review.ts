// Dev review page for converted hero chibis (tools/review/chibi-review.html): pick any variant in
// public/chibi/index.json and play its clips on an orbit camera. ?variant=c5028_00&clip=idle
import { ArcRotateCamera, Color4, HemisphericLight, MeshBuilder, Scene, SceneLoader, Engine, Vector3, type AnimationGroup, type AbstractMesh } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';

Object.assign(window, { reviewStarted: true }); // see the start-up check in chibi-review.html

const BASE = `${import.meta.env.BASE_URL}chibi/`;
const params = new URLSearchParams(location.search);
const canvas = document.getElementById('view') as HTMLCanvasElement;
const variantSelect = document.getElementById('variant') as HTMLSelectElement;
const clipSelect = document.getElementById('clip') as HTMLSelectElement;
const status = document.getElementById('status')!;

const engine = new Engine(canvas, true);
const scene = new Scene(engine);
scene.clearColor = new Color4(.42, .45, .86, 1);
new HemisphericLight('light', new Vector3(.2, 1, -.3), scene).intensity = 1.1;
const camera = new ArcRotateCamera('camera', -Math.PI / 2, 1.2, 4.5, new Vector3(0, .9, 0), scene);
camera.attachControl(canvas, true);
camera.wheelPrecision = 60;
camera.minZ = .05;
MeshBuilder.CreateGround('ground', { width: 4, height: 4 }, scene);

const index = await (await fetch(`${BASE}index.json`)).json() as { variants: Record<string, { file: string; clips: Record<string, unknown> }> };
for (const id of Object.keys(index.variants).sort()) variantSelect.add(new Option(id, id));
let meshes: AbstractMesh[] = [], groups: AnimationGroup[] = [];

async function show(id: string): Promise<void> {
  status.textContent = `Loading ${id}…`;
  for (const m of meshes) m.dispose();
  for (const g of groups) g.dispose();
  const result = await SceneLoader.ImportMeshAsync('', BASE, index.variants[id].file, scene);
  meshes = result.meshes; groups = result.animationGroups;
  for (const g of groups) g.stop();
  clipSelect.replaceChildren(...groups.map((g) => new Option(g.name, g.name)));
  const wanted = params.get('clip');
  clipSelect.value = groups.some((g) => g.name === wanted) ? wanted! : groups.find((g) => g.name === 'idle')?.name ?? groups[0]?.name ?? '';
  play();
  status.textContent = `${id} · ${groups.length} clips`;
}
function play(): void {
  for (const g of groups) g.stop();
  groups.find((g) => g.name === clipSelect.value)?.start(true);
}
variantSelect.addEventListener('change', () => { void show(variantSelect.value); });
clipSelect.addEventListener('change', play);
variantSelect.value = params.get('variant') && index.variants[params.get('variant')!] ? params.get('variant')! : variantSelect.options[0].value;
await show(variantSelect.value);
Object.assign(window, { reviewReady: true });
engine.runRenderLoop(() => scene.render());
addEventListener('resize', () => engine.resize());
