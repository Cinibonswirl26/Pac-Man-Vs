# Reverse-engineering primer for modders

Concepts most people never learned, each with what it means for a mod and how to handle it.
RULES still apply: your own copy, offline, no DRM or anti-cheat bypass, keys stay local.

## 1. Identify the bytes

Run `uh probe <file>` first: magic, entropy per block, embedded zlib streams, a verdict, in a few lines.

| magic (hex / text) at offset 0 | what |
| --- | --- |
| `4D 5A` "MZ" | Windows PE (exe/dll). .NET if it has a CLI header (`uh scan` and REA say so) |
| `7F 45 4C 46` | ELF (Linux, Android native libs) |
| `CF FA ED FE` / `CA FE BA BE` | Mach-O 64 / universal (also Java `.class` is `CA FE BA BE`) |
| `50 4B 03 04` "PK" | ZIP: jar, apk, docx, many custom packs |
| `55 6E 69 74 79 46 53` "UnityFS" | Unity asset bundle (UnityPy, AssetRipper, UABEA) |
| `47 44 50 43` "GDPC" | Godot pck (GDRE Tools); also embedded at the end of the exe |
| `AF 1B B1 FA` | IL2CPP `global-metadata.dat` (little-endian 0xFAB11BAF). Anything else there = encrypted or obfuscated |
| footer `E1 12 6F 5A` | Unreal `.pak` (magic 0x5A6F12E1 in the footer, not the header) |
| `1B 4C 75 61` "\x1bLua" / `1B 4C 4A` "\x1bLJ" | Lua / LuaJIT bytecode (unluac, luajit-decompiler) |
| `78 01` `78 9C` `78 DA` | zlib stream |
| `1F 8B` | gzip |
| `28 B5 2F FD` | zstd |
| `04 22 4D 18` | LZ4 frame |
| `FD 37 7A 58 5A 00` | xz |
| `42 5A 68` "BZh" | bzip2 |
| `89 50 4E 47`, `FF D8 FF`, `44 44 53 20` "DDS " | PNG, JPEG, DDS texture |
| `4F 67 67 53` "OggS", `52 49 46 46` "RIFF", `46 53 42 35` "FSB5" | Ogg, WAV/RIFF, FMOD sound bank |
| `42 4B 48 44` "BKHD" | Wwise sound bank (`.bnk`; `.wem` audio via vgmstream / ww2ogg) |

Oodle (Unreal, many AAA) has no file magic; its blocks often start with `8C`. Decompress with the
game's own `oo2core_*.dll` through a community tool, never ship that DLL.

## 2. Entropy: plain, compressed or encrypted?

Shannon entropy in bits per byte: text and code 4 to 6.5, compressed 7.5 to 8, encrypted ~8.0 flat.
- **Compressed** has structure: a known header, stream boundaries, sizes in a table that add up.
- **Encrypted** is uniform everywhere. Block ciphers (AES) give sizes that are multiples of 16.
- **Mixed** (low header, high body) is the normal archive: a readable index, then compressed or
  encrypted entries. Read the index first.
- XOR with a short key keeps patterns: repeating byte runs at the key length, entropy below 8.

## 3. Encryption, keys and where they live

- **AES** is a block cipher with a 16/24/32-byte key (AES-128/192/256). ECB mode encrypts each
  16-byte block alone (identical plaintext blocks give identical ciphertext); CBC and CTR also need
  an IV/nonce. The key has to be in the program to decrypt at runtime, so it is in the exe, a DLL,
  or computed and present in memory.
- **Unreal pak/IoStore AES-256:** the key sits in the shipping exe as 32 bytes. AESDumpster
  (or a known community key list) finds it; FModel and repak take it as `0x` + 64 hex chars. Several
  paks may use extra keys (`EncryptionKeyGuid` in the pak index), loaded later by the game.
- **Unity:** asset bundles are normally plain (LZ4/LZMA). Encrypted ones use a game-specific scheme
  in `GameAssembly.dll` / `Assembly-CSharp.dll`: find the stream wrapper that reads the bundle
  (`AssetBundle.LoadFromStream`, a custom `Stream`), read the key there. Encrypted
  `global-metadata.dat`: let the game load it, then dump the decrypted copy from memory (offline,
  no anti-cheat), or follow the loader function in `GameAssembly.dll` that decrypts it.
- **Godot:** encrypted pck/scripts use a 32-byte AES key compiled into the exe; GDRE Tools can find it
  for many builds. Check the game's mod policy if it deliberately encrypts.
- **RPG Maker MV/MZ:** `encryptionKey` in `data/System.json` XORs the first 16 bytes of
  `.rpgmvp`/`.png_` files. XP/VX/Ace `.rgss*a` archives have extractors.
- **Cocos2d-x:** Lua/JS bundles often XXTEA with the key and a sign string in `libcocos2dlua.so` /
  the exe (search near `xxtea` strings).
- **Single-byte or repeating XOR:** XOR a stretch of ciphertext with known plaintext (a PNG header,
  `{"`, `<?xml`, zeros in padding) and the key appears, repeating at its length.
  `uh probe <file> --known 89504E470D0A1A0A` tries that at offset 0.
- **Hashes are not encryption.** CRC32, FNV-1a, MurmurHash, xxHash, CityHash and MD5 turn names into
  IDs (Bethesda, Unreal FNames, Wwise IDs, many asset tables). You can't decrypt them: build a name
  list (strings from the exe, community dictionaries) and hash it to match.

## 4. Saves and config

