/* render.js — Canvas 2D 贴图渲染（v3 · 文生图版）
   -----------------------------------------------------------------
   风格：半写实末日水彩概念画。所有角色/建筑/环境都是 PNG 贴图，
   Canvas 只负责合成 + HP 条 + 动画效果（跳跃/走路抖）+ 大招粒子。
   -----------------------------------------------------------------
*/

const R = {
  CANVAS_W: 1280, CANVAS_H: 560,
  GROUND_Y: 470,            // 战线底部（视觉水平线，压低给天空更多空间）
  ROW_OFFSET: [0, -55],     // row 0 前排；row 1 后排（视觉靠上&略小）
};

// x/y from sim → 画布坐标
function toCanvas(x, y, row) {
  const cx = x * (R.CANVAS_W / Sim.LANE_LEN);
  const rowY = R.ROW_OFFSET[row] || 0;
  const cy = R.GROUND_Y + rowY + (y || 0);
  return { cx, cy };
}
function scaleForRow(row) { return row === 1 ? 0.78 : 1.0; }

// ==================================================================
// arch → 贴图 & 高度映射（缩小占屏比：单位高度 55~78px）
// ==================================================================
const ARCH_TO_IMG = {
  melee_cheap:  "hk_peasant",
  melee_tank:   "hk_tank",
  melee_fast:   "hk_runner",
  ranged_light: "hk_ranged_light",
  ranged_aoe:   "hk_ranged_aoe",
  ranged_heavy: "hk_ranged_heavy",
  support:      "hk_caster",
  zom_normal:   "zom_normal",
  zom_hopper:   "zom_hop",
  zom_banshee:  "zom_lady",
  zom_giant:    "zom_giant",
  zom_cata:     "zom_cata",
  zom_toxic:    "zom_toxic",
  zom_ghost:    "zom_ghost",
};
// 僵尸阵营用了人类原型时的皮肤兜底
const ZOM_FALLBACK = {
  ranged_light: "zom_ghost",
  ranged_aoe:   "zom_toxic",
  ranged_heavy: "zom_toxic",
  support:      "zom_lady",
  melee_tank:   "zom_giant",
  melee_cheap:  "zom_normal",
  melee_fast:   "zom_hopper",
};
const ARCH_HEIGHT = {
  melee_cheap:  58,
  melee_tank:   68,
  melee_fast:   56,
  ranged_light: 60,
  ranged_aoe:   60,
  ranged_heavy: 66,
  support:      62,
  zom_normal:   60,
  zom_hopper:   62,
  zom_banshee:  70,
  zom_giant:    80,
  zom_cata:     72,
  zom_toxic:    64,
  zom_ghost:    68,
};

function imgForUnit(u) {
  const arch = u.def.arch;
  if (u.team === "zom" && !arch.startsWith("zom") && ZOM_FALLBACK[arch]) return ZOM_FALLBACK[arch];
  return ARCH_TO_IMG[arch] || "hk_peasant";
}
function heightForUnit(u) { return ARCH_HEIGHT[u.def.arch] || 60; }

// civ → 背景 & 基地贴图
const CIV_BG = {
  hk_finance: "bg_finance", hk_slum: "bg_slum", hk_police: "bg_police",
  zom_classic: "bg_zomclassic", zom_ghost: "bg_zomghost", zom_bio: "bg_zombio",
};
const CIV_BASE = {
  hk_finance: "base_finance", hk_slum: "base_slum", hk_police: "base_police",
  zom_classic: "base_zomclassic", zom_ghost: "base_zomghost", zom_bio: "base_zombio",
};

