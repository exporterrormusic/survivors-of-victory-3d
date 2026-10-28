import { Constants, Effect, PostProcess, Vector3 } from '@babylonjs/core';
import type { KitContext } from '../kit';
import type { Target } from '../targets';
import type { FxQuad } from '../vfx';

Effect.ShadersStore.scarletStoppedTimeFragmentShader = `
precision highp float;
varying vec2 vUV;
uniform sampler2D textureSampler;
uniform float amount;
void main() {
  vec4 source = texture2D(textureSampler, vUV);
  float luma = dot(source.rgb, vec3(.2126,.7152,.0722));
  // Retain terrain texture and midtones; stronger midtone contrast without thresholding to white.
  vec3 mono = vec3(clamp((luma - .35) * 1.48 + .33, .015, .90));
  // Crimson cuts and ghosts remain saturated over the stopped monochrome world.
  float red = smoothstep(.30,.65,(source.r-max(source.g,source.b))/max(.001,source.r));
  vec3 crimson = vec3(1.0,.012,.035) * clamp(source.r * 1.3,.55,1.3);
  vec3 stopped = mix(mono, crimson, red);
  float edge = smoothstep(.24,.72,length((vUV-.5)*vec2(1.2,1.0)));
  stopped *= 1.0 - edge*.23;
  gl_FragColor = vec4(mix(source.rgb,stopped,amount),source.a);
}`;

interface Mark { target: Target; generation: number; red: FxQuad; core: FxQuad; direction: Vector3 }

/** Camera grade and persistent cuts are owned by the Burst, never wall-clock timers. */
export class BurstCinematic {
  private readonly pass: PostProcess;
  private readonly marks: Mark[] = [];
  private active = false;
  private release = 0;
  private amount = 0;
  private strike = 0;
  constructor(private readonly ctx: KitContext) {
    this.pass = new PostProcess('scarlet-stopped-time', 'scarletStoppedTime', ['amount'], null, 1, null,
      Constants.TEXTURE_BILINEAR_SAMPLINGMODE, ctx.scene.getEngine(), false);
    this.pass.onApply = effect => effect.setFloat('amount', this.amount);
    ctx.scene.onDisposeObservable.addOnce(() => { this.clear(); this.pass.dispose(ctx.camera.camera); });
  }
  start(): void {
    this.clear(); this.release = 0; this.amount = 1; this.strike = 0;
    if (!this.active) { this.ctx.camera.camera.attachPostProcess(this.pass); this.active = true; }
  }
  mark(target: Target): void {
    const red = this.ctx.vfx.quad('sword-cut', [2.4,.008,.025]);
    const core = this.ctx.vfx.quad('sword-cut', [1.4,.08,.10]);
    this.ctx.vfx.glowing(red);
    const side = this.strike++ % 2 ? -1 : 1;
    const right = this.ctx.camera.camera.getDirection(new Vector3(1,0,0));
    const direction = right.scale(side).addInPlaceFromFloats(0,.65,0).normalize();
    this.marks.push({target, generation: target.generation, red, core, direction});

  }
  finish(): void { this.release = .3; }
  update(dt: number, frozen: boolean): void {
    if (!this.active) return;
    if (!frozen) {
      this.release = Math.max(0,this.release-dt);
      this.amount = this.release/.3;
      if (this.release <= 0) {
        this.clear(); this.ctx.camera.camera.detachPostProcess(this.pass); this.active=false; return;
      }
    }
    for(const mark of this.marks) {
      if(mark.target.generation!==mark.generation) {mark.red.visible=mark.core.visible=false;continue;}
      const center=mark.target.position.add(new Vector3(0,mark.target.barHeight*.5,0));
      // Place the cut on the camera-facing armor, not buried inside the enemy.
      const front=this.ctx.camera.camera.globalPosition.subtract(center).normalize();
      center.addInPlace(front.scale(mark.target.radius + .32));
      const length=Math.max(1.35,mark.target.radius*1.9);
      const a=center.subtract(mark.direction.scale(length)),b=center.add(mark.direction.scale(length));
      this.ctx.vfx.streak(mark.red,a,b,.32);this.ctx.vfx.streak(mark.core,a,b,.075);
      mark.red.alpha=mark.core.alpha=this.amount;
    }
  }
  private clear(): void {
    for(const mark of this.marks){this.ctx.vfx.release(mark.red);this.ctx.vfx.release(mark.core);}
    this.marks.length=0;

  }
}
