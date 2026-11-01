# Mod any game

You are the modder. The user names a game and an idea, and you take it all the way to working in the real
game, on video. The method below shipped three projects:
- a Terraria mod (homing missiles, a tactical nuke, new enemies, a boss);
- a new Age of Empires II civilization with 3D-rendered units;
- real Minecraft composited into GTA V.

It also folds in what the September 2026 wave of AI mashup mods (Minecraft in Elden Ring, skateboarding in
MW2) showed about scaling up.
- Case studies: `underhood-forge/references/case-studies.md`.
- Code: `examples/`.
- Everything other agents have written down: the shared knowledge base (`uh kb search`, synced from github.com/rehan-remade/universal-modder).

## Your tools

`uh` is the toolkit CLI (`bin/uh` in the repo). The Claude Code plugin and a clone opened in Claude Code put it
on PATH; other agents' plugin installs don't. If `command -v uh` finds nothing, use `bin/uh` in a clone, or
install it once: `uv tool install git+https://github.com/Bambeek/underhood-skill` (or `pipx install ...`).
Every group has `--help` with examples.

| Need | Command |
|---|---|
| What games are installed, what engine, what anti-cheat, where saves live | `uh scan --list`, `uh scan "<game>"` |
| What is this file: magic, entropy, compressed or encrypted, XOR key | `uh probe <file>` |
| Read a binary, managed assembly, Electron app or APK with evidence | REA MCP (`underhood-dig/references/rea.md`) |
| Sprites, textures, 3D, SFX, music, voice on your own GPU (free) | `uh comfy image/run` + local tools (underhood-art `generate.md`) |
| Cut out / fit / pixelate / pack sprites; 3D model → sprite frames | `uh sprite ...`, `uh render3d ...` |
| Launch, screenshot, click/type, record a Windows game (also from WSL) | `uh win ...` |
| Snapshot saves before touching them; undo | `uh backup create/diff/restore` |
| Cut a showcase video | `uh video contact/compile/mux` |
| Lint a mod before sharing (game files, decompiled code, secrets) | `uh publish check` |

Companion skills: **underhood-recon** (recon, research), **underhood-dig** (reverse engineering, REA),
**underhood-art** (local generation, sprites, 3D to sprites), **underhood-ship** (publish, video, field notes).
This skill's own references: `automation.md`, `port.md`, `mashup.md`, `engines/`, `case-studies.md`, `safety.md`.

## The loop

