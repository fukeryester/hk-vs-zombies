# deploy.ps1 — 上传到 GameHub（UTF-8 安全版）
# 用法：
#   .\deploy.ps1                            # 首次创建
#   .\deploy.ps1 -ProjectId abcd...         # 已有项目，加新版本
#   .\deploy.ps1 -Progression               # 同时 PUT progression schema
param(
  [string]$Token = "gh_Osb-oazIaXWCbxxNPeLoMb4aQmticJVkx-yn1NGuLCg",
  [string]$Base = "http://101.43.19.238",
  [string]$Title = "香港大战僵尸",
  [string]$Description = "拾荒·建筑·爆兵·收割 · 一条中路见真章。3+3 文明 · 1v1/2v2 · PVP + AI",
  [string]$Tags = "strategy,multiplayer,action,arcade,horror",
  [string]$ProjectId = "",
  [string]$Changelog = "首个版本",
  [string]$Label = "",
  [switch]$Progression
)

$ErrorActionPreference = "Stop"
# 让 curl.exe 通过管道回传给 PowerShell 的字节按 UTF-8 解码，避免 GBK 破坏 JSON
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$root = $PSScriptRoot
if (-not $root) { $root = (Get-Location).Path }
$zip = Join-Path $root "dist\hkvsz.zip"
if (-not (Test-Path $zip)) { throw "找不到 $zip，请先跑 build.ps1" }

# ============ UTF-8 关键：把中文字段写到 UTF-8 无 BOM 文件，然后用 curl.exe -F "name=<@file" 从文件读 ============
$tmp = Join-Path $env:TEMP ("hkvz_deploy_" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Force -Path $tmp | Out-Null

function Write-Utf8 {
  param([string]$Path, [string]$Text)
  $enc = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($Path, $Text, $enc)
}

$titleFile     = Join-Path $tmp "title.txt"
$descFile      = Join-Path $tmp "description.txt"
$tagsFile      = Join-Path $tmp "tags.txt"
$changelogFile = Join-Path $tmp "changelog.txt"
Write-Utf8 $titleFile     $Title
Write-Utf8 $descFile      $Description
Write-Utf8 $tagsFile      $Tags
Write-Utf8 $changelogFile $Changelog

Write-Host "== token healthcheck ==" -ForegroundColor Cyan
& curl.exe -s -H "Authorization: Bearer $Token" "$Base/api/v1/me"
Write-Host ""

# 通用响应文件（curl -o 直写字节，避免 GBK 管道破坏 UTF-8）
$respFile = Join-Path $tmp "resp.json"
$common = @("-s", "-o", $respFile, "-H", "Authorization: Bearer $Token")

if ([string]::IsNullOrEmpty($ProjectId)) {
  Write-Host "== creating new project + first version ==" -ForegroundColor Cyan
  $curlArgs = $common + @(
    "-F", "title=<$titleFile",
    "-F", "description=<$descFile",
    "-F", "tags=<$tagsFile",
    "-F", "changelog=<$changelogFile",
    "-F", "engine=html",
    "-F", "published=1",
    "-F", "file=@$zip",
    "$Base/api/v1/games"
  )
} else {
  Write-Host "== adding version to project $ProjectId ==" -ForegroundColor Cyan
  $curlArgs = $common + @(
    "-F", "changelog=<$changelogFile",
    "-F", "file=@$zip"
  )
  if ($Label) {
    $labelFile = Join-Path $tmp "label.txt"
    Write-Utf8 $labelFile $Label
    $curlArgs += @("-F", "label=<$labelFile")
  }
  $curlArgs += "$Base/api/v1/projects/$ProjectId/versions"
}
& curl.exe @curlArgs
$resp = [System.IO.File]::ReadAllText($respFile, [System.Text.Encoding]::UTF8)
Write-Host $resp

# 从响应里提取 project id（首次创建时）
if ([string]::IsNullOrEmpty($ProjectId)) {
  try {
    $j = $resp | ConvertFrom-Json
    if ($j -and $j.game -and $j.game.id) {
      $ProjectId = $j.game.id
      Write-Host ""
      Write-Host "PROJECT ID: $ProjectId" -ForegroundColor Green
      Write-Host "PLAY URL:   $($j.game.play_url)" -ForegroundColor Green
    }
  } catch {
    Write-Host "无法解析响应 JSON: $_" -ForegroundColor Yellow
  }
}

# PUT progression（用 curl -o 直接写文件，避免管道被 GBK 破坏）
if ($Progression -and $ProjectId) {
  Write-Host ""
  Write-Host "== PUT progression schema ==" -ForegroundColor Cyan
  $prog = Join-Path $root "progression.json"
  $progRespFile = Join-Path $tmp "progression_resp.json"
  & curl.exe -s -o $progRespFile -X PUT `
    -H "Authorization: Bearer $Token" `
    -H "Content-Type: application/json; charset=utf-8" `
    --data-binary "@$prog" `
    "$Base/api/v1/projects/$ProjectId/progression"
  $r2 = [System.IO.File]::ReadAllText($progRespFile, [System.Text.Encoding]::UTF8)
  try {
    $pj = $r2 | ConvertFrom-Json
    if ($pj.ok) {
      Write-Host ("imported: stats={0} achievements={1} leaderboards={2} displays={3}" -f $pj.imported.stats, $pj.imported.achievements, $pj.imported.leaderboards, $pj.imported.displays) -ForegroundColor Green
    } else {
      Write-Host "PUT progression FAILED:" -ForegroundColor Red
      Write-Host $r2
    }
  } catch {
    Write-Host $r2
  }
}

Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
Write-Host ""
Write-Host "DONE." -ForegroundColor Green
