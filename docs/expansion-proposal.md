# X-Men: Team Edition expansion proposal

A copy of the Claude Doc, made on 2 October 2026 so the plan travels with the code. The live doc is
https://claude.ai/code/artifact/d44cd592-96ae-468d-aadf-b8784ff3bdba. It has the three diagrams, drawn, and any
comments or changes made since. **If the two disagree, the doc wins.** Below, each diagram is written out as a
list.

## Summary

Grow Team Edition from a three-hero slice into a nine-hero brawler. Each hero gets about 30 moves, hits stop the
world for a beat, and every fight takes place inside a 3D set instead of in front of a painted backdrop.

| | V2 today | Proposed |
| --- | --- | --- |
| Heroes | 3 | 9, added in two waves of three |
| Moves per hero | 11 to 13 | about 30, from one shared move grammar |
| Team-ups | 4, plus one team ultimate | one for each of the 36 pairs: 10 hand-made, 26 from templates |
| Hit reactions | 4 (stagger, launch, held, thrown) | 12, adding bounces, crumples and stuns |
| Sentinel types | 4, plus one boss | 9, plus three bosses |
| Missions | 1, in four sections | 3, plus the Danger Room for training |
| Depth | one plane in front of a skyline | a five-layer 3D set around a play line that turns corners |

"Depth" is covered two ways. Depth of play is the move grammar, combos and team-ups, set out under the move
grammar and combat fidelity. Depth of space is how the world wraps around the fight, set out under Depth.

The engine stays. The 60 Hz deterministic simulation, the six buttons, team play and the adapting Sentinels all
carry over. The work runs in six phases, and each one ends in a playable build that passes its own checks.

**Decision needed:** approve building this on a new branch, `v2-expansion`, cut from V2 and tagged `v2.0`, in
the phase order under Build plan. A new chat then starts phase 0 from the handoff in the repo.

## Where V2 stands

V2 is a sound base: it is deterministic, tested and can be played to the end. It is thin in exactly the four
areas this request names.

| Area | V2 today | What holds it back |
| --- | --- | --- |
| Roster | Cyclops, Wolverine, Jean Grey | Storm and Psylocke rigs exist from V1 but were never rebuilt on the new engine |
| Moves | a 3- or 4-hit string, an air attack, a launcher and a charged heavy; one Power with tap and hold; a Signature; Evade and its counter | each move is code in its hero's module, so adding one means writing new code instead of adding a row to a table |
| Hit reactions | stagger, launch, held, thrown; the target freezes for 3 or 6 ticks | there are no bounces, crumples or juggle limits, and the whole-screen hit-pause lives in the client, outside the replayable simulation |
| Impact | trauma-based screen shake, impact panels, lettered sound effects, sprite sparks | there are no trails, smears, dynamic lights, decals or debris |
| Animation | one 13-joint skeleton with 3 to 5 pose keys per strike; two heroes reuse a strike for their heavy | there is no anticipation, overshoot or smear, so a strike reads as a change of pose rather than a blow |
| Depth | one fighting plane in front of a backdrop and a skyline, filmed side-on | nothing lives in front of or behind the fight, and the camera never turns |
| Content | one mission in four sections, against troopers, gunners, Hunters, Collectors and the Mk-II | there is no training room in which to learn a bigger move set |

The rest carries over unchanged. That includes the 60 Hz simulation with its snapshots and state hashes, the six
inputs, the team systems, Sentinel adaptation, the comic shader, and the bot that plays the mission to the end.

All 78 checks pass. A simulation tick costs about 0.04 ms, which leaves plenty of room for more heroes,
Sentinels and moves.

## Roster: 3 to 9

Six heroes join in two waves of three. Each one fills a role the team lacks and opens up new team-ups.

