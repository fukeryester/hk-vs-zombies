/* audio.js — 香港大战僵尸的 Web Audio 程序化音效
   ---------------------------------------------------------------
   全部音效在运行时合成，零下载。挂在 window.SFX 上：
     SFX.play("rifle")     - 播放一次指定音色
     SFX.tick()            - 帧循环开头调用，重置每帧节流计数
     SFX.setEnabled(false) - 静音（写 localStorage 记住）
     SFX.setVolume(0.6)    - 主音量 [0,1]
     SFX.resume()          - 用户首次点击后触发以解锁 AudioContext
     SFX.diff(state)       - 传入当前帧状态，与上一帧对比后合成事件音
*/
(function () {
  const KEY_EN = "hkvsz_sfx_on";
  const KEY_VOL = "hkvsz_sfx_vol";
  const MAX_PER_FRAME = 12; // 单帧上限，防止大团战一秒 300 声

  let ctx = null;
  let master = null;
  let sfxCountThisFrame = 0;
  let enabled = (function () {
    try { return localStorage.getItem(KEY_EN) !== "0"; } catch (e) { return true; }
  })();
  let volume = (function () {
    try { const v = Number(localStorage.getItem(KEY_VOL)); return isFinite(v) && v >= 0 ? v : 0.55; } catch (e) { return 0.55; }
  })();

  function ensureCtx() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = volume;
      master.connect(ctx.destination);
    }
    if (ctx.state === "suspended") { try { ctx.resume(); } catch (e) {} }
    return ctx;
  }

  // ---------- 基元合成 ----------
  function makeNoise(c, dur) {
    const n = Math.max(1, Math.round(c.sampleRate * dur));
    const buf = c.createBuffer(1, n, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource();
    src.buffer = buf;
    return src;
  }
  function envGain(c, vol, dur) {
    const g = c.createGain();
    const t0 = c.currentTime;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0005, t0 + Math.max(0.02, dur));
    return g;
  }
  function tone(c, out, opt) {
    const t0 = c.currentTime;
    const type = opt.type || "sine";
    const f0 = opt.f0; const f1 = opt.f1;
    const dur = opt.dur != null ? opt.dur : 0.2;
    const vol = opt.vol != null ? opt.vol : 0.4;
    const osc = c.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t0);
    if (f1 != null) osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    const g = envGain(c, vol, dur);
    let last = osc;
    if (opt.filter) {
      const bq = c.createBiquadFilter();
      bq.type = opt.filter;
      bq.frequency.value = opt.filterFreq || 2000;
      if (opt.q != null) bq.Q.value = opt.q;
      osc.connect(bq); bq.connect(g);
    } else {
      osc.connect(g);
    }
    g.connect(out);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }
  function noise(c, out, opt) {
    const t0 = c.currentTime;
    const dur = opt.dur != null ? opt.dur : 0.15;
    const vol = opt.vol != null ? opt.vol : 0.35;
    const n = makeNoise(c, dur + 0.02);
    const bq = c.createBiquadFilter();
    bq.type = opt.filter || "bandpass";
    bq.frequency.setValueAtTime(opt.f0 != null ? opt.f0 : 1500, t0);
    if (opt.f1 != null) bq.frequency.linearRampToValueAtTime(opt.f1, t0 + dur);
    if (opt.q != null) bq.Q.value = opt.q;
    const g = envGain(c, vol, dur);
    n.connect(bq); bq.connect(g); g.connect(out);
    n.start(t0);
  }

  // ---------- 音色表 ----------
  const VOICES = {
    // ----- 武器/攻击（按 arch → weapon 映射） -----
    shovel: (c, o) => { // 铁铲挥砸
      tone(c, o, { type: "sine", f0: 220, f1: 70, dur: 0.16, vol: 0.42 });
      noise(c, o, { filter: "lowpass", f0: 600, dur: 0.06, vol: 0.2 });
    },
    fist: (c, o) => { // 拳头/铁棍砸
      tone(c, o, { type: "sine", f0: 160, f1: 55, dur: 0.14, vol: 0.44 });
      noise(c, o, { filter: "lowpass", f0: 400, dur: 0.05, vol: 0.22 });
    },
    knife: (c, o) => { // 小刀挥砍
      noise(c, o, { filter: "highpass", f0: 3200, dur: 0.09, vol: 0.32 });
      tone(c, o, { type: "triangle", f0: 700, f1: 300, dur: 0.05, vol: 0.15 });
    },
    rifle: (c, o) => { // 手枪 / 步枪
      noise(c, o, { filter: "bandpass", f0: 1500, q: 4, dur: 0.06, vol: 0.5 });
      tone(c, o, { type: "square", f0: 110, f1: 40, dur: 0.08, vol: 0.32 });
    },
    bottle: (c, o) => { // 燃烧瓶/热油泼溅
      noise(c, o, { filter: "highpass", f0: 1600, dur: 0.32, vol: 0.24 });
      tone(c, o, { type: "sawtooth", f0: 500, f1: 90, dur: 0.28, vol: 0.14 });
    },
    machinegun: (c, o) => { // 连发
      for (let i = 0; i < 3; i++) {
        setTimeout(() => {
          const cc = ensureCtx(); if (!cc) return;
          noise(cc, master, { filter: "bandpass", f0: 1400, q: 3.5, dur: 0.04, vol: 0.35 });
          tone(cc, master, { type: "square", f0: 130, f1: 50, dur: 0.05, vol: 0.22 });
        }, i * 55);
      }
    },
    briefcase: (c, o) => { // CEO 甩公文包
      tone(c, o, { type: "square", f0: 900, f1: 320, dur: 0.09, vol: 0.28 });
      tone(c, o, { type: "sine", f0: 1400, f1: 500, dur: 0.06, vol: 0.16 });
    },
    charm: (c, o) => { // 符咒 / 转化辅助
      tone(c, o, { type: "triangle", f0: 1320, dur: 0.28, vol: 0.22 });
      tone(c, o, { type: "triangle", f0: 1760, dur: 0.3, vol: 0.14 });
      tone(c, o, { type: "sine", f0: 660, dur: 0.28, vol: 0.1 });
    },
    claws: (c, o) => { // 僵尸抓挠
      tone(c, o, { type: "sawtooth", f0: 340, f1: 110, dur: 0.18, vol: 0.32, filter: "lowpass", filterFreq: 1500 });
      noise(c, o, { filter: "bandpass", f0: 900, q: 2, dur: 0.1, vol: 0.15 });
    },
    nails: (c, o) => { // 女妖利爪，尖啸感
      tone(c, o, { type: "sawtooth", f0: 900, f1: 1700, dur: 0.18, vol: 0.24, filter: "highpass", filterFreq: 800 });
      tone(c, o, { type: "square", f0: 620, f1: 380, dur: 0.12, vol: 0.1 });
    },
    smash: (c, o) => { // 巨怪重击
      tone(c, o, { type: "sine", f0: 90, f1: 30, dur: 0.42, vol: 0.6 });
      noise(c, o, { filter: "lowpass", f0: 500, dur: 0.28, vol: 0.35 });
    },
    catapult: (c, o) => { // 投石抛掷
      noise(c, o, { filter: "bandpass", f0: 300, f1: 1400, dur: 0.4, vol: 0.28 });
      tone(c, o, { type: "sine", f0: 220, f1: 90, dur: 0.32, vol: 0.24 });
    },

    // ----- 基地事件 -----
    base_shot: (c, o) => { // 基地远程炮火
      tone(c, o, { type: "sine", f0: 130, f1: 35, dur: 0.5, vol: 0.7 });
      noise(c, o, { filter: "lowpass", f0: 380, dur: 0.16, vol: 0.5 });
      tone(c, o, { type: "square", f0: 60, f1: 25, dur: 0.4, vol: 0.25 });
    },
    base_hit: (c, o) => { // 基地被击中：闷雷
      tone(c, o, { type: "sine", f0: 80, f1: 28, dur: 0.35, vol: 0.55 });
      noise(c, o, { filter: "lowpass", f0: 450, dur: 0.14, vol: 0.32 });
    },
    base_destroyed: (c, o) => { // 基地被拆：塌方
      tone(c, o, { type: "sine", f0: 55, f1: 20, dur: 1.5, vol: 0.85 });
      // 长噪声瀑布
      const t0 = c.currentTime;
      const n = makeNoise(c, 1.3);
      const bq = c.createBiquadFilter();
      bq.type = "lowpass";
      bq.frequency.setValueAtTime(2400, t0);
      bq.frequency.exponentialRampToValueAtTime(120, t0 + 1.25);
      const g = c.createGain();
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(0.75, t0 + 0.03);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + 1.3);
      n.connect(bq); bq.connect(g); g.connect(o);
      n.start(t0);
      // 铜锣式尾音
      setTimeout(() => { const cc = ensureCtx(); if (cc) tone(cc, master, { type: "triangle", f0: 220, f1: 70, dur: 1.2, vol: 0.35 }); }, 100);
    },

    // ----- 出兵 / 大招 -----
    unit_ready_hk: (c, o) => { // 港方出兵：清脆两音
      tone(c, o, { type: "triangle", f0: 880, dur: 0.09, vol: 0.24 });
      setTimeout(() => { const cc = ensureCtx(); if (cc) tone(cc, master, { type: "triangle", f0: 1318, dur: 0.14, vol: 0.26 }); }, 90);
    },
    unit_ready_zom: (c, o) => { // 僵尸出兵：低吼
      tone(c, o, { type: "sawtooth", f0: 220, f1: 90, dur: 0.28, vol: 0.28, filter: "lowpass", filterFreq: 700 });
      noise(c, o, { filter: "lowpass", f0: 300, dur: 0.16, vol: 0.16 });
    },
    build_done: (c, o) => { // 建筑造好
      tone(c, o, { type: "triangle", f0: 523, dur: 0.12, vol: 0.28 });
      setTimeout(() => { const cc = ensureCtx(); if (cc) tone(cc, master, { type: "triangle", f0: 659, dur: 0.12, vol: 0.28 }); }, 100);
      setTimeout(() => { const cc = ensureCtx(); if (cc) tone(cc, master, { type: "triangle", f0: 784, dur: 0.18, vol: 0.32 }); }, 200);
    },
    skill_hk: (c, o) => { // 港方大招：亮扫弦
      tone(c, o, { type: "sine", f0: 400, f1: 1600, dur: 0.65, vol: 0.42 });
      tone(c, o, { type: "triangle", f0: 800, f1: 2400, dur: 0.55, vol: 0.22 });
      noise(c, o, { filter: "highpass", f0: 2000, dur: 0.5, vol: 0.14 });
    },
    skill_zom: (c, o) => { // 尸方大招：低沉吟啸
      tone(c, o, { type: "sawtooth", f0: 80, f1: 260, dur: 0.7, vol: 0.42, filter: "lowpass", filterFreq: 900 });
      tone(c, o, { type: "sawtooth", f0: 130, f1: 55, dur: 1.0, vol: 0.28 });
      noise(c, o, { filter: "lowpass", f0: 400, dur: 0.55, vol: 0.16 });
    },
    explode: (c, o) => { // 爆炸 / fire_burst
      noise(c, o, { filter: "lowpass", f0: 1200, dur: 0.5, vol: 0.55 });
      tone(c, o, { type: "sine", f0: 130, f1: 35, dur: 0.45, vol: 0.5 });
    },
    poison: (c, o) => { // 毒气 / 酸液
      noise(c, o, { filter: "bandpass", f0: 700, f1: 300, dur: 0.4, vol: 0.24 });
    },

    // ----- UI -----
    click: (c, o) => { tone(c, o, { type: "square", f0: 660, dur: 0.04, vol: 0.18 }); },
    error: (c, o) => {
      tone(c, o, { type: "square", f0: 220, f1: 130, dur: 0.14, vol: 0.28 });
    },
    victory: (c, o) => {
      const notes = [523, 659, 784, 1046];
      notes.forEach((f, i) => setTimeout(() => {
        const cc = ensureCtx(); if (cc) tone(cc, master, { type: "triangle", f0: f, dur: 0.28, vol: 0.35 });
      }, i * 130));
    },
    defeat: (c, o) => {
      const notes = [523, 440, 349, 262];
      notes.forEach((f, i) => setTimeout(() => {
        const cc = ensureCtx(); if (cc) tone(cc, master, { type: "sawtooth", f0: f, dur: 0.32, vol: 0.32, filter: "lowpass", filterFreq: 900 });
      }, i * 160));
    },
  };

  // arch → weapon 音色映射（对应 civs.js 的 ARCH 表）
  const WEAPON_BY_ARCH = {
    melee_cheap: "shovel",
    melee_tank: "fist",
    melee_fast: "knife",
    ranged_light: "rifle",
    ranged_aoe: "bottle",
    ranged_heavy: "machinegun",
    ranged_ceo: "briefcase",
    support: "charm",
    zom_normal: "claws",
    zom_hopper: "claws",
    zom_banshee: "nails",
    zom_giant: "smash",
    zom_cata: "catapult",
    zom_toxic: "poison",
    zom_ghost: "claws",
  };

  // ---------- 播放接口 ----------
  function play(name) {
    if (!enabled) return;
    if (sfxCountThisFrame >= MAX_PER_FRAME) return;
    const c = ensureCtx();
    if (!c) return;
    const fn = VOICES[name];
    if (!fn) return;
    sfxCountThisFrame++;
    try { fn(c, master); } catch (e) { /* swallow */ }
  }

  function tick() { sfxCountThisFrame = 0; }

  // ---------- 状态差分（供 render tick 调用） ----------
  let _prev = null;
  const _hitCd = {};     // seat → 上次 base_hit 触发的 ms 时间戳
  const _shotCd = {};    // seat → 上次 base_shot
  const _spawnCd = { hk: 0, zom: 0 };
  let _newlyEnded = false;

  function diff(state, meSeat) {
    if (!state || !state.players) return;
    tick();
    if (!state || !enabled) return;
    const nowMs = performance && performance.now ? performance.now() : Date.now();

    // 首帧：只记录
    if (!_prev) {
      _prev = capture(state);
      return;
    }

    // 单位攻击音：atkFxTime 上升
    const prevAtk = _prev.atk;
    const prevIds = _prev.unitIds;
    for (const u of state.units) {
      const p = prevAtk[u.id] || 0;
      if ((u.atkFxTime || 0) > p + 0.001) {
        const def = getDef(u.civId, u.unitId);
        const weapon = (def && WEAPON_BY_ARCH[def.arch]) || "fist";
        play(weapon);
      }
      if (!prevIds.has(u.id)) {
        // 新出场：轻微出兵音，按阵营节流（每 300ms 至多 1 声）
        const key = u.team;
        if (nowMs - (_spawnCd[key] || 0) > 320) {
          _spawnCd[key] = nowMs;
          play(u.team === "hk" ? "unit_ready_hk" : "unit_ready_zom");
        }
      }
    }

    // 基地事件：按 seat 差分
    for (const p of state.players) {
      const prev = _prev.baseHp[p.seat];
      if (prev != null) {
        if (p.baseHp < prev - 1) {
          // 被击中：120ms 节流
          if (nowMs - (_hitCd[p.seat] || 0) > 120) {
            _hitCd[p.seat] = nowMs;
            play("base_hit");
          }
        }
        if (p.baseHp <= 0 && prev > 0) {
          // 拆家音只播一次（结束时的 defeat/victory 也会响）
          play("base_destroyed");
        }
      }
      // 能量被大量消耗 → 判定放大招
      const pe = _prev.energy[p.seat];
      if (pe != null && p.energy < pe - 400) {
        play(p.team === "hk" ? "skill_hk" : "skill_zom");
      }
    }

    // 基地远程炮火：新的 base_bullet 弹丸
    const prevProj = _prev.projIds;
    for (const pr of (state.projectiles || [])) {
      if (pr.kind === "base_bullet" && !prevProj.has(pr.id)) {
        const key = "shot_" + pr.seat;
        if (nowMs - (_shotCd[key] || 0) > 60) {
          _shotCd[key] = nowMs;
          play("base_shot");
        }
      }
    }

    // 新特效：爆炸 / 火团 / 毒
    const prevEff = _prev.effIds;
    for (const e of (state.effects || [])) {
      if (prevEff.has(e.id)) continue;
      if (e.kind === "explode" || e.kind === "fire_burst") play("explode");
      else if (e.kind === "poison_puddle") play("poison");
    }

    // 建筑数变化 → 提示音
    for (const p of state.players) {
      const prev = _prev.builtCount[p.seat] || 0;
      const cur = Object.values(p.built || {}).reduce((a, b) => a + b, 0);
      if (cur > prev && p.seat === meSeat) play("build_done");
    }

    // 结束音
    if (state.over && !_newlyEnded) {
      _newlyEnded = true;
      const myTeam = state.players[meSeat] && state.players[meSeat].team;
      if (myTeam && state.winner) {
        play(state.winner === myTeam ? "victory" : "defeat");
      }
    }

    _prev = capture(state);
  }

  function capture(state) {
    const atk = {};
    const unitIds = new Set();
    for (const u of (state.units || [])) {
      atk[u.id] = u.atkFxTime || 0;
      unitIds.add(u.id);
    }
    const projIds = new Set();
    for (const pr of (state.projectiles || [])) projIds.add(pr.id);
    const effIds = new Set();
    for (const e of (state.effects || [])) effIds.add(e.id);
    const baseHp = {}; const energy = {}; const builtCount = {};
    for (const p of state.players) {
      baseHp[p.seat] = p.baseHp;
      energy[p.seat] = p.energy;
      builtCount[p.seat] = Object.values(p.built || {}).reduce((a, b) => a + b, 0);
    }
    return { atk, unitIds, projIds, effIds, baseHp, energy, builtCount };
  }

  function getDef(civId, unitId) {
    const civ = window.CIVS && window.CIVS[civId];
    if (!civ) return null;
    return civ.units[unitId] || null;
  }

  // ---------- 首次交互解锁 ----------
  function unlock() {
    ensureCtx();
    document.removeEventListener("pointerdown", unlock, true);
    document.removeEventListener("keydown", unlock, true);
  }
  document.addEventListener("pointerdown", unlock, true);
  document.addEventListener("keydown", unlock, true);

  // ---------- 全局点击音（按钮） ----------
  document.addEventListener("click", (e) => {
    if (!enabled) return;
    const t = e.target;
    if (!t) return;
    if (t.matches && (t.matches("button") || t.closest("button"))) {
      play("click");
    }
  }, true);

  // ---------- 音量/静音 UI（右上角） ----------
  function mountUi() {
    if (document.getElementById("sfx-panel")) return;
    const box = document.createElement("div");
    box.id = "sfx-panel";
    box.innerHTML =
      '<button id="sfx-toggle" title="音效开关">' + (enabled ? "🔊" : "🔇") + '</button>' +
      '<input id="sfx-vol" type="range" min="0" max="100" step="1" value="' + Math.round(volume * 100) + '" title="音量">';
    box.style.cssText = [
      "position:fixed", "top:8px", "right:8px", "z-index:9999",
      "display:flex", "align-items:center", "gap:6px",
      "padding:4px 6px", "background:rgba(0,0,0,.4)",
      "border:1px solid rgba(255,255,255,.15)", "border-radius:8px",
      "font-family:system-ui, sans-serif",
    ].join(";");
    document.body.appendChild(box);
    const btn = box.querySelector("#sfx-toggle");
    const rng = box.querySelector("#sfx-vol");
    btn.style.cssText = "background:transparent;border:0;color:#fff;font-size:18px;cursor:pointer;padding:2px 4px;";
    rng.style.cssText = "width:80px;accent-color:#e08cff;cursor:pointer;";
    btn.onclick = () => {
      setEnabled(!enabled);
      btn.textContent = enabled ? "🔊" : "🔇";
      if (enabled) play("click");
    };
    rng.oninput = () => {
      setVolume(Number(rng.value) / 100);
    };
  }
  function setEnabled(v) {
    enabled = !!v;
    try { localStorage.setItem(KEY_EN, v ? "1" : "0"); } catch (e) {}
  }
  function setVolume(v) {
    volume = Math.max(0, Math.min(1, v));
    if (master) master.gain.value = volume;
    try { localStorage.setItem(KEY_VOL, String(volume)); } catch (e) {}
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mountUi);
  } else {
    mountUi();
  }

  function reset() {
    _prev = null;
    _newlyEnded = false;
  }

  window.SFX = {
    play, tick, diff, reset,
    resume: ensureCtx,
    isEnabled: () => enabled,
    setEnabled, setVolume,
    getVolume: () => volume,
  };

  // 旧代码兼容：main.js / stats.js 仍有 Audio2.xxx 调用
  window.Audio2 = {
    spawn() { play("unit_ready_hk"); },
    build() { play("build_done"); },
    skill() { play("skill_hk"); },
    win() { play("victory"); },
    lose() { play("defeat"); },
    energy_full() { play("click"); },
    resume: ensureCtx,
    play,
  };
})();
