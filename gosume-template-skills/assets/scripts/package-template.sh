#!/usr/bin/env bash
# package-template.sh
# 将模板目录打包为 .gosume-template 文件（本质是 ZIP）
# 用法: ./package-template.sh <模板目录> [输出目录]
#
# 模板目录必须包含: template.json, template.html, styles.css
# 输出文件名取自 template.json 的 id 字段，后缀为 .gosume-template

set -euo pipefail

TEMPLATE_DIR="${1:?用法: $0 <模板目录> [输出目录]}"
OUTPUT_DIR="${2:-$TEMPLATE_DIR}"

if [ ! -d "$TEMPLATE_DIR" ]; then
    echo "错误: 模板目录不存在或不是目录: $TEMPLATE_DIR" >&2
    exit 1
fi

# 检查必需文件
for file in template.json template.html styles.css; do
    if [ ! -f "$TEMPLATE_DIR/$file" ]; then
        echo "错误: 缺少必需文件: $file (在 $TEMPLATE_DIR)" >&2
        exit 1
    fi
done

# 检查 zip 命令
if ! command -v zip >/dev/null 2>&1; then
    echo "错误: 需要 zip 命令，请先安装（如 brew install zip / apt install zip）" >&2
    exit 1
fi

# 读取 id（用 python 解析 JSON，兼容 python3）
TEMPLATE_ID=$(python3 -c "
import json, sys
with open('$TEMPLATE_DIR/template.json', encoding='utf-8') as f:
    data = json.load(f)
print(data.get('id', ''))
" 2>/dev/null || python -c "
import json
with open('$TEMPLATE_DIR/template.json') as f:
    data = json.load(f)
print(data.get('id', ''))
" 2>/dev/null)

if [ -z "$TEMPLATE_ID" ]; then
    echo "错误: template.json 中缺少 id 字段或解析失败" >&2
    exit 1
fi

# 校验 id 格式
if ! echo "$TEMPLATE_ID" | grep -Eq '^[A-Za-z0-9][A-Za-z0-9_-]{1,63}$'; then
    echo "错误: template id 格式非法: '$TEMPLATE_ID' (必须 2-64 字符，仅字母数字下划线连字符)" >&2
    exit 1
fi

# 确保输出目录存在
mkdir -p "$OUTPUT_DIR"

OUTPUT_FILE="$OUTPUT_DIR/$TEMPLATE_ID.gosume-template"

# 进入模板目录打包，确保文件在 zip 根目录
(cd "$TEMPLATE_DIR" && zip -j -q "$OUTPUT_FILE" template.json template.html styles.css)

echo "打包成功: $OUTPUT_FILE"
echo "模板 ID: $TEMPLATE_ID"
echo "在 Gosume 应用中通过 '导入模板' 功能选择此文件即可使用。"
