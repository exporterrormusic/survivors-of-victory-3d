import { Color3, MaterialPluginBase, StandardMaterial, Texture, type BaseTexture, type Scene, type UniformBuffer } from '@babylonjs/core';
import { LANES, JUNGLE_PATHS, BASE_POINTS, SPAWN_POINTS, COMPOUNDS } from './battleground';
const vec = (p: { x:number;z:number }) => `vec2(${p.x.toFixed(2)},${p.z.toFixed(2)})`;
const roadDistance = (path: readonly { x:number;z:number }[], name: string, width: number) => path.slice(1)
  .map((p,i)=>`${name} = min(${name}, outpostSegment(groundPosition, ${vec(path[i])}, ${vec(p)}) - ${width.toFixed(2)});`).join('\n');

const BASE = `${import.meta.env.BASE_URL}environment/`;
export const TERRAIN_TILE_SIZE = 5;

/** Close-up materials repeat in world space. Lane shape is independent of
 * texture resolution, so no map-sized image is stretched under the camera. */
class OutpostTerrain extends MaterialPluginBase {
  readonly paving: Texture;
  readonly moss: Texture;

  constructor(material: StandardMaterial, scene: Scene) {
    super(material, 'OutpostTerrain', 200, {}, true, true);
    this.paving = new Texture(`${BASE}paintover-v1/paving.webp`, scene);
    this.moss = new Texture(`${BASE}paintover-v1/woodland.webp`, scene);
    for (const texture of [this.paving, this.moss]) {
      texture.wrapU = texture.wrapV = Texture.WRAP_ADDRESSMODE;
      texture.anisotropicFilteringLevel = Math.min(16, scene.getEngine().getCaps().maxAnisotropy);
    }
  }

  override isReadyForSubMesh(): boolean { return this.paving.isReady() && this.moss.isReady(); }
  override getSamplers(samplers: string[]): void { samplers.push('outpostPaving', 'outpostMoss'); }
  override bindForSubMesh(buffer: UniformBuffer): void {
    buffer.setTexture('outpostPaving', this.paving);
    buffer.setTexture('outpostMoss', this.moss);
  }
  override getActiveTextures(textures: BaseTexture[]): void { textures.push(this.paving, this.moss); }
  override hasTexture(texture: BaseTexture): boolean { return texture === this.paving || texture === this.moss; }
  override dispose(forceDisposeTextures?: boolean): void {
    if (forceDisposeTextures) { this.paving.dispose(); this.moss.dispose(); }
  }
  override getCustomCode(type: string): Record<string, string> | null {
    if (type !== 'fragment') return null;
    return {
      CUSTOM_FRAGMENT_DEFINITIONS: `
        uniform sampler2D outpostPaving;
        uniform sampler2D outpostMoss;
        vec3 outpostPaint(sampler2D source, vec2 uv) {
          #ifdef ANIME_TOON
          // Broader texture strokes; retain the lane mask and paving boundaries.
          return texture2D(source, uv, 1.7).rgb;
          #else
          return texture2D(source, uv).rgb;
          #endif
        }
        float outpostSegment(vec2 p, vec2 a, vec2 b) {
          vec2 ab=b-a; return length(p-a-ab*clamp(dot(p-a,ab)/dot(ab,ab),0.0,1.0));
        }
        float outpostHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float outpostNoise(vec2 p) {
          vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
          return mix(mix(outpostHash(i), outpostHash(i+vec2(1.,0.)),f.x),
                     mix(outpostHash(i+vec2(0.,1.)), outpostHash(i+vec2(1.,1.)),f.x), f.y);
        }
      `,
      CUSTOM_FRAGMENT_UPDATE_DIFFUSE: `
        vec2 groundPosition = vPositionW.xz;
        vec2 laneUV = vec2(groundPosition.x + groundPosition.y, groundPosition.y - groundPosition.x) * 0.70710678 / ${TERRAIN_TILE_SIZE.toFixed(1)};
        vec3 paving = outpostPaint(outpostPaving, laneUV);
        vec2 mossUV = groundPosition / ${TERRAIN_TILE_SIZE.toFixed(1)};
        vec3 moss = mix(outpostPaint(outpostMoss, mossUV),
                        outpostPaint(outpostMoss, vec2(-mossUV.y, mossUV.x) * .83 + .37),
                        outpostNoise(groundPosition * .14) * .35);
        float edgeVariation = (outpostNoise(groundPosition * .33) - .5) * 2.0
                            + (outpostNoise(groundPosition * 1.6) - .5) * .4;
        float fromLane = 1000.0;
        ${LANES.map(l=>roadDistance(l.points,'fromLane',l.width/2)).join('\n')}
        ${Object.values(BASE_POINTS).map(p=>`fromLane = min(fromLane, length(groundPosition-${vec(p)})-10.0);`).join('\n')}
        ${COMPOUNDS.map(c=>`fromLane = min(fromLane, length(groundPosition-${vec(c.building)})-4.5);`).join('\n')}
        ${(['blue','red'] as const).map(t=>roadDistance([SPAWN_POINTS[t],BASE_POINTS[t]],'fromLane',4.5)).join('\n')}
        float jungleDistance = 1000.0;
        ${JUNGLE_PATHS.map(p=>roadDistance(p,'jungleDistance',2.4)).join('\n')}
        float laneMask = 1.0 - smoothstep(-.3, 1.5, fromLane + edgeVariation*.4);
        float jungleMask = 1.0 - smoothstep(-.3, 1.1, jungleDistance + edgeVariation*.6);
        float broadTone = .93 + .1 * outpostNoise(groundPosition * .045);
        vec3 floorColor=mix(moss*vec3(.75,.85,.77),paving*vec3(.64,.68,.61),jungleMask*.7);
        baseColor.rgb = mix(floorColor, paving, laneMask) * broadTone;
      `,
    };
  }
}

export function createTerrainMaterial(scene: Scene): StandardMaterial {
  const material = new StandardMaterial('ground-mat', scene);
  material.specularColor = Color3.Black();
  new OutpostTerrain(material, scene);
  material.metadata = { tileSize: TERRAIN_TILE_SIZE, surface: 'world-space paving / moss blend' };
  return material;
}
