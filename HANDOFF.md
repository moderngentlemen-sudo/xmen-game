# X-Men: Sentinel Strike — handoff (2026-10-01, original conversion complete)

Unofficial fan prototype built on the latest Nova Striker build: Version 9 from `moderngentlemen-sudo/nova-striker-claude`,
branch `claude/nova-striker-fresh-start-lqu8sn`, commit `eeeece5` (`fresh-start-prototype/`), byte-identical to the
published "Nova Striker Prototype" artifact (https://claude.ai/artifact/2JBmE2k83AroPhhqYN1iwJ).

Working copy: this folder (`<scratchpad>/xmen`, a local git repo, nothing pushed anywhere). `game/` is the site,
`tests/` the headless suites. It lives only in this session's container unless it is pushed or published.

## What the game is now
- **Five X-Men** on the two V9 body frames (`arch: 'nova' | 'echo'`, `kit` flags in `config.js` CHARS). Nova and Echo
  stay as hidden reference frames so the V9 regression checks still exercise the original kits.
  - Cyclops (nova frame): optic blasts from the visor (Piercing/Ricochet/Spread), Optic Spray and Optic Mine, Visor
    Overdrive, Optic Overload. Storm: lightning and hail, Chain Lightning/Cyclone/Hailstorm, real flight, Squall, Eye
    of the Storm. Jean Grey: Mind Darts/TK Debris/Psi Spear, TK Throw/Grip/Push, TK Shield, levitation, Phoenix Force.
  - Wolverine (echo frame): claw chain, Drill Claw, Berserker Rage, healing factor. Psylocke: the Hunter kit (psi
    blades, psi-glaive, psychic snares, psi-bolt, sash modes).
  - Signature cooldowns persist per hero across swaps. Pair team-up names, "To Me, My X-Men" for three or more.
- **Villains**: Sentinel units (purple plate, grey faceplates, magenta eyes) in `enemyRigs.js`; the Danger Room's
  training post and turret in grey and hazard yellow; **Juggernaut** (boss id `warden`: maroon armour, domed helmet,
  slab overhead for the rubble volley, a thunderclap in place of the old laser) and **Magneto** (boss id
  `stormcaller`: red and purple, cape, orbiting steel, magenta force field). Magneto's volley leaves from his hand
  and his scrap rain from above his raised hands (`bosses.js`).
- **Zones**: Danger Room (dark room of cyan grid panels) → Sentinel Works (dusk city, amber trim, hazard barriers)
  → Trask Tower (dark glass, amber bands) → Rooftop Relay (skyline on both sides, Sentinel patrols) → the Sentinel
  beacon (a giant Sentinel head on a mast). Environment in `render.js` (`envTextures`, `buildSky/Backdrop/Level/Props`).
- **UI** (`ui.js`, `index.html`): title screen with the roster and an unofficial-fan disclaimer, per-hero HUD
  chips, a controls screen with a card per hero, pause menu with the zones and both bosses, settings without the
  V9 test toggles. Keys 1-5 pick a hero, Tab and the D-pad cycle; new players join as the first free hero.
- **Audio**: hero sounds in `audio.js` `heroPlay` (optic blasts, snikt and claws, lightning, wind, thunder, TK,
  psi-blades); an original heroic score in `music.js` (E minor, 132 BPM, galloping bass, brass stabs, a fanfare lead;
  no borrowed melody).

## Tests
212 checks green: the 189 from V9 plus 23 in `tests/xmen-test.mjs` (including every hero against both bosses).
Run `node tests/run-all.mjs`.

## Browser checks done
Screenshots of every hero, enemy, boss pose and zone; a real-input playtest (click to join, keys 1-5, Tab, H, Esc,
pause-menu boss fights) with no console errors; audio context runs and the score schedules notes. In SwiftShader the
frame cost is within about 5-20% of V9 after the big backdrops moved to unlit or Lambert materials.

## Known limits
- Procedural placeholder art throughout; heroes share two body frames' physics and charge timings (the concept
  proposal addresses this).
- One-way platforms (2.6 deep) hide the part of a tall enemy standing under them, as in V9.

## Next
The alternate, redesigned version follows the concept proposal (Claude Doc "X-Men: Sentinel Strike concept
proposal"). Any concept change beyond that doc is proposed to the user before it is built.

## Tooling
- Static server: `cd game && python3 -m http.server 8765 --bind 127.0.0.1`.
- Screenshots: `NODE_USE_ENV_PROXY=1 node <scratchpad>/shots.mjs plan.mjs` (a plan module exports `{ out, script }`
  shots; each reloads the game and runs its page script with `window.__NS`). https requests (three.js CDN, Google
  Fonts) are fetched by Node through the agent proxy and cached in `<scratchpad>/netcache`.
- `playtest.mjs` / `playtest2.mjs`: real keyboard and mouse input; `fpscmp.mjs`: frame cost with a GPU sync.
