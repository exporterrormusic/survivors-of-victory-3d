// Overgrown Outpost arena: painted lane, ruin cover, two base pads,
// sun + hemi light, and a shadow map that follows the hero so it stays sharp.

import {
  type AbstractMesh,
  type Camera,
  Color3,
  Color4,
  DirectionalLight,
  Frustum,
  GlowLayer,
  HemisphericLight,
  Matrix,
  Mesh,
  MeshBuilder,
  Scene,
  ShadowGenerator,
  StandardMaterial,
  Texture,
  Vector3,
} from '@babylonjs/core';
import { dressOutpost } from './environment';
import { createTerrainMaterial } from './terrain';
import { NavigationMap } from './navigation';
import { MAP_EXTENT, MAP_COVER, MAP_BOUNDARY, BASE_POINTS, SPAWN_POINTS, STRUCTURE_SITES, COMPOUNDS, structureRadius } from './battleground';
import type { GroundObstacle } from './navigation';

export const ARENA = MAP_EXTENT;
export const BLUE_BASE = new Vector3(BASE_POINTS.blue.x, 0, BASE_POINTS.blue.z);
export const RED_BASE = new Vector3(BASE_POINTS.red.x, 0, BASE_POINTS.red.z);
export const BLUE_SPAWN = new Vector3(SPAWN_POINTS.blue.x, 0, SPAWN_POINTS.blue.z);

export interface Obstacle {
  x: number;
  z: number;
  r: number;
}

export interface World {
  shadows: ShadowGenerator;
  glow: GlowLayer;
  obstacles: Obstacle[];
  navigation: NavigationMap;
  navigationFor(team: 'blue' | 'red'): NavigationMap;
  openGate(id: string): void;
  followSun(target: Vector3): void;
}

const SUN_DIR = new Vector3(-0.45, -1, 0.35).normalize();

