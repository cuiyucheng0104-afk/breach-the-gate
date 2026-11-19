# 打 TapTap 的网页游戏包（H5 包）：把游戏运行时真正用到的文件拷到 dist/breach-the-gate/，入口改名 index.html，再压成 dist/yibu-fanpan-h5.zip。
# TapTap 的要求（taptap-cli 自带说明）：压缩包根目录只能有一个游戏文件夹，index.html 在这个文件夹的第一层。
# 脚本顺带做三件体检：有没有请求外部网址、包有多大、有没有许可不允许公开发行的素材（见 LICENSES.md 里标“否”的目录）。
# 用法（项目根目录）：python3 -I tools/build_h5.py
import hashlib, re, shutil, sys, zipfile
from pathlib import Path
ROOT, OUT, NAME = Path('.'), Path('dist'), 'breach-the-gate'
DIRS = ['assets/units', 'assets/icons', 'assets/ui', 'assets/audio', 'assets/avatars', 'assets/ai', 'vendor']           # 整个目录带上的素材
SKIP = re.compile(r'(^|/)(\.DS_Store|CREDITS\.md|.*\.map)$')
html = (ROOT / 'board.html').read_text(encoding='utf-8')
html = re.sub(r'<a\b[^>]*href="(?:index|duel)\.html"[^>]*>.*?</a>', '', html, flags=re.S)  # 旧的解谜页和对战页不进包，入口链接去掉
todo, seen = [], set()
for m in re.finditer(r'<script[^>]*\bsrc="([^"]+)"', html): todo.append(m.group(1))
for m in re.finditer(r'<link[^>]*\bhref="([^"]+\.css)"', html): todo.append(m.group(1))
maps = dict(re.findall(r'"(three[^"]*)"\s*:\s*"\./([^"]+)"', html))                        # importmap：three → vendor/…
def resolve(spec, base):
    for k, v in maps.items():
        if spec == k: return v
        if k.endswith('/') and spec.startswith(k): return v + spec[len(k):]
    if spec.startswith('.'): return str((Path(base).parent / spec).as_posix()).lstrip('./') if not spec.startswith('/') else spec.lstrip('/')
    return None
while todo:
    f = todo.pop().split('?')[0]; f = str(Path(f).as_posix())
    if f in seen or not (ROOT / f).is_file(): continue
    seen.add(f); text = (ROOT / f).read_text(encoding='utf-8', errors='replace')
    if f.endswith(('.js', '.mjs')):
        for m in re.finditer(r'''(?:from\s*|import\s*\(\s*|import\s+)['"]([^'"]+)['"]''', text):
            r = resolve(m.group(1), f)
            if r: todo.append(r)
    if f.endswith('.css'):
        for m in re.finditer(r'url\(\s*["\']?([^"\')]+)', text):
            if not m.group(1).startswith('data:'): todo.append(str((Path(f).parent / m.group(1)).as_posix()))
game = OUT / NAME
if OUT.exists(): shutil.rmtree(OUT)
game.mkdir(parents=True)
(game / 'index.html').write_text(html, encoding='utf-8')
for f in sorted(seen): (game / f).parent.mkdir(parents=True, exist_ok=True); shutil.copyfile(ROOT / f, game / f)
for d in DIRS:
    for p in (ROOT / d).rglob('*'):
        if p.is_file() and not SKIP.search(p.as_posix()): (game / p).parent.mkdir(parents=True, exist_ok=True); shutil.copyfile(p, game / p)
# TapTap 首版不提供联网功能：隐藏“房间对战”（要连 PeerJS 公共中转）和“AI（大模型）”难度（要玩家自己填外部接口）。
# 只改包里的副本，源码不动；找不到要改的字符串就让打包失败，免得悄悄带着联网功能上架。
def cut(f, old, new):
    p = game / f; t = p.read_text(encoding='utf-8')
    if old not in t: sys.exit(f'TapTap 包要去掉联网功能，但 {f} 里找不到：{old[:40]}')
    p.write_text(t.replace(old, new, 1), encoding='utf-8')
