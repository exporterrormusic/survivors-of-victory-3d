// Development-only matched comparison (?shader-compare): the same pose, camera, weather and
// lighting with the shader polish off or on. The run loop freezes the range after one second.
import type { Vector3 } from '@babylonjs/core';
import type { createVisualSettings } from '../visuals';
import type { Atmosphere } from './atmosphere';
import type { SnowLayer } from './snow';
import type { TargetField } from './targets';
import type { WaterLayer } from './water';

export interface ShaderCompareScene {
  hud: HTMLElement;
  visuals: ReturnType<typeof createVisualSettings>;
  atmosphere: Atmosphere;
  snow: SnowLayer;
  water: WaterLayer;
  targets: TargetField;
  focus: Vector3;
}

export function mountShaderCompare({ hud, visuals, atmosphere, snow, water, targets, focus }: ShaderCompareScene): void {
  visuals.apply('daylight');
  visuals.setAmbientShadows(true);
  atmosphere.set('day', 'clear');
  atmosphere.update(60, focus);
  snow.enabled = false;
  water.setPreset('off');
  targets.setMovement('hold');
  const compare = document.createElement('div');
  compare.style.cssText = 'position:absolute;top:65px;left:14px;z-index:20;display:flex;gap:8px;pointer-events:auto;background:#111e;padding:10px;color:white';
  compare.innerHTML = '<button type="button">Before shaders</button><button type="button">After shaders</button><span>AFTER ? matched daylight</span>';
  const buttons = compare.querySelectorAll('button');
  buttons.forEach((button, i) => button.addEventListener('click', () => {
    visuals.setPolish(i === 1);
    compare.querySelector('span')!.textContent = `${i === 1 ? 'AFTER' : 'BEFORE'} ? matched daylight`;
  }));
  hud.append(compare);
}
