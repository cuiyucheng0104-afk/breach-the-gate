// TapTap 联机自检：内存里假一个 TapTap 联机服务，两个玩家按同一房间号匹配，走完握手、互发动作、再来一局、离开。
// 用法：node tools/taproom_check.mjs
import { DECKS } from '../chess.js';
const assert = (c, m) => { if (!c) throw new Error('联机自检失败：' + m); };
const later = f => setTimeout(f, 1);
function server() { const rooms = [], ls = {}; let n = 0;
  const others = (room, id, f) => room.players.filter(p => p.id !== id).forEach(p => ls[p.id]?.forEach(f));
  const client = () => { const id = 'p' + ++n; let room = null; ls[id] = [];
    const ok = (a, r) => later(() => a.success?.(r));
    return { getOnlineBattleManager: () => ({
      registerListener: l => ls[id].push(l), connect: a => ok(a, { playerId: id }),
      matchRoom: a => { const { type, matchParams } = a.data.roomCfg;
        room = rooms.find(r => r.type === type && r.level === matchParams.level && r.players.length < 2);
        if (!room) rooms.push(room = { id: 'r' + n, type, level: matchParams.level, ownerId: id, players: [] });
        room.players.push({ id }); others(room, id, l => l.onPlayerEntered?.({ roomId: room.id, playerInfo: { id } })); ok(a, { roomInfo: { ...room } }); },
      sendCustomMessage: a => { const msg = a.data.msg; later(() => room?.players.forEach(p => ls[p.id].forEach(l => l.onCustomMessageReceived?.({ playerId: id, message: msg, type: 0 })))); ok(a, {}); },
      leaveRoom: a => { if (room) { room.players = room.players.filter(p => p.id !== id); others(room, id, l => l.onPlayerLeft?.({ roomId: room.id, playerId: id })); if (!room.players.length) rooms.splice(rooms.indexOf(room), 1); room = null; } ok(a, {}); },
    }) }; };
  return { client, rooms };
}
const srv = server(), tapA = srv.client(), tapB = srv.client(), tapC = srv.client();
globalThis.tap = tapA; const A = await import('../taproom.js?a');
assert(A.available(), '有 tap 对象时应当可用');
const dA = { name: '甲', cards: DECKS[0].cards }, dB = { name: '乙', cards: DECKS[1].cards };
const roomA = await A.match(dA, '4321');
globalThis.tap = tapC; const C = await import('../taproom.js?c');
let err = ''; try { await C.match(dB, '9999', true); } catch (e) { err = e.message; }
assert(err.includes('没有这个房间'), '加入不存在的房间应当报错：' + err); assert(!srv.rooms.some(r => r.level === '9999'), '没加入成功不该留下空房');
globalThis.tap = tapB; const B = await import('../taproom.js?b');
const lB = await B.match(dB, '4321', true).then(r => r.ready), lA = await roomA.ready;
assert(lA.me === 1 - lB.me, '两边先后手应当相反');
assert(JSON.stringify(lA.decks) === JSON.stringify(lB.decks), '两边卡组顺序应当一致');
assert(lA.rnd() === lB.rnd() && lA.rnd() === lB.rnd(), '两边洗牌种子应当一致');
assert(lA.foe.name === '乙' && lB.foe.name === '甲', '名字传错了');
for (let i = 0; i < 20; i++) lA.send({ k: 'move', i }); // 一回合连走很多步：排队发，顺序不乱
for (let i = 0; i < 20; i++) assert((await lB.next()).i === i, '动作顺序乱了');
const [rA, rB] = await Promise.all([lA.rematch(), lB.rematch()]);
assert(rA.me === lA.me ^ 1 && rB.me === lB.me ^ 1, '再来一局应当换先后手'); assert(rA.rnd() === rB.rnd(), '再来一局种子应当一致');
rB.close(); err = ''; try { await rA.next(); } catch (e) { err = e.message; }
assert(err === '对方离开了。', '对方离开应当报出来：' + err);
console.log('联机自检通过'); process.exit(0); // 发送队列的计时器可能还挂着
