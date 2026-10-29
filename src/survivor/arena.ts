// Test range: an open painted plaza for tuning the survivor camera, controls, HUD and kits.
// Same light rig as the outpost (sun + sky fill, PCF shadows that follow the player, selective glow)
// so models and effects read the way they will on a real map.

import {
  type AbstractMesh, type Camera, Color3, Color4, DirectionalLight, Frustum, GlowLayer, HemisphericLight,
  Matrix, MaterialPluginBase, Mesh, MeshBuilder, Scene, ShadowGenerator, StandardMaterial, Texture, Vector3,
  type BaseTexture, type UniformBuffer,
} from '@babylonjs/core';
import { OUTSKIRTS_SCALE, RANGE_ROADS, type RangeEnvironment } from './range-environments';
import { SAKURA_PAVING, SAKURA_SCALE } from './sakura-layout';
import { STORM_CHANNELS, STORM_FLOOD_SPREAD, STORM_RADIUS, STORM_SPLIT_Z, stormChannelGLSL } from './storm-field';
import { STORM_THICKET } from './storm-layout';
import { FROZEN_RADIUS } from './frozen-layout';
import { FOREST_RADIUS, forestPathGLSL } from './forest-layout';
import { ELEVATOR_YAW, SHAFT_HALF_WIDTH } from './lift-tower-geometry';
import { ELEVATOR_ORIGIN } from './elevator-footprint';
import { calderaTexture } from './caldera-materials';
import { CSG } from '@babylonjs/core';
import { OUTSKIRTS_CRATER } from './outskirts-landmarks';

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
  readonly scorched: Texture;
  readonly craterSoil:Texture;
  readonly cityAsphalt:Texture;
  readonly citySidewalk:Texture;
  readonly stormGround:Texture;
  /** Stormbringer region tiles: needles, shingle, slate, waterline bank. */
  readonly stormTiles:Texture[];
  readonly calderaTiles:Texture[];
  theme: RangeEnvironment = 'plain';

  constructor(material: StandardMaterial, scene: Scene) {
    super(material, 'RangeGround', 200, {}, true, true);
    this.calderaTiles=['basalt.webp','ash.webp'].map(n=>calderaTexture(scene,n));
    this.craterSoil=new Texture(`${import.meta.env.BASE_URL}environment/outskirts-v2/crater-soil.png`,scene);
    this.scorched=new Texture(`${import.meta.env.BASE_URL}environment/outskirts-v2/scorched-cracks.png`,scene);
    this.paving = new Texture(`${BASE}paving.webp`, scene);
    this.moss = new Texture(`${BASE}woodland.webp`, scene);
    this.cityAsphalt=new Texture(`${import.meta.env.BASE_URL}environment/grey-ruins-v1/asphalt.png`,scene);
    this.citySidewalk=new Texture(`${import.meta.env.BASE_URL}environment/grey-ruins-v1/cement.png`,scene);
    this.stormGround=new Texture(`${import.meta.env.BASE_URL}environment/storm-kit-v1/ground-atlas.png`,scene);
    this.stormTiles=['needles','shingle','slate','bank'].map(n=>new Texture(`${import.meta.env.BASE_URL}environment/storm-kit-v3/ground-${n}.png`,scene));
    for (const t of [this.craterSoil,this.scorched,this.paving, this.moss,this.cityAsphalt,this.citySidewalk,this.stormGround,...this.stormTiles,...this.calderaTiles]) {
      t.wrapU = t.wrapV = Texture.WRAP_ADDRESSMODE;
      t.anisotropicFilteringLevel = Math.min(16, scene.getEngine().getCaps().maxAnisotropy);
    }
  }

  override isReadyForSubMesh(): boolean { return this.craterSoil.isReady() && this.scorched.isReady() && this.paving.isReady() && this.moss.isReady() && this.cityAsphalt.isReady() && this.citySidewalk.isReady()&&this.stormGround.isReady()&&this.stormTiles.every(t=>t.isReady())&&this.calderaTiles.every(t=>t.isReady()); }
  override getSamplers(samplers: string[]): void { samplers.push('rangeCraterSoil','rangeScorched','rangePaving', 'rangeMoss','cityAsphalt','citySidewalk','stormGround','stormNeedles','stormShingle','stormSlate','stormBank'); }
  override getUniforms() {
    return {ubo:[{name:'rangeTheme',size:1,type:'float'}],fragment:'uniform float rangeTheme;'};
  }
  override bindForSubMesh(buffer: UniformBuffer): void {
    buffer.setTexture('rangeCraterSoil',this.theme==='volcano'?this.calderaTiles[1]:this.craterSoil);
    buffer.setTexture('rangeScorched',this.theme==='volcano'?this.calderaTiles[0]:this.scorched);
    buffer.setTexture('rangePaving', this.paving);
    buffer.setTexture('rangeMoss', this.moss);
    buffer.setTexture('cityAsphalt',this.cityAsphalt);buffer.setTexture('citySidewalk',this.citySidewalk);
    buffer.setTexture('stormGround',this.stormGround);
    ['stormNeedles','stormShingle','stormSlate','stormBank'].forEach((n,i)=>buffer.setTexture(n,this.stormTiles[i]));
    buffer.updateFloat('rangeTheme', {plain:0,outskirts:1,sakura:5,frozen:2,city:3,storm:4,forest:6,volcano:7}[this.theme]);
  }
  override getActiveTextures(textures: BaseTexture[]): void { textures.push(this.craterSoil,this.scorched,this.paving, this.moss,this.cityAsphalt,this.citySidewalk,this.stormGround,...this.stormTiles,...this.calderaTiles); }
  override hasTexture(texture: BaseTexture): boolean { return [this.craterSoil,this.scorched,this.paving,this.moss,this.cityAsphalt,this.citySidewalk,this.stormGround,...this.stormTiles,...this.calderaTiles].includes(texture as Texture); }
  override getCustomCode(type: string): Record<string, string> | null {
    if (type !== 'fragment') return null;
    return {
      CUSTOM_FRAGMENT_DEFINITIONS: `
        uniform sampler2D rangeCraterSoil;
        uniform sampler2D rangeScorched;
        uniform sampler2D rangePaving;
        uniform sampler2D rangeMoss;
        uniform sampler2D cityAsphalt;
        uniform sampler2D citySidewalk;
        uniform sampler2D stormGround;
        uniform sampler2D stormNeedles;
        uniform sampler2D stormShingle;
        uniform sampler2D stormSlate;
        uniform sampler2D stormBank;
        vec3 stormTile(vec2 p,vec2 panel){return texture2D(stormGround,panel+vec2(.012)+fract(p)*.476).rgb;}
        // Shared with the wet-ground coat so paving reflects more than moss and soil.
        float rangeStoneCoverage = 0.0;
        vec3 rangePaint(sampler2D source, vec2 uv) {
          #ifdef ANIME_TOON
          return texture2D(source, uv, 1.7).rgb;
          #else
          return texture2D(source, uv).rgb;
          #endif
        }
        ${stormChannelGLSL()}
        float rangeHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float rangeNoise(vec2 p) {
          vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
          return mix(mix(rangeHash(i), rangeHash(i+vec2(1.,0.)),f.x), mix(rangeHash(i+vec2(0.,1.)), rangeHash(i+vec2(1.,1.)),f.x), f.y);
        }
      `,
      CUSTOM_FRAGMENT_UPDATE_DIFFUSE: `
        vec2 g = vPositionW.xz;
        if(rangeTheme > 4.5 && rangeTheme < 5.5) g /=  ${SAKURA_SCALE.toFixed(1)};
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
          if(rangeTheme > 4.5 && rangeTheme < 5.5){
            // Shrine court and connected resting gardens follow the authored prop plan.
            road *= 1.0-smoothstep(34.8,35.6,g.y);
            ${SAKURA_PAVING.map(p=>`road=max(road,1.0-smoothstep(-.15,.45,max(abs(g.x-(${p.x.toFixed(1)}))-${p.halfX.toFixed(1)},abs(g.y-(${p.z.toFixed(1)}))-${p.halfZ.toFixed(1)})+edge*.10));`).join('\n')}
          }
          // Themed ground matches the plain range's brightness (moss .75/.85/.77, paving .86/.90/.88);
          // darker multipliers made every time of day and weather read too dark.
          vec3 soil = moss * vec3(.75,.85,.77);
          vec3 asphalt = paving * vec3(.84,.88,.88);
          if(rangeTheme > 2.5 && rangeTheme < 3.5) {road = 1.0;asphalt *= vec3(.88,.86,.83);}
          if(rangeTheme > 3.5 && rangeTheme < 4.5) {
            // Stormbringer fork: channel formulas come from storm-field (stormChannelGLSL).
            float shore=-1e4;
            ${STORM_CHANNELS.map((c,i)=>`if(g.y>=${c.zMin.toFixed(1)}&&g.y<=${c.zMax.toFixed(1)})shore=stormSoftUnion(shore,min(stormHalf${i}(g.y)-abs(g.x-stormCenter${i}(g.y)),min(g.y-(${c.zMin.toFixed(1)}),${c.zMax.toFixed(1)}-g.y)));`).join('')}
            shore=stormSoftUnion(shore,stormLakeEdge(g.x)-g.y);
            shore=-(shore+stormBankErosion(g));
            // Region tiles (storm-kit-v3), ~6 m repeats; a rotated second sample breaks up tiling.
            mat2 turn=mat2(.8,-.6,.6,.8);
            vec3 pinewood=mix(rangePaint(stormNeedles,g/6.),rangePaint(stormNeedles,turn*g/7.3+.37),.35);
            vec3 gravel=mix(rangePaint(stormShingle,g/6.),rangePaint(stormShingle,turn*g/7.9+.21),.3);
            vec3 slate=mix(rangePaint(stormSlate,g/7.),rangePaint(stormSlate,turn*g/9.1+.53),.3)*.8;
            // The needle tile is warm; pull it toward a damp, muted brown-green.
            pinewood=mix(vec3(dot(pinewood,vec3(.3,.59,.11))),pinewood,.55)*vec3(.78,.82,.7);
            vec3 bankTile=rangePaint(stormBank,g/5.);
            // Regions: west bank (pinewood), central island (shingle), east bank (slate).
            float north=step(${STORM_SPLIT_Z.toFixed(1)},g.y);
            float westEdge=mix(stormCenter1(g.y),stormCenter0(g.y),north),eastEdge=mix(stormCenter2(g.y),stormCenter0(g.y),north);
            float west=1.-smoothstep(-1.,1.,g.x-westEdge+edge*1.5),east=smoothstep(-1.,1.,g.x-eastEdge+edge*1.5);
            // Darker litter under the thicket's canopy.
            pinewood*=1.-.25*(1.-smoothstep(.7,1.1,length((g-vec2(${STORM_THICKET.x.toFixed(1)},${STORM_THICKET.z.toFixed(1)}))/vec2(${STORM_THICKET.rx.toFixed(1)},${STORM_THICKET.rz.toFixed(1)}))));
            vec3 ground=mix(mix(gravel,pinewood,west),slate,east);
            // Every shore is a band of wet brown mud, darkest at the waterline (under the surge reach).
            vec3 mud=mix(vec3(dot(bankTile,vec3(.3,.59,.11))),bankTile,.35)*vec3(.56,.5,.42);
            float sediment=rangeNoise(g*.32+vec2(7.,3.));
            ground=mix(ground,mud,(1.-smoothstep(-2.,6.,shore+edge*2.4))*(.2+.4*sediment));
            ground=mix(ground,mud*.85,(1.-smoothstep(-2.,3.5,shore+edge*1.3))*.25);
            // Damp stone fades into the bank rather than ending in a painted contour.
            float wetBank=1.-smoothstep(-.5,4.5,shore+edge*.7);
            ground=mix(ground,ground*vec3(.65,.78,.87),wetBank*.55);
            soil=ground;asphalt=ground;
            // Slate and wet shingle take the rain sheen; the pinewood floor stays matte.
            road=east*.8+(1.-west)*(1.-east)*.5;
          }
          if(rangeTheme > 5.5 && rangeTheme < 6.5){
            // Textured woodland grass, cooled for the night.
            soil=moss*vec3(.66,.76,.74);
            soil*=.9+.2*rangeNoise(g*.09);
            // Winding paths and courts use the shrine-garden paving, as on Sakura.
            ${forestPathGLSL()}
            road=1.0-smoothstep(-.4,.5,pathD+edge*.3);
            asphalt=paving*vec3(.8,.85,.88);
            // Camp and stone circle: worn grass, not bare earth.
            float yard=1.0-smoothstep(-1.,1.,yardD+edge*.9);
            soil=mix(soil,mix(soil,paving*vec3(.62,.6,.55),.35),yard);
          }
          floorColor=mix(soil,asphalt,road);
          if(rangeTheme>2.5&&rangeTheme<3.5){
            float dust=smoothstep(.45,.86,rangeNoise(g*.19))*.18;
            floorColor=mix(mix(vec3(.28),rangePaint(cityAsphalt,g/8.0),.4),rangePaint(citySidewalk,g/14.0)*.60,dust);
            // Sparse worn road paint locates the surviving avenue beneath the ruins.
            float lane=(1.0-smoothstep(.045,.09,abs(abs(g.x)-19.5)))*step(1.8,mod(g.y+2.0,6.0));
            float worn=smoothstep(.43,.68,rangeNoise(g*3.5));
            floorColor=mix(floorColor,vec3(.47,.47,.44),lane*worn*.48);
          }
          rangeStoneCoverage=road*smoothstep(.06,.30,dot(paving,vec3(.2126,.7152,.0722)));
          float stripe=(1.0-smoothstep(.045,.09,abs(abs(g.x)-.16))) * step(.5,mod(g.y+1.5,4.5)) * (1.0-step(2.7,mod(g.y+1.5,4.5)));
          float roadside=(1.0-smoothstep(.035,.07,abs(abs(g.x)-3.8)));
          if(rangeTheme < 1.5)
            floorColor=mix(floorColor,vec3(.56,.51,.34),(stripe*.23+roadside*.13)*rangeNoise(g*2.0));
        }
        // the play area's edge darkens into the fog instead of ending at a wall
        float arenaEdge=rangeTheme>1.5&&rangeTheme<2.5?${FROZEN_RADIUS.toFixed(1)}:rangeTheme>3.5&&rangeTheme<4.5?${(STORM_RADIUS+6).toFixed(1)}:rangeTheme>5.5&&rangeTheme<6.5?${FOREST_RADIUS.toFixed(1)}:34.;
        float outside = smoothstep(arenaEdge-2., arenaEdge+10., r + edge * 1.5);
        // Sakura's distant orchard hides the horizon; avoid a dark circular band
        // across the shrine court and let the ground recede gradually behind it.
        if(rangeTheme>4.5&&rangeTheme<5.5)
          outside=smoothstep(58.,110.,r+edge*3.);
        // Outskirts stays lit all the way to its movement boundary. A short,
        // outward-only fade makes the dark scenery read as out of bounds.
        if(rangeTheme > 6.5){
          // Ashen Caldera: black basalt with grey ash drifts; the lift pad keeps its paving.
          vec3 basalt=mix(rangePaint(rangeScorched,g/6.),rangePaint(rangeScorched,vec2(-g.y,g.x)/9.+.37),.24)*vec3(.78,.76,.75);
          vec3 ashBed=rangePaint(rangeCraterSoil,g/5.5);
          ashBed=mix(ashBed,vec3(dot(ashBed,vec3(.299,.587,.114))),.6)*vec3(.78,.76,.74);
          float drift=smoothstep(.45,.75,rangeNoise(g*.06)+(rangeNoise(g*.33)-.5)*.3);
          vec3 volcanic=mix(basalt,ashBed,drift*.7);
          floorColor=volcanic;
          rangeStoneCoverage=0.;
          outside=smoothstep(${(ARENA_RADIUS*OUTSKIRTS_SCALE).toFixed(1)}, ${(ARENA_RADIUS*OUTSKIRTS_SCALE+3).toFixed(1)}, r);
        }
        if(rangeTheme > .5 && rangeTheme < 1.5)
          outside = smoothstep(${(ARENA_RADIUS*OUTSKIRTS_SCALE).toFixed(1)}, ${(ARENA_RADIUS*OUTSKIRTS_SCALE+3).toFixed(1)}, r);
        if(rangeTheme > .5 && rangeTheme < 1.5){
          float blastDistance=length(g-vec2(${OUTSKIRTS_CRATER.x.toFixed(1)},${OUTSKIRTS_CRATER.z.toFixed(1)}));
          float scorch=1.-smoothstep(${(OUTSKIRTS_CRATER.radius+2).toFixed(1)},${(OUTSKIRTS_CRATER.scorchRadius+2).toFixed(1)},blastDistance+edge*1.6);
          vec3 charcoal=rangePaint(rangeScorched,g/9.)*.32;
          floorColor=mix(floorColor,charcoal,scorch);
          float bowlBlend=1.-smoothstep(${(OUTSKIRTS_CRATER.radius*.64).toFixed(1)},${(OUTSKIRTS_CRATER.radius*.98).toFixed(1)},blastDistance+edge*.4);
          vec3 bowlSoil=rangePaint(rangeCraterSoil,g/6.)*.12;
          floorColor=mix(floorColor,bowlSoil,bowlBlend);
        }
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
      const outer=MeshBuilder.CreateGround('range-floor-side',{width:600-edge,height:1200},scene);
      outer.position.x=side*(600+edge)/2;pieces.push(outer);
      const end=MeshBuilder.CreateGround('range-floor-end',{width:edge*2,height:600-edge},scene);
      end.position.z=side*(600+edge)/2;pieces.push(end);
    }
    const mesh=Mesh.MergeMeshes(pieces,true,true)!;mesh.name='range-ground';mesh.rotation.y=ELEVATOR_YAW;return mesh;
  })() : MeshBuilder.CreateGround('range-ground', { width: 1200, height: 1200, subdivisions: 2 }, scene);
  const material = new StandardMaterial('range-ground-mat', scene);
  material.specularColor = Color3.Black();
  const rangeGround = new RangeGround(material, scene);
  ground.material = material;
  ground.receiveShadows = true;
  ground.isPickable = false;
  ground.freezeWorldMatrix();
  // Cut a real opening so the bowl is visible below grade in all render passes.
  const cutter=MeshBuilder.CreateCylinder('crater-ground-cutter',{diameter:OUTSKIRTS_CRATER.radius*1.88,height:16,tessellation:80},scene);
  cutter.position.set(OUTSKIRTS_CRATER.x,0,OUTSKIRTS_CRATER.z);cutter.computeWorldMatrix(true);
  const craterGround=CSG.FromMesh(ground).subtract(CSG.FromMesh(cutter)).toMesh('range-ground-crater',material,scene);
  // Subtracting a solid from an open ground sheet can retain cutter caps/walls.
  // Keep only the original surface: a hidden cap would cover the deep bowl.
  const cutPositions=craterGround.getVerticesData('position')!,cutIndices=craterGround.getIndices()!,surfaceIndices:number[]=[];
  for(let i=0;i<cutIndices.length;i+=3){
    if([cutIndices[i],cutIndices[i+1],cutIndices[i+2]].every(v=>Math.abs(cutPositions[v*3+1])<.001))
      surfaceIndices.push(cutIndices[i],cutIndices[i+1],cutIndices[i+2]);
  }
  craterGround.setIndices(surfaceIndices);
  cutter.dispose();craterGround.receiveShadows=true;craterGround.isPickable=false;craterGround.setEnabled(false);craterGround.freezeWorldMatrix();

  const sunPos = new Vector3();
  return {
    shadows,
    glow,
    get radius() { return rangeGround.theme==='frozen'?FROZEN_RADIUS:rangeGround.theme==='storm'?STORM_RADIUS:rangeGround.theme==='forest'?FOREST_RADIUS:ARENA_RADIUS*(rangeGround.theme==='sakura'?SAKURA_SCALE:rangeGround.theme==='outskirts'||rangeGround.theme==='volcano'?OUTSKIRTS_SCALE:1); },
    setEnvironment(theme) {
      rangeGround.theme = theme;
      material.metadata={...material.metadata,softEnvironment:theme==='volcano'};
      ground.setEnabled(theme!=='outskirts');craterGround.setEnabled(theme==='outskirts');
      if(elevatorShaft){ground.unfreezeWorldMatrix();ground.position.x=ELEVATOR_ORIGIN.x;ground.position.z=ELEVATOR_ORIGIN.z;ground.freezeWorldMatrix();}
    },
    followSun(target) {
      sunPos.copyFrom(sun.direction).normalize().scaleInPlace(-60).addInPlace(target);
      sun.position.copyFrom(sunPos);
    },
  };
}
