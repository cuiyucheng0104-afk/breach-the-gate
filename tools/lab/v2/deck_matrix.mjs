// 逐套预设卡组比两个电脑：所有预设两两对阵（含同套对打；A 用 i 套、B 用 j 套，反过来是另一格），每格各先手一半，只有电脑不同。
// 用法：node tools/lab/v2/deck_matrix.mjs <电脑A> <电脑B> [每格局数=40，取 4 的倍数] [线程数] [种子起点=950001] [结果JSON]
//   环境变量 DECKS=卡组.json（[{name, f, cards}]）换掉预设，比如各阵营找出来的最强卡组互打
//   输出：A 用每套卡组时的胜率（对 B 的所有卡组）、每格 A 的胜率；JSON {a,b,decks,perDeck:[{deck,win,ci,games}],cells:[[win…]]}
import { isMainThread, parentPort, workerData } from 'node:worker_threads';
import { availableParallelism } from 'node:os';
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { DECKS as PRESETS, newGame, apply, aiTurn } from '../../../chess.js';
import { readFileSync } from 'node:fs';
import { makeAI, lcg, farm } from '../play.mjs';

const DECKS = process.env.DECKS ? JSON.parse(readFileSync(process.env.DECKS, 'utf8')) : PRESETS, ND = DECKS.length;
if (!isMainThread) {
  const A = makeAI(workerData.a), B = makeAI(workerData.b), per = workerData.per;
  parentPort.on('message', ({ from, n }) => {
    const won = new Float64Array(ND * ND), cnt = new Float64Array(ND * ND);
    for (let g = from; g < from + n; g++) {
      const cell = Math.floor(g / per), i = Math.floor(cell / ND), j = cell % ND, k = g % per; // A 用第 i 套，B 用第 j 套
      const seed = (workerData.base + Math.floor(g / 2)) * 2654435761 >>> 0, aFirst = (k & 1) === 0, seatA = aFirst ? 0 : 1, rnd = lcg(seed);
      const da = [...DECKS[i].cards], db = [...DECKS[j].cards];
      let s = newGame(aFirst ? [da, db] : [db, da], rnd);
      while (s.winner === null && s.n <= 70) { for (const x of aiTurn(s, { ...(s.turn === seatA ? A : B), rnd })) s = apply(s, x).state; }
      const res = s.winner !== null ? s.winner : s.base[0] > s.base[1] ? 0 : s.base[1] > s.base[0] ? 1 : -1;
      won[cell] += res === seatA ? 1 : res < 0 ? .5 : 0; cnt[cell]++;
    }
    parentPort.postMessage({ won, cnt }, [won.buffer, cnt.buffer]);
  });
} else if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [a, b, P = '40', W = String(Math.max(1, availableParallelism() - 1)), base = '950001', out] = process.argv.slice(2), per = Math.max(4, +P - +P % 4), t0 = Date.now();
  const won = new Float64Array(ND * ND), cnt = new Float64Array(ND * ND);
  await farm(new URL(import.meta.url), ND * ND * per, +W, per, { a, b, per, base: +base }, r => { for (let c = 0; c < ND * ND; c++) { won[c] += r.won[c]; cnt[c] += r.cnt[c]; } });
  const ci = (p, n) => 1.96 * Math.sqrt(p * (1 - p) / n);
  const perDeck = DECKS.map((d, i) => { let w = 0, n = 0; for (let j = 0; j < ND; j++) { w += won[i * ND + j]; n += cnt[i * ND + j]; } return { deck: d.name, win: w / n, ci: ci(w / n, n), games: n }; });
  const cells = DECKS.map((_, i) => DECKS.map((_, j) => won[i * ND + j] / cnt[i * ND + j]));
  for (const r of perDeck) console.log(`${r.deck.padEnd(6, '　')} ${(100 * r.win).toFixed(1)}% ± ${(100 * r.ci).toFixed(1)}（${r.games} 局）`);
  const W0 = won.reduce((x, y) => x + y), N0 = cnt.reduce((x, y) => x + y);
  console.log(`${a} 对 ${b}：总胜率 ${(100 * W0 / N0).toFixed(1)}%（${N0} 局，${((Date.now() - t0) / 1000).toFixed(0)} 秒）`);
  if (out) writeFileSync(out, JSON.stringify({ a, b, decks: DECKS.map(d => d.name), factions: DECKS.map(d => d.f), perDeck, cells, total: W0 / N0, games: N0 }));
}
