[CmdletBinding()]
param([switch]$PreflightOnly)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$sourceRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$driver = Join-Path $sourceRoot 'vendor\pos-driver\POS Printer Driver Setup V11.3.0.3.exe'
$nodeVersion = '24.12.0'
$archiveName = "node-v$nodeVersion-win-x64.zip"
$baseUrl = "https://nodejs.org/dist/v$nodeVersion"
$cacheRoot = Join-Path $sourceRoot 'installer\cache'
$stageRoot = Join-Path $sourceRoot 'installer\staging'
$runtimeRoot = Join-Path $stageRoot 'app\runtime'
. (Join-Path $PSScriptRoot 'inno-setup.ps1')

function Assert-Required([string]$path, [string]$description) { if (-not (Test-Path -LiteralPath $path)) { throw "$description falta: $path" } }

Assert-Required $driver 'El driver POS requerido'
Assert-Required (Join-Path $sourceRoot 'dist\main.js') 'El build TypeScript'
Assert-Required (Join-Path $sourceRoot 'dist\configurator-cli.js') 'El configurador compilado'
if ($PreflightOnly) { [void](Get-InnoSetupIscc); Write-Host 'Preflight correcto.'; exit 0 }
[void](Get-InnoSetupIscc)

New-Item -ItemType Directory -Force -Path $cacheRoot, $stageRoot | Out-Null
$archive = Join-Path $cacheRoot $archiveName
$checksums = Join-Path $cacheRoot "SHASUMS256-v$nodeVersion.txt"
if (-not (Test-Path -LiteralPath $archive)) { Invoke-WebRequest -UseBasicParsing "$baseUrl/$archiveName" -OutFile $archive }
Invoke-WebRequest -UseBasicParsing "$baseUrl/SHASUMS256.txt" -OutFile $checksums
$expected = ((Get-Content -LiteralPath $checksums) | Where-Object { $_ -match " $([regex]::Escape($archiveName))$" } | Select-Object -First 1).Split(' ', [System.StringSplitOptions]::RemoveEmptyEntries)[0]
if (-not $expected) { throw "No se encontró checksum para $archiveName." }
$actual = (Get-FileHash -Algorithm SHA256 -LiteralPath $archive).Hash.ToLowerInvariant()
if ($actual -ne $expected.ToLowerInvariant()) { Remove-Item -LiteralPath $archive -Force; throw "Checksum inválido para $archiveName. La descarga fue eliminada." }

if (Test-Path -LiteralPath $stageRoot) { Remove-Item -LiteralPath $stageRoot -Recurse -Force }
New-Item -ItemType Directory -Force -Path $runtimeRoot | Out-Null
Expand-Archive -LiteralPath $archive -DestinationPath $cacheRoot -Force
$extracted = Join-Path $cacheRoot "node-v$nodeVersion-win-x64"
Copy-Item -LiteralPath (Join-Path $extracted 'node.exe') -Destination (Join-Path $runtimeRoot 'node.exe')
Copy-Item -LiteralPath (Join-Path $sourceRoot 'dist') -Destination (Join-Path $stageRoot 'app\dist') -Recurse
Copy-Item -LiteralPath (Join-Path $sourceRoot 'package.json') -Destination (Join-Path $stageRoot 'app\package.json')
Copy-Item -LiteralPath (Join-Path $sourceRoot 'scripts\windows') -Destination (Join-Path $stageRoot 'scripts') -Recurse
Write-Host "Runtime privado preparado: $runtimeRoot"
