'use strict';
// host/upnp.js against a pretend router: an SSDP responder on a loopback port and a tiny SOAP service that only
// accepts permanent leases, so the lease fallback, the address lookup and the removal are all exercised.
const assert = require('assert');
const dgram = require('dgram');
const http = require('http');
const upnp = require('../host/upnp.js');

const calls = [];
const web = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/desc.xml') {
    res.writeHead(200, { 'Content-Type': 'text/xml' });
    return res.end(`<?xml version="1.0"?><root><device><serviceList>
      <service><serviceType>urn:schemas-upnp-org:service:Layer3Forwarding:1</serviceType><controlURL>/l3f</controlURL></service>
      <service><serviceType>urn:schemas-upnp-org:service:WANIPConnection:1</serviceType><controlURL>/ctl/wanip</controlURL></service>
    </serviceList></device></root>`);
  }
  if (req.method === 'POST' && req.url === '/ctl/wanip') {
    let body = ''; req.on('data', c => body += c);
    return req.on('end', () => {
      const action = /#(\w+)"/.exec(req.headers.soapaction)[1];
      calls.push({ action, body });
      if (action === 'AddPortMapping' && !/<NewLeaseDuration>0</.test(body)) {
        res.writeHead(500, { 'Content-Type': 'text/xml' });
        return res.end('<s:Envelope><s:Body><s:Fault><detail><UPnPError><errorCode>725</errorCode><errorDescription>OnlyPermanentLeasesSupported</errorDescription></UPnPError></detail></s:Fault></s:Body></s:Envelope>');
      }
      res.writeHead(200, { 'Content-Type': 'text/xml' });
      res.end(action === 'GetExternalIPAddress' ? '<s:Envelope><s:Body><u:GetExternalIPAddressResponse><NewExternalIPAddress>203.0.113.9</NewExternalIPAddress></u:GetExternalIPAddressResponse></s:Body></s:Envelope>'
        : `<s:Envelope><s:Body><u:${action}Response/></s:Body></s:Envelope>`);
    });
  }
  res.writeHead(404); res.end();
});
const ssdp = dgram.createSocket('udp4');

(async () => {
  await new Promise(r => web.listen(0, '127.0.0.1', r));
  const location = `http://127.0.0.1:${web.address().port}/desc.xml`;
  ssdp.on('message', (msg, rinfo) => {
    if (!/^M-SEARCH/.test(msg.toString()) || !/InternetGatewayDevice:1/.test(msg.toString())) return;
    ssdp.send(`HTTP/1.1 200 OK\r\nST: urn:schemas-upnp-org:device:InternetGatewayDevice:1\r\nLOCATION: ${location}\r\n\r\n`, rinfo.port, rinfo.address);
  });
  await new Promise(r => ssdp.bind(0, '127.0.0.1', r));
  const found = await upnp.discover({ addr: '127.0.0.1', port: ssdp.address().port, timeout: 2000 });
  assert.strictEqual(found, location, 'discovery returns the description URL');
  assert.strictEqual(await upnp.discover({ addr: '127.0.0.1', port: 1, timeout: 300 }), null, 'no answer -> null');

  const m = await upnp.openPort(8080, { addr: '127.0.0.1', port: ssdp.address().port, desc: 'test' });
  assert.strictEqual(m.external, '203.0.113.9');
  assert.strictEqual(m.local, '127.0.0.1');
  assert.strictEqual(m.service.control, `http://127.0.0.1:${web.address().port}/ctl/wanip`);
  const adds = calls.filter(c => c.action === 'AddPortMapping');
  assert.strictEqual(adds.length, 2, 'a day lease refused with 725, then a permanent one');
  assert.ok(/<NewLeaseDuration>86400</.test(adds[0].body) && /<NewLeaseDuration>0</.test(adds[1].body));
  assert.ok(/<NewInternalClient>127\.0\.0\.1</.test(adds[1].body) && /<NewExternalPort>8080</.test(adds[1].body) && /<NewProtocol>TCP</.test(adds[1].body));
  await m.remove();
  const del = calls.find(c => c.action === 'DeletePortMapping');
  assert.ok(del && /<NewExternalPort>8080</.test(del.body), 'the mapping is removed');

  await assert.rejects(upnp.openPort(8080, { addr: '127.0.0.1', port: 1, timeout: 300 }), e => e.reason === 'nodevice');
  const svc = upnp.findService('<service><serviceType>urn:schemas-upnp-org:service:WANPPPConnection:1</serviceType><controlURL>ctl</controlURL></service>', 'http://10.0.0.1:5000/igd/desc.xml');
  assert.strictEqual(svc.control, 'http://10.0.0.1:5000/igd/ctl', 'relative control URLs resolve against the description');
  web.close(); ssdp.close();
  console.log('upnp ok');
})().catch(e => { console.error(e); process.exit(1); });
