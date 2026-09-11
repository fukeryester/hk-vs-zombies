/* sim.js — 香港大战僵尸的核心 RTS 仿真
   -----------------------------------------------------------------
   设计要点：
   - 30Hz 固定步进（DT_MS = 33.333）
   - 单条中路（1D 坐标 x：0=香港基地，LANE=僵尸基地）
   - Y 只作视觉分层（不影响战斗逻辑）
   - 所有随机数走 seed 化 PRNG（联机可用）
   - 状态是一个纯 JS 对象树，方便 JSON 广播 & 客户端重建
   -----------------------------------------------------------------
*/

const LANE_LEN = 1200;          // 战线长度（游戏单位；渲染时按画布缩放）
const HQ_HK_X = 60;             // 香港基地 x
const HQ_ZOM_X = LANE_LEN - 60; // 僵尸基地 x
const DT_MS = 1000 / 30;        // 30Hz
const DT = DT_MS / 1000;

// 简单可复现的 PRNG（Mulberry32）
function makeRng(seed) {
  let s = seed >>> 0;
  return function () {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ===============================================================
// 初始化状态
// ===============================================================
/** players: [{seat, team:"hk"|"zom", isAI, civId, name}] （长度=座位数） */
function createInitialState(config) {
  const seed = config.seed ?? Math.floor(Math.random() * 0xffffffff);
  const state = {
    tick: 0,
    time: 0,
    seed,
    over: false,
    winner: null,             // "hk" | "zom"
    over_time: 0,             // 结束时的 time
    players: [],              // 见下（含 baseHp / baseHpMax / baseX）
    units: [],                // 战场单位
    effects: [],              // 视觉效果 & 大招驻留
    projectiles: [],          // 投石/子弹（简化）
    nextUnitId: 1,
    nextEffectId: 1,
    nextProjectileId: 1,
    corpses: [],              // 尸体（渲染用，仿真里只保留 2s）
  };

  // 初始化玩家（每人一座基地）
  config.players.forEach((p, i) => {
    const civ = CIVS[p.civId];
    if (!civ) { console.warn("unknown civ", p.civId); return; }
    const row = p.row || 0;
    const isHK = p.team === "hk";
    // 每玩家一座基地：row=0 靠中路（前排），row=1 更靠边（后排，视觉更小）
    const baseX = isHK
      ? (HQ_HK_X + (row === 0 ? 25 : -25))
      : (HQ_ZOM_X + (row === 0 ? -25 : 25));
    const hqDef = civ.buildings[B.HQ] || { hp: 1000 };
    const baseHp = hqDef.hp || 1000;
    state.players.push({
      seat: i,                  // 全局座位 (0..N-1)
      team: p.team,
      isAI: !!p.isAI,
      civId: p.civId,
      name: p.name || (p.isAI ? "AI" : "Player " + (i+1)),
      row,                      // 0=前, 1=后
      baseX,
      baseHp, baseHpMax: baseHp,
      gold: 300,
      income: civ.baseIncome,
      pop: 0,
      popCap: civ.baseCap,
      energy: 0,
      built: { [B.HQ]: 1 },     // 已建建筑及数量
      queue: [],                // 出兵队列 [{unitId, ready: absTime}]
      cd: {},                   // 建筑/兵种冷却结束时间
      last_ai_think: 0,         // AI 思考节拍
      kills: 0, killsGold: 0, unitsBuilt: 0, buildingsBuilt: 0,
      spent: 0, earned: 300,
      alive: true,
    });
  });

  return state;
}

// ---- 多基地辅助 ----
function teamAlive(state, team) {
  return state.players.some(p => p.team === team && p.baseHp > 0);
}
function nearestBase(state, team, x) {
  let best = null, bd = Infinity;
  for (const p of state.players) {
    if (p.team !== team) continue;
    if (p.baseHp <= 0) continue;
    const d = Math.abs(p.baseX - x);
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}
// 队伍总血/总血上限（HUD/兼容用）
function teamHpSum(state, team) {
  let hp = 0, hpMax = 0;
  for (const p of state.players) {
    if (p.team !== team) continue;
    hp += Math.max(0, p.baseHp);
    hpMax += p.baseHpMax;
  }
  return { hp, hpMax: hpMax || 1 };
}

// ===============================================================
// 玩家动作接口（供 UI / AI / 网络转发）
// ===============================================================
// action 结构约定（全部纯数据）：
//   { op:"build",   seat, kind:"income|pop|tech_a|tech_b|tech_c" }
//   { op:"spawn",   seat, unit:"intern" }
//   { op:"skill",   seat, skill:"angry_mob" }
function applyAction(state, act) {
  if (state.over) return { ok:false, err:"over" };
  const p = state.players[act.seat];
  if (!p) return { ok:false, err:"no seat" };
  const civ = CIVS[p.civId];

  switch (act.op) {
    case "build": return doBuild(state, p, civ, act.kind);
    case "spawn": return doSpawn(state, p, civ, act.unit);
    case "skill": return doSkill(state, p, civ, act.skill);
    default: return { ok:false, err:"unknown op" };
  }
}

function doBuild(state, p, civ, kind) {
  const def = civ.buildings[kind];
  if (!def) return { ok:false, err:"no such building" };
  const cur = p.built[kind] || 0;
  if (cur >= def.cap) return { ok:false, err:"cap" };
  if (p.gold < def.cost) return { ok:false, err:"gold" };
  // 检查建造 CD（0.6s 防连点）
  const cdKey = "build_" + kind;
  if ((p.cd[cdKey] || 0) > state.time) return { ok:false, err:"cd" };

  p.gold -= def.cost;
  p.spent += def.cost;
  p.built[kind] = cur + 1;
  p.buildingsBuilt++;
  const eff = def.effect || {};
  if (eff.income) p.income += eff.income;
  if (eff.pop) p.popCap += eff.pop;
  p.cd[cdKey] = state.time + 0.6;

  emitEvent(state, "build", { seat: p.seat, kind });
  return { ok:true };
}

function doSpawn(state, p, civ, unitId) {
  const u = civ.units[unitId];
  if (!u) return { ok:false, err:"no such unit" };
  if (u.prereq && !p.built[u.prereq]) return { ok:false, err:"prereq" };
  if (p.gold < u.cost) return { ok:false, err:"gold" };
  if (p.pop + u.pop > p.popCap) return { ok:false, err:"pop" };
  const cdKey = "spawn_" + unitId;
  if ((p.cd[cdKey] || 0) > state.time) return { ok:false, err:"cd" };

  p.gold -= u.cost;
  p.spent += u.cost;
  p.pop += u.pop;
  p.cd[cdKey] = state.time + Math.max(0.1, u.buildTime);
  // 加入队列，buildTime 之后正式出场
  p.queue.push({ unitId, ready: state.time + u.buildTime });
  return { ok:true };
}

function doSkill(state, p, civ, skillId) {
  if (!civ.skills.includes(skillId)) return { ok:false, err:"not owned" };
  const s = SKILLS[skillId];
  if (!s) return { ok:false, err:"no skill" };
  if (p.energy < s.cost) return { ok:false, err:"energy" };

  p.energy -= s.cost;
  applySkill(state, p, s);
  emitEvent(state, "skill", { seat: p.seat, skill: skillId });
  return { ok:true };
}

function applySkill(state, p, s) {
  const isHK = p.team === "hk";
  const spawnX = isHK ? HQ_HK_X + 20 : HQ_ZOM_X - 20;
  const dir = isHK ? +1 : -1;

  switch (s.kind) {
    case "summon": {
      s.units.forEach(([arch, n]) => {
        // 找一个模板：从 p 的兵里挑该 arch 的最基础兵；兜底就用 p 第一个兵
        const civ = CIVS[p.civId];
        let template = null;
        for (const [uid, u] of Object.entries(civ.units)) {
          if (u.arch === arch) { template = { id: uid, def: u }; break; }
        }
        if (!template) {
          const uid = Object.keys(civ.units)[0];
          template = { id: uid, def: civ.units[uid] };
        }
        for (let i = 0; i < n; i++) {
          spawnUnit(state, p, template.id, {
            x: spawnX + (dir * i * 10),
            y: p.row * 60,
            speedMul: s.speedMul || 1,
            free: true,          // 不占人口
          });
        }
      });
      break;
    }
    case "harvester": {
      // 建立一个持续实体，从起点直冲对方基地，路径上单位受伤
      state.effects.push({
        id: state.nextEffectId++,
        kind: "harvester",
        team: p.team,
        x: spawnX, dir, dmg: s.dmg, hp: s.hp, speed: s.speed,
        w: 60, seat: p.seat,
      });
      break;
    }
    case "airstrike": {
      // 直接对全部敌军 -HP，加视觉
      const enemyTeam = p.team === "hk" ? "zom" : "hk";
      state.units.forEach(u => {
        if (u.team === enemyTeam) u.hp -= 9999;
      });
      state.effects.push({
        id: state.nextEffectId++,
        kind: "airstrike", team: p.team, life: 1.5, seat: p.seat,
      });
      break;
    }
    case "barrage": {
      // 从对方阵地上空落下 count 个 unit
      const civ = CIVS[p.civId];
      const template = civ.units[s.unit] || civ.units[Object.keys(civ.units)[0]];
      const uid = Object.keys(civ.units).find(k => civ.units[k] === template) || Object.keys(civ.units)[0];
      const rng = makeRng(state.seed + state.tick + p.seat * 7);
      for (let i = 0; i < s.count; i++) {
        const x = HQ_HK_X + 200 + rng() * (LANE_LEN - 400);
        state.projectiles.push({
          id: state.nextProjectileId++,
          kind: "barrage_zombie",
          team: p.team,
          x_from: x, y_from: -180,
          x_to: x, y_to: p.row * 60,
          t: 0, dur: 1.4,
          unitId: uid, seat: p.seat,
        });
      }
      break;
    }
    case "buff_econ": {
      p.gold += s.cash;
      p.earned += s.cash;
      p.popCap += s.popBonus;
      // 60s 后回退
      state.effects.push({
        id: state.nextEffectId++, kind:"buff_econ_expire", seat: p.seat,
        life: s.dur, popBonus: s.popBonus,
      });
      break;
    }
    case "buff_army": {
      state.effects.push({
        id: state.nextEffectId++, kind:"buff_army", team: p.team,
        moveMul: s.moveMul, atkMul: s.atkMul, life: s.dur, seat: p.seat,
      });
      break;
    }
    case "poison": {
      const enemyTeam = p.team === "hk" ? "zom" : "hk";
      state.units.forEach(u => {
        if (u.team === enemyTeam) {
          u.poison = { dmg: (u.hpMax * s.dmg) / s.dur, until: state.time + s.dur };
        }
      });
      state.effects.push({
        id: state.nextEffectId++, kind:"poison_cloud", team: p.team, life: s.dur, seat: p.seat,
      });
      break;
    }
  }
}

// 内部：创建一个单位
function spawnUnit(state, p, unitId, opt) {
  const civ = CIVS[p.civId];
  const def = civ.units[unitId];
  if (!def) return null;
  opt = opt || {};
  const isHK = p.team === "hk";
  const u = {
    id: state.nextUnitId++,
    seat: p.seat,
    team: p.team,
    civId: p.civId,
    unitId,
    def,
    x: opt.x != null ? opt.x : (isHK ? HQ_HK_X + 20 : HQ_ZOM_X - 20),
    y: opt.y != null ? opt.y : (p.row * 60),
    row: p.row,
    dir: isHK ? +1 : -1,
    hp: def.hp,
    hpMax: def.hp,
    speed: def.speed * (opt.speedMul || 1),
    cdAtk: 0,
    charmedBy: null,   // 被牧师/审计师转化：{ team, until }
    poison: null,      // { dmg, until }
    jumpUntil: 0,      // 跳跃锁定
    jumpFromX: 0, jumpToX: 0, jumpStart: 0, jumpDur: 0,
    free: !!opt.free,  // 不占人口
    born: state.time,
    lastAtkTarget: 0,
    atkFxTime: 0,      // 上次攻击时的 state.time（渲染层做挥砍/枪口闪光）
  };
  state.units.push(u);
  p.unitsBuilt++;
  return u;
}

// ===============================================================
// 一帧仿真
// ===============================================================
function tickSim(state, dt) {
  if (state.over) return;
  state.tick++;
  state.time += dt;

  // ---- 每玩家：金钱增长 ----
  state.players.forEach(p => {
    p.gold += p.income * dt;
    p.earned += p.income * dt;

    // 出兵队列
    while (p.queue.length && p.queue[0].ready <= state.time) {
      const q = p.queue.shift();
      spawnUnit(state, p, q.unitId, {});
    }
  });

  // ---- 处理效果驻留 ----
  const buffsForTeam = { hk: [], zom: [] };
  const remainEffects = [];
  for (const e of state.effects) {
    switch (e.kind) {
      case "harvester": {
        // 移动
        e.x += e.dir * e.speed * dt;
        // 撞击范围内敌军
        const enemy = e.team === "hk" ? "zom" : "hk";
        for (const u of state.units) {
          if (u.team !== enemy) continue;
          if (Math.abs(u.x - e.x) < e.w / 2) {
            u.hp -= e.dmg * dt;
          }
        }
        // 撞到对方基地：伤最近那座
        const finishAtHK = e.dir < 0 && e.x <= HQ_HK_X + 30;
        const finishAtZom = e.dir > 0 && e.x >= HQ_ZOM_X - 30;
        if (finishAtHK || finishAtZom) {
          const target = nearestBase(state, enemy, e.x);
          if (target) target.baseHp -= 250;
          state.effects.push({
            id: state.nextEffectId++, kind: "fire_burst",
            x: e.x, y: 0, r: 60, life: 0.7, initLife: 0.7,
          });
          break;
        }
        remainEffects.push(e);
        break;
      }
      case "airstrike": {
        e.life -= dt;
        if (e.life > 0) remainEffects.push(e);
        break;
      }
      case "buff_econ_expire": {
        e.life -= dt;
        if (e.life <= 0) {
          const p = state.players[e.seat];
          if (p) p.popCap = Math.max(0, p.popCap - e.popBonus);
        } else remainEffects.push(e);
        break;
      }
      case "buff_army": {
        e.life -= dt;
        buffsForTeam[e.team].push({ moveMul: e.moveMul, atkMul: e.atkMul });
        if (e.life > 0) remainEffects.push(e);
        break;
      }
      case "poison_cloud": {
        e.life -= dt;
        if (e.life > 0) remainEffects.push(e);
        break;
      }
      case "poison_puddle": {
        e.life -= dt;
        // 敌军踩上去持续中毒
        for (const u of state.units) {
          if (u.team === e.team) continue;
          if (Math.abs(u.x - e.x) < e.r) {
            u.hp -= e.dmg * dt;
          }
        }
        if (e.life > 0) remainEffects.push(e);
        break;
      }
      default:
        e.life = (e.life ?? 1) - dt;
        if (e.life > 0) remainEffects.push(e);
    }
  }
  state.effects = remainEffects;

  // ---- 投射物 ----
  const remainProj = [];
  for (const pr of state.projectiles) {
    pr.t += dt;
    if (pr.t >= pr.dur) {
      // 落地
      if (pr.kind === "barrage_zombie") {
        // 落点秒杀该点的敌方单位，然后本体作为普通僵尸继续
        const enemy = pr.team === "hk" ? "zom" : "hk";
        for (const u of state.units) {
          if (u.team === enemy && Math.abs(u.x - pr.x_to) < 20) {
            u.hp = 0;
          }
        }
        const p = state.players[pr.seat];
        if (p) spawnUnit(state, p, pr.unitId, { x: pr.x_to, y: pr.y_to });
        state.effects.push({
          id: state.nextEffectId++, kind: "fire_burst",
          x: pr.x_to, y: pr.y_to, r: 40, life: 0.5, initLife: 0.5,
        });
      } else if (pr.kind === "lob") {
        // 投石机弹丸：溅射一小圈 + 爆炸视效
        const enemy = pr.team === "hk" ? "zom" : "hk";
        for (const u of state.units) {
          if (u.team === enemy && Math.abs(u.x - pr.x_to) < 24) {
            u.hp -= pr.dmg;
          }
        }
        state.effects.push({
          id: state.nextEffectId++, kind: "fire_burst",
          x: pr.x_to, y: pr.y_to, r: 30, life: 0.55, initLife: 0.55,
        });
      } else if (pr.kind === "molotov") {
        // 燃烧瓶：纯视觉（伤害在发射瞬间已结算），落地烧一片
        state.effects.push({
          id: state.nextEffectId++, kind: "fire_burst",
          x: pr.x_to, y: pr.y_to, r: pr.splash || 30,
          life: 0.6, initLife: 0.6,
        });
      } else if (pr.kind === "bullet") {
        // 子弹：小火花
        state.effects.push({
          id: state.nextEffectId++, kind: "spark",
          x: pr.x_to, y: pr.y_to, life: 0.14, initLife: 0.14,
        });
      }
    } else {
      remainProj.push(pr);
    }
  }
  state.projectiles = remainProj;

  // ---- 每单位：AI（移动/攻击） ----
  for (const u of state.units) {
    if (u.hp <= 0) continue;
    // 中毒
    if (u.poison && u.poison.until > state.time) {
      u.hp -= u.poison.dmg * dt;
    }
    // 转化解除
    if (u.charmedBy && u.charmedBy.until <= state.time) {
      u.team = u.charmedBy.team;                        // 恢复原队
      u.dir = u.team === "hk" ? +1 : -1;
      u.charmedBy = null;
    }

    // 找目标（单位）
    const enemyTeam = u.team === "hk" ? "zom" : "hk";
    let target = null;
    let bestDist = Infinity;
    for (const t of state.units) {
      if (t.hp <= 0) continue;
      if (t.team === u.team) continue;
      const dx = Math.abs(t.x - u.x);
      if (dx < bestDist) { bestDist = dx; target = t; }
    }
    // 也可能目标是敌方基地：找最近的活基地
    const nearBase = nearestBase(state, enemyTeam, u.x);
    const distToBase = nearBase ? Math.abs(nearBase.baseX - u.x) : Infinity;
    let targetBase = false;
    if (!target || distToBase < bestDist - 20) {
      targetBase = true;
      bestDist = distToBase;
    }

    // 支援型：治疗 / 转化
    if (u.def.support === "heal") {
      // 寻找同队最缺血单位（半径内）
      let hurt = null; let hurtLack = 0;
      for (const t of state.units) {
        if (t.team !== u.team || t.hp <= 0 || t === u) continue;
        const lack = t.hpMax - t.hp;
        if (lack > hurtLack && Math.abs(t.x - u.x) < u.def.range) {
          hurt = t; hurtLack = lack;
        }
      }
      if (hurt && u.cdAtk <= 0) {
        hurt.hp = Math.min(hurt.hpMax, hurt.hp + u.def.healAmt);
        u.cdAtk = u.def.atkCd;
      }
    }
    if (u.def.support === "convert") {
      // 转化敌方一个单位为 dur 秒
      if (target && !targetBase && u.cdAtk <= 0 && Math.abs(target.x - u.x) < u.def.range) {
        target.charmedBy = { team: target.team, until: state.time + u.def.dur };
        target.team = u.team;
        target.dir = u.team === "hk" ? +1 : -1;
        u.cdAtk = u.def.atkCd;
      }
    }

    // 光环
    if (u.def.aura === "heal") {
      for (const t of state.units) {
        if (t.team !== u.team || t.hp <= 0 || t === u) continue;
        if (Math.abs(t.x - u.x) < u.def.auraR) {
          t.hp = Math.min(t.hpMax, t.hp + u.def.auraAmt * dt);
        }
      }
    }

    // 攻击/移动决策
    const range = u.def.range || 24;
    const atkTarget = target && !targetBase ? target : null;
    const canAttack = atkTarget ? Math.abs(atkTarget.x - u.x) <= range : (bestDist <= range);

    // 跳跃逻辑（跳蚤/寄生虫等 arch=zom_hopper / .jump）
    if (u.def.jump && !u.charmedBy) {
      // 探测正前方 jump 距离内是否有敌方单位或基地
      if (u.jumpUntil > state.time) {
        // 正在跳跃
        const t = (state.time - u.jumpStart) / u.jumpDur;
        u.x = u.jumpFromX + (u.jumpToX - u.jumpFromX) * Math.min(1, t);
      } else {
        // 探测触发
        const scanFront = u.x + u.dir * u.def.jump * 0.4;
        let willJump = false;
        for (const t of state.units) {
          if (t.team === u.team || t.hp <= 0) continue;
          const dx = (t.x - u.x) * u.dir;
          if (dx > 5 && dx < u.def.jump) { willJump = true; break; }
        }
        if (willJump && (u.cdAtk || 0) < state.time) {
          u.jumpFromX = u.x;
          u.jumpToX = u.x + u.dir * u.def.jump;
          u.jumpStart = state.time;
          u.jumpDur = 0.6;
          u.jumpUntil = state.time + 0.6;
        }
      }
    }

    // 战斗
    if (canAttack) {
      if (u.cdAtk <= 0) {
        // 计算 buff
        const buffs = buffsForTeam[u.team];
        let atkMul = 1;
        for (const b of buffs) atkMul *= b.atkMul;

        // 目标位置（用于视觉投射物）
        const tx = targetBase ? nearBase.baseX : atkTarget.x;
        const ty = targetBase ? -40 : (atkTarget.y - 10);
        // 打击标记（渲染层用来做挥砍/枪口闪光/后坐）
        u.atkFxTime = state.time;

        const isLobber = u.def.lobber || u.def.tag === "lobber" || u.def.arch === "zom_cata";
        const isAoe = u.def.arch === "ranged_aoe" || (u.def.splash && !isLobber);
        const isRanged = (u.def.range || 24) > 40;

        if (targetBase) {
          nearBase.baseHp -= u.def.dmg * atkMul;
          // 基地也来个弹道视觉
          if (isLobber) {
            state.projectiles.push({
              id: state.nextProjectileId++, kind: "lob", team: u.team,
              x_from: u.x, y_from: u.y - 30, x_to: tx, y_to: ty,
              dmg: 0, t: 0, dur: 0.7, seat: u.seat,
            });
          } else if (isAoe) {
            state.projectiles.push({
              id: state.nextProjectileId++, kind: "molotov", team: u.team,
              x_from: u.x + u.dir * 8, y_from: u.y - 30, x_to: tx, y_to: ty,
              splash: u.def.splash || 30, t: 0, dur: 0.5, seat: u.seat,
            });
          } else if (isRanged) {
            state.projectiles.push({
              id: state.nextProjectileId++, kind: "bullet", team: u.team,
              x_from: u.x + u.dir * 10, y_from: u.y - 35, x_to: tx, y_to: ty,
              t: 0, dur: 0.08, seat: u.seat,
            });
          }
          // 近战打基地不加投射物，靠 atkFxTime 做挥砍
        } else if (isLobber) {
          state.projectiles.push({
            id: state.nextProjectileId++,
            kind: "lob", team: u.team,
            x_from: u.x, y_from: u.y - 20, x_to: atkTarget.x, y_to: atkTarget.y,
            dmg: u.def.dmg * atkMul,
            t: 0, dur: 0.7, seat: u.seat,
          });
        } else if (isAoe) {
          // 燃烧瓶：伤害立即结算 + 视觉弹丸 + 落地火团
          const r = u.def.splash || 30;
          for (const t of state.units) {
            if (t.team !== u.team && Math.abs(t.x - atkTarget.x) < r) {
              t.hp -= u.def.dmg * atkMul;
            }
          }
          state.projectiles.push({
            id: state.nextProjectileId++, kind: "molotov", team: u.team,
            x_from: u.x + u.dir * 8, y_from: u.y - 30, x_to: atkTarget.x, y_to: atkTarget.y - 5,
            splash: r, t: 0, dur: 0.5, seat: u.seat,
          });
        } else if (isRanged) {
          atkTarget.hp -= u.def.dmg * atkMul;
          state.projectiles.push({
            id: state.nextProjectileId++, kind: "bullet", team: u.team,
            x_from: u.x + u.dir * 10, y_from: u.y - 35,
            x_to: atkTarget.x, y_to: atkTarget.y - 20,
            t: 0, dur: 0.08, seat: u.seat,
          });
        } else {
          // 纯近战
          atkTarget.hp -= u.def.dmg * atkMul;
        }
        u.cdAtk = u.def.atkCd;
      } else {
        u.cdAtk -= dt;
      }
    } else {
      // 移动
      const buffs = buffsForTeam[u.team];
      let moveMul = 1;
      for (const b of buffs) moveMul *= b.moveMul;
      if (u.jumpUntil <= state.time) {
        u.x += u.dir * u.speed * moveMul * dt;
      }
      if (u.cdAtk > 0) u.cdAtk -= dt;
    }
  }

  // ---- 清理死亡单位 & 结算能量 ----
  const alive = [];
  for (const u of state.units) {
    if (u.hp > 0) { alive.push(u); continue; }
    // 死亡奖励能量给击杀方玩家（简化：给该单位所在阵营的所有敌方玩家均分）
    const enemyTeam = u.team === "hk" ? "zom" : "hk";
    const enemies = state.players.filter(pp => pp.team === enemyTeam);
    const eng = (u.def.hp * 0.05 + u.def.dmg * 0.5 + u.def.cost * 0.25) | 0;
    if (enemies.length > 0) {
      const per = eng / enemies.length;
      enemies.forEach(pp => { pp.energy = Math.min(9999, pp.energy + per); pp.kills++; pp.killsGold += (u.def.cost * 0.1) | 0; });
    }
    // 释放人口
    const owner = state.players[u.seat];
    if (owner && !u.free) owner.pop = Math.max(0, owner.pop - u.def.pop);

    // 死亡触发：毒气池 / 爆炸
    if (u.def.onDeath === "poison_puddle") {
      state.effects.push({
        id: state.nextEffectId++, kind: "poison_puddle",
        team: u.team, x: u.x, r: 60, dmg: 12, life: 5,
      });
    } else if (u.def.onDeath === "explode") {
      for (const t of state.units) {
        if (t.team !== u.team && Math.abs(t.x - u.x) < u.def.explodeR) {
          t.hp -= u.def.explodeDmg;
        }
      }
      state.effects.push({
        id: state.nextEffectId++, kind: "explode", x: u.x, y: u.y, r: u.def.explodeR, life: 0.5,
      });
    }
    state.corpses.push({ x: u.x, y: u.y, unitId: u.unitId, civId: u.civId, team: u.team, until: state.time + 2 });
  }
  state.units = alive;
  state.corpses = state.corpses.filter(c => c.until > state.time);

  // ---- 胜负判定：某方所有基地都爆才判负 ----
  // 顺便把负数血夹紧
  state.players.forEach(pp => { if (pp.baseHp < 0) pp.baseHp = 0; });
  if (!teamAlive(state, "hk")) {
    state.over = true; state.winner = "zom"; state.over_time = state.time;
  } else if (!teamAlive(state, "zom")) {
    state.over = true; state.winner = "hk"; state.over_time = state.time;
  }
}

// 事件（用于飘字 / SFX / 网络转发）
function emitEvent(state, type, data) {
  state._events = state._events || [];
  state._events.push({ type, data, time: state.time });
}

// ---- 快照 & 恢复（客户端渲染 / 网络传输用） ----
// 全量快照 = state 本身 JSON 化。为节约带宽可以自定义，MVP 阶段直接 JSON。
function snapshot(state) {
  // 剥掉一些不必要的引用，保留纯数据
  const hkSum = teamHpSum(state, "hk");
  const zomSum = teamHpSum(state, "zom");
  const clean = {
    tick: state.tick, time: state.time, seed: state.seed,
    over: state.over, winner: state.winner, over_time: state.over_time,
    // 兼容旧 HUD/render：队伍总血
    hp: { hk: hkSum.hp, zom: zomSum.hp },
    hpMax: { hk: hkSum.hpMax, zom: zomSum.hpMax },
    players: state.players.map(p => ({
      seat: p.seat, team: p.team, isAI: p.isAI, civId: p.civId, name: p.name, row: p.row,
      baseX: p.baseX,
      baseHp: Math.max(0, Math.round(p.baseHp)),
      baseHpMax: p.baseHpMax,
      gold: Math.round(p.gold), income: p.income,
      pop: p.pop, popCap: p.popCap, energy: Math.round(p.energy),
      built: { ...p.built }, kills: p.kills, unitsBuilt: p.unitsBuilt, buildingsBuilt: p.buildingsBuilt,
      spent: Math.round(p.spent), earned: Math.round(p.earned),
    })),
    units: state.units.map(u => ({
      id: u.id, seat: u.seat, team: u.team, civId: u.civId, unitId: u.unitId,
      x: Math.round(u.x*10)/10, y: u.y, dir: u.dir,
      hp: Math.round(u.hp), hpMax: u.hpMax,
      jumpUntil: u.jumpUntil, jumpFromX: u.jumpFromX, jumpToX: u.jumpToX,
      jumpStart: u.jumpStart, jumpDur: u.jumpDur, charmedBy: u.charmedBy ? 1 : 0,
      atkFxTime: u.atkFxTime || 0,
    })),
    effects: state.effects.map(e => ({ ...e })),
    projectiles: state.projectiles.map(pr => ({ ...pr })),
    corpses: state.corpses.map(c => ({ ...c })),
    _events: state._events || [],
  };
  state._events = [];
  return clean;
}

// 客户端把 snapshot 应用到本地 rState（用于纯客户端渲染）
function applySnapshot(target, snap) {
  Object.assign(target, snap);
  // 补 def 指针（客户端也依赖 CIVS）
  target.units.forEach(u => {
    const civ = CIVS[u.civId];
    if (civ) u.def = civ.units[u.unitId];
  });
}

// 导出
window.Sim = {
  LANE_LEN, HQ_HK_X, HQ_ZOM_X, DT_MS, DT,
  makeRng, createInitialState, applyAction, tickSim, snapshot, applySnapshot,
};
