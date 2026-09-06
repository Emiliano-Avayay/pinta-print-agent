[CmdletBinding()]
param()
. (Join-Path $PSScriptRoot 'common.ps1')
Assert-Windows
$state = Get-TaskState
if (-not $state) { Write-Host "Task '$script:TaskName': not installed"; exit 1 }
Write-Host "Task: $script:TaskName"
Write-Host "State: $($state.Task.State)"
Write-Host "Last run: $($state.Info.LastRunTime)"
Write-Host "Last result: $($state.Info.LastTaskResult)"
Write-Host "Next run: $($state.Info.NextRunTime)"
