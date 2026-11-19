// 下棋场景。做法照《八方旅人》的 HD-2D（长焦压平的横版舞台、方块和像素画板、移轴虚化），
// 画风照我们自己的角色：每个阵营的角色图都量过颜色（design/scenes/palette.py），场景只用量出来的那几条色阶；每块东西有墨线和三四级色阶，过渡用抖点，不用渐变，不撒随机碎点；
// 光只负责投影和一点明暗，不改颜色（不做色调映射，角色按原图颜色显示）。
// 横版：左边是你的城堡，右边是电脑的城堡，中间从左到右 ROWS 格、前后 COLS 条路。贴图全部由代码生成。
// 七个场地各有一套场景（board.theme(键)）：天空和远景、地面和棋盘镶边、对面那座城堡、道具、飘在空中的东西、主光都不同；棋盘格的底色和双方的队伍色不变。
// 这个文件只管画面：场景、角色的五种动作、出牌时的动画。规则在 chess.js，手牌和回合流程在 chess-ui.js。
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GFX as OLD_GFX } from './render.js';
import { MORE_GFX } from './chess-gfx.js';
import { createPfx, warm, idsFor, KIND, MELEE, MISC, BOSS, AMBIENT } from './board-pfx.js';
import { COLS, ROWS, CARDS } from './chess.js';
export const GFX = { ...OLD_GFX, ...MORE_GFX };

const SHORT = Math.min(innerWidth, innerHeight) <= 540;  // 手机（和样式里“高 540 以内”的断点同一个数）：横过来又宽又矮。载入时定一次；看短边，竖着打开再横过来也算
const LX = SHORT ? 1.5 : 1;                      // 一格左右有多长。手机上拉长一半：屏幕又宽又矮，战场主要往两边长
const LZ = SHORT ? 1.4 : 1.2;                    // 两条路之间的间隔比格子长一点，前后的人才不会互相挡太多；手机上再宽一点，每条路在画面里高一些
const HPY = SHORT ? 1.75 : 2.2;                  // 城堡血量牌挂多高。手机上挂低半格：它上面的东西都要出画，挂低了棋盘才能再大一圈
const tileX = r => (r - (ROWS - 1) / 2) * LX;    // 第 0 行贴着你的城堡（左），最后一行贴着电脑的城堡（右）
const tileZ = c => (c - (COLS - 1) / 2) * LZ;    // 第 0 路最远，最后一路最靠近镜头
const HALF = ROWS * LX / 2, DEPTH = COLS * LZ;
const Q = new URLSearchParams(location.search);
// 试玩用的自定义擂台（arenas/ 目录，一套一个文件夹，各用各的画法和素材）：地址带 ?arena=<名字> 时整局都用它，不再跟着对手阵营换场地
const ARENAS = { c: 'c-zhai', b: 'b-shui', sea: 'shan-gong', forge: 'lu-fang', chapel: 'sheng-tang', sky: 'yun-dao', harvest: 'mai-chang' };
const ARENA = ARENAS[Q.get('arena')] ? `./arenas/${ARENAS[Q.get('arena')]}/arena.js` : null;
const calm = matchMedia('(prefers-reduced-motion: reduce)').matches || Q.has('calm'); // 减少动态效果：跟系统设置走；地址带 ?calm 也算（测试用）
document.documentElement.classList.toggle('calm', calm);                               // motion.css 按这个类降级
let seed = 31; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
const pick = a => a[Math.floor(rnd() * a.length)], ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));

// 调色板：从角色图里量出来的几条色阶，每条从暗到亮 5 级
const P = { ink: '#080818', navy: ['#101828', '#182840', '#203a5c', '#2c5078', '#4070a0'], slate: ['#16223a', '#263656', '#30446a', '#4a6494', '#8aa0c8'],
  cyan: ['#085878', '#007a90', '#00b8c8', '#00f0e8', '#a8fff8'], gold: ['#6a4810', '#b88020', '#d8a818', '#f8e040', '#fff4a0'],
  red: ['#400020', '#880840', '#c82038', '#f84850', '#ffa8a0'], teal: ['#0c3028', '#185848', '#20907a', '#00c098', '#68f0b0'], violet: ['#200828', '#381850', '#682090', '#8a50d8', '#c0a0f0'] };
const TEAM = [{ ramp: P.teal, hex: 0x00c098 }, { ramp: P.red, hex: 0xf84850 }];
// 七个场地各自的色阶：用 design/scenes/palette.py 量各阵营角色图得到的颜色，按 [墨线, 暗, 中, 亮, 最亮] 排。场景里的东西只从这里取色
const F = {
  f1: { stone: ['#2e212d', '#4b3a44', '#705c44', '#9c8258', '#d19c60'], cloth: ['#3a1428', '#8a0b41', '#c8203c', '#ed1c51', '#ff8f8f'], roof: ['#1f0924', '#2b2468', '#382b84', '#6440d8', '#6c88ff'] },
  f2: { wood: ['#1c1014', '#2d1a1f', '#472222', '#6a3a30', '#b15c51'], slate: ['#0a0b0f', '#14161f', '#252a32', '#393d4b', '#6b7a91'], paper: ['#585651', '#888c78', '#ac9f8f', '#d8cdb8', '#f4ecd8'], lac: ['#2d1a1f', '#5a0a2c', '#8a0b41', '#ce2038', '#ff8f8f'], leaf: ['#10201e', '#1c3a34', '#2f5a4c', '#4c8d7b', '#8ac8a8'], bloom: ['#5a2a3a', '#b15c51', '#ff8f8f', '#ffc5bc', '#fff0ec'] },
  f3: { sand: ['#291e1b', '#4a3420', '#7a5a30', '#a8823c', '#daaf1c'], rock: ['#1e1516', '#362529', '#4c423b', '#6e5c4c', '#a08868'], blood: ['#2a1d1f', '#5a2630', '#8a2e3b', '#b85040', '#e56335'], glyph: ['#003e52', '#007789', '#00b9ff', '#a8f0ff', '#ffffff'] },
  f4: { rock: ['#0a0b0f', '#14161f', '#2e324b', '#4a4f70', '#6b7a91'], gem: ['#1a1164', '#3d1a56', '#682596', '#9e4fb8', '#e0a8ff'], blood: ['#2a0418', '#5b0429', '#9e1751', '#ff4955', '#ff8e5c'] },
  f5: { rock: ['#14100f', '#201716', '#382523', '#5a3c30', '#8a6048'], leaf: ['#0c1a18', '#16302c', '#2f483e', '#4c8d7b', '#00c19a'], bone: ['#38322c', '#7a7068', '#b9aea8', '#e8dcc8', '#fff3de'], lava: ['#54002a', '#a82a18', '#e56335', '#ffa939', '#ffe822'] },
  f6: { ice: ['#0a1830', '#0f497b', '#2a6aa8', '#5aa0dc', '#9fd8ff'], snow: ['#5a6c98', '#9fb0da', '#c3cbdb', '#e6eaf4', '#fcfcfc'], pine: ['#0a1c38', '#0f3350', '#1c5068', '#2f7a88', '#7bd5f3'], aura: ['#007a70', '#00c19a', '#00fff0', '#ccfff5', '#ffffff'] },
  n: { ruin: ['#221c2d', '#3c3754', '#5d514d', '#88776d', '#b0a090'], rag: ['#2a1420', '#3c1e2b', '#5c3747', '#8a0b41', '#c82038'] },
};

const stage = document.getElementById('stage3d');
// 画质档位：low 给手机——像素比不超过 1.5、不走后期（泛光、移轴、暗角）、阴影图减半、飘浮物减量。小屏或触屏默认 low；地址带 ?q=low / ?q=high 可以指定，board.quality() 可以切
let low = Q.has('q') ? Q.get('q') === 'low' : matchMedia('(pointer: coarse)').matches || Math.min(screen.width, screen.height) < 600;
const renderer = new THREE.WebGLRenderer({ antialias: low, powerPreference: 'high-performance' }); // 低档直接画到屏幕上，抗锯齿交给画布；高档的抗锯齿在后期的画板里做
renderer.toneMapping = THREE.NoToneMapping; renderer.info.autoReset = false;              // 每帧自己清计数：后期要画好几遍，这样 board.stats() 报的是一整帧的绘制次数
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
stage.append(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x05050f);
const FOV = 22, PITCH = (SHORT ? 30 : 25) * Math.PI / 180, /* 手机上俯角大一些（30°，负责人定的）：屏幕矮，从高一点的地方看下去，四条路在画面里各自高一些 */ LOOK = new THREE.Vector3(0, .95, -.1);
const camera = new THREE.PerspectiveCamera(FOV, 1, 1, 200);

// ---------- 像素画：64 像素对应场景里的 1 格，和角色的像素一样大 ----------
function canvas(w, h, paint) { const c = document.createElement('canvas'); c.width = w; c.height = h; paint(c.getContext('2d'), w, h); return c; }
const base = new Map();
function T(c, rx = 1, ry = 1) { // 同一张画布按不同的平铺次数取贴图（常驻的贴图用它；换场景会释放的贴图走 Batch）
  let b = base.get(c);
  if (!b) { b = new THREE.CanvasTexture(c); b.colorSpace = THREE.SRGBColorSpace; b.magFilter = THREE.NearestFilter; b.wrapS = b.wrapT = THREE.RepeatWrapping; b.anisotropy = 8; base.set(c, b); }
  if (rx === 1 && ry === 1) return b;
  const t = b.clone(); t.repeat.set(rx, ry); t.needsUpdate = true; return t;
}
const R = (g, x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
function slab(g, x, y, w, h, fill, hi, lo) { // 一块带描边的石板：一圈墨线，左上一道亮边，右下一道暗边
  R(g, x, y, w, h, P.ink); R(g, x + 1, y + 1, w - 2, h - 2, fill);
  R(g, x + 1, y + 1, w - 2, 1, hi); R(g, x + 1, y + 1, 1, h - 2, hi); R(g, x + 1, y + h - 2, w - 2, 1, lo); R(g, x + w - 2, y + 1, 1, h - 2, lo);
}
const courses = (g, w, h, bw, bh, fills, hi, lo, y0 = 0) => { for (let y = y0; y < h; y += bh) for (let x = ((y - y0) / bh % 2 ? -bw / 2 : 0); x < w; x += bw) slab(g, x, y, bw, bh, pick(fills), hi, lo); };
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5], dith = (x, y) => (BAYER[(y & 3) * 4 + (x & 3)] + .5) / 16; // 4×4 有序抖点：所有过渡都靠它，不用渐变
function bands(g, w, h, stops) { // 天空：一条条硬边色带从上到下排，每条的最后十几行用抖点过渡到下一条
  stops.forEach(([y0, c], i) => { R(g, 0, y0, w, (stops[i + 1] ? stops[i + 1][0] : h) - y0, c); if (!i) return; const d = Math.min(14, y0 - stops[i - 1][0]); g.fillStyle = c;
    for (let y = y0 - d; y < y0; y++) for (let x = 0; x < w; x++) if (dith(x, y) < (y - y0 + d + 1) / (d + 1)) g.fillRect(x, y, 1, 1); });
}
const orb = (g, cx, cy, r, c, ry = r) => { g.fillStyle = c; for (let y = -ry; y <= ry; y++) { const k = Math.round(r * Math.sqrt(Math.max(0, 1 - y * y / (ry * ry)))); g.fillRect(cx - k, cy + y, k * 2 + 1, 1); } }; // 硬边的圆
const ring = (g, cx, cy, r0, r1, c, p) => { g.fillStyle = c; for (let y = -r1; y <= r1; y++) for (let x = -r1; x <= r1; x++) { const d = Math.hypot(x, y); if (d >= r0 && d < r1 && dith(cx + x, cy + y) < p) g.fillRect(cx + x, cy + y, 1, 1); } }; // 一圈抖点：日晕、月晕
const stars = (g, w, h, n, cols) => { for (let i = 0; i < n; i++) { const x = ri(0, w - 1), y = ri(0, h), c = pick(cols); R(g, x, y, 1, 1, c); if (i % 9 === 0) { R(g, x - 1, y, 3, 1, c); R(g, x, y - 1, 1, 3, c); } } };
const cloud = (g, x, y, w, [body, lit, shade]) => [.4, .7, 1, .85].forEach((f, i) => { R(g, Math.round(x - w * f / 2 + (i & 1) * 3), y + i * 2, Math.round(w * f), 2, i ? body : lit); if (i === 3) R(g, Math.round(x - w * f / 2 + 3), y + 8, Math.round(w * f) - 6, 1, shade); }); // 一朵平底的像素云
function ridge(g, w, h, by, amp, body, top, rim, o = {}) { // 一道山脊的剪影：by 是山脚那一行，amp 是起伏；朝光的坡上有一道亮边。smooth 是沙丘那样的圆坡，step 是台阶状的断崖
  const ph = [rnd() * 9, rnd() * 9, rnd() * 9], f = o.f || [.0105, .0285, .065], wv = o.smooth ? x => Math.sin(x) * .5 + .5 : x => Math.abs(Math.sin(x)); let prev = 0;
  for (let x = 0; x < w; x++) { let v = .55 * wv(x * f[0] + ph[0]) + .3 * wv(x * f[1] + ph[1]) + .15 * wv(x * f[2] + ph[2]); if (o.step) v = Math.round(v * o.step) / o.step; const y = Math.round(by - amp * v);
    R(g, x, y, 1, h - y, body); R(g, x, y, 1, Math.min(o.cap ?? 6, h - y), top); if (x && (o.lit > 0 ? y > prev : y < prev)) R(g, x, y, 1, 2, rim); prev = y; }
}
// 一张带墨线的像素画。parts 里每个部件是 [色阶, 画剪影的函数, 选项]：先用路径把剪影画出来，再自动描一圈墨线，
// 按“迎光一侧亮、背光一侧暗、顶上一道高光、底下一道暗边”分三档上色（角色图就是这么画的）；后面的部件盖住前面的。post 用来补手画的细节
const scratch = document.createElement('canvas'), sg = scratch.getContext('2d', { willReadFrequently: true }), rgb = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
function art(w, h, parts, post) {
  return canvas(w, h, g => { const img = g.createImageData(w, h), D = img.data; scratch.width = w; scratch.height = h;
    for (const [ramp, draw, o = {}] of parts) { sg.clearRect(0, 0, w, h); sg.fillStyle = sg.strokeStyle = '#000'; sg.lineCap = sg.lineJoin = 'round'; sg.beginPath(); draw(sg);
      const A = sg.getImageData(0, 0, w, h).data, M = (x, y) => x >= 0 && y >= 0 && x < w && y < h && A[(y * w + x) * 4 + 3] > 127, C = ramp.map(rgb);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { if (!M(x, y)) continue; let a = x, b = x; while (M(a - 1, y)) a--; while (M(b + 1, y)) b++; // 这一行里连着的一段
        const t0 = b > a ? (x - a) / (b - a) : .5, t = o.lit > 0 ? 1 - t0 : t0, edge = !M(x - 1, y) || !M(x + 1, y) || !M(x, y - 1) || !M(x, y + 1);
        const k = edge ? 0 : o.flat ? 2 : !M(x, y - 2) && b - a > 4 ? 3 : !M(x, y + 2) ? 1 : t < (o.hi ?? .34) ? 3 : t > (o.lo ?? .68) ? 1 : 2; D.set(C[k], (y * w + x) * 4); D[(y * w + x) * 4 + 3] = 255; } }
    g.putImageData(img, 0, 0); if (post) post(g); });
}
const poly = (g, pts) => { g.beginPath(); pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.fill(); };
const blob = (g, x, y, rx, ry = rx, rot = 0) => { g.beginPath(); g.ellipse(x, y, rx, ry, rot, 0, 7); g.fill(); };
const horn = (g, x0, y0, cx, cy, x1, y1, w0, w1) => { for (let k = 0; k <= 1.001; k += .03) { const a = 1 - k; blob(g, a * a * x0 + 2 * a * k * cx + k * k * x1, a * a * y0 + 2 * a * k * cy + k * k * y1, (w0 + (w1 - w0) * k) / 2); } }; // 一根由粗到细的弯角：獠牙、肋骨、树枝
function tileC(team, alt, [a, b, hi, lo, mid, pit], stud) { // 棋盘格：偏暗的石板（底色每个场地略有不同，但都压得很暗），刻一圈线框，四角钉，中间一个菱形纹；线框和菱形带队伍色
  return canvas(64, 64, g => {
    const acc = team < 0 ? P.teal : team > 0 ? P.red : [lo, lo, mid, mid, hi];
    slab(g, 0, 0, 64, 64, alt ? b : a, hi, lo);
    R(g, 2, 2, 60, 1, mid); R(g, 2, 2, 1, 60, mid); R(g, 2, 61, 60, 1, pit); R(g, 61, 2, 1, 60, pit);
    for (const [x, y, w, h] of [[8, 8, 48, 1], [8, 55, 48, 1], [8, 8, 1, 48], [55, 8, 1, 48]]) R(g, x, y, w, h, lo);
    for (const [x, y, w, h] of [[9, 9, 46, 1], [9, 54, 46, 1], [9, 9, 1, 46], [54, 9, 1, 46]]) R(g, x, y, w, h, acc[1]);
    for (const [x, y] of [[5, 5], [56, 5], [5, 56], [56, 56]]) { R(g, x, y, 3, 3, stud[1]); R(g, x, y, 2, 2, stud[3]); R(g, x + 2, y + 2, 1, 1, stud[0]); }
    for (let i = 0; i < 6; i++) { R(g, 31 - i, 26 + i, 1, 1, acc[3]); R(g, 32 + i, 26 + i, 1, 1, acc[3]); R(g, 31 - i, 37 - i, 1, 1, acc[2]); R(g, 32 + i, 37 - i, 1, 1, acc[2]); }
    for (const [x, y, w] of [[14, 17, 7], [39, 45, 9], [19, 46, 5], [43, 18, 5]]) { R(g, x, y, w, 1, mid); R(g, x + 1, y + 1, w - 2, 1, pit); }
  });
}
const brickC = canvas(64, 64, g => courses(g, 64, 64, 32, 16, [P.slate[1], P.slate[2], '#2a3c60'], P.slate[3], P.slate[0])); // 城砖
const trimC = canvas(16, 16, g => { R(g, 0, 0, 16, 16, P.gold[1]); R(g, 0, 0, 16, 2, P.gold[3]); R(g, 0, 14, 16, 2, P.gold[0]); R(g, 0, 0, 1, 16, P.gold[0]); R(g, 6, 5, 4, 4, P.gold[4]); R(g, 7, 9, 3, 1, P.gold[0]); R(g, 0, 2, 16, 1, P.gold[2]); }); // 金色饰边
const roofC = canvas(32, 32, g => { R(g, 0, 0, 32, 32, '#d0d0e0'); for (let y = 0; y < 32; y += 8) for (let x = (y / 8 % 2 ? -8 : 0); x < 32; x += 16) { R(g, x, y + 7, 16, 1, '#3c3c54'); R(g, x, y, 1, 8, '#3c3c54'); R(g, x + 1, y, 15, 1, '#ffffff'); } }); // 屋瓦（颜色由阵营色乘上去）
const windowC = TEAM.map(({ ramp }) => canvas(16, 24, g => { R(g, 0, 0, 16, 24, P.ink); R(g, 1, 1, 14, 22, P.gold[1]); R(g, 1, 1, 14, 1, P.gold[3]); R(g, 3, 3, 10, 18, ramp[3]); R(g, 3, 3, 10, 6, ramp[4]); R(g, 3, 16, 10, 5, ramp[2]); R(g, 7, 3, 2, 18, P.gold[0]); R(g, 3, 11, 10, 2, P.gold[0]); }));
const bannerC = TEAM.map(({ ramp }) => canvas(24, 40, g => { // 队伍旗：金边，三道布褶，中间一个白色菱形
  g.fillStyle = P.ink; g.beginPath(); g.moveTo(0, 0); g.lineTo(24, 0); g.lineTo(24, 33); g.lineTo(12, 40); g.lineTo(0, 33); g.fill();
  g.fillStyle = ramp[2]; g.beginPath(); g.moveTo(1, 1); g.lineTo(23, 1); g.lineTo(23, 32); g.lineTo(12, 38); g.lineTo(1, 32); g.fill();
  R(g, 1, 1, 22, 3, P.gold[2]); R(g, 1, 1, 22, 1, P.gold[3]); R(g, 2, 4, 5, 27, ramp[3]); R(g, 17, 4, 5, 27, ramp[1]);
  for (let i = 0; i < 5; i++) { R(g, 11 - i, 11 + i, 2 + i * 2, 1, '#ffffff'); R(g, 11 - i, 20 - i, 2 + i * 2, 1, '#d0d8e8'); }
}));
const matC = TEAM.map(({ ramp }) => canvas(20, 56, g => { for (let y = 0; y < 56; y++) for (let x = 0; x < 20; x++) if (x < 2 || x > 17 || y < 2 || y > 53 || ((x >> 1) + (y >> 1)) & 1) R(g, x, y, 1, 1, x < 2 || x > 17 || y < 2 || y > 53 ? ramp[4] : ramp[3]); })); // 城门口的门槛：队伍色的抖点格（不用半透明）
const crystalC = [P.cyan, P.violet].map(ramp => canvas(32, 48, g => { // 水晶簇：三根晶柱，左边亮、右边暗
  for (const [cx, top, w] of [[9, 16, 7], [18, 3, 9], [26, 22, 6]]) for (let y = top; y < 48; y++) { const half = Math.round(Math.min(1, (y - top) / 7) * w / 2);
    for (let x = -half; x <= half; x++) R(g, cx + x, y, 1, 1, Math.abs(x) === half ? ramp[0] : x < -half * .35 ? ramp[4] : x < half * .3 ? ramp[3] : ramp[2]); }
}));
const softT = new THREE.CanvasTexture(canvas(16, 16, g => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const d = Math.hypot(x - 7.5, y - 7.5), a = d < 2.6 ? 1 : d < 4.6 ? .5 : d < 7.6 && (x + y) & 1 ? .28 : 0; if (a) R(g, x, y, 1, 1, `rgba(255,255,255,${a})`); } })); softT.colorSpace = THREE.SRGBColorSpace; softT.magFilter = softT.minFilter = THREE.NearestFilter; softT.generateMipmaps = false; // 光晕：像素台阶的三层圆，最外层是抖点。放大后是硬边的像素光圈，和界面一路
// 场景里的光都画在这张小图上：左上是光晕（比特效用的那张细一倍：实心 → 半透 → 两圈抖点），右边是一道光柱（几条硬边的竖带）。所有光晕和光柱并成一个网格，一次画完
const glowT = new THREE.CanvasTexture(canvas(64, 64, g => { for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) { const d = Math.hypot(x - 15.5, y - 15.5), a = d < 4 ? 1 : d < 7.5 ? .5 : d < 11.5 ? (dith(x, y) < .5 ? .32 : 0) : d < 15.5 && dith(x, y) < .25 ? .26 : 0; if (a) R(g, x, y, 1, 1, `rgba(255,255,255,${a})`); }
  [0, 0, .28, .28, .28, .55, .55, .55, .55, .55, .28, .28, .28, .28, 0, 0].forEach((a, x) => a && R(g, 32 + x, 0, 1, 64, `rgba(255,255,255,${a})`)); }));
glowT.colorSpace = THREE.SRGBColorSpace; glowT.magFilter = glowT.minFilter = THREE.NearestFilter; glowT.generateMipmaps = false;
const glowM = new THREE.MeshBasicMaterial({ map: glowT, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }); glowM.userData.keep = true;

