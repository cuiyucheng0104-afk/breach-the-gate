// 下棋规则核心（纯逻辑，node 和浏览器共用，不碰画面）。卡牌本身在 chess-cards.js。
// 系统框架参照 Stormbound 的公开玩法说明：4 条路 × 5 格、能量每回合 +1、战力同时是攻击和血量、
// 单位每回合自动前进、只能在自己前线以内出兵、12 张牌组、4 张手牌。
// 除了开局洗牌，全程没有随机数：同一个局面下，每一步会发生什么都能事先算出来画给玩家看。
import { build } from './chess-cards.js';

export const COLS = 4, ROWS = 5, HAND = 4, DECK = 12, BASE_HP = 10, N = COLS * ROWS, RAGE = 3, SHADE = 3, CORE = 8; // SHADE：一块暗影地格留几个回合；CORE：算力最多攒几点
export const tile = (r, c) => r * COLS + c, rowOf = t => Math.floor(t / COLS), colOf = t => t % COLS;
const fwd = side => side ? -1 : 1;                         // 0 号玩家的家在第 0 行，往最后一行走；1 号反过来
export const depth = (side, r) => side ? ROWS - 1 - r : r; // 离自己家几行
const inb = t => t >= 0 && t < N;
const adj4 = t => { const r = rowOf(t), c = colOf(t), o = []; if (r > 0) o.push(t - COLS); if (r < ROWS - 1) o.push(t + COLS); if (c > 0) o.push(t - 1); if (c < COLS - 1) o.push(t + 1); return o; };
const adj8 = t => { const r = rowOf(t), c = colOf(t), o = []; for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) { const R = r + dr, C = c + dc; if ((dr || dc) && R >= 0 && R < ROWS && C >= 0 && C < COLS) o.push(tile(R, C)); } return o; };
const foes = (s, side, ts) => ts.filter(t => inb(t) && s.board[t] && s.board[t].side !== side);
const pals = (s, side, ts) => ts.filter(t => inb(t) && s.board[t] && s.board[t].side === side);
export const CARDS = {};
const isUnit = u => !!u && CARDS[u.card].kind === 'unit';
// 一个单位的特性来自它自己的牌，再加上身上的装备（u.gear 是装备牌的 id）
const off = u => u.mute || u.frozen; // 被禁用的单位什么特性都没有；被冻住的在解冻前也一样
const trait = (u, k) => off(u) ? undefined : CARDS[u.card][k] || (u.gear ? CARDS[u.gear][k] : undefined); 
function fire(k, s, ev, u, ...a) { if (off(u)) return; const f = CARDS[u.card][k], g = u.gear && CARDS[u.gear][k]; if (f) f(s, ev, u, ...a); if (g && (k === 'onDeath' || s.board.includes(u))) g(s, ev, u, ...a); }

// ---------- 局面 ----------
const clone = s => ({ ...s, mana: [...s.mana], base: [...s.base], rage: [...s.rage], core: [...s.core], creep: [...s.creep], shade: [...s.shade], used: s.used.map(u => [...u]), seen: s.seen ? s.seen.map(u => [...u]) : [[], []], board: s.board.map(u => u && { ...u }), hand: s.hand.map(h => [...h]), deck: s.deck.map(d => [...d]) });
// opts 给闯关用：base 双方城堡血量；setup 开局摆在场上的 [{ side, card, tile, str }]；hand 保证出现在起手里的牌 [[我方], [对方]]；boss 哪一方有首领（它的城堡掉到一半以下时首领发怒）
export function newGame(decks, rnd, opts = {}) { // decks：两副牌，各 12 个卡牌 id
  const sh = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const hp = opts.base || [BASE_HP, BASE_HP];
  const s = { turn: 0, n: 1, mana: [3, 4], left: 3, base: [...hp], cap: [...hp], rage: [false, false], core: [0, 0], boss: opts.boss ?? -1, board: Array(N).fill(null), creep: Array(N).fill(-1), shade: Array(N).fill(0), used: [[], []], seen: [[], []], seed: opts.ordered ? -1 : Math.floor(rnd() * 4294967296) >>> 0, // seed：抽牌用的随机数种子（局面自己带着，同一个局面走同一步结果一样）；opts.ordered（教学用）时不随机，按牌序从上往下发
    hand: [[], []], deck: decks.map(d => sh([...d])), swapped: false, plays: 0, winner: null, uid: 1 }; // plays：这回合已经打出过几张牌（连击用）
  for (const x of opts.setup || []) { const c = CARDS[x.card]; s.board[x.tile] = { id: s.uid++, side: x.side, card: x.card, str: x.str ?? c.str, frozen: false, shield: !!c.shield }; if (c.hatch) s.board[x.tile].timer = c.hatch.turns; }
  for (const p of [0, 1]) for (const k of (opts.hand || [])[p] || []) { const i = s.deck[p].indexOf(k); if (i >= 0) s.deck[p].unshift(s.deck[p].splice(i, 1)[0]); }
  for (const p of [0, 1]) s.hand[p] = s.deck[p].splice(0, HAND); // 先手 3 点能量起步；后手前四个回合多 1 点作为补偿；各自每回合 +1
  return s;
}
// 前线：自己最靠前的单位或建筑所在的那一行；最远只到对方家门口的前一行。新兵只能放在前线以内的空格。
export function frontDepth(s, side) {
  let d = 0; s.board.forEach((u, t) => { if (u && u.side === side) d = Math.max(d, depth(side, rowOf(t))); });
  return Math.min(ROWS - 2, d);
}
export const canPlace = (s, side, t) => !s.board[t] && depth(side, rowOf(t)) <= frontDepth(s, side);

