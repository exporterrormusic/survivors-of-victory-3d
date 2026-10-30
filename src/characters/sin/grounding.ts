import { Matrix, Vector3, type AbstractMesh } from '@babylonjs/core';
import type { Chibi } from '../../chibi';

/** Correct Swift Bunny's authored boot penetration without moving the gameplay collider. */
export class SwiftBunnyGrounding {
  private readonly meshes: { mesh: AbstractMesh; feet: number[] }[] = [];

  constructor(private readonly chibi: Chibi) {
    if (chibi.meta.variant !== 'c405_00') return;
    for (const mesh of chibi.meshes) {
      if (!mesh.skeleton || mesh.name !== 'c405_00_skin') continue;
      const feet = new Set(mesh.skeleton.bones.filter(bone => /Foot|Toe/.test(bone.name)).map(bone => bone.getIndex()));
      const joints = mesh.getVerticesData('matricesIndices'), weights = mesh.getVerticesData('matricesWeights');
      if (!joints || !weights) continue;
      const vertices: number[] = [];
      for (let i = 0; i < mesh.getTotalVertices(); i++) {
        if ([0, 1, 2, 3].some(k => feet.has(joints[i * 4 + k]) && weights[i * 4 + k] > .25)) vertices.push(i);
      }
      this.meshes.push({ mesh, feet: vertices });
    }
  }

  apply(): void {
    if (!this.meshes.length) return;
    const toRoot = Matrix.Invert(this.chibi.root.computeWorldMatrix(true));
    const point = new Vector3();
    let lowest = Infinity;
    for (const { mesh, feet } of this.meshes) {
      mesh.skeleton!.prepare(true);
      const posed = mesh.getPositionData(true, false);
      if (!posed) continue;
      const transform = mesh.computeWorldMatrix(true).multiply(toRoot);
      for (const vertex of feet) {
        Vector3.TransformCoordinatesFromFloatsToRef(posed[vertex * 3], posed[vertex * 3 + 1], posed[vertex * 3 + 2], transform, point);
        lowest = Math.min(lowest, point.y);
      }
    }
    // Keep authored airborne steps; only lift when a sole would penetrate.
    if (Number.isFinite(lowest)) {
      this.chibi.root.position.y = Math.max(0, .002 - lowest);
      this.chibi.root.computeWorldMatrix(true);
    }
  }
}
