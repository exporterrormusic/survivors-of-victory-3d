// Copies GAME_VERSION from src/version.ts into package.json as semver, so the desktop installer
// and the auto-updater compare the same number the main menu shows. "0.2" -> "0.2.0".
// `--beta <n>` makes the CI test build instead: "0.2" -> "0.2.1-beta.<n>", above the current
// stable and below the next one, so experimental players move on to it when it ships.
import { readFileSync, writeFileSync } from 'node:fs';

const source = readFileSync('src/version.ts', 'utf8');
const match = source.match(/GAME_VERSION\s*=\s*"([\d.]+)"/);
if (!match) throw new Error('GAME_VERSION not found in src/version.ts');
const parts = match[1].split('.');
while (parts.length < 3) parts.push('0');
const betaAt = process.argv.indexOf('--beta');
const build = betaAt === -1 ? null : process.argv[betaAt + 1];
if (betaAt !== -1 && !/^\d+$/.test(build ?? '')) throw new Error('--beta needs a build number');
const semver = build === null ? parts.join('.') : `${parts[0]}.${parts[1]}.${Number(parts[2]) + 1}-beta.${build}`;

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
if (pkg.version !== semver) {
  pkg.version = semver;
  writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
}
console.log(`version ${semver}`);
