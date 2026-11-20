// 一步翻盘：画面。只负责把某一场战斗的某一帧画出来，解谜页和对战页共用。
// 战斗结果全部来自 sim.js，所以倒放就是把帧号往回走，不需要额外逻辑。
import { TYPES, ITEMS, W, H } from './sim.js?v=112a67f0';

// 每个角色的帧格边长、脚底在格内的 y（量出来的）
export const GFX = {
  brome:   { file: 'f1_bromemk2', cell: 130, feet: 115 },
  general: { file: 'f2_tier2general', cell: 134, feet: 118 },
  noshrak: { file: 'f3_grandmasternoshrak', cell: 130, feet: 111 },
  north:   { file: 'f6_greatwhitenorth', cell: 120, feet: 105 },
  maehv:   { file: 'f4_maehvmk2', cell: 130, feet: 114 },
  bronto:  { file: 'f5_megabrontodon', cell: 130, feet: 114 },
  trinity: { file: 'neutral_trinitywing', cell: 100, feet: 84 },
  tyrant:  { file: 'boss_skyfalltyrant', cell: 100, feet: 84, scale: 1.5 },
  // 第二批是普通兵种的图，比第一批矮，放大后身高相当；h 是量出来的站立身高，血条按它定位
  warden:   { file: 'neutral_primusshieldmaster', cell: 80,  feet: 64,  scale: 1.5, h: 46 },
  lancer:   { file: 'f1_sunforgelancer',          cell: 100, feet: 84,  scale: 1.5, h: 41 },
  grapple:  { file: 'neutral_syvrel',             cell: 100, feet: 84,  scale: 1.5, h: 39 },
  maul:     { file: 'neutral_goldenhammer',       cell: 130, feet: 114, scale: 1.25, h: 54 },
  ballista: { file: 'f1_backlinearcher',          cell: 120, feet: 104, scale: 1.5, h: 40 },
  ronin:    { file: 'f6_freeblade',               cell: 100, feet: 84,  scale: 1.5, h: 40 },
  colossus: { file: 'f1_ironcliffeguardian',      cell: 80,  feet: 64,  scale: 1.5, h: 46 },
  martyr:   { file: 'neutral_healingmystic',      cell: 110, feet: 93,  scale: 1.25, h: 56 },
};
const ANIMS = ['idle', 'run', 'attack', 'hit', 'death'];
// 特效：用哪张爆炸图、每帧宽高、帧数、每帧停几拍、锚点、放大、调色
const FXDEF = {
  hit:  { sheet: 'g', fw: 48,  fh: 48,  n: 7,  tpf: 2, scale: 1 },
  bolt: { sheet: 'b', fw: 64,  fh: 64,  n: 8,  tpf: 2, scale: 0.8 },
  boom: { sheet: 'd', fw: 128, fh: 128, n: 12, tpf: 3, scale: 1.6, ground: true },
  ice:  { sheet: 'c', fw: 128, fh: 80,  n: 10, tpf: 3, scale: 1.25, ground: true, filter: 'hue-rotate(175deg) saturate(1.5) brightness(1.25)' },
  dark: { sheet: 'd', fw: 128, fh: 128, n: 12, tpf: 3, scale: 1.1, ground: true, filter: 'hue-rotate(250deg) saturate(1.4)' },
};
const LIGHT = { // 颜色、半径、亮度、持续拍数、震屏幅度
  boom: ['255,170,80', 280, 1.3, 34, 7], dark: ['190,90,255', 190, 1.1, 30, 4], ice: ['110,220,255', 210, 1.1, 30, 4],
  bolt: ['200,220,255', 60, 0.7, 8, 0], hit: ['255,220,160', 46, 0.6, 6, 0], shield: ['255,230,140', 170, 0.9, 22, 0],
  mend: ['140,255,170', 170, 0.9, 26, 0], hook: ['255,210,120', 70, 0.7, 10, 2],
};

