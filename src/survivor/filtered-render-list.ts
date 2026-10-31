import type { AbstractMesh, RenderTargetTexture, Scene } from '@babylonjs/core';

/**
 * A render target's renderListPredicate, without its per-frame cost. Babylon applies a predicate by
 * emptying the list and pushing matches back, and the first push onto an empty list marks the
 * lighting of every mesh in the scene dirty, so every material re-prepares its defines each frame.
 * Refilling the same array by index keeps the filter live (flags may change at any time) without
 * touching the list's change hooks. Returns a function that stops the refill.
 */
export function filterRenderList(scene: Scene, target: RenderTargetTexture, keep: (mesh: AbstractMesh) => boolean): () => void {
  target.renderList = [];
  const refill = () => {
    const list = target.renderList;
    if (!list) return;
    let n = 0;
    for (const mesh of scene.meshes) if (keep(mesh)) list[n++] = mesh;
    list.length = n;
  };
  refill();
  const observer = scene.onBeforeRenderObservable.add(refill);
  return () => { scene.onBeforeRenderObservable.remove(observer); };
}
