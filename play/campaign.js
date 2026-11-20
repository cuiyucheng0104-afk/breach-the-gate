// 闯关模式：七个场地的关卡数据和存档。关卡是数据不是代码——每关只说对面用什么牌、双方城堡多少血、开局场上摆了什么。
// 六个阵营场地各 4 关加 1 个首领；六个都通关后开中立场地：4 个小首领加 1 个最终首领。击败首领获得它的首领牌。
import { CARDS, DECKS, ROWS, tile, upgrade } from './chess.js?v=112a67f0';
import { HP } from './campaign-hp.js?v=112a67f0'; // 每关双方的城堡血量，由 tools/chess_campaign.mjs --fit 按目标通关率校准出来

const deck = name => DECKS.find(d => d.name === name).cards;
const swap = (cards, out, into) => cards.map(k => k === out ? into : k);
const at = (d, c) => tile(ROWS - 1 - d, c);           // 对面（右边）离它自己城堡 d 行、第 c 路的格子
const put = (card, d, c, str) => ({ side: 1, card, tile: at(d, c), str });

// 一个阵营场地：a、b 是这个阵营的两套预设（对面轮流用），s3、s4 是第三、四关开局摆在场上的东西，out 是首领卡组里被首领牌换掉的那张
const area = (key, name, intro, a, b, names, s3, s4, bossCard, out, extra = []) => ({ key, name, intro, boss: bossCard, stages: [
  { name: names[0], intro: names[5], foe: deck(a), base: [10, 8] },
  { name: names[1], intro: names[6], foe: deck(b), base: [10, 9] },
  { name: names[2], intro: names[7], foe: deck(a), base: [10, 8], setup: s3 },
  { name: names[3], intro: names[8], foe: deck(b), base: [10, 9], setup: s4 },
  { name: names[4], intro: names[9], foe: swap(deck(b), out, bossCard), base: [10, 12], setup: extra, boss: bossCard, music: 'boss_' + key }, // 首领牌保证在对面起手里，能量够了就会打出来
] });

