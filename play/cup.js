// 卡牌联盟锦标赛：16 人瑞士轮 + 八强淘汰赛。纯逻辑和存档，不碰画面（画面在 cup-ui.js）。
// 赛制：瑞士轮每轮同战绩的人互相配对、不重复交手，赢满 3 场出线、输满 3 场淘汰（最多 5 轮）；前两轮单局定胜负（BO1），从第 3 轮起三局两胜（BO3）。
// 八个出线的人按战绩排种子打淘汰赛（1-8、4-5、2-7、3-6），全部 BO3。每人报名时带两套卡组，每一局开打前各自从两套里挑一套。
// 除了玩家，其余 15 人都是电脑：Q1（卫冕冠军，机核阵营的「零号协议」）、10 位以 AI 命名的选手、4 个路人。电脑之间的对局是真的按规则打完的（chess.js），不是掷骰子。
import { CARDS, DECKS, PROTOCOL, STRONG, newGame, apply, aiTurn, upgrade } from './chess.js?v=112a67f0';

export const WIN = 3, LOSE = 3, SWISS = 5, KO_NAMES = ['八强赛', '半决赛', '决赛'];
export const bestOf = round => round <= 2 ? 1 : 3; // 瑞士轮第几轮打几局；淘汰赛都是 3
const pre = name => { const d = DECKS.find(x => x.name === name); return { name, f: d.f, cards: [...d.cards] }; };
// 电脑的强度（aiTurn 的选项，见 chess.js）。实测：满强度（整回合组合搜索每层留 12 个）对只预演一步的老满强度赢 74%；AI 角色每层留 4 个，对满强度约 46%；路人不预演、随机看走眼
// 游戏里网络权重载入后，max 会被换成大师电脑（chess-ui.js 的 loadMaster：价值网络 net-g5（第 2 代：会看卡组），搜索宽度降到 3）；node 里的自检照旧用满强度
// 2026-11-19 实测（每组 100–200 届，玩家席由普通电脑代打；种子对非种子的单局胜率 Q1/克劳德/GPT嗖，三人合计夺冠率）：满强度 + Q1 12 血 73/66/74%、79%；
//   大师全宽度 + Q1 12 血 83/77/83%、95%；大师全宽度 + Q1 10 血 78/80/81%、95%；大师 g4 宽度 4 + Q1 10 血 70/68/75%、74%；
//   换 net-g5 后：宽度 4 → 73/75/79%、85%，宽度 3 → 70/73/77%、78%（现在用的）
export const TIERS = { max: STRONG, ai: { deep: true, beam: 4 } };
export const ROSTER = [
  { key: 'q1', name: 'Q1', tag: '卫冕冠军', tier: 'max', decks: [{ name: '零号协议', f: 'f7', cards: [...PROTOCOL] },
    { name: '零号协议·超频', f: 'f7', cards: ['q_probe', 'q_helm', 'q_field', 'q_wing', 'q_cannon', 'q_sword', 'q_glitch', 'q_chassis', 'n_soulstealer', 'gem', 'q_emp', 'q_super'] }] },
  { key: 'claude', name: '克劳德', face: 'claude', tier: 'max', decks: [pre('方尖碑'), pre('荆棘反击')] },
  { key: 'gptsol', name: 'GPT嗖', face: 'gptsol', tier: 'max', decks: [pre('荆棘反击'), pre('方尖碑')] },
  { key: 'deepseek', name: '深度求索', face: 'deepseek', tier: 'ai', decks: [pre('冰封控制'), pre('渗透与龙')] },
  { key: 'glm', name: '智谱', face: 'glm', tier: 'ai', decks: [pre('方尖碑'), pre('顺风突袭')] },
  { key: 'gemini', name: '双子座', face: 'gemini', tier: 'ai', decks: [pre('连击快攻'), pre('咒印法术')] },
  { key: 'grok', name: '格罗克', face: 'grok', tier: 'ai', decks: [pre('影灵海'), pre('毒与暗影')] },
  { key: 'kimi', name: '基米', face: 'kimi', tier: 'ai', decks: [pre('顺风突袭'), pre('连击快攻')] },
  { key: 'mimo', name: '米莫', face: 'mimo', tier: 'ai', decks: [pre('越养越大'), pre('荆棘反击')] },
  { key: 'qwen', name: '千问', face: 'qwen', tier: 'ai', decks: [pre('铁壁列阵'), pre('骑士冲锋')] },
  { key: 'ernie', name: '文心', face: 'ernie', tier: 'ai', decks: [pre('方尖碑'), pre('冰封控制')] },
];
const WALKERS = ['老铁匠', '流浪诗人', '酒馆老板', '新兵蛋子', '赌场常客', '退役骑士', '牌桌幽灵', '夜班守卫', '算命先生', '码头搬运工'];
export const opts = p => p.tier === 'walk' ? { skill: p.skill } : TIERS[p.tier] || {}; // 这位电脑选手的 aiTurn 选项
export const HP = 10, hpOf = p => p.hp || HP; // 城堡血量：都是 10（Q1 原来 12，换上大师电脑后降回 10，见 TIERS 上面的实测）

