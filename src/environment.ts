// Painted materials on real geometry: camera pan, zoom and tilt keep correct parallax.
import { Color3, Mesh, MeshBuilder, Scene, ShadowGenerator, StandardMaterial, Texture, TransformNode, Vector3, VertexData } from '@babylonjs/core';
import { createFoliage } from './foliage';
import type { Obstacle } from './world';
import { LANES, MAP_EXTENT, MAP_BOUNDARY, COMPOUNDS, SPAWN_POINTS, pathLength, pathPoint, onRoad, onPlantingRoad } from './battleground';
import { insideBoundary } from './navigation';
import { applyPaintover, paintBounds } from './paintover';

const BASE = `${import.meta.env.BASE_URL}environment/`;

export function dressOutpost(scene: Scene, shadows: ShadowGenerator, obstacles: Obstacle[]): void {
  let seed = 4817;
  const random = () => ((seed = seed * 16807 % 2147483647) / 2147483647);
  const plants = createFoliage(scene, shadows,(at,radius,height)=>
    (radius<=.3&&height<=.3)||!onPlantingRoad(at,radius));
  const stone = new StandardMaterial('painted-ruin-concrete', scene);
  stone.diffuseTexture = new Texture(`${BASE}ruin-concrete.webp`, scene);
  stone.diffuseColor = new Color3(.78, .84, .83);
  stone.specularColor = Color3.Black();
  const metal = new StandardMaterial('oxidized-structural-metal', scene);
  metal.diffuseColor = new Color3(.23, .31, .34); metal.specularColor.set(.08, .09, .1);
  const panels = new StandardMaterial('painted-outpost-panels', scene);
  const panelMap = new Texture(`${BASE}prop-material-atlas.webp`, scene);
  panelMap.uScale = .498; panelMap.uOffset = .501;
  panelMap.wrapU = panelMap.wrapV = Texture.CLAMP_ADDRESSMODE;
  panelMap.anisotropicFilteringLevel = 8;
  panels.diffuseTexture = panelMap;
  panels.diffuseColor = new Color3(.84, .87, .85); panels.specularColor = Color3.Black();
  const edge = new StandardMaterial('worn-ruin-edge', scene);
  edge.diffuseColor = new Color3(.52, .57, .55); edge.specularColor = Color3.Black();
  const lamps = new StandardMaterial('outpost-amber-lamps', scene);
  lamps.diffuseColor = new Color3(.9, .57, .19); lamps.emissiveColor = new Color3(.5, .25, .05);
  const floor=new StandardMaterial('hangar-painted-floor',scene);
  floor.diffuseTexture=new Texture(`${BASE}paintover-v1/paving.webp`,scene);
  floor.diffuseColor.set(.55,.62,.65);floor.specularColor.set(.04,.05,.06);

  function decorate(mesh: Mesh, material: StandardMaterial, parent?: TransformNode): Mesh {
    mesh.material = material; mesh.isPickable = false; mesh.receiveShadows = true;
    if (parent) mesh.parent = parent;
    shadows.addShadowCaster(mesh);
    return mesh;
  }
  function box(name: string, width: number, height: number, depth: number, pos: Vector3, mat: StandardMaterial, parent: TransformNode): Mesh {
    const mesh = decorate(MeshBuilder.CreateBox(name, { width, height, depth }, scene), mat, parent);
    mesh.position.copyFrom(pos); return mesh;
  }
  function rubble(parent: TransformNode, r: number, count: number): void {
    for (let j = 0; j < count; j++) {
      const angle = random() * Math.PI * 2, size = .3 + random() * .45;
      const mesh = decorate(MeshBuilder.CreateIcoSphere('broken-stone', { radius: 1, subdivisions: 1, flat: true }, scene), stone, parent);
      mesh.scaling.set(size * 1.6, size * .65, size);
      mesh.position.set(Math.sin(angle) * r * .6, size * .42, Math.cos(angle) * r * .6);
      mesh.rotation.y = random() * 6.28;
    }
  }

  obstacles.forEach((o, i) => {
    const root = new TransformNode(`ruin-cover-${i}`, scene);
    root.position.set(o.x, 0, o.z); root.rotation.y = random() * Math.PI;
    const r = o.r;
    // Broken octagonal foundations and irregular silhouettes replace test cylinders.
    const base = decorate(MeshBuilder.CreateCylinder('ruin-foundation', { diameter: r * 1.65, diameterTop: r * 1.5, height: .28, tessellation: 8 }, scene), metal, root);
    base.position.y = .08;
    const slab = decorate(brokenPier(scene, r * .68, 1.5 + r * .32, random), stone, root);
    slab.position.y = .15;
    slab.scaling.z = .48;
    box('exposed-support', .2, 2.2 + r * .25, .23, new Vector3(-r * .45, 1.1 + r * .125, .1), metal, root).rotation.z = .08;
    box('broken-lintel', r * 1.25, .3, .5, new Vector3(.15, 1.25 + r * .18, -.15), edge, root).rotation.z = -.12;
    box('painted-service-cabinet', r * .58, 1.25, .22, new Vector3(r * .27, .76, -r * .42), panels, root);
    box('warning-strip', r * .3, .05, .08, new Vector3(r * .27, 1.41, -r * .55), lamps, root);
    plants.ivy(root, r, 1.65 + r * .32);
    rubble(root, r, 5);
    if (i >= 2) plants.tree(root, r, i, random);
    for (let j = 0; j < 4; j++) {
      const a = random() * Math.PI * 2;
      plants.fern(root, new Vector3(Math.cos(a) * r * .75, 0, Math.sin(a) * r * .75), .6 + random() * .45, random);
    }
    const solids=root.getChildMeshes(true).filter((m):m is Mesh=>m instanceof Mesh && m.material!==lamps && !m.name.includes('ivy') && !m.name.includes('fern'));
    const fit=paintBounds(solids,root);
    for(const mesh of solids)applyPaintover(mesh,'ruin',{space:root,fit});
    staticMerge(solids,`ruin-cover-${i}-painted`,'ruin');
  });

  // Faded surface markings keep a crisp, readable lane at close zoom. Flush
  // with the ground and deliberately broken into short weathered fragments.
  const paint = new StandardMaterial('worn-road-amber', scene);
  paint.diffuseColor = new Color3(.49, .4, .23); paint.specularColor = Color3.Black();
  const strips:Mesh[]=[];
  for (const lane of LANES) for (let t=13;t<pathLength(lane.points)-13;t+=8) for(const side of [-1,1]) {
    const p=pathPoint(lane.points,t), next=pathPoint(lane.points,t+1), yaw=Math.atan2(next.x-p.x,next.z-p.z);
    const strip=MeshBuilder.CreateGround('lane-paint-fragment',{width:.14,height:1.5},scene);
    strip.position.set(p.x+Math.cos(yaw)*side*(lane.width/2-.7),.014,p.z-Math.sin(yaw)*side*(lane.width/2-.7));
    strip.rotation.y=yaw;strip.material=paint;strips.push(strip);
  }
  // One draw for all fragments (previously 128 on Outpost Hollow); they never cast shadows.
  const lanePaint=Mesh.MergeMeshes(strips,true,true)!;lanePaint.name='lane-paint';lanePaint.isPickable=false;lanePaint.receiveShadows=true;

  // Passable, low foliage stays away from the open firing lane and spawn pads.
  const undergrowth = new TransformNode('outpost-undergrowth', scene);
  for (let i = 0; i < 640; i++) {
    const x = (random() - .5) * MAP_EXTENT*2, z = (random() - .5) * MAP_EXTENT*2;
    if (!insideBoundary({x,z},MAP_BOUNDARY) || onRoad({x,z},1) || obstacles.some(o => Math.hypot(x - o.x, z - o.z) < o.r + .6)) continue;
    plants.fern(undergrowth, new Vector3(x, .015, z), .55 + random() * .4, random);
  }

  // The rock rim follows the collision silhouette, including the one-lane side pockets.
  const rimParts:Mesh[]=[];
  for(let i=0;i<MAP_BOUNDARY.length;i++) {
    const a=MAP_BOUNDARY[i],b=MAP_BOUNDARY[(i+1)%MAP_BOUNDARY.length],length=Math.hypot(b.x-a.x,b.z-a.z);
    for(let d=0;d<length;d+=2.6) {
      const p={x:a.x+(b.x-a.x)*d/length,z:a.z+(b.z-a.z)*d/length};
      const rock=brokenPier(scene,1.65,2.4+random()*1.7,random);rock.material=stone;
      applyPaintover(rock,'cliff',{fit:paintBounds([rock])});
      rock.position.set(p.x,0,p.z);rock.rotation.y=random()*6.28;rimParts.push(rock);
    }
  }
  const rim=Mesh.MergeMeshes(rimParts,true,true)!;rim.name='battleground-cliff-rim';rim.isPickable=false;rim.receiveShadows=true;shadows.addShadowCaster(rim);
  // Short walls extend out from each gate tower; their footprint matches World navigation.
  for(const c of COMPOUNDS) {
    const root=new TransformNode(`${c.team}-${c.lane}-${c.tier}-walls`,scene);
    root.position.set(c.gate.x,0,c.gate.z);root.rotation.y=c.yaw;
    const walls:Mesh[]=[];
    for(const side of [-1,1]) {
      const parts=[box('compound-wall',3.2,1.7,1.1,new Vector3(side*5.1,.85,0),stone,root),
        box('wall-cap',3.4,.25,1.3,new Vector3(side*5.1,1.8,0),metal,root)];
      const fit=paintBounds(parts,root);
      for(const part of parts)applyPaintover(part,'wall',{space:root,fit});
      walls.push(...parts);
    }
    staticMerge(walls,`${c.team}-${c.lane}-${c.tier}-walls-painted`,'wall');
  }
  // Recessed deployment hangars make the spawn area legible behind each Core.
  for(const team of ['blue','red'] as const) {
    const p=SPAWN_POINTS[team],root=new TransformNode(`${team}-deployment-hall`,scene);
    root.position.set(p.x,0,p.z);root.rotation.y=team==='blue'?Math.PI/2:-Math.PI/2;
    box('hangar-foundation',9,.5,8,new Vector3(0,.25,-2),floor,root);
    for(const side of [-1,1])box('hangar-side',1.2,4.2,7,new Vector3(side*3.9,2.1,-2.5),panels,root);
    box('hangar-rear',7,4.5,1.1,new Vector3(0,2.25,-5.8),metal,root);
    box('hangar-crown',9,1.1,3,new Vector3(0,4.3,-4),stone,root);
    const shell=root.getChildMeshes(true).filter((mesh):mesh is Mesh=>mesh instanceof Mesh && mesh.material!==floor);
    for(const mesh of shell)applyPaintover(mesh,'hangar',{space:root});
    staticMerge(shell,`${team}-deployment-hall-painted`,'hangar');
  }
  plants.commit();

  /** Static parts that share one painted atlas draw once per pass instead of once per part. */
  function staticMerge(parts:Mesh[],name:string,paintover:string):void {
    const merged=Mesh.MergeMeshes(parts,true,true)!;
    // MergeMeshes bakes normals with the plain world matrix, which tilts them on the
    // non-uniformly scaled stones and slabs. The painted parts are flat-shaded, so face
    // normals from the merged triangles match the per-mesh (inverse-transpose) shading.
    merged.createNormals(false);
    merged.name=name;merged.isPickable=false;merged.receiveShadows=true;merged.metadata={paintover};
    shadows.addShadowCaster(merged);
  }
}

