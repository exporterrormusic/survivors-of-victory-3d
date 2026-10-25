# Restored lift tower — 2026-10-25

## Descent and sealing revision

The user requested flatter S06 deck plates, removal of intersecting light-grey footings,
and an actual departure that hides the character and seals the shaft.

- `deck-steel-v4.png` replaces the framed tile texture. Exact built-in ImageGen prompt: `deck-prompts.json`.
- Fixed tower moved 0.95 m rearward; closest footing is z=3.53 m, beyond the 3.5 m shaft half-width.
- Shaft widened for the cage's pistons and rails and deepened to 13.5 m; platform descends 12 m.
- Two armored shutters close progressively after the cage is 3.4 m below ground. They fully retract before ascent.
- `src/survivor/elevator-motion.ts` supplies testable motion/interlocks; `range-lift-ride.ts` carries and locks the passenger,
  hides the model and overhead HP bar, stops the range, and shows extraction complete with Replay / Return to Ark.
- Extract & seal ends the range when aboard. Preview full cycle returns without ending it; an empty lift can be inspected.
- `tools/test-elevator-motion.mjs` checks clearance, reversal, interruption, pause and cycles.
- Browser verification checks the actual controls, passenger height, hidden model, frozen clock, replay, and fixed-mast clearance.

The earlier preview notes below describe the original iteration; passenger transport is now implemented in the range.

The user corrected the target from S01's low arrival platform to **S06-boarding.png**:
the tall restored lift tower, broad hazard panels, amber beacons, cyan rails and ground ring.
S06 is the primary reference. Supporting NIKKE style reference was inspected from
[the official NIKKE Japan account](https://twitter.com/NIKKE_japan/status/1586644079793741825),
cached in `references/nikke-official-ark-elevator.jpg` for reference only.

## Editable source and output

- `src/survivor/arrival-elevator.ts`: bevel geometry, materials, batched meshes, animations, preview controls.
- `src/survivor/lift-tower-geometry.ts`: S06 construction. Deck center (0,0), 6 m square;
  20 m structural mast plus crown; yaw 0.42 rad. Fixed mast and independently moving cage/gates.
- `public/environment/arrival-elevator-v2/tower-atlas-v3.png`: current generated texture atlas.
- `tower-prompts.json`: exact prompt and references; generated with the built-in image_gen tool.
- `steel-atlas.png` / `prompts.json`: retained earlier material iteration, no longer loaded.
- `/elevator-review.html`: visual review page. Runtime preview is in the Test Range.

Controls: Weather Lab → Restored lift tower → Open / Close / Lower / Raise / Full cycle.
Gates fold against the side walls to match S06's open silhouette. A move request closes the gates
before vertical travel; gates cannot open underground. Commands interrupt old queued motion.
Cycle: close → lower → raise → open. Warning lamps pulse during movement. No audio added.

The ground has an actual rotated mesh opening for the shaft, shared by all render passes;
the former material-only discard was removed after the user reported striped ground artifacts.
The preview uses clear day by default in Ark Outskirts; other weather remains selectable.
Initial camera distance is 18 m in the range so the cage and mast base fit; wheel zoom remains.

## Verification and scope

`artifacts/verify-elevator.mjs` checks exact center, gate endpoints, descent/rise, full cycle,
gate interlocks, interrupted command, real UI buttons, 16:9 / 21:9 and anime presentation.
Captures: `artifacts/ui/ART-1/`, including a full-height model view.
Typecheck, sortie logic tests, and `artifacts/verify-sortie.mjs` passed during this work.

Visual approval remains open. This is an art/animation preview, not the completed extraction system:
passenger transport, collision, dormant/restoring states and replacing sortie placeholders remain.
