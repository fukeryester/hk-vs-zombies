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
  ranged_ceo  : { shape:"ceo",        weapon:"briefcase",tag:"ranged" },
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
  // 中环金融中心：资本滚动、收购敌军、保护总部
  capital_injection: {
    id:"capital_injection", name:"资本注资", cost:900, side:"hk", cd:38,
    desc:"立即获得 $1200，并令收入 +5/s，持续 45 秒。",
    kind:"income_surge", cash:1200, income:5, dur:45,
  },
  hostile_takeover: {
    id:"hostile_takeover", name:"恶意收购", cost:1550, side:"hk", cd:52,
    desc:"收购战场上造价最高的 2 个敌军，使其为中环作战 14 秒。",
    kind:"hostile_takeover", count:2, dur:14,
  },
  golden_parachute: {
    id:"golden_parachute", name:"黄金降落伞", cost:2200, side:"hk", cd:70,
    desc:"总部回复 35% 最大生命，并在 20 秒内减免 65% 所受伤害。",
    kind:"base_fortify", heal:0.35, reduction:0.65, dur:20,
  },

  // 深水埗贫民窟：街坊人海、红 van 突围、天台火雨
  neighborhood_uprising: {
    id:"neighborhood_uprising", name:"全邨开拖", cost:1050, side:"hk", cd:34,
    desc:"召来 10 名街童与 4 名拳王阿伯，从劏房背后集体杀出且不占人口。",
    kind:"summon", units:[["urchin",10],["kungfu",4]], speedMul:1.12,
  },
  red_van_breakout: {
    id:"red_van_breakout", name:"红 Van 突围", cost:1600, side:"hk", cd:48,
    desc:"红色小巴冲穿整条战线，持续碾压沿途尸群并撞击敌方基地。",
    kind:"harvester", hp:2200, dmg:85, speed:135,
  },
  rooftop_firestorm: {
    id:"rooftop_firestorm", name:"天台火锅雨", cost:2100, side:"hk", cd:56,
    desc:"街坊从天台倾下 7 锅滚油，在敌军最密集处造成范围伤害。",
    kind:"fire_rain", count:7, dmg:58, radius:58,
  },

  // 湾仔差馆：控场、精确清除、装甲增援
  district_lockdown: {
    id:"district_lockdown", name:"全区封锁", cost:1000, side:"hk", cd:55,
    desc:"震慑并定住全部敌军 6 秒，使其不能移动或攻击。",
    kind:"stun", dur:6,
  },
  warrant_strike: {
    id:"warrant_strike", name:"一级通缉令", cost:1700, side:"hk", cd:46,
    desc:"狙击战场上威胁最高的 3 个敌军，每个目标受到 260 点伤害。",
    kind:"precision_strike", count:3, dmg:260,
  },
  armored_requisition: {
    id:"armored_requisition", name:"紧急征用", cost:2350, side:"hk", cd:62,
    desc:"从警署后方调来 1 辆装甲车与 3 名防暴警察，不占人口。",
    kind:"elite_drop", units:[["truck",1],["riot",3]],
  },

  // 末日尸潮：遍地破土、吞尸续命、血月狂化
  grave_breach: {
    id:"grave_breach", name:"全线破土", cost:1050, side:"zom", cd:32,
    desc:"12 只普通僵尸沿整条战线随机破土，直接打乱人类阵形。",
    kind:"lane_spawn", unit:"normal", count:12,
  },
  cannibal_feast: {
    id:"cannibal_feast", name:"吞尸续命", cost:1600, side:"zom", cd:44,
    desc:"所有己方僵尸立即回复 45% 最大生命，残血尸群重新站稳。",
    kind:"army_heal", heal:0.45,
  },
  crimson_moon: {
    id:"crimson_moon", name:"猩红月蚀", cost:2250, side:"zom", cd:55,
    desc:"尸群移速 +35%、伤害 +35%，持续 16 秒。",
    kind:"buff_army", moveMul:1.35, atkMul:1.35, dur:16,
  },

  // 港式怪谈：阴兵绕后、吸魂反哺、镜阵移形
  ghostly_night_parade: {
    id:"ghostly_night_parade", name:"百鬼夜行", cost:1100, side:"zom", cd:36,
    desc:"5 只饿鬼从人类基地背后现身，专门撕咬后排。",
    kind:"flank_spawn", unit:"hungry", count:5,
  },
  soul_tithe: {
    id:"soul_tithe", name:"阴司收数", cost:1650, side:"zom", cd:50,
    desc:"抽走所有敌军 18% 当前生命，并把吸取量转化为茅山庙生命。",
    kind:"soul_drain", ratio:0.18,
  },
  mirror_maze: {
    id:"mirror_maze", name:"镜阵移形", cost:2200, side:"zom", cd:60,
    desc:"把最靠近茅山庙的 6 个敌军送回战线中央，强行重置压家攻势。",
    kind:"mirror_shift", count:6, distance:300,
  },

  // 病毒实验体：疫病、强制进化、持续辐射
  engineered_plague: {
    id:"engineered_plague", name:"定向瘟疫", cost:1050, side:"zom", cd:48,
    desc:"全部敌军在 10 秒内流失 32% 最大生命。",
    kind:"poison", dmg:0.32, dur:10,
  },
  forced_evolution: {
    id:"forced_evolution", name:"强制进化", cost:1700, side:"zom", cd:42,
    desc:"最多 6 名感染者蜕变为变异体，保留当前生命比例且不额外占人口。",
    kind:"evolve", from:"infected", to:"mutant", count:6,
  },
  reactor_overload: {
    id:"reactor_overload", name:"反应堆过载", cost:2300, side:"zom", cd:58,
    desc:"战场进入 12 秒辐射过载，每秒灼烧全部敌军 14 点生命。",
    kind:"radiation_field", dmg:14, dur:12,
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

// 时代压制：T3（TECH_B）开始形成质变，T4 再进一步拉开差距。
// 目标是同级高阶战斗单位能正面对抗约 6~8 个 T1 杂兵。
const ERA_POWER = {
  [B.TECH_B]: { hp:5.5, dmg:2.2, atkCd:0.75, splash:1.25, ability:2.0 },
  [B.TECH_C]: { hp:8.0, dmg:3.2, atkCd:0.65, splash:1.45, ability:2.8 },
};

// 简化定义辅助函数
function U(name, cost, pop, hp, dmg, range, speed, atkCd, buildTime, prereq, arch, extra) {
  const def = Object.assign({ name, cost, pop, hp, dmg, range, speed, atkCd, buildTime, prereq, arch }, extra || {});
  const power = ERA_POWER[prereq];
  if (!power) return def;
  def.hp = Math.round(def.hp * power.hp);
  if (def.dmg > 0) def.dmg = Math.round(def.dmg * power.dmg);
  def.atkCd = Math.max(0.25, Math.round(def.atkCd * power.atkCd * 100) / 100);
  if (def.splash) def.splash = Math.round(def.splash * power.splash);
  if (def.healAmt) def.healAmt = Math.round(def.healAmt * power.ability);
  if (def.auraAmt) def.auraAmt = Math.round(def.auraAmt * power.ability);
  if (def.dur) def.dur = Math.round(def.dur * Math.sqrt(power.ability) * 10) / 10;
  if (def.explodeDmg) def.explodeDmg = Math.round(def.explodeDmg * power.ability);
  if (def.explodeR) def.explodeR = Math.round(def.explodeR * Math.sqrt(power.ability));
  def.eraPower = prereq === B.TECH_C ? 4 : 3;
  return def;
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
      [B.HQ]:     { name:"总部大厦",  cost:0,   cap:1,  hp:2400, effect:{} },
      [B.INCOME]: { name:"金融中心",  cost:220, cap:6,  effect:{ income:+5 } },
      [B.POP]:    { name:"高级公寓",  cost:180, cap:5,  effect:{ pop:+9 } },
      [B.TECH_A]: { name:"商厦",     cost:150, cap:1,  effect:{} },
      [B.TECH_B]: { name:"投行总部", cost:280, cap:1,  effect:{} },
      [B.TECH_C]: { name:"董事会",   cost:480, cap:1,  effect:{} },
    },
    units: {
      intern:    U("打工人",    50,  1,  35,  9,  22,  50, 1.0, 0.6, null,      "melee_cheap", { desc:"中环写字楼里通宵改 PPT 的普通文员。尸变当晚电梯停了，他抄起消防铲加入防线。廉价近战，出得快、单体弱，适合前期铺场。" }),
      broker:    U("金融经纪",  240, 2,  46, 10,  180, 36, 1.1, 1.0, B.TECH_A,  "ranged_light", { desc:"以前靠电话和酒局撮合大额交易。交易所关闭后，他把客户名单换成射击标尺。脆皮远程，站桩输出，怕被近身。" }),
      analyst:   U("量化分析师",380, 2,  58, 20,  240, 36, 1.7, 1.2, B.TECH_A,  "ranged_aoe",  { splash:32, desc:"模型比人还准的量化员。他把回测脚本改成弹道表，专打成群目标。范围远程，射速偏慢，适合清杂兵。" }),
      bodyguard: U("CEO 保镖",  650, 3, 220, 30,  36,  55, 0.9, 1.3, B.TECH_B,  "melee_tank", { desc:"从前只负责挡闪光灯和闹事股东。董事会决定死守总部后，他成了最厚的人墙。高血近战坦克，用来顶线换时间。" }),
      quant:     U("投行分析师",1000,5, 230, 47,  260, 44, 1.35,1.6, B.TECH_B,  "ranged_heavy", { desc:"并购案做到一半城市就塌了。他带着估值模型上了屋顶，把重火力当成新的定价工具。高伤害远程，贵、慢，适合中后期点名。" }),
      auditor:   U("审计师",    600, 3,  82,  0,  200, 42, 3.2, 1.2, B.TECH_B,  "support",     { support:"convert", dur:4.6, desc:"查账查到死人账上的铁面审计。他不开枪，只把敌方单位“重新入账”到己方。辅助转化，脆但能改战场归属。" }),
      ceo:       U("CEO",      1800, 6, 400, 78,  260, 46, 1.55,2.5, B.TECH_C,  "ranged_ceo", { desc:"中环投行的最终决策者。为了保住牌照、金库和自己的名字，他提着金边公文包亲自下场。终盘远程核心，血厚、伤害高、造价极贵。" }),
    },
    skills: ["capital_injection","hostile_takeover","golden_parachute"],
  },

  // ============================================
  // 香港 · 2 · 深水埗贫民窟（暴兵人海）
  // ============================================
  hk_slum: {
    id:"hk_slum", side:"hk", name:"深水埗贫民窟",
    desc:"暴兵流。单价极低、造得飞快、人口上限最高；单体弱，堆量才是本命。",
    color:"#7d4c1c", accent:"#c9a25a",
    baseIncome: 6.2, baseCap: 24,   // 收入与人口都最高，鼓励堆兵
    baseRegen: 2.5,
    buildings: {
      [B.HQ]:     { name:"劏房大厦",  cost:0,   cap:1,  hp:2000, effect:{} },
      [B.INCOME]: { name:"拾荒场",   cost:150, cap:6,  effect:{ income:+3 } },
      [B.POP]:    { name:"劏房加建", cost:90,  cap:6,  effect:{ pop:+14 } },   // 更高 pop、更便宜
      [B.TECH_A]: { name:"街头武馆", cost:95,  cap:1,  effect:{} },
      [B.TECH_B]: { name:"烧腊档",   cost:180, cap:1,  effect:{} },
      [B.TECH_C]: { name:"庙街档",   cost:320, cap:1,  effect:{} },
    },
    units: {
      // 全体下调 25~35% 造价与建造时间；数值也温和下调，靠人海取胜
      urchin:    U("街童",       22,  1,  18,  5,  20,  62, 0.7, 0.3, null,      "melee_fast", { desc:"深水埗天台和后巷长大的孩子。尸潮来时他们比谁都熟路，抄起砖头就敢冲。极便宜近战，脆得像纸，靠数量抢节奏。" }),
      kungfu:    U("拳王阿伯",    85, 2,  70, 12,  26,  56, 0.7, 0.7, B.TECH_A,  "melee_cheap", { anim:"hk_slum_kungfu", desc:"街头武馆教了一辈子洪拳的老人。晚辈都被咬了，他只好重新扎马。便宜近战，出手快，适合跟街童混编续线。" }),
      fishmonger:U("卖鱼佬",    140, 2,  58, 17,  40,  50, 1.0, 0.8, B.TECH_A,  "melee_cheap", { anim:"hk_slum_fishmonger", desc:"北河街卖冰鲜的壮汉。刀本来是剖鱼的，现在用来剖尸。中距近战，伤害比街童扎实，仍不算坦克。" }),
      chef:      U("烧腊师傅",  240, 2,  44, 18,  120, 42, 1.25, 0.9, B.TECH_B,  "ranged_aoe",  { anim:"hk_slum_chef", splash:18, desc:"油锅和叉烧炉看着像武器库。他把热油和酱汁泼向尸群，只为保住档口和街坊。短程溅射，清堆效果好。" }),
      rickshaw:  U("三轮车队",  360, 3, 150, 24,  30,  70, 0.9, 1.05, B.TECH_B,  "melee_tank", { anim:"hk_slum_rickshaw", desc:"载客维生的车夫不愿丢下车。他们把三轮改成冲锋铁壳，带着街坊往前碾。高移速近战坦克，适合撕开前排。" }),
      dai_lo:    U("大佬",      560, 3,  96, 28,  100, 54, 1.05,1.2, B.TECH_B,  "ranged_light", { anim:"hk_slum_dailo", desc:"庙街混了半辈子的头目。地盘没了还能护自己人，手枪比从前更勤。中程点射，比杂兵能打，但仍怕被围。" }),
      mahjong:   U("麻雀友",    680, 4,  90,  0,  220, 45, 3.5, 1.3, B.TECH_C,  "support",     { anim:"hk_slum_mahjong", support:"convert", dur:5.5, desc:"茶楼里吵了一辈子牌的街坊。他们用熟络人情把敌兵“劝”过来。转化时间更长，是贫民窟的控场核心。" }),
    },
    skills: ["neighborhood_uprising","red_van_breakout","rooftop_firestorm"],
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
      [B.HQ]:     { name:"警署总部", cost:0,   cap:1,  hp:2200, effect:{} },
      [B.INCOME]: { name:"税关",     cost:200, cap:6,  effect:{ income:+4 } },
      [B.POP]:    { name:"宿舍",     cost:160, cap:5,  effect:{ pop:+9 } },
      [B.TECH_A]: { name:"训练场",   cost:135, cap:1,  effect:{} },
      [B.TECH_B]: { name:"车房",     cost:260, cap:1,  effect:{} },
      [B.TECH_C]: { name:"重案组",   cost:430, cap:1,  effect:{} },
    },
    units: {
      constable: U("警员",       95,  1,  36,  7,  100, 40, 1.15,0.7, null,      "ranged_light", { anim:"hk_police_constable", desc:"湾仔巡逻的普通警员。电台失灵后仍按纪律守街，佩枪从驱散变成保命。开局远程，伤害已下调，用来补线而不是清场。" }),
      riot:      U("防暴警察",   240, 2, 140, 16,  30,  46, 0.9, 1.0, B.TECH_A,  "melee_tank", { desc:"盾牌和头盔本是应付示威的。现在他们把盾墙对准尸潮，给后排枪手换时间。中期核心坦克，站得住、走得慢。" }),
      sniper:    U("狙击手",     500, 2,  58, 34,  340, 38, 2.1, 1.3, B.TECH_A,  "ranged_heavy", { anim:"hk_police_sniper", desc:"天台值守的神枪手。城市崩了，他仍在数呼吸、等窗口。超远单点，射速慢、身板脆，专打高价值目标。" }),
      swat:      U("飞虎队",     700, 3, 150, 22,  200, 46, 0.95,1.4, B.TECH_B,  "ranged_light", { anim:"hk_police_swat", desc:"重案突入的精锐。营救人质的任务变成护送平民撤离。中远程机动火力，比警员能打，但仍不是无敌枪线。" }),
      truck:     U("装甲车",     960, 5, 330, 32,  180, 38, 1.15,1.7, B.TECH_B,  "ranged_heavy",{ anim:"hk_police_truck", splash:16, desc:"车房里最后能发动的防暴车。司机不肯丢车，载着队友把尸群撞开再扫射。高血溅射载具，贵、慢、能顶。" }),
      negotiator:U("谈判专家",  1100, 3,  90,  0,  180, 45, 3.0, 1.5, B.TECH_B,  "support",     { anim:"hk_police_negotiator", support:"convert", dur:5.5, desc:"从前靠说话救人质。尸潮里他仍试着唤醒残留神智，把敌人拉回己方。转化辅助，自己几乎没有火力。" }),
      hero_cop:  U("重案组长",  1600, 5, 280, 48,  220, 50, 1.35,2.0, B.TECH_C,  "ranged_heavy", { anim:"hk_police_hero", desc:"办过大案、不肯弃城的组长。他把整条防线当成最后一个案发现场。终盘远程核心，攻防都够，但来得晚、来得贵。" }),
    },
    skills: ["district_lockdown","warrant_strike","armored_requisition"],
  },

  // ============================================
  // 僵尸 · 1 · 末日尸潮（复刻原作僵尸）
  // ============================================
  zom_classic: {
    id:"zom_classic", side:"zom", name:"末日尸潮",
    desc:"原教旨主义丧尸。均衡：普通尸海 + 巨怪 + 投石机，经典还原。",
    color:"#5a1a1a", accent:"#7fa03a",
    baseIncome: 6.0, baseCap: 16,
    baseRegen: 3.5,                  // 均衡型
    buildings: {
      [B.HQ]:     { name:"僵尸大厦", cost:0,   cap:1,  hp:2560, effect:{} },
      [B.INCOME]: { name:"腐尸池",   cost:160, cap:6,  effect:{ income:+4 } },
      [B.POP]:    { name:"墓地",     cost:130, cap:5,  effect:{ pop:+10 } },
      [B.TECH_A]: { name:"废弃医院", cost:110, cap:1,  effect:{} },
      [B.TECH_B]: { name:"停尸间",   cost:210, cap:1,  effect:{} },
      [B.TECH_C]: { name:"病毒源",   cost:360, cap:1,  effect:{} },
    },
    units: {
      normal:  U("普通僵尸",   40,  1,  58, 13,  22,  44, 1.0, 0.5, null,      "zom_normal", { desc:"最先倒下的街坊和通勤族。他们不记得自己是谁，只记得要往有呼吸的地方走。前期主力近战，比人类杂兵更耐打，用来换线和耗枪。" }),
      flea:    U("跳蚤",       110, 1,  72, 16,  22,  66, 0.9, 0.7, B.TECH_A,  "zom_hopper", { jump:150, desc:"被病毒抽干脂肪的年轻死者。骨头轻了，便学会越过路障去咬后排。跳跃近战，切后排，身板仍不算厚。" }),
      banshee: U("女妖",       240, 2, 136, 24,  22,  72, 0.65,0.9, B.TECH_A,  "zom_banshee", { desc:"夜半巷口啼哭的女尸。尖啸让活人腿软，她自己却越冲越快。高速近战，适合撕开口子，但不要让她单独抗伤。" }),
      giant:   U("巨怪",       620, 4, 500, 55,  36,  30, 1.6, 1.3, B.TECH_B,  "zom_giant",  { splash:40, desc:"工地和码头上被堆叠感染的巨汉。他记不住名字，只记得要把挡路的东西拍扁。超高血近战，带溅射，中后期破阵核心。" }),
      cata:    U("投石僵尸",   540, 3, 200, 40,  400, 30, 2.6, 1.2, B.TECH_B,  "zom_cata",   { lobber:true, desc:"把废墟石块扛上肩的攻城尸。他站得很远，专砸人类营地。超远程投石，射速慢，用来隔岸拆家。" }),
      toxic:   U("毒气僵尸",   260, 2, 100, 18,  22,  42, 1.2, 0.9, B.TECH_B,  "zom_toxic",  { onDeath:"poison_puddle", desc:"下水道和停尸间里泡坏的尸体。被打爆后仍会留下一滩毒雾。近战自爆辅助，死了也继续恶心对手。" }),
      necro:   U("尸巫",       760, 4, 180,  0,  200, 40, 2.5, 1.6, B.TECH_C,  "support",    { anim:"zom_classic_necro", support:"heal", healAmt:22, dur:0, desc:"医院里最后一个还想治病的医者，被病毒改写成了给尸潮续命的巫。治疗辅助，自己不输出，让前排更能苟。" }),
    },
    skills: ["grave_breach","cannibal_feast","crimson_moon"],
  },

  // ============================================
  // 僵尸 · 2 · 港式怪谈（高机动 · 特殊怪）
  // ============================================
  zom_ghost: {
    id:"zom_ghost", side:"zom", name:"港式怪谈",
    desc:"暴兵流。义庄成批出货，单价低、造得快，靠鬼群密度而不是单体强度取胜。",
    color:"#4a1a4a", accent:"#e08cff",
    baseIncome: 6.2, baseCap: 24,   // 拉到暴兵流规格：最高收入 + 最高人口
    baseRegen: 3.0,
    buildings: {
      [B.HQ]:     { name:"茅山庙",    cost:0,   cap:1,  hp:2240, effect:{} },
      [B.INCOME]: { name:"金山银铺",  cost:150, cap:6,  effect:{ income:+3 } },
      [B.POP]:    { name:"义庄",     cost:100, cap:6,  effect:{ pop:+14 } },   // 大幅提升 pop
      [B.TECH_A]: { name:"油炸鬼摊", cost:95,  cap:1,  effect:{} },
      [B.TECH_B]: { name:"棺材铺",   cost:190, cap:1,  effect:{} },
      [B.TECH_C]: { name:"阴阳阵",   cost:320, cap:1,  effect:{} },
    },
    units: {
      // 暴兵流数值：造价下调 30~35%、造建时间显著缩短；单体属性同步下调 15% 左右
      hopping: U("清朝跳僵尸", 42,  1,  55, 11,  22,  56, 0.85, 0.45, null,     "zom_hopper", { anim:"zom_ghost_hopping", jump:80, desc:"义庄里没被超度完的清装尸。纸符掉了，他便一跳一跳地出门讨命。极便宜跳跃近战，堆密度、抢位强。" }),
      hungry:  U("饿鬼",       85, 1,  42, 16,  60,  82, 0.55, 0.55, B.TECH_A, "zom_ghost", { desc:"饿死在后巷的游魂。它穿过活人肩头去咬喉咙，只为填那口空。极高攻速、低血、快跑，主打骚扰暴出。" }),
      oil:     U("油炸鬼",    140, 2,  84, 18, 120,  54, 0.95, 0.7, B.TECH_A, "ranged_aoe",   { anim:"zom_ghost_oil", splash:22, desc:"油锅里翻出来的街边传说。热油还在身上滋滋响，溅到谁谁倒霉。廉价溅射，几个一起丢过去就能糊满前排。" }),
      water:   U("水鬼",      210, 2, 130, 20,  30,  55, 0.9, 0.8, B.TECH_B, "zom_toxic",    { anim:"zom_ghost_water", onDeath:"poison_puddle", desc:"维港与渠务里拖人下水的旧怨。被打碎后留下一滩黑水。堆队死亡毒场，靠人数摊费。" }),
      paper:   U("纸扎人",    260, 3, 175,  0, 220, 42, 2.4, 0.95, B.TECH_B, "support",      { anim:"zom_ghost_paper", support:"convert", dur:4.0, desc:"丧礼上没烧掉的替身。它没有自己的魂，便去借活人的。便宜转化辅助，配合暴兵抢关键目标。" }),
      fox:     U("狐仙",      480, 4, 220, 36, 180,  56, 1.3, 1.15, B.TECH_C, "zom_banshee", { anim:"zom_ghost_fox", desc:"山上庙里被供着、也被得罪过的精怪。人间乱了，她下来讨一笔旧账。高移速收割手，可以多点开花。" }),
      mirror:  U("镜中人",    680, 4, 320, 45,  36,  46, 1.1, 1.3, B.TECH_C, "zom_giant",   { anim:"zom_ghost_mirror", splash:26, desc:"当铺铜镜里走出来的影子。它长得像你，却要把你拍进镜子。高血溅射坦克，怪谈的终盘门神——但现在两个也不算难出。" }),
    },
    skills: ["ghostly_night_parade","soul_tithe","mirror_maze"],
  },

  // ============================================
  // 僵尸 · 3 · 病毒实验体（高科技 AOE）
  // ============================================
  zom_bio: {
    id:"zom_bio", side:"zom", name:"病毒实验体",
    desc:"高科技丧尸。前期弱，一旦上 T2 全场溅射毒气，团战无敌。",
    color:"#204a2a", accent:"#66ff88",
    baseIncome: 5.2, baseCap: 14,
    baseRegen: 4.5,                  // 前期弱，回血偏快
    buildings: {
      [B.HQ]:     { name:"生化研究所", cost:0,   cap:1,  hp:2500, effect:{} },
      [B.INCOME]: { name:"病株农场",   cost:165, cap:6,  effect:{ income:+4 } },
      [B.POP]:    { name:"培养舱",    cost:130, cap:5,  effect:{ pop:+9 } },
      [B.TECH_A]: { name:"实验大楼",  cost:110, cap:1,  effect:{} },
      [B.TECH_B]: { name:"孵化室",    cost:220, cap:1,  effect:{} },
      [B.TECH_C]: { name:"母体核心",  cost:380, cap:1,  effect:{} },
    },
    units: {
      infected: U("感染者",    45,  1,  60, 13,  22,  46, 0.95,0.55, null,      "zom_normal", { anim:"zom_bio_infected", desc:"实验室第一批没来得及隔离的护工和受试者。他们还穿着病号服往外爬。前期近战，血比旧版更够，用来把生化拖过弱势期。" }),
      spitter:  U("酸液喷射者",200, 2, 110, 25,  180, 46, 1.25,0.9, B.TECH_A,  "ranged_aoe",  { anim:"zom_bio_spitter", splash:32, desc:"喉管被改造成喷管的实验体。它不再说话，只会把组织液吐到人群里。中远程溅射，生化最早的清场手。" }),
      mutant:   U("变异体",    380, 3, 240, 38,  32,  42, 0.95,1.05, B.TECH_A,  "zom_giant", { anim:"zom_bio_mutant", desc:"激素和骨刺一起疯长的失败样品。它冲在最前，给喷射者挡子弹。中期近战坦克，成型前的肉盾。" }),
      bomber:   U("爆膛者",    260, 2,  80,  0,  22,  70, 0.5, 0.8, B.TECH_B,  "zom_toxic",   { anim:"zom_bio_bomber", onDeath:"explode", explodeDmg:120, explodeR:80, desc:"腹腔被填满不稳定培养液的行走炸弹。活着几乎不打，死时炸开一片。自杀式近战，专砸人类堆兵。" }),
      parasite: U("寄生虫",    165, 1,  60, 16,  22,  90, 0.6, 0.7, B.TECH_B,  "zom_hopper",  { anim:"zom_bio_parasite", jump:120, desc:"从培养舱逃出来的小型宿主。它贴地滑行，专找没有盾的后排。高跳近战，用来打断人类站桩。" }),
      radiator: U("辐射者",    540, 3, 260, 42,  260, 32, 1.8, 1.2, B.TECH_B,  "ranged_heavy",{ anim:"zom_bio_radiator", splash:22, desc:"被辐照到发光的研究人员。他记得实验步骤，却只用来把射线扫向旧同事。远程溅射，团战核心。" }),
      mother:   U("母体",     1400, 6, 700, 60,  32,  22, 1.5, 2.0, B.TECH_C,  "zom_giant",   { anim:"zom_bio_mother", splash:50, aura:"heal", auraR:120, auraAmt:8, desc:"整座研究所最后活着的源头。她走得很慢，却能让身边的实验体不断长肉。终盘坦克加光环治疗，打掉她才能拆掉整条尸链。" }),
    },
    skills: ["engineered_plague","forced_evolution","reactor_overload"],
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