export const AREAS = [
  area('f1', '晨曦要塞', '金甲骑士守着的石头要塞。他们抱团、带盾、还会给城堡回血。', '铁壁列阵', '骑士冲锋',
    ['城门卫队', '骑士团的冲锋', '盾墙', '破晓之前', '三环圣者 奥瑞安',
     '先认识圣盾：它挡下第一次伤害，用小伤害把它敲掉再打。', '一排骑士互相加成，别让他们凑齐。', '对面开局就有两座镇关巨像挡路。', '对面开局有一座丰碑，每回合给旁边的人加战力。', '首领一出场，全队都有圣盾。'],
    [put('colossus', 0, 1, 5), put('colossus', 0, 2, 5)], [put('f1_ironcliffemonument', 0, 1)], 'B_f1', 'f1s_rally'),
  area('f2', '雾隐道场', '忍者的山中道场。他们一回合连出几张牌，还能把兵直接放到你身边。', '连击快攻', '咒印法术',
    ['入门试炼', '咒印师', '伏击', '影之祠', '千刃 胧',
     '对面的小牌连着出才厉害，逐个清掉。', '对面每放一张法术，场上的人都会起反应。先杀带咒印的。', '对面开局就有两个忍者埋伏在半路。', '对面开局有一座影之祠，每放一张法术就多一只纸鹤。', '首领可以落在任何地方，一落地就炸一圈。'],
    [put('f2_support', 2, 0), put('f2_deathphantom', 2, 3)], [put('f2_buildlegendary', 0, 2)], 'B_f2', 'f2_kibeholder'),
  area('f3', '千碑谷', '沙漠里立满方尖碑的山谷。碑不会动，但每回合都在干活。', '顺风突袭', '方尖碑',
    ['逐风的人', '立碑的人', '碑林', '无尽碑', '砂之王 赫鲁',
     '对面的兵一回合走两步，别让他们溜进城门。', '碑越多对面越强，优先拆碑。', '对面开局就有红沙碑和金焰碑。', '对面开局有一座无尽碑，每回合出一只 3 战力的沙灵。', '首领出场会让所有的碑立刻再干一次活。'],
    [put('f3_obelyskredsand', 0, 0), put('f3_obelyskgoldenflame', 0, 3)], [put('f3_endlessobelysk', 0, 1)], 'B_f3', 'f3_dreamshaper', [put('f3_obelyskgoldenflame', 0, 3)]),
  area('f4', '蚀月深坑', '暗影和恶魔的巢穴。满地影灵，很多东西死了才生效。', '影灵海', '毒与暗影',
    ['影灵潮', '毒沼', '暗影祭坛', '灵魂熔炉', '噬魂巨怪 厄古',
     '对面铺一地小兵，范围伤害最管用。', '中毒和暗影会慢慢磨掉你的兵，速战速决。', '对面开局就有暗影祭坛和魔门。', '对面开局有一座灵魂熔炉，每回合烧你的城堡 1 点。', '首领在场时，对面每死一个兵她就 +2 战力；她倒下时烧你的城堡 3 点。'],
    [put('f4_buildminion', 0, 1), put('f4_daemongate', 0, 2)], [put('f4_buildlegendary', 0, 2)], 'B_f4', 'f4_megafiend'),
  area('f5', '蛮荒巢穴', '巨兽的领地。它们越拖越大，有的谁碰谁受伤。', '越养越大', '荆棘反击',
    ['幼兽群', '荆棘丛', '孵化场', '兽巢', '蛮荒之主 格鲁姆',
     '对面的兵每回合都在变强，趁小的时候解决。', '带荆棘的别用小兵去撞，用法术或远程。', '对面开局就有两颗蛋，过几回合孵出大家伙。', '对面开局有一座孵化场，每回合出一只幼兽。', '首领每回合 +2 战力，打赢了还会接着往前走。'],
    [put('f5_egg2', 0, 1), put('f5_egg', 0, 2)], [put('f5_buildminion', 0, 1)], 'B_f5', 'f5_ankylos'),
  area('f6', '永冻隘口', '冰雪里的隘口。他们把你冻在原地，再把兵放进你的半场。', '冰封控制', '渗透与龙',
    ['初雪', '渗透者', '冰墙阵', '引力井', '霜冕 伊蕾娜',
     '被冻住的兵下回合不走，能力也失效。', '对面喜欢把兵放进你的半场，守住前线。', '对面开局就有两堵冰墙和一座引力井。', '对面开局有引力井和冰棘。', '首领出场冻住你所有的兵，被冻住的她一刀一个。'],
    [put('icewall', 1, 1, 4), put('icewall', 1, 2, 4), put('f6_gravitywell', 0, 1)], [put('f6_gravitywell', 0, 1), put('f6_blazingspines', 0, 2)], 'B_f6', 'f6_whitewyvern'), // 换出去的那张必须在「渗透与龙」里：以前写的是 drake（在另一套「冰封控制」里），首领牌就再也进不了对手卡组
  { key: 'n', name: '无主之地', intro: '不属于任何阵营的强者。四个小首领，最后是糖果暴君。', boss: 'B_final', stages: [
    { name: '影刃宗师 李俊昊', intro: '万剑归宗：谁比他强，他就拉着谁一起倒下。别拿大个子去撞他。', foe: ['n_militia', 'neutral_jaxi', 'n_arrow', 'neutral_sai', 'n_widow', 'neutral_silverbeak', 'maul', 'n_grenadier', 'neutral_bloodletter', 'gem', 'n_herbalist', 'B_n1'], base: [10, 12], boss: 'B_n1', music: 'boss_n1' },
    { name: '六臂默者 王嘉伟', intro: '它一出场，你所有兵的能力都失效。对面是一队魔像。', foe: ['neutral_golemstone', 'neutral_moltengolem', 'n_golemsmith', 'warden', 'n_golemrune', 'neutral_giantcrab', 'n_ironclad', 'neutral_golemsteel', 'n_diamond', 'g_shield', 'potion', 'B_n2'], base: [10, 12], boss: 'B_n2', music: 'boss_n2' },
    { name: '霜暴巨兽 戈尔', intro: '14 战力，打城堡还多 4 点。别让它走到头。', foe: ['neutral_jaxi', 'general', 'grapple', 'neutral_rook', 'n_breach', 'n_grenadier', 'neutral_thunderhorn', 'n_kron', 'neutral_astralcrusader', 'sword', 'n_bonereaper', 'B_n3'], base: [10, 12], boss: 'B_n3', music: 'boss_n3' },
    { name: '赤翼龙使 进击之潘腾', intro: '一出场带两条雏龙，所有的龙都变强。', foe: ['n_dragonling', 'neutral_jaxi', 'martyr', 'n_dragonspeaker', 'neutral_rook', 'n_roost', 'noshrak', 'neutral_bloodletter', 'n_soulstealer', 'n_vigor', 'g_spear', 'B_n4'], base: [10, 12], boss: 'B_n4', music: 'boss_n4' },
    { name: '糖果暴君 团团', intro: '别看它小：它会把你最弱的两个兵收买过去，每回合身后再多一只小熊猫。', foe: ['neutral_jaxi', 'n_abjudicator', 'n_artificer', 'n_rejuvenator', 'n_harmony', 'n_vampire', 'n_spelleater', 'n_chaosknight', 'n_shadowlord', 'tyrant', 'n_turn', 'B_final'], base: [10, 15], boss: 'B_final', music: 'boss_final' },
  ] },
];
for (const a of AREAS) a.stages.forEach((s, i) => { if (HP[a.key]?.[i]) s.base = HP[a.key][i]; });
for (const a of AREAS) for (const s of a.stages) for (const k of [...s.foe, ...(s.setup || []).map(x => x.card)]) if (!CARDS[k]) throw new Error(`关卡「${s.name}」用了不存在的牌：${k}`);

