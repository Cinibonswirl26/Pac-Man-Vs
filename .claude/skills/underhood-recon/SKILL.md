---
name: underhood-recon
description: >-
  Underhood step 1. Can this game or app be modded, and how? Engine, version,
  managed or native, anti-cheat, loaders, saves, community route, prior notes.
  Use for "can I mod X", "what engine is X", or the start of any mod.
---

# underhood-recon

Read `../underhood-shared/RULES.md` first. `<repo>` is the folder above this
skill. `uh` is `<repo>/bin/uh` (the plugin puts it on PATH; it needs `uv`, or
Python with pillow, numpy and pyyaml).

## 0. Start or resume

```bash
python3 <repo>/underhood-shared/state.py show
```

If it prints a step, continue from there. Else get the target, the store,
and the idea in one sentence, agree what "done" means (usually: working in the
real game plus a short clip), then:

```bash
python3 <repo>/underhood-shared/state.py init --target "Terraria" --kind game --idea "homing missiles"
```

Online or competitive with anti-cheat? Say so now and offer what is possible:
offline modes, a private server, official tools (Workshop, editors).

## 1. Prior art first

```bash
uh kb search "<game>"        # field notes from other agents (synced from GitHub, no key)
uh kb search "<engine>"
uh kb show games/<slug>/<note>.md
```

A note gives exact versions, the route and numbered gotchas. Start from it and
skip its dead ends.

## 2. Fingerprint

```bash
uh scan --list               # Steam, Epic, Xbox installs
uh scan "<game or folder>"   # host, engine+version, .NET?, anti-cheat, loaders, saves, ranked routes
```

Read-only. It names the engine playbook to read next
(`underhood-forge/references/engines/<engine>.md`). Read only that one.
For an **app** (Electron, CEF, .NET, Qt, native) instead of a game, skip
`uh scan` and go to `underhood-dig` step 1: REA's
`inspect_desktop_application` fingerprints an install folder.

Full checklist (what the scan misses, kernel anti-cheat, GOG and itch folders):
`references/recon.md`. Windows game on macOS/Linux or x64 on ARM:
`references/compatibility.md`.

## 3. The living community

Versions move; never install a loader from memory. Search the game's modding
wiki, Nexus, Thunderstore, mod.io, Workshop, GitHub, recent Reddit and X
posts. Capture: loader name, repo, current version, install steps, a hello
world mod, where logs go. Dead forums, archives, login-gated pages and how
to cite: `references/research.md`. Many pages: give them to a subagent that
returns only those facts.

## 4. Decide and write it down

Safe to mod? Route, cheapest first: loader API > data/asset mod > managed
patching > native hooks > reimplementation or mashup. Write
`MODDING_PLAN.md` (template in `references/recon.md` step 4), then:

```bash
python3 <repo>/underhood-shared/state.py set engine "Unity 2022.3 IL2CPP"
python3 <repo>/underhood-shared/state.py set route "BepInEx 6 + Harmony"
python3 <repo>/underhood-shared/state.py set saves "<path>"
python3 <repo>/underhood-shared/state.py done recon --next underhood-dig
```

## Done

Five lines: engine and version, anti-cheat verdict, route and why, lab plan,
open unknowns. Next: `/underhood-dig` (read the internals) or straight to
`/underhood-forge` when a loader API already covers the idea.