export function createWorld(scene: Scene, camera: Camera): World {
  scene.clearColor = new Color4(.16, .23, .25, 1);
  scene.fogMode = Scene.FOGMODE_EXP2;
  scene.fogColor = new Color3(.27, .35, .36);
  scene.fogDensity = .006;
  scene.ambientColor = new Color3(0.3, 0.3, 0.3);

  const hemi = new HemisphericLight('hemi', new Vector3(0.2, 1, -0.3), scene);
  hemi.intensity = 0.72;
  hemi.groundColor = new Color3(0.25, 0.25, 0.3);

  const sun = new DirectionalLight('sun', SUN_DIR, scene);
  sun.intensity = 1.25;
  sun.autoUpdateExtends = false;
  sun.orthoLeft = -26;
  sun.orthoRight = 26;
  sun.orthoTop = 26;
  sun.orthoBottom = -26;
  sun.shadowMinZ = 1;
  sun.shadowMaxZ = 120;

  const shadows = new ShadowGenerator(2048, sun);
  shadows.usePercentageCloserFiltering = true;
  shadows.filteringQuality = ShadowGenerator.QUALITY_MEDIUM;
  shadows.bias = 0.0015;
  shadows.darkness = 0.35;
  // Babylon does not frustum-cull a shadow map's render list: every caster on the map
  // was drawn each frame, though the sun's box covers only the area around camera focus.
  // Culling to that box left the 2048² map bit-identical in testing, with 376 instead of 1,033 draws.
  const shadowMap = shadows.getShadowMap()!;
  const sunPlanes = Frustum.GetPlanes(Matrix.Identity());
  const sunCasters: AbstractMesh[] = [];
  shadowMap.getCustomRenderList = (_layer, casters) => {
    Frustum.GetPlanesToRef(shadows.getTransformMatrix(), sunPlanes);
    sunCasters.length = 0;
    for (const mesh of casters ?? []) {
      // Baked crowds and skinned meshes have stale bounds; they are always drawn, as before.
      if (mesh.alwaysSelectAsActiveMesh || mesh.hasThinInstances || mesh.skeleton) sunCasters.push(mesh);
      else if (mesh.computeWorldMatrix() && mesh.isInFrustum(sunPlanes)) sunCasters.push(mesh);
    }
    return sunCasters;
  };

  // main camera only: the HUD portrait camera doesn't need (or pay for) glow
  const glow = new GlowLayer('glow', scene, { blurKernelSize: 48, camera });
  glow.intensity = 0.9;

  const ground = MeshBuilder.CreateGround('ground', { width: ARENA * 2 + 20, height: ARENA * 2 + 20 }, scene);
  ground.material = createTerrainMaterial(scene);
  ground.receiveShadows = true;
  ground.isPickable = false;

  const obstacles: Obstacle[] = MAP_COVER.map(o => ({ ...o }));
  dressOutpost(scene, shadows, obstacles);

  basePad(scene, 'blue', BLUE_BASE, new Color3(0.2, 0.55, 1), glow);
  basePad(scene, 'red', RED_BASE, new Color3(1, 0.25, 0.3), glow);
  for(const team of ['blue','red'] as const) {
    const spawn=SPAWN_POINTS[team];
    basePad(scene, `${team}-spawn`, new Vector3(spawn.x,0,spawn.z), team==='blue'?new Color3(.2,.55,1):new Color3(1,.25,.3), glow);
  }

  // Environment transforms never move. Do not recompute hundreds of foliage and
  // ruin world matrices every frame; units are created after this point.
  for (const mesh of scene.meshes) mesh.freezeWorldMatrix();

  const lightPos = new Vector3();
  const foundations=STRUCTURE_SITES.filter(s=>s.kind!=='gate').map(s=>({x:s.x,z:s.z,r:structureRadius(s.kind)}));
  const walls=COMPOUNDS.flatMap(c=>[-1,1].flatMap(side=>[4.4,5.4,6.4].map(offset=>({x:c.gate.x+Math.cos(c.yaw)*offset*side,z:c.gate.z-Math.sin(c.yaw)*offset*side,r:.6}))));
  const gates=new Map<string,GroundObstacle[]>();
  for(const s of STRUCTURE_SITES.filter(s=>s.kind==='gate'))gates.set(s.id,[-2.4,-1.2,0,1.2,2.4].map(offset=>({x:s.x+Math.cos(s.yaw!)*offset,z:s.z-Math.sin(s.yaw!)*offset,r:.72,active:true})));
  const navigationForTeam=(team:'blue'|'red')=>new NavigationMap([...obstacles,...foundations,...walls,...STRUCTURE_SITES.filter(s=>s.kind==='gate'&&s.team!==team).flatMap(s=>gates.get(s.id)!)],ARENA,MAP_BOUNDARY);
  const navigation={blue:navigationForTeam('blue'),red:navigationForTeam('red')};
  return {
    shadows,
    glow,
    obstacles,
    // Foundations remain solid rubble after destruction. Cover alone blocks sight;
    // building footprints also block walking, without blocking shots at their centers.
    navigation: navigation.blue,
    navigationFor: team=>navigation[team],
    openGate(id) {
      const gate=gates.get(id);if(!gate)return;
      for(const blocker of gate)blocker.active=false;
      navigation[id.startsWith('blue')?'red':'blue'].invalidate();
    },
    followSun(target) {
      lightPos.copyFrom(sun.direction).normalize().scaleInPlace(-60).addInPlace(target);
      sun.position.copyFrom(lightPos);
    },
  };
}

function basePad(scene: Scene, name: string, at: Vector3, color: Color3, glow: GlowLayer): void {
  const pad = MeshBuilder.CreateCylinder(`${name}-base`, { diameter: 14, height: 0.06, tessellation: 48 }, scene);
  pad.position.copyFrom(at).addInPlaceFromFloats(0, .02, 0);
  const mat = new StandardMaterial(`${name}-base-mat`, scene);
  mat.diffuseColor = new Color3(.32,.37,.4);
  const paving = new Texture(`${import.meta.env.BASE_URL}environment/paintover-v1/paving.webp`,scene);
  paving.uScale=paving.vScale=2.5;mat.diffuseTexture=paving;
  mat.specularColor = Color3.Black();
  pad.material = mat;
  pad.receiveShadows = true;
  pad.isPickable = false;

  const ring = MeshBuilder.CreateTorus(`${name}-ring`, { diameter: 13, thickness: 0.08, tessellation: 64 }, scene);
  ring.position.copyFrom(at).addInPlaceFromFloats(0, .07, 0);
  const rmat = new StandardMaterial(`${name}-ring-mat`, scene);
  rmat.emissiveColor = color.scale(.38);
  rmat.disableLighting = true;
  ring.material = rmat;
  ring.isPickable = false;
  glow.addIncludedOnlyMesh(ring as Mesh);
}

