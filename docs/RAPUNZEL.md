# Rapunzel survivor port

First playable pass, 2026-10-26. Select Rapunzel in the lobby or Weather Lab, or open `?run=test-range&character=rapunzel`. Available for Survival Round. Pure Grace uses the existing one-core skin system.

## Progression

Heroes of the Storm-style talent tiers (2026-10-26), same system as Snow White and Scarlet. Data:
`src/survivor/rapunzel/tiers.ts`. The halo barrage (formerly 6,000? Really?) is part of her base
Burst, so its upgrades stand alone. Healing amounts scale with her grown max HP.

| Lv | Holy Grace | Divine Blessing | Burst |
|---|---|---|---|
| 1 quest | Burning Desire → Spread the Love (120 halo kills) | A Burning Sensation → More, more! (80 Blessing kills) | Blinding Radiance → Answered Prayer (60 Burst kills) |
| 4 | Concussive Blast (halo knock-back; heavies/bosses hold) | Expanding Aura | Holy Shockwave |
| 7 | Anti-Armor Munitions (2× halo damage to specialists, heavies, bosses) | Oooh, Ahhhh (standalone) | Consecration (Burst leaves 5 m golden fire for 6 s) |
| 10 form | | | 6,000? Really? / Lingering Light |
| 13 | It Burns (halo hits ignite) | Rejuvenation (10%/s) | Judgement (Burst slows all 50% for 10 s) |
| 16 | Swift Benediction (new) | Personal Toy | Holy Ordnance (2× damage for either level 10 form) |
| 20 storm | Endless Desire (max 5 stacks) | All the Toys (2 charges) | A Goddess Who Cannot Yield |

Removed: I'm a Healer, But... (1 HP per kill made her nearly unkillable in hordes).

## Combat

Reference: `_REF/SURVIVORS OF VICTORY - 2026/_PHASER/src/game/gameplay/`, especially CombatData, CharacterAbilitySystem, and CompletedTalentMechanics. Distances convert at 80 pixels/metre.

- LMB: ground-targeted holy halos, 15 damage, 10% crit, 4 rounds, 3-second reload, .5-second fire interval. Movement 465 pixels/s, HP 50. Impacts grant 10 gauge per enemy hit. Shots retain the clicked ground endpoint, with earlier enemy and terrain interception.
- RMB: stationary 9-second healing zone, 10-second cooldown, 3% max HP/s. Upgrades grant 17.5%/s, double radius, burn damage, one stun per enemy per zone, and a following aura. The Skill capstone allows the following and deployed zones simultaneously.
- E: full heal and 4-second stun (Holy Shockwave: 8 s plus a push away; Blinding Radiance burns every enemy for 15/s over 4 s); heavy/boss enemies resist Burst stun (Judgement slows everything instead). Lingering Light follows the player for 8 seconds, dealing 40 damage per second to enemies inside and blocking 30% of damage taken. With 6,000? Really?, ten floating sacred seals fire 4 halos each at two-second intervals. Camera widens while launchers are active and restores afterward.
- Attack upgrades mark enemies for 4x damage, create burning ground, apply 5-second DoTs, and heal 1 HP per kill. Endless Desire uses one aggregated permanent DoT per enemy, adding a stack on zone entry and each second inside. Generation checks prevent effects leaking into respawned targets.

Halos use swept collision against enemies and terrain; splash, ground fire, and healing zones respect cover. All damage and kills use shared Run accounting. Burst and Skill capstones remain exclusive to the selected track.

## Presentation

Three built-in imagegen illustrations, shared by ranks within each track. Source PNGs and exact prompts: `assets/ui-source/rapunzel-talents/`. Optimized runtime WebPs: `public/ui/survivor/rapunzel-talents/`.

Golden prayer seals, rising diamond sparkles, hollow halo projectiles with luminous wakes, and sharp holy-light impacts. Burst summons a cathedral seal, a column of light and an expanding divine wave; upgraded barrage anchors are floating sacred seals. Anime lighting stays unchanged. Her own theme opens the playlist.

## Validation

- `npm run typecheck` and `npm run build`.
- `node tools/verify-rapunzel.mjs`: combat values, zone healing, cooldown, boss immunity, purchases, marks/burns, launcher count and camera restoration.
- `node tools/verify-rapunzel-capstones.mjs`: activation gates, stacking/permanent DoT, respawn isolation, concurrent healing, refunds, projectile/splash cover.
- `node tools/verify-rapunzel-input.mjs`: live controls, reload, hold/release Burst, talent menu and Pure Grace model.
- `npm run test:survival`: shared round/progression regression.

Browser scripts expect Vite at port 5196 and use the same installed Playwright as the Scarlet checks. Captures: `artifacts/rapunzel/`. This is a first playtest pass; ordinary round pacing and final animation/VFX quality need player review.

### Weapon illustration correction

