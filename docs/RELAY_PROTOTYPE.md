# Relay Run combat prototype

2026-10-26. First playable test of the simplified destination-based loop. Select **Relay Run** in Stage Select, or open `?run=test-range&mission=relay_run` (also `?run=test-range&mode=relay`). This mission always uses Ark Outskirts in daylight and Snow White's existing kit.

Arrive on the southern lift pad, follow the cyan road through the east street, market crossing and west approach, then defeat Hard Hat at the relay tower. Green road markings lead through an optional guarded courtyard and reconnect with the main road. Walk into the green ring while injured to recover up to 60% maximum health, once. There are no interaction timers. Ordinary enemies never lock the route; shortcuts can still activate the final encounter.

WASD moves, mouse aims, left-click fires, right-click deploys a turret, E uses Burst, Shift dashes, R reloads, and Escape pauses. Burst starts full. The prototype uses base ability ranks and does not load or save permanent progression. Upgrades are disabled during the mission. Victory and death show a result panel with retry and return buttons. Abandoning also ends the mission without saving.

The layout is a compact graybox within the existing 68 m arena, with two collidable ruined blocks, painted streets, a route map, arrival pad and relay mast. It is not the finished environment from the map concept images. The lift pad is static; no elevator cutscene is included. Hard Hat uses the existing telegraphed ranged attack as a placeholder, with 1,350 HP. Five minutes is a playtest target, not a measured completion time. Tune enemy health, route length and pressure after an ordinary player run.

The earlier Salvage Run and Test Range remain selectable. Relay Run has no Alert, Hunter, extraction, loot ledger, restoration, or multi-sortie operation.

Validation: `node --experimental-strip-types tools/test-relay.mjs`, `npm run typecheck`, `npm run build`, existing sortie system tests, and `node tools/verify-relay.mjs` with Vite on port 5194. The browser check exercises collision, open route, healing, encounter progression, boss victory, frozen results, retry and death; it uses controlled positions and damage, not a timed human playthrough. Captures are in `artifacts/relay-run/`.
