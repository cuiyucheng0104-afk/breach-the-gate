// 界面上的像素特效（vendor/pixelfx）：点按钮溅一下火花，赢了放焰火撒彩纸，输了下雨，奖励牌后面转一圈光，开始界面的卡组名旁边挂一个阵营的小东西。
// 画在小画布上，不挡点击；特效模块没取回来、或开了“减少动态效果”，就什么都不画——界面功能一样不少。配方在 board-pfx.js 的 UI 表里。
import { warm, makeSim, idsOf, UI } from './board-pfx.js?v=112a67f0';
const Q = new URLSearchParams(location.search), calm = matchMedia('(prefers-reduced-motion: reduce)').matches || Q.has('calm');
const layer = document.body.appendChild(Object.assign(document.createElement('div'), { id: 'pfx' })), live = new Set(); let last = 0, on = false;
const drop = p => { if (live.delete(p)) p.sim.cv.remove(); };
const next = () => (Q.has('timer') ? setTimeout(() => tick(performance.now()), 33) : requestAnimationFrame(tick)); // ?timer：窗口在后台也照走（自动测试用），和棋盘一样
function tick(now) { const dt = Math.min(.1, (now - last) / 1000); last = now;
  for (const p of [...live]) try { if (!p.sim.cv.isConnected || p.sim.cv.offsetParent === null || !p.sim.step(dt)) drop(p); } catch { drop(p); } // 画布所在的那块界面收起来了（比如结算关了），特效跟着收
  if (live.size) next(); else on = false; }
// 在 (x, y) 放一个特效，特效的原点落在这一点。into：放进哪个元素里（坐标相对它；不给就是整页）；cover：铺满 into；under：垫在 into 自己的内容下面；inline：跟在 into 的文字后面。返回 { kill() }，放不出来返回 null
export function uiFx(recipe, x = 0, y = 0, extra = {}) {
  if (calm || !recipe) return null; const sim = makeSim(recipe, extra); if (!sim) { warm(idsOf(recipe)); return null; }
  const k = Math.max(1, Math.round((sim.o.s || 1) * (innerHeight < 500 ? .5 : 1))), cv = sim.cv; cv.className = 'pfx' + (sim.o.cover ? ' cover' : '') + (sim.o.under ? ' under' : ''); // 手机横屏上一律缩一半（像素还是整数倍，不糊）
  if (sim.o.inline) cv.style.cssText = `width:${sim.w * k}px;height:${sim.h * k}px`; else if (!sim.o.cover) cv.style.cssText = `left:${Math.round(x - (sim.o.c?.[0] ?? sim.ox) * k)}px;top:${Math.round(y - (sim.o.c?.[1] ?? sim.oy) * k)}px;width:${sim.w * k}px;height:${sim.h * k}px`;
  (sim.o.into || layer)[sim.o.inline ? 'append' : 'prepend'](cv); /* 放在最前面：后面的内容盖在它上面（结算的字不会被焰火挡住） */ const p = { sim, kill: () => drop(p) }; live.add(p); if (!on) { on = true; last = performance.now(); next(); } return p;
}
export { UI };
export const ready = r => warm(idsOf(r)); // 等这条配方的模块取回来（开始界面一进来就要挂东西的地方用）
if (!calm) setTimeout(() => warm(idsOf(UI)), 600); // 界面用的十来个特效，页面空下来就先取回
