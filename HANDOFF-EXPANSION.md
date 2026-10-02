# Handoff: the Team Edition expansion (branch `v2-expansion`)

> **Status, 2 October 2026:** the proposal is written and the tools are in the repo; **phase 0 has not started.**
> The user was asked to approve the plan in a comment on the proposal doc's decision line. Read that thread
> before you start, and fold any changes into this file first.
> **Update this box, the phase checklists and the log at the end of every session.**

| | |
|---|---|
| Proposal (live, with comments) | https://claude.ai/code/artifact/d44cd592-96ae-468d-aadf-b8784ff3bdba |
| Proposal (copy in the repo) | `docs/expansion-proposal.md` |
| Where V2 started | branch `v2-first-proposal`, frozen at `7ba3a51`; its notes are in `HANDOFF.md` |
| V2 as published | https://claude.ai/artifact/MzaN97QpEmcpV11n83Aq7A |
| Rules | `CLAUDE.md` |
| Tools | `tools/README.md` |

## 1. First steps in a new chat

1. **Get the repo.** If `moderngentlemen-sudo/xmen-game` is not in the session, add it with push access
   (`add_repo`), clone it, and check out `v2-expansion`. This clone has no fetch refspec, so fetch a branch by
   name: `git fetch origin v2-expansion`.
2. **Check the baseline.** All three of these are green on a clean checkout:
   - `node tests/run-all.mjs` gives 78 passed, 0 failed.
   - `node tools/probe.mjs 2 1` finishes the mission (`"done":true`, about 2 minutes of game time).
   - `NODE_USE_ENV_PROXY=1 node tools/shots.mjs tools/plans/rooms.mjs` writes six PNGs to `tools/out/`.
     Open one with the Read tool to see the V2 look.
3. **Read the proposal and its comments.** Apply anything the user asked for to this file.
4. **Start phase 0** (section 3). Commit and push after every step that leaves the tests green.

## 2. The plan

Six phases, engine first. Each phase ends in a playable build, published to its own link, that has passed its
gate. Three gates need the user: phase 1 (they play it and approve the feel), phase 2 (they check the frame rate
on their own laptop) and phase 5 (they sign off the release).

| Phase | Delivers | Gate | State |
|---|---|---|---|
| 0. Foundations | one move engine; V2's three heroes moved onto tables; animation clips and effect cues, still in V2's look | the same inputs give the same behaviour as V2 (golden replays); all 78 checks and the bot pass | not started |
| 1. Feel | about 30 moves each for Cyclops, Wolverine and Jean; in-sim hitstop, 12 reactions, the new effects; the Danger Room | every move tested; 15 combo trials pass; the user approves the feel | |
| 2. Depth | the play line on a 3D path; five layers; light, fog, depth of field; Extraction rebuilt in the new set, with depth knockbacks | the bot finishes Extraction in the set; 60 fps at Medium on the user's laptop | |
| 3. Roster wave 1 | Storm, Colossus and Nightcrawler, with their team-ups; Bulwarks, Lancers and swarm drones | 29 move tests and 5 trials per hero; bots finish with random squads | |
| 4. Roster wave 2 | Psylocke, Gambit and Rogue; team-ups for all 36 pairs; Wardens and siege walkers; mission 2, the Foundry Line | a test for every pair's team-up; bots finish both missions with all nine | |
| 5. Content and polish | mission 3, Downtown, and the Giant; the full Danger Room; quality tiers; balance from bot stats; the release | 45 trials pass; bots finish all 3 missions; the user signs off | |

## 3. Phase 0: Foundations (no visible change)

**Goal:** move the melee of V2's three heroes onto data tables run by one move engine, with **no change in
behaviour**, and prove it. Everything after this builds on the engine, so this phase is about trust, not
features.

### How V2's melee works today (what you are porting)

- `game/js/sim/config.js` holds `MOVES[hero][id]` = `{ su, ac, rc, dmg, poise, kb, box, launch?, charge? }`
  (ticks, damage, poise, knockback `[x, y]`, hitbox `[x0, width, y0, height]` relative to the feet, facing +x)
  and `COMBO[hero]`, the chain order. The ids are `g1`–`g4`, `air`, `up` and `heavy`.