// ==================================================================
// 背景 · 分屏双 backdrop + 顶部渐变
// ==================================================================
function drawBackground(ctx, snap, tShow) {
  const hkP = snap.players.find(p => p.team === "hk");
  const zomP = snap.players.find(p => p.team === "zom");
  const bgHK = IMG[CIV_BG[hkP?.civId || "hk_finance"]];
  const bgZom = IMG[CIV_BG[zomP?.civId || "zom_classic"]];

  // 底色兜底
  const grad = ctx.createLinearGradient(0, 0, 0, R.CANVAS_H);
  grad.addColorStop(0, "#3a2410");
  grad.addColorStop(0.55, "#8a5a28");
  grad.addColorStop(1, "#221510");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, R.CANVAS_W, R.CANVAS_H);

  // 香港背景（左半，稍微越过中线）
  if (bgHK) {
    const bw = R.CANVAS_W * 0.60;
    const bh = R.CANVAS_H;   // 铺满高度；底部会被地面覆盖
    ctx.drawImage(bgHK, 0, 0, bw, bh);
  }
  // 僵尸背景（右半）
  if (bgZom) {
    const bw = R.CANVAS_W * 0.60;
    ctx.drawImage(bgZom, R.CANVAS_W - bw, 0, bw, R.CANVAS_H);
  }

  // 中缝柔化：一条纵向渐变把两张图接缝糊掉
  const seam = ctx.createLinearGradient(R.CANVAS_W * 0.42, 0, R.CANVAS_W * 0.58, 0);
  seam.addColorStop(0.00, "rgba(30,20,10,0)");
  seam.addColorStop(0.50, "rgba(30,20,10,0.55)");
  seam.addColorStop(1.00, "rgba(30,20,10,0)");
  ctx.fillStyle = seam;
  ctx.fillRect(R.CANVAS_W * 0.42, 0, R.CANVAS_W * 0.16, R.CANVAS_H);

  // 全屏顶暗底暗（vignette 感）
  const vig = ctx.createLinearGradient(0, 0, 0, R.CANVAS_H);
  vig.addColorStop(0, "rgba(10,5,2,0.35)");
  vig.addColorStop(0.55, "rgba(10,5,2,0)");
  vig.addColorStop(1, "rgba(10,5,2,0.55)");
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, R.CANVAS_W, R.CANVAS_H);

  // 地面条 —— 深沥青
  const ground = ctx.createLinearGradient(0, R.GROUND_Y - 5, 0, R.CANVAS_H);
  ground.addColorStop(0, "#3a2416");
  ground.addColorStop(0.3, "#231610");
  ground.addColorStop(1, "#0d0705");
  ctx.fillStyle = ground;
  ctx.fillRect(0, R.GROUND_Y, R.CANVAS_W, R.CANVAS_H - R.GROUND_Y);

  // 路缘线
  ctx.strokeStyle = "#0a0503"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, R.GROUND_Y); ctx.lineTo(R.CANVAS_W, R.GROUND_Y); ctx.stroke();

  // 中线（黄色间断）
  ctx.strokeStyle = "rgba(240,190,80,0.55)"; ctx.lineWidth = 2;
  ctx.setLineDash([18, 14]);
  ctx.beginPath(); ctx.moveTo(0, R.GROUND_Y + 42); ctx.lineTo(R.CANVAS_W, R.GROUND_Y + 42); ctx.stroke();
  ctx.setLineDash([]);
}

