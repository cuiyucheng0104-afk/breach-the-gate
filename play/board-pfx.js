// 像素特效：vendor/pixelfx（MIT）里的两百多个特效，现算现播，不存图。
// 这个文件两样东西：一张“什么场合用哪个特效”的对照表，和一个把特效画到小画布、贴到棋盘上的播放器。
// 特效模块按需载入；还没载到就返回 null，board3d.js 那边会退回原来用光点拼的老特效，所以这里出任何问题都不会卡住对局。
// 表里的名字改了就跑 node tools/chess_check.mjs：它会核对每个名字在 vendor/pixelfx/fx 里都有文件。

// 一条配方：'特效名'，或 ['特效名', { s 放大倍数, at 从第几秒播起（跳过前摇）, rate 播放速度, pal 换一套颜色, lift 抬高几格（原点在画布中间的特效本来就会自动抬到半身高）, life 播几秒后收掉（循环的特效必须给）, fwd 沿出手方向挪几格, still 不跟着出手方向翻面, c 把画布里的哪一点对到位置上（不写就是特效自己的原点） }]
const PAL = { f1: 'holy', f2: 'blood', f3: 'gold', f4: 'arcane', f5: 'poison', f6: 'ice' }; // 阵营 → 特效库自带的色带名；中立用特效本来的颜色
const el = (id, o = {}) => Object.fromEntries(['f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'n'].map(k => [k, [id, PAL[k] ? { pal: PAL[k], ...o } : o]])); // 同一个特效，六个阵营各染一套色

// 能力和法术（chess.js 发出来的 fx 事件）：种类 → 阵营 → 配方。shot 是飞在路上的那一下，hit 是落点，src 是出手的人脚下
export const KIND = {
  bolt: { // 一发飞过去的东西
    f1: { shot: ['projectiles/plasma-shot', { pal: 'holy' }], hit: ['impacts/crit-hit', { s: .7 }] },
    f2: { shot: ['projectiles/energy-disc', { pal: 'blood' }], hit: 'impacts/hit-spark' },
    f3: { shot: ['projectiles/laser-bolt', { pal: 'gold' }], hit: 'impacts/bullet-impact' },
    f4: { shot: ['projectiles/plasma-shot', { pal: 'arcane' }], hit: ['explosions/plasma-explosion', { s: .55 }] },
    f5: { shot: ['projectiles/plasma-shot', { pal: 'poison' }], hit: ['nature/acid-splash', { at: .28, s: .8 }] },
    f6: { shot: 'ice/ice-lance', hit: ['ice/snowflake-burst', { at: .1, s: .9 }] },
    n: { shot: 'fire/fireball', hit: ['arcane/mana-burst', { at: .2, s: .6, pal: 'fire' }] },
  },
  drain: { shot: ['projectiles/plasma-shot', { pal: 'blood', s: .7 }], hit: ['pickups/collect-burst', { pal: 'blood', s: .8, lift: .3 }], src: ['impacts/hit-spark', { pal: 'blood' }] }, // 吸血：从被吸的人身上飞回来
  storm: { f1: ['holy/smite', { at: .5 }], f2: ['arcane/star-fall', { at: .35, pal: 'blood', s: .7 }], f3: ['arcane/star-fall', { at: .35, pal: 'gold', s: .7 }], f4: ['nature/poison-cloud', { life: 1, s: .5 }], f5: ['nature/spore-burst', { at: .8, s: .8 }], f6: ['ice/icicle-fall', { at: .85 }], n: ['lightning/lightning-strike', { at: .5 }] },
  beam: { ...el('arcane/arcane-beam', { c: [26, 60], len: 205, life: .45 }), f2: ['fire/flamethrower', { c: [30, 60], len: 137, life: .45 }], f5: ['water/water-jet', { pal: 'poison', c: [14, 33], len: 165, life: .45 }], f6: ['ice/frost-breath', { c: [12, 50], len: 136, life: .45 }] }, // 一道扫过去的光束：c 是光束在画布里的起点，len 是它画了多长（像素），棋盘那边按这两个数把它对准、拉到够长
  beamHit: { ...el('impacts/hit-spark'), f6: ['ice/snowflake-burst', { at: .1, s: .7 }], n: 'lightning/zap-hit' },
  nova: { // 以出手的人为中心炸开一圈
    f1: { src: ['arcane/mana-burst', { at: .2, pal: 'holy' }], hit: ['impacts/hit-spark', { pal: 'holy' }] },
    f2: { src: ['fire/fire-ring', { at: .3, pal: 'blood', rate: 1.6 }], hit: 'impacts/hit-spark' },
    f3: { src: ['nature/quake', { at: .45, rate: 1.4 }], hit: 'impacts/blunt-hit' },
    f4: { src: ['explosions/implosion', { pal: 'arcane' }], hit: ['explosions/plasma-explosion', { s: .45 }] },
    f5: { src: ['impacts/ground-slam', { s: .8 }], hit: 'impacts/blunt-hit' },
    f6: { src: ['ice/frost-nova', { at: .4, rate: 1.5, s: .8 }], hit: ['ice/snowflake-burst', { at: .1, s: .7 }] },
    n: { src: ['arcane/mana-burst', { at: .2 }], hit: 'impacts/hit-spark' },
  },
  swords: 'melee/wanjian', // 万剑归宗（李俊昊同归于尽）：一步翻盘自己画的特效
  slash: { f1: ['melee/double-slash', { pal: 'holy' }], f2: 'melee/dagger-flurry', f3: ['melee/thrust', { pal: 'gold' }], f4: 'melee/scythe-reap', f5: 'melee/claw-swipe', f6: 'melee/sword-slash', n: ['melee/sword-slash', { pal: 'metal' }] },
  thorn: ['nature/thorns', { at: .3, s: .6, fwd: -.5 }],
  frost: ['ice/snowflake-burst', { at: .1 }],
  venom: ['nature/toxic-puddle', { s: .6, life: 1 }],
  gust: ['nature/tornado', { s: .6, life: .9, pal: 'dust' }],
  bless: { f1: ['holy/blessing', { life: .9 }], f2: ['arcane/rune-circle', { pal: 'blood', life: 1, s: .8 }], f3: ['holy/sunburst', { pal: 'gold', life: .9, s: .5, lift: .9 }], f4: ['shadow/shadow-flames', { life: 1 }], f5: ['nature/leaf-storm', { life: 1 }], f6: ['ice/ice-crystal', { life: 1, lift: .3 }], n: ['arcane/rune-circle', { life: 1, s: .8 }] },
  heal: ['holy/heal-aoe', { at: .4, s: .55, rate: 1.3 }],
  summon: { f1: ['arcane/magic-circle-cast', { at: 1.3, s: .6, pal: 'holy' }], f2: ['explosions/smoke-bomb', { at: 1.3, s: .5, rate: 1.6 }], f3: ['explosions/dirt-explosion', { at: .15, s: .45, rate: 1.4 }], f4: ['spawn/spawn-portal', { at: .1, s: .7, rate: 1.6 }], f5: ['spawn/poof', { pal: 'leaf' }], f6: ['ice/snowflake-burst', { at: .1 }], n: 'spawn/poof' },
  shade: ['shadow/shadow-tendrils', { at: .1, s: .6, rate: 1.5 }],
  creep: ['shadow/grasping-hands', { at: .1, s: .55, rate: 1.6 }],
  // 零号协议（锦标赛奖励牌）的算力机制：科幻一组 scifi/*
  core: ['scifi/energy-core', { s: .5, life: .7 }], scan: ['scifi/scanner', { s: .6, life: .8 }], holo: ['scifi/hologram', { s: .55, life: .8 }], laser: ['scifi/laser-grid', { s: .55, life: .5 }],
  field: ['scifi/force-field', { s: .6, life: .8 }], warpout: ['scifi/warp-out', { s: .6 }], tele: ['scifi/teleporter-pad', { s: .6, life: .8 }], warpin: ['scifi/warp-in', { s: .6, life: .9 }],
  jet: ['scifi/jetpack', { s: .55, life: .7 }], glitch: ['scifi/glitch', { s: .6, life: .6 }], emp: ['scifi/emp-blast', { s: .5 }], tractor: ['scifi/tractor-beam', { s: .55, life: .9 }],
};
// 近身对撞的刀光：出手的人是哪个阵营 → [轻、中、重] 三档（按这一下打掉多少战力选）
export const MELEE = {
  f1: [['melee/sword-slash', { pal: 'holy' }], ['melee/double-slash', { pal: 'holy' }], ['melee/heavy-cleave', { pal: 'holy' }]],
  f2: ['melee/dagger-flurry', 'melee/double-slash', ['melee/thrust', { pal: 'blood' }]],
  f3: [['melee/thrust', { pal: 'gold' }], ['melee/spear-sweep', { pal: 'gold' }], 'melee/hammer-smash'],
  f4: [['melee/claw-swipe', { pal: 'arcane' }], 'melee/scythe-reap', ['melee/heavy-cleave', { pal: 'arcane' }]],
  f5: ['melee/claw-swipe', 'melee/uppercut', 'melee/hammer-smash'],
  f6: ['melee/sword-slash', ['melee/thrust', { pal: 'ice' }], 'melee/spin-slash'],
  n: ['impacts/hit-spark', ['melee/sword-slash', { pal: 'metal' }], 'melee/heavy-cleave'],
};
// 其它场合
export const MISC = {
  crit: 'impacts/crit-hit',                                   // 一下打掉 6 点以上：再补一个暴击星
  land: ['impacts/heavy-landing', { s: .7 }],                 // 兵落地扬起的灰
  die: { f1: ['holy/feather-burst', { s: .5, lift: .1 }], f2: ['spawn/poof', { s: .8, pal: 'blood' }], f3: ['explosions/dirt-explosion', { at: .15, s: .35, rate: 1.5 }], f4: ['shadow/shadow-flames', { life: .7, s: .8 }], f5: ['spawn/poof', { s: .8, pal: 'leaf' }], f6: ['ice/ice-shatter', { s: .55, rate: 1.3 }], n: ['spawn/poof', { s: .8 }] }, // 兵倒下：每个阵营散的东西不一样
  shieldOn: ['holy/divine-shield', { life: .8 }], shieldOff: 'impacts/shield-block',
  poison: ['nature/acid-splash', { at: .28, s: .6 }], vital: ['nature/healing-bloom', { at: .8, s: .6, rate: 1.5 }], mute: ['shadow/hex-sigil', { at: 2.2, s: .6, lift: .5 }],
  gear: ['pickups/collect-burst', { s: .7, lift: .4 }], hatch: ['spawn/poof', { pal: 'gold' }],
  baseHit: ['explosions/small-explosion', { s: .6, rate: 1.4 }], baseHeal: ['holy/heal-aoe', { at: .4, s: .8 }], ruin: ['explosions/big-explosion', { s: 1.1 }], ruin2: ['explosions/barrel-explosion', { at: .8, s: .8 }],
  bossLand: 'impacts/ground-slam', bossHit: ['impacts/impact-frame', { s: .6, still: true }], rage: ['fire/flame-pillar', { at: .5, s: .8 }], rage2: ['fire/fire-ring', { at: .3 }],
  cheer: ['explosions/firework-burst', 'explosions/firework-rocket', ['explosions/firework-burst', { pal: 'candy' }], ['explosions/firework-rocket', { pal: 'neon' }]], confetti: ['ui/confetti', { s: 1.6 }],
};
// 十一位首领各自的一套：enter 登场，hit 重击命中（落在挨打的人身上；own 的那些从首领身上朝前放），cast 施法，die 倒下
export const BOSS = {
  B_f1: { enter: ['holy/holy-pillar', { at: .5 }], hit: [['holy/smite', { at: .5 }]], cast: [['holy/sunburst', { life: 1.2, lift: 1.3, s: .8 }], ['arcane/rune-circle', { pal: 'holy', life: 1.2 }]], die: [['holy/feather-burst', { lift: .6 }], ['explosions/plasma-explosion', { pal: 'holy', lift: .5 }]] },
  B_f2: { enter: ['explosions/smoke-bomb', { at: 1.3, rate: 1.5 }], hit: [['melee/dagger-flurry', { s: 1.6, own: true }], ['melee/double-slash', { s: 1.4, own: true }]], cast: [['shadow/hex-sigil', { at: 2, pal: 'blood', lift: .7 }]], die: [['explosions/smoke-bomb', { at: 1.3 }]] },
  B_f3: { enter: ['nature/quake', { at: .4 }], hit: [['nature/earth-spike', { at: .3 }]], cast: [['nature/tornado', { pal: 'dust', life: 1.3 }], ['nature/quake', { at: .4 }]], die: [['explosions/dirt-explosion', { at: .15 }]] },
  B_f4: { enter: ['spawn/spawn-portal', { at: .1 }], hit: [['shadow/grasping-hands', { at: .1, rate: 1.4, s: 1.1 }], ['melee/claw-swipe', { pal: 'arcane', s: 1.4, own: true }]], cast: [['shadow/black-hole', { life: 1.3, lift: 1 }], ['shadow/necro-skulls', { life: 1.3 }]], die: [['shadow/dark-explosion', { at: .45 }]] },
  B_f5: { enter: ['impacts/ground-slam', { s: 1.2 }], hit: [['melee/hammer-smash', { s: 1.4, own: true }], ['nature/quake', { at: .45, rate: 1.3 }]], cast: [['nature/thorns', { at: .3, fwd: -.5 }]], die: [['explosions/big-explosion', { pal: 'leaf' }]] },
  B_f6: { enter: ['ice/frost-nova', { at: .4 }], hit: [['ice/ice-spikes', { at: .2, own: true, rate: 1.3, s: .5 }], ['ice/snowflake-burst', { at: .1 }]], cast: [['ice/frost-nova', { at: .4 }], ['ice/ice-crystal', { life: 1.2, lift: 1.3 }]], die: [['ice/ice-shatter', { s: 1.4 }]] },
  B_n1: { enter: ['explosions/smoke-bomb', { at: 1.3, rate: 1.5, pal: 'shadow' }], hit: [['melee/wanjian', { s: 1.7, rate: 1.4 }], ['melee/double-slash', { s: 1.4, own: true, pal: 'arcane', after: .9 }]], cast: [['melee/wanjian', { s: 2 }]], die: [['explosions/implosion', { lift: .5 }]] },
  B_n2: { enter: ['arcane/time-stop', { rate: 1.6 }], hit: [['melee/dagger-flurry', { s: 1.8, own: true, pal: 'arcane' }], ['impacts/parry', { lift: .4 }]], cast: [['arcane/time-stop', { rate: 1.8, s: 1.2 }]], die: [['arcane/mana-burst', { at: .2, s: 1.4 }]] },
  B_n3: { enter: ['ice/snowflake-burst', { at: .1, s: 1.6 }], hit: [['melee/hammer-smash', { s: 1.5, own: true, pal: 'ice' }], ['ice/icicle-fall', { at: .85 }]], cast: [['ice/blizzard-vortex', { life: 1.2 }]], die: [['ice/ice-shatter', { s: 1.6 }], ['explosions/big-explosion', { pal: 'ice' }]] },
  B_n4: { enter: ['fire/meteor', { at: 1.2 }], hit: [['fire/fire-breath', { life: .7, own: true, lift: .5, fwd: .3 }], ['fire/flame-pillar', { at: .5, s: .7 }]], cast: [['fire/fire-tornado', { life: 1.2 }]], die: [['explosions/big-explosion', {}]] },
  B_final: { enter: ['explosions/firework-burst', { at: .35, pal: 'candy', lift: 1.2 }], hit: [['explosions/cartoon-pow', { s: 1.2, lift: .5, still: true, pal: 'candy' }], ['ui/confetti', {}]], cast: [['ui/confetti', { s: 1.3 }], ['explosions/firework-rocket', { at: .9, pal: 'candy' }]], die: [['explosions/nuke', { s: .8 }], ['ui/confetti', { s: 1.6 }]] },
};
// 场地上常驻的小东西：场地键 → [配方, 左右位置（-1 最左的城堡外侧 … 1 最右）, 高度（格）, 前后位置（负的在棋盘后面）, 放大倍数（不写是 1）]。每套第一条是铺在远处天上的一整片（极光、流星、萤火虫……）。只在高画质档出现，每秒画 15 次
export const AMBIENT = {
  n: [['weather/shooting-stars', 0, 4.2, -9, 2.4], ['critters/wisp', -.62, .5, -3.1], ['arcane/arcane-orb', .62, .7, -3.1], [['pickups/crystal-shard', { pal: 'arcane' }], -.2, 1.5, -3.3], ['critters/eyeball', .93, 2.5, -2.2]],
  f1: [['weather/god-rays', 0, .2, -5, 1.8], ['fire/brazier', -.58, 0, -3], ['fire/brazier', .58, 0, -3], ['critters/bird', -.25, 2.3, -3.2], ['water/fountain', .2, 0, -3.3]],
  f2: [['weather/cherry-blossoms', 0, .2, -4.5, 1.6], ['fire/torch', -.58, .2, -3], ['fire/torch', .58, .2, -3], ['critters/butterfly', .3, 1.2, -3.1], ['critters/bat', -.3, 2.4, -3.2]],
  f3: [['weather/clouds', 0, 5, -9, 2.4], ['fire/brazier', -.58, 0, -3], ['fire/brazier', .58, 0, -3], ['critters/snake', .25, 0, -3], [['holy/sunburst', { pal: 'gold' }], -.35, 3.1, -4]],
  f4: [['weather/fog', 0, .1, -4.5, 1.6], ['fire/spirit-flame', -.58, .1, -3], ['fire/spirit-flame', .58, .1, -3], ['critters/ghost', -.28, .9, -3.1], ['critters/flying-skull', .3, 1.3, -3.2], ['shadow/necro-skulls', .93, 2.4, -2.2]],
  f5: [['weather/fireflies', 0, .2, -4.5, 1.6], ['fire/campfire', -.58, 0, -3], ['critters/frog', .22, 0, -3], ['critters/butterfly', -.25, 1.3, -3.1], ['water/waterfall', .6, 0, -3.2]],
  f6: [['weather/aurora', 0, 4.2, -9, 2.4], ['ice/ice-crystal', -.58, .6, -3], ['ice/ice-crystal', .58, .6, -3], [['fire/spirit-flame', { pal: 'ice' }], -.22, .1, -3.2], [['critters/wisp', { pal: 'ice' }], .28, .7, -3.1]],
};
// 界面（ui-pfx.js 用）：点按钮、胜负结算、奖励
export const UI = {
  click: ['impacts/hit-spark', { c: [50, 45] }], primary: ['pickups/collect-burst', { s: 2, c: [56, 63] }], end: ['impacts/parry', { c: [100, 63] }], // c：把画布里的这一点对到鼠标上（这些特效的原点在脚下的地面，火花本身在它上方）
  win: [['explosions/firework-burst', { s: 2 }], ['explosions/firework-rocket', { s: 2 }], ['explosions/firework-burst', { s: 2, pal: 'candy' }], ['explosions/firework-rocket', { s: 2, pal: 'neon' }]], confetti: ['ui/confetti', { s: 3 }],
  lose: ['weather/rain', {}], reward: ['holy/sunburst', { s: 2, pal: 'gold' }], badge: ['pickups/power-star', { s: 2 }], chest: ['pickups/chest-open', { s: 2 }],
  emblem: { f1: 'pickups/power-star', f2: ['projectiles/energy-disc', { pal: 'blood' }], f3: ['pickups/crystal-shard', { pal: 'gold' }], f4: ['pickups/gem-spin', { pal: 'arcane' }], f5: ['pickups/potion', { pal: 'poison' }], f6: ['pickups/crystal-shard', { pal: 'ice' }], n: 'pickups/coin-spin' }, // 开始界面卡组名旁边：每个阵营一个会动的小东西
};
const idOf = r => (typeof r === 'string' ? r : r[0]);
const isRecipe = x => typeof x === 'string' || (Array.isArray(x) && x.length === 2 && typeof x[0] === 'string' && !!x[1] && typeof x[1] === 'object' && !Array.isArray(x[1]));
const flat = (x, out = []) => { if (isRecipe(x)) out.push(idOf(x)); else if (x && typeof x === 'object') for (const v of Object.values(x)) flat(v, out); return out; };
export const idsOf = x => [...new Set(flat(x))]; // 一条配方、一张表里出现的全部特效名
export const allIds = () => [...new Set(flat([KIND, MELEE, MISC, BOSS, Object.values(AMBIENT).flat().map(a => a[0]), UI]))]; // 表里用到的全部特效名（自检和预载用）
// 一场对局要用到哪些：两边出现的阵营、出现的首领，加上不分阵营的那些
export function idsFor(els, bosses) {
  const pick = t => (t && typeof t === 'object' && !Array.isArray(t) && ('f1' in t || 'n' in t) ? els.map(e => t[e] || t.n) : t);
  return [...new Set(flat([Object.values(KIND).map(pick), els.map(e => MELEE[e] || MELEE.n), MISC, bosses.map(b => BOSS[b])]))];
}

const LIB = './vendor/pixelfx/'; // 地址用变量拼：打包脚本只给写死的 import 地址加版本号，vendor 里的文件不加；这里要是加了，core 会被当成另一个文件再载一遍
let core = null; const mods = new Map();
export function warm(ids) { // 把这些特效的模块先取回来。取不到的就当没有，不报错
  return Promise.all([core || import(LIB + 'core/index.js').then(m => { core = m; }), ...ids.filter(id => !mods.has(id)).map(id => { mods.set(id, null); return import(`${LIB}fx/${id}.js`).then(m => { mods.set(id, m); }); })].map(p => Promise.resolve(p).catch(() => {})));
}
// 光晕被画布边切掉会露出一个方框：把最外面 8 个像素的光渐渐收掉（照搬特效库出图工具里的 edgeFade）
function edgeFade(f, E = 8) {
  const { w, h, light: L } = f;
  for (let y = 0; y < h; y++) { const ey = Math.min(y, h - 1 - y);
    for (let x = 0; x < w; x++) { const e = Math.min(ey, x, w - 1 - x); if (e >= E) { x = w - 1 - E; continue; }
      const i = y * w + x, l = L[i]; if (!(l & 0xffffff)) continue; const u = (e + .5) / E, k = u * u * (3 - 2 * u);
      L[i] = (l & 0xff000000) | Math.round((l & 255) * k) | (Math.round(((l >>> 8) & 255) * k) << 8) | (Math.round(((l >>> 16) & 255) * k) << 16); } }
}
// 一份模拟 + 一张小画布：棋盘上的贴片（createPfx）和页面上的画布（ui-pfx.js）共用。step(dt) 往前走并重画，播完返回 false。模块没取回来返回 null
export function makeSim(recipe, extra = {}) {
  const id = idOf(recipe), o = { ...(typeof recipe === 'string' ? {} : recipe[1]), ...extra }, mod = core && mods.get(id); if (!mod) return null;
  const m = mod.meta, [w, h] = m.size, [ox, oy] = m.origin, fps = m.fps || 30, every = o.every || 1;
  let inst; try { inst = core.createFx(mod, { x: ox, y: oy, ...(o.pal ? { palette: core.PAL[o.pal] } : {}), ...(o.seed !== undefined ? { seed: o.seed } : {}) }); if (o.at) inst.update(o.at); } catch { return null; }
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const g = cv.getContext('2d'), img = g.createImageData(w, h), frame = core.createFrame(w, h);
  let acc = 0, drawn = false, left = o.life ?? Infinity; const rate = (o.rate || 1) * fps / every;
  const sim = { cv, w, h, ox, oy, o, dirty: false, stop: () => inst.stop(),
    step(dt) { // 按特效自己的帧率（多数是每秒 30 帧）一格一格走：画面每秒 60 帧也只算 30 次；掉帧时一次最多补 4 格。every：隔几格才画一次（常驻的小东西用，省一半开销）
      if ((left -= dt) <= 0) inst.stop(); acc += dt * rate; const n = Math.min(4, Math.floor(acc)); if (!n && drawn) return true; acc -= Math.floor(acc);
      for (let i = 0; i < n; i++) inst.update(every / fps); if (inst.done()) return false;
      core.clearFrame(frame); inst.draw(frame); edgeFade(frame); core.composite(frame, img.data, null); g.putImageData(img, 0, 0); return drawn = sim.dirty = true; } };
  return sim;
}
// 棋盘上的播放器。PXW：特效的一个像素在棋盘上有多大（格）。一次 play 可以同时贴在好几个位置（打一片的法术只算一遍）
export function createPfx(THREE, layer, PXW) {
  const live = new Set();
  const kill = p => { if (!live.delete(p)) return; for (const s of p.sprites) layer.remove(s); p.mat.dispose(); p.tex.dispose(); };
  function play(recipe, pts, extra = {}) { // pts：一组三维位置（特效的原点落在这里：脚下、落点）。返回 { sprites, mat, stop(), kill() }；播不出来返回 null
    const sim = pts.length ? makeSim(recipe, extra) : null; if (!sim) return null; const { w, h, ox, oy, o } = sim, flip = !!o.flip && !o.still;
    const tex = new THREE.CanvasTexture(sim.cv); tex.magFilter = tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false; tex.colorSpace = THREE.SRGBColorSpace; if (flip) { tex.repeat.x = -1; tex.offset.x = 1; }
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: !!o.depth, depthWrite: false }), k = (o.s || 1) * PXW; // depth：场地上常驻的东西要被前面的人和城堡挡住；打出来的特效不被挡
    const sprites = pts.map(pt => { const s = new THREE.Sprite(mat); const cx = o.c ? o.c[0] : ox, cy = o.c ? o.c[1] : oy; s.center.set(flip ? 1 - cx / w : cx / w, 1 - cy / h); s.scale.set(w * k, h * k, 1); s.position.copy(pt); s.position.y += (o.lift || 0) + (o.raw || o.c || oy / h > .72 ? 0 : .45); /* 原点在画布中间的（火花、爆点、飞行物）是打在身上的，自动抬到半身高；原点在画布底边的是贴地的 */ if (!o.depth) s.renderOrder = 9; layer.add(s); return s; });
    const p = { sprites, mat, tex, stop: sim.stop, kill: () => kill(p), step(dt) { if (!sim.step(dt)) kill(p); else if (sim.dirty) { sim.dirty = false; tex.needsUpdate = true; } } };
    live.add(p); try { p.step(0); } catch { kill(p); return null; } return p;
  }
  return { play, ready: r => !!(core && mods.get(idOf(r))), tick(dt) { for (const p of [...live]) try { p.step(dt); } catch { kill(p); } }, clear() { for (const p of [...live]) kill(p); }, count: () => live.size };
}
