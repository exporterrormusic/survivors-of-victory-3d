import { Effect, ParticleSystem, type Scene } from '@babylonjs/core';
import { particlesPixelShader } from '@babylonjs/core/Shaders/particles.fragment';

/** Compact irregular ember chips that cool and tumble without velocity stretching.
 * Uses Babylon's particle pipeline to preserve fog, depth and image processing. */
export function applyCraterSparkShader(particles:ParticleSystem,scene:Scene):void{
  const name='craterTaperedSpark';
  Effect.ShadersStore[`${name}PixelShader`]=particlesPixelShader.shader.replace(
    'vec4 textureColor=texture2D(diffuseSampler,vUV);',`
      vec2 q=vUV*2.-1.;
      float chip=abs(q.x)*.85+abs(q.y)*1.1;
      float alpha=1.-smoothstep(.3,.7,chip);
      float core=1.-smoothstep(.05,.3,length(q));
      if(alpha*vColor.a<.015)discard;
      vec4 textureColor=vec4(mix(vec3(1.,.32,.035),vec3(1.,.86,.38),core),alpha);
    `);
  const defines:string[]=[];
  particles.fillDefines(defines,particles.blendMode);
  particles.setCustomEffect(scene.getEngine().createEffectForParticles(name,[],[],defines.join('\n'),undefined,undefined,undefined,particles),particles.blendMode);
}

