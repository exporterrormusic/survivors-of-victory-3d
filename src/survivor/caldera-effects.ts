import { lavaNoiseGLSL } from './caldera-materials';
export const calderaEffectVertex=`precision highp float;attribute vec3 position;attribute vec2 uv;
 uniform mat4 world,worldViewProjection;varying vec2 vUV;varying vec3 vWorld;
 void main(){vUV=uv;vWorld=(world*vec4(position,1.)).xyz;gl_Position=worldViewProjection*vec4(position,1.);}`;
const common=`precision highp float;varying vec2 vUV;varying vec3 vWorld;
 uniform sampler2D lavaTex;uniform float time,fogDensity;uniform vec3 eye,fogColor;${lavaNoiseGLSL}`;
export const calderaFissureFragment=common+`
 uniform float edge,advance;
 vec2 ch2(vec2 p){return vec2(chash(p),chash(p+vec2(71.2,19.8)));}
 float cracks(vec2 p){vec2 i=floor(p),f=fract(p);float d1=8.,d2=8.;
 for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){vec2 g=vec2(x,y),r=g+ch2(i+g)-f;float d=dot(r,r);if(d<d1){d2=d1;d1=d;}else if(d<d2)d2=d;}
 return sqrt(d2)-sqrt(d1);}
 void main(){vec2 p=vWorld.xz;float r=length(p),a=atan(p.y,p.x);
 // Distance in from the lava shoreline (shared with the lava sea and gameplay); heat comes from the lava.
 float gap=-calderaShoreDepth(p,time,advance);
 if(gap<-.2)discard;
 float heat=1.-smoothstep(.5,9.+6.*cnoise(p*.08),gap);
 vec2 warped=p+vec2(cnoise(p*.2),cnoise(p*.2+9.))*2.8+vec2(cnoise(p*1.4),cnoise(p*1.4+5.))*.4;
 float seam=cracks(warped*.17);
 // Cracks widen and brighten with heat; a soft glow surrounds the hottest ones.
 float width=mix(.004,.022,heat*heat);
 float line=1.-smoothstep(width*.3,width,seam);
 float halo=(1.-smoothstep(width,width*4.5+.05,seam))*heat*heat;
 float density=smoothstep(.3,.75,heat-.45*cnoise(p*.35));
 float quiet=smoothstep(1.4,3.,min(abs(p.x),abs(p.y+7.)))*.6+.4;
 // Scorched ground darkens toward the lava; a narrow hot halo hugs the moving edge.
 float scorch=(1.-smoothstep(0.,6.+2.*cnoise(p*.15),gap))*.55;
 float edgeGlow=1.-smoothstep(0.,1.6,gap);
 float alpha=max(max(line*density*.85,halo*density*.35*quiet),max(scorch,edgeGlow*.8));
 if(alpha<.015)discard;
 vec3 tex=flowingLava(lavaTex,p*.12,time,vec2(.3,.7));
 float pulse=.85+.15*sin(time*1.3+cnoise(p*.3)*6.);
 vec3 color=mix(vec3(.45,.07,.01),vec3(1.2,.36,.04),line*density)*(.75+.25*tex.r)*pulse;
 float glowShare=max(line*density,max(halo*density*.5,edgeGlow*edgeGlow))/max(alpha,.001);
 color=mix(vec3(.03,.022,.02),color+vec3(.5,.15,.02)*edgeGlow*edgeGlow*pulse,clamp(glowShare,0.,1.));
 gl_FragColor=vec4(calderaFog(color,vWorld,eye,fogColor,fogDensity),alpha);}`;