// 带种子的随机数（mulberry32）：存档里只存一个整数，读档后接着走
export const rng = seed => { let a = seed >>> 0; const f = () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; f.state = () => a; return f; };
const shuffle = (a, rnd) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

// ---------- 开赛 ----------
// mine：玩家报名的两套卡组 [{ name, cards }, { name, cards }]
export function newCup(mine, seed = Math.floor(Math.random() * 4294967296)) {
  const rnd = rng(seed), walkers = shuffle([...WALKERS], rnd).slice(0, 4), presets = DECKS.map(d => d.name);
  const players = [{ key: 'you', name: '你', human: true, decks: mine.map(d => ({ name: d.name, cards: [...d.cards] })) },
    ...ROSTER.map(r => ({ ...r, decks: r.decks.map(d => ({ ...d, cards: [...d.cards] })) })),
    ...walkers.map((name, i) => { const [a, b] = shuffle([...presets], rnd); return { key: 'walk' + i, name, tier: 'walk', skill: Math.round((.6 + .3 * rnd()) * 100) / 100, decks: [pre(a), pre(b)] }; })];
  const s = { v: 1, seed: rnd.state(), stage: 'draw', round: 0, players: players.map((p, id) => ({ ...p, id, w: 0, l: 0, gw: 0, gl: 0, opp: [] })), rounds: [], ko: [], champion: null };
  s.order = shuffle(s.players.map(p => p.id), rnd); s.seed = rnd.state(); // 抽签：第一轮按抽出来的顺序两两对阵
  return s;
}
const R = s => { const f = rng(s.seed); return () => { const x = f(); s.seed = f.state(); return x; }; }; // 用存档里的种子接着取随机数
export const status = p => p.w >= WIN ? 'in' : p.l >= LOSE ? 'out' : '';
const match = (a, b, bo) => ({ a, b, bo, wa: 0, wb: 0, games: [], done: false, winner: null });

