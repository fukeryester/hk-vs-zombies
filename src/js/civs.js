/* civs.js — 香港大战僵尸的文明 / 兵种 / 建筑 / 大招数据表
   -----------------------------------------------------------------
   兵种 archetype 用于渲染统一，实际数值可各文明覆盖。
   数据完全是纯 JSON-like，不引任何外部依赖，方便后续做平衡热更。
*/

// -- 兵种"原型"（用于渲染皮肤复用） -----------------------------
// shape: 用于画身体轮廓；weapon: 手上的武器画法
const ARCH = {
  melee_cheap : { shape:"peasant",    weapon:"shovel"   , tag:"melee"  },
  melee_tank  : { shape:"tank",       weapon:"fist"     , tag:"melee"  },
  melee_fast  : { shape:"runner",     weapon:"knife"    , tag:"melee"  },
  ranged_light: { shape:"peasant",    weapon:"rifle"    , tag:"ranged" },
  ranged_aoe  : { shape:"bomber",     weapon:"bottle"   , tag:"aoe"    },
  ranged_heavy: { shape:"heavy",      weapon:"machinegun",tag:"ranged" },
  support     : { shape:"caster",     weapon:"charm"    , tag:"support"},
  zom_normal  : { shape:"zombie",     weapon:"claws"    , tag:"melee"  },
  zom_hopper  : { shape:"zom_hop",    weapon:"claws"    , tag:"jumper" },
  zom_banshee : { shape:"zom_lady",   weapon:"nails"    , tag:"melee"  },
  zom_giant   : { shape:"zom_giant",  weapon:"smash"    , tag:"melee"  },
  zom_cata    : { shape:"zom_cata",   weapon:"catapult" , tag:"lobber" },
  zom_toxic   : { shape:"zom_toxic",  weapon:"claws"    , tag:"melee"  },
  zom_ghost   : { shape:"zom_ghost",  weapon:"claws"    , tag:"melee"  },
};

// -- 通用建筑（每文明都有，视觉可以有差异） -----------------------
// 编号统一，方便逻辑判断
const B = {
  HQ:      "hq",        // 基地，出兵点，掉了就败
  INCOME:  "income",    // 拾荒场：+income
  POP:     "pop",       // 民房/贫民窟：+人口上限
  TECH_A:  "tech_a",    // 一级科技，解锁 T2 兵
  TECH_B:  "tech_b",    // 二级科技，解锁 T3 兵
  TECH_C:  "tech_c",    // 三级科技，解锁 T4 兵/大招
};

// ==============================================================
// 大招（Yee-Haw / 尸潮怒火）
// ==============================================================
const SKILLS = {
  // ---- 香港阵营大招 ----
  angry_mob: {
    id:"angry_mob", name:"街坊起义", cost:1200, side:"hk",
    desc:"立即呼叫一批街坊支援，以近战杂兵为主，只有少量远程火力，不占人口。",
    kind:"summon",
    byCiv: {
      hk_finance: [["intern",12],["broker",2]],
      hk_slum:    [["urchin",10],["kungfu",4]],
      hk_police:  [["riot",6],["constable",2]],
    },
    speedMul:1.08,
  },
  minibus_rush: {
    id:"minibus_rush", name:"红 van 冲锋", cost:1800, side:"hk",
    desc:"一辆红色小巴从左向右直冲，碾杀路上所有僵尸。",
    kind:"harvester", hp:2000, dmg:80, speed:120,
  },
  chopper_strike: {
    id:"chopper_strike", name:"直升机扫射", cost:2500, side:"hk",
    desc:"警队直升机降临，一次清光当前战场僵尸。",
    kind:"airstrike", targets:"zom",
  },
  gold_rain: {
    id:"gold_rain", name:"股市暴涨", cost:1000, side:"hk",
    desc:"立刻获得 +$2000，人口 +6（临时 60 秒）。",
    kind:"buff_econ", cash:2000, popBonus:6, dur:60,
  },
  triad_ambush: {
    id:"triad_ambush", name:"江湖救急", cost:1500, side:"hk",
    desc:"空投 6 位快速近战刀客，狂暴 15 秒。",
    kind:"summon", units:[["melee_fast",6]], speedMul:1.6,
  },
  // ---- 僵尸阵营大招 ----
  zom_horde: {
    id:"zom_horde", name:"尸潮涌动", cost:1200, side:"zom",
    desc:"立即涌出 14 只普通僵尸 + 4 只跳蚤，不占人口。",
    kind:"summon", units:[["zom_normal",14],["zom_hopper",4]], speedMul:1.2,
  },
  zom_catapult_barrage: {
    id:"zom_catapult_barrage", name:"腐尸炮击", cost:1800, side:"zom",
    desc:"一次投掷 8 只普通僵尸到我方阵地。",
    kind:"barrage", count:8, unit:"zom_normal",
  },
  zom_night: {
    id:"zom_night", name:"血月夜降", cost:2500, side:"zom",
    desc:"降临血月：己方僵尸移速 +30%，攻速 +30%，持续 15 秒。",
    kind:"buff_army", moveMul:1.3, atkMul:1.3, dur:15,
  },
  zom_plague: {
    id:"zom_plague", name:"瘟疫扩散", cost:1000, side:"zom",
    desc:"当前战场所有敌方单位中毒 8 秒（-30% HP over time）。",
    kind:"poison", dmg:0.30, dur:8,
  },
  zom_ghost_summon: {
    id:"zom_ghost_summon", name:"招魂夜巡", cost:1500, side:"zom",
    desc:"空投 5 只鬼魂（半透明，可穿透前排直接打后排）。",
    kind:"summon", units:[["zom_ghost",5]], speedMul:1.4,
  },
};

