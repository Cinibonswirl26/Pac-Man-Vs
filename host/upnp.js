'use strict';
// Opens a TCP port on the home router through UPnP (the Internet Gateway Device profile) with no dependencies:
// an SSDP search over UDP finds the router, its description XML names the WAN connection service, and two SOAP
// calls add the port mapping and ask for the public address. Most home routers support it; some ship with it off.
const dgram = require('dgram');
const http = require('http');
const { URL } = require('url');

const SSDP = { addr: '239.255.255.250', port: 1900 };
const TARGETS = ['urn:schemas-upnp-org:device:InternetGatewayDevice:1', 'urn:schemas-upnp-org:device:InternetGatewayDevice:2',
  'urn:schemas-upnp-org:service:WANIPConnection:1', 'urn:schemas-upnp-org:service:WANIPConnection:2'];
const SERVICES = ['urn:schemas-upnp-org:service:WANIPConnection:2', 'urn:schemas-upnp-org:service:WANIPConnection:1',
  'urn:schemas-upnp-org:service:WANPPPConnection:1'];

/** The router's description URL, or null after `timeout` ms. `opts.addr/port` override the multicast group (tests). */
function discover(opts = {}) {
  const addr = opts.addr || SSDP.addr, port = opts.port || SSDP.port, timeout = opts.timeout || 3000;
  return new Promise(resolve => {
    const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    let done = false;
    const finish = v => { if (done) return; done = true; clearTimeout(timer); try { sock.close(); } catch (e) { /* closed */ } resolve(v); };
    const timer = setTimeout(() => finish(null), timeout);
    sock.on('error', () => finish(null));
    sock.on('message', msg => {
      const m = /^location:\s*(\S+)/im.exec(msg.toString());
      if (m) finish(m[1]);
    });
    sock.bind(0, () => {
      for (const st of TARGETS) {
        const req = `M-SEARCH * HTTP/1.1\r\nHOST: ${addr}:${port}\r\nMAN: "ssdp:discover"\r\nMX: 2\r\nST: ${st}\r\n\r\n`;
        sock.send(req, port, addr, () => {});
      }
    });
  });
}

/** GET a URL; resolves { body, local } where local is our own address on the route to the router. */
function get(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, res => {
      let body = '';
      const local = res.socket && res.socket.localAddress;      // our address on the route to the router
      res.setEncoding('utf8'); res.on('data', c => body += c);
      res.on('end', () => resolve({ body, local }));
    });
    req.on('error', reject); req.setTimeout(4000, () => req.destroy(new Error('timeout')));
  });
}

/** The WAN connection service in a description XML: { serviceType, control } (control resolved against `base`). */
function findService(xml, base) {
  const blocks = xml.match(/<service>[\s\S]*?<\/service>/gi) || [];
  for (const want of SERVICES) {
    for (const b of blocks) {
      const type = (/<serviceType>\s*([^<]+?)\s*<\/serviceType>/i.exec(b) || [])[1];
      const ctl = (/<controlURL>\s*([^<]+?)\s*<\/controlURL>/i.exec(b) || [])[1];
      if (type === want && ctl) return { serviceType: type, control: new URL(ctl, base).href };
    }
  }
  return null;
}

/** One SOAP action; resolves the response body or rejects with the UPnP error code in `err.code`. */
function soap(control, serviceType, action, args) {
  const inner = Object.entries(args).map(([k, v]) => `<${k}>${String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;')}</${k}>`).join('');
  const body = `<?xml version="1.0"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">` +
    `<s:Body><u:${action} xmlns:u="${serviceType}">${inner}</u:${action}></s:Body></s:Envelope>`;
  const u = new URL(control);
  return new Promise((resolve, reject) => {
    const req = http.request({ host: u.hostname, port: u.port || 80, path: u.pathname + u.search, method: 'POST',
      headers: { 'Content-Type': 'text/xml; charset="utf-8"', 'Content-Length': Buffer.byteLength(body), SOAPAction: `"${serviceType}#${action}"` } }, res => {
      let text = '';
      res.setEncoding('utf8'); res.on('data', c => text += c);
      res.on('end', () => {
        if (res.statusCode === 200) return resolve(text);
        const err = new Error(`${action} failed (HTTP ${res.statusCode})`);
        err.code = +((/<errorCode>\s*(\d+)/i.exec(text) || [])[1] || 0);
        err.detail = ((/<errorDescription>\s*([^<]*)/i.exec(text) || [])[1] || '').trim();
        reject(err);
      });
    });
    req.on('error', reject); req.setTimeout(6000, () => req.destroy(new Error('timeout')));
    req.end(body);
  });
}

/** Map TCP `port` on the router to this machine. Resolves { external, local, remove() }; rejects with a reason when
 *  there is no router to talk to or it refuses. `opts`: desc, lease (seconds, 0 = until removed), plus discover's. */
async function openPort(port, opts = {}) {
  const location = opts.location || await discover(opts);
  if (!location) { const e = new Error('no UPnP router answered'); e.reason = 'nodevice'; throw e; }
  const { body, local } = await get(location);
  const svc = findService(body, location);
  if (!svc) { const e = new Error('the router offers no WAN connection service'); e.reason = 'noservice'; throw e; }
  const desc = opts.desc || 'Pac-Man Vs.';
  const args = lease => ({ NewRemoteHost: '', NewExternalPort: port, NewProtocol: 'TCP', NewInternalPort: port, NewInternalClient: local,
    NewEnabled: 1, NewPortMappingDescription: desc, NewLeaseDuration: lease });
  const lease = opts.lease == null ? 86400 : opts.lease;
  try { await soap(svc.control, svc.serviceType, 'AddPortMapping', args(lease)); }
  catch (e) {
    if (e.code === 725 && lease !== 0) await soap(svc.control, svc.serviceType, 'AddPortMapping', args(0));   // permanent leases only
    else { e.reason = e.reason || 'refused'; throw e; }
  }
  let external = null;
  try { external = ((/<NewExternalIPAddress>\s*([^<]*)/i.exec(await soap(svc.control, svc.serviceType, 'GetExternalIPAddress', {})) || [])[1] || '').trim() || null; }
  catch (e) { /* mapping is in; the address stays unknown */ }
  const remove = () => soap(svc.control, svc.serviceType, 'DeletePortMapping', { NewRemoteHost: '', NewExternalPort: port, NewProtocol: 'TCP' }).catch(() => {});
  return { external, local, service: svc, remove };
}

module.exports = { discover, openPort, findService, soap, get };
