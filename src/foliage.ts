import { Color3, Material, Matrix, Mesh, MeshBuilder, Quaternion, StandardMaterial, Texture, TransformNode, Vector3, VertexData, type Scene, type ShadowGenerator } from '@babylonjs/core';

type Random = () => number;
const BASE = `${import.meta.env.BASE_URL}environment/`;

/** Painted alpha silhouettes on curved, instanced leaf cards, arranged around
 * branching 3D trunks. No camera-facing whole-tree sprites or solid leaf balls.
 * Cards are static thin instances: about 1,500 separate InstancedMeshes cost more CPU in
 * per-frame culling and dirty-marking than drawing the few thousand extra triangles. */
export function createFoliage(scene: Scene, shadows: ShadowGenerator,
  canPlant:(at:Vector3,radius:number,height:number)=>boolean=()=>true) {
  function allowed(parent:TransformNode,at:Vector3,radius:number,height:number):boolean {
    const world=parent.computeWorldMatrix(true),m=world.m;
    const scale=Math.max(Math.hypot(m[0],m[1],m[2]),Math.hypot(m[4],m[5],m[6]),Math.hypot(m[8],m[9],m[10]));
    return canPlant(Vector3.TransformCoordinates(at,world),radius*scale,height*scale);
  }
  const foliage = new StandardMaterial('painted-leaves-and-ferns', scene);
  const atlas = new Texture(`${BASE}foliage-atlas.webp`, scene);
  atlas.hasAlpha = true;
  atlas.wrapU = atlas.wrapV = Texture.CLAMP_ADDRESSMODE;
  atlas.anisotropicFilteringLevel = 8;
  foliage.diffuseTexture = atlas;
  foliage.useAlphaFromDiffuseTexture = true;
  foliage.transparencyMode = Material.MATERIAL_ALPHATEST;
  foliage.alphaCutOff = .38;
  foliage.backFaceCulling = false;
  foliage.twoSidedLighting = true;
  foliage.diffuseColor = new Color3(.82, .88, .82);
  foliage.emissiveColor = new Color3(.06, .07, .05);
  foliage.specularColor = Color3.Black();

  const bark = new StandardMaterial('painted-tree-bark', scene);
  const barkMap = new Texture(`${BASE}prop-material-atlas.webp`, scene);
  barkMap.uScale = .498; barkMap.uOffset = .001;
  barkMap.wrapU = barkMap.wrapV = Texture.CLAMP_ADDRESSMODE;
  barkMap.anisotropicFilteringLevel = 8;
  bark.diffuseTexture = barkMap;
  bark.diffuseColor = new Color3(.75, .75, .69);
  bark.specularColor = Color3.Black();

  const templates = [0, 1, 2, 3].map(kind => {
    const mesh = curvedCard(scene, kind); mesh.material = foliage;
    mesh.isVisible = false; mesh.isPickable = false; mesh.receiveShadows = true;
    return mesh;
  });

  const cards = templates.map(() => [] as number[]);
  const cardScale = new Vector3(), cardRotation = new Quaternion(), cardLocal = new Matrix(), cardWorld = new Matrix();
  function card(kind: number, parent: TransformNode, at: Vector3, width: number, height: number, yaw: number, tilt: number): void {
    // Same transform the former instance had: rotation (tilt, yaw, 0) under its parent.
    Quaternion.RotationYawPitchRollToRef(yaw, tilt, 0, cardRotation);
    Matrix.ComposeToRef(cardScale.set(width, height, width), cardRotation, at, cardLocal);
    cardLocal.multiplyToRef(parent.computeWorldMatrix(true), cardWorld);
    cardWorld.copyToArray(cards[kind], cards[kind].length);
  }
  function branch(parent: TransformNode, path: Vector3[], radius: number): Mesh {
    const mesh = MeshBuilder.CreateTube('painted-tree-branch', {
      path, tessellation: 7, radiusFunction: i => radius * (1 - i / (path.length - 1) * .82), cap: Mesh.CAP_ALL,
    }, scene);
    mesh.parent = parent; mesh.material = bark;
    return mesh;
  }

  return {
    tree(parent: TransformNode, radius: number, variant: number, random: Random): void {
      // Reserve the entire crown, including the longest branch and inclined cards.
      if(!allowed(parent,new Vector3(radius*.28,0,radius*.5),5.6,5.5+radius*.35))return;
      const tree = new TransformNode('painted-outpost-tree', scene); tree.parent = parent;
      tree.position.set(radius * .28, 0, radius * .5);
      const height = 3.8 + radius * .35;
      const lean = (random() - .5) * .6;
      const branches = [branch(tree, [new Vector3(0, 0, 0), new Vector3(-.12, height * .35, .08),
        new Vector3(lean, height * .7, 0), new Vector3(lean + .1, height, .1)], .22 + radius * .035)];
      for (let i = 0; i < 7; i++) {
        const angle = i * 2.399 + variant;
        const length = (.65 + random() * .45) * Math.min(radius, 2.7);
        const y = height * (.52 + i * .053);
        const tip = new Vector3(Math.cos(angle) * length, y + .55, Math.sin(angle) * length);
        branches.push(branch(tree, [new Vector3(lean, y - .65, 0), new Vector3(tip.x * .6, y, tip.z * .6), tip], .09));
        // Overlapping inclined sprays expose painted leaves from both low and high cameras.
        card((i + variant) % 2, tree, tip.add(new Vector3(0, -.25, 0)), 2.4, 1.65, angle, .7);
        card((i + variant + 1) % 2, tree, tip.add(new Vector3(.1, .2, .1)), 2.0, 1.45, angle + 1.5, 1.35);
      }
      card(variant % 2, tree, new Vector3(lean, height - .35, 0), 2.2, 1.6, .4, 1.25);
      // One bark draw per tree instead of eight.
      const trunk = Mesh.MergeMeshes(branches, true, true)!;
      trunk.name = 'painted-tree-trunk'; trunk.isPickable = false; trunk.receiveShadows = true;
      shadows.addShadowCaster(trunk);
    },
    fern(parent: TransformNode, at: Vector3, scale: number, random: Random): void {
      if(!allowed(parent,at,scale*1.3,scale*1.2))return;
      const yaw = random() * Math.PI * 2;
      for (let i = 0; i < 3; i++) card(2, parent, at, scale * 1.35, scale, yaw + i * Math.PI / 3, .2);
      card(2, parent, at.add(new Vector3(0, scale * .18, 0)), scale, scale, yaw, 1.25);
    },
    ivy(parent: TransformNode, radius: number, height: number): void {
      if(!allowed(parent,new Vector3(-radius*.15,height-1.5,-radius*.36),radius*.5+.2,1.8))return;
      card(3, parent, new Vector3(-radius * .15, height - 1.5, -radius * .36), radius * .85, 1.8, 0, -.04);
    },
    /** Upload the placed cards; call once after all foliage is placed. */
    commit(): void {
      templates.forEach((mesh, kind) => {
        if (!cards[kind].length) return;
        mesh.thinInstanceSetBuffer('matrix', new Float32Array(cards[kind]), 16, true);
        mesh.thinInstanceRefreshBoundingInfo(false);
        mesh.isVisible = true;
        shadows.addShadowCaster(mesh);
      });
    },
  };
}

