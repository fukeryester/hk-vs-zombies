/* lobby.js — 大厅（本地 & 联机通用）
   -----------------------------------------------------------------
   数据模型：
   lobby = {
     mode: "1v1" | "2v2",
     hostSeat: 0,
     slots: [
       { seat, occupied, clientId, userId, name, team, civId, ready, isAI },
       ...
     ],
     fillAI: true
   }
   -----------------------------------------------------------------
*/

const Lobby = (function () {

  // 本地大厅：单机模式（vs AI）直接跳过展示
  function buildLocal(mode, hkCiv, zomCiv) {
    const slots = [];
    if (mode === "1v1") {
      slots.push({ seat:0, team:"hk", civId: hkCiv, name:"我", isAI:false, ready:true, row:0 });
      slots.push({ seat:1, team:"zom", civId: zomCiv, name:"AI", isAI:true, ready:true, row:0 });
    } else {
      slots.push({ seat:0, team:"hk", civId: hkCiv, name:"我", isAI:false, ready:true, row:0 });
      slots.push({ seat:1, team:"hk", civId: HK_CIVS[(HK_CIVS.indexOf(hkCiv)+1) % HK_CIVS.length], name:"AI 队友", isAI:true, ready:true, row:1 });
      slots.push({ seat:2, team:"zom", civId: zomCiv, name:"AI 敌", isAI:true, ready:true, row:0 });
      slots.push({ seat:3, team:"zom", civId: ZOM_CIVS[(ZOM_CIVS.indexOf(zomCiv)+1) % ZOM_CIVS.length], name:"AI 敌 2", isAI:true, ready:true, row:1 });
    }
    return { mode, hostSeat:0, slots, fillAI:true };
  }

  // -----------------------------------------------------------------
  // 联机大厅：房主维护 lobby state，广播给所有客户端
  // 客户端点自己那格切换阵营 / 选文明 → 发 lobby_ready → 房主更新 lobby → 广播
  // -----------------------------------------------------------------
  let state = null;              // 房间大厅状态（房主权威）
  let onStart = null;            // 开局回调
  let onUpdate = null;
  let iAmHost = false;
  let myClientId = null;
  let myCivChoice = { hk:"hk_finance", zom:"zom_classic" };  // 我当前预选

  function initHost(mode) {
    state = { mode, hostSeat: 0, slots: [], fillAI: true };
  }

  function pushMemberAsSlot(member, seatIdx) {
    // 默认新加的人先放到 HK 阵营空位
    const teamCountHK = state.slots.filter(s => s.team === "hk").length;
    const teamCountZom = state.slots.filter(s => s.team === "zom").length;
    let team = teamCountHK <= teamCountZom ? "hk" : "zom";
    let row = state.slots.filter(s => s.team === team).length;   // 0/1
    let civId = team === "hk" ? HK_CIVS[0] : ZOM_CIVS[0];
    state.slots.push({
      seat: seatIdx,
      clientId: member.client_id,
      userId: member.user_id,
      name: member.username || ("Player " + (seatIdx + 1)),
      team, civId, row,
      ready: false, isAI: false,
    });
  }

  function fillAISlots() {
    const cap = state.mode === "1v1" ? 2 : 4;
    // 补齐到 cap 个座位
    while (state.slots.length < cap) {
      const teamCountHK = state.slots.filter(s => s.team === "hk").length;
      const teamCountZom = state.slots.filter(s => s.team === "zom").length;
      // 目标模式下每队最多多少人：1v1 → 1，2v2 → 2
      const perSide = state.mode === "1v1" ? 1 : 2;
      let team = teamCountHK < perSide ? "hk" : "zom";
      let row = state.slots.filter(s => s.team === team).length;
      let civId = team === "hk" ? HK_CIVS[state.slots.length % HK_CIVS.length]
                                : ZOM_CIVS[state.slots.length % ZOM_CIVS.length];
      state.slots.push({
        seat: state.slots.length,
        clientId: null, userId: null, name: "AI " + (state.slots.length + 1),
        team, civId, row,
        ready: true, isAI: true,
      });
    }
  }

  function broadcastLobbyState() {
    if (!iAmHost) return;
    Net.broadcast({ type:"lobby_state", state });
  }

  // 客户端收到 lobby_state 时调用
  function applyLobbyState(newState) {
    state = newState;
    if (onUpdate) onUpdate(state);
  }

  // 客户端切换/选择：广播 my choice；同时本地乐观更新，UI 立刻反映
  function sendMyChoice(team, civId) {
    if (!state) return;
    if (iAmHost) {
      // 房主直接改自己的
      const me = state.slots.find(s => s.clientId === myClientId);
      if (me) { me.team = team; me.civId = civId; me.ready = true; recalcRows(); }
      broadcastLobbyState();
      if (onUpdate) onUpdate(state);            // FIX: 房主自己也要刷新
    } else {
      // 客户端：先本地乐观更新，UI 立刻响应
      const me = state.slots.find(s => s.clientId === myClientId);
      if (me) { me.team = team; me.civId = civId; me.ready = true; recalcRows(); }
      if (onUpdate) onUpdate(state);
      Net.broadcast({ type:"lobby_ready", clientId: myClientId, team, civId });
    }
  }

  // 房主：收到成员的 lobby_ready
  function hostReceiveReady(msg) {
    if (!iAmHost || !state) return;
    const s = state.slots.find(x => x.clientId === msg.clientId);
    if (s) {
      s.team = msg.team || s.team;
      s.civId = msg.civId || s.civId;
      s.ready = true;
      recalcRows();
      broadcastLobbyState();
      if (onUpdate) onUpdate(state);            // FIX: 房主 UI 也刷新
    }
  }

  // 有人加入时（房主）
  function hostOnMemberJoined(member) {
    if (!iAmHost || !state) return;
    // 简化：先把 AI 全部踢掉，让人插入，然后重新 fillAI
    state.slots = state.slots.filter(s => !s.isAI);
    // 加入新成员
    if (!state.slots.some(s => s.clientId === member.client_id)) {
      pushMemberAsSlot(member, state.slots.length);
    }
    if (state.fillAI) fillAISlots();
    recalcRows();
    broadcastLobbyState();
    if (onUpdate) onUpdate(state);
  }

  function hostOnMemberLeft(member) {
    if (!iAmHost || !state) return;
    state.slots = state.slots.filter(s => s.clientId !== member.client_id);
    // 座位重编号
    state.slots.forEach((s, i) => s.seat = i);
    if (state.fillAI) fillAISlots();
    recalcRows();
    broadcastLobbyState();
    if (onUpdate) onUpdate(state);
  }

  function recalcRows() {
    const seenHK = [], seenZom = [];
    state.slots.forEach(s => {
      if (s.team === "hk") { s.row = seenHK.length; seenHK.push(s); }
      else { s.row = seenZom.length; seenZom.push(s); }
    });
  }

  function hostChangeMode(mode) {
    if (!iAmHost || !state) return;
    state.mode = mode;
    // 把 AI 全清掉再补
    state.slots = state.slots.filter(s => !s.isAI);
    if (state.fillAI) fillAISlots();
    recalcRows();
    broadcastLobbyState();
    if (onUpdate) onUpdate(state);
  }
  function hostToggleFillAI(on) {
    if (!iAmHost || !state) return;
    state.fillAI = on;
    if (on) fillAISlots();
    else state.slots = state.slots.filter(s => !s.isAI);
    recalcRows();
    broadcastLobbyState();
    if (onUpdate) onUpdate(state);
  }

  // 客户端/房主：尝试跳到某个座位 idx（team 内的第几格）
  // 若目标是空位 → 换到该队伍
  // 若目标是 AI → 房主可以踢掉 AI 并让自己占那格
  // 若目标是其他真人 → 无操作
  function tryClaimSlot(team, teamIdx) {
    if (!state) return;
    const seatArr = state.slots.filter(s => s.team === team);
    const target = seatArr[teamIdx];
    if (target) {
      if (target.clientId === myClientId) return;           // 就是我自己
      if (!target.isAI) return;                              // 别人的位置不能抢
      // 是 AI：只有房主能踢，普通客户端就换团队即可
      if (iAmHost) {
        // 踢 AI + 把自己换过去（保持当前 civ 或换成 AI 的 civ）
        const me = state.slots.find(s => s.clientId === myClientId);
        state.slots = state.slots.filter(s => s !== target);
        if (me) {
          me.team = team;
          // 保持我原来的 civ，若与新阵营不符则默认第一个
          const validCivs = team === "hk" ? HK_CIVS : ZOM_CIVS;
          if (!validCivs.includes(me.civId)) me.civId = validCivs[0];
          me.ready = true;
        }
        if (state.fillAI) fillAISlots();
        recalcRows();
        broadcastLobbyState();
        if (onUpdate) onUpdate(state);
        return;
      }
    }
    // 空位或我想换阵营：调用 sendMyChoice
    const validCivs = team === "hk" ? HK_CIVS : ZOM_CIVS;
    const me = state.slots.find(s => s.clientId === myClientId);
    const keepCiv = (me && validCivs.includes(me.civId)) ? me.civId : validCivs[0];
    sendMyChoice(team, keepCiv);
  }

  // 房主开始游戏：把最终 config 广播给所有人
  function hostStartGame() {
    if (!iAmHost || !state) return null;
    // 确保各队都有单位
    const hk = state.slots.filter(s => s.team === "hk").length;
    const zom = state.slots.filter(s => s.team === "zom").length;
    if (hk === 0 || zom === 0) { HUD.showToast("双方都要有玩家或 AI"); return null; }

    const seed = Math.floor(Math.random() * 0xffffffff);
    // 输出简洁 config
    const players = state.slots.map(s => ({
      team: s.team, civId: s.civId, isAI: s.isAI,
      name: s.name, row: s.row,
      // 关联真实客户端（非 AI）
      clientId: s.clientId || null,
    }));
    Net.broadcast({ type:"start", seed, players });
    if (onStart) onStart({ seed, players });
    return { seed, players };
  }

  function setHostFlags(isHost, clientId) {
    iAmHost = !!isHost;
    myClientId = clientId;
  }
  function setStart(cb) { onStart = cb; }
  function setUpdate(cb) { onUpdate = cb; }
  function getState() { return state; }

  return {
    buildLocal,
    initHost, hostOnMemberJoined, hostOnMemberLeft, hostReceiveReady, hostChangeMode, hostToggleFillAI, hostStartGame,
    applyLobbyState, broadcastLobbyState,
    sendMyChoice, tryClaimSlot, setHostFlags, setStart, setUpdate, getState,
  };
})();

window.Lobby = Lobby;
