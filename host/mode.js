'use strict';
// What the host program should do: read from its command line, or asked at start-up with a small menu, so that
// someone who only wants to join a friend's game never opens a port on their router. Pure, so the tests cover it.

/** The three choices, by the key typed at the menu. */
const CHOICES = { 1: 'internet', 2: 'lan', 3: 'join' };
const MENU = [
  ' What would you like to do?',
  '',
  '   1   Host a game for friends over the internet   (asks your router to open a port)',
  '   2   Host a game on this Wi-Fi or network only   (nothing on your router changes)',
  '   3   Join a friend\'s game                        (opens the link they sent you)',
  ''
];

/** The command line: --host (over the internet), --lan, --join[=link], --port=N. No mode means ask. */
function parseArgs(argv) {
  const out = { mode: null, port: 0, link: null };
  for (const a of argv) {
    let m;
    if (a === '--host' || a === '--internet') out.mode = 'internet';
    else if (a === '--lan' || a === '--local') out.mode = 'lan';
    else if ((m = /^--join(?:=(.*))?$/.exec(a))) { out.mode = 'join'; out.link = m[1] || null; }
    else if ((m = /^--port=(\d+)$/.exec(a))) out.port = +m[1];
  }
  return out;
}

/** A menu answer ("2", " 3 ") to its mode, or null for anything else. */
const choose = s => CHOICES[String(s == null ? '' : s).trim()] || null;

/** What a friend sent, tidied into the link to open: "http://203.0.113.7:8080/?room=ABCD" with or without the
 * http://, a tunnel's https link, or the address and the room code apart ("203.0.113.7:8080 ABCD").
 * Null when there is no address in it. */
function joinLink(text) {
  const words = String(text == null ? '' : text).trim().split(/\s+/).filter(Boolean);
  const i = words.findIndex(w => /^https?:\/\//i.test(w) || /^[a-z0-9-]+(\.[a-z0-9-]+)+(:\d+)?(\/|$)/i.test(w) || /^(localhost|\d{1,3}(\.\d{1,3}){3})(:\d+)?(\/|$)/i.test(w));
  if (i < 0) return null;
  let url;
  try { url = new URL(/^https?:\/\//i.test(words[i]) ? words[i] : 'http://' + words[i]); } catch (e) { return null; }
  if (!url.hostname) return null;
  if (!url.searchParams.get('room')) {
    const rest = words.filter((w, k) => k !== i);   // the code is four letters; as typed in capitals first, so "room ABCD" reads right
    const code = rest.find(w => /^[A-Z]{4}$/.test(w)) || rest.find(w => /^[A-Za-z]{4}$/.test(w));
    if (code) url.searchParams.set('room', code.toUpperCase());
  } else url.searchParams.set('room', url.searchParams.get('room').toUpperCase().slice(0, 4));
  return url.href;
}

module.exports = { MENU, CHOICES, parseArgs, choose, joinLink };
