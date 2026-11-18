/* ============================================================
   TOPO-CONSOLE.JS — 控制台「资源库」页的「页头地形动效」面板

   面板挂在左侧编辑区 #formpane 的最前面，调参数时右边的预览就在同一屏，
   不用再开一个右侧抽屉把它挡住。

   为什么单独一个文件、不并进 studio.js：
   studio.js 管着全站文案的增删改查与发布；动效参数是另一套东西
   （存 localStorage、不下发到 content.js），塞进去只会让两边都难维护。

   参数落点：localStorage['v2:topo']，键名与 topo-embed.js / topo-scene.html 一致。
   写完之后：
     · 本页预览 iframe  → postMessage('topo:set')
     · 别的标签页       → 浏览器自动派发 storage 事件

   挂载时机：只在该页预览正显示「资源库」（links.html）时出现。
   studio 每次切分组都会把 #formpane 的 innerHTML 清空重画，所以我们
   用 MutationObserver 盯着它，发现卡片不在就重新插回最前面。
   ============================================================ */
(function () {
  "use strict";

  var KEY = "v2:topo";
  /* 草稿 / 已发布两份参数的读写全交给 topo-store.js。
     这个面板只做一件事：把用户拖出来的值写进草稿，再推给预览。
     发布是把草稿变成「已发布值」，那一步在 studio.js 的 publish() 里。 */
  var STORE = window.TopoStore || null;

  /* 默认值统一放在 topo-defaults.js：页面、引擎、控制台三边共用一份。
     万一那个文件没加载到，这里给一份最小兜底，保证面板不会崩。 */
  var DEFAULTS = window.TOPO_DEFAULTS || {
    preset: "original", levels: 7, amp: 0.68, speed: 0.34, orbit: 0.36,
    pitchDeg: 32, dist: 14.5, dof: 0.55, bloom: 0.20, cyanPct: 7, fontSize: 10,
    boxW: 520, boxH: 325, dx: 0, dy: 0,
    labels: ["最新动态", "比赛", "练习", "信息库"],
    contours: true, voxels: true, dust: true, frame: true,
    autorotate: true, postfx: true, autoBeatCut: true, ripple: true, rippleHz: 3.8
  };

  /* 打开面板时该显示哪一版：有草稿显示草稿（哪怕它落后），
     没草稿就显示线上已发布值 —— 不做"静默丢掉草稿"这种事。 */
  function read() {
    if (STORE) {
      var d = STORE.draft();
      if (d) return d.params;
      return STORE.published().params;
    }
    var out = {};
    var k;
    for (k in DEFAULTS) {
      if (Object.prototype.hasOwnProperty.call(DEFAULTS, k)) out[k] = DEFAULTS[k];
    }
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) {
        var saved = JSON.parse(raw);
        for (k in saved) {
          if (Object.prototype.hasOwnProperty.call(saved, k) && saved[k] !== null && saved[k] !== undefined) {
            out[k] = saved[k];
          }
        }
      }
    } catch (e) {}
    return out;
  }

  function write(p) {
    if (STORE) { STORE.saveDraft(p); return; }
    try {
      localStorage.setItem(KEY, JSON.stringify(p));
    } catch (e) {}
  }

  function publishedVersion() {
    return STORE ? STORE.published().version : 0;
  }

  function broadcast(p) {
    var frame = document.getElementById("preview");
    if (frame && frame.contentWindow) {
      try {
        frame.contentWindow.postMessage({ type: "topo:set", params: p }, "*");
      } catch (e) {}
    }
  }

  /* 手动切一次节拍相位。消息先到 links.html（topo-embed.js），
     再由它转给内层 topo-scene.html —— 控制台够不到孙级 iframe。 */
  function beat() {
    var frame = document.getElementById("preview");
    if (frame && frame.contentWindow) {
      try {
        frame.contentWindow.postMessage({ type: "topo:beat" }, "*");
      } catch (e) {}
    }
  }

  /* ---------------- 参数表 ---------------- */

  /* 画面区域：这块画布在页头里占多大、摆在哪儿。
     这几个值不进引擎（引擎只认下面那组渲染参数），由 topo-embed.js
     翻译成页头的 CSS 变量：--topo-w / --topo-h / --topo-dx / --topo-dy。 */
  var GEOM = [
    { k: "boxW", label: "区域宽度", min: 280, max: 760, step: 4, unit: "px" },
    { k: "boxH", label: "区域高度", min: 160, max: 560, step: 4, unit: "px" },
    { k: "dx", label: "水平位置", min: -240, max: 320, step: 4, unit: "px", hint: "正数向右、负数向左" },
    { k: "dy", label: "垂直位置", min: -260, max: 260, step: 4, unit: "px", hint: "正数向下、负数向上" }
  ];

  var SLIDERS = [
    { k: "levels", label: "等高线层数", min: 4, max: 14, step: 1, unit: "层" },
    { k: "amp", label: "地形起伏度", min: 0.2, max: 1.6, step: 0.02, unit: "x" },
    { k: "speed", label: "噪声演化速率", min: 0, max: 1.2, step: 0.02 },
    { k: "orbit", label: "镜头环绕速度", min: 0, max: 1.2, step: 0.02, unit: "rad/s" },
    { k: "pitchDeg", label: "相机俯角", min: 16, max: 62, step: 1, unit: "°" },
    { k: "dist", label: "相机距离", min: 8, max: 30, step: 0.5, unit: "越小越近" },
    { k: "dof", label: "景深散景", min: 0, max: 1.6, step: 0.05 },
    { k: "bloom", label: "辉光强度", min: 0, max: 1.6, step: 0.02 },
    { k: "cyanPct", label: "青色信号点占比", min: 0, max: 30, step: 1, unit: "%" },
    { k: "fontSize", label: "标签字号", min: 9, max: 18, step: 1, unit: "px" }
  ];

  var SWITCHES = [
    { k: "contours", label: "等高线" },
    { k: "voxels", label: "粒子柱" },
    { k: "dust", label: "浮尘" },
    { k: "frame", label: "边界框" },
    { k: "autorotate", label: "自动旋转" },
    { k: "postfx", label: "全屏光学" },
    { k: "autoBeatCut", label: "自动节拍跳切" },
    { k: "ripple", label: "悬停波纹扰动" }
  ];

  /* 波纹频段：和引擎面板里那三个 chip 同一组值（1.6 / 3.8 / 8.8 Hz），
     手感记忆点在于"低频厚重、高频细密"，给快捷键比只给滑杆好调。 */
  var RIPPLE_PRESETS = [
    { name: "1.6", hz: 1.6, label: "低频 1.6" },
    { name: "3.8", hz: 3.8, label: "中频 3.8" },
    { name: "8.8", hz: 8.8, label: "高频 8.8" }
  ];

  var BOX_PRESETS = [
    { name: "紧凑", w: 380, h: 238 },
    { name: "标准", w: 520, h: 325 },
    { name: "宽幅", w: 660, h: 330 },
    { name: "通栏", w: 760, h: 300 }
  ];

  var PRESETS = [
    { name: "original", label: "红金" },
    { name: "quant", label: "青色" },
    { name: "mono", label: "单色" }
  ];

  /* ---------------- 样式 ----------------
     全部用 studio 的 CSS 变量，跟随控制台的明/暗主题。
     控件尽量复用 studio 自己的类（.field / .numrow / .inp / .tbtn），
     只补几处它没有的：卡片壳、chip、开关网格。 */
  var CSS = [
    ".tp-card{margin:0 0 var(--space-16);padding:var(--space-12) var(--space-12) var(--space-8);",
    "border:1px solid var(--border);border-radius:var(--radius-8);background:var(--surface-1);",
    "transition:box-shadow .2s ease,border-color .2s ease}",
    ".tp-card.is-flash{border-color:var(--accent);box-shadow:0 0 0 2px color-mix(in srgb,var(--accent) 40%,transparent)}",
    ".tp-card__head{display:flex;align-items:center;gap:var(--space-8);margin-bottom:2px}",
    ".tp-card__title{font-size:var(--text-sm);font-weight:600;color:var(--text-1)}",
    ".tp-card__badge{font-family:var(--font-mono);font-size:10px;padding:1px 6px;border-radius:999px;",
    "border:1px solid var(--border-strong);color:var(--text-3);white-space:nowrap}",
    ".tp-card__state{margin-left:auto;font-size:10px;color:var(--text-3);font-family:var(--font-mono)}",
    ".tp-card__desc{font-size:var(--text-xs);line-height:1.6;color:var(--text-3);margin:2px 0 var(--space-8)}",
    ".tp-note{font-size:var(--text-xs);line-height:1.6;color:var(--warn);margin:0 0 var(--space-8)}",
    ".tp-sec{margin-top:var(--space-12);padding-top:var(--space-12);border-top:1px solid var(--border)}",
    ".tp-sec:first-of-type{border-top:0;padding-top:0;margin-top:0}",
    ".tp-sec__title{font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--text-3);margin-bottom:var(--space-8)}",
    ".tp-fold{margin-top:var(--space-12);padding-top:var(--space-12);border-top:1px solid var(--border)}",
    ".tp-fold>summary{cursor:pointer;list-style:none;font-size:10px;letter-spacing:.08em;text-transform:uppercase;",
    "color:var(--text-3);margin-bottom:var(--space-8);user-select:none}",
    ".tp-fold>summary::-webkit-details-marker{display:none}",
    ".tp-fold>summary::before{content:'\\25B8';display:inline-block;width:12px;transition:transform .15s ease}",
    ".tp-fold[open]>summary::before{transform:rotate(90deg)}",
    ".tp-fold>summary:hover{color:var(--text-2)}",
    ".tp-sec .field{margin-bottom:var(--space-8)}",
    ".tp-chips{display:flex;flex-wrap:wrap;gap:6px}",
    ".tp-chip{padding:3px 9px;border-radius:999px;border:1px solid var(--border-strong);background:transparent;",
    "color:var(--text-2);font-size:var(--text-xs);cursor:pointer;line-height:1.6;transition:.15s}",
    ".tp-chip:hover{color:var(--text-1);border-color:var(--text-3)}",
    ".tp-chip.is-on{background:var(--accent);border-color:var(--accent);color:var(--on-accent)}",
    ".tp-swgrid{display:grid;grid-template-columns:1fr 1fr;gap:4px var(--space-12)}",
    ".tp-sw{display:flex;align-items:center;gap:6px;",
    "font-size:var(--text-xs);color:var(--text-2);cursor:pointer;padding:2px 0}",
    ".tp-sw input{width:14px;height:14px;flex:none;accent-color:var(--accent);cursor:pointer;margin:0}",
    /* 波纹频率那一块：悬停波纹关掉时整块降到 45% 并禁掉交互，
       免得以为"调了没反应" */
    ".tp-sec.is-off{opacity:.45}",
    ".tp-sec.is-off .rng,.tp-sec.is-off .numin,.tp-sec.is-off .tp-chip,.tp-sec.is-off .tbtn{pointer-events:none}",
    ".tp-hzrow{display:flex;align-items:center;gap:var(--space-8);margin-top:var(--space-8)}",
    ".tp-hzrow .tbtn{flex:none}",
    ".tp-hint{font-size:10px;line-height:1.5;color:var(--text-3);min-width:0}",
    ".tp-hist{display:flex;align-items:center;gap:var(--space-8);padding:3px 0;",
    "font-size:var(--text-xs);color:var(--text-3)}",
    ".tp-hist b{color:var(--text-1);font-weight:600;font-family:var(--font-mono);flex:none}",
    ".tp-hist__meta{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
    ".tp-hist .tbtn{margin-left:auto;flex:none}",
    ".tp-tagrow{display:flex;gap:6px;margin-bottom:6px}",
    ".tp-tagrow .inp{flex:1;min-width:0}",
    ".tp-del{flex:none;width:26px;border-radius:var(--radius-4);background:transparent;border:1px solid var(--border-strong);",
    "color:var(--text-3);cursor:pointer;line-height:1}",
    ".tp-del:hover{color:var(--warn);border-color:var(--warn)}",
    ".tp-del:disabled{opacity:.35;cursor:not-allowed}",
    ".tp-foot{display:flex;gap:6px;margin-top:var(--space-12)}",
    ".tp-foot .tbtn{flex:1}",
    /* 不是资源库页时露出的一行入口。控制台顶栏在 <1440px 会把页面 tab 挤掉，
       鼠标点不到「资源库」，所以入口不能再依赖那个 tab —— 这里用程序化 click。 */
    ".tp-teaser{display:flex;flex-wrap:wrap;align-items:center;gap:var(--space-8);margin:0 0 var(--space-16);",
    "padding:var(--space-8) var(--space-12);border:1px solid var(--border);border-radius:var(--radius-8);",
    "background:var(--surface-1);font-size:var(--text-xs);line-height:1.5;color:var(--text-3)}",
    ".tp-teaser__txt{min-width:0;display:flex;flex-direction:column}",
    ".tp-teaser b{display:block;color:var(--text-1);font-weight:600;font-size:var(--text-sm)}",
    ".tp-teaser span{display:block}",
    ".tp-teaser__go{flex:none;margin-left:auto}"
  ].join("");

  var state = read();
  var card = null;
  var refs = {};
  var paneSeen = null;

  function commit(immediate) {
    write(state);
    broadcast(state);
    if (immediate !== false) flash();
  }

  var flashTimer = null;
  function flash(text) {
    var dot = refs.state;
    if (!dot) return;
    dot.textContent = text || "草稿已存";
    dot.style.color = "var(--accent)";
    clearTimeout(flashTimer);
    flashTimer = setTimeout(syncStateLabel, 1200);
  }

  /* ---------------- 控件 ---------------- */

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  /* 和 studio 的数值字段同款：左边滑块找手感，右边数字框精确落值 */
  function numberField(parent, spec) {
    var wrap = el("div", "field");
    var lab = el("label", "", spec.label + (spec.unit ? "（" + spec.unit + "）" : ""));
    var row = el("div", "numrow");

    var rng = document.createElement("input");
    rng.type = "range";
    rng.className = "rng";
    rng.min = spec.min;
    rng.max = spec.max;
    rng.step = spec.step;

    var num = document.createElement("input");
    num.type = "number";
    num.className = "inp numin";
    num.min = spec.min;
    num.max = spec.max;
    num.step = spec.step;

    function paint(v) {
      rng.value = v;
      num.value = Math.round(v * 1000) / 1000;
    }

    function take(v, type) {
      if (!isFinite(v)) return;
      v = Math.min(Math.max(v, spec.min), spec.max);
      state[spec.k] = v;
      rng.value = v;
      if (type !== "range") num.value = Math.round(v * 1000) / 1000;
      commit(type === "number");
    }

    rng.addEventListener("input", function () { take(parseFloat(rng.value), "range"); });
    rng.addEventListener("change", function () { commit(); });
    num.addEventListener("input", function () { take(parseFloat(num.value), "number"); });
    num.addEventListener("change", function () {
      take(parseFloat(num.value), "number");
      paint(state[spec.k]);
      commit();
    });

    row.appendChild(rng);
    row.appendChild(num);
    wrap.appendChild(lab);
    wrap.appendChild(row);
    if (spec.hint) wrap.appendChild(el("div", "field__hint", spec.hint));
    parent.appendChild(wrap);
    refs[spec.k] = { rng: rng, num: num, paint: paint, spec: spec };
    return wrap;
  }

  function switchRow(parent, spec) {
    var lab = el("label", "tp-sw");
    var box = document.createElement("input");
    box.type = "checkbox";
    box.checked = !!state[spec.k];
    box.addEventListener("change", function () {
      state[spec.k] = box.checked;
      if (spec.k === "ripple") paintRipple();
      commit();
    });
    // 复选框在前、文字在后：两列并排时"框 → 字"的顺序才好扫读
    lab.appendChild(box);
    lab.appendChild(el("span", "", spec.label));
    parent.appendChild(lab);
    refs[spec.k] = { box: box };
    return lab;
  }

  function chipRow(parent, list, key, onPick) {
    var box = el("div", "tp-chips");
    list.forEach(function (item) {
      var b = el("button", "tp-chip", item.label || item.name);
      b.type = "button";
      b.dataset[key] = item.name || item.label;
      if (item.title) b.title = item.title;
      b.addEventListener("click", function () { onPick(item); });
      box.appendChild(b);
    });
    parent.appendChild(box);
    return box;
  }

  /* ---------------- 面板 ---------------- */

  /* 样式只注入一次。入口条（teaser）也要用到，所以单独拎出来，
     不能只在 build() 里注入 —— 那样停在别的页时入口条是没有样式的。 */
  function ensureStyle() {
    if (document.getElementById("tp-style")) return;
    var style = document.createElement("style");
    style.id = "tp-style";
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  function build() {
    if (card) return card;

    ensureStyle();

    card = el("section", "tp-card");
    card.id = "tp-card";
    card.setAttribute("aria-label", "页头地形动效参数");

    /* 头 */
    var head = el("div", "tp-card__head");
    head.appendChild(el("span", "tp-card__title", "页头地形动效"));
    head.appendChild(el("span", "tp-card__badge", "桌面端 ≥1080"));
    refs.state = el("span", "tp-card__state", "已同步");
    head.appendChild(refs.state);
    card.appendChild(head);
    card.appendChild(el("p", "tp-card__desc",
      "改这里只改「草稿」，右边预览实时跟着变，线上访客不受影响；点「发布改动」才对所有人生效。"));
    refs.note = el("p", "tp-note", "预览当前是手机 / 平板尺寸，动效只在 ≥1080px 出现 —— 切回「桌面」才看得到。");
    refs.note.hidden = true;
    card.appendChild(refs.note);
    /* 草稿落后于线上时（另一台设备/另一个标签页发布过），要明确说出来：
       否则面板里显示的是旧草稿，会被误当成"线上就长这样"。 */
    refs.stale = el("p", "tp-note", "草稿是基于旧版本调的，期间线上已发布过新版本 —— 发布前先「载入线上值」看一眼差异。");
    refs.stale.hidden = true;
    card.appendChild(refs.stale);

    /* 画面区域 */
    var secBox = el("div", "tp-sec");
    secBox.appendChild(el("div", "tp-sec__title", "画面区域 · 位置与大小"));
    refs.boxChips = chipRow(secBox, BOX_PRESETS, "box", function (pre) {
      state.boxW = pre.w;
      state.boxH = pre.h;
      paintGeom();
      commit();
    });
    GEOM.forEach(function (s) { numberField(secBox, s); });
    card.appendChild(secBox);

    /* 配色 */
    var secColor = el("div", "tp-sec");
    secColor.appendChild(el("div", "tp-sec__title", "配色"));
    refs.presetChips = chipRow(secColor, PRESETS, "preset", function (pre) {
      state.preset = pre.name;
      syncPresetChips();
      commit();
    });
    card.appendChild(secColor);

    /* 渲染参数：10 个滑杆，折叠起来。上面那两块（区域 / 配色）才是
       调位置时最常动的，让它们留在第一屏，不用一边滚一边看预览。 */
    var det = document.createElement("details");
    det.className = "tp-fold";
    var sum = document.createElement("summary");
    sum.textContent = "渲染参数 · 10 项（相机 / 等高线 / 光学）";
    det.appendChild(sum);
    SLIDERS.forEach(function (s) { numberField(det, s); });
    card.appendChild(det);

    /* 图层开关 */
    var secSw = el("div", "tp-sec");
    secSw.appendChild(el("div", "tp-sec__title", "图层与效果"));
    var grid = el("div", "tp-swgrid");
    SWITCHES.forEach(function (s) { switchRow(grid, s); });
    secSw.appendChild(grid);
    card.appendChild(secSw);

    /* 波纹与节拍：频率 + 频段快捷键 + 手动切一次相位。
       这三样在原 demo 的引擎面板里就有（chk-ripple / slider-ripple-freq /
       btn-beat-jump），第一版搬进控制台时只带了开关，频率和跳切丢了。 */
    var secWave = el("div", "tp-sec");
    refs.waveSec = secWave;
    secWave.appendChild(el("div", "tp-sec__title", "波纹与节拍"));
    numberField(secWave, { k: "rippleHz", label: "波纹频率", min: 1, max: 12, step: 0.2, unit: "Hz" });
    refs.hzChips = chipRow(secWave, RIPPLE_PRESETS, "hz", function (item) {
      state.rippleHz = item.hz;
      paintRipple();
      commit();
    });
    var beatRow = el("div", "tp-hzrow");
    var beatBtn = el("button", "tbtn tbtn--sm", "脉冲跳切 CUT");
    beatBtn.type = "button";
    beatBtn.title = "立刻做一次节拍相位硬切（原视频 0:21 那下）";
    beatBtn.addEventListener("click", function () {
      beat();
      flash("切了一下");
    });
    beatRow.appendChild(beatBtn);
    beatRow.appendChild(el("div", "tp-hint", "相位瞬移 + 闪一下；「自动节拍跳切」关掉后仍可手动点"));
    secWave.appendChild(beatRow);
    card.appendChild(secWave);

    /* 标签 */
    var secTag = el("div", "tp-sec");
    var tagTitle = el("div", "tp-sec__title", "页头标签 · 随机分配给波峰");
    secTag.appendChild(tagTitle);
    refs.tagList = el("div");
    secTag.appendChild(refs.tagList);

    var addRow = el("div", "tp-tagrow");
    var addInput = document.createElement("input");
    addInput.className = "inp";
    addInput.placeholder = "输入新标签…";
    addInput.maxLength = 12;
    var addBtn = el("button", "tbtn tbtn--sm", "新增");
    addBtn.type = "button";
    addBtn.addEventListener("click", function () {
      var v = addInput.value.trim();
      if (!v) return;
      if (state.labels.indexOf(v) < 0) state.labels.push(v);
      addInput.value = "";
      renderTags();
      commit();
    });
    addRow.appendChild(addInput);
    addRow.appendChild(addBtn);
    secTag.appendChild(addRow);
    card.appendChild(secTag);

    /* 版本历史：参数级回滚。只列 topo.js 里带过来的快照（最多 8 条），
       点「用这版」是把它回填成草稿 —— 仍然要点发布才上线，
       不做"悄悄覆盖线上"这种事。 */
    refs.histFold = document.createElement("details");
    refs.histFold.className = "tp-fold";
    var histSum = document.createElement("summary");
    histSum.textContent = "历史版本 · 回滚到已发布过的某一版";
    refs.histFold.appendChild(histSum);
    refs.histList = el("div");
    refs.histFold.appendChild(refs.histList);
    card.appendChild(refs.histFold);

    /* 底：发布是唯一"对所有人生效"的动作，所以单独占一行、用主按钮。
       下面一行是三个本地操作（恢复默认 / 载入线上值 / 新窗口）。 */
    var pubRow = el("div", "tp-foot");
    refs.pubBtn = el("button", "tbtn tbtn--sm tbtn--primary", "发布改动");
    refs.pubBtn.type = "button";
    refs.pubBtn.title = "把草稿写成新的已发布版本（会打开发布面板，需要 Token）";
    refs.pubBtn.addEventListener("click", function () {
      var b = document.getElementById("publish");
      if (b) { b.click(); return; }
      flash("找不到发布入口");
    });
    pubRow.appendChild(refs.pubBtn);
    card.appendChild(pubRow);

    var foot = el("div", "tp-foot");
    var reset = el("button", "tbtn tbtn--sm", "恢复默认");
    reset.type = "button";
    reset.addEventListener("click", function () {
      state = readDefaults();
      applyToUI();
      commit();
    });
    refs.loadPub = el("button", "tbtn tbtn--sm", "载入线上值");
    refs.loadPub.type = "button";
    refs.loadPub.title = "丢掉本机草稿，回到线上正在生效的那一版";
    refs.loadPub.addEventListener("click", function () {
      if (STORE) STORE.discardDraft();
      state = STORE ? STORE.published().params : readDefaults();
      applyToUI();
      commit();
      flash("已回到线上值");
    });
    var view = el("button", "tbtn tbtn--sm", "新窗口看整页");
    view.type = "button";
    view.addEventListener("click", function () {
      window.open("links.html", "_blank");
    });
    foot.appendChild(reset);
    foot.appendChild(refs.loadPub);
    foot.appendChild(view);
    card.appendChild(foot);

    applyToUI();
    return card;
  }

  function readDefaults() {
    var out = {};
    for (var k in DEFAULTS) {
      if (Object.prototype.hasOwnProperty.call(DEFAULTS, k)) {
        out[k] = Array.isArray(DEFAULTS[k]) ? DEFAULTS[k].slice() : DEFAULTS[k];
      }
    }
    return out;
  }

  function paintGeom() {
    GEOM.forEach(function (s) {
      var r = refs[s.k];
      if (r) r.paint(state[s.k]);
    });
    if (refs.boxChips) {
      var list = refs.boxChips.querySelectorAll(".tp-chip[data-box]");
      for (var i = 0; i < list.length; i++) {
        var pre = BOX_PRESETS.filter(function (p) { return p.name === list[i].dataset.box; })[0];
        list[i].classList.toggle("is-on", !!pre && pre.w === Math.round(state.boxW) && pre.h === Math.round(state.boxH));
      }
    }
  }

  function applyToUI() {
    GEOM.forEach(function (s) {
      var r = refs[s.k];
      if (r) r.paint(state[s.k]);
    });
    SLIDERS.forEach(function (s) {
      var r = refs[s.k];
      if (r) r.paint(state[s.k]);
    });
    SWITCHES.forEach(function (s) {
      var r = refs[s.k];
      if (r && r.box) r.box.checked = !!state[s.k];
    });
    syncPresetChips();
    if (refs.boxChips) {
      var list = refs.boxChips.querySelectorAll(".tp-chip[data-box]");
      for (var i = 0; i < list.length; i++) {
        var pre = BOX_PRESETS.filter(function (p) { return p.name === list[i].dataset.box; })[0];
        list[i].classList.toggle("is-on", !!pre && pre.w === Math.round(state.boxW) && pre.h === Math.round(state.boxH));
      }
    }
    renderTags();
    paintRipple();
    renderHistory();
    syncStateLabel();
  }

  /* 面板右上角那行小字 + 草稿相关的按钮状态。
     四种状态：已同步 / 有草稿 / 草稿落后 / 无 store（降级）。 */
  function syncStateLabel() {
    var v = publishedVersion();
    var d = STORE ? STORE.draft() : null;
    var dirty = STORE ? STORE.isDirty() : false;
    var txt;
    var color = "";
    if (d && d.stale) {
      txt = "草稿基于 v" + d.base + " · 线上 v" + v;
      color = "var(--warn)";
    } else if (dirty) {
      txt = "草稿 · 线上 v" + v;
      color = "var(--warn)";
    } else {
      txt = "已同步 · v" + v;
    }
    if (refs.state) {
      refs.state.textContent = txt;
      refs.state.style.color = color;
    }
    if (refs.stale) refs.stale.hidden = !(d && d.stale);
    if (refs.pubBtn) {
      refs.pubBtn.disabled = !dirty;
      refs.pubBtn.title = dirty
        ? "把草稿写成新的已发布版本（会打开发布面板，需要 Token）"
        : "草稿与线上一致，没有要发布的改动";
    }
    if (refs.loadPub) refs.loadPub.hidden = !d;
  }

  function renderHistory() {
    var box = refs.histList;
    if (!box) return;
    var list = STORE ? STORE.history() : [];
    if (refs.histFold) refs.histFold.hidden = !list.length;
    box.innerHTML = "";
    list.forEach(function (h) {
      var row = el("div", "tp-hist");
      row.appendChild(el("b", "", "v" + h.version));
      row.appendChild(el("span", "tp-hist__meta", h.updatedAt || ""));
      var b = el("button", "tbtn tbtn--sm", "用这版");
      b.type = "button";
      b.addEventListener("click", function () {
        state = STORE ? STORE.normalize(h.params, STORE.published().params) : h.params;
        applyToUI();
        commit();
        flash("已回填 v" + h.version);
      });
      row.appendChild(b);
      box.appendChild(row);
    });
  }

  /* 波纹频率的滑杆数值 + 三个频段的选中态 + 悬停波纹关掉时整块降级。
     一个函数管三件事，是因为它们总是同时变：改频率要刷 chip，
     开关一拨要连"这块还能不能调"一起变。 */
  function paintRipple() {
    var r = refs.rippleHz;
    if (r) r.paint(state.rippleHz);
    if (refs.hzChips) {
      var list = refs.hzChips.querySelectorAll(".tp-chip[data-hz]");
      for (var i = 0; i < list.length; i++) {
        var hz = parseFloat(list[i].dataset.hz);
        list[i].classList.toggle("is-on", Math.abs(hz - state.rippleHz) < 0.05);
      }
    }
    if (refs.waveSec) refs.waveSec.classList.toggle("is-off", !state.ripple);
  }

  function syncPresetChips() {
    if (!refs.presetChips) return;
    var list = refs.presetChips.querySelectorAll(".tp-chip[data-preset]");
    for (var i = 0; i < list.length; i++) {
      list[i].classList.toggle("is-on", list[i].dataset.preset === state.preset);
    }
  }

  function renderTags() {
    var box = refs.tagList;
    if (!box) return;
    // 正在某个标签输入框里打字时别把它刷掉（顶部夹取回调会触发这里）
    var ae = document.activeElement;
    if (ae && ae.tagName === "INPUT" && box.contains(ae)) return;
    box.innerHTML = "";
    state.labels.forEach(function (lbl, idx) {
      var row = el("div", "tp-tagrow");
      var inp = document.createElement("input");
      inp.className = "inp";
      inp.value = lbl;
      inp.maxLength = 12;
      inp.addEventListener("change", function () {
        var v = inp.value.trim();
        if (!v) {
          inp.value = state.labels[idx];
          return;
        }
        state.labels[idx] = v;
        commit();
      });

      var del = el("button", "tp-del", "×");
      del.type = "button";
      del.disabled = state.labels.length <= 1;
      del.addEventListener("click", function () {
        if (state.labels.length <= 1) return;
        state.labels.splice(idx, 1);
        renderTags();
        commit();
      });

      row.appendChild(inp);
      row.appendChild(del);
      box.appendChild(row);
    });
  }

  /* ---------------- 挂载 ----------------
     两种情况：
       · 预览正显示「资源库」→ 把整块参数面板摆到左栏最前面；
       · 正显示别的页      → 只留一行入口条，说明动效长在哪、一键切过去。

     为什么非要有入口条：控制台一打开，预览默认停在「首页」，那时右边
     本来就不该有动效。只在资源库页挂面板，用户看到的是「右边没有动效、
     左边也没有面板」，很容易以为功能没生效。另外顶栏的页面 tab 在窄屏
     会被右侧操作区挤掉一截（1440 下已经溢出 23px，1280 下「资源库」
     整个落在可视区外），入口条不能依赖鼠标点到那个 tab，所以走
     element.click() 程序化切换。 */

  var teaser = null;

  function previewIsLinks() {
    var ifr = document.getElementById("preview");
    var src = ifr ? ifr.getAttribute("src") || "" : "";
    return src.indexOf("links.html") >= 0;
  }

  /* 预览切到手机 / 平板尺寸时，页头根本没有这块动效（断点是 1080），
     面板上得说一句，否则会以为是参数没生效 */
  function syncDeviceNote() {
    if (!refs.note) return;
    var on = document.querySelector("#devices button.is-on");
    var w = on ? parseInt(on.dataset.w, 10) : 1440;
    refs.note.hidden = !(w && w < 1080);
  }

  function buildTeaser() {
    if (teaser) return teaser;
    ensureStyle();
    teaser = el("div", "tp-teaser");
    teaser.id = "tp-teaser";
    var txt = el("div", "tp-teaser__txt");
    txt.appendChild(el("b", "", "页头地形动效"));
    txt.appendChild(el("span", "", "在「资源库」页头右侧，桌面预览 ≥1080px 可见"));
    var go = el("button", "tbtn tbtn--sm tp-teaser__go", "切到资源库");
    go.type = "button";
    go.addEventListener("click", function () { jumpToPanel(); });
    teaser.appendChild(txt);
    teaser.appendChild(go);
    return teaser;
  }

  function mount() {
    var pane = document.getElementById("formpane");
    if (!pane) return;

    if (!previewIsLinks()) {
      if (card && card.parentNode) card.parentNode.removeChild(card);
      var t = buildTeaser();
      if (t.parentNode !== pane || pane.firstChild !== t) {
        pane.insertBefore(t, pane.firstChild);
      }
      return;
    }

    if (teaser && teaser.parentNode) teaser.parentNode.removeChild(teaser);
    build();
    if (card.parentNode !== pane || pane.firstChild !== card) {
      pane.insertBefore(card, pane.firstChild);
    }
    syncDeviceNote();
  }

  var raf = 0;
  function schedule() {
    if (raf) return;
    raf = requestAnimationFrame(function () {
      raf = 0;
      mount();
    });
  }

  function observe() {
    var pane = document.getElementById("formpane");
    if (!pane) return;
    if (paneSeen !== pane && typeof MutationObserver === "function") {
      paneSeen = pane;
      // studio 每次渲染分组都会 innerHTML 清空重画，卡片跟着被摘掉，看见就补回去
      new MutationObserver(schedule).observe(pane, { childList: true });
    }
    var ifr = document.getElementById("preview");
    if (ifr && typeof MutationObserver === "function" && !ifr.__tpObs) {
      ifr.__tpObs = true;
      // 页面切换只改 iframe 的 src，formpane 不一定同时重画
      new MutationObserver(schedule).observe(ifr, { attributes: true, attributeFilter: ["src"] });
    }
    var devices = document.getElementById("devices");
    if (devices && typeof MutationObserver === "function" && !devices.__tpObs) {
      devices.__tpObs = true;
      // 桌面 / 平板 / 手机 切换只改按钮 class
      new MutationObserver(syncDeviceNote).observe(devices, {
        attributes: true, subtree: true, attributeFilter: ["class"]
      });
    }
  }

  /* 顶栏那个「地形动效」按钮撤了：面板现在就在左侧编辑区最上面，
     切到「资源库」一眼就能看到。顶栏本来就挤，多一个按钮会把
     页面 tab（全站 / 首页 / 资源库 / …）挤成省略号。
     下面这个函数留给需要在别处触发时用。 */
  function jumpToPanel() {
    var tab = document.querySelector('#tabs button[data-page-tab="links"]');
    if (tab && !tab.classList.contains("is-on")) tab.click();
    setTimeout(function () {
      observe();
      mount();
      var pane = document.getElementById("formpane");
      if (pane) pane.scrollTo({ top: 0, behavior: "smooth" });
      if (card) {
        card.classList.add("is-flash");
        setTimeout(function () { if (card) card.classList.remove("is-flash"); }, 1400);
      }
    }, 80);
  }

  function start() {
    observe();
    schedule();

    // 别的标签页改了同一份草稿（或发布了新版本），这里跟着刷新
    window.addEventListener("storage", function (e) {
      if (e.key !== (STORE ? STORE.KEY_DRAFT : "v2:topo:draft") && e.key !== KEY) return;
      state = read();
      if (card) applyToUI();
    });

    /* studio.js 发布成功后派发这个事件：把页面里那份 V2_TOPO 换成刚发布的快照，
       面板上的「草稿 / 已同步」立刻回到一致态，不用刷新页面。 */
    window.addEventListener("topo:published", function (e) {
      var snap = e && e.detail;
      if (STORE && snap) STORE.setPublished(snap);
      if (STORE) STORE.discardDraft();
      state = STORE ? STORE.published().params : state;
      if (card) applyToUI();
    });

    // 页面那边会把"实际生效的区域尺寸"报回来（窗口窄或页头矮时会被夹小），
    // 面板跟着显示真值，但不能回写 —— 否则和那边来回打架
    window.addEventListener("message", function (e) {
      var d = e.data;
      if (!d || d.type !== "topo:box" || !d.box || !card) return;
      var b = d.box;
      if (b.w === Math.round(state.boxW) && b.h === Math.round(state.boxH) &&
          b.dx === Math.round(state.dx) && b.dy === Math.round(state.dy)) return;
      state.boxW = b.w;
      state.boxH = b.h;
      state.dx = b.dx;
      state.dy = b.dy;
      paintGeom();
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
