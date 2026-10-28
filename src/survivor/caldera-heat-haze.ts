// Ashen Caldera heat haze: the whole view shimmers faintly, more strongly the closer the player is to lava.
import { Effect, PostProcess, type Camera } from '@babylonjs/core';

Effect.ShadersStore.calderaHazeFragmentShader = `precision highp float;
varying vec2 vUV;uniform sampler2D textureSampler;uniform float time,strength;
float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}
void main(){
  // Rising, wobbling cells: noise scrolled upward plus a fine horizontal ripple.
  vec2 q=vec2(vUV.x*7.,vUV.y*5.-time*.9);
  vec2 wobble=vec2(n(q)-.5,n(q+vec2(5.2,1.3))-.5);
  wobble.x+=sin(vUV.y*90.+time*4.)*.18;
  gl_FragColor=texture2D(textureSampler,clamp(vUV+wobble*strength*.006,.001,.999));
}`;

export class CalderaHeatHaze {
  private readonly pass: PostProcess;
  private attached = false;
  private time = 0;
  private strength = 0;
  private readonly reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

  constructor(private readonly camera: Camera) {
    this.pass = new PostProcess('caldera-haze', 'calderaHaze', ['time', 'strength'], null, 1, camera);
    camera.detachPostProcess(this.pass);
    this.pass.onApply = (e) => { e.setFloat('time', this.time); e.setFloat('strength', this.strength); };
  }

  setEnabled(on: boolean): void {
    on &&= !this.reducedMotion.matches;
    if (on === this.attached) return;
    this.attached = on;
    if (on) this.camera.attachPostProcess(this.pass); else this.camera.detachPostProcess(this.pass);
  }

  /** `near` 0..1: how close the player is to lava. A faint shimmer always stays on. */
  update(dt: number, near: number): void {
    this.time += dt;
    this.strength += (.3 + .7 * near - this.strength) * Math.min(1, dt * 3);
  }

  dispose(): void { this.pass.dispose(this.camera); }
}
