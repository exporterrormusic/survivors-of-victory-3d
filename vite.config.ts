import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';

// CI stamps VITE_GAME_VERSION itself; local runs (start.bat) fall back to the newest release tag.
if (!process.env.VITE_GAME_VERSION) {
  try {
    const tag = execSync('git describe --tags --abbrev=0 --match "v*"', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    if (tag) process.env.VITE_GAME_VERSION = tag.replace(/^v/, '');
  } catch {}
}

export default defineConfig({
  // Relative asset URLs: itch.io serves the web build from a sub-path, and a desktop wrapper serves it from its own root.
  base: './',
  optimizeDeps: {
    // Prebundle the engine entry points directly instead of crawling every
    // gameplay module and standalone HTML prototype during server startup.
    noDiscovery: true,
    include: ['phaser', '@babylonjs/core', '@babylonjs/loaders/glTF', '@babylonjs/inspector', '@babylonjs/serializers/glTF'],
  },
});