// ---------- 搭建用的小工具 ----------
function card(parent, c, w, h, x, y, z, o = {}) { // 底边中点落在 (x, y, z) 的单张画板（特效用；场景里的画板走 Batch）
  const mat = new THREE.MeshBasicMaterial({ map: T(c, o.rx || 1, 1), alphaTest: o.solid ? 0 : .5, side: THREE.DoubleSide, color: o.color ?? 0xffffff });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h).translate(0, h / 2, 0), mat); m.position.set(x, y, z);
  if (o.shadow) { m.castShadow = true; m.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: mat.map, alphaTest: .5 }); }
  parent.add(m); return m;
}
// 合批：一套场景里的方块按贴图并成几个大网格，立着的画板全画在一张图集上、并成一两个网格，光晕并成一个。
// 做法来自案例库《赤龙》的建筑拆解——“一次写进少数几个大缓冲区”：原来每个方块 6 次绘制、每个光晕 1 次，一套场景要画四百多次，手机吃不消
function Atlas(size = 512) { // 图集：把一张张小画按行排进一张大图，返回它在图里的位置
  const c = canvas(size, size, () => {}), g = c.getContext('2d'); let x = 0, y = 0, row = 0;
  return { c, add(src) { if (x + src.width > size) { x = 0; y += row + 2; row = 0; } if (y + src.height > size) console.warn('图集放不下', src.width, src.height); g.drawImage(src, x, y); const r = { c, x, y, w: src.width, h: src.height }; x += src.width + 2; row = Math.max(row, src.height); return r; } };
}
const camUp = [0, Math.cos(PITCH), -Math.sin(PITCH)], kol = new THREE.Color();
function Batch() {
  const lit = new Map(), flat = new Map(), glow = { p: [], u: [], k: [] }, mk = () => ({ p: [], u: [], k: [], n: [] });
  const quad = (b, pts, uvs, color = '#ffffff', gain = 1) => { kol.set(color); const [A, Bq, , Dq] = pts, e1 = [Bq[0] - A[0], Bq[1] - A[1], Bq[2] - A[2]], e2 = [Dq[0] - A[0], Dq[1] - A[1], Dq[2] - A[2]];
    const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]], l = Math.hypot(...n) || 1;
    for (const j of [0, 1, 2, 0, 2, 3]) { b.p.push(...pts[j]); b.u.push(...uvs[j]); b.k.push(kol.r * gain, kol.g * gain, kol.b * gain); if (b.n) b.n.push(n[0] / l, n[1] / l, n[2] / l); } };
  const of = (m, c) => m.get(c) || (m.set(c, m === lit ? mk() : { cast: mk(), plain: mk() }), m.get(c));
  const B = {
    // 上小下大的方台：底 w×d，顶 w2×d2，高 h，底面中心在 (x, y0, z)。贴图按 64 像素一格平铺，从每一面的上沿往下排。w2 = d2 = 0 就是四面的尖顶
    taper(w, h, d, w2, d2, c, x, y0, z, color, top = c) { const b = of(lit, c), su = 64 / c.width, sv = 64 / c.height, y1 = y0 + h, a = w / 2, e = d / 2, a2 = w2 / 2, e2 = d2 / 2;
      const side = (p0, p1, p2, p3, len, len2) => quad(b, [p0, p1, p2, p3], [[0, 1 - h * sv], [len * su, 1 - h * sv], [(len + len2) / 2 * su, 1], [(len - len2) / 2 * su, 1]], color);
      side([x - a, y0, z + e], [x + a, y0, z + e], [x + a2, y1, z + e2], [x - a2, y1, z + e2], w, w2); side([x + a, y0, z - e], [x - a, y0, z - e], [x - a2, y1, z - e2], [x + a2, y1, z - e2], w, w2);
      side([x + a, y0, z + e], [x + a, y0, z - e], [x + a2, y1, z - e2], [x + a2, y1, z + e2], d, d2); side([x - a, y0, z - e], [x - a, y0, z + e], [x - a2, y1, z + e2], [x - a2, y1, z - e2], d, d2);
      if (w2 > .02) { const tu = 64 / top.width, tv = 64 / top.height; quad(of(lit, top), [[x - a2, y1, z + e2], [x + a2, y1, z + e2], [x + a2, y1, z - e2], [x - a2, y1, z - e2]], [[0, 0], [w2 * tu, 0], [w2 * tu, d2 * tv], [0, d2 * tv]], color); } },
    box(w, h, d, c, x, y, z, color, top) { B.taper(w, h, d, w, d, c, x, y - h / 2, z, color, top); },   // 方块：中心在 (x, y, z)，和原来的用法一样
    card(r, k, x, y, z, o = {}) { // 立着的画板：底边中点落在 (x, y, z)，k 是放大倍数（1 = 和角色一样 64 像素一格，只用整数倍）。明暗已经画在图里，按原色显示
      const w = r.w / 64 * k, h = r.h / 64 * k, S = r.c.width, u0 = r.x / S, u1 = (r.x + r.w) / S, v0 = 1 - (r.y + r.h) / S, v1 = 1 - r.y / S, [ua, ub] = o.flip ? [u1, u0] : [u0, u1];
      quad(of(flat, r.c)[o.shadow ? 'cast' : 'plain'], [[x - w / 2, y, z], [x + w / 2, y, z], [x + w / 2, y + h, z], [x - w / 2, y + h, z]], [[ua, v0], [ub, v0], [ub, v1], [ua, v1]], o.color); },
    lie(r, w, d, x, y, z, color) { const S = r.c.width, u0 = r.x / S, u1 = (r.x + r.w) / S, v0 = 1 - (r.y + r.h) / S, v1 = 1 - r.y / S; // 平铺在地上的贴花
      quad(of(flat, r.c).plain, [[x - w / 2, y, z + d / 2], [x + w / 2, y, z + d / 2], [x + w / 2, y, z - d / 2], [x - w / 2, y, z - d / 2]], [[u0, v0], [u1, v0], [u1, v1], [u0, v1]], color); },
    halo(x, y, z, color, size, opacity = .7) { const s = size / 2, [, uy, uz] = camUp; // 一圈像素光晕，朝着镜头（镜头只平移不转，所以可以事先摆好）
      quad(glow, [[x - s, y - s * uy, z - s * uz], [x + s, y - s * uy, z - s * uz], [x + s, y + s * uy, z + s * uz], [x - s, y + s * uy, z + s * uz]], [[0, .5], [.5, .5], [.5, 1], [0, 1]], color, opacity); },
    shaft(x, y, z, w, h, lean, color, opacity) { const dx = -Math.sin(lean) * h, dy = Math.cos(lean) * h, rx = Math.cos(lean) * w / 2, ry = Math.sin(lean) * w / 2; // 一道斜着的光柱
      quad(glow, [[x - rx, y - ry, z], [x + rx, y + ry, z], [x + rx + dx, y + ry + dy, z], [x - rx + dx, y - ry + dy, z]], [[.5, 0], [.75, 0], [.75, 1], [.5, 1]], color, opacity); },
    build(parent, cache) { // 把攒下来的面变成网格挂到 parent 上。cache：这一套场景共用的贴图（同一张画布只传一次）
      const geo = b => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(b.p, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(b.u, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(b.k, 3)); if (b.n) g.setAttribute('normal', new THREE.Float32BufferAttribute(b.n, 3)); return g; };
      const tex = (c, tile) => cache.get(c) || (cache.set(c, Object.assign(new THREE.CanvasTexture(c), { colorSpace: THREE.SRGBColorSpace, magFilter: THREE.NearestFilter }, tile ? { wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping, anisotropy: low ? 2 : 8 } : { minFilter: THREE.LinearFilter, generateMipmaps: false })), cache.get(c));
      for (const [c, b] of lit) { const m = new THREE.Mesh(geo(b), new THREE.MeshLambertMaterial({ map: tex(c, true), vertexColors: true })); m.castShadow = m.receiveShadow = true; parent.add(m); }
      for (const [c, f] of flat) for (const kind of ['cast', 'plain']) { if (!f[kind].p.length) continue; const map = tex(c), m = new THREE.Mesh(geo(f[kind]), new THREE.MeshBasicMaterial({ map, alphaTest: .5, side: THREE.DoubleSide, vertexColors: true }));
        if (kind === 'cast') { m.castShadow = true; m.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map, alphaTest: .5 }); } parent.add(m); }
      if (glow.p.length) { const m = new THREE.Mesh(geo(glow), glowM); m.renderOrder = 2; parent.add(m); }
    },
  };
  return B;
}
function scrap(root) { // 拆掉一套场景：几何体、材质、贴图全部释放（常驻的不动）
  root.traverse(o => { if (!o.geometry) return; if (!o.geometry.userData.keep) o.geometry.dispose(); for (const m of [o.material, o.customDepthMaterial]) if (m && !m.userData.keep) { if (m.map) m.map.dispose(); m.dispose(); } }); root.removeFromParent();
}
// 像素数字：assets/ui/digits.png 里 13 个字形 0123456789+-/，每个 5×7、格子 6×8。伤害、战力、血量都用它——全屏最硬的字
const DIG = await new Promise(res => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = 'assets/ui/digits.png'; });
const GLYPH = '0123456789+-/', isPx = s => !!DIG && /^[0-9+\-\/]+$/.test(s), inked = {};
const inkOf = color => inked[color] ||= canvas(78, 8, g => { g.drawImage(DIG, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = color; g.fillRect(0, 0, 78, 8); }); // 整张字形图染成一个颜色
function pxText(g, text, x, y, k, color) { // 以 (x, y) 为中心、放大 k 倍画一串像素数字，四向描一圈墨边
  g.imageSmoothingEnabled = false; const x0 = Math.round(x - (text.length * 6 - 1) * k / 2), y0 = Math.round(y - 3.5 * k);
  for (const [dx, dy, col] of [[-1, 0, P.ink], [1, 0, P.ink], [0, -1, P.ink], [0, 1, P.ink], [0, 0, color]]) [...text].forEach((ch, i) => g.drawImage(inkOf(col), GLYPH.indexOf(ch) * 6, 0, 5, 7, x0 + (i * 6 + dx) * k, y0 + dy * k, 5 * k, 7 * k));
}
const HEART = ['.##.##.', '#######', '#######', '.#####.', '..###..', '...#...'], SKULL = ['.#####.', '#######', '#.###.#', '#######', '.##.##.', '.#####.', '.#.#.#.'];
const bits = (g, rows, x, y, k, color) => rows.forEach((r, j) => [...r].forEach((c, i) => { if (c === '#') R(g, x + i * k, y + j * k, k, k, color); })); // 按点阵画一个小图标
function badge(text, border, size) { // 始终朝向镜头的小牌子：战力、城堡血量。硬边切角，数字用像素字形。之后可以用 userData.set 改字
  const c = canvas(160, 96, () => {}), g = c.getContext('2d'), t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false })); s.scale.set(size * 160 / 96, size, 1); s.renderOrder = 10;
  s.userData.set = (txt, col = border) => { g.clearRect(0, 0, 160, 96); R(g, 16, 8, 128, 80, col); R(g, 8, 16, 144, 64, col); R(g, 24, 16, 112, 64, P.ink); R(g, 16, 24, 128, 48, P.ink);
    const heart = txt.startsWith('♥ '), num = heart ? txt.slice(2) : txt;
    if (isPx(num)) { const k = heart ? 6 : num.length > 2 ? 5 : 7, w = (num.length * 6 - 1) * k, hw = heart ? 43 : 0, x = 80 - (w + hw) / 2; if (heart) bits(g, HEART, Math.round(x), 33, 5, '#f06878'); pxText(g, num, x + hw + w / 2, 48, k, '#ece4d0'); }
    else { g.fillStyle = '#ece4d0'; g.font = 'bold 44px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(txt, 80, 50); }
    t.needsUpdate = true; };
  s.userData.set(text); return s;
}

// ---------- 光：亮度大部分来自均匀的环境光（保住贴图原色），一盏主光只负责投影和一点冷暖；颜色和方向每个场地不同（见 theme） ----------
const amb = new THREE.AmbientLight(0xd8e0ff, 2.35), sun = new THREE.DirectionalLight(0xf0f6ff, 1.5);
sun.castShadow = true; sun.shadow.mapSize.setScalar(low ? 1024 : 2048); sun.shadow.radius = 2;
Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 7, bottom: -7, near: 1, far: 34 }); sun.shadow.bias = -0.001; sun.shadow.normalBias = .02;
scene.add(amb, sun);

// ---------- 棋盘：格子、前线、光标是常驻的，换场地只换格子的贴图 ----------
const tiles = [], tileSkin = {}, tileGeo = new THREE.BoxGeometry(LX - .03, .06, LZ - .05);
{ const uv = tileGeo.attributes.uv; for (let i = 0; i < uv.count; i++) if (i < 8 || i > 11) uv.setXY(i, .5 / 64, 1 - .5 / 64); } // 只有顶面铺贴图，四边都取贴图角上那颗墨色像素：一格只要画一次
for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
  const team = r < (ROWS - 1) / 2 ? -1 : r > (ROWS - 1) / 2 ? 1 : 0, key = team + '|' + (r + c) % 2, skin = tileSkin[key] ||= new THREE.MeshLambertMaterial();
  const t = new THREE.Mesh(tileGeo, skin); t.position.set(tileX(r), .03, tileZ(c)); t.receiveShadow = true; t.userData = { c, r, base: .03 }; scene.add(t); tiles.push(t);
}
// 前线：各自能出兵的最远一行，用一条细的发光线标出来（开局只能放在离自己城堡最近的那一行）
const lines = [[TEAM[0].hex, tileX(0) + LX / 2], [TEAM[1].hex, tileX(ROWS - 1) - LX / 2]].map(([color, x]) => { const m = new THREE.Mesh(new THREE.BoxGeometry(.05, .02, DEPTH - .1), new THREE.MeshBasicMaterial({ color, transparent: true })); m.position.set(x, .075, 0); scene.add(m); return m; });
const cursor = new THREE.Mesh(new THREE.PlaneGeometry(LX - .01, LZ - .03), new THREE.MeshBasicMaterial({ color: 0xfff4a0, transparent: true, opacity: .28, depthWrite: false }));
cursor.rotation.x = -Math.PI / 2; cursor.visible = false; scene.add(cursor);

// ---------- 道具的画法：每个都是一张带墨线的像素画（64 像素 = 1 格，和角色同一个像素大小），颜色由调用的场地给 ----------
const lume = r => [r[0], r[1], r[3], r[4]];                                               // 发光的东西（火、灯芯、晶体）：跳过中间色，亮部直接到最亮
const S = {
  lamp: (post, head, kind) => art(20, 72, [[post, g => g.fillRect(8, 22, 4, 50)], [post, g => g.fillRect(5, 66, 10, 6)], [post, g => g.fillRect(4, 19, 12, 4)], // 棋盘后沿和城门口的灯柱：灯头有灯笼、火、纸灯、晶体四种
    [head, g => kind === 'flame' ? poly(g, [[5, 19], [3, 11], [7, 13], [9, 2], [13, 10], [16, 7], [16, 19]]) : kind === 'gem' ? poly(g, [[10, 0], [16, 9], [10, 19], [4, 9]]) : kind === 'orb' ? blob(g, 10, 10, 7, 9) : g.fillRect(4, 3, 12, 16)]],
    g => { if (kind === 'box') { R(g, 3, 1, 14, 3, post[1]); R(g, 9, 4, 2, 14, post[0]); } if (kind === 'orb') { R(g, 6, 0, 8, 2, post[1]); R(g, 6, 18, 8, 2, post[1]); } }),
  flag: (cloth, pole, torn, mark) => art(30, 92, [[pole, g => g.fillRect(3, 5, 3, 87)], [pole, g => g.fillRect(1, 1, 7, 5)], // 一根杆子一面燕尾旗；torn 是撕剩半截的残旗
    [cloth, g => poly(g, torn ? [[6, 9], [28, 9], [28, 32], [23, 27], [19, 40], [14, 32], [10, 46], [6, 41]] : [[6, 9], [28, 9], [28, 56], [17, 47], [6, 56]])]], mark),
  pillar: (ramp, h, broken) => art(28, h, [[ramp, g => broken ? poly(g, [[6, 12], [12, 5], [17, 10], [22, 2], [22, h - 6], [6, h - 6]]) : g.fillRect(6, 8, 16, h - 14)], ...(broken ? [] : [[ramp, g => g.fillRect(2, 1, 24, 8)]]), [ramp, g => g.fillRect(2, h - 8, 24, 8)]],
    g => { for (let x = 11; x < 20; x += 4) R(g, x, broken ? 18 : 11, 1, h - (broken ? 28 : 22), ramp[1]); }),                                             // 柱子：柱身上三道凹槽
  obelisk: (ramp, tip, glyph, h, broken) => art(26, h, [[ramp, g => poly(g, broken ? [[8, 14], [13, 6], [18, 16], [23, h - 5], [3, h - 5]] : [[8, 14], [18, 14], [23, h - 5], [3, h - 5]])], ...(broken ? [] : [[tip, g => poly(g, [[13, 1], [19, 15], [7, 15]])]]), [ramp, g => g.fillRect(0, h - 7, 26, 7)]],
    g => { for (let y = 24; y < h - 14; y += 8) { const k = ri(0, 2); R(g, 11, y, 4, 2, glyph[2]); R(g, 11 + (k ? 0 : 2), y + 2, 2, 2, glyph[3]); if (k > 1) R(g, 9, y + 1, 2, 2, glyph[2]); } }), // 方尖碑：上窄下宽，尖顶另一种颜色，碑身一列发亮的刻纹
  shards: (w, h, ramp, list, lit) => art(w, h, list.map(([cx, top, bw]) => [ramp, g => poly(g, [[cx, top], [cx + bw / 2, top + bw * 1.1], [cx + bw / 2, h], [cx - bw / 2, h], [cx - bw / 2, top + bw * .8]]), { lit }])), // 晶簇、冰棱、石笋：几根尖柱
  pine: (leaf, trunk, snow) => art(48, 72, [[trunk, g => g.fillRect(21, 56, 6, 16)], ...[3, 2, 1, 0].map(t => [leaf, g => poly(g, [[24, 1 + t * 13], [33 + t * 4.5, 24 + t * 13], [15 - t * 4.5, 24 + t * 13]])])],
    snow && (g => { for (let t = 0; t < 4; t++) { R(g, 21 - t * 2, 7 + t * 13, 6 + t * 4, 2, snow[4]); R(g, 19 - t * 3, 9 + t * 13, 5, 2, snow[3]); R(g, 27 + t * 2, 9 + t * 13, 3, 2, snow[2]); } })),
  snag: ramp => art(56, 80, [[ramp, g => { horn(g, 28, 80, 24, 50, 30, 28, 8, 5); for (const p of [[29, 44, 14, 38, 6, 20], [29, 36, 44, 30, 50, 12], [30, 30, 26, 16, 34, 3], [27, 54, 42, 50, 52, 38], [18, 34, 12, 26, 16, 14], [44, 26, 40, 16, 44, 8]]) horn(g, ...p, 4, 2.4); }]]), // 枯树
  bamboo: ramp => art(40, 150, [...[[9, 14, 5], [22, 2, 6], [32, 26, 5]].map(([x, top, w]) => [ramp, g => g.fillRect(x - w / 2, top, w, 150 - top)]), ...[[9, 20, -1], [22, 10, 1], [22, 34, -1], [32, 34, 1], [9, 52, 1], [32, 60, -1], [22, 70, 1]].map(([x, y, d]) => [ramp, g => poly(g, [[x, y], [x + d * 14, y - 7], [x + d * 17, y - 2], [x + d * 5, y + 4]])])],
    g => { for (const [x, top, w] of [[9, 14, 5], [22, 2, 6], [32, 26, 5]]) for (let y = top + 14; y < 146; y += 17) R(g, x - w / 2, y, w, 1, ramp[0]); }),
  plant: ramp => art(72, 60, [[-1.25, 30], [1.25, 30], [-.62, 36], [.62, 36], [0, 40]].map(([a, len]) => [ramp, g => blob(g, 36 + Math.sin(a) * len * .5, 58 - Math.cos(a) * len * .5, 5.5, len * .5, a), { lit: a > 0 ? 1 : -1 }])), // 一丛大叶子（蕨）
  mound: (ramp, w, h) => art(w, h, [[ramp, g => { blob(g, w * .32, h, w * .3, h * .7); blob(g, w * .62, h, w * .36, h - 2); }]]),                 // 一堆雪 / 沙 / 碎石
  crack: (ramp, zig) => art(96, 40, [[ramp, g => { g.lineWidth = 4.4; g.beginPath(); zig.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.stroke(); }, { flat: true }]], g => zig.forEach(([x, y], i) => i && i % 2 && R(g, x - 1, y, 2, 1, ramp[4]))), // 地上的裂缝（熔岩、暗影）
};
const ZIG = [[[4, 20], [20, 12], [34, 22], [52, 14], [70, 24], [92, 16]], [[6, 8], [22, 20], [40, 14], [56, 28], [72, 20], [90, 32]]];
function faceOf(fills, hi, lo, [lip, lipHi, lipLo], band, inlay) { // 舞台前沿：一道台沿，一条嵌饰带，下面是大块的石头，越往下越暗（用抖点压暗）
  return canvas(64, 128, g => { courses(g, 64, 128, 32, 20, fills, hi, lo, 24); slab(g, 0, 0, 64, 10, lip, lipHi, lipLo); R(g, 32, 1, 1, 8, P.ink);
    R(g, 0, 10, 64, 14, band); R(g, 0, 10, 64, 1, P.ink); R(g, 0, 23, 64, 1, P.ink); for (let x = 4; x < 64; x += 16) inlay(g, x);
    g.fillStyle = '#040410'; for (let y = 40; y < 128; y++) for (let x = 0; x < 64; x++) if (dith(x, y) < (y - 40) / 88 * .9) g.fillRect(x, y, 1, 1); });
}
const edgeOf = (fill, hi, lo, stud) => canvas(64, 16, g => { slab(g, 0, 0, 64, 16, fill, hi, lo); R(g, 32, 1, 1, 14, lo); for (const x of [14, 46]) stud(g, x); }); // 棋盘前后的镶边条
const stud4 = (lo, hi) => (g, x) => { R(g, x, 5, 4, 4, lo); R(g, x, 5, 3, 3, hi); };
const brick = (fills, hi, lo, bw = 32, bh = 16, extra) => canvas(64, 64, g => { courses(g, 64, 64, bw, bh, fills, hi, lo); if (extra) extra(g); });
const strip = (a, hi, lo, dot) => canvas(16, 16, g => { R(g, 0, 0, 16, 16, a); R(g, 0, 0, 16, 2, hi); R(g, 0, 14, 16, 2, lo); R(g, 0, 0, 1, 16, lo); if (dot) R(g, 6, 5, 4, 4, dot); }); // 城墙上的饰边（16 像素一段）
const tiled = (c, lineC, hiC) => canvas(32, 32, g => { R(g, 0, 0, 32, 32, c); for (let y = 0; y < 32; y += 8) for (let x = (y / 8 % 2 ? -8 : 0); x < 32; x += 16) { R(g, x, y + 7, 16, 1, lineC); R(g, x, y, 1, 8, lineC); R(g, x + 1, y, 15, 1, hiC); } }); // 一片屋瓦 / 冰面 / 晶面

