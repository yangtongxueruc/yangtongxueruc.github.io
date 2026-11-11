/* ============================================================================
   hero-dots.js — 首屏「流动点阵」背景（demo 版）
   做法：规则网格上按一张随时间漂移的分形噪声场决定每个点的大小与透明度，
        再叠一层 domain warp，让起伏像烟雾一样互相推挤、缓慢流动。
   参考：careers.kimi.com/about-us 最后一屏的点阵质感。
   ----------------------------------------------------------------------------
   性能：所有点都从一张「直径 × 透明度」预渲染图集里 blit，
        不画 arc、不缩放贴图，1.4 万个点也能稳在 60fps。
   接口：window.HeroDots.set({ morph, step, alpha, speed, tone, scale })
        window.HeroDots.toggle(false) / window.HeroDots.stats()
   ========================================================================== */
(function () {
  var started = false;
  /* 首屏是 render.js 在 DOMContentLoaded 之后渲染的，这里要等它落位 */
  function boot() {
    var el = document.querySelector(".hero");
    if (!el) return false;
    start();
    return true;
  }
  if (!boot()) {
    var tries = 0;
    var wait = function () {
      if (boot() || ++tries > 80) clearInterval(iv);
    };
    var iv = setInterval(wait, 50);
    document.addEventListener("DOMContentLoaded", function () { wait(); });
  }

  function start() {
    /* 轮询和 DOMContentLoaded 可能都成功一次，重复 start 会挂两块画布、
       两个循环，旧的那块还没人接手管，白烧 CPU */
    if (started) return;
    started = true;

    var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    /* ---------------- 参数 ---------------- */
    var P = {
      morph: "smoke",   // smoke | aurora | ripple
      step: 8,          // 网格间距（CSS px）
      alpha: 0.36,      // 整体强度 0..1
      speed: 0.55,      // 流动速度 0..2
      tone: "white",    // white | teal | gray
      scale: 235,       // 特征尺度（px），越小起伏越碎
      minR: 0.35,       // 暗处的点半径
      maxR: 2.9,        // 亮处的点半径
      floor: 0.1,       // 暗处的最低不透明度
      lo: 0.36,         // 场对比度下限（越大，暗区越多）
      hi: 0.70          // 场对比度上限
    };

    var canvas = document.createElement("canvas");
    canvas.className = "hero-dots";
    canvas.setAttribute("aria-hidden", "true");
    var ctx = canvas.getContext("2d", { alpha: true });
    var hero = null, io = null, ro = null;
    var dpr = 1, W = 0, H = 0, pts = [], visible = true, off = false;
    var t = 1.4, last = 0, raf = 0, slow = 0, degraded = false, lastTick = 0;

    /* ---------------- 噪声 ---------------- */
    function hash(x, y) {
      /* 必须用 Math.imul 保持 32 位；普通乘法溢出 2^53 后值域会被压到 0~0.5 */
      var h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263);
      h = Math.imul(h ^ (h >>> 13), 1274126177);
      h ^= h >>> 16;
      return (h >>> 0) / 4294967296;
    }
    function noise(x, y) {
      var xi = Math.floor(x), yi = Math.floor(y);
      var xf = x - xi, yf = y - yi;
      var u = xf * xf * (3 - 2 * xf);
      var v = yf * yf * (3 - 2 * yf);
      var a = hash(xi, yi), b = hash(xi + 1, yi);
      var c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
      return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
    }
    function fbm(x, y) {
      /* 两层就够：三层会让起伏太碎，点阵会变成噪点而不是成片的云 */
      return noise(x, y) * 0.62 +
             noise(x * 2.07 + 11.3, y * 2.07 - 7.1) * 0.38;
    }
    function smoothstep(a, b, x) {
      var k = (x - a) / (b - a);
      k = k < 0 ? 0 : k > 1 ? 1 : k;
      return k * k * (3 - 2 * k);
    }

    /* ---------------- 三种形态 ---------------- */
    function fieldSmoke(x, y, tt) {
      var S = 1 / P.scale;
      var wx = (noise(x * S * 0.62 + tt * 0.07, y * S * 0.62 + 3.1) - 0.5) * 2.4;
      var wy = (noise(x * S * 0.62 + 17.3, y * S * 0.62 - tt * 0.055) - 0.5) * 2.4;
      var f = fbm(x * S + wx * 0.85 + tt * 0.05, y * S * 0.72 + wy * 0.85);
      return smoothstep(P.lo, P.hi, f);
    }
    function fieldAurora(x, y, tt) {
      var S = 1 / P.scale;
      var warp = (noise(x * S * 0.8, y * S * 0.45 + tt * 0.04) - 0.5) * 3.0;
      var band = Math.sin(y * S * 1.25 + warp * 2.1 + x * S * 0.3 + tt * 0.45);
      var f = 0.5 + 0.5 * band;
      f *= 0.5 + 0.5 * fbm(x * S * 0.9 + tt * 0.03, y * S * 0.9);
      return smoothstep(P.lo - 0.04, P.hi, f);
    }
    function fieldRipple(x, y, tt) {
      var S = 1 / P.scale;
      var cx = W * 0.5 + Math.cos(tt * 0.13) * W * 0.16;
      var cy = H * 0.45 + Math.sin(tt * 0.11) * H * 0.12;
      var dx = x - cx, dy = y - cy;
      var d = Math.sqrt(dx * dx + dy * dy);
      var wob = noise(x * S * 0.8 + tt * 0.05, y * S * 0.8) * 6.2;
      var f = 0.5 + 0.5 * Math.sin(d * S * 0.9 - tt * 1.15 + wob);
      f *= 0.45 + 0.55 * (1 - Math.min(1, d / (H * 1.25)));
      return smoothstep(P.lo - 0.06, P.hi + 0.16, f);
    }
    var FIELDS = { smoke: fieldSmoke, aurora: fieldAurora, ripple: fieldRipple };

    /* ---------------- 点位图集 ---------------- */
    var TILE = 34, ALPHA_STEPS = 8, atlas = null;
    function buildAtlas() {
      /* 深色主题用白点；浅色主题必须换成深点，否则白点直接看不见 */
      var light = document.documentElement.getAttribute("data-theme") === "light";
      var col = P.tone === "teal" ? (light ? "12, 112, 104" : "150, 245, 238")
              : P.tone === "gray" ? (light ? "96, 104, 108" : "168, 180, 184")
              : (light ? "26, 30, 34" : "255, 255, 255");
      var c = document.createElement("canvas");
      c.width = (TILE - 1) * TILE;
      c.height = ALPHA_STEPS * TILE;
      var g = c.getContext("2d");
      for (var ai = 0; ai < ALPHA_STEPS; ai++) {
        var a = (ai + 1) / ALPHA_STEPS;
        g.fillStyle = "rgba(" + col + "," + a + ")";
        for (var s = 2; s < TILE; s++) {
          g.beginPath();
          g.arc((s - 2) * TILE + s / 2, ai * TILE + s / 2, s / 2 - 0.35, 0, Math.PI * 2);
          g.fill();
        }
      }
      atlas = c;
    }

    /* ---------------- 尺寸 / 网格 ---------------- */
    function build() {
      if (!hero) return;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      var rect = hero.getBoundingClientRect();
      W = Math.round(rect.width);
      H = Math.round(rect.height);
      if (W < 4 || H < 4) return;          // iframe 还没布局好，等 ResizeObserver 再来一次
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      canvas.style.width = W + "px";
      canvas.style.height = H + "px";

      var step = P.step;
      if (W < 760) step = Math.max(9, step * 1.15);   // 手机上略放粗一点，不然点太小糊成灰
      var y0 = step * 0.5;
      pts = [];
      for (var y = y0; y < H; y += step) {
        for (var x = y0; x < W; x += step) {
          pts.push(x, y);
        }
      }
      draw(t);
    }

    /* ---------------- 绘制（设备像素坐标，整数落点） ---------------- */
    function draw(tt) {
      if (!atlas) buildAtlas();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.globalAlpha = 1;

      var fn = FIELDS[P.morph] || fieldSmoke;
      var maxR = P.maxR * (W < 760 ? 0.74 : 1);
      var minR = P.minR;

      for (var i = 0; i < pts.length; i += 2) {
        var f = fn(pts[i], pts[i + 1], tt);
        /* 半径随亮度走：暗处只留小点、亮处点几乎相碰，才像半调网点 */
        var r = minR + (maxR - minR) * Math.pow(f, 1.15);
        var a = P.alpha * (0.5 + 0.5 * f) * (P.floor + (1 - P.floor) * f);
        /* 边缘渐隐，避免点阵在首屏边界上被硬切一刀 */
        var px = pts[i], py = pts[i + 1];
        if (px < 90) a *= px / 90;
        else if (px > W - 90) a *= (W - px) / 90;
        if (py < 130) a *= py / 130;
        else if (py > H - 150) a *= (H - py) / 150;
        if (a < 0.02) continue;

        var d = Math.round(r * 2 * dpr);
        if (d < 2) d = 2; else if (d > TILE - 1) d = TILE - 1;
        var ai = Math.round(a * ALPHA_STEPS) - 1;
        if (ai < 0) ai = 0; else if (ai >= ALPHA_STEPS) ai = ALPHA_STEPS - 1;

        var dx = Math.round(pts[i] * dpr - d / 2);
        var dy = Math.round(pts[i + 1] * dpr - d / 2);
        ctx.drawImage(atlas, (d - 2) * TILE, ai * TILE, d, d, dx, dy, d, d);
      }
    }

    /* ---------------- 主循环 ----------------
       跑不跑只有一个判断：点阵开着、页面在前台、首屏在视口内、没要求减少动态效果。
       以前这里有个 running 变量，切换标签页时会被置 false，而恢复只在
       "首屏仍在视口内"时才会重新置 true —— 于是「先滚离首屏、再切走标签页、
       切回来、再滚回首屏」这条路上，running 永远是 false，点阵就再也不动了。 */
    function canRun() {
      return !off && !document.hidden && visible && !reduce;
    }
    function loop(now) {
      raf = 0;
      if (!canRun()) return;
      lastTick = now;
      var dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016;
      last = now;
      try {
        var t0 = performance.now();
        t += dt * P.speed;
        draw(t);
        var cost = performance.now() - t0;

        /* 自适应降级：连续偏慢就拉稀网格，宁可少点也别掉帧 */
        if (!noAdapt && !degraded && P.step < 16 && cost > 10) {
          if (++slow > 40) { degraded = true; P.step = Math.min(16, P.step * 1.3); build(); }
        } else if (cost < 7 && slow > 0) {
          slow--;
        }
      } catch (e) {
        /* 单帧出错也不能断链，否则整块背景就永久停在那一帧 */
      } finally {
        if (canRun()) raf = requestAnimationFrame(loop);
      }
    }
    function play() {
      if (raf || !canRun()) return;
      last = 0;
      raf = requestAnimationFrame(loop);
    }
    function stop() {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    }
    function sync() { if (canRun()) play(); else stop(); }

    /* 兜底：浏览器偶尔会把已经排上的 raf 回调吞掉（后台休眠、页面冻结后恢复）。
       这种时候 raf 里还留着一个永远不会触发的 id，光看它有没有值判断不出来，
       所以按「最后一帧过去了多久」判断，超过 3 秒没动就重新拉起。 */
    setInterval(function () {
      if (!canRun()) return;
      if (raf && performance.now() - lastTick < 3000) return;
      raf = 0;
      raf = requestAnimationFrame(loop);
    }, 2000);

    /* ---------------- 生命周期 ---------------- */
    var rt = 0;
    window.addEventListener("resize", function () {
      clearTimeout(rt);
      rt = setTimeout(build, 180);
    });
    document.addEventListener("visibilitychange", function () { sync(); });
    /* 换主题要换点的颜色（白点/深点） */
    new MutationObserver(function () {
      atlas = null;
      draw(t);
    }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    /* 两层观察器都要能跟着新的 .hero 重绑：
       ① ResizeObserver——控制台预览是后挂载的 iframe，加载瞬间还没有尺寸；
       ② IntersectionObserver——离开首屏就停，省电。 */
    function observeAll() {
      if (io) io.disconnect();
      if (ro) ro.disconnect();
      io = ro = null;
      if ("IntersectionObserver" in window) {
        io = new IntersectionObserver(function (en) {
          visible = en[0].isIntersecting;
          sync();
        }, { threshold: 0.02 });
        io.observe(hero);
      }
      if ("ResizeObserver" in window) {
        ro = new ResizeObserver(function () {
          clearTimeout(rt);
          rt = setTimeout(build, 120);
        });
        ro.observe(hero);
      }
    }

    /* 改首屏文字会整段重绘（patchSection 换掉 .hero 节点）：
       把画布搬到新节点上即可，不用重建 canvas，也不用重算参数 */
    function ensure() {
      var el = document.querySelector(".hero");
      if (!el) return false;
      if (el !== hero) {
        hero = el;
        hero.insertBefore(canvas, hero.firstChild);
        hero.classList.add("hero--dots");
        observeAll();
        build();
      }
      return true;
    }

    /* ---------------- 对外接口 ----------------
       控制台改字段 → render.js 的 applyHomeOptions() → HeroDots.apply()。
       每次 apply 都重建网格再画一帧，代价很小（1.5 万个点只是 push 数字）。 */
    function num(v, def, lo, hi) {
      var n = parseFloat(v);
      if (!isFinite(n)) n = def;
      return n < lo ? lo : n > hi ? hi : n;
    }
    window.HeroDots = {
      apply: function (o) {
        o = o || {};
        if (!ensure()) return P;
        var wantOn = !(o.on === false || o.on === "false" || o.on === "off" || o.on === 0 || o.on === "0");
        if (o.morph && FIELDS[o.morph]) P.morph = o.morph;
        if (o.tone) P.tone = o.tone;
        if (o.step !== undefined) P.step = num(o.step, P.step, 5, 18);
        if (o.alpha !== undefined) P.alpha = num(o.alpha, 36, 5, 95) / 100;
        if (o.speed !== undefined) P.speed = num(o.speed, 55, 0, 200) / 100;
        if (o.scale !== undefined) P.scale = num(o.scale, 235, 100, 460);
        if (o.lo !== undefined) P.lo = num(o.lo, P.lo, 0, 0.62);
        if (o.hi !== undefined) P.hi = num(o.hi, P.hi, 0.4, 0.95);

        atlas = null;
        build();
        setOn(wantOn);
        return P;
      },
      set: function (o) { return window.HeroDots.apply(o); },
      toggle: function (on) { setOn(on); },
      stats: function () { return { pts: pts.length / 2, step: P.step, morph: P.morph, dpr: dpr, on: !off }; }
    };

    function setOn(on) {
      off = !on;
      canvas.classList.toggle("hero-dots--off", off);
      sync();
    }

    /* ---------------- 启动 ----------------
       默认值来自内容文件（pages.home.sections.hero.dots），控制台可改。 */
    var q = new URLSearchParams(location.search);
    /* ?adapt=0 关掉自适应降级：截图对比时用，避免低性能环境把点阵拉稀 */
    var noAdapt = q.get("adapt") === "0";
    if (q.has("morph") && FIELDS[q.get("morph")]) P.morph = q.get("morph");
    if (q.has("step")) P.step = Math.max(4, Math.min(24, +q.get("step") || P.step));
    if (q.has("alpha")) P.alpha = Math.max(0.05, Math.min(1, (+q.get("alpha") || 50) / 100));
    if (q.has("speed")) P.speed = Math.max(0, Math.min(2, (+q.get("speed") || 55) / 100));
    if (q.has("scale")) P.scale = Math.max(60, Math.min(600, +q.get("scale") || P.scale));
    if (q.has("tone")) P.tone = q.get("tone");
    if (q.has("lo")) P.lo = Math.max(0, Math.min(0.6, +q.get("lo") || P.lo));
    if (q.has("hi")) P.hi = Math.max(0.4, Math.min(0.95, +q.get("hi") || P.hi));

    var cfg = null;
    try {
      cfg = window.V2_CONTENT.pages.home.sections.hero.dots;
    } catch (e) {}
    window.HeroDots.apply(cfg || {});

    if (reduce) draw(1.4);
  }
})();
