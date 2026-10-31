// Prints one NOTICE entry (PATCH_RELEASES in src/frontend/scenes/MainMenuScene.ts) as Markdown,
// for the GitHub release page. Usage: node tools/notice-notes.mjs 0.1.4
// Exits non-zero when the version has no entry, so a push without notes fails the release build.
import { readFileSync } from 'node:fs';

const version = process.argv[2];
if (!version) throw new Error('usage: node tools/notice-notes.mjs <version>');
const source = readFileSync('src/frontend/scenes/MainMenuScene.ts', 'utf8');
const list = source.slice(source.indexOf('const PATCH_RELEASES'), source.indexOf('] as const;', source.indexOf('const PATCH_RELEASES')));
const start = list.indexOf(`version: "${version}"`);
if (start === -1) {
  console.error(`No NOTICE entry for ${version}: add one to PATCH_RELEASES in MainMenuScene.ts.`);
  process.exit(1);
}
const next = list.indexOf('version: "', start + 1);
const entry = list.slice(start, next === -1 ? undefined : next);
const unquote = (s) => JSON.parse(`"${s}"`);
const lines = [];
for (const [, heading, items] of entry.matchAll(/heading:\s*"((?:[^"\\]|\\.)*)",\s*items:\s*\[([\s\S]*?)\]/g)) {
  lines.push(`### ${unquote(heading)}`);
  for (const [, item] of items.matchAll(/"((?:[^"\\]|\\.)*)"/g)) lines.push(`- ${unquote(item)}`);
  lines.push('');
}
console.log(lines.join('\n').trim());
