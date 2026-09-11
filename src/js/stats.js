/* stats.js — 包装 GameHubStats
   -----------------------------------------------------------------
   platform 未接入或未登录时全部空转。
*/
const Stats = (function () {
  let gh = null;
  let ready = false;

  function connect() {
    if (!window.GameHubStats) { console.log("[stats] SDK 未加载，跳过"); return; }
    try {
      gh = GameHubStats.connect();
      gh.on("achievement", (a) => {
        try { HUD.showToast("🏆 解锁成就：" + (a.name || a.id)); Audio2.energy_full(); } catch(e){}
      });
      gh.on("ready", () => { ready = true; console.log("[stats] ready, enabled=", gh.enabled); });
      gh.on("error", (e) => console.warn("[stats] error", e));
    } catch (e) { console.warn("[stats] connect fail", e); }
  }

  function enabled() { return gh && gh.enabled; }
  function get(id) { return gh ? gh.get(id) : 0; }

  function inc(id, n = 1) { if (gh) gh.inc(id, n); }
  function set(id, v) { if (gh) gh.set(id, v); }
  function unlock(id) { if (gh) gh.unlock(id); }
  function submit(board, score) { if (gh) gh.submit(board, score); }
  function store() { if (gh) return gh.store(); return Promise.resolve(); }

  // 局末结算辅助
  function reportEndOfMatch(result, snap, meSeat, mode) {
    if (!gh) return;
    const me = snap.players[meSeat];
    if (!me) return;
    const win = (result === "win") ? 1 : 0;
    const dur = snap.over_time || snap.time;
    // 全体累计（playtime_seconds 是平台内置的，不能声明也不能写）
    inc("matches_total", 1);
    inc("kills_total", me.kills);
    inc("units_built_total", me.unitsBuilt);
    inc("buildings_built_total", me.buildingsBuilt);
    inc("gold_earned_total", Math.round(me.earned));
    // 阵营
    if (me.team === "hk") inc("matches_as_hk", 1); else inc("matches_as_zom", 1);
    if (win) {
      inc("wins_total", 1);
      if (me.team === "hk") inc("wins_as_hk", 1); else inc("wins_as_zom", 1);
    } else {
      inc("losses_total", 1);
    }
    // 文明使用统计
    inc("civ_used_" + me.civId, 1);
    if (win) inc("civ_wins_" + me.civId, 1);

    // 最佳成绩类（increment_only）
    submit("board_kills_per_match", me.kills);
    submit("board_shortest_win_sec", win ? Math.round(dur) : 999999);
    submit("board_biggest_army", me.unitsBuilt);
    // 简单综合分：kills*10 + wins*500 + earned*0.1
    const compScore = Math.round(me.kills * 10 + win * 500 + me.earned * 0.1);
    submit("board_composite", compScore);

    // 成就（进度型由 progression schema 里 bind_stat + unlock_at 自动解，完成型这里手动）
    // 完成型：
    if (win) unlock("first_win");
    if (dur <= 180 && win) unlock("blitz_win");
    if (me.kills >= 30 && win) unlock("killer_thirty");
    if (me.buildingsBuilt >= 6) unlock("six_buildings");
    // 通吃三个文明
    if (win) unlock("civ_win_" + me.civId);
    // 提交
    store();
  }

  return { connect, enabled, get, inc, set, unlock, submit, store, reportEndOfMatch };
})();

window.Stats = Stats;
