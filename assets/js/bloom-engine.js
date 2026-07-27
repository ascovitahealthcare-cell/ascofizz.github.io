/* ════════════════════════════════════════════════════════════════════
   ASCOFIZZ · EFFERVESCENT BLOOM ENGINE
   The signature motion of this build: a tablet dissolving in water.

   · WebGL fragment shader — water column, caustics, rising bubbles with
     refraction, and a flavour bloom that diffuses through the liquid.
   · The bloom colour is a live channel. Touching a product or a
     category changes what is dissolving in the water.
   · Depth: pointer-driven tilt on aluminium cards, parallax channels.

   Budget: the shader runs on pointer-capable, wide viewports at full
   resolution and on phones at quarter resolution with the bubble count
   cut. prefers-reduced-motion renders a single static frame.
   ════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var coarse = window.matchMedia && window.matchMedia('(hover: none)').matches;
  var narrow = window.innerWidth < 900;
  var weak   = (navigator.hardwareConcurrency || 4) <= 4;
  var LOW    = coarse || narrow || weak;

  /* ── Flavour palette. Each is a real product flavour in the range. ── */
  var FLAVOURS = {
    mineral: [0.09, 0.88, 0.75],   // the water at rest
    citrus:  [1.00, 0.54, 0.24],   // Vitamin C · Glutathione · L-Carnitine
    apple:   [0.56, 0.88, 0.35],   // ACV + Moringa
    guava:   [1.00, 0.36, 0.51],   // B12 + Biotin
    cobalt:  [0.29, 0.61, 1.00]    // B12 · D3 · Magnesium
  };
  var FLAVOUR_HEX = {
    mineral: '#17E0C0', citrus: '#FF8A3D', apple: '#8EE05A',
    guava:   '#FF5C82', cobalt: '#4A9BFF'
  };
  /* Which flavour a product belongs to, read from its own name. */
  function flavourOf(text) {
    var s = (text || '').toLowerCase();
    if (/biotin|guava|hair|collagen/.test(s))                      return 'guava';
    if (/apple|acv|moringa|green|spirulina|weight|garcinia/.test(s)) return 'apple';
    if (/b12|d3|magnesium|calcium|iron|mg\+|cs\+/.test(s))          return 'cobalt';
    if (/orange|vitamin c|glutathione|carnitine|citrus|immun/.test(s)) return 'citrus';
    return 'mineral';
  }

  /* ══ 1 · THE WATER ═══════════════════════════════════════════════ */

  var VERT = [
    'attribute vec2 p;',
    'void main(){ gl_Position = vec4(p, 0.0, 1.0); }'
  ].join('\n');

  var FRAG = [
    'precision highp float;',
    'uniform vec2  uRes;',
    'uniform float uT;',
    'uniform vec3  uBloom;',   // colour currently dissolving
    'uniform vec3  uBloomPrev;',
    'uniform float uMix;',     // 0..1 crossfade between prev and current
    'uniform float uPtr;',     // pointer x, -1..1
    'uniform float uCount;',   // bubbles

    'float hash(float n){ return fract(sin(n * 43758.5453123) * 43758.5453123); }',

    'float caustic(vec2 uv, float t){',
    '  float v = 0.0;',
    '  v += sin(uv.x * 7.0 + t * 0.42);',
    '  v += sin((uv.y * 5.3 + t * 0.31) + sin(uv.x * 4.1 - t * 0.22) * 1.6);',
    '  v += sin((uv.x * 3.1 - uv.y * 4.7) + t * 0.26);',
    '  return v / 3.0;',
    '}',

    'void main(){',
    '  vec2 uv = gl_FragCoord.xy / uRes;',
    '  float ar = uRes.x / uRes.y;',
    '  vec2 sp = vec2(uv.x * ar, uv.y);',

    /* Depth: light enters at the top of the glass and falls away. */
    '  vec3 top  = vec3(0.075, 0.430, 0.450);',
    '  vec3 deep = vec3(0.006, 0.062, 0.082);',
    '  float d = pow(1.0 - uv.y, 1.15);',
    '  vec3 col = mix(top, deep, d);',

    /* The dissolving flavour. A plume enters at the surface and is
       dragged down and sideways by the convection in the glass. */
    '  vec3 bloomCol = mix(uBloomPrev, uBloom, uMix);',
    '  float src = 0.5 + uPtr * 0.12;',
    '  float swirl = caustic(sp * 1.5 + vec2(uPtr * 0.20, -uT * 0.045), uT * 1.05);',
    '  float ycol  = uv.y + swirl * 0.085;',
    '  float plume = pow(clamp(ycol, 0.0, 1.0), 1.55);',
    '  float spread = 0.30 + (1.0 - uv.y) * 0.62;',
    '  float lateral = 1.0 - smoothstep(0.0, spread, abs(uv.x - src));',
    '  float dens = plume * (0.55 + 0.45 * swirl) * (0.36 + 0.64 * lateral);',
    '  col += bloomCol * max(dens, 0.0) * 1.35;',
    /* The tablet itself, still whole at the surface, and the shell of
       colour coming off it. This is the mechanism — it must be legible
       in the first viewport whether or not anything is hovered. */
    '  vec2 drop = vec2(src * ar, 0.965);',
    '  float dd = length((sp - drop) * vec2(1.0, 1.9));',
    '  col += bloomCol * smoothstep(0.34, 0.0, dd) * 0.85;',
    '  col += vec3(0.92, 1.0, 0.99) * smoothstep(0.055, 0.0, dd) * 0.60;',
    /* Streamers pulling downward out of the drop. */
    '  float band = sin((uv.x - src) * 26.0 + swirl * 3.4 + uT * 0.6);',
    '  col += bloomCol * pow(max(band, 0.0), 2.6) * plume * lateral * 0.28;',
    '  col += vec3(0.85, 1.0, 0.98) * smoothstep(0.965, 1.0, uv.y) * 0.34;',

    /* Caustic net on the near wall of the glass. */
    '  float c = caustic(sp * 3.4, uT * 1.5);',
    '  col += vec3(0.46, 0.96, 0.90) * pow(max(c, 0.0), 3.0) * 0.22 * (0.30 + uv.y * 1.0);',

    /* Rising bubbles: refractive rim, hollow core, wobble as they climb. */
    '  for (float i = 0.0; i < 64.0; i += 1.0) {',
    '    if (i >= uCount) break;',
    '    float s  = hash(i * 1.7);',
    '    float s2 = hash(i * 3.3 + 11.0);',
    '    float s3 = hash(i * 5.1 + 27.0);',
    '    float spd = 0.048 + s2 * 0.105;',
    '    float y = fract(s3 + uT * spd);',
    '    float x = s * ar + sin(uT * (0.45 + s2 * 1.0) + i * 2.3) * 0.045 * (0.35 + y);',
    '    float r = (0.005 + s2 * 0.020) * (0.45 + y * 0.95);',
    '    float dist = length(sp - vec2(x, y));',
    /*   fade in from the bottom, burst at the surface */
    '    float life = smoothstep(0.0, 0.09, y) * (1.0 - smoothstep(0.88, 1.0, y));',
    '    float rim  = smoothstep(r, r * 0.70, dist) - smoothstep(r * 0.80, r * 0.42, dist);',
    '    float core = smoothstep(r * 0.86, 0.0, dist);',
    /*   the lit crescent on the upper-left of each bubble */
    '    float lit  = smoothstep(r * 0.55, 0.0, length(sp - vec2(x - r * 0.30, y + r * 0.30)));',
    '    col += vec3(0.72, 0.99, 0.96) * rim  * life * 0.62;',
    '    col += vec3(1.00, 1.00, 1.00) * lit  * life * 0.30;',
    '    col += bloomCol               * core * life * 0.22;',
    '  }',

    /* Vignette + dither so the gradient never bands. */
    '  float vig = 1.0 - 0.55 * pow(length((uv - 0.5) * vec2(1.05, 1.0)), 2.1);',
    '  col *= vig;',
    '  col += (hash(gl_FragCoord.x * 0.37 + gl_FragCoord.y * 1.13 + uT) - 0.5) * 0.012;',
    '  gl_FragColor = vec4(max(col, 0.0), 1.0);',
    '}'
  ].join('\n');

  function compile(gl, type, src) {
    var sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      if (window.console) console.warn('[bloom]', gl.getShaderInfoLog(sh));
      return null;
    }
    return sh;
  }

  function Water(canvas) {
    var gl = null;
    try {
      gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, powerPreference: 'high-performance' })
        || canvas.getContext('experimental-webgl', { alpha: false, antialias: false, depth: false });
    } catch (e) { gl = null; }
    if (!gl) return null;

    var vs = compile(gl, gl.VERTEX_SHADER, VERT);
    var fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return null;

    var prog = gl.createProgram();
    gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
    gl.useProgram(prog);

    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);
    var loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    var U = {
      res:   gl.getUniformLocation(prog, 'uRes'),
      t:     gl.getUniformLocation(prog, 'uT'),
      bloom: gl.getUniformLocation(prog, 'uBloom'),
      prev:  gl.getUniformLocation(prog, 'uBloomPrev'),
      mix:   gl.getUniformLocation(prog, 'uMix'),
      ptr:   gl.getUniformLocation(prog, 'uPtr'),
      count: gl.getUniformLocation(prog, 'uCount')
    };
    return { gl: gl, U: U };
  }

  /* 2D fallback: the same composition, drawn with radial gradients. */
  function Water2D(canvas) {
    var ctx = canvas.getContext && canvas.getContext('2d');
    if (!ctx) return null;
    return {
      draw: function (w, h, t, bloom) {
        var g = ctx.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, '#0E5A5E'); g.addColorStop(0.42, '#072E36'); g.addColorStop(1, '#02141A');
        ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
        ctx.globalCompositeOperation = 'lighter';
        var cx = w * (0.5 + Math.sin(t * 0.00016) * 0.08);
        var rg = ctx.createRadialGradient(cx, -h * 0.1, 0, cx, -h * 0.1, h * 1.15);
        var c = 'rgba(' + Math.round(bloom[0]*255) + ',' + Math.round(bloom[1]*255) + ',' + Math.round(bloom[2]*255) + ',';
        rg.addColorStop(0, c + '0.34)'); rg.addColorStop(0.55, c + '0.10)'); rg.addColorStop(1, c + '0)');
        ctx.fillStyle = rg; ctx.fillRect(0, 0, w, h);
        ctx.globalCompositeOperation = 'source-over';
      }
    };
  }

  /* ── Bloom state, shared by the shader and the CSS custom property ── */
  var cur = FLAVOURS.mineral.slice();
  var prev = FLAVOURS.mineral.slice();
  var mixT = 1;
  var pointerX = 0;

  function setFlavour(name) {
    var next = FLAVOURS[name] || FLAVOURS.mineral;
    if (next[0] === cur[0] && next[1] === cur[1] && next[2] === cur[2]) return;
    prev = cur.slice(); cur = next.slice(); mixT = 0;
    document.documentElement.style.setProperty('--bloom', FLAVOUR_HEX[name] || FLAVOUR_HEX.mineral);
  }
  window.ascofizzBloom = setFlavour;

  function startWater() {
    var canvas = document.getElementById('shaderHeroCanvas');
    var host = document.getElementById('shaderHero');
    if (!canvas || !host) return;

    var w = Water(canvas);
    var fallback = w ? null : Water2D(canvas);
    if (!w && !fallback) return;

    var DPR = Math.min(window.devicePixelRatio || 1, LOW ? 1.25 : 2);
    var SCALE = LOW ? 0.55 : 0.85;          // render below CSS size, upscale
    var BUBBLES = LOW ? 22 : 54;
    var W = 0, H = 0, running = true, raf = null, t0 = performance.now();

    function resize() {
      var r = host.getBoundingClientRect();
      W = Math.max(1, Math.round(r.width  * DPR * SCALE));
      H = Math.max(1, Math.round(r.height * DPR * SCALE));
      canvas.width = W; canvas.height = H;
      canvas.style.width = '100%'; canvas.style.height = '100%';
      if (w) w.gl.viewport(0, 0, W, H);
    }

    function frame(now) {
      if (!running) { raf = null; return; }
      var t = (now - t0) / 1000;
      if (mixT < 1) mixT = Math.min(1, mixT + 0.022);
      if (w) {
        var gl = w.gl, U = w.U;
        gl.uniform2f(U.res, W, H);
        gl.uniform1f(U.t, t);
        gl.uniform3fv(U.bloom, cur);
        gl.uniform3fv(U.prev, prev);
        gl.uniform1f(U.mix, mixT);
        gl.uniform1f(U.ptr, pointerX);
        gl.uniform1f(U.count, BUBBLES);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      } else {
        fallback.draw(W, H, now, cur);
      }
      raf = requestAnimationFrame(frame);
    }

    resize();
    if (reduce) {
      frame(performance.now());          // one static frame, then stop
      running = false;
    } else {
      raf = requestAnimationFrame(frame);
      if ('IntersectionObserver' in window) {
        new IntersectionObserver(function (es) {
          es.forEach(function (e) {
            running = e.isIntersecting;
            if (running && raf === null) { t0 = performance.now() - 1000; raf = requestAnimationFrame(frame); }
          });
        }, { threshold: 0 }).observe(host);
      }
      document.addEventListener('visibilitychange', function () {
        running = !document.hidden;
        if (running && raf === null) raf = requestAnimationFrame(frame);
      });
    }

    var rt;
    window.addEventListener('resize', function () {
      clearTimeout(rt);
      rt = setTimeout(function () { resize(); if (reduce) frame(performance.now()); }, 200);
    }, { passive: true });
  }

  /* ══ 2 · DEPTH ═══════════════════════════════════════════════════
     Cards are metal plates suspended in the water; they catch the light
     as the pointer moves past them.                                   */

  var TILT_SELECTOR = [
    '.product-card', '.cat-card', '.cat-card-sm', '.cert-card', '.value-card',
    '.blog-card', '.rt-card', '.pkg-card', '.b2b-svc-card', '.b2b-mini-card',
    '.sub-card', '.brochure-card', '.testi-card', '.access-card'
  ].join(',');

  function tiltable(el) {
    if (el.__tilt) return;
    el.__tilt = true;
    el.setAttribute('data-tilt', '');

    var raf = null, tx = 0, ty = 0, pz = 0;
    function apply() {
      raf = null;
      el.style.setProperty('--tx', tx.toFixed(2) + 'deg');
      el.style.setProperty('--ty', ty.toFixed(2) + 'deg');
      el.style.setProperty('--pz', pz.toFixed(1) + 'px');
    }
    el.addEventListener('pointermove', function (e) {
      if (e.pointerType !== 'mouse') return;
      var r = el.getBoundingClientRect();
      var nx = (e.clientX - r.left) / r.width  - 0.5;
      var ny = (e.clientY - r.top)  / r.height - 0.5;
      tx = -ny * 9; ty = nx * 11; pz = 26;
      el.classList.add('fz-live');
      if (raf === null) raf = requestAnimationFrame(apply);
    }, { passive: true });
    el.addEventListener('pointerleave', function () {
      tx = 0; ty = 0; pz = 0;
      el.classList.remove('fz-live');
      if (raf === null) raf = requestAnimationFrame(apply);
    }, { passive: true });
  }

  function scanTilt() {
    if (LOW || reduce) return;
    var nodes = document.querySelectorAll(TILT_SELECTOR);
    for (var i = 0; i < nodes.length; i++) tiltable(nodes[i]);
  }

  /* Product plates push their own flavour into the water on hover. */
  function scanFlavour() {
    document.addEventListener('pointerenter', function () {}, true); // noop, keeps listener list stable
    document.addEventListener('mouseover', function (e) {
      var t = e.target;
      if (!t || !t.closest) return;
      var card = t.closest('.product-card, .cat-card-sm, .cat-card, .promo-card, .qm-rp, .b-prod-row');
      if (!card) return;
      setFlavour(flavourOf(card.textContent));
    }, { passive: true });
    document.addEventListener('mouseout', function (e) {
      var t = e.relatedTarget;
      if (t && t.closest && t.closest('.product-card, .cat-card-sm, .cat-card, .promo-card, .qm-rp, .b-prod-row')) return;
      setFlavour('mineral');
    }, { passive: true });
  }

  /* Magnetic pull on the page's leading actions. */
  function magnetise() {
    if (LOW || reduce) return;
    var nodes = document.querySelectorAll('.shader-btn-primary, .nav-cta, .btn-primary, .btn-gold, .promo-card-cta');
    Array.prototype.forEach.call(nodes, function (el) {
      if (el.__mag) return;
      el.__mag = true;
      el.setAttribute('data-magnet', '');
      el.addEventListener('pointermove', function (e) {
        if (e.pointerType !== 'mouse') return;
        var r = el.getBoundingClientRect();
        var dx = (e.clientX - (r.left + r.width / 2)) / r.width;
        var dy = (e.clientY - (r.top + r.height / 2)) / r.height;
        el.style.transform = 'translate(' + (dx * 8).toFixed(1) + 'px,' + (dy * 6).toFixed(1) + 'px)';
      }, { passive: true });
      el.addEventListener('pointerleave', function () { el.style.transform = ''; }, { passive: true });
    });
  }

  /* Pointer and scroll channels, read by CSS. */
  function channels() {
    var root = document.documentElement, raf = null, mx = 0, my = 0;
    if (!coarse && !reduce) {
      window.addEventListener('pointermove', function (e) {
        mx = (e.clientX / window.innerWidth) * 2 - 1;
        my = (e.clientY / window.innerHeight) * 2 - 1;
        pointerX = mx;
        if (raf === null) raf = requestAnimationFrame(function () {
          raf = null;
          root.style.setProperty('--mx', mx.toFixed(3));
          root.style.setProperty('--my', my.toFixed(3));
        });
      }, { passive: true });
    }
    var sraf = null;
    window.addEventListener('scroll', function () {
      if (sraf !== null) return;
      sraf = requestAnimationFrame(function () {
        sraf = null;
        var max = document.body.scrollHeight - window.innerHeight;
        root.style.setProperty('--scrollv', max > 0 ? (window.scrollY / max).toFixed(4) : '0');
      });
    }, { passive: true });
  }

  /* ══ 3 · BUBBLE FIELD ════════════════════════════════════════════
     Ambient bubbles across the whole page, not only the hero.        */
  function bubbles() {
    if (reduce) return;
    var n = LOW ? 6 : 14;
    for (var i = 0; i < n; i++) {
      (function (i) {
        setTimeout(function () {
          var b = document.createElement('div');
          b.className = 'particle';
          var size = 3 + Math.random() * 9;
          b.style.cssText = [
            'width:' + size.toFixed(1) + 'px',
            'height:' + size.toFixed(1) + 'px',
            'left:' + (Math.random() * 100).toFixed(2) + '%',
            'animation-duration:' + (14 + Math.random() * 20).toFixed(1) + 's',
            'animation-delay:' + (Math.random() * 10).toFixed(1) + 's'
          ].join(';');
          document.body.appendChild(b);
        }, i * 700);
      })(i);
    }
  }

  /* ══ 4 · WIRING ══════════════════════════════════════════════════ */
  function boot() {
    startWater();
    channels();
    bubbles();
    scanTilt();
    magnetise();
    scanFlavour();

    /* Re-scan after the app renders grids or swaps pages. */
    var pending = null;
    function rescan() {
      clearTimeout(pending);
      pending = setTimeout(function () { scanTilt(); magnetise(); }, 220);
    }
    ['shopGrid', 'featuredGrid', 'newArrivalsGrid', 'relatedGrid', 'bundleProdList', 'homeBlogGrid', 'fullBlogGrid']
      .forEach(function (id) {
        var el = document.getElementById(id);
        if (el && window.MutationObserver) new MutationObserver(rescan).observe(el, { childList: true });
      });

    var wrapTimer = setInterval(function () {
      if (typeof window.showPage === 'function' && !window.__fzPageWrapped) {
        window.__fzPageWrapped = true;
        var orig = window.showPage;
        window.showPage = function (pg) { orig(pg); rescan(); };
        clearInterval(wrapTimer);
      }
    }, 200);
    setTimeout(function () { clearInterval(wrapTimer); }, 12000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
