/* render.js — Canvas 2D 卡通渲染
   -----------------------------------------------------------------
   风格：粗黑描边 + 高饱和度块状色，尽量接近 Trailer Park Zombies 的
        美式草根卡通感。所有兵种/建筑都是纯 Canvas 2D 绘制的，没有位图。
   -----------------------------------------------------------------
*/

const R = {
  CANVAS_W: 1280, CANVAS_H: 560,
  GROUND_Y: 420,          // 战线底部（视觉水平线）
  ROW_OFFSET: [0, -60],   // row 0 前排（y=0），row 1 后排（y=-60，视觉小&上移）
};

// x/y from sim → 画布坐标
function toCanvas(x, y, row) {
  const cx = x * (R.CANVAS_W / Sim.LANE_LEN);
  const rowY = R.ROW_OFFSET[row] || 0;
  const cy = R.GROUND_Y + rowY + (y || 0);
  return { cx, cy };
}
function scaleForRow(row) { return row === 1 ? 0.75 : 1.0; }

// ==================================================================
// 基础绘制辅助
// ==================================================================
function strokeShape(ctx, fn, fill, stroke = "#1a120b", lw = 2.5) {
  ctx.lineJoin = "round"; ctx.lineCap = "round";
  ctx.lineWidth = lw; ctx.strokeStyle = stroke;
  ctx.beginPath(); fn(ctx);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  ctx.stroke();
}
function circle(ctx, x, y, r) { ctx.moveTo(x+r,y); ctx.arc(x,y,r,0,Math.PI*2); }
function roundRect(ctx, x, y, w, h, r) {
  ctx.moveTo(x+r, y);
  ctx.lineTo(x+w-r, y);
  ctx.quadraticCurveTo(x+w, y, x+w, y+r);
  ctx.lineTo(x+w, y+h-r);
  ctx.quadraticCurveTo(x+w, y+h, x+w-r, y+h);
  ctx.lineTo(x+r, y+h);
  ctx.quadraticCurveTo(x, y+h, x, y+h-r);
  ctx.lineTo(x, y+r);
  ctx.quadraticCurveTo(x, y, x+r, y);
  ctx.closePath();
}

// ==================================================================
// 背景 & 场景装饰（按玩家文明混搭）
// ==================================================================
function drawBackground(ctx, snap, tShow) {
  // 天空 gradient
  const grad = ctx.createLinearGradient(0, 0, 0, R.CANVAS_H);
  grad.addColorStop(0, "#f8e6b4");
  grad.addColorStop(0.55, "#dc9848");
  grad.addColorStop(0.9, "#7a4a1a");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, R.CANVAS_W, R.CANVAS_H);

  // 远山
  ctx.fillStyle = "#654226";
  for (let i = 0; i < 6; i++) {
    const x = (i * 220 + (tShow * 4) % 220) - 100;
    ctx.beginPath();
    ctx.moveTo(x, R.CANVAS_H * 0.55);
    ctx.lineTo(x + 130, R.CANVAS_H * 0.35);
    ctx.lineTo(x + 260, R.CANVAS_H * 0.55);
    ctx.closePath(); ctx.fill();
  }

  // 香港侧场景：金融/贫民/差馆（根据 HK 玩家的 civId）
  const hkPlayers = snap.players.filter(p => p.team === "hk");
  const zomPlayers = snap.players.filter(p => p.team === "zom");

  hkPlayers.forEach((p, idx) => drawHKScenery(ctx, p.civId, 0, 380, idx === 1 ? 0.6 : 1.0));
  zomPlayers.forEach((p, idx) => drawZomScenery(ctx, p.civId, R.CANVAS_W - 260, 260, idx === 1 ? 0.6 : 1.0));

  // 地面 (公路)
  const roadGrad = ctx.createLinearGradient(0, R.GROUND_Y - 20, 0, R.CANVAS_H);
  roadGrad.addColorStop(0, "#7a5820");
  roadGrad.addColorStop(1, "#3a2410");
  ctx.fillStyle = roadGrad;
  ctx.fillRect(0, R.GROUND_Y, R.CANVAS_W, R.CANVAS_H - R.GROUND_Y);
  // 中线
  ctx.strokeStyle = "#e7c15c"; ctx.lineWidth = 3;
  ctx.setLineDash([20, 16]);
  ctx.beginPath(); ctx.moveTo(0, R.GROUND_Y + 60); ctx.lineTo(R.CANVAS_W, R.GROUND_Y + 60); ctx.stroke();
  ctx.setLineDash([]);
  // 排水沟
  ctx.strokeStyle = "#2a1a10"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, R.GROUND_Y); ctx.lineTo(R.CANVAS_W, R.GROUND_Y); ctx.stroke();
}

