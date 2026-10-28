# Survival rounds — current game direction

Approved 2026-10-26. This replaces the permanent-talent sortie proposal and the Relay Run experiment.

**Choose NIKKE and map → arrive by elevator → survive 20 minutes → defeat Obelisk → earn one Rapture Core → unlock skins / future playable characters → start a fresh round.**

## Talent progression

Each round starts at level 1, zero XP / SP, and rank 1 in Weapon, Special and Burst. Defeating enemies awards XP directly, with no pickup gems. Every level gives one SP. Press Tab to pause and spend points on the next ordered rank of any tree. Existing effects, prerequisites and costs stay unchanged: ranks 2–5 cost 1, 2, 3 and 4 SP respectively. There are no random talent cards and no extra temporary upgrade system.

The lobby-selected capstone remains a loadout preference. Its power activates only when its tree reaches rank 5 during the current round. Starting another round resets every rank, including capstone activation.

First-pass leveling uses `120 + 80 × current level` XP per level, capped at level 31 / 30 earned SP. All three trees cost 30 SP total. 40,800 XP buys the complete progression: about 1,020 ordinary kills, fewer with heavy bonuses. The target is most talents unlocked late in a successful round, not guaranteed upgrades from elapsed time. This pacing still needs normal player playtesting.

## Round structure

- The existing elevator rises, opens its gates and releases the player. Arrival and paused menus do not consume round time.
- Five four-minute wave bands: First contact, Flanking packs, Demolition swarm, Crossfire and Final surge. Enemies arrive continuously with bounded population (30–70) and short spawn warnings. Ordinary enemies never gate movement.
- A Hard Hat appears at 5, 10 and 15 minutes. Killing a heavy gives bonus XP and restores 30% health.
- Every 60 seconds the arrival lift cycles down and back up (src/survivor/mode/supply-lift.ts). It brings a health crate (40% health, picked up from the deck while injured; one at a time) and a squad of 1–5 mass-produced NIKKEs (Soldier, Product and iDoll models, squad size grows over the round, at most 8 alive). The squad runs and guns with the player's rig, holds a ring around the player, backs away from Raptures and steps out of red ground warnings. Raptures still target only the player. The lift waits while the player or a squad member stands on the deck.
- At 20:00, the remaining ordinary horde is cleared and Obelisk arrives. The round is not won by the timer alone. Its ranged attack is supplemented by visible area-strike warnings, increasing below half health. The boss fight can extend the round beyond 20 minutes.
- Defeat, abandonment, victory and retry have terminal results handling. A victory awards exactly one core; death and abandonment award none. XP, levels and talent ranks are never saved by this mode.

## Persistent rewards

The existing core wallet is retained (`roster.pristineCores` is the legacy storage field; UI calls these Rapture Cores). Rewards and an idempotency receipt are written together. Storage failure is reported in results with a retry action. Existing balances, owned skins and selections are preserved. Old saved sortie talent data is neither loaded nor overwritten by survival rounds.

Existing non-default skins now cost **1 core** as an initial playable economy. Only Snow White has a finished survivor kit; other characters remain Coming Soon and cannot be purchased yet. Character recruitment wiring remains available for future completed kits. No new character kits are claimed by this change.

## Playing and validation

Stage Select defaults to **Survival Round**. Select a map theme, then deploy. Direct link: `?run=test-range&mission=survival_round&zone=outskirts_day` (alias `mode=survival`). Test Range remains in the menu; older Relay Run and Salvage Run remain available through their existing direct links.

Controls: WASD, mouse aim, LMB rifle, RMB turret, E Burst, Shift dash, R reload, Tab talents, Escape pause. Existing manual combat and Anime lighting remain.

Checks: `npm run test:survival`, `npm run test:progress`, `npm run test:sortie`, `node tools/test-capstones.mjs`, typecheck and production build. Browser integration: `node tools/verify-survival.mjs` against port 5194, using an isolated profile. It checks elevator arrival, fresh ranks despite legacy saves, XP, ordered purchases and pause, abilities, healing, heavy/boss transitions, victory reward, skin purchase, retry reset and death. Time transitions are accelerated in browser tests; this is not a measured twenty-minute balance playtest. Captures: `artifacts/survival-round/`.