// ---------- 结算用的小动作（卡牌的能力都由它们拼出来） ----------
const elOf = card => CARDS[card].faction;
function fx(ev, k, card, from, to) { ev.push({ t: 'fx', k, el: elOf(card), from, to }); } // 只给画面看的：谁朝哪里放了什么
function buff(s, ev, t, n) { const u = s.board[t]; if (!u || !n) return; u.str += n; ev.push({ t: 'buff', tile: t, id: u.id, n, str: u.str }); }
function shift(s, ev, from, to, how) { const u = s.board[from]; s.board[to] = u; s.board[from] = null; ev.push({ t: how, id: u.id, from, to }); }
function summon(s, ev, side, card, t, str) { // 在空格子里放一个衍生物；格子不在棋盘上或已经有人就作罢
  if (!inb(t) || s.board[t]) return false;
  const c = CARDS[card], u = { id: s.uid++, side, card, str: str ?? c.str, frozen: false, shield: !!c.shield }; if (c.hatch) u.timer = c.hatch.turns;
  s.board[t] = u; ev.push({ t: 'spawn', id: u.id, side, card, tile: t, str: u.str, shield: u.shield, token: true }); return true;
}
function hitBase(s, ev, side, n, id, from) { if (n <= 0) return; s.base[side] -= n; ev.push({ t: 'base', side, n, hp: Math.max(0, s.base[side]), id, from }); if (s.base[side] <= 0 && s.winner === null) s.winner = 1 - side;
  if (s.winner === null && side === s.boss && !s.rage[side] && s.base[side] * 2 <= s.cap[side]) { // 首领发怒（只一次）：场上的首领 +3 战力并获得圣盾；之后再打出首领牌也多 3 点
    s.rage[side] = true; ev.push({ t: 'rage', side }); s.board.forEach((u, t) => { if (u && u.side === side && CARDS[u.card].boss) { buff(s, ev, t, RAGE); shieldUp(s, ev, t); } }); } }