// ---------- 城堡：横跨四条路的城墙，每条路一个门洞和一块队伍色的门槛，前后两座塔；塔顶一颗队伍色的水晶。我方（左）永远是同一个样子，对面（右）跟着场地换 ----------
const castles = [-1, 1].map((side, i) => { const g = new THREE.Group(); g.position.x = side * (HALF + 1.3); scene.add(g); const label = badge('♥ 10', TEAM[i].ramp[3], .42); label.position.set(0, HPY, .2); g.add(label); return { g, label, hp: 10, alarm: false, body: null }; });
const plate = c => c.label.userData.set('♥ ' + c.hp, c.alarm ? '#f06878' : undefined);
const gemGeo = new THREE.OctahedronGeometry(.2, 0), gems = []; gemGeo.userData.keep = true;
const roofed = (B, W, x, z, w, h, rh) => { B.box(w, h, w, W.wall, x, h / 2, z, W.tint, W.cap); B.box(w + .24, .16, w + .24, W.trim, x, h + .08, z); B.taper(w + .2, rh, w + .2, 0, 0, W.roof, x, h + .16, z, W.roofTint); return h + .16 + rh; }; // 方塔：塔身 + 出檐 + 四面坡的尖顶
const keep = (B, W, s, bz, fz) => { roofed(B, W, s * .15, fz, 1.25, 1.35, .7); return roofed(B, W, s * .1, bz, 1.5, 1.75, .9); };
function fort(B, side, W, K) { // W：这套场地的样式（墙、饰边、墙顶、屋顶的贴图，垛口的样子，两座塔怎么搭，墙上挂什么）；K：图集里队伍色的窗、旗、门槛和灯柱
  const i = side > 0 ? 1 : 0, bz = -DEPTH / 2 + .35, fz = DEPTH / 2 - .3;
  B.box(1.7, 1.4, DEPTH + .5, W.wall, 0, .7, 0, W.tint, W.cap); B.box(1.8, .12, DEPTH + .6, W.trim, 0, 1.46, 0, undefined, W.cap);
  for (let z = -DEPTH / 2; z <= DEPTH / 2 + .01; z += .6) for (const x of [-.7, .7]) { if (W.tooth === 'none' || rnd() < (W.gap || 0)) continue; if (W.tooth === 'spike') B.taper(.26, .5, .26, 0, 0, W.spike || W.wall, x, 1.52, z); else B.box(.3, .3, .3, W.wall, x, 1.67, z, W.tint, W.cap); }
  for (let c = 0; c < COLS; c++) { B.box(.12, .95, .78, W.wall, -side * .86, .48, tileZ(c), '#283448'); B.lie(K.mat, .3, LZ - .34, -side * 1.1, .012, tileZ(c)); } // 城门对着每一条路：深色的门洞，地上一块队伍色的门槛
  const top = (W.towers || keep)(B, W, side, bz, fz);
  if (W.deco) W.deco(B, side, bz, fz, K); else { for (const x of [-.34, .34]) B.card(K.win, 1, side * .1 + x, 1.46, bz + .76); B.card(K.ban, 2, side * .15, .1, fz + .635); }
  for (const z of [-DEPTH / 2 - .12, DEPTH / 2 + .12]) { B.card(K.lamp, 1, -side * 1.12, 0, z, { shadow: true }); B.halo(-side * 1.12, .98, z + .02, K.glow, .55, .4); }                       // 城门两头各一根灯柱
  B.halo(side * .1, top + .3, bz, TEAM[i].ramp[3], 1, .5); return top;
}
function raise(i, W, K, cache) { // 把一座城堡搭起来挂到它的组里（组本身常驻：挨打时抖、被攻破时下沉，都是动这个组）
  const c = castles[i], side = i ? 1 : -1, body = new THREE.Group(), B = Batch(), top = fort(B, side, W, K); B.build(body, cache);
  const gem = new THREE.Mesh(gemGeo, new THREE.MeshBasicMaterial({ color: TEAM[i].ramp[4] })); gem.position.set(side * .1, top + .3, -DEPTH / 2 + .35); gem.userData.y = top + .3; body.add(gem); gems[i] = gem; c.g.add(c.body = body);
}
{ const A = Atlas(128), K = { win: A.add(windowC[0]), ban: A.add(bannerC[0]), mat: A.add(matC[0]), lamp: A.add(S.lamp(P.slate, lume(P.gold), 'box')), glow: '#f8e040' }; // 我方城堡：深蓝城砖 + 金色饰边 + 青绿屋顶，只搭一次
  raise(0, { wall: brickC, trim: trimC, cap: brickC, roof: roofC, roofTint: '#00c098' }, K, new Map()); }

// ---------- 飘在空中的东西：一团点，位置是时间的闭式（不存状态，案例库《赤龙》的粒子做法），每个场地只换风向、颜色、形状和数量 ----------
const MOTES = 160, moteGeo = new THREE.BufferGeometry();
{ const p = new Float32Array(MOTES * 3), k = new Float32Array(MOTES); for (let i = 0; i < MOTES; i++) { p.set([rnd(), rnd(), rnd()], i * 3); k[i] = rnd(); } moteGeo.setAttribute('position', new THREE.BufferAttribute(p, 3)); moteGeo.setAttribute('seed', new THREE.BufferAttribute(k, 1)); }
const moteM = new THREE.ShaderMaterial({ transparent: true, depthWrite: false,
  uniforms: { t: { value: 0 }, px: { value: 1 }, size: { value: .04 }, alpha: { value: 1 }, box: { value: new THREE.Vector3(17, 4.2, 9) }, vel: { value: new THREE.Vector3() }, sway: { value: new THREE.Vector2() }, shape: { value: new THREE.Vector2(1, 1) }, colA: { value: new THREE.Color() }, colB: { value: new THREE.Color() } },
  vertexShader: `uniform float t, px, size; uniform vec3 box, vel; uniform vec2 sway; attribute float seed; varying float vK;
    void main(){ vec3 p = mod(position * box + vel * t * (.6 + .8 * seed), box); p.x += sin(t * sway.y + seed * 40.) * sway.x - .5 * box.x; p.y += .15; p.z -= .5 * box.z + .6;
      vec4 mv = modelViewMatrix * vec4(p, 1.); gl_Position = projectionMatrix * mv; gl_PointSize = max(2., floor(size * (.7 + .6 * fract(seed * 7.)) * px / -mv.z + .5)); vK = seed; }`,
  fragmentShader: `uniform vec3 colA, colB; uniform vec2 shape; uniform float alpha; varying float vK;
    void main(){ vec2 q = abs(gl_PointCoord - .5) * 2.; if (q.x > shape.x || q.y > shape.y) discard; gl_FragColor = vec4(fract(vK * 13.) < .5 ? colA : colB, alpha);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }` });
const motes = new THREE.Points(moteGeo, moteM); motes.frustumCulled = false; motes.renderOrder = 3; scene.add(motes);

