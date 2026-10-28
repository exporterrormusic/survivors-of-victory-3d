# Frozen North ? mountain vault and enclosed valley

Frozen North retains its 68 m playable radius; other maps retain their existing extents. Editable snow covers 152 m, with a coarse skirt extending to ?150 m.

Two valley arms surround a central ice ridge. The northern bend is the broad route between them. The middle shortcut is a continuous 59 m industrial tunnel, with solid roof and ceiling slabs, full-height walls, a dry floor and open east/west portals. Falling weather is masked below the tunnel and vault roofs. Structural ribs and trim sit on those slabs rather than leaving holes between panels.

A side passage in the tunnel's northern wall leads to a recessed mountain vault at (0,12). The north ridge has a matching recess in its geometry and collision. A circular geared blast door retracts into its frame before rolling into a side pocket. The chamber replaces the Frozen elevator: arrivals, extraction, and survival supply deliveries stay at ground level. Existing timing/interlocks are retained internally; transport poses use the vault floor height. Other maps still use the elevator. The chamber's open and closed collision matches the doorway; survival deliveries clear actors toward its only exit.

The west endpoint contains a supply hangar, the east endpoint a communications station. The perimeter is closed by 32 overlapping mountain sections, with varied heights, backed by four tightly staggered rows totaling 528 pines. The physical mountain feet stop outward movement before the radius limit. Trees use nine two-triangle foliage cards apiece; the boundary forest is static, batched in spatial patches, and casts no per-tree shadows. This lets the forest read densely without restoring the earlier foliage-card and shadow cost.

Day and night are the only Frozen options. Legacy snow_dusk selections resolve to day. Generic L-shaped ruins remain excluded from map placements.

Validation:
- tools/test-frozen-layout.mjs checks routes, the vault approach, forest counts, full snow coverage, and 120 outward perimeter traces.
- tools/test-frozen-vault.mjs checks roof coverage, clear passage geometry, door movement, and open/closed collision.
- tools/verify-frozen-vault.mjs checks live extraction/reopening, survival arrival, squad/crate delivery, switching back to a normal elevator, and captures the map, border, tunnel and vault.
