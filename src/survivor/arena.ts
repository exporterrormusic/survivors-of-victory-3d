// Test range: an open painted plaza for tuning the survivor camera, controls, HUD and kits.
// Same light rig as the outpost (sun + sky fill, PCF shadows that follow the player, selective glow)
// so models and effects read the way they will on a real map.

import {
  type AbstractMesh, type Camera, Color3, Color4, DirectionalLight, Frustum, GlowLayer, HemisphericLight,
  Matrix, MaterialPluginBase, Mesh, MeshBuilder, Scene, ShadowGenerator, StandardMaterial, Texture, Vector3,
  type BaseTexture, type UniformBuffer,
} from '@babylonjs/core';
import { RANGE_ROADS, type RangeEnvironment } from './range-environments';
import { ELEVATOR_YAW, SHAFT_HALF_WIDTH } from './lift-tower-geometry';

/** Players stay inside this radius (metres). */
export const ARENA_RADIUS = 34;
/** paved plaza radius; moss beyond */
const PLAZA = 15;
const TILE = 5;
const BASE = `${import.meta.env.BASE_URL}environment/paintover-v1/`;

export interface Arena {
  readonly shadows: ShadowGenerator;
  readonly glow: GlowLayer;
  readonly radius: number;
  setEnvironment(theme: RangeEnvironment): void;
  /** Keep the shadow box centred on the player. */
  followSun(target: Vector3): void;
}

class RangeGround extends MaterialPluginBase {
  readonly paving: Texture;
  readonly moss: Texture;
  theme: RangeEnvironment = 'plain';

  constructor(material: StandardMaterial, scene: Scene) {
    super(material, 'RangeGround', 200, {}, true, true);
    this.paving = new Texture(`${BASE}paving.webp`, scene);
    this.moss = new Texture(`${BASE}woodland.webp`, scene);
    for (const t of [this.paving, this.moss]) {
      t.wrapU = t.wrapV = Texture.WRAP_ADDRESSMODE;
      t.anisotropicFilteringLevel = Math.min(16, scene.getEngine().getCaps().maxAnisotropy);
    }
  }

