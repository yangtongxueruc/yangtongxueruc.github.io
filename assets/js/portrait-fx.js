/* ============================================================================
   portrait-fx.js — 首屏人像「乱线团」动态替代层
   ----------------------------------------------------------------------------
   加载方式：index.html 里那段引导脚本按 (min-width:941px) and (hover:hover) and
   (pointer:fine) 条件注入。手机 / 平板既不下载本文件，也不命中配套 CSS，
   等于完全不存在。

   做什么：在 .portrait 里叠一块透明 canvas，用纯 Canvas 2D 画一团持续揉动的
   手绘乱线，替代原来那张静态照片。原 <img> 节点**保留**（只淡到不可见），
   所以 `.portrait:has(img)`、`.is-empty` 判定、aspect-ratio、圆角、边框、
   角标、状态徽标全都照旧 —— 这里只加一块 canvas，不动任何既有样式。

   为什么是「框内渐隐」：.portrait 有 overflow:hidden，飘出框外的部分必被裁。
   于是把渐隐带放在框内——径向渐变负责外圈变淡，最后再叠一层矩形边缘遮罩
   （destination-in），让线条在贴到框边之前就淡到 0，看不到硬裁切口。

   接口：window.PortraitFX.set({ strokes, twist, interact, ... }) / off() / stats()
   调试：?pfx=0 关闭   ?pfx=still 定格单帧（视觉回归截图用）
   ========================================================================== */
