# Handoff: the Team Edition expansion (branch `v2-expansion`)

> **Status, 2 October 2026:** **phase 0 is done and its gate passed**, and a menus and HUD pass the user asked for
> came after it (section 3b): the HUD sits in bands above and below the game view and never covers play, there is
> a ready room for picking heroes, first-time hints and key rebinding. That build is published (link below).
> Phase 1 has not started. Before it, check the proposal doc's comment thread again, then refine phase 1's
> checklist into steps.
> **Update this box, the phase checklists and the log at the end of every session.**

| | |
|---|---|
| Proposal (live, with comments) | https://claude.ai/code/artifact/d44cd592-96ae-468d-aadf-b8784ff3bdba |
| Proposal (copy in the repo) | `docs/expansion-proposal.md` |
| Where V2 started | branch `v2-first-proposal`, frozen at `7ba3a51`; its notes are in `HANDOFF.md` |
| V2 as published | https://claude.ai/artifact/MzaN97QpEmcpV11n83Aq7A |
| Ready room build (after phase 0) | https://claude.ai/artifact/UhSDGngLMLnCuq1W4CNjSj |
| Rules | `CLAUDE.md` |
| Tools | `tools/README.md` |

## 1. First steps in a new chat

1. **Get the repo.** If `moderngentlemen-sudo/xmen-game` is not in the session, add it with push access
   (`add_repo`), clone it, and check out `v2-expansion`. This clone has no fetch refspec, so fetch a branch by
   name: `git fetch origin v2-expansion`.
2. **Check the baseline.** All three of these are green on a clean checkout:
   - `node tests/run-all.mjs` gives 107 passed, 0 failed, in about 11 s (the golden replays take 4 of them).
   - `node tools/probe.mjs 2 1` finishes the mission (`"done":true`, about 2 minutes of game time).
   - `NODE_USE_ENV_PROXY=1 node tools/shots.mjs tools/plans/rooms.mjs` writes six PNGs to `tools/out/`.
     Open one with the Read tool to see the V2 look.
3. **Read the proposal and its comments.** Apply anything the user asked for to this file.
4. **Start phase 1** (section 4). Refine its checklist into steps like phase 0's, write its gate down as tests
   first, and make re-recording the golden replays its first commit. Commit and push after every step that leaves
   the tests green.

## 2. The plan

Six phases, engine first. Each phase ends in a playable build, published to its own link, that has passed its
gate. Three gates need the user: phase 1 (they play it and approve the feel), phase 2 (they check the frame rate
on their own laptop) and phase 5 (they sign off the release).

| Phase | Delivers | Gate | State |
|---|---|---|---|
| 0. Foundations | one move engine; V2's three heroes moved onto tables; animation clips and effect cues, still in V2's look | the same inputs give the same behaviour as V2 (golden replays); all 78 checks and the bot pass | done 2 Oct, gate passed |
| 1. Feel | about 30 moves each for Cyclops, Wolverine and Jean; in-sim hitstop, 12 reactions, the new effects; the Danger Room | every move tested; 15 combo trials pass; the user approves the feel | next |
| 2. Depth | the play line on a 3D path; five layers; light, fog, depth of field; Extraction rebuilt in the new set, with depth knockbacks | the bot finishes Extraction in the set; 60 fps at Medium on the user's laptop | |
| 3. Roster wave 1 | Storm, Colossus and Nightcrawler, with their team-ups; Bulwarks, Lancers and swarm drones | 29 move tests and 5 trials per hero; bots finish with random squads | |
| 4. Roster wave 2 | Psylocke, Gambit and Rogue; team-ups for all 36 pairs; Wardens and siege walkers; mission 2, the Foundry Line | a test for every pair's team-up; bots finish both missions with all nine | |
| 5. Content and polish | mission 3, Downtown, and the Giant; the full Danger Room; quality tiers; balance from bot stats; the release | 45 trials pass; bots finish all 3 missions; the user signs off | |

## 3. Phase 0: Foundations (done, 2 October 2026)

**Goal:** move the melee of V2's three heroes onto data tables run by one move engine, with **no change in
behaviour**, and prove it. All of it is done, and the gate passed.

### Where the melee lives now

- `game/js/sim/moves/<hero>.js`: one moveset `{ hero, chain, moves }` per hero, with V2's ids (`g1`–`g4`, `air`,
  `up`, `heavy`) and V2's exact numbers. `moves/schema.js` documents every field and holds `validateMoves()`;
  `moves/index.js` lists the tables. `config.js` keeps `HEROES`; its `MOVES` and `COMBO` are views of the tables,
  which the client reads.
- `game/js/sim/moveEngine.js`: `selectMove` (what Attack starts: inside the counter window the counter move, else
  the move for the context and direction, else the chain), `startMove`, `runMove` (the clock, the charge rule, the
  step, the hitbox on active ticks, the lift, the end, the cancels), plus `tryAttack` and `counterMove`.
  `player.js` calls it. The player's move state is still V2's: `p.move = { id, t, inst, counter, charged }`,
  `p.combo`, `p.comboT`, `p.atkHeld`.
- `game/js/anim/clips/<hero>.js`: the strike keyframes, keyed by move id. A clip's fields carry the air stance,
  the spin and the wind-up tremble (`clips/index.js` documents them). `anim.js` plays them.
