# Measuring the original

These notes describe how the numbers in [FIDELITY.md](../FIDELITY.md) were obtained. You need your own
disc image of Pac-Man Vs. and a GBA BIOS dump from your own console. Neither is part of this repository.

## Setup

1. Build Dolphin (commit `1ab733d`, headless) with `dolphin-gba-dump.patch` applied. The patch adds a hook that
   saves what the emulated GBA is showing and the GBA's memory.
2. Put your GBA BIOS at `<user dir>/GBA/gba_bios.bin`.
3. Configure ports 1 to 3 as GameCube controllers and port 4 as an emulated GBA ("GBA (Integrated)").
   Controllers can be driven from named pipes (Dolphin's `Pipe` input device), which makes scripted play possible.
4. Run with `GBA_DUMP_DIR=/some/dir`. Run under a virtual display (`Xvfb`) and use `LIBGL_ALWAYS_SOFTWARE=1`
   if there is no GPU. The game asks for the GBA in socket 4, then you can start a match from the menus.

## What the hook writes (into `GBA_DUMP_DIR`)

| File | Contents |
| --- | --- |
| `gba4.raw` | The latest GBA frame: 8 bytes frame number, then 240 x 160 pixels as 32-bit XBGR. |
| `gba4_<n>.raw` | The same, one file per frame, while a file named `RECORD` exists. |
| `gba4.log` | While a file named `LOG` exists: per frame the frame number, sprite table (1 KB), palette (1 KB) and IWRAM (32 KB). |
| `gba4_mem_<n>.bin` | While a file named `MEM` exists: frame number, EWRAM (256 KB), IWRAM, sprite table, palette. |

The frame number counts GBA frames, which run at 59.7275 per second of emulated time. Use it as the clock.
The emulation may run slower than real time on a small machine, so wall-clock time is not a valid measure.

## How the main numbers were found

- **Speeds**: sprite positions from `gba4.log` over hundreds of frames. Pac-Man and normal ghosts move 0.5 px per
  frame (8 px per cell), frightened ghosts 0.375 px per frame.
- **Frightened time**: the ghost sprite tile and palette change when the power pellet is eaten (frame 3595) and change back
  598 frames later, with blinking from 120 frames before the end.
- **Maze**: the GBA keeps a 32-entry-wide table of 16-bit tile numbers. It was found by searching RAM for the
  known pellet layout and then in `packman.bin` itself. Tile 30 is a pellet, 31 a power pellet.
- **Points and the catch rule**: read from the scoreboard on the TV screen before and after events.

Python helpers used for the analysis are short and are not included. The formats above are enough to write them.
