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
| Catch | the catcher gets 1600 and Pac-Man loses 1600, not below 0; a 60-frame freeze, then phase 6 for 180 frames (the amber picture and message), then the exchange screen (below) |
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

## Hand-over, slots and the handheld (0x80026114; 0x8001D5A4)

After a catch the catcher's seat takes slot 3, the slot that always belongs to whoever is Pac-Man, and the old
Pac-Man's seat takes the catcher's old slot: the slot table swaps those two entries, so every other circle stays
where it was. The scores the panel shows are a second copy that is kept in step for pellets, fruit and eaten
ghosts but not for the catch, which only the exchange screen's count carries across; the handheld gets each
seat's score capped at 99,990 and a 400/200/1600 popup value in hundreds.

The packet to the handheld (one record per mover) holds the rounded x and y, a flags byte and the slot: the
direction in the low bits, 0x10 frightened, 0x20 eyes (an eaten ghost or a grey stand-in), 0x40 the hidden
ghost of the Pac-Man seat or the frightened flash (every 8 frames through the last 120), the colour x 4; on
Pac-Man's own record 0x20 says the fruit is showing.

## Announcer and sounds

The announcer's sound IDs resolve through the disc's audio init table (its instrument bank 2, one instrument per
ID, each holding one wave or two alternates as key regions) to the narration bank's waves, numbered 0-35 as the
sound lab lists them. Which moments call which ID was read from the round loop and the pickup routine:

| Moment | ID | Line(s) |
| --- | --- | --- |
| Round start, after the start jingle / when the circles have zoomed in and the movers set off | 0x2827 / 0x2828 | 32 Ready / 31 Go |
| Power pellet (every one) | 0x2821 | 0 or 1 (alternates); 2 and 3 are on an ID never called |
| Fruit appears / Pac-Man takes it / a ghost of colour 0-3 takes it | 0x2805 / 0x2819 / 0x2801-0x2804 | 8 or 9 / 26 or 27 / 4-7 |
| Ghost eaten, chain value 200 / 400 / 800 and 1600 | 0x2806 / 0x2807 / 0x2808 | 10 / 11 / 12 |
| Pellets left reach 100 and 50 / 25 / 10 (counted before the pellet being eaten is removed) | 0x2820 / 0x2813 / 0x2810 | 33 or 34 / 20 / 18 |
| Leader within 1,000 / 500 of the target (each once, by a high-water mark) | 0x281A / 0x281B | 28 / 29 |
| Catch, by the catcher's colour 0-3 | 0x280A-0x280D | 13-16 |
| Maze cleared / a score reaches the target | 0x280E / 0x281F | 17 / 30 |
| Champion, by colour 0-3 / title | 0x2815-0x2818 / 0x2829 | 22-25 / 35 |

So there are no timed shouts: "Go go go!" and "You can do it!" are the two takes behind the 100- and 50-pellet
calls. The "ten pellets left" and "fruit appeared" alternate takes (19, 9) sit behind the same IDs as their
twins. The effects (bank 1) are matched by ear in the sound map; the loops are exclusive: the eyes siren while
any ghost flies home, else the frightened loop while any is frightened, else the siren, a sequenced sound per
stage whose parameter 8 is set to the percentage of pellets left (0x80021D24), which raises its pitch.

### The round's clock (0x800231C4 and the round loop)

The start jingle plays first; when it ends (or after 360 frames at most) the round is in play but held: "Ready"
sounds and the circles zoom in from 256 to 100 units at 1.3 a frame (120 frames). Then "Go", the siren starts
and the movers set off. A catch: 60 frames of standstill, then 180 frames of the amber picture (phase 6), then
the next scene. A cleared maze: 240 frames, then the next round. A score at or past the target ends play at
once (the movers stop, the end line plays).

## Exchange screen (0x80022EC8 the count and ready state, 0x8002386C after Start, 0x80026114 its entry)

Watched live with a memory watch on its state, every frame logged, and compared still by still. Frames are counted
from the moment the screen comes up (`f`), and after Start from the press (`L`). Positions are TV pixels.

