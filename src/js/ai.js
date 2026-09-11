/* ai.js — 简单但可玩的 AI 对手
   -----------------------------------------------------------------
   策略层次：
   1. 前 20 秒：疯狂造经济 + 造 T1 兵稳战线
   2. 20~60 秒：造 TECH_A + 出 T2
   3. 60 秒后：造 TECH_B/TECH_C，追求高级兵种
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
    // 触发条件：敌人扎堆 or 我方危险
    if (s.kind === "airstrike" && (enemyCluster || enemyDangerNear)) {
      if (applyFn({ op:"skill", seat, skill: skillId }).ok) return;
    }
    if ((s.kind === "harvester" || s.kind === "summon") && (enemyCluster || t > 20)) {
      if (applyFn({ op:"skill", seat, skill: skillId }).ok) return;
    }
    if (s.kind === "buff_econ" && t > 15) {
      if (applyFn({ op:"skill", seat, skill: skillId }).ok) return;
    }
    if ((s.kind === "buff_army" || s.kind === "poison" || s.kind === "barrage") && enemyCluster) {
      if (applyFn({ op:"skill", seat, skill: skillId }).ok) return;
    }
  }

  // ---- 建筑决策 ----
  const wantEconEarly = t < 30 && (p.built[B.INCOME] || 0) < 2;
  const wantMorePop = p.pop >= p.popCap - 3 && (p.built[B.POP] || 0) < civ.buildings[B.POP].cap;
  const wantTechA = t > 20 && !p.built[B.TECH_A];
  const wantTechB = t > 45 && !p.built[B.TECH_B];
  const wantTechC = t > 90 && !p.built[B.TECH_C];
  const wantMoreEcon = (p.built[B.INCOME] || 0) < civ.buildings[B.INCOME].cap && t > 40 && t % 25 < 5;

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

  // ---- 出兵决策 ----
  // 优先级：能出的最贵兵 > 中兵 > 便宜兵
  // 但如果口袋钱少 或 敌人压过来，先出便宜兵
  const built = new Set(Object.keys(p.built).filter(k => p.built[k] > 0));
  const affordable = [];
  for (const [uid, u] of Object.entries(civ.units)) {
    if (u.prereq && !built.has(u.prereq)) continue;
    if (p.pop + u.pop > p.popCap) continue;
    if (p.gold < u.cost) continue;
    affordable.push({ uid, u });
  }
  if (affordable.length === 0) return;

  // 危险时选便宜的填线
  const dangerMode = enemyDangerNear && t > 5;
  affordable.sort((a, b) => dangerMode ? a.u.cost - b.u.cost : b.u.cost - a.u.cost);

  // 支援兵别造太多
  const supports = state.units.filter(u => u.team === myTeam && u.def.support).length;
  const filtered = affordable.filter(({u}) => !u.support || supports < 2);
  const pick = (filtered[0] || affordable[0]);

  // 别把钱全花光（留点应急）
  if (p.gold >= pick.u.cost + 60) {
    applyFn({ op:"spawn", seat, unit: pick.uid });
  }
}

window.AI = { aiThink };
