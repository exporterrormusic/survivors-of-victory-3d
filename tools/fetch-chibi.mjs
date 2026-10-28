// Download NIKKE chibi packs from NKAS and convert them to animated GLBs for the game.
//
//   node tools/fetch-chibi.mjs                 # download the default character roster
//   node tools/fetch-chibi.mjs c010_00 c011_00 # any variant ids from the NKAS manifest
//   node tools/fetch-chibi.mjs --list c470     # search the manifest by model id
//
// Raw packs are cached in raw/ so re-running only converts. Output: public/chibi/<id>.glb
// plus public/chibi/index.json (clip list, durations, facing offsets) for the runtime.

import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sdpToGlb } from './sdp.mjs';

const HOST = 'https://nkas-chibis.pages.dev';
const ICON_HOST = 'https://nkas.pages.dev';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RAW = join(ROOT, 'raw');
const OUT = join(ROOT, 'public', 'chibi');

// All available field-model appearances for the roster, plus Red Hood (hidden).
// Character names/ids: https://nkas-l2d.pages.dev/characters.json
// Hero field models referenced by src/characters/*/index.ts (plus Red Hood, currently hidden).
const DEFAULT = ['c220_00', 'c220_01', 'c224_00', 'c471_00', 'c470_00', 'c221_00', 'c222_00',
  'c222_01', 'c225_00', 'c225_01', 'c226_00', 'c223_00', 'c223_01',
  'c013_00', 'c260_00', 'c260_01', 'c260_02', 'c330_00', 'c330_01', 'c330_02',
  'c361_00', 'c401_00', 'c401_01', 'c405_00', 'c302_00',
  'c261_00']; // Nihilister: forest easter egg
const MINIONS = JSON.parse(await readFile(join(ROOT, 'src', 'minion-roster.json'), 'utf8')).map(unit => unit.id);

const exists = (p) => access(p).then(() => true, () => false);

async function getJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return r.json();
}

/** Face icon (NKAS's roster sprite) for HUD portraits and the minimap. */
async function fetchIcon(id) {
  const out = join(OUT, `${id}_icon.png`);
  if (await exists(out)) return true;
  for (const dir of ['characters', 'characters_missing_si']) {
    const r = await fetch(`${ICON_HOST}/${dir}/si_${id}_s.png`);
    if (r.ok) {
      await writeFile(out, new Uint8Array(await r.arrayBuffer()));
      return true;
    }
  }
  console.warn(`no icon for ${id}`);
  return false;
}

async function main() {
  const args = process.argv.slice(2);
  const manifest = await getJson(`${HOST}/manifest.json`);

  if (args[0] === '--list') {
    const q = (args[1] || '').toLowerCase();
    for (const [id, v] of Object.entries(manifest.variants)) {
      if (!q || id.includes(q)) console.log(id, Object.keys(v.clips).join(' '));
    }
    return;
  }

  const ids = args[0] === '--minions' ? MINIONS : args.length ? args : [...DEFAULT, ...MINIONS];
  await mkdir(RAW, { recursive: true });
  await mkdir(OUT, { recursive: true });
  const indexPath = join(OUT, 'index.json');
  const index = (await exists(indexPath)) ? JSON.parse(await readFile(indexPath, 'utf8')) : { variants: {} };

  for (const id of ids) {
    const v = manifest.variants[id];
    if (!v) { console.warn(`skip ${id}: not in NKAS manifest`); continue; }
    const rawPath = join(RAW, `${id}.sdp`);
    if (!(await exists(rawPath))) {
      const r = await fetch(`${HOST}/${v.pack}`);
      if (!r.ok) throw new Error(`${v.pack}: HTTP ${r.status}`);
      await writeFile(rawPath, new Uint8Array(await r.arrayBuffer()));
      console.log(`downloaded ${v.pack}`);
    }
    const { glb, meta } = await sdpToGlb(await readFile(rawPath));
    await writeFile(join(OUT, `${id}.glb`), glb);
    const icon = (await fetchIcon(id)) ? `${id}_icon.png` : null;
    index.variants[id] = { file: `${id}.glb`, icon, ...meta };
    const warn = meta.missingBones.length ? ` (${meta.missingBones.length} unbound bones)` : '';
    console.log(`${id}.glb  ${(glb.byteLength / 1024).toFixed(0)} KB  clips: ${Object.keys(meta.clips).join(', ')}${warn}`);
  }

  index.generated = new Date().toISOString();
  index.source = `${HOST} (NKAS by skuqre); models (c) SHIFT UP`;
  await writeFile(indexPath, JSON.stringify(index, null, 1));
}

main().catch((e) => { console.error(e); process.exit(1); });
