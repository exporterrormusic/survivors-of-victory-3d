import { elevatorGroundMaskGLSL } from './elevator-footprint';
import { Effect, Mesh, ShaderMaterial, type Scene, Vector3 } from '@babylonjs/core';

Effect.ShadersStore.groundPetalsVertexShader = `
precision highp float;
attribute vec3 position;
attribute vec4 petalState;
attribute vec2 petalStyle;
uniform mat4 viewProjection;
uniform float clock;
varying vec2 vUV;
varying float vSeed;
varying vec3 vWorld;
void main() {
  vUV = position.xy * 2.0;
  vSeed = petalStyle.y;
  float angle = petalState.w;
  vec2 q = position.xy * mix(.16, .29, vSeed);
  q.x *= .67;
  q = mat2(cos(angle), -sin(angle), sin(angle), cos(angle)) * q;
  float lift = petalState.y - .028;
  float tumble = clock * mix(.7, 1.9, vSeed) + vSeed * 60.0;
  float flying = petalStyle.x * smoothstep(.0, .3, lift);
  vec3 offset = mix(vec3(q.x, sin(position.y * 3.0 + clock * 7.0 + vSeed * 60.0) * min(lift, .1), q.y),
    vec3(q.x, q.y * sin(tumble), q.y * cos(tumble)), flying);
  vec3 p = petalState.xyz + offset;
  vWorld = p;
  gl_Position = viewProjection * vec4(p, 1.0);
}`;
Effect.ShadersStore.groundPetalsFragmentShader = `
precision highp float;
varying vec2 vUV;
varying float vSeed;
varying vec3 vWorld;
uniform float amount;
uniform float night;
${elevatorGroundMaskGLSL}
void main() {
  if (vWorld.y < .5 && onElevatorGround(vWorld.xz)) discard;
  vec2 p = vUV;
  // Tapered sakura petal with a small cleft at its broad tip.
  float outline = length(vec2(p.x / (.77 + .22 * p.y), p.y));
  float shape = 1.0 - smoothstep(.90, 1.0, outline);
  shape *= smoothstep(.0, .07, abs(p.x) + (.70 - p.y) * .46);
  if (shape < .02) discard;
  vec3 color = mix(vec3(.92,.43,.61),vec3(1.0,.83,.88),vSeed);
  color *= .88 + .12 * p.y;
  color *= mix(vec3(1.0),vec3(.48,.49,.65),night);
  gl_FragColor = vec4(color, shape * amount);
}`;

/** One draw call; only the small nearby group receives foot/wake impulses.
 * Positions persist after settling, so walking clears a real trail. */
