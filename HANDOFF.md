# X-Men: Sentinel Strike — handoff (paused 2026-10-01, mid visual pass)

Unofficial fan prototype built on the latest Nova Striker build: Version 9 from `moderngentlemen-sudo/nova-striker-claude`,
branch `claude/nova-striker-fresh-start-lqu8sn`, commit `eeeece5` (`fresh-start-prototype/`). It is byte-identical to
the published "Nova Striker Prototype" artifact (https://claude.ai/artifact/2JBmE2k83AroPhhqYN1iwJ).

Working copy: this folder (`<scratchpad>/xmen`, a local git repo, nothing pushed anywhere). `game/` is the site,
`tests/` the headless suites. It lives only in this session's container.

## Done

**Hero layer (simulation), committed (`61e6900`).**
- `config.js` CHARS: every hero runs on one of the two V9 body frames (`arch: 'nova' | 'echo'`) plus its own `kit`.
  Nova and Echo stay as hidden reference frames so the 189 V9 regression checks still exercise the original kits.
- Cyclops (nova frame): Piercing/Ricochet/Spread Blast (lance/prism/volley), Optic Spray and Optic Mine
  (scatter/grenade). Shots leave from the visor (`muzzle()` in player.js). Signature **Visor Overdrive** (instant
  Overcharge plus a concussive flare). No hover, no skates. Ultimate Optic Overload (beam engine).
- Storm (nova frame): Lightning Bolt/Thunderhead/Hailstones, Chain Lightning/Cyclone/Hailstorm, real flight
  (BOOST.storm, fuel 170), **Squall** Signature, new ultimate engine **Eye of the Storm** (`ultStorm` in world.js:
  bolts from the sky on every enemy in view, then a thunderclap).
- Jean Grey (nova frame): Mind Darts/TK Debris/Psi Spear, TK Throw/TK Grip/Psychic Push, the Aegis as her **TK
  Shield**, levitation (BOOST.jean). Ultimate Phoenix Force (beam engine).
- Wolverine (echo frame): Hunter melee chain; fire is **Drill Claw** (`fireDrill`: tiers 1-3 by hold, aimed
  8-way, one per airtime); Signature **Berserker Rage** (faster moves via `moveFor`, x1.3 damage, 30% lifesteal,
  no stagger, x0.8 damage taken); **healing factor** (HEAL: 4 hp/s after 2.5 s unhurt). No scarf, no snares.
- Psylocke (echo frame): the full Hunter kit (psychic snares, focus shot, sash modes).
- Signature cooldowns are kept per hero across swaps (`sigStash`). The ultimate names, 15 pair team-up names and
  "To Me, My X-Men" for three or more are in ULT. Original barks are written for all five.

**Villains and zones (text), committed.** Danger Room / Sentinel Works / Trask Tower / Rooftop Relay. The Lockwarden
became Juggernaut and the Stormcaller became Magneto. Banners and enemy display names are done; tests are updated.

**Tests.** 210 checks green: the 189 from V9 plus 21 in `tests/xmen-test.mjs`. Run `node tests/run-all.mjs`.

**Visual pass, in progress (committed as WIP with this note).**
- `rigs_xmen.js`: the five hero rigs on the shared skeleton (Cyclops visor = energy material so it blazes with
  charge; Wolverine's three-claw blades; Storm's mane and tiara; Jean's hair, emblem and sash; Psylocke's
  psi-blades and psi-glaive). `rigs.js` routes non-Nova/Echo ids there. Rigs build (Cyclops: 39 meshes, sane
  positions) but have **not been visually reviewed yet**.
- `anim.js`: frame checks by `arch`, glide poses only for gliding heroes, Cyclops's hand-to-visor firing and beam
  poses, Drill Claw corkscrew, Wolverine's claws in and out, Storm's ultimate pose, Berserker keyframes.
- Per-hero colour palette `FXPAL`/`fxPal()` in config.js, threaded through fx.js, chargefx.js, subfx.js (Storm's
  cyclone, Jean's TK grip), ultfx.js (Cyclops/Jean beam colours, Phoenix wings, Psylocke butterflies, Wolverine
  triple claw marks, Storm sky bolts), aegisfx.js (dome takes owner colours) and beamfx.js. Per-hero projectile
  looks (`projMesh`), villain projectiles (Juggernaut rubble, Magneto steel and scrap). Cloth: Psylocke's sash
  (shows her modes), Storm's cape, Jean's sash.

## Next, in order
1. Visual check: render all five heroes side by side (set `p.mercy = 0` first or they blink), then fix
   proportions and colours.
2. `enemyRigs.js`: the Sentinel palette (purple plate, grey faceplates, magenta eyes), Danger Room grey and yellow
   for the post and turret, and Juggernaut and Magneto rigs. Keep the part names that `animateWarden` and
   `animateStorm` drive (legs/hip/knee, torso, chest, head, eye, core, pod, tubes, plates, armN/armF, hull,
   rotors, cannon, muzzle, shield, shieldMat).
3. `render.js`: environment retheme (dusk city, Danger Room grid, Sentinel-head beacon); add shake/glow entries for
   visor, squall, berserk, ultBolt and ultThunder; restyle Juggernaut's laser in `fx.syncBossLasers` as a thunderclap.
4. UI: `ui.js` title "X-Men: Sentinel Strike"; hero select on keys 1-5; HUD chips per hero (Cyclops still shows
   Echo's chips); help screen; settings cleanup (drop the kit, echoHead and echoRanged rows); an unofficial-fan
   disclaimer. `input.js` keys 1-5, `main.js` joins in HEROES order with swap cycling through them, and
   `index.html` title and aria-label.
5. Audio: hero sounds (snikt, optic hum, thunder) and an original heroic score (no copied theme melody).
6. Extend the tests and run them all. Playtest every hero and both bosses in the browser, then publish the
   multi-file artifact (index.html + js/).

## Tooling
- Static server: `cd game && python3 -m http.server 8765 --bind 127.0.0.1`.
- Screenshots: `NODE_USE_ENV_PROXY=1 node <scratchpad>/shot.mjs out.png [page-script.js]`. Chromium runs without a
  proxy; https requests (three.js CDN, Google Fonts) are fetched by Node through the agent proxy and cached in
  `<scratchpad>/netcache`. Page scripts get `window.__NS` (world, view, step, start, inject).
- A proposal for redesigning the game at the concept level was written after this pause (see the Claude Docs link
  in the conversation).
