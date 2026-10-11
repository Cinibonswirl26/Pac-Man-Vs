# Pac-Man Vs. Online

A browser game that follows the rules of Pac-Man Vs.: one Pac-Man sees the whole maze, three ghosts
see only what is near them, and whoever catches Pac-Man steals his points. Play alone against CPUs
or host a room for friends over the internet. Empty or dropped seats are played by the computer.

This is an original reimplementation. It contains no code or assets from the original game.
If you own the game, point the browser at your own disc image to use the original maze, logo,
Pac-Man sprites and music. [FIDELITY.md](FIDELITY.md) lists which rules were measured from the real
game and which are still guesses.

## Run it

```
cd pacvs
npm install
npm start            # http://localhost:8080  (PORT=3000 npm start to change)
npm test             # simulation, match flow, server (no disc needed)
DISC=/path/to/Pac-Man_Vs.ciso npm run test:disc   # checks the disc reader (optional)
npm run bench        # CPU skill benchmark
```

## How a match works

1. Choose the points needed to win: 7,000, 10,000 or 15,000.
2. A roulette picks the first Pac-Man. He starts with 1,600 points. Everyone else has 0.
3. Pac-Man eats pellets (10 points) and power pellets (110 points). A power pellet frightens the ghosts for
   10 seconds. They slow down and he can eat them for points.
4. If a ghost catches Pac-Man the round ends. That ghost **steals 1,600 points** from Pac-Man and
   **becomes Pac-Man** in the next round. The maze is reset each round.
5. The first player to reach the target score wins.

Fruit appears in the middle of the maze. A ghost that takes it gets 400 points and a wider view for a while.
Ghost players only see a circle around themselves. A minimap shows where the other ghosts are, and a
counter shows how many pellets are left. Pac-Man sees the whole maze.

## Playing

- **Single player**: choose whether you start as a ghost (against a CPU Pac-Man), as Pac-Man, or at random,
  plus a CPU skill and the points to win.
- **Online**: Host an online room gives a 4-letter code and an invite link (`/?room=ABCD`). Friends open the
  link and press Join. The host presses Start.
