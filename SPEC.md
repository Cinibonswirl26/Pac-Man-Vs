# Rules of the original, read from its program

This is the rule book this game is built to. The numbers were read from the original's own program on the
player's disc (its executable, disassembled with decomp-toolkit and decompiled with angr and then again with Ghidra 11.3,
which read the same values), then checked live in an
emulator with a memory watch on the game's tables. Nothing from the disc is copied here: these are the rules and
values, with the address of the routine each one was read from so the reading can be repeated. The code in
`shared/sim.js` is written from this description, not from the original's code.

Units: the original keeps every position in **handheld pixels** (8 px to a cell, a cell's centre at +4, the maze one cell in from x = 0 and y = 0) and runs
its rules at **60 Hz**. A speed is a number of **frames per cell** (fpc): 16 fpc is 0.5 px per frame, 3.73 cells a
second. Angles are 16-bit (0x4000 a right angle). "Seat" is a controller port 0-3; "slot" is one of the four
ghost records; slot 4 is Pac-Man.

## Movement (routine at 0x8001E104, the per-frame step; 0x8001DC0C turning; 0x8001E79C per-player driver)

| Who / state | Frames per cell | px per frame | Source |
| --- | --- | --- | --- |
| Pac-Man, corridor clear | **16** | 0.5 | constant at 0x801A4DD4 |
| Pac-Man, after a pellet | **17 for the next 17 frames** (the window restarts on every pellet, so along a row of pellets he runs at 8/17 = 0.4706 px per frame throughout) | 0.4706 | pellet routine 0x80014A54 sets the window to 17; the step picks 17 fpc while it runs |
| Ghost, normal (any colour, woken stand-in too) | **16** | 0.5 | per-player field set to 16 (0x801A3134) by the turning routine |
| Ghost, frightened | **21** | 0.381 | constant at 0x801A4D84 |
| Ghost, eyes (eaten, flying home) | **10** | 0.8 | constant at 0x801A4DDC |
| Grey stand-in (not woken) | **24** | 0.333 | constant at 0x801A4DD8 |
| Ghost in the tunnel stretch | the state's value **x 1.25** (normal 20 fpc = 0.4 px) while on the tunnel row with x < 32 px or x > 128 px: the three visible cells at each end and the border cell (the maze sits one cell in from the program's x = 0); Pac-Man is never slowed there | | constant 1.25 at 0x801A4DA8, flag at 0x801A3130 |

Ghosts gain nothing on Pac-Man: both run 16 fpc. (The hair of extra ghost speed measured earlier came from
timing the console's 59.94 Hz frames against the handheld's 59.73 Hz frame counter.)

Progress between cells is a float that climbs by 8/fpc each frame; at 8 the mover snaps to the next cell. A turn
is accepted only while that progress is at most 3 px into the cell (0x8001DC0C), otherwise it is queued for the
next cell. The queued direction is dropped if the chosen cell is a wall. The tile codes that count as open floor
are 15 and 128-132; code 17 is open to Pac-Man only.

Ghost against ghost: the step routine carries a check that would stop a ghost moving to within 8 px of another
unless the distance is growing, but it is behind a flag at 0x801A40B4 that nothing in the program sets, so
ghosts pass through each other.

### The warp tunnel (0x8001E79C, and the tunnel timer in 0x8001EAF0; watched live)

The maze row is 21 cells wide in the program (a one-cell border round the 19 x 21 maze), and the ends wrap, so
there is in effect one hidden cell joining the two ends: the cell left of the first visible one is the cell right
of the last. Measured live, centre of the last visible cell on one side to the centre of the last visible cell on
the other:

- **Pac-Man: 32 frames.** Two cells at 16 frames per cell: when his next cell would be left of the border cell
  he is placed on the far border cell at once, his progress kept.
- **A ghost: 70 frames.** Two cells at 20 frames per cell (the x 1.25 tunnel factor) plus a 30-frame hold: on
  reaching the border cell it gets a 60-frame timer and walks on out of sight; when the timer reaches 30 it is
  set down on the far border cell's centre and walks in from there. (The earlier emulator timing of 70-71
  frames was this rule.)

## Pellets, fruit and scoring (0x80014274 pellet pickup; 0x80014A54; the round loop 0x8001EAF0)

