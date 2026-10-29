// A guest's controls on the host: the latest PlayerInput from the network, read through the same
// InputSource a keyboard or bot uses. Presses and releases are edges between consecutive inputs;
// CoopHost.takeInput already folds in taps that came and went between host frames.

import { Vector3 } from '@babylonjs/core';
import { Button, type PlayerInput } from '../../net/protocol';
import type { Action, InputSource } from '../input';

const BITS: Partial<Record<Action, number>> = {
  fire: Button.fire, special: Button.special, burst: Button.burst, dash: Button.dash, reload: Button.reload,
};

/** The Button bits any controls are holding right now (for snapshots). */
export function heldBits(input: InputSource): number {
  let bits = 0;
  for (const [action, bit] of Object.entries(BITS) as [Action, number][]) if (input.isHeld(action)) bits |= bit;
  return bits;
}

export class RemoteInput implements InputSource {
  readonly aim = new Vector3();
  private buttons = 0;
  private pressedBits = 0;
  private releasedBits = 0;
  private moveX = 0;
  private moveZ = 0;
  /** the guest's own position for its hero, when it sends one */
  reported: { x: number; z: number } | null = null;

  /** Take this frame's input (or keep the last one when none arrived). */
  apply(input: PlayerInput | undefined): void {
    if (!input) { this.pressedBits = this.releasedBits = 0; return; }
    this.pressedBits = input.buttons & ~this.buttons;
    this.releasedBits = this.buttons & ~input.buttons;
    this.buttons = input.buttons;
    const length = Math.hypot(input.moveX, input.moveZ);
    this.moveX = length > 1 ? input.moveX / length : input.moveX;
    this.moveZ = length > 1 ? input.moveZ / length : input.moveZ;
    this.aim.set(input.aimX, 0, input.aimZ);
    this.reported = input.x !== undefined && input.z !== undefined ? { x: input.x, z: input.z } : null;
  }

  get buttonBits(): number { return this.buttons; }

  /** The guest dropped: stand still, let go of everything. */
  release(): void { this.apply({ seq: 0, moveX: 0, moveZ: 0, aimX: this.aim.x, aimZ: this.aim.z, buttons: 0 }); }

  move(): [number, number] { return [this.moveX, this.moveZ]; }
  isHeld(action: Action): boolean { return (this.buttons & (BITS[action] ?? 0)) !== 0; }
  wasPressed(action: Action): boolean {
    const bit = BITS[action] ?? 0;
    const hit = (this.pressedBits & bit) !== 0;
    this.pressedBits &= ~bit;
    return hit;
  }
  wasReleased(action: Action): boolean {
    const bit = BITS[action] ?? 0;
    const hit = (this.releasedBits & bit) !== 0;
    this.releasedBits &= ~bit;
    return hit;
  }
}
