[CmdletBinding()]
param([switch]$PurgeData, [switch]$DryRun)

. (Join-Path $PSScriptRoot 'common.ps1')
Assert-Windows
if ($DryRun) { Write-Host "DRY RUN: would unregister '$script:TaskName' and remove $script:AppRoot"; if ($PurgeData) { Write-Host "DRY RUN: would also permanently remove $script:InstallRoot" }; exit 0 }
if (Get-ScheduledTask -TaskName $script:TaskName -ErrorAction SilentlyContinue) {
  Stop-ScheduledTask -TaskName $script:TaskName -ErrorAction SilentlyContinue
  $deadline = (Get-Date).AddSeconds(30)
  while ((Get-ScheduledTask -TaskName $script:TaskName).State -eq 'Running' -and (Get-Date) -lt $deadline) { Start-Sleep -Milliseconds 500 }
  Unregister-ScheduledTask -TaskName $script:TaskName -Confirm:$false
}
if (Test-Path -LiteralPath $script:AppRoot) { Remove-Item -LiteralPath $script:AppRoot -Recurse -Force }
if ($PurgeData) {
  if (Test-Path -LiteralPath $script:InstallRoot) { Remove-Item -LiteralPath $script:InstallRoot -Recurse -Force }
  Write-Warning 'Removed application and all persistent Pinta Print Agent data.'
} else { Write-Host "Removed task and application. Configuration, database, and logs remain in $script:InstallRoot" }