- `game/js/vfx/cues.js`: the table from simulation events to effect calls. `FX.onEvent` plays the event's cue.

### How it was proved

- **Golden replays** (`tests/golden/`): seven cases recorded from V2 into `v2.json` (now `replays.json`) before any engine change. Three
  are the mission bot over whole missions (alone with seed 2, 2 players with seed 1, 4 players with seed 3); four
  are seeded random inputs for 1 to 4 players over 6,000 ticks. Each sample has a running digest of every tick
  and a fingerprint every second, and the test names the first field that differs. The cases reach every move of
  all three heroes, both counter paths, the cancels, the interruptions and berserk's fractional clock. They all
  match, and so do V2's state hashes in all 1,036 samples, so the proposal's "same inputs give V2's state hashes"
  holds literally.
- **Side by side** (`tools/sidebyside.mjs` against a worktree of V2):
  - the whole state is identical tick by tick, including with a head start on the hold count, so the charged
    heavy happens (holding alone cannot reach it, see below);
  - the heroes' poses are identical in 123,626 frames;
  - the effect calls are identical for 12,682 events.
- **Moves test** (`tests/moves-test.mjs`, 22 checks):
  - every table is valid, and every cancel lands on a real move;
  - hitboxes come out on active ticks only, also on the fractional clock;
  - the Attack grammar, the counter rule and the charge rule;
  - every move has a clip.
- **Browser:** the rooms and mid-strike screenshots (`plans/rooms.mjs`, `plans/moves.mjs`) match V2 by eye, and
  the playtest and co-op runs are clean.

### What phase 0 found for phase 1

- **V2's charged heavy never fires.** Holding Attack through the first strike counts `atkHeld`, but the strike ends
  (after 13 to 17 ticks) before the count reaches `charge.hold` (24 to 28), and the pose only freezes after that. The
  tables and the engine keep this exactly, and `moves-test` checks the rule itself with a head start. A fix changes
  behaviour, so it belongs to phase 1. The recommendation: freeze the first strike at the end of its active ticks
  while Attack is held, and fire the charge once the hold completes.
- **The step forward is mostly lost in the same tick.** `runMove` sets `vx = facing × step`, then `physics`
  decelerates toward 0 within that tick. From a 1.5 m/s step, Cyclops (deceleration 110) nets 0 m/s, Wolverine (70)
  0.33 and Jean (100) 0. Tune it in the feel pass: apply the step after `physics`, or skip the deceleration during
  a move.
- `selectMove` reads one direction: up (`STICK.up` in `config.js`, 0.55). The grammar's other directions and
  contexts are new work.

### Steps

- [x] **Golden replays, before touching any code:** `tests/golden/record.mjs`, `cases.mjs` and `v2.json`, then
  `tests/golden-test.mjs`, committed on their own, green.
- [x] **The table format:** `game/js/sim/moves/schema.js`, encoding only what V2 does.
- [x] **The tables:** `game/js/sim/moves/{cyclops,wolverine,jean}.js`, with V2's ids and exact numbers. The step,
  the launcher's lift, the charge rule and the counter and charge multipliers are fields now.