// ---------- 瑞士轮配对：同战绩分组，组内打乱后配对，尽量不重复交手（回溯找一组全不重复的配法） ----------
function pairGroup(ids, s, rnd) {
  const pool = shuffle([...ids], rnd), met = (a, b) => s.players[a].opp.includes(b), out = [];
  const go = rest => { if (!rest.length) return true; const [a, ...others] = rest;
    for (let i = 0; i < others.length; i++) { const b = others[i]; if (met(a, b)) continue; out.push([a, b]); if (go(others.filter((_, j) => j !== i))) return true; out.pop(); } return false; };
  if (!go(pool)) { out.length = 0; for (let i = 0; i < pool.length; i += 2) out.push([pool[i], pool[i + 1]]); } // 实在避不开就按顺序配（16 人 5 轮不会发生）
  return out;
}
export function nextRound(s) { // 开下一轮：瑞士轮还有人没定就配对；瑞士轮打完就排八强
  const rnd = R(s);
  if (s.stage === 'draw') { s.stage = 'swiss'; s.round = 1; s.rounds.push({ no: 1, bo: 1, matches: Array.from({ length: 8 }, (_, i) => match(s.order[2 * i], s.order[2 * i + 1], 1)) }); return s; }
  if (s.stage === 'swiss') {
    const live = s.players.filter(p => !status(p));
    if (live.length && s.round < SWISS) { s.round++; const bo = bestOf(s.round), groups = {};
      for (const p of live) (groups[`${p.w}-${p.l}`] ||= []).push(p.id);
      const ms = Object.keys(groups).sort((x, y) => y.split('-')[0] - x.split('-')[0] || x.split('-')[1] - y.split('-')[1]).flatMap(k => pairGroup(groups[k], s, rnd)).map(([a, b]) => match(a, b, bo));
      s.rounds.push({ no: s.round, bo, matches: ms }); return s; }
    s.stage = 'ko'; const seeds = table(s).filter(r => status(r.p) === 'in').map(r => r.p.id);
    s.ko = [[[0, 7], [3, 4], [1, 6], [2, 5]].map(([x, y]) => match(seeds[x], seeds[y], 3))]; s.seeds = seeds; return s;
  }
  if (s.stage === 'ko') { const last = s.ko[s.ko.length - 1];
    if (last.length === 1) { s.stage = 'done'; s.champion = last[0].winner; return s; }
    const ws = last.map(m => m.winner); s.ko.push(Array.from({ length: ws.length / 2 }, (_, i) => match(ws[2 * i], ws[2 * i + 1], 3))); return s; }
  return s;
}
export const current = s => s.stage === 'swiss' ? s.rounds[s.rounds.length - 1].matches : s.stage === 'ko' ? s.ko[s.ko.length - 1] : [];
export const roundName = s => s.stage === 'swiss' ? `瑞士轮 第 ${s.round} 轮` : s.stage === 'ko' ? KO_NAMES[s.ko.length - 1] : s.stage === 'done' ? '已结束' : '抽签';
export const roundDone = s => current(s).every(m => m.done);
export const humanMatch = s => current(s).find(m => !m.done && (s.players[m.a].human || s.players[m.b].human)) || null;

// ---------- 一局一局地记 ----------
// g：{ w: 'a' | 'b', da, db（双方这局用的是第几套卡组）, hp: [a 方城堡, b 方城堡], n: 打了几个回合 }
export function addGame(s, m, g) {
  m.games.push(g); if (g.w === 'a') m.wa++; else m.wb++;
  const need = Math.ceil(m.bo / 2); if (m.wa < need && m.wb < need) return false;
  m.done = true; const [win, lose] = m.wa > m.wb ? [m.a, m.b] : [m.b, m.a]; m.winner = win;
  const pw = s.players[win], pl = s.players[lose];
  if (s.stage === 'swiss') { pw.w++; pl.l++; pw.opp.push(lose); pl.opp.push(win); }
  const [ga, gb] = [m.wa, m.wb]; s.players[m.a].gw += ga; s.players[m.a].gl += gb; s.players[m.b].gw += gb; s.players[m.b].gl += ga; // 小分：赢的局数和输的局数
  return true;
}
// 电脑这局用哪套：第一局满强度的选手先拿第一套（他们的主力），其余随便挑一套；输了下一局换另一套，赢了接着用
export function npcDeck(s, m, side) { const prev = m.games[m.games.length - 1], key = side === 'a' ? 'da' : 'db';
  if (!prev) return s.players[side === 'a' ? m.a : m.b].tier === 'max' ? 0 : Math.floor(R(s)() * 2); return prev.w === side ? prev[key] : 1 - prev[key]; }
// 谁先手：第一局随机，之后上一局输的人先手
export function firstOf(s, m) { const prev = m.games[m.games.length - 1]; return prev ? (prev.w === 'a' ? 'b' : 'a') : R(s)() < .5 ? 'a' : 'b'; }

