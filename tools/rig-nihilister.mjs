// Hand-rig the static Nihilister boss mesh (NKAS mba002) as a dragon and bake a few looping clips.
// Reference/commission use only — the motion is a guess, not the game's animation data.
//
//   node tools/rig-nihilister.mjs   # raw/bosses/mba002_nihilister.glb -> raw/bosses/mba002_nihilister_rigged.glb
//
// Model space: +Y up, +Z forward (head), tail toward -Z, wing blades at |x| 7-15.

import { NodeIO } from '@gltf-transform/core';
import { copyFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'raw', 'bosses', 'mba002_nihilister.glb');
const OUT = join(ROOT, 'raw', 'bosses', 'mba002_nihilister_rigged.glb');
const GAME = join(ROOT, 'public', 'bosses', 'mba002_nihilister.glb');

// name, parent, head (pivot), tail (end point used for weighting)
const BONES = [
  ['root', null, [0, 0, 0], [0, 0, 0]],
  ['hips', 'root', [0, 6, -8], [0, 8, -5]],
  ['spine', 'hips', [0, 8, -5], [0, 9, -1]],
  ['neck', 'spine', [0, 9.5, -1], [0, 10, 2]],
  ['head', 'neck', [0, 10, 2], [0, 10, 5]],
  ['tail1', 'hips', [0, 6, -9], [0, 5, -11.5]],
  ['tail2', 'tail1', [0, 5, -11.5], [0, 4, -14]],
  ['tail3', 'tail2', [0, 4, -14], [0, 3, -17.5]],
];
for (const [s, n] of [[-1, 'L'], [1, 'R']]) {
  BONES.push(
    [`shoulder_${n}`, 'spine', [5 * s, 12, -3], [11 * s, 9, -4]],
    [`forearm_${n}`, `shoulder_${n}`, [11 * s, 9, -4], [14 * s, 2, -6]],
    [`hand_${n}`, `forearm_${n}`, [14 * s, 2, -6], [14 * s, -1, -7]],
    [`wing_${n}`, 'spine', [7 * s, 13, -5], [11 * s, 20, -5]],
  );
}
const IDX = Object.fromEntries(BONES.map((b, i) => [b[0], i]));
const side = (x) => (x < 0 ? 'L' : 'R');

// Which bones each mesh part may follow (part index = primitive index in the NKAS GLB).
const BODY = ['hips', 'spine', 'neck', 'head', 'tail1', 'shoulder_L', 'forearm_L', 'hand_L', 'shoulder_R', 'forearm_R', 'hand_R'];
function allowed(part, x) {
  switch (part) {
    case 2: return [`wing_${side(x)}`];
    case 6: return [`forearm_${side(x)}`, `hand_${side(x)}`];
    case 7: return ['hand_L'];
    case 12: return ['hand_R'];
    case 10: case 11: return ['hips', 'tail1', 'tail2', 'tail3'];
    case 0: case 1: return ['hips'];
    case 3: return ['hips', 'spine', 'tail1'];
    case 8: case 9: return ['neck', 'head'];
    default: return BODY;
  }
}

function segDist(p, a, b) {
  const ab = b.map((v, i) => v - a[i]), ap = p.map((v, i) => v - a[i]);
  const len2 = ab.reduce((s, v) => s + v * v, 0);
  const t = len2 ? Math.max(0, Math.min(1, ap.reduce((s, v, i) => s + v * ab[i], 0) / len2)) : 0;
  return Math.hypot(...p.map((v, i) => v - (a[i] + ab[i] * t)));
}

const io = new NodeIO();
const doc = await io.read(SRC);
const buf = doc.getRoot().listBuffers()[0];
const scene = doc.getRoot().listScenes()[0];
const meshNode = doc.getRoot().listNodes()[0];
const mesh = meshNode.getMesh();
// NKAS exports BLEND, which sorts whole parts and shows far armor through near armor; cut out instead.
doc.getRoot().listMaterials().forEach((m) => m.setAlphaMode('MASK').setAlphaCutoff(0.5));

