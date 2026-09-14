/* net.js — 联机
   -----------------------------------------------------------------
   模型（输入同步）：
   - 开局广播 seed + players，每端用同一份配置本地跑仿真
   - 只转发玩家/AI 的按键指令 {type:"action", act}，不传实体快照
   - 房主跑 AI，把 AI 指令当普通 action 转发
   - 胜负以房主本地仿真为准，广播 {type:"end", winner, duration}
   -----------------------------------------------------------------
   消息类型：
   { type:"lobby_state",  state }
   { type:"lobby_ready",  clientId, team, civId }
   { type:"start",        seed, players, mode }
   { type:"action",       act }     // {op,seat,unit|kind|skill}
   { type:"end",          winner, duration, players }
   -----------------------------------------------------------------
*/

const Net = (function () {

  let room = null;
  let onEvent = null;

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
    return r;
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
