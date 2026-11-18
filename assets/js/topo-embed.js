/* ============================================================
   TOPO-EMBED.JS — 把地形动效挂进「量化信息库」页头右侧

   三条硬约束：
   1. 只影响桌面端。手机 / 平板下面这段一行都不执行，DOM 里也不会
      多出任何节点 —— 走 matchMedia 判断，不是仅靠 CSS 藏起来。
   2. 不碰 render.js。页头由 render 渲染完后再插一个容器进去，
      改动面只有一个新文件，回滚就是删掉这个文件。
   3. 不抢首屏。iframe 用 IntersectionObserver 懒加载：滚动到附近才
      设置 src，滚出视口就通知引擎暂停（省电，也避免后台空转）。
   ============================================================ */
(function () {
  "use strict";

  var PAGE = "links";
  var MQ = "(min-width: 1080px)";
  var SRC = "topo-scene.html";
  var KEY = "v2:topo";

  if (!document.body || document.body.getAttribute("data-page") !== PAGE) return;

  var aside = null;
  var frame = null;
  var io = null;
  var inView = false;
  var booted = false;
  var lastParams = null;   // 最近一次拿到的参数，窗口缩放时重算区域要用

  var root = document.documentElement;

  function post(type, extra) {
    if (!frame || !frame.contentWindow) return;
    var msg = { type: type };
    if (extra) {
      for (var k in extra) {
        if (Object.prototype.hasOwnProperty.call(extra, k)) msg[k] = extra[k];
      }
    }
    try {
      frame.contentWindow.postMessage(msg, "*");
    } catch (e) {}
  }

  function currentParams() {
    var params = null;
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) params = JSON.parse(raw);
    } catch (e) {}
    // 本机还没存过参数时用共享默认值，避免引擎吃它自己那套「大画布」取景
    if (!params) params = window.TOPO_DEFAULTS || null;
    return params;
  }

  function pushParams() {
    var params = currentParams();
    // iframe 加载完通常字体/图片也定了，页头高度才是最终值，这时再量一次
    // 区域的夹取上限，避免早期的矮页头把高度永久夹小
    applyBox(params);
    if (params) post("topo:params", { params: params });
  }

  /* ------------------------------------------------------------
     区域几何：这块"画布"占多大、摆在哪儿
     引擎不管这事（它只认渲染参数），所以这里把它翻成页头的 CSS 变量：
       --topo-w / --topo-h / --topo-dx / --topo-dy  → 在 topo-embed.css 里用
       --topo-pad                                   → 文字区右侧让出的宽度
     变量挂在 <html> 上而不是 aside 上：.wrap 不是 aside 的后代，
     挂自己身上它收不到。桌面限定靠 CSS 那层媒体查询兜着，手机端没节点也没变量。
     ------------------------------------------------------------ */
  function num(v, dflt) {
    return typeof v === "number" && isFinite(v) ? v : dflt;
  }

  function applyBox(params) {
    if (!aside || !aside.parentNode) return;
    var d = window.TOPO_DEFAULTS || {};
    var head = aside.parentNode;
    var p = params || lastParams || d;
    lastParams = p;

    // 先量再写：写完之后页头高度会因为文字区变窄而变化，量晚了会越算越小
    var headW = head.clientWidth || window.innerWidth || 1440;
    var headH = head.clientHeight || 420;

    var w = num(p.boxW, num(d.boxW, 520));
    var h = num(p.boxH, num(d.boxH, 325));
    var dx = num(p.dx, num(d.dx, 0));
    var dy = num(p.dy, num(d.dy, 0));

    // 上限：宽度最多占页头的 62%（再宽标题就没地方了），高度不许顶出页头
    var maxW = Math.max(320, Math.round(headW * 0.62));
    var maxH = Math.max(200, Math.round(headH - 16));
    w = Math.round(Math.min(Math.max(w, 280), Math.min(760, maxW)));
    h = Math.round(Math.min(Math.max(h, 160), maxH));
    dx = Math.round(Math.min(Math.max(dx, -240), 320));
    dy = Math.round(Math.min(Math.max(dy, -260), 260));

    root.style.setProperty("--topo-w", w + "px");
    root.style.setProperty("--topo-h", h + "px");
    root.style.setProperty("--topo-dx", dx + "px");
    root.style.setProperty("--topo-dy", dy + "px");
    root.style.setProperty("--topo-pad", w + 32 + "px");

    // 回来告诉控制台"实际生效值"——滑杆拉过头时面板上显示的是被夹过的数
    if (window.parent && window.parent !== window) {
      try {
        window.parent.postMessage({ type: "topo:box", box: { w: w, h: h, dx: dx, dy: dy } }, "*");
      } catch (e) {}
    }
  }

  function clearBox() {
    ["--topo-w", "--topo-h", "--topo-dx", "--topo-dy", "--topo-pad"].forEach(function (k) {
      root.style.removeProperty(k);
    });
  }

  function create() {
    var head = document.querySelector(".pagehead");
    if (!head || aside) return;

    aside = document.createElement("div");
    aside.className = "pagehead__aside";
    aside.setAttribute("aria-hidden", "true");

    frame = document.createElement("iframe");
    frame.title = "量化地形动效";
    frame.loading = "lazy";
    frame.setAttribute("scrolling", "no");
    frame.setAttribute("tabindex", "-1");
    frame.setAttribute("referrerpolicy", "same-origin");
    frame.addEventListener("load", pushParams);

    aside.appendChild(frame);
    head.appendChild(aside);
    booted = true;

    // 先把区域几何定下来，再让 iframe 去量自己的尺寸 —— 否则引擎会先按
    // CSS 里的默认宽高取一次景，改大之后要等下一次 resize 才纠正过来
    applyBox(currentParams());
    scheduleBox();
  }

  function destroy() {
    if (io) {
      io.disconnect();
      io = null;
    }
    if (aside && aside.parentNode) aside.parentNode.removeChild(aside);
    aside = null;
    frame = null;
    booted = false;
    inView = false;
    clearBox();
  }

  /* 窗口尺寸变了，区域的夹取上限跟着变（页头宽度/高度都会变），
     用 rAF 合并，避免拖窗口时每像素算一次 */
  var boxRaf = 0;
  function scheduleBox() {
    if (boxRaf) return;
    boxRaf = requestAnimationFrame(function () {
      boxRaf = 0;
      applyBox(lastParams);
    });
  }

  function load() {
    if (!frame || frame.getAttribute("src")) return;
    frame.setAttribute("src", SRC);
  }

  function watch() {
    if (typeof IntersectionObserver !== "function") {
      // 老浏览器没有 IO：直接加载，不折腾懒加载
      load();
      return;
    }
    io = new IntersectionObserver(
      function (entries) {
        inView = entries[0].isIntersecting;
        if (inView) {
          load();
          post("topo:start");
        } else {
          post("topo:stop");
        }
      },
      // 提前 300px 预热，滚到眼前时已经在动了
      { rootMargin: "300px 0px" }
    );
    io.observe(aside);
  }

  function sync() {
    var desktop = window.matchMedia(MQ).matches;
    if (desktop) {
      if (!booted) {
        create();
        if (booted) watch();
      }
    } else if (booted) {
      // 缩到手机宽度：整块撤掉，让页头回到原来的排版
      destroy();
    }
  }

  // 控制台在别的标签页 / 站点预览里改了参数，这里立刻转给引擎
  window.addEventListener("storage", function (e) {
    if (e.key !== KEY || !frame) return;
    try {
      var p = e.newValue ? JSON.parse(e.newValue) : {};
      applyBox(p);
      post("topo:params", { params: p });
    } catch (err) {}
  });

  // 同一文档内（控制台面板）也可以直接喊一声
  window.addEventListener("message", function (e) {
    var d = e.data;
    if (!d || typeof d !== "object") return;
    if (d.type === "topo:set" && d.params) {
      applyBox(d.params);
      post("topo:params", { params: d.params });
    } else if (d.type === "topo:reload") {
      if (frame) {
        frame.removeAttribute("src");
        load();
      }
    } else if (d.type === "topo:beat") {
      // 控制台的「脉冲跳切」：一次性的动作，不落 localStorage，直接转给引擎
      post("topo:beat");
    }
  });

  window.addEventListener("resize", function () {
    if (booted) scheduleBox();
  });

  // 字体/图片加载完，页头高度可能又变了，夹取上限要跟着重算
  window.addEventListener("load", function () {
    if (booted) scheduleBox();
  });

  if (window.matchMedia) {
    var mql = window.matchMedia(MQ);
    if (mql.addEventListener) mql.addEventListener("change", sync);
    else if (mql.addListener) mql.addListener(sync);
  }

  // render.js 可能在 DOMContentLoaded 之后才把 main 渲染完，等页头真的在
  // 树里了再挂。先用 rAF 轮询几次，找不到就交给 MutationObserver。
  var tries = 0;
  (function waitHead() {
    if (document.querySelector(".pagehead")) {
      sync();
      return;
    }
    if (tries++ > 90) {
      if (typeof MutationObserver === "function") {
        var mo = new MutationObserver(function () {
          if (document.querySelector(".pagehead")) {
            mo.disconnect();
            sync();
          }
        });
        mo.observe(document.body, { childList: true, subtree: true });
      }
      return;
    }
    requestAnimationFrame(waitHead);
  })();
})();
