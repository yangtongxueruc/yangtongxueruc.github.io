/* ============================================================
   SCHEMA.JS — 字段描述表
   决定控制台里每个区块长什么表单、每个字段叫什么名字。
   渲染器按内容结构取值，本文件只影响“可编辑性”。
   field.type: text | textarea | lines | repeater | select | color
   ============================================================ */
window.V2_SCHEMA = {
  groups: [
    /* ---------------- 全站 ---------------- */
    {
      id: "meta",
      label: "站点信息",
      page: "site",
      icon: "01",
      hint: "这里每一项都会立即影响页面。各页的搜索/分享描述写在对应 HTML 的 <head> 里，按页定制；公司名与自我介绍写在「首页」各分节的正文里。",
      fields: [
        { path: "meta.name", label: "名字", type: "text" },
        { path: "meta.mark", label: "导航方块里的字", type: "text", hint: "左上角小方块里显示的字，只取第一个字；留空则取「名字」的第一个字" },
        { path: "meta.brand", label: "导航上的站名", type: "text", hint: "方块右边那行字。留空就不显示，只留方块；想恢复默认就把「名字」整个删掉" },
        { path: "meta.email", label: "联系邮箱", type: "text", hint: "全站唯一真源：首页「直接联系我」与页脚的邮件链接都跟着这里变" }
      ]
    },
    {
      id: "nav",
      label: "导航与页脚",
      page: "site",
      icon: "02",
      hint: "导航项的 key 要和页面文件名对上：home / links / gallery。",
      fields: [
        {
          path: "nav",
          label: "导航项",
          type: "repeater",
          itemLabel: "导航项",
          fields: [
            { path: "label", label: "显示文字", type: "text" },
            { path: "href", label: "链接", type: "text" },
            { path: "key", label: "页面标识", type: "text", hint: "home / links / gallery" }
          ]
        },
        { path: "footer.brand", label: "页脚主标题", type: "text" },
        { path: "footer.tagline", label: "页脚副标题", type: "text" },
        {
          path: "footer.columns",
          label: "页脚栏目",
          type: "repeater",
          itemLabel: "栏目",
          fields: [
            { path: "title", label: "栏目名", type: "text" },
            {
              path: "links",
              label: "链接",
              type: "repeater",
              itemLabel: "链接",
              fields: [
                { path: "label", label: "文字", type: "text" },
                { path: "href", label: "链接", type: "text" }
              ]
            }
          ]
        },
        {
          path: "footer.legal",
          label: "法务链接",
          type: "repeater",
          itemLabel: "链接",
          fields: [
            { path: "label", label: "文字", type: "text" },
            { path: "href", label: "链接", type: "text" }
          ]
        },
        { path: "footer.copyright", label: "版权行", type: "text" }
      ]
    },

    /* ---------------- 首页 ---------------- */
    {
      id: "tab",
      label: "浏览器标签页",
      page: "site",
      icon: "03",
      hint: "浏览器最上面那个小标签上显示的图标和文字。改完刷新页面生效。",
      fields: [
        { path: "meta.favicon", label: "图标", type: "text", hint: "一个 emoji 或一个字符就够，只取第一个；留空则跟「导航方块里的字」用同一个" },
        { path: "meta.siteTitle", label: "文字", type: "text", hint: "留空 = 标签上不显示文字，只留图标；填 auto = 用各页面自己的标题（如「资源库 | 陈屿」）；填别的就整站统一用它" }
      ]
    },
    {
      id: "hero",
      label: "首屏",
      page: "home",
      section: "hero",
      icon: "H",
      hint: "与 v1 一致：左侧文案、右侧人像，底部滚动提示。主标题两行，highlight 里的字会变成强调色。",
      fields: [
        { path: "pages.home.sections.hero.kicker", label: "顶部小字", type: "text" },
        { path: "pages.home.sections.hero.lines", label: "主标题（每行一句，建议两行）", type: "lines" },
        { path: "pages.home.sections.hero.highlight", label: "强调字（取主标题里的片段）", type: "text", hint: "例如「找你」，会显示为强调色并带下划线动画" },
        { path: "pages.home.sections.hero.lead", label: "简介", type: "textarea", rows: 4 },
        { path: "pages.home.sections.hero.meta", label: "信息行（每行一条）", type: "lines" },
        { path: "pages.home.sections.hero.primary.label", label: "主按钮文字", type: "text" },
        { path: "pages.home.sections.hero.primary.href", label: "主按钮链接", type: "text" },
        { path: "pages.home.sections.hero.secondary.label", label: "次按钮文字", type: "text" },
        { path: "pages.home.sections.hero.secondary.href", label: "次按钮链接", type: "text" },
        { path: "pages.home.sections.hero.tertiary.label", label: "文字链文字", type: "text" },
        { path: "pages.home.sections.hero.tertiary.href", label: "文字链链接", type: "text" },
        {
          path: "pages.home.sections.hero.portrait.src",
          label: "人像图片",
          type: "image",
          hint: "点「选择图片」从本机上传，选完自动压缩并即时预览。图片会内嵌进内容文件，点「发布」后随文案一起写入仓库，换设备也能显示。建议 JPG / PNG / WebP，单个不超过 12 MB。线稿类图片建议直接填仓库内路径（如 assets/img/portrait-scratch.jpg），避免 JPEG 重压让细线起毛边。"
        },

        /* ---- 首屏可选项（改完右侧预览即时生效）---- */
        {
          path: "pages.home.sections.hero.layout",
          label: "文字与人像的对齐",
          type: "select",
          options: [
            { v: "center", label: "重心对齐（推荐）" },
            { v: "start",  label: "顶边齐平" },
            { v: "origin", label: "原版 · 底边对齐" }
          ],
          hint: "重心对齐：标题文字块与方形人像的视觉中心一致，整体最平衡。"
        },
        {
          path: "pages.home.sections.hero.portrait.ratio",
          label: "人像框比例",
          type: "select",
          options: [
            { v: "1:1", label: "正方形 1:1" },
            { v: "4:5", label: "竖版 4:5" }
          ],
          hint: "切换后虚线圆环尺寸会跟着变；图片按居中裁切，不会拉伸变形。"
        },
        {
          path: "pages.home.sections.hero.portrait.fx",
          label: "人像效果",
          type: "select",
          options: [
            { v: "glow",  label: "光绘 · 淡青发光（推荐）" },
            { v: "dim",   label: "暗线 · 银灰笔迹" },
            { v: "paper", label: "纸张 · 保留白底" }
          ],
          hint: "白底黑线的图在深色站上会太亮，三种效果分别做反相发光、压暗和留白纸。浅色主题会自动切成墨线，不会出现黑块。"
        },
        {
          path: "pages.home.sections.hero.portrait.status.enabled",
          label: "右下角状态徽标",
          type: "select",
          options: [
            { v: "true",  label: "显示" },
            { v: "false", label: "隐藏" }
          ],
          hint: "仿 GitHub 个人主页 overview 的 status。"
        },
        {
          path: "pages.home.sections.hero.portrait.status.emoji",
          label: "状态 emoji",
          type: "select",
          options: ["🐑", "🌱", "📚", "✨", "🎯", "💬", "🚀", "☕", "🎧", "🧭", "🔭", "🗓️"].map(function (e) {
            return { v: e, label: e };
          }),
          hint: "默认只显示这个圆形 emoji，鼠标移上去才展开文字。"
        },
        {
          path: "pages.home.sections.hero.portrait.status.customEmoji",
          label: "自定义 emoji（可选）",
          type: "text",
          hint: "想用列表以外的 emoji 就粘贴到这里，留空则用上面选的。"
        },
        {
          path: "pages.home.sections.hero.portrait.status.message",
          label: "状态文字",
          type: "text",
          hint: "建议 20 字以内，展开时胶囊会向左伸展。"
        },
        {
          path: "pages.home.sections.hero.portrait.status.display",
          label: "状态显示方式",
          type: "select",
          options: [
            { v: "hover",  label: "悬停展开（GitHub 原版）" },
            { v: "always", label: "常显 emoji + 文字" }
          ],
          hint: "手机等触屏设备没有 hover，会自动常显。"
        },
        {
          path: "pages.home.sections.hero.portrait.showBadge",
          label: "左下角 OPEN 浮标",
          type: "select",
          options: [
            { v: "false", label: "隐藏（推荐，避免与状态徽标重复）" },
            { v: "true",  label: "显示" }
          ]
        },

        { path: "pages.home.sections.hero.portrait.mark", label: "无图片时显示的字", type: "text" },
        { path: "pages.home.sections.hero.portrait.tagline", label: "图片角标文字", type: "text" },
        { path: "pages.home.sections.hero.portrait.badgeLabel", label: "浮标小标签", type: "text" },
        { path: "pages.home.sections.hero.portrait.badgeText", label: "浮标正文", type: "text" },

        /* ---- 首屏背景点阵（改完预览即时生效）---- */
        {
          path: "pages.home.sections.hero.dots.on",
          label: "背景点阵",
          type: "select",
          options: [
            { v: "true",  label: "开启（流动点阵）" },
            { v: "false", label: "关闭（纯黑背景）" }
          ],
          hint: "首屏背后那层会流动的点阵。关掉就等于回到只有光斑的背景。"
        },
        {
          path: "pages.home.sections.hero.dots.morph",
          label: "形态",
          type: "select",
          options: [
            { v: "smoke",  label: "烟雾（推荐，最接近参考效果）" },
            { v: "aurora", label: "极光（横向流带）" },
            { v: "ripple", label: "涟漪（同心波纹）" }
          ]
        },
        {
          path: "pages.home.sections.hero.dots.tone",
          label: "颜色",
          type: "select",
          options: [
            { v: "white", label: "白（推荐）" },
            { v: "teal",  label: "青（呼应强调色）" },
            { v: "gray",  label: "灰（更低调）" }
          ],
          hint: "浅色主题会自动换成深色点，这里选的是深色主题下的颜色。"
        },
        {
          path: "pages.home.sections.hero.dots.step",
          label: "密度",
          type: "text",
          hint: "5–18，数字越小点越密。默认 8；调到 10 以上会明显变粗。"
        },
        {
          path: "pages.home.sections.hero.dots.alpha",
          label: "强度",
          type: "text",
          hint: "5–95，默认 36。想让点阵更靠后就调小（20–28）。"
        },
        {
          path: "pages.home.sections.hero.dots.speed",
          label: "流动速度",
          type: "text",
          hint: "0–200，默认 55。填 0 就静止成一张静态点阵。"
        },
        {
          path: "pages.home.sections.hero.dots.scale",
          label: "团聚程度",
          type: "text",
          hint: "100–460，默认 235。数字越大，明暗团块越大越整；越小越碎。"
        },
        { path: "pages.home.sections.hero.scrollHint", label: "滚动提示文字", type: "text" }
      ]
    },
    {
      id: "atmosphere",
      label: "光晕与呼吸",
      page: "home",
      section: "hero",
      icon: "A",
      hint: "首屏左上角的青色光斑、以及 contact 文字背后的次光源，都用这一套参数。改完右侧预览即时生效。氛围层选「单一光斑」时与原来完全一致；选「多点闪烁」才换成手机端那套随机光点。",
      fields: [
        {
          path: "pages.home.atmosphere.glow",
          label: "氛围层",
          type: "select",
          options: [
            { v: "auto",  label: "自动（宽屏单一光斑 · 窄屏多点闪烁）" },
            { v: "css",   label: "只用单一光斑（现在的桌面效果）" },
            { v: "motes", label: "只用多点闪烁（手机端同款）" },
            { v: "off",   label: "关闭（干干净净的黑）" }
          ],
          hint: "默认「自动」：宽屏保持原来那团常驻光斑，720px 以下换成手机端那套随机光点，两端各得其所。想全局统一就选固定的那两项，想回滚就选 css，文件不用动。"
        },
        {
          path: "pages.home.atmosphere.breathe",
          label: "呼吸效果",
          type: "select",
          options: [
            { v: "true",  label: "开启（明暗缓慢起伏）" },
            { v: "false", label: "关闭（静止的一团光）" }
          ]
        },
        {
          path: "pages.home.atmosphere.speed",
          label: "呼吸周期（秒）",
          type: "text",
          hint: "2–24，默认 6。数字越小呼吸越快；4–6 比较有存在感，8 以上很慢。"
        },
        {
          path: "pages.home.atmosphere.depth",
          label: "起伏幅度",
          type: "text",
          hint: "0–100，默认 62。0 等于不呼吸；100 会明显一亮一暗。"
        },
        {
          path: "pages.home.atmosphere.size",
          label: "晕染范围（%）",
          type: "text",
          hint: "50–220，默认 110。数字越大，光晕覆盖的面积越大、越铺满整屏。"
        },

        /* ---- 光点组：只在上面的「氛围层」选 motes 时起作用 ---- */
        {
          path: "pages.home.atmosphere.moteSize",
          label: "光点尺寸（%）",
          type: "text",
          hint: "10–200，默认 50。按 380–700px 的基准直径打折，50 约等于 190–350px 一团。"
        },
        {
          path: "pages.home.atmosphere.moteCountMin",
          label: "每轮最少光点数",
          type: "text",
          hint: "1–5，默认 1。"
        },
        {
          path: "pages.home.atmosphere.moteCountMax",
          label: "每轮最多光点数",
          type: "text",
          hint: "1–5，默认 5。手机端最多能到 6，桌面首屏更宽，用 5 就不会糊成一片。"
        },
        {
          path: "pages.home.atmosphere.motePeakLo",
          label: "最暗一颗的亮度（%）",
          type: "text",
          hint: "5–100，默认 18。和下面那项拉开差距，才有一明一暗的闪烁感。"
        },
        {
          path: "pages.home.atmosphere.motePeakHi",
          label: "最亮一颗的亮度（%）",
          type: "text",
          hint: "5–100，默认 62。"
        },
        {
          path: "pages.home.atmosphere.moteDur",
          label: "单颗呼吸时长（秒）",
          type: "text",
          hint: "0.5–14，默认 3.2。每颗会在此基础上随机 ±20%。"
        },
        {
          path: "pages.home.atmosphere.moteGapMin",
          label: "轮次间隔下限（毫秒）",
          type: "text",
          hint: "0–20000，默认 900。数字越小，新的一轮接得越紧。"
        },
        {
          path: "pages.home.atmosphere.moteGapMax",
          label: "轮次间隔上限（毫秒）",
          type: "text",
          hint: "0–20000，默认 2600。实际间隔在这两者之间随机。"
        }
      ]
    },
    {
      id: "stats",
      label: "数据条",
      page: "home",
      section: "stats",
      icon: "S",
      hint: "每项一个数据框：序号 + 数字 + 说明 + 底部注解。建议 3–4 项，排成一行；移动端自动变成横向一条。",
      fields: [
        {
          path: "pages.home.sections.stats.items",
          label: "数据项",
          type: "repeater",
          itemLabel: "数据",
          fields: [
            { path: "value", label: "数字", type: "number" },
            { path: "suffix", label: "后缀", type: "text", hint: "例如 +，可留空" },
            { path: "label", label: "说明", type: "text" },
            { path: "note", label: "底部注解", type: "text", hint: "一句补充说明，例如「2015 年起 · 四个阶段」，可留空" }
          ]
        }
      ]
    },
    {
      id: "about",
      label: "关于（01）",
      page: "home",
      section: "about",
      icon: "01",
      hint: "与 v1 一致：左侧栏序号 + 一句主张 + 两栏（正文 / 信息表）。",
      fields: [
        { path: "pages.home.sections.about.no", label: "序号", type: "text" },
        { path: "pages.home.sections.about.label", label: "栏目标签", type: "text" },
        { path: "pages.home.sections.about.lead", label: "主张（第一行）", type: "text" },
        { path: "pages.home.sections.about.leadDim", label: "主张（第二行，弱化）", type: "text" },
        { path: "pages.home.sections.about.paragraphs", label: "正文段落（每行一段）", type: "lines" },
        {
          path: "pages.home.sections.about.facts",
          label: "信息表",
          type: "repeater",
          itemLabel: "条目",
          fields: [
            { path: "k", label: "标签", type: "text" },
            {
              path: "v",
              label: "内容",
              type: "textarea",
              rows: 3,
              hint: "按回车可换行，每一行会单独显示；留空行也会被保留。不换行时与原来完全一致。"
            }
          ]
        }
      ]
    },
    {
      id: "experience",
      label: "经历（02）",
      page: "home",
      section: "experience",
      icon: "02",
      hint: "左侧栏 + 竖向时间线，滚动时线条填充、条目点亮。logo 一律左对齐、按统一高度缩放，公司名不再写文字。",
      fields: [
        { path: "pages.home.sections.experience.no", label: "序号", type: "text" },
        { path: "pages.home.sections.experience.label", label: "栏目标签", type: "text" },
        { path: "pages.home.sections.experience.title", label: "标题", type: "text" },
        { path: "pages.home.sections.experience.titleDim", label: "标题后半（灰）", type: "text" },
        {
          path: "pages.home.sections.experience.items",
          label: "经历条目",
          type: "repeater",
          itemLabel: "经历",
          fields: [
            { path: "period", label: "时间段", type: "text" },
            { path: "role", label: "职位", type: "text" },
            { path: "org", label: "公司 / 机构", type: "text",
              hint: "不再显示文字，只作为 logo 的说明与读屏文字" },
            {
              path: "logo",
              label: "公司 logo",
              type: "logo",
              hint: "PNG 透明底，内容高度 ≥ 128px，单个 < 100 KB。深色主题会自动反白，给原色图即可，"
                  + "不用另外做白色版；浅色主题保留原色。四周透明边距会自动裁掉，"
                  + "并按「文字主体高度」自动给出显示大小，基准略小于正文（17px）。"
                  + "实心徽标反白后偏重、细线字标偏轻，用下面的滑块等比缩放做光学补偿 —— "
                  + "只调显示高度，宽度按原图比例自动算，不会把 logo 拉变形。"
            },
            { path: "desc", label: "做了什么", type: "textarea", rows: 3 }
          ]
        }
      ]
    },
    {
      id: "company",
      label: "公司（03）",
      page: "home",
      section: "company",
      icon: "03",
      hint: "与 v1 一致：三张等信息卡 + 一条构成比例条。",
      fields: [
        { path: "pages.home.sections.company.no", label: "序号", type: "text" },
        { path: "pages.home.sections.company.label", label: "栏目标签", type: "text" },
        { path: "pages.home.sections.company.title", label: "标题", type: "text" },
        { path: "pages.home.sections.company.titleDim", label: "标题后半（灰）", type: "text" },
        { path: "pages.home.sections.company.lead", label: "引言", type: "textarea", rows: 3 },
        {
          path: "pages.home.sections.company.cards",
          label: "信息卡",
          type: "repeater",
          itemLabel: "卡片",
          fields: [
            { path: "idx", label: "小标签", type: "text" },
            { path: "title", label: "标题", type: "text" },
            { path: "body", label: "正文", type: "textarea", rows: 3 }
          ]
        },
        { path: "pages.home.sections.company.sector.label", label: "比例条说明", type: "text" },
        {
          path: "pages.home.sections.company.sector.parts",
          label: "比例分段",
          type: "repeater",
          itemLabel: "分段",
          fields: [
            { path: "pct", label: "占比（%）", type: "number" },
            { path: "text", label: "图例文字", type: "text" }
          ]
        }
      ]
    },
    {
      id: "roles",
      label: "岗位（04）",
      page: "home",
      section: "roles",
      icon: "04",
      hint: "与 v1 一致：整屏固定，向下滚动时卡片横向移动。移动端自动变成横向滑动。",
      fields: [
        { path: "pages.home.sections.roles.no", label: "序号", type: "text" },
        { path: "pages.home.sections.roles.label", label: "栏目标签", type: "text" },
        { path: "pages.home.sections.roles.title", label: "区块标题", type: "text" },
        { path: "pages.home.sections.roles.note", label: "右侧说明（可换行）", type: "textarea", rows: 2 },
        {
          path: "pages.home.sections.roles.items",
          label: "岗位卡片",
          type: "repeater",
          itemLabel: "岗位",
          fields: [
            { path: "no", label: "编号", type: "text" },
            { path: "title", label: "岗位名称", type: "text" },
            { path: "sub", label: "副标题", type: "text" },
            { path: "desc", label: "描述", type: "textarea", rows: 3 },
            { path: "tags", label: "标签（每行一个）", type: "lines" },
            { path: "place", label: "地点与性质", type: "text" },
            {
              path: "applyHref",
              label: "投递链接",
              type: "text",
              hint: "每个岗位单独填写，如 https://… 或 mailto:…。卡片右下角「去投递」会新窗口打开这个地址；留空时按钮显示为不可点击。"
            },
            { path: "badge", label: "角标", type: "text" }
          ]
        }
      ]
    },
    {
      id: "cta",
      label: "结尾行动区",
      page: "home",
      section: "cta",
      icon: "A",
      hint: "与 v1 一致：居中排版，标题 + 说明 + 两个按钮 + 邮箱。邮箱在「站点信息 / 联系邮箱」统一维护，这里不再重复放一个改了不生效的输入框。",
      fields: [
        { path: "pages.home.sections.cta.kicker", label: "顶部小字", type: "text" },
        { path: "pages.home.sections.cta.lines", label: "标题（每行一句）", type: "lines" },
        { path: "pages.home.sections.cta.body", label: "说明", type: "textarea", rows: 3 },
        { path: "pages.home.sections.cta.primary.label", label: "主按钮文字", type: "text" },
        { path: "pages.home.sections.cta.primary.href", label: "主按钮链接", type: "text" },
        { path: "pages.home.sections.cta.secondary.label", label: "次按钮文字", type: "text" },
        { path: "pages.home.sections.cta.secondary.href", label: "次按钮链接", type: "text" }
      ]
    },

    /* ---------------- 资源库 ---------------- */
    {
      id: "links-head",
      label: "页头",
      page: "links",
      section: "head",
      icon: "L1",
      fields: [
        { path: "pages.links.sections.head.kicker", label: "顶部小字", type: "text" },
        { path: "pages.links.sections.head.title", label: "标题第一行", type: "text" },
        { path: "pages.links.sections.head.title2", label: "标题第二行", type: "text" },
        { path: "pages.links.sections.head.lead", label: "引言", type: "textarea", rows: 3 }
      ]
    },
    {
      id: "feed",
      label: "最新动态",
      page: "links",
      section: "feed",
      icon: "L2",
      hint: "条目来自 data/links.json，由抓取脚本生成，这里只能改标题和说明。点左边「加动态」可以手动补一条。",
      /* 树里的动作行：不切换分组，只是开一个操作入口。
         放在「最新动态」下面，因为它的产出就是往这个区块里加条目。 */
      actions: [
        {
          key: "wx-add",
          label: "加动态",
          hint: "贴一个公众号文章链接，解析后写进「最新动态」；往期条目不会被覆盖"
        }
      ],
      fields: [
        { path: "pages.links.sections.feed.title", label: "区块标题", type: "text" },
        { path: "pages.links.sections.feed.note", label: "右侧说明", type: "text" }
      ]
    },
    {
      id: "modules",
      label: "资源模块",
      page: "links",
      section: "modules",
      icon: "L3",
      hint: "模块里的「分类」决定筛选按钮，填新词会自动多出一个按钮。点左边「新建模块」可以直接加一个，不用滚到表单最底下。",
      /* 表单很长（十几个模块时能滚上万像素），把最常用的「加模块」放到目录里，
         一键追加并自动展开、聚焦标题；新模块里再点「＋ 添加卡片」就能加内容。 */
      actions: [
        {
          key: "mod-add",
          label: "新建模块",
          hint: "往资源库末尾追加一个模块，自动填好标识、标题和分类，并聚焦标题输入框"
        }
      ],
      fields: [
        { path: "pages.links.sections.modules.title", label: "区块标题", type: "text" },
        { path: "pages.links.sections.modules.note", label: "右侧说明", type: "text" },
        { path: "pages.links.sections.modules.search", label: "搜索框提示", type: "text" },
        { path: "pages.links.sections.modules.all", label: "「全部」按钮文字", type: "text" },
        { path: "pages.links.sections.modules.empty", label: "空结果提示", type: "text" },
        { path: "pages.links.sections.modules.resetLabel", label: "重置按钮文字", type: "text" },
        {
          path: "pages.links.sections.modules.items",
          label: "模块",
          type: "repeater",
          itemLabel: "模块",
          /* 新建时别给一个全空的壳：空分类不会生成筛选按钮、空标题看不出加了没加，
             缺 id 又会让多个新模块在 DOM 里都叫 undefined。
             @auto = 生成不重复的标识，@last = 沿用上一个模块的分类。 */
          defaults: { id: "@auto", title: "新模块", filter: "@last", note: "" },
          fields: [
            { path: "title", label: "模块标题", type: "text" },
            { path: "filter", label: "分类", type: "text" },
            { path: "note", label: "模块说明", type: "text" },
            {
              path: "items",
              label: "卡片",
              type: "repeater",
              itemLabel: "卡片",
              fields: [
                { path: "name", label: "名称", type: "text" },
                { path: "url", label: "链接", type: "text",
                  hint: "填网址会显示域名；也可以直接写「微信里搜索」这类提示文字，卡片上会原样显示，且不会乱跳转" },
                { path: "linkText", label: "链接文字", type: "text",
                  hint: "可选。填了就覆盖卡片底部那行字（例如「微信里搜索」「在公众号里看」）；留空则显示网址域名" },
                { path: "desc", label: "一句话描述", type: "textarea", rows: 2 },
                { path: "tag", label: "标签", type: "text" },
                { path: "badge", label: "角标", type: "text" }
              ]
            },
            { path: "id", label: "模块标识", type: "text", hint: "自动生成，用于区块锚点，一般不用改" }
          ]
        }
      ]
    },
    {
      id: "footnote",
      label: "页脚说明",
      page: "links",
      section: "note",
      icon: "L4",
      hint: "显示在资源库页最下面的一行小字，用来说明外部链接的责任归属。",
      fields: [
        { path: "pages.links.sections.note.label", label: "标签文字", type: "text", hint: "前面的小标题，留空则只显示正文" },
        { path: "pages.links.sections.note.text", label: "说明正文", type: "textarea", rows: 2 }
      ]
    },

    /* ---------------- 影像 ---------------- */
    {
      id: "gallery-head",
      label: "页头",
      page: "gallery",
      section: "head",
      icon: "G1",
      fields: [
        { path: "pages.gallery.sections.head.kicker", label: "顶部小字", type: "text" },
        { path: "pages.gallery.sections.head.title", label: "标题第一行", type: "text" },
        { path: "pages.gallery.sections.head.title2", label: "标题第二行", type: "text" },
        { path: "pages.gallery.sections.head.lead", label: "引言", type: "textarea", rows: 3 }
      ]
    },
    {
      id: "frames",
      label: "照片",
      page: "gallery",
      section: "frames",
      icon: "G2",
      hint: "点「批量上传照片」从电脑里选图，可一次选多张。图片会先压到最长边 1800px，存进 assets/img/gallery/，内容里只留路径 —— 不用再手写 assets/img/xxx.jpg。",
      fields: [
        {
          path: "pages.gallery.sections.frames.items",
          label: "照片",
          type: "repeater",
          itemLabel: "照片",
          /* 批量上传：一次选多张，每张自动生成一张卡片，标题先用文件名 */
          batch: {
            label: "批量上传照片",
            hint: "可一次选多张，每张自动生成一张卡片，标题先用文件名，之后再改。"
          },
          fields: [
            { path: "src", label: "图片", type: "photo" },
            { path: "title", label: "标题", type: "text" },
            { path: "place", label: "地点 / 时间", type: "text" },
            { path: "caption", label: "说明", type: "textarea", rows: 2 },
            { path: "alt", label: "无障碍描述", type: "text", hint: "给读屏软件与搜图用" }
          ]
        }
      ]
    },

    /* ---------------- 法务 / 404 ---------------- */
    {
      id: "legal",
      label: "隐私与条款",
      page: "legal",
      section: "body",
      icon: "P",
      fields: [
        { path: "pages.legal.sections.head.title", label: "页面标题", type: "text" },
        { path: "pages.legal.sections.head.lead", label: "引言", type: "textarea", rows: 2 },
        {
          path: "pages.legal.sections.body.blocks",
          label: "段落块",
          type: "repeater",
          itemLabel: "段落块",
          fields: [
            { path: "h", label: "小标题", type: "text" },
            { path: "anchor", label: "锚点 id", type: "text", hint: "页脚链接用 #privacy / #terms" },
            { path: "ps", label: "正文段落（每行一段）", type: "lines" },
            { path: "list", label: "要点列表（每行一条，可留空）", type: "lines" }
          ]
        }
      ]
    },
    {
      id: "notfound",
      label: "404 页面",
      page: "404",
      section: "head",
      icon: "404",
      fields: [
        { path: "pages.notfound.sections.head.title", label: "标题", type: "text" },
        { path: "pages.notfound.sections.head.lead", label: "说明", type: "textarea", rows: 2 },
        { path: "pages.notfound.sections.head.primary.label", label: "主按钮文字", type: "text" },
        { path: "pages.notfound.sections.head.secondary.label", label: "次按钮文字", type: "text" }
      ]
    }
  ]
};
