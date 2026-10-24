// A flat pie slice on the ground, centred on +Z with unit radius. Cone indicators and cone hits
// share it; rotation.y = yaw (atan2(x, z)) points it, scaling sets the reach.
import { Mesh, Scene, VertexData } from '@babylonjs/core';

export function createSector(name: string, angle: number, scene: Scene, segments = 32): Mesh {
  const positions = [0, 0, 0];
  const indices: number[] = [];
  for (let i = 0; i <= segments; i++) {
    const a = -angle / 2 + (angle * i) / segments;
    positions.push(Math.sin(a), 0, Math.cos(a));
    if (i > 0) indices.push(0, i + 1, i);
  }
  const normals: number[] = [];
  VertexData.ComputeNormals(positions, indices, normals);
  const data = new VertexData();
  Object.assign(data, { positions, indices, normals });
  const mesh = new Mesh(name, scene);
  data.applyToMesh(mesh);
  mesh.isPickable = false;
  return mesh;
}
