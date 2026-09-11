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
  // 背景板（16:9 全屏 parallax）
  "bg_finance", "bg_slum", "bg_police",
  "bg_zomclassic", "bg_zomghost", "bg_zombio",
  // 6 座基地建筑
  "base_finance", "base_slum", "base_police",
  "base_zomclassic", "base_zomghost", "base_zombio",
  // 香港单位（按 arch 分，作为菜单/卡面兜底）
  "hk_peasant", "hk_tank", "hk_runner",
  "hk_ranged_light", "hk_ranged_aoe", "hk_ranged_heavy",
  "hk_caster",
  // 僵尸单位
  "zom_normal", "zom_hop", "zom_lady",
  "zom_giant", "zom_cata", "zom_toxic", "zom_ghost",
  // 环境装饰
  "env_debris", "env_car", "env_lamp", "env_trash",
];

// 帧动画 sprite strip：所有 sheet 都是「1 行 × N 列」水平条
//   fw/fh 加载后自动算出：fw = img.width / frames, fh = img.height
const ANIM_LIST = [
  // Soldier（100×100 / frame，Tiny RPG）
  { key: "soldier_idle",  path: "img/anim/soldier_idle.png",  frames: 6  },
  { key: "soldier_walk",  path: "img/anim/soldier_walk.png",  frames: 8  },
  { key: "soldier_atk1",  path: "img/anim/soldier_atk1.png",  frames: 6  },
  { key: "soldier_atk2",  path: "img/anim/soldier_atk2.png",  frames: 6  },
  { key: "soldier_atk3",  path: "img/anim/soldier_atk3.png",  frames: 6  },
  { key: "soldier_hurt",  path: "img/anim/soldier_hurt.png",  frames: 4  },
  { key: "soldier_death", path: "img/anim/soldier_death.png", frames: 4  },
  // Orc（100×100 / frame）
  { key: "orc_idle",  path: "img/anim/orc_idle.png",  frames: 6  },
  { key: "orc_walk",  path: "img/anim/orc_walk.png",  frames: 8  },
  { key: "orc_atk1",  path: "img/anim/orc_atk1.png",  frames: 6  },
  { key: "orc_atk2",  path: "img/anim/orc_atk2.png",  frames: 6  },
  { key: "orc_hurt",  path: "img/anim/orc_hurt.png",  frames: 4  },
  { key: "orc_death", path: "img/anim/orc_death.png", frames: 4  },
  // Zombie_Small（PostyApocalypse）
  { key: "zsmall_idle",  path: "img/anim/zsmall_idle.png",  frames: 6  },
  { key: "zsmall_walk",  path: "img/anim/zsmall_walk.png",  frames: 6  },
  { key: "zsmall_atk",   path: "img/anim/zsmall_atk.png",   frames: 4  },
  { key: "zsmall_death", path: "img/anim/zsmall_death.png", frames: 6  },
  // Zombie_Big（大只僵尸，pressure）
  { key: "zbig_idle",    path: "img/anim/zbig_idle.png",    frames: 6  },
  { key: "zbig_walk",    path: "img/anim/zbig_walk.png",    frames: 8  },
  { key: "zbig_atk",     path: "img/anim/zbig_atk.png",     frames: 8  },
  { key: "zbig_death",   path: "img/anim/zbig_death.png",   frames: 7  },
  // Zombie_Axe（甩斧头，投射攻击）
  { key: "zaxe_idle",    path: "img/anim/zaxe_idle.png",    frames: 6  },
  { key: "zaxe_walk",    path: "img/anim/zaxe_walk.png",    frames: 8  },
  { key: "zaxe_atk",     path: "img/anim/zaxe_atk.png",     frames: 7  },
  { key: "zaxe_death",   path: "img/anim/zaxe_death.png",   frames: 6  },
];

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
    img.src = spec.path + "?v=1";
  });

  return Promise.all([
    ...IMG_LIST.map(loadStatic),
    ...ANIM_LIST.map(loadAnim),
  ]);
}

window.IMG = IMG;
window.IMG_ANIM = IMG_ANIM;
window.loadAssets = loadAssets;
