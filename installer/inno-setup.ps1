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
