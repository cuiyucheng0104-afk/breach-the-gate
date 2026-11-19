// 找每个阵营的最强卡组：先按组合拟合（combo_fit 的单卡 + 两张 + 三张贡献）拼候选，再让同一个电脑实打 14 套预设验证，最后在实打里逐张换牌往上爬。
// 用法：node tools/lab/v2/best_decks.mjs <fit目录> <电脑 spec> <输出JSON> [--per 48] [--climb 2] [--tries 4] [--threads 20] [--boss 1]
//   --per：候选对每套预设打几局（一半先手）；--climb：爬几轮；--tries：每轮试几种换牌；--boss 1：另找一副带首领的（首领要在闯关里赢到手）
//   奖励牌（锦标赛赢来的）不进候选。输出：每个阵营 {best, bestBoss, presets:[本阵营预设的成绩], tried:[…]}，每副 {cards, names, fit, win, ci, games, perPreset}
import { isMainThread, parentPort, workerData } from 'node:worker_threads';
import { availableParallelism } from 'node:os';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { CARDS, DECKS, newGame, apply, aiTurn, deckError } from '../../../chess.js';
import { makeAI, lcg, farm } from '../play.mjs';

if (!isMainThread) { // 一份活 = 若干局 [候选号, 预设号, 局号]
  const ai = makeAI(workerData.ai);
  parentPort.on('message', ({ from, n }) => {
    const out = [];
    for (const [ci, pi, k] of workerData.jobs.slice(from, from + n)) {
      const a = workerData.decks[ci], b = DECKS[pi].cards, seed = (workerData.base + pi * 1000 + Math.floor(k / 2)) * 2654435761 >>> 0, aFirst = (k & 1) === 0, seatA = aFirst ? 0 : 1, rnd = lcg(seed);
      let s = newGame(aFirst ? [[...a], [...b]] : [[...b], [...a]], rnd);
      while (s.winner === null && s.n <= 70) for (const x of aiTurn(s, { ...ai, rnd })) s = apply(s, x).state;
      const res = s.winner !== null ? s.winner : s.base[0] > s.base[1] ? 0 : s.base[1] > s.base[0] ? 1 : -1;
      out.push([ci, pi, res === seatA ? 1 : res < 0 ? .5 : 0]);
    }
    parentPort.postMessage(out);
  });
}

const readCSV = t => { const [h, ...rows] = t.trim().split('\n'); const k = h.split(','); return rows.map(r => Object.fromEntries(r.split(',').map((v, i) => [k[i], v]))); };
// 组合分：单卡 + 卡组里出现的两张、三张组合（都是百分点）
export function scorer(singles, pairs = [], triples = []) {
  const S = Object.fromEntries(singles.map(r => [r.id, +r.pp])), P = new Map(pairs.map(r => [[r.a, r.b].sort().join('|'), +r.pp])), T = triples.map(r => [[r.a, r.b, r.c], +r.pp]);
  const score = d => { const set = new Set(d); let v = 0; for (const k of d) v += S[k] ?? 0;
    for (let i = 0; i < d.length; i++) for (let j = i + 1; j < d.length; j++) v += P.get([d[i], d[j]].sort().join('|')) ?? 0;
    for (const [t, pp] of T) if (t.every(k => set.has(k))) v += pp; return v; };
  const adj = new Map(); for (const r of pairs) if (+r.pp > 0) for (const [x, y] of [[r.a, r.b], [r.b, r.a]]) (adj.get(x) || adj.set(x, []).get(x)).push([y, +r.pp]);
  const pot = (k, d) => (adj.get(k) || []).reduce((v, [y, pp]) => d.includes(y) ? v : v + pp / 2, 0); // 还没凑齐的正配对先记一半：贪心一次只加一张，不这样两张都得在才有分的配对永远选不上
  return { S, score, pot };
}
// 按组合分拼一副：从 start 起贪心补满，再一张张换到不能再涨；rnd 给了就在前几名里随机挑（拼出不同的候选）
export function build(pool, score, { start = [], rnd = null, boss = false, legal, pot = () => 0 }) {
  let d = [...start]; // 阵营由 pool 保证（本阵营 + 中立），首领最多一张在下面挑牌时管
  while (d.length < 12) {
    const c = pool.filter(k => !d.includes(k) && (boss || !CARDS[k].boss) && !(CARDS[k].boss && d.some(x => CARDS[x].boss))).map(k => [k, score([...d, k]) + (d.length < 11 ? pot(k, d) : 0)]).sort((a, b) => b[1] - a[1]);
    const pick = rnd ? c[Math.floor(rnd() * Math.min(4, c.length))] : c[0]; d.push(pick[0]);
  }
  for (let improved = true, guard = 0; improved && guard < 50; guard++) { improved = false; const base = score(d);
    for (let i = 0; i < 12 && !improved; i++) for (const k of pool) { if (d.includes(k) || (!boss && CARDS[k].boss)) continue;
      const e = [...d]; e[i] = k; if (legal(e)) continue; if (score(e) > base + 1e-9) { d = e; improved = true; break; } } }
  assert.equal(legal(d), '', '拼出来的卡组不合法：' + legal(d)); return d;
}