export class GroundPetals {
  private readonly mesh: Mesh;
  private readonly material: ShaderMaterial;
  private readonly count: number;
  private readonly projected = new Vector3();
  private readonly point = new Vector3();
  private readonly states: Float32Array;
  private readonly velocity: Float32Array;
  private readonly previous = new Vector3();
  private hasPrevious = false;
  constructor(private readonly scene: Scene, private readonly falling = false, excludeElevatorGround = false) {
    this.count = falling ? 5200 : 6000;
    this.states = new Float32Array(this.count * 16);
    this.velocity = new Float32Array(this.count * 3);
    const positions: number[] = [], styles: number[] = [], indices: number[] = [];
    let random = 7163;
    const rand = () => { random = (Math.imul(random,1664525)+1013904223) >>> 0; return random / 4294967296; };
    for (let i=0;i<this.count;i++) {
      const x=(rand()-.5)*90, z=(rand()-.5)*90, angle=rand()*Math.PI*2, seed=rand();
      for (const [qx,qy] of [[-.5,-.5],[.5,-.5],[.5,.5],[-.5,.5]]) {
        positions.push(qx,qy,0);styles.push(falling ? 1 : 0,seed);
      }
      const height = falling ? .028 + rand() * 44 : .028;
      this.write(i*16,x,height,z,angle);
      const b=i*4;indices.push(b,b+1,b+2,b,b+2,b+3);
    }
    this.mesh=new Mesh(falling ? 'falling-sakura-petals' : 'ground-sakura-petals',scene);
    this.mesh.setVerticesData('position',positions);
    this.mesh.setVerticesData('petalState',this.states,true,4);
    this.mesh.setVerticesData('petalStyle',styles,false,2);
    this.mesh.setIndices(indices);
    this.mesh.isPickable=false;this.mesh.alwaysSelectAsActiveMesh=true;
    this.material=new ShaderMaterial('ground-sakura-material',scene,'groundPetals',{
      attributes:['position','petalState','petalStyle'],uniforms:['viewProjection','clock','amount','night','excludeElevatorGround'],needAlphaBlending:true,
    });
    this.material.setFloat('excludeElevatorGround', excludeElevatorGround ? 1 : 0);
    this.material.backFaceCulling=false;this.material.disableDepthWrite=true;
    this.mesh.material=this.material;
  }
  update(dt: number, clock: number, player: Vector3 | null, amount: number, night: number, reducedMotion: boolean): void {
    this.mesh.setEnabled(amount>.001);
    this.material.setFloat('clock',clock);this.material.setFloat('amount',amount);this.material.setFloat('night',night);
    if (this.falling) {
      if (dt > 0 && amount > .001) this.updateFalling(Math.min(dt,.05),clock,reducedMotion);
    }
    const dx=player && this.hasPrevious ? player.x-this.previous.x : 0;
    const dz=player && this.hasPrevious ? player.z-this.previous.z : 0;
    const distance=Math.hypot(dx,dz);
    const moving=dt>0 && distance>.001 && distance<2 && amount>.001;
    if(player) { this.previous.copyFrom(player);this.hasPrevious=true; }
    if(dt<=0 || amount<=.001)return;
    const step=Math.min(dt,.04), damping=Math.exp(-step*3.8);
    let dirty=false;
    for(let i=0;i<this.count;i++) {
      const s=i*16,v=i*3;
      let x=this.states[s],y=this.states[s+1],z=this.states[s+2],angle=this.states[s+3];
      if(this.falling && y>.028 && this.velocity[v]===0 && this.velocity[v+2]===0)continue;
      if(moving && player) {
        const rx=x-player.x,rz=z-player.z,r=Math.hypot(rx,rz);
        if(r<1.15) {
          const kick=(1-r/1.15)*Math.min(distance/dt,9)*step*13;
          this.velocity[v]+=(rx/Math.max(r,.1)+dx/distance*.45)*kick;
          this.velocity[v+2]+=(rz/Math.max(r,.1)+dz/distance*.45)*kick;
          this.velocity[v+1]=Math.max(this.velocity[v+1],kick*(reducedMotion?.18:1.1));
        }
      }
      if(Math.abs(this.velocity[v])+Math.abs(this.velocity[v+2])<.003 && y<=.028 && this.velocity[v+1]<=0)continue;
      x+=this.velocity[v]*step;z+=this.velocity[v+2]*step;
      y=Math.max(.028,y+this.velocity[v+1]*step);
      this.velocity[v+1]=y<=.028?0:this.velocity[v+1]-step*3.2;
      this.velocity[v]*=damping;this.velocity[v+2]*=damping;
      angle+=(this.velocity[v]-this.velocity[v+2])*step*(reducedMotion?.25:2);
      this.write(s,x,y,z,angle);
      dirty=true;
    }
    if(dirty)this.mesh.updateVerticesData('petalState',this.states,false,false);
  }
  /** Project with a generous screen margin; never retire a visible landed petal.
   * Both ends of the recycle are checked, including at wide/low camera angles. */
  private offscreen(x: number, y: number, z: number): boolean {
    this.point.set(x,y,z);
    Vector3.TransformCoordinatesToRef(this.point,this.scene.getTransformMatrix(),this.projected);
    return this.projected.z < 0 || this.projected.z > 1 || Math.abs(this.projected.x) > 1.2 || Math.abs(this.projected.y) > 1.2;
  }
  private updateFalling(dt: number, clock: number, reducedMotion: boolean): void {
    for(let i=0;i<this.count;i++) {
      const s=i*16;
      // Foot-scattered petals are temporarily handled by the ground physics below.
      if(Math.abs(this.velocity[i*3])+Math.abs(this.velocity[i*3+2])>.003)continue;
      this.velocity[i*3]=0;this.velocity[i*3+2]=0;
      const seed=((i*127.13)%997)/997;
      let x=this.states[s],y=this.states[s+1],z=this.states[s+2],angle=this.states[s+3];
      if(y<=.028) {
        if(!this.offscreen(x,y,z))continue;
        // Fixed world field: camera movement never translates or wraps live petals.
        const nx=Math.sin(i*78.233+Math.floor(clock*.1)*31.7)*44;
        const nz=Math.sin(i*39.731+Math.floor(clock*.1)*17.3)*44;
        if(!this.offscreen(nx,44,nz))continue;
        x=nx;y=44;z=nz;
      } else {
        const flutter=clock*(.7+seed*1.7)+i*2.399;
        const motion=reducedMotion ? .25 : 1;
        x+=dt*((seed-.5)*.36+Math.sin(flutter)*.28)*motion;
        z+=dt*((((seed*7.17)%1)-.5)*.3+Math.cos(flutter*.73)*.24)*motion;
        y=Math.max(.028,y-dt*(.65+seed*.85));
        angle+=dt*(seed-.5)*2.4*motion;
      }
      this.write(s,x,y,z,angle);
    }
    this.mesh.updateVerticesData('petalState',this.states,false,false);
  }
  /** One petal's state on all four of its corners. Runs for thousands of petals a frame, so no temporary arrays. */
  private write(s: number, x: number, y: number, z: number, angle: number): void {
    const states=this.states;
    for(let j=s;j<s+16;j+=4) { states[j]=x;states[j+1]=y;states[j+2]=z;states[j+3]=angle; }
  }
  dispose(): void { this.mesh.dispose();this.material.dispose(); }
}
