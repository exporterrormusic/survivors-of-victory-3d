import {
  type BaseTexture, BoundingInfo, Color3, MaterialPluginBase, Mesh, RawTexture,
  type Observer, type Scene, StandardMaterial, Texture, type UniformBuffer, Vector3, VertexData,
} from '@babylonjs/core';
import { MAX_SNOW_DEPTH, SnowField, type SnowFieldOptions } from './snow-field';
import { snowGridAxis } from './snow-grid';

export interface SnowLayerOptions extends SnowFieldOptions {
  /** World-space floor height, sampled once when building the overlay. Default: y = 0.
   * Use a cached terrain sampler; depthAt returns zero over holes or excluded areas. */
  heightAt?: (x: number, z: number) => number;
  subdivisions?: number;
  /** Align grid edges to a rectangular opening; field sampling stays in world space. */
  gridRotation?: number;
  /** Snow scenery beyond the editable field; edge depths extend without reducing trail detail. */
  outerExtent?: number;
}

const uniforms = 'uniform vec4 snowBounds;\nuniform vec2 snowGrid;';
const sampling = `
  uniform sampler2D snowField;
  vec2 snowUV(vec2 p) { return (p - snowBounds.xy) / snowBounds.zw * (1.0 - snowGrid.x) + snowGrid.x * .5; }
  vec4 snowSample(vec2 p) {
    vec4 data=texture2D(snowField,snowUV(p));
    vec2 outside=max(max(snowBounds.xy-p,p-(snowBounds.xy+snowBounds.zw)),vec2(0.));
    float blend=smoothstep(0.,8.,length(outside));
    // Blend into world-space powder beyond the editable field instead of stretching
    // its final row of texels into long ridges toward the horizon.
    float base=texture2D(snowField,vec2(.98,.98)).r;
    float wind=sin(p.x*.73+sin(p.y*.41))*cos(p.y*.57)*.018/snowGrid.y;
    return mix(data,vec4(max(.01,base+wind),0.,0.,0.),blend);
  }
  float snowHeight(vec4 field) { float fresh = field.r * snowGrid.y; return fresh - min(fresh * .88, .24) * field.g; }
  float snowAt(vec2 p) { return snowHeight(snowSample(p)); }
`;

/** Uses Babylon's normal lighting / shadows / fog, including the game's toon plugin. */
class SnowMaterial extends MaterialPluginBase {
  constructor(material: StandardMaterial, private readonly field: SnowField, private readonly texture: RawTexture) {
    super(material, 'GroundSnow', 210, {}, true, true);
  }
  override getUniforms() {
    return {
      ubo: [{ name: 'snowBounds', size: 4, type: 'vec4' }, { name: 'snowGrid', size: 2, type: 'vec2' }],
      vertex: uniforms, fragment: uniforms,
    };
  }
  override getSamplers(samplers: string[]): void { samplers.push('snowField'); }
  override getActiveTextures(textures: BaseTexture[]): void { textures.push(this.texture); }
  override hasTexture(texture: BaseTexture): boolean { return texture === this.texture; }
  override bindForSubMesh(buffer: UniformBuffer): void {
    const b = this.field.bounds;
    buffer.updateFloat4('snowBounds', b.minX, b.minZ, b.width, b.depth);
    buffer.updateFloat2('snowGrid', 1 / this.field.resolution, MAX_SNOW_DEPTH);
    buffer.setTexture('snowField', this.texture);
  }
  override getCustomCode(type: string): Record<string, string> | null {
    if (type === 'vertex') return {
      CUSTOM_VERTEX_DEFINITIONS: sampling,
      CUSTOM_VERTEX_UPDATE_POSITION: 'positionUpdated.y += .008 + snowAt(positionUpdated.xz);',
    };
    if (type !== 'fragment') return null;
    return {
      CUSTOM_FRAGMENT_DEFINITIONS: sampling + `
        float snowHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float snowNoise(vec2 p) {
          vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
          return mix(mix(snowHash(i),snowHash(i+vec2(1.,0.)),f.x),mix(snowHash(i+vec2(0.,1.)),snowHash(i+vec2(1.)),f.x),f.y);
        }
      `,
      CUSTOM_FRAGMENT_UPDATE_DIFFUSE: `
        vec2 snowP = vPositionW.xz;
        vec4 snowData = snowSample(snowP);
        float snowDepth = snowHeight(snowData);
        // Worn powder reveals the actual floor below. Deep paths retain packed snow.
        if (snowDepth < .006) discard;
        vec2 snowStep = snowBounds.zw * snowGrid.x;
        vec2 slope = vec2(snowAt(snowP+vec2(snowStep.x,0.))-snowAt(snowP-vec2(snowStep.x,0.)),
          snowAt(snowP+vec2(0.,snowStep.y))-snowAt(snowP-vec2(0.,snowStep.y))) / (2.0*snowStep);
        float grain = snowNoise(snowP * 36.0);
        float grainFade = 1.0 - smoothstep(.015, .12, max(length(dFdx(snowP)), length(dFdy(snowP))));
        float wind = snowNoise(snowP * vec2(.75, 2.2));
        normalW = normalize(normalW + vec3(-slope.x, 0., -slope.y) + vec3(grain-.5,0.,wind-.5)*.075*grainFade);
        float freshDepth = snowData.r * snowGrid.y;
        float deepSnow = smoothstep(.16, .65, freshDepth);
        float bank = smoothstep(.78, 1.05, freshDepth);
        // Depth has a readable material language even under flat fill / the toon grade:
        // pale powder, cool blue drifts, blue bank faces and a chalk-white wind cap.
        vec3 powder = mix(vec3(.81,.88,.93),vec3(.96,.98,1.),wind*.55+.35);
        powder = mix(powder, vec3(.63,.77,.86), deepSnow * .58);
        float face = clamp(length(slope) * 1.1, 0., 1.);
        vec3 bankColor = mix(vec3(.87,.94,.98), vec3(.39,.56,.7), face);
        powder = mix(powder, bankColor, bank * .5);
        // Broad directional relief survives bright lighting; ridges describe the slope.
        float relief = clamp(dot(slope, vec2(-.75,.45)), -.2, .15);
        float ripple = sin(snowP.x * 4.0 + snowP.y * 1.3 + wind * 3.0);
        powder *= 1.0 + relief + ripple * .045 * deepSnow * face;
        vec3 packedColor = vec3(.32,.49,.62);
        baseColor.rgb = mix(powder,packedColor,snowData.b*.65) * (.97 + .06*(grain-.5)*grainFade);
      `,
    };
  }
}