// ==============================================================
// 兵种模板 — 数值通用参数
//   cost   : 造价 $
//   pop    : 占用人口
//   hp     : 生命值
//   dmg    : 单次伤害
//   range  : 攻击距离（像素）
//   speed  : 移动速度（像素/秒）
//   atkCd  : 攻击间隔（秒）
//   buildTime: 兵营出兵时间（秒）
//   prereq : 需要的建筑（TECH_A / TECH_B / TECH_C 或空）
//   arch   : 渲染原型
//   splash : 溅射半径（可选）
//   jump   : 跳跃距离（可选）
// ==============================================================

// 简化定义辅助函数
function U(name, cost, pop, hp, dmg, range, speed, atkCd, buildTime, prereq, arch, extra) {
  return Object.assign({ name, cost, pop, hp, dmg, range, speed, atkCd, buildTime, prereq, arch }, extra || {});
}

// ==============================================================
// 6 个文明
// ==============================================================
const CIVS = {

  // ============================================
  // 香港 · 1 · 金融中心（经济流 · 后期爆发）
  // ============================================
  hk_finance: {
    id:"hk_finance", side:"hk", name:"中环金融中心",
    desc:"经济增长快、后期单兵最强。前期节奏偏慢，需要靠钱压过去。",
    color:"#1e5599", accent:"#e0ba62",
    baseIncome: 6.0, baseCap: 12,
    baseRegen: 5.0,   // 前期最弱，回血偏快（HP/秒，脱战 5 秒后）
    buildings: {
      [B.HQ]:     { name:"总部大厦",  cost:0,   cap:1,  hp:1200, effect:{} },
      [B.INCOME]: { name:"金融中心",  cost:220, cap:6,  effect:{ income:+5 } },
      [B.POP]:    { name:"高级公寓",  cost:180, cap:5,  effect:{ pop:+9 } },
      [B.TECH_A]: { name:"商厦",     cost:280, cap:1,  effect:{} },
      [B.TECH_B]: { name:"投行总部", cost:500, cap:1,  effect:{} },
      [B.TECH_C]: { name:"董事会",   cost:900, cap:1,  effect:{} },
    },
    units: {
      intern:    U("打工人",    50,  1,  35,  9,  22,  50, 1.0, 0.6, null,      "melee_cheap"),
      broker:    U("金融经纪",  240, 2,  46, 10,  180, 36, 1.1, 1.0, B.TECH_A,  "ranged_light"),
      analyst:   U("量化分析师",380, 2,  58, 20,  240, 36, 1.7, 1.2, B.TECH_A,  "ranged_aoe",  { splash:32 }),
      bodyguard: U("CEO 保镖",  650, 3, 220, 30,  36,  55, 0.9, 1.3, B.TECH_B,  "melee_tank"),
      quant:     U("投行分析师",1000,5, 230, 47,  260, 44, 1.35,1.6, B.TECH_B,  "ranged_heavy"),
      auditor:   U("审计师",    600, 3,  82,  0,  200, 42, 3.2, 1.2, B.TECH_B,  "support",     { support:"convert", dur:4.6 }),
      ceo:       U("CEO",      1800, 6, 400, 78,  260, 46, 1.55,2.5, B.TECH_C,  "ranged_heavy"),
    },
    skills: ["gold_rain","angry_mob","chopper_strike"],
  },

  // ============================================
  // 香港 · 2 · 深水埗贫民窟（暴兵人海）
  // ============================================
  hk_slum: {
    id:"hk_slum", side:"hk", name:"深水埗贫民窟",
    desc:"暴兵流。所有单位便宜、出得快、单体弱，靠数量堆死。",
    color:"#7d4c1c", accent:"#c9a25a",
    baseIncome: 5.5, baseCap: 20,   // 人口上限更高
    baseRegen: 2.5,                  // 前期强，回血最慢
    buildings: {
      [B.HQ]:     { name:"劏房大厦",  cost:0,   cap:1,  hp:1000, effect:{} },
      [B.INCOME]: { name:"拾荒场",   cost:180, cap:6,  effect:{ income:+3 } },
      [B.POP]:    { name:"劏房加建", cost:120, cap:6,  effect:{ pop:+12 } },  // 更高 pop
      [B.TECH_A]: { name:"街头武馆", cost:220, cap:1,  effect:{} },
      [B.TECH_B]: { name:"烧腊档",   cost:380, cap:1,  effect:{} },
      [B.TECH_C]: { name:"庙街档",   cost:700, cap:1,  effect:{} },
    },
    units: {
      urchin:    U("街童",       35,  1,  22,  6,  20,  62, 0.7, 0.4, null,      "melee_fast"),
      kungfu:    U("拳王阿伯",   130, 2,  85, 15,  26,  56, 0.7, 0.9, B.TECH_A,  "melee_cheap"),
      fishmonger:U("卖鱼佬",     200, 2,  70, 20,  40,  50, 1.0, 1.0, B.TECH_A,  "melee_cheap"),
      chef:      U("烧腊师傅",   340, 2,  54, 22,  120, 42, 1.25,1.1, B.TECH_B,  "ranged_aoe",  { splash:20 }),
      rickshaw:  U("三轮车队",   500, 3, 180, 30,  30,  70, 0.9, 1.3, B.TECH_B,  "melee_tank"),
      dai_lo:    U("大佬",       780, 3, 118, 34,  100, 54, 1.05,1.5, B.TECH_B,  "ranged_light"),
      mahjong:   U("麻雀友",     900, 4, 110,  0,  220, 45, 3.5, 1.6, B.TECH_C,  "support",     { support:"convert", dur:6.0 }),
    },
    skills: ["angry_mob","triad_ambush","chopper_strike"],
  },

  // ============================================
  // 香港 · 3 · 湾仔差馆（均衡 · 装甲流）
  // ============================================
  hk_police: {
    id:"hk_police", side:"hk", name:"湾仔差馆",
    desc:"均衡型。中期最强的装甲部队，缺点是造价平均偏高。",
    color:"#2e6e4a", accent:"#c7ac6c",
    baseIncome: 5.0, baseCap: 14,
    baseRegen: 3.5,                  // 均衡型
    buildings: {
      [B.HQ]:     { name:"警署总部", cost:0,   cap:1,  hp:1100, effect:{} },
      [B.INCOME]: { name:"税关",     cost:200, cap:6,  effect:{ income:+4 } },
      [B.POP]:    { name:"宿舍",     cost:160, cap:5,  effect:{ pop:+9 } },
      [B.TECH_A]: { name:"训练场",   cost:250, cap:1,  effect:{} },
      [B.TECH_B]: { name:"车房",     cost:480, cap:1,  effect:{} },
      [B.TECH_C]: { name:"重案组",   cost:800, cap:1,  effect:{} },
    },
    units: {
      constable: U("警员",       95,  1,  36,  7,  100, 40, 1.15,0.7, null,      "ranged_light"),
      riot:      U("防暴警察",   240, 2, 140, 16,  30,  46, 0.9, 1.0, B.TECH_A,  "melee_tank"),
      sniper:    U("狙击手",     500, 2,  58, 34,  340, 38, 2.1, 1.3, B.TECH_A,  "ranged_heavy"),
      swat:      U("飞虎队",     700, 3, 150, 22,  200, 46, 0.95,1.4, B.TECH_B,  "ranged_light"),
      truck:     U("装甲车",     960, 5, 330, 32,  180, 38, 1.15,1.7, B.TECH_B,  "ranged_heavy",{ splash:16 }),
      negotiator:U("谈判专家",  1100, 3,  90,  0,  180, 45, 3.0, 1.5, B.TECH_B,  "support",     { support:"convert", dur:5.5 }),
      hero_cop:  U("重案组长",  1600, 5, 280, 48,  220, 50, 1.35,2.0, B.TECH_C,  "ranged_heavy"),
    },
    skills: ["angry_mob","chopper_strike","triad_ambush"],
  },

  // ============================================
  // 僵尸 · 1 · 末日尸潮（复刻原作僵尸）
  // ============================================
  zom_classic: {
    id:"zom_classic", side:"zom", name:"末日尸潮",
    desc:"原教旨主义丧尸。均衡：普通尸海 + 巨怪 + 投石机，经典还原。",
    color:"#5a1a1a", accent:"#7fa03a",
    baseIncome: 5.5, baseCap: 14,
    baseRegen: 3.5,                  // 均衡型
    buildings: {
      [B.HQ]:     { name:"僵尸大厦", cost:0,   cap:1,  hp:1280, effect:{} },
      [B.INCOME]: { name:"腐尸池",   cost:200, cap:6,  effect:{ income:+4 } },
      [B.POP]:    { name:"墓地",     cost:160, cap:5,  effect:{ pop:+9 } },
      [B.TECH_A]: { name:"废弃医院", cost:250, cap:1,  effect:{} },
      [B.TECH_B]: { name:"停尸间",   cost:480, cap:1,  effect:{} },
      [B.TECH_C]: { name:"病毒源",   cost:800, cap:1,  effect:{} },
    },
    units: {
      normal:  U("普通僵尸",   55,  1,  58, 13,  22,  44, 1.0, 0.6, null,      "zom_normal"),
      flea:    U("跳蚤",       150, 1,  72, 16,  22,  66, 0.9, 0.9, B.TECH_A,  "zom_hopper", { jump:150 }),
      banshee: U("女妖",       320, 2, 136, 24,  22,  72, 0.65,1.1, B.TECH_A,  "zom_banshee"),
      giant:   U("巨怪",       800, 4, 500, 55,  36,  30, 1.6, 1.6, B.TECH_B,  "zom_giant",  { splash:40 }),
      cata:    U("投石僵尸",   700, 3, 200, 40,  400, 30, 2.6, 1.5, B.TECH_B,  "zom_cata",   { lobber:true }),
      toxic:   U("毒气僵尸",   360, 2, 100, 18,  22,  42, 1.2, 1.1, B.TECH_B,  "zom_toxic",  { onDeath:"poison_puddle" }),
      necro:   U("尸巫",      1000, 4, 180,  0,  200, 40, 2.5, 2.0, B.TECH_C,  "support",    { support:"heal", healAmt:22, dur:0 }),
    },
    skills: ["zom_horde","zom_catapult_barrage","zom_night"],
  },

  // ============================================
  // 僵尸 · 2 · 港式怪谈（高机动 · 特殊怪）
  // ============================================
  zom_ghost: {
    id:"zom_ghost", side:"zom", name:"港式怪谈",
    desc:"跳跃、穿透、招魂。移速高，单兵脆但机动性无解。",
    color:"#4a1a4a", accent:"#e08cff",
    baseIncome: 5.0, baseCap: 12,
    baseRegen: 3.0,                  // 机动强，回血中等偏慢
    buildings: {
      [B.HQ]:     { name:"茅山庙",    cost:0,   cap:1,  hp:1120, effect:{} },
      [B.INCOME]: { name:"金山银铺",  cost:180, cap:6,  effect:{ income:+4 } },
      [B.POP]:    { name:"义庄",     cost:150, cap:5,  effect:{ pop:+8 } },
      [B.TECH_A]: { name:"油炸鬼摊", cost:220, cap:1,  effect:{} },
      [B.TECH_B]: { name:"棺材铺",   cost:400, cap:1,  effect:{} },
      [B.TECH_C]: { name:"阴阳阵",   cost:700, cap:1,  effect:{} },
    },
    units: {
      hopping: U("清朝跳僵尸", 90,  1,  70, 14,  22,  54, 0.9, 0.8, null,     "zom_hopper", { jump:80 }),
      hungry:  U("饿鬼",       170, 1,  52, 20,  60,  80, 0.55,0.9, B.TECH_A, "zom_ghost"),   // 高攻高速低血
      oil:     U("油炸鬼",     250, 2, 105, 22, 120,  52, 0.95,1.1, B.TECH_A, "ranged_aoe",   { splash:26 }),
      water:   U("水鬼",       400, 2, 160, 24,  30,  55, 0.9, 1.2, B.TECH_B, "zom_toxic",    { onDeath:"poison_puddle" }),
      paper:   U("纸扎人",     500, 3, 220,  0,  220, 40, 2.5, 1.4, B.TECH_B, "support",      { support:"convert", dur:4.5 }),
      fox:     U("狐仙",       900, 4, 280, 44, 180,  55, 1.3, 1.7, B.TECH_C, "zom_banshee"),
      mirror:  U("镜中人",    1200, 4, 400, 55,  36,  46, 1.1, 2.0, B.TECH_C, "zom_giant",   { splash:30 }),
    },
    skills: ["zom_ghost_summon","zom_plague","zom_night"],
  },

  // ============================================
  // 僵尸 · 3 · 病毒实验体（高科技 AOE）
  // ============================================
  zom_bio: {
    id:"zom_bio", side:"zom", name:"病毒实验体",
    desc:"高科技丧尸。前期弱，一旦上 T2 全场溅射毒气，团战无敌。",
    color:"#204a2a", accent:"#66ff88",
    baseIncome: 4.5, baseCap: 12,
    baseRegen: 4.5,                  // 前期弱，回血偏快
    buildings: {
      [B.HQ]:     { name:"生化研究所", cost:0,   cap:1,  hp:1250, effect:{} },
      [B.INCOME]: { name:"病株农场",   cost:200, cap:6,  effect:{ income:+4 } },
      [B.POP]:    { name:"培养舱",    cost:160, cap:5,  effect:{ pop:+8 } },
      [B.TECH_A]: { name:"实验大楼",  cost:260, cap:1,  effect:{} },
      [B.TECH_B]: { name:"孵化室",    cost:500, cap:1,  effect:{} },
      [B.TECH_C]: { name:"母体核心",  cost:900, cap:1,  effect:{} },
    },
    units: {
      infected: U("感染者",    60,  1,  60, 13,  22,  46, 0.95,0.7, null,      "zom_normal"),
      spitter:  U("酸液喷射者",260, 2, 110, 25,  180, 46, 1.25,1.1, B.TECH_A,  "ranged_aoe",  { splash:32 }),
      mutant:   U("变异体",    500, 3, 240, 38,  32,  42, 0.95,1.3, B.TECH_A,  "zom_giant"),
      bomber:   U("爆膛者",    350, 2,  80,  0,  22,  70, 0.5, 1.0, B.TECH_B,  "zom_toxic",   { onDeath:"explode", explodeDmg:120, explodeR:80 }),
      parasite: U("寄生虫",    220, 1,  60, 16,  22,  90, 0.6, 0.9, B.TECH_B,  "zom_hopper",  { jump:120 }),
      radiator: U("辐射者",    700, 3, 260, 42,  260, 32, 1.8, 1.5, B.TECH_B,  "ranged_heavy",{ splash:22 }),
      mother:   U("母体",     1800, 6, 700, 60,  32,  22, 1.5, 2.4, B.TECH_C,  "zom_giant",   { splash:50, aura:"heal", auraR:120, auraAmt:8 }),
    },
    skills: ["zom_plague","zom_catapult_barrage","zom_night"],
  },
};

// 快速访问：某文明的所有兵种 ID 列表
function civUnitIds(civId) {
  return Object.keys(CIVS[civId].units);
}
// 获取一个具体单位定义（含 civ 前缀）
function unitDef(civId, unitId) {
  const civ = CIVS[civId];
  if (!civ) return null;
  const u = civ.units[unitId];
  if (!u) return null;
  return u;
}
// 判断某文明的某单位是否已解锁（根据已建成建筑集合）
function isUnitUnlocked(civId, unitId, builtSet) {
  const u = unitDef(civId, unitId);
  if (!u) return false;
  if (!u.prereq) return true;
  return builtSet.has(u.prereq);
}

// 导出给全局
window.CIVS = CIVS;
window.SKILLS = SKILLS;
window.B = B;
window.civUnitIds = civUnitIds;
window.unitDef = unitDef;
window.isUnitUnlocked = isUnitUnlocked;

// 供 UI 快速枚举
window.HK_CIVS = ["hk_finance", "hk_slum", "hk_police"];
window.ZOM_CIVS = ["zom_classic", "zom_ghost", "zom_bio"];
