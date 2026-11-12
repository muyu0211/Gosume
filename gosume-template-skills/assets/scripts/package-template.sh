#!/usr/bin/env bash
# package-template.sh
# 校验并打包 Gosume 模板为 .zip
# 用法: ./package-template.sh <模板目录> [输出目录] [--strict]
#
# 模板目录必须且只需包含 template.json + styles.css（HTML 由应用内置统一 HTML 承载）。
# 校验规则统一由同目录的 validate-template.cjs 提供（single source of truth），
# 本脚本只负责「调用校验器 → 按 name 命名 → 压缩两个文件 → 回读 zip 校验条目」。
# 打包优先用 Python 标准库 zipfile（跨平台，Windows Git Bash 常无 zip 命令），
# 无 Python 时回退 zip -j。

set -euo pipefail

TEMPLATE_DIR="${1:?用法: $0 <模板目录> [输出目录] [--strict]}"
OUTPUT_DIR=""
STRICT_ARGS=()
for arg in "${@:2}"; do
    case "$arg" in
        --strict) STRICT_ARGS=(--strict) ;;
        *) OUTPUT_DIR="$arg" ;;
    esac
done
[ -n "$OUTPUT_DIR" ] || OUTPUT_DIR="$TEMPLATE_DIR"

if [ ! -d "$TEMPLATE_DIR" ]; then
    echo "错误: 模板目录不存在或不是目录: $TEMPLATE_DIR" >&2
    exit 1
fi

# ── 校验（共享 Node 校验器）──
if ! command -v node >/dev/null 2>&1; then
    echo "错误: 需要 Node.js 来运行 validate-template.cjs（零依赖）" >&2
    exit 1
fi
VALIDATOR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/validate-template.cjs"
if [ ! -f "$VALIDATOR" ]; then
    echo "错误: 找不到校验器: $VALIDATOR" >&2
    exit 1
fi

TEMPLATE_DIR="$(cd "$TEMPLATE_DIR" && pwd)"
node "$VALIDATOR" "$TEMPLATE_DIR" "${STRICT_ARGS[@]}" || {
    echo "错误: 模板校验未通过，已中止打包" >&2
    exit 1
}
TEMPLATE_NAME="$(node "$VALIDATOR" "$TEMPLATE_DIR" --print-name)"
if [ -z "$TEMPLATE_NAME" ]; then
    echo "错误: 无法从 template.json 读取 name" >&2
    exit 1
fi

# ── 输出目录（转绝对路径：打包时会 cd 进模板目录）──
mkdir -p "$OUTPUT_DIR"
OUTPUT_DIR="$(cd "$OUTPUT_DIR" && pwd)"
OUTPUT_FILE="$OUTPUT_DIR/$TEMPLATE_NAME.zip"

PYTHON_BIN="$(command -v python3 || command -v python || true)"

if [ -n "$PYTHON_BIN" ]; then
    "$PYTHON_BIN" - "$TEMPLATE_DIR" "$OUTPUT_FILE" <<'PY'
import os, sys, zipfile
src, dst = sys.argv[1], sys.argv[2]
with zipfile.ZipFile(dst, 'w', zipfile.ZIP_DEFLATED) as z:
    for name in ('template.json', 'styles.css'):
        z.write(os.path.join(src, name), name)  # arcname 不带父目录，文件落在 zip 根目录
PY
    # 回读确认 zip 内恰好两个根文件
    "$PYTHON_BIN" - "$OUTPUT_FILE" <<'PY'
import sys, zipfile
with zipfile.ZipFile(sys.argv[1]) as z:
    names = z.namelist()
if sorted(names) != ['styles.css', 'template.json']:
    raise SystemExit('zip 条目不符合要求: ' + ', '.join(names))
PY
elif command -v zip >/dev/null 2>&1; then
    (cd "$TEMPLATE_DIR" && zip -j -q "$OUTPUT_FILE" template.json styles.css)
else
    echo "错误: 需要 python3（或 python）或 zip 命令来完成打包" >&2
    exit 1
fi

echo "打包成功: $OUTPUT_FILE"
echo "模板名称: $TEMPLATE_NAME"
echo "在 Gosume 应用中通过 '导入模板' 功能选择此文件即可使用。"
