# X-Men fan prototypes

Three versions of an X-Men co-op action game, built from Nova Striker V9
(`moderngentlemen-sudo/nova-striker-claude`, branch `claude/nova-striker-fresh-start-lqu8sn`,
commit `eeeece5`). Each version lives on its own branch, and the expansion of V2 has a branch of its own.

| Branch | Version | Status |
|---|---|---|
| `v1-original` | **X-Men: Sentinel Strike**: Nova Striker V9 converted to five X-Men, Sentinels, Juggernaut and Magneto | Finished |
| `v2-first-proposal` | **X-Men: Sentinel Strike, Team Edition**: the first concept proposal's vertical slice. Cyclops, Wolverine and Jean rebuilt around team-ups, Sentinels that adapt, one rescue mission, a comic-book look | Playable slice |
| `v2-expansion` | **Team Edition expansion**: V2 grown to nine heroes with about 30 moves each, hits with real impact, and a five-layer 3D set around the fight. The plan and the handoff are in `HANDOFF-EXPANSION.md` | Phase 0 (the move engine) done; menus and HUD reworked; phase 1 is next |
| `v3-sentinel-war` | **X-Men: Sentinel War**, Issue #1: co-op roguelite runs against a Master Mold that learns between runs | Not started |

V2 branches from V1, and the expansion and V3 from V2, so each branch's history shows what it reused.

## Playing a version

Check out its branch, serve the `game/` folder with any static web server and open it in a browser:

```bash
cd game && python3 -m http.server 8765
# then open http://localhost:8765
```

Three.js loads from jsDelivr, so the first load needs a network connection. Each version is also
published as a private claude.ai artifact:

- V1: https://claude.ai/artifact/Xjv2KwWDRpNE6RmFNiMzgK
- V2: https://claude.ai/artifact/MzaN97QpEmcpV11n83Aq7A
- Expansion, ready room build (V2 with the HUD off the play area, a ready room, hints and key rebinding): https://claude.ai/artifact/UhSDGngLMLnCuq1W4CNjSj
- V3: added here when it is playable

## Tests

Each branch has headless test suites that run in Node 18 or later, with no install step:

```bash
node tests/run-all.mjs
```

## Design documents

- First proposal: https://claude.ai/code/artifact/796973c5-6036-45a5-acbb-b10b9d5116f2
- Sentinel War proposal: https://claude.ai/code/artifact/6844d2b2-2266-4a29-aa7c-02fe945de3f2
- Team Edition expansion proposal: https://claude.ai/code/artifact/d44cd592-96ae-468d-aadf-b8784ff3bdba

## Not for public release

These are unofficial fan prototypes, not affiliated with or endorsed by Marvel. The X-Men, the
Sentinels, Master Mold, Juggernaut and Magneto belong to Marvel. Keep this repository private, keep
the builds free, and get advice from an IP lawyer before showing any of it publicly.
