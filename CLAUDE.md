# CLAUDE.md — X-Men: Sentinel Strike, Team Edition (branch `v2-expansion`)

Deliberately short. The detail lives in the files below; this file holds the rules that are expensive to break.

## Read these first, in order

1. **`HANDOFF-EXPANSION.md`**: the current phase, the plan, each phase's checklist and gate, conventions, and
   the lessons from V1 and V2. **This is the handoff. Start here, and update it before you stop.**
2. **`docs/expansion-proposal.md`**: the approved design (roster, move grammar, reactions, impact, depth,
   content). The live copy is a Claude Doc (link in the handoff) and may carry newer comments.
3. **`HANDOFF.md`**: what V2 was when the expansion started.

## Where things are

```
game/              the game: a static page of ES modules; three.js 0.170 from jsDelivr through an import map
  index.html       page, styles, import map
  js/sim/          the simulation: deterministic, no DOM, no three.js (see the rules)
  js/sim/moves/    the move tables, one per hero (fields in schema.js); js/sim/moveEngine.js runs them
  js/*.js          the client: view, rigs, anim, fx, overlay, hud, input, audio, music, main (the loop)
  js/anim/clips/   the strike clips, keyed by move id; js/vfx/cues.js holds each event's effect cue
tests/             headless suites, run by `node tests/run-all.mjs` (Node 18+, no install)
  lib/bot.mjs      the bot that plays the mission; the no-softlock test and tools/probe.mjs use it
  golden/          the golden replays: recorded behaviour that tests/golden-test.mjs replays and compares
tools/             browser checks, the balance probe, publish prep (see tools/README.md)
docs/              the expansion proposal
```

## Rules

- **The simulation is a pure function of its seed and inputs.** Nothing in `game/js/sim/` touches the DOM,
  three.js, the clock (`Date`, `performance.now`) or `Math.random`; random numbers come from the world's seeded
  generator (`sim/rng.js`, state kept in `S`). Replays, snapshots and the tests depend on it, and so will netcode.
- **World state is plain data.** Entities refer to each other by id, never by object reference. `snapshot` is a
  `structuredClone` and `hashState` hashes the whole state, so anything you add must survive both.
- **Events: `emit(S, type, data)` spreads `data` first.** Never give event data a field called `type` or `tick`;
  it would be overwritten. (V2 hit this: an enemy's `type` hid the event's. The field is `unit` now.)
- **Every state a hero or Sentinel can enter has a way out.** Being hit, held, tagged out, downed, an ultimate
  starting or a section resetting must end any move cleanly (`HERO[id].cancel`, `endFastball` in V2). A move
  that cannot be interrupted cleanly is a softlock waiting for the bot to find it.
- **Tests before every push**: `node tests/run-all.mjs` must pass, including the mission bot, which must finish
  every run. Add tests with every feature; the phase gates in the handoff say which.
- **The golden replays guard behaviour.** A change meant to keep behaviour must keep `tests/golden-test.mjs`
  green. A change that alters behaviour on purpose re-records them (`node tests/golden/record.mjs`) in the same
  commit, and the commit message says so.
- **Look before you call a phase done**: run `tools/shots.mjs` with a plan for what changed,
  `tools/playtest.mjs` and `tools/coop.mjs`, open the screenshots, and get zero console errors.
- **No HUD element covers the play area.** The HUD lives in the bands above and below the game view
  (`#hud-top`, `#hud-bottom` in `game/index.html`); only menus, on a halted game, go over the view.
  `tools/layout.mjs` must pass after any HUD change.
- **Keep `window.__X` working** (`game/js/main.js`): every browser tool drives the game through it.
- **Git**: work on `v2-expansion`. The container is ephemeral, so commit and push after every meaningful step.
  Never rewrite `main`, `v1-original` or `v2-first-proposal`; the last stays frozen at `7ba3a51`, where the
  expansion started.
  End commit messages with the attribution lines your session gives you. Beyond those lines, keep model names
  out of commits, code and docs.
- **The repo stays private.** These are unofficial fan prototypes: keep the fan notices, add no Marvel logos,
  art or music, and never commit secrets.