- [x] **The engine:** `game/js/sim/moveEngine.js`, with V2's order of operations and float arithmetic.
- [x] **The client side:** `game/js/anim/clips/` and `game/js/vfx/cues.js`. Nothing looks different.
- [x] **Tests:** `tests/moves-test.mjs`.
- [x] **The gate:**
  - the golden replays match, 107 checks pass and the bot finishes;
  - the screenshots match V2 by eye (`game/` at this branch's start is byte-identical to `v2-first-proposal`);
  - the playtest and co-op runs are clean;
  - pushed. No publish was needed: nothing changed for a player.

## 3b. Menus and HUD pass (2 October 2026, between phases 0 and 1)

The user asked for interface work before phase 1, with one firm rule: **no HUD or interface element may cover the
play area**. Done and published (the ready room build, linked above). No simulation change beyond `addPlayer`
taking an optional hero; the golden replays still match.

- **HUD bands.** `game/index.html` lays the page out as `#hud-top`, `#stage` (the 3D view and the comic layer)
  and `#hud-bottom`. The top band holds the mission caption, the X-Gauge and the kid; the Sentinels' alert, else a
  hint, takes the caption's place. The bottom band holds the player plates (compact, four fit in one row).
  Banners fill the top band, and the team ultimate's letterbox blacks out the bands. Only menus, on a halted game,
  go over the view. `main.js` sizes the view to `#stage`. The view keeps 72 to 84% of the window's height.
- **`tools/layout.mjs`** checks the rule at five window sizes and the HUD's busiest states. It must pass after any
  HUD change (a rule in `CLAUDE.md`).
- **Ready room** (`showLobby` in `hud.js`, the lobby functions in `main.js`). The first press on the cover opens
  it; players join with a press, pick heroes with left and right, leave with Back or Esc, and anyone joined
  starts. Alone, the pick leads the squad. Joining mid-mission still drops straight in. `window.__X.join()` skips
  the ready room, so the tools that use it are unchanged; `playtest.mjs` and `coop.mjs` go through it.
- **Menus.** The controls page no longer claims a held heavy (section 3) and shows the current keys. Restart and
  the new "Quit to the title page" ask first; Back or Esc on a sub-page steps back one page. The debrief has Play
  again, Change heroes and Title page.
- **First-time hints**, one line in the top band, each shown once per browser, keys named for the player's
  device and bindings: Power when a Sentinel is near, tagging when hurt alone, the team-up when two stand
  together, answering a white tell, the full X-Gauge. A setting turns them off; a button shows them again.
- **Key rebinding** in Settings, for every keyboard action including movement (`SETTINGS.keys`, `bindKey` and
  `keyLabel` in `settings.js`). Esc, P, H and Enter stay the menu keys; the arrows always move.

Left for later: Hunters hovering high can sit at the top edge of the view (the camera frames heroes, the kid and
bosses, as in V2; `S.cam` is simulation state that the ultimate uses, so a change there is a behaviour change);
drop-out happens only in the ready room; the debrief still shows team totals only.

## 4. Phases 1 to 5: checklists

Refine each into steps like phase 0's before starting it, and write its gate down as tests first.

### Phase 1: Feel (Cyclops, Wolverine, Jean)

Refined into steps on 2 October. **The gate is written down as `tests/gate/phase1.mjs`** (run it on its own:
`node tests/gate/phase1.mjs`; `run-all` skips it because most of it fails until the phase is done). Each step turns
some of its checks green; when one passes for good, its behaviour also gets a test in a `tests/<area>-test.mjs`
suite. Every step that changes behaviour re-records the golden replays in the same commit
(`node tests/golden/record.mjs "phase 1: <step>"`, which writes the label into `tests/golden/replays.json`) and
says so in the commit message; a step meant to change nothing proves it with `tools/sidebyside.mjs` instead
(section 6). The mission bot must finish after every step.

Keep the interface rules from section 3b throughout: new HUD (combo counter, style rank, meter) goes in the bands
and must pass `tools/layout.mjs`; add hints for the new grammar where they help; the controls page lists moves as
they arrive.

- [x] **1.1 Baseline.** The golden file is now `tests/golden/replays.json`, re-recorded as "V2 (the baseline phase 1
  starts from)" (only its label changed); `record.mjs` takes a label. The gate spec `tests/gate/phase1.mjs`
  (23 checks, 0 green at the start).
- [x] **1.2 Hitstop in the simulation.** Done as planned: `p.hitstop`, `e.hitstop`, `hitstopOf(m)` in `moveEngine.js`,
  `slowMotion()` in `main.js`. Tests in `tests/feel-test.mjs`. The plan was: `HITSTOP = { light: 3, heavy: 8, super: 14 }` in `config.js`; a move's
  `hitstop` field (a class or ticks; default light, or heavy for `heavy` moves). A melee hit freezes the attacker
  and the target together (`p.hitstop`, `e.hitstop`); shots freeze only the target. A frozen player still banks
  presses (the buffers do not age while frozen), so a press during hitstop comes out after it. Retire `hitPause`
  in `main.js`: the impact panels stay, and the world slows instead of stopping (a **client** time scale, fewer
  ticks per real second; the simulation stays the same). A super will add 0.3 s at half speed the same way.
- [x] **1.3 The charged heavy and the step.** Done as planned (`M.posed`, `M.letGo`, a `chargeReady` event when the
  hold is reached, `physics(…, keepVx)`); tested in `moves-test` and `feel-test`. The bot learned to climb (to the
  kid on a ledge or gantry, to a Sentinel above it): solo seeds stalled there, V2 included. The plan was: The first strike holds its pose at the end of its active ticks while
  Attack is still held from its press; letting go before `charge.hold` lets it recover as normal, and once the
  hold is reached the charged heavy fires on release or by itself at `hold + release`. Evade cancels out of the
  held pose. The step: ground moves keep their step speed through startup and active (`physics` leaves `vx` alone
  while the move steps), so the hero actually travels.
- [x] **1.4 Reactions.** Done; `sim/reactions.js` documents the rules it settled on (flinch pauses the brain without
  cancelling the attack; the stun bar is 3 × poise and drains after 90 quiet ticks; OTG pops the Sentinel back into
  a juggle and is spent until it gets up; bosses and lifted, held or thrown Sentinels keep V2's reaction). Tested in
  `tests/reactions-test.mjs`; poses checked with `tools/plans/reactions.mjs`. Also fixed: tagging out never called
  the old hero's `cancel` (the kid stayed in Jean's grip for ever). The plan was: `game/js/sim/reactions.js` with the twelve reactions of the proposal (flinch, stagger,
  knockdown, launch, air hit, wall bounce, ground bounce, crumple, spin-out, stun, held, thrown; the last two exist
  in `enemies.js`), juggle weight with rising gravity, flip-out at the limit, OTG once, wall and ground bounce,
  crumple, spin-out, and stun from a broken poise bar. A move's `react` field picks the reaction; `hitEnemy` in
  `combat.js` hands the hit to `react()` instead of choosing stagger or launch itself. Numbers in section 5.3.
