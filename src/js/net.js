/* net.js — 联机（宿主权威模式）
   -----------------------------------------------------------------
   模型：
   - 房主 (seat=0) 跑仿真；每 5 帧 (~166ms) 广播一个 state snapshot
   - 客户端 只渲染 snapshot；发送本地动作到房主
   - 房主 收到动作 → applyAction → 下一次 snapshot 里反映
   - AI 也在房主上跑
   -----------------------------------------------------------------
   消息类型（发在 GameHubRoom.broadcast/send 的 data 字段里）：
   { type:"lobby_state",  players, mode, hostSeat }        // 房主 → 全体：大厅状态
   { type:"lobby_ready",  ready:true, civ:"..." }          // 客户端 → 全体：我准备好了 & 选好文明
   { type:"start",        seed, players }                  // 房主 → 全体：开局
   { type:"snapshot",     snap }                           // 房主 → 全体
   { type:"action",       act }                            // 客户端 → 房主
   { type:"end",          winner, players, duration }      // 房主 → 全体
   { type:"chat",         msg }                            // any (未实现，预留)
   -----------------------------------------------------------------
*/

const Net = (function () {

  // room 实例（GameHubRoom）
  let room = null;
  let onEvent = null; // callback: (type, msg) => void

  function isConnected() { return !!(room && room.ws && room.ws.readyState === 1); }
  function iAmHost() { return room && room.you && room.you.seat === 0; }
  function myClientId() { return room && room.you ? room.you.client_id : null; }
  function mySeat() { return room && room.you ? room.you.seat : null; }
  function members() { return (room && room.room && room.room.members) || []; }

  async function connect(gameId) {
    if (!window.GameHubRoom) throw new Error("GameHubRoom SDK 未加载");
    room = new GameHubRoom();
    room.on("welcome", m => emit("welcome", m));
    room.on("member_joined", m => emit("member_joined", m));
    room.on("member_left", m => emit("member_left", m));
    room.on("message", m => {
      // m: { from, to, data }
      const d = m.data || {};
      emit("msg", { from: m.from, to: m.to, ...d });
    });
    room.on("error", m => emit("error", m));
    room.on("close", () => emit("close", {}));
    await room.connect();
    return room;
  }

  async function createRoom(gameId, maxPlayers = 4) {
    const r = await room.createRoom(gameId, maxPlayers);
    return r; // { code, ... }
  }
  async function listRooms(gameId) {
    return await room.listRooms(gameId);
  }
  function join(code) { room.join(code); }
  function leave() { if (room) { try { room.leave(); } catch{} } }
  function close() { if (room) { try { room.close(); } catch{} room = null; } }

  function broadcast(data) { if (isConnected()) room.broadcast(data); }
  function sendTo(clientId, data) { if (isConnected()) room.send(clientId, data); }

  function on(cb) { onEvent = cb; }
  function emit(type, msg) { if (onEvent) onEvent(type, msg); }

  // Ping keep-alive
  let pingTimer = null;
  function startPing() {
    if (pingTimer) return;
    pingTimer = setInterval(() => { if (isConnected()) { try { room.ping(); } catch{} } }, 25000);
  }
  function stopPing() { if (pingTimer) { clearInterval(pingTimer); pingTimer = null; } }

  return {
    connect, createRoom, listRooms, join, leave, close,
    broadcast, sendTo, on,
    isConnected, iAmHost, myClientId, mySeat, members,
    startPing, stopPing,
    get room() { return room; },
  };
})();

window.Net = Net;
