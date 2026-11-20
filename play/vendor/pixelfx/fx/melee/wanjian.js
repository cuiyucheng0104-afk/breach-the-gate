// 万剑归宗：一步翻盘自己画的特效（不是 pixelfx 原带的），给首领李俊昊用。
// 剑用的是李俊昊自己那把刀：从他攻击第 4 帧（boss_shinkagezendo_attack）里逐列取出刀身像素拉直，配色照原样；护手和握把用他身上的灰和深色补。
// 九把剑影先在目标头顶排成一道扇面亮起来，再从中间往两边一把接一把插下去，剑尖都扎向目标脚下；
// 每把落地炸一个白光十字，最后一把落地时脚下一圈剑气散开。
import { fit, mix, hex, clamp, sparkle, WHITE } from "../../core/index.js";

export const meta = {
  name: "Wanjian guizong",
  desc: "Nine spectral swords fan out above the target, then plunge one after another from the middle outwards; each lands with a white cross flash, the last one rings out a shockwave.",
  tags: ["melee", "sword", "rain", "boss", "one-shot"],
  size: [144, 136],
  origin: [72, 122],
  duration: 1.15,
  loop: false,
  fps: 30,
  bg: "ground",
  options: { palette: ["#2a0838", "#6a1290", "#cc0af3", "#f45dfd", "#ffd8ff"], hilt: ["#0a0b0f", "#14161f", "#474750", "#71717e", "#acacb9"], glint: "#e6dcce", glow: "#d040ff", seed: 7 },
};

// 李俊昊的刀，竖着、刀尖朝下，5 宽 26 高：k 柄头，h/H 握把（深色缠绳里露出灰色菱格），g/G 圆护手，M 洋红刀身，L 亮粉刃口，c 米白反光，W 刀尖
const SWORD = ["..k..", "..h..", "..H..", "..h..", "..H..", "..h..", ".gGg.", "gGGGg", "..ML.", "..ML.", "..ML.", "..Mc.", "..ML.", "..ML.", "..ML.", "..ML.", "..ML.", "..Mc.", "..ML.", "..ML.", "..ML.", "..ML.", "..LL.", "..L..", "..L..", "..c.."];
const H = SWORD.length;
const N = 9, ORDER = [4, 3, 5, 2, 6, 1, 7, 0, 8]; // 先中间，再两边
const APPEAR = 0.3, START = 0.36, GAP = 0.055, FALL = 0.09;

export function draw(p, t, o) {
  const C = fit(o.palette, 5), K = fit(o.hilt, 5), glow = hex(o.glow);
  const pal = { k: K[3], h: K[1], H: K[3], g: K[2], G: K[4], M: C[2], L: C[3], c: o.glint, W: WHITE };
  const fadeIn = clamp(t / APPEAR);
  for (let k = 0; k < N; k++) {
    const i = ORDER[k], off = i - 4, x0 = off * 11, y0 = -112 + Math.abs(off) * 6; // 扇面：中间高、两边低
    const x1 = off * 2.2, t0 = START + k * GAP, u = clamp((t - t0) / FALL);   // 落点都收向目标脚下
    if (t < t0 + FALL) {
      const bob = Math.sin(t * 18 + i) * (1 - u), x = x0 + (x1 - x0) * u * u, y = y0 + (0 - H - y0) * u * u + bob;
      if (u > 0) p.glowLine(x0 + 2, y0, x + 2, y, 3, glow, 0.35 * u); // 下落时拖一道剑气
      p.glow(x + 3, y + 14, 10, glow, 0.3 * fadeIn);
      p.sprite(SWORD, pal, Math.round(x), Math.round(y), { a: u > 0 ? 1 : fadeIn });
    } else {
      const age = t - t0 - FALL, k2 = clamp(age / 0.25);
      if (k2 < 1) { // 插在地上，慢慢淡去
        p.sprite(SWORD, pal, Math.round(x1), -H + 4, { a: 1 - k2 });
        if (age < 0.12) sparkle(p, x1 + 2, -2, 7 - age * 40, C[3], C[2], 0.7);
      }
    }
  }
  // 最后一把落地：脚下一圈剑气散开，中心一道白光
  const tEnd = START + (N - 1) * GAP + FALL, a = t - tEnd;
  if (a > 0 && a < 0.35) {
    const k = a / 0.35, R = 8 + k * 46;
    p.glowRing(0, -2, R, 5, glow, 0.6 * (1 - k));
    for (let j = 0; j < 24; j++) { const ang = (j / 24) * Math.PI * 2; p.dot(Math.cos(ang) * R, -2 + Math.sin(ang) * R * 0.35, mix(WHITE, C[3], k), 1 - k); }
    if (a < 0.15) sparkle(p, 2, -6, 12 - a * 50, C[3], C[2], 0.9);
  }
}