// Skeleton
const nodes = BONES.map(([name, parent, head]) => {
  const p = parent ? BONES[IDX[parent]][2] : [0, 0, 0];
  return doc.createNode(name).setTranslation(head.map((v, i) => v - p[i]));
});
BONES.forEach(([, parent], i) => (parent ? nodes[IDX[parent]].addChild(nodes[i]) : scene.addChild(nodes[i])));
const ibm = new Float32Array(BONES.length * 16);
BONES.forEach(([, , h], i) => ibm.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -h[0], -h[1], -h[2], 1], i * 16));
const skin = doc.createSkin('dragon').setSkeleton(nodes[0])
  .setInverseBindMatrices(doc.createAccessor().setType('MAT4').setArray(ibm).setBuffer(buf));
nodes.forEach((n) => skin.addJoint(n));
meshNode.setSkin(skin);

// Weights: two nearest allowed bones, soft falloff so joints bend instead of tearing.
const SIGMA = 1.2;
mesh.listPrimitives().forEach((prim, part) => {
  const pos = prim.getAttribute('POSITION').getArray();
  const n = pos.length / 3;
  const joints = new Uint16Array(n * 4), weights = new Float32Array(n * 4);
  for (let v = 0; v < n; v++) {
    const p = [pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]];
    const ranked = allowed(part, p[0]).map((name) => {
      const [, , a, b] = BONES[IDX[name]];
      return [IDX[name], segDist(p, a, b)];
    }).sort((a, b) => a[1] - b[1]).slice(0, 2);
    const w = ranked.map(([, d]) => Math.exp(-(d - ranked[0][1]) / SIGMA));
    const sum = w.reduce((s, x) => s + x, 0);
    ranked.forEach(([j], k) => { joints[v * 4 + k] = j; weights[v * 4 + k] = w[k] / sum; });
  }
  prim.setAttribute('JOINTS_0', doc.createAccessor().setType('VEC4').setArray(joints).setBuffer(buf));
  prim.setAttribute('WEIGHTS_0', doc.createAccessor().setType('VEC4').setArray(weights).setBuffer(buf));
});

// Animation helpers. Angles in degrees: rx + = nod down / arms back, ry = yaw, rz + = roll toward -x.
const D = Math.PI / 180;
function quat(rx = 0, ry = 0, rz = 0) {
  const [cx, sx, cy, sy, cz, sz] = [rx, rx, ry, ry, rz, rz].map((a, i) => (i % 2 ? Math.sin : Math.cos)(a * D / 2));
  return [sx * cy * cz - cx * sy * sz, cx * sy * cz + sx * cy * sz, cx * cy * sz - sx * sy * cz, cx * cy * cz + sx * sy * sz];
}
const rest = (name) => nodes[IDX[name]].getTranslation();

function clip(name, dur, tracks, fps = 30) {
  const anim = doc.createAnimation(name);
  const frames = Math.round(dur * fps);
  const times = new Float32Array(frames + 1).map((_, i) => (i / frames) * dur);
  const input = doc.createAccessor().setType('SCALAR').setArray(times).setBuffer(buf);
  for (const [bone, path, fn] of tracks) {
    const out = new Float32Array((frames + 1) * (path === 'rotation' ? 4 : 3));
    times.forEach((t, i) => out.set(fn((t / dur) * Math.PI * 2, t / dur), i * (path === 'rotation' ? 4 : 3)));
    const sampler = doc.createAnimationSampler().setInput(input).setInterpolation('LINEAR')
      .setOutput(doc.createAccessor().setType(path === 'rotation' ? 'VEC4' : 'VEC3').setArray(out).setBuffer(buf));
    anim.addSampler(sampler).addChannel(doc.createAnimationChannel().setTargetNode(nodes[IDX[bone]]).setTargetPath(path).setSampler(sampler));
  }
}
const S = Math.sin, C = Math.cos;
const bob = (amp, ph = 0) => (w) => rest('hips').map((v, i) => v + (i === 1 ? amp * S(w + ph) : 0));
const both = (fn) => ['L', 'R'].flatMap((n) => fn(n, n === 'L' ? -1 : 1));
// Ease 0..1..0 over a normalized time window.
const pulse = (u, a, b) => (u <= a || u >= b ? 0 : S(((u - a) / (b - a)) * Math.PI));
const tailWave = (amp, speed = 1) => ['tail1', 'tail2', 'tail3'].map((t, k) =>
  [t, 'rotation', (w) => quat(3 * S(w * speed - k), amp * S(w * speed - k * 0.9), 0)]);

