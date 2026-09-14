/* stats.js — 包装 GameHubStats
   -----------------------------------------------------------------
   platform 未接入或未登录时全部空转。
*/
const Stats = (function () {
  let gh = null;
  let ready = false;
  let readyPromise = null;

  function connect() {
    if (!window.GameHubStats) { console.log("[stats] SDK 未加载，跳过"); return; }
    try {
      gh = GameHubStats.connect();
      readyPromise = gh.ready().then(() => {
        ready = true;
        if (gh.enabled && typeof Rank !== "undefined") {
          const cloud = Math.max(0, Math.round(Number(gh.get("rank_score")) || 0));
          Rank.persistScore(cloud);
        }
        console.log("[stats] ready, enabled=", gh.enabled);
        return gh;
      });
      gh.on("achievement", (a) => {
        try { HUD.showToast("🏆 解锁成就：" + (a.name || a.id)); Audio2.energy_full(); } catch(e){}
      });
      gh.on("ready", () => { ready = true; });
      gh.on("error", (e) => console.warn("[stats] error", e));
    } catch (e) { console.warn("[stats] connect fail", e); }
  }

  function whenReady() { return readyPromise || Promise.resolve(gh); }
  function enabled() { return gh && gh.enabled; }
  function get(id) { return gh ? gh.get(id) : 0; }

  function inc(id, n = 1) { if (gh) gh.inc(id, n); }
  function set(id, v) { if (gh) gh.set(id, v); }
  function unlock(id) { if (gh) gh.unlock(id); }
  function submit(board, score, extras) { if (gh) gh.submit(board, score, extras); }
  function store() { if (gh) return gh.store(); return Promise.resolve(); }
  function board(id, limit) { return gh ? gh.board(id, limit) : Promise.resolve(null); }

  // 局末结算辅助
  function reportEndOfMatch(result, snap, meSeat, mode) {
    const me = snap && snap.players ? snap.players[meSeat] : null;
    const win = (result === "win");
    let rankResult = null;
    try {
      const pvp = typeof Rank !== "undefined" && Rank.isPvp(snap, meSeat);
      if (typeof Rank !== "undefined") rankResult = Rank.applyMatch(win, pvp);
    } catch (e) { console.warn("[rank] apply fail", e); }

    if (gh && me) try {
      const dur = snap.over_time || snap.time;
      inc("matches_total", 1);
      inc("kills_total", me.kills);
      inc("units_built_total", me.unitsBuilt);
      inc("buildings_built_total", me.buildingsBuilt);
      inc("gold_earned_total", Math.round(me.earned));
      if (me.team === "hk") inc("matches_as_hk", 1); else inc("matches_as_zom", 1);
      if (win) {
        inc("wins_total", 1);
        if (me.team === "hk") inc("wins_as_hk", 1); else inc("wins_as_zom", 1);
      } else {
        inc("losses_total", 1);
      }
      inc("civ_used_" + me.civId, 1);
      if (win) inc("civ_wins_" + me.civId, 1);

      submit("board_kills_per_match", me.kills);
      submit("board_shortest_win_sec", win ? Math.round(dur) : 999999);
      submit("board_biggest_army", me.unitsBuilt);
      const compScore = Math.round(me.kills * 10 + (win ? 500 : 0) + me.earned * 0.1);
      submit("board_composite", compScore);

      if (rankResult) {
        set("rank_score", rankResult.after);
        const peak = Math.max(Number(get("rank_peak")) || 0, rankResult.after);
        set("rank_peak", peak);
        const info = rankResult.afterInfo;
        submit("board_rank", rankResult.after, {
          tier: info.tier.id, div: info.div, lp: info.lp, title: Rank.title(info),
        });
      }

      if (win) unlock("first_win");
      if (dur <= 180 && win) unlock("blitz_win");
      if (me.kills >= 30 && win) unlock("killer_thirty");
      if (me.buildingsBuilt >= 6) unlock("six_buildings");
      if (win) unlock("civ_win_" + me.civId);
      store();
    } catch (e) { console.warn("[stats] store fail", e); }

    return rankResult;
  }

  return {
    connect, whenReady, enabled, get, inc, set, unlock, submit, store, board,
    reportEndOfMatch, get client() { return gh; },
  };
})();

window.Stats = Stats;