function mend(s, ev, side, n) { const k = Math.min(n, s.cap[side] - s.base[side]); if (k > 0) { s.base[side] += k; ev.push({ t: 'heal', side, n: k, hp: s.base[side] }); } }
function morph(s, ev, t, card, str, why) { const u = s.board[t]; s.board[t] = { id: u.id, side: u.side, card, str: str ?? CARDS[card].str, frozen: false, shield: !!CARDS[card].shield }; ev.push({ t: 'morph', id: u.id, tile: t, card, str: s.board[t].str, side: u.side, why }); } // 原地变成另一张牌：蛋孵化、被变成纸鹤
function poison(s, ev, t) { const u = s.board[t]; if (isUnit(u) && !u.poison) { u.poison = true; u.vital = false; ev.push({ t: 'poison', tile: t, id: u.id }); } }
function vitalize(s, ev, t) { const u = s.board[t]; if (isUnit(u) && !u.vital) { u.vital = true; u.poison = false; ev.push({ t: 'vital', tile: t, id: u.id }); } } // 活力：它每个回合开始时 +1 战力；和中毒互相顶掉 // 中毒：它每个回合开始时 −1 战力，直到倒下
function mute(s, ev, t) { const u = s.board[t]; if (u && !u.mute) { u.mute = true; delete u.gear; ev.push({ t: 'mute', tile: t, id: u.id }); } }          // 禁用：能力全部失效，装备也掉了
function convert(s, ev, t, side) { const u = s.board[t]; u.side = side; u.frozen = false; ev.push({ t: 'morph', id: u.id, tile: t, card: u.card, str: u.str, side, why: 'convert', shield: u.shield, gear: u.gear, poison: u.poison, vital: u.vital, mute: u.mute }); } // 策反：换边
// 从牌库里来一张：随机的一张（教学里按顺序）。这回合打出和换掉的牌先放在一边（used），回合结束补完手牌才洗回牌库——刚用掉的牌不会马上又抽回来
function take(s, side) { const d = s.deck[side]; if (!d.length) d.push(...s.used[side].splice(0)); if (s.seed < 0) return d.shift(); s.seed = (Math.imul(s.seed, 1664525) + 1013904223) >>> 0; return d.splice(Math.floor(s.seed / 4294967296 * d.length), 1)[0]; }
function draw(s, ev, side, n) { let k = 0; while (k < n && s.hand[side].length < HAND && s.deck[side].length + s.used[side].length) { s.hand[side].push(take(s, side)); k++; } if (k) ev.push({ t: 'draw', side, n: k }); } // 抽牌：手牌最多 4 张
function freeze(s, ev, t) { const u = s.board[t]; if (isUnit(u) && !u.frozen) { u.frozen = true; ev.push({ t: 'freeze', tile: t, id: u.id }); } }
function shieldUp(s, ev, t) { const u = s.board[t]; if (u && !u.shield) { u.shield = true; ev.push({ t: 'shield', tile: t, id: u.id, on: true }); } }
function creep(s, ev, t, side) { if (!inb(t)) return; s.shade[t] = SHADE; if (s.creep[t] !== side) { s.creep[t] = side; ev.push({ t: 'creep', tile: t, side }); } } // 暗影地格：站在上面的敌人每回合掉 1 点
// 算力（机核和零号协议的机制）：每个玩家一个跨回合保留的计数（每次结束回合 −1，见 apply 的结束回合），“运算”往上加，“释放”一次用光，按用掉的点数放大效果
function charge(s, ev, side, n) { const k = Math.min(n, CORE - s.core[side]); if (k > 0) { s.core[side] += k; ev.push({ t: 'core', side, n: k, total: s.core[side] }); } }
function release(s, ev, side) { const n = s.core[side]; if (n > 0) { s.core[side] = 0; ev.push({ t: 'core', side, n: -n, total: 0 }); } return n; }
function hurt(s, ev, t, n, passed) { // 能力和法术造成的伤害
  const u = s.board[t]; if (!u || n <= 0) return;
  if (u.shield) { u.shield = false; ev.push({ t: 'shield', tile: t, id: u.id, on: false }); return; } // 圣盾：挡下一次伤害
  const gt = t + fwd(u.side) * COLS, g = inb(gt) ? s.board[gt] : null;
  if (!passed && g && g.side === u.side && trait(g, 'guard')) { const half = Math.floor(n / 2); if (half) { n -= half; hurt(s, ev, gt, half, true); } }
  u.str -= n; ev.push({ t: 'hurt', tile: t, id: u.id, n, str: Math.max(0, u.str) });
  if (u.str <= 0) { if (s.board[t] === u) kill(s, ev, t); } else fire('onHurt', s, ev, u, t);
}
function zap(s, ev, card, from, tiles, n, k = 'bolt') { tiles = tiles.filter(t => inb(t) && s.board[t]); if (!tiles.length) return; fx(ev, k, card, from, tiles); for (const t of tiles) hurt(s, ev, t, n); } // 远程伤害：先放特效再结算
function kill(s, ev, t) {
  const u = s.board[t]; s.board[t] = null; ev.push({ t: 'die', tile: t, id: u.id });
  fire('onDeath', s, ev, u, t);
  for (const x of adj4(t)) { const w = s.board[x]; if (w) fire('onNearDeath', s, ev, w, x, t, u); } // 旁边有人在意“相邻有单位倒下”
  if (isUnit(u)) for (const k of s.board.filter(w => w && w.side === u.side && CARDS[w.card].onAllyDeath).map(w => w.id)) { const x = s.board.findIndex(w => w && w.id === k); if (x >= 0) fire('onAllyDeath', s, ev, s.board[x], x, t, u); } // 场上有人在意“任何一个友方单位倒下”（首领牌用）
}
// 对撞：双方同时按对方的战力扣。打赢的一方带着剩下的战力占住那一格；打平则同归于尽。
function attack(s, ev, from, to) {
  const a = s.board[from];
  ev.push({ t: 'attack', id: a.id, from, to });
  fire('onAttack', s, ev, a, from, to);
  const siege = trait(a, 'siege'); if (siege && s.board[from] === a && s.board[to] && !isUnit(s.board[to])) zap(s, ev, a.card, from, [to], siege, 'slash'); // 攻城：打建筑时先多打几点
  const thorns = s.board[to] && trait(s.board[to], 'thorns');                 // 荆棘：攻击它的人先挨一下
  if (thorns && s.board[from] === a) { fx(ev, 'thorn', s.board[to].card, to, [from]); hurt(s, ev, from, thorns); }
  const d = s.board[to];
  if (d && s.board[from] === a) {
    if (isUnit(d) && ((trait(a, 'duel') && d.str > a.str) || (trait(d, 'duel') && a.str > d.str))) { // 同归（李俊昊的万剑归宗）：和比自己强的单位对撞，按打平算，双方一起倒下
      const big = d.str > a.str ? to : from; fx(ev, 'swords', (big === to ? a : d).card, big === to ? from : to, [big]); kill(s, ev, to); const at = s.board.indexOf(a); if (at >= 0) kill(s, ev, at); return -1; }
    let x = a.str, y = d.str;
    if (d.shield) { d.shield = false; ev.push({ t: 'shield', tile: to, id: d.id, on: false }); x = 0; }
    if (a.shield) { a.shield = false; ev.push({ t: 'shield', tile: from, id: a.id, on: false }); y = 0; }
    d.str -= x; a.str -= y;
    if (x) ev.push({ t: 'hurt', tile: to, id: d.id, n: x, str: Math.max(0, d.str), melee: true }); if (y) ev.push({ t: 'hurt', tile: from, id: a.id, n: y, str: Math.max(0, a.str), melee: true });
    if (d.str <= 0) kill(s, ev, to); else if (x) fire('onHurt', s, ev, d, to); // 被打的一方先结算
    const at = s.board.indexOf(a); if (at >= 0) { if (a.str <= 0) kill(s, ev, at); else if (y) fire('onHurt', s, ev, a, at); } // 按引用找攻击者：对面倒下时的效果可能已经把它吹到别的格子去了，战力见底照样要倒
  }
  if (s.board[from] !== a) return s.board.indexOf(a); // 不在原地了（倒下是 −1，被吹走就是新位置）：不再往目标格里走
  if (!s.board[to]) shift(s, ev, from, to, 'move');
  fire('onAfter', s, ev, a, s.board.indexOf(a)); // “打完还活着的话”
  return s.board.indexOf(a);
}
const acted = (ev, from) => ev.slice(from).some(e => e.t === 'attack'); // 这一步有没有出手（没挪地方不等于没用掉这一步）
// 一个单位走一步。已经在场上的单位每回合只往前：正前有敌人就打，没有就前进，不拐弯。
// fio：刚打出来、还在冲锋的单位会拐去打旁边的敌人，顺序固定：正前 → 靠棋盘中间的那一侧 → 靠边的那一侧。
// 唯一的例外是嘲讽：旁边有带嘲讽的敌人时，不管是不是在冲锋都必须先打它。
function step(s, ev, t, fio) {
  const u = s.board[t], side = u.side, r = rowOf(t), col = colOf(t), nr = r + fwd(side), out = nr < 0 || nr >= ROWS; // out：已经在对方家门口，再走就是进城门
  const front = out ? -1 : tile(nr, col), inner = col < COLS / 2 ? col + 1 : col - 1, outer = col < COLS / 2 ? col - 1 : col + 1;
  const cands = foes(s, side, [...(out ? [] : [front]), ...(trait(u, 'fixed') ? [] : [inner, outer].filter(x => x >= 0 && x < COLS).map(x => tile(r, x)))]);
  const taunt = cands.find(x => trait(s.board[x], 'taunt'));
  if (out && taunt === undefined) { hitBase(s, ev, 1 - side, u.str + (trait(u, 'siege') || 0), u.id, t); kill(s, ev, t); return -1; } // 走到头：按战力打城堡（攻城的再多几点），自己也离场。旁边站着嘲讽的敌人就进不了门，得先打它
  const target = taunt ?? (fio ? cands[0] : cands.find(x => x === front));
  if (target !== undefined) { if (target === taunt && target !== front) ev.push({ t: 'taunt', id: u.id, by: s.board[target].id, tile: target }); return attack(s, ev, t, target); } // 被嘲讽拽过去的：记一笔，画面上好说明白
  if (!s.board[front]) { shift(s, ev, t, front, 'move'); return front; }
  return t; // 前面是自己人：原地等
}
// 回合开始，依次是：建筑阶段（你的建筑各自生效、蛋孵化）→ 状态阶段（暗影地格、中毒、活力）→ 单位的“回合开始时”能力 → 前进阶段。
// 每个阶段里都是离对方最近的先来，同一行从左到右。
function advance(s, ev, side) {
  const order = []; s.board.forEach((u, t) => { if (u && u.side === side) order.push([depth(side, rowOf(t)), colOf(t), u.id]); });
  order.sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  const where = id => s.board.findIndex(u => u && u.id === id), fresh = new Set(); // fresh：这回合刚孵出来的，不跟着走
  const begin = id => { const t = where(id); if (t < 0) return; const u = s.board[t], c = CARDS[u.card];
    if (u.timer !== undefined && --u.timer <= 0) { fresh.add(id); morph(s, ev, t, c.hatch.card, c.hatch.str, 'hatch'); return; } // 蛋孵出来了
    fire('onTurn', s, ev, u, t); };
  const mine = order.map(o => o[2]), struct = id => { const t = where(id); return t >= 0 && !isUnit(s.board[t]); };
  for (const id of mine.filter(struct)) begin(id);
  const burnt = s.creep.map((o, t) => o === side && s.board[t] && s.board[t].side !== side ? t : -1).filter(t => t >= 0);
  if (burnt.length) { ev.push({ t: 'fx', k: 'creep', el: 'f4', from: burnt[0], to: burnt }); for (const t of burnt) hurt(s, ev, t, 1); }
  s.creep.forEach((o, t) => { if (o === side && --s.shade[t] <= 0) { s.creep[t] = -1; ev.push({ t: 'creep', tile: t, side: -1 }); } }); // 暗影不是永久的：主人每过一个回合少一回合，到期就散
  const sick = mine.map(where).filter(t => t >= 0 && s.board[t].poison);
  if (sick.length) { ev.push({ t: 'fx', k: 'venom', el: 'f5', from: sick[0], to: sick }); for (const t of sick) if (s.board[t] && s.board[t].poison) hurt(s, ev, t, 1); }
  for (const id of mine) { const t = where(id); if (t >= 0 && s.board[t].vital) buff(s, ev, t, 1); }
  for (const id of mine.filter(id => where(id) >= 0 && !struct(id) && !fresh.has(id))) begin(id);
  for (const id of mine) {
    const t = where(id); if (t < 0 || !isUnit(s.board[t]) || fresh.has(id)) continue;
    if (s.board[t].frozen) { s.board[t].frozen = false; ev.push({ t: 'thaw', tile: t, id }); continue; }
    const n0 = ev.length, x = step(s, ev, t); if (s.winner !== null) return;
    if (x >= 0 && (x !== t || acted(ev, n0)) && trait(s.board[x], 'swift')) { step(s, ev, x); if (s.winner !== null) return; } // 乘风：每个回合走两步。第一步是打了一下、人还在原地（对面倒下后原地又冒出东西，或者对面靠圣盾没倒），第二步照样走
  }
}
const H = { charge, release, CORE, COLS, ROWS, N, tile, rowOf, colOf, fwd, depth, inb, adj4, adj8, foes, pals, isUnit, fx, buff, shift, summon, hitBase, mend, freeze, shieldUp, creep, hurt, zap, kill, step, morph, poison, vitalize, mute, convert, draw, HAND, frontDepth, BASE_HP, CARDS };
const built = build(H); Object.assign(CARDS, built.cards);
export const FACTIONS = built.factions;   // { f1: { name, style, key }, ... , n: 中立 }
export const STARTERS = built.starters;   // 每个阵营一套预设卡组
export const FKEYS = Object.keys(FACTIONS).filter(f => f !== 'n');
export const RETIRED = { neutral_dex: 'neutral_jaxi' }; // 删掉的牌 → 接班的牌。玩家存档里的卡组（自组的、闯关里锁定的）可能还带着旧牌：读进来时换掉，不然卡组作废、闯关开打直接报错
// 从中立挪进某个阵营的牌 → 别的阵营的卡组里换成这几张中立牌里第一张卡组里还没有的（不换的话整副卡组作废，存档里的卡组会消失）
export const MOVED = { n_scroll: ['n_courier', 'n_militia', 'potion'] }; // 2026-11-20 蓄能卷轴归机核
export const upgrade = cards => { if (!Array.isArray(cards)) return cards; let d = cards.map(c => (RETIRED[c] && !cards.includes(RETIRED[c]) ? RETIRED[c] : c));
  const f = d.map(c => CARDS[c]?.faction).find(x => x && x !== 'n');
  for (const [c, alts] of Object.entries(MOVED)) if (d.includes(c) && f && CARDS[c].faction !== f) { const a = alts.find(x => !d.includes(x)); if (a) d = d.map(x => x === c ? a : x); }
  return d; };
