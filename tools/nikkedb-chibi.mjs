// Build a game chibi from a nikke-db field model (tools/nikkedb-extract.py output) plus a donor
// NKAS pack, for heroes NKAS doesn't serve (Legendary Commander c5028_00, Liliweiss c5029_00).
//
//   node tools/nikkedb-chibi.mjs <variant> <extract-dir> <donor-variant> [--icon <nkas-icon-id>]
//
// The nikke-db models are NPCs: mesh, skeleton and idle/walk/talk clips only. They share the Bip001
// biped with playable NIKKEs, so they borrow the donor's whole clip set (aim, shot, reload, run,
// ...) and its weapon, which rides the donor's animated Bip001 Prop1 bone. Donor clips are baked
// for the donor's proportions, so only rotations transfer; hip and Prop1 translations are scaled
// by hip height and every other bone keeps the new model's rest offsets.
// The result is packed as SDP1 and converted by sdp.mjs, exactly like an NKAS download.

import { readFile, writeFile, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, KHRMaterialsUnlit } from '@gltf-transform/extensions';
import { readSdp, sdpToGlb } from './sdp.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'chibi');
const HIPS = 'Bip001/Bip001 Pelvis';
/** Translation channels that move the body or carry the weapon; the rest stay at the new rest pose. */
const SCALED_TRANSLATIONS = new Set(['Bip001', HIPS, 'Bip001/Bip001 Pelvis/Bip001 Spine/Bip001 Prop1']);

// Unity is left-handed; glTF right-handed. Mirror X (same rules as sdp.mjs for clip data).
const pos = ([x, y, z]) => [-x, y, z];
const rot = ([x, y, z, w]) => [x, -y, -z, w];
/** Column-major 4x4 with X mirrored on both sides: element (r, c) flips sign when exactly one is the X axis. */
const mirrorMatrix = (m) => m.map((v, i) => ((i % 4 === 0) !== (Math.floor(i / 4) === 0) ? -v : v));

const nameOf = (node) => node.getExtras()?.name ?? node.getName();