| Rule | Value |
| --- | --- |
| Pellet | 10 points |
| Power pellet | 100 points on top of the pellet's 10 (110 in all), and every ghost not in the eyes state turns frightened |
| Frightened time | **600 frames** (10 s) when the Pac-Man seat's flag is set, **840 frames** (14 s) otherwise (table at 0x80146F00, one word per seat; see "open questions") |
| Blink | in the last 120 frames the frightened look toggles every 8 frames (bit 3 of the timer) |
| Ghost eaten | Pac-Man gets the chain value and the ghost's owner loses it (not below 0); the chain starts at 200 on each power pellet and **doubles per ghost, capped at 1600**; everything freezes for **30 frames** after each one |
| Fruit | A timer starts each round at 1080 + 60 x (random 0-19) frames, i.e. 18-37 s. When it reaches 480 the fruit appears in the middle of the maze (chime + line); at 0 it bursts (stars) and the timer restarts with a new random value, so a fruit shows **600-1740 frames (10-29 s) after the previous one went, for 480 frames (8 s)**, over and over |
| Fruit taken | 400 points to whoever reaches it; a ghost's view radius goes to 200 px for 720 frames (12 s), easing at 1.3 px per frame (so about 77 frames to grow); a popup "400"; the stars burst (30-frame freeze) |
| Maze cleared | popup 1600; Pac-Man gets **1600 if his score is still below the target**; if that puts him at or past the target the game ends, else a 240-frame (4 s) pause and a new round |
| Catch | the catcher gets 1600 and Pac-Man loses 1600, not below 0; a 60-frame freeze, then phase 6 for 180 frames (the amber picture and message), then the exchange |
| First Pac-Man | starts with 1600 |
| Game end | when a score reaches the target the end line plays and the results follow |

Contact is tested on the 3D positions (px units): **a squared distance below 4**, i.e. centres within 2 px, a
quarter cell. The same 2 px rule wakes a grey stand-in that a coloured ghost touches (0x8001EAF0), and says
which ghost Pac-Man ran into. Ghosts in the eyes state and grey stand-ins cannot catch; a frightened ghost is
eaten instead.

## Seats, stand-ins and their minds

Ghost slots are filled in seat order with the last human always in slot 3; empty slots are stand-ins (grey, no
owner). A stand-in is a computer mover (routine 0x8001D330): grey, it wanders (0x8001A2E0: straight on where it
can, random turns at junctions); frightened, it flees (0x80019540: away from Pac-Man along the axis with the
larger gap, never reversing); woken by a coloured ghost's touch it takes that colour and hunts
(0x8001B60C: straight for Pac-Man's cell; in a two-player game the stand-in in slot 2 aims 28 px, 3.5 cells,
ahead of him instead). Eyes follow a per-stage flow field home (0x80021DC0); on arrival the ghost is whole
again: a seat's ghost in its colour, a stand-in grey.

The handheld's picture (0x8001D5A4 builds the packet): each mover's x, y, a flags byte (direction, 64 = flashing
frightened look, 32 = eyes, 16 = frightened, colour x 4) and the slot. A grey stand-in and an eaten ghost are
both drawn as eyes.

The view radius a ghost sees in its circle: 100 px normally, 125 px when the seat's flag is clear (see below),
200 px while the fruit effect lasts.

## Announcer and sounds (sound IDs as the program calls them)

| Moment | ID |
| --- | --- |
| Pellet eaten | 0x1800 |
| Power pellet | 0x1815, then line 0x2821 |
| Fruit appears | chime 0x1809 + line 0x2805; fruit timed out: 0x1816 |
| Pellets left reach 10 / 25 / 50 / 100 | 0x2810 / 0x2813 / 0x2820 / 0x2820 (counted before the pellet being eaten is removed) |
| Ghost eaten, 1st / 2nd / 3rd+ in a chain | 0x2807 / 0x2806 / 0x2808 (with effects 0x1805 and 0x1803) |
| Catch, by seat colour 0-3 | 0x280A-0x280D |
| Maze cleared / target reached | 0x281F / 0x280E |
| Siren | one sequenced sound per stage, its parameter 8 set to the percentage of pellets left (0x80021D24), which is what raises the pitch as the maze empties |

## Open questions (being checked live)

- The per-seat flag at 0x80146F00: every seat had it set in the games watched (10 s of fright, the 100-unit
  view). The program's other branch (14 s, a 125-unit view) was never taken; what clears the flag is not known.
