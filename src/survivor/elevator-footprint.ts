/** Shared fixed shaft footprint; independent of the moving platform height. */
export const ELEVATOR_YAW = .42;
export const SHAFT_HALF_WIDTH = 3.5;
// Exclude only the open shaft. Weather extends under the fixed black foundation
// (outer edge 3.86 m), which hides the snow grid's stepped cutout and filtering.
// Expanding this mask beyond the foundation exposes a bare-ground border.
export const ELEVATOR_EFFECT_HALF_WIDTH = SHAFT_HALF_WIDTH;
export function onElevatorFootprint(x: number, z: number, padding = 0): boolean {
  const c = Math.cos(ELEVATOR_YAW), s = Math.sin(ELEVATOR_YAW);
  return Math.max(Math.abs(c*x-s*z), Math.abs(s*x+c*z)) <= ELEVATOR_EFFECT_HALF_WIDTH + padding;
}
export const elevatorGroundMaskGLSL = `
  uniform float excludeElevatorGround;
  bool onElevatorGround(vec2 p) {
    vec2 local = mat2(${Math.cos(ELEVATOR_YAW)}, ${Math.sin(ELEVATOR_YAW)}, ${-Math.sin(ELEVATOR_YAW)}, ${Math.cos(ELEVATOR_YAW)}) * p;
    return excludeElevatorGround > .5 && max(abs(local.x), abs(local.y)) <= ${ELEVATOR_EFFECT_HALF_WIDTH};
  }
`;