function drawHKScenery(ctx, civId, x, y, s) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  if (civId === "hk_finance") {
    // 摩天大楼群
    for (let i = 0; i < 3; i++) {
      const bx = i * 90, bh = 200 + i * 20;
      ctx.fillStyle = i % 2 ? "#5c7fa8" : "#3e6088";
      ctx.strokeStyle = "#1a120b"; ctx.lineWidth = 3;
      ctx.fillRect(bx, -bh, 70, bh);
      ctx.strokeRect(bx, -bh, 70, bh);
      // 窗
      ctx.fillStyle = "#ffdc66";
      for (let wy = 5; wy < bh - 8; wy += 20)
        for (let wx = 6; wx < 65; wx += 14)
          if (((wx + wy) * 13) % 7 > 2) ctx.fillRect(bx + wx, -bh + wy, 6, 8);
    }
  } else if (civId === "hk_slum") {
    // 劏房乱堆
    ctx.fillStyle = "#8b5e2a"; ctx.strokeStyle = "#1a120b"; ctx.lineWidth = 3;
    for (let i = 0; i < 4; i++) {
      const bx = i * 60, bh = 90 + (i * 137) % 40;
      ctx.fillRect(bx, -bh, 55, bh); ctx.strokeRect(bx, -bh, 55, bh);
      // 窗户小方框
      ctx.fillStyle = "#3d2510";
      for (let wy = 4; wy < bh - 6; wy += 16) ctx.fillRect(bx + 8, -bh + wy, 8, 6);
      ctx.fillStyle = "#8b5e2a";
    }
    // 空调外机堆
    ctx.fillStyle = "#b8b8b8"; ctx.strokeRect(20, -20, 12, 10); ctx.fillRect(20, -20, 12, 10);
  } else if (civId === "hk_police") {
    // 差馆：一栋绿色石屎楼 + 红蓝警灯
    ctx.fillStyle = "#3d6b4a"; ctx.strokeStyle = "#1a120b"; ctx.lineWidth = 3;
    ctx.fillRect(0, -160, 220, 160); ctx.strokeRect(0, -160, 220, 160);
    ctx.fillStyle = "#e0d090";
    ctx.fillRect(80, -50, 60, 50); ctx.strokeRect(80, -50, 60, 50);   // 门
    // 警灯
    ctx.fillStyle = "#f22"; ctx.beginPath(); ctx.arc(60, -170, 8, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = "#22f"; ctx.beginPath(); ctx.arc(160, -170, 8, 0, Math.PI*2); ctx.fill();
  }
  ctx.restore();
}
function drawZomScenery(ctx, civId, x, y, s) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  if (civId === "zom_classic") {
    // 废墟大厦
    ctx.fillStyle = "#4a2a1a"; ctx.strokeStyle = "#1a120b"; ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, 0); ctx.lineTo(0, -180); ctx.lineTo(80, -220); ctx.lineTo(180, -160);
    ctx.lineTo(240, -190); ctx.lineTo(240, 0); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#7d2020";
    ctx.fillRect(20, -60, 30, 50); ctx.fillRect(80, -100, 30, 50); ctx.fillRect(160, -60, 30, 50);
  } else if (civId === "zom_ghost") {
    // 破庙
    ctx.fillStyle = "#3a1a3a"; ctx.strokeStyle = "#1a120b"; ctx.lineWidth = 3;
    ctx.fillRect(20, -140, 200, 140); ctx.strokeRect(20, -140, 200, 140);
    ctx.beginPath(); ctx.moveTo(10, -140); ctx.lineTo(120, -200); ctx.lineTo(230, -140); ctx.closePath();
    ctx.fillStyle = "#661144"; ctx.fill(); ctx.stroke();
    // 灯笼
    ctx.fillStyle = "#f66"; ctx.beginPath(); ctx.arc(60, -100, 12, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(180, -100, 12, 0, Math.PI*2); ctx.fill();
  } else if (civId === "zom_bio") {
    // 实验室（试管 + 圆罐）
    ctx.fillStyle = "#2a3a2a"; ctx.strokeStyle = "#1a120b"; ctx.lineWidth = 3;
    ctx.fillRect(0, -140, 240, 140); ctx.strokeRect(0, -140, 240, 140);
    // 大圆罐
    ctx.fillStyle = "#66ff88";
    ctx.beginPath(); ctx.arc(60, -80, 30, 0, Math.PI*2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(180, -80, 30, 0, Math.PI*2); ctx.fill(); ctx.stroke();
  }
  ctx.restore();
}

// ==================================================================
// 基地（左右两个大建筑）
// ==================================================================
function drawBases(ctx, snap) {
  // 香港基地：由 HK 玩家的 civ 视觉组合
  const hkP = snap.players.filter(p => p.team === "hk");
  const zomP = snap.players.filter(p => p.team === "zom");

  // HK base（左）
  const hk = hkP[0] || { civId: "hk_finance" };
  const { cx: hkX } = toCanvas(Sim.HQ_HK_X, 0, 0);
  drawBase(ctx, hkX, R.GROUND_Y - 5, hk.civId, "hk", snap.hp.hk / snap.hpMax.hk);

  // ZOM base（右）
  const zom = zomP[0] || { civId: "zom_classic" };
  const { cx: zomX } = toCanvas(Sim.HQ_ZOM_X, 0, 0);
  drawBase(ctx, zomX, R.GROUND_Y - 5, zom.civId, "zom", snap.hp.zom / snap.hpMax.zom);
}

function drawBase(ctx, x, groundY, civId, team, hpRatio) {
  ctx.save(); ctx.translate(x, groundY);
  const shake = hpRatio < 0.3 ? (Math.random() - 0.5) * 4 : 0;
  ctx.translate(shake, 0);
  const civ = CIVS[civId];
  const c = civ.color, ac = civ.accent;

  // 主体
  ctx.strokeStyle = "#1a120b"; ctx.lineWidth = 4;
  ctx.fillStyle = c;
  const w = 130, h = 200;
  ctx.beginPath();
  ctx.moveTo(-w/2, 0);
  ctx.lineTo(-w/2, -h);
  ctx.lineTo(-w/2 + 20, -h - 30);
  ctx.lineTo(w/2 - 20, -h - 30);
  ctx.lineTo(w/2, -h);
  ctx.lineTo(w/2, 0);
  ctx.closePath();
  ctx.fill(); ctx.stroke();

  // 门
  ctx.fillStyle = "#3d2510";
  strokeShape(ctx, c => { roundRect(c, -22, -70, 44, 70, 8); }, "#3d2510");

  // 招牌
  ctx.fillStyle = ac;
  strokeShape(ctx, c => { roundRect(c, -50, -h - 25, 100, 22, 4); }, ac);
  ctx.fillStyle = "#1a120b";
  ctx.font = "bold 14px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(civ.name.slice(0, 5), 0, -h - 8);

  // HP 数字
  ctx.fillStyle = hpRatio < 0.3 ? "#ff5555" : "#ffdd66";
  ctx.font = "bold 13px monospace";
  ctx.fillText(`HP ${Math.max(0, Math.round(hpRatio * 100))}%`, 0, -h - 40);

  // 若血很低 冒烟
  if (hpRatio < 0.4) {
    ctx.fillStyle = "rgba(50,50,50,0.6)";
    for (let i = 0; i < 3; i++) {
      const puffX = (Math.random() - 0.5) * 60;
      const puffY = -h - 30 - Math.random() * 40;
      ctx.beginPath(); ctx.arc(puffX, puffY, 8 + Math.random() * 6, 0, Math.PI * 2); ctx.fill();
    }
  }

  ctx.restore();
}

// ==================================================================
// 单位（按 arch 分派）
// ==================================================================
// 主入口
function drawUnit(ctx, u, tShow) {
  const { cx, cy } = toCanvas(u.x, 0, u.row || 0);
  const s = scaleForRow(u.row || 0);
  const dir = u.dir;
  ctx.save();
  ctx.translate(cx, cy);
  // 跳跃期的抛物线高度
  let jumpH = 0;
  if (u.jumpUntil && u.jumpUntil > tShow) {
    const p = (tShow - u.jumpStart) / u.jumpDur;
    jumpH = -Math.sin(Math.max(0, Math.min(1, p)) * Math.PI) * 50;
  }
  ctx.translate(0, jumpH);
  ctx.scale(dir * s, s);
  // 阴影
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath();
  ctx.ellipse(0, 2 - jumpH * 0.3, 14, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  // 主体
  const civ = CIVS[u.civId];
  const arch = u.def.arch;
  const tint = civ.accent;
  drawBody(ctx, arch, tint, u, tShow);
  ctx.restore();

  // HP 条（在头顶）
  if (u.hp < u.hpMax) {
    const barW = 32; const hpP = u.hp / u.hpMax;
    ctx.fillStyle = "#000"; ctx.fillRect(cx - barW/2 - 1, cy - 60 + jumpH - 1, barW + 2, 4);
    ctx.fillStyle = hpP > 0.5 ? "#5cd66d" : hpP > 0.25 ? "#f6a13d" : "#c93c3c";
    ctx.fillRect(cx - barW/2, cy - 60 + jumpH, barW * hpP, 2);
  }
  // 被转化标记
  if (u.charmedBy) {
    ctx.fillStyle = "#ff6ee0"; ctx.font = "16px sans-serif";
    ctx.textAlign = "center"; ctx.fillText("💜", cx, cy - 66 + jumpH);
  }
}

// 兵种"外观" — 全部程序化绘制
function drawBody(ctx, arch, tint, u, tShow) {
  // 简单动画：走路时身体上下 sin 抖 2px
  const walk = Math.sin(tShow * 8 + u.id) * 1.5;

  // 通用参数
  const skinHK = "#f4c8a8", skinZom = "#8fbc7a";
  const clothHK = "#4a70a8", clothZom = "#5a3a3a";
  const isZom = u.team === "zom" && u.def.arch.startsWith("zom");
  const isCharmed = !!u.charmedBy;
  const skin = isZom ? skinZom : skinHK;
  const cloth = tint || (isZom ? clothZom : clothHK);

  switch (arch) {
    case "peasant": {
      // 铲兵体型：小圆头、瘦身、拿工具
      drawFigure(ctx, skin, cloth, walk);
      drawWeapon(ctx, u.def.arch, u.def.tag, u.def.range);
      // 帽子
      ctx.fillStyle = "#c94a1a"; strokeShape(ctx, c => c.rect(-6, -30 + walk, 12, 4), "#c94a1a");
      break;
    }
    case "tank": {
      drawFigure(ctx, skin, cloth, walk, 1.25);
      drawWeapon(ctx, u.def.arch, u.def.tag, u.def.range);
      // 头盔
      ctx.fillStyle = "#666"; strokeShape(ctx, c => { c.arc(0, -28 + walk, 8, Math.PI, 0); c.closePath(); }, "#666");
      break;
    }
    case "runner": {
      drawFigure(ctx, skin, cloth, walk, 0.85);
      drawWeapon(ctx, u.def.arch, u.def.tag);
      // 头巾
      ctx.fillStyle = "#d02020"; strokeShape(ctx, c => c.rect(-7, -32 + walk, 14, 3), "#d02020");
      break;
    }
    case "bomber": {
      drawFigure(ctx, skin, cloth, walk);
      // 手举酒瓶
      ctx.fillStyle = "#7a4a1a"; strokeShape(ctx, c => c.rect(8, -20 + walk, 5, 12), "#7a4a1a");
      ctx.fillStyle = "#ffb84a"; strokeShape(ctx, c => c.rect(9, -18 + walk, 3, 6), "#ffb84a");
      break;
    }
    case "heavy": {
      // 大体积 + 机枪
      drawFigure(ctx, skin, cloth, walk, 1.3, 1.3);
      // 机枪长条
      ctx.fillStyle = "#333"; strokeShape(ctx, c => c.rect(6, -18 + walk, 22, 4), "#333");
      ctx.fillStyle = "#666"; strokeShape(ctx, c => c.rect(28, -18 + walk, 5, 4), "#666");
      break;
    }
    case "caster": {
      drawFigure(ctx, skin, cloth, walk);
      // 长袍 + 光环
      ctx.strokeStyle = "#ffde66"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, -28 + walk, 15, 0, Math.PI * 2); ctx.stroke();
      // 手拿护身符
      ctx.fillStyle = "#ffde66"; strokeShape(ctx, c => c.arc(10, -14 + walk, 4, 0, Math.PI*2), "#ffde66");
      break;
    }
    case "zom_normal": {
      drawZombieFigure(ctx, skin, cloth, walk);
      break;
    }
    case "zom_hop": {
      // 清朝服 + 手前伸
      drawZombieFigure(ctx, "#a4b48a", "#2a2a5a", walk);
      // 官帽
      ctx.fillStyle = "#000"; strokeShape(ctx, c => c.rect(-8, -32 + walk, 16, 3), "#000");
      ctx.fillStyle = "#ffb84a"; strokeShape(ctx, c => c.rect(-3, -35 + walk, 6, 3), "#ffb84a");
      // 双臂前伸
      ctx.strokeStyle = "#1a120b"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, -20 + walk); ctx.lineTo(10, -18 + walk); ctx.stroke();
      break;
    }
    case "zom_lady": {
      drawZombieFigure(ctx, "#c4d4a4", "#8a2a4a", walk, 0.95);
      // 长发
      ctx.fillStyle = "#1a0a0a";
      strokeShape(ctx, c => { c.rect(-9, -28 + walk, 18, 18); }, "#1a0a0a");
      break;
    }
    case "zom_giant": {
      drawZombieFigure(ctx, "#7a9a5a", "#4a2a2a", walk, 1.4, 1.5);
      break;
    }
    case "zom_cata": {
      // 投石车：底座 + 大石头 + 一只小僵尸推
      ctx.fillStyle = "#4a2a1a"; strokeShape(ctx, c => c.rect(-16, -12 + walk, 32, 12), "#4a2a1a");
      // 轮子
      ctx.fillStyle = "#222"; strokeShape(ctx, c => c.arc(-10, 2 + walk, 5, 0, Math.PI*2), "#222");
      strokeShape(ctx, c => c.arc(10, 2 + walk, 5, 0, Math.PI*2), "#222");
      // 抛杆
      ctx.strokeStyle = "#1a120b"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(-8, -12 + walk); ctx.lineTo(-18, -32 + walk); ctx.stroke();
      // 装载僵尸块
      ctx.fillStyle = "#7a9a5a"; strokeShape(ctx, c => c.arc(-18, -34 + walk, 6, 0, Math.PI*2), "#7a9a5a");
      break;
    }
    case "zom_toxic": {
      drawZombieFigure(ctx, "#7ac48a", "#2a4a2a", walk);
      // 冒绿泡
      ctx.fillStyle = "rgba(120, 220, 120, 0.6)";
      const bubbleT = tShow * 3 + u.id;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath(); ctx.arc((i - 1) * 6, -30 + walk - (bubbleT % 1) * 8, 3, 0, Math.PI * 2); ctx.fill();
      }
      break;
    }
    case "zom_ghost": {
      // 鬼 = 半透明
      ctx.globalAlpha = 0.6;
      drawZombieFigure(ctx, "#ddeeff", "#557799", walk);
      ctx.globalAlpha = 1;
      break;
    }
    default: {
      drawFigure(ctx, skin, cloth, walk);
    }
  }
}

