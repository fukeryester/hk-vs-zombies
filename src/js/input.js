/* input.js — 键盘热键
   Q/W/E: 大招 1/2/3
   1..9:  兵种（按 cost 从低到高）
   A/S/D/F/G:  建筑（经济/人口/T2/T3/T4）
   Space:  暂停/继续
   +/-:   加/减速
*/

const Input = (function () {
  const map = {
    q: { kind:"skill", idx:0 }, w:{ kind:"skill", idx:1 }, e:{ kind:"skill", idx:2 },
    a: { kind:"build", key:"income" },
    s: { kind:"build", key:"pop" },
    d: { kind:"build", key:"tech_a" },
    f: { kind:"build", key:"tech_b" },
    g: { kind:"build", key:"tech_c" },
  };
  for (let i = 1; i <= 9; i++) map[String(i)] = { kind:"unit", idx:i - 1 };

  function bind(getContext) {
    document.addEventListener("keydown", (ev) => {
      const ctx = getContext();
      if (!ctx || ctx.paused || ctx.over || ctx.meSeat == null) return;
      const key = ev.key.toLowerCase();
      const m = map[key];
      if (!m) return;
      const p = ctx.state.players[ctx.meSeat];
      if (!p) return;
      const civ = CIVS[p.civId];
      let act = null;
      if (m.kind === "unit") {
        const units = Object.entries(civ.units).sort((a,b) => a[1].cost - b[1].cost);
        const item = units[m.idx];
        if (item) act = { op:"spawn", seat: ctx.meSeat, unit: item[0] };
      } else if (m.kind === "build") {
        act = { op:"build", seat: ctx.meSeat, kind: m.key };
      } else if (m.kind === "skill") {
        const sid = civ.skills[m.idx];
        if (sid) act = { op:"skill", seat: ctx.meSeat, skill: sid };
      }
      if (act) {
        ev.preventDefault();
        ctx.dispatch(act);
      }
    });
  }
  return { bind };
})();

window.Input = Input;
