# Ark siege playable graybox

Open `?prototype=ark-siege`, or choose **ARK SIEGE · GRAYBOX** in Stage Select. This is an isolated layout test, not the finished combat mode. It does not read or write character progression, cores or rewards.

## Layout

The enlarged 408 × 228 m footprint has the Ark elevator at (-174, 0), opening toward +X: the lanes on the right. Three lanes at Z +72 / 0 / -72 converge near the Ark. All allied defenses start in the left half: one gate per lane at X 0, one fallback per lane at X -90, and a shared final defense at (-138, 0). Cross-lane paths at X -90 / -30 / +54 / +129 connect the lines and enemy objectives. Low boxes mark inaccessible terrain; the same walkability definition drives movement and connectivity tests.

This is 3× the original linear extent and 9× its area. Player height (2.2 m), units, elevator, movement speed (9 m/s), and weapon ranges remain unchanged. Lanes widened from 10 to 18 m and rotation trails from 6 to 9 m rather than scaling everything uniformly. Normal travel takes 40 s end-to-end along mid, about 19 s from Ark to mid gate, and 8 s between adjacent lanes on a cross-path (16 s top to bottom). These are design measurements, not claims of exact League/HotS dimensions. Follow view still shows 45 m across; overview and minimap fit the expanded footprint.

Destroyed gates remain rubble. Each lane falls back independently. A breach marks the lost lane segment and creates a stranded squad there. Enemy territory contains rescue, supply and artillery sites. These are deliberately simple guarded marker blocks; shoot the red marker to clear guards, then press E nearby. Escort rescued squads along your actual traveled path back to the elevator. Delivered squads strengthen future allied waves; supply restores health; artillery removal reduces future enemy counts.

## Controls

- WASD: move. Mouse + left button: aim and shoot. Shift: short dash.
- E: interact within 4 m once objective guards are cleared.
- Tab: full-map view / follow camera. Wheel: zoom. Click minimap: inspect an area.
- P: pause. Tab switches back to the player from an inspected area. Losing focus pauses.
- Graybox controls: breach top lane, return to Ark, 3× simulation, neutral/snow/rain material studies.

Basic automatic allied waves exit the elevator every 28 seconds; enemies arrive every 24 seconds, with rotating pressure and periodic heavy units. These condensed timings support short layout tests and are not a proposed final match duration. The enlarged unattended baseline loses around 4.6 minutes. Defenses and units shoot automatically; the player has a placeholder rifle. Downing redeploys the player after 7 seconds while the battle continues; Ark destruction ends the test. Reset reloads a clean simulation.

## Scope and next pass

All scenery and combatants use basic Babylon geometry. There are no finished textures, characters, character kits, talents, rewards, multiplayer networking, sound or final weather effects. Snow/rain options only test surface contrast. Unit lane movement is scripted; escort movement follows player breadcrumbs. No player construction or repair exists. No final XP/talent decision is implied: normal matches should end before every talent is unlocked.

Validate travel times, visibility, defensive density, rotation routes and excursion risk before applying the environment kit and image-generated materials. First art target is one gate section, with intact and destroyed geometry. Existing ImageGen overhead concepts remain visual references, not exact geometry.

## Verification

`npm run test:siege`: flood-fill all sites from Ark, terrain collision, independent breaches, captured-ground rescues, pause, full physical escort return, spawning and Ark-loss freeze.

`node tools/verify-siege.mjs`: browser load, WASD movement, pointer firing, camera views, breach control, rescue interaction, material variants and responsive screenshots. Captures are under `artifacts/ark-siege/`. Uses the existing sibling Playwright installation and the test server on port 5195.
