// 把音频模块包一层：audio.js 和音频文件还没准备好、或者载入失败时，游戏照常能玩，只是没声音。
// 界面只管在事件发生时调用 sfx / music；用哪份素材、音量多大由 assets/audio/manifest.json 决定。
// 自动测试时（地址带 ?timer，或者是被脚本驱动的浏览器）一律不出声：测试页面在后台反复开关，会把音乐放到开发者的电脑上
const SILENT = new URLSearchParams(location.search).has('timer') || navigator.webdriver;
let a = null; if (!SILENT) import('./audio.js?v=112a67f0').then(m => { a = m.audio; if (want) a.music(want); }).catch(() => {});
let want = '';                                              // 模块还没载入时先记下想放的曲子
export const sfx = (key, opt) => { try { a?.sfx(key, opt); } catch { /* 声音出错不影响对局 */ } };
export const music = (key, opt) => { want = key; try { a?.music(key, opt); } catch { /* 同上 */ } };
export const unlock = () => { try { a?.unlock(); } catch { /* 同上 */ } };
export const toggleMute = () => { try { a?.toggleMute(); return !!a?.muted; } catch { return false; } };
export const isMuted = () => !!a?.muted;
export const pause = () => { try { a?.pause(); } catch { /* 同上 */ } };   // 切后台停、回来接着放（界面在 visibilitychange 里调）
export const resume = () => { try { a?.resume(); } catch { /* 同上 */ } };
// 规则里每一类事件对应的声音。法术和能力的特效再按阵营细分：圣辉是圣光，深渊是暗影，霜原是冰，沙海是风，其余是通用的施法声
const EL = { f1: 'holy', f3: 'wind', f4: 'shadow', f6: 'ice' };
const FX = { frost: 'ice', bless: 'buff', heal: 'heal', summon: 'summon', gust: 'wind', venom: 'poison', shade: 'shadow', creep: 'shadow', drain: 'shadow', thorn: 'hit_light', slash: 'hit_light' };
export function eventSound(e, me) { // 一件事发生了，该出什么声；不该出声的返回空
  switch (e.t) {
    case 'play': return 'card_play'; case 'spawn': return e.token ? 'summon' : 'unit_land'; case 'move': return 'step'; case 'pull': case 'push': return 'wind';
    case 'fx': return FX[e.k] || EL[e.el] || 'spell_cast'; case 'hurt': return e.melee ? (e.n >= 5 ? 'hit_heavy' : 'hit_light') : ''; case 'die': return 'unit_die';
    case 'base': return e.hp <= 0 ? 'base_break' : 'base_hit'; case 'heal': return 'heal'; case 'buff': return ''; case 'shield': return e.on ? 'shield_up' : 'shield_break';
    case 'freeze': return 'freeze'; case 'poison': return 'poison'; case 'vital': return 'heal'; case 'mute': return 'shield_break'; case 'gear': return 'buff'; case 'morph': return 'summon';
    case 'mana': return 'mana_gain'; case 'draw': return 'card_draw'; case 'swap': return 'card_swap'; case 'turn': return e.side === me ? 'turn_mine' : 'turn_foe'; case 'rage': return 'boss_rage';
  }
  return '';
}
