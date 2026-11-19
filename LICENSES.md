# 第三方素材和代码的许可清单

上架前的硬规矩：包里的每一样第三方东西都要能公开发行（含商业发行）。`tools/build_h5.py` 打包时会读这张表，"可公开发行"写"否"的目录还在包里就报阻塞。

| 目录或文件 | 是什么 | 许可 | 可公开发行 | 依据 | 要不要署名 |
|---|---|---|---|---|---|
| `assets/units` | 全部角色的像素图（待机、移动、出手、受击、倒下） | CC0 1.0 | 是 | 来自 OpenDuelyst 仓库（`raw/open-duelyst/LICENSE` 是 CC0 1.0 全文），切帧脚本在 `design/all-units/` | 不要求 |
| `assets/audio` | 17 首音乐、33 个音效 | CC0 1.0 | 是 | 逐条出处和许可原话见 `assets/audio/CREDITS.md`（7 个 itch 素材包，页面写明 CC0） | 不要求，作者说欢迎致谢 |
| `assets/icons` | 法术牌和装备牌的图标（65 个） | 自制 | 是 | 全部用代码画：`tools/draw_icons.py`（16×16 的像素模板，自动描边，放大 2 倍）。原来用的 Raven 图标包免费版仅限非商业项目，2026-11-18 已全部换掉 | — |
| `assets/ui/digits.png`、`digits-pad.png` | 像素数字 | 自制 | 是 | `tools/make_digits.py` 生成 | — |
| `vendor/` | three.js r180 及其后期处理模块 | MIT | 是 | `vendor/three.LICENSE` | 保留许可文件即可 |
| `vendor/pixelfx/` | pixelfx 像素特效库（两百多个用代码画的特效：刀光、爆炸、法术、天气、小动物……对局里现算现播），用法见 `board-pfx.js`、`ui-pfx.js` | MIT | 是 | `vendor/pixelfx/LICENSE`（Copyright 2026 Patch、Hugo Duprez）和 `vendor/pixelfx/NOTICE.md`；来自 patch-gg/pixelfx 的网页版源码，取自它的 Godot 移植仓库 winkidney/pixelfx-godot 的 `src/`，只拿了 `core` 和 `fx`（没拿它的字体，字体不在 MIT 范围内） | 保留许可文件和声明即可 |
| `vendor/peerjs.min.js` | PeerJS 1.5.4（联机房间用，WebRTC 点对点） | MIT | 是 | `vendor/peerjs.LICENSE`。运行时会连 PeerJS 的公共中转（0.peerjs.com）和 STUN/TURN，所以离线包里要么关掉房间功能，要么换成自己的中转 | 保留许可文件即可 |
| `assets/avatars` | 锦标赛里十位以 AI 命名的选手头像（每人四种表情，48×48 像素画） | MIT | 是（商标另议，见右栏） | 由 `tools/pixel_avatars.py` 从 meow-ai-arena（github.com/chen-006/meow-ai-arena）的表情立绘像素化，`assets/avatars/LICENSE` 是 MIT 全文，`NOTICE.md` 写了出处。立绘里有几位带着原公司标志（OpenAI、xAI、Kimi、小米等的发饰），像素化后仍认得出；名字是“克劳德”“GPT嗖”这类致敬名。上架前要再评估商标风险 | 要：角色形象设计：小叶子XIYZ；美术和制作：喵了个猫了个咪了个猫；附仓库链接 |
| `assets/ai` | 自由对战"大师"难度的局面价值网络权重 | 自制 | 是 | 电脑自我对打训练出来的数字，`tools/lab/`（`gen.mjs` 出数据、`train.mjs` 训练） | — |
| 场景、界面、一部分特效 | 全部用代码画 | 自制 | 是 | `board3d.js`、`style.css`、`motion.css`（像素特效用的是上面的 pixelfx） | — |
| `arenas/` | 七套试玩用的对战盘场景（贴图、小件、光效） | 自制 | 是 | 全部用代码逐像素画，没有外部图片，也没有 AI 生成的画面；每个文件夹自成一套。目前不在 `tools/build_h5.py` 的打包清单里，线上包不带 | — |
| 卡牌名字、说明、数值、关卡 | 自己写的 | 自制 | 是 | `chess-cards.js`、`campaign.js`。规则框架参考了 Stormbound 的公开玩法，没有用它的名字、文字、图 | — |

## 没有进包、也不能进包的东西

- `raw/`：下载的原始素材（OpenDuelyst 整仓、图标包、音频包）。
- `design/kitty-study/` 和下载目录里的 stormbound-kitty 存档：别人的网站内容，只用来研究，任何图、文字都不进游戏。
- 旧的解谜页和对战页（`index.html`、`duel.html`）用过 itch 上的爆炸特效包和 8 个试玩角色，许可没有逐项核对，不进包。

## 上架前还要处理

1. 游戏里加一页"致谢"，列出 OpenDuelyst、音频作者、three.js，以及锦标赛头像的署名（角色形象设计：小叶子XIYZ；美术和制作：喵了个猫了个咪了个猫；meow-ai-arena 仓库链接）。
2. 角色图来自 Duelyst 这款游戏公开的 CC0 素材。CC0 放弃的是版权，不含商标；游戏名、商店页、截图说明里不要出现 "Duelyst" 的名字和标志。
3. `raw/icons/`（Raven 图标包的原始文件）已经不再使用，可以删掉；它本来就不进包。