// ---------- 七个场地。每个函数返回这一套的全部料：天空和三层远景的画法、地面、台沿、镶边、棋盘格底色、对面城堡的样式、道具怎么摆、飘什么、主光 ----------
// 远景三层共用一张 512 宽的图（32 像素 = 1 格，是角色像素的 2 倍）：天空 160 行、远山 112 行、中景 96 行。能看见的只有每层最下面一百行左右，所以太阳、月亮都压得很低
const THEMES = {
  // 无主之地：夜里的废墟战场。原来那座夜色城堡塌了一半——断柱、残旗、枯树，月亮还在
  n(A) { const st = P.slate, ru = F.n.ruin, rag = F.n.rag, col = [A.add(S.pillar(ru, 104)), A.add(S.pillar(ru, 76, true)), A.add(S.pillar(ru, 52, true))], flag = A.add(S.flag(rag, st, true)), tree = A.add(S.snag(['#080818', '#101828', '#182840', '#203a5c'])), cry = A.add(crystalC[0]), heap = A.add(S.mound(st, 64, 18));
    const arch = A.add(art(176, 132, [[ru, g => g.fillRect(14, 30, 26, 102)], [ru, g => poly(g, [[136, 58], [146, 46], [152, 54], [162, 40], [162, 132], [136, 132]])], [ru, g => poly(g, [[6, 12], [112, 12], [104, 22], [110, 30], [98, 36], [6, 36]])], [ru, g => g.fillRect(8, 124, 38, 8)], [ru, g => g.fillRect(130, 124, 38, 8)], // 棋盘正后方：一道塌了一半的拱门，横梁断在半空，另一半碎在地上
      [ru, g => poly(g, [[70, 132], [78, 114], [100, 110], [118, 120], [124, 132]])], [ru, g => poly(g, [[96, 132], [104, 122], [116, 124], [120, 132]])]], g => { for (const x of [22, 30, 144, 152]) R(g, x, 62, 1, 58, ru[1]); for (let x = 12; x < 96; x += 14) R(g, x, 18, 6, 3, ru[1]); R(g, 60, 22, 2, 12, ru[0]); R(g, 61, 30, 6, 2, ru[0]); }));
    const sword = A.add(art(14, 40, [[st.slice(1), g => g.fillRect(5, 10, 4, 30)], [P.gold, g => g.fillRect(1, 8, 12, 4)], [P.gold, g => g.fillRect(5, 0, 4, 9)]]));
    return { bg: '#05050f', light: ['#d8e0ff', 2.35, '#f0f6ff', 1.5, [-6, 8, -6.5]], tile: ['#1a2e4e', '#1f3559', P.navy[4], P.navy[0], P.navy[3], '#0c1626'], stud: P.gold, rune: ['#00d8e0', .2],
      sky(g, w, h) { bands(g, w, h, [[0, '#05050f'], [84, '#0c1232'], [118, '#1a2660'], [144, '#34348a']]); stars(g, w, 136, 150, ['#ffffff', '#a8fff8', '#c0c8e0']);
        ring(g, 150, 116, 15, 24, '#c8f0ff', .5); ring(g, 150, 116, 24, 36, '#c8f0ff', .22); orb(g, 150, 116, 15, '#eefaff'); for (const [x, y, r] of [[143, 111, 4], [156, 122, 3], [153, 107, 2]]) orb(g, x, y, r, '#b8d4e8'); for (const [x, y, cw] of [[188, 120, 70], [84, 108, 50], [330, 126, 84], [436, 112, 44]]) cloud(g, x, y, cw, ['#1a2660', '#34348a', '#0c1232']); },
      far(g, w, h) { ridge(g, w, h, 112, 34, '#141e44', '#1c2a58', P.navy[4], { cap: 6 }); for (const [x, tw, th] of [[60, 20, 36], [96, 13, 24], [296, 24, 42], [334, 15, 28], [436, 18, 32]]) { R(g, x, h - th, tw, th, '#101838'); R(g, x, h - th - 6, tw * .4, 6, '#101838'); R(g, x + tw * .65, h - th - 10, tw * .35, 10, '#101838'); R(g, x, h - th - 6, 2, th + 6, P.navy[3]); R(g, x + 5, h - th + 8, 3, 5, P.gold[1]); R(g, x + tw - 7, h - th + 18, 3, 5, P.navy[1]); } }, // 远处几座塌了顶的塔，还有一两扇窗亮着
      mid(g, w, h) { ridge(g, w, h, 96, 8, '#0c122c', '#101838', P.navy[3], { smooth: 1 }); for (let x = 8; x < w; x += ri(18, 34)) { const top = ri(68, 80); R(g, x, top, 3, h - top, '#0a1626'); R(g, x - 6, top + 7, 6, 2, '#0a1626'); R(g, x + 3, top + 4, 7, 2, '#0a1626'); R(g, x - 7, top + 3, 2, 5, '#0a1626'); R(g, x + 9, top - 1, 2, 5, '#0a1626'); R(g, x, top, 1, 8, P.teal[1]); } }, // 一线枯树
      floor: canvas(128, 128, g => { courses(g, 128, 128, 32, 16, ['#14243c', '#182a44', '#122038'], '#223c62', '#0c1626'); for (const [x, y] of [[32, 16], [80, 64], [0, 96]]) { R(g, x + 1, y + 1, 30, 14, '#0a1220'); R(g, x + 6, y + 9, 5, 3, '#1a2c48'); R(g, x + 19, y + 5, 4, 2, '#14243c'); } }), // 有几块石板没了，露出底下的黑
      face: faceOf(['#121e36', '#16243e', '#0e1a30'], '#1e3458', '#080e1c', [P.navy[3], P.navy[4], P.navy[1]], P.navy[0], (g, x) => { const c = x % 32 > 8 ? P.cyan : P.navy.slice(1); R(g, x + 3, 12, 2, 10, c[2]); R(g, x, 16, 8, 2, c[2]); R(g, x + 3, 13, 2, 2, c[4] || c[3]); R(g, x + 3, 16, 2, 2, c[3]); }), // 符文只剩一半还亮着
      edge: edgeOf(P.navy[2], P.navy[4], P.navy[0], stud4(P.gold[1], P.gold[3])), lamp: [A.add(S.lamp(st, lume(P.gold), 'box')), '#f8e040'],
      fort: { wall: brickC, trim: trimC, cap: brickC, roof: roofC, roofTint: '#f84850', gap: .4, // 对面的城堡：垛口缺了四成，后塔塌了顶，只剩一截残墙
        towers(B, W, s, bz, fz) { const stump = (x, z, w, h, n) => { B.box(w, h, w, brickC, x, h / 2, z); for (let k = 0; k < n; k++) { const t = .2 + rnd() * .7; B.box(.38, t, .38, brickC, x + (k % 3 - 1) * (w / 2 - .2), h + t / 2, z + (rnd() - .5) * (w - .4)); } }; stump(s * .15, fz, 1.25, 1.3, 5); stump(s * .1, bz, 1.5, 1.8, 7); return 2.45; },
        deco(B, s, bz, fz, K) { B.card(K.win, 1, s * .1 - .34, 1.36, bz + .76); B.card(flag, 1, s * .15 + .3, 1.3, fz + .3); B.card(K.ban, 2, s * .15 - .12, .05, fz + .635); } },
      dress(B, strew) { B.card(arch, 1, 0, 0, -5.2, { shadow: true }); [[-2.5, 1, -4.5], [2.4, 2, -4.3], [-3.3, 0, -5.8], [3.4, 1, -5.6], [-1.4, 2, -4.2]].forEach(([x, k, z]) => B.card(col[k], 1, x, 0, z, { shadow: true, flip: x > 0 })); B.card(flag, 1, 1.5, 0, -4.4, { shadow: true }); B.card(heap, 1, -.6, 0, -4, { shadow: true }); // 拱门两边是断柱和残旗
        strew([col[1], col[2], flag, tree, tree, sword, heap], 1.7); for (const [x, z] of [[-5.2, -4.2], [6.3, -5.6], [-8.4, -6]]) { B.card(cry, 1, x, 0, z, { shadow: true }); B.halo(x, .4, z + .05, '#00d8e0', .9, .3); }
        [[-4.2, -2.4, 2], [-1.6, -1, 1.4], [1.2, -2.2, 2.3], [3.9, -.6, 1.6]].forEach(([x, z, w]) => B.shaft(x, -.1, z, w, 7, .62, '#c8ecff', .06)); },                                                   // 月光柱
      fore: [tree, '#0a1020'], motes: { n: 110, vel: [.22, .12, .03], sway: [.12, .7], col: ['#a8fff8', '#8e98b8'], size: .034, add: true, alpha: .8 } };
  },
  // 晨曦要塞：破晓。地平线上半个太阳，暖色石头的要塞，一排金旗，火盆，金色的光柱和浮尘
  f1(A) { const { stone: st, cloth: cl, roof } = F.f1, disc = (g, cx, cy, r) => { orb(g, cx, cy, r, P.gold[2]); orb(g, cx, cy, r - 2, P.gold[4]); for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; R(g, Math.round(cx + Math.cos(a) * (r + 3)) - 1, Math.round(cy + Math.sin(a) * (r + 3)) - 1, 2, 2, P.gold[3]); } };
    const flag = A.add(S.flag(P.gold, st, false, g => { orb(g, 17, 26, 5, '#fcfcfc'); orb(g, 17, 26, 3, P.gold[3]); R(g, 8, 11, 19, 2, cl[3]); })), col = A.add(S.pillar(st, 96)), bra = A.add(S.lamp(st, lume(P.gold), 'flame')), emb = A.add(canvas(28, 28, g => disc(g, 14, 14, 9)));
    const wall = brick([st[2], '#7b683d', '#64523f'], st[3], st[0]);
    const gate = A.add(art(176, 132, [[st, g => g.fillRect(12, 48, 28, 84)], [st, g => g.fillRect(136, 48, 28, 84)], // 棋盘正后方的大拱门：两根柱子托一道拱，拱顶一轮金日
      [st, g => { g.beginPath(); g.moveTo(4, 60); g.lineTo(4, 24); g.lineTo(172, 24); g.lineTo(172, 60); g.lineTo(138, 60); g.quadraticCurveTo(138, 38, 88, 38); g.quadraticCurveTo(38, 38, 38, 60); g.fill(); }], [P.gold, g => g.fillRect(0, 18, 176, 8)], [P.gold, g => blob(g, 88, 14, 13)], [st, g => g.fillRect(6, 124, 40, 8)], [st, g => g.fillRect(130, 124, 40, 8)]],
      g => { orb(g, 88, 14, 8, P.gold[4]); for (const x of [20, 28, 144, 152]) R(g, x, 64, 1, 54, st[1]); for (let x = 10; x < 170; x += 16) R(g, x, 29, 6, 3, st[1]); }));
    return { bg: '#1f0924', light: ['#e4d4f8', 2.15, '#ffd890', 1.9, [3.5, 6.5, -8]], tile: ['#2b2a44', '#322f4e', '#5a5884', '#151528', '#46446c', '#1a1830'], stud: P.gold, rune: ['#f8c030', .22],
      sky(g, w, h) { bands(g, w, h, [[0, '#1f0924'], [70, '#2b2468'], [104, '#5d3555'], [122, '#966264'], [136, '#d19c60'], [148, '#fce9a0']]); stars(g, w, 96, 50, ['#ffffff', '#6c88ff']);
        ring(g, 256, 132, 22, 34, '#fff4a0', .55); ring(g, 256, 132, 34, 54, '#f8e040', .25); orb(g, 256, 132, 22, '#fff4a0'); orb(g, 256, 132, 15, '#ffffff'); for (const [x, y, cw] of [[140, 112, 96], [196, 128, 50], [436, 116, 84], [66, 128, 56], [482, 134, 44], [330, 124, 60], [380, 100, 40]]) cloud(g, x, y, cw, ['#966264', '#fce9a0', '#5d3555']); }, // 云底被朝阳照成金色
      far(g, w, h) { ridge(g, w, h, 112, 32, roof[1], roof[2], st[4], { lit: 1, cap: 6 }); },
      mid(g, w, h) { R(g, 0, 80, w, 16, '#3a2a40'); for (let x = 0; x < w; x += 12) R(g, x, 75, 8, 5, '#3a2a40'); R(g, 0, 80, w, 2, '#966264'); for (let x = 6; x < w; x += 24) R(g, x, 86, 3, 6, '#2e212d'); // 要塞的外墙：一线垛口，隔一段一座尖顶的塔，朝太阳的一侧有一道金边
        for (let x = 40; x < w; x += 144) { R(g, x, 62, 24, 34, '#3a2a40'); for (let k = 0; k < 12; k++) R(g, x - 2 + k, 62 - k * 1.5 | 0, 28 - k * 2, 2, '#2b2468'); R(g, x + 22, 62, 2, 34, '#d19c60'); for (let k = 0; k < 12; k++) R(g, x + 24 - k, 62 - k * 1.5 | 0, 2, 2, '#966264'); R(g, x + 9, 70, 5, 8, P.gold[3]); R(g, x + 11, 34, 2, 12, '#3a2a40'); R(g, x + 13, 34, 10, 6, cl[3]); } },
      floor: canvas(128, 128, g => courses(g, 128, 128, 32, 16, ['#5a464c', '#645056', '#544248'], '#7e6a60', '#2e212d')),
      face: faceOf(['#3a2e3a', '#42343e', '#342a36'], '#5a4850', '#1c1420', [st[2], st[3], st[1]], st[0], (g, x) => { orb(g, x + 4, 17, 4, P.gold[1]); orb(g, x + 4, 17, 2, P.gold[3]); R(g, x + 4, 11, 1, 2, P.gold[2]); R(g, x - 2, 17, 2, 1, P.gold[2]); R(g, x + 9, 17, 2, 1, P.gold[2]); }),
      edge: edgeOf(st[2], st[3], st[0], stud4(P.gold[1], P.gold[4])), lamp: [bra, '#f8a030'],
      fort: { wall, trim: trimC, cap: wall, roof: roofC, roofTint: roof[3], deco(B, s, bz, fz, K) { for (const x of [-.34, .34]) B.card(K.win, 1, s * .1 + x, 1.46, bz + .76); B.card(K.ban, 2, s * .15, .1, fz + .635); B.card(emb, 1, s * .15, 1.42, fz + .64); } },
      dress(B, strew) { B.card(gate, 1, 0, 0, -5.3, { shadow: true }); [[-1.9, -4.5], [1.9, -4.5], [-3, -4], [3, -4], [-4.9, -5.6], [4.9, -5.6], [-6.4, -4.4], [6.6, -4.2]].forEach(([x, z]) => B.card(flag, 1, x, 0, z, { shadow: true, flip: x > 0 })); // 一排金旗夹道
        for (const [x, z] of [[-1.05, -4.2], [1.05, -4.2], [-7.6, -5.4], [7.8, -5.6]]) { B.card(bra, 1, x, 0, z, { shadow: true }); B.halo(x, .98, z + .03, '#f8a030', .7, .45); }
        strew([col, col, flag], 2.6, 6); [[4.6, -2.6, 2.2], [2, -1.2, 1.5], [-.8, -2.4, 2.4], [-3.6, -.8, 1.7]].forEach(([x, z, w]) => B.shaft(x, -.1, z, w, 7, -.42, '#ffe090', .11)); },                         // 晨光从右后方斜着照进来
      fore: [flag, '#120c16'], motes: { n: 120, vel: [-.12, .16, 0], sway: [.1, .8], col: ['#fff4a0', '#f8e040'], size: .034, add: true, alpha: .9 } };
  },
  // 雾隐道场：山雾里的木构道场。朱红鸟居、竹林、纸灯笼、石灯，雾一带一带地飘，樱花瓣斜着落
  f2(A) { const { wood, slate, paper, lac, leaf, bloom } = F.f2, gold = ['#915816', '#daaf1c', '#fce945', '#fff4a0'], fog = '#888c78';
    const torii = A.add(art(160, 138, [[lac, g => g.fillRect(30, 26, 11, 112)], [lac, g => g.fillRect(119, 26, 11, 112)], [lac, g => g.fillRect(16, 46, 128, 8)], [lac, g => g.fillRect(73, 28, 14, 19)],
      [lac, g => poly(g, [[8, 16], [152, 16], [147, 29], [13, 29]])], [slate.slice(1), g => poly(g, [[0, 2], [12, 9], [148, 9], [160, 2], [157, 17], [3, 17]])], [slate.slice(1), g => g.fillRect(25, 128, 21, 10)], [slate.slice(1), g => g.fillRect(114, 128, 21, 10)]], g => { R(g, 76, 31, 8, 12, gold[1]); R(g, 78, 33, 4, 8, gold[3]); }));
    const bam = A.add(S.bamboo(leaf)), lan = A.add(S.lamp(wood, lume(gold.concat('#ffffff')), 'orb')), toro = A.add(art(36, 60, [[slate.slice(1), g => g.fillRect(8, 52, 20, 8)], [slate.slice(1), g => g.fillRect(14, 30, 8, 22)], [slate.slice(1), g => g.fillRect(8, 16, 20, 15)], [slate.slice(1), g => poly(g, [[0, 16], [8, 6], [28, 6], [36, 16]])], [slate.slice(1), g => g.fillRect(15, 0, 6, 7)]], g => { R(g, 13, 20, 10, 8, gold[1]); R(g, 15, 21, 6, 6, gold[3]); })); // 石灯
    const sakura = A.add(art(104, 104, [[wood, g => { horn(g, 52, 104, 46, 76, 56, 52, 11, 6); horn(g, 54, 66, 34, 54, 24, 40, 5, 3); horn(g, 54, 60, 74, 50, 82, 36, 5, 3); }], ...[[30, 34, 22], [76, 30, 22], [52, 20, 24], [20, 52, 13], [88, 50, 13], [54, 42, 18]].map(([x, y, r]) => [bloom, g => blob(g, x, y, r, r * .8)])]));
    const petals = A.add(canvas(64, 24, g => { for (let i = 0; i < 16; i++) { const x = ri(2, 58), y = ri(2, 20); R(g, x, y, 3, 2, bloom[2 + i % 2]); R(g, x + 1, y + 2, 1, 1, bloom[1]); } })), wall = canvas(64, 64, g => { R(g, 0, 0, 64, 64, paper[2]); R(g, 0, 22, 64, 1, paper[1]); for (const x of [0, 32]) { R(g, x, 0, 6, 64, wood[1]); R(g, x + 1, 0, 1, 64, wood[3]); } R(g, 0, 0, 64, 7, wood[1]); R(g, 0, 1, 64, 1, wood[3]); R(g, 0, 26, 64, 4, wood[2]); courses(g, 64, 64, 32, 8, [slate[2], slate[3], '#2e333f'], slate[4], slate[0], 48); }); // 白墙、木柱、石脚
    const tileR = tiled('#d0d0e0', '#3c3c54', '#ffffff'), beam = strip(lac[2], lac[3], lac[0], gold[1]);
    return { bg: '#14161f', light: ['#d4dce4', 2.5, '#e8e0d0', .9, [-4, 9, -5]], tile: ['#20262c', '#262d34', '#4b5560', '#101418', '#394149', '#14181c'], stud: gold, rune: ['#fce945', .16],
      sky(g, w, h) { bands(g, w, h, [[0, '#14161f'], [76, '#252a32'], [106, '#393d4b'], [126, '#5a6270'], [142, fog], [152, paper[2]]]); ring(g, 330, 122, 14, 23, paper[3], .35); orb(g, 330, 122, 14, paper[3]); for (const [x, y, cw] of [[210, 128, 110], [424, 116, 80], [90, 120, 70]]) cloud(g, x, y, cw, ['#5a6270', fog, '#393d4b']); },
      far(g, w, h) { ridge(g, w, h, 104, 42, '#5a6270', '#666e7a', fog, { cap: 6 }); for (let x = -20; x < w; x += ri(50, 90)) { const l = ri(60, 130), y = ri(84, 94); R(g, x, y, l, 3, fog); R(g, x + 10, y - 3, l >> 1, 3, fog); R(g, x + 16, y + 3, l - 30, 3, '#666e7a'); } ridge(g, w, h, 112, 26, '#454b58', '#4e5562', '#6b7a91', { cap: 6 }); }, // 两重山，中间隔着一带雾
      mid(g, w, h) { ridge(g, w, h, 96, 8, '#2d3540', '#343c48', '#5a6270', { smooth: 1 }); for (const x of [140, 400]) { for (let k = 0; k < 4; k++) { R(g, x - 16 + k * 3, 84 - k * 10, 33 - k * 6, 2, '#252a32'); R(g, x - 10 + k * 2, 86 - k * 10, 21 - k * 4, 8, '#2d3540'); R(g, x - 16 + k * 3, 84 - k * 10, 33 - k * 6, 1, '#5a6270'); } R(g, x, 46, 1, 8, '#252a32'); } // 远处的塔
        for (let x = 16; x < w; x += ri(30, 56)) { const t = ri(66, 78); R(g, x, t + 8, 3, h, '#252a32'); for (let k = 0; k < 3; k++) { R(g, x - 6 - k * 3, t + k * 6, 15 + k * 6, 4, '#2d3540'); R(g, x - 6 - k * 3, t + k * 6, 15 + k * 6, 1, '#454b58'); } } R(g, 0, 91, w, 5, fog); for (let x = -10; x < w; x += ri(40, 80)) { const l = ri(50, 110); R(g, x, 88, l, 3, fog); R(g, x + 12, 85, l >> 1, 3, paper[2]); } },
      floor: canvas(128, 128, g => { courses(g, 128, 128, 32, 32, ['#2a3036', '#2f363c', '#262c32'], '#3e4850', '#14181c'); for (const [x, y] of [[30, 30], [94, 62], [62, 126], [0, 94]]) { R(g, x, y, 5, 3, leaf[2]); R(g, x + 3, y + 2, 4, 2, leaf[1]); R(g, x + 1, y, 2, 1, leaf[3]); } }), // 石缝里长着青苔
      face: faceOf([wood[1], '#33201f', '#28171c'], wood[2], '#140c10', [lac[2], lac[3], lac[1]], wood[0], (g, x) => { orb(g, x + 4, 17, 3, gold[1]); orb(g, x + 4, 17, 1, gold[3]); }),
      edge: edgeOf(lac[2], lac[3], lac[0], stud4(gold[0], gold[2])), lamp: [lan, '#fce945'],
      fort: { wall, trim: beam, cap: tileR, roof: tileR, roofTint: '#59627a', tint: '#ffffff', tooth: 'none', // 对面是一座木构道场：墙头压一道瓦顶，两座塔是出檐的楼阁
        towers(B, W, s, bz, fz) { const eave = (x, z, w, y) => { B.taper(w, .2, w, w - .7, w - .7, tileR, x, y - .05, z, '#59627a'); for (const dx of [-1, 1]) for (const dz of [-1, 1]) B.box(.16, .14, .16, tileR, x + dx * (w / 2 - .07), y + .04, z + dz * (w / 2 - .07), '#59627a'); };
          B.taper(2.1, .36, DEPTH + .8, .3, DEPTH + .3, tileR, 0, 1.52, 0, '#59627a', beam);
          B.box(1.15, 1.45, 1.15, wall, s * .15, .725, fz); eave(s * .15, fz, 1.8, 1.5); B.taper(1.3, .5, 1.3, 0, 0, tileR, s * .15, 1.55, fz, '#59627a');
          B.box(1.4, 1.75, 1.4, wall, s * .1, .875, bz); eave(s * .1, bz, 2.1, 1.8); B.box(.95, .45, .95, wall, s * .1, 2.075, bz); eave(s * .1, bz, 1.55, 2.35); B.taper(1.1, .4, 1.1, 0, 0, tileR, s * .1, 2.4, bz, '#59627a'); return 2.75; },
        deco(B, s, bz, fz, K) { B.card(K.ban, 2, s * .15, .1, fz + .585); B.card(K.win, 1, s * .1, 1.88, bz + .485); } },
      dress(B, strew) { B.card(torii, 1, 0, 0, -5.2, { shadow: true }); for (const [x, z] of [[-1.7, -4.3], [1.7, -4.3], [-2.9, -5.8], [2.9, -5.8]]) { B.card(toro, 1, x, 0, z, { shadow: true }); B.halo(x, .58, z + .03, '#fce945', .5, .4); }
        for (const s of [-1, 1]) { for (let k = 0; k < 5; k++) B.card(bam, 1, s * (5.2 + k * .75 + rnd() * .3), 0, -3.6 - rnd() * 3.2, { shadow: true, flip: rnd() < .5 }); B.card(sakura, 1, s * 4.7, 0, -5.9, { shadow: true, flip: s > 0 }); B.lie(petals, 1, .4, s * 3.6, .006, -5); B.lie(petals, 1, .4, s * 1.2, .006, -3.6); }
        strew([bam, bam, toro, sakura], 2.2, 9); },
      fore: [bam, '#0c0e12'], motes: { n: 90, vel: [-.5, -.32, .08], sway: [.25, 1.3], col: ['#ff8f8f', '#ffc5bc'], size: .05, shape: [1, .6], alpha: 1 },
      drift: [canvas(256, 32, g => { for (let i = 0; i < 6; i++) { const x = ri(0, 150), y = 4 + i * 4, l = ri(48, 100); R(g, x + 12, y - 2, l >> 1, 2, fog); R(g, x, y, l, 2, paper[2]); R(g, x + 8, y + 2, l - 22, 2, fog); } }), .035, .32, [[0, 0, -7.25, 32, 1.5, 3], [0, 0, -4.7, 32, .8, 4], [0, -.9, 3.3, 34, .9, 5]]] };
  },
  // 千碑谷：落日。满谷的方尖碑，碑身的刻纹发着蓝光；沙丘、风沙
  f3(A) { const { sand, rock, blood, glyph } = F.f3, dusk = ['#291e1b', '#4a3420', '#6e4c1e', '#8a6428', '#a8823c'];
    const ob = [A.add(S.obelisk(sand, P.gold, glyph, 126)), A.add(S.obelisk(sand, P.gold, glyph, 100)), A.add(S.obelisk(blood, P.gold, glyph, 84)), A.add(S.obelisk(sand, P.gold, glyph, 60, true)), A.add(S.obelisk(rock, P.gold, glyph, 112))];
    const dune = A.add(S.mound(dusk, 96, 22)), bra = A.add(S.lamp(rock, lume(glyph), 'gem')), wall = brick([sand[2], '#6e5028', '#84622f'], sand[3], '#3a2816'), band = strip('#007789', '#00b9ff', '#003e52', P.gold[3]), gilt = tiled(P.gold[2], P.gold[0], P.gold[4]);
    const wing = A.add(canvas(64, 22, g => { for (let k = 0; k < 9; k++) { R(g, 4 + k * 2, 6 + k, 28 - k * 2, 2, k % 2 ? glyph[1] : glyph[2]); R(g, 32, 6 + k, 28 - k * 2, 2, k % 2 ? glyph[1] : glyph[2]); } R(g, 2, 4, 60, 2, P.gold[2]); orb(g, 32, 10, 7, P.gold[1]); orb(g, 32, 10, 5, blood[4]); orb(g, 31, 9, 2, P.gold[4]); })); // 带翼的日盘
    return { bg: '#1c1b36', light: ['#dcc4e4', 2.05, '#ffb060', 2, [-7, 5.5, -5]], tile: ['#33261f', '#3b2c23', '#6e5642', '#1a1210', '#544032', '#1e1612'], stud: P.gold, rune: ['#00b9ff', .2],
      sky(g, w, h) { bands(g, w, h, [[0, '#1c1b36'], [64, '#3a2a55'], [96, '#62507e'], [116, blood[2]], [130, blood[4]], [142, '#f0a030'], [152, '#fce945']]); stars(g, w, 80, 30, ['#ffffff', '#a096d1']);
        ring(g, 176, 136, 28, 40, '#f0a030', .5); ring(g, 176, 136, 40, 60, blood[4], .22); orb(g, 176, 136, 28, '#fff4a0'); for (let k = 0; k < 4; k++) R(g, 146, 132 + k * 7, 62, 1 + k, k < 2 ? '#fce945' : '#f0a030'); for (const [x, y, cw] of [[324, 118, 110], [66, 110, 70], [440, 132, 64], [254, 104, 50]]) cloud(g, x, y, cw, [blood[2], '#f0a030', '#62507e']); }, // 一轮被横纹切开的大落日
      far(g, w, h) { ridge(g, w, h, 112, 18, '#3a2030', '#4c2a38', blood[4], { smooth: 1, f: [.006, .015, .035], cap: 6 }); for (let k = 0; k < 36; k++) R(g, 362 + k, 110 - k, (36 - k) * 2, 1, k % 4 < 2 ? '#3a2030' : '#42242f'); for (let k = 0; k < 36; k++) R(g, 362 + k, 110 - k, 3, 1, blood[4]); // 远处一座金字塔
        for (const [x, t] of [[30, 72], [84, 64], [128, 80], [262, 68], [300, 82], [330, 62], [466, 74], [498, 66]]) { R(g, x, t + 7, 8, h, '#2a1826'); R(g, x + 2, t + 3, 4, 4, '#2a1826'); R(g, x + 3, t, 2, 3, P.gold[3]); R(g, x < 176 ? x + 6 : x, t + 7, 2, h, blood[4]); } },                   // 一根根碑的剪影，朝落日的一侧有亮边
      mid(g, w, h) { ridge(g, w, h, 96, 10, '#2a1a22', '#3a2228', sand[3], { smooth: 1, f: [.009, .022, .05] }); for (const [x, t] of [[24, 66], [108, 72], [222, 60], [296, 74], [368, 64], [430, 72], [486, 68]]) { R(g, x, t + 8, 11, h, '#20141c'); R(g, x + 2, t + 4, 7, 4, '#20141c'); R(g, x + 4, t, 3, 4, P.gold[3]); R(g, x < 176 ? x + 9 : x, t + 8, 2, h, '#f0a030'); for (let y = t + 14; y < 92; y += 7) R(g, x + 4, y, 3, 3, glyph[2]); } },
      floor: canvas(128, 128, g => { R(g, 0, 0, 128, 128, '#5e4424'); for (let y = 6; y < 128; y += 12) for (let x = 0; x < 128; x += 2) { const yy = y + Math.round(2.5 * Math.sin((x + y * 3) * Math.PI / 32)); if ((x + y) % 36 < 26) { R(g, x, yy, 2, 1, '#6e5228'); R(g, x, yy + 1, 2, 1, '#4a3420'); } } }), // 沙地：一道道风吹出来的沙纹
      face: faceOf(['#5a4226', '#624828', '#523c22'], '#7e5c2c', '#2a1c12', [sand[2], sand[3], sand[1]], sand[0], (g, x) => { R(g, x + 1, 13, 6, 2, glyph[2]); R(g, x + 3, 15, 2, 6, glyph[2]); R(g, x, 18, 8, 1, glyph[1]); R(g, x + 3, 13, 2, 1, glyph[3]); }),
      edge: edgeOf(sand[2], sand[3], sand[0], stud4(glyph[1], glyph[3])), lamp: [bra, '#00b9ff'],
      fort: { wall, trim: band, cap: wall, roof: gilt, // 对面是一座塔门神庙：前面一座上窄下宽的塔门，后面立一根金顶的大碑
        towers(B, W, s, bz, fz) { B.taper(1.35, 1.7, 1.35, 1.05, 1.05, wall, s * .15, 0, fz); B.box(1.2, .14, 1.2, band, s * .15, 1.77, fz, undefined, wall); B.taper(.5, .35, .5, 0, 0, gilt, s * .15, 1.84, fz); B.taper(.95, 2.25, .95, .5, .5, wall, s * .1, 0, bz); B.taper(.5, .5, .5, 0, 0, gilt, s * .1, 2.25, bz); return 2.75; },
        deco(B, s, bz, fz, K) { B.card(wing, 1, s * .15, 1.32, fz + .64); B.card(K.ban, 2, s * .15, .05, fz + .7); } },
      dress(B, strew) { [[-3, -5.9, 0], [-1, -5.6, 4], [1.1, -5.8, 0], [3, -5.5, 1], [-2, -4.7, 1], [.1, -4.5, 2], [2.1, -4.8, 3], [-4.8, -4.2, 2], [4.9, -4.4, 1], [-6.2, -5.8, 0], [6.4, -5.6, 4]].forEach(([x, z, k]) => { B.card(ob[k], 1, x, 0, z, { shadow: true }); B.halo(x, ob[k].h / 128, z + .03, '#00b9ff', .9, .22); }); // 棋盘后面三排碑
        for (let k = 0; k < 9; k++) B.card(dune, 1, (rnd() - .5) * 20, 0, -3.4 - rnd() * 3.6, { flip: rnd() < .5 }); strew([ob[1], ob[2], ob[3], ob[4], dune], 2, 7); },
      fore: [ob[0], '#120a0c'], motes: { n: 140, vel: [2.4, .04, .15], sway: [.04, 3], col: ['#daaf1c', '#a8823c'], size: .04, shape: [1, .34], alpha: .9 },
      drift: [canvas(256, 32, g => { for (let i = 0; i < 26; i++) { const x = ri(0, 255), y = ri(2, 28), l = ri(20, 70); for (let dx = 0; dx < l; dx++) if (dith(x + dx, y) < .6) R(g, (x + dx) % 256, y, 1, 1, i % 3 ? sand[3] : sand[4]); } }), -.5, .55, [[0, 0, -3.1, 32, .6, 4], [0, 0, -6.9, 32, .9, 3], [0, -.5, 3.3, 34, .6, 5]]] };
  },
  // 蚀月深坑：月蚀。黑曜石的坑底，紫色晶簇自己发光，地上裂着暗影的口子，一道魔门立在正后方
  f4(A) { const { rock, gem, blood } = F.f4, eye = A.add(canvas(24, 14, g => { orb(g, 12, 7, 11, P.ink, 6); orb(g, 12, 7, 9, blood[2], 4); orb(g, 12, 7, 5, blood[3], 3); R(g, 11, 4, 2, 7, P.ink); R(g, 9, 5, 2, 1, blood[4]); })); // 红眼窗
    const cry = [A.add(S.shards(72, 96, lume(gem).concat(gem[4]), [[14, 44, 14], [56, 36, 16], [44, 62, 12], [32, 2, 22]])), A.add(S.shards(44, 56, lume(gem).concat(gem[4]), [[10, 22, 10], [34, 16, 12], [22, 2, 14]]))], spike = A.add(S.shards(48, 84, rock, [[10, 40, 14], [38, 30, 16], [24, 2, 20]])), lampC = A.add(S.lamp(rock, lume(gem), 'gem'));
    const crack = ZIG.map(z => A.add(S.crack([gem[1], gem[2], gem[3], gem[3], gem[4]], z))), wall = brick(['#20223a', '#262842', '#1b1d32'], '#3c4060', rock[0], 32, 16, g => { for (const [x, y] of [[8, 6], [40, 22], [20, 38], [50, 54]]) { R(g, x, y, 5, 1, gem[2]); R(g, x + 4, y + 1, 4, 1, gem[3]); R(g, x + 7, y + 2, 3, 1, gem[2]); } }), vein = strip(rock[2], rock[3], rock[0], gem[3]), shardC = tiled(gem[3], gem[1], gem[4]);
    const gate = A.add(art(150, 140, [[rock, g => { g.lineWidth = 20; g.beginPath(); g.ellipse(75, 86, 50, 60, 0, Math.PI * .86, Math.PI * 2.14); g.stroke(); }], [[gem[0], '#130517', '#1a1164', gem[1]], g => blob(g, 75, 88, 40, 52), { flat: true }], // 魔门：一圈带角的石环，里面是暗紫色的漩涡
      [rock, g => poly(g, [[30, 34], [14, 2], [48, 22]])], [rock, g => poly(g, [[120, 34], [136, 2], [102, 22]])], [rock, g => g.fillRect(8, 128, 134, 12)]],
      g => { for (let k = 0; k < 70; k++) { const a = k * .42, r = 3 + k * .5; R(g, Math.round(75 + Math.cos(a) * r * .72), Math.round(88 + Math.sin(a) * r), 2, 2, k % 3 ? gem[2] : gem[4]); } for (const [x, y] of [[24, 70], [124, 62], [40, 108], [108, 112]]) { R(g, x, y, 3, 3, gem[3]); R(g, x, y, 2, 2, gem[4]); } }));
    return { bg: '#07030c', light: ['#cdbcff', 2.15, '#ffa0b8', 1.25, [1.5, 9, -6]], tile: ['#1c1634', '#22193e', '#4a3f80', '#0c0818', '#352b60', '#100a20'], stud: lume(gem).concat(gem[4]), rune: ['#9e4fb8', .26],
      sky(g, w, h) { bands(g, w, h, [[0, '#07030c'], [90, '#130517'], [124, '#1c0f3a'], [146, gem[1]]]); stars(g, w, 138, 80, [gem[4], '#a096d1', blood[3]]);
        ring(g, 352, 118, 36, 58, blood[1], .3); ring(g, 352, 118, 27, 36, blood[2], .45); ring(g, 352, 118, 22, 27, blood[3], .9); ring(g, 352, 118, 20, 23, '#ffd8e8', 1); orb(g, 352, 118, 20, '#0a0410'); R(g, 365, 102, 5, 5, '#ffffff'); R(g, 363, 104, 9, 1, '#ffffff'); R(g, 367, 100, 1, 9, '#ffffff'); }, // 月蚀：黑月亮外面一圈绯红的日冕，右上角一颗“钻石”
      far(g, w, h) { ridge(g, w, h, 112, 46, '#150b2c', '#1e1240', gem[2], { f: [.025, .055, .115], cap: 4 }); },                                                             // 坑沿：一圈尖石
      mid(g, w, h) { ridge(g, w, h, 96, 12, '#0c0818', '#150b2c', '#54489c', { f: [.045, .1, .185], cap: 3 }); for (const [x, y] of [[60, 58], [186, 48], [300, 62], [450, 54]]) { for (let k = 0; k < 7; k++) R(g, x - k * 2, y + k, k * 4 + 8, 1, '#150b2c'); for (let k = 0; k < 6; k++) R(g, x - 12 + k * 3, y + 7 + k, 32 - k * 7, 1, '#0c0818'); R(g, x, y, 8, 2, '#54489c'); } // 几块浮在半空的石头
        for (const x of [24, 126, 252, 398, 490]) { for (let k = 0; k < 16; k++) R(g, x - (k >> 2), 76 + k, (k >> 1) + 2, 1, k % 3 ? gem[2] : gem[3]); R(g, x, 76, 2, 6, gem[4]); } },
      floor: canvas(128, 128, g => { courses(g, 128, 128, 64, 32, ['#181a2a', '#1c1e30', '#151726'], '#2e324b', rock[0]); let x = 6, y = 20; for (let k = 0; k < 44; k++) { R(g, x & 127, y & 127, 3, 1, k % 5 ? gem[1] : gem[2]); x += 3; y += [1, 1, -1, 2, -1, 0][k % 6]; } }), // 黑曜石板上爬着一道紫纹
      face: faceOf(['#14121f', '#181626', '#100e1a'], '#2e2a4b', '#07050c', [rock[2], rock[3], rock[1]], rock[0], (g, x) => { for (let k = 0; k < 5; k++) R(g, x + 4 - Math.min(k, 4 - k), 12 + k * 2, Math.min(k, 4 - k) * 2 + 1, 2, k < 2 ? gem[4] : gem[3]); }),
      edge: edgeOf(rock[2], rock[3], rock[0], stud4(gem[2], gem[4])), lamp: [lampC, '#9e4fb8'],
      fort: { wall, trim: vein, cap: wall, roof: shardC, tooth: 'spike', spike: shardC, // 对面是一丛黑曜石的尖塔，墙头是一排晶刺，墙上睁着几只红眼
        towers(B, W, s, bz, fz) { const spire = (x, z, w, h) => { B.taper(w, h * .55, w, w * .5, w * .5, wall, x, 0, z); B.taper(w * .5, h * .45, w * .5, 0, 0, shardC, x, h * .55, z); }; // 下半截黑石，上半截是发亮的晶体，不然整根黑得看不见
          spire(s * .15, fz, 1.15, 2.05); spire(s * .15 - s * .5, fz - .6, .6, 1.9); spire(s * .1, bz, 1.4, 2.7); spire(s * .1 - s * .5, bz + .6, .7, 2.1); spire(s * .1 + s * .45, bz + .45, .55, 1.9); return 2.6; },
        deco(B, s, bz, fz, K) { for (const [x, y] of [[.36, .92], [.4, .52]]) B.card(eye, 1, s * .15 + x, y, fz + .6); B.card(cry[1], 1, s * .15 - .62, 0, fz + .72); B.card(K.ban, 2, s * .15 - .12, .05, fz + .64); B.halo(s * .15 - .62, .4, fz + .74, '#9e4fb8', .9, .3); } },
      dress(B, strew) { B.card(gate, 1, 0, 0, -5.2, { shadow: true }); B.halo(0, 1.1, -5.15, '#682596', 1.8, .3);
        for (const [x, z, k] of [[-2.2, -4.6, 0], [2.3, -4.4, 0], [-3.4, -5.9, 1], [3.4, -6, 1], [-5.4, -4.4, 0], [5.6, -4.8, 0], [-7.6, -6, 0], [8, -5.6, 1]]) { B.card(cry[k], 1, x, 0, z, { shadow: true, flip: x > 0 }); B.halo(x, k ? .4 : .7, z + .04, '#9e4fb8', k ? .9 : 1.4, .28); }
        for (let k = 0; k < 10; k++) { const x = (rnd() - .5) * 22, z = -3.3 - rnd() * 3.6, c = crack[k % 2]; B.lie(c, 1.5, .62, x, .006, z); } strew([spike, spike, cry[1]], 2.1, 6); },
      fore: [cry[0], '#0e081c'], motes: { n: 110, vel: [.04, .38, 0], sway: [.16, 1.1], col: ['#e0a8ff', '#ff4955'], size: .034, add: true, alpha: .95 },
      drift: [canvas(256, 32, g => { for (let i = 0; i < 12; i++) { const x = ri(0, 255), y = ri(6, 26), l = ri(40, 100); for (let k = 0; k < 3; k++) for (let dx = 0; dx < l - k * 14; dx++) if (dith(x + dx, y + k * 2) < .5) R(g, (x + dx + k * 6) % 256, y + k * 2, 1, 2, k ? '#1c0f3a' : gem[1]); } }), .02, .6, [[0, 0, -7.25, 32, 1.2, 3], [0, 0, -3.2, 32, .5, 4]]] };
  },
  // 蛮荒巢穴：巨骨、蕨、熔岩裂隙。远处一座冒烟的火山，棋盘后面一副巨兽的肋骨
  f5(A) { const { rock, leaf, bone, lava } = F.f5, dim = ['#38322c', '#5e564e', '#8a8078', '#b9aea8'];
    const ribs = A.add(art(264, 150, [...[0, 1, 2, 3, 4].map(i => [dim, g => horn(g, 100 + i * 39, 150, 122 + i * 39, 44 + i * 9, 74 + i * 37, 16 + i * 10, 10, 4), { lit: 1 }]), [bone, g => { for (let k = 0; k < 13; k++) blob(g, 70 + k * 13, 14 + k * 3.6, 6.5, 5); }], ...[0, 1, 2, 3, 4].map(i => [bone, g => horn(g, 12 + i * 40, 150, -10 + i * 40, 40 + i * 9, 72 + i * 37, 16 + i * 10, 13, 4)])])); // 两排肋骨向中间合拢，顶上一串脊椎
    const skull = A.add(art(104, 74, [[bone, g => poly(g, [[30, 72], [22, 54], [42, 48], [86, 52], [98, 60], [96, 68], [70, 72]])], [bone, g => { blob(g, 34, 30, 26, 22); poly(g, [[40, 12], [84, 24], [102, 38], [100, 48], [56, 50], [30, 48]]); }], [bone, g => poly(g, [[16, 14], [2, 0], [28, 8]])], [bone, g => poly(g, [[46, 10], [50, -2], [58, 12]])]],
      g => { orb(g, 44, 30, 8, P.ink, 7); orb(g, 43, 31, 5, lava[1], 4); orb(g, 43, 31, 2, lava[3]); R(g, 90, 36, 4, 3, bone[0]); for (let x = 58; x < 98; x += 7) { R(g, x, 49, 4, 4, '#ffffff'); R(g, x + 1, 53, 2, 2, '#ffffff'); R(g, x + 3, 49, 1, 4, bone[2]); } })); // 一颗巨兽的头骨，眼窝里还有一点火
    const fern = A.add(S.plant(['#0c1a18', '#1c4a40', '#2f7a66', '#4cb89a'])), tusk = A.add(art(44, 112, [[bone, g => horn(g, 12, 112, 2, 50, 36, 6, 15, 3)]])), egg = A.add(art(52, 34, [[rock.slice(1), g => blob(g, 26, 30, 25, 8)], ...[[14, 18], [38, 19], [26, 14]].map(([x, y]) => [bone, g => blob(g, x, y, 8, 11)])], g => { for (const [x, y] of [[12, 16], [28, 12], [38, 20], [24, 20]]) R(g, x, y, 3, 2, leaf[4]); }));
    const crack = ZIG.map(z => A.add(S.crack([lava[0], lava[1], lava[3], lava[3], lava[4]], z))), torch = A.add(S.lamp(bone, lume(lava), 'flame')), wall = brick(['#382523', '#3e2a26', '#32201e'], rock[3], rock[0], 32, 32, g => { for (const [x, y] of [[6, 30], [38, 62], [50, 30]]) { R(g, x, y, 7, 2, leaf[2]); R(g, x + 2, y - 1, 4, 1, leaf[3]); } }), spine = strip(bone[2], bone[4], bone[0], bone[3]), moss = canvas(64, 64, g => { R(g, 0, 0, 64, 64, '#263a30'); for (let y = 4; y < 64; y += 10) for (let x = (y % 20 ? 2 : 8); x < 64; x += 14) { R(g, x, y, 6, 2, leaf[3]); R(g, x + 2, y + 2, 5, 1, leaf[1]); } }), horny = tiled(bone[2], bone[0], bone[4]);
    return { bg: '#0a1214', light: ['#ffdcc0', 1.95, '#a8f0d0', 1.3, [-5, 8, -6]], tile: ['#1c2a26', '#21312c', '#436458', '#0c1412', '#30483f', '#101a17'], stud: dim.concat(bone[4]), rune: ['#ff7020', .3],
      sky(g, w, h) { bands(g, w, h, [[0, '#0a1214'], [76, '#0f2a34'], [108, '#0f475d'], [126, '#5a3a30'], [140, lava[1]], [152, lava[2]]]); stars(g, w, 100, 40, ['#6df7b1', '#ffffff']);
        for (const [x, y, cw] of [[352, 90, 56], [372, 102, 84], [346, 114, 64], [384, 124, 44], [130, 124, 80], [474, 130, 60]]) cloud(g, x, y, cw, [rock[2], rock[3], rock[1]]); },                         // 火山口冒出来的烟
      far(g, w, h) { ridge(g, w, h, 112, 24, '#16201e', '#1c2a26', leaf[3], { cap: 6 }); for (let k = 0; k < 50; k++) { const half = 14 + k * 1.5 | 0; R(g, 360 - half, 62 + k, half * 2, 1, (k >> 1) % 2 ? rock[1] : '#261b19'); R(g, 360 - half, 62 + k, 2, 1, rock[3]); } R(g, 348, 60, 24, 3, lava[3]); R(g, 352, 57, 16, 3, lava[4]); // 一座火山，口上烧着，一道岩浆顺坡流下来
        let x = 362; for (let y = 63; y < 112; y += 3) { R(g, x, y, 3, 3, y < 86 ? lava[3] : lava[2]); x += [2, 1, -2, 3, 0, 2][(y / 3 | 0) % 6]; } },
      mid(g, w, h) { ridge(g, w, h, 96, 14, '#0c1a18', '#16302c', leaf[3], { smooth: 1, f: [.035, .095, .2], cap: 4 }); for (let x = 20; x < w; x += ri(50, 90)) { const t = ri(56, 68); R(g, x, t + 6, 3, h, '#0c1a18'); for (const [dx, dy, l] of [[-13, 6, 13], [3, 6, 13], [-10, 2, 10], [3, 2, 10], [-4, -2, 11]]) { R(g, x + dx, t + dy, l, 3, '#16302c'); R(g, x + dx, t + dy, l, 1, leaf[2]); } } }, // 林子上头探出几棵高树
      floor: canvas(128, 128, g => { courses(g, 128, 128, 64, 32, ['#2a1e1c', '#30221f', '#261b19'], '#4a342c', rock[0]); for (const [x, y] of [[20, 30], [84, 62], [50, 94], [110, 126]]) { R(g, x, y, 8, 3, leaf[1]); R(g, x + 2, y - 1, 5, 1, leaf[2]); R(g, x + 5, y + 2, 5, 2, leaf[1]); } }),
      face: faceOf(['#241a18', '#2a1e1b', '#201614'], '#3a2a24', '#0c0808', [rock[2], rock[3], rock[1]], rock[0], (g, x) => { let y = 13; for (let k = 0; k < 8; k++) { R(g, x + k, y, 2, 2, k % 3 ? lava[2] : lava[4]); y += [1, 2, -1, 1, 2, -2, 1, 0][k]; } }),            // 台沿的缝里透出岩浆的光
      edge: edgeOf(bone[2], bone[4], bone[0], stud4(bone[1], bone[0])), lamp: [torch, '#ff8030'],
      fort: { wall, trim: spine, cap: moss, roof: horny, tooth: 'spike', spike: horny, // 对面是一座兽巢：石堆上交叉着两根巨牙，顶上一窝蛋，门脸是一颗头骨
        towers(B, W, s, bz, fz) { B.taper(1.45, 1.3, 1.45, 1, 1, wall, s * .15, 0, fz, undefined, moss); B.taper(1.7, 1.75, 1.7, 1.05, 1.05, wall, s * .1, 0, bz, undefined, moss); return 2.55; },
        deco(B, s, bz, fz, K) { B.card(tusk, 1, s * .1 - .42, 1.2, bz + .5); B.card(tusk, 1, s * .1 + .42, 1.2, bz + .5, { flip: true }); B.card(egg, 1, s * .1, 1.75, bz + .1); B.card(skull, 1, s * .15, 0, fz + .76, { flip: s < 0 }); B.card(K.ban, 2, s * .15, 1.05, fz + .52); B.card(fern, 1, s * .15 - .5, 1.3, fz + .3); } },
      dress(B, strew) { B.card(ribs, 1, 0, 0, -5.1, { shadow: true }); B.card(skull, 1, -5.3, 0, -4.6, { shadow: true }); B.card(egg, 1, 5.4, 0, -4.2, { shadow: true }); B.card(egg, 1, -2.9, 0, -4.5, { shadow: true, flip: true });
        for (const [x, z] of [[-3.4, -6.6], [3.3, -6.4], [-6.4, -5.6], [6.5, -5.2], [-8.2, -4.2], [8.4, -6.2]]) B.card(tusk, 1, x, 0, z, { shadow: true, flip: x > 0 });
        for (let k = 0; k < 12; k++) { const x = (rnd() - .5) * 24, z = Math.abs(x) < 3 ? -3 - rnd() * .5 : -3.2 - rnd() * 3.8; B.lie(crack[k % 2], 1.5, .62, x, .006, z); if (k % 2) B.halo(x, .1, z, '#ff7020', .9, .16); } for (const [x, z] of [[-3.3, -3.4], [3.4, -3.5], [-4.4, -5], [4.5, -5.2], [-1.7, -4], [1.9, -4.1], [-6.2, -3.6], [6.4, -3.8]]) B.card(fern, 1, x, 0, z, { shadow: true, flip: x > 0 }); strew([fern, fern, fern, tusk, egg], 1.5, 9); },
      fore: [fern, '#081010'], motes: { n: 110, vel: [.14, .55, 0], sway: [.12, 2.2], col: ['#ffa939', '#ffe822'], size: .034, add: true, alpha: 1 } };
  },
  // 永冻隘口：极夜。极光挂在天上，冰川、冰棱、压着雪的松树，雪一直下
  f6(A) { const { ice, snow, pine, aura } = F.f6, pale = [ice[1], ice[2], ice[4], snow[3], snow[4]];
    const big = A.add(S.shards(184, 148, pale, [[24, 70, 26], [150, 54, 30], [58, 36, 34], [118, 20, 38], [88, 2, 44], [170, 104, 20], [10, 110, 16]])), small = [A.add(S.shards(56, 72, pale, [[12, 30, 14], [44, 22, 16], [28, 2, 20]])), A.add(S.shards(36, 40, pale, [[9, 16, 10], [26, 10, 12], [18, 2, 12]]))];
    const tree = A.add(S.pine(pine, ['#0a1830', '#1c2a44', '#30446a', '#4a6494'], snow)), drift = A.add(S.mound(snow, 96, 22)), lampC = A.add(S.lamp(pale, lume(aura), 'gem')), icicle = A.add(canvas(64, 20, g => { for (let x = 1; x < 64; x += 5) { const l = 5 + (x * 7) % 13; for (let k = 0; k < l; k++) R(g, x + (k > l * .6 ? 1 : 0), k, k > l * .6 ? 1 : k > l * .3 ? 2 : 3, 1, k % 4 ? snow[2] : snow[4]); } }));
    const wall = brick([ice[2], '#3276b4', '#245e98'], ice[4], ice[0]), frost = strip(snow[2], snow[4], snow[0], ice[3]), snowC = canvas(64, 64, g => { R(g, 0, 0, 64, 64, snow[2]); for (let y = 5; y < 64; y += 11) for (let x = (y % 22 ? 3 : 12); x < 64; x += 19) { R(g, x, y, 7, 1, snow[4]); R(g, x + 3, y + 1, 6, 1, snow[1]); } }), facet = tiled(ice[4], ice[1], snow[4]);
    return { bg: '#050814', light: ['#c4dcff', 2.3, '#d8f0ff', 1.6, [-6, 8, -6.5]], tile: ['#1a2c4a', '#203454', '#4878a8', '#0c1626', '#305480', '#101c30'], stud: pale, rune: ['#00fff0', .2],
      sky(g, w, h) { bands(g, w, h, [[0, '#050814'], [80, '#0a1430'], [116, '#0c2a5a'], [140, ice[1]], [152, '#1a5a98']]); stars(g, w, 136, 130, ['#ffffff', aura[3], snow[1]]);
        for (const [c, y0, amp, ph, len] of [[aura.slice(0, 4), 138, 8, 0, 46], [['#3d3a70', '#62507e', '#a096d1', '#e0d8ff'], 122, 7, 2.2, 34], [aura.slice(0, 4), 108, 6, 4, 26]]) for (let x = 0; x < w; x++) { // 极光：一道道竖条的光帘，底边亮，往上用抖点散掉
          const y = Math.round(y0 + amp * Math.sin(x * .017 + ph) + 3 * Math.sin(x * .06 + ph)), l = Math.round(len * (.55 + .45 * Math.sin(x * .13 + ph) * Math.sin(x * .031))); for (let k = 0; k < l; k++) if (k < 3 || dith(x, y - k) < 1 - k / l) R(g, x, y - k, 1, 1, c[k < 3 ? 3 : k < 9 ? 2 : k < l * .6 ? 1 : 0]); } },
      far(g, w, h) { ridge(g, w, h, 112, 48, '#0f3a6a', snow[1], snow[3], { cap: 12 }); },                                                                                // 冰川：尖峰，顶上压着雪
      mid(g, w, h) { ridge(g, w, h, 96, 16, '#0c2a50', ice[2], snow[2], { step: 4, cap: 4 }); for (let x = 14; x < w; x += ri(36, 64)) { const t = ri(60, 72); R(g, x, t + 16, 3, h, pine[0]); for (let k = 0; k < 4; k++) { R(g, x - 3 - k * 2, t + k * 6, 9 + k * 4, 6, pine[0]); R(g, x - 3 - k * 2, t + k * 6, 6 + k * 3, 2, snow[1]); } } },
      floor: canvas(128, 128, g => { R(g, 0, 0, 128, 128, '#46669a'); for (let y = 5; y < 128; y += 10) for (let x = (y % 20 < 10 ? 4 : 34); x < 128; x += 64) { R(g, x, y, 22, 1, '#5a7cb0'); R(g, x + 6, y + 1, 26, 1, '#3a5888'); R(g, x + 12, y - 1, 8, 1, '#7a98c4'); R(g, x + 40, y - 3, 1, 1, snow[4]); } for (const [x, y] of [[20, 44], [84, 108]]) { R(g, x, y, 22, 6, '#2c4a7c'); R(g, x + 3, y + 1, 9, 1, ice[4]); R(g, x + 14, y + 3, 5, 1, ice[3]); } }), // 雪地：几道风纹，露出两块冰面
      face: faceOf(['#1c4a80', '#205288', '#184276'], '#3a78b8', '#0a1c3a', [snow[2], snow[4], snow[1]], '#0c2a50', (g, x) => { for (const [dx, l] of [[0, 9], [3, 5], [6, 11]]) for (let k = 0; k < l; k++) R(g, x + dx, 11 + k, k > l * .5 ? 1 : 2, 1, k % 3 ? snow[2] : snow[4]); }), // 台沿上挂着冰凌
      edge: edgeOf(ice[2], ice[4], ice[0], stud4(snow[1], snow[4])), lamp: [lampC, '#00fff0'],
      fort: { wall, trim: frost, cap: snowC, roof: facet, // 对面是一座冰砌的城：墙头积雪，两座塔上各立一根冰锥
        towers(B, W, s, bz, fz) { B.taper(1.25, 1.2, 1.25, .95, .95, wall, s * .15, 0, fz, undefined, snowC); B.taper(.9, 1, .9, 0, 0, facet, s * .15, 1.2, fz); B.taper(1.45, 1.5, 1.45, 1.1, 1.1, wall, s * .1, 0, bz, undefined, snowC); B.taper(1, 1.2, 1, 0, 0, facet, s * .1, 1.5, bz);
          for (const dx of [-.42, .42]) for (const dz of [-.42, .42]) B.taper(.26, .6, .26, 0, 0, facet, s * .1 + dx, 1.5, bz + dz); return 2.7; },
        deco(B, s, bz, fz, K) { B.card(icicle, 1, s * .15, .92, fz + .66); B.card(K.ban, 2, s * .15, .0, fz + .68); B.card(small[1], 1, s * .15 - .55, 0, fz + .75); } },
      dress(B, strew) { B.card(big, 1, 0, 0, -5.2, { shadow: true }); B.halo(0, 1, -5.15, '#00b9ff', 1.6, .16); for (const [x, z, k] of [[-2.6, -4.8, 0], [2.7, -5, 0], [-1.2, -4.4, 1], [1.4, -4.3, 1], [-6, -4.4, 0], [6.2, -4.8, 0]]) B.card(small[k], 1, x, 0, z, { shadow: true, flip: x > 0 });
        for (const [x, z] of [[-4.6, -6.2], [4.8, -6.4], [-5.6, -4.9], [5.8, -5.5], [-7.4, -6.6], [7.6, -4.2], [-3.3, -6.8], [3.6, -5.8]]) B.card(tree, 1, x, 0, z, { shadow: true }); for (let k = 0; k < 10; k++) B.card(drift, 1, (rnd() - .5) * 22, 0, -3.3 - rnd() * 3.8, { flip: rnd() < .5 }); strew([tree, tree, small[0], small[1], drift], 1.8, 8); },
      fore: [small[0], '#0a1a34'], motes: { n: 150, vel: [-.42, -.6, .1], sway: [.2, 1.2], col: ['#fcfcfc', '#c3cbdb'], size: .04, alpha: 1 } };
  },
};

