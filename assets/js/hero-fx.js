/* ============================================================================
   HERO-FX.JS — 首屏「氛围层」与统一控制台门面
   ----------------------------------------------------------------------------
   只做两件事，都跟点阵互不干扰：

   ① 门面：window.HeroFx.set / stats / pulse / reset。
      桌面站与手机 demo 用同一套键名，所以同一条控制台命令在两边都能跑；
      本端不支持的键会被安静忽略，从 stats().supported 里能看出来。

   ② 光点层（glow:'motes'）：在 .hero 里放几个小光点，每轮随机亮 1–N 个，
      亮度 / 尺寸 / 呼吸时长各不相同，起亮依次错开 → 像散落的一串闪点。
      **默认 glow:'css'**：只用 home.css 里那套单一光斑，本文件一个节点都不建。

   点阵（流动网点）仍然归 hero-dots.js。这里只把 dots 参数转发过去，
   不接管它的生命周期，也不复制它的实现——那是最容易把桌面版弄坏的地方。

   ----------------------------------------------------------------------------
   回滚：window.HeroFx.set({glow:'css'}) 立刻回到今天的样子，不用改文件。
   单位兼容：alpha / speed 传 36 / 55（老控制台的百分数）或 .36 / .55 都认。
   ========================================================================== */
(function () {
  "use strict";

  /* 幂等：重复引入不会挂两套 */
  if (window.HeroFx) return;

  var root = document.documentElement;
  var body = document.body;
  var LAYERS = 5;
  var EASE = "cubic-bezier(.22,1,.36,1)";

  /* 默认值按桌面尺寸给（手机 demo 有自己的一套默认值，键名相同、数值不同） */
  var DEFAULTS = {
    glow: "css",        // css（单一光斑，现状）| motes（多点闪烁）| off
    scale: 0.9,         // 光点尺寸系数
    min: 380,           // 基准直径区间（px），再乘 scale
    max: 700,
    countMin: 1,        // 每轮亮几个
    countMax: 5,
    peakMin: 0.22,      // 每轮每个点的峰值亮度
    peakMax: 0.68,
    dur: 3.2,           // 基准呼吸时长（秒）
    gapMin: 900,        // 一轮接一轮的空窗（ms）
    gapMax: 2600,
    shrink: true        // 点多了各自缩一档，别糊成一片
  };
  var P = {};
  for (var dk in DEFAULTS) if (DEFAULTS.hasOwnProperty(dk)) P[dk] = DEFAULTS[dk];

  var hero = null;
  var motes = [];
  var gen = [];
  var timers = [];
  var roundTimer = null;
  var io = null;
  var inView = true;
  var active = false;

  function reduce() {
    return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }
  function num(v, def, lo, hi) {
    var n = parseFloat(v);
    if (!isFinite(n)) n = def;
    return n < lo ? lo : n > hi ? hi : n;
  }
  /* 老调用方传 36 / 55，新调用方传 .36 / .55，这里统一到 0–1 */
  function unit(v, def, lo, hi) {
    var n = parseFloat(v);
    if (!isFinite(n)) n = def;
    if (n > 1) n /= 100;
    return num(n, def, lo, hi);
  }
  function isOff(v) {
    return v === false || v === "false" || v === "off" || v === 0 || v === "0";
  }

  /* ---------- 首屏节点（内容重绘会整段换掉 .hero，所以要能重找） ---------- */
  function findHero() {
    var el = document.querySelector(".hero");
    if (!el) return null;
    if (el !== hero) {
      /* 旧节点连同挂在里面的光点一起没了，只留参数 */
      hero = el;
      motes = [];
      gen = [];
      watch();
    }
    return hero;
  }
  /* 首屏离开视口就停手，省电；回来再接上 */
  function watch() {
    if (io) io.disconnect();
    io = null;
    if (!hero || !("IntersectionObserver" in window)) return;
    io = new IntersectionObserver(function (en) {
      inView = en[0].isIntersecting;
      if (!active) return;
      if (inView) schedule(200);
      else stopRounds();
    }, { threshold: 0.02 });
    io.observe(hero);
  }

  /* ---------- 光点 ---------- */
  function buildMotes() {
    if (motes.length || !hero) return;
    for (var i = 0; i < LAYERS; i++) {
      var s = document.createElement("span");
      s.className = "hero-mote";
      s.setAttribute("aria-hidden", "true");
      hero.appendChild(s);
      motes.push(s);
      gen.push(0);
    }
  }
  function destroyMotes() {
    for (var i = 0; i < motes.length; i++) {
      if (motes[i].parentNode) motes[i].parentNode.removeChild(motes[i]);
    }
    motes = [];
    gen = [];
  }
  function stopRounds() {
    clearTimeout(roundTimer);
    roundTimer = null;
  }
  function clearTimers() {
    for (var i = 0; i < timers.length; i++) clearTimeout(timers[i]);
    timers = [];
  }
  function clearMotes() {
    stopRounds();
    clearTimers();
    for (var i = 0; i < motes.length; i++) {
      gen[i]++;
      motes[i].classList.remove("is-on");
    }
  }
  function widthFor(shrink) {
    var w = Math.round((P.min + Math.random() * (P.max - P.min)) * P.scale * shrink);
    /* 窄屏收敛：只在手机级别的首屏上生效（<720px），桌面 1414 宽根本不进这段，
       所以桌面观感不受影响；390 的手机上不封顶会糊成一整片光墙 */
    var W = hero ? hero.offsetWidth : 0;
    if (W && W < 720) {
      var cap = Math.round(W * 0.42);
      if (w > cap) w = cap;
    }
    return w < 40 ? 40 : w;
  }
  /* 3×2 格位 + 抖动：同轮的点天然分散，不会挤在一坨 */
  function place(g, cell, shrink) {
    if (!hero) return;
    var w = widthFor(shrink);
    var W = hero.offsetWidth, H = hero.offsetHeight;
    var col = cell % 3, row = (cell / 3) | 0;
    var x = W * ((col + 0.5) / 3 + (Math.random() - 0.5) * 0.16);
    var y = H * ((row ? 0.38 : 0.13) + (Math.random() - 0.5) * 0.14);
    x = Math.max(w * 0.3, Math.min(W - w * 0.3, x));
    y = Math.max(-w * 0.12, Math.min(H * 0.55, y));
    g.style.width = w + "px";
    g.style.height = w + "px";
    g.style.left = Math.round(x - w / 2) + "px";
    g.style.top = Math.round(y - w / 2) + "px";
  }
  /* 代次令牌：轮次会重叠、元素会被复用，上一轮排好的熄灭回调不能关掉下一轮的灯 */
  function fire(i, cell, delay, shrink) {
    var my = ++gen[i], g = motes[i];
    timers.push(setTimeout(function () {
      if (!active || gen[i] !== my) return;
      place(g, cell, shrink);
      g.style.setProperty("--mote-peak", (P.peakMin + Math.random() * (P.peakMax - P.peakMin)).toFixed(2));
      var d = P.dur * (0.78 + Math.random() * 0.45);
      g.style.setProperty("--mote-dur", d.toFixed(2) + "s");
      g.classList.remove("is-on");
      void g.offsetWidth;               /* 强制重排，同一元素才能再播一次 */
      g.classList.add("is-on");
      timers.push(setTimeout(function () {
        if (gen[i] !== my) return;
        g.classList.remove("is-on");
      }, d * 1000 + 160));
    }, delay));
  }
  function schedule(delay) {
    clearTimeout(roundTimer);
    roundTimer = setTimeout(round, delay);
  }
  function round() {
    roundTimer = null;
    if (!active || !inView) return;
    if (!findHero()) return;
    if (!motes.length) buildMotes();   /* 内容重绘换掉了 .hero，光点要重新挂上去 */
    var n = Math.round(P.countMin + Math.random() * (P.countMax - P.countMin));
    if (n > LAYERS) n = LAYERS;
    if (n < 1) n = 1;
    var cells = [0, 1, 2, 3, 4, 5];
    for (var s = cells.length - 1; s > 0; s--) {
      var k = Math.floor(Math.random() * (s + 1));
      var t = cells[s]; cells[s] = cells[k]; cells[k] = t;
    }
    var shrink = P.shrink ? (n >= 4 ? 0.72 : n === 3 ? 0.86 : 1) : 1;
    var end = 0;
    for (var i = 0; i < n; i++) {
      var delay = Math.round(i * (140 + Math.random() * 220));
      fire(i, cells[i], delay, shrink);
      if (delay > end) end = delay;
    }
    /* 下一轮在最后一批点将熄未熄时就接上，屏上几乎一直有光 */
    schedule(end + P.dur * 900 + P.gapMin + Math.random() * (P.gapMax - P.gapMin));
  }

  function setGlow(mode) {
    if (mode !== "motes" && mode !== "off" && mode !== "css") mode = "css";
    /* 同模式重复下发是常态（每次内容热更新都会重放一遍），别重启轮次；
       但光点节点被内容重绘清掉时要重建，所以 motes 还要求节点还在。
       判据取 DOM 上真实的属性，reset() 改参数才不会漏掉收尾。 */
    var cur = body.getAttribute("data-glowmode") || "css";
    if (mode === cur && (mode !== "motes" || (active && motes.length))) {
      P.glow = mode;
      return;
    }
    P.glow = mode;
    if (mode === "css") {
      active = false;
      body.removeAttribute("data-glowmode");
      clearMotes();
      destroyMotes();
      return;
    }
    body.setAttribute("data-glowmode", mode);
    if (mode === "off") {
      active = false;
      clearMotes();
      destroyMotes();
      return;
    }
    /* reduced-motion 下不点灯：只在 CSS 里留一层静态弱光，不动画 */
    if (reduce()) {
      active = false;
      clearMotes();
      return;
    }
    if (!findHero()) { retryMotes(); return; }   /* 首屏还没渲染，稍后再来 */
    buildMotes();
    active = true;
    schedule(360);
  }

  /* 首屏是 render.js 渲染出来的，可能比本文件晚；重试有上限，别无限轮询 */
  var tries = 0;
  function retryMotes() {
    if (active || P.glow !== "motes" || tries++ > 40) return;
    setTimeout(function () {
      if (active || P.glow !== "motes") return;
      if (!findHero()) { retryMotes(); return; }
      buildMotes();
      active = true;
      schedule(400);
    }, 250);
  }

  /* ---------- 点阵参数转发（不接管，只递话） ---------- */
  /* 记一份自己发出去的参数：hero-dots.js 的 stats() 只报它自己想报的几项，
     手机 demo 那边报得更全，两边对齐的工作放在门面上做，不去动点阵文件 */
  var dotState = {};
  function forwardDots(o) {
    var api = window.HeroDots;
    if (!api || !api.set) return false;
    var out = {}, any = false, k;
    var passthrough = ["morph", "tone", "step", "scale", "lo", "hi"];
    for (var i = 0; i < passthrough.length; i++) {
      k = passthrough[i];
      if (o[k] !== undefined) { out[k] = o[k]; dotState[k] = o[k]; any = true; }
    }
    /* 两个口头协议：alpha / speed 桌面用百分数，手机用小数 */
    if (o.alpha !== undefined) { out.alpha = unit(o.alpha, 0.36, 0.05, 0.95) * 100; dotState.alpha = out.alpha; any = true; }
    if (o.speed !== undefined) { out.speed = unit(o.speed, 0.55, 0, 2) * 100; dotState.speed = out.speed; any = true; }
    if (o.on !== undefined || o.fx !== undefined) {
      out.on = !(isOff(o.on) || isOff(o.fx));
      dotState.on = out.on;
      any = true;
    }
    if (any) api.set(out);
    return any;
  }

  /* ---------- 门面 ---------- */
  function set(o) {
    o = o || {};

    forwardDots(o);

    if (o.glow !== undefined) setGlow(o.glow);
    /* 尺寸与亮度都允许两种写法：50 / .5、62 / .62 —— 控制台存的是百分数 */
    if (o.glowScale !== undefined) P.scale = unit(o.glowScale, P.scale, 0.08, 2);
    if (o.glowMin !== undefined) P.min = num(o.glowMin, P.min, 40, 1200);
    if (o.glowMax !== undefined) P.max = num(o.glowMax, P.max, 60, 1600);
    if (P.max < P.min) P.max = P.min + 20;
    if (o.countMin !== undefined) P.countMin = Math.round(num(o.countMin, P.countMin, 1, LAYERS));
    if (o.countMax !== undefined) P.countMax = Math.round(num(o.countMax, P.countMax, 1, LAYERS));
    if (P.countMax < P.countMin) P.countMax = P.countMin;
    if (o.peakMin !== undefined) P.peakMin = unit(o.peakMin, P.peakMin, 0.04, 1);
    if (o.peakMax !== undefined) P.peakMax = unit(o.peakMax, P.peakMax, 0.05, 1);
    if (P.peakMax < P.peakMin) P.peakMax = P.peakMin + 0.04;
    if (o.glowDur !== undefined) P.dur = num(o.glowDur, P.dur, 0.5, 14);
    if (o.gapMin !== undefined) P.gapMin = num(o.gapMin, P.gapMin, 0, 60000);
    if (o.gapMax !== undefined) P.gapMax = num(o.gapMax, P.gapMax, 0, 60000);
    if (P.gapMax < P.gapMin) P.gapMax = P.gapMin + 100;
    if (o.shrink !== undefined) P.shrink = !isOff(o.shrink);

    /* 桌面那套 CSS 呼吸变量也接住；手机端没有这两层，忽略即可 */
    if (o.breatheDur !== undefined) root.style.setProperty("--breathe-dur", num(o.breatheDur, 6, 1.5, 24).toFixed(2) + "s");
    if (o.breatheHi !== undefined) root.style.setProperty("--breathe-hi", num(o.breatheHi, 0.72, 0.02, 1).toFixed(3));
    if (o.breatheLo !== undefined) root.style.setProperty("--breathe-lo", num(o.breatheLo, 0.2, 0, 1).toFixed(3));
    if (o.glowSize !== undefined) root.style.setProperty("--glow-size", num(o.glowSize, 1.1, 0.5, 2.2).toFixed(2));

    return stats();
  }

  function stats() {
    var raw = (window.HeroDots && window.HeroDots.stats) ? window.HeroDots.stats() : {};
    /* 与手机 demo 报同一套字段：那边 stats().dots 更全，缺的用自己记的补上，
       并且 pts / points 两个名字都给，省得脚本两边写分支 */
    var dots = {
      morph: dotState.morph !== undefined ? dotState.morph : raw.morph,
      tone: dotState.tone,
      step: dotState.step !== undefined ? dotState.step : raw.step,
      alpha: dotState.alpha,
      speed: dotState.speed,
      scale: dotState.scale,
      lo: dotState.lo,
      hi: dotState.hi,
      dpr: raw.dpr,
      pts: raw.pts,
      points: raw.pts
    };
    var s = {
      page: "desktop",
      /* 两个旧的短名，手机端一直有；这里补上，命令行才能同一段逻辑跑两边 */
      morph: dots.morph,
      fx: P.glow !== "off",
      dots: dots,
      glow: {
        mode: P.glow,
        scale: P.scale,
        min: P.min,
        max: P.max,
        px: "~" + Math.round(((P.min + P.max) / 2) * P.scale) + "px",
        count: P.countMin + "–" + P.countMax,
        peak: P.peakMin + "–" + P.peakMax,
        dur: P.dur + "s",
        gap: P.gapMin + "–" + P.gapMax + "ms",
        nodes: motes.length
      },
      supported: ["morph", "tone", "step", "alpha", "speed", "scale", "lo", "hi",
        "on", "fx", "glow", "motes", "cssGlow", "breatheVars"]
    };
    return s;
  }

  function pulse() {
    if (P.glow === "css") return "css 模式：光斑常驻呼吸，不需要 pulse";
    if (P.glow === "off") return "off 模式：氛围已关";
    if (!active) return "motes 未启用";
    stopRounds();
    round();
    return "ok";
  }

  function reset() {
    for (var k in DEFAULTS) if (DEFAULTS.hasOwnProperty(k)) P[k] = DEFAULTS[k];
    setGlow("css");
    return stats();
  }

  window.HeroFx = {
    set: set,
    apply: set,          /* 与 hero-dots.js 的老命名对齐，脚本可以两边通用 */
    stats: stats,
    pulse: pulse,
    reset: reset,
    /* 桌面点阵的旧入口，在这个门面上也能用（转发给 hero-dots.js） */
    toggle: function (on) { return set({ on: on }); }
  };

  /* ------------------------------------------------------------------
     自举：render.js 的第一轮 applyAtmosphere 可能早于本文件执行
     （脚本按顺序跑，内容渲染却在 render.js 里同步发生了），
     所以自己从内容里读一次初始值——和 hero-dots.js 的做法一致。
     之后的热更新交给 render.js → applyAtmosphere → HeroFx.set()。
     ------------------------------------------------------------------ */
  function bootstrap() {
    var a = null, d = null;
    try { a = window.V2_CONTENT.pages.home.atmosphere; } catch (e) { a = null; }
    try { d = window.V2_CONTENT.pages.home.sections.hero.dots; } catch (e) { d = null; }
    if (!a) return;                      /* 缺内容或不是首页，保持默认 css */
    /* 点阵的实际值由 render.js 直接推给 hero-dots.js（不经过这里），
       但 stats() 要报得全，所以先把内容里的那组参数记下来 */
    if (d) {
      if (d.morph !== undefined) dotState.morph = d.morph;
      if (d.tone !== undefined) dotState.tone = d.tone;
      if (d.step !== undefined) dotState.step = d.step;
      if (d.alpha !== undefined) dotState.alpha = parseFloat(d.alpha);
      if (d.speed !== undefined) dotState.speed = parseFloat(d.speed);
      if (d.scale !== undefined) dotState.scale = d.scale;
      if (d.on !== undefined) dotState.on = !isOff(d.on);
    }
    set({
      glow: a.glow || "css",
      glowScale: num(a.moteSize, 90, 10, 200) / 100,
      countMin: num(a.moteCountMin, 1, 1, LAYERS),
      countMax: num(a.moteCountMax, 5, 1, LAYERS),
      peakMin: num(a.motePeakLo, 22, 4, 100) / 100,
      peakMax: num(a.motePeakHi, 68, 5, 100) / 100,
      glowDur: num(a.moteDur, 3.2, 0.5, 14),
      gapMin: num(a.moteGapMin, 900, 0, 20000),
      gapMax: num(a.moteGapMax, 2600, 0, 20000)
    });
  }

  findHero();
  bootstrap();
})();