// A molten strip (the giant-meteor egg's fire trail): lava-sea surface inside a ragged band around the
// segment a..b, and the sea's cinder border (scorch, glowing cracks, hot edge) outside it. heat cools
// the whole strip to crust; scorch fades it away, like a crater.
export const calderaTrailFragment=common+`
 uniform vec2 a,b;uniform float halfWidth,pool,heat,scorch,seed;uniform sampler2D basaltTex;
 void main(){vec2 p=vWorld.xz,ab=b-a;
 float t=clamp(dot(p-a,ab)/max(dot(ab,ab),.0001),0.,1.);
 // The strip and its pool (the crater) merge with a smooth union, so there is no seam between them.
 float g1=halfWidth-length(p-a-ab*t),g2=pool-length(p-a),h=clamp(.5+.5*(g1-g2)/4.,0.,1.);
 float gap=mix(g2,g1,h)+4.*h*(1.-h)+(cnoise(p*.21+seed)-.5)*2.2+(cnoise(p*.8+seed)-.5)*.6;
 vec3 tex=flowingLava(lavaTex,p*.12+seed,time,normalize(ab+vec2(.0001))*.4);
 float pulse=.8+.2*sin(time*1.7+cnoise(p*.4)*9.);
 if(gap>=0.){
   // Inside: lava with the sea's hot lip and drifting skins. It cools to still basalt, as a crater
   // does (calderaCraterFragment): a flowing dark crust read as water.
   vec3 cold=texture2D(basaltTex,p*.42).rgb*.58;
   vec3 color=mix(cold,lavaColor(tex,heat),smoothstep(0.,.35,heat));
   float lip=1.-smoothstep(0.,.7,gap);
   float skins=smoothstep(.48,.62,cnoise(p*.55+vec2(time*.04,time*.025)))*smoothstep(.4,1.,gap)*(1.-smoothstep(1.5,4.,gap));
   color=mix(color,vec3(.06,.035,.03),skins*.85*heat);
   color=mix(color,vec3(1.5,.62,.12)*pulse,lip*.85*heat);
   gl_FragColor=vec4(calderaFog(color,vWorld,eye,fogColor,fogDensity),scorch);return;
 }
 // Outside: the cinder border, as on the lava sea's shore (calderaFissureFragment), narrower.
 float g=-gap;
 float near=1.-smoothstep(.3,5.+3.*cnoise(p*.08+seed),g);
 vec2 warped=p+vec2(cnoise(p*.2),cnoise(p*.2+9.))*2.8+vec2(cnoise(p*1.4),cnoise(p*1.4+5.))*.4;
 float seam=crackSeam(warped*.17);
 float hot=near*heat;
 float width=mix(.004,.022,hot*hot);
 float line=1.-smoothstep(width*.3,width,seam);
 float halo=(1.-smoothstep(width,width*4.5+.05,seam))*hot*hot;
 float density=smoothstep(.3,.75,near-.45*cnoise(p*.35));
 float burnt=(1.-smoothstep(0.,4.+2.*cnoise(p*.15),g))*.55;
 float edgeGlow=(1.-smoothstep(0.,1.4,g))*heat;
 float alpha=max(max(line*density*.85*heat,halo*density*.35),max(burnt,edgeGlow*.8))*scorch;
 if(alpha<.015)discard;
 vec3 color=mix(vec3(.45,.07,.01),vec3(1.2,.36,.04),line*density)*(.75+.25*tex.r)*pulse;
 float glowShare=max(line*density*heat,max(halo*density*.5,edgeGlow*edgeGlow))/max(alpha/max(scorch,.001),.001);
 color=mix(vec3(.03,.022,.02),color+vec3(.5,.15,.02)*edgeGlow*edgeGlow*pulse,clamp(glowShare,0.,1.));
 gl_FragColor=vec4(calderaFog(color,vWorld,eye,fogColor,fogDensity),alpha);}`;
export const calderaCraterFragment=common+`
 uniform float heat,scorch,seed,crumble,rimBand;uniform sampler2D basaltTex;
 void main(){vec2 q=(vUV-.5)*2.;float a=atan(q.y,q.x),d=length(q)*(1.+.055*sin(a*7.+seed)+.025*sin(a*13.));
 // The disc must stay under the rim's ridge (r 2.05 m = d .71), never past its outer lip.
 float pit=1.-smoothstep(.64,.72,d);if(pit<.005)discard;
 vec3 tex=flowingLava(lavaTex,vUV*1.8+seed,time,vec2(.25,.6));
 // rimBand 0 (giant crater): molten right to the edge, no cold stone band.
 float cooling=heat*(1.-smoothstep(.4,.66,d)*rimBand);
 vec3 cold=texture2D(basaltTex,vWorld.xz*.42).rgb*.58;
 vec3 col=mix(cold,lavaColor(tex,cooling),smoothstep(0.,.35,cooling));
 float rim=smoothstep(.46,.66,d)*rimBand;col=mix(col,cold*.5,rim*.8);
 gl_FragColor=vec4(calderaFog(col,vWorld,eye,fogColor,fogDensity),pit*max(scorch,cooling));}`;