| When | What happens |
| --- | --- |
| Contact | 60 frames of standstill, then the amber picture (phase 6) for 180 frames, going to black over its last 15: 240 frames in all |
| f 0-26 | the screen fades in from black; the target box stays up throughout, and through the hand-over that follows |
| f 0-60 | nothing moves |
| f 60 on | the shown scores step 10 points a frame towards the new ones (the loser's down, the winner's up) |
| count done | the -steal / +steal texts fade out at 4/255 a frame (64 frames) |
| ready (f = 60 + steal/10 + 64) | the state byte goes 4 then 2: the effects start (particle emitters 14 and 15 at the winner's circle, 11 at the loser's), the tune starts, the handheld icon, arrow and message fade in at 4/255 a frame, and Start (A or START, 0x900) on the handheld counts from here |
| ready + 64 | the icon slides 4 px a frame from the loser's ring x + 28 to the winner's ring x + 12; when it gets there the handheld leaves "look at the TV" for the next round's maze and "Press START!" |
| Start, L 0 | the state byte goes 3; the start jingle starts; the effects stop; the two circles that swap go dark and fade back in at 4/255 a frame with their pictures swapped |
| L 90 | the new Pac-Man's circle shrinks into the icon (to its x + 72, y 368, size 0) over 60 frames; the labels, bars and message fade at 4/255 a frame |
| L 150 | the arrow and icon slide down 8 px a frame |
| L 180 | the other circles fly to the game screen's circles (top-left corners 20,20 / 368,20 / 194,208, 252 across) over 60 frames, each to its ghost slot in the coming round |
| L 240 | the circles fade 6/255 a frame; their P1 / COM tags stay |
| jingle's end (or 360 frames) | the game screen, zoomed out; "Ready" and the zoom-in |

Layout: circles 144 across at x 20 + 152 n, top 140, in the panel's row order; portrait inset 18; tag 38 x 25 at
(+53, +56) from the centre; LOSER / WINNER 144 x 52 at y 96; score bars 144 x 40 at y 288; points moved centred at
y 350; handheld icon 120 x 69 at y 343; arrow 115 x 35 at y 360 centred under the loser, its picture pointing left
and mirrored when the winner is to the right; message 588 x 37 at (26, 428), alpha 159 - 96 cos(2 pi (f - 90) / 120).
(This game draws a plain handheld and its own wording for the icon and the message: the disc's pictures of them
show and name a particular console.)
Each circle wears its seat's colour, the loser's too; the loser's Pac-Man portrait is darkened to 0xA0. A catch
that reaches the target counts the points across and goes to the results, with no icon, arrow or tune.

The effects (particle file `pacman_particle00.jpc`, emitters started at the circles' centres in the program's
608 x 448 layout space): 14 and 15 are the same ray burst, 15 starting 45 frames later. Each burst puts 12 rays on a
circle of radius 40, one per division, every 91 frames; each ray points out from the centre and lives 91 frames
while a spin field turns them 0.006 rad a frame, so the second emitter's rays fall between the first's. Their colour
runs from white (the texture's bright end, at the centre) to yellow. 11 is a steady drizzle of thin billboards on an
oval band round the loser's circle (spawn rate key-framed 0.1 to 0.7 a frame, looping every 30 frames), falling 1
unit a frame for 45-90 frames, light blue to cyan.

The handheld meanwhile: from the start of the exchange a blue screen (palette 3, colour 6) saying "LOOK AT THE TV
SCREEN !", with a TV picture that blinks 32 frames on, 32 off over a still arrow; at the icon's arrival the next
round's maze, panel and blinking "Press START!"; after Start the movers on their start cells until Go.

Sound and music. The exchange state byte (0x801A3184) drives the music; the disc's audio table lists the
streams in order (0 `pacmanBGM00`, 1 `Pac_Arr_Clear`, 2 `Pac_Opening_Comp`, 3 `pacmaniaBGM02`, 4 `BGM03`, 5 `BGM06`,
6 `BGM07`, 7 `Pac_Arr_bgm02`, 8 `Pac_Op_loop73`, 9 `pacmaniaBGM05`) and the program asks for 0xC0000000 + n.

| When | Sound |
| --- | --- |
| Contact | the knock and the catcher's "Excellent" (0x280A-D); the playing loop is faded over 60 frames |
| The amber picture and the count | silence. The count asks for effect 0x1819 every 8th frame while a score still moves, but the effect bank (instruments 0x00-0x12) has none by that number, and the recording is silent |
| Ready | stream 9, `pacmaniaBGM05` (4.05 s, looped), until Start |
| Start | starting stream 0, the start jingle (4.6 s), stops the tune at once; the jingle runs under the hand-over |
| Jingle's end | "Ready" (0x2827), the zoom-in, then "Go" (0x2828) and the siren |

## Open questions (being checked live)

- The per-seat flag at 0x80146F00: every seat had it set in the games watched (10 s of fright, the 100-unit
  view). The program's other branch (14 s, a 125-unit view) was never taken; what clears the flag is not known.
