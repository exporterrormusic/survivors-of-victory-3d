// Copies GAME_VERSION from src/version.ts into package.json as semver, so the desktop installer
// and the auto-updater compare the same number the main menu shows. "0.2" -> "0.2.0".
import { readFileSync, writeFileSync } from 'node:fs';

const source = readFileSync('src/version.ts', 'utf8');
const match = source.match(/GAME_VERSION\s*=\s*"([\d.]+)"/);
if (!match) throw new Error('GAME_VERSION not found in src/version.ts');
const parts = match[1].split('.');
while (parts.length < 3) parts.push('0');
const semver = parts.join('.');

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
if (pkg.version !== semver) {
  pkg.version = semver;
  writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
}
console.log(`version ${semver}`);
