// 联机房间：PeerJS（WebRTC 点对点）。房间号 4 位数字，房主的 peer id 是 PFX + 房间号。
// 双方各自跑同一份规则（规则里没有随机，洗牌只看种子），所以线上只传“打了哪张牌”这类动作；开局由房主发洗牌种子和先后手。
// 不防作弊：对方的手牌在本地内存里读得到，休闲对局够用。
import { deckError, CARDS } from './chess.js';
import { available as tapBattle, match as tapMatch } from './taproom.js'; // 在 TapTap 里走 TapTap 的多人联机，不用 PeerJS
const PFX = 'yibu-fanpan-v1-';
// 洗牌用的带种子随机数，两边种子一样洗出来就一样
export const mulberry32 = a => () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
// shortcut: 默认用 PeerJS 公共中转；要换成自己的，在浏览器里存 localStorage['yibu-fanpan.peer'] = '{"host":"...","port":9000,"path":"/","secure":true}'
const opts = () => { try { return JSON.parse(localStorage.getItem('yibu-fanpan.peer') || '{}'); } catch { return {}; } };
const load = () => window.Peer ? Promise.resolve(window.Peer) : new Promise((ok, no) => { const s = document.createElement('script'); s.src = 'vendor/peerjs.min.js'; s.onload = () => window.Peer ? ok(window.Peer) : no(new Error('联机组件没载入')); s.onerror = () => no(new Error('联机组件没载入')); document.head.append(s); });
const explain = e => new Error({ 'peer-unavailable': '没有这个房间：房间号不对，或者房主已经离开。', network: '连不上房间服务。', 'server-error': '连不上房间服务。', 'socket-error': '连不上房间服务。', 'socket-closed': '连不上房间服务。', timeout: '连不上房间服务（等了太久）。', 'browser-incompatible': '这个浏览器不支持联机。' }[e?.type] || e?.message || '联机出错了。');
const waitOpen = (peer, ms = 12000) => new Promise((ok, no) => { const t = setTimeout(() => no({ type: 'timeout' }), ms); peer.on('open', () => { clearTimeout(t); ok(); }); peer.on('error', e => { clearTimeout(t); no(e); }); });

// 一条连接的收发：收到的动作排队，next() 取下一个；断线时 next() 报错
export function wire(conn, peer, host) {
  const q = [], w = []; let dead = '', want = 0, ask = null; // 再来一局：want 的 1 是我点了、2 是对方点了；ask 是我在等的那一局
  const fail = why => { if (dead) return; dead = why; for (const x of w.splice(0)) x.no(new Error(why)); ask?.no(new Error(why)); ask = null; };
  const again = () => { if (!ask || want !== 3) return; want = 0; const a = ask; ask = null; // 房主说了算：换先后手，换种子，其余照旧
    if (host) { const l = a.l, side = 1 - l.me, mineC = l.decks[l.me], foeC = l.decks[1 - l.me], decks = side ? [foeC, mineC] : [mineC, foeC], seed = Math.floor(Math.random() * 4294967296) >>> 0; conn.send({ t: 'start', seed, hostSide: side, decks, names: [l.mine.name, l.foe.name] }); a.ok(link(side, decks, seed, l.mine.name, l.foe.name, ch, true)); } else a.guest = true, ask = a; };
  conn.on('data', m => { if (m?.t === 'act') { const x = w.shift(); if (x) x.ok(m.a); else q.push(m.a); } else if (m?.t === 'bye') fail('对方离开了。');
    else if (m?.t === 'again') { want |= 2; again(); }
    else if (m?.t === 'start' && ask?.guest) { const a = ask; ask = null; want = 0; a.ok(link(1 - m.hostSide, m.decks, m.seed, a.l.mine.name, m.names[0], ch, false)); } });
  conn.on('close', () => fail('对方断开了连接。')); conn.on('error', () => fail('连接出错了。'));
  const ch = {
    again: l => dead ? Promise.reject(new Error(dead)) : new Promise((ok, no) => { ask = { ok, no, l, guest: !host }; want |= 1; conn.send({ t: 'again' }); again(); }),
    send: a => { if (conn.open) conn.send({ t: 'act', a }); },
    next: () => q.length ? Promise.resolve(q.shift()) : dead ? Promise.reject(new Error(dead)) : new Promise((ok, no) => w.push({ ok, no })),
    close: () => { fail('已离开。'); try { conn.send({ t: 'bye' }); } catch { /* 连接已经没了 */ } setTimeout(() => peer.destroy(), 300); }, // 留一拍让“再见”发出去
  };
  return ch;
}
export const link = (me, decks, seed, mineName, foeName, ch, host) => { const l = { me, decks, rnd: mulberry32(seed), mine: { name: mineName, cards: decks[me] }, foe: { name: foeName, cards: decks[1 - me] }, ...ch, rematch: () => ch.again(l) }; return l; };

