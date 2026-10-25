// Positional falloff for world sounds: full volume within `near` metres of the listener (the
// camera focus), silent past `far`, panned by horizontal offset.
import type { Vector3 } from '@babylonjs/core';
import { audioEngine } from './audio-engine';
import type { Cue } from './sound-bank';

export interface Falloff {
  near: number;
  far: number;
  /** metres of horizontal offset that pan fully to one side */
  panWidth: number;
}

/** `listener` is read on every call, so pass a vector that follows the camera. */
export function positionalSound(listener: Vector3, { near, far, panWidth }: Falloff): (cue: Cue, at: Vector3, gain?: number) => void {
  return (cue, at, gain = 1) => {
    const dx = at.x - listener.x, dz = at.z - listener.z, distance = Math.hypot(dx, dz);
    const falloff = Math.max(0, Math.min(1, 1 - (distance - near) / (far - near)));
    if (falloff > 0) audioEngine.play(cue, gain * falloff, dx / panWidth);
  };
}