| Hero | Role | Power type | What they do | Signature | Arrives |
| --- | --- | --- | --- | --- | --- |
| Cyclops | Tactician | optic | banked optic blasts, visor aperture, strain | Tactical Call | V2 |
| Wolverine | Berserker | claws | claw strings, Drill Claw, rage and healing, climbing | Berserk | V2 |
| Jean Grey | Mover | telekinesis | grabs and throws Sentinels, debris, shots and allies; levitates | TK Shield | V2 |
| Storm | Controller | weather | flies; her wind gusts shove whole crowds; her lightning chains between Sentinels | Eye of the Storm: a cyclone that lifts the room | Wave 1 |
| Colossus | Tank and grappler | steel | armoured strikes that shrug off flinches; grabs, throws, ground pounds | Steel Skin: brief armour against everything | Wave 1 |
| Nightcrawler | Skirmisher | teleport | teleports behind a target and strikes; chains short teleports; carries an ally along | Bamf Barrage: a flurry of teleport strikes | Wave 1 |
| Psylocke | Assassin | psychic | a psychic blade that cuts through armour; dashes and wall runs | Psi-Focus: her next three strikes stun | Wave 2 |
| Gambit | Trickster | kinetic | cards that stick and detonate; bo staff strings; charges crates into bombs | Royal Flush: a fan of cards that detonate together | Wave 2 |
| Rogue | Brawler | borrowed | flies and lands super-strength strikes; a touch borrows an ally's power for a few seconds | Borrowed Signature: the absorbed hero's Signature | Wave 2 |

Storm and Psylocke lead among the classics because V1 already has their rigs. Colossus brings back the original
Fastball Special, Nightcrawler adds a teleport verb, and Rogue is built around team play. Iceman and Beast are
the stretch picks if a wave finishes early.

Each new hero brings a power type that the Sentinels can adapt to, with its own counter-tech. Rogue takes the type
of whatever power she last borrowed. In co-op each player picks a different hero; solo players pick a squad of
three from the nine.

### Team-ups for every pair

Nine heroes make 36 pairs. Ten pairs get a hand-made team-up, three of them carried over from V2.

| Team-up | Pair | What happens | Status |
| --- | --- | --- | --- |
| Psychic Rapport | Cyclops + Jean | her telekinesis bends his blasts around cover | from V2 |
| Optic Edge | Cyclops + Wolverine | a blast into his claws, and his strikes throw optic shockwaves | from V2 |
| Fastball Special | Jean + Wolverine | she throws him telekinetically through a line of Sentinels | from V2 |
| Fastball Special | Colossus + Wolverine | the original, thrown by hand | new |
| Lightning Rod | Storm + Colossus | she pours lightning into his steel and he discharges it as a shockwave | new |
| Debris Storm | Storm + Jean | Jean feeds wreckage into Storm's wind | new |
| Bamf Strike | Nightcrawler + Wolverine | a teleport drops Wolverine onto a target from above | new |
| Mind Link | Psylocke + Jean | one strike lands on every linked Sentinel | new |
| Charged Steel | Gambit + Colossus | Gambit charges his fist, and the next punch detonates | new |
| Ricochet | Gambit + Cyclops | Gambit's cards ride the optic blast and bank with it | new |

Four templates cover the other 26 pairs. V2's Lift and Hold becomes the third of them.

