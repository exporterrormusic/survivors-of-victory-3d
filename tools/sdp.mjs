// SDP1 -> standard animated GLB.
//
// SDP1 is the NIKKE chibi pack format served by NKAS (https://nkas.pages.dev/chibi/)
// and reused by Boom Arena. Layout:
//   "SDP1" | u32 LE headerLength | JSON header | payload
// The payload holds a GLB (mesh, skeleton, textures; already in glTF right-handed space)
// at header.glb = [offset, length], followed by one Float32 blob per animation clip
// (header.clips[name].off / .len, offsets relative to the payload start).
//
// Each clip channel is [boneIndex, kind, isConstant, floatOffset]:
//   kind 0 = translation (3 floats), 1 = rotation quaternion xyzw (4), 2 = scale (3)
//   isConstant 1 -> one value, 0 -> one value per frame (frames = clip.frames)
// Bone indices point into header.bones, which are node paths relative to header.root.
// The clip data is still in Unity's left-handed space, so (same as NKAS / Boom Arena):
//   translation (x, y, z)    -> (-x, y, z)
//   rotation    (x, y, z, w) -> (x, -y, -z, w)

import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';

export function readSdp(buf) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const magic = String.fromCharCode(...bytes.subarray(0, 4));
  if (magic !== 'SDP1') throw new Error(`not an SDP1 pack (magic "${magic}")`);
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const headerLen = dv.getUint32(4, true);
  const header = JSON.parse(new TextDecoder().decode(bytes.subarray(8, 8 + headerLen)));
  const base = 8 + headerLen;
  const [glbOff, glbLen] = header.glb;
  const glb = bytes.slice(base + glbOff, base + glbOff + glbLen);
  const clipData = (entry) => {
    const raw = bytes.slice(base + entry.off, base + entry.off + entry.len);
    return new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
  };
  return { header, glb, clipData };
}

const nameOf = (node) => node.getExtras()?.name ?? node.getName();

function nodePaths(root) {
  const map = new Map();
  (function walk(n, prefix) {
    for (const c of n.listChildren()) {
      const p = prefix ? `${prefix}/${nameOf(c)}` : nameOf(c);
      map.set(p, c);
      walk(c, p);
    }
  })(root, '');
  return map;
}

const PATHS = ['translation', 'rotation', 'scale'];
const WIDTH = [3, 4, 3];

function convert(kind, src, i) {
  if (kind === 0) return [-src[i], src[i + 1], src[i + 2]];
  if (kind === 1) return [src[i], -src[i + 1], -src[i + 2], src[i + 3]];
  return [src[i], src[i + 1], src[i + 2]];
}

/**
 * Convert an SDP1 pack to a GLB with one glTF animation per clip.
 * Returns { glb: Uint8Array, meta } where meta describes clips for the game runtime.
 */
export async function sdpToGlb(buf) {
  const { header, glb, clipData } = readSdp(buf);
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const doc = await io.readBinary(glb);
  const scene = doc.getRoot().listScenes()[0];
  const root = scene.listChildren().find((n) => nameOf(n) === header.root);
  if (!root) throw new Error(`root node ${header.root} not found`);
  const byPath = nodePaths(root);
  const buffer = doc.getRoot().listBuffers()[0];

  // Every node any clip touches, with its rest value, so each clip can be made complete:
  // without this, a bone a clip doesn't drive keeps whatever pose the previous clip left.
  const driven = new Map(); // "path|kind" -> [node, kind]
  for (const entry of Object.values(header.clips)) {
    for (const [bi, kind] of entry.channels) {
      const node = byPath.get(header.bones[bi]);
      if (node) driven.set(`${header.bones[bi]}|${kind}`, [node, kind]);
    }
  }
  const restValue = (node, kind) =>
    kind === 0 ? node.getTranslation() : kind === 1 ? node.getRotation() : node.getScale();

  const sampleClipYaw = yawSampler(doc, scene, header, byPath);
  const missing = new Set();
  const clips = {};
  for (const [name, entry] of Object.entries(header.clips)) {
    const data = clipData(entry);
    const frames = entry.frames;
    const times = new Float32Array(frames);
    for (let f = 0; f < frames; f++) times[f] = f / entry.fps;
    const keyTimes = new Float32Array([0, times[frames - 1] || 1 / entry.fps]);

    const anim = doc.createAnimation(name);
    const input = doc.createAccessor(`${name}_t`, buffer).setType('SCALAR').setArray(times);
    const input2 = doc.createAccessor(`${name}_t2`, buffer).setType('SCALAR').setArray(keyTimes);

    const covered = new Set();
    for (const [bi, kind, cst, off] of entry.channels) {
      const path = header.bones[bi];
      const node = byPath.get(path);
      if (!node) { missing.add(path); continue; }
      covered.add(`${path}|${kind}`);
      const w = WIDTH[kind];
      const n = cst ? 1 : frames;
      const out = new Float32Array((cst ? 2 : frames) * w);
      for (let f = 0; f < n; f++) out.set(convert(kind, data, off + f * w), f * w);
      if (cst) out.copyWithin(w, 0, w);
      addChannel(doc, anim, buffer, node, kind, cst ? input2 : input, out, `${name}_${bi}_${kind}`);
    }
    for (const [key, [node, kind]] of driven) {
      if (covered.has(key)) continue;
      const v = restValue(node, kind);
      addChannel(doc, anim, buffer, node, kind, input2, new Float32Array([...v, ...v]), `${name}_rest_${key}`);
    }

    clips[name] = {
      duration: (frames - 1) / entry.fps,
      frames,
      fps: entry.fps,
      loop: !!entry.loop,
      frontYaw: entry.frontYaw ?? header.frontYaw ?? null,
      hide: entry.hide ?? [],
      ...facingInfo(sampleClipYaw(entry, data)),
    };
  }

  const meta = {
    variant: header.variant,
    root: header.root,
    hips: header.hips,
    frontYaw: header.frontYaw ?? null,
    parts: header.parts,
    clips,
    missingBones: [...missing],
  };
  scene.setExtras({ ...scene.getExtras(), nikkeChibi: meta });
  return { glb: await io.writeBinary(doc), meta };
}