// ---------- 换场地：拆掉上一套（几何体、材质、贴图全部释放），按键搭新的一套。幂等：同一个场地重复调用什么都不做 ----------
let set = null, themeKey = null, driftT = null, driftV = 0, moteN = 0, arena = null;
function theme(key = 'n') {
  if (arenaMod) { // 自定义擂台：只搭一次。常驻的东西照旧（格子还是那 20 块、两座城堡的组还在原位，挨打下沉照动），它自己换格子的贴图、往城堡的组里搭自己的门、管自己的灯和飘的东西
    if (arena) return; themeKey = 'arena-' + Q.get('arena'); castles[0].body.visible = false; moteN = 0; moteGeo.setDrawRange(0, 0);
    arena = arenaMod.build({ THREE, scene, camera, renderer, amb, sun, tiles, lines, castles: castles.map(c => c.g), post: { bloom, tiltH, tiltV, grade }, low, calm, team: TEAM.map(t => t.hex),
      grid: { ROWS, COLS, LX, LZ, HALF, DEPTH, HPY, SHORT, tileX, tileZ } }); return; }
  if (!THEMES[key]) key = 'n'; if (key === themeKey) return; themeKey = key;
  if (set) scrap(set); if (castles[1].body) scrap(castles[1].body); driftT = null; seed = 131 + key.charCodeAt(key.length - 1) * 977;
  const A = Atlas(), K = { win: A.add(windowC[1]), ban: A.add(bannerC[1]), mat: A.add(matC[1]) }, th = THEMES[key](A), cache = new Map(), B = Batch(); set = new THREE.Group(); scene.add(set);
  scene.background.set(th.bg); amb.color.set(th.light[0]); amb.intensity = th.light[1]; sun.color.set(th.light[2]); sun.intensity = th.light[3]; sun.position.set(...th.light[4]);
  // 远景：天空 → 远山 → 中景，三条横幅画在同一张图上，立在舞台后面。32 像素一格（角色像素的 2 倍），一张只够 16 格宽，所以左右各镜像接一张
  const back = canvas(512, 512, () => {}), bg = back.getContext('2d'); let by = 0;
  [[th.sky, 160, -2, -13], [th.far, 112, -1.5, -11.5], [th.mid, 96, -.8, -9.6]].forEach(([paint, h, y, z]) => { bg.save(); bg.translate(0, by); bg.beginPath(); bg.rect(0, 0, 512, h); bg.clip(); paint(bg, 512, h); bg.restore(); for (const k of [-1, 0, 1]) B.card({ c: back, x: 0, y: by, w: 512, h }, 2, k * 16, y, z, { flip: !!k }); by += h + 2; });
  // 舞台：一整块石台，前沿是台沿和嵌饰带；棋盘前后各一道镶边，后沿一排灯柱
  B.box(30, 2.4, DEPTH / 2 + 8.2, th.face, 0, -1.2, DEPTH / 4 - 3.3, undefined, th.floor); // 后沿固定在 z = -7.4，前沿比棋盘多出 0.8
  for (const s of [-1, 1]) B.box(ROWS * LX + .9, .09, .22, th.edge, 0, .045, s * (DEPTH / 2 + .14));
  for (let r = 1; r < ROWS; r++) { const x = r * LX - HALF; B.card(th.lamp[0], 1, x, 0, -DEPTH / 2 - .34, { shadow: true }); B.halo(x, .98, -DEPTH / 2 - .32, th.lamp[1], .42, .4); }
  for (let x = -14.5; x <= 14.5; x += 1) B.halo(x, -.27, DEPTH / 2 + .86, th.rune[0], .4, th.rune[1]);                                               // 台沿嵌饰上的一点光
  const pool = [], strew = (items, step, far = 13.4) => { pool.push(...items); for (let x = -far; x <= far; x += step + rnd() * step * .7) { if ((Math.abs(x) > HALF + .1 && Math.abs(x) < HALF + 2.7) || Math.abs(x) < HALF - .4) continue; B.card(pick(items), 1, x, 0, -DEPTH / 2 - .9 - rnd() * 4, { shadow: true, flip: rnd() < .5 }); } }; // 两侧随手撒的道具；棋盘正后方留给各场地自己摆
  th.dress(B, strew);
  if (SHORT && pool.length) { const small = pool.filter(it => it.h <= 80), near = small.length ? small : pool; // 手机上镜头贴得近，棋盘后面那几排道具大半出画：用这个场地自己的道具围着两座城堡再摆一圈——外侧一列，外侧墙角两件矮的
    for (const s of [-1, 1]) { for (let z = .3 - DEPTH / 2; z <= DEPTH / 2 - .1; z += 1.1 + rnd() * .5) B.card(pick(pool), 1, s * (HALF + 3.2 + rnd() * .6), 0, z, { shadow: true, flip: s > 0 });
      for (const x of [2.35, 2.95]) B.card(pick(near), 1, s * (HALF + x + rnd() * .2), 0, DEPTH / 2 + .45 + rnd() * .2, { shadow: true, flip: rnd() < .5 }); } } // 城墙脚下只放在外侧墙角：正面挂着阵营旗，不能挡
  for (const s of [-1, 1]) B.card(th.fore[0], 4, s * (HALF + 4.4), -2.4, 3.8, { color: th.fore[1], flip: s > 0 });                         // 前景两角压暗的剪影，把画面框住
  B.build(set, cache);
  if (th.drift) { const [c, v, op, quads] = th.drift, p = [], u = []; driftT = Object.assign(new THREE.CanvasTexture(c), { colorSpace: THREE.SRGBColorSpace, magFilter: THREE.NearestFilter, minFilter: THREE.NearestFilter, generateMipmaps: false, wrapS: THREE.RepeatWrapping }); driftV = v; // 贴着地面飘的一带东西（雾、流沙、暗影）：几张横幅，贴图横着滚
    for (const [x, y, z, w, h, rep] of quads) { p.push(x - w / 2, y, z, x + w / 2, y, z, x + w / 2, y + h, z, x - w / 2, y, z, x + w / 2, y + h, z, x - w / 2, y + h, z); u.push(0, 0, rep, 0, rep, 1, 0, 0, rep, 1, 0, 1); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(u, 2)); const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: driftT, transparent: true, opacity: op, depthWrite: false })); m.renderOrder = 1; set.add(m); }
  raise(1, th.fort, { ...K, lamp: th.lamp[0], glow: th.lamp[1] }, cache);
  for (const k in tileSkin) { const [team, alt] = k.split('|').map(Number), m = tileSkin[k], old = m.map; m.map = Object.assign(new THREE.CanvasTexture(tileC(team, alt, th.tile, th.stud)), { colorSpace: THREE.SRGBColorSpace, magFilter: THREE.NearestFilter, anisotropy: low ? 2 : 8 }); m.needsUpdate = true; if (old) old.dispose(); }
  const mo = th.motes, U = moteM.uniforms; moteN = mo.n; moteGeo.setDrawRange(0, Math.round(moteN * (low ? .4 : 1))); U.vel.value.set(...mo.vel); U.sway.value.set(...mo.sway); U.colA.value.set(mo.col[0]); U.colB.value.set(mo.col[1]); U.size.value = mo.size; U.alpha.value = mo.alpha; U.shape.value.set(...(mo.shape || [1, 1])); moteM.blending = mo.add ? THREE.AdditiveBlending : THREE.NormalBlending;
}
// ---------- 角色：像素立牌，按原图颜色显示；待机、走、出手、挨打、倒下都用原图的帧 ----------
const PX = 1 / 64, ANIMS = ['idle', 'run', 'attack', 'hit', 'death'], sheets = {};
function preload(types) { // 把要用到的角色帧图先全部载入；顺带取回这些角色所属阵营（和首领）要用的像素特效
  if (!calm) warm(idsFor([...new Set(types.map(t => CARDS[t]?.faction || 'n').concat('n'))], types.filter(t => BOSS[t])));
  return Promise.all([...new Set(types)].filter(t => GFX[t] && !sheets[t]).flatMap(type => {
    const g = GFX[type], s = sheets[type] = { geo: new THREE.PlaneGeometry(1, 1).translate(0, g.feet / g.cell - .5, 0), tex: {}, n: {} };
    return (g.cast ? [...ANIMS, 'cast'] : ANIMS).map(a => new Promise((res, rej) => { const img = new Image(); // 有施法帧的首领多一条 cast
      img.onload = () => { const t = new THREE.Texture(img); t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.colorSpace = THREE.SRGBColorSpace; s.n[a] = Math.max(1, Math.round(img.width / g.cell)); t.repeat.set(1 / s.n[a], 1); t.needsUpdate = true; s.tex[a] = t; res(); };
      img.onerror = rej; img.src = `assets/units/${g.file}_${a}.png`; }));
  }));
}
let now = 0, speed = 1, hold = 0, fxT = 0; const tweens = [], units = new Map(), dying = new Set(); // dying：正在倒下的（已经不算在场，但倒下帧还要接着播） // now 是补间时钟：慢放（?timer=0.25）、加速（board.speed）、命中定格（hold）都只动这一只钟
// 全局节奏表：和 motion.css 的 --t-1…--t-read、--e-out / --e-in / --e-io 一一对应。不用回弹和弹性
const TIME = { t1: .1, t2: .2, t3: .3, t4: .5, read: .7 }, eOut = k => 1 - (1 - k) ** 3, eIn = k => k * k * k;
const tween = (dur, fn) => new Promise(res => tweens.push({ t0: now, dur, fn, res }));       // 一段随时间推进的动画；结束时兑现
const ease = k => k * k * (3 - 2 * k); // 就是 --e-io：起步和停下都有
const spot = t => new THREE.Vector3(tileX(Math.floor(t / COLS)), .065, tileZ(t % COLS)); // 格子中心
function setAnim(u, name, loop = false) {
  const sh = sheets[u.card], tex = u.tex[name] ||= Object.assign(sh.tex[name].clone(), { needsUpdate: true }), n = sh.n[name];
  u.anim = { name, loop, n, t0: now, fps: name === 'idle' ? 10 : name === 'run' ? 14 : name === 'attack' ? n / .46 : name === 'death' ? n / (isBoss(u.card) ? 1.3 : .55) : name === 'cast' ? n / .6 : 14 }; if (name === 'idle' && u.rage) u.anim.fps = 15; // 首领倒下放慢；发怒后待机加快
  u.mat.map = u.depth.map = tex; tex.offset.x = 0;
}
function float(text, color, at, rise = .7, big = 1) { // 冒出来的字：数字用像素字形。先分三格缩到位、停一下给人读，再上飘淡出
  const px = isPx(text), w = px ? text.length * 6 + 1 : 128, h = px ? 9 : 64, sx = (px ? w * .055 : .9) * big, sy = (px ? .5 : .45) * big;
  const c = canvas(w, h, g => { if (px) return pxText(g, text, w / 2, 4.5, 1, color); g.font = 'bold 40px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 8; g.lineJoin = 'bevel'; g.strokeStyle = P.ink; g.strokeText(text, 64, 34); g.fillStyle = color; g.fillText(text, 64, 34); });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; if (px) { t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; }
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true })); sp.scale.set(sx, sy, 1); sp.renderOrder = 11; sp.position.copy(at); scene.add(sp);
  const done = () => { scene.remove(sp); t.dispose(); sp.material.dispose(); };
  if (calm) return void later(.4, done);                                                    // 减少动效：直接出现，停够读的时间就走
  tween(TIME.t1, k => { const s = 1.6 - .6 * Math.ceil(k * 3) / 3; sp.scale.set(sx * s, sy * s, 1); }) // 走三格：1.4 → 1.2 → 1
    .then(() => later(.25)).then(() => tween(TIME.t3, k => { sp.position.y = at.y + rise * .5 * eOut(k); sp.material.opacity = 1 - k * k; })).then(done);
}
function pop(u, text, color, big, dx = 0) { // 单位头上冒字：0.3 秒内接连冒的往上错开，受伤和中毒的数字不会叠在一起；dx 让对撞双方的数字各往自己一侧让开
  u.stack = now - (u.popT ?? -9) < .3 ? u.stack + 1 : 0; u.popT = now; const p = u.grp.position.clone().setY(1.05 + u.stack * .3); p.x += dx; float(text, color, p, .7, big);
}
const setStr = (u, str) => { u.power.userData.set(String(str)); if (!calm) tween(TIME.t2, k => { const s = 1 + .35 * (1 - eOut(k)); u.power.scale.set(.4 * s, .24 * s, 1); }); }; // 战力变了：牌子顶一下再落回
const ringGeo = new THREE.RingGeometry(.3, .36, 28), blobGeo = new THREE.CircleGeometry(.3, 20), markGeo = new THREE.PlaneGeometry(.93, LZ - .09);
// 可放的格子：四个像素角标加一层很淡的底（put）；指向敌人的法术是四边向内的准星（aim）——形状不同，不只是颜色不同
const markT = Object.fromEntries(['put', 'aim'].map(shape => [shape, T(canvas(32, 38, g => { R(g, 0, 0, 32, 38, 'rgba(255,255,255,.2)');
  if (shape === 'put') for (const [x, y, sx, sy] of [[1, 1, 1, 1], [31, 1, -1, 1], [1, 37, 1, -1], [31, 37, -1, -1]]) { R(g, x, y, 9 * sx, 2 * sy, '#fff'); R(g, x, y, 2 * sx, 9 * sy, '#fff'); }
  else { R(g, 15, 1, 2, 9, '#fff'); R(g, 15, 28, 2, 9, '#fff'); R(g, 1, 18, 9, 2, '#fff'); R(g, 22, 18, 9, 2, '#fff'); R(g, 1, 1, 4, 2, '#fff'); R(g, 27, 1, 4, 2, '#fff'); R(g, 1, 35, 4, 2, '#fff'); R(g, 27, 35, 4, 2, '#fff'); } }))]));
