// TapTap 多人联机（tap.getOnlineBattleManager，TapTap 小游戏文档「多人联机」）：在 TapTap 里玩时，房间对战走这个，不用 PeerJS。
// 房间号当匹配参数：开房的人和输入同一房间号的人用 matchRoom 匹到同一个两人房；房主（ownerId）当 PeerJS 版里的“开房的人”。
// 进房以后的收发协议和 room.js 完全一样（hello / start / act / again / bye），这里只是把 TapTap 的自定义消息包成 room.js 用的连接对象。
// 注意：TapTap 包现在不带联机（tools/build_h5.py 会把本文件换成空壳），等联网资质弄清楚再打开。
import { wire, greet, link } from './room.js';
const TYPE = 'duel-v1', GAP = 80; // 自定义消息每秒最多 15 条（和改房间属性共用），一回合连着走好几步时排队，每条隔 80 毫秒
const T = () => typeof tap !== 'undefined' ? tap : globalThis.tap;
export const available = () => !!T()?.getOnlineBattleManager;
const call = (o, m, data) => new Promise((ok, no) => o[m]({ ...(data ? { data } : {}), success: ok, fail: e => no(new Error(e?.errMsg || '联机出错了。')) }));

let mgr = null, me = null, cur = null; // cur：当前房间的连接对象，收到的事件都转给它
async function online() {
  if (!mgr) { mgr = T().getOnlineBattleManager();
    const gone = why => () => cur?.emit(cur.started ? 'close' : 'wait', why);
    mgr.registerListener({
      onCustomMessageReceived: e => { if (e.playerId !== me && cur) try { cur.emit('data', typeof e.message === 'string' ? JSON.parse(e.message) : e.message); } catch { /* 不是我们的消息 */ } },
      onPlayerLeft: gone('对方离开了。'), onPlayerOffline: gone('对方掉线了。'), onPlayerKicked: gone('被移出了房间。'),
      onDisconnected: () => { me = null; cur?.emit('close'); }, onBattleServiceError: () => cur?.emit('error'),
    }); }
  if (!me) me = (await call(mgr, 'connect')).playerId;
}
function conn() { // 装成 PeerJS 连接的样子：on / send / open
  const hs = {}, out = []; let timer = null;
  const pump = () => { const m = out.shift(); if (!m) return void (timer = null);
    mgr.sendCustomMessage({ data: { msg: JSON.stringify(m), type: 0 }, success() {}, fail() {} }); timer = setTimeout(pump, GAP); };
  return { open: true, started: false, on: (e, f) => (hs[e] ||= []).push(f), emit: (e, x) => (hs[e] || []).forEach(f => f(x)),
    send: m => { out.push(m); if (!timer) pump(); } };
}

// 开房（join=false）或按房间号加入（join=true）：返回 { code, ready, cancel }，ready 在开局后给出 link（同 room.js）
export async function match(deck, code, join = false) {
  await online();
  const res = await call(mgr, 'matchRoom', { roomCfg: { maxPlayerCount: 2, type: TYPE, matchParams: { level: String(code), score: '0' } }, playerCfg: { customProperties: JSON.stringify({ name: deck.name }) } });
  const room = res.roomInfo, host = room.ownerId === me, c = conn(), leave = () => { if (cur === c) cur = null; mgr.leaveRoom({ success() {}, fail() {} }); };
  if (join && host) { leave(); throw new Error('没有这个房间：房间号不对，或者房主已经离开。'); } // 想加入却自己成了房主，说明这个房间号没人开
  cur = c; const ch = wire(c, { destroy: leave }, host);
  const ready = new Promise((ok, no) => {
    const go = l => { c.started = true; ok(l); };
    if (host) greet(c, ch, deck, go);
    else { c.on('data', m => { if (m?.t === 'reject') { leave(); no(new Error(m.why)); } else if (m?.t === 'start' && !c.started) go(link(1 - m.hostSide, m.decks, m.seed, deck.name, m.names[0], ch, false)); });
      c.on('wait', why => { leave(); no(new Error(why)); }); c.send({ t: 'hello', deck: deck.cards, name: deck.name }); }
  });
  return { code: String(code), ready, cancel: leave };
}
