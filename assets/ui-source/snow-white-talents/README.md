# Snow White talent artwork

Generated with built-in image_gen on 2026-10-25. Exact prompts are in prompts.json.
PNG masters live here; runtime WebP copies (quality 92, native dimensions) are in
public/ui/survivor/snow-white-talents. Three separate illustrations feed the row
cards in src/survivor/ability-ranks.ts.

The upgrades subdirectory contains 18 individually generated detail illustrations,
one for each rank and capstone. Each AbilityStage has its own required art path;
the detail panel uses that path, never the track banner. Exact generation prompts
are in upgrades/prompts.json. Runtime copies preserve the source dimensions and
are encoded as WebP quality 90. Row and detail images use object-fit: cover with
centered cropping and no nonuniform transforms. All 18 click targets and loaded
images passed browser verification; 1920 and 1280 screenshots are in
artifacts/ui/snow-white-talents. Production build passed.

Research: https://www.prydwen.gg/nikke/characters/snow-white
Original character artwork: https://cdn.prydwen.gg/images/nikke/characters/snow-white_full.webp
Local visual reference: assets/weapons-source/snow-white/reference-character.webp.
Additional burst equipment reference: public/assets/menus/character-select/snow-white/burst.webp.

Original Snow White is an Iron assault-rifle attacker, Pilgrim / Pioneer.
Her skill 2 is Seven Dwarves: V & VI; her burst is Seven Dwarves: I,
a one-round charged piercing weapon. Do not mix her with Innocent Days or Heavy Arms.
The rifle banner depicts Seven Dwarves II; the burst banner depicts the oversized
anti-ship rifle and closed graphite face armor. The launcher follows the reference's
paired three-cell pods, yellow central slit and split white shields.

These are generated interpretations, not official extracted textures or exact
animation frames. The ground emplacement is a custom game adaptation, so it is
labeled Missile Emplacement rather than claiming it is the canonical V & VI skill.
Existing cone damage, fire, healing and deployment upgrades are custom gameplay;
their mechanics are preserved and described honestly. This pass changes talent-menu
illustrations and equipment icons, not the live combat animation.
