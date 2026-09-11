# build.ps1 — 打包 src/ 为 hkvsz.zip（排除只在开发时用的参考素材）
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
if (-not $root) { $root = (Get-Location).Path }
$src = Join-Path $root "src"
$dist = Join-Path $root "dist"
$zip = Join-Path $dist "hkvsz.zip"
$stage = Join-Path $dist "_stage"

Write-Host "root = $root"
Write-Host "src  = $src"
Write-Host "zip  = $zip"

New-Item -ItemType Directory -Force -Path $dist | Out-Null
if (Test-Path $zip)   { Remove-Item $zip -Force }
if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
New-Item -ItemType Directory -Force -Path $stage | Out-Null

# 拷贝 src/*，排除 frame-anim-example（开发参考素材）
$excludeNames = @("frame-anim-example")
Get-ChildItem -LiteralPath $src -Force | Where-Object {
  $excludeNames -notcontains $_.Name
} | ForEach-Object {
  Copy-Item -LiteralPath $_.FullName -Destination $stage -Recurse -Force
}

$stageGlob = Join-Path $stage "*"
Compress-Archive -Path "$stageGlob" -DestinationPath "$zip" -CompressionLevel Optimal -Force
Remove-Item $stage -Recurse -Force

$size = (Get-Item $zip).Length
Write-Host ("BUILD OK  {0}  ({1:N0} bytes)" -f $zip, $size)
