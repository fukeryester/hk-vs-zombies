/* render.js — Canvas 2D 贴图渲染（v3.3 · 多基地 + 建筑剪影 + 攻击视觉）
   -----------------------------------------------------------------
   分层（从后到前）：
     背景大图 → 玩家建筑剪影 → 尸体 → 基地 → 单位 → 投射物 → 效果
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
  melee_fast:   "zom_hop",
};
// 体型差异化 —— 巨人有压迫感，小兵适中，跳蚤矮小
// 因为新 sheet 紧凑裁剪，ARCH_HEIGHT 就是屏幕实际像素高度
const ARCH_HEIGHT = {
  melee_cheap:  62,    // 打工人：中等
  melee_tank:   82,    // 防暴警察：壮实
  melee_fast:   50,    // 小混混：矮小灵活
  ranged_light: 66,    // 经纪人：中偏高
  ranged_aoe:   65,    // 厨子：壮实
  ranged_heavy: 78,    // 特警：高大
  support:      68,    // 道士：中等
  zom_normal:   65,    // 经典僵尸：中等
  zom_hopper:   42,    // 跳蚤：趴地上，很矮
  zom_banshee:  74,    // 女鬼：高挑
  zom_giant:    130,   // 巨人僵尸：2x 普通，很有压迫感
  zom_cata:     78,    // 投石僵尸：中偏大
  zom_toxic:    64,    // 毒液僵尸：中等
  zom_ghost:    72,    // 幽灵僵尸：中偏高
};

function imgForUnit(u) {
  const arch = u.def.arch;
  if (u.team === "zom" && !arch.startsWith("zom") && ZOM_FALLBACK[arch]) return ZOM_FALLBACK[arch];
  return ARCH_TO_IMG[arch] || "hk_peasant";
}
function heightForUnit(u) { return ARCH_HEIGHT[u.def.arch] || 60; }

// ==================================================================
// 帧动画映射 —— 每个兵种 arch 有独立外观的 sprite sheet
// ==================================================================
// arch → anim sheet key 前缀
// HK archs: melee_cheap → "hk_melee_cheap"
// ZOM archs: zom_normal → "zom_normal"
function animKeyForUnit(u) {
  const arch = u.def.arch;
  if (arch.startsWith("zom_")) return arch;
  return "hk_" + arch;
}

// 走路速度调制：跳蚤走得快，巨人走得慢
const ARCH_WALK_FPS = {
  melee_fast: 14, zom_hopper: 16,
  melee_tank: 7,  zom_giant: 5,
  zom_ghost: 7,   zom_banshee: 8,
};
function walkFpsForArch(arch) { return ARCH_WALK_FPS[arch] || 10; }

// 文明染色（轻微 source-atop 叠加，同 arch 不同 civ 一眼可辨）
const CIV_TINT = {
  hk_finance: "rgba( 60,120,220,0.14)",
  hk_slum:    "rgba(200,110, 50,0.14)",
  hk_police:  "rgba( 70,150, 90,0.16)",
  zom_classic:"rgba(120,140, 60,0.10)",
  zom_ghost:  "rgba(170,210,230,0.15)",
  zom_bio:    "rgba( 60,180,110,0.16)",
};

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
// 背景 · 单张随机整图（不再左右拼接，也不再撒环境道具）
// ==================================================================
const BG_KEYS = ["bg_finance","bg_slum","bg_police","bg_zomclassic","bg_zomghost","bg_zombio"];
function drawBackground(ctx, snap) {
  const seed = snap.seed || 0;
  const idx = ((seed % BG_KEYS.length) + BG_KEYS.length) % BG_KEYS.length;
  const bg = IMG[BG_KEYS[idx]];

  // 底色兜底
  const grad = ctx.createLinearGradient(0, 0, 0, R.CANVAS_H);
  grad.addColorStop(0, "#3a2410");
  grad.addColorStop(0.55, "#8a5a28");
  grad.addColorStop(1, "#221510");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, R.CANVAS_W, R.CANVAS_H);

  if (bg) {
    // cover-fit：铺满 canvas，多出裁掉
    const cRatio = R.CANVAS_W / R.CANVAS_H;
    const iRatio = bg.width / bg.height;
    let dw, dh, dx, dy;
    if (iRatio > cRatio) {
      dh = R.CANVAS_H; dw = dh * iRatio;
      dx = (R.CANVAS_W - dw) / 2; dy = 0;
    } else {
      dw = R.CANVAS_W; dh = dw / iRatio;
      dx = 0; dy = (R.CANVAS_H - dh) / 2;
    }
    ctx.drawImage(bg, dx, dy, dw, dh);
  }

  // 顶暗底暗 vignette
  const vig = ctx.createLinearGradient(0, 0, 0, R.CANVAS_H);
  vig.addColorStop(0, "rgba(10,5,2,0.35)");
  vig.addColorStop(0.55, "rgba(10,5,2,0)");
  vig.addColorStop(1, "rgba(10,5,2,0.55)");
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, R.CANVAS_W, R.CANVAS_H);

  // 地面条 —— 沥青路，向上一直延伸到后排（row 1）视觉水平线之上
  //   row 0 站在 GROUND_Y；row 1 因 ROW_OFFSET[1]=-55 站在更高的地方
  //   如果地面不延伸上去，后排的建筑/单位会像浮空
  const backY = R.GROUND_Y + R.ROW_OFFSET[1] - 10;   // 后排线略上一点缓冲
  const ground = ctx.createLinearGradient(0, backY, 0, R.CANVAS_H);
  ground.addColorStop(0.00, "rgba(58,36,22,0)");     // 顶端与背景无缝
  ground.addColorStop(0.15, "rgba(58,36,22,0.85)");  // 淡入沥青
  ground.addColorStop(0.45, "rgba(35,22,16,0.95)");
  ground.addColorStop(1.00, "rgba(13,7,5,1)");
  ctx.fillStyle = ground;
  ctx.fillRect(0, backY, R.CANVAS_W, R.CANVAS_H - backY);

  // 前排路缘线（row 0 站位处）
  ctx.strokeStyle = "#0a0503"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, R.GROUND_Y); ctx.lineTo(R.CANVAS_W, R.GROUND_Y); ctx.stroke();
  // 后排水平线（row 1 站位处）—— 更浅的地平线暗示远近
  ctx.strokeStyle = "rgba(10,5,3,0.55)"; ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, R.GROUND_Y + R.ROW_OFFSET[1]);
  ctx.lineTo(R.CANVAS_W, R.GROUND_Y + R.ROW_OFFSET[1]);
  ctx.stroke();

  // 中线（黄色间断）
  ctx.strokeStyle = "rgba(240,190,80,0.55)"; ctx.lineWidth = 2;
  ctx.setLineDash([18, 14]);
  ctx.beginPath(); ctx.moveTo(0, R.GROUND_Y + 42); ctx.lineTo(R.CANVAS_W, R.GROUND_Y + 42); ctx.stroke();
  ctx.setLineDash([]);
}

// ==================================================================
// 玩家建筑剪影（深度：在背景之前、基地/单位之后）
// ==================================================================
// 每种建筑在 sim 中最多 cap 个；渲染这里也最多画 cap 个
// offsets 是相对 baseX、朝中路方向的偏移
const BUILDING_LAYOUT = {
  income:  { offsets: [55, 95, 135, 175, 215, 255], height: 62, kind: "warehouse" },
  pop:     { offsets: [75, 115, 155, 195, 235, 275], height: 58, kind: "house" },
  tech_a:  { offsets: [42], height: 82, kind: "tower", tiers: 2 },
  tech_b:  { offsets: [92], height: 100, kind: "tower", tiers: 3 },
  tech_c:  { offsets: [142], height: 118, kind: "tower", tiers: 4 },
};

function drawPlayerBuildings(ctx, snap) {
  // 后排先画，前排后画（前排会盖住后排）
  const players = [...snap.players].sort((a, b) => (b.row || 0) - (a.row || 0));
  for (const p of players) {
    if (p.baseX == null || !p.built) continue;
    const isHK = p.team === "hk";
    const dirOut = isHK ? +1 : -1; // 朝中路方向
    const row = p.row || 0;
    const rowScale = row === 1 ? 0.72 : 1.0; // 后排小一号（透视）
    const civ = CIVS[p.civId] || {};
    const color = civ.color || "#666";
    const accent = civ.accent || "#e0d090";

    for (const [kind, count] of Object.entries(p.built)) {
      if (kind === "hq" || count <= 0) continue;
      const slot = BUILDING_LAYOUT[kind];
      if (!slot) continue;
      const n = Math.min(count, slot.offsets.length);
      for (let i = 0; i < n; i++) {
        const worldX = p.baseX + dirOut * slot.offsets[i];
        const { cx, cy } = toCanvas(worldX, 0, row);
        // 距离越靠中路 → 视觉稍微再缩小一点（近端到远端 1.0 → 0.85）
        const distScale = 1 - Math.min(0.15, slot.offsets[i] / 1600);
        const h = slot.height * rowScale * distScale;
        drawBuildingSilhouette(ctx, cx, cy, h, slot.kind, slot.tiers || 1, color, accent, dirOut < 0);
      }
    }
  }
}

function drawBuildingSilhouette(ctx, x, groundY, h, kind, tiers, color, accent, flip) {
  ctx.save();
  ctx.translate(x, groundY);
  if (flip) ctx.scale(-1, 1);

  // 脚下阴影
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath(); ctx.ellipse(0, 3, h * 0.38, 4, 0, 0, Math.PI * 2); ctx.fill();

  ctx.strokeStyle = "#0a0503"; ctx.lineWidth = 1.5;

  if (kind === "warehouse") {
    // 仓库 / 拾荒场：矮方屋 + 双坡顶
    const w = h * 1.1;
    const bodyH = h * 0.72;
    ctx.fillStyle = color;
    ctx.fillRect(-w/2, -bodyH, w, bodyH);
    ctx.strokeRect(-w/2, -bodyH, w, bodyH);
    // 顶
    ctx.fillStyle = shade(color, -0.25);
    ctx.beginPath();
    ctx.moveTo(-w/2 - 3, -bodyH);
    ctx.lineTo(0, -h);
    ctx.lineTo(w/2 + 3, -bodyH);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    // 大门
    ctx.fillStyle = "#180d08";
    ctx.fillRect(-w*0.18, -bodyH*0.55, w*0.36, bodyH*0.55);
    // 金条腰带（income 提示）
    ctx.fillStyle = accent;
    ctx.fillRect(-w*0.42, -bodyH*0.9, w*0.84, 3);
  } else if (kind === "house") {
    // 民房：斜顶小屋 + 两扇窗
    const w = h * 0.95;
    const bodyH = h * 0.62;
    ctx.fillStyle = color;
    ctx.fillRect(-w/2, -bodyH, w, bodyH);
    ctx.strokeRect(-w/2, -bodyH, w, bodyH);
    // 屋顶
    ctx.fillStyle = "#5c3620";
    ctx.beginPath();
    ctx.moveTo(-w/2 - 4, -bodyH);
    ctx.lineTo(0, -h);
    ctx.lineTo(w/2 + 4, -bodyH);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    // 窗
    ctx.fillStyle = "#f6c94a";
    ctx.fillRect(-w*0.34, -bodyH*0.85, w*0.22, bodyH*0.3);
    ctx.fillRect( w*0.12, -bodyH*0.85, w*0.22, bodyH*0.3);
    // 门
    ctx.fillStyle = "#180d08";
    ctx.fillRect(-w*0.1, -bodyH*0.45, w*0.2, bodyH*0.45);
  } else if (kind === "tower") {
    // 科技塔：多层收窄
    const w = h * 0.5;
    const tierH = h * 0.85 / tiers;
    for (let i = 0; i < tiers; i++) {
      const y0 = -tierH * (i + 1);
      const shrink = i * (w * 0.08);
      const tw = w - shrink * 2;
      ctx.fillStyle = i === tiers - 1 ? accent : color;
      ctx.fillRect(-tw/2, y0, tw, tierH);
      ctx.strokeRect(-tw/2, y0, tw, tierH);
      // 每层小窗
      ctx.fillStyle = "#f6c94a";
      ctx.fillRect(-tw*0.15, y0 + tierH*0.32, tw*0.3, tierH*0.22);
    }
    // 最高级塔顶天线
    if (tiers >= 4) {
      ctx.strokeStyle = "#1c1410"; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, -h * 0.86);
      ctx.lineTo(0, -h);
      ctx.stroke();
      ctx.fillStyle = "#ff4444";
      ctx.beginPath(); ctx.arc(0, -h, 3, 0, Math.PI*2); ctx.fill();
    }
  }

  ctx.restore();
}

function shade(hex, amt) {
  // hex "#rrggbb" -> lighten/darken by amt (-1..1)
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const f = amt < 0 ? 0 : 255, t = amt < 0 ? -amt : amt;
  r = Math.round(r + (f - r) * t);
  g = Math.round(g + (f - g) * t);
  b = Math.round(b + (f - b) * t);
  return "#" + ((r<<16)|(g<<8)|b).toString(16).padStart(6, "0");
}

// ==================================================================
// 基地（每玩家一座）
// ==================================================================
function drawBases(ctx, snap) {
  // 后排先画（视觉在后），前排后画（在前）
  const players = [...snap.players].sort((a, b) => (b.row || 0) - (a.row || 0));
  for (const p of players) {
    if (p.baseX == null) continue;
    const { cx, cy } = toCanvas(p.baseX, 0, p.row || 0);
    const hpRatio = p.baseHpMax > 0 ? Math.max(0, p.baseHp / p.baseHpMax) : 0;
    const scale = (p.row === 1) ? 0.72 : 1.0;
    drawBase(ctx, cx, cy, p.civId, p.team, hpRatio, scale, p);
  }
}
function drawBase(ctx, x, groundY, civId, team, hpRatio, scale, player) {
  const img = IMG[CIV_BASE[civId]];
  const targetH = 150 * scale;
  const dead = hpRatio <= 0;
  ctx.save();
  if (dead) ctx.globalAlpha = 0.45;
  // 受创震动
  const shake = (hpRatio < 0.35 && !dead) ? (Math.random() - 0.5) * 3 : 0;
  ctx.translate(x + shake, groundY);
  if (img) {
    const w = targetH * (img.width / img.height);
    ctx.drawImage(img, -w / 2, -targetH, w, targetH);
    // 爆掉的基地叠一层焦黑
    if (dead) {
      ctx.fillStyle = "rgba(10,5,2,0.55)";
      ctx.fillRect(-w/2, -targetH, w, targetH);
    }
  } else {
    const civ = CIVS[civId];
    ctx.fillStyle = civ?.color || "#333"; ctx.strokeStyle = "#1a120b"; ctx.lineWidth = 4;
    ctx.fillRect(-60*scale, -120*scale, 120*scale, 120*scale);
    ctx.strokeRect(-60*scale, -120*scale, 120*scale, 120*scale);
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  // 招牌 + HP（不做震动，读得清楚）
  ctx.save();
  ctx.translate(x, groundY - targetH);
  const civ = CIVS[civId] || { name: "?", accent: "#ffd" };
  const pn = (player?.name ? player.name.slice(0, 4) + " · " : "");
  const label = pn + civ.name.slice(0, 5);
  ctx.font = "bold 12px 'Microsoft YaHei', sans-serif";
  const textW = ctx.measureText(label).width;
  const boxW = Math.max(textW + 16, 88);
  ctx.fillStyle = dead ? "rgba(70,20,20,0.8)" : "rgba(0,0,0,0.7)";
  ctx.strokeStyle = "#000"; ctx.lineWidth = 2;
  ctx.fillRect(-boxW / 2, -28, boxW, 20);
  ctx.strokeRect(-boxW / 2, -28, boxW, 20);
  ctx.fillStyle = dead ? "#ff7070" : (hpRatio < 0.3 ? "#ff8888" : civ.accent || "#ffe0a0");
  ctx.textAlign = "center";
  ctx.fillText(dead ? "💀 " + label : label, 0, -13);

  // HP 条
  const barW = boxW - 8, barH = 4;
  ctx.fillStyle = "#000"; ctx.fillRect(-barW / 2, -6, barW, barH);
  ctx.fillStyle = dead ? "#333" : (hpRatio > 0.5 ? "#5cd66d" : hpRatio > 0.25 ? "#f6a13d" : "#c93c3c");
  ctx.fillRect(-barW / 2, -6, barW * Math.max(0, hpRatio), barH);
  ctx.restore();

  // 受创冒烟
  if (hpRatio < 0.45 && !dead) {
    ctx.fillStyle = "rgba(40,40,40,0.5)";
    for (let i = 0; i < 3; i++) {
      const puffX = x + (Math.random() - 0.5) * 60;
      const puffY = groundY - targetH * 0.6 - Math.random() * 40;
      ctx.beginPath(); ctx.arc(puffX, puffY, 6 + Math.random() * 6, 0, Math.PI * 2); ctx.fill();
    }
  }
  // 已死冒黑烟
  if (dead) {
    ctx.fillStyle = "rgba(20,15,10,0.6)";
    for (let i = 0; i < 5; i++) {
      const puffX = x + (Math.random() - 0.5) * 80;
      const puffY = groundY - targetH * 0.7 - Math.random() * 80;
      ctx.beginPath(); ctx.arc(puffX, puffY, 8 + Math.random() * 10, 0, Math.PI * 2); ctx.fill();
    }
  }
}

// ==================================================================
// 单位
// ==================================================================
function drawUnit(ctx, u, tShow) {
  const { cx, cy } = toCanvas(u.x, 0, u.row || 0);
  const rowMul = scaleForRow(u.row || 0);
  const dir = u.dir;
  const H = heightForUnit(u) * rowMul;

  // ---- 挑帧动画 sheet + 当前帧 ----
  const arch = u.def.arch;
  const animKey = animKeyForUnit(u) + "_walk";
  let anim = IMG_ANIM[animKey];

  // 判定动作：最近攻击窗 → 攻击 / 否则走路
  const ATK_SHOW = 0.55;
  const atkAge = u.atkFxTime ? (tShow - u.atkFxTime) : 999;
  const isAtk = atkAge >= 0 && atkAge < ATK_SHOW;

  let frame = 0;
  if (anim) {
    if (isAtk) {
      // 攻击时：冻结/慢放中间几帧 + 特效叠加
      const t = atkAge / ATK_SHOW;
      frame = Math.max(0, Math.min(anim.frames - 1, Math.floor(t * anim.frames * 0.5 + 1)));
    } else {
      const fps = walkFpsForArch(arch);
      frame = Math.floor((tShow * fps + u.id * 3.13)) % anim.frames;
    }
  }
  const range = u.def?.range || 24;
  const isMelee = range <= 40;
  const isRanged = !isMelee;

  ctx.save();
  ctx.translate(cx, cy);

  // 跳跃弧线
  let jumpH = 0;
  if (u.jumpUntil && u.jumpUntil > tShow) {
    const p = (tShow - u.jumpStart) / u.jumpDur;
    jumpH = -Math.sin(Math.max(0, Math.min(1, p)) * Math.PI) * 45;
  }
  ctx.translate(0, jumpH);

  // 走路轻微上下抖（帧动画本身有 walk cycle，这里再叠一点飘感）
  const walkBob = Math.sin(tShow * (walkFpsForArch(arch) * 0.7) + u.id) * 1.2;
  ctx.translate(0, walkBob);

  // 攻击 lunge（沿用旧的手感）
  const atkP = isAtk ? (atkAge / ATK_SHOW) : 0;
  const atkBell = isAtk ? Math.sin(atkP * Math.PI) : 0;
  const lungeX = isAtk ? (dir * atkBell * (isMelee ? 10 : 4)) : 0;
  const recoilX = isRanged && isAtk ? (-dir * atkBell * 3) : 0;
  ctx.translate(lungeX + recoilX, 0);

  // 阴影
  ctx.fillStyle = "rgba(0,0,0,0.42)";
  ctx.beginPath();
  ctx.ellipse(0, 2 - walkBob - jumpH * 0.3, H * 0.32, 4 * rowMul, 0, 0, Math.PI * 2);
  ctx.fill();

  // 鬼魂半透明
  if (arch === "zom_ghost") ctx.globalAlpha = 0.7;

  if (anim && anim.img) {
    // 目标高度 → 缩放：像素完美要整数缩放，但角色多样先用比例
    const targetH = H;
    const scale = targetH / anim.fh;
    const W = anim.fw * scale;

    // sheet 默认朝右（+1）：dir=-1 时翻转
    const flipX = dir !== +1;
    if (flipX) ctx.scale(-1, 1);

    // 像素完美关闭平滑
    const prevSmooth = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;

    // 主体
    ctx.drawImage(anim.img,
      frame * anim.fw, 0, anim.fw, anim.fh,   // src rect
      -W / 2, -targetH, W, targetH);          // dst rect

    // 文明染色：source-atop 叠加，只覆盖有像素的地方
    const tint = CIV_TINT[u.civId];
    if (tint) {
      ctx.globalCompositeOperation = "source-atop";
      ctx.fillStyle = tint;
      ctx.fillRect(-W / 2, -targetH, W, targetH);
      ctx.globalCompositeOperation = "source-over";
    }
    // 魅惑覆盖
    if (u.charmedBy) {
      ctx.globalCompositeOperation = "source-atop";
      ctx.fillStyle = "rgba(220,90,220,0.30)";
      ctx.fillRect(-W / 2, -targetH, W, targetH);
      ctx.globalCompositeOperation = "source-over";
    }

    ctx.imageSmoothingEnabled = prevSmooth;
  } else {
    // 兜底：老静态图
    const imgKey = imgForUnit(u);
    const img = IMG[imgKey];
    if (img) {
      const W = H * (img.width / img.height);
      const flipX = dir !== +1;
      if (flipX) ctx.scale(-1, 1);
      ctx.drawImage(img, -W / 2, -H, W, H);
    } else {
      ctx.fillStyle = u.team === "hk" ? "#4a70a8" : "#5a3a3a";
      ctx.fillRect(-8, -H, 16, H);
    }
  }
  ctx.globalAlpha = 1;

  // 近战挥砍星芒（帧动画之外再加个冲击光）
  if (isAtk && isMelee && atkP > 0.25 && atkP < 0.7) {
    ctx.save();
    ctx.translate(dir * 14, -H * 0.55);
    ctx.strokeStyle = `rgba(255,240,180,${(1 - atkP) * 0.9})`;
    ctx.lineWidth = 2;
    const a0 = -Math.PI * 0.55 + atkP * Math.PI * 1.0;
    const a1 = -Math.PI * 0.15 + atkP * Math.PI * 1.0;
    ctx.beginPath(); ctx.arc(0, 0, 18, a0, a1); ctx.stroke();
    ctx.restore();
  }
  // 远程枪口闪光
  if (isAtk && isRanged && atkP < 0.35) {
    ctx.save();
    const mx = dir * 14, my = -H * 0.55;
    ctx.fillStyle = `rgba(255,235,120,${1 - atkP * 3})`;
    ctx.beginPath(); ctx.arc(mx, my, 6 - atkP * 8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = `rgba(255,160,40,${0.8 - atkP * 3})`;
    ctx.beginPath(); ctx.arc(mx + dir * 4, my, 4, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  ctx.restore();

  // HP 条（世界坐标）
  if (u.hp < u.hpMax) {
    const barW = Math.max(28, H * 0.55);
    const hpP = u.hp / u.hpMax;
    const barY = cy - H - 8 + jumpH + walkBob;
    ctx.fillStyle = "rgba(0,0,0,0.85)";
    ctx.fillRect(cx - barW / 2 - 1, barY - 1, barW + 2, 4);
    ctx.fillStyle = hpP > 0.5 ? "#5cd66d" : hpP > 0.25 ? "#f6a13d" : "#c93c3c";
    ctx.fillRect(cx - barW / 2, barY, barW * hpP, 2);
  }
  if (u.charmedBy) {
    ctx.fillStyle = "#ff6ee0"; ctx.font = "14px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("💜", cx, cy - H - 12 + jumpH + walkBob);
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
    case "fire_burst": {
      // 爆炸火团：外烟 → 橙焰 → 白核
      const { cx, cy } = toCanvas(e.x, e.y || 0, 0);
      const initLife = e.initLife || 0.55;
      const life = Math.max(0, e.life);
      const t = 1 - life / initLife;                        // 0..1
      const r = e.r * (0.5 + t * 1.3);
      ctx.fillStyle = `rgba(80,50,30,${(1 - t) * 0.45})`;
      ctx.beginPath(); ctx.arc(cx, cy - 8, r * 0.95, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = `rgba(255,130,30,${(1 - t) * 0.95})`;
      ctx.beginPath(); ctx.arc(cx, cy - 4, r * 0.7, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = `rgba(255,235,140,${(1 - t) * 0.9})`;
      ctx.beginPath(); ctx.arc(cx, cy - 4, r * 0.4, 0, Math.PI * 2); ctx.fill();
      // 火星
      for (let i = 0; i < 4; i++) {
        const ang = i * 1.57 + t * 3;
        const rr = r * (0.7 + t * 0.5);
        ctx.fillStyle = `rgba(255,200,80,${(1 - t) * 0.8})`;
        ctx.beginPath();
        ctx.arc(cx + Math.cos(ang) * rr, cy - 4 + Math.sin(ang) * rr * 0.4, 2, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case "spark": {
      // 子弹命中火花
      const { cx, cy } = toCanvas(e.x, e.y || 0, 0);
      const initLife = e.initLife || 0.14;
      const t = 1 - Math.max(0, e.life) / initLife;
      ctx.fillStyle = `rgba(255,240,120,${1 - t})`;
      ctx.beginPath(); ctx.arc(cx, cy - 20, 3 + t * 3, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = `rgba(255,220,80,${(1 - t) * 0.85})`;
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 5; i++) {
        const a = i * 1.25 + t * 2;
        ctx.beginPath();
        ctx.moveTo(cx, cy - 20);
        ctx.lineTo(cx + Math.cos(a) * (4 + t * 12), cy - 20 + Math.sin(a) * (4 + t * 12));
        ctx.stroke();
      }
      break;
    }
  }
  ctx.restore();
}

function drawProjectile(ctx, pr) {
  const t = pr.t / pr.dur;
  const x = pr.x_from + (pr.x_to - pr.x_from) * t;
  const y = pr.y_from + (pr.y_to - pr.y_from) * t;
  const arcH = (pr.kind === "bullet") ? 0
             : (pr.kind === "molotov") ? 55
             : 80;
  const arc = -Math.sin(t * Math.PI) * arcH;
  const { cx, cy } = toCanvas(x, y + arc, 0);

  if (pr.kind === "lob") {
    // 石块 + 拖尾烟
    for (let i = 3; i >= 1; i--) {
      const tt = Math.max(0, t - i * 0.07);
      const xt = pr.x_from + (pr.x_to - pr.x_from) * tt;
      const yt = pr.y_from + (pr.y_to - pr.y_from) * tt - Math.sin(tt * Math.PI) * arcH;
      const { cx: sx, cy: sy } = toCanvas(xt, yt, 0);
      ctx.fillStyle = `rgba(180,160,140,${0.15 * i})`;
      ctx.beginPath(); ctx.arc(sx, sy, 3 + i, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = "#4a2a1a"; ctx.strokeStyle = "#1a0a05"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy, 7, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  } else if (pr.kind === "molotov") {
    // 火焰瓶：旋转的绿瓶 + 尾焰
    for (let i = 4; i >= 1; i--) {
      const tt = Math.max(0, t - i * 0.05);
      const xt = pr.x_from + (pr.x_to - pr.x_from) * tt;
      const yt = pr.y_from + (pr.y_to - pr.y_from) * tt - Math.sin(tt * Math.PI) * arcH;
      const { cx: sx, cy: sy } = toCanvas(xt, yt, 0);
      const a = 0.14 * i;
      ctx.fillStyle = i > 2 ? `rgba(255,120,30,${a})` : `rgba(255,220,80,${a * 1.2})`;
      ctx.beginPath(); ctx.arc(sx, sy, 3 + i * 0.8, 0, Math.PI * 2); ctx.fill();
    }
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(t * Math.PI * 3);
    ctx.fillStyle = "#3d6b2a"; ctx.strokeStyle = "#12200c"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.ellipse(0, 0, 4, 6, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    // 瓶口火苗
    ctx.fillStyle = "rgba(255,220,80,0.95)";
    ctx.beginPath(); ctx.arc(0, -6, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "rgba(255,120,20,0.7)";
    ctx.beginPath(); ctx.arc(0, -8, 1.8, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  } else if (pr.kind === "bullet") {
    // 子弹曳光
    const alpha = Math.max(0, 1 - t * 0.6);
    const p0 = toCanvas(pr.x_from, pr.y_from, 0);
    ctx.strokeStyle = `rgba(255,240,120,${alpha})`;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(p0.cx, p0.cy); ctx.lineTo(cx, cy); ctx.stroke();
    // 弹头
    ctx.fillStyle = `rgba(255,255,180,${alpha})`;
    ctx.beginPath(); ctx.arc(cx, cy, 2, 0, Math.PI * 2); ctx.fill();
  } else if (pr.kind === "barrage_zombie") {
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
  drawBackground(ctx, snap);

  // 玩家建造的建筑（深度：背景之前、基地/单位之后）
  drawPlayerBuildings(ctx, snap);

  // 尸体
  snap.corpses.forEach(c => drawCorpse(ctx, c, tShow));

  // 基地（后排先，前排后）
  drawBases(ctx, snap);

  // 单位按 y 排序（近处盖过远处）
  const orderedUnits = [...snap.units].sort((a, b) => (a.y + (a.row || 0) * 100) - (b.y + (b.row || 0) * 100));
  orderedUnits.forEach(u => drawUnit(ctx, u, tShow));

  // 投射物
  snap.projectiles.forEach(pr => drawProjectile(ctx, pr));

  // 全屏效果（大招 / 爆炸 / 火团 / 火花）
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
