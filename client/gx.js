/* WebGL renderer for J3D models read from the player's disc.
 * Each J3D material describes a fixed-function pipeline (lighting channels, texture
 * coordinate generators, TEV combiner stages, alpha test, blending). This file turns each material
 * into an equivalent GLSL shader so models look as they do in the original.
 * UMD: window.GX in the browser, module.exports in Node (shader generation only). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GX = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------------------------------------------------------------- column-major 4x4 matrices
  const mat4 = {
    ident: () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
    mul(a, b) {
      const o = new Array(16);
      for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
      return o;
    },
    perspective(fovY, aspect, near, far) {
      const f = 1 / Math.tan(fovY / 2), nf = 1 / (near - far);
      return [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0];
    },
    lookAt(eye, at, up) {
      let zx = eye[0] - at[0], zy = eye[1] - at[1], zz = eye[2] - at[2]; let l = Math.hypot(zx, zy, zz); zx /= l; zy /= l; zz /= l;
      let xx = up[1] * zz - up[2] * zy, xy = up[2] * zx - up[0] * zz, xz = up[0] * zy - up[1] * zx; l = Math.hypot(xx, xy, xz); xx /= l; xy /= l; xz /= l;
      const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
      return [xx, yx, zx, 0, xy, yy, zy, 0, xz, yz, zz, 0,
        -(xx * eye[0] + xy * eye[1] + xz * eye[2]), -(yx * eye[0] + yy * eye[1] + yz * eye[2]), -(zx * eye[0] + zy * eye[1] + zz * eye[2]), 1];
    },
    /** Translate, rotate about Y, uniform scale. */
    trs(x, y, z, ry, s) {
      const c = Math.cos(ry) * s, n = Math.sin(ry) * s;
      return [c, 0, -n, 0, 0, s, 0, 0, n, 0, c, 0, x, y, z, 1];
    },
    normal3(m) { return [m[0], m[1], m[2], m[4], m[5], m[6], m[8], m[9], m[10]]; },
    /** Orthographic projection with y pointing down: (0,0) is the top-left corner of a w x h screen. */
    screen(w, h) { return [2 / w, 0, 0, 0, 0, -2 / h, 0, 0, 0, 0, -1, 0, -1, 1, 0, 1]; }
  };

  // ---------------------------------------------------------------- shader generation
  const f = v => { const s = String(+v.toFixed(6)); return s.includes('.') || s.includes('e') ? s : s + '.0'; };
  const KC = ['1.0', '0.875', '0.75', '0.625', '0.5', '0.375', '0.25', '0.125'];
  function konstColor(sel) {
    if (sel < 8) return `vec3(${KC[sel]})`;
    if (sel >= 0x0C && sel <= 0x0F) return `uK[${sel - 0x0C}].rgb`;
    if (sel >= 0x10) { const k = (sel - 0x10) & 3, c = 'rgba'[(sel - 0x10) >> 2]; return `vec3(uK[${k}].${c})`; }
    return 'vec3(1.0)';
  }
  function konstAlpha(sel) {
    if (sel < 8) return KC[sel];
    if (sel >= 0x10) { const k = (sel - 0x10) & 3, c = 'rgba'[(sel - 0x10) >> 2]; return `uK[${k}].${c}`; }
    return '1.0';
  }
  const REG = ['prev', 'r0', 'r1', 'r2'];
  const SW = 'rgba';
  const swizzle = t => t.map(i => SW[i]).join('');
  const TEXMAP_MODES_ENV = new Set([1, 6, 7, 10, 11]);

  /** GLSL for one material. Returns {vs, fs, key}. */
  function genShader(mat) {
    const nGen = Math.max(0, Math.min(8, mat.texGenNum | 0));
    let vs = 'precision highp float;\nattribute vec3 aPos; attribute vec3 aNrm; attribute vec4 aClr; attribute vec2 aUV;\n' +
      'uniform mat4 uMV, uP; uniform mat3 uNM; uniform vec4 uMat0, uMat1, uAmb0, uAmb1; uniform vec3 uLightDir, uLightDirA; uniform vec4 uLightCol;\n' +
      'uniform mat3 uTM[10];\nvarying vec4 vC0, vC1;\n';
    for (let i = 0; i < nGen; i++) vs += `varying vec3 vT${i};\n`;
    vs += 'void main() {\n vec4 vp = uMV * vec4(aPos, 1.0); gl_Position = uP * vp;\n vec3 n = normalize(uNM * aNrm);\n float ndl = dot(n, uLightDir), ndlA = dot(n, uLightDirA);\n';
    const chanCode = (ch, which, isAlpha) => {
      const sw = isAlpha ? 'a' : 'rgb';
      if (!ch) return `${which === 0 ? 'uMat0' : 'uMat1'}.${sw}`;
      const matc = ch.matSrc ? `aClr.${sw}` : `${which === 0 ? 'uMat0' : 'uMat1'}.${sw}`;
      if (!ch.lighting) return matc;
      const amb = ch.ambSrc ? `aClr.${sw}` : `${which === 0 ? 'uAmb0' : 'uAmb1'}.${sw}`;
      const nd = isAlpha ? 'ndlA' : 'ndl';
      const d = ch.diffuse === 0 ? '1.0' : ch.diffuse === 1 ? nd : `max(${nd}, 0.0)`;
      const lit = ch.litMask ? `${amb} + ${d} * uLightCol.${sw}` : amb;
      return `${matc} * clamp(${lit}, 0.0, 1.0)`;
    };
    const ch = mat.chans || [];
    vs += ` vC0 = vec4(${chanCode(ch[0], 0, false)}, ${chanCode(ch[1], 0, true)});\n`;
    vs += ` vC1 = vec4(${chanCode(ch[2], 1, false)}, ${chanCode(ch[3], 1, true)});\n`;
    for (let i = 0; i < nGen; i++) {
      const g = mat.texGens[i] || { src: 4, mtx: 60 };
      let src;
      const tmIdx = g.mtx >= 30 && g.mtx < 60 ? (g.mtx - 30) / 3 : -1;
      const tm = tmIdx >= 0 ? mat.texMtx[tmIdx] : null;
      if (g.src === 1) src = tm && TEXMAP_MODES_ENV.has(tm.info & 0x3F) ? 'vec3(n.x * 0.5 + 0.5, -n.y * 0.5 + 0.5, 1.0)' : 'vec3(aNrm.xy, 1.0)';
      else if (g.src === 0) src = 'vec3(aPos.xy, 1.0)';
      else src = 'vec3(aUV, 1.0)';
      vs += tmIdx >= 0 && tm ? ` vT${i} = uTM[${tmIdx}] * ${src};\n` : ` vT${i} = ${src};\n`;
    }
    vs += '}\n';

    let fs = 'precision mediump float;\nuniform sampler2D uTex[8]; uniform vec4 uK[4]; uniform vec4 uReg[4];\nvarying vec4 vC0, vC1;\n';
    for (let i = 0; i < nGen; i++) fs += `varying vec3 vT${i};\n`;
    fs += 'vec4 tx(int i, vec2 uv) {\n';
    for (let i = 0; i < 8; i++) fs += ` if (i == ${i}) return texture2D(uTex[${i}], uv);\n`;
    fs += ' return vec4(1.0);\n}\n';
    fs += 'void main() {\n vec4 prev = uReg[3], r0 = uReg[0], r1 = uReg[1], r2 = uReg[2];\n vec4 tex = vec4(1.0), ras = vec4(0.0); vec3 kc; float ka;\n';
    const swT = mat.swapTables || [[0, 1, 2, 3], [0, 1, 2, 3], [0, 1, 2, 3], [0, 1, 2, 3]];
    const CIN = ['prev.rgb', 'prev.aaa', 'r0.rgb', 'r0.aaa', 'r1.rgb', 'r1.aaa', 'r2.rgb', 'r2.aaa', 'tex.rgb', 'tex.aaa', 'ras.rgb', 'ras.aaa', 'vec3(1.0)', 'vec3(0.5)', 'kc', 'vec3(0.0)'];
    const AIN = ['prev.a', 'r0.a', 'r1.a', 'r2.a', 'tex.a', 'ras.a', 'ka', '0.0'];
    const BIAS = ['', ' + 0.5', ' - 0.5', ''];
    const SCALE = ['', ' * 2.0', ' * 4.0', ' * 0.5'];
    (mat.stages || []).forEach((st, k) => {
      if (!st.op) return;
      const o = st.order || { texCoord: 255, texMap: 255, chan: 255 };
      const sw = st.swap || { ras: 0, tex: 0 };
      fs += ` // stage ${k}\n`;
      if (o.texMap !== 255 && o.texMap < 8) {
        const tc = o.texCoord < nGen ? `vT${o.texCoord}.xy / vT${o.texCoord}.z` : 'vec2(0.0)';
        fs += ` tex = tx(${o.texMap}, ${tc}).${swizzle(swT[sw.tex] || [0, 1, 2, 3])};\n`;
      } else fs += ' tex = vec4(1.0);\n';
      if (o.chan === 4 || o.chan === 0 || o.chan === 2) fs += ` ras = vC0.${swizzle(swT[sw.ras] || [0, 1, 2, 3])};\n`;
      else if (o.chan === 5 || o.chan === 1 || o.chan === 3) fs += ` ras = vC1.${swizzle(swT[sw.ras] || [0, 1, 2, 3])};\n`;
      else fs += ' ras = vec4(0.0);\n';
      fs += ` kc = ${konstColor(st.kc)}; ka = ${konstAlpha(st.ka)};\n`;
      const c = st.op.color, a = st.op.alpha;
      const comb = (x, IN, isA) => {
        const A = IN[x.a], B = IN[x.b], C = IN[x.c], D = IN[x.d];
        let e;
        if (x.op <= 1) e = `(${D} ${x.op ? '-' : '+'} mix(${A}, ${B}, ${C})${BIAS[x.bias] || ''})${SCALE[x.scale] || ''}`;
        else {   // comparison modes: d + (a cmp b ? c : 0)
          const eq = x.op & 1, kind = (x.op - 8) >> 1;
          const ch1 = isA || kind === 3 ? null : ['r', 'gr', 'bgr'][kind];
          let cond;
          if (ch1 === null) cond = isA ? (eq ? `step(abs(${A} - ${B}), 0.002)` : `step(${B} + 0.002, ${A})`) : (eq ? `step(abs(${A} - ${B}), vec3(0.002))` : `step(${B} + 0.002, ${A})`);
          else {
            const pack = v => ch1 === 'r' ? `(${v}).r` : ch1 === 'gr' ? `dot((${v}).rg, vec2(1.0, 256.0))` : `dot((${v}).rgb, vec3(1.0, 256.0, 65536.0))`;
            cond = eq ? `step(abs(${pack(A)} - ${pack(B)}), 0.002)` : `step(${pack(B)} + 0.002, ${pack(A)})`;
          }
          e = `(${D} + ${C} * ${cond})`;
        }
        return x.clamp ? `clamp(${e}, 0.0, 1.0)` : e;
      };
      fs += ` { vec3 c_ = ${comb(c, CIN, false)}; float a_ = ${comb(a, AIN, true)};\n   ${REG[c.reg]}.rgb = c_; ${REG[a.reg]}.a = a_; }\n`;
    });
    const ac = mat.alphaComp;
    if (ac) {
      const cmp = (op, ref) => ['false', `prev.a < ${f(ref)}`, `abs(prev.a - ${f(ref)}) < 0.002`, `prev.a <= ${f(ref) + ' + 0.002'}`, `prev.a > ${f(ref)}`, `abs(prev.a - ${f(ref)}) >= 0.002`, `prev.a >= ${f(ref)} - 0.002`, 'true'][op];
      const a0 = cmp(ac.comp0, ac.ref0), a1 = cmp(ac.comp1, ac.ref1);
      const pass = [`(${a0}) && (${a1})`, `(${a0}) || (${a1})`, `(${a0}) != (${a1})`, `(${a0}) == (${a1})`][ac.op];
      if (pass !== '(true) || (true)' && pass !== '(true) && (true)') fs += ` if (!(${pass})) discard;\n`;
    }
    fs += ' gl_FragColor = clamp(prev, 0.0, 1.0);\n}\n';
    return { vs, fs, key: vs + '\n' + fs };
  }

  // ---------------------------------------------------------------- WebGL side
  function renderer(gl) {
    const programs = new Map();
    function program(mat) {
      const { vs, fs, key } = genShader(mat);
      let p = programs.get(key);
      if (p) return p;
      const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) + '\n' + src); return s; };
      const pr = gl.createProgram();
      gl.attachShader(pr, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, fs));
      gl.bindAttribLocation(pr, 0, 'aPos'); gl.bindAttribLocation(pr, 1, 'aNrm'); gl.bindAttribLocation(pr, 2, 'aClr'); gl.bindAttribLocation(pr, 3, 'aUV');
      gl.linkProgram(pr);
      if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
      const u = {};
      for (const n of ['uMV', 'uP', 'uNM', 'uMat0', 'uMat1', 'uAmb0', 'uAmb1', 'uLightDir', 'uLightDirA', 'uLightCol', 'uTM', 'uTex', 'uK', 'uReg']) u[n] = gl.getUniformLocation(pr, n);
      p = { pr, u };
      programs.set(key, p);
      return p;
    }
    const pow2 = n => (n & (n - 1)) === 0;
    function texture(t) {
      const tx = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tx);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, t.w, t.h, 0, gl.RGBA, gl.UNSIGNED_BYTE, t.rgba instanceof Uint8Array ? t.rgba : new Uint8Array(t.rgba));
      const p2 = pow2(t.w) && pow2(t.h);
      const wrap = m => !p2 ? gl.CLAMP_TO_EDGE : m === 1 ? gl.REPEAT : m === 2 ? gl.MIRRORED_REPEAT : gl.CLAMP_TO_EDGE;
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap(t.wrapS));
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap(t.wrapT));
      const nearest = t.magFilter === 0;
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, nearest ? gl.NEAREST : gl.LINEAR);
      if (p2 && !nearest) { gl.generateMipmap(gl.TEXTURE_2D); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); }
      else gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, nearest ? gl.NEAREST : gl.LINEAR);
      return tx;
    }
    const white = texture({ w: 1, h: 1, rgba: new Uint8Array([255, 255, 255, 255]) });

    /** Upload a parsed BMD. `poses` (from J3D.pose) gives the skinned positions; call setPose again to animate. */
    function model(m, poses) {
      const textures = m.textures.map(texture);
      const draws = m.draws.map(d => {
        const s = m.shapes[d.shape], mat = m.materials[d.material];
        const buf = data => { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW); return b; };
        return {
          shape: d.shape, mat, prog: program(mat), count: s.drw.length,
          pos: buf(poses[d.shape].pos), nrm: buf(poses[d.shape].nrm), clr: buf(s.clr), uv: buf(s.uv),
          texMtx: mat.texMtx.map(tm => tm ? srt(tm) : [1, 0, 0, 0, 1, 0, 0, 0, 1])
        };
      });
      return {
        m, textures, draws,
        setPose(p) {
          for (const d of draws) {
            gl.bindBuffer(gl.ARRAY_BUFFER, d.pos); gl.bufferData(gl.ARRAY_BUFFER, p[d.shape].pos, gl.DYNAMIC_DRAW);
            gl.bindBuffer(gl.ARRAY_BUFFER, d.nrm); gl.bufferData(gl.ARRAY_BUFFER, p[d.shape].nrm, gl.DYNAMIC_DRAW);
          }
        },
        /** Animate texture matrices: {materialName: {index: {s,r,t}}}. */
        setTexMtx(anim) {
          for (const d of draws) {
            const a = anim[d.mat.name]; if (!a) continue;
            for (const k in a) { const base = d.mat.texMtx[k]; if (base) d.texMtx[k] = srt(Object.assign({}, base, a[k])); }
          }
        }
      };
    }
    // Texture SRT as a 3x3 column-major matrix acting on (u, v, 1), about the matrix's centre.
    function srt(tm) {
      const cx = tm.center ? tm.center[0] : 0.5, cy = tm.center ? tm.center[1] : 0.5;
      const c = Math.cos(tm.r || 0), s = Math.sin(tm.r || 0), sx = tm.s[0], sy = tm.s[1];
      const a = sx * c, b = -sy * s, d = sx * s, e = sy * c;
      const tx = cx - (a * cx + b * cy) + tm.t[0], ty = cy - (d * cx + e * cy) + tm.t[1];
      return [a, d, 0, b, e, 0, tx, ty, 1];
    }

    const BF = [gl.ZERO, gl.ONE, gl.DST_COLOR, gl.ONE_MINUS_DST_COLOR, gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.DST_ALPHA, gl.ONE_MINUS_DST_ALPHA];
    const BFD = [gl.ZERO, gl.ONE, gl.SRC_COLOR, gl.ONE_MINUS_SRC_COLOR, gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.DST_ALPHA, gl.ONE_MINUS_DST_ALPHA];
    const ZF = [gl.NEVER, gl.LESS, gl.EQUAL, gl.LEQUAL, gl.GREATER, gl.NOTEQUAL, gl.GEQUAL, gl.ALWAYS];
    let frame = null;
    const flat = a => { const o = []; for (const v of a) o.push(...v); return o; };

    // Camera-facing sprites (pellets, fruit icons): one batched draw per texture.
    let spriteProg = null; const spriteBuf = gl.createBuffer();
    function sprites(tex, list, tint) {
      if (!list.length) return;
      if (!spriteProg) {
        const vs = 'attribute vec3 aPos; attribute vec2 aUV; uniform mat4 uP; varying vec2 vUV; void main() { vUV = aUV; gl_Position = uP * vec4(aPos, 1.0); }';
        const fs = 'precision mediump float; uniform sampler2D uT; uniform vec4 uTint; varying vec2 vUV; void main() { vec4 c = texture2D(uT, vUV) * uTint; if (c.a < 0.5) discard; gl_FragColor = c; }';
        const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); return o; };
        const pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, fs));
        gl.bindAttribLocation(pr, 0, 'aPos'); gl.bindAttribLocation(pr, 3, 'aUV'); gl.linkProgram(pr);
        spriteProg = { pr, uP: gl.getUniformLocation(pr, 'uP'), uT: gl.getUniformLocation(pr, 'uT'), uTint: gl.getUniformLocation(pr, 'uTint') };
      }
      const v = frame.view, data = new Float32Array(list.length * 30);
      let o = 0;
      for (const [x, y, z, size] of list) {   // corners in view space, so the quad always faces the camera
        const cx = v[0] * x + v[4] * y + v[8] * z + v[12], cy = v[1] * x + v[5] * y + v[9] * z + v[13], cz = v[2] * x + v[6] * y + v[10] * z + v[14], h = size / 2;
        const quad = [[-h, -h, 0, 1], [h, -h, 1, 1], [h, h, 1, 0], [-h, -h, 0, 1], [h, h, 1, 0], [-h, h, 0, 0]];
        for (const [dx, dy, s, t] of quad) { data[o++] = cx + dx; data[o++] = cy + dy; data[o++] = cz; data[o++] = s; data[o++] = t; }
      }
      gl.useProgram(spriteProg.pr);
      gl.uniformMatrix4fv(spriteProg.uP, false, frame.proj);
      gl.uniform4fv(spriteProg.uTint, tint || [1, 1, 1, 1]);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex); gl.uniform1i(spriteProg.uT, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, spriteBuf); gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
      for (let i = 1; i < 4; i++) gl.disableVertexAttribArray(i);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 20, 0);
      gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 2, gl.FLOAT, false, 20, 12);
      gl.disable(gl.BLEND); gl.disable(gl.CULL_FACE); gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(true);
      gl.drawArrays(gl.TRIANGLES, 0, list.length * 6);
    }
    const quadCache = new WeakMap();
    // A flat ribbon on the ground following a path (Pac-Man's trail). pts: [[x, y, z, a, white]] head first, a = alpha at
    // that point and white (0-1, optional) how much the colour is paled towards white there; the ribbon is `width` wide in the ground plane and tinted `rgb`.
    // A sixth value on a point overrides the width there (a tapering arrow head).
    let ribbonProg = null; const ribbonBuf = gl.createBuffer();
    function ribbon(pts, width, rgb) {
      if (pts.length < 2) return;
      if (!ribbonProg) {
        const sh = (t, src) => { const o = gl.createShader(t); gl.shaderSource(o, src); gl.compileShader(o); return o; };
        const pr = gl.createProgram();
        gl.attachShader(pr, sh(gl.VERTEX_SHADER, 'attribute vec3 aPos; attribute vec4 aClr; uniform mat4 uVP; varying vec4 vC; void main() { vC = aClr; gl_Position = uVP * vec4(aPos, 1.0); }'));
        gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, 'precision mediump float; varying vec4 vC; void main() { gl_FragColor = vC; }'));
        gl.bindAttribLocation(pr, 0, 'aPos'); gl.bindAttribLocation(pr, 2, 'aClr'); gl.linkProgram(pr);
        ribbonProg = { pr, uVP: gl.getUniformLocation(pr, 'uVP') };
      }
      const n = pts.length, data = new Float32Array(n * 2 * 7);
      for (let i = 0; i < n; i++) {
        const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
        let tx = b[0] - a[0], tz = b[2] - a[2]; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
        const p = pts[i], wd = p[5] !== undefined ? p[5] : width, nx = -tz * wd / 2, nz = tx * wd / 2, w = p[4] || 0;
        const c0 = rgb[0] + (1 - rgb[0]) * w, c1 = rgb[1] + (1 - rgb[1]) * w, c2 = rgb[2] + (1 - rgb[2]) * w;
        data.set([p[0] + nx, p[1], p[2] + nz, c0, c1, c2, p[3], p[0] - nx, p[1], p[2] - nz, c0, c1, c2, p[3]], i * 14);
      }
      gl.useProgram(ribbonProg.pr);
      gl.uniformMatrix4fv(ribbonProg.uVP, false, mat4.mul(frame.proj, frame.view));
      gl.bindBuffer(gl.ARRAY_BUFFER, ribbonBuf); gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
      for (let i = 1; i < 4; i++) gl.disableVertexAttribArray(i);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 28, 0);
      gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 28, 12);
      gl.disable(gl.CULL_FACE); gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(false);
      gl.enable(gl.BLEND); gl.blendEquation(gl.FUNC_ADD); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, n * 2);
      gl.depthMask(true);
    }
    // Flat-coloured polygons in screen space (frames, tabs) and stencil masks (the ghosts' circles).
    let flatProg = null; const flatBuf = gl.createBuffer();
    function poly(points, color, stencil) {
      if (!flatProg) {
        const sh = (t, src) => { const o = gl.createShader(t); gl.shaderSource(o, src); gl.compileShader(o); return o; };
        const pr = gl.createProgram();
        gl.attachShader(pr, sh(gl.VERTEX_SHADER, 'attribute vec3 aPos; uniform mat4 uP; void main() { gl_Position = uP * vec4(aPos, 1.0); }'));
        gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, 'precision mediump float; uniform vec4 uC; void main() { gl_FragColor = uC; }'));
        gl.bindAttribLocation(pr, 0, 'aPos'); gl.linkProgram(pr);
        flatProg = { pr, uP: gl.getUniformLocation(pr, 'uP'), uC: gl.getUniformLocation(pr, 'uC') };
      }
      const data = new Float32Array((points.length - 2) * 9);   // triangle fan around points[0]
      for (let i = 1, o = 0; i + 1 < points.length; i++) for (const q of [points[0], points[i], points[i + 1]]) { data[o++] = q[0]; data[o++] = q[1]; data[o++] = 0; }
      gl.useProgram(flatProg.pr);
      gl.uniformMatrix4fv(flatProg.uP, false, frame.proj); gl.uniform4fv(flatProg.uC, color || [1, 1, 1, 1]);
      gl.bindBuffer(gl.ARRAY_BUFFER, flatBuf); gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
      for (let i = 1; i < 4; i++) gl.disableVertexAttribArray(i);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
      gl.disable(gl.CULL_FACE); gl.disable(gl.DEPTH_TEST);
      if (stencil) { gl.colorMask(false, false, false, false); gl.disable(gl.BLEND); }
      else { gl.enable(gl.BLEND); gl.blendEquation(gl.FUNC_ADD); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); }
      gl.drawArrays(gl.TRIANGLES, 0, data.length / 3);
      gl.colorMask(true, true, true, true);
    }
    /** Darken or colour everything drawn so far: a blended full-viewport rectangle. */
    function screenPoly(points, color) {   // points in the viewport's own -1..1 square
      const keep = frame.proj; frame.proj = mat4.ident();
      poly(points, color); frame.proj = keep;
    }
    function tint(color) { screenPoly([[-1, -1], [1, -1], [1, 1], [-1, 1]], color); }
    // Set a material's state and draw one batch of triangles.
    function submit(d, mv, nm, texFor, opts) {
      const mat = d.mat, p = d.prog, u = p.u;
      gl.frontFace(gl.CW);   // GX treats clockwise triangles as front-facing
      gl.useProgram(p.pr);
      gl.uniformMatrix4fv(u.uMV, false, mv); gl.uniformMatrix4fv(u.uP, false, frame.proj); gl.uniformMatrix3fv(u.uNM, false, nm);
      let m0 = mat.matColor[0] || [1, 1, 1, 1];
      if (opts.matColor) m0 = m0.map((x, i) => x * opts.matColor[i]);
      gl.uniform4fv(u.uMat0, m0); gl.uniform4fv(u.uMat1, mat.matColor[1] || [1, 1, 1, 1]);
      gl.uniform4fv(u.uAmb0, mat.ambColor[0] || [0, 0, 0, 0]); gl.uniform4fv(u.uAmb1, mat.ambColor[1] || [0, 0, 0, 0]);
      gl.uniform3fv(u.uLightDir, frame.lightDir); gl.uniform3fv(u.uLightDirA, frame.lightDirA); gl.uniform4fv(u.uLightCol, frame.lightCol);
      if (u.uTM && d.texMtx.length) gl.uniformMatrix3fv(u.uTM, false, flat(d.texMtx));
      gl.uniform4fv(u.uK, flat(opts.kColors || mat.kColors)); gl.uniform4fv(u.uReg, flat(opts.tevColors || mat.tevColors));
      for (let i = 0; i < 8; i++) { gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, texFor(mat.textures[i], i)); }
      gl.uniform1iv(u.uTex, [0, 1, 2, 3, 4, 5, 6, 7]);
      const cull = mat.cull;
      if (cull === 0) gl.disable(gl.CULL_FACE);
      else { gl.enable(gl.CULL_FACE); gl.cullFace(cull === 1 ? gl.FRONT : cull === 2 ? gl.BACK : gl.FRONT_AND_BACK); }
      const bl = mat.blend;
      if (bl && bl.type === 1) { gl.enable(gl.BLEND); gl.blendEquation(gl.FUNC_ADD); gl.blendFunc(BF[bl.src], BFD[bl.dst]); }
      else if (bl && bl.type === 3) { gl.enable(gl.BLEND); gl.blendEquation(gl.FUNC_REVERSE_SUBTRACT); gl.blendFunc(gl.ONE, gl.ONE); }
      else gl.disable(gl.BLEND);
      const z = mat.zMode || { enable: true, func: 3, write: true };
      if (z.enable) { gl.enable(gl.DEPTH_TEST); gl.depthFunc(ZF[z.func]); } else gl.disable(gl.DEPTH_TEST);
      gl.depthMask(!!z.write && opts.depthWrite !== false);
      const attr = (i, b, n) => { gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.enableVertexAttribArray(i); gl.vertexAttribPointer(i, n, gl.FLOAT, false, 0, 0); };
      attr(0, d.pos, 3); attr(1, d.nrm, 3); attr(2, d.clr, 4); attr(3, d.uv, 2);
      gl.drawArrays(gl.TRIANGLES, 0, d.count);
      gl.depthMask(true);
    }
    return {
      gl, texture, model, mat4, sprites, white, poly, ribbon, tint, screenPoly,
      /** Set camera and light for the following draws. light.dir points from surfaces towards the light, in world
       * space; light.dirA, if given, is used for the alpha lighting channels instead. */
      begin(view, proj, light) {
        const L = light || { dir: [0.3, 0.8, 0.5], color: [1, 1, 1, 1] };
        const toView = ld => { const n = Math.hypot(...ld); return [view[0] * ld[0] + view[4] * ld[1] + view[8] * ld[2], view[1] * ld[0] + view[5] * ld[1] + view[9] * ld[2], view[2] * ld[0] + view[6] * ld[1] + view[10] * ld[2]].map(x => x / n); };
        frame = { view, proj, lightDir: toView(L.dir), lightDirA: toView(L.dirA || L.dir), lightCol: L.color || [1, 1, 1, 1] };
      },
      /** Draw an uploaded model. opts: textures {name: GL texture}, matColor [r,g,b,a] multiplier, filter(draw) -> bool. */
      draw(gm, world, opts) {
        opts = opts || {};
        const mv = mat4.mul(frame.view, world), nm = mat4.normal3(mv);
        for (const d of gm.draws) {
          if (opts.filter && !opts.filter(d)) continue;
          submit(d, mv, nm, ti => {
            if (!(ti >= 0 && gm.textures[ti])) return white;
            return (opts.textures && opts.textures[gm.m.textures[ti].name]) || gm.textures[ti];
          }, opts);
        }
      },
      /** Draw one quad with a material (2D screens). verts: 4 corners {x, y, u, v, c: [r,g,b,a]} in order
       * top-left, top-right, bottom-right, bottom-left; tex(i) gives the GL texture for the material's slot i. */
      quad(mat, tex, verts, opts) {
        let q = quadCache.get(mat);
        if (!q) {
          q = { mat, prog: program(mat), count: 6, pos: gl.createBuffer(), nrm: gl.createBuffer(), clr: gl.createBuffer(), uv: gl.createBuffer(), texMtx: mat.texMtx.map(tm => tm ? srt(tm) : [1, 0, 0, 0, 1, 0, 0, 0, 1]) };
          quadCache.set(mat, q);
          gl.bindBuffer(gl.ARRAY_BUFFER, q.nrm); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(18).map((_, i) => i % 3 === 2 ? 1 : 0), gl.STATIC_DRAW);
        }
        const order = [0, 1, 2, 0, 2, 3], P = new Float32Array(18), C = new Float32Array(24), U = new Float32Array(12);
        order.forEach((k, i) => { const v = verts[k]; P[i * 3] = v.x; P[i * 3 + 1] = v.y; C.set(v.c || [1, 1, 1, 1], i * 4); U[i * 2] = v.u; U[i * 2 + 1] = v.v; });
        gl.bindBuffer(gl.ARRAY_BUFFER, q.pos); gl.bufferData(gl.ARRAY_BUFFER, P, gl.DYNAMIC_DRAW);
        gl.bindBuffer(gl.ARRAY_BUFFER, q.clr); gl.bufferData(gl.ARRAY_BUFFER, C, gl.DYNAMIC_DRAW);
        gl.bindBuffer(gl.ARRAY_BUFFER, q.uv); gl.bufferData(gl.ARRAY_BUFFER, U, gl.DYNAMIC_DRAW);
        if (opts && opts.texMtx) for (const k in opts.texMtx) { const base = mat.texMtx[k]; if (base) q.texMtx[k] = srt(Object.assign({}, base, opts.texMtx[k])); }
        submit(q, frame.view, mat4.normal3(frame.view), (ti, slot) => tex(slot) || white, opts || {});
      }
    };
  }

  return { genShader, renderer, mat4 };
});
