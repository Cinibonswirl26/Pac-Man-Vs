/* The ghosts' shared screen, as in the original: the layout `pac_game.blo` from the player's disc (scrolling
 * background, target score, pellet counter, player panels, radar, fruit window), drawn with the disc's
 * textures, materials and font, plus one 3D circle per ghost. Browser only (WebGL). */
(function (root) {
  'use strict';
  const TVW = 640, TVH = 480;                          // the original's picture
  // How the 608 x 448 layout lands on the 640 x 480 picture: scaled by 640/608 both ways and 2 px down
  // (fitted against the original's picture over the panels, counter, radar and score).
  const MAP = { sx: TVW / 608, sy: TVW / 608, ox: 0, oy: 2 };
  // Ghost circles measured on the original's picture: first two ghosts (by player number) on top, the third below.
  const SLOTS = [{ x: 145, y: 146 }, { x: 495, y: 146 }, { x: 319, y: 330 }];
  const R_RING = 126, R_VIEW = 121;

  async function load(disc) {
    const tex = new Map(), arcs = {};
    for (const n of ['PAC_game', 'PAC_exchange', 'PAC_results']) {
      const arc = arcs[n] = Disc.rarc(Disc.yaz0(await disc.read('PROOT/Screen/' + n + '.szs')));
      for (const [k, v] of arc) if (/\.bti$/i.test(k)) tex.set(k.split('/').pop().toLowerCase(), Disc.decodeBTI(v));
    }
    const btk = [...arcs.PAC_game].find(([k]) => /\.btk$/i.test(k));
    return {
      game: J2D.parseBLO(arcs.PAC_game.get('scrn/pac_game.blo')),
      mes: J2D.parseBLO(arcs.PAC_game.get('scrn/pac_game_mes.blo')),
      exchange: J2D.parseBLO(arcs.PAC_exchange.get('scrn/pac_exchange_time.blo')),
      results: J2D.parseBLO(arcs.PAC_results.get('scrn/pac_results.blo')),
      font: J2D.parseBFN(arcs.PAC_game.get('font/lowdy.bfn')),
      bgAnim: btk ? J3D.parseBTK(btk[1]) : null,
      tex
    };
  }

  // A plain material: texture x vertex colour, blended by alpha.
  const MODULATE = {
    name: 'modulate', cull: 0, matColor: [[1, 1, 1, 1], [1, 1, 1, 1]], ambColor: [[0, 0, 0, 0], [0, 0, 0, 0]],
    chans: [{ lighting: false, matSrc: 1 }, { lighting: false, matSrc: 1 }, null, null],
    texGenNum: 1, texGens: [{ type: 1, src: 4, mtx: 60 }], texMtx: [], textures: [0, -1, -1, -1, -1, -1, -1, -1],
    kColors: [[1, 1, 1, 1], [1, 1, 1, 1], [1, 1, 1, 1], [1, 1, 1, 1]], tevColors: [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]],
    tevStageNum: 1, stages: [{ order: { texCoord: 0, texMap: 0, chan: 4 }, swap: { ras: 0, tex: 0 }, kc: 12, ka: 28,
      op: { color: { a: 15, b: 10, c: 8, d: 15, op: 0, bias: 0, scale: 0, clamp: 1, reg: 0 }, alpha: { a: 7, b: 5, c: 4, d: 7, op: 0, bias: 0, scale: 0, clamp: 1, reg: 0 } } }],
    swapTables: [[0, 1, 2, 3], [0, 1, 2, 3], [0, 1, 2, 3], [0, 1, 2, 3]], alphaComp: null,
    blend: { type: 1, src: 4, dst: 5 }, zMode: { enable: false, func: 7, write: false }
  };

  function create(assets, three) {
    const canvas = document.createElement('canvas');
    canvas.width = TVW; canvas.height = TVH;
    const gl = canvas.getContext('webgl', { antialias: true, alpha: false, stencil: true, premultipliedAlpha: false });
    if (!gl) return null;
    const R = GX.renderer(gl), M = GX.mat4, scr = assets.game;
    const scene = three ? View3D.scene(three, R) : null;
    const glTex = new Map();
    const texture = name => {
      if (!name) return null;
      const k = name.toLowerCase();
      if (!glTex.has(k)) { const t = assets.tex.get(k); glTex.set(k, t ? R.texture(t) : null); }
      return glTex.get(k);
    };
    const sheets = assets.font.sheets.map(s => R.texture(Object.assign({}, s, { wrapS: 0, wrapT: 0 })));
    // Arrangement levels: the fruit window shows the capsule that is out instead of the cherry. Generated icons, the
    // same two-tone pill as on the board, registered under 'pill:<kind>' so the layout can name them like a disc texture.
    const PILL_RGB = { red: [255, 40, 40], cyan: [60, 230, 255], pink: [255, 110, 200], orange: [255, 150, 30], gold: [255, 215, 40] };
    for (const k in PILL_RGB) {
      const n = 40, rgba = new Uint8Array(n * n * 4), c = PILL_RGB[k];
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        const u = (x - 19.5) + (y - 19.5) * 0.35, v = y - 19.5, inside = Math.abs(u) <= 7.5 && Math.abs(v) <= 16 && (Math.abs(v) <= 8.5 || Math.hypot(u, Math.abs(v) - 8.5) <= 7.5);
        const i = (y * n + x) * 4, top = v < 0, shade = 0.75 + 0.25 * Math.max(0, 1 - Math.abs(u + 2.5) / 7.5);
        rgba[i] = (top ? 255 : c[0]) * shade; rgba[i + 1] = (top ? 255 : c[1]) * shade; rgba[i + 2] = (top ? 255 : c[2]) * shade; rgba[i + 3] = inside ? 255 : 0;
      }
      glTex.set('pill:' + k, R.texture({ w: n, h: n, rgba, wrapS: 0, wrapT: 0, magFilter: 1, minFilter: 1 }));
    }
    // Panel colours: each player's frame material holds that player's colour in its first TEV register.
    const seatColor = [1, 2, 3, 4].map(i => { const p = scr.byName['P' + i + '_waku']; return p ? scr.materials[p.material].tevColors[0].slice(0, 3) : [1, 1, 1]; });

    // ---- layout geometry
    const box = (p, ox, oy) => {
      const ax = p.anchor % 3, ay = Math.floor(p.anchor / 3);
      const x = ox + p.x - ax * p.w / 2, y = oy + p.y - ay * p.h / 2;
      return { x, y, w: p.w, h: p.h };
    };
    const tvx = x => x * MAP.sx + MAP.ox, tvy = y => y * MAP.sy + MAP.oy;
    const quadAt = (mat, tex, b, uv, cols, opts) => {
      uv = uv || [[0, 0], [1, 0], [0, 1], [1, 1]];
      cols = cols || [[1, 1, 1, 1], [1, 1, 1, 1], [1, 1, 1, 1], [1, 1, 1, 1]];
      const x0 = tvx(b.x), y0 = tvy(b.y), x1 = tvx(b.x + b.w), y1 = tvy(b.y + b.h);
      R.quad(mat, tex, [
        { x: x0, y: y0, u: uv[0][0], v: uv[0][1], c: cols[0] }, { x: x1, y: y0, u: uv[1][0], v: uv[1][1], c: cols[1] },
        { x: x1, y: y1, u: uv[3][0], v: uv[3][1], c: cols[3] }, { x: x0, y: y1, u: uv[2][0], v: uv[2][1], c: cols[2] }
      ], opts);
    };
    const tint = (cols, m) => cols.map(c => [c[0] * m[0], c[1] * m[1], c[2] * m[2], c[3] * m[3]]);

    function drawPicture(mats, p, b, st) {
      const m = mats[p.material], over = st.textures && st.textures[p.name], col = st.colors && st.colors[p.name];
      const opts = {};
      if (st.texMtx && st.texMtx[m.name]) opts.texMtx = st.texMtx[m.name];
      // the player colours live in the pane's colour registers: st.colors gives the whole set, or an [r, g, b] for the first
      if (col) opts.tevColors = Array.isArray(col[0]) ? col : [[col[0], col[1], col[2], (m.tevColors[0] || [0, 0, 0, 1])[3]]].concat(m.tevColors.slice(1));
      quadAt(m, i => texture(over && i === 0 ? over : m.textureNames[i]), b, p.uv, tint(p.colors, m.matColor[0]), opts);
    }
    function drawWindow(mats, p, b) {
      const fm = mats[p.frameMaterials[0]], ft = i => texture(fm.textureNames[i]);
      const t = assets.tex.get((fm.textureNames[0] || '').toLowerCase()), cw = t ? t.w : 16, ch = t ? t.h : 16;
      const white = [[1, 1, 1, 1], [1, 1, 1, 1], [1, 1, 1, 1], [1, 1, 1, 1]];
      const { x, y, w, h } = b;
      // content first, then the four corners (mirrored) and the edges stretched from the corners' inner texels
      const cm = mats[p.material];
      if (w > 2 * cw && h > 2 * ch) quadAt(cm, () => null, { x: x + cw, y: y + ch, w: w - 2 * cw, h: h - 2 * ch }, null, tint(p.colors, cm.matColor[0]));
      const e = 1 - 0.5 / cw;
      quadAt(fm, ft, { x, y, w: cw, h: ch }, [[0, 0], [1, 0], [0, 1], [1, 1]], white);
      quadAt(fm, ft, { x: x + w - cw, y, w: cw, h: ch }, [[1, 0], [0, 0], [1, 1], [0, 1]], white);
      quadAt(fm, ft, { x, y: y + h - ch, w: cw, h: ch }, [[0, 1], [1, 1], [0, 0], [1, 0]], white);
      quadAt(fm, ft, { x: x + w - cw, y: y + h - ch, w: cw, h: ch }, [[1, 1], [0, 1], [1, 0], [0, 0]], white);
      if (w > 2 * cw) {
        quadAt(fm, ft, { x: x + cw, y, w: w - 2 * cw, h: ch }, [[e, 0], [e, 0], [e, 1], [e, 1]], white);
        quadAt(fm, ft, { x: x + cw, y: y + h - ch, w: w - 2 * cw, h: ch }, [[e, 1], [e, 1], [e, 0], [e, 0]], white);
      }
      if (h > 2 * ch) {
        quadAt(fm, ft, { x, y: y + ch, w: cw, h: h - 2 * ch }, [[0, e], [1, e], [0, e], [1, e]], white);
        quadAt(fm, ft, { x: x + w - cw, y: y + ch, w: cw, h: h - 2 * ch }, [[1, e], [0, e], [1, e], [0, e]], white);
      }
    }
    // Text with the disc's font. hBind: 0 centre, 1 right, 2 left (J2D); top colour -> bottom colour gradient.
    function drawText(mat, str, b, o) {
      const F = assets.font, G = F.glyph; if (!G) return;
      const sx = o.fontW / G.cw, sy = o.fontH / G.ch;
      const gl_ = [...String(str)].map(ch => J2D.glyph(F, ch.charCodeAt(0))).filter(Boolean);
      const width = gl_.reduce((a, g) => a + g.advance * sx + (o.charSpace || 0), 0) - (o.charSpace || 0);
      let x = o.hBind === 1 ? b.x + b.w - width : o.hBind === 2 ? b.x : b.x + (b.w - width) / 2;
      const y = b.y + (b.h - o.fontH) / 2;
      const top = o.charColor || [1, 1, 1, 1], bot = o.gradColor || top;
      for (const g of gl_) {
        const sh = F.sheets[g.sheet], u0 = g.x / sh.w, v0 = g.y / sh.h, u1 = (g.x + g.w) / sh.w, v1 = (g.y + g.h) / sh.h;
        quadAt(mat, i => (i === 0 ? sheets[g.sheet] : null), { x: x - g.left * sx, y, w: G.cw * sx, h: G.ch * sy },
          [[u0, v0], [u1, v0], [u0, v1], [u1, v1]], tint([top, top, bot, bot], mat.matColor[0]));
        x += g.advance * sx + (o.charSpace || 0);
      }
    }
    // Draw a layout. st: {text: {pane: string}, textures: {pane: texture name}, colors: {pane: [r, g, b]}, hide: Set, show: Set, texMtx}
    function walk(mats, p, ox, oy, st) {
      if ((!p.visible && !(st.show && st.show.has(p.name))) || (st.hide && st.hide.has(p.name))) return;
      const b = box(p, ox, oy);
      if (p.kind === 'picture') drawPicture(mats, p, b, st);
      else if (p.kind === 'window') drawWindow(mats, p, b);
      else if (p.kind === 'text') { const s = st.text && st.text[p.name]; if (s !== undefined) drawText(mats[p.material], s, b, p); }
      // children sit relative to their parent's anchor point; for the small null panes that is the same place
      // as the corner within a pixel or two, so only parents big enough to matter (the fruit window, the message backdrop) move it
      const big = p.anchor !== 0 && Math.max(b.w, b.h) > 16, ox2 = b.x + (big ? (p.anchor % 3) * b.w / 2 : 0), oy2 = b.y + (big ? Math.floor(p.anchor / 3) * b.h / 2 : 0);
      for (const c of p.children) walk(mats, c, ox2, oy2, st);
    }
    const drawLayout = (L, st) => walk(L.materials, L.root, 0, 0, st);
    // Free-standing picture centred at (x, y) in screen pixels.
    function sprite(mat, name, x, y, w, h, col, flipX) {
      const t = texture(name), c = col || [1, 1, 1, 1], u0 = flipX ? 1 : 0, u1 = flipX ? 0 : 1;
      R.quad(mat, i => (i === 0 ? t : null), [
        { x: x - w / 2, y: y - h / 2, u: u0, v: 0, c }, { x: x + w / 2, y: y - h / 2, u: u1, v: 0, c },
        { x: x + w / 2, y: y + h / 2, u: u1, v: 1, c }, { x: x - w / 2, y: y + h / 2, u: u0, v: 1, c }]);
    }
    // Text in screen pixels, centred on (x, y).
    const say = (str, x, y, size, col, hBind) => drawText(scoreMat, str, { x: (x - MAP.ox) / MAP.sx - 100, y: (y - MAP.oy) / MAP.sy - size / 2, w: 200, h: size }, { fontW: size, fontH: size, hBind: hBind || 0, charSpace: -1, charColor: col || [1, 1, 1, 1] });

    // ---- the ghost circles
    const ringMat = Object.assign({}, MODULATE), scoreMat = Object.assign({}, MODULATE);
    // Badge labels are dark letters: paint them with the vertex colour where the texture is dark.
    const labelMat = Object.assign({}, MODULATE, { stages: [Object.assign({}, MODULATE.stages[0], { op: {
      color: { a: 10, b: 15, c: 8, d: 15, op: 0, bias: 0, scale: 0, clamp: 1, reg: 0 }, alpha: MODULATE.stages[0].op.alpha } })] });
    function ghostCircle(slot, seat, v, time, com) {
      const s = SLOTS[slot], c = com ? GREY : seatColor[seat];
      // frame colours measured on the original's picture: 63% of the player's colour, the ring a touch brighter
      const dark = [c[0] * 0.63, c[1] * 0.63, c[2] * 0.63, 1];
      const ringCol = [c[0] * 0.66, c[1] * 0.66, c[2] * 0.66, 1];
      // the coloured tab that carries the player badge
      const r = R_RING, k = 18;
      if (slot < 2) {
        const sx = slot === 0 ? -1 : 1, pts = [[s.x, s.y], [s.x + sx * r, s.y]];
        for (let a = 0; a <= 8; a++) { const t = a / 8 * Math.PI / 2; pts.push([s.x + sx * (r - k + k * Math.cos(t)), s.y - (r - k) - k * Math.sin(t)]); }
        pts.push([s.x, s.y - r]);
        R.poly(slot === 0 ? pts : pts.reverse(), dark);
      } else {
        const pts = [[s.x, s.y], [s.x + 78, s.y - 97]];
        for (let a = 0; a <= 8; a++) { const t = -Math.PI / 4 + a / 8 * Math.PI / 2; pts.push([s.x + 26 * Math.sin(t), s.y - 152 - 18 * Math.cos(t)]); }
        pts.push([s.x - 78, s.y - 97]);
        R.poly(pts, dark);
      }
      // the 3D view, masked to the circle
      if (scene && v) {
        gl.enable(gl.STENCIL_TEST); gl.clearStencil(0); gl.clear(gl.STENCIL_BUFFER_BIT);
        gl.stencilFunc(gl.ALWAYS, 1, 0xFF); gl.stencilOp(gl.KEEP, gl.KEEP, gl.REPLACE);
        const circ = []; for (let a = 0; a < 64; a++) circ.push([s.x + R_VIEW * Math.cos(a / 64 * 2 * Math.PI), s.y + R_VIEW * Math.sin(a / 64 * 2 * Math.PI)]);
        R.poly(circ, null, true);
        gl.stencilFunc(gl.EQUAL, 1, 0xFF); gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
        const k2 = canvas.width / TVW, size = Math.round(2 * R_RING * k2);
        gl.viewport(Math.round((s.x - R_RING) * k2), Math.round(canvas.height - (s.y + R_RING) * k2), size, size);
        gl.clearColor(0, 0, 0, 1);
        const info = scene.draw(Object.assign({ aspect: 1, time }, v));
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.disable(gl.STENCIL_TEST);
        R.begin(M.ident(), M.screen(TVW, TVH));
        // points floating up from where they were scored, like the originals' grey numbers
        if (info && v.pops) for (const p of v.pops) {
          const k = Math.min(1, p.age / p.life), [nx, ny] = info.project(p.x, p.y, 650 + 700 * k);
          const px = s.x + nx * R_RING, py = s.y - ny * R_RING;
          if (Math.hypot(px - s.x, py - s.y) > R_VIEW - 14) continue;
          const a = k < 0.7 ? 0.8 : 0.8 * (1 - k) / 0.3;
          say(p.text, px, py, 22, [0.86, 0.86, 0.92, a]);
        }
      }
      // the ring and badge from maruwaku_05, tinted with the player's colour; mirrored or turned per slot
      const ring = texture('maruwaku_05.bti'), rot = slot === 2 ? Math.PI / 4 : 0, flip = slot === 1;
      const corner = (dx, dy) => { const x = dx * Math.cos(rot) - dy * Math.sin(rot), y = dx * Math.sin(rot) + dy * Math.cos(rot); return [s.x + x, s.y + y]; };
      const [a, b2, c2, d] = [corner(-r, -r), corner(r, -r), corner(r, r), corner(-r, r)];
      const u0 = flip ? 1 : 0, u1 = flip ? 0 : 1;
      R.quad(ringMat, i => (i === 0 ? ring : null), [
        { x: a[0], y: a[1], u: u0, v: 0, c: ringCol }, { x: b2[0], y: b2[1], u: u1, v: 0, c: ringCol },
        { x: c2[0], y: c2[1], u: u1, v: 1, c: ringCol }, { x: d[0], y: d[1], u: u0, v: 1, c: ringCol }]);
      // "P1".."P4" in the badge
      const bx = slot === 2 ? s.x : s.x + (slot === 0 ? -1 : 1) * 104, by = slot === 2 ? s.y - 147 : s.y - 104;
      const light = [Math.min(1, c[0] + 0.29), Math.min(1, c[1] + 0.29), Math.min(1, c[2] + 0.29), 1];
      if (com) {   // a stand-in's tab says COM (the exchange screen's label, in the badges' dark lettering)
        const wc = texture('wcom.bti'), cw = 52, ch = 26, lc = [0.3, 0.3, 0.34, 1];
        R.quad(labelMat, i => (i === 0 ? wc : null), [
          { x: bx - cw / 2, y: by - ch / 2, u: 0, v: 0, c: lc }, { x: bx + cw / 2, y: by - ch / 2, u: 1, v: 0, c: lc },
          { x: bx + cw / 2, y: by + ch / 2, u: 1, v: 1, c: lc }, { x: bx - cw / 2, y: by + ch / 2, u: 0, v: 1, c: lc }]);
        return;
      }
      const lab = texture('p' + (seat + 1) + '.bti'), L = 34;
      R.quad(labelMat, i => (i === 0 ? lab : null), [
        { x: bx - L / 2, y: by - L / 2, u: 0, v: 0, c: light }, { x: bx + L / 2, y: by - L / 2, u: 1, v: 0, c: light },
        { x: bx + L / 2, y: by + L / 2, u: 1, v: 1, c: light }, { x: bx - L / 2, y: by + L / 2, u: 0, v: 1, c: light }]);
    }

    const ICONS = ['Icon_Aka.bti', 'Icon_Ao.bti', 'Icon_pink.bti', 'Icon_GRN.bti'];
    const GREY = [0.62, 0.62, 0.68];
    const GREY_TEV = [[0.5, 0.5, 0.53, 0], [0.14, 0.14, 0.15, 1], [0, 0, 0, 0], [0, 0, 0, 0]];   // a stand-in's panel bar: grey frame, dark interior
    // Which seats are grey stand-ins (st.standin[i]); a stand-in seat playing Pac-Man counts as a player.
    const isCom = (st, i) => !!(st.standin && st.standin[i]) && i !== st.pacPlayer;
    /** The panel's rows (and the exchange screen's circles) in the original's order: the people playing in seat
     *  order with the last of them on the bottom row, and the stand-ins between (the layout has COM marks for rows 2 and 3). */
    function rowOrder(st) {
      const people = [0, 1, 2, 3].filter(i => !isCom(st, i)), coms = [0, 1, 2, 3].filter(i => isCom(st, i));
      return people.length >= 2 ? people.slice(0, -1).concat(coms, people.slice(-1)) : people.concat(coms);
    }
    function frameStart(width) {
      const w = Math.max(320, Math.min(2048, Math.round(width || TVW)));
      if (canvas.width !== w) { canvas.width = w; canvas.height = Math.round(w * TVH / TVW); }
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);
      R.begin(M.ident(), M.screen(TVW, TVH));
    }
    // White stars thrown out of the fruit window when the fruit goes (taken or expired), over the whole picture.
    function sparkles(t) {
      const life = 0.8; if (t < 0 || t > life) return;
      const fw = scr.byName.furit_wk; if (!fw) return;
      const b = box(fw, 0, 0), cx = tvx(b.x + b.w / 2), cy = tvy(b.y + b.h / 2), k = t / life;
      for (let i = 0; i < 30; i++) {
        const ang = i * 2.39996 + 0.4, sp = 90 + ((i * 53) % 100) * 3.1, r = 20 + sp * t * (1 - 0.3 * k);
        const x = cx + Math.cos(ang) * r, y = cy + Math.sin(ang) * r;
        if (x < -10 || x > TVW + 10 || y < -10 || y > TVH + 10) continue;
        const sz = (4 + (i % 4) * 2.2) * (1 - 0.6 * k), q = sz * 0.28, a = Math.max(0, 1 - k * k);
        const col = i % 3 ? [1, 1, 1, a] : [0.75, 0.9, 1, a];
        R.poly([[x, y], [x, y - sz], [x + q, y - q], [x + sz, y], [x + q, y + q], [x, y + sz], [x - q, y + q], [x - sz, y], [x - q, y - q], [x, y - sz]], col);
      }
    }
    // After a catch the picture goes amber and a message names the catcher, before the exchange screen.
    const FULL = [[0, 0], [TVW, 0], [TVW, TVH], [0, TVH]];
    function caught(c) {
      const clamp = x => Math.max(0, Math.min(1, x));
      const dim = clamp((c.t - 1.3) / 0.7), out = clamp((c.t - (c.total - 0.9)) / 0.9);
      if (dim > 0) R.poly(FULL, [0.5, 0.28, 0, 0.62 * dim]);
      if (c.t > 2.0) {
        const hide = new Set(['CT_null', 'UR_null', 'UL_null', 'PUS_NL', 'GMS_NULL', 'Cng_NULL']);
        drawLayout(assets.mes, { hide, text: { MESSAGE: 'EXCELLENT' }, textures: { Ic_MON: ICONS[c.seat], pn_1: 'p' + (c.seat + 1) + '.bti' } });
      }
      if (out > 0) R.poly(FULL, [0, 0, 0, out]);
    }
    /** The game screen. st: {time, target, left, scores, pacPlayer, fruitUp, fruitKind, ghosts: [{seat, x, y, ...}], views: [per ghost]} */
    function render(st, width) {
      frameStart(width);
      const f = st.time * 60;
      const textures = {}, text = {}, colors = {}, hide = new Set(['TEXT_001', 'TEXT_002', 'P2_COM', 'P3_COM']), show = new Set();
      // the player panel: each row wears its player's number, icon and colour; a stand-in's row is grey and says COM, its
      // ghost icon grey until a ghost player wakes it, then in that player's colour (the frame stays grey, the COM mark stays)
      const order = rowOrder(st), tevOf = name => scr.materials[scr.byName[name].material].tevColors;   // a pane's colour registers: frame, interior
      const ownerOf = seat => { const g = st.ghosts.find(x => x.seat === seat); return g && g.c != null && g.c >= 0 ? g.c : -1; };
      order.forEach((seat, r) => {
        const P = 'P' + (r + 1);
        if (isCom(st, seat)) {
          const o = ownerOf(seat); textures[P + '_mon'] = o >= 0 ? ICONS[o] : 'Icon_Grey.bti'; hide.add(P + '_num'); colors[P + '_waku'] = GREY_TEV;
          if (scr.byName[P + '_COM']) { show.add(P + '_COM'); hide.delete(P + '_COM'); }
        } else {
          textures[P + '_mon'] = seat === st.pacPlayer ? 'Icon_pac.bti' : ICONS[seat];
          if (seat !== r && scr.byName[P + '_num'] && scr.byName[P + '_waku']) {   // another seat's row: its number and colours
            textures[P + '_num'] = 'p' + (seat + 1) + '.bti'; colors[P + '_num'] = tevOf('P' + (seat + 1) + '_num'); colors[P + '_waku'] = tevOf('P' + (seat + 1) + '_waku');
          }
        }
      });
      text.Score1 = text.Score2 = String(st.target);
      text.DOT_NUM1 = text.DOT_NUM2 = String(st.left);
      if (!st.fruitUp) { hide.add('furit_wk'); }
      else if (st.fruitKind && st.fruitKind !== 'fruit') textures.IC_fruit = 'pill:' + (PILL_RGB[st.fruitKind] ? st.fruitKind : 'gold');
      const texMtx = {};
      if (assets.bgAnim) Object.assign(texMtx, J3D.animateTex(assets.bgAnim, f));
      drawLayout(scr, { textures, text, colors, hide, show, texMtx });
      // scores in the player panels (a stand-in's row has the COM mark instead; drawn by hand on a row the layout has none for)
      order.forEach((seat, r) => {
        const p = scr.byName['P' + (r + 1) + '_waku']; if (!p) return;
        const b = box(p, 0, 0);
        if (isCom(st, seat)) { if (!scr.byName['P' + (r + 1) + '_COM']) sprite(ringMat, 'fs_gameTokutenNop_00.bti', tvx(b.x + 117), tvy(b.y + b.h / 2), 48 * MAP.sx, 48 * MAP.sy); return; }
        drawText(scoreMat, String(st.scores[seat]), { x: b.x + 90, y: b.y, w: b.w - 102, h: b.h }, { fontW: 22, fontH: 22, hBind: 1, charSpace: -1, charColor: [1, 1, 1, 1] });
      });
      // radar: one square per ghost in its player's colour
      const rd = scr.byName.Rdr;
      if (rd && st.W) {
        const b = box(rd, 0, 0);
        for (const g of st.ghosts) {
          const c = g.c != null && g.c < 0 ? GREY : seatColor[g.c != null ? g.c : g.seat], gx = b.x + 4 + (Math.min(g.x, st.W - 1) - 1) / (st.W - 2) * (b.w - 8), gy = b.y + 4 + g.y / st.H * (b.h - 8);
          R.poly([[tvx(gx - 4), tvy(gy - 4)], [tvx(gx + 4), tvy(gy - 4)], [tvx(gx + 4), tvy(gy + 4)], [tvx(gx - 4), tvy(gy + 4)]], [c[0], c[1], c[2], 1]);
        }
      }
      st.ghosts.slice(0, 3).forEach((g, slot) => ghostCircle(slot, g.seat, st.views[slot], st.time, isCom(st, g.seat)));      // a stand-in's circle stays grey and marked COM, woken or not
      if (st.sparkle !== undefined) sparkles(st.sparkle);
      if (st.caught) caught(st.caught);
      return canvas;
    }
    // The exchange screen after a catch (composed by the game from PAC_exchange's pictures).
    // Measured on the original's picture: four circles 140 px across, 152 px apart, LOSER / WINNER above them,
    // the score bars below and the points taken or won under those.
    const MON = ['mon_red.bti', 'mon_blue.bti', 'mon_pink.bti', 'mon_green.bti'];
    const EXCH = [[1, 0.12, 0, 1], [0, 0.69, 0.85, 1], [1, 0.33, 1, 1], [0, 0.9, 0, 1]];
    /** st: {time (s since the catch), target, before: [4], after: [4], loser, winner, pacPlayer, standin: [4]} */
    function exchange(st, width) {
      frameStart(width);
      drawLayout(assets.exchange, { text: { TIME: String(st.target) } });
      // the points count across at about 120 a second (measured: 1,600 took about 13 s), from 1.2 s in
      const moved = st.loser >= 0 ? Math.max(1, st.before[st.loser] - st.after[st.loser]) : 1, countT = moved / 120;
      const k = Math.min(1, Math.max(0, (st.time - 1.2) / countT));
      const order = rowOrder(st);
      order.forEach((i, col) => {
        const cx = 90 + 152 * col, cy = 211;
        if (isCom(st, i)) {   // a stand-in: grey circle, grey ghost, COM, and no score
          sprite(ringMat, 'ex_maruwaku.bti', cx, cy, 142, 142, [0.55, 0.55, 0.58, 1]);
          sprite(ringMat, 'fs_mongrey_00.bti', cx, cy, 116, 116);
          sprite(labelMat, 'wcom.bti', cx + 50, cy + 57, 32, 16, [1, 1, 1, 1]);
          return;
        }
        sprite(ringMat, 'ex_maruwaku.bti', cx, cy, 142, 142, EXCH[i]);
        sprite(ringMat, i === st.loser ? 'pcmn.bti' : MON[i], cx, cy, 116, 116, i === st.loser ? [0.6, 0.6, 0.6, 1] : null);
        sprite(labelMat, 'wp' + (i + 1) + '.bti', cx + 50, cy + 57, 32, 16, [1, 1, 1, 1]);
        sprite(labelMat, 'score_bar.bti', cx, 305, 144, 36, EXCH[i]);
        say(String(Math.round(st.before[i] + (st.after[i] - st.before[i]) * k)), cx, 305, 20);
        if (i === st.loser) { sprite(ringMat, 'lost.bti', cx, 128, 144, 52); say('-' + (st.before[i] - st.after[i]), cx, 350, 20); }
        if (i === st.winner) { sprite(ringMat, 'win.bti', cx, 128, 144, 52); say('+' + (st.after[i] - st.before[i]), cx, 350, 20); }
      });
      if (st.time > 1.2 + countT + 1.5) {   // once the count is done, the arrow points at the next Pac-Man
        const col = order.indexOf(st.winner), cx = 90 + 152 * col;
        sprite(ringMat, 'yajirushi.bti', cx + (col < 3 ? 120 : -120), 405, 128, 40, null, col >= 3);
      }
      return canvas;
    }
    // Final results (layout PAC_results): its four-, three- and two-player arrangements, one column per person
    // playing (stand-ins are left out). Each column: colour bar, number, portrait, crown, score window.
    const PORTRAIT = ['Akabei.bti', 'Aosuke.bti', 'pinky.bti', 'guzuta.bti'];
    const RES = {
      4: { nul: 'PL4_NULL', cols: [['AKA_dai', 'AKA_1P', 'AKABEI', 'Crw_AKA', 'Aka_win'], ['AO_dai', 'AO_2P', 'AOSUKE', 'Crw_Ao', 'AO_win'], ['PIN_dai', 'PIN_3P', 'PINKY', 'Crw_pink', 'PIN_WIN'], ['GRN_dai', 'GRN_4P', 'GUZUTA', 'Crw_Guzu', 'PIN_WIN1']] },
      3: { nul: 'PL3_NULL', cols: [['AKA_dai3', 'AKA_1P3', 'AKABEI3', 'Crw_AKA3', 'Aka_win3'], ['AO_dai3', 'AO_2P3', 'AOSUKE3', 'Crw_Ao3', 'AO_win3'], ['PIN_dai3', 'PIN_3P3', 'PINKY3', 'Crw_pin3', 'PIN_WIN3']] },
      2: { nul: 'PL2_NULL', cols: [['AKA_dai2', 'AKA_1P2', 'AKABEI2', 'Crw_AKA2', 'Aka_win2'], ['AO_dai2', 'AO_2P2', 'AOSUKE2', 'Crw_Ao2', 'AO_win2']] }
    };
    /** st: {time, scores, winner, pacPlayer, standin: [4]} */
    function results(st, width) {
      frameStart(width);
      const L = assets.results, people = [0, 1, 2, 3].filter(i => !isCom(st, i));
      const lay = RES[people.length] || RES[4], seats = RES[people.length] ? people : [0, 1, 2, 3];
      const hide = new Set(['PL4_NULL', 'PL3_NULL', 'PL2_NULL', 'PI4_nl', 'PI3_nll', 'PI2_nll']); hide.delete(lay.nul);
      const textures = { WINNER: PORTRAIT[st.winner], WIN_num: 'n' + (st.winner + 1) + '.bti' }, colors = {};
      lay.cols.forEach(([dai, num, por, crw], k) => {
        const seat = seats[k];
        if (seat !== st.winner) hide.add(crw);
        if (seat !== k) { textures[num] = 'p' + (seat + 1) + '.bti'; textures[por] = PORTRAIT[seat]; colors[dai] = seatColor[seat]; }
      });
      const overlay = st.time > 3;   // the ranking first, then the winner
      if (!overlay) for (const n of ['WIN_back', 'R', 'E', 'N2', 'N1', 'I', 'W', 'WIN_Wndw', 'WIN_pl', 'WIN_num', 'WINNER', 'WIN_Crw']) hide.add(n);
      drawLayout(L, { hide, textures, colors });
      if (!overlay) lay.cols.forEach(([, , , , win], k) => { const p = L.byName[win]; if (p) { const b = box(p, 0, 0); say(String(st.scores[seats[k]]), tvx(b.x + b.w / 2), tvy(b.y + b.h * 0.68), 22); } });
      return canvas;
    }
    return { render, exchange, results, canvas, seatColor };
  }

  root.Screens = { load, create, TVW, TVH, MAP };
})(typeof self !== 'undefined' ? self : this);
