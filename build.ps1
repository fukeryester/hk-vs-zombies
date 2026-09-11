# build.ps1 — 打包 src/ 为 hkvsz.zip
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
if (-not $root) { $root = (Get-Location).Path }
$src = Join-Path $root "src"
$dist = Join-Path $root "dist"
$zip = Join-Path $dist "hkvsz.zip"

Write-Host "root = $root"
Write-Host "src  = $src"
Write-Host "zip  = $zip"

New-Item -ItemType Directory -Force -Path $dist | Out-Null
if (Test-Path $zip) { Remove-Item $zip -Force }

$srcGlob = Join-Path $src "*"
Write-Host "srcGlob = $srcGlob"
Compress-Archive -Path "$srcGlob" -DestinationPath "$zip" -CompressionLevel Optimal -Force

$size = (Get-Item $zip).Length
Write-Host ("BUILD OK  {0}  ({1:N0} bytes)" -f $zip, $size)
