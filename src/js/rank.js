/* rank.js — 英雄联盟式排位：大段 4→1，每小段 100 胜点 */

const Rank = (function () {
  const TIERS = [
    { id: "iron",        name: "坚韧黑铁", short: "黑铁", color: "#9a8b7a" },
    { id: "bronze",      name: "英勇黄铜", short: "黄铜", color: "#c47a3a" },
    { id: "silver",      name: "不屈白银", short: "白银", color: "#c5d0dc" },
    { id: "gold",        name: "荣耀黄金", short: "黄金", color: "#e8b84a" },
    { id: "platinum",    name: "绚烂铂金", short: "铂金", color: "#5ec8c0" },
    { id: "emerald",     name: "流光翡翠", short: "翡翠", color: "#3dbf7a" },
    { id: "diamond",     name: "璀璨钻石", short: "钻石", color: "#5ab4ff" },
    { id: "master",      name: "超凡大师", short: "大师", color: "#b57cff" },
    { id: "grandmaster", name: "傲视宗师", short: "宗师", color: "#e24b4b" },
    { id: "challenger",  name: "最强王者", short: "王者", color: "#f0d36a" },
  ];
  const LP_DIV = 100;
  const LP_AI = 15;
  const LP_PVP = 30;           // 对战玩家 = 双倍
  const LOCAL_KEY = "hkvz.rank_score";
  const TOP_TIER = TIERS.length - 1;

  function iconSrc(tierId) { return "img/ranks/" + tierId + ".png"; }

  function decode(score) {
    const s = Math.max(0, Math.round(Number(score) || 0));
    // 最强王者 1 允许胜点堆叠超过 100，方便王者之间继续比排名
    if (s >= 3900) {
      return { score: s, tierIdx: TOP_TIER, tier: TIERS[TOP_TIER], div: 1, lp: s - 3900, stacked: true };
    }
    const tierIdx = Math.min(TOP_TIER, Math.floor(s / 400));
    const rem = s - tierIdx * 400;
    const divStep = Math.min(3, Math.floor(rem / LP_DIV));
    const div = 4 - divStep;
    const lp = rem - divStep * LP_DIV;
    return { score: s, tierIdx, tier: TIERS[tierIdx], div, lp, stacked: false };
  }

  function encode(tierIdx, div, lp) {
    const t = Math.max(0, Math.min(TOP_TIER, tierIdx | 0));
    const d = Math.max(1, Math.min(4, div | 0));
    const p = Math.max(0, Math.round(Number(lp) || 0));
    if (t === TOP_TIER && d === 1) return 3900 + p;
    return t * 400 + (4 - d) * LP_DIV + Math.min(LP_DIV - 1, p);
  }

  function applyDelta(score, delta) {
    let { tierIdx, div, lp } = decode(score);
    lp += Math.round(Number(delta) || 0);
    while (lp >= LP_DIV) {
      if (tierIdx === TOP_TIER && div === 1) break;
      lp -= LP_DIV;
      if (div > 1) div -= 1;
      else { tierIdx += 1; div = 4; }
    }
    while (lp < 0) {
      if (tierIdx === 0 && div === 4) { lp = 0; break; }
      lp += LP_DIV;
      if (div < 4) div += 1;
      else { tierIdx -= 1; div = 1; }
    }
    return encode(tierIdx, div, lp);
  }

  function lpDelta(win, pvp) {
    const step = pvp ? LP_PVP : LP_AI;
    return win ? step : -step;
  }

  function title(info) {
    if (!info) info = decode(0);
    return info.tier.name + info.div;
  }

  function isPvp(state, meSeat) {
    if (!state || !state.players) return false;
    const me = state.players[meSeat];
    if (!me) return false;
    return state.players.some(p => p && p.team !== me.team && !p.isAI);
  }

  function currentScore() {
    if (typeof Stats !== "undefined" && Stats.enabled && Stats.enabled()) {
      const v = Number(Stats.get("rank_score"));
      if (Number.isFinite(v)) return Math.max(0, Math.round(v));
    }
    try { return Math.max(0, parseInt(localStorage.getItem(LOCAL_KEY) || "0", 10) || 0); }
    catch { return 0; }
  }

  function persistScore(score) {
    try { localStorage.setItem(LOCAL_KEY, String(Math.max(0, Math.round(score)))); } catch {}
  }

  function applyMatch(win, pvp) {
    const before = currentScore();
    const delta = lpDelta(!!win, !!pvp);
    const after = applyDelta(before, delta);
    persistScore(after);
    const beforeInfo = decode(before);
    const afterInfo = decode(after);
    const changedRank = beforeInfo.tierIdx !== afterInfo.tierIdx || beforeInfo.div !== afterInfo.div;
    return {
      win: !!win, pvp: !!pvp, delta, before, after,
      beforeInfo, afterInfo,
      promoted: changedRank && after > before,
      demoted: changedRank && after < before,
    };
  }

  function lpNeed(info) {
    if (!info) info = decode(0);
    if (info.tierIdx === TOP_TIER && info.div === 1) return 0;
    return LP_DIV;
  }

  return {
    TIERS, LP_AI, LP_PVP, LP_DIV,
    decode, encode, applyDelta, lpDelta, title, isPvp,
    currentScore, persistScore, applyMatch, iconSrc, lpNeed,
  };
})();

window.Rank = Rank;
