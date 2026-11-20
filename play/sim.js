// 一步翻盘：确定性战斗模拟。没有随机数，同样的开局永远打出同样的结果，
// 所以“倒放后只改一处再打一遍”才有意义。只用 + - * / 和 sqrt，保证各处算出来一致。
export const TPS = 30;
export const W = 720, H = 405;
const COLX = [80, 150, 220], ROWY = [225, 285, 345];
const MAX_TICKS = 60 * TPS, TAIL = 55;
const NEAR = 110; // 新角色：“身边”统一按一圈 110 算，和圣骑士套盾的范围一致（开场时正好是相邻八格）

// cell = 列*3 + 行；列 0 是后排，列 2 是前排
export function cellPos(side, cell) {
  const x = COLX[Math.floor(cell / 3)];
  return { x: side === 0 ? x : W - x, y: ROWY[cell % 3] };
}

export const TYPES = {
  brome:   { name: '圣骑士',   hp: 560, atk: 20, range: 50,  speed: 1.5, atkT: 30, skill: 'shield',
             desc: '血厚。法力满时给身边友军套护盾' },
  general: { name: '火镰客',   hp: 250, atk: 44, range: 50,  speed: 2.3, atkT: 22,
             desc: '出手快、伤害高，但很脆。没有技能' },
  noshrak: { name: '雷枪手',   hp: 300, atk: 32, range: 105, speed: 1.7, atkT: 32, pierce: true,
             desc: '枪长，一枪能捅到目标旁边的敌人' },
  north:   { name: '冰翼法师', hp: 190, atk: 24, range: 250, speed: 1.4, atkT: 34, skill: 'ice', ranged: true,
             desc: '远程。法力满时放冰爆，冻住一片敌人' },
  maehv:   { name: '深渊女巫', hp: 220, atk: 28, range: 240, speed: 1.4, atkT: 34, skill: 'dark', ranged: true,
             desc: '远程。法力满时放暗爆，炸一片' },
  bronto:  { name: '巨龙兽',   hp: 620, atk: 30, range: 52,  speed: 1.0, atkT: 40, boom: true,
             desc: '又慢又肉。死的时候会爆炸，敌我都炸' },
  trinity: { name: '三翼龙',   hp: 230, atk: 36, range: 50,  speed: 2.8, atkT: 24, far: true,
             desc: '飞得快，专门扑向离它最远的人' },
  tyrant:  { name: '天陨暴君', hp: 680, atk: 46, range: 54,  speed: 1.3, atkT: 34, cleave: true,
             desc: '首领。每一击都会波及目标旁边的人' },
  // 第二批（2026-11-17 合并）：每人一条和站位有关的新规则，数值都落在第一批的范围内
  warden:   { name: '铁壁卫士', hp: 520, atk: 22, range: 50,  speed: 1.5, atkT: 32, guard: true,
              desc: '替站在它正后方一格的队友挡下一半伤害' },
  lancer:   { name: '破阵骑士', hp: 330, atk: 34, range: 60,  speed: 2.5, atkT: 28, lane: true,
              desc: '只沿自己这一行冲，先打同一行的敌人' },
  grapple:  { name: '钩锁手',   hp: 380, atk: 30, range: 56,  speed: 1.4, atkT: 32, skill: 'hook',
              desc: '法力满时甩出钩锁，把离它最远的敌人拽到面前' },
  maul:     { name: '重锤手',   hp: 440, atk: 24, range: 52,  speed: 1.6, atkT: 36, knock: 45,
              desc: '每一锤都把目标砸退一大步' },
  ballista: { name: '穿云弓手', hp: 200, atk: 26, range: 245, speed: 1.3, atkT: 38, line: true, ranged: true,
              desc: '远程。箭会射穿，一条直线上的敌人全中' },
  ronin:    { name: '独行剑客', hp: 270, atk: 23, range: 50,  speed: 2.2, atkT: 24, lone: true,
              desc: '身边没有队友时，伤害加倍' },
  colossus: { name: '镇关巨像', hp: 600, atk: 20, range: 50,  speed: 1.2, atkT: 36, taunt: true,
              desc: '走到它身边的敌人只能打它' },
  martyr:   { name: '殉道祭司', hp: 240, atk: 22, range: 105, speed: 1.6, atkT: 30, mend: true,
              desc: '倒下时给身边的队友回一大口血' },
};

