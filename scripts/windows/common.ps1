[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$script:TaskName = 'Pinta Print Agent'
$script:InstallRoot = Join-Path $env:LOCALAPPDATA 'PintaPrintAgent'
$script:AppRoot = Join-Path $script:InstallRoot 'app'
$script:RuntimeRoot = Join-Path $script:AppRoot 'runtime'
$script:RuntimeNodePath = Join-Path $script:RuntimeRoot 'node.exe'
$script:ConfigPath = Join-Path $script:InstallRoot 'config.json'
$script:LogRoot = Join-Path $script:InstallRoot 'logs'

function Assert-Windows {
  if ($env:OS -ne 'Windows_NT') { throw 'Pinta Print Agent installation scripts only support Windows.' }
}

function Get-NodeCommand {
  if (-not (Test-Path -LiteralPath $script:RuntimeNodePath)) { throw "Private Node runtime was not found: $script:RuntimeNodePath. Reinstall Pinta Print Agent." }
  $versionText = (& $script:RuntimeNodePath --version).Trim()
  if ($versionText -notmatch '^v?(\d+)\.') { throw "Could not determine Node.js version: $versionText" }
  if ([int]$Matches[1] -lt 24) { throw "Private Node runtime must be >= 24; found $versionText." }
  return $script:RuntimeNodePath
}

function Get-SourceRoot { return (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path }

function Get-TaskState {
  $task = Get-ScheduledTask -TaskName $script:TaskName -ErrorAction SilentlyContinue
  if (-not $task) { return $null }
  $info = Get-ScheduledTaskInfo -TaskName $script:TaskName
  return [pscustomobject]@{ Task = $task; Info = $info }
}

function Register-AgentTask {
  param([string]$NodePath, [switch]$DryRun)
  $entryPoint = Join-Path $script:AppRoot 'dist\main.js'
  if ($DryRun) { Write-Host "DRY RUN: register task '$script:TaskName' at logon using $NodePath $entryPoint"; return }
  $action = New-ScheduledTaskAction -Execute $NodePath -Argument ('"{0}"' -f $entryPoint) -WorkingDirectory $script:AppRoot
  $trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
  $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -Hidden -MultipleInstances IgnoreNew -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit (New-TimeSpan -Seconds 0)
  Register-ScheduledTask -TaskName $script:TaskName -Action $action -Trigger $trigger -Settings $settings -Description 'Starts Pinta Print Agent at Windows logon.' -Force | Out-Null
}

function Protect-PintaConfig {
  if (-not (Test-Path -LiteralPath $script:ConfigPath)) { return }
  # Restrict the token file to the current Windows account, SYSTEM and Administrators.
  & icacls.exe $script:ConfigPath /inheritance:r /grant:r "${env:USERNAME}:(R,W)" 'SYSTEM:(F)' 'Administrators:(F)' | Out-Null
  if ($LASTEXITCODE -ne 0) { Write-Warning "Could not restrict permissions on $script:ConfigPath" }
}
