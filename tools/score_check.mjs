// 每日挑战和积分的自检：node tools/score_check.mjs
import assert from 'node:assert/strict';
import { today, addDaily, elo, title, AI_R } from '../score.js';
import { DECKS, newGame } from '../chess.js';
import { rng } from '../cup.js';

const a = today('2026-11-20'), b = today('2026-11-20'), c = today('2026-11-21');
assert.deepEqual(a, b, '同一天算出来的题一样');
assert.notEqual(a.mine.name, a.foe.name, '两边不用同一套');
assert.ok(DECKS.some(d => d.name === a.mine.name) && DECKS.some(d => d.name === a.foe.name));
assert.notEqual(a.seed, c.seed, '换一天种子就变');
const deal = d => { const s = newGame([d.mine.cards, d.foe.cards], rng(d.seed)); return JSON.stringify([s.hand, s.turn]); };
assert.equal(deal(a), deal(b), '同一天开局的手牌和先后手一样');
const names = new Set(Array.from({ length: 60 }, (_, i) => today(`2026-12-${i}`).mine.name)); assert.ok(names.size > 5, '换日子会轮到不同的卡组');

const win = { won: true, turns: 7 }, lose = { won: false, turns: 9 };
let r = addDaily(null, 'd1', lose); assert.deepEqual(r, { date: 'd1', first: lose, tries: 1, won: false });
r = addDaily(r, 'd1', win); assert.equal(r.tries, 2); assert.equal(r.first, lose, '成绩按第一次算'); assert.ok(r.won);
r = addDaily(r, 'd2', win); assert.equal(r.tries, 1, '换一天重新记'); assert.equal(r.first, win);

assert.equal(elo(1000, 20, 1000, true), 1012); assert.equal(elo(1000, 20, 1000, false), 988);
assert.ok(elo(1000, 0, 1000, true) - 1000 > elo(1000, 20, 1000, true) - 1000, '前几局涨得快');
assert.ok(elo(1400, 20, AI_R.easy, true) - 1400 <= 1, '高分打入门电脑几乎不涨');
assert.equal(title(1000), '士兵'); assert.equal(title(AI_R.master), '攻城大师'); assert.equal(title(0), '新兵');
