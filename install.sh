#!/usr/bin/env bash
# 装/更新「青鸟收藏夹」捆绑包(bundle)到 Forsion 家目录。
#   用法:sh install.sh [dev|prod]     缺省 dev(~/.forsion-dev);prod=~/.forsion
# 本仓即 bundle 本体:整目录拷到 <home>/plugins/bluebird/ 一处即完成——
#   桌面识别 manifest.json(UI 插件)+ spaces/(内嵌 Space);
#   引擎(tangu-agent bundles.ts)原地读 agents/(播种一次,含 agent 级技能 skills/bluebird-video)。
# 已播种的 agent 活体(tangu/agents/bluebird 的 MEMORY/LOG)不受重装影响。
set -euo pipefail
MODE="${1:-dev}"
case "$MODE" in
  dev)  HOME_DIR="$HOME/.forsion-dev" ;;
  prod) HOME_DIR="$HOME/.forsion" ;;
  *) echo "用法:sh install.sh [dev|prod]" >&2; exit 2 ;;
esac
HERE="$(cd "$(dirname "$0")" && pwd)"
DEST="$HOME_DIR/plugins/bluebird"

# 不许从已安装目录内自更新:下面的 rm -rf 会先删掉复制源(自己),把插件卸成空壳
if [ "$HERE" = "$(cd "$DEST" 2>/dev/null && pwd || true)" ]; then
  echo "❌ 正在从已安装目录运行,请从源码仓的 bluebird/ 目录执行 install.sh" >&2
  exit 2
fi

mkdir -p "$HOME_DIR/plugins"
rm -rf "$DEST"
cp -R "$HERE" "$DEST"
# 迁移:旧版三件套把 space 装在顶层 spaces/bluebird,会以「用户 Space 优先」遮蔽 bundle 内嵌版。
# 只在它确是青鸟配方(引用 plugin:bluebird: 视图)时,把 space.json 改名备份令其不再注册——
# 目录与用户其他文件原样保留,绝不无差别删除同名用户资产。
OLD_SPACE="$HOME_DIR/spaces/bluebird/space.json"
if grep -q 'plugin:bluebird:' "$OLD_SPACE" 2>/dev/null; then
  mv "$OLD_SPACE" "$OLD_SPACE.pre-bundle.bak"
  echo "   (旧版顶层 Space 配方已备份为 space.json.pre-bundle.bak,不再遮蔽 bundle 内嵌版)"
fi

# 已播种的 agent 活体(MEMORY/LOG/config)不动,但**技能是随包发的代码不是用户状态** ——
# 播种过之后它不会自动跟着重装更新,手动 cp 漏一次就会拿旧脚本跑(2026-08-22 栽过整整四轮)。
SEEDED_SKILL="$HOME_DIR/tangu/agents/bluebird/skills/bluebird-video"
if [ -d "$SEEDED_SKILL" ]; then
  cp -R "$HERE/agents/bluebird/skills/bluebird-video/." "$SEEDED_SKILL/"
  echo "🔄 已同步引擎里播种过的技能副本 → $SEEDED_SKILL"
fi

# 影子副本体检:同名脚本在别的家目录里还有几份?技能定位脚本时先认 $TANGU_HOME,
# 但旧版 SKILL.md 用的是跨家 find|head -1 —— 那种情况下旧副本会**静默遮蔽**这次部署。
SHADOWS=""
for ROOT in "$HOME/.forsion" "$HOME/.forsion-dev" "$HOME/.tangu"; do
  [ "$ROOT" = "$HOME_DIR" ] && continue
  FOUND=$(find "$ROOT" -path '*bluebird*/scripts/transcribe.py' 2>/dev/null || true)
  [ -n "$FOUND" ] && SHADOWS="$SHADOWS$FOUND"$'\n'
done
if [ -n "$SHADOWS" ]; then
  echo ""
  echo "⚠️  别的家目录里还有 transcribe.py 的副本 —— 它们不会被这次部署更新:"
  printf '%s' "$SHADOWS" | while IFS= read -r f; do
    [ -z "$f" ] && continue
    echo "      $(stat -f '%Sm' "$f" 2>/dev/null || echo '?')  $f"
  done
  echo "    本次装的是:$(stat -f '%Sm' "$DEST/agents/bluebird/skills/bluebird-video/scripts/transcribe.py" 2>/dev/null)  $DEST/…"
  echo "    引擎实际跑哪份取决于 SKILL.md 里的定位配方:1.7.0 起先认 \$TANGU_HOME(=运行中的家),"
  echo "    但**旧副本自带的是旧配方**——若用另一个家目录启动,旧脚本会遮蔽本次部署。"
  echo "    要么把那些家目录也 install 一遍,要么确认它们不会被启动。"
  echo ""
fi

echo "✅ 已安装 bundle → $DEST"
echo "   (agent 由引擎启动时播种到 $HOME_DIR/tangu/agents/bluebird/,已存在则保留原样)"
echo "重开 Forsion(dev:重启 desktop)后:命令面板「青鸟收藏夹:打开」,或工作台切到「青鸟收藏夹」Space。"