  override isReadyForSubMesh(): boolean { return this.paving.isReady() && this.moss.isReady(); }
  override getSamplers(samplers: string[]): void { samplers.push('rangePaving', 'rangeMoss'); }
  override getUniforms() {
    return {ubo:[{name:'rangeTheme',size:1,type:'float'}],fragment:'uniform float rangeTheme;'};
  }
  override bindForSubMesh(buffer: UniformBuffer): void {
    buffer.setTexture('rangePaving', this.paving);
    buffer.setTexture('rangeMoss', this.moss);
    buffer.updateFloat('rangeTheme', ['plain','outskirts','frozen','city','storm','hollow'].indexOf(this.theme === 'sakura' ? 'outskirts' : this.theme));
  }
  override getActiveTextures(textures: BaseTexture[]): void { textures.push(this.paving, this.moss); }
  override hasTexture(texture: BaseTexture): boolean { return texture === this.paving || texture === this.moss; }
  override getCustomCode(type: string): Record<string, string> | null {
    if (type !== 'fragment') return null;
    return {
      CUSTOM_FRAGMENT_DEFINITIONS: `
        uniform sampler2D rangePaving;
        uniform sampler2D rangeMoss;
        // Shared with the wet-ground coat so paving reflects more than moss and soil.
        float rangeStoneCoverage = 0.0;
        vec3 rangePaint(sampler2D source, vec2 uv) {
          #ifdef ANIME_TOON
          return texture2D(source, uv, 1.7).rgb;
          #else
          return texture2D(source, uv).rgb;
          #endif
        }
        float rangeHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float rangeNoise(vec2 p) {
          vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
          return mix(mix(rangeHash(i), rangeHash(i+vec2(1.,0.)),f.x), mix(rangeHash(i+vec2(0.,1.)), rangeHash(i+vec2(1.,1.)),f.x), f.y);
        }
      `,
      CUSTOM_FRAGMENT_UPDATE_DIFFUSE: `
        vec2 g = vPositionW.xz;
        vec3 paving = rangePaint(rangePaving, vec2(g.x + g.y, g.y - g.x) * 0.70710678 / ${TILE.toFixed(1)});
        vec2 mossUV = g / ${TILE.toFixed(1)};
        vec3 moss = mix(rangePaint(rangeMoss, mossUV), rangePaint(rangeMoss, vec2(-mossUV.y, mossUV.x) * .83 + .37), rangeNoise(g * .14) * .35);
        float edge = (rangeNoise(g * .33) - .5) * 2.0 + (rangeNoise(g * 1.6) - .5) * .4;
        float r = length(g);
        float plaza = 1.0 - smoothstep(-.4, 1.6, r - ${PLAZA.toFixed(1)} + edge * .9);
        rangeStoneCoverage = plaza * smoothstep(.06,.30,dot(paving,vec3(.2126,.7152,.0722)));
        // painted range markings: a ring every 5 m on the plaza, faint enough to read only as scale
        float ring = abs(fract(r / 5.0 + .5) - .5) * 5.0;
        float marking = (1.0 - smoothstep(.04, .1, ring)) * step(2.0, r) * plaza * .16;
        float tone = .93 + .1 * rangeNoise(g * .045);
        vec3 floorColor = mix(moss * vec3(.75, .85, .77), paving * vec3(.86, .9, .88), plaza);
        floorColor = mix(floorColor, vec3(.82, .9, .95), marking);
        if(rangeTheme > .5) {
          float road = 1.0 - smoothstep(${RANGE_ROADS.mainInner.toFixed(1)}, ${RANGE_ROADS.mainOuter.toFixed(1)}, abs(g.x) + edge * .30);
          float crossRoad = 1.0 - smoothstep(${RANGE_ROADS.crossInner.toFixed(1)}, ${RANGE_ROADS.crossOuter.toFixed(1)}, abs(g.y - (${RANGE_ROADS.crossZ.toFixed(1)})) + edge * .35);
          road = max(road,crossRoad);
          // Themed ground matches the plain range's brightness (moss .75/.85/.77, paving .86/.90/.88);
          // darker multipliers made every time of day and weather read too dark.
          vec3 soil = moss * vec3(.75,.85,.77);
          vec3 asphalt = paving * vec3(.84,.88,.88);
          if(rangeTheme > 2.5 && rangeTheme < 3.5) road = .9;
          if(rangeTheme > 3.5 && rangeTheme < 4.5) {soil *= vec3(.82,.92,.86);road *= .65;}
          if(rangeTheme > 4.5) {soil=paving*vec3(.56,.52,.53);asphalt=paving*vec3(.62,.60,.63);road=1.0;}
          floorColor=mix(soil,asphalt,road);
          rangeStoneCoverage=road*smoothstep(.06,.30,dot(paving,vec3(.2126,.7152,.0722)));
          float stripe=(1.0-smoothstep(.045,.09,abs(abs(g.x)-.16))) * step(.5,mod(g.y+1.5,4.5)) * (1.0-step(2.7,mod(g.y+1.5,4.5)));
          float roadside=(1.0-smoothstep(.035,.07,abs(abs(g.x)-3.8)));
          if(rangeTheme < 1.5 || (rangeTheme > 2.5 && rangeTheme < 3.5))
            floorColor=mix(floorColor,vec3(.56,.51,.34),(stripe*.23+roadside*.13)*rangeNoise(g*2.0));
        }
        // the play area's edge darkens into the fog instead of ending at a wall
        float outside = smoothstep(${(ARENA_RADIUS - 2).toFixed(1)}, ${(ARENA_RADIUS + 10).toFixed(1)}, r + edge * 1.5);
        baseColor.rgb = floorColor * tone * (1.0 - outside * .55);
      `,
    };
  }
}