export const ITEMS = {
  sword:  { name: '利刃',   desc: '攻击力 +35%' },
  potion: { name: '血瓶',   desc: '生命 +120' },
  gem:    { name: '蓝宝石', desc: '开场法力全满，第一下就放技能' },
};

// 一步改动：{kind:'move', unit, cell}（目标格有人就互换）或 {kind:'equip', unit, item}
export function applyChange(level, ch) {
  const player = level.player.map(u => ({ ...u }));
  if (ch && ch.kind === 'move') {
    const other = player.find(u => u.cell === ch.cell);
    if (other) other.cell = player[ch.unit].cell;
    player[ch.unit].cell = ch.cell;
  } else if (ch && ch.kind === 'equip') {
    player[ch.unit].item = ch.item;
  }
  return { ...level, player };
}

export function allChanges(level) {
  const out = [];
  level.player.forEach((u, i) => {
    for (let c = 0; c < 9; c++) {
      if (c === u.cell) continue;
      const j = level.player.findIndex(o => o.cell === c);
      if (j >= 0 && j < i) continue; // 互换只算一次
      out.push({ kind: 'move', unit: i, cell: c });
    }
    for (const item of Object.keys(ITEMS)) out.push({ kind: 'equip', unit: i, item });
  });
  return out;
}

