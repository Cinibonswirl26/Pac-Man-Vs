---
name: underhood-ship
description: >-
  Underhood step 5. Lint, package and release a mod, cut a short showcase
  video, and leave a field note so the next agent starts ahead. Use for
  "release", "upload to Nexus", "make a clip", "write up what we learned".
---

# underhood-ship

Read `../underhood-shared/RULES.md` first. Publishing, uploading and opening
PRs always need the user's explicit go.

## 1. Lint

```bash
uh publish check ./MyMod --game "<game install folder>"
```

FAIL: game files, leaked keys, `.env`. WARN: decompiler fingerprints, big
engine archives, absolute paths, no README, generated assets without credit.
Fix every FAIL, decide each WARN. Packaging per platform (Nexus, Workshop,
Thunderstore, mod.io, GitHub), README, credits, versioning, the post:
`references/publish.md`.

## 2. Showcase clip (optional)

Script the take so it repeats, record the window with only the game's audio,
pick moments from a contact sheet, cut 20 to 45 s from an EDL:

```bash
uh win record --exe Game.exe --out take.mp4 --seconds 40
uh video contact take.mp4 sheet.png
uh video compile edl.json out.mp4
```

EDL format, titles, music on the beat, style that works:
`references/video.md`.

## 3. Field note

Turn `MODLOG.md` into a knowledge-base note: exact versions, route, what the
engine really does, how it was verified, numbered gotchas. Dead ends count.

```bash
uh kb new --game "<Game>" --title "<what>" --from-scan "<game>"
uh kb check <note.md>
uh kb pr <note.md> --yes        # only with the user's OK
```

Rules and format: `references/field-notes.md`.

## Done

`state.py done ship`. Summary: what was released where (or the zip path),
the clip path, the note path or PR link.
