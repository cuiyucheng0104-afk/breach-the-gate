#!/bin/sh
# 发布试玩网页：打包游戏 → 拼出网站（首页是试玩入口和反馈表，play/ 下是游戏）→ 推到仓库的 gh-pages 分支。
# 用法（项目根目录）：sh tools/publish_pages.sh
set -e
cd "$(dirname "$0")/.."
python3 -I tools/build_h5.py --web   # 试玩网页保留房间对战和大模型对手（TapTap 包才去掉）
VER="$(date +%Y-%m-%d) $(git rev-parse --short HEAD 2>/dev/null || echo 本地)"
SITE="$(mktemp -d)"
cp -R dist/breach-the-gate "$SITE/play"
sed "s/__VERSION__/$VER/g" pages/index.html > "$SITE/index.html"
touch "$SITE/.nojekyll"                     # 不让 GitHub 用 Jekyll 处理，文件原样发布
URL="$(git remote get-url origin)"
cd "$SITE"
git init -q -b gh-pages
git add -A
git -c user.name="$(git -C "$OLDPWD" config user.name)" -c user.email="$(git -C "$OLDPWD" config user.email)" commit -q -m "发布试玩网页 $VER"
git push -q -f "$URL" gh-pages
cd "$OLDPWD"; rm -rf "$SITE"
echo "已发布：$VER"
