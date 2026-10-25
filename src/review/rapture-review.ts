// Dev review page for the converted Outpost Raptures (rapture-review.html). Each model is drawn
// through the same baked crowd path as lane minions, beside a mass-produced Nikke for scale.
// Measurements come from CPU-skinning a separate copy; verdicts and notes stay in localStorage.
import {
  ArcRotateCamera, Color3, Color4, DirectionalLight, Engine, HemisphericLight, Mesh, MeshBuilder,
  type Node, PBRMaterial, Scene, ShadowGenerator, StandardMaterial, TransformNode, Vector3, Matrix,
} from '@babylonjs/core';
import { BASE, aimOffset, clipMuzzle, loadChibiIndex, staticClipYaw } from '../chibi';
import { CrowdModel, crowdWorld } from '../crowd';
import { RAPTURE_TYPES } from '../enemy';
import { addPelicanWalk, instantiateModel, preloadModels } from '../model-library';

Object.assign(window, { reviewStarted: true }); // see the start-up check in rapture-review.html
document.getElementById('status')!.classList.remove('error'); // a slow first load can trip that check early

interface RaptureMeta {
  name: string; file: string; bones: number; vertices: number; triangles: number;
  clips: Record<string, { duration: number; source?: string }>; muzzles: string[]; bytes: number;
}
interface Measure { minY: number; maxY: number; reach: number; clipMinY: Record<string, number> }
interface Review { verdict?: 'works' | 'fix' | 'reject'; note?: string }

const RAPTURES = `${import.meta.env.BASE_URL}raptures/`;
const SCALE_NIKKE = 'c300_00'; // Soldier EG
/** clips the crowd bakes, in button order; Twin Tail's shot2 is listed but not baked yet */
const PLAYABLE = ['idle', 'walk', 'shot'];
/** lineup row length, metres */
const ROW = 40;
const STORAGE = 'rapture-review-v1';
const SUN_DIR = new Vector3(-0.45, -1, 0.35).normalize(); // src/world.ts
const tuned = new Map(Object.values(RAPTURE_TYPES).map((type) => [type.id, type]));

const canvas = document.getElementById('view') as HTMLCanvasElement;
const engine = new Engine(canvas, true, { stencil: true });
const scene = new Scene(engine);
scene.clearColor = new Color4(.16, .23, .25, 1);
scene.ambientColor = new Color3(.3, .3, .3);
const hemi = new HemisphericLight('hemi', new Vector3(.2, 1, -.3), scene);
hemi.intensity = .72;
hemi.groundColor = new Color3(.25, .25, .3);
const sun = new DirectionalLight('sun', SUN_DIR, scene);
sun.intensity = 1.25;
sun.position = SUN_DIR.scale(-40);
sun.autoUpdateExtends = false;
sun.orthoLeft = sun.orthoBottom = -32;
sun.orthoRight = sun.orthoTop = 32;
sun.shadowMinZ = 1;
sun.shadowMaxZ = 120;
const shadows = new ShadowGenerator(2048, sun);
shadows.usePercentageCloserFiltering = true;
shadows.bias = .0015;
shadows.darkness = .35;

// Units face +Z at yaw 0; start in front of them, a little to the right.
const camera = new ArcRotateCamera('review', Math.PI / 2 - .4, 1.15, 7, new Vector3(0, .8, 0), scene);
camera.lowerRadiusLimit = 1.5;
camera.upperRadiusLimit = 90;
camera.upperBetaLimit = Math.PI / 2 - .04; // never orbit under the floor
camera.wheelDeltaPercentage = .02;
camera.minZ = .05;
camera.attachControl(canvas, true);

const ground = MeshBuilder.CreateGround('ground', { width: 90, height: 90 }, scene);
const groundMat = new StandardMaterial('ground', scene);
groundMat.diffuseColor = new Color3(.33, .38, .36);
groundMat.specularColor = Color3.Black();
ground.material = groundMat;
ground.receiveShadows = true;
const gridLines: Vector3[][] = [];
for (let i = -45; i <= 45; i++) gridLines.push([new Vector3(i, .002, -45), new Vector3(i, .002, 45)], [new Vector3(-45, .002, i), new Vector3(45, .002, i)]);
const grid = MeshBuilder.CreateLineSystem('grid', { lines: gridLines }, scene);
grid.color = new Color3(.45, .52, .5);
grid.alpha = .35;
grid.isPickable = false;

