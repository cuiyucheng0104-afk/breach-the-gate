// 每日挑战和对电脑的积分：纯逻辑和存档，不碰画面（画面在 chess-ui.js）。都只存在本机，不需要服务器。
// 每日挑战：用当天的日期算种子，所有人拿到同一对预设卡组、同一个牌序，对面是大师电脑。可以重打，成绩按当天第一次算。
// 积分：自由对战里每打完一局内置电脑（不算大模型、联机、每日挑战），按 Elo 涨跌；中途放弃算输。
import { DECKS } from './chess.js?v=112a67f0';
import { rng } from './cup.js?v=112a67f0';

const DAY = 'yibu-fanpan.daily.v1', RATE = 'yibu-fanpan.rating.v1';
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch { return d; } };
const keep = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 存不了就只在这次打开期间有效 */ } };

// ---------- 每日挑战 ----------
export const dayKey = (t = new Date()) => `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; // 按本机时区的日历日
export function today(date = dayKey()) {
  let h = 2166136261; for (const c of date) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  const seed = h >>> 0, r = rng(seed), i = Math.floor(r() * DECKS.length); let j = Math.floor(r() * (DECKS.length - 1)); if (j >= i) j++; // 两边不用同一套
  const pick = d => ({ name: d.name, cards: [...d.cards] });
  return { date, seed, mine: pick(DECKS[i]), foe: pick(DECKS[j]) };
}
// rec：存档里的当天记录（别的日子的作废）；res：{ won, turns, hp, cap, foeHp, foeCap }
export function addDaily(rec, date, res) {
  if (!rec || rec.date !== date) return { date, first: res, tries: 1, won: res.won };
  return { ...rec, tries: rec.tries + 1, won: rec.won || res.won };
}
export const daily = () => load(DAY, null);
export const dailyDone = (date = dayKey()) => daily()?.date === date;
export const recordDaily = (date, res) => { const r = addDaily(daily(), date, res); keep(DAY, r); return r; };
export const shareText = (rec, d) => { const f = rec.first; return `攻破城门 · 每日挑战 ${rec.date}\n「${d.mine.name}」对「${d.foe.name}」（大师电脑）\n${f.won ? '攻破城门' : '城门失守'} · 第 ${f.turns} 回合 · 我方城门 ${f.hp}/${f.cap} · 对面 ${f.foeHp}/${f.foeCap}`; };

// ---------- 积分 ----------
// shortcut: 各档电脑的分是粗估（只实测过大师对困难约赢 64% ≈ 高 100 分），攒到玩家真实胜率后再校
export const AI_R = { easy: 800, normal: 1050, hard: 1300, master: 1400 };
const TITLES = [[0, '新兵'], [900, '士兵'], [1050, '百夫长'], [1200, '骑士'], [1300, '将军'], [1400, '攻城大师']];
export const title = r => TITLES.filter(([x]) => r >= x).pop()[1];
export const elo = (me, n, foe, won) => Math.round(me + (n < 10 ? 48 : 24) * ((won ? 1 : 0) - 1 / (1 + 10 ** ((foe - me) / 400)))); // 前 10 局涨跌快，好让新玩家尽快到自己的位置
export const rating = () => load(RATE, { r: 1000, n: 0, w: 0 });
export function rate(won, diff) { // 返回 { from, to }；不认识的难度（大模型）不算
  const s = rating(); if (!(diff in AI_R)) return null;
  const to = elo(s.r, s.n, AI_R[diff], won); keep(RATE, { r: to, n: s.n + 1, w: s.w + (won ? 1 : 0) }); return { from: s.r, to };
}
