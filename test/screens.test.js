// node test/screens.test.js <disc image>: the 2D screen layouts and font read from the player's disc.
const fs = require('fs'), Disc = require('../client/disc.js'), J2D = require('../client/j2d.js');
const file = process.argv[2]; if (!file) { console.log('usage: node test/screens.test.js <image>'); process.exit(2); }
const blob = { slice: (a, b) => ({ arrayBuffer: async () => { const fd = fs.openSync(file, 'r'); const buf = Buffer.alloc(b - a); fs.readSync(fd, buf, 0, b - a, a); fs.closeSync(fd); return buf.buffer.slice(buf.byteOffset, buf.byteOffset + (b - a)); } }) };
(async () => {
  const d = await Disc.open(blob);
  let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } };
  const arc = async n => Disc.rarc(Disc.yaz0(await d.read('PROOT/Screen/' + n + '.szs')));
  const game = await arc('PAC_game'), ex = await arc('PAC_exchange'), res = await arc('PAC_results');

  // The game screen: 608 x 448, every pane the TV screen uses, materials pointing at real textures.
  const g = J2D.parseBLO(game.get('scrn/pac_game.blo'));
  ok(g.w === 608 && g.h === 448, 'game screen size');
  for (const n of ['PICT_020', 'NULL_Sco', 'Score1', 'DOT_NUM1', 'WIND_001', 'Rdr', 'Rdr_waku', 'furit_wk', 'P1_waku', 'P2_mon', 'P3_num', 'P4_waku']) ok(g.byName[n], 'game screen lacks pane ' + n);
  const timg = new Set([...game.keys()].filter(k => k.startsWith('timg/')).map(k => k.slice(5).toLowerCase()));
  for (const m of g.materials) for (const t of m.textureNames) if (t) ok(timg.has(t.toLowerCase()), `material ${m.name} uses missing texture ${t}`);
  ok(g.materials[g.byName.P1_waku.material].textureNames[0] === 'scr_waku.bti', 'P1 panel frame texture');
  // the panels carry the player colours in their first TEV register: P1 red, P2 cyan, P3 magenta, P4 green
  const col = n => g.materials[g.byName[n].material].tevColors[0].slice(0, 3).map(v => Math.round(v)).join(',');
  ok(col('P1_waku') === '1,0,0' && col('P2_waku') === '0,1,1' && col('P3_waku') === '1,0,1' && col('P4_waku') === '0,1,0', 'player colours ' + ['P1_waku', 'P2_waku', 'P3_waku', 'P4_waku'].map(col));
  const sc = g.byName.Score1; ok(sc.kind === 'text' && sc.fontW === 30 && sc.hBind === 0, 'target score text box');
  const wnd = g.byName.WIND_001; ok(wnd.kind === 'window' && wnd.frameMaterials.every(i => g.materials[i].textureNames[0] === 'waku4.bti'), 'pellet counter window frame');

  // Font: 97 glyphs on 128 x 128 sheets, ASCII from the space.
  const f = J2D.parseBFN(game.get('font/lowdy.bfn'));
  ok(f.sheets.length === 4 && f.sheets[0].w === 128, 'font sheets');
  const g7 = J2D.glyph(f, 55), sp = J2D.glyph(f, 32);
  ok(g7 && sp && g7.advance > 5 && g7.advance <= 24 && sp.x === 0 && sp.y === 0, 'glyph lookup');
  ok(f.sheets[0].rgba.some((v, i) => i % 4 === 3 && v > 0 && v < 255) || f.sheets[0].rgba.some((v, i) => i % 4 === 3 && v === 0), 'intensity fonts carry their alpha');

  // Exchange and results layouts.
  const e = J2D.parseBLO(ex.get('scrn/pac_exchange_time.blo'));
  ok(e.byName.Time_OYA && e.byName.TIME && e.byName.TIME.kind === 'text', 'exchange score panel');
  for (const n of ['mon_red.bti', 'mon_blue.bti', 'mon_pink.bti', 'mon_green.bti', 'pcmn.bti', 'ex_maruwaku.bti', 'lost.bti', 'win.bti', 'score_bar.bti', 'wp1.bti', 'yajirushi.bti']) ok(ex.has('timg/' + n), 'PAC_exchange lacks ' + n);
  const r = J2D.parseBLO(res.get('scrn/pac_results.blo'));
  for (const n of ['RESULTS', 'PL4_NULL', 'Aka_win', 'AO_win', 'PIN_WIN', 'PIN_WIN1', 'WINNER', 'WIN_num', 'Crw_AKA', 'Crw_Guzu']) ok(r.byName[n], 'results screen lacks pane ' + n);
  console.log(fails ? fails + ' FAILED' : 'screens read from the disc, all checks passed'); process.exit(fails ? 1 : 0);
})();
