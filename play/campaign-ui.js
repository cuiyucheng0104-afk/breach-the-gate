// 闯关地图：关卡是节点，玩家是站在节点上的一枚棋子。地图完全由 campaign.js 的 AREAS 生成——加一个场地或一关，这里不用改。
// 版式：有徽章的场地（BADGES）各占一行，从左往右走到城门；没有徽章的场地排在城门后面，集齐徽章才开门。约定见 DESIGN.md「闯关地图」。
// 存档只读写 progress（campaign.js）；棋子站在哪不进存档，只记在这次打开期间（sel）。
import { CARDS } from './chess.js?v=112a67f0';
import { GFX } from './board3d.js?v=112a67f0';
import { AREAS, BADGES, areaOf, badgeName, progress } from './campaign.js?v=112a67f0';

const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
const nap = ms => new Promise(r => setTimeout(r, ms)); // 演出一律用定时器排，不等动画事件：浏览器面板收起时动画不走，定时器照走（?timer 的自动测试靠这个）
const calm = () => document.documentElement.classList.contains('calm');

// 会动的像素角色：帧图是一横条方格（assets/units/<图集>_<动作>.png），格子边长和脚底位置取自 GFX；帧数等图到了按宽度算，播放交给样式里的 steps()
const frames = {};
function sprite(id, act = 'idle', tall = 56) { // tall：希望站起来大约多高（像素），按原图的整数倍取最接近的
  const f = GFX[id], e = el('i', 'spr'); if (!f) return e;
  const url = `assets/units/${f.file}_${act}.png`;
  e.style.cssText = `--cell:${f.cell};--feet:${f.feet};--s:${Math.max(1, Math.round(tall / f.h))};--fps:${act === 'run' ? 14 : 10}`;
  (frames[url] ||= new Promise(ok => { const i = new Image(); i.onload = () => ok(Math.round(i.naturalWidth / f.cell)); i.onerror = () => ok(0); i.src = url; }))
    .then(n => { if (n) { e.style.setProperty('--n', n); e.style.backgroundImage = `url(${url})`; } });
  return e;
}
const hero = cards => [...cards].filter(k => CARDS[k].kind === 'unit').sort((a, b) => CARDS[b].cost - CARDS[a].cost)[0]; // 棋子长什么样：卡组里费用最高的单位

// ---------- 只读的进度查询（传进来的是存档数据，演出时要拿“打赢之前”的那份来画） ----------
const gated = key => !BADGES.includes(key);                                                // 城门后面的场地
const opened = d => BADGES.every(k => d.done[k]);
const goal = (d, key) => gated(key) && !opened(d) ? -1 : d.runs[key] ? d.runs[key].at : 0; // 这个场地现在能去的那一关；进不去是 -1。通关过的场地可以从第一关再打一遍
const pickArea = (d, was) => was && goal(d, was) >= 0 && (d.runs[was] || !d.done[was]) ? was       // 棋子默认站哪：上次站的地方 → 打到一半的 → 还没打过的；全打完了就留在原地（刚打开就站最后一个场地），从第一关可以再打一遍
  : (AREAS.find(a => d.runs[a.key]) || AREAS.find(a => !d.done[a.key] && goal(d, a.key) >= 0) || (was && goal(d, was) >= 0 ? areaOf(was) : AREAS.findLast(a => goal(d, a.key) >= 0)))?.key || null;

