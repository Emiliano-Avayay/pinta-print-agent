[CmdletBinding()]
param()
. (Join-Path $PSScriptRoot 'common.ps1')
Assert-Windows
Assert-OriginalUserContext
if (-not (Get-ScheduledTask -TaskName $script:TaskName -ErrorAction SilentlyContinue)) { throw "Task '$script:TaskName' does not exist. Run install.ps1 first." }
Start-ScheduledTask -TaskName $script:TaskName
Write-Host "Started '$script:TaskName'."
