# Co-op Multiplayer Plan (WebRTC)

Status: experimental, may not ship. Written 2026-10-28.

Built so far (2026-10-28), not imported by the game, no UI: `src/net/` — `protocol.ts` (wire types, `DEFAULT_MAX_PLAYERS`), `transport.ts` (Transport seam + in-memory `LoopbackHub`), `trystero-transport.ts` (room codes over public Nostr relays, `@trystero-p2p/nostr`), `room-code.ts`, `session.ts` (`CoopHost` / `CoopGuest`: handshake, slots, rejects, inputs with tap buffering and acks, snapshots, reliable events, host-left), `interpolation.ts` (`SnapshotBuffer`, `interpolate`), `coop-rules.ts` (`coopScale`, `chooseTarget`, `ReviveTracker`, `CoopXp` shared/split). Tests: `npm run test:coop`.

Phase 0 spike: `coop-test.html` (dev server only; `vite build` ships index.html alone). Two headless Chromium browsers on one machine joined through the public Nostr relays in 0.6–3.4 s at ~20 snapshots/s; one relay was down (503) and the others covered it. Still to test: two different networks.

Phase 1 (2026-10-28), behind `?coop=bot` / `?coop=bot2` (+ `&coopHero=scarlet,rapunzel`), e.g. `/?run=test-range&mode=survival&coop=bot2`. Off unless the flag is set. In `src/survivor/coop/`:
- `teammate.ts` — a full second `Player` with its own kit and `Run`; joins `TargetField.squad` (`threat: 1`), so the existing horde targeting, contact damage and overhead bars apply. Its camera calls (shake/zoom) are muted; its XP and kill credit go to the local run (shared level).
- `bot-input.ts` — AI driving a teammate through `InputSource` (the same seam a remote player will use): follow, shoot nearest, kite, dash when hit, Burst when full, walk to revive.
- `coop-squad.ts` — downs/revives (`ReviveTracker`, revive ring VFX), teammates ride lifts with the player, difficulty scale.
- Game edits: `InputSource` in `input.ts` (Player accepts it), `Defender.threat` in `targets.ts` + `horde.ts`, `coop` on `SortieModeInit`, Survival mode uses squad HP for defeat and `coopScale` for HP/spawn/alive cap, `main.ts` wiring, HUD hides "TRAINING RESET" for co-op downs.

Verified in a production build (headless GPU, ~45 fps): bots killed 23 Raptures in 15 s, Raptures split onto teammates, a downed bot was revived by the other in ~5 s at 40% HP, and the local player going down did not end the round while bots stood.

Phase 2a (2026-10-28), network play with a 2D guest view. `?coop=host` (e.g. `/?run=test-range&mode=survival&coop=host`) opens a Trystero room and shows `CO-OP ROOM ABC-DEF` on the HUD. A guest joins from `coop-test.html` (`?hero=scarlet|rapunzel`) and gets a real hero on the host's map:
- `coop/remote-input.ts` — a guest's `PlayerInput` as an `InputSource` (press/release edges between inputs).
- `coop/net-host.ts` — `CoopNetHost`: guests → `CoopSquad.addRemote`, inputs applied each frame, 20 Hz snapshots (heroes + live Raptures with stable ids, coordinates rounded to cm), a `round` event each second, banners, ping replies.
- `net/session.ts` — `CoopHost.dropSilent()` drops guests silent for 8 s (a closed tab can take WebRTC 30 s+ to notice).
- Verified (production build + dev guest page, two headless browsers, public relays): joined in ~2 s, guest-controlled Scarlet fought and scored kills, 20 snapshots/s with 25 Raptures, 19 ms round trip on one machine, guest's hero removed after closing the tab.
- Gaps: the guest has no 3D view (Phase 2b), no local prediction (own movement lags by a round trip + ~100 ms), snapshots are JSON (~10 KB at 150 Raptures; binary packing later), no drop-in protection (`started` is never set).