// 房主：等对方发来 hello（卡组和名字），核对卡组，定先后手和洗牌种子发回 start；卡组不对就 reject。PeerJS 和 TapTap 联机（taproom.js）共用
export function greet(c, ch, deck, ok, rejected = () => {}) { let started = false;
  c.on('data', m => { if (m?.t !== 'hello' || started) return;
    const bad = !Array.isArray(m.deck) ? '对方的卡组不对。' : deckError(m.deck, m.deck.filter(id => CARDS[id]?.boss || CARDS[id]?.prize)); // 对方带的首领牌和锦标赛奖励牌没法核实，认他自己的
    if (bad) { c.send({ t: 'reject', why: bad }); rejected(); return; }
    started = true; const hostSide = Math.random() < .5 ? 0 : 1, seed = Math.floor(Math.random() * 4294967296) >>> 0, decks = hostSide ? [m.deck, deck.cards] : [deck.cards, m.deck];
    c.send({ t: 'start', seed, hostSide, decks, names: [deck.name, String(m.name || '').slice(0, 16)] });
    ok(link(hostSide, decks, seed, deck.name, String(m.name || '对手').slice(0, 16), ch, true)); });
}

// 开房：返回 { code, ready, cancel }。ready 在有人加入并开局后给出 link（见 link()）；deck 是 { name, cards }
export async function createRoom(deck, owned) {
  if (tapBattle()) return tapMatch(deck, String(1000 + Math.floor(Math.random() * 9000)));
  const Peer = await load(); let peer, code;
  for (let k = 0; ; k++) {
    if (k >= 6) throw new Error('房间号都被占了，过一会儿再试。');
    code = String(1000 + Math.floor(Math.random() * 9000)); peer = new Peer(PFX + code, opts());
    try { await waitOpen(peer); break; } catch (e) { peer.destroy(); if (e.type !== 'unavailable-id') throw explain(e); }
  }
  let conn = null, started = false;
  const ready = new Promise((ok, no) => {
    peer.on('error', e => no(explain(e))); peer.on('disconnected', () => { if (!started) no(new Error('和房间服务断开了。')); });
    peer.on('connection', c => {
      if (conn) { c.on('open', () => { c.send({ t: 'reject', why: '这个房间已经有人了。' }); setTimeout(() => c.close(), 300); }); return; }
      conn = c; const ch = wire(c, peer, true); c.on('close', () => { if (!started) { conn = null; } });
      greet(c, ch, deck, l => { started = true; ok(l); }, () => { conn = null; });
    });
  });
  return { code, ready, cancel: () => peer.destroy() };
}

// 加入：房主开局后给出 link
export async function joinRoom(code, deck) {
  if (tapBattle()) return (await tapMatch(deck, code, true)).ready;
  const Peer = await load(), peer = new Peer(undefined, opts());
  try { await waitOpen(peer); } catch (e) { peer.destroy(); throw explain(e); }
  return new Promise((ok, no) => {
    let done = false; const bye = e => { if (done) return; done = true; peer.destroy(); no(e); }, t = setTimeout(() => bye(explain({ type: 'timeout' })), 15000);
    peer.on('error', e => bye(explain(e)));
    const c = peer.connect(PFX + code, { reliable: true, serialization: 'json' }), ch = wire(c, peer, false);
    c.on('open', () => c.send({ t: 'hello', deck: deck.cards, name: deck.name }));
    c.on('close', () => bye(new Error('房主断开了。')));
    c.on('data', m => { if (m?.t === 'reject') bye(new Error(m.why)); else if (m?.t === 'start' && !done) { done = true; clearTimeout(t); ok(link(1 - m.hostSide, m.decks, m.seed, deck.name, m.names[0], ch, false)); } }); // names[0] 是房主的卡组名
  });
}
