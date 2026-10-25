import { Material, type MaterialDefines, MaterialPluginBase, PBRMaterial, RegisterMaterialPlugin,
  type Scene, StandardMaterial, type UniformBuffer, Vector3 } from '@babylonjs/core';

interface AuraState { position: Vector3; power: number; clock: number }
const states = new WeakMap<Scene,AuraState>();

/** Soft local fill evaluated on the actual geometry, including displaced snow. */
class PlayerNightAura extends MaterialPluginBase {
  constructor(material: StandardMaterial | PBRMaterial, private readonly state: AuraState) {
    super(material,'PlayerNightAura',280,{ PLAYER_NIGHT_AURA: false },true,true);
    this.doNotSerialize = true;
  }
  override getClassName(): string { return 'PlayerNightAura'; }
  override prepareDefines(defines: MaterialDefines): void {
    const material = this._material as StandardMaterial | PBRMaterial;
    (defines as MaterialDefines & { PLAYER_NIGHT_AURA: boolean }).PLAYER_NIGHT_AURA =
      !material.disableLighting && material.metadata?.anime !== false;
  }
  override getUniforms() {
    return {
      ubo: [{ name: 'playerAuraPosition', size: 3, type: 'vec3' }, { name: 'playerAuraPower', size: 1, type: 'float' }, { name: 'playerAuraClock', size: 1, type: 'float' }],
      fragment: '#ifdef PLAYER_NIGHT_AURA\nuniform vec3 playerAuraPosition;\nuniform float playerAuraPower;\nuniform float playerAuraClock;\n#endif',
    };
  }
  override bindForSubMesh(buffer: UniformBuffer): void {
    const p = this.state.position;
    buffer.updateFloat3('playerAuraPosition',p.x,p.y+.6,p.z);
    buffer.updateFloat('playerAuraPower',this.state.power);buffer.updateFloat('playerAuraClock',this.state.clock);
  }
  override getCustomCode(type: string): Record<string,string> | null {
    if (type !== 'fragment') return null;
    return {
      CUSTOM_FRAGMENT_DEFINITIONS: `
        #ifdef PLAYER_NIGHT_AURA
        float playerAuraPulse(float radius, float phase) {
          float reach = mix(.38,.98,phase);
          return exp(-3.5 * radius * radius / (reach * reach)) * pow(sin(phase * 3.14159265),2.0);
        }
        #endif
      `,
      CUSTOM_FRAGMENT_BEFORE_FOG: `
        #ifdef PLAYER_NIGHT_AURA
          if (playerAuraPower > .001) {
            vec3 auraDelta = vPositionW - playerAuraPosition;
            float auraRadius = length(auraDelta.xz) / 3.5;
            if (auraRadius < 1.0 && abs(auraDelta.y) < 4.0) {
              float auraGlow = exp(-auraRadius * auraRadius * 13.0) * .6;
              auraGlow += (playerAuraPulse(auraRadius,fract(playerAuraClock / 3.6))
                + playerAuraPulse(auraRadius,fract(playerAuraClock / 3.6 + .5))) * .8;
              auraGlow *= (1.0-smoothstep(.72,1.0,auraRadius)) * exp(-auraDelta.y*auraDelta.y*.6) * playerAuraPower;
              ${this._material instanceof PBRMaterial ? 'finalColor' : 'color'}.rgb += vec3(.035,.050,.075) * auraGlow;
            }
          }
        #endif
      `,
    };
  }
}

function attach(material: Material): PlayerNightAura | null {
  const state = states.get(material.getScene());
  return state && (material instanceof StandardMaterial || material instanceof PBRMaterial)
    && !material.pluginManager?.getPlugin('PlayerNightAura') ? new PlayerNightAura(material,state) : null;
}

/** Follows the player in world space, with no extra mesh, texture or rendering pass. */
export class NightAura {
  private readonly state: AuraState = { position: new Vector3(), power: 0, clock: 0 };
  constructor(private readonly scene: Scene) {
    states.set(scene,this.state);
    RegisterMaterialPlugin('PlayerNightAura',attach);
    for (const material of scene.materials) attach(material);
  }
  update(age: number, night: number, position: Vector3 | null, reducedMotion: boolean): void {
    this.state.power = position ? night : 0;
    if (!position) return;
    this.state.position.copyFrom(position);
    this.state.clock = reducedMotion ? .9 : age;
  }
  dispose(): void { this.state.power = 0;states.delete(this.scene); }
}