const flat = (name: string, color: Color3) => {
  const mat = new StandardMaterial(name, scene);
  mat.emissiveColor = color;
  mat.disableLighting = true;
  return mat;
};
const ring = MeshBuilder.CreateTorus('radius', { diameter: 2, thickness: .03, tessellation: 48 }, scene);
ring.material = flat('radius', new Color3(1, .55, .2));
ring.isPickable = false;
const arrow = MeshBuilder.CreateTube('forward', { path: [new Vector3(0, .01, 0), new Vector3(0, .01, 1.6)], radius: .025 }, scene);
const head = MeshBuilder.CreateCylinder('forward-head', { diameterTop: 0, diameterBottom: .16, height: .25, tessellation: 12 }, scene);
head.rotation.x = Math.PI / 2;
head.position.set(0, .01, 1.7);
head.parent = arrow;
arrow.material = head.material = flat('forward', new Color3(.4, .85, 1));
arrow.isPickable = head.isPickable = false;
const muzzleMarks = [flat('muzzle', new Color3(1, .9, .3)), flat('muzzle-fallback', new Color3(1, .25, .25))];
const muzzleDots: Mesh[] = [];

const ui = {
  models: document.getElementById('models')!, card: document.getElementById('card')!,
  labels: document.getElementById('labels')!, status: document.getElementById('status')!,
  progress: document.getElementById('progress')!,
};
const index: Record<string, RaptureMeta> = await (await fetch(`${RAPTURES}index.json`)).json();
const ids = Object.keys(index);
const urlOf = (id: string) => `${RAPTURES}${id}.glb`;
const nikkeUrl = `${BASE}${SCALE_NIKKE}.glb`;
let reviews: Record<string, Review> = {};
try { reviews = JSON.parse(localStorage.getItem(STORAGE) ?? '{}'); } catch { /* private window: notes last this session */ }
const save = () => { try { localStorage.setItem(STORAGE, JSON.stringify(reviews)); } catch { /* see above */ } };

let selected = ids[0];
let mode: 'focus' | 'lineup' = 'focus';
let clipName = 'idle';
const measures = new Map<string, Measure>();
const crowds = new Map<string, CrowdModel>();

ui.status.textContent = `Loading ${ids.length} Raptures…`;
await preloadModels(scene, [...ids.map(urlOf), nikkeUrl]);
if (index.bmg001 && index.mmg005) addPelicanWalk(scene, urlOf('bmg001'), urlOf('mmg005'));
for (const id of ids) {
  crowds.set(id, new CrowdModel(scene, urlOf(id), shadows, {
    muzzles: (_clip, nodes) => [...nodes.keys()].filter((name) => name.startsWith('socket_muzzle_fire_'))
      .map((joint) => ({ joint, offset: [0, 0, 0] as [number, number, number] })),
  }));
}
const chibi = await loadChibiIndex();
const nikkeMeta = chibi.variants[SCALE_NIKKE];
const gunOffset = aimOffset(nikkeMeta, 'weapon');
const nikke = new CrowdModel(scene, nikkeUrl, shadows, {
  yaw: (clip) => staticClipYaw(nikkeMeta, clip, gunOffset),
  muzzles: (clip) => { const ref = clipMuzzle(nikkeMeta, clip); return ref ? [ref] : []; },
});
// Same unit roughness the game's lighting pass applies (src/visuals.ts refreshUnits).
for (const mesh of scene.meshes) if (mesh.material instanceof PBRMaterial && mesh.bakedVertexAnimationManager) mesh.material.roughness = Math.min(mesh.material.roughness ?? 1, .72);