// 两个电脑真的打一局：走到第 70 个回合还没分胜负就比城堡血量，再平就看先手
export function simGame(s, m) {
  const A = s.players[m.a], B = s.players[m.b], da = npcDeck(s, m, 'a'), db = npcDeck(s, m, 'b'), first = firstOf(s, m), rnd = R(s);
  const seat = first === 'a' ? [A, B] : [B, A], decks = first === 'a' ? [A.decks[da].cards, B.decks[db].cards] : [B.decks[db].cards, A.decks[da].cards];
  let st = newGame(decks, rnd, { base: [hpOf(seat[0]), hpOf(seat[1])] });
  while (st.winner === null && st.n <= 70) for (const x of aiTurn(st, { ...opts(seat[st.turn]), rnd })) st = apply(st, x).state;
  const w0 = st.winner ?? (st.base[0] === st.base[1] ? 0 : st.base[0] > st.base[1] ? 0 : 1), hpA = first === 'a' ? st.base[0] : st.base[1], hpB = first === 'a' ? st.base[1] : st.base[0];
  return addGame(s, m, { w: (w0 === 0) === (first === 'a') ? 'a' : 'b', da, db, hp: [Math.max(0, hpA), Math.max(0, hpB)], n: Math.ceil(st.n / 2) });
}
export function simMatch(s, m) { while (!m.done) simGame(s, m); }
// 别的场次跟着玩家走：玩家每打完一局，同一轮里还没打完的别的场次也打到同样的局数；玩家这场打完了，别的场次当场全部打完。
// 这样任何时候看积分表，大家都停在同一轮的同一个进度上。玩家不在这一轮里（已出线、已淘汰）时不动，由界面上的按钮推进。返回这次动过的场次
export function follow(s) {
  const ms = current(s), mine = ms.find(m => s.players[m.a].human || s.players[m.b].human); if (!mine) return [];
  const moved = []; for (const m of ms) if (m !== mine && !m.done && (mine.done || m.games.length < mine.games.length)) { if (mine.done) simMatch(s, m); else while (!m.done && m.games.length < mine.games.length) simGame(s, m); moved.push(m); }
  return moved;
}

// ---------- 积分表 ----------
// 排序：胜场多 → 负场少 → 小分（局数净胜） → 对手分（交过手的人一共赢了多少场） → 先报名的在前
export function table(s) {
  const buch = p => p.opp.reduce((a, o) => a + s.players[o].w, 0);
  return s.players.map(p => ({ p, diff: p.gw - p.gl, buch: buch(p) })).sort((x, y) => y.p.w - x.p.w || x.p.l - y.p.l || y.diff - x.diff || y.buch - x.buch || x.p.id - y.p.id);
}
// 玩家最后拿了第几：冠军 1、亚军 2、四强 3–4、八强 5–8，瑞士轮淘汰的按积分表名次
export function placing(s, id) {
  if (s.champion === id) return 1; const ko = s.ko.flat(); const lost = ko.find(m => m.done && m.winner !== id && (m.a === id || m.b === id));
  if (lost) return { 2: 2, 1: 3, 0: 5 }[s.ko.findIndex(r => r.includes(lost))] ?? 9;
  return table(s).findIndex(r => r.p.id === id) + 1;
}

// ---------- 存档 ----------
const KEY = 'yibu-fanpan.cup.v1';
export const save = s => { try { if (s) localStorage.setItem(KEY, JSON.stringify(s)); else localStorage.removeItem(KEY); } catch { /* 存不了就只在这次打开期间有效 */ } };
export function load() {
  try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && s.v === 1 && Array.isArray(s.players) && s.players.length === 16 && s.players.every(p => p.decks?.length === 2 && p.decks.every(d => (d.cards = upgrade(d.cards)).every(k => CARDS[k])))) return s; } catch { /* 读不了就当没有 */ } /* 卡组里有后来删掉的牌：换成接班的那张（chess.js 的 RETIRED），进行中的锦标赛不作废 */
  return null;
}