const marks = tiles.map(t => { const m = new THREE.Mesh(markGeo, new THREE.MeshBasicMaterial({ map: markT.put, color: 0xffffff, transparent: true, opacity: 0, depthWrite: false })); m.rotation.x = -Math.PI / 2; m.position.set(t.position.x, .068, t.position.z); m.visible = false; scene.add(m); return m; });
const arrowLayer = new THREE.Group(), pathLayer = new THREE.Group(), tagLayer = new THREE.Group(); scene.add(arrowLayer, pathLayer, tagLayer);
const dashT = T(canvas(16, 4, g => R(g, 0, 0, 10, 4, '#fff')));                          // 意图箭头身上的短划，在 loop() 里顺着方向流
function arrow(layer, a, b, color, wide, flow) { // 贴在棋盘上的箭头：从 a 指向 b。flow：身上是流动的短划，表示“将要发生”而不是“已经发生”
  const d = new THREE.Vector3().subVectors(b, a), len = d.length(); if (len < .01) return; d.normalize();
  const s0 = a.clone().addScaledVector(d, .3), s1 = b.clone().addScaledVector(d, -.34), n = new THREE.Vector3(-d.z, 0, d.x), w = (wide ? .09 : .055) * (flow ? 1.9 : 1.2), hw = w + .13, run = s0.distanceTo(s1) * 3;
  const tip = s1.clone().addScaledVector(d, .22), v = [s0.clone().addScaledVector(n, w), s0.clone().addScaledVector(n, -w), s1.clone().addScaledVector(n, -w), s1.clone().addScaledVector(n, w), s1.clone().addScaledVector(n, hw), s1.clone().addScaledVector(n, -hw), tip];
  const mesh = (pts, uv, map) => { const g = new THREE.BufferGeometry().setFromPoints(pts); if (uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, map: map || null, transparent: true, opacity: wide ? .95 : .8, side: THREE.DoubleSide, depthWrite: false })); m.position.y = .1; m.userData.o = m.material.opacity; layer.add(m); };
  mesh([v[0], v[1], v[2], v[0], v[2], v[3]], [0, 0, 0, 1, run, 1, 0, 0, run, 1, run, 0], flow && !calm ? dashT : null); mesh([v[4], v[5], v[6]]);
}
const wipe = layer => { for (const m of [...layer.children]) { layer.remove(m); m.geometry?.dispose(); if (m.isSprite) m.material.map.dispose(); m.material.dispose(); } };
function tag(text, color, pos, big = 1) { // 预演和意图用的结果标签：一串像素数字；text 传 'dead' 就画一个骷髅（会倒下）
  const dead = text === 'dead', w = dead ? 9 : text.length * 6 + 1;
  const c = canvas(w, 9, g => dead ? [[0, 1], [2, 1], [1, 0], [1, 2], [1, 1]].forEach(([x, y], i) => bits(g, SKULL, x, y, 1, i < 4 ? P.ink : color)) : pxText(g, text, w / 2, 4.5, 1, color));
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true })); sp.scale.set(w * .05 * big, .45 * big, 1); sp.renderOrder = 12; sp.position.copy(pos); return sp;
}
let threat = null, ghost = null;                                                          // 我方城堡上“下回合要掉几点”的牌子；预演时放在格子上的半透明虚影
const gate = (side, t) => new THREE.Vector3((side ? -1 : 1) * (HALF + .75), .065, tileZ(t % COLS)); // side 这一方的兵从格子 t 走进对方城门的位置
const handlers = { tile: null, hover: null };

// ---------- 特效：全部用发光的贴片和补间拼出来，按阵营配色 ----------
const EL = { f1: [0xf8c030, 0xfff4a0], f2: [0xf04860, 0xffd8c8], f3: [0xf09030, 0xffe8a0], f4: [0x8a50d8, 0xf0b0ff], f5: [0x40d890, 0xfff4a0], f6: [0x00c8e8, 0xc8ffff], n: [0xa8b8e0, 0xffffff] }; // [主色, 最亮处]
const fxLayer = new THREE.Group(); scene.add(fxLayer);
const beamT = new THREE.CanvasTexture(canvas(64, 32, g => { const v = g.createLinearGradient(0, 0, 0, 32); v.addColorStop(0, 'rgba(255,255,255,0)'); v.addColorStop(.5, 'rgba(255,255,255,1)'); v.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = v; g.fillRect(0, 0, 64, 32); }));
const pillarT = new THREE.CanvasTexture(canvas(32, 128, g => { const v = g.createLinearGradient(0, 0, 0, 128); v.addColorStop(0, 'rgba(255,255,255,0)'); v.addColorStop(.75, 'rgba(255,255,255,.75)'); v.addColorStop(1, 'rgba(255,255,255,1)'); g.fillStyle = v; g.fillRect(0, 0, 32, 128);
  g.globalCompositeOperation = 'destination-in'; const h = g.createLinearGradient(0, 0, 32, 0); h.addColorStop(0, 'rgba(0,0,0,0)'); h.addColorStop(.5, 'rgba(0,0,0,1)'); h.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = h; g.fillRect(0, 0, 32, 128); }));
const slashT = new THREE.CanvasTexture(canvas(64, 64, g => { g.lineCap = 'round'; for (const [w, a] of [[9, .35], [5, .7], [2, 1]]) { g.strokeStyle = `rgba(255,255,255,${a})`; g.lineWidth = w; g.beginPath(); g.arc(20, 44, 30, -1.35, .15); g.stroke(); } }));
const bubbleT = new THREE.CanvasTexture(canvas(64, 64, g => { g.strokeStyle = 'rgba(255,255,255,.95)'; g.lineWidth = 3; g.beginPath(); g.arc(32, 32, 27, 0, 7); g.stroke(); const r = g.createRadialGradient(32, 32, 10, 32, 32, 28); r.addColorStop(0, 'rgba(255,255,255,0)'); r.addColorStop(1, 'rgba(255,255,255,.3)'); g.fillStyle = r; g.beginPath(); g.arc(32, 32, 27, 0, 7); g.fill(); g.fillStyle = 'rgba(255,255,255,.9)'; g.fillRect(18, 16, 8, 3); g.fillRect(16, 19, 3, 6); }));
const creepC = canvas(32, 32, g => { for (let i = 0; i < 46; i++) { const a = i * .55, r = 2 + i * .3; R(g, Math.round(16 + Math.cos(a) * r), Math.round(16 + Math.sin(a) * r * .9), 2, 2, i % 3 ? '#8a50d8' : '#c0a0f0'); } for (const [x, y] of [[4, 6], [26, 5], [5, 25], [27, 26], [15, 3], [3, 16], [28, 15], [16, 28]]) R(g, x, y, 2, 2, '#682090'); });
const at = (p, y = .5) => typeof p === 'number' ? spot(p).setY(y) : new THREE.Vector3((p.base ? 1 : -1) * (HALF + 1.3), 1.7, 0); // 格子，或某一方的城堡
const later = (delay, fn) => tween(delay, () => {}).then(fn);
// 像素特效（board-pfx.js）。px() 播得出来返回句柄，播不出来（模块还没取回、开了减少动效）返回 null，调用的地方接着用下面这些老特效
const fxp = createPfx(THREE, fxLayer, 1 / 44), floor = v => new THREE.Vector3(v.x, .07, v.z), pickEl = (t, e) => (t && !Array.isArray(t) && typeof t === 'object' && ('n' in t || 'f1' in t) ? t[e] || t.n : t);
function px(r, pts, dir = 1, extra) { if (calm || !r) return null; const id = typeof r === 'string' ? r : r[0], o = typeof r === 'string' ? {} : r[1]; if (!fxp.ready(r)) { warm([id]); return null; }
  if (o.after) { later(o.after, () => px([id, { ...o, after: 0 }], pts, dir, extra)); return true; } // after：等前一段特效播完再进场
  return fxp.play(r, [].concat(pts).map(v => { const q = v.clone(); q.x += dir * (o.fwd || 0) * LX; return q; }), { flip: dir < 0, ...extra }); }
const strike = v => { const d = v.clone().project(camera); return d; }; // 一个位置在屏幕上的方位（给飞行的特效定朝向）
function fly(shot, a, b, dur = .26, arc = .5) { // 一发飞过去的像素特效：朝飞的方向摆正，到了就收。播不出来返回 null
  const dir = Math.sign(b.x - a.x) || 1, h = px(shot, [a], dir, { raw: true }); if (!h) return null; const sp = h.sprites[0], pa = strike(a), pb = strike(b), asp = renderer.domElement.clientWidth / Math.max(1, renderer.domElement.clientHeight);
  h.mat.rotation = Math.atan2(pb.y - pa.y, (pb.x - pa.x) * asp) - (dir < 0 ? Math.PI : 0); 
  return tween(dur, k => { sp.position.lerpVectors(a, b, k); sp.position.y += Math.sin(k * Math.PI) * arc; }).then(() => h.kill()); }
// 场地上常驻的像素小东西（火盆、鬼火、飞鸟……每个场地一套，见 board-pfx.js 的 AMBIENT）：会被前面的人和城堡挡住，跟着场景自己的钟走；低画质档和减少动效时不放
const scenery = createPfx(THREE, scene, 1 / 44); let sceneryKey = '';
function ambient() { const key = themeKey + (low ? '-' : '+'); if (key === sceneryKey) return; sceneryKey = key; scenery.clear(); const list = AMBIENT[themeKey]; if (calm || low || !list) return;
  warm(list.map(a => (typeof a[0] === 'string' ? a[0] : a[0][0]))).then(() => { if (key !== sceneryKey) return; scenery.clear(); list.forEach(([r, fx, y, z, k = 1], i) => scenery.play(r, [new THREE.Vector3(fx * (HALF + 2.2), y + .07, z)], { depth: true, every: 2, raw: true, seed: i + 1, s: k * (typeof r === 'string' ? 1 : r[1].s || 1) })); }); }
function beamTo(R, a, b) { // 一道光束：起点对在 a，朝 b 摆正，拉到刚好够到 b（都按屏幕上的方位算，所以横着扫一路、竖着扫一排都对得上）。播不出来返回 null
  const dir = Math.sign(b.x - a.x) || 1, h = px(R, [a], dir); if (!h) return null; const sp = h.sprites[0], o = R[1], pa = strike(a), pb = strike(b), pr = strike(a.clone().add(new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion))), asp = renderer.domElement.clientWidth / Math.max(1, renderer.domElement.clientHeight);
  const want = Math.hypot((pb.x - pa.x) * asp, pb.y - pa.y) / (Math.hypot((pr.x - pa.x) * asp, pr.y - pa.y) || 1) + .35, has = o.len * (o.s || 1) / 44; // want：a 到 b 在这个远近上相当于几格宽（多伸出一点）；has：光束本来画了几格长
  h.mat.rotation = Math.atan2(pb.y - pa.y, (pb.x - pa.x) * asp) - (dir < 0 ? Math.PI : 0); sp.scale.x *= Math.max(.5, want / has); return h; }
let blow = null; // 最近一次出手：谁（哪张牌、哪一方）打向哪一格里的谁。hurt() 靠它决定刀光用哪个阵营的
const drop = o => { fxLayer.remove(o); if (o.isMesh) o.geometry.dispose(); };
let quake = 0;
const orbM = new THREE.SpriteMaterial({ map: softT, color: 0xff3828, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }); orbM.userData.keep = true; // 所有红光球共用一份材质，不跟着棋子销毁
function spark(color, size, opacity = 1, map = softT) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map, color, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, transparent: true, opacity })); s.scale.setScalar(size); s.renderOrder = 8; fxLayer.add(s); return s; }
function wave(p, color, reach = .75, dur = .32) { // 贴着地面扩开的一圈
  const m = new THREE.Mesh(new THREE.RingGeometry(.84, 1, 36), new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })); m.rotation.x = -Math.PI / 2; m.position.set(p.x, .1, p.z); fxLayer.add(m);
  tween(dur, k => { m.scale.setScalar(.12 + reach * ease(k)); m.material.opacity = 1 - k; }).then(() => drop(m));
}
function burst(p, color, hot, power = 1) { // 命中：一闪、一圈、几颗火星
  const f = spark(hot, .5 * power); f.position.copy(p); tween(.22, k => { f.scale.setScalar((.5 + 1.3 * k) * power); f.material.opacity = 1 - k; }).then(() => drop(f));
  wave(p, color, .62 * power);
  for (let i = 0; i < 7; i++) { const s = spark(i % 2 ? hot : color, .13), a = i / 7 * Math.PI * 2 + p.x * 3, vx = Math.cos(a) * .9 * power, vy = (.9 + (i % 3) * .4) * power, vz = Math.sin(a) * .5 * power; s.position.copy(p);
    tween(.4, k => { s.position.set(p.x + vx * k, p.y + vy * k - 1.7 * k * k, p.z + vz * k); s.material.opacity = 1 - k; }).then(() => drop(s)); }
}
function bolt(a, b, color, hot, dur = .26, arc = .7) { // 飞过去的光弹，带一串拖尾，到了就炸开
  const head = spark(hot, .34), core = spark(color, .75, .6); let last = -1;
  return tween(dur, k => { const p = new THREE.Vector3().lerpVectors(a, b, k); p.y += Math.sin(k * Math.PI) * arc; head.position.copy(p); core.position.copy(p);
    const n = Math.floor(k * 10); if (n !== last) { last = n; const t = spark(color, .3, .7); t.position.copy(p); tween(.24, q => { t.scale.setScalar(.3 * (1 - q)); t.material.opacity = .7 * (1 - q); }).then(() => drop(t)); } })
    .then(() => { drop(head); drop(core); burst(b, color, hot); });
}
function ray(a, b, color, hot) { // 一道光束
  const d = new THREE.Vector3().subVectors(b, a), len = d.length() + .5, mk = (col, w, o) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(len, w), new THREE.MeshBasicMaterial({ map: beamT, color: col, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, side: THREE.DoubleSide })); m.position.copy(a).addScaledVector(d, .5); m.rotation.y = -Math.atan2(d.z, d.x); m.renderOrder = 8; fxLayer.add(m); return m; };
  const outer = mk(color, .7, .9), inner = mk(hot, .26, 1);
  tween(.34, k => { const s = k < .2 ? k / .2 : 1 - (k - .2) / .8; outer.scale.y = inner.scale.y = Math.max(.02, s); outer.material.opacity = .9 * s; inner.material.opacity = s; }).then(() => { drop(outer); drop(inner); });
}
function slash(p, color, hot, power = 1) { // 一道刀光
  const s = spark(hot, 1, 1, slashT), r0 = (p.x * 7 + p.z * 3) % 6; s.position.copy(p); s.renderOrder = 9;
  tween(.2, k => { s.scale.setScalar((.7 + .9 * ease(k)) * power); s.material.rotation = r0 + k * 1.3; s.material.opacity = 1 - k * k; }).then(() => drop(s)); burst(p, color, hot, .55 * power);
}
function shard(p) { // 从地上冒出来的冰晶
  const m = card(fxLayer, crystalC[0], .62, .93, p.x, .07, p.z + .12), g = spark(0x00c8e8, 1.3, .7); g.position.copy(p); m.scale.y = .01;
  tween(.16, k => { m.scale.y = ease(k); }).then(() => tween(.5, k => { m.scale.setScalar(1 - ease(k) * .99); g.material.opacity = .7 * (1 - k); })).then(() => { drop(m); drop(g); });
  wave(p, 0xa8fff8, .5);
}
function pillar(p, color, hot, tall = 1.9) { // 一道升起来的光柱，带几点上飘的光
  const m = new THREE.Mesh(new THREE.PlaneGeometry(.62, tall).translate(0, tall / 2, 0), new THREE.MeshBasicMaterial({ map: pillarT, color: hot, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false })); m.position.set(p.x, .06, p.z); m.renderOrder = 8; fxLayer.add(m);
  tween(.5, k => { m.scale.set(1 + k * .5, .2 + ease(k), 1); m.material.opacity = 1 - k * k; }).then(() => drop(m)); wave(p, color, .5);
  for (let i = 0; i < 6; i++) { const s = spark(i % 2 ? hot : color, .12), dx = (i - 2.5) * .11; s.position.set(p.x + dx, .2, p.z); tween(.6, k => { s.position.y = .2 + k * (1.1 + i * .12); s.material.opacity = 1 - k; }).then(() => drop(s)); }
}
function portal(p, color, hot) { // 召唤：地上转开一个圈，中间冒一股光
  const m = new THREE.Mesh(new THREE.RingGeometry(.2, .44, 6), new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })); m.rotation.x = -Math.PI / 2; m.position.set(p.x, .1, p.z); fxLayer.add(m);
  tween(.4, k => { m.rotation.z = k * 3; m.scale.setScalar(.4 + ease(k)); m.material.opacity = 1 - k * k; }).then(() => drop(m)); pillar(p, color, hot, 1.2);
}
function gust(a, b, color, hot) { // 一阵风：几道横着掠过去的气流
  const d = Math.sign(b.x - a.x) || 1;
  for (let i = 0; i < 5; i++) { const s = spark(i % 2 ? hot : color, 1, 0, beamT), z = b.z + (i - 2) * .15, y = .25 + i * .13; s.scale.set(1, .15, 1);
    later(i * .035, () => tween(.3, k => { s.position.set(b.x - d * (1 - 1.8 * k), y, z); s.material.opacity = .85 * Math.sin(k * Math.PI); })).then(() => drop(s)); }
  later(.12, () => wave(b, color, .5));
}
function puff(p, color) { for (let i = 0; i < 6; i++) { const s = spark(color, .5, .6), a = i / 6 * Math.PI * 2; s.position.set(p.x, .25, p.z); tween(.45, k => { s.position.set(p.x + Math.cos(a) * .4 * k, .25 + k * .3, p.z + Math.sin(a) * .3 * k); s.scale.setScalar(.5 + k * .5); s.material.opacity = .6 * (1 - k); }).then(() => drop(s)); } } // 一团散开的烟
const creeps = tiles.map(t => { const m = new THREE.Mesh(new THREE.PlaneGeometry(.9, LZ - .12), new THREE.MeshBasicMaterial({ map: T(creepC), transparent: true, opacity: 0, depthWrite: false })); m.rotation.x = -Math.PI / 2; m.position.set(t.position.x, .066, t.position.z); m.visible = false; scene.add(m); return m; }); // 暗影地格


