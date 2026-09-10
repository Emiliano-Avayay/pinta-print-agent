Set-StrictMode -Version Latest

function Get-ExistingInnoSetupCandidates {
  [CmdletBinding()]
  param([string[]]$CandidatePaths)

  return @(
    @($CandidatePaths) | Where-Object {
      $_ -and (Test-Path -LiteralPath $_)
    }
  )
}

function Get-InnoSetupIscc {
  [CmdletBinding()]
  param(
    [string]$ProgramFilesX86 = ${env:ProgramFiles(x86)},
    [string]$ProgramFiles = $env:ProgramFiles,
    [string]$LocalAppData = $env:LOCALAPPDATA,
    [switch]$SkipPathLookup
  )

  if (-not $SkipPathLookup) {
    $command = Get-Command ISCC.exe -ErrorAction SilentlyContinue
    if ($command) { return $command.Source }
  }

  $candidatePaths = @()
  if ($ProgramFilesX86) { $candidatePaths += Join-Path $ProgramFilesX86 'Inno Setup 6\ISCC.exe' }
  if ($ProgramFiles) { $candidatePaths += Join-Path $ProgramFiles 'Inno Setup 6\ISCC.exe' }
  if ($LocalAppData) { $candidatePaths += Join-Path $LocalAppData 'Programs\Inno Setup 6\ISCC.exe' }

  $candidates = @(Get-ExistingInnoSetupCandidates -CandidatePaths $candidatePaths)
  if ($candidates.Count -gt 0) { return $candidates[0] }

  throw 'No se encontró Inno Setup 6 (ISCC.exe). Instálelo en Windows para generar el Setup.'
}
