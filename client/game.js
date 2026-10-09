/* Pac-Man Vs. Online: client. Menu, lobby, networking, input, audio, rendering. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  let S = PacSim, W = S.W, H = S.H;
  const CFG = S.CFG;
  // Player colours as in the original: P1 red, P2 blue, P3 pink, P4 green (the disc ships ghost_r/b/p/g skins).
  const SEAT_COLORS = ['#ff2a2a', '#35c8ff', '#ff5ccf', '#2bd94a'], GREY = '#9a9aa8';

  let mode = null;                 // 'offline' | 'online'
  let ws = null, room = null, you = 0;
  let snap = null, offline = null, lastPhase = null, lastCount = -1;
  let names = ['You', 'CPU', 'CPU', 'CPU'];
  const sm = { pac: null, pacAng: null, ghosts: [null, null, null], yaw: [0, 0, 0], sight: [null, null, null] };
  // The circle's reach changes with an animation: in the original, picking up the fruit pulls the camera back by
  // about 1.6x over a little more than a second, easing out. The sim changes the radius in one step; this tweens it.
  const ZOOM_TIME = 1.1;
  function tweenSight(i, target, now) {
    const t = sm.sight[i];
    if (!t) return (sm.sight[i] = { from: target, to: target, t0: now, v: target }).v;
    if (t.to !== target) { t.from = t.v; t.to = target; t.t0 = now; }
    const k = Math.min(1, (now - t.t0) / (ZOOM_TIME * 1000));
    t.v = t.from + (t.to - t.from) * Math.sin(k * Math.PI / 2);
    return t.v;
  }

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
  let waka = 0, handWaka = null;
  function playEvents(ev) {
    for (const e of ev || []) {
      if ((e === 'pellet' || e === 'power') && SM.handled('pellet')) { fire('pellet'); if (e === 'power') fire('powerPellet'); continue; }
      if (e === 'eatghost' && SM.handled('ghostEatenSfx')) { fire('ghostEatenSfx'); continue; }
      if ((e === 'fruit' || e === 'fruitghost') && SM.handled('fruitPac')) continue;      // fxDetect plays the fruit sound
      if (e === 'pellet' || (e === 'power' && art.handheld)) {
        // the "wa-ka" is Pac-Man's own screen's sound: with the disc loaded only Pac-Man hears it, as in the original
        if (art.handheld) { if (snap && snap.me < 0 && audio()) { if (handWaka) handWaka.stop(); handWaka = HandSound.play(ac, master, 'waka'); } }
        else tone((waka++ & 1) ? 440 : 330, 0.07, 'square', 0.07);
      } else if (e === 'power') tone(180, 0.35, 'sawtooth', 0.12, 720);
      else if (e === 'eatghost') { tone(900, 0.12, 'square', 0.12, 300); setTimeout(() => tone(300, 0.2, 'square', 0.1, 1200), 90); }
      else if (e === 'pacdeath') tone(700, 0.9, 'sawtooth', 0.16, 70);
      else if (e === 'fruit' || e === 'fruitghost') { tone(660, 0.08, 'square', 0.1); setTimeout(() => tone(990, 0.12, 'square', 0.1), 80); }
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
  // ---- sound effects and the announcer, from the disc's wave banks (client/sound.js)
  const snd = { sfx: null, voice: null, busyUntil: 0, said: new Set(), chain: 0 };
  const pick = list => list[Math.floor(Math.random() * list.length)];
  function playWave(w, vol) {
    const a = audio(); if (!a || !w) return;
    const src = a.createBufferSource(), g = a.createGain();
    src.buffer = Sound.buffer(a, w); g.gain.value = vol; src.connect(g); g.connect(master); src.start();
  }
  const sfx = (i, vol) => { if (snd.sfx && snd.sfx[i]) playWave(snd.sfx[i], vol || 0.8); };
  /** The announcer speaks one line at a time; `force` cuts in on a line that is still playing. */
  function say(i, force, vol) {
    const w = snd.voice && snd.voice[i], a = w && audio(); if (!a) return;
    if (!force && a.currentTime < snd.busyUntil) return;
    playWave(w, vol == null ? 1 : vol); snd.busyUntil = a.currentTime + w.samples / w.rate + 0.25;
  }
  const SM = SoundMap.create({
    voice: (i, force, vol) => say(i, force, vol), sfx: (i, vol) => sfx(i, vol),
    hand: name => { if (!art.handheld || !audio()) return; if (name === 'waka' && handWaka) handWaka.stop(); const h = HandSound.play(ac, master, name); if (name === 'waka') handWaka = h; },
    ready: () => !!(snd.sfx && snd.voice)
  });
  // Loops that run while a state lasts (frightened ghosts, eaten ghosts flying home).
  const loops = {};
  function setLoop(id, on) {
    if (!on) { if (loops[id]) { loops[id].forEach(n => { try { n.stop(); } catch { /* ended */ } }); delete loops[id]; } return; }
    if (loops[id] || !SM.handled(id)) return;
    const a = audio(); if (!a) return;
    loops[id] = [];
    for (const c of SM.map[id]) if (c.kind === 'sfx') for (const i of c.ids) {
      const w = snd.sfx[+i]; if (!w) continue;
      const src = a.createBufferSource(), g = a.createGain();
      src.buffer = Sound.buffer(a, w); src.loop = true; if (src.buffer.loopRange) { src.loopStart = src.buffer.loopRange[0]; src.loopEnd = src.buffer.loopRange[1]; }
      g.gain.value = c.vol == null ? 0.4 : c.vol; src.connect(g); g.connect(master); src.start(); loops[id].push(src);
    }
  }
  const stopLoops = () => Object.keys(loops).forEach(id => setLoop(id, false));
  /** The title line plays once per launch: not in a hidden page (a preview), and not again if another copy of the page just played it. */
  function titleOnce() {
    if (document.hidden) return;
    try { const last = +localStorage.getItem('pacvs.titleAt') || 0; if (Date.now() - last < 10000) return; localStorage.setItem('pacvs.titleAt', String(Date.now())); } catch { /* no storage */ }
    fire('title');
  }
  const fire = (id, p) => SM.fire(id, Object.assign({ me: snap ? snap.me : 0 }, p));
  const GAME_TRACKS = ['pacmaniaBGM02_FX_LR', 'pacmaniaBGM03_FX_LR', 'pacmaniaBGM06_FX_LR', 'pacmaniaBGM07_FX_LR'];

  // ------------------------------------------------------------------ disc assets
  const art = { pac: [], logo: null, press: null, mazes: [], three: null, screens: null, handheld: null };
  let view3 = null, screenView = null, onDiscMaze = false, curStage = null, stageWant = 0, curDisc = null, pacScreen = null;
  /** Switch the board to another maze (or back to the built-in one). A maze that came from the disc also
   *  loads its 3D stage model; until that is ready the flat view is used. */
  function setMaze(m) {
    const next = m ? PacSim.create(m) : PacSim;
    const disc = m && art.mazes.find(d => d.rows.join('/') === m.rows.join('/'));
    curStage = null; onDiscMaze = false; stageWant = disc ? disc.stage : 0; curDisc = disc || null;
    if (disc && art.three && music.disc) {
      const want = disc.stage;
      View3D.loadStage(music.disc, art.three, disc).then(st => { if (stageWant === want) { curStage = st; onDiscMaze = true; } }, e => console.warn('stage model', e));
    }
    if (next === S) return;
    S = next; W = S.W; H = S.H; cell = 0; sm.pac = null; sm.ghosts = [null, null, null];
  }
  /** The 3D ghost view, when the disc's models are loaded and one of the disc's mazes is in play. */
  function ghostView3D() {
    if (!onDiscMaze || !art.three || view3 === false) return null;
    if (!view3) { try { view3 = View3D.create(art.three) || false; } catch (e) { console.warn('3D view', e); view3 = false; } }
    return view3 || null;
  }
  /** The original shared screen for ghost players (layout, panels and the three 3D circles). */
  function sharedScreen() {
    if (!onDiscMaze || !art.three || !art.screens || screenView === false) return null;
    if (!screenView) {
      try {
        screenView = Screens.create(art.screens, art.three) || false;
        if (screenView) { screenView.canvas.className = 'shared'; $('stage').insertBefore(screenView.canvas, $('banner')); }
      } catch (e) { console.warn('shared screen', e); screenView = false; }
    }
    return screenView || null;
  }
  /** Pac-Man's own screen, drawn from the disc's pictures, when a disc maze is in play. */
  function pacScreenCanvas() {
    if (!art.handheld || !curDisc || pacScreen === false) return null;
    if (!pacScreen) {
      const c = document.createElement('canvas'); c.width = Handheld.W; c.height = Handheld.H; c.className = 'shared pixel';
      $('stage').insertBefore(c, $('banner'));
      pacScreen = { canvas: c, ctx: c.getContext('2d'), frame: Handheld.frame(), cam: { dy: 0 }, img: null };
    }
    return pacScreen;
  }
  const freshCache = new WeakMap();
  function freshPellets() {   // the stage's pellets as they are at the start of a round
    if (!freshCache.has(curDisc)) { const a = new Uint8Array(W * H); curDisc.rows.forEach((row, y) => [...row].forEach((ch, x) => { a[y * W + x] = ch === '.' ? 1 : ch === 'o' ? 2 : 0; })); freshCache.set(curDisc, a); }
    return freshCache.get(curDisc);
  }
  function drawPacScreen(ps, now) {
    const st = $('stage'), cw = Math.max(240, Math.min(st.clientWidth, st.clientHeight * 3 / 2));
    ps.canvas.style.width = cw + 'px'; ps.canvas.style.height = cw * 2 / 3 + 'px';
    const pacs = { pacPlayer: snap.pacPlayer };
    if (snap.phase === 'countdown') ps.cam = { dy: 0 };
    const moved = sm.pac && ps.last && Math.hypot(sm.pac.x - ps.last.x, sm.pac.y - ps.last.y) > 0.002;
    if (moved) ps.movedAt = now;
    ps.last = sm.pac ? { x: sm.pac.x, y: sm.pac.y } : null;
    const view = fxViews(now);
    const waiting = myHandoff();
    Handheld.render(art.handheld, ps.frame, {
      banner: waiting,
      seg: art.handheld.segments[curDisc.stage - 1], c0: curDisc.colOffset, r0: curDisc.rowOffset, W, H, pellets: waiting ? freshPellets() : snap.pellets,
      pac: !waiting && sm.pac ? { x: sm.pac.x, y: sm.pac.y, d: sm.pac.d, moving: now - (ps.movedAt || 0) < 120 } : null,
      ghosts: waiting ? [] : sm.ghosts.map((gh, i) => gh && snap.ghosts[i] ? { x: gh.x, y: gh.y, d: gh.d, m: snap.ghosts[i].m, seat: gcolor(i) } : null).filter(Boolean),
      pacSeat: waiting ? snap.next : snap.pacPlayer, scores: snap.scores, target: snap.target, fruit: waiting ? null : snap.fruit, frightLeft: snap.frightLeft, time: now / 1000, cam: ps.cam,
      pops: view.pops.map(p => ({ x: p.x, y: p.y, text: p.text })),
      caught: isCaught() ? (now - phaseT0) / 1000 : null
    });
    if (!ps.img) ps.img = new ImageData(ps.frame.data, Handheld.W, Handheld.H);
    ps.ctx.putImageData(ps.img, 0, 0);
  }
  const mazeOf = () => { const m = /^disc:(\d+)$/.exec($('mazeSel').value); return m ? art.mazes.find(d => d.stage === +m[1]) || null : null; };
  /** Fill the maze menu with the stages found on the disc. */
  function fillMazes() {
    const sel = $('mazeSel'), keep = store.get('pacvs.maze');
    const opt = d => `<option value="disc:${d.stage}">${esc(d.name)}</option>`;
    sel.innerHTML = '<option value="builtin">Built-in maze</option>' +
      `<optgroup label="Stages on the menu">${art.mazes.filter(d => d.official).map(opt).join('')}</optgroup>` +
      `<optgroup label="Other layouts on the disc">${art.mazes.filter(d => !d.official).map(opt).join('')}</optgroup>`;
    sel.value = [...sel.options].some(o => o.value === keep) ? keep : 'disc:1';
  }
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
      try { const w = await Sound.load(d); snd.sfx = w.sfx; snd.voice = w.voice; titleOnce(); } catch (e) { console.warn('sound', e); snd.sfx = snd.voice = null; }
      try {   // the original stage 1 maze, read from the disc's maze data
        art.mazes = MazeData.all(await d.read(MazeData.PATH), PacSim.makeMaze);
        fillMazes();
      } catch (e) { console.warn('maze', e); art.mazes = []; }
      try { art.three = await View3D.load(d); view3 = null; } catch (e) { console.warn('3D models', e); art.three = null; }
      try { art.screens = await Screens.load(d); } catch (e) { console.warn('shared screen', e); art.screens = null; }
      try { art.handheld = await Handheld.load(d, MazeData); if (pacScreen) { pacScreen.canvas.remove(); pacScreen = null; } } catch (e) { console.warn('Pac-Man screen', e); art.handheld = null; }
      if (screenView) { screenView.canvas.remove(); screenView = null; }
      st.className = 'note ok'; st.textContent = `Loaded ${d.title} (${d.id}). Original logo, sprites, music${art.three ? ', 3D ghost view' : ''} are on.`;
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
      mode = 'online'; room = m; you = m.you; setMaze(m.maze); names = m.players.map((p, i) => p.cpu ? kindName(p.kind || m.fill) + ' ' + (i + 1) : p.name);
      if (m.phase === 'lobby') { screen('lobby'); renderLobby(); } else showGame();
      return;
    }
    if (m.t === 'state') { snap = m; playEvents(m.ev); onSnap(); }
  }

  // ------------------------------------------------------------------ menu / lobby
  function playerName() { const n = $('name').value.trim() || 'Player'; store.set('pacvs.name', n); return n; }
  function toMenu(msg) {
    stopLoops();
    if (ws) { try { send({ t: 'leave' }); ws.close(); } catch { /* closing */ } }
    mode = null; room = null; offline = null; snap = null; stopMusic(); screen('menu'); setMaze(null);
    $('menuErr').textContent = msg || '';
    if (music.disc) playMusic('Pac_Op_loop73_LR', true);
  }
  function renderLobby() {
    $('roomCode').textContent = room.code;
    const host = room.host === you;
    // an empty seat: the host picks what plays it, everyone else sees the choice
    const pick = (i, k) => `<select class="kindSel" data-seat="${i}" aria-label="Seat ${i + 1}"><option value="standin"${k === 'standin' ? ' selected' : ''}>Stand-in ghost</option><option value="cpu"${k === 'cpu' ? ' selected' : ''}>Computer player</option></select>`;
    $('seats').innerHTML = room.players.map((p, i) => `<div class="seat ${i === you ? 'me' : ''}"><span class="dot" style="background:${SEAT_COLORS[i]}"></span>${p.cpu ? (host ? pick(i, p.kind || room.fill) : '<b>' + kindName(p.kind || room.fill) + '</b>') : '<b>' + esc(p.name) + '</b>'}<span class="note">${i === you ? '(you)' : ''}${i === room.host ? ' host' : ''}</span></div>`).join('');
    for (const sel of document.querySelectorAll('#seats .kindSel')) sel.onchange = () => send({ t: 'seat', i: +sel.dataset.seat, kind: sel.value });
    $('start').classList.toggle('hidden', !host);
    $('lobbyNote').textContent = host ? 'You are the host. Start whenever everyone is in.' : 'Waiting for the host to start.';
  }
  /** The colour seat ghost i wears right now (-1 = a grey stand-in): its player's, or the colour of the ghost that woke it. */
  const gcolor = i => { const c = snap.ghosts[i] && snap.ghosts[i].c; return c == null ? S.playerOfGhost(snap, i) : c; };
  // seats played by a grey stand-in ghost rather than a person or a computer player
  const standins = () => snap.kinds ? snap.kinds.map(k => k === 'standin') : [0, 1, 2, 3].map(i => snap.fill === 'standin' && !!snap.human && !snap.human[i]);
  const kindName = k => k === 'standin' ? 'Stand-in' : 'CPU';
  const seatKinds = () => ['human', $('kind1').value, $('kind2').value, $('kind3').value];
  const gcss = i => { const c = gcolor(i); return c < 0 ? GREY : SEAT_COLORS[c]; };
  const rgbOf = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  $('solo').onclick = () => {
    audio(); const opts = { start: $('soloRole').value, level: +$('soloLevel').value, target: +$('target').value, maze: mazeOf(), kinds: seatKinds() };
    store.set('pacvs.solo', JSON.stringify({ start: opts.start, level: opts.level, target: opts.target, kinds: opts.kinds })); store.set('pacvs.maze', $('mazeSel').value); startOffline(opts);
  };
  $('host').onclick = () => { audio(); $('menuErr').textContent = ''; store.set('pacvs.maze', $('mazeSel').value); connect(() => send({ t: 'create', name: playerName(), maze: mazeOf(), target: +$('target').value, kinds: seatKinds() })); };
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
  // A button for the file dialog, and drag-and-drop anywhere on the menu as a fallback for frames that block the dialog.
  $('pick').onclick = () => { try { $('disc').click(); } catch (e) { $('discStatus').className = 'note err'; $('discStatus').textContent = 'The file dialog is blocked here. Drag the disc image onto this page instead.'; } };
  const hasFile = e => e.dataTransfer && [...(e.dataTransfer.types || [])].includes('Files');
  addEventListener('dragover', e => { if (hasFile(e)) { e.preventDefault(); $('drop').classList.add('over'); } });
  addEventListener('dragleave', e => { if (!e.relatedTarget) $('drop').classList.remove('over'); });
  addEventListener('drop', e => {
    if (!hasFile(e)) return;
    e.preventDefault(); $('drop').classList.remove('over');
    const f = e.dataTransfer.files[0]; if (f) { audio(); loadDisc(f, true); }
  });

  // ------------------------------------------------------------------ offline play
  let soloOpts = { start: 'ghost', level: 1, target: 7000, maze: null };
  function startOffline(opts) {
    if (opts) soloOpts = opts;
    setMaze(soloOpts.maze);
    mode = 'offline'; you = 0; room = null;
    const kinds = soloOpts.kinds || ['human', 'standin', 'standin', 'standin'];
    names = [playerName(), ...[1, 2, 3].map(i => kindName(kinds[i]) + ' ' + i)];
    offline = { match: new PacMatch.Match(i => i === 0, undefined, soloOpts), inputs: [null, null, null, null], acc: 0, last: performance.now() };
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
  // Hand-over: after a catch the new Pac-Man says when they are ready (the original's exchange screen asks them to press Start).
  const myHandoff = () => !!(snap && snap.phase === 'handoff' && snap.next === you);
  function ready() {
    if (!myHandoff()) return false;
    if (mode === 'online') send({ t: 'ready' }); else if (offline) offline.match.ready(0);
    return true;
  }
  addEventListener('keydown', e => {
    if (e.target && e.target.tagName === 'INPUT') return;
    if (myHandoff() && e.code !== 'Escape' && e.code !== 'KeyM') { e.preventDefault(); ready(); return; }
    if (e.code in KEYS) { e.preventDefault(); if (mode) setDir(KEYS[e.code]); }
    else if (e.code === 'KeyM') { music.enabled = !music.enabled; if (!music.enabled) stopMusic(); else onSnap(true); }
    else if (e.code === 'Escape' && mode) toMenu();
  });
  document.querySelectorAll('#pad button').forEach(b => { b.addEventListener('pointerdown', e => { e.preventDefault(); setDir(+b.dataset.d); }); });
  let tx = 0, ty = 0;
  const cv = $('cv'), g = cv.getContext('2d');
  $('stage').addEventListener('pointerdown', () => { ready(); });
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
      if (myHandoff() && ((p.buttons[0] && p.buttons[0].pressed) || (p.buttons[9] && p.buttons[9].pressed))) { ready(); break; }
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
  // Effects on the shared screen: points floating over whoever scored, stars when the fruit goes, the catch impact.
  const fx = { pops: [], sparkle: -1, burst: null }, FX_POP = 1.3, FX_BURST = 1.1, FX_SPARK = 0.8;
  let fxPrev = null;
  function fxDetect(cur) {
    const prev = fxPrev; fxPrev = cur;
    const now = performance.now();
    if (!prev || (cur.phase === 'countdown' && prev.phase !== 'countdown')) {
      fx.pops.length = 0; fx.sparkle = -1; fx.burst = null;
      if (cur.phase === 'countdown') { snd.said.clear(); fire('ready'); }     // "Ready?" as the countdown begins
      return;
    }
    const near = (a, b, d) => a && b && Math.hypot(a.x - b.x, a.y - b.y) < d;
    announce(prev, cur);
    if (prev.fruitUp && !cur.fruitUp && cur.phase === 'play') {
      fx.sparkle = now;
      const f = prev.fruit, gi = f ? cur.ghosts.findIndex(g => g.m !== 'e' && near(g, f, 1.2)) : -1;
      if (gi >= 0) { fx.pops.push({ x: cur.ghosts[gi].x, y: cur.ghosts[gi].y, text: String(CFG.fruitPts), t0: now }); fire('fruitGhost', { index: S.playerOfGhost(cur, gi) }); }
      else if (f && near(cur.pac, f, 1.2)) { fx.pops.push({ x: cur.pac.x, y: cur.pac.y, text: String(CFG.fruitPts), t0: now }); fire('fruitPac'); }
    }
    cur.ghosts.forEach((g, i) => {
      const p = prev.ghosts[i];
      if (p && p.m === 'f' && g.m === 'e') fx.pops.push({ x: g.x, y: g.y, text: String(Math.max(0, cur.scores[cur.pacPlayer] - prev.scores[cur.pacPlayer])), t0: now });
    });
    if (prev.phase === 'play' && cur.phase === 'roundover' && cur.why === 'caught') {
      const p = cur.pac || prev.pac;
      if (p) { fx.burst = { x: p.x, y: p.y, t0: now }; fx.pops.push({ x: p.x, y: p.y, text: String(cur.steal), t0: now }); }
    }
  }
  // The announcer's lines, picked from changes between two snapshots (the same on every client).
  function announce(prev, cur) {
    if (cur.phase !== prev.phase) {
      if (cur.phase === 'play' && prev.phase === 'countdown') fire('go');
      else if (cur.phase === 'roundover' && cur.why === 'caught') fire('caught', { index: cur.catcher });
      else if (cur.phase === 'roundover' && cur.why === 'cleared') fire('mazeCleared');
      else if (cur.phase === 'final') { fire('final'); fire('champion', { index: cur.winner >= 0 ? cur.winner : 0 }); }
    }
    if (cur.phase !== 'play') { snd.round = null; stopLoops(); return; }
    setLoop('frightLoop', cur.frightLeft > 0 && cur.ghosts.some(g => g.m === 'f'));
    setLoop('eyesLoop', cur.ghosts.some(g => g.m === 'e'));
    // timed encouragement, counted from the start of each round (so it begins again after a clear or a catch)
    if (!snd.round || cur.tick < snd.round.tick0) snd.round = { tick0: cur.tick, done: new Set() };
    const played = (cur.tick - snd.round.tick0) / 30;
    for (const ev of SoundMap.EVENTS) if (ev.after && played >= ev.after && !snd.round.done.has(ev.id)) { snd.round.done.add(ev.id); fire(ev.id); }
    if (!prev.fruitUp && cur.fruitUp) fire('fruitAppears');
    if (cur.frightLeft > prev.frightLeft + 5) fire(snap && snap.me >= 0 ? 'powerGhost' : 'powerPac');
    if (cur.frightLeft > prev.frightLeft + 5) snd.chain = 0;
    cur.ghosts.forEach((g, i) => { if (prev.ghosts[i] && prev.ghosts[i].m === 'f' && g.m === 'e') fire('eatGhost', { index: snd.chain++ || 0 }); });
    if (cur.left <= 20 && prev.left > 20) fire('twentyLeft');
    if (cur.left <= 10 && prev.left > 10) fire('tenLeft');
    const top = Math.max(...cur.scores), toGo = cur.target - top;
    if (toGo <= 500 && !snd.said.has(500)) { snd.said.add(500); snd.said.add(1000); fire('pts500'); }
    else if (toGo <= 1000 && !snd.said.has(1000)) { snd.said.add(1000); fire('pts1000'); }
  }
  function fxViews(now) {
    fx.pops = fx.pops.filter(p => now - p.t0 < FX_POP * 1000);
    return {
      pops: fx.pops.map(p => ({ x: p.x, y: p.y, text: p.text, age: (now - p.t0) / 1000, life: FX_POP })),
      burst: fx.burst && now - fx.burst.t0 < FX_BURST * 1000 ? { x: fx.burst.x, y: fx.burst.y, age: (now - fx.burst.t0) / 1000 } : null
    };
  }
  const isCaught = () => snap && snap.phase === 'roundover' && snap.why === 'caught';
  let hudKey = '', phaseT0 = 0, exchangeT0 = 0;
  // Screens drawn from the disc between rounds: the exchange after a catch (through the hand-over) and the final results.
  const discScreen = () => (snap && (((snap.phase === 'roundover' || snap.phase === 'handoff') && snap.why === 'caught') || snap.phase === 'final') && art.screens) ? sharedScreen() : null;
  function onSnap(force) {
    if (!snap) return;
    fxDetect(snap);
    if (snap.phase !== lastPhase || force) {
      if (snap.phase !== lastPhase) {
        phaseT0 = performance.now();
        if (snap.phase === 'roundover') exchangeT0 = phaseT0 + (snap.why === 'caught' ? PacMatch.CAUGHT * 1000 : 0);
        if (snap.phase === 'handoff' && snap.next === you) { tone(660, 0.1, 'square', 0.12); setTimeout(() => tone(990, 0.18, 'square', 0.12), 110); }
      }
      if (snap.phase === 'countdown' && snap.phase !== lastPhase) lastDir = -1;
      lastPhase = snap.phase;
      if (snap.phase === 'countdown' || snap.phase === 'play') playMusic(GAME_TRACKS[(snap.round || 0) % 4], true); else stopMusic();
    }
    if (snap.phase === 'countdown') { const c = Math.ceil(snap.left_t); if (c !== lastCount) { lastCount = c; tone(c > 0 ? 520 : 880, 0.12, 'square', 0.1); } }
    renderHud(); renderBanner();
  }
  const fmt = n => n.toLocaleString('en-US');
  function renderHud() {
    const handoff = snap.phase === 'handoff', pacSeat = handoff ? snap.next : snap.pacPlayer;
    const key = JSON.stringify([snap.scores, pacSeat, handoff, names, snap.target, snap.left, snap.round, snap.phase]);
    if (key === hudKey) return; hudKey = key;
    $('hud').innerHTML = [0, 1, 2, 3].map(i => {
      const pac = i === pacSeat;
      return `<div class="pl ${i === you ? 'me' : ''} ${pac ? 'pacrole' : ''}"><div class="n"><span class="dot" style="background:${SEAT_COLORS[i]};border-radius:${pac ? '50% 50% 50% 50%' : '50% 50% 3px 3px'}"></span>${esc(names[i])}${pac ? ` <span class="note">${handoff ? 'Pac-Man next' : 'Pac-Man'}</span>` : ''}</div><div class="s">${fmt(snap.scores[i])}</div></div>`;
    }).join('');
    const pacMe = handoff ? snap.next === you : snap.me < 0;
    $('roleTxt').textContent = (handoff ? (pacMe ? 'You are Pac-Man next' : 'You are a ghost next round') : pacMe ? 'You are Pac-Man' : 'You are a ghost') + ` · first to ${fmt(snap.target)} wins`;
    $('timeTxt').textContent = `${snap.left} pellets left`;
  }
  function renderBanner() {
    const b = $('banner'); let html = '';
    const pacMe = snap.me < 0, pn = names[snap.pacPlayer];
    const onDisc = !!discScreen();
    if (snap.phase === 'handoff') {
      const secs = Math.ceil(snap.left_t), nx = names[snap.next];
      html = myHandoff()
        ? `<div class="handoff"><div class="big">You are Pac-Man next</div><div class="sm">Press any key or tap when ready · starts in ${secs} s</div><button class="primary" id="readyBtn">Ready</button></div>`
        : `<div class="handoff"><div class="big">${esc(nx)} is Pac-Man next</div><div class="sm">Waiting for ${esc(nx)} to get ready · ${secs} s</div></div>`;
    } else if (onDisc && snap.phase === 'roundover') html = '';
    else if (onDisc && snap.phase === 'final') {
      const canAgain = mode === 'offline' || (room && room.host === you);
      html = `<div class="row" style="justify-content:center;flex:none;margin-top:auto">${canAgain ? '<button class="primary" id="again">Play again</button>' : '<span class="sm">Waiting for the host…</span>'}<button id="quit">Back to menu</button></div>`;
    } else if (snap.phase === 'countdown') {
      html = `<div class="big">${Math.min(3, Math.max(1, Math.ceil(snap.left_t)))}</div><div class="sm">${pacMe ? `You are Pac-Man with ${fmt(snap.scores[snap.pacPlayer])} points. Eat pellets. If a ghost catches you it steals 1,600.` : `${esc(pn)} is Pac-Man. Catch Pac-Man to steal 1,600 points and become Pac-Man yourself.`}</div>`;
    } else if (snap.phase === 'roundover') {
      if (snap.why === 'caught') html = `<div class="big">${esc(names[snap.catcher])} caught Pac-Man</div><div class="sm">${esc(names[snap.catcher])} takes ${fmt(snap.steal)} points from ${esc(pn)} and is Pac-Man next round.</div>`;
      else if (snap.why === 'cleared') html = `<div class="big">Maze cleared</div><div class="sm">${esc(pn)} keeps ${fmt(snap.scores[snap.pacPlayer])} points.</div>`;
      else html = `<div class="big">${esc(names[snap.winner])} reaches ${fmt(snap.target)}</div>`;
    } else if (snap.phase === 'final') {
      const order = [0, 1, 2, 3].sort((a, b) => snap.scores[b] - snap.scores[a]);
      const canAgain = mode === 'offline' || (room && room.host === you);
      html = `<div class="big">${esc(names[snap.winner >= 0 ? snap.winner : order[0]])} wins</div><div class="sm">${order.map((i, k) => `${k + 1}. ${esc(names[i])} ${fmt(snap.scores[i])}`).join('<br>')}</div>` +
        `<div class="row" style="justify-content:center;flex:none">${canAgain ? '<button class="primary" id="again">Play again</button>' : '<span class="sm">Waiting for the host…</span>'}<button id="quit">Back to menu</button></div>`;
    }
    if (b.dataset.h !== html) {
      b.dataset.h = html; b.innerHTML = html; b.style.background = html && !onDisc ? 'rgba(5,6,15,0.62)' : 'transparent';
      const a = $('again'); if (a) a.onclick = () => { if (mode === 'online') send({ t: 'start' }); else startOffline(); };
      const q = $('quit'); if (q) q.onclick = () => toMenu();
      const r = $('readyBtn'); if (r) r.onclick = () => ready();
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
      const a = sm.pacAng === null ? [-Math.PI / 2, 0, Math.PI / 2, Math.PI][p.d] : sm.pacAng;
      if (Math.cos(a) < -0.01) { g.scale(-1, 1); g.rotate(Math.PI - a); } else g.rotate(a);   // turned past vertical: mirror, so he stays the right way up
      g.drawImage(f, -r * 1.15, -r * 1.15, r * 2.3, r * 2.3); g.restore(); return;
    }
    const open = (Math.sin(now / 70) + 1) / 2 * 0.65 + 0.05, a = sm.pacAng === null ? [-Math.PI / 2, 0, Math.PI / 2, Math.PI][p.d] : sm.pacAng;
    g.fillStyle = '#ffd400'; g.beginPath(); g.moveTo(x, y); g.arc(x, y, r, a + open, a + Math.PI * 2 - open); g.closePath(); g.fill();
  }
  // Pac-Man's trail on the flat board: a ribbon in his player's colour that fades towards the tail.
  function drawTrail(u) {
    const tr = snap.trail; if (!tr || !tr.length) return;
    const pts = []; let last = sm.pac ? [sm.pac.x, sm.pac.y] : null;
    if (last) pts.push([last[0], last[1], 0]);
    for (let i = tr.length - 1; i >= 0; i--) { const [x, y, age] = tr[i]; if (last && Math.abs(x - last[0]) > W / 2) break; pts.push([x, y, age]); last = [x, y]; }
    const col = SEAT_COLORS[snap.pacPlayer];
    g.lineCap = 'round'; g.lineJoin = 'round'; g.lineWidth = u * 0.78;
    for (let i = 1; i < pts.length; i++) {
      g.globalAlpha = 0.85 * Math.min(1, Math.max(0, 1 - pts[i][2] / CFG.trailTime) / 0.4); g.strokeStyle = col;
      g.beginPath(); g.moveTo(pts[i - 1][0] * u, pts[i - 1][1] * u); g.lineTo(pts[i][0] * u, pts[i][1] * u); g.stroke();
    }
    g.globalAlpha = 1;
  }
  function drawFruit(f, u, now) {
    const x = f.x * u, y = f.y * u + Math.sin(now / 250) * u * 0.05, r = u * 0.2;
    g.strokeStyle = '#3fbf3f'; g.lineWidth = u * 0.08; g.beginPath(); g.moveTo(x - r * 0.9, y + r * 0.2); g.quadraticCurveTo(x - r * 0.4, y - r * 2.2, x + r * 1.1, y - r * 2.4); g.moveTo(x + r * 0.9, y + r * 0.2); g.quadraticCurveTo(x + r * 0.7, y - r * 1.6, x + r * 1.1, y - r * 2.4); g.stroke();
    g.fillStyle = '#e5231b'; for (const dx of [-0.9, 0.9]) { g.beginPath(); g.arc(x + dx * r, y + r * 0.6, r * 1.1, 0, 7); g.fill(); g.fillStyle = '#ff8a80'; g.beginPath(); g.arc(x + dx * r - r * 0.3, y + r * 0.2, r * 0.3, 0, 7); g.fill(); g.fillStyle = '#e5231b'; }
  }
  function drawGhost(gh, color, u, now, mine) {
    const x = gh.x * u, y = gh.y * u, r = u * 0.46;
    if (mine) { g.strokeStyle = '#ffffff'; g.lineWidth = u * 0.08; g.beginPath(); g.arc(x, y, r + u * 0.16, 0, 7); g.stroke(); }
    const eyes = () => {
      const ox = [0, 1, 0, -1][gh.d] * r * 0.18, oy = [-1, 0, 1, 0][gh.d] * r * 0.18;
      for (const s of [-1, 1]) { g.fillStyle = '#fff'; g.beginPath(); g.ellipse(x + s * r * 0.38, y - r * 0.2, r * 0.26, r * 0.32, 0, 0, 7); g.fill(); g.fillStyle = '#1a2cff'; g.beginPath(); g.arc(x + s * r * 0.38 + ox, y - r * 0.2 + oy, r * 0.13, 0, 7); g.fill(); }
    };
    if (gh.m === 'e') { eyes(); return; }
    const fright = gh.m === 'f', flash = fright && snap.frightLeft < CFG.frightFlash && Math.floor(now / 134) % 2;
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
    sm.pac = approach(sm.pac, snap.respawning ? null : snap.pac, dt);
    // Pac-Man turns round smoothly instead of snapping to his new heading
    if (sm.pac) {
      const want = [-Math.PI / 2, 0, Math.PI / 2, Math.PI][sm.pac.d];
      if (sm.pacAng === null) sm.pacAng = want;
      sm.pacAng += Math.atan2(Math.sin(want - sm.pacAng), Math.cos(want - sm.pacAng)) * Math.min(1, dt * 16);
    } else sm.pacAng = null;
    snap.ghosts.forEach((gh, i) => { sm.ghosts[i] = approach(sm.ghosts[i], gh, dt); });
    // Ghost players with the disc get the original shared screen; Pac-Man keeps the full maze.
    // Everyone sees the exchange and results screens.
    // the next Pac-Man, while the game waits for them, gets Pac-Man's own screen with its "Press START!" sign
    const waiting = myHandoff() && art.handheld && curDisc && pacScreenCanvas();
    const between = waiting ? null : discScreen(), scr = between || (!waiting && snap.me >= 0 ? sharedScreen() : null);
    const hh = waiting || (!scr && snap.me < 0 ? pacScreenCanvas() : null);
    cv.style.display = scr || hh ? 'none' : '';
    if (pacScreen) pacScreen.canvas.style.display = hh ? '' : 'none';
    if (screenView) screenView.canvas.style.display = scr ? '' : 'none';
    if (between) { drawBetween(between, now, dt); return; }
    if (scr) { drawShared(scr, now, dt); return; }
    if (hh) { try { drawPacScreen(hh, now); } catch (e) { console.warn('Pac-Man screen', e); pacScreen.canvas.remove(); pacScreen = false; } return; }
    layout(); const u = cell * dpr;
    g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(mazeCv, 0, 0);
    const pel = snap.pellets;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const v = pel[y * W + x]; if (!v) continue;
      g.fillStyle = '#ffd9b0'; g.beginPath();
      g.arc((x + 0.5) * u, (y + 0.5) * u, v === 2 ? u * (0.2 + 0.05 * Math.sin(now / 120)) : u * 0.09, 0, 7); g.fill();
    }
    if (snap.fruit) drawFruit(snap.fruit, u, now);
    sm.ghosts.forEach((gh, i) => { if (gh && snap.ghosts[i] && snap.ghosts[i].m !== 'r') drawGhost(gh, gcss(i), u, now, snap.me === i); });
    drawTrail(u);
    if (sm.pac) drawPac(sm.pac, u, now, snap.me < 0);
    // Ghost players see a circular window around themselves, a minimap of the ghosts, and the pellet count.
    if (snap.me >= 0 && sm.ghosts[snap.me]) {
      const f = fogCv.getContext('2d'), me = sm.ghosts[snap.me], col = SEAT_COLORS[you];
      f.globalCompositeOperation = 'source-over'; f.clearRect(0, 0, fogCv.width, fogCv.height);
      f.fillStyle = 'rgba(1,2,8,0.965)'; f.fillRect(0, 0, fogCv.width, fogCv.height);
      f.globalCompositeOperation = 'destination-out';
      const R = tweenSight(snap.me, snap.sight || CFG.ghostSight, now) * u;
      // the ghost players share one screen, so every ghost's circle is open
      f.fillStyle = '#000';
      sm.ghosts.forEach((gh, i) => { const sg = snap.ghosts[i]; if (gh && sg && sg.m !== 'r') { f.beginPath(); f.arc(gh.x * u, gh.y * u, tweenSight(i, sg.s || CFG.ghostSight, now) * u, 0, 7); f.fill(); } });
      g.drawImage(fogCv, 0, 0);
      const v3 = ghostView3D();
      if (v3) draw3D(v3, me, R, now, dt);
      g.strokeStyle = col; g.lineWidth = Math.max(3, u * 0.16); g.beginPath(); g.arc(me.x * u, me.y * u, R, 0, 7); g.stroke();
      if (!v3) drawGhost(me, col, u, now, true);
      drawMinimap(u);
    }
  }
  // The ghost's circle drawn in 3D from the disc's models, camera following the ghost.
  function draw3D(v3, me, R, now, dt) {
    const ghosts = [];
    sm.ghosts.forEach((gh, i) => {
      const s = snap.ghosts[i]; if (!gh || !s || s.m === 'r') return;
      const target = View3D.YAW[gh.d] || 0;
      let dy = target - sm.yaw[i]; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      sm.yaw[i] += dy * Math.min(1, dt * 14);
      ghosts.push({ x: gh.x, y: gh.y, m: gh.m, yaw: sm.yaw[i], seat: S.playerOfGhost(snap, i), c: gcolor(i) });
    });
    const flash = snap.frightLeft < CFG.frightFlash && Math.floor(now / 134) % 2 === 1;
    let img;
    try {
      img = v3.render({ trail: snap.trail, trailTime: CFG.trailTime, trailColor: rgbOf(SEAT_COLORS[snap.pacPlayer]), dim: snap.frightLeft > 0 ? 1 : 0, stage: curStage, size: 2 * R, me, zoom: R / u3() / CFG.ghostSight, ghosts, pac: pacView(), pellets: snap.pellets, W, H, fruit: snap.fruit, flash, time: now / 1000, burst: fxViews(now).burst });
    } catch (e) { console.warn('3D view', e); view3 = false; return; }
    g.save(); g.beginPath(); g.arc(me.x * u3(), me.y * u3(), R, 0, 7); g.clip();
    g.drawImage(img, me.x * u3() - R, me.y * u3() - R, 2 * R, 2 * R);
    g.restore();
  }
  const u3 = () => cell * dpr;
  const pacView = () => sm.pac && Object.assign({}, sm.pac, { yaw: Math.PI / 2 - (sm.pacAng === null ? 0 : sm.pacAng), hit: isCaught() });
  function fitScreen(scr) {
    const st = $('stage'), cw = Math.max(200, Math.min(st.clientWidth, st.clientHeight * 4 / 3));
    scr.canvas.style.width = cw + 'px'; scr.canvas.style.height = cw * 3 / 4 + 'px';
    return cw * Math.min(2, window.devicePixelRatio || 1);
  }
  function drawBetween(scr, now, dt) {
    const w = fitScreen(scr), t = (now - phaseT0) / 1000;
    if (isCaught() && t < PacMatch.CAUGHT) { drawShared(scr, now, dt, { t, total: PacMatch.CAUGHT, seat: snap.catcher }); return; }
    try {
      if (snap.phase === 'final') {
        const order = [0, 1, 2, 3].sort((a, b) => snap.scores[b] - snap.scores[a]);
        scr.results({ time: t, scores: snap.scores, winner: snap.winner >= 0 ? snap.winner : order[0], pacPlayer: snap.pacPlayer, standin: standins() }, w);
      } else {
        const after = snap.scores.slice(), before = after.slice();
        before[snap.pacPlayer] += snap.steal; before[snap.catcher] -= snap.steal;
        scr.exchange({ time: (now - exchangeT0) / 1000, target: snap.target, before, after, loser: snap.pacPlayer, winner: snap.catcher, pacPlayer: snap.pacPlayer, standin: standins() }, w);
      }
    } catch (e) { console.warn('shared screen', e); screenView.canvas.remove(); screenView = false; }
  }
  // The shared screen: every ghost's circle (one per ghost slot: a player keeps theirs from round to round), panels, radar and counters.
  function drawShared(scr, now, dt, caught) {
    const cw = fitScreen(scr);
    const ghosts = [];
    sm.ghosts.forEach((gh, i) => {
      const s = snap.ghosts[i]; if (!gh || !s) return;
      let dy = (View3D.YAW[gh.d] || 0) - sm.yaw[i]; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      sm.yaw[i] += dy * Math.min(1, dt * 14);
      ghosts.push({ i, seat: S.playerOfGhost(snap, i), c: gcolor(i), x: gh.x, y: gh.y, m: gh.m, yaw: sm.yaw[i], s: tweenSight(i, s.s || CFG.ghostSight, now), hidden: s.m === 'r' });
    });
    const flash = snap.frightLeft < CFG.frightFlash && Math.floor(now / 134) % 2 === 1;
    const shown = ghosts.filter(g => !g.hidden);
    const efx = fxViews(now);
    const views = ghosts.map(g => ({ trail: snap.trail, trailTime: CFG.trailTime, trailColor: rgbOf(SEAT_COLORS[snap.pacPlayer]), dim: snap.frightLeft > 0 ? 1 : 0, stage: curStage, me: g, zoom: g.s / CFG.ghostSight, ghosts: shown, pac: pacView(), pellets: snap.pellets, W, H, fruit: snap.fruit, flash, pops: efx.pops, burst: efx.burst }));
    try {
      scr.render({ sparkle: fx.sparkle >= 0 ? (now - fx.sparkle) / 1000 : undefined, caught, time: now / 1000, target: snap.target, left: snap.left, scores: snap.scores, pacPlayer: snap.pacPlayer, standin: standins(), fruitUp: snap.fruitUp, ghosts, views, W, H }, cw);
    } catch (e) { console.warn('shared screen', e); screenView.canvas.remove(); screenView = false; cv.style.display = ''; }
  }
  function drawMinimap(u) {
    const w = 5.6 * u, h = 5.2 * u, x0 = W * u - w - 0.5 * u, y0 = H * u - h - 0.5 * u;
    g.fillStyle = 'rgba(255,190,0,0.95)'; g.fillRect(x0 - 0.15 * u, y0 - 1.65 * u, w + 0.3 * u, h + 1.8 * u);
    g.fillStyle = '#0a1a8a'; g.fillRect(x0, y0, w, h);
    g.fillStyle = '#ffd400'; g.font = `bold ${Math.round(u * 1.0)}px ui-monospace, monospace`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(String(snap.left), x0 + w / 2, y0 - 0.82 * u);
    snap.ghosts.forEach((gh, i) => {
      if (!gh) return;
      g.fillStyle = gcss(i);
      g.fillRect(x0 + (gh.x / W) * w - 0.28 * u, y0 + (gh.y / H) * h - 0.28 * u, 0.56 * u, 0.56 * u);
    });
    g.textAlign = 'start'; g.textBaseline = 'alphabetic';
  }

  // ------------------------------------------------------------------ boot
  $('name').value = store.get('pacvs.name') || '';
  try { const o = JSON.parse(store.get('pacvs.solo') || 'null'); if (o) { $('soloRole').value = o.start; $('soloLevel').value = String(o.level); $('target').value = String(o.target); if (o.kinds) [1, 2, 3].forEach(i => { if (o.kinds[i] === 'cpu' || o.kinds[i] === 'standin') $('kind' + i).value = o.kinds[i]; }); else if (o.fill === 'cpu') [1, 2, 3].forEach(i => { $('kind' + i).value = 'cpu'; }); } } catch { /* defaults */ }
  const qr = new URLSearchParams(location.search).get('room');
  if (qr) { $('code').value = qr.toUpperCase().slice(0, 4); $('menuErr').textContent = 'Enter your name and press Join to enter room ' + $('code').value + '.'; }
  idbGet('disc').then(b => { if (b) loadDisc(b, false); }).catch(() => { /* no saved disc */ });
  addEventListener('resize', () => { cell = 0; });
  document.addEventListener('visibilitychange', () => { if (document.hidden) stopMusic(); else if (mode) onSnap(true); });
  window.__pacvs = { get snap() { return snap; }, get mode() { return mode; }, get art() { return art; }, get disc() { return music.disc; }, get offline() { return offline; } };   // for automated tests
})();