clip('idle_hover', 3, [
  ['hips', 'translation', bob(0.6)],
  ['spine', 'rotation', (w) => quat(2 * S(w), 0, 0)],
  ['neck', 'rotation', (w) => quat(-3 * S(w - 0.6), 4 * S(w / 1), 0)],
  ['head', 'rotation', (w) => quat(4 * S(w - 1), 0, 0)],
  ...both((n, s) => [
    [`wing_${n}`, 'rotation', (w) => quat(0, 0, -s * 6 * S(w))],
    [`shoulder_${n}`, 'rotation', (w) => quat(-4 * S(w - 0.4), 0, s * 3 * S(w))],
    [`forearm_${n}`, 'rotation', (w) => quat(-6 * S(w - 0.8), 0, 0)],
    [`hand_${n}`, 'rotation', (w) => quat(8 * S(w - 1.2), 0, 0)],
  ]),
  ...tailWave(10),
]);

clip('fly_wingbeat', 1.2, [
  ['hips', 'translation', bob(1.2, -Math.PI / 2)],
  ['spine', 'rotation', (w) => quat(4 * S(w + 1), 0, 0)],
  ['head', 'rotation', (w) => quat(-5 * S(w + 1.5), 0, 0)],
  ...both((n, s) => [
    [`wing_${n}`, 'rotation', (w) => quat(0, s * 8 * S(w), -s * (8 + 20 * S(w)))],
    [`shoulder_${n}`, 'rotation', (w) => quat(-10 + 6 * S(w), 0, 0)],
    [`forearm_${n}`, 'rotation', (w) => quat(-12, 0, 0)],
  ]),
  ...tailWave(6, 1),
]);

clip('roar', 2.4, [
  ['hips', 'translation', (w, u) => rest('hips').map((v, i) => v + (i === 1 ? 1.5 * pulse(u, 0.1, 0.9) : 0))],
  ['spine', 'rotation', (w, u) => quat(-12 * pulse(u, 0.05, 0.95), 0, 0)],
  ['neck', 'rotation', (w, u) => quat(-25 * pulse(u, 0.1, 0.9) + 2 * S(w * 12) * pulse(u, 0.3, 0.8), 0, 0)],
  ['head', 'rotation', (w, u) => quat(-15 * pulse(u, 0.15, 0.85), 4 * S(w * 10) * pulse(u, 0.3, 0.8), 0)],
  ...both((n, s) => [
    [`wing_${n}`, 'rotation', (w, u) => quat(0, s * 10 * pulse(u, 0.1, 0.9), -s * 35 * pulse(u, 0.1, 0.9))],
    [`shoulder_${n}`, 'rotation', (w, u) => quat(-20 * pulse(u, 0.1, 0.9), 0, -s * 20 * pulse(u, 0.1, 0.9))],
    [`forearm_${n}`, 'rotation', (w, u) => quat(-25 * pulse(u, 0.15, 0.85), 0, 0)],
    [`hand_${n}`, 'rotation', (w, u) => quat(-30 * pulse(u, 0.2, 0.8), 0, 0)],
  ]),
  ...['tail1', 'tail2', 'tail3'].map((t, k) => [t, 'rotation', (w, u) => quat(-12 * pulse(u, 0.1 + k * 0.05, 0.9), 0, 0)]),
]);

// Wind up (arms back/up) -> slam forward-down -> recover.
const slam = (u) => (u < 0.4 ? -pulse(u, 0, 0.8) : 0) + (u >= 0.4 ? pulse(u, 0.35, 1.0) * 1.6 : 0);
clip('claw_slam', 1.8, [
  ['hips', 'translation', (w, u) => rest('hips').map((v, i) => v + (i === 1 ? -1.2 * Math.max(0, slam(u)) / 1.6 : 0))],
  ['spine', 'rotation', (w, u) => quat(10 * slam(u), 0, 0)],
  ['neck', 'rotation', (w, u) => quat(-10 * slam(u), 0, 0)],
  ...both((n, s) => [
    [`shoulder_${n}`, 'rotation', (w, u) => quat(-35 * slam(u), 0, -s * 10 * Math.max(0, -slam(u)))],
    [`forearm_${n}`, 'rotation', (w, u) => quat(-30 * slam(u), 0, 0)],
    [`hand_${n}`, 'rotation', (w, u) => quat(25 * Math.max(0, -slam(u)) - 20 * Math.max(0, slam(u)), 0, 0)],
    [`wing_${n}`, 'rotation', (w, u) => quat(0, 0, -s * 15 * slam(u))],
  ]),
  ...tailWave(5),
]);