cut('chess-ui.js', ", ai: ['AI（大模型）', null]", '')
cut('index.html', '</head>', '<style>#roombtn,#aibtn{display:none!important}</style></head>')
(game / 'vendor/peerjs.min.js').unlink(missing_ok=True); (game / 'vendor/peerjs.LICENSE').unlink(missing_ok=True)
# 大模型对手整个拿掉（资质里声明了不提供 AI 服务）：设置框换成没有文字的空壳（chess-ui.js 载入时要绑这些 id），llm.js 换成同样接口、永远“没开”的空壳，包里不留发请求的代码
SHELL = '<dialog id="aidlg" hidden><select id="aistyle"></select><input id="aiurl"><input id="aikey"><input id="aimodel"><p id="aistat"></p><button id="aisave"></button><button id="aitest"></button><button id="aiclose"></button></dialog>\n'
p = game / 'index.html'; t = p.read_text(encoding='utf-8'); t2 = re.sub(r'<dialog id="aidlg".*?</dialog>\s*', SHELL, t, count=1, flags=re.S)
if t2 == t: sys.exit('TapTap 包要去掉大模型对手，但 index.html 里找不到 AI 设置框')
t3 = re.sub(r'<button id="aibtn"[^>]*>.*?</button>', '<button id="aibtn" hidden></button>', t2, count=1)
if t3 == t2: sys.exit('TapTap 包要去掉大模型对手，但 index.html 里找不到 AI 设置按钮')
t2 = t3
p.write_text(t2, encoding='utf-8')
(game / 'taproom.js').write_text("// TapTap 版先不带联机（见 tools/build_h5.py），联网资质弄清楚再打开\nexport const available = () => false;\nexport const match = async () => { throw new Error('暂不提供联机。'); };\n", encoding='utf-8')
(game / 'llm.js').write_text("// TapTap 版没有大模型对手（见 tools/build_h5.py）\nexport const last = { ms: 0, why: '', reply: '' };\nexport const cfg = () => ({});\nexport const save = () => {};\nexport const enabled = () => false;\nexport const ping = async () => ({ ok: false, msg: '' });\nexport const llmTurn = async () => [];\n", encoding='utf-8')
# 版本号：入口页引用的脚本和样式、脚本之间互相引用的地址都带上 ?v=版本。浏览器会把文件缓存十分钟（GitHub Pages 定的），
# 不带版本的话刚发布完会出现“新页面配旧脚本”——按钮在、点了没反应。带上之后新页面一定取新脚本；vendor 里的库不常变，不动
V = hashlib.sha1(b''.join((ROOT / f).read_bytes() for f in sorted(seen))).hexdigest()[:8]
stamp = lambda text: re.sub(r'''((?:from\s*|import\s*\(\s*|import\s+)['"])(\.{1,2}/[^'"?]+\.js)(['"])''', lambda m: f'{m.group(1)}{m.group(2)}?v={V}{m.group(3)}', text)
for f in seen:
    if f.endswith('.js') and not f.startswith('vendor/'): (game / f).write_text(stamp((game / f).read_text(encoding='utf-8')), encoding='utf-8')
page = (game / 'index.html').read_text(encoding='utf-8')
page = re.sub(r'(<script[^>]*\bsrc=")([^"?]+\.js)(")', lambda m: f'{m.group(1)}{m.group(2)}?v={V}{m.group(3)}', page)
page = re.sub(r'(<link[^>]*\bhref=")([^"?]+\.css)(")', lambda m: f'{m.group(1)}{m.group(2)}?v={V}{m.group(3)}', page)
(game / 'index.html').write_text(page, encoding='utf-8')
files = [p for p in game.rglob('*') if p.is_file()]
zp = OUT / f'{NAME}-h5.zip'
with zipfile.ZipFile(zp, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    for p in sorted(files): z.write(p, p.relative_to(OUT).as_posix())
size = sum(p.stat().st_size for p in files)
print(f'文件 {len(files)} 个，共 {size / 1048576:.1f} MB；压缩包 {zp} {zp.stat().st_size / 1048576:.1f} MB')
by = {}
for p in files: k = '/'.join(p.relative_to(game).parts[:2]) if len(p.relative_to(game).parts) > 1 else '(根目录)'; by[k] = by.get(k, 0) + p.stat().st_size
print('  ' + '，'.join(f'{k} {v / 1048576:.1f}MB' for k, v in sorted(by.items(), key=lambda x: -x[1])[:8]))
# 体检一：运行时不能请求外部网址（离线的网页游戏资质最简单）
bad = []
for p in files:
    if p.suffix in ('.js', '.css', '.html') and 'vendor' not in p.parts:
        for m in re.finditer(r'''["'(](https?://[^"')\s]+)''', p.read_text(encoding='utf-8', errors='replace')):
            if 'w3.org' not in m.group(1): bad.append(f'{p.relative_to(game)}: {m.group(1)[:60]}')
print('外部网址：' + ('无' if not bad else '有 ' + str(len(bad)) + ' 处 → ' + '；'.join(bad[:5])))
# 体检二：许可。LICENSES.md 的表格里“可公开发行”一栏写“否”的目录，包里不该有
lic = (ROOT / 'LICENSES.md').read_text(encoding='utf-8') if (ROOT / 'LICENSES.md').exists() else ''
block = [c[0].strip('` ') for c in (l.strip('|').split('|') for l in lic.splitlines() if l.startswith('|')) if len(c) > 3 and c[3].strip().startswith('否')]
hit = [d for d in block if (game / d).exists()]
print('许可阻塞：' + ('无' if not hit else '；'.join(hit) + '（许可不允许公开发行，上架前必须换掉）'))
sys.exit(1 if bad else 0)
