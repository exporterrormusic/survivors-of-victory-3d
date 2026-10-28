import { Constants, DynamicTexture, Effect, type Mesh, MeshBuilder, ShaderMaterial, Vector3 } from '@babylonjs/core';
import type { KitContext } from '../kit';
import { labelQuad } from '../vfx';

export const DEFENSIVE_RADIUS = 3.2;

/** A depth-tested, camera-facing ammo badge; redraw only when its text changes. Pooled with its turret. */
export class TurretAmmoCounter {
  private readonly texture: DynamicTexture;
  private readonly mesh: Mesh;
  private key = '';

  constructor(ctx: KitContext) {
    this.texture = new DynamicTexture('sw-turret-ammo-label', { width: 192, height: 88 }, ctx.scene, false);
    this.texture.hasAlpha = true;
    this.mesh = labelQuad(ctx.scene, 'sw-turret-ammo-counter', this.texture);
    this.mesh.scaling.set(1.02, .47, 1);
    this.mesh.setEnabled(false);
  }

  update(position: Vector3, ammo: number, capacity: number, reload: number, landed: boolean): void {
    const seconds = reload > 0 ? Math.ceil(reload) : 0;
    const key = `${ammo}/${capacity}:${seconds}`;
    if (key !== this.key) {
      this.key = key;
      const paint = this.texture.getContext() as unknown as CanvasRenderingContext2D;
      paint.clearRect(0, 0, 192, 88);
      paint.beginPath();paint.roundRect(3, 3, 186, 82, 12);
      paint.fillStyle = '#07141deb';paint.fill();
      paint.strokeStyle = seconds ? '#ffc56f' : '#8de5ef';paint.lineWidth = 3;paint.stroke();
      paint.textAlign = 'center';paint.textBaseline = 'middle';
      paint.font = 'bold 45px monospace';paint.fillStyle = seconds ? '#ffd799' : '#f2ffff';
      paint.fillText(`${ammo}/${capacity}`, 96, seconds ? 33 : 44);
      if (seconds) {
        paint.font = 'bold 17px sans-serif';paint.fillStyle = '#ffd799';
        paint.fillText(`RELOAD ${seconds}s`, 96, 68);
      }
      this.texture.update();
      this.mesh.metadata = { ammo, capacity, reloadSeconds: seconds };
    }
    this.mesh.position.copyFrom(position).addInPlaceFromFloats(0, 2.05, 0);
    this.mesh.setEnabled(landed);
  }

  hide(): void { this.mesh.setEnabled(false); }

  /** Compile its material while loading. */
  prepare(): Promise<void> { return this.mesh.material!.forceCompilationAsync(this.mesh); }
}

Effect.ShadersStore.swDefenseVertexShader = `
precision highp float;
attribute vec3 position;
attribute vec2 uv;
uniform mat4 worldViewProjection;
varying vec2 vUV;
void main(){vUV=uv;gl_Position=worldViewProjection*vec4(position,1.0);}`;
Effect.ShadersStore.swDefenseFragmentShader = `
precision highp float;
varying vec2 vUV;
uniform float phase;
void main(){
  vec2 p=(vUV-.5)*2.0;
  float r=length(p), boundary=3.2/3.4;
  float feather=1.0-smoothstep(.98,1.0,r);
  float rim=1.0-smoothstep(.005,.018,abs(r-boundary));
  float halo=exp(-pow((r-boundary)/.035,2.0))*.12;
  float fill=(1.0-smoothstep(boundary-.08,boundary,r))*.035;
  float angle=atan(p.y,p.x);
  float tick=pow(max(0.0,cos(angle*12.0)),24.0);
  tick*=smoothstep(boundary-.10,boundary-.08,r)*(1.0-smoothstep(boundary-.035,boundary-.02,r));
  float sweep=exp(-pow((r-(.20+phase*.74))/.016,2.0))*(1.0-phase)*.10;
  float alpha=(rim*.42+halo+fill+tick*.24+sweep)*feather;
  if(alpha<.004)discard;
  gl_FragColor=vec4(1.0,.19,.14,alpha);
}`;

/** A real circular mesh with a feathered rim: no texture square can clip its glow. Pooled with its turret. */
export function defensiveField(ctx: KitContext) {
  const mesh = MeshBuilder.CreateDisc('sw-defensive-field', { radius: 3.4, tessellation: 128 }, ctx.scene);
  mesh.rotation.x = Math.PI / 2;mesh.isPickable = false;mesh.setEnabled(false);
  const material = new ShaderMaterial('sw-defensive-field',ctx.scene,'swDefense',{
    attributes:['position','uv'],uniforms:['worldViewProjection','phase'],needAlphaBlending:true,
  });
  material.alphaMode = Constants.ALPHA_COMBINE;
  material.disableDepthWrite = true;material.backFaceCulling = false;material.setFloat('phase',0);
  mesh.material = material;
  return {
    update(at: Vector3, phase: number, enabled: boolean) {
      mesh.position.copyFrom(at);mesh.position.y += .035;
      material.setFloat('phase',Math.max(0,Math.min(1,phase)));mesh.setEnabled(enabled);
    },
    hide() { mesh.setEnabled(false); },
    /** Compile while loading: compiled on first deploy, the ring appeared late. */
    prepare: () => material.forceCompilationAsync(mesh),
  };
}
