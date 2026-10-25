# Ability progression concepts

2026-10-25. Concept archive for the ability roadmap, now implemented in the test range.

[Open the current-HUD A02 variation](a02-theme.html) · [Approved A02 layout](a02-revised.html) · [Original four-image gallery](index.html)

## Implemented: A02 ability roadmap

The live `?run=test-range` Tab menu uses the approved three-track layout, five ranks per
ability and inspectable capstones. Rank 1 is free; ranks 2–5 cost 1/2/3/4 SP, with the capstone
granted at Rank 5 for no extra charge. Existing combat effects are bundled in that order.
Kill XP still awards one SP per level; costs are starting values for playtesting.

The runtime simplifies the illustrated treatment with existing HUD equipment art, square
large panels, bracketed small rank controls and the HUD portrait's single slight top-left cut.
It sizes against the actual game frame, so letterboxing cannot push it outside the 16:9 or
21:9 window. All 18 previews fit without scrolling across six tested frame sizes.

Implementation: [rank data](../../../src/survivor/ability-ranks.ts),
[menu](../../../src/survivor/talent-menu.ts), [styles](../../../src/survivor/talent-menu.css).
[Verification](../../../artifacts/ui/ability-roadmap/verification.json) and
[16:9 letterboxed capture](../../../artifacts/ui/ability-roadmap/letterboxed.jpg).
Permanent character saves and the broader operation loop remain separate work. The sections
below preserve the design history; consult `docs/GAME_PLAN.md` for the current progression plan.

## v4: square framing and complete corner construction

The user's corner rule is explicit and must carry into implementation:

- Large surfaces (outer menu, header, rows, illustrated panels, preview area) use square
  90-degree corners. Do not apply chamfers to every component.
- Portraits may have **one small top-left cut only**, matching the actual bottom-left HUD
  portrait. The other three corners remain square; no hexagonal or octagonal portrait frame.
- Reserve paired top-left / bottom-right cuts for small controls such as rank buttons and
  the upgrade button. **Both cuts require detached L-shaped bracket pieces at the original
  rectangular corners**, so the whole silhouette still reads as a complete square/rectangle.
  Leave a visible gap between each bracket and the diagonal. A bare paired cut is incorrect.
- Keep ivory/charcoal dominant with restrained amber accents. The approved A02 layout and
  progression are unchanged by this geometry correction.

`A02-v4-square-frames-*.png` applies these corrections in 21:9 and 16:9. `a02-theme.html`
defaults to v4 and retains v3 as the previous treatment. Exact edit prompts and provenance
are in `prompts-a02-v4.json` and `manifest-a02-v4.json`. This is still a mockup, not a runtime edit.

## v3: approved layout, first current-HUD visual variation

The user called the revised A02 layout perfect and requested a variation matching the current
UI through its shapes, design details and motifs, explicitly rejecting excessive yellow.
`a02-theme.html` compares the new treatment with v2 at both 21:9 and 16:9. The v3 images use
charcoal panels, fine ivory outlines, small 45-degree corner cuts, inset lines, isolated corner
marks and compact keycaps from `src/survivor/survivor.css` and `hud-frames.ts`. Illustrated
ability art is retained; amber is a limited accent. The layout and progression remain intact.

The built-in ImageGen edit references are the corresponding v2 layout, the approved survivor
HUD mockup, and an actual close-up of its card framing. Exact prompts and image provenance
are in `prompts-a02-v3.json` and `manifest-a02-v3.json`. The user has approved the **layout**;
the new visual variation is for review. No runtime menu or gameplay changes in this pass.

## Current direction: A02 with visible capstones

The user prefers A02 as the main menu because it shows future upgrades. The revised mockup
has all three tracks visible, five ranks per ability, and a separate named gold capstone
endpoint: Unyielding, Detonation, and A Goddess Who Cannot Yield. Each capstone is inspectable
from the start and unlocks automatically for free when its ability reaches Rank 5.

The revision shows proposed rank costs of **1 / 2 / 3 / 4 SP**, 10 SP per completed ability.
Rank 1 is free. Rank 5 grants Charging / Permanent Emplacement / A Century of Prep Time,
respectively, together with that track's capstone. There is no separate capstone purchase.
At one SP per character level, the earliest focused capstone is level 11 and all three tracks
would finish at level 31. These are starting points for playtesting, not approved balance.

The illustrated state is level 14, Weapon 4 / Special 3 / Burst 1: 13 points earned, 9 spent,
4 available. Unyielding is selected for preview, still locked; upgrading Weapon to Rank 5
costs 4 SP and grants both Charging and Unyielding. The same state is shown in 21:9 and 16:9.