export function createArena(scene: Scene, camera: Camera, elevatorShaft = false): Arena {
  scene.clearColor = new Color4(.16, .23, .25, 1);
  scene.fogMode = Scene.FOGMODE_EXP2;
  scene.fogColor = new Color3(.2, .27, .29);
  scene.fogDensity = .012;
  scene.ambientColor = new Color3(.3, .3, .3);

  const hemi = new HemisphericLight('hemi', new Vector3(.2, 1, -.3), scene);
  hemi.intensity = .72;
  hemi.groundColor = new Color3(.25, .25, .3);

  const sun = new DirectionalLight('sun', new Vector3(-.55, -.8, .4).normalize(), scene);
  sun.intensity = 1.25;
  sun.autoUpdateExtends = false;
  sun.orthoLeft = sun.orthoBottom = -22;
  sun.orthoRight = sun.orthoTop = 22;
  sun.shadowMinZ = 1;
  sun.shadowMaxZ = 120;

  const shadows = new ShadowGenerator(2048, sun);
  shadows.usePercentageCloserFiltering = true;
  shadows.filteringQuality = ShadowGenerator.QUALITY_HIGH;
  shadows.bias = .0015;
  shadows.darkness = .25;
  // Babylon doesn't frustum-cull a shadow map's render list (see src/world.ts).
  const shadowMap = shadows.getShadowMap()!;
  const planes = Frustum.GetPlanes(Matrix.Identity());
  const casters: AbstractMesh[] = [];
  shadowMap.getCustomRenderList = (_layer, list) => {
    Frustum.GetPlanesToRef(shadows.getTransformMatrix(), planes);
    casters.length = 0;
    for (const mesh of list ?? []) {
      if (mesh.alwaysSelectAsActiveMesh || mesh.hasThinInstances || mesh.skeleton) casters.push(mesh);
      else if (mesh.computeWorldMatrix() && mesh.isInFrustum(planes)) casters.push(mesh);
    }
    return casters;
  };

  // The inclusion list is empty between shots. Keep it selective then too: Babylon's
  // default empty-list behavior would otherwise make every emissive mesh glow.
  const glow = new GlowLayer('glow', scene, { blurKernelSize: 48, camera, excludeByDefault: true });
  glow.intensity = .45;

  // A physical shaft opening keeps main, depth, glow and SSAO passes in agreement.
  // A fragment discard in only the painted material leaves a phantom floor in depth passes.
  const ground = elevatorShaft ? (() => {
    const pieces: Mesh[] = [], edge=SHAFT_HALF_WIDTH;
    for(const side of [-1,1]) {
      const outer=MeshBuilder.CreateGround('range-floor-side',{width:100-edge,height:200},scene);
      outer.position.x=side*(100+edge)/2;pieces.push(outer);
      const end=MeshBuilder.CreateGround('range-floor-end',{width:edge*2,height:100-edge},scene);
      end.position.z=side*(100+edge)/2;pieces.push(end);
    }
    const mesh=Mesh.MergeMeshes(pieces,true,true)!;mesh.name='range-ground';mesh.rotation.y=ELEVATOR_YAW;return mesh;
  })() : MeshBuilder.CreateGround('range-ground', { width: 200, height: 200, subdivisions: 2 }, scene);
  const material = new StandardMaterial('range-ground-mat', scene);
  material.specularColor = Color3.Black();
  const rangeGround = new RangeGround(material, scene);
  ground.material = material;
  ground.receiveShadows = true;
  ground.isPickable = false;
  ground.freezeWorldMatrix();

  const sunPos = new Vector3();
  return {
    shadows,
    glow,
    radius: ARENA_RADIUS,
    setEnvironment(theme) { rangeGround.theme = theme; },
    followSun(target) {
      sunPos.copyFrom(sun.direction).normalize().scaleInPlace(-60).addInPlace(target);
      sun.position.copyFrom(sunPos);
    },
  };
}
