# package-template.ps1
# 将模板目录打包为 .zip 文件
# 用法: .\package-template.ps1 -TemplateDir <模板目录> [-OutputDir <输出目录>]
#
# 模板目录必须包含: template.json, styles.css（Gosume 一期改造后无 HTML）
# 输出文件名取自 template.json 的 name 字段，后缀为 .zip

param(
    [Parameter(Mandatory = $true)]
    [string]$TemplateDir,

    [Parameter(Mandatory = $false)]
    [string]$OutputDir
)

$ErrorActionPreference = "Stop"

# 规范化路径
$TemplateDir = (Resolve-Path $TemplateDir).Path

if (-not (Test-Path $TemplateDir -PathType Container)) {
    Write-Error "模板目录不存在或不是目录: $TemplateDir"
    exit 1
}

# 检查必需文件
$requiredFiles = @("template.json", "styles.css")
foreach ($file in $requiredFiles) {
    $path = Join-Path $TemplateDir $file
    if (-not (Test-Path $path -PathType Leaf)) {
        Write-Error "缺少必需文件: $file (在 $TemplateDir)"
        exit 1
    }
}

# 读取 template.json 获取 name（用作输出文件名）
$jsonPath = Join-Path $TemplateDir "template.json"
try {
    $json = Get-Content $jsonPath -Raw -Encoding UTF8 | ConvertFrom-Json
} catch {
    Write-Error "解析 template.json 失败: $_"
    exit 1
}

$templateName = $json.name
if (-not $templateName) {
    Write-Error "template.json 中缺少 name 字段"
    exit 1
}

# 清理 Windows 文件名非法字符，避免用户给的名字含特殊字符时脚本失败
$templateName = ($templateName -replace '[\\/:\*\?"<>\|]', '_').Trim()
if (-not $templateName) {
    Write-Error "template.json 的 name 字段清理后为空"
    exit 1
}


# 校验 paper_size
if ($json.paper_size -ne "A4") {
    Write-Error "paper_size 必须为 'A4'，当前为: '$($json.paper_size)'"
    exit 1
}

# 确定输出目录
if (-not $OutputDir) {
    $OutputDir = $TemplateDir
}
if (-not (Test-Path $OutputDir)) {
    New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
}
$OutputDir = (Resolve-Path $OutputDir).Path

# 输出文件路径
$outputFile = Join-Path $OutputDir "$templateName.zip"

# 临时 zip 路径
$tempZip = Join-Path $env:TEMP "gosume-template-$([guid]::NewGuid().ToString()).zip"

try {
    # Compress-Archive 会把指定文件加入 zip 根目录（不带父目录）
    $filesToCompress = $requiredFiles | ForEach-Object { Join-Path $TemplateDir $_ }
    Compress-Archive -Path $filesToCompress -DestinationPath $tempZip -Force

    # 复制为 .zip
    Copy-Item -Path $tempZip -Destination $outputFile -Force

    Write-Host "打包成功: $outputFile" -ForegroundColor Green
    Write-Host "模板名称: $templateName"
    Write-Host "在 Gosume 应用中通过 '导入模板' 功能选择此文件即可使用。"
} finally {
    if (Test-Path $tempZip) {
        Remove-Item $tempZip -Force
    }
}