- **Throw:** a thrower (Jean, Colossus, Rogue) launches the partner through a line of Sentinels.
- **Charge:** a charger (Cyclops, Storm, Gambit) loads the partner's next strikes with their energy.
- **Set-up:** a setter (Jean's lift, Storm's updraft, Nightcrawler's teleport) holds or delivers a target for the partner.
- **Crossfire:** the fallback for any pair. Both heroes strike one Sentinel from opposite sides at once.

The team ultimate, "To Me, My X-Men", stays as the move the whole team spends a full X-Gauge on.

## A move grammar: about 30 moves per hero

Every hero follows one move grammar of 29 slots, built from the same six buttons. Learning one hero teaches you
how to read the other eight.

Each hero fills the slots in their own way. Cyclops's launcher is a rising kick that ends in an optic blast;
Colossus's is an uppercut that cracks the floor.

| Group | Input | The slots | Count |
| --- | --- | --- | --- |
| Ground string | Attack, repeated | 4 hits; pausing before the last press swaps in a second ender | 5 |
| Directional strikes | forward, up or down + Attack | a lunge that wall-bounces, a launcher, a sweep that knocks down | 3 |
| Charged and dash | hold Attack; Attack while running | a heavy that breaks armour, a dash strike | 2 |
| Air | Attack in the air; down + Attack | a 2-hit air string, a spike that bounces off the floor | 3 |
| Throws | Attack + Power beside a Sentinel | forward into a wall, back, up into a juggle, a slam from the air | 4 |
| Power | Power: tap, hold, forward, up, in the air | the hero's power in five shapes | 5 |
| Defence | Evade; Attack or Power during a perfect evade | the dodge and two counters | 3 |
| Signature | Signature; Signature + a direction | the hero's tool, a super and an ultimate | 3 |
| Execution | Attack + Power on a stunned Sentinel | a cinematic finisher | 1 |
| | | **Total** | **29** |

The Team button sits outside the 29. It gives a team-up with any of the eight partners, an assist and, in solo
play, a tag. Jump keeps its double jump and wall jump, plus each hero's own movement: Jean's levitation,
Wolverine's climbing, Storm's flight. A hero may add a move or two of their own, such as Wolverine's fifth string
hit.

### How moves connect

- **Cancels climb a ladder.** A normal cancels into a special on hit, a special into a super, and a super into a
  team-up. The launcher also cancels into a jump.
- **There are two meters.** Each hero gets a personal meter of three bars, filled by landing and taking hits. A
  super costs one bar and an ultimate costs two. The shared X-Gauge works as in V2 and pays for the team ultimate.
- **Combos follow a route.** It runs from the string to the launcher, a jump, the air string, the spike and its
  bounce, a pick-up strike, then a special or a super. The diagram below shows it.
- **Counters stay the skill check.** A perfect evade still slows the attacker, and it now offers two answers: a
  strike or a power.

*Diagram: "A combo juggles with normals, then cancels up one tier at a time".* Juggle with normals: String
(Attack 4 times; it staggers) → Launcher (up + Attack; it flies up) → Air string (jump, 2 hits; it stays up) →
Spike (down + Attack; it bounces up) → Pick-up (dash strike; caught again). Then cancel up a tier: Special
(Power + a direction) → on hit → Super (Signature + direction; costs 1 bar) → on hit → Team-up (Team, near a
partner; free, on a cooldown).

## Combat fidelity

Hits gain weight from three changes: frame data on every move, twelve hit reactions, and rules that end juggles
before they become loops.

**Every move gets frame data.** Each move becomes a row in a table: its startup, active and recovery ticks; a
hitbox for each active tick; its cancel windows; the reaction it causes; and its damage, juggle weight and
hitstop. The Danger Room shows these numbers live.

**Hitstop moves into the simulation.** The attacker and the target freeze together: 3 ticks on a light hit, 8 on
a heavy, 14 on a super. Moving it out of the client makes it part of replays, and later of netcode.

| Reaction | Caused by | What the Sentinel does |
| --- | --- | --- |
| Flinch | light hits | recoils for a moment; heavy units ignore it |
| Stagger | heavy hits | stumbles back and cannot act |
| Knockdown | sweeps, string enders | lands on its back, and can be hit once on the floor |
| Launch | launchers, up throws | flies up, open to an air combo |
| Air hit | any hit in the air | hangs in the air, pushed a little higher |
| Wall bounce | lunges, forward throws | hits a wall and comes back toward the hero |
| Ground bounce | spikes, slams | bounces off the floor back into the air |
| Crumple | counters, some heavies | folds slowly to the floor, a free hit for anyone |
| Spin-out | sweeping strikes | spins away and knocks over whatever it hits |
| Stun | a broken poise bar | sways, dazed, open to an execution |
| Held | grabs, telekinesis | is pinned and moved by a hero |
| Thrown | throws, telekinesis | becomes a projectile that hurts other Sentinels |

- **Juggles end on their own.** Each hit in the air adds juggle weight, and the Sentinel falls faster as it
  builds. Past a limit it flips out of the combo and lands on its feet.
- **Damage scales.** The first three hits of a combo deal full damage. Each later hit deals 10% less, down to a
  floor of 40%.
- **Variety pays.** A move repeated within a combo scales faster. The combo counter grades style from D up to X,
  and style fills the personal meter.
- **Armour has a job.** Big Sentinels keep their armour through attacks, so light hits do not interrupt them.
  Heavies, throws, specials and team-ups break it.

### Five new Sentinels

The roster grows from four Sentinel types and a boss to nine types and three bosses. Each new type asks for a
different answer.

| Sentinel | Job | How to beat it |
| --- | --- | --- |
| Bulwark | carries a shield that blocks everything from the front | throw it, get behind it, or break the shield with heavies |
| Lancer | dashes across the room in a straight line | evade the dash, then punish its long recovery |
| Swarm drones | small fliers that arrive in sixes | area powers such as Storm's lightning or Gambit's cards |
| Warden | repairs and shields other Sentinels from the back line | reach it first; Nightcrawler and Psylocke get there fastest |
| Siege walker | shells the fight from the background, behind a warning ring | dodge the ring, then knock a Sentinel into the background at it |

The three bosses are the Mk-II, rebuilt with phases, and one new boss for each new mission (see Content).

The director keeps its attack tokens and gains roles. Flankers take the far side of a hero, gunners hold their
range, and Wardens stay back. Collectors still go for the kid, and every Sentinel scatters from a team-up's path.

## Impact and visual fidelity

Every hit is built from the same seven layers, scaled by how hard it lands. A jab reads light, and a super reads
like a splash page.

| Layer | Light hit | Heavy hit | Super |
| --- | --- | --- | --- |
| Hitstop | 3 ticks | 8 ticks | 14 ticks, then 0.3 s of slow motion |
| Camera | still | a 3% punch-in and a short shake | a zoom onto the impact and a short orbit around it |
| Ink | none | the Sentinel's outline flashes for a frame | two inverted frames: a black-and-white impact panel |
| Particles | about 12 sparks | about 40 sparks and metal fragments | about 200 sparks, a shockwave ring and flying debris |
| Light | none | a flash in the power's colour | a strong coloured light that lights up the set |
| Lettering | a small sound effect | a large sound effect | a full-panel sound effect and the super's cut-in |
| Sound and rumble | a tick | a thud with bass | a layered boom and a long rumble |

### New effect tools

- **GPU particles:** instanced, one draw call per effect type, so a super can throw thousands of sparks at 60 fps.
- **Trails and smears:** ribbon trails follow claws, blades, staffs, cards and fists. Fast strikes stretch the
  limb into a smear for a frame, and dashes and teleports leave afterimages.
- **Speed and focus lines:** comic speed lines streak behind dashes, and focus lines frame a super.
- **Shockwaves:** a screen-space distortion ring ripples out from heavy impacts and explosions.
- **Dynamic lights:** a pool of eight, one colour per power, such as optic red, lightning white, Phoenix gold and
  kinetic pink.
- **Damage that stays:** scorch marks, floor cracks and claw marks last for the rest of the section. Sentinels
  break apart, shedding heads, arms and plates, and their wrecks stay on the floor.
- **Super cut-ins:** a comic panel slides in with the hero's portrait, rendered live from the rig, and the move's
  name lettered across it.

### Animation does most of the work

The skeleton grows from 13 joints to 19, adding a neck, chest, wrists and ankles. Spring chains add secondary
motion for hair, capes, coats and Nightcrawler's tail.

Each strike gets 6 to 10 keys that follow the animator's rules: anticipation before the blow, a smear on contact,
overshoot, then a settle. The pose is driven by the simulation's move frame, so what you see is exactly what the
hitbox does.

New rigs need silhouettes that read at fight distance. Colossus needs his bulk, Storm her cape, Gambit his coat
and staff, and Nightcrawler his tail.

### Clarity comes first

Sentinel warnings draw above every effect, and other players' effects fade to half strength. A Clarity setting
trims particles, and a Reduce flashing setting replaces the inverted impact frames with an ink flash.

## Depth: a world around the fight

The fight stays on one line, so the tested engine, the bot and the path to netcode all survive. The world around
that line becomes a 3D set: five layers, a path that turns corners, and traffic between the layers.

- **The play line bends through space.** The simulation still sees only x and y. The renderer lays that line
  along a 3D path, so corridors turn corners, ramps climb and a shaft spirals down, and the camera swings round
  with each turn. 2.5D platformers such as Klonoa use the same trick.
- **Five layers, each with a job.** The foreground has girders, cables, glass and steam drifting past the lens as
  dark silhouettes. Behind the fight plane, the near set holds machines and conveyors that react to the fight.
  Further back, the deep set holds the rest of the hall and its windows, and the backdrop holds the city and the
  sky. The diagram below maps them.
- **Traffic between layers.** Sentinels walk in from the deep set, drop from the ceiling or break through the
  back wall. A finisher can send a Sentinel crashing into the machines behind the fight, or flying at the lens,
  where it cracks the panel border. Siege walkers fire from the background, and the last boss reaches into the
  fight from the skyline.
- **Light and air.** A key light casts real shadows, and light shafts fall through the windows. Fog thickens and
  cools with distance, and depth of field softens the backdrop and the nearest foreground. Contact shadows keep
  everyone anchored to the floor.
- **Depth drawn the comic way.** Ink lines run thicker in front and thinner behind, and halftone dots grow denser
  near the camera. Colours flatten and cool with distance, the way a comic artist separates planes.
- **A camera that moves.** The camera keeps a perspective lens and dollies with the action. It drops low for
  bosses, leads in the direction of travel, and makes a short orbit around a super.

*Diagram: "The fight stays on one line while four layers of set wrap around it"* (seen from above, farthest at
the top):

| Layer | What is there | How it is drawn |
| --- | --- | --- |
| Backdrop | the city, the sky, searchlights, the giant | thinnest ink, heaviest fog, soft focus |
| Deep set | the hall, its windows, Sentinels being built | thin ink, cooler colour, fog |
| Near set | machines and conveyors that react to hits | full ink, sharp |
| Fight plane | heroes, Sentinels and the kid on one line | full ink and halftone; all the simulation sees |
| Foreground | girders, cables, glass and steam | heaviest ink, dark, soft focus |

Crossings: Sentinels walk in and shells land (deep set → fight plane); knocked into the machines (fight plane →
near set); flung at the lens (fight plane → foreground). The camera sits in front of the foreground: a
perspective lens that turns with the path.

Only the fight plane exists for the simulation; the other four layers are drawn around it and react to what
happens on it.

Free movement in depth, as in a belt-scrolling brawler, is not proposed. It would double the AI, level and test
work, and V2's platforming would not survive it. Two-lane set pieces stay open as a later option.

## Content: three missions and the Danger Room

Two new missions give the new heroes room to fight, and the Danger Room gives players a place to learn about 260
moves.

| Mission | Setting | What the depth adds | Boss |
| --- | --- | --- | --- |
| 1. Extraction at the Sentinel Works | V2's mission, rebuilt in the new set | the rooftop opens onto the city, the cell block corridor turns a corner, and the X-Jet waits in the deep set | the Mk-II, rebuilt in three phases |
| 2. The Foundry Line | the assembly line where Sentinels are built | the play line spirals down through the factory, and unfinished Sentinels wake on the conveyors behind the fight and step in | the Mk-III, which adapts mid-fight and rebuilds itself from parts on the line |
| 3. Downtown | a city street at night while people evacuate | a giant Sentinel walks the skyline for the whole mission and fires into the street | the Giant, which reaches into the fight until the team brings it down onto the street |

Each mission runs four or five sections, keeping V2's rule that a failure restarts only the current section.
Mission 1 keeps the rescue, so the kid still has to reach the X-Jet.

### The Danger Room

- **Move list:** every move plays a live demo beside its input and frame data.
- **Combo trials:** five per hero, 45 in all. Each trial doubles as an automated test.
- **Sparring:** any Sentinel type, set to stand, walk, jump or attack, with armour on or off.
- **Readouts:** hitboxes, inputs, damage and combo scaling, shown live.
- **The room itself:** a holographic grid that is cheap to render and keeps the fight easy to read.

All nine heroes are playable from the start, with no unlocks to grind. The debrief adds a style rank and each
hero's share of the damage to V2's team-up split.

## Technical plan

The expansion turns code into data. Moves, animations and effects become tables that one engine runs, so a new
hero is mostly tables plus one small module for what only that hero does, such as strain, rage or a borrowed
power.

| System | V2 today | Proposed | Lives in |
| --- | --- | --- | --- |
| Moves | hand-written in each hero's module | frame-data tables run by one move engine | `sim/moves/<hero>.js`, `sim/moveEngine.js` |
| Reactions | stagger and launch inside `combat.js` | a reaction table, juggle weight and damage scaling | `sim/reactions.js` |
| Hitstop | in the client, outside replays | in the simulation | `sim/world.js` |
| Animation | pose keys in `anim.js` | clips keyed to move frames, 19 joints, spring chains | `anim/clips/<hero>.js` |
| Effects | sprites in `fx.js` | GPU particles, trails, decals, lights and distortion, driven by a cue table of simulation events | `vfx/` |
| World | one set builder | a path that maps the play line into 3D, a layer builder and set-piece scripts | `world3d/` |
| Post-processing | ink and halftone | adds depth-weighted ink, fog, depth of field and bloom | `post/` |
| Quality | one setting for everything | Low, Medium and High, picked from measured frame time | `settings.js` |

### Tests grow with the game

- **Tables are validated:** every cancel points at a real move, and every hitbox sits inside its move's active ticks.
- **Every move gets a test:** it starts, hits and cancels exactly as its table says.
- **The 45 combo trials run as tests.**
- **Replays stay exact:** state hashes match across replays with all nine heroes.
- **Bots finish every mission** with random squads, alone and in co-op.
- **The simulation has a budget:** four heroes and 24 Sentinels in under 0.5 ms a tick.
- **Contact sheets:** a screenshot of every move, reviewed by eye at the end of each phase.

### Targets

The game should hold 60 fps at 1080p on a mid-range laptop at Medium, with under 300 draw calls and about 8,000
live particles. It stays a static page of ES modules with three.js from a CDN, published as an artifact the way
V2 is.

## Build plan and handoff

The work runs in six phases: the engine first, then everything built on it. Each phase ends in a playable build,
published to its own link, that has passed its gate.

*Diagram: "Six phases, engine first, each ending in a build that must pass its gate"* (not to scale: a phase
ends when its gate passes, not on a date):

| Phase | What it delivers | Gate to pass before the next phase |
| --- | --- | --- |
| 0: Foundations (the new chat starts here) | One move engine; V2's three heroes moved onto tables. Animation clips and effect cues, still in V2's look | Same inputs give V2's state hashes. All 78 checks and the bot pass |
| 1: Feel | About 30 moves each for Cyclops, Wolverine and Jean. In-sim hitstop, 12 reactions, new effects, the Danger Room | Every move tested; 15 combo trials pass. You play it and approve the feel |
| 2: Depth | The play line on a 3D path; five layers; light and fog. Extraction rebuilt in the new set, with depth knockbacks | The bot finishes Extraction in the set. 60 fps at Medium on your laptop |
| 3: Roster wave 1 | Storm, Colossus and Nightcrawler, with their team-ups. Bulwarks, Lancers and swarm drones | 29 move tests and 5 trials per hero. Bots finish with random squads |
| 4: Roster wave 2 | Psylocke, Gambit and Rogue; team-ups for all 36 pairs. Wardens and siege walkers; mission 2, the Foundry Line | A test for every pair's team-up. Bots finish both missions with all nine |
| 5: Content and polish | Mission 3, Downtown, and the Giant; the full Danger Room. Quality tiers, balance from bot stats, the release | 45 trials pass; bots finish 3 missions. You sign off the release |

Three gates need you: you play phase 1 to approve the feel, check the frame rate on your own laptop in phase 2,
and sign off the release in phase 5.

Phase 0 changes nothing a player can see. It moves V2's three heroes onto move tables and must keep all 78
checks and the bot passing. That proves the new engine before anything else is built on it.

Feel comes before roster, because the impact pass on three heroes sets the bar the six new heroes are built to.
Depth comes before the new missions, because the missions are built in it.

### What the new chat starts from

Development starts in a new chat. The new branch, `v2-expansion`, carries everything that chat needs:

- **`CLAUDE.md`:** the rules the code depends on, such as the simulation never touching the page, the clock or
  `Math.random`.
- **`HANDOFF-EXPANSION.md`:** this plan in working form, with phase checklists, conventions and the lessons from
  V1 and V2.
- **`tools/`:** the screenshot, playtest and two-player harnesses used to check V2 in a browser.

The chat starts at phase 0 and updates the handoff at the end of every phase, so any later chat can pick up
where the last one stopped.

## Risks

The biggest risk is animation. About 260 moves animated in code, with no artist, could look stiff however good the
systems around them are.

| Risk | What it would cost | How the plan handles it |
| --- | --- | --- |
| Animation quality | stiff moves undercut all the impact work | a shared pose library and the animator's rules built into the clip system; contact sheets reviewed every phase; fewer moves done well rather than more done badly |
| Effects drown the fight | co-op becomes hard to read | warnings drawn above effects, per-effect budgets, the Clarity setting |
| Laptop performance | depth of field, shadows and particles cost frames | quality tiers with budgets and a frame-time readout; the container renders in software, so only your own hardware can confirm 60 fps |
| Scope | 9 heroes, about 260 moves and 36 team-ups is a lot of content | templates for moves and team-ups; every phase ships playable; wave 2 can shrink to two heroes |
| Determinism | more systems in the simulation mean more ways to break replays | replay-hash tests in every phase, and the simulation keeps its rules |
| Balance | nine heroes are hard to tune by hand | bots log clear times and damage shares per hero and per squad |
| Context between chats | each new chat starts cold | the handoff file, updated every phase, with the tests as the contract |
| Fan-project limits | the heroes belong to Marvel | the repo stays private, the unofficial-fan notices stay, and there are no Marvel logos, art or music |
