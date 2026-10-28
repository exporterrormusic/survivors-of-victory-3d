# Scarlet survivor port

First playable pass, 2026-10-26. Open `?run=test-range&character=scarlet`, or select Scarlet in Weather Lab > Character. The pause menu also offers the switch. Switching reloads the run and preserves URL environment parameters. Scarlet is available in the lobby and Survival Round.

## Progression

Heroes of the Storm-style talent tiers (2026-10-26), same system as Snow White
(`docs/SNOW_WHITE_TALENT_TIERS.md`): one pick per tier, no pausing, +4% damage and health per
level. Data: `src/survivor/scarlet/tiers.ts`. Dodge (dashing through enemies) and Parry (bullets caught in a slash fly back at normal damage) are now part of her base kit. D1 Crashout freezes only the enemies her Burst hit (and their shots), so other fights keep moving.

| Lv | Sword | Dash Slash | Burst / Utility |
|---|---|---|---|
| 1 quest | Eviscerate → Hemorrhage (120 bleeding kills) | Vampiric Slash → Quick Slash (80 wave kills) | Execution → Fire In My Veins (60 Burst kills) |
| 4 | Finishing Blow (2× below 30% HP) | In One Strike | Drink to Victory |
| 7 | Rose's Core | Twin Moon (new) | D1 Crashout |
| 10 form | | Nothing Personal, Kid (+ Surprise stun) / Musashi | |
| 13 | Evasion | Crimson Edge (new) | Expose Weakness (+100% mark, 6 s) |
| 16 | Retaliation (10× reflect) | Rising Tide (new) | Scraping the Bottle (max +150%) |
| 20 storm | I am cheating (max 4×) | No Hard Feelings (upgrades either form) | A Goddess Who Cannot Yield |

Balance changes from the rank version: Scraping the Bottle +500% → +150%; I am cheating ×16 → ×4;
Expose Weakness permanent ×4 → +100% for 6 s; Execution also takes heavies below 30% health;
swing cost and the half-health floor follow her grown max HP.

## Combat

Phaser reference: `_REF/SURVIVORS OF VICTORY - 2026/_PHASER/src/game/gameplay/`. Sword: 10 damage, 25% crit, .3 s interval, no magazine, 750 pixels/s movement converted at 80 pixels/metre. Each swing spends accumulated 3% maximum HP, never lowering HP below 50%. Burst spends half current HP, rounded down, then snapshots missing-HP scaling.

Sword arcs, piercing waves, charged waves, teleport recast, bleeding, reflected laser bolts, petal projectiles, repeated-hit scaling, Burst target sequence, execution/healing/marks and enemy freeze are implemented. Heavy/boss tiers resist execution. Terrain blocks sword, waves, and area damage; teleports project destinations onto navigable ground. Kill and damage accounting use the shared Run path.

## Art and remaining polish

The tree deliberately uses **only three illustrations**, matching Snow White. Sources: `assets/ui-source/scarlet-talents/`; optimized runtime copies: `public/ui/survivor/scarlet-talents/`. Built-in imagegen was used; prompts are recorded alongside the sources.

Live effects are Babylon pooled crescent ribbons, fine ivory edges, animated petal sprites, red Rose projectiles, teleport cutting trails, and sequential Burst cuts. These are an initial visual pass, not final cinematic parity. Native sword posing/facing across all four outfits still needs player review. The legacy tooltip's red invulnerability scanline, persistent blood trails, and full monochrome Burst cinematic are not yet reproduced. No global anime lighting settings were changed.

Validation: `npm run typecheck`, `npm run build`, `node tools/verify-scarlet.mjs` (local Vite on port 5196). Browser captures are in `artifacts/scarlet/`.