/** A floor-independent, world-space heightfield overlay. Original floor materials stay intact. */
export class SnowLayer {
  readonly field: SnowField;
  readonly mesh: Mesh;
  private readonly material: StandardMaterial;
  private readonly texture: RawTexture;
  private uploadIn = 0;
  private disposed = false;
  private readonly onSceneDispose: Observer<Scene> | null;

  constructor(private readonly scene: Scene, options: SnowLayerOptions) {
    this.field = new SnowField(options);
    const n = this.field.resolution;
    this.texture = RawTexture.CreateRGBATexture(this.field.data, n, n, scene, false, false, Texture.BILINEAR_SAMPLINGMODE);
    this.texture.name = 'ground-snow-depth-and-trails';
    this.texture.wrapU = this.texture.wrapV = Texture.CLAMP_ADDRESSMODE;
    this.texture.gammaSpace = false;
    this.material = new StandardMaterial('ground-snow-mat', scene);
    this.material.diffuseColor = Color3.White();
    this.material.specularColor = new Color3(.13, .17, .2);
    this.material.specularPower = 48;
    new SnowMaterial(this.material, this.field, this.texture);

    // Resolve rounded contact edges in geometry, not only in the normal shading.
    const b = options.bounds, segments = options.subdivisions ?? 512;
    const angle=options.gridRotation??0,c=Math.cos(angle),s=Math.sin(angle);
    const cx=b.minX+b.width/2,cz=b.minZ+b.depth/2;
    const xs=snowGridAxis(b.width,segments,options.outerExtent),zs=snowGridAxis(b.depth,segments,options.outerExtent);
    const nx=xs.length-1,nz=zs.length-1;
    const gridPoint=(x:number,z:number):[number,number]=>{
      const px=xs[x],pz=zs[z];
      return [cx+c*px+s*pz,cz-s*px+c*pz];
    };
    const positions: number[] = [], indices: number[] = [], normals: number[] = [];
    for (let z = 0; z <= nz; z++) for (let x = 0; x <= nx; x++) {
      const [wx,wz]=gridPoint(x,z);
      positions.push(wx, options.heightAt?.(wx, wz) ?? 0, wz);
    }
    for (let z = 0; z < nz; z++) for (let x = 0; x < nx; x++) {
      // Remove geometry as well as depth: depth/SSAO passes must see the open shaft.
      if (options.excludeAt && [[x,z],[x+1,z],[x,z+1],[x+1,z+1]].some(([gx,gz]) =>
        options.excludeAt!(...gridPoint(gx,gz)))) continue;
      const i = z * (nx + 1) + x;
      indices.push(i, i + 1, i + nx + 1, i + 1, i + nx + 2, i + nx + 1);
    }
    VertexData.ComputeNormals(positions, indices, normals);
    const data = new VertexData(); data.positions = positions; data.normals = normals; data.indices = indices;
    this.mesh = new Mesh('ground-snow', scene); data.applyToMesh(this.mesh);
    this.mesh.material = this.material;
    this.mesh.receiveShadows = true;
    this.mesh.isPickable = false;
    // CPU bounds include vertex-shader displacement, preventing edge-of-view culling.
    const bounds = this.mesh.getBoundingInfo().boundingBox;
    this.mesh.setBoundingInfo(new BoundingInfo(bounds.minimum.clone(), bounds.maximum.add(new Vector3(0, MAX_SNOW_DEPTH + .01, 0))));
    this.mesh.freezeWorldMatrix();
    this.onSceneDispose = scene.onDisposeObservable.addOnce(() => this.dispose());
  }

  get enabled(): boolean { return this.field.enabled; }
  set enabled(value: boolean) {
    this.field.enabled = value;
    // Presets are filled while loading/paused, before simulation updates can run.
    if (value) this.flush();
    this.mesh.setEnabled(value);
  }

  /** Synchronize prepared snow before a covered frame is revealed, without advancing simulation. */
  flush(): void {
    if (this.disposed || !this.field.dirty) return;
    this.texture.update(this.field.data);
    this.field.dirty = false;
    this.uploadIn = 1 / 30;
  }

  /** Bounded storage; upload only changed trails, at most 30 times/second. */
  update(dt: number): void {
    if (this.disposed || !this.enabled || dt <= 0) return;
    this.uploadIn -= dt;
    if (this.field.dirty && this.uploadIn <= 0) {
      this.flush();
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.scene.onDisposeObservable.remove(this.onSceneDispose);
    this.mesh.dispose(); this.material.dispose(); this.texture.dispose();
  }
}
