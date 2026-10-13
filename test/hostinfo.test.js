// /hostinfo: only the single-file host program fills it, and only the host's own browser can read it.
const http = require('http');
const { server, wss, hostInfo } = require('../server/server.js');
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } };
const get = (port, host) => new Promise(res => http.get({ host, port, path: '/hostinfo' }, r => { let b = ''; r.on('data', d => { b += d; }); r.on('end', () => res({ code: r.statusCode, body: b })); }).on('error', e => res({ code: 0, body: e.message })));
server.listen(0, '0.0.0.0', async () => {
  const port = server.address().port;
  let r = await get(port, '127.0.0.1'); ok(r.code === 404, 'not served without the host program: ' + r.code);
  Object.assign(hostInfo, { on: true, port, lan: 'http://192.168.1.5:' + port, public: 'http://203.0.113.7:' + port, upnp: 'open', reason: '' });
  r = await get(port, '127.0.0.1'); const j = r.code === 200 ? JSON.parse(r.body) : {};
  ok(r.code === 200 && j.public === 'http://203.0.113.7:' + port && j.upnp === 'open' && !('on' in j), 'the host\'s own browser reads the links: ' + r.body);
  // from another address on this machine (not loopback): refused
  const os = require('os'); const ext = Object.values(os.networkInterfaces()).flat().find(i => i && i.family === 'IPv4' && !i.internal);
  if (ext) { r = await get(port, ext.address); ok(r.code === 404, 'a visitor (non-loopback) gets nothing: ' + r.code); }
  wss.close(); server.close();
  console.log(fails ? fails + ' FAILED' : 'host info ok'); process.exit(fails ? 1 : 0);
});
