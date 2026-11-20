// 音频模块：Web Audio，无依赖。音乐/音效清单见 assets/audio/manifest.json，文件首次用到才加载。
const KEY = 'yibu-fanpan.audio.v1';
const BASE = new URL('./assets/audio/', import.meta.url);
const THROTTLE = 70;   // 同一音效的最短间隔（毫秒），防止连发叠成噪音
const MAX_VOICES = 14; // 同时发声的音效上限

let ctx = null, master = null, musicBus = null, sfxBus = null;
let manifest = null, manifestP = null;
const bufs = new Map();     // 文件 -> Promise<AudioBuffer|null>
const lastAt = new Map();   // 音效键 -> 上次播放时间
let voices = 0;
let cur = null;             // { key, src, g }：当前在放的音乐
let want = null;            // 想放的音乐（解锁前调用时先记下）
let wantFade = 1;

const st = { music: 0.6, sfx: 0.8, muted: false };
try { Object.assign(st, JSON.parse(localStorage.getItem(KEY)) || {}); } catch {}
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch {} };
const clamp = v => Math.min(1, Math.max(0, +v || 0));

function loadManifest() {
  return manifestP ||= fetch(new URL('manifest.json', BASE)).then(r => r.json()).then(m => manifest = m).catch(() => (manifest = { music: {}, sfx: {} }));
}

function load(file) {
  if (!bufs.has(file)) {
    bufs.set(file, fetch(new URL(file, BASE)).then(r => r.arrayBuffer()).then(a => ctx.decodeAudioData(a)).catch(() => null));
  }
  return bufs.get(file);
}

// 出声的线路。音乐全是 8 位芯片风：方波的泛音堆在 2–5 千赫，正是人耳最敏感、听久了最累的一段，原样放出来发尖。
// 所以音乐单独过一道“磨圆”：3.2 千赫以上滚降，1.5 千赫以上整体再压 5 分贝，220 赫兹以下垫 2 分贝，音量再收 3 分贝（MUSIC_TRIM）。
// 实测（浏览器里用 OfflineAudioContext 离线渲染，不出声）：2 千赫以上的能量降 10 分贝，整体降 3.4 分贝；频谱重心从两三千赫降到一千赫上下。音效不过这一道，保持清脆。
// 最后总线上一个限幅器：音乐加上好几个音效叠在一起会冲过满刻度，削波也是“刺耳”的一个来源；LIMIT_COMP 抵掉浏览器给压缩器自动补的增益，平时的音量不变（实测小声信号进出相差不到 0.1 分贝，三个满刻度音效叠加出来峰值 0.93）。
const MUSIC_TRIM = 0.7, LIMIT_COMP = 0.845;
export function chain(c) { // c：AudioContext 或 OfflineAudioContext（自检用）。返回 { master, musicBus, sfxBus }
  const mk = (type, f, g) => { const b = c.createBiquadFilter(); b.type = type; b.frequency.value = f; if (g !== undefined) b.gain.value = g; else b.Q.value = -3; return b; }; // 低通的 Q 以分贝计：−3 是不带鼓包的平滑滚降
  const out = c.createGain(); out.gain.value = LIMIT_COMP; out.connect(c.destination);
  const lim = c.createDynamicsCompressor(); lim.threshold.value = -4; lim.knee.value = 4; lim.ratio.value = 12; lim.attack.value = 0.003; lim.release.value = 0.12; lim.connect(out);
  const master = c.createGain(); master.connect(lim);
  const sfxBus = c.createGain(); sfxBus.connect(master);
  const trim = c.createGain(); trim.gain.value = MUSIC_TRIM; trim.connect(master);
  const low = mk('lowshelf', 220, 2), high = mk('highshelf', 1500, -5), lp = mk('lowpass', 3200); lp.connect(high); high.connect(low); low.connect(trim);
  const musicBus = c.createGain(); musicBus.connect(lp);
  return { master, musicBus, sfxBus };
}

function applyVol() {
  if (!ctx) return;
  const t = ctx.currentTime;
  musicBus.gain.setTargetAtTime(st.muted ? 0 : st.music, t, 0.05);
  sfxBus.gain.setTargetAtTime(st.muted ? 0 : st.sfx, t, 0.05);
}

async function play(key, fade) {
  want = key; wantFade = fade;
  if (!ctx) return; // 还没解锁，unlock() 之后会补放
  await loadManifest();
  const e = manifest.music?.[key];
  if (!e) return;
  if (cur?.key === key) return;
  const buf = await load(e.file);
  if (!buf || want !== key) return; // 加载期间又换了曲，丢弃
  const t = ctx.currentTime, f = Math.max(0.01, fade);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(e.gain ?? 1, t + f);
  g.connect(musicBus);
  const src = ctx.createBufferSource();
  src.buffer = buf; src.loop = e.loop !== false; src.connect(g); src.start();
  if (cur) fadeOut(cur, f);
  cur = { key, src, g };
  if (!src.loop) src.onended = () => { if (cur?.src === src) cur = null; };
}

function fadeOut(c, f) {
  const t = ctx.currentTime;
  c.g.gain.cancelScheduledValues(t);
  c.g.gain.setValueAtTime(c.g.gain.value, t);
  c.g.gain.linearRampToValueAtTime(0, t + f);
  try { c.src.stop(t + f + 0.05); } catch {}
}

export const audio = {
  // 浏览器要求用户手势之后才能出声；多次调用无副作用
  unlock() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      ({ master, musicBus, sfxBus } = chain(ctx));
      applyVol();
      loadManifest();
    }
    if (ctx.state !== 'running') ctx.resume().catch(() => {});
    if (want && !cur) play(want, wantFade);
  },
  music(key, { fade = 1 } = {}) { return play(key, fade); },
  stopMusic(fade = 1) {
    want = null;
    if (cur && ctx) { fadeOut(cur, Math.max(0.01, fade)); cur = null; }
  },
  async sfx(key, { rate = 1, gain = 1 } = {}) {
    if (!ctx || st.muted) return;
    const now = performance.now();
    if (now - (lastAt.get(key) ?? -1e9) < THROTTLE || voices >= MAX_VOICES) return;
    lastAt.set(key, now);
    await loadManifest();
    const e = manifest.sfx?.[key];
    if (!e) return;
    const buf = await load(e.file);
    if (!buf) return;
    const g = ctx.createGain(); g.gain.value = (e.gain ?? 1) * gain; g.connect(sfxBus);
    const src = ctx.createBufferSource();
    src.buffer = buf; src.playbackRate.value = rate; src.connect(g);
    voices++; src.onended = () => { voices--; g.disconnect(); };
    src.start();
  },
  setVolume({ music, sfx } = {}) {
    if (music != null) st.music = clamp(music);
    if (sfx != null) st.sfx = clamp(sfx);
    save(); applyVol();
  },
  getVolume() { return { music: st.music, sfx: st.sfx }; },
  toggleMute() { st.muted = !st.muted; save(); applyVol(); return st.muted; },
  pause() { ctx?.suspend().catch(() => {}); },  // 切到后台：挂起音频时钟，音乐停在原处；回来 resume 接着放
  resume() { ctx?.resume().catch(() => {}); },
  get muted() { return st.muted; },
  // 给试听页用：读清单
  async manifest() { await loadManifest(); return manifest; },
};
