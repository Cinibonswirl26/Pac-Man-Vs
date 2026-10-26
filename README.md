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
cd pacvs            # your clone of this repository
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
  Pac-Man, everyone sees the exchange screen count the points across, then the catcher presses Start (any key,
  a tap, or a gamepad's A/Start) on the handheld's "Press START!" screen, as on the original. The circles then fly
  to their places and the next round starts; by itself after 15 seconds if nobody presses. A computer player
  presses Start by itself.
- Controls: arrow keys or WASD; on touch screens, swipe anywhere on the game (a swipe can bend round a corner without lifting the finger; a tap hops or dashes) or use the on-screen arrows; or a gamepad.
  `M` toggles music, `F` (or the button in the top-right corner, or a gamepad's Select) toggles fullscreen,
  `Esc` leaves the match (or fullscreen first).
- **Arrangement levels**: the maze menu's last group holds levels that are not part of the original. They
  borrow mechanics from the 1996 arcade *Pac-Man Arrangement*: dash arrows that hurl whoever crosses them their way
  along the maze with momentum that fades, steering as usual, braked by the opposite direction and stopped by
  walls with a dizzy bonk (a dashing Pac-Man knocks ghosts dizzy instead of being caught), paired jump pads that fly
  you across the maze, and capsules that appear where the fruit would and that Pac-Man and ghosts alike can
  take (speed, a mirror clone, the pot, fast digestion, points). A ghost holding the red capsule dashes on its
  button (Space, J, a gamepad's A or the on-screen button) with a short cooldown, and one holding the pink capsule
  hops to a spot near Pac-Man with it. They sit on mazes your disc holds but the
  original never lists (and on the built-in maze), drawn in a look of their own after the arcade's first world: walls
  of glossy toy blocks in red, yellow, green and blue on a purple woven floor, in the ghosts' 3D views and on Pac-Man's
  handheld. That art is made in code (`client/blockstage.js`); nothing is taken from the arcade game. The six original
  stages are untouched. See the end of `FIDELITY.md`. The rules of the original game itself are written up in `SPEC.md`, read from its program on the player's own disc.

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
- deploy the `pacvs` folder to any Node host (Render, Railway, a VPS). It is one process,
  needs no database, and uses a single WebSocket endpoint at `/ws` on the same origin as the page
  (wss automatically under https).

Rooms live in memory and disappear when everyone leaves.

### Free: one Windows program, no setup

`PacManVs.exe` is the whole server in one file. Double-click it and it asks what you want to do:

1. **Host a game for friends over the internet.** It starts hosting, asks your router to open the port through
   UPnP, prints three links (you, same Wi-Fi, internet) and opens the page. Send friends the internet link,
   `http://<your public address>:8080`. Close the window to stop; the port is closed again on the way out. If your
   router has UPnP switched off it says so and tells you which port to forward by hand (or use the tunnel script
   below, which needs no router changes). The links are plain http on your own address: use it for games with
   people you know.
2. **Host a game on this Wi-Fi or network only.** The same, but the router is left alone: only people on your
   network can join, with the same-Wi-Fi link.
3. **Join a friend's game.** Paste the link they sent and it opens in your browser. Nothing is hosted from your PC
   and no port is opened; pasting the link into a browser yourself does the same.

When hosting, allow the program through the Windows firewall when asked. It opens your browser on the game with a
note to host: load your disc, pick a maze and press **Host an online room**. The lobby then shows a **Hosting from
this PC** box with ready links to send, one for friends over the internet (the public address your router reported)
and one for the same Wi-Fi, each with a Copy button; **Copy invite link** uses the internet one too. If the router
would not open the port, the box says so and how to forward it by hand. Windows may say the program is from an
unknown publisher (it is not code-signed): choose "More info", then "Run anyway". From a shortcut or script,
`--host`, `--lan` or `--join=<link>` skip the question.

Getting the file: the GitHub Action in `.github/workflows/exe.yml` builds it on every push of this folder (and on
demand from the Actions tab); open the run and download **PacManVs-exe**. Or build it yourself with
`npm install` then `npm run build:exe` (writes `host/dist/PacManVs.exe`; on Mac or Linux it downloads the matching
Windows Node once). The file packs only this folder's page files and the server; nothing from any disc or
cartridge is in it, players still bring their own copy in the browser. `--port=8081` starts on another port.

### The Android app

`PacManVs.apk` is the game's page wrapped as a phone app: full-screen landscape, the disc picked from the phone's
files with the page's own button. It opens on one question:

- **Host a game on this Wi-Fi.** The room server runs on the phone (the same code the PC's program runs, inside
  the page), and the app's own small web server lets friends on the same Wi-Fi in: the lobby shows a
  `http://<the phone's address>:8080/?room=CODE` link to send, which they open in a browser or type into their
  app's Game server box. Nothing on the router changes, so it is for people on the same network (a phone's hotspot
  counts); keep the app open on the hosting phone, since the game runs there.
- **Join a friend's game.** The menu's **Game server** box takes the address a host's window printed, or a pasted
  room link, which fills the room code in too. It then joins any of the servers above.

The GitHub Action in `.github/workflows/apk.yml` builds it on every push of the page files
and attaches **PacManVs-apk** to the run; or build it yourself with the Android SDK: `gradle -p android
assembleDebug` (writes `android/app/build/outputs/apk/debug/app-debug.apk`). It is signed with a debug key,
so the phone asks once to allow installs from your browser or file manager. The app packs only this folder's
page files, nothing from any disc or cartridge.

### Free: host from your own PC with a tunnel

Double-click `host/Play-Online-Windows.cmd` (Windows) or run `host/play-online-mac-linux.sh` (Mac, Linux). The
first run downloads a portable Node and Cloudflare's tunnel tool into `host/tools` (about 60 MB); then it starts
the server and prints a public `https://....trycloudflare.com` link. Send that link to your friends. The link lasts
while the window is open and changes each time you start. Nothing to sign up for.

### Free: Render.com

`render.yaml` at the repository root is a Render blueprint. Sign in to https://render.com with GitHub, choose
**New → Blueprint**, pick this repository, press **Apply**: you get `https://pacvs-xxxx.onrender.com`. The free
plan sleeps after 15 minutes without visitors and takes half a minute to wake on the next visit; rooms are lost
when it sleeps. No card needed.

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
  sees the original exchange screen after a catch (with its sunburst and streaks run from the disc's particle
  file, `Effect/pacman_particle00.jpc`) and the results screen at the end.

The file is remembered in this browser's IndexedDB so you only pick it once.
The sound lab (the link on the menu) lets you listen to every effect, announcer line and music stream on the disc,
choose which sound plays for each moment of the game, and give each stage its own music: one of the disc's streams
looping through its rounds, the original stage's treatment (start jingle, then the siren), a different Pac-Mania
track each round, or none. Untouched, each stage plays what the original plays on it (heard from the game itself:
Panic Pier Pac-Mania track 2, Frantic Forest track 3, R.I.P. Park track 6, Manic Manor track 7, Haunted Hall the
Arrangement track, the Original stage its siren). The choices are kept in this browser.
When you host a room with the original maze selected, the host's browser sends the maze layout
(a 21 x 21 grid of characters, no graphics) to the server so everyone in the room plays the same board.
Do not commit game files to this repo.

## How it is built

| Path | What |
| --- | --- |
| `shared/sim.js` | Maze, movement, rules, fog-of-war views, CPU players. Used by server and browser. |
| `shared/match.js` | Roulette, rounds, point stealing, the target score. Used by server and browser. |
| `server/server.js` | HTTP static host plus WebSocket rooms. The server is authoritative (30 Hz) and sends each player only what they may see, so ghosts cannot read Pac-Man's position. |
| `client/` | UI, canvas renderer, input, sound, `disc.js` (disc image, archives, textures, streamed audio), `mazedata.js` (the maze data), `j3d.js` (J3D models and animations: BMD, BCK, BTK), `gx.js` (WebGL renderer that turns each of the game's materials into a shader), `view3d.js` (the ghosts' 3D view), `blockstage.js` (the Arrangement levels' block world, made in code), `j2d.js` (BLO2 screen layouts and BFN fonts), `jpa.js` (the particle file and a small particle simulator) and `screens.js` (the shared game screen, exchange and results screens). |
| `test/` | Simulation, match flow, WebSocket end-to-end, maze validation, disc reader and 3D model checks, AI benchmark. |

Not implemented: the original's Pac-Man screen, the title and rule-select screens, and the original's computer players.
