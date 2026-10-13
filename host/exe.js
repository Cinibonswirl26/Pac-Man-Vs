'use strict';
// The entry of the single-file build (host/build-exe.js): starts the game server, opens the port on the home router
// through UPnP so friends can join over the internet, prints the links and opens the page. Close the window to stop.
const { execFile } = require('child_process');
const os = require('os');
const https = require('https');
const { server, hostInfo } = require('../server/server.js');
const upnp = require('./upnp.js');

const argPort = (process.argv.find(a => /^--port=\d+$/.test(a)) || '').split('=')[1];
const PORT = +argPort || +process.env.PORT || 8080;
const say = s => process.stdout.write(s + '\n');
const rule = () => say('='.repeat(64));

/** This machine's own network address, for the link to use on the same Wi-Fi. */
function lanAddress() {
  for (const list of Object.values(os.networkInterfaces())) for (const i of list) if (i.family === 'IPv4' && !i.internal) return i.address;
  return 'localhost';
}
function openBrowser(url) {
  const cmd = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]] : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  try { execFile(cmd[0], cmd[1], () => {}); } catch (e) { /* no browser; the link is printed */ }
}
/** Keep the window open so an error can be read, then quit. */
function holdThenExit(code) {
  say('\nPress Enter to close.');
  try { process.stdin.resume(); process.stdin.once('data', () => process.exit(code)); } catch (e) { setTimeout(() => process.exit(code), 30000); }
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

server.on('error', e => {
  if (e.code === 'EADDRINUSE') say(`Port ${PORT} is already in use (another copy running?). Start with --port=8081 to use another.`);
  else say(`Could not start: ${e.message}`);
  holdThenExit(1);
});
server.listen(PORT, '0.0.0.0', async () => {
  const lan = `http://${lanAddress()}:${PORT}`;
  Object.assign(hostInfo, { on: true, port: PORT, local: `http://localhost:${PORT}`, lan, public: null, upnp: 'pending', reason: '' });
  say(''); rule(); say(' Pac-Man Vs. is hosting from this PC'); rule();
  say(` You:                 http://localhost:${PORT}`);
  say(` Same Wi-Fi/network:  ${lan}`);
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
  rule(); say(' Close this window to stop hosting. The first time, Windows may ask to allow this program through the firewall: allow it.'); rule();
  openBrowser(`http://localhost:${PORT}/?host=1`);   // straight into a hosted room; the page shows the links to send
});