// ==================================================================
// 环境装饰 · 按对局种子固定散布
// ==================================================================
let envCacheKey = null;
let envProps = [];
function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function ensureEnvironment(snap) {
  const hk = snap.players.find(p => p.team === "hk");
  const zom = snap.players.find(p => p.team === "zom");
  const key = (hk?.civId || "-") + "|" + (zom?.civId || "-") + "|" + (snap.seed || 0);
  if (envCacheKey === key) return;
  envCacheKey = key;
  envProps = [];
  const rng = Sim.makeRng(hashStr(key));
  const types = [
    { key: "env_car",    h: 66, weight: 0.7, foreground: false },
    { key: "env_debris", h: 42, weight: 1.4, foreground: false },
    { key: "env_lamp",   h: 100, weight: 0.5, foreground: false },
    { key: "env_trash",  h: 44, weight: 1.1, foreground: false },
  ];
  const totalW = types.reduce((a, b) => a + b.weight, 0);

  // 远景撒 12 个（在地面往上一点点，靠近 GROUND_Y）
  for (let i = 0; i < 12; i++) {
    let r = rng() * totalW, chosen = types[0], acc = 0;
    for (const t of types) { acc += t.weight; if (r <= acc) { chosen = t; break; } }
    // x 在 [70, W-70]，尽量避开正中战斗热区 [540, 740]
    let px;
    for (let tries = 0; tries < 6; tries++) {
      px = 70 + rng() * (R.CANVAS_W - 140);
      if (px < 540 || px > 740) break;
    }
    const py = R.GROUND_Y + rng() * 8;                    // 稍微下探 = 落在地上
    const flip = rng() > 0.5;
    const scale = 0.75 + rng() * 0.35;
    envProps.push({ key: chosen.key, h: chosen.h * scale, x: px, y: py, flip, z: py });
  }
  // 前景撒 5 个（更靠近底部，会盖住单位一点点，营造深度）
  for (let i = 0; i < 5; i++) {
    let r = rng() * totalW, chosen = types[0], acc = 0;
    for (const t of types) { acc += t.weight; if (r <= acc) { chosen = t; break; } }
    let px;
    for (let tries = 0; tries < 6; tries++) {
      px = 30 + rng() * (R.CANVAS_W - 60);
      if (px < 500 || px > 780) break;
    }
    const py = R.GROUND_Y + 30 + rng() * 40;
    const flip = rng() > 0.5;
    const scale = 0.85 + rng() * 0.35;
    envProps.push({ key: chosen.key, h: chosen.h * scale, x: px, y: py, flip, z: py + 200 });
  }
  // z 排序：先画远（小 z）
  envProps.sort((a, b) => a.z - b.z);
}
function drawEnvBack(ctx) {
  // 只画背景层（z < 200 的都是背景）
  for (const p of envProps) {
    if (p.z >= 200) continue;
    drawEnvProp(ctx, p);
  }
}
function drawEnvFront(ctx) {
  for (const p of envProps) {
    if (p.z < 200) continue;
    drawEnvProp(ctx, p);
  }
}
function drawEnvProp(ctx, p) {
  const img = IMG[p.key];
  if (!img) return;
  const w = p.h * (img.width / img.height);
  ctx.save();
  // 阴影托一下
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath(); ctx.ellipse(p.x, p.y + 2, w * 0.4, 4, 0, 0, Math.PI * 2); ctx.fill();
  if (p.flip) {
    ctx.translate(p.x, 0); ctx.scale(-1, 1);
    ctx.drawImage(img, -w / 2, p.y - p.h, w, p.h);
  } else {
    ctx.drawImage(img, p.x - w / 2, p.y - p.h, w, p.h);
  }
  ctx.restore();
}