// 通用"人形"（用于所有人类兵种）
function drawFigure(ctx, skin, cloth, walk, wMul = 1, hMul = 1) {
  // 腿
  const legOff = Math.sin(walk * 0.4) * 3;
  ctx.strokeStyle = "#1a120b"; ctx.lineWidth = 2.5;
  ctx.fillStyle = "#2a1a10";
  ctx.beginPath(); ctx.moveTo(-4 * wMul, 0); ctx.lineTo(-4 * wMul + legOff, 12); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(4 * wMul, 0); ctx.lineTo(4 * wMul - legOff, 12); ctx.stroke();
  // 身体
  strokeShape(ctx, c => {
    roundRect(c, -8 * wMul, -22 * hMul + walk, 16 * wMul, 22 * hMul, 4);
  }, cloth);
  // 手
  ctx.strokeStyle = "#1a120b"; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(-8 * wMul, -18 + walk); ctx.lineTo(-10 * wMul, -10 + walk); ctx.stroke();
  // 头
  strokeShape(ctx, c => { c.arc(0, -28 * hMul + walk, 7 * wMul, 0, Math.PI * 2); }, skin);
  // 眼
  ctx.fillStyle = "#000";
  ctx.fillRect(-3, -29 + walk, 1.5, 2);
  ctx.fillRect(1.5, -29 + walk, 1.5, 2);
}
function drawZombieFigure(ctx, skin, cloth, walk, wMul = 1, hMul = 1) {
  drawFigure(ctx, skin, cloth, walk, wMul, hMul);
  // 咬痕/破布 简单化：多加两条竖破痕
  ctx.strokeStyle = "#3a1a10"; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(-4, -15 + walk); ctx.lineTo(-5, -8 + walk); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(3, -18 + walk); ctx.lineTo(4, -10 + walk); ctx.stroke();
  // 血眼
  ctx.fillStyle = "#c00";
  ctx.fillRect(-3, -29 * hMul + walk, 1.5, 2);
  ctx.fillRect(1.5, -29 * hMul + walk, 1.5, 2);
}