- `game/js/sim/player.js`:
  - `tryAttack` picks the move: a pending counter gives `heavy` with a bonus; in the air, `air`; up held
    (`my > 0.55`), `up`; otherwise the next chain hit while `comboT` is open.
  - `startMove` sets `p.move = { id, t, inst, counter, charged }`.
  - `attack()` runs it:
    - `M.t += 1 / attackSpeed`, so **`t` is fractional** while Wolverine is berserk.
    - Holding Attack through the first chain hit charges `heavy`.
    - A ground move steps forward at 1.5 m/s (3 for `heavy`), and the launcher lifts the hero (`vy` 7 in its
      first two active ticks).
    - On each active tick it spawns a hitbox. Damage is ×1.5 on a counter and ×1.2 when charged, and `heavy` is
      flagged heavy.
    - In recovery the move can cancel into Evade, or into the next chain hit.
- `game/js/anim.js` reads `MOVES` for timing and maps move ids to strike poses (`MOVE_KEYS`). `fx.js` reacts to
  the events (`swing`, `hit` and so on).

### Steps

- [ ] **Golden replays, before touching any code.**
  - Write `tests/golden/record.mjs`. It runs fixed cases and saves `tests/golden/v2.json`:
    - the bot over whole missions (1 player seed 2, 2 players seed 1, 4 players seed 3);
    - seeded random inputs for 1 to 4 players, 6,000 ticks each. Use its own LCG, never the world's
      generator, and hold buttons and aims for random lengths so charges and holds happen.
  - Record a **behavioural fingerprint** every 60 ticks: the exact numbers that matter, such as each player's
    x, y, vx, vy, hp, state, facing and move id and `t`; each enemy's id, x, y, hp and state; the kid; the
    gauge; the mission's section and phase; the generator state.
  - Then write `tests/golden-test.mjs`, which replays the cases and compares fingerprints. Commit it on its own,
    green.
  - **Why not `hashState`:** it hashes `JSON.stringify` of the whole state, so it changes when a refactor merely
    adds a field or creates an object's keys in a different order, even with identical behaviour. The
    fingerprint catches behaviour changes and nothing else.
- [ ] **The table format.** Write `game/js/sim/moves/schema.js`: the documented fields of a move and a
  `validateMoves()` used by the tests. Start from section 5.1, but in phase 0 encode only what V2 does.
- [ ] **The tables.** Write `game/js/sim/moves/{cyclops,wolverine,jean}.js` with V2's exact numbers.
  - The behaviour hard-coded in `attack()` becomes fields: the step-forward speed, the launcher's lift, the
    charge-from-first-hit rule, and the counter and charge multipliers.
  - **Keep V2's move ids** (`g1`, `air`, `up`, `heavy` and so on): the ids are part of the state, and renaming
    them is a phase 1 change.
- [ ] **The engine.** Write `game/js/sim/moveEngine.js` with `selectMove` (what `tryAttack` does), `startMove` and
  `runMove` (what `attack()` does), driven by the tables. **Keep the order of operations and the float
  arithmetic identical**, including the fractional `t`. `player.js` calls the engine.
  - `config.js` keeps `HEROES`. `MOVES` and `COMBO` either go or become views of the tables; the client imports
    `MOVES`.
- [ ] **The client side.**
  - Write `game/js/anim/clips/<hero>.js`: the strike keyframes now in `anim.js`, keyed by move id, with
    `anim.js` reading them.
  - Write `game/js/vfx/cues.js`: a table from simulation events to the effect calls `fx.js` makes today.
  - Nothing should look different.
- [ ] **Tests.** Write `tests/moves-test.mjs`:
  - every table passes `validateMoves`;
  - every cancel names a real move;
  - hitboxes appear only on active ticks;
  - every hero has the slots V2 had.
- [ ] **The gate.**
  - The golden test matches, all 78 checks and the new ones pass, and the bot finishes.
  - `tools/plans/rooms.mjs` screenshots look the same as on `v2-first-proposal` (compare by eye; rendering is not pixel-exact).
  - Push. No publish is needed: nothing changed for a player.

## 4. Phases 1 to 5: checklists

Refine each into steps like phase 0's before starting it, and write its gate down as tests first.

### Phase 1: Feel (Cyclops, Wolverine, Jean)

- [ ] Re-record the golden replays at the start of the phase. Behaviour now changes on purpose, so re-record
  again at the end, and say so in the commit.
