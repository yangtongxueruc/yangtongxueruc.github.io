/* ============================================================
   TOPO-STORE.JS — 地形动效参数的唯一读取入口

   为什么要有这一层：
   参数现在有「已发布」和「草稿」两份，三个地方要读（页头挂载器
   topo-embed.js、引擎 topo-scene.html、控制台 topo-console.js）。
   如果每处各自 parse localStorage，迟早会出现「预览是新的、线上是旧的」
   或者「某个字段没夹取到范围」这类只在某些设备复现的问题。

   优先级：
     内置 TOPO_DEFAULTS（兜底）
        ← V2_TOPO.params（已发布，对所有访客生效）
           ← 草稿 v2:topo:draft（**只在控制台预览的 iframe 里**叠加）

   最后那条是这套设计的关键：顶层页面永远只认已发布值。
   否则管理员在自己浏览器里打开正式链接，看到的是草稿，
   会以为「已经生效了」—— 这正是之前那个问题的来源。

   加载顺序：data/topo.js → topo-defaults.js → 本文件。
   ============================================================ */
(function () {
  "use strict";

  var KEY_DRAFT = "v2:topo:draft";
  var KEY_LEGACY = "v2:topo";        // 旧版：本机私有生效值，首次加载时并入草稿后删掉
  var DEF = window.TOPO_DEFAULTS || {};
  var PUB = window.V2_TOPO || null;
  /* 控制台发布成功后，页面里的 V2_TOPO 还是旧的（没刷新）。
     用一份内存里的覆盖值顶上去，面板的「草稿/已同步」立刻回到一致态。 */
  var pubOverride = null;
  var HISTORY_MAX = 8;

  function pubData() {
    return pubOverride || PUB;
  }

  /* 字段白名单 + 范围。发布出来的文件在客户端仍要过一遍：
     老版本 topo.js 缺新字段、或有人手改出越界值，都靠这里兜住，
     绝不做「整份替换」。 */
  var NUM = {
    boxW: [280, 760], boxH: [160, 560], dx: [-240, 320], dy: [-260, 260],
    levels: [4, 14], amp: [0.2, 1.6], speed: [0, 1.2], orbit: [0, 1.2],
    pitchDeg: [16, 62], dist: [8, 30], dof: [0, 1.6], bloom: [0, 1.6],
    cyanPct: [0, 30], fontSize: [9, 18], rippleHz: [1, 12]
  };
  var BOOL = ["contours", "voxels", "dust", "frame", "autorotate", "postfx", "autoBeatCut", "ripple"];
  var PRESETS = ["original", "quant", "mono"];
  var LABELS_MAX = 8;

  function clamp(v, lo, hi) {
    return v < lo ? lo : (v > hi ? hi : v);
  }

  /* 把任意来源的对象洗成一份干净的参数：只认白名单里的键、类型不对就丢、
     数值越界就夹回范围。返回的永远是一个完整对象（缺项从 base 补）。 */
  function normalize(raw, base) {
    var out = {};
    var k;
    var seed = base || {};
    for (k in seed) {
      if (Object.prototype.hasOwnProperty.call(seed, k)) {
        out[k] = Array.isArray(seed[k]) ? seed[k].slice() : seed[k];
      }
    }
    if (!raw || typeof raw !== "object") return out;

    for (k in NUM) {
      if (!Object.prototype.hasOwnProperty.call(NUM, k)) continue;
      var v = raw[k];
      if (typeof v === "number" && isFinite(v)) {
        out[k] = Math.round(clamp(v, NUM[k][0], NUM[k][1]) * 1000) / 1000;
      }
    }
    BOOL.forEach(function (b) {
      if (typeof raw[b] === "boolean") out[b] = raw[b];
    });
    if (typeof raw.preset === "string" && PRESETS.indexOf(raw.preset) >= 0) {
      out.preset = raw.preset;
    }
    if (Array.isArray(raw.labels)) {
      var clean = raw.labels
        .map(function (t) { return String(t == null ? "" : t).trim().slice(0, 12); })
        .filter(Boolean)
        .slice(0, LABELS_MAX);
      if (clean.length) out.labels = clean;
    }
    return out;
  }

  function publishedVersion() {
    var p = pubData();
    return p && typeof p.version === "number" ? p.version : 0;
  }

  function published() {
    var p = pubData();
    return {
      version: publishedVersion(),
      updatedAt: (p && p.updatedAt) || "",
      params: normalize(p && p.params, DEF)
    };
  }

  function readDraftRaw() {
    try {
      var raw = localStorage.getItem(KEY_DRAFT);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  /* 草稿：{base, at, params}。base 是「写草稿时的已发布版本」，
     跟当前版本对不上就说明期间有人发布过，这份草稿已经落后，
     不能再拿去渲染 —— 否则会把别人刚发布的改动盖掉。 */
  function draft() {
    var d = readDraftRaw();
    if (!d || typeof d !== "object" || !d.params) return null;
    var base = typeof d.base === "number" ? d.base : -1;
    return {
      base: base,
      at: typeof d.at === "number" ? d.at : 0,
      params: normalize(d.params, published().params),
      stale: base !== publishedVersion()
    };
  }

  function saveDraft(params) {
    var payload = {
      base: publishedVersion(),
      at: Date.now(),
      params: normalize(params, published().params)
    };
    try {
      localStorage.setItem(KEY_DRAFT, JSON.stringify(payload));
      localStorage.removeItem(KEY_LEGACY);
    } catch (e) {}
    return payload;
  }

  function discardDraft() {
    try {
      localStorage.removeItem(KEY_DRAFT);
      localStorage.removeItem(KEY_LEGACY);
    } catch (e) {}
  }

  function diffKeys(a, b) {
    var out = [];
    var k;
    var A = a || {};
    var B = b || {};
    for (k in NUM) {
      if (Math.abs((A[k] || 0) - (B[k] || 0)) > 0.001) out.push(k);
    }
    BOOL.forEach(function (x) { if (!!A[x] !== !!B[x]) out.push(x); });
    if (A.preset !== B.preset) out.push("preset");
    if (JSON.stringify(A.labels || []) !== JSON.stringify(B.labels || [])) out.push("labels");
    return out;
  }

  function isDirty() {
    var d = draft();
    if (!d) return false;
    return diffKeys(d.params, published().params).length > 0;
  }

  /* 当前文档是不是「控制台的预览 iframe」（含孙级：预览里的 links.html
     再嵌的 topo-scene.html 也算）。跨域时访问 top 会抛异常，按 false 处理，
     于是公开站点的访客永远走已发布值。 */
  function isPreviewHost() {
    try {
      if (window.self === window.top) return false;
      var p = window.top.location.pathname || "";
      return /(?:^|\/)(?:manage|studio)\.html$/.test(p) || /\/(?:manage|studio)$/.test(p);
    } catch (e) {
      return false;
    }
  }

  /* 渲染时该用哪份参数。 */
  function resolve() {
    var pub = published();
    if (!isPreviewHost()) return pub.params;
    var d = draft();
    if (!d || d.stale) return pub.params;
    return d.params;
  }

  function history() {
    var p = pubData();
    if (!p || !Array.isArray(p.history)) return [];
    return p.history.slice().reverse();
  }

  /* 发布成功后由 studio.js 调：把"已发布"这一层换成新快照。
     只影响本页内存，不动 localStorage —— 刷新后自然从 data/topo.js 读新的。 */
  function setPublished(obj) {
    if (!obj || typeof obj !== "object") return;
    pubOverride = {
      version: typeof obj.version === "number" ? obj.version : publishedVersion(),
      updatedAt: obj.updatedAt || "",
      params: normalize(obj.params, published().params),
      history: Array.isArray(obj.history) ? obj.history.slice(-HISTORY_MAX) : []
    };
  }

  /* 旧版把参数直接写在 v2:topo 里、且对正式页面也生效。
     第一次加载时把它搬成草稿，用户的调参不会凭空消失，
     但从此只影响预览，要点发布才上线。 */
  (function migrateLegacy() {
    try {
      var raw = localStorage.getItem(KEY_LEGACY);
      if (!raw) return;
      if (!localStorage.getItem(KEY_DRAFT)) {
        var legacy = JSON.parse(raw);
        localStorage.setItem(KEY_DRAFT, JSON.stringify({
          base: publishedVersion(),
          at: Date.now(),
          params: normalize(legacy, published().params)
        }));
      }
      localStorage.removeItem(KEY_LEGACY);
    } catch (e) {}
  })();

  window.TopoStore = {
    KEY_DRAFT: KEY_DRAFT,
    published: published,
    setPublished: setPublished,
    draft: draft,
    saveDraft: saveDraft,
    discardDraft: discardDraft,
    discard: discardDraft,
    resolve: resolve,
    isDirty: isDirty,
    diffKeys: diffKeys,
    isPreviewHost: isPreviewHost,
    history: history,
    normalize: normalize,
    defaults: function () { return normalize(DEF, DEF); },
    HISTORY_MAX: HISTORY_MAX
  };
})();