const free = u => { scene.remove(u.grp); for (const t of Object.values(u.tex)) t.dispose(); for (const sp of [u.power, u.tag, u.gearS]) if (sp) { sp.material.map.dispose(); sp.material.dispose(); } for (const m of [u.mat, u.depth, u.bubble.material, u.grp.children[0].material, u.grp.children[1].material]) m.dispose(); }; // 单位离场：它自己的牌子、材质、贴图一起释放，打久了才不会越积越多
const isBoss = card => card.startsWith('B_'); // 首领牌（chess-cards.js 里 bossUnit 建的那十一张）
// 头顶常驻的小牌子：嘲讽、中毒、活力、被禁用，一眼看得出来。嘲讽在被禁用或冻住时不算数，就不挂
function retag(u) { const txt = (u.taunt && !u.muted && !u.frozen ? '嘲' : '') + (u.poison ? '毒' : '') + (u.vital ? '活' : '') + (u.muted ? '禁' : ''), col = u.poison ? '#70e040' : u.vital ? '#f8e040' : u.muted ? '#9a9aa8' : '#ece4d0';
  if (!txt) { if (u.tag) u.tag.visible = false; } else if (!u.tag) { u.tag = badge(txt, col, .17); u.tag.position.set(0, 1.02, 0); u.grp.add(u.tag); } else { u.tag.userData.set(txt, col); u.tag.visible = true; } }
const tint = u => u.frozen ? 0x8fd8ff : u.poison ? 0xa8f070 : u.muted ? 0x9a9aa8 : u.rage ? 0xffc8b8 : 0xffffff; // 角色身上的状态色：冻住发蓝，中毒发绿，被禁用发灰
// 给 chess-ui.js 用的接口。带动画的都返回一个“演完了”的约定
export const board = {
  preload, cols: COLS, rows: ROWS, T: TIME, calm,
  wait: s => tween(s, () => {}),                 // 界面的等待也走补间时钟，这样慢放、加速、定格对界面和棋盘是同一个倍率
  speed(x) { speed = x; }, rate: () => slow * speed,
  clear() { for (const u of units.values()) free(u); units.clear(); for (const u of dying) free(u); dying.clear(); wipe(arrowLayer); wipe(pathLayer); board.tags([]); board.ghost(null); board.threat(0); board.mark([]); fxp.clear(); blow = null; creeps.forEach(m => { m.visible = false; m.material.opacity = 0; }); castles.forEach(c => { c.g.position.y = 0; }); },
  add({ id, card, side, tile, str, shield }) { // 出场：从半格高处砸下来，落地压扁一下再站直，脚下一圈阵营色的波纹，地格跟着沉一下——让人看见“有东西落在这一格了”
    const g = GFX[card], sh = sheets[card], grp = new THREE.Group(), w = g.cell * PX * (g.scale || 1), big = isBoss(card); grp.position.copy(spot(tile)); // big：首领登场，从高处砸下来，镜头推近，落地重震、两圈波纹、定格一下
    const blob = new THREE.Mesh(blobGeo, new THREE.MeshBasicMaterial({ color: 0x04040c, transparent: true, opacity: .45, depthWrite: false })); blob.rotation.x = -Math.PI / 2; blob.scale.set(1, .62, 1); grp.add(blob);
    const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: TEAM[side].hex, transparent: true, opacity: .95, depthWrite: false })); ring.rotation.x = -Math.PI / 2; ring.position.y = .004; ring.scale.set(big ? 1.6 : 1.15, big ? 1.1 : .8, 1); grp.add(ring);
    const mat = new THREE.MeshBasicMaterial({ alphaTest: .5, side: THREE.DoubleSide }), depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, alphaTest: .5 });
    const spr = new THREE.Mesh(sh.geo, mat); spr.customDepthMaterial = depth; spr.castShadow = true; spr.scale.set(side ? -w : w, w, 1); grp.add(spr); // 左边的人朝右，右边的人朝左
    const power = badge(String(str), TEAM[side].ramp[3], .24); power.position.set(.34, .1, .32); grp.add(power);
    const bubble = new THREE.Sprite(new THREE.SpriteMaterial({ map: bubbleT, color: 0xfff4a0, transparent: true, depthTest: false, blending: THREE.AdditiveBlending })); bubble.scale.setScalar(1.25); bubble.position.y = .5; bubble.visible = !!shield; bubble.renderOrder = 7; grp.add(bubble);
    const u = { id, card, side, grp, spr, mat, depth, power, w, bubble, ring, tex: {}, frozen: false, gen: 0, stack: 0 }; units.set(id, u); setAnim(u, 'idle', true); scene.add(grp); u.taunt = !!CARDS[card]?.taunt; retag(u);
    const sx = side ? -w : w, tl = tiles[tile]; spr.scale.set(sx, w, 1);
    if (calm) { mat.alphaTest = .05; mat.transparent = true; return tween(.12, k => { mat.opacity = k; }).then(() => { mat.alphaTest = .5; mat.transparent = false; }); } // 减少动效：原地淡入
    if (big) tween(TIME.t4 * 2, k => { zoom = 1 - .1 * Math.sin(k * Math.PI); });
    return tween(big ? TIME.t4 : TIME.t2, k => { grp.position.y = .065 + (1 - eIn(k)) * (big ? 3 : .6); }).then(() => {
      wave(spot(tile), TEAM[side].hex, big ? 1.5 : .55, big ? TIME.t4 : TIME.t3); quake = Math.max(quake, big ? .22 : .04);
      px(big ? MISC.bossLand : MISC.land, floor(spot(tile))); if (big) px(BOSS[card]?.enter, floor(spot(tile)), side ? -1 : 1);
      if (big) { wave(spot(tile), 0xfff4a0, .9, TIME.t3); burst(spot(tile).setY(.35), TEAM[side].hex, 0xfff4a0, 1.6); hold = Math.max(hold, .1); }
      tween(TIME.t2, k => { const q = (k < .4 ? k / .4 : 1 - eOut((k - .4) / .6)) * (big ? 1.5 : 1); spr.scale.set(sx * (1 + .15 * q), w * (1 - .2 * q), 1); tl.position.y = tl.userData.base - .03 * q; });
      return later(big ? TIME.t4 : TIME.t1); });
  },
  move(id, to, dur = TIME.t3) { const u = units.get(id); if (!u) return Promise.resolve(); const a = u.grp.position.clone(), b = spot(to), g = ++u.gen; setAnim(u, 'run', true); // 起步和停下都有，途中两个小跳，和跑步帧对上；gen 变了说明别的动作接手了这个单位，旧补间就不再写位置
    return tween(calm ? .12 : dur, k => { if (u.gen !== g) return; u.grp.position.lerpVectors(a, b, calm ? k : ease(k)); if (!calm) u.grp.position.y += Math.abs(Math.sin(k * Math.PI * 2)) * .05; }).then(() => { if (u.gen === g) setAnim(u, 'idle', true); }); },
  shift(id, to) { const u = units.get(id); if (!u) return Promise.resolve(); const a = u.grp.position.clone(), b = spot(to), g = ++u.gen; return tween(TIME.t2, k => { if (u.gen === g) u.grp.position.lerpVectors(a, b, eOut(k)); }); }, // 被拽、被击退
  lunge(id, to) { // 出手四拍：蓄力后缩 → 突进 → 命中（在这一刻兑现，伤害数字从这时开始跳，hurt() 会让画面定格一下）→ 收回
    const u = units.get(id); if (!u) return Promise.resolve(); const a = u.grp.position.clone(), d = spot(to).sub(a), g = ++u.gen, put = f => { if (u.gen === g) u.grp.position.copy(a).addScaledVector(d, f); }; setAnim(u, 'attack');
    const foe = [...units.values()].find(v => v !== u && v.grp.position.distanceToSquared(spot(to)) < .09); blow = { card: u.card, side: u.side, foe: foe?.card, boss: false };
    if (calm) return tween(.12, k => put(.42 * k)).then(() => { tween(.12, k => put(.42 * (1 - k))); });
    const big = isBoss(u.card), back = big ? -.2 : -.08, reach = big ? .62 : .42; // 首领的重击：多一拍蓄力，退得更深、冲得更远，命中时重震并多定格一下
    return tween(big ? TIME.t3 : TIME.t1, k => put(back * eOut(k))).then(() => tween(TIME.t1, k => put(back + (reach - back) * eIn(k)))).then(() => {
      if (big) { quake = Math.max(quake, .16); hold = Math.max(hold, .09); const dir = Math.sign(d.x) || (u.side ? -1 : 1); // 首领重击：全屏的冲击线一闪，再放它自己那一套（有的从身上朝前放，有的落在挨打的人脚下）
        px(MISC.bossHit, floor(spot(to)), dir); blow.boss = (BOSS[u.card]?.hit || []).map(r => px(r, floor(r[1]?.own ? a : spot(to)), dir)).some(Boolean); if (!blow.boss) burst(spot(to).setY(.4), TEAM[u.side].hex, 0xffffff, 1.3); }
      tween(TIME.t2, k => put(reach * (1 - ease(k)))); });
  },
  storm(id, side, tile) { // 走进对方城门
    const u = units.get(id); if (!u) return Promise.resolve(); const a = u.grp.position.clone(), b = gate(side, tile); setAnim(u, 'run', true);
    return tween(TIME.t3, k => u.grp.position.lerpVectors(a, b, calm ? k : eIn(k))); },
  hurt(id, n, str, melee) { const u = units.get(id); if (!u) return; pop(u, '-' + n, '#f06878', n >= 5 ? 1.3 : 1, melee ? (u.side ? .3 : -.3) : 0); setStr(u, str);
    if (melee) { const by = blow && (u.side !== blow.side ? blow.card : blow.foe), dir = u.side ? 1 : -1, r = (MELEE[CARDS[by]?.faction] || MELEE.n)[n >= 5 ? 2 : n >= 3 ? 1 : 0], pos = floor(u.grp.position), mine = blow && u.side !== blow.side && blow.boss; // 首领的重击已经放过它自己那一套，这里不再叠刀光
      if (!mine && !px(r, pos.clone().setX(pos.x - ((typeof r === 'string' ? r : r[0]).startsWith('melee/') ? dir * 1.35 : 0)), dir)) slash(u.grp.position.clone().setY(.5), TEAM[1 - u.side].hex, 0xffffff, .8 + Math.min(.6, n * .06)); // 刀光特效的原点在出手的人脚下，挨打的人在它前面一格多
      if (n >= 6) px(MISC.crit, pos, dir); quake = Math.max(quake, .03 + n * .008); // 近身对撞：一道刀光，镜头抖一下
      if (!calm) { hold = Math.max(hold, Math.min(.12, .05 + .01 * n)); const dir = u.side ? 1 : -1; tween(TIME.t2, k => { u.spr.position.x = dir * .1 * (k < .3 ? k / .3 : 1 - eOut((k - .3) / .7)); }); } } // 命中的一刻定格（伤害越大越久），挨打的往自己城堡那边仰一下
    if (str > 0) setAnim(u, 'hit'); u.mat.color.set(0xff8080); tween(.2, k => { if (k >= 1) u.mat.color.set(tint(u)); }); },
  buff(id, n, str) { const u = units.get(id); if (!u) return; pop(u, '+' + n, '#68f0b0'); setStr(u, str); if (!calm) tween(TIME.t2, k => u.spr.scale.set((u.side ? -u.w : u.w) * (1 + .18 * Math.sin(k * Math.PI)), u.w * (1 + .18 * Math.sin(k * Math.PI)), 1)); },
  die(id) { // 倒下：播倒下帧，然后碎成几块阵营色的小方块往上散（硬边方块，不是柔光点）
    const u = units.get(id); if (!u) return Promise.resolve(); units.delete(id); dying.add(u); ++u.gen; setAnim(u, 'death'); u.power.visible = u.bubble.visible = false; if (u.gearS) u.gearS.visible = false; if (u.tag) u.tag.visible = false; const p = u.grp.position.clone(), col = TEAM[u.side].hex, done = () => { if (dying.delete(u)) free(u); };
    if (isBoss(u.card) && !calm) { // 首领倒下：倒下帧放慢，镜头推近，身上接连炸三下（一下比一下重），最后才散
      tween(1.5, k => { zoom = 1 - .08 * Math.sin(k * Math.PI); });
      (BOSS[u.card]?.die || []).forEach((r, i) => later(.5 + i * .4, () => px(r, floor(p), u.side ? -1 : 1)));
      for (let i = 0; i < 3; i++) later(.15 + i * .35, () => { burst(new THREE.Vector3(p.x + (i - 1) * .22, .35 + i * .18, p.z), col, 0xfff4a0, 1.2 + i * .3); quake = Math.max(quake, .1 + i * .06); if (i === 2) hold = Math.max(hold, .12); });
      return tween(1.5, k => { if (k > .75) { u.mat.opacity = 1 - (k - .75) / .25; u.mat.transparent = true; } }).then(() => { puff(p.clone(), col); wave(p, col, 1.6, TIME.t4); done(); }); }
    if (!px(pickEl(MISC.die, CARDS[u.card]?.faction), floor(p))) puff(p.clone(), col);
    if (!calm) later(.25, () => { for (let i = 0; i < 7; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ color: i % 3 ? TEAM[u.side].hex : 0xece4d0, depthTest: false, transparent: true })), a = i * 2.4 + id, h = .6 + (i % 3) * .25; s.scale.setScalar(.06 + (i % 2) * .03); s.renderOrder = 8; fxLayer.add(s);
      tween(TIME.t4, k => { s.position.set(p.x + Math.cos(a) * .45 * k, .35 + h * eOut(k), p.z + Math.sin(a) * .3 * k); s.material.opacity = 1 - k * k; }).then(() => drop(s)); } });
    return tween(.6, k => { if (k > .55) { u.mat.opacity = 1 - (k - .55) / .45; u.mat.transparent = true; } }).then(done); },
  cast(id) { // 首领施法：原地摆出施法的架势（有施法帧用施法帧，没有就用出手帧），脚下一圈本方颜色的光往里收，出手那一刻一闪、定格
    const u = units.get(id); if (!u) return Promise.resolve(); const p = u.grp.position.clone(), col = TEAM[u.side].hex; ++u.gen; setAnim(u, sheets[u.card].tex.cast ? 'cast' : 'attack');
    if (calm) return later(.12);
    const m = new THREE.Mesh(new THREE.RingGeometry(.84, 1, 36), new THREE.MeshBasicMaterial({ color: col, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })); m.rotation.x = -Math.PI / 2; m.position.set(p.x, .1, p.z); fxLayer.add(m);
    tween(TIME.t4, k => { m.scale.setScalar(1.7 - 1.4 * eIn(k)); m.material.opacity = .15 + .85 * k; }).then(() => drop(m)); (BOSS[u.card]?.cast || []).forEach(r => px(r, floor(p), u.side ? -1 : 1));
    return later(TIME.t4).then(() => { burst(p.clone().setY(.7), col, 0xfff4a0, 1.4); hold = Math.max(hold, .08); quake = Math.max(quake, .08); return later(TIME.t3); }); },
  cheer(cols) { // 通关：棋盘上空接连炸开七朵焰火，颜色是这个场地的（打通无主之地时六个阵营的颜色轮着来）
    if (calm) return Promise.resolve();
    px(MISC.confetti, new THREE.Vector3(0, .07, DEPTH / 2 - .2));
    for (let i = 0; i < 7; i++) later(i * .18, () => { const x = (i % 2 ? 1 : -1) * (.8 + (i * 37 % 5) * .9), z = -1 + (i % 3) * .6, r = MISC.cheer[i % MISC.cheer.length], rocket = (typeof r === 'string' ? r : r[0]).endsWith('rocket'); // 火箭从地上升起来再炸，礼花直接在半空炸
      if (!px(r, new THREE.Vector3(x, rocket ? .07 : 1.6 + (i * 53 % 4) * .4, z), 1, { seed: i + 1 })) burst(new THREE.Vector3(x, 2.2 + (i * 53 % 4) * .45, z), cols[i % cols.length], 0xfff4a0, 1.6 + (i % 3) * .3); quake = Math.max(quake, .05); });
    return later(7 * .18 + .4); },
  rage(side) { // 首领发怒：这一方场上的首领后仰一下，然后涨大一圈，脚下的圈变成火红并一直冒火星，待机动作加快
    let any = false;
    for (const u of units.values()) if (u.side === side && isBoss(u.card) && !u.rage) { any = true; u.rage = true; const p = u.grp.position.clone(), w0 = u.w, sx = u.side ? -1 : 1; u.w *= 1.15; u.ring.material.color.set(0xff5030); setAnim(u, 'hit'); u.mat.color.set(tint(u));
      if (calm) { u.spr.scale.set(sx * u.w, u.w, 1); continue; }
      px(MISC.rage, floor(p)); px(MISC.rage2, floor(p)); burst(p.clone().setY(.5), 0xf84850, 0xfff4a0, 1.8); wave(p, 0xff5030, 1.6, TIME.t4);
      tween(TIME.t4, k => { const w = w0 + (u.w - w0) * eOut(k); u.spr.scale.set(sx * w, w, 1); u.ring.scale.set(1.6 + .4 * eOut(k), 1.1 + .28 * eOut(k), 1); }); }
    if (any && !calm) { quake = Math.max(quake, .3); hold = Math.max(hold, .12); tween(TIME.read, k => { zoom = 1 - .07 * Math.sin(k * Math.PI); }); }
    return later(any ? TIME.t4 : 0); },
  freeze(id, on) { const u = units.get(id); if (!u) return; u.frozen = on; u.mat.color.set(tint(u)); if (on) pop(u, '冻住', '#a8fff8'); retag(u); }, // 冻住的角色待机动画停在第一帧（见 loop）
  base(side, n, hp) { // 城堡掉血或回血：牌子上的数字一格一格跳到位；掉血时定格、重震、城堡抖
    const c = castles[side], from = c.hp; float((n > 0 ? '+' : '') + n, n > 0 ? '#68f0b0' : '#f06878', new THREE.Vector3(c.g.position.x, HPY + .55, .2), .9, 1.6);
    tween(Math.max(.01, Math.min(.4, Math.abs(hp - from) * .04)), k => { const v = Math.round(from + (hp - from) * k); if (v !== c.hp) { c.hp = v; plate(c); } });
    if (n < 0) { quake = Math.max(quake, .16); if (!calm) hold = Math.max(hold, .09); if (!px(MISC.baseHit, new THREE.Vector3(c.g.position.x - (side ? 1 : -1) * .9, .07, .3))) burst(new THREE.Vector3(c.g.position.x - (side ? 1 : -1) * .9, .7, 0), 0xf84850, 0xfff4a0, 1.5); }
    else if (n > 0) px(MISC.baseHeal, new THREE.Vector3(c.g.position.x - (side ? 1 : -1) * .9, .07, .3));
    const x0 = (side ? 1 : -1) * (HALF + 1.3); return tween(TIME.t3, k => { c.g.position.x = x0 + (n < 0 && !calm ? Math.sin(k * 40) * .06 * (1 - k) : 0); }); },
  setBase(side, hp) { const c = castles[side]; if (c.hp !== hp) { c.hp = hp; plate(c); } },
  ruin(side) { // 城堡被攻破：下沉、抖、扬尘，给结算一点分量
    const c = castles[side], x0 = c.g.position.x; quake = Math.max(quake, .2); px(MISC.ruin, new THREE.Vector3(x0 - (side ? 1 : -1) * .6, .07, .2)); later(.25, () => px(MISC.ruin2, new THREE.Vector3(x0 - (side ? 1 : -1) * .3, .07, -1.2))); for (let i = 0; i < 4; i++) later(i * .15, () => puff(new THREE.Vector3(x0 + (i - 1.5) * .4, 0, (i % 2 - .5) * 2), 0x8e98b8));
    return tween(TIME.read, k => { c.g.position.y = -.5 * (calm ? k : eIn(k)); if (!calm) c.g.position.x = x0 + Math.sin(k * 60) * .04 * (1 - k); }); },
  front(side, depth) { // 前线：这一方能出兵的最远一行。位置变了就滑过去，不跳
    const m = lines[side], x = side ? tileX(ROWS - 1 - depth) - LX / 2 : tileX(depth) + LX / 2, x0 = m.position.x; if (Math.abs(x - x0) < .01 || m.userData.to === x) return; m.userData.to = x;
    tween(calm ? .01 : TIME.t2, k => { if (m.userData.to === x) m.position.x = x0 + (x - x0) * eOut(k); }); },
  mark(list, color = 0x68f0b0, shape = 'put') { // 把能放的格子标出来：从自己城堡一侧向前逐列亮起，之后慢慢呼吸（见 loop）
    marks.forEach((m, t) => { const on = list.includes(t); if (on && !m.visible) m.userData.t0 = now + Math.floor(t / COLS) * .025; m.visible = on; m.material.color.set(color); m.material.map = markT[shape]; }); },
  intents(list, n = 0, lethal = false) { // 对面下回合要做什么：加粗、带流动短划的箭头；n 是这些箭头加起来要打掉我方城堡几点
    wipe(arrowLayer); for (const e of list) arrow(arrowLayer, spot(e.from), e.to === 'base' ? gate(e.side, e.from) : spot(e.to), e.kind === 'move' ? TEAM[e.side].hex : 0xf8e040, e.kind !== 'move', true); board.threat(n, lethal); },
  dim(on) { for (const m of arrowLayer.children) m.material.opacity = on ? .22 : m.userData.o; },                // 选中手牌时意图箭头让位给预演
  threat(n, lethal = false) { // 我方城堡血量牌下面挂“−n”并慢闪；够攻破的话血量牌的边也变绯红
    if (threat) { scene.remove(threat); threat.material.map.dispose(); threat.material.dispose(); threat = null; }
    const c = castles[0]; if (c.alarm !== lethal) { c.alarm = lethal; plate(c); }
    if (n > 0) { threat = tag('-' + n, '#f06878', new THREE.Vector3(c.g.position.x, 1.66, .2), 1.3); scene.add(threat); } },
  path(list) { wipe(pathLayer); for (const e of list) arrow(pathLayer, spot(e.from), e.to === 'base' ? gate(e.side, e.from) : spot(e.to), 0xece4d0, e.kind !== 'move'); },        // 这张牌打下去会怎么走
  tags(list) { // 预演的结果直接标在场上：{ tile 或 base: 哪一方, text: '-3' / '+2' / 'dead', color }
    wipe(tagLayer); const seen = {}; for (const e of list) { const key = e.tile ?? 'b' + e.base, k = seen[key] = (seen[key] ?? -1) + 1; tagLayer.add(tag(e.text, e.color, e.tile !== undefined ? spot(e.tile).setY(1.2 + k * .42) : new THREE.Vector3((e.base ? 1 : -1) * (HALF + 1.3), HPY - .54 - k * .42, .2), e.base !== undefined ? 1.3 : 1)); } },
  ghost(card, side, tile) { // 预演：这张牌放下去会站在这里（半透明的虚影）
    if (ghost) { scene.remove(ghost); ghost.material.dispose(); ghost = null; } const sh = card && sheets[card]; if (!sh) return;
    const w = GFX[card].cell * PX * (GFX[card].scale || 1); ghost = new THREE.Mesh(sh.geo, new THREE.MeshBasicMaterial({ map: sh.tex.idle, transparent: true, opacity: .5, alphaTest: .05, side: THREE.DoubleSide, depthWrite: false }));
    ghost.scale.set(side ? -w : w, w, 1); ghost.position.copy(spot(tile)); ghost.renderOrder = 6; scene.add(ghost); },
  point(t) { hot = t >= 0 ? tiles[t] : null; if (handlers.hover) handlers.hover(t, null); },                         // 键盘选格子：和鼠标悬停走同一条路
  intro() { if (!calm) tween(TIME.read, k => { zoom = 1 + .14 * (1 - eOut(k)); }); },                                  // 进对局：镜头从稍远处推到位
  fx(e) { // 一次能力或法术的特效；兑现的时刻就是“打中了”的时刻，伤害数字从这时开始跳
    const [color, hot] = EL[e.el] || EL.n, from = at(e.from), ts = (e.to || []).map(x => at(x)); if (!ts.length) return Promise.resolve();
    // 先试像素特效（board-pfx.js 的 KIND 表）；这一种没配、或者模块还没取回，就落到下面的老特效。等待的时长两边一样，节奏不变
    const R = pickEl(KIND[e.k], e.el), fl = ts.map(floor), dirTo = b => Math.sign(b.x - from.x) || 1, d0 = dirTo(ts[0]);
    if (R && !calm) switch (e.k) {
      case 'bolt': { const fs = ts.map(b => fly(R.shot, from, b)); if (fs.every(Boolean)) return Promise.all(fs.map((f, i) => f.then(() => { if (!px(R.hit, fl[i], dirTo(ts[i]))) burst(ts[i], color, hot); }))); break; }
      case 'drain': { const fs = ts.map(b => fly(R.shot, b, from, .3)); if (fs.every(Boolean)) { px(R.src, fl, -d0); return Promise.all(fs).then(() => { px(R.hit, floor(from), d0); }); } break; }
      case 'nova': if (px(R.src, e.from.base !== undefined ? fl[0] : floor(from), d0)) { /* 从城堡放的范围法术：圈炸在第一个目标脚下，不炸在城堡上 */ later(.1, () => { if (!px(R.hit, fl, d0)) ts.forEach(b => burst(b, color, hot)); }); return later(.16, () => {}); } break;
      case 'beam': { const far = ts.reduce((a, b) => a.distanceTo(from) > b.distanceTo(from) ? a : b), a = from.clone().setY(.5); if (e.from.base !== undefined) a.z = far.z * .5; // 从城堡放的：起点往目标那一路靠一靠
        if (beamTo(R, a, far)) { later(.07, () => { if (!px(pickEl(KIND.beamHit, e.el), fl, d0)) ts.forEach(b => burst(b, color, hot)); }); return later(.12, () => {}); } break; }
      case 'slash': if (px(R, fl.map(v => v.setX(v.x - d0 * 1.35)), d0)) return later(.1, () => {}); break;
      default: if (px(R, fl, d0)) return later({ swords: 1.25, storm: .2 + ts.length * .05, frost: .16, venom: .14, gust: .22, bless: .2, heal: .2, summon: .18, shade: .14, creep: .14, thorn: .1 }[e.k] || .14, () => {});
    }
    switch (e.k) {
      case 'bolt': return Promise.all(ts.map(b => bolt(from, b, color, hot)));
      case 'drain': ts.forEach(b => { for (let i = 1; i < 5; i++) later(i * .05, () => bolt(from, b, color, hot, .28, .5 + i * .2)); }); return bolt(from, ts[0], color, hot, .28, .5);
      case 'storm': ts.forEach((b, i) => later(i * .05, () => bolt(b.clone().add(new THREE.Vector3(-1.3, 4.2, -.5)), b, color, hot, .2, 0))); return later(.2 + ts.length * .05, () => {});
      case 'beam': ray(from, ts.reduce((a, b) => a.distanceTo(from) > b.distanceTo(from) ? a : b), color, hot); ts.forEach(b => later(.07, () => burst(b, color, hot))); return later(.12, () => {});
      case 'nova': wave(from, hot, 1.5, .36); wave(from, color, 1.1, .3); ts.forEach(b => later(.1, () => burst(b, color, hot))); return later(.16, () => {});
      case 'slash': ts.forEach(b => slash(b, color, hot)); return later(.1, () => {});
      case 'thorn': ts.forEach(b => slash(b, 0x40d890, 0xd8ffd0, .8)); return later(.1, () => {});
      case 'frost': ts.forEach(b => shard(b)); return later(.16, () => {});
      case 'venom': ts.forEach(b => puff(b, 0x70e040)); return later(.14, () => {});
      case 'gust': ts.forEach(b => gust(from, b, color, hot)); return later(.22, () => {});
      case 'bless': ts.forEach(b => pillar(b.setY(.06), color, hot)); return later(.2, () => {});
      case 'heal': ts.forEach(b => pillar(new THREE.Vector3(b.x, .06, b.z), 0x40d890, 0xd8ffd0, 2.6)); return later(.2, () => {});
      case 'summon': ts.forEach(b => portal(b, color, hot)); return later(.18, () => {});
      case 'shade': case 'creep': ts.forEach(b => puff(b, 0x8a50d8)); return later(.14, () => {});
    }
    return Promise.resolve();
  },
  shield(id, on) { const u = units.get(id); if (!u) return; if (on) { u.bubble.visible = true; u.bubble.material.opacity = 1; u.bubble.scale.setScalar(1.25); px(MISC.shieldOn, floor(u.grp.position)); } else { pop(u, '圣盾', '#fff4a0'); px(MISC.shieldOff, floor(u.grp.position), u.side ? -1 : 1); tween(TIME.t2, k => { u.bubble.scale.setScalar(1.25 + k * .9); u.bubble.material.opacity = 1 - k; }).then(() => { u.bubble.visible = false; }); } }, // 圣盾：一个罩子，被打破时胀开消失
  creep(tile, side) { const m = creeps[tile]; if (side < 0) { tween(.3, k => { m.material.opacity = .85 * (1 - k); if (k >= 1) m.visible = false; }); return; } m.visible = true; // side < 0：暗影到期，散掉
    m.material.color.set(side ? 0xff9ad0 : 0xb8a0ff); tween(.3, k => { m.material.opacity = .85 * k; }); },                    // 暗影地格
  async morph({ id, card, side, tile, str, shield }) { const u = units.get(id); if (u) { units.delete(id); free(u); } if (!px(MISC.hatch, floor(spot(tile)))) burst(spot(tile).setY(.5), TEAM[side].hex, 0xffffff, 1.3); await board.add({ id, card, side, tile, str, shield }); }, // 蛋孵出来
  status(id, what) { // 中毒或被禁用：飘一行字，身上换个颜色；被禁用的连装备图标一起摘掉
    const u = units.get(id); if (!u) return; if (what === 'poison') { u.poison = true; u.vital = false; } else if (what === 'vital') { u.vital = true; u.poison = false; } else { u.muted = true; if (u.gearS) { u.grp.remove(u.gearS); u.gearS = null; } }
    px(MISC[what], floor(u.grp.position)); pop(u, { poison: '中毒', vital: '活力', mute: '禁用' }[what], { poison: '#a8f070', vital: '#fff4a0', mute: '#c8c8d8' }[what]); u.mat.color.set(tint(u));
    retag(u); },
  pfx: (r, tile, dir = 1, extra) => px(r, floor(typeof tile === 'number' ? spot(tile) : tile), dir, extra), pfxN: () => fxp.count(), // 自动测试和调特效用：在某一格直接放一个
  say(id, text, color = '#fff4a0') { const u = units.get(id); if (u) pop(u, text, color); }, // 在一个单位头上冒一行字（嘲讽把人拽过去的时候用）
  orbs(id, n) { // 背后的小红光球：一颗代表攒了一张法术（四风法师）。从下往上排在背后，比人靠后一点，被人挡住一部分
    const u = units.get(id); if (!u) return; u.orbs ||= []; while (u.orbs.length > n) u.grp.remove(u.orbs.pop());
    while (u.orbs.length < n) { const i = u.orbs.length, s = new THREE.Sprite(orbM); s.position.set((u.side ? 1 : -1) * (.3 + .05 * (i % 2)), .2 + .2 * i, -.06); s.renderOrder = 6; u.grp.add(s); u.orbs.push(s); tween(TIME.t3, k => s.scale.setScalar(.2 * (1 + .9 * Math.sin(k * Math.PI)))); } },
  gear(id, card) { // 装备：在战力牌子的另一侧挂一个小图标
    const u = units.get(id); if (!u) return; if (u.gearS) u.grp.remove(u.gearS);
    const tex = new THREE.TextureLoader().load(`assets/icons/${card}.png`); tex.magFilter = tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false; tex.colorSpace = THREE.SRGBColorSpace;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false })); s.scale.setScalar(.36); s.position.set(-.36, .14, .32); s.renderOrder = 7; u.grp.add(s); u.gearS = s; if (CARDS[card]?.taunt) { u.taunt = true; retag(u); } // 装备带来的嘲讽也挂牌子
    px(MISC.gear, floor(u.grp.position)); pop(u, '装备', '#fff4a0'); tween(TIME.t3, k => s.scale.setScalar(.36 * (1 + .8 * Math.sin(k * Math.PI)))); },
  screen(p) { // 一个格子（或 { base: 哪一方 } 的城堡）在页面上的像素位置，给界面做“牌从手里飞到格子”这类动画用
    const v = at(p, .45).project(camera), r = renderer.domElement.getBoundingClientRect(); return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height }; },
  note(text, color, side) { float(text, color, new THREE.Vector3((side ? 1 : -1) * (HALF + 1.3), HPY + .9, .2), .7); },
  onTile(fn) { handlers.tile = fn; }, onHover(fn) { handlers.hover = fn; },
  theme: k => { theme(k); ambient(); }, quality: q => { const r = quality(q); ambient(); return r; }, resize: () => resize(),        // 换场地（七套：f1…f6、n）；画质档位 'low' / 'high'；版式变了可以叫场景重新取景
  stats: () => ({ theme: themeKey, quality: quality(), calls: frame.calls, tris: frame.tris, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures, objects: (n => { scene.traverse(() => n++); return n; })(0) }), // 自测用：一帧画了几次、内存里有多少几何体和贴图
};

