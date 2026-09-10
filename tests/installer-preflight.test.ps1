$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

. (Join-Path $PSScriptRoot '..\installer\inno-setup.ps1')

function Assert-Equal([object]$Actual, [object]$Expected, [string]$Message) {
  if ($Actual -ne $Expected) { throw "$Message. Expected: $Expected. Actual: $Actual." }
}

function Assert-Throws([scriptblock]$Action, [string]$ExpectedMessage) {
  try {
    & $Action
  } catch {
    Assert-Equal $_.Exception.Message $ExpectedMessage 'Unexpected error message'
    return
  }
  throw 'Expected the action to throw.'
}

$temporaryDirectory = Join-Path ([System.IO.Path]::GetTempPath()) ("pinta-iscc-test-" + [guid]::NewGuid())
New-Item -ItemType Directory -Path $temporaryDirectory | Out-Null
try {
  $programFilesX86 = Join-Path $temporaryDirectory 'Program Files (x86)'
  $programFiles = Join-Path $temporaryDirectory 'Program Files'
  $localAppData = Join-Path $temporaryDirectory 'AppData\Local'
  $machineX86 = Join-Path $programFilesX86 'Inno Setup 6\ISCC.exe'
  $machineX64 = Join-Path $programFiles 'Inno Setup 6\ISCC.exe'
  $perUser = Join-Path $localAppData 'Programs\Inno Setup 6\ISCC.exe'
  $pathDirectory = Join-Path $temporaryDirectory 'path'
  $pathIscc = Join-Path $pathDirectory 'ISCC.exe'
  New-Item -ItemType Directory -Path (Split-Path $machineX86), (Split-Path $machineX64), (Split-Path $perUser), $pathDirectory -Force | Out-Null

  New-Item -ItemType File -Path $machineX86 | Out-Null
  Assert-Equal (Get-InnoSetupIscc -ProgramFilesX86 $programFilesX86 -ProgramFiles $programFiles -LocalAppData $localAppData -SkipPathLookup) $machineX86 'Machine x86 installation must be detected first'
  Remove-Item -LiteralPath $machineX86 -Force

  New-Item -ItemType File -Path $machineX64 | Out-Null
  Assert-Equal (Get-InnoSetupIscc -ProgramFilesX86 $programFilesX86 -ProgramFiles $programFiles -LocalAppData $localAppData -SkipPathLookup) $machineX64 'Machine x64 installation must be detected'
  Remove-Item -LiteralPath $machineX64 -Force

  New-Item -ItemType File -Path $perUser | Out-Null
  Assert-Equal (Get-InnoSetupIscc -ProgramFilesX86 $programFilesX86 -ProgramFiles $programFiles -LocalAppData $localAppData -SkipPathLookup) $perUser 'Per-user installation must be detected'
  Remove-Item -LiteralPath $perUser -Force

  New-Item -ItemType File -Path $pathIscc | Out-Null
  $previousPath = $env:PATH
  try {
    $env:PATH = "$pathDirectory;$previousPath"
    Assert-Equal (Get-InnoSetupIscc -ProgramFilesX86 $programFilesX86 -ProgramFiles $programFiles -LocalAppData $localAppData) $pathIscc 'PATH installation must be detected first'
  } finally {
    $env:PATH = $previousPath
  }

  Assert-Throws { Get-InnoSetupIscc -ProgramFilesX86 $programFilesX86 -ProgramFiles $programFiles -LocalAppData $localAppData -SkipPathLookup } ('No se encontr{0} Inno Setup 6 (ISCC.exe). Inst{1}lelo en Windows para generar el Setup.' -f [char]0x00F3, [char]0x00E1)
} finally {
  Remove-Item -LiteralPath $temporaryDirectory -Recurse -Force
}
