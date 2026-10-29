import assert from 'node:assert/strict';
import {palmOverlaps} from '../src/survivor/nayuta/palm-hit.ts';
assert.ok(palmOverlaps(4,1.6,.4,7,1.25),'ordinary enemy grazing first palm');
assert.ok(palmOverlaps(14,2.6,.4,16,2.25),'finisher edge contact');
assert.ok(palmOverlaps(5,2.4,1.2,7,1.25),'full large-enemy footprint');
assert.ok(palmOverlaps(-.2,0,.4,7,1.25),'overlapping enemy at caster');
assert.ok(!palmOverlaps(-1,0,.4,7,1.25),'enemy behind caster');
assert.ok(!palmOverlaps(8,0,.4,7,1.25),'enemy beyond range');
assert.ok(!palmOverlaps(4,2,.4,7,1.25),'enemy outside first palm');
assert.ok(!palmOverlaps(4,3,.4,16,2.25),'enemy outside finisher');
assert.ok(!palmOverlaps(7.35,1.6,.4,7,1.25),'rounded target misses corner');
assert.ok(!palmOverlaps(5,0,.4,3,2.25),'clipped strike stops before target');
console.log('PASS: palm footprint, edge contact, large targets, corners, rear and range limits.');

assert.ok(palmOverlaps(9,2.8,.4,10,2.5),'first and second palm broad edge');
assert.ok(palmOverlaps(14,4.5,.4,16,4.25),'huge finisher broad edge');
assert.ok(!palmOverlaps(5,3.1,.4,10,2.5),'outside new ordinary strike');
assert.ok(!palmOverlaps(14,5,.4,16,4.25),'outside new finisher');