// ==================================================================
// 基地
// ==================================================================
function drawBases(ctx, snap) {
  const hkP = snap.players.find(p => p.team === "hk");
  const zomP = snap.players.find(p => p.team === "zom");
  const { cx: hkX } = toCanvas(Sim.HQ_HK_X, 0, 0);
  const { cx: zomX } = toCanvas(Sim.HQ_ZOM_X, 0, 0);
  drawBase(ctx, hkX, R.GROUND_Y, hkP?.civId || "hk_finance", "hk", snap.hp.hk / snap.hpMax.hk);
  drawBase(ctx, zomX, R.GROUND_Y, zomP?.civId || "zom_classic", "zom", snap.hp.zom / snap.hpMax.zom);
}
function drawBase(ctx, x, groundY, civId, team, hpRatio) {
  const img = IMG[CIV_BASE[civId]];
  const targetH = 150;
  ctx.save();
  // 受创震动
  if (hpRatio < 0.35) {
    ctx.translate(x + (Math.random() - 0.5) * 3, groundY);
  } else {
    ctx.translate(x, groundY);
  }
  if (img) {
    const w = targetH * (img.width / img.height);
    // 面向战场：HK 基地(左侧) 不翻转，僵尸基地(右侧) 翻转（基地图默认都是 3/4 视角，可视做正面）
    // 实际测试都是正面朝观众，不需要翻转
    ctx.drawImage(img, -w / 2, -targetH, w, targetH);
  } else {
    // 兜底方块
    const civ = CIVS[civId];
    ctx.fillStyle = civ?.color || "#333"; ctx.strokeStyle = "#1a120b"; ctx.lineWidth = 4;
    ctx.fillRect(-60, -120, 120, 120); ctx.strokeRect(-60, -120, 120, 120);
  }

  // 招牌 + HP
  const civ = CIVS[civId] || { name: "?", accent: "#ffd" };
  ctx.fillStyle = "rgba(0,0,0,0.65)";
  ctx.strokeStyle = "#000"; ctx.lineWidth = 2;
  const label = civ.name.slice(0, 6);
  ctx.font = "bold 14px 'Microsoft YaHei', sans-serif";
  const textW = ctx.measureText(label).width;
  const boxW = Math.max(textW + 20, 90);
  ctx.fillRect(-boxW / 2, -targetH - 30, boxW, 22);
  ctx.strokeRect(-boxW / 2, -targetH - 30, boxW, 22);
  ctx.fillStyle = hpRatio < 0.3 ? "#ff8888" : civ.accent || "#ffe0a0";
  ctx.textAlign = "center";
  ctx.fillText(label, 0, -targetH - 14);

  // HP 条
  const barW = boxW - 8, barH = 4;
  ctx.fillStyle = "#000"; ctx.fillRect(-barW / 2, -targetH - 6, barW, barH);
  ctx.fillStyle = hpRatio > 0.5 ? "#5cd66d" : hpRatio > 0.25 ? "#f6a13d" : "#c93c3c";
  ctx.fillRect(-barW / 2, -targetH - 6, barW * hpRatio, barH);

  // 受创冒烟
  if (hpRatio < 0.45) {
    ctx.fillStyle = "rgba(40,40,40,0.5)";
    for (let i = 0; i < 3; i++) {
      const puffX = (Math.random() - 0.5) * 60;
      const puffY = -targetH - 30 - Math.random() * 40;
      ctx.beginPath(); ctx.arc(puffX, puffY, 6 + Math.random() * 6, 0, Math.PI * 2); ctx.fill();
    }
  }

  ctx.restore();
}

// ==================================================================
// 单位
// ==================================================================
function drawUnit(ctx, u, tShow) {
  const { cx, cy } = toCanvas(u.x, 0, u.row || 0);
  const s = scaleForRow(u.row || 0);
  const dir = u.dir;
  const imgKey = imgForUnit(u);
  const img = IMG[imgKey];
  const H = heightForUnit(u) * s;

  ctx.save();
  ctx.translate(cx, cy);
  // 跳跃弧线
  let jumpH = 0;
  if (u.jumpUntil && u.jumpUntil > tShow) {
    const p = (tShow - u.jumpStart) / u.jumpDur;
    jumpH = -Math.sin(Math.max(0, Math.min(1, p)) * Math.PI) * 45;
  }
  ctx.translate(0, jumpH);

  // 走路轻微上下抖（不影响画面稳定，幅度 <=2px）
  const walk = Math.sin(tShow * 8 + u.id) * 1.5;
  ctx.translate(0, walk);

  // 阴影（脚下小椭圆）
  ctx.fillStyle = "rgba(0,0,0,0.4)";
  ctx.beginPath();
  ctx.ellipse(0, 2 - walk - jumpH * 0.3, H * 0.28, 4 * s, 0, 0, Math.PI * 2);
  ctx.fill();

  if (img) {
    const W = H * (img.width / img.height);
    // 决定是否水平翻转：HK 贴图默认朝右(dir=+1)，Zom 贴图默认朝左(dir=-1)
    const spriteNaturalDir = imgKey.startsWith("hk_") ? +1 : -1;
    const flipX = dir !== spriteNaturalDir;
    if (flipX) ctx.scale(-1, 1);
    // 鬼魂半透明
    if (u.def.arch === "zom_ghost") ctx.globalAlpha = 0.7;
    // 被魅惑：淡紫描边（用滤镜太重，用叠色代替）
    ctx.drawImage(img, -W / 2, -H, W, H);
    if (u.charmedBy) {
      ctx.globalCompositeOperation = "source-atop";
      ctx.fillStyle = "rgba(220,90,220,0.30)";
      ctx.fillRect(-W / 2, -H, W, H);
      ctx.globalCompositeOperation = "source-over";
    }
    ctx.globalAlpha = 1;
  } else {
    // 兜底：小方块
    ctx.fillStyle = u.team === "hk" ? "#4a70a8" : "#5a3a3a";
    ctx.fillRect(-8, -H, 16, H);
  }

  ctx.restore();

  // HP 条（世界坐标）
  if (u.hp < u.hpMax) {
    const barW = Math.max(28, H * 0.55);
    const hpP = u.hp / u.hpMax;
    const barY = cy - H - 8 + jumpH + walk;
    ctx.fillStyle = "rgba(0,0,0,0.85)";
    ctx.fillRect(cx - barW / 2 - 1, barY - 1, barW + 2, 4);
    ctx.fillStyle = hpP > 0.5 ? "#5cd66d" : hpP > 0.25 ? "#f6a13d" : "#c93c3c";
    ctx.fillRect(cx - barW / 2, barY, barW * hpP, 2);
  }
  if (u.charmedBy) {
    ctx.fillStyle = "#ff6ee0"; ctx.font = "14px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("💜", cx, cy - H - 12 + jumpH + walk);
  }
}

