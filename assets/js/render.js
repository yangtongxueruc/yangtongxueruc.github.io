/* ============================================================
   RENDER.JS — 把 content.js 的文本渲染成页面
   页面里没有一个字是写死在 HTML 里的，全部来自 window.V2_CONTENT。
   对外暴露 window.V2：init / rerender / patchSection
   ============================================================ */
(function () {
  "use strict";

  var PAGE = document.body.dataset.page || "home";
  /* 归档页（feed.html）不来自 content.js 的 pages —— 内容取决于运行时的
     存档条数，写进 content.js 反而会被控制台发布覆盖掉。所以单独走一条
     渲染分支，只借用 content.js 里的导航、页脚和 meta。 */
  var IS_ARCHIVE = /\/feed\.html$/.test(location.pathname);
  var state = { content: null, draft: false };

  /* 联系邮箱只有一个真源：content.js 的 meta.email。
     以前 CTA 写一份、页脚链接写一份，控制台里的「联系邮箱」改了谁都不跟着变。
     这里统一取值；旧数据里没有 meta.email 时退回各分节自己带的值，不至于空白。*/
  function siteEmail(c) {
    var m = ((c || state.content || {}).meta) || {};
    return m.email ? String(m.email).trim() : "";
  }

  /* ---------------- 小工具 ---------------- */
  function el(tag, cls, attrs) {
    // 容错：允许 el(tag, {attrs}) 这种写法，避免把属性对象当成 class
    if (cls && typeof cls === "object" && attrs === undefined) {
      attrs = cls;
      cls = null;
    }
    var n = document.createElement(tag);
    if (typeof cls === "string" && cls) n.className = cls;
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (attrs[k] === null || attrs[k] === undefined || attrs[k] === false) return;
        if (k === "text") return;
        n.setAttribute(k, attrs[k] === true ? "" : attrs[k]);
      });
    }
    return n;
  }

  /* 把字符串写进节点：{{...}} 渲染成“待填”占位 */
  function setText(node, str) {
    node.textContent = "";
    var s = String(str === undefined || str === null ? "" : str);
    s.split(/(\{\{[^}]*\}\})/).forEach(function (part) {
      if (!part) return;
      if (/^\{\{[\s\S]*\}\}$/.test(part)) {
        var ph = el("span", "ph", { title: part });
        ph.textContent = "待填";
        node.appendChild(ph);
      } else {
        var lines = part.split("\n");
        lines.forEach(function (line, i) {
          if (i) node.appendChild(el("br"));
          node.appendChild(document.createTextNode(line));
        });
      }
    });
    return node;
  }

  function text(str) {
    var span = el("span");
    return setText(span, str);
  }

  function arrow() {
    var ns = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "1.8");
    svg.setAttribute("aria-hidden", "true");
    var p = document.createElementNS(ns, "path");
    p.setAttribute("d", "M5 12h14M13 6l6 6-6 6");
    svg.appendChild(p);
    return svg;
  }

  function chevron(dir) {
    var ns = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "1.8");
    svg.setAttribute("aria-hidden", "true");
    var p = document.createElementNS(ns, "path");
    p.setAttribute("d", dir === "prev" ? "M15 5l-7 7 7 7" : "M9 5l7 7-7 7");
    svg.appendChild(p);
    return svg;
  }

  function isExternal(url) { return /^https?:/i.test(String(url || "")); }

  function hostOf(url) {
    try { return new URL(url, location.href).hostname.replace(/^www\./, ""); }
    catch (e) { return ""; }
  }

  /* ---------------- 区块渲染器 ---------------- */
  var renderers = {};

  /* Hero（v1 版式：左文案 / 右人像 / 底部滚动提示） */
  renderers.hero = function (d) {
    var s = el("section", "hero", { id: "hero" });
    var grid = el("div", "wrap hero__grid");

    /* 左栏 */
    var left = el("div", "hero__text");
    if (d.kicker) {
      var eb = el("p", "eyebrow");
      var dot = el("span", "dot");
      dot.setAttribute("aria-hidden", "true");
      eb.appendChild(dot);
      setText(eb, d.kicker);
      left.appendChild(eb);
    }

    var h1 = el("h1");
    var hl = d.highlight || "";
    (d.lines || []).forEach(function (line, i) {
      var mask = el("span", "mask-line");
      var inner = el("span");
      inner.style.setProperty("--d", (80 + i * 120) + "ms");
      if (hl && line.indexOf(hl) > -1) {
        var idx = line.indexOf(hl);
        inner.appendChild(document.createTextNode(line.slice(0, idx)));
        var em = el("em", "hl");
        em.textContent = hl;
        inner.appendChild(em);
        inner.appendChild(document.createTextNode(line.slice(idx + hl.length)));
      } else {
        inner.appendChild(document.createTextNode(line));
      }
      mask.appendChild(inner);
      h1.appendChild(mask);
    });
    left.appendChild(h1);

    if (d.lead) {
      var sub = el("p", "hero__sub", { "data-reveal": true });
      sub.style.setProperty("--d", "340ms");
      setText(sub, d.lead);
      left.appendChild(sub);
    }

    if (d.meta && d.meta.length) {
      var meta = el("div", "hero__meta", { "data-reveal": true });
      meta.style.setProperty("--d", "440ms");
      d.meta.forEach(function (t) {
        var sp = el("span");
        setText(sp, t);
        meta.appendChild(sp);
      });
      left.appendChild(meta);
    }

    var actions = el("div", "hero__actions", { "data-reveal": true });
    actions.style.setProperty("--d", "520ms");
    if (d.primary && d.primary.label) {
      var pa = el("a", "btn btn--accent", { href: d.primary.href || "#", "data-magnetic": true });
      setText(pa, d.primary.label);
      pa.appendChild(arrow());
      actions.appendChild(pa);
    }
    if (d.secondary && d.secondary.label) {
      var sa = el("a", "btn btn--ghost", { href: d.secondary.href || "#", "data-magnetic": true });
      setText(sa, d.secondary.label);
      actions.appendChild(sa);
    }
    if (d.tertiary && d.tertiary.label) {
      var ta = el("a", "link-line", { href: d.tertiary.href || "#" });
      setText(ta, d.tertiary.label);
      actions.appendChild(ta);
    }
    left.appendChild(actions);
    grid.appendChild(left);

    /* 右栏：人像 */
    if (d.portrait) {
      var wrapP = el("div", "portrait-wrap", { "data-reveal": "scale" });
      wrapP.style.setProperty("--d", "600ms");

      var ring = el("span", "portrait__ring", { "aria-hidden": "true" });
      wrapP.appendChild(ring);

      var box = el("div", "portrait");
      if (d.portrait.tagline) {
        var tl = el("span", "portrait__tagline");
        tl.textContent = d.portrait.tagline;
        box.appendChild(tl);
      }
      var mono = el("span", "portrait__mono", { "aria-hidden": "true" });
      mono.textContent = d.portrait.mark || "";
      box.appendChild(mono);
      if (d.portrait.src) {
        var img = el("img", null, { src: d.portrait.src, alt: "肖像照" });
        img.addEventListener("error", function () {
          img.remove();
          box.classList.add("is-empty");
        });
        box.appendChild(img);
      } else {
        box.classList.add("is-empty");
      }
      ["tl", "tr", "bl", "br"].forEach(function (c) {
        box.appendChild(el("span", "portrait__corner portrait__corner--" + c, { "aria-hidden": "true" }));
      });
      wrapP.appendChild(box);

      if (d.portrait.badgeText) {
        var tag = el("div", "portrait-tag");
        var pill = el("span", "pill pill--live");
        pill.textContent = d.portrait.badgeLabel || "OPEN";
        tag.appendChild(pill);
        var txt = el("span");
        setText(txt, d.portrait.badgeText);
        tag.appendChild(txt);
        wrapP.appendChild(tag);
      }
      grid.appendChild(wrapP);
    }

    s.appendChild(grid);

    if (d.scrollHint) {
      var hint = el("div", "hero__scroll", { "aria-hidden": "true" });
      var t2 = el("span");
      t2.textContent = d.scrollHint;
      hint.appendChild(t2);
      hint.appendChild(el("i"));
      s.appendChild(hint);
    }
    return s;
  };

  /* 数据条 */
  renderers.stats = function (d) {
    var s = el("section", "section--tight", { id: "stats" });
    /* 不再内联改写 padding-top：区块上下留白统一交给 refine.css 的节奏变量 */
    var wrap = el("div", "wrap");
    var box = el("div", "stats", { "data-reveal": true });
    (d.items || []).forEach(function (it, i) {
      var stat = el("div", "stat");
      /* 序号：数据框左上角的小标记，让一排框有秩序感 */
      var no = el("div", "stat__no");
      no.textContent = (i + 1 < 10 ? "0" : "") + (i + 1);
      stat.appendChild(no);

      var num = el("div", "stat__num");
      var span = el("span", null, { "data-count": it.value });
      span.textContent = "0";
      num.appendChild(span);
      if (it.suffix) {
        var sup = el("sup");
        sup.textContent = it.suffix;
        num.appendChild(sup);
      }
      stat.appendChild(num);

      /* 说明与注解归到底部，一排框的基线自动对齐 */
      var body = el("div", "stat__body");
      var lab = el("div", "stat__label");
      setText(lab, it.label);
      body.appendChild(lab);
      if (it.note) {
        var note = el("div", "stat__note");
        setText(note, it.note);
        body.appendChild(note);
      }
      stat.appendChild(body);
      box.appendChild(stat);
    });
    wrap.appendChild(box);
    s.appendChild(wrap);
    return s;
  };

  /* 关于（01） */
  renderers.about = function (d) {
    var s = el("section", "section", { id: "about" });
    var row = el("div", "wrap row");
    row.appendChild(rail(d.no, d.label));

    var body = el("div");
    var lead = el("p", "about__lead", { "data-reveal": true });
    if (d.lead) {
      lead.appendChild(document.createTextNode(d.lead));
      lead.appendChild(el("br"));
    }
    if (d.leadDim) {
      var dim = el("span", "dim");
      setText(dim, d.leadDim);
      lead.appendChild(dim);
    }
    body.appendChild(lead);

    var cols = el("div", "about__cols");
    var col1 = el("div");
    (d.paragraphs || []).forEach(function (t, i) {
      var p = el("p", "body-text", { "data-reveal": true });
      p.style.setProperty("--d", (80 + i * 80) + "ms");
      setText(p, t);
      col1.appendChild(p);
    });
    cols.appendChild(col1);

    if (d.facts && d.facts.length) {
      var dl = el("dl", "fact-list", { "data-reveal": true });
      dl.style.setProperty("--d", "220ms");
      d.facts.forEach(function (f) {
        var rowF = el("div", "fact");
        var dt = el("dt");
        setText(dt, f.k);
        var dd = el("dd");
        setText(dd, f.v);
        rowF.appendChild(dt);
        rowF.appendChild(dd);
        dl.appendChild(rowF);
      });
      cols.appendChild(dl);
    }
    body.appendChild(cols);
    row.appendChild(body);
    s.appendChild(row);
    return s;
  };

  /* 经历（02） */
  renderers.experience = function (d) {
    var s = el("section", "section", { id: "experience" });
    var row = el("div", "wrap row");
    row.appendChild(rail(d.no, d.label));
    var body = el("div");

    var h2 = el("h2", "h2", { "data-reveal": true });
    h2.style.marginBottom = "var(--space-40)";
    if (d.title) h2.appendChild(document.createTextNode(d.title));
    if (d.titleDim) {
      var dim = el("span", "muted");
      setText(dim, d.titleDim);
      h2.appendChild(dim);
    }
    body.appendChild(h2);

    var tl = el("div", "timeline");
    tl.appendChild(el("span", "timeline__fill", { "aria-hidden": "true" }));
    (d.items || []).forEach(function (it) {
      var item = el("article", "tl-item");
      if (String(it.divider) === "true") item.classList.add("tl-item--divided");

      var year = el("span", "tl-item__year");
      setText(year, it.period);
      item.appendChild(year);

      /* logo：没有就留空 —— 列宽固定，其他行照样对齐，不会因为缺一张图整列塌掉 */
      var logoBox = el("span", "tl-item__logo");
      var src = String(it.logo || "").trim();
      if (src) {
        // 公司名不再上屏，但要留作读屏与搜图的说明
        var img = el("img", "", { src: src, alt: it.org || "", loading: "lazy", decoding: "async" });
        logoBox.appendChild(img);
      }
      item.appendChild(logoBox);

      var head = el("div", "tl-item__head");
      var role = el("span", "tl-item__role");
      setText(role, it.role);
      head.appendChild(role);
      item.appendChild(head);

      var desc = el("p", "tl-item__desc");
      setText(desc, it.desc);
      item.appendChild(desc);
      tl.appendChild(item);
    });
    body.appendChild(tl);
    row.appendChild(body);
    s.appendChild(row);
    return s;
  };

  /* 公司（03） */
  renderers.company = function (d) {
    var s = el("section", "section", { id: "company" });
    var row = el("div", "wrap row");
    row.appendChild(rail(d.no, d.label));
    var body = el("div");

    var h2 = el("h2", "h2", { "data-reveal": true });
    h2.style.marginBottom = "var(--space-12)";
    if (d.title) h2.appendChild(document.createTextNode(d.title));
    if (d.titleDim) {
      h2.appendChild(el("br", "only-wide"));
      var dim = el("span", "muted");
      setText(dim, d.titleDim);
      h2.appendChild(dim);
    }
    body.appendChild(h2);

    if (d.lead) {
      var lead = el("p", "lede", { "data-reveal": true });
      lead.style.setProperty("--d", "80ms");
      setText(lead, d.lead);
      body.appendChild(lead);
    }

    var grid = el("div", "info-grid");
    (d.cards || []).forEach(function (c, i) {
      var card = el("div", "info-card", { "data-reveal": true });
      card.style.setProperty("--d", (120 + i * 80) + "ms");
      var idx = el("div", "info-card__idx");
      setText(idx, c.idx);
      var h4 = el("h4");
      setText(h4, c.title);
      var p = el("p");
      setText(p, c.body);
      card.appendChild(idx);
      card.appendChild(h4);
      card.appendChild(p);
      grid.appendChild(card);
    });
    body.appendChild(grid);

    if (d.sector && d.sector.parts && d.sector.parts.length) {
      var wrapS = el("div", { "data-reveal": true });
      wrapS.style.marginTop = "var(--space-32)";
      wrapS.style.maxWidth = "520px";
      wrapS.style.setProperty("--d", "320ms");
      var lab = el("div", "mono");
      setText(lab, d.sector.label || "");
      wrapS.appendChild(lab);

      var bar = el("div", "sector-bar", { "aria-hidden": "true" });
      d.sector.parts.forEach(function (pt, i) {
        var seg = el("i");
        seg.style.width = (pt.pct || 0) + "%";
        seg.style.background = i === 0 ? "var(--accent)" : i === 1 ? "var(--accent-2)" : "var(--border-strong)";
        bar.appendChild(seg);
      });
      wrapS.appendChild(bar);

      var legend = el("div", "sector-legend");
      d.sector.parts.forEach(function (pt, i) {
        var sp = el("span");
        var em = el("em");
        em.style.background = i === 0 ? "var(--accent)" : i === 1 ? "var(--accent-2)" : "var(--border-strong)";
        sp.appendChild(em);
        setText(sp, pt.text);
        legend.appendChild(sp);
      });
      wrapS.appendChild(legend);
      body.appendChild(wrapS);
    }

    row.appendChild(body);
    s.appendChild(row);
    return s;
  };

  /* 岗位（04）：整屏固定 + 滚动横移 */
  renderers.roles = function (d) {
    var s = el("section", "pin", { id: "roles" });
    var stage = el("div", "pin__stage");

    var head = el("div", "pin__head");
    var hl = el("div");
    var r = rail(d.no, d.label);
    r.style.position = "static";
    hl.appendChild(r);
    var h2 = el("h2", "h2");
    h2.style.marginTop = "var(--space-16)";
    setText(h2, d.title || "");
    hl.appendChild(h2);
    head.appendChild(hl);

    var tools = el("div", "pin__tools");
    if (d.note) {
      var note = el("p", "muted");
      note.style.fontSize = "var(--text-sm)";
      note.style.maxWidth = "26ch";
      setText(note, d.note);
      tools.appendChild(note);
    }
    /* 箭头 + 计数：和滚动横移共用同一套位移计算，不另起一套动画 */
    var navctl = el("div", "roles-nav", { role: "group", "aria-label": "岗位切换" });
    var prev = el("button", "roles-nav__btn", {
      type: "button", "data-roles-prev": true, "aria-label": "上一个岗位"
    });
    prev.textContent = "←";
    var cnt = el("span", "roles-nav__count", { "data-roles-count": true, "aria-live": "polite" });
    var next = el("button", "roles-nav__btn", {
      type: "button", "data-roles-next": true, "aria-label": "下一个岗位"
    });
    next.textContent = "→";
    navctl.appendChild(prev);
    navctl.appendChild(cnt);
    navctl.appendChild(next);
    tools.appendChild(navctl);
    head.appendChild(tools);
    stage.appendChild(head);

    var viewport = el("div", "pin__viewport");
    var track = el("div", "pin__track", { "data-pin-track": true });
    (d.items || []).forEach(function (it) {
      var card = el("article", "role");
      var top = el("div", "role__top");
      var no = el("span", "role__no");
      setText(no, it.no);
      top.appendChild(no);
      if (it.badge) {
        var b = el("span", "pill pill--accent");
        setText(b, it.badge);
        top.appendChild(b);
      }
      card.appendChild(top);

      var h3 = el("h3");
      setText(h3, it.title);
      if (it.sub) {
        var em = el("em");
        setText(em, it.sub);
        h3.appendChild(em);
      }
      card.appendChild(h3);

      var desc = el("p", "role__desc");
      setText(desc, it.desc);
      card.appendChild(desc);

      if (it.tags && it.tags.length) {
        var tags = el("div", "role__tags");
        it.tags.forEach(function (t) {
          var tag = el("span", "pill");
          setText(tag, t);
          tags.appendChild(tag);
        });
        card.appendChild(tags);
      }

      var foot = el("div", "role__foot");
      var place = el("span");
      setText(place, it.place);
      foot.appendChild(place);

      /* 每个岗位单独配置投递地址；未配置时保留按钮外观但不可点击。
         只放行常规协议，避免内容里误填 javascript: 之类的地址。*/
      var href = String(it.applyHref == null ? "" : it.applyHref).trim();
      var usable = /^(https?:\/\/|mailto:|\/|\.\/|\.\.\/|#)/i.test(href);
      var apply = usable
        ? el("a", "role__apply", {
            href: href,
            target: "_blank",
            rel: "noopener noreferrer",
            "aria-label": "去投递：" + String(it.title || "该岗位")
          })
        : el("span", "role__apply is-empty", {
            "aria-disabled": "true",
            title: "请先在控制台「岗位（04）」为该岗位填写投递链接"
          });
      apply.textContent = "去投递";
      foot.appendChild(apply);
      card.appendChild(foot);

      track.appendChild(card);
    });
    viewport.appendChild(track);
    stage.appendChild(viewport);

    var hint = el("div", "pin__hint");
    /* 可点击的进度点：点第 N 个就拨到第 N 张卡片 */
    var dots = el("div", "roles-dots", { role: "group", "aria-label": "横向浏览位置" });
    (d.items || []).forEach(function (it, i) {
      dots.appendChild(el("button", "roles-dot", {
        type: "button",
        "data-roles-i": String(i),
        "aria-label": "浏览位置 " + (i + 1)
      }));
    });
    hint.appendChild(dots);
    var bar = el("span", "bar");
    bar.appendChild(el("i"));
    hint.appendChild(bar);
    /* 触屏上没有滚轮和方向键，换一套说法（用 CSS 控制显示哪一个） */
    var ht = el("span", "pin__hint__txt");
    var htWide = el("span", "only-wide");
    htWide.textContent = "滚动 / 拖拽 / ← → 切换";
    var htNarrow = el("span", "only-narrow");
    htNarrow.textContent = "左右滑动切换";
    ht.appendChild(htWide);
    ht.appendChild(htNarrow);
    hint.appendChild(ht);
    stage.appendChild(hint);

    s.appendChild(stage);
    return s;
  };

  /* 结尾 CTA（居中） */
  renderers.cta = function (d) {
    var s = el("section", "section cta", { id: "contact" });
    var wrap = el("div", "wrap");

    if (d.kicker) {
      var k = el("p", "mono", { "data-reveal": true });
      k.style.marginBottom = "var(--space-12)";
      setText(k, d.kicker);
      wrap.appendChild(k);
    }

    var h2 = el("h2", { "data-reveal": true });
    h2.style.setProperty("--d", "60ms");
    (d.lines || []).forEach(function (line, i) {
      if (i) h2.appendChild(el("br"));
      h2.appendChild(text(line));
    });
    wrap.appendChild(h2);

    if (d.body) {
      var p = el("p", { "data-reveal": true });
      p.style.setProperty("--d", "120ms");
      setText(p, d.body);
      wrap.appendChild(p);
    }

    var acts = el("div", "cta__actions", { "data-reveal": true });
    acts.style.setProperty("--d", "180ms");
    if (d.primary && d.primary.label) {
      var pa = el("a", "btn btn--accent", { href: d.primary.href || "#", "data-magnetic": true });
      setText(pa, d.primary.label);
      pa.appendChild(arrow());
      acts.appendChild(pa);
    }
    if (d.secondary && d.secondary.label) {
      var sa = el("a", "btn btn--ghost", { href: d.secondary.href || "#", "data-magnetic": true });
      setText(sa, d.secondary.label);
      acts.appendChild(sa);
    }
    wrap.appendChild(acts);

    var mailAddr = siteEmail() || d.mail;
    if (mailAddr) {
      var mail = el("a", "cta__mail", { href: "mailto:" + mailAddr, "data-reveal": true });
      mail.style.setProperty("--d", "240ms");
      mail.textContent = mailAddr;
      wrap.appendChild(mail);
    }

    s.appendChild(wrap);
    return s;
  };

  /* 左栏序号 */
  function rail(no, label) {
    var r = el("div", "rail");
    if (no) {
      var idx = el("span", "idx");
      idx.textContent = no;
      r.appendChild(idx);
    }
    if (label) {
      var lb = el("span");
      lb.textContent = label;
      r.appendChild(lb);
    }
    return r;
  }

  /* 通用页头 */
  renderers.pagehead = function (d) {
    var s = el("section", "pagehead", { id: "head" });
    var wrap = el("div", "wrap");
    var k = el("p", "kicker");
    setText(k, d.kicker || "");
    wrap.appendChild(k);
    var h1 = el("h1");
    var l1 = el("span");
    setText(l1, d.title || "");
    h1.appendChild(l1);
    if (d.title2) {
      var l2 = el("span");
      setText(l2, d.title2);
      h1.appendChild(l2);
    }
    wrap.appendChild(h1);
    if (d.lead) {
      var lead = el("p", "lead t-body");
      setText(lead, d.lead);
      wrap.appendChild(lead);
    }
    s.appendChild(wrap);
    return s;
  };

  /* 最新动态（数据来自 data/links.json；data/links.js 是 fetch 失败时的回退，
     两者都由 scripts/fetch_links.py 生成，v1/v2 共用同一份存档） */
  renderers.feed = function (d) {
    var s = el("section", "block", { id: "feed" });
    var wrap = el("div", "wrap");
    var head = el("div", "block__head");
    var h2 = el("h2");
    setText(h2, d.title || "");
    head.appendChild(h2);
    var note = el("p");
    setText(note, d.note || "");
    head.appendChild(note);
    wrap.appendChild(head);

    var status = el("div", "status", { "data-feed-status": true });
    wrap.appendChild(status);

    var body = el("div", { "data-feed-rows": true });
    body.style.marginTop = "var(--space-32)";
    body.innerHTML = '<div class="feed__sk" aria-hidden="true"><i class="skeleton"></i><i class="skeleton"></i></div>';
    wrap.appendChild(body);

    s.appendChild(wrap);
    s._mount = function () { mountFeed(body, status); };
    return s;
  };

  /* 模块卡片 + 工具条（搜索 / 分类 / 计数 / 空态） */
  renderers.modules = function (d) {
    var s = el("section", "block", { id: "modules" });
    var wrap = el("div", "wrap");

    var head = el("div", "block__head");
    var h2 = el("h2");
    setText(h2, d.title || "");
    head.appendChild(h2);
    if (d.note) {
      var note = el("p");
      setText(note, d.note);
      head.appendChild(note);
    }
    wrap.appendChild(head);

    // 工具条
    var bar = el("div", "toolbar");
    var inner = el("div", "wrap toolbar__inner");

    var label = el("label", "search");
    var ns = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "1.8");
    svg.setAttribute("aria-hidden", "true");
    var c1 = document.createElementNS(ns, "circle");
    c1.setAttribute("cx", "11"); c1.setAttribute("cy", "11"); c1.setAttribute("r", "6.5");
    var p1 = document.createElementNS(ns, "path");
    p1.setAttribute("d", "M16 16l4.5 4.5");
    svg.appendChild(c1); svg.appendChild(p1);
    label.appendChild(svg);
    var input = el("input", null, { id: "q", type: "search", placeholder: d.search || "搜索", "aria-label": "搜索资源" });
    label.appendChild(input);
    inner.appendChild(label);

    var chips = el("div", "chips", { "data-chipbar": true, role: "group", "aria-label": "按类别筛选" });
    var allBtn = el("button", "chip", { type: "button", "data-filter": "*", "aria-pressed": "true" });
    allBtn.textContent = d.all || "全部";
    chips.appendChild(allBtn);
    var seen = {};
    (d.items || []).forEach(function (m) {
      if (!m.filter || seen[m.filter]) return;
      seen[m.filter] = true;
      var b = el("button", "chip", { type: "button", "data-filter": m.filter, "aria-pressed": "false" });
      b.textContent = m.filter;
      chips.appendChild(b);
    });
    inner.appendChild(chips);

    var count = el("span", "toolbar__count", { id: "count" });
    inner.appendChild(count);
    bar.appendChild(inner);
    wrap.appendChild(bar);

    // 模块
    var host = el("div", { "data-modules": true });
    host.style.marginTop = "var(--space-32)";
    (d.items || []).forEach(function (m) {
      var sec = el("div", null, { "data-module": m.id, "data-filter": m.filter || "" });
      sec.style.marginTop = "var(--space-48)";
      var mh = el("div", "block__head");
      var mh2 = el("h3", "t-h4");
      setText(mh2, m.title);
      mh.appendChild(mh2);
      if (m.note) {
        var mn = el("p");
        setText(mn, m.note);
        mh.appendChild(mn);
      }
      sec.appendChild(mh);

      var cards = el("div", "cards");
      (m.items || []).forEach(function (it, idx) {
        var a = el("a", "lcard", {
          "data-reveal": "rise",
          href: it.url || "#",
          target: isExternal(it.url) ? "_blank" : null,
          rel: isExternal(it.url) ? "noopener noreferrer" : null,
          "data-search": ((it.name || "") + " " + (it.desc || "") + " " + (it.tag || "") + " " + (it.badge || "")).toLowerCase()
        });
        a.style.setProperty("--i", idx % 4);
        var top = el("div", "lcard__top");
        var name = el("span", "lcard__name");
        setText(name, it.name);
        top.appendChild(name);
        var ar = el("span", "lcard__arrow", { "aria-hidden": "true" });
        ar.textContent = "↗";
        top.appendChild(ar);
        a.appendChild(top);

        var desc = el("p", "lcard__desc");
        setText(desc, it.desc);
        a.appendChild(desc);

        var foot = el("div", "lcard__foot");
        if (it.tag) {
          var t = el("span", "tag tag--accent");
          setText(t, it.tag);
          foot.appendChild(t);
        }
        if (it.badge) {
          var b = el("span", "tag");
          setText(b, it.badge);
          foot.appendChild(b);
        }
        var host2 = el("span", "lcard__host");
        host2.textContent = hostOf(it.url) || "";
        foot.appendChild(host2);
        a.appendChild(foot);

        cards.appendChild(a);
      });
      sec.appendChild(cards);
      host.appendChild(sec);
    });
    wrap.appendChild(host);

    // 空态
    var empty = el("div", "empty", { id: "filter-empty" });
    empty.style.display = "none";
    var ep = el("p");
    ep.textContent = d.empty || "没有匹配的结果。";
    empty.appendChild(ep);
    var reset = el("button", "btn btn--ghost btn--sm", { type: "button", id: "filter-reset" });
    reset.textContent = d.resetLabel || "清除筛选";
    empty.appendChild(reset);
    wrap.appendChild(empty);

    s.appendChild(wrap);
    return s;
  };

  /* 更新机制 */
  /* 更新机制：资源库页原先的最后一块。已从页面里撤掉（用户不需要），
     渲染器留着 —— 万一旧草稿或导出的 content.js 里还带着这一节，
     不会白屏，也不会报错。 */
  renderers.mechanism = function (d) {
    var s = el("section", "block", { id: "mechanism" });
    var wrap = el("div", "wrap");
    var box = el("div", "mech");
    var h2 = el("h2");
    setText(h2, d.title || "");
    box.appendChild(h2);
    var steps = el("div", "mech__steps");
    (d.steps || []).forEach(function (st) {
      var one = el("div", "mech__step");
      var b = el("b");
      setText(b, st.no);
      one.appendChild(b);
      var h3 = el("h3");
      setText(h3, st.title);
      one.appendChild(h3);
      var p = el("p");
      setText(p, st.body);
      one.appendChild(p);
      steps.appendChild(one);
    });
    box.appendChild(steps);
    if (d.note) {
      var n = el("p", "mech__note");
      setText(n, d.note);
      box.appendChild(n);
    }
    wrap.appendChild(box);
    s.appendChild(wrap);
    return s;
  };

  /* 页脚说明：页末一行小字，只用一条细线收住，不做成卡片。
     链接都是站外的，「收录不等于推荐」这句要说清楚，但别喧宾夺主。 */
  renderers.footnote = function (d) {
    var s = el("section", "foot-note", { id: "note" });
    var wrap = el("div", "wrap");
    var box = el("div", "foot-note__box");
    if (d.label) {
      var lab = el("span", "foot-note__label");
      setText(lab, d.label);
      box.appendChild(lab);
    }
    var p = el("p", "foot-note__text");
    setText(p, d.text || "");
    box.appendChild(p);
    wrap.appendChild(box);
    s.appendChild(wrap);
    return s;
  };
  /* 手风琴一行最多放 10 张，多出来的换行。
     上限必须固定住：flex 平分宽度，照片一多每条竖条就被挤到几十像素，
     竖排标题根本读不出来，而且整行会一路变窄没有尽头。 */
  var GALLERY_COLS = 10;

  /* 照片还没配标题/说明时，至少给屏幕阅读器一个能读出来的名字，
     别让 aria-label 停在「查看：」、alt 停在 ""。等文案补齐后自动让位。*/
  function photoLabel(f, i) {
    return (f && (f.alt || f.title)) || ("第 " + (i + 1) + " 张照片");
  }

  renderers.frames = function (d) {
    var s = el("section", "gallery", { id: "frames" });
    var wrap = el("div", "wrap gal", { "data-gal": true });
    var items = d.items || [];
    var n = items.length;
    function pad2(v) { return (v < 10 ? "0" : "") + v; }

    var bar = el("div", "gal__bar");
    var hint = el("p", "gal__hint");
    /* 触屏没有 hover，说法要换一套（CSS 决定显示哪一个） */
    var hWide = el("span", "only-wide");
    hWide.textContent = pad2(n) + " frames · 悬停展开 / 点击放大";
    var hNarrow = el("span", "only-narrow");
    hNarrow.textContent = pad2(n) + " frames · 点开看大图";
    hint.appendChild(hWide);
    hint.appendChild(hNarrow);
    bar.appendChild(hint);
    var seg = el("div", "seg", { role: "group", "aria-label": "浏览模式" });
    var bStack = el("button", { type: "button" }, { "data-mode": "stack", "aria-pressed": "true" });
    bStack.textContent = "手风琴";
    var bGrid = el("button", { type: "button" }, { "data-mode": "grid", "aria-pressed": "false" });
    bGrid.textContent = "网格";
    seg.appendChild(bStack);
    seg.appendChild(bGrid);
    bar.appendChild(seg);
    wrap.appendChild(bar);

    /* 照片不足 10 张时按实际张数铺满一行（和以前一样）；
       超过就按 10 张一行切开，最后一行用不可见的占位补齐，
       这样每一行的竖条宽度完全一致，不会出现末行两根巨条。 */
    var rowsHost = el("div", "stack-rows", { "data-rows": true });
    var perRow = Math.max(1, Math.min(GALLERY_COLS, n));

    for (var start = 0; start < n; start += perRow) {
      var row = el("div", "stack", { "data-stack": true });
      row.style.setProperty("--cols", perRow);

      for (var k = 0; k < perRow; k++) {
        var i = start + k;
        var f = items[i];
        if (!f) {
          row.appendChild(el("article", "panel panel--pad", { "aria-hidden": "true" }));
          continue;
        }
        var p = el("article", "panel", {
          tabindex: "0",
          role: "button",
          "aria-label": "查看：" + photoLabel(f, i),
          "data-i": i
        });
        var img = el("img", null, { src: f.src, alt: photoLabel(f, i), loading: i < 3 ? "eager" : "lazy" });
        p.appendChild(img);
        var no = el("span", "panel__no");
        no.textContent = pad2(i + 1);
        p.appendChild(no);
        var spine = el("span", "panel__spine", { "aria-hidden": "true" });
        spine.textContent = f.title;
        p.appendChild(spine);
        var body = el("div", "panel__body");
        var h3 = el("h3");
        setText(h3, f.title);
        body.appendChild(h3);
        var cap = el("p");
        setText(cap, f.caption);
        body.appendChild(cap);
        var meta = el("div", "panel__meta");
        setText(meta, f.place);
        body.appendChild(meta);
        p.appendChild(body);
        row.appendChild(p);
      }
      rowsHost.appendChild(row);
    }
    if (n) wrap.appendChild(rowsHost);

    var grid = el("div", "grid-mode", { "data-grid": true });
    (d.items || []).forEach(function (f, i) {
      var t = el("button", "tile", { type: "button", "data-i": i, "aria-label": "查看：" + photoLabel(f, i) });
      var img = el("img", null, { src: f.src, alt: photoLabel(f, i), loading: "lazy" });
      t.appendChild(img);
      var sp = el("span");
      sp.textContent = f.title;
      t.appendChild(sp);
      grid.appendChild(t);
    });
    wrap.appendChild(grid);

    var mc = el("div", "mcards");
    (d.items || []).forEach(function (f, i) {
      var t = el("button", "mcard", { type: "button", "data-i": i, "aria-label": "查看：" + photoLabel(f, i) });
      var img = el("img", null, { src: f.src, alt: photoLabel(f, i), loading: "lazy" });
      t.appendChild(img);
      var cap = el("span", "mcard__cap");
      var h3 = el("h3");
      setText(h3, f.title);
      cap.appendChild(h3);
      var p = el("p");
      setText(p, f.place);
      cap.appendChild(p);
      t.appendChild(cap);
      mc.appendChild(t);
    });
    wrap.appendChild(mc);

    s.appendChild(wrap);
    return s;
  };

  /* 法务长文 */
  renderers.prose = function (d) {
    var s = el("section", "legal", { id: "body" });
    var wrap = el("div", "wrap");
    (d.blocks || []).forEach(function (b) {
      var sec = el("section", null, b.anchor ? { id: b.anchor } : null);
      if (b.h) {
        var h2 = el("h2");
        setText(h2, b.h);
        sec.appendChild(h2);
      }
      (b.ps || []).forEach(function (t) {
        var p = el("p");
        setText(p, t);
        sec.appendChild(p);
      });
      if (b.list && b.list.length) {
        var ul = el("ul");
        b.list.forEach(function (li) {
          var li2 = el("li");
          setText(li2, li);
          ul.appendChild(li2);
        });
        sec.appendChild(ul);
      }
      wrap.appendChild(sec);
    });
    s.appendChild(wrap);
    return s;
  };

  /* 404 */
  renderers.notfound = function (d) {
    var s = el("section", "pagehead", { id: "head" });
    var wrap = el("div", "wrap");
    var k = el("p", "kicker");
    setText(k, d.kicker || "404");
    wrap.appendChild(k);
    var h1 = el("h1");
    var l1 = el("span");
    setText(l1, d.title || "");
    h1.appendChild(l1);
    wrap.appendChild(h1);
    if (d.lead) {
      var lead = el("p", "lead t-body");
      setText(lead, d.lead);
      wrap.appendChild(lead);
    }
    var acts = el("div", "hero__actions");
    if (d.primary && d.primary.label) {
      var a = el("a", "btn", { href: d.primary.href || "index.html" });
      setText(a, d.primary.label);
      a.appendChild(arrow());
      acts.appendChild(a);
    }
    if (d.secondary && d.secondary.label) {
      var b = el("a", "link-arrow", { href: d.secondary.href || "#" });
      setText(b, d.secondary.label);
      acts.appendChild(b);
    }
    wrap.appendChild(acts);
    s.appendChild(wrap);
    return s;
  };

  /* ---------------- 导航 / 页脚 ---------------- */
  /* 取第一个「字」。不能用 slice(0,1)：emoji 在 JS 里是两个 UTF-16 单元，
     切一半会留下一个孤立的高位代理，浏览器画不出来，只能显示成豆腐块 ——
     这就是左上角那个「空方块」的来历。 */
  function firstChar(s) {
    var arr = typeof Array.from === "function"
      ? Array.from(String(s == null ? "" : s))
      : String(s == null ? "" : s).split("");
    return arr.length ? arr[0] : "";
  }

  /* 导航左侧方块里的字：meta.mark 优先，留空才退回名字首字 */
  function navMark(meta) {
    var m = meta && meta.mark != null ? String(meta.mark).trim() : "";
    return m ? firstChar(m) : firstChar(meta && meta.name);
  }

  /* 方块右边那行字：meta.brand 给了就用它 —— 显式留空 = 不要站名。
     只有 brand 这个键整个不存在时，才退回 meta.name；
     否则清空站名会又冒出名字首字，等于关不掉。 */
  function navBrandLabel(meta) {
    if (!meta) return "";
    if (meta.brand != null) return String(meta.brand).trim();
    return String(meta.name || "").trim();
  }

  /* 浏览器标签页上的图标：meta.favicon 单独可改（一个 emoji 或一个字），
     留空才跟导航方块字走。两者分开，是因为标签栏只有 16px，
     常常需要跟方块里那个字换一个说法（比如方块放名字首字、标签放个羊）。 */
  function tabIcon(meta) {
    var t = meta && meta.favicon != null ? String(meta.favicon).trim() : "";
    return t ? firstChar(t) : navMark(meta);
  }

  /* 标签页图标：控制台「浏览器标签页 → 图标」优先，留空才跟导航方块字走。
     静态的 assets/favicon.svg 只是 JS 没跑时的兜底；
     与其两处维护，不如现画一个 SVG：改一个字段，标签页立刻变。
     底色全透明：标签栏本来就是浅色/深色两套皮肤，压一块黑底反而像贴了个补丁。
     注意必须走 data URL —— 临时 `<svg>` 节点不能直接当图标用。 */
  function applyFavicon(meta) {
    var text = tabIcon(meta);
    if (!text) return;
    var safe = String(text)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">'
      + '<text x="32" y="34" text-anchor="middle" dominant-baseline="central"'
      + ' font-family="-apple-system,BlinkMacSystemFont,Segoe UI,\'PingFang SC\','
      + '\'Hiragino Sans GB\',\'Noto Sans SC\',\'Microsoft YaHei\',sans-serif"'
      + ' font-size="56" fill="#0abab5">' + safe + "</text></svg>";

    var link = document.querySelector('link[rel="icon"]');
    if (!link) {
      link = document.createElement("link");
      link.setAttribute("rel", "icon");
      document.head.appendChild(link);
    }
    link.setAttribute("type", "image/svg+xml");
    link.setAttribute("href", "data:image/svg+xml," + encodeURIComponent(svg));
  }

  function renderNav(c) {
    var host = document.getElementById("nav-root");
    if (!host) return;
    host.innerHTML = "";
    var nav = el("nav", "nav", { "aria-label": "主导航" });

    var brand = el("a", "nav__brand", { href: "index.html" });
    var mark = el("span", "nav__mark", { "aria-hidden": "true" });
    mark.textContent = navMark(c.meta);
    brand.appendChild(mark);
    var label = navBrandLabel(c.meta);
    if (label) {
      var nm = el("span");
      nm.textContent = label;
      brand.appendChild(nm);
    }
    nav.appendChild(brand);

    var links = el("div", "nav__links");
    (c.nav || []).forEach(function (item) {
      var a = el("a", "nav__link" + (item.key === PAGE ? " is-current" : ""), { href: item.href });
      if (item.key === PAGE) a.setAttribute("aria-current", "page");
      a.textContent = item.label;
      links.appendChild(a);
    });
    nav.appendChild(links);

    var tools = el("div", "nav__tools");
    var seg = el("div", "theme-select", { role: "group", "aria-label": "主题" });
    [["light", "浅"], ["dark", "深"]].forEach(function (pair) {
      var b = el("button", { type: "button" }, { "data-theme-set": pair[0], "aria-pressed": "false" });
      b.textContent = pair[1];
      seg.appendChild(b);
    });
    tools.appendChild(seg);
    nav.appendChild(tools);

    host.appendChild(nav);

    // 移动端底部导航
    var tab = document.getElementById("tab-root");
    if (tab) {
      tab.innerHTML = "";
      (c.nav || []).forEach(function (item) {
        var a = el("a", item.key === PAGE ? "is-current" : "", { href: item.href });
        if (item.key === PAGE) a.setAttribute("aria-current", "page");
        a.textContent = item.label;
        tab.appendChild(a);
      });
    }
    applyFavicon(c.meta);
    /* 转场遮罩上那个方块字也跟 meta.mark 走。
       不这么做的话，控制台把方块字改掉之后，导航变了、加载动画还是旧的那个字。
       HTML 里写死的 🐑 只是 JS 还没跑时的兜底。 */
    var veil = document.querySelector(".veil__mark");
    if (veil) veil.textContent = navMark(c.meta);
    syncThemeButtons();
  }

  function renderFooter(c) {
    var host = document.getElementById("footer-root");
    if (!host) return;
    host.innerHTML = "";
    var f = c.footer || {};
    var wrap = el("div", "wrap");

    var grid = el("div", "footer__grid");
    var brand = el("div", "footer__brand");
    var h2 = el("h2");
    h2.textContent = f.brand || "";
    brand.appendChild(h2);
    var p = el("p");
    setText(p, f.tagline || "");
    brand.appendChild(p);
    grid.appendChild(brand);

    (f.columns || []).forEach(function (col) {
      var box = el("div", "footer__col");
      var h3 = el("h3");
      h3.textContent = col.title;
      box.appendChild(h3);
      var ul = el("ul");
      (col.links || []).forEach(function (l) {
        var li = el("li");
        var href = l.href || "";
        /* 页脚里的 mailto 链接同样跟着「联系邮箱」走，别再存第二份地址 */
        if (/^mailto:/i.test(href)) {
          var addr = siteEmail(c);
          if (addr) href = "mailto:" + addr;
        }
        var a = el("a", null, { href: href });
        a.textContent = l.label;
        li.appendChild(a);
        ul.appendChild(li);
      });
      box.appendChild(ul);
      grid.appendChild(box);
    });
    wrap.appendChild(grid);

    var bottom = el("div", "footer__bottom");
    var cp = el("span");
    cp.textContent = f.copyright || "";
    bottom.appendChild(cp);
    var legal = el("div", "footer__legal");
    (f.legal || []).forEach(function (l) {
      var a = el("a", null, { href: l.href });
      a.textContent = l.label;
      legal.appendChild(a);
    });
    bottom.appendChild(legal);
    wrap.appendChild(bottom);

    host.appendChild(wrap);
  }

  /* ---------------- 动态数据：feed ---------------- */
  /* 优先 fetch 最新 JSON（避免脚本缓存），失败时回退到已加载的 SITE_FEED（file:// 场景） */
  function loadFeed(cb) {
    var done = false;
    function finish(data) { if (done) return; done = true; cb(data); }
    if (window.fetch) {
      fetch("data/links.json", { cache: "no-store" })
        .then(function (r) { if (!r.ok) throw new Error("http " + r.status); return r.json(); })
        .then(finish)
        .catch(function () { finish(window.SITE_FEED || null); });
      setTimeout(function () { finish(window.SITE_FEED || null); }, 2500);
    } else {
      finish(window.SITE_FEED || null);
    }
  }

  function mountFeed(body, status) {
    loadFeed(function (feed) { paintFeed(feed, body, status); });
  }

  /* 首页「最新动态」只列最近 20 条，剩下的去 feed.html 看。
     注意：截断只发生在显示层 —— data/links.json 里存的是全量存档，
     scripts/fetch_links.py 每次抓取都往历史里合并，不会覆盖旧条目。 */
  var FEED_HOME_ITEMS = 20;
  /* 单源在首页最多占几条。按日期倒序直接切 20 条时，「GitHub 量化开源」
     这类高频源会一次占掉八九条，页面读起来就不像「动态」而像那个源的列表。
     归档页（feed.html）不受这个限制 —— 那里本来就是「翻过去发过什么」。*/
  var FEED_HOME_PER_SOURCE = 3;
  /* 首页末尾给「还没发生」的条目留几个位置。Codeforces 这类源给的是开赛时间
     （11-15、11-21、12-08…），整源都是未来日程 —— 早先直接按 isAhead 整条滤掉，
     等于把这个源从首页抹掉，一条也看不到。现在不丢：挪到列表尾巴，只留最近 3 条。*/
  var FEED_HOME_UPCOMING = 3;
  /* 「还没发生」的条目不算刚发生。给 12 小时宽限：今天晚些时候开赛的仍然算「今天」。
     注意这个判断只用来「分区」，不再用来「丢弃」。*/
  var FEED_AHEAD_GRACE_MS = 12 * 3600 * 1000;

  function isAhead(it) {
    var t = it && it.date ? Date.parse(it.date) : NaN;
    return isFinite(t) && t > Date.now() + FEED_AHEAD_GRACE_MS;
  }

  /* 按「每个源最多 per 条」扫一遍，够 cap 条就停。日期顺序原样保留。*/
  function takeBalanced(pool, per, cap) {
    var seen = {}, out = [];
    for (var i = 0; i < pool.length && out.length < cap; i++) {
      /* 用展示名当分组键，不用 source id：手动加的条目共用 "wechat-manual"
         这个伪源，按 id 分组会把两个不同的号算成一家。*/
      var key = pool[i].source_name || pool[i].source || "?";
      if ((seen[key] || 0) >= per) continue;
      seen[key] = (seen[key] || 0) + 1;
      out.push(pool[i]);
    }
    return out;
  }

  /* 把条目分成「还没发生」和「已发生」两堆，未来那堆按「离现在最近」升序。
     首页和归档页共用：首页要把未来条目挂在末尾，归档页要把它拎成独立分组，
     两边都不能像上一版那样直接丢掉（Codeforces 的源配置是 filter: "upcoming"，
     产出的 100% 是赛程，滤完这条源就彻底消失了）。*/
  function partitionAhead(all) {
    var soon = [], past = [];
    for (var i = 0; i < all.length; i++) {
      if (isAhead(all[i])) soon.push(all[i]);
      else past.push(all[i]);
    }
    /* 最近的赛程排在最前：12-08 不该压着 11-15 */
    soon.sort(function (x, y) {
      return (Date.parse(x.date) || 0) - (Date.parse(y.date) || 0);
    });
    return { soon: soon, past: past };
  }

  /* 首页那 20 条怎么挑：
     ① 分成「已发生」和「还没发生」两堆；
     ② 已发生的那堆按「每源 3 条」起配额，凑不满就整体放宽到 4、5…
        上限是 20 减去结尾要留给未来条目的位置；
     ③ 还没发生的按「离现在最近」排序，挂在最后，最多 3 条。

     不能反过来做（先按配额取，再把被压下的补进来）—— 补位时会从被压得
     最狠的那个源开始抓，等于把刚压下去的量又还回去。实测那样「每源 3 条」
     最后仍然是 GitHub 占 8 条。*/
  function homeFeed(all) {
    var parts = partitionAhead(all);
    var past = parts.past, soon = parts.soon;

    /* 结尾那几条也算进 20 条的总额度里，否则「20 条」会变成 23 条 */
    var tail = Math.min(FEED_HOME_UPCOMING, soon.length);
    var budget = Math.max(0, FEED_HOME_ITEMS - tail);

    var out = [];
    /* per 一直放宽到「把 past 全放进来也填不满」为止 —— 写死 per <= past.length
       会在 past 只有 1、2 条（少于初始配额 3）时一次都不循环，直接返回空。*/
    for (var per = FEED_HOME_PER_SOURCE; ; per++) {
      out = takeBalanced(past, per, budget);
      if (out.length >= budget || per >= past.length) break;
    }

    return out.concat(takeBalanced(soon, FEED_HOME_PER_SOURCE, tail));
  }

  /* 列表里第一条「还没发生」的位置 —— 分隔线插在这儿。没有就返回 -1。*/
  function firstUpcomingAt(items) {
    for (var i = 0; i < items.length; i++) {
      if (isAhead(items[i])) return i;
    }
    return -1;
  }

  /* 部分抓取源失败时的提示条。
     状态栏只写「x / y」的话，访客看不出是哪一块内容停更了，也不会意识到
     列表可能不全；失败源的名字与原因由 fetch_links.py 写进 stats.failed_sources。
     全部失败时脚本不写文件，页面会停在 last-good + 旧的同步时间，不会走这里。*/
  function feedNotice(st) {
    var failed = st.sources_failed || 0;
    var rows = (st.failed_sources || []).filter(Boolean);
    var box = el("div", "feed__note", { role: "status" });

    var txt = el("p", "feed__note-txt");
    var names = rows.map(function (r) { return r.name; }).filter(Boolean);
    txt.textContent = names.length
      ? "有 " + failed + " 个数据源这次没抓到（" + names.join("、") + "），相关条目可能不是最新的。"
      : "有 " + failed + " 个数据源这次没抓到，相关条目可能不是最新的。";
    box.appendChild(txt);

    if (rows.length) {
      var det = el("details", "feed__note-detail");
      var sum = el("summary");
      sum.textContent = "看看原因";
      det.appendChild(sum);
      rows.forEach(function (r) {
        var line = el("p", "feed__note-row");
        line.textContent = (r.name || "未命名源") + "：" + (r.error || "未返回内容")
          + (r.stale ? "（当前展示的是上次抓到的内容）" : "");
        det.appendChild(line);
      });
      box.appendChild(det);
    }
    return box;
  }

  function paintFeed(feed, body, status) {
    if (!feed || !feed.items) {
      status.style.display = "none";
      body.innerHTML = "";
      var box = el("div", "empty");
      var p = el("p");
      p.textContent = "动态数据还没生成。运行 python3 scripts/fetch_links.py 后再刷新。";
      box.appendChild(p);
      var btn = el("button", "btn btn--ghost btn--sm", { type: "button" });
      btn.textContent = "重新加载";
      btn.addEventListener("click", function () { location.reload(); });
      box.appendChild(btn);
      body.appendChild(box);
      return;
    }

    var all = feed.items || [];
    var st = feed.stats || {};
    status.innerHTML = "";
    [
      ["最近同步", feed.generated_at_human || "—"],
      ["数据源", (st.sources_ok || 0) + " / " + (st.sources_total || 0)],
      ["收录", (st.items || all.length) + " 条"],
      ["周期", "6 小时"]
    ].forEach(function (pair) {
      var cell = el("div", "status__cell");
      var b = el("b");
      b.textContent = pair[1];
      var s2 = el("span");
      s2.textContent = pair[0];
      cell.appendChild(s2);
      cell.appendChild(b);
      status.appendChild(cell);
    });

    /* 首页固定只列最近 20 条。以前写死 slice(0, 12) 且状态栏报的是真实总数，
       会出现「说有 20 条、只列 12 条」的自相矛盾；现在状态栏显示的是「收录」
       总量，列表明确只给最近 20 条，差额由下面的「更多内容」承接。
       挑选规则（单源配额 + 跳过未发生的）见 homeFeed()。*/
    var items = homeFeed(all);
    body.innerHTML = "";
    if (st.sources_failed > 0) body.appendChild(feedNotice(st));
    if (!items.length) {
      var e2 = el("div", "empty");
      var p2 = el("p");
      p2.textContent = "所有源都没有返回条目。稍后再试，或检查 sources.json。";
      e2.appendChild(p2);
      body.appendChild(e2);
      return;
    }

    var list = el("div", "feed");
    var split = firstUpcomingAt(items);
    items.forEach(function (it, idx) {
      if (idx === split) list.appendChild(feedSplit());
      list.appendChild(feedRow(it));
    });
    body.appendChild(list);
    body.appendChild(feedMoreLink(all.length, items.length));
  }

  /* 分隔线。日期列本身已经写了「4 天后」「28 天后」，但没有这道线的话，
     从「3 小时前」直接跳到「28 天后」会被读成排序坏了。*/
  function feedSplit() {
    var d = el("div", "feed__split");
    var s = el("span");
    s.textContent = "接下来的安排";
    d.appendChild(s);
    return d;
  }

  /* 一条动态。首页和归档页共用，免得两处样式慢慢长歪。 */
  function feedRow(it) {
    var a = el("a", "feed__row", {
      href: it.url,
      target: "_blank",
      rel: "noopener noreferrer",
      "data-search": ((it.title || "") + " " + (it.source_name || "")).toLowerCase()
    });
    var src = el("span", "feed__src");
    src.textContent = it.source_name || "";
    a.appendChild(src);

    var mid = el("span");
    var t = el("span", "feed__title");
    t.textContent = it.title || "";
    mid.appendChild(t);
    if (it.summary) {
      var d = el("span", "feed__desc");
      d.textContent = it.summary;
      d.style.display = "block";
      mid.appendChild(d);
    }
    a.appendChild(mid);

    /* 未来日期不必额外加标记：shortDate() 对还没到的日期本来就输出
       「即将」/「N 天后」，再套一层会变成「即将 28 天后」。*/
    var date = el("span", "feed__date");
    date.textContent = shortDate(it.date);
    a.appendChild(date);

    var ar = el("span", "feed__arrow", { "aria-hidden": "true" });
    ar.textContent = "↗";
    a.appendChild(ar);
    return a;
  }

  /* 「更多内容」入口。即使当前总数没超过 20 也给 —— 归档页还能按来源筛选，
     它是「逛过去发过什么」的入口，不只是列表溢出的容器。 */
  function feedMoreLink(total, shown) {
    var wrap = el("div", "feed__more");
    wrap.style.cssText = "display:flex;justify-content:center;margin-top:var(--space-32)";
    var a = el("a", "btn btn--ghost btn--sm", { href: "feed.html" });
    a.textContent = "更多内容 · 共 " + total + " 条 →";
    wrap.appendChild(a);
    return wrap;
  }

  /* ---------------- 归档页（feed.html）：全部动态 ---------------- */

  /* 这个页面不读 content.js 的 pages：它的内容取决于运行时的存档条数，
     而 content.js 会被控制台「发布」整体重写，把它塞进去迟早被覆盖。
     这里只借用导航、页脚和 meta，主体自己搭。 */
  function renderArchivePage() {
    var main = document.getElementById("main");
    if (!main) return;
    main.innerHTML = "";

    var head = el("section", "pagehead", { id: "head" });
    /* 归档页的标题自成一段，样式记录不要和「量化信息库」共用 */
    head.dataset.tbPage = "feed";
    var hwrap = el("div", "wrap");
    var k = el("p", "kicker");
    k.textContent = "量化信息库 · 归档";
    hwrap.appendChild(k);
    var h1 = el("h1");
    var t1 = el("span");
    t1.textContent = "全部动态";
    h1.appendChild(t1);
    hwrap.appendChild(h1);
    var lead = el("p", "lead t-body");
    lead.textContent = "每六小时同步一次。旧条目留在存档里，不会被下一次抓取覆盖。";
    hwrap.appendChild(lead);
    head.appendChild(hwrap);
    main.appendChild(head);

    var sec = el("section", "block", { id: "feed-archive" });
    var wrap = el("div", "wrap");
    var status = el("div", "status");
    wrap.appendChild(status);

    var chips = el("div", "chips", { role: "group", "aria-label": "按来源筛选" });
    chips.style.marginTop = "var(--space-32)";
    wrap.appendChild(chips);

    var body = el("div");
    body.innerHTML = '<div class="feed__sk" aria-hidden="true"><i class="skeleton"></i><i class="skeleton"></i></div>';
    wrap.appendChild(body);

    sec.appendChild(wrap);
    main.appendChild(sec);

    loadFeed(function (feed) { paintArchive(feed, body, status, chips); });
  }

  function monthKey(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return d.getFullYear() + " 年 " + (d.getMonth() + 1) + " 月";
  }

  function paintArchive(feed, body, status, chips) {
    var all = (feed && feed.items) || [];
    var st = (feed && feed.stats) || {};

    status.innerHTML = "";
    var from = all.length ? monthKey(all[all.length - 1].date) : "";
    [
      ["收录", all.length + " 条"],
      ["最近同步", (feed && feed.generated_at_human) || "—"],
      ["覆盖", from ? from + " 至今" : "—"],
      ["存档上限", (st.archive_max || "—") + " 条"]
    ].forEach(function (pair) {
      var cell = el("div", "status__cell");
      var b = el("b");
      b.textContent = pair[1];
      var s2 = el("span");
      s2.textContent = pair[0];
      cell.appendChild(s2);
      cell.appendChild(b);
      status.appendChild(cell);
    });

    /* 提示条挂在 body 外面：切来源筛选时 renderList 会清空 body，
       挂在里面会被一起清掉，而这个提示跟筛选无关，应该一直看得见。*/
    if (st.sources_failed > 0 && body.parentNode) {
      body.parentNode.insertBefore(feedNotice(st), body);
    }

    // 按来源分组做筛选，计数直接写在按钮上，省一个「共几条」的说明
    var groups = {};
    var order = [];
    all.forEach(function (it) {
      var name = it.source_name || "其他";
      if (!groups[name]) {
        groups[name] = [];
        order.push(name);
      }
      groups[name].push(it);
    });

    var monthStyle =
      "margin:var(--space-40) 0 var(--space-8);font-family:var(--font-mono);" +
      "font-size:12px;letter-spacing:.06em;color:var(--text-3)";

    function renderList(filter) {
      var rows = filter === "*" ? all : groups[filter] || [];
      body.innerHTML = "";
      if (!rows.length) {
        var e2 = el("div", "empty");
        var p2 = el("p");
        p2.textContent = "这条来源下还没有条目。";
        e2.appendChild(p2);
        body.appendChild(e2);
        return;
      }

      /* 小标题 + 一个新的列表容器，返回容器 */
      function section(text) {
        var h3 = el("h3");
        h3.style.cssText = monthStyle;
        h3.textContent = text;
        body.appendChild(h3);
        var box = el("div", "feed");
        body.appendChild(box);
        return box;
      }

      var parts = partitionAhead(rows);

      /* 还没发生的单独成组，放在最前面。以前它们混在月份分节里，
         12-08 的比赛会排在整个存档的最顶部，看着像排序坏了。*/
      if (parts.soon.length) {
        var soonBox = section("接下来的安排");
        parts.soon.forEach(function (it) { soonBox.appendChild(feedRow(it)); });
      }

      // 按年月分节：存档攒到几百条以后，没有分节就是一片墙
      var curMonth = null;
      var list = null;
      parts.past.forEach(function (it) {
        var mk = monthKey(it.date);
        if (mk !== curMonth) {
          curMonth = mk;
          if (mk) {
            list = section(mk);
          } else if (!list) {
            /* 没日期的条目落到一个无标题的分节里，别给它硬造一个空标题 */
            list = el("div", "feed");
            body.appendChild(list);
          }
        }
        list.appendChild(feedRow(it));
      });
    }

    function addChip(label, value, count) {
      var b = el("button", "chip", { type: "button", "aria-pressed": "false" });
      b.textContent = label + " " + count;
      b.addEventListener("click", function () {
        chips.querySelectorAll(".chip").forEach(function (x) {
          x.setAttribute("aria-pressed", "false");
        });
        b.setAttribute("aria-pressed", "true");
        renderList(value);
      });
      chips.appendChild(b);
      return b;
    }

    chips.innerHTML = "";
    var allBtn = addChip("全部", "*", all.length);
    allBtn.setAttribute("aria-pressed", "true");
    order.forEach(function (name) { addChip(name, name, groups[name].length); });

    renderList("*");
  }

  function shortDate(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    var now = new Date();
    var diff = (now - d) / 86400000;
    if (diff < 0) {
      var days = Math.ceil(-diff);
      return days <= 1 ? "即将" : days + " 天后";
    }
    if (diff < 1) return "今天";
    if (diff < 2) return "昨天";
    if (diff < 30) return Math.floor(diff) + " 天前";
    return (d.getMonth() + 1) + "/" + d.getDate();
  }

  /* ---------------- 组装页面 ---------------- */
  function buildSection(id, data) {
    var fn = renderers[data.type];
    if (!fn) return null;
    var node = fn(data);
    node.setAttribute("data-sec", id);
    node.querySelectorAll("h2").forEach(function (h) {
      if (!h.hasAttribute("data-reveal")) h.setAttribute("data-reveal", "clip");
    });
    return node;
  }

  function renderPage(c, pageKey, opts) {
    var page = c.pages[pageKey];
    var main = document.getElementById("main");
    if (!page || !main) return;
    var keepY = opts && opts.keepScroll ? window.scrollY : 0;

    main.innerHTML = "";
    var frag = document.createDocumentFragment();
    (page.order || []).forEach(function (id) {
      var data = page.sections[id];
      if (!data) return;
      var node = buildSection(id, data);
      if (!node) return;
      frag.appendChild(node);
    });
    main.appendChild(frag);
    stampBlocks(main);

    if (opts && opts.instant) {
      main.querySelectorAll("[data-reveal]").forEach(function (n) { n.classList.add("is-in"); });
    }

    boot();
    if (opts && opts.keepScroll) window.scrollTo(0, keepY);
  }

  /* 只换某一段，用于控制台实时预览 */
  function patchSection(id) {
    var page = state.content.pages[PAGE];
    var data = page && page.sections[id];
    if (!data) return false;
    var old = document.querySelector('[data-sec="' + id + '"]');
    var node = buildSection(id, data);
    if (!node) return false;
    node.setAttribute("data-instant", "true");
    node.querySelectorAll("[data-reveal]").forEach(function (n) { n.classList.add("is-in"); });
    if (old && old.parentNode) old.parentNode.replaceChild(node, old);
    else document.getElementById("main").appendChild(node);
    stampBlocks(node);
    boot(node);
    return true;
  }

  /* ---------------- 交互绑定 ---------------- */
  var bound = new WeakSet();

  var pendingReveal = [];
  var sweepRaf = 0;

  function markIn(node) {
    node.classList.add("is-in");
    var i = pendingReveal.indexOf(node);
    if (i > -1) pendingReveal.splice(i, 1);
  }

  function sweepReveal() {
    sweepRaf = 0;
    if (!pendingReveal.length) return;
    var vh = window.innerHeight;
    for (var i = pendingReveal.length - 1; i >= 0; i--) {
      var r = pendingReveal[i].getBoundingClientRect();
      // 进入视口下沿，或已经被滚过头（锚点跳转、快速滚动）都立即显示
      if (r.top < vh * 0.94 || r.bottom < 0) markIn(pendingReveal[i]);
    }
  }

  function queueSweep() {
    if (sweepRaf) return;
    sweepRaf = requestAnimationFrame(sweepReveal);
  }

  var pendingReveal = [];
  var sweepRaf = 0;

  function markIn(node) {
    node.classList.add("is-in");
    var i = pendingReveal.indexOf(node);
    if (i > -1) pendingReveal.splice(i, 1);
  }

  function sweepReveal() {
    sweepRaf = 0;
    if (!pendingReveal.length) return;
    var vh = window.innerHeight;
    for (var i = pendingReveal.length - 1; i >= 0; i--) {
      var r = pendingReveal[i].getBoundingClientRect();
      // 进入视口下沿，或已经被滚过头（锚点跳转、快速滚动）都立即显示
      if (r.top < vh * 0.94 || r.bottom < 0) markIn(pendingReveal[i]);
    }
  }

  function queueSweep() {
    if (sweepRaf) return;
    sweepRaf = requestAnimationFrame(sweepReveal);
  }

  function revealAll(root) {
    var nodes = Array.prototype.slice.call((root || document).querySelectorAll("[data-reveal]:not(.is-in)"));
    if (!nodes.length) return;

    if (!("IntersectionObserver" in window)) {
      nodes.forEach(markIn);
      return;
    }

    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (e.isIntersecting || e.boundingClientRect.top < 0) markIn(e.target);
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -6% 0px" });

    nodes.forEach(function (n) {
      var r = n.getBoundingClientRect();
      if (r.bottom < 0) { markIn(n); return; }
      io.observe(n);
      pendingReveal.push(n);
    });

    if (!revealAll._bound) {
      revealAll._bound = true;
      window.addEventListener("scroll", queueSweep, { passive: true });
      window.addEventListener("resize", queueSweep);
    }
    queueSweep();
  }

  /* 数字递增 */
  function bindCounters(root) {
    var nodes = (root || document).querySelectorAll("[data-count]:not([data-counted])");
    if (!nodes.length) return;
    var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    Array.prototype.forEach.call(nodes, function (n) {
      n.setAttribute("data-counted", "1");
      var target = parseFloat(n.getAttribute("data-count")) || 0;
      if (reduce || !("IntersectionObserver" in window)) {
        n.textContent = target;
        return;
      }
      var run = function () {
        var t0 = performance.now();
        (function step(t) {
          var p = Math.min(1, (t - t0) / 1400);
          var e2 = 1 - Math.pow(1 - p, 3);
          n.textContent = Math.round(target * e2);
          if (p < 1) requestAnimationFrame(step);
        })(t0);
      };

      // 已经在视口内（例如控制台预览整页可见）就直接开始，不等观察器回调
      var r0 = n.getBoundingClientRect();
      if (r0.top < (window.innerHeight || 0) * 0.92 && r0.bottom > 0) {
        run();
        return;
      }

      var io = new IntersectionObserver(function (es) {
        es.forEach(function (e) {
          if (!e.isIntersecting) return;
          io.disconnect();
          run();
        });
      }, { threshold: 0.4 });
      io.observe(n);
    });
  }

  /* 磁吸按钮 */
  function bindMagnetic(root) {
    var fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    if (!fine || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    var nodes = (root || document).querySelectorAll("[data-magnetic]:not([data-mag])");
    Array.prototype.forEach.call(nodes, function (btn) {
      btn.setAttribute("data-mag", "1");
      btn.addEventListener("mousemove", function (e) {
        var r = btn.getBoundingClientRect();
        var x = (e.clientX - r.left - r.width / 2) * 0.22;
        var y = (e.clientY - r.top - r.height / 2) * 0.22;
        btn.style.transform = "translate(" + x.toFixed(1) + "px," + y.toFixed(1) + "px)";
      });
      btn.addEventListener("mouseleave", function () { btn.style.transform = ""; });
    });
  }

  /* 岗位区：粘性钉住 + 滚轮驱动横移
     滚动期间整页不动，只有卡片横向移动；舞台高度固定为一屏，
     多出的行程由 .pin 的额外高度提供。 */
  var pinMeasure = null;
  function updatePin(remeasure) {
    var pin = document.querySelector(".pin");
    if (!pin) return;
    var track = pin.querySelector("[data-pin-track]");
    if (!track) return;
    var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var enable = window.innerWidth > 900 && !reduce;

    if (!enable) {
      pin.style.height = "";
      track.style.transform = "";
      pinMeasure = null;
      return;
    }

    if (remeasure !== false || pinMeasure === null) {
      pinMeasure = Math.max(track.scrollWidth - window.innerWidth, 0);
      pin.style.height = (window.innerHeight + pinMeasure) + "px";
    }
    var dist = pinMeasure || 0;
    if (dist <= 0) {
      track.style.transform = "";
      return;
    }
    var rect = pin.getBoundingClientRect();
    var total = pin.offsetHeight - window.innerHeight;
    var p = Math.min(1, Math.max(0, -rect.top / (total || 1)));
    track.style.transform = "translate3d(" + (-p * dist).toFixed(1) + "px,0,0)";

    var bar = pin.querySelector(".pin__hint .bar i");
    if (bar) bar.style.transform = "scaleX(" + p + ")";
  }

  /* ------------------------------------------------------------------
     岗位区的「非滚动」操作方式：箭头 / 进度点 / 方向键 / 拖拽
     它们都不直接改轨道 transform，而是把 window.scrollY 拨到对应位置，
     因此运动时仍然完全走上面 updatePin 的粘性横移，视觉保持一致。
     窄屏（原生横向 scroll-snap）则改为拨 track.scrollLeft。
     ------------------------------------------------------------------ */
  function rolesNative() {
    return window.innerWidth <= 900 ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }
  function rolesParts() {
    var pin = document.querySelector(".pin");
    if (!pin) return null;
    var track = pin.querySelector("[data-pin-track]");
    var cards = track ? Array.prototype.slice.call(track.querySelectorAll(".role")) : [];
    if (!cards.length) return null;
    return { pin: pin, track: track, cards: cards };
  }
  function rolesStep(parts) {
    return parts.cards.length > 1
      ? Math.max(1, parts.cards[1].offsetLeft - parts.cards[0].offsetLeft)
      : Math.max(1, parts.cards[0].offsetWidth);
  }
  /* 桌面端把整段横向行程按卡片数均分成 n-1 档：
     这样每个进度点都有独立位置，不会出现「后几个点挤在同一个终点」。
     窄屏是原生横向滚动，仍按卡片宽度步进。 */
  function rolesIndex(parts) {
    var last = Math.max(1, parts.cards.length - 1);
    if (rolesNative()) return Math.round(parts.track.scrollLeft / rolesStep(parts));
    var rect = parts.pin.getBoundingClientRect();
    var total = parts.pin.offsetHeight - window.innerHeight;
    var p = Math.min(1, Math.max(0, -rect.top / (total || 1)));
    return Math.round(p * last);
  }
  function rolesGo(parts, i) {
    var n = parts.cards.length;
    var last = Math.max(1, n - 1);
    i = Math.max(0, Math.min(n - 1, i));
    if (rolesNative()) {
      parts.track.scrollTo({ left: i * rolesStep(parts), behavior: "smooth" });
    } else {
      var total = parts.pin.offsetHeight - window.innerHeight;
      var pinTop = parts.pin.getBoundingClientRect().top + window.scrollY;
      window.scrollTo({ top: pinTop + (i / last) * total, behavior: "smooth" });
    }
    updateRolesNav(parts, i);
  }
  function updateRolesNav(parts, forceIndex) {
    parts = parts || rolesParts();
    if (!parts) return;
    var n = parts.cards.length;
    var i = forceIndex === undefined ? rolesIndex(parts) : forceIndex;
    i = Math.max(0, Math.min(n - 1, i));
    var pad = function (x) { return (x < 10 ? "0" : "") + x; };
    var cnt = parts.pin.querySelector("[data-roles-count]");
    if (cnt) cnt.textContent = pad(i + 1) + " / " + pad(n);
    parts.pin.querySelectorAll("[data-roles-i]").forEach(function (d) {
      var on = Number(d.dataset.rolesI) === i;
      d.classList.toggle("is-on", on);
      d.setAttribute("aria-current", on ? "true" : "false");
    });
    var prev = parts.pin.querySelector("[data-roles-prev]");
    var next = parts.pin.querySelector("[data-roles-next]");
    if (prev) prev.disabled = i <= 0;
    if (next) next.disabled = i >= n - 1;
  }
  function bindRolesNav(root) {
    var pin = (root && root.classList && root.classList.contains("pin"))
      ? root
      : document.querySelector(".pin");
    if (!pin) return;
    if (pin.dataset.rolesBound) { updateRolesNav(); return; }
    pin.dataset.rolesBound = "1";

    var parts = {
      pin: pin,
      track: pin.querySelector("[data-pin-track]"),
      cards: Array.prototype.slice.call(pin.querySelectorAll(".role"))
    };
    if (!parts.track || !parts.cards.length) return;

    /* 窄屏 / 触屏是原生横向滚动，需要监听轨道本身才能同步进度点 */
    var trackRaf = 0;
    parts.track.addEventListener("scroll", function () {
      if (trackRaf) return;
      trackRaf = requestAnimationFrame(function () {
        trackRaf = 0;
        updateRolesNav(parts);
      });
    }, { passive: true });

    pin.addEventListener("click", function (e) {
      if (e.target.closest("[data-roles-prev]")) { rolesGo(parts, rolesIndex(parts) - 1); return; }
      if (e.target.closest("[data-roles-next]")) { rolesGo(parts, rolesIndex(parts) + 1); return; }
      var dot = e.target.closest("[data-roles-i]");
      if (dot) rolesGo(parts, Number(dot.dataset.rolesI));
    });

    /* 鼠标拖拽：横向位移 1:1 换算成页面滚动，松手吸附到最近一张 */
    var vp = pin.querySelector(".pin__viewport");
    if (vp) {
      var drag = null;
      vp.addEventListener("dragstart", function (e) { e.preventDefault(); });
      vp.addEventListener("pointerdown", function (e) {
        if (e.pointerType !== "mouse" || e.button !== 0) return;
        drag = {
          x: e.clientX, y: window.scrollY, left: parts.track.scrollLeft,
          id: e.pointerId, moved: false
        };
      });
      vp.addEventListener("pointermove", function (e) {
        if (!drag) return;
        var dx = e.clientX - drag.x;
        if (!drag.moved) {
          if (Math.abs(dx) < 6) return;
          drag.moved = true;
          vp.classList.add("is-dragging");
          try { vp.setPointerCapture(drag.id); } catch (err) {}
        }
        if (rolesNative()) parts.track.scrollLeft = drag.left - dx;
        /* 拖拽必须瞬时跟随，否则 html 的 scroll-behavior:smooth 会让滚动一直滞后 */
        else window.scrollTo({ top: drag.y - dx, behavior: "instant" });
      });
      var endDrag = function () {
        if (!drag) return;
        var moved = drag.moved;
        drag = null;
        vp.classList.remove("is-dragging");
        if (moved) rolesGo(parts, rolesIndex(parts));
      };
      vp.addEventListener("pointerup", endDrag);
      vp.addEventListener("pointercancel", endDrag);
      vp.addEventListener("lostpointercapture", endDrag);
    }
    updateRolesNav(parts);
  }

  /* 时间线填充 */
  function updateTimeline() {
    var tl = document.querySelector(".timeline");
    if (!tl) return;
    var vh = window.innerHeight;
    var r = tl.getBoundingClientRect();
    var p = Math.min(1, Math.max(0, (vh * 0.62 - r.top) / r.height));
    var fill = tl.querySelector(".timeline__fill");
    if (fill) fill.style.height = (p * 100) + "%";
    tl.querySelectorAll(".tl-item").forEach(function (it) {
      it.classList.toggle("is-active", it.getBoundingClientRect().top < vh * 0.66);
    });
  }

  function bindGallery(root) {
    var gal = (root || document).querySelector("[data-gal]");
    if (!gal || gal.dataset.bound) return;
    gal.dataset.bound = "1";

    var items = (state.content.pages.gallery.sections.frames.items || []).slice();

    gal.querySelectorAll("[data-mode]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var mode = btn.dataset.mode;
        gal.classList.toggle("is-grid", mode === "grid");
        gal.querySelectorAll("[data-mode]").forEach(function (b) {
          b.setAttribute("aria-pressed", String(b === btn));
        });
      });
    });

    /* 占位条（panel--pad）没有 data-i，不能绑点击，否则索引会错位 */
    var panels = gal.querySelectorAll(".panel[data-i]");
    var isTouch = window.matchMedia("(hover: none)").matches;

    function open(i) {
      var lb = document.getElementById("lightbox");
      if (!lb) return;
      var d = items[i];
      if (!d) return;
      lb.dataset.i = i;
      lb.querySelector("img").src = d.src;
      lb.querySelector("img").alt = photoLabel(d, i);
      /* 标题/说明是作者有意留空的，不要拿「第 N 张照片」去填这段可见文案；
         兜底只用在 alt / aria-label 这类读屏属性上。*/
      lb.querySelector("[data-lb-cap]").textContent = d.caption || d.title || "";
      lb.querySelector("[data-lb-meta]").textContent =
        (i + 1 < 10 ? "0" : "") + (i + 1) + " / " + (d.place || "");
      lb.classList.add("is-on");
      document.body.style.overflow = "hidden";
      lb.querySelector(".lb-close").focus();
    }
    function close() {
      var lb = document.getElementById("lightbox");
      if (!lb) return;
      lb.classList.remove("is-on");
      document.body.style.overflow = "";
    }

    Array.prototype.forEach.call(panels, function (p, i) {
      p.addEventListener("click", function () {
        if (isTouch && !p.classList.contains("is-open")) {
          panels.forEach(function (x) { x.classList.remove("is-open"); });
          p.classList.add("is-open");
          return;
        }
        open(i);
      });
      p.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(i); }
      });
    });

    gal.querySelectorAll(".tile, .mcard").forEach(function (t) {
      t.addEventListener("click", function () { open(parseInt(t.dataset.i, 10)); });
    });

    var lb = document.getElementById("lightbox");
    if (lb && !lb.dataset.bound) {
      lb.dataset.bound = "1";
      lb.addEventListener("click", function (e) {
        if (e.target === lb) close();
        var act = e.target.closest("[data-lb]");
        if (!act) return;
        var i = parseInt(lb.dataset.i || "0", 10);
        if (act.dataset.lb === "close") close();
        if (act.dataset.lb === "prev") open((i - 1 + items.length) % items.length);
        if (act.dataset.lb === "next") open((i + 1) % items.length);
      });
    }
  }

  function bindLinksTools(root) {
    var host = (root || document).querySelector("[data-modules]");
    if (!host || host.dataset.bound) return;
    host.dataset.bound = "1";

    var chips = document.querySelector("[data-chipbar]");
    var input = document.getElementById("q");
    var count = document.getElementById("count");
    var currentCat = "*";

    function apply() {
      var q = (input && input.value || "").trim().toLowerCase();
      var visible = 0;
      host.querySelectorAll(".lcard").forEach(function (card) {
        var hitQ = !q || (card.dataset.search || "").indexOf(q) !== -1;
        var mod = card.closest("[data-module]");
        var hitCat = currentCat === "*" || (mod && mod.dataset.filter === currentCat);
        var show = hitQ && hitCat;
        card.style.display = show ? "" : "none";
        if (show) visible++;
      });
      host.querySelectorAll("[data-module]").forEach(function (mod) {
        var any = mod.querySelectorAll('.lcard:not([style*="display: none"])').length > 0;
        mod.style.display = any ? "" : "none";
      });
      if (count) count.textContent = visible + " 个资源";
      var empty = document.getElementById("filter-empty");
      if (empty) empty.style.display = (visible === 0 && (q || currentCat !== "*")) ? "" : "none";
    }

    if (chips) {
      chips.addEventListener("click", function (e) {
        var b = e.target.closest(".chip");
        if (!b) return;
        chips.querySelectorAll(".chip").forEach(function (c) {
          c.setAttribute("aria-pressed", String(c === b));
        });
        currentCat = b.dataset.filter;
        apply();
      });
    }
    if (input) {
      var timer;
      input.addEventListener("input", function () {
        clearTimeout(timer);
        timer = setTimeout(apply, 120);
      });
    }
    var reset = document.getElementById("filter-reset");
    if (reset) {
      reset.addEventListener("click", function () {
        currentCat = "*";
        if (input) input.value = "";
        if (chips) chips.querySelectorAll(".chip").forEach(function (c) {
          c.setAttribute("aria-pressed", String(c.dataset.filter === "*"));
        });
        apply();
      });
    }
    host._apply = apply;
    apply();
  }

  /* 光斑：进入页面淡入；首屏滚出视口后降为 30%（光锚在区块内，不跟视口） */
  var glowIO = null;
  function bindGlow() {
    var target = document.querySelector(".hero") || document.querySelector(".pagehead");
    if (!target) return;
    if (!("IntersectionObserver" in window)) return;
    if (glowIO) glowIO.disconnect();
    glowIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        document.body.classList.toggle("is-hero-far", e.intersectionRatio < 0.15);
      });
    }, { threshold: [0, 0.15, 0.5] });
    glowIO.observe(target);
  }

  function boot(root) {
    revealAll(root);
    bindCounters(root);
    bindMagnetic(root);
    bindGallery(root);
    bindLinksTools(root);
    bindGlow();
    updatePin(true);
    bindRolesNav(root);
    updateRolesNav();
    var mounted = (root || document).querySelectorAll("[data-sec]");
    Array.prototype.forEach.call(mounted, function (sec) {
      if (sec._mounted) return;
      if (sec.querySelector("[data-feed-status]")) {
        var body = sec.querySelector("[data-feed-rows]");
        var st = sec.querySelector("[data-feed-status]");
        if (body) mountFeed(body, st);
      }
      sec._mounted = true;
    });
  }

  /* ---------------- 主题 ---------------- */
  function applyTheme(mode) {
    var resolved = mode;
    if (mode === "system") {
      resolved = window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
    }
    document.documentElement.setAttribute("data-theme", resolved);
    try { localStorage.setItem("v2:theme", mode); } catch (e) {}
    syncThemeButtons(mode);
    /* 换主题要把两级样式都重算：颜色是按主题取值的（深/浅各一份），
       片段那层同样要重算，之前漏了它，浅色主题下片段的浅色值一直不生效。 */
    if (state && state.content) {
      applyBlockStyles(state.content);
      applyRuns();
    }
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", resolved === "light" ? "#fafafa" : "#000000");
  }
  function syncThemeButtons(mode) {
    var m = mode;
    try { m = m || localStorage.getItem("v2:theme") || "dark"; } catch (e) { m = m || "dark"; }
    document.querySelectorAll("[data-theme-set]").forEach(function (b) {
      b.setAttribute("aria-pressed", String(b.dataset.themeSet === m));
    });
  }

  /* ---------------- 页面外观：进度条 / 光标 / 转场 / 聚光 ---------------- */
  var chromeReady = false;
  function initChrome() {
    if (chromeReady) return;
    chromeReady = true;

    var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    var embedded = window.parent !== window;

    /* 顶部滚动进度 */
    var bar = document.createElement("div");
    bar.className = "progress";
    document.body.appendChild(bar);

    var nav = document.querySelector(".nav");
    var ticking = false;
    function onScroll() {
      var y = window.scrollY;
      var h = document.documentElement.scrollHeight - window.innerHeight;
      bar.style.transform = "scaleX(" + (h > 0 ? Math.min(1, y / h) : 0) + ")";
      if (nav) nav.classList.toggle("is-compact", y > 120);
      updatePin(false);
      updateTimeline();
      updateRolesNav();
      ticking = false;
    }
    window.addEventListener("scroll", function () {
      if (!ticking) { ticking = true; requestAnimationFrame(onScroll); }
    }, { passive: true });
    window.addEventListener("resize", function () {
      pinMeasure = null;
      updatePin(true);
      updateRolesNav();
    });
    onScroll();

    /* 光标 */
    var cur = document.querySelector(".cursor");
    if (cur && fine && !reduce && !embedded) {
      var dot = cur.querySelector(".cursor__dot");
      var ring = cur.querySelector(".cursor__ring");
      var mx = window.innerWidth / 2, my = window.innerHeight / 2;
      var rx = mx, ry = my;
      var shown = false;

      window.addEventListener("mousemove", function (e) {
        mx = e.clientX; my = e.clientY;
        dot.style.transform = "translate3d(" + mx + "px," + my + "px,0)";
        if (!shown) {
          shown = true;
          rx = mx; ry = my;
          document.body.classList.add("has-cursor");
        }
      }, { passive: true });

      (function loop() {
        rx += (mx - rx) * 0.16;
        ry += (my - ry) * 0.16;
        ring.style.transform = "translate3d(" + rx.toFixed(2) + "px," + ry.toFixed(2) + "px,0)";
        requestAnimationFrame(loop);
      })();

      var HOT = "a, button, .panel, .role, .lcard, .tile, .mcard, [data-cursor]";
      document.addEventListener("mouseover", function (e) {
        if (e.target.closest && e.target.closest(HOT)) ring.classList.add("is-hover");
      });
      document.addEventListener("mouseout", function (e) {
        if (e.target.closest && e.target.closest(HOT)) ring.classList.remove("is-hover");
      });
    }

    /* 页面转场 */
    var veil = document.querySelector(".veil");
    if (veil && !embedded) {
      document.addEventListener("click", function (e) {
        var a = e.target.closest && e.target.closest("a");
        if (!a) return;
        var href = a.getAttribute("href");
        if (!href || a.target === "_blank" || a.hasAttribute("download")) return;
        if (/^(https?:|mailto:|tel:|javascript:)/i.test(href)) return;
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;

        /* 只换 hash、不换文档的链接必须交回浏览器默认行为。
           页脚的 "index.html#roles" / "legal.html#terms" 都属于这类：
           之前被当成跨页链接拦下来做转场，但 location.href 只改 hash 并不会
           重新加载文档，pageshow 永远不触发，遮罩就一直盖着（看起来像卡在加载页），
           preventDefault 还顺手把滚动到锚点也吞掉了。 */
        var url;
        try { url = new URL(href, window.location.href); }
        catch (err) { return; }
        if (url.origin !== window.location.origin) return;
        if (url.pathname === window.location.pathname &&
            url.search === window.location.search) return;

        e.preventDefault();
        veil.classList.add("is-on");
        setTimeout(function () { window.location.href = href; }, reduce ? 0 : 260);
        /* 兜底：万一目标没有真正卸载文档（hash 边界、被拦截、bfcache），
           别把遮罩永久锁在页面上。导航成功时本文档已销毁，这个 timer 不会执行。 */
        setTimeout(function () { veil.classList.remove("is-on"); }, 3000);
      });
      window.addEventListener("pageshow", function () { veil.classList.remove("is-on"); });
    }

    /* 卡片聚光 */
    var spotTicking = false;
    var pending = null;
    document.addEventListener("pointermove", function (e) {
      var card = e.target.closest && e.target.closest(".role, .lcard");
      if (!card) return;
      pending = { card: card, x: e.clientX, y: e.clientY };
      if (spotTicking) return;
      spotTicking = true;
      requestAnimationFrame(function () {
        spotTicking = false;
        if (!pending) return;
        var r = pending.card.getBoundingClientRect();
        pending.card.style.setProperty("--mx", (pending.x - r.left) + "px");
        pending.card.style.setProperty("--my", (pending.y - r.top) + "px");
      });
    }, { passive: true });

    /* 人像轻微视差 */
    var portrait = document.querySelector(".portrait");
    if (portrait && fine && !reduce) {
      window.addEventListener("mousemove", function (e) {
        var x = e.clientX / window.innerWidth - 0.5;
        var y = e.clientY / window.innerHeight - 0.5;
        portrait.style.transform = "translate3d(" + (x * 12).toFixed(2) + "px," + (y * 12).toFixed(2) + "px,0)";
      }, { passive: true });
    }
  }

  /* ---------------- 启动 ---------------- */
  function init() {
    var file = window.V2_CONTENT;
    var draft = null;
    try {
      var raw = localStorage.getItem("v2:draft");
      if (raw) draft = JSON.parse(raw);
    } catch (e) { draft = null; }

    // 只有同版本、且结构完整的草稿才采用（旧结构草稿会让页面渲染成空壳）
    var sane = draft &&
      draft.version === file.version &&
      draft.pages && draft.pages[PAGE] &&
      Array.isArray(draft.pages[PAGE].order) &&
      draft.pages[PAGE].order.length > 0 &&
      !!draft.pages[PAGE].sections;
    var useDraft = sane && !/[?&]file=1/.test(location.search);
    state.content = useDraft ? draft : file;
    state.draft = !!useDraft;
    window.__V2_DRAFT = state.draft;

    document.documentElement.lang = (state.content.meta && state.content.meta.lang) || "zh-CN";
    /* 标签页文字有三种状态，以前只有「填了」和「退回原标题」两种，清空是关不掉的：
         a) 填具体文字        → 整站统一用它
         b) 留空              → 标签上不要文字
         c) 填 auto           → 交还给各页面自己在 HTML 里写的标题
       空的不能直接赋 ""：浏览器见标题为空，会把标签退化成显示网址，
       看着就像「又冒出别的内容」。所以用一个零宽空格占位，视觉上是空的。 */
    var metaNow = state.content.meta || {};
    if (metaNow.siteTitle != null) {
      var tabText = String(metaNow.siteTitle).trim();
      if (tabText === "auto") {
        /* 保留 HTML 里的原生标题，什么都不做 */
      } else {
        document.title = tabText || "\u200b";
      }
    }

    renderNav(state.content);
    renderFooter(state.content);
    if (IS_ARCHIVE) { renderArchivePage(); stampBlocks(document.getElementById("main")); }
    else renderPage(state.content, PAGE);
    applyHomeOptions(state.content);
    applyTypeStyles(state.content);
    applyBlockStyles(state.content);
    /* 首次加载必须也走一遍片段样式 —— 否则控制台里拖选改过的文字，
       预览看得到、发布后打开却全部丢失（因为渲染时没人去包那层 span）。 */
    applyRuns();
    initChrome();
    initPicker();
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        document.body.classList.add("is-ready");
        document.body.classList.add("is-lit");
      });
    });

    // 草稿提示（只在独立打开页面时显示，控制台内嵌预览不显示）
    if (state.draft && window.parent === window) {
      var badge = document.createElement("div");
      badge.style.cssText = "position:fixed;left:16px;bottom:16px;z-index:120;display:flex;gap:8px;align-items:center;padding:6px 12px;border:1px solid var(--border-strong);border-radius:99px;background:var(--surface-1);font-size:12px;color:var(--text-3);font-family:var(--font-mono)";
      badge.innerHTML = '草稿预览 · 未发布 <a href="studio.html" style="color:var(--accent);border-bottom:1px solid currentColor">去控制台</a>';
      document.body.appendChild(badge);
    }

    document.addEventListener("click", function (e) {
      var b = e.target.closest("[data-theme-set]");
      if (b) applyTheme(b.dataset.themeSet);
    });

    // 控制台通信
    window.addEventListener("message", function (e) {
      var d = e.data;
      if (!d || d.__v2 !== true) return;
      if (d.type === "set-content" && d.content) {
        if (d.page && d.page !== PAGE) return;
        applyContent(d.content, { section: d.section });
      }
      if (d.type === "get-height") postHeight();
    });

    window.addEventListener("resize", function () {
      var t = document.querySelector("[data-role-track]");
      if (t) t.dispatchEvent(new Event("scroll"));
    });

    /* 视口变了（横竖屏、开控制台、手机选转）字号倍率要重算：
       自然字号变了，倍数不变才能保持同一比例。 */
    var rsTimer = 0;
    window.addEventListener("resize", function () {
      clearTimeout(rsTimer);
      rsTimer = setTimeout(function () {
        if (!state.content) return;
        resetNatural();
        applyBlockStyles(state.content);
        applyRuns();
        if (panelRefresh) panelRefresh();
        if (guideOn) updateGuides();
      }, 180);
    });

    document.addEventListener("keydown", function (e) {
      var lb = document.getElementById("lightbox");
      if (lb && lb.classList.contains("is-on")) {
        var i = parseInt(lb.dataset.i || "0", 10);
        if (e.key === "Escape") {
          lb.classList.remove("is-on");
          document.body.style.overflow = "";
        }
        if (e.key === "ArrowRight") {
          var n = document.querySelector("[data-lb='next']");
          if (n) n.click();
        }
        if (e.key === "ArrowLeft") {
          var p = document.querySelector("[data-lb='prev']");
          if (p) p.click();
        }
        return;
      }
      /* 岗位区在视口内时，← / → 切换卡片 */
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      var t = e.target;
      if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      var parts = rolesParts();
      if (!parts) return;
      var r = parts.pin.getBoundingClientRect();
      if (r.bottom < 0 || r.top > window.innerHeight) return;
      e.preventDefault();
      rolesGo(parts, rolesIndex(parts) + (e.key === "ArrowRight" ? 1 : -1));
    });

    postHeight();
    if (window.parent !== window) {
      window.parent.postMessage({ __v2: true, type: "ready", page: PAGE }, "*");
    }
  }

  function postHeight() {
    if (window.parent === window) return;
    window.parent.postMessage(
      { __v2: true, type: "height", page: PAGE, height: document.documentElement.scrollHeight },
      "*"
    );
  }

  /* ------------------------------------------------------------------
     文字样式：控制台里按「角色」调字号 / 颜色，这里写成 CSS 变量。
     CSS 侧用 var(--ty-<role>-size, 默认值) 兜底，留空即回到默认。
     ------------------------------------------------------------------ */
  /* ------------------------------------------------------------------
     单段文字样式：给可编辑的文字块打上稳定的 data-tb 标识，
     控制台在预览里点选后按这个 id 存到 content.styles.blocks。
     ------------------------------------------------------------------ */
  var TB_RULES = [
    [".hero h1", "hero-title"],
    [".hero__sub", "hero-lead"],
    [".about__lead", "about-lead"],
    [".body-text", "about-p"],
    ["#experience .h2", "exp-title"],
    [".tl-item__role", "exp-role"],
    [".tl-item__org", "exp-org"],
    [".tl-item__desc", "exp-desc"],
    ["#company .h2", "company-title"],
    /* 区块开头的那段导语（.lede）。以前漏了这条，它既点选不到、也不属于任何类别，
       所以「字体 / 宽度都改不了」—— 不是控件坏了，是这段没被登记。 */
    ["#company .lede", "company-lead"],
    [".info-card h4", "company-card-title"],
    [".info-card p", "company-card-desc"],
    [".pin__head .h2", "roles-title"],
    [".role h3", "role-title"],
    [".role__desc", "role-desc"],
    [".role__foot", "role-foot"],
    [".cta h2", "cta-title"],
    [".cta p:not(.mono)", "cta-lead"],
    [".cta__mail", "cta-mail"],
    [".stat__label", "stat-label"],
    /* 页面头（资源库 / 影像 / 法务 / 404 共用 pagehead）。以前整块都没登记，
       所以这几页的标题既点选不到、也不属于任何类别 —— 字号颜色都改不了。
       资源库和影像的标题文案不同，id 会带上页面前缀（见 stampBlocks）。 */
    [".pagehead .kicker", "page-kicker"],
    [".pagehead h1", "page-title"],
    [".pagehead .lead", "page-lead"]
  ];

  /* ---- 语义角色 ----
     每个块归到一个「类别」。类别是样式的第一层：改了 h2，全站所有 h2 一起变；
     块自己的设置盖在类别上面。这样「统一」是一个可执行的意图，而不是反复试倍率。
     归类按块名前缀（去掉 -0 -1 尾号），与页面无关，所以在任何一页打开都能对上。 */
  var ROLE_OF = {
    "hero-title": "h1",
    "exp-title": "h2",
    "company-title": "h2",
    "roles-title": "h2",
    "cta-title": "h2",
    "company-card-title": "h3",
    "role-title": "h3",
    "hero-lead": "lead",
    "about-lead": "lead",
    "cta-lead": "lead",
    "about-p": "body",
    /* 公司导语虽然字号比正文大一点，但它就是一段说明文字、且用户要拿它和
       About 正文比右边界。放进 body，总览「正文」一行的宽度统一才能一起管到它。 */
    "company-lead": "body",
    "exp-desc": "body",
    "role-desc": "body",
    "company-card-desc": "body",
    "cta-mail": "body",
    "exp-role": "meta",
    "exp-org": "meta",
    "role-foot": "meta",
    "stat-label": "meta",
    /* 页面头三件：标题单独一类（它跟首屏主标题字号差一截，不能共用 h1），
       上方小字归辅助信息，导语归引导语 */
    "page-title": "pageTitle",
    "page-kicker": "meta",
    "page-lead": "lead"
  };
  var ROLE_ORDER = ["h1", "pageTitle", "h2", "h3", "lead", "body", "meta"];
  var ROLE_LABEL = {
    h1: "主标题",
    pageTitle: "页面标题",
    h2: "区块标题",
    h3: "小标题",
    lead: "引导语",
    body: "正文",
    meta: "辅助信息"
  };
  var STYLE_KEYS = ["size", "scale", "weight", "color", "colorLight", "lh", "mb", "w", "align", "wrap"];
  /* 块 id → 规则名：先去尾号，再去页面前缀。
     「每页都有、内容不同」的块（页面标题）要带页面前缀，否则资源库和影像
     会共用同一个 id —— 改一页，另一页跟着变。前缀只影响 id，分类和清理
     都得先剥掉它才认得出这是哪个规则。 */
  /* 页面键取自 body[data-page]：home / links / gallery / legal / notfound
     （404 页用的是 notfound，不是 404 —— 之前按 404 写，那一页的标题就
     认不出来，发布时会被 pruneStyles 当失效样式删掉）。 */
  var PAGE_PREFIX_RE = /^(home|links|gallery|legal|notfound|404|studio|feed)-/;
  function tbNameOf(id) {
    return String(id || "").replace(/-\d+$/, "").replace(PAGE_PREFIX_RE, "");
  }
  function roleOf(id) {
    return ROLE_OF[tbNameOf(id)] || "";
  }

  function stampBlocks(root) {
    var scope = root || document;
    TB_RULES.forEach(function (pair) {
      var nodes = scope.querySelectorAll(pair[0]);
      Array.prototype.forEach.call(nodes, function (n, i) {
        if (n.dataset.tb) return;
        /* 页面前缀：默认跟着 body[data-page] 走，块自己声明 data-tb-page 时以它为准。
           归档页挂在 links 页名下（导航要亮「量化信息库」），但它的标题是另一段
           文字 —— 不加区分会和资源库的标题共用一条样式记录。 */
        var owner = n.closest ? n.closest("[data-tb-page]") : null;
        var prefix = owner ? owner.dataset.tbPage
          : (n.closest && n.closest(".pagehead") ? PAGE : "");
        n.dataset.tb = (prefix ? prefix + "-" : "") + pair[1] + "-" + i;
      });
    });
  }
  /* ---- 字号：存绝对 px（1440 视口基准）----
     以前存「相对自然字号的倍数」，问题是不可以互相比较：
     42px 的标题乘 1.2 得 50.4，27px 的引导语乘 1.2 得 32.4，
     想让两者一样大，一个要 1.19、一个要 1.85 —— 永远对不上。
     现在改存「1440 视口下的目标 px」，同类填同一个数就是同一个字号。
     响应式用一条统一规则换算，同一个 px 输入在任何视口都算出同一个输出，
     所以「一致性」不会因为换个设备就破掉。 */
  function pxToCss(px) {
    /* 下限 0.75 倍、最高 44px、最低 16px：大标题在手机上收得住，正文不缩水 */
    var min = Math.min(44, Math.max(16, px * 0.75));
    var vw = (px / 14.4).toFixed(4); /* px / 1440 * 100 */
    return "clamp(" + min.toFixed(2) + "px, " + vw + "vw, " + px + "px)";
  }
  var naturalCache = new WeakMap();
  function naturalSize(el) {
    if (!el) return 0;
    if (naturalCache.has(el)) return naturalCache.get(el);
    var prev = el.style.fontSize;
    el.style.fontSize = "";
    var px = parseFloat(getComputedStyle(el).fontSize) || 0;
    el.style.fontSize = prev;
    /* 量不到（脱离文档、还没布局）就别记，下次布局好再量 */
    if (px > 0) naturalCache.set(el, px);
    return px;
  }
  function resetNatural() { naturalCache = new WeakMap(); }

  function sizeValue(el, o) {
    if (!o) return "";
    var px = parseFloat(o.size);
    if (isFinite(px) && px > 0) return pxToCss(px);
    /* 片段存的是「相对本段字号」的倍数：段字号一改，片段跟着等比走，
       不会出现「整段缩到 30px、里面还突着一个 54px」的错位。 */
    var sc = parseFloat(o.scale);
    if (isFinite(sc) && sc > 0) {
      if (Math.abs(sc - 1) < 0.005) return "";
      /* 片段：倍数乘「所属块」的当前字号。
         块自身还留着旧倍率数据时，基准必须取样式表里的原值（naturalSize），
         不能取自己身上的内联值 —— 否则每次重算都乘一遍，字号会越滚越大。 */
      var isBlock = el && el.dataset && el.dataset.tb;
      var host = !isBlock && el && el.closest ? el.closest("[data-tb]") : null;
      var base = host ? parseFloat(getComputedStyle(host).fontSize) : naturalSize(el);
      return base ? pxToCss(base * sc) : "";
    }
    return o.sizeText ? String(o.sizeText).trim() : "";
  }

  /* ---- 颜色：浅色主题自动推导 ----
     填了浅色就用浅色；没填就从深色值推一个（亮色压暗、暗色提亮）。
     以前要手填两次色，绝大多数情况其实一个值就够。 */
  function hexToRgb(h) {
    var s = String(h || "").trim().replace(/^#/, "");
    if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
    if (!/^[0-9a-fA-F]{6}$/.test(s)) return null;
    return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
  }
  function rgbToHex(a) {
    return "#" + a.map(function (v) {
      v = Math.max(0, Math.min(255, Math.round(v)));
      return ("0" + v.toString(16)).slice(-2);
    }).join("");
  }
  function relLum(rgb) {
    var c = rgb.map(function (v) {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  function adaptForLight(hex) {
    var rgb = hexToRgb(hex);
    if (!rgb) return hex;
    var l = relLum(rgb);
    var bright = l > 0.42;
    var to = bright ? [0, 0, 0] : [255, 255, 255];
    var k = bright ? 0.62 : 0.42;
    return rgbToHex(rgb.map(function (v, i) { return v + (to[i] - v) * k; }));
  }
  function blockColor(o, light) {
    if (!o) return "";
    var col = light
      ? (o.colorLight || (o.color ? adaptForLight(String(o.color).trim()) : ""))
      : (o.color || o.colorLight);
    return col ? String(col).trim() : "";
  }
  /* 三类设置合并后的最终值：块自己的 > 类别的 > CSS 默认。
     空字符串一律当作「没设」，这样面板换写法（旧数据带 ""）也不会把颜色误清掉。 */
  function merged(id) {
    var st = (state.content && state.content.styles) || {};
    var out = {};
    var role = roleOf(id);
    var base = (role && st.roles && st.roles[role]) || null;
    var own = (st.blocks && st.blocks[id]) || null;
    STYLE_KEYS.forEach(function (k) {
      if (own && own[k] != null && own[k] !== "") out[k] = own[k];
      else if (base && base[k] != null && base[k] !== "") out[k] = base[k];
    });
    return out;
  }
  /* 这几个属性会被反复写回。第一次进来时记住 HTML 里原本的内联值，
     清空设置时才能准确还原，不会把页面自带的东西一起抹掉。 */
  var origInline = new WeakMap();
  function original(el, prop) {
    var m = origInline.get(el);
    if (!m) { m = {}; origInline.set(el, m); }
    if (!(prop in m)) m[prop] = el.style[prop];
    return m[prop] || "";
  }
  function containerWidth(el) {
    var p = el.parentElement;
    if (!p) return 0;
    var cs = getComputedStyle(p);
    return Math.max(0, Math.round(
      p.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0)
    ));
  }
  /* 「对齐」的参照不是直接父容器，而是同一条左边界上其它文字块最常见的宽度。
     about-lead 的父级是整行 1032px，但同列的正文段落都是 587px —— 要对齐的是后者。 */
  function refWidth(el) {
    var mine = el.getBoundingClientRect();
    var freq = {};
    Array.prototype.forEach.call(document.querySelectorAll("[data-tb]"), function (n) {
      if (n === el) return;
      /* 标题是整行铺满的，宽度不代表「文字栏」。把它算进来会把参照值抬到
         1032px，已按正文列对齐的段落反而被误报「比同列窄 445px」。 */
      if (/^h[123]$/.test(roleOf(n.dataset.tb))) return;
      var r = n.getBoundingClientRect();
      if (Math.abs(r.left - mine.left) > 8 || r.width < 60) return;
      if (Math.abs(r.top - mine.top) > 520) return;   /* 只看同一区块，别跨到页脚去 */
      var k = Math.round(r.width / 2) * 2;
      freq[k] = (freq[k] || 0) + 1;
    });
    var keys = Object.keys(freq).sort(function (a, b) {
      return freq[b] - freq[a] || b - a;
    });
    return keys.length ? parseInt(keys[0], 10) : (containerWidth(el) || Math.round(mine.width));
  }
  /* 数「视觉行数」不能用 Range 的 rect.top 分组：同一行里若混着 54px 和 36px
     两种字号，两个片段的 top 能差 19px，会被算成两行（about-lead 因此长期显示 3 行）。
     行高已经被固化成 px，所以 元素高度 / 行高 才是准确的行数，也能正确数上 <br>。 */
  function visualLines(el) {
    var cs = getComputedStyle(el);
    var lh = parseFloat(cs.lineHeight);
    var h = el.getBoundingClientRect().height;
    if (isFinite(lh) && lh > 0 && h > 0) return Math.max(1, Math.round(h / lh));
    try {
      var rg = document.createRange();
      rg.selectNodeContents(el);
      var tops = {};
      Array.prototype.forEach.call(rg.getClientRects(), function (r) {
        tops[Math.round(r.top / Math.max(1, lh || 20))] = 1;
      });
      return Math.max(1, Object.keys(tops).length);
    } catch (e) { return 1; }
  }
  function manualBreaks(el) { return el.querySelectorAll("br").length; }

  /* 量出「每行都不折行」时最宽那一行需要多少 px。临时改样式量完立刻还原，
     不改变落盘数据，也不影响 original() 记住的初始内联值。 */
  function nowrapNeed(el) {
    var s = el.style;
    var save = { maxWidth: s.maxWidth, width: s.width, whiteSpace: s.whiteSpace, textWrap: s.textWrap };
    s.maxWidth = "none";
    s.width = "max-content";
    s.textWrap = "nowrap";
    s.whiteSpace = "nowrap";
    var need = Math.ceil(el.getBoundingClientRect().width);
    s.maxWidth = save.maxWidth;
    s.width = save.width;
    s.textWrap = save.textWrap;
    s.whiteSpace = save.whiteSpace;
    return need;
  }
  /* 窄屏真的放不下时，宁可自动恢复折行，也不要让 #main 的 overflow-x:clip 把字切掉。 */
  function nowrapFits(el, need) {
    var left = el.getBoundingClientRect().left;
    return left + need <= document.documentElement.clientWidth - 2;
  }

  function applyOneBlock(el, o) {
    var light = document.documentElement.getAttribute("data-theme") === "light";
    el.style.fontSize = sizeValue(el, o);
    el.style.color = blockColor(o, light);
    /* 页面标题的第二行在样式表里是渐变字（color: transparent + 背景裁剪），
       整块指定颜色时它会坚持自己的渐变，用户会以为「改了颜色没反应」。
       打上标记让 CSS 放弃渐变、直接继承这一行设的颜色。 */
    if (el.toggleAttribute) el.toggleAttribute("data-tb-solid", !!(o && o.color));
    else if (o && o.color) el.setAttribute("data-tb-solid", "1");
    else el.removeAttribute("data-tb-solid");
    el.style.fontWeight = o && o.weight ? String(o.weight).trim() : "";
    /* 行距存 px 绝对值：段内若有几段不同字号的文字，无单位 line-height
       会各自算行高，行距就参差不齐 —— 写死 px 才能让每行间距一样。 */
    el.style.lineHeight = o && o.lh ? Math.round(parseFloat(o.lh)) + "px" : "";
    el.style.marginBottom = o && o.mb ? Math.round(parseFloat(o.mb)) + "px" : "";

    /* ---- 宽度 / 对齐 / 换行 ----
       样式表里很多 max-width 用 ch，ch 跟着字号涨，字号一调就撑出栅格列，
       于是同类文字块的右边界各是各的。这里改成可显式指定的 px。
       宽度、对齐、换行是三件独立的事：换行模式绝不擅自改宽度，
       否则「对齐同列」刚拉齐的右边界又会被 max-content 撑回去。 */
    var w = o && o.w != null ? String(o.w) : "";
    var wantNowrap = o && o.wrap === "nowrap";
    var nowrap = false;
    if (wantNowrap) {
      var need = nowrapNeed(el);
      nowrap = nowrapFits(el, need);
      if (nowrap) el.removeAttribute("data-tb-wrapfallback");
      else el.setAttribute("data-tb-wrapfallback", "1");
    } else {
      el.removeAttribute("data-tb-wrapfallback");
    }
    el.style.maxWidth = w === "full" ? "none"
      : (parseFloat(w) > 0 ? Math.round(parseFloat(w)) + "px" : original(el, "maxWidth"));
    el.style.width = w === "full" ? "100%" : original(el, "width");
    el.style.whiteSpace = original(el, "whiteSpace");
    el.style.textAlign = o && o.align ? String(o.align) : original(el, "textAlign");
    /* 必须先写 text-wrap 再写 white-space：这两个是互相重叠的简写，
       后写的 text-wrap:"" 会把 white-space:nowrap 里的 text-wrap-mode 重置掉。
       balance：让浏览器把多行文字尽量等分，避免最后一行只剩一两个字。
       三种模式都保留作者写下的 <br> —— 那是刻意的断行，不是宽度造成的折行。 */
    el.style.textWrap = nowrap ? "nowrap"
      : (o && o.wrap === "balance" ? "balance" : original(el, "textWrap"));
    if (nowrap) el.style.whiteSpace = "nowrap";

    /* 块的字号变了，块内片段量出来的「自然字号」也跟着变，缓存作废 */
    Array.prototype.forEach.call(el.querySelectorAll(".tb-run"), function (s) {
      naturalCache.delete(s);
    });
  }
  function applyBlockStyles(c) {
    Array.prototype.forEach.call(document.querySelectorAll("[data-tb]"), function (el) {
      applyOneBlock(el, merged(el.dataset.tb));
    });
    pinLeadings();
  }

  /* ---- 行距：把无单位的 line-height 落成 px ----
     同一段里若有两个不同字号的片段（例如标题前半 53px、后半 36px），
     继承来的 1.25 会各自算行高，两行间距就不一样。改成 px 之后，
     整段共用一个行高，行与行的间距才是均匀的。
     没设过字号、也没有片段的块完全不动，保持样式表原样。 */
  function naturalLeading(el) {
    var pf = el.style.fontSize, pl = el.style.lineHeight;
    el.style.fontSize = "";
    el.style.lineHeight = "";
    var cs = getComputedStyle(el);
    var f = parseFloat(cs.fontSize) || 0;
    var l = parseFloat(cs.lineHeight);
    if (!isFinite(l) || l <= 0) l = f * 1.5;
    el.style.fontSize = pf;
    el.style.lineHeight = pl;
    return f > 0 ? l / f : 1.5;
  }
  function pinLeadings() {
    var runsMap = (state.content && state.content.styles && state.content.styles.runs) || {};
    Array.prototype.forEach.call(document.querySelectorAll("[data-tb]"), function (el) {
      var id = el.dataset.tb;
      var o = merged(id);
      if (o.lh) { el.style.lineHeight = Math.round(parseFloat(o.lh)) + "px"; return; }
      var hasRuns = (runsMap[id] || []).some(function (r) { return r.size || r.scale; });
      if (!o.size && !hasRuns) { el.style.lineHeight = ""; return; }
      /* 行距跟着「这一段里最大的那个字号」走，大行不会被压扁 */
      var maxFs = parseFloat(getComputedStyle(el).fontSize) || 0;
      Array.prototype.forEach.call(el.querySelectorAll(".tb-run"), function (s) {
        var v = parseFloat(getComputedStyle(s).fontSize) || 0;
        if (v > maxFs) maxFs = v;
      });
      if (maxFs > 0) el.style.lineHeight = Math.round(maxFs * naturalLeading(el)) + "px";
    });
  }
  /* 改类别：写 styles.roles.<role>，并把同类块的对应字段本地覆盖清掉，
     否则「统一」只统一了没被单独调过的那些，剩下几个还各是各的。 */
  function setRoleStyle(role, patch) {
    if (!role || !state.content) return;
    var st = state.content.styles = state.content.styles || {};
    st.roles = st.roles || {};
    var base = st.roles[role] || {};
    Object.keys(patch).forEach(function (k) {
      if (patch[k] == null || patch[k] === "") delete base[k];
      else base[k] = patch[k];
    });
    if (Object.keys(base).length) st.roles[role] = base;
    else delete st.roles[role];
    if (!Object.keys(st.roles).length) delete st.roles;

    Object.keys(st.blocks || {}).forEach(function (id) {
      if (roleOf(id) !== role) return;
      var own = st.blocks[id];
      Object.keys(patch).forEach(function (k) { delete own[k]; });
      if (!Object.keys(own).length) delete st.blocks[id];
    });
    if (st.blocks && !Object.keys(st.blocks).length) delete st.blocks;
  }
  /* 统计某一类别在本页的分布，用来回答「能不能统一」 */
  function roleStats(role) {
    var rows = [];
    Array.prototype.forEach.call(document.querySelectorAll("[data-tb]"), function (n) {
      if (roleOf(n.dataset.tb) !== role) return;
      rows.push({
        id: n.dataset.tb,
        px: Math.round(parseFloat(getComputedStyle(n).fontSize) || 0)
      });
    });
    return rows;
  }

  /* ------------------------------------------------------------------
     片段级样式：把某一段文字单独包一层 span。
     数据存在 styles.runs.<块 id> = [{ text, size, color, colorLight, weight }]，
     text 是选中的原文字，渲染时按「先长后短」的顺序在块内找回来再包。
     找不到（文案被改过）就跳过，不会把页面弄坏。
     ------------------------------------------------------------------ */
  function findRun(blockEl, text) {
    var list = blockEl.querySelectorAll("[data-run]");
    for (var i = 0; i < list.length; i++) {
      if (list[i].dataset.run === text) return list[i];
    }
    return null;
  }
  /* 中文后置标点属于它前面的那一段文字。片段若只包住汉字、把标点留在外层，
     标点就退回父块的基础字号和字重 —— 同一行里成了「大字后面跟一个小细逗号」。
     只收后置标点：左括号 / 左引号属于后面的文字，不能吞进来。 */
  var TRAILING_PUNCT = /[，。、；：！？…）」』】》〉]/u;
  function wrapRun(blockEl, run) {
    if (!blockEl || !run || !run.text) return null;
    /* 已经包过就只是刷新样式，不重复包 */
    var already = findRun(blockEl, run.text);
    if (already) { applyRunStyle(already, run); return already; }
    var walker = document.createTreeWalker(blockEl, NodeFilter.SHOW_TEXT, null);
    var node;
    while ((node = walker.nextNode())) {
      var idx = node.nodeValue.indexOf(run.text);
      if (idx < 0) continue;
      /* 这段已被「同名片段 + 吸附的标点」包住时不要再套一层，否则两个
         倍率片段叠起来字号会连乘。用户在一个片段内部再选一小段做细分时，
         外层 textContent 不会是「原文 + 标点」，不受这条判断影响。 */
      var owner = node.parentElement && node.parentElement.closest
        ? node.parentElement.closest(".tb-run") : null;
      if (owner && owner.dataset.run === run.text) return null;
      if (owner && owner.textContent.indexOf(run.text) === 0 &&
        owner.textContent.length > run.text.length &&
        TRAILING_PUNCT.test(owner.textContent.charAt(run.text.length))) return null;
      var end = idx + run.text.length;
      /* 把紧跟其后的标点一起纳入片段。data-run 仍存原文，
         findRun / pruneStyles 才能继续按文字对得上。 */
      while (end < node.nodeValue.length && TRAILING_PUNCT.test(node.nodeValue.charAt(end))) end++;
      var range = document.createRange();
      range.setStart(node, idx);
      range.setEnd(node, end);
      var span = document.createElement("span");
      span.className = "tb-run";
      span.dataset.run = run.text;
      try {
        range.surroundContents(span);
      } catch (e) {
        return null;
      }
      /* 必须先进 DOM 再算样式：字号倍率要读父级继承来的自然字号，
         脱离文档的节点量出来是 0，倍数会整个失效。 */
      applyRunStyle(span, run);
      return span;
    }
    return null;
  }
  function applyRunStyle(span, run) {
    var light = document.documentElement.getAttribute("data-theme") === "light";
    span.style.fontSize = sizeValue(span, run);
    span.style.color = blockColor(run, light);
    span.style.fontWeight = run && run.weight ? String(run.weight).trim() : "";
  }
  function applyRuns(root) {
    var runs = (state.content && state.content.styles && state.content.styles.runs) || {};
    var scope = root || document;
    Object.keys(runs).forEach(function (id) {
      var blockEl = scope.querySelector('[data-tb="' + id + '"]');
      if (!blockEl) return;
      var list = (runs[id] || []).slice().sort(function (a, b) {
        return (b.text || "").length - (a.text || "").length;
      });
      list.forEach(function (run) { wrapRun(blockEl, run); });
    });
    pinLeadings();
  }

  /* ------------------------------------------------------------------
     清理失效样式。
     片段用「原文」当 key，文案一改这条就永远匹配不上了 —— 它会一直留在
     content.js 里，下次选到同一段旧文字时又冒出来，看起来就像"样式自己变了"。
     这里按「文字是否还存在于正文里」判断死活，纯数据操作，不依赖当前页 DOM。
     ------------------------------------------------------------------ */
  var TB_NAMES = TB_RULES.map(function (p) { return p[1]; });
  function allText(c) {
    var buf = [];
    (function walk(v) {
      if (typeof v === "string") buf.push(v);
      else if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === "object") {
        Object.keys(v).forEach(function (k) {
          if (k === "styles" || k === "version" || k === "updatedAt") return;
          walk(v[k]);
        });
      }
    })(c && c.pages);
    return buf.join("\u0001");
  }
  function pruneStyles(c) {
    if (!c || !c.styles) return { blocks: 0, runs: 0 };
    var body = allText(c);
    var removed = { blocks: 0, runs: 0 };

    var blocks = c.styles.blocks || {};
    Object.keys(blocks).forEach(function (id) {
      /* 用 tbNameOf 而不是只剥尾号：页面标题的 id 是 links-page-title-0，
         只剥尾号会得到 links-page-title，对不上规则表就被当成失效样式清掉 */
      var name = tbNameOf(id);
      if (TB_NAMES.indexOf(name) < 0) { delete blocks[id]; removed.blocks++; }
    });

    var runs = c.styles.runs || {};
    Object.keys(runs).forEach(function (id) {
      var name = tbNameOf(id);
      var keep = (runs[id] || []).filter(function (r) {
        return r && r.text && body.indexOf(r.text) > -1;
      });
      if (TB_NAMES.indexOf(name) < 0) keep = [];
      removed.runs += (runs[id] || []).length - keep.length;
      if (keep.length) runs[id] = keep;
      else delete runs[id];
    });

    if (!Object.keys(blocks).length) delete c.styles.blocks;
    if (!Object.keys(runs).length) delete c.styles.runs;

    var roles = c.styles.roles || {};
    Object.keys(roles).forEach(function (k) {
      if (ROLE_ORDER.indexOf(k) < 0) { delete roles[k]; removed.blocks++; }
    });
    if (!Object.keys(roles).length) delete c.styles.roles;
    return removed;
  }

  var TYPE_ROLES = ["h1", "heroSub", "h2", "lead", "body", "cardTitle", "cardBody", "label"];
  function setVar(name, val) {
    var root = document.documentElement;
    var s = String(val == null ? "" : val).trim();
    if (s) root.style.setProperty(name, s);
    else root.style.removeProperty(name);
  }
  function applyTypeStyles(c) {
    var st = (c && c.styles) || {};
    TYPE_ROLES.forEach(function (k) {
      var v = st[k] || {};
      setVar("--ty-" + k + "-size", v.size);
      setVar("--ty-" + k + "-color", v.color);
      setVar("--ty-" + k + "-colorLight", v.colorLight);
    });
  }

  function applyContent(content, opts) {
    state.content = content;
    state.draft = true;
    var sec = opts && opts.section;
    /* 只改了文字样式：不动 DOM，直接换变量，预览不重绘 */
    if (sec === "__styles") {
      applyTypeStyles(state.content);
      applyBlockStyles(state.content);
      applyRuns();
      postHeight();
      return true;
    }
    var patched = false;
    if (sec) patched = patchSection(sec);
    renderNav(state.content);
    renderFooter(state.content);
    if (!patched) {
      renderPage(state.content, PAGE, { keepScroll: true, instant: true });
    }
    applyHomeOptions(state.content);
    applyTypeStyles(state.content);
    applyBlockStyles(state.content);
    applyRuns();
    postHeight();
    return patched;
  }

  /* 光晕呼吸：把控制台参数写成 CSS 变量，首屏光斑和 contact 次光源共用。
     周期越小呼吸越快；幅度 0 等于不呼吸；范围是晕染面积倍数。 */
  function numOr(v, def, lo, hi) {
    var n = parseFloat(v);
    if (!isFinite(n)) n = def;
    return n < lo ? lo : n > hi ? hi : n;
  }
  function applyAtmosphere(c) {
    var a = (c && c.pages && c.pages.home && c.pages.home.atmosphere) || {};
    var root = document.documentElement;
    var on = !(a.breathe === false || a.breathe === "false" || a.breathe === "off");
    var dur = numOr(a.speed, 6, 1.5, 24);
    var depth = numOr(a.depth, 62, 0, 100) / 100;
    var size = numOr(a.size, 110, 50, 220) / 100;
    var hi = 0.55 + 0.34 * depth;
    var lo = Math.max(0.04, 0.55 - 0.45 * depth);
    root.style.setProperty("--breathe-dur", dur.toFixed(2) + "s");
    root.style.setProperty("--breathe-hi", hi.toFixed(3));
    root.style.setProperty("--breathe-lo", lo.toFixed(3));
    root.style.setProperty("--glow-size", size.toFixed(2));
    root.classList.toggle("no-breathe", !on);
  }

  /* 首屏点阵：字段都是字符串，这里统一转成 hero-dots.js 认的数字。
     每次 apply 都会重建网格，所以同一份配置不重复推。 */
  var lastDots = "";
  function applyHeroDots(o) {
    if (!window.HeroDots) return;
    var key = JSON.stringify(o);
    if (key === lastDots) return;
    lastDots = key;
    window.HeroDots.apply({
      on: !(o.on === false || o.on === "false" || o.on === "off"),
      morph: o.morph,
      tone: o.tone,
      step: o.step,
      alpha: o.alpha,
      speed: o.speed,
      scale: o.scale
    });
  }

  /* ------------------------------------------------------------------
     首屏可选项：把 content.js 里的字段映射到页面。
     控制台改字段 → applyContent / patchSection → 这里重放一次，
     所以选项在预览里是即时生效的，不需要整页刷新。
     ------------------------------------------------------------------ */
  function applyHomeOptions(c) {
    if (PAGE !== "home") return;
    var home = c && c.pages && c.pages.home;
    var hero = home && home.sections && home.sections.hero;
    if (!hero) return;
    var p = hero.portrait || {};
    var st = p.status || {};
    var b = document.body;

    /* 光晕呼吸（首屏 + contact 共用一套变量） */
    applyAtmosphere(c);

    b.dataset.layout = hero.layout || "center";
    b.dataset.ratio = String(p.ratio || "1:1").replace(":", "-");
    b.dataset.fx = p.fx || "glow";
    b.dataset.status = st.display || "hover";
    b.dataset.openbadge = (p.showBadge === false || p.showBadge === "false" || p.showBadge === "off") ? "off" : "on";
    b.dataset.tagline = p.tagline ? "on" : "off";

    var box = document.querySelector(".portrait");
    if (box) box.style.aspectRatio = String(p.ratio || "1:1").replace(":", " / ");

    /* 首屏背景点阵：控制台改字段 → 这里把配置推给 hero-dots.js */
    applyHeroDots(hero.dots || {});

    var wrap = document.querySelector(".portrait-wrap");
    if (!wrap) return;
    var node = wrap.querySelector(".gh-status");
    if (!node) {
      node = document.createElement("div");
      node.className = "gh-status";
      node.tabIndex = 0;
      node.setAttribute("role", "status");
      var em = document.createElement("span");
      em.className = "gh-status__emoji";
      var msg = document.createElement("span");
      msg.className = "gh-status__msg";
      node.appendChild(em);
      node.appendChild(msg);
      wrap.appendChild(node);
    }
    node.querySelector(".gh-status__emoji").textContent = st.customEmoji || st.emoji || "";
    node.querySelector(".gh-status__msg").textContent = st.message || "";
    /* 触屏没有 hover：点一下展开 / 收起状态文字（桌面端 hover 照样展开） */
    if (!node.dataset.bound) {
      node.dataset.bound = "1";
      node.setAttribute("aria-expanded", "false");
      var toggleOpen = function () {
        var open = node.classList.toggle("is-open");
        node.setAttribute("aria-expanded", open ? "true" : "false");
      };
      node.addEventListener("click", toggleOpen);
      node.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") {
          e.preventDefault();
          toggleOpen();
        }
      });
    }
    var off = st.enabled === false || st.enabled === "false" || !(st.emoji || st.message);
    node.style.display = off ? "none" : "";
  }

  /* ------------------------------------------------------------------
     预览内「点选改样式」：只在被控制台内嵌时启用。
     点一段文字 → 就地弹出字号 / 深浅两层颜色 → 同时写回控制台草稿。
     ------------------------------------------------------------------ */
  var pickOn = false, pickEl = null, pickPanel = null;

  function toHex(c) {
    if (!c) return "#ffffff";
    if (c.charAt(0) === "#") return c;
    var m = c.match(/\d+/g);
    if (!m) return "#ffffff";
    return "#" + m.slice(0, 3).map(function (x) {
      return ("0" + (+x).toString(16)).slice(-2);
    }).join("");
  }
  function pickStyles() {
    if (document.getElementById("tb-style")) return;
    var st = document.createElement("style");
    st.id = "tb-style";
    st.textContent = [
      "html.is-picking [data-tb]{cursor:pointer;outline:1px dashed rgba(95,226,219,.5);outline-offset:3px}",
      "html.is-picking [data-tb]:hover{outline:2px solid #5fe2db;background:rgba(95,226,219,.07)}",
      "html.is-picking .tb-run{outline:1px dashed rgba(95,226,219,.55);outline-offset:1px}",
      "html.is-picking [data-tb]{cursor:text}",
      "html.is-picking .tb-sel{outline:2px solid #5fe2db;outline-offset:3px;background:rgba(95,226,219,.08)}",
      "html.is-guiding [data-tb]{outline:1px dashed rgba(95,226,219,.6);outline-offset:2px;background:rgba(95,226,219,.045)}",
      ".tb-guide{position:fixed;top:0;bottom:0;width:0;z-index:99998;pointer-events:none;border-left:1px dashed rgba(95,226,219,.7)}",
      ".tb-panel{position:fixed;z-index:99999;width:302px;padding:10px;border-radius:12px;border:1px solid #3a3a3a;background:#141414;box-shadow:0 12px 40px rgba(0,0,0,.65);font:12px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#ddd;text-align:left;overflow-y:auto;overscroll-behavior:contain;scrollbar-width:thin;scrollbar-color:#444 transparent}",
      ".tb-panel .id{font-size:11px;color:#cfd8d9;margin-bottom:6px;font-weight:600}",
      ".tb-panel .sel{margin:0 0 8px;padding:5px 7px;border-radius:6px;background:#1d1d1d;border:1px dashed #4a4a4a;color:#e6e6e6;font-size:11px;line-height:1.5;max-height:52px;overflow:hidden}",
      ".tb-panel .sel .mono{font-family:monospace;color:#6d7a7c}",
      ".tb-panel .tpc{display:flex;align-items:center;gap:6px;margin:0 0 8px;padding:5px 7px;border-radius:6px;background:#1d1d1d;border:1px solid #33272a;font-size:10px;color:#c9a86a;font-family:monospace;white-space:nowrap;overflow:hidden}",
      ".tb-panel .tpc span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis}",
      ".tb-panel .tpc.is-ok{color:#6fbf73;border-color:#243026;font-family:inherit;font-size:11px}",
      ".tb-panel .tpc.is-info{color:#9fb0b2;border-color:#2b3233;font-family:inherit;font-size:10px;justify-content:space-between}",
      ".tb-panel .tpc.is-info.is-bad{color:#e0736b;border-color:#3a2626}",
      ".tb-panel .tpc.is-info b{flex:none;color:#e0736b;font-weight:600}",
      ".tb-panel .tpc button{flex:none;height:20px;padding:0 6px;border-radius:4px;border:1px solid #5fe2db;background:transparent;color:#5fe2db;font-size:10px;cursor:pointer}",
      ".tb-panel .tpc button:hover{background:#5fe2db;color:#08090c}",
      ".tb-panel .prow{display:flex;align-items:center;gap:6px;margin-bottom:7px}",
      ".tb-panel .pk{width:30px;flex:none;color:#8b8b8b;font-size:11px}",
      ".tb-panel .stp{flex:0 0 22px;width:22px;height:24px;border-radius:6px;border:1px solid #3a3a3a;background:#1d1d1d;color:#ddd;font-size:13px;line-height:1;cursor:pointer;padding:0}",
      ".tb-panel .stp:hover{background:#262626;border-color:#555}",
      ".tb-panel .rg{flex:1;min-width:0;height:22px;-webkit-appearance:none;appearance:none;background:transparent;cursor:pointer;margin:0}",
      ".tb-panel .rg::-webkit-slider-runnable-track{height:4px;border-radius:99px;background:#333}",
      ".tb-panel .rg::-webkit-slider-thumb{-webkit-appearance:none;width:14px;height:14px;margin-top:-5px;border-radius:50%;background:#5fe2db;border:none}",
      ".tb-panel .rg::-moz-range-track{height:4px;border-radius:99px;background:#333}",
      ".tb-panel .rg::-moz-range-thumb{width:14px;height:14px;border:none;border-radius:50%;background:#5fe2db}",
      ".tb-panel .num{flex:0 0 auto;min-width:58px;text-align:right;color:#e6e6e6;font-size:10px;font-family:monospace;white-space:nowrap}",
      ".tb-panel .numin{flex:0 0 38px;width:38px;height:24px;padding:0 2px;border-radius:6px;border:1px solid #3a3a3a;background:#1d1d1d;color:#e6e6e6;font:11px/1 monospace;text-align:center;-moz-appearance:textfield}",
      ".tb-panel .numin::-webkit-outer-spin-button,.tb-panel .numin::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}",
      ".tb-panel .numin:focus{outline:none;border-color:#5fe2db}",
      ".tb-panel .u{flex:0 0 auto;color:#7f8c8d;font-size:10px;font-style:normal;margin-left:-2px}",
      ".tb-panel .seg{display:flex;flex:1;gap:4px}",
      ".tb-panel .seg button{flex:1;height:24px;border-radius:6px;border:1px solid #3a3a3a;background:#1d1d1d;color:#bbb;font-size:11px;cursor:pointer;padding:0}",
      ".tb-panel .seg button.is-on{background:#5fe2db;border-color:#5fe2db;color:#08090c;font-weight:600}",
      ".tb-panel .sws{display:flex;flex:1;gap:5px;align-items:center}",
      ".tb-panel .sw{position:relative;flex:0 0 20px;width:20px;height:20px;border-radius:50%;border:1px solid #4a4a4a;background:#1d1d1d;cursor:pointer;padding:0;overflow:hidden}",
      ".tb-panel .sw.is-on{box-shadow:0 0 0 2px #5fe2db}",
      ".tb-panel .sw--none::after{content:'\\00d7';position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#888;font-size:12px;line-height:1}",
      ".tb-panel .sw--pick{display:flex;align-items:center;justify-content:center;border-style:dashed}",
      ".tb-panel .sw--pick i{color:#888;font-size:13px;font-style:normal;line-height:1;pointer-events:none}",
      ".tb-panel .sw--pick input{position:absolute;inset:-3px;width:28px;height:28px;opacity:0;cursor:pointer;border:none;padding:0}",
      ".tb-panel .adv{margin:2px 0 6px}",
      ".tb-panel .adv summary{color:#7f8c8d;font-size:11px;cursor:pointer;list-style:none;padding:2px 0}",
      ".tb-panel .adv summary::-webkit-details-marker{display:none}",
      ".tb-panel .adv summary::before{content:'\\25b8  ';font-size:9px}",
      ".tb-panel .adv[open] summary::before{content:'\\25be  '}",
      ".tb-panel .adv .prow{margin-top:6px;margin-bottom:2px}",
      ".tb-panel .mini{height:22px;padding:0 8px;border-radius:6px;border:1px solid #3a3a3a;background:#1d1d1d;color:#bbb;font-size:11px;cursor:pointer;flex:0 0 auto}",
      ".tb-panel .mini.is-on{background:#5fe2db;border-color:#5fe2db;color:#08090c;font-weight:600}",
      ".tb-panel .adv[open] summary{color:#cfd8d9;font-weight:600;margin-bottom:4px}",
      ".tb-panel .tpc.is-hint{display:block;white-space:normal;line-height:1.5;color:#849597;border-color:#2b3233;background:#171717;font-family:inherit;font-size:10px;margin:5px 0 2px}",
      ".tb-panel .seg[data-k=\"align\"] button,.tb-panel .seg[data-k=\"wrap\"] button{font-size:10px}",
      ".tb-panel .b{display:flex;gap:6px;margin-top:9px;position:sticky;bottom:-10px;padding:8px 0 2px;background:#141414;box-shadow:0 -10px 14px rgba(20,20,20,.92)}",
      ".tb-panel .b button{flex:1;height:27px;border-radius:6px;border:1px solid #3a3a3a;background:#1d1d1d;color:#ddd;font-size:12px;cursor:pointer;padding:0}",
      ".tb-panel .b button.p{background:#5fe2db;border-color:#5fe2db;color:#08090c;font-weight:600}",
      ".tb-toast{position:fixed;left:50%;bottom:24px;transform:translate(-50%,8px);z-index:99999;padding:7px 14px;border-radius:99px;background:#1d1d1d;border:1px solid #5fe2db;color:#5fe2db;font:12px/1.4 -apple-system,BlinkMacSystemFont,sans-serif;opacity:0;pointer-events:none;transition:opacity .18s,transform .18s}",
      ".tb-toast.is-on{opacity:1;transform:translate(-50%,0)}"
    ].join("\n");
    document.head.appendChild(st);
  }
  var panelRefresh = null;
  function closePick() {
    if (pickEl) pickEl.classList.remove("tb-sel");
    pickEl = null;
    if (pickPanel && pickPanel.parentNode) pickPanel.parentNode.removeChild(pickPanel);
    pickPanel = null;
    panelRefresh = null;
  }
  /* 面板定位：控制台把预览 iframe 整体缩放了，要按 1/scale 反向缩放才看得清 */
  function placePanel(panel, r) {
    var sc = panelScale();
    /* 控制台把预览 iframe 缩小了，面板要反向放大才看得清。但 iframe 只有 900px
       的内部视口，放大后 1173px 的面板会被直接裁掉下半截（粗细 / 颜色 / 完成
       都够不着）。按 1/放大倍率 反推出可用的「未缩放高度」，超出就内部滚动。 */
    var limit = Math.max(220, Math.floor((window.innerHeight - 16) * sc));
    panel.style.maxHeight = limit + "px";
    panel.style.transformOrigin = "top left";
    panel.style.transform = "scale(" + (1 / sc) + ")";
    panel.style.left = "0px";
    panel.style.top = "0px";
    var box = panel.getBoundingClientRect();
    var w = box.width || 272;
    var left = Math.min(Math.max(8, r.left), Math.max(8, window.innerWidth - w - 12));
    panel.style.left = left + "px";
    panel.style.top = (r.bottom + 8) + "px";
    /* 落位之后再量一次真实高度：面板里有 <details>、色块等，第一次量可能还不完整，
       量矮了就会漏判"下面放不下"，结果被视口底部截掉。 */
    var h = panel.getBoundingClientRect().height || 200;
    var maxTop = Math.max(8, window.innerHeight - h - 8);
    var top = r.bottom + 8;
    if (top > maxTop) top = r.top - h - 8;   /* 下面放不下就翻到上面 */
    top = Math.max(8, Math.min(top, maxTop));  /* 上下都放不下（元素在视口外）就贴边 */
    panel.style.top = top + "px";
  }

  function cssVar(name, fb) {
    var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fb;
  }

  /* 二分反解：当前视口下看到的 px，对应「1440 基准的多少个 px」。
     这样即便在平板/手机预览里调字号，滑块和数值仍然是桌面那一套刻度，
     不会把 31px 当成桌面值写进去。 */
  function pxToCssAt(px, W) {
    var min = Math.min(44, Math.max(16, px * 0.75));
    var vw = ((px / 14.4) * W) / 100;
    return Math.min(Math.max(min, vw), px);
  }
  function basePxOf(el) {
    if (!el) return 0;
    var c = parseFloat(getComputedStyle(el).fontSize) || 0;
    if (!c) return 0;
    var W = window.innerWidth || 1440;
    var lo = 10, hi = 96;
    for (var i = 0; i < 22; i++) {
      var mid = (lo + hi) / 2;
      if (pxToCssAt(mid, W) < c) lo = mid;
      else hi = mid;
    }
    return Math.round(((lo + hi) / 2) * 10) / 10;
  }

  /* 把 [42,42,42,54] 说成人话：「3 处 42px · 1 处 54px」 */
  function groupSizes(list) {
    var map = {};
    list.forEach(function (v) { map[v] = (map[v] || 0) + 1; });
    return Object.keys(map)
      .sort(function (a, b) { return a - b; })
      .map(function (k) { return map[k] + " 处 " + k + "px"; })
      .join(" · ");
  }

  /* ------------------------------------------------------------------
     样式面板：整块 / 片段共用。
     字号 = 直接填 px（并有滑块微调）。同一个数就是同一个字号，跨类别可比。
     行距 = 倍数滑块，存成 px —— 段内字号不一时，px 才能让每行间距一样。
     段后 = 块与块之间的留白，px。
     粗细 = 四档，并显示实际生效的数值（含样式表默认值），避免「选了没反应」。
     颜色 = 预设点选 + 取色器，浅色主题默认从主色推导。
     顶部给出「同类是否一致」，不一致时一键拉齐。
     ------------------------------------------------------------------ */
  function buildPanel(o) {
    var el = o.el;
    var base = o.base || {};
    var kind = o.kind || "block";
    var own = o.own || {};

    var sizePx = parseFloat(base.size) > 0 ? parseFloat(base.size) : basePxOf(el);
    sizePx = Math.max(12, Math.min(96, Math.round(sizePx)));

    var cs = getComputedStyle(el);
    var fs = parseFloat(cs.fontSize) || 16;
    var lhPx = parseFloat(cs.lineHeight);
    if (!isFinite(lhPx) || lhPx <= 0) lhPx = Math.round(fs * 1.5);
    var mbPx = Math.round(parseFloat(cs.marginBottom) || 0);
    var cw = parseInt(cs.fontWeight, 10) || 400;

    var st = {
      size: sizePx,
      weight: base.weight ? String(base.weight) : String(cw),
      color: base.color || "",
      colorLight: base.colorLight || "",
      lh: base.lh ? Math.round(parseFloat(base.lh)) : Math.round(lhPx),
      mb: base.mb ? Math.round(parseFloat(base.mb)) : mbPx,
      w: base.w != null ? String(base.w) : "",
      align: base.align || "",
      wrap: base.wrap || ""
    };
    var colW = containerWidth(el) || Math.round(el.getBoundingClientRect().width);
    var refW = refWidth(el);
    var dirtySize = parseFloat(base.size) > 0;
    var dirtyLh = false, dirtyMb = false, dirtyWeight = false;
    var dirtyW = false, dirtyAlign = false, dirtyWrap = false;
    var scope = o.scope || (Object.keys(own).length ? "self" : "role");
    var sizes = o.sizes || [];

    var PRESET = [
      { v: "", t: "默认（清除颜色）" },
      { v: cssVar("--text-1", "#ffffff"), t: "主文字" },
      { v: cssVar("--text-2", "#c9c9c9"), t: "次要文字" },
      { v: cssVar("--text-3", "#9b9b9b"), t: "弱化" },
      { v: cssVar("--accent", "#0abab5"), t: "强调色" }
    ];

    var same = sizes.length > 1 && sizes.every(function (v) { return v === sizes[0]; });
    var strip = "";
    if (kind === "block" && sizes.length > 1) {
      strip = same
        ? '<div class="tpc is-ok">同类 ' + sizes.length + " 处 · 字号一致 " + sizes[0] + "px</div>"
        : '<div class="tpc"><span>同类 ' + sizes.length + " 处 · " + groupSizes(sizes) +
          '</span><button type="button" data-k="alignall">统一为 ' + sizePx + "px</button></div>";
    }

    var panel = document.createElement("div");
    panel.className = "tb-panel";
    panel.innerHTML =
      '<div class="id">' + escapeHtml(o.title) + "</div>" +
      (o.sub ? '<div class="sel">' + o.sub + "</div>" : "") +
      strip +
      (kind === "block" && sizes.length > 1
        ? '<div class="prow"><span class="pk">范围</span><div class="seg" data-k="scope">' +
            '<button type="button" data-v="role">全部 ' + sizes.length + " 处</button>" +
            '<button type="button" data-v="self">仅此一处</button></div></div>'
        : "") +
      (kind === "block"
        ? '<div class="tpc is-info" data-k="metrics"></div>'
        : "") +
      '<div class="prow"><span class="pk">字号</span>' +
        '<button class="stp" type="button" data-k="minus" title="小 1px">−</button>' +
        '<input class="rg" type="range" data-k="size" min="12" max="96" step="1">' +
        '<button class="stp" type="button" data-k="plus" title="大 1px">+</button>' +
        '<input class="numin" type="number" data-k="numbox" min="12" max="96" step="1"><i class="u">px</i>' +
      "</div>" +
      (kind === "block"
        ? '<div class="prow"><span class="pk">行距</span>' +
            '<input class="rg" type="range" data-k="lh" min="16" max="140" step="1">' +
            '<input class="numin" type="number" data-k="lhn" min="16" max="140" step="1"><i class="u">px</i>' +
            '<b class="num" data-k="lhr"></b></div>' +
          '<div class="prow"><span class="pk">段后</span>' +
            '<input class="rg" type="range" data-k="mb" min="0" max="80" step="2">' +
            '<input class="numin" type="number" data-k="mbn" min="0" max="80" step="2"><i class="u">px</i></div>' +
          '<details class="adv" open><summary>宽度与对齐</summary>' +
            '<div class="tpc is-hint" data-k="wraphint"></div>' +
            '<div class="prow"><span class="pk">宽度</span>' +
              '<input class="rg" type="range" data-k="w" min="160" max="1280" step="4">' +
              '<input class="numin" type="number" data-k="wn" min="160" max="1600" step="4"><i class="u">px</i></div>' +
            '<div class="prow"><span class="pk"></span>' +
              '<button class="mini" type="button" data-k="col" title="对齐到同列最常见的宽度">对齐 ' + refW + '</button>' +
              '<button class="mini" type="button" data-k="full">占满</button>' +
              '<button class="mini" type="button" data-k="wreset">跟随</button></div>' +
            '<div class="prow"><span class="pk">对齐</span><div class="seg" data-k="align">' +
              '<button type="button" data-v="left">左</button><button type="button" data-v="center">中</button>' +
              '<button type="button" data-v="right">右</button><button type="button" data-v="justify">两端</button>' +
            '</div></div>' +
            '<div class="prow"><span class="pk">换行</span><div class="seg" data-k="wrap">' +
              '<button type="button" data-v="" title="按文字框宽度自动折行">自动</button>' +
              '<button type="button" data-v="nowrap" title="保留你手动换的行，每行内部不再自动折行">不折行</button>' +
              '<button type="button" data-v="balance" title="自动折行，但让各行长度更均匀">平衡</button>' +
            '</div></div>' +
          '</details>'
        : "") +
      '<div class="prow"><span class="pk">粗细</span><div class="seg" data-k="seg">' +
        '<button type="button" data-v="400">常规</button>' +
        '<button type="button" data-v="500">中</button>' +
        '<button type="button" data-v="600">半粗</button>' +
        '<button type="button" data-v="700">粗</button>' +
      "</div></div>" +
      '<div class="prow"><span class="pk">颜色</span><div class="sws" data-k="sws">' +
        PRESET.map(function (p) {
          return '<button class="sw' + (p.v ? "" : " sw--none") + '" type="button" data-v="' +
            p.v + '" title="' + p.t + '"' + (p.v ? ' style="background:' + p.v + '"' : "") + "></button>";
        }).join("") +
        '<span class="sw sw--pick" data-k="pick" title="自定义颜色">' +
          '<input type="color" data-k="color"><i>+</i></span>' +
      "</div></div>" +
      '<details class="adv"><summary>浅色主题单独指定</summary>' +
        '<div class="prow"><span class="pk">浅色</span>' +
          '<span class="sw sw--pick"><input type="color" data-k="colorLight"><i>+</i></span>' +
          '<button class="mini" type="button" data-k="autoLight">跟随主色</button></div>' +
      "</details>" +
      '<div class="b"><button type="button" data-k="clear">恢复默认</button>' +
        '<button type="button" class="p" data-k="done">完成</button></div>';

    var q = function (k) { return panel.querySelector('[data-k="' + k + '"]'); };
    var seg = q("seg");
    var scopeSeg = q("scope");

    function lhRatio() {
      return st.size ? st.lh / st.size : 1.5;
    }
    function syncSize() {
      q("size").value = String(st.size);
      q("numbox").value = String(st.size);
      syncText();
    }
    function syncSeg(seg, val) {
      if (!seg) return;
      Array.prototype.forEach.call(seg.querySelectorAll("button"), function (b) {
        b.classList.toggle("is-on", (b.dataset.v || "") === String(val || ""));
      });
    }
    function syncText() {
      if (q("lh")) {
        q("lh").value = String(st.lh);
        q("lhn").value = String(st.lh);
        q("lhr").textContent = lhRatio().toFixed(2) + "×";
      }
      if (q("mb")) {
        q("mb").value = String(st.mb);
        q("mbn").value = String(st.mb);
      }
      if (q("w")) {
        var shown = st.w === "full" ? colW
          : (parseFloat(st.w) > 0 ? parseFloat(st.w) : Math.round(el.getBoundingClientRect().width));
        q("w").value = String(Math.max(160, Math.min(1280, shown)));
        q("wn").value = String(Math.round(shown));
        q("full").classList.toggle("is-on", st.w === "full");
        q("col").classList.toggle("is-on", Math.abs(parseFloat(st.w) - refW) < 2);
        q("wreset").classList.toggle("is-on", st.w === "");
      }
      syncSeg(q("align"), st.align);
      syncSeg(q("wrap"), st.wrap);
      var hint = q("wraphint");
      if (hint) {
        hint.textContent = "手动换行会保留；" +
          (st.wrap === "nowrap" ? "窄屏放不下时自动折行。"
            : st.wrap === "balance" ? "折行时各行更均匀。" : "宽度不够才折行。");
      }
    }
    /* 实时把「这一改到底会不会折行 / 会不会被裁掉」说出来，不用靠肉眼数 */
    function syncMetrics() {
      var m = q("metrics");
      if (!m) return;
      var wNow = Math.round(el.getBoundingClientRect().width);
      var lines = visualLines(el);
      var brs = manualBreaks(el);
      /* 不折行时文字可能比文字框长：用 scrollWidth 量真实的溢出，而不是盒子宽度 */
      var spill = Math.max(0, Math.ceil(el.scrollWidth - el.clientWidth) - 2);
      var fallback = el.hasAttribute("data-tb-wrapfallback");
      /* 宽度已经由类别或本块显式设定时，就不再拿几何猜出来的「同列」值判红 ——
         那是有意的统一，不是失控。只有跟随样式表的自然宽度才需要和同列比较。 */
      var explicit = st.w === "full" || parseFloat(st.w) > 0;
      var diff = wNow - refW;
      var note = fallback ? "窄屏放不下，已自动折行"
        : spill > 4 ? "文字溢出 " + spill + "px，可加宽或减小字号"
        : (!explicit && Math.abs(diff) > 8)
          ? (diff > 0 ? "比同列宽" : "比同列窄") + " " + Math.abs(diff) + "px"
        : "";
      var refTxt = explicit ? "设定 " + wNow + "px" : "同列 " + refW + "px";
      m.classList.toggle("is-bad", !!note);
      m.innerHTML = "<span>" + lines + " 行" + (brs ? "（含 " + brs + " 处手动换行）" : "") +
        " · 宽 " + wNow + "px · " + refTxt + "</span>" +
        (note ? "<b>" + note + "</b>" : "");
    }
    function syncWeight() {
      Array.prototype.forEach.call(seg.querySelectorAll("button"), function (b) {
        b.classList.toggle("is-on", (b.dataset.v || "") === String(st.weight));
      });
    }
    function syncColor() {
      Array.prototype.forEach.call(panel.querySelectorAll(".sws .sw[data-v]"), function (b) {
        b.classList.toggle("is-on", (b.dataset.v || "") === (st.color || ""));
      });
      if (/^#[0-9a-fA-F]{6}$/.test(st.color)) q("color").value = st.color;
      if (/^#[0-9a-fA-F]{6}$/.test(st.colorLight)) q("colorLight").value = st.colorLight;
      var pick = q("pick");
      if (pick) pick.style.background = /^#[0-9a-fA-F]{6}$/.test(st.color) ? st.color : "";
      q("autoLight").classList.toggle("is-on", !st.colorLight);
    }
    function syncScope() {
      if (!scopeSeg) return;
      Array.prototype.forEach.call(scopeSeg.querySelectorAll("button"), function (b) {
        b.classList.toggle("is-on", b.dataset.v === scope);
      });
    }
    function collect() {
      var out = {};
      /* 只写「用户真的动过」或「本来就已经设过」的字段。
         否则只改个颜色，也会把字号 / 行距 / 段后一并钉死成当前值，
         以后样式表再调整就跟不上了。 */
      if (dirtySize || base.size) out.size = Math.round(st.size);
      /* 粗细显示的是「当前算出来的值」，不是用户改过的值。没动过就不要写盘，
         否则只改个换行也会把 400 钉死，以后样式表调粗细就跟不上了。 */
      if (dirtyWeight || base.weight) out.weight = String(st.weight);
      if (st.color) out.color = st.color;
      if (st.colorLight) out.colorLight = st.colorLight;
      if (kind === "block") {
        if (dirtyLh || base.lh) out.lh = Math.round(st.lh);
        if (dirtyMb || base.mb) out.mb = Math.round(st.mb);
        /* 空字符串 = 明确清除（回到样式表），所以要连空值一起发出去 */
        if (dirtyW || base.w != null) out.w = st.w;
        if (dirtyAlign || base.align != null) out.align = st.align;
        if (dirtyWrap || base.wrap != null) out.wrap = st.wrap;
      }
      if (scope === "self") {
        Object.keys(out).forEach(function (k) {
          if (base[k] != null && String(base[k]) === String(out[k])) delete out[k];
        });
      }
      return out;
    }
    function push() {
      syncText();
      o.apply(collect(), scope);
      syncMetrics();
    }

    function setSize(v, fromSlider) {
      st.size = Math.max(12, Math.min(96, Math.round(v) || 12));
      dirtySize = true;
      /* 字号变了，行距按同一比例跟着走，观感不会突然变紧或变松 */
      st.lh = Math.round(st.size * lhRatio());
      if (!fromSlider) syncSize();
      else { q("numbox").value = String(st.size); syncText(); }
      push();
    }

    q("size").addEventListener("input", function () {
      setSize(parseInt(q("size").value, 10) || 12, true);
    });
    q("numbox").addEventListener("change", function () {
      setSize(parseInt(q("numbox").value, 10) || st.size, false);
    });
    q("minus").addEventListener("click", function () { setSize(st.size - 1, false); });
    q("plus").addEventListener("click", function () { setSize(st.size + 1, false); });
    if (q("lh")) {
      q("lh").addEventListener("input", function () {
        st.lh = parseInt(q("lh").value, 10) || st.lh;
        dirtyLh = true;
        syncText();
        push();
      });
      q("lhn").addEventListener("change", function () {
        st.lh = Math.max(16, Math.min(140, parseInt(q("lhn").value, 10) || st.lh));
        dirtyLh = true;
        syncText();
        push();
      });
      q("mb").addEventListener("input", function () {
        st.mb = parseInt(q("mb").value, 10) || 0;
        dirtyMb = true;
        syncText();
        push();
      });
      q("mbn").addEventListener("change", function () {
        st.mb = Math.max(0, Math.min(80, parseInt(q("mbn").value, 10) || 0));
        dirtyMb = true;
        syncText();
        push();
      });
      /* ---- 宽度 / 对齐 / 换行 ---- */
      function setW(v) {
        st.w = v;
        dirtyW = true;
        push();
      }
      q("w").addEventListener("input", function () {
        setW(Math.max(160, Math.min(1280, parseInt(q("w").value, 10) || colW)));
      });
      q("wn").addEventListener("change", function () {
        setW(Math.max(160, Math.min(1600, parseInt(q("wn").value, 10) || colW)));
      });
      q("col").addEventListener("click", function () { setW(refW); });
      q("full").addEventListener("click", function () { setW("full"); });
      q("wreset").addEventListener("click", function () { setW(""); });
      q("align").addEventListener("click", function (e) {
        var b = e.target.closest("button[data-v]");
        if (!b) return;
        st.align = b.dataset.v || "";
        dirtyAlign = true;
        push();
      });
      q("wrap").addEventListener("click", function (e) {
        var b = e.target.closest("button[data-v]");
        if (!b) return;
        st.wrap = b.dataset.v || "";
        dirtyWrap = true;
        push();
      });
    }
    seg.addEventListener("click", function (e) {
      var b = e.target.closest("button[data-v]");
      if (!b) return;
      st.weight = b.dataset.v || "";
      dirtyWeight = true;
      syncWeight();
      push();
    });
    if (scopeSeg) {
      scopeSeg.addEventListener("click", function (e) {
        var b = e.target.closest("button[data-v]");
        if (!b) return;
        scope = b.dataset.v;
        syncScope();
        push();
      });
    }
    var alignAll = q("alignall");
    if (alignAll) {
      alignAll.addEventListener("click", function () {
        scope = "role";
        dirtySize = true;
        syncScope();
        push();
        toastIn("已把 " + sizes.length + " 处统一为 " + st.size + "px");
      });
    }
    q("sws").addEventListener("click", function (e) {
      var b = e.target.closest(".sw[data-v]");
      if (!b) return;
      st.color = b.dataset.v || "";
      syncColor();
      push();
    });
    q("color").addEventListener("input", function () { st.color = q("color").value; push(); });
    q("colorLight").addEventListener("input", function () { st.colorLight = q("colorLight").value; push(); });
    q("autoLight").addEventListener("click", function () { st.colorLight = ""; syncColor(); push(); });
    q("clear").addEventListener("click", function () {
      /* 恢复默认 = 撤掉这一块自己的设置，回到类别（再回到样式表） */
      st = {
        size: sizePx,
        weight: String(cw),
        color: "",
        colorLight: "",
        lh: Math.round(lhPx),
        mb: mbPx,
        w: "",
        align: "",
        wrap: ""
      };
      dirtySize = false; dirtyLh = false; dirtyMb = false; dirtyWeight = false;
      dirtyW = false; dirtyAlign = false; dirtyWrap = false;
      o.apply({}, "self", true);
      closePick();
      toastIn("已恢复默认");
    });
    q("done").addEventListener("click", closePick);

    document.body.appendChild(panel);
    placePanel(panel, (o.anchor || el).getBoundingClientRect());
    pickPanel = panel;
    /* 控制台切设备（1440 / 390）会改 iframe 宽度，页面重排后面板里的
       「几行 / 宽多少 / 是否已兜底」必须跟着刷新，不能停在旧数字上。 */
    panelRefresh = function () { syncText(); syncMetrics(); };
    syncSize(); syncWeight(); syncColor(); syncScope(); syncMetrics();
    return panel;
  }

  /* 面板里的轻提示（iframe 内部，跟控制台的 toast 不共享） */
  var toastEl = null, toastTimer = 0;
  function toastIn(msg) {
    if (!toastEl) {
      toastEl = document.createElement("div");
      toastEl.className = "tb-toast";
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.classList.add("is-on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove("is-on"); }, 1600);
  }
  /* 改完统一交给控制台：整份 styles 一起发，避免两边各拼一份拼出分歧 */
  function pushStyles() {
    if (!state.content) return;
    applyBlockStyles(state.content);
    applyRuns();
    if (window.parent !== window) {
      window.parent.postMessage(
        { __v2: true, type: "styles", styles: state.content.styles || {} },
        "*"
      );
    }
  }

  function openPick(el) {
    pickStyles();
    if (pickEl === el && pickPanel) { closePick(); return; }
    closePick();
    pickEl = el;
    el.classList.add("tb-sel");

    var id = el.dataset.tb;
    var role = roleOf(id);
    var blocks = (state.content && state.content.styles && state.content.styles.blocks) || {};
    var stats = role ? roleStats(role) : [];
    var excerpt = (el.textContent || "").replace(/\s+/g, " ").trim();
    if (excerpt.length > 34) excerpt = excerpt.slice(0, 34) + "…";

    buildPanel({
      el: el,
      kind: "block",
      own: blocks[id] || {},
      base: merged(id),
      sizes: stats.map(function (r) { return r.px; }),
      title: (ROLE_LABEL[role] || "未归类") + (role ? " · 本页 " + stats.length + " 处" : ""),
      sub: excerpt ? escapeHtml(excerpt) : "",
      apply: function (style, scope, reset) {
        if (!state.content) return;
        state.content.styles = state.content.styles || {};
        if (scope === "role" && role) {
          setRoleStyle(role, style);
        } else {
          state.content.styles.blocks = state.content.styles.blocks || {};
          var map = state.content.styles.blocks;
          if (reset) {
            /* 恢复默认 = 撤掉这一块自己的全部设置，回到类别 / 样式表 */
            delete map[id];
          } else {
            /* collect() 给的是「本次真正改动的字段」，不是整块的新值。
               必须合并进原对象，否则只改个换行，之前设好的字号就被抹掉了。 */
            var cur = {};
            Object.keys(map[id] || {}).forEach(function (k) { cur[k] = map[id][k]; });
            Object.keys(style).forEach(function (k) {
              if (style[k] === "" || style[k] == null) delete cur[k];
              else cur[k] = style[k];
            });
            if (Object.keys(cur).length) map[id] = cur;
            else delete map[id];
          }
          if (!Object.keys(map).length) delete state.content.styles.blocks;
        }
        pushStyles();
      }
    });
  }

  /* ------------------------------------------------------------------
     片段面板：只改「选中的那一小段文字」。
     数据写到 styles.runs.<块 id>，DOM 上用 <span data-run="原文"> 包住。
     ------------------------------------------------------------------ */
  function openRun(blockEl, text) {
    pickStyles();
    closePick();
    pickEl = blockEl;
    blockEl.classList.add("tb-sel");

    var id = blockEl.dataset.tb;
    var all = (state.content && state.content.styles && state.content.styles.runs) || {};
    var cur = null;
    (all[id] || []).forEach(function (r) { if (r.text === text) cur = r; });
    var short = text.length > 30 ? text.slice(0, 30) + "…" : text;

    buildPanel({
      el: findRun(blockEl, text) || blockEl,
      kind: "run",
      own: cur || {},
      base: cur || {},
      title: "片段 · " + (ROLE_LABEL[roleOf(id)] || id),
      sub: "「" + escapeHtml(short) + "」",
      apply: function (style) {
        /* 片段在界面上按 px 填，落盘换成「相对本段字号」的倍数 */
        if (style.size) {
          var bb = basePxOf(blockEl) || 16;
          style.scale = Math.round((style.size / bb) * 1000) / 1000;
          delete style.size;
        }
        var has = Object.keys(style).length > 0;
        /* 1) 先落到数据，重绘后还能长回来 */
        if (state.content) {
          state.content.styles = state.content.styles || {};
          state.content.styles.runs = state.content.styles.runs || {};
          var arr = (state.content.styles.runs[id] || []).filter(function (r) { return r.text !== text; });
          if (has) {
            var item = { text: text };
            Object.keys(style).forEach(function (k) { item[k] = style[k]; });
            arr.push(item);
          }
          if (arr.length) state.content.styles.runs[id] = arr;
          else delete state.content.styles.runs[id];
          if (!Object.keys(state.content.styles.runs).length) delete state.content.styles.runs;
        }
        /* 2) 再改 DOM：有就更新，没有就包一层，清空了就解开 */
        var span = findRun(blockEl, text);
        if (!has) {
          if (span) {
            var parent = span.parentNode;
            while (span.firstChild) parent.insertBefore(span.firstChild, span);
            parent.removeChild(span);
          }
        } else {
          var payload = { text: text };
          Object.keys(style).forEach(function (k) { payload[k] = style[k]; });
          if (span) applyRunStyle(span, payload);
          else wrapRun(blockEl, payload);
        }
        pushStyles();
      }
    });
  }

  function escapeHtml(v) {
    return String(v).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  /* 控制台把预览 iframe 整体缩放了，面板要按 1/scale 反向缩放才看得清 */
  function panelScale() {
    var sc = 1;
    try {
      var fe = window.frameElement;
      if (fe) {
        var tf = getComputedStyle(fe).transform;
        var mm = tf && tf !== "none" ? tf.match(/matrix\(([^)]+)\)/) : null;
        if (mm) sc = parseFloat(mm[1].split(",")[0]) || 1;
      }
    } catch (e) {}
    return sc || 1;
  }

  /* 给控制台的「排版总览」用的体检报告：每个类别在本页有几处、
     字号是否一致、当前的行距/段后/粗细各是多少。 */
  function typeReport() {
    var rows = [];
    ROLE_ORDER.forEach(function (role) {
      var nodes = [];
      Array.prototype.forEach.call(document.querySelectorAll("[data-tb]"), function (n) {
        if (roleOf(n.dataset.tb) === role) nodes.push(n);
      });
      if (!nodes.length) return;
      var sizes = nodes.map(function (n) {
        return Math.round(parseFloat(getComputedStyle(n).fontSize) || 0);
      });
      var uniq = sizes.filter(function (v, i, a) { return a.indexOf(v) === i; });
      var widths = nodes.map(function (n) { return Math.round(n.getBoundingClientRect().width); });
      var uniqW = widths.filter(function (v, i, a) { return a.indexOf(v) === i; });
      /* 只有「同一个容器里的同类文字」宽度不齐才是问题。跨栏目的标题本来就该
         各按各栏宽，全标红会让整张表失去意义。 */
      var byParent = [];
      var widthBad = false;
      nodes.forEach(function (n) {
        var hit = null;
        byParent.forEach(function (g) { if (g.p === n.parentElement) hit = g; });
        if (!hit) { hit = { p: n.parentElement, ws: [] }; byParent.push(hit); }
        hit.ws.push(Math.round(n.getBoundingClientRect().width));
      });
      byParent.forEach(function (g) {
        var u = g.ws.filter(function (v, i, a) { return a.indexOf(v) === i; });
        if (g.ws.length > 1 && u.length > 1) widthBad = true;
      });
      var own = merged(nodes[0].dataset.tb);
      var first = nodes[0];
      var cs = getComputedStyle(first);
      var fs = parseFloat(cs.fontSize) || 16;
      var lh = parseFloat(cs.lineHeight) || fs * 1.5;
      rows.push({
        role: role,
        label: ROLE_LABEL[role],
        count: nodes.length,
        sizes: uniq.sort(function (a, b) { return a - b; }),
        widths: uniqW.sort(function (a, b) { return a - b; }),
        widthBad: widthBad,
        size: Math.round(basePxOf(first)),
        w: own.w != null ? String(own.w) : "",
        /* 总览这一列叫「最宽」，给的是 max-width，自然要显示同类里最宽的那个 */
        wNow: Math.max.apply(null, widths),
        align: own.align || "",
        wrap: own.wrap || "",
        weight: parseInt(cs.fontWeight, 10) || 400,
        lh: Math.round((lh / fs) * 100) / 100,
        mb: Math.round(parseFloat(cs.marginBottom) || 0)
      });
    });
    return rows;
  }
  function postReport() {
    if (window.parent === window) return;
    window.parent.postMessage({ __v2: true, type: "type-report", rows: typeReport() }, "*");
  }

  /* ---- 版式参考线 ----
     光看数字很难判断「齐不齐」。打开时给每个文字块描边，
     再按出现次数最多的左/右边界画两条竖线 —— 谁越界一眼就看到。 */
  var guideOn = false, guideL = null, guideR = null;
  function updateGuides() {
    if (!guideOn) return;
    var lefts = {}, rights = {};
    Array.prototype.forEach.call(document.querySelectorAll("[data-tb]"), function (el) {
      var r = el.getBoundingClientRect();
      if (r.bottom < 0 || r.top > window.innerHeight || r.width < 40) return;
      var l = Math.round(r.left / 2) * 2, rt = Math.round(r.right / 2) * 2;
      lefts[l] = (lefts[l] || 0) + 1;
      rights[rt] = (rights[rt] || 0) + 1;
    });
    var top = Object.keys(lefts).sort(function (a, b) { return lefts[b] - lefts[a]; })[0];
    var tr = Object.keys(rights).sort(function (a, b) { return rights[b] - rights[a]; })[0];
    if (top) guideL.style.left = top + "px";
    if (tr) guideR.style.left = tr + "px";
  }
  function setGuides(on) {
    guideOn = !!on;
    document.documentElement.classList.toggle("is-guiding", guideOn);
    if (!guideOn) {
      if (guideL) guideL.style.display = "none";
      if (guideR) guideR.style.display = "none";
      window.removeEventListener("scroll", updateGuides, true);
      return;
    }
    if (!guideL) {
      guideL = document.createElement("div");
      guideR = document.createElement("div");
      [guideL, guideR].forEach(function (d) {
        d.className = "tb-guide";
        document.body.appendChild(d);
      });
      guideR.style.borderColor = "rgba(224,115,107,.65)";
    }
    guideL.style.display = guideR.style.display = "block";
    window.addEventListener("scroll", updateGuides, true);
    updateGuides();
  }

  function setPick(on) {
    pickOn = !!on;
    document.documentElement.classList.toggle("is-picking", pickOn);
    if (pickOn) pickStyles();
    else closePick();
  }
  function initPicker() {
    if (window.parent === window) return;
    var suppressClick = false;

    window.addEventListener("message", function (e) {
      var d = e.data;
      if (!d || d.__v2 !== true) return;
      if (d.type === "pick") setPick(d.on);
      if (d.type === "guides") { setGuides(d.on); return; }
      /* 控制台「排版总览」：要一份各类别的现状 */
      if (d.type === "type-request") { postReport(); return; }
      if (d.type === "role-edit") {
        var p = {};
        var v = d.patch || {};
        if (v.size) p.size = Math.round(v.size);
        if (v.weight) p.weight = String(v.weight);
        if (v.color != null) p.color = v.color;
        if (v.colorLight != null) p.colorLight = v.colorLight;
        if (v.mb != null) p.mb = Math.round(v.mb);
        if (v.w != null) p.w = v.w === "" ? "" : (v.w === "full" ? "full" : Math.round(v.w));
        if (v.align != null) p.align = v.align;
        if (v.wrap != null) p.wrap = v.wrap;
        /* 行距可以直接给 px（总览里就是这么发的），也给倍数换算留一条路 */
        if (v.lh) p.lh = Math.round(v.lh);
        else if (v.lhRatio && (v.size || v.px)) p.lh = Math.round((v.size || v.px) * v.lhRatio);
        if (d.reset) p = {}; 
        if (d.reset && state.content && state.content.styles) {
          setRoleStyle(d.role, { size: "", weight: "", color: "", colorLight: "", lh: "", mb: "" });
        } else {
          setRoleStyle(d.role, p);
        }
        pushStyles();
        postReport();
        return;
      }
    });

    /* 拖选一段文字 → 打开「片段」面板；单击 → 打开整块面板 */
    document.addEventListener("mouseup", function (e) {
      if (!pickOn) return;
      if (pickPanel && pickPanel.contains(e.target)) return;
      var sel = window.getSelection();
      var text = sel ? String(sel).trim().replace(/\s+/g, " ") : "";
      if (!text) return;
      var node = sel.anchorNode;
      var host = node && (node.nodeType === 1 ? node : node.parentElement);
      var blockEl = host && host.closest("[data-tb]");
      if (!blockEl) return;
      suppressClick = true;
      openRun(blockEl, text.slice(0, 120));
    }, true);

    document.addEventListener("click", function (e) {
      if (!pickOn) return;
      if (pickPanel && pickPanel.contains(e.target)) return;
      if (suppressClick) { suppressClick = false; e.preventDefault(); e.stopPropagation(); return; }
      var el = e.target.closest("[data-tb]");
      if (!el) { closePick(); return; }
      e.preventDefault();
      e.stopPropagation();
      openPick(el);
    }, true);
  }

  window.V2 = {
    init: init,
    initPicker: initPicker,
    setPick: setPick,
    applyContent: applyContent,
    patchSection: patchSection,
    renderPage: renderPage,
    applyTheme: applyTheme,
    applyHomeOptions: applyHomeOptions,
    applyTypeStyles: applyTypeStyles,
    applyBlockStyles: applyBlockStyles,
    applyRuns: applyRuns,
    applyAtmosphere: applyAtmosphere,
    stampBlocks: stampBlocks,
    pruneStyles: pruneStyles,
    setRoleStyle: setRoleStyle,
    roleOf: roleOf,
    typeReport: function () { return typeReport(); },
    tbNames: TB_NAMES,
    naturalSize: naturalSize,
    getState: function () { return state; }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