const img = src => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
export const IMG = {};
let cv, ctx, bg, tmp, light;
export async function load(canvas) {
  cv = canvas; ctx = cv.getContext('2d'); ctx.imageSmoothingEnabled = false;
  const jobs = [];
  for (const [k, g] of Object.entries(GFX)) for (const a of ANIMS)
    jobs.push(img(`assets/units/${g.file}_${a}.png`).then(i => { IMG[k + '_' + a] = i; }));
  for (const s of 'bcdg') jobs.push(img(`assets/fx/${s}.png`).then(i => { IMG['fx_' + s] = i; }));
  for (const k of Object.keys(ITEMS)) jobs.push(img(`assets/icons/${k}.png`).then(i => { IMG['icon_' + k] = i; }));
  await Promise.all(jobs);
  bg = makeBg();
  tmp = document.createElement('canvas'); tmp.width = tmp.height = 140;
  light = document.createElement('canvas'); light.width = W; light.height = H;
}

// ---------- 背景：程序画的月下隘口 ----------
const BGM = 20; // 四周多画一圈，震屏时不露边
function makeBg() {
  const c = document.createElement('canvas'); c.width = W + BGM * 2; c.height = H + BGM * 2;
  const g = c.getContext('2d'); let s = 7;
  const r = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const hz = 190 + BGM;
  let gr = g.createLinearGradient(0, 0, 0, hz);
  gr.addColorStop(0, '#07061a'); gr.addColorStop(.6, '#1d1438'); gr.addColorStop(1, '#43285a');
  g.fillStyle = gr; g.fillRect(0, 0, c.width, hz);
  for (let i = 0; i < 110; i++) { g.fillStyle = `rgba(255,255,255,${.2 + r() * .7})`; g.fillRect(Math.floor(r() * c.width), Math.floor(r() * (hz - 40)), 1, 1); }
  gr = g.createRadialGradient(580, 80, 0, 580, 80, 90);
  gr.addColorStop(0, 'rgba(220,210,255,.5)'); gr.addColorStop(1, 'rgba(220,210,255,0)');
  g.fillStyle = gr; g.fillRect(480, 0, 200, 180);
  g.fillStyle = '#ece6ff'; g.beginPath(); g.arc(580, 80, 20, 0, 7); g.fill();
  g.fillStyle = '#cfc6ee'; g.fillRect(572, 72, 5, 4); g.fillRect(585, 84, 6, 5); g.fillRect(578, 90, 3, 3);
  for (const [col, base, amp, step] of [['#1b1536', 46, 34, 10], ['#110d25', 20, 22, 6]]) {
    g.fillStyle = col; g.beginPath(); g.moveTo(0, hz);
    let h = base;
    for (let x = 0; x <= c.width; x += step) { h += (r() - .5) * amp * .6; h = Math.max(base * .4, Math.min(base + amp, h)); g.lineTo(x, hz - Math.round(h)); }
    g.lineTo(c.width, hz); g.fill();
  }
  gr = g.createLinearGradient(0, hz, 0, c.height);
  gr.addColorStop(0, '#3a3152'); gr.addColorStop(.25, '#2a2540'); gr.addColorStop(1, '#14121e');
  g.fillStyle = gr; g.fillRect(0, hz, c.width, c.height - hz);
  for (let i = 0; i < 1400; i++) {
    g.fillStyle = r() < .5 ? `rgba(255,255,255,${.02 + r() * .05})` : `rgba(0,0,0,${.08 + r() * .14})`;
    g.fillRect(Math.floor(r() * c.width), hz + Math.floor(r() * (c.height - hz)), 1 + Math.floor(r() * 3), 1);
  }
  g.fillStyle = 'rgba(255,255,255,.035)';
  for (const y of [225, 285, 345]) g.fillRect(0, y + BGM + 10, c.width, 1);
  return c;
}

// ---------- 画一帧 ----------
function unitFrame(type, f, t) {
  const T = TYPES[type], n = a => IMG[type + '_' + a].width / GFX[type].cell;
  if (!f.alive) {
    const k = Math.floor((t - f.deadT) / 2.4), c = n('death');
    return { anim: 'death', idx: Math.min(c - 1, k), alpha: Math.max(0, Math.min(1, 1 - (k - c) / 8)) };
  }
  if (f.frozen > 0) return { anim: 'idle', idx: 0, alpha: 1, tint: 'rgba(120,200,255,.55)' };
  const flash = t - f.hitT >= 0 && t - f.hitT <= 2 ? 'rgba(255,255,255,.6)' : null;
  if (f.state === 'attack') return { anim: 'attack', idx: Math.min(n('attack') - 1, Math.floor(f.st / T.atkT * n('attack'))), alpha: 1, tint: flash };
  if (f.state === 'run') return { anim: 'run', idx: Math.floor(t / 2.4) % n('run'), alpha: 1, tint: flash };
  if (t - f.hitT >= 0 && t - f.hitT < 7) return { anim: 'hit', idx: Math.min(2, Math.floor((t - f.hitT) / 2.4)), alpha: 1, tint: flash };
  return { anim: 'idle', idx: Math.floor(t / 2.4) % n('idle'), alpha: 1 };
}

