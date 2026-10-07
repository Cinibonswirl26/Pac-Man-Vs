# How closely this matches Pac-Man Vs.

The rules here were checked against the real game, run in an emulator with the GBA program from the
player's own disc. Nothing from the game is in this repository. This file says what was measured
and what is still a best guess.

## Measured from the original

| Rule | Value | How it was checked |
| --- | --- | --- |
| Maze (stage "Original Pac-Man") | 19 x 21 cells, mirror-symmetric, one tunnel row (row 10), ghost house in the middle with a 3-cell gate | Tile map stored in the GBA program, compared with the in-game picture |
| Pellets | 172 small + 4 power = **176**. Power pellets at (0,2), (18,2), (0,16), (18,16) | Counted in the tile map, matches the on-screen counter at the start of a round |
| Start cells | Pac-Man (9,12); ghosts (6,6), (12,6), (9,8) | Sprite positions at round start |
| Pac-Man speed | **0.5 px per frame** = 3.73 cells per second | Sprite tracked over hundreds of frames |
| Ghost speed | **0.5 px per frame**, the same as Pac-Man | Straight runs of ghost sprites |
| Frightened ghost speed | **0.375 px per frame** (3/4 of normal) = 2.80 cells per second | Straight runs during the effect |
| Frightened time | **10 s** (598 frames). Last 2 s the ghosts blink every 8 frames | Sprite tile changes, frame by frame |
| Pellet | 10 points | Score before and after |
| Power pellet | 110 points | Score before and after, pellet counter 167 -> 166 |
| Player colours | P1 red, P2 blue, P3 pink, P4 green | TV and GBA screens |
| Goal | A target score is chosen before the match (7,000 shown first) | "Choose a score" screen |
| First Pac-Man | Picked by a roulette. Starts with **1,600** points | Scoreboard at round start, three separate matches |
| Catching Pac-Man | The round ends at once. The catcher **steals 1,600** points from Pac-Man (he keeps the rest, e.g. 1,610 -> 10) and **becomes the next Pac-Man** | Loser/winner screen: -1,600 / +1,600 |
| Round reset | Pellets back to 176, everyone back to their start cells | Next round |
| Round timer | None found. A round ran over 80 s with no clock | HUD and play |
| Ghost view | A circle around each ghost, a minimap of the ghosts and a pellet counter | TV screen |
| Fruit (from published descriptions, plus one 400-point score seen on a ghost) | Appears in the middle of the maze once enough pellets are gone. Pac-Man or a ghost can take it. A ghost gets 400 points and a wider view for a while | Wikipedia and reviews; a ghost's 400 points seen in the emulator |
| Clearing the maze | Pac-Man gets a 1,600 bonus | Wikipedia |

## Not measured (best guesses in this game)

- Points for eating a frightened ghost. Uses 200, 400, 800, 1,600 for consecutive ghosts.
- Speed of an eaten ghost's eyes and how long it takes to come back.
- Fruit details: how many pellets trigger it (here 6, then every 70), how long it stays (here 10 s), what Pac-Man scores for it (here 400), how much wider the ghost view gets (here 1.8 times) and for how long (here 10 s). I could not capture these in the emulator: it ran slower than real time and the game kept stalling.
- After the maze is cleared the game here starts a new round with the same Pac-Man.
- Whether a catcher can also win by stealing past the target. Here, any player who reaches the target wins at once.
- The other 12 stages. Only the first stage layout is read from the disc.
- The CPU players. The original's computer ghosts and Pac-Man are not documented, so these are new.
- The ghost view radius and the camera (the original is a 3D view).
