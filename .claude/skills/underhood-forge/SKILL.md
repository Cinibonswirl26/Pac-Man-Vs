---
name: underhood-forge
description: >-
  Underhood step 3. Build the mod and prove it in the real game: pick the
  route, back up, vertical slice, hooks or loader code, test scenes, in-game
  checks. Also ports of old mods and cross-game mashups. Use for "add X to Y".
---

# underhood-forge

Read `../underhood-shared/RULES.md` first. Then `state.py show`; if recon was
skipped, run `/underhood-recon` step 2 at least.

The full loop with every hard-won detail (route table, log locations, process
hygiene) is `references/loop.md`. Engine specifics:
`references/engines/<engine>.md` (unity, unreal, godot, source, native,
dotnet-xna, bethesda, big-frameworks, misc-engines, minecraft, bannerlord,
genie-aoe2, isaac, zengin, retro-decomp). Three projects end to end:
`references/case-studies.md`. Working code: `<repo>/examples/`.

## 1. Route

Cheapest that reaches the idea: data/assets → loader API → managed patching
(Harmony, MonoMod, Mixin) → native hooks (proxy DLL + MinHook/SafetyHook,
signature scans) → reimplement/decomp → mashup. Write route and reason in
`MODLOG.md`.

Special cases, read only when they apply:
- existing mod to a newer version or loader: `references/port.md`
  (+ `references/port-forge-1.7.10-to-fabric.md`);
- two games at once, porting content between games: `references/mashup.md`
  (+ `references/mashup-cases.md`).

## 2. Lab

```bash
uh backup create "<saves folder>" --name <game>-saves   # restore: uh backup restore <game>-saves
```

Separate lab profile or save folder where the loader allows it, a pristine
test world to restore before each take, windowed at a fixed client size.
Ask before installing anything into the game folder.

## 3. Vertical slice

One item, unit or hook all the way through with placeholder art: define it,
launch, prove it from the log plus one screenshot you actually look at. Then
widen. Commit each working step in the mod's own git repo.

## 4. Verify in the real game

Build an oracle the agent can run without pixels: a chat or console command
in the mod, a scripted test scene, or a JSON-lines bridge on `127.0.0.1`
(`<repo>/examples/terraria-tmodloader/reference/AgentBridge.cs`). Read the
log first, screenshot second.

Launching, windowing, driving input, GPU-safe capture, crash reporters,
Linux/macOS: `references/automation.md`. Before any input or screenshot:
`uh win drive --proc X idle` and ask if the user is at the PC.

```bash
uh win launch --steam <appid>
uh win shot --exe Game.exe shot.png --scale 0.33
uh win ps                       # then uh win kill <pid>, never wildcards
```

Same failure 3 times: stop, write it down, change approach or ask.

## Done

`state.py done forge --next underhood-art` (or `underhood-ship` if no art is
needed). Summary: what works in game and how it was verified, what is
placeholder, restore command, known issues.
