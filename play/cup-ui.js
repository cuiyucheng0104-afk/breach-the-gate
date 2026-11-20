// 卡牌联盟锦标赛的界面：报名（带两套卡组）→ 抽签 → 赛程（积分表 + 这一轮的对阵，自己那场出战）→ 八强淘汰赛的对阵图 → 冠军开宝箱。
// 规则和存档在 cup.js；这里只画、只接按钮。对局本身交给 chess-ui.js（fight 回调），打完一局由它回来调 result()。
// 约定和闯关地图一样：一屏一个主角，金色只给当下该点的那一个按钮；演出用定时器排（?timer 的自动测试靠它，面板收起时也照走）。
import { CARDS, PROTOCOL, FACTIONS } from './chess.js?v=112a67f0';
import { GFX } from './board3d.js?v=112a67f0';
import { progress } from './campaign.js?v=112a67f0';
import * as C from './cup.js?v=112a67f0';
import { uiFx, UI as FXUI } from './ui-pfx.js?v=112a67f0';

const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
const nap = ms => new Promise(r => setTimeout(r, ms));
const calm = () => document.documentElement.classList.contains('calm');
const hero = cards => [...cards].filter(k => CARDS[k].kind === 'unit').sort((a, b) => CARDS[b].cost - CARDS[a].cost)[0];
const fOf = cards => cards.map(k => CARDS[k].faction).find(f => f !== 'n') || 'n';

// 头像：以 AI 命名的选手用像素化的角色立绘（assets/avatars，四种表情）；Q1 是它的王牌 Q-01 超级机甲；其余的人是自己主力卡组里最贵的那个兵
const frames = {};
function face(p, mood = 'idle', tall = 40) {
  if (p.face) { const i = el('img', 'ava'); i.src = `assets/avatars/${p.face}_${mood}.png`; i.alt = ''; i.style.setProperty('--z', Math.max(1, Math.round(tall / 50))); return i; }
  const id = p.key === 'q1' ? 'q_super' : hero(p.decks[0].cards), f = GFX[id], e = el('i', 'ava spr'); if (!f) return e;
  const url = `assets/units/${f.file}_idle.png`; e.style.cssText = `--cell:${f.cell};--feet:${f.feet};--s:${(k => k >= 1 ? Math.floor(k) : k.toFixed(3))(Math.min(tall / f.h, 1.6 * tall / f.cell))};--fps:10`; /* 比格子高的角色缩到格子里（小数倍，略糊一点，换来行高整齐） */
  (frames[url] ||= new Promise(ok => { const i = new Image(); i.onload = () => ok(Math.round(i.naturalWidth / f.cell)); i.onerror = () => ok(0); i.src = url; })).then(n => { if (n) { e.style.setProperty('--n', n); e.style.backgroundImage = `url(${url})`; } });
  return e;
}