/** Lowest/highest animated point and horizontal reach over every clip, CPU-skinned at 15 Hz. */
function measure(id: string): Measure {
  const cached = measures.get(id);
  if (cached) return cached;
  const instance = instantiateModel(scene, urlOf(id));
  const ordered: TransformNode[] = [];
  const walk = (node: Node) => { if (node instanceof TransformNode) ordered.push(node); node.getChildren().forEach(walk); };
  instance.rootNodes.forEach(walk);
  const meshes = ordered.filter((n): n is Mesh => n instanceof Mesh && !!n.skeleton && n.getTotalVertices() > 0);
  const result: Measure = { minY: Infinity, maxY: -Infinity, reach: 0, clipMinY: {} };
  for (const group of instance.animationGroups) {
    let clipMin = Infinity;
    const fps = group.targetedAnimations[0]?.animation.framePerSecond ?? 30;
    const samples = Math.max(2, Math.ceil((group.to - group.from) / fps * 15));
    group.start(false, 1, group.from, group.to);
    group.pause();
    for (let s = 0; s <= samples; s++) {
      group.goToFrame(group.from + (group.to - group.from) * s / samples);
      for (const node of ordered) node.computeWorldMatrix(true);
      for (const mesh of meshes) {
        mesh.skeleton!.prepare(true);
        const p = mesh.getPositionData(true, true)!, m = mesh.getWorldMatrix().m;
        for (let k = 0; k < p.length; k += 3) {
          const x = p[k] * m[0] + p[k + 1] * m[4] + p[k + 2] * m[8] + m[12];
          const y = p[k] * m[1] + p[k + 1] * m[5] + p[k + 2] * m[9] + m[13];
          const z = p[k] * m[2] + p[k + 1] * m[6] + p[k + 2] * m[10] + m[14];
          if (y < clipMin) clipMin = y;
          if (y > result.maxY) result.maxY = y;
          const r = Math.hypot(x, z);
          if (r > result.reach) result.reach = r;
        }
      }
    }
    group.stop();
    result.clipMinY[group.name] = clipMin;
    result.minY = Math.min(result.minY, clipMin);
  }
  instance.dispose();
  measures.set(id, result);
  return result;
}

/** Lift that keeps the lowest standing point (idle, shot) 1 cm above the floor, like the tuned
 * species. Walks are left out: claw tips digging in at the end of a step read fine. */
function suggestedLift(m: Measure): number {
  const standing = Math.min(...['idle', 'shot'].map((c) => m.clipMinY[c] ?? Infinity));
  const low = Number.isFinite(standing) ? standing : m.minY;
  return low >= .01 ? 0 : Math.ceil((.01 - low) * 100) / 100;
}
/** Direction the muzzles sit in, degrees from forward (+Z), over the shot clip (or idle). */
function muzzleBearing(id: string): number | null {
  const model = crowds.get(id)!, clip = model.clip(model.has('shot') ? 'shot' : 'idle');
  if (!index[id].muzzles.length) return null;
  let x = 0, z = 0;
  for (const track of clip.muzzles) for (let f = 0; f < clip.frames; f++) { x += track[f * 3]; z += track[f * 3 + 2]; }
  return Math.round(Math.atan2(x, z) * 180 / Math.PI);
}

/** Lineup spots, smallest first, rows packed by each model's reach. '' is the scale Nikke. */
const lineup = new Map<string, Vector3>();
let lineupDepth = 0;
function packLineup(): void {
  const items = [{ id: '', width: 2.4 }, ...[...ids].sort((a, b) => measure(a).maxY - measure(b).maxY)
    .map((id) => ({ id, width: Math.max(2.4, measure(id).reach * 1.7) }))];
  const rows: { id: string; x: number; width: number }[][] = [[]];
  let x = 0;
  for (const item of items) {
    if (x + item.width > ROW && rows.at(-1)!.length) { rows.push([]); x = 0; }
    rows.at(-1)!.push({ ...item, x: x + item.width / 2 });
    x += item.width;
  }
  let z = 0;
  for (const row of rows) {
    const last = row.at(-1)!, depth = Math.max(...row.map((r) => r.width));
    z -= depth / 2;
    for (const r of row) lineup.set(r.id, new Vector3(r.x - (last.x + last.width / 2) / 2, 0, z));
    z -= depth / 2;
  }
  for (const spot of lineup.values()) spot.z -= z / 2;
  lineupDepth = -z;
}
const positionOf = (id: string) => mode === 'focus' ? Vector3.Zero() : lineup.get(id)!;
const liftOf = (id: string) => tuned.get(id)?.modelLift ?? (measures.has(id) ? suggestedLift(measures.get(id)!) : 0);