// --- facing analysis --------------------------------------------------------------
// The clips are authored for NIKKE's camera, not for a "forward" axis: lobby clips
// (idle/run/talk) face the camera, cover-shooter clips (aim_*, cover_shot) aim away from it,
// and aim_start/aim_end turn ~100° in between. The header's frontYaw tracks the body, which
// stands side-on for rifles, so it can't be used as forward either.
// Instead we pose each clip at a few frames and measure two directions on the ground plane:
//   head: eye bones' centroid minus the head bone; models without eye bones use the head bone's
//         local +Y, which tracks the eyes within ~10° on every biped rig that has both
//   gun:  weapon centroid to the muzzle, the weapon vertex furthest forward along the head
//         direction. (Not "farthest from the head": a minigun's or mech cannon's back end is
//         often farther than its barrel, which turned those models around.)
// Each is a yaw in glTF space, degrees, atan2(x, z): 0 = +Z, 90 = +X. A runtime turns the
// model by minus that yaw (in its own convention) to make the clip face forward.

const YAW_SAMPLES = 9;

const facingInfo = ({ head, gun, muzzle }) => ({ yaw: { head, gun }, muzzle });

function yawSampler(doc, scene, header, byPath) {
  const parent = new Map();
  (function walk(n) {
    for (const c of n.listChildren()) { parent.set(c, n); walk(c); }
  })(scene);
  const rest = new Map();
  for (const n of parent.keys()) rest.set(n, [n.getTranslation(), n.getRotation(), n.getScale()]);

  const headEntry = [...byPath].find(([p]) => p.endsWith('/Bip001 Head'));
  const head = headEntry?.[1];
  const eyes = head
    ? [...byPath]
        .filter(([p]) => p.startsWith(headEntry[0] + '/') && /eye/i.test(p.slice(p.lastIndexOf('/') + 1)))
        .map(([, n]) => n)
    : [];
  const weapons = collectWeapons(doc);
  return (entry, data) => sampleYaw({ header, byPath, parent, rest, head, eyes, weapons }, entry, data);
}

