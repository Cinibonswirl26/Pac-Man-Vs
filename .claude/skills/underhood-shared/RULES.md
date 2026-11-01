# Underhood rules

Every Underhood skill follows these. Read once per session, not per step.
Reasons and edge cases: `underhood-forge/references/safety.md`.

## Your copy, your machine, offline

- Only games and apps the user owns. Single-player, offline, or servers the user runs.
- Clients of online games protected by anti-cheat (EAC, BattlEye, Vanguard, VAC, Ricochet, ACE, nProtect, XIGNCODE) may be analysed only offline: with no connection to official servers and with the anti-cheat not running (e.g. an official offline or single-player mode, or a separate local copy of the game). Debuggers, scanners and injected DLLs are allowed only in that setup. Before going back online, restore the original game files (e.g. via "Verify integrity of game files") so the account is not flagged. Cheats (aimbot, ESP, speedhack) are never used in multiplayer.
- For personal use only: bypassing DRM, anti-tamper, licence or ownership checks (Denuvo, SteamStub, VMProtect licensing, "is the free loader in your library" checks). Where possible, use the official offline mode instead.
- Keys you recover (AES pak keys, XOR keys, save-file keys) are used locally to read the user's own
  files. Don't ship them inside a mod or a public note.
- Never ship game files, decompiled source or extracted assets. Ship your code, your assets, and
  patchers/converters that run on the user's own install.

## Ask first

- Installing a loader into a game folder, editing the registry or graphics settings, deleting
  anything, publishing, opening a PR.
- Driving mouse or keyboard, or taking screenshots, while the user may be at the PC. Check
  `uh win drive --proc X idle` first. Never focus a game that has an online mode while they type.

## Safety net

- `uh backup create` before changing saves, profiles or game folders. Write the restore command in
  `MODLOG.md`.
- Proxy DLLs (`version.dll`, `winmm.dll`, `dinput8.dll`, `winhttp.dll`...) go only next to the target
  exe, and check the host process name in `DllMain`. A proxy in a shared folder gets loaded by
  other processes (Steam, other games, anti-cheat) and can break them.
- Kill by exact PID (`uh win kill <pid>`). Never `pkill -f` or wildcard `taskkill /IM`.
- Decompiled output and extracted assets live outside any repo (`~/<game>-decomp/`), gitignored.

## Evidence, not guesses

- The running game or app is the oracle. Decompiled code, a live memory view, a GPU capture or a
  REA Evidence record is the spec. Your reading of it is a hypothesis until a test confirms it.
- Every claim is an observation (cite the tool output, Evidence ID, log line, offset), an inference
  (say so), or an unknown (write it down). Static analysis never proves what ran.
- Circuit breaker: the same failure 3 times means stop, write what you know, change approach or ask.

## Free only

- No paid APIs or credits. Images, 3D, audio and voice come from local models (ComfyUI and friends,
  `underhood-art/references/generate.md`). Check each model's licence before a public release.

## Token discipline

- `uh` tools and REA print summaries. Read the summary; open full output only for the part you need.
- Decompile to disk and `grep` it. Never paste whole decompiled files into context.
- REA: `detail: "summary"` first, then `inspect_analysis_view` pages. Never repeat an identical call.
- Screenshots: `--scale 0.33` copies, one at a time, only when a log can't answer.
- Load one reference file at a time, the one the current step names.
- Hand wide reading (forums, a big decomp tree, many notes) to a subagent that returns only findings.

## Journal

- `underhood/state.json` (via `state.py`): target, kind, idea, route, paths, step. Read first.
- `MODLOG.md`: paths, IDs, offsets, formats, what failed and why, next step. Anything not written
  there is lost at the next context compaction.