// ==================================================================
// 效果 / 投射物 / 尸体
// ==================================================================
function drawEffect(ctx, e, tShow) {
  ctx.save();
  switch (e.kind) {
    case "harvester": {
      // 复用红 van 贴图
      const { cx, cy } = toCanvas(e.x, 0, 0);
      const img = IMG["env_car"];
      const H = 70;
      ctx.translate(cx, cy);
      if (img) {
        const W = H * (img.width / img.height);
        if (e.dir < 0) ctx.scale(-1, 1);
        ctx.drawImage(img, -W / 2, -H, W, H);
      } else {
        ctx.fillStyle = "#c8231a"; ctx.fillRect(-40, -30, 80, 30);
      }
      // 尘烟
      ctx.fillStyle = "rgba(200,180,140,0.5)";
      for (let i = 0; i < 4; i++) {
        ctx.beginPath(); ctx.arc(-e.dir * (10 + i * 8), -5 + i * 3, 6 + i, 0, Math.PI * 2); ctx.fill();
      }
      break;
    }
    case "airstrike": {
      const alpha = Math.max(0, e.life);
      ctx.fillStyle = `rgba(0,0,0,${alpha * 0.35})`;
      ctx.fillRect(0, 0, R.CANVAS_W, R.CANVAS_H);
      const rng = Sim.makeRng(e.id * 137);
      for (let i = 0; i < 10; i++) {
        const rx = 100 + rng() * (R.CANVAS_W - 200);
        const ry = R.GROUND_Y - rng() * 100;
        const r = 20 + rng() * 30;
        ctx.fillStyle = "rgba(255,150,40,0.85)";
        ctx.beginPath(); ctx.arc(rx, ry, r * alpha, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "rgba(255,220,80,0.6)";
        ctx.beginPath(); ctx.arc(rx, ry, r * alpha * 0.6, 0, Math.PI * 2); ctx.fill();
      }
      break;
    }
    case "poison_puddle": {
      const { cx, cy } = toCanvas(e.x, 0, 0);
      ctx.fillStyle = "rgba(120,220,90,0.55)";
      ctx.beginPath();
      ctx.ellipse(cx, cy + 4, e.r * 1.4, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(60,180,40,0.8)"; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(cx, cy + 4, e.r * 1.4, 8, 0, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case "explode": {
      const { cx, cy } = toCanvas(e.x, 0, 0);
      const alpha = Math.max(0, e.life * 2);
      ctx.fillStyle = `rgba(255,200,40,${alpha})`;
      ctx.beginPath(); ctx.arc(cx, cy, e.r * (1.5 - alpha), 0, Math.PI * 2); ctx.fill();
      break;
    }
    case "poison_cloud": {
      ctx.fillStyle = `rgba(100,200,100,${Math.min(0.15, e.life * 0.03)})`;
      ctx.fillRect(0, 200, R.CANVAS_W, R.CANVAS_H - 200);
      break;
    }
    case "buff_army": {
      ctx.fillStyle = `rgba(255,60,60,${Math.min(0.2, e.life * 0.02)})`;
      ctx.fillRect(0, 0, R.CANVAS_W, R.CANVAS_H);
      break;
    }
  }
  ctx.restore();
}

function drawProjectile(ctx, pr) {
  const t = pr.t / pr.dur;
  const x = pr.x_from + (pr.x_to - pr.x_from) * t;
  const y = pr.y_from + (pr.y_to - pr.y_from) * t;
  const arc = -Math.sin(t * Math.PI) * 80;
  const { cx, cy } = toCanvas(x, y + arc, 0);
  if (pr.kind === "lob") {
    ctx.fillStyle = "#4a2a1a"; ctx.strokeStyle = "#1a0a05"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  } else if (pr.kind === "barrage_zombie") {
    // 小僵尸剪影
    const img = IMG["zom_normal"];
    if (img) {
      const H = 24; const W = H * (img.width / img.height);
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(t * Math.PI * 2);
      ctx.drawImage(img, -W / 2, -H / 2, W, H);
      ctx.restore();
    } else {
      ctx.fillStyle = "#7a9a5a";
      ctx.beginPath(); ctx.arc(cx, cy, 8, 0, Math.PI * 2); ctx.fill();
    }
  }
}

function drawCorpse(ctx, c, tShow) {
  const { cx, cy } = toCanvas(c.x, 0, 0);
  ctx.save(); ctx.translate(cx, cy);
  const fade = Math.max(0, (c.until - tShow));
  ctx.globalAlpha = Math.min(1, fade);
  ctx.fillStyle = c.team === "hk" ? "#8a4020" : "#4a5a2a";
  ctx.beginPath();
  ctx.ellipse(0, 0, 16, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = c.team === "hk" ? "rgba(180,30,30,0.55)" : "rgba(90,160,60,0.5)";
  for (let i = 0; i < 3; i++) {
    const dx = (Math.random() - 0.5) * 24;
    const dy = (Math.random() - 0.5) * 4;
    ctx.beginPath();
    ctx.arc(dx, dy, 2 + Math.random() * 2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// ==================================================================
// 主入口
// ==================================================================
function render(ctx, snap, tShow, meSeat) {
  ensureEnvironment(snap);

  drawBackground(ctx, snap, tShow);
  drawEnvBack(ctx);
  drawBases(ctx, snap);

  // 尸体先画
  snap.corpses.forEach(c => drawCorpse(ctx, c, tShow));

  // 单位按 y 排序（近处盖过远处）
  const orderedUnits = [...snap.units].sort((a, b) => (a.y + (a.row || 0) * 100) - (b.y + (b.row || 0) * 100));
  orderedUnits.forEach(u => drawUnit(ctx, u, tShow));

  // 投射物
  snap.projectiles.forEach(pr => drawProjectile(ctx, pr));

  // 前景环境
  drawEnvFront(ctx);

  // 全屏效果（大招 / 爆炸）
  snap.effects.forEach(e => drawEffect(ctx, e, tShow));

  // 我方单位金圈
  if (meSeat != null) {
    snap.units.forEach(u => {
      if (u.seat === meSeat) {
        const { cx, cy } = toCanvas(u.x, 0, u.row || 0);
        const H = heightForUnit(u) * scaleForRow(u.row || 0);
        ctx.strokeStyle = "#ffde66"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(cx, cy - H * 0.5, H * 0.5 + 4, 0, Math.PI * 2); ctx.stroke();
      }
    });
  }
}

window.Render = { R, render, toCanvas };