The user raised sortie-awarded points as a possibility. This remains open; the mockup keeps
XP-earned SP and does not imply a sortie gate. A completion bonus could supplement enemy XP,
but costs and the contribution of each source need testing against the operation loop.
Claude's `docs/GAME_PLAN.md` targets levels 8 / 14 / 22 after sortie 1 / sortie 2 / by the
final boss. Its claim that 22 grants roughly two masteries does not match current costs:
the live tree takes 18 SP for all three, and the original A02 draft takes 12 SP.

The new image pair and exact prompts are saved as `A02-v2-*` and `prompts-a02-v2.json`.
The original images below are retained for comparison. Gameplay has not been changed.

The user rejected the earlier plain HTML mockups and clarified that the game will always be
landscape, 16:9 or 21:9. The illustrated talent screens in
`../survivors-2026-10-24/` are the visual reference. The main direction is now **ability levels**:
bundle the existing talents into meaningful successive upgrades instead of requiring a tree.

| Concept | Progression | What it trades |
| --- | --- | --- |
| [A01 — Ability ranks](A01-ability-ranks.png) | Spend a point to advance Weapon, Special, or Burst to its next authored rank. The card shows current behavior and the next change. | Simple choices between abilities; less freedom to reorder improvements within an ability. |
| [A02 — Rank roadmap](A02-rank-roadmap.png) | The same system as A01, displaying all five ranks of all three abilities. | Better long-term planning; more information on screen. This can be A01's optional plan view. |
| [A03 — Automatic milestones](A03-automatic-milestones.png) | All three abilities improve automatically at character levels 1, 5, 10, 15, and 20. No skill points or purchasing. | Simplest flow, but no in-run specialization through ability investment. |
| [T01 — Illustrated hex tree](T01-illustrated-hex-tree.png) | Preserve current prerequisites, six purchased talents per category, and free mastery after all seven normal talents are owned. | Retains individual build decisions and the current rules, with more choices to read. |

Original recommendation was A01 with an optional A02 plan view. The user subsequently chose
**A02 as the primary direction**; see the revised roadmap above.

## Original five-rank grouping (v1, superseded by the revision above)

Rank 1 is the free starting ability. For A01/A02, each further rank is a point purchase and
requires the preceding rank of that same ability. Points can be invested in any of the three
abilities. Mastery effects are folded into rank 5, removing the separate completion gate.
The example has Weapon 2, Special 3, Burst 1: three points spent. At character level 6,
five earned points leave two available, as shown.

| Rank | Weapon | Special | Burst |
| --- | --- | --- | --- |
| 1 — Base | Seven Dwarves: piercing rifle | Auto-Turret | Seven Dwarves: cone blast |
| 2 — Improve | Marked Rounds: Weak Point + Explosive Rounds | Expanded Arsenal: Ammo Cache + More Turrets | Fully Active: Incendiary Rounds + gauge recovery |
| 3 — Evolve | Afterburn: fire trails | Defensive Line: turret aura | Focused Fire: charge the cone |
| 4 — Specialize | Burning + Inferno: burn and slow | Incendiary Arsenal: missile burn + armor-piercing marks | Pierce Through + Stunned |
| 5 — Signature | Charged Finale: Charging + Unyielding | Permanent Battery: reload + Detonation | Goddess Protocol: four perimeter turrets + gauge preservation |

All existing Snow White talent effects have a place in this grouping. The bundles, costs,
rank names, and milestone spacing are proposals rather than balance commitments. Four paid
ranks replace six individual purchases per category, so costs or progression pacing would
need balancing before implementation. Later ranks retain earlier effects.

A03 uses the same broad grouping, but grants the ranks at shared character-level milestones
instead of spending points. It deliberately removes investment decisions, not just the wires.

## Art and validation

Generated with the **built-in ImageGen tool**, using the user's T01 hex-tree reference and an
actual test-range capture. Full prompts are in `prompts.json`; originals remain in the default
generated-images directory and selected PNGs are copied here. `manifest.json` records their
dimensions, hashes, and original paths. Images are illustrative UI proposals, not interactive
gameplay or claims that the depicted effects/art are implemented exactly as rendered.

A01, A03, and T01 are 16:9; A02 is 21:9. The gallery displays whole images without cropping.
The tree's six connections were visually checked against the authored prerequisite rules.
Rank costs, filled pips, and current/next labels were checked for consistency. The generated
ability vignettes are art-direction examples; final in-game icons/previews would be made to
match the actual weapon and effect assets.
