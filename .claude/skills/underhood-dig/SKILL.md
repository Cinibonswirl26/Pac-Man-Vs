---
name: underhood-dig
description: >-
  Underhood step 2. Reverse engineer how a game or app really works: decompile
  .NET, IL2CPP, Java, native; crack open paks, AES keys, file formats, saves,
  memory; REA evidence. Use for "find the damage function", "what format is
  this .pak".
---

# underhood-dig

Read `../underhood-shared/RULES.md` first. Rule zero: read the real thing,
don't guess. Write names, IDs, offsets and formats into `MODLOG.md` as you go.

New to a concept (AES key, entropy, RVA, AOB, vtable, trampoline, IL2CPP
metadata)? `references/primer.md` explains each with a recipe.

## 1. Route by what the code is

`uh scan` (or REA) tells you. Then:

| target | first tool | then |
| --- | --- | --- |
| native exe/dll, Unreal game code | REA `open_binary` → `search_strings`, `procedure_pseudo_code`, `xrefs` | Ghidra/IDA MCP; UE: dump reflection first (UE4SS, Dumper-7) |
| .NET / Mono / XNA (`Assembly-CSharp.dll`) | REA `inspect_managed_artifact` | `ilspycmd -p -o ~/<game>-decomp <dll>`, then grep |
| Unity IL2CPP | Cpp2IL or Il2CppDumper on `GameAssembly.dll` + `global-metadata.dat` | REA native on `GameAssembly.dll` with the generated names |
| Java (Minecraft, Slay the Spire) | Vineflower / Loom `genSources` | Mixin targets |
| Electron / ASAR / JS app | REA `analyze_javascript_application` (summary) | `trace_application_feature`, live `capture_electron_scenario` |
| Android APK | REA `inspect_android_package` | JADX |
| archives, installers, PyInstaller, firmware | REA `open_binary` + `inspect_artifact` | `extract_artifact` into a new folder |
| Godot | GDRE Tools (pck, gdc, key) | REA `inspect_artifact` for the pck inventory |
| data file or unknown format | `xxd \| head`, entropy, magic (`references/primer.md`) | community tool, then reader → writer → round trip |

Game-focused tool list (ILSpy, dnSpyEx, Cpp2IL, Ghidra/IDA/Binja MCPs,
Cheat Engine, x64dbg, Frida, ReClass, RenderDoc), asset tools per engine,
XeNTaX/ZenHAX archives, the round-trip method and trace oracles:
`references/re-games.md`. UE3 `.upk`: `references/ue3-packages/`.

## 2. REA, cheaply

REA is the free `rea-agents` MCP server (tools `mcp__rea__*`). If its tools
are missing: `npx -y rea-agents@latest setup --client claude_code --dry-run`,
show the plan, apply only with the user's OK, restart. Without MCP, the same
commands run as `npx -y rea-agents@latest <command> --json`.
Tool map, summary-first paging, evidence rules, runtime capture:
`references/rea.md`.

## 3. Encrypted or packed?

High entropy plus no magic means compressed or encrypted. Find which and
where the key lives before anything else: UE pak AES keys (AESDumpster,
FModel), Unity bundle and IL2CPP metadata encryption, Godot pck keys, RPG
Maker, XXTEA in Cocos, XOR'd saves, checksums to recompute.
`references/primer.md` sections 3 to 5. Keys stay local (RULES).

## 4. Confirm before building on it

Agents misname functions with confidence. Confirm each fact that a mod will
depend on: a breakpoint or Frida hook that fires, a value that changes in
Cheat Engine, a log line, or a round trip that reproduces the original bytes.
Record open questions:

```bash
python3 <repo>/underhood-shared/state.py unknown "who writes player HP?"
python3 <repo>/underhood-shared/state.py resolve 1 "Player::ApplyDamage @ RVA 0x4A21F0, breakpoint hit"
```

## Done

`state.py done dig --next underhood-forge`. Summary: the hooks or data the
mod will touch (name, address or signature, how confirmed), formats
understood, keys found (where, not the value), unknowns left.