- [ ] **1.5 Combo rules and the meter.** `game/js/sim/combo.js`: damage scaling (`comboScale(n, repeats)`), faster
  scaling for repeated move ids, a per-player combo (`p.combo` is V2's chain index, so the combo is `p.streak`),
  a style rank D to X, and the personal three-bar meter (`METER` in `config.js`, `p.meter`). HUD: the combo
  counter, rank and meter go in the player's plate in the bottom band.
- [ ] **1.6 Input grammar and the slot ids.** Grow `selectMove` and the tables' `input`: Attack and Power and
  Signature as buttons, directions read relative to facing (fwd, back, up, down), contexts ground, air, dash
  (running at 80% or more of run speed), hold, stunned. Cancels become tick windows `{ into, on, from, to }`
  (section 5.1). Rename the move ids to the slot ids of section 5.2 in the tables, the clips, `moves-test`, and
  every client file that names a move (grep `'heavy'`, `'air'`, `'up'`; `audio.js` and `overlay.js` key Wolverine's
  snikt off `g1`). `schema.js` exports `SLOTS`.
  - **Attack + Power, decided:** the first press starts its move as usual, and the second press inside the 3-tick
    window cancels it into the throw (beside a Sentinel) or the execution (on a stunned one). Nothing waits for a
    possible pair, so single presses keep their startup.
  - Signature + forward is the super; Signature + up is the ultimate.
- [ ] **1.7 Moves.** Fill the 29 slots for the three heroes from section 5.4, with a suite that walks every move of
  every table (it carries the marker `EVERY_MOVE_TESTED`, which the gate looks for): each move starts from its
  input, puts out its hitbox on its active ticks, and causes its reaction on a trooper.
- [ ] **1.8 Animation.** Grow the skeleton to 19 joints (neck, chest, both wrists, both ankles) and add spring chains
  for hair. Clips get 6 to 10 keys with helpers for anticipation, smear, overshoot and settle. The pose is driven by
  the move's tick.
- [ ] **1.9 Effects** under `game/js/vfx/`: instanced GPU particles; ribbon trails from bones; smear stretch; speed
  and focus lines (overlay); a screen-space distortion ring (post); **a fixed pool of 8 lights** (see the lessons);
  floor decals and Sentinel debris; super cut-ins; Clarity and Reduce flashing settings.
- [ ] **1.10 The Danger Room** (a mode, not a mission): the move list with live demos; frame data and hitbox
  readouts; sparring Sentinels with settings; 5 combo trials per hero in `game/js/sim/trials.js`, each also a test
  (`tests/trials-test.mjs`: scripted inputs, then the expected route and hit count).
- [ ] **1.11 A contact-sheet tool**, `tools/contact.mjs`. It screenshots every move on its first active tick, one
  page per hero. Reuse one page for many shots: a fresh page per shot costs 20 s or more in software GL.
- [ ] **1.12 Gate.** `tests/gate/phase1.mjs` all green, every move has a test, the 15 trials pass, contact sheets
  are reviewed, the golden replays re-recorded at the end, and the build is published. Then ask the user to play it
  and approve the feel.

### Phase 2: Depth

- [ ] **`game/js/world3d/path.js`.** The play line becomes a spline in 3D, parameterised by arc length, so the
  simulation's x is the distance along it.
  - `toWorld(x, y, z)` = point(x) + up·y + normal(x)·z, where z is the depth offset of a layer, and facing
    follows the tangent.
  - Keep corner radii at 6 m or more.
- [ ] **Route every world position in the client through `toWorld`.** That means rigs, effects, decals, the
  camera, and the overlay's world-to-screen projections for lettering, name tags and the off-screen arrows.
  Grep for places that build `(x, y, 0)` positions.
- [ ] **Geometry along the path.** `level3d.js` extrudes floors and walls along the path, splitting them into
  segments on curves.
- [ ] **Layers.** Write `game/js/world3d/layers.js`: foreground, near set, deep set and backdrop pieces, placed by
  (x, z, y) per section, with set pieces that react to simulation events.
- [ ] **Depth knockbacks.**
  - A reaction sends a Sentinel out of the plane, back or front. It counts as a kill, like V2's ring-outs.
  - It emits `depthKO {id, x, y, dir}`.
  - The client flies the body into the near set, where it crashes into a prop, or at the lens, with a
    panel-crack overlay.
- [ ] **Light and post.**
  - one shadowed directional key light that follows the action;
  - exponential fog tinted per section;
  - light-shaft cones;
  - depth of field at High;
  - ink width and halftone density by linear depth;
  - colour cooling with distance.
- [ ] **Camera.** A perspective lens that dollies with the action, a low angle for bosses, leads in the
  direction of travel, and an orbit on supers. It is client-side and driven by events.
- [ ] **Quality tiers.** Low, Medium and High, picked automatically from the first seconds of frame times, with a
  manual override and a frame-time readout.
- [ ] **Rebuild Extraction on the path.** The cell block turns a corner, and the X-Jet stands in the deep set.
- [ ] **Gate.** The bot finishes, screenshots of every room show all five layers, and the build is published. The
  user checks the frame rate on their laptop.

### Phase 3: Roster wave 1 (Storm, Colossus, Nightcrawler)

Per hero:

- [ ] a `HEROES` entry, a module for what is unique to them, a 29-slot table, clips, and the effect cues;
- [ ] a rig. Storm already has a builder in `game/js/rigs.js` and colours in `looks.js`; Colossus and
  Nightcrawler are new;
- [ ] a power type and its counter-tech, and a team-up role (section 5.5);
- [ ] bot hints: preferred ranges and when to use the power. **Generalise `tests/lib/bot.mjs`** to read these
  from data instead of `if (hero === …)`;
- [ ] 5 trials.

For the wave:

- [ ] Hand-made team-ups: Fastball Special (Colossus + Wolverine), Lightning Rod, Debris Storm and Bamf Strike.
  The template system (Throw, Charge, Set-up, Crossfire) starts here.
- [ ] Bulwarks, Lancers and swarm drones, and the director's roles (flankers, holding range, scattering from
  team-up paths).