Holy Grace uses `weapon-v2.webp`: Rapunzel's slim staff emitting a golden halo, generated with built-in imagegen using the official NIKKE character art as its design reference. Source: `assets/ui-source/rapunzel-talents/weapon-v2.png`; exact prompt and reference URL: `weapon-v2-prompt.json` in that folder. The old launcher illustration is retained only as an unused source iteration. The rocket HUD icon now fits the standard icon height; Divine Blessing is centered with its count on the right.

### Custom Burst HUD banner

`public/ui/survivor/rapunzel-burst-prayer.png` shows Rapunzel praying, with a bright blue eye, deep navy shadow and warm sacred light. Generated with built-in imagegen from her official identity art and Snow White's banner composition; exact prompt: `assets/ui-source/rapunzel-talents/burst-banner-prompt.json`. The survivor HUD uses a centered crop, including on compact layouts.

### Upgraded rocket presentation

Rapunzel rockets travel at 18 m/s (user tuning), with 45% larger missile models, a continuous distance-sampled smoke trail and gold exhaust. Her custom Holy Grace detonation uses an ivory flash, golden halo shockwave, radial rays and smoke; its 2.75 m damage radius is larger than Snow White turret rockets (1.5 m). Applies to weapon and barrage rockets. Cover checks remain shared. `tools/verify-rapunzel-rockets.mjs` checks speed, model scale, expanded splash and retirement.

### Staff facing correction

Rapunzel opts into head-based aiming in the survivor rig. The staff shaft is carried sideways and previously produced a 76?80 degree body-facing error when the generic barrel solver aligned it with the cursor. Head-based steering applies to aim, shot and reload, including moving poses; projectile origins still use the staff muzzle. Other kits retain weapon-based steering. Validation: `tools/verify-rapunzel-facing.mjs` checks both outfits across four headings and idle/moving aim, fire and reload poses.

### Healing halo edge correction

Divine Blessing and its following/lingering halos use a padded `healing-ring` texture with a smooth circular alpha falloff and fully transparent border. Quad size compensates for the padding, preserving the visible ring and gameplay radius. Fire zones and other characters keep their existing ring textures.

### Ground targeting and larger splash

Primary rockets now lock onto the clicked ground position, rather than homing toward a nearby enemy. Rapunzel picks the ground plane; the shared player preserves her close-range endpoint and ground height. Walls/enemies can still intercept the rocket. Normal auto-targeted Burst turrets retain homing, while designated barrages retain their fixed ground endpoint. Blast radius increased from 2.75 m to 3.75 m; speed remains 18 m/s. The same radius drives custom explosion visuals and damage. `tools/verify-rapunzel-ground-aim.mjs` covers screen-to-ground picking, close clicks, fixed destinations and expanded splash.

### Explosion and exhaust polish

Holy Grace uses the padded circular ring for its short shockwave, scaled so the bright rim reaches the 3.75 m blast radius. The six straight spokes are replaced by five uneven fire lobes around the core, followed by rolling smoke. Core, flash, fire lobes, shockwave, exhaust and short-lived golden trail embers register with the shared glow pass. Smoke remains softly alpha-blended and does not bloom. Speed and damage are unchanged.

### Holy-power visual overhaul (current)

Supersedes the earlier rocket/fire presentation notes above. Primary and barrage projectiles are counterrotating hollow gold halos with glowing wakes and distance-sampled diamond sparks; no missile meshes or smoke. Travel remains 18 m/s, with a 3.75 m holy-light impact radius and unchanged damage and targeting. The HUD now uses a halo icon.

Divine Blessing has layered rotating prayer seals, sharp radial ornaments, rising light trails and sparkles. Offensive zones share the holy palette while retaining their damage mechanics. Garden of Shangri-La adds a large ground seal, expanding halo wave, vertical light column and rising shards. Upgraded barrage launchers appear as floating sacred seals. Existing anime scene lighting is unchanged. All new atlas textures have transparent padded borders, emissive elements register with the existing glow pass, and timed effects return their quads to the shared pool.

Verification: `tools/verify-rapunzel-holy-vfx.mjs` checks texture borders, renders each effect and the upgraded barrage, checks pooled cleanup and browser errors. Screenshots are in `artifacts/rapunzel/holy-*.png`. Older mesh-count assertions in the original rocket/launcher scripts describe the superseded mechanical visuals.

### Golden fire and anchored barrage gates

Burning Desire and incendiary impact zones use separate flickering gold flame tongues, ivory cores and rising embers instead of the healing seal. The barrage opens ten golden portals in two elevated rows behind the cast position. Their openings face the overhead camera to prevent foreshortened/tilted discs, with concentric launch ripples. All gates stay anchored at their spawn positions; only the emitted halos travel. Projectiles originate at each portal center.

Burning Desire now reuses Snow White's animated `swAnimeFire` shader with gold/ivory colors, curved noise-eroded silhouettes and circular clipping. The ornate glowing halo border is restored. Circular fire meshes/materials are pooled separately; Snow White retains its existing cyan palette and corridor footprint.
