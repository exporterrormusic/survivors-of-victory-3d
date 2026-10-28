/** Shared fixed shaft footprint; independent of the moving platform height. */
// Face the test-range camera squarely; all shaft and weather masks share this yaw.
export const ELEVATOR_YAW = 0;
export const SHAFT_HALF_WIDTH = 3.5;
export const ELEVATOR_ORIGIN={x:0,z:0};
export function setElevatorOrigin(x:number,z:number):void{ELEVATOR_ORIGIN.x=x;ELEVATOR_ORIGIN.z=z;}
// Exclude only the open shaft. Weather extends under the fixed black foundation
// (outer edge 3.86 m), which hides the snow grid's stepped cutout and filtering.
// Expanding this mask beyond the foundation exposes a bare-ground border.
export const ELEVATOR_EFFECT_HALF_WIDTH = SHAFT_HALF_WIDTH;
export function onElevatorFootprint(x: number, z: number, padding = 0): boolean {
  x-=ELEVATOR_ORIGIN.x;z-=ELEVATOR_ORIGIN.z;
  const c = Math.cos(ELEVATOR_YAW), s = Math.sin(ELEVATOR_YAW);
  return Math.max(Math.abs(c*x-s*z), Math.abs(s*x+c*z)) <= ELEVATOR_EFFECT_HALF_WIDTH + padding;
}
export const elevatorGroundMaskGLSL = `
  uniform float excludeElevatorGround;
  uniform vec2 elevatorOrigin;
  bool onElevatorGround(vec2 p) {
    p-=elevatorOrigin;
    vec2 local = mat2(${Math.cos(ELEVATOR_YAW)}, ${Math.sin(ELEVATOR_YAW)}, ${-Math.sin(ELEVATOR_YAW)}, ${Math.cos(ELEVATOR_YAW)}) * p;
    return excludeElevatorGround > .5 && max(abs(local.x), abs(local.y)) <= ${ELEVATOR_EFFECT_HALF_WIDTH};
  }
`;