- [ ] Hero select: co-op players pick different heroes, and solo players pick a squad of three.
- [ ] **Gate.** 29 move tests and 5 trials per new hero; bots finish with random squads; the build is published.

### Phase 4: Roster wave 2 (Psylocke, Gambit, Rogue)

- [ ] The same per-hero list. Psylocke has a rig builder in `rigs.js`.
- [ ] **Rogue's borrow.** A touch copies the last touched ally's power type and Signature for a few seconds, and
  her attacks log under the borrowed type.
- [ ] Team-ups: Mind Link, Charged Steel and Ricochet, plus templates so that **all 36 pairs** resolve.
- [ ] Wardens and siege walkers. Siege walkers live in the background: a background entity with an x position,
  its shells telegraphed by a ring.
- [ ] Mission 2, the Foundry Line: the spiral path, conveyors, and Sentinels waking behind the fight. Its boss is
  the Mk-III, which adapts mid-fight and rebuilds itself from parts.
- [ ] **Gate.** A test for every pair's team-up; bots finish both missions with all nine; the build is published.

### Phase 5: Content and polish

- [ ] Mission 3, Downtown: the Giant walks the skyline the whole mission, then steps in.
- [ ] The full Danger Room: 45 trials.
- [ ] Tune the quality-tier budgets.
- [ ] Balance from bot statistics: clear times per squad and each hero's share of damage.
- [ ] Update the README on `main`, publish the release build, and ask the user to sign off.

## 5. Design reference for engineering

The proposal says what. This section pins down the how, as **starting values to tune** in the Danger Room.

### 5.1 A move's fields (a draft for `moves/schema.js`)

Phase 0's `moves/schema.js` already has these: `input` (Attack only; `ctx` ground, air or counter; `dir` neutral,
up or any), `su`, `ac`, `rc`, `dmg`, `poise`, `kb`, `boxes` (one box), `step`, `cancel` (into `evade` or `attack`,
in recovery), `launch`, `heavy`, `lift`, `charge` and `counter` (the counter bonus). The rest of this table is
phase 1's.

| Field | Meaning |
|---|---|
| `id`, `slot` | the move's id, and which grammar slot it fills |
| `input` | `{ btn: 'attack' or 'power' or 'sig' or 'pair', dir: 'neutral', 'fwd', 'back', 'up' or 'down', ctx: 'ground', 'air', 'dash', 'hold' or 'stunned' }` |
| `su`, `ac`, `rc` | startup, active and recovery ticks |
| `boxes` | per active tick, or one for all: `[x0, width, y0, height]` relative to the feet, mirrored by facing |
| `dmg`, `poise`, `kb` | damage, poise damage, knockback `[x, y]` in m/s |
| `react` | the reaction it causes (section 5.3) and its parameters, such as the bounce speed |
| `juggle` | juggle weight added on hit (launcher 20, others 10) |
| `hitstop` | `light`, `heavy` or `super`, or ticks |
| `cancel` | `[{ into: [ids or slot groups], on: 'hit', 'block' or 'any', from, to }]`, windows in ticks |
| `step`, `lift` | the hero's own motion during the move (V2: step 1.5 or 3, the launcher's lift of 7) |
| `charge` | hold ticks to charge, and from which move |
| `armour`, `invuln` | windows in which the hero ignores flinch, or cannot be hit |
| `power` | the power type logged for Sentinel adaptation |
| `cost` | meter bars (super 1, ultimate 2) |
| `cue`, `clip` | the effect cue id and the animation clip id |

### 5.2 Slot ids (from phase 1)

`g1` `g2` `g3` `g4` `g4alt` · `fwd` `up` `down` · `heavy` `dash` · `air1` `air2` `airDown` · `throwF` `throwB`
`throwU` `throwAir` · `pTap` `pHold` `pFwd` `pUp` `pAir` · `evade` `counter` `counterP` · `sig` `super` `ult` ·
`exec`. That is 29. A hero's own extras get their own ids, such as Wolverine's `g5`.

### 5.3 Starting numbers

- **Hitstop:** light 3 ticks, heavy 8, super 14. Slow motion after a super: 0.3 s at half speed (client time
  scale).
- **Juggle:** a weight of 10 per air hit and 20 for a launcher. Gravity is multiplied by (1 + weight / 100). At a
  weight of 100 the Sentinel flips out, invulnerable for 20 ticks. OTG: one hit on a knocked-down Sentinel.
- **Scaling:** hits 1 to 3 deal 100%, then 10% less per hit, down to a floor of 40%. A repeated move id in the
  same combo costs another 10%.
- **Stun:** a broken poise bar stuns for 120 ticks, and executions are only possible during a stun.
- **Meter:** 300 maximum, which is three bars. It gains 1 per point of damage dealt and 0.5 per point taken. A
  super costs 100 and an ultimate 200.
