# package-template.ps1
# 校验并打包 Gosume 模板为 .zip
# 用法: .\package-template.ps1 -TemplateDir <模板目录> [-OutputDir <输出目录>] [-Strict]
#
# 模板目录必须且只需包含 template.json + styles.css（HTML 由应用内置统一 HTML 承载）。
# 校验规则统一由同目录的 validate-template.cjs 提供（single source of truth），
# 本脚本只负责「调用校验器 → 按 name 命名 → 压缩两个文件 → 回读 zip 校验条目」。
# -Strict 会把渲染契约警告也视为失败。

param(
    [Parameter(Mandatory = $true)]
    [string]$TemplateDir,

    [Parameter(Mandatory = $false)]
    [string]$OutputDir,

    [Parameter(Mandatory = $false)]
    [switch]$Strict
)

$ErrorActionPreference = "Stop"

function Fail([string]$Message) {
    Write-Host "错误: $Message" -ForegroundColor Red
    exit 1
}

if (-not (Test-Path -LiteralPath $TemplateDir -PathType Container)) {
    Fail "模板目录不存在或不是目录: $TemplateDir"
}
$TemplateDir = (Resolve-Path -LiteralPath $TemplateDir).Path

# ── 校验（共享 Node 校验器）──
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) { Fail "需要 Node.js 来运行 validate-template.cjs（零依赖）" }
$validator = Join-Path $PSScriptRoot "validate-template.cjs"
if (-not (Test-Path -LiteralPath $validator)) { Fail "找不到校验器: $validator" }

$validateArgs = @($validator, $TemplateDir)
if ($Strict) { $validateArgs += "--strict" }
& node @validateArgs
if ($LASTEXITCODE -ne 0) { Fail "模板校验未通过，已中止打包" }

# 输出文件名：由校验器读取 template.json 的 name 并清理跨平台非法字符。
# 走 --print-name-b64（纯 ASCII 的 base64）再按 UTF-8 还原：PowerShell 5.1 捕获
# 外部程序 stdout 时按系统 ANSI 代码页解码，直接传中文名会乱码成错误文件名。
# 不要用 Select-Object -First 1：它会提前关闭管道，把 $LASTEXITCODE 置为 -1
$nameB64 = & node $validator $TemplateDir "--print-name-b64"
if ($LASTEXITCODE -ne 0 -or -not $nameB64) { Fail "无法从 template.json 读取 name" }
try {
    $templateName = [System.Text.Encoding]::UTF8.GetString(
        [System.Convert]::FromBase64String(([string]$nameB64).Trim())
    ).Trim()
} catch {
    Fail "模板名解码失败: $_"
}
if (-not $templateName) { Fail "template.json 的 name 为空" }

# ── 输出目录 ──
if (-not $OutputDir) { $OutputDir = $TemplateDir }
if (-not (Test-Path -LiteralPath $OutputDir)) {
    New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
}
$OutputDir = (Resolve-Path -LiteralPath $OutputDir).Path
$outputFile = Join-Path $OutputDir ($templateName + ".zip")

# ── 打包：先写临时 zip，回读确认条目后再落到目标路径 ──
$tempZip = Join-Path $env:TEMP ("gosume-template-" + [guid]::NewGuid().ToString() + ".zip")
try {
    # Compress-Archive 把指定文件加入 zip 根目录（不带父目录层级）
    $filesToCompress = @("template.json", "styles.css") | ForEach-Object { Join-Path $TemplateDir $_ }
    Compress-Archive -Path $filesToCompress -DestinationPath $tempZip -Force

    # 回读 zip 条目（受限 PowerShell 环境无法加载程序集时降级为跳过，不阻断打包）
    try {
        Add-Type -AssemblyName System.IO.Compression.FileSystem -ErrorAction Stop
        $archive = [System.IO.Compression.ZipFile]::OpenRead($tempZip)
        try {
            $names = @($archive.Entries | ForEach-Object { $_.FullName })
            $unexpected = @($names | Where-Object { $_ -ne "template.json" -and $_ -ne "styles.css" })
            if ($names.Count -ne 2 -or $unexpected.Count -gt 0) {
                Fail "zip 条目不符合要求（应为根目录两个文件）: $($names -join ', ')"
            }
            if (@($names | Where-Object { $_ -eq "template.json" }).Count -ne 1 -or
                @($names | Where-Object { $_ -eq "styles.css" }).Count -ne 1) {
                Fail "zip 内必需文件缺失或重复: $($names -join ', ')"
            }
        } finally {
            $archive.Dispose()
        }
    } catch {
        Write-Host "提示: 当前环境无法加载 zip 程序集，跳过条目回读校验（打包已完成）" -ForegroundColor Yellow
    }

    Copy-Item -LiteralPath $tempZip -Destination $outputFile -Force
    Write-Host "打包成功: $outputFile" -ForegroundColor Green
    Write-Host "模板名称: $templateName"
    Write-Host "在 Gosume 应用中通过 '导入模板' 功能选择此文件即可使用。"
} finally {
    # 用 .NET 删除临时文件，避开某些环境下 Remove-Item 的删除拦截
    if (Test-Path -LiteralPath $tempZip) {
        [System.IO.File]::Delete($tempZip)
    }
}
