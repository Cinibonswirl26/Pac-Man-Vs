// Run against a real disc image: node test/disc.test.js /path/to/image.ciso [outdir]
const fs = require('fs'), path = require('path');
const Disc = require('../client/disc.js');
const file = process.argv[2], outDir = process.argv[3];
if (!file) { console.log('usage: node test/disc.test.js <image> [outdir]'); process.exit(2); }
const blob = { slice: (a, b) => ({ arrayBuffer: async () => { const fd = fs.openSync(file, 'r'); const buf = Buffer.alloc(b - a); const n = fs.readSync(fd, buf, 0, b - a, a); fs.closeSync(fd); return buf.buffer.slice(buf.byteOffset, buf.byteOffset + (b - a)); } }) };
(async () => {
  const d = await Disc.open(blob);
  console.log('disc', d.id, JSON.stringify(d.title), d.files.size, 'files');
  const results = {};
  for (const p of ['PROOT/Screen/PAC_title.szs', 'PROOT/Screen/PAC_game.szs', 'PROOT/Screen/PAC_results.szs', 'PROOT/Model.szs']) {
    const arc = Disc.rarc(Disc.yaz0(await d.read('' + p)));
    console.log(p, [...arc.keys()].filter(k => /bti$/i.test(k)).length, 'textures,', arc.size, 'entries');
    results[p] = arc;
  }
  const title = results['PROOT/Screen/PAC_title.szs'];
  let okTex = 0, badTex = 0;
  for (const [name, buf] of title) if (/\.bti$/i.test(name)) {
    try { const t = Disc.decodeBTI(buf); okTex++;
      if (outDir) { fs.mkdirSync(outDir, { recursive: true }); fs.writeFileSync(path.join(outDir, path.basename(name) + '.rgba'), t.rgba); fs.writeFileSync(path.join(outDir, path.basename(name) + '.txt'), `${t.w}x${t.h} fmt${t.fmt}`); }
    } catch (e) { badTex++; console.log('  texture', name, 'failed:', e.message); }
  }
  console.log('title textures decoded', okTex, 'failed', badTex);
  // audio sanity: decoded music should be smooth (low sample-to-sample difference), not noise
  for (const f of ['pacmaniaBGM02_FX_LR.z.32.c4.ast', 'Pac_Op_loop73_LR.z.32.c4.ast']) {
    const a = Disc.decodeAST(await d.read('PROOT/AudioRes/Stream/' + f), 20);
    const x = a.channels[0]; let diff = 0, mag = 0, clip = 0;
    for (let i = 1; i < a.samples; i++) { diff += Math.abs(x[i] - x[i - 1]); mag += Math.abs(x[i]); if (Math.abs(x[i]) > 0.99) clip++; }
    console.log(f, `${a.channels.length}ch ${a.rate}Hz total ${(a.total / a.rate).toFixed(0)}s`, 'mean|x|', (mag / a.samples).toFixed(3), 'roughness', (diff / mag).toFixed(2), 'clipped', clip);
  }
})().catch(e => { console.log('FAIL', e.stack); process.exit(1); });