async function main() {
  const args = process.argv.slice(2), opt = (k, v) => { const i = args.indexOf(k); if (i < 0) return v; const x = args[i + 1]; args.splice(i, 2); return x; };
  const per = +opt('--per', 48), climb = +opt('--climb', 2), tries = +opt('--tries', 4), W = +opt('--threads', Math.max(1, availableParallelism() - 1)), withBoss = opt('--boss', '1') === '1';
  const [fit, ai, out] = args; if (!out) { console.error('用法：node tools/lab/v2/best_decks.mjs <fit目录> <电脑> <输出JSON> [--per 48] [--climb 2] [--tries 4]'); process.exit(2); }
  const R = f => readCSV(readFileSync(join(fit, f), 'utf8'));
  const singles = R('singles.csv'), { S, score, pot } = scorer(singles, R('pairs.csv'), R('triples.csv'));
  const bosses = Object.keys(CARDS).filter(k => CARDS[k].boss), legal = d => deckError(d, bosses), t0 = Date.now();
  const FS = [...new Set(DECKS.map(d => d.f))], name = d => d.map(k => CARDS[k].name);
  let base = 990001;
  const play = async decks => { // 每副候选打 14 套预设各 per 局 → 胜率
    const jobs = []; decks.forEach((_, ci) => DECKS.forEach((_, pi) => { for (let k = 0; k < per; k++) jobs.push([ci, pi, k]); }));
    const w = decks.map(() => DECKS.map(() => [0, 0]));
    await farm(new URL(import.meta.url), jobs.length, W, per, { ai, decks, jobs, base }, r => { for (const [ci, pi, x] of r) { w[ci][pi][0] += x; w[ci][pi][1]++; } });
    base += 7; // 每批换一组种子，免得爬山时对着同一批局过拟合
    return decks.map((d, ci) => { const t = w[ci].reduce((a, b) => [a[0] + b[0], a[1] + b[1]]), p = t[0] / t[1];
      return { cards: d, names: name(d), fit: +score(d).toFixed(1), win: p, ci: 1.96 * Math.sqrt(p * (1 - p) / t[1]), games: t[1], perPreset: w[ci].map(([a, n], pi) => ({ deck: DECKS[pi].name, win: a / n })) }; });
  };
  const res = {};
  for (const f of FS) {
    const pool = Object.keys(CARDS).filter(k => { const c = CARDS[k]; return (c.faction === f || c.faction === 'n') && !c.token && !c.prize && S[k] !== undefined; });
    const rnd = lcg(f.charCodeAt(1) * 7919), cands = [build(pool, score, { legal, pot }), build(pool, score, { legal, rnd, pot }), build(pool, score, { legal, rnd, pot })];
    if (withBoss) cands.push(build(pool, score, { legal, boss: true, pot }));
    const presets = DECKS.filter(d => d.f === f).map(d => d.cards), uniq = [...new Map([...cands, ...presets].map(d => [[...d].sort().join(), d])).values()];
    let tried = await play(uniq); const isBoss = d => d.cards.some(k => CARDS[k].boss);
    const top = boss => tried.filter(t => isBoss(t) === boss).sort((a, b) => b.win - a.win)[0];
    for (const boss of withBoss ? [false, true] : [false]) { // 爬山：去掉组合分贡献最小的一张，换成候选池里补进来分最高的几张，实打，好了就换
      let cur = top(boss); if (!cur) continue;
      for (let r = 0; r < climb; r++) {
        const d = cur.cards, contrib = d.map((k, i) => [i, score(d) - score(d.filter((_, j) => j !== i))]).sort((a, b) => a[1] - b[1]).slice(0, 3);
        const props = [];
        for (const [i] of contrib) for (const k of pool) { if (d.includes(k) || (CARDS[k].boss && !boss)) continue; const e = [...d]; e[i] = k; if (!legal(e)) props.push([e, score(e)]); }
        props.sort((a, b) => b[1] - a[1]); const pick = [...new Map(props.map(p => [[...p[0]].sort().join(), p[0]])).values()].slice(0, tries);
        if (!pick.length) break;
        const again = (await play([cur.cards, ...pick])); tried.push(...again.slice(1)); const best = again.sort((a, b) => b.win - a.win)[0];
        console.log(`  ${f}${boss ? '（带首领）' : ''} 第 ${r + 1} 轮：现任 ${(100 * again.find(x => x.cards === cur.cards || x.cards.join() === cur.cards.join()).win).toFixed(1)}%，最好 ${(100 * best.win).toFixed(1)}%`);
        if (best.cards.join() === cur.cards.join()) break; cur = best;
      }
      res[f] = { ...res[f], [boss ? 'bestBoss' : 'best']: cur };
    }
    res[f].presets = tried.filter(t => presets.some(p => p.join() === t.cards.join())).map(t => ({ ...t, preset: DECKS.find(d => d.cards.join() === t.cards.join()).name }));
    res[f].tried = tried.length;
    const b = res[f].best; console.log(`${f}：最强 ${(100 * b.win).toFixed(1)}% ±${(100 * b.ci).toFixed(1)}（${b.names.join('、')}）；本阵营预设 ${res[f].presets.map(p => `${p.preset} ${(100 * p.win).toFixed(1)}%`).join('，')}（${((Date.now() - t0) / 60000).toFixed(0)} 分钟）`);
    writeFileSync(out, JSON.stringify({ ai, fit, per, res }, null, 1));
  }
}

function selftest() {
  const ids = Object.keys(CARDS).filter(k => (CARDS[k].faction === 'f1' || CARDS[k].faction === 'n') && !CARDS[k].token && !CARDS[k].prize);
  const good = ids.filter(k => !CARDS[k].boss).slice(0, 14), singles = ids.map(k => ({ id: k, pp: good.includes(k) ? '5' : '-1' }));
  const pairs = [{ a: good[12], b: good[13], pp: '50' }], { score, pot } = scorer(singles, pairs), bosses = Object.keys(CARDS).filter(k => CARDS[k].boss), legal = d => deckError(d, bosses);
  const d = build(ids, score, { legal, pot });
  assert.equal(legal(d), ''); assert.ok(d.includes(good[12]) && d.includes(good[13]), '强配对的两张都要进卡组');
  assert.equal(d.filter(k => good.includes(k)).length, 12, '12 张都该是单卡分高的'); assert.ok(!d.some(k => CARDS[k].boss), '默认不带首领');
  console.log('自检通过');
}

if (isMainThread && import.meta.url === pathToFileURL(process.argv[1]).href) { if (process.argv.includes('--selftest')) selftest(); else await main(); }
