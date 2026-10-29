# Dorothy foundation

2026-10-29. Dorothy occupies row 1, slot 4; Nayuta starts row 2. Commander is
filtered from active menus and field-model lists, with his module, assets and id
preserved for a future return. No existing character files or saved identities were deleted.

## Available now

- `?run=test-range&character=dorothy`: first playable Flight / Paradise Lost kit.
- Animated models: Default `c233_00`, Nostalgia `c233_01`, Luna Light `c233_02`,
  Serendipity `c234_00`. All use the normal skin shop/equipment pipeline.
- Serendipity is a separate unit in NIKKE; this project treats it as an appearance.
- The catalog also names Corrupted `c474_00` and Corrupted Nostalgia `c9027_00`,
  but neither has a pack in the checked chibi manifest. Those forms are **not imported**.
- Original pink pulse-rifle weapon family, short synthesized firing sound,
  thick white-core pink laser pulses, muzzle flash and impact. Swept collision
  respects cover, enemy shields and the first enemy hit; effects release on impact,
  expiry and disposal. Shared player code handles holding fire, magazine and reload.
- Prototype balance: 3 damage, 10 shots/sec, 60-round magazine, 1-second reload,
  60 HP, 15% crit. These are development numbers, not a finalized kit.
- RMB: Angel's Flight. E: Paradise Lost at full gauge. The shared Shift dodge remains.
  The separate passive and talent tree are still unassigned.
- User-provided `portrait.png` and `burst.png` in
  `public/assets/menus/character-select/dorothy/` are the active artwork.
  The HUD uses the same Burst image with CSS framing at `50% 20%`.
  Generated splash/banner attempts were rejected and are not active.

## NIKKE reference findings

Dorothy is an Inherit Pilgrim, a Water-element Burst I Supporter with the assault
rifle Ungrateful OZ. Her elegant angelic presentation contrasts with resentment,
loss and her attachment to Eden. The useful mechanical themes are magazine endings,
delayed judgment and a temporary empowered state.

