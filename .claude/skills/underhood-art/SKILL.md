---
name: underhood-art
description: >-
  Underhood step 4. Free, local game assets: sprites, icons, textures, 3D,
  SFX, music, voice via ComfyUI and open models, then exactly the files the
  engine loads (cutout, pixel fit, sheets, 3D-to-sprite). No paid APIs.
---

# underhood-art

Read `../underhood-shared/RULES.md` first. Everything here runs on the
user's own GPU; nothing needs a key or credits.

## 1. Study the game's own assets

Open two or three stock assets. Write into `MODLOG.md`: frame size and
layout, facing and pivot, alpha (hard or soft), palette and outline, file
format. The draw code is the final authority.

## 2. Generate

```bash
uh comfy status                                    # running? which checkpoints?
uh comfy image "rusty scrap drone, side view facing left, 16-bit pixel art" --sprite --name drone
uh comfy run workflow_api.json --set "Prompt.text=..." --upload "Load Image.image=concept.png" --name x
```

`--sprite` asks for a flat background and cuts it out locally. Anything
beyond plain text-to-image (edits, consistent frames, image-to-3D, tiling,
upscale, SFX, music, voice, video) is a ComfyUI workflow exported with
Export (API) and run with `uh comfy run`. Which free model for which job,
their licences, prompting that matches a game's style, audio conversion:
`references/generate.md`. Every run lands in `comfy_manifest.jsonl`.

## 3. Make it engine-ready

```bash
uh sprite fit cut.png item.png --size 64x26 --hard-alpha     # one nearest-neighbour scale
uh sprite pixelate cut.png px.png --size 32x32 --colors 16 --outline
uh sprite palette px.png px2.png --from stock_sprite.png
uh sprite sheet sheet.png frames/*.png --vertical
uh render3d unit.glb frames/ --preset aoe2 --length 80 --anims idle:10:bob,walk:12:walk
uh sprite preview item.png look.png --scale 6                # look before shipping
```

All commands, 3D-to-sprite presets, PBR packing, DDS, converting a guest
game's Unity assets for mashups: `references/pipeline.md`.

## 4. Check in game

One asset next to stock art first (scale, facing, pivot, palette), then
batch the rest with the same commands in a script so it can be regenerated.

## Done

`state.py done art --next underhood-ship`. List assets made, the models used
(for credits), anything still placeholder.
