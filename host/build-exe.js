'use strict';
// Builds the single-file host program: `node host/build-exe.js` writes host/dist/PacManVs.exe (a Windows build; on
// Windows it uses the running Node, elsewhere it downloads the matching Windows Node once into host/tools).
// `node host/build-exe.js --native` instead builds for this machine (host/dist/pacvs) to try it out.
// The page files (client/, shared/) are packed in as assets; nothing from any disc or cartridge is included.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const esbuild = require('esbuild');
const postject = require('postject');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(__dirname, 'dist'), TOOLS = path.join(__dirname, 'tools');
const native = process.argv.includes('--native');
const FUSE = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2';

function listFiles(dir) {
  const out = [];
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) out.push(...listFiles(rel)); else out.push(rel);
  }
  return out;
}

/** node.exe of the same version as the running Node: the running one on Windows, else downloaded once. */
function windowsNode() {
  if (process.platform === 'win32') return process.execPath;
  const ver = process.version, name = `node-${ver}-win-x64`, exe = path.join(TOOLS, name, 'node.exe');
  if (fs.existsSync(exe)) return exe;
  fs.mkdirSync(TOOLS, { recursive: true });
  const zip = path.join(TOOLS, `${name}.zip`);
  console.log(`downloading ${name}.zip (one time)...`);
  execFileSync('curl', ['-sSL', '-o', zip, `https://nodejs.org/dist/${ver}/${name}.zip`], { stdio: 'inherit' });
  try { execFileSync('unzip', ['-q', '-o', zip, `${name}/node.exe`, '-d', TOOLS]); }
  catch (e) { execFileSync('tar', ['-xf', zip, '-C', TOOLS, `${name}/node.exe`]); }
  fs.unlinkSync(zip);
  return exe;
}

async function main() {
  fs.mkdirSync(DIST, { recursive: true });
  const bundle = path.join(DIST, 'pacvs.cjs');
  await esbuild.build({ entryPoints: [path.join(__dirname, 'exe.js')], bundle: true, platform: 'node', format: 'cjs', target: 'node22',
    outfile: bundle, external: ['bufferutil', 'utf-8-validate'], logLevel: 'warning', legalComments: 'none' });
  const assets = {};
  for (const f of [...listFiles('client'), ...listFiles('shared')]) assets[f] = path.join(ROOT, f);
  const cfg = path.join(DIST, 'sea-config.json'), blob = path.join(DIST, 'pacvs.blob');
  fs.writeFileSync(cfg, JSON.stringify({ main: bundle, output: blob, disableExperimentalSEAWarning: true, assets }, null, 1));
  execFileSync(process.execPath, ['--experimental-sea-config', cfg], { stdio: 'inherit' });

  const src = native ? process.execPath : windowsNode();
  const out = path.join(DIST, native ? (process.platform === 'win32' ? 'pacvs.exe' : 'pacvs') : 'PacManVs.exe');
  fs.copyFileSync(src, out);
  fs.chmodSync(out, 0o755);
  await postject.inject(out, 'NODE_SEA_BLOB', fs.readFileSync(blob), { sentinelFuse: FUSE, machoSegmentName: 'NODE_SEA' });
  const mb = (fs.statSync(out).size / 1048576).toFixed(0);
  console.log(`built ${path.relative(ROOT, out)} (${mb} MB, ${Object.keys(assets).length} page files packed, no game assets)`);
}
main().catch(e => { console.error(e.message || e); process.exit(1); });