async function main() {
  const [variant, dir, donorId, ...rest] = process.argv.slice(2);
  if (!variant || !dir || !donorId) throw new Error('usage: nikkedb-chibi.mjs <variant> <extract-dir> <donor-variant> [--icon <id>]');
  const iconId = rest[rest.indexOf('--icon') + 1] && rest.includes('--icon') ? rest[rest.indexOf('--icon') + 1] : null;
  const model = JSON.parse(await readFile(join(dir, 'model.json'), 'utf8'));
  const donor = readSdp(await readFile(join(ROOT, 'raw', `${donorId}.sdp`)));
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const donorDoc = await io.readBinary(donor.glb);

  // --- the new model's GLB ---------------------------------------------------------------
  const doc = new Document();
  const buffer = doc.createBuffer();
  const scene = doc.createScene();
  const unlit = doc.createExtension(KHRMaterialsUnlit);
  const nodes = model.nodes.map((n) => doc.createNode(n.name).setTranslation(pos(n.t)).setRotation(rot(n.r)).setScale(n.s));
  model.nodes.forEach((n, i) => (n.parent < 0 ? scene.addChild(nodes[i]) : nodes[n.parent].addChild(nodes[i])));
  const byPath = new Map(model.nodes.map((n, i) => [n.path.slice(model.root.length + 1), nodes[i]]));

  const parts = [];
  for (const part of model.parts) {
    const count = part.positions.length;
    const flat = (rows, map = (v) => v) => new Float32Array(rows.flatMap((v) => map(v)));
    const indices = new Uint32Array(part.indices.length);
    for (let i = 0; i < part.indices.length; i += 3) indices.set([part.indices[i], part.indices[i + 2], part.indices[i + 1]], i); // mirrored: flip winding
    const weights = part.weights.map((w) => { const s = w.reduce((a, b) => a + b, 0) || 1; return w.map((v) => v / s); });
    const prim = doc.createPrimitive()
      .setAttribute('POSITION', doc.createAccessor().setBuffer(buffer).setType('VEC3').setArray(flat(part.positions, pos)))
      .setAttribute('NORMAL', doc.createAccessor().setBuffer(buffer).setType('VEC3').setArray(flat(part.normals, pos)))
      .setAttribute('TEXCOORD_0', doc.createAccessor().setBuffer(buffer).setType('VEC2').setArray(flat(part.uv, ([u, v]) => [u, 1 - v])))
      .setAttribute('JOINTS_0', doc.createAccessor().setBuffer(buffer).setType('VEC4').setArray(new Uint16Array(part.joints.flat())))
      .setAttribute('WEIGHTS_0', doc.createAccessor().setBuffer(buffer).setType('VEC4').setArray(flat(weights)))
      .setIndices(doc.createAccessor().setBuffer(buffer).setType('SCALAR').setArray(indices));
    const material = doc.createMaterial(part.material ?? part.node).setExtension('KHR_materials_unlit', unlit.createUnlit());
    if (part.texture) {
      const image = await readFile(join(dir, part.texture));
      const texture = doc.createTexture(part.material ?? part.node).setImage(image).setMimeType('image/png');
      material.setBaseColorTexture(texture);
      const size = texture.getSize();
      material.setExtras({ texture: { name: part.material, w: size?.[0], h: size?.[1] } });
    }
    prim.setMaterial(material);
    const skin = doc.createSkin()
      .setInverseBindMatrices(doc.createAccessor().setBuffer(buffer).setType('MAT4').setArray(new Float32Array(part.bindposes.flatMap(mirrorMatrix))));
    for (const bone of part.bones) skin.addJoint(nodes[model.nodes.findIndex((n) => n.path === bone)]);
    scene.addChild(doc.createNode(part.node).setMesh(doc.createMesh(part.node).addPrimitive(prim)).setSkin(skin)
      .setExtras({ role: 'skin', skinned: true }));
    parts.push({ role: 'skin', node: part.node, verts: count, tris: indices.length / 3, bones: part.bones.length, material: part.material, skinned: true });
  }

  // --- the donor's weapon, rigid on Bip001 Prop1 -------------------------------------------
  const donorParts = donor.header.parts.filter((p) => p.role !== 'skin');
  for (const info of donorParts) {
    // A bone node can share the part's name; take the one that carries the mesh.
    const src = donorDoc.getRoot().listNodes().find((n) => nameOf(n) === info.node && n.getMesh());
    const srcSkin = src?.getSkin();
    if (!src || !srcSkin) { console.warn(`skip ${info.node}: no skinned mesh in ${donorId}`); continue; }
    const mesh = doc.createMesh(info.node);
    for (const p of src.getMesh().listPrimitives()) {
      const prim = doc.createPrimitive();
      for (const semantic of p.listSemantics()) {
        const a = p.getAttribute(semantic);
        prim.setAttribute(semantic, doc.createAccessor().setBuffer(buffer).setType(a.getType()).setArray(a.getArray().slice()));
      }
      prim.setIndices(doc.createAccessor().setBuffer(buffer).setType('SCALAR').setArray(p.getIndices().getArray().slice()));
      const m = p.getMaterial();
      const material = doc.createMaterial(m.getName()).setExtension('KHR_materials_unlit', unlit.createUnlit()).setExtras(m.getExtras());
      const t = m.getBaseColorTexture();
      if (t) material.setBaseColorTexture(doc.createTexture(t.getName()).setImage(t.getImage().slice()).setMimeType(t.getMimeType()));
      prim.setMaterial(material);
      mesh.addPrimitive(prim);
    }
    const skin = doc.createSkin().setInverseBindMatrices(doc.createAccessor().setBuffer(buffer).setType('MAT4')
      .setArray(srcSkin.getInverseBindMatrices().getArray().slice()));
    let ok = true;
    for (const joint of srcSkin.listJoints()) {
      const path = [...nodePaths(donorDoc, donor.header.root)].find(([, n]) => n === joint)?.[0];
      const target = path && byPath.get(path);
      if (!target) { ok = false; break; }
      skin.addJoint(target);
    }
    if (!ok) { console.warn(`skip ${info.node}: its bones are not in ${variant}`); continue; }
    scene.addChild(doc.createNode(info.node).setMesh(mesh).setSkin(skin).setExtras({ role: info.role, skinned: true }));
    parts.push({ ...info });
  }

  // --- donor clips, re-targeted by bone path ------------------------------------------------
  const restY = (path) => { // world-space height of a bone at rest, within the model root
    let y = 0, node = byPath.get(path);
    const chain = [];
    for (let p = path; p; p = p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '') chain.unshift(byPath.get(p));
    // Bip001 chains are near-axis-aligned at rest; summing local Y is accurate enough for a ratio.
    for (const n of chain) y += n?.getTranslation()[1] ?? 0;
    return node ? y : null;
  };
  const donorPaths = nodePaths(donorDoc, donor.header.root);
  const donorRestY = (path) => {
    let y = 0;
    for (let p = path; p; p = p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '') y += donorPaths.get(p)?.getTranslation()[1] ?? 0;
    return y;
  };
  const scale = (restY(HIPS) ?? 1) / (donorRestY(HIPS) || 1);

  const bones = [];
  const boneIndex = new Map();
  const clipBlobs = [];
  const clips = {};
  let offset = 0;
  for (const [name, entry] of Object.entries(donor.header.clips)) {
    const data = donor.clipData(entry);
    const out = [];
    const channels = [];
    for (const [bi, kind, cst, off] of entry.channels) {
      const path = donor.header.bones[bi];
      if (!byPath.has(path) || kind === 2) continue;
      if (kind === 0 && !SCALED_TRANSLATIONS.has(path)) continue;
      if (!boneIndex.has(path)) { boneIndex.set(path, bones.length); bones.push(path); }
      const width = kind === 1 ? 4 : 3, frames = cst ? 1 : entry.frames;
      const at = out.length;
      for (let f = 0; f < frames; f++) {
        const v = Array.from(data.subarray(off + f * width, off + (f + 1) * width));
        out.push(...(kind === 0 ? v.map((x) => x * scale) : v));
      }
      channels.push([boneIndex.get(path), kind, cst, at]);
    }
    const blob = new Float32Array(out);
    clipBlobs.push(blob);
    const { channels: _, off: __, len: ___, ...meta } = entry;
    clips[name] = { ...meta, channels, off: offset, len: blob.byteLength };
    offset += blob.byteLength;
  }

  const glb = await io.writeBinary(doc);
  // Clip offsets in SDP1 are relative to the payload start, which begins with the GLB.
  for (const c of Object.values(clips)) c.off += glb.byteLength;
  const header = { variant, glb: [0, glb.byteLength], root: model.root, hips: HIPS, parts, frontYaw: donor.header.frontYaw,
    bones, clips, source: `nikke-db field model + ${donorId} clips` };
  const json = new TextEncoder().encode(JSON.stringify(header));
  const sdp = new Uint8Array(8 + json.length + glb.byteLength + offset);
  sdp.set(new TextEncoder().encode('SDP1'), 0);
  new DataView(sdp.buffer).setUint32(4, json.length, true);
  sdp.set(json, 8);
  sdp.set(glb, 8 + json.length);
  let at = 8 + json.length + glb.byteLength;
  for (const blob of clipBlobs) { sdp.set(new Uint8Array(blob.buffer), at); at += blob.byteLength; }
  await writeFile(join(ROOT, 'raw', `${variant}.sdp`), sdp);

  const { glb: game, meta } = await sdpToGlb(sdp);
  await writeFile(join(OUT, `${variant}.glb`), game);
  let icon = null;
  if (iconId) {
    const r = await fetch(`https://nkas.pages.dev/characters/si_${iconId}_s.png`);
    if (r.ok) { icon = `${variant}_icon.png`; await writeFile(join(OUT, icon), new Uint8Array(await r.arrayBuffer())); }
  }
  const indexPath = join(OUT, 'index.json');
  const index = (await access(indexPath).then(() => true, () => false)) ? JSON.parse(await readFile(indexPath, 'utf8')) : { variants: {} };
  index.variants[variant] = { file: `${variant}.glb`, icon, ...meta };
  await writeFile(indexPath, JSON.stringify(index, null, 1));
  console.log(`${variant}.glb ${(game.byteLength / 1024).toFixed(0)} KB, hip scale ${scale.toFixed(3)}, clips: ${Object.keys(meta.clips).join(', ')}`);
}

function nodePaths(doc, rootName) {
  const root = doc.getRoot().listScenes()[0].listChildren().find((n) => nameOf(n) === rootName);
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

main().catch((e) => { console.error(e); process.exit(1); });