/** fixed clock (seconds) for screenshots; null follows real time */
let frozenTime: number | null = null;

function frame(): void {
  const t = frozenTime ?? performance.now() / 1000;
  for (const model of [...crowds.values(), nikke]) model.begin();
  const draw = (model: CrowdModel, at: Vector3, lift: number, phase: number) => {
    const clip = model.clip(model.has(clipName) ? clipName : 'idle');
    // One-shot clips replay with a short rest so firing poses stay readable.
    const time = clip.loop ? t + phase : (t + phase) % (clip.duration + .6);
    const world = crowdWorld(at, 0, 1, lift).clone();
    const f = model.frameAt(clip, time);
    model.add(world, clip, f, 0);
    return { clip, f, world };
  };
  nikke.add(crowdWorld(mode === 'focus' ? new Vector3(-2.6, 0, 0) : lineup.get('')!, staticClipYaw(nikkeMeta, 'idle', gunOffset), 1, .04), nikke.clip('idle'), nikke.frameAt(nikke.clip('idle'), t), 0);
  const shown = mode === 'focus' ? [selected] : ids;
  let focusDraw: ReturnType<typeof draw> | null = null;
  for (const id of shown) {
    const drawn = draw(crowds.get(id)!, positionOf(id), liftOf(id), mode === 'focus' ? 0 : ids.indexOf(id) * .37);
    if (id === selected) focusDraw = drawn;
  }
  for (const model of [...crowds.values(), nikke]) model.end();

  // Muzzles of the selected model: yellow at its sockets, red where a socketless model would fire from.
  const model = crowds.get(selected)!, count = focusDraw ? Math.max(1, focusDraw.clip.muzzles.length) : 0;
  while (muzzleDots.length < count) {
    const dot = MeshBuilder.CreateSphere('muzzle', { diameter: .14, segments: 8 }, scene);
    dot.isPickable = false;
    muzzleDots.push(dot);
  }
  muzzleDots.forEach((dot, i) => {
    dot.setEnabled(i < count);
    if (i >= count || !focusDraw) return;
    dot.material = muzzleMarks[index[selected].muzzles.length ? 0 : 1];
    model.muzzle(focusDraw.clip, focusDraw.f, i, focusDraw.world, dot.position);
  });
  const at = positionOf(selected);
  ring.position.set(at.x, .02, at.z);
  ring.scaling.setAll(tuned.get(selected)?.radius ?? measures.get(selected)?.reach ?? 1);
  arrow.position.set(at.x, 0, at.z);

  if (mode === 'lineup') {
    const transform = scene.getTransformMatrix(), viewport = camera.viewport.toGlobal(engine.getRenderWidth(), engine.getRenderHeight());
    const ratio = canvas.clientWidth / engine.getRenderWidth();
    [...ui.labels.children].forEach((label, i) => {
      const id = i === 0 ? null : ids[i - 1];
      const p = Vector3.Project(lineup.get(id ?? '')!, Matrix.IdentityReadOnly, transform, viewport);
      (label as HTMLElement).style.left = `${p.x * ratio}px`;
      (label as HTMLElement).style.top = `${p.y * ratio + 6}px`;
      label.classList.toggle('selected', id === selected);
    });
  }
}

function renderList(): void {
  ui.models.replaceChildren(...ids.map((id) => {
    const button = document.createElement('button');
    button.innerHTML = `<i class="${reviews[id]?.verdict ?? ''}"></i>${index[id].name}<small>${crowds.get(id)!.has('walk') ? 'walk' : ''}</small>`;
    button.classList.toggle('selected', id === selected);
    button.onclick = () => select(id);
    return button;
  }));
  const done = ids.filter((id) => reviews[id]?.verdict).length;
  ui.progress.textContent = `${done} of ${ids.length} reviewed`;
  document.querySelectorAll<HTMLButtonElement>('#modes button').forEach((b) => b.classList.toggle('on', b.dataset.mode === mode));
}

