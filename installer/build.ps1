[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$sourceRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
. (Join-Path $PSScriptRoot 'inno-setup.ps1')
Push-Location $sourceRoot
try {
  & npm.cmd run build
  if ($LASTEXITCODE -ne 0) { throw 'npm run build falló.' }
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'prepare.ps1')
  if ($LASTEXITCODE -ne 0) { throw 'La preparación del instalador falló.' }
  $version = (Get-Content -Raw (Join-Path $sourceRoot 'package.json') | ConvertFrom-Json).version
  $isccCommand = Get-Command ISCC.exe -ErrorAction SilentlyContinue
  if ($isccCommand) {
    $iscc = $isccCommand.Source
  } else {
    $iscc = $null
  }
  if (-not $iscc) {
    $candidates = @(
      Get-ExistingInnoSetupCandidates -CandidatePaths @(
        "$env:ProgramFiles(x86)\Inno Setup 6\ISCC.exe",
        "$env:ProgramFiles\Inno Setup 6\ISCC.exe"
      )
    )
    if ($candidates.Count -gt 0) { $iscc = $candidates[0] }
  }
  if (-not $iscc) { throw 'No se encontró Inno Setup 6 (ISCC.exe). Instálelo en Windows para generar el Setup.' }
  & $iscc "/DMyAppVersion=$version" (Join-Path $PSScriptRoot 'PintaPrintAgent.iss')
  if ($LASTEXITCODE -ne 0) { throw 'Inno Setup no pudo compilar el instalador.' }
  Copy-Item -LiteralPath (Join-Path $sourceRoot "release\PintaPrintAgent-Setup-$version.exe") -Destination (Join-Path $sourceRoot 'release\PintaPrintAgent-Setup.exe') -Force
  Write-Host "Setup generado: $(Join-Path $sourceRoot 'release\PintaPrintAgent-Setup.exe')"
} finally { Pop-Location }
