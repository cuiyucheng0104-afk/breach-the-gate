// 局面价值网络：看一个"我刚结束回合"的局面，估我最后赢的概率。只用我能看到的信息（对面手牌只知道张数）。
// 游戏和 tools/lab 共用（tools/lab/net.mjs 转出这里的东西）。结构：稀疏输入 → 64 → 32 → 1（sigmoid）。
// 每张牌除了自己学的 8 维特征，还带一组从牌面读出来的固定特征（费用、战力、触发时机、关键词），没怎么见过的牌也能估。
import { CARDS, COLS, ROWS, N, STRONG, EVAL, evaluate } from './chess.js';

export const CIDS = Object.keys(CARDS), CIX = Object.fromEntries(CIDS.map((k, i) => [k, i + 1])); // 0 = 没有牌
const NC = CIDS.length + 1;
const STATIC = c => [c.cost / 9, (c.str ?? 0) / 10, (c.move ?? 0) / 3, c.kind === 'unit', c.kind === 'structure', c.kind === 'spell', !!c.onPlay, !!c.onDeath, !!c.onAttack, !!c.onTurn,
  !!(c.onAfter || c.onHurt || c.onNearDeath), !!(c.onSpell || c.onAllyDeath), !!c.taunt, !!c.shield, (c.thorns ?? 0) / 3, !!c.guard, !!c.siege, !!c.swift, !!c.anywhere, !!c.gear, !!c.hatch, !!c.boss, !!c.prize].map(Number);
export const CS = STATIC(CARDS[CIDS[0]]).length, D = 8;
export const SF = new Float32Array(NC * CS); CIDS.forEach((k, i) => SF.set(STATIC(CARDS[k]), (i + 1) * CS));

// ---------- 编码：局面 → 一串短整数（训练数据就存这个） ----------
export const L = N * 6 + 4 + 15;
export function encode(s, me, out = new Int16Array(L)) {
  const foe = 1 - me;
  for (let t = 0; t < N; t++) { const r = Math.floor(t / COLS), c = t % COLS, t2 = (me ? ROWS - 1 - r : r) * COLS + c, o = t2 * 6, u = s.board[t]; // 我方城堡永远在第 0 行
    if (u) { out[o] = CIX[u.card]; out[o + 1] = u.side === me ? 0 : 1; out[o + 2] = u.str; out[o + 3] = (u.shield ? 1 : 0) | (u.frozen ? 2 : 0) | (u.poison ? 4 : 0) | (u.vital ? 8 : 0) | (u.gear ? 16 : 0) | (u.mute ? 32 : 0) | (Math.min(u.timer ?? 0, 7) << 8); }
    else { out[o] = 0; out[o + 1] = 0; out[o + 2] = 0; out[o + 3] = 0; }
    out[o + 4] = s.creep[t] < 0 ? 0 : s.creep[t] === me ? 1 : 2; out[o + 5] = s.shade[t]; }
  const h = s.hand[me]; for (let i = 0; i < 4; i++) out[N * 6 + i] = h[i] ? CIX[h[i]] : 0;
  const g = N * 6 + 4;
  [s.base[me], s.base[foe], s.cap[me], s.cap[foe], s.mana[me], s.mana[foe], s.core[me], s.core[foe], s.rage[me] ? 1 : 0, s.rage[foe] ? 1 : 0, s.deck[me].length, s.deck[foe].length, s.hand[foe].length, Math.min(s.n, 99), s.boss < 0 ? 0 : s.boss === me ? 1 : 2].forEach((v, i) => (out[g + i] = v));
  return out;
}

// ---------- 编码 → 网络输入（稀疏） ----------
const TF = 9 + CS + D, TILE0 = 0, CREEP0 = N * 2 * TF, HAND0 = CREEP0 + N * 3, GLOB0 = HAND0 + CS + D + 1;
export const DIN = GLOB0 + 15;
export function featurize(e, E, x, nz, emb) { // 写进稠密的 x，nz 记非零位置，emb 记 [位置, 牌] 给嵌入求梯度；返回 nz 个数
  let n = 0, m = 0; const put = (i, v) => { if (v) { x[i] = v; nz[n++] = i; } };
  const card = (base, ci) => { for (let k = 0; k < CS; k++) { const v = SF[ci * CS + k]; if (v) { x[base + k] += v; if (x[base + k] === v) nz[n++] = base + k; } }
    for (let k = 0; k < D; k++) { const p = base + CS + k; if (x[p] === 0) nz[n++] = p; x[p] += E[ci * D + k]; } emb[m++] = base + CS; emb[m++] = ci; };
  for (let t = 0; t < N; t++) { const o = t * 6, ci = e[o];
    if (ci) { const b = TILE0 + (t * 2 + e[o + 1]) * TF, f = e[o + 3];
      put(b, 1); put(b + 1, e[o + 2] / 10); put(b + 2, f & 1); put(b + 3, (f >> 1) & 1); put(b + 4, (f >> 2) & 1); put(b + 5, (f >> 3) & 1); put(b + 6, (f >> 4) & 1); put(b + 7, (f >> 5) & 1); put(b + 8, (f >> 8) / 3);
      card(b + 9, ci); }
    const cr = e[o + 4]; if (cr) put(CREEP0 + t * 3 + cr - 1, 1); put(CREEP0 + t * 3 + 2, e[o + 5] / 3); }
  let hc = 0; for (let i = 0; i < 4; i++) { const ci = e[N * 6 + i]; if (ci) { card(HAND0, ci); hc++; } } put(HAND0 + CS + D, hc / 4);
  const g = N * 6 + 4, sc = [10, 10, 10, 10, 10, 10, 8, 8, 1, 1, 12, 12, 4, 30, 1];
  for (let i = 0; i < 15; i++) put(GLOB0 + i, i === 14 ? 0 : e[g + i] / sc[i]); if (e[g + 14]) put(GLOB0 + 14, e[g + 14] === 1 ? 1 : -1);
  return [n, m];
}