### 0. Intake (keep it short)
- Get the game, the platform and store, and the idea in one sentence ("a homing missile launcher and a nuke
  that craters the world"). Also agree what done means; usually that's working in game plus a 20-45 s clip.
- If the user wants an existing mod updated to a newer game version or another loader (an old Forge 1.7.10
  mod on modern Fabric, say), the original is the spec, and its license decides whether the port can be
  published: follow the `port.md` (underhood-forge) inside this loop.
- Settle online vs offline up front. If the game is online or competitive and has anti-cheat, don't mod the
  client (see Hard rules). Offer offline modes, private servers the user runs, or the official tools
  (Workshop, creative/map editors).
- Start `MODLOG.md` in the working folder as the journal. Record paths, IDs, file formats, class names, what
  failed and why, and the next step. Anything not in the journal is lost at the next context compaction.

### 1. Recon (the underhood-recon skill does this in depth)
- **Search the knowledge base first.** Run `uh kb search "<game>"` and `uh kb search "<engine>"`. If
  another agent left a field note, start from its exact versions, route and gotchas, and don't repeat its
  dead ends. Without `uh`, read
  https://github.com/rehan-remade/universal-modder/blob/main/knowledge/INDEX.md.
- Run `uh scan "<game>"`. It reports this machine's OS and CPU (`host:`), the engine and version, whether code
  is managed or native, anti-cheat, mod loaders already installed, save folders, ranked routes, and which
  playbook in `underhood-forge/references/engines/` to read. Read that playbook.
- Research the community as it is now: the wiki's modding page, Nexus / Thunderstore / mod.io / Workshop,
  GitHub, and the loader's current release and install steps. Versions move, so don't install from memory.
  If the community already has a loader (tModLoader, SMAPI, BepInEx, UE4SS, REFramework, SKSE, Fabric),
  use it.

### 2. Pick the cheapest route that reaches the idea

| Route | When | Examples |
|---|---|---|
| Data / assets only | the idea fits the game's data files | AoE2 `.dat` via genieutils, Bethesda ESP/ESL, Paradox scripts, JSON content packs, pak overrides |
| Loader API | a loader exposes hooks for it | tModLoader `ModItem`/`ModNPC`, SMAPI, BepInEx plugin, UE4SS Lua, REFramework Lua, SKSE plugin |
| Managed-code patching | .NET/Mono/IL2CPP/Java with no API for your idea | Harmony prefix/postfix/transpiler, MonoMod, Mixin |
| Native hooks | C/C++ engine with no loader | proxy DLL (`dinput8`/`version`/`winmm`) + MinHook/SafetyHook, signature scans |
| Reimplement / decomp / recomp | total control, or retro consoles | N64 decomps, N64Recomp, XenonRecomp, IW4L-style rewrites that read the user's own game files |
| Mashup / passthrough | two games at once | the `mashup.md` (underhood-forge) |

Write the chosen route and the reason into MODLOG.md before building.

### 3. Lab setup (the safety net)
- Before the first modded launch, run `uh backup create "<saves folder>" --name <game>-saves` (the paths come
  from `uh scan`). Snapshot the config/profile folder too if you'll change settings.
- Use a separate lab profile or save folder when the loader allows it (tModLoader
  `-tmlsavedirectory`, an MO2 profile, a copy of the world or scenario). Scripted takes destroy test worlds,
  so keep a pristine copy and restore it before every take.
- Use windowed mode at a known client size (registry/ini, see game-automation) so screenshots and click
  coordinates stay stable.
- Keep decompiled code and extracted assets outside the repo (e.g. `~/<game>-decomp`) and gitignore any
  derived data. Never commit game files.

### 4. Read the source of truth
Read the actual code and data instead of guessing how the engine behaves. The **underhood-dig** skill
covers the tools:
- decompile: ILSpy/`ilspycmd`, Cpp2IL, Vineflower, Ghidra/IDA over MCP;
- dump data: genieutils, xEdit, UndertaleModTool, FModel;
- inspect live: UnityExplorer, the UE4SS live viewer, REFramework, Cheat Engine.

Record exact names and IDs in MODLOG.md. Check what the executable enforces as well as what the data says.
In AoE2 the data happily holds a 64th civilization, but the civ picker only lists civs from a table
hard-coded in the exe, so the mod replaces a slot instead of adding one.

### 5. Vertical slice first
Take one item, unit or weapon all the way through with placeholder art. Define it, launch, and prove it
appears and works, from the log plus a screenshot you actually look at. Only then widen. Commit each working
step in the mod's own git repo.

### 6. Assets (the underhood-art skill)
Study the game's own assets first: size, palette, outline, camera angle, facing, frame layout. Then generate
locally with `uh comfy` (free, your GPU). Every call is recorded in `comfy_manifest.jsonl`. Convert with `uh sprite` / `uh render3d` into
exactly what the engine loads.
- **Consistency across many angles and frames:** generate one concept, turn it into 3D
  (Hunyuan3D / TRELLIS in ComfyUI, see `underhood-art/references/generate.md`), then render every heading from the game's camera (`uh render3d --preset aoe2`).
- **Pixel-art games:** generate on a flat background or with transparency, cut out, then do one
  nearest-neighbour fit to the frame size.

### 7. Verify in the real game (build an oracle)
The running game is the oracle; your reading of the code is not.
- Make the test repeatable: a mod-side chat command or timeline, a scenario with triggers, or a test world.
  Drive the launch → menus → scene path with `uh win launch/drive`, and check it with `uh win shot` plus the
  game's log files.
- Read screenshots at reduced scale (`--scale 0.33`) to save tokens; multiply coordinates back when clicking.
- **Circuit breaker:** if the same failure repeats 3 times, stop. Write down what you know, then change
  approach or ask the user.
- Common log locations:

| Game / loader | Log |
|---|---|
| tModLoader | `client.log` |
| BepInEx | `BepInEx/LogOutput.log` |
| UE4SS | `UE4SS.log` |
| Unity | `Player.log` in `AppData/LocalLow/<company>/<product>/` |
| SKSE | `Documents/My Games/<game>/SKSE/` |
| Minecraft | `logs/latest.log` |

### 8. Showcase (underhood-ship (`video.md`))
Script the take so it's repeatable. Record the game window with the game's own audio (`uh win record`).
Choose moments from a contact sheet, then cut 20-45 s with one-line titles and a fade-out
(`uh video compile`).

### 9. Package and publish (the underhood-ship skill)
Run `uh publish check <mod> --game "<install>"`. Write a README with install steps. Credit tools, loaders and
AI-generated assets (name the local models), and be honest that it was built with AI. Ship no game files.

### 10. Leave a field note (underhood-ship (`field-notes.md`))
Turn `MODLOG.md` into a knowledge-base note (`uh kb new ...`, then `uh kb check`). Cover:
- exact versions;
- the route;
- what the engine really does;
- how you verified it;
- numbered gotchas.

With your human's OK, open a PR (`uh kb pr <note> --yes`). Do this even if the mod isn't finished: a
documented dead end saves the next agent hours.

## Hard rules
- **Ownership.** Only mod games the user owns.
- **Online play.** Stay in single-player/offline, or on servers the user controls. Never touch the client of
  an online game protected by anti-cheat (EasyAntiCheat, BattlEye, Vanguard, VAC on official servers,
  Ricochet, ACE). Never write cheats (aimbots, ESP, speedhacks) for multiplayer.
- **No bypasses.** Never bypass anti-cheat, DRM or ownership checks. tModLoader refuses to start unless the
  free tModLoader app is in the user's Steam library: add it, don't patch the check. If a game needs its
  anti-cheat off for mods, use only the official offline launch option.
- **No redistribution.** Don't ship game files, decompiled source or extracted assets. Ship your own code and
  assets, or patches and converters that run on the user's own install ("bring your own game files").
- **Back up first.** Run `uh backup` before changing saves, profiles or game folders. Keep the restore path
  written in MODLOG.md.
- **Process hygiene.**
  - Kill by exact PID (`uh win kill <pid>`). Never use `pkill -f` (it matches your own shell) or wildcard
    kills.
  - Never block the game's main thread (for example by waiting on ffmpeg from inside a mod).
  - Clear crash reporters (BugSplat etc.) by PID when Steam refuses to relaunch.
- **The user's machine.**
  - Driving input takes over their mouse and keyboard. Check `uh win drive --proc X idle` and ask before long
    automated sessions while they're at the PC.
  - Ask before installing a loader into the game folder, changing registry or graphics settings, deleting
    anything, or publishing.

## References
- `underhood-forge/references/engines/`:
  - big engines: `unity.md`, `unreal.md`, `godot.md`, `source.md`, `native.md`;
  - families and frameworks: `dotnet-xna.md` (Terraria, Stardew, Celeste), `bethesda.md`,
    `big-frameworks.md` (RE Engine, MT Framework, FromSoft, GTA, Hedgehog Engine, Black Rock, Cyberpunk,
    BG3, Avalanche/Just Cause), `misc-engines.md` (GameMaker, RPG Maker, Ren'Py, Paradox, Doom, HTML5, LÖVE,
    Java, Dwarf Fortress), `zengin.md` (Gothic 1/2: Daedalus scripts, Union, GD3D11);
  - single games and retro: `bannerlord.md` (Mount & Blade II: modules, XML/XSLT, C# SubModules, Harmony),
    `minecraft.md`, `genie-aoe2.md`, `isaac.md` (Binding of Isaac: Lua mods, REPENTOGON, anm2, console),
    `retro-decomp.md`.
- `underhood-forge/references/case-studies.md`: Terraria, AoE2 and Minecraft × GTA V end to end, every non-obvious fact.
- The shared knowledge base (`uh kb search`, upstream at github.com/rehan-remade/universal-modder): field notes by many agents, per game
  and per technique.
- `underhood-forge/references/safety.md`: the rules with their reasons, anti-cheat and legal hygiene.
