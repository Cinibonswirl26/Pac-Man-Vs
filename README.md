# Pac-Man Vs. Online

A browser game in the style of Pac-Man Vs.: one Pac-Man sees the whole maze, three ghosts
see only what is near them. Play offline against CPUs, or host a room and play with
friends over the internet. Any seat nobody takes (or anyone who drops) is played by the computer.

This is an original reimplementation. It contains no code or assets from the original game.
If you own the game you can point the browser at your own disc image to use the original
logo, Pac-Man sprites and music.

## Run it

```
cd pacvs
npm install
npm start            # http://localhost:8080  (PORT=3000 npm start to change)
npm test
```

Open the page, enter a name, then:
- **Play offline** starts a match against three CPUs, no server connection needed.
- **Host an online room** gives a 4-letter code and an invite link (`/?room=ABCD`).
- Friends open the link (or the page and the code) and press Join. The host presses Start.

A match is four rounds. Each round a different player is Pac-Man, so everybody plays both roles.
Score by eating pellets, power pellets and frightened ghosts (Pac-Man), or by catching Pac-Man (ghosts).

Controls: arrow keys or WASD, swipe on touch screens, on-screen arrows on phones, or a gamepad.
`M` toggles music, `Esc` leaves the match.

## Playing with friends

The server has to be reachable by everyone. Either:
- run `npm start` on a machine with a public address or port forward, or
- run it locally and expose it with a tunnel (for example `cloudflared tunnel --url http://localhost:8080`
  or `ngrok http 8080`) and send friends the https link, or
- deploy the `pacvs` folder to any Node host (Render, Fly.io, Railway, a VPS). It is one process,
  needs no database, and uses a single WebSocket endpoint at `/ws` on the same origin as the page
  (wss automatically under https).

Rooms live in memory and disappear when everyone leaves.

## Using your own disc image

On the menu, pick the Pac-Man Vs. image (`.ciso`, `.iso` or `.gcm`, US release `PRJE01` tested).
The browser reads it locally and nothing is uploaded. It uses:
- the logo and the Pac-Man chomp frames from `PAC_title.szs`
- music streams from `AudioRes/Stream` (AFC ADPCM decoded in the browser)

The file is remembered in this browser's IndexedDB so you only pick it once. Do not commit game files to this repo.

## How it is built

| Path | What |
| --- | --- |
| `shared/sim.js` | Maze, movement, ghost/Pac-Man rules, fog-of-war views, CPU players. Used by server and browser. |
| `shared/match.js` | Countdown, four rounds, role rotation, scoring. Used by server and browser. |
| `server/server.js` | HTTP static host plus WebSocket rooms. The server is authoritative (30 Hz) and sends each player only what they may see, so ghosts cannot cheat by reading Pac-Man's position. |
| `client/` | UI, canvas renderer, input, sound, and `disc.js` (CISO/GCM reader, Yaz0, RARC, BTI textures, AST audio). |
| `test/` | Simulation, fog, match flow, WebSocket end-to-end, and a disc reader check (`node test/disc.test.js <image>`). |

Not implemented yet: the original 3D maps and characters (the original uses 3D models), the
original's other maze layouts, and its item/exchange mini-features. The maze here is a single original layout.