function renderCard(): void {
  const meta = index[selected], m = measure(selected), type = tuned.get(selected), review = reviews[selected] ?? {};
  const bearing = muzzleBearing(selected), lift = suggestedLift(m);
  const flags: string[] = [];
  if (!meta.clips.walk) flags.push(selected === 'bmg001' ? 'No native walk: borrows Crawler\'s legs (in game).' : 'No walk clip: needs a borrowed walk, a hover or a glide.');
  if (!meta.clips.shot) flags.push('No shot clip: it can only idle.');
  if (!meta.muzzles.length) flags.push('No muzzle sockets: shots would start from the red fallback point.');
  if (bearing !== null && Math.abs(bearing) > 60) flags.push(`Muzzles sit ${bearing}° off forward: check its facing.`);
  const extra = Object.keys(meta.clips).filter((c) => !PLAYABLE.includes(c));
  if (extra.length) flags.push(`Extra clips not baked by the game yet: ${extra.join(', ')}.`);
  const cm = (v: number) => `${v.toFixed(2)} m`;
  ui.card.innerHTML = `
    <h2>${meta.name}</h2><div class="id">${selected} · ${meta.bones} bones · ${meta.triangles.toLocaleString()} triangles · ${Math.round(meta.bytes / 1024)} KB</div>
    <div class="row" id="clips">${PLAYABLE.map((c) => `<button data-clip="${c}" ${crowds.get(selected)!.has(c) ? '' : 'disabled'} class="${c === clipName ? 'on' : ''}">${c}</button>`).join('')}</div>
    <dl>
      <dt>Height</dt><dd>${cm(m.maxY)}</dd>
      <dt>Lowest point</dt><dd>${cm(m.minY)}${type ? '' : ` → lift ${lift.toFixed(2)}`}<br>${Object.entries(m.clipMinY).map(([c, y]) => `${c} ${y.toFixed(2)}`).join(' · ')}</dd>
      <dt>Walk</dt><dd>${meta.clips.walk?.source ?? (meta.clips.walk ? 'native' : selected === 'bmg001' ? 'Crawler\'s legs (borrowed in game)' : 'none (glides on idle)')}</dd>
      <dt>Reach</dt><dd>${cm(m.reach)} from center</dd>
      <dt>Muzzles</dt><dd>${meta.muzzles.length || 'none'}${bearing === null ? '' : ` · ${bearing}° from forward`}</dd>
      ${type ? `<dt>In game</dt><dd>radius ${type.radius} · lift ${type.modelLift} · ${type.attack}</dd>` : ''}
    </dl>
    ${flags.map((f) => `<div class="flag">${f}</div>`).join('')}
    <h3>Verdict</h3>
    <div class="row verdict">${(['works', 'fix', 'reject'] as const).map((v) => `<button data-v="${v}" class="${review.verdict === v ? 'on' : ''}">${{ works: 'Works', fix: 'Needs fix', reject: 'Reject' }[v]}</button>`).join('')}</div>
    <textarea id="note" placeholder="Notes (what looks wrong, how you'd use it)">${review.note ?? ''}</textarea>`;
  ui.card.querySelectorAll<HTMLButtonElement>('#clips button').forEach((b) => b.onclick = () => { clipName = b.dataset.clip!; renderCard(); });
  ui.card.querySelectorAll<HTMLButtonElement>('.verdict button').forEach((b) => b.onclick = () => {
    const v = b.dataset.v as Review['verdict'];
    reviews[selected] = { ...reviews[selected], verdict: reviews[selected]?.verdict === v ? undefined : v };
    save(); renderList(); renderCard();
  });
  (ui.card.querySelector('#note') as HTMLTextAreaElement).oninput = (e) => {
    reviews[selected] = { ...reviews[selected], note: (e.target as HTMLTextAreaElement).value };
    save();
  };
}