Original kit, summarized from [Prydwen's skill listing](https://www.prydwen.gg/nikke/characters/dorothy):

- **Holy Fire:** the final bullet reduces allied Burst cooldown; during Manifestation
  it also grants a temporary bonus against parts.
- **Baptism:** periodic distributed damage across enemies.
- **Paradise Lost:** grants Manifestation, more frequent Baptism and piercing fire;
  a timed Brand stores damage, then releases capped distributed damage.

The source lists a 60-round magazine and 1-second reload. The rest of our weapon
balance above is original prototype tuning. Do not copy the original game's damage
percentages directly into this game's health scale.

## Original discussion directions

Recommended starting point: a mobile ranged damage dealer with a support edge.
Use flight to reposition for rifle lines, and transformation to create a clear
window of increased pressure. A Brand can turn sustained fire into delayed payoff.

1. **Flight:** short directional glide with lifted model and feather wake. Decide
   whether it only avoids enemies/projectiles or also crosses low cover. Do not
   silently grant wall traversal, permanent flight or invulnerability.
2. **Transformation:** distinguish default armor deployment from Nostalgia's
   light/dark dress imagery. Decide which visual transition is intended and how it
   applies to each skin. The imported packs do not establish that every desired
   transformed form exists as a separately usable mesh.
3. **Brand:** mark a priority enemy, bank damage during the transformed window,
   then detonate. Discuss single-target versus area payoff and team contribution.
4. **Last round:** a small recharge or pulse reward would retain her original
   magazine-management identity without copying NIKKE's team Burst cycle.

Alternative themes: graceful aerial duelist (more personal mobility), or Eden
commander (more ally support and shared damage storage). Avoid assigning a full
talent tree until the primary loop is agreed.

## Assets and provenance

- Model/name catalog: https://nkas-l2d.pages.dev/characters.json
- Animated pack availability: https://nkas-chibis.pages.dev/manifest.json
- Model conversion: `node tools/fetch-chibi.mjs c233_00 c233_01 c233_02 c234_00`.
- Models © SHIFT UP, files via NKAS by skuqre, matching existing project sourcing.
- Design reference: https://cdn.prydwen.gg/images/nikke/characters/dorothy_full.webp
- Rejected generated art and prompts are archived in `assets/ui-source/dorothy/`
  (built-in ImageGen); these are not used by the runtime.
- Pulse sound reproducible with `python tools/build-pulse-rifle-audio.py`.
- User's root `burst.wav` was converted with LAME VBR quality 2 to
  `public/assets/audio/voice/characters/dorothy/burst.mp3`, decode-verified, then
  the root WAV was deleted as requested. Registered for character selection and
  as `SFX.dorothyBurst`, played once at the start of Paradise Lost.

Scarlet portrait template requested by the user:
`public/assets/menus/character-select/scarlet/portrait.png`.

## Verification

`node tools/verify-dorothy.mjs` exercises all four models, roster placement,
Commander preservation, damage, cover/shield blocking and ability availability.
Captures and results are in `artifacts/dorothy/`. Also run TypeScript, production
build, `tools/test-save-data.mjs` and `tools/test-talent-tiers.mjs`.

## Laser presentation and small-enemy collision

The procedural laser shader uses a white-hot filament, pink energy body, soft halo,
moving intensity bands and tapered ends. It stays inside the existing batched VFX
renderer; other effects use their previous texture path. Shader time advances with
simulation time, so pausing also pauses the flow. Each pulse is up to 1.5 m long
with a .72 m glow envelope, a narrow pale-pink core and saturated pink body.
The restrained halo keeps the beam silhouette visible without washing it white.
Short muzzle snaps and impact sparks replace the expanding rings. Damage,
projectile speed and rate of fire are unchanged. The hit radius is .3 m for more
forgiving chibi-scale aiming; both enemy and cover sweeps use that radius.

Visual reference: [official Dorothy motion demonstration, April 23, 2023](https://twitter.com/NIKKE_en/status/1650062028898172930),
especially firing at 15–23 seconds. The footage shows white/cyan flashes and
pink-violet streaks; its head-on view does not establish world-space projectile
length. The compact pulse dimensions are an adaptation for our overhead camera.
Reference video and extracted firing frames are in `artifacts/dorothy/reference-*`.

Dorothy previously used a 3D sphere centered .7 m above an enemy's feet, reduced
to 65% of its radius. Horizontal shots at rifle-muzzle height could miss small
enemies entirely. She now uses an exact swept circle against the enemy's full
ground footprint, plus .3 m beam radius, consistent with the sniper's ground-plane
targeting convention. Cover traces include the beam radius; shields and the nearest
enemy still stop the shot. Other characters' collision functions are unchanged.

References reviewed: [Babylon ShaderMaterial](https://doc.babylonjs.com/features/featuresDeepDive/materials/shaders/shaderMaterial/)
and [GlowLayer](https://doc.babylonjs.com/features/featuresDeepDive/mesh/glowLayer/).
The shader is original project code.

Checks: `node --experimental-strip-types tools/test-dorothy-collision.mjs` covers
small enemies at elevated muzzle height, edge hits, near misses, high-speed sweeps,
segment endpoints and starting overlap. `node tools/verify-dorothy-laser.mjs`
checks the actual weapon, shader compilation, width, blocked damage and beam cleanup.

## First ability playtest

**Native-state audit, after the first playtest:** the default `c233_00` already
contains unarmored and armored presentations on the same skinned model. Raw SDP
scale tracks and rendered GLB poses confirm unarmored `idle_01`, `run`, `walk`,
`shot`, `stun`, `death` and talk clips. `cover_aim_idle` and `cover_shot` deploy
the native wing/head/skirt armor. `cover_idle` and `cover_reload` retract it;
`aim_start`, `cover_aim_start`, `aim_end` and `aim_end1` contain deployment/retraction
tracks, while the 13-second `idle_02` includes a longer changing-state sequence.
There are not two separately complete animation libraries: form is baked into
individual clips. Gameplay now blends the native head/wing armor bone transforms
between idle_01 and cover_aim_idle after the shared rifle/locomotion animation.
This keeps armor state consistent during firing, running and reloads. Only c233_00
uses this override; other skins retain their authored appearance. The generated
feather meshes have been removed.
Visual comparison: `artifacts/dorothy/native-states.png`; live review:
`tools/review/dorothy-native-states.html`. 

**Angel's Flight (RMB):** one use on an 8-second cooldown, glides toward the cursor
to the position captured on click at 18 m/s, with no distance cap (minimum .25 seconds). The model rises 1.5 m at the apex; the shared player
movement still sweeps terrain and arena bounds but bypasses enemy separation. She
can keep firing/reloading. Dorothy is invulnerable in flight; immunity ends on landing. There is no contact damage in transit.
Landing releases a pink 4 m pulse that deals 30 base damage once per enemy, pushes outward at 12 m/s (decaying with normal knockback), and applies **Exposed** for
4 seconds: +35% damage from this Dorothy's rifle only. Pink shards mark affected
enemies. Starting another Shift dodge during Flight is disabled; its cooldown is
not spent. Flight cooldown begins at takeoff.

**Paradise Lost (E):** hits generate 2 base Burst gauge; activation uses the existing
100-point gauge. An 8-second Manifestation deploys the default skin's native armor
and grants piercing rounds. Armor also opens during Flight and retracts afterward.
Other outfits use the same gameplay and pink effects without added wing geometry.

All visible, unshielded enemies within 20 m are branded on cast; later rifle/Flight
hits brand new enemies. Damage Dorothy deals to any Brand feeds one shared pool,
capped at 180 ? level growth (overkill excluded). Kills retain their contribution.
At the end of eight seconds, every surviving Brand explodes for 18 base damage plus
100% of the shared pool. Each Brand takes the full amount, with 5 m splash to
nearby enemies; overlapping blasts damage each enemy only once. Cover and shields
block splash. Death cancels the pool and all marks; recycled targets lose old marks.


No allied damage storage, healing passive, last-round pulse, talent upgrades or
permanent flight has been added. Values are first-pass tuning.

`node --experimental-transform-types tools/test-dorothy-kit.mjs` tests Flight,
Exposed/expiry, piercing, shield/cover blocking, early and timed detonation, empty
target acquisition, single VO and death/disposal cleanup. `node tools/verify-dorothy-kit.mjs`
exercises actual Player movement, firing during Flight, terrain movement blocking,
lift, wing deployment and shader compilation. Screenshot: `artifacts/dorothy/paradise-lost.png`.