// 手上武器
function drawWeapon(ctx, arch, tag, range) {
  if (tag === "melee") {
    // 铲子/棍
    ctx.strokeStyle = "#333"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(6, -18); ctx.lineTo(18, -22); ctx.stroke();
    ctx.fillStyle = "#8a8a8a";
    strokeShape(ctx, c => c.rect(16, -25, 6, 5), "#8a8a8a");
  } else if (tag === "ranged") {
    // 步枪/机枪
    ctx.fillStyle = "#333";
    strokeShape(ctx, c => c.rect(6, -18, 16 + (range||0) / 40, 3), "#333");
  } else if (tag === "aoe") {
    // 酒瓶
    ctx.fillStyle = "#a4761a";
    strokeShape(ctx, c => c.rect(8, -20, 4, 8), "#a4761a");
  }
}

// ==================================================================
// 效果 / 投射物
// ==================================================================
function drawEffect(ctx, e, tShow) {
  ctx.save();
  switch (e.kind) {
    case "harvester": {
      // 红 van
      const { cx, cy } = toCanvas(e.x, 0, 0);
      ctx.translate(cx, cy);
      ctx.scale(e.dir, 1);
      const w = 80, h = 44;
      strokeShape(ctx, c => roundRect(c, -w/2, -h, w, h, 8), "#c8231a");
      // 顶
      strokeShape(ctx, c => roundRect(c, -w/2 + 8, -h - 18, w - 16, 18, 6), "#e8a03a");
      // 车窗
      ctx.fillStyle = "#66ccff"; ctx.fillRect(-8, -h + 4, 24, 12); ctx.strokeRect(-8, -h + 4, 24, 12);
      // 轮子
      ctx.fillStyle = "#000";
      ctx.beginPath(); ctx.arc(-20, 0, 8, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(20, 0, 8, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case "airstrike": {
      // 半透明黑影 + 爆炸圆
      const alpha = Math.max(0, e.life);
      ctx.fillStyle = `rgba(0,0,0,${alpha * 0.4})`;
      ctx.fillRect(0, 0, R.CANVAS_W, R.CANVAS_H);
      // 一堆爆炸
      const rng = Sim.makeRng(e.id * 137);
      for (let i = 0; i < 10; i++) {
        const rx = 100 + rng() * (R.CANVAS_W - 200);
        const ry = R.GROUND_Y - rng() * 100;
        const r = 20 + rng() * 30;
        ctx.fillStyle = "rgba(255,150,40,0.8)";
        ctx.beginPath(); ctx.arc(rx, ry, r * alpha, 0, Math.PI * 2); ctx.fill();
      }
      break;
    }
    case "poison_puddle": {
      const { cx, cy } = toCanvas(e.x, 0, 0);
      ctx.fillStyle = "rgba(80,180,80,0.5)";
      ctx.beginPath();
      ctx.ellipse(cx, cy + 2, e.r * 1.4, 8, 0, 0, Math.PI * 2);
      ctx.fill();
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
      // 血月 sky tint
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
  // 抛物线
  const arc = -Math.sin(t * Math.PI) * 80;
  const { cx, cy } = toCanvas(x, y + arc, 0);
  if (pr.kind === "lob") {
    ctx.fillStyle = "#4a2a1a";
    ctx.beginPath(); ctx.arc(cx, cy, 6, 0, Math.PI * 2); ctx.fill();
  } else if (pr.kind === "barrage_zombie") {
    // 一个转圈的小僵尸
    ctx.fillStyle = "#7a9a5a";
    ctx.beginPath(); ctx.arc(cx, cy, 8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#000";
    ctx.font = "10px monospace"; ctx.textAlign = "center"; ctx.fillText("尸", cx, cy + 3);
  }
}

// ==================================================================
// 尸体
// ==================================================================
function drawCorpse(ctx, c, tShow) {
  const { cx, cy } = toCanvas(c.x, 0, 0);
  ctx.save(); ctx.translate(cx, cy);
  const fade = Math.max(0, (c.until - tShow));
  ctx.globalAlpha = Math.min(1, fade);
  ctx.fillStyle = c.team === "hk" ? "#8a4020" : "#4a5a2a";
  ctx.beginPath();
  ctx.ellipse(0, 0, 14, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  // 血迹
  ctx.fillStyle = c.team === "hk" ? "rgba(200,40,40,0.6)" : "rgba(90,160,60,0.5)";
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
// 主渲染入口
// ==================================================================
function render(ctx, snap, tShow, meSeat) {
  drawBackground(ctx, snap, tShow);
  drawBases(ctx, snap);

  // 尸体（先绘制，被单位盖住）
  snap.corpses.forEach(c => drawCorpse(ctx, c, tShow));

  // 单位按 x 排序，让近处的盖过远处
  const orderedUnits = [...snap.units].sort((a, b) => (a.y + (a.row||0)*100) - (b.y + (b.row||0)*100));
  orderedUnits.forEach(u => drawUnit(ctx, u, tShow));

  snap.projectiles.forEach(pr => drawProjectile(ctx, pr));
  snap.effects.forEach(e => drawEffect(ctx, e, tShow));

  // 座位标识：如果 meSeat 有效，在自己的兵头顶画一个金圈
  if (meSeat != null) {
    snap.units.forEach(u => {
      if (u.seat === meSeat) {
        const { cx, cy } = toCanvas(u.x, 0, u.row || 0);
        ctx.strokeStyle = "#ffde66"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(cx, cy - 40, 12, 0, Math.PI * 2); ctx.stroke();
      }
    });
  }
}

window.Render = { R, render, toCanvas };