- **Throws:** reach 1.2 m in front, startup 5 ticks. They work from the front only on unarmoured Sentinels; a
  Bulwark's shield refuses them.
- **Wall bounce:** keep 60% of the speed. **Ground bounce:** vy 9.
- **Crumple:** a 40-tick fold, then a knockdown.

### 5.4 Proposed moves for the V2 heroes (phase 1)

"V2" marks a move that exists today. Adjust freely in the Danger Room.

| Slot | Cyclops | Wolverine | Jean Grey |
|---|---|---|---|
| `g1`–`g3` | backhand, elbow, driving punch (V2) | slash, slash, slash (V2) | palm, palm, push (V2) |
| `g4` | roundhouse kick | spinning slash (V2); `g5` double-claw thrust | psychic burst |
| `g4alt` | optic palm: a point-blank blast that wall-bounces | gut slash that crumples | TK slam: lift, then a ground bounce |
| `fwd` | sliding kick (wall-bounce) | lunging thrust (wall-bounce) | TK shove (wall-bounce) |
| `up` | rising kick ending in an upward optic flash (V2 base) | rising claw (V2) | lift (V2) |
| `down` | leg sweep | low claw sweep | TK sweep that trips |
| `heavy` | spinning heel kick (armour break) | two-claw overhead (V2) | push wave (V2, armour break) |
| `dash` | flying knee | shoulder barge | psychic dash strike |
| `air1`, `air2` | axe kick (V2), air roundhouse | claw swipes (V2 and a second) | air palm (V2), air push |
| `airDown` | diving optic stomp (ground bounce) | claw dive (ground bounce) | downward TK slam |
| `throwF` | judo throw into the wall | pounce and slash | hurl into the wall |
| `throwB` | shoulder toss | toss | overhead toss |
| `throwU` | toss, then an upward blast | uppercut launch | lift high |
| `throwAir` | blast-driven slam | piledriver | air slam |
| `pTap` | quick optic beam | short claw lunge | TK grab (V2) |
| `pHold` | aperture blast that banks 1 to 3 times (V2) | Drill Claw, three tiers (V2) | grip, steer and throw (V2) |
| `pFwd` | optic burst: a short cone that knocks back | Tornado Claw: a spinning drill | debris volley |
| `pUp` | anti-air blast that launches | rising Drill Claw that launches | uplift: launches a group |
| `pAir` | downward blast that vaults him and hits (V2 vault) | diving Drill Claw | grab from above while levitating |
| `evade` | backflip (V2) | roll (V2) | telekinetic blink (V2) |
| `counter` | optic counter-kick (crumple) | riposte slash | psychic repel (crumple) |
| `counterP` | point-blank blast (crumple) | counter Drill that pierces | TK reflect: returns the shot or the attacker |
| `sig` | Tactical Call (V2) | Berserk (V2) | TK Shield (V2) |
| `super` | Optic Overdrive: a full-power beam swept across the room | Berserker Barrage: a flurry that carries a Sentinel across the room | Psychic Crush: presses a group into a ball and throws it |
| `ult` | Ricochet Barrage: one blast banked off every wall onto every Sentinel | Weapon X: a rush through every Sentinel in reach, then a slow-motion finisher | Phoenix Rising: a firestorm that spends Phoenix power |
| `exec` | point-blank blast through the core | climbs it and tears out the core | pulls it apart |

### 5.5 Team-up roles and power types

| Hero | Template role | Power type | Counter-tech (name) |
|---|---|---|---|
| Cyclops | charger | optic | prism plating (V2) |
| Wolverine | payload (others throw, charge or set up for him) | claws | adamantium weave (V2) |
| Jean Grey | thrower, setter | tk | magnetic anchors (V2) |
| Storm | charger, setter (updraft) | weather | grounding rods |
| Colossus | thrower | steel | impact dampers |
| Nightcrawler | setter (teleport delivery) | teleport | phase anchors |
| Psylocke | none: Crossfire, plus her own Mind Link | psychic | psi-dampers |
| Gambit | charger | kinetic | charge sinks |
| Rogue | thrower | the borrowed type | whatever counters the borrowed type |

A pair resolves to the first that applies:

1. its hand-made team-up;
2. **Throw** if either is a thrower (with two throwers, whoever pressed Team throws the other);
3. **Charge** if either is a charger;
4. **Set-up** if either is a setter;
5. otherwise **Crossfire**.

V2's adaptation rule stays: one counter at a time, and team hits are never countered.

## 6. Environment and tools

- **The container** has Node 22 (`/opt/node22`), python3, a global Playwright and Chromium in `/opt/pw-browsers`.
  Never run `playwright install`.
- **Browser tools need `NODE_USE_ENV_PROXY=1`.** Chromium cannot reach the CDNs through the agent proxy, so Node
  fetches them into `tools/.netcache/`. Without the flag the page never loads three.js, and the tool times out.
  The details are in `tools/README.md`.
- **Software GL** draws 10 to 25 fps and a screenshot can take a minute. Never judge performance there. Ask the
  user to check on real hardware (the phase 2 gate).
- **Look at your work.** Screenshots land in `tools/out/`; open them with the Read tool. Use a plan
  (`tools/plans/*.mjs`, helpers in `tools/plans/helpers.mjs`) for repeatable scenes.
