export const DISTRESS_CALL = 'Requ—… requesting reinfor—krrsh… reinforcements…!';
export const LAST_DISTRESS_CALL = 'Too many...';
export const FALLEN_LINES: Record<string, string> = {
  'snow-white': 'I was too late...',
  rapunzel: 'Rest my sisters...',
  scarlet: 'Ye shall be avenged...',
  nayuta: 'Ye shall be avenged...',
};
/** Halfway between the former direction hint and the original 12 m final-call trigger. */
export function lastDistressDistance(startDistance: number): number {
  return (Math.max(23, startDistance - 5) + 12) / 2;
}
