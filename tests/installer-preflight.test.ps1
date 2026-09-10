$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

. (Join-Path $PSScriptRoot '..\installer\inno-setup.ps1')

function Assert-Equal([object]$Actual, [object]$Expected, [string]$Message) {
  if ($Actual -ne $Expected) { throw "$Message. Expected: $Expected. Actual: $Actual." }
}

$temporaryDirectory = Join-Path ([System.IO.Path]::GetTempPath()) ("pinta-iscc-test-" + [guid]::NewGuid())
New-Item -ItemType Directory -Path $temporaryDirectory | Out-Null
try {
  $missing = Join-Path $temporaryDirectory 'missing.exe'
  $first = Join-Path $temporaryDirectory 'first.exe'
  $second = Join-Path $temporaryDirectory 'second.exe'
  New-Item -ItemType File -Path $first, $second | Out-Null

  $zeroCandidates = @(Get-ExistingInnoSetupCandidates -CandidatePaths @($missing))
  Assert-Equal $zeroCandidates.Count 0 'Zero matching candidates must remain an array'

  $oneCandidate = @(Get-ExistingInnoSetupCandidates -CandidatePaths @($missing, $first))
  Assert-Equal $oneCandidate.Count 1 'One matching candidate must remain an array'
  Assert-Equal $oneCandidate[0] $first 'The matching candidate must be retained'

  $manyCandidates = @(Get-ExistingInnoSetupCandidates -CandidatePaths @($first, $second))
  Assert-Equal $manyCandidates.Count 2 'Multiple matching candidates must remain an array'
} finally {
  Remove-Item -LiteralPath $temporaryDirectory -Recurse -Force
}
