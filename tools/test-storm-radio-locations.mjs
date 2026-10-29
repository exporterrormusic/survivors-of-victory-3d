import assert from 'node:assert/strict';
import { RADIO_CASE_SPOTS, RADIO_RECEPTION_SPOTS, pickRadioLocations } from '../src/survivor/storm-radio-locations.ts';
import { nearWater, inThicket, stormPlacements } from '../src/survivor/storm-layout.ts';
import { STORM_RADIUS, STORM_FLOOD_SPREAD, stormLakeEdge } from '../src/survivor/storm-field.ts';
import { lastDistressDistance, FALLEN_LINES } from '../src/survivor/storm-radio-story.ts';

for (const start of [25, 40, 70, 100]) {
  const trigger = lastDistressDistance(start);
  assert.ok(trigger > 12 && trigger < Math.max(23, start - 5));
}
assert.deepEqual(Object.values(FALLEN_LINES), ['I was too late...', 'Rest my sisters...', 'Ye shall be avenged...']);

const props = stormPlacements().filter(p => !p.walkable);
for (const spot of [...RADIO_CASE_SPOTS, ...RADIO_RECEPTION_SPOTS]) {
  assert.ok(Math.hypot(spot.x, spot.z) < STORM_RADIUS - 5, 'inside the playable boundary');
  assert.ok(!nearWater(spot.x, spot.z, 1), 'dry even at full river flood');
  assert.ok(spot.z > stormLakeEdge(spot.x) + STORM_FLOOD_SPREAD + 1, 'above the flooded lakeshore');
  assert.ok(!inThicket(spot.x, spot.z, 2), 'outside tree clumps');
  assert.ok(props.every(p => Math.hypot(p.x - spot.x, p.z - spot.z) > p.scale * 2 + 2), 'room to approach without decorative obstacles');
}
const cases = new Set(), receptions = new Set();
for (let c = 0; c < 3; c++) for (let r = 0; r < 100; r++) {
  const rolls = [(c + .5) / 3, r / 100];
  const { crate, reception } = pickRadioLocations(() => rolls.shift());
  cases.add(crate); receptions.add(reception);
  assert.ok(Math.hypot(crate.x - reception.x, crate.z - reception.z) >= 25, 'reception requires searching away from the case');
  assert.ok(reception.clue.length > 0, 'each destination supplies a matching spoken clue');
}
assert.equal(cases.size, RADIO_CASE_SPOTS.length);
assert.equal(receptions.size, RADIO_RECEPTION_SPOTS.length);
console.log('PASS: every random case/reception location is selectable, dry, clear, and separated.');