export function simulate(level) {
  const es = level.enemyScale || 1;
  const units = [];
  const mk = (u, side) => {
    const T = TYPES[u.type], p = cellPos(side, u.cell), k = side === 1 ? es : 1;
    let hp = Math.round(T.hp * k), atk = T.atk * k, mana = 0;
    if (u.item === 'sword') atk *= 1.35;
    if (u.item === 'potion') hp += 120;
    if (u.item === 'gem') mana = 100;
    // 内部用以场地中线为零点的 x：左右两边的坐标互为相反数，浮点运算才能严格对称
    units.push({ id: units.length, side, type: u.type, T, item: u.item || null, x: p.x - W / 2, y: p.y, hp, maxhp: hp, atk,
      mana, sh: 0, state: 'idle', st: 0, frozen: 0, dir: side === 0 ? 1 : -1, alive: true, deadT: -1, hitT: -99,
      tgt: null, casting: false, hitAt: Math.floor(T.atkT / 2),
      cell: u.cell, row: u.cell % 3, guardian: null }); // 新角色：记下开场的格子和行
  };
  level.player.forEach(u => mk(u, 0));
  level.enemy.forEach(u => mk(u, 1));
  // 新角色·铁壁卫士：开场站在它正后方一格（同一行、靠后一列）的队友，整场由它分担伤害
  for (const g of units) if (g.T.guard) { const w = units.find(o => o.side === g.side && o.cell === g.cell - 3); if (w) w.guardian = g; }

  const events = [], deaths = {}, frames = [];
  let t = 0;
  const dist = (a, b) => { const dx = a.x - b.x, dy = a.y - b.y; return Math.sqrt(dx * dx + dy * dy); };

  const up = o => o.alive || o.deadT === t; // 新角色：这一拍里刚倒下的也算在场，结算先后才不影响结果
  function damage(tgt, n, passed) {
    if (!tgt.alive) return;
    n = Math.round(n);
    const g = tgt.guardian; // 新角色·铁壁卫士：一半伤害转给它；转过来的伤害不再往下转
    if (g && up(g) && !passed) { const half = Math.round(n / 2); n -= half; damage(g, half, true); }
    const ab = Math.min(tgt.sh, n); tgt.sh -= ab;
    tgt.hp -= n - ab; tgt.hitT = t;
    if (tgt.T.skill) tgt.mana = Math.min(100, tgt.mana + 8);
    events.push({ t, type: 'dmg', x: tgt.x, y: tgt.y, n, side: tgt.side });
    if (tgt.hp <= 0) {
      tgt.hp = 0; tgt.alive = false; tgt.deadT = t; deaths[tgt.id] = t;
      if (tgt.T.boom) {
        events.push({ t, type: 'boom', x: tgt.x, y: tgt.y });
        for (const o of units) if (o.alive && dist(o, tgt) <= 100) damage(o, 95);
      }
      if (tgt.T.mend) { // 新角色·殉道祭司：倒下时给身边队友回血
        events.push({ t, type: 'mend', x: tgt.x, y: tgt.y, side: tgt.side });
        mends.push({ x: tgt.x, y: tgt.y, side: tgt.side }); // 回血攒到这一拍打完再加
      }
    }
  }
  const foesNear = (u, p, r) => units.filter(o => o.alive && o.side !== u.side && dist(o, p) <= r);

  function hit(u) {
    const tg = u.tgt, p = { x: tg.x, y: tg.y };
    if (u.casting) {
      if (u.T.skill === 'shield') {
        events.push({ t, type: 'shield', x: u.x, y: u.y, side: u.side, who: u.type });
        for (const o of units) if (o.alive && o.side === u.side && dist(o, u) <= 110) o.sh += 90;
      } else if (u.T.skill === 'ice') {
        events.push({ t, type: 'ice', x: p.x, y: p.y, fx: u.x, fy: u.y, side: u.side, who: u.type });
        for (const o of foesNear(u, p, 78)) { o.frozen = 55; damage(o, 55); }
      } else if (u.T.skill === 'dark') {
        events.push({ t, type: 'dark', x: p.x, y: p.y, fx: u.x, fy: u.y, side: u.side, who: u.type });
        for (const o of foesNear(u, p, 66)) damage(o, 75);
      } else if (u.T.skill === 'hook') { // 新角色·钩锁手：把离它最远的敌人拽到面前
        let far = null, fd = -1;
        for (const o of units) if (up(o) && o.side !== u.side) { const d = dist(o, u); if (d > fd) { far = o; fd = d; } }
        if (far) {
          events.push({ t, type: 'hook', x: far.x, y: far.y, fx: u.x, fy: u.y, side: u.side, who: u.type });
          shoves.push({ o: far, x: u.x + u.dir * 40, y: u.y });
        }
      }
      return;
    }
    if (!tg.alive && tg.deadT !== t) return; // 目标早就倒了，这一下打空；同一拍倒下的照样算出手
    events.push({ t, type: u.T.ranged ? 'bolt' : 'hit', x: p.x, y: p.y, fx: u.x, fy: u.y, side: u.side });
    if (u.T.pierce || u.T.cleave) for (const o of foesNear(u, p, 62)) if (o !== tg) damage(o, u.atk * 0.6);
    if (u.T.line) { // 新角色·穿云弓手：从它到目标连一条线，线上和线后面的敌人全中
      const dx = p.x - u.x, dy = p.y - u.y, d = Math.sqrt(dx * dx + dy * dy) || 1, ux = dx / d, uy = dy / d;
      for (const o of units) if (o.alive && o.side !== u.side && o !== tg) {
        const ox = o.x - u.x, oy = o.y - u.y;
        if (ox * ux + oy * uy > 0 && Math.abs(ox * uy - oy * ux) <= 18) damage(o, u.atk);
      }
    }
    // 新角色·独行剑客：身边没有活着的队友时伤害加倍
    const lone = u.T.lone && !units.some(o => up(o) && o !== u && o.side === u.side && dist(o, u) <= NEAR);
    damage(tg, lone ? u.atk * 2 : u.atk);
    if (u.T.knock && tg.alive) shoves.push({ o: tg, dx: u.dir * u.T.knock }); // 新角色·重锤手
    if (u.T.skill) u.mana = Math.min(100, u.mana + 25);
  }

  function pick(u) {
    let best = null, bd = 0;
    // 新角色·破阵骑士：同一行（按开场的行算）还有敌人，就只在这一行里挑
    const lane = u.T.lane && units.some(o => o.alive && o.side !== u.side && o.row === u.row);
    for (const o of units) {
      if (!o.alive || o.side === u.side) continue;
      if (lane && o.row !== u.row) continue;
      const dx = u.x - o.px, dy = u.y - o.py, d = Math.sqrt(dx * dx + dy * dy);
      if (!best || (u.T.far ? d > bd : d < bd)) { best = o; bd = d; }
    }
    return best;
  }
  function taunter(u) { // 新角色·镇关巨像：身边一圈内最近的敌方镇关巨像
    let best = null, bd = 0;
    for (const o of units) {
      if (!o.alive || o.side === u.side || !o.T.taunt) continue;
      const dx = u.x - o.px, dy = u.y - o.py, d = Math.sqrt(dx * dx + dy * dy);
      if (d <= NEAR && (!best || d < bd)) { best = o; bd = d; }
    }
    return best;
  }
  let mends = [], shoves = []; // 新角色：推和拽都攒到这一拍的出手全结算完再挪，保证谁先谁后不影响结果

  let winner = null, endT = -1;
  for (; t < MAX_TICKS + TAIL; t++) {
    frames.push(units.map(u => ({ x: u.x, y: u.y, hp: u.hp, sh: u.sh, mana: u.mana, state: u.state, st: u.st,
      frozen: u.frozen, dir: u.dir, alive: u.alive, deadT: u.deadT, hitT: u.hitT, casting: u.casting })));
    if (winner) { if (t - endT >= TAIL) break; for (const u of units) if (u.alive) { u.state = 'idle'; u.st = 0; } continue; }

    // 两边同时行动：大家都按这一拍开始时的位置做决定，出手攒到最后一起结算，谁也不占先手
    for (const u of units) { u.px = u.x; u.py = u.y; }
    const pending = [];
    for (const u of units) {
      if (!u.alive) continue;
      if (u.frozen > 0) { u.frozen--; continue; }
      if (u.state === 'attack') {
        u.st++;
        if (u.st === u.hitAt) pending.push(u);
        if (u.st >= u.T.atkT) { u.state = 'idle'; u.st = 0; u.casting = false; }
        continue;
      }
      const tn = taunter(u); if (tn) u.tgt = tn; // 新角色·镇关巨像：进了圈就只能打它（出手到一半的那一下不打断）
      if (!u.tgt || !u.tgt.alive) u.tgt = pick(u);
      if (!u.tgt) { u.state = 'idle'; continue; }
      const dx = u.tgt.px - u.x, dy = u.tgt.py - u.y, d = Math.sqrt(dx * dx + dy * dy);
      if (dx !== 0) u.dir = dx > 0 ? 1 : -1;
      if (d <= u.T.range) {
        u.state = 'attack'; u.st = 0;
        u.casting = !!u.T.skill && u.mana >= 100;
        if (u.casting) u.mana = 0;
      } else {
        u.state = 'run'; u.st++;
        u.x += dx / d * u.T.speed; u.y += dy / d * u.T.speed;
      }
    }
    const isShield = u => u.casting && u.T.skill === 'shield';
    for (const u of pending) if (isShield(u)) hit(u); // 护盾先套上，再结算伤害
    for (const u of pending) if (!isShield(u)) hit(u);
    for (const m of mends) for (const o of units) // 新角色·殉道祭司：这一拍打完还活着的身边队友回血
      if (o.alive && o.side === m.side && dist(o, m) <= NEAR) o.hp = Math.min(o.maxhp, o.hp + 130);
    mends = [];
    for (const s of shoves) if (s.o.alive) { // 新角色：结算推和拽，不出场地
      if (s.dx) s.o.x += s.dx; else { s.o.x = s.x; s.o.y = s.y; }
      s.o.x = Math.max(-W / 2 + 20, Math.min(W / 2 - 20, s.o.x));
    }
    shoves = [];
    // 同一边的人别叠在一起
    for (let i = 0; i < units.length; i++) for (let j = i + 1; j < units.length; j++) {
      const a = units[i], b = units[j];
      if (!a.alive || !b.alive || a.side !== b.side) continue;
      if (Math.abs(a.x - b.x) < 26 && Math.abs(a.y - b.y) < 18) {
        const up = a.y <= b.y ? a : b, dn = up === a ? b : a;
        if (up.y > 205) up.y -= 1;
        if (dn.y < 375) dn.y += 1;
      }
    }
    const pa = units.some(u => u.alive && u.side === 0), ea = units.some(u => u.alive && u.side === 1);
    if (!pa && !ea) winner = 'draw'; else if (!pa) winner = 'enemy'; else if (!ea) winner = 'player'; else if (t >= MAX_TICKS - 1) winner = 'draw'; // 同归于尽和超时都算平局
    if (winner) endT = t;
  }
  for (const f of frames) for (const u of f) u.x += W / 2;
  for (const e of events) { e.x += W / 2; if (e.fx !== undefined) e.fx += W / 2; }
  const left = side => units.filter(u => u.side === side).reduce((s, u) => s + u.hp, 0) /
                       (units.filter(u => u.side === side).reduce((s, u) => s + u.maxhp, 0) || 1);
  const hpLeft = [left(0), left(1)], enemyHpLeft = hpLeft[1];
  return { frames, events, deaths, winner, endT, enemyHpLeft, hpLeft,
    meta: units.map(u => ({ id: u.id, side: u.side, type: u.type, item: u.item, maxhp: u.maxhp })) };
}