function curvedCard(scene: Scene, kind: number): Mesh {
  const positions: number[] = [], indices: number[] = [], uvs: number[] = [];
  // Bounds measured against the delivered artwork: the fern extends slightly
  // past the nominal half-width, while the ivy starts farther to the right.
  const [u0, v0, u1, v1] = [[.008, .515, .513, .995], [.523, .515, .995, .995],
    [.005, .02, .576, .515], [.58, .02, .995, .49]][kind];
  for (let y = 0; y <= 2; y++) for (let x = 0; x <= 2; x++) {
    const u = x / 2, v = y / 2;
    positions.push(u - .5, v, -.12 * Math.sin(u * Math.PI) * Math.sin(v * Math.PI));
    // Texture UVs start at bottom-left; atlas quadrants are named from top-left.
    uvs.push(u0 + u * (u1 - u0), v0 + v * (v1 - v0));
  }
  for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) {
    const a = y * 3 + x;
    indices.push(a, a + 1, a + 3, a + 1, a + 4, a + 3);
  }
  const normals: number[] = []; VertexData.ComputeNormals(positions, indices, normals);
  const data = new VertexData(); data.positions = positions; data.indices = indices; data.normals = normals; data.uvs = uvs;
  const mesh = new Mesh(`foliage-template-${kind}`, scene); data.applyToMesh(mesh); return mesh;
}
