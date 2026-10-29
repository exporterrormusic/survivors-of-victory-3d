import { channelOf, STORM_FLOOD_SPREAD } from './storm-field.ts';

/** Authored dry, open areas; randomize once, never while the player follows a signal. */
export const RADIO_RECEPTION_SPOTS = [
  { x: -46, z: 20, clue: 'the western pine clearing' },
  { x: -45, z: -15, clue: 'the open ground southwest of the pines' },
  { x: 0, z: 10, clue: 'the north side of the central island' },
  { x: 15, z: -38, clue: 'the south side of the central island' },
  { x: 48, z: 5, clue: 'the open slate on the eastern bank' },
] as const;

export const RADIO_CASE_SPOTS = ([['west', 10, -1], ['west', -32, -1], ['east', -12, 1]] as const).map(([id, z, side]) => {
  const channel = channelOf(id);
  return { x: channel.center(z) + side * (channel.half(z) + STORM_FLOOD_SPREAD + 2.5), z };
});

export function pickRadioLocations(random = Math.random) {
  const crate = RADIO_CASE_SPOTS[Math.min(RADIO_CASE_SPOTS.length - 1, Math.floor(random() * RADIO_CASE_SPOTS.length))];
  // Leave a real search between finding the radio and receiving the transmission.
  const options = RADIO_RECEPTION_SPOTS.filter(p => Math.hypot(p.x - crate.x, p.z - crate.z) >= 25);
  const reception = options[Math.min(options.length - 1, Math.floor(random() * options.length))];
  return { crate, reception };
}
