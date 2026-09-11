/* main.js — 主控（Screen 切换 / 游戏循环 / 联机粘合） */

(function () {

  // ------------- 全局 App 状态 -------------
  const App = {
    screen: "menu",             // menu | lobby | join | play | end | help
    state: null,                // 仿真状态（房主/单机模式下有）
    displayState: null,         // 客户端渲染用（可能就是同一份）
    meSeat: null,               // 我在座位表里的索引
    isHost: true,               // 单机模式默认自己就是"房主"（跑仿真）
    isLocal: true,              // 单机 vs 联机
    lobby: null,                // 大厅信息
    paused: false,
    speed: 1,                   // 1 / 2 / 4
    lastRAF: 0,
    accumMs: 0,
    canvas: null,
    ctx: null,
    aiDispatch: null,           // AI 调用的 apply（本地 apply）
    stopLoop: null,
    matchMeta: { mode:"1v1", started_at: null, config: null },
    gameId: null,
    codexCiv: "hk_finance",
  };

  const CODEX_GUIDE = {
    hk_finance: {
      tags: ["经济流", "后期爆发", "前期偏弱"],
      tips: ["前期先补经济和人口，靠基地回血与保镖过渡。", "T2 后远程火力仍强，但已不再适合无脑站桩对射。", "大招偏滚雪球，适合优势时拉开资源差。"],
    },
    hk_slum: {
      tags: ["暴兵流", "人海压制", "节奏快"],
      tips: ["依靠便宜单位快速铺场。", "怕范围伤害和厚前排，最好不断补线压节奏。", "街坊起义现在更偏近战杂兵，不再靠白嫖枪线赢团。"],
    },
    hk_police: {
      tags: ["均衡", "装甲流", "中期强"],
      tips: ["前排防暴仍是核心，但后排枪线已明显削弱。", "狙击和飞虎队更适合补关键火力，不再能单卡清屏。", "适合稳扎稳打，别再把它当纯远程碾压文明。"],
    },
    zom_classic: {
      tags: ["均衡尸潮", "前期更稳", "经典推进"],
      tips: ["普通僵尸和跳蚤已更耐打，前期更容易顶住火力。", "基地更厚，更适合边守边攒 T2/T3。", "巨怪和投石僵尸仍是中后期破阵主力。"],
    },
    zom_ghost: {
      tags: ["高机动", "切后排", "骚扰强"],
      tips: ["跳僵尸和饿鬼前期都更顺手，适合抢节奏。", "用高机动逼人类远程交火位，而不是正面硬吃。", "虽然基地也变厚了，但依旧别和重装正面对磨太久。"],
    },
    zom_bio: {
      tags: ["慢热", "AOE", "后期团战"],
      tips: ["感染者和酸液喷射者加强后，前期不再那么坐牢。", "基地更厚，更容易拖到毒气和母体成型。", "成型后依旧靠范围伤害和团战续航滚雪球。"],
    },
  };

  // ------------- 屏幕切换 -------------
  function showScreen(name) {
    App.screen = name;
    document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
    const el = document.getElementById(name + "-screen");
    if (el) el.classList.add("active");
    if (name === "play") setTimeout(resizeCanvasToWrap, 0);
  }

  // ------------- Canvas 自适应视口 -------------
  function resizeCanvasToWrap() {
    const canvas = document.getElementById("game-canvas");
    const wrap = canvas?.parentElement;
    if (!canvas || !wrap) return;
    const rect = wrap.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const aspect = canvas.width / canvas.height;   // 1280/560
    let w = rect.width, h = rect.height;
    if (w / h > aspect) { w = h * aspect; }
    else                 { h = w / aspect; }
    canvas.style.width  = Math.floor(w) + "px";
    canvas.style.height = Math.floor(h) + "px";
  }
  window.addEventListener("resize", resizeCanvasToWrap);

  // ------------- 初始化 -------------
  window.addEventListener("load", async () => {
    App.canvas = document.getElementById("game-canvas");
    App.ctx = App.canvas.getContext("2d");
    bindMenuButtons();
    bindLobbyUI();
    bindPlayUI();
    bindHelpUI();

    // 后台预热美术资源（不阻塞菜单）
    App.assetsReady = false;
    if (typeof loadAssets === "function") {
      loadAssets((loaded, total) => {
        const acc = document.getElementById("menu-account");
        if (acc && !App.assetsReady) acc.textContent = `资源加载中… ${loaded}/${total}`;
      }).then(() => {
        App.assetsReady = true;
        const acc = document.getElementById("menu-account");
        if (acc && !Stats.enabled?.()) acc.textContent = "未登录 · 本地模式";
      });
    } else {
      App.assetsReady = true;
    }

    // GameHub 接入（游戏内）
    App.gameId = inferGameId();
    if (App.gameId && window.GameHubStats) {
      Stats.connect();
      // 显示登录状态
      setTimeout(() => {
        const acc = document.getElementById("menu-account");
        if (Stats.enabled()) acc.textContent = "已登录 · 云端进度已开启";
        else acc.textContent = "未登录 · 本地模式";
      }, 800);
    }
    if (App.gameId && window.GameHubMatches) {
      Matches.connect();
    }

    Input.bind(() => ({
      state: App.state, meSeat: App.meSeat, paused: App.paused, over: App.state && App.state.over,
      dispatch: (act) => dispatch(act),
    }));

    // 平台成就 toast（父页面转发）
    window.addEventListener("message", (ev) => {
      const d = ev.data;
      if (d && d.type === "gamehub-achievement" && d.achievement) {
        HUD.showToast("🏆 " + (d.achievement.name || d.achievement.id));
      }
    });

    showScreen("menu");
  });

  function inferGameId() {
    const m = /^\/g\/([A-Za-z0-9_-]+)\/v\/[A-Za-z0-9_-]+\//.exec(location.pathname);
    return m ? m[1] : "";
  }

  // ------------- 主菜单绑定 -------------
  function bindMenuButtons() {
    document.querySelectorAll("[data-action]").forEach(el => {
      el.addEventListener("click", () => {
        const a = el.dataset.action;
        if (a === "quick-1v1") startSinglePlayer("1v1");
        else if (a === "quick-2v2") startSinglePlayer("2v2");
        else if (a === "host") hostRoom();
        else if (a === "join") openJoinScreen();
        else if (a === "codex") { showScreen("codex"); renderCodex(App.codexCiv); }
        else if (a === "codex-back") showScreen("menu");
        else if (a === "help") showScreen("help");
        else if (a === "help-close") showScreen("menu");
        else if (a === "lobby-back") leaveLobby();
        else if (a === "join-back") showScreen("menu");
        else if (a === "join-confirm") joinConfirm();
        else if (a === "end-menu") showScreen("menu");
        else if (a === "end-again") replay();
      });
    });
  }

  // ------------- 单机开局：进大厅让玩家选阵营/文明/座位 -------------
  function startSinglePlayer(mode) {
    App.isLocal = true;
    App.isHost = true;
    App.meSeat = 0;
    Lobby.setHostFlags(true, "local-me");
    Lobby.initLocal(mode);
    // 记住上次选的文明作为初始高亮
    const prevHk = localStorage.getItem("hkvz.pref.hk");
    const prevZom = localStorage.getItem("hkvz.pref.zom");
    if (prevHk && HK_CIVS.includes(prevHk)) {
      const me = Lobby.getState().slots.find(s => s.clientId === "local-me");
      if (me) me.civId = prevHk;
    }
    // AI 文明多样化：不重复
    const st = Lobby.getState();
    const hkPool = HK_CIVS.filter(c => c !== (prevHk || HK_CIVS[0]));
    const zomPool = ZOM_CIVS.slice();
    let hi = 0, zi = 0;
    st.slots.forEach(s => {
      if (!s.isAI) return;
      if (s.team === "hk") s.civId = hkPool[hi++ % hkPool.length];
      else                 s.civId = zomPool[zi++ % zomPool.length];
    });

    document.getElementById("lobby-title").textContent = "单机 · vs AI";
    document.getElementById("lobby-code").textContent = "本地";
    document.getElementById("lobby-mode").value = mode;
    document.getElementById("lobby-mode").disabled = false;
    document.getElementById("lobby-fill-ai").checked = true;
    document.getElementById("lobby-fill-ai").disabled = true; // 单机必须补 AI
    showScreen("lobby");
    renderLobby();
  }

  // ------------- 联机 · 创房 -------------
  async function hostRoom() {
    if (!App.gameId || !window.GameHubRoom) {
      HUD.showToast("联机需在小游戏站内游玩");
      return;
    }
    try {
      await Net.connect(App.gameId);
      const r = await Net.createRoom(App.gameId, 4);
      Net.join(r.code);
      Net.startPing();
      App.isLocal = false;
      // 收到 welcome 时初始化大厅
      Net.on((type, msg) => handleNetEvent(type, msg));
      document.getElementById("lobby-code").textContent = r.code;
      document.getElementById("lobby-title").textContent = "房间（我是房主）";
      showScreen("lobby");
    } catch (e) {
      console.warn(e);
      HUD.showToast("创建房间失败：" + (e.message || e));
    }
  }

  async function openJoinScreen() {
    if (!App.gameId || !window.GameHubRoom) { HUD.showToast("联机需在小游戏站内游玩"); return; }
    showScreen("join");
    try {
      await Net.connect(App.gameId);
      const list = await Net.listRooms(App.gameId);
      const box = document.getElementById("join-list");
      if (!list || list.length === 0) box.innerHTML = "<p class='hint'>暂无房间，去创建一个吧</p>";
      else {
        box.innerHTML = list.map(r =>
          `<div class="room-row" data-code="${r.code}">
             <span class="rc">${r.code}</span>
             <span>${r.member_count}/${r.max_players}人</span>
           </div>`
        ).join("");
        box.querySelectorAll(".room-row").forEach(el => el.addEventListener("click", () => {
          document.getElementById("join-code").value = el.dataset.code;
        }));
      }
    } catch (e) {
      document.getElementById("join-list").textContent = "拉取房间失败：" + (e.message || e);
    }
  }
  async function joinConfirm() {
    const code = (document.getElementById("join-code").value || "").trim().toUpperCase();
    if (!code || code.length !== 6) { HUD.showToast("请填写 6 位房间号"); return; }
    Net.on((type, msg) => handleNetEvent(type, msg));
    Net.join(code);
    Net.startPing();
    App.isLocal = false;
    document.getElementById("lobby-code").textContent = code;
    document.getElementById("lobby-title").textContent = "房间（等待房主开始）";
    showScreen("lobby");
  }

  // ------------- 大厅事件粘合 -------------
  function handleNetEvent(type, msg) {
    switch (type) {
      case "welcome": {
        // 我加入了 → 判断自己是否房主
        const my = Net.mySeat();
        const isHost = my === 0;
        Lobby.setHostFlags(isHost, Net.myClientId());
        if (isHost) {
          const mode = document.getElementById("lobby-mode").value || "1v1";
          Lobby.initHost(mode);
          // 我自己也加入 slot
          Lobby.hostOnMemberJoined({ client_id: Net.myClientId(), user_id: Net.room.you.user_id, username: Net.room.you.username });
        }
        renderLobby();
        break;
      }
      case "member_joined":
        Lobby.hostOnMemberJoined(msg.member);
        renderLobby();
        break;
      case "member_left":
        Lobby.hostOnMemberLeft(msg.member);
        renderLobby();
        break;
      case "msg": {
        // 应用层
        const d = msg;
        if (d.type === "lobby_state") { Lobby.applyLobbyState(d.state); renderLobby(); }
        else if (d.type === "lobby_ready") { Lobby.hostReceiveReady(d); renderLobby(); }
        else if (d.type === "start") {
          startGameOnClient(d);
        } else if (d.type === "snapshot") {
          onSnapshot(d.snap);
        } else if (d.type === "action") {
          // 房主收到客户端的操作
          if (Net.iAmHost() && App.state) {
            const a = d.act;
            if (a) Sim.applyAction(App.state, a);
          }
        } else if (d.type === "end") {
          onEndFromNet(d);
        }
        break;
      }
      case "error":
        HUD.showToast("网络: " + (msg.error || "错误"));
        break;
    }
  }

  // 大厅视图辅助：本地/联机通用
  function amHost() { return App.isLocal ? true : Net.iAmHost(); }
  function myCid()  { return App.isLocal ? "local-me" : Net.myClientId(); }

  function assetPath(key) {
    return key ? `img/${key}.png?v=3` : "";
  }
  function prereqName(civ, req) {
    return req ? (civ.buildings[req]?.name || req) : "开局可用";
  }
  function unitRoleText(u) {
    if (u.support) return "辅助";
    if (u.lobber) return "攻城";
    if ((u.range || 0) <= 40) return "近战";
    if (u.splash) return "范围远程";
    return "远程";
  }
  function buildingSummary(civ, kind, def) {
    if (kind === B.HQ) return "基地核心，被打爆就输。";
    if (kind === B.INCOME) return `经济建筑，收入 +${def.effect?.income || 0}/s。`;
    if (kind === B.POP) return `人口建筑，人口上限 +${def.effect?.pop || 0}。`;
    if (kind === B.TECH_A) return "一级科技，解锁 T2 兵种。";
    if (kind === B.TECH_B) return "二级科技，解锁 T3 兵种与关键战力。";
    if (kind === B.TECH_C) return "三级科技，解锁 T4 / 终盘单位与终极战术。";
    return "";
  }
  function skillIcon(s) {
    if (!s) return "✨";
    if (s.kind === "summon") return "👥";
    if (s.kind === "harvester") return "🚐";
    if (s.kind === "airstrike") return "🚁";
    if (s.kind === "buff_econ") return "💹";
    if (s.kind === "barrage") return "🪨";
    if (s.kind === "buff_army") return "🌕";
    if (s.kind === "poison") return "☣️";
    return "✨";
  }
  function summonTextForCiv(civId, skill) {
    const civ = CIVS[civId];
    const parts = (skill.byCiv && skill.byCiv[civId]) || skill.units || [];
    return parts.map(([token, n]) => {
      const u = civ.units[token];
      if (u) return `${n} ${u.name}`;
      return `${n} ${token}`;
    }).join(" + ");
  }

  function renderCodex(civId) {
    const all = [...HK_CIVS, ...ZOM_CIVS];
    const chosen = CIVS[civId] ? civId : (App.codexCiv || all[0]);
    const civ = CIVS[chosen];
    if (!civ) return;
    App.codexCiv = chosen;

    const tabs = document.getElementById("codex-tabs");
    const hero = document.getElementById("codex-hero");
    const unitsBox = document.getElementById("codex-units");
    const buildingsBox = document.getElementById("codex-buildings");
    const skillsBox = document.getElementById("codex-skills");
    if (!tabs || !hero || !unitsBox || !buildingsBox || !skillsBox) return;

    tabs.innerHTML = all.map(id => {
      const c = CIVS[id];
      return `<button class="codex-tab ${id === chosen ? "active" : ""}" data-civ="${id}" style="color:${c.color}">${HUD.escapeHtml(c.name)}</button>`;
    }).join("");
    tabs.querySelectorAll(".codex-tab").forEach(el => {
      el.onclick = () => renderCodex(el.dataset.civ);
    });

    const guide = CODEX_GUIDE[chosen] || { tags: [], tips: [] };
    const baseHp = civ.buildings[B.HQ]?.hp || 0;
    const bgKey = Render?.bgImageKeyForCiv ? Render.bgImageKeyForCiv(chosen) : null;
    const baseKey = Render?.baseImageKeyForCiv ? Render.baseImageKeyForCiv(chosen) : null;
    hero.innerHTML = `
      <div class="codex-cover" style="background-image:url('${assetPath(bgKey)}')">
        <div class="codex-cover-label">${civ.side === "hk" ? "🏙️ 香港阵营" : "🧟 僵尸阵营"}</div>
        <img class="codex-base" src="${assetPath(baseKey)}" alt="${HUD.escapeHtml(civ.name)}">
      </div>
      <div class="codex-summary">
        <div>
          <div class="codex-sub">${civ.side === "hk" ? "香港文明" : "僵尸文明"}</div>
          <h3 style="color:${civ.color}">${HUD.escapeHtml(civ.name)}</h3>
          <div class="codex-desc">${HUD.escapeHtml(civ.desc)}</div>
        </div>
        <div class="codex-tags">${guide.tags.map(t => `<span class="codex-tag">${HUD.escapeHtml(t)}</span>`).join("")}</div>
        <div class="codex-metrics">
          <div class="codex-metric"><div class="k">基地血量</div><div class="v">${baseHp}</div></div>
          <div class="codex-metric"><div class="k">基地回血</div><div class="v">${civ.baseRegen || 0}/s</div></div>
          <div class="codex-metric"><div class="k">初始收入</div><div class="v">${civ.baseIncome}/s</div></div>
          <div class="codex-metric"><div class="k">基础人口</div><div class="v">${civ.baseCap}</div></div>
        </div>
        <ul class="codex-tips">${guide.tips.map(t => `<li>${HUD.escapeHtml(t)}</li>`).join("")}</ul>
      </div>
    `;

    unitsBox.innerHTML = Object.entries(civ.units)
      .sort((a, b) => a[1].cost - b[1].cost)
      .map(([uid, u]) => {
        const key = Render?.imageKeyForUnitCard ? Render.imageKeyForUnitCard(civ.side, u.arch) : null;
        const splash = u.splash ? ` · 溅射 ${u.splash}` : "";
        const jump = u.jump ? ` · 跳跃 ${u.jump}` : "";
        return `
          <article class="codex-card">
            <img src="${assetPath(key)}" alt="${HUD.escapeHtml(u.name)}">
            <div>
              <h4>${HUD.escapeHtml(u.name)}</h4>
              <div class="codex-sub">${HUD.escapeHtml(unitRoleText(u))} · ${HUD.escapeHtml(prereqName(civ, u.prereq))}</div>
            </div>
            <div class="codex-stats">
              <span>花费 $${u.cost}</span>
              <span>人口 ${u.pop}</span>
              <span>生命 ${u.hp}</span>
              <span>伤害 ${u.dmg}</span>
              <span>射程 ${u.range}</span>
              <span>移速 ${u.speed}</span>
              <span>攻速 ${u.atkCd}s</span>
              <span>训练 ${u.buildTime}s</span>
            </div>
            <div class="codex-desc">原型 ${HUD.escapeHtml(u.arch)}${HUD.escapeHtml(splash)}${HUD.escapeHtml(jump)}</div>
          </article>
        `;
      }).join("");

    const buildOrder = [B.HQ, B.INCOME, B.POP, B.TECH_A, B.TECH_B, B.TECH_C];
    buildingsBox.innerHTML = buildOrder.map(kind => {
      const def = civ.buildings[kind];
      const key = kind === B.HQ
        ? (Render?.baseImageKeyForCiv ? Render.baseImageKeyForCiv(chosen) : null)
        : (Render?.buildingImageKey ? Render.buildingImageKey(civ.side, kind) : null);
      return `
        <article class="codex-card">
          <img src="${assetPath(key)}" alt="${HUD.escapeHtml(def.name)}">
          <div>
            <h4>${HUD.escapeHtml(def.name)}</h4>
            <div class="codex-sub">${HUD.escapeHtml(kind)}</div>
          </div>
          <div class="codex-stats">
            <span>花费 $${def.cost}</span>
            <span>上限 ${def.cap}</span>
            ${kind === B.HQ ? `<span>生命 ${def.hp}</span>` : ""}
            ${kind === B.INCOME ? `<span>收入 +${def.effect?.income || 0}/s</span>` : ""}
            ${kind === B.POP ? `<span>人口 +${def.effect?.pop || 0}</span>` : ""}
            ${(kind === B.TECH_A || kind === B.TECH_B || kind === B.TECH_C) ? `<span>科技建筑</span>` : ""}
          </div>
          <div class="codex-desc">${HUD.escapeHtml(buildingSummary(civ, kind, def))}</div>
        </article>
      `;
    }).join("");

    skillsBox.innerHTML = civ.skills.map(sid => {
      const s = SKILLS[sid];
      const extra = s.kind === "summon" ? `召唤：${summonTextForCiv(chosen, s)}。` : "";
      return `
        <article class="codex-card">
          <div class="codex-skill-icon">${skillIcon(s)}</div>
          <div>
            <h4>${HUD.escapeHtml(s.name)}</h4>
            <div class="codex-sub">消耗 ${s.cost} 能量 · ${HUD.escapeHtml(s.kind)}</div>
          </div>
          <div class="codex-desc">${HUD.escapeHtml(s.desc)} ${HUD.escapeHtml(extra)}</div>
        </article>
      `;
    }).join("");
  }

  // 渲染大厅 UI
  function renderLobby() {
    const state = Lobby.getState();
    if (!state) return;
    const picker = document.getElementById("lobby-civ-picker");
    const hint = document.getElementById("lobby-hint");
    hint.textContent = App.isLocal ? "单机模式 · 选好阵营和文明就开打"
                                    : (amHost() ? "房主 · 挑好模式、选好文明后开始对战" : "等待房主开始");
    document.getElementById("lobby-start").style.display = amHost() ? "" : "none";
    document.getElementById("lobby-mode").disabled = !amHost();

    // 我这一格的信息
    const me = state.slots.find(s => s.clientId === myCid());
    const myTeam = me ? me.team : "hk";
    const myCiv = me ? me.civId : "hk_finance";

    // 渲染两边座位（点击可换位/踢 AI）
    document.querySelectorAll(".slot").forEach(el => {
      const team = el.dataset.team;
      const idx = Number(el.dataset.slot);
      const seatArr = state.slots.filter(s => s.team === team);
      const s = seatArr[idx];
      const canClaim = !s || s.isAI || (s.clientId !== myCid());
      if (!s) {
        el.className = "slot clickable";
        el.innerHTML = `<div class="empty">${team === "hk" ? "🏙️ 空位" : "🧟 空位"}<div class='slot-hint'>点这里坐下</div></div>`;
      } else {
        const isMe = s.clientId === myCid();
        el.className = "slot occupied" + (isMe ? " me" : "") + (s.isAI ? " ai" : "") + (canClaim ? " clickable" : "");
        const civ = CIVS[s.civId] || { name: "?" };
        const label = s.isAI ? " · AI" : (isMe ? " · 我" : "");
        const hint = isMe ? "" : (s.isAI && amHost() ? `<div class='slot-hint'>点击踢掉 AI 并坐下</div>`
                                : s.isAI ? `<div class='slot-hint'>点击占位换阵营</div>` : "");
        el.innerHTML = `
          <div class="who">${HUD.escapeHtml(s.name)}${label}</div>
          <div class="civ">${HUD.escapeHtml(civ.name)}</div>
          ${hint}
        `;
      }
      // 点击处理：想去哪就点哪
      el.onclick = () => {
        if (!canClaim) return;
        Lobby.tryClaimSlot(team, idx);
      };
    });

    // 阵营切换按钮 + 文明卡（只显示当前阵营的所有 civ 供切换）
    const otherTeam = myTeam === "hk" ? "zom" : "hk";
    const civs = myTeam === "hk" ? HK_CIVS : ZOM_CIVS;
    let html = "";
    // 顶部一枚显眼的换边按钮
    html += `<div class="civ-swap" data-team="${otherTeam}">
      🔀 换到 ${otherTeam === "hk" ? "🏙️ 香港" : "🧟 僵尸"} 阵营
    </div>`;
    // 我方阵营的文明卡
    civs.forEach(cid => {
      const c = CIVS[cid];
      html += `
        <div class="civ-card ${cid === myCiv ? "selected" : ""}" data-team="${myTeam}" data-civ="${cid}">
          <div class="civ-side" style="color:${c.color}">${myTeam === "hk" ? "🏙️ 香港" : "🧟 僵尸"}</div>
          <div class="civ-name">${c.name}</div>
          <div class="civ-desc">${c.desc}</div>
        </div>`;
    });
    picker.innerHTML = html;
    // 换阵营按钮：保持我在对面同 index，再挑第一个可用 civ
    const swapBtn = picker.querySelector(".civ-swap");
    if (swapBtn) swapBtn.addEventListener("click", () => {
      const otherCivs = otherTeam === "hk" ? HK_CIVS : ZOM_CIVS;
      const remembered = localStorage.getItem("hkvz.pref." + otherTeam);
      const pickCiv = (remembered && otherCivs.includes(remembered)) ? remembered : otherCivs[0];
      Lobby.sendMyChoice(otherTeam, pickCiv);
    });
    // 文明卡：点了就换 civ
    picker.querySelectorAll(".civ-card").forEach(el => {
      el.addEventListener("click", () => {
        const t = el.dataset.team, c = el.dataset.civ;
        localStorage.setItem("hkvz.pref." + t, c);
        Lobby.sendMyChoice(t, c);
      });
    });
  }

  function bindLobbyUI() {
    document.getElementById("lobby-start").addEventListener("click", () => {
      // 单机：不用广播，直接开
      if (App.isLocal) {
        const st = Lobby.getState();
        if (!st) return;
        // fillAI 一定为 true（单机强制），走一次补齐保证双方都有单位
        if (typeof Lobby.hostToggleFillAI === "function" && st.fillAI) {
          Lobby.hostToggleFillAI(true); // 会调 fillAISlots + recalcRows
        }
        const hk = st.slots.filter(s => s.team === "hk").length;
        const zom = st.slots.filter(s => s.team === "zom").length;
        if (hk === 0 || zom === 0) { HUD.showToast("双方都要有玩家或 AI"); return; }
        // 记住玩家的偏好
        const me = st.slots.find(s => s.clientId === "local-me");
        if (me) localStorage.setItem("hkvz.pref." + me.team, me.civId);
        App.lobby = st;
        App.matchMeta = { mode: st.mode, config: st, started_at: new Date().toISOString() };
        startGameFromLobby(st);
        return;
      }
      const cfg = Lobby.hostStartGame();
      if (!cfg) return;
    });
    document.getElementById("lobby-mode").addEventListener("change", (ev) => {
      if (amHost()) Lobby.hostChangeMode(ev.target.value);
    });
    document.getElementById("lobby-fill-ai").addEventListener("change", (ev) => {
      if (amHost()) Lobby.hostToggleFillAI(ev.target.checked);
    });
    Lobby.setStart((cfg) => startGameFromNet(cfg));
    Lobby.setUpdate(() => renderLobby());
  }

  function leaveLobby() {
    if (!App.isLocal) { Net.leave(); Net.close(); Net.stopPing(); }
    showScreen("menu");
  }

  // ------------- 联机 · 客户端收到 start -------------
  function startGameOnClient(msg) {
    App.isHost = Net.iAmHost();
    App.isLocal = false;
    // 定位自己在 players 里的 seat
    let mySeat = null;
    msg.players.forEach((p, i) => { if (p.clientId === Net.myClientId()) mySeat = i; });
    App.meSeat = mySeat;
    // 构造 config；若是房主：跑仿真；否则：只渲染
    if (App.isHost) {
      const state = Sim.createInitialState({ seed: msg.seed, players: msg.players });
      App.state = state;
      App.displayState = state;
      App.matchMeta = { mode: Lobby.getState().mode, config: msg, started_at: new Date().toISOString() };
      startLoop(true);
    } else {
      // 客户端：等收到 snapshot 再渲染
      App.state = null;
      App.displayState = null;
      App.matchMeta = { mode: Lobby.getState().mode, config: msg, started_at: new Date().toISOString() };
      startLoop(false);
    }
    Matches.start();
    showScreen("play");
  }
  function startGameFromNet(cfg) {
    // 房主自己：跟客户端一样走 startGameOnClient（自己 broadcast + 自己收到）
    // 但为简化流程，房主也直接调用一次
    App.meSeat = 0;
    startGameOnClient({ seed: cfg.seed, players: cfg.players });
  }

  // ------------- 从单机 lobby 开始 -------------
  function startGameFromLobby(lobby) {
    const players = lobby.slots.map(s => ({
      team: s.team, civId: s.civId, isAI: !!s.isAI, name: s.name, row: s.row,
    }));
    App.state = Sim.createInitialState({ players });
    App.displayState = App.state;
    App.meSeat = 0;
    App.isHost = true;
    App.isLocal = true;
    startLoop(true);
    Matches.start();
    showScreen("play");
  }

  // ------------- 分发动作（本地/网络） -------------
  function dispatch(act) {
    if (!act) return { ok:false };
    // 本地/房主：直接 apply
    if (App.isHost && App.state) {
      const r = Sim.applyAction(App.state, act);
      if (r.ok) {
        if (act.op === "spawn") Audio2.spawn();
        else if (act.op === "build") Audio2.build();
        else if (act.op === "skill") { Audio2.skill(); HUD.showFloater(`⚡ ${SKILLS[act.skill].name}!`); }
      } else {
        // 提示原因
        if (r.err === "gold") HUD.showFloater("💰 钱不够", "#ff8888");
        else if (r.err === "pop") HUD.showFloater("👥 人口已满", "#ff8888");
        else if (r.err === "prereq") HUD.showFloater("🔒 需要科技建筑", "#ff8888");
        else if (r.err === "cap") HUD.showFloater("已达建造上限", "#ff8888");
        else if (r.err === "cd") { /* 静默 */ }
        else if (r.err === "energy") HUD.showFloater("⚡ 能量不够", "#ff8888");
      }
      return r;
    }
    // 客户端：发到房主
    Net.broadcast({ type:"action", act });
    return { ok:true };
  }
  App.aiDispatch = (act) => Sim.applyAction(App.state, act);

  // ------------- 游戏主循环 -------------
  function startLoop(runSim) {
    stopLoop();
    App.paused = false;
    App.lastRAF = performance.now();
    App.accumMs = 0;
    let snapAccum = 0;
    const snapInterval = 200;   // ms - 房主广播频率
    App.stopLoop = false;

    const step = (now) => {
      if (App.stopLoop) return;
      requestAnimationFrame(step);
      const dtMs = Math.min(200, now - App.lastRAF);
      App.lastRAF = now;

      if (!App.paused && runSim && App.state && !App.state.over) {
        // 固定步长仿真
        App.accumMs += dtMs * App.speed;
        while (App.accumMs >= Sim.DT_MS) {
          App.accumMs -= Sim.DT_MS;
          Sim.tickSim(App.state, Sim.DT);
          // AI 思考
          App.state.players.forEach(p => {
            if (p.isAI) AI.aiThink(App.state, p.seat, App.aiDispatch);
          });
          if (App.state.over) break;
        }
        // 快照广播
        if (!App.isLocal) {
          snapAccum += dtMs;
          if (snapAccum >= snapInterval) {
            snapAccum = 0;
            const snap = Sim.snapshot(App.state);
            Net.broadcast({ type:"snapshot", snap });
          }
        }
      }
      // 渲染
      const rs = App.isHost ? App.state : App.displayState;
      if (rs) {
        // 清屏
        App.ctx.clearRect(0, 0, App.canvas.width, App.canvas.height);
        Render.render(App.ctx, rs, App.isHost ? App.state.time : (App.displayState.time || 0), App.meSeat);
        HUD.renderTop(rs);
        HUD.renderPlayerStrip(rs, App.meSeat, dispatch);

        // 检查结束
        if (rs.over && !App._endHandled) {
          App._endHandled = true;
          onGameOver(rs);
        }
      }
    };
    App._endHandled = false;
    requestAnimationFrame(step);
  }
  function stopLoop() {
    App.stopLoop = true;
    App.paused = false;
    App._endHandled = false;
  }

  function onSnapshot(snap) {
    if (App.isHost) return;
    App.displayState = App.displayState || {};
    Sim.applySnapshot(App.displayState, snap);
  }

  // ------------- 结束处理 -------------
  function onGameOver(state) {
    const me = state.players[App.meSeat];
    const myTeam = me ? me.team : "hk";
    const win = state.winner === myTeam;
    Audio2[win ? "win" : "lose"]();

    // 广播 end（房主）
    if (App.isHost && !App.isLocal) {
      Net.broadcast({
        type:"end", winner: state.winner,
        players: state.players, duration: state.over_time,
      });
    }

    // 云端统计
    if (Stats.enabled()) Stats.reportEndOfMatch(win ? "win" : "lose", state, App.meSeat, App.matchMeta.mode);
    // 上报对局记录
    Matches.finish({
      result: win ? "win" : "lose",
      score: Math.round((me?.kills || 0) * 10 + (win ? 500 : 0) + (me?.earned || 0) * 0.1),
      metadata: {
        mode: App.matchMeta.mode,
        civ: me?.civId, team: myTeam,
        opponents: state.players.filter(p => p.team !== myTeam).map(p => p.civId),
        duration_sec: Math.round(state.over_time),
        kills: me?.kills || 0,
        units_built: me?.unitsBuilt || 0,
        buildings_built: me?.buildingsBuilt || 0,
      },
    });

    // 展示结算界面
    setTimeout(() => showEndScreen(state, win), 400);
  }
  function onEndFromNet(d) {
    if (!App.state) {
      // 客户端：靠这个替代结算
      const fake = { players: d.players, hp: {hk:0,zom:0}, hpMax:{hk:1,zom:1},
        winner: d.winner, over: true, over_time: d.duration, time: d.duration,
        units: [], effects: [], projectiles: [], corpses: [] };
      App.displayState = fake;
      const me = fake.players[App.meSeat];
      const win = fake.winner === (me ? me.team : null);
      showEndScreen(fake, win);
    }
  }

  async function showEndScreen(state, win) {
    const t = document.getElementById("end-title");
    t.textContent = win ? "🎉 胜利！" : "💀 失败";
    t.style.color = win ? "#4c9c40" : "#c93c3c";
    const me = state.players[App.meSeat];
    const sum = document.getElementById("end-summary");
    sum.innerHTML = "";
    const items = [
      { k: "阵营", v: (me?.team === "hk" ? "🏙️ 香港" : "🧟 僵尸") },
      { k: "文明", v: CIVS[me?.civId]?.name || "-" },
      { k: "击杀", v: me?.kills ?? 0 },
      { k: "造兵", v: me?.unitsBuilt ?? 0 },
      { k: "造楼", v: me?.buildingsBuilt ?? 0 },
      { k: "总花费", v: "$" + Math.round(me?.spent || 0) },
      { k: "总收入", v: "$" + Math.round(me?.earned || 0) },
      { k: "用时",   v: Math.round(state.over_time) + " 秒" },
    ];
    items.forEach(it => {
      const el = document.createElement("div");
      el.className = "metric";
      el.innerHTML = `<div class="k">${it.k}</div><div class="v">${it.v}</div>`;
      sum.appendChild(el);
    });

    // 历史
    const hist = document.getElementById("end-history");
    hist.innerHTML = "<h4>最近的对局</h4><div id='hist-list' class='hint'>加载中…</div>";
    try {
      const page = await Matches.history(10);
      const list = document.getElementById("hist-list");
      if (!page || !page.matches || page.matches.length === 0) list.textContent = "暂无历史";
      else list.innerHTML = page.matches.map(m =>
        `<div class="hrow">
          <span>${m.result === "win" ? "🏆" : "☠️"} ${HUD.escapeHtml((m.metadata||{}).civ || "-")}</span>
          <span>${HUD.escapeHtml((m.metadata||{}).mode || "")}</span>
          <span>击杀 ${(m.metadata||{}).kills ?? "-"}</span>
          <span>${Math.round((m.metadata||{}).duration_sec || 0)}s</span>
          <span>${(m.recorded_at || "").slice(5, 16)}</span>
        </div>`
      ).join("");
    } catch { document.getElementById("hist-list").textContent = "拉取失败"; }

    showScreen("end");
  }

  function replay() {
    if (App.isLocal) {
      // 用相同 lobby 重开
      startGameFromLobby(App.lobby);
    } else if (Net.iAmHost() && Lobby.getState()) {
      Lobby.hostStartGame();
    } else {
      // 客户端：回到大厅等
      showScreen("lobby");
    }
  }

  // ------------- 游戏内 UI 按钮 -------------
  function bindPlayUI() {
    document.getElementById("btn-pause").addEventListener("click", () => {
      // 联机时不允许暂停（避免影响他人）
      if (!App.isLocal) return;
      App.paused = !App.paused;
      document.getElementById("btn-pause").textContent = App.paused ? "▶" : "⏸";
    });
    document.getElementById("btn-speed").addEventListener("click", () => {
      if (!App.isLocal) return;
      App.speed = App.speed === 1 ? 2 : App.speed === 2 ? 4 : 1;
      document.getElementById("btn-speed").textContent = App.speed + "×";
    });
    document.getElementById("btn-quit").addEventListener("click", () => {
      if (confirm("确定离场？（会算作败北）")) {
        if (App.state) {
          // 让自己队伍算失败：把自己方所有玩家的基地 HP 都打成 0
          const me = App.state.players[App.meSeat];
          if (me) {
            App.state.players.forEach(p => {
              if (p.team === me.team) p.baseHp = 0;
            });
          }
        } else {
          showScreen("menu");
        }
      }
    });
    window.addEventListener("click", () => Audio2.resume(), { once:true });
  }

  function bindHelpUI() {
    // "help-close" 已在 bindMenuButtons 处理
  }

  // 曝露给控制台调试
  window.__APP = App;
})();