export const DECKS = built.decks;         // 按打法组好的预设卡组：[{ f, name, plan, cards }]
// 卡组代码：给别人抄卡组用的一串 48 个字符。每张牌取 id 的 24 位散列（3 个字节），12 张排好序拼起来再转成字母数字。
// 用 id 的散列而不是牌表里的序号：以后增删牌，旧代码照样认得。两张牌撞了同一个散列的话自检会拦住（那就给新牌换个 id）。
const h24 = id => { let h = 2166136261; for (const ch of id) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return (h ^ h >>> 24) & 0xffffff; };
export const codeTable = () => { const m = new Map(); for (const k of [...Object.keys(CARDS).filter(k => !CARDS[k].token), ...Object.keys(RETIRED)]) m.set(h24(k), [...(m.get(h24(k)) || []), k]); return m; }; // 散列 → 牌（自检用它查撞码）
export const deckCode = ids => btoa(String.fromCharCode(...ids.map(h24).sort((a, b) => a - b).flatMap(h => [h >> 16, h >> 8 & 255, h & 255]))).replace(/\+/g, '-').replace(/\//g, '_');
export function fromCode(str) { // 认不出来返回 null；认出来的只保证每张牌都存在，合不合组牌规则由 deckError 管
  str = String(str).replace(/\s/g, ''); if (!/^[\w-]{48}$/.test(str)) return null;
  const b = atob(str.replace(/-/g, '+').replace(/_/g, '/')), t = codeTable(), ids = [];
  for (let i = 0; i < b.length; i += 3) { const k = t.get(b.charCodeAt(i) << 16 | b.charCodeAt(i + 1) << 8 | b.charCodeAt(i + 2)); if (!k) return null; ids.push(k[0]); }
  return upgrade(ids);
}
export const PROTOCOL = built.protocol;   // 零号协议：锦标赛冠军奖励的 12 张中立牌（Q1 的卡组）
// 卡组体检：照“制胜手段 / 前线 / 解场 / 费用”几条经验看一副牌缺什么。返回 [{ ok, text }]
export function deckInsight(ids) {
  const cs = ids.map(k => CARDS[k]), n = f => cs.filter(f).length, T = c => c.text || '';
  const rush = n(c => c.kind === 'unit' && (c.move >= 2 || c.swift || c.anywhere)), chip = n(c => /对方城堡受|攻城/.test(T(c))), grow = n(c => /\+\d+ 战力|活力/.test(T(c))), swarm = n(c => /放一[只座]/.test(T(c)));
  const front = n(c => c.kind === 'unit' && c.move >= 1), answer = n(c => /点伤害|消灭|冻住|变成 1 战力|吹退|吹回|禁用|中毒|变成你的/.test(T(c)) && !/你自己的城堡受/.test(T(c))), high = n(c => c.cost >= 4), nonUnit = n(c => c.kind === 'spell'), low = n(c => c.cost <= 2);
  const out = [{ ok: rush + chip >= 2 || grow + swarm >= 4, text: `制胜手段：快攻 ${rush} 张 · 直伤和攻城 ${chip} 张 · 加战力 ${grow} 张 · 铺场 ${swarm} 张` + (rush + chip >= 2 || grow + swarm >= 4 ? '' : '。哪一种都不成规模，很难把对面的城堡打穿') },
    { ok: front >= 4, text: `能推进前线的兵 ${front} 张` + (front >= 4 ? '' : '。太少，前线推不出去就没地方放牌') },
    { ok: answer >= 2, text: `解场和控制 ${answer} 张` + (answer >= 2 ? '' : '。太少，对面出大个子或一堆小兵时没有办法') },
    { ok: high <= 4, text: `4 费以上 ${high} 张` + (high <= 4 ? '' : '。超过 4 张，开局容易一回合什么都出不了') },
    { ok: low >= 3, text: `1–2 费 ${low} 张` + (low >= 3 ? '' : '。低费牌太少，一回合很难连出几张') },
    { ok: nonUnit <= 5, text: `法术和装备 ${nonUnit} 张` + (nonUnit <= 5 ? '' : '。太多，开局可能没有能上场的兵') }];
  for (const tb of ['龙', '魔像', '骑士', '机械']) { const need = n(c => T(c).includes('其他' + tb) || T(c).includes('其他的' + tb)), have = n(c => c.tribe === tb); if (need) out.push({ ok: have >= 4, text: `${tb}联动牌 ${need} 张，${tb} ${have} 个` + (have >= 4 ? '' : '。同族太少，联动牌拿不到多少加成') }); }
  return out;
}
export const factionOf = id => CARDS[id].faction;
export function deckError(ids, owned) { // 组牌规则：正好 12 张、不重复、只能用一个阵营加中立；首领牌和锦标赛奖励牌要先赢到手（owned 是已获得的这两种牌），首领牌一副最多带一张
  if (ids.length !== DECK) return `卡组要正好 ${DECK} 张，现在 ${ids.length} 张。`;
  if (new Set(ids).size !== ids.length) return '同一张牌只能带一张。';
  if (ids.some(k => !CARDS[k] || CARDS[k].token)) return '卡组里有不能带的牌。';
  const bosses = ids.filter(k => CARDS[k].boss); if (bosses.length > 1) return '一副卡组最多带一张首领牌。';
  if (bosses.some(k => !owned || !owned.includes(k))) return `「${CARDS[bosses[0]].name}」要先在闯关里击败它才能用。`;
  const prize = ids.find(k => CARDS[k].prize && (!owned || !owned.includes(k))); if (prize) return `「${CARDS[prize].name}」要先赢下卡牌联盟锦标赛才能用。`;
  const fs = new Set(ids.map(k => CARDS[k].faction).filter(f => f !== 'n')); if (fs.size > 1) return '一副卡组只能用一个阵营的牌，再加中立牌。';
  return '';
}

// ---------- 行动 ----------
// {type:'play', i, t}：打出第 i 张手牌到格子 t（无目标法术 t 传 -1）；{type:'swap', i}：换掉一张牌，每回合一次；{type:'end'}：结束回合
const costOf = (s, side, c) => (c.boss && s.boss === side ? c.lair : c.cost); // 首领关里首领一方打自己的首领牌按原费用（lair）；玩家带着首领牌是加过费的 cost
export function targets(s, i) { // 这张手牌现在能打到哪些格子
  const side = s.turn, c = CARDS[s.hand[side][i]]; if (!c || costOf(s, side, c) > s.left || s.winner !== null) return [];
  const all = s.board.map((u, t) => t);
  if (c.kind !== 'spell') return all.filter(t => !s.board[t] && depth(side, rowOf(t)) <= (c.anywhere ? ROWS - 2 : frontDepth(s, side))); // 奇袭的单位不受前线限制
  if (c.target === 'none') return !c.can || c.can(s, side) ? [-1] : [];
  return all.filter(t => s.board[t] && (c.target === 'ally' ? s.board[t].side === side && isUnit(s.board[t]) : s.board[t].side !== side) && (!c.can || c.can(s, side, t)));
}
export function legalPlays(s) { const out = []; s.hand[s.turn].forEach((id, i) => { for (const t of targets(s, i)) out.push({ type: 'play', i, t }); }); return out; }
export function apply(state, a) { // 返回新局面和这一步依次发生的事（给画面播动画用）
  const s = clone(state), ev = [], side = s.turn;
  if (s.winner !== null) return { state: s, events: ev };
  if (a.type === 'play') {
    const id = s.hand[side][a.i], c = CARDS[id];
    if (!targets(s, a.i).includes(a.t)) throw new Error('这张牌不能这样打');
    s.left -= costOf(s, side, c); s.hand[side].splice(a.i, 1); s.used[side].push(id); if (!s.seen[side].includes(id)) s.seen[side].push(id); // 打出的牌先放在一边，回合结束才洗回牌库；seen：双方亮过的牌（公开信息，大师电脑的网络要看对面出过什么）
    ev.push({ t: 'play', side, card: id, tile: a.t });
    if (c.kind === 'spell') { c.cast(s, ev, side, a.t); // 法术放完，场上在意“你施放了法术”的单位依次响应
      for (const k of s.board.filter(u => u && u.side === side).map(u => u.id)) { const x = s.board.findIndex(u => u && u.id === k); if (x >= 0 && s.winner === null) fire('onSpell', s, ev, s.board[x], x); }
    } else {
      const u = { id: s.uid++, side, card: id, str: c.str + (c.boss && s.rage[side] ? RAGE : 0), frozen: false, shield: !!c.shield }; if (c.hatch) u.timer = c.hatch.turns; s.board[a.t] = u;
      ev.push({ t: 'spawn', id: u.id, side, card: id, tile: a.t, str: u.str, shield: u.shield });
      if (c.onPlay) c.onPlay(s, ev, u, a.t);
      let cur = s.board[a.t] === u ? a.t : -1;
      for (let k = 0; k < (c.anywhere ? Math.min(c.land ?? 1, c.move) : c.move) && cur >= 0 && s.winner === null; k++) { const n0 = ev.length, nx = step(s, ev, cur, true); if (nx === cur && !acted(ev, n0)) break; cur = nx; } // 一步可以是走一格，也可以是打一下；打完还站着、还有步数就接着走。只有被自己人挡住才停
    }
    s.plays++;
  } else if (a.type === 'swap') {
    if (s.swapped) throw new Error('这回合已经换过牌了');
    const out = s.hand[side].splice(a.i, 1)[0]; s.hand[side].push(take(s, side)); s.used[side].push(out); s.swapped = true; ev.push({ t: 'swap', side }); // 换牌：从剩下的牌库里随机来一张，换掉的那张这回合不会再抽到
  } else {
    if (s.core[side] > 0) { s.core[side]--; ev.push({ t: 'core', side, n: -1, total: s.core[side], heat: true }); } // 过热：每次结束回合，自己的算力 −1（2026-11-19，防止一直囤算力再一次拍 Q-01）
    while (s.hand[side].length < HAND && s.deck[side].length + s.used[side].length) s.hand[side].push(take(s, side)); s.deck[side].push(...s.used[side].splice(0)); // 补满手牌，然后把这回合用掉的牌洗回牌库
    if (!(side === 1 && s.n === 8)) s.mana[side]++; // 后手前四个回合多 1 点能量作为补偿，第四个回合结束时不再涨，之后两边一样
    s.turn = 1 - side; s.n++; s.left = s.mana[s.turn]; s.swapped = false; s.plays = 0;
    ev.push({ t: 'turn', side: s.turn, mana: s.left });
    advance(s, ev, s.turn);
  }
  return { state: s, events: ev };
}
// 下回合开始时每个单位会做什么（画意图箭头用）：就是把“前进”预演一遍
export function forecast(state, side) { const s = clone(state), ev = []; advance(s, ev, side); return ev; }

// ---------- 电脑 ----------
// 电脑看局面的权重：城堡每点血、前线每深一格、每点算力、圣盾/装备/回合能力/蛋折合几点战力、单位每往前一行加几成、站到对方门口再加几倍、暗影/中毒/活力、敌方单位按几倍算（冻住的按几倍）、手牌每张值多少。
// 手拍的初值；tools/ai_tune.mjs 用自我对打逐项上下调四成都没有更好（2026-11-18，800 局，48%–51%），说明短板在搜索不在权重。改了评分的写法要重新跑一遍
export const STRONG = { deep: true, beam: 12 }; // 现在最强的电脑：预演对面下回合的前进 + 整回合组合搜索（每层留 12 个）
export const EVAL = { base: 6, front: .4, core: .9, shield: 2, gear: 1.5, onTurn: 1.5, egg: .6, adv: .15, gate: 3, creep: .8, poison: 1.5, vital: 1.5, foe: 1.1, frozen: .8, hand: 0 };
export function evaluate(s, me, W = EVAL) {
  if (s.winner !== null) return s.winner === me ? 1e6 : -1e6;
  let v = W.base * (s.base[me] - s.base[1 - me]) + W.front * (frontDepth(s, me) - frontDepth(s, 1 - me)) + W.core * (s.core[me] - s.core[1 - me]) + W.hand * (s.hand[me].length - s.hand[1 - me].length); // 攒着的算力迟早变成战力或伤害
  s.board.forEach((u, t) => { if (!u) return; const d = depth(u.side, rowOf(t)), unit = isUnit(u), c = CARDS[u.card];
    let w = (u.str + (u.shield ? W.shield : 0) + (u.gear ? W.gear : 0) + (trait(u, 'onTurn') ? W.onTurn : 0) + (u.timer !== undefined ? (c.hatch.str ?? 4) * W.egg : 0)) * (1 + (unit ? W.adv * d : 0)) + (unit && d === ROWS - 1 ? W.gate * u.str : 0); // 已经站到对方家门口的，下回合就打城堡
    if (s.creep[t] >= 0 && s.creep[t] !== u.side) w -= W.creep; if (u.poison) w -= W.poison; if (u.vital) w += W.vital;
    v += u.side === me ? w : -w * (u.frozen ? W.frozen : W.foe); });
  return v;
}
// 电脑的打法。两条来自 Stormbound 玩家的经验：能直接打穿城门就别贪别的；每回合都把能量花干净，手里出不了的牌及时换掉
// （牌库是确定的队列，换来的是哪张事先就知道）。其余是贪心：每次挑让局面评分涨得最多的一步，直到没有更好的。
function lethal(s, me, depth) { // 对面城堡快没血时，往下找两三步之内能不能直接赢
  for (const a of legalPlays(s)) { const r = apply(s, a).state; if (r.winner === me) return [a]; if (depth > 1 && r.winner === null) { const rest = lethal(r, me, depth - 1); if (rest) return [a, ...rest]; } }
  return null;
}
// o（锦标赛的电脑选手用）：skill 0–1，1 是满强度、和不传一样；越低越常看走眼（每步的评分加噪声）、越常漏掉斩杀、越常留着能量就结束回合。
// o.deep：每一步都先替对面把下回合的前进走一遍再评分，看得见对面的兵马上要打到哪；更强也更慢。o.rnd：随机数（默认 Math.random）
const keyOf = (s, me) => s.left + '|' + s.hand[me].join() + '|' + s.base.join() + '|' + s.core.join() + '|' + s.board.map(u => u ? u.card + u.side + u.str + (u.shield ? 's' : '') + (u.frozen ? 'f' : '') : '').join(); // 不同顺序走到同一个局面：只留一个
function plan(s0, me, o, score) {
  const cost = id => CARDS[id].cost, slack = 1 - (o.skill ?? 1), rnd = o.rnd || Math.random; /* slack：弱档电脑每个候选的评分加噪声（看走眼） */ let beam = [{ s: s0, acts: [], b: 0 }], best = { v: score(s0) + .5, acts: [], s: s0 };
  for (let d = 0; d < 8 && beam.length; d++) { const next = [], seen = new Set();
    for (const n of beam) for (const a of legalPlays(n.s)) { const id = n.s.hand[me][a.i], r = apply(n.s, a).state, k = keyOf(r, me); if (seen.has(k)) continue; seen.add(k);
      const b = n.b + 1.2 * (r.left - (n.s.left - cost(id))) + (r.hand[me].length - (n.s.hand[me].length - 1)) - (CARDS[id].hold?.(n.s, me) ? 9 : 0); // 和贪心一样的附加分：额外换来的能量、额外抽的牌、出牌时机提示
      next.push({ s: r, acts: [...n.acts, a], b, v: (r.winner === me ? 2e6 : score(r)) + b + (slack ? slack * 8 * (rnd() - .5) : 0) }); }
    next.sort((x, y) => y.v - x.v); if (next[0] && next[0].v > best.v) best = next[0]; beam = next.filter(n => n.s.winner === null).slice(0, o.beam); }
  return best;
}
export function aiTurn(state, o = {}) {
  let s = state; const me = s.turn, acts = [], cost = id => CARDS[id].cost, skill = o.skill ?? 1, rnd = o.rnd || Math.random, slack = 1 - skill;
  const W = o.w || EVAL, score = r => o.value && r.winner === null ? o.value(apply(r, { type: 'end' }).state, me) : o.deep && r.winner === null ? evaluate(apply(r, { type: 'end' }).state, me, W) : evaluate(r, me, W); // o.w：换一组局面权重（调参工具用）；o.value：换一个评分函数（局面价值网络用，看的是结束回合后的局面）
  const dead = () => { const h = s.hand[me]; let b = -1; h.forEach((id, k) => { if (!CARDS[id].boss && !targets(s, k).length && (b < 0 || cost(id) > cost(h[b]))) b = k; }); /* 首领牌留在手里等能量，不换 */ return b; }; // 现在出不了的牌里最贵的那张
  const swap = () => { const i = dead(); if (s.swapped || i < 0 || !s.deck[me].length) return false; // 手里有出不了的牌就换掉它；换来哪张是随机的，电脑也不偷看
    acts.push({ type: 'swap', i }); s = apply(s, { type: 'swap', i }).state; return true; };
  swap();
  if (s.base[1 - me] <= 6 && rnd() >= slack * .8) { const kill = lethal(s, me, 2); if (kill) return [...acts, ...kill]; }
  if (o.beam) { // 整回合组合搜索：这一回合几张牌的出法和先后顺序整套展开（每层留 o.beam 个最好的），挑回合末局面最好的那一套；出完还剩能量就换一张牌再搜一次
    for (let k = 0; k < 3 && s.winner === null; k++) { const p = plan(s, me, o, score); acts.push(...p.acts); s = p.s; if (s.winner !== null || !(s.left > 0 && swap())) break; }
    if (s.winner === null) acts.push({ type: 'end' }); return acts;
  }
  for (let k = 0; k < 12 && s.winner === null; k++) {
    if (slack && k && rnd() < slack * .3) break; // 偷懒：能量没花完就收手
    let best = null, bs = null, bv = score(s) + .5;
    for (const a of legalPlays(s)) { const r = apply(s, a).state, made = r.left - (s.left - cost(s.hand[me][a.i])), drew = r.hand[me].length - (s.hand[me].length - 1), v = score(r) + 1.2 * made + drew - (CARDS[s.hand[me][a.i]].hold?.(s, me) ? 9 : 0) + (slack ? slack * 8 * (rnd() - .5) : 0); if (v > bv) { bv = v; best = a; bs = r; } } // made：这张牌额外换来的能量；drew：额外抽到的牌，都算收益
    if (best) { acts.push(best); s = bs; continue; } // hold：牌自带的出牌时机提示（比如 Q-01 要攒够算力再出），时机不对的那一步评分扣 9，局面真要它时照样会打
    if (!(s.left > 0 && swap())) break; // 没有更好的出法了：还剩能量的话换一张牌再看
  }
  if (s.winner === null) acts.push({ type: 'end' });
  return acts;
}
