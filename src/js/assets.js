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
  // 香港单位静态图（兜底/卡面）
  "hk_peasant", "hk_tank", "hk_runner",
  "hk_ranged_light", "hk_ranged_aoe", "hk_ranged_heavy",
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
  "hk_ranged_light", "hk_ranged_aoe", "hk_ranged_heavy", "hk_support",
  "zom_normal", "zom_hopper", "zom_banshee", "zom_giant",
  "zom_cata", "zom_toxic", "zom_ghost",
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
    img.src = "img/" + name + ".png?v=2";
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
    img.src = spec.path + "?v=4";
  });

  return Promise.all([
    ...IMG_LIST.map(loadStatic),
    ...ANIM_LIST.map(loadAnim),
  ]);
}

window.IMG = IMG;
window.IMG_ANIM = IMG_ANIM;
window.loadAssets = loadAssets;
