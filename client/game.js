/* Pac-Man Vs. Online: client. Menu, lobby, networking, input, audio, rendering. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const S = PacSim, W = S.W, H = S.H, CFG = S.CFG;
  const SEAT_COLORS = ['#ff3b30', '#ff8fd0', '#35e0ff', '#ffa133'];
  const SEAT_NAMES = ['Red', 'Pink', 'Cyan', 'Orange'];

  let mode = null;                 // 'offline' | 'online'
  let ws = null, room = null, you = 0;
  let snap = null, offline = null, lastPhase = null, lastCount = -1;
  let names = ['You', 'CPU', 'CPU', 'CPU'];
  const sm = { pac: null, ghosts: [null, null, null] };

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } }
  };
  function screen(id) { for (const s of ['menu', 'lobby', 'game']) $(s).classList.toggle('hidden', s !== id); }

  // ------------------------------------------------------------------ audio
  let ac = null, master = null, musicNode = null, musicName = null;
  const music = { bufs: new Map(), disc: null, enabled: true };
  function audio() {
    if (!ac) { const C = window.AudioContext || window.webkitAudioContext; if (!C) return null; ac = new C(); master = ac.createGain(); master.gain.value = 0.45; master.connect(ac.destination); }
    if (ac.state === 'suspended') ac.resume();
    return ac;
  }
  function tone(f, dur, type, vol, to) {
    if (!audio()) return;
    const t = ac.currentTime, o = ac.createOscillator(), g = ac.createGain();
    o.type = type || 'square'; o.frequency.setValueAtTime(f, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(vol || 0.12, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
  }
  let waka = 0;
  function playEvents(ev) {
    for (const e of ev || []) {
      if (e === 'pellet') tone((waka++ & 1) ? 440 : 330, 0.07, 'square', 0.07);
      else if (e === 'power') tone(180, 0.35, 'sawtooth', 0.12, 720);
      else if (e === 'eatghost') { tone(900, 0.12, 'square', 0.12, 300); setTimeout(() => tone(300, 0.2, 'square', 0.1, 1200), 90); }
      else if (e === 'pacdeath') tone(700, 0.9, 'sawtooth', 0.16, 70);
      else if (e === 'respawn') tone(300, 0.15, 'triangle', 0.1, 600);
    }
  }
  function stopMusic() { if (musicNode) { try { musicNode.stop(); } catch { /* already stopped */ } musicNode = null; musicName = null; } }
  async function playMusic(name, loop) {
    if (!music.enabled || !music.disc || !audio()) return;
    if (musicName === name) return;
    stopMusic(); musicName = name;
    let buf = music.bufs.get(name);
    if (!buf) {
      try {
        const a = Disc.decodeAST(await music.disc.read('PROOT/AudioRes/Stream/' + name + '.z.32.c4.ast'));
        buf = ac.createBuffer(a.channels.length, a.samples, a.rate);
        a.channels.forEach((c, i) => buf.copyToChannel(c.subarray(0, a.samples), i));
        buf.loopRange = a.loopEnd > a.loopStart && a.loopEnd <= a.samples ? [a.loopStart / a.rate, a.loopEnd / a.rate] : null;
        music.bufs.set(name, buf);
      } catch (e) { console.warn('music', name, e); return; }
      if (musicName !== name) return;      // changed our mind while decoding
    }
    const src = ac.createBufferSource(); src.buffer = buf; src.loop = !!loop;
    if (loop && buf.loopRange) { src.loopStart = buf.loopRange[0]; src.loopEnd = buf.loopRange[1]; }
    const g = ac.createGain(); g.gain.value = 0.7; src.connect(g); g.connect(master); src.start();
    musicNode = src;
  }
  const GAME_TRACKS = ['pacmaniaBGM02_FX_LR', 'pacmaniaBGM03_FX_LR', 'pacmaniaBGM06_FX_LR', 'pacmaniaBGM07_FX_LR'];

  // ------------------------------------------------------------------ disc assets
  const art = { pac: [], logo: null, press: null };
  function toCanvas(t) { const c = document.createElement('canvas'); c.width = t.w; c.height = t.h; c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(t.rgba), t.w, t.h), 0, 0); return c; }
  async function loadDisc(blob, remember) {
    const st = $('discStatus'); st.className = 'note';
    try {
      st.textContent = 'Reading disc…';
      const d = await Disc.open(blob);
      if (d.id.slice(0, 3) !== 'PRJ') throw new Error('This is a ' + (d.title || d.id) + ' disc, not Pac-Man Vs.');
      const arc = Disc.rarc(Disc.yaz0(await d.read('PROOT/Screen/PAC_title.szs')));
      const tex = n => { for (const [k, v] of arc) if (k.split('/').pop() === n) return toCanvas(Disc.decodeBTI(v)); return null; };
      art.pac = ['pac_eat.1.bti', 'pac_eat.2.bti', 'pac_eat.3.bti'].map(tex).filter(Boolean);
      art.logo = tex('pactitle_06.bti'); art.press = tex('press_start.bti');
      if (art.logo) { $('logo').src = art.logo.toDataURL(); $('logo').classList.remove('hidden'); $('title').classList.add('hidden'); }
      music.disc = d; music.bufs.clear();
      st.className = 'note ok'; st.textContent = `Loaded ${d.title} (${d.id}). Original logo, sprites and music are on.`;
      if (remember) { try { await idbSet('disc', blob); } catch { /* storage unavailable */ } }
      if (!mode) playMusic('Pac_Op_loop73_LR', true);
    } catch (e) { st.className = 'note err'; st.textContent = 'Could not use that file: ' + e.message; }
  }
  function idb() { return new Promise((res, rej) => { const r = indexedDB.open('pacvs', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
  async function idbSet(k, v) { const db = await idb(); return new Promise((res, rej) => { const t = db.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = res; t.onerror = () => rej(t.error); }); }
  async function idbGet(k) { const db = await idb(); return new Promise((res, rej) => { const r = db.transaction('kv').objectStore('kv').get(k); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }

  // ------------------------------------------------------------------ networking
  function connect(then) {
    const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
    ws = new WebSocket(url);
    ws.onopen = then;
    ws.onmessage = e => onMsg(JSON.parse(e.data));
    ws.onerror = () => { $('menuErr').textContent = 'Could not reach the game server.'; };
    ws.onclose = () => { if (mode === 'online') { toMenu('Disconnected from the server.'); } ws = null; };
  }
  function send(o) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); }
  function onMsg(m) {
    if (m.t === 'err') { $('menuErr').textContent = m.msg; return; }
    if (m.t === 'room') {
      mode = 'online'; room = m; you = m.you; names = m.players.map((p, i) => p.cpu ? 'CPU ' + (i + 1) : p.name);
      if (m.phase === 'lobby') { screen('lobby'); renderLobby(); } else showGame();
      return;
    }
    if (m.t === 'state') { snap = m; playEvents(m.ev); onSnap(); }
  }

  // ------------------------------------------------------------------ menu / lobby
  function playerName() { const n = $('name').value.trim() || 'Player'; store.set('pacvs.name', n); return n; }
  function toMenu(msg) {
    if (ws) { try { send({ t: 'leave' }); ws.close(); } catch { /* closing */ } }
    mode = null; room = null; offline = null; snap = null; stopMusic(); screen('menu');
    $('menuErr').textContent = msg || '';
    if (music.disc) playMusic('Pac_Op_loop73_LR', true);
  }
  function renderLobby() {
    $('roomCode').textContent = room.code;
    $('seats').innerHTML = room.players.map((p, i) => `<div class="seat ${i === you ? 'me' : ''}"><span class="dot" style="background:${SEAT_COLORS[i]}"></span><b>${esc(p.cpu ? 'CPU' : p.name)}</b><span class="note">${i === you ? '(you)' : ''}${i === room.host ? ' host' : ''}</span></div>`).join('');
    const host = room.host === you;
    $('start').classList.toggle('hidden', !host);
    $('lobbyNote').textContent = host ? 'You are the host. Start whenever everyone is in.' : 'Waiting for the host to start.';
  }
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  $('solo').onclick = () => { audio(); startOffline(); };
  $('host').onclick = () => { audio(); $('menuErr').textContent = ''; connect(() => send({ t: 'create', name: playerName() })); };
  $('join').onclick = () => {
    audio(); const c = $('code').value.trim().toUpperCase();
    if (c.length !== 4) { $('menuErr').textContent = 'Room codes have 4 letters.'; return; }
    $('menuErr').textContent = ''; connect(() => send({ t: 'join', code: c, name: playerName() }));
  };
  $('start').onclick = () => send({ t: 'start' });
  $('leave').onclick = () => toMenu();
  $('copyLink').onclick = async () => {
    const link = `${location.origin}/?room=${room.code}`;
    try { await navigator.clipboard.writeText(link); $('lobbyNote').textContent = 'Invite link copied.'; }
    catch { $('lobbyNote').textContent = 'Copy this link: ' + link; }
  };
  $('disc').onchange = e => { const f = e.target.files[0]; if (f) { audio(); loadDisc(f, true); } };

  // ------------------------------------------------------------------ offline play
  function startOffline() {
    mode = 'offline'; you = 0; names = [playerName(), 'CPU 1', 'CPU 2', 'CPU 3']; room = null;
    offline = { match: new PacMatch.Match(i => i === 0), inputs: [null, null, null, null], acc: 0, last: performance.now() };
    offline.match.start(); snap = offline.match.view(0); showGame();
  }
  function offlineFrame(now) {
    const o = offline, m = o.match;
    o.acc += Math.min(0.1, (now - o.last) / 1000); o.last = now;
    while (o.acc >= CFG.tick && m.phase !== 'final') {
      o.acc -= CFG.tick;
      const prev = m.phase;
      m.tick(o.inputs);
      if (m.phase === 'countdown' && prev !== 'countdown') o.inputs.fill(null);
      if (m.phase === 'play' || prev === 'play') playEvents(m.sim.events);
    }
    snap = m.view(0); onSnap();
  }

  // ------------------------------------------------------------------ input
  const KEYS = { ArrowUp: 0, KeyW: 0, ArrowRight: 1, KeyD: 1, ArrowDown: 2, KeyS: 2, ArrowLeft: 3, KeyA: 3 };
  let lastDir = -1;
  function setDir(d) {
    if (mode === 'online') send({ t: 'in', d }); else if (offline) offline.inputs[0] = d;
    lastDir = d;
  }
  addEventListener('keydown', e => {
    if (e.target && e.target.tagName === 'INPUT') return;
    if (e.code in KEYS) { e.preventDefault(); if (mode) setDir(KEYS[e.code]); }
    else if (e.code === 'KeyM') { music.enabled = !music.enabled; if (!music.enabled) stopMusic(); else onSnap(true); }
    else if (e.code === 'Escape' && mode) toMenu();
  });
  document.querySelectorAll('#pad button').forEach(b => { b.addEventListener('pointerdown', e => { e.preventDefault(); setDir(+b.dataset.d); }); });
  let tx = 0, ty = 0;
  const cv = $('cv'), g = cv.getContext('2d');
  cv.addEventListener('touchstart', e => { tx = e.touches[0].clientX; ty = e.touches[0].clientY; }, { passive: true });
  cv.addEventListener('touchmove', e => {
    const dx = e.touches[0].clientX - tx, dy = e.touches[0].clientY - ty;
    if (Math.hypot(dx, dy) < 22) return;
    setDir(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : (dy > 0 ? 2 : 0));
    tx = e.touches[0].clientX; ty = e.touches[0].clientY;
  }, { passive: true });
  function pollPad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) {
      if (!p) continue;
      let d = -1;
      if (p.buttons[12] && p.buttons[12].pressed) d = 0; else if (p.buttons[15] && p.buttons[15].pressed) d = 1;
      else if (p.buttons[13] && p.buttons[13].pressed) d = 2; else if (p.buttons[14] && p.buttons[14].pressed) d = 3;
      else { const x = p.axes[0] || 0, y = p.axes[1] || 0; if (Math.hypot(x, y) > 0.55) d = Math.abs(x) > Math.abs(y) ? (x > 0 ? 1 : 3) : (y > 0 ? 2 : 0); }
      if (d >= 0 && d !== lastDir) setDir(d);
      break;
    }
  }

  // ------------------------------------------------------------------ game screen
  function showGame() {
    screen('game'); lastPhase = null; lastCount = -1; sm.pac = null; sm.ghosts = [null, null, null];
    if (!raf) raf = requestAnimationFrame(frame);
  }
  let hudKey = '';
  function onSnap(force) {
    if (!snap) return;
    if (snap.phase !== lastPhase || force) {
      if (snap.phase === 'countdown' && snap.phase !== lastPhase) lastDir = -1;
      lastPhase = snap.phase;
      if (snap.phase === 'countdown' || snap.phase === 'play') playMusic(GAME_TRACKS[snap.round % 4], true); else stopMusic();
    }
    if (snap.phase === 'countdown') { const c = Math.ceil(snap.left_t); if (c !== lastCount) { lastCount = c; tone(c > 0 ? 520 : 880, 0.12, 'square', 0.1); } }
    renderHud(); renderBanner();
  }
  function totals() { return snap.scores.map((s, i) => s + (snap.over ? 0 : snap.rs[i])); }
  function renderHud() {
    const t = totals();
    const key = JSON.stringify([t, snap.pacPlayer, names, snap.lives, Math.ceil(snap.time), snap.round, snap.over]);
    if (key === hudKey) return; hudKey = key;
    $('hud').innerHTML = [0, 1, 2, 3].map(i => `<div class="pl ${i === you ? 'me' : ''} ${i === snap.pacPlayer ? 'pacrole' : ''}"><div class="n"><span class="dot" style="background:${i === snap.pacPlayer ? '#ffd400' : SEAT_COLORS[i]};border-radius:50%"></span>${esc(names[i])}</div><div class="s">${t[i]}</div></div>`).join('');
    const pacMe = snap.me < 0;
    $('roleTxt').textContent = `Round ${snap.round + 1}/${CFG.rounds} · ` + (pacMe ? 'You are Pac-Man' : 'You are a ghost') + (pacMe ? ` · ${'♥'.repeat(Math.max(0, snap.lives))}` : '');
    $('timeTxt').textContent = `${Math.floor(snap.time / 60)}:${String(Math.floor(snap.time % 60)).padStart(2, '0')} · ${snap.left} pellets left`;
  }
  function renderBanner() {
    const b = $('banner'); let html = '';
    const pacMe = snap.me < 0;
    if (snap.phase === 'countdown') {
      html = `<div class="big">${Math.max(1, Math.ceil(snap.left_t))}</div><div class="sm">${pacMe ? 'You are Pac-Man. Eat every pellet. You can see the whole maze.' : 'You are a ghost. Hunt Pac-Man. You only see what is close.'}</div>`;
    } else if (snap.phase === 'roundover') {
      const why = snap.why === 'cleared' ? 'Pac-Man cleared the maze' : snap.why === 'caught' ? 'The ghosts got Pac-Man' : 'Time is up';
      html = `<div class="big">${why}</div><div class="sm">${[0, 1, 2, 3].map(i => `${esc(names[i])} +${snap.rs[i]}`).join(' · ')}</div>`;
    } else if (snap.phase === 'final') {
      const t = totals(), order = [0, 1, 2, 3].sort((a, b) => t[b] - t[a]);
      const canAgain = mode === 'offline' || (room && room.host === you);
      html = `<div class="big">${esc(names[order[0]])} wins</div><div class="sm">${order.map((i, k) => `${k + 1}. ${esc(names[i])} ${t[i]}`).join('<br>')}</div>` +
        `<div class="row" style="justify-content:center;flex:none">${canAgain ? '<button class="primary" id="again">Play again</button>' : '<span class="sm">Waiting for the host…</span>'}<button id="quit">Back to menu</button></div>`;
    } else if (snap.respawning) html = '<div class="sm">Pac-Man was caught…</div>';
    if (b.dataset.h !== html) {
      b.dataset.h = html; b.innerHTML = html;
      const a = $('again'); if (a) a.onclick = () => { if (mode === 'online') send({ t: 'start' }); else startOffline(); };
      const q = $('quit'); if (q) q.onclick = () => toMenu();
    }
  }

  // ------------------------------------------------------------------ rendering
  let cell = 0, mazeCv = null, fogCv = null, dpr = 1;
  function layout() {
    const st = $('stage'), aw = st.clientWidth, ah = st.clientHeight;
    const c = Math.max(8, Math.floor(Math.min(aw / W, ah / H)));
    dpr = Math.min(2, window.devicePixelRatio || 1);
    if (c === cell && cv.width === W * c * dpr) return;
    cell = c; cv.width = W * c * dpr; cv.height = H * c * dpr; cv.style.width = W * c + 'px'; cv.style.height = H * c + 'px';
    mazeCv = document.createElement('canvas'); mazeCv.width = cv.width; mazeCv.height = cv.height; drawMaze(mazeCv.getContext('2d'), c * dpr);
    fogCv = document.createElement('canvas'); fogCv.width = cv.width; fogCv.height = cv.height;
  }
  function wall(x, y) { return y >= 0 && y < H && x >= 0 && x < W && (S.ROWS[y][x] === '#' || S.ROWS[y][x] === '='); }
  function drawMaze(c, u) {
    c.fillStyle = '#05061a'; c.fillRect(0, 0, W * u, H * u);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (wall(x, y)) { c.fillStyle = '#10186b'; c.fillRect(x * u, y * u, u, u); }
    c.strokeStyle = '#4d6bff'; c.lineWidth = Math.max(2, u * 0.12); c.lineCap = 'round';
    c.beginPath();
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (!wall(x, y)) continue;
      const e = u * 0.06, x0 = x * u, y0 = y * u;
      if (y === 0 || !wall(x, y - 1)) { c.moveTo(x0, y0 + e); c.lineTo(x0 + u, y0 + e); }
      if (y === H - 1 || !wall(x, y + 1)) { c.moveTo(x0, y0 + u - e); c.lineTo(x0 + u, y0 + u - e); }
      if (!wall(x - 1, y) && x > 0) { c.moveTo(x0 + e, y0); c.lineTo(x0 + e, y0 + u); }
      if (!wall(x + 1, y) && x < W - 1) { c.moveTo(x0 + u - e, y0); c.lineTo(x0 + u - e, y0 + u); }
      if (x === 0) { c.moveTo(x0 + e, y0); c.lineTo(x0 + e, y0 + u); }
      if (x === W - 1) { c.moveTo(x0 + u - e, y0); c.lineTo(x0 + u - e, y0 + u); }
    }
    c.stroke();
    c.strokeStyle = '#ff8fd0'; c.lineWidth = Math.max(2, u * 0.14); c.beginPath();
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (S.ROWS[y][x] === 'D') { c.moveTo(x * u, (y + 0.5) * u); c.lineTo((x + 1) * u, (y + 0.5) * u); }
    c.stroke();
  }
  function approach(o, t, dt) {
    if (!t) return null;
    if (!o || Math.abs(o.x - t.x) > W / 2 || Math.hypot(o.x - t.x, o.y - t.y) > 2.5) return { x: t.x, y: t.y, d: t.d, m: t.m };
    const k = 1 - Math.exp(-dt * 28); o.x += (t.x - o.x) * k; o.y += (t.y - o.y) * k; o.d = t.d; o.m = t.m; return o;
  }
  function drawPac(p, u, now, mine) {
    const x = p.x * u, y = p.y * u, r = u * 0.46;
    if (mine) { g.strokeStyle = '#35e0ff'; g.lineWidth = u * 0.1; g.beginPath(); g.arc(x, y, r + u * 0.16, 0, 7); g.stroke(); }
    if (art.pac.length) {
      const cyc = art.pac.length * 2 - 2 || 1, i = Math.floor(now / 90) % cyc;
      const f = art.pac[i < art.pac.length ? i : cyc - i];
      g.save(); g.translate(x, y);
      if (p.d === 3) g.scale(-1, 1); else g.rotate([-Math.PI / 2, 0, Math.PI / 2, 0][p.d]);
      g.drawImage(f, -r * 1.15, -r * 1.15, r * 2.3, r * 2.3); g.restore(); return;
    }
    const open = (Math.sin(now / 70) + 1) / 2 * 0.65 + 0.05, a = [-Math.PI / 2, 0, Math.PI / 2, Math.PI][p.d];
    g.fillStyle = '#ffd400'; g.beginPath(); g.moveTo(x, y); g.arc(x, y, r, a + open, a + Math.PI * 2 - open); g.closePath(); g.fill();
  }
  function drawGhost(gh, color, u, now, mine) {
    const x = gh.x * u, y = gh.y * u, r = u * 0.46;
    if (mine) { g.strokeStyle = '#ffffff'; g.lineWidth = u * 0.08; g.beginPath(); g.arc(x, y, r + u * 0.16, 0, 7); g.stroke(); }
    const eyes = () => {
      const ox = [0, 1, 0, -1][gh.d] * r * 0.18, oy = [-1, 0, 1, 0][gh.d] * r * 0.18;
      for (const s of [-1, 1]) { g.fillStyle = '#fff'; g.beginPath(); g.ellipse(x + s * r * 0.38, y - r * 0.2, r * 0.26, r * 0.32, 0, 0, 7); g.fill(); g.fillStyle = '#1a2cff'; g.beginPath(); g.arc(x + s * r * 0.38 + ox, y - r * 0.2 + oy, r * 0.13, 0, 7); g.fill(); }
    };
    if (gh.m === 'e') { eyes(); return; }
    const fright = gh.m === 'f', flash = fright && snap.frightLeft < 2 && Math.floor(now / 160) % 2;
    g.fillStyle = fright ? (flash ? '#ffffff' : '#2a3cff') : color;
    g.beginPath(); g.arc(x, y - r * 0.1, r, Math.PI, 0); g.lineTo(x + r, y + r * 0.9);
    const n = 3, w = (2 * r) / n, ph = Math.floor(now / 140) % 2;
    for (let i = 0; i < n; i++) { const x1 = x + r - i * w; g.quadraticCurveTo(x1 - w * 0.25, y + r * (ph ? 0.5 : 0.95), x1 - w / 2, y + r * 0.9); g.quadraticCurveTo(x1 - w * 0.75, y + r * (ph ? 0.95 : 0.5), x1 - w, y + r * 0.9); }
    g.closePath(); g.fill();
    if (fright) { g.fillStyle = flash ? '#ff3b30' : '#ffd0c0'; for (const s of [-1, 1]) { g.beginPath(); g.arc(x + s * r * 0.35, y - r * 0.2, r * 0.13, 0, 7); g.fill(); } }
    else eyes();
  }
  let raf = 0, lastT = 0;
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - lastT) / 1000); lastT = now;
    if ($('game').classList.contains('hidden')) return;
    if (mode === 'offline' && offline) offlineFrame(now);
    pollPad();
    if (!snap) return;
    layout(); const u = cell * dpr;
    g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(mazeCv, 0, 0);
    const pel = snap.pellets;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const v = pel[y * W + x]; if (!v) continue;
      g.fillStyle = '#ffd9b0'; g.beginPath();
      g.arc((x + 0.5) * u, (y + 0.5) * u, v === 2 ? u * (0.2 + 0.05 * Math.sin(now / 120)) : u * 0.09, 0, 7); g.fill();
    }
    sm.pac = approach(sm.pac, snap.respawning ? null : snap.pac, dt);
    snap.ghosts.forEach((gh, i) => { sm.ghosts[i] = approach(sm.ghosts[i], gh, dt); });
    sm.ghosts.forEach((gh, i) => { if (gh && snap.ghosts[i] && snap.ghosts[i].m !== 'r') drawGhost(gh, SEAT_COLORS[S.playerOfGhost({ pacPlayer: snap.pacPlayer }, i)], u, now, snap.me === i); });
    if (sm.pac) drawPac(sm.pac, u, now, snap.me < 0);
    // fog of war for ghost players
    if (snap.me >= 0 && sm.ghosts[snap.me]) {
      const f = fogCv.getContext('2d'), me = sm.ghosts[snap.me];
      f.globalCompositeOperation = 'source-over'; f.clearRect(0, 0, fogCv.width, fogCv.height);
      f.fillStyle = 'rgba(2,3,12,0.94)'; f.fillRect(0, 0, fogCv.width, fogCv.height);
      f.globalCompositeOperation = 'destination-out';
      const R = CFG.ghostSight * u, gr = f.createRadialGradient(me.x * u, me.y * u, R * 0.55, me.x * u, me.y * u, R);
      gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      f.fillStyle = gr; f.beginPath(); f.arc(me.x * u, me.y * u, R, 0, 7); f.fill();
      g.drawImage(fogCv, 0, 0);
      drawGhost(me, SEAT_COLORS[you], u, now, true);
    }
  }

  // ------------------------------------------------------------------ boot
  $('name').value = store.get('pacvs.name') || '';
  const qr = new URLSearchParams(location.search).get('room');
  if (qr) { $('code').value = qr.toUpperCase().slice(0, 4); $('menuErr').textContent = 'Enter your name and press Join to enter room ' + $('code').value + '.'; }
  idbGet('disc').then(b => { if (b) loadDisc(b, false); }).catch(() => { /* no saved disc */ });
  addEventListener('resize', () => { cell = 0; });
  document.addEventListener('visibilitychange', () => { if (document.hidden) stopMusic(); else if (mode) onSnap(true); });
  window.__pacvs = { get snap() { return snap; }, get mode() { return mode; } };   // for automated tests
})();