function sampleYaw({ header, byPath, parent, rest, head, eyes, weapons }, entry, data) {
  const samples = Math.min(entry.frames, YAW_SAMPLES);
  const mid = samples >> 1;
  const headYaw = [];
  const gunYaw = [];
  let muzzle = null;
  for (let s = 0; s < samples; s++) {
    const f = samples > 1 ? Math.round((s * (entry.frames - 1)) / (samples - 1)) : 0;
    const pose = new Map(rest);
    for (const [bi, kind, cst, off] of entry.channels) {
      const node = byPath.get(header.bones[bi]);
      if (!node) continue;
      const trs = [...pose.get(node)];
      trs[kind] = convert(kind, data, off + (cst ? 0 : f * WIDTH[kind]));
      pose.set(node, trs);
    }
    const memo = new Map();
    const world = (n) => {
      if (!pose.has(n)) return IDENTITY;
      let m = memo.get(n);
      if (!m) {
        const [t, r, sc] = pose.get(n);
        m = mul(world(parent.get(n)), fromTRS(t, r, sc));
        memo.set(n, m);
      }
      return m;
    };

    if (!head) continue;
    const h = world(head);
    let fx, fz;
    if (eyes.length) {
      let x = 0, z = 0;
      for (const e of eyes) { const m = world(e); x += m[12]; z += m[14]; }
      fx = x / eyes.length - h[12]; fz = z / eyes.length - h[14];
    } else {
      fx = h[4]; fz = h[6]; // head bone local +Y (column-major)
    }
    headYaw.push(yawDeg(fx, fz));
    if (weapons.length) {
      let best = -Infinity, tipXZ = null, tip = null, cx = 0, cz = 0, n = 0;
      for (const w of weapons) {
        const mats = w.joints.map((j, i) => mul(world(j), w.ibm[i]));
        for (const v of w.verts) {
          let x = 0, z = 0;
          for (let k = 0; k < 4; k++) {
            if (!v.w[k]) continue;
            const m = mats[v.j[k]];
            x += v.w[k] * (m[0] * v.p[0] + m[4] * v.p[1] + m[8] * v.p[2] + m[12]);
            z += v.w[k] * (m[2] * v.p[0] + m[6] * v.p[1] + m[10] * v.p[2] + m[14]);
          }
          cx += x; cz += z; n++;
          const ahead = (x - h[12]) * fx + (z - h[14]) * fz;
          if (ahead > best) { best = ahead; tipXZ = [x, z]; tip = [w, v]; }
        }
      }
      gunYaw.push(yawDeg(tipXZ[0] - cx / n, tipXZ[1] - cz / n));
      if (s === mid) muzzle = muzzleRef(...tip);
    }
  }
  return { head: headYaw.length ? headYaw : null, gun: gunYaw.length ? gunYaw : null, muzzle };
}

/**
 * The gun tip (weapon vertex farthest from the head) in its main joint's local space, so a
 * runtime can follow it: tipWorld = jointWorld * offset. Rigid weapons make this pose-independent.
 */
function muzzleRef(w, v) {
  let k = 0;
  for (let i = 1; i < 4; i++) if (v.w[i] > v.w[k]) k = i;
  const m = w.ibm[v.j[k]];
  const [x, y, z] = v.p;
  const r = (n) => Math.round(n * 1e4) / 1e4;
  return {
    joint: w.joints[v.j[k]].getName(),
    offset: [
      r(m[0] * x + m[4] * y + m[8] * z + m[12]),
      r(m[1] * x + m[5] * y + m[9] * z + m[13]),
      r(m[2] * x + m[6] * y + m[10] * z + m[14]),
    ],
  };
}

function collectWeapons(doc) {
  const out = [];
  for (const node of doc.getRoot().listNodes()) {
    const skin = node.getSkin();
    const mesh = node.getMesh();
    const role = node.getExtras()?.role ?? node.getName();
    if (!skin || !mesh || !/weapon/i.test(role)) continue;
    const ibmAcc = skin.getInverseBindMatrices();
    const joints = skin.listJoints();
    const ibm = joints.map((_, i) => (ibmAcc ? ibmAcc.getElement(i, []) : IDENTITY));
    const verts = [];
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION');
      const jo = prim.getAttribute('JOINTS_0');
      const we = prim.getAttribute('WEIGHTS_0');
      if (!pos || !jo || !we) continue;
      for (let i = 0; i < pos.getCount(); i++) {
        verts.push({ p: pos.getElement(i, []), j: jo.getElement(i, []), w: we.getElement(i, []) });
      }
    }
    out.push({ joints, ibm, verts });
  }
  return out;
}

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

const yawDeg = (x, z) => Math.round((Math.atan2(x, z) * 1800) / Math.PI) / 10;

// column-major 4x4, as glTF stores them
function fromTRS(t, q, s) {
  const [x, y, z, w] = q;
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;
  return [
    (1 - (yy + zz)) * s[0], (xy + wz) * s[0], (xz - wy) * s[0], 0,
    (xy - wz) * s[1], (1 - (xx + zz)) * s[1], (yz + wx) * s[1], 0,
    (xz + wy) * s[2], (yz - wx) * s[2], (1 - (xx + yy)) * s[2], 0,
    t[0], t[1], t[2], 1,
  ];
}

function mul(a, b) {
  const o = new Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
  }
  return o;
}

function addChannel(doc, anim, buffer, node, kind, input, out, id) {
  const output = doc.createAccessor(`${id}_v`, buffer).setType(kind === 1 ? 'VEC4' : 'VEC3').setArray(out);
  const sampler = doc.createAnimationSampler().setInput(input).setOutput(output).setInterpolation('LINEAR');
  const channel = doc.createAnimationChannel().setTargetNode(node).setTargetPath(PATHS[kind]).setSampler(sampler);
  anim.addSampler(sampler).addChannel(channel);
}
