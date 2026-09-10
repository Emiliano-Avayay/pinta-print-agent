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
function Convert-PintaScriptsToUtf8Bom([string]$scriptsRoot) {
  $utf8WithBom = New-Object System.Text.UTF8Encoding($true)
  Get-ChildItem -LiteralPath $scriptsRoot -Filter '*.ps1' -File | ForEach-Object {
    $content = [System.IO.File]::ReadAllText($_.FullName, [System.Text.Encoding]::UTF8)
    [System.IO.File]::WriteAllText($_.FullName, $content, $utf8WithBom)
  }
}
function Assert-ConfigureScriptEncoding([string]$configurePath) {
  $bytes = [System.IO.File]::ReadAllBytes($configurePath)
  if ($bytes.Length -lt 3 -or $bytes[0] -ne 0xEF -or $bytes[1] -ne 0xBB -or $bytes[2] -ne 0xBF) {
    throw "configure.ps1 debe entregarse como UTF-8 con BOM para Windows PowerShell 5.1: $configurePath"
  }
  $content = [System.Text.Encoding]::UTF8.GetString($bytes, 3, $bytes.Length - 3)
  foreach ($word in @('conexión', 'impresión', 'diagnóstico', 'configuración')) {
    if ($content.IndexOf($word, [System.StringComparison]::OrdinalIgnoreCase) -lt 0) { throw "configure.ps1 perdió '$word' durante la preparación del instalador." }
  }
}
function Get-Sha256([string]$path) {
  if (Get-Command Get-FileHash -ErrorAction SilentlyContinue) {
    return (Get-FileHash -Algorithm SHA256 -LiteralPath $path).Hash.ToLowerInvariant()
  }

  $stream = [System.IO.File]::OpenRead($path)
  $hasher = [System.Security.Cryptography.SHA256]::Create()
  try {
    return ([System.BitConverter]::ToString($hasher.ComputeHash($stream))).Replace('-', '').ToLowerInvariant()
  } finally {
    $hasher.Dispose()
    $stream.Dispose()
  }
}

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
$actual = Get-Sha256 $archive
if ($actual -ne $expected.ToLowerInvariant()) { Remove-Item -LiteralPath $archive -Force; throw "Checksum inválido para $archiveName. La descarga fue eliminada." }

if (Test-Path -LiteralPath $stageRoot) { Remove-Item -LiteralPath $stageRoot -Recurse -Force }
New-Item -ItemType Directory -Force -Path $runtimeRoot | Out-Null
Expand-Archive -LiteralPath $archive -DestinationPath $cacheRoot -Force
$extracted = Join-Path $cacheRoot "node-v$nodeVersion-win-x64"
Copy-Item -LiteralPath (Join-Path $extracted 'node.exe') -Destination (Join-Path $runtimeRoot 'node.exe')
Copy-Item -LiteralPath (Join-Path $sourceRoot 'dist') -Destination (Join-Path $stageRoot 'app\dist') -Recurse
Copy-Item -LiteralPath (Join-Path $sourceRoot 'package.json') -Destination (Join-Path $stageRoot 'app\package.json')
Copy-Item -LiteralPath (Join-Path $sourceRoot 'scripts\windows') -Destination (Join-Path $stageRoot 'scripts') -Recurse
Convert-PintaScriptsToUtf8Bom (Join-Path $stageRoot 'scripts')
Assert-ConfigureScriptEncoding (Join-Path $stageRoot 'scripts\configure.ps1')
Write-Host "Runtime privado preparado: $runtimeRoot"
