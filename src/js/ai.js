/* ai.js — 简单但可玩的 AI 对手
   -----------------------------------------------------------------
   策略层次：
   1. 前 10 秒：经济与少量 T1 稳线
   2. 10~45 秒：快速造 TECH_A / TECH_B
   3. 45 秒后：冲 TECH_C，让后期兵稳定登场
   4. 能量满就放大招（有敌军扎堆才放）
   5. 每 1.5 秒思考一次（不能每帧发决策，会崩游戏）
*/

const AI_THINK_INTERVAL = 1.2;   // 秒
const AI_DIFFICULTY = 1.0;       // 反应/资源乘数

function aiThink(state, seat, applyFn) {
  const p = state.players[seat];
  if (!p || !p.isAI || state.over) return;
  if (state.time - p.last_ai_think < AI_THINK_INTERVAL) return;
  p.last_ai_think = state.time;

  const civ = CIVS[p.civId];
  const t = state.time;
  const myTeam = p.team;
  const enemyTeam = myTeam === "hk" ? "zom" : "hk";

  // ---- 战线感知 ----
  let myFront = myTeam === "hk" ? 0 : Sim.LANE_LEN;
  let enemyFront = myTeam === "hk" ? Sim.LANE_LEN : 0;
  let enemyMassX = 0, enemyMassN = 0;
  for (const u of state.units) {
    if (u.team === myTeam) {
      if (myTeam === "hk" ? u.x > myFront : u.x < myFront) myFront = u.x;
    } else {
      if (myTeam === "hk" ? u.x < enemyFront : u.x > enemyFront) enemyFront = u.x;
      enemyMassX += u.x; enemyMassN++;
    }
  }
  const enemyDangerNear = myTeam === "hk" ? enemyFront < 300 : enemyFront > (Sim.LANE_LEN - 300);
  const enemyCluster = enemyMassN >= 4;

  // ---- 大招决策（优先级最高） ----
  for (const skillId of civ.skills) {
    const s = SKILLS[skillId];
    if (!s || p.energy < s.cost) continue;
    if (Sim.skillCdRemain(p, s, state.time) > 0) continue;
    // 触发条件：敌人扎堆 or 我方危险
    if ((s.kind === "precision_strike" || s.kind === "fire_rain" || s.kind === "stun"
        || s.kind === "mirror_shift" || s.kind === "radiation_field")
        && (enemyCluster || enemyDangerNear)) {
      if (applyFn({ op:"skill", seat, skill: skillId }).ok) return;
    }
    if ((s.kind === "harvester" || s.kind === "summon" || s.kind === "elite_drop"
        || s.kind === "lane_spawn" || s.kind === "flank_spawn")
        && (enemyCluster || t > 20)) {
      if (applyFn({ op:"skill", seat, skill: skillId }).ok) return;
    }
    if ((s.kind === "income_surge" || s.kind === "evolve") && t > 15) {
      if (applyFn({ op:"skill", seat, skill: skillId }).ok) return;
    }
    if ((s.kind === "buff_army" || s.kind === "poison" || s.kind === "army_heal"
        || s.kind === "soul_drain" || s.kind === "hostile_takeover") && enemyCluster) {
      if (applyFn({ op:"skill", seat, skill: skillId }).ok) return;
    }
    if (s.kind === "base_fortify" && p.baseHp < p.baseHpMax * 0.65) {
      if (applyFn({ op:"skill", seat, skill: skillId }).ok) return;
    }
  }

  // ---- 建筑决策 ----
  const wantEconEarly = t < 22 && (p.built[B.INCOME] || 0) < 1;
  const wantMorePop = p.pop >= p.popCap - 3 && (p.built[B.POP] || 0) < civ.buildings[B.POP].cap;
  const wantTechA = t > 8 && !p.built[B.TECH_A];
  const trained = p.trainedByTech || {};
  const wantTechB = t > 36 && p.built[B.TECH_A] && (trained[B.TECH_A] || 0) > 0 && !p.built[B.TECH_B];
  const wantTechC = t > 72 && p.built[B.TECH_B] && (trained[B.TECH_B] || 0) > 0 && !p.built[B.TECH_C];
  const wantMoreEcon = (p.built[B.INCOME] || 0) < civ.buildings[B.INCOME].cap && t > 32 && t % 22 < 5;

  const buildPlan = [];
  if (wantEconEarly) buildPlan.push(B.INCOME);
  if (wantMorePop)  buildPlan.push(B.POP);
  if (wantTechA)    buildPlan.push(B.TECH_A);
  if (wantTechB)    buildPlan.push(B.TECH_B);
  if (wantTechC)    buildPlan.push(B.TECH_C);
  if (wantMoreEcon) buildPlan.push(B.INCOME);

  for (const kind of buildPlan) {
    if ((p.built[kind] || 0) >= civ.buildings[kind].cap) continue;
    const cost = civ.buildings[kind].cost;
    if (p.gold >= cost * 1.1) {
      if (applyFn({ op:"build", seat, kind }).ok) return;
    }
  }

  // 已到升本时间就存钱，不再把科技预算反复花在 T1 杂兵上。
  // 基地远程防御会兜住短暂空窗，保证 AI 对局能稳定出现中后期单位。
  if (wantTechA || wantTechB || wantTechC) return;

  // ---- 出兵决策 ----
  // 优先级：能出的最贵兵 > 中兵 > 便宜兵
  // 但如果口袋钱少 或 敌人压过来，先出便宜兵
  const built = new Set(Object.keys(p.built).filter(k => p.built[k] > 0));
  const candidates = [];
  for (const [uid, u] of Object.entries(civ.units)) {
    if (u.prereq && !built.has(u.prereq)) continue;
    if (p.pop + u.pop > p.popCap) continue;
    candidates.push({ uid, u });
  }
  if (candidates.length === 0) return;

  // 只在当前最高科技层选兵，确保每一层至少真正登场一次。
  const topTech = p.built[B.TECH_C] ? B.TECH_C
    : p.built[B.TECH_B] ? B.TECH_B
    : p.built[B.TECH_A] ? B.TECH_A : null;
  const tierCandidates = topTech ? candidates.filter(({u}) => u.prereq === topTech) : candidates;
  const pool = tierCandidates.length ? tierCandidates : candidates;

  // 基地已有自卫火力，危险时也优先投入当前买得起的高级兵，
  // 避免科技升完后仍退化成最低级杂兵对轰。
  pool.sort((a, b) => b.u.cost - a.u.cost);

  // 支援兵别造太多
  const supports = state.units.filter(u => u.team === myTeam && u.def.support).length;
  const filtered = pool.filter(({u}) => !u.support || supports < 2);
  const pick = (filtered[0] || pool[0]);

  // 锁定当前科技层最强单位并存钱；钱不足时不拿预算反复补 T1。
  if (p.gold >= pick.u.cost) {
    applyFn({ op:"spawn", seat, unit: pick.uid });
  }
}

window.AI = { aiThink };
