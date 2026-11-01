# Free, local asset generation

Everything here runs on the user's GPU through ComfyUI (or a small local tool). No keys, no credits.
`uh comfy image` covers plain text-to-image. For everything else, build or download the graph in
ComfyUI, save it with **Export (API)**, keep it in the mod's `assets/workflows/`, and run it:

```bash
uh comfy run assets/workflows/edit_api.json \
  --upload "Load Image.image=assets/gen/drone.png" \
  --set "Prompt.text=same drone, rotors tilted, frame 2 of 4" --set "KSampler.seed:=42" --name drone_f2
```

`--set NODE.INPUT=value` (`:=` for JSON numbers/booleans) and `--upload NODE.INPUT=path` take a node
id or its title. Outputs (images, GLB, audio, video) land in `--out` (default `assets/gen`), and each
run appends a line to `comfy_manifest.jsonl` with the workflow, inputs and seed, so any asset can be
made again. Many models need a custom node pack: install it with ComfyUI-Manager (ask the user first).

## Which model for which job

Licences as known in 2026. Always read the model card before a public or paid release; a mod that
asks for donations may count as commercial.

| job | free local option | licence notes |
| --- | --- | --- |
| sprites, icons, concept art | SDXL + a pixel-art or game-icon LoRA; FLUX.1 [schnell]; Qwen-Image | SDXL OpenRAIL++, schnell and Qwen-Image Apache 2.0 |
| best-quality stills | FLUX.1 [dev] | model non-commercial; read its output terms |
| consistent variants, extra frames, recolours, same character new pose | Qwen-Image-Edit; FLUX.1 Kontext [dev]; SDXL + IP-Adapter | Qwen Apache 2.0; Kontext dev non-commercial |
| background removal | `uh sprite cutout` (flat backgrounds); BiRefNet node | BiRefNet MIT; RMBG-2.0 is non-commercial |
| pixel art from painted art | `uh sprite pixelate --colors N --outline`, `uh sprite palette --from stock.png` | yours |
| upscale | Real-ESRGAN / 4x-UltraSharp via Upscale Model Loader | Real-ESRGAN BSD-3 |
| seamless textures | SDXL with a circular-padding (seamless tiling) node; fix others with `uh sprite seamless` | |
| PBR maps | Materialize (free app) or DeepBump (Blender) from the albedo | |
| image → textured 3D (GLB) | TRELLIS / TRELLIS.2, TripoSR; Hunyuan3D 2.x | TRELLIS and TripoSR MIT. Hunyuan3D's licence excludes the EU, UK and South Korea |
| low-poly, game-ready mesh | Blender Decimate or QuadriFlow remesh; Instant Meshes | free |
| rigging and animation | Blender Rigify; Mixamo (free with an Adobe account, ask the user) | |
| sound effects | Stable Audio Open 1.0 | Stability Community licence (free under its revenue cap) |
| music | ACE-Step; MusicGen | ACE-Step Apache 2.0; MusicGen weights non-commercial |
| voice lines | Kokoro-82M; Piper; F5-TTS / XTTS-v2 for cloning | Kokoro Apache 2.0, Piper MIT; F5 and XTTS weights non-commercial. Clone only voices the user has rights to |
| trailer or cutscene clip | Wan 2.1/2.2 image-to-video; LTX-Video | Wan Apache 2.0; read LTX's licence |

VRAM is the limit. Check `uh comfy status` for the device, start with small sizes and few steps
while exploring, then re-run the winners at full quality with the same seed.

## Prompting art that fits the game

- **Look at the game's own assets first:** pixel size, outline, palette, perspective, facing, how
  busy they are. Turn that into one reusable style suffix and keep it in `MODLOG.md`. For Terraria:
  "16-bit pixel art game sprite in the style of Terraria, crisp dark outline, limited palette,
  centered, plain flat white background, no shadow, no text".
- **State view and orientation:** "perfectly horizontal side view, muzzle pointing right" for held
  weapons, "seen from the side facing left" for enemies, "pointing straight down" for a falling bomb.
  Engines have conventions (Terraria items point right, NPCs face left); fixing orientation later
  costs quality.
- **Backgrounds:** a flat colour `uh sprite cutout` can flood-fill. No gradients, scenery or ground
  shadow. A soft shadow that slips in: `uh sprite cutout --grey 150 --keep-top 0.8`.
- **Player or team colour:** ask for "bright saturated blue accents" on the parts that should take
  the player's colour, then `uh sprite team-mask --hue blue`.
- **Consistency across a set:** make one hero image, then derive the rest with an edit model and the
  hero as the reference image. Don't ask one prompt for a whole sheet; grids come out uneven.
- **Many angles or frames of one object:** go 3D. Concept → image-to-3D → `uh render3d` from the
  game's camera (`pipeline.md` section 3). That is how 16 consistent headings × 5 animations were made
  for an AoE2 unit.
- **No text or logos** unless wanted. Put them in the negative prompt.

## Audio for engines

- Convert to what the engine loads:
  - `ffmpeg -i x.flac -ar 44100 x.wav` (XNA/tModLoader, most engines);
  - `ffmpeg -i x.wav -c:a libvorbis -q:a 5 x.ogg` (Minecraft, Godot, Unity);
  - trim silence first: `-af silenceremove=start_periods=1:start_threshold=-50dB`.
- SFX short (0.2 to 2 s) and loudness-normalised (`-af loudnorm=I=-16`) so they sit with the game's
  own sounds.
- Loops: ask for a loopable track and crossfade the ends; check the seam by looping it twice.
- `uh video beats music.wav` estimates tempo for cutting a showcase clip on the beat.

## Credits

List the models you used in the mod's README ("art generated locally with SDXL + <LoRA>, sounds with
Stable Audio Open"). `uh publish check` warns when a `*_manifest.jsonl` ships without such a line.