- [ ] **Hitstop in the simulation.** Freeze the attacker and the target together: 3, 8 or 14 ticks (section
  5.3). Enemies already have `e.hitstop`; add it for players. Retire `hitPause` in `main.js`, which freezes the
  whole world and is wrong for co-op.
  - Do slow motion on supers as a **client** time scale (fewer ticks per real second). The simulation stays the
    same.
- [ ] **Reactions.** Write `game/js/sim/reactions.js` with the twelve reactions, juggle weight with rising
  gravity, flip-out at the limit, OTG once, wall bounce and ground bounce, crumple, spin-out, and stun from a
  broken poise bar.
- [ ] **Combo rules.** Add damage scaling, faster scaling for repeated moves, a combo counter, a style rank from D
  to X, and the personal three-bar meter.
- [ ] **Input grammar.**
  - Read directions relative to facing.
  - Attack while running at 80% or more of run speed is a dash strike.
  - Attack and Power within a 3-tick window: an execution on a stunned Sentinel, a throw beside one.
    **Decide and document** how the first press of the pair is handled. The recommendation: the first press
    starts its move, and the second press inside the window cancels it into the throw.
  - Signature + forward is the super; Signature + up is the ultimate.
- [ ] **Moves.** Fill the 29 slots for the three heroes from section 5.4. Rename the move ids to the slot ids in
  section 5.2.
- [ ] **Animation.**
  - Grow the skeleton to 19 joints (neck, chest, both wrists, both ankles) and add spring chains for hair.
  - Clips get 6 to 10 keys with helpers for anticipation, smear, overshoot and settle.
  - The pose is driven by the move's tick.
- [ ] **Effects.** Under `game/js/vfx/`:
  - instanced GPU particles;
  - ribbon trails from bones;
  - smear stretch;
  - speed and focus lines (overlay);
  - a screen-space distortion ring (post);
  - **a fixed pool of 8 lights** (see the lessons);
  - floor decals and Sentinel debris;
  - super cut-ins.
  - Clarity and Reduce flashing settings.
- [ ] **The Danger Room** (a mode, not a mission):
  - the move list with live demos;
  - frame data and hitbox readouts;
  - sparring Sentinels with settings;
  - 5 combo trials per hero.
  - Each trial is also a test (`tests/trials-test.mjs`: scripted inputs, then the expected route and hit count).
- [ ] **A contact-sheet tool.** It screenshots every move on its first active tick, one page per hero. Reuse one
  page for many shots: a fresh page per shot costs 20 s or more in software GL.
- [ ] **Gate.** Every move has a test, the 15 trials pass, contact sheets are reviewed, and the build is
  published. Then ask the user to play it and approve the feel.

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

### Repo

- **One worktree per branch** (`git worktree add`).
- **Fetching into the checked-out branch needs `--update-head-ok`.**
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

- Has the user approved the plan, and with what changes? See the comment thread on the doc's decision line.
- The pairing rule for Attack + Power (phase 1). The recommendation is in section 4.
- A link per phase, or one link updated? The proposal says one per phase.
- Should V3 later branch from `v2-expansion`? That is the user's call.

## 12. Log

| Date | What happened |
|---|---|
| 2026-10-02 | Proposal written (doc linked above) and copied to `docs/`. A `v2.0` tag could not be pushed (this session's git proxy dropped tag pushes, while branch pushes worked), so the frozen `v2-first-proposal` marks V2 instead. `v2-expansion` created with `CLAUDE.md`, this handoff and `tools/`. The tools were verified from the repo: the six example screenshots, the playtest (menus, race, debrief, clean console) and the co-op check (pad join, team-up, pad pause, rumble). 78 checks pass. Next: phase 0. |

## A prompt to start the next chat

> Continue the X-Men Team Edition expansion. The repo is moderngentlemen-sudo/xmen-game (private), branch
> `v2-expansion`; if it isn't in this session, add it with push access and clone it. Read `CLAUDE.md` and
> `HANDOFF-EXPANSION.md` on that branch, and check the proposal doc
> (https://claude.ai/code/artifact/d44cd592-96ae-468d-aadf-b8784ff3bdba) for my comments. Then start phase 0.
> Commit and push as you go, and update the handoff before you stop.