// host：开始界面（#home）；px：像素数字；decks()：全部卡组；card(id)：一张中号卡牌元素；valid(cards)：组牌规则的报错（空串是合法）；fight(ctx)：开打一局
export function cupUI({ host, px, decks, card, valid, fight }) {
  const root = el('section'); root.id = 'cup'; root.hidden = true; host.append(root);
  let S = C.load(), pick = 0, entry = [0, 1], live = false; // pick：下一局用自己的第几套；entry：报名时两个卡组位各选了哪套；live：正在播演出，按钮先别响应
  const P = id => S.players[id], me = () => S.players.find(p => p.human), save = () => C.save(S);
  const tag = p => { const st = C.status(p); return st === 'in' ? '<em class="tq">出线</em>' : st === 'out' ? '<em class="tx">淘汰</em>' : ''; };
  const who = (p, mood, tall = 32) => { const b = el('span', 'who' + (p.human ? ' me' : '') + (p.tier === 'max' ? ' top' : '')); b.append(face(p, mood, tall), el('b', '', p.name)); if (p.tag) b.append(el('small', '', p.tag)); return b; };

  // ---------- 报名 ----------
  function drawEntry() {
    const list = decks().map((d, i) => ({ d, i })).filter(x => !valid(x.d.cards)); entry = entry.map((k, j) => list.some(x => x.i === k) ? k : list[j]?.i ?? list[0]?.i ?? -1);
    const box = el('div', 'cup-entry'), slab = el('div', 'slab sign');
    box.append(el('div', 'cup-head', `<h2>卡牌联盟锦标赛</h2><p>十六人 · 瑞士轮 3 胜出线、3 负淘汰 · 前两轮一局定胜负，之后三局两胜 · 八强起淘汰赛</p>`));
    slab.append(el('b', '', '带两套卡组报名'), el('p', 'dim', '每一局开打前，从这两套里挑一套上场。'));
    entry.forEach((k, j) => { const row = el('label', 'slot'), sel = el('select'); sel.setAttribute('aria-label', `第 ${j + 1} 套卡组`);
      for (const x of list) { const o = el('option', '', `${x.d.name}（${FACTIONS[fOf(x.d.cards)].name}）`); o.value = x.i; o.selected = x.i === k; sel.append(o); }
      sel.onchange = () => { entry[j] = +sel.value; draw(); }; const d = decks()[k];
      row.append(el('span', 'no', px(j + 1, 3)), sel); if (d) row.append(el('span', 'mini ' + fOf(d.cards), d.plan || FACTIONS[fOf(d.cards)].key || '')); slab.append(row); });
    const go = el('button', 'primary', '报名'), err = entry[0] === entry[1] ? '两个卡组位要放两套不同的卡组。' : entry.some(k => k < 0) ? '先去组两套合规的卡组。' : '';
    go.disabled = !!err; go.onclick = () => { if (live) return; S = C.newCup(entry.map(k => decks()[k])); save(); draw(); drawDraw(); };
    slab.append(el('p', 'err', err), go);
    const prize = el('div', 'prize'), seeds = el('div', 'seeds');
    for (const r of C.ROSTER.filter(r => r.tier === 'max')) seeds.append(who({ ...r }));
    prize.append(el('i', 'chest'), el('b', '', '冠军奖励'), el('p', 'dim', `卫冕冠军 Q1 的机核卡组「零号协议」12 张：新机制「算力」。`), el('small', 'dim', '种子选手'), seeds);
    box.append(el('div', 'cup-two', '')); box.lastChild.append(slab, prize);
    box.append(el('small', 'credit', '选手头像：角色形象设计 小叶子XIYZ · 美术和制作 喵了个猫了个咪了个猫（meow-ai-arena，MIT）。名字只是致敬，与各家公司无关。')); root.replaceChildren(box);
  }

  // ---------- 抽签：十六个人一个个落进八个对阵位 ----------
  async function drawDraw(skip) {
    const box = el('div', 'cup-draw'), grid = el('div', 'pairs'), go = el('button', 'primary', '开赛'); go.disabled = true;
    box.append(el('div', 'cup-head', '<h2>抽签</h2><p>第一轮按抽签结果两两对阵，之后同战绩的人互相配对。</p>'), grid, go); root.replaceChildren(box);
    const cells = Array.from({ length: 8 }, (_, i) => { const m = el('div', 'pair'); m.append(el('span', 'seat'), el('i', 'vs', 'VS'), el('span', 'seat')); grid.append(m); return m; });
    live = true; let fast = skip || calm(); const hurry = () => { fast = true; }; box.addEventListener('pointerdown', hurry);
    for (let k = 0; k < 16; k++) { const s = cells[k >> 1].children[k & 1 ? 2 : 0]; s.replaceChildren(who(P(S.order[k]))); s.classList.add('in'); if (!fast) await nap(140); }
    live = false; go.disabled = false; go.onclick = () => { C.nextRound(S); save(); draw(); }; go.focus({ preventScroll: true });
  }

  // ---------- 赛程 ----------
  function standings() {
    const t = el('table', 'stand'); t.innerHTML = '<thead><tr><th>#</th><th>选手</th><th>战绩</th><th title="赢的局数减输的局数">小分</th><th></th></tr></thead>';
    const body = el('tbody'); C.table(S).forEach((r, i) => { const tr = el('tr', (r.p.human ? 'me ' : '') + (C.status(r.p) || '')); const n = el('td', 'who-td');
      n.append(who(r.p)); tr.append(el('td', 'rk', px(i + 1, 2)), n, el('td', 'wl', `${px(r.p.w, 2)}<i>-</i>${px(r.p.l, 2)}`), el('td', 'df', (r.diff > 0 ? '+' : '') + r.diff), el('td', '', tag(r.p))); body.append(tr); });
    t.append(body); return t;
  }
  function score(m) { return m.games.length || m.done ? `${px(m.wa, 3)}<i>:</i>${px(m.wb, 3)}` : '<i class="pend">—</i>'; }
  function row(m) {
    const r = el('div', 'match' + (P(m.a).human || P(m.b).human ? ' mine' : '') + (m.done ? ' done' : '')), A = P(m.a), B = P(m.b);
    const side = (p, won) => { const s = el('span', 'side' + (m.done ? won ? ' won' : ' lost' : '')); s.append(who(p, m.done ? won ? 'smug' : 'sad' : 'idle')); return s; };
    r.append(side(A, m.winner === m.a), el('span', 'sc', score(m)), side(B, m.winner === m.b)); r.dataset.bo = 'BO' + m.bo; return r;
  }
  function bracket() { // 八强：四列，八强 → 半决赛 → 决赛 → 冠军；每场两行（选手 + 赢了几局），还没打到的位置是空框
    const b = el('div', 'bracket'), line = (id, m, k) => { const r = el('div', 'kl' + (m?.done ? m.winner === id ? ' won' : ' lost' : '')); if (id === undefined) return r; r.append(who(P(id), m?.done ? m.winner === id ? 'smug' : 'sad' : 'idle', 28), el('span', 'kw', m && (m.games.length || m.done) ? px(k, 2) : '')); return r; };
    for (let r = 0; r < 3; r++) { const col = el('div', 'col'), ms = S.ko[r] || [], list = el('div', 'kcol'); col.append(el('small', 'dim', C.KO_NAMES[r]), list);
      for (let i = 0; i < 4 >> r; i++) { const m = ms[i], k = el('div', 'km' + (m && (P(m.a).human || P(m.b).human) ? ' mine' : '') + (m && !m.done && m === C.humanMatch(S) ? ' now' : '')); k.append(line(m?.a, m, m?.wa), line(m?.b, m, m?.wb)); list.append(k); }
      b.append(col); }
    const top = el('div', 'col'), crown = el('div', 'kcol'), ch = S.champion ?? null; top.append(el('small', 'dim', '冠军'), crown); const k = el('div', 'km champ'); k.append(ch === null ? el('div', 'kl') : who(P(ch), 'smug', 28)); crown.append(k); b.append(top);
    return b;
  }
  function drawHub() {
    const box = el('div', 'cup-hub'), mine = C.humanMatch(S), you = me(), round = S.stage === 'swiss' ? S.rounds[S.rounds.length - 1] : null;
    const head = el('div', 'cup-head'); head.innerHTML = `<h2>${C.roundName(S)}</h2><p>${S.stage === 'swiss' ? (round.bo === 1 ? '这一轮一局定胜负' : '这一轮三局两胜') : '淘汰赛三局两胜'} · 你 ${px(you.w, 2)}<i>-</i>${px(you.l, 2)}${C.status(you) === 'in' ? ' · 已出线' : C.status(you) === 'out' ? ' · 已淘汰' : ''}</p>`;
    const quit = el('button', 'link danger', '退出锦标赛'); quit.onclick = e => { const b = e.currentTarget; if (!b.dataset.sure) { b.dataset.sure = 1; b.textContent = '再点确认'; setTimeout(() => { delete b.dataset.sure; b.textContent = '退出锦标赛'; }, 2000); return; } S = null; C.save(null); draw(); };
    head.append(quit); box.append(head);
    const two = el('div', 'cup-two hub'), left = el('div', 'board-col'), right = el('div', 'list');
    left.append(S.stage === 'swiss' ? standings() : bracket());
    if (S.stage === 'swiss') right.append(...round.matches.map(row)); else two.classList.add('ko');
    // 底下一条石板：自己这场（选卡组 + 出战），或者这一轮怎么往下走
    const slab = el('div', 'slab act');
    if (mine) { const foe = P(mine.a === you.id ? mine.b : mine.a), n = mine.games.length + 1, my = mine.a === you.id ? mine.wa : mine.wb, their = mine.a === you.id ? mine.wb : mine.wa;
      slab.append(who(foe), el('span', 'dim', `${mine.bo === 1 ? '一局定胜负' : `三局两胜 · 第 ${n} 局 · ${my} : ${their}`}`));
      const flags = el('span', 'flags'); you.decks.forEach((d, i) => { const b = el('button', 'flag ' + fOf(d.cards) + (i === pick ? ' on' : ''), d.name); b.setAttribute('aria-pressed', i === pick); b.onclick = () => { pick = i; draw(); }; flags.append(b); });
      const go = el('button', 'primary', '出战'); go.onclick = () => go_(mine); slab.append(flags, go); }
    else if (S.stage === 'done') slab.append(el('span', '', '比赛结束'));
    else if (!C.roundDone(S)) { const b = el('button', 'primary', C.status(you) === 'out' || (S.stage === 'ko' && !S.ko.at(-1).some(m => m.a === you.id || m.b === you.id)) ? '看这一轮' : '开打其他场次'); b.onclick = () => runOthers(); slab.append(el('span', 'dim', '其他场次还没打。'), b); }
    else { const b = el('button', 'primary', S.stage === 'ko' && S.ko.at(-1).length === 1 ? '颁奖' : '下一轮'); b.onclick = () => { C.nextRound(S); save(); draw(); }; slab.append(el('span', 'dim', '这一轮全部打完。'), b);
      if (C.status(you) === 'out' || (S.stage === 'ko' && !S.ko.at(-1).some(m => m.winner === you.id))) { const all = el('button', '', '直接看结果'); all.onclick = () => runAll(); slab.append(all); } }
    two.append(left, ...(S.stage === 'swiss' ? [right] : [])); box.append(two, slab); root.replaceChildren(box);
    root.querySelector('.slab.act .primary')?.focus({ preventScroll: true });
  }
  function go_(m) { // 出战：对面这一局用哪套、谁先手由 cup.js 定；玩家永远在左边先手（和自由对战一样）
    const you = me(), side = m.a === you.id ? 'a' : 'b', foeSide = side === 'a' ? 'b' : 'a', foe = P(m[foeSide]), fd = C.npcDeck(S, m, foeSide); save();
    const fin = S.stage === 'ko' && S.ko.length === 3;
    fight({ base: [C.hpOf(you), C.hpOf(foe)], mine: you.decks[pick], foe: { name: `${foe.name}·${foe.decks[fd].name}`, cards: foe.decks[fd].cards }, rival: foe.name, ai: C.opts(foe), music: fin ? 'boss_final' : foe.key === 'q1' ? 'boss_n4' : foe.tier === 'max' ? 'boss_n1' : null, match: m, side, fd, mi: pick, foeP: foe });
  }
  async function runOthers() { // 别的场次一场场揭晓：比分先空着，真的打完再翻出来（淘汰赛是整张对阵图跟着刷新）
    if (live) return; live = true; const rows = [...root.querySelectorAll('.list .match')]; const ms = C.current(S);
    for (const [i, m] of ms.entries()) { if (m.done) continue; C.simMatch(S, m); save(); const r = rows[i]; if (r) r.replaceWith(row(m)); else root.querySelector('.bracket')?.replaceWith(bracket()); if (!calm()) await nap(260); }
    live = false; draw();
  }
  async function runAll() { // 被淘汰以后：一路打到决赛，每轮停一下让人看见积分表在变
    if (live) return; live = true;
    while (S.stage !== 'done') { for (const m of C.current(S)) if (!m.done) C.simMatch(S, m); C.nextRound(S); save(); draw(); if (!calm()) await nap(400); }
    live = false; draw();
  }

  // ---------- 颁奖 ----------
  function drawDone() {
    const you = me(), place = C.placing(S, you.id), champ = P(S.champion), box = el('div', 'cup-done');
    box.append(el('div', 'cup-head', `<h2>${champ.human ? '你是冠军' : `冠军：${champ.name}`}</h2><p>你的名次：第 ${place} 名</p>`));
    const stage = el('div', 'podium'); stage.append(who(champ, 'smug', 100)); box.append(stage);
    const slab = el('div', 'slab act');
    if (champ.human && !S.prized) { const chest = el('button', 'chest big', ''); chest.setAttribute('aria-label', '开宝箱'); const b = el('button', 'primary', '开宝箱'); const open = () => openChest(box); chest.onclick = b.onclick = open; stage.append(chest); slab.append(el('span', '', '宝箱里是 Q1 的零号协议。'), b); }
    else { if (S.prized) box.append(cardsRow()); const again = el('button', 'primary', '再报名一届'); again.onclick = () => { S = null; C.save(null); draw(); }; slab.append(el('span', 'dim', champ.human ? '零号协议已经在你的牌池里（中立页签）。' : '下一届再来。'), again); }
    box.append(slab); root.replaceChildren(box);
  }
  const cardsRow = () => { const r = el('div', 'loot'); PROTOCOL.forEach((k, i) => { const c = card(k); c.style.setProperty('--i', i); r.append(c); }); return r; };
  async function openChest(box) {
    if (live || S.prized) return; live = true; const owned = progress.data.owned;
    for (const k of PROTOCOL) if (!owned.includes(k)) owned.push(k); progress.save(); S.prized = true; save(); // 先入账再演出：演到一半关掉页面也不丢
    const ch = box.querySelector('.chest'), at = ch?.getBoundingClientRect(), b0 = box.getBoundingClientRect(); ch?.classList.add('open');
    if (at) { uiFx(FXUI.chest, at.left - b0.left + at.width / 2, at.bottom - b0.top, { into: box }); uiFx(FXUI.confetti, b0.width / 2, b0.height, { into: box }); } // 特效库的开箱动画垫在宝箱位置，再撒一把彩纸
    if (!calm()) await nap(900);
    box.querySelector('.podium').after(cardsRow()); live = false; const slab = box.querySelector('.slab.act'); slab.replaceChildren(el('span', 'dim', '零号协议 12 张已经放进你的牌池（机核页签），组牌时就能用。'));
    const again = el('button', 'primary', '再报名一届'); again.onclick = () => { S = null; C.save(null); draw(); }; slab.append(again);
  }

  function draw() { if (!S) return drawEntry(); if (S.stage === 'draw') return drawDraw(true); if (S.stage === 'done') return drawDone(); return drawHub(); }

  return {
    show() { root.hidden = false; draw(); },
    hide() { root.hidden = true; },
    // 一局打完（chess-ui 的结算调它）：记分，返回 { done: 这场比赛打完了没有, won: 这场赢了没有, wa, wb（你在前） }
    result(ctx, won, st, meSeat = 0) {
      const m = C.current(S).find(x => x.a === ctx.match.a && x.b === ctx.match.b && !x.done); if (!m) return null;
      const mine = ctx.side, g = { w: won ? mine : mine === 'a' ? 'b' : 'a', [mine === 'a' ? 'da' : 'db']: ctx.mi, [mine === 'a' ? 'db' : 'da']: ctx.fd, hp: mine === 'a' ? [st.base[meSeat], st.base[1 - meSeat]] : [st.base[1 - meSeat], st.base[meSeat]], n: Math.ceil(st.n / 2) };
      const done = C.addGame(S, m, g); C.follow(S); save(); /* 同一轮的别的场次跟着打到同样的局数（这场打完了就全部打完） */ const [a, b] = mine === 'a' ? [m.wa, m.wb] : [m.wb, m.wa]; return { done, won: done && m.winner === me().id, my: a, their: b, bo: m.bo };
    },
    state: () => S, face,
  };
}
