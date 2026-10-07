/* The ghost's 3D view, drawn with the models on the player's disc: the stage-1 maze, the ghost and
 * Pac-Man models with their animations, the fruit and the pellet sprite. The camera follows the ghost
 * from behind and above, framed like the original's ghost circles. Browser only (WebGL). */
(function (root) {
  'use strict';
  const M = () => GX.mat4;
  // Camera measured against the original's TV picture: a ghost circle 252 px across shows about
  // 5.7 cells at the ghost, looking north and down at 38 degrees.
  const CAM = { pitch: 38 * Math.PI / 180, dist: 16000, fov: 20.3 * Math.PI / 180 };
  const SKINS = ['r', 'b', 'p', 'g'];          // ghost_r/b/p/g = P1 red, P2 blue, P3 pink, P4 green
  const YAW = [Math.PI, Math.PI / 2, 0, -Math.PI / 2];   // facing for up, right, down, left (models face +z)
  const FPS = 60;                               // J3D animations advance once per frame at 60 Hz

  async function load(disc) {
    const arc = Disc.rarc(Disc.yaz0(await disc.read('PROOT/Model.szs')));
    const file = n => { const v = arc.get(n); if (!v) throw new Error('missing in Model.szs: ' + n); return v; };
    return {
      stage: J3D.parseBMD(await disc.read('PROOT/Map/PacField_1.bmd')),
      stageAnim: J3D.parseBTK(await disc.read('PROOT/Map/PacField_1.btk')),
      ghost: J3D.parseBMD(file('ghost/ghost.bmd')),
      ghostAnim: J3D.parseBCK(file('ghost/anm/ghost.bck')),
      skins: Object.fromEntries([...SKINS, 'yowari', 'com', 'toumei'].map(s => [s, Disc.decodeBTI(file('ghost/ghost_' + s + '.bti'))])),
      pac: J3D.parseBMD(file('packman/pacman.bmd')),
      pacAnim: J3D.parseBCK(file('packman/anm/pacman.bck')),
      cherry: J3D.parseBMD(file('cherry.bmd')),
      dot: Disc.decodeBTI(await disc.read('PROOT/Texture/dot.bti'))
    };
  }

  /** The 3D scene on an existing GX renderer. draw(v) renders into the current viewport. */
  function scene(assets, R) {
    const stage = R.model(assets.stage, J3D.pose(assets.stage));
    const ghost = R.model(assets.ghost, J3D.pose(assets.ghost, J3D.animate(assets.ghostAnim, 0)));
    const pac = R.model(assets.pac, J3D.pose(assets.pac, J3D.animate(assets.pacAnim, 0)));
    const cherry = R.model(assets.cherry, J3D.pose(assets.cherry));
    const tex = t => R.texture(Object.assign({}, t, { wrapS: 1, wrapT: 1 }));
    const skins = {}; for (const k in assets.skins) skins[k] = tex(assets.skins[k]);
    const dot = tex(assets.dot);
    let lastGhostFrame = -1, lastPacFrame = -1;
    const m4 = M();

    // Sim coordinates (cell units, centre at +0.5, grid including the outer wall columns) -> stage units.
    const wx = x => (x - 1) * 1000, wz = y => y * 1000;

    /** v: {me, zoom, aspect, ghosts: [{x, y, m, yaw, seat}], pac, pellets, W, H, fruit, flash, time} */
    function draw(v) {
      const gl = R.gl, f = v.time * FPS;
      // Animations: the ghosts' float cycle and Pac-Man's mouth, shared by every instance.
      const gf = Math.floor(f) % assets.ghostAnim.length;
      if (gf !== lastGhostFrame) { lastGhostFrame = gf; ghost.setPose(J3D.pose(assets.ghost, J3D.animate(assets.ghostAnim, gf))); }
      const pf = Math.floor(f) % assets.pacAnim.length;
      if (pf !== lastPacFrame && v.pac) { lastPacFrame = pf; pac.setPose(J3D.pose(assets.pac, J3D.animate(assets.pacAnim, pf))); }
      stage.setTexMtx(J3D.animateTex(assets.stageAnim, f));
      gl.clear(gl.DEPTH_BUFFER_BIT);

      const tx = wx(v.me.x), tz = wz(v.me.y), ty = 200, d = CAM.dist * (v.zoom || 1);
      const eye = [tx, ty + d * Math.sin(CAM.pitch), tz + d * Math.cos(CAM.pitch)];
      const view = m4.lookAt(eye, [tx, ty, tz], [0, 1, 0]);
      const proj = m4.perspective(CAM.fov, v.aspect || 1, 500, 200000);
      // Light: colour channels lit from the camera; the ghosts' alpha channel (which shades their body) from
      // below and in front, which matches the original's shading of the ghost bodies.
      R.begin(view, proj, { dir: [0, Math.sin(CAM.pitch), Math.cos(CAM.pitch)], dirA: [0, -1, 0.3], color: [1, 1, 1, 0.5] });
      R.draw(stage, m4.ident());
      const pel = [];
      for (let y = 0; y < v.H; y++) for (let x = 0; x < v.W; x++) {
        const p = v.pellets[y * v.W + x]; if (!p) continue;
        pel.push([wx(x + 0.5), 250, wz(y + 0.5), p === 2 ? 560 + 80 * Math.sin(v.time * 9) : 260]);
      }
      R.sprites(dot, pel);
      if (v.fruit) R.draw(cherry, m4.trs(wx(v.fruit.x), 0, wz(v.fruit.y), 0, 0.75));
      if (v.pac) R.draw(pac, m4.trs(wx(v.pac.x), 380, wz(v.pac.y), YAW[v.pac.d] || 0, 1));
      // Ghosts last: their bodies are blended.
      for (const g of v.ghosts) {
        let skin = skins[SKINS[g.seat]];
        if (g.m === 'f') skin = v.flash ? skins.com : skins.yowari;
        else if (g.m === 'e') skin = skins.toumei;
        R.draw(ghost, m4.trs(wx(g.x), 150, wz(g.y), g.yaw, 1.25), { textures: { ghost_r: skin } });
      }
    }
    return { draw };
  }

  /** A standalone square view on its own canvas. Returns null when WebGL is unavailable. */
  function create(assets) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 256;
    const gl = canvas.getContext('webgl', { antialias: true, alpha: true, premultipliedAlpha: false });
    if (!gl) return null;
    const sc = scene(assets, GX.renderer(gl));
    function render(v) {
      const size = Math.max(64, Math.min(1024, Math.round(v.size)));
      if (canvas.width !== size) { canvas.width = canvas.height = size; }
      gl.viewport(0, 0, size, size);
      gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      sc.draw(v);
      return canvas;
    }
    return { render, canvas, YAW };
  }

  root.View3D = { load, create, scene, YAW, SKINS };
})(typeof self !== 'undefined' ? self : this);
