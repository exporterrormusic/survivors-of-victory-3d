// Draw everything the level has loaded but keeps hidden (Rapture pools, effect pools, props that
// switch on later) for a few frames while the loading screen still covers the canvas. The first
// draw of a mesh is expensive: material defines, shader variants and, on Windows/ANGLE, the
// driver's per-draw setup. Paying it here keeps it out of the first minute of play, where it
// showed up as half-second hitches each time a new Rapture type or effect first appeared.

import type { AbstractMesh, RenderTargetTexture, Scene, TransformNode } from '@babylonjs/core';

const FRAMES = 3;

export async function warmUpRendering(scene: Scene, dormant: readonly RenderTargetTexture[] = []): Promise<void> {
  const nodes: TransformNode[] = [...scene.transformNodes, ...scene.meshes];
  const disabled = nodes.filter(node => !node.isEnabled(false));
  const hidden = scene.meshes.filter(mesh => !mesh.isVisible);
  const culled = scene.meshes.filter(mesh => !mesh.alwaysSelectAsActiveMesh);
  for (const node of disabled) node.setEnabled(true);
  for (const mesh of hidden) mesh.isVisible = true;
  // Pools park off-screen; draw them regardless of the camera.
  for (const mesh of culled) mesh.alwaysSelectAsActiveMesh = true;
  try {
    for (let i = 0; i < FRAMES; i++) {
      await scene.whenReadyAsync();
      // Passes that are switched off for now (the forest mist's depth turns on with the fog) still
      // need their shader variants for every mesh, or they compile on the first frame they run.
      // Before scene.render(): a depth pass skips meshes already drawn under the current render id.
      for (const target of dormant) target.render();
      scene.render();
      await new Promise(requestAnimationFrame);
    }
  } finally {
    for (const mesh of culled) (mesh as AbstractMesh).alwaysSelectAsActiveMesh = false;
    for (const mesh of hidden) mesh.isVisible = false;
    for (const node of disabled) node.setEnabled(false);
  }
}
