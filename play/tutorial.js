// 新手教学：一局照着脚本走的对局，两三分钟。牌序写死（不洗牌），对面每回合出什么也写死；
// 界面只放行当前这一步要的那一个操作（见 chess-ui.js 里的 lesson）。
// 脚本或文案里的数字改了就跑 node tools/chess_check.mjs：它把整套步骤在规则里走一遍，确认每一步都合法、最后是玩家赢。
import { tile } from './chess.js?v=112a67f0';

const play = (card, r, c, say) => ({ do: 'play', card, t: tile(r, c), say }); // r：离自己城堡几列（0 是家门口）；c：第几路
const end = say => ({ do: 'end', say }), ok = say => ({ do: 'ok', say });     // ok：纯讲解，点“知道了”往下
export const LESSON = {
  lesson: true, name: '新兵训练', area: 'n', base: [10, 6], // 对面的城堡只有 6 点血：进两次门就结束（蛮角兽 3 点，破阵骑士 3 点）
  // 牌序就是抽牌顺序：前四张是起手，后面按顺序补（打出和换掉的牌排到最后）
  mine: ['grapple', 'f5_brundlbeast', 'neutral_astralcrusader', 'lancer', 'squire', 'neutral_jaxi', 'f1s_smite'],
  foe: ['general', 'n_golemrune', 'neutral_rook', 'neutral_golemstone', 'neutral_jaxi', 'squire'],
  foePlays: [['general', tile(4, 1)], ['n_golemrune', tile(4, 1)], ['neutral_rook', tile(4, 0)]], // 对面第几个回合出哪张、放哪格
  foeSay: ['对面也出了兵，朝你冲过来。', '对面放了个大个子挡路。', '对面又出了一个兵。'],
  steps: [
    play('grapple', 0, 1, '目标：把右边那座城堡的血打到 0。先出兵：点「钩锁手」，再点亮起的格子。'),
    end('它有 1 步移动力，一落地就往前走了一格（它的能力要前面有敌人才用得上，这回合先不管）。点「结束回合」，看对面怎么走。'),
    ok('每回合开始，你的兵自动前进一步。撞上敌人互相扣战力：3 对 2，你赢了，还剩 1。'),
    play('f5_brundlbeast', 2, 2, '新兵只能放在前线以内。前线就是你最靠前的兵所在的那一列。把「蛮角兽」放到亮起的格子。'),
    end('它有 2 步，一口气冲到了对面门口。点「结束回合」。'),
    ok('兵走进城门，按自己的战力扣城堡的血。对面只剩 3 了。'),
    { do: 'swap', card: 'neutral_astralcrusader', say: '「星界十字军」要 7 点能量，现在出不起。每回合可以换一张牌：点它，再点「换牌」。' },
    play('f1s_smite', 4, 1, '换来了法术「惩戒」。对面的符文魔像下回合会撞倒你的兵：点「惩戒」，再点它。'),
    end('路清出来了。点「结束回合」。'),
    play('lancer', 3, 2, '你的兵到了对面门口，前线推到了最前面。把「破阵骑士」放到亮起的格子：它有 3 步，直接冲进城门。'),
  ],
  done: '出兵、前进、换牌、法术、冲门，规则就这些。\n正式对局里双方城堡都是 10 点血，电脑会认真还手。',
};
export const keepOrder = () => .999999; // 当随机数交给 newGame：洗牌时每张牌都和自己换，牌序就是上面写的顺序
// 这个操作是不是脚本当前这一步要的
export const stepOk = (st, s, a) => !!st && (st.do === 'end' ? a.type === 'end' : a.type === st.do && s.hand[s.turn][a.i] === st.card && (st.do === 'swap' || a.t === st.t));
// 对面这个回合照脚本走什么（脚本走完了就只结束回合）
export function foeTurn(s) { const [card, t] = LESSON.foePlays[s.n / 2 - 1] || [], i = s.hand[s.turn].indexOf(card); return [...(i >= 0 ? [{ type: 'play', i, t }] : []), { type: 'end' }]; }
