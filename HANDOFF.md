# X-Men: Sentinel Strike, Team Edition — handoff (V2, branch `v2-first-proposal`)

The first concept proposal's vertical slice (Claude Doc "X-Men: Sentinel Strike concept proposal"), rebuilt on a
new deterministic engine. An unofficial fan prototype with placeholder art and synthesized sound. Branched from
`v1-original` (the conversion of Nova Striker V9); V1's simulation, effects and tests are gone from this branch,
and its character rigs, animator, score and synth sounds were carried over and rebuilt.

## What the slice has (the proposal's phase 1)
- **The engine** (`game/js/sim/`): fixed 60 Hz, plain-data state, a seeded generator inside the state, entities
  referenced by id. `snapshot`/`restore`/`hashState` in `world.js`. A seed plus the inputs is the whole run:
  ten minutes of four-player play replays exactly (tested), a snapshot is about 6 KB.
- **Six inputs** for every hero: Attack, Power, Jump, Evade, Signature, Team (`sim/config.js` `BTN`).
- **Three rebuilt heroes**, one module each (`sim/heroes/`): Cyclops (optic blasts that bank off walls, visor
  aperture and strain, Tactical Call), Wolverine (claws, Drill Claw, rage, healing factor, berserk from 80 rage,
  climbing), Jean Grey (telekinetic grip and throw of Sentinels, crates, shots, the kid or teammates;
  levitation; Phoenix power; TK Shield). Perfect defence on Evade for all three.
- **Team play** (`sim/team.js`): Fastball Special, Psychic Rapport, Optic Edge, Lift and Hold; the shared
  X-Gauge; the team ultimate "To Me, My X-Men" (Team + Signature). Solo: a squad of three, tap Team to tag,
  hold for a benched hero's assist.
- **Sentinels that adapt** (`sim/adapt.js`): damage logged by power; past a threshold they warn, then field
  prism plating, adamantium weave or magnetic anchors against the power the team leans on. One counter at a
  time, team hits never countered, it fades between sections. Units by job: troopers, gunners, Hunters (mark a
  hero), Collectors (go for the kid), the Mk-II Sentinel boss.
- **One rescue mission** (`sim/mission.js`): "Extraction at the Sentinel Works": rooftop, cell block (break the
  door, free the kid; Collectors come for her), assembly hall, hangar (the Mk-II), then she runs for the X-Jet.
  A kid carried out or the whole team down restarts the section.
- **The comic look** (`toon.js`, `view.js`, `level3d.js`, `fx.js`, `overlay.js`): cel shading in three bands,
  ink outlines from the depth buffer, halftone dots in the shadows, impact panels, lettered sound effects
  capped per second, a caption-box HUD. Player identity lives in the outline rim, the ground ring and the tag.

## Not in the slice (later phases of the proposal)
Online co-op (and it cannot run inside a claude.ai artifact, which blocks WebRTC), the X-Mansion hub and the
campaign, Storm and Psylocke rebuilt, Wardens, the next heroes, authored art.

## Tests
`node tests/run-all.mjs` (Node 18+, no install): 78 checks.
- `tests/engine-test.mjs`: determinism and snapshots, the mission flow, every hero's core verb, all team-ups and
  the ultimate, the solo squad, adaptation, perfect defence, Hunters, the tick cost (about 0.04 ms).
- `tests/mission-bot-test.mjs`: a simple bot (`tests/lib/bot.mjs`) plays the mission with no cheats, alone and
  with two to four players, over several seeds; every run must get the kid to the X-Jet. It found five softlocks
  before it became a test (holes under open gates, the cell blocking the kid, Hunters crossing gates, Sentinels
  thrown out of a room, walkers stuck on walkways).

## Browser checks done
Real keyboard and mouse play, a second player on a simulated gamepad, menus by keyboard and gamepad, screenshots
of every room, hero, team-up, the boss and the debrief; no console errors. In SwiftShader (software rendering)
the game draws 10 to 25 frames a second at 1280×720; a real GPU is far faster.

## Running it
`cd game && python3 -m http.server 8765`, then open http://localhost:8765. Three.js comes from jsDelivr.
Test hooks: `window.__X` (the world, `join`, `step`, `inject`, `stats`).

## Measures to watch in playtests (from the proposal)
Team-ups and assists dealing at least 30% of co-op damage (the debrief shows the split), solo players spending
under 60% of the mission on one hero, a new player landing a team-up within five minutes, 60 fps with four
players on a mid-range laptop.