- **Run the game by hand:** `npm run serve`, then http://127.0.0.1:8770. The page's hooks are `window.__X`.
- **Golden replays:** `node tests/golden/record.mjs` re-records `tests/golden/replays.json` (give it a label: what behaviour it records) and prints the cases'
  coverage; `tests/golden-test.mjs` replays them in about 4 s. Only re-record when behaviour changes on purpose.
- **Side by side with another commit:** `git worktree add --detach ../ref <commit>`, then
  `node tools/sidebyside.mjs ../ref all` (`--state` compares the whole state, `--charge` forces charged heavies).
  To shoot that tree's game with this tree's plan: copy `tools/.netcache/` across to skip the downloads, then
  `cd ../ref && PORT=8771 NODE_USE_ENV_PROXY=1 node tools/shots.mjs <this repo>/tools/plans/moves.mjs`.
- **Headless client checks:** client modules that do not import three.js load in Node (`anim.js`,
  `anim/clips/`, `vfx/cues.js`, `looks.js`). `fx.js` loads with three.js stubbed, as `sidebyside.mjs` does.

## 7. Publishing a build

1. Run `node tools/publish-prep.mjs <your scratchpad>/publish-expansion`. The folder must be under the session's
   working directory or scratchpad, or the Artifact tool refuses it. The script strips the document skeleton
   from `index.html` (the host adds its own), copies `js/`, and prints the publish arguments.
2. Publish with the Artifact tool, following its own instructions (it asks you to load its design skill first):
   - `file_path` is `<folder>/index.html`, `root` is `<folder>`, and `files` is the printed map;
   - icon `game`;
   - a title of two to four words, such as "Team Edition phase 1".
3. Republishing the same `file_path` updates the same link. The plan gives each phase its own link, so use a
   new folder per phase.
4. Record the link in this file's log and in the README on `main`.

## 8. Lessons from V1 and V2

### Simulation

- **`emit` spreads data first.** A data field named `type` or `tick` is silently overwritten. An enemy's `type`
  once hid the event's; the field is `unit` now.
- **`ent(S, id)` resolves an id only in the lists it searches.** Jean's caught enemy shots froze until it
  searched projectiles. Add any new entity list to it.
- **States driven by other modules** (`held`, `thrown`, `teamup`, `ult`, `tagout`) return early in
  `updatePlayer`. A new state driven from outside must be added there, or the normal state machine fights it.
  `teamup` was missing once.
- **Every move needs a clean exit.** An ultimate interrupting the Fastball Special left Wolverine held until
  `endFastball` existed. Test interruptions: hit, tag, down, ultimate, section reset.
- **A hold must start when the button is already down** as the hero becomes free. A Power held through an
  attack was ignored until this was fixed.
- **The mission bot found five softlocks:**
  1. holes under open gates (fixed with sills, and the kid is rescued from below the kill line);
  2. the cell blocking the kid, and creating a hiding pocket;
  3. Hunters crossing gates (hover capped and kept in their room);
  4. Sentinels thrown out of their room (ring-outs now count as kills);
  5. walkers stuck on walkways.

  Any geometry change must keep the bot green.
- **Co-op scaling.**
  - Sentinels other than bosses get +15% hp per extra player, and bosses +35%.
  - With three or four players, every wave gains an extra trooper per hero beyond two.
  - Without this, co-op was over too fast.
- **`hashState` hashes the serialised state**, key order included. Use the behavioural fingerprint for
  refactors (phase 0).
- **Wolverine's berserk makes move time fractional** (`t += 1 / attackSpeed`). Keep that arithmetic exact when
  porting.
- **V2's charged heavy never fires, and its step forward is mostly cancelled** in the same tick by `physics`.
  Phase 0 kept both exactly; section 3 has the details for phase 1.
- **Name collisions:** a module-level `M` was once shadowed inside the Hunter code. Use descriptive names in long
  functions.

### Client and three.js

- **Bake merged geometry correctly.** Call `group.updateMatrixWorld(true)` before baking a group into one
  geometry, or every part lands at the origin.
- **Keep a fixed light pool.** Changing the number of lights in a three.js scene recompiles every material's
  shader, which stalls frames. Keep all 8 pool lights in the scene and set an idle light's intensity to 0.
- **Lettered sound effects are capped** at 4 a second and 8 on screen. Keep caps like that as effects grow, or
  co-op becomes noise.
- **The cover page joins on `pointerdown` anywhere** (a window listener). A click on the canvas alone was missed.
- **`main.js` freezes the whole simulation** for an impact panel (`hitPause`). Phase 1 replaces this with
  per-entity hitstop.

### Tests and tools

- **Cheat calls between steps lose their events.** Events from direct calls made between steps (such as
  `hitEnemy` from a test) are cleared at the next step's start, so tallies miss them. That is why the
  playtest's race reports `kills: 0`.
- **The playtest's assist step** fires only when a Sentinel is in range. It reported 0 assists in the run that
  verified the tools. That is not a bug.
- **In an `inject` hook, count steps with a local counter.** The tick passed in is the world's absolute tick,
  not the step within your script.
- **The golden replays catch arithmetic, not only outcomes.** A 1e-7 change to a multiplier fails them, and so
  does writing `p.y + (y0 + h)` for `p.y + y0 + h` (one ulp in a hitbox). Adding a field to the state does not.
  In a refactor that should change nothing, keep every float expression in its old order.