clip('tail_swipe', 2, [
  ['hips', 'translation', bob(0.3)],
  ['hips', 'rotation', (w, u) => quat(0, 35 * S(u * Math.PI * 2) * pulse(u, 0, 1), 0)],
  ['neck', 'rotation', (w, u) => quat(0, -20 * S(u * Math.PI * 2) * pulse(u, 0, 1), 0)],
  ...['tail1', 'tail2', 'tail3'].map((t, k) =>
    [t, 'rotation', (w, u) => quat(0, 30 * S(u * Math.PI * 2 - k * 0.5) * pulse(u, 0, 1), 0)]),
  ...both((n, s) => [[`wing_${n}`, 'rotation', (w, u) => quat(0, 0, -s * 10 * pulse(u, 0.2, 0.8))]]),
]);

// In-place walk on the clawed forelimbs: arms alternate, the reaching arm lifts at the elbow,
// body dips on each footfall (twice per cycle) and rolls toward the planted side.
clip('walk', 1.6, [
  ['hips', 'translation', (w) => rest('hips').map((v, i) => v + (i === 1 ? 0.5 * C(2 * w) : 0))],
  ['hips', 'rotation', (w) => quat(0, 4 * S(w), 3 * S(w))],
  ['spine', 'rotation', (w) => quat(2 * C(2 * w), -3 * S(w), 0)],
  ['neck', 'rotation', (w) => quat(-2 * C(2 * w + 0.5), -4 * S(w), 0)],
  ['head', 'rotation', (w) => quat(3 * C(2 * w + 1), 0, -3 * S(w))],
  ...both((n, s) => {
    const ph = n === 'L' ? 0 : Math.PI; // opposite arms
    return [
      [`shoulder_${n}`, 'rotation', (w) => quat(-28 * S(w + ph), 0, 0)],
      [`forearm_${n}`, 'rotation', (w) => quat(-22 * Math.max(0, C(w + ph)), 0, 0)], // bend while swinging forward
      [`hand_${n}`, 'rotation', (w) => quat(15 * Math.max(0, C(w + ph)) - 8 * Math.max(0, -C(w + ph)), 0, 0)],
      [`wing_${n}`, 'rotation', (w) => quat(0, 0, -s * (3 + 3 * C(2 * w)))],
    ];
  }),
  ...['tail1', 'tail2', 'tail3'].map((t, k) => [t, 'rotation', (w) => quat(2 * C(2 * w - k), -8 * S(w - k * 0.7), 0)]),
]);

// Strafing run: quick shallow wingbeats with the neck stretched out and the head aimed down at the
// ground ahead, arms tucked back, tail streaming straight behind. The Ashen Caldera egg breathes from it.
clip('fly_breath', .6, [
  ['hips', 'translation', bob(.4, -Math.PI / 2)],
  ['hips', 'rotation', () => quat(10, 0, 0)],
  ['spine', 'rotation', (w) => quat(5 + 2 * S(w + 1), 0, 0)],
  ['neck', 'rotation', (w) => quat(22 + 2 * S(w * 2), 0, 0)],
  ['head', 'rotation', (w) => quat(18 + 3 * S(w * 2 + 1), 0, 0)],
  ...both((n, s) => [
    [`wing_${n}`, 'rotation', (w) => quat(0, s * 12, -s * (14 + 12 * S(w)))],
    [`shoulder_${n}`, 'rotation', () => quat(35, 0, s * 10)],
    [`forearm_${n}`, 'rotation', () => quat(25, 0, 0)],
    [`hand_${n}`, 'rotation', () => quat(20, 0, 0)],
  ]),
  ...['tail1', 'tail2', 'tail3'].map((t, k) => [t, 'rotation', (w) => quat(-6 + 2 * S(w - k), 3 * S(w - k * .8), 0)]),
]);

await io.write(OUT, doc);
// The Ashen Caldera giant-meteor egg loads this copy.
await mkdir(dirname(GAME), { recursive: true });
await copyFile(OUT, GAME);
console.log(`wrote ${OUT}: ${BONES.length} bones, ${doc.getRoot().listAnimations().map((a) => a.getName()).join(', ')}`);
