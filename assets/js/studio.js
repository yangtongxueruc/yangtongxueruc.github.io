/* ============================================================
   STUDIO.JS — 内容控制台
   编辑 → 局部重渲染（postMessage / 直接调用 V2.applyContent）
        → 草稿写入 localStorage（页面刷新后仍在）
        → 导出 content.js 才算发布
   ============================================================ */
(function () {
  "use strict";

  var SCHEMA = window.V2_SCHEMA.groups;
  var DRAFT_KEY = "v2:draft";
  var FILE_VERSION = window.V2_CONTENT;

  var S = {
    content: null,
    tab: "home",
    groupId: null,
    device: 1440,
    undo: [],
    lastPush: 0,
    dirty: false,
    pubView: false,
    previewPage: "home"
  };

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  /* ---------------- 路径读写 ---------------- */
  function getPath(obj, path) {
    return path.split(".").reduce(function (o, k) {
      return o === null || o === undefined ? undefined : o[k];
    }, obj);
  }
  function setPath(obj, path, val) {
    var parts = path.split(".");
    var cur = obj;
    for (var i = 0; i < parts.length - 1; i++) {
      if (cur[parts[i]] === null || cur[parts[i]] === undefined) cur[parts[i]] = {};
      cur = cur[parts[i]];
    }
    cur[parts[parts.length - 1]] = val;
  }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  /* ---------------- 提示 ---------------- */
  var toastEl = $("#toast");
  var toastTimer;
  function toast(msg, ms) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add("is-on");
    clearTimeout(toastTimer);
    /* 默认 2.2 秒够读一句话。发布成功那条要带上「看到旧页面怎么刷新」，
       明显更长，所以允许按条指定停留时间，否则末尾的提示还没读到就消失了。 */
    toastTimer = setTimeout(function () { toastEl.classList.remove("is-on"); }, ms || 2200);
  }

  function setState(text, dirty) {
    var el = $("#state");
    if (!el) return;
    var v = S.content && S.content.version ? "v" + S.content.version + " · " : "";
    el.textContent = v + text;
    el.classList.toggle("is-dirty", !!dirty);
  }

  /* ---------------- 载入 ---------------- */
  function loadInitial() {
    try {
      var raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        var d = JSON.parse(raw);
        var ok = d && d.version === FILE_VERSION.version && d.pages &&
          d.pages.home && Array.isArray(d.pages.home.order) && d.pages.home.order.length;
        if (ok) return { content: d, fromDraft: true };
        localStorage.removeItem(DRAFT_KEY); // 结构已升级，丢弃过期草稿
      }
    } catch (e) {}
    return { content: clone(FILE_VERSION), fromDraft: false };
  }

  /* ---------------- 目录 ---------------- */
  var TABS = [
    { key: "site", label: "全站" },
    { key: "home", label: "首页" },
    { key: "links", label: "资源库" },
    { key: "gallery", label: "影像" },
    { key: "legal", label: "法务" },
    { key: "404", label: "404" }
  ];

  function groupsOf(tab) {
    return SCHEMA.filter(function (g) { return g.page === tab; });
  }

  function hasPlaceholder(str) {
    return typeof str === "string" && str.indexOf("{{") !== -1;
  }

  /* 上传的人像压成内嵌 JPEG：跟着 content.js 一起发布，换设备不需要额外图片文件。
     最长边 900px；先铺白底，避免 PNG 透明区转 JPEG 后发黑；尽量控制在 ~300KB。*/
  function compressPortrait(img) {
    var maxSide = 900, limit = 320 * 1024;
    var w = img.naturalWidth || img.width;
    var h = img.naturalHeight || img.height;
    var scale = Math.min(1, maxSide / Math.max(w, h));
    var cw = Math.max(1, Math.round(w * scale));
    var ch = Math.max(1, Math.round(h * scale));
    var cv = document.createElement("canvas");
    cv.width = cw;
    cv.height = ch;
    var ctx = cv.getContext("2d");

    function draw() {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, cv.width, cv.height);
      ctx.drawImage(img, 0, 0, cv.width, cv.height);
    }

    draw();
    var quality = 0.82;
    var out = cv.toDataURL("image/jpeg", quality);
    while (out.length > limit && quality > 0.45) {
      quality -= 0.12;
      out = cv.toDataURL("image/jpeg", quality);
    }
    if (out.length > limit) {
      cv.width = Math.max(1, Math.round(cw * 0.7));
      cv.height = Math.max(1, Math.round(ch * 0.7));
      draw();
      out = cv.toDataURL("image/jpeg", 0.7);
    }
    return out;
  }

  /* ---------------- 影像照片：压缩 + 上传 ----------------
     和首屏人像不是一回事。人像内嵌 data URL 跟着 content.js 走，因为只有
     一张；照片动辄十几张，内嵌会把内容文件顶到几 MB，每次打开页面都要多
     下载一遍。所以照片走本机服务落成 assets/img/gallery/ 下的真实文件，
     内容里只存路径，发布时再把文件作为二进制 blob 一起推上去。

     顺带把「手写相对上级的路径」这条路封掉：路径拼错不会报错，只会
     在页面上留一块空白。 */
  var IMG_UPLOAD_PATH = "/__img/upload";
  var IMG_RAW_PATH = "/__img/raw";
  /* 公众号合集：订阅 = 往 data/sources.json 里加一条 type=album 的源，
     之后由 GitHub Actions 每 6 小时的抓取自动带上，不再另造调度。*/
  var ALBUM_SUB_PATH = "/__album/subscribe";
  var ALBUM_REMOVE_PATH = "/__album/remove";
  var ALBUM_LIST_PATH = "/__album/list";
  var FILE_RAW_PATH = "/__file/raw";
  /* 发布时要一起推的数据文件。订阅改了 sources.json，抓取改了 links.json，
     只推 content.js 和页面的话仓库里这两份永远停在旧版本。*/
  var SYNC_DATA_FILES = ["data/sources.json", "data/links.json", "data/links.js"];

  /* ---------------- 订阅改动的「未发布」标记 ----------------
     草稿有 localStorage 自动兜底，订阅/退订没有：它只写本机服务的
     data/sources.json，既不进草稿、也不会自动推远端。原来的提示是弹层里
     一句一次性文字，刷新/关掉弹层就没了，用户很容易以为订阅已经生效。
     这里把状态落进 localStorage，跨刷新保留；只有发布确实把 sources.json
     带上去了才清（见 publish() 里的 sourcesSynced）。 */
  var SOURCES_DIRTY_KEY = "v2:pending-sources";

  function sourcesDirty() {
    try {
      var raw = localStorage.getItem(SOURCES_DIRTY_KEY);
      var d = raw ? JSON.parse(raw) : null;
      return d && d.ops && d.ops.length ? d : null;
    } catch (e) { return null; }
  }
  function markSourcesDirty(op) {
    var d = sourcesDirty() || { ops: [], at: "" };
    d.ops.push(op);
    d.at = new Date().toISOString();
    try { localStorage.setItem(SOURCES_DIRTY_KEY, JSON.stringify(d)); } catch (e) {}
    renderSourcesFlag();
  }
  function clearSourcesDirty() {
    try { localStorage.removeItem(SOURCES_DIRTY_KEY); } catch (e) {}
    renderSourcesFlag();
  }
  function renderSourcesFlag() {
    var flag = $("#sources-flag");
    if (!flag) return;
    var d = sourcesDirty();
    flag.hidden = !d;
    if (d) {
      flag.textContent = "有未发布的订阅改动 · 去发布";
      flag.title = d.ops.join("、") + "（" + d.at
        + "）。订阅/退订只改了本机文件，点这里发布到仓库后才会真正生效。";
    }
  }

  function localApi(path) {
    /* 控制台通常就是从 8899 打开的，相对路径最稳；只有在别处（file:// 或
       另一个端口）打开、又探测到本地通道时，才需要拼上那个 base。 */
    var base = GH.proxy ? GH.proxy.replace(/\/__gh$/, "") : "";
    return base + path;
  }

  /* ---------------- 本地服务的安全令牌 ----------------
     本地服务只把令牌发给本机回环来源，跨站页面读不到；所有写端点必须带
     X-V2-CSRF。服务重启会换新令牌，所以 403 时重取一次再试。 */
  var csrfToken = null;
  async function csrf(force) {
    if (csrfToken !== null && !force) return csrfToken;
    var r = await fetchWithTimeout(localApi("/__csrf"), { method: "GET", cache: "no-store" }, 5000);
    /* 404 = 跑着的是旧版服务（还没有这个端点）。此时返回空串、不带这个头，
       让旧服务照常工作，而不是把整个发布流程卡死。 */
    if (r.status === 404) { csrfToken = ""; return ""; }
    var j = await r.json().catch(function () { return null; });
    if (!j || !j.ok || !j.token) {
      throw new Error("拿不到本地服务的安全令牌：请用 http://127.0.0.1:8899/v2/studio.html 打开控制台"
        + "（file:// 打开的页面拿不到令牌）");
    }
    csrfToken = j.token;
    return csrfToken;
  }
  function csrfHeaders(extra) {
    var h = extra || {};
    if (csrfToken) h["X-V2-CSRF"] = csrfToken;
    return h;
  }

  /* 所有写本机的请求都走这里，免得漏掉一个端点就变成 403。 */
  async function localPost(path, payload, timeout) {
    var last = null;
    for (var attempt = 0; attempt < 2; attempt++) {
      await csrf(attempt > 0);
      var r = await fetchWithTimeout(localApi(path), {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(payload || {})
      }, timeout || 30000);
      if (r.status !== 403) return r;
      last = r;   // 服务重启过，令牌作废 —— 重取一次再试
    }
    return last;
  }

  function compressPhoto(img) {
    var maxSide = 1800, limit = 700 * 1024;
    var w = img.naturalWidth || img.width;
    var h = img.naturalHeight || img.height;
    var scale = Math.min(1, maxSide / Math.max(w, h));
    var cw = Math.max(1, Math.round(w * scale));
    var ch = Math.max(1, Math.round(h * scale));
    var cv = document.createElement("canvas");
    var ctx = cv.getContext("2d");

    function encode(canvas, w2, h2, quality) {
      canvas.width = w2;
      canvas.height = h2;
      ctx.drawImage(img, 0, 0, w2, h2);
      return canvas.toDataURL("image/jpeg", quality);
    }

    var out = encode(cv, cw, ch, 0.85);
    var q = 0.85;
    /* 夹住下限：0.45 的 JPEG 已经明显发糊，宁可走下面的缩边分支 */
    while (out.length * 0.75 > limit && q > 0.55) {
      q = Math.max(0.55, q - 0.1);
      out = encode(cv, cw, ch, q);
    }
    /* JPEG 压不动了就缩边，别为了守 700KB 把画质砸到糊 */
    if (out.length * 0.75 > limit) {
      out = encode(cv, Math.round(cw * 0.75), Math.round(ch * 0.75), 0.78);
    }
    return { data: out, w: cw, h: ch };
  }

  /* 云端模式：图片直接作为独立 blob 提交进仓库。
     本机模式是「落盘 → 发布时读回字节一起推」，云端没有磁盘可用，改用
     Contents API 一次请求写完（它自己会建一个 commit）。单独提交不影响线上：
     内容此刻还没引用这张图，产物里只是多一个文件，发布 content.js 时才被用到。
     文件名加 4 位随机后缀，避免同一秒连传多张撞名（本机靠 os.path.exists
     递增，云端没有这个能力）。 */
  function cloudUploadImage(name, dataUrl, picW, picH, subdir) {
    var token = savedToken();
    if (!token) {
      return Promise.reject(new Error(
        "云端模式上传图片要先有 Token：在「发布」里填一次，之后会自动记住"));
    }
    var m = /^data:image\/([a-z0-9.+-]+);base64,/i.exec(String(dataUrl || ""));
    if (!m) return Promise.reject(new Error("不是 base64 图片 data URL"));
    var ext = m[1].toLowerCase();
    if (ext === "jpeg") ext = "jpg";
    if (!/^(jpg|png|webp|gif)$/.test(ext)) {
      return Promise.reject(new Error("只接受 JPG / PNG / WebP / GIF"));
    }
    var base = String(name || "").replace(/\.[^.]+$/, "");
    var slug = base.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    if (!slug || /^\d+$/.test(slug)) slug = "photo";
    slug = slug.slice(0, 40);
    var d = new Date();
    var pad = function (n) { return (n < 10 ? "0" : "") + n; };
    var stamp = String(d.getFullYear()).slice(2) + pad(d.getMonth() + 1) + pad(d.getDate())
      + "-" + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds());
    var rand = Math.random().toString(36).slice(2, 6);
    var fname = slug + "-" + stamp + "-" + rand + "." + ext;
    var sub = subdir || "gallery";
    var repoPath = "assets/img/" + sub + "/" + fname;
    var b64 = String(dataUrl).slice(String(dataUrl).indexOf(",") + 1);
    return gh(token, "PUT", "/repos/" + GH.repo + "/contents/" + repoPath, {
      message: "image: 上传 " + fname,
      content: b64,
      branch: GH.branch
    }).then(function () {
      return {
        ok: true,
        /* 不带上级前缀：v2/ 里的页面直接命中 v2/assets/，拍平后的产物命中
           根 assets/，两种形态都对。带前缀的写法只在产物里成立，dev 预览必然 404。 */
        path: repoPath,
        repo: repoPath,
        bytes: Math.round(b64.length * 3 / 4),
        picW: picW,
        picH: picH
      };
    });
  }

  /* ---- logo 专用压缩 ----
     和照片那条链路的区别只有一个关键点：必须留透明通道。
     compressPhoto 走 image/jpeg，透明底会被压成黑块或白块，logo 直接报废。
     另外顺手裁掉四周的透明边距 —— 品牌方给的图常常带大片留白，
     不裁的话同一行里有的 logo 会显得小一圈。 */
  function trimAlpha(cv) {
    var c = cv.getContext("2d");
    var w = cv.width, h = cv.height;
    var d;
    try { d = c.getImageData(0, 0, w, h).data; } catch (e) { return cv; }
    var top = h, left = w, right = -1, bottom = -1;
    for (var y = 0; y < h; y++) {
      var row = y * w * 4;
      for (var x = 0; x < w; x++) {
        if (d[row + x * 4 + 3] > 12) {
          if (y < top) top = y;
          if (y > bottom) bottom = y;
          if (x < left) left = x;
          if (x > right) right = x;
        }
      }
    }
    /* 整张全透明（或者取不到像素）就别裁，否则会得到一个 0×0 的画布 */
    if (right < 0 || bottom < 0 || (right - left) < 2 || (bottom - top) < 2) return cv;
    var out = document.createElement("canvas");
    out.width = right - left + 1;
    out.height = bottom - top + 1;
    out.getContext("2d").drawImage(cv, left, top, out.width, out.height, 0, 0, out.width, out.height);
    return out;
  }

  function compressLogo(img) {
    var MAX_H = 160, MAX_W = 1200, MAX_SIDE = 2400;
    var w = img.naturalWidth || img.width;
    var h = img.naturalHeight || img.height;

    /* 先按原尺寸画到画布（超大图先缩到 2400 以内，纯粹为了 getImageData 别太久） */
    var pre = Math.min(1, MAX_SIDE / Math.max(w, h));
    var cv = document.createElement("canvas");
    cv.width = Math.max(1, Math.round(w * pre));
    cv.height = Math.max(1, Math.round(h * pre));
    var c0 = cv.getContext("2d");
    c0.imageSmoothingQuality = "high";
    c0.drawImage(img, 0, 0, cv.width, cv.height);

    cv = trimAlpha(cv);

    var scale = Math.min(1, MAX_H / cv.height, MAX_W / cv.width);
    var out = document.createElement("canvas");
    out.width = Math.max(1, Math.round(cv.width * scale));
    out.height = Math.max(1, Math.round(cv.height * scale));
    var c1 = out.getContext("2d");
    c1.imageSmoothingQuality = "high";
    c1.drawImage(cv, 0, 0, out.width, out.height);

    return { data: out.toDataURL("image/png"), w: out.width, h: out.height };
  }

  /* 读文件 → 裁边距 → 压缩 → 上传；返回 {path, repo, bytes, picW, picH} */
  function uploadLogoFile(file) {
    return new Promise(function (resolve, reject) {
      if (!/^image\//.test(file.type)) {
        reject(new Error("不是图片文件"));
        return;
      }
      if (file.size > 14 * 1024 * 1024) {
        reject(new Error("超过 14 MB，请先压缩"));
        return;
      }
      var fr = new FileReader();
      fr.onerror = function () { reject(new Error("读取失败")); };
      fr.onload = function () {
        var im = new Image();
        im.onerror = function () { reject(new Error("图片解码失败")); };
        im.onload = function () {
          var out;
          try {
            out = compressLogo(im);
          } catch (e) {
            reject(new Error("处理失败：" + (e && e.message ? e.message : e)));
            return;
          }
          if (CLOUD) {
            cloudUploadImage(file.name, out.data, out.w, out.h, "logos")
              .then(function (d) { d.origBytes = file.size; resolve(d); })
              .catch(function (e) { reject(new Error((e && e.message) || "上传失败")); });
            return;
          }
          localPost(IMG_UPLOAD_PATH, { name: file.name, dataUrl: out.data, kind: "logos" }, 60000)
            .then(function (r) { return r.json(); })
            .then(function (d) {
              if (!d || !d.ok) throw new Error((d && d.error) || "上传失败");
              d.origBytes = file.size;
              d.picW = out.w;
              d.picH = out.h;
              resolve(d);
            })
            .catch(function (e) {
              var msg = (e && e.message) || "上传失败";
              if (/Failed to fetch|NetworkError|load failed|ERR_/i.test(msg)) {
                msg += "（本地服务没在跑？先执行 python v2/publish_server.py）";
              }
              reject(new Error(msg));
            });
        };
        im.src = String(fr.result);
      };
      fr.readAsDataURL(file);
    });
  }

  /* 读文件 → 压缩 → 上传，返回 {path, repo, bytes} */
  function uploadPhotoFile(file) {
    return new Promise(function (resolve, reject) {
      if (!/^image\//.test(file.type)) {
        reject(new Error("不是图片文件"));
        return;
      }
      if (file.size > 14 * 1024 * 1024) {
        reject(new Error("超过 14 MB，请先压缩"));
        return;
      }
      var fr = new FileReader();
      fr.onerror = function () { reject(new Error("读取失败")); };
      fr.onload = function () {
        var im = new Image();
        im.onerror = function () { reject(new Error("图片解码失败")); };
        im.onload = function () {
          var out;
          try {
            out = compressPhoto(im);
          } catch (e) {
            reject(new Error("压缩失败：" + (e && e.message ? e.message : e)));
            return;
          }
          /* 云端没有磁盘可落，直接进仓库；本机走服务端落盘，发布时再读回。 */
          if (CLOUD) {
            cloudUploadImage(file.name, out.data, out.w, out.h)
              .then(function (d) {
                d.origBytes = file.size;
                resolve(d);
              })
              .catch(function (e) {
                reject(new Error((e && e.message) || "上传失败"));
              });
            return;
          }
          localPost(IMG_UPLOAD_PATH, { name: file.name, dataUrl: out.data }, 60000)
            .then(function (r) { return r.json(); })
            .then(function (d) {
              if (!d || !d.ok) throw new Error((d && d.error) || "上传失败");
              d.origBytes = file.size;
              d.picW = out.w;
              d.picH = out.h;
              resolve(d);
            })
            .catch(function (e) {
              var msg = (e && e.message) || "上传失败";
              if (/Failed to fetch|NetworkError|load failed|ERR_/i.test(msg)) {
                msg += "（本地服务没在跑？先执行 python v2/publish_server.py）";
              }
              reject(new Error(msg));
            });
        };
        im.src = String(fr.result);
      };
      fr.readAsDataURL(file);
    });
  }

  /* ---- 待发布图片 ----
     文件已经在本机磁盘上了，但线上的 GitHub Pages 还没有。这里只记仓库路径
     （纯字符串，几十字节），发布时再让服务端把字节读回来。图片本身进不了
     localStorage 草稿，几 MB 的 base64 会直接超配额。 */
  var UPLOAD_KEY = "v2:uploads";

  function pendingUploads() {
    try {
      var raw = localStorage.getItem(UPLOAD_KEY);
      var a = raw ? JSON.parse(raw) : [];
      return Array.isArray(a) ? a.filter(function (x) { return typeof x === "string" && x; }) : [];
    } catch (e) { return []; }
  }

  function markUpload(repo) {
    /* 云端图片已经进了仓库，没有「待发布」状态。硬标记的话，下次发布会去
       读一个根本不存在的本机文件，整次发布被这张图拖死。 */
    if (!repo || CLOUD) return;
    var a = pendingUploads();
    if (a.indexOf(repo) === -1) a.push(repo);
    try { localStorage.setItem(UPLOAD_KEY, JSON.stringify(a)); } catch (e) {}
  }

  function clearUploads(done) {
    var rest = pendingUploads().filter(function (p) { return done.indexOf(p) === -1; });
    try {
      if (rest.length) localStorage.setItem(UPLOAD_KEY, JSON.stringify(rest));
      else localStorage.removeItem(UPLOAD_KEY);
    } catch (e) {}
  }

  function isPending(repo) {
    return pendingUploads().indexOf(repo) !== -1;
  }

  function renderTree() {
    var host = $("#tree");
    if (!host) return;
    host.innerHTML = "";
    TABS.forEach(function (t) {
      var list = groupsOf(t.key);
      if (!list.length) return;
      var h = document.createElement("div");
      h.className = "tree__page";
      h.textContent = t.label;
      host.appendChild(h);

      list.forEach(function (g) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "tree__item" + (g.id === S.groupId ? " is-on" : "");
        b.dataset.group = g.id;

        var ic = document.createElement("span");
        ic.className = "tree__icon";
        ic.textContent = g.icon || "·";
        b.appendChild(ic);

        var lb = document.createElement("span");
        lb.textContent = g.label;
        b.appendChild(lb);

        if (groupTouches(g)) {
          var fl = document.createElement("span");
          fl.className = "tree__flag";
          fl.title = "这一段里还有未填的占位";
          b.appendChild(fl);
        }
        host.appendChild(b);

        /* 分组自带的动作行（schema 里的 actions）：紧跟在分组按钮下面，
           用「＋」区分于普通导航项 —— 它不切换分组，只开一个操作面板。 */
        (g.actions || []).forEach(function (a) {
          var ab = document.createElement("button");
          ab.type = "button";
          ab.className = "tree__act";
          ab.dataset.act = a.key;
          if (a.hint) ab.title = a.hint;
          var plus = document.createElement("span");
          plus.className = "tree__act--plus";
          plus.textContent = "＋";
          ab.appendChild(plus);
          var txt = document.createElement("span");
          txt.textContent = a.label;
          ab.appendChild(txt);
          host.appendChild(ab);
        });
      });
    });
  }

  /* 判断某个分组的字段里是否还有 {{ }} */
  function groupTouches(g) {
    for (var i = 0; i < g.fields.length; i++) {
      var v = getPath(S.content, g.fields[i].path);
      if (JSON.stringify(v === undefined ? "" : v).indexOf("{{") !== -1) return true;
    }
    return false;
  }

  /* ---------------- 表单 ---------------- */
  function renderForm() {
    var host = $("#formpane");
    if (!host) return;
    var g = SCHEMA.filter(function (x) { return x.id === S.groupId; })[0];
    host.innerHTML = "";
    if (!g) return;

    var head = document.createElement("div");
    head.className = "fp__head";
    var h2 = document.createElement("h2");
    h2.textContent = g.label;
    head.appendChild(h2);
    if (g.hint) {
      var p = document.createElement("p");
      p.textContent = g.hint;
      head.appendChild(p);
    }
    host.appendChild(head);

    renderFields(host, g.fields, "");
  }

  /* 影像照片的上传控件：一张一个，替换 / 移除都走这里。
     与首屏人像那个 picker 长得一样，但写入的是路径而不是 data URL。 */
  function renderPhotoPicker(wrap, abs, val, field) {
    var picker = document.createElement("input");
    picker.type = "file";
    picker.accept = "image/*";
    picker.hidden = true;

    var box = document.createElement("div");
    box.className = "imgpick imgpick--photo";

    var thumb = document.createElement("div");
    thumb.className = "imgpick__thumb";
    var pv = document.createElement("img");
    pv.alt = "照片预览";
    pv.loading = "lazy";
    thumb.appendChild(pv);

    var side = document.createElement("div");
    side.className = "imgpick__side";
    var st = document.createElement("p");
    st.className = "imgpick__status";
    var mt = document.createElement("p");
    mt.className = "imgpick__meta";
    var acts = document.createElement("div");
    acts.className = "imgpick__acts";
    var pick = document.createElement("button");
    pick.type = "button";
    pick.className = "tbtn tbtn--sm";
    pick.textContent = "上传照片";
    var rm = document.createElement("button");
    rm.type = "button";
    rm.className = "tbtn tbtn--sm";
    rm.textContent = "移除";
    acts.appendChild(pick);
    acts.appendChild(rm);
    side.appendChild(st);
    side.appendChild(mt);
    side.appendChild(acts);
    box.appendChild(thumb);
    box.appendChild(side);
    box.appendChild(picker);
    wrap.appendChild(box);
    if (field.hint) wrap.appendChild(hintNode(field.hint));

    function repoOf(src) {
      return String(src || "").replace(/^\.\.\//, "");
    }
    function say(text, bad, busy) {
      st.textContent = text;
      st.classList.toggle("is-bad", !!bad);
      box.classList.toggle("is-busy", !!busy);
      pick.disabled = !!busy;
    }
    function show(src, statusText, metaText) {
      var s = String(src || "");
      if (s) {
        pv.src = s;
        thumb.classList.remove("is-empty");
      } else {
        pv.removeAttribute("src");
        thumb.classList.add("is-empty");
      }
      var repo = repoOf(s);
      say(statusText || (s ? (isPending(repo) ? "已上传 · 待发布" : "已上传") : "还没上传照片"), false, false);
      mt.textContent = metaText
        || (s ? repo + (isPending(repo) ? " · 点「发布」后上线" : "") : "支持 JPG / PNG / WebP");
      rm.disabled = !s;
      pick.textContent = s ? "替换照片" : "上传照片";
    }
    pv.addEventListener("error", function () {
      thumb.classList.add("is-empty");
      say("这张图加载不出来，路径可能失效了，建议重新上传", true, false);
    });

    pick.addEventListener("click", function () { picker.click(); });
    rm.addEventListener("click", function () {
      commit(abs, "");
      show("", "已移除，点「发布」后生效", "文件还留在 assets/img/gallery/，需要的话可以手动删");
    });
    picker.addEventListener("change", function () {
      var file = picker.files && picker.files[0];
      picker.value = "";
      if (!file) return;
      say("正在压缩 " + file.name + " …", false, true);
      uploadPhotoFile(file).then(function (d) {
        commit(abs, d.path);
        markUpload(d.repo);
        /* 云端是"图片已进仓库、内容还没引用"；本机是"落到磁盘、发布时一起推"。
           两种情况都得点发布才上线，只是说法不一样，别让人以为云端白传了。 */
        show(d.path, "已上传 " + file.name,
          Math.round(file.size / 1024) + " KB → " + Math.round(d.bytes / 1024)
          + " KB · " + d.picW + "×" + d.picH
          + (CLOUD ? " · 已存入仓库 · 点「发布」后显示在网站上" : " · 点「发布」后上线"));
      }).catch(function (e) {
        say((e && e.message) || "上传失败", true, false);
      });
    });

    show(val);
  }

  /* 经历条目的 logo 上传：比照片那个多一个「两套主题一起预览」的小样。
     站点的深色主题会把 logo 反白、浅色主题保留原色，只看单张预览判断不了，
     所以左边给深底、右边给白底，一眼就能看出反白后还认不认得出来。 */
  function renderLogoPicker(wrap, abs, val, field) {
    var picker = document.createElement("input");
    picker.type = "file";
    picker.accept = "image/png,image/webp,image/svg+xml,image/*";
    picker.hidden = true;

    var box = document.createElement("div");
    box.className = "imgpick imgpick--logo";

    var pair = document.createElement("div");
    pair.className = "logopair";
    var cellDark = document.createElement("div");
    cellDark.className = "logopair__cell logopair__cell--dark";
    cellDark.title = "深色主题：自动反白";
    var cellLight = document.createElement("div");
    cellLight.className = "logopair__cell logopair__cell--light";
    cellLight.title = "浅色主题：保留原色";
    var a = document.createElement("img");
    var b = document.createElement("img");
    a.alt = "深色主题预览";
    b.alt = "";
    cellDark.appendChild(a);
    cellLight.appendChild(b);
    pair.appendChild(cellDark);
    pair.appendChild(cellLight);

    var side = document.createElement("div");
    side.className = "imgpick__side";
    var st = document.createElement("p");
    st.className = "imgpick__status";
    var mt = document.createElement("p");
    mt.className = "imgpick__meta";
    var acts = document.createElement("div");
    acts.className = "imgpick__acts";
    var pick = document.createElement("button");
    pick.type = "button";
    pick.className = "tbtn tbtn--sm";
    pick.textContent = "上传 logo";
    var rm = document.createElement("button");
    rm.type = "button";
    rm.className = "tbtn tbtn--sm";
    rm.textContent = "移除";
    acts.appendChild(pick);
    acts.appendChild(rm);
    side.appendChild(st);
    side.appendChild(mt);
    side.appendChild(acts);

    box.appendChild(pair);
    box.appendChild(side);
    box.appendChild(picker);
    wrap.appendChild(box);
    if (field.hint) wrap.appendChild(hintNode(field.hint));

    function repoOf(src) { return String(src || "").replace(/^\.\.\//, ""); }
    function say(text, bad, busy) {
      st.textContent = text;
      st.classList.toggle("is-bad", !!bad);
      box.classList.toggle("is-busy", !!busy);
      pick.disabled = !!busy;
    }
    function show(src, statusText, metaText) {
      var s = String(src || "");
      if (s) {
        a.src = s; b.src = s;
        pair.classList.remove("is-empty");
      } else {
        a.removeAttribute("src"); b.removeAttribute("src");
        pair.classList.add("is-empty");
      }
      var repo = repoOf(s);
      say(statusText || (s ? (isPending(repo) ? "已上传 · 待发布" : "已上传") : "还没上传 logo"), false, false);
      mt.textContent = metaText || (s ? repo + (isPending(repo) ? " · 点「发布」后上线" : "") : "PNG 透明底 · 内容高度 ≥ 128px");
      rm.disabled = !s;
      pick.textContent = s ? "替换 logo" : "上传 logo";
    }
    a.addEventListener("error", function () {
      pair.classList.add("is-empty");
      say("这张图加载不出来，路径可能失效了，建议重新上传", true, false);
    });

    pick.addEventListener("click", function () { picker.click(); });
    rm.addEventListener("click", function () {
      commit(abs, "");
      show("", "已移除，点「发布」后生效", "文件还留在 assets/img/logos/，需要的话可以手动删");
    });
    picker.addEventListener("change", function () {
      var file = picker.files && picker.files[0];
      picker.value = "";
      if (!file) return;
      say("正在裁边距并压缩 " + file.name + " …", false, true);
      uploadLogoFile(file).then(function (d) {
        commit(abs, d.path);
        markUpload(d.repo);
        show(d.path, "已上传 " + file.name,
          Math.round(file.size / 1024) + " KB → " + Math.round(d.bytes / 1024)
          + " KB · " + d.picW + "×" + d.picH
          + (CLOUD ? " · 已存入仓库 · 点「发布」后显示在网站上" : " · 点「发布」后上线"));
      }).catch(function (e) {
        say((e && e.message) || "上传失败", true, false);
      });
    });

    show(val);
  }

  function renderFields(host, fields, basePath) {
    fields.forEach(function (f) {
      renderField(host, f, basePath);
    });
  }

  function renderField(host, field, basePath) {
    var abs = basePath ? basePath + "." + field.path : field.path;
    var wrap = document.createElement("div");
    wrap.className = "field";

    if (field.type === "repeater") {
      var lab = document.createElement("div");
      lab.className = "field__label";
      lab.textContent = field.label;
      wrap.appendChild(lab);
      wrap.appendChild(renderRepeater(field, abs));
      if (field.hint) wrap.appendChild(hintNode(field.hint));
      host.appendChild(wrap);
      return;
    }

    var label = document.createElement("label");
    label.textContent = field.label;
    wrap.appendChild(label);

    var val = getPath(S.content, abs);

    /* 照片（影像页）：上传落成真实文件，内容里只存路径 */
    if (field.type === "photo") {
      renderPhotoPicker(wrap, abs, val, field);
      host.appendChild(wrap);
      return;
    }

    /* 经历条目的公司 logo：同样落成真实文件，但走 PNG 保留透明通道 */
    if (field.type === "logo") {
      renderLogoPicker(wrap, abs, val, field);
      host.appendChild(wrap);
      return;
    }

    /* 图片上传：选择 → 压缩成内嵌 data URL → 写入内容 → 预览即时生效。
       不需要额外确认步骤；发布后随 content.js 一起同步到仓库与本机。*/
    if (field.type === "image") {
      var picker = document.createElement("input");
      picker.type = "file";
      picker.accept = "image/*";
      picker.hidden = true;

      var box = document.createElement("div");
      box.className = "imgpick";

      var thumb = document.createElement("div");
      thumb.className = "imgpick__thumb";
      var pv = document.createElement("img");
      pv.alt = "人像预览";
      thumb.appendChild(pv);

      var side = document.createElement("div");
      side.className = "imgpick__side";
      var st = document.createElement("p");
      st.className = "imgpick__status";
      var mt = document.createElement("p");
      mt.className = "imgpick__meta";
      var acts = document.createElement("div");
      acts.className = "imgpick__acts";
      var pick = document.createElement("button");
      pick.type = "button";
      pick.className = "tbtn tbtn--sm";
      pick.textContent = "选择图片";
      var rm = document.createElement("button");
      rm.type = "button";
      rm.className = "tbtn tbtn--sm";
      rm.textContent = "移除";
      acts.appendChild(pick);
      acts.appendChild(rm);
      side.appendChild(st);
      side.appendChild(mt);
      side.appendChild(acts);
      box.appendChild(thumb);
      box.appendChild(side);
      box.appendChild(picker);
      wrap.appendChild(box);
      if (field.hint) wrap.appendChild(hintNode(field.hint));
      host.appendChild(wrap);

      function say(text, bad, busy) {
        st.textContent = text;
        st.classList.toggle("is-bad", !!bad);
        box.classList.toggle("is-busy", !!busy);
        pick.disabled = !!busy;
      }
      function show(src, statusText, metaText) {
        var s = String(src || "");
        if (s) {
          pv.src = s;
          thumb.classList.remove("is-empty");
        } else {
          pv.removeAttribute("src");
          thumb.classList.add("is-empty");
        }
        var embedded = s.indexOf("data:") === 0;
        say(statusText || (embedded ? "已上传图片"
          : s ? "当前使用外部图片路径" : "尚未设置人像"), false, false);
        mt.textContent = metaText || (embedded
          ? "已内嵌进内容文件，发布会一起同步" : s);
        rm.disabled = !s;
        pick.textContent = s ? "替换图片" : "选择图片";
      }
      pv.addEventListener("error", function () {
        thumb.classList.add("is-empty");
        say("当前路径的图片无法加载，建议上传一张新图", true, false);
      });

      pick.addEventListener("click", function () { picker.click(); });
      rm.addEventListener("click", function () {
        commit(abs, "");
        show("", "已移除，点「发布」后生效", "首屏会回到无图占位状态");
      });
      picker.addEventListener("change", function () {
        var file = picker.files && picker.files[0];
        picker.value = "";
        if (!file) return;
        if (!/^image\//.test(file.type)) {
          say("所选文件不是图片，请选择 JPG / PNG / WebP", true, false);
          return;
        }
        if (file.size > 12 * 1024 * 1024) {
          say("图片超过 12 MB，请压缩后再上传", true, false);
          return;
        }
        say("读取图片 …", false, true);
        var fr = new FileReader();
        fr.onerror = function () { say("读取失败，请重试", true, false); };
        fr.onload = function () {
          var im = new Image();
          im.onerror = function () { say("图片解码失败，请换一张", true, false); };
          im.onload = function () {
            say("正在压缩处理 …", false, true);
            setTimeout(function () {
              try {
                var data = compressPortrait(im);
                commit(abs, data);
                show(data, "已选择 " + file.name,
                  "原图 " + Math.round(file.size / 1024) + " KB → 压缩后 " +
                  Math.round(data.length / 1024) + " KB · 点「发布」后生效");
              } catch (e) {
                say("处理失败：" + (e && e.message ? e.message : e), true, false);
              }
            }, 30);
          };
          im.src = String(fr.result);
        };
        fr.readAsDataURL(file);
      });

      show(val);
      return;
    }

    if (field.type === "textarea") {
      var ta = document.createElement("textarea");
      ta.className = "inp";
      ta.rows = field.rows || 3;
      ta.value = val === undefined || val === null ? "" : String(val);
      ta.addEventListener("input", function () { commit(abs, ta.value); });
      wrap.appendChild(ta);
    } else if (field.type === "lines") {
      var ta2 = document.createElement("textarea");
      ta2.className = "inp";
      ta2.rows = Math.max(3, (val || []).length + 1);
      ta2.value = (val || []).join("\n");
      ta2.addEventListener("input", function () {
        var parts = ta2.value.split("\n").map(function (s) { return s; });
        while (parts.length && parts[parts.length - 1].trim() === "") parts.pop();
        commit(abs, parts);
      });
      wrap.appendChild(ta2);
    } else if (field.type === "select") {
      var sel = document.createElement("select");
      sel.className = "inp";
      (field.options || []).forEach(function (o) {
        var op = document.createElement("option");
        op.value = o.v;
        op.textContent = o.label;
        if (o.v === val) op.selected = true;
        sel.appendChild(op);
      });
      sel.addEventListener("change", function () { commit(abs, sel.value); });
      wrap.appendChild(sel);
    } else if (field.type === "color") {
      /* 取色器 + 十六进制输入；清空即恢复默认色 */
      var crow = document.createElement("div");
      crow.style.cssText = "display:flex;gap:8px;align-items:center";
      var swatch = document.createElement("input");
      swatch.type = "color";
      swatch.className = "inp";
      swatch.style.cssText = "width:46px;height:34px;padding:2px;flex:none;cursor:pointer";
      var hex = document.createElement("input");
      hex.type = "text";
      hex.className = "inp";
      hex.style.flex = "1";
      hex.placeholder = "留空 = 用默认色";
      hex.value = val || "";
      if (hasPlaceholder(hex.value)) hex.classList.add("is-ph");
      /* 未设置时把色块压暗，否则会误以为「已经是白色」 */
      function syncSwatch(v) {
        var empty = !/^#[0-9a-fA-F]{6}$/.test(v || "");
        swatch.value = empty ? "#ffffff" : v;
        swatch.style.opacity = empty ? "0.3" : "1";
        swatch.title = empty ? "未设置 · 沿用默认色" : v;
      }
      syncSwatch(hex.value);
      swatch.addEventListener("input", function () {
        hex.value = swatch.value;
        hex.classList.remove("is-ph");
        syncSwatch(swatch.value);
        commit(abs, swatch.value);
      });
      hex.addEventListener("input", function () {
        var v = hex.value.trim();
        hex.classList.toggle("is-ph", hasPlaceholder(v));
        syncSwatch(v);
        if (v === "") { commit(abs, ""); return; }
        if (/^#[0-9a-fA-F]{6}$/.test(v)) commit(abs, v);
      });
      crow.appendChild(swatch);
      crow.appendChild(hex);
      wrap.appendChild(crow);
    } else {
      var inp = document.createElement("input");
      inp.className = "inp";
      inp.type = "text";
      inp.value = val === undefined || val === null ? "" : String(val);
      if (hasPlaceholder(inp.value)) inp.classList.add("is-ph");
      inp.addEventListener("input", function () {
        inp.classList.toggle("is-ph", hasPlaceholder(inp.value));
        commit(abs, inp.value);
      });
      wrap.appendChild(inp);
    }

    if (field.hint) wrap.appendChild(hintNode(field.hint));
    host.appendChild(wrap);
  }

  function hintNode(text) {
    var h = document.createElement("p");
    h.className = "field__hint";
    h.textContent = text;
    return h;
  }

  function itemName(item, i) {
    var cand = ["title", "name", "q", "label", "role", "no"];
    for (var k = 0; k < cand.length; k++) {
      if (item && item[cand[k]]) return String(item[cand[k]]).slice(0, 22);
    }
    return "第 " + (i + 1) + " 项";
  }

  function renderRepeater(field, abs) {
    var box = document.createElement("div");
    box.className = "rep";
    var arr = getPath(S.content, abs) || [];

    /* 批量上传放在最上面：一次选十几张图，比一张张点「添加一项」再找图快得多 */
    if (field.batch) box.appendChild(batchUploader(field, abs));

    arr.forEach(function (item, i) {
      var node = document.createElement("div");
      node.className = "rep__item";

      var bar = document.createElement("div");
      bar.className = "rep__bar";

      var nm = document.createElement("span");
      nm.className = "rep__name";
      nm.textContent = (i + 1) + ". " + itemName(item, i);
      bar.appendChild(nm);

      bar.appendChild(repBtn("↑", "上移", function () {
        if (i === 0) return;
        var a = getPath(S.content, abs);
        var t = a[i - 1]; a[i - 1] = a[i]; a[i] = t;
        afterStructureChange();
      }));
      bar.appendChild(repBtn("↓", "下移", function () {
        var a = getPath(S.content, abs);
        if (i >= a.length - 1) return;
        var t = a[i + 1]; a[i + 1] = a[i]; a[i] = t;
        afterStructureChange();
      }));
      bar.appendChild(repBtn("✕", "删除", function () {
        var a = getPath(S.content, abs);
        a.splice(i, 1);
        afterStructureChange();
      }, true));

      node.appendChild(bar);

      var body = document.createElement("div");
      body.className = "rep__body";
      renderFields(body, field.fields || [], abs + "." + i);
      node.appendChild(body);

      box.appendChild(node);
    });

    var add = document.createElement("button");
    add.type = "button";
    add.className = "rep__add";
    add.textContent = "＋ 添加" + (field.itemLabel || "一项");
    add.addEventListener("click", function () {
      var a = getPath(S.content, abs);
      if (!Array.isArray(a)) { a = []; setPath(S.content, abs, a); }
      var blank = {};
      (field.fields || []).forEach(function (f) {
        if (f.type === "repeater") blank[f.path] = [];
        else if (f.type === "lines") blank[f.path] = [];
        else blank[f.path] = "";
      });
      a.push(blank);
      afterStructureChange();
    });
    box.appendChild(add);

    return box;
  }

  /* 批量上传：一次选多张 → 逐张压缩上传 → 每张追加一张卡片。
     串行而不是并发：十几张 4MB 的图同时压缩，浏览器很容易直接卡死；
     串行还能把「第几张」的进度显示出来。 */
  function batchUploader(field, abs) {
    var cfg = field.batch || {};
    var box = document.createElement("div");
    box.className = "rep__batch";

    var picker = document.createElement("input");
    picker.type = "file";
    picker.accept = "image/*";
    picker.multiple = true;
    picker.hidden = true;

    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "tbtn tbtn--sm";
    btn.textContent = "＋ " + (cfg.label || "批量上传");

    var st = document.createElement("p");
    st.className = "rep__batch-status";
    st.textContent = cfg.hint || "";

    box.appendChild(btn);
    box.appendChild(st);
    box.appendChild(picker);

    btn.addEventListener("click", function () { picker.click(); });

    picker.addEventListener("change", async function () {
      var files = Array.prototype.slice.call(picker.files || []);
      picker.value = "";
      if (!files.length) return;

      btn.disabled = true;
      var done = [], fails = [];
      for (var i = 0; i < files.length; i++) {
        st.textContent = "正在上传 " + (i + 1) + " / " + files.length + " · " + files[i].name;
        try {
          done.push({ up: await uploadPhotoFile(files[i]), name: files[i].name });
        } catch (e) {
          fails.push(files[i].name + "：" + ((e && e.message) || "失败"));
        }
      }
      btn.disabled = false;

      if (!done.length) {
        st.textContent = "全部失败 · " + fails.join(" / ");
        toast("上传失败，看看提示");
        return;
      }

      var a = getPath(S.content, abs);
      if (!Array.isArray(a)) { a = []; setPath(S.content, abs, a); }
      done.forEach(function (r) {
        a.push({
          src: r.up.path,
          // 标题先用文件名（去掉扩展名），总比一片空白强，用户可以再改
          title: String(r.name).replace(/\.[^.]+$/, ""),
          place: "",
          caption: "",
          alt: ""
        });
        markUpload(r.up.repo);
      });
      afterStructureChange();
      toast("已上传 " + done.length + " 张" + (fails.length ? "，" + fails.length + " 张失败" : "")
        + " · 记得点「发布」");
    });

    return box;
  }

  function repBtn(label, title, fn, danger) {    var b = document.createElement("button");
    b.type = "button";
    b.className = "rep__btn" + (danger ? " rep__btn--del" : "");
    b.title = title;
    b.setAttribute("aria-label", title);
    b.textContent = label;
    b.addEventListener("click", fn);
    return b;
  }

  /* ---------------- 提交与预览 ---------------- */
  function commit(abs, value) {
    snapshot();
    setPath(S.content, abs, value);
    markDirty();
    schedulePreview();
    schedulePersist();
  }

  function afterStructureChange() {
    snapshot();
    markDirty();
    renderTree();
    renderForm();
    schedulePreview(true);
    schedulePersist();
  }

  function markDirty() {
    S.dirty = true;
    setState("有未发布的修改", true);
  }

  function snapshot() {
    var now = Date.now();
    if (now - S.lastPush < 700) { S.lastPush = now; return; }
    S.lastPush = now;
    S.undo.push(JSON.stringify(S.content));
    if (S.undo.length > 40) S.undo.shift();
    var u = $("#undo");
    if (u) u.disabled = false;
  }

  var previewTimer, persistTimer;
  function schedulePreview(structural) {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(function () { pushPreview(structural); }, 140);
  }
  function schedulePersist() {
    clearTimeout(persistTimer);
    persistTimer = setTimeout(function () {
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify(S.content));
        setState("草稿已存本地 · 未发布", true);
      } catch (e) {
        setState("本地存储不可用", true);
      }
    }, 600);
  }

  function currentGroup() {
    return SCHEMA.filter(function (g) { return g.id === S.groupId; })[0] || null;
  }

  /* ---------------- 发布态预览 ----------------
     预览区默认吃的是 localStorage 草稿，所以「发布失败」在本机是看不出来的：
     页面照样显示新样式。这个开关让 iframe 用 ?file=1 打开，只认 content.js，
     看到的就是别人（或换一台设备）打开时真正会看到的东西。 */
  function previewSrc(page) {
    var s = page === "home" ? "index.html" : page + ".html";
    return S.pubView ? s + "?file=1" : s;
  }

  function setPubView(on) {
    S.pubView = !!on;
    var b = $("#pub-view");
    if (b) {
      b.classList.toggle("is-on", S.pubView);
      b.setAttribute("aria-pressed", String(S.pubView));
    }
    var hint = $("#preview-hint");
    if (hint) hint.textContent = S.pubView ? "发布态 · 只读" : "实时";
    var iframe = $("#preview");
    if (iframe) iframe.setAttribute("src", previewSrc(S.previewPage || "home"));
  }

  function pushPreview(structural) {
    var iframe = $("#preview");
    if (!iframe) return;
    /* 发布态是只读核对，不要再把草稿灌进去 */
    if (S.pubView) { fit(); return; }
    var g = currentGroup();
    var section = g && g.section ? g.section : null;

    try {
      var w = iframe.contentWindow;
      if (w && w.V2 && w.V2.applyContent) {
        var patched = w.V2.applyContent(S.content, { section: structural === true ? null : section });
        fit();
        setPreviewHint(patched);
        return;
      }
    } catch (e) {}

    iframe.contentWindow.postMessage(
      { __v2: true, type: "set-content", content: S.content, section: section },
      "*"
    );
  }

  /* ---------------- 预览尺寸 ---------------- */
  /* 用固定设备视口（不是内容高度）：页面里有 92svh 这类视口单位，
     若用 scrollHeight 反推高度会形成“越量越高”的反馈循环。 */
  var DEVICE = {
    1440: { w: 1440, h: 900 },
    834: { w: 834, h: 1000 },
    390: { w: 390, h: 844 }
  };

  function fit() {
    var iframe = $("#preview");
    var frame = $("#frame");
    var stage = $("#stage");
    if (!iframe || !frame || !stage) return;
    var dev = DEVICE[S.device] || DEVICE[1440];
    iframe.style.width = dev.w + "px";
    iframe.style.height = dev.h + "px";
    var avail = stage.clientWidth - 32;
    var s = Math.min(1, avail / dev.w);
    iframe.style.transform = "scale(" + s.toFixed(3) + ")";
    frame.style.width = Math.round(dev.w * s) + "px";
    frame.style.height = Math.round(dev.h * s) + "px";
  }

  function setPreviewHint(patched) {
    var h = $("#preview-hint");
    if (!h) return;
    var mode = patched === true ? "局部更新该区块" : "整页更新";
    if (patched === undefined) mode = "实时";
    h.textContent = S.device + "px · " + mode;
  }

  /* ---------------- 页面切换 ---------------- */
  function switchTab(tab) {
    S.tab = tab;
    $$("#tabs button").forEach(function (b) {
      b.classList.toggle("is-on", b.dataset.pageTab === tab);
    });
    var list = groupsOf(tab);
    S.groupId = list.length ? list[0].id : null;
    renderTree();
    renderForm();

    if (tab !== "site") {
      var src = previewSrc(tab);
      var iframe = $("#preview");
      if (iframe.getAttribute("src") !== src) {
        iframe.setAttribute("src", src);
      }
      S.previewPage = tab;
    }
    var label = $("#preview-page");
    if (label) {
      var map = { home: "首页", links: "资源库", gallery: "影像", legal: "法务", "404": "404", site: "全站（沿用当前页）" };
      label.textContent = map[S.previewPage || "home"] || "预览";
    }
  }

  function selectGroup(id) {
    S.groupId = id;
    $$(".tree__item").forEach(function (b) {
      b.classList.toggle("is-on", b.dataset.group === id);
    });
    renderForm();
    var g = currentGroup();
    pushPreview(false);
    var pane = $("#formpane");
    if (pane) pane.scrollTop = 0;
    if (g && g.section) {
      // 编辑区与预览对齐
      try {
        var doc = $("#preview").contentDocument;
        var el = doc.querySelector('[data-sec="' + g.section + '"]');
        if (el) el.scrollIntoView({ block: "start", behavior: "smooth" });
      } catch (e) {}
    }
  }

  /* ---------------- 导出 / 导入 / 保存 ---------------- */
  function fileText(content) {
    return "/* ============================================================\n" +
      "   CONTENT.JS — v2 的唯一文案来源（由控制台导出）\n" +
      "   导出时间：" + new Date().toLocaleString("zh-CN") + "\n" +
      "   ============================================================ */\n" +
      "window.V2_CONTENT = " + JSON.stringify(content, null, 2) + ";\n";
  }

  function download(name, text) {
    var blob = new Blob([text], { type: "text/javascript;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
  }

  var fileHandle = null;
  async function saveToFile() {
    if (pruneStyles()) renderForm();
    var text = fileText(S.content);
    if (window.showSaveFilePicker) {
      try {
        if (!fileHandle) {
          fileHandle = await window.showSaveFilePicker({
            suggestedName: "content.js",
            types: [{ description: "JavaScript", accept: { "text/javascript": [".js"] } }]
          });
        }
        var w = await fileHandle.createWritable();
        await w.write(text);
        await w.close();
        S.dirty = false;
        setState("已写入 content.js", false);
        toast("已保存到 data/content.js");
        return;
      } catch (err) {
        if (err && err.name === "AbortError") return;
      }
    }
    download("content.js", text);
    toast("浏览器不支持直接写文件，已改为下载");
  }

  function parseImport(text) {
    var t = text.trim();
    var jsonStart = t.indexOf("{");
    var jsonEnd = t.lastIndexOf("}");
    if (jsonStart === -1 || jsonEnd === -1) throw new Error("找不到内容对象");
    var body = t.slice(jsonStart, jsonEnd + 1);
    return JSON.parse(body);
  }


  /* ---------------- 发布到 GitHub ---------------- */
  var GH = {
    repo: "yangtongxueruc/personal-site",
    branch: "main",
    /* Token 存在 sessionStorage：只在本标签页会话内有效，关掉就没了。
       以前放 localStorage，公开 origin 下同源脚本随时能读；真被注入一行
       脚本，长期有效的 PAT 就直接落到对方手里。 */
    tokenKey: "v2:publish:token",
    /* feed.html（动态归档页）也要在里面：它同样引 render.js，
       漏了它那页的 ?v= 会一直停在本机某次的值，浏览器就一直吃旧缓存 */
    pages: ["v2/index.html", "v2/links.html", "v2/gallery.html", "v2/legal.html",
            "v2/404.html", "v2/studio.html", "v2/feed.html"],
      api: "https://api.github.com",
      proxy: null,
      proxyTried: false
    };

    /* ---------------- 运行模式 ----------------
       本机模式：控制台由 publish_server.py 供给，能读写本机磁盘 —— 图片落盘、
       相册订阅写 data/sources.json、公众号文章由服务端抓。功能完整。
       云端模式：控制台托管在 GitHub Pages 上，手里只有一个浏览器。所有写入
       一律走 GitHub API，依赖本地服务的能力降级并**明确提示**，绝不假装成功。
       判定靠探测本地服务，不靠 URL 白名单：从 file:// 或别的端口打开也一致。 */
    var CLOUD = false;

    /* 云端模式要跨刷新、跨标签页记住 token，否则每次打开都要粘一遍长串。
       存 localStorage 的风险面是同源脚本可读；控制台不引任何外部脚本、
       也不用 innerHTML 拼接用户输入，origin 上只有本站自己的静态文件。
       本机模式仍然只放 sessionStorage —— 那里有本地服务兜底，不需要持久。 */
    var TOKEN_PERSIST_KEY = "v2:token:persist";
    var TOKEN_TIP_KEY = "v2:token:tipped";

    function savedToken() {
      try {
        return sessionStorage.getItem(GH.tokenKey)
          || localStorage.getItem(TOKEN_PERSIST_KEY) || "";
      } catch (e) { return ""; }
    }

    function rememberToken(t, persist) {
      if (!t) return;
      try {
        sessionStorage.setItem(GH.tokenKey, t);
        if (persist) localStorage.setItem(TOKEN_PERSIST_KEY, t);
        else localStorage.removeItem(TOKEN_PERSIST_KEY);
      } catch (e) {}
    }

  /* 各页「原生」标题：auto 时回填 <title>，同时也是社交分享的 og:title。
     必须与 publish_server.py 的 DEFAULT_TITLES 逐字一致 —— 两条发布通道
     （本地 __sync / 浏览器直连 API）改的是同一批 HTML，值不同就会来回打架。
     不写人名：以前写死「陈屿」，站点换了身份后 og:title 一直没同步，
     分享卡片会显示过时名字。纯页面主题不会过期。*/
  var PAGE_TITLES = {
    "v2/index.html": "校园招聘 · 量化与工程方向",
    "v2/links.html": "资源库 · 量化比赛与练习平台",
    "v2/gallery.html": "影像 · 校招现场与日常",
    "v2/legal.html": "隐私说明与使用条款",
    "v2/404.html": "页面不存在",
    "v2/feed.html": "全部动态 · 归档"
  };
  /* 控制台自己的标签页标题不参与统一改写，多开几个标签时才能分清哪个是控制台 */
  var TITLE_SKIP = { "v2/studio.html": true };
  var ZWSP = "\u200b";
  var TITLE_RE = /<title>[\s\S]*?<\/title>/;
  var OG_TITLE_RE = /(<meta\s+property="og:title"\s+content=")([^"]*)(")/;

  /* 标题的三态取值。返回 null = 别动这一页的 title。
     "" 的语义是「标签上不显示文字」，但直接赋空串浏览器会把标签换成网址，
     所以用零宽空格占位 —— 看不见，但确实有一个字。*/
  function tabTitleOf(meta) {
    if (!meta || !Object.prototype.hasOwnProperty.call(meta, "siteTitle")) return null;
    var raw = String(meta.siteTitle == null ? "" : meta.siteTitle).trim();
    if (raw === "auto") return "\x00auto";
    return raw;
  }
  function resolveTitle(tab, page, fallback) {
    if (tab === "\x00auto") return PAGE_TITLES[page] || fallback;
    return tab || ZWSP;
  }
  /* 标签留空用零宽空格，分享卡片却必须有一句能读的标题 —— 留空时回退到页面主题。 */
  function resolveOgTitle(tab, page, fallback) {
    if (tab === "\x00auto") return PAGE_TITLES[page] || fallback;
    return tab || PAGE_TITLES[page] || fallback;
  }
  function ogTitleOf(text) {
    var m = String(text).match(OG_TITLE_RE);
    return m ? m[2] : "";
  }
  function escapeTitle(s) {
    return String(s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function b64encode(str) {
    var bytes = new TextEncoder().encode(str);
    var bin = "";
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }
  function b64decode(str) {
    var bin = atob(String(str).replace(/\s/g, ""));
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  /* ---- 通道选择 ----
     浏览器直连 api.github.com 在部分网络 / 预览面板 / Webview 里会被拦，
     表现为 fetch 抛 "Failed to fetch"（网络层，与 Token 无关）。
     优先探测本地发布服务 publish_server.py，由 Python 进程转发请求。*/
  function fetchWithTimeout(url, opts, ms) {
    var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, ms || 30000) : null;
    if (ctrl) opts.signal = ctrl.signal;
    return fetch(url, opts).then(function (r) {
      if (timer) clearTimeout(timer);
      return r;
    }, function (e) {
      if (timer) clearTimeout(timer);
      throw e;
    });
  }

  function proxyCandidates() {
    var list = [];
    try {
      var custom = new URLSearchParams(location.search).get("ghproxy");
      if (custom) list.push(custom.replace(/\/+$/, ""));
    } catch (e) {}
    if (location.protocol === "http:" || location.protocol === "https:") {
      list.push(location.origin + "/__gh");
    }
    list.push("http://127.0.0.1:8899/__gh");
    return list.filter(function (x, i, a) { return a.indexOf(x) === i; });
  }

    function updateChannelUI() {
      var el = $("#pub-chan");
      var txt = $("#pub-chan-txt");
      if (!el || !txt) return;
      var short = GH.proxy ? GH.proxy.replace(/^https?:\/\//, "").replace(/\/__gh$/, "") : "";
      if (CLOUD) {
        txt.textContent = "云端模式 · 直连 api.github.com · 发布后由 GitHub Actions 自动上线";
      } else {
        txt.textContent = GH.proxy
          ? "本地通道 " + short + " · 由 Python 转发，不依赖浏览器直连"
          : "直连 api.github.com · 若报 Failed to fetch 请启动本地发布服务";
      }
      el.classList.toggle("is-local", !!GH.proxy);
      el.classList.toggle("is-cloud", CLOUD);
    }

    async function detectProxy(force) {
      if (GH.proxyTried && !force) return GH.proxy;
      GH.proxyTried = true;
      GH.proxy = null;
      var txt = $("#pub-chan-txt");
      if (txt) txt.textContent = "正在检测发布通道 …";
      var cands = proxyCandidates();
      for (var i = 0; i < cands.length; i++) {
        try {
          var r = await fetchWithTimeout(cands[i] + "/ping", { method: "GET", cache: "no-store" }, 1600);
          if (r.ok) {
            var j = await r.json();
            if (j && j.ok && j.service === "v2-publish-proxy") { GH.proxy = cands[i]; break; }
          }
        } catch (e) {}
      }
      /* 探测不到本地服务就是云端模式：不是错误，是另一种运行环境。
         必须在 updateChannelUI 之前赋值，否则顶栏文案会慢一拍。 */
      CLOUD = !GH.proxy;
      updateChannelUI();
      return GH.proxy;
    }

  function apiHint(status, msg) {
    var hint = {
      401: "Token 无效或已过期",
      403: "Token 没有这个仓库的写权限，或触发了速率限制",
      404: "仓库或分支不存在，或 Token 未授权该仓库",
      409: "分支状态已变动，请重试",
      422: "提交被拒绝，通常是分支刚被更新，重试一次"
    }[status] || "GitHub API 请求失败";
    return hint + "（" + status + (msg ? " " + msg : "") + "）";
  }

  function explainErr(err) {
    var msg = err && err.message ? err.message : String(err);
    var net = /Failed to fetch|NetworkError|Load failed|Network request failed|fetch failed/i.test(msg)
      || (err && (err.name === "TypeError" || err.name === "AbortError"));
    if (!net) return msg;
    if (CLOUD) {
      return "连不上 GitHub API（浏览器网络层失败）：" + msg + "\n"
        + "这与 Token 是否正确无关。常见原因：所在网络屏蔽了 api.github.com、"
        + "浏览器插件或公司代理拦截、需要先在代理里认证。\n"
        + "换成手机热点或别的网络再试一次。";
    }
    return "连不上 GitHub API（浏览器网络层失败）：" + msg + "\n"
      + "这与 Token 是否正确无关。常见原因：本机 / 公司网络直连 api.github.com 不通、"
      + "预览面板或 Webview 拦截外部请求、代理证书不被浏览器信任。\n"
      + "解决办法：终端执行 python3 v2/publish_server.py，"
      + "再打开 http://127.0.0.1:8899/v2/studio.html，控制台会自动切到本地通道。";
  }

  async function gh(token, method, path, body) {
    var res, status, data;
    if (GH.proxy) {
      await csrf();
      res = await fetchWithTimeout(GH.proxy, {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ method: method, path: path, body: body || null, token: token })
      }, 45000);
      var out = await res.json();
      if (!res.ok) throw new Error(apiHint(res.status, out && out.error));
      status = out.status;
      data = out.data;
      if (out.ok === false) throw new Error(apiHint(status, out.error));
    } else {
      res = await fetchWithTimeout(GH.api + path, {
        method: method,
        headers: {
          Authorization: "Bearer " + token,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json"
        },
        body: body ? JSON.stringify(body) : undefined
      }, 45000);
      status = res.status;
      if (status === 204) return {};
      try { data = await res.json(); } catch (e) { data = {}; }
      if (!res.ok) throw new Error(apiHint(status, data && data.message));
    }
    return data;
  }

  async function ghReadFile(token, path) {
    var data = await gh(token, "GET", "/repos/" + GH.repo + "/contents/" + path + "?ref=" + GH.branch);
    return b64decode(data.content);
  }

  /* 读文件的同时把 sha 带出来。Contents API 写回必须带 sha：不带等于
     「我不管现在是什么，直接盖掉」，两个人同时改就会静默丢一份。
     加个随机查询串是为了绕过 GitHub 给 contents 接口的分钟级缓存 ——
     不绕的话，刚写完立刻读回来还是旧的，轮询永远看不到结果。 */
  async function ghReadText(token, path) {
    var data = await gh(token, "GET",
      "/repos/" + GH.repo + "/contents/" + path
      + "?ref=" + GH.branch + "&_=" + Date.now());
    return { text: b64decode(data.content), sha: data.sha };
  }

  async function ghWriteText(token, path, text, message, sha) {
    return gh(token, "PUT", "/repos/" + GH.repo + "/contents/" + path, {
      message: message,
      content: b64encode(text),
      branch: GH.branch,
      sha: sha
    });
  }

  /* ---------------- 待办队列（云端） ----------------
     浏览器没有服务端身份，抓不了 mp.weixin.qq.com（响应没有 CORS 头，
     换任何令牌都没用）。所以「加一篇文章 / 订阅一个合集」在网页上只能
     写成一条意图，放进 data/inbox.json；真正去抓的是 GitHub Actions
     （scripts/inbox.py），它有出网能力，也已经验证过能通微信短链。
     这条队列是两边唯一的接口，格式必须和 inbox.py 读的一致。 */
  var INBOX_PATH = "data/inbox.json";
  var INBOX_KEEP = 30;

  function inboxTask(kind, url, extra) {
    var t = {
      id: "t" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      kind: kind,
      url: url,
      status: "pending",
      at: new Date().toISOString(),
      result: "",
      error: ""
    };
    if (extra) {
      for (var k in extra) {
        if (Object.prototype.hasOwnProperty.call(extra, k)) t[k] = extra[k];
      }
    }
    return t;
  }

  /* 合集分享链接里一定有 album_id，文章链接一定没有 —— 纯字符串判断，
     不需要联网。用户粘什么就按什么处理，不用先问他这是哪一种。 */
  function wechatKindOf(url) {
    return /[?&#]album_id=\d{6,}/.test(url) ? "album" : "article";
  }

  async function submitInbox(token, task) {
    var lastErr = null;
    for (var attempt = 0; attempt < 3; attempt++) {
      var f = await ghReadText(token, INBOX_PATH);
      var doc;
      try { doc = JSON.parse(f.text); } catch (e) { doc = {}; }
      var tasks = (doc.tasks || []).slice();
      tasks.push(task);
      // 待处理的全留，已完结的只留最近 30 条：这份文件每加一条就要整份重写，
      // 无限增长会让每次提交越来越慢，而回看价值只在最近几条。
      var pending = tasks.filter(function (t) { return t.status === "pending"; });
      var done = tasks.filter(function (t) { return t.status !== "pending"; });
      doc.tasks = pending.concat(done.slice(-INBOX_KEEP));
      doc.updated_at = new Date().toISOString();
      try {
        await ghWriteText(token, INBOX_PATH, JSON.stringify(doc, null, 2) + "\n",
          (task.kind === "album" ? "inbox: 订阅合集" : "inbox: 加一篇文章")
          + "（" + task.url.slice(0, 60) + "）", f.sha);
        return;
      } catch (e) {
        // 409 只是「期间有人改过这个文件」，重读一次再写就行，不该弹给用户看
        lastErr = e;
      }
    }
    throw lastErr || new Error("写入待办队列失败");
  }

  async function readInbox(token) {
    try {
      var f = await ghReadText(token, INBOX_PATH);
      return JSON.parse(f.text);
    } catch (e) {
      return null;
    }
  }

  /* 等后台把这条任务处理完。间隔是递进的：Actions 排队 + checkout 通常
     20-40 秒，一开始就密集轮询只是白花请求。总共约 90 秒，超过就交给
     「稍后回来看」—— 结果会留在队列文件里，不会被丢掉。 */
  var INBOX_POLL = [4000, 5000, 7000, 9000, 11000, 13000, 15000, 15000];

  async function waitInbox(token, id, onTick) {
    for (var i = 0; i < INBOX_POLL.length; i++) {
      await new Promise(function (r) { setTimeout(r, INBOX_POLL[i]); });
      if (onTick) onTick(i);
      var doc = await readInbox(token);
      var hit = ((doc && doc.tasks) || []).filter(function (t) { return t.id === id; })[0];
      if (hit && hit.status !== "pending") return hit;
    }
    return null;
  }

  /* 发布只写回 GitHub 仓库，不会自动改本机磁盘。
     本地发布服务在跑时，把 content.js 与 6 个页面的 ?v=N 写回本机。
     这一步与「发布走哪条通道」无关：直连发布同样要尝试同步，
     否则从预览面板 / file:// 打开时本机文件会一直落后。*/
  function localSyncUrls() {
    var list = [];
    try {
      var custom = new URLSearchParams(location.search).get("ghproxy");
      if (custom) list.push(custom.replace(/\/+$/, "").replace(/\/__gh$/, "") + "/__sync");
    } catch (e) {}
    if (location.protocol === "http:" || location.protocol === "https:") list.push("/__sync");
    list.push("http://127.0.0.1:8899/__sync");
    return list.filter(function (x, i, a) { return a.indexOf(x) === i; });
  }

  async function syncLocal(contentText, v) {
    var urls = localSyncUrls();
    try { await csrf(); } catch (e) { return false; }
    for (var i = 0; i < urls.length; i++) {
      try {
        var r = await fetchWithTimeout(urls[i], {
          method: "POST",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ version: v, contentText: contentText })
        }, 5000);
        if (!r.ok) continue;
        var j = await r.json();
        if (j && j.ok) return true;
      } catch (e) {}
    }
    return false;
  }

    /* content.js 是 "window.V2_CONTENT = {...};" 包着的 JSON。
       只切片再 JSON.parse，不用 eval / new Function —— 产物页带 CSP，
       求值会被拦，而且对仓库内容求值本身也不该做。 */
    function parseContentJs(text) {
      var i = text.indexOf("window.V2_CONTENT");
      if (i < 0) throw new Error("远程文件不是 content.js 格式");
      var j = text.indexOf("=", i);
      if (j < 0) throw new Error("远程 content.js 缺少赋值");
      var body = text.slice(j + 1).trim();
      if (body.slice(-1) === ";") body = body.slice(0, -1).trim();
      try {
        return JSON.parse(body);
      } catch (e) {
        throw new Error("远程 content.js 解析失败：" + (e && e.message ? e.message : e));
      }
    }

    function versionOf(text) {
      var m = String(text).match(/"version"\s*:\s*(\d+)/);
      return m ? parseInt(m[1], 10) : 0;
    }

    /* 手动兜底：把 GitHub 上最新的 content.js 拉回**当前编辑器**。
       本机模式写磁盘；云端模式没有磁盘，直接换掉内存里的内容并重绘。
       两种情况对用户的意义一样：让编辑器停在仓库最新版，别拿旧内容去发布。 */
    async function syncFromGithub() {
      var token = savedToken();
      if (!token) {
        try { token = (window.prompt("输入 GitHub Token（只用于读写你自己的私有仓库，不会写进仓库）") || "").trim(); }
        catch (e) { token = ""; }
        if (!token) { toast("已取消：需要 Token 才能读取私有仓库"); return; }
        rememberToken(token, true);
      }
      setState("正在从 GitHub 同步 …", false);
      try {
        await detectProxy(true);
        var text = await ghReadFile(token, "v2/data/content.js");
        var v = versionOf(text);
        if (!v) throw new Error("远程版本号解析失败");

        if (CLOUD) {
          var remote = parseContentJs(text);
          if (!remote || !remote.pages || !remote.pages.home) {
            throw new Error("远程内容结构不完整，已放弃载入");
          }
          S.content = remote;
          S.dirty = false;
          try { localStorage.setItem(DRAFT_KEY, JSON.stringify(remote)); } catch (e) {}
          renderTree();
          renderForm();
          pushPreview(true);
          setState("已载入仓库 v" + v, false);
          toast("已载入仓库最新版 v" + v + "。本地未发布的改动已被覆盖。");
          return;
        }

        var ok = await syncLocal(text, v);
        if (!ok) {
          setState("本机未同步 · 需要本地服务", true);
          toast("未找到本地发布服务：终端运行 python3 v2/publish_server.py 后重试");
          return;
        }
        setState("本机已同步 v" + v + " · 刷新可载入", false);
        toast("本机文件已更新到 v" + v + "，刷新页面即可看到");
      } catch (err) {
        setState("本机同步失败", true);
        toast(explainErr(err).split("\n")[0]);
      }
    }

  function pubBusy(busy) {
    var go = $("#pub-go");
    if (go) {
      go.disabled = busy;
      go.textContent = busy ? "发布中…" : "发布";
    }
    var cancel = $("#pub-cancel");
    if (cancel) cancel.disabled = busy;
  }
  function pubStep(text) { var el = $("#pub-step"); if (el) el.textContent = text || ""; }
  function pubErr(text) { var el = $("#pub-err"); if (el) el.textContent = text || ""; }

  function openPub() {
    var cur = S.content.version || 1;
    var ver = $("#pub-ver");
    if (ver) ver.textContent = "v" + cur + " → v" + (cur + 1);
    var input = $("#pub-token");
    if (input) input.value = savedToken();
    pubErr("");
    pubStep("");
    pubBusy(false);
    detectProxy();  // 异步探测，不阻塞弹层
    $("#pub").hidden = false;
    setTimeout(function () { if (input) input.focus(); }, 30);
  }
  function closePub() { $("#pub").hidden = true; }

  /* ---------------- 排版总览 ----------------
     一张表把 6 个类别列出来，改一行 = 全站同类一起变。
     数据由预览端扫描实际 DOM 得出（字号是量出来的，不是猜的），
     所以「同类不一致」这件事会直接标红，不用自己一格格比对。 */
  var typeRows = [];
  var guideShown = false;

  function previewWin() {
    var f = $("#preview");
    try { return f && f.contentWindow; } catch (e) { return null; }
  }
  function requestReport() {
    var w = previewWin();
    if (!w) return;
    try { w.postMessage({ __v2: true, type: "type-request" }, "*"); } catch (e) {}
  }
  function openType() {
    $("#type").hidden = false;
    $("#ty-rows").innerHTML = '<div class="ty__empty">正在读取当前页的排版 …</div>';
    requestReport();
    sendGuides(guideShown);
  }
  function closeType() {
    $("#type").hidden = true;
    sendGuides(false);
  }
  function sendGuides(on) {
    var w = previewWin();
    if (!w) return;
    try { w.postMessage({ __v2: true, type: "guides", on: !!on }, "*"); } catch (e) {}
  }

  function weightOptions(cur) {
    return [400, 500, 600, 700].map(function (w) {
      var name = { 400: "常规", 500: "中", 600: "半粗", 700: "粗" }[w];
      return '<option value="' + w + '"' + (w === cur ? " selected" : "") + ">" + w + " " + name + "</option>";
    }).join("");
  }
  function alignOptions(cur) {
    return [["", "默认"], ["left", "左"], ["center", "中"], ["right", "右"], ["justify", "两端"]]
      .map(function (p) {
        return '<option value="' + p[0] + '"' + (p[0] === String(cur || "") ? " selected" : "") + ">" + p[1] + "</option>";
      }).join("");
  }
  function wrapOptions(cur) {
    return [["", "自动"], ["nowrap", "不折行"], ["balance", "平衡"]]
      .map(function (p) {
        return '<option value="' + p[0] + '"' + (p[0] === String(cur || "") ? " selected" : "") + ">" + p[1] + "</option>";
      }).join("");
  }
  /* 分布可能很长（辅助信息有十几种宽度），列里放不下就只报前几个 */
  function compactBadge(sizes, widths, wBad) {
    var cut = function (a, n) { return a.slice(0, n).join("/") + (a.length > n ? "…" : ""); };
    return "≠ " + cut(sizes, 4) + (wBad ? " · 宽 " + cut(widths, 3) : "");
  }
  function rowHtml(r) {
    var bad = r.sizes.length > 1 || !!r.widthBad;
    var badge = bad ? compactBadge(r.sizes || [], r.widths || [], !!r.widthBad) : "";
    return '<div class="ty__row' + (bad ? " is-bad" : "") + '" data-role="' + r.role + '">' +
      '<span class="ty__lab"><b>' + r.label + "</b><i>" + r.role + "</i>" +
        '<em class="ty__sizes" title="' + r.sizes.join("/") + (r.widthBad ? " · " + r.widths.join("/") : "") + '">' + badge + "</em></span>" +
      '<span class="ty__cnt">' + r.count + " 处</span>" +
      '<span class="ty__cell"><input type="number" data-k="size" min="12" max="96" step="1" value="' + r.size + '"><i>px</i></span>' +
      '<span class="ty__cell"><input type="number" data-k="lh" min="16" max="140" step="1" value="' +
        Math.round(r.lh * r.size) + '"><i>px</i></span>' +
      '<span class="ty__cell"><input type="number" data-k="mb" min="0" max="80" step="2" value="' + r.mb + '"><i>px</i></span>' +
      '<span class="ty__cell"><input type="number" data-k="w" min="0" max="1600" step="4" value="' +
        (r.w === "full" ? "" : (r.w || r.wNow)) + '" placeholder="' + r.wNow + '"><i>px</i></span>' +
      '<span class="ty__cell"><select data-k="align" title="文字框内的水平对齐">' + alignOptions(r.align) + "</select></span>" +
      '<span class="ty__cell"><select data-k="wrap" title="自动：按宽度折行；不折行：保留手动换行、每行内部不再折行；平衡：折行但各行更均匀">' + wrapOptions(r.wrap) + "</select></span>" +
      '<span class="ty__cell"><select data-k="weight">' + weightOptions(r.weight) + "</select></span>" +
      '<button class="ty__reset" type="button" data-k="reset" title="清除这一类别的统一设置">↺</button>' +
      "</div>";
  }
  function renderTypeRows(rows) {
    typeRows = rows || [];
    var box = $("#ty-rows");
    if (!box) return;
    if (!typeRows.length) {
      box.innerHTML = '<div class="ty__empty">这一页没有可调整的文字块。切到「首页」再打开。</div>';
      return;
    }
    /* 正在某一格里输入时不要重建 DOM，否则光标会被踢掉 */
    var focused = box.contains(document.activeElement);
    if (!box.querySelector(".ty__row") || !focused) {
      box.innerHTML = typeRows.map(rowHtml).join("");
    }
    typeRows.forEach(function (r) {
      var el = box.querySelector('.ty__row[data-role="' + r.role + '"]');
      if (!el) return;
      var wBad = !!r.widthBad;
      var bad = r.sizes.length > 1 || wBad;
      el.classList.toggle("is-bad", bad);
      var s = el.querySelector(".ty__sizes");
      if (s) {
        s.textContent = bad ? compactBadge(r.sizes || [], r.widths || [], wBad) : "";
        s.title = r.sizes.join("/") + (wBad ? " · " + r.widths.join("/") : "");
      }
    });
  }
  function sendRoleEdit(role, patch, reset) {
    var w = previewWin();
    if (!w) { toast("预览还没加载好"); return; }
    w.postMessage({ __v2: true, type: "role-edit", role: role, patch: patch || {}, reset: !!reset }, "*");
  }

  /* 发布前清理失效样式。
     片段用「原文」当 key，文案一改这条就永远匹配不上了，却会一直留在
     content.js 里；下次选到同一段旧文字时又冒出来，看起来就像"样式自己变了"。
     pruneStyles 是纯数据判断（文字是否还在正文里、块名前缀是否合法），
     跟当前预览停在哪一页无关，所以从 iframe 里借一下就行。 */
  function pruneStyles() {
    var n = 0;
    try {
      var w = $("#preview").contentWindow;
      if (w && w.V2 && w.V2.pruneStyles) {
        var r = w.V2.pruneStyles(S.content);
        n = (r.blocks || 0) + (r.runs || 0);
      }
    } catch (e) {}
    return n;
  }

  /* 数据文件里记录的抓取时间。用来判断「谁更新」，ISO 字符串直接比大小即可。*/
  function feedStamp(text) {
    var m = /"generated_at"\s*:\s*"([^"]+)"/.exec(text || "");
    return m ? m[1] : "";
  }
  /* sources.json 的版本戳。控制台和本地服务写它时会带上 updated_at，
     用来判断「另一台设备是不是刚改过订阅」——没有这个字段就当空串，
     退回原来「本机优先」的行为，不会把老文件挡下来。 */
  function sourcesStamp(text) {
    var m = /"updated_at"\s*:\s*"([^"]+)"/.exec(text || "");
    return m ? m[1] : "";
  }

  async function publish() {
      var input = $("#pub-token");
      var token = ((input && input.value) || "").trim() || savedToken();
      if (!token) { pubErr("先填写 Personal Access Token"); return; }
      /* 云端模式记住 token（换设备只需粘一次）；本机模式仍只留在会话里。 */
      rememberToken(token, CLOUD);

    pubBusy(true);
    pubErr("");
    var pruned = pruneStyles();
    if (pruned) renderForm();

    var next = clone(S.content);
    next.version = (S.content.version || 0) + 1;
    next.updatedAt = new Date().toISOString().slice(0, 10);
    var v = next.version;

    try {
      pubStep("检测发布通道 …");
      await detectProxy(true);
      /* 多设备护栏：本机版本落后于仓库时拒绝发布，避免旧内容覆盖别台设备的改动。
         发布总是基于远程最新 head 提交，Git 不会产生冲突，覆盖会是静默的。*/
      pubStep("检查仓库版本 …");
      var remoteFile = await gh(token, "GET",
        "/repos/" + GH.repo + "/contents/v2/data/content.js?ref=" + GH.branch);
      var remoteText = b64decode(remoteFile.content);
      var rm = remoteText.match(/"version"\s*:\s*(\d+)/);
      var remoteV = rm ? parseInt(rm[1], 10) : 0;
      var localV = S.content.version || 0;
      if (remoteV > localV) {
        throw new Error("仓库已经是 v" + remoteV + "，本机还是 v" + localV + "。\n"
          + "为避免覆盖另一台设备发布的内容，本次发布已停止。\n"
          + "请先点顶栏「本机同步」或执行 git pull，确认内容后再发布。");
      }
      pubStep("读取仓库状态 …");
      var ref = await gh(token, "GET", "/repos/" + GH.repo + "/git/ref/heads/" + GH.branch);
      var head = ref.object.sha;
      var headCommit = await gh(token, "GET", "/repos/" + GH.repo + "/git/commits/" + head);
      var baseTree = headCommit.tree.sha;

      pubStep("同步页面版本号与标签页标题 …");
      var changes = [{ path: "v2/data/content.js", text: fileText(next) }];
      var tabTitle = tabTitleOf(next.meta);
      for (var i = 0; i < GH.pages.length; i++) {
        var page = GH.pages[i];
        var raw = await ghReadFile(token, page);
        // 只改 <script src="data/content.js?v=N"> 与 data/schema.js，
        // 不要碰到按钮文字里的 "content.js"
        var patched = raw.replace(
          /(<script[^>]*\bsrc=["']data\/(?:content|schema)\.js)(\?v=\d+)?(["'])/g,
          "$1?v=" + v + "$3");
        /* 本地的 js / css 也挂上同一个版本号：改了脚本却没换 URL，浏览器会一直
           用缓存里的旧文件，看起来就像"发布了但没生效"。 */
        patched = patched.replace(
          /(<(?:script|link)\b[^>]*\b(?:src|href)=["']assets\/(?:js|css)\/[^"'?]+)(\?v=\d+)?(["'])/g,
          "$1?v=" + v + "$3");
        /* 标题必须写进 HTML 本身，不能只靠脚本运行时去改 —— 浏览器解析到
           <title> 就先显示，render.js 要等下载执行完才跑，中间那一下闪的
           就是 HTML 里的旧标题（强制刷新也一样）。*/
        if (tabTitle !== null && !TITLE_SKIP[page]) {
          if (TITLE_RE.test(patched)) {
            var oldTitle = (patched.match(TITLE_RE)[0] || "")
              .replace(/^<title>/, "").replace(/<\/title>$/, "");
            var newTitle = resolveTitle(tabTitle, page, oldTitle);
            patched = patched.replace(TITLE_RE,
              "<title>" + escapeTitle(newTitle) + "</title>");
          }
          /* og:title 读的是 HTML 里这段，不跟 document.title 走。必须和 <title>
             同一批改，否则分享卡片会一直停在旧人名上。*/
          if (OG_TITLE_RE.test(patched)) {
            var newOg = resolveOgTitle(tabTitle, page, ogTitleOf(patched));
            patched = patched.replace(OG_TITLE_RE, function (mm, a, old, c) {
              return a + escapeTitle(newOg) + c;
            });
          }
        }
        if (patched !== raw) changes.push({ path: page, text: patched });
      }

      /* 数据文件：订阅合集改了 data/sources.json，抓取改了 links.json / links.js。
         不推的话有两个后果 —— 仓库里 sources.json 没有新订阅，GitHub Actions
         永远抓不到它（「自动更新」只在你这台机器上成立）；links.* 也停在旧版本。
         读不到本地服务就跳过，不能因为顺手带个数据文件把整次发布弄挂。 */
      pubStep("同步数据文件 …");
      /* sourcesSynced 决定发布成功后能不能清掉「有未发布的订阅改动」标记。
         本地服务没跑 → 读不到 sources.json → 这次发布并没把它推上去，标记必须留着。*/
      var sourcesSynced = false;
      var sourcesConflict = false;
      var dataSkipped = [];
      /* 云端模式没有本机磁盘可读：内容、订阅、抓取结果的真源都是仓库本身，
         这一段整块跳过。跳过不报错，也不声称同步过 —— dataSkipped 保持空，
         尾部文案里就不会出现「数据文件未同步」这种误导。 */
      for (var di = 0; !CLOUD && di < SYNC_DATA_FILES.length; di++) {
        var dfp = SYNC_DATA_FILES[di];
        var isSources = dfp === "data/sources.json";
        try {
          var rinfo = await fetch(localApi(FILE_RAW_PATH + "?path=" + encodeURIComponent(dfp)))
            .then(function (r) { return r.json(); });
          if (!rinfo || !rinfo.ok) { dataSkipped.push(dfp); continue; }
          var localText = b64decode(rinfo.b64);
          var remoteData = await gh(token, "GET",
            "/repos/" + GH.repo + "/contents/" + dfp + "?ref=" + GH.branch
          ).catch(function () { return null; });
          if (remoteData && b64decode(remoteData.content) === localText) {
            /* 本机和仓库本来就一致（可能在另一台设备已发布过），
               等于没有待发布的订阅改动。*/
            if (isSources) sourcesSynced = true;
            continue;
          }
          /* 远端比本机新时绝不能拿本机覆盖：
             links.* 由 Actions 每 6 小时写（实测踩过：本机 55 条、远端 56 条，
             一发布就退回 55）；sources.json 可能被另一台设备刚改过订阅。
             两者都跳过，并且**不置 sourcesSynced**，橙标继续提醒。*/
          var remoteText2 = remoteData ? b64decode(remoteData.content) : "";
          if (isSources) {
            if (remoteText2 && sourcesStamp(remoteText2) > sourcesStamp(localText)) {
              pubStep("跳过 data/sources.json（仓库那份订阅更新，先点「本机同步」）");
              sourcesConflict = true;
              continue;
            }
          } else if (remoteText2 && feedStamp(remoteText2) > feedStamp(localText)) {
            pubStep("跳过 " + dfp + "（仓库那份更新时间更晚）");
            continue;
          }
          if (isSources) sourcesSynced = true;
          changes.push({ path: dfp, text: localText });
        } catch (e) {
          /* 本地服务没跑、或该文件还没生成 —— 跳过，但要记下来，
             发布结果里必须说明，不能让「已发布」把这件事盖过去。 */
          dataSkipped.push(dfp);
        }
      }

      /* 图片是二进制，进不了草稿存储，所以上传时只落了本机磁盘、记下仓库路径。
         这里在发布前把字节读回来，作为普通 blob 塞进同一个提交 —— 否则内容里
         有了路径，线上却还是 404。 */
      var images = [];
      /* 云端模式上传图片时已经直接写进仓库（见 uploadPhotoFile），
         没有「待读回的本地文件」这一说。 */
      var pending = CLOUD ? [] : pendingUploads();
      if (pending.length) {
        pubStep("读取待发布图片 " + pending.length + " 张 …");
        for (var pi = 0; pi < pending.length; pi++) {
          var imgPath = pending[pi];
          var resp;
          try {
            resp = await fetch(localApi(IMG_RAW_PATH + "?path=" + encodeURIComponent(imgPath)));
          } catch (e) {
            throw new Error("读不到本机图片 " + imgPath
              + "：本地服务没在跑（python v2/publish_server.py）。"
              + "图片没上传就发不上去，本次发布已停止。");
          }
          var info = await resp.json().catch(function () { return null; });
          if (!info || !info.ok) {
            throw new Error("读不到本机图片 " + imgPath + "：" + ((info && info.error) || "未知原因"));
          }
          images.push({ path: imgPath, b64: info.b64 });
        }
      }

      pubStep("上传 " + (changes.length + images.length) + " 个文件 …");
      var tree = [];
      for (var j = 0; j < changes.length; j++) {
        var blob = await gh(token, "POST", "/repos/" + GH.repo + "/git/blobs", {
          content: b64encode(changes[j].text),
          encoding: "base64"
        });
        tree.push({ path: changes[j].path, mode: "100644", type: "blob", sha: blob.sha });
      }
      for (var ii = 0; ii < images.length; ii++) {
        var iblob = await gh(token, "POST", "/repos/" + GH.repo + "/git/blobs", {
          content: images[ii].b64,
          encoding: "base64"
        });
        tree.push({ path: images[ii].path, mode: "100644", type: "blob", sha: iblob.sha });
      }

      pubStep("创建提交 …");
      var newTree = await gh(token, "POST", "/repos/" + GH.repo + "/git/trees", {
        base_tree: baseTree,
        tree: tree
      });
      var commit = await gh(token, "POST", "/repos/" + GH.repo + "/git/commits", {
        message: "content: 发布 v" + v
          + (images.length ? "（含 " + images.length + " 张图片）" : "")
          + "\n\n由 v2/studio.html 发布",
        tree: newTree.sha,
        parents: [head]
      });
      pubStep("更新分支 …");
      await gh(token, "PATCH", "/repos/" + GH.repo + "/git/refs/heads/" + GH.branch, { sha: commit.sha });
      /* 同样放在 patch 之后：提交失败时标记不能丢。只有这次发布确实
         推了 sources.json（或仓库已是同一份）才清，本地服务没跑时
         sourcesSynced 为 false，标记会继续提醒。 */
      if (sourcesSynced) clearSourcesDirty();
      /* 图片进仓库了，待发布清单才清 —— 放在 patch 之后，
         中途失败时清单还在，下次发布会自动重试 */
      if (images.length) {
        clearUploads(images.map(function (x) { return x.path; }));
      }

      /* 浏览器侧状态 */
      S.content = next;
      S.dirty = false;
      try {
        sessionStorage.setItem(GH.tokenKey, token);
        localStorage.setItem(DRAFT_KEY, JSON.stringify(S.content));
      } catch (e) {}
      renderTree();
      renderForm();
      pushPreview(true);
      /* 发布成功 ≠ 数据都上线了。本地服务没跑时 SYNC_DATA_FILES 会被跳过，
         以前这里照样显示「已发布」，操作者完全看不出来。现在把未同步状态
         写进顶栏和 toast；订阅改动另有跨刷新保留的橙色标记。 */
      var subPending = !!sourcesDirty();
      var warnTail = sourcesConflict ? " · 订阅改动被拒绝覆盖"
        : (subPending ? " · 订阅改动未上线"
          : (dataSkipped.length ? " · 数据文件未同步" : ""));
      var warnMsg = sourcesConflict
        ? "仓库里的订阅配置比本机新（另一台设备改过），本次没有覆盖它。"
          + "先点顶栏「本机同步」把订阅拉下来，确认后再发布"
        : (subPending
          ? "订阅/退订改动没上线：本地服务可能没在跑，点顶栏橙色标记重新发布"
          : (dataSkipped.length
            ? "这些数据文件没同步：" + dataSkipped.join("、")
              + "（本地服务可能没在跑）"
            : ""));
      setState("已发布 v" + v + warnTail, !!warnTail);
      /* 磁盘侧同步：不论发布走代理还是直连都尝试，失败必须可见 */
        /* 磁盘侧同步：本机模式写回 v2/data/content.js；云端模式没有磁盘，
           发布到仓库就等于"已同步"，不要报「本机未同步」吓人。 */
        var localOk = CLOUD;
        if (!CLOUD) {
          try { localOk = await syncLocal(changes[0].text, v); } catch (e) { localOk = false; }
        }
        if (!localOk) {
          setState("已发布 v" + v + " · 本机未同步" + warnTail, true);
        }
      /* 源仓更新 ≠ 线上更新：站点挂在另一个公开仓库上，不重新构建产物再推，
         线上一直是旧内容。本地服务在跑就顺带做掉这一步。 */
      var dep = await deploySite();
      closePub();
      var tail = " · " + commit.sha.slice(0, 7)
        + (pruned ? " · 清掉 " + pruned + " 条失效样式" : "");
        if (dep.ok) {
          setState("已发布 v" + v + (dep.auto ? " · 自动上线中" : " · 已上线") + warnTail, !!warnTail);
          /* 末尾这句是踩出来的：GitHub Pages 给 HTML 也是 10 分钟缓存，
             刚发布就刷新，往往拿到的还是指向旧版本号的那份 HTML ——
             于是「改了但没体现」，实际上内容早就进仓库了。
             只有强制刷新能绕过，普通刷新会在 10 分钟内继续吃到缓存。 */
          toast((dep.auto ? "已提交，GitHub Actions 正在构建上线" : "已上线") + tail
            + " · 约一分钟后 " + (dep.site || ("https://" + GH.repo.split("/")[0] + ".github.io/"))
            + " 生效。" + (warnMsg ? "注意：" + warnMsg + "。" : "")
            + "若看到的还是旧内容，强制刷新一次（Ctrl/⌘ + Shift + R）："
            + "GitHub Pages 给页面 10 分钟缓存，普通刷新会继续用它。", 9000);
        } else {
        setState("已发布 v" + v + " · 线上未更新" + warnTail, true);
        toast("已发布" + tail + "；" + (dep.msg || "但线上未更新")
          + (warnMsg ? "；注意：" + warnMsg : ""));
      }
    } catch (err) {
      pubErr(explainErr(err));
    } finally {
      pubBusy(false);
      pubStep("");
    }
  }

  /* ---------------- 上线 ----------------
     「发布」只推源仓（私有）。站点挂在独立的公开仓 <user>.github.io 上，
     源仓更新了线上也不会变，必须重新生成产物再推一遍。
     本地服务在跑时由它执行 build_public.py + deploy_pages.py，一次请求搞定；
     服务没跑（直连模式）就明确说清楚，别让人以为已经上线。 */
    async function deploySite() {
      /* 云端模式：源仓一提交，publish workflow 自己会构建并推到产物仓。
         这里没有本地服务可调，也不该再触发一次。 */
      if (CLOUD) {
        return {
          ok: true,
          auto: true,
          site: "https://" + GH.repo.split("/")[0] + ".github.io/"
        };
      }
      if (!GH.proxy) {
        return { ok: false, msg: "线上未更新：需要本地服务。双击「更新网站.cmd」即可上线" };
      }
    pubStep("生成产物并发布到线上 …（约 30 秒）");
    try {
      var r = await localPost("/__deploy", {}, 300000);
      if (r.status === 404) {
        return { ok: false, msg: "本地服务版本偏旧（没有 /__deploy），重启服务后再发布" };
      }
      var j = await r.json().catch(function () { return null; });
      if (!r.ok || !j || !j.ok) {
        return { ok: false, msg: (j && j.error) || ("上线失败：HTTP " + r.status) };
      }
      return { ok: true, site: j.site };
    } catch (e) {
      return { ok: false, msg: "上线请求失败：" + (e && e.message ? e.message : e) };
    }
  }

  /* ---------------- 绑定 ---------------- */
  function bind() {
    $$("#tabs button").forEach(function (b) {
      b.addEventListener("click", function () { switchTab(b.dataset.pageTab); });
    });

    $("#tree").addEventListener("click", function (e) {
      var b = e.target.closest("[data-group]");
      if (!b) return;
      selectGroup(b.dataset.group);
    });

    $$("#devices button").forEach(function (b) {
      b.addEventListener("click", function () {
        S.device = parseInt(b.dataset.w, 10);
        $$("#devices button").forEach(function (x) { x.classList.toggle("is-on", x === b); });
        fit();
        setPreviewHint();
        try { $("#preview").contentWindow.scrollTo(0, 0); } catch (e) {}
      });
    });

    /* ---------------- 预览内点选改样式 ---------------- */
    var pickOn = false;
    var pickBtn = $("#pick");
    function sendPick() {
      try {
        $("#preview").contentWindow.postMessage({ __v2: true, type: "pick", on: pickOn }, "*");
      } catch (e) {}
    }
    if (pickBtn) {
      pickBtn.addEventListener("click", function () {
        pickOn = !pickOn;
        pickBtn.classList.toggle("is-on", pickOn);
        pickBtn.textContent = pickOn ? "退出点选" : "点选改样式";
        sendPick();
      });
    }
    window.addEventListener("message", function (e) {
      var d = e.data;
      if (!d || d.__v2 !== true) return;

      /* 样式：预览端按「类别 + 块」合并算好后，把整份 styles 发回来。
         整份替换比逐条增量合并可靠 —— 以前两边各拼一份，字段一多就分叉。 */
      if (d.type === "styles") {
        snapshot();
        S.content.styles = d.styles || {};
        if (!Object.keys(S.content.styles).length) delete S.content.styles;
        markDirty();
        schedulePersist();
        setState("已记录样式改动 · 未发布", true);
        var ty = $("#type");
        if (ty && !ty.hidden) requestReport();
        return;
      }

      /* 排版总览的数据回包 */
      if (d.type === "type-report") {
        renderTypeRows(d.rows || []);
        return;
      }
    });

    $("#pub-view").addEventListener("click", function () {
      setPubView(!S.pubView);
      if (S.pubView) toast("发布态：只用 content.js，草稿改动不会显示");
    });

    $("#locate").addEventListener("click", function () {
      var g = currentGroup();
      if (!g || !g.section) { toast("这一段没有可定位的位置"); return; }
      try {
        var doc = $("#preview").contentDocument;
        var el = doc.querySelector('[data-sec="' + g.section + '"]');
        if (el) {
          el.scrollIntoView({ block: "start", behavior: "smooth" });
          doc.defaultView.scrollBy(0, -90);
        }
      } catch (e) {}
    });

    $("#preview").addEventListener("load", function () {
      pushPreview(true);
      setTimeout(fit, 120);
      if (typeof sendPick === "function") setTimeout(sendPick, 200);
      /* iframe 换了页面，参考线要重新打开一次 */
      if (guideShown && !$("#type").hidden) setTimeout(function () { sendGuides(true); }, 260);
    });

    $("#undo").addEventListener("click", function () {
      if (!S.undo.length) return;
      var prev = S.undo.pop();
      S.content = JSON.parse(prev);
      $("#undo").disabled = S.undo.length === 0;
      renderTree();
      renderForm();
      pushPreview(true);
      schedulePersist();
      setState("已撤销一步", true);
    });

    $("#reset").addEventListener("click", function () {
      if (!confirm("放弃所有本地修改，回到 data/content.js 里的版本？")) return;
      S.content = clone(FILE_VERSION);
      S.undo = [];
      $("#undo").disabled = true;
      try { localStorage.removeItem(DRAFT_KEY); } catch (e) {}
      renderTree();
      renderForm();
      pushPreview(true);
      S.dirty = false;
      setState("已回到文件版本", false);
      toast("已重置为文件版本");
    });

    $("#export").addEventListener("click", function () {
      if (pruneStyles()) renderForm();
      download("content.js", fileText(S.content));
      toast("已导出 content.js，替换 v2/data/content.js 即可发布");
    });

    $("#save").addEventListener("click", saveToFile);

    $("#publish").addEventListener("click", openPub);

    /* 「有未发布的订阅改动」点一下直接去发布；离开页面时再兜一次。
       草稿会被自动存进 localStorage，但订阅改动只在本机磁盘上，
       关掉标签页后没有任何机制会替用户把它推上去。 */
    if ($("#sources-flag")) $("#sources-flag").addEventListener("click", openPub);
    window.addEventListener("beforeunload", function (e) {
      if (!sourcesDirty()) return;
      var msg = "有订阅/退订改动还没发布到仓库，现在离开线上的抓取源不会更新。";
      e.preventDefault();
      e.returnValue = msg;
      return msg;
    });
    var typeOpen = $("#type-open");
    if (typeOpen) {
      typeOpen.addEventListener("click", openType);
      $("#ty-close").addEventListener("click", closeType);
      $("#type").addEventListener("click", function (e) {
        if (e.target.id === "type") closeType();
      });
      var guideBtn = $("#ty-guides");
      if (guideBtn) {
        guideBtn.addEventListener("click", function () {
          guideShown = !guideShown;
          guideBtn.classList.toggle("is-on", guideShown);
          guideBtn.setAttribute("aria-pressed", String(guideShown));
          sendGuides(guideShown);
          if (guideShown) toast("参考线已开：虚线是文字块边界，竖线是最常见的左右边界");
        });
      }
      $("#ty-rows").addEventListener("change", function (e) {
        var row = e.target.closest(".ty__row");
        var k = e.target.dataset ? e.target.dataset.k : "";
        if (!row || !k || k === "reset") return;
        /* 只发用户动过的那一列。整行一起发会把没动过的段后/粗细也钉成当前值，
           统一字号的同时顺手把标题下方留白改成 0 —— 那不是用户要的。 */
        var v = e.target.value;
        var patch = {};
        if (k === "size") { patch.size = parseInt(v, 10) || 0; patch.px = patch.size; }
        else if (k === "lh") patch.lh = parseInt(v, 10) || 0;
        else if (k === "mb") patch.mb = parseInt(v, 10) || 0;
        else if (k === "w") patch.w = v === "" ? "" : (parseInt(v, 10) || 0);
        else if (k === "align") patch.align = v;
        else if (k === "wrap") patch.wrap = v;
        else if (k === "weight") patch.weight = v;
        if (!Object.keys(patch).length) return;
        sendRoleEdit(row.dataset.role, patch);
      });
      $("#ty-rows").addEventListener("click", function (e) {
        var b = e.target.closest('[data-k="reset"]');
        if (!b) return;
        sendRoleEdit(b.closest(".ty__row").dataset.role, {}, true);
        toast("已清除这一类别的统一设置");
      });
    }
    var syncBtn = $("#sync");
    if (syncBtn) syncBtn.addEventListener("click", syncFromGithub);
    $("#pub-cancel").addEventListener("click", closePub);
    $("#pub-go").addEventListener("click", publish);
    var recheck = $("#pub-recheck");
    if (recheck) recheck.addEventListener("click", function () {
      pubStep("正在重新检测通道 …");
      detectProxy(true).then(function (p) {
        pubStep(p ? "已切到本地通道" : "未发现本地服务，仍为直连");
        setTimeout(function () { pubStep(""); }, 2600);
      });
    });
    $("#pub").addEventListener("click", function (e) { if (e.target.id === "pub") closePub(); });
    $("#pub-forget").addEventListener("click", function () {
      try {
        sessionStorage.removeItem(GH.tokenKey);
        localStorage.removeItem(TOKEN_PERSIST_KEY);
      } catch (e) {}
      var input = $("#pub-token");
      if (input) input.value = "";
      pubErr("");
      pubStep("已清除这台浏览器保存的 Token");
    });

    $("#import").addEventListener("change", function (e) {
      var f = e.target.files && e.target.files[0];
      if (!f) return;
      var r = new FileReader();
      r.onload = function () {
        try {
          var obj = parseImport(String(r.result));
          if (!obj.pages) throw new Error("缺少 pages");
          S.content = obj;
          renderTree();
          renderForm();
          pushPreview(true);
          markDirty();
          schedulePersist();
          toast("导入成功");
        } catch (err) {
          toast("导入失败：" + err.message);
        }
      };
      r.readAsText(f, "utf-8");
      e.target.value = "";
    });

    document.addEventListener("keydown", function (e) {
      var mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      if (e.key === "s") { e.preventDefault(); saveToFile(); }
      if (e.key === "z") { e.preventDefault(); var u = $("#undo"); if (u && !u.disabled) u.click(); }
    });

    window.addEventListener("resize", function () { fit(); });

    bindWxTools();
  }

  /* ---------------- 「加动态」：贴公众号链接写进最新动态 ---------------- */
  /* 解析走本机 publish_server 的 /__wx（服务端抓，绕开浏览器 CORS ——
     mp.weixin.qq.com 不允许跨域读响应）；写入走 /__feed/add，那里复用
     抓取脚本的 merge_items，所以手动加的条目和自动抓的一样受历史合并
     保护，不会被下一次抓取冲掉。 */
  function bindWxTools() {
    var openBtn = $("#wx-open");
    var tree = $("#tree");
    var box = $("#wx");
    if (!box) return;

    var input = $("#wx-url");
    var step = $("#wx-step");
    var err = $("#wx-err");
    var go = $("#wx-go");
    var cancel = $("#wx-cancel");
    var parsed = null;

    function dropCard() {
      var old = box.querySelector(".wx-card");
      if (old) old.parentNode.removeChild(old);
    }

    function reset() {
      parsed = null;
      step.textContent = "";
      err.textContent = "";
      // 云端没有「解析 → 写入」两步，一次点击就是提交，按钮文字要对得上
      go.textContent = CLOUD ? "提交" : "解析";
      go.disabled = false;
      dropCard();
    }

    function close() {
      box.hidden = true;
      reset();
    }

    function preview(d) {
      dropCard();
      // 用 DOM 构造而不是拼字符串：标题里带尖括号也不会破坏结构
      var card = document.createElement("div");
      card.className = "wx-card";
      card.style.cssText =
        "margin-top:14px;padding:12px 14px;border:1px solid var(--border);" +
        "border-radius:10px;background:var(--surface-1)";
      var t = document.createElement("b");
      t.textContent = d.title || "";
      t.style.cssText = "display:block;font-size:13px;line-height:1.5";
      card.appendChild(t);
      var meta = document.createElement("span");
      meta.textContent = [d.source_name, (d.date || "").slice(0, 10)].filter(Boolean).join(" · ");
      meta.style.cssText =
        "display:block;margin-top:6px;font-size:11px;color:var(--text-3);" +
        "font-family:var(--font-mono)";
      card.appendChild(meta);
      if (d.summary) {
        var s = document.createElement("span");
        s.textContent = d.summary;
        s.style.cssText =
          "display:block;margin-top:8px;font-size:12px;line-height:1.7;color:var(--text-2)";
        card.appendChild(s);
      }
      var album = albumBlock(d);
      if (album) card.appendChild(album);
      var actions = box.querySelector(".pub__actions");
      /* 卡片的落点：已订阅列表之前。两者都插在 .pub__actions 前面，
         但 insertBefore 的语义是「紧挨着参照节点」——
         所以后插的会跑到前面去，列表就压在了卡片上方。这里显式指定锚点。*/
      var anchor = box.querySelector(".wx-albums") || actions;
      /* 注意：锚点的父节点是里面的 .pub__box，不是 #wx 本身。
         直接 box.insertBefore(card, actions) 会抛
         "The node before which the new node is to be inserted is not a
         child of this node" —— insertBefore 的参照节点必须是**调用者**的
         直接子节点，不能只是后代。 */
      if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(card, anchor);
      else box.appendChild(card);
    }

    /* 这篇属于某个合集时，多给一段：补录过往 + 开启自动更新。
       它是「可选的第二步」，不是必选项 —— 底部那个「写入动态」仍然只加这一篇。 */
    function albumBlock(d) {
      var a = d.album;
      if (!a || !a.count) return null;

      var wrap = document.createElement("div");
      wrap.className = "wx-album";

      var head = document.createElement("b");
      head.textContent = "这一篇属于合集「" + (a.name || "未命名") + "」";
      wrap.appendChild(head);

      var sub = document.createElement("span");
      sub.className = "wx-album__sub";
      sub.textContent = (a.account ? a.account + " · " : "")
        + "共 " + a.count + " 篇" + (a.updating ? " · 还在更新" : "");
      wrap.appendChild(sub);

      var row = document.createElement("div");
      row.className = "wx-album__row";

      var lab = document.createElement("span");
      lab.textContent = "一次补录最近";
      row.appendChild(lab);

      var inp = document.createElement("input");
      inp.type = "number";
      inp.min = "1";
      inp.max = String(a.count);
      inp.value = String(Math.min(20, a.count));
      row.appendChild(inp);

      var unit = document.createElement("span");
      unit.textContent = "篇";
      row.appendChild(unit);

      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "tbtn tbtn--primary";
      btn.textContent = "补录并订阅";
      row.appendChild(btn);
      wrap.appendChild(row);

      var hint = document.createElement("span");
      hint.className = "wx-album__hint";
      hint.textContent = "订阅会写进 data/sources.json，每 6 小时自动检查一次新文章；"
        + "只补录不回补历史，也不影响已经收进来的条目。";
      wrap.appendChild(hint);

      btn.addEventListener("click", function () {
        var n = parseInt(inp.value, 10) || 20;
        var done = false;
        btn.disabled = true;
        btn.textContent = "补录中 …";
        localPost(ALBUM_SUB_PATH, { biz: d.biz, album_id: d.album_id, limit: n }, 60000)
          .then(function (r) { return r.json(); })
          .then(function (res) {
            if (!res.ok) throw new Error(res.error || "订阅失败");
            done = true;
            hint.textContent = "已补录 " + res.added + " 条（抓了 " + res.fetched
              + " 篇），存档共 " + res.items + " 条；"
              + "每次实际抓最近 " + (res.effective_limit || n) + " 篇。"
              + "以后每 6 小时自动检查 —— 记得点一次「发布」，"
              + "否则订阅只在你这台电脑上生效。";
            hint.className = "wx-album__hint is-ok";
            btn.textContent = "已订阅";
            markSourcesDirty("订阅合集「" + (a.name || a.album_id || "未命名") + "」");
            renderAlbums();
            toast("已补录 " + res.added + " 条并订阅合集 · 记得点一次「发布」");
          })
          .catch(function (e) {
            hint.textContent = e.message || "补录失败";
            hint.className = "wx-album__hint is-err";
            btn.textContent = "重试";
          })
          .then(function () {
            /* 成功了就别再让它像一颗能点的按钮：重复点只是把 limit 改一遍，
               用户会以为又多补了一批。失败才恢复，好让他重试。*/
            btn.disabled = done;
          });
      });

      return wrap;
    }

    /* 已订阅的合集列表。放在同一个弹层底部：取消订阅没有别的地方可去，
       不在这里给它留位置，用户就只能去手改 sources.json。 */
    function renderAlbums() {
      var host = box.querySelector(".wx-albums");
      if (!host) {
        host = document.createElement("div");
        host.className = "wx-albums";
        var actions = box.querySelector(".pub__actions");
        if (actions && actions.parentNode) actions.parentNode.insertBefore(host, actions);
        else box.appendChild(host);
      }
      /* 云端模式读得到订阅列表，但只能读文件本身：这个端点原来要服务端去
         mp.weixin.qq.com 拿合集名，浏览器受同源策略限制做不了。而订阅列表
         就写在 data/sources.json 里，用 Contents API 直接读，比原来还准。 */
      if (CLOUD) {
        host.innerHTML = "";
        var cTitle = document.createElement("span");
        cTitle.className = "wx-albums__title";
        cTitle.textContent = "已订阅的合集 · 每 6 小时自动检查";
        host.appendChild(cTitle);
        var cToken = savedToken();
        if (!cToken) {
          var needTok = document.createElement("span");
          needTok.className = "wx-albums__warn";
          needTok.textContent = "填过 Token 才能读到订阅列表。点顶栏「发布」填一次，之后这台设备会记住。";
          host.appendChild(needTok);
          return;
        }
        cloudAlbums(host, cToken);
        return;
      }
      fetch(localApi(ALBUM_LIST_PATH))
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (!d.ok) throw new Error(d.error || "读取失败");
          host.innerHTML = "";
          var title = document.createElement("span");
          title.className = "wx-albums__title";
          title.textContent = d.albums.length
            ? "已订阅的合集 · 每 6 小时自动检查"
            : "还没有订阅的合集";
          host.appendChild(title);
          /* 订阅/退订只落本机，这一行是弹层里常驻的提醒；顶栏还有
             跨刷新保留的标记，关掉弹层也不会把这件事弄丢。 */
          var unpub = sourcesDirty();
          if (unpub) {
            var warn = document.createElement("span");
            warn.className = "wx-albums__warn";
            warn.textContent = "有 " + unpub.ops.length
              + " 处订阅改动还没发布 —— 点顶栏「发布」推到仓库后，线上才会生效。";
            host.appendChild(warn);
          }
          d.albums.forEach(function (a) {
            var line = document.createElement("div");
            line.className = "wx-albums__row";
            var nm = document.createElement("span");
            nm.textContent = a.name || a.id;
            line.appendChild(nm);
            var cnt = document.createElement("i");
            cnt.textContent = "每次抓最近 " + a.limit + " 篇";
            line.appendChild(cnt);
            var del = document.createElement("button");
            del.type = "button";
            del.className = "wx-albums__del";
            del.textContent = "取消";
            del.addEventListener("click", function () {
              del.disabled = true;
              localPost(ALBUM_REMOVE_PATH, { id: a.id })
                .then(function (r) { return r.json(); })
                .then(function (res) {
                  if (!res.ok) throw new Error(res.error || "取消失败");
                  /* 和订阅一样：退订也只写本机 sources.json，不点「发布」
                     远端不会停抓。以前只有一句 toast，没有告诉用户这件事。*/
                  markSourcesDirty("退订合集「" + (a.name || a.id) + "」");
                  toast("已取消订阅（已收进来的条目保留）· 记得点一次「发布」");
                  renderAlbums();
                })
                .catch(function (e) {
                  del.disabled = false;
                  toast(e.message || "取消失败");
                });
            });
            line.appendChild(del);
            host.appendChild(line);
          });
        })
        .catch(function () {
          host.innerHTML = "";
          var s2 = document.createElement("span");
          s2.className = "wx-albums__title";
          s2.textContent = "读不到合集订阅（本地服务没在跑？）";
          host.appendChild(s2);
        });
    }

    /* 云端的订阅列表：直接读/写 data/sources.json。
       退订不需要探测合集（那一步才要联网），所以在浏览器里就能立刻完成，
       提交后 update-links 会被这个文件的变化触发，一次运行就生效。 */
    async function cloudAlbums(host, token) {
      var list;
      try {
        var f = await ghReadText(token, "data/sources.json");
        var cfg = JSON.parse(f.text);
        list = (cfg.sources || []).filter(function (s) { return s.type === "album"; });
      } catch (e) {
        host.innerHTML = "";
        var bad = document.createElement("span");
        bad.className = "wx-albums__title";
        bad.textContent = "读不到订阅配置：" + ((e && e.message) || e);
        host.appendChild(bad);
        return;
      }

      if (!list.length) {
        var none = document.createElement("span");
        none.className = "wx-albums__title";
        none.textContent = "还没有订阅的合集。贴一个合集分享链接就能订阅。";
        host.appendChild(none);
        return;
      }

      list.forEach(function (a) {
        var line = document.createElement("div");
        line.className = "wx-albums__row";
        var nm = document.createElement("span");
        nm.textContent = a.name || a.id;
        line.appendChild(nm);
        var cnt = document.createElement("i");
        cnt.textContent = "每次抓最近 " + (a.limit || 20) + " 篇";
        line.appendChild(cnt);
        var del = document.createElement("button");
        del.type = "button";
        del.className = "wx-albums__del";
        del.textContent = "取消";
        del.addEventListener("click", async function () {
          del.disabled = true;
          try {
            var f2 = await ghReadText(token, "data/sources.json");
            var cfg2 = JSON.parse(f2.text);
            var src2 = cfg2.sources || [];
            var kept = src2.filter(function (s) { return s.id !== a.id; });
            if (kept.length === src2.length) throw new Error("这条订阅已经不在了");
            cfg2.sources = kept;
            cfg2.updated_at = new Date().toISOString();
            await ghWriteText(token, "data/sources.json",
              JSON.stringify(cfg2, null, 2) + "\n",
              "sources: 退订合集「" + (a.name || a.id) + "」", f2.sha);
            toast("已退订（已收进来的文章保留）· 线上约 1 分钟后停止抓取");
            renderAlbums();
          } catch (e) {
            del.disabled = false;
            toast("退订失败：" + ((e && e.message) || e));
          }
        });
        line.appendChild(del);
        host.appendChild(line);
      });
    }

    function submit() {
      go.disabled = true;
      step.textContent = "正在写入存档 …";
      localPost("/__feed/add", {
        item: {
          title: parsed.title,
          url: parsed.url,
          date: parsed.date,
          summary: parsed.summary,
          source_name: parsed.source_name,
          mid: parsed.mid
        }
      })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (!d.ok) throw new Error(d.error || "写入失败");
          step.textContent =
            (d.added ? "已加入" : "这条已经在存档里了") + "，当前共 " + d.items + " 条。";
          toast(d.added ? "已加入最新动态" : "已存在，未重复添加");
          parsed = null;
          go.textContent = "解析";
        })
        .catch(function (e) {
          step.textContent = "";
          err.textContent = e.message || "写入失败";
        })
        .then(function () { go.disabled = false; });
    }

    function parse(url) {
      /* 云端模式做不了这一步：必须由服务端去抓 mp.weixin.qq.com，
         浏览器直接抓会被同源策略挡（响应没有 CORS 头），换什么令牌都没用。
         能做的是把它写成一条待办，交给 Actions —— 见 cloudGo()。 */
      if (CLOUD) { cloudGo(url); return; }
      go.disabled = true;
      err.textContent = "";
      step.textContent = "正在解析 …";
      fetch("/__wx?url=" + encodeURIComponent(url))
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (!d.ok) throw new Error(d.error || "解析失败");
          parsed = d;
          go.textContent = "写入动态";
          step.textContent = "解析成功。" +
            (d.album ? "这篇属于合集，可以在下面一并补录过往。" : "");
          preview(d);
        })
        .catch(function (e) {
          step.textContent = "";
          var msg = (e && e.message) || "解析失败";
          /* 只有网络层失败才值得提「换端口打开」这个建议；脚本自身的错误
             原样给出，否则真因会被这句提示盖住（之前 insertBefore 报错
             就被人误当成 file:// 的问题）。 */
          if (/Failed to fetch|NetworkError|load failed|ERR_/i.test(msg)) {
            msg += "。控制台如果是 file:// 打开的，改用 http://127.0.0.1:8899/v2/studio.html";
          }
          err.textContent = msg;
        })
        .then(function () { go.disabled = false; });
    }

    /* 云端「一步到位」：没有解析这一步，点一下就是提交待办 + 等后台结果。
       刻意保留短链校验：长链（?__biz=&mid=）在 Actions 里也会被风控成
       「环境异常」，提交上去只是多等一分钟再拿到一个失败。 */
    async function cloudGo(url) {
      var token = savedToken();
      if (!token) {
        err.textContent = "还没填 GitHub Token。点顶栏「发布」填一次，之后这台设备会记住。";
        return;
      }
      var kind = wechatKindOf(url);
      if (!/^https?:\/\/mp\.weixin\.qq\.com\//i.test(url)) {
        err.textContent = "只支持 mp.weixin.qq.com 的链接。";
        return;
      }
      if (kind === "article" && !/^https?:\/\/mp\.weixin\.qq\.com\/s\//i.test(url)) {
        err.textContent = "文章请贴短链（形如 https://mp.weixin.qq.com/s/xxxx）。"
          + "长链带 ?__biz=… 的那种会被微信风控成「环境异常」，解析不出正文。"
          + "在微信里打开文章 → 右上角 → 复制链接，拿到的就是短链。";
        return;
      }

      go.disabled = true;
      err.textContent = "";
      step.textContent = kind === "album" ? "正在提交订阅 …" : "正在提交 …";
      var task = inboxTask(kind, url);
      try {
        await submitInbox(token, task);
      } catch (e) {
        err.textContent = "提交失败：" + ((e && e.message) || e);
        step.textContent = "";
        go.disabled = false;
        return;
      }

      step.textContent = "已提交，后台（GitHub Actions）正在处理，通常 1 分钟内完成 …";
      go.textContent = "再提交一条";
      var got = await waitInbox(token, task.id, function (i) {
        step.textContent = "已提交，等待后台处理 …（" + (i + 1) + "）";
      });
      go.disabled = false;

      if (!got) {
        step.textContent = "后台还在处理。结果会写回待办队列，稍后重新打开这个面板就能看到"
          + "（保留最近 " + INBOX_KEEP + " 条）；线上页面大约 2-3 分钟后生效。";
        return;
      }
      if (got.status === "error") {
        step.textContent = "";
        err.textContent = "后台处理失败：" + (got.error || "未知原因");
        return;
      }
      step.textContent = (got.result || "已完成。")
        + " 线上页面大约 2-3 分钟后生效。";
      toast(got.result || "已完成");
      if (kind === "album") renderAlbums();
    }

    function open() {
      box.hidden = false;
      reset();
      renderAlbums();
      input.focus();
    }

    /* 入口现在挂在左侧树的「资源库 → 最新动态」下面。树每次重渲染都会换掉
       那些按钮节点，所以走事件委托，不要直接绑在具体元素上。 */
    if (tree) {
      tree.addEventListener("click", function (ev) {
        var hit = ev.target.closest && ev.target.closest('[data-act="wx-add"]');
        if (hit) open();
      });
    }
    /* 兼容：缓存里的旧 studio.html 顶栏还留着这个按钮 */
    if (openBtn) openBtn.addEventListener("click", open);

    cancel.addEventListener("click", close);
    box.addEventListener("click", function (e) {
      if (e.target === box) close();
    });
    go.addEventListener("click", function () {
      var url = (input.value || "").trim();
      if (!url) {
        err.textContent = "先贴一个文章链接";
        return;
      }
      // 同一个链接已经解析过就直接写，避免为了写入再抓一次
      if (parsed && parsed.url === url) submit();
      else parse(url);
    });
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        go.click();
      }
    });
  }

  /* ---------------- 云端模式的界面调整 ----------------
     网页版没有本地服务，凡是指向「本机文件 / 本地服务」的说法都得换掉，
     否则用户会照着提示去找一个在这台设备上根本不存在的东西。 */
  function applyCloudUI() {
    if (!CLOUD) return;
    document.body.classList.add("is-cloud");

    /* 云端没有本机 data/sources.json，从这个浏览器带来的「未发布订阅」标记
       只会在顶栏一直挂着一个点不掉的橙点。 */
    try { localStorage.removeItem(SOURCES_DIRTY_KEY); } catch (e) {}
    renderSourcesFlag();

    var sync = $("#sync");
    if (sync) {
      sync.textContent = "从仓库载入";
      sync.title = "拉取私有仓库里最新的 content.js 到编辑器。云端没有本机文件，"
        + "所以这里是载入而不是写盘。";
    }

    var hint = document.querySelector("#pub .pub__hint");
    if (hint) {
      hint.textContent = "Token 只用于读写你自己的私有仓库，不会上传到别处、"
        + "也不会写进仓库。云端模式下会记住在这台浏览器里（换设备需再填一次），"
        + "随时可以点「清除已保存」删掉。建议用细粒度 Token：只授权 personal-site "
        + "与个人站点仓库的 Contents 读写，并设 90 天有效期。";
    }

    var wxHint = document.querySelector("#wx .pub__hint");
    if (wxHint) {
      wxHint.textContent = "贴文章短链（mp.weixin.qq.com/s/…）或合集分享链接。"
        + "浏览器读不了微信的响应（同源策略），所以这里只负责把它提交到待办队列 "
        + "data/inbox.json，真正的解析由仓库的 GitHub Actions 完成，通常 1 分钟内出结果。"
        + "线上页面大约 2-3 分钟后更新。";
    }
    var wxGo = $("#wx-go");
    if (wxGo) wxGo.textContent = "提交";
  }

  /* 云端启动对齐。
     产物里的 data/content.js 是上一次构建时的快照，可能落后于刚发布的版本
     （Actions 还在跑），也可能落后于另一台设备刚推的内容。有 Token 就比一次
     版本号：仓库更新且本地没有未发布草稿时直接换掉，避免基于旧内容继续编辑。
     有草稿就只提示、不动它 —— 覆盖用户没发布的改动是最不能接受的行为。 */
  async function cloudAlign(hasDraft) {
    var token = savedToken();
    if (!token) {
      /* 没有 Token 时连图片都传不了（云端上传要写仓库），所以第一次进云端
         模式直接把发布面板打开 —— Token 就填在那儿。只提示一次，之后不再弹。 */
      setState("云端模式 · 填一次 Token 即可发布", true);
      var tipped = null;
      try { tipped = sessionStorage.getItem(TOKEN_TIP_KEY); } catch (e) {}
      if (!tipped) {
        try { sessionStorage.setItem(TOKEN_TIP_KEY, "1"); } catch (e) {}
        openPub();
        pubStep("先把 Token 粘到这一栏（这台设备会记住），填完可以直接关掉去改内容。");
      }
      return;
    }
    try {
      setState("正在读取仓库最新内容 …", false);
      var text = await ghReadFile(token, "v2/data/content.js");
      var v = versionOf(text);
      var cur = S.content.version || 0;
      if (!v || v <= cur) {
        setState("云端模式 · 已是最新 v" + cur, false);
        return;
      }
      if (hasDraft) {
        setState("仓库已有 v" + v + " · 本地草稿未发布", true);
        return;
      }
      var remote = parseContentJs(text);
      if (!remote || !remote.pages || !remote.pages.home) {
        throw new Error("结构不完整");
      }
      S.content = remote;
      S.dirty = false;
      try { localStorage.setItem(DRAFT_KEY, JSON.stringify(remote)); } catch (e) {}
      renderTree();
      renderForm();
      pushPreview(true);
      setState("已载入仓库 v" + v + "（比页面快照新）", false);
    } catch (e) {
      setState("云端模式 · 读取仓库失败", true);
    }
  }

  /* ---------------- 启动 ---------------- */
  function boot() {
    var loaded = loadInitial();
    S.content = loaded.content;
    bind();
    renderSourcesFlag();
    switchTab("home");
    S.groupId = groupsOf("home")[0].id;
    renderTree();
    renderForm();
    setState(loaded.fromDraft ? "草稿已载入 · 未发布" : "已载入文件版本", loaded.fromDraft);
    setTimeout(fit, 200);

    /* 探测运行模式：连得上本地服务就是本机模式（全功能），连不上就是云端模式。
       探测失败不算错误 —— 「没有本地服务」正是云端模式的正常形态。 */
    detectProxy(true).then(function () {
      applyCloudUI();
      if (CLOUD) return cloudAlign(!!loaded.fromDraft);
    }).catch(function () {});
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
