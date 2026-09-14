/* ui-bg.js — 非战斗界面：随机战场图 + 放大后从左往右缓扫，扫完淡入下一张 */

const UiBg = (function () {
  const POOL = [
    "img/BG/6f9316fa9c59276bbf2f908323e0e536_compress.jpg",
    "img/BG/df59731ec852f7a37bd76905b15f9b00_compress.jpg",
    "img/BG/f37df6017faf961122bf966c6c789b9b_compress.jpg",
    "img/BG/fac2cafdec077dcc5fa63656ed103e13_compress.jpg",
  ];
  const PAN_MS = 26000;
  const FADE_MS = 1400;

  let root, layerA, layerB;
  let frontIsA = true;
  let lastIdx = -1;
  let timer = null;
  let running = false;
  let combat = false;

  function pick() {
    let i = Math.floor(Math.random() * POOL.length);
    if (POOL.length > 1 && i === lastIdx) i = (i + 1) % POOL.length;
    lastIdx = i;
    return POOL[i];
  }

  function preload(src) {
    return new Promise((resolve) => {
      const im = new Image();
      im.onload = im.onerror = () => resolve(src);
      im.src = src;
    });
  }

  function applyPan(el, src) {
    el.style.backgroundImage = 'url("' + src + '")';
    el.classList.remove("is-pan");
    void el.offsetWidth;
    el.classList.add("is-pan");
  }

  function front() { return frontIsA ? layerA : layerB; }
  function back() { return frontIsA ? layerB : layerA; }

  async function swap() {
    if (!running || combat) return;
    const incoming = back();
    const outgoing = front();
    const src = pick();
    await preload(src);
    if (!running || combat) return;
    applyPan(incoming, src);
    incoming.classList.add("is-front");
    outgoing.classList.remove("is-front");
    frontIsA = !frontIsA;
    schedule();
  }

  function schedule() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { swap(); }, PAN_MS);
  }

  function stopTimer() {
    if (timer) { clearTimeout(timer); timer = null; }
  }

  async function start() {
    if (!root || combat) return;
    root.classList.remove("hidden");
    if (running) {
      schedule();
      return;
    }
    running = true;
    const src = pick();
    await preload(src);
    if (!running || combat) return;
    applyPan(layerA, src);
    layerA.classList.add("is-front");
    layerB.classList.remove("is-front");
    frontIsA = true;
    schedule();
  }

  function setCombat(on) {
    combat = !!on;
    if (!root) return;
    if (combat) {
      root.classList.add("hidden");
      running = false;
      stopTimer();
    } else {
      start();
    }
  }

  function init() {
    root = document.getElementById("ui-bg");
    layerA = document.getElementById("ui-bg-a");
    layerB = document.getElementById("ui-bg-b");
    if (!root || !layerA || !layerB) return;
    POOL.forEach((src) => { const im = new Image(); im.src = src; });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) stopTimer();
      else if (running && !combat) schedule();
    });
    start();
  }

  return { init, setCombat };
})();
