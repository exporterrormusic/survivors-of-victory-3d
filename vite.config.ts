import { defineConfig } from 'vite';

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
