[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$script:TaskName = 'Pinta Print Agent'
$script:InstallRoot = Join-Path $env:LOCALAPPDATA 'PintaPrintAgent'
$script:AppRoot = Join-Path $script:InstallRoot 'app'
$script:ConfigPath = Join-Path $script:InstallRoot 'config.json'
$script:LogRoot = Join-Path $script:InstallRoot 'logs'

function Assert-Windows {
  if ($env:OS -ne 'Windows_NT') { throw 'Pinta Print Agent installation scripts only support Windows.' }
}

function Get-NodeCommand {
  $node = Get-Command node.exe -ErrorAction SilentlyContinue
  if (-not $node) { throw 'Node.js >= 24 is required. Install it and ensure node.exe is on PATH.' }
  $versionText = (& $node.Source --version).Trim()
  if ($versionText -notmatch '^v?(\d+)\.') { throw "Could not determine Node.js version: $versionText" }
  if ([int]$Matches[1] -lt 24) { throw "Node.js >= 24 is required; found $versionText." }
  return $node.Source
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
