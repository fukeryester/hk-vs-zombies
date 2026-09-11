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
  };

  // ------------- 屏幕切换 -------------
  function showScreen(name) {
    App.screen = name;
    document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
    const el = document.getElementById(name + "-screen");
    if (el) el.classList.add("active");
  }

  // ------------- 初始化 -------------
  window.addEventListener("load", async () => {
    App.canvas = document.getElementById("game-canvas");
    App.ctx = App.canvas.getContext("2d");
    bindMenuButtons();
    bindLobbyUI();
    bindPlayUI();
    bindHelpUI();

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

  // ------------- 单机开局 -------------
  function startSinglePlayer(mode) {
    // 允许玩家在开局前挑一个 HK 文明
    const hkCiv = pickCiv("hk") || "hk_finance";
    const zomCiv = pickCiv("zom") || "zom_classic";
    App.lobby = Lobby.buildLocal(mode, hkCiv, zomCiv);
    App.matchMeta = { mode, config: App.lobby, started_at: new Date().toISOString() };
    App.meSeat = 0;
    App.isHost = true;
    App.isLocal = true;
    startGameFromLobby(App.lobby);
  }
  // 单机用一个非常极简的 prompt 选择（避免额外弹层）
  function pickCiv(side) {
    const list = side === "hk" ? HK_CIVS : ZOM_CIVS;
    // 若已经玩过 → 复用上次选择
    const key = "hkvz.pref." + side;
    const prev = localStorage.getItem(key);
    if (prev && list.includes(prev)) return prev;
    // 随机一个
    return list[Math.floor(Math.random() * list.length)];
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

  // 渲染大厅 UI
  function renderLobby() {
    const state = Lobby.getState();
    if (!state) return;
    const picker = document.getElementById("lobby-civ-picker");
    const hint = document.getElementById("lobby-hint");
    hint.textContent = Net.iAmHost() ? "房主 · 挑好模式、选好文明后开始对战" : "等待房主开始";
    document.getElementById("lobby-start").style.display = Net.iAmHost() ? "" : "none";
    document.getElementById("lobby-mode").disabled = !Net.iAmHost();

    // 我这一格的信息
    const me = state.slots.find(s => s.clientId === Net.myClientId());
    const myTeam = me ? me.team : "hk";
    const myCiv = me ? me.civId : "hk_finance";

    // 渲染两边座位
    document.querySelectorAll(".slot").forEach(el => {
      const team = el.dataset.team;
      const idx = Number(el.dataset.slot);
      const seatArr = state.slots.filter(s => s.team === team);
      const s = seatArr[idx];
      if (!s) {
        el.className = "slot";
        el.innerHTML = `<div class="empty">${team === "hk" ? "空位（等待玩家或 AI）" : "空位（等待僵尸或 AI）"}</div>`;
        el.onclick = null;
      } else {
        el.className = "slot occupied" + (s.clientId === Net.myClientId() ? " me" : "");
        const civ = CIVS[s.civId];
        const label = s.isAI ? " · AI" : (s.clientId === Net.myClientId() ? " · 我" : "");
        el.innerHTML = `
          <div class="who">${HUD.escapeHtml(s.name)}${label}</div>
          <div class="civ">${HUD.escapeHtml(civ.name)}</div>
        `;
        // 点击 → 我想换到这一格
        el.onclick = () => {
          // 简化：我点自己那侧 → 什么都不做；我点对面空位 → 切换阵营到那一侧
          if (s.clientId === Net.myClientId()) return;
        };
      }
    });

    // 文明选择格：我只能选自己阵营的
    const civs = myTeam === "hk" ? HK_CIVS : ZOM_CIVS;
    // 加上「换到僵尸/香港」的按钮
    const otherTeam = myTeam === "hk" ? "zom" : "hk";
    const otherCivs = otherTeam === "hk" ? HK_CIVS : ZOM_CIVS;
    let html = "";
    civs.forEach(cid => {
      const c = CIVS[cid];
      html += `
        <div class="civ-card ${cid === myCiv ? "selected" : ""}" data-team="${myTeam}" data-civ="${cid}">
          <div class="civ-side" style="color:${c.color}">${myTeam === "hk" ? "🏙️ 香港" : "🧟 僵尸"}</div>
          <div class="civ-name">${c.name}</div>
          <div class="civ-desc">${c.desc}</div>
        </div>`;
    });
    // 换边按钮：选择对面第一个 civ 就等于切边
    html += `<div class="civ-card" data-team="${otherTeam}" data-civ="${otherCivs[0]}" style="background:${CIVS[otherCivs[0]].color}22">
      <div class="civ-side">切换到 ${otherTeam === "hk" ? "🏙️ 香港" : "🧟 僵尸"}</div>
      <div class="civ-name">${CIVS[otherCivs[0]].name}</div>
      <div class="civ-desc">点这里换阵营</div>
    </div>`;
    picker.innerHTML = html;
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
      const cfg = Lobby.hostStartGame();
      if (!cfg) return;
    });
    document.getElementById("lobby-mode").addEventListener("change", (ev) => {
      if (Net.iAmHost()) Lobby.hostChangeMode(ev.target.value);
    });
    document.getElementById("lobby-fill-ai").addEventListener("change", (ev) => {
      if (Net.iAmHost()) Lobby.hostToggleFillAI(ev.target.checked);
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
          // 让自己队伍算失败：把自己方基地 HP 打成 0
          const me = App.state.players[App.meSeat];
          if (me) App.state.hp[me.team] = 0;
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