function drawUnit(type, f, t, x, y, ghost) {
  const g = GFX[type], sc = g.scale || 1, a = unitFrame(type, f, t);
  if (a.alpha <= 0) return;
  const tc = tmp.getContext('2d');
  tc.globalCompositeOperation = 'source-over'; tc.clearRect(0, 0, g.cell, g.cell);
  tc.drawImage(IMG[type + '_' + a.anim], a.idx * g.cell, 0, g.cell, g.cell, 0, 0, g.cell, g.cell);
  if (a.tint) { tc.globalCompositeOperation = 'source-atop'; tc.fillStyle = a.tint; tc.fillRect(0, 0, g.cell, g.cell); }
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y)); ctx.scale(f.dir * sc, sc);
  ctx.globalAlpha = a.alpha * (ghost ? .75 : 1);
  ctx.drawImage(tmp, 0, 0, g.cell, g.cell, -g.cell / 2, -g.feet, g.cell, g.cell);
  ctx.restore();
}

// v：这一帧之外要画的东西。cells 站位圈 [{x,y,hot,label}]，lines 虚线 [[a,b]]，drag 正在拖的人 {unit,x,y}，
// extras 不在战斗里的人（替补）[{type,x,y,dir,item,side,ghost}]，ghost 上一场我方倒下的时刻，bright 布阵时调亮，rewind 倒放
export function draw(run, t, v = {}) {
  const fr = run.frames[t], drag = v.drag, extras = v.extras || [];
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; ctx.filter = 'none';

  // 当前在场的特效，顺便算震屏
  const live = []; let amp = 0;
  for (const e of run.events) {
    const age = t - e.t; if (age < 0 || age >= 40) continue;
    live.push([e, age]);
    const L = LIGHT[e.type]; if (L && L[4] && age < 14) amp = Math.max(amp, L[4] * (1 - age / 14));
  }
  const sx = Math.round(Math.sin(t * 12.9898) * amp), sy = Math.round(Math.cos(t * 78.233) * amp);
  ctx.drawImage(bg, sx - BGM, sy - BGM);
  ctx.save(); ctx.translate(sx, sy);

  ctx.font = '10px sans-serif'; ctx.textAlign = 'center';
  for (const c of v.cells || []) {
    ctx.strokeStyle = c.hot ? 'rgba(255,210,90,.95)' : 'rgba(255,255,255,.22)'; ctx.lineWidth = c.hot ? 2 : 1;
    ctx.beginPath(); ctx.ellipse(c.x, c.y, 24, 8, 0, 0, 7); ctx.stroke();
    if (c.label) { ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.fillText(c.label, c.x, c.y + 22); }
  }
  ctx.strokeStyle = 'rgba(255,210,90,.8)'; ctx.setLineDash([4, 3]); ctx.lineWidth = 1;
  for (const [a, b] of v.lines || []) { ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
  ctx.setLineDash([]);
  const order = run.meta.map((m, i) => i).sort((a, b) => fr[a].y - fr[b].y);
  const at = i => drag && drag.unit === i ? drag : fr[i];
  ctx.fillStyle = 'rgba(0,0,0,.4)';
  for (const i of order) if (fr[i].alive) { const p = at(i), sc = GFX[run.meta[i].type].scale || 1; ctx.beginPath(); ctx.ellipse(p.x, p.y, 20 * sc, 5 * sc, 0, 0, 7); ctx.fill(); }
  for (const x of extras) { ctx.beginPath(); ctx.ellipse(x.x, x.y, 20, 5, 0, 0, 7); ctx.fill(); }
  for (const i of order) { const p = at(i); drawUnit(run.meta[i].type, fr[i], t, p.x, p.y, drag && drag.unit === i); }
  for (const x of extras) {
    drawUnit(x.type, { alive: true, state: 'idle', st: 0, frozen: 0, hitT: -99, dir: x.dir }, t, x.x, x.y, x.ghost);
    if (x.item) ctx.drawImage(IMG['icon_' + x.item], Math.round(x.x) + 18, Math.round(x.y) - 82, 16, 16);
  }

  // 光照：先整体压暗，再把角色身边和爆炸处照亮
  const lc = light.getContext('2d');
  lc.globalCompositeOperation = 'source-over'; lc.fillStyle = v.bright ? 'rgb(150,150,185)' : 'rgb(108,106,150)'; lc.fillRect(0, 0, W, H);
  lc.globalCompositeOperation = 'lighter';
  const glow = (c2, x, y, r, col, a) => { const gr = c2.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(${col},${a})`); gr.addColorStop(1, `rgba(${col},0)`); c2.fillStyle = gr; c2.fillRect(x - r, y - r, r * 2, r * 2); };
  fr.forEach((f, i) => { if (f.alive) glow(lc, f.x, f.y - 30, 85, run.meta[i].side ? '120,90,170' : '170,140,90', .6); });
  for (const x of extras) glow(lc, x.x, x.y - 30, 85, x.side ? '120,90,170' : '170,140,90', .6);
  for (const [e, age] of live) { const L = LIGHT[e.type]; if (L && age < L[3]) glow(lc, e.x, e.y - 30, L[1], L[0], L[2] * (1 - age / L[3])); }
  ctx.globalCompositeOperation = 'multiply'; ctx.drawImage(light, -sx, -sy);
  ctx.globalCompositeOperation = 'source-over';

  // 特效本体不受压暗影响
  for (const [e, age] of live) {
    if ((e.type === 'bolt' && age < 5) || ((e.type === 'ice' || e.type === 'dark' || e.type === 'hook') && age < 7)) {
      const col = e.type === 'ice' ? '#8fe8ff' : e.type === 'dark' ? '#c88bff' : e.type === 'hook' ? '#ffd27a' : e.side ? '#d9a8ff' : '#a8f0ff';
      ctx.strokeStyle = col; ctx.lineWidth = e.type === 'bolt' ? 2 : 4; ctx.globalAlpha = 1 - age / 7;
      ctx.beginPath(); ctx.moveTo(e.fx, e.fy - 38); ctx.lineTo(e.x, e.y - 30); ctx.stroke();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke(); ctx.globalAlpha = 1;
    }
    if ((e.type === 'shield' || e.type === 'mend') && age < 22) {
      ctx.strokeStyle = `rgba(${e.type === 'mend' ? '140,255,170' : '255,230,140'},${1 - age / 22})`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(e.x, e.y, 20 + age * 4.5, (20 + age * 4.5) * .42, 0, 0, 7); ctx.stroke();
    }
    const d = FXDEF[e.type]; if (!d) continue;
    const k = Math.floor(age / d.tpf); if (k >= d.n) continue;
    const w = d.fw * d.scale, h = d.fh * d.scale;
    if (d.filter) ctx.filter = d.filter;
    ctx.drawImage(IMG['fx_' + d.sheet], k * d.fw, 0, d.fw, d.fh, Math.round(e.x - w / 2), Math.round(d.ground ? e.y + 14 - h : e.y - 30 - h / 2), w, h);
    ctx.filter = 'none';
  }
  ctx.globalCompositeOperation = 'lighter';
  for (const [e, age] of live) { const L = LIGHT[e.type]; if (L && L[4] && age < L[3]) glow(ctx, e.x, e.y - 30, L[1] * .8, L[0], .4 * (1 - age / L[3])); }
  ctx.globalCompositeOperation = 'source-over';

  // 血条、护盾、法力、装备
  fr.forEach((f, i) => {
    if (!f.alive) return;
    const m = run.meta[i], T = TYPES[m.type], p = at(i), sc = GFX[m.type].scale || 1;
    const bx = Math.round(p.x) - 15, by = Math.round(p.y - (GFX[m.type].h ? GFX[m.type].h + 8 : 76) * sc);
    ctx.fillStyle = '#000'; ctx.fillRect(bx - 1, by - 1, 32, T.skill ? 8 : 5);
    ctx.fillStyle = m.side ? '#ff6b6b' : '#6fdc8a'; ctx.fillRect(bx, by, Math.ceil(30 * f.hp / m.maxhp), 3);
    if (f.sh > 0) { ctx.fillStyle = '#ffe58a'; ctx.fillRect(bx, by, Math.min(30, Math.ceil(30 * f.sh / m.maxhp)), 1); }
    if (T.skill) { ctx.fillStyle = f.mana >= 100 ? (t % 6 < 3 ? '#fff' : '#9fd0ff') : '#4f8dff'; ctx.fillRect(bx, by + 4, Math.ceil(30 * f.mana / 100), 2); }
    if (m.item) ctx.drawImage(IMG['icon_' + m.item], bx + 33, by - 6, 16, 16);
    if (v.hover === i && !drag) { ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(p.x, p.y, 24 * sc, 8 * sc, 0, 0, 7); ctx.stroke(); }
  });
  // 伤害数字
  ctx.font = 'bold 9px monospace'; ctx.textAlign = 'center';
  for (const [e, age] of live) {
    if (e.type !== 'dmg' || age >= 18) continue;
    ctx.globalAlpha = 1 - age / 18;
    const x = Math.round(e.x + (e.t * 7 + e.n) % 13 - 6), y = Math.round(e.y - 82 - age * .9);
    ctx.fillStyle = '#000'; ctx.fillText(e.n, x + 1, y + 1);
    ctx.fillStyle = e.side ? '#ffe9a8' : '#ff9a9a'; ctx.fillText(e.n, x, y);
  }
  ctx.globalAlpha = 1; ctx.restore();

  // 时间线：只标已经发生的阵亡，不剧透
  const tw = W - 20, end = Math.max(1, run.endT);
  ctx.fillStyle = 'rgba(255,255,255,.14)'; ctx.fillRect(10, H - 6, tw, 2);
  ctx.fillStyle = v.rewind ? '#bcd0ff' : '#ffd25a'; ctx.fillRect(10, H - 6, Math.round(tw * Math.min(1, t / end)), 2);
  for (const [id, dt] of Object.entries(run.deaths)) if (dt <= t) { ctx.fillStyle = run.meta[id].side ? '#ffd25a' : '#ff6b6b'; ctx.fillRect(10 + Math.round(tw * dt / end) - 1, H - 10, 3, 6); }
  // 上一场我方每个人倒下的时刻，空心标记：一眼看出这次谁活过了上次的自己
  ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 1;
  for (const dt of v.ghost || []) ctx.strokeRect(10 + Math.round(tw * Math.min(1, dt / end)) - 1.5, H - 13.5, 3, 4);
  if (v.rewind) { ctx.fillStyle = 'rgba(120,150,255,.10)'; ctx.fillRect(0, 0, W, H); ctx.fillStyle = 'rgba(255,255,255,.07)'; for (let y = (t * 3) % 6; y < H; y += 6) ctx.fillRect(0, y, W, 1); }
}


// ---------- 给交互用的小工具 ----------
export const stagePt = e => { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H }; };
export function unitAt(run, t, p, side) { // side 不传就两边都找
  let best = -1, bd = 1e9;
  run.frames[t].forEach((f, i) => {
    if (!f.alive || (side !== undefined && run.meta[i].side !== side)) return;
    const sc = GFX[run.meta[i].type].scale || 1, dx = p.x - f.x, dy = p.y - (f.y - 32 * sc), d = Math.sqrt(dx * dx + dy * dy);
    if (d < 36 * sc && d < bd) { bd = d; best = i; }
  });
  return best;
}
export function thumb(type) { // 阵容卡片上的小头像
  const g = GFX[type], c = document.createElement('canvas'); c.width = c.height = 70;
  c.getContext('2d').drawImage(IMG[type + '_idle'], g.cell / 2 - 35, g.feet - 66, 70, 70, 0, 0, 70, 70);
  return c;
}
export function showTip(el, e, html) { // 鼠标停在角色上的说明
  if (!html) { el.style.display = 'none'; return; }
  const r = cv.getBoundingClientRect();
  el.innerHTML = html; el.style.display = 'block';
  el.style.left = Math.min(r.width - 240, Math.max(0, e.clientX - r.left + 14)) + 'px';
  el.style.top = Math.max(0, e.clientY - r.top - 70) + 'px';
}
