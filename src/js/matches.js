/* matches.js — 包装 GameHubMatches；负责一局的 start / finish */

const Matches = (function () {
  let mc = null;
  let currentRound = null;
  function connect() {
    if (!window.GameHubMatches) { console.log("[matches] SDK 未加载"); return; }
    try { mc = GameHubMatches.connect(); } catch(e) { console.warn("[matches] init fail", e); }
  }
  function start() { if (mc) { try { currentRound = mc.start(); } catch(e){ console.warn("[matches] start fail", e); } } }
  async function finish(payload) {
    if (!mc || !currentRound) return;
    try {
      await currentRound.finish(payload);
      currentRound = null;
    } catch (e) {
      console.warn("[matches] finish fail", e && e.status, e && e.message);
      // 有可能 401（未登录）——静默；也可能 429，先等等再重试一次
      if (e && e.status === 429) {
        setTimeout(() => { try { currentRound && currentRound.retry(); } catch{} }, 3000);
      }
    }
  }
  async function history(limit = 10) {
    if (!mc) return { matches: [] };
    try { return await mc.history({ limit }); } catch(e) { return { matches: [] }; }
  }
  return { connect, start, finish, history };
})();

window.Matches = Matches;
