# Campaign Plan — ECHOES OF HOPE

A story campaign retelling the user's NIKKE fan story *Echoes of Hope* as a series of
survivor-style chapters joined by dialogue scenes and a few cinematics.

## Core rules

- **One hero on screen.** In solo play there is only one playable character on screen. The rest of the story party is
  present only through the **comms panel** (portrait + line).
- **Any hero is selectable.** The player picks their hero before each chapter. Story dialogue stays the
  same no matter who is picked. As more heroes get built, the roster grows.
- **Co-op: later.** Planned but deferred; solo comes first. When it lands, each player brings their
  own hero (relaxing the one-hero rule), and cutscenes/dialogue scenes trigger for everyone at once.
- **Dialogue scenes** are full-screen (art/model backdrop) with subtitles in the form
  `CROWN: Oh, really?`. The comms panel handles in-mission chatter.
- **Threat comes from time, not punishment** (see the design rule). "Unwinnable" moments are survive timers
  that end in a scripted rescue or cutscene, never a game-over.
- **Echoes:**
  - *Marian Echoes*: story-only. A shimmering hologram of Marian that fades in and out. No collision,
    can't be targeted or damaged, can trigger dialogue.
  - *Rapture Echoes*: gameplay. Real enemies that phase in and out and can only be hit while solid.
  - Both use one shared hologram shader. Sin's invisible tail in Ch 5c uses it at low intensity.

## Chapters

| # | Chapter | Story party (comms) | Setting | Gameplay |
|---|---|---|---|---|
| C0 | Cinematic: the flash | – | Kingdom → forest | The Kingdom spots an unusual explosion over the forest. |
| 1 | The Explosion | Rapunzel, Scarlet, Marian, Crown | Forest approach → scorched crater | Tutorial-pace waves. The trees get more scorched closer in. First Marian Echo. Find Wells, who collapses. |
| 2 | The Kingdom | Full cast incl. Chime, Kilo, TALOS (Kilo model), Snow White | Castle in disrepair | No combat. Full-screen briefing scene. Candidate between-chapter hub. |
| 3 | The Search | Snow White, Crown, Wells, Marian | Deep forest | Exploration + survival. Marian Echoes as beats. Rapture Echoes introduced. Scarlet & Rapunzel leave in dialogue. |
| 4 | The H.G. | Same squad | Crash site | Recover the datacube. Survive-timer horde, then Chatterbox (future) rescues. Optional short Chatterbox control. |
| C1 | Cinematic: the last stand | – | Crash site | Chatterbox urges them to take the cube to the Ark, then is killed by Future Marian. |
| 5a | Scene: the split | Snow White, Isabel / others | Forest | Snow White & Isabel stay to hold off the horde. |
| 5b | Rearguard | Snow White, Isabel | Forest choke | Stationary defense against the horde. |
| 5c | The Long Dash | Crown, Cecil, Wells, Marian | Escape route | Forward-moving escape with a time-pressure front. Sin as a faint shimmer behind Cecil. |
| 6 | Echoes of Hope | Snow White + squad | Forest clearing, on the way to the Kingdom | Isabel flies Snow White in. "Marian's weakness?" leads to the Future Marian reveal. Survive-the-phases boss; her final phase is unstoppable and leads to the cutscene. |
| C2 | Cinematic: the cube is lost | – | Clearing | She can't destroy the cube, so she self-destructs and takes it with her. Credits. |
| C3 | Post-credits: Eden | Sin, Cecil | Eden lab | Sin has recovered Future Marian; Cecil examines her. |

Cinematics: in-engine by default (existing models, scripted camera, subtitles). External-tool video
only for C0/C1/C2 hero moments, if at all. Keep web build size in mind.

## Systems to build (in order)

1. **Mission script layer.** A data file per chapter: triggers, objectives, comms lines, wave spawns,
   survive timers, camera shots, scene/video steps, chapter end.
2. **Dialogue scene player.** Full-screen backdrop, speaker subtitles, advance/skip, co-op sync.
3. **Hero select per chapter.** Reuses the existing roster/select flow.
4. **Echo shader + two behaviors** (Marian story echo, Rapture phasing enemy).
5. **Scripted outcomes.** Survive-timer defenses, ally-arrival rescue, boss that ends on a cutscene.
6. **Moving-front level** for 5c.
7. **Campaign progress + chapter select.** Local save, no accounts.

## Content needed

- **Characters:** Wells, Chime, Cecil, Isabel, Chatterbox (ally/cinematic), Future Marian (Marian +
  corrupted material). Kilo model reused for TALOS. Sin exists.
- **Maps:** one large forest with chapter areas (approach/crater, deep search, crash site with the H.G.
  wreck, escape route, boss clearing) plus the Kingdom castle interior/courtyard. Eden lab for C3.
- **Writing:** full script per chapter (scene lines + comms barks).

## Build order

Vertical slice: script layer + scene player + Chapter 1 → Echo shader → Ch 3–4 → Ch 5 → Ch 6 boss →
Ch 2 hub → cinematics last, once pacing is locked.
