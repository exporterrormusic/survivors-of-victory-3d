# Nayuta survivor kit

Reworked around regular gold clones, a temporary silver-white army, and meditation.

## Base loop

- Nirvana fires paired shots for 2 damage each, every 0.08 s, with 30 rounds and a 2 s reload. Hits focus clones on the target for 3 s.
- Tap RMB summons a gold clone: 3 charges, sequential 6 s recharge, maximum 4 regular clones. At cap, tap to reposition within 8 m.
- Hold RMB for 0.35 s to retrieve the lowest-health-percentage clone, then another every 0.55 s. Both gold and silver clones can be retrieved.
- Regular clones mature during 12 s of combat. Retrieval grants 0.5 Insight when fresh, rising to 1 at full maturity. Silver clones grant 0.25 and do not mature. No baseline healing.
- Insight caps at 4. The first return starts a 10 s timer (14 s with Lasting Insight). Later returns add one-third of the maximum duration when fresh, rising linearly to two-thirds at full maturity, capped at that maximum. Silver clones use the fresh amount. Meditation pauses the timer. Each stack grants Nayuta and both clone types +25% damage, and Nayuta +7.5% movement speed, for +100%/+30% maximum. Unbroken Insight shares movement speed; damage sharing is baseline.

## Stillness of Many

After 1.5 s without moving, shooting or reloading, Nayuta meditates. Regular clones mature twice as fast while fighting, summon recharge runs 50% faster, and Insight duration pauses. Moving, shooting or reloading ends meditation. Summoning, holding retrieval and activating Burst preserve meditation and its entry timer. Commanding Stillness at level 4 doubles gold and silver clone damage while meditating. The equipped model remains unchanged; a blended folded-leg pose, gentle lift, gold light and recurring rings show meditation.

## White Procession

E summons 8 silver-white hologram clones for 8 s, separate from the regular cap. They charge toward the cast cursor (up to 12 m), fire while advancing, then fight and follow. Normal weapon attacks remain available and focus both kinds of clones. Silver models, projectiles and disappearance/return effects use cool white highlights. Surviving soldiers dissolve at expiration without rewards. Retrieval gives Insight but no regular-return quest progress, maturity, charge refund or retrieval Burst gauge.

Twenty models/rigs/materials are warmed during loading to cover the regular army, silver army and departure transitions. Burst no longer uses palm art, punch inputs, model transformation or player weapon suppression.

## Talent integration ? working tree

Level 1 offers three quests: retrieve 20 regular clones (3?6 Burst gauge per subsequent regular return), 60 clone kills (regular-clone coordinated volleys), or 60 cumulative seconds at 3+ Insight (share Insight with clones). Meditation counts toward the Insight quest. Quests only progress after selection.

Level 10 changes the army: White Procession adds charge contact damage/stagger; Sacred Assembly makes a mobile escort. Deep Stillness at 13 improves meditation recharge to double speed. Endless Procession at 20 extends the army to 12 s. Other compatible clone talents remain as a working baseline while the tree is reviewed; see `src/survivor/nayuta/tiers.ts`.

## Validation

`tools/verify-nayuta-army.mjs` verifies the new army/passive loop. Older punch/Burst probes are historical and no longer describe this kit. Run TypeScript, `tools/test-talent-tiers.mjs`, `tools/test-save-data.mjs`, and a production build.

## Nirvana presentation update

Gold is retained. Projectiles now use three persistent layers: a tapered amber wake, a gold lance and a narrow ivory core. Twin streams remain separate, with expanding muzzle rings and short impact shards. Clone shots use the same design at reduced scale. Projectile quads are released on impact, expiry and kit disposal; no new dot is spawned each frame.

The old SMG sample occupied a voice for roughly one second, exhausting four voices at 12.5 shots per second and dropping firing sounds. `fire-smg-shot.wav` retains the source attack, trims to 160 ms and fades its last 65 ms. The shared SMG cue uses six voices and a 25 ms retrigger guard. This allows normal overlap and natural stopping on release/reload without a separately running loop.