(function () {
  "use strict";

  /* 幂等：重复引入不会挂两套循环 */
  if (window.PortraitFX) return;

  var root = document.documentElement;
  var params = new URLSearchParams(location.search);
  var still = params.get("pfx") === "still";

  /* ---------------- 可调参数 ----------------
     尺寸基准：框只有 ~380px（手机端 120px 左右但不加载），是独立 demo
     620px 画布的 1/2.7 面积。笔迹数、采样点数、线宽都按这个比例收紧，
     否则同一套参数搬过来会密成一团钢丝球。

     **这些值只是默认值**。真正生效的值来自内容文件
     `pages.home.sections.hero.portraitFx`（控制台「首屏乱线团」几组字段），
     由 render.js 的 applyHomeOptions → PortraitFX.apply() 推下来。
     字段清空 / 没填就落回这里，所以删掉整块 portraitFx 也是安全的。*/
  var DEFAULTS = {
    on: true,            // 总开关：关掉就回滚成原来的照片
    strokes: 108,        // 短笔迹条数（另有固定长笔触）
    longStrokes: 4,      // 连续长笔触：一只手不停绕圈，是线团主体
    longPointsMin: 380,
    longPointsMax: 620,
    pointsMin: 16,
    pointsMax: 36,
    wobble: 1.0,         // 扰动幅度：线条「揉动」的强度
    lively: 1.0,         // 灵动：行波传播 + 偶发抽动 + 微抖
    float: 1.0,          // 漂浮：整团漂移 / 逐笔迹视差 / 外圈呼吸外扩
    alphaScale: 1.0,     // 内部浓淡；整体亮度由 CSS 的 opacity 统一压（见 index.html）
    /* 扭曲度 0~2.0：沿线条缓慢传播的角度扭转。0 = 平顺长弧，
       0.6~1.2 = 舒展而仍有缠绕（默认 1.0），1.5~2.0 = 明显扭动 */
    twist: 1.0,
    /* 鼠标交互总强度 0~2.0。0 = 关闭 */
    interact: 1.0,
    ptr: {
      near: 0.26,        // 近场半径 / 短边：排斥，把线「拨开」
      far: 0.60,         // 远场半径 / 短边：吸引 + 速度拖曳
      push: 0.072,
      pull: 0.026,
      drag: 0.055,
      follow: 0.32,      // 指针位置低通（每 60fps 帧的趋近比例）
      velSmooth: 0.28,
      maxVel: 2.0,       // 速度上限 / 短边每秒，防快速甩动形变爆炸
      inRate: 9.0,       // 进入时力场上升速率 (1/s)
      outRate: 5.0,      // 离开时衰减速率 (1/s)
      k: 70,             // 每点弹簧刚度
      c: 12,             // 阻尼，ζ≈0.72：柔和回弹、几乎不过冲
      maxDt: 1 / 30      // 弹簧积分步长上限
    },
    speed: 1.0,
    lineWidth: 1.10,     // 线上现有观感是「细而密」，线宽按这个走
    spin: 0.014,         // 整体旋转角速度 rad/s
    radius: 0.46,        // 线团半径 / 框短边
    fadeInner: 0.30,     // 径向渐变内圈（相对短边），此内完全不透明
    fadeOuter: 1.0,      // 渐变外沿 = 0.5 * 对角线 * 该系数
    edgeFade: 0.13,      // 矩形边缘渐隐带宽（相对短边的比例），0 = 关闭
    maxDpr: 2,
    costBudget: 8,       // 单帧绘制耗时预算 ms
    minStrokes: 20,      // 自适应下限
    seed: 20261115
  };

  /* 取值范围。控制台滑块用的是同一组上下限（schema.js 里另有副本，
     两边必须一致），这里再 clamp 一次 —— 有人直接改 content.js 写进
     离谱数字时不会把画面搞崩。*/
  var LIMITS = {
    strokes: [10, 200], longStrokes: [1, 8],
    longPointsMin: [80, 1200], longPointsMax: [80, 1600],
    pointsMin: [6, 80], pointsMax: [6, 120],
    wobble: [0, 2], lively: [0, 2], float: [0, 2], twist: [0, 2],
    alphaScale: [0, 1.5], interact: [0, 2], speed: [0, 2],
    lineWidth: [0.2, 3], spin: [0, 0.1], radius: [0.2, 0.6],
    fadeInner: [0, 0.6], fadeOuter: [0.4, 1.3], edgeFade: [0, 0.4],
    maxDpr: [1, 3], costBudget: [4, 30], minStrokes: [10, 100],
    seed: [0, 4294967295]
  };
  var PTR_LIMITS = {
    near: [0.05, 0.6], far: [0.1, 1.0], push: [0, 0.25], pull: [0, 0.12],
    drag: [0, 0.2], follow: [0.05, 0.9], velSmooth: [0.05, 0.9],
    maxVel: [0.3, 5], inRate: [0.5, 30], outRate: [0.5, 30],
    k: [10, 300], c: [2, 40], maxDtMs: [8, 60]
  };

  function cloneCfg(o) {
    var out = {};
    for (var k in o) {
      if (!o.hasOwnProperty(k)) continue;
      out[k] = (o[k] && typeof o[k] === "object") ? cloneCfg(o[k]) : o[k];
    }
    return out;
  }

  var CONFIG = cloneCfg(DEFAULTS);
  var enabled = true;

  function clampNum(v, lim) {
    var n = parseFloat(v);
    if (!isFinite(n)) return null;
    if (lim) { if (n < lim[0]) n = lim[0]; if (n > lim[1]) n = lim[1]; }
    return n;
  }

  /* 把内容文件里的 portraitFx 推下来。字段名与 CONFIG 同名（指针那些
     用扁平名 near / far / ...），值可以是数字也可以是字符串 —— 控制台
     存的一律是字符串，直接改 content.js 时又常写成数字。
     只有真正变化时才做重建，避免控制台拖滑块时反复 rebuild 顿卡。*/
  function applyConfig(cfg) {
    if (!cfg) return CONFIG;
    var needRebuild = false, needGrad = false, needMask = false, needDraw = false, needResize = false;

    /* 总开关 */
    if (cfg.on !== undefined) {
      var on = !(cfg.on === false || cfg.on === "false" || cfg.on === "off" || cfg.on === 0 || cfg.on === "0");
      if (on !== enabled) { setEnabled(on); needDraw = true; }
    }

    function take(key) {
      if (cfg[key] === undefined || cfg[key] === null || cfg[key] === "") return;
      var n = clampNum(cfg[key], LIMITS[key]);
      if (n === null) return;
      if (key === "seed") n = Math.round(n);
      if (CONFIG[key] === n) return;
      CONFIG[key] = n;
      needDraw = true;
      if (/^(strokes|longStrokes|longPoints(Min|Max)|points(Min|Max)|seed)$/.test(key)) needRebuild = true;
      else if (key === "fadeInner" || key === "fadeOuter") needGrad = true;
      else if (key === "edgeFade") needMask = true;
      else if (key === "maxDpr") needResize = true;
    }
    ["strokes", "longStrokes", "longPointsMin", "longPointsMax", "pointsMin", "pointsMax",
     "wobble", "lively", "float", "twist", "interact", "alphaScale", "speed", "lineWidth",
     "spin", "radius", "fadeInner", "fadeOuter", "edgeFade", "maxDpr", "costBudget",
     "minStrokes", "seed"].forEach(take);

    /* 指针力场：扁平字段 → CONFIG.ptr */
    for (var pk in PTR_LIMITS) {
      if (!PTR_LIMITS.hasOwnProperty(pk)) continue;
      var src = pk === "maxDtMs" ? "maxDt" : pk;
      if (cfg[src] === undefined || cfg[src] === null || cfg[src] === "") continue;
      var pv = clampNum(cfg[src], PTR_LIMITS[pk]);
      if (pv === null) continue;
      if (pk === "maxDtMs") pv = pv / 1000;
      if (CONFIG.ptr[src] === pv) continue;
      CONFIG.ptr[src] = pv;
      needDraw = true;
    }

    if (!needDraw) return CONFIG;

    if (needRebuild) rebuild(CONFIG.seed);
    /* 还没布局好 / 换了 DPR：交给 resize 重新量尺寸并画首帧 */
    if (needResize || !host || cssW < 8) { resize(); return CONFIG; }
    if (needGrad) buildGradient();
    if (needMask) buildMask();
    if (needRebuild) activeCount = all.length;
    draw(t, 0);
    return CONFIG;
  }

  /* 读内容文件里的配置；读不到就全用默认值 */
  function readContent() {
    try {
      return window.V2_CONTENT.pages.home.sections.hero.portraitFx || {};
    } catch (e) { return {}; }
  }

  var TAU = Math.PI * 2;

  var canvas = document.createElement("canvas");
  canvas.className = "pfx";
  canvas.setAttribute("aria-hidden", "true");
  /* 几何用 inline 兜底：即使样式表没匹配上，位置与层级也是对的。
     opacity 交给 CSS（只有 data-pfx 置位后才淡入） */
  canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;"
    + "display:block;z-index:2;pointer-events:none;";

  var ctx = canvas.getContext("2d", { alpha: true });

  var host = null;                  // 当前挂载的 .portrait
  var cssW = 0, cssH = 0, shortPx = 1, dpr = 1;
  var grad = null, mask = null;
  var all = [], activeCount = 0;
  var t = 11.3;                     // 起始相位错开，首帧形态不是对称的
  var last = 0, raf = 0, lastTick = 0;
  var running = false, visible = true, reduce = false;
  var revealed = false, costs = [];
  var ink = "184,196,208";

  /* ---- 指针力场状态：全部是连续量，任何事件都不做硬重置 ---- */
  var PTR = { tx: 0, ty: 0, x: 0, y: 0, vx: 0, vy: 0, s: 0, inZone: false, has: false };

  /* ======================== 随机与笔迹生成 ======================== */

  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var x = Math.imul(a ^ a >>> 15, 1 | a);
      x = x + Math.imul(x ^ x >>> 7, 61 | x) ^ x;
      return ((x ^ x >>> 14) >>> 0) / 4294967296;
    };
  }

  function animParams(rng, isLong) {
    return {
      f1: 0.20 + rng() * 0.55,
      f2: 0.55 + rng() * 1.10,
      f3: 0.90 + rng() * 1.80,
      ph1: rng() * TAU, ph2: rng() * TAU, ph3: rng() * TAU, ph4: rng() * TAU,
      wob: (isLong ? 0.022 : 0.030) + rng() * (isLong ? 0.055 : 0.080),
      /* 空间波数压到低频：波浪沿整条线只起伏 1~3 次，不会逐点跳变成毛刺 */
      kWave: (isLong ? 0.006 : 0.045) + rng() * (isLong ? 0.022 : 0.16),
      waveSpeed: (isLong ? 0.40 : 0.70) + rng() * (isLong ? 0.90 : 1.60),
      burst: 0.35 + rng() * 1.05,
      micro: 0.005 + rng() * 0.012,
      bend: (isLong ? 0.10 : 0.14) + rng() * (isLong ? 0.20 : 0.26),
      kBend: (isLong ? 0.012 : 0.060) + rng() * (isLong ? 0.020 : 0.140),
      bendSpeed: 0.25 + rng() * 0.55,
      phBend: rng() * TAU,
      alpha: (isLong ? 0.62 : 0.50) + rng() * (isLong ? 0.36 : 0.42),
      width: (isLong ? 0.62 : 0.50) + rng() * 0.50,
      pulse: 0.04 + rng() * 0.11,
      pf: 0.15 + rng() * 0.40,
      flicker: !isLong && rng() < 0.10,
      drift: rng() * TAU,
      depth: 0.45 + rng() * 1.0       // 视差层次：每条线漂的幅度不同
    };
  }

  /* 预存基准半径 + 每个采样点独立的形变状态。
     点缓冲 px/py 也一并预分配复用 —— 每帧 new Float32Array 会产生
     每秒数千次的小对象分配，白给 GC 压力。*/
  function attachPoints(o, bx, by) {
    var n = o.n;
    var rr = new Float32Array(n);
    for (var i = 0; i < n; i++) rr[i] = Math.sqrt(bx[i] * bx[i] + by[i] * by[i]);
    o.bx = bx; o.by = by; o.rr = rr;
    o.ox = new Float32Array(n); o.oy = new Float32Array(n);
    o.vx = new Float32Array(n); o.vy = new Float32Array(n);
    o.px = new Float32Array(n); o.py = new Float32Array(n);
    return o;
  }

  /* 长笔触排在数组最前面 —— 自适应降级从尾部减，主体形态不会消失 */
  function buildStrokes(count, rng) {
    var out = [], s, i, n;

    /* ---- 1) 连续长笔触：一只手在纸上不停绕圈，一笔不断 ---- */
    for (s = 0; s < CONFIG.longStrokes; s++) {
      n = CONFIG.longPointsMin + Math.floor(rng() * (CONFIG.longPointsMax - CONFIG.longPointsMin + 1));
      var bx = new Float32Array(n), by = new Float32Array(n);
      var ang = rng() * TAU, rad = 0.34 + rng() * 0.58, dir = rng() < 0.5 ? 1 : -1;
      var target = rad;
      /* 每条长笔触各有偏心、椭圆率与整体倾角 —— 不共圆心才不会叠成同心线圈 */
      var oa = rng() * TAU, om = 0.10 + rng() * 0.34;
      var ox = Math.cos(oa) * om, oy = Math.sin(oa) * om;
      var ex = 0.55 + rng() * 0.90, tilt = rng() * TAU;
      var ct = Math.cos(tilt), stt = Math.sin(tilt);
      for (i = 0; i < n; i++) {
        ang += dir * (0.022 + rng() * 0.095);
        if (rng() < 0.018) dir = -dir;                      // 频繁反向，制造折返
        if (rng() < 0.005) ang += (rng() - 0.5) * 1.4;      // 极偶发角度跳变（太多会画出飞线）
        /* 有向内回归的趋势：外圈只出现零散长弧，不会画成完整大圈 */
        target += (0.62 - target) * 0.022 + (rng() - 0.5) * 0.17;
        if (rng() < 0.018) target = 0.16 + rng() * 0.92;    // 偶发甩到外圈
        if (target < 0.08) target = 0.08;
        if (target > 1.06) target = 1.06;
        rad += (target - rad) * 0.32;
        var xx = Math.cos(ang) * rad * ex, yy = Math.sin(ang) * rad * (2 - ex);
        bx[i] = xx * ct - yy * stt + ox + (rng() - 0.5) * 0.04;
        by[i] = xx * stt + yy * ct + oy + (rng() - 0.5) * 0.04;
        /* 只做极宽松的上限：允许笔触伸到框边，那一带由渐隐负责消失 */
        var rr = Math.sqrt(bx[i] * bx[i] + by[i] * by[i]);
        if (rr > 1.52) { bx[i] *= 1.52 / rr; by[i] *= 1.52 / rr; }
      }
      var lo = animParams(rng, true);
      lo.n = n; lo.closed = false;
      /* 3/4 走平滑曲线，只留一丝折角，外轮廓不至于全是生硬多边形 */
      lo.smooth = (s % 4 !== 0); lo.long = true;
      out.push(attachPoints(lo, bx, by));
    }

    /* ---- 2) 短笔迹：环 / 穿心长弧 / 惯性折返，补密度与尖角 ---- */
    for (s = 0; s < count; s++) {
      var roll = rng();
      var type = roll < 0.26 ? 0 : (roll < 0.56 ? 1 : 2);
      n = CONFIG.pointsMin + Math.floor(rng() * (CONFIG.pointsMax - CONFIG.pointsMin + 1));
      bx = new Float32Array(n); by = new Float32Array(n);
      var u, th, r, closed = false;

      if (type === 0) {
        var rot = rng() * TAU;
        /* 双峰：四成是小环、紧贴中心，把中间糊成一片；六成是大环，
           各带偏心铺到外围。原图那种「中心死黑、外缘只剩零星大圈」的
           密度梯度就来自这个比例，而不是靠调渐变压出来。*/
        var isSmall = rng() < 0.46;
        var scale = isSmall
          ? 0.04 + rng() * 0.20
          : 0.45 + Math.pow(rng(), 0.80) * 0.62;
        var cxo = (rng() - 0.5) * (isSmall ? 0.36 : 0.62);
        var cyo = (rng() - 0.5) * (isSmall ? 0.36 : 0.62);
        var sx = 0.78 + rng() * 0.44, sy = 0.78 + rng() * 0.44;
        var k1 = 2 + Math.floor(rng() * 4), k2 = 5 + Math.floor(rng() * 7);
        var a1 = 0.04 + rng() * 0.12, a2 = 0.02 + rng() * 0.07;
        var p1 = rng() * TAU, p2 = rng() * TAU;
        closed = rng() < 0.40;
        for (i = 0; i < n; i++) {
          u = i / (n - 1);
          th = rot + u * TAU * (closed ? 1 : 0.55 + 0.35 * u);
          r = scale * (1 + a1 * Math.sin(k1 * th + p1) + a2 * Math.sin(k2 * th + p2));
          if (r > 1.30) r = 1.30;
          bx[i] = Math.cos(th) * r * sx + cxo;
          by[i] = Math.sin(th) * r * sy + cyo;
        }
      } else if (type === 1) {
        var a0 = rng() * TAU;
        var span = Math.PI * (0.65 + rng() * 0.70);
        var r0 = 0.34 + rng() * 0.86, r1 = 0.34 + rng() * 0.86;
        var aEnd = a0 + span + (rng() - 0.5) * 0.6;
        var ax = Math.cos(a0) * r0, ay = Math.sin(a0) * r0;
        var ex2 = Math.cos(aEnd) * r1, ey = Math.sin(aEnd) * r1;
        var mx = (a0 + aEnd) * 0.5;
        var perpX = -Math.sin(mx), perpY = Math.cos(mx);
        var bend = (rng() - 0.5) * 0.84;
        var wf = 1 + Math.floor(rng() * 4), wp = rng() * TAU;
        var wa = 0.06 + rng() * 0.16;
        for (i = 0; i < n; i++) {
          u = i / (n - 1);
          var arc = Math.sin(Math.PI * u);
          var wig = wa * Math.sin(u * TAU * wf + wp) * arc;
          bx[i] = ax * (1 - u) + ex2 * u + perpX * (bend * arc + wig);
          by[i] = ay * (1 - u) + ey * u + perpY * (bend * arc + wig);
        }
      } else {
        var x = (rng() - 0.5) * 0.86, y = (rng() - 0.5) * 0.86;
        var ang2 = rng() * TAU, step = 0.045 + rng() * 0.105;
        for (i = 0; i < n; i++) {
          ang2 += (rng() - 0.5) * 1.6;
          x += Math.cos(ang2) * step;
          y += Math.sin(ang2) * step;
          if (x * x + y * y > 1.50) { ang2 += Math.PI * 0.75; x *= 0.62; y *= 0.62; }
          bx[i] = x; by[i] = y;
        }
      }

      var q = animParams(rng, false);
      q.n = n; q.closed = closed;
      q.smooth = type === 1 ? rng() < 0.82 : (type === 2 ? rng() < 0.55 : rng() < 0.85);
      q.long = false;
      out.push(attachPoints(q, bx, by));
    }
    return out;
  }

  function rebuild(seed) {
    all = buildStrokes(CONFIG.strokes, mulberry32(seed));
    activeCount = all.length;
    costs.length = 0;
  }

  /* ======================== 尺寸 / 渐变 / 遮罩 ======================== */

  function pickInk() {
    var light = root.getAttribute("data-theme") === "light";
    var fx = (document.body && document.body.dataset.fx) || "glow";
    /* paper 是白纸底，其余在浅色主题下也是浅底 —— 这两种都要深墨 */
    return (light || fx === "paper") ? "26,29,34" : "184,196,208";
  }

  /* 径向渐变：中心实，越往外越淡。外沿取对角线的一半，
     这样四个角也在渐变范围内，不至于中间圆亮、四角空成白的。*/
  function buildGradient() {
    var cx = cssW / 2, cy = cssH / 2;
    var inner = Math.max(2, shortPx * CONFIG.fadeInner);
    var outer = Math.max(inner + 2, Math.hypot(cssW, cssH) * 0.5 * CONFIG.fadeOuter);
    var g = ctx.createRadialGradient(cx, cy, inner, cx, cy, outer);
    g.addColorStop(0, "rgba(" + ink + ",1)");
    g.addColorStop(0.50, "rgba(" + ink + ",0.92)");
    g.addColorStop(0.75, "rgba(" + ink + ",0.45)");
    g.addColorStop(0.92, "rgba(" + ink + ",0.12)");
    g.addColorStop(1, "rgba(" + ink + ",0)");
    grad = g;
  }

  /* 矩形边缘遮罩：贴到框边之前把像素擦干净。
     .portrait 是 overflow:hidden，不这样做就会在边框内侧看到一刀直切口。*/
  function buildMask() {
    mask = null;
    if (!CONFIG.edgeFade) return;
    var W = canvas.width, H = canvas.height;
    if (W < 8 || H < 8) return;
    var c = document.createElement("canvas");
    c.width = W; c.height = H;
    var g = c.getContext("2d");
    g.fillStyle = "#fff";
    g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = "destination-out";
    var e = Math.max(2, Math.round(Math.min(W, H) * CONFIG.edgeFade));
    var steps = [
      [0, 0, e, 0, 0, 0, e, H],           // 左
      [W, 0, W - e, 0, W - e, 0, e, H],   // 右
      [0, 0, 0, e, 0, 0, W, e],           // 上
      [0, H, 0, H - e, 0, H - e, W, e]    // 下
    ];
    for (var i = 0; i < steps.length; i++) {
      var s = steps[i];
      var gr = g.createLinearGradient(s[0], s[1], s[2], s[3]);
      gr.addColorStop(0, "rgba(0,0,0,1)");
      gr.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = gr;
      g.fillRect(s[4], s[5], s[6], s[7]);
    }
    mask = c;
  }

  function resize() {
    if (!host) return;
    var w = host.clientWidth, h = host.clientHeight;
    if (w < 8 || h < 8) return;                    // 还没布局好，等观察器再来
    cssW = w; cssH = h;
    shortPx = Math.min(w, h);
    dpr = Math.min(CONFIG.maxDpr, window.devicePixelRatio || 1);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ink = pickInk();
    buildGradient();
    buildMask();
    draw(t, 0);
    if (all.length) reveal();
  }

  /* ======================== 指针 ======================== */

  function updatePointer(dt) {
    var p = CONFIG.ptr;
    /* 低通系数按 60fps 归一化，帧率变化时手感一致 */
    var alpha = 1 - Math.pow(1 - p.follow, dt * 60);
    var prevX = PTR.x, prevY = PTR.y;
    PTR.x += (PTR.tx - PTR.x) * alpha;
    PTR.y += (PTR.ty - PTR.y) * alpha;
    var maxV = p.maxVel * shortPx;
    var rawVx = dt > 0 ? (PTR.x - prevX) / dt : 0;
    var rawVy = dt > 0 ? (PTR.y - prevY) / dt : 0;
    rawVx = Math.max(-maxV, Math.min(maxV, rawVx));
    rawVy = Math.max(-maxV, Math.min(maxV, rawVy));
    var va = 1 - Math.pow(1 - p.velSmooth, dt * 60);
    PTR.vx += (rawVx - PTR.vx) * va;
    PTR.vy += (rawVy - PTR.vy) * va;
    /* 进入快、离开慢：跟随灵敏，回弹从容 */
    var target = (PTR.inZone && CONFIG.interact > 0) ? 1 : 0;
    var rate = target > PTR.s ? p.inRate : p.outRate;
    PTR.s += (target - PTR.s) * (1 - Math.exp(-rate * dt));
    if (PTR.s < 0.0005 && !target) PTR.s = 0;
  }

  /* 挂在 window 上：canvas 有 pointer-events:none，但仍能收到全页指针坐标。
     不做 preventDefault，滚动 / 拖拽 / 触屏都不受影响。*/
  function onPointerMove(e) {
    if (!host) return;
    var r = canvas.getBoundingClientRect();
    if (r.width < 8) return;
    var pad = Math.min(r.width, r.height) * 0.20;
    var x = e.clientX - r.left, y = e.clientY - r.top;
    PTR.tx = x; PTR.ty = y;
    /* 首次事件直接对齐，避免从 (0,0) 低通出一条假的高速拖曳 */
    if (!PTR.has) { PTR.x = x; PTR.y = y; PTR.has = true; }
    PTR.inZone = (x > -pad && x < r.width + pad && y > -pad && y < r.height + pad);
  }
  window.addEventListener("pointermove", onPointerMove, { passive: true });
  window.addEventListener("blur", function () { PTR.inZone = false; });
  document.addEventListener("mouseleave", function () { PTR.inZone = false; });

  /* ======================== 绘制 ======================== */

  function draw(time, dt) {
    dt = dt || 0;
    if (!ctx || !all.length || !grad || !cssW) return;
    ctx.globalCompositeOperation = "source-over";
    ctx.clearRect(0, 0, cssW, cssH);
    ctx.globalAlpha = 1;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    var cx = cssW / 2, cy = cssH / 2;
    var R = shortPx * CONFIG.radius;
    var L = CONFIG.lively, F = CONFIG.float, TW = CONFIG.twist;
    /* 整团重心的低频李萨如漂移：不是匀速平移，而是悬着慢慢晃 */
    var floatX = F * (0.030 * Math.sin(time * 0.17) + 0.014 * Math.sin(time * 0.41 + 1.1));
    var floatY = F * (0.026 * Math.cos(time * 0.13 + 0.6) + 0.012 * Math.sin(time * 0.37));
    /* 整体旋转不匀速：叠两个慢波，像手腕在晃 */
    var gRot = time * CONFIG.spin
      + L * (0.045 * Math.sin(time * 0.21) + 0.018 * Math.sin(time * 0.57 + 1.3));
    var cs = Math.cos(gRot), sn = Math.sin(gRot);
    var breathe = 1 + 0.016 * Math.sin(time * 0.33) + 0.010 * Math.sin(time * 0.79 + 1.1);
    var wob = CONFIG.wobble;

    /* ---- 指针力场：预先算成像素量，点循环内只做乘加 ---- */
    var p = CONFIG.ptr;
    var iOn = CONFIG.interact > 0 && PTR.s > 0.0005 && PTR.has;
    var Rn = p.near * shortPx, Rf = p.far * shortPx;
    var Rf2 = Rf * Rf;
    var pushPx = p.push * shortPx * CONFIG.interact * PTR.s;
    var pullPx = p.pull * shortPx * CONFIG.interact * PTR.s;
    var dragPx = p.drag * CONFIG.interact * PTR.s;
    var sdt = Math.min(dt, p.maxDt);
    var stir = 0;
    if (iOn) {
      var speedN = Math.sqrt(PTR.vx * PTR.vx + PTR.vy * PTR.vy) / shortPx;
      stir = PTR.s * 0.16 * Math.min(1, speedN);
    }

    for (var s = 0; s < activeCount; s++) {
      var st = all[s];
      var a = (st.alpha + st.pulse * Math.sin(time * st.pf + st.ph3)) * CONFIG.alphaScale;
      if (st.flicker) a *= 0.55 + 0.45 * Math.sin(time * 0.23 + st.ph2);
      if (a <= 0.02) continue;
      if (a > 0.92) a = 0.92;

      /* 共用径向渐变负责外圈变淡，globalAlpha 保留每笔迹自己的浓淡 */
      ctx.strokeStyle = grad;
      ctx.globalAlpha = a;
      ctx.lineWidth = st.width * CONFIG.lineWidth;
      ctx.beginPath();

      /* 非谐波时间：多个不可约频率叠加，打破匀速正弦的机械感 */
      var tt = time * st.f1
        + 0.38 * Math.sin(time * st.f2 + st.ph1)
        + 0.16 * Math.sin(time * st.f3 * 0.7 + st.ph2);
      /* 偶发抽动：sin⁴ 只在很短的时间窗里有峰值，像手忽然抖一下 */
      var bs = Math.sin(time * 0.63 + st.ph3);
      var burst = bs > 0 ? bs * bs * bs * bs : 0;
      var amp = wob * st.wob * (1 + L * st.burst * burst);
      var kick = L * st.burst * burst * 0.030;
      var dx = 0.040 * Math.sin(time * 0.31 + st.drift) + 0.020 * Math.sin(time * 0.73 + st.ph4)
             + kick * Math.cos(st.ph1) + floatX
             + F * st.depth * 0.018 * Math.sin(time * 0.23 + st.ph2);
      var dy = 0.040 * Math.cos(time * 0.27 + st.drift) + 0.020 * Math.cos(time * 0.67 + st.ph1)
             + kick * Math.sin(st.ph2) + floatY
             + F * st.depth * 0.018 * Math.cos(time * 0.19 + st.ph3);
      var kW = st.kWave, sp = st.waveSpeed;
      var px = st.px, py = st.py;

      for (var i = 0; i < st.n; i++) {
        /* 所有扰动的空间频率都压到低频：沿线条缓慢起伏，而不是逐点跳变 */
        var wave = Math.sin(i * kW - tt * sp + st.ph2);
        var wave2 = Math.sin(i * kW * 0.43 + tt * 0.61 + st.ph4);
        var micro = Math.sin(time * st.f3 + i * 0.17 + st.ph1);
        var d = amp * (0.70 * wave + 0.30 * wave2) + L * wob * st.micro * micro;
        var jx = wob * st.wob * 0.42 * Math.sin(tt * 1.3 + i * 0.055 + st.ph3);
        var jy = wob * st.wob * 0.42 * Math.cos(tt * 1.1 + i * 0.060 + st.ph4);
        /* 扭曲度：沿整条线缓慢传播的大尺度弯曲。频率固定为低频，
           调大 twist 只会更弯，不会退化成锯齿 */
        var bendWave = Math.sin(i * st.kBend - tt * st.bendSpeed + st.phBend);
        var bendR = TW * st.bend * 0.55 * bendWave;
        /* 越靠外的点越随时间向外「呼」一下，配合渐隐像线在往外飘 */
        var edge = st.rr[i] - 0.62;
        if (edge < 0) edge = 0; else if (edge > 0.6) edge = 0.6;
        var spread = F * 0.09 * edge * Math.sin(time * 0.29 + st.ph4 + st.rr[i] * 2.1);
        var grow = 1 + d + 0.025 * Math.sin(time * 0.45 + st.drift) + spread + bendR;
        /* 切向扭转：各采样点按缓变角度旋转，直接改变曲线形状 */
        var bendAng = (TW * st.bend * 0.90 + stir) * bendWave;
        var cb = Math.cos(bendAng), sb = Math.sin(bendAng);
        var gx = st.bx[i] * grow, gy = st.by[i] * grow;
        var rx = (gx * cb - gy * sb + jx + dx) * breathe;
        var ry = (gx * sb + gy * cb + jy + dy) * breathe;
        px[i] = cx + (rx * cs - ry * sn) * R;
        py[i] = cy + (rx * sn + ry * cs) * R;

        /* ---- 鼠标力场 + 逐点弹簧-阻尼 ----
           目标偏移在鼠标离开后为 0，但弹簧积分仍每帧执行，
           残余形变才会自己平滑回弹，既不冻结也不「啪」地跳回。*/
        var tX = 0, tY = 0;
        if (iOn) {
          var qdx = px[i] - PTR.x, qdy = py[i] - PTR.y;
          var qd2 = qdx * qdx + qdy * qdy;
          if (qd2 < Rf2) {
            var qd = Math.sqrt(qd2) + 0.0001;
            var ux = qdx / qd, uy = qdy / qd;
            /* 近场三次核排斥、远场二次核吸引 + 速度拖曳 */
            var wn = 0;
            if (qd < Rn) { var ku = 1 - qd / Rn; wn = ku * ku * ku; }
            var wf = 1 - qd / Rf; wf = wf * wf;
            var radial = pushPx * wn - pullPx * wf;
            tX = ux * radial + dragPx * wf * PTR.vx;
            tY = uy * radial + dragPx * wf * PTR.vy;
          }
        }
        /* 半隐式欧拉：sdt 上限 1/30 保证快速移动时数值稳定 */
        var aX = p.k * (tX - st.ox[i]) - p.c * st.vx[i];
        var aY = p.k * (tY - st.oy[i]) - p.c * st.vy[i];
        st.vx[i] += aX * sdt; st.vy[i] += aY * sdt;
        st.ox[i] += st.vx[i] * sdt; st.oy[i] += st.vy[i] * sdt;
        px[i] += st.ox[i]; py[i] += st.oy[i];
      }

      /* 扭曲度低时全走平滑曲线，彻底消除僵硬折角 */
      if (st.smooth || TW < 0.6) {
        ctx.moveTo((px[0] + px[1]) * 0.5, (py[0] + py[1]) * 0.5);
        for (var j = 1; j < st.n - 1; j++) {
          ctx.quadraticCurveTo(px[j], py[j], (px[j] + px[j + 1]) * 0.5, (py[j] + py[j + 1]) * 0.5);
        }
        var li = st.n - 1;
        if (st.closed) ctx.quadraticCurveTo(px[li], py[li], (px[li] + px[0]) * 0.5, (py[li] + py[0]) * 0.5);
        else ctx.lineTo(px[li], py[li]);
      } else {
        ctx.moveTo(px[0], py[0]);
        for (var j2 = 1; j2 < st.n; j2++) ctx.lineTo(px[j2], py[j2]);
        if (st.closed) ctx.closePath();
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    /* 边缘遮罩：把贴到框边的一圈擦干净，避免出现硬裁切口 */
    if (mask) {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = "destination-in";
      ctx.drawImage(mask, 0, 0);
      ctx.restore();
    }
  }

  /* 自适应：只看 draw() 的真实耗时，不受 vsync / 后台节流干扰 */
  function adapt(cost) {
    costs.push(cost);
    if (costs.length > 40) costs.shift();
    if (costs.length < 20) return;
    var sum = 0;
    for (var i = 0; i < costs.length; i++) sum += costs[i];
    var avg = sum / costs.length;
    if (avg > CONFIG.costBudget && activeCount > CONFIG.minStrokes) {
      activeCount = Math.max(CONFIG.minStrokes, activeCount - 6);
      costs.length = 0;
    } else if (avg < CONFIG.costBudget * 0.55 && activeCount < all.length) {
      activeCount = Math.min(all.length, activeCount + 3);
      costs.length = 0;
    }
  }

  /* ======================== 主循环 ======================== */

  function canRun() {
    return !still && visible && !document.hidden;
  }

  function loop(now) {
    raf = 0;
    if (!canRun()) return;
    lastTick = now;
    var dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016;
    last = now;
    t += dt * CONFIG.speed * (reduce ? 0.35 : 1);
    updatePointer(dt);
    try {
      var t0 = performance.now();
      draw(t, dt);
      adapt(performance.now() - t0);
    } catch (e) {
      /* 单帧出错也不能断链，否则画面永久停在那一帧 */
    } finally {
      if (canRun()) raf = requestAnimationFrame(loop);
    }
  }

  function sync() {
    if (canRun() && !raf) { last = 0; lastTick = performance.now(); raf = requestAnimationFrame(loop); }
    else if (!canRun() && raf) { cancelAnimationFrame(raf); raf = 0; }
  }

  /* 兜底：浏览器偶尔把已排队的 raf 吞掉（后台休眠、页面冻结后恢复），
     光看 raf 有没有值判断不出来，按「最后一帧过去多久」复核。 */
  setInterval(function () {
    if (!canRun()) return;
    if (raf && performance.now() - lastTick < 3000) return;
    if (!host) return;
    var r = host.getBoundingClientRect();
    var vh = window.innerHeight || 800;
    if (r.bottom < 0 || r.top > vh) { visible = false; return; }
    raf = 0;
    sync();
  }, 2200);

  /* ======================== 生命周期 ======================== */

  function reveal() {
    /* 首帧画完了才置位：脚本一旦失败，照片照旧（引导脚本 2.5s 后也会回滚）*/
    if (!enabled || !all.length || !host) return;
    if (root.getAttribute("data-pfx") !== "on") root.setAttribute("data-pfx", "on");
    revealed = true;
  }

  /* 总开关：控制台「开关」字段 / PortraitFX.set({on:false}) 都走这里。
     不销毁 canvas、不重建笔迹 —— 只是停循环 + 让 data-pfx 消失，
     照片淡回来、canvas 淡出去，再打开是连续的，不会有「重新生成一版」的跳变。*/
  function setEnabled(on) {
    enabled = !!on;
    if (!enabled) {
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      root.removeAttribute("data-pfx");
      return;
    }
    if (all.length) { draw(t, 0); reveal(); }
    sync();
  }

  var io = null, ro = null, resizeTimer = 0;

  function observe() {
    if (io) io.disconnect();
    if (ro) ro.disconnect();
    io = ro = null;
    if (host && "IntersectionObserver" in window) {
      io = new IntersectionObserver(function (en) {
        visible = en[0].isIntersecting;
        sync();
      }, { threshold: 0.02 });
      io.observe(host);
    }
    if (host && "ResizeObserver" in window) {
      ro = new ResizeObserver(function () {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(resize, 90);
      });
      ro.observe(host);
    }
  }

  /* 控制台改字段会整段重绘（patchSection 换掉 .hero 节点，main.innerHTML=""），
     这时把画布搬到新的 .portrait 上即可，不用重建笔迹、不用重算参数 */
  function ensure() {
    var box = document.querySelector(".portrait");
    if (!box) return false;
    if (!all.length) rebuild(CONFIG.seed);
    if (box !== host) {
      host = box;
      box.appendChild(canvas);
      observe();
      resize();
      if (!still) sync();
    } else if (!box.contains(canvas)) {
      box.appendChild(canvas);
      resize();
    }
    return true;
  }

  window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resize, 160);
  });
  document.addEventListener("visibilitychange", sync);
  window.addEventListener("pageshow", sync);
  window.addEventListener("focus", sync);

  /* 换主题 / 换 fx 要换墨色（深底银线、浅底黑线） */
  new MutationObserver(function () {
    var want = pickInk();
    if (want === ink) return;
    ink = want;
    buildGradient();
    draw(t, 0);
  }).observe(root, { attributes: true, attributeFilter: ["data-theme"] });

  var moTimer = 0;
  new MutationObserver(function () {
    clearTimeout(moTimer);
    moTimer = setTimeout(ensure, 150);
  }).observe(document.body, { childList: true, subtree: true });

  var mq = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
  reduce = !!(mq && mq.matches);
  if (mq && mq.addEventListener) mq.addEventListener("change", function (e) { reduce = e.matches; });

  /* ---------------- 对外接口 ----------------
     apply(cfg) 是控制台走的正式入口：字段名与内容文件一致、带上下限 clamp，
     只有真变化才重建。set() 是同一件事的别名，保留给老调用方与手动调试。*/
  window.PortraitFX = {
    apply: function (cfg) {
      if (!ensure()) return CONFIG;
      applyConfig(cfg);
      /* 关闭状态下也要能重新打开：applyConfig 已经处理了 on 切换 */
      if (enabled && document.hidden === false) sync();
      return CONFIG;
    },
    set: function (o) {
      return window.PortraitFX.apply(o);
    },
    /* 只切换总开关，不动其他参数 */
    toggle: function (on) { setEnabled(on); return enabled; },
    /* 彻底拆掉：移除 canvas、恢复照片。再想启用需要重新加载页面 */
    off: function () {
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      setEnabled(false);
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
      host = null; revealed = false;
    },
    /* 当前完整参数快照，控制台「查看」用 */
    config: function () {
      var out = cloneCfg(CONFIG);
      out.on = enabled;
      return out;
    },
    defaults: function () { return cloneCfg(DEFAULTS); },
    stats: function () {
      /* deform：所有采样点当前偏移的均方根（px）。
         鼠标离开后它必须自己衰减到 0 —— 这是「阻尼回弹」唯一可靠的定量判据，
         光看截图分不清「回弹了」和「停在另一个随机形状」。*/
      var sum = 0, cnt = 0;
      for (var i = 0; i < activeCount; i++) {
        var st = all[i];
        for (var j = 0; j < st.n; j++) {
          sum += st.ox[j] * st.ox[j] + st.oy[j] * st.oy[j];
          cnt++;
        }
      }
      return {
        mounted: !!host, active: activeCount, total: all.length,
        w: cssW, h: cssH, dpr: dpr, ink: ink, enabled: enabled,
        running: !!raf, visible: visible, still: still, reduce: reduce,
        field: PTR.s, deform: cnt ? Math.sqrt(sum / cnt) : 0
      };
    }
  };

  /* ---------------- 启动 ----------------
     内容文件里的参数先落地（这些是唯一真源，控制台改的就是它们），
     再开始建画布 —— 否则会先用默认值画一帧、再被配置覆盖，白闪一下。*/
  applyConfig(readContent());

  /* render.js 在 DOMContentLoaded 之后才建首屏，所以要轮询等它落位 */
  if (still) {
    /* 定格模式：不跑循环，只画一帧；截图回归用它保证两侧完全一致 */
    var stillBoot = function () {
      if (ensure()) clearInterval(iv);
    };
    var iv = setInterval(stillBoot, 50);
    stillBoot();
    document.addEventListener("DOMContentLoaded", stillBoot);
    return;
  }

  var tries = 0;
  var boot = function () {
    if (ensure()) clearInterval(iv2);
    else if (++tries > 120) clearInterval(iv2);
  };
  var iv2 = setInterval(boot, 50);
  document.addEventListener("DOMContentLoaded", boot);
})();