export const areaOf = key => AREAS.find(a => a.key === key);
export const stageOpts = s => ({ base: s.base, setup: s.setup, boss: s.boss ? 1 : -1, hand: s.boss ? [[], [s.boss]] : undefined }); // 交给 newGame 的开局选项：首领牌保证在对面起手里
export const battleMusic = (areaKey, i) => areaOf(areaKey).stages[i].music || 'battle_' + (1 + (AREAS.findIndex(a => a.key === areaKey) + i) % 3);

// ---------- 存档：每个场地各自的进度（进场时选定并锁住的卡组、打到第几关）、通关的场地、赢到手的首领牌 ----------
// 徽章：六个阵营场地各一枚，通关那个场地的五关就到手（存档里就是 done[场地]）。集齐六枚才能进无主之地。
const KEY = 'yibu-fanpan.campaign.v1';
export const BADGES = AREAS.filter(a => a.key !== 'n').map(a => a.key), badgeName = key => areaOf(key).name.slice(0, 2) + '徽章';
export const progress = {
  data: { runs: {}, done: {}, owned: [] },
  load() { try { const d = JSON.parse(localStorage.getItem(KEY)); if (d && typeof d === 'object') { const runs = d.runs && typeof d.runs === 'object' && !Array.isArray(d.runs) ? d.runs : {}; if (d.run && typeof d.run === 'object') runs[d.run.area] = { deck: d.run.deck, at: d.run.at }; // 旧存档只记一个进行中的场地
      for (const r of Object.values(runs)) if (r && r.deck && Array.isArray(r.deck.cards)) r.deck.cards = upgrade(r.deck.cards); // 锁定的卡组里有后来删掉的牌：换成接班的那张
      const done = {}; for (const [k, v] of Object.entries(d.done && typeof d.done === 'object' && !Array.isArray(d.done) ? d.done : {})) if (v && areaOf(k)) done[k] = true; // 只认本作里有的场地：存档里要是存着数组或别的东西，徽章会在下一次保存时被悄悄丢掉（JSON 不存数组上的自定义属性）
      this.data = { runs: Object.fromEntries(Object.entries(runs).filter(([k, r]) => areaOf(k) && r && r.deck && Array.isArray(r.deck.cards) && r.deck.cards.every(c => CARDS[c]) && Number.isInteger(r.at) && r.at >= 0 && r.at < areaOf(k).stages.length)), done, owned: (Array.isArray(d.owned) ? d.owned : []).filter(k => typeof k === 'string' && CARDS[k] && (CARDS[k].boss || CARDS[k].prize)) }; /* 赢到手的首领牌和锦标赛奖励牌 */ } } catch { /* 读不了就从头来 */ } return this.data; },
  save() { try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch { /* 存不了就只在这次打开期间有效 */ } },
  badges() { return BADGES.filter(k => this.data.done[k]).length; },                                                // 已经拿到几枚徽章
  open(key) { return key !== 'n' || this.badges() === BADGES.length; },                                          // 无主之地：集齐六枚徽章才能进；进去之后四个小首领一个个打过，才轮到最终首领
  enter(key, d) { this.data.runs[key] = { deck: { name: d.name, cards: [...d.cards] }, at: 0 }; this.save(); },     // 进场地：这个场地的卡组从这一刻起锁定
  quit(key) { delete this.data.runs[key]; this.save(); },                                                           // 退出场地：这个场地的进度清零（别的场地不受影响）
  win(key) { // 打赢这个场地当前的一关：往下走一关；打赢的是首领就拿到首领牌，场地通关。返回 { card: 新到手的首领牌或 null, cleared: 场地是否通关, badge: 这次是不是新拿到一枚徽章 }
    const r = this.data.runs[key], a = areaOf(key), s = r && a && a.stages[r.at]; if (!s) return { card: null, cleared: false, badge: false }; // 没有这一场（比如存档里这条进度已经没了）：当作没打赢，不把界面弄炸
    const card = s.boss && !this.data.owned.includes(s.boss) ? s.boss : null;
    if (card) this.data.owned.push(card);
    const cleared = r.at === a.stages.length - 1, badge = cleared && key !== 'n' && !this.data.done[key]; if (cleared) { this.data.done[key] = true; delete this.data.runs[key]; } else r.at++;
    this.save(); return { card, cleared, badge };
  },
};