- **Changing roles**: each player's screen follows their role. Pac-Man gets the whole maze; ghosts get the
  ghost screen (with your disc: the original shared screen with every ghost's circle). When a person catches
  Pac-Man, everyone sees the exchange screen, then the catcher is asked to get ready (any key, a tap, the
  Ready button or a gamepad's A/Start), as on the original's exchange screen. The next round starts when
  they do, or by itself after 15 seconds. If the catcher has left, a CPU takes over and play goes on at once.
- Controls: arrow keys or WASD, swipe on touch screens, on-screen arrows on phones, or a gamepad.
  `M` toggles music, `Esc` leaves the match.
- **Arrangement levels**: the maze menu's last group holds levels that are not part of the original. They
  borrow mechanics from the 1996 arcade *Pac-Man Arrangement*: dash arrows that hurl whoever crosses them their way
  along the maze with momentum that fades, steering as usual, braked by the opposite direction and stopped by
  walls with a dizzy bonk (a dashing Pac-Man knocks ghosts dizzy instead of being caught), paired jump pads that fly
  you across the maze, and capsules that appear where the fruit would and that Pac-Man and ghosts alike can
  take (speed, a mirror clone, the pot, fast digestion, points). A ghost holding the red capsule dashes on its
  button (Space, J, a gamepad's A or the on-screen button) with a short cooldown, and one holding the pink capsule
  hops to a spot near Pac-Man with it. They sit on mazes your disc holds but the
  original never lists; the six original stages are untouched. See the end of `FIDELITY.md`.

## Playing with friends

**Find a game** on the menu is the quick match: the server puts you in an open room with whoever else is looking,
or opens one for you. With the box ticked (the default), the match starts a minute after the second player
arrives, or as soon as four are in, and empty seats go to computer players; untick it to wait for four people.
The first player in can also start early once a second one is there. Quick rooms play the built-in maze, so
nobody needs a disc. The room code still works, so friends can join a quick room too.

The server has to be reachable by everyone. Either:
- run `npm start` on a machine with a public address or port forward, or
- run it locally and expose it with a tunnel (for example `cloudflared tunnel --url http://localhost:8080`
  or `ngrok http 8080`) and send friends the https link, or
- deploy the `pacvs` folder to any Node host (Render, Fly.io, Railway, a VPS). It is one process,
  needs no database, and uses a single WebSocket endpoint at `/ws` on the same origin as the page
  (wss automatically under https).

Rooms live in memory and disappear when everyone leaves.

### Free: host from your own PC

Double-click `host/Play-Online-Windows.cmd` (Windows) or run `host/play-online-mac-linux.sh` (Mac, Linux). The
first run downloads a portable Node and Cloudflare's tunnel tool into `host/tools` (about 60 MB); then it starts
the server and prints a public `https://....trycloudflare.com` link. Send that link to your friends. The link lasts
while the window is open and changes each time you start. Nothing to sign up for.

### Free: Render.com

`render.yaml` at the repository root is a Render blueprint. Sign in to https://render.com with GitHub, choose
**New → Blueprint**, pick this repository, press **Apply**: you get `https://pacvs-xxxx.onrender.com`. The free
plan sleeps after 15 minutes without visitors and takes half a minute to wake on the next visit; rooms are lost
when it sleeps. No card needed.

### Deploying to Fly.io

The easy way is the GitHub Action in `.github/workflows/fly.yml`, which deploys every push of this folder:
1. Make a Fly.io account at https://fly.io (it asks for a card; the smallest machine is a couple of dollars a month).
2. On the Fly.io dashboard open **Tokens** (https://fly.io/dashboard/personal/tokens), create a token and copy it.
3. On the GitHub repository open **Settings → Secrets and variables → Actions → New repository secret**, name it
   `FLY_API_TOKEN`, paste the token.
4. Open the **Actions** tab, pick **Deploy to Fly.io**, press **Run workflow** (or just push a change).

The first run creates the app `pacvs-<your GitHub user>` and starts it; the game is then at
`https://pacvs-<your GitHub user>.fly.dev`. Every later push deploys again by itself.

By hand instead, with [flyctl](https://fly.io/docs/flyctl/) signed in: `cd pacvs && fly apps create NAME &&
fly deploy --app NAME --ha=false`. The config keeps one machine running at all times
(`auto_stop_machines = "off"`, `min_machines_running = 1`): rooms live in memory, so a stopped machine would drop
them and a second machine would split the players. The smallest shared machine is plenty for a few rooms.

## Using your own disc image

On the menu, pick your Pac-Man Vs. disc image (`.iso` or compressed `.ciso`; the US release was used).
The browser reads it locally and nothing is uploaded. It uses:
- the maze data for all 13 stages on the disc: exact walls and pellets. The menu lists the six stages the original's
  stage-select screen shows (Original Pac-Man, R.I.P. Park, Manic Manor, Haunted Hall, Frantic Forest, Panic Pier),
  then the seven other layouts found on the disc, which have no menu entry in the original. Those seven carry
  names of this project's own (Four-Hut Pier, Dusk Pier, Night Forest, Dusk Park, Spotlight Hall, Midnight Pier,
  Midnight Park).
- the logo and Pac-Man animation from `PAC_title.szs`
- music from `AudioRes/Stream` (AFC ADPCM decoded in the browser)
- the 3D models for the ghost's view: the stage models (`Map/PacField_1..13.bmd` with their texture scrolling),
  the ghost and Pac-Man with their animations and skins (`Model.szs`), the fruit and the pellet sprite.
  The ghost player's circle is drawn with these in WebGL, camera following the ghost as in the original.
- the shared screens from `Screen/PAC_game.szs`, `PAC_exchange.szs` and `PAC_results.szs`: ghost players get
  the original game screen (one 3D circle per ghost, the player panels, target score, pellet counter, radar,
  fruit window and scrolling background, drawn from the disc's layout, textures and font), and everyone
  sees the original exchange screen after a catch and the results screen at the end.

The file is remembered in this browser's IndexedDB so you only pick it once.
The sound lab (the link on the menu) lets you listen to every effect, announcer line and music stream on the disc,
choose which sound plays for each moment of the game, and give each stage its own music: one of the disc's streams
looping through its rounds, the original stage's treatment (start jingle, then the siren), or none. The choices
are kept in this browser.
When you host a room with the original maze selected, the host's browser sends the maze layout
(a 21 x 21 grid of characters, no graphics) to the server so everyone in the room plays the same board.
Do not commit game files to this repo.

## How it is built

| Path | What |
| --- | --- |
| `shared/sim.js` | Maze, movement, rules, fog-of-war views, CPU players. Used by server and browser. |
| `shared/match.js` | Roulette, rounds, point stealing, the target score. Used by server and browser. |
| `server/server.js` | HTTP static host plus WebSocket rooms. The server is authoritative (30 Hz) and sends each player only what they may see, so ghosts cannot read Pac-Man's position. |
| `client/` | UI, canvas renderer, input, sound, `disc.js` (disc image, archives, textures, streamed audio), `mazedata.js` (the maze data), `j3d.js` (J3D models and animations: BMD, BCK, BTK), `gx.js` (WebGL renderer that turns each of the game's materials into a shader), `view3d.js` (the ghosts' 3D view), `j2d.js` (BLO2 screen layouts and BFN fonts) and `screens.js` (the shared game screen, exchange and results screens). |
| `test/` | Simulation, match flow, WebSocket end-to-end, maze validation, disc reader and 3D model checks, AI benchmark. |

Not implemented: the original's Pac-Man screen, the title and rule-select screens, and the original's computer players.