// ---------- 网络 ----------
export function initNet(rnd = Math.random, H1 = 64, H2 = 32) { // 隐藏层大小存在权重里（b1、b2 的长度）
  const g = (n, s) => Float32Array.from({ length: n }, () => (rnd() * 2 - 1) * s);
  return { E: g(NC * D, .1), W1: g(DIN * H1, Math.sqrt(6 / (60 + H1))), b1: new Float32Array(H1), W2: g(H2 * H1, Math.sqrt(6 / (H1 + H2))), b2: new Float32Array(H2), w3: g(H2, Math.sqrt(6 / (H2 + 1))), b3: new Float32Array(1) };
}
export const KEYS = ['E', 'W1', 'b1', 'W2', 'b2', 'w3', 'b3'];
export const toJSON = net => JSON.stringify({ cards: CIDS, din: DIN, ...Object.fromEntries(KEYS.map(k => [k, Array.from(net[k], v => Math.round(v * 1e5) / 1e5)])) });
export function fromJSON(txt) {
  const o = typeof txt === 'string' ? JSON.parse(txt) : txt, v2 = o.v === 2;
  if (!Array.isArray(o.cards) || new Set(o.cards).size !== o.cards.length || o.cards.length !== CIDS.length || CIDS.some(k => !o.cards.includes(k)))
    throw new Error('网络是按另一套牌训练的，要重训');
  const din = DIN + (v2 ? EX : 0), h1 = o.b1?.length, h2 = o.b2?.length;
  const sizes = { E: NC * D, W1: din * h1, b1: h1, W2: h1 * h2, b2: h2, w3: h2, b3: 1 };
  if ((o.v !== undefined && o.v !== 1 && o.v !== 2) || o.din !== din || !h1 || !h2 || KEYS.some(k => !Array.isArray(o[k]) || o[k].length !== sizes[k] || o[k].some(v => !Number.isFinite(v))))
    throw new Error('网络结构或权重损坏，无法载入');
  const net = { ...Object.fromEntries(KEYS.map(k => [k, Float32Array.from(o[k])])), v2 };
  // 阵营迁移会改变牌表顺序。嵌入按稳定 ID 对齐，不能直接沿用旧行号；0 行仍为空牌。
  const oldIndex = new Map(o.cards.map((k, i) => [k, i + 1]));
  CIDS.forEach((k, i) => { const old = oldIndex.get(k); net.E.set(o.E.slice(old * D, (old + 1) * D), (i + 1) * D); });
  return net;
}

// ---------- 第 2 代：再看卡组（v: 2 的网络；在 tools/lab/v2 用显卡训练，这里只有前向） ----------
// 额外输入都是玩家自己知道的：自己整副 12 张（= 牌库 + 手牌 + 刚用掉的）、牌库剩余（整副去掉手牌）、对面亮过的牌（s.seen）。
// 三块各取平均牌特征（23 维牌面 + 8 维嵌入），亮过的牌再加一项张数 / 12；接在 DIN 后面，W1 的行数 = DIN + EX。和 tools/lab/v2/deck_probe.py 的 Net 一一对应
export const L2 = 24, KF = CS + D, EX = 3 * KF + 1;
export function encode2(s, me, out = new Int16Array(L2)) {
  const mine = [...s.deck[me], ...s.hand[me], ...s.used[me]].map(k => CIX[k]).sort((a, b) => a - b), sn = s.seen?.[1 - me] || [];
  for (let i = 0; i < 12; i++) { out[i] = mine[i] ?? 0; out[12 + i] = sn[i] ? CIX[sn[i]] : 0; } return out;
}
function extra(net, e, e2, ex) {
  ex.fill(0); const add = (o, ci, w) => { for (let k = 0; k < CS; k++) ex[o + k] += SF[ci * CS + k] * w; for (let k = 0; k < D; k++) ex[o + CS + k] += net.E[ci * D + k] * w; };
  const gone = [false, false, false, false, false, false, false, false, false, false, false, false]; let nd = 0, nr = 0, ns = 0;
  for (let h = 0; h < 4; h++) { const c = e[N * 6 + h]; if (c) for (let j = 0; j < 12; j++) if (!gone[j] && e2[j] === c) { gone[j] = true; break; } } // 同 deck_probe.py 的 remaining：每张手牌去掉整副里第一张同名的
  for (let j = 0; j < 12; j++) if (e2[j]) { nd++; if (!gone[j]) nr++; } for (let j = 12; j < 24; j++) if (e2[j]) ns++;
  for (let j = 0; j < 12; j++) if (e2[j]) { add(0, e2[j], 1 / nd); if (!gone[j]) add(KF, e2[j], 1 / nr); }
  for (let j = 12; j < 24; j++) if (e2[j]) add(2 * KF, e2[j], 1 / ns); ex[3 * KF] = ns / 12;
}