Phase 2b (2026-10-28), 3D guest client. The guest opens the game with the host's map params plus `&coop=join&room=ABC-DEF&character=scarlet`, e.g. `/?run=test-range&mode=survival&coop=join&room=ABC-DEF&character=scarlet`:
- Model: the guest moves its own hero locally (instant controls) and sends its position with each input (`PlayerInput.x/z`); the host places that guest's Teammate there and owns all damage, kills, health and the round. Fine for co-op (no anti-cheat need).
- `coop/net-guest.ts` — `CoopNetGuest`: sends inputs at 30 Hz; takes its own HP/down state from the host; other heroes are full Teammates walked to their interpolated pose with their held buttons (their kits fire for show); Raptures are crowd targets driven by the new `Target.puppet` pose (walk cycle, hit flash, death collapse when they leave the snapshot). `disableLocalDamage` makes every guest-side `Run.damage` a no-op that still sparks.
- `PlayerState.hero/buttons` added; host fills them (`heldBits`).
- Verified (production build, two headless game instances, public relays): guest walked out of the lift and the host's copy followed to within 0.4 m; host-side damage reached the guest's HUD (50 → 42); both showed the same Raptures (15/16, 24/25 at sample time).
- Enemy attacks on the guest (2026-10-28): every live ground warning (`TelegraphLayer.snapshot()` → `Snapshot.tells` → `TelegraphLayer.mirror()`) — circles, lanes, blasts, with fill — so area hits, beam/charge lanes and missile landing spots are dodgeable. Bolts and missiles are announced at launch (`mode/behaviors/echo.ts`, from `BoltField`, `MissileVolley` and the fallback `EnemyLaserAttack`) and replayed as harmless copies (`SilentTelegraph` keeps the copies' own warnings hidden). Verified: host and guest showed the same 7 warnings; 20 missiles and 12–18 bolts replayed. Not mirrored: charge-up glows, beam bodies (their lanes are), melee swing markers, energy orbs/pillars.
- Talents (2026-10-28): every teammate takes the squad level each frame (`Teammate.update`), so tiers unlock and the 4%/level damage and health growth applies. Bots pick a random option when a tier opens and press their Special now and then (`bot-input.ts`). A guest picks with the normal picker on its own machine; `CoopNetGuest` sends its picks as a `talents` event (on change, and again every 3 s in case the host's copy of the hero was still loading) and the host applies them with `Teammate.applyPicks`. Verified: two bots at squad level 10 had 4 picks each and 71 max HP (from 50); a guest's two picks appeared on the host's copy within 2 s.
- Guest HUD (2026-10-28): the host sends its Survival objective text (`SurvivalMode.objectiveText()`) and Obelisk health in the `round` event (now 4/s), and every Survival banner (`SurvivalMode.onBanner` → `CoopNetHost.banner`). `coop/guest-hud.ts` draws them in Survival's own boxes (text only, never the host's HTML), adds the `survival-round` body class (hides the Test Range title and Test Lab), and the guest's clock and wave follow the host's round clock. Verified: host and guest showed the same objective text and clock (00:16); the guest saw the "joined" banner.
- Guest round end (2026-10-28): `coop/guest-hud.ts` shows Survival's results card when the host's round reaches victory/defeat, and a "Host left" / "Could not connect" card when the session is lost.

Phase 3 lobby (2026-10-28), from the main menu (SOLO / MULTIPLAYER):
- `src/net/lobby.ts` — `LobbyHost` / `LobbyGuest` on the same session: picks (NIKKE, skin, ready), the host's map and mode, `start()` closes the room. Node-tested in `test:coop`.
- `src/frontend/scenes/MultiplayerScene.ts` — Create / Join (type or paste the code), then the lobby: room code (click to copy), host-only mode and zone pickers, Smash-style player cards (portrait, skin thumbnails, ready bar), START / READY. The backdrop is a random zone's art with its weather (`ui/ZoneAmbience.ts`: embers, ash and heat distortion, petals, fireflies, snow, rain and lightning, fog).
- `src/net/coop-handoff.ts` — the open session carries into the match (same page), so nobody joins twice; guests ping while loading so the host doesn't drop them. `MatchRequest.coop` adds `coop=host|join&room=` to the run URL. Skins reach teammates (`PlayerState.skin`, `Teammate.create(..., skin)`).
- Verified (production build, two browsers, public relays): create → join by typed code → guest picks Rapunzel and readies → host changes zone → START → both in the same Caldera match with the guest's Rapunzel (and skin) on the host.
- Gaps: no names (everyone is "PLAYER"); the host's "New round" reloads and ends the session for guests; a guest can't rejoin after a drop.
- Gaps: talent quests progress only on the host's copy (the guest's quest tracker stays at 0); other heroes' talents aren't shown on a guest's puppets; lift arrival isn't mirrored (the guest starts on the open pad); map params must be typed to match the host.

Known gaps: XP is shared only (`CoopXp` split mode not wired); teammates get no passive; a teammate's picks aren't cleared when a round resets the local run's tiers; only Survival mode handles squad defeat and scaling; map hazards (storm, lake, crater fire, volcano), health crates and eggs still only see the local player.

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
