[CmdletBinding()]
param()
. (Join-Path $PSScriptRoot 'common.ps1')
Assert-Windows
Assert-OriginalUserContext
& (Join-Path $PSScriptRoot 'stop.ps1')
Start-Sleep -Seconds 1
& (Join-Path $PSScriptRoot 'start.ps1')
