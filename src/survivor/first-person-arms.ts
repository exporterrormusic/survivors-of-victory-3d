import { Mesh, SubMesh, type AbstractMesh } from '@babylonjs/core';

/** Scarlet's third-person sleeves and hands sweep across the eyes during locomotion.
 * Hide that geometry in first person, leaving the separately rigged sword intact.
 * Index buffers change only when entering/leaving the view, never every frame. */
export function firstPersonArms(meshes: readonly AbstractMesh[]): (hidden: boolean) => void {
  const entries = meshes.flatMap(mesh => {
    if (!(mesh instanceof Mesh) || !mesh.skeleton) return [];
    const indices = mesh.getIndices(), joints = mesh.getVerticesData('matricesIndices'), weights = mesh.getVerticesData('matricesWeights');
    if (!indices || !joints || !weights) return [];
    const armBones = new Set<number>();
    for (const bone of mesh.skeleton.bones) {
      for (let parent: typeof bone | null = bone; parent; parent = parent.getParent()) {
        // Weapons parented below a hand must not inherit the arm mask.
        if (/prop|weapon|sword|katana/i.test(parent.name)) break;
        if (/clavicle|upperarm|forearm|hand|finger/i.test(parent.name)) { armBones.add(bone.getIndex()); break; }
      }
    }
    const arm = (vertex: number) => {
      let influence = 0;
      for (let k = 0; k < 4; k++) if (armBones.has(joints[vertex * 4 + k])) influence += weights[vertex * 4 + k];
      return influence > .05;
    };
    const original = Array.from(indices), filtered: number[] = [];
    const ranges = mesh.subMeshes.map(sub => ({ material: sub.materialIndex, vertex: sub.verticesStart,
      vertices: sub.verticesCount, start: sub.indexStart, count: sub.indexCount, maskedStart: 0, maskedCount: 0 }));
    for (const range of ranges) {
      range.maskedStart = filtered.length;
      for (let i = range.start; i < range.start + range.count; i += 3) {
        if (![original[i], original[i + 1], original[i + 2]].some(arm)) filtered.push(original[i], original[i + 1], original[i + 2]);
      }
      range.maskedCount = filtered.length - range.maskedStart;
    }
    if (filtered.length === original.length) return [];
    mesh.makeGeometryUnique();
    return [{ mesh, original, filtered, ranges }];
  });
  let current = false;
  return hidden => {
    if (hidden === current) return;
    current = hidden;
    for (const {mesh, original, filtered, ranges} of entries) {
      if (mesh.isDisposed()) continue;
      mesh.setIndices(hidden ? filtered : original);
      mesh.releaseSubMeshes();
      for (const range of ranges) {
        const count = hidden ? range.maskedCount : range.count;
        if (count) new SubMesh(range.material, range.vertex, range.vertices,
          hidden ? range.maskedStart : range.start, count, mesh);
      }
    }
  };
}
