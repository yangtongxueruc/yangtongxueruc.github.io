/* ============================================================
   TOPO.JS —「页头地形动效」的已发布参数（唯一生效值）

   这个文件由控制台「发布」生成，不要手改 —— 下次发布会整份覆盖。
   想改基线就改 topo-defaults.js（内置兜底），想改线上就进控制台调完发布。

   为什么不并进 content.js：
   · 文案与动效是两条独立的改动流，合成一个 version 会让「只动了动效」
     也把 6 个页面的文案戳全换一遍，diff 噪音大、回滚粒度也粗；
   · 独立文件后可以只 revert 一个 blob 就把动效退回上一版。

   version 单调递增，构建时决定 data/topo.js?v=<version>
   与 iframe 的 topo-scene.html?v=<version> 两处缓存戳。
   history 保留最近 8 个已发布快照（每条约 400B），用于参数级回滚。
   ============================================================ */
window.V2_TOPO = {
  "version": 1,
  "updatedAt": "2026-11-18",
  "params": {
    "boxW": 520,
    "boxH": 325,
    "dx": 0,
    "dy": 0,
    "preset": "original",
    "levels": 7,
    "amp": 0.68,
    "speed": 0.34,
    "orbit": 0.36,
    "pitchDeg": 32,
    "dist": 14.5,
    "dof": 0.55,
    "bloom": 0.2,
    "cyanPct": 7,
    "fontSize": 10,
    "labels": ["最新动态", "比赛", "练习", "信息库"],
    "contours": true,
    "voxels": true,
    "dust": true,
    "frame": true,
    "autorotate": true,
    "postfx": true,
    "autoBeatCut": true,
    "ripple": true,
    "rippleHz": 3.8
  },
  "history": []
};
