# How closely this matches Pac-Man Vs.

The rules here were checked against the real game, played and recorded frame by frame from the
player's own copy. Nothing from the game is in this repository. This file says what was measured
and what is still a best guess.

## Measured from the original

| Rule | Value | How it was checked |
| --- | --- | --- |
| Maze (stage "Original Pac-Man") | 19 x 21 cells, mirror-symmetric, one tunnel row (row 10), ghost house in the middle with a 3-cell gate | Tile map stored in the game's data, compared with the in-game picture |
| Pellets | 172 small + 4 power = **176**. Power pellets at (0,2), (18,2), (0,16), (18,16) | Counted in the tile map, matches the on-screen counter at the start of a round |
| Start cells | Pac-Man (9,12); ghosts (6,6), (12,6), (9,8) | Sprite positions at round start |
| Pac-Man speed | **0.5 px per frame** = 3.73 cells per second | Sprite tracked over hundreds of frames |
| Ghost speed | **0.5 px per frame**, the same as Pac-Man | Straight runs of ghost sprites |
| Frightened ghost speed | **0.375 px per frame** (3/4 of normal) = 2.80 cells per second | Straight runs during the effect |
| Frightened time | **10 s** (598 frames). Last 2 s the ghosts blink every 8 frames | Sprite tile changes, frame by frame |
| Pellet | 10 points | Score before and after |
| Power pellet | 110 points | Score before and after, pellet counter 167 -> 166 |
| Player colours | P1 red, P2 blue, P3 pink, P4 green | In-game screens |
| Goal | A target score is chosen before the match (7,000 shown first) | "Choose a score" screen |
| First Pac-Man | Picked by a roulette. Starts with **1,600** points | Scoreboard at round start, three separate matches |
| Catching Pac-Man | The round ends at once. The catcher **steals 1,600** points from Pac-Man (he keeps the rest, e.g. 1,610 -> 10) and **becomes the next Pac-Man** | Loser/winner screen: -1,600 / +1,600 |
| Hand-over | After the exchange screen the next round waits for the new Pac-Man to press Start | The exchange screen asks the new Pac-Man to press Start, with an arrow at them. Here the new Pac-Man presses a key or Ready; the 15-second limit is this game's own |
| Round reset | Pellets back to 176, everyone back to their start cells | Next round |
| Round timer | None found. A round ran over 80 s with no clock | HUD and play |
| Ghost view | A circle around each ghost, a minimap of the ghosts and a pellet counter. All ghost players watch the same screen, so each sees every ghost's circle | shared screen |
| Fruit (from published descriptions, plus one 400-point score seen on a ghost) | Appears in the middle of the maze once enough pellets are gone. Pac-Man or a ghost can take it. A ghost gets 400 points and a wider view for a while | Wikipedia and reviews; a ghost's 400 points seen in the emulator |
| Clearing the maze | Pac-Man gets a 1,600 bonus | Wikipedia |
| Stages | The disc holds 13 mazes, one for each of its 13 stage models, in the same order. Walls and pellets are read from the maze data; on every model the pellet cells sit on a walkable surface at one height | `test/mazedata.test.js`, `test/j3d.test.js` (the 3D models drawn over the maze data) |
| Ghost blink | The eyes cycle through five textures once every 64 frames (open, half, closed, half, open) | The disc's texture-pattern animation |
| Ghost view camera | Looks north, 38 degrees down; a circle 252 px across on the 640 x 480 picture shows about 5.7 cells at the ghost | Rendered from the same cell and compared with the original's picture; pellet rows and wall edges line up |
| shared screen layout | The disc's `pac_game.blo` scaled by 640/608 in both directions and moved 2 px down; circles 252 px across centred at (145, 146), (495, 146) and (319, 330), first two ghosts by player number on top | Fitted against the original's picture: panels, counter, radar and score line up; circle centres and frame colours measured |
| Exchange screen | Four circles 140 px across, 152 px apart, LOSER / WINNER above, score bars and the points moved below | Measured on the original's picture after a catch |
| Fruit pickup zoom | When a ghost takes the fruit its circle's picture pulls back to about 1.6 times the reach (by the measured area of the ghost in the circle), easing out over about 1.1 s (67 frames of the 59.7 Hz clock), with a "400" floating over the ghost and white sparkles for about 0.3 s. It stayed zoomed for the 8 s I recorded | Frame by frame in the emulator |
| Frightened look | Scene dims; ghosts turn into smaller dark-blue ghosts with a wavy mouth and no big eyes; cyan sparkles trail them; in the last 2 s they blink out; at the end pink rings burst and the ghost returns | Frame by frame in the emulator (blink timing roughly 0.15 s on and off) |
| Pac-Man's trail | A wide flat ribbon on the floor (nearly a full corridor wide) in the Pac-Man player's colour, near-opaque, paler next to Pac-Man and fading at its tail; ghosts see it inside their circles | Seen in the emulator in all circles; the length is a guess (2 s here) |
| Ghost body | Disc model with its float animation, the player's skin (ghost_r/b/p/g), the frightened skin (ghost_yowari) and an invisible body for eaten ghosts (ghost_toumei) | Disc files; compared with the original's picture |

## Not measured (best guesses in this game)

- Points for eating a frightened ghost. Uses 200, 400, 800, 1,600 for consecutive ghosts.
- How long Pac-Man's trail is, and how it ends when he is caught.
- Speed of an eaten ghost's eyes and how long it takes to come back.
- Fruit details: how many pellets trigger it (here 6, then every 70), how long it stays (here 10 s), what Pac-Man scores for it (here 400), how long the wider ghost view lasts (here 10 s; the 1.6 times is measured). I could not capture these in my recordings of the original.
- After the maze is cleared the game here starts a new round with the same Pac-Man.
- Whether a catcher can also win by stealing past the target. Here, any player who reaches the target wins at once.
- Which maze number each menu entry plays. The stage-select screen shows six small maps with names like `DpDay`, `HhDay`, `HhPnch`, `Or`, `UwDay` and `UwEvn`. I matched them to maze numbers by shape and power-pellet count (Original = 1, R.I.P. Park = 4, Manic Manor = 8, Haunted Hall = 13, Frantic Forest = 6, Panic Pier = 5). The links between the six names and these maps are a best match, not read from the game.
- The other seven mazes (2, 3, 7, 9, 10, 11, 12) have no menu entry or picture in the original and may be unused or test layouts. Their names are this project's own.
- Start cells for all mazes except the original. The data holds no start positions. Pac-Man starts in the centre column below the house, the ghosts above it and beside it, the same arrangement as the original.
- The pier stages: the planks are the corridors and the water between them is the wall. Walls here follow the maze data, not the water.
- The CPU players. The original's computer ghosts and Pac-Man are not documented, so these are new.
- How far a ghost can see. The circle here is 4.6 cells in every direction; the original's circle shows more to the north than to the south because of the camera angle.
- 3D lighting. The game sets its lights at run time. The light here was picked so the ghost bodies shade like the original's picture.
- The neon colours. The stage's neon has coloured sections (purple, yellow, green, red) that the game switches on during play. Here the neon stays the scrolling blue that the disc's material shows by default.
- Screen details drawn by the game's code rather than its layouts: the shape of the circles' tabs, the size and
  colour of the score digits in the player panels, how the exchange screen animates and when its arrow appears,
  and the order in which the results screen shows the ranking and then the winner. These were matched by eye
  to the original's pictures or guessed.
- The dotted bar next to Pac-Man's score in the player panel and the "COM" labels are not drawn.
