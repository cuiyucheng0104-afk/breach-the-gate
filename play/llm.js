// AI 对手：让大模型当电脑那一方。玩家自己填接口地址、Key 和模型名（存在自己的浏览器里，不经过我们）。
// 架构："引擎出方案，大模型做决定"。每回合游戏引擎按几种风格（稳健/进攻/防守/铺场/留手）各算一套完整、保证合法的出法，
// 写清每套打完后的预计局面；模型只回 {"choice":几号,"say":"一句台词"}。模型不用自己推规则、算格子，输出很短，不会走出不合法的步骤。
// 接口差异：默认请求里关掉"思考"（不认这个参数的接口报错后自动去掉再发）；请求在玩家结束回合时就发出，趁棋盘演出时等回复；
// 超时、出错、读不懂就执行第 1 套方案（= 困难电脑本来的选择），对局不会卡住。
import { CARDS, ROWS, COLS, rowOf, colOf, apply, evaluate, aiTurn, frontDepth, STRONG, DECKS, newGame, legalPlays, targets } from './chess.js?v=112a67f0';

const KEY = 'yibu-fanpan.llm.v1', TIMEOUT = 20000, MAXTOK = 200, K = 4;
export const last = { ms: 0, why: '', reply: '' }; // 最近一次请求的情况（设置框里给玩家看，排查用）
const DEFAULT = { on: false, style: 'openai', url: '', key: '', model: '' };
export const cfg = () => { try { return { ...DEFAULT, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { ...DEFAULT }; } };
export const save = c => { try { localStorage.setItem(KEY, JSON.stringify({ ...DEFAULT, ...c })); } catch { /* 存不了就算了 */ } };
export const enabled = (c = cfg()) => !!(c.model && c.url); // 用不用 AI 由难度里的“AI（大模型）”那一档决定，这里只看接口填没填；接口地址一律由玩家填，代码里不写死任何外部网址（离线包的体检要求）

// ---------- 系统提示词（固定不变，放在最前面，给支持缓存的接口吃缓存） ----------
export const SYSTEM = `你是网页卡牌下棋游戏《攻破城门》里的 AI 对手，正在和玩家对战。
规则要点：棋盘 4 路 × 5 行，双方城堡在两端。单位每回合自动朝对面前进一格，正前方有敌人就打；两个单位对撞互扣战力，战力既是攻击也是血量。走进对面城门的单位按自己的战力扣城堡血，城堡血先到 0 的一方输。每回合有能量，用来出牌。
每回合，游戏引擎已经替你算好了几套合法的完整出法（方案），并写出了每套打完后的预计局面。你的任务是像高手一样权衡选一套：能打穿对面城堡就打；自己城堡危险就先守；领先时求稳，落后时搏一把；对面兵多时注意清场。引擎评分只是参考。
回复只输出一行 JSON，不要思考过程，不要解释：{"choice":方案编号,"say":"一句不超过 20 字的中文台词，对玩家说"}`;

// ---------- 引擎出方案 ----------
// 第 1 套 = 困难电脑自己的整回合选择（aiTurn）；其余来自同一个整回合组合搜索展开过的全部节点（chess.js 的 plan() 没导出，这里写 top-K 版，
// 附加分照 plan()），按"这回合打了哪几张牌"分组，每组只留最好的一种落法，免得几套方案只是同几张牌换个格子
const END = { type: 'end' }, cost = id => CARDS[id].cost, run = (s, acts) => { for (const a of acts) s = apply(s, a).state; return s; };
const score = (s, me) => s.winner !== null ? (s.winner === me ? 2e6 : -2e6) : evaluate(apply(s, END).state, me); // 看回合结束、对面前进之后的局面（同困难电脑）
function expand(s0, me, beamW) {
  const all = [], seen = new Set(); let beam = [{ s: s0, acts: [], b: 0 }]; all.push({ ...beam[0], v: score(s0, me) });
  for (let d = 0; d < 8 && beam.length; d++) { const next = [];
    for (const n of beam) for (const a of legalPlays(n.s)) { const id = n.s.hand[me][a.i], r = apply(n.s, a).state, k = JSON.stringify([r.left, r.hand[me], r.base, r.board.map(u => u && [u.card, u.side, u.str, u.shield])]);
      if (seen.has(k)) continue; seen.add(k);
      const b = n.b + 1.2 * (r.left - (n.s.left - cost(id))) + (r.hand[me].length - (n.s.hand[me].length - 1)) - (CARDS[id].hold?.(n.s, me) ? 9 : 0), x = { s: r, acts: [...n.acts, a], b, v: score(r, me) + b };
      all.push(x); next.push(x); }
    next.sort((x, y) => y.v - x.v); beam = next.filter(n => n.s.winner === null).slice(0, beamW); }
  return all.sort((x, y) => y.v - x.v);
}
const played = (s, acts) => { const me = s.turn, ids = []; for (const a of acts) { if (a.type === 'play') ids.push(s.hand[me][a.i]); s = apply(s, a).state; } return ids.sort().join(); };
export function options(s) {
  const me = s.turn, a0 = aiTurn(s, { ...STRONG, rnd: () => .5 }), e0 = run(s, a0), out = [{ name: '引擎首选', acts: a0, end: e0 }];
  if (e0.winner === me) return out; // 能斩杀就不给别的
  const used = new Set([played(s, a0)]); let t = s; const head = [];
  const h = t.hand[me]; let i = -1; h.forEach((id, k) => { if (!CARDS[id].boss && !targets(t, k).length && (i < 0 || cost(id) > cost(h[i]))) i = k; }); // 开头换掉出不了的牌，照 aiTurn
  if (!t.swapped && i >= 0 && t.deck[me].length) { head.push({ type: 'swap', i }); t = apply(t, head[0]).state; }
  for (const n of expand(t, me, STRONG.beam)) { if (out.length >= K) break; const acts = [...head, ...n.acts, ...(n.s.winner === null ? [END] : [])], k = played(s, acts);
    if (used.has(k)) continue; used.add(k); out.push({ name: n.acts.length ? '备选' : '不出牌、攒能量', acts, end: run(s, acts) }); }
  return out;
}

// ---------- 把局面和方案写成话 ----------
const depthOf = (t, me) => me ? ROWS - 1 - rowOf(t) : rowOf(t); // 离 me 城堡几行
const where = (t, me) => `${colOf(t) + 1}路d${depthOf(t, me)}`;
const flags = u => [u.frozen && '冻', u.shield && '盾', u.poison && '毒', u.vital && '活', u.mute && '禁', u.timer !== undefined && `蛋${u.timer}`, u.gear && `装「${CARDS[u.gear].name}」`].filter(Boolean).join(',');
const power = (e, side) => e.board.reduce((n, u) => n + (u && u.side === side && CARDS[u.card].kind === 'unit' ? u.str : 0), 0);
export function situation(s) {
  const me = s.turn, foe = 1 - me, L = [], seen = new Set();
  L.push(`第 ${Math.ceil(s.n / 2)} 回合，轮到你（AI 方）。城堡血量：你 ${s.base[me]}/${s.cap[me]}，玩家 ${s.base[foe]}/${s.cap[foe]}。你这回合能量 ${s.left}。玩家手里 ${s.hand[foe].length} 张牌。`);
  L.push('棋盘（d0 是你的城堡这一侧，d4 是玩家城堡那一侧）：');
  for (let d = ROWS - 1; d >= 0; d--) { const r = me ? ROWS - 1 - d : d;
    L.push(`d${d}: ` + [...Array(COLS).keys()].map(c => { const u = s.board[r * COLS + c]; if (!u) return `${c + 1}路 空`; seen.add(u.card); return `${c + 1}路 ${u.side === me ? '你' : '玩家'}「${CARDS[u.card].name}」${u.str}${flags(u) ? '(' + flags(u) + ')' : ''}`; }).join(' | ')); }
  L.push('你的手牌：' + s.hand[me].map(id => { seen.add(id); const c = CARDS[id]; return `「${c.name}」费${c.cost}${c.kind === 'spell' ? '' : ` 战力${c.str}`}`; }).join('，') + '。');
  const fx = [...seen].filter(id => CARDS[id].text && CARDS[id].text !== '没有能力。'); if (fx.length) L.push('相关牌的效果：' + fx.map(id => `「${CARDS[id].name}」${CARDS[id].text}`).join(' '));
  return L.join('\n');
}
export function optionText(s, o, i, best) {
  const me = s.turn, foe = 1 - me, steps = []; let x = s;
  for (const a of o.acts) { if (a.type === 'play') { const c = CARDS[x.hand[me][a.i]]; steps.push(`${c.kind === 'spell' ? '施放' : '打出'}「${c.name}」${a.t < 0 ? '' : '到' + where(a.t, me)}`); }
    else if (a.type === 'swap') steps.push(`换掉「${CARDS[x.hand[me][a.i]].name}」`); x = apply(x, a).state; }
  const e = o.end, v = e.winner !== null ? (e.winner === me ? '直接获胜' : '会输') : `${(evaluate(e, me) - best).toFixed(1)}`;
  return `方案${i + 1}：${steps.join('，') || '不出牌'}。打完后：玩家城堡 ${s.base[foe]}→${Math.max(0, e.base[foe])}，你的城堡 ${Math.max(0, e.base[me])}，场上战力 你 ${power(e, me)} : 玩家 ${power(e, foe)}，你的前线到 d${frontDepth(e, me)}。引擎评分（和最好的比）${v}。`;
}
// 给模型看的顺序要打乱：引擎最想走的那套总排第 1 的话，模型几乎只会照抄（实测 DeepSeek 10 回合 10 次选 1）；按回合数定顺序，同一局面每次一样
export const order = (s, n) => { const o = [...Array(n).keys()]; let x = (s.n * 2654435761 + s.base[0] * 97 + s.base[1]) >>> 0; for (let i = n - 1; i > 0; i--) { x = (x * 1664525 + 1013904223) >>> 0; const j = x % (i + 1); [o[i], o[j]] = [o[j], o[i]]; } return o; };
export function prompt(s, opts) { const best = Math.max(...opts.map(o => o.end.winner === null ? evaluate(o.end, s.turn) : -Infinity), -1e9);
  return `${situation(s)}\n\n可选方案：\n${order(s, opts.length).map((k, i) => optionText(s, opts[k], i, best)).join('\n')}\n\n现在轮到你出牌。在 ${opts.length} 套方案里选一套，只回一行 JSON：{"choice":编号,"say":"台词"}`; }

// ---------- 读回复 ----------
export function parseChoice(text, n) { // 认 "choice": 2、"方案2"/"方案二"、或者回复里第一个 1..n 的数；台词优先按标准 JSON 读（转义、引号都对），读不了再认 "say": "…"
  const t = String(text || '').replace(/<think(?:ing)?>[\s\S]*?(?:<\/think(?:ing)?>|$)/g, ''); // 没闭合的思考块（回复被截断）整段丢掉，不从思考里捡数字
  let j = null; try { j = JSON.parse(/\{[\s\S]*\}/.exec(t)?.[0]); } catch { /* 不是标准 JSON，下面按文字认 */ }
  const m = /["']?choice["']?\s*[:：]\s*["']?(\d+)/i.exec(t) || /方案\s*(\d+|[一二三四])/.exec(t) || /(?:^|[^\d])([1-9])(?:[^\d]|$)/.exec(t);
  const k = m ? '一二三四'.indexOf(m[1]) + 1 || +m[1] : NaN;
  const raw = typeof j?.say === 'string' ? j.say : /["']?say["']?\s*[:：]\s*["“'「]([^"”'」\n]{0,40})/.exec(t)?.[1] || '';
  const say = raw.replace(/\s+/g, ' ').replace(/^[“「『]+|[”」』]+$/g, '').trim().slice(0, 40);
  return k >= 1 && k <= n ? { k: k - 1, say } : null;
}

// ---------- 发请求（各家接口的差异都收在这里） ----------
const noThink = new Map(), useMct = new Map(); // 接口地址+模型 → 认不认"关掉思考"的参数（第一次被拒就记住，不再带）
async function post(c, user, signal, think, mct) { // mct：用 max_completion_tokens（OpenAI 的推理模型不认 max_tokens）
  const anth = c.style === 'anthropic', base = c.url.replace(/\/+$/, '');
  const body = anth ? { model: c.model, max_tokens: MAXTOK, system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }], messages: [{ role: 'user', content: user }] }
    : { model: c.model, ...(mct ? { max_completion_tokens: MAXTOK, reasoning_effort: 'minimal' } : { max_tokens: MAXTOK }), messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: user }], ...(think ? {} : { thinking: { type: 'disabled' } }) }; // DeepSeek、豆包等默认先思考，会把字数和时间都花在思考上
  return fetch(anth ? `${base}/v1/messages` : `${base}/chat/completions`, { method: 'POST', signal, body: JSON.stringify(body),
    headers: anth ? { 'content-type': 'application/json', 'x-api-key': c.key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' } : { 'content-type': 'application/json', ...(c.key ? { authorization: 'Bearer ' + c.key } : {}) } });
}
async function ask(c, user, signal) {
  if (!c.url || !c.model) throw new Error('没填接口地址或模型名');
  const id = c.url + '|' + c.model, anth = c.style === 'anthropic';
  let r = await post(c, user, signal, anth || noThink.get(id) === false, useMct.get(id));
  if (!anth && r.status === 400 && noThink.get(id) !== false) { noThink.set(id, false); r = await post(c, user, signal, true, useMct.get(id)); } // 不认 thinking 参数的接口：去掉再发一次
  if (!r.ok) { const t = String(await r.text()); // OpenAI 推理模型（o 系列、gpt-5）不认 max_tokens：换参数名、思考压到最少，再发一次
    if (anth || r.status !== 400 || useMct.get(id) || !/max_tokens|max_completion_tokens/.test(t)) throw new Error(`接口返回 ${r.status}：${t.slice(0, 120)}`);
    useMct.set(id, true); r = await post(c, user, signal, true, true); if (!r.ok) throw new Error(`接口返回 ${r.status}：${String(await r.text()).slice(0, 120)}`); }
  const j = await r.json() || {}; if (anth) return { text: (j.content || []).map(x => x.text || '').join(''), cut: j.stop_reason === 'max_tokens' };
  const m = j.choices?.[0]?.message || {}, txt = Array.isArray(m.content) ? m.content.map(x => x.text || '').join('') : m.content || ''; // 有的接口 content 是分段数组
  return { text: txt, cut: j.choices?.[0]?.finish_reason === 'length', think: !!(m.reasoning_content || m.reasoning) };
}
const why = e => e.name === 'AbortError' ? `超过 ${TIMEOUT / 1000} 秒没回` : e instanceof TypeError ? '连不上接口（地址不对，或这个接口不允许网页直接调用）' : e.message;
const unreadable = r => !r.text.trim() && r.think ? '模型只输出了思考、没给出选择：换一个不带思考的模型，或在服务商那边关掉思考' : r.cut ? '回复太长被截断了' : '回复里找不到选择（应该是一行 {"choice":编号,...}）';

// 让模型走这一回合：永远返回一串能走通的动作。数组带 by（'llm' 模型选的 / 'fallback' 没选成、执行了第 1 套）、why（没选成的原因）、say（台词）、pick（方案名）
const tag = (acts, by, why = '', say = '', pick = '') => Object.assign([...acts], { by, why, say, pick });
export async function llmTurn(s, note = () => {}) {
  const opts = options(s), t0 = performance.now(), done = (o, by, w = '', reply = '', say = '') => { Object.assign(last, { ms: Math.round(performance.now() - t0), why: w, reply: reply.slice(0, 300) }); return tag(o.acts, by, w, say, o.name); };
  if (opts.length === 1) return done(opts[0], 'llm'); // 只有一种走法（比如直接斩杀）：不用问
  const c = cfg(), ac = new AbortController(), t = setTimeout(() => ac.abort(), TIMEOUT);
  try {
    const r = await ask(c, prompt(s, opts), ac.signal), p = parseChoice(r.text, opts.length);
    if (!p) { const w = unreadable(r); note(`AI 没能出招（${w}），这回合按困难电脑的走法走。`); return done(opts[0], 'fallback', w, r.text); }
    return done(opts[order(s, opts.length)[p.k]], 'llm', '', r.text, p.say);
  } catch (e) { const w = why(e); note(`AI 没能出招（${w}），这回合按困难电脑的走法走。`); return done(opts[0], 'fallback', w); }
  finally { clearTimeout(t); }
}

// 设置页的“试走一回合”：拿一个真实的对局局面完整问一回合（和对局里一模一样的请求），看耗时、选了哪套
export function sample() { let x = 7; const rnd = () => (x = (x * 1664525 + 1013904223) >>> 0) / 4294967296; let s = newGame([DECKS[0].cards, DECKS[1].cards], rnd);
  for (let k = 0; k < 4; k++) for (const a of aiTurn(s, { ...STRONG, rnd })) s = apply(s, a).state; return s; } // 双方各走两回合，场上有东西
export async function ping(c) {
  const s = sample(), opts = options(s), t0 = performance.now(), ac = new AbortController(), t = setTimeout(() => ac.abort(), TIMEOUT);
  try { const r = await ask(c, prompt(s, opts), ac.signal), ms = Math.round(performance.now() - t0), p = parseChoice(r.text, opts.length), head = r.text.replace(/\s+/g, ' ').slice(0, 80);
    if (!p) return { ok: false, msg: `接口通了（${ms} 毫秒），但${unreadable(r)}。模型回的开头：${head || '（空）'}` };
    const o = opts[order(s, opts.length)[p.k]]; return { ok: true, msg: `能用：一回合 ${ms} 毫秒，在 ${opts.length} 套方案里选了${o.name === '引擎首选' ? '和困难电脑一样的那套' : '一套和困难电脑不同的走法'}${p.say ? `，还说「${p.say}」` : ''}。` };
  } catch (e) { return { ok: false, msg: why(e) }; } finally { clearTimeout(t); }
}