Usually JSON/XML/binary, often wrapped in zlib/gzip, sometimes AES or XOR with a key in the exe.
Many end with a checksum (CRC32, MD5, SHA-1 or a custom sum) over the body: change one byte and the
game rejects the file until you recompute it. Find the checksum by diffing two saves that differ by
one known value, then search the code for the function that writes the save. Back up first
(`uh backup create`).

## 5. Packers and protection

- **UPX** and similar plain packers: `upx -d` on a copy for reading.
- **Themida, VMProtect, Denuvo, SteamStub, Arxan**: anti-tamper/DRM. Reading your own copy's
  unpacked code in memory to understand it is fine; patching, unpacking into the game folder, or
  sharing any of it is not. If the mod would need the protection removed, stop and say so.
- **.NET obfuscators** (ConfuserEx, Dotfuscator, Babel): de4dot on a copy, for reading only.

## 6. Native executables in five ideas

- **Sections and addresses.** A PE has sections (`.text` code, `.rdata` constants and strings,
  `.data` globals). The image base (often `0x140000000` for x64) plus an **RVA** gives the virtual
  address; the **file offset** differs. With ASLR the base moves every run: store RVAs or
  signatures, never absolute addresses. REA `address_to_file_offset` converts.
- **Imports/exports.** The import table (IAT) says which system or engine DLL functions are called:
  `CreateFileW`, `send`, `D3D11CreateDevice`. Xrefs to an import find the code that uses it.
- **Strings → xrefs → function.** The fastest way in: find a log message or UI string, follow who
  references it, decompile that function, name it, repeat.
- **Classes in C++.** MSVC RTTI names classes in plain text (`.?AVPlayerCharacter@@`); each
  polymorphic object starts with a pointer to its **vtable**, an array of its virtual functions.
  Hooking a vtable slot changes one class's behaviour.
- **x64 calls (Windows).** First four integer/pointer args in `rcx, rdx, r8, r9` (floats in
  `xmm0-3`), return in `rax`/`xmm0`, `this` is `rcx` for methods. Knowing this lets you read
  arguments at a breakpoint or in a Frida hook.

## 7. Finding things that move

- **AOB / signature scan:** a byte pattern from the start of a function with wildcards for
  addresses (`48 89 5C 24 ?? 57 48 83 EC 20 8B 81 ?? ?? ?? ??`). Survives most patches where a
  hard-coded address doesn't. Make it unique and short; re-verify after each game update.
- **Pointer chains:** a value (HP) lives in a heap object that moves; Cheat Engine's "find out what
  writes to this address" gives the instruction and the register base, pointer scans give a chain
  `module+RVA → +0x30 → +0x18 → HP` that survives restarts. Prefer hooking the function that writes
  it over writing the value from outside.
- **Unreal and Unity reflection:** UE4SS/Dumper-7 and Il2CppDumper/Cpp2IL give names and offsets
  for free. Use them before hand-reversing structs.

## 8. Hooking: how a mod gets in

- **Loader first:** BepInEx, MelonLoader, UE4SS, SKSE, Fabric/NeoForge, SMAPI, tModLoader,
  REFramework. They solved injection and versioning already.
- **Proxy DLL:** a DLL named like one the game loads from its own folder (`dinput8`, `version`,
  `winmm`, `dwmapi`, `winhttp`, `xinput1_3`) forwards every export to the real system DLL and runs
  your code in `DllMain` (start a thread; do no heavy work under the loader lock). Put it only next
  to the target exe and check the process name: one dropped where Steam or another game loads it
  will run inside them too.
- **Inline (trampoline) hook:** MinHook or SafetyHook overwrites a function's first bytes with a jump
  to yours and keeps a trampoline to call the original. Mid-function hooks (SafetyHook) patch at an
  instruction and give you the registers.
- **IAT and vtable hooks:** swap a pointer instead of code. Less intrusive, narrower.
- **Managed:** Harmony prefix/postfix/transpiler (.NET), MonoMod; Mixin (Java); for Lua games,
  override the global function.
- **Graphics:** hook `Present`/`SwapBuffers` (via the loader or a proxy) for overlays; RenderDoc to
  find what each draw call does first.

## 9. Scripts and bytecode

- .NET IL → ILSpy/`ilspycmd` (near-source). Java → Vineflower/CFR. Python (PyInstaller) →
  pyinstxtractor, then pycdc/decompyle3 for the matching Python version. Lua → unluac;
  LuaJIT → luajit-decompiler. GDScript → GDRE Tools. JavaScript → it is already source: extract the
  ASAR (`npx @electron/asar extract app.asar out/`), use source maps if shipped, pretty-print.

## 10. Apps (Electron, CEF, Steam client)

- Electron: `resources/app.asar` holds the JS. Fuses (REA `inspect_electron_fuses` if advertised) say
  whether ASAR integrity checks or `--inspect` are disabled. Patch a copy or load your code via a
  preload; never ship the app's own files.
- CEF/Chromium UIs (the Steam client, launchers): `--remote-debugging-port` or CDP gives DOM and JS
  access live; inject CSS/JS from outside instead of editing installed files.
- Watch the app's own network traffic with mitmproxy or Fiddler on your machine. To keep a game
  offline, answer its requests locally (the Shadow of War example) rather than touching servers.

## 11. A safe order of work

1. Copy the files to `~/<target>-decomp/`. Work on copies.
2. `uh probe` / REA inventory → format, compression, encryption, engine.
3. Community tool if one exists. Archives (XeNTaX on archive.org, ZenHAX) before reversing yourself.
4. Strings → xrefs → function; name as you go; write offsets and signatures to `MODLOG.md`.
5. Confirm live (breakpoint, Frida, log) before writing a mod against it.
6. For formats: reader → look at the output → writer → round trip to identical bytes or a stated
   tolerance → one asset in game → batch.
