// Copies RELEASE_VERSION from src/version.ts into package.json as semver, so the desktop installer
// and the auto-updater compare the same number the main menu shows. "0.2" -> "0.2.0".
// `--build <n>` makes a CI test build instead: "0.2" -> "0.2.<n>". That is above the hand-made
// "0.2.0", and the next release ("0.3.0") is above every 0.2 test build.
import { readFileSync, writeFileSync } from 'node:fs';

const source = readFileSync('src/version.ts', 'utf8');
const match = source.match(/RELEASE_VERSION\s*=\s*"([\d.]+)"/);
if (!match) throw new Error('RELEASE_VERSION not found in src/version.ts');
const parts = match[1].split('.');
while (parts.length < 3) parts.push('0');
const buildAt = process.argv.indexOf('--build');
const build = buildAt === -1 ? null : process.argv[buildAt + 1];
if (buildAt !== -1 && !/^\d+$/.test(build ?? '')) throw new Error('--build needs a build number');
const semver = build === null ? parts.join('.') : `${parts[0]}.${parts[1]}.${build}`;

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
if (pkg.version !== semver) {
  pkg.version = semver;
  writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
}
console.log(`version ${semver}`);
