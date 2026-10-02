# Tools

Browser checks, a balance probe, and the publishing step. The headless test suites live in `tests/`; these
tools are what you use on top of them to look at the game.

| Tool | What it does | Command |
|---|---|---|
| `shots.mjs` | Screenshots from a plan: each shot sets up a scene in the page and saves a PNG | `NODE_USE_ENV_PROXY=1 node tools/shots.mjs tools/plans/rooms.mjs` |
| `playtest.mjs` | Plays with real keyboard and mouse input, drives the menus, races the mission to the debrief, reports console errors | `NODE_USE_ENV_PROXY=1 node tools/playtest.mjs` |
| `coop.mjs` | Two players: keyboard and mouse plus a scripted gamepad. Joins, a team-up with real inputs, pad-driven pause | `NODE_USE_ENV_PROXY=1 node tools/coop.mjs` |
| `probe.mjs` | The test bot plays the mission with no cheats and prints time, failures, kills, team-ups and damage by power | `node tools/probe.mjs 2 1,4,7` |
| `layout.mjs` | Checks that no HUD element covers the game view, spills out of its band or covers another HUD item, across five window sizes and the HUD's busiest states; saves `layout-<w>x<h>.png` | `NODE_USE_ENV_PROXY=1 node tools/layout.mjs` |
| `sidebyside.mjs` | Runs this tree beside a reference tree (a worktree of another commit) tick by tick: the simulation, the heroes' poses and the effect calls. Proves a refactor changes nothing, or finds where a golden replay diverged | `node tools/sidebyside.mjs ../ref all` |
| `contact.mjs` | Contact sheets: every move of every hero on its first active tick, labelled with its slot, frame data and reaction, one sheet per hero (`contact-<hero>.png`). One page per hero does all its shots | `NODE_USE_ENV_PROXY=1 node tools/contact.mjs [hero ...]` |
| `publish-prep.mjs` | Copies `game/` into a folder ready to publish as a claude.ai artifact and prints the publish arguments | `node tools/publish-prep.mjs <scratchpad>/publish` |

Plans for `shots.mjs`: `plans/rooms.mjs` (each hero's core verb and V2's four rooms) and `plans/moves.mjs` (each hero
mid-strike: a chain finisher, the launcher, a spin, the counter, an air strike) and `plans/reactions.mjs` (a Sentinel
in each hit reaction) and `plans/effects.mjs` (phase 1's effects: heavy hit, trail, bounces, a super, a kill; each shot
reports the live GPU sparks, lit pool lights, decals and trails). `plans/danger.mjs` drives the Danger Room through its buttons (its page,
the move list, the trials, the sparring settings, a demo with the hitbox readout, a trial being tried). A plan can shoot another tree's game:
run that tree's `tools/shots.mjs` with this plan's path and another `PORT`. Phase 0 compared itself with V2 that way.

Screenshots land in `tools/out/` (gitignored). Open them with the Read tool to look at them.

## How the browser tools work

- **Server.** Each browser tool serves `game/` itself with `python3 -m http.server` on port 8770 (or `PORT`)
  unless something already answers there, and stops it at the end. Check the port first if you run your own
  server: a stale one serving another worktree's `game/` would be used without complaint.
- **Network.** In the cloud container Chromium cannot reach jsDelivr or Google Fonts through the agent proxy.
  `tools/lib/browser.mjs` routes every https request through Node's `fetch` into `tools/.netcache/`
  (gitignored), and Node only uses the proxy when `NODE_USE_ENV_PROXY=1` is set. Without it, three.js fails to
  load and the page never sets `window.__X`, so the tool times out after 60 s.
- **Rendering.** Chromium runs SwiftShader (software GL): 10 to 25 fps at 1280×720, and a screenshot can take a
  minute. Frame rates measured here say nothing about a real GPU.
- **Repeatable pictures.** Plans set `X.manual = true` so the simulation only moves when the script calls
  `X.step(n)`, then `settle()` the camera before the shot. `tools/plans/helpers.mjs` documents the helpers.
- **Playwright.** The tools import a local `playwright` if there is one, else the global install. In the cloud
  container never run `playwright install`; Chromium is already in `/opt/pw-browsers`.

## The page's test hooks

`window.__X` (set in `game/js/main.js`): `S` (the world), `join(device)`, `step(n)`, `inject(tick, cmds)` (a hook
that replaces the commands of the next steps), `manual` (true stops the clock), `stats()`, and the `view`, `ui`,
`input`, `sound`, `music`, `overlay` and `SETTINGS` objects. Keep these working as the client changes; every
tool depends on them.
