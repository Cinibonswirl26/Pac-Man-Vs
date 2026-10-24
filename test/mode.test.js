// The host program's start-up choice: command line flags, the menu answer, and tidying a friend's link.
const mode = require('../host/mode.js');
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), m + ': ' + JSON.stringify(a));

// flags
eq(mode.parseArgs([]), { mode: null, port: 0, link: null }, 'nothing given means ask');
eq(mode.parseArgs(['--host', '--port=8090']), { mode: 'internet', port: 8090, link: null }, '--host with a port');
eq(mode.parseArgs(['--lan']).mode, 'lan', '--lan');
eq(mode.parseArgs(['--join=http://203.0.113.7:8080/?room=ABCD']), { mode: 'join', port: 0, link: 'http://203.0.113.7:8080/?room=ABCD' }, '--join with the link');
eq(mode.parseArgs(['--join']), { mode: 'join', port: 0, link: null }, '--join alone asks for the link');
eq(mode.parseArgs(['--port=x', '--what']), { mode: null, port: 0, link: null }, 'unknown flags are ignored');

// the menu
eq(mode.choose('1'), 'internet', '1 hosts over the internet');
eq(mode.choose(' 2 '), 'lan', '2 hosts on the network, spaces allowed');
eq(mode.choose('3\n'), 'join', '3 joins');
eq(mode.choose(''), null, 'Enter alone is no choice');
eq(mode.choose('4'), null, '4 is no choice');
eq(mode.choose(undefined), null, 'no answer is no choice');
ok(mode.MENU.some(l => /1 .*internet/.test(l)) && mode.MENU.some(l => /3 .*Join/.test(l)), 'the menu names the choices');

// a friend's link
eq(mode.joinLink('http://203.0.113.7:8080/?room=ABCD'), 'http://203.0.113.7:8080/?room=ABCD', 'a full link is kept');
eq(mode.joinLink('203.0.113.7:8080/?room=abcd'), 'http://203.0.113.7:8080/?room=ABCD', 'http:// added, the code upper-cased');
eq(mode.joinLink('  203.0.113.7:8080 '), 'http://203.0.113.7:8080/', 'an address alone');
eq(mode.joinLink('203.0.113.7:8080 abcd'), 'http://203.0.113.7:8080/?room=ABCD', 'address and code apart');
eq(mode.joinLink('room ABCD at http://203.0.113.7:8080'), 'http://203.0.113.7:8080/?room=ABCD', 'words around it');
eq(mode.joinLink('https://pink-bird.trycloudflare.com/?room=QQQQ'), 'https://pink-bird.trycloudflare.com/?room=QQQQ', 'a tunnel link');
eq(mode.joinLink('192.168.1.20:8080'), 'http://192.168.1.20:8080/', 'a same-network address');
eq(mode.joinLink('ABCD'), null, 'a code alone has nowhere to go');
eq(mode.joinLink('hello there'), null, 'words are not a link');
eq(mode.joinLink(''), null, 'nothing');
eq(mode.joinLink('http://'), null, 'a broken link');

console.log(fails ? fails + ' FAILED' : 'host mode ok'); process.exit(fails ? 1 : 0);