// ---------- 鼠标：悬停和点击格子，交给 chess-ui.js 处理 ----------
const caster = new THREE.Raycaster(), ptr = new THREE.Vector2();
let hot = null, mx = 0;
function aim(e) {
  const b = renderer.domElement.getBoundingClientRect(); if (!b.width || !b.height || !isFinite(e.clientX)) return; // 画布还没排好版就来了鼠标事件：不处理，否则除以零会把镜头位置算成无效值，整个画面变黑
  ptr.set((e.clientX - b.left) / b.width * 2 - 1, -(e.clientY - b.top) / b.height * 2 + 1); mx = ptr.x;
  caster.setFromCamera(ptr, camera);
  const hit = caster.intersectObjects(tiles, false)[0], was = hot;
  hot = hit ? hit.object : null; renderer.domElement.style.cursor = hot ? 'pointer' : 'default';
  if (hot !== was && handlers.hover) handlers.hover(hot ? hot.userData.r * COLS + hot.userData.c : -1, e);
}
renderer.domElement.addEventListener('pointermove', aim);
renderer.domElement.addEventListener('pointerleave', e => { if (hot && handlers.hover) handlers.hover(-1, e); hot = null; mx = 0; });
renderer.domElement.addEventListener('click', e => { aim(e); if (hot && handlers.tile) handlers.tile(hot.userData.r * COLS + hot.userData.c); });

// ---------- 后期（只在高画质档走）：只给最亮的地方加一小圈光 → 移轴虚化（棋盘清楚，远景和最前景虚）→ 暗角。不调色 ----------
const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 }));
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(4, 4), .22, .5, .9); composer.addPass(bloom);
const VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }';
const tiltShader = { uniforms: { tDiffuse: { value: null }, dir: { value: new THREE.Vector2() }, focus: { value: .47 }, band: { value: .28 }, amt: { value: 1 } }, vertexShader: VERT,
  fragmentShader: `uniform sampler2D tDiffuse; uniform vec2 dir; uniform float focus, band, amt; varying vec2 vUv;
    void main(){ float d = smoothstep(band, band + .25, abs(vUv.y - focus)) * amt; vec4 c = vec4(0.); float w = 0.;
      for (int i = -5; i <= 5; i++) { float k = exp(-float(i * i) / 10.); c += texture2D(tDiffuse, vUv + dir * d * float(i)) * k; w += k; }
      gl_FragColor = c / w; }` };
const tiltH = new ShaderPass(tiltShader), tiltV = new ShaderPass(tiltShader); composer.addPass(tiltH); composer.addPass(tiltV);
composer.addPass(new ShaderPass({ uniforms: { tDiffuse: { value: null } }, vertexShader: VERT,
  fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv;
    void main(){ vec3 c = texture2D(tDiffuse, vUv).rgb; vec2 q = vUv - .5; c *= 1. - pow(dot(q, q), 1.2) * 1.5; gl_FragColor = vec4(c, 1.); }` }));
// 调色：平时关着（七个场地不调色）；自定义擂台打开它，定自己的饱和度、反差、暗部和四角往哪个颜色偏，亮过 knee 的部分压成一条软的肩
const grade = new ShaderPass({ uniforms: { tDiffuse: { value: null }, sat: { value: 1 }, con: { value: 1 }, knee: { value: .8 }, gain: { value: new THREE.Color(1, 1, 1) }, lift: { value: new THREE.Color(0, 0, 0) }, edge: { value: new THREE.Color(0, 0, 0) } }, vertexShader: VERT,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float sat, con, knee; uniform vec3 gain, lift, edge; varying vec2 vUv;
    void main(){ vec3 c = texture2D(tDiffuse, vUv).rgb * gain; c += lift * (1. - min(c, 1.)); float l = dot(c, vec3(.2126, .7152, .0722)); c = max(mix(vec3(l), c, sat), 0.);
      c = max((c - .18) * con + .18, 0.); vec2 q = vUv - .5; c += edge * pow(dot(q, q), 1.2); vec3 o = max(c - knee, 0.); c = min(c, knee) + o / (1. + o / (1. - knee)); gl_FragColor = vec4(c, 1.); }` });
grade.enabled = false; composer.addPass(grade);
composer.addPass(new OutputPass());

// ---------- 尺寸与循环 ----------
let dist = 20;
let zoom = 1;                                    // 进对局时镜头从稍远处推进来（board.intro）
function place(px) { const d = dist * zoom; camera.position.set(LOOK.x + px, LOOK.y + d * Math.sin(PITCH), LOOK.z + d * Math.cos(PITCH)); camera.lookAt(LOOK.x + px, LOOK.y, LOOK.z); }
const TAN = 2 * Math.tan(FOV * Math.PI / 360), TOP = new THREE.Vector3(0, 3.2, -DEPTH / 2 + .35), FOOT = new THREE.Vector3(0, .07, tileZ(COLS - 1) + LZ / 2), TAG = new THREE.Vector3(0, HPY + .3, .2), v3 = new THREE.Vector3(); // TOP：城堡最高的塔尖；FOOT：最靠近镜头那一路的底边；TAG：城堡血量牌的上沿
const handZone = () => parseFloat(getComputedStyle(stage).getPropertyValue('--hand-zone')) || 136; // 手牌探进舞台底部多高：版式在 #stage3d 上用 --hand-zone（px）告诉我们，读不到就按桌面版的 136
const skyZone = () => parseFloat(getComputedStyle(stage).getPropertyValue('--sky')) || 0; // 矮屏幕（手机横屏）用 --sky 说“顶上这么高是按钮和提示”：这时只保证血量牌以下进画面，塔尖出画，换棋盘大一圈
let zone = 136;
function resize() {
  const w = stage.clientWidth, h = stage.clientHeight; if (!w || !h) return; zone = handZone();
  const pr = Math.min(devicePixelRatio, low ? 1.5 : 2), z0 = zoom; zoom = 1;
  renderer.setPixelRatio(pr); renderer.setSize(w, h, false); if (!low) { composer.setPixelRatio(pr); composer.setSize(w, h); }
  camera.aspect = w / h; camera.updateProjectionMatrix(); camera.clearViewOffset();
  const row = p => { place(0); camera.updateMatrixWorld(true); camera.matrixWorldInverse.copy(camera.matrixWorld).invert(); return (1 - v3.copy(p).project(camera).y) / 2 * h; }; // 场景里的一个点落在画面的第几行
  const sky = skyZone(), cs = sky ? getComputedStyle(stage) : null, pad = cs ? (parseFloat(cs.scrollMarginLeft) || 0) + (parseFloat(cs.scrollMarginRight) || 0) : 0; // 矮屏幕：左右各让出刘海那一截（版式用 scroll-margin 把安全区的宽度告诉我们，这个属性本身不起别的作用）
  dist = Math.max((ROWS * LX + (sky ? 6.6 : 5.8)) / (camera.aspect * (1 - pad / w)), sky ? 3 : 6.2) / TAN; // 先退到两座城堡左右都在画面里。矮屏幕不设“最近”的下限，能贴多近由下面的竖向那一步定
  // 再看竖向：从塔尖到最下面一路的底边，要整个装进“手牌以上”的那一截（手机横屏又矮又宽，卡的是这个）；装不下就再退远。一格小到 40 像素就不再退——再小手指点不准，宁可让塔尖出画
  const room = h - zone - (sky || 6), span = row(FOOT) - row(sky ? TAG : TOP); if (span > room) dist = Math.max(dist, Math.min(dist * span / room, h / (40 * TAN)));
  const slack = sky ? Math.max(0, room - (row(FOOT) - row(TAG))) : 0, up = Math.max(0, Math.round(row(FOOT) - (h - zone) + slack / 2)); if (up) camera.setViewOffset(w, h, 0, up, w, h); // 最下面一路还被手牌盖着：把整个画面上移到刚好露出来。矮屏幕竖向有富余时（卡的是宽度）再往上挪一半富余：棋盘离手牌远一点，不挤
  zoom = z0; tiltH.uniforms.dir.value.set(1.3 / w, 0); tiltV.uniforms.dir.value.set(0, 1.3 / h); moteM.uniforms.px.value = h * pr / TAN; place(0);
}
function quality(q) { // 画质档位：不带参数是查询；'low' / 'high' 是切换
  if (q !== 'low' && q !== 'high') return low ? 'low' : 'high'; low = q === 'low';
  sun.shadow.mapSize.setScalar(low ? 1024 : 2048); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
  moteGeo.setDrawRange(0, Math.round(moteN * (low ? .4 : 1))); resize(); return q;
}
const arenaMod = ARENA ? await import(ARENA).catch(e => (console.error('自定义擂台没载入，改用原来的场地', e), null)) : null;
new ResizeObserver(resize).observe(stage); theme(Q.get('theme') || 'n'); ambient(); resize();   // 没人调用 board.theme 时就是无主之地；地址带 ?theme=f3 可以直接看某一套（测试用）

let last = -1, pan = 0, air = 0, tick = 0; const frame = { calls: 0, tris: 0 };
function loop(stamp) {
  const raw = last < 0 ? 0 : (stamp - last) / 1000, dt = raw * speed; last = stamp; if (hold > 0) hold -= dt; else now += dt; const t = now; // 定格期间时钟不走：补间、角色换帧、等待一起停
  for (let i = tweens.length - 1; i >= 0; i--) { const w = tweens[i], k = Math.min(1, (t - w.t0) / w.dur); w.fn(k); if (k >= 1) { tweens.splice(i, 1); w.res(); } }
  fxp.tick(t - fxT); fxT = t; // 像素特效跟着对局的钟走：命中定格时一起停，加速时一起快
  for (const u of [...units.values(), ...dying]) { // 每个角色按自己当前的动作换帧；一次性的动作播完回到待机，倒下停在最后一帧
    const a = u.anim; let f = Math.floor((t - a.t0) * a.fps);
    if (u.frozen && a.name === 'idle') f = 0; else if (a.loop) f %= a.n; else if (f >= a.n) { if (a.name === 'death') f = a.n - 1; else { setAnim(u, 'idle', true); f = 0; } }
    u.mat.map.offset.x = f / u.anim.n; u.spr.quaternion.copy(camera.quaternion);
  }
  if (!calm) { // 减少动态效果时这一段整个不走：镜头不晃，光不闪，飘的东西停在原地
    if (!low) for (const u of units.values()) if (u.rage && air - (u.ember || 0) > .22) { u.ember = air; const e = spark(0xff7040, .1, .9), x = u.grp.position.x + Math.sin(air * 7 + u.id) * .3, z = u.grp.position.z + .05; // 发怒的首领脚下一直冒火星（低画质档不冒）
      tween(.7, k => { e.position.set(x, .12 + k * .9, z); e.material.opacity = .9 * (1 - k); e.scale.setScalar(.1 * (1 - .5 * k)); }).then(() => drop(e)); }
    air += Math.min(raw, .1); scenery.tick(Math.min(raw, .1));                                                                // 场景自己的钟，不跟着加速和定格走：雪不会因为打中一下就停住
    pan += (mx * .3 - pan) * .05; place(pan + (Math.random() - .5) * quake); quake *= .86;   // 镜头只做很小的左右平移；被打中时抖一下
    glowM.opacity = .88 + Math.sin(air * 2.2) * .12; for (const g of gems) { g.rotation.y = air * .9; g.position.y = g.userData.y + Math.sin(air * 1.5 + g.position.x) * .04; }
    moteM.uniforms.t.value = air; if (driftT) driftT.offset.x = air * driftV; if (arena) arena.tick(air, Math.min(raw, .1));
  }
  lines.forEach((m, i) => { m.material.opacity = calm ? .8 : .6 + Math.sin(t * 2.4 + i * 2) * .3; });
  for (const m of marks) if (m.visible) m.material.opacity = Math.min(1, Math.max(0, (t - m.userData.t0) / .16)) * (calm ? .85 : .72 + .24 * Math.sin(t * 5.2)); // 可放的格子逐列亮起，然后 1.2 秒一个来回慢慢呼吸
  dashT.offset.x = -t * 1.8;                                                                 // 意图箭头的短划顺着方向流，每秒 0.6 格
  if (threat) threat.visible = calm || t % 1 < .7; if (ghost) ghost.quaternion.copy(camera.quaternion);
  for (const c of castles) c.label.material.color.set(c.hp <= 3 && !calm && t % 1 < .5 ? 0xff9090 : 0xffffff); // 城堡血量见底：牌子慢闪
  cursor.visible = !!hot; if (hot) cursor.position.set(hot.position.x, hot.position.y + .035, hot.position.z);
  if (++tick % 30 === 0 && handZone() !== zone) resize();                                    // 版式改了手牌高度：跟着重新取景
  renderer.info.reset(); if (low) renderer.render(scene, camera); else composer.render(); frame.calls = renderer.info.render.calls; frame.tris = renderer.info.render.triangles;
  raf(loop);
}
// 地址后面加 ?timer 就改用定时器驱动画面：窗口不在前台时浏览器会停掉逐帧回调，自动测试要靠它
const slow = +Q.get('timer') || 1; // ?timer=0.25 还会把动画放慢到四分之一速，方便截图看特效
const raf = Q.has('timer') ? fn => setTimeout(() => fn(performance.now() * slow), 16) : fn => requestAnimationFrame(fn);
raf(loop);