Reproduce the audio asset with:

```powershell
ffmpeg -y -i public/assets/audio/gameplay/weapons/fire-smg.mp3 -t 0.16 -af "afade=t=in:st=0:d=0.001,afade=t=out:st=0.095:d=0.065" -c:a pcm_s16le public/assets/audio/gameplay/weapons/fire-smg-shot.wav
```

`node tools/verify-nayuta-smg.mjs` checks 30 consecutive audio starts, voice retirement, visible streak geometry and pooled VFX cleanup. Capture: `artifacts/nayuta/smg-gold.png`.

## Quiet idle / hat flourish

The base model has no `idle` clip. Its generic fallback had selected `idle_eff`, whose `B_acc_cap_01` track grows the hat from 0.05 to full scale during the idle flourish. The base Nayuta now aliases `idle` to `talk_idle`, which keeps the hat retracted at approximately 0.016 scale. This applies to the player and summoned clones. The original flourish remains available under `idle_eff`; Wu Wei and other characters keep their existing idle selections. `tools/verify-nayuta-idle.mjs` checks both runtime aliases and the quiet clip's hat scale.

## Burst voice and clone firing animation

Asceticism now plays `public/assets/audio/voice/characters/nayuta/burst.wav` once on the initial cast, using the original -3.3 dB character mix. Follow-up E punches and spectral echoes do not replay the voice. The shared SFX preload includes it.

All 39 audio files in the original Phaser `public/assets/audio` are already independent project-local copies, verified byte-for-byte. No audio copy was missing; `.import` files are engine metadata. Verification hashes: `artifacts/nayuta/phaser-audio-audit.json`.

Clones now use the shared split-body rig: `cover_shot` recoil on each firing event, running legs while moving, and head-based aiming after skeleton evaluation. Rigs are pooled with their models and disposed with the kit. `tools/verify-nayuta-voice-clones.mjs` verifies local VO decoding, one voice call per Burst, actual hand-pose motion, standing/moving fire and cleanup.

## Clone spawn warmup

The first combat update originally built the clone-radius navigation grid and new masked animation groups on demand. Preparation now builds the grid, all clone locomotion/firing layers, translucent skinned material variants and the VFX shader. Two offscreen loading-time renders exercise moving fire and idle, initializing runtime animations and GPU skin buffers before deployment. Target acquisition rejects distant candidates before cover traces.

`tools/profile-nayuta-spawn.mjs` captures spawn, first update, render time and animation-group creation separately. In the browser probe, the first combat update fell from 101.2 ms to 8.6 ms, with zero new animation groups at spawn. Those are CPU update measurements, not a frame-rate guarantee; scene render timings vary in headless testing.

## Clone and Insight readability

Gold clones have a separate maturity bar below their health line: hollow diamond/GROWING until mature, then a framed filled diamond/MATURE +2 label, stronger gold shader and a one-time ready flash. Silver soldiers use silver labels and remaining-lifetime bars instead of maturity. Holding retrieval frames the next lowest-health target in white. Nearby labels are vertically separated with leader lines; these HUD labels remain readable through scene fog.

The panel above Manifestation shows four fractional Insight segments, actual damage/speed bonuses, remaining duration, an explicit MEDITATING/PAUSED state, mature/regular clone counts, and silver army count/lifetime. Its compact layout moves clear of open talent choices.

`tools/verify-nayuta-readability.mjs` verifies maturity states, retrieval marking, paused Insight and desktop/compact bounds.

## Fragility and calm meditation update

Regular and silver clones have 20% of Nayuta maximum HP (10 at base), doubled by Enduring Self. Their targeting distance weight is 0.35, making them preferred nearby defenders; they still take normal enemy damage. Clone markers stay at their projected head position without leader lines. Meditation uses a steady slowly rotating halo and 12 gently orbiting prayer-bead lights, easing in/out, replacing expanding rings. Visual reference: Nayuta halo/sphere motifs described in the anniversary art-team discussion, https://www.gamemeca.com/en/view.php?gid=1767598 .
