import { Mesh } from '@babylonjs/core';

/** Bounded reusable effect meshes; disabled rentals cost no draw calls. */
export class MeshPool {
  private readonly idle: Mesh[] = [];
  private readonly pooled = new Set<Mesh>();
  private readonly template: Mesh;
  private readonly capacity: number;
  created = 0;
  reused = 0;
  constructor(template: Mesh, capacity = 256) { this.template = template; this.capacity = capacity; }
  acquire(name: string): Mesh {
    let mesh = this.idle.pop();
    if (mesh) { this.pooled.delete(mesh); this.reused++; }
    else { mesh = this.template.clone(name); this.created++; }
    mesh.name = name; mesh.visibility = 1; mesh.scaling.setAll(1); mesh.rotation.setAll(0); mesh.rotationQuaternion = null;
    mesh.setEnabled(true);
    return mesh;
  }
  release(mesh: Mesh): void {
    if (this.pooled.has(mesh)) return;
    mesh.setEnabled(false);
    if (this.idle.length < this.capacity) { this.idle.push(mesh); this.pooled.add(mesh); }
    else mesh.dispose();
  }
}