- **A plan's page script shares one scope with `helpers.mjs`.** `X`, `S`, `C`, `BT`, `bits`, `E`, `MS`, `place`,
  `spawn`, `run`, `settle` and `wait` are taken. Declaring one again fails every shot with "Identifier has
  already been declared".
- **A press that is not consumed lingers.** `pollJoins` reads a keyboard "join" flag set by any keydown. While
  the game was paused nothing read it, so the Esc that opened the menu joined someone once the cover came back.
  `input.clearJoins()` now runs on the way to the title. A device that leaves the ready room is blocked from
  joining until its buttons are let go (`blockJoin`).
- **The playtest's held Power raced its combo.** Power only fires once the hero is free, and at 11 frames a second
  a 900 ms hold sometimes ended first (strain read 0.0). It holds for 1.6 s now.
- **Buttons are levels, not presses.** A button down on two ticks in a row is one press, so a tap is
  `run(press, 1); run({}, 1)`.

### Repo

- **One worktree per branch** (`git worktree add`).
- **Fetching into the checked-out branch needs `--update-head-ok`.**
- **The clone is shallow, with one fetch refspec.** To look at another branch, fetch it by name and use
  `FETCH_HEAD`: `git fetch --depth 1 origin v2-first-proposal`.
- **Push often.** The container is reclaimed when idle.

## 9. Conventions

- Match V2's style:
  - each module opens with a comment saying what it is for and what rules it keeps;
  - comments explain why;
  - units are metres and seconds, and frame data is in ticks;
  - ids are lowercase.
- Tuning numbers live in tables (`config.js`, `moves/`), not as constants scattered through code.
- **Test suites** are `tests/<area>-test.mjs`. They print `PASS …` and `FAIL …` lines, and `run-all.mjs` picks
  them up. Keep each one under about 30 s.
- **Commits** are titled "Expansion phase N: what changed" and end with the attribution lines the session
  gives. Beyond those lines, keep model names out of commits, code and docs.
- **Update this file** at the end of every session: the status box, the phase table's State column, the
  checklists and the log.

## 10. Branches

| Branch | What | Rule |
|---|---|---|
| `main` | README with links to every version | update the links when a build is published |
| `v1-original` | V1: Nova Striker V9 converted to five X-Men | frozen |
| `v2-first-proposal` | V2: the Team Edition slice, at `7ba3a51` | frozen |
| `v2-expansion` | this work | the working branch |
| `v3-sentinel-war` | V3: not started, **paused by the user** | do not start it unless asked; it may later branch from `v2-expansion` to inherit the engine |

## 11. Open questions

- Answered: the user approved the plan in chat on 2 October, with no changes and no comments on the doc.
- Answered: the pairing rule for Attack + Power is the recommended one (section 4, step 1.6).
- A link per phase, or one link updated? The proposal says one per phase.
- Should V3 later branch from `v2-expansion`? That is the user's call.

## 12. Log

| Date | What happened |
|---|---|
| 2026-10-02 | **Menus and HUD pass** (section 3b), asked for by the user before phase 1: HUD bands so nothing covers play, `tools/layout.mjs`, the ready room, honest controls text, confirmations, debrief routes, first-time hints, key rebinding. Tests (107), layout check, playtest and co-op clean. Published: https://claude.ai/artifact/UhSDGngLMLnCuq1W4CNjSj (also in the README on `main`). Next: phase 1. |
| 2026-10-02 | **Phase 0 done; gate passed.** The user gave the go-ahead in chat (no comments on the doc). Golden replays recorded from V2 (seven cases), then the move table format, V2's three movesets, the move engine, the strike clips and the effect cues, each committed green. New: `tests/moves-test.mjs`, `tools/sidebyside.mjs`, `tools/plans/moves.mjs`. Gate: the golden replays and V2's state hashes match, 107 checks pass, the bot finishes, side-by-side runs against V2 are identical (whole state, poses, effect calls), screenshots match V2 by eye, the playtest and co-op runs are clean. Found for phase 1: V2's charged heavy never fires, and the step forward is mostly cancelled by `physics`. Next: phase 1. |
| 2026-10-02 | Proposal written (doc linked above) and copied to `docs/`. A `v2.0` tag could not be pushed (this session's git proxy dropped tag pushes, while branch pushes worked), so the frozen `v2-first-proposal` marks V2 instead. `v2-expansion` created with `CLAUDE.md`, this handoff and `tools/`. The tools were verified from the repo: the six example screenshots, the playtest (menus, race, debrief, clean console) and the co-op check (pad join, team-up, pad pause, rumble). 78 checks pass. Next: phase 0. |

## A prompt to start the next chat

> Continue the X-Men Team Edition expansion. The repo is moderngentlemen-sudo/xmen-game (private), branch
> `v2-expansion`; if it isn't in this session, add it with push access and clone it. Read `CLAUDE.md` and
> `HANDOFF-EXPANSION.md` on that branch, and check the proposal doc
> (https://claude.ai/code/artifact/d44cd592-96ae-468d-aadf-b8784ff3bdba) for my comments. Then start phase 1.
> Commit and push as you go, and update the handoff before you stop.
