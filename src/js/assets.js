/* assets.js — 图片预加载
   -----------------------------------------------------------------
   一次性预热全部 PNG，之后 render.js 只用 window.IMG[key] 拿到 HTMLImageElement。
*/

const IMG = {};

const IMG_LIST = [
  // 背景板（16:9 全屏 parallax）
  "bg_finance", "bg_slum", "bg_police",
  "bg_zomclassic", "bg_zomghost", "bg_zombio",
  // 6 座基地建筑
  "base_finance", "base_slum", "base_police",
  "base_zomclassic", "base_zomghost", "base_zombio",
  // 香港单位（按 arch 分）
  "hk_peasant", "hk_tank", "hk_runner",
  "hk_ranged_light", "hk_ranged_aoe", "hk_ranged_heavy",
  "hk_caster",
  // 僵尸单位
  "zom_normal", "zom_hop", "zom_lady",
  "zom_giant", "zom_cata", "zom_toxic", "zom_ghost",
  // 环境装饰
  "env_debris", "env_car", "env_lamp", "env_trash",
];

function loadAssets(onProgress) {
  let loaded = 0;
  const total = IMG_LIST.length;
  return Promise.all(IMG_LIST.map(name => new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      IMG[name] = img;
      loaded++;
      if (onProgress) onProgress(loaded, total, name);
      resolve();
    };
    img.onerror = () => {
      console.warn("[assets] missing image:", name);
      loaded++;
      if (onProgress) onProgress(loaded, total, name);
      resolve();
    };
    img.src = "img/" + name + ".png?v=1";
  })));
}

window.IMG = IMG;
window.loadAssets = loadAssets;
