#!/usr/bin/env bash
# package-template.sh
# 将模板目录打包为 .zip 文件
# 用法: ./package-template.sh <模板目录> [输出目录]
#
# 模板目录必须包含: template.json, template.html, styles.css
# 输出文件名取自 template.json 的 name 字段，后缀为 .zip

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

# 读取 name（用 python 解析 JSON，兼容 python3）
TEMPLATE_NAME=$(python3 -c "
import json, sys
with open('$TEMPLATE_DIR/template.json', encoding='utf-8') as f:
    data = json.load(f)
print(data.get('name', ''))
" 2>/dev/null || python -c "
import json
with open('$TEMPLATE_DIR/template.json') as f:
    data = json.load(f)
print(data.get('name', ''))
" 2>/dev/null)

if [ -z "$TEMPLATE_NAME" ]; then
    echo "错误: template.json 中缺少 name 字段或解析失败" >&2
    exit 1
fi

# 清理文件名非法字符（/ 和空字符），避免名字含特殊字符时脚本失败
TEMPLATE_NAME=$(echo "$TEMPLATE_NAME" | tr '/\0' '_')
if [ -z "$TEMPLATE_NAME" ]; then
    echo "错误: template.json 的 name 字段清理后为空" >&2
    exit 1
fi

# 确保输出目录存在
mkdir -p "$OUTPUT_DIR"

OUTPUT_FILE="$OUTPUT_DIR/$TEMPLATE_NAME.zip"

# 进入模板目录打包，确保文件在 zip 根目录
(cd "$TEMPLATE_DIR" && zip -j -q "$OUTPUT_FILE" template.json template.html styles.css)

echo "打包成功: $OUTPUT_FILE"
echo "模板名称: $TEMPLATE_NAME"
echo "在 Gosume 应用中通过 '导入模板' 功能选择此文件即可使用。"