function frameCamera(): void {
  // Keep the viewer's orbit angles; only the target and distance follow the model.
  if (mode === 'focus') {
    const m = measure(selected), size = Math.max(m.maxY, m.reach, 1.2);
    camera.setTarget(new Vector3(-.9, Math.max(.6, m.maxY / 2), 0), false, false, true);
    camera.radius = size * 2.6 + 3;
  } else {
    camera.setTarget(new Vector3(0, 1.5, 0), false, false, true);
    camera.radius = Math.max(ROW, lineupDepth) * 1.15;
  }
}

function select(id: string): void {
  selected = id;
  if (!crowds.get(id)!.has(clipName)) clipName = 'idle';
  renderList(); renderCard();
  if (mode === 'focus') frameCamera();
}

function setMode(next: typeof mode): void {
  mode = next;
  if (mode === 'lineup' && !lineup.size) packLineup();
  ui.labels.replaceChildren(...(mode === 'lineup' ? ['Soldier EG (Nikke)', ...ids.map((id) => index[id].name)] : []).map((text) => {
    const label = document.createElement('span');
    label.textContent = text;
    return label;
  }));
  renderList(); frameCamera();
}

document.querySelectorAll<HTMLButtonElement>('#modes button').forEach((b) => b.onclick = () => setMode(b.dataset.mode as typeof mode));
document.getElementById('copy')!.onclick = async () => {
  const lines = ids.map((id) => {
    const r = reviews[id] ?? {}, label = { works: 'works', fix: 'needs fix', reject: 'reject' }[r.verdict ?? 'works'];
    return `- ${index[id].name} (${id}): ${r.verdict ? label : 'not reviewed'}${r.note ? ` — ${r.note.trim()}` : ''}`;
  });
  const text = `Rapture review, ${ids.filter((id) => reviews[id]?.verdict).length}/${ids.length} reviewed\n${lines.join('\n')}`;
  try { await navigator.clipboard.writeText(text); ui.status.textContent = 'Review notes copied'; }
  catch { console.log(text); ui.status.textContent = 'Clipboard blocked: notes printed to the console'; }
  setTimeout(() => { ui.status.textContent = ''; }, 2500);
};
window.addEventListener('keydown', (e) => {
  if ((e.target as HTMLElement).tagName === 'TEXTAREA') return;
  const step = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 0;
  if (step) { e.preventDefault(); select(ids[(ids.indexOf(selected) + step + ids.length) % ids.length]); }
  const n = Number(e.key);
  if (n >= 1 && n <= PLAYABLE.length) { clipName = PLAYABLE[n - 1]; if (!crowds.get(selected)!.has(clipName)) clipName = 'idle'; renderCard(); }
});
// Lineup: click the floor near a model to select it, double-click to focus it.
canvas.addEventListener('pointerup', (e) => {
  if (mode !== 'lineup' || camera.inertialAlphaOffset || camera.inertialBetaOffset) return;
  const pick = scene.pick(e.offsetX, e.offsetY, (mesh) => mesh === ground);
  if (!pick.pickedPoint) return;
  const nearest = ids.reduce((best, id) => Vector3.Distance(positionOf(id), pick.pickedPoint!) < Vector3.Distance(positionOf(best), pick.pickedPoint!) ? id : best);
  if (Vector3.Distance(positionOf(nearest), pick.pickedPoint) < Math.max(1.5, measure(nearest).reach)) select(nearest);
});
canvas.addEventListener('dblclick', () => { if (mode === 'lineup') setMode('focus'); });

scene.onBeforeRenderObservable.add(frame);
engine.runRenderLoop(() => scene.render());
window.addEventListener('resize', () => engine.resize());
ui.status.textContent = 'Measuring…';
await new Promise(requestAnimationFrame);
select(selected);
setMode('focus');
ui.status.textContent = '';
for (const id of ids) { measure(id); await new Promise((r) => setTimeout(r)); }

/** For automated screenshots (artifacts/) and the console. */
Object.assign(window, { review: { ids, index, measures, select, setMode, setClip: (c: string) => { clipName = c; renderCard(); },
  bearings: () => Object.fromEntries(ids.map((id) => [id, muzzleBearing(id)])),
  freeze: (seconds: number | null) => { frozenTime = seconds; }, camera, scene, ready: true } });
