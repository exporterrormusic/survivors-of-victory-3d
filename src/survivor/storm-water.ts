import { STORM_RIVER_BOULDERS } from './storm-layout';
import { STORM_CHANNELS, STORM_FLOODPLAINS, STORM_SHOALS, STORM_FLOOD_SPREAD, stormChannelGLSL, stormFloodGLSL } from './storm-field';
/** One water surface for the whole valley. The shader takes the union of the three channels
 * (and the island tip's flood ground), so there are no overlapping sheets, seams or holes.
 * Physically based look: two-phase flow-advected waves, Beer-Lambert absorption over a refracted bed,
 * blue aerated surge water, Schlick Fresnel sky, sun glint, rain rings, shoal rapids, current streaks.
 * `anime` layers the game's cel treatment on top. Time is integrated on the CPU. */
const f=(n:number)=>n.toFixed(3);
const shared=`
${stormChannelGLSL()}
${stormFloodGLSL}
uniform float surgeAge;
float flood;
// Signed shoreline and continuous material fields. Never choose a winning channel:
// a hard river/lake switch changes UV speed, foam, depth and displacement at once.
float stormWater(vec2 p,out vec2 dir,out float shoal,out float plain){
 float outline=-1e4;vec2 flowSum=vec2(0.);float total=0.;shoal=0.;plain=0.;
 ${STORM_CHANNELS.map((c,i)=>`{
  float d=min(stormHalf${i}(p.y)+${f(STORM_FLOOD_SPREAD)}*flood-abs(p.x-stormCenter${i}(p.y)),min(p.y-(${f(c.zMin)}),${f(c.zMax)}-p.y));
  outline=stormSoftUnion(outline,d);
  float weight=exp(clamp(d*.45,-40.,10.));
  float slope=stormCenter${i}(p.y+.5)-stormCenter${i}(p.y-.5);
  flowSum+=-normalize(vec2(slope,1.))*weight;total+=weight;
  float localShoal=0.;
  ${STORM_SHOALS.filter(h=>h.channel===c.id).map(h=>`localShoal=max(localShoal,1.-smoothstep(${f(h.half-2.5)},${f(h.half+3.5)},abs(p.y-(${f(h.z)}))));`).join('')}
  shoal+=localShoal*weight;
 }`).join('\n')}
 {float d=stormLakeEdge(p.x)+${f(STORM_FLOOD_SPREAD)}*flood-p.y;
  outline=stormSoftUnion(outline,d);float weight=exp(clamp(d*.45,-40.,10.));
  flowSum+=vec2(0.,-1.)*weight;total+=weight;plain+=.6*weight;}
 ${STORM_FLOODPLAINS.map(fp=>`{
  float d=(sqrt(flood)-length((p-vec2(${f(fp.x)},${f(fp.z)}))/vec2(${f(fp.rx)},${f(fp.rz)})))*${f(fp.rz)};
  outline=stormSoftUnion(outline,d);float weight=exp(clamp(d*.45,-40.,10.));
  flowSum+=normalize(vec2(.2,-1.))*weight;total+=weight;plain+=weight;
 }`).join('\n')}
 dir=normalize(flowSum);shoal/=max(total,1e-16);plain/=max(total,1e-16);
 return outline+stormBankErosion(p);
}
// Shared smooth wave height for displacement and lighting; triangle face normals
// made the one-metre grid visible as diagonal patches in reflections.
float waterElevation(vec2 p,float shore,float plain,float clock){
 float a=-p.y;
 float swell=sin(a*.8-clock*2.1)*.085+sin(a*1.7+p.x*.4-clock*3.2)*.04;
 float breaker=pow(.5+.5*sin(a*1.35+sin(p.x*.7)*.8-clock*4.8),3.);
 swell+=flood*(breaker*.9+sin(a*.55+p.x*.6-clock*3.8)*.17);
 return max(.03,smoothstep(0.,3.,shore)*(.19+flood*.25+swell)*(1.-plain*.65));
}
`;
export const stormWaterVertex=`
precision highp float;
attribute vec3 position;
uniform mat4 worldViewProjection;uniform float time;
varying vec3 vWorld;
${shared}
void main(){
 flood=stormFloodAt(position.z,surgeAge);
 vec3 p=position;vec2 dir;float shoal,plain;
 float shore=stormWater(p.xz,dir,shoal,plain);
 p.y+=waterElevation(p.xz,shore,plain,time);
 vWorld=p;gl_Position=worldViewProjection*vec4(p,1.);
}`;
export const stormWaterFragment=`
precision highp float;
varying vec3 vWorld;
uniform float time,warning,daylight,lightning,fogDensity,anime;
uniform vec3 eye,fogColor;
uniform sampler2D waterNormal;
${shared}
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
vec2 hash2(vec2 p){return fract(sin(vec2(dot(p,vec2(127.1,311.7)),dot(p,vec2(269.5,183.3))))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),u=fract(p);u=u*u*(3.-2.*u);return mix(mix(hash(i),hash(i+vec2(1,0)),u.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),u.x),u.y);}
float waves(vec2 q,float rough){
 float h=0.,a=.5,fr=.55;mat2 m=mat2(1.6,1.2,-1.2,1.6);
 for(int i=0;i<3;i++){h+=a*(noise(q*fr)-.5);q=m*q+vec2(1.7,9.2);a*=.5-rough*.06;fr*=1.15;}
 return h;
}
// Reference: https://catlikecoding.com/unity/tutorials/flow/texture-distortion/
// Local velocity advects world-space UVs, never rotates the world position about its origin.
// Two triangular-weight phases hide reset (Catlike Coding / Valve flow mapping).
vec2 flowUV(vec2 p,vec2 dir,float speed,float phase){return p-dir*phase*speed*6.;}
float phaseMix(out float p0,out float p1){float t=time*.18;p0=fract(t);p1=fract(t+.5);return abs(p0-.5)*2.;}
float height(vec2 p,vec2 dir,float speed,float rough){
 float p0,p1,w=phaseMix(p0,p1);
 return mix(waves(flowUV(p,dir,speed,p0),rough),waves(flowUV(p,dir,speed,p1),rough),w);
}
float advected(vec2 p,vec2 dir,float speed,vec2 scale,float seed){
 float p0,p1,w=phaseMix(p0,p1);
 vec2 a=flowUV(p,dir,speed,p0)*scale,b=flowUV(p,dir,speed,p1)*scale;
 return mix(noise(a+seed)*.65+noise(a*2.7+seed)*.35,noise(b+seed)*.65+noise(b*2.7+seed)*.35,w);
}
vec2 rain(vec2 p){
 vec2 n=vec2(0.);
 for(int l=0;l<2;l++){
  vec2 cell=floor(p*(1.1+float(l)*.7)),local=fract(p*(1.1+float(l)*.7));
  vec2 c=hash2(cell+float(l)*17.),d=local-(.2+.6*c);
  float life=fract(time*.9+hash(cell+3.1)),r=length(d);
  float ring=sin((r-life*.55)*40.)*(1.-smoothstep(0.,.05,abs(r-life*.55)))*(1.-life);
  n+=normalize(d+1e-4)*ring;
 }
 return n*.07;
}
void main(){
 flood=stormFloodAt(vWorld.z,surgeAge);
 vec2 p=vWorld.xz,dir;float shoal,plain;
 float shore=stormWater(p,dir,shoal,plain);
 // Broken, asynchronous wash: small tongues advance and retreat within a shallow shelf.
 float bankVariation=noise(p*.38+vec2(8.1,3.7));
 float swash=sin(time*1.5+noise(p*.48)*6.28)*(.25+.55*bankVariation);
 shore+=swash*(1.-smoothstep(0.,5.,abs(shore)));
 if(shore< -4.5)discard;
 float shelfWidth=mix(2.2,4.8,bankVariation);
 float coverage=smoothstep(-.65,shelfWidth,shore);
 float wetCoverage=(1.-smoothstep(0.,4.5,max(0.,-shore)))*(.12+.16*bankVariation);
 float waterShore=max(0.,shore);
 float shallow=smoothstep(0.,1.,shoal)*(1.-flood);
 float depthM=mix(waterShore*mix(.45,.25,plain),min(.32,waterShore*.18),shallow)+flood*.7*coverage;
 float speed=mix(1.45+flood*2.3,.18,plain)*mix(.55,1.,smoothstep(0.,3.,shore)),rough=flood*(1.-plain);
 float e=.06,h=height(p,dir,speed,rough);
 vec2 grad=vec2(height(p+vec2(e,0.),dir,speed,rough)-h,height(p+vec2(0.,e),dir,speed,rough)-h)/e;
 // Painted ripple normals (storm-kit-v3/water-normal.png), advected downstream like everything else.
 {float p0,p1,w=phaseMix(p0,p1);
  vec2 na=texture2D(waterNormal,flowUV(p,dir,speed,p0)*.22).xy*2.-1.;
  vec2 nb=texture2D(waterNormal,flowUV(p,dir,speed,p1)*.22).xy*2.-1.;
  grad+=mix(na,nb,w)*mix(.4,.52,flood)*(1.-plain*.6);}
 // Shoals are choppy only while they're shallow; a surge evens them out with the channel.
 grad=grad*mix(.72,1.65,flood)*(1.+shoal*1.3*(1.-flood))+rain(p)*(1.-flood*.5);
 // Light the displaced wave faces as well as the fine ripple normals.
 float baseWave=waterElevation(p,shore,plain,time);
 vec2 macroSlope=vec2(waterElevation(p+vec2(.08,0.),shore,plain,time)-baseWave,
  waterElevation(p+vec2(0.,.08),shore,plain,time)-baseWave)/.08;
 vec3 face=normalize(vec3(-macroSlope.x,1.,-macroSlope.y));
 vec3 N=normalize(face+vec3(-grad.x,0.,-grad.y)),V=normalize(eye-vWorld);
 float fresnel=.02+.98*pow(1.-max(0.,dot(N,V)),5.);
 vec3 R=reflect(-V,N);
 float clouds=noise(R.xz/max(.2,abs(R.y)+.25)*1.5+vec2(time*.02,0.));
 vec3 sky=mix(vec3(.32,.39,.44),vec3(.12,.16,.20),smoothstep(0.,.7,R.y));
 sky=mix(sky,vec3(.46,.52,.56),smoothstep(.5,.85,clouds)*.5)*(.6+.4*daylight)+vec3(.55,.62,.7)*lightning;
 // Blue absorption in both states; entrained air lightens the surge toward glacial blue.
 vec3 sigma=mix(vec3(.72,.24,.10),vec3(.8,.30,.12),flood);
 vec3 trans=exp(-sigma*depthM*2.2)*(1.-flood*.85);
 vec3 deep=mix(vec3(.025,.16,.25),vec3(.07,.29,.43),flood);
 vec2 bedUV=p*1.6+N.xz*depthM*.45;
 vec3 bed=mix(vec3(.19,.28,.29),vec3(.38,.47,.46),noise(bedUV)*.6+noise(bedUV*3.1)*.4)*(.8+.2*noise(p*.3));
 vec3 body=mix(deep,bed,trans*.9);
 float sun=max(0.,dot(N,normalize(vec3(-.35,.8,-.45))));
 body+=vec3(.05,.12,.10)*smoothstep(.05,.3,h)*(1.-flood*.5);
 vec3 lit=body*(.4+.6*sun)*(.6+.4*daylight);
 vec3 Hv=normalize(normalize(vec3(-.35,.8,-.45))+V);
 float glint=pow(max(0.,dot(N,Hv)),mix(420.,140.,flood));
 // Whitewater is present at normal flow too: drifting rafts, breaking crests and shoal rapids.
 // The flood increases coverage; all layers share the channel velocity.
 float washPulse=.75+.35*sin(time*2.5+noise(p*.5)*5.);
 // Foam breaks into drifting islands instead of tracing a continuous white outline.
 float lace=(1.-smoothstep(.2,shelfWidth*washPulse,waterShore))*coverage
  *smoothstep(.52,.78,advected(p,dir,speed,vec2(1.4),0.))
  *smoothstep(.3,.65,noise(p*.55+dir*time*.18));
 float rockFoam=0.;
 ${STORM_RIVER_BOULDERS.map(b=>`rockFoam=max(rockFoam,1.-smoothstep(${f(b.scale)},${f(b.scale+1.8)},length(p-vec2(${f(b.x)},${f(b.z)}))));`).join('')}
 rockFoam*=smoothstep(.3,.7,advected(p,dir,speed,vec2(2.),73.));
 float streak=smoothstep(.44,.7,advected(p,dir,speed,vec2(1.2,1.2),11.))*smoothstep(1.,4.,shore)*(1.-plain)*(.85+.15*flood);
 float caps=smoothstep(.015,.14,h)*smoothstep(.42,.7,advected(p,dir,speed,vec2(2.6,1.1),23.))*(.65+.35*flood)*(1.-plain);
 float rapids=shallow*(1.-plain)*smoothstep(.4,.7,advected(p,dir,speed,vec2(1.8,1.8),37.))*.9;
 float aeration=(.22+.78*flood)*(1.-plain)*smoothstep(.42,.76,advected(p,dir,speed,vec2(.65,.65),51.));
 float foam=clamp(lace*.85+rockFoam*.9+streak+caps*.8+rapids*.65+aeration*.85,0.,1.);
 if(anime>.5&&flood<.01){
  float band=sun<.35?.6:sun<.75?.82:1.;
  lit=body*band*(.6+.4*daylight);
  fresnel=.06+fresnel*.65;
  glint=smoothstep(.15,.8,glint)*.8;
  foam=smoothstep(.06,.72,foam)*.95;
 }
 vec3 color=mix(lit,sky,fresnel)+vec3(.95,.92,.85)*glint*(.25+.75*daylight);
 color=mix(color,vec3(.82,.93,1.)*(.6+.4*daylight),foam*.95);
 
 float alert=(1.-smoothstep(.05,.5,shore))*warning*(.5+.5*sin(time*3.));
 color=mix(color,vec3(.95,.48,.12),alert*.55);
 float fog=1.-exp(-pow(length(vWorld-eye)*fogDensity,2.));color=mix(color,fogColor,fog);
 // One continuous composite across wet ground, transparent shallows, foam and deep water.
 // Neither alpha nor color switches at the nominal bank; the real bed shows through.
 float bodyAlpha=coverage*mix(mix(.96,.48,shallow),.98,flood);
 float alpha=bodyAlpha+wetCoverage*(1.-bodyAlpha);
 vec3 wetColor=vec3(.035,.085,.105)*(.6+.4*daylight);
 wetColor=mix(wetColor,fogColor,fog);
 color=(color*bodyAlpha+wetColor*wetCoverage*(1.-bodyAlpha))/max(alpha,.001);
 gl_FragColor=vec4(color,alpha);
}`;

