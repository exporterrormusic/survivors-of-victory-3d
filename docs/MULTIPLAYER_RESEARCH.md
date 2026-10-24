# Multiplayer investigation

Checked: **2026-10-24**. Research only; no gameplay or dependency changes.

**Latest requirement:** the user intends an itch.io browser release, prioritizes free hosting,
and wants automatic matchmaking rather than only manually shared room codes.

**Recommendation for the first casual release:** WebRTC/PeerJS for player-hosted matches,
with a small Cloudflare Worker + Durable Object queue for Quick Match. Automatic matchmaking
and simulation authority are separate choices: the queue pairs strangers, while one selected
player runs the match. This is a proposed architecture, not an implemented or deployed service.
For competitive/ranked play or matches independent of a player's browser, use an authoritative
Colyseus server instead. The earlier Colyseus-first recommendation remains the stronger fit for
those requirements; automatic pairing alone does not require it.

## Quick Match proposal

- The itch.io build displays Quick Match, queue status, Cancel, and a clear connection-failure retry.
- A lightweight central queue groups compatible game versions/modes and suitable regions, then
  assigns a host and issues short-lived match tickets. Start by validating two human players;
  larger team sizes are a later product/benchmark decision, not a WebRTC limit.
- Guests connect to the selected host through WebRTC. The host resolves simulation and sends
  compact state updates; the matchmaker does not tick hundreds of units or relay normal game data.
- Queue reservations expire, disconnects remove entries, and failed peer connections return
  players to a retryable state. Queue cancellation must not leave a phantom reserved player.
- With nobody available, display the actual waiting state and offer clearly labeled practice.
  Bot filling is an optional later feature, not an existing hero-bot system or disguised human match.
- The small hosted queue is a plausible fit for Cloudflare's free quotas, subject to measured
  usage. Use WebSocket hibernation for idle lobby connections. Matchmaking does not eliminate
  TURN requirements or host dependence; reliable connectivity is not guaranteed to cost $0.
- Retain private room codes as another way to join. Keep simulation and transport separate so
  a future dedicated server can reuse the game rules; that migration still requires engineering.

