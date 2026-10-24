'use strict';
// The entry of the single-file build (host/build-exe.js). It first asks what to do (or reads it from the command
// line: --host, --lan, --join=<link>): host a game for friends over the internet, opening the port on the home router
// through UPnP; host for this Wi-Fi or network only, leaving the router alone; or join a friend's game, which only
// opens their link in the browser, so nobody opens a port they do not need. Hosting prints the links and opens the
// page; close the window to stop.
const { execFile } = require('child_process');
const os = require('os');
const https = require('https');
const readline = require('readline');
const { server, hostInfo } = require('../server/server.js');
const upnp = require('./upnp.js');
const mode = require('./mode.js');

const args = mode.parseArgs(process.argv.slice(2));
const PORT = args.port || +process.env.PORT || 8080;
const say = s => process.stdout.write(s + '\n');
const rule = () => say('='.repeat(64));
const tty = !!process.stdin.isTTY;   // started by a double-click or in a terminal: questions can be asked

/** This machine's own network address, for the link to use on the same Wi-Fi. */
function lanAddress() {
  for (const list of Object.values(os.networkInterfaces())) for (const i of list) if (i.family === 'IPv4' && !i.internal) return i.address;
  return 'localhost';
}
function openBrowser(url) {
  const cmd = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]] : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  try { execFile(cmd[0], cmd[1], () => {}); } catch (e) { /* no browser; the link is printed */ }
}
/** One line typed at the console, or null once the input is gone. One reader for the whole run, keeping lines
 * typed ahead of the question (a reader closed between questions would drop them). */
let rl = null, waiting = null; const typed = [];
function ask(question) {
  if (!rl) {
    rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.on('line', l => { if (waiting) { const w = waiting; waiting = null; w(l); } else typed.push(l); });
    rl.on('close', () => { rl = null; if (waiting) { const w = waiting; waiting = null; w(null); } });
  }
  process.stdout.write(question);
  return new Promise(resolve => { if (typed.length) resolve(typed.shift()); else waiting = resolve; });
}
/** No more questions: hand the console back, so Ctrl+C reaches the program again. */
function doneAsking() { if (rl) rl.close(); }
/** Keep the window open so what it says can be read, then quit. */
function holdThenExit(code) {
  if (!tty) return process.exit(code);
  ask('\nPress Enter to close.').then(() => process.exit(code));
}

/** The public address as the internet sees it, when the router does not say (one request, 2 s at most). */
function publicIp() {
  return new Promise(resolve => {
    const req = https.get('https://api.ipify.org', { timeout: 2000 }, res => {
      let b = ''; res.on('data', d => { b += d; }); res.on('end', () => resolve(/^\d{1,3}(\.\d{1,3}){3}$/.test(b.trim()) ? b.trim() : null));
    });
    req.on('timeout', () => { req.destroy(); resolve(null); }); req.on('error', () => resolve(null));
  });
}

let mapping = null, closing = false;
async function shutdown() {
  if (closing) return; closing = true;
  if (mapping) { say('Closing the port on the router...'); await Promise.race([mapping.remove(), new Promise(r => setTimeout(r, 3000))]); }
  process.exit(0);
}
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK']) { try { process.on(sig, shutdown); } catch (e) { /* not on this platform */ } }

/** Join a friend's game: open their link. Nothing runs on this PC and nothing is asked of the router. */
async function join(given) {
  let link = mode.joinLink(given);
  if (given && !link) say(` "${given}" does not look like a link.`);
  while (!link) {
    if (!tty) { say(' Start with --join=<the link your friend sent>.'); return holdThenExit(1); }
    const a = await ask(' Paste the link your friend sent (like http://203.0.113.7:8080/?room=ABCD) and press Enter: ');
    if (a === null) return process.exit(1);
    link = mode.joinLink(a);
    if (!link) say(' That does not look like a link: it needs their address, as the host\'s window printed it.');
  }
  say(''); rule(); say(` Opening ${link} in your browser.`); say(' Nothing is hosted from this PC and no port was opened.'); rule();
  openBrowser(link);
  holdThenExit(0);
}

/** Host a game: start the server, and when `internet`, ask the router to open the port. */
function host(internet) {
  server.on('error', e => {
    if (e.code === 'EADDRINUSE') say(`Port ${PORT} is already in use (another copy running?). Start with --port=8081 to use another.`);
    else say(`Could not start: ${e.message}`);
    holdThenExit(1);
  });
  server.listen(PORT, '0.0.0.0', async () => {
    const lan = `http://${lanAddress()}:${PORT}`;
    Object.assign(hostInfo, { on: true, port: PORT, local: `http://localhost:${PORT}`, lan, public: null, upnp: internet ? 'pending' : 'off', reason: '' });
    say(''); rule(); say(internet ? ' Pac-Man Vs. is hosting from this PC' : ' Pac-Man Vs. is hosting from this PC, for this network only'); rule();
    say(` You:                 http://localhost:${PORT}`);
    say(` Same Wi-Fi/network:  ${lan}   <- send this to friends on your network`);
    if (!internet) {
      say(' Internet:            not opened; nothing on your router was changed. For friends elsewhere, start again and choose 1.');
    } else {
      say(' Internet: asking your router to open the port (UPnP)...');
      try {
        mapping = await upnp.openPort(PORT, { desc: `Pac-Man Vs. ${PORT}` });
        const ip = mapping.external || await publicIp();
        Object.assign(hostInfo, { upnp: 'open', public: ip ? `http://${ip}:${PORT}` : null });
        if (ip) say(` Internet:            http://${ip}:${PORT}   <- send this to friends`);
        else say(` Internet:            port ${PORT} is open; your public address is what whatismyip.com shows, as http://<that address>:${PORT}`);
      } catch (e) {
        const why = e.reason === 'nodevice' ? 'no UPnP router answered' : e.message;
        Object.assign(hostInfo, { upnp: 'failed', reason: why });
        say(` Internet:            could not open the port automatically (${why}).`);
        say(`   To host over the internet anyway, forward TCP port ${PORT} to ${mapping ? mapping.local : lanAddress()} in your router's settings`);
        say(`   (often under "Port forwarding" or "Virtual server"), then send friends http://<your public address>:${PORT}.`);
        say('   Or use the tunnel script host/Play-Online-Windows.cmd from the game\'s source folder: it needs no router changes.');
      }
    }
    rule(); say(' Close this window to stop hosting. The first time, Windows may ask to allow this program through the firewall: allow it.'); rule();
    openBrowser(`http://localhost:${PORT}/?host=1`);   // straight into a hosted room; the page shows the links to send
  });
}

async function main() {
  let what = args.mode;
  if (!what) {
    if (!tty) what = 'internet';   // started by a script with nobody to ask: host, as the program always did
    else {
      say(''); rule(); say(' Pac-Man Vs.'); rule();
      for (const line of mode.MENU) say(line);
      while (!what) {
        const a = await ask(' Type 1, 2 or 3 and press Enter: ');
        if (a === null) return process.exit(1);
        what = mode.choose(a);
      }
    }
  }
  if (what === 'join') return join(args.link);
  doneAsking();
  host(what === 'internet');
}
main();
