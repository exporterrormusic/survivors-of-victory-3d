# The Frozen North: Frozen Lake (v3)

Replaces the Sidewinder-style layout (ridge, roofed tunnel, mountain vault), which
trapped players and hid the snow.

## Layout (arena radius 54 m)

- The **lift** is at the centre, on open snow. The nearest ice is about 10 m away.
- There are **two frozen lakes**, covering about 49% of the arena. Each is a union of
  overlapping blobs (`LAKES` in `src/survivor/frozen-lake.ts`):
  - the north-west lake reaches up and right across the top;
  - the south-east lake mirrors it, with an extra blob reaching further down and left.
  The north-east and south-west diagonals are open snow.
- **Shore:** the snow thins out over the outer 3.5 m of ice along an uneven line, and the
  ice frosts to the snow's colour over the same band.
- **Border:** four rows of pines, then overlapping mountains. There are no props in play space.

## The ice (tuning constants at the top of frozen-lake.ts)

- **Snow is the safe area full of enemies; ice is open space with a time limit.**
  - Ground Raptures hesitate at the shore for 1.5–3 s (`LAKE_HESITATION`) before
    following you onto the ice, and move at 80% speed on it.
  - They steer around open water (`avoidHoles`). Raptures caught by a collapse climb
    out to the nearest solid footing (`escape`), taking the slow and damage on the way.
  - Hovering Raptures ignore the ice.
- **Only the player cracks the ice,** within 2.5 m, moving or standing still
  (`LAKE_CRACK_RATE`). Enemies never add to cracking or collapses.
- **One shared boundary:** `lakeSurface()` is the line where the drawn frost fades to half.
  Cracking, holes, being "on the ice" and enemy hesitation all use it, so the frosted
  shore strip behaves like snow.
- **Healing is very slow** (`LAKE_HEAL`), so repeated fighting in one area adds up.
- **Collapse:**
  - When a spot reaches full stress, it pulses for 1.5 s (`LAKE_WARNING`), then breaks.
  - The break opens a 5 m core, every connected cell above 27% stress
    (`LAKE_CHAIN`), and a ragged 4 m margin (`LAKE_TEAR`).
  - Constant walking over one area collapses it in about 8 s; one collapse opens about 350 m².
- Holes only open on visible ice. Water depth uses the
  same edge as the drawn hole, so the area that hurts is exactly the area you see.
- **Inside a hole:** the same slow and damage rate as the storm river (up to 52% slower,
  14% of max HP per 0.9 s at full depth). The player's damage drains smoothly each frame,
  with a steady soft red outline and no hit burst or camera shake. Enemies take ticks. The player sinks 0.7 m and walks out.
- Holes refreeze after 22 s, weak (stress 0.4), so they rejoin the next collapse.
- **Crack stages** (`frozen-lake-view.ts`), each drawn as a dark core inside a white halo:
  - From stress 0.03: hairlines.
  - From 0.3: a dense web of wide fractures.
  - From 0.7: milky splintered ice that pulses.

## Tests

- `tools/test-frozen-lake.mjs`: logic.
- `tools/test-frozen-layout.mjs`: layout and snow.
- `tools/verify-frozen-lake.mjs`: browser screenshots. Set `FROZEN_PATCH_STORM=1`
  while the storm-kit startup bug exists.

## Ideas for later

- Sliding on ice (momentum).
- Burst or explosions crack the area they hit.
- The frozen-lake boss's slams shatter the ice.
- Sound and splash effects for cracking, breaking and falling in.
- Enemies avoiding holes.

## Unused kit

`frozen-outcrop`, `frozen-barrier` and `frozen-beacon` are in `frozen-kit.ts`, but nothing
places them. The vault is unused too.
