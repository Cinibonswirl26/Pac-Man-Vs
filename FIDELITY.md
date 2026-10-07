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
| Stage 1 in 3D | The disc's stage model has its walls exactly where the maze data has them (every one of the 441 cells checked) | `test/j3d.test.js` |
| Ghost view camera | Looks north, 38 degrees down; a circle 252 px across on the 640 x 480 picture shows about 5.7 cells at the ghost | Rendered from the same cell and compared with the original's picture; pellet rows and wall edges line up |
| shared screen layout | The disc's `pac_game.blo` scaled by 640/608 in both directions and moved 2 px down; circles 252 px across centred at (145, 146), (495, 146) and (319, 330), first two ghosts by player number on top | Fitted against the original's picture: panels, counter, radar and score line up; circle centres and frame colours measured |
| Exchange screen | Four circles 140 px across, 152 px apart, LOSER / WINNER above, score bars and the points moved below | Measured on the original's picture after a catch |
| Ghost body | Disc model with its float animation, the player's skin (ghost_r/b/p/g), the frightened skin (ghost_yowari) and an invisible body for eaten ghosts (ghost_toumei) | Disc files; compared with the original's picture |

## Not measured (best guesses in this game)

- Points for eating a frightened ghost. Uses 200, 400, 800, 1,600 for consecutive ghosts.
- Speed of an eaten ghost's eyes and how long it takes to come back.
- Fruit details: how many pellets trigger it (here 6, then every 70), how long it stays (here 10 s), what Pac-Man scores for it (here 400), how much wider the ghost view gets (here 1.8 times) and for how long (here 10 s). I could not capture these in my recordings of the original.
- After the maze is cleared the game here starts a new round with the same Pac-Man.
- Whether a catcher can also win by stealing past the target. Here, any player who reaches the target wins at once.
- The other 12 stages. Only the first stage layout is read from the disc.
- The CPU players. The original's computer ghosts and Pac-Man are not documented, so these are new.
- How far a ghost can see. The circle here is 4.6 cells in every direction; the original's circle shows more to the north than to the south because of the camera angle.
- 3D lighting. The game sets its lights at run time. The light here was picked so the ghost bodies shade like the original's picture.
- The neon colours. The stage's neon has coloured sections (purple, yellow, green, red) that the game switches on during play. Here the neon stays the scrolling blue that the disc's material shows by default.
- The ghost eye animation (ghost.btp) is not played.
- Screen details drawn by the game's code rather than its layouts: the shape of the circles' tabs, the size and
  colour of the score digits in the player panels, how the exchange screen animates and when its arrow appears,
  and the order in which the results screen shows the ranking and then the winner. These were matched by eye
  to the original's pictures or guessed.
- The dotted bar next to Pac-Man's score in the player panel and the "COM" labels are not drawn.