// host：开始界面（#home）；px：像素数字；decks()：全部卡组；chosen() / choose(i)：开始界面上选中的那套；fight(场地)：开打这个场地当前的一关
export function campaignUI({ host, px, decks, chosen, choose, fight }) {
  const roads = AREAS.filter(a => !gated(a.key)), lanes = AREAS.filter(a => gated(a.key)), cols = Math.max(...roads.map(a => a.stages.length));
  const root = el('section'), map = el('div', 'cmap'), strip = el('div', 'cinfo'); root.id = 'camp'; root.hidden = true;
  map.setAttribute('role', 'group'); map.setAttribute('aria-label', '闯关地图'); map.style.cssText = `--rows:${roads.length};--total:${cols + 2 + Math.max(0, ...lanes.map(a => a.stages.length))}`;
  const spine = el('i', 'spine'), wall = el('i', 'wall'), door = el('i', 'door'), piece = el('i', 'piece'); wall.style.gridColumn = door.style.gridColumn = cols + 2; piece.setAttribute('aria-hidden', 'true');
  const nodes = {}, slots = {};
  const node = (a, i, row, col) => { const s = a.stages[i], b = el('button', `node ${a.key}`); b.dataset.area = a.key; b.dataset.stage = i; b.style.gridRow = row; b.style.gridColumn = col; if (s.boss) b.dataset.boss = s.boss; return b; };
  let size = 0; const tall = () => size;
  function resize() { const n = +getComputedStyle(map).getPropertyValue('--sprite') || 56; if (n === size) return; size = n; for (const b of map.querySelectorAll('.node[data-boss]')) b.replaceChildren(sprite(b.dataset.boss, 'idle', n)); } // 角色多高由样式定（手机上小一号）：版式换了，首领跟着重画
  host.append(root); root.append(map, strip); map.append(spine, wall, door);
  roads.forEach((a, r) => { nodes[a.key] = a.stages.map((_, i) => node(a, i, r + 1, cols + 2 - a.stages.length + i)); // 短的路靠城门那头对齐：首领永远挨着自己的徽章槽
    const s = slots[a.key] = el('i', 'slot ' + a.key, '<i class="badge"></i>'); s.style.gridRow = r + 1; s.style.gridColumn = cols + 2; s.dataset.area = a.key; s.title = badgeName(a.key); map.append(...nodes[a.key], s); });
  lanes.forEach((a, k) => { nodes[a.key] = a.stages.map((_, i) => node(a, i, '1 / -1', cols + 3 + i)); for (const b of nodes[a.key]) { b.classList.add('lane'); b.style.setProperty('--k', k - (lanes.length - 1) / 2); } map.append(...nodes[a.key]); });
  map.append(piece);
  strip.innerHTML = '<div class="what"><b></b><p></p></div><span class="hp" role="img"></span><select aria-label="带哪套卡组进场"></select><button class="link">退出场地</button><button class="primary">出战</button>';
  const [nameEl, tipEl] = strip.querySelector('.what').children, hpEl = strip.querySelector('.hp'), pick = strip.querySelector('select'), quit = strip.querySelector('.link'), go = strip.querySelector('.primary');

  let sel = null, stand = null, heroId = '', moving = 0, walking = 0, seq = 0, pending = null; // sel：棋子所在的场地；stand：棋子脚下的节点；pending：刚打赢、还没演的那一步
  const at = (d, key) => key ? nodes[key][Math.max(0, goal(d, key))] : nodes[AREAS.at(-1).key].at(-1); // 哪也不站的时候（全通关），棋子停在最后一个节点上

  // ---------- 画 ----------
  const WORD = { here: '棋子在这里', next: '可以去', done: '已过关', locked: '还没到' };
  function paint(d, cur) { // 节点、徽章槽、城门：全按存档算，不留自己的状态
    for (const a of AREAS) { const run = d.runs[a.key], g = goal(d, a.key);
      a.stages.forEach((s, i) => { const b = nodes[a.key][i], done = run ? i < run.at : !!d.done[a.key], state = i === g && a.key === cur ? 'here' : done ? 'done' : i === g ? 'next' : 'locked';
        b.dataset.state = state; b.classList.toggle('cur', a.key === cur); b.toggleAttribute('data-got', !!s.boss && d.owned.includes(s.boss)); b.setAttribute('aria-disabled', i !== g); b.tabIndex = state === 'here' ? 0 : -1;
        b.title = `${a.name} · ${s.name}`; b.setAttribute('aria-label', `${a.name}第 ${i + 1} 关：${s.name}${s.boss ? '（首领）' : ''}，${WORD[state]}${state === 'done' && i === g ? '，可以再打' : ''}`); }); }
    for (const k of BADGES) { slots[k].classList.toggle('on', !!d.done[k]); slots[k].setAttribute('aria-label', badgeName(k) + (d.done[k] ? '：已获得' : '：未获得')); }
    map.classList.toggle('open', opened(d));
  }
  function info(d, cur) { // 底下那一条：只说棋子脚下这一关——关名、一句打法、双方城堡的血、开局摆在对面场上的东西
    strip.hidden = !cur; if (!cur) return;
    const run = d.runs[cur], s = areaOf(cur).stages[goal(d, cur)], list = decks();
    nameEl.textContent = s.name; tipEl.textContent = s.intro;
    hpEl.title = `你的城堡 ${s.base[0]}，对面的城堡 ${s.base[1]}`; hpEl.setAttribute('aria-label', hpEl.title); hpEl.innerHTML = `<i class="heart"></i>${px(s.base[0])}<i class="heart foe"></i>${px(s.base[1])}`;
    hpEl.append(...(s.setup || []).map(x => { const e = sprite(x.card, 'idle', 40); e.title = CARDS[x.card].name; return e; }));
    pick.hidden = !!run; quit.hidden = !run; delete quit.dataset.sure; quit.textContent = '退出场地'; // 卡组进场才锁：没进场的路上才给换
    if (!run) pick.replaceChildren(...list.map((x, i) => { const o = el('option', '', x.name); o.value = i; o.selected = i === chosen(); return o; }));
  }
  const deckOf = (d, key) => d.runs[key]?.deck || decks()[chosen()];
  function dress(d, key) { const id = hero(deckOf(d, key).cards); if (id === heroId) return; heroId = id; piece.replaceChildren(sprite(id, 'idle', tall())); sprite(id, 'run', tall()); } // 跑步的帧图顺手取回来，走的时候不闪
  const center = e => [Math.round(e.offsetLeft + e.offsetWidth / 2), Math.round(e.offsetTop + e.offsetHeight / 2)];
  const spot = b => { const [x, y] = center(b); return [b.dataset.boss ? x - Math.round(b.offsetWidth * .2) : x, y]; }; // 首领节点上棋子往左让一步，和首领面对面
  const put = ([x, y]) => { piece.style.translate = `${x}px ${y}px`; };
  function draw() { const d = progress.data; moving++; seq++; walking = 0; for (const x of piece.getAnimations()) x.cancel(); piece.classList.remove('left'); map.classList.remove('swing'); map.querySelector('.fly')?.remove();
    resize(); paint(d, sel); info(d, sel); heroId = ''; dress(d, sel); stand = at(d, sel); put(spot(stand)); }

  // ---------- 走 ----------
  function route(a, b) { // 沿着路走：同一条路直走；换路先退回左边的主干再拐；进出城门后面走城门那一侧
    const p = spot(a), q = spot(b); if (p[1] === q[1]) return [p, q];
    const x = gated(a.dataset.area) || gated(b.dataset.area) ? center(wall)[0] : center(spine)[0]; return [p, [x, p[1]], [x, q[1]], q].filter((v, i, l) => !i || v[0] !== l[i - 1][0] || v[1] !== l[i - 1][1]);
  }
  async function walk(pts) { // 整像素地走（每 2px 一格）；再远也不超过 0.8 秒。返回 false 表示半路被新的指令顶掉了
    const id = walking = ++moving; for (const x of piece.getAnimations()) x.cancel();
    if (calm()) { const out = piece.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 120, fill: 'forwards' }); await nap(120); if (id !== moving) return false; walking = 0; out.cancel(); put(spot(stand)); piece.animate([{ opacity: 0 }, { opacity: 1 }], 120); return true; } // 减少动态效果：原地淡出，到地方淡入
    const len = pts.slice(1).map((p, i) => Math.abs(p[0] - pts[i][0]) + Math.abs(p[1] - pts[i][1])), total = len.reduce((a, b) => a + b, 0) || 1, ms = Math.min(800, Math.max(160, total / .6));
    let run = 0; const kf = pts.map((p, i) => { const k = { translate: `${p[0]}px ${p[1]}px`, offset: run / total, easing: `steps(${Math.max(1, Math.round((len[i] || 2) / 2))})` }, dx = pts[i + 1] ? pts[i + 1][0] - p[0] : 0;
      if (dx) setTimeout(() => { if (id === moving) piece.classList.toggle('left', dx < 0); }, ms * run / total); run += len[i] || 0; return k; }); // 朝向跟着这一段的方向变；竖着走的那段不转身
    piece.replaceChildren(sprite(heroId, 'run', tall())); const anim = piece.animate(kf, { duration: ms, fill: 'forwards' });
    await nap(ms); if (id !== moving) return false; walking = 0; put(spot(stand)); anim.cancel(); piece.classList.remove('left'); piece.replaceChildren(sprite(heroId, 'idle', tall())); return true; // 落点按现在的版式再算一次：走的这半秒里窗口可能变过
  }
  function refuse(b) { b.classList.remove('no'); void b.offsetWidth; b.classList.add('no'); if (gated(b.dataset.area) && !opened(progress.data)) { map.classList.remove('need'); void map.offsetWidth; map.classList.add('need'); } } // 去不了：节点抖一下；是城门后面的，还没到手的徽章槽闪两下
  function select(key) { // 让棋子走到这个场地当前的那一关。先换好底下的字和按钮，再演走路
    const d = progress.data; if (!nodes[key] || goal(d, key) < 0) return Promise.resolve(false); if (key === sel && stand === at(d, key)) return Promise.resolve(true);
    const from = stand; sel = key; stand = at(d, key); seq++; paint(d, sel); info(d, sel); dress(d, sel); return walk(route(from, stand));
  }

  // ---------- 打赢一关回来：节点翻成已过关 → 徽章飞进城门上的槽 → 集齐了城门打开 → 棋子走到下一个节点。点一下或按任意键直接跳到结果 ----------
  function won(before, key) { pending = { before, key }; }
  function stage(p) { paint(p.before, p.key); dress(p.before, p.key); stand = at(p.before, p.key); put(spot(stand)); } // 先摆回打赢之前的样子
  async function arrive() {
    const p = pending; pending = null; if (!p || root.hidden) return; const { before, key } = p, d = progress.data, was = stand, me = ++seq, live = () => me === seq;
    const skip = e => { if (e.type === 'keydown') { if (/^(Shift|Control|Alt|Meta|Tab)$/.test(e.key)) return; e.preventDefault(); e.stopImmediatePropagation(); } off(); draw(); }, // 跳过用的那一下按键不再往下传：不然回车会直接开打下一关
      off = () => { removeEventListener('pointerdown', skip, true); removeEventListener('keydown', skip, true); };
    addEventListener('pointerdown', skip, true); addEventListener('keydown', skip, true);
    await nap(200); if (!live()) return off();
    was.dataset.state = 'done'; was.toggleAttribute('data-got', !!was.dataset.boss && d.owned.includes(was.dataset.boss)); was.classList.add('pop'); setTimeout(() => was.classList.remove('pop'), 300);
    if (d.done[key] && !before.done[key] && slots[key]) { await nap(250); if (!live()) return off(); // 新到手一枚徽章
      const a = center(was), b = center(slots[key]), fly = el('i', `badge on fly ${key}`); map.append(fly);
      fly.animate(calm() ? [{ translate: `${b[0]}px ${b[1]}px`, opacity: 0 }, { translate: `${b[0]}px ${b[1]}px`, opacity: 1 }] : [{ translate: `${a[0]}px ${a[1] - 24}px`, scale: 2 }, { translate: `${b[0]}px ${b[1]}px`, scale: 1 }], { duration: calm() ? 120 : 450, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards' });
      await nap(calm() ? 120 : 450); if (!live()) return off(); fly.remove(); slots[key].classList.add('on');
      if (opened(d)) { await nap(150); if (!live()) return off(); map.classList.add('swing', 'open'); await nap(400); if (!live()) return off(); } } // swing：只有这一刻门板是动着缩回去的，平时打开地图门就是开好的
    await nap(150); if (!live()) return off();
    paint(d, sel); dress(d, sel); stand = at(d, sel); await walk(route(was, stand)); off(); if (live()) draw(); // sel 在 show() 里已经换成了下一个该去的场地
  }

  // ---------- 操作：点节点、方向键换路、回车出战 ----------
  map.addEventListener('click', e => { const b = e.target.closest('.node'); if (!b) return; if (b.getAttribute('aria-disabled') === 'true') return refuse(b); select(b.dataset.area); });
  pick.onchange = () => { choose(+pick.value); dress(progress.data, sel); };
  quit.onclick = () => { if (quit.dataset.sure) { progress.quit(sel); return draw(); } quit.dataset.sure = 1; quit.textContent = '再点确认'; setTimeout(() => { if (quit.dataset.sure) { delete quit.dataset.sure; quit.textContent = '退出场地'; } }, 2000); }; // 退出会清掉这条路的进度：两秒内点两下才生效
  const battle = () => { if (!sel || root.hidden) return false; if (!progress.data.runs[sel]) progress.enter(sel, decks()[chosen()]); fight(sel); return true; }; // 卡组在这一刻锁定
  go.onclick = battle;
  addEventListener('keydown', e => { if (root.hidden || host.hidden || e.repeat || e.metaKey || e.ctrlKey || e.altKey || /^(SELECT|INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
    const step = { ArrowUp: -1, ArrowLeft: -1, ArrowDown: 1, ArrowRight: 1 }[e.key];
    if (step) { const ks = AREAS.map(a => a.key).filter(k => goal(progress.data, k) >= 0); e.preventDefault(); select(ks[(ks.indexOf(sel) + step + ks.length) % ks.length]); stand.focus({ preventScroll: true }); }
    else if (e.key === 'Enter' && (e.target === document.body || e.target.closest('.node'))) { e.preventDefault(); battle(); } });
  new ResizeObserver(() => { if (root.hidden || !stand) return; const n = size; resize(); if (n !== size) { heroId = ''; dress(progress.data, sel); } if (!walking) put(spot(stand)); }).observe(map); // 窗口变了，棋子跟着节点挪

  return {
    show() { root.hidden = false; sel = pickArea(progress.data, sel); draw(); if (pending) stage(pending); },
    hide() { root.hidden = true; },
    won, arrive, battle,
    say(t) { tipEl.textContent = t; }, // 临时在打法那一行说一句话（比如没载入成功）；下次重画就换回去
    go: (key, i) => !root.hidden && (i === undefined || i === goal(progress.data, key)) ? select(key) : Promise.resolve(false), // 让棋子走到某个节点（不写第几关就是这个场地当前那一关）；去不了返回 false
    // 给自动测试和智能体看的地图状态，不用靠截图猜
    state() { const d = progress.data; return { at: sel && { area: sel, stage: goal(d, sel) }, deck: sel ? deckOf(d, sel).name : null, piece: heroId, gate: opened(d) ? 'open' : 'shut', badges: BADGES.filter(k => d.done[k]),
      nodes: [...map.querySelectorAll('.node')].map(b => ({ area: b.dataset.area, stage: +b.dataset.stage, state: b.dataset.state, boss: b.dataset.boss || null, got: b.hasAttribute('data-got'), open: b.getAttribute('aria-disabled') === 'false' })) }; },
  };
}
