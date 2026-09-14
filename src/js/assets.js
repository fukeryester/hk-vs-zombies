/* assets.js — 图片预加载
   -----------------------------------------------------------------
   一次性预热全部 PNG，之后 render.js 通过：
     window.IMG[key]        → HTMLImageElement (静态图)
     window.IMG_ANIM[key]   → { img, fw, fh, frames } (帧动画 sprite strip)
   拿到贴图。
*/

const IMG = {};
const IMG_ANIM = {};

const IMG_LIST = [
  // 背景板
  "bg_finance", "bg_slum", "bg_police",
  "bg_zomclassic", "bg_zomghost", "bg_zombio",
  // 6 座基地建筑
  "base_finance", "base_slum", "base_police",
  "base_zomclassic", "base_zomghost", "base_zombio",
  // 可建建筑贴图
  "build_hk_income", "build_hk_pop", "build_hk_tech_a", "build_hk_tech_b", "build_hk_tech_c",
  "build_zom_income", "build_zom_pop", "build_zom_tech_a", "build_zom_tech_b", "build_zom_tech_c",
  // 香港单位静态图（兜底/卡面）
  "hk_peasant", "hk_tank", "hk_runner",
  "hk_ranged_light", "hk_ranged_aoe", "hk_ranged_heavy", "hk_ranged_ceo",
  "hk_caster",
  // 僵尸单位静态图（兜底/卡面）
  "zom_normal", "zom_hop", "zom_lady",
  "zom_giant", "zom_cata", "zom_toxic", "zom_ghost",
  // 环境装饰
  "env_debris", "env_car", "env_lamp", "env_trash",
];

// 每个兵种都有独立 walk / attack 两套 6 帧动画。
const ANIM_ARCHES = [
  "hk_melee_cheap", "hk_melee_tank", "hk_melee_fast",
  "hk_ranged_light", "hk_ranged_aoe", "hk_ranged_heavy", "hk_ranged_ceo", "hk_support",
  "zom_normal", "zom_hopper", "zom_banshee", "zom_giant",
  "zom_cata", "zom_toxic", "zom_ghost",
  // 单位专属动画（不再按 arch 复用）
  "hk_slum_kungfu", "hk_slum_fishmonger", "hk_slum_chef",
  "hk_slum_rickshaw", "hk_slum_dailo", "hk_slum_mahjong",
  "hk_police_constable", "hk_police_sniper", "hk_police_swat",
  "hk_police_truck", "hk_police_negotiator", "hk_police_hero",
  "zom_classic_necro",
  "zom_ghost_hopping", "zom_ghost_oil", "zom_ghost_water",
  "zom_ghost_paper", "zom_ghost_fox", "zom_ghost_mirror",
  "zom_bio_infected", "zom_bio_spitter", "zom_bio_mutant",
  "zom_bio_bomber", "zom_bio_parasite", "zom_bio_radiator",
  "zom_bio_mother",
];
const ANIM_LIST = ANIM_ARCHES.flatMap(arch =>
  ["walk", "attack"].map(action => ({
    key: `${arch}_${action}`,
    path: `img/anim/${arch}_${action}.png`,
    frames: 6,
  }))
);

function loadAssets(onProgress) {
  let loaded = 0;
  const total = IMG_LIST.length + ANIM_LIST.length;
  const tick = (name) => {
    loaded++;
    if (onProgress) onProgress(loaded, total, name);
  };

  const loadStatic = (name) => new Promise(resolve => {
    const img = new Image();
    img.onload  = () => { IMG[name] = img; tick(name); resolve(); };
    img.onerror = () => { console.warn("[assets] missing image:", name); tick(name); resolve(); };
    img.src = "img/" + name + ".png?v=4";
  });

  const loadAnim = (spec) => new Promise(resolve => {
    const img = new Image();
    img.onload  = () => {
      const fw = Math.round(img.width / spec.frames);
      const fh = img.height;
      IMG_ANIM[spec.key] = { img, fw, fh, frames: spec.frames };
      tick(spec.key);
      resolve();
    };
    img.onerror = () => { console.warn("[assets] missing anim:", spec.path); tick(spec.key); resolve(); };
    img.src = spec.path + "?v=7";
  });

  return Promise.all([
    ...IMG_LIST.map(loadStatic),
    ...ANIM_LIST.map(loadAnim),
  ]);
}

window.IMG = IMG;
window.IMG_ANIM = IMG_ANIM;
window.loadAssets = loadAssets;
