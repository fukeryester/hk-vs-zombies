/* hud.js — 底部玩家面板（每玩家一个）+ 顶部血条 + 结算浮层 */

const HUD = (function () {

  function renderTop(state) {
    const hkP = state.hp.hk / state.hpMax.hk;
    const zomP = state.hp.zom / state.hpMax.zom;
    const $hkFill = document.querySelector(".hp-hk .hp-fg");
    const $zomFill = document.querySelector(".hp-zom .hp-fg");
    const $hkVal = document.querySelector(".hp-hk .hp-value");
    const $zomVal = document.querySelector(".hp-zom .hp-value");
    if ($hkFill) $hkFill.style.width = Math.max(0, hkP * 100) + "%";
    if ($zomFill) $zomFill.style.width = Math.max(0, zomP * 100) + "%";
    if ($hkVal) $hkVal.textContent = `${Math.max(0,Math.round(state.hp.hk))} / ${state.hpMax.hk}`;
    if ($zomVal) $zomVal.textContent = `${Math.max(0,Math.round(state.hp.zom))} / ${state.hpMax.zom}`;
    document.getElementById("tick-badge").textContent = `t=${Math.floor(state.time)}s`;
  }

  function renderPlayerStrip(state, meSeat, dispatch) {
    const strip = document.getElementById("player-strip");
    // 只重建 DOM 一次；后续只更新数值
    if (strip._built !== state.players.length) {
      strip.innerHTML = "";
      state.players.forEach(p => {
        const civ = CIVS[p.civId];
        const panel = document.createElement("div");
        panel.className = "player-panel" + (p.seat === meSeat ? " me" : "");
        panel.dataset.seat = p.seat;
        panel.innerHTML = `
          <div class="pp-head">
            <span class="pp-who">${p.seat === meSeat ? "★" : ""}${escapeHtml(p.name)} <span class="pp-civ">${escapeHtml(civ.name)}</span></span>
            <span class="pp-team" style="color:${civ.accent}">${p.team === "hk" ? "🏙️" : "🧟"}</span>
          </div>
          <div class="pp-res">
            <span>💰<b class="pp-gold">0</b></span>
            <span>+<b class="pp-inc">0</b>/s</span>
            <span>👥<b class="pp-pop">0/0</b></span>
            <span class="pp-nrg">⚡<b class="pp-eng">0</b></span>
          </div>
          <div class="pp-energy"><div class="fg" style="width:0%"></div></div>
          <div class="pp-buttons"></div>
        `;
        strip.appendChild(panel);
        // 构造按钮
        const btnBox = panel.querySelector(".pp-buttons");
        // 兵种按钮（按 cost 排序）
        const units = Object.entries(civ.units).sort((a, b) => a[1].cost - b[1].cost);
        units.forEach(([uid, u], i) => {
          const b = document.createElement("button");
          b.className = "pp-btn unit";
          b.dataset.uid = uid;
          b.dataset.seat = p.seat;
          const hk = (p.seat === meSeat) && i < 9 ? `<span class="hk">[${i+1}]</span>` : "";
          b.innerHTML = `${escapeHtml(u.name)}<span class="cost">$${u.cost} · ${u.pop}人</span>${hk}`;
          if (p.seat === meSeat) b.addEventListener("click", () => dispatch({ op:"spawn", seat: p.seat, unit: uid }));
          btnBox.appendChild(b);
        });
        // 建筑按钮
        [B.INCOME, B.POP, B.TECH_A, B.TECH_B, B.TECH_C].forEach(k => {
          const def = civ.buildings[k];
          if (!def) return;
          const b = document.createElement("button");
          b.className = "pp-btn building";
          b.dataset.build = k;
          b.dataset.seat = p.seat;
          const label = ({[B.INCOME]:"➕经济",[B.POP]:"➕人口",[B.TECH_A]:"T2 科技",[B.TECH_B]:"T3 科技",[B.TECH_C]:"T4 科技"})[k] || k;
          b.innerHTML = `${label}<span class="cost">${escapeHtml(def.name)} $${def.cost}</span>`;
          if (p.seat === meSeat) b.addEventListener("click", () => dispatch({ op:"build", seat: p.seat, kind: k }));
          btnBox.appendChild(b);
        });
        // 大招按钮
        civ.skills.forEach((sid, i) => {
          const s = SKILLS[sid];
          const b = document.createElement("button");
          b.className = "pp-btn skill";
          b.dataset.skill = sid;
          b.dataset.seat = p.seat;
          const hk = (p.seat === meSeat) ? `<span class="hk">[Q/W/E]</span>` : "";
          b.innerHTML = `${escapeHtml(s.name)}<span class="cost">⚡${s.cost}</span>${hk}`;
          if (p.seat === meSeat) b.addEventListener("click", () => dispatch({ op:"skill", seat: p.seat, skill: sid }));
          btnBox.appendChild(b);
        });
      });
      strip._built = state.players.length;
    }

    // 更新数值
    state.players.forEach(p => {
      const panel = strip.querySelector(`.player-panel[data-seat="${p.seat}"]`);
      if (!panel) return;
      panel.querySelector(".pp-gold").textContent = Math.floor(p.gold);
      panel.querySelector(".pp-inc").textContent = p.income.toFixed(1);
      panel.querySelector(".pp-pop").textContent = `${p.pop}/${p.popCap}`;
      panel.querySelector(".pp-eng").textContent = Math.floor(p.energy);
      const maxEng = Math.max(...CIVS[p.civId].skills.map(s => SKILLS[s].cost));
      const nrg = panel.querySelector(".pp-energy .fg");
      if (nrg) nrg.style.width = Math.min(100, (p.energy / maxEng) * 100) + "%";

      // 按钮可用性
      const civ = CIVS[p.civId];
      panel.querySelectorAll(".pp-btn.unit").forEach(b => {
        const u = civ.units[b.dataset.uid];
        const need = u.prereq ? p.built[u.prereq] : true;
        const canPop = p.pop + u.pop <= p.popCap;
        const canGold = p.gold >= u.cost;
        b.classList.toggle("disabled", !(need && canPop && canGold));
      });
      panel.querySelectorAll(".pp-btn.building").forEach(b => {
        const k = b.dataset.build;
        const def = civ.buildings[k];
        const cur = p.built[k] || 0;
        b.classList.toggle("disabled", cur >= def.cap || p.gold < def.cost);
      });
      panel.querySelectorAll(".pp-btn.skill").forEach(b => {
        const s = SKILLS[b.dataset.skill];
        b.classList.toggle("disabled", p.energy < s.cost);
      });
    });
  }

  function showFloater(text, color = "#ffdd44", left = null) {
    const box = document.getElementById("floaters");
    const el = document.createElement("div");
    el.className = "floater";
    el.textContent = text;
    el.style.color = color;
    el.style.left = (left || (100 + Math.random() * (window.innerWidth - 200))) + "px";
    el.style.top = (100 + Math.random() * 200) + "px";
    box.appendChild(el);
    setTimeout(() => el.remove(), 1500);
  }
  function showToast(text) {
    const el = document.createElement("div");
    el.className = "toast";
    el.textContent = text;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 4200);
  }

  function escapeHtml(s) {
    return String(s || "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  }

  return { renderTop, renderPlayerStrip, showFloater, showToast, escapeHtml };
})();

window.HUD = HUD;