export function brokenPier(scene: Scene, radius: number, height: number, random: () => number): Mesh {
  const positions: number[] = [], indices: number[] = [], uvs: number[] = [];
  const sides = 8;
  const outline = [[.72, 1], [1, .72], [1, -.72], [.72, -1], [-.72, -1], [-1, -.72], [-1, .72], [-.72, 1]];
  for (let ring = 0; ring < 4; ring++) for (let i = 0; i <= sides; i++) {
    const [x, z] = outline[i % sides];
    const r = radius * [1, 1, .88, .7][ring];
    const y = ring === 0 ? 0 : ring === 1 ? .15 : ring === 2 ? height - .25 : height + (i % 3 - 1) * .12;
    positions.push(x * r, y, z * r);
    uvs.push(i / sides * 2, y / 2.5);
  }
  for (let ring = 0; ring < 3; ring++) for (let i = 0; i < sides; i++) {
    const a = ring * (sides + 1) + i, b = a + sides + 1;
    indices.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const center = positions.length / 3;
  positions.push(0, height - .06 + random() * .1, 0); uvs.push(.5, .5);
  // The cap needs its own planar UVs; sharing side UVs creates a pinwheel of
  // stretched concrete on the most visible surface in the MOBA camera.
  const capRing = positions.length / 3;
  for (let i = 0; i <= sides; i++) {
    const offset = (3 * (sides + 1) + i) * 3;
    const x = positions[offset], y = positions[offset + 1], z = positions[offset + 2];
    positions.push(x, y, z); uvs.push(x / (radius * 2) + .5, z / (radius * 2) + .5);
  }
  for (let i = 0; i < sides; i++) indices.push(center, capRing + i + 1, capRing + i);
  const normals: number[] = [];
  VertexData.ComputeNormals(positions, indices, normals);
  const data = new VertexData(); data.positions = positions; data.indices = indices; data.normals = normals; data.uvs = uvs;
  const mesh = new Mesh('broken-concrete-pier', scene); data.applyToMesh(mesh); mesh.convertToFlatShadedMesh();
  return mesh;
}

