// node tools/net_load_check.mjs：牌表重排保持推理结果，坏权重和增删牌仍拒绝。
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CIDS, D, fromJSON, mixAI } from '../chess-net.js';
import { DECKS, newGame, aiTurn, apply } from '../chess.js';
const original = JSON.parse(readFileSync(new URL('../assets/ai/net-g5.json', import.meta.url)));
const net = fromJSON(original);
for (let i = 0; i < CIDS.length; i++) {
  const old = original.cards.indexOf(CIDS[i]) + 1;
  assert.deepEqual(net.E.slice((i + 1) * D, (i + 2) * D), Float32Array.from(original.E.slice(old * D, (old + 1) * D)));
}
const shuffled = structuredClone(original);
shuffled.cards.reverse();
shuffled.E = original.E.slice(0, D).concat(...shuffled.cards.map(k => {
  const i = original.cards.indexOf(k) + 1; return original.E.slice(i * D, (i + 1) * D);
}));
const a = mixAI(net), b = mixAI(fromJSON(shuffled));
let seed = 11020;
const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
let turns = 0;
for (let game = 0; game < 4; game++) {
  let s = newGame([DECKS[game].cards, DECKS[(game + 3) % DECKS.length].cards], rnd);
  for (let t = 0; t < 12 && s.winner === null; t++) {
    for (const me of [0, 1]) { assert(Number.isFinite(a.value(s, me))); assert.equal(a.value(s, me), b.value(s, me)); }
    const actions = aiTurn(s, a); assert(actions.length);
    for (const action of actions) s = apply(s, action).state;
    turns++;
  }
}
for (const mutate of [o => o.cards.pop(), o => o.cards.push('new-card'), o => o.cards[0] = o.cards[1], o => o.W1.pop(), o => o.E[0] = NaN, o => o.din++, o => o.v = 99]) {
  const o = structuredClone(original); mutate(o); assert.throws(() => fromJSON(o));
}
console.log(`通过：404 张牌按 ID 对齐，重排前后评分一致，${turns} 个大师回合正常，7 类不兼容/损坏权重被拒绝。`);
