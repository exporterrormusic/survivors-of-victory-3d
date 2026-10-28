# Co-op Multiplayer Plan (WebRTC)

Status: planned, not started. Written 2026-10-28.

## Goals

- Co-op Survival Round for **3 players** (design target). Player count is a constant, not hard-coded — a future MOBA mode would need **10**.
- Join by **room code**. No accounts for players, no account or server for the developer at launch.
- Works in both release targets (itch.io web + download).

## Architecture: host-authoritative

The survivor loop assumes one player (`KitContext` in `src/survivor/main.ts`, `init.player` in `SurvivalMode`, `Horde`, `SupplyLift`, enemy attacks) and uses ~130 `Math.random` calls, so lockstep is out.

- **Host** runs the full simulation: enemies, director, XP, lifts, boss, round result.
- **Guests** send inputs (move vector, aim point, buttons, skill-point spends) and render host state.
- **Channels** (WebRTC DataChannels):
  - unreliable/unordered — snapshots at 20–30 Hz (player + enemy transforms, HP, anim state)
  - reliable/ordered — events (kills, level-ups, skill picks, lift/exfil state, banners, downs/revives, round end)
- **Guest presentation**: own character is predicted locally and softly corrected; everything else is interpolated ~100 ms behind.
- **Cosmetics stay local**: particles, petals, weather, hit flashes are spawned from events on each machine, never synced.
- **Topology**: star (everyone ↔ host). Fine up to 10; host upload is the limit.

## Connecting

- **Launch: Trystero** (open-source). Peers meet through existing public Nostr relays / BitTorrent trackers; then traffic is direct peer-to-peer. Free public STUN for NAT traversal.
- **Fallback**: copy-paste connection codes (manual SDP offer/answer, zero servers). Long text, for emergencies.
- **Known gap**: ~1 in 10 player pairs on strict NAT (some hotspots, school/work networks) can't connect without a TURN relay. Show a clear "couldn't connect" message, never a frozen load.
- **Later, optional**: own server, swapped in behind the same connection interface.
  - Cloudflare Workers (free): signaling only, thousands of joins/day.
  - Oracle Cloud Always Free VM: signaling + `coturn` TURN relay. 10 TB/month egress ≈ ~75 relayed players concurrently ≈ ~750 total concurrent players at a ~10% relay rate (estimate; measure in Phase 2).
  - Either needs one developer account; players still need none.

## Gameplay rules for co-op

1. **Targeting** — enemies choose the nearest/weighted player, not "the" player.
2. **Downs** — a downed player is revived by a teammate standing nearby; the run ends only when everyone is down (no punishing play).
3. **Level-ups** — unchanged: no pause; skill points are spent live. Each player spends their own.
4. **XP** — toggle during Phase 1 playtests: **shared** squad level (default) vs. per-player.
5. **Scaling** — `hpScale`, `spawnRate`, `aliveCap` take player count.
6. **Lifts/exfil** — depart when everyone is aboard, or on a countdown after the first boards.
7. **Pause menu** — opens as an overlay; the match keeps running.

## Phases

| # | Phase | Done when |
|---|---|---|
| 0 | **Spike** — throwaway test page: Trystero room code, two tabs, one capsule moved by the guest and synced by the host | Inputs and snapshots round-trip between two machines; latency/relay reliability noted |
| 1 | **Offline multi-player refactor** — `players[]`, a `KitContext` per player, multi-target enemies, downs/revives, XP toggle, a test-only AI second player | Survival Round plays with 2–3 local players; existing tests pass |
| 2 | **Netcode** — input/snapshot/event protocol, interpolation, local prediction, bandwidth measurement | Two machines finish a full round |
| 3 | **Lobby** — Host / Join by code, per-player character select, ready check | Strangers join from the itch.io build |
| 4 | **Hardening** — disconnects (dropped player leaves, run continues), host leaving ends the run cleanly, connect-failure messaging, download build check | Stable on poor networks |

## Risks

- **Phase 1 refactor is the largest job.** Every `player` reference changes. Grep `tools/` and `artifacts/` first — Node tests and artifact scripts read `window.game.player`; keep a `player` alias to the local player.
- **Public relays** may be slow or down; the connection layer must be swappable (fallback codes, later own server).
- **Host performance** — the host simulates and renders; enemy counts may need a co-op cap.

## Open questions

- Shared vs. per-player XP (decide after Phase 1 playtest).
- Should Shop unlocks/rewards from a co-op round save for guests too? (Assumed yes, each saves locally.)
