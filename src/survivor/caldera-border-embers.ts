// Ashen Caldera: a dense band of embers boiling off the lava's edge. It traces the shoreline as it
// drifts and advances (the same calderaShoreDepth the lava and the damage use), marking the
// growing line and hiding where molten rock meets ground.
import { Constants, Effect, Mesh, ShaderMaterial, VertexBuffer, type Scene } from '@babylonjs/core';
import { lavaNoiseGLSL } from './caldera-materials';

const COUNT = 5200;

Effect.ShadersStore.calderaBorderEmbersVertexShader = `precision highp float;
attribute vec3 position;attribute vec4 emberSeed;
uniform mat4 viewProjection;uniform vec3 cameraRight,cameraUp;uniform float clock,advance;
varying vec2 vCorner;varying float vAlpha,vHeat;
${lavaNoiseGLSL}
void main(){
  float a=emberSeed.x*6.28318,seed=emberSeed.y;
  // Walk out to the ragged shoreline: depth is ~1 per metre of radius, so a few steps converge.
  float r=45.5+1.1*sin(a*5.)+.6*sin(a*11.)-advance;
  vec2 dir=vec2(cos(a),sin(a));
  for(int i=0;i<4;i++)r-=calderaShoreDepth(dir*r,clock,advance);
  float life=fract(clock*mix(.18,.42,seed)+emberSeed.z);
  // Mostly over the edge itself; a few spill onto the ground and out over the lava.
  float spread=(emberSeed.w-.5)*mix(1.2,3.2,fract(seed*7.3));
  vec2 xz=dir*(r+spread)+vec2(sin(clock*1.7+seed*40.)*.35,cos(clock*1.3+seed*23.)*.35)*life;
  vec3 p=vec3(xz.x,.1+life*mix(.8,3.2,fract(seed*13.7)),xz.y);
  p+=(cameraRight*position.x+cameraUp*position.y)*mix(.07,.16,fract(seed*5.1))*(1.-life*.5);
  vCorner=position.xy*2.;
  vHeat=fract(seed*17.9);
  vAlpha=smoothstep(0.,.1,life)*(1.-smoothstep(.45,1.,life))*(.6+.4*sin(clock*mix(7.,13.,seed)+seed*50.));
  gl_Position=viewProjection*vec4(p,1.);
}`;

Effect.ShadersStore.calderaBorderEmbersFragmentShader = `precision highp float;
varying vec2 vCorner;varying float vAlpha,vHeat;
void main(){
  float d=length(vCorner);
  float glow=(1.-smoothstep(.0,.35,d))+(1.-smoothstep(.2,1.,d))*.45;
  vec3 color=mix(vec3(1.,.22,.03),vec3(1.,.42,.08),vHeat)*glow;
  gl_FragColor=vec4(color*vAlpha,1.);
}`;

export class CalderaBorderEmbers {
  private readonly mesh: Mesh;
  private readonly material: ShaderMaterial;

  constructor(scene: Scene) {
    const positions: number[] = [], seeds: number[] = [], indices: number[] = [];
    for (let i = 0; i < COUNT; i++) {
      const seed = [Math.random(), Math.random(), Math.random(), Math.random()], first = i * 4;
      for (const [x, y] of [[-.5, -.5], [.5, -.5], [.5, .5], [-.5, .5]]) { positions.push(x, y, 0); seeds.push(...seed); }
      indices.push(first, first + 1, first + 2, first, first + 2, first + 3);
    }
    const mesh = this.mesh = new Mesh('caldera-border-embers', scene);
    mesh.setVerticesData(VertexBuffer.PositionKind, positions);
    mesh.setVerticesData('emberSeed', seeds, false, 4);
    mesh.setIndices(indices);
    mesh.isPickable = false; mesh.alwaysSelectAsActiveMesh = true;
    const m = this.material = new ShaderMaterial('caldera-border-embers', scene, 'calderaBorderEmbers', {
      attributes: ['position', 'emberSeed'], uniforms: ['viewProjection', 'cameraRight', 'cameraUp', 'clock', 'advance'], needAlphaBlending: true,
    });
    m.alphaMode = Constants.ALPHA_ADD; m.disableDepthWrite = true; m.backFaceCulling = false;
    m.onBindObservable.add(() => {
      const camera = scene.activeCamera; if (!camera) return;
      const view = camera.getViewMatrix(), e = m.getEffect()!;
      // Rows of the view matrix are the camera's right and up axes in world space.
      e.setFloat3('cameraRight', view.m[0], view.m[4], view.m[8]);
      e.setFloat3('cameraUp', view.m[1], view.m[5], view.m[9]);
    });
    mesh.material = m; mesh.setEnabled(false);
  }

  setEnabled(on: boolean): void { this.mesh.setEnabled(on); }
  update(clock: number, advance: number): void { this.material.setFloat('clock', clock); this.material.setFloat('advance', advance); }
  dispose(): void { this.mesh.dispose(); this.material.dispose(); }
}
