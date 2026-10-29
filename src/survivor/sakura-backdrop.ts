import { Mesh, Texture, TransformNode, type Material, type Scene } from '@babylonjs/core';
import { createSakuraTree } from '../sakura';
import { createEnvironmentProp } from '../environment-kit';
import { sakuraBackdropPlacements } from './sakura-layout';
import { RangeMaterials } from './range-materials';

/** Hidden preparation, then a single cinematic lifetime; no gameplay draw calls. */
export class SakuraBackdrop {
  readonly ready: Promise<void>;
  private readonly root: TransformNode;
  private readonly materials = new Set<Material>();
  private readonly ownedMaterials = new Set<Material>();
  private disposed = false;
  constructor(scene: Scene) {
    this.root = new TransformNode('sakura-cinematic-backdrop', scene);
    this.root.setEnabled(false);
    const trees = createSakuraTree(scene);
    for (const mesh of trees.getChildMeshes()) if (mesh.material) this.ownedMaterials.add(mesh.material);
    const rocks = createEnvironmentProp(scene, 'rock-boulder', 'mossy');
    // Match the actual garden: raw kit props use flat placeholder colors until painted.
    const painter = new RangeMaterials(scene);
    painter.paint(trees, 'sakura', 'mossy');
    painter.paint(rocks, 'rock-boulder', 'mossy');
    for (const mesh of [...trees.getChildMeshes(), ...rocks.getChildMeshes()])
      if (mesh.material) this.ownedMaterials.add(mesh.material);
    trees.parent = rocks.parent = this.root;
    const groups = new Map<Material, Mesh[]>();
    for (const p of sakuraBackdropPlacements()) {
      const node = (p.asset === 'sakura' ? trees : rocks).clone('sakura-backdrop-piece', this.root)!;
      node.position.set(p.x, 0, p.z); node.scaling.scaleInPlace(p.scale); node.rotation.y = p.yaw;
      for (const child of node.getChildMeshes()) {
        const mesh = child as Mesh;
        mesh.computeWorldMatrix(true);
        const material = mesh.material!;
        this.materials.add(material);
        const group = groups.get(material) ?? [];
        group.push(mesh); groups.set(material, group);
      }
    }
    const meshes: Mesh[] = [];
    for (const parts of groups.values()) {
      const mesh = Mesh.MergeMeshes(parts, true, true)!;
      mesh.parent = this.root; mesh.isPickable = false;
      mesh.metadata = { cameraOcclusionDisabled: true };
      mesh.freezeWorldMatrix(); meshes.push(mesh);
    }
    trees.dispose(); rocks.dispose();
    const textures = [...new Set([...this.materials].flatMap(m => m.getActiveTextures()))];
    this.ready = new Promise<void>(resolve => Texture.WhenAllReady(textures, resolve)).then(async () => {
      if (this.disposed) return;
      await Promise.all(meshes.map(mesh => mesh.material!.forceCompilationAsync(mesh)));
    });
  }
  show(): void { if (!this.disposed) this.root.setEnabled(true); }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true; this.root.dispose();
    // Painted replacements are local; the raw environment-kit cache remains untouched.
    for (const material of this.ownedMaterials) material.dispose(false, true);
  }
}