// 前向。scratch：一份工作内存（每个线程一份），返回 logit
export function scratch(net) { return { ex: new Float32Array(EX), x: new Float32Array(DIN), nz: new Int32Array(DIN), emb: new Int32Array(64), h1: new Float32Array(net.b1.length), h2: new Float32Array(net.b2.length), n: 0, m: 0 }; }
export function forward(net, e, w, e2 = null) { // e2：第 2 代网络要的 encode2
  const { x, nz, h1, h2 } = w, H1 = h1.length, H2 = h2.length; const [n, m] = featurize(e, net.E, x, nz, w.emb); w.n = n; w.m = m;
  h1.set(net.b1); for (let a = 0; a < n; a++) { const i = nz[a], v = x[i], r = i * H1; for (let j = 0; j < H1; j++) h1[j] += v * net.W1[r + j]; }
  if (net.v2) { extra(net, e, e2, w.ex); for (let p = 0; p < EX; p++) { const v = w.ex[p]; if (!v) continue; const r = (DIN + p) * H1; for (let j = 0; j < H1; j++) h1[j] += v * net.W1[r + j]; } }
  for (let j = 0; j < H1; j++) if (h1[j] < 0) h1[j] = 0;
  let z = net.b3[0]; for (let k = 0; k < H2; k++) { let s = net.b2[k]; const r = k * H1; for (let j = 0; j < H1; j++) s += net.W2[r + j] * h1[j]; h2[k] = s > 0 ? s : 0; z += net.w3[k] * h2[k]; }
  return z;
}
export const clear = w => { for (let a = 0; a < w.n; a++) w.x[w.nz[a]] = 0; };

// 反向：把 (sigmoid(z) - y) 的梯度累加进 G（和 net 同形状）。调用前 forward 过、还没 clear
export function backward(net, w, G, d3) {
  const { x, nz, h1, h2, emb } = w, H1 = h1.length, H2 = h2.length, d2 = new Float32Array(H2), d1 = new Float32Array(H1);
  G.b3[0] += d3; for (let k = 0; k < H2; k++) { G.w3[k] += d3 * h2[k]; d2[k] = h2[k] > 0 ? d3 * net.w3[k] : 0; }
  for (let k = 0; k < H2; k++) { if (!d2[k]) continue; G.b2[k] += d2[k]; const r = k * H1; for (let j = 0; j < H1; j++) { G.W2[r + j] += d2[k] * h1[j]; d1[j] += d2[k] * net.W2[r + j]; } }
  for (let j = 0; j < H1; j++) if (h1[j] <= 0) d1[j] = 0; else G.b1[j] += d1[j];
  for (let a = 0; a < w.n; a++) { const i = nz[a], v = x[i], r = i * H1; for (let j = 0; j < H1; j++) G.W1[r + j] += v * d1[j]; }
  for (let a = 0; a < w.m; a += 2) { const p = emb[a], ci = emb[a + 1]; for (let k = 0; k < D; k++) { const r = (p + k) * H1; let s = 0; for (let j = 0; j < H1; j++) s += net.W1[r + j] * d1[j]; G.E[ci * D + k] += s; } }
}

// 给 aiTurn 用的评分函数：局面（我刚结束回合）→ 分数（logit × scale）
export function valueFn(net, scale = 10) {
  const w = scratch(net), e = new Int16Array(L), e2 = new Int16Array(L2);
  return (s, me) => { if (s.winner !== null) return s.winner === me ? 1e6 : -1e6; encode(s, me, e); if (net.v2) encode2(s, me, e2); const z = forward(net, e, w, e2); clear(w); return z * scale; };
}

// 游戏里用的"大师"电脑：整回合组合搜索，评分 = 手写评分 + scale × 网络 logit（scale 20 是实测最好的）
export const mixAI = (net, scale = 20) => { const v = valueFn(net, scale); return { beam: STRONG.beam, value: (s, me) => s.winner !== null ? (s.winner === me ? 1e6 : -1e6) : evaluate(s, me, EVAL) + v(s, me) }; };