References: [PeerJS signaling/TURN FAQ](https://peerjs.com/client/faq),
[Durable Objects quotas](https://developers.cloudflare.com/durable-objects/platform/pricing/),
[hibernating WebSockets](https://developers.cloudflare.com/durable-objects/best-practices/websockets/).

## What Boom Arena currently uses

The reference is [Boom Arena on NPC Jail](https://npc-jail.pages.dev/game/boom-arena), with its game client served at [elegg-boom-arena.pages.dev](https://elegg-boom-arena.pages.dev/). The About page credits assets and rendering tools but does not identify a multiplayer backend.

I fetched the public game's HTML and the [main JavaScript bundle it references](https://elegg-boom-arena.pages.dev/assets/index-COExG3gm.js). In this build:

- The menu declares `{label:"MULTIPLAYER",off:!0}`; `!0` means true.
- Menu rendering assigns disabled entries the `m-off` class, and activation ignores entries with `off` set.
- The duel description identifies the opponent as a bot, and game-mode definitions configure bots.
- Searches found no `WebSocket`, `RTCPeerConnection`, `EventSource`, PeerJS, Colyseus, PartyKit, Socket.IO, Firebase, Supabase, or `wss://` references in the main bundle. Its fetch calls cover asset loading. The observed dynamic import is for video export.
- The HTML response was HTTP 200 with `Server: cloudflare`. This establishes the delivery platform, not an active game server or the developer's billing plan.

**Conclusion:** multiplayer is disabled in the inspected public build. There is no verified active multiplayer backend to emulate. This does not establish what the author may have in private development, and this was source inspection rather than a live multiplayer session or server audit.

Local evidence is retained under `artifacts/multiplayer-research/`: the HTML, downloaded bundle, and `boom-evidence.json` with snippets, token counts, and its SHA-256 fingerprint. Bundle filenames may change after deployments.

## Options and what “free” includes

| Option | Free component | Suitability for this game | Main limitation |
| --- | --- | --- | --- |
| **Colyseus + local hosting / Render Free** | Open-source framework; your existing computer, or a limited free Render service | Preferred foundation for server-owned movement, damage, AI, cooldowns, and team XP | Framework licensing and server hosting are separate; free hosting needs benchmarking |
| **Cloudflare Durable Objects + WebSockets** | Hosted compute within daily free quotas | A custom authoritative room per match, with no Node server to administer | More networking/game-room code to build; active matches consume quotas |
| **PeerJS / WebRTC** | MIT library and free default signaling | Small private matches, with one player's browser running the simulation | Host disconnects, browser throttling, host trust, and TURN relay requirements |
| **Photon Realtime** | Limited hosted development plan | Possible for a development prototype | Current free plan is development-only, so not a free public-launch recommendation |

### Colyseus

Colyseus supplies authoritative Node.js rooms, matchmaking, state synchronization, and browser integration. Its documentation includes Babylon.js and Three.js examples. That is a close fit for our TypeScript code. [Official documentation](https://docs.colyseus.io/)

The open-source framework is free to self-host; managed Colyseus Cloud currently starts at $15/month. The managed service should not be confused with free software. [Official pricing](https://colyseus.io/pricing/)

Render is a plausible free playtest host: 750 instance-hours per workspace each month, sleep after 15 minutes without incoming traffic, roughly one minute to wake, and possible restarts. WebSocket messages count as traffic. Bandwidth/build allowances also apply; exhaustion may suspend services or incur charges depending on billing settings. Render explicitly positions Free for testing/hobby use. We have not measured whether its available CPU handles our intended match size. [Render Free limits](https://render.com/docs/free)

### Cloudflare Durable Objects

The Free plan supports SQLite-backed Durable Objects with 100,000 request units and 13,000 GB-seconds of duration daily. Incoming WebSocket messages have a 20:1 billing ratio; outgoing messages are not charged as requests. Free quota exhaustion causes operations to fail. This is capped hosting, not unlimited free multiplayer. [Pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/)

A running simulation timer prevents hibernation, so an active MOBA match continues consuming duration. Hibernation is useful for idle rooms. A prototype would need measured request usage, tick cost, and latency before we choose this route. [Object lifecycle](https://developers.cloudflare.com/durable-objects/concepts/durable-object-lifecycle/)

### PeerJS

PeerJS wraps browser WebRTC data connections and offers free default signaling. Some networks require a TURN relay; signaling is not the same as relay bandwidth. [PeerJS](https://peerjs.com/) and [connection caveats](https://peerjs.com/client/faq)

Our proposed topology would have each guest connect to one host, which resolves combat and distributes state. Host migration and recovery would be additional work. This is attractive for friends playing together, but I would not choose a player's browser as the trusted authority for competitive matches. This assessment is architectural judgment, not a measured player limit.

### Photon Realtime

The current free tier allows 20 concurrent users and 60 GB/month, explicitly **for development only**. That makes it less suitable for the requested free ongoing option. [Official pricing](https://www.photonengine.com/realtime/pricing)

## What our code needs first

Despite the Three.js reference, this repository uses **Babylon.js + Vite + TypeScript**, as shown in `package.json`. There are no multiplayer dependencies. Rendering engine choice does not determine the transport.

The key coupling is in the simulation:

- `src/main.ts` updates the hero and combat from the render callback, using a frame-dependent delta capped at 0.05 seconds.
- `src/hero.ts` takes its position directly from the chibi mesh. Its orders are a useful starting point, but targets currently refer to objects rather than network entity IDs.
- `src/combat.ts` has one hero target and mixes mesh-based projectiles, hit resolution, enemy updates, and team progression.
- `src/enemy.ts` combines rendering/animation with AI and takes a single hero target. Multiplayer needs a collection of eligible targets and consistent target selection.

Proposed implementation sequence:

1. Extract plain TypeScript simulation state and commands from meshes, camera, HUD, and animation. Use stable entity IDs and explicit gameplay positions/hit shapes. Rendering reads that state.
2. Run one authoritative room at a fixed timestep. Start by evaluating 20 simulation ticks/second and 10–20 state updates/second; tune using measurements rather than treating these as final requirements.
3. Have clients send movement/attack/cast intentions. The server validates movement, targets, resources, cooldowns, damage, deaths, AI, and XP. Keep models, textures, and animation bones out of network messages.
4. Add remote-player interpolation and local movement prediction/reconciliation so input remains responsive.
5. Build the first slice: create/join a private room, two independently controlled heroes, shared Raptures, synchronized damage/death/respawn, and disconnect/rejoin handling. End an empty match cleanly.
6. Test two browsers locally, then two devices on different networks with artificial latency and connection interruptions. Record tick time and bytes/second. Expand to the intended full match size only after this slice works.

Initial scope assumption: two players for validation, with larger team matches later. Final team size, expected simultaneous rooms, and public competitive versus private casual play remain product choices. No provider account, deployment, or multiplayer implementation was created during this investigation.
